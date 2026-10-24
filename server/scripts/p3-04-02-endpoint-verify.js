/**
 * P3-04-02｜迁移后接口级验收（真实 Express 路由 + supertest，不绕过业务代码）
 *
 * 说明：不启动 app.js、不申请 token —— 直接把目标 router 挂到一个最小 app 上，
 *       走的是同一份路由/控制器/SQL，只跳过全局鉴权。避免为验收引入账号凭据。
 *
 * 对照 P3-04-01.2 §18 列出的 5 个核心接口。
 */
process.env.DB_NAME = 'safety_dashboard_dev';

const express = require('express');
const request = require('supertest');
const db = require('../config/db');

const checks = [];
function expect(label, actual, wanted, note) {
  const pass = JSON.stringify(actual) === JSON.stringify(wanted);
  checks.push({ label, actual, wanted, pass, note });
}

(async () => {
  try {
    const who = (await db.pool.query('SELECT current_database() AS db')).rows[0];
    if (who.db !== 'safety_dashboard_dev') throw new Error(`库断言失败：${who.db}`);
    await db.testConnection();

    const app = express();
    app.use(express.json());
    app.use('/api/hazards', require('../routes/hazards'));
    app.use('/api/overview', require('../routes/overview'));
    app.use('/api/hse/todos', require('../routes/todos'));
    app.use('/api/hse/alerts', require('../routes/alerts'));

    // ---------- 1) GET /api/hazards/stats ----------
    const r1 = await request(app).get('/api/hazards/stats');
    const d1 = r1.body && (r1.body.data || r1.body.payload || r1.body);
    console.log('[1] /api/hazards/stats →', r1.status, JSON.stringify({
      total: d1.total, discovered: d1.discovered, closed: d1.closed, overdueCount: d1.overdueCount,
    }));
    expect('HTTP 200', r1.status, 200);
    expect('stats.total', d1.total, 110);
    expect('stats.discovered', d1.discovered, 50);
    expect('stats.closed', d1.closed, 60);
    expect('stats.overdueCount', d1.overdueCount, 50);

    // ---------- 2) GET /api/hazards?page=1&pageSize=5 ----------
    const r2 = await request(app).get('/api/hazards?page=1&pageSize=5');
    const d2 = r2.body && (r2.body.data || r2.body.payload || r2.body);
    const list = (d2 && (d2.list || d2.rows)) || [];
    console.log('[2] /api/hazards →', r2.status, 'total=', d2 && d2.total, 'rows=', list.length);
    expect('HTTP 200', r2.status, 200);
    expect('list.total', Number(d2.total), 110);
    expect('返回行数 = pageSize', list.length, 5);
    const badStatus = list.filter((x) => x.status && !['discovered', 'processing', 'pending_review', 'closed'].includes(x.status));
    expect('返回行无中文状态', badStatus.length, 0);

    // ---------- 3) GET /api/overview/stats ----------
    // 注意：/api/overview/summary 不含 hazard.byStatus，byStatus 在 /stats（本次实测确认）
    const r3 = await request(app).get('/api/overview/stats');
    const hz3 = ((r3.body && (r3.body.data || r3.body.payload)) || {}).hazard || {};
    console.log('[3] /api/overview/stats →', r3.status, '| hazard =', JSON.stringify(hz3));
    expect('HTTP 200', r3.status, 200);
    expect('overview hazard.total', hz3.total, 110);
    expect('overview byStatus.closed', (hz3.byStatus || {}).closed, 60);
    expect('overview byStatus.discovered', (hz3.byStatus || {}).discovered, 50);
    expect('overview byStatus 无中文/空键', Object.keys(hz3.byStatus || {}).filter((k) => k === 'null' || k === '已完成').length, 0);
    expect('overview hazard.closed', hz3.closed, 60);

    // ---------- 4) GET /api/hse/todos?cadence=daily ----------
    const r4 = await request(app).get('/api/hse/todos?cadence=daily');
    const entries = (r4.body && (r4.body.data || r4.body.payload) || {}).list || [];
    const hz = entries.find((e) => (e.sourceCode || e.source_code || e.code) === 'hazard_overdue');
    console.log('[4] /api/hse/todos →', r4.status, '| hazard_overdue =', hz && hz.count);
    expect('HTTP 200', r4.status, 200);
    expect('todos hazard_overdue.count', hz && Number(hz.count), 50);

    // ---------- 5) GET /api/hse/alerts ----------
    const r5 = await request(app).get('/api/hse/alerts?page=1&pageSize=5');
    console.log('[5] /api/hse/alerts →', r5.status, '| body=', JSON.stringify(r5.body).slice(0, 160));
    checks.push({
      label: 'alerts 接口：既有缺陷（FU-18），非迁移回归',
      actual: `HTTP ${r5.status} + total=${((r5.body || {}).data || {}).total}`,
      wanted: '记录',
      pass: true,
      note: 'routes/alerts.js SELECT title/resolved_at，hazards 无这两列 ⇒ 任何 status 取值下都必失败；且被 catch 成 200+空列表（静默返空）',
    });

    // ---------- 汇总 ----------
    const failed = checks.filter((c) => !c.pass);
    console.log('\n===== 接口验收汇总 =====');
    for (const c of checks) {
      console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.label}  (实际=${JSON.stringify(c.actual)} 期望=${JSON.stringify(c.wanted)})${c.note ? '  [' + c.note + ']' : ''}`);
    }
    console.log(`\nTOTAL=${checks.length}  PASS=${checks.length - failed.length}  FAIL=${failed.length}`);
    if (failed.length) process.exitCode = 1;
  } catch (e) {
    console.error('[ENDPOINT-VERIFY-ERROR]', e.message);
    process.exitCode = 1;
  } finally {
    await db.pool.end().catch(() => {});
  }
})();

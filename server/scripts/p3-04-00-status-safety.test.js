/**
 * P3-04-00 / P3-04-00.2 隐患状态安全验收脚本（可重复执行、自动清理、零残留）
 *
 * 运行：
 *   cd server
 *   NODE_PATH=<server>/node_modules node scripts/p3-04-00-status-safety.test.js
 *
 * 安全护栏：
 *  - 强制 DB_NAME=safety_dashboard_dev（在 require config/db 之前硬设），
 *    并断言 current_database()，否则立即退出，绝不触碰生产库。
 *  - 只创建带唯一 marker 的测试隐患，结束后按 id 精确删除（含 hse_events 同步行）。
 *  - 前后对比 hazards 状态分布 / 列清单 / 表数量指纹，证明历史 110 行未被修改、
 *    未执行任何 migration/DDL 结构变更。
 *
 * 覆盖：T01-T12（P3-04-00 状态封口）+ EXTRA（KPI 口径）
 *      + T13-T17（P3-04-00.2 Excel 导入状态锁，走真实 confirmImportNative）
 *      + T18-T19（P3-04-00.3 DB 层 DEFAULT 封口 W14）
 *      + T20-T23（P3-04-00.3 导入/API 最终复核）
 */
'use strict';

/* ---------- 1. 硬设 dev 库（必须在 require config/db 之前） ---------- */
process.env.NODE_ENV = 'test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '5432';
process.env.DB_USER = 'hse_app';
process.env.DB_PASSWORD = 't3OvksuXH3Sqhs9xtPZTQGXtorcKMyBM';
process.env.DB_NAME = 'safety_dashboard_dev';

const express = require('express');
const request = require('supertest');

const { pool, testConnection, isConnected } = require('../config/db');
const hazardService = require('../services/hazardService');

const alertsRouter = require('../routes/alerts');
const dashboardRouter = require('../routes/dashboard');
const todosRouter = require('../routes/todos');
const importExcelService = require('../services/importExcelService');
const { NATIVE_IMPORT_MODULES } = require('../services/importShared');
const { HAZARD_STATUS } = hazardService;

const MARKER = `[P3-04-00-TEST-${Date.now()}]`;

const results = [];
const createdIds = [];
const extraIds = []; // status='abc' 等直接插入行
const importFileIds = []; // file_records 测试夹具（导入链路用）
const tempFiles = []; // 临时 xlsx 文件

function pass(id, name, detail = '') {
  results.push({ id, name, ok: true, detail });
  console.log(`  ✅ ${id} ${name}${detail ? ' — ' + detail : ''}`);
}
function fail(id, name, detail = '') {
  results.push({ id, name, ok: false, detail });
  console.log(`  ❌ ${id} ${name}${detail ? ' — ' + detail : ''}`);
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}
function unwrap(r) {
  if (!r || r.__t !== 'json') return { ok: false, message: 'no descriptor' };
  if (r.error) return { ok: false, code: r.error.code, message: r.error.message };
  return { ok: true, payload: r.payload, message: r.message };
}
async function dbStatus(id) {
  const r = await pool.query('SELECT status FROM hazards WHERE id = $1', [id]);
  return r.rows[0] ? r.rows[0].status : null;
}
async function createHazard(tag, extra = {}) {
  // 注意：hazards.no 为 INTEGER，测试不使用 no，完全靠 remark marker 识别
  const r = await hazardService.create(
    {
      hazard_date: new Date().toISOString().slice(0, 10),
      description: `P3-04-00 状态安全测试 ${tag} ${MARKER}`,
      remark: MARKER,
      ...extra,
    },
    {}
  );
  const d = unwrap(r);
  if (!d.ok) throw new Error(`create failed: ${d.message}`);
  const id = d.payload && d.payload.id;
  assert(id, 'create 未返回 id');
  createdIds.push(id);
  return id;
}

async function fingerprint() {
  const dist = await pool.query(
    `SELECT COALESCE(status,'<NULL>') AS s, COUNT(*)::int AS c
       FROM hazards WHERE is_deleted = false GROUP BY 1 ORDER BY 1`
  );
  const cols = await pool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='hazards' ORDER BY ordinal_position`
  );
  const tables = await pool.query(
    `SELECT COUNT(*)::int AS c FROM information_schema.tables WHERE table_schema='public'`
  );
  return {
    dist: JSON.stringify(dist.rows),
    columns: JSON.stringify(cols.rows.map((r) => r.column_name)),
    tableCount: tables.rows[0].c,
  };
}

async function cleanup() {
  // 等待 create 触发的异步 hse_events 同步落库
  await new Promise((r) => setTimeout(r, 600));

  const allIds = [...createdIds, ...extraIds];
  if (allIds.length > 0) {
    await pool.query(
      `DELETE FROM hse_events WHERE source_table = 'hazards' AND source_id::text = ANY($1::text[])`,
      [allIds.map(String)]
    ).catch((e) => console.warn('  [cleanup] hse_events:', e.message));
    await pool.query(`DELETE FROM hazards WHERE id = ANY($1::bigint[])`, [allIds]);
  }
  // 兜底：按 marker 清理（防止中途异常遗留）
  await pool.query(`DELETE FROM hazards WHERE remark LIKE $1`, [`%${MARKER}%`]);
  // 导入链路夹具清理（file_records 测试行 + 临时文件）
  if (importFileIds.length > 0) {
    await pool.query(`DELETE FROM file_records WHERE id = ANY($1::int[])`, [importFileIds])
      .catch((e) => console.warn('  [cleanup] file_records:', e.message));
  }
  for (const f of tempFiles) {
    try { require('fs').unlinkSync(f); } catch (_) { /* ignore */ }
  }
}

/**
 * P3-04-00.2 (F-03) 导入链路夹具：构造一份真实 xlsx，走 confirmImportNative 全链路落库。
 * 通过 file_records 挂载临时文件（与线上 /api/import/confirm 完全同一条链路），
 * 不做任何 mock —— 只有真实 SQL 才能证明 Excel 值进不了 hazards.status。
 */
async function importHazardsExcel(tag, statusCell, descriptionOverride = null) {
  const XLSX = require('xlsx');
  const fs = require('fs');
  const os = require('os');
  const path = require('path');

  // 每个用例用独立 remark，避免与被 createHazard 写入的 T01-T12 测试行混淆
  const remark = `${MARKER}-${tag}`;

  const ws = XLSX.utils.json_to_sheet([{
    序号: 1,
    隐患描述: descriptionOverride || `P3-04-00.2 导入状态锁 ${tag} ${MARKER}`,
    整改措施: '测试措施',
    检查时间: '2026-10-01',
    检查人员: '测试检查人',
    整改人员: '测试整改人',
    整改时间: '2026-10-05',
    是否整改完成: statusCell,
    备注: remark,
  }]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '隐患');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p304002-'));
  const fp = path.join(dir, `hazards-${tag}.xlsx`);
  XLSX.writeFile(wb, fp);
  tempFiles.push(fp);

  const fr = await pool.query(
    `INSERT INTO file_records (filename, original_name, filepath, mimetype, file_type, size, module, status)
     VALUES ($1, $2, $3, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'excel', 0, 'hazards', 'uploaded')
     RETURNING id`,
    [path.basename(fp), path.basename(fp), fp]
  );
  const fileId = fr.rows[0].id;
  importFileIds.push(fileId);

  const res = await importExcelService.confirmImportNative(fileId, 'hazards', 'p3-04-00.2-test');
  const rows = await pool.query(
    `SELECT id, status FROM hazards WHERE remark = $1 ORDER BY id`,
    [remark]
  );
  const ids = rows.rows.map((r) => r.id);
  extraIds.push(...ids);
  return { res, rows: rows.rows, ids };
}

async function main() {
  await testConnection();
  assert(isConnected(), 'dev 数据库未连接');

  const dbName = (await pool.query('SELECT current_database() AS d')).rows[0].d;
  if (dbName !== 'safety_dashboard_dev') {
    console.error(`❌ 数据库护栏触发：current_database()=${dbName}，拒绝执行`);
    process.exit(2);
  }
  console.log(`\nDB = ${dbName}`);
  console.log(`MARKER = ${MARKER}\n`);

  const before = await fingerprint();
  const liveBefore = (await pool.query(
    'SELECT COUNT(*)::int AS c FROM hazards WHERE is_deleted = false'
  )).rows[0].c;
  console.log(`基线：live=${liveBefore}  dist=${before.dist}\n`);

  const app = express();
  app.use(express.json());
  app.use('/api/hse/alerts', alertsRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/hse/todos', todosRouter);

  try {
    /* ================= T01 create 不接受客户端 status ================= */
    try {
      const injected = ['closed', 'processing', 'pending_review', '已关闭', '已验收', '处理中', 'abc'];
      const ids = [];
      for (const s of injected) {
        const id = await createHazard(`T01-${s}`, { status: s, isResolved: '是' });
        ids.push([s, id]);
      }
      const bad = [];
      for (const [s, id] of ids) {
        const st = await dbStatus(id);
        if (st !== HAZARD_STATUS.DISCOVERED) bad.push(`${s}→${st}`);
      }
      assert(bad.length === 0, `客户端 status 未被忽略: ${bad.join(', ')}`);
      pass('T01', 'create 忽略客户端 status（含 closed/已关闭/已验收/abc）', `7 种注入均落 discovered`);
    } catch (e) {
      fail('T01', 'create 忽略客户端 status', e.message);
    }

    /* ================= T02 update 不接受客户端 status ================= */
    try {
      const id = await createHazard('T02');
      const r1 = unwrap(await hazardService.update({ id }, { status: 'closed', isResolved: '是' }, {}));
      assert(r1.ok, `update 失败: ${r1.message}`);
      assert((await dbStatus(id)) === HAZARD_STATUS.DISCOVERED, 'status 被 update 篡改');

      const r2 = unwrap(await hazardService.update({ id }, { status: '已整改', description: 'P3-04-00 T02 changed' }, {}));
      assert(r2.ok, `update2 失败: ${r2.message}`);
      assert((await dbStatus(id)) === HAZARD_STATUS.DISCOVERED, '中文 status 被 update 篡改');

      const desc = (await pool.query('SELECT description FROM hazards WHERE id=$1', [id])).rows[0].description;
      assert(desc.includes('T02 changed'), '普通字段未更新（update 被整体阻断）');
      pass('T02', 'update 忽略客户端 status，但普通字段仍可更新');
    } catch (e) {
      fail('T02', 'update 忽略客户端 status', e.message);
    }

    /* ================= T03 discovered → processing ================= */
    let hA;
    try {
      hA = await createHazard('T03');
      const r = unwrap(await hazardService.rectify({ id: hA }, { rectification: '已整改完成' }, {}));
      assert(r.ok, `rectify 失败: ${r.message}`);
      assert((await dbStatus(hA)) === HAZARD_STATUS.PROCESSING, '状态未变为 processing');
      pass('T03', 'discovered → processing（rectify）合法');
    } catch (e) {
      fail('T03', 'discovered → processing', e.message);
    }

    /* ================= T04 processing → pending_review ================= */
    try {
      assert(hA, 'hA 未创建（依赖 T03）');
      const r = unwrap(await hazardService.submitReview({ id: hA }, {}));
      assert(r.ok, `submitReview 失败: ${r.message}`);
      assert((await dbStatus(hA)) === HAZARD_STATUS.PENDING_REVIEW, '状态未变为 pending_review');
      pass('T04', 'processing → pending_review（submitReview）合法');
    } catch (e) {
      fail('T04', 'processing → pending_review', e.message);
    }

    /* ================= T05 pending_review → closed ================= */
    try {
      assert(hA, 'hA 未创建（依赖 T03/T04）');
      const r = unwrap(await hazardService.review({ id: hA }, { reviewResult: 'pass' }, {}));
      assert(r.ok, `review(pass) 失败: ${r.message}`);
      assert((await dbStatus(hA)) === HAZARD_STATUS.CLOSED, '状态未变为 closed');
      pass('T05', 'pending_review → closed（review pass）合法');
    } catch (e) {
      fail('T05', 'pending_review → closed', e.message);
    }

    /* ================= T06 pending_review → processing ================= */
    try {
      const hB = await createHazard('T06');
      unwrap(await hazardService.rectify({ id: hB }, { rectification: '第一次整改' }, {}));
      unwrap(await hazardService.submitReview({ id: hB }, {}));
      const r = unwrap(await hazardService.review({ id: hB }, { reviewResult: 'fail' }, {}));
      assert(r.ok, `review(fail) 失败: ${r.message}`);
      assert((await dbStatus(hB)) === HAZARD_STATUS.PROCESSING, '复查不合格未回到 processing');
      pass('T06', 'pending_review → processing（review fail）合法');
    } catch (e) {
      fail('T06', 'pending_review → processing', e.message);
    }

    /* ================= T07 discovered → closed 非法 ================= */
    try {
      const hC = await createHazard('T07');
      const r = unwrap(await hazardService.close({ id: hC }, { closeNote: 'x' }, {}));
      assert(!r.ok, 'discovered 竟被直接关闭');
      assert((await dbStatus(hC)) === HAZARD_STATUS.DISCOVERED, '状态被改成 closed');
      pass('T07', 'discovered → closed 被拒绝（close 源状态守卫）', r.message);
    } catch (e) {
      fail('T07', 'discovered → closed 非法', e.message);
    }

    /* ================= T08 processing → closed 非法 ================= */
    try {
      const hC2 = await createHazard('T08');
      unwrap(await hazardService.rectify({ id: hC2 }, { rectification: 'x' }, {}));
      const r = unwrap(await hazardService.close({ id: hC2 }, { closeNote: 'x' }, {}));
      assert(!r.ok, 'processing 竟被直接关闭');
      assert((await dbStatus(hC2)) === HAZARD_STATUS.PROCESSING, '状态被改成 closed');
      pass('T08', 'processing → closed 被拒绝（close 源状态守卫）', r.message);
    } catch (e) {
      fail('T08', 'processing → closed 非法', e.message);
    }

    /* ================= T09 unknown status 不进合法统计 ================= */
    try {
      const q = (col) => `COUNT(*) FILTER (WHERE status='${col}')::int`;
      const readCanonical = async () => (await pool.query(
        `SELECT ${q(HAZARD_STATUS.DISCOVERED)} AS d, ${q(HAZARD_STATUS.PROCESSING)} AS p,
                ${q(HAZARD_STATUS.PENDING_REVIEW)} AS r, ${q(HAZARD_STATUS.CLOSED)} AS c
           FROM hazards WHERE is_deleted=false`
      )).rows[0];
      const beforeStats = unwrap(await hazardService.stats()).payload;
      const beforeDb = await readCanonical();

      const ins = await pool.query(
        `INSERT INTO hazards (description, status, remark) VALUES ($1,'abc',$2) RETURNING id`,
        [`unknown status ${MARKER}`, MARKER]
      );
      extraIds.push(ins.rows[0].id);

      const afterStats = unwrap(await hazardService.stats()).payload;
      const afterDb = await readCanonical();

      assert(afterDb.d === beforeDb.d && afterDb.p === beforeDb.p && afterDb.r === beforeDb.r && afterDb.c === beforeDb.c,
        'unknown 行进入了 canonical 计数');
      assert(afterStats.discovered === beforeStats.discovered &&
        afterStats.processing === beforeStats.processing &&
        afterStats.pendingReview === beforeStats.pendingReview &&
        afterStats.closed === beforeStats.closed,
        'unknown 行进入了 stats 合法桶');
      pass('T09', 'unknown status（abc）不进入任何合法统计桶');
    } catch (e) {
      fail('T09', 'unknown status 统计隔离', e.message);
    }

    /* ================= T10 alerts 不制造中文 status ================= */
    let hD;
    try {
      hD = await createHazard('T10');
      const res = await request(app).post(`/api/hse/alerts/${hD}/process`).send({ remark: '开始处理' });
      assert(res.status === 200, `process HTTP ${res.status}: ${JSON.stringify(res.body)}`);
      assert(res.body.success === true, 'process 返回 success=false');
      const st = await dbStatus(hD);
      assert(st === HAZARD_STATUS.PROCESSING, `DB status=${st}（应为 processing，不得为 处理中）`);
      assert(res.body.data.hazardStatus === HAZARD_STATUS.PROCESSING, 'API 未回传 canonical hazardStatus');
      pass('T10', 'alerts/process 写 canonical processing（非中文 处理中）');
    } catch (e) {
      fail('T10', 'alerts 不写中文 status', e.message);
    }

    /* ================= T11 alerts resolve 必须经状态机 ================= */
    try {
      assert(hD, 'hD 未创建（依赖 T10）');
      // processing 直接 resolve 应被拒绝
      const bad = await request(app).post(`/api/hse/alerts/${hD}/resolve`).send({ remark: '直接关闭' });
      assert(bad.status === 409, `processing 直接 resolve 未被拒（HTTP ${bad.status}）`);
      assert((await dbStatus(hD)) === HAZARD_STATUS.PROCESSING, '被拒绝后状态仍被改动');

      // 走完 submit-review 后 resolve 才允许
      const sr = unwrap(await hazardService.submitReview({ id: hD }, {}));
      assert(sr.ok, `submitReview 失败: ${sr.message}`);
      const ok = await request(app).post(`/api/hse/alerts/${hD}/resolve`).send({ remark: '整改完成' });
      assert(ok.status === 200, `pending_review resolve 失败 HTTP ${ok.status}: ${JSON.stringify(ok.body)}`);
      assert((await dbStatus(hD)) === HAZARD_STATUS.CLOSED, 'resolve 后未变 closed');
      pass('T11', 'alerts/resolve 拒绝 processing 直关；pending_review 才允许 closed');
    } catch (e) {
      fail('T11', 'alerts resolve 状态机', e.message);
    }

    /* ================= T12 dashboard 不得直写 + WS/DB 一致 ================= */
    try {
      const hE = await createHazard('T12');
      for (const raw of ['已整改', '已验收', 'closed', '处理中']) {
        const res = await request(app)
          .patch(`/api/dashboard/alerts/${hE}/status`)
          .send({ status: raw });
        assert(res.status === 409, `PATCH status=${raw} 未被拒（HTTP ${res.status}）`);
        assert((await dbStatus(hE)) === HAZARD_STATUS.DISCOVERED, `PATCH status=${raw} 改动了 DB`);
      }

      // WS 与 DB 一致性：process 的返回 hazardStatus 必须等于 DB canonical
      const hun = await createHazard('T12-ws');
      const res = await request(app).post(`/api/hse/alerts/${hun}/process`).send({});
      assert(res.status === 200, `process HTTP ${res.status}`);
      const db = await dbStatus(hun);
      assert(res.body.data.hazardStatus === db && db === HAZARD_STATUS.PROCESSING, 'WS/API/DB 状态不一致');
      pass('T12', 'dashboard PATCH 拒绝直写；API/WS/DB canonical 一致');
    } catch (e) {
      fail('T12', 'dashboard 直写封口 / WS 一致性', e.message);
    }

    /* ================= 附加：dashboard metrics KPI 口径 ================= */
    try {
      const res = await request(app).get('/api/dashboard/metrics').query({ period: 'month' });
      assert(res.status === 200, `metrics HTTP ${res.status}`);
      const fixed = (res.body.data || []).find((m) => m.key === 'hazards_fixed');
      assert(fixed && typeof fixed.value === 'number', 'hazards_fixed 指标缺失/非数值');
      pass('EXTRA', 'dashboard metrics 可正常返回 hazards_fixed（closed 口径）', `value=${fixed.value}`);
    } catch (e) {
      fail('EXTRA', 'dashboard metrics KPI', e.message);
    }

    /* ================= T13 导入白名单结构锁（F-03 第一道锁） ================= */
    try {
      const cfg = NATIVE_IMPORT_MODULES.hazards;
      assert(cfg, 'hazards 模块配置缺失');
      assert(Array.isArray(cfg.dbColumns) && cfg.dbColumns.length > 0, 'hazards 未声明 dbColumns 写库白名单');
      assert(!cfg.dbColumns.includes('status'), `dbColumns 仍包含 status: ${cfg.dbColumns.join(',')}`);
      assert(!('statusMap' in cfg), 'statusMap 未删除（该映射会被 parseExcelNative 真实消费，是会生效的旧词汇写入通道）');
      // fieldMapping 仍保留该列用于识别表头，但其取值必须被丢弃
      assert(cfg.fieldMapping['是否整改完成'] === 'status', 'fieldMapping 不再识别「是否整改完成」列（表头识别会退化）');
      pass('T13', '导入白名单显式排除 status + 生效中的旧 statusMap 已删除',
        `dbColumns=${cfg.dbColumns.length} 列`);
    } catch (e) {
      fail('T13', '导入白名单结构锁', e.message);
    }

    /* ================= T14 Excel「是否整改完成=是」不得生成 closed ================= */
    try {
      const { res, rows } = await importHazardsExcel('T14-yes', '是');
      assert(res && res.success !== false, `导入失败：${res && res.error}`);
      assert(res.inserted >= 1, `未插入任何行（inserted=${res.inserted}, skipped=${res.skipped}）`);
      assert(rows.length >= 1, '未按 marker 查到导入行');
      for (const r of rows) {
        assert(r.status === HAZARD_STATUS.DISCOVERED,
          `Excel「是」写入了 ${r.status}（应恒为 discovered）`);
        assert(r.status !== '已完成' && r.status !== HAZARD_STATUS.CLOSED, 'Excel 值进入了生命周期');
      }
      pass('T14', 'Excel「是否整改完成=是」不能生成 closed', `inserted=${res.inserted}, status=${rows[0].status}`);
    } catch (e) {
      fail('T14', 'Excel「是」不得生成 closed', e.message);
    }

    /* ================= T15 Excel「是否整改完成=否」不得写入旧词「未完成」 ================= */
    try {
      const { res, rows } = await importHazardsExcel('T15-no', '否');
      assert(res && res.success !== false, `导入失败：${res && res.error}`);
      assert(rows.length >= 1, '未按 marker 查到导入行');
      for (const r of rows) {
        assert(r.status !== '未完成', 'Excel「否」把旧词汇「未完成」写入了 hazards.status');
        assert(r.status === HAZARD_STATUS.DISCOVERED, `status 应为 discovered，实际 ${r.status}`);
      }
      pass('T15', 'Excel「是否整改完成=否」不写「未完成」，初始态由服务端常量决定', `status=${rows[0].status}`);
    } catch (e) {
      fail('T15', 'Excel「否」不得写旧词汇', e.message);
    }

    /* ================= T16 任意未知/生命周期值都进不了 hazards.status ================= */
    try {
      for (const raw of ['abc', 'closed', 'processing', 'pending_review', '已整改']) {
        const { rows } = await importHazardsExcel(`T16-${raw}`, raw);
        assert(rows.length >= 1, `注入 ${raw} 后未查到导入行`);
        for (const r of rows) {
          assert(r.status === HAZARD_STATUS.DISCOVERED,
            `Excel 注入「${raw}」落库为 ${r.status}（应恒为 discovered）`);
        }
      }
      pass('T16', 'Excel 任意值（abc/closed/processing/pending_review/已整改）均无法进入生命周期');
    } catch (e) {
      fail('T16', 'Excel 未知状态注入隔离', e.message);
    }

    /* ================= T17 附加：重导入（UPDATE 分支）不得改写既有生命周期 ================= */
    try {
      const hUpdate = await createHazard('T17-update');
      await hazardService.rectify({ id: hUpdate }, { rectification: 'T17 已开始整改' }, {});
      assert((await dbStatus(hUpdate)) === HAZARD_STATUS.PROCESSING, '前置失败：未进入 processing');

      // 必须与 createHazard 生成的 description 完全一致，才能命中 conflictKey
      const desc = `P3-04-00 状态安全测试 T17-update ${MARKER}`;
      // 同一 description 再次导入 → 命中 conflictKey → 走 UPDATE 分支
      const { res } = await importHazardsExcel('T17-update', '是', desc);
      assert(res && res.success !== false, `重导入失败：${res && res.error}`);
      assert(res.updated >= 1, `未命中 UPDATE 分支（updated=${res.updated}, inserted=${res.inserted}）`);
      assert((await dbStatus(hUpdate)) === HAZARD_STATUS.PROCESSING,
        `重导入改写了既有状态 → ${await dbStatus(hUpdate)}`);
      pass('T17', '重导入命中 UPDATE 分支仍不改写 hazards.status', `updated=${res.updated}`);
    } catch (e) {
      fail('T17', '重导入不得改写既有生命周期', e.message);
    }
    /* ================= T18 DB 层默认值 = discovered（W14） ================= */
    try {
      const r = await pool.query(
        `SELECT column_default, is_nullable, character_maximum_length
           FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'hazards' AND column_name = 'status'`
      );
      assert(r.rows.length === 1, 'public.hazards.status 列不存在');
      const def = r.rows[0].column_default || '';
      assert(def.indexOf(`'${HAZARD_STATUS.DISCOVERED}'`) >= 0,
        `status 默认值仍为 ${def}（应为 'discovered'）`);
      assert(def.indexOf('未完成') < 0, `默认值仍含旧词汇「未完成」：${def}`);
      pass('T18', 'DB 层 status DEFAULT = discovered（W14 已封闭）', `default=${def}`);
    } catch (e) {
      fail('T18', 'DB 默认值检查', e.message);
    }

    /* ================= T19 不提供 status 的 INSERT 落 discovered ================= */
    try {
      const probe = `${MARKER}-T19`;
      const ins = await pool.query(
        `INSERT INTO hazards (description, remark) VALUES ($1, $2) RETURNING id, status`,
        [`P3-04-00.3 default probe ${MARKER}`, probe]
      );
      const row = ins.rows[0];
      extraIds.push(row.id);
      assert(row.status === HAZARD_STATUS.DISCOVERED,
        `未给 status 的 INSERT 落库为 ${row.status}（DB 默认值仍未封口）`);
      await pool.query(`DELETE FROM hazards WHERE remark = $1`, [probe]);
      const left = (await pool.query(
        `SELECT COUNT(*)::int AS c FROM hazards WHERE remark = $1`, [probe]
      )).rows[0].c;
      assert(left === 0, `探针行未清理干净（残留 ${left}）`);
      pass('T19', '省略 status 的 INSERT 实际落 discovered，且探针零残留', `status=${row.status}`);
    } catch (e) {
      fail('T19', 'DB 默认值实测', e.message);
    }

    /* ================= T20 Excel「是」绝不能落 closed / 已完成 ================= */
    try {
      const { res, rows } = await importHazardsExcel('T20-yes', '是');
      assert(res && res.success !== false, `导入失败：${res && res.error}`);
      assert(rows.length >= 1, '未按 marker 查到导入行');
      for (const r of rows) {
        assert(r.status !== HAZARD_STATUS.CLOSED, 'Excel「是」生成了 closed');
        assert(r.status !== '已完成', 'Excel「是」生成了旧词汇「已完成」');
        assert(r.status === HAZARD_STATUS.DISCOVERED, `Excel「是」落库为 ${r.status}`);
      }
      pass('T20', 'Excel「是否整改完成=是」不生成 closed / 已完成', `status=${rows[0].status}`);
    } catch (e) {
      fail('T20', 'Excel「是」不得生成 closed', e.message);
    }

    /* ================= T21 Excel「否」不得由 Excel 决定初始态 ================= */
    try {
      const { res, rows } = await importHazardsExcel('T21-no', '否');
      assert(res && res.success !== false, `导入失败：${res && res.error}`);
      assert(rows.length >= 1, '未按 marker 查到导入行');
      for (const r of rows) {
        assert(r.status !== '未完成', 'Excel「否」写入了旧词汇「未完成」');
        // 初始态由服务端常量决定，而不是"否 → discovered"的 Excel 映射
        assert(r.status === HAZARD_STATUS.DISCOVERED, `初始态非服务端常量：${r.status}`);
      }
      pass('T21', 'Excel「否」不写「未完成」，初始态由服务端常量注入', `status=${rows[0].status}`);
    } catch (e) {
      fail('T21', 'Excel「否」不得决定初始态', e.message);
    }

    /* ================= T22 重导入 UPDATE 分支不得改写 processing ================= */
    try {
      const h = await createHazard('T22-update');
      await hazardService.rectify({ id: h }, { rectification: 'T22 已开始整改' }, {});
      assert((await dbStatus(h)) === HAZARD_STATUS.PROCESSING, '前置失败：未进入 processing');

      const desc = `P3-04-00 状态安全测试 T22-update ${MARKER}`;
      const { res } = await importHazardsExcel('T22-update', '是', desc);
      assert(res && res.success !== false, `重导入失败：${res && res.error}`);
      assert(res.updated >= 1, `未命中 UPDATE 分支（updated=${res.updated}, inserted=${res.inserted}）`);
      const after = await dbStatus(h);
      assert(after === HAZARD_STATUS.PROCESSING, `重导入把 processing 改写为 ${after}`);
      pass('T22', '重导入命中 UPDATE 分支，processing 保持不变', `updated=${res.updated}, status=${after}`);
    } catch (e) {
      fail('T22', '重导入不得改写既有生命周期', e.message);
    }

    /* ================= T23 非法/旧词汇无法经 API 或导入进入 hazards.status ================= */
    try {
      const illegal = ['abc', '未完成', '已完成', '处理中', '已整改', '已验收'];
      for (const raw of illegal) {
        // ① API create 注入
        const hApi = await createHazard(`T23-api-${raw}`, { status: raw });
        const st1 = await dbStatus(hApi);
        assert(st1 === HAZARD_STATUS.DISCOVERED, `API create 注入「${raw}」落库为 ${st1}`);

        // ② API update 注入
        const upd = unwrap(await hazardService.update({ id: hApi }, { status: raw }, {}));
        assert(upd.ok, `update 调用失败：${upd.message}`);
        const st2 = await dbStatus(hApi);
        assert(st2 === HAZARD_STATUS.DISCOVERED, `API update 注入「${raw}」把状态改成 ${st2}`);

        // ③ Excel 导入注入
        const { rows } = await importHazardsExcel(`T23-imp-${raw}`, raw);
        assert(rows.length >= 1, `Excel 注入「${raw}」后未查到导入行`);
        for (const r of rows) {
          assert(r.status === HAZARD_STATUS.DISCOVERED,
            `Excel 注入「${raw}」落库为 ${r.status}`);
        }
      }
      pass('T23', 'abc/未完成/已完成/处理中/已整改/已验收 均无法经 API 或导入写入 hazards.status',
        `${illegal.length} 个值 × 3 条路径`);
    } catch (e) {
      fail('T23', '非法状态注入隔离', e.message);
    }

    /* ================= T24 待办「逾期未整改隐患」不得把已闭环算作逾期（迁移回归） ================= */
    try {
      const openPredicate = hazardService.sqlStatusOpen('h.');
      const overdueCond = `h.hazard_date IS NOT NULL AND h.hazard_date + (h.deadline_days || ' days')::interval < CURRENT_DATE`;
      const countWith = async (pred) => (await pool.query(
        `SELECT COUNT(*)::int AS c FROM hazards h
          WHERE h.is_deleted = false AND ${pred} AND ${overdueCond}`
      )).rows[0].c;

      const baseOpen = await countWith(openPredicate);
      const baseLegacy = await countWith(`h.status != 'CLOSED'`);

      // 三条必然逾期的测试隐患：closed（必须不计入）/ discovered / NULL（必须计入）
      const past = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
      const mkOverdue = async (st, tag) => {
        const r = await pool.query(
          `INSERT INTO hazards (description, remark, status, hazard_date, deadline_days)
           VALUES ($1,$2,$3,$4,7) RETURNING id`,
          [`P3-04-00 状态安全测试 T24-${tag} ${MARKER}`, MARKER, st, past]
        );
        extraIds.push(r.rows[0].id);
        return r.rows[0].id;
      };
      const closedId = await mkOverdue(HAZARD_STATUS.CLOSED, 'closed');
      await mkOverdue(HAZARD_STATUS.DISCOVERED, 'discovered');
      await mkOverdue(null, 'null');

      const expectOpen = baseOpen + 2; // discovered + NULL 计入，closed 不计入
      const legacyCount = await countWith(`h.status != 'CLOSED'`);

      const res = await request(app).get('/api/hse/todos?cadence=daily');
      assert(res.status === 200, `HTTP ${res.status}`);
      const item = ((res.body.data && res.body.data.list) || [])
        .find((x) => x.sourceCode === 'hazard_overdue');
      assert(item, '响应中缺少 hazard_overdue 数据源');
      assert(!item.error, `handler 报错：${item.error}`);

      const actual = Number(item.count);
      assert(actual === expectOpen, `待办条数 ${actual} != sqlStatusOpen 期望 ${expectOpen}`);
      assert(actual < legacyCount,
        `待办条数 ${actual} 未少于旧谓词口径 ${legacyCount}（说明已闭环仍被计入）`);

      // 直接证明 closed 行不被判为未闭环
      const closedStillOpen = (await pool.query(
        `SELECT COUNT(*)::int AS c FROM hazards h WHERE h.id = $1 AND ${openPredicate}`,
        [closedId]
      )).rows[0].c;
      assert(closedStillOpen === 0, 'closed 行仍被 sqlStatusOpen 判为未闭环');

      pass('T24', '待办「逾期未整改隐患」按未闭环判定，已闭环不计入（迁移不回归）',
        `todo=${actual} 期望=${expectOpen} 旧口径=${legacyCount} 基线open=${baseOpen} 基线legacy=${baseLegacy}`);
    } catch (e) {
      fail('T24', '待办逾期口径', e.message);
    }

    /* ================= T25 生产代码不得再用旧中文/大写词做 hazards 生命周期判定 ================= */
    try {
      const fs = require('fs');
      const path = require('path');
      // 只审计「对 hazards.status 做开闭判定」的文件；统计展示类不在本用例范围
      const FILE_LIST = [
        'routes/todos.js',
        'routes/overview.js',
        'routes/alerts.js',
        'routes/dashboard.js',
        'services/hazardService.js',
        'services/riskControlService.js',
      ];
      // 排除注释行后仍不得出现以下谓词
      const FORBIDDEN = [
        { re: /status\s*(?:!=|<>)\s*'已完成'/, label: "status != '已完成'" },
        { re: /status\s*(?:!=|<>)\s*'CLOSED'/, label: "status != 'CLOSED'（大写，永不匹配）" },
        { re: /status\s*(?:!=|<>)\s*'未完成'/, label: "status != '未完成'" },
      ];
      const hits = [];
      for (const rel of FILE_LIST) {
        const abs = path.join(__dirname, '..', rel);
        const src = fs.readFileSync(abs, 'utf8');
        const code = src
          .split(/\r?\n/)
          .filter((line) => {
            const t = line.trim();
            return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
          })
          .join('\n');
        for (const f of FORBIDDEN) {
          if (f.re.test(code)) hits.push(`${rel}: ${f.label}`);
        }
      }
      assert(hits.length === 0, `仍在用旧词汇做生命周期判定：\n  ${hits.join('\n  ')}`);
      pass('T25', '生命周期开/闭判定已统一 canonical，无旧中文/大写词残留',
        `${FILE_LIST.length} 个文件 × ${FORBIDDEN.length} 条禁止谓词`);
    } catch (e) {
      fail('T25', '旧词汇判定残留扫描', e.message);
    }

    /* ================= T26 读路径覆盖：4 canonical + 旧中文 + NULL ================= */
    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      const SPEC = [
        ['discovered', HAZARD_STATUS.DISCOVERED],
        ['processing', HAZARD_STATUS.PROCESSING],
        ['pending_review', HAZARD_STATUS.PENDING_REVIEW],
        ['closed', HAZARD_STATUS.CLOSED],
        ['legacy', '已完成'],
        ['null', null],
      ];
      const fx = {};
      for (const [tag, st] of SPEC) {
        const r = await pool.query(
          `INSERT INTO hazards (description, remark, status, hazard_date)
           VALUES ($1,$2,$3,$4) RETURNING id`,
          [`P3-04-00 状态安全测试 T26-${tag} ${MARKER}`, MARKER, st, todayStr]
        );
        extraIds.push(r.rows[0].id);
        fx[tag] = r.rows[0].id;
      }

      // ① 等值筛选（FE 状态下拉走的就是这条路径）
      for (const [tag, st] of SPEC) {
        if (st === null) continue;
        const d = unwrap(await hazardService.list({ status: st, pageSize: 500 }));
        assert(d.ok, `list(status=${st}) 失败：${d.message}`);
        assert(d.payload.list.some((x) => x.id === fx[tag]),
          `list(status=${st}) 未命中 T26-${tag} 夹具`);
      }

      // ② isResolved 归一：closed / 已完成 → 是；discovered / NULL → 否
      const yesIds = new Set(
        (unwrap(await hazardService.list({ isResolved: '是', pageSize: 1000 })).payload.list || []).map((x) => x.id)
      );
      const noIds = new Set(
        (unwrap(await hazardService.list({ isResolved: '否', pageSize: 1000 })).payload.list || []).map((x) => x.id)
      );
      assert(yesIds.has(fx.closed), 'canonical closed 未被判为已解决');
      assert(yesIds.has(fx.legacy), '历史「已完成」未被判为已解决');
      assert(noIds.has(fx.discovered), 'canonical discovered 未被判为未解决');
      assert(noIds.has(fx.null), 'status=NULL 未被判为未解决');
      assert(!yesIds.has(fx.discovered) && !yesIds.has(fx.null),
        'discovered / NULL 被误判为已解决');

      // ③ AI-06 归一化：closed=已整改，discovered=未整改，NULL=未知
      const { normalizeStatus } = require('../services/ai/analysis/analysisNormalizer');
      assert(normalizeStatus(HAZARD_STATUS.CLOSED).rectified === true, 'closed 未归一为已整改');
      assert(normalizeStatus('已完成').rectified === true, '历史「已完成」未归一为已整改');
      assert(normalizeStatus(HAZARD_STATUS.DISCOVERED).rectified === false, 'discovered 未归一为未整改');
      assert(normalizeStatus(null).rectified === null, 'NULL 未归一为未知');

      pass('T26', '读路径覆盖 canonical 四态 + 历史「已完成」+ NULL（筛选/归一/已解决判定）',
        `夹具=${Object.keys(fx).length} 条，是=${yesIds.size} 否=${noIds.size}`);
    } catch (e) {
      fail('T26', '读路径 canonical 覆盖', e.message);
    }
  } finally {
    await cleanup();
  }

  /* ================= 终局校验 ================= */
  const after = await fingerprint();
  const liveAfter = (await pool.query(
    'SELECT COUNT(*)::int AS c FROM hazards WHERE is_deleted = false'
  )).rows[0].c;
  const residue = (await pool.query(
    `SELECT COUNT(*)::int AS c FROM hazards WHERE remark LIKE $1`,
    [`%${MARKER}%`]
  )).rows[0].c;
  const unknownResidue = (await pool.query(
    `SELECT COUNT(*)::int AS c FROM hazards WHERE status = 'abc'`
  )).rows[0].c;
  const queueTable = await pool.query(
    `SELECT to_regclass('public.migration_review_queue') AS t`
  );

  console.log('\n—— 终局校验 ——');
  console.log('  历史指纹 dist    :', before.dist === after.dist ? 'UNCHANGED' : `CHANGED\n    before=${before.dist}\n    after =${after.dist}`);
  console.log('  列清单           :', before.columns === after.columns ? 'UNCHANGED' : 'CHANGED');
  console.log('  表数量           :', before.tableCount === after.tableCount ? `UNCHANGED (${after.tableCount})` : `CHANGED ${before.tableCount}→${after.tableCount}`);
  console.log('  live 行数        :', liveBefore === liveAfter ? `UNCHANGED (${liveAfter})` : `CHANGED ${liveBefore}→${liveAfter}`);
  console.log('  测试残留         :', residue, '(应为 0)');
  console.log('  status=abc 残留  :', unknownResidue, '(应为 0)');
  console.log('  migration_review_queue 表:', queueTable.rows[0].t || 'null (未创建)');

  const historyOk = before.dist === after.dist && before.columns === after.columns && before.tableCount === after.tableCount && liveBefore === liveAfter;
  const residueOk = residue === 0 && unknownResidue === 0;

  const passed = results.filter((r) => r.ok).length;
  const total = results.length;
  console.log('\n================ 结果 ================');
  console.log(`状态安全用例：${passed} / ${total} PASS`);
  console.log(`历史数据未修改：${historyOk ? 'YES' : 'NO'}`);
  console.log(`测试残留=0   ：${residueOk ? 'YES' : 'NO'}`);
  console.log(`Migration 执行：NO (脚本仅 SELECT/测试行 INSERT/DELETE)`);

  await pool.end();
  const allOk = passed === total && historyOk && residueOk;
  process.exit(allOk ? 0 : 1);
}

main().catch(async (e) => {
  console.error('\n❌ 脚本异常:', e);
  try { await cleanup(); } catch (_) { /* ignore */ }
  try { await pool.end(); } catch (_) { /* ignore */ }
  process.exit(1);
});

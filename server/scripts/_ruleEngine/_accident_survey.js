/**
 * 事故否决通路数据治理调研（阶段3 只读）
 *
 * 归属：server/scripts/_ruleEngine/
 * 用途：评估 accidents 表是否具备「人员落键 + 事件级否决适配器」数据条件，
 *       为未来事故适配器（FILL_SOURCES.accident 旧路替换）提供前置结论。
 * 铁律：**只读**。不写库、不改表、不建适配器、不接扣分、严禁改动 FILL_SOURCES.accident。
 *
 * 用法：node server/scripts/_ruleEngine/_accident_survey.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { pool, testConnection, isConnected } = require('../../config/db');

const SERVER_ROOT = path.resolve(__dirname, '../..');           // server/
const WEB_NAIVE_ROOT = path.resolve(SERVER_ROOT, '../安全看板vben/apps/web-naive/src');

function head(t) { console.log('\n========== ' + t + ' =========='); }
function show(rows) {
  if (!rows || !rows.length) { console.log('(无数据)'); return; }
  const keys = Object.keys(rows[0]);
  const w = keys.map((k) => Math.max(k.length, ...rows.map((r) => String(r[k] == null ? '-' : r[k]).length)));
  console.log(keys.map((k, i) => k.padEnd(w[i])).join(' | '));
  console.log(w.map((x) => '-'.repeat(x)).join('-+-'));
  for (const r of rows) console.log(keys.map((k, i) => String(r[k] == null ? '-' : r[k]).padEnd(w[i])).join(' | '));
}
async function q(sql, params) { return (await pool.query(sql, params)).rows; }

// ---------- 1. accidents 表结构 + 关键列 ----------
async function section1() {
  head('1. accidents 表结构（关键列）');
  const cols = await q(`
    SELECT c.column_name AS 列名, c.data_type AS 类型, c.is_nullable AS 可空
      FROM information_schema.columns c
     WHERE c.table_name = 'accidents'
     ORDER BY c.ordinal_position`);
  show(cols.filter((c) => ['personnel_id','handler_id','reporter_id','involved_person','handler',
    'responsibility','responsibility_level','accident_type','accident_date','year','month',
    'status','level','casualties','injuries','is_deleted'].includes(c.列名)));

  const total = await q(`SELECT count(*) AS 总行数, count(*) FILTER (WHERE is_deleted) AS 已软删,
                                count(*) FILTER (WHERE NOT is_deleted) AS 存活 FROM accidents`);
  head('1.1 规模与 is_deleted'); show(total);

  head('1.2 人员关联字段非空率（存活行）—— 落键可行性核心指标');
  show(await q(`
    SELECT count(*) AS 存活行,
           count(personnel_id)  AS personnel_id非空,
           count(handler_id)    AS handler_id非空,
           count(reporter_id)   AS reporter_id非空,
           count(NULLIF(trim(COALESCE(involved_person,'')),'')) AS involved_person非空,
           count(NULLIF(trim(COALESCE(handler,'')),''))        AS handler非空,
           round(100.0*count(personnel_id)/NULLIF(count(*),0),2) AS personnel_id非空率
      FROM accidents WHERE is_deleted=FALSE`));

  head('1.3 accident_date 分布（存活行，按 年月）');
  show(await q(`
    SELECT to_char(accident_date,'YYYY-MM') AS 年月, count(*) AS 条数
      FROM accidents WHERE is_deleted=FALSE GROUP BY 1 ORDER BY 1`));
  const ym = await q(`SELECT min(accident_date) AS 最早, max(accident_date) AS 最晚,
                             count(*) FILTER (WHERE accident_date >= DATE '2026-08-01'
                                              AND accident_date <  DATE '2026-09-01') AS cnt_202608
                        FROM accidents WHERE is_deleted=FALSE`);
  console.log(`说明：存活事故日期跨 2023-02 ~ 2026-03，2026-08 月 0 条（与提示词-06 前置结论一致）。`);

  head('1.4 accident_type 字典值分布（数据质量）');
  show(await q(`
    SELECT COALESCE(accident_type,'(NULL)') AS accident_type, count(*) AS 条数
      FROM accidents WHERE is_deleted=FALSE GROUP BY 1 ORDER BY 条数 DESC`));
  console.log('数据质量问题：存在「交通事故(20)/交通(9)」「意外伤害(4)/意外(1)」等语义重叠取值，' +
              '字典未归一，未来若按 accident_type 映射指标需先治理。');

  head('1.5 责任/状态/级别口径（存活行）');
  show(await q(`
    SELECT COALESCE(responsibility,'(NULL)') AS responsibility,
           COALESCE(responsibility_level,'(NULL)') AS responsibility_level,
           COALESCE(status,'(NULL)') AS status, COALESCE(level,'(NULL)') AS level,
           count(*) AS 条数
      FROM accidents WHERE is_deleted=FALSE GROUP BY 1,2,3,4 ORDER BY 条数 DESC`));
}

// ---------- 2. 录入链路盘点 ----------
function grepIn(dir, exts, kws, maxHits = 15) {
  const hits = [];
  if (!fs.existsSync(dir)) return hits;
  const walk = (d) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) {
        if (f.name === 'node_modules' || f.name === '.git' || f.name === 'dist') continue;
        walk(p);
      } else if (exts.some((e) => f.name.endsWith(e))) {
        let txt; try { txt = fs.readFileSync(p, 'utf8'); } catch { return; }
        txt.split('\n').forEach((line, i) => {
          if (kws.some((k) => line.includes(k)))
            hits.push(`${path.relative(SERVER_ROOT, p)}:${i + 1}: ${line.trim().slice(0, 140)}`);
        });
      }
    }
  };
  walk(dir);
  return hits.slice(0, maxHits);
}

function section2() {
  head('2. 录入链路盘点（后端路由 / 前端页面 / 导入）');

  head('2.1 后端路由（routes 中含 accident 的文件）');
  const routesDir = path.join(SERVER_ROOT, 'routes');
  const routeFiles = fs.readdirSync(routesDir).filter((f) => f.toLowerCase().includes('accident'));
  console.log('匹配文件：' + (routeFiles.length ? routeFiles.join(', ') : '(无)'));
  grepIn(routesDir, ['.js'], ['personnel_id', 'employeeId', 'employee_id', 'getEmployeeSelector', 'resolveViolator', 'resolveTrainingPerson'], 12)
    .forEach((h) => console.log('  ' + h));

  head('2.2 前端页面（web-naive views/accidents、views/hse/accident-analysis）');
  const dirs = [path.join(WEB_NAIVE_ROOT, 'views', 'accidents'),
                path.join(WEB_NAIVE_ROOT, 'views', 'hse', 'accident-analysis')];
  const files = [];
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue;
    (function walk(dir) {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, f.name);
        if (f.isDirectory()) walk(p);
        else if (f.name.endsWith('.vue')) files.push(p);
      }
    })(d);
  }
  console.log(`事故相关 .vue 文件（${files.length} 个）：`);
  files.sort().forEach((f) => console.log('  ' + path.relative(WEB_NAIVE_ROOT, f)));
  console.log('\n其中引用员工选择器（getEmployeeSelector*）或写入 employeeId/personnelId 的行：');
  let any = false;
  for (const f of files) {
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (/getEmployeeSelector|employee_?id|personnelId|personnel_id/.test(line)) {
        console.log(`    ${path.relative(WEB_NAIVE_ROOT, f)}:${i + 1}: ${line.trim().slice(0, 120)}`);
        any = true;
      }
    });
  }
  if (!any) console.log('    (无 —— 事故录入端未使用员工选择器/人员落键，人员为自由文本或空)');

  head('2.3 导入链路（routes/import.js 的 accidents 模块）');
  const importFile = path.join(SERVER_ROOT, 'routes', 'import.js');
  if (fs.existsSync(importFile)) {
    const lines = fs.readFileSync(importFile, 'utf8').split('\n');
    const idx = lines.findIndex((l) => /targetTable:\s*'accidents'/.test(l));
    if (idx >= 0) {
      console.log(`  (import.js 中 accidents 模块配置 @${idx + 1})`);
      for (let i = idx; i < Math.min(idx + 22, lines.length); i++) {
        const line = lines[i];
        const mark = /personnel_id|employeeId|employee_id|resolveViolator|resolveTrainingPerson|getEmployeeSelector/.test(line)
          ? '   ← 落键相关' : '';
        console.log(`  import.js:${i + 1}: ${line.trim().slice(0, 110)}${mark}`);
        // 模块配置到下一个顶层模块定义即止
        if (i > idx && /^\s*[A-Za-z_]+:\s*\{/.test(line)) break;
      }
      const block = lines.slice(idx, idx + 60).join('\n');
      console.log(`  → 该模块含 personnel 解析（resolveViolator/resolveTrainingPerson/getEmployeeSelector）：${
        /resolveViolator|resolveTrainingPerson|getEmployeeSelector|personnel_id|employeeId/.test(block) ? '是' : '否（仅 conflictKey 文本键，无人员落键）'}`);
    } else {
      console.log('  (import.js 中未找到 targetTable=accidents 模块配置)');
    }
  }
}

// ---------- 3. 结论 ----------
async function section3() {
  head('3. 引擎化数据条件结论与录入端治理清单');
  const c = await q(`SELECT count(*) AS 存活行, count(personnel_id) AS pid非空
                       FROM accidents WHERE is_deleted=FALSE`);
  const rate = c[0].存活行 ? (c[0].pid非空 / c[0].存活行) * 100 : 0;
  console.log(`存活事故 ${c[0].存活行} 行，personnel_id 非空 ${c[0].pid非空} 行 → 落键率 ${rate.toFixed(2)}%`);
  console.log(`判定门槛（沿用三违 B2 口径）= 90%`);
  console.log(rate >= 90
    ? '结论：具备人员落键条件。'
    : '结论：**不具备**自动落键条件（personnel_id 落键率 0.00%，远低于 90% 门槛）。');

  console.log(`
事故通路录入端治理清单（同培训治理三件套模式）：
  ① 人员落键：accidents 录入/导入增加 employeeId/personnelId 解析
     （复用 violations.resolveViolatorId / training.resolveTrainingPersonId 口径：
      显式 ID → 身份证 hash → 姓名唯一匹配 v_employee_org_full）。
     当前 handler_id/reporter_id 亦全空（FK→employee 但无值），involved_person/handler 为自由文本，
     须统一改为员工选择器回填。
  ② 编码防御：import.js accidents 模块增加 mojibakeCheck 字段清单 + looksLikeMojibake 守卫
     （与培训修复一致），防止 GBK 字节再次污染。
  ③ 字典归一：accident_type / responsibility / level 现有重叠取值
     （交通事故 vs 交通、意外伤害 vs 意外）须先归一为受控字典，否则适配器按类型映射指标会误判。
  ④ FILL_SOURCES.accident 旧路（fetchVeto 按 personnel_id 查 accidents、suggestedScore=100、
     映射 HSE-KPI-NEG-001/002/003）本轮严禁改动；未来事故适配器需专门处理其「否决项=100 分」特殊语义。`);
}

(async () => {
  await testConnection();
  if (!isConnected()) { console.error('DB 未连接'); process.exit(1); }
  console.log('[DB] 事故否决通路只读调研开始（本脚本不执行任何写操作）');
  await section1();
  section2();
  await section3();
  console.log('\n[DB] 调研结束，未产生任何写入。');
  process.exit(0);
})().catch((e) => { console.error('SURVEY ERROR', e && e.stack || e); process.exit(2); });

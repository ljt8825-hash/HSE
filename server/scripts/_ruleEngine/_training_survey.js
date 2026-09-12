/**
 * 培训通路数据治理调研（阶段4 前置，只读）
 *
 * 归属：server/scripts/_ruleEngine/
 * 用途：评估 training_records 是否具备「人员落键 + 引擎化」条件，输出阶段4 培训适配器的前置结论。
 * 铁律：**只读**。不写库、不改表、不建适配器、不接扣分。
 *
 * 用法：node server/scripts/_ruleEngine/_training_survey.js
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
async function q(sql, params) {
  const r = await pool.query(sql, params);
  return r.rows;
}

// ---------- 1. training_records 表结构 ----------
async function section1() {
  head('1. training_records 表结构');

  const cols = await q(`
    SELECT c.column_name AS 列名, c.data_type AS 类型,
           COALESCE(c.character_maximum_length::text, c.numeric_precision::text, '') AS 长度精度,
           c.is_nullable AS 可空, COALESCE(c.column_default,'') AS 默认值,
           COALESCE(pgd.description,'') AS 注释
      FROM information_schema.columns c
      LEFT JOIN pg_catalog.pg_statio_all_tables st
             ON st.schemaname = c.table_schema AND st.relname = c.table_name
      LEFT JOIN pg_catalog.pg_description pgd
             ON pgd.objoid = st.relid AND pgd.objsubid = c.ordinal_position
     WHERE c.table_name = 'training_records'
     ORDER BY c.ordinal_position`);
  console.log(`共 ${cols.length} 列：`);
  show(cols);

  const total = await q(`SELECT count(*) AS 总行数,
                                count(*) FILTER (WHERE is_deleted) AS 已软删,
                                count(*) FILTER (WHERE NOT is_deleted) AS 存活
                           FROM training_records`);
  head('1.1 规模与 is_deleted');
  show(total);

  head('1.2 人员关联字段非空率（存活行）');
  show(await q(`
    SELECT count(*) AS 存活行,
           count(personnel_id) AS personnel_id非空,
           count(employee_id)  AS employee_id非空,
           count(employee_no)  AS employee_no非空,
           count(id_card)      AS id_card非空,
           count(NULLIF(trim(COALESCE(name,'')),'')) AS name非空,
           round(100.0*count(personnel_id)/NULLIF(count(*),0),2) AS personnel_id非空率,
           round(100.0*count(employee_id)/NULLIF(count(*),0),2)  AS employee_id非空率
      FROM training_records WHERE is_deleted=FALSE`));

  head('1.3 日期字段取值范围与 NULL 率（存活行）');
  show(await q(`
    SELECT count(*) AS 存活行,
           min(training_date) AS training_date最小, max(training_date) AS training_date最大,
           count(*) FILTER (WHERE training_date IS NULL) AS training_date空,
           round(100.0*count(*) FILTER (WHERE training_date IS NULL)/NULLIF(count(*),0),2) AS training_date空率,
           min(created_at) AS created_at最小, max(created_at) AS created_at最大,
           count(*) FILTER (WHERE created_at IS NULL) AS created_at空,
           count(checkin_time) AS checkin_time非空
      FROM training_records WHERE is_deleted=FALSE`));

  head('1.4 result 字典值分布（全表 198 行口径 + 存活/软删拆分）');
  show(await q(`
    SELECT COALESCE(result,'(NULL)') AS result值,
           encode(convert_to(result,'UTF8'),'hex') AS UTF8字节,
           count(*) AS 总条数,
           count(*) FILTER (WHERE is_deleted) AS 其中软删,
           count(*) FILTER (WHERE NOT is_deleted) AS 其中存活,
           count(personnel_id) AS personnel_id非空,
           count(employee_id) AS employee_id非空
      FROM training_records
     GROUP BY result ORDER BY 总条数 DESC`));

  head('1.5 编码/字典异常检测（result 是否落在业务字典内）');
  show(await q(`
    SELECT count(*) FILTER (WHERE NOT is_deleted) AS 存活行,
           count(*) FILTER (WHERE NOT is_deleted
                              AND result IN ('合格','优秀','不合格','passed','待培训')) AS 存活且字典内,
           count(*) FILTER (WHERE NOT is_deleted
                              AND (result IS NULL
                                   OR result NOT IN ('合格','优秀','不合格','passed','待培训'))) AS 存活且字典外,
           count(*) FILTER (WHERE is_deleted
                              AND result IN ('合格','优秀','不合格','passed','待培训')) AS 软删且字典内
      FROM training_records`));
  console.log(`说明：存活 82 行的 result 实测为单字符 U+03F8（UTF-8 字节 cfb8，显示「ϸ」），
  属历史写入时编码转换损坏（GBK 字节被按 UTF-8 解读）。
  → 阶段4 若以 result 判定「不合格」，存活数据当前**不可用**，须先修复编码或改由录入端重新写入。`);

  head("1.6 result='不合格' 的日期分布与人员落键（阶段4 关键）");
  show(await q(`
    SELECT COALESCE(to_char(training_date,'YYYY-MM'),'(无日期)') AS 年月,
           count(*) AS 条数,
           count(*) FILTER (WHERE is_deleted) AS 其中软删,
           count(personnel_id) AS personnel_id非空,
           count(employee_id) AS employee_id非空,
           count(NULLIF(trim(COALESCE(name,'')),'')) AS name非空
      FROM training_records
     WHERE result='不合格'
     GROUP BY to_char(training_date,'YYYY-MM') ORDER BY 年月`));
  show(await q(`
    SELECT count(*) AS 不合格总条数,
           count(*) FILTER (WHERE is_deleted) AS 其中已软删,
           count(*) FILTER (WHERE NOT is_deleted) AS 其中存活,
           count(*) FILTER (WHERE training_date IS NULL) AS 其中无日期,
           count(*) FILTER (WHERE personnel_id IS NOT NULL) AS 其中已落personnel_id,
           count(*) FILTER (WHERE employee_id IS NOT NULL) AS 其中已落employee_id
      FROM training_records WHERE result='不合格'`));

  head('1.7 日期异常行（training_date 早于 2000 年）');
  show(await q(`
    SELECT id, training_date::text AS training_date, name, result, is_deleted
      FROM training_records WHERE training_date < DATE '2000-01-01' ORDER BY training_date`));
}

// ---------- 2. 人员关联可行性 ----------
async function section2() {
  head('2. 人员关联可行性（对照三违 B2 口径）');

  head('2.0 存活行去重姓名明细（判断是否为占位/测试数据）');
  show(await q(`
    SELECT COALESCE(NULLIF(trim(name),''),'(空)') AS 姓名值,
           encode(convert_to(name,'UTF8'),'hex') AS UTF8字节,
           count(*) AS 条数,
           count(*) FILTER (WHERE training_date IS NULL) AS 其中无日期
      FROM training_records WHERE is_deleted=FALSE
     GROUP BY name ORDER BY 条数 DESC`));
  console.log(`说明：存活行姓名实测为 GBK 字节被按 UTF-8 解读产生的乱码（如 c7a9→「ǩ」），
  与 v_employee_org_full.name（规范中文）无法匹配 → 唯一匹配率 0%。`);

  head('2.1 按 name 对 v_employee_org_full 匹配（存活、姓名非空的去重姓名）');
  show(await q(`
    WITH nm AS (
      SELECT DISTINCT trim(name) AS n
        FROM training_records
       WHERE is_deleted=FALSE AND name IS NOT NULL AND trim(name)<>''
    ), m AS (
      SELECT n, (SELECT count(*) FROM v_employee_org_full v
                  WHERE v.name = nm.n AND COALESCE(v.is_deleted,FALSE)=FALSE) AS cnt
        FROM nm
    )
    SELECT count(*) AS 去重姓名数,
           count(*) FILTER (WHERE cnt=1) AS 唯一匹配,
           count(*) FILTER (WHERE cnt>1) AS 重名,
           count(*) FILTER (WHERE cnt=0) AS 未匹配,
           round(100.0*count(*) FILTER (WHERE cnt=1)/NULLIF(count(*),0),2) AS 唯一匹配率
      FROM m`));

  head('2.2 按 employee_no 对 v_employee_org_full.employee_code 匹配');
  show(await q(`
    WITH no AS (
      SELECT DISTINCT trim(employee_no) AS c
        FROM training_records
       WHERE is_deleted=FALSE AND employee_no IS NOT NULL AND trim(employee_no)<>''
    ), m AS (
      SELECT c, (SELECT count(*) FROM v_employee_org_full v
                  WHERE v.employee_code = no.c AND COALESCE(v.is_deleted,FALSE)=FALSE) AS cnt
        FROM no
    )
    SELECT count(*) AS 去重工号数,
           count(*) FILTER (WHERE cnt=1) AS 唯一匹配,
           count(*) FILTER (WHERE cnt>1) AS 重复,
           count(*) FILTER (WHERE cnt=0) AS 未匹配
      FROM m`));

  head('2.3 与近 3 个周期考核对象的交集（周期 24/27/28）');
  show(await q(`
    WITH tr_eid AS (
      SELECT DISTINCT employee_id FROM training_records
       WHERE is_deleted=FALSE AND employee_id IS NOT NULL
    ), tr_name AS (
      SELECT DISTINCT (SELECT v.employee_id FROM v_employee_org_full v
                        WHERE v.name = trim(t.name) AND COALESCE(v.is_deleted,FALSE)=FALSE
                        LIMIT 1) AS employee_id
        FROM training_records t
       WHERE t.is_deleted=FALSE AND t.name IS NOT NULL AND trim(t.name)<>''
         AND (SELECT count(*) FROM v_employee_org_full v2
               WHERE v2.name = trim(t.name) AND COALESCE(v2.is_deleted,FALSE)=FALSE) = 1
    ), cy AS (
      SELECT DISTINCT employee_id FROM hse_assessment_target
       WHERE cycle_id = ANY(ARRAY[24,27,28]) AND is_deleted=FALSE
    )
    SELECT (SELECT count(*) FROM tr_eid) AS 培训已落employee_id人数,
           (SELECT count(*) FROM tr_name) AS 培训姓名唯一匹配人数,
           (SELECT count(*) FROM cy) AS 近3周期考核对象人数,
           (SELECT count(*) FROM tr_eid JOIN cy USING (employee_id)) AS 交集_按employee_id,
           (SELECT count(*) FROM tr_name JOIN cy USING (employee_id)) AS 交集_按姓名唯一匹配`));

  head('2.4 结论');
  const c = await q(`
    WITH nm AS (
      SELECT DISTINCT trim(name) AS n FROM training_records
       WHERE is_deleted=FALSE AND name IS NOT NULL AND trim(name)<>''
    ), m AS (
      SELECT n, (SELECT count(*) FROM v_employee_org_full v
                  WHERE v.name = nm.n AND COALESCE(v.is_deleted,FALSE)=FALSE) AS cnt FROM nm
    )
    SELECT count(*) AS 总数, count(*) FILTER (WHERE cnt=1) AS 唯一 FROM m`);
  const rate = c[0].总数 ? (c[0].唯一 / c[0].总数) * 100 : 0;
  const ok = rate >= 90;
  console.log(`姓名唯一匹配率 = ${rate.toFixed(2)}%（${c[0].唯一}/${c[0].总数}）`);
  console.log(`判定门槛（沿用三违 B2 口径）= 90%`);
  console.log(ok
    ? '结论：具备人员落键条件，可推进阶段4 培训适配器。'
    : '结论：**不具备**自动落键条件（唯一匹配率 < 90%），需先治理培训录入端（姓名空值/占位符/重名）。');
}

// ---------- 3. 录入链路盘点 ----------
function grepIn(dir, exts, kws, maxHits = 12) {
  const hits = [];
  if (!fs.existsSync(dir)) return hits;
  const walk = (d) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) {
        if (f.name === 'node_modules' || f.name === '.git' || f.name === 'dist') continue;
        walk(p);
      } else if (exts.some((e) => f.name.endsWith(e))) {
        let txt;
        try { txt = fs.readFileSync(p, 'utf8'); } catch { return; }
        txt.split('\n').forEach((line, i) => {
          if (kws.some((k) => line.includes(k))) {
            hits.push(`${path.relative(SERVER_ROOT, p)}:${i + 1}: ${line.trim().slice(0, 140)}`);
          }
        });
      }
    }
  };
  walk(dir);
  return hits.slice(0, maxHits);
}

function section3() {
  head('3. 录入链路盘点（后端路由 / 前端页面 / 导入）');

  head('3.1 后端路由（server/routes 中含 training 的文件与关键行）');
  const routesDir = path.join(SERVER_ROOT, 'routes');
  const routeFiles = fs.existsSync(routesDir)
    ? fs.readdirSync(routesDir).filter((f) => f.toLowerCase().includes('training'))
    : [];
  console.log('匹配文件：' + (routeFiles.length ? routeFiles.join(', ') : '(无)'));
  const rHits = grepIn(routesDir, ['.js'], ['training_records', 'trainingRecords', 'training'], 15);
  rHits.forEach((h) => console.log('  ' + h));

  head('3.2 前端页面（web-naive views/training 模块）');
  const tvDir = path.join(WEB_NAIVE_ROOT, 'views', 'training');
  if (fs.existsSync(tvDir)) {
    const files = [];
    (function walk(d) {
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, f.name);
        if (f.isDirectory()) walk(p);
        else if (f.name.endsWith('.vue')) files.push(p);
      }
    })(tvDir);
    console.log(`培训页面 .vue 文件（${files.length} 个）：`);
    files.sort().forEach((f) => console.log('  ' + path.relative(WEB_NAIVE_ROOT, f)));

    console.log('\n其中引用员工选择器（getEmployeeSelector*）的行：');
    let any = false;
    for (const f of files) {
      fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        if (line.includes('getEmployeeSelector')) {
          console.log(`    ${path.relative(WEB_NAIVE_ROOT, f)}:${i + 1}: ${line.trim().slice(0, 120)}`);
          any = true;
        }
      });
    }
    if (!any) console.log('    (无 —— 培训录入端未使用员工选择器，人员为自由文本)');

    console.log('\n各页面是否写入 name / employee_id 字段（关键落键字段）：');
    for (const f of files.slice(0, 12)) {
      const txt = fs.readFileSync(f, 'utf8');
      const hasName = /['"]?name['"]?\s*[:=]/.test(txt);
      const hasEmpId = /employee_?id|employeeId/.test(txt);
      console.log(`    ${path.relative(WEB_NAIVE_ROOT, f)}  name=${hasName ? 'Y' : 'N'}  employee_id=${hasEmpId ? 'Y' : 'N'}`);
    }
  } else {
    console.log('  (未找到 views/training 目录)');
  }

  head('3.3 导入链路（server/routes/import.js 中的 training 模块）');
  const importFile = path.join(SERVER_ROOT, 'routes', 'import.js');
  if (fs.existsSync(importFile)) {
    const lines = fs.readFileSync(importFile, 'utf8').split('\n');
    let hit = 0;
    lines.forEach((line, i) => {
      if (/training|培训/i.test(line)) {
        console.log(`  import.js:${i + 1}: ${line.trim().slice(0, 150)}`);
        hit++;
        if (hit >= 20) return false;
      }
      return true;
    });
    if (!hit) console.log('  (import.js 中未找到 training/培训 相关配置)');
  } else {
    console.log('  (未找到 server/routes/import.js)');
  }
}

// ---------- 4. 晨会表核实 ----------
async function section4() {
  head('4. 晨会表核实（TRAIN001 的 source_table）');
  show(await q(`
    SELECT rule_code, COALESCE(source_table,'(NULL)') AS source_table, integration_status
      FROM hse_assessment_rule WHERE rule_code LIKE 'TRAIN%'`));
  show(await q(`
    SELECT COALESCE(to_regclass('hse_morning_meeting')::text,'(不存在)') AS hse_morning_meeting`));
  show(await q(`
    SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_name ILIKE '%morning%' ORDER BY table_name`));
  console.log("结论：to_regclass 为空且无 %morning% 表 → TRAIN001 的 source_table='hse_morning_meeting' 为 **no_table**（表不存在）。");
}

// ---------- 5. 语义对照与业务选项 ----------
async function section5() {
  head('5. 语义对照与业务选项（阶段4 培训适配器，需业务拍板）');

  head('5.1 规则库 TRAIN002 现状');
  show(await q(`
    SELECT rule_code, rule_name, category, deduct_score, integration_status,
           COALESCE(metric_code,'(NULL)') AS metric_code,
           COALESCE(source_table,'(NULL)') AS source_table,
           COALESCE(adapter_key,'(NULL)') AS adapter_key
      FROM hse_assessment_rule WHERE rule_code='TRAIN002'`));

  head('5.2 类别上限（HSE教育培训）');
  show(await q(`SELECT category, max_deduct FROM hse_assessment_category_limit WHERE category='HSE教育培训'`));

  head('5.3 口径差异对照表');
  console.log(`
┌────────────┬──────────────────────────────────┬────────────────────────────────────────┐
│ 维度        │ 规则库 TRAIN002                    │ 硬编码 FILL_SOURCES.training            │
├────────────┼──────────────────────────────────┼────────────────────────────────────────┤
│ 扣分项语义  │ 培训记录缺失                        │ 培训不合格                              │
│ 触发条件    │ 周期内无培训记录（缺课/未参训）      │ 存在 result='不合格' 的培训记录           │
│ 分值        │ 1 分                              │ 3 分/次                                │
│ 累计方式    │ cumulative（类别内累计）            │ 按次累加（每条不合格记录 1 次）           │
│ 指标号      │ metric_code NULL（待配）            │ HSE-KPI-TRN-002                        │
│ 上限        │ HSE教育培训 30                     │ 无（硬编码不走上限钳制）                 │
│ 取数口径    │ 待定（按人员+周期是否有培训记录）    │ personnel_id + 培训日期落在周期内         │
│ 当前状态    │ pending_data（未接入）              │ 已接线（但 violator/personnel 落键为空） │
└────────────┴──────────────────────────────────┴────────────────────────────────────────┘`);

  head('5.4 阶段4 两种口径方案（**需业务拍板，本轮不做决定、不接扣分**）');
  console.log(`
方案 A —— 沿用硬编码口径（培训不合格 3 分/次）
  · 适配器按 result='不合格' 的培训记录逐条扣分，3 分/次，纳入 HSE教育培训 类别上限（30）。
  · 影响：与现行硬编码行为一致，切换后若历史 personnel_id 回填会立即产生扣分（当前 0 条，因落键为空）。
  · 风险：3 分/次且无「按人去重」，同一人多次不合格可快速逼近 30 分上限。

方案 B —— 改用规则库 TRAIN002 口径（培训记录缺失 1 分，cumulative）
  · 适配器按「周期内该考核对象无任何有效培训记录」判定，1 分/人/周期。
  · 影响：语义与硬编码不同（缺训 vs 不合格），需同步停用/拆除 FILL_SOURCES.training，否则两条并存。
  · 风险：当前 training_records 落键率极低（见 §2），「无任何培训记录」会大面积命中，产生大范围扣分。

共同前置条件（见 §2.4）：
  · training_records 的人员落键率需先治理到可用水平，否则任一方案都会误扣或漏扣。
  · 需业务明确：不合格是否按次累加、是否按人去重、是否设置周期内上限。`);
}

(async () => {
  await testConnection();
  if (!isConnected()) { console.error('DB 未连接'); process.exit(1); }
  console.log('[DB] 只读调研开始（本脚本不执行任何写操作）');
  await section1();
  await section2();
  section3();
  await section4();
  await section5();
  console.log('\n[DB] 调研结束，未产生任何写入。');
  process.exit(0);
})().catch((e) => { console.error('SURVEY ERROR', e && e.stack || e); process.exit(2); });

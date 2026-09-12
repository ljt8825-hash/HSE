/**
 * 规则引擎 · 适配器：三违统计「扣分」列月度扣分（Excel 月度考核对齐版）
 *
 * 数据源：各月《管理员月度考核结果》Excel 的「三违统计」sheet（目录扫描，与「三违分析」同源）
 *   - 按行读「扣分」列：岗位='管理员' → 三级网格长；岗位='乡镇主管' → 乡镇作业中心经理
 *   - 只有包含「扣分」列的月份才处理（2025-08 ~ 2026-01；后续月「三违群/三违检查统计」
 *     无扣分列 → noLedger 跳过）
 * 口径（2026-09-06 拍板）：
 *   - 当月「扣分」列值即该考核对象的扣分（张东霞4 / 李春福3 等）
 *   - 计入「三违管理」类别，上限由引擎按考核对象岗位钳制（管理员40 / 乡镇作业中心经理15）
 *   - 当月无「三违统计」表或表内无「扣分」列 → 整月跳过（noLedger）
 *   - 行岗位无对应考核对象 → skipped（不扣分不报错）
 * 幂等：月度模式，一人一条三违扣分（与「三违分析」页该月每人「扣分」列一一对应）。
 */

const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { pool } = require('../../../config/db');
const engine = require('../../assessmentScoringEngine');
const sanweiRoster = require('../../sanweiAdminRoster');

const KEY = 'sanwei_excel';
const RULE_CODE = 'SANWEI_EXCEL';
const SOURCE_TABLE = 'hse_sanwei_excel';
const KIND = 'sanwei_excel_monthly';
const EVENT_TYPE = 'SANWEI_EXCEL';
const METRIC_CODE = 'HSE-KPI-SAF-001';

// 口径分区：2025-08~2026-01 取「三违统计」扣分列；2026-02~2026-05 取「三违行为统计台账」未按时整改；
// 2026-06~2026-07 取「三违检查统计」（06 计❌次数 / 07 取总扣分列）
const QUN_FROM = '2026-02';
const QUN_TO = '2026-05';
const CHECK_FROM = '2026-06';
const CHECK_TO = '2026-07';

// 「三违统计」sheet 的岗位 → 系统考核岗位映射
const POS_MAP = {
  管理员: '管理员',
  乡镇主管: '乡镇作业中心经理',
};
// 「三违行为统计台账」的角色 → 系统考核岗位
const QUN_ROLE_MAP = {
  片区责任人: '管理员',
  主管: '乡镇作业中心经理',
};

function cellStr(v) {
  return String(v == null ? '' : v).trim();
}
function isBlankName(n) {
  return !n || n === '/' || n === '—' || n === '-';
}

/**
 * 读取某周期 Excel，按其当月口径产出统一扣分意图行 [{ name, sysPos, score }]
 *   - 2025-08~2026-01：「三违统计」sheet 的「扣分」列（一人一行）
 *   - 2026-02~2026-05：「三违行为统计台账」按「未按时整改」列对 主管/片区责任人 各扣分（聚合一人一行）
 * 无对应源或结构不识别 → 返回 null（当月 noLedger 跳过）。
 */
function collectDeductions(year, month) {
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  if (monthStr >= QUN_FROM && monthStr <= QUN_TO) return parseSanweiQun(year, month);
  if (monthStr >= CHECK_FROM && monthStr <= CHECK_TO) return parseSanweiCheck(year, month);
  return parseSanweiStats(year, month); // 2025-08~2026-01
}

/**
 * 「三违检查统计」sheet（2026-06~2026-07）：
 *   - 2026-07 结构：序号/姓名/乡镇/未完成巡检次数/填报信息缺失次数/总扣分/明细 → 取「总扣分」列
 *   - 2026-06 结构：乡镇/姓名，其后为每日 ✓/❌ → 各姓名计 ❌ 次数
 * 该 sheet 内姓名均为「管理员」岗位。
 */
function parseSanweiCheck(year, month) {
  const file = sanweiRoster.findAdminFile(year, month);
  if (!file) return null;
  let wb;
  try {
    wb = XLSX.readFile(file);
  } catch (e) {
    console.warn(`[sanwei_excel] 读取失败 ${path.basename(file)}: ${e.message}`);
    return null;
  }
  const sn = (wb.SheetNames || []).find((n) => /三违检查统计/.test(String(n)));
  if (!sn) return null;
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });

  const out = [];
  // 07 结构：找「姓名」+「总扣分」
  let head = -1, nameI = -1, totalI = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || [];
    for (let c = 0; c < r.length; c++) {
      const s = cellStr(r[c]);
      if (s === '姓名' && nameI < 0) nameI = c;
      else if (s === '总扣分' && totalI < 0) totalI = c;
    }
    if (nameI >= 0 && totalI >= 0) { head = i; break; }
  }
  if (head >= 0) {
    for (let i = head + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const name = cellStr(r[nameI]);
      if (isBlankName(name) || /汇总|合计|总计/.test(name)) continue;
      const v = Number(r[totalI]) || 0;
      if (v > 0) out.push({ name, sysPos: '管理员', score: v });
    }
    return out;
  }

  // 06 结构：乡镇/姓名 + 每日 ✓/❌
  nameI = -1; head = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || [];
    for (let c = 0; c < r.length; c++) {
      if (cellStr(r[c]) === '姓名' && nameI < 0) { nameI = c; break; }
    }
    if (nameI >= 0) { head = i; break; }
  }
  if (nameI < 0) return null;
  for (let i = head + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const name = cellStr(r[nameI]);
    if (isBlankName(name) || /汇总|合计|总计/.test(name)) continue;
    let cnt = 0;
    for (let c = nameI + 1; c < r.length; c++) {
      if (cellStr(r[c]) === '❌') cnt++;
    }
    if (cnt > 0) out.push({ name, sysPos: '管理员', score: cnt });
  }
  return out;
}

/**
 * 「三违统计」sheet（2025-08~2026-01）：按「扣分」列，岗位映射到系统岗位。
 */
function parseSanweiStats(year, month) {
  const file = sanweiRoster.findAdminFile(year, month);
  if (!file) return null;
  let wb;
  try {
    wb = XLSX.readFile(file);
  } catch (e) {
    console.warn(`[sanwei_excel] 读取失败 ${path.basename(file)}: ${e.message}`);
    return null;
  }
  const sn = (wb.SheetNames || []).find((n) => /三违统计/.test(String(n)));
  if (!sn) return null;
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });

  let catRow = -1;
  for (let i = 0; i < rows.length; i++) {
    if ((rows[i] || []).some((c) => cellStr(c) === '穿拖鞋')) { catRow = i; break; }
  }
  if (catRow < 0) return null;
  const cat = rows[catRow];
  const sub = rows[catRow + 1] || [];
  const isMerged = (sub || []).some((c) => cellStr(c).includes('作业质量三违'));
  const dataStart = isMerged ? catRow + 2 : catRow + 1;

  let nameI = -1, posI = -1, dedI = -1;
  cat.forEach((v, c) => {
    const s = cellStr(v);
    if (s === '姓名' && nameI < 0) nameI = c;
    else if (s === '岗位' && posI < 0) posI = c;
    else if (s === '扣分' && dedI < 0) dedI = c;
  });
  if (nameI < 0 || dedI < 0) return null; // 无「扣分」列 → 跳过当月

  const out = [];
  for (let i = dataStart; i < rows.length; i++) {
    const r = rows[i] || [];
    const name = cellStr(r[nameI]);
    if (isBlankName(name)) continue;
    const pos = posI >= 0 ? cellStr(r[posI]) : '管理员';
    const score = Number(r[dedI]) || 0;
    out.push({ name, sysPos: POS_MAP[pos] || pos, score });
  }
  return out;
}

/**
 * 「三违行为统计台账」sheet（2026-02~2026-05）：按「未按时整改」列，对 主管/片区责任人 各自扣分。
 * 同一考核对象多行合计，产出一人一条。
 */
function parseSanweiQun(year, month) {
  const file = sanweiRoster.findAdminFile(year, month);
  if (!file) return null;
  let wb;
  try {
    wb = XLSX.readFile(file);
  } catch (e) {
    console.warn(`[sanwei_excel] 读取失败 ${path.basename(file)}: ${e.message}`);
    return null;
  }
  const sn = (wb.SheetNames || []).find((n) => /三违群|三违行为/.test(String(n)));
  if (!sn) return null;
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });

  let head = -1;
  for (let i = 0; i < rows.length; i++) {
    if ((rows[i] || []).some((c) => cellStr(c) === '片区责任人')) { head = i; break; }
  }
  if (head < 0) return null;
  const h = rows[head];
  let zrI = -1, guiI = -1, dedI = -1;
  h.forEach((v, c) => {
    const s = cellStr(v);
    if (s === '片区责任人' && zrI < 0) zrI = c;
    else if (s === '主管' && guiI < 0) guiI = c;
    else if (s === '未按时整改' && dedI < 0) dedI = c;
  });
  if (zrI < 0 || guiI < 0 || dedI < 0) return null;

  // 聚合：{ 岗位|姓名: score }
  const agg = new Map();
  for (let i = head + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const ded = Number(r[dedI]) || 0;
    if (ded <= 0) continue;
    for (const [nameI, role] of [[zrI, '片区责任人'], [guiI, '主管']]) {
      const name = cellStr(r[nameI]);
      if (isBlankName(name)) continue;
      const sysPos = QUN_ROLE_MAP[role];
      const key = `${sysPos}|${name}`;
      agg.set(key, (agg.get(key) || 0) + ded);
    }
  }
  return [...agg.entries()].map(([k, score]) => {
    const idx = k.indexOf('|');
    return { name: k.slice(idx + 1), sysPos: k.slice(0, idx), score };
  });
}

/**
 * 幂等键：按考核对象 + 周期（月度模式每月一人一条）
 */
function buildDeductKey({ cycleId, employeeId }) {
  return `sanwei-excel:${cycleId}:${employeeId}`;
}

/**
 * 确保指标存在（复用既有「三违行为管控」指标）
 */
async function ensureMetric(metricCode) {
  const code = metricCode || METRIC_CODE;
  const existing = await engine.findMetricByCode(code);
  if (existing) return { code, id: existing.id };
  const r = await pool.query(
    `INSERT INTO hse_assessment_metric
       (metric_code, metric_name, category, target_post, base_score, metric_type,
        data_source, calc_formula, sort_order, status, remark)
     VALUES ($1,$2,'SAFETY','all',40,'auto','hse_sanwei_excel',
             '三违统计扣分列（Excel月度考核）',10,'active',
             '自动考核：三违统计月度扣分')
     ON CONFLICT (metric_code) DO UPDATE SET is_deleted=FALSE
     RETURNING id`,
    [code, metricCode || '三违行为管控']
  );
  return { code, id: r.rows[0].id };
}

async function loadCycleTargets(cycleId) {
  const r = await pool.query(
    `SELECT id, employee_id, employee_name, position FROM hse_assessment_target
      WHERE cycle_id = $1 AND is_deleted = FALSE`,
    [cycleId]
  );
  const map = new Map(); // 已有 employee_id → 直接用；无则 name+position
  for (const t of r.rows) map.set(`${t.employee_name}|${t.position}`, t);
  for (const t of r.rows) if (t.employee_id) map.set(`e:${t.employee_id}`, t);
  return map;
}

async function scan({ cycle, year, month, rule, dryRun }) {
  const cycleId = cycle.id;

  // 按周期口径取扣分意图行：无对应源/结构 → noLedger 跳过
  const parsed = collectDeductions(year, month);
  if (!parsed || !parsed.length) {
    return { scanned: 0, assessed: 0, intents: [], revocations: [], skipped: [], noLedger: true, metric: null };
  }

  const metric = await ensureMetric(rule.metricCode);
  const targets = await loadCycleTargets(cycleId);

  const intents = [];
  const revocations = [];
  const skipped = [];
  let seq = 0;
  let scanned = 0;

  for (const rec of parsed) {
    scanned++;
    const sysPos = rec.sysPos || '管理员';
    // 优先 employee_id 精确匹配，兜底 name+position
    const target = targets.get(`${rec.name}|${sysPos}`);
    if (!target) {
      skipped.push({ employeeId: null, name: rec.name, dept: '', reason: 'employee-not-assessment-target' });
      continue;
    }
    const rawScore = Math.round(rec.score * 100) / 100;
    const base = {
      _seq: seq++,
      cycleId,
      targetId: target.id,
      employeeId: target.employeeId || target.id,
      employeeName: target.employee_name,
      ruleName: rule.ruleName,
      category: rule.category,
      dept: '',
      rawScore,
      year,
      month,
    };
    if (rawScore <= 0) revocations.push(base);
    else intents.push(base);
  }

  return { scanned, assessed: intents.length + revocations.length, intents, revocations, skipped, noLedger: false, metric };
}

function buildItem(intent, rule) {
  return rule.ruleName;
}

function buildDetail(intent, capRes) {
  return {
    kind: KIND,
    deductKey: buildDeductKey({ cycleId: intent.cycleId, employeeId: intent.employeeId }),
    ruleName: intent.ruleName,
    category: intent.category,
    eventType: EVENT_TYPE,
    rawScore: intent.rawScore,
    cap: capRes.cap,
    cappedScore: capRes.cappedScore,
    otherCatScore: capRes.otherCatScore,
    year: intent.year,
    month: intent.month,
    source: '三违统计Excel月度考核',
    summary: `三违统计扣分 ${intent.rawScore} 分`,
  };
}

function buildReportDetail(intent, outcome) {
  const base = {
    employeeId: intent.employeeId,
    employeeName: intent.employeeName,
    rawScore: intent.rawScore,
  };
  if (outcome.type === 'revoke') return { ...base, cappedScore: 0, action: outcome.action };
  if (outcome.type === 'capped-out') return { ...base, cappedScore: 0, cappedOut: true, action: outcome.action };
  return { ...base, cappedScore: outcome.cappedScore, action: outcome.action };
}

module.exports = {
  key: KEY,
  ruleCode: RULE_CODE,
  sourceTable: SOURCE_TABLE,
  kind: KIND,
  metricCode: METRIC_CODE,
  ensureMetric,
  buildDeductKey,
  collectDeductions,
  parseSanweiCheck,
  scan,
  buildItem,
  buildDetail,
  buildReportDetail,
};
/**
 * 三违分析「管理员」名单 + 三违考核列 —— 按月从《管理员月度考核结果》Excel 解析，并按姓名匹配系统管理员。
 *
 * 范围：2025-08 ~ 2026-07（2026-08 起前端沿用系统管理员花名册）。
 *
 * 名单：始终取「管理员月度考核结果」主表「被考核人信息」(岗位='管理员')，按姓名匹配系统 position='管理员' 对象：
 *   - 表中有系统无 → added（该月标「新增」）；系统有当月表无 → removedNames（该月不展示）。
 *
 * 考核列：名字后按当月「三违」工作表列展示（列标题用表头原文），各月不一致属正常：
 *   - sheet「三违统计」(2025-08~2026-01)：三违类别列；2025-09 起为双层表头（作业质量三违/三违群/合计）。
 *   - sheet「三违群」(2026-02~05)：以当月「违章行为」为列，值为该管理员当月该项次数（非违章者计 0）。
 *   - sheet「三违检查统计」及未识别结构(2026-06~07)：按表头通用解析，姓名/序号/乡镇等身份列后均为考核列。
 * 各月考核列通过「姓名」关联到名单行；名单中当月在对应表无记录则留空。
 *
 * 目录：<根>/<YYYY>年/<M>月/「<M>月管理员月度考核结果」*.xlsx（不含「综管」子目录及「乡镇作业中心经理」表）
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { pool } = require('../config/db');

const BASE_DIR = process.env.SANWEI_SOURCE_DIR || 'G:/safety_vault/04_现场管理/27、HSE月度考核';
const LEGACY_MAX_MONTH = '2026-07';

function cellStr(v) {
  return String(v == null ? '' : v).trim();
}
function isBlankName(n) {
  return !n || n === '/' || n === '—' || n === '-';
}
/** 「未带头盔（9人）」→「未带头盔」 */
function cleanBehavior(b) {
  return cellStr(b).replace(/（\d+人）$/, '').replace(/（\d+）$/, '').replace(/\(\d+人\)$/, '');
}

function monthDir(year, month) {
  return path.join(BASE_DIR, `${year}年`, `${month}月`);
}

function findAdminFile(year, month) {
  const dir = monthDir(year, month);
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((n) => !String(n).startsWith('~$'))
    .filter((n) => /\.(xlsx|xls)$/i.test(n))
    .filter((n) => /管理员/.test(n) && !/乡镇作业中心经理|主管/.test(n));
  if (!files.length) return null;
  files.sort((a, b) => (/^[\d月]+管理员月度考核结果/.test(a) ? 0 : 1) - (/^[\d月]+管理员月度考核结果/.test(b) ? 0 : 1));
  return path.join(dir, files[0]);
}

// ===================== 名单：主表被考核人 =====================
/** 解析「管理员月度考核结果」主表「被考核人信息」（岗位=管理员），返回 [{town, name}] */
function parseMainSheet(rows) {
  if (!rows || !rows.length) return [];
  let catRow = -1;
  for (let i = 0; i < rows.length; i++) {
    if (cellStr(rows[i] && rows[i][0]).includes('被考核人')) { catRow = i; break; }
  }
  if (catRow < 0) return [];
  const sub = rows[catRow + 1] || [];
  let townI = -1, posI = -1, nameI = -1;
  sub.forEach((v, c) => {
    const s = cellStr(v);
    if (s === '乡镇' && townI < 0) townI = c;
    else if (s === '职务' && posI < 0) posI = c;
    else if (s === '姓名' && nameI < 0) nameI = c;
  });
  if (townI < 0 || nameI < 0) return [];
  const out = [];
  for (let i = catRow + 2; i < rows.length; i++) {
    const r = rows[i] || [];
    const name = cellStr(r[nameI]);
    if (isBlankName(name)) continue;
    const pos = posI >= 0 ? cellStr(r[posI]) : '';
    // 无「职务」列(2025-08)则整表视为管理员
    if (posI >= 0 && pos !== '管理员') continue;
    out.push({ town: cellStr(r[townI]), name });
  }
  return out;
}

// ===================== 考核列：三违统计（单层/双层） =====================
function parseSanweiStats(rows) {
  if (!rows || !rows.length) return null;
  let catRow = -1;
  for (let i = 0; i < rows.length; i++) {
    if ((rows[i] || []).some((c) => cellStr(c) === '穿拖鞋')) { catRow = i; break; }
  }
  if (catRow < 0) return null;
  const cat = rows[catRow];
  const sub = rows[catRow + 1] || [];
  const isMerged = (sub || []).some((c) => cellStr(c).includes('作业质量三违'));
  const dataStart = isMerged ? catRow + 2 : catRow + 1;

  let nameI = -1, posI = -1;
  cat.forEach((v, c) => {
    const s = cellStr(v);
    if (s === '姓名' && nameI < 0) nameI = c;
    else if (s === '岗位' && posI < 0) posI = c;
  });
  if (nameI < 0) return null;
  const identity = new Set(['序号', '所属乡镇', '二级部门', '管辖区域', '岗位', '姓名']);

  const columns = [];
  if (isMerged) {
    cat.forEach((v, c) => {
      const s = cellStr(v);
      if (!s || identity.has(s) || c <= nameI) return;
      if (cellStr(sub[c]) !== '') {
        const children = [];
        for (let k = 0; k < 3; k++) children.push({ key: `s_${c + k}`, title: cellStr(sub[c + k]) || `(${k + 1})` });
        columns.push({ key: `s_g_${c}`, title: s, children });
      } else {
        columns.push({ key: `s_${c}`, title: s });
      }
    });
  } else {
    cat.forEach((v, c) => {
      const s = cellStr(v);
      if (!s || identity.has(s) || c <= nameI) return;
      columns.push({ key: `s_${c}`, title: s });
    });
  }

  const nameValues = new Map();
  for (let i = dataStart; i < rows.length; i++) {
    const r = rows[i] || [];
    const name = cellStr(r[nameI]);
    if (isBlankName(name)) continue;
    const pos = posI >= 0 ? cellStr(r[posI]) : '';
    if (posI >= 0 && pos !== '管理员') continue;
    const values = {};
    cat.forEach((_v, c) => {
      const s = cellStr(cat[c]);
      if (!s || identity.has(s) || c <= nameI) return;
      if (isMerged && cellStr(sub[c]) !== '') {
        for (let k = 0; k < 3; k++) values[`s_${c + k}`] = r[c + k] ?? '';
      } else {
        values[`s_${c}`] = r[c] ?? '';
      }
    });
    nameValues.set(name, values);
  }
  return { columns, nameValues };
}

// ===================== 考核列：三违群（违章行为聚合） =====================
function parseSanweiGroup(rows) {
  if (!rows || !rows.length) return null;
  let h = -1;
  for (let i = 0; i < rows.length; i++) {
    if ((rows[i] || []).some((c) => cellStr(c) === '片区责任人')) { h = i; break; }
  }
  if (h < 0) return null;
  const head = rows[h];
  let nameI = -1, behI = -1;
  head.forEach((v, c) => {
    const s = cellStr(v);
    if (s === '片区责任人' && nameI < 0) nameI = c;
    else if (s === '违章行为' && behI < 0) behI = c;
  });
  if (nameI < 0 || behI < 0) return null;

  const behaviorOrder = [];
  const counts = new Map(); // name -> Map(base -> count)
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const name = cellStr(r[nameI]);
    if (isBlankName(name)) continue;
    const base = cleanBehavior(cellStr(r[behI]));
    if (!base) continue;
    if (!behaviorOrder.includes(base)) behaviorOrder.push(base);
    if (!counts.has(name)) counts.set(name, new Map());
    const cm = counts.get(name);
    cm.set(base, (cm.get(base) || 0) + 1);
  }
  if (!behaviorOrder.length) return null;
  const columns = behaviorOrder.map((b, i) => ({ key: `v_${i}`, title: b }));
  const nameValues = new Map();
  for (const [name, cm] of counts) {
    const values = {};
    behaviorOrder.forEach((b, i) => { values[`v_${i}`] = cm.get(b) || 0; });
    nameValues.set(name, values);
  }
  return { columns, nameValues };
}

// ===================== 考核列：通用（三违检查统计 / 其它未识别结构） =====================
function parseGeneric(rows) {
  if (!rows || !rows.length) return null;
  let h = -1;
  for (let i = 0; i < rows.length; i++) {
    if ((rows[i] || []).some((c) => cellStr(c) === '姓名')) { h = i; break; }
  }
  if (h < 0) return null;
  const head = rows[h];
  let nameI = -1;
  head.forEach((v, c) => { const s = cellStr(v); if (s === '姓名' && nameI < 0) nameI = c; });
  if (nameI < 0) return null;
  const identity = new Set(['序号', '姓名', '乡镇', '所属乡镇', '二级部门', '管辖区域', '岗位', '片区责任人', '主管']);

  const columns = [];
  head.forEach((v, c) => {
    const s = cellStr(v);
    if (!s || identity.has(s)) return;
    columns.push({ key: `c_${c}`, title: s });
  });
  if (!columns.length) return null;

  const nameValues = new Map();
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const name = cellStr(r[nameI]);
    if (isBlankName(name)) continue;
    const values = {};
    for (const col of columns) values[col.key] = r[Number(col.key.slice(2))] ?? '';
    nameValues.set(name, values);
  }
  return { columns, nameValues };
}

/** 由列定义集合出所有叶子 key */
function collectLeafKeys(columns) {
  const keys = [];
  for (const c of columns) {
    if (c.children) for (const ch of c.children) keys.push(ch.key);
    else keys.push(c.key);
  }
  return keys;
}
function blankValues(columns) {
  const v = {};
  for (const k of collectLeafKeys(columns)) v[k] = '';
  return v;
}

async function loadSystemAdminMaster() {
  try {
    const r = await pool.query(
      `SELECT DISTINCT employee_name AS name, max(employee_id)::int AS employee_id
         FROM hse_assessment_target
        WHERE is_deleted = FALSE AND position = '管理员' AND employee_name IS NOT NULL AND employee_name <> ''
        GROUP BY employee_name`
    );
    return (r.rows || []).map((x) => ({ name: x.name, employeeId: x.employee_id }));
  } catch {
    return [];
  }
}

async function getAdminRoster(monthStr) {
  if (!/^\d{4}-\d{2}$/.test(String(monthStr))) {
    const err = new Error('month 需为 YYYY-MM 格式');
    err.status = 400;
    throw err;
  }
  if (monthStr > LEGACY_MAX_MONTH) {
    return { month: monthStr, outOfRange: true, note: '该月已超过历史补录范围（2025-08~2026-07），按系统管理员名单展示' };
  }
  const [year, mon] = String(monthStr).split('-').map(Number);
  const file = findAdminFile(year, mon);
  if (!file) {
    return { month: monthStr, hasFile: false, note: `未找到 ${monthStr} 的《管理员月度考核结果》Excel` };
  }
  let wb;
  try {
    wb = XLSX.readFile(file);
  } catch (e) {
    const err = new Error(`读取 Excel 失败：${path.basename(file)} — ${e.message}`);
    err.status = 400;
    throw err;
  }

  // 名单来自主表被考核人
  const mainName = (wb.SheetNames || []).find((n) => /管理员月度考核结果/.test(n)) || wb.SheetNames[0];
  const mainRows = XLSX.utils.sheet_to_json(wb.Sheets[mainName], { header: 1, defval: '', raw: true });
  let roster = parseMainSheet(mainRows);

  // 考核列来自「三违」相关表（优先三违统计，其次三违群，否则通用）
  let columns = [];
  let nameValues = new Map();
  let sheetName = null;
  const prefer = ['三违统计', '三违群', '三违检查统计'];
  for (const kw of prefer) {
    const sn = (wb.SheetNames || []).find((n) => String(n).includes(kw));
    if (!sn) continue;
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '', raw: true });
    let parsed = null;
    if (String(sn).includes('三违统计')) parsed = parseSanweiStats(rows);
    else if (String(sn).includes('三违群')) parsed = parseSanweiGroup(rows);
    else parsed = parseGeneric(rows);
    if (parsed && parsed.columns.length) { columns = parsed.columns; nameValues = parsed.nameValues; sheetName = sn; break; }
  }

  const systemMaster = await loadSystemAdminMaster();
  const systemNameSet = new Set(systemMaster.map((s) => s.name));
  const sysNameToId = new Map(systemMaster.map((s) => [s.name, s.employeeId]));

  const blank = blankValues(columns);
  const list = roster.map((a) => {
    const matched = systemNameSet.has(a.name);
    return {
      town: a.town,
      name: a.name,
      values: Object.assign({}, blank, nameValues.get(a.name) || {}),
      matched,
      employeeId: matched ? (sysNameToId.get(a.name) ?? null) : null,
    };
  });
  list.sort((a, b) => a.town.localeCompare(b.town, 'zh-Hans-CN') || a.name.localeCompare(b.name, 'zh-Hans-CN'));

  const rosterNameSet = new Set(roster.map((a) => a.name));
  const removedNames = systemMaster.map((s) => s.name).filter((n) => !rosterNameSet.has(n));
  const matchedCount = list.filter((l) => l.matched).length;

  return {
    month: monthStr,
    hasFile: true,
    file: path.basename(file),
    sheet: sheetName,
    columns,
    total: list.length,
    matchedCount,
    addedCount: list.length - matchedCount,
    removedCount: removedNames.length,
    removedNames,
    list,
  };
}

/** 扫描目录下存在《管理员月度考核结果》Excel 的所有月份，供前端月份下拉并入管理员月 */
function listAdminMonths() {
  const out = [];
  if (!fs.existsSync(BASE_DIR)) return out;
  const years = fs
    .readdirSync(BASE_DIR)
    .filter((n) => /^\d{4}年$/.test(n))
    .sort((a, b) => b.localeCompare(a));
  for (const y of years) {
    const year = y.replace('年', '');
    const dir = path.join(BASE_DIR, y);
    let months;
    try {
      months = fs.readdirSync(dir).filter((n) => /^\d{1,2}月$/.test(n));
    } catch { continue; }
    for (const m of months) {
      try {
        const f = findAdminFile(Number(year), Number(m.replace('月', '')));
        if (f) out.push(`${year}-${String(Number(m.replace('月', ''))).padStart(2, '0')}`);
      } catch { /* 忽略单个月份解析失败 */ }
    }
  }
  return out;
}

module.exports = { getAdminRoster, parseMainSheet, findAdminFile, monthDir, listAdminMonths, LEGACY_MAX_MONTH };
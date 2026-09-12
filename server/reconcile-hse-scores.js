/**
 * HSE 月度考核对账：Excel 台账(考核结果) vs 系统『自动评分』库内自动扣分
 * 对比口径（用户指定：按可对齐项核）：
 *   经理/主管家：安全文化建设/HSE教育培训/现场管理-驾驶员管理/现场管理-转运站管理/三违管理/否决项
 *   管理员家：   安全文化建设(专项主题活动,近似)/HSE教育培训/三违管理/否决项
 *   不可对齐项（消防、目标职责、加分、总分鉴于口径差异）不入列，另行说明。
 * 输出文本报告到 stdout + 落盘 Markdown。
 */
require('dotenv').config({ path: 'g:/hse-dashboard/server/.env' });
const db = require('g:/hse-dashboard/server/config/db');
const { pool } = db;
const XLSX = require('xlsx');
const fs = require('fs');

// ---------- 1) 文件/月份/对象类型 枚举 ----------
const BASE = 'G:/safety_vault/04_现场管理/27、HSE月度考核';
const NY = (y) => `${BASE}/${y}年`;
function f(y, mo, name) { return `${NY(y)}/${mo}月/${name}`; }
// 每月的「对象家族 → 规范文件」（避开 综管/上报区域 重复副本）
const FILES = {
  // [year, month, family, path]
  '2025-08': [['经理', f(2025, 8, '8月主管月度考核（终）.xlsx')], ['管理员', f(2025, 8, '8月管理员考核结果.xlsx')]],
  '2025-09': [['经理', f(2025, 9, '9月主管月度考核结果.xlsx')], ['管理员', f(2025, 9, '9月管理员月度考核结果.xlsx')]],
  '2025-10': [['经理', f(2025, 10, '10月乡镇作业中心经理月度考核.xlsx')], ['管理员', f(2025, 10, '10月管理员月度考核结果.xlsx')]],
  '2025-11': [['经理', f(2025, 11, '11月乡镇作业中心经理月度考核结果.xlsx')], ['管理员', f(2025, 11, '11月管理员月度考核结果(1).xlsx')]],
  '2025-12': [['经理', f(2025, 12, '12月乡镇作业中心经理月度考核结果(2).xlsx')], ['管理员', f(2025, 12, '12月管理员月度考核结果.xlsx')]],
  '2026-01': [['经理', f(2026, 1, '1月乡镇作业中心经理月度考核结果.xlsx')], ['管理员', f(2026, 1, '1月管理员月度考核结果(1).xlsx')]],
  '2026-02': [['经理', f(2026, 2, '2月乡镇作业中心经理月度考核结果(1).xlsx')], ['管理员', f(2026, 2, '2月管理员月度考核结果(1).xlsx')]],
  '2026-03': [['经理', f(2026, 3, '3月乡镇作业中心经理月度考核结果(3).xlsx')], ['管理员', f(2026, 3, '3月管理员月度考核结果(1).xlsx')]],
  '2026-04': [['经理', f(2026, 4, '4月乡镇作业中心经理月度考核结果.xlsx')], ['管理员', f(2026, 4, '4月管理员月度考核结果.xlsx')]],
  '2026-05': [['经理', f(2026, 5, '5月乡镇作业中心经理月度考核结果.xlsx')], ['管理员', f(2026, 5, '5月管理员月度考核结果.xlsx')]],
  '2026-06': [['经理', f(2026, 6, '6月乡镇作业中心经理月度考核结果.xlsx')], ['管理员', f(2026, 6, '6月管理员月度考核结果.xlsx')]],
  '2026-07': [['经理', f(2026, 7, '7月乡镇作业中心经理月度考核结果.xlsx')], ['管理员', f(2026, 7, '7月管理员月度考核结果.xlsx')]],
};

// ---------- 2) 数值解析 ----------
function num(v) {
  if (v === undefined || v === null) return 0;
  const s = String(v).trim();
  if (!s || s === '/' || s === '-' || s === '—' || s === '无') return 0;
  const n = Number(s.replace(/[¥,％%]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

// 从表中读取某对象家族的人群行: [{name, cats:{安全文化建设, HSE教育培训, 驾驶员, 转运站, 三违, 否决}, sum, score}]
function readFamily(rows, family) {
  // 找到含「姓名」的行（明细表头行）
  const hIdx = rows.findIndex((r) => Array.isArray(r) && r.includes('姓名'));
  if (hIdx < 0) return [];
  const nameCol = rows[hIdx].indexOf('姓名');
  const out = [];
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const name = String(r[nameCol] || '').trim();
    if (!name || name === '/' || name === '-') continue;
    if (/^\d+幸\d+$/.test(name)) continue; // 排除序号误读
    if (family === '经理') {
      out.push({
        name,
        cats: {
          safety: num(r[nameCol + 1]),         // 安全文化建设
          hse: num(r[nameCol + 2]) + num(r[nameCol + 3]), // HSE教育培训(晨会+培训记录)
          driver: num(r[nameCol + 4]),         // 现场管理-驾驶员
          transfer: num(r[nameCol + 5]),       // 现场管理-转运站
          fire: num(r[nameCol + 6]),           // 消防（不可对齐，备查）
          sanwei: num(r[nameCol + 7]),         // 三违
          veto: num(r[nameCol + 8]),           // 否决项
        },
        sum: num(r[nameCol + 14]),
        score: num(r[nameCol + 15]),
      });
    } else {
      out.push({
        name,
        cats: {
          duty1: num(r[nameCol + 1]),          // 目标职责-目标责任书（不可对齐）
          duty2: num(r[nameCol + 2]),          // 目标职责-专项主题活动（≈安全文化建设,近似对齐）
          safety: num(r[nameCol + 2]),
          hse: num(r[nameCol + 3]) + num(r[nameCol + 4]) + num(r[nameCol + 5]),
          sanwei: num(r[nameCol + 6]),
          veto: num(r[nameCol + 7]),
        },
        sum: num(r[nameCol + 11]),
        score: num(r[nameCol + 12]),
      });
    }
  }
  return out;
}

// 对齐映射: family -> Excel category → system category
const ALIGN = {
  经理: [
    ['safety', '安全文化建设'],
    ['hse', 'HSE教育培训'],
    ['driver', '现场管理-驾驶员管理'],
    ['transfer', '现场管理-转运站管理'],
    ['sanwei', '三违管理'],
    ['veto', '否决项'],
  ],
  管理员: [
    ['safety', '安全文化建设'],
    ['hse', 'HSE教育培训'],
    ['sanwei', '三违管理'],
    ['veto', '否决项'],
  ],
};

// ---------- 3) 读库：周期 + 考核对象 + 分类自动扣分 ----------
async function loadDb() {
  const cycles = (await pool.query(
    `SELECT id, assessment_year, assessment_month FROM hse_assessment_cycle
      WHERE is_deleted = FALSE AND (assessment_year > 2025 OR (assessment_year = 2025 AND assessment_month >= 8))
        AND (assessment_year < 2026 OR (assessment_year = 2026 AND assessment_month <= 7))`
  )).rows;
  const cycleBy = {};
  for (const c of cycles) cycleBy[`${c.assessment_year}-${String(c.assessment_month).padStart(2, '0')}`] = c.id;

  const dedRows = (await pool.query(
    `SELECT d.cycle_id, t.employee_name, t.position,
            COALESCE(NULLIF(d.confirmed_score,0), d.suggested_score, 0) AS eff,
            d.source_detail->>'category' AS cat,
            d.review_status, d.is_deleted
       FROM hse_assessment_deduction d
       JOIN hse_assessment_target t ON t.id = d.target_id
      WHERE d.cycle_id = ANY($1::int[]) AND d.deduction_source = 'auto'`
    , [Object.values(cycleBy)]
  )).rows;

  // 对象: cycle -> name -> position
  const targets = (await pool.query(
    `SELECT cycle_id, employee_name, position FROM hse_assessment_target
      WHERE cycle_id = ANY($1::int[]) AND is_deleted = FALSE AND status = 'active'`
    , [Object.values(cycleBy)]
  )).rows;

  const dedByCycleNameCat = {};
  for (const d of dedRows) {
    if (d.is_deleted) continue;
    if (!d.cat) continue;
    const k = `${d.cycle_id}|${d.employee_name}|${d.cat}`;
    dedByCycleNameCat[k] = (dedByCycleNameCat[k] || 0) + d.eff;
  }
  return { cycleBy, dedByCycleNameCat, targets };
}

// ---------- 4) 主流程 ----------
(async () => {
  await db.testConnection();
  const { cycleBy, dedByCycleNameCat, targets } = await loadDb();

  const lines = [];
  const push = (s = '') => { lines.push(s); };
  const report = [];
  let totalDesc = 0, totalLines = 0, aOk = 0, aDiff = 0, aMissing = 0;

  for (const [ym, famFiles] of Object.entries(FILES)) {
    const year = Number(ym.slice(0, 4));
    const month = Number(ym.slice(5, 7));
    const cyc = cycleBy[ym];
    const targetNames = {};
    if (cyc) for (const t of targets.filter((x) => x.cycle_id === cyc)) targetNames[t.employee_name] = t.position;

    push(`\n## ${ym}`);
    for (const [family, path] of famFiles) {
      let rows;
      try {
        const wb = XLSX.readFile(path);
        const sheet = wb.SheetNames.find((s) => /考核|总结|汇总|评分/.test(s)) || wb.SheetNames[0];
        rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, raw: false, defval: '' });
      } catch (e) {
        push(`  [${family}] 解析失败: ${e.message}`);
        continue;
      }
      const people = readFamily(rows, family);
      push(`  ### ${family}（${people.length} 人）`);
      if (!people.length) { push('    （无有效人员行）'); continue; }

      for (const p of people) {
        totalLines++;
        for (const [exKey, sysCat] of ALIGN[family]) {
          const excelV = p.cats[exKey];
          if (excelV === 0 && !(sysCat === '否决项' || p.cats.fire || p.cats.sanwei)) continue; // 两边都为0的空对比不逐条列出
          const sysV = cyc ? (dedByCycleNameCat[`${cyc}|${p.name}|${sysCat}`] || 0) : null;
          const pos = targetNames[p.name] || (family === '经理' ? '乡镇作业中心经理' : '管理员');
          totalDesc++;
          let flag = '✅';
          if (sysV === null) { flag = '⚠️缺对象'; aMissing++; }
          else if (Math.abs(sysV - excelV) < 0.001) { aOk++; }
          else { flag = '❌差异'; aDiff++; }
          report.push({ ym, family, name: p.name, sysCat, excel: excelV, system: sysV === null ? '-' : sysV, flag, pos });
          push(`    ${flag} ${p.name} ${sysCat}：Excel=${excelV} 系统=${sysV === null ? '无对象' : sysV}`);
        }
      }
    }
  }

  // ---- 4) 聚合视图：family × category × month 一致性矩阵 ----
  const matrix = {}; // key=`family|cat` -> { month: [ok, diff, onlyExcel, onlySys] }
  for (const r of report) {
    const mk = `${r.family}|${r.sysCat}`;
    matrix[mk] = matrix[mk] || {};
    const mm = matrix[mk];
    mm[r.ym] = mm[r.ym] || [0, 0, 0, 0];
    const cell = mm[r.ym];
    if (r.flag === '✅') cell[0]++;
    else if (r.flag === '❌差异') {
      if (r.excel > 0 && r.system > 0) cell[1]++;
      else if (r.system === 0) cell[2]++;   // 仅Excel有
      else if (r.excel === 0) cell[3]++;    // 仅系统有
    }
  }
  const months = Object.keys(FILES);
  push('\n\n======== 一致性矩阵（family×类别×月份）========');
  push('单元格：[一致|差>0|仅Excel|仅系统]');
  for (const [mk, mm] of Object.entries(matrix)) {
    const [fam, cat] = mk.split('|');
    let row = `${fam}｜${cat}`.padEnd(26);
    for (const m of months) {
      const c = mm[m];
      row += c ? `|${c.join('/')}` : '|--';
    }
    push(row);
    console.log(row);
  }

  // ---- 5) 汇总 ----
  console.log('\n======== 汇总 ========');
  console.log(`明细对比次数: ${totalDesc}  | 一致 ${aOk} | 差异 ${aDiff} | 无系统对象 ${aMissing}`);
  const rev = report.filter((x) => x.flag === '❌差异' && x.excel === 0 && x.system > 0);
  const onlyExcel = report.filter((x) => x.flag === '❌差异' && x.system === 0 && x.excel > 0);
  const both = report.filter((x) => x.flag === '❌差异' && x.excel > 0 && x.system > 0);
  console.log(`其中：仅Excel有扣分系统为0 ${onlyExcel.length} | 仅系统有Excel为0 ${rev.length} | 两者都有但数值不同 ${both.length}`);
  push(`汇总: 对比 ${totalDesc} | 一致 ${aOk} | 差异 ${aDiff}（仅Excel ${onlyExcel.length} / 仅系统 ${rev.length} / 数值不同 ${both.length}）`);
  console.log(`\n差异明细:`);
  for (const r of report.filter((x) => x.flag !== '✅')) {
    console.log(`  ${r.flag} ${r.ym} ${r.family} ${r.name} ${r.sysCat}：Excel=${r.excel} 系统=${r.system}`);
  }

  fs.writeFileSync('g:/hse-dashboard/server/hse考核对账报告.md', lines.join('\n'), 'utf8');
  console.log('\n已写入 hse考核对账报告.md');
  process.exit(0);
})().catch((e) => { console.error('ERR', e); process.exit(1); });
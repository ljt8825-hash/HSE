/**
 * 安全文化建设「专项活动台帐」导入 —— 共享实现
 *  路由 /import 与批量回填脚本共用同一份解析+写库逻辑，避免口径分叉。
 *
 * 目录组织：<根> / <YYYY>年 / <M>月 / 「乡镇作业中心经理月度考核」*.xlsx
 * 仅导入文件名含「乡镇作业中心经理」的文件；只解析含「专项活动台(账|帐)」工作表的表。
 * 每月表头/活动项不同 → 动态识别活动列（排除 序号/乡镇/岗位/姓名/扣分 等元数据列）。
 * 扣分口径：manual_deduct>0 优先；否则未开展项×unit（页面/引擎再被类别上限钳制）。
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { pool } = require('../config/db');

// 「专项活动台帐」来源目录：默认 F:\宁津北控\27、HSE月度考核，可用 SAFETY_CULTURE_SOURCE_DIR 覆盖
const BASE_DIR = process.env.SAFETY_CULTURE_SOURCE_DIR || 'F:/宁津北控/27、HSE月度考核';

// 元数据列（非活动项）排除依据；其余非空表头列均视为当月专项活动项
const META_HEADER_RE = /^(序号|编号|所属乡镇|乡镇|单位|区域|班组|岗位|职务|姓名|扣分|实际扣分|备注|总成绩|总扣分|得分|评价|意见|签字)$/;

// 活动名缩短规则（列名过长易顶开，简化为能表达活动含义的短名；未命中的做通用压缩）
const ABBREV = [
  { match: '2025年交通安全专项行动', short: '交通安全专项行动' },
  { match: '2025年直管干部能力提升行动', short: '直管干部能力提升' },
  { match: '2025全员安全生产责任制深化落地', short: '安全生产责任制深化' },
  { match: '安全操作规程标准化升级', short: '安全操作规程' },
  { match: '开展风险防控与隐患清零专项行动', short: '风险防控与隐患清零' },
  { match: '电动三轮车安全驾驶专项行动', short: '电动三轮车安全驾驶' },
  { match: '交通安全危险因素识别清单', short: '交通安全风险识别' },
  { match: '两会', short: '春节两会安全管理' },
  { match: '春节', short: '春节两会安全管理' },
  { match: '“三违”专项活动', short: '三违专项活动' },
  { match: '并桶、更换点位', short: '并桶更换点位' },
  { match: '并桶', short: '并桶更换点位' },
];

function shortenActivity(label) {
  for (const r of ABBREV) {
    if (r.match && label.includes(r.match) && r.short) return r.short;
  }
  // 通用压缩：去年份前缀/顿号空格，超长截断
  let s = String(label).replace(/20\d{2}年/g, '').replace(/[、，,/\s]+/g, '');
  return s.length > 14 ? `${s.slice(0, 14)}…` : s;
}

function normHeader(h) {
  return String(h == null ? '' : h)
    .replace(/[\s　]+/g, '')
    .replace(/["“”‘’`'，,。；;:：]/g, '')
    .replace(/[（）()【】[\]{}]/g, '');
}
function isTick(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return false;
  return s === '√' || s === '✓' || s === '是' || s === 'Y' || s === 'y' || s === '1';
}
function normalizeLevel(s) {
  if (!s) return '乡镇主管';
  const t = String(s).trim();
  if (t.includes('管理员')) return '管理员';
  if (t.includes('主管') || t.includes('经理') || t.includes('网格长')) return '乡镇主管';
  return t;
}
function normMonth2(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}
function monthDir(year, month) {
  return path.join(BASE_DIR, `${year}年`, `${month}月`);
}

// 动态识别活动列：索引列号 -> { key(归一化), label(展示名), group(分组父级名|null) }
// 兼容 Excel 双层表头（如「安全生产月活动」组下含 悬挂横幅/应急演练/应急演练签到表 等子项）：
//   - label 优先取副表头行 subRow[c] 的「叶子活动名」，否则取主表头名，从而把分组展开为独立子项列；
//   - group = 叶子名来自副表头时的主表头「组」名（合并单元格在主表头仅首个子列有值，
//     其余子列留空 → 用 lastMain 回填），单层表头月份 group 恒为 null。
function indexActivityCols(rows, headIdx, subRow, subIsData) {
  const acts = {};
  const width = Math.max(rows[headIdx].length, subRow ? subRow.length : 0);
  let lastMain = ''; // 最近出现的非空主表头名，作为合并单元格下子项的「组」名
  for (let c = 0; c < width; c++) {
    const mainLabel = String(rows[headIdx][c] == null ? '' : rows[headIdx][c]).trim();
    // 副表头行有效（非数据行）时，用其子项名作为叶子名
    const subLabel =
      subRow && !subIsData ? String(subRow[c] == null ? '' : subRow[c]).trim() : '';
    if (mainLabel) lastMain = mainLabel;
    const label = subLabel || mainLabel;
    if (!label) continue;
    const key = normHeader(label);
    if (!key || META_HEADER_RE.test(key)) continue;
    // 叶子名来自副表头且存在组名 → 归属分组；否则为独立活动（无分组）
    acts[c] = {
      key,
      label,
      group: subLabel && lastMain ? shortenActivity(lastMain) : null,
    };
  }
  return acts;
}

function indexHeaders(rows) {
  let headIdx = -1;
  let townshipIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].join(',').includes('姓名')) { headIdx = i; break; }
  }
  if (headIdx < 0) return null;
  // 识别「所属乡镇/作业中心」列，兼容两种版式：
  //   A) 单表头行内直接含「所属乡镇」（如 2025-10 / 2026-02）
  //   B) 表头下方另有一行「序号|所属乡镇」副表头（如 2026-07 等大多数月份，且第二行为副表头时优先于主表头）
  const findTownship = (r) => {
    let c = -1;
    r.forEach((h, i) => {
      const k = normHeader(h);
      if (/^(所属乡镇|作业中心|乡镇|单位|区域|片区)$/.test(k)) c = i;
    });
    return c;
  };
  let townshipCol = findTownship(rows[headIdx]);
  if (
    rows[headIdx + 1] &&
    String(rows[headIdx + 1].join(',').replace(/\s/g, '')).includes('所属乡镇')
  ) {
    const c2 = findTownship(rows[headIdx + 1]);
    if (c2 >= 0) {
      townshipIdx = headIdx + 1;
      townshipCol = c2;
    }
  }
  const idx = { headIdx, townshipIdx, townshipCol, name: -1, level: -1, manually: -1, actCols: {} };
  rows[headIdx].forEach((h, c) => {
    const key = normHeader(h);
    if (!key) return;
    if (key.includes('姓名')) idx.name = c;
    else if (key === '岗位' || key.includes('岗位') || key === '职务') idx.level = c;
    else if (key === '扣分' || key === '实际扣分') idx.manually = c;
  });
  // 副表头行（主表头下一行）：可能承载「分组下的叶子活动名」与「扣分列」（如 2025-11 扣分在副表头）。
  // 仅当该行不是数据行（姓名列为空）时才视为副表头，避免把普通单表头月份的首行数据当子表头。
  const rawSub = rows[headIdx + 1];
  const subIsData = !!(idx.name >= 0 && rawSub && String(rawSub[idx.name] || '').trim());
  // 扣分列：主表头优先，其次副表头
  if (idx.manually < 0 && rawSub) {
    rawSub.forEach((h, c) => {
      const key = normHeader(h);
      if (idx.manually >= 0) return;
      if (key === '扣分' || key === '实际扣分') idx.manually = c;
    });
  }
  idx.actCols = indexActivityCols(rows, headIdx, rawSub, subIsData);
  idx.importable = idx.name >= 0;
  return idx;
}

/**
 * 导入单个月份（全量覆盖该月旧行）。
 * @param {string} monthStr 'YYYY-MM'
 * @returns {Promise<{month:string;imported:number;unmatched:number;fullMarks?:boolean;fullMarksNote?:string;sheetsProcessed:object[];skippedFiles:object[]}>}}
 * @throws 目录/文件不存在或 DB 错误时抛错（fullMarks 场景不抛）
 */
async function runImport(monthStr) {
  const [year, mon] = String(monthStr).split('-').map((n) => Number(n));
  const dir = monthDir(year, mon);
  if (!fs.existsSync(dir)) {
    const err = new Error(`未找到目标目录：${dir}`);
    err.status = 400;
    throw err;
  }
  const files = fs
    .readdirSync(dir)
    .filter((n) => !String(n).startsWith('~$'))
    .filter((n) => /\.(xlsx|xls)$/i.test(n))
    .filter((n) => String(n).includes('乡镇作业中心经理'));
  if (!files.length) {
    const err = new Error(`目录 ${dir} 下未找到「乡镇作业中心经理月度考核」Excel 文件`);
    err.status = 400;
    throw err;
  }

  const raw = [];
  const sheetsProcessed = [];
  const skippedFiles = [];

  for (const fn of files) {
    const fp = path.join(dir, fn);
    const wb = XLSX.readFile(fp);
    const sheetName = (wb.SheetNames || []).find((n) => String(n).includes('专项活动台'));
    if (!sheetName) {
      skippedFiles.push({ file: fn, reason: '无「专项活动台帐」工作表' });
      continue;
    }
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '', raw: true });
    const idx = indexHeaders(rows);
    if (!idx || !idx.importable) {
      skippedFiles.push({ file: fn, sheet: sheetName, reason: '未识别到「姓名」列，无法导入' });
      continue;
    }
    sheetsProcessed.push({ file: fn, sheet: sheetName });
    for (let i = idx.headIdx + 1 + (idx.townshipIdx >= 0 ? 1 : 0); i < rows.length; i++) {
      const r = rows[i];
      const name = String(r[idx.name] || '').trim();
      // 跳过空行 / 占位符（如「/」「-」「无」等非真实姓名），避免把无姓名的乡镇混入台账
      if (!name || /^[/\-—无·.．:：、，,；;]+$/.test(name)) continue;
      const dept = String(idx.townshipCol >= 0 ? r[idx.townshipCol] : r[idx.townshipIdx] || '').trim();
      const level = normalizeLevel(r[idx.level]);
      const activities = {};
      const activityGroups = []; // 有序数组，保留 Excel 列序 + 分组（用于前端渲染合并表头）
      const legacy = { act_three_violation: 0, act_duty_safety: 0, act_traffic_risk: 0 };
      for (const c of Object.keys(idx.actCols)) {
        const meta = idx.actCols[c];
        const done = c >= 0 ? (isTick(r[c]) ? 1 : 0) : 0;
        // 列名（活动名）可能过长 → 缩写后再做为列名展示，保证表达活动含义且不顶开
        const name = shortenActivity(meta.label);
        activities[name] = done;
        activityGroups.push({ name, done, group: meta.group || null });
        if (meta.key.includes('三违')) legacy.act_three_violation = Math.max(legacy.act_three_violation, done);
        if (meta.key.includes('轮值')) legacy.act_duty_safety = Math.max(legacy.act_duty_safety, done);
        if (meta.key.includes('交通') || meta.key.includes('危险因素')) legacy.act_traffic_risk = Math.max(legacy.act_traffic_risk, done);
      }
      let manual = 0;
      if (idx.manually != null && idx.manually >= 0) {
        const n = Number(r[idx.manually]);
        manual = Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
      }
      raw.push({ level, dept, name, manual, has_manual_col: idx.manually != null && idx.manually >= 0, activities, activityGroups, legacy });
    }
  }

  if (!raw.length) {
    return {
      month: monthStr, imported: 0, unmatched: 0,
      fullMarks: true,
      fullMarksNote: '该月无「专项活动台帐」工作表，视为满分（0扣分）',
      sheetsProcessed, skippedFiles,
    };
  }

  const client = await pool.connect();
  let imported = 0;
  let unmatched = 0;
  try {
    await client.query('BEGIN');
    // 1) 软删该月旧行（全量覆盖）
    await client.query(
      `UPDATE hse_safety_culture_monthly SET is_deleted = TRUE WHERE month = $1 AND is_deleted = FALSE`,
      [monthStr]
    );
    // 2) 插入新行
    for (const row of raw.sort((a, b) => a.dept.localeCompare(b.dept, 'zh-Hans-CN'))) {
      const employeeId = await matchEmployeeId(client, { name: row.name, level: row.level, dept: row.dept || '' });
      if (employeeId == null) unmatched++;
      await client.query(
        `INSERT INTO hse_safety_culture_monthly
           (month, level, dept, name, employee_id, activities, activity_groups,
            act_three_violation, act_duty_safety, act_traffic_risk, manual_deduct, has_manual_col, is_deleted)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,FALSE)
         ON CONFLICT (month, level, name) DO UPDATE
            SET dept=EXCLUDED.dept, employee_id=EXCLUDED.employee_id,
                activities=EXCLUDED.activities,
                activity_groups=EXCLUDED.activity_groups,
                act_three_violation=EXCLUDED.act_three_violation,
                act_duty_safety=EXCLUDED.act_duty_safety,
                act_traffic_risk=EXCLUDED.act_traffic_risk,
                manual_deduct=EXCLUDED.manual_deduct, has_manual_col=EXCLUDED.has_manual_col, is_deleted=FALSE`,
        [monthStr, row.level, row.dept, row.name, employeeId,
         JSON.stringify(row.activities), JSON.stringify(row.activityGroups),
         row.legacy.act_three_violation, row.legacy.act_duty_safety, row.legacy.act_traffic_risk, row.manual,
         row.has_manual_col]
      );
      imported++;
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return { month: monthStr, imported, unmatched, sheetsProcessed, skippedFiles };
}

/**
 * 按 姓名+岗位+乡镇 匹配考核对象 employee_id（导入与手动录入共用的唯一口径）。
 * @param {import('pg').PoolClient} client 已开启的事务/连接客户端
 * @param {{name:string; level:string; dept?:string}} args
 * @returns {Promise<number|null>}
 */
async function matchEmployeeId(client, { name, level, dept = '' }) {
  const position = level === '管理员' ? '管理员' : '乡镇作业中心经理';
  const rows = await client.query(
    `SELECT employee_id FROM v_employee_org_full
      WHERE relation_status = 'active' AND name = $1 AND position_name = $2
      ORDER BY org_name = $3 DESC, employee_id LIMIT 1`,
    [name, position, dept]
  );
  return rows.rows.length ? rows.rows[0].employee_id : null;
}

module.exports = { runImport, monthDir, normMonth2, matchEmployeeId, normalizeLevel };
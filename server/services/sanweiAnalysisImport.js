/**
 * 三违分析「三违照片信息统计台账」月度分数导入 —— 共享实现（乡镇作业中心经理版）
 *  路由 /import 与批量回填脚本共用同一份解析+写库逻辑，避免口径分叉。
 *
 * 目录组织：<根> / <YYYY>年 / <M>月 / 「乡镇作业中心经理(或主管)月度考核」*.xlsx
 * 仅导入文件名含「乡镇作业中心经理」或「主管」的文件；只解析含「三违照片」工作表的表。
 * 工作表「三违照片信息统计台账」结构（2025-08 / 2025-10 / 2026-07 实测一致）：
 *   - 第 1 行：12 个乡镇名，位于奇数列（B,D,F,…），每乡镇下挂「照片」「违章信息」两子列
 *   - 第 2 行：每乡镇下 照片 | 违章信息 子表头
 *   - 第 3~33 行：每日 √/×（×=未完成三违照片上报；「信息不全」视为未完成）
 *   - 倒数第 2 行「总」= 各镇照片/违章信息 未完成(×)次数
 *   - 最后一行「扣分」= 各镇当月三违考核扣分（照片子列×2分、违章信息子列×1分）
 * 照片/违章信息未完成数分别取「总」行两子列；三违考核分数=「扣分」行 照片列+违章信息列 之和。空值视为 0。
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { pool } = require('../config/db');

// 「三违照片信息统计台账」来源目录：默认 G:\safety_vault\04_现场管理\27、HSE月度考核，可用 SANWEI_SOURCE_DIR 覆盖
const BASE_DIR = process.env.SANWEI_SOURCE_DIR || 'G:/safety_vault/04_现场管理/27、HSE月度考核';

function normMonth2(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}
function monthDir(year, month) {
  return path.join(BASE_DIR, `${year}年`, `${month}月`);
}

// 归一化用于单元格比较
function cellStr(v) {
  return String(v == null ? '' : v).trim();
}

/**
 * 从「三违照片信息统计台账」sheet 解析：乡镇 -> { photoDefect, infoDefect, score }
 * 每个乡镇占两列：col=照片子列（乡镇名起始列），col+1=违章信息子列。
 * 返回 null 表示无法识别（无乡镇表头或无扣分行）。
 * @param {Array<Array<any>>} rows sheet_to_json(header:1) 结果
 * @returns {Object|null} { towns: [{town, col, photoDefect, infoDefect, score}], sheetHeaderRow, scoreRow }
 */
function parseSanweiSheet(rows) {
  if (!rows || !rows.length) return null;

  // 找「扣分」行与「总」行：首格（col0）文本匹配的整行
  let scoreRow = -1;
  let totalRow = -1;
  for (let i = 0; i < rows.length; i++) {
    const first = cellStr(rows[i] && rows[i][0]);
    if (first === '扣分') scoreRow = scoreRow < 0 ? i : scoreRow;
    if (first === '总') totalRow = totalRow < 0 ? i : totalRow;
  }
  if (scoreRow < 0) return null;

  // 找乡镇表头行：默认第 1 行（index0）；若其上非乡镇名则回找首个含 ≥4 个文本单元格的行
  const townLike = (v) => {
    const s = cellStr(v);
    return (
      !!s &&
      !/^(照片|违章信息|总|扣分|备注|√|×|✓)$/.test(s) &&
      !/^\d+$/.test(s) &&
      // 排除「8月」「9月」这类单元格（乡镇名不含「月」字）
      !/[0-9０-９]+月/.test(s) &&
      !s.startsWith('~')
    );
  };
  let townRow = 0;
  let towns = [];
  if (!Array.isArray(rows[0])) return null;
  // 第 1 行即可满足（2025-10 / 2026-07 均如此）；否则扫描
  const candidates = rows[0].map(townLike).filter(Boolean).length >= 4
    ? [0]
    : rows
        .map((r, i) => ({ i, n: (r || []).map(townLike).filter(Boolean).length }))
        .filter((x) => x.n >= 4)
        .map((x) => x.i);
  townRow = candidates[0] ?? -1;
  if (townRow < 0) return null;
  rows[townRow].forEach((v, c) => {
    if (townLike(v)) towns.push({ town: cellStr(v), col: c, photoDefect: 0, infoDefect: 0, score: 0 });
  });
  towns.sort((a, b) => a.col - b.col);
  if (!towns.length) return null;

  // 子列取值工具：仅认「总」/「扣分」行的数字
  const numOf = (rowArr, col, defaultVal) => {
    if (!Array.isArray(rowArr)) return defaultVal;
    const n = Number(rowArr[col]);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : defaultVal;
  };

  for (const t of towns) {
    const photoCol = t.col;        // 照片子列
    const infoCol = t.col + 1;     // 违章信息子列
    // 未完成次数（×数）
    t.photoDefect = numOf(rows[totalRow], photoCol, 0);
    t.infoDefect = numOf(rows[totalRow], infoCol, 0);
    // 三违考核分数 = 照片扣分 + 违章信息扣分（Excel 扣分行两子列之和）
    const photoScore = numOf(rows[scoreRow], photoCol, 0);
    const infoScore = numOf(rows[scoreRow], infoCol, 0);
    t.score = Math.round((photoScore + infoScore) * 100) / 100;
  }
  return { towns, sheetHeaderRow: townRow, scoreRow };
}

/**
 * 按乡镇回填「乡镇作业中心经理」姓名与 employee_id。
 * 考核对象/组织名称为「<乡镇>作业中心」形态（如 柴胡店镇作业中心），故用 LIKE 子串匹配。
 * 优先 hse_assessment_target（position='乡镇作业中心经理'）；否则回退 v_employee_org_full。
 */
async function resolveManager(client, town) {
  try {
    const r = await client.query(
      `SELECT employee_id, employee_name AS name
         FROM hse_assessment_target
        WHERE is_deleted = FALSE AND position = '乡镇作业中心经理'
          AND township LIKE '%' || $1 || '%'
        ORDER BY id DESC LIMIT 1`,
      [town]
    );
    if (r.rows.length) return { employeeId: r.rows[0].employee_id, managerName: r.rows[0].name };
  } catch { /* 表缺失时回退员工视图 */ }
  try {
    const r = await client.query(
      `SELECT employee_id, name
         FROM v_employee_org_full
        WHERE relation_status = 'active' AND position_name = '乡镇作业中心经理'
          AND org_name LIKE '%' || $1 || '%'
        ORDER BY employee_id LIMIT 1`,
      [town]
    );
    if (r.rows.length) return { employeeId: r.rows[0].employee_id, managerName: r.rows[0].name };
  } catch { /* ignore */ }
  return { employeeId: null, managerName: null };
}

/**
 * 导入单个月份（全量覆盖该月旧行）。
 * @param {string} monthStr 'YYYY-MM'
 * @returns {Promise<{month:string;imported:number;unmatched:number;sheetsProcessed:object[];skippedFiles:object[];towns:object[]}>}
 * @throws 目录/文件不存在或 DB 错误时抛错
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
    // 主管即乡镇作业中心经理：文件名含「乡镇作业中心经理」或「主管」均可作为三违分数来源（排除「管理员」等）
    .filter((n) => /乡镇作业中心经理|主管/.test(String(n)));
  if (!files.length) {
    const err = new Error(`目录 ${dir} 下未找到「乡镇作业中心经理月度考核」Excel 文件`);
    err.status = 400;
    throw err;
  }

  const towns = [];
  const sheetsProcessed = [];
  const skippedFiles = [];

  for (const fn of files) {
    const fp = path.join(dir, fn);
    const wb = XLSX.readFile(fp);
    const sheetName = (wb.SheetNames || []).find((n) => String(n).includes('三违照片'));
    if (!sheetName) {
      skippedFiles.push({ file: fn, reason: '无「三违照片信息统计台账」工作表' });
      continue;
    }
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '', raw: true });
    const parsed = parseSanweiSheet(rows);
    if (!parsed || !parsed.towns.length) {
      skippedFiles.push({ file: fn, sheet: sheetName, reason: '未识别到乡镇表头/扣分行，无法导入' });
      continue;
    }
    sheetsProcessed.push({ file: fn, sheet: sheetName });
    for (const t of parsed.towns) {
      towns.push({
        town: t.town,
        defectCount: t.photoDefect, // 未完成项数口径=照片未完成数（经理版照片=违章）
        photoDefect: t.photoDefect,
        infoDefect: t.infoDefect,
        score: t.score,
      });
    }
  }

  if (!towns.length) {
    return {
      month: monthStr,
      imported: 0,
      unmatched: 0,
      fullMarks: true,
      fullMarksNote: '该月无「三违照片信息统计台账」工作表，视为满分（0扣分）',
      sheetsProcessed,
      skippedFiles,
      towns: [],
    };
  }

  const client = await pool.connect();
  let imported = 0;
  let unmatched = 0;
  const resolvedTowns = [];
  try {
    await client.query('BEGIN');
    // 1) 软删该月旧行（全量覆盖）
    await client.query(
      `UPDATE hse_sanwei_score_monthly SET is_deleted = TRUE WHERE month = $1 AND is_deleted = FALSE`,
      [monthStr]
    );
    // 2) 乡镇排序 + 回填经理 + upsert
    towns.sort((a, b) => a.town.localeCompare(b.town, 'zh-Hans-CN'));
    for (const t of towns) {
      const mgr = await resolveManager(client, t.town);
      if (!mgr.employeeId) unmatched++;
      resolvedTowns.push({ ...t, managerName: mgr.managerName, employeeId: mgr.employeeId });
      await client.query(
        `INSERT INTO hse_sanwei_score_monthly
           (month, town, manager_name, employee_id, defect_count, photo_defect, info_defect, score, is_deleted)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,FALSE)
         ON CONFLICT (month, town) DO UPDATE
            SET manager_name=EXCLUDED.manager_name, employee_id=EXCLUDED.employee_id,
                defect_count=EXCLUDED.defect_count, photo_defect=EXCLUDED.photo_defect,
                info_defect=EXCLUDED.info_defect, score=EXCLUDED.score, is_deleted=FALSE`,
        [monthStr, t.town, mgr.managerName, mgr.employeeId, t.defectCount, t.photoDefect, t.infoDefect, t.score]
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
  return { month: monthStr, imported, unmatched, sheetsProcessed, skippedFiles, towns: resolvedTowns };
}

module.exports = { runImport, monthDir, normMonth2, resolveManager };
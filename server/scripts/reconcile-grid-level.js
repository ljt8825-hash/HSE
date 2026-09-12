/**
 * 网格长巡查台账层级校正（一次性/可重跑）
 *
 * 背景：台账(grid_inspection_records)导入时人员可能把网格级别/职务填错，
 * 同一个人往往有多条历史记录保存了错误层级。本脚本按「检查人姓名」与
 * 网格长巡查管理数据(grid_areas.name)做模糊匹配，命中后把该人名下所有
 * 台账记录的 grid_level(及其 position) 校正为网格管理中的标准值。
 *
 * 与 import.js 导入时自动生成保持一致；仅更新可匹配到网格的姓名，
 * 匹配不上（如已离职、非网格长）的记录保持原值不动。
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { pool } = require('../config/db');

// ===== 与 import.js 保持一致的模糊匹配 =====
function gridLevenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = new Array(n + 1).fill(0).map((_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n];
}
function pickGridArea(areas, inputName) {
  const name = String(inputName || '').trim();
  if (!name) return null;
  const cands = areas.filter((g) => {
    const gn = String(g.name || '').trim();
    if (!gn) return false;
    if (name === gn) return true;
    if (name.includes(gn) || gn.includes(name)) return true;
    if (Math.max(name.length, gn.length) >= 3 && gridLevenshtein(name, gn) <= 1) return true;
    return false;
  });
  if (cands.length === 0) return null;
  return cands[0];
}

(async () => {
  let client;
  try {
    client = await pool.connect();
    const areas = (await client.query(
      `SELECT id, name, grid_level, position FROM grid_areas
       WHERE is_deleted = false AND name IS NOT NULL AND name <> ''`
    )).rows;

    const names = (await client.query(
      `SELECT DISTINCT personnel_name FROM grid_inspection_records
       WHERE personnel_name IS NOT NULL AND personnel_name <> ''`
    )).rows.map((r) => r.personnel_name);

    let updatedRows = 0;
    let matchedNames = 0;
    let unmatchedNames = 0;
    for (const name of names) {
      const area = pickGridArea(areas, name);
      if (!area) { unmatchedNames++; continue; }
      const r = await client.query(
        `UPDATE grid_inspection_records
         SET grid_level = $1, position = $2
         WHERE personnel_name = $3
           AND (grid_level IS DISTINCT FROM $1 OR position IS DISTINCT FROM $2)`,
        [area.grid_level, area.position, name]
      );
      if (r.rowCount > 0) {
        updatedRows += r.rowCount;
        matchedNames++;
        console.log(`  校正 ${name} -> ${area.grid_level}（${area.position}），更新 ${r.rowCount} 条`);
      }
    }
    console.log(`\n完成：共 ${names.length} 个检查人姓名，可匹配网格 ${matchedNames} 人，未匹配 ${unmatchedNames} 人，共更新 ${updatedRows} 条记录`);
  } catch (e) {
    console.error('校正失败:', e.message);
    process.exitCode = 1;
  } finally {
    if (client) client.release();
    await pool.end();
  }
})();
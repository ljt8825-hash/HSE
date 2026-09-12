/**
 * 三违分析「三违台账」数据派生 —— 月度自动延续（乡镇作业中心经理版）
 *
 * 诉求：后期系统录入(而非 Excel 导入)时，每个月自动生成延续上个月的页面，供人工在系统里修改。
 * 实现：
 *   1) 从「三违台账」数据源（网格长巡查台账 grid_inspection_records）聚合出目标月各乡镇的
 *      真三违(排除「无三违行为」)未完成整改条数 → defectCount / score；
 *   2) 未被目标月聚合覆盖、但上一个月台账中存在的乡镇，则延续上一个月的数据（保证页面完整）。
 *
 * 聚合口径对齐「三违台账」菜单（getGridInspectionList / site-mgmt.js hasViolation）：
 *   - violation_behavior 非空且非「无三违行为 / -- / - / 无」
 *   - 记录归属乡镇 = area_team 最长前缀匹配候选乡镇（兼容「保店镇一班」→「保店镇」）
 *   - 未完成整改 = rectified_photo 为空或占位（-- / - / 无）
 *   - 每起未完成整改计 1 分（原始分，需评分引擎另做类别上限钳制则由上层负责）
 */
const { pool } = require('../config/db');

// 分值：每起未完成整改 = 1 分
const SCORE_PER_DEFECT = 1;

/**
 * 聚合 grid_inspection_records 生成目标月三违台账（未完成整改条数 → 乡镇）。
 * 仅返回目标月有未完成整改的乡镇；无整改数据月返回 towns=[]（由调用方回退延续上月）。
 * @param {import('pg').PoolClient} client 当前事务/连接客户端
 * @param {string} monthStr 'YYYY-MM'
 * @returns {Promise<{ towns: Array<{ town: string; defectCount: number; score: number }> }>}
 */
async function deriveMonth(client, monthStr) {
  // 1) 该月真三违明细（复用「三违台账」口径；grid_inspection_records 无软删列，直接全量）
  const { rows: records } = await client.query(
    `SELECT area_team, rectified_photo
       FROM grid_inspection_records
      WHERE to_char(inspection_date::date, 'YYYY-MM') = $1
        AND violation_behavior IS NOT NULL
        AND TRIM(violation_behavior) <> ''
        AND violation_behavior NOT IN ('无三违行为', '--', '-', '无')`,
    [monthStr]
  );

  // 2) 候选乡镇列表（考核对象中乡镇作业中心经理的 township，DISTINCT）
  const { rows: targets } = await client.query(
    `SELECT DISTINCT township
       FROM hse_assessment_target
      WHERE is_deleted = FALSE AND position = '乡镇作业中心经理'`
  );
  const candidateTowns = targets.map((t) => t.township).filter(Boolean);

  // 3) 记录→乡镇归因（双向互含匹配：兼容「保店镇一班」→「保店镇」与「保店镇」→「保店镇作业中心」）
  const townDefects = new Map();
  for (const record of records) {
    const areaTeam = (record.area_team || '').trim();
    if (!areaTeam) continue;

    let matchedTown = null;
    let maxLen = 0;
    for (const town of candidateTowns) {
      if ((areaTeam.includes(town) || town.includes(areaTeam)) && town.length > maxLen) {
        matchedTown = town;
        maxLen = town.length;
      }
    }
    if (!matchedTown) continue;

    // 未完成整改 = rectified_photo 为空或占位
    const rectified = (record.rectified_photo || '').trim();
    const isDefect = !rectified || ['--', '-', '无'].includes(rectified);
    if (isDefect) townDefects.set(matchedTown, (townDefects.get(matchedTown) || 0) + 1);
  }

  // 4) 分数
  const towns = Array.from(townDefects.entries()).map(([town, defectCount]) => ({
    town,
    defectCount,
    score: defectCount * SCORE_PER_DEFECT,
  }));

  return { towns };
}

module.exports = { deriveMonth };
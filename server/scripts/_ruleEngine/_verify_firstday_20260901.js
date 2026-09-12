/**
 * 9/1 首日实战核验 · 只读取证脚本（提示词-13 任务 A.4 + C）
 *
 * 全脚本仅执行 SELECT，不产生任何写入。输出用于执行报告-13 取证。
 * 覆盖：
 *   A.4 周期唯一性（HSE-CYCLE-202609 应仅 id=43 一行有效）
 *   C.1 cycle43 扣分行数/分值（按 source_table 分组）
 *   C.2 cycle43 得分行数与状态
 *   C.3 cycle24 parity（网格 54/103.00/全pending、三违 0）
 *   C.4 规则观测实值（R000001 / VIOLATION003 的 9 个可观测列）
 *   C.5 last_run_cycle_code 标量子查询（对应接口 lastRunCycleCode）
 *
 * 运行：node server/scripts/_ruleEngine/_verify_firstday_20260901.js
 */
const { pool } = require('../../config/db');

async function q(label, sql, params = []) {
  try {
    const r = await pool.query(sql, params);
    console.log(`\n=== ${label} ===`);
    console.log(JSON.stringify(r.rows, null, 2));
    return r.rows;
  } catch (e) {
    console.log(`\n=== ${label} ===`);
    console.log('ERR ' + e.message);
    return [];
  }
}

(async () => {
  try {
    // A.4 周期唯一性
    await q(
      'A.4 周期唯一性 HSE-CYCLE-202609',
      `SELECT id, cycle_code, cycle_name, status, target_count, start_time, end_time, is_deleted
         FROM hse_assessment_cycle
        WHERE cycle_code = 'HSE-CYCLE-202609'
        ORDER BY id`
    );

    // 参考：8 月周期（宽限补扣对象）
    await q(
      '参考 8月周期 HSE-CYCLE-202608',
      `SELECT id, cycle_code, status, target_count, start_time, end_time, is_deleted
         FROM hse_assessment_cycle
        WHERE cycle_code = 'HSE-CYCLE-202608'
        ORDER BY id`
    );

    // C.1 cycle43 扣分行
    await q(
      'C.1 cycle43 扣分（按 source_table 分组）',
      `SELECT source_table, count(*) AS n, COALESCE(sum(suggested_score), 0) AS total_score
         FROM hse_assessment_deduction
        WHERE cycle_id = 43 AND is_deleted IS NOT TRUE
        GROUP BY 1 ORDER BY 1`
    );

    // C.1b cycle43 扣分明细（若有，逐行列出 source_detail 判断合理性）
    await q(
      'C.1b cycle43 扣分明细',
      `SELECT id, target_id, source_table, source_id, deduction_item, deduction_source,
              suggested_score, review_status, source_detail, created_at
         FROM hse_assessment_deduction
        WHERE cycle_id = 43 AND is_deleted IS NOT TRUE
        ORDER BY id`
    );

    // C.2 cycle43 得分行
    await q(
      'C.2 cycle43 得分行数与状态',
      `SELECT review_status, count(*) AS n, COALESCE(sum(final_score), 0) AS sum_final
         FROM hse_assessment_score
        WHERE cycle_id = 43 AND is_deleted IS NOT TRUE
        GROUP BY 1 ORDER BY 1`
    );

    // C.3 cycle24 parity
    await q(
      'C.3a cycle24 网格（kind=grid_unchecked_monthly）',
      `SELECT count(*) AS n, COALESCE(sum(suggested_score), 0) AS total_score,
              count(*) FILTER (WHERE review_status <> 'pending') AS nonpending
         FROM hse_assessment_deduction
        WHERE cycle_id = 24 AND is_deleted IS NOT TRUE
          AND source_detail ->> 'kind' = 'grid_unchecked_monthly'`
    );
    await q(
      'C.3b cycle24 三违（kind=violation_event）',
      `SELECT count(*) AS n
         FROM hse_assessment_deduction
        WHERE cycle_id = 24 AND is_deleted IS NOT TRUE
          AND source_detail ->> 'kind' = 'violation_event'`
    );
    await q(
      'C.3c cycle24 全量扣分（不分 kind）',
      `SELECT source_table, source_detail ->> 'kind' AS kind, count(*) AS n,
              COALESCE(sum(suggested_score), 0) AS total_score
         FROM hse_assessment_deduction
        WHERE cycle_id = 24 AND is_deleted IS NOT TRUE
        GROUP BY 1, 2 ORDER BY 1, 2`
    );

    // C.4 规则观测实值
    await q(
      'C.4 规则观测实值（R000001 / VIOLATION003）',
      `SELECT rule_code, rule_name, adapter_key, integration_status,
              last_run_cycle_id, last_run_at,
              last_scanned_count, last_assessed_count, last_deducted_count,
              last_run_summary,
              (SELECT cycle_code FROM hse_assessment_cycle c
                WHERE c.id = hse_assessment_rule.last_run_cycle_id) AS last_run_cycle_code
         FROM hse_assessment_rule
        WHERE rule_code IN ('R000001', 'VIOLATION003')
        ORDER BY rule_code`
    );

    // C.4b 全部有观测的规则（看是否只有 VIOLATION003 被刷新）
    await q(
      'C.4b 全部规则观测（last_run_at 倒序）',
      `SELECT rule_code, last_run_cycle_id, last_run_at, last_run_summary
         FROM hse_assessment_rule
        WHERE last_run_at IS NOT NULL
        ORDER BY last_run_at DESC`
    );

    // 参考：cycle43/24 窗口（守卫判定用）
    await q(
      '参考 cycle 43/24 窗口',
      `SELECT id, cycle_code, start_time, end_time, status, target_count
         FROM hse_assessment_cycle WHERE id IN (43, 24) ORDER BY id`
    );
  } catch (e) {
    console.error('FATAL', e.message);
  } finally {
    await pool.end();
  }
})();

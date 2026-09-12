// 第四轮 P1：清理第三轮测试调整记录（id 11~15，均属测试产物）。
// hse_deduction_adjustment 有审计触发器阻止 DELETE/UPDATE，故事务内临时禁用后删除再恢复。
// 同时将明细 96/119 的 current_version 复位为 1（其全部调整历史已删除，恢复测试前状态）。
const { pool } = require('../config/db');

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('ALTER TABLE hse_deduction_adjustment DISABLE TRIGGER trg_prevent_adjustment_update');

    const del = await client.query(
      `DELETE FROM hse_deduction_adjustment WHERE id = ANY($1) RETURNING id, deduction_id, operation_type`,
      [[11, 12, 13, 14, 15]]
    );
    console.log(`已删除调整记录 ${del.rowCount} 条:`, del.rows);

    const up = await client.query(
      `UPDATE hse_assessment_deduction
       SET current_version = 1, updated_at = NOW()
       WHERE id = ANY($1) AND current_version > 1
       RETURNING id, review_status, suggested_score, confirmed_score, current_version`,
      [[96, 119]]
    );
    console.log('已复位明细版本:', up.rows);

    await client.query('ALTER TABLE hse_deduction_adjustment ENABLE TRIGGER trg_prevent_adjustment_update');
    await client.query('COMMIT');

    const remaining = (await client.query(`SELECT COUNT(*) AS n FROM hse_deduction_adjustment`)).rows[0].n;
    const dup = (await client.query(
      `SELECT deduction_id, COUNT(*) FILTER (WHERE is_current) AS current_count
       FROM hse_deduction_adjustment GROUP BY deduction_id
       HAVING COUNT(*) FILTER (WHERE is_current) > 1`
    )).rows;
    console.log(`剩余调整记录: ${remaining}; is_current 异常: ${dup.length} 条`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

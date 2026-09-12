const { pool } = require('../config/db');
(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // 1) 软删 FIRE001 规则（保留历史引用完整，规则不再参与评分）
    const r1 = await client.query(
      `UPDATE hse_assessment_rule
          SET is_deleted = TRUE, status = 'disabled', updated_at = NOW()
        WHERE rule_code = 'FIRE001' AND is_deleted = FALSE
        RETURNING id, rule_code`);
    console.log('rule 软删:', r1.rows.length ? `FIRE001 (#${r1.rows[0].id})` : '未命中/已删');

    // 2) 硬删 category_limit 消防管理（无 is_deleted 列，表内已确认无外键指向）
    const r2 = await client.query(
      `DELETE FROM hse_assessment_category_limit
        WHERE id = 262 AND category = '现场管理-消防管理'
        RETURNING id, category`);
    console.log('category_limit 删除:', r2.rows.length ? `${r2.rows[0].category} (#${r2.rows[0].id})` : '未命中/已删');
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  // 复检
  const chk1 = await pool.query(`SELECT id, rule_code, is_deleted, status FROM hse_assessment_rule WHERE rule_code='FIRE001'`);
  console.log('复检 rule:', JSON.stringify(chk1.rows[0]));
  const chk2 = await pool.query(`SELECT id, category FROM hse_assessment_category_limit WHERE id=262`);
  console.log('复检 category_limit 262 行数:', chk2.rows.length);
  await pool.end();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
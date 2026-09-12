/**
 * 一次性回填：为 hse_assessment_rule 中 rule_code 为空（NULL/''）的记录自动补号。
 * 规则：R + 六位序号，序号取既有最大 R 序号 +1，按 id 升序分配；仅处理未删除记录，并保证不覆盖已有编码。
 * 用法：node scripts/backfill-rule-codes.js
 */
const { pool } = require('../config/db');

async function nextSeq(client) {
  const res = await client.query(
    `SELECT COALESCE(MAX((regexp_match(rule_code, 'R([0-9]+)$'))[1]::int), 0) AS mc
     FROM hse_assessment_rule
     WHERE rule_code ~ '^R[0-9]+$' AND is_deleted = FALSE`
  );
  return parseInt(res.rows[0]?.mc, 10) || 0;
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ids = await client.query(
      `SELECT id FROM hse_assessment_rule
       WHERE (rule_code IS NULL OR BTRIM(rule_code) = '') AND is_deleted = FALSE
       ORDER BY id ASC`
    );
    if (!ids.rows.length) {
      console.log('无待回填记录');
      await client.query('COMMIT');
      return;
    }
    let seq = await nextSeq(client);
    for (const { id } of ids.rows) {
      seq += 1;
      const code = 'R' + String(seq).padStart(6, '0');
      await client.query(`UPDATE hse_assessment_rule SET rule_code=$1 WHERE id=$2`, [code, id]);
      console.log(`id=${id} -> ${code}`);
    }
    await client.query('COMMIT');
    console.log(`已完成，共回填 ${ids.rows.length} 条`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('回填失败：', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    pool.end();
  }
}

main();
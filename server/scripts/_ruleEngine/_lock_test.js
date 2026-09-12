/**
 * 规则引擎阶段1 · 人工锁定语义验收
 *
 * 步骤：
 *   1) 取 cycle 24 一行自动扣分行（kind=grid_unchecked_monthly）
 *   2) 置 review_status='approved', confirmed_score=2（模拟人工审定）
 *   3) 重扫 → 该行必须保持 2 分，动作记为 locked
 *   4) 恢复原值 → 再扫回自动口径
 * 只读业务快照写入临时 JSON，测试结束后务必确认已恢复。
 */

const path = require('path');
const fs = require('fs');
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { pool, testConnection } = require('../../config/db');
const svc = require('../../services/gridUncheckedDeductionService');

const CYCLE = 24;

async function pickRow() {
  const r = await pool.query(
    `SELECT id, target_id, suggested_score, confirmed_score, review_status, source_detail
       FROM hse_assessment_deduction
      WHERE cycle_id=$1 AND is_deleted=FALSE
        AND deduction_source='auto'
        AND source_detail->>'kind'='grid_unchecked_monthly'
      ORDER BY id ASC LIMIT 1`,
    [CYCLE]
  );
  return r.rows[0] || null;
}

async function main() {
  await testConnection();
  const row = await pickRow();
  if (!row) { console.error('未找到测试行'); process.exit(1); }

  const backup = {
    id: row.id,
    suggested_score: row.suggested_score,
    confirmed_score: row.confirmed_score,
    review_status: row.review_status,
    source_detail: row.source_detail,
  };
  fs.writeFileSync(
    path.resolve(__dirname, 'out/lock-test-backup.json'),
    JSON.stringify(backup, null, 2),
    'utf8'
  );
  console.log('【1】测试行原始状态:', JSON.stringify({
    id: backup.id, suggested: backup.suggested_score,
    confirmed: backup.confirmed_score, review: backup.review_status,
  }));

  // 【2】置为人工审定
  await pool.query(
    `UPDATE hse_assessment_deduction
        SET review_status='approved', confirmed_score=2, updated_at=NOW()
      WHERE id=$1`,
    [row.id]
  );
  console.log('【2】已置 approved / confirmed_score=2');

  // 【3】重扫
  const res = await svc.syncGridUncheckedDeductions(CYCLE, { dryRun: false });
  const after = await pool.query(
    `SELECT suggested_score, confirmed_score, review_status FROM hse_assessment_deduction WHERE id=$1`,
    [row.id]
  );
  const a = after.rows[0];
  const employeeId = (row.source_detail && row.source_detail.deductKey)
    ? String(row.source_detail.deductKey).split(':').pop()
    : null;
  const detail = (res.details || []).find((d) => String(d.employeeId) === String(employeeId));
  console.log('【3】重扫后该行:', JSON.stringify({
    id: row.id, suggested: a.suggested_score, confirmed: a.confirmed_score, review: a.review_status,
  }));
  console.log('    引擎动作:', JSON.stringify(detail || null), ' affected =', res.affected);
  const lockedOK = Number(a.confirmed_score) === 2 && a.review_status === 'approved';
  console.log(`    ${lockedOK ? '✅ 锁定生效（保持 2 分，未被自动覆盖）' : '❌ 锁定失败'}`);

  // 【4】恢复
  await pool.query(
    `UPDATE hse_assessment_deduction
        SET suggested_score=$2, confirmed_score=$3, review_status=$4, source_detail=$5, updated_at=NOW()
      WHERE id=$1`,
    [row.id, backup.suggested_score, backup.confirmed_score, backup.review_status, backup.source_detail]
  );
  const res2 = await svc.syncGridUncheckedDeductions(CYCLE, { dryRun: false });
  const after2 = await pool.query(
    `SELECT suggested_score, confirmed_score, review_status FROM hse_assessment_deduction WHERE id=$1`,
    [row.id]
  );
  const b = after2.rows[0];
  console.log('【4】恢复后重扫:', JSON.stringify({
    id: row.id, suggested: b.suggested_score, confirmed: b.confirmed_score, review: b.review_status,
  }), ' affected =', res2.affected);
  const restored =
    Number(b.suggested_score) === Number(backup.suggested_score) &&
    b.review_status === backup.review_status &&
    (backup.confirmed_score == null ? b.confirmed_score == null : Number(b.confirmed_score) === Number(backup.confirmed_score));
  console.log(`    ${restored ? '✅ 已恢复自动口径' : '❌ 恢复失败'}`);

  await pool.end();
  process.exit(lockedOK && restored ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  try { await pool.end(); } catch {}
  process.exit(1);
});

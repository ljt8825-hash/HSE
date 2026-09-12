/**
 * 提示词-11 任务 A2：修正 cycle43（HSE-CYCLE-202609）窗口时区偏移
 *
 * 背景（执行报告-09/10/11）：
 *   自动建周期曾用 Date.UTC 构造窗口 → 落库为 UTC 0 点 = 北京 08:00。
 *   cycle43 窗口 = 2026-09-01 08:00 CST ~ 2026-10-01 07:59 CST，偏 8 小时。
 * 修正：改为本地午夜 2026-09-01 00:00:00+08 ~ 2026-09-30 23:59:59+08
 *       （与手工建周期落库口径一致）。
 *
 * 安全约束：
 *   - 前置断言：cycle43 的 hse_assessment_deduction 与 hse_assessment_score 均为 0 行，
 *     否则拒绝执行（证明修正窗口不会制造任何历史扣分/得分的归属歧义）。
 *   - 幂等：窗口已正确时 noop 并提示。
 *   - 仅 UPDATE 一行，不触碰 targets/扣分/得分。
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { pool, testConnection, isConnected } = require('../../config/db');

const CYCLE_CODE = 'HSE-CYCLE-202609';

async function main() {
  await testConnection();
  if (!isConnected()) {
    console.error('[fix-cycle43] ❌ 未连接数据库（memory-mode），退出');
    process.exit(2);
  }

  // 1) 定位周期
  const cyc = await pool.query(
    `SELECT id, cycle_code, status,
            to_char(start_time AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS') AS st,
            to_char(end_time   AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS') AS et
       FROM hse_assessment_cycle
      WHERE cycle_code=$1 AND is_deleted=FALSE`,
    [CYCLE_CODE]
  );
  if (!cyc.rows.length) {
    console.error(`[fix-cycle43] ❌ 未找到周期 ${CYCLE_CODE}（可能尚未补建），退出`);
    process.exit(2);
  }
  const row = cyc.rows[0];
  console.log(`[fix-cycle43] 命中周期 id=${row.id} ${row.cycle_code} status=${row.status}`);
  console.log(`[fix-cycle43] 修正前窗口: ${row.st} ~ ${row.et}`);

  // 2) 前置断言：零扣分 / 零得分（证明窗口修正安全）
  const cnt = await pool.query(
    `SELECT (SELECT COUNT(*) FROM hse_assessment_deduction WHERE cycle_id=$1 AND is_deleted=FALSE) AS ded,
            (SELECT COUNT(*) FROM hse_assessment_score   WHERE cycle_id=$1 AND is_deleted=FALSE) AS score,
            (SELECT COUNT(*) FROM hse_assessment_target   WHERE cycle_id=$1 AND is_deleted=FALSE) AS targets`,
    [row.id]
  );
  const { ded, score, targets } = cnt.rows[0];
  console.log(`[fix-cycle43] 前置计数: deduction=${ded} score=${score} target=${targets}`);
  if (Number(ded) !== 0 || Number(score) !== 0) {
    console.error('[fix-cycle43] ❌ 前置断言失败：周期存在扣分或得分行，修正窗口可能引发归属歧义，已拒绝执行');
    process.exit(2);
  }

  // 3) 幂等：已正确则 noop
  const EXPECT_ST = '2026-09-01 00:00:00';
  const EXPECT_ET = '2026-09-30 23:59:59';
  if (row.st === EXPECT_ST && row.et === EXPECT_ET) {
    console.log('[fix-cycle43] ✅ 窗口已正确，无需修正（幂等 noop）');
    process.exit(0);
  }

  // 4) UPDATE（参数化 timestamptz，带 +08 时区）
  await pool.query(
    `UPDATE hse_assessment_cycle
        SET start_time = $2::timestamptz, end_time = $3::timestamptz, updated_at = NOW()
      WHERE id = $1 AND is_deleted = FALSE`,
    [row.id, '2026-09-01 00:00:00+08', '2026-09-30 23:59:59+08']
  );

  // 5) 回读验证
  const after = await pool.query(
    `SELECT to_char(start_time AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS') AS st,
            to_char(end_time   AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS') AS et
       FROM hse_assessment_cycle WHERE id=$1`,
    [row.id]
  );
  const a = after.rows[0];
  console.log(`[fix-cycle43] 修正后窗口: ${a.st} ~ ${a.et}`);
  if (a.st !== EXPECT_ST || a.et !== EXPECT_ET) {
    console.error(`[fix-cycle43] ❌ 回读校验失败：期望 ${EXPECT_ST}~${EXPECT_ET}，实际 ${a.st}~${a.et}`);
    process.exit(2);
  }

  console.log('[fix-cycle43] ✅ 窗口修正成功并校验通过（即时生效，无需重启后端）');
  process.exit(0);
}

main().catch((e) => {
  console.error('[fix-cycle43] ❌ 脚本异常:', e.message);
  process.exit(2);
});

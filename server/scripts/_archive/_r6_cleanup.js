/**
 * 第六轮终审验收——测试数据清理（r6-cleanup）
 * 目标：还原 cycle24 基线（待审核未检查 24 条、张忠华回 99 分、分数分布 94~100）
 * 清理范围（仅 r6 测试残留，不动既有历史）：
 *   1. 台账记录 6611（张忠华 08-29 测试回填，违章人「测试整改人」）
 *   2. file_records 384/385（_r6_backfill_zhangzhonghua.xlsx 测试上传）
 *   3. 调整记录 22（对 119 的 UNLOCK 测试残留；临时禁用 trg_prevent_adjustment_update）
 *   4. 复活扣分明细 119（is_deleted→FALSE, pending, 1.00, version→1）
 * 之后由调用方重跑「执行评分」回自动口径。
 */
const { pool } = require('../config/db');
const fs = require('fs');
const path = require('path');

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) 删除测试回填台账记录（校验确为 8-29 测试数据后再删）
    const led = await client.query(
      `SELECT id, personnel_name, inspection_date, upload_time, violator_name, violation_behavior
       FROM grid_inspection_records WHERE id=6611`
    );
    if (!led.rows.length) {
      console.log('台账 6611 不存在，跳过');
    } else {
      const r = led.rows[0];
      console.log('待删台账 6611:', JSON.stringify(r));
      if (String(r.violator_name).includes('测试整改人') || String(r.upload_time).includes('2026/08/30')) {
        await client.query(`DELETE FROM grid_inspection_records WHERE id=6611`);
        console.log('台账 6611 已删除');
      } else {
        console.log('⚠️ 台账 6611 非测试数据，跳过删除，需人工确认');
      }
    }

    // 2) 删除测试上传文件记录
    for (const fid of [384, 385]) {
      const fr = await client.query(`SELECT id, original_name, filepath FROM file_records WHERE id=$1`, [fid]);
      if (fr.rows.length) {
        console.log('待删 file_record', fid, JSON.stringify(fr.rows[0]));
        await client.query(`DELETE FROM file_records WHERE id=$1`, [fid]);
        console.log('file_record', fid, '已删除');
      }
    }

    // 3) 删除测试调整记录 22（临时禁用触发器）
    const adj = await client.query(`SELECT * FROM hse_deduction_adjustment WHERE id=22`);
    if (adj.rows.length) {
      console.log('待删调整记录 22:', JSON.stringify(adj.rows[0], null, 1));
      await client.query('ALTER TABLE hse_deduction_adjustment DISABLE TRIGGER trg_prevent_adjustment_update');
      await client.query(`DELETE FROM hse_deduction_adjustment WHERE id=22`);
      await client.query('ALTER TABLE hse_deduction_adjustment ENABLE TRIGGER trg_prevent_adjustment_update');
      console.log('调整记录 22 已删除（触发器已恢复）');
    } else {
      console.log('调整记录 22 不存在，跳过');
    }

    // 4) 复活扣分明细 119 至基线（pending, 1.00, version=1）
    const d = await client.query(`SELECT id, is_deleted, review_status, suggested_score, current_version FROM hse_assessment_deduction WHERE id=119`);
    if (d.rows.length) {
      console.log('复活前 119:', JSON.stringify(d.rows[0]));
      await client.query(
        `UPDATE hse_assessment_deduction
         SET is_deleted=FALSE, review_status='pending', suggested_score=1.00, confirmed_score=NULL,
             current_version=1, updated_at=NOW()
         WHERE id=119`
      );
      console.log('119 已复活为基线 pending');
    } else {
      console.log('明细 119 不存在，跳过');
    }

    await client.query('COMMIT');
    console.log('DB 清理完成');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('清理失败，已回滚:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();

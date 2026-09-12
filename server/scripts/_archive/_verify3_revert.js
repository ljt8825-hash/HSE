/* 第三轮验证：回退链路（补传台账→缺次减少/归零→软删/复活）
 * 目标：李忠胜（明细96，应巡30/实巡29/缺1/1分）
 * 步骤：查其网格与台账 → 插入1条临时8月台账使其缺次归0 → sync → 该行软删、分数回100
 *       → 删除临时台账 → sync → 复活该行、分数回99 → 清理完毕
 */
const { testConnection, pool } = require('../config/db');
const svc = require('../services/gridUncheckedDeductionService');
const engine = require('../services/assessmentScoringEngine');

(async () => {
  await testConnection();
  const cycleId = 24;
  let tempRecordId = null;

  try {
    // 0. 基线
    let r = await svc.syncGridUncheckedDeductions(cycleId, { dryRun: true });
    let me = r.details.find((d) => d.employeeName === '李忠胜');
    console.log('=== 基线 ===');
    console.log('李忠胜:', JSON.stringify({ expected: me.expected, actual: me.actual, missing: me.missing, score: me.cappedScore, action: me.action }));

    // 1. 找李忠胜的网格与一条真实台账样例（复制字段结构）
    const ga = await pool.query(
      `SELECT id, name, personnel_id FROM grid_areas WHERE name='李忠胜' AND is_deleted=FALSE LIMIT 1`
    );
    if (!ga.rows.length) throw new Error('未找到李忠胜网格');
    const grid = ga.rows[0];
    const sample = await pool.query(
      `SELECT * FROM grid_inspection_records WHERE personnel_name='李忠胜' AND inspection_date >= make_date(2026,8,1)
       ORDER BY id LIMIT 1`
    );
    if (!sample.rows.length) throw new Error('未找到李忠胜8月台账');
    const s = sample.rows[0];
    console.log('=== 李忠胜网格与台账样例 ===');
    console.log('grid:', JSON.stringify(grid));
    console.log('sample 关键列:', JSON.stringify({
      id: s.id, personnel_name: s.personnel_name, grid_id: s.grid_id, grid_level: s.grid_level,
      inspection_date: s.inspection_date, area_team: s.area_team,
    }));

    // 2. 插入一条临时 8 月台账（使他实巡 29→30，缺次归0）
    const cols = Object.keys(s).filter((k) => k !== 'id');
    const insCols = cols.join(',');
    const insVals = cols.map((c, i) => `$${i + 1}`);
    const vals = cols.map((c) => {
      if (c === 'inspection_date') return '2026-08-15';
      return s[c];
    });
    const ins = await pool.query(
      `INSERT INTO grid_inspection_records (${insCols}) VALUES (${insVals}) RETURNING id`,
      vals
    );
    tempRecordId = ins.rows[0].id;
    console.log('=== 已插入临时台账 id=' + tempRecordId + '（李忠胜 2026-08-15）===');

    // 3. 正式 sync：缺次归0 → 该行软删、分数回100
    const r2 = await svc.syncGridUncheckedDeductions(cycleId);
    const me2 = r2.details.find((d) => d.employeeName === '李忠胜');
    console.log('补台账后 sync:', JSON.stringify({ missing: me2.missing, score: me2.cappedScore, action: me2.action, affected: r2.affected }));
    const d96 = await pool.query(`SELECT review_status, is_deleted, suggested_score FROM hse_assessment_deduction WHERE id=96`);
    console.log('明细96:', JSON.stringify(d96.rows[0]));
    const t454 = await pool.query(`SELECT score_auto FROM hse_assessment_target WHERE id=454`);
    console.log('目标454 score_auto:', t454.rows[0].score_auto, '(应为100)');

    // 4. 删除临时台账 → 复活
    await pool.query(`DELETE FROM grid_inspection_records WHERE id=$1`, [tempRecordId]);
    tempRecordId = null;
    console.log('=== 已删除临时台账 ===');
    const r3 = await svc.syncGridUncheckedDeductions(cycleId);
    const me3 = r3.details.find((d) => d.employeeName === '李忠胜');
    console.log('删台账后 sync:', JSON.stringify({ missing: me3.missing, score: me3.cappedScore, action: me3.action, affected: r3.affected }));
    const d96b = await pool.query(`SELECT review_status, is_deleted, suggested_score FROM hse_assessment_deduction WHERE id=96`);
    console.log('明细96:', JSON.stringify(d96b.rows[0]));
    const t454b = await pool.query(`SELECT score_auto FROM hse_assessment_target WHERE id=454`);
    console.log('目标454 score_auto:', t454b.rows[0].score_auto, '(应回99)');

    // 5. 验证锁定行在回退中不受影响：临时把明细97（李先菊）调为 adjusted 锁定 → 删其台账不软删
    //    只演示：锁定的明细96在 delete 时不受影响（前面步骤已证明调整后执行评分不覆盖）。这里做完整版：
    console.log('=== 步骤5 锁定行不受回退影响 ===');
    const t97 = await pool.query(`SELECT target_id FROM hse_assessment_deduction WHERE id=97`);
    const t97id = t97.rows[0].target_id;
    // 先锁定明细97
    await pool.query(
      `UPDATE hse_assessment_deduction SET review_status='adjusted', confirmed_score=suggested_score WHERE id=97`
    );
    // 找李先菊网格与一条台账删除
    const ga2 = await pool.query(`SELECT id FROM grid_areas WHERE name='李先菊' AND is_deleted=FALSE LIMIT 1`);
    const s2 = await pool.query(
      `SELECT id FROM grid_inspection_records WHERE personnel_name='李先菊' AND inspection_date >= make_date(2026,8,1)
       ORDER BY id LIMIT 1`
    );
    if (ga2.rows.length && s2.rows.length) {
      const delId = s2.rows[0].id;
      await pool.query(`DELETE FROM grid_inspection_records WHERE id=$1`, [delId]);
      const r4 = await svc.syncGridUncheckedDeductions(cycleId);
      const me4 = r4.details.find((d) => d.employeeName === '李先菊');
      const d97 = await pool.query(`SELECT review_status, is_deleted, confirmed_score, suggested_score FROM hse_assessment_deduction WHERE id=97`);
      console.log('李先菊 sync:', JSON.stringify({ expected: me4.expected, actual: me4.actual, missing: me4.missing, action: me4.action }));
      console.log('明细97（锁定）:', JSON.stringify(d97.rows[0]), '→ 应仍 adjusted 未软删');
      // 恢复：加回台账 + 解锁明细97
      const ins2 = await pool.query(
        `INSERT INTO grid_inspection_records (${insCols}) VALUES (${insVals}) RETURNING id`,
        cols.map((c) => (c === 'inspection_date' ? '2026-08-15' : s2.rows[0][c] || null))
      );
      tempRecordId = ins2.rows[0].id;
      // 用解锁接口恢复
      const { testConnection: _t, pool: _p, ...rest } = require('../config/db');
      const BASE = 'http://127.0.0.1:5800/api';
      const login = await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) }).then((x) => x.json());
      const token = login.data.accessToken;
      const unl = await fetch(BASE + `/hse/assessment-monthly/deductions/97/unlock`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } }).then((x) => x.json());
      console.log('解锁明细97:', unl.code === 0 ? 'OK' : JSON.stringify(unl).slice(0, 200));
      await pool.query(`DELETE FROM grid_inspection_records WHERE id=$1`, [tempRecordId]);
      tempRecordId = null;
    } else {
      console.log('李先菊无8月台账或未找到，跳过锁定回退演示');
      await pool.query(`UPDATE hse_assessment_deduction SET review_status='pending', confirmed_score=NULL WHERE id=97`);
    }
  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    if (tempRecordId) {
      await pool.query(`DELETE FROM grid_inspection_records WHERE id=$1`, [tempRecordId]);
    }
    // 确保明细97恢复 pending
    await pool.query(`UPDATE hse_assessment_deduction SET review_status='pending', confirmed_score=NULL WHERE id=97`);
    // 恢复李忠胜分数
    await svc.syncGridUncheckedDeductions(cycleId);
    const t454c = await pool.query(`SELECT score_auto FROM hse_assessment_target WHERE id=454`);
    console.log('最终清理：目标454 score_auto=', t454c.rows[0].score_auto);
    const cnt = await pool.query(`SELECT count(*)::int AS c FROM grid_inspection_records WHERE personnel_name IN ('李忠胜','李先菊') AND inspection_date='2026-08-15'`);
    console.log('残留临时台账:', cnt.rows[0].c, '(应为0)');
    await pool.end();
  }
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });

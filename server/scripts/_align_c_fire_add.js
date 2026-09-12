/**
 * C类修复：4条 Excel「消防管理」列缺扣（系统未扣导致总分偏高）。
 * 系统无独立消防类别，消防按项目架构归入「现场管理-驾驶员管理」(HSE-KPI-DRV-003)。
 * 补录 hse_assessment_deduction 后重算，使总分与 Excel 一致。
 */
const { pool, testConnection } = require('../config/db');
const engine = require('../services/assessmentScoringEngine');

// {mon, cycle, name, delta}
const ADDS = [
  { mon: '2026-01', cid: 49, name: '李振恒', delta: 2 },
  { mon: '2026-02', cid: 50, name: '靳洪刚', delta: 1 },
  { mon: '2026-03', cid: 51, name: '张华平', delta: 4 },
  { mon: '2026-04', cid: 52, name: '张华平', delta: 4 },
];
const SYS_CAT = '现场管理-驾驶员管理';
const METRIC_CODE = 'HSE-KPI-DRV-003';

(async () => {
  await testConnection();
  // 消防总表Excel期望（用于验证总分）
  const EX_TOTAL = { '2026-01': { 李振恒: 98 }, '2026-02': { 靳洪刚: 97 }, '2026-03': { 张华平: 91 }, '2026-04': { 张华平: 84 } };
  const metric = (await pool.query(`SELECT id, metric_code FROM hse_assessment_metric WHERE metric_code=$1`,[METRIC_CODE])).rows[0];

  const client = await pool.connect();
  const inserted = [];
  try {
    await client.query('BEGIN');
    for (const a of ADDS) {
      const t = (await pool.query(`SELECT id, employee_name FROM hse_assessment_target WHERE cycle_id=$1 AND employee_name=$2 AND position='乡镇作业中心经理' AND is_deleted=FALSE`,[a.cid,a.name])).rows[0];
      if (!t) { console.log('跳过(无target) ' + a.mon + ' ' + a.name); continue; }
      // 幂等：同target+cycle+source_table+category已补则跳过
      const dup = await pool.query(`SELECT id FROM hse_assessment_deduction WHERE target_id=$1 AND cycle_id=$2 AND is_deleted=FALSE AND source_table='excel_monthly_alignment' AND source_detail->>'category'=$3 AND source_detail->>'metricCode'=$4 LIMIT 1`,[t.id,a.cid,SYS_CAT,METRIC_CODE]);
      if (dup.rows.length) { console.log(`跳过(已补) [${a.mon}] ${a.name}`); continue; }
      const scoreId = await engine.ensureTargetScoreRecord(t.id, a.cid);
      const detail = { kind:'excel_align', deductKey:`excel-align-fire:${a.cid}:${t.id}:${a.name}`, category:SYS_CAT, metricCode:METRIC_CODE, month:a.mon, excelValue:a.delta, source:'Excel考核总结直映射补录(消防管理列)', summary:`Excel消防管理列补扣 ${a.delta} 分`, remark:'C类-消防缺扣直映射' };
      const ins = await client.query(
        `INSERT INTO hse_assessment_deduction(score_id,target_id,cycle_id,metric_id,metric_code,deduction_item,deduction_type,deduction_source,source_table,source_id,source_detail,suggested_score,current_version,review_status,is_transmission,is_deleted,remark)
         VALUES($1,$2,$3,$4,$5,$6,'auto_deduction','auto','excel_monthly_alignment',NULL,$7,$8,1,'pending',FALSE,FALSE,$9) RETURNING id`,
        [scoreId,t.id,a.cid,metric.id,metric.metric_code,'Excel月度考核消防管理直映射补录',JSON.stringify(detail),a.delta,`【直映射ADD-消防】${a.name} 补扣${a.delta}(Excel消防管理列)`]);
      inserted.push({mon:a.mon,cid:a.cid,name:a.name,ded:ins.rows[0].id});
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); console.error('ERR', e.message); process.exit(1); }
  finally { client.release(); }

  // 重算
  for (const i of inserted) {
    const t = (await pool.query(`SELECT id FROM hse_assessment_target WHERE cycle_id=$1 AND employee_name=$2 AND position='乡镇作业中心经理' AND is_deleted=FALSE`,[i.cid,i.name])).rows[0];
    const res = await engine.recalculateTarget(i.cid, t.id);
    console.log(`recalc [${i.mon}] ${i.name} ded${i.ded} → scoreTotal=${res.scoreTotal}`);
  }

  // 验证总分 vs Excel
  console.log('\n===== C类验证 =====');
  for (const a of ADDS) {
    const t = (await pool.query(`SELECT score_total FROM hse_assessment_target WHERE cycle_id=$1 AND employee_name=$2 AND position='乡镇作业中心经理' AND is_deleted=FALSE`,[a.cid,a.name])).rows[0];
    const e = EX_TOTAL[a.mon][a.name];
    const d = +(e - t.score_total).toFixed(2);
    console.log(`  [${a.mon}] ${a.name}: 系统${t.score_total} vs Excel${e} Δ${d} ${Math.abs(d)<=0.051?'✔':'✗'}`);
  }
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
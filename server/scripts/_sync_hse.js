const { pool, testConnection } = require('../config/db');
const path = require('path');
const XLSX = require('xlsx');
const engine = require('../services/assessmentScoringEngine');
const BASE = 'G:/safety_vault/04_现场管理/27、HSE月度考核';
async function q(sql, ...a) { const r = await pool.query(sql, a); return r.rows; }
const PLAN = [
  { y:2025, m:8, f:'8月管理员考核结果.xlsx', cid:44 }, { y:2025, m:9, f:'9月管理员月度考核结果.xlsx', cid:45 },
  { y:2025, m:10, f:'10月管理员月度考核结果.xlsx', cid:46 }, { y:2025, m:11, f:'11月管理员月度考核结果(1).xlsx', cid:47 },
  { y:2025, m:12, f:'12月管理员月度考核结果.xlsx', cid:48 }, { y:2026, m:1, f:'1月管理员月度考核结果(1).xlsx', cid:49 },
  { y:2026, m:2, f:'2月管理员月度考核结果(1).xlsx', cid:50 }, { y:2026, m:3, f:'3月管理员月度考核结果(1).xlsx', cid:51 },
  { y:2026, m:4, f:'4月管理员月度考核结果.xlsx', cid:52 }, { y:2026, m:5, f:'5月管理员月度考核结果.xlsx', cid:53 },
];
function excelHse(p){
  const wb = XLSX.readFile(p); const ws = wb.Sheets['管理员月度考核结果'];
  const data = XLSX.utils.sheet_to_json(ws,{header:1,defval:null});
  const is080 = data[2]&&String(data[2][2]).trim()==='姓名';
  const out={};
  for(let i=3;i<data.length;i++){const r=data[i];if(!r)continue;
    const name = is080?r[2]:r[4];
    if(!name||!String(name).trim()||String(name).trim()==='/')continue;
    const idxs = is080?[5,6,7]:[7,8,9];
    let s=0;for(const ix of idxs){const v=r[ix];s+=v==null?0:(Number(v)||0);}
    out[String(name).trim()]=Math.round(s*100)/100;
  }
  return out;
}
(async () => {
  await testConnection();
  for (const pl of PLAN){
    const exc = excelHse(path.join(BASE,String(pl.y)+'年',String(pl.m)+'月',pl.f));
    const targets = await q(`SELECT id, employee_id, employee_name FROM hse_assessment_target WHERE cycle_id=$1 AND position='管理员' AND is_deleted=FALSE`, pl.cid);
    const mon = `${pl.y}-${String(pl.m).padStart(2,'0')}`;

    // 1) 软删所有 HSE教育培训 类别扣分行（非锁定）
    const del = await pool.query(
      `UPDATE hse_assessment_deduction SET is_deleted=TRUE, updated_at=NOW()
        WHERE cycle_id=$1 AND target_id IN (${targets.map(t=>t.id).join(',')})
          AND source_detail->>'category'='HSE教育培训' AND review_status NOT IN ('approved','adjusted') AND is_deleted=FALSE`,
      [pl.cid]
    );
    // 2) 按 Excel 值写新行 / 为0则不动（已删）
    let inserted = 0, skipped = 0, locked = 0;
    for (const t of targets) {
      const val = exc[t.employee_name] || 0;
      if (Math.abs(val) < 0.001) { skipped++; continue; }
      // 幂等：避免重复
      const dup = await pool.query(
        `SELECT id FROM hse_assessment_deduction WHERE target_id=$1 AND cycle_id=$2 AND deduction_source='auto'
          AND is_deleted=FALSE AND source_table='excel_monthly_backfill' AND source_detail->>'category'='HSE教育培训' LIMIT 1`,
        [t.id, pl.cid]
      );
      if (dup.rows.length){ skipped++; continue; }
      const scoreId = await engine.ensureTargetScoreRecord(t.id, pl.cid);
      const detail = { kind:'excel_backfill', deductKey:`hse-excel:${pl.cid}:${t.id}`, category:'HSE教育培训', ruleHit:{ruleName:'HSE教育培训考核扣分'}, source:'excel月度考核结果对齐', month:mon, excelValue:val };
      await pool.query(
        `INSERT INTO hse_assessment_deduction
           (score_id, target_id, cycle_id, metric_id, metric_code, deduction_item, deduction_type, deduction_source,
            source_table, source_id, source_detail, suggested_score, current_version, review_status, is_transmission, is_deleted, remark)
         VALUES ($1,$2,$3,NULL,'HSE-TRAIN-01','HSE教育培训扣分（与Excel月度考核对齐）','auto_deduction','auto','excel_monthly_backfill',NULL,$4,$5,1,'pending',FALSE,FALSE,'【对齐】Excel月度考核HSE教育培训')`,
        [scoreId, t.id, pl.cid, JSON.stringify(detail), val]
      );
      inserted++;
    }
    // 3) 重算这些 target
    for (const t of targets) { try { await engine.recalculateTarget(pl.cid, t.id); } catch(e){ console.log('   recalc err '+t.employee_name, e.message); } }
    console.log(mon+': 软删HSE行='+del.rowCount+' 写入='+inserted+' 跳过(Excel为0或已存在)='+skipped);
  }

  // 4) 验证：逐月 HSE教育培训 仍应有差异的人应为0
  console.log('\n===== 验证：对齐后 HSE教育培训 剩余差异(应全为0) =====');
  for (const pl of PLAN){
    const exc = excelHse(path.join(BASE,String(pl.y)+'年',String(pl.m)+'月',pl.f));
    const targets = await q(`SELECT id, employee_name FROM hse_assessment_target WHERE cycle_id=$1 AND position='管理员' AND is_deleted=FALSE`, pl.cid);
    const ids=targets.map(t=>t.id);
    const rows = ids.length?await q(`SELECT target_id, SUM(CASE WHEN review_status IN ('approved','adjusted') THEN COALESCE(confirmed_score,suggested_score) ELSE suggested_score END)::numeric tot
       FROM hse_assessment_deduction WHERE cycle_id=$1 AND target_id IN (${ids.join(',')}) AND is_deleted=FALSE AND review_status<>'rejected'
       AND deduction_type IN ('auto','chain_transmission','auto_deduction') AND source_detail->>'category'='HSE教育培训' GROUP BY target_id`, pl.cid):[];
    const agg = new Map(rows.map(r=>[Number(r.target_id), Number(r.tot)]));
    const bad=[];
    for (const t of targets){ const s=agg.get(t.id)||0, e=exc[t.employee_name]||0; if(Math.abs(s-e)>0.001) bad.push(`${t.employee_name}(sys=${s},exc=${e})`); }
    console.log('  '+pl.y+'-'+String(pl.m).padStart(2,'0')+': 剩余差异 '+bad.length+' 人'+(bad.length?(' :: '+bad.join('; ')):''));
  }
  process.exit(0);
})().catch((e)=>{console.log('ERR',e.message);process.exit(1);});
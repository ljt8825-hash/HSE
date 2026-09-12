/**
 * cyc27(2026-07) 验证 · 按Excel"考核总结"直映射拉平（方案A）
 *
 * 结果核对：cyc27 三违/培训等板块已与Excel一致，仅剩3人差异：
 *   1) 张和祥(572): 系统"三违分析"多扣 2分(ded=449)，Excel三违=0 → 软删对齐 → 99
 *   2) 谢俊章(568): 缺否决项100 → 方案A 跳过(待事故补录)
 *   3) 张华平(559): 缺否决项100 → 方案A 跳过(待事故补录)
 * 改动：软删1条扣分(ded=449)，recalc 张和祥。
 */
const { pool, testConnection } = require('../config/db');
const engine = require('../services/assessmentScoringEngine');

const FIXES = [
  { dedId: 449, targetId: 572, name: '张和祥', reason: 'Excel三违=0，系统三违分析多扣2分，直映射拉平为0' },
];

(async () => {
  await testConnection();
  console.log('===== 改前 =====');
  for (const f of FIXES) {
    const before=(await pool.query(`SELECT score_auto,score_total FROM hse_assessment_target WHERE id=$1`,[f.targetId])).rows[0];
    console.log(`  ${f.name}(id=${f.targetId}): score_total=${before.score_total}`);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const f of FIXES) {
      // 幂等：仅当该扣分仍生效时才软删
      const cur=await client.query(`SELECT is_deleted FROM hse_assessment_deduction WHERE id=$1`,[f.dedId]);
      if(!cur.rows.length){ console.log(`  跳过(无此扣分) ded=${f.dedId}`); continue; }
      if(cur.rows[0].is_deleted){ console.log(`  跳过(已软删) ded=${f.dedId}`); continue; }
      const up=await client.query(
        `UPDATE hse_assessment_deduction SET is_deleted=TRUE, remark=COALESCE(remark,'')||'【cyc27直映射拉平】${f.reason}', updated_at=NOW() WHERE id=$1 RETURNING id,is_deleted`,[f.dedId]);
      console.log(`  软删 ded=${f.dedId} =>`, JSON.stringify(up.rows[0]));
    }
    await client.query('COMMIT');
  } catch(e){ await client.query('ROLLBACK'); console.error('ERR',e.message); process.exit(1); }
  finally { client.release(); }

  // 重算
  for (const f of FIXES) {
    const res=await engine.recalculateTarget(27,f.targetId);
    console.log(`  recalc ${f.name} → ok=${res.ok} scoreTotal=${res.scoreTotal}`);
  }

  console.log('\n===== cyc27 最终核对 (系统 vs Excel) =====');
  const t=(await pool.query(
    `SELECT id,employee_name,score_total FROM hse_assessment_target WHERE cycle_id=27 AND position='乡镇作业中心经理' AND is_deleted=FALSE`) ).rows;
  const EXCEL={ '孙建栋':97,'张和祥':99,'谢俊章':0,'张万恒':100,'郭志强':96,'张卫新':98,'李振恒':94,'张华平':0,'王臣祥':100,'杨清华':98,'靳洪刚':98 };
  for(const x of t){
    const e=EXCEL[x.employee_name];
    if(e===undefined){ console.log(`  ${x.employee_name}: 系统${x.score_total} (Excel无此乡镇经理行)`); continue; }
    const d=+(e-x.score_total).toFixed(2);
    const mark=d===0?'✓对齐':(d<0?`系统多扣${-d}`:`缺扣${d}`);
    console.log(`  ${x.employee_name}: 系统${x.score_total} vs Excel${e} → ${mark}`);
  }
  process.exit(0);
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
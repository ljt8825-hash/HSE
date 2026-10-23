const { pool } = require('./config/db');
const { resolveViolatorAttribs } = require('./services/violatorResolver');
const { cleanVName, NAME_ALIAS } = require('./services/companyViolationDeduct');
function regionBase(s){const v=String(s||'').replace(/乡镇/g,'').trim(); if(!v)return ''; if(v.endsWith('片区'))return v.slice(0,-2); if(v.endsWith('作业中心'))return v.slice(0,-4); if(v.endsWith('中心'))return v.slice(0,-2); return v;}
(async()=>{
  try{
    const rd = (await pool.query(
      `SELECT violator_name, area_team FROM grid_inspection_records
        WHERE to_char(inspection_date,'YYYY-MM')='2026-09'
          AND trim(violation_behavior)<>'无三违行为'
          AND (rectified_photo IS NULL OR trim(rectified_photo)='' OR trim(rectified_photo) IN ('--','-','无'))`
    )).rows;
    const cand = (await pool.query(`SELECT DISTINCT town FROM hse_sanwei_score_monthly WHERE month='2026-09' AND is_deleted=FALSE`)).rows.map(r=>r.town);
    const adm = (await pool.query(
      `SELECT employee_name, township FROM hse_assessment_target
        WHERE cycle_id=43 AND position='管理员' AND is_deleted=FALSE`
    )).rows;
    const admTown = new Map(adm.map(x=>[String(x.employee_name).trim(), regionBase(x.township)]));
    const attr = await resolveViolatorAttribs(rd.map(x=>x.violator_name));
    console.log(`== 2026-09 未按时整改 逐条解析（${rd.length} 条，where area_team=${['...'].length}）==`);
    for(const r of rd){
      const raw = cleanVName(r.violator_name)||'';
      const alias = NAME_ALIAS[raw]||raw;
      const a = attr.get(alias);
      const sup = a?.supervisor||'';
      const dept = a?.dept||'';
      const town = dept ? cand.find(t=>dept.includes(t))||'' : '';
      const inAdminList = sup && admTown.get(sup)===town;
      console.log(`  violator=${r.violator_name} | area=${r.area_team} | dept=${dept||'-'} | sup=${sup||'-'} | town=${town||'-'} | 命中管理员tab=${inAdminList?'是':'否'}${(r.area_team==='公司管理'?' <公司管理记录>':'')}`);
    }
  }catch(e){console.error('ERR',e)}finally{await pool.end()}
})();
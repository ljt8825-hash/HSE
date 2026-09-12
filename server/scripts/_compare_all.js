const { pool, testConnection } = require('../config/db');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const BASE = 'G:/safety_vault/04_现场管理/27、HSE月度考核';
async function q(sql, ...a) { const r = await pool.query(sql, a); return r.rows; }

// 各月待测：{year, month, cycleId}
const PLAN = [
  { y:2025, m:8,  f:'8月管理员考核结果.xlsx', cid:44 },
  { y:2025, m:9,  f:'9月管理员月度考核结果.xlsx', cid:45 },
  { y:2025, m:10, f:'10月管理员月度考核结果.xlsx', cid:46 },
  { y:2025, m:11, f:'11月管理员月度考核结果(1).xlsx', cid:47 },
  { y:2025, m:12, f:'12月管理员月度考核结果.xlsx', cid:48 },
  { y:2026, m:1,  f:'1月管理员月度考核结果(1).xlsx', cid:49 },
  { y:2026, m:2,  f:'2月管理员月度考核结果(1).xlsx', cid:50 },
  { y:2026, m:3,  f:'3月管理员月度考核结果(1).xlsx', cid:51 },
  { y:2026, m:4,  f:'4月管理员月度考核结果.xlsx', cid:52 },
  { y:2026, m:5,  f:'5月管理员月度考核结果.xlsx', cid:53 },
  { y:2026, m:6,  f:'6月管理员月度考核结果.xlsx', cid:null },
  { y:2026, m:7,  f:'7月管理员月度考核结果.xlsx', cid:null },
];

// 维度列定义（除 2025-08 外通用）：sub-header 列号
const DIMS = [
  ['目标职责', [5,6]],
  ['HSE教育培训', [7,8,9]],
  ['三违管理', [10]],
  ['否决项', [11]],
];

function parseExcel(p) {
  const wb = XLSX.readFile(p);
  const ws = wb.Sheets['管理员月度考核结果'];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const six = data[0] && String(data[0][0]).includes('8月'); // 2025-08 文件名特殊
  const layout = require('fs').existsSync(p) && six;
  // 判定布局：若 R1[3] 含 'HSE' 且 R2[2] 为 '姓名' => 2025-08 布局
  const is080 = data[2] && data[2][2] && String(data[2][2]).trim()==='姓名';
  const rows = {};
  for (let i = 3; i < data.length; i++) {
    const r = data[i];
    if (!r) continue;
    let name;
    let dimsStart, scoreCol;
    if (is080) {
      name = r[2];
      // 08 布局: 3-4目标职责,5-7HSE,8三违,9否决项,14得分
      dimsStart = { '目标职责':[3,4], 'HSE教育培训':[5,6,7], '三违管理':[8], '否决项':[9] };
      scoreCol = 14;
    } else {
      name = r[4];
      dimsStart = { '目标职责':[5,6], 'HSE教育培训':[7,8,9], '三违管理':[10], '否决项':[11] };
      scoreCol = 16;
    }
    if (!name || String(name).trim()==='' || String(name).trim()==='/') continue;
    name = String(name).trim();
    const dim = {};
    for (const [dkey, idxs] of Object.entries(dimsStart)) {
      let s = 0;
      for (const ix of idxs) { const v = r[ix]; const n = v==null?0:Number(v)||0; s = Math.round((s+n)*100)/100; }
      dim[dkey] = s;
    }
    const sc = r[scoreCol];
    const row = { name, dim, score: sc==null?null:Number(sc) };
    rows[name] = row;
  }
  return rows; // Map<name, {name, dim:{...}, score}>
}

(async () => {
  await testConnection();
  // 规则-类别映射
  const rules = await q(`SELECT id, rule_name, category FROM hse_assessment_rule WHERE is_deleted=FALSE`);
  const ruleMap = new Map(rules.map((r) => [r.rule_name, r.category]));
  // 培训台账
  const ledger = await q(`SELECT month, trainer_id, COALESCE(missing_count,0)+COALESCE(incomplete_count,0) AS score FROM hse_training_ledger_monthly`);

  console.log('月 | Excel有扣分人数 | 系统有扣分人数 | 差异说明');
  console.log('---');

  for (const pl of PLAN) {
    const file = path.join(BASE, String(pl.y)+'年', String(pl.m)+'月', pl.f);
    let excel = {};
    try { excel = parseExcel(file); } catch (e) { console.log(pl.y+'-'+String(pl.m).padStart(2,'0')+' | Excel读取失败: '+e.message); continue; }

    // 系统数据
    let sys = {};
    if (pl.cid) {
      const targets = await q(`SELECT id, employee_id, employee_name, score_total FROM hse_assessment_target WHERE cycle_id=$1 AND position='管理员' AND is_deleted=FALSE`, pl.cid);
      const ids = targets.map(t=>t.id);
      const ded = ids.length ? await q(`SELECT target_id, deduction_item, source_detail, suggested_score, confirmed_score, review_status FROM hse_assessment_deduction WHERE cycle_id=$1 AND target_id IN (${ids.join(',')}) AND is_deleted=FALSE AND review_status<>'rejected' AND deduction_type IN ('auto','chain_transmission','auto_deduction')`, pl.cid) : [];
      const agg = {};
      for (const d of ded) {
        let rn = (d.source_detail&&d.source_detail.ruleHit&&d.source_detail.ruleHit.ruleName) || d.deduction_item;
        let cat = rn ? ruleMap.get(rn) : null;
        if (!cat && d.source_detail && d.source_detail.category) cat = String(d.source_detail.category);
        if (!cat) continue;
        const eff = (d.review_status==='approved'||d.review_status==='adjusted') ? (d.confirmed_score!=null?Number(d.confirmed_score):Number(d.suggested_score)) : Number(d.suggested_score);
        const rec = agg[d.target_id] || (agg[d.target_id]={});
        rec[cat] = (rec[cat]||0) + (eff||0);
      }
      const mon = `${pl.y}-${String(pl.m).padStart(2,'0')}`;
      const scoreByEmp = new Map(ledger.filter(l=>l.month===mon).map(l=>[String(l.trainer_id), Number(l.score)]));
      for (const t of targets) {
        const c = agg[t.id] || {};
        let hse = c['HSE教育培训']!=null ? c['HSE教育培训'] : null;
        const lv = scoreByEmp.get(String(t.employee_id));
        if (lv!=null) hse = lv;
        const sna = {
          ['目标职责']: c['目标职责']||0,
          ['HSE教育培训']: hse==null?0:hse,
          ['三违管理']: c['三违管理']!=null?c['三违管理']:(c['“三违”管理']||0),
          ['否决项']: c['否决项']||0,
        };
        sys[t.employee_name] = { name:t.employee_name, dim:sna, score:Number(t.score_total) };
      }
    }

    // Excel 有扣分的人（任意维度>0）
    const excelDeduct = Object.values(excel).filter((x) => Object.values(x.dim).some((v)=>v>0));
    // 系统有扣分的人
    const sysDeduct = Object.values(sys).filter((x) => Object.values(x.dim).some((v)=>v>0));

    // 差异：Excel有扣分但系统没有
    const miss = excelDeduct.filter((x) => {
      const s = sys[x.name];
      if (!s) return true; // 系统无此人
      return !Object.values(s.dim).some((v)=>v>0);
    });

    console.log(pl.y+'-'+String(pl.m).padStart(2,'0')+' | '+excelDeduct.length+' | '+(pl.cid?sysDeduct.length:'(无系统对象)')+' | '+(miss.length?('缺扣分: '+miss.map(m=>m.name+'['+Object.entries(m.dim).filter(e=>e[1]>0).map(e=>e[0]+'='+e[1]).join(',')+']').join('; ')):'一致'));
  }
  process.exit(0);
})().catch((e)=>{console.log('ERR',e.message);process.exit(1);});
/**
 * 花名册「用工关系状态」导入（v2）
 * 匹配优先级：id_card_hash > employee_code(归一化) > 姓名兜底。
 * 用法: node scripts/import-employment-relation.cjs [--dry-run|--apply]
 */
const XLSX = require('xlsx');
const { Pool } = require('pg');
const { encrypt, hashSensitive } = require('../utils/encryption');

const XLS = 'c:/Users/honey/.trae-cn/attachments/6aa33f5471666b4d888f1f49/9b59b1c7-a551-418c-aadf-62743bc688cb_1e329786-3f38-4a15-8707-b0dc25e3f88e_员工信息维护_20260910140825(1).xlsx';
const mode = process.argv.includes('--apply') ? 'apply' : 'dry-run';

function loadEnv() {
  const fs = require('fs');
  const txt = fs.readFileSync(require('path').join(__dirname, '../.env'), 'utf8');
  const env = {};
  for (const l of txt.split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, '$1'); }
  return env;
}
const normCode = (c) => String(c||'').trim().replace(/^0+/, '');
const normDate = (v) => {
  let s = String(v || '').trim();
  if (!s) return null;
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(s) || /^\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?$/.test(s)) {
    const p = s.split(/[-/.年月]/).filter(Boolean);
    return p.length >= 3 ? `${p[0]}-${String(+p[1]).padStart(2,'0')}-${String(+p[2]).padStart(2,'0')}` : null;
  }
  return null;
};
(async () => {
  const env = loadEnv();
  const pool = new Pool({ host: env.DB_HOST||'127.0.0.1', port:Number(env.DB_PORT||5432), user:env.DB_USER, password:env.DB_PASSWORD, database:env.DB_NAME });
  const q = (s,p) => pool.query(s,p).then(r=>r.rows);
  console.log('模式:', mode);

  await pool.query(`ALTER TABLE employee ADD COLUMN IF NOT EXISTS employment_relation varchar(40)`);
  await pool.query(`ALTER TABLE employee ADD COLUMN IF NOT EXISTS leave_date date`);
  await pool.query(`ALTER TABLE employee ADD COLUMN IF NOT EXISTS direct_supervisor varchar(50)`);
  const recs = await q(`SELECT id, employee_code, id_card_hash, name, is_deleted FROM employee`);
  const hashMap = new Map(), codeMap = new Map();
  for (const r of recs) {
    if (r.id_card_hash) { const h = hashMap.get(r.id_card_hash); if (!h || (h.deleted && !r.is_deleted)) hashMap.set(r.id_card_hash, { id:r.id, deleted:r.is_deleted }); else if(!h.deleted){} }
    if (r.employee_code) codeMap.set(normCode(r.employee_code), r.id);
  }
  console.log('employee(全部) :', recs.length, '| 有id_hash:', hashMap.size, '| 有编码:', codeMap.size);

  const wb = XLSX.readFile(XLS);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['员工信息维护'], { defval: null, raw: false });
  console.log('Excel 数据行:', rows.length);

  const updates = new Map(); // id -> {rel, leaveDate}
  const inserts = [];        // {row}
  const dist = {};
  for (const r of rows) {
    const rel = String(r['用工关系状态']||'').trim();
    if (!rel) continue;
    dist[rel] = (dist[rel]||0)+1;
    const idCard = String(r['身份证号码']||'').trim();
    const code = normCode(r['员工编码']);
    let id = null;
    if (idCard) { const h = hashMap.get(hashSensitive(idCard)); if (h) id = h.id; }
    if (id == null && code) id = codeMap.get(code) ?? null;
    if (id == null) { inserts.push(r); }
    else updates.set(id, { rel, leaveDate: normDate(r['离职日期']), supervisor: (String(r['直接上级']||'').trim()) || null });
  }
  console.log('有用工状态分布:', JSON.stringify(dist));

  const stat = {};
  for (const u of updates.values()) stat[u.rel] = (stat[u.rel]||0)+1;
  console.log('\n[在库已匹配可回填]', updates.size, '人:', JSON.stringify(stat));
  const st2 = {};
  for (const it of inserts) { const rel=String(it['用工关系状态']||'').trim(); st2[rel]=(st2[rel]||0)+1; }
  console.log('[真正需新建]', inserts.length, '人:', JSON.stringify(st2));
  console.log('需新建明细(前 20):');
  inserts.slice(0,20).forEach(i=>console.log(`   ${String(i['员工编码']||'').trim()} ${String(i['姓名']||'').trim()} | ${String(i['用工关系状态']||'').trim()} | ${String(i['所属部门']||'').trim()}/${String(i['职位']||'').trim()}`));

  if (mode === 'dry-run') { console.log('\nDRY-RUN：未写入。'); await pool.end(); return; }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let upd = 0, ins = 0;
    for (const [id, u] of updates) {
      const rd = await client.query(`UPDATE employee SET employment_relation=$2, leave_date=$3, direct_supervisor=$4, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND is_deleted=false`, [id, u.rel, u.leaveDate, u.supervisor]);
      upd += rd.rowCount;
    }
    for (const r of inserts) {
      const idCard = String(r['身份证号码']||'').trim();
      const idHash = idCard ? hashSensitive(idCard) : null;
      const idCipher = idCard ? encrypt(idCard) : null;
      let birth = String(r['出生日期']||'').trim() || null;
      if (birth && birth.includes('/')) { const p=birth.split('/'); birth = `${p[2]}-${p[1]}-${p[0]}`; }
      else if (birth && birth.includes('.')) { const p=birth.split('.'); birth = `${p[2]}-${p[1]}-${p[0]}`; }
      await client.query(
        `INSERT INTO employee (employee_code, name, gender, birth_date, id_card, id_card_hash, person_type, employment_relation, leave_date, direct_supervisor, is_public_welfare, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,NULL,$7,$8,$9,false,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
        [String(r['员工编码']||'').trim(), String(r['姓名']||'').trim(), String(r['性别']||'').trim()||null, birth||null, idCipher, idHash, String(r['用工关系状态']||'').trim(), normDate(r['离职日期']), (String(r['直接上级']||'').trim()) || null]
      );
      ins++;
    }
    await client.query('COMMIT');
    console.log('\nAPPLY 完成: 更新', upd, '人 | 新建', ins, '人');
  } catch (e) { await client.query('ROLLBACK'); console.error('APPLY 失败,已回滚:', e.message); process.exitCode=1; }
  finally { client.release(); await pool.end(); }
})().catch(e=>{ console.error('FAIL:',e.message); process.exit(1); });
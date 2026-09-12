// 重导入 2026-06 月度培训台账（复用 training.js 修复后的表头识别：兼容「表头内容缺失」）
const path = require('path');
const XLSX = require('xlsx');
const { pool, testConnection } = require('../config/db');

const file = 'G:/safety_vault/04_现场管理/27、HSE月度考核/2026年/6月/6月管理员月度考核结果.xlsx';
const month = '2026-06';

const toInt = (v) => {
  if (v == null || v === '') return 0;
  const n = parseInt(String(v).replace(/[^\d.-]/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

(async () => {
  await testConnection();
  const wb = XLSX.readFile(file);
  const sn = (wb.SheetNames || []).find((n) => /培训/.test(String(n)));
  if (!sn) { console.log('无培训sheet'); process.exit(0); }
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });

  // 表头识别（与 training.js 修复后一致）
  let headerRowIdx = -1, headerMap = {};
  for (let i = 0; i < Math.min(raw.length, 10); i++) {
    const row = raw[i] || [];
    const idx = {};
    row.forEach((v, c) => { const t = String(v == null ? '' : v).replace(/\s+/g, ''); if (t) idx[t] = c; });
    if (idx['培训人'] != null && (idx['培训人数'] != null || idx['应到人数'] != null)) { headerRowIdx = i; headerMap = idx; break; }
  }
  if (headerRowIdx < 0) { console.log('未找到表头'); process.exit(0); }
  const colTrainer = headerMap['培训人'];
  const colExpected = headerMap['培训人数'] != null ? headerMap['培训人数'] : headerMap['应到人数'];
  const colActual = headerMap['未培训人数'] != null ? headerMap['未培训人数'] : headerMap['实到人数'];
  const colMissing = headerMap['缺少签字人数'];
  const colIncomplete = headerMap['资料不完整'] != null ? headerMap['资料不完整'] : (headerMap['表头内容缺失'] != null ? headerMap['表头内容缺失'] : null);
  console.log(`表头: 培训人=${colTrainer} 应到=${colExpected} 实到=${colActual} 缺签字=${colMissing} 表头缺失=${colIncomplete}`);

  const agg = new Map();
  for (let i = headerRowIdx + 1; i < raw.length; i++) {
    const row = raw[i] || [];
    let name = String(row[colTrainer] == null ? '' : row[colTrainer]).trim();
    if (name.includes('、')) name = name.split('、')[0].trim();
    if (!name) continue;
    const cur = agg.get(name) || { name, expected: 0, actual: 0, missing: 0, incomplete: 0 };
    cur.expected += toInt(row[colExpected]);
    cur.actual += toInt(row[colActual]);
    cur.missing += toInt(row[colMissing]);
    cur.incomplete += toInt(colIncomplete != null ? row[colIncomplete] : null);
    agg.set(name, cur);
  }
  console.log(`解析到培训人 ${agg.size} 人`);

  const names = [...agg.keys()];
  const empRes = await pool.query(
    `SELECT employee_id, name FROM v_employee_org_full WHERE is_deleted=false AND is_current=true AND name = ANY($1)`,
    [names]);
  const nameToId = new Map();
  empRes.rows.forEach((r) => { if (!nameToId.has(r.name)) nameToId.set(r.name, r.employee_id); });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM hse_training_ledger_monthly WHERE month = $1', [month]);
    for (const item of agg.values()) {
      await client.query(
        `INSERT INTO hse_training_ledger_monthly
           (trainer_id, trainer_name, month, expected_count, actual_count, missing_count, incomplete_count, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'excel-import')
         ON CONFLICT (trainer_id, month) DO UPDATE SET
           trainer_name=EXCLUDED.trainer_name, expected_count=EXCLUDED.expected_count,
           actual_count=EXCLUDED.actual_count, missing_count=EXCLUDED.missing_count,
           incomplete_count=EXCLUDED.incomplete_count, updated_at=CURRENT_TIMESTAMP`,
        [nameToId.get(item.name) || null, item.name, month, item.expected, item.actual, item.missing, item.incomplete]);
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }

  const unmatched = names.filter((n) => !nameToId.has(n));
  const vals = [...agg.values()];
  console.log(`导入完成: ${agg.size}人 应到${vals.reduce((s,x)=>s+x.expected,0)} 实到${vals.reduce((s,x)=>s+x.actual,0)} 缺签字${vals.reduce((s,x)=>s+x.missing,0)} 表头缺失${vals.reduce((s,x)=>s+x.incomplete,0)}`);
  console.log('未匹配员工:', unmatched.join(',') || '(无)');
  console.log('表头缺失>0 的培训人:');
  for (const x of vals.filter((v) => v.incomplete > 0)) console.log(`  ${x.name}: 表头缺失${x.incomplete} 缺签字${x.missing}`);
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
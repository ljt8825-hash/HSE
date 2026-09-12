/**
 * 员工档案三列回填（一次性 + 可重复）
 * 新增 employee 列: roster_department(花名册所属部门) / roster_position(花名册职位) / roster_work_area(花名册负责区域-在职)
 * 从花名册 Excel 回填（离职人员"负责区域(在职)"为空，天然跳过）。
 * 用法: node scripts/backfill-roster-cols.cjs <xlsx路径>
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const XLSX = require('xlsx');
const { pool } = require('../config/db');
const { hashSensitive } = require('../utils/encryption');

const file = process.argv[2];
if (!file) { console.error('用法: node backfill-roster-cols.cjs <xlsx>'); process.exit(1); }

const normCode = (c) => String(c || '').trim().replace(/^0+/, '');
const cleanID = (s) => String(s || '').trim().toUpperCase().replace(/[^0-9X]/g, '');
// 与标准导入 hse-employee-import-v2 的 normalizeRosterDept 保持一致：片区 → 乡镇作业中心
const normalizeDept = (d) => {
  const s = String(d || '').trim();
  if (!s) return null;
  return s.replace(/片区$/, '乡镇作业中心');
};

(async () => {
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  const h = Object.keys(rows[0]);
  const g = (k) => h.find((x) => String(x).includes(k));
  const cCode = g('员工编码') || g('工号');
  const cName = g('姓名');
  const cID = g('身份证');
  const cDept = g('所属部门');
  const cPos = g('职位');
  const cArea = g('负责区域');
  for (const k of [cDept, cPos, cArea]) if (!k) { console.error('缺少列', k); }
  if (!cDept || !cPos) { console.error('缺少必备列(所属部门/职位)'); process.exit(1); }

  // 拉全量 employee 的 code/id_card
  const empRes = await pool.query(`SELECT id, employee_code, id_card FROM employee WHERE is_deleted = false`);
  const codeMap = new Map();
  const idMap = new Map();
  for (const e of empRes.rows) {
    if (e.employee_code) codeMap.set(normCode(e.employee_code), e.id);
    if (e.id_card && !e.id_card.startsWith('ENC:')) idMap.set(hashSensitive(cleanID(e.id_card)), e.id);
  }

  let updated = 0, missing = 0; const missNames = new Set();
  for (const r of rows) {
    const code = normCode(r[cCode]);
    const idc = cleanID(r[cID]);
    let id = idc ? idMap.get(hashSensitive(idc)) : null;
    if (id == null) id = codeMap.get(code) ?? null;
    if (id == null) { missing++; if (missNames.size < 30) missNames.add(String(r[cName])); continue; }
    const dept = String(r[cDept] ?? '').trim();
    const pos = String(r[cPos] ?? '').trim();
    const area = String(r[cArea] ?? '').trim();
    await pool.query(
      `UPDATE employee SET roster_department = $1, roster_position = $2, roster_work_area = $3 WHERE id = $4`,
      [normalizeDept(dept), pos || null, area || null, id]
    );
    updated++;
  }
  console.log(`回填 ${updated} 人，未匹配(库外) ${missing} 人`);
  if (missNames.size) console.log('未匹配样例:', Array.from(missNames).slice(0, 20).join('、'));
  await pool.end();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
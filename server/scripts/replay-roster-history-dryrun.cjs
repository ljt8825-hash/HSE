/**
 * 花名册历史重放 —— Dry-run v2（只读，不写库）
 * v2 改进：
 *  1) 主表择优：按「身份证+部门+职位」列覆盖度选表，避免选到缺部门/职位的行数最多表
 *  2) 并查集合并身份：同一身份证 或 同一员工编码 归为一个逻辑人（修复跨文件身份拆分的夸大）
 *  3) 补别名：二级部门/组织/片区/负责区域
 */
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const DIR = process.env.ROSTER_SOURCE_DIR || 'G:/safety_vault/08_保险及人员管理/花名册';

const ALIAS = {
  员工编号:'员工编号',员工编码:'员工编号',工号:'员工编号',人员编号:'员工编号',
  身份证号:'身份证号',身份证号码:'身份证号',身份证件号:'身份证号',身份证:'身份证号',
  所属部门:'所属部门',部门:'所属部门',所属乡镇:'所属部门',所属部门名称:'所属部门',二级部门:'所属部门',组织:'所属部门',
  班组:'班组',二级乡镇:'班组',片区:'班组',负责区域:'班组',
  职位:'职位',岗位:'职位',职务:'职位',
  姓名:'姓名',性别:'性别',出生日期:'出生日期',出生年月:'出生日期',
  入职日期:'入职日期',入职时间:'入职日期',
  联系电话:'联系电话',电话:'联系电话',手机:'联系电话',手机号:'联系电话',手机号码:'联系电话',
  直接上级:'直接上级',上级:'直接上级',上级姓名:'直接上级',
};
const cleanID = (s) => String(s ?? '').trim().toUpperCase().replace(/[^0-9X]/g, '');
const fmt = (d) => d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : '-';

// 部门/岗位归一化（用户已选「粗分类-角色级」）
//  - 部门裁到乡镇/单位名（保店镇一班→保店镇；机械作业中心×;中转站×;人力综合部×）
//  - 岗位归为角色类：保洁员/司机/管理员/经理/职能/后勤/其他；泛化标签(一线员工/专员空档)用本人众数回填
const normDept = (d) => {
  const s = String(d || '').trim();
  const m = s.match(/^(.+?[镇乡街道])/);
  if (m) return m[1];
  return s;
};
const roleClass = (p) => {
  const s = String(p || '').trim();
  if (!s) return '';
  if (/司机|驾驶|钩臂|勾臂|转运|金钱|车辆/.test(s)) return '司机';
  if (/保洁|清扫|环卫|清洁/.test(s)) return '保洁员';
  if (/班长|网格长|站长|负责人|主管/.test(s)) return '管理员';
  if (/管理员/.test(s)) return '管理员';
  if (/经理|总经理|总监|区长/.test(s)) return '经理';
  if (/专员|文员|会计|人事|行政|财务|秘书|助理/.test(s)) return '职能';
  if (/后勤|食堂|保安|门卫|公益/.test(s)) return '后勤';
  return '其他';
};
const segKey = (dept, position) => `${normDept(dept)}│${roleClass(position)}`;

function parseSnapshot(file) {
  const base = file.replace(/\.[A-Za-z0-9]+$/i, '');
  let m = base.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5], +m[6]);
  m = base.match(/^(\d{4})[.\-]?(\d{1,2})[.\-]?(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3]);
  return null;
}

// 读取一个工作表 -> {records:[], cov:{id,dept,pos}}，cov 表示该表是否含 身份证/部门/职位 列
function scanSheet(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '', header: 1 });
  let hi = -1;
  for (let i = 0; i < rows.length && i < 8; i++) {
    const flat = rows[i].map((c) => String(c ?? '').trim()).map((h) => ALIAS[h] || h);
    if (flat.includes('姓名') && (flat.includes('身份证号') || flat.includes('员工编号'))) { hi = i; break; }
  }
  if (hi < 0) return { records: [], cov: { id:false, dept:false, pos:false } };
  const hdr = rows[hi].map((c) => ALIAS[String(c ?? '').trim()] || String(c ?? '').trim());
  const cov = { id: hdr.includes('身份证号'), dept: hdr.includes('所属部门'), pos: hdr.includes('职位') };
  const records = [];
  for (let r = hi+1; r < rows.length; r++) {
    const raw = rows[r];
    if (!raw || raw.every((c) => String(c ?? '').trim() === '')) continue;
    const rec = {};
    for (let c = 0; c < hdr.length; c++) { if (hdr[c] && rec[hdr[c]] === undefined) rec[hdr[c]] = raw[c]; }
    records.push(rec);
  }
  return { records, cov };
}

// 主表择优：核心看「部门+职位」列是否齐全(core)，优先 core；同 core 行数多者胜；再平手看是否有身份证列
function pickMain(wb) {
  let best = null, bestCore = -1;
  for (const sn of wb.SheetNames) {
    if (/离职|工伤|雇主|Sheet3|5险|保险/.test(sn)) continue;
    const { records, cov } = scanSheet(wb.Sheets[sn]);
    if (!records.length) continue;
    const core = (cov.dept && cov.pos) ? 2 : (cov.dept || cov.pos) ? 1 : 0;
    if (!best || core > bestCore ||
        (core === bestCore && records.length > best.records.length) ||
        (core === bestCore && records.length === best.records.length && cov.id && !best.cov.id)) {
      best = { sn, records, cov }; bestCore = core;
    }
  }
  return best;
}

// ---------- 并查集 ----------
class UF {
  constructor(){ this.p = {}; }
  find(x){ if(this.p[x]===undefined) this.p[x]=x; while(this.p[x]!==x){ this.p[x]=this.p[this.p[x]]; x=this.p[x]; } return x; }
  union(a,b){ const ra=this.find(a), rb=this.find(b); if(ra!==rb) this.p[rb]=ra; }
}

// ---------- 扫描 ----------
const files = fs.readdirSync(DIR).filter((f) => /\.(xlsx?|XLSX?)$/i.test(f)).sort((a,b)=>{
  const da=parseSnapshot(a), db=parseSnapshot(b);
  if(!da&&!db) return a<b?-1:1; if(!da) return -1; if(!db) return 1; return da-db || (a<b?-1:1);
});
const noDateFiles = [];
const uf = new UF();
const rowTokens = [];
let latestMax = null;
const sheetsUsed = {};
const rowsByFile = [];

for (const f of files) {
  const snap = parseSnapshot(f);
  if (!snap) { noDateFiles.push(f); continue; }
  if (!latestMax || snap > latestMax) latestMax = snap;
  const wb = XLSX.readFile(path.join(DIR, f));
  const main = pickMain(wb);
  if (!main) { rowsByFile.push({ f, date: snap, rows: 0, sn: '-' }); continue; }
  sheetsUsed[f] = main.sn;
  rowsByFile.push({ f, date: snap, rows: main.records.length, sn: main.sn });
  for (const rec of main.records) {
    const id = cleanID(rec['身份证号'] || rec['身份证']);
    const emp = String(rec['员工编号'] ?? '').trim();
    const name = String(rec['姓名'] ?? '').trim();
    const dept = String(rec['所属部门'] ?? '').trim();
    const team = String(rec['班组'] ?? '').trim();
    const position = String(rec['职位'] ?? '').trim();
    const toks = [];
    if (id) toks.push('id:' + id); if (emp) toks.push('emp:' + emp);
    if (toks.length >= 2) uf.union(toks[0], toks[1]);
    rowTokens.push({ date: snap, id, emp, name, dept, team, position, tokens: toks.length?toks:[name ? 'name:'+name : null].filter(Boolean) });
  }
}

// 按并查集归并身份
const personOfToken = {};
const persons = new Map(); // root -> person
for (const t of rowTokens) {
  const root = t.tokens.length ? uf.find(t.tokens[0]) : null;
  let p;
  if (root !== null && personOfToken[root]) p = personOfToken[root];
  else {
    p = { events: [], id: t.id, emp: t.emp, name: t.name, key: root };
    if (root !== null) personOfToken[root] = p;
    persons.set(root, p);
    // 无 token（仅姓名）每人一份
    if (root === null) persons.set(null, p);
  }
  if (t.id) p.id = t.id;
  if (t.emp) p.emp = t.emp;
  if (t.name) p.name = t.name;
  p.events.push({ date: t.date, dept: t.dept, team: t.team, position: t.position });
  // 若 rowTokens 无 token 的 null 从 Map 里多对象，需处理：先不做
}

// 重新组织 persons（处理 null 键冲突：无 token 行各自独立）
// dp: 上面把无token都放进 root=null 同一对象了，这里纠正：无token按 (id/emp/name) 无法归并，实用按姓名分批
const nullRows = rowTokens.filter(t=>t.tokens.length===0);

// ---------- 分段 ----------
let totalEvents = 0, totalSegments = 0, totalSkipped = 0;
const segDist = {};
const byIdPersons = [], nonIdPersons = [];
for (const [root, p] of persons) {
  if (root === null) continue; // 无 token 的人在下方单独处理
  p.events.sort((a,b)=>a.date-b.date);
  const segs = []; let last = null;
  for (const ev of p.events) {
    if (last && segKey(last.dept, last.team, last.position) === segKey(ev.dept, ev.team, ev.position)) last.end = ev.date;
    else segs.push(last = { start: ev.date, end: ev.date, dept: ev.dept, team: ev.team, position: ev.position });
  }
  p.segments=segs; p.firstSeen=segs[0].start; p.lastSeen=segs[segs.length-1].end;
  totalEvents+=p.events.length; totalSegments+=segs.length; totalSkipped+=p.events.length-segs.length;
  segDist[segs.length]=(segDist[segs.length]||0)+1;
  (p.id?byIdPersons:nonIdPersons).push(p);
}

// ---------- 最新在职 ----------
function mainRecordsOfLatest(){ const last=files.map(f=>({f,d:parseSnapshot(f)})).filter(x=>x.d).sort((a,b)=>b.d-a.d); return last; }
let currentMain = [];
const latestDesc = files.map(f=>({f,d:parseSnapshot(f)})).filter(x=>x.d).sort((a,b)=>b.d-a.d)[0];
if (latestDesc) {
  const wb = XLSX.readFile(path.join(DIR, latestDesc.f));
  const main = pickMain(wb);
  currentMain = main ? main.records : [];
}
const currentIds = new Set();
currentMain.forEach(r=>{ const id=cleanID(r['身份证号']||r['身份证']); if(id) currentIds.add(id); });

// 离职表(2026.9.1)
let leaveSheetIds = new Set(), leaveList = [];
const leaveWb = files.map(f=>({f,d:parseSnapshot(f)})).filter(x=>x.d && x.d.getFullYear()>=2026).sort((a,b)=>a.d-b.d);
for (const { f, d } of leaveWb) {
  const wb = XLSX.readFile(path.join(DIR, f));
  if (wb.SheetNames.some(s=>/离职/.test(s))) {
    for (const sn of wb.SheetNames) {
      if (!/离职/.test(sn)) continue;
      for (const rec of scanSheet(wb.Sheets[sn]).records) {
        const id=cleanID(rec['身份证号']||rec['身份证']);
        if (id) { leaveSheetIds.add(id); leaveList.push({ id, name: String(rec['姓名']??'').trim(), leave: rec['离职日期'] }); }
      }
    }
  }
}

// 对账
let depFromSheet=0, depInferred=0, currentWithHistory=0, currentNoHistory=0;
for (const p of byIdPersons) {
  if (currentIds.has(p.id)) { currentWithHistory++; continue; }
  if (leaveSheetIds.has(p.id)) depFromSheet++; else depInferred++;
}
for (const id of currentIds) if (!byIdPersons.some(p=>p.id===id)) currentNoHistory++;

// 无 token 行（仅姓名）单独计数
const onlyNameCount = nullRows.length;

// ---------- 输出 ----------
console.log('===== 文件与主表择优 =====');
console.log(`共 ${files.length} 个文件；无法解析日期 ${noDateFiles.length} 个：${noDateFiles.join(', ')||'无'}`);
rowsByFile.forEach(s=>console.log(`${fmt(s.date)}\t${s.rows}行\t主表[${s.sn}]`));

console.log('\n===== 人员规模 =====');
console.log(`逻辑人总数 = ${persons.size - 1}（含 ${onlyNameCount} 个仅姓名行）`);
console.log(`有真实身份证 = ${byIdPersons.length}；仅员工编码 = ${nonIdPersons.length}；仅姓名行 = ${onlyNameCount}`);
console.log(`总事件行 = ${totalEvents}；任职段 = ${totalSegments}；稳定跳过 = ${totalSkipped}（省 ${Math.round(totalSkipped/totalEvents*100)}%）`);
console.log('任职段数分布:', Object.entries(segDist).sort((a,b)=>a[0]-b[0]).map(([k,v])=>`${k}段:${v}`).join('  '));

console.log('\n===== 在职/离职对账 =====');
console.log(`最新在职(id去重) = ${currentIds.size}（${latestDesc?latestDesc.f:''}）`);
console.log(`有历史&在职 = ${currentWithHistory}；无历史&在职 = ${currentNoHistory}`);
console.log(`离职 = ${depFromSheet+depInferred}（离职表 ${depFromSheet}，快照推断 ${depInferred}）`);

console.log('\n===== 示例(前12个在职多段/离职) =====');
const interesting=[...byIdPersons.filter(p=>p.segments.length>1||!currentIds.has(p.id))].sort((a,b)=>a.id<b.id?-1:1).slice(0,12);
for (const p of interesting) {
  const seg=p.segments.map(s=>`${fmt(s.start)}~${fmt(s.end)} ${s.dept||'-'}/${s.position||'-'}`).join(' | ');
  console.log(`${p.name}\t${p.id}\t[${currentIds.has(p.id)?'在职':'离职'}]\t${seg}`);
}

console.log('\n===== 数据质量 =====');
console.log(`身份证格式异常 = ${byIdPersons.filter(p=>!/^\d{17}[\dX]$/.test(p.id)).length}`);
console.log('保留脚本供后续正式入库复用。');
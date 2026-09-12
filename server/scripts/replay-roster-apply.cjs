/**
 * 花名册历史重放 —— 落库引擎（Phase 1，含 --plan 自测 与 --apply 写库）
 *
 * 用法:
 *   node replay-roster-apply.cjs --plan                          # 生成写计划报告，不写库（自测）
 *   node replay-roster-apply.cjs --apply                         # 正式写库（需先通过规划评审 + Phase0备份）
 *
 * 设计文档: server/花名册历史重放入库设计.md （§2.1 规范映射 / §3 方案甲 / §5 回滚 / §6 验收）
 * 回滚:     replay-phase1-rollback.cjs（用 Phase0 备份表恢复）
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');
const { encrypt, hashSensitive } = require('../utils/encryption');

const DIR = process.env.ROSTER_SOURCE_DIR || 'G:/safety_vault/08_保险及人员管理/花名册';
const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');

// ---------------- 表头别名 ----------------
const ALIAS = {
  员工编号: '员工编号', 员工编码: '员工编号', 工号: '员工编号', 人员编号: '员工编号',
  身份证号: '身份证号', 身份证号码: '身份证号', 身份证件号: '身份证号', 身份证: '身份证号',
  所属部门: '所属部门', 部门: '所属部门', 所属乡镇: '所属部门', 所属部门名称: '所属部门', 二级部门: '所属部门', 组织: '所属部门',
  班组: '班组', 二级乡镇: '班组', 片区: '班组', 负责区域: '班组',
  职位: '职位', 岗位: '职位', 职务: '职位',
  姓名: '姓名', 性别: '性别', 出生日期: '出生日期', 出生年月: '出生日期',
  入职日期: '入职日期', 入职时间: '入职日期',
  联系电话: '联系电话', 电话: '联系电话', 手机: '联系电话', 手机号: '联系电话', 手机号码: '联系电话',
  直接上级: '直接上级', 上级: '直接上级', 上级姓名: '直接上级',
};
const cleanID = (s) => String(s ?? '').trim().toUpperCase().replace(/[^0-9X]/g, '');
const fmt = (d) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null);

// ---------------- §2.1 规范映射 ----------------
const townPrefix = (d) => {
  const s = String(d || '').trim();
  const m = s.match(/^(.+?[镇乡街道])/);
  if (m) return m[1].replace(/(乡|镇|街道|街|道)$/, '');
  return s.replace(/(乡|镇|街道|街|道)$/, '');
};
// 部门规范：车队司机统一为「车队」；职能/部室按别名归并；其余裁到乡镇前缀
const canonicalDept = (dept, position) => {
  const s = String(dept || '').trim();
  const pos = String(position || '').trim();
  if (/车队|转运车辆|转运车|机械作业中心|勾臂|钩臂/.test(s) && /司机|驾驶|车/.test(pos)) return '车队';
  if (/项目管理层|项目管理/.test(s)) return '项目管理层';
  if (/人力综合/.test(s)) return '人力综合部';
  if (/安环品质部|安环管理部|安环/.test(s)) return '安环管理部';
  if (/生产运营部|生产管理部|生产运营/.test(s)) return '生产管理部';
  if (/环卫作业中心/.test(s)) return '环卫作业中心';
  if (/财务/.test(s)) return '财务部';
  const tp = townPrefix(s);
  return tp || s;
};
// 岗位粗分类-角色级；作业中心经理线独立成类，以记录「乡镇管理员→乡镇作业中心经理」升迁主线
const roleClass = (p) => {
  const s = String(p || '').trim();
  if (!s) return '';
  if (/司机|驾驶|钩臂|勾臂|转运|车辆|车队/.test(s)) return '司机';
  if (/作业中心经理|乡镇主管|人工片区长|片区长|片区经理/.test(s)) return '作业中心经理';
  if (/总经理|经理|总监|区长|副总/.test(s)) return '经理';
  if (/班长|网格长|站长|管理员|主管|负责人/.test(s)) return '管理员';
  if (/专员|文员|会计|人事|行政|财务|秘书|助理|库管|标准化|质检|维保/.test(s)) return '职能';
  if (/后勤|食堂|保安|门卫|公益/.test(s)) return '后勤';
  if (/保洁|清扫|环卫|清洁/.test(s)) return '保洁员';
  return '其他';
};
const segKey = (dept, position) => `${canonicalDept(dept, position)}│${roleClass(position)}`;

// ---------------- 解析 ----------------
function parseSnapshot(file) {
  const base = file.replace(/\.[A-Za-z0-9]+$/i, '');
  let m = base.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  m = base.match(/^(\d{4})[.\-]?(\d{1,2})[.\-]?(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  return null;
}
function scanSheet(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '', header: 1 });
  let hi = -1;
  for (let i = 0; i < rows.length && i < 8; i++) {
    const flat = rows[i].map((c) => String(c ?? '').trim()).map((h) => ALIAS[h] || h);
    if (flat.includes('姓名') && (flat.includes('身份证号') || flat.includes('员工编号'))) { hi = i; break; }
  }
  if (hi < 0) return { records: [], cov: { id: false, dept: false, pos: false } };
  const hdr = rows[hi].map((c) => ALIAS[String(c ?? '').trim()] || String(c ?? '').trim());
  const cov = { id: hdr.includes('身份证号'), dept: hdr.includes('所属部门'), pos: hdr.includes('职位') };
  const records = [];
  for (let r = hi + 1; r < rows.length; r++) {
    const raw = rows[r];
    if (!raw || raw.every((c) => String(c ?? '').trim() === '')) continue;
    const rec = {};
    for (let c = 0; c < hdr.length; c++) if (hdr[c] && rec[hdr[c]] === undefined) rec[hdr[c]] = raw[c];
    records.push(rec);
  }
  return { records, cov };
}
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
class UF { constructor() { this.p = {}; } find(x) { if (this.p[x] === undefined) this.p[x] = x; while (this.p[x] !== x) { this.p[x] = this.p[this.p[x]]; x = this.p[x]; } return x; } union(a, b) { const ra = this.find(a), rb = this.find(b); if (ra !== rb) this.p[rb] = ra; } }

// 离职表（真实日期）
function loadLeaveSheet(files) {
  const ids = new Map(); // id -> {name, leaveDate}
  for (const { f, d } of files) {
    const wb = XLSX.readFile(path.join(DIR, f));
    for (const sn of wb.SheetNames) {
      if (!/离职/.test(sn)) continue;
      for (const rec of scanSheet(wb.Sheets[sn]).records) {
        const id = cleanID(rec['身份证号'] || rec['身份证']);
        if (!id) continue;
        const name = String(rec['姓名'] ?? '').trim();
        let leave = null;
        const rawL = rec['离职日期'] ?? rec['离厂日期'];
        if (rawL != null) leave = new Date(rawL);
        if (leave && isNaN(leave)) leave = null;
        if (!ids.has(id) || (!ids.get(id).leave && leave)) ids.set(id, { name, leave });
      }
    }
  }
  return ids;
}

// ---------------- 主流程 ----------------
(async () => {
  const files = fs.readdirSync(DIR).filter((f) => /\.(xlsx?|XLSX?)$/i.test(f)).sort((a, b) => {
    const da = parseSnapshot(a), db = parseSnapshot(b);
    if (!da && !db) return a < b ? -1 : 1; if (!da) return -1; if (!db) return 1; return da - db || (a < b ? -1 : 1);
  });
  const dated = files.map((f) => ({ f, d: parseSnapshot(f) })).filter((x) => x.d).sort((a, b) => a.d - b.d);
  const dates = dated.map((x) => x.d);
  const noDateFiles = files.filter((f) => !parseSnapshot(f));

  // 1) 读取所有快照行
  const uf = new UF();
  const rowTokens = [];
  const rowsByFile = [];
  const mainCache = {}; // file -> records
  function getMain(file) {
    if (mainCache[file]) return mainCache[file];
    const wb = XLSX.readFile(path.join(DIR, file));
    const main = pickMain(wb);
    mainCache[file] = main ? main.records : [];
    return mainCache[file];
  }
  for (const { f, d } of dated) {
    const records = getMain(f);
    rowsByFile.push({ f, date: d, rows: records.length });
    for (const rec of records) {
      const id = cleanID(rec['身份证号'] || rec['身份证']);
      const emp = String(rec['员工编号'] ?? '').trim();
      const name = String(rec['姓名'] ?? '').trim();
      // 剔除占位/待招/空姓名行（不建员工）
      if (!name || /待招|待聘|招聘|待定/.test(name)) continue;
      const toks = [];
      if (id) toks.push('id:' + id); if (emp) toks.push('emp:' + emp);
      if (toks.length >= 2) uf.union(toks[0], toks[1]);
      rowTokens.push({
        date: d, id, emp, name,
        dept: String(rec['所属部门'] ?? '').trim(),
        team: String(rec['班组'] ?? '').trim(),
        position: String(rec['职位'] ?? '').trim(),
        tokens: toks.length ? toks : ['name:' + name],
      });
    }
  }

  // 2) 逻辑人归并：按 union 根分组；同一根出现多个不同身份证时必须按身份证拆分，
  //    避免「员工编码跨人被复用」导致不同人坍缩成一个（会把在职人员误并掉）。
  const rootBuckets = new Map(); // root -> {ids:Set, emps:Set, events:[]}
  for (const t of rowTokens) {
    const root = t.tokens.length ? uf.find(t.tokens[0]) : 'u_' + rowTokens.indexOf(t);
    if (!rootBuckets.has(root)) rootBuckets.set(root, { ids: new Set(), emps: new Set(), events: [] });
    const b = rootBuckets.get(root);
    if (t.id) b.ids.add(t.id);
    if (t.emp) b.emps.add(t.emp);
    b.events.push(t);
  }
  let uKey = 0;
  const persons = new Map();
  const makePerson = (id, emp, name, events) => {
    const key = id ? 'id:' + id : 'u:' + (uKey++);
    const p = { id: id || '', emp: emp || '', name: name || '', events: events ? [...events] : [], key, leave: {} };
    persons.set(key, p);
    return p;
  };
  for (const b of rootBuckets.values()) {
    const ids = [...b.ids];
    if (ids.length <= 1) {
      // 单身份证，或纯员工编码
      const id = ids[0] || '';
      const emp = ids.length
        ? (b.events.find((e) => e.id === id && e.emp)?.emp || '')
        : ([...b.emps][0] || '');
      const name = [...new Set(b.events.map((e) => e.name).filter(Boolean))].sort((x, y) => y.length - x.length)[0] || '';
      const p = makePerson(id, emp, name, b.events);
      if (!ids.length && !p.emp) p.emp = [...b.emps][0] || '';
    } else {
      // 多身份证冲突：按身份证拆分
      for (const id of ids) {
        const subE = b.events.filter((e) => e.id === id);
        const p = makePerson(id, subE.find((e) => e.emp)?.emp || '', '', subE);
        p.name = [...new Set(subE.map((e) => e.name).filter(Boolean))].sort((x, y) => y.length - x.length)[0] || '';
      }
      // 无身份证事件：按员工编码归属到对应子人；找不到才独立成单体
      for (const e of b.events.filter((ev) => !ev.id)) {
        const target = ids.map((id) => persons.get('id:' + id)).find((p) => p && p.emp && p.emp === e.emp);
        if (target) { target.events.push(e); if (!target.name) target.name = e.name; }
        else { const p = makePerson('', e.emp, e.name, [e]); if (!p.emp) p.emp = e.emp; }
      }
    }
  }
  // 排序事件
  for (const p of persons.values()) p.events.sort((a, b) => a.date - b.date);

  // 3) 残影桥接：无身份证残影人与「唯一同名且任职时间窗口重叠」的在职身份证人合并
  //    规则：姓名+入职日（首见快照）桥接；同名若有多个在职工则无法消歧，保留残影。
  const byNameId = new Map();
  for (const p of persons.values()) if (p.id.trim()) {
    const arr = byNameId.get(p.name) || [];
    arr.push(p); byNameId.set(p.name, arr);
  }
  const ghostMerges = [];
  for (const g of persons.values()) {
    if (g.id || !g.name) continue;
    const cands = (byNameId.get(g.name) || []);
    const uniq = cands.length === 1;
    if (!uniq) continue;
    const c = cands[0];
    const gStart = g.events[0]?.date;
    const cStart = c.events[0]?.date, cEnd = c.events[c.events.length - 1]?.date;
    const overlap = gStart && cStart && cEnd && gStart >= cStart && gStart <= cEnd;
    if (overlap) ghostMerges.push({ g, c });
  }
  for (const { g, c } of ghostMerges) {
    c.events.push(...g.events);
    if (!c.emp) c.emp = g.emp;
    persons.delete(g.key);
  }

  // 4) 归一化 + 众数平滑 + 人员感知部门
  for (const p of persons.values()) {
    p.events.sort((a, b) => a.date - b.date);
    // 4a) 众数岗位（角色级）
    const rc = {};
    for (const ev of p.events) { const r = roleClass(ev.position); rc[r] = (rc[r] || 0) + 1; }
    let domRole = '', mxc = 0;
    for (const k in rc) if (rc[k] > mxc) { mxc = rc[k]; domRole = k; }
    p.domRole = domRole;
    // 4b) 车队成员：末段部门为车系单位且众数岗位为司机 → 车队；另有王洪庆
    const last = p.events[p.events.length - 1];
    p.isFleet = ((/车队|转运车辆|勾臂|钩臂|机械作业中心/.test(last.dept)) && domRole === '司机')
      || p.name === '王洪庆';
    // 4c) 事件级生效岗位：孤立错标（该岗位仅出现1次）或空岗位 → 用众数岗位平滑
    const effRole = (ev) => {
      const r = roleClass(ev.position);
      if (r && r !== domRole && rc[r] === 1) return domRole;
      if (!String(ev.position || '').trim()) return domRole || r;
      return r;
    };
    // 4d) 人员感知规范部门
    const canonDept = (dept, rol) => {
      const s = String(dept || '').trim();
      if (rol === '司机') {
        if (p.isFleet) return '车队';
        const tp = townPrefix(s);
        return tp || '乡镇作业中心';
      }
      if (/项目管理层|项目管理/.test(s)) return '项目管理层';
      if (/人力综合/.test(s)) return '人力综合部';
      if (/安环品质部|安环管理部|安环/.test(s)) return '安环管理部';
      if (/生产运营部|生产管理部|生产运营/.test(s)) return '生产管理部';
      if (/环卫作业中心/.test(s)) return '环卫作业中心';
      if (/财务/.test(s)) return '财务部';
      const tp = townPrefix(s);
      return tp || s;
    };
    // 4e) 分段
    let segs = []; let lastSeg = null;
    for (const ev of p.events) {
      const rol = effRole(ev);
      const k = `${canonDept(ev.dept, rol)}│${rol}`;
      if (lastSeg && lastSeg.key === k) { lastSeg.end = ev.date; lastSeg.eventCount++; }
      else segs.push(lastSeg = { key: k, dept: ev.dept, position: ev.position, start: ev.date, end: ev.date, eventCount: 1 });
    }
    // 4f) 岛屿平滑：前后邻段相同而自身不同的孤立段 → 收敛为邻段键（消除「司机↔职能」横跳，
    //     同时保留单调的真实变迁如 管理员→作业中心经理；单调段前后不同，不成岛）
    for (let it = 0; it < 6; it++) {
      let changed = false;
      for (let i = 1; i < segs.length - 1; i++) {
        if (segs[i - 1].key === segs[i + 1].key && segs[i].key !== segs[i - 1].key) {
          segs[i].key = segs[i - 1].key; changed = true;
        }
      }
      if (!changed) break;
    }
    // 4g) 合并相邻同键
    const merged = [];
    for (const s of segs) {
      const last = merged[merged.length - 1];
      if (last && last.key === s.key) { last.end = s.end; last.eventCount += s.eventCount; }
      else merged.push({ ...s });
    }
    p.segments = merged;
    p.firstSeen = merged[0].start;
    p.lastSeen = merged[merged.length - 1].end;
  }

  // 4) 最新在职快照（权威）
  const latest = dated[dated.length - 1];
  const latestIds = new Set();
  getMain(latest.f).forEach((r) => { const id = cleanID(r['身份证号'] || r['身份证']); if (id) latestIds.add(id); });

  // 5) 离职表
  const leaveSheet = loadLeaveSheet(dated);

  // 6) 快照上界推断：一个日期之后的下一个快照日期
  const nextDate = (d) => {
    for (const x of dates) if (x > d) return x;
    return new Date(d.getTime() + 24 * 3600 * 1000);
  };

  // 7) 计算最终状态
  let planCurrent = 0, leaveReal = 0, leaveInferred = 0;
  for (const p of persons.values()) {
    const isCurrent = p.id && latestIds.has(p.id);
    p.isCurrent = !!isCurrent;
    if (isCurrent) { planCurrent++; continue; }
    const ls = p.id ? leaveSheet.get(p.id) : undefined;
    if (p.id && leaveSheet.has(p.id) && ls && ls.leave) { p.leave.date = fmt(ls.leave); p.leave.mode = '离职表'; leaveReal++; }
    else { p.leave.mode = '快照推断'; p.leave.date = fmt(nextDate(p.lastSeen)); leaveInferred++; }
    p.leave = p.leave || {};
  }

  // 8) 载入存量 employee（只读），算 merge
  const existingByHash = new Map(), existingByCode = new Map();
  if (true) {
    const r2 = await pool.query(`SELECT id, id_card_hash, employee_code FROM employee`);
    for (const x of r2.rows) { if (x.id_card_hash) existingByHash.set(x.id_card_hash, x.id); if (x.employee_code) existingByCode.set(x.employee_code, x.id); }
  }

  // ---- 写计划报告 ----
  const totalEvents = [...persons.values()].reduce((a, p) => a + p.events.length, 0);
  const totalSegs = [...persons.values()].reduce((a, p) => a + p.segments.length, 0);
  let newEmp = 0, reuseEmp = 0;
  for (const p of persons.values()) {
    const hit = (p.id && existingByHash.has(p.id)) || (p.emp && existingByCode.has(p.emp));
    if (hit) reuseEmp++; else newEmp++;
  }

  console.log('========== 文件 ==========');
  console.log(`共 ${files.length} 文件；无法解析日期 ${noDateFiles.length}: ${noDateFiles.join(',')||'无'}`);
  console.log('========== 逻辑人 ==========');
  console.log(`逻辑人 ${persons.size}；事件行 ${totalEvents}；任职段 ${totalSegs}（跳过 ${Math.round((1-totalSegs/totalEvents)*100)}%）`);
  console.log(`合并存量: 复用 ${reuseEmp} / 新建 ${newEmp}`);
  console.log('========== 在职/离职 ==========');
  console.log(`计划在职(is_current=true) = ${planCurrent}（最新 ${latest.f} id去重 ${latestIds.size}）`);
  console.log(`离职: 离职表 ${leaveReal}，快照推断 ${leaveInferred}`);
  const diff = persons.size - planCurrent;

  console.log('========== 轨迹样例（前14）==========');
  const show = [...persons.values()].sort((a, b) => (a.id < b.id ? -1 : 1)).slice(0, 14);
  for (const p of show) {
    const seg = p.segments.map((s) => `${fmt(s.start)}~${fmt(s.end)} ${s.key}`).join(' | ');
    console.log(`${p.name}\t${p.id ? p.id : '(仅编码)'}\t[${p.isCurrent ? '在职' : '离职'}]\t${seg}`);
  }

  // 对账：最新在职人员是否全部有逻辑人 & 身份可匹配
  let curNoHist = 0;
  const noHistNames = [];
  const latestRecByName = {};
  getMain(latest.f).forEach((r) => {
    const id = cleanID(r['身份证号'] || r['身份证']);
    if (id) latestRecByName[id] = String(r['姓名'] ?? '').trim();
  });
  for (const id of latestIds) {
    if (![...persons.values()].some((p) => p.id === id)) { curNoHist++; noHistNames.push(`${latestRecByName[id]||'?'}\t${id}`); }
  }
  let curWithHist = 0;
  for (const p of persons.values()) if (p.isCurrent) curWithHist++;

  // 占位/待招 人员
  const placeholderPersons = [...persons.values()].filter((p) => /待招|待聘|招聘|待定/.test(p.name));
  // 人员众数非司机但存在司机疑似 = 异常司机行
  const driverish = [...persons.values()].filter((p) => p.segments.some((s) => s.key.endsWith('│司机')));
  // 仅员工编码残影人（无身份证、离职）：多为老体系无id文件里员工编码与新体系不同导致的“分身”
  const idless = [...persons.values()].filter((p) => !p.id);
  const idlessCurrent = idless.filter((p) => p.isCurrent);
  // 无id残影人名是否与某有id在职人名相同（疑似同一人分身）
  const idPersonNames = new Map();
  for (const p of persons.values()) if (p.id) idPersonNames.set(p.name, p);
  const ghostName = idless.filter((p) => idPersonNames.has(p.name));

  if (APPLY) {
    console.log('\n========== APPLY：写库 ==========');
    const stateFile = path.join(__dirname, '.roster_replay_state.json');
    let state;
    try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); }
    catch (e) { console.error('未检测到 Phase0 备份状态（.roster_replay_state.json），拒绝写库。请先运行 replay-phase0-backup.cjs'); process.exit(1); }
    const suffix = state.suffix;
    console.log('引用 Phase0 备份 suffix =', suffix, '（回滚用它恢复）');

    const client = await pool.connect();
    let newEmp = 0, reuseEmp = 0, insAss = 0, failPersons = [];
    try {
      await client.query('BEGIN');
      // 方案甲：整体软删归档现有 assignment（保留行供审计/回滚）
      const arch = await client.query(
        `UPDATE employee_assignment SET is_primary=false, is_current=false, is_deleted=true,
                end_date=COALESCE(end_date, CURRENT_DATE), updated_at=CURRENT_TIMESTAMP
         WHERE is_deleted=false`
      );
      console.log(`[方案甲] 已归档现有 assignment ${arch.rowCount} 条`);

      let idx = 0;
      const personsSorted = [...persons.values()].sort((a, b) => (a.id || '').localeCompare(b.id || '') || a.name.localeCompare(b.name));
      for (const p of personsSorted) {
        const sp = 'sp_' + (idx++);
        await client.query(`SAVEPOINT ${sp}`);
        try {
          const hash = p.id ? hashSensitive(p.id) : null;
          let empId = null;
          if (hash && existingByHash.has(hash)) empId = existingByHash.get(hash);
          if (!empId && p.emp && existingByCode.has(p.emp)) empId = existingByCode.get(p.emp);
          if (!empId) {
            const ins = await client.query(
              `INSERT INTO employee (employee_code, id_card, id_card_hash, name, is_public_welfare, created_at, updated_at)
               VALUES ($1,$2,$3,$4,false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id`,
              [p.emp || null, p.id ? encrypt(p.id) : null, hash, p.name]
            );
            empId = ins.rows[0].id; newEmp++;
            if (p.emp) existingByCode.set(p.emp, empId);
            if (hash) existingByHash.set(hash, empId);
          } else { reuseEmp++; }

          const n = p.segments.length;
          for (let sIdx = 0; sIdx < n; sIdx++) {
            const seg = p.segments[sIdx];
            const isCur = p.isCurrent && sIdx === n - 1;
            const unit = seg.key.split('│')[0];
            let endDate;
            if (isCur) endDate = null;
            else if (sIdx === n - 1 && !p.isCurrent && p.leave.mode) endDate = p.leave.date; // 离职段（真实或推断上界）
            else endDate = fmt(seg.end);
            let remark = null;
            if (sIdx === n - 1 && !p.isCurrent && p.leave.mode) remark = `离职:${p.leave.mode}${p.leave.mode === '快照推断' ? '(上界)' : ''}`;
            await client.query(
              `INSERT INTO employee_assignment
                 (employee_id, position_id, supervisor_id, dept_name, is_primary, is_current, status,
                  start_date, end_date, remark, created_by, created_at, updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'history_replay', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
              [empId, null, null, unit, isCur, isCur, isCur ? 'active' : 'former', fmt(seg.start), endDate, remark]
            );
            insAss++;
          }
          await client.query(`RELEASE SAVEPOINT ${sp}`);
        } catch (err2) {
          try { await client.query(`ROLLBACK TO SAVEPOINT ${sp}`); } catch (_) { /* 外层事务兜底 */ }
          if (p.isCurrent) {
            throw new Error(`当前在职人员写入失败，中止全事务: ${p.name}(${p.id}) ${err2.message}`);
          }
          failPersons.push(`${p.name}(${p.id || p.emp || '无键'}): ${err2.message}`);
        }
      }
      await client.query('COMMIT');
      console.log(`写库提交成功：新建员工 ${newEmp}，复用 ${reuseEmp}，写入任职 ${insAss}，失败隔离 ${failPersons.length}`);
      failPersons.slice(0, 20).forEach((f) => console.error('   fail>', f));
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[APPLY] 事务失败，已全量回滚:', err.message);
      process.exit(1);
    } finally {
      client.release();
    }

    state.apply = { ts: new Date().toISOString(), suffix, newEmployee: newEmp, reuseEmployee: reuseEmp, assignments: insAss, failed: failPersons.length };
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));

    // 回读对账
    const cur = await pool.query(`SELECT COUNT(*)::int c, COUNT(DISTINCT dept_name) d FROM employee_assignment WHERE is_current=true AND is_deleted=false`);
    const archC = await pool.query(`SELECT COUNT(*)::int c FROM employee_assignment WHERE is_deleted=true`);
    const empC = await pool.query(`SELECT COUNT(*)::int c FROM employee WHERE is_deleted=false`);
    console.log('\n========== 写库对账 ==========');
    console.log(`当前在职 assignment: ${cur.rows[0].c}（应=1293）；去重单位×岗位: ${cur.rows[0].d}`);
    console.log(`归档(软删) assignment: ${archC.rows[0].c}`);
    console.log(`employee 在职行: ${empC.rows[0].c}`);
    process.exit(0);
  }

  console.log('========== 对账 ==========');
  console.log(`最新在职(2026.9.1)id = ${latestIds.size}；有历史&在职 ${curWithHist}；在职无历史 ${curNoHist}`);
  console.log('--- 在职无历史名单 ---');
  noHistNames.forEach((n) => console.log(' ', n));
  console.log(`--- 占位/待招逻辑人 ${placeholderPersons.length} ---`);
  placeholderPersons.forEach((p) => console.log(' ', p.name, p.emp));
  console.log(`--- 含司机段逻辑人 ${driverish.length}，其中存在非司机段的人数:`);
  console.log(' ', driverish.filter((p) => p.segments.some((s) => !s.key.endsWith('│司机'))).length);
  console.log(`--- 无身份证残影人 ${idless.length}（其中被误标在职 ${idlessCurrent.length}），与在职同名人 ${ghostName.length} ---`);
  ghostName.slice(0, 20).forEach((p) => console.log('   ghost?', p.name, '| 残影段:', p.segments.map((s) => s.key).join(' / ')));

  // 关键主线校验：刘建军司机归车队；管理员→作业中心经理升迁示例
  const lj = [...persons.values()].find((p) => p.name === '刘建军' && p.id === '131121198004010251');
  if (lj) console.log('\n[刘建军·司机→车队] 段:', lj.segments.map((s) => `${s.key}|${s.eventCount}`).join('  '));
  const mgrTrans = [...persons.values()].filter((p) => p.segments.some((s) => s.key.endsWith('│作业中心经理')) && p.segments.length >= 2).slice(0, 5);
  console.log('\n[管理员→作业中心经理 升迁示例]');
  mgrTrans.forEach((p) => console.log('  ', p.name, '=>', p.segments.map((s) => s.key).join(' | ')));
  const curDeps = new Set([...persons.values()].filter((p) => p.isCurrent).map((p) => p.segments[p.segments.length - 1].key));
  console.log('当前在职规范单位×岗位集合数:', curDeps.size);
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
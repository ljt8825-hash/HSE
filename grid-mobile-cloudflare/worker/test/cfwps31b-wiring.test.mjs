/* CF-WPS-31 前端接线校验：级联状态机 + 返回语义 + 惰性加载
   做法：用最小 DOM 桩在 Node 里跑 check.html 的内联脚本里「级联相关的纯函数」，
   不引 jsdom（本项目无依赖），只把用到的选择器/元素补上。
   目的：抓「接线漏绑」「层级回退错」「一上来就拉全量花名册」这三类回归。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.join(HERE, '..', '..', 'frontend', 'check.html');
const html = fs.readFileSync(HTML, 'utf8');

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + ' :: ' + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ' expected=' + JSON.stringify(b) + ' got=' + JSON.stringify(a)); };
const ok = (v, m) => { if (!v) throw new Error(m || 'assertion failed'); };

console.log('\n=== CF-WPS-31 frontend cascade wiring ===\n');

/* ---------- 1. 结构断言：元素 id 必须齐全（漏一个就白屏） ---------- */
const NEED_IDs = ['co-back', 'co-title', 'co-crumbs', 'co-head', 'co-sub', 'co-cascade',
  'co-search-wrap', 'co-search-toggle', 'co-search-box', 'co-search-input', 'co-search-label', 'co-person-list',
  'opt-self', 'view-co-search'];
NEED_IDs.forEach(id => {
  t('HTML 含 #' + id, () => ok(html.includes('id="' + id + '"'), 'missing id="' + id + '"'));
});

/* ---------- 2. 脚本内静态断言：接线必须存在 ---------- */
const S = html.slice(html.indexOf('<script'), html.lastIndexOf('</script>'));

t('#opt-self 绑到级联复位（不再直接 renderCoSearch 全量）', () => {
  const m = S.match(/\$\("#opt-self"\)\.onclick\s*=\s*\(\)\s*=>\s*\{([^}]*)\}/);
  ok(m, '未找到 #opt-self 绑定');
  ok(/resetCoCascade\(\)/.test(m[1]), '#opt-self 未调用 resetCoCascade');
  ok(/renderCoCascade\(\)/.test(m[1]), '#opt-self 未调用 renderCoCascade');
  ok(!/renderCoSearch\(/.test(m[1]), '#opt-self 仍直接调用 renderCoSearch（会退化成全量搜索页）');
});

t('#co-back 已绑定（不是遗留的 data-back=handle）', () => {
  ok(/\$\("#co-back"\)\.onclick\s*=/.test(S), '#co-back 未绑 onclick');
  ok(/coBackStep\(\)/.test(S), '#co-back 未走 coBackStep');
  ok(!/id="co-back"[^>]*data-back=/.test(html), '#co-back 还带 data-back（会被通用绑定覆盖成直接跳转）');
});

t('#co-search-toggle 已绑定（展开/收起搜索面板）', () => {
  ok(/\$\("#co-search-toggle"\)\.onclick\s*=/.test(S), '#co-search-toggle 未绑 onclick');
});

t('coBackStep / resetCoCascade / coLevel 均已定义', () => {
  ['function coBackStep()', 'function resetCoCascade()', 'function coLevel()', 'function renderCoCascade()']
    .forEach(sig => ok(S.includes(sig), 'missing ' + sig));
});

t('renderCoTeams 不再有死代码（body 判定重复行已删）', () => {
  ok(!/draft\.coTown !== \(body && body\.town\) && !body/.test(S), '残留了恒真死代码行');
});

t('draft 初始化含级联四个字段', () => {
  const m = S.match(/draft = \{ scenePhoto[^}]*\}/);
  ok(m, '未找到 draft 初始化');
  ['coTown', 'coTeamDept', 'coTeamMgr', 'coTeamAdmins'].forEach(k => ok(m[0].includes(k), 'draft 缺 ' + k));
});

/* ---------- 3. 最小 DOM 桩：把级联函数真跑一遍 ---------- */
function mkEl(id) {
  const el = {
    id, _cls: new Set(), _children: [], innerHTML: '', textContent: '', value: '', dataset: {},
    get classList() {
      const s = this._cls;
      return {
        add: c => s.add(c), remove: c => s.delete(c),
        contains: c => s.has(c),
        toggle: (c, on) => { (on === undefined ? !s.has(c) : on) ? s.add(c) : s.delete(c); return s.has(c); }
      };
    },
    appendChild(c) { this._children.push(c); return c; },
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, focus() {}
  };
  return el;
}
const els = new Map();
NEED_IDs.forEach(id => els.set(id, mkEl(id)));
els.get('co-search-box').classList.add('hidden');
els.get('co-search-wrap').classList.remove('hidden');

const calls = { towns: 0, teams: [], roster: [] };
let townData = null, teamData = {};

const window = { addEventListener() {}, scrollTo() {}, location: { href: 'x' }, history: {} };

globalThis.document = {
  getElementById: id => els.get(id) || null,
  createElement: tag => mkEl('new-' + tag),
  querySelector: () => null,
  querySelectorAll: () => []
};
globalThis.window = window;
globalThis.location = window.location;
globalThis.history = window.history;
// navigator 在 Node 22 是只读 getter，级联沙箱也不依赖它，不覆写

const $ = sel => els.get(String(sel).replace(/^#/, '')) || mkEl(sel);
const $$ = () => [];

/* 从 check.html 里摘出「级联段落」做沙箱求值：避免整页脚本的副作用（boot/geolocation） */
function extractFn(name) {
  // 注意：源文件里是 `async function foo(`，切片必须带上 async 前缀，否则 await 报 SyntaxError
  const re = new RegExp('(async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = S.match(re);
  ok(m, 'cannot find function ' + name);
  const i = S.indexOf(m[0]);
  // 花括号配平
  let d = 0, j = S.indexOf('{', i);
  for (let k = j; k < S.length; k++) {
    if (S[k] === '{') d++;
    else if (S[k] === '}') { d--; if (d === 0) return S.slice(i, k + 1); }
  }
  throw new Error('unbalanced ' + name);
}
function extractLet(name) {
  const re = new RegExp('^\\s*(let|const)\\s+' + name + '\\s*=.*$', 'm');
  const m = S.match(re);
  return m ? m[0] : '';
}

const src = [
  'let orgCache = {}; let rosterCache = new Map(); let lastApiError = "";',
  extractLet('coTeamsCache'),
  'let coSeq = 0, coTimer = null;',
  'let session = { role: "公司管理" };',
  'let draft = { coTown: null, coTeamDept: null, coTeamMgr: "", coTeamAdmins: [] };',
  'const esc = s => String(s);',
  'const emptyTip = m => "<tip>" + m + "</tip>";',
  'const $ = sel => globalThis.__$(sel);',          // 页面里的 $ 工具
  'function apiGet(url){ return globalThis.__apiGet(url); }',
  'function personRow(p){ const e = document.createElement("div"); e._p = p; return e; }',
  'function rosterToPerson(it){ return { name: it.name, team: it.dept }; }',
  'function pickPerson(){}',
  'function loadRoster(o){ globalThis.__calls.roster.push(o); return globalThis.__loadRoster(o); }',
  'function renderCoSearch(){}',
  'function showView(){}',
  extractFn('resetCoCascade'), extractFn('coLevel'),
  extractFn('loadTowns'), extractFn('loadTeams'),
  extractFn('renderCoCrumbs'), extractFn('renderCoTowns'), extractFn('renderCoTeams'),
  extractFn('renderCoTeamMembers'), extractFn('renderCoCascade'), extractFn('coBackStep'),
  'export { resetCoCascade, coLevel, renderCoCascade, coBackStep, renderCoTowns, renderCoTeams, draft, coTeamsCache };'
].join('\n');

globalThis.__$ = sel => els.get(String(sel).replace(/^#/, '')) || mkEl(sel);

globalThis.__calls = calls;
globalThis.__apiGet = async url => {
  if (url === '/api/mobile/org/towns') { calls.towns++; return townData; }
  if (url.startsWith('/api/mobile/org/teams')) {
    const town = decodeURIComponent(url.split('town=')[1]);
    calls.teams.push(town);
    return teamData[town] || null;
  }
  return null;
};
globalThis.__loadRoster = async o => { calls.roster.push(o); return { items: [{ name: '张运志', dept: o.area }, { name: '李四', dept: o.area }], total: 2 }; };

// 用 vm 跑（比 data: URI 的 import 报错干净得多——后者会把整段 base64 打进堆栈）
const { createContext, runInContext } = await import('node:vm');
const EXPORTS = ['resetCoCascade', 'coLevel', 'renderCoCascade', 'coBackStep', 'renderCoTowns', 'renderCoTeams', 'draft', 'coTeamsCache'];
const ctxSrc = src.replace(/^export\s*\{[^}]*\};?\s*$/m, '') +
  '\n;globalThis.__out = { ' + EXPORTS.join(', ') + ' };';
const ctx = createContext({
  document: globalThis.document, window, location: window.location, history: window.history,
  setTimeout, clearTimeout, encodeURIComponent, console, Map, Set, Object, Array, String, Number, Boolean, Math, Date, JSON, Promise, RegExp, Error,
  __$: globalThis.__$, __apiGet: globalThis.__apiGet, __loadRoster: globalThis.__loadRoster, __calls: globalThis.__calls
});
runInContext(ctxSrc, ctx, { filename: 'check.html:cascade' });
const M = ctx.__out;
const { resetCoCascade, coLevel, renderCoCascade, coBackStep, renderCoTowns, renderCoTeams, draft } = M;

const tick = () => new Promise(r => setTimeout(r, 5));

/* ---------- 4. 层 1：只拉乡镇，绝不拉花名册 ---------- */
townData = { towns: [
  { town: '大曹镇', managerName: '孙建栋', teamCount: 4, peopleCount: 60 },
  { town: '杜集镇', managerName: '张卫新', teamCount: 8, peopleCount: 120 }
] };

resetCoCascade();
eq(coLevel(), 0, '复位后应在第 0 层');
eq(calls.roster.length, 0, '复位不应拉花名册');

await renderCoTowns();
t('层1：渲染 12 个乡镇且不请求花名册', () => {
  eq(calls.towns, 1, '乡镇接口调用次数');
  eq(calls.roster.length, 0, '层1 不应请求花名册（这正是本次改造的核心）');
  eq(els.get('co-cascade')._children.length, 2, '乡镇行数');
});
// 标题文案由 renderCoCascade 负责（renderCoTowns 只渲染列表）
resetCoCascade(); renderCoCascade(); await tick();
t('层1：标题文案正确', () => {
  // 第 16 轮：单位口径从「乡镇」扩到「镇/乡/街道/公园/作业中心」，文案同步改为「作业中心」
  eq(els.get('co-head').textContent, '第 1 步：选择作业中心', '层1 标题');
  eq(els.get('co-title').textContent, '自己处理 · 选择人员', '层1 导航标题');
});

/* ---------- 5. 层 2：点乡镇 → 班组（片区在首） ---------- */
teamData['大曹镇'] = { town: '大曹镇', teams: [
  { dept: '大曹镇片区', managerName: '孙建栋', isManagerTeam: true, rosterCount: 1, admins: [] },
  { dept: '大曹镇一班', managerName: '', rosterCount: 15, admins: [] },
  { dept: '大曹镇二班', managerName: '', rosterCount: 20, admins: [{ name: '张运志' }] }
] };

els.get('co-cascade')._children.length = 0;
els.get('co-cascade')._children.length = 0;
// 模拟点第一个乡镇
draft.coTown = '大曹镇';
renderCoCascade();
await tick();
t('层2：进入乡镇后拉该镇班组', () => {
  eq(coLevel(), 1, '应在第 1 层');
  ok(calls.teams.includes('大曹镇'), '未请求大曹镇班组');
  eq(calls.roster.length, 0, '层2 仍不应拉花名册');
});

/* ---------- 6. 层 3：点班组 → 人员（只拉该班组） ---------- */
draft.coTeamDept = '大曹镇二班';
draft.coTeamMgr = '';
draft.coTeamAdmins = [{ name: '张运志' }];
renderCoCascade();
await tick();
t('层3：只拉该班组人员（area 收敛）', () => {
  eq(coLevel(), 2, '应在第 2 层');
  const last = calls.roster[calls.roster.length - 1];
  eq(last.area, '大曹镇二班', '花名册 area 未收敛到班组');
  ok(!/^$/.test(last.area), 'area 为空会退化成全量拉取');
});

/* ---------- 7. 返回语义：逐层回退，缓存不重拉 ---------- */
const teamsBefore = calls.teams.length;
ok(coBackStep() === false, '人员层回退应被级联吃掉（不离开页面）');
eq(coLevel(), 1, '人员层 → 班组层');
ok(coBackStep() === false, '班组层回退应被级联吃掉');
eq(coLevel(), 0, '班组层 → 乡镇层');
eq(coBackStep(), true, '乡镇层回退应放行（离开本页）');

resetCoCascade(); draft.coTown = '大曹镇'; renderCoCascade(); await tick();
t('返回上层后重进：命中缓存不重复请求', () => {
  eq(calls.teams.length, teamsBefore, '重复请求了班组接口（缓存未命中）');
});

/* ---------- 8. 搜索面板：进班组层必须收起 ---------- */
t('进到班组层自动收起搜索面板', () => {
  resetCoCascade();
  els.get('co-search-box').classList.remove('hidden');
  draft.coTown = '大曹镇'; draft.coTeamDept = '大曹镇一班';
  renderCoCascade();
  ok(els.get('co-search-wrap').classList.contains('hidden'), '#co-search-wrap 未收起');
  ok(els.get('co-search-box').classList.contains('hidden'), '搜索面板未收起');
});

/* ---------- 9. 复位清层级但保留缓存 ---------- */
t('resetCoCascade 清层级 / 保留缓存', () => {
  resetCoCascade();
  eq(draft.coTeamDept, null, 'coTeamDept 未清');
  eq(draft.coTown, null, 'coTown 未清');
  eq(draft.coTeamAdmins.length, 0, 'coTeamAdmins 未清');
  ok(M.coTeamsCache.size > 0, '缓存被误清（会导致反复请求）');
});

console.log('\n--- ' + pass + ' passed, ' + fail + ' failed ---\n');
process.exit(fail ? 1 : 0);

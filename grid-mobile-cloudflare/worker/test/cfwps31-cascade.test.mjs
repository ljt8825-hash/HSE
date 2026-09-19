// ============================================================================
// CF-WPS-31 —— 乡镇 → 班组 → 人员 级联（惰性加载）离线验收
// ----------------------------------------------------------------------------
// 用**真实快照**（台账 68 人 + 花名册班组分布）驱动真实 worker 源码，锁死：
//   1) 12 个责任乡镇，公司本部/车队/公园被排除
//   2) 乡镇内排序：片区（经理）在最前，其后一班/二班/三班…（含三四班/六七班/九班/十班）
//   3) 班组清单 = 花名册 ∪ 台账管理员（任一边缺都不漏人）
//   4) 每班带管理员姓名
// ============================================================================
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const W = readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
const pick = (a, b) => {
  const i = W.indexOf(a), j = W.indexOf(b, i + a.length);
  if (i < 0 || j < 0) throw new Error('切片失败: ' + a);
  return W.slice(i, j);
};

const code = [
  'function fieldText(v){if(v==null)return "";if(typeof v==="string")return v;if(typeof v==="number")return String(v);if(Array.isArray(v))return v.map(x=>fieldText(x&&x.text!==undefined?x.text:x)).filter(Boolean).join(",");if(typeof v==="object"){if(v.text!==undefined)return fieldText(v.text);if(v.value!==undefined)return fieldText(v.value);}return "";}',
  'const ROSTER_INACTIVE_RE = /离职|已退|停用|退出/;',
  pick('const TOWN_DEPT_SUFFIX_RE', 'function isTownName'),
  pick('function isTownName', '// 全部作业中心清单'),
  pick('function ledgerTowns', '// 某乡镇的接收人'),
  pick('const CN_DIGIT', '// 某作业中心的班组清单'),
  pick('function townTeams', '// ---- GET /api/mobile/org/subordinates'),
  'export { townTeams, sortTeams, teamSortKey, cnNum, townLabel, isTownName, isUnitName, fillUnitHead, ledgerTowns };',
].join('\n');
const M = await import('data:text/javascript,' + encodeURIComponent(code));

// --- 真实数据快照（从线上拉取后固化，见 _t5-* 探测脚本）---
const snap = JSON.parse(readFileSync(path.join(__dirname, 'cfwps31-cascade-snapshot.json'), 'utf8'));
const ledger = snap.ledger;
const roster = snap.roster.map((r) => ({ dept: r.dept, status: r.status }));

let pass = 0, fail = 0;
const ok = (n, c, e = '') => c ? (pass++, console.log('  ✅', n, e)) : (fail++, console.log('  ❌', n, e));

const towns = M.ledgerTowns(ledger);
const townNames = towns.map((t) => t.town);

// 【2026-09-18 口径修订】作业中心 = 12 乡镇 + 3 公园 + 2 作业中心 = 17 个。
// 旧口径只认 (镇|乡|街道)，公园与环卫/市政园林作业中心被静默排除；业务侧要求
// 「公司管理能检查全公司所有作业中心和公园」，故一并纳入。
const TOWNS_12 = ['保店镇','柴胡店镇','大曹镇','大柳镇','杜集镇','津城街道','刘营伍乡','宁城街道','时集镇','相衙镇','张大庄镇','长官镇'];
const NON_TOWN_UNITS = ['康宁湖公园','新河公园','中心公园','环卫作业中心','市政园林作业中心'];

console.log('\nA 作业中心清单（12 乡镇 + 3 公园 + 2 作业中心）');
ok('恰好 17 个作业中心', towns.length === 17, '实际 ' + towns.length);
const EXPECT = TOWNS_12.concat(NON_TOWN_UNITS);
ok('名单与业务口径一致', EXPECT.every((t) => townNames.includes(t)) && townNames.length === EXPECT.length, townNames.join('/'));

console.log('\nB 非作业中心的机构必须被排除');
['人力综合部','生产管理部','安环管理部','项目管理层','财务部','车队'].forEach((x) => {
  ok('排除 ' + x, !townNames.includes(x));
});
console.log('\nB2 公园与作业中心必须被纳入（2026-09-18 新增口径）');
NON_TOWN_UNITS.forEach((x) => ok('纳入 ' + x, townNames.includes(x)));

console.log('\nC 乡镇内排序：片区（经理）必须在第一位（公园/作业中心无片区，跳过）');
TOWNS_12.forEach((t) => {
  const { teams } = M.townTeams(ledger, roster, t);
  const first = teams[0];
  ok(t + ' 首位=片区', first && first.isManagerTeam && /片区$/.test(first.dept), first ? first.dept : '（空）');
});

console.log('\nD 班组按班号升序（含中文数字与组合写法）');
{
  const { teams } = M.townTeams(ledger, roster, '杜集镇');
  const names = teams.map((x) => x.dept);
  console.log('     杜集镇顺序: ' + names.join(' → '));
  const rest = teams.filter((x) => !x.isManagerTeam).map((x) => x.dept.replace('杜集镇', ''));
  ok('一班在二班之前', rest.indexOf('一班') < rest.indexOf('二班'));
  // 杜集镇无三班（台账与花名册都没有）→ 不做该假设，改断言实际存在的班号顺序
  ['一班','二班','五班','八班','九班','十班'].reduce((prev, cur) => {
    if (prev) ok(cur + ' 在 ' + prev + ' 之后', rest.indexOf(prev) < rest.indexOf(cur));
    return cur;
  }, null);
  ok('九班在十班之前（数值非字符串）', rest.indexOf('九班') < rest.indexOf('十班'), rest.join(','));
  ok('三四班排在二班之后（首位3）', rest.indexOf('三四班') > rest.indexOf('二班'), rest.join(','));
  ok('六七班排在八班之前（首位6 < 8）', rest.indexOf('六七班') < rest.indexOf('八班'), rest.join(','));
}

console.log('\nE 组合班号解析正确');
{
  ok('三四班 首位=3', M.teamSortKey('杜集镇三四班', '杜集镇')[0] === 3, String(M.teamSortKey('杜集镇三四班', '杜集镇')[0]));
  ok('六七班 首位=6', M.teamSortKey('杜集镇六七班', '杜集镇')[0] === 6, String(M.teamSortKey('杜集镇六七班', '杜集镇')[0]));
  ok('十班 → 10', M.teamSortKey('杜集镇十班', '杜集镇')[0] === 10, String(M.teamSortKey('杜集镇十班', '杜集镇')[0]));
  ok('九班 → 9', M.teamSortKey('杜集镇九班', '杜集镇')[0] === 9, String(M.teamSortKey('杜集镇九班', '杜集镇')[0]));
  ok('片区排最前（键 -1）', M.teamSortKey('杜集镇片区', '杜集镇')[0] === -1);
}

console.log('\nF 每班带管理员姓名（台账口径）');
{
  const { teams } = M.townTeams(ledger, roster, '大曹镇');
  teams.filter((x) => !x.isManagerTeam).forEach((x) => {
    console.log('     ' + x.dept.padEnd(12) + ' 管理员=[' + x.admins.map((a) => a.name).join(',') + ']');
  });
  const t2 = teams.find((x) => x.dept === '大曹镇二班');
  ok('大曹镇二班有管理员张运志', t2 && t2.admins.some((a) => a.name === '张运志'));
}

console.log('\nG 花名册有班组但台账无管理员 → 该班仍必须存在（否则整班人无法选）');
{
  const { teams } = M.townTeams(ledger, roster, '大曹镇');
  const one = teams.find((x) => x.dept === '大曹镇一班');
  ok('大曹镇一班在列（花名册有/台账无管理员）', !!one, one ? '管理员' + one.adminCount + ' 人 / 花名册 ' + one.rosterCount + ' 人' : '缺失');
  ok('  该班 rosterCount > 0', one && one.rosterCount > 0, String(one && one.rosterCount));
}
{
  const { teams } = M.townTeams(ledger, roster, '宁城街道');
  const names = teams.map((x) => x.dept);
  console.log('     宁城街道班组: ' + names.join(' → '));
  ok('宁城街道二班/三班在列（台账无管理员）', names.includes('宁城街道二班') && names.includes('宁城街道三班'), names.join(','));
}

console.log('\nH 合并完整性：两级并集不漏（对照花名册全量）');
{
  let missing = [];
  const allTowns = new Set(towns.map((t) => t.town));
  // 花名册里能归到乡镇的班组，必须出现在对应乡镇的班组清单中
  const perTown = new Map();
  for (const t of towns) perTown.set(t.town, new Set(M.townTeams(ledger, roster, t.town).teams.map((x) => x.dept)));
  const SUF = /(片区|[\d一二三四五六七八九十百]+班)$/u, ANCH = /(镇|乡|街道)$/u;
  const seenDept = new Set();
  for (const r of roster) {
    const d = String(r.dept || '').trim();
    if (!d || seenDept.has(d)) continue;
    seenDept.add(d);
    const t = d.replace(SUF, '').trim();
    if (!ANCH.test(t) || !allTowns.has(t)) continue;
    if (!perTown.get(t).has(d)) missing.push(t + '/' + d);
  }
  ok('花名册所有乡镇班组都被覆盖', missing.length === 0, missing.join(', ') || '（无遗漏）');
}

console.log('\nI 津城街道无经理但要照常出班组');
{
  const { mgr, teams } = M.townTeams(ledger, roster, '津城街道');
  ok('mgr 为空', !mgr || !mgr.name);
  ok('仍有 4 个班组可点（一班~四班）', teams.filter((x) => !x.isManagerTeam).length === 4, String(teams.length));
  console.log('     津城街道: ' + teams.map((x) => x.dept).join(' → '));
}

console.log('\n' + '─'.repeat(60));
console.log(fail ? `❌ PASS=${pass} FAIL=${fail}` : `✅ 全部 ${pass} 条用例通过`);
process.exit(fail ? 1 : 0);

// ============================================================================
// CF-WPS-29 —— 前端 toPatrolBody → 后端 validatePatrolBody 契约一致性（离线）
// ----------------------------------------------------------------------------
// 目的：前端映射层（check.html 的 toPatrolBody）与后端校验（worker/index.js 的
//   validatePatrolBody）是**两份独立实现**。若字段名/取值漂移，症状是「点完成检查
//   后记录只留在本机、后端 400 静默拒绝」。本测试把两边真实代码取出来对接，
//   覆盖全部 4 个提交入口（转派 / 现在整改 / 稍后整改 / 普通巡查）。
// ============================================================================
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const W = readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
const H = readFileSync(path.join(__dirname, '..', '..', 'frontend', 'check.html'), 'utf8');

const pick = (src, a, b) => {
  const i = src.indexOf(a);
  const j = src.indexOf(b, i + a.length);
  if (i < 0 || j < 0) throw new Error('切片失败: ' + a);
  return src.slice(i, j);
};

// --- 后端：校验器 ---
const workerCode = pick(W, 'const PATROL_BODY_LIMIT', 'function patrolText') + '\n' +
  pick(W, 'function patrolText', '// ---- 网格归一') + '\n' +
  pick(W, 'function validatePatrolBody', '// ---- POST /api/mobile/patrol/submit') +
  '\nexport { validatePatrolBody, patrolProblemTypes, patrolViolationLib };';
const B = await import('data:text/javascript,' + encodeURIComponent(workerCode));

// --- 前端：映射层（toPatrolBody + 依赖）---
const frontCode = `
var patrolMeta = null;
${pick(H, 'function newClientRequestId', '// 提交一条记录到后端')}
export { toPatrolBody, newClientRequestId, nowLocalInspectTime, resolveGridForSubmit, setMeta };
function setMeta(m){ patrolMeta = m; }
`;
const F = await import('data:text/javascript,' + encodeURIComponent(frontCode));

const TYPES = B.patrolProblemTypes({});
const LIB = B.patrolViolationLib({});
F.setMeta({ grids: ['宁城街道片区'], grid_resolved: true, grid_mode: 'auto' });

let pass = 0, fail = 0;
const ok = (n, c, e = '') => c ? (pass++, console.log('  ✅', n, e)) : (fail++, console.log('  ❌', n, e));
const submit = (rec) => B.validatePatrolBody(F.toPatrolBody(rec), TYPES, LIB);

const GRID = '宁城街道片区';

console.log('\nA 三违记录：4 个提交入口的字段模型');
[
  { label: '发现三违 · 现在整改', rec: { type: '三违', behavior: '闯红灯', personName: '张三', personJob: '保洁员', personTeam: '宁城街道一班', rectifyMode: 'now', scenePhoto: 'data:image/jpeg;base64,x', clientRequestId: 'CFWPS29A1AAAAAA' } },
  { label: '发现三违 · 稍后整改', rec: { type: '三违', behavior: '逆行', personName: '李四', personJob: '司机', personTeam: '大曹镇一班', rectifyMode: 'later', scenePhoto: null, clientRequestId: 'CFWPS29A2BBBBBB' } },
  { label: '发现三违 · 转责任乡镇', rec: { type: '三违', behavior: '未穿工作服', personName: '王五', personJob: '保洁员', personTeam: '杜集镇一班', rectifyMode: 'transfer', transferTown: '杜集镇', transferAdminName: '赵六', scenePhoto: 'data:image/jpeg;base64,y', clientRequestId: 'CFWPS29A3CCCCCC' } },
].forEach(({ label, rec }) => {
  const r = submit(rec);
  ok(label, r.errors.length === 0, JSON.stringify(r.errors));
  if (!r.errors.length) {
    ok('  ↳ 落为三违', r.values.isViolation === '是' && r.values.problemType === '三违', '行为=' + r.values.violationDesc + ' 人员=' + r.values.violationPeople);
  }
});

console.log('\nB 普通巡查：2 种结果');
['一般问题', '现场正常'].forEach((res) => {
  const r = submit({ type: '巡查', patrolResult: res, behavior: null, personName: '', scenePhoto: null, clientRequestId: 'CFWPS29B' + res.length + 'DDDDDDDD' });
  ok('巡查 · ' + res, r.errors.length === 0, JSON.stringify(r.errors));
  if (!r.errors.length) ok('  ↳ 落为非三违', r.values.isViolation === '否' && r.values.problemType === res, 'problem_type=' + r.values.problemType);
});

console.log('\nC 三违库全 20 条 —— 前端选中后后端必须全收');
{
  let bad = [];
  LIB.forEach((beh, i) => {
    const r = submit({ type: '三违', behavior: beh, personName: '测试', personJob: 'X', personTeam: 'Y', scenePhoto: null, clientRequestId: 'CFWPS29C' + String(i).padStart(2, '0') + 'EEEEEE' });
    if (r.errors.length) bad.push(beh + ' → ' + JSON.stringify(r.errors));
  });
  ok('20 条全部通过', bad.length === 0, bad.join(' | '));
}

console.log('\nD 前端不传 protected 字段（employee_code / grid_id 等由 Worker 注入）');
{
  const body = F.toPatrolBody({ type: '巡查', patrolResult: '现场正常', clientRequestId: 'CFWPS29D1FFFFFF' });
  const keys = Object.keys(body);
  const leaked = keys.filter(k => ['employee_code', 'inspector_employee_id', 'grid_id', 'attribution_status', 'name'].includes(k));
  ok('无越权字段', leaked.length === 0, leaked.join(', '));
  console.log('     实际发送键:', keys.join(', '));
}

console.log('\nE 幂等键格式与网格取用');
{
  const id = F.newClientRequestId();
  ok('生成键符合 /^[A-Za-z0-9_-]{8,64}$/', /^[A-Za-z0-9_-]{8,64}$/.test(id), id + ' (len=' + id.length + ')');
  ok('两次生成不重复', F.newClientRequestId() !== F.newClientRequestId());
  ok('网格取自 meta', F.resolveGridForSubmit() === GRID, F.resolveGridForSubmit());
  ok('时间格式 YYYY-MM-DD HH:MM', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(F.nowLocalInspectTime()), F.nowLocalInspectTime());
}

console.log('\nF 失败路径：后端拒绝时前端能拿到明确 error code');
{
  // 网格为空（meta 未加载完就提交）
  F.setMeta({ grids: [] });
  const r1 = B.validatePatrolBody(F.toPatrolBody({ type: '巡查', patrolResult: '现场正常', clientRequestId: 'CFWPS29F1GGGGGG' }), TYPES, LIB);
  ok('无网格 → grid 报错', r1.errors.includes('grid'), JSON.stringify(r1.errors));
  F.setMeta({ grids: [GRID] });
}

console.log('\n' + '─'.repeat(60));
console.log(fail ? `❌ PASS=${pass} FAIL=${fail}` : `✅ 全部 ${pass} 条用例通过`);
process.exit(fail ? 1 : 0);

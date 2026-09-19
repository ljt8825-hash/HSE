// ============================================================================
// CF-WPS-29 —— 两套字段模型映射验收（第四轮任务1 核心设计）
// ----------------------------------------------------------------------------
// 背景：H5 有**两类**记录，字段模型不同，不能直接映射到同一组列：
//   · 三违记录  → is_violation=是 + violation_desc(三违库名) + violation_people
//   · 普通巡查  → is_violation=否 + problem_type=patrolResult
// 该测试离线驱动**真实 worker 源码**的 validatePatrolBody，锁死以下不变量：
//   1) 三违库 20 条齐备且与业务方下发一致（顺序也一致 —— 前端宫格按此顺序渲染）
//   2) problem_type 白名单必须含「三违」（否则三违记录恒 400，静默失败）
//   3) 三违分支：violation_desc 不在库内 → violation_desc_not_in_lib
//   4) 巡查分支：不需要 violation_desc / violation_people
//   5) 幂等键格式、时间格式、长度上限等硬约束
// ============================================================================
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');

// 从真实源码切片求值（不复制逻辑，避免测试与实现漂移）
function slice(a, b) {
  const i = SRC.indexOf(a);
  const j = SRC.indexOf(b, i + a.length);
  if (i < 0 || j < 0) throw new Error('切片失败: ' + a + ' .. ' + b);
  return SRC.slice(i, j);
}
const code =
  slice('const PATROL_BODY_LIMIT', 'function patrolText') + '\n' +
  slice('function patrolText', '// ---- 网格归一') + '\n' +
  slice('function validatePatrolBody', '// ---- POST /api/mobile/patrol/submit');
const mod = await import('data:text/javascript,' + encodeURIComponent(code + '\nexport { validatePatrolBody, patrolProblemTypes, patrolViolationLib, PATROL_VIOLATION_LIB, PATROL_DEFAULT_PROBLEM_TYPES };'));
const { validatePatrolBody, patrolProblemTypes, patrolViolationLib, PATROL_VIOLATION_LIB, PATROL_DEFAULT_PROBLEM_TYPES } = mod;

const EMPTY_ENV = {};
const TYPES = patrolProblemTypes(EMPTY_ENV);
const LIB = patrolViolationLib(EMPTY_ENV);
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => cond ? (pass++, console.log('  ✅', name, extra)) : (fail++, console.log('  ❌', name, extra));
const V = (body) => validatePatrolBody(body, TYPES, LIB);

// ---------------------------------------------------------------------------
const BUSINESS_LIB = [
  '闯红灯','骑车不戴头盔','逆行','违章停车','超速行驶','违章掉头','违章变道',
  '驾车时抽烟','打电话','破坏车内监控设施','未穿工作服','横穿马路','翻越护栏',
  '不领取防暑物资','出车不三检','脱岗、玩岗、替岗','隐瞒身体不适状况上岗',
  '危险作业未按要求采取保护措施','机动车道作业未摆放路锥','背向来车方向作业',
];

console.log('\nA1 三违库 20 条 · 与业务方下发逐字同序');
ok('库长 = 20', LIB.length === 20, '实际 ' + LIB.length);
ok('逐项同序一致', JSON.stringify(LIB) === JSON.stringify(BUSINESS_LIB),
  LIB.every((x, i) => x === BUSINESS_LIB[i]) ? '' : '首个不一致: ' + LIB.findIndex((x, i) => x !== BUSINESS_LIB[i]));
ok('无重复项', new Set(LIB).size === LIB.length);

console.log('\nA2 problem_type 白名单（三违记录的前置门）');
ok('含「三违」', TYPES.includes('三违'), JSON.stringify(TYPES));
ok('含常规巡查类型', ['环境卫生','设施设备','安全隐患','秩序管理','其他'].every(t => TYPES.includes(t)));

console.log('\nA3 env 覆盖（MOBILE_PATROL_VIOLATION_TYPES）');
ok('覆盖生效', JSON.stringify(patrolViolationLib({ MOBILE_PATROL_VIOLATION_TYPES: '甲, 乙 ,丙' })) === JSON.stringify(['甲','乙','丙']));
ok('空白串回落内置库', patrolViolationLib({ MOBILE_PATROL_VIOLATION_TYPES: '   ' }).length === 20);
ok('仅逗号回落内置库', patrolViolationLib({ MOBILE_PATROL_VIOLATION_TYPES: ',,,' }).length === 20);

// ---------------------------------------------------------------------------
const baseVio = {
  inspection_time: '2026-09-17 21:30',
  grid: '宁城街道片区',
  problem_type: '三违',
  description: '闯红灯（张三）',
  is_violation: '是',
  violation_desc: '闯红灯',
  violation_people: '张三,宁城街道一班',
  client_request_id: 'CFWPS29VIO0001',
  photo_taken: false,
};
const basePat = {
  inspection_time: '2026-09-17 21:30',
  grid: '宁城街道片区',
  problem_type: '环境卫生',
  description: '巡查结果：现场正常',
  is_violation: '否',
  client_request_id: 'CFWPS29PAT0001',
  photo_taken: false,
};

console.log('\nB1 三违模型 · 合法');
{
  const r = V({ ...baseVio });
  ok('零错误', r.errors.length === 0, JSON.stringify(r.errors));
  ok('is_violation=是', r.values.isViolation === '是');
  ok('三违行为透传', r.values.violationDesc === '闯红灯');
  ok('涉及人员透传', r.values.violationPeople === '张三,宁城街道一班');
  ok('未拍照 → 照片状态=未拍摄', r.values.photoStatus === '未拍摄');
}
console.log('B2 三违模型 · 库外自造项必须被拒');
{
  const r = V({ ...baseVio, violation_desc: '自造行为' });
  ok('拒绝码 = violation_desc_not_in_lib', r.errors.includes('violation_desc_not_in_lib'), JSON.stringify(r.errors));
}
console.log('B3 三违模型 · 带括号的展示串可命中原名');
{
  const r = V({ ...baseVio, violation_desc: '闯红灯（张三）' });
  ok('括号前缀命中库内项', !r.errors.includes('violation_desc_not_in_lib'), JSON.stringify(r.errors));
}
console.log('B4 三违模型 · 缺三违要素逐个报错');
{
  ok('缺 violation_desc', V({ ...baseVio, violation_desc: '' }).errors.includes('violation_desc'));
  ok('缺 violation_people', V({ ...baseVio, violation_people: '' }).errors.includes('violation_people'));
  ok('缺 description', V({ ...baseVio, description: '' }).errors.includes('description'));
}
console.log('B5 三违模型 · problem_type 必须命中白名单');
{
  ok('problem_type=三违 通过', !V({ ...baseVio }).errors.includes('problem_type'));
  ok('problem_type=乱写 被拒', V({ ...baseVio, problem_type: '乱写' }).errors.includes('problem_type'));
}

console.log('\nC1 巡查模型 · 合法（且**不需要**三违字段）');
{
  const r = V({ ...basePat });
  ok('零错误', r.errors.length === 0, JSON.stringify(r.errors));
  ok('is_violation=否', r.values.isViolation === '否');
  ok('三违字段留空', r.values.violationDesc === '' && r.values.violationPeople === '');
  ok('问题类型透传', r.values.problemType === '环境卫生');
}
console.log('C2 巡查模型 · 每个常规类型都可通过');
{
  ['环境卫生','设施设备','安全隐患','秩序管理','其他'].forEach(t => {
    ok('type=' + t, V({ ...basePat, problem_type: t }).errors.length === 0);
  });
}

console.log('\nD1 两模型共用硬约束');
{
  ok('is_violation 只能 是/否', V({ ...basePat, is_violation: 'Y' }).errors.includes('is_violation'));
  ok('时间格式 YYYY-MM-DD HH:MM', V({ ...basePat, inspection_time: '2026/09/17' }).errors.includes('inspection_time'));
  ok('时间可只到日', V({ ...basePat, inspection_time: '2026-09-17' }).errors.length === 0);
  ok('grid 必填', V({ ...basePat, grid: '' }).errors.includes('grid'));
  ok('client_request_id 长度下限 8', V({ ...basePat, client_request_id: 'abc' }).errors.includes('client_request_id'));
  ok('client_request_id 合法字符集', V({ ...basePat, client_request_id: 'ab$cd#efgh' }).errors.includes('client_request_id'));
  ok('client_request_id 合法通过', !V({ ...basePat, client_request_id: 'A1b2C3d4' }).errors.includes('client_request_id'));
  ok('描述超 500 被拒', V({ ...basePat, description: 'x'.repeat(501) }).errors.includes('description'));
  ok('三违行为超 300 被拒', V({ ...baseVio, violation_desc: '闯红灯', description: 'x'.repeat(1) }) && V({ ...baseVio, violation_desc: 'x'.repeat(301) }).errors.includes('violation_desc'));
}

console.log('\n' + '─'.repeat(60));
console.log(fail ? `❌ PASS=${pass} FAIL=${fail}` : `✅ 全部 ${pass} 条用例通过`);
process.exit(fail ? 1 : 0);

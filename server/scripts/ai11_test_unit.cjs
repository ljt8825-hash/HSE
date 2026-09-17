/**
 * AI-11 人工审核 — Unit 测试（纯函数，不依赖数据库）
 *
 * 覆盖（AI-11 任务书 §测试要求 Unit）：
 *  - 状态/动作常量与映射（REVIEW_STATUS / REVIEW_ACTION / ACTION_TO_STATUS）
 *  - 关联键 recordTitle（与 AI-10 零 migration 关联键一致）
 *  - validateHumanModified：合法通过；缺字段/非对象/类型错误/超长 拒绝（fail-closed）
 *  - assertRemarkSize：空→null；合法保留；非字符串/超长 拒绝
 *  - toApiReview：字段序列化形状
 *
 * 输出：Suite Unit + Total/Passed/Failed。不写库、不依赖 5881。
 */
'use strict';

const assert = require('assert');
const {
  REVIEW_STATUS,
  REVIEW_ACTION,
  ACTION_TO_STATUS,
  SUGGESTION_FIELDS,
  recordTitle,
  validateHumanModified,
  assertRemarkSize,
  toApiReview,
} = require('../services/ai/review/aiReviewService');

const suites = { Unit: [] };
function record(suite, name, ok, detail) {
  suites[suite].push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${suite}] ${name}${detail != null ? '  ' + JSON.stringify(detail) : ''}`);
}

function expectAiError(fn, code, label) {
  try {
    fn();
    return { ok: true, code: null };
  } catch (e) {
    return { ok: true, code: e && e.code, name: e && e.name };
  }
}

/* ─────────────── 常量与映射 ─────────────── */

record('Unit', 'REVIEW_STATUS 四态（PENDING_REVIEW/APPROVED/REJECTED/MODIFIED）',
  Object.values(REVIEW_STATUS).sort().join(',') === 'APPROVED,MODIFIED,PENDING_REVIEW,REJECTED',
  Object.values(REVIEW_STATUS));

record('Unit', 'REVIEW_ACTION 三动作（APPROVE/REJECT/MODIFY）',
  Object.values(REVIEW_ACTION).sort().join(',') === 'APPROVE,MODIFY,REJECT',
  Object.values(REVIEW_ACTION));

record('Unit', 'ACTION_TO_STATUS 映射正确（APPROVE→APPROVED 等）',
  ACTION_TO_STATUS.APPROVE === REVIEW_STATUS.APPROVED &&
  ACTION_TO_STATUS.REJECT === REVIEW_STATUS.REJECTED &&
  ACTION_TO_STATUS.MODIFY === REVIEW_STATUS.MODIFIED,
  ACTION_TO_STATUS);

record('Unit', 'SUGGESTION_FIELDS 与 AI-10 六字段协议一致',
  SUGGESTION_FIELDS.join(',') ===
    'overall_assessment,priority_issues,management_actions,monitoring_points,follow_up_suggestions,limitations',
  SUGGESTION_FIELDS);

record('Unit', 'recordTitle 与 AI-10 关联键一致（title=管理建议:任务#<id>）',
  recordTitle(42) === '管理建议:任务#42',
  recordTitle(42));

/* ─────────────── validateHumanModified ─────────────── */

const VALID_HM = {
  overall_assessment: '建议加强隐患整改跟踪。',
  priority_issues: ['部分隐患整改超期'],
  management_actions: ['完善整改跟踪台账'],
  monitoring_points: ['按周跟踪整改进度'],
  follow_up_suggestions: ['下月复核整改进度'],
  limitations: ['样本为近30天数据'],
};

let r;
r = expectAiError(() => validateHumanModified(VALID_HM), null, 'valid');
record('Unit', 'validateHumanModified 合法六字段通过（原样返回）',
  r.ok === true && JSON.stringify(validateHumanModified(VALID_HM)) === JSON.stringify(VALID_HM));

r = expectAiError(() => validateHumanModified(null), 'AI_REVIEW_INVALID_MODIFIED', 'null');
record('Unit', 'validateHumanModified null → 拒绝（AI_REVIEW_INVALID_MODIFIED）', r.ok && r.code === 'AI_REVIEW_INVALID_MODIFIED');

r = expectAiError(() => validateHumanModified({ overall_assessment: '缺数组字段' }), 'AI_REVIEW_INVALID_MODIFIED', 'missing');
record('Unit', 'validateHumanModified 缺字段 → 拒绝（fail-closed）', r.ok && r.code === 'AI_REVIEW_INVALID_MODIFIED');

r = expectAiError(() => validateHumanModified({ ...VALID_HM, management_actions: '不是数组' }), 'AI_REVIEW_INVALID_MODIFIED', 'bad-array');
record('Unit', 'validateHumanModified 数组字段类型错误 → 拒绝', r.ok && r.code === 'AI_REVIEW_INVALID_MODIFIED');

r = expectAiError(() => validateHumanModified({ ...VALID_HM, priority_issues: [123] }), 'AI_REVIEW_INVALID_MODIFIED', 'bad-element');
record('Unit', 'validateHumanModified 数组元素非字符串 → 拒绝', r.ok && r.code === 'AI_REVIEW_INVALID_MODIFIED');

r = expectAiError(() => validateHumanModified({ ...VALID_HM, overall_assessment: '长'.repeat(1001) }), 'AI_REVIEW_INVALID_MODIFIED', 'overall-long');
record('Unit', 'validateHumanModified 总体判断超长(>1000) → 拒绝', r.ok && r.code === 'AI_REVIEW_INVALID_MODIFIED');

r = expectAiError(() => validateHumanModified({ ...VALID_HM, limitations: ['长'.repeat(1001)] }), 'AI_REVIEW_INVALID_MODIFIED', 'item-long');
record('Unit', 'validateHumanModified 数组元素超长(>1000) → 拒绝', r.ok && r.code === 'AI_REVIEW_INVALID_MODIFIED');

r = expectAiError(() => validateHumanModified({ ...VALID_HM, management_actions: Array(501).fill('x') }), 'AI_REVIEW_INVALID_MODIFIED', 'too-many');
record('Unit', 'validateHumanModified 数组元素过多(>500) → 拒绝', r.ok && r.code === 'AI_REVIEW_INVALID_MODIFIED');

/* ─────────────── assertRemarkSize ─────────────── */

record('Unit', 'assertRemarkSize null/空 → null', assertRemarkSize(null) === null && assertRemarkSize('') === null);
record('Unit', 'assertRemarkSize 合法意见原样返回', assertRemarkSize(' 同意 ') === ' 同意 ');

r = expectAiError(() => assertRemarkSize('长'.repeat(2001)), 'AI_REVIEW_OVERSIZED', 'remark-long');
record('Unit', 'assertRemarkSize 超长(>2000) → 拒绝（AI_REVIEW_OVERSIZED）', r.ok && r.code === 'AI_REVIEW_OVERSIZED');

r = expectAiError(() => assertRemarkSize(123), 'AI_REVIEW_INVALID_ACTION', 'remark-type');
record('Unit', 'assertRemarkSize 非字符串 → 拒绝', r.ok && r.code === 'AI_REVIEW_INVALID_ACTION');

/* ─────────────── toApiReview 序列化 ─────────────── */

const row = {
  id: 7,
  generation_record_id: 3,
  task_id: 9,
  review_status: 'MODIFIED',
  previous_status: 'REJECTED',
  action: 'MODIFY',
  reviewed_by: 5,
  reviewed_at: new Date('2026-09-15T08:00:00Z'),
  human_remark: '修改后采纳',
  human_modified: { overall_assessment: 'x', priority_issues: [], management_actions: [], monitoring_points: [], follow_up_suggestions: [], limitations: [] },
  created_at: new Date('2026-09-15T08:00:00Z'),
  updated_at: new Date('2026-09-15T08:00:00Z'),
};
const apiReview = toApiReview(row, '测试主管');
record('Unit', 'toApiReview 映射 camelCase + reviewedByName',
  apiReview.id === 7 && apiReview.generationRecordId === 3 && apiReview.taskId === 9 &&
  apiReview.reviewStatus === 'MODIFIED' && apiReview.previousStatus === 'REJECTED' &&
  apiReview.action === 'MODIFY' && apiReview.reviewedBy === 5 &&
  apiReview.reviewedByName === '测试主管' && apiReview.humanRemark === '修改后采纳' &&
  apiReview.humanModified !== null,
  { id: apiReview.id, status: apiReview.reviewStatus, name: apiReview.reviewedByName });

record('Unit', 'toApiReview 空值兜底（reviewed_by/human_modified 为 null）',
  toApiReview({ ...row, reviewed_by: null, human_modified: null, human_remark: null }).reviewedBy === null &&
  toApiReview({ ...row, reviewed_by: null, human_modified: null, human_remark: null }).humanModified === null &&
  toApiReview({ ...row, reviewed_by: null, human_modified: null, human_remark: null }).reviewedByName === null);

/* ─────────────── 汇总 ─────────────── */

const total = suites.Unit.length;
const passed = suites.Unit.filter((t) => t.ok).length;
const failed = suites.Unit.filter((t) => !t.ok).length;
console.log(`\nSuite Unit: Total=${total} Passed=${passed} Failed=${failed}`);
console.log(failed === 0 ? 'RESULT: OK' : 'RESULT: FAIL');
process.exit(failed === 0 ? 0 : 1);

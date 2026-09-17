/**
 * AI-06 Analysis Normalizer —— 标准分析对象归一化
 *
 * 将 Adapter 读取的原始记录（注入 records 或 db 行）归一化为统一标准结构，
 * 供 Statistics 确定性统计使用。字段缺失一律标记 null / NOT_AVAILABLE，不猜测。
 */

const { isConnected } = require('../../../config/db');

/** 状态归一化：已整改 / 未整改 / 整改中 / 未知 */
const STATUS_RECTIFIED = ['已完成', '已整改', '已关闭', 'fixed', 'rectified', 'closed', 'done', 'COMPLETED', '已完成闭环'];
const STATUS_PENDING = ['待整改', '整改中', '处理中', 'pending', 'in_progress', 'OPEN', '待处理'];
const STATUS_OVERDUE = ['已逾期', 'overdue', 'EXPIRED'];

function normalizeStatus(status) {
  if (status == null || String(status).trim() === '') return { status: null, rectified: null, kind: 'UNKNOWN' };
  const s = String(status).trim();
  if (STATUS_RECTIFIED.includes(s)) return { status: s, rectified: true, kind: 'RECTIFIED' };
  if (STATUS_PENDING.includes(s)) return { status: s, rectified: false, kind: 'PENDING' };
  if (STATUS_OVERDUE.includes(s)) return { status: s, rectified: false, kind: 'OVERDUE' };
  // 未识别状态值：不猜测，按未整改处理但保留原文（kind=UNKNOWN）
  return { status: s, rectified: false, kind: 'UNKNOWN' };
}

function parseDate(v) {
  if (v == null || v === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * 归一化单条记录
 * @param {Object} raw - 原始记录（key 见 adapter columns 别名：date/status/category/level/org/area/source/rectify_date/deadline/verify_date）
 */
function normalizeRecord(raw = {}) {
  const date = parseDate(raw.date);
  const st = normalizeStatus(raw.status);
  const deadline = parseDate(raw.deadline);
  const rectifyDate = parseDate(raw.rectify_date);
  const today = new Date().toISOString().slice(0, 10);

  // 逾期：未整改且 deadline < today（仅当 deadline 存在）
  let overdue = false;
  if (st.rectified === false && deadline && deadline < today) overdue = true;

  // 平均整改时长（仅当存在 rectifyDate 且 >= date）
  let rectifyDays = null;
  if (date && rectifyDate && rectifyDate >= date) {
    rectifyDays = Math.round((new Date(rectifyDate) - new Date(date)) / 86400000);
  }

  return {
    id: raw.id != null ? raw.id : null,
    date,
    status: st.status,
    statusKind: st.kind,
    rectified: st.rectified,
    category: raw.category || raw.hazard_type || null,
    level: raw.level || raw.risk_level || null,
    org: raw.org || raw.responsible_dept || raw.township || null,
    area: raw.area || null,
    source: raw.source || null,
    deadline,
    rectifyDate,
    rectifyDays,
    verifyDate: parseDate(raw.verify_date),
    overdue,
  };
}

/**
 * 归一化记录集合
 * @param {Array} records
 * @returns {{ normalized: Array, limitations: Array }}
 */
function normalizeRecords(records = []) {
  const normalized = records.map(normalizeRecord);
  const limitations = [];
  const hasCategory = normalized.some((r) => r.category != null);
  const hasOrg = normalized.some((r) => r.org != null);
  const hasLevel = normalized.some((r) => r.level != null);
  const hasDeadline = normalized.some((r) => r.deadline != null);
  const hasRectifyDate = normalized.some((r) => r.rectifyDate != null);
  const hasStatus = normalized.some((r) => r.status != null);

  if (!hasCategory) limitations.push('分类字段 NOT_AVAILABLE（category/hazard_type 为空）');
  if (!hasOrg) limitations.push('组织字段 NOT_AVAILABLE（responsible_dept/township/area 为空）');
  if (!hasLevel) limitations.push('风险等级字段 NOT_AVAILABLE（risk_level/level 为空）');
  if (!hasDeadline) limitations.push('整改期限字段 NOT_AVAILABLE（deadline 为空，无法计算逾期）');
  if (!hasRectifyDate) limitations.push('整改完成日期 NOT_AVAILABLE（rectify_date 为空，无法计算平均整改时长）');
  if (!hasStatus) limitations.push('状态字段 NOT_AVAILABLE（status 为空，无法计算整改率）');

  return { normalized, limitations };
}

/** 报告生成用：统计当前连接状态（只读） */
function getDbState() {
  return { connected: isConnected() };
}

module.exports = {
  STATUS_RECTIFIED,
  STATUS_PENDING,
  STATUS_OVERDUE,
  normalizeStatus,
  normalizeRecord,
  normalizeRecords,
  getDbState,
};

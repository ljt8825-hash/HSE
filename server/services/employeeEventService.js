/**
 * 员工事件服务 — P0-2 / Phase 1 任务2
 *
 * 职责：
 * - 发布 EMPLOYEE_* 事件（TRANSFERRED / RESIGNED / STATUS_CHANGED / INFO_UPDATED）
 * - 事件格式严格遵循 Q2/Q3 前端契约 EmployeeEventEnvelope
 *   { id, type, employeeId, occurredAt, payload, schemaVersion, publishedAt, publishedAtMs }
 * - 通过 WebSocket 实时推送（方案 A）：broadcastNotification({ type:'EMPLOYEE_EVENT', event })
 * - 内存环形缓冲：供前端轮询兜底（方案 B）：GET /api/hse/employee/events?since=
 *
 * 说明：
 * - 内存缓冲为兜底通道，进程重启即清空；实时性以 WebSocket 为主。
 * - 发布幂等：10s 内相同 (type:employeeId:occurredAt) 去重，避免重复推送。
 * - 所有发布失败（如 WS 未启动）被吞掉，绝不影响主业务流程。
 */

const { broadcastNotification } = require('./wsServer');

const MAX_BUFFER = 1000;
const DEDUP_TTL_MS = 10 * 1000;

/** 环形缓冲：已发布事件信封（按发布顺序） */
const events = [];
let nextSeq = 1;

/** 幂等去重缓存：key -> 过期时间戳(ms) */
const dedupCache = new Map();

function cleanupDedup(now) {
  if (dedupCache.size === 0) return;
  for (const [k, exp] of dedupCache.entries()) {
    if (exp <= now) dedupCache.delete(k);
  }
}

/**
 * 发布一条员工事件
 * @param {{type:string, employeeId:number|string, occurredAt?:string, payload?:object, schemaVersion?:number}} event
 * @returns {object|null} 已发布的信封；重复或非法时返回 null
 */
function publishEmployeeEvent(event) {
  if (!event || !event.type || event.employeeId === undefined || event.employeeId === null) {
    return null;
  }
  const now = Date.now();
  cleanupDedup(now);

  const occurredAt = event.occurredAt || new Date(now).toISOString();
  const key = `${event.type}:${event.employeeId}:${occurredAt}`;
  if (dedupCache.has(key)) return null; // 幂等：10s 内同键去重
  dedupCache.set(key, now + DEDUP_TTL_MS);

  const envelope = {
    id: nextSeq++,
    type: event.type,
    employeeId: event.employeeId,
    occurredAt,
    payload: event.payload || {},
    schemaVersion: event.schemaVersion || 1,
    publishedAt: new Date(now).toISOString(),
    publishedAtMs: now,
  };

  events.push(envelope);
  if (events.length > MAX_BUFFER) {
    events.splice(0, events.length - MAX_BUFFER);
  }

  try {
    broadcastNotification({ type: 'EMPLOYEE_EVENT', event: envelope });
  } catch (e) {
    // WS 推送失败不影响主流程
    console.warn('[employeeEventService] WS 广播失败:', e.message);
  }

  return envelope;
}

/**
 * 获取 since 之后的事件（轮询兜底）
 * @param {number|string} [since] - epoch ms 数字或 ISO 时间戳字符串；空/0/非法返回全部缓冲
 * @returns {object[]} 信封数组（按 publishedAtMs 升序）
 */
function getEventsSince(since) {
  let sinceMs = 0;
  if (since !== undefined && since !== null && since !== '') {
    sinceMs = typeof since === 'number' ? since : Date.parse(String(since));
    if (Number.isNaN(sinceMs)) sinceMs = 0;
  }
  return events.filter(e => e.publishedAtMs > sinceMs);
}

/**
 * 最新一条事件的发布时间戳(ms)，用于客户端初始化轮询游标
 * @returns {number}
 */
function getLatestPublishedAtMs() {
  return events.length ? events[events.length - 1].publishedAtMs : 0;
}

module.exports = {
  publishEmployeeEvent,
  getEventsSince,
  getLatestPublishedAtMs,
};

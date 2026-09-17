/**
 * MOBILE-WPS-V1 · 业务编号生成
 *
 * 设计原则：
 * 1. 三违记录ID 是**业务主键**（人可读、可口头传达），与 WPS 行 ID（rowId）解耦。
 *    rowId 由 WPS 服务端生成、客户端不可指定，绝不用于业务语义。
 * 2. 形如 `SW-20260915-0001`：SW=三违，日期，当日 4 位序号。
 * 3. 序号由**适配层**按其已持久化的当日记录数分配，前端不自行随机造号，
 *    避免出现「两条同号」或「跳号不可控」。
 */

const VIOLATION_ID_PREFIX = 'SW';

/** 取 YYYYMMDD（本地时区） */
export function yyyymmdd(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/**
 * 构造三违记录ID。
 * @param dateStr YYYYMMDD
 * @param seq     当日序号，从 1 开始
 */
export function buildViolationId(dateStr: string, seq: number): string {
  const n = Math.max(1, Math.floor(seq));
  return `${VIOLATION_ID_PREFIX}-${dateStr}-${String(n).padStart(4, '0')}`;
}

/** 解析三违记录ID（无法解析返回 null） */
export function parseViolationId(
  id: string,
): { date: string; seq: number } | null {
  const m = /^SW-(\d{8})-(\d{4})$/.exec(String(id || '').trim());
  if (!m || !m[1] || !m[2]) return null;
  return { date: m[1], seq: Number.parseInt(m[2], 10) };
}

/** 是否合法的三违记录ID */
export function isViolationId(id: string): boolean {
  return parseViolationId(id) !== null;
}

/** 从已存在的同日 ID 列表推算下一个序号（找不到合法 ID 时返回 1） */
export function nextSeqOfDay(existingIds: string[], dateStr: string): number {
  let max = 0;
  for (const id of existingIds) {
    const p = parseViolationId(id);
    if (p && p.date === dateStr && p.seq > max) max = p.seq;
  }
  return max + 1;
}

/**
 * 生成适配层内部用的随机 ID（rowId / photoId / transferId / reviewId）。
 * 优先 crypto.randomUUID，缺失时降级（仅 TEST 场景）。
 */
export function randomId(prefix = ''): string {
  const g = globalThis as unknown as { crypto?: { randomUUID?: () => string } };
  let core: string;
  if (g.crypto && typeof g.crypto.randomUUID === 'function') {
    core = g.crypto.randomUUID();
  } else {
    core = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
  return prefix ? `${prefix}-${core}` : core;
}

/** 当前时间 ISO 字符串 */
export function nowIso(): string {
  return new Date().toISOString();
}

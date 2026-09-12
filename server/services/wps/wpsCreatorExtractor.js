'use strict';
/**
 * P2-B1-C §四/§五 WPS Creator 提取器（只读）。
 *
 * 背景（P2-B1-C 实测更正）：
 *   先前 P2-B1-B 结论「list_by_page 无 creator」**不准确**。
 *   真实情况：`list_by_page` 在 `show_record_extra_info:true` 时，原始记录**确实含**
 *     { id, fields, created_time, creator, last_modified_by, last_modified_time }
 *   但 `wpsClient.buildRecord()` 只挑 { id, fields, lastModifiedTime, createdTime }，
 *   **把 creator 丢弃了** —— 信息可得，只是被归一化层丢掉。
 *
 * 本模块只做两件事（只读，无任何 WPS 写）：
 *   1. fetchRecordCreators()   —— 拉取并保留 creator / last_modified_by（原始字段）
 *   2. assessCreatorTrust()    —— 判定 creator 是否「可作为提交者身份」
 *
 * ⚠️ 关键判定（P2-B1-C 实测 200 条样本）：
 *   creator 覆盖 200 条记录仅 **1 个值**（1901573333），而「姓名」有 58 个不同值，
 *   且 creator === last_modified_by 恒真 ⇒ creator 是**单一应用/数据属主账号**，
 *   **不是逐条提交者**。因此当前数据下 creator **不可用于可信身份归属**。
 *   只有「不同提交者 ⇒ 不同 creator」时，才可进入 per_submitter_candidate（仍须人工核验桥接）。
 *
 * 严禁：姓名/nickname/realName/手机号匹配；伪造 creator；任何 WPS 写调用。
 */
const wpsClient = require('../wpsClient');

/** §四 CASE 判定 */
const CREATOR_CASE = {
  AVAILABLE: 'available',        // 实际返回稳定 WPS account id
  UNAVAILABLE: 'unavailable',    // 只能返回名称/无账号标识
  UNRESOLVED: 'unresolved',      // 字段存在但结构无法确认稳定 id
};

/** creator 可信度（是否可作为「提交者身份」） */
const CREATOR_TRUST = {
  PER_SUBMITTER_CANDIDATE: 'per_submitter_candidate', // 多提交者 ⇒ 多 creator（候选，仍须人工核验）
  SHARED_ACCOUNT: 'shared_account',                   // 单一账号覆盖多提交者 ⇒ 应用/属主账号，不可用
  UNKNOWN: 'unknown',
};

function _parseFields(f) {
  if (f == null) return {};
  if (typeof f === 'object') return f;
  try { return JSON.parse(f); } catch (_) { return {}; }
}

function _recPath() {
  return `/v7/coop/dbsheet/${encodeURIComponent(wpsClient.CONF.fileId)}/sheets/${wpsClient.CONF.sheetId}/records/list_by_page`;
}

/**
 * 只读拉取记录，**保留 creator / last_modified_by**（不经过 buildRecord 归一化）。
 * fail-safe：任何异常返回 { ok:false, records:[], error }。
 * @param {{pageSize?:number, maxPages?:number}} [opts]
 */
async function fetchRecordCreators({ pageSize = 100, maxPages = 3 } = {}) {
  const out = [];
  try {
    if (!wpsClient.isConfigured()) {
      return { ok: false, records: [], error: 'wps_not_configured' };
    }
    const path = _recPath();
    for (let p = 1; p <= maxPages; p++) {
      const data = await wpsClient.request('POST', path, {
        page_num: p, page_size: pageSize, prefer_id: false, show_record_extra_info: true,
      });
      const recs = (data && data.records) || [];
      if (!recs.length) break;
      for (const r of recs) {
        const f = _parseFields(r.fields);
        out.push({
          wpsRecordId: r.id != null ? String(r.id) : null,
          creator: r.creator != null ? String(r.creator) : null,
          lastModifiedBy: r.last_modified_by != null ? String(r.last_modified_by) : null,
          createdTime: r.created_time || r.createdTime || null,
          name: f['姓名'] != null ? String(f['姓名']) : null,
          nick: f['昵称2'] != null ? String(f['昵称2']) : null,
        });
      }
      if (recs.length < pageSize) break;
    }
    return { ok: true, records: out, error: null };
  } catch (e) {
    return { ok: false, records: out, error: String((e && e.message) || e).slice(0, 300) };
  }
}

/**
 * §四/§五 判定 creator 是否可作为「提交者身份」。
 * 仅做**数据层**判定，不含任何姓名映射。
 * @param {Array<{creator:string|null,name:string|null}>} rows
 */
function assessCreatorTrust(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const withCreator = list.filter((r) => r && r.creator);
  if (list.length === 0) {
    return { trust: CREATOR_TRUST.UNKNOWN, reason: 'no_records', distinctCreators: 0, distinctNames: 0 };
  }
  if (withCreator.length === 0) {
    return { trust: CREATOR_TRUST.UNKNOWN, reason: 'no_creator_value', distinctCreators: 0, distinctNames: 0 };
  }
  const creators = new Set(withCreator.map((r) => r.creator));
  const names = new Set(list.map((r) => r.name).filter(Boolean));
  const creatorEqualsLastModifiedAll = withCreator.every((r) => r.creator === r.lastModifiedBy);
  if (creators.size === 1 && names.size > 1) {
    return {
      trust: CREATOR_TRUST.SHARED_ACCOUNT, reason: 'single_creator_many_names',
      distinctCreators: 1, distinctNames: names.size, creatorEqualsLastModifiedAll,
    };
  }
  if (creators.size === 1 && names.size <= 1) {
    return {
      trust: CREATOR_TRUST.UNKNOWN, reason: 'single_creator_single_name',
      distinctCreators: 1, distinctNames: names.size, creatorEqualsLastModifiedAll,
    };
  }
  return {
    trust: CREATOR_TRUST.PER_SUBMITTER_CANDIDATE, reason: 'multiple_creators',
    distinctCreators: creators.size, distinctNames: names.size, creatorEqualsLastModifiedAll,
  };
}

/** §四 CASE 判定（依据真实返回结构） */
function creatorCaseOf(fetchResult) {
  if (!fetchResult || !fetchResult.ok) return CREATOR_CASE.UNRESOLVED;
  const rows = fetchResult.records || [];
  const hasAny = rows.some((r) => r.creator);
  if (hasAny) return CREATOR_CASE.AVAILABLE;          // 返回了稳定 account id（但可信度另判）
  return CREATOR_CASE.UNAVAILABLE;                     // 无任何账号标识
}

/** 由 (creatorRows, wpsRecordId) 取该条记录的 creator（find，不猜）。 */
function creatorForRecord(rows, wpsRecordId) {
  if (!Array.isArray(rows) || wpsRecordId == null) return null;
  const hit = rows.find((r) => r.wpsRecordId != null && String(r.wpsRecordId) === String(wpsRecordId));
  return hit ? hit.creator : null;
}

module.exports = {
  CREATOR_CASE,
  CREATOR_TRUST,
  fetchRecordCreators,
  assessCreatorTrust,
  creatorCaseOf,
  creatorForRecord,
};

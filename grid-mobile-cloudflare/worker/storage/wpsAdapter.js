// ============================================================================
// wpsAdapter.js —— WPS 多维表格存储后端（从 worker/index.js 原样抽取，零行为变更）
// ----------------------------------------------------------------------------
// 统一 StorageAdapter 接口（与 feishuAdapter 同构）：
//   scanRecords(env, fileId, sheetId, maxPages) -> [{id, fields}]
//   createRecords(env, fileId, sheetId, records[]) -> [recordId]
//   batchDelete(env, fileId, sheetId, ids[]) -> true
// 字段一律以「中文列名」为 key（fields 归一化为对象），供 handler 的 mapper 直接读。
// ============================================================================

// ---- 安全解析 JSON，失败返回 null（绝不抛未捕获异常带走 token）----
async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

// ---- 应用 access_token（client_credentials；与生产 wpsClient.js 同端点同语义）----
let appTokenCache = { token: '', expiresAt: 0 };

export async function getAppToken(env) {
  const now = Date.now();
  if (appTokenCache.token && now < appTokenCache.expiresAt - 60 * 1000) return appTokenCache.token;
  const base = (env.WPS_OPENAPI_BASE || 'https://openapi.wps.cn').replace(/\/+$/, '');
  const res = await fetch(`${base}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: env.WPS_CLIENT_ID,
      client_secret: env.WPS_CLIENT_SECRET,
    }).toString(),
  });
  const json = await safeJson(res);
  if (!res.ok || !json || !json.access_token) {
    throw Object.assign(new Error('wps token fetch failed'), { wpsHttpStatus: res.status, isUpstream: true });
  }
  appTokenCache = { token: json.access_token, expiresAt: now + Number(json.expires_in || 7200) * 1000 };
  return appTokenCache.token;
}

// ---- 统一 WPS record 归一化（fields_value / fields 双形态兼容）----
export function normalizeWpsRecord(r) {
  if (!r || typeof r !== 'object') return null;
  let fv = r.fields_value ?? r.fields;
  if (typeof fv === 'string') {
    try { fv = JSON.parse(fv); } catch { return null; }
  }
  if (!fv || typeof fv !== 'object' || Array.isArray(fv)) return null;
  return { id: r.id != null ? String(r.id) : null, fields: fv };
}

// 通用分页扫描（list_by_page 全量，页数上限防失控；只读）
export async function scanRecords(env, fileId, sheetId, maxPages = 50) {
  const base = (env.WPS_OPENAPI_BASE || 'https://openapi.wps.cn').replace(/\/+$/, '');
  const out = [];
  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    const res = await fetch(`${base}/v7/coop/dbsheet/${encodeURIComponent(fileId)}/sheets/${sheetId}/records/list_by_page`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getAppToken(env)}` },
      body: JSON.stringify({ page_num: pageNum, page_size: 200, prefer_id: false, show_record_extra_info: false }),
    });
    const json = await safeJson(res);
    if (!res.ok || !json || json.code !== 0) {
      throw Object.assign(new Error('wps list_by_page failed'), { wpsHttpStatus: res.status, isUpstream: true });
    }
    const recs = (json.data && json.data.records) || [];
    for (const r of recs) {
      const n = normalizeWpsRecord(r);
      if (n) out.push(n);
    }
    if (recs.length < 200) break;
  }
  return out;
}

// ---- records/create（与生产 wpsClient.createRecords 同端点同格式）----
export async function createRecords(env, fileId, sheetId, records) {
  const base = (env.WPS_OPENAPI_BASE || 'https://openapi.wps.cn').replace(/\/+$/, '');
  const appToken = await getAppToken(env);
  const res = await fetch(`${base}/v7/coop/dbsheet/${encodeURIComponent(fileId)}/sheets/${sheetId}/records/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${appToken}` },
    body: JSON.stringify({ prefer_id: false, records: records.map((f) => ({ fields_value: JSON.stringify(f) })) }),
  });
  const json = await safeJson(res);
  if (res.status === 429) {
    const e = new Error('wps rate limited');
    e.isRateLimit = true;
    throw e;
  }
  if (!res.ok || !json || json.code !== 0) {
    throw Object.assign(new Error('wps create failed'), { wpsHttpStatus: res.status, isUpstream: true });
  }
  const recs = (json.data && json.data.records) || [];
  return recs.map((r) => r.id).filter(Boolean);
}

// ---- batch_delete（WPS v7 records/batch_delete）----
export async function batchDelete(env, fileId, sheetId, ids) {
  const base = (env.WPS_OPENAPI_BASE || 'https://openapi.wps.cn').replace(/\/+$/, '');
  const appToken = await getAppToken(env);
  const res = await fetch(`${base}/v7/coop/dbsheet/${encodeURIComponent(fileId)}/sheets/${sheetId}/records/batch_delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${appToken}` },
    body: JSON.stringify({ records: ids }),
  });
  const json = await safeJson(res);
  if (!res.ok || !json || json.code !== 0) {
    throw Object.assign(new Error('wps batch_delete failed'), { wpsHttpStatus: res.status, isUpstream: true });
  }
  return true;
}

export default { backend: 'wps', scanRecords, createRecords, batchDelete, getAppToken, normalizeWpsRecord };

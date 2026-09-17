// ============================================================================
// feishuAdapter.js —— 飞书多维表格存储后端（CF-WPS-20 后续 Phase B 全量切换目标）
// ----------------------------------------------------------------------------
// 统一 StorageAdapter 接口（与 wpsAdapter 同构）：
//   scanRecords(env, appToken, tableId, maxPages) -> [{id, fields}]
//   createRecords(env, appToken, tableId, records[]) -> [recordId]
//   batchDelete(env, appToken, tableId, ids[]) -> true
// 鉴权：tenant_access_token（app_id + app_secret，client_credentials 等价）
// 字段：handler 构造的 record 一律「中文列名 -> 字符串值」，对应飞书表文本列，
//       无需类型转换（日期/枚举全部存为文本列，与 WPS 行为一致）。
// 已在 CF 海外边缘实测：token 309ms / create 200 / delete 200（roundtrip 全绿）。
// ============================================================================

const FS_BASE = 'https://open.feishu.cn/open-apis';

let fsTokenCache = { token: '', expiresAt: 0 };

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

// ---- tenant_access_token（缓存，避免每次请求都换票）----
export async function getFsToken(env) {
  const now = Date.now();
  if (fsTokenCache.token && now < fsTokenCache.expiresAt - 60 * 1000) return fsTokenCache.token;
  const res = await fetch(`${FS_BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: env.FS_APP_ID, app_secret: env.FS_APP_SECRET }),
  });
  const json = await safeJson(res);
  if (!res.ok || !json || json.code !== 0 || !json.tenant_access_token) {
    throw Object.assign(new Error('feishu token failed'), {
      fsHttpStatus: res.status,
      fsCode: json && json.code,
      fsMsg: json && json.msg,
      isUpstream: true,
    });
  }
  fsTokenCache = {
    token: json.tenant_access_token,
    expiresAt: now + Number(json.expire || 7200) * 1000,
  };
  return fsTokenCache.token;
}

// ---- 分页读取（list records）----
export async function scanRecords(env, appToken, tableId, maxPages = 50) {
  const token = await getFsToken(env);
  const out = [];
  let pageToken = '';
  for (let p = 1; p <= maxPages; p++) {
    const qs = new URLSearchParams({ page_size: '200' });
    if (pageToken) qs.set('page_token', pageToken);
    const res = await fetch(
      `${FS_BASE}/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records?${qs.toString()}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const json = await safeJson(res);
    if (!res.ok || !json || json.code !== 0) {
      throw Object.assign(new Error('feishu list failed'), {
        fsHttpStatus: res.status,
        fsCode: json && json.code,
        fsMsg: json && json.msg,
        isUpstream: true,
      });
    }
    const items = (json.data && json.data.items) || [];
    for (const it of items) {
      out.push({ id: String(it.record_id), fields: it.fields || {} });
    }
    if (!json.data || !json.data.has_more || !json.data.page_token) break;
    pageToken = json.data.page_token;
  }
  return out;
}

// ---- records/batch_create（中文列名做 fields，文本列无需类型转换）----
// 注：飞书单条创建 POST /records 要求 body={fields:{...}}（无 records 包裹）；
//     批量创建用 /records/batch_create，body={records:[{fields:{...}}]}，返回 data.records[]。
export async function createRecords(env, appToken, tableId, records) {
  const token = await getFsToken(env);
  const res = await fetch(
    `${FS_BASE}/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records/batch_create`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ records: records.map((f) => ({ fields: f })) }),
    }
  );
  const json = await safeJson(res);
  if (res.status === 429) {
    const e = new Error('feishu rate limited');
    e.isRateLimit = true;
    throw e;
  }
  if (!res.ok || !json || json.code !== 0) {
    throw Object.assign(new Error('feishu create failed'), {
      fsHttpStatus: res.status,
      fsCode: json && json.code,
      fsMsg: json && json.msg,
      isUpstream: true,
    });
  }
  const recs = (json.data && json.data.records) || [];
  return recs.map((r) => r.record_id).filter(Boolean);
}

// ---- records/batch_delete（清理测试数据用）----
export async function batchDelete(env, appToken, tableId, ids) {
  const token = await getFsToken(env);
  const res = await fetch(
    `${FS_BASE}/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records/batch_delete`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ records: ids }),
    }
  );
  const json = await safeJson(res);
  if (!res.ok || !json || json.code !== 0) {
    throw Object.assign(new Error('feishu delete failed'), {
      fsHttpStatus: res.status,
      fsCode: json && json.code,
      fsMsg: json && json.msg,
      isUpstream: true,
    });
  }
  return true;
}

// ---- drive/v1/medias/upload_all（照片上传 → file_token，用于附件字段）----
// parent_type=bitable_image（图片）+ parent_node=base app_token → file_token 可写入附件列。
// 返回纯 file_token 字符串；调用方以 { fields: { 列名: [{ file_token }] } } 落入附件字段。
export async function uploadMedia(env, buf, fileName, mime) {
  const token = await getFsToken(env);
  const fd = new FormData();
  fd.append('file_name', fileName);
  fd.append('parent_type', 'bitable_image');
  fd.append('parent_node', String(env.FS_APP_TOKEN || ''));
  fd.append('size', String(buf.length));
  fd.append('file', new Blob([buf], { type: mime }), fileName);
  const res = await fetch(`${FS_BASE}/drive/v1/medias/upload_all`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const json = await safeJson(res);
  if (res.status === 429) {
    const e = new Error('feishu rate limited');
    e.isRateLimit = true;
    throw e;
  }
  if (!res.ok || !json || json.code !== 0 || !json.data || !json.data.file_token) {
    throw Object.assign(new Error('feishu media upload failed'), {
      fsHttpStatus: res.status,
      fsCode: json && json.code,
      fsMsg: json && json.msg,
      isUpstream: true,
    });
  }
  return String(json.data.file_token);
}

export default { backend: 'feishu', scanRecords, createRecords, batchDelete, getFsToken, uploadMedia };

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
    // page_size 500 = 飞书上限。分页是**串行**的（page_token 链式依赖，无法并发），
    // 所以单页越大、往返越少：花名册 1291 人由 200/页的 7 次往返降到 500/页的 3 次
    // （2026-09-18 实测单次冷拉取 ~10.9s，其中绝大部分是往返等待）。
    const qs = new URLSearchParams({ page_size: '500' });
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

/* ---- 按 record_id 取单条（CF-WPS-43）：O(1) 远端调用，替代「全表扫描 + find」 ----
   原实现：handleAssign / handleAssignComplete 都调 scanRecords 全表扫几千行（5s+）再 find。
   飞书原生支持 GET /records/:id —— 单次往返 ~200ms，且拿到的是权威最新值，
   比"60s 缓存"更稳：assign 是写入路径，必须看到刚 submit 的记录。 */
export async function getRecord(env, appToken, tableId, recordId) {
  if (!recordId) return null;
  const token = await getFsToken(env);
  const url = `${FS_BASE}/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records/${encodeURIComponent(recordId)}?text_field_as_array=true`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  // 404 / 1254042 / 1254046 = 记录不存在（被删/权限不足），返回 null 而非抛错
  if (res.status === 404) return null;
  const json = await safeJson(res);
  if (!json) return null;
  if (json.code === 1254042 || json.code === 1254046) return null;
  if (!res.ok || json.code !== 0) {
    // ⚠️ 「记录不存在」与「上游故障」必须分开：前者业务上是 404（用户填错/记录已删），
    //    后者才是 502。混在一起会让「给不存在的记录挂照片」从 404 变成 502
    //    （2026-09-19 _t31 回归实测）。调用方按 e.isNotFound 区分。
    const msg = String((json && json.msg) || '');
    const isNotFound = res.status === 404 || json.code === 1254042 || json.code === 1254046
      || /not\s*found|不存在|RecordNotFound|record_id/i.test(msg);
    throw Object.assign(new Error('feishu get failed'), {
      fsHttpStatus: res.status, fsCode: json.code, fsMsg: json.msg, isUpstream: true, isNotFound,
    });
  }
  const item = json.data && json.data.record;
  if (!item) return null;
  return { id: String(item.record_id), fields: item.fields || {} };
}

/* ---- 按字段过滤搜索（CF-WPS-43）：替代 handleInbox 的全表扫描 ----
   飞书原生 search API，单次往返 ~200ms，返回符合条件的所有记录。
   opts = { field: '整改接收人ID', value: '138****0000', maxPages: 10 }
   运算符：文本精确匹配用 'is'（value 必须是数组）；'contains' = 模糊匹配。 */
export async function searchRecords(env, appToken, tableId, opts = {}) {
  const { field, value, operator = 'is', maxPages = 10 } = opts;
  if (!field || value === undefined || value === null || value === '') return [];
  const token = await getFsToken(env);
  const url = `${FS_BASE}/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records/search`;
  const out = [];
  let pageToken = '';
  for (let p = 0; p < maxPages; p++) {
    const body = {
      page_size: 500,
      filter: { conjunction: 'and', conditions: [{ field_name: field, operator, value: [String(value)] }] },
    };
    if (pageToken) body.page_token = pageToken;
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await safeJson(res);
    if (!res.ok || !json || json.code !== 0) {
      throw Object.assign(new Error('feishu search failed'), {
        fsHttpStatus: res.status, fsCode: json && json.code, fsMsg: json && json.msg, isUpstream: true,
      });
    }
    const items = (json.data && json.data.items) || [];
    for (const it of items) out.push({ id: String(it.record_id), fields: it.fields || {} });
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

// ---- records/:id 局部更新（补挂事后拍的照片等）----
// 用 PUT /records/{record_id}（body={fields:{...}}），只传要改的列，其余列不动。
// 引入原因：整改后照片是**记录提交之后**才拍的，提交时无从得知 file_token，
// 只能在拍完后再把附件补写回同一条记录。
export async function updateRecord(env, appToken, tableId, recordId, fields) {
  const token = await getFsToken(env);
  const res = await fetch(
    `${FS_BASE}/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records/${encodeURIComponent(recordId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ fields }),
    }
  );
  const json = await safeJson(res);
  if (res.status === 429) {
    const e = new Error('feishu rate limited');
    e.isRateLimit = true;
    throw e;
  }
  if (!res.ok || !json || json.code !== 0) {
    throw Object.assign(new Error('feishu update failed'), {
      fsHttpStatus: res.status,
      fsCode: json && json.code,
      fsMsg: json && json.msg,
      isUpstream: true,
    });
  }
  return (json.data && json.data.record && json.data.record.record_id) || recordId;
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

// ---- fields/list + fields/create（CF-WPS-36：整改待办需要新增列，幂等建列用）----
// 列出表内字段：[{ fieldId, fieldName, type }]
export async function listFields(env, appToken, tableId) {
  const token = await getFsToken(env);
  const out = [];
  let pageToken = '';
  for (;;) {
    const qs = new URLSearchParams({ page_size: '100' });
    if (pageToken) qs.set('page_token', pageToken);
    const res = await fetch(
      `${FS_BASE}/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/fields?${qs.toString()}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const json = await safeJson(res);
    if (!res.ok || !json || json.code !== 0) {
      throw Object.assign(new Error('feishu list fields failed'), {
        fsHttpStatus: res.status, fsCode: json && json.code, fsMsg: json && json.msg, isUpstream: true,
      });
    }
    const items = (json.data && json.data.items) || [];
    for (const it of items) out.push({ fieldId: String(it.field_id || ''), fieldName: String(it.field_name || ''), type: Number(it.type || 0) });
    if (!json.data || !json.data.has_more || !json.data.page_token) break;
    pageToken = json.data.page_token;
  }
  return out;
}

// 建字段。type=1 文本（最通用，落任何字符串都不会类型报错）。
// 已存在同名列时返回 { created:false, existed:true } —— 幂等，可反复调用。
export async function ensureField(env, appToken, tableId, fieldName, type = 1) {
  const token = await getFsToken(env);
  const res = await fetch(
    `${FS_BASE}/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/fields`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ field_name: fieldName, type }),
    }
  );
  const json = await safeJson(res);
  if (res.ok && json && json.code === 0) {
    return { created: true, fieldName, fieldId: String((json.data && json.data.field && json.data.field.field_id) || '') };
  }
  // 飞书对「同名列已存在」返回 code 1254005 / FieldNameDuplicated 一类错误码，视为已存在
  const msg = String((json && json.msg) || '');
  const dup = /duplicat|exist|已存在|重复/i.test(msg) || (json && json.code === 1254005);
  if (dup) return { created: false, existed: true, fieldName };
  throw Object.assign(new Error('feishu create field failed: ' + fieldName), {
    fsHttpStatus: res.status, fsCode: json && json.code, fsMsg: msg, isUpstream: true,
  });
}

// ---- 列举 base 内所有表（用于「按表名解析表 ID」；换 base 只改 FS_APP_TOKEN）----
export async function listTables(env, appToken) {
  const token = await getFsToken(env);
  const out = [];
  let pageToken = '';
  for (;;) {
    const qs = new URLSearchParams({ page_size: '100' });
    if (pageToken) qs.set('page_token', pageToken);
    const res = await fetch(
      `${FS_BASE}/bitable/v1/apps/${encodeURIComponent(appToken)}/tables?${qs.toString()}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const json = await safeJson(res);
    if (!res.ok || !json || json.code !== 0) {
      throw Object.assign(new Error('feishu list tables failed'), {
        fsHttpStatus: res.status,
        fsCode: json && json.code,
        fsMsg: json && json.msg,
        isUpstream: true,
      });
    }
    const items = (json.data && json.data.items) || [];
    for (const it of items) out.push({ tableId: String(it.table_id || ''), name: String(it.name || '') });
    if (!json.data || !json.data.has_more || !json.data.page_token) break;
    pageToken = json.data.page_token;
  }
  return out;
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

export default { backend: 'feishu', scanRecords, createRecords, updateRecord, batchDelete, getFsToken, uploadMedia, listTables, listFields, ensureField, getRecord, searchRecords };

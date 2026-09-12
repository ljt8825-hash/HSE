/**
 * WPS 多维表格开放平台 API 客户端（V7 REST）
 *
 * 职责边界（Sprint-WPS-01 明确）：
 *   - 只负责 WPS 基础通信：认证、access_token 管理、HTTP 请求、请求头、超时、
 *     WPS 响应处理、错误分类化（WpsError）、日志埋点。
 *   - 禁止在本文件写任何业务逻辑（人员 / 网格 / 三违 / 巡查规则一律不得出现）。
 *   - 业务调用方请走 services/wps/wpsDbsheetAdapter.js → services/wps/gridInspectionService.js。
 *
 * 鉴权：应用授权（client_credentials）→ Bearer access_token；
 *       若开发者后台开启了「API 签名」，另附 KSO-1 签名头（X-Kso-Date / X-Kso-Authorization）。
 *       - token:   POST {base}/oauth2/token  (grant_type=client_credentials)
 *       - KSO-1:   HMAC-SHA256(secret, "KSO-1" + Method + RequestURI + ContentType + KsoDate + sha256hex(body))
 *
 * 环境变量（仅服务端，禁止进前端）：
 *   WPS_OPENAPI_BASE     默认 https://openapi.wps.cn
 *   WPS_APP_ID / WPS_APP_SECRET   开放平台应用凭证
 *   WPS_DBSHEET_FILE_ID  多维表格文件 ID（.dbt）
 *   WPS_DBSHEET_SHEET_ID 数据表 ID
 *   WPS_API_SIGNATURE    'true' 时启用 KSO-1 签名头（默认关闭）
 *   WPS_TIMEOUT_MS       请求超时（毫秒），默认 30000
 *
 * 记录接口（V7 路径常量集中在 REC_PATH，便于首跑校验/调整）：
 *   POST .../records/list_by_page  按页列举（page_num 从 1 起）
 *   POST .../records/create        批量创建（records[].fields_value 为 JSON 字符串）
 *   POST .../records/update        批量更新（records[] 含 id + fields_value）
 *   POST .../records/delete        批量删除（records[] 为 {id} 数组）
 *   （update/delete 为 V7 对称命名推断，首次联调若 404 请核对官方文档路径）
 */
const crypto = require('crypto');
const { classify } = require('./wps/wpsErrors');

const CONF = {
  base: (process.env.WPS_OPENAPI_BASE || 'https://openapi.wps.cn').replace(/\/+$/, ''),
  appId: process.env.WPS_APP_ID || '',
  appSecret: process.env.WPS_APP_SECRET || '',
  fileId: process.env.WPS_DBSHEET_FILE_ID || '',
  sheetId: parseInt(process.env.WPS_DBSHEET_SHEET_ID || '0', 10),
  apiSignature: String(process.env.WPS_API_SIGNATURE || '').toLowerCase() === 'true',
  timeoutMs: parseInt(process.env.WPS_TIMEOUT_MS || '30000', 10), // 请求超时（毫秒）
};

const WPS_LOG_PREFIX = '[wps-client]';

function isConfigured() {
  return !!(CONF.appId && CONF.appSecret && CONF.fileId && CONF.sheetId);
}

// ============================================================
// 一、应用 access_token（缓存 + 失效强制刷新）
// ============================================================

let tokenCache = { token: '', expiresAt: 0 };

async function getAppAccessToken(force = false) {
  if (!isConfigured()) {
    const e = new Error('WPS 同步未配置：缺少 WPS_APP_ID / WPS_APP_SECRET / WPS_DBSHEET_FILE_ID / WPS_DBSHEET_SHEET_ID');
    Object.assign(e, { code: -1, statusCode: 0 });
    throw classify(e);
  }
  const now = Date.now();
  if (!force && tokenCache.token && now < tokenCache.expiresAt - 60 * 1000) return tokenCache.token;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: CONF.appId,
    client_secret: CONF.appSecret,
  });
  let res;
  try {
    res = await fetch(`${CONF.base}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(CONF.timeoutMs),
    });
  } catch (err) {
    const we = classify(err);
    we.message = `获取 WPS access_token 失败（${we.kind}）: ${err.message}`;
    throw we;
  }
  if (!res.ok) {
    const e = new Error(`获取 WPS access_token 失败 HTTP ${res.status}`);
    Object.assign(e, { code: res.status, statusCode: res.status });
    throw classify(e);
  }
  let json;
  try {
    json = await res.json();
  } catch (err) {
    throw classify(new SyntaxError(`WPS token 响应解析失败: ${err.message}`));
  }
  if (!json.access_token) {
    const e = new Error(`获取 WPS access_token 失败: ${JSON.stringify(json).slice(0, 300)}`);
    // token 端点返回无 access_token 一般视为认证/参数问题
    Object.assign(e, { code: (json && json.result) || json.error_code || -1, statusCode: res.status });
    throw classify(e);
  }
  const expiresIn = parseInt(json.expires_in || '7200', 10);
  tokenCache = { token: json.access_token, expiresAt: now + expiresIn * 1000 };
  return tokenCache.token;
}

// ============================================================
// 二、KSO-1 签名（仅在开发者后台开启「API 签名」时需要）
// ============================================================

function sha256Hex(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

function kso1Sign(method, uri, contentType, ksoDate, bodyStr) {
  const signStr = 'KSO-1' + method.toUpperCase() + uri + contentType + ksoDate + (bodyStr ? sha256Hex(bodyStr) : '');
  return crypto.createHmac('sha256', CONF.appSecret).update(signStr, 'utf8').digest('hex');
}

// ============================================================
// 三、通用请求（Bearer + 可选 KSO-1；429 退避重试；token 失效自动刷新一次；
//     统一超时 + WpsError 分类）
// ============================================================

async function request(method, path, bodyObj, retry = 0) {
  const token = await getAppAccessToken();
  const bodyStr = bodyObj !== undefined && bodyObj !== null ? JSON.stringify(bodyObj) : '';
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
  if (CONF.apiSignature) {
    const ksoDate = new Date().toUTCString(); // RFC1123
    headers['X-Kso-Date'] = ksoDate;
    headers['X-Kso-Authorization'] = `KSO-1 ${CONF.appId}:${kso1Sign(method, path, 'application/json', ksoDate, bodyStr)}`;
  }

  let res;
  try {
    res = await fetch(`${CONF.base}${path}`, { method, headers, body: bodyStr || undefined, signal: AbortSignal.timeout(CONF.timeoutMs) });
  } catch (err) {
    // 网络层 / 超时
    const we = classify(err);
    we.message = `WPS 网络异常（${we.kind}）: ${path} ${err.message}`;
    throw we;
  }

  // 限频退避（官方限频 10 次/秒，按 app_id）
  if (res.status === 429 && retry < 2) {
    await new Promise((r) => setTimeout(r, 1500 * (retry + 1)));
    return request(method, path, bodyObj, retry + 1);
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    const e = new Error(`WPS API HTTP ${res.status} ${path}: ${t.slice(0, 200)}`);
    Object.assign(e, { code: res.status, statusCode: res.status });
    throw classify(e);
  }

  let json;
  try {
    json = await res.json();
  } catch (err) {
    const we = classify(new SyntaxError(`WPS 响应 JSON 解析失败 ${path}: ${err.message}`));
    we.status = res.status;
    throw we;
  }

  if (json.code !== 0) {
    // token 失效：强制刷新后重试一次
    if ((json.code === 401000001 || json.code === 401) && retry < 1) {
      await getAppAccessToken(true);
      return request(method, path, bodyObj, 1);
    }
    const e = new Error(`WPS API code=${json.code} ${path}: ${String(json.msg || '').slice(0, 200)}`);
    Object.assign(e, { code: json.code, statusCode: res.status });
    throw classify(e);
  }

  // code === 0 但 data 缺失 → 结构异常
  if (!('data' in json)) {
    const we = classify(new Error(`WPS 响应缺少 data 字段 ${path}`));
    we.isParseError = true;
    we.status = res.status;
    throw we;
  }
  return json.data;
}

// ============================================================
// 四、记录接口封装
// ============================================================

function recPath() {
  return `/v7/coop/dbsheet/${encodeURIComponent(CONF.fileId)}/sheets/${CONF.sheetId}/records`;
}

function buildRecord(r) {
  let fields = {};
  try {
    fields = typeof r.fields === 'string' ? JSON.parse(r.fields) : r.fields || {};
  } catch (_) {
    fields = {};
  }
  return {
    id: r.id,
    fields,
    lastModifiedTime: r.last_modified_time || r.lastModifiedTime || '',
    createdTime: r.created_time || r.createdTime || '',
  };
}

/** 按页遍历全部记录 → [{ id, fields(object), lastModifiedTime, createdTime }] */
async function listAllRecords({ pageSize = 100 } = {}) {
  const all = [];
  for (let pageNum = 1; ; pageNum++) {
    const data = await request('POST', `${recPath()}/list_by_page`, {
      page_num: pageNum,
      page_size: pageSize,
      prefer_id: false,
      show_record_extra_info: true,
    });
    const records = (data && data.records) || [];
    if (!records.length) break;
    for (const r of records) all.push(buildRecord(r));
    if (records.length < pageSize) break;
  }
  return all;
}

/**
 * 读取单条记录（Sprint-WPS-01）。
 * WPS V7 co-op 未内置稳定「按 id 拉取单条」的已验证路径，故先用
 * listAllRecords 定位（O(n)）；Sprint-WPS-02 联调确认更优单查询端点后再替换。
 * @param {string} id 记录 ID
 * @returns {{id, fields, lastModifiedTime, createdTime}|null}
 */
async function getRecord(id) {
  const records = await listAllRecords({ pageSize: 200 });
  return records.find((r) => String(r.id) === String(id)) || null;
}

/** 批量创建（fieldMaps: [ {字段名: 值, ...} ]）→ [{ id, fields }]；50 条/批 */
async function createRecords(fieldMaps) {
  if (!fieldMaps.length) return [];
  const out = [];
  const CHUNK = 50;
  for (let i = 0; i < fieldMaps.length; i += CHUNK) {
    const chunk = fieldMaps.slice(i, i + CHUNK);
    const data = await request('POST', `${recPath()}/create`, {
      prefer_id: false,
      records: chunk.map((f) => ({ fields_value: JSON.stringify(f) })),
    });
    const records = (data && data.records) || [];
    // Sprint-WPS-02-C 真机校准：create 响应的 fields_value 为 JSON 字符串，须解析为对象
    records.forEach((r) => {
      let fields = r.fields;
      if (typeof fields === 'string') {
        try { fields = JSON.parse(fields); } catch (_) { fields = {}; }
      }
      out.push({ id: r.id, fields: fields || {} });
    });
  }
  return out;
}

/** 批量更新（items: [ { id, fields } ]）；50 条/批 */
async function updateRecords(items) {
  if (!items.length) return;
  const CHUNK = 50;
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    await request('POST', `${recPath()}/update`, {
      prefer_id: false,
      records: chunk.map((it) => ({ id: it.id, fields_value: JSON.stringify(it.fields) })),
    });
  }
}

/** 批量删除（ids: 记录 ID 数组）；50 条/批。
 *  Sprint-WPS-02-C 真机校准：官方端点为 records/batch_delete，body 为字符串 ID 数组
 *  （旧推断 records/delete + [{id}] 实测 404 Route Not Found）。 */
async function deleteRecords(ids) {
  if (!ids.length) return;
  const CHUNK = 50;
  for (let i = 0; i < ids.length; i += CHUNK) {
    await request('POST', `${recPath()}/batch_delete`, {
      records: ids.slice(i, i + CHUNK).map((id) => String(id)),
    });
  }
}

// ============================================================
// 五、Schema 查询（Sprint-WPS-01）
// ============================================================

/**
 * 读取数据表结构（数据表/视图/字段/字段类型/字段 ID）。
 *
 * 当前实现走 V7 co-op 的 sheets 列表端点（与记录端点同族、同 Bearer 认证）。
 * WPS 开放平台另有 core/execute/schema/query（WPS-3 签名）端点，因签名方案不同，
 * 本 Sprint 不做切换；若 V7 sheets 端点在实测中返回形态不同，会在集成测试中
 * 就地校准并据实更新本函数注释。
 *
 * 返回归一化结构：
 * {
 *   fileId, sheetId,
 *   sheets: [
 *     { id, name, primaryFieldId, fields: [{ id, name, type }], views: [{ id, name, type }] }
 *   ]
 * }
 * 若 sheets 端点不可用，则降级从既有记录推断字段名（字段名以「当前板实际列」为准，
 * 类型统一标记为 'inferred'，仅供展示、不用于写入判断）。
 */
async function getSchema() {
  // 官方端点（Sprint-WPS-02-C 真机证实）：GET /v7/coop/dbsheet/{file_id}/schema
  // 旧实现用 /sheets 端点实测 404 Route Not Found，已按官方文档修正。
  try {
    const res = await _rawGet(`/v7/coop/dbsheet/${encodeURIComponent(CONF.fileId)}/schema`);
    const payload = _normalizeSchemaPayload(res);
    if (payload && payload.sheets) return payload;
  } catch (err) {
    console.warn(`${WPS_LOG_PREFIX} schema 端点不可用（${err.kind || 'unknown'}），降级为记录推断字段。原信息: ${err.message}`);
  }
  return { fileId: CONF.fileId, sheetId: CONF.sheetId, sheets: [], inferred: await _inferFieldsFromRecords() };
}

/** 低层 GET：复用 Bearer 认证，但容忍 {code,data} 与 {result,detail} 两种响应 */
async function _rawGet(path) {
  const token = await getAppAccessToken();
  let res;
  try {
    res = await fetch(`${CONF.base}${path}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(CONF.timeoutMs),
    });
  } catch (err) {
    const we = classify(err);
    we.message = `WPS 网络异常（${we.kind}）: ${path} ${err.message}`;
    throw we;
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    const e = new Error(`WPS schema HTTP ${res.status} ${path}: ${t.slice(0, 200)}`);
    Object.assign(e, { code: res.status, statusCode: res.status });
    throw classify(e);
  }
  let json;
  try {
    json = await res.json();
  } catch (err) {
    const we = classify(new SyntaxError(`WPS schema 响应解析失败: ${err.message}`));
    we.status = res.status;
    throw we;
  }
  return json;
}

function _normalizeSchemaPayload(json) {
  if (!json) return null;
  if (json && json.data && json.data.sheets) {
    return { fileId: CONF.fileId, sheetId: CONF.sheetId, sheets: json.data.sheets };
  }
  if (json && json.detail && json.detail.sheets) {
    return { fileId: CONF.fileId, sheetId: CONF.sheetId, sheets: json.detail.sheets };
  }
  if (Array.isArray(json)) {
    return { fileId: CONF.fileId, sheetId: CONF.sheetId, sheets: json };
  }
  if (Array.isArray(json && json.sheets)) {
    return { fileId: CONF.fileId, sheetId: CONF.sheetId, sheets: json.sheets };
  }
  return null;
}

/** 降级：从记录的字段名推断「当前板实际列」（字段名 → type='inferred'） */
async function _inferFieldsFromRecords() {
  try {
    const records = await listAllRecords({ pageSize: 1 });
    const rec = records[0];
    if (!rec || !rec.fields) return [];
    return Object.keys(rec.fields).map((name) => ({ id: '', name, type: 'inferred' }));
  } catch (e) {
    console.warn(`${WPS_LOG_PREFIX} 记录推断 schema 失败: ${e.message}`);
    return [];
  }
}

module.exports = {
  CONF,
  isConfigured,
  getAppAccessToken,
  request,
  listAllRecords,
  getRecord,
  getSchema,
  createRecords,
  updateRecords,
  deleteRecords,
};
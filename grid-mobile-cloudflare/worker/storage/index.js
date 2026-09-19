// ============================================================================
// storage/index.js —— 存储后端装配（仅飞书；表 ID 按表名解析，换 base 只改 FS_APP_TOKEN）
// ----------------------------------------------------------------------------
// 2026-09-18：用户确认放弃 WPS → 移除 wpsAdapter；STORAGE_BACKEND 固定走飞书。
//   目标：同一份代码在不同飞书 base 之间切换 —— 各 base 内表名固定，
//   storageConfig(env) 拉取 base 的表清单，按「表名 → 角色」契约解析出真实 table_id，
//   显式 env（FS_*_TABLE_ID）可作覆盖；换 base 仅需改 FS_APP_TOKEN。
// 所有 handler 通过 storageConfig(env)（async）拿到 fileId 与各表滑：
//   identitySheetId（登录=身份表）/ rosterSheetId（花名册）/ ledgerSheetId（登录台账=身份表）
//   prodSheetId（主台账=唯一写入目标，原 prod/test 已合并为单一主台账）。
// ============================================================================

import feishuAdapter from './feishuAdapter.js';

export const getAdapter = () => feishuAdapter;

// 表名 → 角色 契约（用户确认，2026-09-18 冻结；勿改，改需重核所有 base）
const ROLE_TABLE_NAMES = {
  identity: 'H5移动端身份表',
  roster: 'H5花名册表',
  prod: 'H5员工日常不安全行为台账',
};

// 模块级缓存：appToken -> Map(表名 -> tableId)（Workers isolate 内首次解析后复用）
const tableIdCache = new Map();

async function resolveTableIdByName(env, name) {
  const appToken = env.FS_APP_TOKEN;
  if (!appToken) return null;
  let byName = tableIdCache.get(appToken);
  if (!byName) {
    const tables = await feishuAdapter.listTables(env, appToken);
    byName = new Map(tables.map((t) => [t.name, t.tableId]).filter(([, id]) => id));
    tableIdCache.set(appToken, byName);
  }
  return byName.get(name) || null;
}

// 取表 ID：优先显式 env（覆盖），缺省按表名解析
async function tableIdFor(env, envKey, tableName) {
  const explicit = env && env[envKey] ? String(env[envKey]).trim() : '';
  if (explicit) return explicit;
  return resolveTableIdByName(env, tableName);
}

// 后端配置（async：首次会调飞书枚举表清单按名解析，之后走缓存）
export async function storageConfig(env) {
  const appToken = env.FS_APP_TOKEN;
  const identitySheetId = await tableIdFor(env, 'FS_IDENTITY_TABLE_ID', ROLE_TABLE_NAMES.identity);
  const rosterSheetId = await tableIdFor(env, 'FS_ROSTER_TABLE_ID', ROLE_TABLE_NAMES.roster);
  const ledgerSheetId = await tableIdFor(env, 'FS_LEDGER_TABLE_ID', ROLE_TABLE_NAMES.identity); // 登录=身份表
  const prodSheetId = await tableIdFor(env, 'FS_PATROL_PRODUCTION_TABLE_ID', ROLE_TABLE_NAMES.prod); // 主台账=唯一写入目标
  return {
    backend: 'feishu',
    fileId: appToken,
    identitySheetId,
    rosterSheetId,
    ledgerSheetId,
    prodSheetId,
    uploadSupported: false, // 历史标志（已无消费方）：飞书照片上传走 feishuAdapter.uploadMedia
  };
}

// 通用幂等预查：扫描目标表的 client_request_id，命中返回既有记录 id
// CF-WPS-43：加 60s 进程内缓存 + 写入时主动失效，避免每次 submit 都全表扫主台账（5s+）。
//   现场人员高频点「提交/重试」且同一记录可能在 60s 内多次重发 —— 缓存命中率极高。
//   失效由 index.js 在 handlePatrolSubmit/handlePatrolAttach/handleAssign*/Complete
//   写完后调 invalidateMainLedger() 触发。
let mainLedgerCache = { key: '', at: 0, recs: null };
const MAIN_LEDGER_CACHE_TTL_MS = 60 * 1000;
export function invalidateMainLedger(fileId, sheetId) {
  if (fileId && mainLedgerCache.key && mainLedgerCache.key.split('|')[0] === fileId) {
    mainLedgerCache = { key: '', at: 0, recs: null };
  }
}
async function getMainLedger(adapter, env, fileId, sheetId) {
  const key = fileId + '|' + sheetId;
  if (mainLedgerCache.key === key && (Date.now() - mainLedgerCache.at) < MAIN_LEDGER_CACHE_TTL_MS && mainLedgerCache.recs) {
    return mainLedgerCache.recs;
  }
  const recs = await adapter.scanRecords(env, fileId, sheetId, 20);
  mainLedgerCache = { key, at: Date.now(), recs };
  return recs;
}

function noteMatchesWant(fields, want) {
  const f = fields || {};
  const cid = f.client_request_id != null ? String(f.client_request_id) : '';
  if (cid && want.has(cid)) return true;
  // 主台账没有 client_request_id 列，幂等键被压进「备注」（格式 `… · req:<id>`）。
  const m = f['备注'] != null ? String(f['备注']).match(/req:([A-Za-z0-9_-]{8,64})/) : null;
  return !!(m && want.has(m[1]));
}

// 兜底：全表分页扫描（冷缓存 ~5~11s，2026-09-18 实测）。只在原生 search 不可用时走。
async function scanExisting(adapter, env, fileId, sheetId, want) {
  try {
    const recs = await getMainLedger(adapter, env, fileId, sheetId);
    const hits = recs.filter((r) => noteMatchesWant(r.fields, want)).map((r) => r.id);
    return hits.length ? hits : null;
  } catch {
    return null; // 预查失败不阻塞创建（宁可重复落一条，也不能让用户提交不上去）
  }
}

/*
 * 通用幂等预查：命中则返回既有记录 id，未命中返回 null。
 *
 * CF-WPS-43：主路径改成**飞书原生 search**（conditions: 备注 contains "req:<id>"），
 *   一次往返 ~400ms；原来每次 submit 都要把主台账整表分页扫一遍（冷 5~11s），
 *   这正是「点了乡镇经理/管理员姓名之后要干等好几秒」的主要来源。
 *   原生 search 还顺带解决了一个正确性问题：它直读线上数据，
 *   不再依赖进程内缓存，也就不存在「缓存还没失效 → 重复建单」的窗口。
 * 失败一律退回整表扫描：宁可慢，也不能把幂等保护弄丢。
 */
export async function findExistingByClientRequestId(adapter, env, fileId, sheetId, clientReqIds) {
  const want = new Set(clientReqIds.map(String).filter(Boolean));
  if (!want.size) return null;
  if (typeof adapter.searchRecords !== 'function' || want.size > 5) {
    return scanExisting(adapter, env, fileId, sheetId, want);
  }
  const hits = [];
  for (const cid of want) {
    let rows;
    try {
      rows = await adapter.searchRecords(env, fileId, sheetId, {
        field: '备注', operator: 'contains', value: 'req:' + cid, maxPages: 2,
      });
    } catch {
      return scanExisting(adapter, env, fileId, sheetId, want);
    }
    // contains 的语义由飞书决定，本地再用同样的正则复核一遍，避免把「相似」当命中/漏命中
    for (const r of rows) if (noteMatchesWant(r.fields, want)) hits.push(r.id);
  }
  return hits.length ? hits : null;
}

// 身份表（按手机号找人）缓存 —— 同 main ledger cache 套路。wxUidByPhone 与 handleWxBind
// 每请求都按手机号扫一次身份表（68 行，1 页 ≈ 500ms），60s 内缓存复用 → wxPush 段耗时从 2s 降到 ~0.3s。
let identityCache = { key: '', at: 0, rows: null };
const IDENTITY_CACHE_TTL_MS = 60 * 1000;
export function invalidateIdentity(fileId, sheetId) {
  identityCache = { key: '', at: 0, rows: null };
}
export async function getIdentityRows(adapter, env, fileId, sheetId) {
  const key = (fileId || '') + '|' + (sheetId || '');
  if (identityCache.key === key && (Date.now() - identityCache.at) < IDENTITY_CACHE_TTL_MS && identityCache.rows) {
    return identityCache.rows;
  }
  const rows = await adapter.scanRecords(env, fileId, sheetId);
  identityCache = { key, at: Date.now(), rows };
  return rows;
}

export { feishuAdapter };
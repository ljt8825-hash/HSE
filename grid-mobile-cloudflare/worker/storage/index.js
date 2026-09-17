// ============================================================================
// storage/index.js —— 存储后端装配（WPS / 飞书 可切换）
// ----------------------------------------------------------------------------
// 按 env.STORAGE_BACKEND 选择 adapter：
//   'wps'   （默认）-> wpsAdapter（WPS 多维表格，现有行为）
//   'feishu'       -> feishuAdapter（飞书多维表格，消除出海挂死）
// 所有 handler 通过 storageConfig(env) 拿到当前的 fileId 与四个 sheetId，
// 列名用「中文列名」做归一化桥 —— 因此 handler 的业务逻辑（mapper/校验）不动。
// ============================================================================

import * as wpsAdapter from './wpsAdapter.js';
import feishuAdapter from './feishuAdapter.js';

export function getAdapter(env) {
  const backend = String(env.STORAGE_BACKEND || 'wps').toLowerCase();
  return backend === 'feishu' ? feishuAdapter : wpsAdapter;
}

// 后端配置映射：fileId + 四个 sheetId（identity / roster / test / prod）
// - WPS：fileId = WPS_DBSHEET_FILE_ID；sheetId 来自 WPS_DBSHEET_*_SHEET_ID
// - 飞书：fileId = FS_APP_TOKEN（base app_token）；sheetId 来自 FS_*_TABLE_ID
export function storageConfig(env) {
  const backend = String(env.STORAGE_BACKEND || 'wps').toLowerCase();
  if (backend === 'feishu') {
    return {
      backend: 'feishu',
      fileId: env.FS_APP_TOKEN,
      identitySheetId: env.FS_IDENTITY_TABLE_ID,
      rosterSheetId: env.FS_ROSTER_TABLE_ID, // ⚠️ 已被 rosterSource() 取代（飞书空壳表）；仅为兼容保留，勿在新代码中读
      ledgerSheetId: env.FS_LEDGER_TABLE_ID, // 网格长信息台账（登录人员唯一来源，2026-09）
      testSheetId: env.FS_PATROL_TEST_TABLE_ID,
      prodSheetId: env.FS_PATROL_PRODUCTION_TABLE_ID,
      uploadSupported: false, // 历史标志（已无消费方）：飞书照片上传走 feishuAdapter.uploadMedia，photo_status=FEISHU_ATTACHMENT_READY
    };
  }
  return {
    backend: 'wps',
    fileId: env.WPS_DBSHEET_FILE_ID,
    identitySheetId: env.WPS_DBSHEET_IDENTITY_SHEET_ID,
    rosterSheetId: env.IDENTITY_ROSTER_SHEET_ID || '11',
    testSheetId: env.WPS_DBSHEET_TEST_SHEET_ID,
    prodSheetId: env.MOBILE_PATROL_TARGET_SHEET_ID, // 生产巡查目标=Sheet15「生产用台账」（CF-WPS-17），非三违 Sheet3
    uploadSupported: true,
  };
}

// ----------------------------------------------------------------------------
// 花名册权威来源（2026-09-17 业务方明确：「花名册」在 WPS 多维表格里）
// ----------------------------------------------------------------------------
// 事实：WPS 多维表格 Sheet 11「员工信息维护」= 1291 名正式员工的真实花名册，
//   字段 员工编码/姓名/性别/年龄/所属部门/职位/用工关系状态/负责区域（在职）/直接上级。
//   飞书侧同名表（FS_ROSTER_TABLE_ID）只是空壳（仅 1 条测试数据），无可用人员数据。
// 结论：花名册「读」与 STORAGE_BACKEND 解耦，恒走 WPS Sheet 11；
//   而身份/巡查记录/台账仍按 STORAGE_BACKEND（生产 = 飞书）写入，互不影响。
// 影响面：① /api/mobile/roster（选人）② resolvePatrolGrids（巡查网格解析）——
//   后者原先读飞书空壳表，导致真实账号网格恒为 unresolved，本改动同时修复该缺陷。
// 应急回落：env.ROSTER_BACKEND = 'feishu' 可强制切回飞书花名册（仅测试/应急，默认不设）。
export function rosterSource(env) {
  if (String(env.ROSTER_BACKEND || '').toLowerCase() === 'feishu') {
    return { backend: 'feishu', adapter: feishuAdapter, fileId: env.FS_APP_TOKEN, sheetId: env.FS_ROSTER_TABLE_ID };
  }
  return {
    backend: 'wps',
    adapter: wpsAdapter,
    fileId: env.WPS_DBSHEET_FILE_ID,
    sheetId: env.IDENTITY_ROSTER_SHEET_ID || '11',
  };
}

// 通用幂等预查（两后端共用）：扫描目标表的 client_request_id，命中返回既有记录 id
export async function findExistingByClientRequestId(adapter, env, fileId, sheetId, clientReqIds) {
  const want = new Set(clientReqIds.map(String));
  try {
    const recs = await adapter.scanRecords(env, fileId, sheetId, 20); // 上限 20 页 × 200 条，防失控
    const hits = [];
    for (const r of recs) {
      const cid = r.fields && r.fields.client_request_id != null ? String(r.fields.client_request_id) : '';
      if (cid && want.has(cid)) hits.push(r.id);
    }
    return hits.length ? hits : null;
  } catch {
    return null; // 预查失败不阻塞创建
  }
}

export { wpsAdapter, feishuAdapter };

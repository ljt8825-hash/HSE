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
      rosterSheetId: env.FS_ROSTER_TABLE_ID, // 员工花名册（1291 人；登录/选人/网格解析共用，2026-09）
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
    rosterSheetId: env.WPS_DBSHEET_ROSTER_SHEET_ID || env.IDENTITY_ROSTER_SHEET_ID,
    testSheetId: env.WPS_DBSHEET_TEST_SHEET_ID,
    prodSheetId: env.MOBILE_PATROL_TARGET_SHEET_ID, // 生产巡查目标=Sheet15「生产用台账」（CF-WPS-17），非三违 Sheet3
    uploadSupported: true,
  };
}

// ----------------------------------------------------------------------------
// 花名册说明（2026-09-17 业务方明确：花名册 = 飞书多维表格里的「花名册」表）
// ----------------------------------------------------------------------------
// 事实：飞书 base 内存在一张独立表「花名册」（FS_ROSTER_TABLE_ID），共 1291 名正式员工，
//   16 列：员工编码 / 姓名 / 所属部门 / 职位 / 性别 / 年龄 / 身份证号码 / 出生日期 /
//         入职日期 / 直接上级 / 用工关系状态 / 入司日期 / 离职日期 /
//         完整度百分比 / 负责区域（在职）/ 负责区域（离职）。
//   · 所属部门 = 班组名（「宁城街道一班」），与登录台账口径一致 → 选人按此收敛
//   · 负责区域（在职）= 网格串（「郑庄村」「专业队」）→ 巡查网格解析按 员工编码 精确命中
//   注意：同 base 内另一张「H5花名册表」（tblO3A9wDnA9Lm74）只有 1 条测试数据，不是花名册。
// 花名册「读」统一走 storageConfig(env).rosterSheetId —— 与 STORAGE_BACKEND 同源，
//   生产 = 飞书；无需额外的后端交叉开关。

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

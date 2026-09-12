'use strict';
/**
 * P2-B1-B §十/§十一 Post-Insert Enrichment —— 真实 fail-safe 实现（非第二实现，沿用 P2-B0-CONT 骨架文件）。
 *
 * 设计红线（与本阶段任务一致）：
 *   - 不调用 WPS 写接口；WPS Creator / Attachment 当前均验证为不可用（见 P2-B1-A / 本阶段探针），
 *     故本模块不做任何 WPS 网络调用（grep 验证：无 fetch/axios/http 请求 / 无 wpsClient 依赖）。
 *   - 不被 Pull Engine 调用；不修改 wpsGridPullEngine.js / wpsFieldMap.js / gridScope.js。
 *   - 全部 best-effort / fail-safe：任一子步骤失败都回落到 pending / NULL / candidate-only，
 *     绝不抛错中断主链，绝不删除/覆盖/合并现有 PG 行，绝不触碰图片字段。
 *
 * 真实接入点（仍 fail-safe）：
 *   - 身份：inspector_employee_id 已存在 → attributed；否则若注入可信 creatorWpsAccountId →
 *           wps_account_employee_map(active) → employee.id → gridScope.deriveGridIdForEmployee →
 *           仅当精确 1 个 live grid 才写（且只补 NULL，永不覆盖）。
 *           当前真实 WPS Pull 记录无 creator 输入 → 恒 pending（不猜）。
 *   - 附件：仅判定「PG 已有合法 http(s) URL 镜像 → resolved」，否则 pending。
 *           WPS Attachment uploadId→URL 端点（DBT v1 attachment/urls）本阶段探针实测 404 → 不调用。
 *   - 指纹：前置字段齐全才计算；否则 NULL（禁姓名代替 employee_id）。
 *   - 重复：命中仅作 candidate（查重但绝不删/拒/覆盖）。
 *
 * 状态机：
 *   attribution_status : pending | attributed   （绝不出 failed —— 无可信来源可判定失败）
 *   attachment_resolution_status : pending | resolved
 *   source_channel     : mobile_h5 | wps_form | unknown（本阶段只可靠判定 mobile_h5；wps_form 需表单来源证据，禁止仅凭 wps_record_id 推断）
 */

const crypto = require('crypto');
const gridScope = require('../gridScope');

/**
 * §十一（P2-B1-C）身份状态机 —— 规范命名，用于**决策/报告**，不新增 DB 列
 * （持久化仍只有 attribution_status: pending|attributed；本状态机更细粒度）。
 * 禁止自动写 inspector_employee_id，除非到达 ATTRIBUTED。
 */
const IDENTITY_STATE = {
  PENDING_CREATOR: 'PENDING_CREATOR',   // 没有 Creator
  PENDING_BRIDGE: 'PENDING_BRIDGE',     // 有 Creator，但没有 active bridge
  PENDING_EMPLOYEE: 'PENDING_EMPLOYEE', // bridge 指向 employee 不存在/已删除
  PENDING_GRID: 'PENDING_GRID',         // employee 无法得到唯一 live grid（0 或 >1）
  ATTRIBUTED: 'ATTRIBUTED',             // WPS Account → employee.id → unique live grid
  UNTRUSTED: 'UNTRUSTED',               // 只有姓名/昵称/业务字段，或 creator 为共享账号 → 无可信账号身份
};

/**
 * §八 attachment_resolution_status：
 *   resolved : PG 已有合法 http(s) URL 镜像（image_content / rectified_photo / schematic）
 *   pending  : 尚未解析（默认；WPS Attachment→URL 端点 404 不可用）
 * 绝不假造 URL、绝不把 WPS Attachment ID 当 URL、绝不修改现有图片字段、绝不调 404 端点。
 */
function resolveAttachmentStatus(record) {
  const hasUrl = record && (
    /^https?:\/\//.test((record.image_content || '').trim()) ||
    /^https?:\/\//.test((record.rectified_photo || '').trim()) ||
    /^https?:\/\//.test((record.schematic || '').trim())
  );
  return { status: hasUrl ? 'resolved' : 'pending', url: null };
}

/**
 * §七 / §十 submission_fingerprint：
 *   仅当所有必要可信字段齐全才计算；否则 NULL（绝不猜测）。
 *   禁止用 personnel_name / realName / nickname 替代 employee_id。
 */
function computeSubmissionFingerprint(record) {
  if (!record) return null;
  const required = ['inspector_employee_id', 'inspection_date', 'area_team', 'violation_behavior', 'violator_name'];
  const missing = required.filter((k) => record[k] == null || String(record[k]).trim() === '');
  if (missing.length > 0) return null; // 前置不完整 → NULL
  const raw = [
    record.inspector_employee_id,
    record.inspection_date,
    record.area_team,
    record.violation_behavior,
    record.violator_name,
  ].join('|');
  return crypto.createHash('sha256').update(raw, 'utf8').update('P2B0_SUBFP').digest('hex');
}

/**
 * §六 bridge 查询：WPS Creator ID → employee.id（仅用 status='active' 的经核验映射）。
 * 不自动生成映射；不按姓名/手机号/nickname/realName 匹配。当前桥接表 0 行 → 返回 null。
 * §七.3：同一 wps_account_id 存在**多条** active 映射 → 视为不可信 → 返回 null（绝不任选其一）。
 */
async function lookupEmployeeByWpsAccount(wpsAccountId, client) {
  if (!wpsAccountId || !client) return null;
  const r = await client.query(
    "SELECT employee_id, status FROM wps_account_employee_map WHERE wps_account_id=$1 AND status='active' LIMIT 2",
    [String(wpsAccountId)]
  );
  if (!r.rows || r.rows.length !== 1) return null; // 0 条（无映射）或 >1 条（多重映射）→ 均不归属
  return r.rows[0];
}

/**
 * §十一（P2-B1-C）employee 可解析性：仅当员工存在且未删除时才算可解析。
 * （gridScope.deriveGridIdForEmployee 不校验 employee 是否存在，故此处补一个最小只读检查，
 *   以区分 PENDING_EMPLOYEE 与 PENDING_GRID。）
 */
async function employeeResolvable(employeeId, client) {
  if (employeeId == null || !client) return false;
  const r = await client.query('SELECT id FROM public.employee WHERE id=$1 AND is_deleted=false LIMIT 1', [Number(employeeId)]);
  return !!(r.rows && r.rows[0]);
}

/**
 * §五/§六/§七 attribution 解析（fail-safe）：
 *   - 已有可信 inspector_employee_id → attributed（不再改）
 *   - creatorTrust='shared_account'（creator 为共享/应用账号）→ UNTRUSTED（绝不据此归属）
 *   - 注入可信 creatorWpsAccountId → bridge → employee.id → gridScope 派生 grid
 *       · 精确 1 grid → attributed + 可写 grid（writeGrid=true）
 *       · 0 / >1 grid → pending（PENDING_GRID，或 PENDING_EMPLOYEE 若员工不存在）
 *   - 无 creator 来源 → pending / PENDING_CREATOR
 * 严禁姓名匹配 / 猜 grid_id / 猜 inspector_employee_id。
 * 注：status/reason 语义与 P2-B1-B 完全一致（identityState 为**新增**字段），保证既有测试不破。
 */
async function resolveAttribution(record, ctx = {}) {
  const { db, creatorWpsAccountId, creatorTrust } = ctx;
  if (record && record.inspector_employee_id != null) {
    return { status: 'attributed', identityState: IDENTITY_STATE.ATTRIBUTED, employee_id: record.inspector_employee_id, gridId: record.grid_id, writeGrid: false, reason: 'already_attributed' };
  }
  if (creatorTrust === 'shared_account') {
    // creator 已证实为单一应用/属主账号（覆盖多名提交者）⇒ 不构成可信身份
    return { status: 'pending', identityState: IDENTITY_STATE.UNTRUSTED, employee_id: null, gridId: null, writeGrid: false, reason: 'creator_shared_account' };
  }
  if (!creatorWpsAccountId || !db) {
    return { status: 'pending', identityState: IDENTITY_STATE.PENDING_CREATOR, employee_id: null, gridId: null, writeGrid: false, reason: 'no_creator_source' };
  }
  const map = await lookupEmployeeByWpsAccount(creatorWpsAccountId, db);
  if (!map) {
    return { status: 'pending', identityState: IDENTITY_STATE.PENDING_BRIDGE, employee_id: null, gridId: null, writeGrid: false, reason: 'no_bridge_mapping' };
  }
  const empOk = await employeeResolvable(map.employee_id, db);
  const g = await gridScope.deriveGridIdForEmployee(map.employee_id, { client: db });
  if (g.status === 'ok') {
    return { status: 'attributed', identityState: IDENTITY_STATE.ATTRIBUTED, employee_id: map.employee_id, gridId: g.gridId, writeGrid: true, reason: 'bridge+gridscope' };
  }
  // 员工可解析但 grid 不可靠 → 仍 pending（写 grid_id 留 NULL，不覆盖）
  return {
    status: 'pending',
    identityState: empOk ? IDENTITY_STATE.PENDING_GRID : IDENTITY_STATE.PENDING_EMPLOYEE,
    employee_id: map.employee_id,
    gridId: null,
    writeGrid: false,
    reason: 'grid_derivation_' + g.status,
  };
}

/**
 * §十一 source_channel 可靠判定：
 *   - 仅当存在可靠 Channel A 证据（client_token 非空）→ 'mobile_h5'
 *   - 禁止 wps_record_id IS NOT NULL → 'wps_form'（「经过 WPS」≠「来自 WPS 表单」）
 *   - 其余返回 null（不改动，保持 unknown / 原值）
 * 本阶段绝不批量回填。
 */
function resolveSourceChannel(record) {
  if (record && record.client_token != null && String(record.client_token).trim() !== '') {
    return 'mobile_h5';
  }
  return null;
}

/**
 * §十/§十一 duplicate candidate 检测（查重但不处理）：
 *   命中（存在其他同 submission_fingerprint 行）→ isCandidate=true，action 恒 'candidate_only'。
 *   绝不删除/拒绝/覆盖/合并。
 */
async function detectDuplicateCandidate(record, fingerprint, client) {
  if (!fingerprint || !client || !record || record.id == null) {
    return { isCandidate: false, action: 'candidate_only', reason: 'no_fingerprint_or_no_db' };
  }
  const r = await client.query(
    'SELECT count(*)::int n FROM grid_inspection_records WHERE submission_fingerprint=$1 AND id<>$2',
    [fingerprint, record.id]
  );
  const isCandidate = (r.rows[0] && r.rows[0].n > 0);
  return { isCandidate, action: 'candidate_only' };
}

/** 由 enrichAfterInsert 结果构建只含扩展字段（+NULL 安全归属字段）的 writes 计划。 */
function buildWrites(result, record) {
  const w = {};
  w.attribution_status = result.attribution.status;          // pending | attributed
  w.attachment_resolution_status = result.attachment.status;  // pending | resolved
  w.submission_fingerprint = result.fingerprint;             // 可为 null
  if (result.sourceChannel) w.source_channel = result.sourceChannel;
  // 归属字段：仅当 attribution=attributed 且 inspector/grid **当前均为 NULL** 才写
  // （§八：已有 inspector_employee_id 或 grid_id 一律不覆盖）
  if (result.attribution.status === 'attributed' && result.attribution.writeGrid && record.inspector_employee_id == null && record.grid_id == null) {
    w.inspector_employee_id = result.attribution.employee_id;
    w.grid_id = result.attribution.gridId;
  }
  return w;
}

/**
 * 组合入口（供 worker / 测试调用）。
 * 任一子步骤异常 → 整体 fail-safe（pending / NULL / candidate-only），绝不抛错中断主链。
 * @param {object} record  PG 行（grid_inspection_records）
 * @param {object} [opts]  { db?: pg.Client, creatorWpsAccountId?: string }
 * @returns {Promise<object>} enrichment 结果（含 writes 计划，不写库）
 */
async function enrichAfterInsert(record, opts = {}) {
  const result = {
    attribution: { status: 'pending', identityState: IDENTITY_STATE.PENDING_CREATOR, employee_id: null, gridId: null, writeGrid: false },
    attachment: { status: 'pending', url: null },
    fingerprint: null,
    duplicateCandidate: { isCandidate: false, action: 'candidate_only' },
    sourceChannel: null,
    writes: {},
  };
  try {
    result.attribution = await resolveAttribution(record, { db: opts.db, creatorWpsAccountId: opts.creatorWpsAccountId, creatorTrust: opts.creatorTrust });
    result.attachment = resolveAttachmentStatus(record);
    result.fingerprint = computeSubmissionFingerprint(record);
    result.duplicateCandidate = await detectDuplicateCandidate(record, result.fingerprint, opts.db);
    result.sourceChannel = resolveSourceChannel(record);
    result.writes = buildWrites(result, record);
  } catch (e) {
    // 全局 fail-safe 回落（identity 适配器异常 → 不归属、不猜；fingerprint 宁 NULL 不错算）
    const errMsg = String((e && e.message) || e);
    result.attribution = { status: 'pending', identityState: IDENTITY_STATE.PENDING_CREATOR, employee_id: null, gridId: null, writeGrid: false, error: errMsg };
    result.attachment = { status: 'pending', url: null };
    result.fingerprint = null;
    result.duplicateCandidate = { isCandidate: false, action: 'candidate_only', error: errMsg };
    result.sourceChannel = null;
    result.writes = { attribution_status: 'pending', attachment_resolution_status: 'pending', submission_fingerprint: null };
  }
  return result;
}

/**
 * 将 enrichment 结果写回 gir（仅扩展字段 + NULL 安全归属字段）。
 * 幂等 / 可重复：归属字段仅在 record 当前为 NULL 时写入（WHERE ... IS NULL），绝不覆盖。
 * 不触碰图片字段、不删不改正式业务数据。
 * @returns {Promise<{updated: boolean, sql: string}>}
 */
async function applyEnrichment(client, id, result) {
  const writes = result.writes || {};
  const sets = [];
  const params = [];
  let i = 1;
  for (const k of ['attribution_status', 'attachment_resolution_status', 'submission_fingerprint', 'source_channel']) {
    if (Object.prototype.hasOwnProperty.call(writes, k)) {
      sets.push(`${k}=$${i++}`);
      params.push(writes[k]);
    }
  }
  let guardNullInspector = '';
  if (Object.prototype.hasOwnProperty.call(writes, 'inspector_employee_id')) {
    sets.push(`inspector_employee_id=$${i++}`); params.push(writes.inspector_employee_id);
    sets.push(`grid_id=$${i++}`); params.push(writes.grid_id);
    guardNullInspector = ' AND inspector_employee_id IS NULL AND grid_id IS NULL'; // 只补 NULL，永不覆盖（§八）
  }
  if (sets.length === 0) return { updated: false, sql: '' };
  sets.push('updated_at=NOW()');
  params.push(id);
  const sql = `UPDATE grid_inspection_records SET ${sets.join(', ')} WHERE id=$${i}${guardNullInspector}`;
  await client.query(sql, params);
  return { updated: true, sql };
}

module.exports = {
  IDENTITY_STATE,
  resolveAttachmentStatus,
  computeSubmissionFingerprint,
  lookupEmployeeByWpsAccount,
  employeeResolvable,
  resolveAttribution,
  resolveSourceChannel,
  detectDuplicateCandidate,
  buildWrites,
  enrichAfterInsert,
  applyEnrichment,
};

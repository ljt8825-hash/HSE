/**
 * PC「网格长巡查台账」WPS 数据访问仓储（Sprint-WPS-02 · 目标 B / Sprint-WPS-02-B 补齐）
 *
 * 角色：把 PC 台账既有的 /api/site/grid-records 业务语义，适配到 WPS 多维表。
 *
 *   site-mgmt.js  ──▶  gridInspectionRepository  ──▶  wpsDbsheetAdapter  ──▶  wpsClient  ──▶  WPS
 *
 * 职责/边界：
 *   - 不直接接触 WPS 原始 API（一律经 adapter / wpsFieldMap / wpsGridSyncService.FIELD_MAP）。
 *   - 字段语义单一真源：
 *       · 读取 / 写值统一走 wpsFieldMap（biz/pg/wps + 读写级别），对 pg 列缺失时再兜底到
 *         wpsGridSyncService.FIELD_MAP，保证既有读取列（含检查日期 date 归一）不回归。
 *       · 写入只落 readwrite 字段；readonly / reserved（violatorEmployeeId / GPS 等）不写。
 *   - 返回给前端的是既有 PC 台账 camelCase DTO（与 site-mgmt.formatGridInspectionRow 对齐），
 *     前端感知不到 WPS Record ID / fieldId / fields 结构。
 *   - 新建记录时，巡查人员身份由后端从当前登录用户解析（currentEmployeeContext），
 *     前端提交的 inspector 身份字段不可覆盖后端解析结果（fail-closed，禁伪造代录）。
 *     inspectorEmployeeId 只允许写入后端解析出的 employeeId，前端无法伪造覆盖。
 *   - 图片走附件归一化（adapter.normalizeAttachments → url 逗号串），不解析 DISPIMG。
 *
 * 说明：WPS_APP_ID/APP_SECRET 当前未配置，本仓储默认不启用；启用判定见 gridDataSource.js。
 * 本文件不含任何数据库写操作，历史 PostgreSQL 表不受影响。
 */
const sync = require('../wpsGridSyncService');
const adapter = require('./wpsDbsheetAdapter');
const { byPg, byBiz } = require('./wpsFieldMap');
const { resolveCurrentEmployee } = require('../currentEmployeeContext');

// ============================================================
// 读取侧：WPS 记录 → PC 台账 camelCase DTO
// ============================================================

/** 按 PG 列名取映射定义：优先 wpsFieldMap.byPg，缺失时兜底 sync.FIELD_MAP（含 检查日期 date 归一） */
function _mForPg(pg) {
  return byPg(pg) || sync.FIELD_MAP.find((x) => x.pg === pg) || null;
}

/** 统一按业务字段(biz)或 PG 列名(pg)取映射定义：create 传 biz 名，update 传 pg 列名 */
function _lookup(key) {
  return byBiz(key) || byPg(key) || sync.FIELD_MAP.find((x) => x.pg === key) || null;
}

/** 按 PG 列名从 WPS 字段取值（日期归一为 YYYY-MM-DD；空→''） */
function _pgValue(fields, pg) {
  const m = _mForPg(pg);
  if (!m || !(m.wps in fields)) return '';
  const raw = fields[m.wps];
  if (raw === null || raw === undefined) return '';
  if (m.tf === 'date' || sync.FIELD_MAP.find((x) => x.pg === pg)?.tf === 'date') {
    const d = sync.toIsoDate(raw);
    return d || '';
  }
  const s = String(raw).trim();
  return s === '' ? '' : s;
}

/** 链接型字段（v1 链接镜像）→ 逗号分隔 url 串，与 PG 的 image_content/rectified_photo/schematic 形态一致 */
function _links(fields, pg) {
  const m = _mForPg(pg);
  const vals = adapter.normalizeAttachments(m ? fields[m.wps] : undefined);
  return vals.map((a) => a.url).join(',');
}

function wpsRecordToDto(rec) {
  const f = rec.fields || {};
  return {
    id: rec.id, // WPS Record ID（字符串）
    areaTeam: _pgValue(f, 'area_team'),
    uploadTime: _pgValue(f, 'upload_time'),
    inspectionDate: _pgValue(f, 'inspection_date') || null,
    personnelName: _pgValue(f, 'personnel_name'),
    gridLevel: _pgValue(f, 'grid_level'),
    position: _pgValue(f, 'position'),
    violatorName: _pgValue(f, 'violator_name'),
    violatorGender: _pgValue(f, 'violator_gender'),
    violatorAge: _pgValue(f, 'violator_age'),
    vehicleType: _pgValue(f, 'vehicle_type'),
    reportStatus: _pgValue(f, 'report_status'),
    imageContent: _links(f, 'image_content'),
    violationBehavior: _pgValue(f, 'violation_behavior'),
    violationTypeResult: _pgValue(f, 'violation_type_result'),
    needRectification: _pgValue(f, 'need_rectification'),
    rectifier: _pgValue(f, 'rectifier'),
    rectifiedPhoto: _links(f, 'rectified_photo'),
    schematic: _links(f, 'schematic'),
    gridId: null, // PG-only
    nickname: _pgValue(f, 'nickname'),
    signupToday: _pgValue(f, 'signup_today'),
    marker: _pgValue(f, 'marker'),
    isResubmit: _pgValue(f, 'is_resubmit'),
    serialNo: _pgValue(f, 'serial_no'),
    createdAt: rec.createdTime || '',
    updatedAt: rec.lastModifiedTime || '',
  };
}

async function _allRecords() {
  return adapter.listRecords({ pageSize: 100 });
}

// ============================================================
// 读取：列表 / 筛选 / 排序 / 分页
// ============================================================

const EMPTY_MARKERS = ['无三违行为', '--', '-', '无'];

async function list({
  keyword, areaTeam, gridLevel, reportStatus, hasViolation, hasRectifiedPhoto, month,
  page = 1, pageSize = 20, sortField = 'inspectionDate', sortOrder = 'desc',
} = {}) {
  let list = (await _allRecords()).map(wpsRecordToDto);

  if (keyword) {
    const kw = String(keyword).toLowerCase();
    list = list.filter((r) =>
      String(r.personnelName || '').toLowerCase().includes(kw) ||
      String(r.areaTeam || '').toLowerCase().includes(kw) ||
      String(r.violatorName || '').toLowerCase().includes(kw) ||
      String(r.violationBehavior || '').toLowerCase().includes(kw)
    );
  }
  if (areaTeam) list = list.filter((r) => r.areaTeam === areaTeam);
  if (gridLevel) list = list.filter((r) => r.gridLevel === gridLevel);
  if (reportStatus) list = list.filter((r) => r.reportStatus === reportStatus);
  if (month) list = list.filter((r) => String(r.inspectionDate || '').slice(0, 7) === String(month));
  if (hasViolation) {
    list = list.filter((r) =>
      r.violationBehavior && !EMPTY_MARKERS.includes(String(r.violationBehavior).trim())
    );
  }
  if (hasRectifiedPhoto) {
    list = list.filter((r) => r.rectifiedPhoto && !EMPTY_MARKERS.includes(String(r.rectifiedPhoto).trim()));
  }

  const total = list.length;
  const order = sortOrder === 'asc' ? 1 : -1;
  if (sortField === 'inspectionDate') {
    list.sort((a, b) => order * ((new Date(a.inspectionDate || 0)) - (new Date(b.inspectionDate || 0))));
  } else {
    list.sort((a, b) => order * String(b[sortField] || '').localeCompare(String(a[sortField] || ''), 'zh'));
  }
  const offset = Math.max(0, ((parseInt(page, 10) || 1) - 1) * (parseInt(pageSize, 10) || 20));
  const size = Math.min(200, Math.max(1, parseInt(pageSize, 10) || 20));
  return { list: list.slice(offset, offset + size), total, page: offset + 1, pageSize: size };
}

/** 筛选下拉选项（areaTeam / gridLevel / reportStatus / months 去重）。reportStatus 在 WPS 模式下不再为空。 */
async function filterOptions() {
  const all = (await _allRecords()).map(wpsRecordToDto);
  const areaTeams = [...new Set(all.map((r) => r.areaTeam).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh'));
  const gridLevels = [...new Set(all.map((r) => r.gridLevel).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh'));
  const reportStatuses = [...new Set(all.map((r) => r.reportStatus).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh'));
  // 月份选项（YYYY-MM）：按巡查日期聚合，最新在前
  const months = [...new Set(all.map((r) => String(r.inspectionDate || '').slice(0, 7)).filter(Boolean))].sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
  return { areaTeams, gridLevels, reportStatuses, months };
}

/** 按 WPS Record ID 读取单条 → DTO | null */
async function get(id) {
  const rec = await adapter.getRecord(id);
  return rec ? wpsRecordToDto(rec) : null;
}

// ============================================================
// 写入侧字段（仅写 WPS 已存在、可写的 readwrite 字段，避免写到预留/不存在列）
// ============================================================

function _writableWpsName(key) {
  const m = _lookup(key);
  return m && m.mode === 'readwrite' ? m.wps : null;
}

/** 可写字段追加助手：值非空才写入，跳过预留/缺失列；空值按空串清除 */
function _put(map, biz, val, { allowEmpty = false } = {}) {
  const wps = _writableWpsName(biz);
  if (!wps) return;
  const s = val === null || val === undefined ? '' : String(val).trim();
  if (s === '' && !allowEmpty) return;
  map[wps] = s;
}

// ============================================================
// 创建：身份由后端解析，禁止前端伪造/代录；inspectorEmployeeId 仅接受后端 employeeId
// ============================================================

class IdentityError extends Error {
  constructor(message, reason) {
    super(message);
    this.identity = true;
    this.reason = reason;
  }
}

async function create({ user, data = {}, logger = console }) {
  const identity = await resolveCurrentEmployee(user, { logger });
  if (!identity.ok) {
    throw new IdentityError(identity.message, identity.reason);
  }
  const ctx = identity.context;

  const fieldsMap = {};
  // 巡查人员身份（后端解析为准；前端不可覆盖 inspector 身份）
  // inspectorEmployeeId 为人员关联键：只允许写入后端解析的 employeeId，前端提交的身份证数字段一律忽略。
  _put(fieldsMap, 'inspectorEmployeeId', ctx.employeeId, { allowEmpty: false });
  _put(fieldsMap, 'inspector_name', ctx.employeeName);
  _put(fieldsMap, 'operation_unit', data.areaTeam || ctx.operationUnit);
  _put(fieldsMap, 'position', ctx.position || data.position);
  _put(fieldsMap, 'grid_level', data.gridLevel || '');
  // 巡查编号 / 记录编号
  _put(fieldsMap, 'record_no', data.serialNo || data.recordNo || '');
  // 上报状态 / 车辆 / 违章结果 / 整改（PC 真实写入字段）
  _put(fieldsMap, 'reportStatus', data.reportStatus, { allowEmpty: true });
  _put(fieldsMap, 'vehicleType', data.vehicleType);
  _put(fieldsMap, 'violationTypeResult', data.violationTypeResult);
  _put(fieldsMap, 'needRectification', data.needRectification);
  _put(fieldsMap, 'rectifier', data.rectifier);
  // 三违业务
  _put(fieldsMap, 'violation_behavior', data.violationBehavior);
  _put(fieldsMap, 'violator_name', data.violatorName);
  _put(fieldsMap, 'violator_gender', data.violatorGender);
  _put(fieldsMap, 'violator_age', data.violatorAge);
  // 图片链接（前端若传 url 串则原样写入链接镜像列）
  _put(fieldsMap, 'violation_photos', data.imageContent);
  _put(fieldsMap, 'rectified_photos', data.rectifiedPhoto);
  _put(fieldsMap, 'schematic', data.schematic);
  // 其他
  _put(fieldsMap, 'signup_today', data.signupToday);
  _put(fieldsMap, 'is_resubmit', data.isResubmit);
  _put(fieldsMap, 'marker', data.marker);
  _put(fieldsMap, 'upload_time', data.uploadTime || new Date().toISOString());
  // violatorEmployeeId 本 Sprint 保持 reserved（无可靠违章人员选择机制），不写入

  const created = await adapter.createRecord([fieldsMap]);
  const first = created && created[0];
  if (!first) throw new Error('创建 WPS 记录失败：未返回记录 ID');
  return wpsRecordToDto(first);
}

// ============================================================
// 更新 / 删除 / 清空
// ============================================================

// PC 单元格编辑字段（camelCase → PG 列）。写入 WPS 前统一用 byPg/兼容读取解析对应 WPS 列。
const EDITABLE_CAMEL_TO_PG = {
  areaTeam: 'area_team', inspectionDate: 'inspection_date', personnelName: 'personnel_name',
  gridLevel: 'grid_level', position: 'position', violatorName: 'violator_name',
  violatorGender: 'violator_gender', violatorAge: 'violator_age', reportStatus: 'report_status',
  vehicleType: 'vehicle_type', violationTypeResult: 'violation_type_result',
  violationBehavior: 'violation_behavior', needRectification: 'need_rectification',
  rectifier: 'rectifier', nickname: 'nickname', signupToday: 'signup_today',
  marker: 'marker', isResubmit: 'is_resubmit', serialNo: 'serial_no',
};

/**
 * 更新 WPS 记录。仅更新已建立 pg↔wps 映射的可写字段（reportStatus/needRectification/rectifier/
 * vehicleType/violationTypeResult 等现在均有 WPS 列 → 正常写入；无映射列则忽略）。空值按清空处理。
 */
async function update(id, body = {}) {
  const existing = await adapter.getRecord(id);
  if (!existing) return null;
  const updates = { ...(existing.fields || {}) };
  for (const [camel, pg] of Object.entries(EDITABLE_CAMEL_TO_PG)) {
    if (!(camel in body)) continue;
    const m = _mForPg(pg);
    if (!m || m.mode !== 'readwrite') continue; // 非可写 / 预留列 → 跳过
    updates[m.wps] = body[camel] === '' || body[camel] === null ? '' : String(body[camel]).trim();
  }
  await adapter.updateRecord(id, updates);
  const after = await adapter.getRecord(id);
  return after ? wpsRecordToDto(after) : null;
}

/** 删除（按 WPS Record ID，可批量）。返回删除数量。 */
async function remove(ids) {
  const list = (Array.isArray(ids) ? ids : [ids]).filter((v) => v != null && v !== '');
  if (!list.length) return 0;
  await adapter.deleteRecord(list);
  return list.length;
}

/** 清空全部台账（WPS 端删除全部记录）。返回删除数量。 */
async function clearAll() {
  const all = await _allRecords();
  const ids = all.map((r) => r.id);
  if (ids.length) await adapter.deleteRecord(ids);
  return ids.length;
}

module.exports = {
  IdentityError,
  list,
  get,
  create,
  update,
  remove,
  clearAll,
  filterOptions,
  wpsRecordToDto,
};
/**
 * 现场管理模块（/api/site-mgmt）—— 业务层
 * 原 routes/site-mgmt.js（2215 行）全部业务 + SQL + 内存降级 + WPS/PG 双数据源守卫收敛于此。
 * 每个端点对应一个 service 函数，返回统一描述符（__t: json / list / not-found），
 * 由 controllers/siteMgmtController.js 的 respond() 解释为对外 JSON 契约，行为与原路由逐字节一致。
 *
 * 三态数据源守卫改造说明（Sprint-WPS-02-A）：
 *   原 gridDataSourceMode(res) 会在 misconfigured 时直接发送 error(-2, WPS_CONFIG_ERROR) 响应并返回 null，
 *   依附 response 对象。service 层不可触碰响应对象，改为 gridDataSourceModeGuard() 返回 'wps' | 'pg'；
 *   当为 'misconfigured' 时返回描述符 { __t:'json', error:{ code:-2, message:WPS_CONFIG_ERROR } }，
 *   由 controller 统一发送，调用该守卫的端点据此短路返回（WPS_CONFIG_ERROR 文案串原样保留）。
 *
 * 内存降级：memoryStores / memoryCounters / initMemoryData 为本模块单例，仍被
 *   services/importMemoryService.js 直接读取改写，故保持原位并随模块导出（与父路由转发一致）。
 */

const { pool, isConnected } = require('../config/db');
const { paginateMemory } = require('../utils/commonResponse');
const { auditLog } = require('../routes/audit');
// WPS-PG-SYNC-01：本模块不再引用同步引擎 —— PG 业务写入（POST/PUT/DELETE/PURGE）只落 PG，
// 不触发任何 WPS 写操作（PG→WPS 反向写入能力已在 services 层封禁）。
// Sprint-WPS-02: PC 网格长巡查台账数据源切换（默认关闭，开启见 services/wps/gridDataSource.js）
// Sprint-WPS-02-A 阻断项1整改：改为三态判定，WPS_GRID_DATA_SOURCE=true 但凭证不完整 → 显式配置错误，禁止静默回 PG。
const { getGridDataSourceMode } = require('./wps/gridDataSource');
const gridWps = require('./wps/gridInspectionRepository');
// 阶段2：PG 创建分支正式身份解析器（users.employee_id → employee.id），与 WPS 旧链路互不影响
const { resolveAuthenticatedEmployee } = require('./authenticatedEmployeeResolver');
// 阶段3-B-2：网格巡查行级数据范围（own_grid / all_grid）+ PG 新建记录 grid_id 后端派生
const { resolveGridScope, buildScopeSqlCondition, deriveGridIdForEmployee, SCOPE } = require('./gridScope');
// 阶段3-B-1：DELETE ALL 后端二次确认文本（不依赖前端确认，缺失/不匹配一律 400）
const gridCompletionService = require('./gridCompletionService');

// 阶段3-B-1：DELETE ALL 后端二次确认文本（不依赖前端确认，缺失/不匹配一律 400）
const GRID_PURGE_CONFIRM_TEXT = '清空全部台账';

// 数据源三态守卫（不触碰 res）：返回 'wps' | 'pg'；当为 'misconfigured' 时返回
// 描述符 { __t:'json', error:{ code:-2, message:WPS_CONFIG_ERROR } }，调用端须短路返回。
const WPS_CONFIG_ERROR = 'WPS 网格台账数据源已开启但配置不完整（缺少 WPS_APP_ID / WPS_APP_SECRET / WPS_DBSHEET_FILE_ID / WPS_DBSHEET_SHEET_ID 任一）。禁止静默回落到 PostgreSQL，请补齐配置后重试。';
function gridDataSourceModeGuard() {
  const mode = getGridDataSourceMode();
  if (mode === 'misconfigured') {
    return { __t: 'json', error: { code: -2, message: WPS_CONFIG_ERROR } };
  }
  return mode; // 'wps' | 'pg'
}
// 判断「守卫返回了配置错误描述符」的辅助（语义化短路）
function isConfigErrorDescriptor(ds) {
  return !!(ds && ds.__t === 'json');
}

// ========== 内存降级存储 ==========
const memoryStores = {
  violations: [],
  fireEquipment: [],
  gridAreas: [],
  gridInspectionRecords: [],
  objectives: [],
  driverAssessments: [],
  driverViolations: [],
  driverMonthly: [],
  driverThreeViolations: [],
};
const memoryCounters = { violations: 1, fireEquipment: 1, gridAreas: 1, gridInspectionRecords: 1, objectives: 1, driverAssessments: 1, driverViolations: 1, driverMonthly: 1, driverThreeViolations: 1 };
let memoryInitialized = false;

function initMemoryData() {
  if (memoryInitialized) return;
  // 种子数据已移除，内存模式仅用于 API 兼容性（空数据）
  memoryStores.violations = [];
  memoryStores.fireEquipment = [];
  memoryStores.gridAreas = [];
  memoryStores.gridInspectionRecords = [];
  memoryStores.objectives = [];
  memoryStores.driverAssessments = [];
  memoryStores.driverViolations = [];
  memoryStores.driverMonthly = [];
  memoryStores.driverThreeViolations = [];
  memoryCounters.violations = 1;
  memoryCounters.fireEquipment = 1;
  memoryCounters.gridAreas = 1;
  memoryCounters.gridInspectionRecords = 1;
  memoryCounters.objectives = 1;
  memoryCounters.driverAssessments = 1;
  memoryCounters.driverViolations = 1;
  memoryCounters.driverMonthly = 1;
  memoryCounters.driverThreeViolations = 1;
  memoryInitialized = true;
}

// ========== 通用 formatRow 函数 ==========
function formatViolationRow(row) {
  return {
    id: row.id,
    title: row.title || '',
    type: row.type || '',
    level: row.level || '一般',
    status: row.status || '待整改',
    department: row.department || '',
    violator: row.violator || '',
    area: row.area || '',
    discoverer: row.discoverer || '',
    discoverDate: row.discover_date || row.discoverDate || null,
    description: row.description || '',
    rectificationMeasure: row.rectification_measure || row.rectificationMeasure || '',
    deadline: row.deadline || null,
    rectifier: row.rectifier || '',
    rectificationDate: row.rectification_date || row.rectificationDate || null,
    remark: row.remark || '',
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
  };
}

function formatFireEquipmentRow(row) {
  return {
    id: row.id,
    name: row.name || '',
    type: row.type || '',
    model: row.model || '',
    location: row.location || '',
    status: row.status || '正常',
    quantity: row.quantity || 0,
    installDate: row.install_date || row.installDate || null,
    expiryDate: row.expiry_date || row.expiryDate || null,
    lastCheckDate: row.last_check_date || row.lastCheckDate || null,
    nextCheckDate: row.next_check_date || row.nextCheckDate || null,
    manager: row.manager || '',
    phone: row.phone || '',
    remark: row.remark || '',
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
  };
}

function formatGridAreaRow(row) {
  return {
    id: row.id,
    gridCode: row.grid_code || row.gridCode || '',
    gridLevel: row.grid_level || row.gridLevel || '',
    name: row.name || '',
    personnelId: row.personnel_id || row.personnelId || null,
    position: row.position || '',
    area: row.area || '',
    township: row.township || '',
    patrolFrequency: row.patrol_frequency || row.patrolFrequency || '',
    phone: row.phone || '',
    completionRate: parseFloat(row.completion_rate ?? row.completionRate) || 0,
    riskLevel: row.risk_level || row.riskLevel || '一般风险',
    remarks: row.remarks || row.remark || '',
    status: row.status || '在岗',
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
  };
}

// 交通安全评估档案行格式化
function formatDriverAssessmentRow(row) {
  return {
    id: row.id,
    archiveNo: row.archiveNo || row.archive_no || '',
    name: row.name || '',
    idCard: row.idCard || row.id_card || '',
    licenseType: row.licenseType || row.license_type || '',
    department: row.department || '',
    vehicleNo: row.vehicleNo || row.vehicle_no || '',
    assessmentDate: row.assessmentDate || row.assessment_date || null,
    assessmentResult: row.assessmentResult || row.assessment_result || '',
    assessmentLevel: row.assessmentLevel || row.assessment_level || '',
    assessmentType: row.assessmentType || row.assessment_type || '驾驶证评估',
    controlMeasures: row.controlMeasures || row.control_measures || '',
    status: row.status || '未完成',
    expiryDate: row.expiryDate || row.expiry_date || null,
    phone: row.phone || '',
    remark: row.remark || '',
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
  };
}

// 驾驶员违章记录行格式化
function formatDriverViolationRow(row) {
  return {
    id: row.id,
    seq: row.seq ?? row.seq_no ?? null,
    name: row.name || '',
    plateNo: row.plateNo || row.plate_no || '',
    violationTime: row.violationTime || row.violation_time || null,
    violationLocation: row.violationLocation || row.violation_location || '',
    violationType: row.violationType || row.violation_type || '',
    violationDesc: row.violationDesc || row.violation_desc || '',
    demeritPoints: Number(row.demeritPoints ?? row.demerit_points ?? 0) || 0,
    fineAmount: Number(row.fineAmount ?? row.fine_amount ?? 0) || 0,
    handleStatus: row.handleStatus || row.handle_status || '待处理',
    handleMethod: row.handleMethod || row.handle_method || '',
    handleResult: row.handleResult || row.handle_result || '',
    remark: row.remark || '',
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
  };
}

// 三违扣分记录行格式化：字段结构与驾驶证违章完全一致，直接复用（表名差异在 SQL 层处理）
const formatDriverThreeViolationRow = formatDriverViolationRow;

// 月度考核行格式化（DB snake_case → 前端 camelCase；含 personnelId + 2026-09 五考核列）
function formatDriverMonthlyRow(row) {
  return {
    id: row.id,
    month: row.month || '',
    name: row.name || '',
    department: row.department || '',
    personnelId: row.personnel_id ?? row.personnelId ?? null,
    safetyScore: Number(row.safetyScore ?? row.safety_score ?? 0) || 0,
    disciplineScore: Number(row.disciplineScore ?? row.discipline_score ?? 0) || 0,
    trainingScore: Number(row.trainingScore ?? row.training_score ?? 0) || 0,
    totalScore: Number(row.totalScore ?? row.total_score ?? 0) || 0,
    assessmentLevel: row.assessmentLevel || row.assessment_level || '',
    mainProblem: row.mainProblem || row.main_problem || '',
    assessor: row.assessor || '',
    threeCheckManagement: Number(row.threeCheckManagement ?? row.three_check_management ?? 0) || 0,
    lampDirty: Number(row.lampDirty ?? row.lamp_dirty ?? 0) || 0,
    lampFailure: Number(row.lampFailure ?? row.lamp_failure ?? 0) || 0,
    safetyMonitor: Number(row.safetyMonitor ?? row.safety_monitor ?? 0) || 0,
    fireManagement: Number(row.fireManagement ?? row.fire_management ?? 0) || 0,
    remark: row.remark || '',
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
  };
}

// 网格长巡查台账（grid_inspection_records）行格式化：DB snake_case → 前端 camelCase
function formatGridInspectionRow(row) {
  return {
    id: row.id,
    areaTeam: row.area_team || '',
    uploadTime: row.upload_time || '',
    inspectionDate: row.inspection_date || null,
    personnelName: row.personnel_name || '',
    gridLevel: row.grid_level || '',
    position: row.position || '',
    violatorName: row.violator_name || '',
    violatorGender: row.violator_gender || '',
    violatorAge: row.violator_age || '',
    vehicleType: row.vehicle_type || '',
    reportStatus: row.report_status || '',
    imageContent: row.image_content || '',
    violationBehavior: row.violation_behavior || '',
    violationTypeResult: row.violation_type_result || '',
    needRectification: row.need_rectification || '',
    rectifier: row.rectifier || '',
    rectifiedPhoto: row.rectified_photo || '',
    schematic: row.schematic || '',
    gridId: row.grid_id || null,
    nickname: row.nickname || '',
    signupToday: row.signup_today || '',
    marker: row.marker || '',
    isResubmit: row.is_resubmit || '',
    serialNo: row.serial_no || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// 网格长巡查台账允许单元格编辑的字段白名单（DB snake_case）
const GRID_RECORD_EDITABLE = [
  'area_team', 'inspection_date', 'personnel_name', 'grid_level', 'position',
  'violator_name', 'violator_gender', 'violator_age', 'report_status',
  'violation_behavior', 'need_rectification', 'rectifier',
  // GRID-03-B：整改后照片（rectified_photo）纳入可更新白名单，使移动端可对既有巡查记录
  // 「补传整改照片」。整改「完成/未完成」口径仍只由该字段承载（services/sanweiLedgerDerive.js），
  // 不引入任何整改状态字段或状态机。
  'rectified_photo',
  'nickname', 'signup_today', 'marker', 'is_resubmit', 'serial_no',
];

// 新建台账记录允许的字段（camelCase → DB snake_case；排除自动字段 id/created_at/updated_at）
const GRID_RECORD_CREATE_CAMELS = {
  areaTeam: 'area_team',
  inspectionDate: 'inspection_date',
  personnelName: 'personnel_name',
  gridLevel: 'grid_level',
  position: 'position',
  violatorName: 'violator_name',
  violatorGender: 'violator_gender',
  violatorAge: 'violator_age',
  vehicleType: 'vehicle_type',
  reportStatus: 'report_status',
  imageContent: 'image_content',
  violationBehavior: 'violation_behavior',
  violationTypeResult: 'violation_type_result',
  needRectification: 'need_rectification',
  rectifier: 'rectifier',
  rectifiedPhoto: 'rectified_photo',
  schematic: 'schematic',
  nickname: 'nickname',
  signupToday: 'signup_today',
  marker: 'marker',
  isResubmit: 'is_resubmit',
  serialNo: 'serial_no',
};

// ============================================================
// 三违管理 CRUD
// ============================================================

// ========== GET /violations ==========
async function violationList(query) {
  try {
    const { page = 1, pageSize = 20, keyword, type, level, status, department, area } = query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(pageSize) || 10), 200);
    const offset = (pageNum - 1) * limitNum;

    initMemoryData();
    let data = memoryStores.violations.filter(r => !r.is_deleted);

    if (keyword) {
      const kw = keyword.toLowerCase();
      data = data.filter(r =>
        (r.title && r.title.toLowerCase().includes(kw)) ||
        (r.violator && r.violator.toLowerCase().includes(kw)) ||
        (r.description && r.description.toLowerCase().includes(kw))
      );
    }
    if (type) data = data.filter(r => r.type === type);
    if (level) data = data.filter(r => r.level === level);
    if (status) data = data.filter(r => r.status === status);
    if (department) data = data.filter(r => r.department === department);
    if (area) data = data.filter(r => r.area === area);

    const { list, total } = paginateMemory(data, pageNum, limitNum);
    return { __t: 'list', list, total, page: pageNum, pageSize: limitNum, message: '查询成功(内存模式)' };
  } catch (err) {
    console.error('[violationList]', err.message);
    throw err;
  }
}

// ========== GET /violations/:id ==========
async function violationDetail(id) {
  try {
    initMemoryData();
    const record = memoryStores.violations.find(r => r.id === parseInt(id) && !r.is_deleted);
    if (!record) return { __t: 'not-found', message: '记录不存在' };
    return { __t: 'json', payload: record, message: '查询成功(内存模式)' };
  } catch (err) {
    console.error('[violationDetail]', err.message);
    throw err;
  }
}

// ========== POST /violations ==========
async function violationCreate(body, ctx) {
  try {
    initMemoryData();
    const b = body;
    const record = {
      id: memoryCounters.violations++,
      title: b.title || '',
      type: b.type || '违章作业',
      level: b.level || '一般',
      status: b.status || '待整改',
      department: b.department || '',
      violator: b.violator || '',
      area: b.area || '',
      discoverer: b.discoverer || '',
      discoverDate: b.discoverDate || new Date().toISOString().slice(0, 10),
      description: b.description || '',
      rectificationMeasure: b.rectificationMeasure || '',
      deadline: b.deadline || null,
      rectifier: b.rectifier || '',
      rectificationDate: b.rectificationDate || null,
      remark: b.remark || '',
      is_deleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    memoryStores.violations.push(record);
    await auditLog({ userId: ctx && ctx.userId, username: ctx && ctx.username, action: 'create', module: 'site-mgmt', description: `创建三违记录: ${b.title}`, ip: ctx && ctx.ip }).catch(() => {});
    return { __t: 'json', payload: record, message: '创建成功(内存模式)' };
  } catch (err) {
    console.error('[violationCreate]', err.message);
    throw err;
  }
}

// ========== PUT /violations/:id ==========
async function violationUpdate(id, body, ctx) {
  try {
    initMemoryData();
    const idx = memoryStores.violations.findIndex(r => r.id === parseInt(id) && !r.is_deleted);
    if (idx === -1) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
    Object.assign(memoryStores.violations[idx], body, { updatedAt: new Date().toISOString() });
    await auditLog({ userId: ctx && ctx.userId, username: ctx && ctx.username, action: 'update', module: 'site-mgmt', description: `更新三违记录 ID=${id}`, ip: ctx && ctx.ip }).catch(() => {});
    return { __t: 'json', payload: memoryStores.violations[idx], message: '更新成功(内存模式)' };
  } catch (err) {
    console.error('[violationUpdate]', err.message);
    throw err;
  }
}

// ========== DELETE /violations/:id ==========
async function violationDelete(id, ctx) {
  try {
    initMemoryData();
    const record = memoryStores.violations.find(r => r.id === parseInt(id) && !r.is_deleted);
    if (!record) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
    record.is_deleted = true;
    await auditLog({ userId: ctx && ctx.userId, username: ctx && ctx.username, action: 'delete', module: 'site-mgmt', description: `删除三违记录 ID=${id}`, ip: ctx && ctx.ip }).catch(() => {});
    return { __t: 'json', payload: null, message: '删除成功(内存模式)' };
  } catch (err) {
    console.error('[violationDelete]', err.message);
    throw err;
  }
}

// ============================================================
// 消防设施管理 CRUD
// ============================================================

// ========== GET /fire-equipment ==========
async function fireEquipmentList(query) {
  try {
    const { page = 1, pageSize = 20, keyword, type, status, location } = query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(pageSize) || 10), 200);
    const offset = (pageNum - 1) * limitNum;

    initMemoryData();
    let data = memoryStores.fireEquipment.filter(r => !r.is_deleted);

    if (keyword) {
      const kw = keyword.toLowerCase();
      data = data.filter(r =>
        (r.name && r.name.toLowerCase().includes(kw)) ||
        (r.model && r.model.toLowerCase().includes(kw)) ||
        (r.manager && r.manager.toLowerCase().includes(kw))
      );
    }
    if (type) data = data.filter(r => r.type === type);
    if (status) data = data.filter(r => r.status === status);
    if (location) data = data.filter(r => r.location === location);

    const { list, total } = paginateMemory(data, pageNum, limitNum);
    return { __t: 'list', list, total, page: pageNum, pageSize: limitNum, message: '查询成功(内存模式)' };
  } catch (err) {
    console.error('[fireEquipmentList]', err.message);
    throw err;
  }
}

// ========== GET /fire-equipment/:id ==========
async function fireEquipmentDetail(id) {
  try {
    initMemoryData();
    const record = memoryStores.fireEquipment.find(r => r.id === parseInt(id) && !r.is_deleted);
    if (!record) return { __t: 'not-found', message: '记录不存在' };
    return { __t: 'json', payload: record, message: '查询成功(内存模式)' };
  } catch (err) {
    console.error('[fireEquipmentDetail]', err.message);
    throw err;
  }
}

// ========== POST /fire-equipment ==========
async function fireEquipmentCreate(body, ctx) {
  try {
    initMemoryData();
    const b = body;
    const record = {
      id: memoryCounters.fireEquipment++,
      name: b.name || '',
      type: b.type || '灭火器',
      model: b.model || '',
      location: b.location || '',
      status: b.status || '正常',
      quantity: b.quantity || 0,
      installDate: b.installDate || null,
      expiryDate: b.expiryDate || null,
      lastCheckDate: b.lastCheckDate || null,
      nextCheckDate: b.nextCheckDate || null,
      manager: b.manager || '',
      phone: b.phone || '',
      remark: b.remark || '',
      is_deleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    memoryStores.fireEquipment.push(record);
    await auditLog({ userId: ctx && ctx.userId, username: ctx && ctx.username, action: 'create', module: 'site-mgmt', description: `创建消防设施: ${b.name}`, ip: ctx && ctx.ip }).catch(() => {});
    return { __t: 'json', payload: record, message: '创建成功(内存模式)' };
  } catch (err) {
    console.error('[fireEquipmentCreate]', err.message);
    throw err;
  }
}

// ========== PUT /fire-equipment/:id ==========
async function fireEquipmentUpdate(id, body, ctx) {
  try {
    initMemoryData();
    const idx = memoryStores.fireEquipment.findIndex(r => r.id === parseInt(id) && !r.is_deleted);
    if (idx === -1) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
    Object.assign(memoryStores.fireEquipment[idx], body, { updatedAt: new Date().toISOString() });
    await auditLog({ userId: ctx && ctx.userId, username: ctx && ctx.username, action: 'update', module: 'site-mgmt', description: `更新消防设施 ID=${id}`, ip: ctx && ctx.ip }).catch(() => {});
    return { __t: 'json', payload: memoryStores.fireEquipment[idx], message: '更新成功(内存模式)' };
  } catch (err) {
    console.error('[fireEquipmentUpdate]', err.message);
    throw err;
  }
}

// ========== DELETE /fire-equipment/:id ==========
async function fireEquipmentDelete(id, ctx) {
  try {
    initMemoryData();
    const record = memoryStores.fireEquipment.find(r => r.id === parseInt(id) && !r.is_deleted);
    if (!record) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
    record.is_deleted = true;
    await auditLog({ userId: ctx && ctx.userId, username: ctx && ctx.username, action: 'delete', module: 'site-mgmt', description: `删除消防设施 ID=${id}`, ip: ctx && ctx.ip }).catch(() => {});
    return { __t: 'json', payload: null, message: '删除成功(内存模式)' };
  } catch (err) {
    console.error('[fireEquipmentDelete]', err.message);
    throw err;
  }
}

// ============================================================
// 驾驶员管理 CRUD（纯内存 / DB 双模式）
// ============================================================

// 交通安全评估档案可更新字段（camelCase → snake_case）
const DRIVER_ASSESS_UPDATABLE = [
  'archiveNo', 'name', 'idCard', 'licenseType', 'department', 'vehicleNo',
  'assessmentDate', 'assessmentResult', 'assessmentLevel', 'assessmentType',
  'controlMeasures', 'status', 'expiryDate', 'phone', 'remark',
].map((c) => [c, c.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()]);

// 驾驶员违章可更新字段 [camel, snake, type('str'|'num'|'nullable-num')]
const DRIVER_VIOLATION_UPDATABLE = [
  ['seq', 'seq', 'nullable-num'],
  ['name', 'name', 'str'],
  ['plateNo', 'plate_no', 'str'],
  ['violationTime', 'violation_time', 'str'],
  ['violationLocation', 'violation_location', 'str'],
  ['violationType', 'violation_type', 'str'],
  ['violationDesc', 'violation_desc', 'str'],
  ['demeritPoints', 'demerit_points', 'num'],
  ['fineAmount', 'fine_amount', 'num'],
  ['handleStatus', 'handle_status', 'str'],
  ['handleMethod', 'handle_method', 'str'],
  ['handleResult', 'handle_result', 'str'],
  ['remark', 'remark', 'str'],
];

// 三违扣分记录可更新字段白名单：与驾驶证违章结构完全一致，直接复用
const DRIVER_THREE_VIOLATION_UPDATABLE = DRIVER_VIOLATION_UPDATABLE;

// 月度考核可更新字段 [camel, snake, type('str'|'num'|'nullable-num')]
const DRIVER_MONTHLY_UPDATABLE = [
  ['month', 'month', 'str'],
  ['name', 'name', 'str'],
  ['department', 'department', 'str'],
  ['personnelId', 'personnel_id', 'nullable-num'],
  ['safetyScore', 'safety_score', 'num'],
  ['disciplineScore', 'discipline_score', 'num'],
  ['trainingScore', 'training_score', 'num'],
  ['totalScore', 'total_score', 'num'],
  ['assessmentLevel', 'assessment_level', 'str'],
  ['mainProblem', 'main_problem', 'str'],
  ['assessor', 'assessor', 'str'],
  ['threeCheckManagement', 'three_check_management', 'num'],
  ['lampDirty', 'lamp_dirty', 'num'],
  ['lampFailure', 'lamp_failure', 'num'],
  ['safetyMonitor', 'safety_monitor', 'num'],
  ['fireManagement', 'fire_management', 'num'],
  ['remark', 'remark', 'str'],
];

// ========== GET /driver-assessments ==========
async function driverAssessmentList(query) {
  try {
    const { page = 1, pageSize = 20, keyword, department, archiveYear } = query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(pageSize) || 10), 200);
    const offset = (pageNum - 1) * limitNum;

    if (!isConnected()) {
      initMemoryData();
      let data = memoryStores.driverAssessments.filter(r => !r.is_deleted).map(formatDriverAssessmentRow);
      if (keyword) {
        const kw = keyword.toLowerCase();
        data = data.filter(r =>
          (r.name && r.name.toLowerCase().includes(kw)) ||
          (r.archiveNo && r.archiveNo.toLowerCase().includes(kw)) ||
          (r.vehicleNo && r.vehicleNo.toLowerCase().includes(kw))
        );
      }
      if (department) data = data.filter(r => r.department === department);
      if (archiveYear) data = data.filter(r => r.assessmentDate && String(r.assessmentDate).slice(0, 4) === String(archiveYear));
      const { list, total } = paginateMemory(data, pageNum, limitNum);
      return { __t: 'list', list, total, page: pageNum, pageSize: limitNum, message: '查询成功(内存模式)' };
    }

    const conditions = [];
    const params = [];
    let paramIdx = 1;
    if (keyword) {
      conditions.push(`(name ILIKE $${paramIdx} OR archive_no ILIKE $${paramIdx} OR vehicle_no ILIKE $${paramIdx})`);
      params.push(`%${keyword}%`);
      paramIdx++;
    }
    if (department) { conditions.push(`department = $${paramIdx++}`); params.push(department); }
    if (archiveYear) { conditions.push(`LEFT(assessment_date, 4) = $${paramIdx++}`); params.push(String(archiveYear)); }
    conditions.push('is_deleted = false');
    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countR = await pool.query(`SELECT COUNT(*)::int AS total FROM driver_assessment ${whereClause}`, params);
    const total = countR.rows[0].total;

    params.push(limitNum, offset);
    const result = await pool.query(
      `SELECT * FROM driver_assessment ${whereClause} ORDER BY id ASC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      params
    );
    const list = result.rows.map(formatDriverAssessmentRow);
    return { __t: 'json', payload: { list, total, page: pageNum, pageSize: limitNum }, message: '查询成功' };
  } catch (err) {
    console.error('[driverAssessmentList]', err.message);
    throw err;
  }
}

// ========== GET /driver-assessments/:id ==========
async function driverAssessmentDetail(id) {
  try {
    if (!isConnected()) {
      initMemoryData();
      const record = memoryStores.driverAssessments.find(r => r.id === parseInt(id) && !r.is_deleted);
      if (!record) return { __t: 'not-found', message: '记录不存在(内存模式)' };
      return { __t: 'json', payload: formatDriverAssessmentRow(record), message: '查询成功(内存模式)' };
    }
    const result = await pool.query('SELECT * FROM driver_assessment WHERE id = $1 AND is_deleted = false', [id]);
    if (result.rows.length === 0) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
    return { __t: 'json', payload: formatDriverAssessmentRow(result.rows[0]), message: '查询成功' };
  } catch (err) {
    console.error('[driverAssessmentDetail]', err.message);
    throw err;
  }
}

// ========== POST /driver-assessments ==========
async function driverAssessmentCreate(body, ctx) {
  try {
    const b = body;
    if (!isConnected()) {
      initMemoryData();
      const record = {
        id: memoryCounters.driverAssessments++,
        archiveNo: b.archiveNo || '',
        name: b.name || '',
        idCard: b.idCard || '',
        licenseType: b.licenseType || '',
        department: b.department || '',
        vehicleNo: b.vehicleNo || '',
        assessmentDate: b.assessmentDate || null,
        assessmentResult: b.assessmentResult || '',
        assessmentLevel: b.assessmentLevel || '',
        assessmentType: b.assessmentType || '驾驶证评估',
        controlMeasures: b.controlMeasures || '',
        status: b.status || '未完成',
        expiryDate: b.expiryDate || null,
        phone: b.phone || '',
        remark: b.remark || '',
        is_deleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      memoryStores.driverAssessments.push(record);
      return { __t: 'json', payload: record, message: '创建成功(内存模式)' };
    }

    const result = await pool.query(`
      INSERT INTO driver_assessment
        (archive_no, name, id_card, license_type, department, vehicle_no,
         assessment_date, assessment_result, assessment_level, assessment_type,
         control_measures, status, expiry_date, phone, remark)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *
    `, [
      b.archiveNo || b.archive_no || '',
      b.name || '',
      b.idCard || b.id_card || '',
      b.licenseType || b.license_type || '',
      b.department || '',
      b.vehicleNo || b.vehicle_no || '',
      b.assessmentDate || b.assessment_date || null,
      b.assessmentResult || b.assessment_result || '',
      b.assessmentLevel || b.assessment_level || '',
      b.assessmentType || b.assessment_type || '驾驶证评估',
      b.controlMeasures || b.control_measures || '',
      b.status || '未完成',
      b.expiryDate || b.expiry_date || null,
      b.phone || '',
      b.remark || '',
    ]);
    await auditLog({ userId: ctx && ctx.userId, username: ctx && ctx.username, action: 'create', module: 'site-mgmt', description: `创建交通安全评估档案: ${b.name}`, ip: ctx && ctx.ip }).catch(() => {});
    return { __t: 'json', payload: formatDriverAssessmentRow(result.rows[0]), message: '创建成功' };
  } catch (err) {
    console.error('[driverAssessmentCreate]', err.message);
    throw err;
  }
}

// ========== PUT /driver-assessments/:id ==========
async function driverAssessmentUpdate(id, body, ctx) {
  try {
    const b = body;
    if (!isConnected()) {
      initMemoryData();
      const idx = memoryStores.driverAssessments.findIndex(r => r.id === parseInt(id) && !r.is_deleted);
      if (idx === -1) return { __t: 'json', error: { code: -2, message: '记录不存在(内存模式)' } };
      Object.assign(memoryStores.driverAssessments[idx], b, { updatedAt: new Date().toISOString() });
      return { __t: 'json', payload: memoryStores.driverAssessments[idx], message: '更新成功(内存模式)' };
    }

    // 仅覆盖 body 显式携带的字段（空串/0 可清空），未携带的保留原值 —— 对齐原内存 Object.assign 语义
    const sets = [];
    const params = [];
    let i = 1;
    for (const [camel, col] of DRIVER_ASSESS_UPDATABLE) {
      if (!Object.prototype.hasOwnProperty.call(b, camel) && !Object.prototype.hasOwnProperty.call(b, col)) continue;
      const v = b[camel] ?? b[col] ?? '';
      sets.push(`${col}=$${i++}`);
      params.push(v);
    }
    if (sets.length === 0) {
      const cur = await pool.query('SELECT * FROM driver_assessment WHERE id = $1 AND is_deleted = false', [id]);
      if (cur.rows.length === 0) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
      return { __t: 'json', payload: formatDriverAssessmentRow(cur.rows[0]), message: '更新成功' };
    }
    sets.push('updated_at=CURRENT_TIMESTAMP');
    params.push(id);
    const result = await pool.query(
      `UPDATE driver_assessment SET ${sets.join(', ')} WHERE id=$${i++} AND is_deleted=false RETURNING *`,
      params
    );
    if (result.rows.length === 0) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
    await auditLog({ userId: ctx && ctx.userId, username: ctx && ctx.username, action: 'update', module: 'site-mgmt', description: `更新交通安全评估档案 ID=${id}`, ip: ctx && ctx.ip }).catch(() => {});
    return { __t: 'json', payload: formatDriverAssessmentRow(result.rows[0]), message: '更新成功' };
  } catch (err) {
    console.error('[driverAssessmentUpdate]', err.message);
    throw err;
  }
}

// ========== DELETE /driver-assessments/:id ==========
async function driverAssessmentDelete(id, ctx) {
  try {
    if (!isConnected()) {
      initMemoryData();
      const record = memoryStores.driverAssessments.find(r => r.id === parseInt(id) && !r.is_deleted);
      if (!record) return { __t: 'json', error: { code: -2, message: '记录不存在(内存模式)' } };
      record.is_deleted = true;
      return { __t: 'json', payload: null, message: '删除成功(内存模式)' };
    }
    const result = await pool.query(
      'UPDATE driver_assessment SET is_deleted=true, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND is_deleted=false RETURNING id',
      [id]
    );
    if (result.rows.length === 0) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
    await auditLog({ userId: ctx && ctx.userId, username: ctx && ctx.username, action: 'delete', module: 'site-mgmt', description: `删除交通安全评估档案 ID=${id}`, ip: ctx && ctx.ip }).catch(() => {});
    return { __t: 'json', payload: null, message: '删除成功' };
  } catch (err) {
    console.error('[driverAssessmentDelete]', err.message);
    throw err;
  }
}

// ========== POST /driver-assessments/renumber ==========
/**
 * 交通安全评估档案重新编号
 * 规则：按在册驾驶员姓名稳定排序分配序号（从 1 开始），同一驾驶员两个评估同号：
 *   驾驶证评估档案编号 = DA-{year}-{4位序号}；三违评估档案编号 = SW-{year}-{4位序号}
 * 覆盖现有全部未删除档案（含无编号的补齐）；内存模式直接同步重排。
 */
async function driverAssessmentRenumber(ctx) {
  try {
    const year = new Date().getFullYear();

    if (!isConnected()) {
      initMemoryData();
      // 内存模式：以现有档案姓名去重排序为基准，顺延补齐序号
      const rows = memoryStores.driverAssessments.filter((r) => !r.is_deleted);
      const names = [...new Set(rows.map((r) => (r.name || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh'));
      const seqByName = new Map(names.map((n, i) => [n, i + 1]));
      for (const r of rows) {
        const seq = seqByName.get((r.name || '').trim());
        if (!seq) continue;
        const prefix = r.assessmentType === '三违评估' ? 'SW' : 'DA';
        r.archiveNo = `${prefix}-${year}-${String(seq).padStart(4, '0')}`;
      }
      return { __t: 'json', payload: { total: rows.length }, message: '重新编号成功(内存模式)' };
    }

    // 1) 序号基准 = 已有档案的驾驶员姓名，去重后按姓名稳定排序（从 1 开始连续编号）
    //    不把未建档的在册驾驶员计入，避免起始序号被无档案人员占用。
    const namesRes = await pool.query(
      `SELECT DISTINCT name FROM driver_assessment WHERE is_deleted = false ORDER BY name`,
    );
    const names = namesRes.rows.map((x) => x.name).filter(Boolean);
    const seqByName = new Map(names.map((n, i) => [n, i + 1]));

    // 2) 全量未删除档案
    const assetsRes = await pool.query(
      `SELECT id, name, assessment_type, archive_no FROM driver_assessment WHERE is_deleted = false`,
    );
    const assets = assetsRes.rows;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const a of assets) {
        const seq = seqByName.get(a.name);
        if (!seq) continue; // 非在册驾驶员档案不重编号（保留原编号）
        const prefix = a.assessment_type === '三违评估' ? 'SW' : 'DA';
        const newNo = `${prefix}-${year}-${String(seq).padStart(4, '0')}`;
        if (a.archive_no === newNo) continue;
        await client.query(
          `UPDATE driver_assessment SET archive_no = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND is_deleted = false`,
          [newNo, a.id],
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    await auditLog({ userId: ctx && ctx.userId, username: ctx && ctx.username, action: 'renumber', module: 'site-mgmt', description: `交通安全评估档案按在册驾驶员重新编号（${year}年度，共 ${assets.length} 条）`, ip: ctx && ctx.ip }).catch(() => {});
    return { __t: 'json', payload: { total: assets.length, seqCount: names.length }, message: '重新编号成功' };
  } catch (err) {
    console.error('[driverAssessmentRenumber]', err.message);
    throw err;
  }
}

// ========== GET /driver-violations ==========
async function driverViolationList(query) {
  try {
    const { page = 1, pageSize = 20, keyword, handleStatus, violationType } = query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(pageSize) || 10), 200);
    const offset = (pageNum - 1) * limitNum;

    if (!isConnected()) {
      initMemoryData();
      let data = memoryStores.driverViolations.filter(r => !r.is_deleted).map(formatDriverViolationRow);
      if (keyword) {
        const kw = keyword.toLowerCase();
        data = data.filter(r =>
          (r.name && r.name.toLowerCase().includes(kw)) ||
          (r.plateNo && r.plateNo.toLowerCase().includes(kw))
        );
      }
      if (handleStatus) data = data.filter(r => r.handleStatus === handleStatus);
      if (violationType) data = data.filter(r => r.violationType === violationType);
      const { list, total } = paginateMemory(data, pageNum, limitNum);
      return { __t: 'list', list, total, page: pageNum, pageSize: limitNum, message: '查询成功(内存模式)' };
    }

    const conditions = [];
    const params = [];
    let paramIdx = 1;
    if (keyword) {
      conditions.push(`(name ILIKE $${paramIdx} OR plate_no ILIKE $${paramIdx})`);
      params.push(`%${keyword}%`);
      paramIdx++;
    }
    if (handleStatus) { conditions.push(`handle_status = $${paramIdx++}`); params.push(handleStatus); }
    if (violationType) { conditions.push(`violation_type = $${paramIdx++}`); params.push(violationType); }
    conditions.push('is_deleted = false');
    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countR = await pool.query(`SELECT COUNT(*)::int AS total FROM driver_violation ${whereClause}`, params);
    const total = countR.rows[0].total;

    params.push(limitNum, offset);
    const result = await pool.query(
      `SELECT * FROM driver_violation ${whereClause} ORDER BY id ASC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      params
    );
    const list = result.rows.map(formatDriverViolationRow);
    return { __t: 'json', payload: { list, total, page: pageNum, pageSize: limitNum }, message: '查询成功' };
  } catch (err) {
    console.error('[driverViolationList]', err.message);
    throw err;
  }
}

// ========== GET /driver-violations/:id ==========
async function driverViolationDetail(id) {
  try {
    if (!isConnected()) {
      initMemoryData();
      const record = memoryStores.driverViolations.find(r => r.id === parseInt(id) && !r.is_deleted);
      if (!record) return { __t: 'not-found', message: '记录不存在(内存模式)' };
      return { __t: 'json', payload: formatDriverViolationRow(record), message: '查询成功(内存模式)' };
    }
    const result = await pool.query('SELECT * FROM driver_violation WHERE id = $1 AND is_deleted = false', [id]);
    if (result.rows.length === 0) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
    return { __t: 'json', payload: formatDriverViolationRow(result.rows[0]), message: '查询成功' };
  } catch (err) {
    console.error('[driverViolationDetail]', err.message);
    throw err;
  }
}

// ========== POST /driver-violations ==========
async function driverViolationCreate(body, ctx) {
  try {
    const b = body;
    if (!isConnected()) {
      initMemoryData();
      const record = {
        id: memoryCounters.driverViolations++,
        seq: b.seq ?? null,
        name: b.name || '',
        plateNo: b.plateNo || '',
        violationTime: b.violationTime || null,
        violationLocation: b.violationLocation || '',
        violationType: b.violationType || '',
        violationDesc: b.violationDesc || '',
        demeritPoints: Number(b.demeritPoints) || 0,
        fineAmount: Number(b.fineAmount) || 0,
        handleStatus: b.handleStatus || '待处理',
        handleMethod: b.handleMethod || '',
        handleResult: b.handleResult || '',
        remark: b.remark || '',
        is_deleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      memoryStores.driverViolations.push(record);
      return { __t: 'json', payload: record, message: '创建成功(内存模式)' };
    }

    const result = await pool.query(`
      INSERT INTO driver_violation
        (seq, name, plate_no, violation_time, violation_location, violation_type,
         violation_desc, demerit_points, fine_amount, handle_status, handle_method,
         handle_result, remark)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *
    `, [
      b.seq == null || b.seq === '' ? null : Number(b.seq) || null,
      b.name || '',
      b.plateNo || b.plate_no || '',
      b.violationTime || b.violation_time || null,
      b.violationLocation || b.violation_location || '',
      b.violationType || b.violation_type || '',
      b.violationDesc || b.violation_desc || '',
      Number(b.demeritPoints ?? b.demerit_points) || 0,
      Number(b.fineAmount ?? b.fine_amount) || 0,
      b.handleStatus || b.handle_status || '待处理',
      b.handleMethod || b.handle_method || '',
      b.handleResult || b.handle_result || '',
      b.remark || '',
    ]);
    await auditLog({ userId: ctx && ctx.userId, username: ctx && ctx.username, action: 'create', module: 'site-mgmt', description: `创建驾驶员违章记录: ${b.name}`, ip: ctx && ctx.ip }).catch(() => {});
    return { __t: 'json', payload: formatDriverViolationRow(result.rows[0]), message: '创建成功' };
  } catch (err) {
    console.error('[driverViolationCreate]', err.message);
    throw err;
  }
}

// ========== PUT /driver-violations/:id ==========
async function driverViolationUpdate(id, body, ctx) {
  try {
    const b = body;
    if (!isConnected()) {
      initMemoryData();
      const idx = memoryStores.driverViolations.findIndex(r => r.id === parseInt(id) && !r.is_deleted);
      if (idx === -1) return { __t: 'json', error: { code: -2, message: '记录不存在(内存模式)' } };
      Object.assign(memoryStores.driverViolations[idx], b, { updatedAt: new Date().toISOString() });
      return { __t: 'json', payload: memoryStores.driverViolations[idx], message: '更新成功(内存模式)' };
    }

    const sets = [];
    const params = [];
    let i = 1;
    for (const [camel, col, type] of DRIVER_VIOLATION_UPDATABLE) {
      const hasCamel = Object.prototype.hasOwnProperty.call(b, camel);
      const hasSnake = Object.prototype.hasOwnProperty.call(b, col);
      if (!hasCamel && !hasSnake) continue;
      const raw = b[camel] ?? b[col];
      let v;
      if (type === 'num') v = Number(raw) || 0;
      else if (type === 'nullable-num') v = raw == null || raw === '' ? null : Number(raw) || null;
      else v = raw ?? '';
      sets.push(`${col}=$${i++}`);
      params.push(v);
    }
    if (sets.length === 0) {
      const cur = await pool.query('SELECT * FROM driver_violation WHERE id = $1 AND is_deleted = false', [id]);
      if (cur.rows.length === 0) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
      return { __t: 'json', payload: formatDriverViolationRow(cur.rows[0]), message: '更新成功' };
    }
    sets.push('updated_at=CURRENT_TIMESTAMP');
    params.push(id);
    const result = await pool.query(
      `UPDATE driver_violation SET ${sets.join(', ')} WHERE id=$${i++} AND is_deleted=false RETURNING *`,
      params
    );
    if (result.rows.length === 0) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
    await auditLog({ userId: ctx && ctx.userId, username: ctx && ctx.username, action: 'update', module: 'site-mgmt', description: `更新驾驶员违章记录 ID=${id}`, ip: ctx && ctx.ip }).catch(() => {});
    return { __t: 'json', payload: formatDriverViolationRow(result.rows[0]), message: '更新成功' };
  } catch (err) {
    console.error('[driverViolationUpdate]', err.message);
    throw err;
  }
}

// ========== DELETE /driver-violations/:id ==========
async function driverViolationDelete(id, ctx) {
  try {
    if (!isConnected()) {
      initMemoryData();
      const record = memoryStores.driverViolations.find(r => r.id === parseInt(id) && !r.is_deleted);
      if (!record) return { __t: 'json', error: { code: -2, message: '记录不存在(内存模式)' } };
      record.is_deleted = true;
      return { __t: 'json', payload: null, message: '删除成功(内存模式)' };
    }
    const result = await pool.query(
      'UPDATE driver_violation SET is_deleted=true, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND is_deleted=false RETURNING id',
      [id]
    );
    if (result.rows.length === 0) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
    await auditLog({ userId: ctx && ctx.userId, username: ctx && ctx.username, action: 'delete', module: 'site-mgmt', description: `删除驾驶员违章记录 ID=${id}`, ip: ctx && ctx.ip }).catch(() => {});
    return { __t: 'json', payload: null, message: '删除成功' };
  } catch (err) {
    console.error('[driverViolationDelete]', err.message);
    throw err;
  }
}

// =====================================================================
// 三违扣分记录（driver_three_violation 独立表）：镜像 driver-violations 实现，
// 字段结构完全一致，仅数据源隔离（驾驶驾驶证违章 vs 违反公司"三违"行为）。
// =====================================================================

// ========== GET /driver-three-violations ==========
async function driverThreeViolationList(query) {
  try {
    const { page = 1, pageSize = 20, keyword, handleStatus, violationType } = query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(pageSize) || 10), 200);
    const offset = (pageNum - 1) * limitNum;

    if (!isConnected()) {
      initMemoryData();
      let data = memoryStores.driverThreeViolations.filter(r => !r.is_deleted).map(formatDriverThreeViolationRow);
      if (keyword) {
        const kw = keyword.toLowerCase();
        data = data.filter(r =>
          (r.name && r.name.toLowerCase().includes(kw)) ||
          (r.plateNo && r.plateNo.toLowerCase().includes(kw))
        );
      }
      if (handleStatus) data = data.filter(r => r.handleStatus === handleStatus);
      if (violationType) data = data.filter(r => r.violationType === violationType);
      const { list, total } = paginateMemory(data, pageNum, limitNum);
      return { __t: 'list', list, total, page: pageNum, pageSize: limitNum, message: '查询成功(内存模式)' };
    }

    const conditions = [];
    const params = [];
    let paramIdx = 1;
    if (keyword) {
      conditions.push(`(name ILIKE $${paramIdx} OR plate_no ILIKE $${paramIdx})`);
      params.push(`%${keyword}%`);
      paramIdx++;
    }
    if (handleStatus) { conditions.push(`handle_status = $${paramIdx++}`); params.push(handleStatus); }
    if (violationType) { conditions.push(`violation_type = $${paramIdx++}`); params.push(violationType); }
    conditions.push('is_deleted = false');
    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countR = await pool.query(`SELECT COUNT(*)::int AS total FROM driver_three_violation ${whereClause}`, params);
    const total = countR.rows[0].total;

    params.push(limitNum, offset);
    const result = await pool.query(
      `SELECT * FROM driver_three_violation ${whereClause} ORDER BY id ASC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      params
    );
    const list = result.rows.map(formatDriverThreeViolationRow);
    return { __t: 'json', payload: { list, total, page: pageNum, pageSize: limitNum }, message: '查询成功' };
  } catch (err) {
    console.error('[driverThreeViolationList]', err.message);
    throw err;
  }
}

// ========== GET /driver-three-violations/:id ==========
async function driverThreeViolationDetail(id) {
  try {
    if (!isConnected()) {
      initMemoryData();
      const record = memoryStores.driverThreeViolations.find(r => r.id === parseInt(id) && !r.is_deleted);
      if (!record) return { __t: 'not-found', message: '记录不存在(内存模式)' };
      return { __t: 'json', payload: formatDriverThreeViolationRow(record), message: '查询成功(内存模式)' };
    }
    const result = await pool.query('SELECT * FROM driver_three_violation WHERE id = $1 AND is_deleted = false', [id]);
    if (result.rows.length === 0) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
    return { __t: 'json', payload: formatDriverThreeViolationRow(result.rows[0]), message: '查询成功' };
  } catch (err) {
    console.error('[driverThreeViolationDetail]', err.message);
    throw err;
  }
}

// ========== POST /driver-three-violations ==========
async function driverThreeViolationCreate(body, ctx) {
  try {
    const b = body;
    if (!isConnected()) {
      initMemoryData();
      const record = {
        id: memoryCounters.driverThreeViolations++,
        seq: b.seq ?? null,
        name: b.name || '',
        plateNo: b.plateNo || '',
        violationTime: b.violationTime || null,
        violationLocation: b.violationLocation || '',
        violationType: b.violationType || '',
        violationDesc: b.violationDesc || '',
        demeritPoints: Number(b.demeritPoints) || 0,
        fineAmount: Number(b.fineAmount) || 0,
        handleStatus: b.handleStatus || '待处理',
        handleMethod: b.handleMethod || '',
        handleResult: b.handleResult || '',
        remark: b.remark || '',
        is_deleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      memoryStores.driverThreeViolations.push(record);
      return { __t: 'json', payload: record, message: '创建成功(内存模式)' };
    }

    const result = await pool.query(`
      INSERT INTO driver_three_violation
        (seq, name, plate_no, violation_time, violation_location, violation_type,
         violation_desc, demerit_points, fine_amount, handle_status, handle_method,
         handle_result, remark)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *
    `, [
      b.seq == null || b.seq === '' ? null : Number(b.seq) || null,
      b.name || '',
      b.plateNo || b.plate_no || '',
      b.violationTime || b.violation_time || null,
      b.violationLocation || b.violation_location || '',
      b.violationType || b.violation_type || '',
      b.violationDesc || b.violation_desc || '',
      Number(b.demeritPoints ?? b.demerit_points) || 0,
      Number(b.fineAmount ?? b.fine_amount) || 0,
      b.handleStatus || b.handle_status || '待处理',
      b.handleMethod || b.handle_method || '',
      b.handleResult || b.handle_result || '',
      b.remark || '',
    ]);
    await auditLog({ userId: ctx && ctx.userId, username: ctx && ctx.username, action: 'create', module: 'site-mgmt', description: `创建三违扣分记录: ${b.name}`, ip: ctx && ctx.ip }).catch(() => {});
    return { __t: 'json', payload: formatDriverThreeViolationRow(result.rows[0]), message: '创建成功' };
  } catch (err) {
    console.error('[driverThreeViolationCreate]', err.message);
    throw err;
  }
}

// ========== PUT /driver-three-violations/:id ==========
async function driverThreeViolationUpdate(id, body, ctx) {
  try {
    const b = body;
    if (!isConnected()) {
      initMemoryData();
      const idx = memoryStores.driverThreeViolations.findIndex(r => r.id === parseInt(id) && !r.is_deleted);
      if (idx === -1) return { __t: 'json', error: { code: -2, message: '记录不存在(内存模式)' } };
      Object.assign(memoryStores.driverThreeViolations[idx], b, { updatedAt: new Date().toISOString() });
      return { __t: 'json', payload: memoryStores.driverThreeViolations[idx], message: '更新成功(内存模式)' };
    }

    const sets = [];
    const params = [];
    let i = 1;
    for (const [camel, col, type] of DRIVER_THREE_VIOLATION_UPDATABLE) {
      const hasCamel = Object.prototype.hasOwnProperty.call(b, camel);
      const hasSnake = Object.prototype.hasOwnProperty.call(b, col);
      if (!hasCamel && !hasSnake) continue;
      const raw = b[camel] ?? b[col];
      let v;
      if (type === 'num') v = Number(raw) || 0;
      else if (type === 'nullable-num') v = raw == null || raw === '' ? null : Number(raw) || null;
      else v = raw ?? '';
      sets.push(`${col}=$${i++}`);
      params.push(v);
    }
    if (sets.length === 0) {
      const cur = await pool.query('SELECT * FROM driver_three_violation WHERE id = $1 AND is_deleted = false', [id]);
      if (cur.rows.length === 0) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
      return { __t: 'json', payload: formatDriverThreeViolationRow(cur.rows[0]), message: '更新成功' };
    }
    sets.push('updated_at=CURRENT_TIMESTAMP');
    params.push(id);
    const result = await pool.query(
      `UPDATE driver_three_violation SET ${sets.join(', ')} WHERE id=$${i++} AND is_deleted=false RETURNING *`,
      params
    );
    if (result.rows.length === 0) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
    await auditLog({ userId: ctx && ctx.userId, username: ctx && ctx.username, action: 'update', module: 'site-mgmt', description: `更新三违扣分记录 ID=${id}`, ip: ctx && ctx.ip }).catch(() => {});
    return { __t: 'json', payload: formatDriverThreeViolationRow(result.rows[0]), message: '更新成功' };
  } catch (err) {
    console.error('[driverThreeViolationUpdate]', err.message);
    throw err;
  }
}

// ========== DELETE /driver-three-violations/:id ==========
async function driverThreeViolationDelete(id, ctx) {
  try {
    if (!isConnected()) {
      initMemoryData();
      const record = memoryStores.driverThreeViolations.find(r => r.id === parseInt(id) && !r.is_deleted);
      if (!record) return { __t: 'json', error: { code: -2, message: '记录不存在(内存模式)' } };
      record.is_deleted = true;
      return { __t: 'json', payload: null, message: '删除成功(内存模式)' };
    }
    const result = await pool.query(
      'UPDATE driver_three_violation SET is_deleted=true, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND is_deleted=false RETURNING id',
      [id]
    );
    if (result.rows.length === 0) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
    await auditLog({ userId: ctx && ctx.userId, username: ctx && ctx.username, action: 'delete', module: 'site-mgmt', description: `删除三违扣分记录 ID=${id}`, ip: ctx && ctx.ip }).catch(() => {});
    return { __t: 'json', payload: null, message: '删除成功' };
  } catch (err) {
    console.error('[driverThreeViolationDelete]', err.message);
    throw err;
  }
}

// ========== GET /driver-monthly ==========
async function driverMonthlyList(query) {
  try {
    const { page = 1, pageSize = 20, keyword, department, month, assessmentLevel } = query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(pageSize) || 10), 200);
    const offset = (pageNum - 1) * limitNum;

    if (!isConnected()) {
      initMemoryData();
      let data = memoryStores.driverMonthly.filter(r => !r.is_deleted).map(formatDriverMonthlyRow);
      if (keyword) {
        const kw = keyword.toLowerCase();
        data = data.filter(r =>
          (r.name && r.name.toLowerCase().includes(kw)) ||
          (r.assessor && r.assessor.toLowerCase().includes(kw))
        );
      }
      if (department) data = data.filter(r => r.department === department);
      if (month) data = data.filter(r => r.month === month);
      if (assessmentLevel) data = data.filter(r => r.assessmentLevel === assessmentLevel);
      const { list, total } = paginateMemory(data, pageNum, limitNum);
      return { __t: 'list', list, total, page: pageNum, pageSize: limitNum, message: '查询成功(内存模式)' };
    }

    const conditions = [];
    const params = [];
    let paramIdx = 1;
    if (keyword) {
      conditions.push(`(name ILIKE $${paramIdx} OR assessor ILIKE $${paramIdx})`);
      params.push(`%${keyword}%`);
      paramIdx++;
    }
    if (department) { conditions.push(`department = $${paramIdx++}`); params.push(department); }
    if (month) { conditions.push(`month = $${paramIdx++}`); params.push(month); }
    if (assessmentLevel) { conditions.push(`assessment_level = $${paramIdx++}`); params.push(assessmentLevel); }
    conditions.push('is_deleted = false');
    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countR = await pool.query(`SELECT COUNT(*)::int AS total FROM driver_monthly ${whereClause}`, params);
    const total = countR.rows[0].total;

    params.push(limitNum, offset);
    const result = await pool.query(
      `SELECT * FROM driver_monthly ${whereClause} ORDER BY id ASC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      params
    );
    const list = result.rows.map(formatDriverMonthlyRow);
    return { __t: 'json', payload: { list, total, page: pageNum, pageSize: limitNum }, message: '查询成功' };
  } catch (err) {
    console.error('[driverMonthlyList]', err.message);
    throw err;
  }
}

// ========== GET /driver-monthly/:id ==========
async function driverMonthlyDetail(id) {
  try {
    if (!isConnected()) {
      initMemoryData();
      const record = memoryStores.driverMonthly.find(r => r.id === parseInt(id) && !r.is_deleted);
      if (!record) return { __t: 'not-found', message: '记录不存在(内存模式)' };
      return { __t: 'json', payload: formatDriverMonthlyRow(record), message: '查询成功(内存模式)' };
    }
    const result = await pool.query('SELECT * FROM driver_monthly WHERE id = $1 AND is_deleted = false', [id]);
    if (result.rows.length === 0) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
    return { __t: 'json', payload: formatDriverMonthlyRow(result.rows[0]), message: '查询成功' };
  } catch (err) {
    console.error('[driverMonthlyDetail]', err.message);
    throw err;
  }
}

// ========== POST /driver-monthly ==========
async function driverMonthlyCreate(body, ctx) {
  try {
    const b = body;
    if (!isConnected()) {
      initMemoryData();
      const record = {
        id: memoryCounters.driverMonthly++,
        month: b.month || '',
        name: b.name || '',
        department: b.department || '',
        // 花名册人员 ID：用于「生成固定人员」后按人员更新姓名
        personnelId: b.personnelId ?? null,
        safetyScore: Number(b.safetyScore) || 0,
        disciplineScore: Number(b.disciplineScore) || 0,
        trainingScore: Number(b.trainingScore) || 0,
        totalScore: Number(b.totalScore) || 0,
        assessmentLevel: b.assessmentLevel || '',
        mainProblem: b.mainProblem || '',
        assessor: b.assessor || '',
        // 2026-09 新增考核列（数值计数）
        threeCheckManagement: Number(b.threeCheckManagement) || 0,
        lampDirty: Number(b.lampDirty) || 0,
        lampFailure: Number(b.lampFailure) || 0,
        safetyMonitor: Number(b.safetyMonitor) || 0,
        fireManagement: Number(b.fireManagement) || 0,
        remark: b.remark || '',
        is_deleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      memoryStores.driverMonthly.push(record);
      return { __t: 'json', payload: record, message: '创建成功(内存模式)' };
    }

    const result = await pool.query(`
      INSERT INTO driver_monthly
        (month, name, department, personnel_id,
         safety_score, discipline_score, training_score, total_score,
         assessment_level, main_problem, assessor,
         three_check_management, lamp_dirty, lamp_failure, safety_monitor, fire_management,
         remark)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *
    `, [
      b.month || '',
      b.name || '',
      b.department || '',
      b.personnelId == null || b.personnelId === '' ? null : Number(b.personnelId) || null,
      Number(b.safetyScore ?? b.safety_score) || 0,
      Number(b.disciplineScore ?? b.discipline_score) || 0,
      Number(b.trainingScore ?? b.training_score) || 0,
      Number(b.totalScore ?? b.total_score) || 0,
      b.assessmentLevel || b.assessment_level || '',
      b.mainProblem || b.main_problem || '',
      b.assessor || '',
      Number(b.threeCheckManagement ?? b.three_check_management) || 0,
      Number(b.lampDirty ?? b.lamp_dirty) || 0,
      Number(b.lampFailure ?? b.lamp_failure) || 0,
      Number(b.safetyMonitor ?? b.safety_monitor) || 0,
      Number(b.fireManagement ?? b.fire_management) || 0,
      b.remark || '',
    ]);
    await auditLog({ userId: ctx && ctx.userId, username: ctx && ctx.username, action: 'create', module: 'site-mgmt', description: `创建月度考核: ${b.name}`, ip: ctx && ctx.ip }).catch(() => {});
    return { __t: 'json', payload: formatDriverMonthlyRow(result.rows[0]), message: '创建成功' };
  } catch (err) {
    console.error('[driverMonthlyCreate]', err.message);
    throw err;
  }
}

// ========== PUT /driver-monthly/:id ==========
async function driverMonthlyUpdate(id, body, ctx) {
  try {
    const b = body;
    if (!isConnected()) {
      initMemoryData();
      const idx = memoryStores.driverMonthly.findIndex(r => r.id === parseInt(id) && !r.is_deleted);
      if (idx === -1) return { __t: 'json', error: { code: -2, message: '记录不存在(内存模式)' } };
      Object.assign(memoryStores.driverMonthly[idx], b, { updatedAt: new Date().toISOString() });
      return { __t: 'json', payload: memoryStores.driverMonthly[idx], message: '更新成功(内存模式)' };
    }

    const sets = [];
    const params = [];
    let i = 1;
    for (const [camel, col, type] of DRIVER_MONTHLY_UPDATABLE) {
      const hasCamel = Object.prototype.hasOwnProperty.call(b, camel);
      const hasSnake = Object.prototype.hasOwnProperty.call(b, col);
      if (!hasCamel && !hasSnake) continue;
      const raw = b[camel] ?? b[col];
      let v;
      if (type === 'num') v = Number(raw) || 0;
      else if (type === 'nullable-num') v = raw == null || raw === '' ? null : Number(raw) || null;
      else v = raw ?? '';
      sets.push(`${col}=$${i++}`);
      params.push(v);
    }
    if (sets.length === 0) {
      const cur = await pool.query('SELECT * FROM driver_monthly WHERE id = $1 AND is_deleted = false', [id]);
      if (cur.rows.length === 0) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
      return { __t: 'json', payload: formatDriverMonthlyRow(cur.rows[0]), message: '更新成功' };
    }
    sets.push('updated_at=CURRENT_TIMESTAMP');
    params.push(id);
    const result = await pool.query(
      `UPDATE driver_monthly SET ${sets.join(', ')} WHERE id=$${i++} AND is_deleted=false RETURNING *`,
      params
    );
    if (result.rows.length === 0) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
    await auditLog({ userId: ctx && ctx.userId, username: ctx && ctx.username, action: 'update', module: 'site-mgmt', description: `更新月度考核 ID=${id}`, ip: ctx && ctx.ip }).catch(() => {});
    return { __t: 'json', payload: formatDriverMonthlyRow(result.rows[0]), message: '更新成功' };
  } catch (err) {
    console.error('[driverMonthlyUpdate]', err.message);
    throw err;
  }
}

// ========== DELETE /driver-monthly/:id ==========
async function driverMonthlyDelete(id, ctx) {
  try {
    if (!isConnected()) {
      initMemoryData();
      const record = memoryStores.driverMonthly.find(r => r.id === parseInt(id) && !r.is_deleted);
      if (!record) return { __t: 'json', error: { code: -2, message: '记录不存在(内存模式)' } };
      record.is_deleted = true;
      return { __t: 'json', payload: null, message: '删除成功(内存模式)' };
    }
    const result = await pool.query(
      'UPDATE driver_monthly SET is_deleted=true, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND is_deleted=false RETURNING id',
      [id]
    );
    if (result.rows.length === 0) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
    await auditLog({ userId: ctx && ctx.userId, username: ctx && ctx.username, action: 'delete', module: 'site-mgmt', description: `删除月度考核 ID=${id}`, ip: ctx && ctx.ip }).catch(() => {});
    return { __t: 'json', payload: null, message: '删除成功' };
  } catch (err) {
    console.error('[driverMonthlyDelete]', err.message);
    throw err;
  }
}

// ============================================================
// 网格管理 CRUD（双模式：DB优先，内存降级）
// ============================================================

// 年/月筛选器默认值：阶段4 之前 grid_inspection_records 无数据时使用
function getDefaultYearMonth() {
  const y = new Date().getFullYear();
  return {
    defaultYears: [y - 2, y - 1, y],
    defaultMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  };
}

// 合并默认选项与真实聚合数据，去重并升序排序
function mergeYearOptions(base, real) {
  return Array.from(new Set([...base, ...real])).sort((a, b) => a - b);
}

// 当前月份字符串（YYYY-MM）
function currentMonthStr() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}

// ========== GET /grid-areas ==========
async function gridAreaList(query) {
  try {
    // year/month 由阶段4 完成率按年/月计算时使用，当前 grid_areas 无检查日期字段，先接收预留
    const { page = 1, pageSize = 20, keyword, gridLevel, township, status, year, month } = query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(pageSize) || 10), 200);
    const offset = (pageNum - 1) * limitNum;

    if (!isConnected()) {
      initMemoryData();
      let data = memoryStores.gridAreas.filter(r => !r.is_deleted).map(formatGridAreaRow);
      if (keyword) {
        const kw = keyword.toLowerCase();
        data = data.filter(r =>
          (r.name && r.name.toLowerCase().includes(kw)) ||
          (r.area && r.area.toLowerCase().includes(kw)) ||
          (r.gridCode && r.gridCode.toLowerCase().includes(kw))
        );
      }
      if (gridLevel) data = data.filter(r => r.gridLevel === gridLevel);
      if (township) data = data.filter(r => r.township === township);
      if (status) data = data.filter(r => r.status === status);
      const { list, total } = paginateMemory(data, pageNum, limitNum);
      return { __t: 'list', list, total, page: pageNum, pageSize: limitNum, message: '查询成功(内存模式)' };
    }

    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (keyword) {
      conditions.push(`(name ILIKE $${paramIdx} OR area ILIKE $${paramIdx} OR grid_code ILIKE $${paramIdx})`);
      params.push(`%${keyword}%`);
      paramIdx++;
    }
    if (gridLevel) { conditions.push(`grid_level = $${paramIdx++}`); params.push(gridLevel); }
    if (township) { conditions.push(`township = $${paramIdx++}`); params.push(township); }
    if (status) { conditions.push(`status = $${paramIdx++}`); params.push(status); }

    conditions.push('is_deleted = false');
    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countR = await pool.query(`SELECT COUNT(*)::int AS total FROM grid_areas ${whereClause}`, params);
    const total = countR.rows[0].total;

    params.push(limitNum, offset);
    const result = await pool.query(
      `SELECT * FROM grid_areas ${whereClause} ORDER BY id ASC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      params
    );

    // 网格长巡查管理：动态计算「完成率 / 月巡查次数 / 年巡查次数」（按台账姓名计数，月度周期、入职首日起算）
    const pageIds = result.rows.map((row) => row.id);
    const hireDateByGrid = await gridCompletionService.getHireDateMap(pageIds);
    const statMap = await gridCompletionService.getGridPatrolStats(result.rows, { year, month, hireDateByGrid });
    const list = result.rows.map((row) => {
      const base = formatGridAreaRow(row);
      const s = statMap.get(row.id) || { completionRate: 0, monthCount: 0, yearCount: 0 };
      return {
        ...base,
        completionRate: s.completionRate,
        monthPatrolCount: s.monthCount,
        yearPatrolCount: s.yearCount,
      };
    });

    return { __t: 'json', payload: { list, total, page: pageNum, pageSize: limitNum }, message: '查询成功' };
  } catch (err) {
    console.error('[gridAreaList]', err.message);
    throw err;
  }
}

// ========== GET /grid-areas/filter-options ==========
async function gridAreaFilterOptions() {
  try {
    if (!isConnected()) {
      initMemoryData();
      const areas = memoryStores.gridAreas.filter(r => !r.is_deleted);
      const gridLevels = [...new Set(areas.map(a => a.grid_level || a.gridLevel).filter(Boolean))];
      const townships = [...new Set(areas.map(a => a.township).filter(Boolean))];
      const statuses = [...new Set(areas.map(a => a.status).filter(Boolean))];
      // 内存模式暂无检查记录数据（阶段4 由 grid_inspection_records 提供年/月）
      const { defaultYears, defaultMonths } = getDefaultYearMonth();
      return { __t: 'json', payload: { gridLevels, townships, statuses, years: defaultYears, months: defaultMonths, monthOptions: [currentMonthStr()] }, message: '查询成功(内存模式)' };
    }

    const [lvR, twR, stR] = await Promise.all([
      pool.query(`SELECT DISTINCT grid_level FROM grid_areas WHERE is_deleted = false AND grid_level IS NOT NULL AND grid_level != '' ORDER BY grid_level`),
      pool.query(`SELECT DISTINCT township FROM grid_areas WHERE is_deleted = false AND township IS NOT NULL AND township != '' ORDER BY township`),
      pool.query(`SELECT DISTINCT status FROM grid_areas WHERE is_deleted = false AND status IS NOT NULL AND status != '' ORDER BY status`),
    ]);

    // 年/月选项从 grid_inspection_records 聚合（inspection_date 字段）；
    // 该表无数据时聚合为空，与默认值（近3年 + 1-12月）合并，不影响其余筛选选项
    let years = [];
    let months = [];
    let monthOptions = [];
    try {
      const [yR, mR, moR] = await Promise.all([
        pool.query(`SELECT DISTINCT EXTRACT(YEAR FROM inspection_date)::int AS y FROM grid_inspection_records WHERE inspection_date IS NOT NULL ORDER BY y`),
        pool.query(`SELECT DISTINCT EXTRACT(MONTH FROM inspection_date)::int AS m FROM grid_inspection_records WHERE inspection_date IS NOT NULL ORDER BY m`),
        pool.query(`SELECT DISTINCT to_char(inspection_date, 'YYYY-MM') AS ym FROM grid_inspection_records WHERE inspection_date IS NOT NULL ORDER BY ym DESC`),
      ]);
      years = yR.rows.map(r => r.y);
      months = mR.rows.map(r => r.m);
      monthOptions = moR.rows.map(r => r.ym);
    } catch (e) {
      years = [];
      months = [];
      monthOptions = [];
    }
    // 默认值 ∪ 真实聚合数据，去重排序（真实数据优先保留，默认值填充分阶段4前的空档）
    const { defaultYears, defaultMonths } = getDefaultYearMonth();
    years = mergeYearOptions(defaultYears, years);
    months = mergeYearOptions(defaultMonths, months);
    // 单月度下拉（YYYY-MM）：聚合数据最新在前，缺失时兜底当前月
    if (!monthOptions.some((m) => m === currentMonthStr())) monthOptions.push(currentMonthStr());
    monthOptions = monthOptions.sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));

    return { __t: 'json', payload: {
      gridLevels: lvR.rows.map(r => r.grid_level),
      townships: twR.rows.map(r => r.township),
      statuses: stR.rows.map(r => r.status),
      years,
      months,
      monthOptions,
    }, message: '查询成功' };
  } catch (err) {
    console.error('[gridAreaFilterOptions]', err.message);
    throw err;
  }
}

// ========== GET /grid-areas/:id ==========
async function gridAreaDetail(id) {
  try {
    if (!isConnected()) {
      initMemoryData();
      const record = memoryStores.gridAreas.find(r => r.id === parseInt(id) && !r.is_deleted);
      if (!record) return { __t: 'not-found', message: '记录不存在(内存模式)' };
      return { __t: 'json', payload: formatGridAreaRow(record), message: '查询成功(内存模式)' };
    }
    const result = await pool.query('SELECT * FROM grid_areas WHERE id = $1 AND is_deleted = false', [id]);
    if (result.rows.length === 0) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
    return { __t: 'json', payload: formatGridAreaRow(result.rows[0]), message: '查询成功' };
  } catch (err) {
    console.error('[gridAreaDetail]', err.message);
    throw err;
  }
}

// ========== POST /grid-areas ==========
async function gridAreaCreate(body, ctx) {
  try {
    const b = body;
    if (!isConnected()) {
      initMemoryData();
      const record = {
        id: memoryCounters.gridAreas++,
        gridCode: b.gridCode || '',
        gridLevel: b.gridLevel || '',
        name: b.name || '',
        personnelId: b.personnelId || null,
        position: b.position || '',
        area: b.area || '',
        township: b.township || '',
        patrolFrequency: b.patrolFrequency || '',
        phone: b.phone || '',
        completionRate: b.completionRate || 100,
        riskLevel: b.riskLevel || '一般风险',
        remarks: b.remarks || '',
        status: b.status || '在岗',
        is_deleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      memoryStores.gridAreas.push(record);
      return { __t: 'json', payload: record, message: '创建成功(内存模式)' };
    }

    const result = await pool.query(`
      INSERT INTO grid_areas (grid_code, grid_level, name, personnel_id, position, area, township, patrol_frequency, phone, completion_rate, risk_level, remarks, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *
    `, [
      b.gridCode || b.grid_code || '',
      b.gridLevel || b.grid_level || '',
      b.name || '',
      b.personnelId || b.personnel_id || null,
      b.position || '',
      b.area || '',
      b.township || '',
      b.patrolFrequency || b.patrol_frequency || '',
      b.phone || '',
      b.completionRate ?? b.completion_rate ?? 100,
      b.riskLevel || b.risk_level || '一般风险',
      b.remarks || b.remark || '',
      b.status || '在岗',
    ]);
    await auditLog({ userId: ctx && ctx.userId, username: ctx && ctx.username, action: 'create', module: 'site-mgmt', description: `创建网格: ${b.name}`, ip: ctx && ctx.ip }).catch(() => {});
    return { __t: 'json', payload: formatGridAreaRow(result.rows[0]), message: '创建成功' };
  } catch (err) {
    console.error('[gridAreaCreate]', err.message);
    throw err;
  }
}

// ========== PUT /grid-areas/:id ==========
async function gridAreaUpdate(id, body, ctx) {
  try {
    const b = body;
    if (!isConnected()) {
      initMemoryData();
      const idx = memoryStores.gridAreas.findIndex(r => r.id === parseInt(id) && !r.is_deleted);
      if (idx === -1) return { __t: 'json', error: { code: -2, message: '记录不存在(内存模式)' } };
      Object.assign(memoryStores.gridAreas[idx], body, { updatedAt: new Date().toISOString() });
      return { __t: 'json', payload: memoryStores.gridAreas[idx], message: '更新成功(内存模式)' };
    }

    const result = await pool.query(`
      UPDATE grid_areas SET
        grid_code=COALESCE($1,grid_code), grid_level=COALESCE($2,grid_level),
        name=COALESCE($3,name), personnel_id=COALESCE($4,personnel_id),
        position=COALESCE($5,position), area=COALESCE($6,area), township=COALESCE($7,township),
        patrol_frequency=COALESCE($8,patrol_frequency), phone=COALESCE($9,phone),
        completion_rate=COALESCE($10,completion_rate), risk_level=COALESCE($11,risk_level),
        remarks=COALESCE($12,remarks), status=COALESCE($13,status), updated_at=CURRENT_TIMESTAMP
      WHERE id=$14 AND is_deleted=false RETURNING *
    `, [
      b.gridCode || b.grid_code || null,
      b.gridLevel || b.grid_level || null,
      b.name || null,
      b.personnelId || b.personnel_id || null,
      b.position || null,
      b.area || null,
      b.township || null,
      b.patrolFrequency || b.patrol_frequency || null,
      b.phone || null,
      b.completionRate ?? b.completion_rate ?? null,
      b.riskLevel || b.risk_level || null,
      b.remarks || b.remark || null,
      b.status || null,
      id,
    ]);
    if (result.rows.length === 0) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
    await auditLog({ userId: ctx && ctx.userId, username: ctx && ctx.username, action: 'update', module: 'site-mgmt', description: `更新网格 ID=${id}`, ip: ctx && ctx.ip }).catch(() => {});
    return { __t: 'json', payload: formatGridAreaRow(result.rows[0]), message: '更新成功' };
  } catch (err) {
    console.error('[gridAreaUpdate]', err.message);
    throw err;
  }
}

// ========== DELETE /grid-areas/:id ==========
async function gridAreaDelete(id, ctx) {
  try {
    if (!isConnected()) {
      initMemoryData();
      const record = memoryStores.gridAreas.find(r => r.id === parseInt(id) && !r.is_deleted);
      if (!record) return { __t: 'json', error: { code: -2, message: '记录不存在(内存模式)' } };
      record.is_deleted = true;
      return { __t: 'json', payload: null, message: '删除成功(内存模式)' };
    }
    const result = await pool.query(
      'UPDATE grid_areas SET is_deleted=true, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND is_deleted=false RETURNING id',
      [id]
    );
    if (result.rows.length === 0) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
    await auditLog({ userId: ctx && ctx.userId, username: ctx && ctx.username, action: 'delete', module: 'site-mgmt', description: `删除网格 ID=${id}`, ip: ctx && ctx.ip }).catch(() => {});
    return { __t: 'json', payload: null, message: '删除成功' };
  } catch (err) {
    console.error('[gridAreaDelete]', err.message);
    throw err;
  }
}

// ============================================================
// 网格长巡查台账（grid_inspection_records）
// ============================================================

// ========== GET /grid-records ==========
// 台账：服务端分页（每页 pageSize，默认 20）。大数据量下前端仅渲染当前页，
// 避免一次性渲染全部记录（尤其每行含图片缩略图）导致卡顿。保留单元格编辑能力。
// 三违台账筛选：hasViolation=1（三违行为≠'无三违行为'）与 hasRectifiedPhoto=1（整改后照片有内容）可叠加，
// 供「三违管理 → 三违台账」子页使用（数据源仍为 grid_inspection_records）。
async function gridRecordList(query, ctx) {
  const user = ctx && ctx.user;
  const logger = (ctx && ctx.logger) || console;
  try {
    const { keyword, areaTeam, gridLevel, reportStatus, hasViolation, hasRectifiedPhoto, month } = query;
    const wantViolation = hasViolation && String(hasViolation) !== '0' && String(hasViolation).toLowerCase() !== 'false';
    const wantRectified = hasRectifiedPhoto && String(hasRectifiedPhoto) !== '0' && String(hasRectifiedPhoto).toLowerCase() !== 'false';
    const page = Math.max(1, parseInt(query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(query.pageSize) || 20));
    // 按巡查日期所属月（YYYY-MM）筛选台账明细
    const monthFilter = /^\d{4}-\d{2}$/.test(String(month || '')) ? String(month) : '';

    // Sprint-WPS-02/02-A: WPS 数据源分支；misconfigured → 配置错误描述符短路，禁止静默回 PG
    const dsList = gridDataSourceModeGuard();
    if (isConfigErrorDescriptor(dsList)) return dsList;
    if (dsList === 'wps') {
      const { list, total } = await gridWps.list({
        keyword, areaTeam, gridLevel, reportStatus, hasViolation: wantViolation, hasRectifiedPhoto: wantRectified,
        month: monthFilter, page, pageSize, sortField: query.sortField, sortOrder: query.sortOrder,
      });
      return { __t: 'json', payload: { list, total, page, pageSize }, message: '查询成功(WPS)' };
    }

    const offset = (page - 1) * pageSize;
    if (!isConnected()) {
      initMemoryData();
      let data = memoryStores.gridInspectionRecords.map(formatGridInspectionRow);
      if (keyword) {
        const kw = keyword.toLowerCase();
        data = data.filter(r =>
          (r.personnelName && r.personnelName.toLowerCase().includes(kw))
          || (r.areaTeam && r.areaTeam.toLowerCase().includes(kw))
          || (r.violatorName && r.violatorName.toLowerCase().includes(kw))
          || (r.violationBehavior && String(r.violationBehavior).toLowerCase().includes(kw))
        );
      }
      if (areaTeam) data = data.filter(r => r.areaTeam === areaTeam);
      if (gridLevel) data = data.filter(r => r.gridLevel === gridLevel);
      if (reportStatus) data = data.filter(r => r.reportStatus === reportStatus);
      if (monthFilter) data = data.filter(r => r.inspectionDate && String(r.inspectionDate).slice(0, 7) === monthFilter);
      if (wantViolation) {
        data = data.filter(r => r.violationBehavior && String(r.violationBehavior).trim() !== '' && !['无三违行为', '--', '-', '无'].includes(String(r.violationBehavior).trim()));
      }
      if (wantRectified) {
        data = data.filter(r => r.rectifiedPhoto && String(r.rectifiedPhoto).trim() !== '' && !['--', '-', '无'].includes(String(r.rectifiedPhoto).trim()));
      }
      const total = data.length;
      const list = data.slice(offset, offset + pageSize);
      return { __t: 'json', payload: { list, total, page, pageSize }, message: '查询成功(内存模式)' };
    }

    const conditions = [];
    const params = [];
    let paramIdx = 1;

    // 阶段3-B-2：行级数据范围（own_grid / all_grid）。范围只由认证用户角色 + 后端配置决定，
    // 客户端不得干预。WPS 数据源分支（上方已返回）不在本范围控制内（WPS_ROW_SCOPE_DEFERRED）。
    // own_grid 下 grid_id IS NULL 的历史记录不可见（fail-closed，不靠姓名/编号补偿）。
    const scope = await resolveGridScope({ role: user && user.role, userId: user && user.id }, { logger });
    const scopeCond = buildScopeSqlCondition(scope, paramIdx);
    if (scopeCond.condition) {
      conditions.push(scopeCond.condition);
      params.push(...scopeCond.params);
      paramIdx += scopeCond.params.length;
    }
    if (keyword) {
      conditions.push(`(personnel_name ILIKE $${paramIdx} OR area_team ILIKE $${paramIdx} OR violator_name ILIKE $${paramIdx} OR CAST(violation_behavior AS TEXT) ILIKE $${paramIdx})`);
      params.push(`%${keyword}%`);
      paramIdx++;
    }
    if (areaTeam) { conditions.push(`area_team = $${paramIdx++}`); params.push(areaTeam); }
    if (gridLevel) { conditions.push(`grid_level = $${paramIdx++}`); params.push(gridLevel); }
    if (reportStatus) { conditions.push(`report_status = $${paramIdx++}`); params.push(reportStatus); }
    if (monthFilter) { conditions.push(`to_char(inspection_date, 'YYYY-MM') = $${paramIdx++}`); params.push(monthFilter); }
    if (wantViolation) {
      // 真实三违：排除「无三违行为」及占位符（-- / - / 无），避免把无内容行混入三违台账
      conditions.push(`violation_behavior IS NOT NULL AND TRIM(violation_behavior) <> '' AND violation_behavior NOT IN ('无三违行为', '--', '-', '无')`);
    }
    if (wantRectified) {
      conditions.push(`rectified_photo IS NOT NULL AND TRIM(rectified_photo) <> '' AND rectified_photo NOT IN ('--', '-', '无')`);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // 服务端排序：仅允许白名单列，避免注入；默认按巡查日期最新在前
    const SORT_COLUMN_MAP = {
      inspectionDate: 'inspection_date',
      inspection_date: 'inspection_date',
      id: 'id',
      personnelName: 'personnel_name',
      areaTeam: 'area_team',
    };
    const reqSort = String(query.sortField || '');
    const reqOrder = String(query.sortOrder || '');
    const sortCol = SORT_COLUMN_MAP[reqSort] || 'inspection_date';
    const sortOrder = reqOrder === 'asc' ? 'ASC' : 'DESC';
    const orderClause =
      sortCol === 'inspection_date'
        ? `ORDER BY inspection_date ${sortOrder} NULLS LAST, id DESC`
        : `ORDER BY ${sortCol} ${sortOrder} NULLS LAST, id DESC`;

    const countR = await pool.query(`SELECT COUNT(*)::int AS total FROM grid_inspection_records ${whereClause}`, params);
    const total = countR.rows[0].total;

    params.push(pageSize, offset);
    const result = await pool.query(
      `SELECT * FROM grid_inspection_records ${whereClause} ${orderClause} LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      params
    );
    const list = result.rows.map(formatGridInspectionRow);
    return { __t: 'json', payload: { list, total, page, pageSize }, message: `查询成功，共 ${total} 条` };
  } catch (err) {
    console.error('[gridRecordList]', err.message);
    throw err;
  }
}

// ========== GET /grid-records/filter-options ==========
async function gridRecordFilterOptions() {
  try {
    const dsOptions = gridDataSourceModeGuard();
    if (isConfigErrorDescriptor(dsOptions)) return dsOptions;
    if (dsOptions === 'wps') {
      return { __t: 'json', payload: await gridWps.filterOptions(), message: '查询成功(WPS)' };
    }
    if (!isConnected()) {
      return { __t: 'json', payload: { areaTeams: [], gridLevels: [], reportStatuses: [], months: [] }, message: '查询成功(内存模式)' };
    }
    const [atR, glR, rsR, moR] = await Promise.all([
      pool.query('SELECT DISTINCT area_team FROM grid_inspection_records WHERE area_team IS NOT NULL AND area_team != \'\' ORDER BY area_team'),
      pool.query('SELECT DISTINCT grid_level FROM grid_inspection_records WHERE grid_level IS NOT NULL AND grid_level != \'\' ORDER BY grid_level'),
      pool.query('SELECT DISTINCT report_status FROM grid_inspection_records WHERE report_status IS NOT NULL AND report_status != \'\' ORDER BY report_status'),
      // 月份选项（YYYY-MM）：按巡查日期聚合，最新在前
      pool.query(`SELECT DISTINCT to_char(inspection_date, 'YYYY-MM') AS ym FROM grid_inspection_records WHERE inspection_date IS NOT NULL ORDER BY ym DESC`),
    ]);
    return { __t: 'json', payload: {
      areaTeams: atR.rows.map(r => r.area_team),
      gridLevels: glR.rows.map(r => r.grid_level),
      reportStatuses: rsR.rows.map(r => r.report_status),
      months: moR.rows.map(r => r.ym),
    }, message: '查询成功' };
  } catch (err) {
    console.error('[gridRecordFilterOptions]', err.message);
    throw err;
  }
}

// ========== PUT /grid-records/:id ==========
// 台账单元格编辑保存：仅白名单字段可更新
async function gridRecordUpdate(id, body, ctx) {
  const user = ctx && ctx.user;
  const logger = (ctx && ctx.logger) || console;
  try {
    const dsPut = gridDataSourceModeGuard();
    if (isConfigErrorDescriptor(dsPut)) return dsPut;
    if (dsPut === 'wps') {
      const rec = await gridWps.update(id, body || {});
      if (!rec) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
      return { __t: 'json', payload: rec, message: '更新成功(WPS)' };
    }
    const idNum = parseInt(id, 10);
    if (!idNum) return { __t: 'json', error: { code: -2, message: '参数错误' } };
    const b = body || {};
    const sets = [];
    const params = [];
    let paramIdx = 1;
    for (const field of GRID_RECORD_EDITABLE) {
      if (b[field] !== undefined) {
        sets.push(`${field} = $${paramIdx++}`);
        params.push(b[field] === '' ? null : b[field]);
      }
    }
    if (!sets.length) return { __t: 'json', error: { code: -2, message: '无可更新字段' } };

    if (!isConnected()) {
      initMemoryData();
      const rec = memoryStores.gridInspectionRecords.find(r => r.id === idNum);
      if (!rec) return { __t: 'json', error: { code: -2, message: '记录不存在(内存模式)' } };
      const attrs = ['area_team','inspection_date','personnel_name','grid_level','position','violator_name','violator_gender','violator_age','report_status','violation_behavior','need_rectification','rectifier','rectified_photo','nickname','signup_today','marker','is_resubmit','serial_no'];
      for (const a of attrs) { if (b[a] !== undefined) rec[a] = b[a] === '' ? null : b[a]; }
      return { __t: 'json', payload: formatGridInspectionRow(rec), message: '更新成功(内存模式)' };
    }

    // 阶段3-B-2：行级数据范围（own_grid / all_grid），UPDATE 必须与 GET 使用同一 scope 逻辑，
    // 禁止仅靠「id 存在」放行。范围受限角色访问他人记录 → 0 行 → 403（fail-closed）。
    const scope = await resolveGridScope({ role: user && user.role, userId: user && user.id }, { logger });
    const scopeCond = buildScopeSqlCondition(scope, paramIdx);
    let scopeClause = '';
    if (scopeCond.condition) {
      scopeClause = ` AND ${scopeCond.condition}`;
      params.push(...scopeCond.params);
      paramIdx += scopeCond.params.length;
    }

    params.push(idNum);
    const result = await pool.query(
      `UPDATE grid_inspection_records SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIdx}${scopeClause} RETURNING *`,
      params
    );
    if (result.rows.length === 0) {
      // 范围受限角色：0 行可能因「记录不存在」或「存在但不属于本人」——按 scope 区分返回，避免越权。
      if (scope.scopeType !== SCOPE.ALL) {
        return { __t: 'json', httpStatus: 403, error: { code: 403, message: '无权限修改该记录或记录不存在', data: { code: 'SCOPE_DENIED' } } };
      }
      return { __t: 'json', error: { code: -2, message: '记录不存在' } };
    }
    await auditLog({ userId: ctx && ctx.userId, username: ctx && ctx.username, action: 'update', module: 'site-mgmt', description: `更新网格长巡查台账 ID=${idNum}，字段=${sets.map(s => s.split(' ')[0]).join(',')}`, ip: ctx && ctx.ip }).catch(() => {});
    // WPS-PG-SYNC-01：PG→WPS 反向写入已封禁，正式业务写入只落 PG（不再触发 WPS 推送）。
    return { __t: 'json', payload: formatGridInspectionRow(result.rows[0]), message: '更新成功' };
  } catch (err) {
    console.error('[gridRecordUpdate]', err.message);
    throw err;
  }
}

// ========== POST /grid-records ==========
// 新建台账记录（工具条「新增」）：仅白名单字段入库，自动字段由 DB 维护
async function gridRecordCreate(body, ctx) {
  const user = ctx && ctx.user;
  const logger = (ctx && ctx.logger) || console;
  try {
    const dsCreate = gridDataSourceModeGuard();
    if (isConfigErrorDescriptor(dsCreate)) return dsCreate;
    if (dsCreate === 'wps') {
      // 巡查人员身份由后端从当前登录用户解析；前端提交的 inspector 身份不可覆盖（fail-closed）
      const rec = await gridWps.create({ user, data: body || {}, logger });
      // WPS 为业务台账主数据源：不再写 PostgreSQL，也无下行推送（避免双写）
      return { __t: 'json', payload: rec, message: '新增成功(WPS)' };
    }
    const b = body || {};
    // 防覆盖（阶段2）：inspector_employee_id 是后端派生身份字段，
    // 客户端无论以 camelCase 还是 snake_case 提交，一律剥离，绝不作可信来源。
    delete b.inspectorEmployeeId;
    delete b.inspector_employee_id;
    // 阶段3-B-2：grid_id 同样不可由前端决定（fail-closed）。客户端提交的 gridId/grid_id
    // 一律剥离，正式 grid_id 由后端按 employee_id 反查 grid_areas.personnel_id 派生。
    delete b.gridId;
    delete b.grid_id;
    // GRID-03-B：personnel_name 与 inspector_employee_id 同源（均为服务端派生的身份字段）。
    // 客户端提交的 personnelName / personnel_name（无论合理或伪造）一律剥离，绝不作可信来源；
    // 正式值由下方 resolveAuthenticatedEmployee() 的 identity.employeeName 派生。
    delete b.personnelName;
    delete b.personnel_name;

    // 阶段2：PG 创建链身份接入 —— 唯一身份来源 = authenticatedEmployeeResolver。
    // Fail-Closed：解析失败（未绑定 / 员工不存在 / 已删除 / 服务异常）一律拒绝创建，
    // 禁止降级为 NULL 继续 INSERT，禁止回退姓名兜底（currentEmployeeContext / resolveEmployeeByName）。
    const identity = await resolveAuthenticatedEmployee(user && user.id, { logger });
    if (!identity.ok) {
      return { __t: 'json', httpStatus: identity.httpStatus, error: { code: identity.httpStatus, message: identity.message, data: { code: identity.code } } };
    }

    const cols = [];
    const vals = [];
    const params = [];
    let paramIdx = 1;
    for (const [camel, snake] of Object.entries(GRID_RECORD_CREATE_CAMELS)) {
      if (b[camel] !== undefined) {
        cols.push(snake);
        paramIdx++;
        params.push(b[camel] === '' ? null : b[camel]);
      }
    }
    if (!cols.length) return { __t: 'json', error: { code: -2, message: '无可新增字段' } };

    // 后端派生身份：DB.inspector_employee_id 恒等于 resolver.employeeId
    cols.push('inspector_employee_id');
    params.push(identity.employeeId);

    // GRID-03-B：personnel_name 同样由服务端派生（与 inspector_employee_id 同一身份来源），
    // 客户端提交值已在上方剥离。只影响新建记录，不回溯 UPDATE 任何历史数据。
    cols.push('personnel_name');
    params.push(identity.employeeName);

    // 阶段3-B-2：grid_id 由后端按 employee_id 反查 grid_areas.personnel_id 派生（fail-closed）
    //   0 个 live grid → 403 拒绝创建；1 个 → 使用；>1 个 → 409 拒绝（禁止猜测）。
    //   仅连接态可执行；内存降级模式无法反查网格，不设置 grid_id（属 DB 不可用兜底）。
    if (isConnected()) {
      const gridDerive = await deriveGridIdForEmployee(identity.employeeId, { logger });
      if (gridDerive.status === 'no_grid') {
        return { __t: 'json', httpStatus: 403, error: { code: 403, message: '当前账号未关联任何有效网格，无法创建巡查记录', data: { code: 'NO_GRID_FOR_EMPLOYEE' } } };
      }
      if (gridDerive.status === 'multiple') {
        return { __t: 'json', httpStatus: 409, error: { code: 409, message: '当前账号关联多个网格，存在数据冲突，禁止自动选择，请联系管理员处理', data: { code: 'MULTIPLE_GRIDS_FOR_EMPLOYEE' } } };
      }
      cols.push('grid_id');
      params.push(gridDerive.gridId);
    }

    if (!isConnected()) {
      initMemoryData();
      const newRec = { id: memoryCounters.gridInspectionRecords++, ...params.reduce((acc, v, i) => { acc[cols[i]] = v; return acc; }, {}), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      memoryStores.gridInspectionRecords.unshift(newRec);
      return { __t: 'json', payload: formatGridInspectionRow(newRec), message: '新增成功(内存模式)' };
    }

    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
    const result = await pool.query(
      `INSERT INTO grid_inspection_records (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      params
    );
    await auditLog({ userId: ctx && ctx.userId, username: ctx && ctx.username, action: 'create', module: 'site-mgmt', description: `新增网格长巡查台账记录 id=${result.rows[0].id}`, ip: ctx && ctx.ip }).catch(() => {});
    // WPS-PG-SYNC-01：PG→WPS 反向写入已封禁，正式业务写入只落 PG（不再触发 WPS 推送）。
    return { __t: 'json', payload: formatGridInspectionRow(result.rows[0]), message: '新增成功' };
  } catch (err) {
    console.error('[gridRecordCreate]', err.message);
    throw err;
  }
}

// ========== DELETE /grid-records ==========
// 工具条「批量删除」：body.ids 为 id 数组（无需 body 时保留首段单条兼容）
async function gridRecordDelete(body, query, params, ctx) {
  const user = ctx && ctx.user;
  const logger = (ctx && ctx.logger) || console;
  try {
    const dsDel = gridDataSourceModeGuard();
    if (isConfigErrorDescriptor(dsDel)) return dsDel;
    if (dsDel === 'wps') {
      let ids = Array.isArray(body && body.ids) ? body.ids : (query && query.ids ? String(query.ids).split(',') : []);
      if (params && params.id) ids = [params.id];
      const list = (ids || []).filter((v) => v != null && String(v) !== '');
      if (!list.length) return { __t: 'json', error: { code: -2, message: '请选择要删除的记录' } };
      const deleted = await gridWps.remove(list);
      return { __t: 'json', payload: { deleted }, message: `删除成功(WPS) ${deleted} 条` };
    }
    let ids = Array.isArray(body && body.ids) ? body.ids : (query && query.ids ? String(query.ids).split(',').map(Number) : []);
    if (params && params.id) ids = [parseInt(params.id, 10)];
    const intIds = (ids || []).filter((v) => Number.isInteger(v) && v > 0);
    if (!intIds.length) return { __t: 'json', error: { code: -2, message: '请选择要删除的记录' } };

    if (!isConnected()) {
      initMemoryData();
      const before = memoryStores.gridInspectionRecords.length;
      memoryStores.gridInspectionRecords = memoryStores.gridInspectionRecords.filter((r) => !intIds.includes(r.id));
      const deleted = before - memoryStores.gridInspectionRecords.length;
      return { __t: 'json', payload: { deleted }, message: `删除成功(内存模式) ${deleted} 条` };
    }

    const placeholders = intIds.map((_, i) => `$${i + 1}`).join(', ');
    // 阶段3-B-2：行级数据范围（own_grid / all_grid），DELETE 必须与 GET/PUT 使用同一 scope 逻辑。
    // 范围条件直接进 WHERE，禁止「先 DELETE WHERE id IN (...) 再判断」的越权风险。
    const scope = await resolveGridScope({ role: user && user.role, userId: user && user.id }, { logger });
    const scopeCond = buildScopeSqlCondition(scope, intIds.length + 1);
    let scopeClause = '';
    const scopeParams = [];
    if (scopeCond.condition) {
      scopeClause = ` AND ${scopeCond.condition}`;
      scopeParams.push(...scopeCond.params);
    }
    const result = await pool.query(
      `DELETE FROM grid_inspection_records WHERE id IN (${placeholders})${scopeClause}`,
      [...intIds, ...scopeParams]
    );
    const deleted = result.rowCount || 0;
    await auditLog({ userId: ctx && ctx.userId, username: ctx && ctx.username, action: 'delete', module: 'site-mgmt', description: `删除网格长巡查台账 ${deleted} 条`, ip: ctx && ctx.ip }).catch(() => {});
    // WPS-PG-SYNC-01：PG→WPS 反向写入已封禁，删除只落 PG（不再触发 WPS 删除）。
    return { __t: 'json', payload: { deleted }, message: `删除成功 ${deleted} 条` };
  } catch (err) {
    console.error('[gridRecordDelete]', err.message);
    throw err;
  }
}

// 工具条「表格清空」：清空台账全部记录并重置各网格完成率为 0（高危，不可恢复）
// 阶段3-B-1 三层保护（均在实际删除逻辑之前，PG / WPS 双分支同等生效）：
//   ① requirePermission('hse:site:grid:purge') —— 功能权限，与 grid:delete 严格区分
//   ② requireRole('system_admin', 'admin')     —— 高权限角色，不因持有其他权限而放行
//   ③ body.confirmText === '清空全部台账'        —— 后端显式二次确认，不依赖前端
async function gridRecordPurge(body, ctx) {
  const user = ctx && ctx.user;
  try {
    // 第三层：后端显式二次确认（早于数据源判定与任何删除动作）
    if (!body || body.confirmText !== GRID_PURGE_CONFIRM_TEXT) {
      return { __t: 'json', httpStatus: 400, error: { code: 400, message: `二次确认失败：需提交 confirmText="${GRID_PURGE_CONFIRM_TEXT}" 才会执行清空`, data: { code: 'PURGE_CONFIRM_REQUIRED' } } };
    }
    const dsClear = gridDataSourceModeGuard();
    if (isConfigErrorDescriptor(dsClear)) return dsClear;
    // 审计元数据（只含非敏感字段：不含密码/token/phone）
    const purgeMeta = {
      userId: user && user.id != null ? user.id : null,
      username: user && user.username != null ? user.username : null,
      role: user && user.role != null ? user.role : null,
      action: 'purge_all',
      module: 'site-mgmt',
      dataSource: dsClear,
    };
    if (dsClear === 'wps') {
      const deleted = await gridWps.clearAll();
      await auditLog({ ...purgeMeta, description: `清空网格长巡查台账[WPS] 删除前 ${deleted} 条，结果=success`, ip: ctx && ctx.ip }).catch(() => {});
      return { __t: 'json', payload: { deleted }, message: `已清空全部台账（WPS） ${deleted} 条` };
    }
    if (!isConnected()) {
      initMemoryData();
      const deleted = memoryStores.gridInspectionRecords.length;
      memoryStores.gridInspectionRecords = [];
      memoryStores.gridAreas.forEach((g) => { g.completionRate = 0; });
      await auditLog({ ...purgeMeta, description: `清空网格长巡查台账[memory] 删除前 ${deleted} 条，结果=success`, ip: ctx && ctx.ip }).catch(() => {});
      return { __t: 'json', payload: { deleted }, message: `已清空全部台账（内存模式） ${deleted} 条` };
    }
    const beforeR = await pool.query('SELECT COUNT(*)::int AS n FROM grid_inspection_records');
    const beforeCount = beforeR.rows[0]?.n ?? 0;
    const result = await pool.query('DELETE FROM grid_inspection_records');
    const deleted = result.rowCount || 0;
    await pool.query('UPDATE grid_areas SET completion_rate = 0');
    await auditLog({ ...purgeMeta, description: `清空网格长巡查台账[PG] 删除前 ${beforeCount} 条，实际删除 ${deleted} 条，结果=success`, ip: ctx && ctx.ip }).catch(() => {});
    return { __t: 'json', payload: { deleted }, message: `已清空全部台账 ${deleted} 条` };
  } catch (err) {
    await auditLog({ userId: user && user.id != null ? user.id : null, username: user && user.username != null ? user.username : null, role: user && user.role != null ? user.role : null, action: 'purge_all', module: 'site-mgmt', description: `清空网格长巡查台账 结果=failed：${err.message}`, ip: ctx && ctx.ip }).catch(() => {});
    throw err;
  }
}

// ============================================================
// 统计接口
// ============================================================
async function siteStats(query) {
  try {
    // 年/月筛选（来自前端筛选器，透传给完成率计算）：缺失时由服务回落到当前系统月
    const { year, month } = query;
    initMemoryData();
    const violations = memoryStores.violations.filter(r => !r.is_deleted);
    const fireEquipments = memoryStores.fireEquipment.filter(r => !r.is_deleted);
    const gridAreas = memoryStores.gridAreas.filter(r => !r.is_deleted);

    let dbGridCount = gridAreas.length;
    let dbGridOnDuty = gridAreas.filter(g => g.status === '在岗').length;
    if (isConnected()) {
      try {
        const [totalR, onDutyR] = await Promise.all([
          pool.query('SELECT COUNT(*)::int AS total FROM grid_areas WHERE is_deleted = false'),
          pool.query("SELECT COUNT(*)::int AS count FROM grid_areas WHERE is_deleted = false AND status = '在岗'"),
        ]);
        dbGridCount = parseInt(totalR.rows[0].total);
        dbGridOnDuty = parseInt(onDutyR.rows[0].count);
      } catch (e) { /* use memory */ }
    }

    const pendingRect = violations.filter(v => v.status === '待整改' || v.status === '整改中').length;
    const rectified = violations.filter(v => v.status === '已整改' || v.status === '已复查').length;
    const normalFire = fireEquipments.filter(f => f.status === '正常').length;
    const abnormalFire = fireEquipments.filter(f => f.status !== '正常').length;

    const violationByType = {};
    violations.forEach(v => { violationByType[v.type] = (violationByType[v.type] || 0) + 1; });

    const fireByType = {};
    fireEquipments.forEach(f => { fireByType[f.type] = (fireByType[f.type] || 0) + 1; });

    // 任务四：平均完成率动态计算（按 year/month 筛选；DB 不可用时退回内存存储的静态值）
    let avgCompletionRate = gridAreas.length > 0
      ? Math.round(gridAreas.reduce((sum, g) => sum + (g.completionRate || 0), 0) / gridAreas.length)
      : 0;
    if (isConnected()) {
      try {
        const grids = await pool.query('SELECT id, name, patrol_frequency FROM grid_areas WHERE is_deleted = false');
        const hireDateByGrid = await gridCompletionService.getHireDateMap(grids.rows.map((g) => g.id));
        const statMap = await gridCompletionService.getGridPatrolStats(grids.rows, { year, month, hireDateByGrid });
        const rates = Array.from(statMap.values())
          .map((s) => s.completionRate)
          .filter((r) => Number.isFinite(r));
        avgCompletionRate = rates.length > 0 ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : 0;
      } catch (e) { /* 保持内存兜底值 */ }
    }

    return { __t: 'json', payload: {
      // 三违统计
      totalViolations: violations.length,
      pendingViolations: pendingRect,
      rectifiedViolations: rectified,
      seriousViolations: violations.filter(v => v.level === '严重').length,
      violationByType,
      // 消防设施统计
      totalFireEquipment: fireEquipments.length,
      normalFireEquipment: normalFire,
      abnormalFireEquipment: abnormalFire,
      expiredFireEquipment: fireEquipments.filter(f => f.status === '过期').length,
      fireByType,
      // 网格统计
      totalGridAreas: dbGridCount,
      onDutyGridPersonnel: dbGridOnDuty,
      avgCompletionRate,
    }, message: '统计成功' };
  } catch (err) {
    console.error('[siteStats]', err.message);
    throw err;
  }
}

module.exports = {
  // 三违
  violationList,
  violationDetail,
  violationCreate,
  violationUpdate,
  violationDelete,
  // 消防设施
  fireEquipmentList,
  fireEquipmentDetail,
  fireEquipmentCreate,
  fireEquipmentUpdate,
  fireEquipmentDelete,
  // 驾驶员评估 / 违章 / 三违扣分 / 月度考核
  driverAssessmentList,
  driverAssessmentDetail,
  driverAssessmentCreate,
  driverAssessmentUpdate,
  driverAssessmentDelete,
  driverAssessmentRenumber,
  driverViolationList,
  driverViolationDetail,
  driverViolationCreate,
  driverViolationUpdate,
  driverViolationDelete,
  driverThreeViolationList,
  driverThreeViolationDetail,
  driverThreeViolationCreate,
  driverThreeViolationUpdate,
  driverThreeViolationDelete,
  driverMonthlyList,
  driverMonthlyDetail,
  driverMonthlyCreate,
  driverMonthlyUpdate,
  driverMonthlyDelete,
  // 网格
  gridAreaList,
  gridAreaFilterOptions,
  gridAreaDetail,
  gridAreaCreate,
  gridAreaUpdate,
  gridAreaDelete,
  // 网格长巡查台账
  gridRecordList,
  gridRecordFilterOptions,
  gridRecordUpdate,
  gridRecordCreate,
  gridRecordDelete,
  gridRecordPurge,
  // 统计
  siteStats,
  // 内存单例（仍被 services/importMemoryService.js 直接读写，须保持导出）
  memoryStores,
  memoryCounters,
  initMemoryData,
  // 常量（供 controller/测试引用）
  GRID_PURGE_CONFIRM_TEXT,
};
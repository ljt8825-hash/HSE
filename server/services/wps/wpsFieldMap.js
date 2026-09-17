/**
 * WPS 网格长巡查业务 · 统一字段映射（Sprint-WPS-01 / Sprint-WPS-02-B）
 *
 * 目标：把「业务字段」「PostgreSQL 列」「WPS 多维表字段」之间的对应关系集中到唯一真源，
 * 避免字段名散落在业务代码里（尤其避免后续新 H5 / GPS / 违章人员 ID 上线后
 * 在多个文件里各写一份）。
 *
 * 原则（Sprint 硬约束）：
 *   - PostgreSQL 是人员主数据源；WPS 保存的是巡查发生时的业务快照。
 *   - 人员关联键为 employeeId（巡查人员 ID / 违章人员 ID）。
 *   - 昵称 ≠ 身份标识：仅作历史遗留展示字段，禁止用于业务判断 / 人员关联 / 权限判断。
 *   - 不进 WPS Client / Adapter 结构；本映射为业务层字段语义的唯一出口。
 *
 * 说明：
 *   - wps:   WPS 多维表当前字段名（实测 2026-09/.dbt 板；Sprint-WPS-02-B 补建列后须与真实 Schema 复核）。
 *   - biz:   系统内部业务字段名（camelCase，对齐 PC 台账 DTO）。
 *   - pg:    对应 PostgreSQL 列名（snake_case；'-' 表示无 PG 列，仅供 WPS 侧）。
 *   - type:  期望语义类型 text / date / picture / link / number / reserved。
 *   - mode:  read | write | readwrite（reserved 暂只读预留，不参与现有同步写入）。
 *   - reserved: 预留字段，当前板上尚无对应列，待后续 Sprint 建列后再写入。
 *
 * 读写强度约定（Sprint-WPS-02-B 第七步）：
 *   - readwrite：当前 PC 台账真正需要写入 WPS 的业务字段。
 *   - read / readonly：WPS 只读或自动产生的字段。
 *   - reserved：暂时没有真正业务能力的未来字段（violatorEmployeeId / GPS / 经纬度等），
 *                不因本次补字段而全部改成 readwrite。
 */
const FIELD_MAP = [
  // ---- 系统 ----
  { wps: '编号',           biz: 'record_no',       pg: 'serial_no',  type: 'text', mode: 'readwrite', note: '业务编号（如 L2572）。真机 Schema 证实为 MultiLineText（非自动编号）；历史编号保持原值，禁止转换' },
  { biz: 'inspectionId',   wps: '巡查编号',          pg: '-',          type: 'text', mode: 'read',     note: '系统巡查编号（预留，后续建列）' },
  { biz: 'inspectorEmployeeId', wps: '巡查人员ID',   pg: '-',          type: 'text', mode: 'readwrite', note: '巡查人员 employeeId（人员关联键）。本 Sprint 起可写，但只允许由后端身份上下文(currentEmployeeContext.employeeId)写入，前端不可覆盖' },

  // CF-WPS-06：移动端业务身份键（花名册员工编码）。
  //   ⚠️ 语义严格区分：employee_code（VARCHAR，业务快照）≠ employee.id（BIGINT，PG 代理键）
  //      ≠ inspector_employee_id（= employee.id）。本字段**永不**直接写入 inspector_employee_id，
  //      必须经 services/gridEmployeeCodeResolver.js 解析为 employee.id 后再归属。
  //   mode=readonly：WPS 是「员工编码」的产生方（移动端提交），PG 侧只读不反向写。
  { wps: '员工编码',        biz: 'employee_code',    pg: 'employee_code', type: 'text', mode: 'readonly', note: '花名册员工编码（移动端业务身份键，业务快照）。非身份列；归因须经 gridEmployeeCodeResolver → employee.id；不参与 sync_hash' },

  // ---- 巡查人员（快照，不改写主数据） ----
  { wps: '姓名',          biz: 'inspector_name',  pg: 'personnel_name', type: 'text', mode: 'readwrite', note: '巡查人姓名（快照）' },
  { wps: '分组名称',       biz: 'operation_unit',  pg: 'area_team',     type: 'text', mode: 'readwrite', note: '所属乡镇 / 作业中心下的班组分组' },
  { wps: '所属岗位',       biz: 'position',        pg: 'position',      type: 'text', mode: 'readwrite', note: '岗位（如 乡镇作业中心经理 / 管理员）' },
  { wps: '网格等级',       biz: 'grid_level',      pg: 'grid_level',    type: 'text', mode: 'readwrite', note: '网格等级（一级/二级/三级网格长/总网格长）' },
  // WPS-PG-SYNC-02 补齐：唯一真源此前缺失 日期↔inspection_date（此前靠 wpsGridSyncService.FIELD_MAP 兜底）。
  // mode=readonly：不参与 PC 台账→WPS 写入（与既有行为一致），仅供读取归一/同步投影。
  { wps: '日期',          biz: 'inspection_date', pg: 'inspection_date', type: 'date', mode: 'readonly', tf: 'date', note: '巡查日期（原文可能为「2026-09-01 15:27」或中文日期；同步/读取一律归一为 YYYY-MM-DD）' },

  // ---- 历史遗留：昵称（非身份） ----
  { wps: '昵称2',         biz: 'nickname',        pg: 'nickname',      type: 'text', mode: 'readonly',  note: '历史昵称（吉祥/用户xxx 等），仅展示，禁止作身份/关联键。真实板列名为「昵称2」（Sprint-WPS-02-C 真机 Schema 证实）' },

  // ---- 位置（GPS 预留，本 Sprint 不开发定位） ----
  { biz: 'inspection_time', wps: '巡查时间',        pg: '-',             type: 'time',   mode: 'reserved', note: '巡查发生时间（预留）' },
  { biz: 'longitude',      wps: '经度',            pg: '-',             type: 'number', mode: 'reserved', note: 'GPS 经度（预留）' },
  { biz: 'latitude',       wps: '纬度',            pg: '-',             type: 'number', mode: 'reserved', note: 'GPS 纬度（预留）' },
  { biz: 'location_address', wps: '定位地址',       pg: '-',             type: 'text',   mode: 'reserved', note: '反地理编码地址（预留）' },
  { biz: 'grid_area',      wps: '所属网格',         pg: '-',             type: 'text',   mode: 'reserved', note: '所属网格（预留）' },
  { biz: 'patrol_area',    wps: '巡查区域',         pg: '-',             type: 'text',   mode: 'reserved', note: '巡查区域（预留）' },

  // ---- 三违 ----
  { wps: '三违行为',        biz: 'violation_behavior', pg: 'violation_behavior', type: 'text', mode: 'readwrite', note: '三违行为描述（无三违行为 视为未发现）' },
  { biz: 'violatorEmployeeId', wps: '违章人员ID',   pg: '-',             type: 'text', mode: 'reserved', note: '违章人员 employeeId（本 Sprint 保持 reserved：无可靠违章人员选择机制，禁止按姓名/重名自动匹配）' },
  { wps: '违章人姓名',       biz: 'violator_name',   pg: 'violator_name',   type: 'text', mode: 'readwrite', note: '违章人姓名（快照）' },
  { wps: '违章人性别',       biz: 'violator_gender', pg: 'violator_gender', type: 'text', mode: 'readwrite', note: '违章人性别（快照）' },
  { wps: '违章人年龄',       biz: 'violator_age',    pg: 'violator_age',    type: 'text', mode: 'readwrite', note: '违章人年龄（快照，可能含 岁/位数文本）' },

  // ---- PC 台账业务字段（Sprint-WPS-02-B 补齐，WPS 侧需建列） ----
  { wps: '上报状态',        biz: 'reportStatus',         pg: 'report_status',         type: 'text', mode: 'readwrite', note: '上报状态（已上报/未上报/待上报）' },
  { wps: '车辆类型',        biz: 'vehicleType',          pg: 'vehicle_type',          type: 'text', mode: 'readwrite', note: '车辆类型' },
  { wps: '违章类型结果',     biz: 'violationTypeResult',  pg: 'violation_type_result', type: 'text', mode: 'readwrite', note: '违章类型结果' },
  { wps: '是否需要整改',     biz: 'needRectification',    pg: 'need_rectification',    type: 'text', mode: 'readwrite', note: '是否需要整改（是/否）' },
  { wps: '整改人',          biz: 'rectifier',             pg: 'rectifier',             type: 'text', mode: 'readwrite', note: '整改人' },

  // ---- 附件（链接镜像） ----
  // 正式系统使用多维表附件字段/API；本层统一归一为 { url, name, fieldId }，不把内部附件对象原样暴露。
  { wps: '三违照片链接',     biz: 'violation_photos',  pg: 'image_content',   type: 'link', mode: 'readwrite', note: '三违照片链接镜像（归一为 attachment[]）' },
  { wps: '整改后照片链接',   biz: 'rectified_photos',  pg: 'rectified_photo', type: 'link', mode: 'readwrite', note: '整改后照片链接镜像' },
  { wps: '示意图链接',       biz: 'schematic',         pg: 'schematic',       type: 'link', mode: 'readwrite', note: '示意图链接镜像' },

  // ---- 其他 ----
  { wps: '当日是否报名',     biz: 'signup_today',      pg: 'signup_today',  type: 'text', mode: 'readwrite', note: '当日是否报名' },
  { wps: '是否补交',         biz: 'is_resubmit',       pg: 'is_resubmit',   type: 'text', mode: 'readwrite', note: '是否补交' },
  { wps: '提交时间',         biz: 'upload_time',       pg: 'upload_time',   type: 'text', mode: 'readwrite', note: '提交时间（原文）' },
  { wps: '来源日期',         biz: 'source_date',       pg: '-',             type: 'text', mode: 'readonly',  note: '来源日期（WPS 侧维护）' },
  { wps: '标记',            biz: 'marker',            pg: 'marker',        type: 'text', mode: 'readwrite', note: '标记' },
];

// 供上层快速按 biz / wps / pg 名查询
const BY_BIZ = new Map(FIELD_MAP.map((f) => [f.biz, f]));
const BY_WPS = new Map(FIELD_MAP.map((f) => [f.wps, f]));
const BY_PG = new Map(FIELD_MAP.filter((f) => f.pg && f.pg !== '-').map((f) => [f.pg, f]));

/** 原样读取一个映射定义 */
function byBiz(biz) { return BY_BIZ.get(biz) || null; }
function byWps(wpsName) { return BY_WPS.get(wpsName) || null; }
function byPg(pgCol) { return BY_PG.get(pgCol) || null; }

// ============================================================
// WPS → PostgreSQL 单向同步投影（WPS-PG-SYNC-02 冻结）
// ============================================================
/**
 * 本文件是「WPS 字段 ↔ PG 列」的**唯一真源**。
 * 历史上存在第二套字面量（`wpsGridSyncService.FIELD_MAP` / `wpsGridMigrationService.FIELD_MAP`），
 * WPS-PG-SYNC-02 已全部收敛到此处；任何新增/修改字段只允许改本文件。
 *
 * SYNC_PROJECTION_ORDER：同步引擎的规范化投影顺序。
 *   - 前 18 列 = 历史冻结的 sync_hash 口径（与既有 2061 条 `grid_record_sync_map.sync_hash`
 *     逐字节兼容，实测 199/199 match / 0 mismatch）。**顺序与集合不得改动**。
 *   - 第 19 列起 = 不参与 sync_hash 的追加段（只允许**末尾追加**，绝不允许插入前 18 列）：
 *       · 后 5 列 = PC 台账业务列（当前 WPS 板上无对应列 → 记录中永不出现 → 投影惰性）；
 *       · 第 24 列 = employee_code（CF-WPS-06 新增，WPS「员工编码」业务快照）。
 *     追加段不参与 sync_hash，避免历史哈希口径漂移导致存量记录被误判为「已变更」。
 *   - `grid_id` / `inspector_employee_id` 为 PG 权威字段，**永不**进入本投影（fail-closed）。
 *
 * ⚠️ hash 口径不变量（CF-WPS-06 实测证据）：
 *   SYNC_HASH_COLUMNS = SYNC_PROJECTION_ORDER.slice(0, 18) —— **位置敏感**。
 *   实测 R1：存量 2061/2061 命中；R2：末尾追加 employee_code 后 2061/2061 不变；
 *   R3：WPS 记录新增「员工编码」字段后 2061/2061 不变；
 *   R4 负对照：把 employee_code 插到第 1 位 → 2061/2061 全部改变（证明必须末尾追加）。
 */
const SYNC_PROJECTION_ORDER = [
  // —— 冻结 hash 口径（18 列，顺序不可变）——
  'nickname', 'area_team', 'personnel_name', 'position', 'grid_level', 'inspection_date',
  'violation_behavior', 'violator_name', 'violator_gender', 'violator_age',
  'signup_today', 'marker', 'is_resubmit', 'upload_time', 'serial_no',
  'image_content', 'rectified_photo', 'schematic',
  // —— 非 hash 业务列（5 列）——
  'report_status', 'vehicle_type', 'violation_type_result', 'need_rectification', 'rectifier',
  // —— 非 hash 移动端业务快照列（CF-WPS-06，仅允许追加在此处及之后）——
  'employee_code',
];

/**
 * 冻结 hash 段字面量（**绝对不可修改**）。
 * CF-WPS-06 新增机器级护栏：模块加载即断言 SYNC_PROJECTION_ORDER 前 18 列与之逐字节相同，
 * 任何「插入 / 删除 / 换位」都会在进程启动时直接抛错（fail-fast），
 * 彻底杜绝「悄悄改变 hash 口径 → 存量 2061 条被误判为已变更 → 误 UPDATE」的风险。
 */
const FROZEN_HASH_SEGMENT = Object.freeze([
  'nickname', 'area_team', 'personnel_name', 'position', 'grid_level', 'inspection_date',
  'violation_behavior', 'violator_name', 'violator_gender', 'violator_age',
  'signup_today', 'marker', 'is_resubmit', 'upload_time', 'serial_no',
  'image_content', 'rectified_photo', 'schematic',
]);

/** 参与 sync_hash 的列（= 冻结的历史口径） */
const SYNC_HASH_COLUMNS = SYNC_PROJECTION_ORDER.slice(0, 18);
/** 参与 sync_hash 的列数（冻结常量，供门禁断言） */
const SYNC_HASH_COLUMN_COUNT = 18;

// ---- hash 口径不变量断言（fail-fast；CF-WPS-06） ----
if (SYNC_PROJECTION_ORDER.slice(0, SYNC_HASH_COLUMN_COUNT).join('|') !== FROZEN_HASH_SEGMENT.join('|')) {
  throw new Error(
    'wpsFieldMap 冻结口径违规：SYNC_PROJECTION_ORDER 前 18 列必须与 FROZEN_HASH_SEGMENT 完全一致。' +
    '新增字段只允许追加在数组末尾（第 19 列及之后），否则 sync_hash 会漂移并误判存量记录为「已变更」。'
  );
}
if (SYNC_PROJECTION_ORDER.length < SYNC_HASH_COLUMN_COUNT) {
  throw new Error('wpsFieldMap 冻结口径违规：SYNC_PROJECTION_ORDER 长度不得小于冻结 hash 列数 18');
}

/**
 * PG 权威字段：同步引擎**永不**写入、永不覆盖（WPS 无可靠来源，必须 fail-closed）。
 * - inspector_employee_id：身份，只能由后端身份链派生
 * - grid_id：网格归属，只能由 gridScope 派生
 */
const PROTECTED_COLUMNS = ['grid_id', 'inspector_employee_id'];

/** 图片/链接型 PG 列（仅允许合法 http(s) URL 落库） */
const SYNC_URL_COLUMNS = ['image_content', 'rectified_photo', 'schematic'];

/** 规范化投影：[{ wps, pg, tf, hash }]（由 FIELD_MAP 反查，缺映射即抛出，防静默漂移） */
const SYNC_PROJECTION = SYNC_PROJECTION_ORDER.map((pg) => {
  const def = BY_PG.get(pg);
  if (!def || !def.wps) throw new Error(`SYNC_PROJECTION_ORDER 中的 PG 列 ${pg} 在 FIELD_MAP 中缺少 wps 映射`);
  const hash = SYNC_HASH_COLUMNS.includes(pg);
  return { wps: def.wps, pg, tf: def.tf || null, type: def.type || 'text', hash };
});

module.exports = {
  FIELD_MAP,
  byBiz,
  byWps,
  byPg,
  SYNC_PROJECTION,
  SYNC_PROJECTION_ORDER,
  SYNC_HASH_COLUMNS,
  SYNC_HASH_COLUMN_COUNT,
  FROZEN_HASH_SEGMENT,
  SYNC_URL_COLUMNS,
  PROTECTED_COLUMNS,
};
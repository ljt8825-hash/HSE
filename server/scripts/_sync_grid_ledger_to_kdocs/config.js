/**
 * 网格长巡查台账 → WPS 镜像同步 · 配置
 * 仅占位与映射，不含任何凭据（token 由 WorkBuddy 连接器托管）。
 *
 * ⚠ 2026-09-07 实测核验：目标文档 `l/cbj5jDkU0KRu` 实为
 *    `2026-09-新版.xlsx`（普通表格 .xlsx，file_id=fvEY4o9QH9M8soRdqmy91xPE7MvU3TMLX，drive_id=882441249）。
 *    故 DOC_TYPE 默认改为 'sheet'（不是多维表格 dbsheet）。
 *    文档为「按日分块累积台账」：每天一块(标题+表头+当日行+总计行)，无全表统一表头，
 *    且有 3 个图片分列 + 内嵌图片。下方 KDOCS_COLUMNS / PG_TO_KDOCS 已按真实列名修正。
 */
'use strict';

module.exports = {
  // ===== WPS 文档标识（已核验）=====
  KDOCS_FILE_ID: process.env.KDOCS_FILE_ID || 'fvEY4o9QH9M8soRdqmy91xPE7MvU3TMLX',
  KDOCS_DRIVE_ID: process.env.KDOCS_DRIVE_ID || '882441249',
  // 文档类型：实测为普通表格 xlsx → 用 'sheet'（多维表格才用 'dbsheet'）
  DOC_TYPE: process.env.KDOCS_DOC_TYPE || 'sheet',

  // ===== 同步模式 =====
  // 'mirror'  = PG→WPS 单向（只读镜像，最稳）
  // 'twoway'  = 额外把 WPS 改动回写 PG（阶段 B，需乐观锁 + serial_no 匹配）
  SYNC_MODE: process.env.SYNC_MODE || 'mirror',

  // ===== 写入节奏（应对 kdocs 限频）=====
  BATCH_SIZE: parseInt(process.env.SYNC_BATCH_SIZE || '20', 10), // 每批行数
  BATCH_INTERVAL_MS: parseInt(process.env.SYNC_BATCH_INTERVAL_MS || '800', 10), // 批间间隔
  READ_CACHE_TTL_MS: parseInt(process.env.SYNC_CACHE_TTL_MS || '60000', 10), // WPS 读取本地缓存

  // ===== WPS 实际列顺序（按日块表头，21 列）=====
  // 注意：文档每天重复此表头，并夹「标题行」「总计」行，同步时需跳过这些非数据行。
  KDOCS_COLUMNS: [
    '序号', '昵称', '分组名称', '姓名', '所属岗位', '网格等级', '日期',
    '三违照片：图片1', '三违照片：图片2', '三违照片：图片3',
    '三违行为', '违章人姓名', '违章人性别', '违章人年龄',
    '整改后照片：图片1', '当日是否报名', '标记', '是否补交', '提交时间', '编号', '来源日期',
  ],

  // ===== PG 字段 → WPS 列 映射（按实测文档修正）=====
  // 覆盖约 15/23 字段；下方 PG_FIELDS_MISSING_IN_WPS 列出 WPS 中无对应列的 PG 字段。
  PG_TO_KDOCS: {
    // id: 无对应列（WPS 用「编号 serial_no」作自然键，PG id 不同步）
    area_team: '分组名称',
    inspection_date: '日期', // ⚠ 格式差异：WPS '2026-09-01 15:27'(本地) vs PG UTC '...T16:00:00.000Z'
    personnel_name: '姓名',
    grid_level: '网格等级',
    position: '所属岗位',
    violator_name: '违章人姓名',
    violator_gender: '违章人性别',
    violator_age: '违章人年龄',
    // vehicle_type: 无列
    // report_status: 无列
    image_content: '三违照片：图片1', // ⚠ 结构差异：PG 存路径文本；WPS 是内嵌图片(最多3列)
    violation_behavior: '三违行为',
    // violation_type_result: 无列
    // need_rectification: 无列
    // rectifier: 无列
    rectified_photo: '整改后照片：图片1', // ⚠ 同上，图片结构不同
    // schematic: 无列
    // grid_id: 无列
    nickname: '昵称',
    signup_today: '当日是否报名',
    marker: '标记',
    is_resubmit: '是否补交',
    // upload_time ≈ 提交时间（WPS 有「提交时间」列，近似）
    serial_no: '编号',
    // inspection_date 同时可派生「来源日期」
  },

  // WPS 文档有、但 PG grid_inspection_records 无独立列的字段（同步时忽略或仅展示）：
  //   序号(每日重置，非全局PK)、三违照片：图片2/图片3、提交时间、来源日期

  // PG 字段在 WPS 中**无对应列**（PG→WPS 时这些字段无法写入 WPS）：
  PG_FIELDS_MISSING_IN_WPS: [
    'id', 'vehicle_type', 'report_status', 'violation_type_result',
    'need_rectification', 'rectifier', 'schematic', 'grid_id',
    'upload_time', 'created_at', 'updated_at',
  ],

  // 阶段 B 回写 PG 时，仅允许这些字段（对齐后端 GRID_RECORD_EDITABLE 白名单），
  // 且这些字段中 WPS 实际可编辑的只有：area_team/inspection_date/personnel_name/grid_level/
  // position/violator_*/violation_behavior/nickname/signup_today/marker/is_resubmit/serial_no
  TWOWAY_WRITABLE_PG: [
    'area_team', 'inspection_date', 'personnel_name', 'grid_level', 'position',
    'violator_name', 'violator_gender', 'violator_age', 'report_status',
    'violation_behavior', 'need_rectification', 'rectifier',
    'nickname', 'signup_today', 'marker', 'is_resubmit', 'serial_no',
  ],

  // upsert 使用的 WPS 自然键（PG→WPS 用它定位行；WPS 无 id，用 编号）
  WPS_NATURAL_KEY_COL: '编号', // = PG serial_no
};

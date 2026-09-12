/**
 * 转运站管理台账 Controller
 * 规则映射：TRANSFER001（巡查缺失）/ TRANSFER002（标识牌问题）/ FIRE001（消防点检考核点）
 * 2026-09 调整：按"月度安全生产检查表"重构考核列
 *   移除：检查人 / 检查结论 / 标识牌缺少·损坏·褪色·脱落 / 消防点检·未点检·失效未上报·器材丢失
 *   新增（数值计数）：台账管理 / 标识牌管理 / 用电安全 / 消防管理 / 物品摆放
 *   检查日期改存 'YYYY-MM'（varchar(7)）
 * 旧列在库保留不删，仅从此配置与前端隐藏。
 */
const { createCheckLedgerController } = require('./checkLedgerFactory');

module.exports = createCheckLedgerController({
  table: 'transfer_station_check',
  moduleKey: 'transfer-stations',
  displayName: '转运站台账',
  displayKey: 'station_code',
  exportSheet: '转运站管理台账',
  searchCols: ['station_code', 'station_name', 'area_team'],
  filterMap: {
    stationCode: 'station_code',
    areaTeam: 'area_team',
  },
  orderBy: 'check_date DESC, id DESC',
  // 空月份延续上月生成空页：仅对 ≥2026-08 启用（2026-09 起考核列改为 5 项数值计数）
  continueBoundary: '2026-08',
  // camel(前端) → snake(列) 白名单
  createCols: {
    stationCode: 'station_code',
    stationName: 'station_name',
    areaTeam: 'area_team',
    checkDate: 'check_date',
    ledgerManagement: 'ledger_management',
    signManagement: 'sign_management',
    electricitySafety: 'electricity_safety',
    fireManagement: 'fire_management',
    itemPlacement: 'item_placement',
    remark: 'remark',
  },
  // Excel 模板 / 导出 / 预览列
  exportColumns: [
    { header: '站点编号', key: 'station_code', type: 'string', width: 16 },
    { header: '站点名称', key: 'station_name', type: 'string', width: 22 },
    { header: '片区/班组', key: 'area_team', type: 'string', width: 16 },
    { header: '台账管理', key: 'ledger_management', type: 'int', width: 12 },
    { header: '检查日期', key: 'check_date', type: 'string', width: 12 },
    { header: '标识牌管理', key: 'sign_management', type: 'int', width: 12 },
    { header: '用电安全', key: 'electricity_safety', type: 'int', width: 12 },
    { header: '消防管理', key: 'fire_management', type: 'int', width: 12 },
    { header: '物品摆放', key: 'item_placement', type: 'int', width: 12 },
    { header: '备注', key: 'remark', type: 'string', width: 28 },
  ],
  // 导入：中文表头 → snake 字段
  aliasMap: {
    station_code: ['站点编号', '站编号'],
    station_name: ['站点名称', '站点'],
    area_team: ['片区', '班组', '片区/班组'],
    check_date: ['检查日期', '日期'],
    ledger_management: ['台账管理'],
    sign_management: ['标识牌管理'],
    electricity_safety: ['用电安全'],
    fire_management: ['消防管理'],
    item_placement: ['物品摆放'],
    remark: ['备注', '说明'],
  },
  fieldsConfig: {
    station_code: { type: 'string' },
    station_name: { type: 'string' },
    area_team: { type: 'string' },
    check_date: { type: 'string' },
    ledger_management: { type: 'int' },
    sign_management: { type: 'int' },
    electricity_safety: { type: 'int' },
    fire_management: { type: 'int' },
    item_placement: { type: 'int' },
    remark: { type: 'string' },
  },
});

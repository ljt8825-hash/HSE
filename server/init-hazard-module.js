const { pool, testConnection } = require('./config/db');

async function initHazardModule() {
  await testConnection();
  if (!testConnection || true) {
    console.log('[HazardInit] 开始初始化隐患治理模块配置...');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ========== 1. 动态筛选器配置 ==========
    console.log('[HazardInit] 配置动态筛选器...');
    const filters = [
      { moduleCode: 'hazard_governance', fieldName: 'keyword', label: '关键词搜索', controlType: 'input', dataSource: null, dataOptions: [], placeholder: '请输入隐患描述/位置/整改人', helpCode: 'hse_hazard_list', sortOrder: 1, width: 220, isVisible: true, isRequired: false },
      { moduleCode: 'hazard_governance', fieldName: 'hazardLevel', label: '隐患等级', controlType: 'select', dataSource: 'enum', dataOptions: [
        { value: '一级', label: '一级(重大隐患)' },
        { value: '二级', label: '二级(较大隐患)' },
        { value: '三级', label: '三级(一般隐患)' },
        { value: '四级', label: '四级(轻微隐患)' },
      ], placeholder: '请选择隐患等级', helpCode: 'hse_hazard_level_rule', sortOrder: 2, width: 200, isVisible: true, isRequired: false },
      { moduleCode: 'hazard_governance', fieldName: 'status', label: '治理状态', controlType: 'select', dataSource: 'enum', dataOptions: [
        { value: 'discovered', label: '待登记' },
        { value: 'assigned', label: '待整改' },
        { value: 'processing', label: '整改中' },
        { value: 'pending_review', label: '待复查' },
        { value: 'closed', label: '已闭环' },
        { value: 'expired', label: '已超期' },
      ], placeholder: '请选择治理状态', helpCode: 'hse_hazard_status_flow', sortOrder: 3, width: 200, isVisible: true, isRequired: false },
      { moduleCode: 'hazard_governance', fieldName: 'hazardSource', label: '隐患来源', controlType: 'select', dataSource: 'api', dataOptions: [], placeholder: '请选择隐患来源', helpCode: 'hse_hazard_source', sortOrder: 4, width: 200, isVisible: true, isRequired: false },
      { moduleCode: 'hazard_governance', fieldName: 'hazardCategory', label: '隐患类别', controlType: 'select', dataSource: 'api', dataOptions: [], placeholder: '请选择隐患类别', helpCode: 'hse_hazard_category', sortOrder: 5, width: 200, isVisible: true, isRequired: false },
      { moduleCode: 'hazard_governance', fieldName: 'area', label: '所属区域', controlType: 'select', dataSource: 'api', dataOptions: [], placeholder: '请选择所属区域', helpCode: 'hse_hazard_list', sortOrder: 6, width: 200, isVisible: true, isRequired: false },
      { moduleCode: 'hazard_governance', fieldName: 'responsibleDept', label: '责任部门', controlType: 'select', dataSource: 'api', dataOptions: [], placeholder: '请选择责任部门', helpCode: 'hse_hazard_responsibility', sortOrder: 7, width: 200, isVisible: true, isRequired: false },
      { moduleCode: 'hazard_governance', fieldName: 'responsibleId', label: '整改责任人', controlType: 'select', dataSource: 'api', dataOptions: [], placeholder: '请选择整改责任人', helpCode: 'hse_hazard_responsibility', sortOrder: 8, width: 200, isVisible: true, isRequired: false },
      { moduleCode: 'hazard_governance', fieldName: 'expiryStatus', label: '时效状态', controlType: 'select', dataSource: 'enum', dataOptions: [
        { value: 'normal', label: '正常' },
        { value: 'expiring', label: '临期(7天内)' },
        { value: 'expired', label: '已超期' },
        { value: 'resolved', label: '已完成' },
      ], placeholder: '请选择时效状态', helpCode: 'hse_hazard_expiry', sortOrder: 9, width: 200, isVisible: true, isRequired: false },
      { moduleCode: 'hazard_governance', fieldName: 'checkDateRange', label: '检查日期', controlType: 'range', dataSource: 'date', dataOptions: [], placeholder: '请选择检查日期范围', helpCode: 'hse_hazard_list', sortOrder: 10, width: 260, isVisible: true, isRequired: false },
    ];

    for (const f of filters) {
      const exist = await client.query(
        'SELECT id FROM hse_filter_config WHERE module_code=$1 AND field_name=$2',
        [f.moduleCode, f.fieldName]
      );
      if (exist.rows.length > 0) {
        console.log(`  [筛选器] 已存在: ${f.moduleCode}.${f.fieldName}，跳过`);
        continue;
      }
      await client.query(`
        INSERT INTO hse_filter_config (module_code, field_name, label, control_type, data_source, data_options, placeholder, help_code, sort_order, width, is_visible, is_required, status, remark)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      `, [f.moduleCode, f.fieldName, f.label, f.controlType, f.dataSource, JSON.stringify(f.dataOptions), f.placeholder, f.helpCode, f.sortOrder, f.width, f.isVisible, f.isRequired, 'active', '']);
      console.log(`  [筛选器] 已创建: ${f.moduleCode}.${f.fieldName}`);
    }

    // ========== 2. 统计卡片配置 ==========
    console.log('[HazardInit] 配置统计卡片...');
    const cards = [
      { cardCode: 'hazard_total', cardTitle: '隐患总数', moduleCode: 'hazard_governance', dashboardCode: 'overview', cardType: 'stat', icon: 'lucide:alert-triangle', semanticColor: 'info', dataSourceApi: '/api/hazards/stats', dataSourceParams: { field: 'total' }, clickAction: 'route', targetRoute: '/hazards/list', filterConditions: {}, helpCode: 'hse_hazard_control', sortOrder: 20, width: 1, isVisible: true },
      { cardCode: 'hazard_level1', cardTitle: '重大隐患', moduleCode: 'hazard_governance', dashboardCode: 'overview', cardType: 'stat', icon: 'lucide:skull', semanticColor: 'danger', dataSourceApi: '/api/hazards/stats', dataSourceParams: { field: 'byLevel', key: '一级' }, clickAction: 'filter', targetRoute: '/hazards/list', filterConditions: { hazardLevel: '一级' }, helpCode: 'hse_hazard_level_rule', sortOrder: 21, width: 1, isVisible: true },
      { cardCode: 'hazard_level2', cardTitle: '较大隐患', moduleCode: 'hazard_governance', dashboardCode: 'overview', cardType: 'stat', icon: 'lucide:alert-octagon', semanticColor: 'warning', dataSourceApi: '/api/hazards/stats', dataSourceParams: { field: 'byLevel', key: '二级' }, clickAction: 'filter', targetRoute: '/hazards/list', filterConditions: { hazardLevel: '二级' }, helpCode: 'hse_hazard_level_rule', sortOrder: 22, width: 1, isVisible: true },
      { cardCode: 'hazard_level3', cardTitle: '一般隐患', moduleCode: 'hazard_governance', dashboardCode: 'overview', cardType: 'stat', icon: 'lucide:info', semanticColor: 'info', dataSourceApi: '/api/hazards/stats', dataSourceParams: { field: 'byLevel', key: '三级' }, clickAction: 'filter', targetRoute: '/hazards/list', filterConditions: { hazardLevel: '三级' }, helpCode: 'hse_hazard_level_rule', sortOrder: 23, width: 1, isVisible: true },
      { cardCode: 'hazard_level4', cardTitle: '轻微隐患', moduleCode: 'hazard_governance', dashboardCode: 'overview', cardType: 'stat', icon: 'lucide:check-circle', semanticColor: 'success', dataSourceApi: '/api/hazards/stats', dataSourceParams: { field: 'byLevel', key: '四级' }, clickAction: 'filter', targetRoute: '/hazards/list', filterConditions: { hazardLevel: '四级' }, helpCode: 'hse_hazard_level_rule', sortOrder: 24, width: 1, isVisible: true },
      { cardCode: 'hazard_pending', cardTitle: '待整改', moduleCode: 'hazard_governance', dashboardCode: 'overview', cardType: 'stat', icon: 'lucide:clock', semanticColor: 'warning', dataSourceApi: '/api/hazards/stats', dataSourceParams: { field: 'byStatus', key: 'assigned' }, clickAction: 'filter', targetRoute: '/hazards/list', filterConditions: { status: 'assigned' }, helpCode: 'hse_hazard_status_flow', sortOrder: 25, width: 1, isVisible: true },
      { cardCode: 'hazard_processing', cardTitle: '整改中', moduleCode: 'hazard_governance', dashboardCode: 'overview', cardType: 'stat', icon: 'lucide:wrench', semanticColor: 'info', dataSourceApi: '/api/hazards/stats', dataSourceParams: { field: 'byStatus', key: 'processing' }, clickAction: 'filter', targetRoute: '/hazards/list', filterConditions: { status: 'processing' }, helpCode: 'hse_hazard_status_flow', sortOrder: 26, width: 1, isVisible: true },
      { cardCode: 'hazard_expiring', cardTitle: '临期隐患', moduleCode: 'hazard_governance', dashboardCode: 'overview', cardType: 'stat', icon: 'lucide:clock-alert', semanticColor: 'warning', dataSourceApi: '/api/hazards/stats', dataSourceParams: { field: 'expiring' }, clickAction: 'filter', targetRoute: '/hazards/list', filterConditions: { expiryStatus: 'expiring' }, helpCode: 'hse_hazard_expiry', sortOrder: 27, width: 1, isVisible: true },
      { cardCode: 'hazard_expired', cardTitle: '超期隐患', moduleCode: 'hazard_governance', dashboardCode: 'overview', cardType: 'stat', icon: 'lucide:alert-circle', semanticColor: 'danger', dataSourceApi: '/api/hazards/stats', dataSourceParams: { field: 'expired' }, clickAction: 'filter', targetRoute: '/hazards/list', filterConditions: { expiryStatus: 'expired' }, helpCode: 'hse_hazard_expiry', sortOrder: 28, width: 1, isVisible: true },
      { cardCode: 'hazard_closed', cardTitle: '已闭环', moduleCode: 'hazard_governance', dashboardCode: 'overview', cardType: 'stat', icon: 'lucide:check-circle-2', semanticColor: 'success', dataSourceApi: '/api/hazards/stats', dataSourceParams: { field: 'byStatus', key: 'closed' }, clickAction: 'filter', targetRoute: '/hazards/list', filterConditions: { status: 'closed' }, helpCode: 'hse_hazard_status_flow', sortOrder: 29, width: 1, isVisible: true },
      { cardCode: 'hazard_related_risks', cardTitle: '关联风险数', moduleCode: 'hazard_governance', dashboardCode: 'overview', cardType: 'stat', icon: 'lucide:link', semanticColor: 'info', dataSourceApi: '/api/hazards/stats', dataSourceParams: { field: 'relatedRisks' }, clickAction: 'none', targetRoute: null, filterConditions: {}, helpCode: 'hse_hazard_risk_link', sortOrder: 30, width: 1, isVisible: true },
    ];

    for (const c of cards) {
      const exist = await client.query(
        'SELECT id FROM hse_dashboard_card_config WHERE card_code=$1',
        [c.cardCode]
      );
      if (exist.rows.length > 0) {
        console.log(`  [统计卡片] 已存在: ${c.cardCode}，跳过`);
        continue;
      }
      await client.query(`
        INSERT INTO hse_dashboard_card_config (card_code, card_title, module_code, dashboard_code, card_type, icon, semantic_color, data_source_api, data_source_params, click_action, target_route, filter_conditions, help_code, sort_order, width, is_visible, status, remark)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      `, [c.cardCode, c.cardTitle, c.moduleCode, c.dashboardCode, c.cardType, c.icon, c.semanticColor, c.dataSourceApi, JSON.stringify(c.dataSourceParams), c.clickAction, c.targetRoute, JSON.stringify(c.filterConditions), c.helpCode, c.sortOrder, c.width, c.isVisible, 'active', '']);
      console.log(`  [统计卡片] 已创建: ${c.cardCode}`);
    }

    // ========== 3. 帮助知识库配置 ==========
    console.log('[HazardInit] 配置帮助知识库...');
    const helpItems = [
      { menuCode: 'hse_hazard_control', title: '隐患治理模块概述', content: '隐患治理是HSE系统的核心业务模块，实现隐患从发现、登记、整改、复查到闭环的全流程管理。支持隐患登记、整改跟踪、复查验收、闭环管理，并与风险管控模块双向联动。', fieldDescription: '', calculateRule: '时效状态=基于检查日期+整改期限自动计算；超期升级=超期≥7天自动升级等级', generateRule: '隐患来源：日常检查、专项检查、综合检查、风险生成、员工上报、上级督办、事故衍生', relationRule: '隐患↔风险（双向联动，多对多关联）；隐患→整改人（EmployeeSelector）；隐患→责任部门', permissionRule: '公司总经理审批一级隐患；部门负责人审批二级；乡镇主管审批三级；管理员负责登记与流程跟踪；员工上报与整改执行', sortOrder: 1 },
      { menuCode: 'hse_hazard_list', title: '隐患清单说明', content: '隐患清单展示全公司所有隐患记录，支持按隐患等级、治理状态、来源、类别、区域、部门、责任人、时效状态、检查日期等多维度筛选。每条隐患记录包含基本信息、整改信息、复查信息、时效状态。', fieldDescription: '隐患描述：隐患的具体内容；隐患等级：一级(重大)/二级(较大)/三级(一般)/四级(轻微)；治理状态：待登记/待整改/整改中/待复查/已闭环/已超期；责任部门：负责整改的部门；整改责任人：具体负责整改的人员；检查日期：发现隐患的日期；整改期限：要求完成整改的截止日期', calculateRule: '', generateRule: '', relationRule: '', permissionRule: '', sortOrder: 2 },
      { menuCode: 'hse_hazard_level_rule', title: '隐患等级划分规则', content: '隐患等级分为四级：一级(重大隐患) - 可能造成重大人员伤亡或重大经济损失，必须立即停产停业整改；二级(较大隐患) - 可能造成较大人员伤亡或较大经济损失，需限期整改；三级(一般隐患) - 可能造成一般人员伤亡或一般经济损失，常规整改即可；四级(轻微隐患) - 危险性较低，对人身和财产安全影响较小。', fieldDescription: '', calculateRule: '一级：默认整改期限7天，需公司总经理审批，必须制定应急预案；二级：默认整改期限15天，需部门负责人审批；三级：默认整改期限30天，乡镇主管审批；四级：默认整改期限60天', generateRule: '整改超期≥7天自动升级一级；同类隐患重复≥3次/季度自动升级；复查不通过≥2次自动升级', relationRule: '', permissionRule: '', sortOrder: 3 },
      { menuCode: 'hse_hazard_status_flow', title: '状态流转规则', content: '隐患治理全流程状态机：待登记→待整改(分配责任人)→整改中(开始整改)→待复查(整改完成提交)→已闭环(复查通过)。超期未完成自动进入已超期状态，需延期申请或立即整改。', fieldDescription: '', calculateRule: '', generateRule: '待登记→待整改：登记并分配责任人(乡镇主管/管理员)；待整改→整改中：整改人接受任务；整改中→待复查：提交整改完成(整改人)；待复查→已闭环：复查通过(复查人)；待复查→整改中：复查不通过(复查人)；已超期→整改中：继续整改(整改人)', relationRule: '', permissionRule: '', sortOrder: 4 },
      { menuCode: 'hse_hazard_source', title: '隐患来源分类', content: '隐患来源包括：日常检查(日常巡检、例行检查)；专项检查(专项安全检查、季节性检查)；综合检查(综合性安全大检查)；风险生成(从风险管控模块识别生成)；员工上报(员工主动上报隐患线索)；上级督办(上级主管部门督办)；事故衍生(事故调查后发现同类隐患)。', fieldDescription: '', calculateRule: '', generateRule: '', relationRule: '', permissionRule: '', sortOrder: 5 },
      { menuCode: 'hse_hazard_category', title: '隐患类别说明', content: '隐患类别包括：火灾爆炸、电气安全、机械伤害、高处坠落、坍塌倾覆、危险化学品、中毒窒息、车辆交通、淹溺风险、管理缺陷、培训不足、个体防护、其他隐患。', fieldDescription: '', calculateRule: '', generateRule: '', relationRule: '', permissionRule: '', sortOrder: 6 },
      { menuCode: 'hse_hazard_expiry', title: '时效状态说明', content: '时效状态由系统根据检查日期+整改期限自动计算：正常 - 距整改期限 > 7天；临期 - 距整改期限 ≤ 7天；已超期 - 超过整改期限仍未完成；已完成 - 隐患已整改闭环。临期和超期隐患自动推送通知提醒。', fieldDescription: '', calculateRule: '到期日=检查日期+整改期限(天)；临期阈值=7天；默认整改期限=30天', generateRule: '临期：每天1次推送整改人+管理员；超期：每天2次推送整改人+管理员+乡镇主管', relationRule: '', permissionRule: '', sortOrder: 7 },
      { menuCode: 'hse_hazard_responsibility', title: '责任落实机制', content: '隐患治理严格对齐组织层级：公司总经理 - 审批一级(重大)隐患整改方案；部门/中心负责人 - 审批二级(较大)隐患；乡镇作业中心经理 - 审批三级(一般)隐患，分配整改责任人；管理员 - 隐患登记建档、流程跟踪、复查验收；员工 - 上报隐患线索、执行整改任务。', fieldDescription: '', calculateRule: '', generateRule: '', relationRule: '人员选择必须复用EmployeeSelector组件，优先使用员工编号', permissionRule: '', sortOrder: 8 },
      { menuCode: 'hse_hazard_import', title: '隐患导入说明', content: '支持Excel批量导入隐患数据：1. 下载标准导入模板；2. 按模板格式填写隐患信息；3. 上传Excel文件，系统自动校验；4. 查看校验结果，修正错误后重新导入；5. 确认无误后完成导入。导入记录支持追溯。', fieldDescription: '', calculateRule: '', generateRule: '复用统一导入能力；支持错误记录下载；支持批量跳过错误行', relationRule: '', permissionRule: '', sortOrder: 9 },
      { menuCode: 'hse_hazard_risk_link', title: '隐患与风险联动', content: '隐患与风险双向联动：1. 风险点可直接生成隐患记录（风险→隐患）；2. 隐患可关联多个风险点（隐患→风险）；3. 隐患整改完成后自动更新关联风险点的最近检查日期和隐患计数；4. 形成风险识别→风险管控→隐患排查→整改闭环的完整业务链。', fieldDescription: '', calculateRule: '', generateRule: '风险生成隐患时自动预填描述、措施、风险等级等信息', relationRule: '隐患↔风险（多对多关联）；风险点.hazard_count=未完成隐患数；风险点.last_hazard_check_date=最近整改完成日期', permissionRule: '', sortOrder: 10 },
      { menuCode: 'hse_hazard_data_source', title: '数据来源说明', content: '隐患数据来源包括：1. 现场日常检查记录；2. 专项/综合安全检查；3. 风险管控模块风险点生成；4. 员工隐患上报；5. 上级督办通知；6. 事故案例分析衍生；7. Excel批量导入。所有隐患必须经过登记建档后进入治理流程。', fieldDescription: '', calculateRule: '', generateRule: '', relationRule: '', permissionRule: '', sortOrder: 11 },
    ];

    for (const h of helpItems) {
      const exist = await client.query(
        'SELECT id FROM hse_business_help WHERE menu_code=$1',
        [h.menuCode]
      );
      if (exist.rows.length > 0) {
        console.log(`  [帮助文档] 已存在: ${h.menuCode}，跳过`);
        continue;
      }
      await client.query(`
        INSERT INTO hse_business_help (menu_code, title, content, field_description, calculate_rule, generate_rule, relation_rule, permission_rule, sort_order, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `, [h.menuCode, h.title, h.content, h.fieldDescription, h.calculateRule, h.generateRule, h.relationRule, h.permissionRule, h.sortOrder, 'active']);
      console.log(`  [帮助文档] 已创建: ${h.menuCode}`);
    }

    await client.query('COMMIT');
    console.log('[HazardInit] 隐患治理模块配置初始化完成！');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[HazardInit] 初始化失败:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

initHazardModule().catch(err => {
  console.error('[HazardInit] 执行失败:', err);
  process.exit(1);
});

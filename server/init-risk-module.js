const { pool, isConnected, testConnection } = require('./config/db');

async function initRiskModule() {
  await testConnection();
  if (!isConnected()) {
    console.log('[RiskInit] 数据库未连接，跳过初始化');
    return;
  }
  console.log('[RiskInit] 开始初始化风险管控模块配置...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ========== 1. 动态筛选器配置 ==========
    console.log('[RiskInit] 配置动态筛选器...');
    const filters = [
      { moduleCode: 'risk_control', fieldName: 'keyword', label: '关键词搜索', controlType: 'input', dataSource: null, dataOptions: [], placeholder: '请输入风险名称/位置/责任人', helpCode: 'hse_risk_list', sortOrder: 1, width: 220, isVisible: true, isRequired: false },
      { moduleCode: 'risk_control', fieldName: 'level', label: '风险等级', controlType: 'select', dataSource: 'enum', dataOptions: [
        { value: '一级', label: '一级(重大风险)' },
        { value: '二级', label: '二级(较大风险)' },
        { value: '三级', label: '三级(一般风险)' },
        { value: '四级', label: '四级(低风险)' },
      ], placeholder: '请选择风险等级', helpCode: 'hse_risk_level_rule', sortOrder: 2, width: 200, isVisible: true, isRequired: false },
      { moduleCode: 'risk_control', fieldName: 'type', label: '风险类别', controlType: 'select', dataSource: 'api', dataOptions: [], placeholder: '请选择风险类别', helpCode: 'hse_risk_list', sortOrder: 3, width: 200, isVisible: true, isRequired: false },
      { moduleCode: 'risk_control', fieldName: 'area', label: '所属区域', controlType: 'select', dataSource: 'api', dataOptions: [], placeholder: '请选择所属区域', helpCode: 'hse_risk_list', sortOrder: 4, width: 200, isVisible: true, isRequired: false },
      { moduleCode: 'risk_control', fieldName: 'responsibleDept', label: '责任部门', controlType: 'select', dataSource: 'api', dataOptions: [], placeholder: '请选择责任部门', helpCode: 'hse_risk_responsibility', sortOrder: 5, width: 200, isVisible: true, isRequired: false },
      { moduleCode: 'risk_control', fieldName: 'responsiblePerson', label: '责任人', controlType: 'select', dataSource: 'api', dataOptions: [], placeholder: '请选择责任人', helpCode: 'hse_risk_responsibility', sortOrder: 6, width: 200, isVisible: true, isRequired: false },
      { moduleCode: 'risk_control', fieldName: 'assessmentMethod', label: '评价方法', controlType: 'select', dataSource: 'api', dataOptions: [], placeholder: '请选择评价方法', helpCode: 'hse_risk_assessment', sortOrder: 7, width: 200, isVisible: true, isRequired: false },
      { moduleCode: 'risk_control', fieldName: 'expiryStatus', label: '时效状态', controlType: 'select', dataSource: 'enum', dataOptions: [
        { value: 'normal', label: '正常' },
        { value: 'expiring', label: '临期(30天内)' },
        { value: 'expired', label: '已过期' },
        { value: 'permanent', label: '长期有效' },
      ], placeholder: '请选择时效状态', helpCode: 'hse_risk_expiry', sortOrder: 8, width: 200, isVisible: true, isRequired: false },
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
    console.log('[RiskInit] 配置统计卡片...');
    const cards = [
      { cardCode: 'risk_total', cardTitle: '风险总数', moduleCode: 'risk_control', dashboardCode: 'overview', cardType: 'stat', icon: 'lucide:shield-alert', semanticColor: 'info', dataSourceApi: '/api/risk-control/stats/all', dataSourceParams: { field: 'total' }, clickAction: 'route', targetRoute: '/risk/list', filterConditions: {}, helpCode: 'hse_risk_control', sortOrder: 10, width: 1, isVisible: true },
      { cardCode: 'risk_level1', cardTitle: '重大风险', moduleCode: 'risk_control', dashboardCode: 'overview', cardType: 'stat', icon: 'lucide:alert-triangle', semanticColor: 'danger', dataSourceApi: '/api/risk-control/stats/all', dataSourceParams: { field: 'byLevel', key: '一级' }, clickAction: 'filter', targetRoute: '/risk/list', filterConditions: { level: '一级' }, helpCode: 'hse_risk_level_rule', sortOrder: 11, width: 1, isVisible: true },
      { cardCode: 'risk_level2', cardTitle: '较大风险', moduleCode: 'risk_control', dashboardCode: 'overview', cardType: 'stat', icon: 'lucide:alert-octagon', semanticColor: 'warning', dataSourceApi: '/api/risk-control/stats/all', dataSourceParams: { field: 'byLevel', key: '二级' }, clickAction: 'filter', targetRoute: '/risk/list', filterConditions: { level: '二级' }, helpCode: 'hse_risk_level_rule', sortOrder: 12, width: 1, isVisible: true },
      { cardCode: 'risk_level3', cardTitle: '一般风险', moduleCode: 'risk_control', dashboardCode: 'overview', cardType: 'stat', icon: 'lucide:info', semanticColor: 'info', dataSourceApi: '/api/risk-control/stats/all', dataSourceParams: { field: 'byLevel', key: '三级' }, clickAction: 'filter', targetRoute: '/risk/list', filterConditions: { level: '三级' }, helpCode: 'hse_risk_level_rule', sortOrder: 13, width: 1, isVisible: true },
      { cardCode: 'risk_level4', cardTitle: '低风险', moduleCode: 'risk_control', dashboardCode: 'overview', cardType: 'stat', icon: 'lucide:check-circle', semanticColor: 'success', dataSourceApi: '/api/risk-control/stats/all', dataSourceParams: { field: 'byLevel', key: '四级' }, clickAction: 'filter', targetRoute: '/risk/list', filterConditions: { level: '四级' }, helpCode: 'hse_risk_level_rule', sortOrder: 14, width: 1, isVisible: true },
      { cardCode: 'risk_expiring', cardTitle: '临期风险', moduleCode: 'risk_control', dashboardCode: 'overview', cardType: 'stat', icon: 'lucide:clock-alert', semanticColor: 'warning', dataSourceApi: '/api/risk-control/stats/all', dataSourceParams: { field: 'expiring' }, clickAction: 'filter', targetRoute: '/risk/list', filterConditions: { expiryStatus: 'expiring' }, helpCode: 'hse_risk_expiry', sortOrder: 15, width: 1, isVisible: true },
      { cardCode: 'risk_expired', cardTitle: '过期风险', moduleCode: 'risk_control', dashboardCode: 'overview', cardType: 'stat', icon: 'lucide:alert-circle', semanticColor: 'danger', dataSourceApi: '/api/risk-control/stats/all', dataSourceParams: { field: 'expired' }, clickAction: 'filter', targetRoute: '/risk/list', filterConditions: { expiryStatus: 'expired' }, helpCode: 'hse_risk_expiry', sortOrder: 16, width: 1, isVisible: true },
      { cardCode: 'risk_linked_hazards', cardTitle: '关联隐患数', moduleCode: 'risk_control', dashboardCode: 'overview', cardType: 'stat', icon: 'lucide:link', semanticColor: 'info', dataSourceApi: '/api/risk-control/stats/all', dataSourceParams: { field: 'linkedHazards' }, clickAction: 'none', targetRoute: null, filterConditions: {}, helpCode: 'hse_risk_hazard_link', sortOrder: 17, width: 1, isVisible: true },
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
    console.log('[RiskInit] 配置帮助知识库...');
    const helpItems = [
      { menuCode: 'hse_risk_control', title: '风险管控模块概述', content: '风险管控模块是HSE系统的核心业务模块，负责危险源识别、风险评价、风险分级、管控措施制定、责任落实和风险变化跟踪。支持从风险识别到隐患生成的全流程闭环管理。', fieldDescription: '', calculateRule: '风险等级=评分映射(LEC/矩阵/专家评议)，时效状态=基于评估日期+复评周期自动计算', generateRule: '风险可从危险源辨识、安全评价、事故分析生成；临期风险自动生成隐患提醒', relationRule: '风险→责任人（员工）、风险→责任部门（组织）、风险↔隐患（双向联动）', permissionRule: '管理员可增删改查；部门负责人可管理本部门风险；普通员工可查看', sortOrder: 1 },
      { menuCode: 'hse_risk_list', title: '风险清单说明', content: '风险清单展示全公司所有已识别的风险点，支持按风险等级、类别、区域、责任部门、责任人、时效状态等多维度筛选。每条风险记录包含基本信息、评价信息、管控措施、责任信息和时效状态。', fieldDescription: '风险名称：危险源的识别名称；所属区域：风险所在的物理区域；所属作业：风险关联的作业活动；责任部门：管控责任的部门；责任人：具体管控责任人；风险等级：一级/二级/三级/四级', calculateRule: '', generateRule: '', relationRule: '', permissionRule: '', sortOrder: 2 },
      { menuCode: 'hse_risk_level_rule', title: '风险等级划分规则', content: '风险等级采用四级分类：一级（重大风险）- 可能造成重大人员伤亡或重大经济损失；二级（较大风险）- 可能造成较大人员伤亡或较大经济损失；三级（一般风险）- 可能造成一般人员伤亡或一般经济损失；四级（低风险）- 危险性较低，在可接受范围内。', fieldDescription: '', calculateRule: 'LEC法：D≥320=一级,160-319=二级,70-159=三级,<70=四级；风险矩阵：20-25=一级,12-19=二级,6-11=三级,1-5=四级', generateRule: '', relationRule: '一级→部门负责人/公司领导审批；二级→班组长/部门负责人审批；三级→岗位员工/班组长审批；四级→岗位员工自管', permissionRule: '', sortOrder: 3 },
      { menuCode: 'hse_risk_assessment', title: '风险评价方法', content: '系统支持三种评价方法：1. LEC评价法 - 作业条件危险性评价，D=L×E×C；2. 风险矩阵法 - 基于可能性和后果严重性的二维矩阵；3. 专家评议法 - 由行业专家根据经验判定。', fieldDescription: '', calculateRule: 'LEC：L=事故可能性(0.1-10),E=暴露频率(0.5-10),C=后果严重度(1-100),D=L×E×C；矩阵：可能性(1-5)×严重性(1-5)=评分', generateRule: '', relationRule: '', permissionRule: '', sortOrder: 4 },
      { menuCode: 'hse_risk_control_measures', title: '管控措施分类说明', content: '管控措施分为四类，按优先级从高到低：1. 工程措施 - 通过技术手段消除或降低风险；2. 管理措施 - 通过制度、流程、监督等管理手段；3. 培训措施 - 通过教育培训提高人员安全意识；4. 应急措施 - 制定应急预案并准备应急资源。', fieldDescription: '', calculateRule: '', generateRule: '一级和二级风险必须制定应急预案；所有风险至少包含一类管控措施', relationRule: '', permissionRule: '', sortOrder: 5 },
      { menuCode: 'hse_risk_responsibility', title: '责任落实机制', content: '风险管控实行分级负责制：一级（重大风险）由部门负责人管控，公司领导审批；二级（较大风险）由班组长管控，部门负责人审批；三级（一般风险）由岗位员工管控，班组长审批；四级（低风险）由岗位员工自行管控。', fieldDescription: '', calculateRule: '', generateRule: '', relationRule: '每条风险必须关联责任部门、责任人和具体岗位；人员选择复用EmployeeSelector组件', permissionRule: '', sortOrder: 6 },
      { menuCode: 'hse_risk_expiry', title: '时效状态说明', content: '时效状态由系统自动计算：正常 - 距到期日>30天；临期 - 距到期日≤30天；过期 - 当前日期已超过复评到期日；长期有效 - 未设置复评周期或周期为0。', fieldDescription: '', calculateRule: '到期日=评估日期+复评周期(月)；临期阈值=30天', generateRule: '临期风险自动推送通知提醒；过期风险自动推送告警；可自动生成隐患排查记录', relationRule: '', permissionRule: '', sortOrder: 7 },
      { menuCode: 'hse_risk_import', title: '风险清单导入说明', content: '支持Excel批量导入风险数据：1. 下载标准导入模板；2. 按模板格式填写风险信息；3. 上传Excel文件，系统自动校验；4. 查看校验结果，修正错误后重新导入；5. 确认无误后完成导入。', fieldDescription: '', calculateRule: '', generateRule: '复用统一导入能力；支持错误记录下载；支持批量跳过错误行', relationRule: '', permissionRule: '', sortOrder: 8 },
      { menuCode: 'hse_risk_hazard_link', title: '风险与隐患联动', content: '风险点可直接生成隐患记录，实现风险管控与隐患排查的联动闭环：1. 在风险详情页点击生成隐患；2. 系统自动预填风险描述、管控措施、风险等级等；3. 完善隐患信息后提交；4. 系统自动创建关联记录。', fieldDescription: '', calculateRule: '', generateRule: '临期风险可自动生成隐患排查任务', relationRule: '风险↔隐患（多对多关联）；风险点.hazard_count=关联隐患数', permissionRule: '', sortOrder: 9 },
      { menuCode: 'hse_risk_data_source', title: '数据来源说明', content: '风险数据来源包括：1. 现场危险源辨识结果；2. 安全评价报告导入；3. 历史事故案例分析；4. 专项检查发现的高风险项；5. 隐患排查升级的风险点。所有风险点必须经过评价分级后纳入管控。', fieldDescription: '', calculateRule: '', generateRule: '', relationRule: '', permissionRule: '', sortOrder: 10 },
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
    console.log('[RiskInit] 风险管控模块配置初始化完成！');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[RiskInit] 初始化失败:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

initRiskModule().catch(err => {
  console.error('[RiskInit] 执行失败:', err);
  process.exit(1);
});

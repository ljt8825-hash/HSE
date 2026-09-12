const { pool } = require('../config/db');

const menus = [
  { parent_id: 0, name: 'HSE驾驶舱', path: '/hse/dashboard', component: '#/views/hse/dashboard/index.vue', icon: 'ion:grid-outline', permission: 'hse:dashboard:view', type: 'menu', sort_order: 1, is_active: true, hidden: false, keep_alive: true },
  { parent_id: 0, name: '事故管理', path: '/hse/accidents', component: null, icon: 'ion:alert-triangle-outline', permission: 'hse:accidents:view', type: 'menu', sort_order: 2, is_active: true, hidden: false, keep_alive: false },
  { parent_id: 0, name: '隐患管理', path: '/hse/hazards', component: null, icon: 'ion:alert-circle-outline', permission: 'hse:hazards:view', type: 'menu', sort_order: 3, is_active: true, hidden: false, keep_alive: false },
  { parent_id: 0, name: '应急管理', path: '/hse/emergency', component: null, icon: 'ion:radio-outline', permission: 'hse:emergency:view', type: 'menu', sort_order: 4, is_active: true, hidden: false, keep_alive: false },
  { parent_id: 0, name: '培训管理', path: '/hse/training', component: null, icon: 'ion:book-open-outline', permission: 'hse:training:view', type: 'menu', sort_order: 5, is_active: true, hidden: false, keep_alive: false },
  { parent_id: 0, name: '规章制度', path: '/hse/regulations', component: null, icon: 'ion:document-text-outline', permission: 'hse:regulations:view', type: 'menu', sort_order: 6, is_active: true, hidden: false, keep_alive: false },
  { parent_id: 0, name: '保险管理', path: '/hse/insurance', component: null, icon: 'ion:shield-outline', permission: 'hse:insurance:view', type: 'menu', sort_order: 7, is_active: true, hidden: false, keep_alive: false },
  { parent_id: 0, name: '现场管理', path: '/hse/site-mgmt', component: null, icon: 'ion:map-outline', permission: 'hse:site-mgmt:view', type: 'menu', sort_order: 8, is_active: true, hidden: false, keep_alive: false },
  { parent_id: 0, name: '风险管控', path: '/hse/risk-control', component: null, icon: 'ion:alert-outline', permission: 'hse:risk-control:view', type: 'menu', sort_order: 9, is_active: true, hidden: false, keep_alive: false },
  { parent_id: 0, name: '目标职责', path: '/hse/objectives', component: null, icon: 'ion:target-outline', permission: 'hse:objectives:view', type: 'menu', sort_order: 10, is_active: true, hidden: false, keep_alive: false },
  { parent_id: 0, name: '人员管理', path: '/hse/personnel', component: null, icon: 'ion:people-outline', permission: 'hse:personnel:view', type: 'menu', sort_order: 11, is_active: true, hidden: false, keep_alive: false },
  { parent_id: 0, name: '超龄人员', path: '/hse/over-age-personnel', component: null, icon: 'ion:user-circle-outline', permission: 'hse:over-age-personnel:view', type: 'menu', sort_order: 12, is_active: true, hidden: false, keep_alive: false },
  { parent_id: 0, name: '告警中心', path: '/hse/alerts', component: null, icon: 'ion:bell-outline', permission: 'hse:alerts:view', type: 'menu', sort_order: 13, is_active: true, hidden: false, keep_alive: false },
  { parent_id: 0, name: '审计中心', path: '/hse/audit', component: null, icon: 'ion:search-outline', permission: 'hse:audit:view', type: 'menu', sort_order: 14, is_active: true, hidden: false, keep_alive: false },
  { parent_id: 0, name: '工作流', path: '/hse/workflow', component: null, icon: 'ion:git-compare-outline', permission: 'hse:workflow:view', type: 'menu', sort_order: 15, is_active: true, hidden: false, keep_alive: false },
  { parent_id: 0, name: '通知中心', path: '/hse/notifications', component: null, icon: 'ion:notifications-outline', permission: 'hse:notifications:view', type: 'menu', sort_order: 16, is_active: true, hidden: false, keep_alive: false },
  { parent_id: 0, name: '事件管理', path: '/hse/events', component: null, icon: 'ion:calendar-outline', permission: 'hse:events:view', type: 'menu', sort_order: 17, is_active: true, hidden: false, keep_alive: false },
  { parent_id: 0, name: '闭环管理', path: '/hse/chain', component: null, icon: 'ion:link-outline', permission: 'hse:chain:view', type: 'menu', sort_order: 18, is_active: true, hidden: false, keep_alive: false },
  { parent_id: 0, name: '任务中心', path: '/hse/tasks', component: null, icon: 'ion:checkbox-outline', permission: 'hse:tasks:view', type: 'menu', sort_order: 19, is_active: true, hidden: false, keep_alive: false },
  { parent_id: 0, name: '数据分析', path: '/hse/statistics', component: null, icon: 'ion:bar-chart-outline', permission: 'hse:statistics:view', type: 'menu', sort_order: 20, is_active: true, hidden: false, keep_alive: false },
  { parent_id: 0, name: '智能报告', path: '/hse/report', component: null, icon: 'ion:file-text-outline', permission: 'hse:report:view', type: 'menu', sort_order: 21, is_active: true, hidden: false, keep_alive: false },
  { parent_id: 0, name: 'BI大屏', path: '/hse/bi', component: null, icon: 'ion:tv-outline', permission: 'hse:bi:view', type: 'menu', sort_order: 22, is_active: true, hidden: false, keep_alive: false },
  { parent_id: 0, name: 'AI辅助', path: '/hse/ai', component: null, icon: 'ion:sparkles-outline', permission: 'hse:ai:view', type: 'menu', sort_order: 23, is_active: true, hidden: false, keep_alive: false },
  { parent_id: 0, name: 'IoT设备', path: '/hse/iot', component: null, icon: 'ion:hardware-chip-outline', permission: 'hse:iot:view', type: 'menu', sort_order: 24, is_active: true, hidden: false, keep_alive: false },
  { parent_id: 0, name: '文件管理', path: '/hse/files', component: null, icon: 'ion:folder-outline', permission: 'hse:files:view', type: 'menu', sort_order: 25, is_active: true, hidden: false, keep_alive: false },
];

const subMenus = [
  { name: '事故列表', path: '/hse/accidents', component: '#/views/accidents/index.vue', icon: 'ion:alert-triangle-outline', permission: 'hse:accidents:list', parent_path: '/hse/accidents' },
  { name: '隐患排查', path: '/hse/hazards', component: '#/views/hazards/index.vue', icon: 'ion:alert-circle-outline', permission: 'hse:hazards:list', parent_path: '/hse/hazards' },
  { name: '应急预案', path: '/hse/emergency/plans', component: '#/views/emergency/plans/index.vue', icon: 'ion:file-text-outline', permission: 'hse:emergency:plans', parent_path: '/hse/emergency' },
  { name: '应急演练', path: '/hse/emergency/drills', component: '#/views/emergency/drills/index.vue', icon: 'ion:activity-outline', permission: 'hse:emergency:drills', parent_path: '/hse/emergency' },
  { name: '应急物资', path: '/hse/emergency/supplies', component: '#/views/emergency/supplies/index.vue', icon: 'ion:package-outline', permission: 'hse:emergency:supplies', parent_path: '/hse/emergency' },
  { name: '培训管理', path: '/hse/training', component: '#/views/training/index.vue', icon: 'ion:book-open-outline', permission: 'hse:training:list', parent_path: '/hse/training' },
  { name: '规章制度', path: '/hse/regulations', component: '#/views/regulations/index.vue', icon: 'ion:document-text-outline', permission: 'hse:regulations:list', parent_path: '/hse/regulations' },
  { name: '人员保险', path: '/hse/insurance/personnel', component: '#/views/insurance/personnel/index.vue', icon: 'ion:person-outline', permission: 'hse:insurance:personnel', parent_path: '/hse/insurance' },
  { name: '车辆保险', path: '/hse/insurance/vehicle', component: '#/views/insurance/vehicle/index.vue', icon: 'ion:car-outline', permission: 'hse:insurance:vehicle', parent_path: '/hse/insurance' },
  { name: '消防器材', path: '/hse/site-mgmt/fire', component: '#/views/site-mgmt/fire/index.vue', icon: 'ion:flame-outline', permission: 'hse:site-mgmt:fire', parent_path: '/hse/site-mgmt' },
  { name: '网格化管理', path: '/hse/site-mgmt/grid', component: '#/views/site-mgmt/grid/index.vue', icon: 'ion:grid-outline', permission: 'hse:site-mgmt:grid', parent_path: '/hse/site-mgmt' },
  { name: '三违管理', path: '/hse/site-mgmt/violations', component: '#/views/site-mgmt/violations/index.vue', icon: 'ion:alert-outline', permission: 'hse:site-mgmt:violations', parent_path: '/hse/site-mgmt' },
  { name: '驾驶员管理', path: '/hse/site-mgmt/driver', component: null, icon: 'ion:people-outline', permission: 'hse:site-mgmt:driver', parent_path: '/hse/site-mgmt' },
  { name: '交通安全评估档案', path: '/hse/site-mgmt/driver/assessment', component: '#/views/site/driver/assessment/index.vue', icon: 'ion:file-text-outline', permission: 'hse:site-mgmt:driver:assessment', parent_path: '/hse/site-mgmt/driver' },
  { name: '驾驶员违章记录', path: '/hse/site-mgmt/driver/violation', component: '#/views/site/driver/violation/index.vue', icon: 'ion:car-outline', permission: 'hse:site-mgmt:driver:violation', parent_path: '/hse/site-mgmt/driver' },
  { name: '月度考核', path: '/hse/site-mgmt/driver/monthly', component: '#/views/site/driver/monthly/index.vue', icon: 'ion:clipboard-outline', permission: 'hse:site-mgmt:driver:monthly', parent_path: '/hse/site-mgmt/driver' },
  { name: '风险管控', path: '/hse/risk-control', component: '#/views/risk-control/index.vue', icon: 'ion:alert-outline', permission: 'hse:risk-control:list', parent_path: '/hse/risk-control' },
  { name: '目标责任书', path: '/hse/objectives/contracts', component: '#/views/objectives/contracts/index.vue', icon: 'ion:file-signature-outline', permission: 'hse:objectives:contracts', parent_path: '/hse/objectives' },
  { name: '目标预算', path: '/hse/objectives/budget', component: '#/views/objectives/budget/index.vue', icon: 'ion:calculator-outline', permission: 'hse:objectives:budget', parent_path: '/hse/objectives' },
  { name: '安全机构', path: '/hse/objectives/org-personnel', component: '#/views/objectives/org-personnel/index.vue', icon: 'ion:users-outline', permission: 'hse:objectives:org-personnel', parent_path: '/hse/objectives' },
  { name: '岗位责任', path: '/hse/objectives/responsibilities', component: '#/views/objectives/responsibilities/index.vue', icon: 'ion:clipboard-outline', permission: 'hse:objectives:responsibilities', parent_path: '/hse/objectives' },
  { name: '人员列表', path: '/hse/personnel', component: '#/views/personnel/index.vue', icon: 'ion:people-outline', permission: 'hse:personnel:list', parent_path: '/hse/personnel' },
  { name: '超龄人员', path: '/hse/over-age-personnel', component: '#/views/over-age-personnel/index.vue', icon: 'ion:user-circle-outline', permission: 'hse:over-age-personnel:list', parent_path: '/hse/over-age-personnel' },
  { name: '告警列表', path: '/hse/alerts', component: '#/views/hse/alerts/index.vue', icon: 'ion:bell-outline', permission: 'hse:alerts:list', parent_path: '/hse/alerts' },
  { name: '告警统计', path: '/hse/alerts/statistics', component: '#/views/hse/alerts/statistics.vue', icon: 'ion:bar-chart-outline', permission: 'hse:alerts:statistics', parent_path: '/hse/alerts' },
  { name: '审计日志', path: '/hse/audit', component: '#/views/hse/audit/index.vue', icon: 'ion:search-outline', permission: 'hse:audit:list', parent_path: '/hse/audit' },
  { name: '流程列表', path: '/hse/workflow', component: '#/views/hse/workflow/index.vue', icon: 'ion:git-compare-outline', permission: 'hse:workflow:list', parent_path: '/hse/workflow' },
  { name: '流程设计', path: '/hse/workflow/designer', component: '#/views/hse/workflow/designer.vue', icon: 'ion:pencil-outline', permission: 'hse:workflow:designer', parent_path: '/hse/workflow' },
  { name: '流程实例', path: '/hse/workflow/instance', component: '#/views/hse/workflow/instance.vue', icon: 'ion:layers-outline', permission: 'hse:workflow:instance', parent_path: '/hse/workflow' },
  { name: '待办任务', path: '/hse/workflow/task', component: '#/views/hse/workflow/task.vue', icon: 'ion:checkbox-outline', permission: 'hse:workflow:task', parent_path: '/hse/workflow' },
  { name: '通知列表', path: '/hse/notifications', component: '#/views/hse/notifications/index.vue', icon: 'ion:notifications-outline', permission: 'hse:notifications:list', parent_path: '/hse/notifications' },
  { name: '事件列表', path: '/hse/events', component: '#/views/hse/events/index.vue', icon: 'ion:calendar-outline', permission: 'hse:events:list', parent_path: '/hse/events' },
  { name: '闭环管理', path: '/hse/chain', component: '#/views/hse/chain/index.vue', icon: 'ion:link-outline', permission: 'hse:chain:list', parent_path: '/hse/chain' },
  { name: '任务列表', path: '/hse/tasks', component: '#/views/hse/tasks/index.vue', icon: 'ion:checkbox-outline', permission: 'hse:tasks:list', parent_path: '/hse/tasks' },
  { name: '数据分析', path: '/hse/statistics', component: '#/views/hse/statistics/index.vue', icon: 'ion:bar-chart-outline', permission: 'hse:statistics:list', parent_path: '/hse/statistics' },
  { name: '智能报告', path: '/hse/report', component: '#/views/hse/report/index.vue', icon: 'ion:file-text-outline', permission: 'hse:report:list', parent_path: '/hse/report' },
  { name: 'BI大屏', path: '/hse/bi', component: '#/views/hse/bi/index.vue', icon: 'ion:tv-outline', permission: 'hse:bi:view', parent_path: '/hse/bi' },
  { name: '异常检测', path: '/hse/ai/anomaly-detect', component: '#/views/hse/ai/anomaly-detect.vue', icon: 'ion:scan-outline', permission: 'hse:ai:anomaly-detect', parent_path: '/hse/ai' },
  { name: '根因分析', path: '/hse/ai/rca', component: '#/views/hse/ai/rca.vue', icon: 'ion:git-commit-outline', permission: 'hse:ai:rca', parent_path: '/hse/ai' },
  { name: '报告生成', path: '/hse/ai/report-gen', component: '#/views/hse/ai/report-gen.vue', icon: 'ion:file-text-outline', permission: 'hse:ai:report-gen', parent_path: '/hse/ai' },
  { name: '风险预测', path: '/hse/ai/risk-predict', component: '#/views/hse/ai/risk-predict.vue', icon: 'ion:trending-up-outline', permission: 'hse:ai:risk-predict', parent_path: '/hse/ai' },
  { name: '设备列表', path: '/hse/iot/device-list', component: '#/views/hse/iot/device-list.vue', icon: 'ion:hardware-chip-outline', permission: 'hse:iot:device-list', parent_path: '/hse/iot' },
  { name: '设备地图', path: '/hse/iot/device-map', component: '#/views/hse/iot/device-map.vue', icon: 'ion:map-outline', permission: 'hse:iot:device-map', parent_path: '/hse/iot' },
  { name: '文件管理', path: '/hse/files', component: '#/views/hse/files/index.vue', icon: 'ion:folder-outline', permission: 'hse:files:list', parent_path: '/hse/files' },
];

async function runMigration() {
  try {
    let count = 0;
    for (const menu of menus) {
      const existing = await pool.query('SELECT id FROM menus WHERE path = $1', [menu.path]);
      if (existing.rows.length === 0) {
        await pool.query(
          'INSERT INTO menus (parent_id, name, path, component, icon, permission, type, sort_order, is_active, hidden, keep_alive) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
          [menu.parent_id, menu.name, menu.path, menu.component, menu.icon, menu.permission, menu.type, menu.sort_order, menu.is_active, menu.hidden, menu.keep_alive]
        );
        count++;
        console.log(`Inserted: ${menu.name} (${menu.path})`);
      }
    }
    
    console.log(`\n一级菜单插入完成: ${count} 条`);
    
    let subCount = 0;
    for (const subMenu of subMenus) {
      const parent = await pool.query('SELECT id FROM menus WHERE path = $1', [subMenu.parent_path]);
      if (parent.rows.length > 0) {
        const existing = await pool.query('SELECT id FROM menus WHERE path = $1', [subMenu.path]);
        if (existing.rows.length === 0) {
          await pool.query(
            'INSERT INTO menus (parent_id, name, path, component, icon, permission, type, sort_order, is_active, hidden, keep_alive) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
            [parent.rows[0].id, subMenu.name, subMenu.path, subMenu.component, subMenu.icon, subMenu.permission, 'menu', 1, true, false, true]
          );
          subCount++;
        }
      }
    }
    
    console.log(`二级菜单插入完成: ${subCount} 条`);
    
    const adminRole = await pool.query('SELECT id FROM roles WHERE code = $1', ['admin']);
    if (adminRole.rows.length > 0) {
      const allMenus = await pool.query('SELECT id FROM menus');
      for (const menu of allMenus.rows) {
        const existing = await pool.query('SELECT id FROM role_menu WHERE role_id = $1 AND menu_id = $2', [adminRole.rows[0].id, menu.id]);
        if (existing.rows.length === 0) {
          await pool.query('INSERT INTO role_menu (role_id, menu_id) VALUES ($1, $2)', [adminRole.rows[0].id, menu.id]);
        }
      }
    }
    
    const menuCount = await pool.query('SELECT count(*) as cnt FROM menus WHERE path LIKE $1', ['/hse/%']);
    const adminPermCount = await pool.query(`SELECT count(*) as cnt FROM role_menu rm JOIN roles r ON rm.role_id = r.id WHERE r.code = 'admin'`);
    
    console.log(`\n========== 迁移完成 ==========`);
    console.log(`HSE 菜单数量: ${menuCount.rows[0].cnt}`);
    console.log(`admin 权限数: ${adminPermCount.rows[0].cnt}`);
    console.log(`=============================`);
    
  } catch (err) {
    console.error('迁移失败:', err.message);
    process.exit(1);
  }
}

runMigration();
INSERT INTO menus (parent_id, name, path, component, icon, permission, type, sort_order, is_active, hidden, keep_alive) VALUES
(0, 'HSE驾驶舱', '/hse/dashboard', '#/views/hse/dashboard/index.vue', 'ion:grid-outline', 'hse:dashboard:view', 'menu', 1, true, false, true),
(0, '事故管理', '/hse/accidents', NULL, 'ion:alert-triangle-outline', 'hse:accidents:view', 'menu', 2, true, false, false),
(0, '隐患管理', '/hse/hazards', NULL, 'ion:alert-circle-outline', 'hse:hazards:view', 'menu', 3, true, false, false),
(0, '应急管理', '/hse/emergency', NULL, 'ion:radio-outline', 'hse:emergency:view', 'menu', 4, true, false, false),
(0, '培训管理', '/hse/training', NULL, 'ion:book-open-outline', 'hse:training:view', 'menu', 5, true, false, false),
(0, '规章制度', '/hse/regulations', NULL, 'ion:document-text-outline', 'hse:regulations:view', 'menu', 6, true, false, false),
(0, '保险管理', '/hse/insurance', NULL, 'ion:shield-outline', 'hse:insurance:view', 'menu', 7, true, false, false),
(0, '现场管理', '/hse/site-mgmt', NULL, 'ion:map-outline', 'hse:site-mgmt:view', 'menu', 8, true, false, false),
(0, '风险管控', '/hse/risk-control', NULL, 'ion:alert-outline', 'hse:risk-control:view', 'menu', 9, true, false, false),
(0, '目标职责', '/hse/objectives', NULL, 'ion:target-outline', 'hse:objectives:view', 'menu', 10, true, false, false),
(0, '人员管理', '/hse/personnel', NULL, 'ion:people-outline', 'hse:personnel:view', 'menu', 11, true, false, false),
(0, '超龄人员', '/hse/over-age-personnel', NULL, 'ion:user-circle-outline', 'hse:over-age-personnel:view', 'menu', 12, true, false, false),
(0, '告警中心', '/hse/alerts', NULL, 'ion:bell-outline', 'hse:alerts:view', 'menu', 13, true, false, false),
(0, '审计中心', '/hse/audit', NULL, 'ion:search-outline', 'hse:audit:view', 'menu', 14, true, false, false),
(0, '工作流', '/hse/workflow', NULL, 'ion:git-compare-outline', 'hse:workflow:view', 'menu', 15, true, false, false),
(0, '通知中心', '/hse/notifications', NULL, 'ion:notifications-outline', 'hse:notifications:view', 'menu', 16, true, false, false),
(0, '事件管理', '/hse/events', NULL, 'ion:calendar-outline', 'hse:events:view', 'menu', 17, true, false, false),
(0, '闭环管理', '/hse/chain', NULL, 'ion:link-outline', 'hse:chain:view', 'menu', 18, true, false, false),
(0, '任务中心', '/hse/tasks', NULL, 'ion:checkbox-outline', 'hse:tasks:view', 'menu', 19, true, false, false),
(0, '数据分析', '/hse/statistics', NULL, 'ion:bar-chart-outline', 'hse:statistics:view', 'menu', 20, true, false, false),
(0, '智能报告', '/hse/report', NULL, 'ion:file-text-outline', 'hse:report:view', 'menu', 21, true, false, false),
(0, 'BI大屏', '/hse/bi', NULL, 'ion:tv-outline', 'hse:bi:view', 'menu', 22, true, false, false),
(0, 'AI辅助', '/hse/ai', NULL, 'ion:sparkles-outline', 'hse:ai:view', 'menu', 23, true, false, false),
(0, 'IoT设备', '/hse/iot', NULL, 'ion:hardware-chip-outline', 'hse:iot:view', 'menu', 24, true, false, false),
(0, '文件管理', '/hse/files', NULL, 'ion:folder-outline', 'hse:files:view', 'menu', 25, true, false, false),
(0, '系统管理', '/system', NULL, 'ion:settings-outline', 'system:view', 'menu', 100, true, false, false)
ON CONFLICT (path) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    permission = EXCLUDED.permission,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active,
    hidden = EXCLUDED.hidden,
    keep_alive = EXCLUDED.keep_alive;

INSERT INTO menus (parent_id, name, path, component, icon, permission, type, sort_order, is_active, hidden, keep_alive) VALUES
((SELECT id FROM menus WHERE path = '/hse/accidents' LIMIT 1), '事故列表', '/hse/accidents', '#/views/accidents/index.vue', 'ion:alert-triangle-outline', 'hse:accidents:list', 'menu', 1, true, false, true),
((SELECT id FROM menus WHERE path = '/hse/hazards' LIMIT 1), '隐患排查', '/hse/hazards', '#/views/hazards/index.vue', 'ion:alert-circle-outline', 'hse:hazards:list', 'menu', 1, true, false, true),
((SELECT id FROM menus WHERE path = '/hse/emergency' LIMIT 1), '应急预案', '/hse/emergency/plans', '#/views/emergency/plans/index.vue', 'ion:file-text-outline', 'hse:emergency:plans', 'menu', 1, true, false, true),
((SELECT id FROM menus WHERE path = '/hse/emergency' LIMIT 1), '应急演练', '/hse/emergency/drills', '#/views/emergency/drills/index.vue', 'ion:activity-outline', 'hse:emergency:drills', 'menu', 2, true, false, true),
((SELECT id FROM menus WHERE path = '/hse/emergency' LIMIT 1), '应急物资', '/hse/emergency/supplies', '#/views/emergency/supplies/index.vue', 'ion:package-outline', 'hse:emergency:supplies', 'menu', 3, true, false, true),
((SELECT id FROM menus WHERE path = '/hse/training' LIMIT 1), '培训管理', '/hse/training', '#/views/training/index.vue', 'ion:book-open-outline', 'hse:training:list', 'menu', 1, true, false, true),
((SELECT id FROM menus WHERE path = '/hse/regulations' LIMIT 1), '规章制度', '/hse/regulations', '#/views/regulations/index.vue', 'ion:document-text-outline', 'hse:regulations:list', 'menu', 1, true, false, true),
((SELECT id FROM menus WHERE path = '/hse/insurance' LIMIT 1), '人员保险', '/hse/insurance/personnel', '#/views/insurance/personnel/index.vue', 'ion:person-outline', 'hse:insurance:personnel', 'menu', 1, true, false, true),
((SELECT id FROM menus WHERE path = '/hse/insurance' LIMIT 1), '车辆保险', '/hse/insurance/vehicle', '#/views/insurance/vehicle/index.vue', 'ion:car-outline', 'hse:insurance:vehicle', 'menu', 2, true, false, true),
((SELECT id FROM menus WHERE path = '/hse/site-mgmt' LIMIT 1), '消防器材', '/hse/site-mgmt/fire', '#/views/site-mgmt/fire/index.vue', 'ion:flame-outline', 'hse:site-mgmt:fire', 'menu', 1, true, false, true),
((SELECT id FROM menus WHERE path = '/hse/site-mgmt' LIMIT 1), '网格化管理', '/hse/site-mgmt/grid', '#/views/site-mgmt/grid/index.vue', 'ion:grid-outline', 'hse:site-mgmt:grid', 'menu', 2, true, false, true),
((SELECT id FROM menus WHERE path = '/hse/site-mgmt' LIMIT 1), '三违管理', '/hse/site-mgmt/violations', '#/views/site-mgmt/violations/index.vue', 'ion:alert-outline', 'hse:site-mgmt:violations', 'menu', 3, true, false, true),
((SELECT id FROM menus WHERE path = '/hse/risk-control' LIMIT 1), '风险管控', '/hse/risk-control', '#/views/risk-control/index.vue', 'ion:alert-outline', 'hse:risk-control:list', 'menu', 1, true, false, true),
((SELECT id FROM menus WHERE path = '/hse/objectives' LIMIT 1), '目标责任书', '/hse/objectives/contracts', '#/views/objectives/contracts/index.vue', 'ion:file-signature-outline', 'hse:objectives:contracts', 'menu', 1, true, false, true),
((SELECT id FROM menus WHERE path = '/hse/objectives' LIMIT 1), '目标预算', '/hse/objectives/budget', '#/views/objectives/budget/index.vue', 'ion:calculator-outline', 'hse:objectives:budget', 'menu', 2, true, false, true),
((SELECT id FROM menus WHERE path = '/hse/objectives' LIMIT 1), '安全机构', '/hse/objectives/org-personnel', '#/views/objectives/org-personnel/index.vue', 'ion:users-outline', 'hse:objectives:org-personnel', 'menu', 3, true, false, true),
((SELECT id FROM menus WHERE path = '/hse/objectives' LIMIT 1), '岗位责任', '/hse/objectives/responsibilities', '#/views/objectives/responsibilities/index.vue', 'ion:clipboard-outline', 'hse:objectives:responsibilities', 'menu', 4, true, false, true),
((SELECT id FROM menus WHERE path = '/hse/personnel' LIMIT 1), '人员列表', '/hse/personnel', '#/views/personnel/index.vue', 'ion:people-outline', 'hse:personnel:list', 'menu', 1, true, false, true),
((SELECT id FROM menus WHERE path = '/hse/over-age-personnel' LIMIT 1), '超龄人员', '/hse/over-age-personnel', '#/views/over-age-personnel/index.vue', 'ion:user-circle-outline', 'hse:over-age-personnel:list', 'menu', 1, true, false, true),
((SELECT id FROM menus WHERE path = '/hse/alerts' LIMIT 1), '告警列表', '/hse/alerts', '#/views/hse/alerts/index.vue', 'ion:bell-outline', 'hse:alerts:list', 'menu', 1, true, false, true),
((SELECT id FROM menus WHERE path = '/hse/alerts' LIMIT 1), '告警统计', '/hse/alerts/statistics', '#/views/hse/alerts/statistics.vue', 'ion:bar-chart-outline', 'hse:alerts:statistics', 'menu', 2, true, false, true),
((SELECT id FROM menus WHERE path = '/hse/alerts' LIMIT 1), '告警详情', '/hse/alerts/detail', '#/views/hse/alerts/detail.vue', 'ion:eye-outline', 'hse:alerts:detail', 'menu', 3, true, false, true),
((SELECT id FROM menus WHERE path = '/hse/audit' LIMIT 1), '审计日志', '/hse/audit', '#/views/hse/audit/index.vue', 'ion:search-outline', 'hse:audit:list', 'menu', 1, true, false, true),
((SELECT id FROM menus WHERE path = '/hse/workflow' LIMIT 1), '流程列表', '/hse/workflow', '#/views/hse/workflow/index.vue', 'ion:git-compare-outline', 'hse:workflow:list', 'menu', 1, true, false, true),
((SELECT id FROM menus WHERE path = '/hse/workflow' LIMIT 1), '流程设计', '/hse/workflow/designer', '#/views/hse/workflow/designer.vue', 'ion:pencil-outline', 'hse:workflow:designer', 'menu', 2, true, false, true),
((SELECT id FROM menus WHERE path = '/hse/workflow' LIMIT 1), '流程实例', '/hse/workflow/instance', '#/views/hse/workflow/instance.vue', 'ion:layers-outline', 'hse:workflow:instance', 'menu', 3, true, false, true),
((SELECT id FROM menus WHERE path = '/hse/workflow' LIMIT 1), '待办任务', '/hse/workflow/task', '#/views/hse/workflow/task.vue', 'ion:checkbox-outline', 'hse:workflow:task', 'menu', 4, true, false, true),
((SELECT id FROM menus WHERE path = '/hse/notifications' LIMIT 1), '通知列表', '/hse/notifications', '#/views/hse/notifications/index.vue', 'ion:notifications-outline', 'hse:notifications:list', 'menu', 1, true, false, true),
((SELECT id FROM menus WHERE path = '/hse/events' LIMIT 1), '事件列表', '/hse/events', '#/views/hse/events/index.vue', 'ion:calendar-outline', 'hse:events:list', 'menu', 1, true, false, true),
((SELECT id FROM menus WHERE path = '/hse/chain' LIMIT 1), '闭环管理', '/hse/chain', '#/views/hse/chain/index.vue', 'ion:link-outline', 'hse:chain:list', 'menu', 1, true, false, true),
((SELECT id FROM menus WHERE path = '/hse/tasks' LIMIT 1), '任务列表', '/hse/tasks', '#/views/hse/tasks/index.vue', 'ion:checkbox-outline', 'hse:tasks:list', 'menu', 1, true, false, true),
((SELECT id FROM menus WHERE path = '/hse/statistics' LIMIT 1), '数据分析', '/hse/statistics', '#/views/hse/statistics/index.vue', 'ion:bar-chart-outline', 'hse:statistics:list', 'menu', 1, true, false, true),
((SELECT id FROM menus WHERE path = '/hse/report' LIMIT 1), '智能报告', '/hse/report', '#/views/hse/report/index.vue', 'ion:file-text-outline', 'hse:report:list', 'menu', 1, true, false, true),
((SELECT id FROM menus WHERE path = '/hse/bi' LIMIT 1), 'BI大屏', '/hse/bi', '#/views/hse/bi/index.vue', 'ion:tv-outline', 'hse:bi:view', 'menu', 1, true, false, true),
((SELECT id FROM menus WHERE path = '/hse/ai' LIMIT 1), '异常检测', '/hse/ai/anomaly-detect', '#/views/hse/ai/anomaly-detect.vue', 'ion:scan-outline', 'hse:ai:anomaly-detect', 'menu', 1, true, false, true),
((SELECT id FROM menus WHERE path = '/hse/ai' LIMIT 1), '根因分析', '/hse/ai/rca', '#/views/hse/ai/rca.vue', 'ion:git-commit-outline', 'hse:ai:rca', 'menu', 2, true, false, true),
((SELECT id FROM menus WHERE path = '/hse/ai' LIMIT 1), '报告生成', '/hse/ai/report-gen', '#/views/hse/ai/report-gen.vue', 'ion:file-text-outline', 'hse:ai:report-gen', 'menu', 3, true, false, true),
((SELECT id FROM menus WHERE path = '/hse/ai' LIMIT 1), '风险预测', '/hse/ai/risk-predict', '#/views/hse/ai/risk-predict.vue', 'ion:trending-up-outline', 'hse:ai:risk-predict', 'menu', 4, true, false, true),
((SELECT id FROM menus WHERE path = '/hse/iot' LIMIT 1), '设备列表', '/hse/iot/device-list', '#/views/hse/iot/device-list.vue', 'ion:hardware-chip-outline', 'hse:iot:device-list', 'menu', 1, true, false, true),
((SELECT id FROM menus WHERE path = '/hse/iot' LIMIT 1), '设备地图', '/hse/iot/device-map', '#/views/hse/iot/device-map.vue', 'ion:map-outline', 'hse:iot:device-map', 'menu', 2, true, false, true),
((SELECT id FROM menus WHERE path = '/hse/files' LIMIT 1), '文件管理', '/hse/files', '#/views/hse/files/index.vue', 'ion:folder-outline', 'hse:files:list', 'menu', 1, true, false, true),
((SELECT id FROM menus WHERE path = '/system' LIMIT 1), '用户管理', '/system/users', '#/views/system/users/index.vue', 'ion:people-outline', 'system:users:view', 'menu', 1, true, false, true),
((SELECT id FROM menus WHERE path = '/system' LIMIT 1), '角色管理', '/system/roles', '#/views/system/roles/index.vue', 'ion:shield-outline', 'system:roles:view', 'menu', 2, true, false, true),
((SELECT id FROM menus WHERE path = '/system' LIMIT 1), '菜单管理', '/system/menus', '#/views/system/menus/index.vue', 'ion:list-outline', 'system:menus:view', 'menu', 3, true, false, true),
((SELECT id FROM menus WHERE path = '/system' LIMIT 1), '系统配置', '/system/config', '#/views/system/config/index.vue', 'ion:settings-outline', 'system:config:view', 'menu', 4, true, false, true)
ON CONFLICT (path) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    permission = EXCLUDED.permission,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active,
    hidden = EXCLUDED.hidden,
    keep_alive = EXCLUDED.keep_alive;

INSERT INTO role_menu (role_id, menu_id)
SELECT r.id, m.id
FROM roles r
CROSS JOIN menus m
WHERE r.code = 'admin'
ON CONFLICT (role_id, menu_id) DO NOTHING;

INSERT INTO role_menu (role_id, menu_id)
SELECT r.id, m.id
FROM roles r
JOIN menus m ON m.permission IN (
    'hse:dashboard:view',
    'hse:accidents:view', 'hse:accidents:list',
    'hse:hazards:view', 'hse:hazards:list',
    'hse:emergency:view', 'hse:emergency:plans', 'hse:emergency:drills', 'hse:emergency:supplies',
    'hse:training:view', 'hse:training:list',
    'hse:regulations:view', 'hse:regulations:list',
    'hse:insurance:view', 'hse:insurance:personnel', 'hse:insurance:vehicle',
    'hse:site-mgmt:view', 'hse:site-mgmt:fire', 'hse:site-mgmt:grid', 'hse:site-mgmt:violations',
    'hse:risk-control:view', 'hse:risk-control:list',
    'hse:objectives:view', 'hse:objectives:contracts', 'hse:objectives:budget', 'hse:objectives:org-personnel', 'hse:objectives:responsibilities',
    'hse:personnel:view', 'hse:personnel:list',
    'hse:over-age-personnel:view', 'hse:over-age-personnel:list',
    'hse:alerts:view', 'hse:alerts:list', 'hse:alerts:statistics', 'hse:alerts:detail',
    'hse:audit:view', 'hse:audit:list',
    'hse:workflow:view', 'hse:workflow:list', 'hse:workflow:designer', 'hse:workflow:instance', 'hse:workflow:task',
    'hse:notifications:view', 'hse:notifications:list',
    'hse:events:view', 'hse:events:list',
    'hse:chain:view', 'hse:chain:list',
    'hse:tasks:view', 'hse:tasks:list',
    'hse:statistics:view', 'hse:statistics:list',
    'hse:report:view', 'hse:report:list',
    'hse:bi:view',
    'hse:ai:view', 'hse:ai:anomaly-detect', 'hse:ai:rca', 'hse:ai:report-gen', 'hse:ai:risk-predict',
    'hse:iot:view', 'hse:iot:device-list', 'hse:iot:device-map',
    'hse:files:view', 'hse:files:list',
    'system:view', 'system:users:view', 'system:roles:view', 'system:menus:view', 'system:config:view'
)
WHERE r.code = 'manager'
ON CONFLICT (role_id, menu_id) DO NOTHING;

INSERT INTO role_menu (role_id, menu_id)
SELECT r.id, m.id
FROM roles r
JOIN menus m ON m.permission IN (
    'hse:dashboard:view',
    'hse:accidents:view', 'hse:accidents:list',
    'hse:hazards:view', 'hse:hazards:list',
    'hse:emergency:view', 'hse:emergency:plans',
    'hse:training:view', 'hse:training:list',
    'hse:regulations:view', 'hse:regulations:list',
    'hse:insurance:view', 'hse:insurance:personnel', 'hse:insurance:vehicle',
    'hse:site-mgmt:view', 'hse:site-mgmt:fire', 'hse:site-mgmt:grid', 'hse:site-mgmt:violations',
    'hse:risk-control:view', 'hse:risk-control:list',
    'hse:objectives:view',
    'hse:personnel:view', 'hse:personnel:list',
    'hse:over-age-personnel:view', 'hse:over-age-personnel:list',
    'hse:alerts:view', 'hse:alerts:list', 'hse:alerts:statistics',
    'hse:audit:view', 'hse:audit:list',
    'hse:notifications:view', 'hse:notifications:list',
    'hse:events:view', 'hse:events:list',
    'hse:chain:view', 'hse:chain:list',
    'hse:tasks:view', 'hse:tasks:list',
    'hse:statistics:view', 'hse:statistics:list',
    'hse:report:view', 'hse:report:list',
    'hse:bi:view',
    'hse:ai:view',
    'hse:iot:view',
    'hse:files:view', 'hse:files:list'
)
WHERE r.code = 'viewer'
ON CONFLICT (role_id, menu_id) DO NOTHING;

DO $$
DECLARE
    cnt INTEGER;
BEGIN
    SELECT count(*) INTO cnt FROM menus WHERE path LIKE '/hse/%';
    RAISE NOTICE '========== HSE Menus Migration ==========';
    RAISE NOTICE 'HSE 菜单数量: %', cnt;
    SELECT count(*) INTO cnt FROM role_menu rm JOIN roles r ON rm.role_id = r.id WHERE r.code = 'admin';
    RAISE NOTICE 'admin 权限数: %', cnt;
    SELECT count(*) INTO cnt FROM role_menu rm JOIN roles r ON rm.role_id = r.id WHERE r.code = 'manager';
    RAISE NOTICE 'manager 权限数: %', cnt;
    SELECT count(*) INTO cnt FROM role_menu rm JOIN roles r ON rm.role_id = r.id WHERE r.code = 'viewer';
    RAISE NOTICE 'viewer 权限数: %', cnt;
    RAISE NOTICE '==========================================';
END $$;
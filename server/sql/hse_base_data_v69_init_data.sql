-- ============================================================
-- HSE Sprint6.0 基础数据底座初始化数据脚本
-- 版本: v69
-- 内容: 组织扩展 + 17个标准岗位 + 16个别名 + 17条责任配置 + 组织映射规则 + 岗位映射规则
-- 方式: INSERT ... WHERE NOT EXISTS（增量安全，可重复执行）
-- 执行: psql -U hse_user -d hse_db -f hse_base_data_v69_init_data.sql
-- ============================================================

BEGIN;

-- ============================================================
-- 一、组织扩展（增加市政绿化作业中心）
-- ============================================================

WITH company AS (SELECT id, org_path FROM hse_org_unit WHERE org_code = 'COMPANY-001')
INSERT INTO hse_org_unit (parent_id, org_name, org_type, org_code, org_path, level, sort_order, status, description)
SELECT c.id, '市政绿化作业中心', 'center', 'CENTER-LH', c.org_path || '/市政绿化作业中心', 2, 7, 'active', '市政绿化作业中心'
FROM company c
WHERE NOT EXISTS (SELECT 1 FROM hse_org_unit WHERE org_code = 'CENTER-LH');

-- ============================================================
-- 二、17个标准岗位初始化（position表）
-- ============================================================

-- 管理岗位（6个）
INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, org_type, responsibility_type, status, sort_order, is_deleted)
SELECT 'POS-GM', '项目总经理', '管理', 'high', true, 'company', 'grid_leader', 'active', 1, false
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-GM');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, org_type, responsibility_type, status, sort_order, is_deleted)
SELECT 'POS-DEPT-MGR', '部门经理', '管理', 'high', true, 'department', 'grid_leader', 'active', 2, false
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-DEPT-MGR');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, org_type, responsibility_type, status, sort_order, is_deleted)
SELECT 'POS-HW-MGR', '环卫作业中心经理', '管理', 'high', true, 'center', 'grid_leader', 'active', 3, false
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-HW-MGR');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, org_type, responsibility_type, status, sort_order, is_deleted)
SELECT 'POS-HW-DEPMGR', '环卫作业中心副经理（人工）', '管理', 'high', true, 'center', 'production_manager', 'active', 4, false
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-HW-DEPMGR');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, org_type, responsibility_type, status, sort_order, is_deleted)
SELECT 'POS-HW-AREA-MGR', '环卫作业中心片区长', '管理', 'high', true, 'center', 'production_manager', 'active', 5, false
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-HW-AREA-MGR');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, org_type, responsibility_type, status, sort_order, is_deleted)
SELECT 'POS-TOWN-MGR', '乡镇作业中心经理', '管理', 'high', true, 'town_center', 'grid_leader', 'active', 6, false
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-TOWN-MGR');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, org_type, responsibility_type, status, sort_order, is_deleted)
SELECT 'POS-ADMIN', '管理员', '管理', 'medium', true, 'town_center', 'grid_leader', 'active', 7, false
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-ADMIN');

-- 作业岗位（3个）
INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, org_type, responsibility_type, status, sort_order, is_deleted)
SELECT 'POS-CLEANER', '保洁员', '生产', 'medium', false, 'town_center', 'none', 'active', 20, false
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-CLEANER');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, org_type, responsibility_type, status, sort_order, is_deleted)
SELECT 'POS-BARREL', '挂桶员', '生产', 'high', true, 'town_center', 'none', 'active', 21, false
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-BARREL');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, org_type, responsibility_type, status, sort_order, is_deleted)
SELECT 'POS-COLLECT-HELPER', '垃圾收运辅助工', '生产', 'high', true, 'town_center', 'none', 'active', 22, false
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-COLLECT-HELPER');

-- 驾驶员岗位（3个）
INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, org_type, responsibility_type, status, sort_order, is_deleted)
SELECT 'POS-DRIVER-TRANSFER', '垃圾转运车驾驶员', '生产', 'critical', true, 'center', 'none', 'active', 30, false
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-DRIVER-TRANSFER');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, org_type, responsibility_type, status, sort_order, is_deleted)
SELECT 'POS-DRIVER-COLLECT', '垃圾收运车驾驶员', '生产', 'critical', true, 'town_center', 'none', 'active', 31, false
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-DRIVER-COLLECT');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, org_type, responsibility_type, status, sort_order, is_deleted)
SELECT 'POS-DRIVER-SUCTION', '吸污车驾驶员', '生产', 'critical', true, 'center', 'none', 'active', 32, false
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-DRIVER-SUCTION');

-- 站管岗位（1个）
INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, org_type, responsibility_type, status, sort_order, is_deleted)
SELECT 'POS-STATION', '转运站操作员', '生产', 'high', true, 'town_center', 'none', 'active', 40, false
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-STATION');

-- 职能岗位（4个）
INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, org_type, responsibility_type, status, sort_order, is_deleted)
SELECT 'POS-SAFETY-MGR', '安全管理员', '技术', 'high', true, 'department', 'none', 'active', 50, false
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-SAFETY-MGR');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, org_type, responsibility_type, status, sort_order, is_deleted)
SELECT 'POS-CLERK', '文员', '技术', 'low', false, 'department', 'none', 'active', 51, false
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-CLERK');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, org_type, responsibility_type, status, sort_order, is_deleted)
SELECT 'POS-ACCOUNTANT', '会计', '技术', 'low', false, 'department', 'none', 'active', 52, false
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-ACCOUNTANT');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, org_type, responsibility_type, status, sort_order, is_deleted)
SELECT 'POS-HR', '人事专员', '技术', 'low', false, 'department', 'none', 'active', 53, false
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-HR');

-- ============================================================
-- 三、16个岗位别名初始化（hse_position_alias）
-- ============================================================

-- 乡镇作业中心经理别名
INSERT INTO hse_position_alias (position_id, position_name, alias_name, alias_source, sort_order, status)
SELECT p.id, p.name, '乡镇主管', 'roster', 1, 'active'
FROM position p WHERE p.position_code = 'POS-TOWN-MGR'
  AND NOT EXISTS (SELECT 1 FROM hse_position_alias pa WHERE pa.position_id = p.id AND pa.alias_name = '乡镇主管');

INSERT INTO hse_position_alias (position_id, position_name, alias_name, alias_source, sort_order, status)
SELECT p.id, p.name, '人工片区长', 'roster', 2, 'active'
FROM position p WHERE p.position_code = 'POS-TOWN-MGR'
  AND NOT EXISTS (SELECT 1 FROM hse_position_alias pa WHERE pa.position_id = p.id AND pa.alias_name = '人工片区长');

-- 管理员别名
INSERT INTO hse_position_alias (position_id, position_name, alias_name, alias_source, sort_order, status)
SELECT p.id, p.name, '人工班长', 'roster', 1, 'active'
FROM position p WHERE p.position_code = 'POS-ADMIN'
  AND NOT EXISTS (SELECT 1 FROM hse_position_alias pa WHERE pa.position_id = p.id AND pa.alias_name = '人工班长');

-- 环卫作业中心片区长别名
INSERT INTO hse_position_alias (position_id, position_name, alias_name, alias_source, sort_order, status)
SELECT p.id, p.name, '片区长', 'roster', 1, 'active'
FROM position p WHERE p.position_code = 'POS-HW-AREA-MGR'
  AND NOT EXISTS (SELECT 1 FROM hse_position_alias pa WHERE pa.position_id = p.id AND pa.alias_name = '片区长');

-- 环卫作业中心副经理（人工）别名
INSERT INTO hse_position_alias (position_id, position_name, alias_name, alias_source, sort_order, status)
SELECT p.id, p.name, '生产作业中心副经理（人工）', 'roster', 1, 'active'
FROM position p WHERE p.position_code = 'POS-HW-DEPMGR'
  AND NOT EXISTS (SELECT 1 FROM hse_position_alias pa WHERE pa.position_id = p.id AND pa.alias_name = '生产作业中心副经理（人工）');

INSERT INTO hse_position_alias (position_id, position_name, alias_name, alias_source, sort_order, status)
SELECT p.id, p.name, '环卫中心副经理', 'roster', 2, 'active'
FROM position p WHERE p.position_code = 'POS-HW-DEPMGR'
  AND NOT EXISTS (SELECT 1 FROM hse_position_alias pa WHERE pa.position_id = p.id AND pa.alias_name = '环卫中心副经理');

-- 转运站操作员别名
INSERT INTO hse_position_alias (position_id, position_name, alias_name, alias_source, sort_order, status)
SELECT p.id, p.name, '中转站管理员', 'roster', 1, 'active'
FROM position p WHERE p.position_code = 'POS-STATION'
  AND NOT EXISTS (SELECT 1 FROM hse_position_alias pa WHERE pa.position_id = p.id AND pa.alias_name = '中转站管理员');

INSERT INTO hse_position_alias (position_id, position_name, alias_name, alias_source, sort_order, status)
SELECT p.id, p.name, '转运站管理员', 'roster', 2, 'active'
FROM position p WHERE p.position_code = 'POS-STATION'
  AND NOT EXISTS (SELECT 1 FROM hse_position_alias pa WHERE pa.position_id = p.id AND pa.alias_name = '转运站管理员');

-- 安全管理员别名
INSERT INTO hse_position_alias (position_id, position_name, alias_name, alias_source, sort_order, status)
SELECT p.id, p.name, '安环专员', 'roster', 1, 'active'
FROM position p WHERE p.position_code = 'POS-SAFETY-MGR'
  AND NOT EXISTS (SELECT 1 FROM hse_position_alias pa WHERE pa.position_id = p.id AND pa.alias_name = '安环专员');

INSERT INTO hse_position_alias (position_id, position_name, alias_name, alias_source, sort_order, status)
SELECT p.id, p.name, '安环副经理', 'roster', 2, 'active'
FROM position p WHERE p.position_code = 'POS-SAFETY-MGR'
  AND NOT EXISTS (SELECT 1 FROM hse_position_alias pa WHERE pa.position_id = p.id AND pa.alias_name = '安环副经理');

-- 文员别名
INSERT INTO hse_position_alias (position_id, position_name, alias_name, alias_source, sort_order, status)
SELECT p.id, p.name, '行政综合主管', 'roster', 1, 'active'
FROM position p WHERE p.position_code = 'POS-CLERK'
  AND NOT EXISTS (SELECT 1 FROM hse_position_alias pa WHERE pa.position_id = p.id AND pa.alias_name = '行政综合主管');

INSERT INTO hse_position_alias (position_id, position_name, alias_name, alias_source, sort_order, status)
SELECT p.id, p.name, '库管专员', 'roster', 2, 'active'
FROM position p WHERE p.position_code = 'POS-CLERK'
  AND NOT EXISTS (SELECT 1 FROM hse_position_alias pa WHERE pa.position_id = p.id AND pa.alias_name = '库管专员');

-- 保洁员别名
INSERT INTO hse_position_alias (position_id, position_name, alias_name, alias_source, sort_order, status)
SELECT p.id, p.name, '乡镇保洁员', 'roster', 1, 'active'
FROM position p WHERE p.position_code = 'POS-CLEANER'
  AND NOT EXISTS (SELECT 1 FROM hse_position_alias pa WHERE pa.position_id = p.id AND pa.alias_name = '乡镇保洁员');

-- 垃圾收运车驾驶员别名
INSERT INTO hse_position_alias (position_id, position_name, alias_name, alias_source, sort_order, status)
SELECT p.id, p.name, '司机', 'roster', 1, 'active'
FROM position p WHERE p.position_code = 'POS-DRIVER-COLLECT'
  AND NOT EXISTS (SELECT 1 FROM hse_position_alias pa WHERE pa.position_id = p.id AND pa.alias_name = '司机');

-- 吸污车驾驶员别名
INSERT INTO hse_position_alias (position_id, position_name, alias_name, alias_source, sort_order, status)
SELECT p.id, p.name, '吸污车司机', 'roster', 1, 'active'
FROM position p WHERE p.position_code = 'POS-DRIVER-SUCTION'
  AND NOT EXISTS (SELECT 1 FROM hse_position_alias pa WHERE pa.position_id = p.id AND pa.alias_name = '吸污车司机');

-- 部门经理别名
INSERT INTO hse_position_alias (position_id, position_name, alias_name, alias_source, sort_order, status)
SELECT p.id, p.name, '环卫中心经理', 'roster', 1, 'active'
FROM position p WHERE p.position_code = 'POS-HW-MGR'
  AND NOT EXISTS (SELECT 1 FROM hse_position_alias pa WHERE pa.position_id = p.id AND pa.alias_name = '环卫中心经理');

-- ============================================================
-- 四、17条责任配置初始化（hse_responsibility_config）
-- ============================================================

-- 网格长岗位（4个）- is_configurable = FALSE
INSERT INTO hse_responsibility_config (position_id, position_name, default_responsibility_type, default_grid_level, default_grid_role, default_inspection_frequency, is_configurable, sort_order, status)
SELECT p.id, p.name, 'grid_leader', 'grid1', '总网格长', '1次/3天', false, 1, 'active'
FROM position p WHERE p.position_code = 'POS-GM'
  AND NOT EXISTS (SELECT 1 FROM hse_responsibility_config rc WHERE rc.position_id = p.id);

INSERT INTO hse_responsibility_config (position_id, position_name, default_responsibility_type, default_grid_level, default_grid_role, default_inspection_frequency, is_configurable, sort_order, status)
SELECT p.id, p.name, 'grid_leader', 'grid2', '一级网格长', '1次/2天', false, 2, 'active'
FROM position p WHERE p.position_code = 'POS-DEPT-MGR'
  AND NOT EXISTS (SELECT 1 FROM hse_responsibility_config rc WHERE rc.position_id = p.id);

INSERT INTO hse_responsibility_config (position_id, position_name, default_responsibility_type, default_grid_level, default_grid_role, default_inspection_frequency, is_configurable, sort_order, status)
SELECT p.id, p.name, 'grid_leader', 'grid3', '二级网格长', '1次/1天', false, 3, 'active'
FROM position p WHERE p.position_code = 'POS-TOWN-MGR'
  AND NOT EXISTS (SELECT 1 FROM hse_responsibility_config rc WHERE rc.position_id = p.id);

INSERT INTO hse_responsibility_config (position_id, position_name, default_responsibility_type, default_grid_level, default_grid_role, default_inspection_frequency, is_configurable, sort_order, status)
SELECT p.id, p.name, 'grid_leader', 'grid4', '三级网格长', '1次/1天', false, 4, 'active'
FROM position p WHERE p.position_code = 'POS-ADMIN'
  AND NOT EXISTS (SELECT 1 FROM hse_responsibility_config rc WHERE rc.position_id = p.id);

-- 生产管理责任人岗位（2个）- is_configurable = TRUE
INSERT INTO hse_responsibility_config (position_id, position_name, default_responsibility_type, default_grid_level, default_grid_role, default_inspection_frequency, is_configurable, sort_order, status)
SELECT p.id, p.name, 'production_manager', NULL, NULL, NULL, true, 5, 'active'
FROM position p WHERE p.position_code = 'POS-HW-DEPMGR'
  AND NOT EXISTS (SELECT 1 FROM hse_responsibility_config rc WHERE rc.position_id = p.id);

INSERT INTO hse_responsibility_config (position_id, position_name, default_responsibility_type, default_grid_level, default_grid_role, default_inspection_frequency, is_configurable, sort_order, status)
SELECT p.id, p.name, 'production_manager', NULL, NULL, NULL, true, 6, 'active'
FROM position p WHERE p.position_code = 'POS-HW-AREA-MGR'
  AND NOT EXISTS (SELECT 1 FROM hse_responsibility_config rc WHERE rc.position_id = p.id);

-- 非责任岗位（11个）- is_configurable = FALSE
INSERT INTO hse_responsibility_config (position_id, position_name, default_responsibility_type, default_grid_level, default_grid_role, default_inspection_frequency, is_configurable, sort_order, status)
SELECT p.id, p.name, 'none', NULL, NULL, NULL, false, 20, 'active'
FROM position p WHERE p.position_code = 'POS-HW-MGR'
  AND NOT EXISTS (SELECT 1 FROM hse_responsibility_config rc WHERE rc.position_id = p.id);

INSERT INTO hse_responsibility_config (position_id, position_name, default_responsibility_type, default_grid_level, default_grid_role, default_inspection_frequency, is_configurable, sort_order, status)
SELECT p.id, p.name, 'none', NULL, NULL, NULL, false, 21, 'active'
FROM position p WHERE p.position_code = 'POS-CLEANER'
  AND NOT EXISTS (SELECT 1 FROM hse_responsibility_config rc WHERE rc.position_id = p.id);

INSERT INTO hse_responsibility_config (position_id, position_name, default_responsibility_type, default_grid_level, default_grid_role, default_inspection_frequency, is_configurable, sort_order, status)
SELECT p.id, p.name, 'none', NULL, NULL, NULL, false, 22, 'active'
FROM position p WHERE p.position_code = 'POS-BARREL'
  AND NOT EXISTS (SELECT 1 FROM hse_responsibility_config rc WHERE rc.position_id = p.id);

INSERT INTO hse_responsibility_config (position_id, position_name, default_responsibility_type, default_grid_level, default_grid_role, default_inspection_frequency, is_configurable, sort_order, status)
SELECT p.id, p.name, 'none', NULL, NULL, NULL, false, 23, 'active'
FROM position p WHERE p.position_code = 'POS-COLLECT-HELPER'
  AND NOT EXISTS (SELECT 1 FROM hse_responsibility_config rc WHERE rc.position_id = p.id);

INSERT INTO hse_responsibility_config (position_id, position_name, default_responsibility_type, default_grid_level, default_grid_role, default_inspection_frequency, is_configurable, sort_order, status)
SELECT p.id, p.name, 'none', NULL, NULL, NULL, false, 30, 'active'
FROM position p WHERE p.position_code = 'POS-DRIVER-TRANSFER'
  AND NOT EXISTS (SELECT 1 FROM hse_responsibility_config rc WHERE rc.position_id = p.id);

INSERT INTO hse_responsibility_config (position_id, position_name, default_responsibility_type, default_grid_level, default_grid_role, default_inspection_frequency, is_configurable, sort_order, status)
SELECT p.id, p.name, 'none', NULL, NULL, NULL, false, 31, 'active'
FROM position p WHERE p.position_code = 'POS-DRIVER-COLLECT'
  AND NOT EXISTS (SELECT 1 FROM hse_responsibility_config rc WHERE rc.position_id = p.id);

INSERT INTO hse_responsibility_config (position_id, position_name, default_responsibility_type, default_grid_level, default_grid_role, default_inspection_frequency, is_configurable, sort_order, status)
SELECT p.id, p.name, 'none', NULL, NULL, NULL, false, 32, 'active'
FROM position p WHERE p.position_code = 'POS-DRIVER-SUCTION'
  AND NOT EXISTS (SELECT 1 FROM hse_responsibility_config rc WHERE rc.position_id = p.id);

INSERT INTO hse_responsibility_config (position_id, position_name, default_responsibility_type, default_grid_level, default_grid_role, default_inspection_frequency, is_configurable, sort_order, status)
SELECT p.id, p.name, 'none', NULL, NULL, NULL, false, 40, 'active'
FROM position p WHERE p.position_code = 'POS-STATION'
  AND NOT EXISTS (SELECT 1 FROM hse_responsibility_config rc WHERE rc.position_id = p.id);

INSERT INTO hse_responsibility_config (position_id, position_name, default_responsibility_type, default_grid_level, default_grid_role, default_inspection_frequency, is_configurable, sort_order, status)
SELECT p.id, p.name, 'none', NULL, NULL, NULL, false, 50, 'active'
FROM position p WHERE p.position_code = 'POS-SAFETY-MGR'
  AND NOT EXISTS (SELECT 1 FROM hse_responsibility_config rc WHERE rc.position_id = p.id);

INSERT INTO hse_responsibility_config (position_id, position_name, default_responsibility_type, default_grid_level, default_grid_role, default_inspection_frequency, is_configurable, sort_order, status)
SELECT p.id, p.name, 'none', NULL, NULL, NULL, false, 51, 'active'
FROM position p WHERE p.position_code = 'POS-CLERK'
  AND NOT EXISTS (SELECT 1 FROM hse_responsibility_config rc WHERE rc.position_id = p.id);

INSERT INTO hse_responsibility_config (position_id, position_name, default_responsibility_type, default_grid_level, default_grid_role, default_inspection_frequency, is_configurable, sort_order, status)
SELECT p.id, p.name, 'none', NULL, NULL, NULL, false, 52, 'active'
FROM position p WHERE p.position_code = 'POS-ACCOUNTANT'
  AND NOT EXISTS (SELECT 1 FROM hse_responsibility_config rc WHERE rc.position_id = p.id);

INSERT INTO hse_responsibility_config (position_id, position_name, default_responsibility_type, default_grid_level, default_grid_role, default_inspection_frequency, is_configurable, sort_order, status)
SELECT p.id, p.name, 'none', NULL, NULL, NULL, false, 53, 'active'
FROM position p WHERE p.position_code = 'POS-HR'
  AND NOT EXISTS (SELECT 1 FROM hse_responsibility_config rc WHERE rc.position_id = p.id);

-- ============================================================
-- 五、规则版本初始化
-- ============================================================

INSERT INTO employee_import_mapping_rule_version (version, version_desc, effective_date, status, created_by)
SELECT 'v1.0', 'Sprint6.0初始版本', CURRENT_DATE, 'active', 'system'
WHERE NOT EXISTS (SELECT 1 FROM employee_import_mapping_rule_version WHERE version = 'v1.0');

-- ============================================================
-- 六、组织映射规则初始化（employee_import_mapping_rule）
-- ============================================================

-- 公司层
INSERT INTO employee_import_mapping_rule (source_value, source_type, target_type, target_id, target_name, rule_version, match_priority, status)
SELECT '宁津项目公司', 'excel_department', 'org_unit', ou.id, ou.org_name, 'v1.0', 100, 'active'
FROM hse_org_unit ou WHERE ou.org_code = 'COMPANY-001'
  AND NOT EXISTS (SELECT 1 FROM employee_import_mapping_rule r WHERE r.source_value = '宁津项目公司' AND r.rule_version = 'v1.0');

-- 职能部门
INSERT INTO employee_import_mapping_rule (source_value, source_type, target_type, target_id, target_name, rule_version, match_priority, status)
SELECT '项目管理层', 'excel_department', 'org_unit', ou.id, ou.org_name, 'v1.0', 90, 'active'
FROM hse_org_unit ou WHERE ou.org_code = 'DEPT-MANAGE'
  AND NOT EXISTS (SELECT 1 FROM employee_import_mapping_rule r WHERE r.source_value = '项目管理层' AND r.rule_version = 'v1.0');

INSERT INTO employee_import_mapping_rule (source_value, source_type, target_type, target_id, target_name, rule_version, match_priority, status)
SELECT '人力综合部', 'excel_department', 'org_unit', ou.id, ou.org_name, 'v1.0', 90, 'active'
FROM hse_org_unit ou WHERE ou.org_code = 'DEPT-HR'
  AND NOT EXISTS (SELECT 1 FROM employee_import_mapping_rule r WHERE r.source_value = '人力综合部' AND r.rule_version = 'v1.0');

INSERT INTO employee_import_mapping_rule (source_value, source_type, target_type, target_id, target_name, rule_version, match_priority, status)
SELECT '生产管理部', 'excel_department', 'org_unit', ou.id, ou.org_name, 'v1.0', 90, 'active'
FROM hse_org_unit ou WHERE ou.org_code = 'DEPT-PROD'
  AND NOT EXISTS (SELECT 1 FROM employee_import_mapping_rule r WHERE r.source_value = '生产管理部' AND r.rule_version = 'v1.0');

INSERT INTO employee_import_mapping_rule (source_value, source_type, target_type, target_id, target_name, rule_version, match_priority, status)
SELECT '安环品质部', 'excel_department', 'org_unit', ou.id, ou.org_name, 'v1.0', 90, 'active'
FROM hse_org_unit ou WHERE ou.org_code = 'DEPT-SAFETY'
  AND NOT EXISTS (SELECT 1 FROM employee_import_mapping_rule r WHERE r.source_value = '安环品质部' AND r.rule_version = 'v1.0');

INSERT INTO employee_import_mapping_rule (source_value, source_type, target_type, target_id, target_name, rule_version, match_priority, status)
SELECT '财务部', 'excel_department', 'org_unit', ou.id, ou.org_name, 'v1.0', 90, 'active'
FROM hse_org_unit ou WHERE ou.org_code = 'DEPT-FIN'
  AND NOT EXISTS (SELECT 1 FROM employee_import_mapping_rule r WHERE r.source_value = '财务部' AND r.rule_version = 'v1.0');

-- 作业中心
INSERT INTO employee_import_mapping_rule (source_value, source_type, target_type, target_id, target_name, rule_version, match_priority, status)
SELECT '环卫作业中心', 'excel_department', 'org_unit', ou.id, ou.org_name, 'v1.0', 80, 'active'
FROM hse_org_unit ou WHERE ou.org_code = 'CENTER-HW'
  AND NOT EXISTS (SELECT 1 FROM employee_import_mapping_rule r WHERE r.source_value = '环卫作业中心' AND r.rule_version = 'v1.0');

INSERT INTO employee_import_mapping_rule (source_value, source_type, target_type, target_id, target_name, rule_version, match_priority, status)
SELECT '市政绿化作业中心', 'excel_department', 'org_unit', ou.id, ou.org_name, 'v1.0', 80, 'active'
FROM hse_org_unit ou WHERE ou.org_code = 'CENTER-LH'
  AND NOT EXISTS (SELECT 1 FROM employee_import_mapping_rule r WHERE r.source_value = '市政绿化作业中心' AND r.rule_version = 'v1.0');

-- 车队（中心直管）
INSERT INTO employee_import_mapping_rule (source_value, source_type, target_type, target_id, target_name, rule_version, match_priority, status)
SELECT '车队', 'excel_department', 'org_unit', ou.id, ou.org_name, 'v1.0', 75, 'active'
FROM hse_org_unit ou WHERE ou.org_code = 'CENTER-HW'
  AND NOT EXISTS (SELECT 1 FROM employee_import_mapping_rule r WHERE r.source_value = '车队' AND r.rule_version = 'v1.0');

-- ============================================================
-- 七、岗位映射规则初始化（employee_position_mapping_rule）
-- ============================================================

-- 管理岗位映射
INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, target_position_alias, grid_level, grid_role, rule_version, match_priority, status)
SELECT '项目总经理', p.id, p.name, NULL, 'grid1', '总网格长', 'v1.0', 100, 'active'
FROM position p WHERE p.position_code = 'POS-GM'
  AND NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule r WHERE r.source_position = '项目总经理' AND r.rule_version = 'v1.0');

INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, target_position_alias, grid_level, grid_role, rule_version, match_priority, status)
SELECT '部门经理', p.id, p.name, NULL, 'grid2', '一级网格长', 'v1.0', 90, 'active'
FROM position p WHERE p.position_code = 'POS-DEPT-MGR'
  AND NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule r WHERE r.source_position = '部门经理' AND r.rule_version = 'v1.0');

INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, target_position_alias, grid_level, grid_role, rule_version, match_priority, status)
SELECT '乡镇作业中心经理', p.id, p.name, NULL, 'grid3', '二级网格长', 'v1.0', 80, 'active'
FROM position p WHERE p.position_code = 'POS-TOWN-MGR'
  AND NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule r WHERE r.source_position = '乡镇作业中心经理' AND r.rule_version = 'v1.0');

INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, target_position_alias, grid_level, grid_role, rule_version, match_priority, status)
SELECT '乡镇主管', p.id, p.name, '乡镇主管', 'grid3', '二级网格长', 'v1.0', 79, 'active'
FROM position p WHERE p.position_code = 'POS-TOWN-MGR'
  AND NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule r WHERE r.source_position = '乡镇主管' AND r.rule_version = 'v1.0');

INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, target_position_alias, grid_level, grid_role, rule_version, match_priority, status)
SELECT '人工片区长', p.id, p.name, '人工片区长', 'grid3', '二级网格长', 'v1.0', 78, 'active'
FROM position p WHERE p.position_code = 'POS-TOWN-MGR'
  AND NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule r WHERE r.source_position = '人工片区长' AND r.rule_version = 'v1.0');

INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, target_position_alias, grid_level, grid_role, rule_version, match_priority, status)
SELECT '管理员', p.id, p.name, NULL, 'grid4', '三级网格长', 'v1.0', 70, 'active'
FROM position p WHERE p.position_code = 'POS-ADMIN'
  AND NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule r WHERE r.source_position = '管理员' AND r.rule_version = 'v1.0');

INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, target_position_alias, grid_level, grid_role, rule_version, match_priority, status)
SELECT '人工班长', p.id, p.name, '人工班长', 'grid4', '三级网格长', 'v1.0', 69, 'active'
FROM position p WHERE p.position_code = 'POS-ADMIN'
  AND NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule r WHERE r.source_position = '人工班长' AND r.rule_version = 'v1.0');

-- 生产管理岗位映射
INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, target_position_alias, grid_level, grid_role, rule_version, match_priority, status)
SELECT '环卫作业中心副经理（人工）', p.id, p.name, NULL, NULL, NULL, 'v1.0', 60, 'active'
FROM position p WHERE p.position_code = 'POS-HW-DEPMGR'
  AND NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule r WHERE r.source_position = '环卫作业中心副经理（人工）' AND r.rule_version = 'v1.0');

INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, target_position_alias, grid_level, grid_role, rule_version, match_priority, status)
SELECT '生产作业中心副经理（人工）', p.id, p.name, '生产作业中心副经理（人工）', NULL, NULL, 'v1.0', 59, 'active'
FROM position p WHERE p.position_code = 'POS-HW-DEPMGR'
  AND NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule r WHERE r.source_position = '生产作业中心副经理（人工）' AND r.rule_version = 'v1.0');

INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, target_position_alias, grid_level, grid_role, rule_version, match_priority, status)
SELECT '环卫作业中心片区长', p.id, p.name, NULL, NULL, NULL, 'v1.0', 58, 'active'
FROM position p WHERE p.position_code = 'POS-HW-AREA-MGR'
  AND NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule r WHERE r.source_position = '环卫作业中心片区长' AND r.rule_version = 'v1.0');

INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, target_position_alias, grid_level, grid_role, rule_version, match_priority, status)
SELECT '片区长', p.id, p.name, '片区长', NULL, NULL, 'v1.0', 57, 'active'
FROM position p WHERE p.position_code = 'POS-HW-AREA-MGR'
  AND NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule r WHERE r.source_position = '片区长' AND r.rule_version = 'v1.0');

-- 作业岗位映射
INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, target_position_alias, grid_level, grid_role, rule_version, match_priority, status)
SELECT '保洁员', p.id, p.name, NULL, NULL, NULL, 'v1.0', 40, 'active'
FROM position p WHERE p.position_code = 'POS-CLEANER'
  AND NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule r WHERE r.source_position = '保洁员' AND r.rule_version = 'v1.0');

INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, target_position_alias, grid_level, grid_role, rule_version, match_priority, status)
SELECT '乡镇保洁员', p.id, p.name, '乡镇保洁员', NULL, NULL, 'v1.0', 39, 'active'
FROM position p WHERE p.position_code = 'POS-CLEANER'
  AND NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule r WHERE r.source_position = '乡镇保洁员' AND r.rule_version = 'v1.0');

INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, target_position_alias, grid_level, grid_role, rule_version, match_priority, status)
SELECT '挂桶员', p.id, p.name, NULL, NULL, NULL, 'v1.0', 38, 'active'
FROM position p WHERE p.position_code = 'POS-BARREL'
  AND NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule r WHERE r.source_position = '挂桶员' AND r.rule_version = 'v1.0');

INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, target_position_alias, grid_level, grid_role, rule_version, match_priority, status)
SELECT '垃圾收运辅助工', p.id, p.name, NULL, NULL, NULL, 'v1.0', 37, 'active'
FROM position p WHERE p.position_code = 'POS-COLLECT-HELPER'
  AND NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule r WHERE r.source_position = '垃圾收运辅助工' AND r.rule_version = 'v1.0');

-- 驾驶员岗位映射
INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, target_position_alias, condition_dept, grid_level, grid_role, rule_version, match_priority, status)
SELECT '司机', p.id, p.name, '司机', '车队', NULL, NULL, 'v1.0', 30, 'active'
FROM position p WHERE p.position_code = 'POS-DRIVER-COLLECT'
  AND NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule r WHERE r.source_position = '司机' AND r.condition_dept = '车队' AND r.rule_version = 'v1.0');

INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, target_position_alias, grid_level, grid_role, rule_version, match_priority, status)
SELECT '垃圾转运车驾驶员', p.id, p.name, NULL, NULL, NULL, 'v1.0', 29, 'active'
FROM position p WHERE p.position_code = 'POS-DRIVER-TRANSFER'
  AND NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule r WHERE r.source_position = '垃圾转运车驾驶员' AND r.rule_version = 'v1.0');

INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, target_position_alias, grid_level, grid_role, rule_version, match_priority, status)
SELECT '垃圾收运车驾驶员', p.id, p.name, NULL, NULL, NULL, 'v1.0', 28, 'active'
FROM position p WHERE p.position_code = 'POS-DRIVER-COLLECT'
  AND NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule r WHERE r.source_position = '垃圾收运车驾驶员' AND r.rule_version = 'v1.0');

INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, target_position_alias, grid_level, grid_role, rule_version, match_priority, status)
SELECT '吸污车驾驶员', p.id, p.name, NULL, NULL, NULL, 'v1.0', 27, 'active'
FROM position p WHERE p.position_code = 'POS-DRIVER-SUCTION'
  AND NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule r WHERE r.source_position = '吸污车驾驶员' AND r.rule_version = 'v1.0');

INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, target_position_alias, grid_level, grid_role, rule_version, match_priority, status)
SELECT '吸污车司机', p.id, p.name, '吸污车司机', NULL, NULL, 'v1.0', 26, 'active'
FROM position p WHERE p.position_code = 'POS-DRIVER-SUCTION'
  AND NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule r WHERE r.source_position = '吸污车司机' AND r.rule_version = 'v1.0');

-- 站管岗位映射
INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, target_position_alias, grid_level, grid_role, rule_version, match_priority, status)
SELECT '转运站操作员', p.id, p.name, NULL, NULL, NULL, 'v1.0', 20, 'active'
FROM position p WHERE p.position_code = 'POS-STATION'
  AND NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule r WHERE r.source_position = '转运站操作员' AND r.rule_version = 'v1.0');

INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, target_position_alias, grid_level, grid_role, rule_version, match_priority, status)
SELECT '中转站管理员', p.id, p.name, '中转站管理员', NULL, NULL, 'v1.0', 19, 'active'
FROM position p WHERE p.position_code = 'POS-STATION'
  AND NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule r WHERE r.source_position = '中转站管理员' AND r.rule_version = 'v1.0');

INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, target_position_alias, grid_level, grid_role, rule_version, match_priority, status)
SELECT '转运站管理员', p.id, p.name, '转运站管理员', NULL, NULL, 'v1.0', 18, 'active'
FROM position p WHERE p.position_code = 'POS-STATION'
  AND NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule r WHERE r.source_position = '转运站管理员' AND r.rule_version = 'v1.0');

-- 职能岗位映射
INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, target_position_alias, grid_level, grid_role, rule_version, match_priority, status)
SELECT '安全管理员', p.id, p.name, NULL, NULL, NULL, 'v1.0', 10, 'active'
FROM position p WHERE p.position_code = 'POS-SAFETY-MGR'
  AND NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule r WHERE r.source_position = '安全管理员' AND r.rule_version = 'v1.0');

INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, target_position_alias, grid_level, grid_role, rule_version, match_priority, status)
SELECT '安环专员', p.id, p.name, '安环专员', NULL, NULL, 'v1.0', 9, 'active'
FROM position p WHERE p.position_code = 'POS-SAFETY-MGR'
  AND NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule r WHERE r.source_position = '安环专员' AND r.rule_version = 'v1.0');

INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, target_position_alias, grid_level, grid_role, rule_version, match_priority, status)
SELECT '文员', p.id, p.name, NULL, NULL, NULL, 'v1.0', 8, 'active'
FROM position p WHERE p.position_code = 'POS-CLERK'
  AND NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule r WHERE r.source_position = '文员' AND r.rule_version = 'v1.0');

INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, target_position_alias, grid_level, grid_role, rule_version, match_priority, status)
SELECT '会计', p.id, p.name, NULL, NULL, NULL, 'v1.0', 7, 'active'
FROM position p WHERE p.position_code = 'POS-ACCOUNTANT'
  AND NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule r WHERE r.source_position = '会计' AND r.rule_version = 'v1.0');

INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, target_position_alias, grid_level, grid_role, rule_version, match_priority, status)
SELECT '人事专员', p.id, p.name, NULL, NULL, NULL, 'v1.0', 6, 'active'
FROM position p WHERE p.position_code = 'POS-HR'
  AND NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule r WHERE r.source_position = '人事专员' AND r.rule_version = 'v1.0');

-- ============================================================
-- 八、验证查询
-- ============================================================

DO $$
DECLARE
    v_org_count INTEGER;
    v_center_count INTEGER;
    v_pos_count INTEGER;
    v_alias_count INTEGER;
    v_resp_config_count INTEGER;
    v_org_mapping_count INTEGER;
    v_pos_mapping_count INTEGER;
    v_version_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_org_count FROM hse_org_unit WHERE is_deleted = false;
    SELECT COUNT(*) INTO v_center_count FROM hse_org_unit WHERE org_type = 'center' AND is_deleted = false;
    SELECT COUNT(*) INTO v_pos_count FROM position WHERE position_code IS NOT NULL AND is_deleted = false;
    SELECT COUNT(*) INTO v_alias_count FROM hse_position_alias WHERE is_deleted = false;
    SELECT COUNT(*) INTO v_resp_config_count FROM hse_responsibility_config WHERE is_deleted = false;
    SELECT COUNT(*) INTO v_org_mapping_count FROM employee_import_mapping_rule WHERE rule_version = 'v1.0' AND is_deleted = false;
    SELECT COUNT(*) INTO v_pos_mapping_count FROM employee_position_mapping_rule WHERE rule_version = 'v1.0' AND is_deleted = false;
    SELECT COUNT(*) INTO v_version_count FROM employee_import_mapping_rule_version WHERE status = 'active';

    RAISE NOTICE '========================================';
    RAISE NOTICE '  HSE Sprint6.0 基础数据底座 v69 初始化验证';
    RAISE NOTICE '========================================';
    RAISE NOTICE '  组织单元:              % 个', v_org_count;
    RAISE NOTICE '  作业中心:              % 个（环卫+绿化）', v_center_count;
    RAISE NOTICE '  标准岗位:              % 个（预期17）', v_pos_count;
    RAISE NOTICE '  岗位别名:              % 个（预期16）', v_alias_count;
    RAISE NOTICE '  责任配置:              % 条（预期17）', v_resp_config_count;
    RAISE NOTICE '  组织映射规则:          % 条', v_org_mapping_count;
    RAISE NOTICE '  岗位映射规则:          % 条', v_pos_mapping_count;
    RAISE NOTICE '  规则版本:              % 个', v_version_count;
    RAISE NOTICE '========================================';
    RAISE NOTICE '  v69初始化数据完成！';
    RAISE NOTICE '========================================';
END $$;

COMMIT;

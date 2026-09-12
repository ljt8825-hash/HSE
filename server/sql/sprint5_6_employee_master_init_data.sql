-- ============================================================
-- HSE Sprint5.6 员工主数据中心初始化数据脚本
-- 版本: v70-init
-- 内容: 组织补充 + 岗位20条 + 固定作业单元 + 映射规则 + 规则版本
-- 方式: INSERT ... WHERE NOT EXISTS（增量安全，可重复执行）
-- 前置: 已执行 hse_org_center_v68_migration.sql 和 sprint5_6_employee_master_migration.sql
-- 执行: psql -U postgres -d safety_dashboard -f sprint5_6_employee_master_init_data.sql
-- ============================================================

BEGIN;

-- ============================================================
-- 一、hse_org_unit 初始化补充（确保18条标准组织）
-- 说明: v68_init_data.sql 已创建 1公司+5职能部门+1环卫中心+12乡镇=19条
--       本脚本补充: 市政绿化作业中心（如不存在）
--       不删除已有数据，保持增量安全
-- ============================================================

-- 1. 项目公司（v68已存在，不重复插入）
INSERT INTO hse_org_unit (org_name, org_type, org_code, org_path, level, sort_order, status, description)
SELECT '宁津项目公司', 'company', 'COMPANY-001', '/宁津项目公司', 1, 1, 'active', '宁津环卫项目公司'
WHERE NOT EXISTS (SELECT 1 FROM hse_org_unit WHERE org_code = 'COMPANY-001');

-- 2. 职能部门（3个标准部门）
WITH company AS (SELECT id, org_path FROM hse_org_unit WHERE org_code = 'COMPANY-001')
INSERT INTO hse_org_unit (parent_id, org_name, org_type, org_code, org_path, level, sort_order, status)
SELECT c.id, '安环管理部', 'department', 'DEPT-SAFETY', c.org_path || '/安环管理部', 2, 1, 'active'
FROM company c
WHERE NOT EXISTS (SELECT 1 FROM hse_org_unit WHERE org_code = 'DEPT-SAFETY');

WITH company AS (SELECT id, org_path FROM hse_org_unit WHERE org_code = 'COMPANY-001')
INSERT INTO hse_org_unit (parent_id, org_name, org_type, org_code, org_path, level, sort_order, status)
SELECT c.id, '生产管理部', 'department', 'DEPT-PROD', c.org_path || '/生产管理部', 2, 2, 'active'
FROM company c
WHERE NOT EXISTS (SELECT 1 FROM hse_org_unit WHERE org_code = 'DEPT-PROD');

WITH company AS (SELECT id, org_path FROM hse_org_unit WHERE org_code = 'COMPANY-001')
INSERT INTO hse_org_unit (parent_id, org_name, org_type, org_code, org_path, level, sort_order, status)
SELECT c.id, '人力综合部', 'department', 'DEPT-HR', c.org_path || '/人力综合部', 2, 3, 'active'
FROM company c
WHERE NOT EXISTS (SELECT 1 FROM hse_org_unit WHERE org_code = 'DEPT-HR');

-- 3. 作业中心（2个：环卫作业中心 + 市政绿化作业中心）
WITH company AS (SELECT id, org_path FROM hse_org_unit WHERE org_code = 'COMPANY-001')
INSERT INTO hse_org_unit (parent_id, org_name, org_type, org_code, org_path, level, sort_order, status)
SELECT c.id, '环卫作业中心', 'operation_center', 'CENTER-HW', c.org_path || '/环卫作业中心', 2, 4, 'active'
FROM company c
WHERE NOT EXISTS (SELECT 1 FROM hse_org_unit WHERE org_code = 'CENTER-HW');

WITH company AS (SELECT id, org_path FROM hse_org_unit WHERE org_code = 'COMPANY-001')
INSERT INTO hse_org_unit (parent_id, org_name, org_type, org_code, org_path, level, sort_order, status)
SELECT c.id, '市政绿化作业中心', 'operation_center', 'CENTER-LV', c.org_path || '/市政绿化作业中心', 2, 5, 'active'
FROM company c
WHERE NOT EXISTS (SELECT 1 FROM hse_org_unit WHERE org_code = 'CENTER-LV');

-- 4. 12个乡镇作业中心
WITH center AS (SELECT id, org_path FROM hse_org_unit WHERE org_code = 'CENTER-HW')
INSERT INTO hse_org_unit (parent_id, org_name, org_type, org_code, org_path, level, sort_order, status)
SELECT
    c.id, towns.name, 'town_center', towns.code,
    c.org_path || '/' || towns.name, 3, towns.sort_order, 'active'
FROM center c
CROSS JOIN (VALUES
    ('TOWN-CHANGGUAN', '长官镇作业中心', 1),
    ('TOWN-ZHANGDAZHUANG', '张大庄镇作业中心', 2),
    ('TOWN-DACAO', '大曹镇作业中心', 3),
    ('TOWN-DUJI', '杜集镇作业中心', 4),
    ('TOWN-CHAIHUDIAN', '柴胡店镇作业中心', 5),
    ('TOWN-BAODIAN', '保店镇作业中心', 6),
    ('TOWN-DALIU', '大柳镇作业中心', 7),
    ('TOWN-XIANGYA', '相衙镇作业中心', 8),
    ('TOWN-LIUYINGWU', '刘营伍乡作业中心', 9),
    ('TOWN-SHIJI', '时集镇作业中心', 10),
    ('TOWN-NINGCHENG', '宁城街道作业中心', 11),
    ('TOWN-JINCHENG', '津城街道作业中心', 12)
) AS towns(code, name, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM hse_org_unit ou WHERE ou.org_code = towns.code
);

-- ============================================================
-- 二、position 初始化（20个标准岗位）
-- 说明: v68_init_data.sql 已创建10个岗位，本脚本补充剩余岗位
-- 字段映射: position_type → job_category, position_level → sort_order
-- ============================================================

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, status, sort_order)
SELECT 'POS-GM', '项目总经理', '管理', 'high', true, 'active', 1
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-GM');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, status, sort_order)
SELECT 'POS-DEPT-MGR', '部门经理', '管理', 'high', true, 'active', 2
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-DEPT-MGR');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, status, sort_order)
SELECT 'POS-DEPT-DEPUTY', '部门副经理', '管理', 'high', true, 'active', 3
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-DEPT-DEPUTY');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, status, sort_order)
SELECT 'POS-HW-MGR', '作业中心副经理', '管理', 'high', true, 'active', 4
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-HW-MGR');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, status, sort_order)
SELECT 'POS-AREA-MGR', '人工片区长', '管理', 'high', true, 'active', 5
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-AREA-MGR');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, status, sort_order)
SELECT 'POS-FOREMAN', '人工班长', '生产', 'medium', true, 'active', 10
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-FOREMAN');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, status, sort_order)
SELECT 'POS-CLEANER', '保洁员', '生产', 'medium', false, 'active', 11
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-CLEANER');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, status, sort_order)
SELECT 'POS-TRANSFER-DRIVER', '垃圾转运车驾驶员', '生产', 'critical', true, 'active', 12
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-TRANSFER-DRIVER');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, status, sort_order)
SELECT 'POS-COLLECT-DRIVER', '垃圾收运车驾驶员', '生产', 'critical', true, 'active', 13
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-COLLECT-DRIVER');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, status, sort_order)
SELECT 'POS-SEWAGE-DRIVER', '吸污车驾驶员', '生产', 'critical', true, 'active', 14
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-SEWAGE-DRIVER');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, status, sort_order)
SELECT 'POS-STATION', '转运站管理员', '生产', 'high', true, 'active', 15
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-STATION');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, status, sort_order)
SELECT 'POS-BARREL', '挂桶员', '生产', 'medium', false, 'active', 16
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-BARREL');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, status, sort_order)
SELECT 'POS-COLLECT-HELPER', '垃圾收运辅助工', '生产', 'high', true, 'active', 17
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-COLLECT-HELPER');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, status, sort_order)
SELECT 'POS-SAFETY', '安全管理员', '技术', 'medium', true, 'active', 20
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-SAFETY');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, status, sort_order)
SELECT 'POS-HR', '人事专员', '技术', 'medium', false, 'active', 21
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-HR');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, status, sort_order)
SELECT 'POS-FIN', '会计', '技术', 'medium', false, 'active', 22
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-FIN');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, status, sort_order)
SELECT 'POS-CLERK', '文员', '辅助', 'low', false, 'active', 23
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-CLERK');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, status, sort_order)
SELECT 'POS-GREENING', '绿化工', '生产', 'medium', false, 'active', 24
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-GREENING');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, status, sort_order)
SELECT 'POS-MUNICIPAL', '市政维护工', '生产', 'medium', false, 'active', 25
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-MUNICIPAL');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, status, sort_order)
SELECT 'POS-OTHER', '其他', '辅助', 'low', false, 'active', 99
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-OTHER');

-- ============================================================
-- 三、hse_operation_unit 初始化（固定作业单元：中心车辆作业组）
-- 说明: v68_init_data.sql 已创建，此处为冗余保护
-- ============================================================

INSERT INTO hse_operation_unit (org_unit_id, unit_name, unit_type, unit_code, headcount, status, description)
SELECT
    (SELECT id FROM hse_org_unit WHERE org_code = 'CENTER-HW'),
    '中心车辆作业组', 'center_vehicle_team', 'UNIT-CENTER-VEHICLE-001', 7, 'active', '中心直管垃圾转运车队，服务范围跨乡镇'
WHERE NOT EXISTS (SELECT 1 FROM hse_operation_unit WHERE unit_code = 'UNIT-CENTER-VEHICLE-001');

-- ============================================================
-- 四、employee_import_mapping_rule_version 初始化
-- ============================================================

INSERT INTO employee_import_mapping_rule_version (version, version_desc, effective_date, status)
SELECT 'v1.0', 'Sprint5.6初始版本', CURRENT_DATE, 'active'
WHERE NOT EXISTS (SELECT 1 FROM employee_import_mapping_rule_version WHERE version = 'v1.0');

-- ============================================================
-- 五、employee_import_mapping_rule 初始化（组织映射规则）
-- 说明: Excel"所属部门" → hse_org_unit / hse_operation_unit
-- ============================================================

-- 1. 职能部门映射
INSERT INTO employee_import_mapping_rule (source_value, source_type, target_type, target_id, target_name, rule_version, match_priority)
SELECT '人力综合部', 'excel_department', 'org_unit', (SELECT id FROM hse_org_unit WHERE org_code = 'DEPT-HR'), '人力综合部', 'v1.0', 10
WHERE NOT EXISTS (SELECT 1 FROM employee_import_mapping_rule WHERE source_value = '人力综合部' AND target_type = 'org_unit');

INSERT INTO employee_import_mapping_rule (source_value, source_type, target_type, target_id, target_name, rule_version, match_priority)
SELECT '生产管理部', 'excel_department', 'org_unit', (SELECT id FROM hse_org_unit WHERE org_code = 'DEPT-PROD'), '生产管理部', 'v1.0', 10
WHERE NOT EXISTS (SELECT 1 FROM employee_import_mapping_rule WHERE source_value = '生产管理部' AND target_type = 'org_unit');

INSERT INTO employee_import_mapping_rule (source_value, source_type, target_type, target_id, target_name, rule_version, match_priority)
SELECT '安环管理部', 'excel_department', 'org_unit', (SELECT id FROM hse_org_unit WHERE org_code = 'DEPT-SAFETY'), '安环管理部', 'v1.0', 10
WHERE NOT EXISTS (SELECT 1 FROM employee_import_mapping_rule WHERE source_value = '安环管理部' AND target_type = 'org_unit');

-- 2. 车队映射（组织 + 作业单元）
INSERT INTO employee_import_mapping_rule (source_value, source_type, target_type, target_id, target_name, rule_version, match_priority)
SELECT '车队', 'excel_department', 'org_unit', (SELECT id FROM hse_org_unit WHERE org_code = 'CENTER-HW'), '环卫作业中心', 'v1.0', 10
WHERE NOT EXISTS (SELECT 1 FROM employee_import_mapping_rule WHERE source_value = '车队' AND target_type = 'org_unit');

INSERT INTO employee_import_mapping_rule (source_value, source_type, target_type, target_id, target_name, rule_version, match_priority)
SELECT '车队', 'excel_department', 'operation_unit', (SELECT id FROM hse_operation_unit WHERE unit_code = 'UNIT-CENTER-VEHICLE-001'), '中心车辆作业组', 'v1.0', 10
WHERE NOT EXISTS (SELECT 1 FROM employee_import_mapping_rule WHERE source_value = '车队' AND target_type = 'operation_unit');

-- 3. 乡镇片区映射（以宁城街道为例，12个乡镇各2条: 片区→作业中心, X班→作业中心+保洁组）
-- 使用动态插入所有12个乡镇
DO $$
DECLARE
    v_town RECORD;
    v_org_id BIGINT;
    v_town_name VARCHAR;
    v_town_short VARCHAR;
BEGIN
    FOR v_town IN
        SELECT id, org_name, org_code FROM hse_org_unit
        WHERE org_type = 'town_center' AND is_deleted = false
        ORDER BY org_code
    LOOP
        -- 提取乡镇简称（去掉"作业中心"）
        v_town_name := v_town.org_name;
        v_town_short := REPLACE(v_town.org_name, '作业中心', '');
        v_org_id := v_town.id;

        -- 片区 → 作业中心
        IF NOT EXISTS (
            SELECT 1 FROM employee_import_mapping_rule
            WHERE source_value = v_town_short || '片区' AND target_type = 'org_unit'
        ) THEN
            INSERT INTO employee_import_mapping_rule
                (source_value, source_type, target_type, target_id, target_name, rule_version, match_priority)
            VALUES
                (v_town_short || '片区', 'excel_department', 'org_unit', v_org_id, v_town_name, 'v1.0', 10);
        END IF;

        -- 一班 → 作业中心
        IF NOT EXISTS (
            SELECT 1 FROM employee_import_mapping_rule
            WHERE source_value = v_town_short || '一班' AND target_type = 'org_unit'
        ) THEN
            INSERT INTO employee_import_mapping_rule
                (source_value, source_type, target_type, target_id, target_name, rule_version, match_priority)
            VALUES
                (v_town_short || '一班', 'excel_department', 'org_unit', v_org_id, v_town_name, 'v1.0', 5);
        END IF;

        -- 二班 → 作业中心
        IF NOT EXISTS (
            SELECT 1 FROM employee_import_mapping_rule
            WHERE source_value = v_town_short || '二班' AND target_type = 'org_unit'
        ) THEN
            INSERT INTO employee_import_mapping_rule
                (source_value, source_type, target_type, target_id, target_name, rule_version, match_priority)
            VALUES
                (v_town_short || '二班', 'excel_department', 'org_unit', v_org_id, v_town_name, 'v1.0', 5);
        END IF;
    END LOOP;
END $$;

-- ============================================================
-- 六、employee_position_mapping_rule 初始化（岗位映射规则）
-- ============================================================

-- 1. 司机细分规则（条件映射）
INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, condition_dept, rule_version, remark)
SELECT '司机', (SELECT id FROM position WHERE position_code = 'POS-TRANSFER-DRIVER'), '垃圾转运车驾驶员', '车队', 'v1.0', '中心车组-垃圾转运'
WHERE NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule WHERE source_position = '司机' AND condition_dept = '车队');

INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, condition_dept, rule_version, remark)
SELECT '司机', (SELECT id FROM position WHERE position_code = 'POS-COLLECT-DRIVER'), '垃圾收运车驾驶员', '*片区', 'v1.0', '乡镇收运'
WHERE NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule WHERE source_position = '司机' AND condition_dept = '*片区');

INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, condition_dept, rule_version, remark)
SELECT '吸污车司机', (SELECT id FROM position WHERE position_code = 'POS-SEWAGE-DRIVER'), '吸污车驾驶员', NULL, 'v1.0', '直接映射'
WHERE NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule WHERE source_position = '吸污车司机');

-- 2. 保洁员相关
INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, rule_version)
SELECT '乡镇保洁员', (SELECT id FROM position WHERE position_code = 'POS-CLEANER'), '保洁员', 'v1.0'
WHERE NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule WHERE source_position = '乡镇保洁员');

INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, rule_version)
SELECT '保洁员', (SELECT id FROM position WHERE position_code = 'POS-CLEANER'), '保洁员', 'v1.0'
WHERE NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule WHERE source_position = '保洁员' AND condition_dept IS NULL);

-- 3. 管理岗位
INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, rule_version)
SELECT '项目总经理', (SELECT id FROM position WHERE position_code = 'POS-GM'), '项目总经理', 'v1.0'
WHERE NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule WHERE source_position = '项目总经理');

INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, rule_version)
SELECT '人工片区长', (SELECT id FROM position WHERE position_code = 'POS-AREA-MGR'), '人工片区长', 'v1.0'
WHERE NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule WHERE source_position = '人工片区长');

INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, rule_version)
SELECT '人工班长', (SELECT id FROM position WHERE position_code = 'POS-FOREMAN'), '人工班长', 'v1.0'
WHERE NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule WHERE source_position = '人工班长');

INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, rule_version)
SELECT '部门经理', (SELECT id FROM position WHERE position_code = 'POS-DEPT-MGR'), '部门经理', 'v1.0'
WHERE NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule WHERE source_position = '部门经理');

INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, rule_version)
SELECT '部门副经理', (SELECT id FROM position WHERE position_code = 'POS-DEPT-DEPUTY'), '部门副经理', 'v1.0'
WHERE NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule WHERE source_position = '部门副经理');

-- 4. 一线作业岗位
INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, rule_version)
SELECT '中转站管理员', (SELECT id FROM position WHERE position_code = 'POS-STATION'), '转运站管理员', 'v1.0'
WHERE NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule WHERE source_position = '中转站管理员');

INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, rule_version)
SELECT '挂桶员', (SELECT id FROM position WHERE position_code = 'POS-BARREL'), '挂桶员', 'v1.0'
WHERE NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule WHERE source_position = '挂桶员');

INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, rule_version)
SELECT '收运辅助工', (SELECT id FROM position WHERE position_code = 'POS-COLLECT-HELPER'), '垃圾收运辅助工', 'v1.0'
WHERE NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule WHERE source_position = '收运辅助工');

INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, rule_version)
SELECT '垃圾收运辅助工', (SELECT id FROM position WHERE position_code = 'POS-COLLECT-HELPER'), '垃圾收运辅助工', 'v1.0'
WHERE NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule WHERE source_position = '垃圾收运辅助工');

-- 5. 职能岗位
INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, rule_version)
SELECT '安环专员', (SELECT id FROM position WHERE position_code = 'POS-SAFETY'), '安全管理员', 'v1.0'
WHERE NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule WHERE source_position = '安环专员');

INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, rule_version)
SELECT '人事专员', (SELECT id FROM position WHERE position_code = 'POS-HR'), '人事专员', 'v1.0'
WHERE NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule WHERE source_position = '人事专员');

INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, rule_version)
SELECT '会计', (SELECT id FROM position WHERE position_code = 'POS-FIN'), '会计', 'v1.0'
WHERE NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule WHERE source_position = '会计');

INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, rule_version)
SELECT '文员', (SELECT id FROM position WHERE position_code = 'POS-CLERK'), '文员', 'v1.0'
WHERE NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule WHERE source_position = '文员');

INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, rule_version)
SELECT '行政综合主管', (SELECT id FROM position WHERE position_code = 'POS-CLERK'), '文员', 'v1.0'
WHERE NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule WHERE source_position = '行政综合主管');

INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, rule_version)
SELECT '库管专员', (SELECT id FROM position WHERE position_code = 'POS-CLERK'), '文员', 'v1.0'
WHERE NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule WHERE source_position = '库管专员');

-- 6. 兜底规则
INSERT INTO employee_position_mapping_rule (source_position, target_position_id, target_position_name, rule_version, remark)
SELECT '其他', (SELECT id FROM position WHERE position_code = 'POS-OTHER'), '其他', 'v1.0', '兜底岗位'
WHERE NOT EXISTS (SELECT 1 FROM employee_position_mapping_rule WHERE source_position = '其他');

-- ============================================================
-- 七、验证查询
-- ============================================================

DO $$
DECLARE
    v_company_count INTEGER;
    v_dept_count INTEGER;
    v_center_count INTEGER;
    v_town_count INTEGER;
    v_org_total INTEGER;
    v_position_count INTEGER;
    v_op_unit_count INTEGER;
    v_map_rule_count INTEGER;
    v_pos_map_count INTEGER;
    v_ver_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_company_count FROM hse_org_unit WHERE org_type = 'company' AND is_deleted = false;
    SELECT COUNT(*) INTO v_dept_count FROM hse_org_unit WHERE org_type = 'department' AND is_deleted = false;
    SELECT COUNT(*) INTO v_center_count FROM hse_org_unit WHERE org_type = 'operation_center' AND is_deleted = false;
    SELECT COUNT(*) INTO v_town_count FROM hse_org_unit WHERE org_type = 'town_center' AND is_deleted = false;
    SELECT COUNT(*) INTO v_org_total FROM hse_org_unit WHERE is_deleted = false;
    SELECT COUNT(*) INTO v_position_count FROM position WHERE is_deleted = false;
    SELECT COUNT(*) INTO v_op_unit_count FROM hse_operation_unit WHERE is_deleted = false;
    SELECT COUNT(*) INTO v_map_rule_count FROM employee_import_mapping_rule WHERE is_deleted = false;
    SELECT COUNT(*) INTO v_pos_map_count FROM employee_position_mapping_rule WHERE is_deleted = false;
    SELECT COUNT(*) INTO v_ver_count FROM employee_import_mapping_rule_version WHERE is_deleted = false;

    RAISE NOTICE '========================================';
    RAISE NOTICE '  HSE Sprint5.6 初始化数据验证';
    RAISE NOTICE '========================================';
    RAISE NOTICE '  组织单元统计:';
    RAISE NOTICE '    - 公司:           % (预期 >=1)', v_company_count;
    RAISE NOTICE '    - 职能部门:       % (预期 >=3)', v_dept_count;
    RAISE NOTICE '    - 作业中心:       % (预期 >=2)', v_center_count;
    RAISE NOTICE '    - 乡镇:           % (预期 >=12)', v_town_count;
    RAISE NOTICE '    - 组织总计:       % (预期 >=18)', v_org_total;
    RAISE NOTICE '  标准岗位:         % (预期 >=20)', v_position_count;
    RAISE NOTICE '  固定作业单元:     % (预期 >=1)', v_op_unit_count;
    RAISE NOTICE '  组织映射规则:     % (预期 >=20)', v_map_rule_count;
    RAISE NOTICE '  岗位映射规则:     % (预期 >=15)', v_pos_map_count;
    RAISE NOTICE '  规则版本:         % (预期 >=1)', v_ver_count;
    RAISE NOTICE '========================================';
    RAISE NOTICE '  Sprint5.6 初始化数据完成！';
    RAISE NOTICE '========================================';
END $$;

COMMIT;

-- ============================================================
-- HSE V2.1 组织中心初始化数据脚本
-- 版本: v68
-- 内容: 组织树 + 岗位数据 + 中心直管车组
-- 方式: INSERT ... WHERE NOT EXISTS（增量安全，可重复执行）
-- 执行: psql -U hse_user -d hse_db -f hse_org_center_v68_init_data.sql
-- ============================================================

BEGIN;

-- ============================================================
-- 一、hse_org_unit 初始化（1公司 + 6部门 + 1中心 + 12乡镇 = 20条）
-- ============================================================

-- 1. 公司根节点
INSERT INTO hse_org_unit (org_name, org_type, org_code, org_path, level, sort_order, status, description)
SELECT '宁津项目公司', 'company', 'COMPANY-001', '/宁津项目公司', 1, 1, 'active', '宁津环卫项目公司'
WHERE NOT EXISTS (SELECT 1 FROM hse_org_unit WHERE org_code = 'COMPANY-001');

-- 2. 职能部门（公司下属）
WITH company AS (SELECT id, org_path FROM hse_org_unit WHERE org_code = 'COMPANY-001')
INSERT INTO hse_org_unit (parent_id, org_name, org_type, org_code, org_path, level, sort_order, status)
SELECT c.id, '项目管理层', 'department', 'DEPT-MANAGE', c.org_path || '/项目管理层', 2, 1, 'active'
FROM company c
WHERE NOT EXISTS (SELECT 1 FROM hse_org_unit WHERE org_code = 'DEPT-MANAGE');

WITH company AS (SELECT id, org_path FROM hse_org_unit WHERE org_code = 'COMPANY-001')
INSERT INTO hse_org_unit (parent_id, org_name, org_type, org_code, org_path, level, sort_order, status)
SELECT c.id, '人力综合部', 'department', 'DEPT-HR', c.org_path || '/人力综合部', 2, 2, 'active'
FROM company c
WHERE NOT EXISTS (SELECT 1 FROM hse_org_unit WHERE org_code = 'DEPT-HR');

WITH company AS (SELECT id, org_path FROM hse_org_unit WHERE org_code = 'COMPANY-001')
INSERT INTO hse_org_unit (parent_id, org_name, org_type, org_code, org_path, level, sort_order, status)
SELECT c.id, '生产管理部', 'department', 'DEPT-PROD', c.org_path || '/生产管理部', 2, 3, 'active'
FROM company c
WHERE NOT EXISTS (SELECT 1 FROM hse_org_unit WHERE org_code = 'DEPT-PROD');

WITH company AS (SELECT id, org_path FROM hse_org_unit WHERE org_code = 'COMPANY-001')
INSERT INTO hse_org_unit (parent_id, org_name, org_type, org_code, org_path, level, sort_order, status)
SELECT c.id, '安环品质部', 'department', 'DEPT-SAFETY', c.org_path || '/安环品质部', 2, 4, 'active'
FROM company c
WHERE NOT EXISTS (SELECT 1 FROM hse_org_unit WHERE org_code = 'DEPT-SAFETY');

WITH company AS (SELECT id, org_path FROM hse_org_unit WHERE org_code = 'COMPANY-001')
INSERT INTO hse_org_unit (parent_id, org_name, org_type, org_code, org_path, level, sort_order, status)
SELECT c.id, '财务部', 'department', 'DEPT-FIN', c.org_path || '/财务部', 2, 5, 'active'
FROM company c
WHERE NOT EXISTS (SELECT 1 FROM hse_org_unit WHERE org_code = 'DEPT-FIN');

-- 3. 环卫作业中心
WITH company AS (SELECT id, org_path FROM hse_org_unit WHERE org_code = 'COMPANY-001')
INSERT INTO hse_org_unit (parent_id, org_name, org_type, org_code, org_path, level, sort_order, status)
SELECT c.id, '环卫作业中心', 'center', 'CENTER-HW', c.org_path || '/环卫作业中心', 2, 6, 'active'
FROM company c
WHERE NOT EXISTS (SELECT 1 FROM hse_org_unit WHERE org_code = 'CENTER-HW');

-- 4. 12个乡镇作业中心（环卫作业中心下属）
WITH center AS (SELECT id, org_path FROM hse_org_unit WHERE org_code = 'CENTER-HW')
INSERT INTO hse_org_unit (parent_id, org_name, org_type, org_code, org_path, level, sort_order, status)
SELECT 
    c.id, towns.name, 'town_center', towns.code, 
    c.org_path || '/' || towns.name, 3, towns.sort_order, 'active'
FROM center c
CROSS JOIN (VALUES
    ('长官镇作业中心', 'TOWN-CHANGGUAN', 1),
    ('张大庄镇作业中心', 'TOWN-ZHANGDAZHUANG', 2),
    ('大曹镇作业中心', 'TOWN-DACAO', 3),
    ('杜集镇作业中心', 'TOWN-DUJI', 4),
    ('柴胡店镇作业中心', 'TOWN-CHAIHUDIAN', 5),
    ('保店镇作业中心', 'TOWN-BAODIAN', 6),
    ('大柳镇作业中心', 'TOWN-DALIU', 7),
    ('相衙镇作业中心', 'TOWN-XIANGYA', 8),
    ('刘营伍乡作业中心', 'TOWN-LIUYINGWU', 9),
    ('时集镇作业中心', 'TOWN-SHIJI', 10),
    ('宁城街道作业中心', 'TOWN-NINGCHENG', 11),
    ('津城街道作业中心', 'TOWN-JINCHENG', 12)
) AS towns(name, code, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM hse_org_unit ou WHERE ou.org_code = towns.code
);

-- ============================================================
-- 二、position 表初始化数据（10个标准岗位）
-- ============================================================

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, status, sort_order)
SELECT 'POS-GM', '项目总经理', '管理', 'high', true, 'active', 1
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-GM');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, status, sort_order)
SELECT 'POS-HW-MGR', '环卫中心副经理', '管理', 'high', true, 'active', 2
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-HW-MGR');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, status, sort_order)
SELECT 'POS-AREA-MGR', '片区长', '管理', 'high', true, 'active', 3
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-AREA-MGR');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, status, sort_order)
SELECT 'POS-FOREMAN', '保洁班长', '生产', 'medium', true, 'active', 4
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-FOREMAN');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, status, sort_order)
SELECT 'POS-DRIVER', '垃圾收运车驾驶员', '生产', 'critical', true, 'active', 10
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-DRIVER');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, status, sort_order)
SELECT 'POS-CLEANER', '保洁员', '生产', 'medium', false, 'active', 11
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-CLEANER');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, status, sort_order)
SELECT 'POS-STATION', '转运站操作员', '生产', 'high', true, 'active', 12
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-STATION');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, status, sort_order)
SELECT 'POS-COLLECT-HELPER', '收运辅助工', '生产', 'high', true, 'active', 13
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-COLLECT-HELPER');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, status, sort_order)
SELECT 'POS-SAFETY-MGR', '安环副经理', '管理', 'high', true, 'active', 20
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-SAFETY-MGR');

INSERT INTO position (position_code, name, job_category, risk_level, is_safety_critical, status, sort_order)
SELECT 'POS-SAFETY', '安环专员', '技术', 'medium', true, 'active', 21
WHERE NOT EXISTS (SELECT 1 FROM position WHERE position_code = 'POS-SAFETY');

-- ============================================================
-- 三、hse_operation_unit 初始化（中心直管车组）
-- 注：其余57个保洁组+12个车组+11个转运站由 migrate_employee_v2.js 动态生成
-- ============================================================

WITH center AS (SELECT id FROM hse_org_unit WHERE org_code = 'CENTER-HW')
INSERT INTO hse_operation_unit (org_unit_id, unit_name, unit_type, unit_code, headcount, status, description)
SELECT c.id, '中心垃圾转运车组', 'vehicle_team', 'UNIT-CENTER-VEHICLE-001', 7, 'active', '中心直管垃圾转运车队，服务范围跨乡镇'
FROM center c
WHERE NOT EXISTS (SELECT 1 FROM hse_operation_unit WHERE unit_code = 'UNIT-CENTER-VEHICLE-001');

-- ============================================================
-- 四、验证查询
-- ============================================================

DO $$
DECLARE
    v_company_count INTEGER;
    v_dept_count INTEGER;
    v_center_count INTEGER;
    v_town_count INTEGER;
    v_position_count INTEGER;
    v_op_unit_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_company_count FROM hse_org_unit WHERE org_type = 'company' AND is_deleted = false;
    SELECT COUNT(*) INTO v_dept_count FROM hse_org_unit WHERE org_type = 'department' AND is_deleted = false;
    SELECT COUNT(*) INTO v_center_count FROM hse_org_unit WHERE org_type = 'center' AND is_deleted = false;
    SELECT COUNT(*) INTO v_town_count FROM hse_org_unit WHERE org_type = 'town_center' AND is_deleted = false;
    SELECT COUNT(*) INTO v_position_count FROM position WHERE position_code IS NOT NULL;
    SELECT COUNT(*) INTO v_op_unit_count FROM hse_operation_unit WHERE is_deleted = false;

    RAISE NOTICE '========================================';
    RAISE NOTICE '  HSE V2.1 组织中心 v68 初始化验证';
    RAISE NOTICE '========================================';
    RAISE NOTICE '  组织单元统计:';
    RAISE NOTICE '    - 公司:       % (预期 1)', v_company_count;
    RAISE NOTICE '    - 职能部门:   % (预期 6)', v_dept_count;
    RAISE NOTICE '    - 作业中心:   % (预期 1)', v_center_count;
    RAISE NOTICE '    - 乡镇:       % (预期 12)', v_town_count;
    RAISE NOTICE '    - 组织总计:   % (预期 20)', v_company_count + v_dept_count + v_center_count + v_town_count;
    RAISE NOTICE '  标准岗位:     % (预期 10)', v_position_count;
    RAISE NOTICE '  初始作业单元:  % (预期 1)', v_op_unit_count;
    RAISE NOTICE '========================================';
    RAISE NOTICE '  v68初始化数据完成！';
    RAISE NOTICE '  下一步: 执行 migrate_employee_v2.js 生成作业单元和人员关系';
    RAISE NOTICE '========================================';
END $$;

COMMIT;

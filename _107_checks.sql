-- Task 2.3 组织数据核验
SELECT '== hse_org_unit org_type 分布 ==' AS s;
SELECT org_type, COUNT(*) FROM hse_org_unit WHERE is_deleted=false GROUP BY org_type ORDER BY org_type;
SELECT '== hse_org_unit 总数 ==' AS s;
SELECT COUNT(*) FROM hse_org_unit WHERE is_deleted=false;
SELECT '== hse_operation_unit 总数 ==' AS s;
SELECT COUNT(*) FROM hse_operation_unit WHERE is_deleted=false;

-- Task 3.3 岗位数据核验
SELECT '== position 表列 ==' AS s;
SELECT column_name, data_type FROM information_schema.columns WHERE table_name='position' AND table_schema='public' ORDER BY ordinal_position;
SELECT '== position job_category 分布 ==' AS s;
SELECT job_category, COUNT(*) FROM position WHERE is_deleted=false GROUP BY job_category ORDER BY job_category;
SELECT '== position 总数 ==' AS s;
SELECT COUNT(*) FROM position WHERE is_deleted=false;
SELECT '== position risk_level 分布 ==' AS s;
SELECT risk_level, COUNT(*) FROM position WHERE is_deleted=false GROUP BY risk_level ORDER BY risk_level;

-- 补充: department 表(组织管理 UI 实际数据源)概览
SELECT '== department 总数 ==' AS s;
SELECT COUNT(*) FROM department WHERE is_deleted=false;
SELECT '== department level 分布 ==' AS s;
SELECT level, COUNT(*) FROM department WHERE is_deleted=false GROUP BY level ORDER BY level;

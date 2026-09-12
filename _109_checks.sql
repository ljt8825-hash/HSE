-- 1) 非删岗位 job_category 分布(含 NULL)
SELECT job_category, COUNT(*) AS cnt
FROM position WHERE is_deleted = false
GROUP BY job_category ORDER BY job_category NULLS FIRST;

-- 2) 全量非删岗位(看分类与命名, 用于推导 NULL 分类)
SELECT id, position_code, position_name, job_category, risk_level
FROM position WHERE is_deleted = false ORDER BY id;

-- 3) 8 条 NULL job_category 岗位
SELECT id, position_code, position_name, job_category, risk_level
FROM position WHERE is_deleted = false AND job_category IS NULL ORDER BY id;

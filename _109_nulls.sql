SELECT id, position_code, job_category, risk_level
FROM position WHERE is_deleted = false AND job_category IS NULL ORDER BY id;

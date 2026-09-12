-- 4.1.1 映射数量
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE org_unit_id IS NOT NULL) AS mapped,
  COUNT(*) FILTER (WHERE org_unit_id IS NULL) AS unmapped
FROM department WHERE is_deleted = false;

-- 4.1.2 映射准确性 + 外键完整性 + 歧义检查
SELECT d.id, d.name, d.level, d.org_unit_id, ou.org_name, ou.unit_type
FROM department d
LEFT JOIN hse_org_unit ou ON ou.id = d.org_unit_id
WHERE d.is_deleted = false
ORDER BY d.org_unit_id NULLS LAST, d.id;

-- 歧义检查：同一 org_unit_id 是否被多个不同名的 department 引用（应无）
SELECT org_unit_id, COUNT(DISTINCT name) AS distinct_names, COUNT(*) AS dept_cnt
FROM department WHERE is_deleted=false AND org_unit_id IS NOT NULL
GROUP BY org_unit_id HAVING COUNT(DISTINCT name) > 1;

-- 反向检查：是否有 org_unit 被多个不同前缀的 department 映射（前缀歧义）
SELECT ou.id, ou.org_name, COUNT(*) AS mapped_depts
FROM department d JOIN hse_org_unit ou ON ou.id = d.org_unit_id
WHERE d.is_deleted=false
GROUP BY ou.id, ou.org_name ORDER BY mapped_depts DESC;

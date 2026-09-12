-- 检查是否因「创建接口报错」产生了孤儿测试记录（只读）
\pset pager off
SELECT id, description, check_source, status, created_at
  FROM violation_records
 WHERE is_deleted IS NOT TRUE
   AND (description LIKE '%规则引擎阶段2a-测试记录%' OR description = 'probe')
 ORDER BY id DESC
 LIMIT 10;

SELECT 'check_source 分布（应为全 NULL）' AS note;
SELECT COALESCE(check_source, '(NULL)') AS val, count(*) AS cnt
  FROM violation_records
 WHERE is_deleted IS NOT TRUE
 GROUP BY 1 ORDER BY cnt DESC;

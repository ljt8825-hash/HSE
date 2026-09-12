-- 违规人姓名形态抽样（只读）
-- 目的：确认「形态不像中文姓名」的 729 条究竟是什么，避免分析结论被正则误判带偏
\pset pager off

SELECT violator_name, count(*) AS cnt
  FROM violation_records
 WHERE is_deleted IS NOT TRUE
   AND violator_name IS NOT NULL
   AND btrim(violator_name) <> ''
   AND btrim(violator_name) !~ '^[一-龥]{2,15}$'
 GROUP BY violator_name
 ORDER BY cnt DESC
 LIMIT 25;

SELECT '---- 匹配不到的姓名 TOP20 ----' AS note;

SELECT v.violator_name, count(*) AS cnt
  FROM violation_records v
 WHERE v.is_deleted IS NOT TRUE
   AND v.violator_name IS NOT NULL
   AND btrim(v.violator_name) <> ''
   AND btrim(v.violator_name) ~ '^[一-龥]{2,15}$'
   AND NOT EXISTS (
     SELECT 1 FROM v_employee_org_full e
      WHERE e.name = btrim(v.violator_name) AND e.is_current = TRUE
   )
 GROUP BY v.violator_name
 ORDER BY cnt DESC
 LIMIT 20;

-- 三违字段字典调研（只读，不写任何数据）
-- 目的：确认是否已有字段可表达「查处来源/层级」，供 check_source 字典设计参考
\pset pager off
SELECT 'grid_level' AS col, COALESCE(grid_level, '(空)') AS val, count(*) AS cnt
  FROM violation_records WHERE is_deleted IS NOT TRUE GROUP BY 1, 2 ORDER BY cnt DESC LIMIT 8;

SELECT 'report_status' AS col, COALESCE(report_status, '(空)') AS val, count(*) AS cnt
  FROM violation_records WHERE is_deleted IS NOT TRUE GROUP BY 1, 2 ORDER BY cnt DESC LIMIT 8;

SELECT 'punishment_type' AS col, COALESCE(punishment_type, '(空)') AS val, count(*) AS cnt
  FROM violation_records WHERE is_deleted IS NOT TRUE GROUP BY 1, 2 ORDER BY cnt DESC LIMIT 8;

SELECT 'violation_level' AS col, COALESCE(violation_level, '(空)') AS val, count(*) AS cnt
  FROM violation_records WHERE is_deleted IS NOT TRUE GROUP BY 1, 2 ORDER BY cnt DESC LIMIT 8;

SELECT 'position' AS col, COALESCE(position, '(空)') AS val, count(*) AS cnt
  FROM violation_records WHERE is_deleted IS NOT TRUE GROUP BY 1, 2 ORDER BY cnt DESC LIMIT 10;

SELECT 'is_supplementary' AS col, COALESCE(is_supplementary, '(空)') AS val, count(*) AS cnt
  FROM violation_records WHERE is_deleted IS NOT TRUE GROUP BY 1, 2 ORDER BY cnt DESC LIMIT 8;

SELECT 'status' AS col, COALESCE(status, '(空)') AS val, count(*) AS cnt
  FROM violation_records WHERE is_deleted IS NOT TRUE GROUP BY 1, 2 ORDER BY cnt DESC LIMIT 8;

SELECT 'violation_type_result' AS col, COALESCE(violation_type_result, '(空)') AS val, count(*) AS cnt
  FROM violation_records WHERE is_deleted IS NOT TRUE GROUP BY 1, 2 ORDER BY cnt DESC LIMIT 8;

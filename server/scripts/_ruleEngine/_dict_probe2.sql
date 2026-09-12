-- 三违字段字典调研（第2轮，只读）
-- 重点：检查人/查处单位相关字段，判断是否已有「查处来源」概念可复用
\pset pager off

SELECT 'inspector_name' AS col, COALESCE(inspector_name, '(空)') AS val, count(*) AS cnt
  FROM violation_records WHERE is_deleted IS NOT TRUE GROUP BY 1, 2 ORDER BY cnt DESC LIMIT 10;

SELECT 'inspector_id' AS col, COALESCE(inspector_id::text, '(空)') AS val, count(*) AS cnt
  FROM violation_records WHERE is_deleted IS NOT TRUE GROUP BY 1, 2 ORDER BY cnt DESC LIMIT 5;

SELECT 'area_team' AS col, COALESCE(area_team, '(空)') AS val, count(*) AS cnt
  FROM violation_records WHERE is_deleted IS NOT TRUE GROUP BY 1, 2 ORDER BY cnt DESC LIMIT 10;

-- 是否存在 check_source 列（迁移前应为 0 行）
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_name = 'violation_records' AND column_name = 'check_source';

-- 规则表是否已含 last_assessed_count
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_name = 'hse_assessment_rule'
   AND column_name IN ('last_assessed_count', 'integration_status', 'last_run_summary')
 ORDER BY column_name;

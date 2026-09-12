\pset border 2
\echo '=== 1. 61 条待回填记录的字段填充情况 ==='
SELECT
  count(*)                                                      AS total,
  count(*) FILTER (WHERE location IS NOT NULL AND location <> '') AS has_location,
  count(*) FILTER (WHERE area     IS NOT NULL AND area     <> '') AS has_area,
  count(*) FILTER (WHERE sheet    IS NOT NULL AND sheet    <> '') AS has_sheet,
  count(*) FILTER (WHERE name     IS NOT NULL AND name     <> '') AS has_name
FROM risk_sources
WHERE lng IS NULL OR lat IS NULL;

\echo ''
\echo '=== 2. 全表坐标覆盖概览 ==='
SELECT
  count(*)                                        AS total_rows,
  count(*) FILTER (WHERE lng IS NULL OR lat IS NULL) AS null_coord,
  count(*) FILTER (WHERE lng IS NOT NULL AND lat IS NOT NULL) AS has_coord
FROM risk_sources;

\echo ''
\echo '=== 3. 61 条明细（id / name / location / area / sheet / type / level / lng / lat） ==='
SELECT id,
       name,
       coalesce(location, '(NULL)') AS location,
       coalesce(area,     '(NULL)') AS area,
       coalesce(sheet,    '(NULL)') AS sheet,
       coalesce(type,     '(NULL)') AS type,
       coalesce(level,    '(NULL)') AS level,
       coalesce(lng::text, '(NULL)') AS lng,
       coalesce(lat::text, '(NULL)') AS lat
FROM risk_sources
WHERE lng IS NULL OR lat IS NULL
ORDER BY id;

\echo ''
\echo '=== 4. 评估相关字段现状 ==='
SELECT
  count(*)                                                  AS total,
  count(assessment_method)                                  AS has_method,
  count(assessment_score)                                   AS has_score,
  count(assessment_date)                                    AS has_date,
  count(review_cycle)                                       AS has_cycle
FROM risk_sources;

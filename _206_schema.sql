\pset border 2
\echo '=== risk_sources 列结构 ==='
SELECT column_name, data_type, character_maximum_length AS len, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'risk_sources'
ORDER BY ordinal_position;

\echo ''
\echo '=== risk_versions 列结构 ==='
SELECT column_name, data_type, character_maximum_length AS len, is_nullable
FROM information_schema.columns
WHERE table_name = 'risk_versions'
ORDER BY ordinal_position;

\echo ''
\echo '=== review_cycle 取值分布 ==='
SELECT review_cycle, count(*) FROM risk_sources GROUP BY review_cycle ORDER BY 1;

\echo ''
\echo '=== level 取值分布 ==='
SELECT level, count(*) FROM risk_sources GROUP BY level ORDER BY 2 DESC;

\echo ''
\echo '=== 重复性检查（按 name+location+type 分组） ==='
SELECT name, coalesce(type,'-') AS type, count(*) AS cnt, string_agg(id::text, ',' ORDER BY id) AS ids
FROM risk_sources
GROUP BY name, type
HAVING count(*) > 1
ORDER BY cnt DESC, name;

\echo ''
\echo '=== risk_versions 现有 change_type 分布 ==='
SELECT change_type, count(*) FROM risk_versions GROUP BY change_type ORDER BY 2 DESC;

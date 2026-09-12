SELECT id, no, area_team, inspector_name, violator_name,
       mark, image_content, created_at
FROM violation_records
WHERE created_at >= '2026-08-14 00:00:00'
  AND mark != 'EXCEL-2026.8.1-13'
ORDER BY id DESC
LIMIT 10;

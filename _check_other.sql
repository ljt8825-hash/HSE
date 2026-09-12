SELECT id, no, area_team, inspector_name, violator_name, violation_behavior,
       mark, image_content,
       LEFT(image_content, 60) AS img_preview,
       upload_time, created_at
FROM violation_records
WHERE created_at >= '2026-08-14 00:00:00'
  AND NOT (mark = 'EXCEL-2026.8.1-13')
  AND NOT ((mark IS NULL OR mark = '') AND (image_content IS NULL OR image_content = ''))
  AND NOT (mark = '是')
LIMIT 5;

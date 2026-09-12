SELECT COUNT(*) AS total,
       COUNT(*) FILTER (WHERE mark IS NOT NULL AND mark != '') AS has_mark,
       COUNT(*) FILTER (WHERE mark = 'EXCEL-2026.8.1-13') AS mark_excel,
       COUNT(*) FILTER (WHERE mark IS NULL OR mark = '') AS no_mark,
       COUNT(*) FILTER (WHERE image_content IS NOT NULL AND image_content != '') AS has_image,
       COUNT(*) FILTER (WHERE violation_behavior = '无三违行为') AS placeholder
FROM violation_records;

SELECT COUNT(*) AS total,
       COUNT(*) FILTER (WHERE mark = 'EXCEL-2026.8.1-13') AS good_825,
       COUNT(*) FILTER (WHERE mark IS NULL OR mark = '') AS no_mark,
       COUNT(*) FILTER (WHERE image_content IS NOT NULL AND image_content != '') AS has_img,
       COUNT(*) FILTER (WHERE created_at >= '2026-08-14') AS today_cnt
FROM violation_records;

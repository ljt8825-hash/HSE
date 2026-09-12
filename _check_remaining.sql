-- Check remaining bad records (empty mark, created today, no image)
SELECT COUNT(*) AS remaining_bad,
       (SELECT COUNT(*) FROM violation_records WHERE created_at >= '2026-08-14') AS total_today
FROM violation_records
WHERE created_at >= '2026-08-14 00:00:00'
  AND (mark IS NULL OR mark = '')
  AND (image_content IS NULL OR image_content = '');

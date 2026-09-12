SELECT
  CASE WHEN mark = 'EXCEL-2026.8.1-13' THEN '1st_good'
       WHEN mark = '是' THEN '2nd_bad_mark_is'
       WHEN (mark IS NULL OR mark = '') AND (image_content IS NULL OR image_content = '') THEN '2nd_bad_empty'
       WHEN (mark IS NULL OR mark = '') AND (image_content IS NOT NULL AND image_content != '') THEN '2nd_no_mark_has_img'
       ELSE 'other'
  END AS category,
  COUNT(*) AS cnt
FROM violation_records
WHERE created_at >= '2026-08-14 00:00:00'
GROUP BY 1
ORDER BY cnt DESC;

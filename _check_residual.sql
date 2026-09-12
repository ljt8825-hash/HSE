SELECT COUNT(*) AS cnt,
       MIN(created_at) AS min_created,
       MAX(created_at) AS max_created,
       mark
FROM violation_records
WHERE (mark IS NULL OR mark = '')
  AND (image_content IS NULL OR image_content = '')
GROUP BY mark
ORDER BY cnt DESC;

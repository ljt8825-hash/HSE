SELECT mark, COUNT(*) AS cnt,
       COUNT(*) FILTER (WHERE image_content IS NOT NULL AND image_content != '') AS has_img,
       MIN(upload_time) AS first_upload,
       MAX(upload_time) AS last_upload
FROM violation_records
GROUP BY mark
ORDER BY cnt DESC;

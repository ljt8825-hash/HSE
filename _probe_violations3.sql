SELECT id, no, area_team, violator_name, violation_behavior,
       mark, image_content,
       LEFT(image_content, 80) AS img_preview,
       upload_time
FROM violation_records
WHERE mark = '是'
ORDER BY id
LIMIT 5;

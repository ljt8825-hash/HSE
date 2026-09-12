-- Check the latest batch (second import) details
SELECT id, no, area_team, inspector_name, violator_name, violation_behavior,
       mark, image_content, upload_time, created_at
FROM violation_records
WHERE mark = '' OR mark = '是'
ORDER BY id DESC
LIMIT 10;

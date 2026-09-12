-- Delete the bad second-import records (created today, wrong column mapping)
-- Criteria: created today AND (mark='' OR mark='是') AND no proper image_content
DELETE FROM violation_records
WHERE created_at >= '2026-08-14 00:00:00'
  AND (mark = '' OR mark = '是')
  AND (image_content IS NULL OR image_content = '');

-- Bad 2nd-import records: created today + no looks like date (column misalignment signature)
SELECT COUNT(*) AS bad_to_delete
FROM violation_records
WHERE created_at >= '2026-08-14 00:00:00'
  AND (mark IS NULL OR mark = '' OR mark = '是')
  AND no ~ '^2026/[0-9]{2}/[0-9]{2}';

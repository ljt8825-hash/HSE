-- Delete all remaining bad records from second import today (not the good 825)
DELETE FROM violation_records
WHERE created_at >= '2026-08-14 00:00:00'
  AND mark != 'EXCEL-2026.8.1-13';

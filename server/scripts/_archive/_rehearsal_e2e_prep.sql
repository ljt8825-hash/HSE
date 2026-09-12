-- Find an employee with id_card_hash for E2E test
SELECT e.id, e.name, e.id_card_hash, e.id_card_encrypted
FROM employee e
WHERE e.is_deleted = false
  AND e.id_card_hash IS NOT NULL
LIMIT 3;

-- Check the training_records table structure for id_card column
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'training_records'
  AND column_name IN ('id_card', 'employee_id', 'name')
ORDER BY column_name;

-- Check violation_records table for violator_id_card column
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'violation_records'
  AND column_name IN ('violator_id_card', 'violator_id', 'violator_name')
ORDER BY column_name;

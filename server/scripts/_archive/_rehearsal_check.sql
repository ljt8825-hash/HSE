-- Check why training records can't be backfilled
SELECT COUNT(*) AS matching_employees
FROM employee e
WHERE e.name = (SELECT name FROM training_records WHERE id = 839)
  AND e.is_deleted = false;

-- Check if there are any employees with demo names
SELECT e.id, e.name, e.id_card_hash IS NOT NULL AS has_hash
FROM employee e
WHERE e.name LIKE '演示%'
  AND e.is_deleted = false
LIMIT 5;

-- Check id_card_hash existence in employee table
SELECT
    COUNT(*) AS total_employees,
    COUNT(CASE WHEN id_card_hash IS NOT NULL THEN 1 END) AS has_hash,
    COUNT(CASE WHEN id_card_hash IS NULL THEN 1 END) AS no_hash
FROM employee
WHERE is_deleted = false;

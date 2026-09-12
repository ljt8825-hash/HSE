-- Get employee id_card_hash for E2E test
-- Employee id=5364, name=张三
SELECT e.id, e.name, e.id_card_hash
FROM employee e
WHERE e.id = 5364 AND e.is_deleted = false;

-- Also check if name 张三 is unique (for name-based resolution)
SELECT COUNT(*) AS name_count FROM employee WHERE name = '张三' AND is_deleted = false;

-- Get one more employee for training test
SELECT e.id, e.name, e.id_card_hash
FROM employee e
WHERE e.is_deleted = false AND e.id_card_hash IS NOT NULL AND e.id != 5364
LIMIT 1;

-- B-0 Recovery (single session)
DO $$
DECLARE rec_count INTEGER;
BEGIN
    UPDATE employee
    SET is_deleted = false, updated_at = NOW()
    WHERE id IN (
        SELECT DISTINCT her.employee_id
        FROM hse_employee_relation her
        JOIN employee e ON e.id = her.employee_id
        WHERE her.is_deleted = false
          AND her.is_current = true
          AND e.is_deleted = true
    ) AND is_deleted = true;

    GET DIAGNOSTICS rec_count = ROW_COUNT;
    RAISE NOTICE 'B-0 恢复员工数: %', rec_count;
END $$;

-- Post-verification
SELECT
    COUNT(*) AS total_in_backup,
    COUNT(CASE WHEN e.is_deleted = false THEN 1 END) AS recovered_active,
    COUNT(CASE WHEN e.is_deleted = true THEN 1 END) AS still_deleted
FROM employee_b0_backup_20260728 b
JOIN employee e ON e.id = b.id;

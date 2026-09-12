-- ============================================================
-- FK Phase 4 (提示词-67) B-3 删除孤儿 + B-4 验证清零
-- 三表无防改触发器（已确认），直接 DELETE
-- 父表：employee(id) / position(id)
-- 删除在事务内执行，验证孤儿=0 后 COMMIT，否则 ROLLBACK
-- ============================================================

BEGIN;

-- 删除 employee_induction_training 孤儿（employee_id 或 position_id 在父表不存在）
DELETE FROM employee_induction_training
WHERE employee_id NOT IN (SELECT id FROM employee)
   OR position_id NOT IN (SELECT id FROM position);

-- 删除 employee_training_status 孤儿
DELETE FROM employee_training_status
WHERE employee_id NOT IN (SELECT id FROM employee)
   OR position_id NOT IN (SELECT id FROM position);

-- 删除 position_safety_profile 孤儿
DELETE FROM position_safety_profile
WHERE position_id NOT IN (SELECT id FROM position);

-- B-4: 验证孤儿=0（任一 >0 则抛异常回滚）
DO $$
DECLARE
  v1 int; v2 int; v3 int; v4 int; v5 int;
BEGIN
  SELECT COUNT(*) INTO v1 FROM employee_induction_training t LEFT JOIN employee e ON t.employee_id=e.id WHERE t.employee_id IS NOT NULL AND e.id IS NULL;
  SELECT COUNT(*) INTO v2 FROM employee_induction_training t LEFT JOIN position p ON t.position_id=p.id WHERE t.position_id IS NOT NULL AND p.id IS NULL;
  SELECT COUNT(*) INTO v3 FROM employee_training_status t LEFT JOIN employee e ON t.employee_id=e.id WHERE t.employee_id IS NOT NULL AND e.id IS NULL;
  SELECT COUNT(*) INTO v4 FROM employee_training_status t LEFT JOIN position p ON t.position_id=p.id WHERE t.position_id IS NOT NULL AND p.id IS NULL;
  SELECT COUNT(*) INTO v5 FROM position_safety_profile t LEFT JOIN position p ON t.position_id=p.id WHERE t.position_id IS NOT NULL AND p.id IS NULL;
  RAISE NOTICE '孤儿复核 eit.emp=%, eit.pos=%, ets.emp=%, ets.pos=%, psp.pos=%', v1, v2, v3, v4, v5;
  IF (v1+v2+v3+v4+v5) > 0 THEN
    RAISE EXCEPTION 'B-4 验证失败：仍存在孤儿 (%,%,%,%,%)，回滚', v1, v2, v3, v4, v5;
  END IF;
END $$;

COMMIT;

-- 验证触发器：is_current 翻转放行；内容列修改/删除拦截
BEGIN;
-- 1) is_current 翻转应放行
UPDATE hse_deduction_adjustment SET is_current = FALSE WHERE id = 17;
SELECT '1.is_current翻转' AS step, is_current FROM hse_deduction_adjustment WHERE id = 17;
ROLLBACK;

-- 2) 内容列修改应拦截
BEGIN;
DO $$
BEGIN
  BEGIN
    UPDATE hse_deduction_adjustment SET new_score = 99 WHERE id = 17;
    RAISE EXCEPTION 'FAIL: 内容列修改未被拦截';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%仅允许修改is_current%' THEN
      RAISE NOTICE '2.内容列修改被正确拦截: %', SQLERRM;
    ELSE
      RAISE EXCEPTION 'FAIL: 拦截异常信息不符: %', SQLERRM;
    END IF;
  END;
END $$;
ROLLBACK;

-- 3) DELETE 应拦截
BEGIN;
DO $$
BEGIN
  BEGIN
    DELETE FROM hse_deduction_adjustment WHERE id = 17;
    RAISE EXCEPTION 'FAIL: DELETE未被拦截';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%禁止DELETE%' THEN
      RAISE NOTICE '3.DELETE被正确拦截: %', SQLERRM;
    ELSE
      RAISE EXCEPTION 'FAIL: DELETE拦截异常信息不符: %', SQLERRM;
    END IF;
  END;
END $$;
ROLLBACK;

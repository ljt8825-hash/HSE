-- 提示词-65 B-4/B-5：创建 2 条 FK 约束（幂等）
-- fk_deduction_adjust_adjusted_by  → hse_deduction_adjustment.adjusted_by → employee(id) ON DELETE SET NULL
-- fk_assessment_audit_operator     → hse_assessment_audit_log.operator_id → employee(id) ON DELETE SET NULL
-- 两列当前为 NOT NULL；ON DELETE SET NULL 要求目标列可空，故先 DROP NOT NULL（幂等，已可空则无副作用）。

DO $$
BEGIN
  -- 1) 确保列可空（ON DELETE SET NULL 需要）
  BEGIN
    ALTER TABLE hse_deduction_adjustment ALTER COLUMN adjusted_by DROP NOT NULL;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    ALTER TABLE hse_assessment_audit_log ALTER COLUMN operator_id DROP NOT NULL;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- 2a) fk_deduction_adjust_adjusted_by
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_deduction_adjust_adjusted_by') THEN
    ALTER TABLE hse_deduction_adjustment
      ADD CONSTRAINT fk_deduction_adjust_adjusted_by
      FOREIGN KEY (adjusted_by) REFERENCES employee(id)
      ON DELETE SET NULL;
    RAISE NOTICE 'created fk_deduction_adjust_adjusted_by';
  ELSE
    RAISE NOTICE 'fk_deduction_adjust_adjusted_by already exists, skip';
  END IF;

  -- 2b) fk_assessment_audit_operator
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_assessment_audit_operator') THEN
    ALTER TABLE hse_assessment_audit_log
      ADD CONSTRAINT fk_assessment_audit_operator
      FOREIGN KEY (operator_id) REFERENCES employee(id)
      ON DELETE SET NULL;
    RAISE NOTICE 'created fk_assessment_audit_operator';
  ELSE
    RAISE NOTICE 'fk_assessment_audit_operator already exists, skip';
  END IF;
END $$;

-- B-5：验证 2 条 FK 存在及其父表/删除策略
SELECT conname,
       conrelid::regclass::text AS tbl,
       (SELECT relname FROM pg_class WHERE oid = (SELECT confrelid FROM pg_constraint c2 WHERE c2.conname = c.conname)) AS referenced_tbl,
       (SELECT delete_rule FROM information_schema.referential_constraints WHERE constraint_name = c.conname) AS on_delete
FROM pg_constraint c
WHERE contype = 'f'
  AND conname IN ('fk_deduction_adjust_adjusted_by', 'fk_assessment_audit_operator')
ORDER BY conname;

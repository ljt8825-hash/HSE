-- 提示词-66（FK Phase3 TK-03/TK-04）收尾：补列 + 建 FK
-- 背景：实时库 hse_events 无 personnel_id、hse_reviews 无 reviewer_id（schema 迁移未落实）。
-- 门控偏差后，按"完善功能"授权执行本脚本：仅操作这两张表，0 业务代码改动。
-- 数据现状：hse_events 仅 6 行且 created_by 全 NULL；hse_reviews 0 行 → 无历史数据可回填，加列零风险。
-- 幂等：ADD COLUMN / ADD CONSTRAINT 均带存在性门控，可安全重跑。

-- ============================================================
-- Step 1: 补齐缺失列（可空 BIGINT）
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='hse_events' AND column_name='personnel_id'
  ) THEN
    ALTER TABLE hse_events ADD COLUMN personnel_id BIGINT;
    RAISE NOTICE '✅ hse_events.personnel_id added';
  ELSE
    RAISE NOTICE '⏭ hse_events.personnel_id already exists';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='hse_reviews' AND column_name='reviewer_id'
  ) THEN
    ALTER TABLE hse_reviews ADD COLUMN reviewer_id BIGINT;
    RAISE NOTICE '✅ hse_reviews.reviewer_id added';
  ELSE
    RAISE NOTICE '⏭ hse_reviews.reviewer_id already exists';
  END IF;
END $$;

-- ============================================================
-- Step 2: 建 FK 约束（→ employee(id) ON DELETE SET NULL）
-- ============================================================
DO $$
BEGIN
  -- FK-03: hse_events.personnel_id → employee(id)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_hse_events_personnel'
  ) THEN
    ALTER TABLE hse_events
      ADD CONSTRAINT fk_hse_events_personnel
      FOREIGN KEY (personnel_id) REFERENCES employee(id)
      ON DELETE SET NULL;
    RAISE NOTICE '✅ fk_hse_events_personnel created';
  ELSE
    RAISE NOTICE '⏭ fk_hse_events_personnel already exists';
  END IF;

  -- FK-04: hse_reviews.reviewer_id → employee(id)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_hse_reviews_reviewer'
  ) THEN
    ALTER TABLE hse_reviews
      ADD CONSTRAINT fk_hse_reviews_reviewer
      FOREIGN KEY (reviewer_id) REFERENCES employee(id)
      ON DELETE SET NULL;
    RAISE NOTICE '✅ fk_hse_reviews_reviewer created';
  ELSE
    RAISE NOTICE '⏭ fk_hse_reviews_reviewer already exists';
  END IF;
END $$;

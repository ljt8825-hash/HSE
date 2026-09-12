-- ============================================================
-- 月度培训台账导入存储表（培训记录「按培训人员汇总」覆盖口径）
-- 用途：将 Excel「月度培训台账」按培训人汇总后落库，覆盖系统按
--       组织架构/培训记录动态计算出的 应培训/实际/缺少 数值。
-- 口径：培训人数→应培训、未培训人数→实际、缺少签字人数→缺少、资料不完整→资料不完整
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_training_ledger_monthly (
  id SERIAL PRIMARY KEY,
  trainer_id INT,                        -- 培训人员 employee_id（姓名未匹配时为 NULL）
  trainer_name TEXT NOT NULL,            -- 培训人姓名
  month CHAR(7) NOT NULL,                -- 月份 YYYY-MM
  expected_count INT NOT NULL DEFAULT 0, -- 应培训人数（= Excel 培训人数）
  actual_count INT NOT NULL DEFAULT 0,   -- 实际培训人数（= Excel 未培训人数）
  missing_count INT NOT NULL DEFAULT 0,  -- 缺少人数（= Excel 缺少签字人数）
  incomplete_count INT NOT NULL DEFAULT 0, -- 资料不完整（= Excel 资料不完整）
  source TEXT DEFAULT 'excel-import',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (trainer_id, month)
);

CREATE INDEX IF NOT EXISTS idx_hse_training_ledger_monthly_month
  ON hse_training_ledger_monthly(month);

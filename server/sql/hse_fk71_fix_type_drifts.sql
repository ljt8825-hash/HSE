-- 提示词-71 任务C：修复 4 处类型漂移（均为 widening 安全转换，不丢精度）
--   integer -> NUMERIC：PostgreSQL 隐式可转，无数据丢失
--   date    -> TIMESTAMPTZ：隐式转换（date '2026-01-01' -> '2026-01-01 00:00:00+00'），无数据丢失
-- 均为安全 widening，无需 USING 子句。幂等（重复执行等价 no-op）。

BEGIN;

-- integer -> numeric (widening)
ALTER TABLE hse_risk_factors     ALTER COLUMN risk_value          TYPE NUMERIC(6,2);
ALTER TABLE hse_control_measures ALTER COLUMN effectiveness_score TYPE NUMERIC(4,2);
ALTER TABLE hse_reviews          ALTER COLUMN score               TYPE NUMERIC(4,2);

-- date -> timestamptz (widening, 隐式转换)
ALTER TABLE hse_rectifications   ALTER COLUMN deadline            TYPE TIMESTAMPTZ;

COMMIT;

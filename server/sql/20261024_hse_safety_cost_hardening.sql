-- ============================================================================
-- 20261024 P2 安全生产费用域 硬化迁移（幂等；仅可在 safety_dashboard_dev 执行）
-- ----------------------------------------------------------------------------
-- 目标：修正1 事务 / 修正2 金额校验与冲销 / 修正4 审批防重 所需的 schema 支撑。
-- 原则：仅新增（ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS），
--       不删除、不改名、不改既有数据、绝不自动清理任何真实业务记录。
--
-- 1) record_type（normal | reversal）：
--    退款 / 冲销 / 更正是「独立的反向记录」，绝不修改或删除历史原始记录。
--    净额 = SUM(normal) - SUM(reversal)，由查询层按 record_type 计算。
--
-- 2) 唯一约束 uq_cost_commitment_active_per_request：
--    每个费用申请同一时刻仅允许一条「有效(active)」承诺，作为并发审批防重复
--    占用资金的数据库层硬约束（backstop）。
--    若历史已存在重复有效承诺，则不建索引并 RAISE NOTICE 提示，交由人工核对
--    （绝不自动删除真实业务记录）；应用层另用 SELECT ... FOR UPDATE 行锁串行化
--    同一申请的并发审批，故即便未建索引，功能正确性仍不受影响。
-- ============================================================================

ALTER TABLE hse_cost_actual     ADD COLUMN IF NOT EXISTS record_type VARCHAR(16) DEFAULT 'normal';
ALTER TABLE hse_cost_allocation ADD COLUMN IF NOT EXISTS record_type VARCHAR(16) DEFAULT 'normal';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'uq_cost_commitment_active_per_request' AND c.relkind = 'i'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM (
        SELECT request_id FROM hse_cost_commitment
        WHERE is_deleted = false AND status = 'active'
        GROUP BY request_id HAVING COUNT(*) > 1
      ) dup
    ) THEN
      RAISE NOTICE 'hse_cost_commitment 存在重复有效承诺，跳过创建唯一索引 uq_cost_commitment_active_per_request；请人工核对重复承诺（应用层已用 FOR UPDATE 行锁串行化审批，功能不受影响，切勿未经确认删除真实记录）。';
    ELSE
      EXECUTE 'CREATE UNIQUE INDEX uq_cost_commitment_active_per_request ON hse_cost_commitment(request_id) WHERE is_deleted = false AND status = ''active''';
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cost_actual_record_type ON hse_cost_actual(record_type) WHERE NOT is_deleted;

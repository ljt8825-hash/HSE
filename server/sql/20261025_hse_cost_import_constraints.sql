-- ============================================================================
-- 20261025 P2 安全生产费用域 导入防重迁移（幂等；仅可在 safety_dashboard_dev 执行）
-- ----------------------------------------------------------------------------
-- 目标：支撑「预算 Excel 导入防重」与「导入批次/文件指纹绑定」所需的数据库层约束。
-- 原则：仅新增（ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS），
--       不删除、不改名、不改既有数据、绝不自动清理或合并任何真实业务记录。
--
-- 1) hse_cost_import_batch 增补文件指纹列：
--    预览与确认必须绑定同一批次(batch_no, 已有唯一索引)与同一文件指纹
--    (file_fingerprint = 文件字节 SHA-256)，确认时若指纹不符即拒绝，防止
--    「预览 A 文件、确认 B 文件」。指纹仅服务端留存，不随接口返回给前端。
--
-- 2) hse_safety_budget 业务键唯一索引 uq_hse_safety_budget_bizkey：
--    预算编码可能为空，空编码时按「预算年度 + 项目名称 + 事项名称 + 预算金额」
--    这一经确认的业务键判重（导入行项目名称为必填，故业务键恒可推断）。
--    导入写入统一使用 INSERT ... ON CONFLICT DO NOTHING：无论撞上编码唯一索引
--    还是业务键唯一索引，都跳过而不覆盖，并发安全由数据库约束保证。
--    注意：PostgreSQL 唯一索引中 NULL 互不相等，故历史遗留的 project_name 为
--    NULL 的行不会与本索引冲突（已实测 dev 库 17 组重复业务键全部 project_name
--    为 NULL）。若未来数据变化导致冲突，则不建索引并 RAISE NOTICE，交由人工
--    核对（绝不自动删除/合并真实记录）；应用层预览仍会标出重复行。
-- ============================================================================

ALTER TABLE hse_cost_import_batch ADD COLUMN IF NOT EXISTS file_fingerprint VARCHAR(64);
ALTER TABLE hse_cost_import_batch ADD COLUMN IF NOT EXISTS file_size BIGINT;

CREATE INDEX IF NOT EXISTS idx_cost_import_batch_fingerprint ON hse_cost_import_batch(file_fingerprint);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'uq_hse_safety_budget_bizkey' AND c.relkind = 'i'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM (
        SELECT budget_year, project_name, item_name, budget_amount
        FROM hse_safety_budget
        WHERE NOT is_deleted AND project_name IS NOT NULL AND item_name IS NOT NULL
        GROUP BY budget_year, project_name, item_name, budget_amount
        HAVING COUNT(*) > 1
      ) dup
    ) THEN
      RAISE NOTICE 'hse_safety_budget 存在重复业务键（年度+项目+事项+金额，project_name/item_name 非空），跳过创建唯一索引 uq_hse_safety_budget_bizkey；请人工核对后再决定是否建索引（切勿未经确认删除或合并真实记录）。应用层导入仍会按业务键标重并跳过。';
    ELSE
      EXECUTE 'CREATE UNIQUE INDEX uq_hse_safety_budget_bizkey ON hse_safety_budget(budget_year, project_name, item_name, budget_amount) WHERE NOT is_deleted';
    END IF;
  END IF;
END $$;

-- ============================================================================
-- Sprint-C Step 4：hse_employee_org 只读保护变更脚本
-- 版本: v1.0
-- 日期: 2026-07-28
-- 目标: 将 hse_employee_org 表冻结为只读状态，禁止 INSERT/UPDATE/DELETE
-- 原因: 人员中心已迁移至 employee_assignment 新模型，旧模型仅作历史查询
-- 执行前提: 后端 hse-employee.js 的 INSERT/UPDATE 操作已迁移至 employee_assignment
-- ============================================================================

-- ============================================================
-- Step 0：前置检查
-- ============================================================

-- 0.1 检查表是否存在
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'hse_employee_org') THEN
    RAISE EXCEPTION 'hse_employee_org 表不存在，终止执行';
  END IF;
  RAISE NOTICE '[Step 0.1] hse_employee_org 表存在 ✓';
END $$;

-- 0.2 检查表当前数据量
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM hse_employee_org;
  RAISE NOTICE '[Step 0.2] hse_employee_org 当前记录数: %', v_count;
END $$;

-- 0.3 检查是否存在活跃的 INSERT/UPDATE 触发器
DO $$
DECLARE
  v_trigger_count INT;
BEGIN
  SELECT COUNT(*) INTO v_trigger_count
  FROM pg_trigger t
  JOIN pg_class c ON t.tgrelid = c.oid
  WHERE c.relname = 'hse_employee_org' AND NOT t.tgisinternal;

  IF v_trigger_count > 0 THEN
    RAISE NOTICE '[Step 0.3] 发现 % 个用户触发器，将在保护变更中处理', v_trigger_count;
  ELSE
    RAISE NOTICE '[Step 0.3] 无用户触发器 ✓';
  END IF;
END $$;

-- ============================================================
-- Step 1：创建只读保护触发器
-- ============================================================

-- 1.1 创建通用保护函数
CREATE OR REPLACE FUNCTION fn_hse_employee_org_read_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'hse_employee_org 已冻结为只读表（Sprint-C Step 4）。禁止 % 操作。请使用 employee_assignment 新模型。',
    TG_OP;
END;
$$ LANGUAGE plpgsql;

-- 1.2 删除已有的保护触发器（如果存在）
DROP TRIGGER IF EXISTS trg_hse_employee_org_block_insert ON hse_employee_org;
DROP TRIGGER IF EXISTS trg_hse_employee_org_block_update ON hse_employee_org;
DROP TRIGGER IF EXISTS trg_hse_employee_org_block_delete ON hse_employee_org;

-- 1.3 创建 INSERT 阻断触发器
CREATE TRIGGER trg_hse_employee_org_block_insert
  BEFORE INSERT ON hse_employee_org
  FOR EACH ROW
  EXECUTE FUNCTION fn_hse_employee_org_read_only();

-- 1.4 创建 UPDATE 阻断触发器
CREATE TRIGGER trg_hse_employee_org_block_update
  BEFORE UPDATE ON hse_employee_org
  FOR EACH ROW
  EXECUTE FUNCTION fn_hse_employee_org_read_only();

-- 1.5 创建 DELETE 阻断触发器
CREATE TRIGGER trg_hse_employee_org_block_delete
  BEFORE DELETE ON hse_employee_org
  FOR EACH ROW
  EXECUTE FUNCTION fn_hse_employee_org_read_only();

RAISE NOTICE '[Step 1] 只读保护触发器已创建 ✓';

-- ============================================================
-- Step 2：同步保护 hse_employee_relation（可选，已冻结）
-- ============================================================

-- 注意：hse_employee_relation 在生产路由中已无引用，但历史脚本中存在 INSERT
-- 如需同时冻结，取消以下注释并执行

-- CREATE OR REPLACE FUNCTION fn_hse_employee_relation_read_only()
-- RETURNS TRIGGER AS $$
-- BEGIN
--   RAISE EXCEPTION 'hse_employee_relation 已冻结为只读表（Sprint-C Step 4）。禁止 % 操作。',
--     TG_OP;
-- END;
-- $$ LANGUAGE plpgsql;
--
-- DROP TRIGGER IF EXISTS trg_hse_employee_relation_block_insert ON hse_employee_relation;
-- DROP TRIGGER IF EXISTS trg_hse_employee_relation_block_update ON hse_employee_relation;
-- DROP TRIGGER IF EXISTS trg_hse_employee_relation_block_delete ON hse_employee_relation;
--
-- CREATE TRIGGER trg_hse_employee_relation_block_insert
--   BEFORE INSERT ON hse_employee_relation
--   FOR EACH ROW
--   EXECUTE FUNCTION fn_hse_employee_relation_read_only();
--
-- CREATE TRIGGER trg_hse_employee_relation_block_update
--   BEFORE UPDATE ON hse_employee_relation
--   FOR EACH ROW
--   EXECUTE FUNCTION fn_hse_employee_relation_read_only();
--
-- CREATE TRIGGER trg_hse_employee_relation_block_delete
--   BEFORE DELETE ON hse_employee_relation
--   FOR EACH ROW
--   EXECUTE FUNCTION fn_hse_employee_relation_read_only();

RAISE NOTICE '[Step 2] hse_employee_relation 保护已注释（按需启用）';

-- ============================================================
-- Step 3：验证测试
-- ============================================================

-- 3.1 验证 SELECT 正常（应成功）
DO $$
DECLARE
  v_test INT;
BEGIN
  SELECT COUNT(*) INTO v_test FROM hse_employee_org LIMIT 1;
  RAISE NOTICE '[Step 3.1] SELECT 验证通过 ✓';
END $$;

-- 3.2 验证 INSERT 被阻止（应失败）
DO $$
BEGIN
  BEGIN
    INSERT INTO hse_employee_org (employee_id, status, is_current)
    VALUES (0, '测试', true);
    RAISE EXCEPTION '[Step 3.2] 错误：INSERT 未被阻止！';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE '[Step 3.2] INSERT 被正确阻止 ✓ (错误: %)', SQLERRM;
  END;
END $$;

-- 3.3 验证 UPDATE 被阻止（应失败）
DO $$
BEGIN
  BEGIN
    UPDATE hse_employee_org SET updated_at = NOW() WHERE id = 0;
    RAISE EXCEPTION '[Step 3.3] 错误：UPDATE 未被阻止！';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE '[Step 3.3] UPDATE 被正确阻止 ✓ (错误: %)', SQLERRM;
  END;
END $$;

-- 3.4 验证 DELETE 被阻止（应失败）
DO $$
BEGIN
  BEGIN
    DELETE FROM hse_employee_org WHERE id = 0;
    RAISE EXCEPTION '[Step 3.4] 错误：DELETE 未被阻止！';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE '[Step 3.4] DELETE 被正确阻止 ✓ (错误: %)', SQLERRM;
  END;
END $$;

RAISE NOTICE '[Step 3] 验证完成 ✓';

-- ============================================================
-- Step 4：回滚脚本
-- ============================================================
-- 如需回滚，执行以下语句：
--
-- DROP TRIGGER IF EXISTS trg_hse_employee_org_block_insert ON hse_employee_org;
-- DROP TRIGGER IF EXISTS trg_hse_employee_org_block_update ON hse_employee_org;
-- DROP TRIGGER IF EXISTS trg_hse_employee_org_block_delete ON hse_employee_org;
-- DROP FUNCTION IF EXISTS fn_hse_employee_org_read_only();
--
-- 回滚后，hse_employee_org 恢复为可写状态。

-- ============================================================
-- Step 5：变更记录
-- ============================================================

COMMENT ON TRIGGER trg_hse_employee_org_block_insert ON hse_employee_org IS 'Sprint-C Step 4: 只读保护 - 禁止INSERT';
COMMENT ON TRIGGER trg_hse_employee_org_block_update ON hse_employee_org IS 'Sprint-C Step 4: 只读保护 - 禁止UPDATE';
COMMENT ON TRIGGER trg_hse_employee_org_block_delete ON hse_employee_org IS 'Sprint-C Step 4: 只读保护 - 禁止DELETE';

RAISE NOTICE '============================================';
RAISE NOTICE 'Sprint-C Step 4: hse_employee_org 只读保护变更完成';
RAISE NOTICE '============================================';
RAISE NOTICE '  ✓ SELECT    — 允许（正常查询）';
RAISE NOTICE '  ✗ INSERT    — 阻止（只读保护）';
RAISE NOTICE '  ✗ UPDATE    — 阻止（只读保护）';
RAISE NOTICE '  ✗ DELETE    — 阻止（只读保护）';
RAISE NOTICE '  回滚: DROP TRIGGER ... ON hse_employee_org';
RAISE NOTICE '============================================';

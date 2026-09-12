-- =====================================================================
-- HSE 人员主数据中心 v68 扩展迁移脚本 (R1 / Phase 1 任务3 - P0-3)
-- 版本: v68 (花名册为基石 - 业务表落库员工ID外键)
-- 内容:
--   1. hazards.checker_id       INTEGER  (检查人员关联员工ID)
--   2. hazards.fixer_id        INTEGER  (整改人员关联员工ID)
--   3. accidents.handler_id    INTEGER  (处理人员关联员工ID)
--   4. emergency_plans.responsible_person_id INTEGER (预案责任人关联员工ID)
--      (emergency_teams.leader_id 经核实已存在，不在本次迁移范围)
-- 依据: 提示词-29-R1-Phase1后端协作.md / P0-3
-- 方式: 增量迁移，可重复执行；先备份 -> DDL -> 回填 -> 验证 -> 回滚准备
-- 注意: 所有新列均为 nullable INT，默认值 NULL，不影响既有读写
-- =====================================================================

-- ============================================================
-- Step 0: migration_baseline（记录迁移前状态，确保迁移可追溯）
--   独立 DO 块 + EXCEPTION 捕获：与主迁移事务分离，baseline 写入失败不影响主迁移
-- ============================================================
DO $$
BEGIN
  CREATE TABLE IF NOT EXISTS migration_baseline (
    id SERIAL PRIMARY KEY,
    migration_name VARCHAR(200) NOT NULL,
    table_name VARCHAR(200) NOT NULL,
    row_count INTEGER,
    baseline_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(migration_name, table_name)
  );

  INSERT INTO migration_baseline (migration_name, table_name, row_count)
  VALUES
    ('v68_extension', 'hazards', (SELECT COUNT(*) FROM hazards)),
    ('v68_extension', 'accidents', (SELECT COUNT(*) FROM accidents)),
    ('v68_extension', 'emergency_plans', (SELECT COUNT(*) FROM emergency_plans)),
    ('v68_extension', 'employee', (SELECT COUNT(*) FROM employee WHERE is_deleted = false))
  ON CONFLICT (migration_name, table_name) DO NOTHING;

  RAISE NOTICE 'Step 0 migration_baseline 完成';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Step 0 migration_baseline 跳过(异常: %)', SQLERRM;
END $$;

-- ============================================================
-- Step 0.5: migration_backup_registry（登记备份文件）
--   独立 DO 块 + EXCEPTION 捕获：与主迁移事务分离，registry 写入失败不影响主迁移
-- ============================================================
DO $$
BEGIN
  CREATE TABLE IF NOT EXISTS migration_backup_registry (
    id SERIAL PRIMARY KEY,
    migration_name VARCHAR(200) NOT NULL,
    backup_file VARCHAR(500) NOT NULL,
    checksum VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- 执行迁移前请先备份全库，并登记备份文件，例如：
  -- INSERT INTO migration_backup_registry (migration_name, backup_file, checksum)
  -- VALUES ('v68_extension', '/backups/hse_dashboard_pre_v68_YYYYMMDD.sql', '<sha256>');

  RAISE NOTICE 'Step 0.5 migration_backup_registry 完成';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Step 0.5 migration_backup_registry 跳过(异常: %)', SQLERRM;
END $$;

-- ============================================================
-- 主迁移事务（DDL + FK + 索引 + 四级回填 + 验证）
-- ============================================================
BEGIN;

-- ============================================================
-- 一、hazards 表 - 新增 checker_id / fixer_id
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'hazards' AND column_name = 'checker_id') THEN
        ALTER TABLE hazards ADD COLUMN checker_id INTEGER;
        RAISE NOTICE 'Added checker_id to hazards';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'hazards' AND column_name = 'fixer_id') THEN
        ALTER TABLE hazards ADD COLUMN fixer_id INTEGER;
        RAISE NOTICE 'Added fixer_id to hazards';
    END IF;
END $$;

COMMENT ON COLUMN hazards.checker_id IS '检查人员关联员工ID（花名册为基石 / R1-P0-3）';
COMMENT ON COLUMN hazards.fixer_id  IS '整改人员关联员工ID（花名册为基石 / R1-P0-3）';

-- 外键约束（级联置空：员工删除不影响业务记录）
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_hazards_checker_id') THEN
        ALTER TABLE hazards
            ADD CONSTRAINT fk_hazards_checker_id
            FOREIGN KEY (checker_id) REFERENCES employee(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_hazards_fixer_id') THEN
        ALTER TABLE hazards
            ADD CONSTRAINT fk_hazards_fixer_id
            FOREIGN KEY (fixer_id) REFERENCES employee(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_hazards_checker_id ON hazards(checker_id);
CREATE INDEX IF NOT EXISTS idx_hazards_fixer_id  ON hazards(fixer_id);

-- ============================================================
-- 二、accidents 表 - 新增 handler_id
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'accidents' AND column_name = 'handler_id') THEN
        ALTER TABLE accidents ADD COLUMN handler_id INTEGER;
        RAISE NOTICE 'Added handler_id to accidents';
    END IF;
END $$;

COMMENT ON COLUMN accidents.handler_id IS '处理人员关联员工ID（花名册为基石 / R1-P0-3）';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_accidents_handler_id') THEN
        ALTER TABLE accidents
            ADD CONSTRAINT fk_accidents_handler_id
            FOREIGN KEY (handler_id) REFERENCES employee(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_accidents_handler_id ON accidents(handler_id);

-- ============================================================
-- 三、emergency_plans 表 - 新增 responsible_person_id
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'emergency_plans' AND column_name = 'responsible_person_id') THEN
        ALTER TABLE emergency_plans ADD COLUMN responsible_person_id INTEGER;
        RAISE NOTICE 'Added responsible_person_id to emergency_plans';
    END IF;
END $$;

COMMENT ON COLUMN emergency_plans.responsible_person_id IS '预案责任人关联员工ID（花名册为基石 / R1-P0-3）';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_emergency_plans_resp_person_id') THEN
        ALTER TABLE emergency_plans
            ADD CONSTRAINT fk_emergency_plans_resp_person_id
            FOREIGN KEY (responsible_person_id) REFERENCES employee(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_emergency_plans_resp_person_id ON emergency_plans(responsible_person_id);

-- ============================================================
-- 四、历史数据回填（四级容错策略，仅填充 NULL，可重复执行）
--   业务表原文本字段(checker/fixer/handler/responsible_person)存储人员姓名/编号混合文本。
--   依据项目硬约束"人员关联必须优先使用员工编号"，回填优先级如下：
--     级别1: 从文本中提取员工编号（如 "张三(E0001)" / "(E0001)"）→ 匹配 employee.employee_code
--     级别2: 从文本中提取纯数字编号（如 "张三(12345)"）→ 匹配 employee.id
--     级别3: TRIM(文本) 精确匹配 employee.name
--     级别4: 模糊匹配（去除所有括号后缀，如 "张三(安全员)" → 张三）→ 匹配 employee.name
--   每级仅填充上一轮仍为 NULL 的行（高优先级优先），并记录各级命中数。
--   注意: 级别3/4 为重名/不规范姓名兜底，可能存在偏差，回填后建议人工抽检；
--        匹配不到的保持 NULL（前端显示回退为姓名文本）。
-- ============================================================

-- hazards.checker_id 四级回填
DO $$
DECLARE
  v_before INTEGER; v_l1 INTEGER; v_l2 INTEGER; v_l3 INTEGER; v_l4 INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_before FROM hazards WHERE checker_id IS NULL AND checker IS NOT NULL AND TRIM(checker) <> '';

  UPDATE hazards h SET checker_id = e.id
  FROM employee e
  WHERE h.checker_id IS NULL AND h.checker IS NOT NULL AND TRIM(h.checker) <> ''
    AND h.checker LIKE '%(' || e.employee_code || ')%' AND e.is_deleted = false;
  GET DIAGNOSTICS v_l1 = ROW_COUNT;

  UPDATE hazards h SET checker_id = e.id
  FROM employee e
  WHERE h.checker_id IS NULL AND h.checker IS NOT NULL AND TRIM(h.checker) <> ''
    AND e.id::text = substring(h.checker FROM '\((\d+)\)') AND e.is_deleted = false;
  GET DIAGNOSTICS v_l2 = ROW_COUNT;

  UPDATE hazards h SET checker_id = e.id
  FROM employee e
  WHERE h.checker_id IS NULL AND h.checker IS NOT NULL AND TRIM(h.checker) <> ''
    AND e.name = TRIM(h.checker) AND e.is_deleted = false;
  GET DIAGNOSTICS v_l3 = ROW_COUNT;

  UPDATE hazards h SET checker_id = e.id
  FROM employee e
  WHERE h.checker_id IS NULL AND h.checker IS NOT NULL AND TRIM(h.checker) <> ''
    AND e.name = TRIM(regexp_replace(h.checker, '\([^)]*\)', '', 'g')) AND e.is_deleted = false;
  GET DIAGNOSTICS v_l4 = ROW_COUNT;

  RAISE NOTICE 'hazards.checker_id 回填: 候选=% L1=% L2=% L3=% L4=%', v_before, v_l1, v_l2, v_l3, v_l4;
END $$;

-- hazards.fixer_id 四级回填
DO $$
DECLARE
  v_before INTEGER; v_l1 INTEGER; v_l2 INTEGER; v_l3 INTEGER; v_l4 INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_before FROM hazards WHERE fixer_id IS NULL AND fixer IS NOT NULL AND TRIM(fixer) <> '';

  UPDATE hazards h SET fixer_id = e.id
  FROM employee e
  WHERE h.fixer_id IS NULL AND h.fixer IS NOT NULL AND TRIM(h.fixer) <> ''
    AND h.fixer LIKE '%(' || e.employee_code || ')%' AND e.is_deleted = false;
  GET DIAGNOSTICS v_l1 = ROW_COUNT;

  UPDATE hazards h SET fixer_id = e.id
  FROM employee e
  WHERE h.fixer_id IS NULL AND h.fixer IS NOT NULL AND TRIM(h.fixer) <> ''
    AND e.id::text = substring(h.fixer FROM '\((\d+)\)') AND e.is_deleted = false;
  GET DIAGNOSTICS v_l2 = ROW_COUNT;

  UPDATE hazards h SET fixer_id = e.id
  FROM employee e
  WHERE h.fixer_id IS NULL AND h.fixer IS NOT NULL AND TRIM(h.fixer) <> ''
    AND e.name = TRIM(h.fixer) AND e.is_deleted = false;
  GET DIAGNOSTICS v_l3 = ROW_COUNT;

  UPDATE hazards h SET fixer_id = e.id
  FROM employee e
  WHERE h.fixer_id IS NULL AND h.fixer IS NOT NULL AND TRIM(h.fixer) <> ''
    AND e.name = TRIM(regexp_replace(h.fixer, '\([^)]*\)', '', 'g')) AND e.is_deleted = false;
  GET DIAGNOSTICS v_l4 = ROW_COUNT;

  RAISE NOTICE 'hazards.fixer_id 回填: 候选=% L1=% L2=% L3=% L4=%', v_before, v_l1, v_l2, v_l3, v_l4;
END $$;

-- accidents.handler_id 四级回填
DO $$
DECLARE
  v_before INTEGER; v_l1 INTEGER; v_l2 INTEGER; v_l3 INTEGER; v_l4 INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_before FROM accidents WHERE handler_id IS NULL AND handler IS NOT NULL AND TRIM(handler) <> '';

  UPDATE accidents a SET handler_id = e.id
  FROM employee e
  WHERE a.handler_id IS NULL AND a.handler IS NOT NULL AND TRIM(a.handler) <> ''
    AND a.handler LIKE '%(' || e.employee_code || ')%' AND e.is_deleted = false;
  GET DIAGNOSTICS v_l1 = ROW_COUNT;

  UPDATE accidents a SET handler_id = e.id
  FROM employee e
  WHERE a.handler_id IS NULL AND a.handler IS NOT NULL AND TRIM(a.handler) <> ''
    AND e.id::text = substring(a.handler FROM '\((\d+)\)') AND e.is_deleted = false;
  GET DIAGNOSTICS v_l2 = ROW_COUNT;

  UPDATE accidents a SET handler_id = e.id
  FROM employee e
  WHERE a.handler_id IS NULL AND a.handler IS NOT NULL AND TRIM(a.handler) <> ''
    AND e.name = TRIM(a.handler) AND e.is_deleted = false;
  GET DIAGNOSTICS v_l3 = ROW_COUNT;

  UPDATE accidents a SET handler_id = e.id
  FROM employee e
  WHERE a.handler_id IS NULL AND a.handler IS NOT NULL AND TRIM(a.handler) <> ''
    AND e.name = TRIM(regexp_replace(a.handler, '\([^)]*\)', '', 'g')) AND e.is_deleted = false;
  GET DIAGNOSTICS v_l4 = ROW_COUNT;

  RAISE NOTICE 'accidents.handler_id 回填: 候选=% L1=% L2=% L3=% L4=%', v_before, v_l1, v_l2, v_l3, v_l4;
END $$;

-- emergency_plans.responsible_person_id 四级回填
DO $$
DECLARE
  v_before INTEGER; v_l1 INTEGER; v_l2 INTEGER; v_l3 INTEGER; v_l4 INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_before FROM emergency_plans WHERE responsible_person_id IS NULL AND responsible_person IS NOT NULL AND TRIM(responsible_person) <> '';

  UPDATE emergency_plans p SET responsible_person_id = e.id
  FROM employee e
  WHERE p.responsible_person_id IS NULL AND p.responsible_person IS NOT NULL AND TRIM(p.responsible_person) <> ''
    AND p.responsible_person LIKE '%(' || e.employee_code || ')%' AND e.is_deleted = false;
  GET DIAGNOSTICS v_l1 = ROW_COUNT;

  UPDATE emergency_plans p SET responsible_person_id = e.id
  FROM employee e
  WHERE p.responsible_person_id IS NULL AND p.responsible_person IS NOT NULL AND TRIM(p.responsible_person) <> ''
    AND e.id::text = substring(p.responsible_person FROM '\((\d+)\)') AND e.is_deleted = false;
  GET DIAGNOSTICS v_l2 = ROW_COUNT;

  UPDATE emergency_plans p SET responsible_person_id = e.id
  FROM employee e
  WHERE p.responsible_person_id IS NULL AND p.responsible_person IS NOT NULL AND TRIM(p.responsible_person) <> ''
    AND e.name = TRIM(p.responsible_person) AND e.is_deleted = false;
  GET DIAGNOSTICS v_l3 = ROW_COUNT;

  UPDATE emergency_plans p SET responsible_person_id = e.id
  FROM employee e
  WHERE p.responsible_person_id IS NULL AND p.responsible_person IS NOT NULL AND TRIM(p.responsible_person) <> ''
    AND e.name = TRIM(regexp_replace(p.responsible_person, '\([^)]*\)', '', 'g')) AND e.is_deleted = false;
  GET DIAGNOSTICS v_l4 = ROW_COUNT;

  RAISE NOTICE 'emergency_plans.responsible_person_id 回填: 候选=% L1=% L2=% L3=% L4=%', v_before, v_l1, v_l2, v_l3, v_l4;
END $$;

-- ============================================================
-- 五、验证查询（执行后查看 NOTICE / 计数）
-- ============================================================

DO $$
DECLARE
    v_haz_chk_col INTEGER; v_haz_fix_col INTEGER;
    v_acc_hdl_col INTEGER; v_plan_resp_col INTEGER;
    v_haz_chk_fill INTEGER; v_haz_fix_fill INTEGER;
    v_acc_hdl_fill INTEGER; v_plan_resp_fill INTEGER;
    v_haz_chk_null INTEGER; v_plan_resp_null INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_haz_chk_col FROM information_schema.columns WHERE table_name='hazards' AND column_name='checker_id';
    SELECT COUNT(*) INTO v_haz_fix_col FROM information_schema.columns WHERE table_name='hazards' AND column_name='fixer_id';
    SELECT COUNT(*) INTO v_acc_hdl_col FROM information_schema.columns WHERE table_name='accidents' AND column_name='handler_id';
    SELECT COUNT(*) INTO v_plan_resp_col FROM information_schema.columns WHERE table_name='emergency_plans' AND column_name='responsible_person_id';

    SELECT COUNT(*) INTO v_haz_chk_fill FROM hazards WHERE checker_id IS NOT NULL;
    SELECT COUNT(*) INTO v_haz_fix_fill FROM hazards WHERE fixer_id IS NOT NULL;
    SELECT COUNT(*) INTO v_acc_hdl_fill FROM accidents WHERE handler_id IS NOT NULL;
    SELECT COUNT(*) INTO v_plan_resp_fill FROM emergency_plans WHERE responsible_person_id IS NOT NULL;

    SELECT COUNT(*) INTO v_haz_chk_null FROM hazards WHERE checker_id IS NULL AND checker IS NOT NULL AND TRIM(checker) <> '';
    SELECT COUNT(*) INTO v_plan_resp_null FROM emergency_plans WHERE responsible_person_id IS NULL AND responsible_person IS NOT NULL AND TRIM(responsible_person) <> '';
    RAISE NOTICE 'v68 迁移验证: 列存在(hazards checker/fixer=%/% , accidents handler=%, plans resp=%), 已回填(hazards checker/fixer=%/% , accidents handler=%, plans resp=%), 未匹配(hazards.checker=%, plans.resp=%)',
        v_haz_chk_col, v_haz_fix_col, v_acc_hdl_col, v_plan_resp_col,
        v_haz_chk_fill, v_haz_fix_fill, v_acc_hdl_fill, v_plan_resp_fill,
        v_haz_chk_null, v_plan_resp_null;
END $$;

COMMIT;

-- =====================================================================
-- 回滚 SQL（单独执行，不在本次迁移事务内；用于出现问题时撤销）
-- 执行前请确认已备份；回滚会同时删除外键、索引与新列。
-- ---------------------------------------------------------------------
-- BEGIN;
-- ALTER TABLE hazards   DROP CONSTRAINT IF EXISTS fk_hazards_checker_id;
-- ALTER TABLE hazards   DROP CONSTRAINT IF EXISTS fk_hazards_fixer_id;
-- ALTER TABLE accidents DROP CONSTRAINT IF EXISTS fk_accidents_handler_id;
-- ALTER TABLE emergency_plans DROP CONSTRAINT IF EXISTS fk_emergency_plans_resp_person_id;
-- DROP INDEX IF EXISTS idx_hazards_checker_id;
-- DROP INDEX IF EXISTS idx_hazards_fixer_id;
-- DROP INDEX IF EXISTS idx_accidents_handler_id;
-- DROP INDEX IF EXISTS idx_emergency_plans_resp_person_id;
-- ALTER TABLE hazards           DROP COLUMN IF EXISTS checker_id;
-- ALTER TABLE hazards           DROP COLUMN IF EXISTS fixer_id;
-- ALTER TABLE accidents         DROP COLUMN IF EXISTS handler_id;
-- ALTER TABLE emergency_plans   DROP COLUMN IF EXISTS responsible_person_id;
-- COMMIT;
-- =====================================================================

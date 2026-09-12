-- ============================================================
-- FK 约束补全 Phase 1：培训 + 三违 + 目标责任模块
-- 日期：2026-07-30
-- 前置：hse_fk_audit_phase1.sql 审计通过 + hse_fk_orphan_cleanup_phase1.sql 门控通过
-- 依赖：employee(id), position(id), hse_org_unit(id) 主键已存在
-- 特性：DO $$ 块幂等（判列存在性 + 约束存在性 + 孤儿门控），可重跑
--
-- 实勘修正（相对提示词-53 §3 原始 ALTER 清单）：
--   1) 全部用 DO 块包裹，先判列存在性 / 约束存在性，保证幂等可重跑。
--   2) 审计发现 5 个列存在孤儿，且【全部为 NOT NULL】：
--        - employee_induction_training.employee_id   (16)
--        - employee_induction_training.position_id   (16)
--        - employee_training_status.employee_id     (16)
--        - employee_training_status.position_id      (16)
--        - position_safety_profile.position_id       (24)
--      按处理规则【NOT NULL 活跃孤儿不得强制 SET NULL，必须标记人工介入】，
--      这 5 条 FK 本轮跳过（孤儿门控：孤儿>0 则不建），待数据修复后重跑本脚本自动补建。
--   3) 其余 17 个候选列审计孤儿=0，直接建立约束。
--   4) ON DELETE 策略：employee 引用→SET NULL；position 元数据表(training_requirement/
--      safety_profile)→CASCADE；其余→SET NULL。
-- 实际新建 FK = 17 条（清单 22 条 - 5 个 NOT NULL 孤儿跳过）。
-- ============================================================

-- ========================
-- 1. 培训模块 (8 个候选 FK：3 直接建 + 5 跳过)
-- ========================

-- 1.1 training_record.employee_id (孤儿=0，直接建)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='training_record' AND column_name='employee_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_training_record_employee') THEN
    ALTER TABLE training_record ADD CONSTRAINT fk_training_record_employee
      FOREIGN KEY (employee_id) REFERENCES employee(id) ON DELETE SET NULL;
    RAISE NOTICE 'created fk_training_record_employee';
  END IF;
END $$;

-- 1.2 training_record.position_id (孤儿=0，直接建)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='training_record' AND column_name='position_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_training_record_position') THEN
    ALTER TABLE training_record ADD CONSTRAINT fk_training_record_position
      FOREIGN KEY (position_id) REFERENCES position(id) ON DELETE SET NULL;
    RAISE NOTICE 'created fk_training_record_position';
  END IF;
END $$;

-- 1.3 employee_induction_training.employee_id (NOT NULL，16 孤儿→跳过，人工介入)
DO $$
DECLARE v_orphan INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employee_induction_training' AND column_name='employee_id') THEN
    RAISE NOTICE 'SKIP fk_induction_training_employee: 列不存在';
  ELSIF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_induction_training_employee') THEN
    SELECT COUNT(*) INTO v_orphan FROM employee_induction_training t
      LEFT JOIN employee e ON t.employee_id = e.id
      WHERE t.employee_id IS NOT NULL AND e.id IS NULL;
    IF v_orphan > 0 THEN
      RAISE NOTICE 'SKIP fk_induction_training_employee: 列 NOT NULL 且孤儿=% 行，按红线跳过，待人工介入修复数据', v_orphan;
    ELSE
      ALTER TABLE employee_induction_training ADD CONSTRAINT fk_induction_training_employee
        FOREIGN KEY (employee_id) REFERENCES employee(id) ON DELETE SET NULL;
      RAISE NOTICE 'created fk_induction_training_employee';
    END IF;
  ELSE
    RAISE NOTICE 'fk_induction_training_employee already exists, skip';
  END IF;
END $$;

-- 1.4 employee_induction_training.position_id (NOT NULL，16 孤儿→跳过，人工介入)
DO $$
DECLARE v_orphan INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employee_induction_training' AND column_name='position_id') THEN
    RAISE NOTICE 'SKIP fk_induction_training_position: 列不存在';
  ELSIF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_induction_training_position') THEN
    SELECT COUNT(*) INTO v_orphan FROM employee_induction_training t
      LEFT JOIN position p ON t.position_id = p.id
      WHERE t.position_id IS NOT NULL AND p.id IS NULL;
    IF v_orphan > 0 THEN
      RAISE NOTICE 'SKIP fk_induction_training_position: 列 NOT NULL 且孤儿=% 行，按红线跳过，待人工介入修复数据', v_orphan;
    ELSE
      ALTER TABLE employee_induction_training ADD CONSTRAINT fk_induction_training_position
        FOREIGN KEY (position_id) REFERENCES position(id) ON DELETE SET NULL;
      RAISE NOTICE 'created fk_induction_training_position';
    END IF;
  ELSE
    RAISE NOTICE 'fk_induction_training_position already exists, skip';
  END IF;
END $$;

-- 1.5 employee_training_status.employee_id (NOT NULL，16 孤儿→跳过，人工介入)
DO $$
DECLARE v_orphan INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employee_training_status' AND column_name='employee_id') THEN
    RAISE NOTICE 'SKIP fk_training_status_employee: 列不存在';
  ELSIF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_training_status_employee') THEN
    SELECT COUNT(*) INTO v_orphan FROM employee_training_status t
      LEFT JOIN employee e ON t.employee_id = e.id
      WHERE t.employee_id IS NOT NULL AND e.id IS NULL;
    IF v_orphan > 0 THEN
      RAISE NOTICE 'SKIP fk_training_status_employee: 列 NOT NULL 且孤儿=% 行，按红线跳过，待人工介入修复数据', v_orphan;
    ELSE
      ALTER TABLE employee_training_status ADD CONSTRAINT fk_training_status_employee
        FOREIGN KEY (employee_id) REFERENCES employee(id) ON DELETE SET NULL;
      RAISE NOTICE 'created fk_training_status_employee';
    END IF;
  ELSE
    RAISE NOTICE 'fk_training_status_employee already exists, skip';
  END IF;
END $$;

-- 1.6 employee_training_status.position_id (NOT NULL，16 孤儿→跳过，人工介入)
DO $$
DECLARE v_orphan INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employee_training_status' AND column_name='position_id') THEN
    RAISE NOTICE 'SKIP fk_training_status_position: 列不存在';
  ELSIF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_training_status_position') THEN
    SELECT COUNT(*) INTO v_orphan FROM employee_training_status t
      LEFT JOIN position p ON t.position_id = p.id
      WHERE t.position_id IS NOT NULL AND p.id IS NULL;
    IF v_orphan > 0 THEN
      RAISE NOTICE 'SKIP fk_training_status_position: 列 NOT NULL 且孤儿=% 行，按红线跳过，待人工介入修复数据', v_orphan;
    ELSE
      ALTER TABLE employee_training_status ADD CONSTRAINT fk_training_status_position
        FOREIGN KEY (position_id) REFERENCES position(id) ON DELETE SET NULL;
      RAISE NOTICE 'created fk_training_status_position';
    END IF;
  ELSE
    RAISE NOTICE 'fk_training_status_position already exists, skip';
  END IF;
END $$;

-- 1.7 position_training_requirement.position_id (孤儿=0，直接建，CASCADE)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='position_training_requirement' AND column_name='position_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_training_req_position') THEN
    ALTER TABLE position_training_requirement ADD CONSTRAINT fk_training_req_position
      FOREIGN KEY (position_id) REFERENCES position(id) ON DELETE CASCADE;
    RAISE NOTICE 'created fk_training_req_position';
  END IF;
END $$;

-- 1.8 position_safety_profile.position_id (NOT NULL，24 孤儿→跳过，人工介入)
DO $$
DECLARE v_orphan INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='position_safety_profile' AND column_name='position_id') THEN
    RAISE NOTICE 'SKIP fk_safety_profile_position: 列不存在';
  ELSIF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_safety_profile_position') THEN
    SELECT COUNT(*) INTO v_orphan FROM position_safety_profile t
      LEFT JOIN position p ON t.position_id = p.id
      WHERE t.position_id IS NOT NULL AND p.id IS NULL;
    IF v_orphan > 0 THEN
      RAISE NOTICE 'SKIP fk_safety_profile_position: 列 NOT NULL 且孤儿=% 行，按红线跳过，待人工介入修复数据', v_orphan;
    ELSE
      ALTER TABLE position_safety_profile ADD CONSTRAINT fk_safety_profile_position
        FOREIGN KEY (position_id) REFERENCES position(id) ON DELETE CASCADE;
      RAISE NOTICE 'created fk_safety_profile_position';
    END IF;
  ELSE
    RAISE NOTICE 'fk_safety_profile_position already exists, skip';
  END IF;
END $$;

-- ========================
-- 2. 三违模块 (4 个 FK，孤儿=0，直接建)
-- ========================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='violation_records' AND column_name='violator_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_violation_violator') THEN
    ALTER TABLE violation_records ADD CONSTRAINT fk_violation_violator
      FOREIGN KEY (violator_id) REFERENCES employee(id) ON DELETE SET NULL;
    RAISE NOTICE 'created fk_violation_violator';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='violation_records' AND column_name='inspector_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_violation_inspector') THEN
    ALTER TABLE violation_records ADD CONSTRAINT fk_violation_inspector
      FOREIGN KEY (inspector_id) REFERENCES employee(id) ON DELETE SET NULL;
    RAISE NOTICE 'created fk_violation_inspector';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='violation_records' AND column_name='handler_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_violation_handler') THEN
    ALTER TABLE violation_records ADD CONSTRAINT fk_violation_handler
      FOREIGN KEY (handler_id) REFERENCES employee(id) ON DELETE SET NULL;
    RAISE NOTICE 'created fk_violation_handler';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='violation_records' AND column_name='punisher_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_violation_punisher') THEN
    ALTER TABLE violation_records ADD CONSTRAINT fk_violation_punisher
      FOREIGN KEY (punisher_id) REFERENCES employee(id) ON DELETE SET NULL;
    RAISE NOTICE 'created fk_violation_punisher';
  END IF;
END $$;

-- ========================
-- 3. 目标责任模块 (10 个 FK，孤儿=0，直接建)
-- ========================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='safety_goals' AND column_name='responsible_person_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_safety_goals_responsible') THEN
    ALTER TABLE safety_goals ADD CONSTRAINT fk_safety_goals_responsible
      FOREIGN KEY (responsible_person_id) REFERENCES employee(id) ON DELETE SET NULL;
    RAISE NOTICE 'created fk_safety_goals_responsible';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hse_target_contracts' AND column_name='signer_employee_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_target_contracts_signer') THEN
    ALTER TABLE hse_target_contracts ADD CONSTRAINT fk_target_contracts_signer
      FOREIGN KEY (signer_employee_id) REFERENCES employee(id) ON DELETE SET NULL;
    RAISE NOTICE 'created fk_target_contracts_signer';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hse_target_contracts' AND column_name='signee_employee_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_target_contracts_signee') THEN
    ALTER TABLE hse_target_contracts ADD CONSTRAINT fk_target_contracts_signee
      FOREIGN KEY (signee_employee_id) REFERENCES employee(id) ON DELETE SET NULL;
    RAISE NOTICE 'created fk_target_contracts_signee';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hse_target_contracts' AND column_name='org_unit_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_target_contracts_org') THEN
    ALTER TABLE hse_target_contracts ADD CONSTRAINT fk_target_contracts_org
      FOREIGN KEY (org_unit_id) REFERENCES hse_org_unit(id) ON DELETE SET NULL;
    RAISE NOTICE 'created fk_target_contracts_org';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hse_safety_committee' AND column_name='employee_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_safety_committee_employee') THEN
    ALTER TABLE hse_safety_committee ADD CONSTRAINT fk_safety_committee_employee
      FOREIGN KEY (employee_id) REFERENCES employee(id) ON DELETE SET NULL;
    RAISE NOTICE 'created fk_safety_committee_employee';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hse_safety_committee' AND column_name='org_unit_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_safety_committee_org') THEN
    ALTER TABLE hse_safety_committee ADD CONSTRAINT fk_safety_committee_org
      FOREIGN KEY (org_unit_id) REFERENCES hse_org_unit(id) ON DELETE SET NULL;
    RAISE NOTICE 'created fk_safety_committee_org';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hse_responsibility_assessment' AND column_name='employee_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_resp_assessment_employee') THEN
    ALTER TABLE hse_responsibility_assessment ADD CONSTRAINT fk_resp_assessment_employee
      FOREIGN KEY (employee_id) REFERENCES employee(id) ON DELETE SET NULL;
    RAISE NOTICE 'created fk_resp_assessment_employee';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hse_responsibility_assessment' AND column_name='org_unit_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_resp_assessment_org') THEN
    ALTER TABLE hse_responsibility_assessment ADD CONSTRAINT fk_resp_assessment_org
      FOREIGN KEY (org_unit_id) REFERENCES hse_org_unit(id) ON DELETE SET NULL;
    RAISE NOTICE 'created fk_resp_assessment_org';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hse_safety_budget' AND column_name='org_unit_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_safety_budget_org') THEN
    ALTER TABLE hse_safety_budget ADD CONSTRAINT fk_safety_budget_org
      FOREIGN KEY (org_unit_id) REFERENCES hse_org_unit(id) ON DELETE SET NULL;
    RAISE NOTICE 'created fk_safety_budget_org';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hse_safety_budget' AND column_name='responsible_employee_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_safety_budget_responsible') THEN
    ALTER TABLE hse_safety_budget ADD CONSTRAINT fk_safety_budget_responsible
      FOREIGN KEY (responsible_employee_id) REFERENCES employee(id) ON DELETE SET NULL;
    RAISE NOTICE 'created fk_safety_budget_responsible';
  END IF;
END $$;

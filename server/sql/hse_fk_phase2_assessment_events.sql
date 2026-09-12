-- ============================================================
-- FK 约束补全 Phase 2：考核 + HSE 核心事件 + employee_assignment
-- 日期：2026-07-30
-- 前置：hse_fk_audit_phase2.sql 审计通过
-- 依赖：employee(id), position(id), hse_org_unit(id) 主键已存在
--
-- 实勘修正（相对提示词原文）：
--   1) 全部用 DO 块包裹，先判列存在性 / 约束存在性，保证幂等可重跑。
--   2) hse_events.personnel_id 与 hse_reviews.reviewer_id 两列在实库【不存在】，
--      对应 FK 跳过（提示词假设错误）。
--   3) hse_deduction_adjustment.adjusted_by、hse_assessment_audit_log.operator_id
--      为 NOT NULL 且审计存在孤儿引用(>0)，按处理规则【跳过，人工介入】。
--   4) employee_assignment.employee_id 已有 FK fk_assignment_employee 覆盖，跳过。
--   5) hse_assessment_cycle.created_by / frozen_by 为可空且有孤儿(4/1)，
--      先 SET NULL 清理再建约束。
-- 实际新建 FK = 16 条（提示词清单 21 条 - 2 列不存在 - 2 NOT NULL孤儿 - 1 已存在）。
-- ============================================================

BEGIN;

-- ========================
-- 1. 考核核心表
-- ========================

-- 1.1 hse_assessment_cycle.created_by (可空, 4孤儿→清理后建)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hse_assessment_cycle' AND column_name='created_by') THEN
    RAISE NOTICE 'SKIP fk_assessment_cycle_created_by: 列不存在';
  ELSIF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_assessment_cycle_created_by') THEN
    UPDATE hse_assessment_cycle SET created_by = NULL
     WHERE created_by IS NOT NULL AND created_by NOT IN (SELECT id FROM employee WHERE is_deleted = false);
    ALTER TABLE hse_assessment_cycle
      ADD CONSTRAINT fk_assessment_cycle_created_by
        FOREIGN KEY (created_by) REFERENCES employee(id) ON DELETE SET NULL;
    RAISE NOTICE 'created fk_assessment_cycle_created_by';
  ELSE
    RAISE NOTICE 'fk_assessment_cycle_created_by already exists, skip';
  END IF;
END $$;

-- 1.1 hse_assessment_cycle.frozen_by (可空, 1孤儿→清理后建)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hse_assessment_cycle' AND column_name='frozen_by') THEN
    RAISE NOTICE 'SKIP fk_assessment_cycle_frozen_by: 列不存在';
  ELSIF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_assessment_cycle_frozen_by') THEN
    UPDATE hse_assessment_cycle SET frozen_by = NULL
     WHERE frozen_by IS NOT NULL AND frozen_by NOT IN (SELECT id FROM employee WHERE is_deleted = false);
    ALTER TABLE hse_assessment_cycle
      ADD CONSTRAINT fk_assessment_cycle_frozen_by
        FOREIGN KEY (frozen_by) REFERENCES employee(id) ON DELETE SET NULL;
    RAISE NOTICE 'created fk_assessment_cycle_frozen_by';
  ELSE
    RAISE NOTICE 'fk_assessment_cycle_frozen_by already exists, skip';
  END IF;
END $$;

-- 1.2 hse_assessment_target.employee_id (NOT NULL, 孤儿=0→直接建)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hse_assessment_target' AND column_name='employee_id') THEN
    RAISE NOTICE 'SKIP fk_assessment_target_employee: 列不存在';
  ELSIF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_assessment_target_employee') THEN
    ALTER TABLE hse_assessment_target
      ADD CONSTRAINT fk_assessment_target_employee
        FOREIGN KEY (employee_id) REFERENCES employee(id) ON DELETE SET NULL;
    RAISE NOTICE 'created fk_assessment_target_employee';
  ELSE
    RAISE NOTICE 'fk_assessment_target_employee already exists, skip';
  END IF;
END $$;

-- 1.3 hse_assessment_deduction.violator_id (可空, 孤儿=0→直接建)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hse_assessment_deduction' AND column_name='violator_id') THEN
    RAISE NOTICE 'SKIP fk_assessment_deduction_violator: 列不存在';
  ELSIF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_assessment_deduction_violator') THEN
    ALTER TABLE hse_assessment_deduction
      ADD CONSTRAINT fk_assessment_deduction_violator
        FOREIGN KEY (violator_id) REFERENCES employee(id) ON DELETE SET NULL;
    RAISE NOTICE 'created fk_assessment_deduction_violator';
  ELSE
    RAISE NOTICE 'fk_assessment_deduction_violator already exists, skip';
  END IF;
END $$;

-- 1.4 hse_deduction_adjustment.adjusted_by (NOT NULL, 孤儿=4→跳过人工介入)
DO $$
DECLARE v_cnt int;
BEGIN
  SELECT COUNT(*) INTO v_cnt FROM hse_deduction_adjustment a
    LEFT JOIN employee e ON a.adjusted_by = e.id AND e.is_deleted = false
    WHERE a.adjusted_by IS NOT NULL AND e.id IS NULL;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_deduction_adjust_adjusted_by') THEN
    RAISE NOTICE 'fk_deduction_adjust_adjusted_by already exists, skip';
  ELSE
    RAISE NOTICE 'SKIP fk_deduction_adjust_adjusted_by: adjusted_by 为 NOT NULL 且存在 % 条孤儿引用(is_deleted=false)，需人工补全 employee 记录后再建 FK', v_cnt;
  END IF;
END $$;

-- 1.4 hse_deduction_adjustment.reviewed_by (可空, 孤儿=0→直接建)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hse_deduction_adjustment' AND column_name='reviewed_by') THEN
    RAISE NOTICE 'SKIP fk_deduction_adjust_reviewed_by: 列不存在';
  ELSIF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_deduction_adjust_reviewed_by') THEN
    ALTER TABLE hse_deduction_adjustment
      ADD CONSTRAINT fk_deduction_adjust_reviewed_by
        FOREIGN KEY (reviewed_by) REFERENCES employee(id) ON DELETE SET NULL;
    RAISE NOTICE 'created fk_deduction_adjust_reviewed_by';
  ELSE
    RAISE NOTICE 'fk_deduction_adjust_reviewed_by already exists, skip';
  END IF;
END $$;

-- 1.5 hse_responsibility_chain.subordinate_id (NOT NULL, 孤儿=0→直接建)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hse_responsibility_chain' AND column_name='subordinate_id') THEN
    RAISE NOTICE 'SKIP fk_resp_chain_subordinate: 列不存在';
  ELSIF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_resp_chain_subordinate') THEN
    ALTER TABLE hse_responsibility_chain
      ADD CONSTRAINT fk_resp_chain_subordinate
        FOREIGN KEY (subordinate_id) REFERENCES employee(id) ON DELETE SET NULL;
    RAISE NOTICE 'created fk_resp_chain_subordinate';
  ELSE
    RAISE NOTICE 'fk_resp_chain_subordinate already exists, skip';
  END IF;
END $$;

-- 1.5 hse_responsibility_chain.manager_id (NOT NULL, 孤儿=0→直接建)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hse_responsibility_chain' AND column_name='manager_id') THEN
    RAISE NOTICE 'SKIP fk_resp_chain_manager: 列不存在';
  ELSIF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_resp_chain_manager') THEN
    ALTER TABLE hse_responsibility_chain
      ADD CONSTRAINT fk_resp_chain_manager
        FOREIGN KEY (manager_id) REFERENCES employee(id) ON DELETE SET NULL;
    RAISE NOTICE 'created fk_resp_chain_manager';
  ELSE
    RAISE NOTICE 'fk_resp_chain_manager already exists, skip';
  END IF;
END $$;

-- 1.6 hse_assessment_audit_log.operator_id (NOT NULL, 孤儿=49→跳过人工介入)
DO $$
DECLARE v_cnt int;
BEGIN
  SELECT COUNT(*) INTO v_cnt FROM hse_assessment_audit_log l
    LEFT JOIN employee e ON l.operator_id = e.id AND e.is_deleted = false
    WHERE l.operator_id IS NOT NULL AND e.id IS NULL;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_assessment_audit_operator') THEN
    RAISE NOTICE 'fk_assessment_audit_operator already exists, skip';
  ELSE
    RAISE NOTICE 'SKIP fk_assessment_audit_operator: operator_id 为 NOT NULL 且存在 % 条孤儿引用(is_deleted=false)，需人工补全 employee 记录后再建 FK', v_cnt;
  END IF;
END $$;

-- ========================
-- 2. HSE 核心事件表
-- ========================

-- 2.1 hse_events.personnel_id —— 实库该列不存在，跳过
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hse_events' AND column_name='personnel_id') THEN
    RAISE NOTICE 'SKIP fk_hse_events_personnel: 列 hse_events.personnel_id 在实库中不存在（提示词假设错误），无法建 FK';
  ELSIF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_hse_events_personnel') THEN
    ALTER TABLE hse_events
      ADD CONSTRAINT fk_hse_events_personnel
        FOREIGN KEY (personnel_id) REFERENCES employee(id) ON DELETE SET NULL;
    RAISE NOTICE 'created fk_hse_events_personnel';
  ELSE
    RAISE NOTICE 'fk_hse_events_personnel already exists, skip';
  END IF;
END $$;

-- 2.1 hse_events.department_id (可空, 孤儿=0→直接建, 引用 hse_org_unit)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hse_events' AND column_name='department_id') THEN
    RAISE NOTICE 'SKIP fk_hse_events_department: 列不存在';
  ELSIF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_hse_events_department') THEN
    ALTER TABLE hse_events
      ADD CONSTRAINT fk_hse_events_department
        FOREIGN KEY (department_id) REFERENCES hse_org_unit(id) ON DELETE SET NULL;
    RAISE NOTICE 'created fk_hse_events_department';
  ELSE
    RAISE NOTICE 'fk_hse_events_department already exists, skip';
  END IF;
END $$;

-- 2.2 hse_event_timeline.actor_id (可空, 孤儿=0→直接建)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hse_event_timeline' AND column_name='actor_id') THEN
    RAISE NOTICE 'SKIP fk_event_timeline_actor: 列不存在';
  ELSIF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_event_timeline_actor') THEN
    ALTER TABLE hse_event_timeline
      ADD CONSTRAINT fk_event_timeline_actor
        FOREIGN KEY (actor_id) REFERENCES employee(id) ON DELETE SET NULL;
    RAISE NOTICE 'created fk_event_timeline_actor';
  ELSE
    RAISE NOTICE 'fk_event_timeline_actor already exists, skip';
  END IF;
END $$;

-- 2.3 hse_control_measures.responsible_person_id (可空, 孤儿=0→直接建)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hse_control_measures' AND column_name='responsible_person_id') THEN
    RAISE NOTICE 'SKIP fk_control_measures_responsible: 列不存在';
  ELSIF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_control_measures_responsible') THEN
    ALTER TABLE hse_control_measures
      ADD CONSTRAINT fk_control_measures_responsible
        FOREIGN KEY (responsible_person_id) REFERENCES employee(id) ON DELETE SET NULL;
    RAISE NOTICE 'created fk_control_measures_responsible';
  ELSE
    RAISE NOTICE 'fk_control_measures_responsible already exists, skip';
  END IF;
END $$;

-- 2.3 hse_control_measures.department_id (可空, 孤儿=0→直接建, 引用 hse_org_unit)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hse_control_measures' AND column_name='department_id') THEN
    RAISE NOTICE 'SKIP fk_control_measures_department: 列不存在';
  ELSIF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_control_measures_department') THEN
    ALTER TABLE hse_control_measures
      ADD CONSTRAINT fk_control_measures_department
        FOREIGN KEY (department_id) REFERENCES hse_org_unit(id) ON DELETE SET NULL;
    RAISE NOTICE 'created fk_control_measures_department';
  ELSE
    RAISE NOTICE 'fk_control_measures_department already exists, skip';
  END IF;
END $$;

-- 2.4 hse_rectifications.responsible_person_id (可空, 孤儿=0→直接建)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hse_rectifications' AND column_name='responsible_person_id') THEN
    RAISE NOTICE 'SKIP fk_rectifications_responsible: 列不存在';
  ELSIF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_rectifications_responsible') THEN
    ALTER TABLE hse_rectifications
      ADD CONSTRAINT fk_rectifications_responsible
        FOREIGN KEY (responsible_person_id) REFERENCES employee(id) ON DELETE SET NULL;
    RAISE NOTICE 'created fk_rectifications_responsible';
  ELSE
    RAISE NOTICE 'fk_rectifications_responsible already exists, skip';
  END IF;
END $$;

-- 2.4 hse_rectifications.department_id (可空, 孤儿=0→直接建, 引用 hse_org_unit)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hse_rectifications' AND column_name='department_id') THEN
    RAISE NOTICE 'SKIP fk_rectifications_department: 列不存在';
  ELSIF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_rectifications_department') THEN
    ALTER TABLE hse_rectifications
      ADD CONSTRAINT fk_rectifications_department
        FOREIGN KEY (department_id) REFERENCES hse_org_unit(id) ON DELETE SET NULL;
    RAISE NOTICE 'created fk_rectifications_department';
  ELSE
    RAISE NOTICE 'fk_rectifications_department already exists, skip';
  END IF;
END $$;

-- 2.5 hse_reviews.reviewer_id —— 实库该列不存在(仅有 reviewer_name)，跳过
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hse_reviews' AND column_name='reviewer_id') THEN
    RAISE NOTICE 'SKIP fk_reviews_reviewer: 列 hse_reviews.reviewer_id 在实库中不存在(仅有 reviewer_name)，无法建 FK（提示词假设错误）';
  ELSIF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_reviews_reviewer') THEN
    ALTER TABLE hse_reviews
      ADD CONSTRAINT fk_reviews_reviewer
        FOREIGN KEY (reviewer_id) REFERENCES employee(id) ON DELETE SET NULL;
    RAISE NOTICE 'created fk_reviews_reviewer';
  ELSE
    RAISE NOTICE 'fk_reviews_reviewer already exists, skip';
  END IF;
END $$;

-- ========================
-- 3. employee_assignment（基础设施表）
-- ========================

-- 3. employee_id：已被既有 FK fk_assignment_employee 覆盖（ON DELETE CASCADE），不重复建
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_assignment_employee') THEN
    RAISE NOTICE 'SKIP fk_employee_assignment_employee: employee_assignment.employee_id 已由既有 FK fk_assignment_employee 保护';
  ELSIF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_employee_assignment_employee') THEN
    ALTER TABLE employee_assignment
      ADD CONSTRAINT fk_employee_assignment_employee
        FOREIGN KEY (employee_id) REFERENCES employee(id) ON DELETE CASCADE;
    RAISE NOTICE 'created fk_employee_assignment_employee';
  ELSE
    RAISE NOTICE 'fk_employee_assignment_employee already exists, skip';
  END IF;
END $$;

-- 3. supervisor_id (可空, 孤儿=0→直接建)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employee_assignment' AND column_name='supervisor_id') THEN
    RAISE NOTICE 'SKIP fk_employee_assignment_supervisor: 列不存在';
  ELSIF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_employee_assignment_supervisor') THEN
    ALTER TABLE employee_assignment
      ADD CONSTRAINT fk_employee_assignment_supervisor
        FOREIGN KEY (supervisor_id) REFERENCES employee(id) ON DELETE SET NULL;
    RAISE NOTICE 'created fk_employee_assignment_supervisor';
  ELSE
    RAISE NOTICE 'fk_employee_assignment_supervisor already exists, skip';
  END IF;
END $$;

-- 3. position_id (可空, 孤儿=0→直接建, 引用 position)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employee_assignment' AND column_name='position_id') THEN
    RAISE NOTICE 'SKIP fk_employee_assignment_position: 列不存在';
  ELSIF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_employee_assignment_position') THEN
    ALTER TABLE employee_assignment
      ADD CONSTRAINT fk_employee_assignment_position
        FOREIGN KEY (position_id) REFERENCES position(id) ON DELETE SET NULL;
    RAISE NOTICE 'created fk_employee_assignment_position';
  ELSE
    RAISE NOTICE 'fk_employee_assignment_position already exists, skip';
  END IF;
END $$;

-- 3. org_unit_id (可空, 孤儿=0→直接建, 引用 hse_org_unit)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employee_assignment' AND column_name='org_unit_id') THEN
    RAISE NOTICE 'SKIP fk_employee_assignment_org_unit: 列不存在';
  ELSIF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_employee_assignment_org_unit') THEN
    ALTER TABLE employee_assignment
      ADD CONSTRAINT fk_employee_assignment_org_unit
        FOREIGN KEY (org_unit_id) REFERENCES hse_org_unit(id) ON DELETE SET NULL;
    RAISE NOTICE 'created fk_employee_assignment_org_unit';
  ELSE
    RAISE NOTICE 'fk_employee_assignment_org_unit already exists, skip';
  END IF;
END $$;

COMMIT;

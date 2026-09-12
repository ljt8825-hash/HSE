-- ============================================================
-- 考核方案表：hse_assessment_plan + hse_assessment_plan_item
-- 待办事项 > 考核计划 配置中心（2026-08-13）
-- 前置：pg_dump 全备 safety_dashboard_pre_assessment_plan_20260813_1545.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS hse_assessment_plan (
  id BIGSERIAL PRIMARY KEY,
  module_code VARCHAR(50) NOT NULL,
  version_no VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  freq_type VARCHAR(20) NOT NULL CHECK (freq_type IN ('half-month', 'month', 'quarter')),
  stat_day VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('active', 'draft', 'expired')),
  created_by INT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 同模块同一时间最多一个生效方案（数据库层兜底）
CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_module_active
  ON hse_assessment_plan (module_code) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_plan_module ON hse_assessment_plan (module_code, status);

CREATE TABLE IF NOT EXISTS hse_assessment_plan_item (
  id BIGSERIAL PRIMARY KEY,
  plan_id BIGINT NOT NULL REFERENCES hse_assessment_plan(id) ON DELETE CASCADE,
  item_name VARCHAR(50) NOT NULL,
  weight NUMERIC(5, 1) NOT NULL CHECK (weight > 0 AND weight <= 100),
  sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_plan_item_plan ON hse_assessment_plan_item (plan_id);

-- ============================================================
-- 种子数据：8 模块 × 4 版本（与前端原型 mock 一致）
-- ============================================================
INSERT INTO hse_assessment_plan (module_code, version_no, name, period_start, period_end, freq_type, stat_day, status)
SELECT m.module_code, v.version_no, v.version_no || '方案', v.period_start::date, v.period_end::date, v.freq_type, v.stat_day, v.status
FROM (VALUES
  ('risk-control'), ('hazards'), ('emergency'), ('training'),
  ('insurance'), ('objectives'), ('grid'), ('violations')
) AS m(module_code)
CROSS JOIN (VALUES
  ('2026-08', '2026-08-01', '2026-08-31', 'half-month', '1日', 'active'),
  ('2026-09', '2026-09-01', '2026-09-30', 'month', '月末', 'draft'),
  ('2026-07', '2026-07-01', '2026-07-31', 'half-month', '16日', 'expired'),
  ('2026-06', '2026-06-01', '2026-06-30', 'month', '月末', 'expired')
) AS v(version_no, period_start, period_end, freq_type, stat_day, status);

INSERT INTO hse_assessment_plan_item (plan_id, item_name, weight, sort_order)
SELECT p.id, i.item_name, i.weight, i.sort_order
FROM hse_assessment_plan p
JOIN (VALUES
  ('2026-08', '完成率', 30, 1), ('2026-08', '及时性', 20, 2), ('2026-08', '整改闭环', 20, 3), ('2026-08', '台账规范', 15, 4), ('2026-08', '培训参与', 15, 5),
  ('2026-09', '完成率', 20, 1), ('2026-09', '及时性', 20, 2), ('2026-09', '整改闭环', 25, 3), ('2026-09', '台账规范', 15, 4), ('2026-09', '培训参与', 10, 5), ('2026-09', '事故否决', 10, 6),
  ('2026-07', '完成率', 25, 1), ('2026-07', '及时性', 20, 2), ('2026-07', '整改闭环', 25, 3), ('2026-07', '台账规范', 15, 4), ('2026-07', '培训参与', 15, 5),
  ('2026-06', '完成率', 30, 1), ('2026-06', '及时性', 20, 2), ('2026-06', '整改闭环', 20, 3), ('2026-06', '台账规范', 15, 4), ('2026-06', '培训参与', 15, 5)
) AS i(version_no, item_name, weight, sort_order) ON i.version_no = p.version_no;

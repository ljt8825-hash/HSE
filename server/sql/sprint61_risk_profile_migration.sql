-- ============================================================
-- Sprint6.1 员工安全风险画像中心 - 数据库迁移
-- ============================================================

-- 1. 风险评分配置表
CREATE TABLE IF NOT EXISTS hse_risk_score_config (
  id BIGSERIAL PRIMARY KEY,
  risk_dimension VARCHAR(50) NOT NULL,       -- 风险维度：violation/training/accident/hazard/traffic/patrol
  risk_indicator VARCHAR(100) NOT NULL,      -- 风险指标名称
  indicator_code VARCHAR(50) NOT NULL,       -- 指标编码
  weight NUMERIC(5,2) DEFAULT 1.00,          -- 权重
  score_rule JSONB,                          -- 评分规则 {ranges: [{min, max, score}]}
  max_score INT DEFAULT 100,                 -- 满分
  description VARCHAR(500),
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_deleted BOOLEAN DEFAULT false,
  UNIQUE(indicator_code)
);

COMMENT ON TABLE hse_risk_score_config IS '风险评分配置表';

-- 2. 员工风险评分快照表
CREATE TABLE IF NOT EXISTS hse_employee_risk_snapshot (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT NOT NULL,
  snapshot_date DATE NOT NULL,
  total_score NUMERIC(5,1),                  -- 总分
  risk_level VARCHAR(20),                    -- 风险等级：low/medium/high/critical
  dimension_scores JSONB,                    -- 各维度分数 {violation: 80, training: 90, ...}
  dimension_details JSONB,                   -- 各维度明细
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_deleted BOOLEAN DEFAULT false,
  UNIQUE(employee_id, snapshot_date)
);

COMMENT ON TABLE hse_employee_risk_snapshot IS '员工风险评分快照';

-- 3. 初始化评分规则配置
INSERT INTO hse_risk_score_config (risk_dimension, risk_indicator, indicator_code, weight, score_rule, max_score, description)
VALUES
  -- 三违风险 (权重30%)
  ('violation', '三违次数', 'violation_count', 0.30,
   '{"ranges": [{"max": 0, "score": 100}, {"max": 1, "score": 80}, {"max": 3, "score": 60}, {"max": 5, "score": 40}, {"min": 6, "score": 20}]}',
   100, '近12个月三违次数评分'),

  -- 培训风险 (权重20%)
  ('training', '培训完成率', 'training_rate', 0.20,
   '{"ranges": [{"min": 100, "score": 100}, {"min": 80, "score": 80}, {"min": 60, "score": 60}, {"min": 40, "score": 40}, {"max": 39, "score": 20}]}',
   100, '培训完成率评分'),

  -- 事故风险 (权重25%)
  ('accident', '事故次数', 'accident_count', 0.25,
   '{"ranges": [{"max": 0, "score": 100}, {"max": 1, "score": 70}, {"max": 2, "score": 40}, {"min": 3, "score": 10}]}',
   100, '事故次数评分'),

  -- 隐患责任风险 (权重15%)
  ('hazard', '责任隐患次数', 'hazard_count', 0.15,
   '{"ranges": [{"max": 0, "score": 100}, {"max": 2, "score": 70}, {"max": 5, "score": 40}, {"min": 6, "score": 10}]}',
   100, '责任隐患次数评分'),

  -- 交通安全风险 (权重10%，仅驾驶员)
  ('traffic', '交通违法', 'traffic_violation', 0.10,
   '{"ranges": [{"max": 0, "score": 100}, {"max": 1, "score": 70}, {"max": 3, "score": 40}, {"min": 4, "score": 10}]}',
   100, '交通违法次数评分（仅驾驶员）'),

  -- 网格巡查责任风险 (权重10%，仅grid_leader)
  ('patrol', '巡查完成率', 'patrol_rate', 0.10,
   '{"ranges": [{"min": 100, "score": 100}, {"min": 80, "score": 80}, {"min": 60, "score": 60}, {"min": 40, "score": 40}, {"max": 39, "score": 20}]}',
   100, '巡查完成率评分（仅grid_leader）')
ON CONFLICT (indicator_code) DO NOTHING;

-- 4. 员工风险画像聚合视图
CREATE OR REPLACE VIEW v_employee_risk_profile AS
SELECT
  e.id as employee_id,
  e.employee_code,
  e.name,
  e.gender,
  o.id as org_unit_id,
  o.org_name,
  ou.id as operation_unit_id,
  ou.unit_name,
  ou.unit_type,
  p.id as position_id,
  p.name as position_name,
  r.responsibility_type,
  r.grid_level,
  r.grid_role,
  r.inspection_frequency,

  -- 三违统计（近12个月，按姓名+乡镇匹配）
  COALESCE(v_stats.cnt_12m, 0) as violation_count_12m,
  v_stats.types as violation_types,

  -- 培训统计
  COALESCE(ts.compliance_rate, 0) as training_compliance_rate,
  COALESCE(ts.pending_count, 0) as training_pending_count,
  COALESCE(ts.expired_count, 0) as training_expired_count,

  -- 事故统计
  COALESCE(a_stats.accident_count, 0) as accident_count,
  COALESCE(a_stats.responsible_count, 0) as accident_responsible_count,

  -- 隐患统计
  COALESCE(h_stats.responsible_count, 0) as hazard_responsible_count,
  COALESCE(h_stats.open_count, 0) as hazard_open_count,

  -- 网格巡查（仅grid_leader）
  ga.completion_rate as patrol_completion_rate

FROM employee e
-- 【B-1-P1-02-C 修订】原 JOIN hse_employee_relation（Sprint6.0 验证数据，1304 行
--   employee_id 与 employee.id 区间完全不相交，100% 断链）→ INNER JOIN 恒 0 行，
--   风险画像列表/详情生产永远为空。改为 employee_assignment 权威任职段
--   （与 v_employee_current / v_employee_org_full 同口径：is_current + is_primary +
--   is_deleted=false；uk_emp_assign_partial 唯一索引保证一人至多一行）。
--   输出列名不变（org_unit_id / operation_unit_id / position_id 两表同列名），
--   消费方 hseRiskProfileService 无需改动。
--   注：下方三违子查询的 name+township 匹配为既有逻辑（violations 表无 employee_id），
--   不属本次断链修复范围，保持原样、不以姓名匹配替代任何 employee_id 关联。
JOIN employee_assignment ea ON ea.employee_id = e.id AND ea.is_current = true AND ea.is_primary = true AND ea.is_deleted = false
LEFT JOIN hse_org_unit o ON o.id = ea.org_unit_id AND o.is_deleted = false
LEFT JOIN hse_operation_unit ou ON ou.id = ea.operation_unit_id AND ou.is_deleted = false
LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
LEFT JOIN hse_responsibility r ON r.employee_id = e.id AND r.is_deleted = false AND r.status = 'active'

-- 三违统计子查询
LEFT JOIN LATERAL (
  SELECT COUNT(*) as cnt_12m,
         array_agg(DISTINCT v.violation_type) FILTER (WHERE v.violation_type != '' AND v.violation_type IS NOT NULL) as types
  FROM violations v
  WHERE v.name = e.name
    AND v.township = COALESCE(
      REPLACE(o.org_name, '作业中心', ''),
      o.org_name
    )
    AND v.violation_date >= CURRENT_DATE - INTERVAL '12 months'
) v_stats ON true

-- 培训状态子查询
LEFT JOIN LATERAL (
  SELECT compliance_rate, pending_count, expired_count
  FROM employee_training_status ts
  WHERE ts.employee_id = e.id AND ts.is_deleted = false
  LIMIT 1
) ts ON true

-- 事故统计子查询
LEFT JOIN LATERAL (
  SELECT COUNT(*) as accident_count,
         COUNT(*) FILTER (WHERE a.responsibility_level = '责任') as responsible_count
  FROM accidents a
  WHERE a.is_deleted = false
    AND (a.involved_person = e.name OR a.personnel_id::bigint = e.id)
) a_stats ON true

-- 隐患统计子查询
LEFT JOIN LATERAL (
  SELECT COUNT(*) as responsible_count,
         COUNT(*) FILTER (WHERE hr.status = 'open') as open_count
  FROM hazard_record hr
  WHERE hr.is_deleted = false
    AND (hr.responsible_id::bigint = e.id OR hr.employee_id::bigint = e.id)
) h_stats ON true

-- 网格巡查完成率
LEFT JOIN LATERAL (
  SELECT ga.completion_rate
  FROM grid_areas ga
  WHERE ga.personnel_id = e.id AND ga.is_deleted = false
  LIMIT 1
) ga ON true

WHERE e.is_deleted = false;

COMMENT ON VIEW v_employee_risk_profile IS '员工风险画像聚合视图';

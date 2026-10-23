-- ============================================================================
-- 20261023 HSE 安全生产费用业务域（任务第二优先级 P2）
-- ----------------------------------------------------------------------------
-- 设计原则（与任务书一致）：
--   1. 预算主体复用既有 hse_safety_budget（不作改名 / 不删除），本迁移只新增
--      「预算明细 + 费用申请 + 承诺 + 实际 + 归因」业务层，以及参照维度表。
--   2. 财务状态（承诺额 / 实际支出 / 余额 / 执行率）一律由交易表计算，
--      不把预算、已使用、余额当作相互独立的手工填写数字。
--   3. 成本归因维度：公司 → 业务领域 → 作业类型 → 投入类别 → 具体对象 → 业务事件 → 费用。
--   4. 仅可在 safety_dashboard_dev 执行；幂等（IF NOT EXISTS / ON CONFLICT DO NOTHING）；
--      不改动 hse_safety_budget 既有列、不删除任何既有数据。
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. 参照维度：业务领域（一级）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hse_cost_biz_domain (
  id         SERIAL PRIMARY KEY,
  code       VARCHAR(32) NOT NULL UNIQUE,
  name       VARCHAR(64) NOT NULL,
  sort_order INT DEFAULT 0,
  is_active  BOOLEAN DEFAULT TRUE
);

-- 参照维度：作业类型（二级，按业务领域扩展）
CREATE TABLE IF NOT EXISTS hse_cost_op_type (
  id            SERIAL PRIMARY KEY,
  biz_domain_id INT NOT NULL REFERENCES hse_cost_biz_domain(id),
  code          VARCHAR(32) NOT NULL,
  name          VARCHAR(64) NOT NULL,
  sort_order    INT DEFAULT 0,
  is_active     BOOLEAN DEFAULT TRUE,
  UNIQUE (biz_domain_id, code)
);

-- 参照维度：投入类别（三级）
CREATE TABLE IF NOT EXISTS hse_cost_invest_category (
  id         SERIAL PRIMARY KEY,
  code       VARCHAR(32) NOT NULL UNIQUE,
  name       VARCHAR(64) NOT NULL,
  sort_order INT DEFAULT 0,
  is_active  BOOLEAN DEFAULT TRUE
);

-- ----------------------------------------------------------------------------
-- 2. 预算明细：把年度预算分解到具体项目（hse_safety_budget 的明细层）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hse_budget_item (
  id                    BIGSERIAL PRIMARY KEY,
  budget_id             BIGINT NOT NULL REFERENCES hse_safety_budget(id),
  item_name             VARCHAR(200) NOT NULL,
  category              VARCHAR(50),
  biz_domain_id         INT REFERENCES hse_cost_biz_domain(id),
  planned_amount        NUMERIC(14,2) DEFAULT 0,
  annual_plan_total     NUMERIC(14,2) DEFAULT 0,
  responsible_person    VARCHAR(100),
  responsible_employee_id BIGINT,
  org_unit_id           BIGINT,
  department            VARCHAR(100),
  township              VARCHAR(100),
  remark                VARCHAR(500),
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by            BIGINT,
  updated_by            BIGINT,
  is_deleted            BOOLEAN DEFAULT FALSE
);

-- ----------------------------------------------------------------------------
-- 3. 费用申请：来源可关联隐患 / 事故 / 检查 / 培训需求等
--    source_type ∈ hazard|accident|inspection|risk_control|training_need|
--                 emergency|annual_plan|routine|other
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hse_cost_request (
  id              BIGSERIAL PRIMARY KEY,
  request_no      VARCHAR(64) UNIQUE,
  budget_id       BIGINT REFERENCES hse_safety_budget(id),
  title           VARCHAR(200) NOT NULL,
  source_type     VARCHAR(32),
  source_id       BIGINT,
  applicant_id    BIGINT,
  applicant_name  VARCHAR(100),
  apply_amount    NUMERIC(14,2) DEFAULT 0,
  apply_date      DATE,
  expected_date   DATE,
  purpose         TEXT,
  status          VARCHAR(32) DEFAULT 'draft',  -- draft|submitted|approved|rejected|closed
  approved_amount NUMERIC(14,2),
  approved_by     BIGINT,
  approved_at     TIMESTAMP,
  reject_reason   VARCHAR(500),
  remark          VARCHAR(500),
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by      BIGINT,
  updated_by      BIGINT,
  is_deleted      BOOLEAN DEFAULT FALSE
);

-- ----------------------------------------------------------------------------
-- 4. 已承诺 / 已占用资金（审批通过后的资金占用，支持月度预算分解）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hse_cost_commitment (
  id               BIGSERIAL PRIMARY KEY,
  request_id       BIGINT NOT NULL REFERENCES hse_cost_request(id),
  budget_id        BIGINT REFERENCES hse_safety_budget(id),
  commitment_no    VARCHAR(64),
  amount           NUMERIC(14,2) DEFAULT 0,
  commitment_date  DATE,
  fiscal_month     VARCHAR(7),   -- YYYY-MM 月度预算分解
  status           VARCHAR(32) DEFAULT 'active',
  remark           VARCHAR(500),
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by       BIGINT,
  updated_by       BIGINT,
  is_deleted       BOOLEAN DEFAULT FALSE
);

-- ----------------------------------------------------------------------------
-- 5. 实际支出（真实发生的费用；撤销 / 驳回 / 退款以反向记录处理，不直接改历史）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hse_cost_actual (
  id               BIGSERIAL PRIMARY KEY,
  request_id       BIGINT REFERENCES hse_cost_request(id),
  commitment_id    BIGINT REFERENCES hse_cost_commitment(id),
  budget_id        BIGINT REFERENCES hse_safety_budget(id),
  actual_amount    NUMERIC(14,2) DEFAULT 0,
  actual_date      DATE,
  fiscal_month     VARCHAR(7),
  payment_method   VARCHAR(32),
  invoice_no       VARCHAR(64),
  payee            VARCHAR(200),
  remark           VARCHAR(500),
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by       BIGINT,
  updated_by       BIGINT,
  is_deleted       BOOLEAN DEFAULT FALSE
);

-- ----------------------------------------------------------------------------
-- 6. 费用分摊 / 成本归因（公司→业务领域→作业类型→投入类别→具体对象→业务事件→费用）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hse_cost_allocation (
  id                BIGSERIAL PRIMARY KEY,
  cost_actual_id    BIGINT REFERENCES hse_cost_actual(id),
  request_id        BIGINT REFERENCES hse_cost_request(id),
  company           VARCHAR(100),
  biz_domain_id     INT REFERENCES hse_cost_biz_domain(id),
  op_type_id        INT REFERENCES hse_cost_op_type(id),
  invest_category_id INT REFERENCES hse_cost_invest_category(id),
  object_type       VARCHAR(32),  -- company|center|township|unit|vehicle|equipment|location|event
  object_id         BIGINT,
  object_name       VARCHAR(200),
  event_type        VARCHAR(32),
  event_id          BIGINT,
  event_name        VARCHAR(200),
  amount            NUMERIC(14,2) DEFAULT 0,
  remark            VARCHAR(500),
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by        BIGINT,
  updated_by        BIGINT,
  is_deleted        BOOLEAN DEFAULT FALSE
);

-- ----------------------------------------------------------------------------
-- 7. 导入批次（保留来源证据、操作人、时间、结果、错误明细；防同一文件 / 批次重复导入）
--    注：既有 hse_import_batch 为组织/岗位导入专用表，结构不同，本域不复用，独立建表避免冲突。
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hse_cost_import_batch (
  id           BIGSERIAL PRIMARY KEY,
  module       VARCHAR(64) NOT NULL,
  batch_no     VARCHAR(64) NOT NULL UNIQUE,
  file_name    VARCHAR(255),
  file_path    VARCHAR(500),
  operator_id  BIGINT,
  operator_name VARCHAR(100),
  total_rows   INT DEFAULT 0,
  inserted     INT DEFAULT 0,
  updated      INT DEFAULT 0,
  skipped      INT DEFAULT 0,
  failed       INT DEFAULT 0,
  status       VARCHAR(32) DEFAULT 'done',
  error_detail TEXT,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 8. 索引（partial index 仅覆盖未删除行）
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_budget_item_budget     ON hse_budget_item(budget_id) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_cost_request_budget   ON hse_cost_request(budget_id) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_cost_request_source   ON hse_cost_request(source_type, source_id) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_cost_commitment_req   ON hse_cost_commitment(request_id) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_cost_actual_budget    ON hse_cost_actual(budget_id) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_cost_actual_req       ON hse_cost_actual(request_id) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_cost_allocation_actual ON hse_cost_allocation(cost_actual_id) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_cost_allocation_dims  ON hse_cost_allocation(biz_domain_id, op_type_id, invest_category_id) WHERE NOT is_deleted;

-- ----------------------------------------------------------------------------
-- 9. 种子数据：业务领域 / 作业类型 / 投入类别
-- ----------------------------------------------------------------------------
INSERT INTO hse_cost_biz_domain(code, name, sort_order) VALUES
  ('sanitation', '环卫作业', 1),
  ('landscape',  '市政园林作业', 2),
  ('corp_public','公司层面或公共安全投入', 3)
ON CONFLICT (code) DO NOTHING;

-- 环卫作业下的作业类型
INSERT INTO hse_cost_op_type(biz_domain_id, code, name, sort_order)
  SELECT d.id, v.code, v.name, v.so
  FROM hse_cost_biz_domain d,
       (VALUES ('waste_collection','垃圾收运',1),
               ('waste_transfer','垃圾转运',2),
               ('manual_pickup','人工捡拾',3),
               ('road_cleaning','道路保洁',4)) AS v(code,name,so)
  WHERE d.code='sanitation'
ON CONFLICT (biz_domain_id, code) DO NOTHING;

-- 市政园林作业下的作业类型
INSERT INTO hse_cost_op_type(biz_domain_id, code, name, sort_order)
  SELECT d.id, v.code, v.name, v.so
  FROM hse_cost_biz_domain d,
       (VALUES ('greening_maintenance','绿化养护',1),
               ('municipal_repair','市政维修',2),
               ('park_operation','公园作业',3)) AS v(code,name,so)
  WHERE d.code='landscape'
ON CONFLICT (biz_domain_id, code) DO NOTHING;

-- 投入类别
INSERT INTO hse_cost_invest_category(code, name, sort_order) VALUES
  ('hazard_rectify', '隐患整改', 1),
  ('ppe',            '劳保用品', 2),
  ('safety_training','安全培训', 3),
  ('emergency_supplies','应急物资', 4),
  ('safety_equipment','安全设备', 5),
  ('inspection_test','检测检验', 6),
  ('other_safety',   '其他安全生产投入', 7)
ON CONFLICT (code) DO NOTHING;

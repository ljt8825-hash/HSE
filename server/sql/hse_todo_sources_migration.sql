-- ============================================================
-- hse_todo_sources 待办事项数据源注册表
-- 设计：新增一个模块的待办 = 往本表插一条 + 在 server/routes/todos.js 注册一个 handler
-- 聚合器与前端零改动；enabled 可运行时启停，无需重新部署
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_todo_sources (
  source_code    VARCHAR(64)  PRIMARY KEY,
  module         VARCHAR(64)  NOT NULL,
  sub_board      VARCHAR(64),
  title          VARCHAR(128) NOT NULL,
  cadence        TEXT[]       NOT NULL DEFAULT '{daily}',
  detail_api     VARCHAR(128) NOT NULL,
  export_columns JSONB        NOT NULL DEFAULT '[]',
  link           VARCHAR(255),
  enabled        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- cadence 过滤索引
CREATE INDEX IF NOT EXISTS idx_todo_sources_cadence ON hse_todo_sources USING gin (cadence);
CREATE INDEX IF NOT EXISTS idx_todo_sources_enabled ON hse_todo_sources (enabled) WHERE enabled = true;

INSERT INTO hse_todo_sources
  (source_code, module, sub_board, title, cadence, detail_api, export_columns, link, enabled)
VALUES
  (
    'target_responsibility_unsigned', '目标职责', '目标责任书管理', '目标责任书未签订人员',
    ARRAY['daily','weekly','monthly'], 'objectives:responsibility-unsigned',
    '[{"field":"employeeCode","header":"工号"},{"field":"name","header":"姓名"},{"field":"department","header":"部门"},{"field":"position","header":"岗位"},{"field":"supervisor","header":"分管"}]'::jsonb,
    '/objectives/responsibility', true
  ),
  (
    'insurance_uncovered', '保险管理', '人员保险', '未生成保险记录人员',
    ARRAY['daily','weekly','monthly'], 'insurance:uncovered',
    '[{"field":"employeeCode","header":"工号"},{"field":"name","header":"姓名"},{"field":"department","header":"部门"},{"field":"position","header":"岗位"}]'::jsonb,
    '/insurance', true
  ),
  (
    'training_pending', '培训管理', '培训档案', '培训逾期未复训人员',
    ARRAY['daily','weekly','monthly'], 'training:expiry',
    '[{"field":"employeeCode","header":"工号"},{"field":"name","header":"姓名"},{"field":"department","header":"部门"},{"field":"position","header":"岗位"},{"field":"trainingName","header":"培训班次"},{"field":"expiryDate","header":"到期日"}]'::jsonb,
    '/training', true
  ),
  (
    'hazard_overdue', '隐患治理', '隐患整改', '逾期未整改隐患',
    ARRAY['daily','weekly','monthly'], 'hazard:overdue',
    '[{"field":"hazardNo","header":"隐患编号"},{"field":"location","header":"位置"},{"field":"level","header":"等级"},{"field":"responsibleName","header":"责任人"},{"field":"department","header":"部门"},{"field":"overdueDays","header":"逾期天数"}]'::jsonb,
    '/hazards', true
  ),
  (
    'contract_annual_expiry', '目标职责', '目标责任书', '年度责任书到期/已逾期',
    ARRAY['yearly'], 'objectives:contract-annual-expiry',
    '[{"field":"title","header":"责任书标题"},{"field":"contractType","header":"类型"},{"field":"signeeName","header":"签订人"},{"field":"department","header":"部门"},{"field":"expiryDate","header":"到期日"},{"field":"daysRemaining","header":"剩余天数"}]'::jsonb,
    '/objectives/contracts', true
  ),
  (
    'assessment_annual_unsubmitted', '考核管理', '年度考核', '年度考核未提交',
    ARRAY['yearly'], 'assessment:annual-unsubmitted',
    '[{"field":"assessmentName","header":"考核名称"},{"field":"period","header":"周期"},{"field":"department","header":"部门"},{"field":"targetName","header":"考核对象"},{"field":"status","header":"状态"}]'::jsonb,
    '/hse/assessment', true
  )
ON CONFLICT (source_code) DO UPDATE SET
  module = EXCLUDED.module,
  sub_board = EXCLUDED.sub_board,
  title = EXCLUDED.title,
  cadence = EXCLUDED.cadence,
  detail_api = EXCLUDED.detail_api,
  export_columns = EXCLUDED.export_columns,
  link = EXCLUDED.link,
  enabled = EXCLUDED.enabled,
  updated_at = NOW();

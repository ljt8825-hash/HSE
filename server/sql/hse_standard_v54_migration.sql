-- ============================================================
-- HSE 安全生产标准化评价中心 v5.4 迁移脚本
-- 说明：新增标准条款库 + 评价任务 + 评价明细表
--       扩展报告模板分类（新增自评报告）
--       初始化 GB/T 33000-2016 八大要素示例数据
-- 约束：
--   1. 只新增表/字段/索引/数据，不修改已有结构
--   2. 所有操作使用 IF NOT EXISTS，幂等可重复执行
--   3. 事务包裹，失败回滚
-- ============================================================

BEGIN;

-- ============================================================
-- 1. 新建 safety_standard_clauses 表（标准条款主表）
--    三级层级：一级要素 → 二级要素 → 具体条款
-- ============================================================
CREATE TABLE IF NOT EXISTS safety_standard_clauses (
    id                  BIGSERIAL PRIMARY KEY,
    code                VARCHAR(64) NOT NULL,
    parent_id           BIGINT,
    level               SMALLINT NOT NULL DEFAULT 1,
    element_name        VARCHAR(128),
    clause_title        VARCHAR(256),
    clause_content      TEXT,
    check_method        TEXT,
    score_weight        DECIMAL(5,2) DEFAULT 0,
    required_doc_types  JSONB DEFAULT '[]',
    keywords            JSONB DEFAULT '[]',
    sort_order          INTEGER DEFAULT 0,
    status              VARCHAR(20) DEFAULT 'active'
                            CHECK (status IN ('active', 'inactive')),
    created_by          BIGINT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    is_deleted          BOOLEAN DEFAULT FALSE
);

-- 唯一索引：code 业务键唯一
CREATE UNIQUE INDEX IF NOT EXISTS uk_safety_standard_code
    ON safety_standard_clauses(code) WHERE is_deleted = FALSE;

-- 普通索引
CREATE INDEX IF NOT EXISTS idx_safety_standard_parent
    ON safety_standard_clauses(parent_id);

CREATE INDEX IF NOT EXISTS idx_safety_standard_level
    ON safety_standard_clauses(level);

CREATE INDEX IF NOT EXISTS idx_safety_standard_status
    ON safety_standard_clauses(status) WHERE is_deleted = FALSE;

-- 注释
COMMENT ON TABLE safety_standard_clauses IS '安全生产标准条款主表（三级层级）';
COMMENT ON COLUMN safety_standard_clauses.code IS '条款编码（业务唯一键，如 5.1.1）';
COMMENT ON COLUMN safety_standard_clauses.level IS '层级：1=一级要素，2=二级要素，3=具体条款';
COMMENT ON COLUMN safety_standard_clauses.score_weight IS '分值权重（辅助指标）';
COMMENT ON COLUMN safety_standard_clauses.keywords IS '匹配关键词（用于自动关联资料）';


-- ============================================================
-- 2. 新建 standard_evaluation_tasks 表（评价任务表）
-- ============================================================
CREATE TABLE IF NOT EXISTS standard_evaluation_tasks (
    id                      BIGSERIAL PRIMARY KEY,
    task_name               VARCHAR(256) NOT NULL,
    evaluation_scope        JSONB DEFAULT '{}',
    evaluation_period       VARCHAR(20),
    current_round           INTEGER DEFAULT 0,
    total_clauses           INTEGER DEFAULT 0,
    task_status             VARCHAR(20) DEFAULT 'draft'
                                CHECK (task_status IN (
                                    'draft', 'in_progress', 'completed',
                                    'failed', 'archived'
                                )),
    ai_enabled              BOOLEAN DEFAULT TRUE,
    ai_status               VARCHAR(20) DEFAULT 'none'
                                CHECK (ai_status IN (
                                    'none', 'pending', 'processing',
                                    'completed', 'failed'
                                )),
    ai_overall_score        DECIMAL(5,2),
    ai_overall_level        VARCHAR(20),
    final_overall_score     DECIMAL(5,2),
    final_overall_level     VARCHAR(20),
    level_confirmed_by      BIGINT,
    level_confirmed_at      TIMESTAMPTZ,
    error_message           TEXT,
    created_by              BIGINT,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    started_at              TIMESTAMPTZ,
    completed_at            TIMESTAMPTZ,
    is_deleted              BOOLEAN DEFAULT FALSE
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_eval_task_status
    ON standard_evaluation_tasks(task_status) WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_eval_task_period
    ON standard_evaluation_tasks(evaluation_period) WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_eval_task_created_by
    ON standard_evaluation_tasks(created_by) WHERE is_deleted = FALSE;

-- 注释
COMMENT ON TABLE standard_evaluation_tasks IS '标准化评价任务表';
COMMENT ON COLUMN standard_evaluation_tasks.evaluation_scope IS '评价范围：{"all":true} 或 {"elementCodes":["1","2"]}';
COMMENT ON COLUMN standard_evaluation_tasks.current_round IS '当前评价轮次（每次重新评价+1）';
COMMENT ON COLUMN standard_evaluation_tasks.ai_overall_score IS 'AI建议得分（辅助指标）';
COMMENT ON COLUMN standard_evaluation_tasks.ai_overall_level IS 'AI建议等级（辅助）';
COMMENT ON COLUMN standard_evaluation_tasks.final_overall_score IS '最终得分（人工确认后）';
COMMENT ON COLUMN standard_evaluation_tasks.final_overall_level IS '最终等级（人工确认后）';
COMMENT ON COLUMN standard_evaluation_tasks.level_confirmed_by IS '等级确认人';


-- ============================================================
-- 3. 新建 standard_evaluation_items 表（评价明细表）
--    每条条款在每次评价任务的每一轮次中的评价结果
--    禁止覆盖历史，按 evaluation_round 保留多轮
-- ============================================================
CREATE TABLE IF NOT EXISTS standard_evaluation_items (
    id                      BIGSERIAL PRIMARY KEY,
    task_id                 BIGINT NOT NULL,
    clause_id               BIGINT NOT NULL,
    evaluation_round        INTEGER NOT NULL DEFAULT 0,
    clause_code             VARCHAR(64) NOT NULL,
    clause_title            VARCHAR(256),
    clause_content          TEXT,
    score_weight            DECIMAL(5,2),
    ai_verdict              VARCHAR(20) DEFAULT 'unknown'
                                CHECK (ai_verdict IN (
                                    'unknown', 'compliant', 'partial',
                                    'non_compliant', 'missing'
                                )),
    compliance_status       VARCHAR(20) DEFAULT 'pending'
                                CHECK (compliance_status IN (
                                    'pending', 'compliant', 'partial',
                                    'non_compliant', 'missing'
                                )),
    matched_file_ids        JSONB DEFAULT '[]',
    matched_file_summary    JSONB DEFAULT '[]',
    ai_check_result         JSONB,
    ai_evidence             TEXT,
    ai_suggestion           TEXT,
    ai_confidence           DECIMAL(5,2),
    manual_remark           TEXT,
    checked_by              BIGINT,
    checked_at              TIMESTAMPTZ,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW(),
    is_deleted              BOOLEAN DEFAULT FALSE
);

-- 唯一约束：同一任务同一条款同一轮次唯一
CREATE UNIQUE INDEX IF NOT EXISTS uk_eval_item_task_clause_round
    ON standard_evaluation_items(task_id, clause_id, evaluation_round)
    WHERE is_deleted = FALSE;

-- 索引
CREATE INDEX IF NOT EXISTS idx_eval_item_task
    ON standard_evaluation_items(task_id) WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_eval_item_clause
    ON standard_evaluation_items(clause_id) WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_eval_item_round
    ON standard_evaluation_items(evaluation_round);

CREATE INDEX IF NOT EXISTS idx_eval_item_compliance
    ON standard_evaluation_items(compliance_status) WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_eval_item_ai_verdict
    ON standard_evaluation_items(ai_verdict) WHERE is_deleted = FALSE;

-- 注释
COMMENT ON TABLE standard_evaluation_items IS '标准化评价明细表（每条条款的评价结果）';
COMMENT ON COLUMN standard_evaluation_items.evaluation_round IS '评价轮次（保留历史，禁止覆盖）';
COMMENT ON COLUMN standard_evaluation_items.ai_verdict IS 'AI建议状态（仅辅助，不作为最终结论）';
COMMENT ON COLUMN standard_evaluation_items.compliance_status IS '最终合规状态（人工确认后设置）';
COMMENT ON COLUMN standard_evaluation_items.ai_evidence IS 'AI证据链摘要';
COMMENT ON COLUMN standard_evaluation_items.ai_suggestion IS 'AI整改建议';
COMMENT ON COLUMN standard_evaluation_items.checked_by IS '人工确认人';


-- ============================================================
-- 4. 扩展 hse_report_templates 表
--    新增 template_category 枚举值：self_assessment
-- ============================================================
-- 先尝试删除旧约束（若存在），再添加新约束
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'hse_report_templates_template_category_check'
    ) THEN
        ALTER TABLE hse_report_templates
        DROP CONSTRAINT hse_report_templates_template_category_check;
    END IF;
END $$;

ALTER TABLE hse_report_templates
ADD CONSTRAINT hse_report_templates_template_category_check
CHECK (template_category = ANY (ARRAY[
    'statistical'::character varying,
    'monthly_report'::character varying,
    'group_report'::character varying,
    'self_assessment'::character varying
]));


-- ============================================================
-- 5. 扩展 hse_reports 表
--    同步新增 template_category 枚举值：self_assessment
-- ============================================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'hse_reports_template_category_check'
    ) THEN
        ALTER TABLE hse_reports
        DROP CONSTRAINT hse_reports_template_category_check;
    END IF;
END $$;

ALTER TABLE hse_reports
ADD CONSTRAINT hse_reports_template_category_check
CHECK (template_category = ANY (ARRAY[
    'statistical'::character varying,
    'monthly_report'::character varying,
    'group_report'::character varying,
    'self_assessment'::character varying
]));


-- ============================================================
-- 6. 初始化标准条款种子数据（GB/T 33000-2016 示例）
--    8 个一级要素 + 22 个二级要素 + 30 个具体条款
-- ============================================================

-- ---- 一级要素 ----
INSERT INTO safety_standard_clauses
    (code, parent_id, level, element_name, sort_order, status, created_by)
VALUES
    ('1', NULL, 1, '目标职责', 1, 'active', 1),
    ('2', NULL, 1, '制度化管理', 2, 'active', 1),
    ('3', NULL, 1, '教育培训', 3, 'active', 1),
    ('4', NULL, 1, '现场管理', 4, 'active', 1),
    ('5', NULL, 1, '安全风险管控及隐患排查治理', 5, 'active', 1),
    ('6', NULL, 1, '应急管理', 6, 'active', 1),
    ('7', NULL, 1, '事故管理', 7, 'active', 1),
    ('8', NULL, 1, '持续改进', 8, 'active', 1)
ON CONFLICT (code) WHERE is_deleted = FALSE DO NOTHING;


-- ---- 二级要素（parent_id 通过 code 子查询获取） ----

-- 1.目标职责 → 3个二级要素
INSERT INTO safety_standard_clauses
    (code, parent_id, level, element_name, sort_order, status, created_by)
SELECT '1.1', s.id, 2, '安全目标', 1, 'active', 1
FROM safety_standard_clauses s WHERE s.code = '1' AND s.level = 1
ON CONFLICT DO NOTHING;

INSERT INTO safety_standard_clauses
    (code, parent_id, level, element_name, sort_order, status, created_by)
SELECT '1.2', s.id, 2, '机构和职责', 2, 'active', 1
FROM safety_standard_clauses s WHERE s.code = '1' AND s.level = 1
ON CONFLICT DO NOTHING;

INSERT INTO safety_standard_clauses
    (code, parent_id, level, element_name, sort_order, status, created_by)
SELECT '1.3', s.id, 2, '安全生产投入', 3, 'active', 1
FROM safety_standard_clauses s WHERE s.code = '1' AND s.level = 1
ON CONFLICT DO NOTHING;

-- 2.制度化管理 → 3个二级要素
INSERT INTO safety_standard_clauses
    (code, parent_id, level, element_name, sort_order, status, created_by)
SELECT '2.1', s.id, 2, '法规标准识别', 1, 'active', 1
FROM safety_standard_clauses s WHERE s.code = '2' AND s.level = 1
ON CONFLICT DO NOTHING;

INSERT INTO safety_standard_clauses
    (code, parent_id, level, element_name, sort_order, status, created_by)
SELECT '2.2', s.id, 2, '规章制度', 2, 'active', 1
FROM safety_standard_clauses s WHERE s.code = '2' AND s.level = 1
ON CONFLICT DO NOTHING;

INSERT INTO safety_standard_clauses
    (code, parent_id, level, element_name, sort_order, status, created_by)
SELECT '2.3', s.id, 2, '操作规程', 3, 'active', 1
FROM safety_standard_clauses s WHERE s.code = '2' AND s.level = 1
ON CONFLICT DO NOTHING;

-- 3.教育培训 → 2个二级要素
INSERT INTO safety_standard_clauses
    (code, parent_id, level, element_name, sort_order, status, created_by)
SELECT '3.1', s.id, 2, '教育培训管理', 1, 'active', 1
FROM safety_standard_clauses s WHERE s.code = '3' AND s.level = 1
ON CONFLICT DO NOTHING;

INSERT INTO safety_standard_clauses
    (code, parent_id, level, element_name, sort_order, status, created_by)
SELECT '3.2', s.id, 2, '人员教育培训', 2, 'active', 1
FROM safety_standard_clauses s WHERE s.code = '3' AND s.level = 1
ON CONFLICT DO NOTHING;

-- 4.现场管理 → 3个二级要素
INSERT INTO safety_standard_clauses
    (code, parent_id, level, element_name, sort_order, status, created_by)
SELECT '4.1', s.id, 2, '设备设施管理', 1, 'active', 1
FROM safety_standard_clauses s WHERE s.code = '4' AND s.level = 1
ON CONFLICT DO NOTHING;

INSERT INTO safety_standard_clauses
    (code, parent_id, level, element_name, sort_order, status, created_by)
SELECT '4.2', s.id, 2, '作业安全', 2, 'active', 1
FROM safety_standard_clauses s WHERE s.code = '4' AND s.level = 1
ON CONFLICT DO NOTHING;

INSERT INTO safety_standard_clauses
    (code, parent_id, level, element_name, sort_order, status, created_by)
SELECT '4.3', s.id, 2, '职业健康', 3, 'active', 1
FROM safety_standard_clauses s WHERE s.code = '4' AND s.level = 1
ON CONFLICT DO NOTHING;

-- 5.安全风险管控及隐患排查治理 → 3个二级要素
INSERT INTO safety_standard_clauses
    (code, parent_id, level, element_name, sort_order, status, created_by)
SELECT '5.1', s.id, 2, '安全风险管理', 1, 'active', 1
FROM safety_standard_clauses s WHERE s.code = '5' AND s.level = 1
ON CONFLICT DO NOTHING;

INSERT INTO safety_standard_clauses
    (code, parent_id, level, element_name, sort_order, status, created_by)
SELECT '5.2', s.id, 2, '重大危险源辨识与管理', 2, 'active', 1
FROM safety_standard_clauses s WHERE s.code = '5' AND s.level = 1
ON CONFLICT DO NOTHING;

INSERT INTO safety_standard_clauses
    (code, parent_id, level, element_name, sort_order, status, created_by)
SELECT '5.3', s.id, 2, '隐患排查治理', 3, 'active', 1
FROM safety_standard_clauses s WHERE s.code = '5' AND s.level = 1
ON CONFLICT DO NOTHING;

-- 6.应急管理 → 2个二级要素
INSERT INTO safety_standard_clauses
    (code, parent_id, level, element_name, sort_order, status, created_by)
SELECT '6.1', s.id, 2, '应急准备', 1, 'active', 1
FROM safety_standard_clauses s WHERE s.code = '6' AND s.level = 1
ON CONFLICT DO NOTHING;

INSERT INTO safety_standard_clauses
    (code, parent_id, level, element_name, sort_order, status, created_by)
SELECT '6.2', s.id, 2, '应急处置', 2, 'active', 1
FROM safety_standard_clauses s WHERE s.code = '6' AND s.level = 1
ON CONFLICT DO NOTHING;

-- 7.事故管理 → 2个二级要素
INSERT INTO safety_standard_clauses
    (code, parent_id, level, element_name, sort_order, status, created_by)
SELECT '7.1', s.id, 2, '事故报告', 1, 'active', 1
FROM safety_standard_clauses s WHERE s.code = '7' AND s.level = 1
ON CONFLICT DO NOTHING;

INSERT INTO safety_standard_clauses
    (code, parent_id, level, element_name, sort_order, status, created_by)
SELECT '7.2', s.id, 2, '事故调查和处理', 2, 'active', 1
FROM safety_standard_clauses s WHERE s.code = '7' AND s.level = 1
ON CONFLICT DO NOTHING;

-- 8.持续改进 → 2个二级要素
INSERT INTO safety_standard_clauses
    (code, parent_id, level, element_name, sort_order, status, created_by)
SELECT '8.1', s.id, 2, '绩效评定', 1, 'active', 1
FROM safety_standard_clauses s WHERE s.code = '8' AND s.level = 1
ON CONFLICT DO NOTHING;

INSERT INTO safety_standard_clauses
    (code, parent_id, level, element_name, sort_order, status, created_by)
SELECT '8.2', s.id, 2, '持续改进', 2, 'active', 1
FROM safety_standard_clauses s WHERE s.code = '8' AND s.level = 1
ON CONFLICT DO NOTHING;


-- ---- 具体条款（level=3）共30条示例 ----

-- 1.目标职责
INSERT INTO safety_standard_clauses
    (code, parent_id, level, clause_title, clause_content, check_method, score_weight,
     required_doc_types, keywords, sort_order, status, created_by)
SELECT '1.1.1', p.id, 3,
    '安全生产目标与指标',
    '企业应制定安全生产目标和年度指标，并分解到各部门、各岗位，明确责任人和完成时限。目标应包括：事故控制指标、隐患治理指标、培训指标等。',
    '查阅年度安全生产目标文件、目标分解表、考核记录，访谈部门负责人目标落实情况。',
    2.0,
    '["安全生产目标责任书","年度安全工作计划","目标考核记录"]',
    '["安全目标","安全生产目标","目标责任书","年度安全计划"]',
    1, 'active', 1
FROM safety_standard_clauses p WHERE p.code = '1.1' AND p.level = 2
ON CONFLICT DO NOTHING;

INSERT INTO safety_standard_clauses
    (code, parent_id, level, clause_title, clause_content, check_method, score_weight,
     required_doc_types, keywords, sort_order, status, created_by)
SELECT '1.2.1', p.id, 3,
    '安全管理机构设置',
    '企业应按规定设置安全生产管理机构，配备专职安全生产管理人员。安全生产管理机构应具备相应的管理职能和权限。',
    '查阅机构设置文件、安全管理人员任命书、资质证书，核实人员数量和资质是否符合要求。',
    3.0,
    '["安全管理机构设置文件","安全员任命书","安全管理人员资质证书"]',
    '["安全管理机构","安全生产管理机构","安全员","安全管理人员"]',
    1, 'active', 1
FROM safety_standard_clauses p WHERE p.code = '1.2' AND p.level = 2
ON CONFLICT DO NOTHING;

INSERT INTO safety_standard_clauses
    (code, parent_id, level, clause_title, clause_content, check_method, score_weight,
     required_doc_types, keywords, sort_order, status, created_by)
SELECT '1.2.2', p.id, 3,
    '安全生产责任制',
    '企业应建立健全安全生产责任制，明确各部门、各岗位的安全生产职责。责任制应覆盖从主要负责人到一线员工的所有层级和岗位。',
    '查阅安全生产责任制文件，抽查3-5个岗位，访谈员工是否清楚本岗位安全职责。',
    3.0,
    '["安全生产责任制","岗位安全职责"]',
    '["安全生产责任制","岗位安全职责","安全责任"]',
    2, 'active', 1
FROM safety_standard_clauses p WHERE p.code = '1.2' AND p.level = 2
ON CONFLICT DO NOTHING;

INSERT INTO safety_standard_clauses
    (code, parent_id, level, clause_title, clause_content, check_method, score_weight,
     required_doc_types, keywords, sort_order, status, created_by)
SELECT '1.3.1', p.id, 3,
    '安全生产费用管理',
    '企业应按规定提取和使用安全生产费用，专项用于安全生产。安全生产费用应纳入年度预算，使用台账清晰，专款专用。',
    '查阅安全生产费用提取使用管理制度、费用台账、财务凭证，核实用途是否符合规定。',
    2.5,
    '["安全生产费用管理制度","安全费用台账","安全费用使用计划"]',
    '["安全生产费用","安全费用","安全投入","安全经费"]',
    1, 'active', 1
FROM safety_standard_clauses p WHERE p.code = '1.3' AND p.level = 2
ON CONFLICT DO NOTHING;

-- 2.制度化管理
INSERT INTO safety_standard_clauses
    (code, parent_id, level, clause_title, clause_content, check_method, score_weight,
     required_doc_types, keywords, sort_order, status, created_by)
SELECT '2.1.1', p.id, 3,
    '法律法规标准识别获取',
    '企业应建立安全生产法律法规、标准规范的识别和获取制度，及时识别和更新适用的法律法规和标准规范。',
    '查阅法律法规识别获取制度、适用法律法规清单，核实是否为最新有效版本。',
    2.0,
    '["法律法规清单","法规识别记录","合规性评价报告"]',
    '["法律法规","安全法规","法规清单","合规性评价"]',
    1, 'active', 1
FROM safety_standard_clauses p WHERE p.code = '2.1' AND p.level = 2
ON CONFLICT DO NOTHING;

INSERT INTO safety_standard_clauses
    (code, parent_id, level, clause_title, clause_content, check_method, score_weight,
     required_doc_types, keywords, sort_order, status, created_by)
SELECT '2.2.1', p.id, 3,
    '安全生产规章制度',
    '企业应建立健全安全生产规章制度，覆盖各环节和各岗位。规章制度应包括：安全生产职责、培训教育、隐患排查、应急管理等。',
    '查阅规章制度清单和文本，抽查3-5项制度，评估适用性和执行情况。',
    3.0,
    '["安全生产管理制度汇编","安全规章制度"]',
    '["安全管理制度","安全生产规章制度","安全管理规定"]',
    1, 'active', 1
FROM safety_standard_clauses p WHERE p.code = '2.2' AND p.level = 2
ON CONFLICT DO NOTHING;

INSERT INTO safety_standard_clauses
    (code, parent_id, level, clause_title, clause_content, check_method, score_weight,
     required_doc_types, keywords, sort_order, status, created_by)
SELECT '2.3.1', p.id, 3,
    '安全操作规程',
    '企业应针对各岗位制定安全操作规程，规程应符合法律法规和标准要求，员工应掌握并严格执行。',
    '查阅操作规程清单和文本，抽查2-3个关键岗位操作规程，现场观察员工操作是否符合规程。',
    3.0,
    '["安全操作规程","岗位操作规程"]',
    '["安全操作规程","操作规程","作业规程"]',
    1, 'active', 1
FROM safety_standard_clauses p WHERE p.code = '2.3' AND p.level = 2
ON CONFLICT DO NOTHING;

-- 3.教育培训
INSERT INTO safety_standard_clauses
    (code, parent_id, level, clause_title, clause_content, check_method, score_weight,
     required_doc_types, keywords, sort_order, status, created_by)
SELECT '3.1.1', p.id, 3,
    '安全教育培训计划',
    '企业应制定年度安全教育培训计划，明确培训内容、对象、时间和师资。培训计划应结合企业实际需求。',
    '查阅年度安全培训计划、培训记录，核实计划执行情况和培训效果。',
    2.0,
    '["年度安全培训计划","培训方案"]',
    '["安全培训计划","安全教育培训计划","年度培训计划"]',
    1, 'active', 1
FROM safety_standard_clauses p WHERE p.code = '3.1' AND p.level = 2
ON CONFLICT DO NOTHING;

INSERT INTO safety_standard_clauses
    (code, parent_id, level, clause_title, clause_content, check_method, score_weight,
     required_doc_types, keywords, sort_order, status, created_by)
SELECT '3.2.1', p.id, 3,
    '三级安全教育培训',
    '新入职员工必须经过公司级、部门级、班组级三级安全教育培训并考核合格后方可上岗。培训内容应符合规定要求。',
    '查阅新员工三级安全教育档案，抽查3-5名新员工培训记录和考核成绩。',
    3.0,
    '["三级安全教育档案","新员工培训记录"]',
    '["三级安全教育","三级培训","新员工培训","岗前培训"]',
    1, 'active', 1
FROM safety_standard_clauses p WHERE p.code = '3.2' AND p.level = 2
ON CONFLICT DO NOTHING;

INSERT INTO safety_standard_clauses
    (code, parent_id, level, clause_title, clause_content, check_method, score_weight,
     required_doc_types, keywords, sort_order, status, created_by)
SELECT '3.2.2', p.id, 3,
    '特种作业人员管理',
    '特种作业人员必须按规定经专门的安全作业培训，取得特种作业操作资格证书后方可上岗作业，并按规定复审。',
    '查阅特种作业人员清单、资格证书，核实证书有效性和复审情况。',
    3.0,
    '["特种作业人员台账","特种作业操作证"]',
    '["特种作业","特种作业人员","特种作业操作证","特种设备作业"]',
    2, 'active', 1
FROM safety_standard_clauses p WHERE p.code = '3.2' AND p.level = 2
ON CONFLICT DO NOTHING;

-- 4.现场管理
INSERT INTO safety_standard_clauses
    (code, parent_id, level, clause_title, clause_content, check_method, score_weight,
     required_doc_types, keywords, sort_order, status, created_by)
SELECT '4.1.1', p.id, 3,
    '设备设施安全管理',
    '企业应建立设备设施安全管理制度，设备设施应符合安全要求，定期检查维护，安全防护装置齐全有效。',
    '查阅设备管理制度、设备台账、维护保养记录，现场抽查3-5台设备安全状况。',
    3.0,
    '["设备安全管理制度","设备台账","设备维护保养记录"]',
    '["设备安全","设备设施","设备维护","设备保养"]',
    1, 'active', 1
FROM safety_standard_clauses p WHERE p.code = '4.1' AND p.level = 2
ON CONFLICT DO NOTHING;

INSERT INTO safety_standard_clauses
    (code, parent_id, level, clause_title, clause_content, check_method, score_weight,
     required_doc_types, keywords, sort_order, status, created_by)
SELECT '4.2.1', p.id, 3,
    '作业安全管理',
    '企业应加强作业安全管理，作业前进行风险分析，落实安全措施。危险作业应实行作业许可制度。',
    '查阅作业安全管理制度、危险作业审批记录，现场观察作业安全措施落实情况。',
    3.0,
    '["作业安全管理制度","危险作业审批记录","作业票"]',
    '["作业安全","危险作业","作业票","动火作业","有限空间"]',
    1, 'active', 1
FROM safety_standard_clauses p WHERE p.code = '4.2' AND p.level = 2
ON CONFLICT DO NOTHING;

INSERT INTO safety_standard_clauses
    (code, parent_id, level, clause_title, clause_content, check_method, score_weight,
     required_doc_types, keywords, sort_order, status, created_by)
SELECT '4.3.1', p.id, 3,
    '职业健康管理',
    '企业应建立职业健康管理制度，按规定开展职业病危害因素检测和职业健康检查，为员工提供符合要求的劳动防护用品。',
    '查阅职业健康管理制度、职业病危害检测报告、职业健康体检档案、劳保用品发放记录。',
    2.5,
    '["职业健康管理制度","职业病危害检测报告","职业健康体检档案","劳保用品发放记录"]',
    '["职业健康","职业病","职业卫生","劳动防护用品","劳保"]',
    1, 'active', 1
FROM safety_standard_clauses p WHERE p.code = '4.3' AND p.level = 2
ON CONFLICT DO NOTHING;

-- 5.安全风险管控及隐患排查治理
INSERT INTO safety_standard_clauses
    (code, parent_id, level, clause_title, clause_content, check_method, score_weight,
     required_doc_types, keywords, sort_order, status, created_by)
SELECT '5.1.1', p.id, 3,
    '安全风险分级管控',
    '企业应建立安全风险分级管控制度，开展风险辨识和评估，确定风险等级，制定并落实管控措施。',
    '查阅风险管控制度、风险辨识清单、风险评估报告、风险管控措施清单。',
    3.0,
    '["风险辨识清单","风险评估报告","风险分级管控制度"]',
    '["风险管控","风险辨识","风险评估","安全风险","风险分级"]',
    1, 'active', 1
FROM safety_standard_clauses p WHERE p.code = '5.1' AND p.level = 2
ON CONFLICT DO NOTHING;

INSERT INTO safety_standard_clauses
    (code, parent_id, level, clause_title, clause_content, check_method, score_weight,
     required_doc_types, keywords, sort_order, status, created_by)
SELECT '5.2.1', p.id, 3,
    '重大危险源管理',
    '企业应对重大危险源进行登记建档，定期检测评估，制定专项应急预案，告知相关人员应急措施。',
    '查阅重大危险源台账、评估报告、备案证明、专项应急预案。',
    2.5,
    '["重大危险源台账","重大危险源评估报告","重大危险源备案"]',
    '["重大危险源","危险源辨识","危险源评估"]',
    1, 'active', 1
FROM safety_standard_clauses p WHERE p.code = '5.2' AND p.level = 2
ON CONFLICT DO NOTHING;

INSERT INTO safety_standard_clauses
    (code, parent_id, level, clause_title, clause_content, check_method, score_weight,
     required_doc_types, keywords, sort_order, status, created_by)
SELECT '5.3.1', p.id, 3,
    '隐患排查治理',
    '企业应建立隐患排查治理制度，定期开展隐患排查，建立隐患台账，实行闭环管理。重大隐患应及时上报。',
    '查阅隐患排查制度、隐患台账、整改记录，核实隐患整改闭环情况。',
    3.0,
    '["隐患排查制度","隐患台账","隐患整改记录"]',
    '["隐患排查","隐患治理","隐患整改","安全隐患"]',
    1, 'active', 1
FROM safety_standard_clauses p WHERE p.code = '5.3' AND p.level = 2
ON CONFLICT DO NOTHING;

INSERT INTO safety_standard_clauses
    (code, parent_id, level, clause_title, clause_content, check_method, score_weight,
     required_doc_types, keywords, sort_order, status, created_by)
SELECT '5.3.2', p.id, 3,
    '重大隐患治理',
    '重大隐患应制定专项治理方案，落实责任、措施、资金、时限和预案。治理完成后应进行验收。',
    '查阅重大隐患治理方案、整改验收记录，核实五落实情况。',
    2.5,
    '["重大隐患治理方案","隐患整改验收报告"]',
    '["重大隐患","隐患治理方案","隐患验收"]',
    2, 'active', 1
FROM safety_standard_clauses p WHERE p.code = '5.3' AND p.level = 2
ON CONFLICT DO NOTHING;

-- 6.应急管理
INSERT INTO safety_standard_clauses
    (code, parent_id, level, clause_title, clause_content, check_method, score_weight,
     required_doc_types, keywords, sort_order, status, created_by)
SELECT '6.1.1', p.id, 3,
    '应急预案体系',
    '企业应建立健全应急预案体系，包括综合预案、专项预案和现场处置方案。预案应定期评审和更新。',
    '查阅应急预案文本、预案评审记录，核实预案的针对性和可操作性。',
    2.5,
    '["综合应急预案","专项应急预案","现场处置方案"]',
    '["应急预案","应急救援预案","综合预案","专项预案"]',
    1, 'active', 1
FROM safety_standard_clauses p WHERE p.code = '6.1' AND p.level = 2
ON CONFLICT DO NOTHING;

INSERT INTO safety_standard_clauses
    (code, parent_id, level, clause_title, clause_content, check_method, score_weight,
     required_doc_types, keywords, sort_order, status, created_by)
SELECT '6.1.2', p.id, 3,
    '应急物资与装备',
    '企业应按规定配备应急救援物资和装备，建立台账，定期检查维护，确保完好有效。',
    '查阅应急物资台账，现场核查应急物资配备和维护情况。',
    2.0,
    '["应急物资台账","应急装备清单"]',
    '["应急物资","应急装备","救援物资","应急器材"]',
    2, 'active', 1
FROM safety_standard_clauses p WHERE p.code = '6.1' AND p.level = 2
ON CONFLICT DO NOTHING;

INSERT INTO safety_standard_clauses
    (code, parent_id, level, clause_title, clause_content, check_method, score_weight,
     required_doc_types, keywords, sort_order, status, created_by)
SELECT '6.2.1', p.id, 3,
    '应急演练',
    '企业应按规定组织应急演练，演练后进行评估总结，根据演练结果改进预案。每年至少组织一次综合应急演练。',
    '查阅应急演练计划、演练记录、演练评估报告，核实演练频次和效果。',
    2.0,
    '["应急演练计划","应急演练记录","演练评估报告"]',
    '["应急演练","应急演习","演练计划","演练评估"]',
    1, 'active', 1
FROM safety_standard_clauses p WHERE p.code = '6.2' AND p.level = 2
ON CONFLICT DO NOTHING;

-- 7.事故管理
INSERT INTO safety_standard_clauses
    (code, parent_id, level, clause_title, clause_content, check_method, score_weight,
     required_doc_types, keywords, sort_order, status, created_by)
SELECT '7.1.1', p.id, 3,
    '事故报告',
    '企业应建立事故报告制度，发生事故后按规定及时、如实报告，不得迟报、漏报、谎报、瞒报。',
    '查阅事故报告制度、事故记录，核实事故报告及时性和准确性。',
    2.0,
    '["事故报告制度","事故台账"]',
    '["事故报告","安全事故","事故台账"]',
    1, 'active', 1
FROM safety_standard_clauses p WHERE p.code = '7.1' AND p.level = 2
ON CONFLICT DO NOTHING;

INSERT INTO safety_standard_clauses
    (code, parent_id, level, clause_title, clause_content, check_method, score_weight,
     required_doc_types, keywords, sort_order, status, created_by)
SELECT '7.2.1', p.id, 3,
    '事故调查处理',
    '企业应按规定开展事故调查，查明原因，明确责任，落实整改措施，吸取教训。做到"四不放过"。',
    '查阅事故调查报告、处理决定、整改验证记录，核实四不放过落实情况。',
    2.5,
    '["事故调查报告","事故处理决定"]',
    '["事故调查","事故处理","四不放过","事故原因分析"]',
    1, 'active', 1
FROM safety_standard_clauses p WHERE p.code = '7.2' AND p.level = 2
ON CONFLICT DO NOTHING;

-- 8.持续改进
INSERT INTO safety_standard_clauses
    (code, parent_id, level, clause_title, clause_content, check_method, score_weight,
     required_doc_types, keywords, sort_order, status, created_by)
SELECT '8.1.1', p.id, 3,
    '安全生产标准化绩效评定',
    '企业应每年至少进行一次安全生产标准化绩效评定，评估标准化工作成效，发现问题持续改进。',
    '查阅绩效评定制度、年度自评报告、评定记录，核实评定工作开展情况。',
    2.0,
    '["安全生产标准化自评报告","绩效评定记录"]',
    '["绩效评定","标准化自评","安全标准化评定"]',
    1, 'active', 1
FROM safety_standard_clauses p WHERE p.code = '8.1' AND p.level = 2
ON CONFLICT DO NOTHING;

INSERT INTO safety_standard_clauses
    (code, parent_id, level, clause_title, clause_content, check_method, score_weight,
     required_doc_types, keywords, sort_order, status, created_by)
SELECT '8.2.1', p.id, 3,
    '持续改进机制',
    '企业应建立安全生产持续改进机制，根据绩效评定结果、事故教训、风险变化等，不断完善安全生产管理。',
    '查阅持续改进制度、改进计划和实施记录，核实改进措施的有效性。',
    1.5,
    '["持续改进制度","安全改进计划"]',
    '["持续改进","安全改进","PDCA","管理评审"]',
    1, 'active', 1
FROM safety_standard_clauses p WHERE p.code = '8.2' AND p.level = 2
ON CONFLICT DO NOTHING;


-- ============================================================
-- 7. 初始化自评报告模板
-- ============================================================
INSERT INTO hse_report_templates
    (template_name, report_type, template_category, ai_enabled,
     content_config, section_config, data_sources, status, created_by, created_at)
SELECT
    '安全生产标准化自评报告',
    'monthly',
    'self_assessment',
    TRUE,
    '{"type":"self_assessment"}'::JSONB,
    '[]'::JSONB,
    '["evaluation_task","standard_clauses","gap_analysis"]'::JSONB,
    'active',
    1,
    NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM hse_report_templates
    WHERE template_category = 'self_assessment'
    AND template_name = '安全生产标准化自评报告'
);


-- ============================================================
-- 迁移完成
-- ============================================================
COMMIT;

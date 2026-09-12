-- ============================================================
-- HSE 汇报中心 v5.3 迁移脚本
-- 说明：扩展现有报告体系，支持安全生产月报和集团汇报
-- 约束：只新增字段/索引/数据，不修改已有结构
-- ============================================================

-- ============================================================
-- 1. 扩展 hse_report_templates 表
-- ============================================================
ALTER TABLE hse_report_templates
ADD COLUMN IF NOT EXISTS template_category VARCHAR(30) DEFAULT 'statistical'
    CHECK (template_category IN (
        'statistical',      -- 原有统计报表（日/周/月/年）
        'monthly_report',   -- 安全生产月报
        'group_report'      -- 集团/区域汇报
    )),
ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS prompt_template TEXT,
ADD COLUMN IF NOT EXISTS data_sources JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS section_config JSONB DEFAULT '[]';

-- ============================================================
-- 2. 扩展 hse_reports 表
-- ============================================================
ALTER TABLE hse_reports
ADD COLUMN IF NOT EXISTS template_id BIGINT,
ADD COLUMN IF NOT EXISTS template_category VARCHAR(30)
    CHECK (template_category IN (
        'statistical', 'monthly_report', 'group_report'
    )),
ADD COLUMN IF NOT EXISTS report_scope JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS generation_status VARCHAR(20) DEFAULT 'completed'
    CHECK (generation_status IN (
        'pending', 'collecting', 'ai_generating', 'completed', 'failed'
    )),
ADD COLUMN IF NOT EXISTS ai_status VARCHAR(20) DEFAULT 'none'
    CHECK (ai_status IN ('none', 'pending', 'processing', 'completed', 'failed')),
ADD COLUMN IF NOT EXISTS ai_summary TEXT,
ADD COLUMN IF NOT EXISTS ai_suggestions JSONB,
ADD COLUMN IF NOT EXISTS confirm_status VARCHAR(20) DEFAULT 'unconfirmed'
    CHECK (confirm_status IN ('unconfirmed', 'confirmed', 'rejected')),
ADD COLUMN IF NOT EXISTS confirmed_by BIGINT,
ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS source_data_ref JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS error_message TEXT,
-- 预留字段（Sprint3 暂不实现逻辑）
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS parent_report_id BIGINT,
ADD COLUMN IF NOT EXISTS report_status VARCHAR(20) DEFAULT 'active'
    CHECK (report_status IN ('active', 'archived', 'deleted'));

-- ============================================================
-- 3. 新增索引
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_hse_reports_template_category ON hse_reports(template_category);
CREATE INDEX IF NOT EXISTS idx_hse_reports_generation_status ON hse_reports(generation_status);
CREATE INDEX IF NOT EXISTS idx_hse_reports_confirm_status ON hse_reports(confirm_status);
CREATE INDEX IF NOT EXISTS idx_hse_reports_template_id ON hse_reports(template_id);
CREATE INDEX IF NOT EXISTS idx_hse_reports_report_status ON hse_reports(report_status);

-- ============================================================
-- 4. 插入新模板数据
-- ============================================================

-- 4.1 安全生产月报模板
INSERT INTO hse_report_templates (
    template_name, report_type, content_config, status,
    template_category, ai_enabled, data_sources, section_config
)
VALUES (
    '安全生产月报模板',
    'monthly',
    '{"sections": [{"name": "安全总体情况", "enabled": true}, {"name": "事故情况", "enabled": true}, {"name": "隐患分析", "enabled": true}, {"name": "风险变化", "enabled": true}, {"name": "整改情况", "enabled": true}, {"name": "重点关注问题", "enabled": true}, {"name": "改进建议", "enabled": true}]}',
    'active',
    'monthly_report',
    TRUE,
    '["events", "hazards", "tasks", "training", "risks", "documents"]',
    '[
        {"key": "overview", "title": "一、本月安全工作概述", "type": "ai_summary", "required": true},
        {"key": "indicators", "title": "二、安全指标完成情况", "type": "data_chart", "required": true},
        {"key": "key_work", "title": "三、重点工作回顾", "type": "data_list", "required": true},
        {"key": "problems", "title": "四、存在的主要问题", "type": "ai_analysis", "required": false},
        {"key": "compliance", "title": "五、制度依据与合规性", "type": "document_reference", "required": false},
        {"key": "next_plan", "title": "六、下月工作计划", "type": "ai_suggestion", "required": false}
    ]'
)
ON CONFLICT DO NOTHING;

-- 4.2 集团/区域汇报材料模板
INSERT INTO hse_report_templates (
    template_name, report_type, content_config, status,
    template_category, ai_enabled, data_sources, section_config
)
VALUES (
    '集团/区域安全汇报模板',
    'monthly',
    '{"sections": [{"name": "工作总体情况", "enabled": true}, {"name": "重点工作开展", "enabled": true}, {"name": "亮点工作", "enabled": true}, {"name": "存在问题", "enabled": true}, {"name": "下一步计划", "enabled": true}]}',
    'active',
    'group_report',
    TRUE,
    '["events", "hazards", "tasks", "training", "risks", "documents"]',
    '[
        {"key": "executive_summary", "title": "一、工作总体情况", "type": "ai_summary", "required": true},
        {"key": "key_work", "title": "二、重点工作开展情况", "type": "data_list", "required": true},
        {"key": "highlights", "title": "三、亮点工作", "type": "ai_highlights", "required": false},
        {"key": "problems", "title": "四、存在的问题与不足", "type": "ai_analysis", "required": true},
        {"key": "action_plan", "title": "五、下一步工作计划", "type": "ai_suggestion", "required": true}
    ]'
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 迁移完成
-- ============================================================

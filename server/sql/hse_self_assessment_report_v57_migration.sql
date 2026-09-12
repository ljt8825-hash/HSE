-- ============================================================
-- HSE V2 Sprint4 Phase6: 安全生产标准化自评报告
-- 扩展 template_category 支持 self_assessment
-- 复用: hse_reports, hse_report_templates
-- 禁止: 新建报告表
-- ============================================================

BEGIN;

-- ============================================================
-- 1. 扩展 hse_report_templates.template_category CHECK 约束
--    增加 'self_assessment'
-- ============================================================
DO $$
BEGIN
    -- 删除旧约束（如果存在）
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'hse_report_templates_template_category_check'
          AND table_name = 'hse_report_templates'
    ) THEN
        ALTER TABLE hse_report_templates DROP CONSTRAINT hse_report_templates_template_category_check;
    END IF;

    -- 添加新约束
    EXECUTE 'ALTER TABLE hse_report_templates
             ADD CONSTRAINT hse_report_templates_template_category_check
             CHECK (template_category IN (''statistical'', ''monthly_report'', ''group_report'', ''self_assessment''))';

    RAISE NOTICE 'hse_report_templates.template_category CHECK 已扩展为含 self_assessment';
END $$;

-- ============================================================
-- 2. 扩展 hse_reports.template_category CHECK 约束
--    增加 'self_assessment'
-- ============================================================
DO $$
BEGIN
    -- 删除旧约束（如果存在）
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'hse_reports_template_category_check'
          AND table_name = 'hse_reports'
    ) THEN
        ALTER TABLE hse_reports DROP CONSTRAINT hse_reports_template_category_check;
    END IF;

    -- 添加新约束
    EXECUTE 'ALTER TABLE hse_reports
             ADD CONSTRAINT hse_reports_template_category_check
             CHECK (template_category IN (''statistical'', ''monthly_report'', ''group_report'', ''self_assessment''))';

    RAISE NOTICE 'hse_reports.template_category CHECK 已扩展为含 self_assessment';
END $$;

-- ============================================================
-- 3. 插入 self_assessment 模板记录（幂等）
-- ============================================================
INSERT INTO hse_report_templates
    (template_name, report_type, template_category, content_config, status, ai_enabled, section_config, data_sources)
SELECT
    '安全生产标准化自评报告模板',
    'monthly',
    'self_assessment',
    '{"sections": ["enterprise_info", "task_info", "clause_completion", "compliant_stats", "missing_analysis", "suggestions", "confirmation_records"]}'::jsonb,
    'active',
    FALSE,  -- 自评报告基于人工确认结果，不调用 AI
    '[
        {"key": "enterprise_info", "title": "企业安全管理基本信息"},
        {"key": "task_info", "title": "评价任务信息"},
        {"key": "clause_completion", "title": "标准条款完成情况"},
        {"key": "compliant_stats", "title": "符合项统计"},
        {"key": "missing_analysis", "title": "缺项分析"},
        {"key": "suggestions", "title": "整改建议"},
        {"key": "confirmation_records", "title": "人工确认记录"}
    ]'::jsonb,
    '["standard_evaluation_items"]'::jsonb
WHERE NOT EXISTS (
    SELECT 1 FROM hse_report_templates
    WHERE template_category = 'self_assessment'
      AND template_name = '安全生产标准化自评报告模板'
);

-- ============================================================
-- 4. 注释
-- ============================================================
COMMENT ON COLUMN hse_reports.template_category IS '报告分类：statistical(统计)/monthly_report(月报)/group_report(汇报)/self_assessment(自评)';
COMMENT ON COLUMN hse_report_templates.template_category IS '模板分类：statistical(统计)/monthly_report(月报)/group_report(汇报)/self_assessment(自评)';

COMMIT;

-- ============================================================
-- 验证查询
-- ============================================================
SELECT id, template_name, template_category, ai_enabled, status
FROM hse_report_templates
WHERE template_category = 'self_assessment';

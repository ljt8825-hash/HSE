-- ============================================================
-- 阶段2 迁移：激活 VIOLATION003（三违自身行为）规则库适配器
-- 文件：server/sql/sprint_rule_engine_phase2_violation_adapter.sql
-- 日期：2026-08-30
-- 说明：将三违自动扣分从 assessmentScoringEngine.FILL_SOURCES.violation 死路
--       切换为规则引擎 violation_record 适配器（事件级幂等）。本 SQL 仅改写
--       hse_assessment_rule 配置行；不改动任何业务数据表结构，可重复执行。
-- ============================================================

SET client_encoding = 'UTF8';

BEGIN;

-- 1) 迁移前备份（仅首次建表，幂等；回滚时可用此表还原 hse_assessment_rule）
CREATE TABLE IF NOT EXISTS hse_assessment_rule_bak_phase2_20260830
  AS SELECT * FROM hse_assessment_rule;

-- 2) 激活 VIOLATION003：挂接适配器、指标、来源、基准分
UPDATE hse_assessment_rule
   SET adapter_key        = 'violation_record',
       integration_status = 'active',
       metric_code        = 'HSE-KPI-SAF-001',
       source_table       = 'violation_records',
       deduct_score       = 1,
       integration_note   = '阶段2 已接入：事件级自动扣分（violation_record 适配器）。公司查处5分/次，乡镇查处/自查自纠/未标注1分/次，未标注按1分；类别上限15。一条违规记录=一条扣分，记录软删或改挂他人自动撤销。',
       updated_at         = NOW()
 WHERE rule_code = 'VIOLATION003';

-- 3) VIOLATION001 / VIOLATION002 保持 pending_data（无对应数据字段支撑），仅更新备注
UPDATE hse_assessment_rule
   SET integration_status = 'pending_data',
       integration_note   = '待业务建设对应数据字段后接入（信息不完整/检查未反馈）：当前无对应业务数据源，暂不激活。',
       updated_at         = NOW()
 WHERE rule_code IN ('VIOLATION001', 'VIOLATION002');

COMMIT;

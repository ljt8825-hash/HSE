-- ============================================================
-- 考核周期 cycle_code 全局唯一约束修复
-- 日期：2026-08-27
-- 问题：hse_assessment_cycle_cycle_code_key 为全局 UNIQUE(cycle_code)（不区分 is_deleted），
--       与软删除机制冲突：周期软删后 cycle_code 仍被占用，无法重建同月周期
--       → POST /cycles 500「创建考核周期失败」（pg 报中文「重复键违反唯一约束」，
--       后端 409 判断用英文 'duplicate key' 未命中）。
-- 修复：删除全局唯一约束，保留部分唯一索引 idx_cycle_code_active(WHERE is_deleted=false)，
--       活跃周期唯一性仍受保护，软删后同月可重建。
-- 注：后端 server/routes/hse-assessment-monthly.js 的 409 判断已兼容中文报错。
-- 回滚（不推荐，会重新阻塞软删复用）：ALTER TABLE hse_assessment_cycle
--       ADD CONSTRAINT hse_assessment_cycle_cycle_code_key UNIQUE (cycle_code);
-- ============================================================

ALTER TABLE hse_assessment_cycle
  DROP CONSTRAINT IF EXISTS hse_assessment_cycle_cycle_code_key;

-- 验证：
-- SELECT indexname FROM pg_indexes WHERE tablename='hse_assessment_cycle' AND indexname='idx_cycle_code_active';  -- 应保留

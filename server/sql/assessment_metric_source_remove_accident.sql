-- ============================================================================
-- 口径清理迁移：移除配置表中的 accident（事故否决）源
-- ----------------------------------------------------------------------------
-- 背景（2026-10-13 A 方案）：
--   事故否决（一票否决 100 分）自 2026-09-05 起已由规则引擎 accidentVetoAdapter
--   （METRIC_CODE=HSE-KPI-NEG-004，engine.js 注册、assessmentEventService 触发）独家承担。
--   生产 18 行事故否决记录全部为 NEG-004；本配置表声称的 NEG-001/002/003 在生产零数据。
--   保留 accident 源会埋下「config/legacy 与规则引擎并存 → 同事故双扣」陷阱，故彻底移除。
--
-- 作用：将既有 accident 源标记 is_deleted（软删），不物理删除，可追溯。
-- 幂等：已 is_deleted 的行不会重复更新。
-- 生效库：dev / prod 均可（纯 UPDATE，不触及其它表/数据）。
--   注意：本 SQL 仅改配置表自身，不影响已生成的扣分明细；若库中存在 NEG-001/002/003
--         明细（正常应为 0 行），那是历史遗留，需另行review，不在此迁移范围内。
-- ============================================================================

-- 0. 执行前核对（只读，确认预期：accident 源存在且 enabled，NEG-001/002/003 明细为 0）
-- SELECT source_name, metric_code, enabled, is_deleted
--   FROM hse_assessment_metric_source WHERE source_name = 'accident';
-- SELECT count(*) FROM hse_assessment_deduction
--   WHERE metric_code IN ('HSE-KPI-NEG-001','HSE-KPI-NEG-002','HSE-KPI-NEG-003') AND is_deleted = FALSE;

-- 1. 软删 accident 源
UPDATE hse_assessment_metric_source
SET is_deleted = TRUE, updated_at = NOW()
WHERE source_name = 'accident' AND is_deleted = FALSE;

-- 2. 执行后校验（应返回 affected=已存在行数；事故否决改由规则引擎 NEG-004 承担）
-- SELECT source_name, metric_code, enabled, is_deleted
--   FROM hse_assessment_metric_source WHERE source_name = 'accident';
-- SELECT count(*) FROM hse_assessment_deduction
--   WHERE metric_code = 'HSE-KPI-NEG-004' AND is_deleted = FALSE;  -- 规则引擎口径不受本迁移影响

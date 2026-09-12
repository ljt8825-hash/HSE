-- ============================================================
-- HSE 扣分规则引擎 · 阶段1.5：可观测口径补「考核对象人数」
-- 版本：v1.0
-- 日期：2026-08-30
-- 数据库：PostgreSQL（safety_dashboard）
-- 依据：docs/rule-engine-design/提示词-02-阶段1.5收口加固与三违数据治理地基.md 第 3 节 A1
--
-- 背景：
--   阶段0 的 last_scanned_count 记录的是「扫描到的网格长总数」（cycle 24 为 62，
--   含 38 名不在本期考核对象名单内的人员）。业务看「扫描62人/扣分24人」容易误以为
--   62 人全部参与了考核。本脚本新增 last_assessed_count 记录「实际命中考核对象的人数」，
--   使文案可表达为「扫描62人/考核24人/扣分24人」。
--
-- 约束：
--   * 可重复执行（ADD COLUMN IF NOT EXISTS / COMMENT ON COLUMN）
--   * 全程事务包裹，失败自动回滚
--   * 零评分行为变化：不触碰 hse_assessment_deduction 任何数据
--
-- 执行前务必备份：
--   pg_dump -h 127.0.0.1 -p 5432 -U hse_app -d safety_dashboard -Fc -f <时间戳>.dump
-- ============================================================

BEGIN;

-- 最近一次扫描中「实际命中考核对象」的人数
-- 口径：适配器 scan 结果中 intents + revocations 的条数；
--       被 skipped（reason='not-assessment-target'）的人员不计入。
ALTER TABLE hse_assessment_rule ADD COLUMN IF NOT EXISTS last_assessed_count INT;

COMMENT ON COLUMN hse_assessment_rule.last_assessed_count IS
  '最近一次扫描中实际命中考核对象的人数（不含非考核对象）；与 last_scanned_count 不一致时列表文案展示为「扫描X人/考核Y人/扣分Z人」';

COMMIT;

-- ============================================================
-- 自检（人工执行核对用，非事务内）
-- ============================================================
-- SELECT column_name, data_type
--   FROM information_schema.columns
--  WHERE table_name = 'hse_assessment_rule' AND column_name = 'last_assessed_count';

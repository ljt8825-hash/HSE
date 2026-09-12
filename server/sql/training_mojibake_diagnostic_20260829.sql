-- ============================================================
-- 培训乱码存量处置 · 方案二（保留现状，待业务逐条修正）
-- 文件：server/sql/training_mojibake_diagnostic_20260829.sql
-- 日期：2026-08-31（提示词-05 任务 D）
-- 状态：**未执行**。本脚本为只读诊断，可随时执行，不修改任何数据。
--
-- 适用场景（与方案一互斥，由业务/用户选择其一）：
--   方案一（training_mojibake_soft_delete_20260829.sql）是「若可重导」时
--   软删 82 行乱码、待用修复后的导入链路重新导入。
--   本方案二用于「暂不重导、保留数据、由业务在界面逐条修正」的情形：
--   提供一个可重复执行的诊断清单，列出 82 行乱码行的关键字段，
--   方便业务按 id 在培训录入页定位并人工补全正确的 姓名/结果/日期/人员关联。
--
-- 安全设计（防误伤 / 可重复）：
--   1) 纯 SELECT，零写操作，可反复执行用于核查进度。
--   2) 三重限定与方案一完全一致：is_deleted = FALSE 且 created_at 落在
--      2026-08-29 当天 且 (result 为乱码字符 或 name 含乱码字符)。
--   3) 乱码字符用 chr() 按 Unicode 码位给出（U+03F8=1016 / U+01E9=489），
--      避免 SQL 文件本身编码问题导致条件失真。
--   4) 身份证号做掩码展示（仅留后 4 位），避免敏感信息明文外泄。
-- ============================================================

SET client_encoding = 'UTF8';

-- ── 诊断清单：列出待修正的乱码行（含重导/手改所需定位信息）────────────
SELECT
    id,
    name,
    result,
    training_type,
    training_title,
    dept_name,
    training_date,
    -- 身份证号掩码：仅保留后 4 位，便于业务回查源文件但不泄露明文
    CASE
        WHEN id_card IS NULL OR id_card = '' THEN '(空)'
        ELSE '****' || right(id_card, 4)
    END AS id_card_masked,
    employee_id,
    personnel_id,
    created_at
  FROM training_records
 WHERE is_deleted = FALSE
   AND created_at >= TIMESTAMP '2026-08-29 00:00:00'
   AND created_at <  TIMESTAMP '2026-08-30 00:00:00'
   AND (result = chr(1016)                        -- U+03F8「ϸ」乱码结果值
     OR name LIKE '%' || chr(489) || '%')         -- U+01E9「ǩ」乱码姓名
 ORDER BY id;

-- ── 进度核对：已逐条修正多少、还剩多少（业务边改边跑）──────────────────
-- 修正判定：result 不再是乱码字符 且 name 不再含乱码字符。
SELECT
    count(*)                                                          AS 待修正总数,
    count(*) FILTER (WHERE result = chr(1016)
                          OR name LIKE '%' || chr(489) || '%')        AS 仍乱码行数,
    count(*) FILTER (WHERE result <> chr(1016)
                          AND name NOT LIKE '%' || chr(489) || '%')   AS 已修正行数
  FROM training_records
 WHERE is_deleted = FALSE
   AND created_at >= TIMESTAMP '2026-08-29 00:00:00'
   AND created_at <  TIMESTAMP '2026-08-30 00:00:00';

-- ── 说明 ─────────────────────────────────────────────────────────────
-- 本方案二不删除、不软删任何数据。如需最终清理，仍走方案一脚本（软删）。
-- 两方案的选择权在业务/用户：有干净的 08-29 源文件 → 选方案一重导；
-- 无干净源文件、需人工辨认 → 选方案二逐条修正（本脚本提供清单与进度）。

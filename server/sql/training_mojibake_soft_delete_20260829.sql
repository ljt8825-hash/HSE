-- ============================================================
-- 培训乱码存量处置 · 方案一（推荐）：软删 2026-08-29 事故批次乱码行
-- 文件：server/sql/training_mojibake_soft_delete_20260829.sql
-- 日期：2026-08-31（提示词-05 任务 D）
-- 状态：**未执行**。须业务/用户确认后另行执行。
--
-- 背景：training_records 存活 82 行（id 907-988，created_at 均为 2026-08-29 14:39:01）
--       的 name / result / content 等字段为 GBK 字节被按 UTF-8 解读产生的乱码：
--         name  = U+01E9「ǩ」（GBK c7a9）
--         result= U+03F8「ϸ」（GBK cfb8）
--       该批次均无 personnel_id / employee_id / employee_no，人员完全无法关联，
--       且「不合格」等关键判定字段不可读，对阶段4 培训适配器无任何可用价值。
--
-- 安全设计（防误伤）：
--   1) 三重限定：is_deleted = FALSE 且 created_at 落在 2026-08-29 当天
--      且 (result 为乱码字符 或 name 含乱码字符)。
--   2) 字符用 chr() 按 Unicode 码位给出（U+03F8=1016 / U+01E9=489），
--      避免 SQL 文件本身编码问题导致条件失真。
--   3) 可重复执行：第二次执行时受影响行为 0（已软删的行不满足 is_deleted=FALSE）。
--   4) 软删而非物理删除，保留数据可追溯，可用方案二脚本随时核查。
-- ============================================================

SET client_encoding = 'UTF8';

-- ── 步骤 0：执行前预检（只读，确认命中范围正是 82 行）──────────────
SELECT count(*) AS 预检命中行数,
       count(*) FILTER (WHERE result = chr(1016))              AS result乱码行数,
       count(*) FILTER (WHERE name LIKE '%' || chr(489) || '%') AS name乱码行数,
       min(id) AS 最小id,
       max(id) AS 最大id
  FROM training_records
 WHERE is_deleted = FALSE
   AND created_at >= TIMESTAMP '2026-08-29 00:00:00'
   AND created_at <  TIMESTAMP '2026-08-30 00:00:00'
   AND (result = chr(1016) OR name LIKE '%' || chr(489) || '%');

-- ── 步骤 1：软删（如需执行，去掉下方 BEGIN/UPDATE/COMMIT 的注释）──
-- BEGIN;
--
-- UPDATE training_records
--    SET is_deleted = TRUE,
--        updated_at = NOW()
--  WHERE is_deleted = FALSE
--    AND created_at >= TIMESTAMP '2026-08-29 00:00:00'
--    AND created_at <  TIMESTAMP '2026-08-30 00:00:00'
--    AND (result = chr(1016)                        -- U+03F8「ϸ」乱码结果值
--      OR name LIKE '%' || chr(489) || '%');        -- U+01E9「ǩ」乱码姓名
--
-- COMMIT;

-- ── 步骤 2：执行后核验（存活行数应从 82 降为 0，其余历史行不受影响）──
-- SELECT is_deleted, count(*) AS n, min(id) AS min_id, max(id) AS max_id
--   FROM training_records GROUP BY is_deleted ORDER BY is_deleted;
--
-- 期望结果：is_deleted=true 的行数 = 116 + 82 = 198，is_deleted=false 的行数 = 0。
--
-- ── 回滚（若误删）────────────────────────────────────────────────
-- UPDATE training_records
--    SET is_deleted = FALSE, updated_at = NOW()
--  WHERE id BETWEEN 907 AND 988
--    AND is_deleted = TRUE
--    AND created_at >= TIMESTAMP '2026-08-29 00:00:00'
--    AND created_at <  TIMESTAMP '2026-08-30 00:00:00';

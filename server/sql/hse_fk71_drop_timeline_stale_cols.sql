-- 提示词-71 任务B：清理 hse_event_timeline 废弃列
-- 门控 A 结果：5 个废弃列在 server/routes、server/services 中对 hse_event_timeline 的查询代码
--           (server/routes/hse-events.js SELECT L190 / INSERT L390) 均零引用
--           （status_from/status_to/description/timestamp/created_at 均未被引用；
--            L199 的 description 属 hse_event_links 表，与 timeline 无关）
-- 表当前 0 行，DROP 零风险。IF EXISTS 保证幂等。

BEGIN;

ALTER TABLE hse_event_timeline DROP COLUMN IF EXISTS status_from;
ALTER TABLE hse_event_timeline DROP COLUMN IF EXISTS status_to;
ALTER TABLE hse_event_timeline DROP COLUMN IF EXISTS description;
ALTER TABLE hse_event_timeline DROP COLUMN IF EXISTS timestamp;
ALTER TABLE hse_event_timeline DROP COLUMN IF EXISTS created_at;

COMMIT;

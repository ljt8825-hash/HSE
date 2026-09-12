-- 提示词-116 P0-1：department.level 约束对齐到 1-6
--
-- 背景（实测）：
--   本库 department 表当前【无】level 的 CHECK 约束（仅有 PK + FK org_unit_id）。
--   前端部门 Select 支持 1-6 层级（班组=6），历史数据 level∈{4,5,6} 共 78 行，无越界。
--   原提示词假设存在 CHECK(level BETWEEN 1 AND 5) 已不准确；此处新增【防御性】
--   CHECK(level BETWEEN 1 AND 6)，防止后续写入 level<1 或 level>6（如 level=7）。
--
-- 安全：写前已全量 pg_dump 备份（见 server/sql/_migration_backups/）。

BEGIN;

-- 若历史上存在同名约束则先移除（幂等，无则 no-op）
ALTER TABLE department DROP CONSTRAINT IF EXISTS department_level_check;

-- 新增 1-6 层级约束（含软删除行在内全表校验，当前 0 行越界，必定成功）
ALTER TABLE department
  ADD CONSTRAINT department_level_check
  CHECK (level BETWEEN 1 AND 6);

COMMIT;

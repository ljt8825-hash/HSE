-- ============================================================
-- 提示词-91 系统级遗留缺陷修复  (幂等，可重复执行)
-- ------------------------------------------------------------
-- 缺陷1: uk_employee_code / uk_employee_idcard 唯一索引缺少
--         is_deleted = false 部分条件（clear-all 软删后同号无法重导的根因）
-- 缺陷2: position 表 30 行业务活跃岗位被误标 is_deleted=true
-- 任务3: 恢复 employee / employee_assignment 活跃状态
--         （提示词-90 发现全量软删，导致人员/驾驶员的接口返回空）
--
-- 红线: 仅 DDL(索引重建) + DML(UPDATE)，不触碰代码/表结构/规则/种子/路由。
--       不使用 DELETE / INSERT 任何业务行（除本脚本内的 UPDATE 与索引重建）。
-- 幂等: DROP INDEX IF EXISTS + CREATE 可重跑；UPDATE 均带 WHERE is_deleted=true，
--        已修复时为空操作。
-- ============================================================

-- ---------- 缺陷1: 重建两个唯一索引，补回 is_deleted = false 部分条件 ----------
DROP INDEX IF EXISTS uk_employee_code;
CREATE UNIQUE INDEX uk_employee_code
    ON employee (employee_code)
    WHERE employee_code IS NOT NULL AND is_deleted = false;

DROP INDEX IF EXISTS uk_employee_idcard;
CREATE UNIQUE INDEX uk_employee_idcard
    ON employee (id_card)
    WHERE id_card IS NOT NULL AND is_deleted = false;

-- ---------- 缺陷2: position 表业务活跃岗位 is_deleted -> false ----------
UPDATE position
   SET is_deleted = false, updated_at = NOW()
 WHERE is_deleted = true;

-- ---------- 任务3: 恢复 employee / employee_assignment 活跃状态 ----------
UPDATE employee
   SET is_deleted = false, updated_at = NOW()
 WHERE is_deleted = true;

-- 3a. 修复重复 primary-current 任职（数据质量，触发唯一约束 uk_emp_assign_primary）
--     每个员工仅保留最新一条 is_primary=true AND is_current=true 的任职，
--     其余降级为非主职（仅 UPDATE is_primary，不 DELETE/INSERT 任何行）。
UPDATE employee_assignment ea
   SET is_primary = false
 WHERE ea.is_primary = true
   AND ea.is_current = true
   AND ea.is_deleted = true
   AND ea.id NOT IN (
     SELECT DISTINCT ON (sub.employee_id) sub.id
       FROM employee_assignment sub
      WHERE sub.is_primary = true
        AND sub.is_current = true
        AND sub.is_deleted = true
      ORDER BY sub.employee_id, sub.updated_at DESC, sub.id DESC
   );

UPDATE employee_assignment
   SET is_deleted = false, updated_at = NOW()
 WHERE is_deleted = true;

-- ---------- 验证快查（可选，执行后查看） ----------
SELECT 'uk_employee_code'  AS idx, indexdef FROM pg_indexes WHERE indexname = 'uk_employee_code'
UNION ALL
SELECT 'uk_employee_idcard', indexdef FROM pg_indexes WHERE indexname = 'uk_employee_idcard';

SELECT 'position_active'   AS metric, count(*) AS n FROM position            WHERE is_deleted = false
UNION ALL
SELECT 'employee_active',            count(*)     FROM employee             WHERE is_deleted = false
UNION ALL
SELECT 'assignment_active',          count(*)     FROM employee_assignment WHERE is_deleted = false;

-- ============================================================
-- 随机码批岗位治理（position 1373/1375/1377/1379/1380）
-- 日期：2026-08-27
-- 背景：随机码批岗位(position_code 为 POS_XXXXXXXX_XXXX 随机码、job_category=null)
--       为早期导入遗留，0 人使用(employee_assignment 无引用)，与规范批岗位(POS-*)语义重叠
--       (如 收运车司机↔垃圾收运车驾驶员、吸污车司机/机动岗↔吸污车驾驶员)。
-- 处理：1) position_risk_mapping 引用随机码岗位的 3 行停用(is_active=false)——风险引擎
--          按 position_id/position_name 匹配，无员工挂这些岗位，映射行本为死配置；
--       2) 软删 5 个随机码批岗位(is_deleted=true)。
-- 注：hse_employee_org 为只读冻结历史表(Sprint-C)，其 69 行旧岗位引用不迁移、不清理。
-- 回滚：将 5 岗位 is_deleted 置回 false，3 行 risk_mapping is_active 置回 true。
-- ============================================================

BEGIN;

-- 1. 停用引用随机码岗位的风险映射行
UPDATE position_risk_mapping SET is_active = false, updated_at = NOW()
 WHERE position_id IN (1373, 1375, 1377, 1379, 1380) AND is_active = true;

-- 2. 软删随机码批岗位
UPDATE position SET is_deleted = true, updated_at = NOW()
 WHERE id IN (1373, 1375, 1377, 1379, 1380) AND is_deleted = false;

COMMIT;

-- 验证：
-- SELECT count(*) FROM position WHERE is_deleted=false;  -- 22
-- SELECT name,count(*) FROM position WHERE is_deleted=false GROUP BY name HAVING count(*)>1;  -- 空
-- SELECT count(*) FROM position_risk_mapping m LEFT JOIN position p ON p.id=m.position_id WHERE m.position_id IS NOT NULL AND p.id IS NULL;  -- 0

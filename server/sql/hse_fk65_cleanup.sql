-- 提示词-65 B-2/B-3：删除 53 行测试孤儿
-- 注意：两表均有 BEFORE DELETE OR UPDATE 触发器（trg_prevent_adjustment_update / trg_prevent_audit_update）
--       硬性禁止 DELETE，故需临时禁用触发器完成授权删除，删除后必须立即重建恢复保护。
-- 仅操作 hse_deduction_adjustment 与 hse_assessment_audit_log 两张表。

-- 1) 临时禁用触发器（DDL，立即生效，无法事务回滚）
ALTER TABLE hse_deduction_adjustment DISABLE TRIGGER trg_prevent_adjustment_update;
ALTER TABLE hse_assessment_audit_log DISABLE TRIGGER trg_prevent_audit_update;

-- 2) 删除孤儿（方案 A：引用不存在的 employee）
DELETE FROM hse_deduction_adjustment
WHERE adjusted_by IS NOT NULL
  AND adjusted_by NOT IN (SELECT id FROM employee);

DELETE FROM hse_assessment_audit_log
WHERE operator_id IS NOT NULL
  AND operator_id NOT IN (SELECT id FROM employee);

-- 3) 立即重建触发器，恢复表保护（关键，绝不遗漏）
ALTER TABLE hse_deduction_adjustment ENABLE TRIGGER trg_prevent_adjustment_update;
ALTER TABLE hse_assessment_audit_log ENABLE TRIGGER trg_prevent_audit_update;

-- 4) 验证触发器已恢复启用（tgenabled = 'O' 表示 origin 启用）
SELECT tgname,
       CASE WHEN tgenabled = 'O' THEN 'ENABLED' ELSE 'DISABLED' END AS state
FROM pg_trigger
WHERE tgrelid IN ('hse_deduction_adjustment'::regclass, 'hse_assessment_audit_log'::regclass)
  AND NOT tgisinternal
ORDER BY tgrelid::regclass::text, tgname;

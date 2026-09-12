-- 恢复 50 个「不在 1311 文件内、但持有活动业务记录」的真实员工的任职关系。
-- clear-all 软删了他们的任职；本次重导入仅覆盖文件内 1311 人，故需将其原 current 任职恢复，避免真实员工变为无任职孤立记录。
-- 每位员工仅恢复其最新的一条 is_current=true 任职（其余保持软删），与文件内员工「每人一条 current 任职」保持一致。

UPDATE employee_assignment
SET is_deleted = false, updated_at = CURRENT_TIMESTAMP
WHERE id IN (
  SELECT DISTINCT ON (a.employee_id) a.id
  FROM employee_assignment a
  JOIN employee e ON e.id = a.employee_id
  WHERE a.is_deleted = true
    AND a.is_current = true
    AND e.is_deleted = false
    AND e.employee_code NOT IN (
      SELECT employee_no FROM employee_import_pending WHERE batch_id = 21 AND is_deleted = false
    )
  ORDER BY a.employee_id, a.updated_at DESC, a.id DESC
);

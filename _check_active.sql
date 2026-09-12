-- 查 personnel_insurance 现有 active 雇主险记录数，对照 1268 跳过
SELECT 'active_employer_total=' || COUNT(*)
FROM personnel_insurance
WHERE is_deleted = false
  AND insurance_type = '雇主责任险'
  AND is_current = true
  AND start_date <= CURRENT_DATE
  AND expire_date >= CURRENT_DATE;

-- 最近一次导入的文件记录及其结果
SELECT id, filename, original_name, status, module_type, data_period, created_at
FROM file_records
WHERE module_type = 'personnel'
ORDER BY id DESC LIMIT 5;

-- 提示词-86 培训模块数据补录（幂等种子数据）
-- 目标表：employee_induction_training / employee_training_status
-- 说明：这两张表是早期遗留表，当前培训模块实际读取 training_records（已 104 行，功能正常）。
--       本脚本按提示词要求为两张表各补 5 条样本数据，外键均指向真实员工/岗位，可重复执行。
-- 红线：仅 INSERT 样本数据，不修改任何业务表、规则、前端/后端代码；人员ID 全部引用真实在册员工。

-- ============ 1) employee_induction_training（入职培训记录）============
INSERT INTO employee_induction_training
  (id, employee_id, position_id, induction_start_date, induction_end_date,
   company_level_status, company_level_date, company_level_trainer, company_level_hours, company_level_result,
   department_level_status, department_level_date, department_level_trainer, department_level_hours, department_level_result,
   team_level_status, team_level_date, team_level_trainer, team_level_hours, team_level_result,
   total_hours, overall_status, overall_result, qualified_date, expiry_date, created_at, updated_at, is_deleted)
SELECT 9101, 3866, 1394, '2026-07-01', '2026-07-15',
       'completed', '2026-07-05', '培训中心', 8, 'pass',
       'completed', '2026-07-08', '乡镇作业中心', 8, 'pass',
       'completed', '2026-07-12', '班组', 4, 'pass',
       20, 'qualified', '合格', '2026-07-12', '2027-07-12', now(), now(), false
WHERE NOT EXISTS (SELECT 1 FROM employee_induction_training WHERE id = 9101);

INSERT INTO employee_induction_training
  (id, employee_id, position_id, induction_start_date, induction_end_date,
   company_level_status, company_level_date, company_level_trainer, company_level_hours, company_level_result,
   department_level_status, department_level_date, department_level_trainer, department_level_hours, department_level_result,
   team_level_status, team_level_date, team_level_trainer, team_level_hours, team_level_result,
   total_hours, overall_status, overall_result, qualified_date, expiry_date, created_at, updated_at, is_deleted)
SELECT 9102, 3867, 1395, '2026-07-03', '2026-07-18',
       'completed', '2026-07-06', '培训中心', 8, 'pass',
       'in_progress', NULL, NULL, 0, NULL,
       'pending', NULL, NULL, 0, NULL,
       8, 'in_progress', NULL, NULL, NULL, now(), now(), false
WHERE NOT EXISTS (SELECT 1 FROM employee_induction_training WHERE id = 9102);

INSERT INTO employee_induction_training
  (id, employee_id, position_id, induction_start_date, induction_end_date,
   company_level_status, company_level_date, company_level_trainer, company_level_hours, company_level_result,
   department_level_status, department_level_date, department_level_trainer, department_level_hours, department_level_result,
   team_level_status, team_level_date, team_level_trainer, team_level_hours, team_level_result,
   total_hours, overall_status, overall_result, qualified_date, expiry_date, created_at, updated_at, is_deleted)
SELECT 9103, 3868, 1398, '2026-07-05', '2026-07-20',
       'completed', '2026-07-09', '安全环保部', 8, 'pass',
       'completed', '2026-07-13', '车队', 8, 'pass',
       'completed', '2026-07-16', '班组', 4, 'pass',
       20, 'qualified', '合格', '2026-07-16', '2027-07-16', now(), now(), false
WHERE NOT EXISTS (SELECT 1 FROM employee_induction_training WHERE id = 9103);

INSERT INTO employee_induction_training
  (id, employee_id, position_id, induction_start_date, induction_end_date,
   company_level_status, company_level_date, company_level_trainer, company_level_hours, company_level_result,
   department_level_status, department_level_date, department_level_trainer, department_level_hours, department_level_result,
   team_level_status, team_level_date, team_level_trainer, team_level_hours, team_level_result,
   total_hours, overall_status, overall_result, qualified_date, expiry_date, created_at, updated_at, is_deleted)
SELECT 9104, 3869, 1398, '2026-07-08', '2026-07-23',
       'completed', '2026-07-11', '安全环保部', 8, 'pass',
       'completed', '2026-07-15', '车队', 8, 'pass',
       'in_progress', NULL, NULL, 0, NULL,
       16, 'in_progress', NULL, NULL, NULL, now(), now(), false
WHERE NOT EXISTS (SELECT 1 FROM employee_induction_training WHERE id = 9104);

INSERT INTO employee_induction_training
  (id, employee_id, position_id, induction_start_date, induction_end_date,
   company_level_status, company_level_date, company_level_trainer, company_level_hours, company_level_result,
   department_level_status, department_level_date, department_level_trainer, department_level_hours, department_level_result,
   team_level_status, team_level_date, team_level_trainer, team_level_hours, team_level_result,
   total_hours, overall_status, overall_result, qualified_date, expiry_date, created_at, updated_at, is_deleted)
SELECT 9105, 3870, 1398, '2026-07-10', '2026-07-25',
       'completed', '2026-07-14', '安全环保部', 8, 'fail',
       'completed', '2026-07-18', '车队', 8, 'pass',
       'completed', '2026-07-21', '班组', 4, 'pass',
       20, 'expired', '不合格待重训', NULL, NULL, now(), now(), false
WHERE NOT EXISTS (SELECT 1 FROM employee_induction_training WHERE id = 9105);

-- ============ 2) employee_training_status（培训状态汇总）============
INSERT INTO employee_training_status
  (id, employee_id, position_id, total_requirements, completed_count, pending_count, expired_count,
   compliance_rate, compliance_status, last_training_date, next_due_date, last_analyzed_at, analyzed_by, created_at, updated_at, is_deleted)
SELECT 9201, 3866, 1394, 6, 6, 0, 0,
       1.0, 'compliant', '2026-07-12', '2027-07-12', now(), 1, now(), now(), false
WHERE NOT EXISTS (SELECT 1 FROM employee_training_status WHERE id = 9201);

INSERT INTO employee_training_status
  (id, employee_id, position_id, total_requirements, completed_count, pending_count, expired_count,
   compliance_rate, compliance_status, last_training_date, next_due_date, last_analyzed_at, analyzed_by, created_at, updated_at, is_deleted)
SELECT 9202, 3867, 1395, 6, 3, 3, 0,
       0.5, 'warning', '2026-07-08', '2026-10-08', now(), 1, now(), now(), false
WHERE NOT EXISTS (SELECT 1 FROM employee_training_status WHERE id = 9202);

INSERT INTO employee_training_status
  (id, employee_id, position_id, total_requirements, completed_count, pending_count, expired_count,
   compliance_rate, compliance_status, last_training_date, next_due_date, last_analyzed_at, analyzed_by, created_at, updated_at, is_deleted)
SELECT 9203, 3868, 1398, 8, 8, 0, 0,
       1.0, 'compliant', '2026-07-16', '2027-07-16', now(), 1, now(), now(), false
WHERE NOT EXISTS (SELECT 1 FROM employee_training_status WHERE id = 9203);

INSERT INTO employee_training_status
  (id, employee_id, position_id, total_requirements, completed_count, pending_count, expired_count,
   compliance_rate, compliance_status, last_training_date, next_due_date, last_analyzed_at, analyzed_by, created_at, updated_at, is_deleted)
SELECT 9204, 3869, 1398, 8, 6, 2, 0,
       0.75, 'warning', '2026-07-15', '2026-10-15', now(), 1, now(), now(), false
WHERE NOT EXISTS (SELECT 1 FROM employee_training_status WHERE id = 9204);

INSERT INTO employee_training_status
  (id, employee_id, position_id, total_requirements, completed_count, pending_count, expired_count,
   compliance_rate, compliance_status, last_training_date, next_due_date, last_analyzed_at, analyzed_by, created_at, updated_at, is_deleted)
SELECT 9205, 3870, 1398, 8, 5, 2, 1,
       0.625, 'non_compliant', '2026-07-21', '2026-10-21', now(), 1, now(), now(), false
WHERE NOT EXISTS (SELECT 1 FROM employee_training_status WHERE id = 9205);

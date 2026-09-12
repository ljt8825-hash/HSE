-- 提示词-86 补录：培训模块「新员工培训」视图数据
-- 说明：前端 新员工培训 视图（views/training/new-employee）经
--       GET /api/training/new-employees 读取 training_records WHERE training_type='新员工'。
--       该类型在 training_records 中当前为 0 条，导致视图空表。
--       本脚本补 5 条 training_type='新员工' 记录，外键 employee_id 引用真实在册员工，使视图可正常展示。
--       幂等：使用高位 id + WHERE NOT EXISTS，可重复执行。

INSERT INTO training_records
  (id, name, training_type, training_date, employee_id, dept, position, duration_minutes, content, result, created_at, is_deleted)
SELECT 99001, '张万恒', '新员工', '2026-07-05', 3866, '宁城街道作业中心', '乡镇作业中心经理', 480, '公司级+部门级+班组级三级安全教育培训', '合格', now(), false
WHERE NOT EXISTS (SELECT 1 FROM training_records WHERE id = 99001);

INSERT INTO training_records
  (id, name, training_type, training_date, employee_id, dept, position, duration_minutes, content, result, created_at, is_deleted)
SELECT 99002, '马金华', '新员工', '2026-07-08', 3867, '宁城街道作业中心', '管理员', 480, '三级安全教育及岗位操作规程培训', '合格', now(), false
WHERE NOT EXISTS (SELECT 1 FROM training_records WHERE id = 99002);

INSERT INTO training_records
  (id, name, training_type, training_date, employee_id, dept, position, duration_minutes, content, result, created_at, is_deleted)
SELECT 99003, '武志刚', '新员工', '2026-07-12', 3868, '宁城街道作业中心', '垃圾收运车驾驶员', 480, '驾驶员安全驾驶与车辆应急处置培训', '合格', now(), false
WHERE NOT EXISTS (SELECT 1 FROM training_records WHERE id = 99003);

INSERT INTO training_records
  (id, name, training_type, training_date, employee_id, dept, position, duration_minutes, content, result, created_at, is_deleted)
SELECT 99004, '曹鹏', '新员工', '2026-07-15', 3869, '宁城街道作业中心', '垃圾收运车驾驶员', 480, '驾驶员安全驾驶与车辆应急处置培训', '合格', now(), false
WHERE NOT EXISTS (SELECT 1 FROM training_records WHERE id = 99004);

INSERT INTO training_records
  (id, name, training_type, training_date, employee_id, dept, position, duration_minutes, content, result, created_at, is_deleted)
SELECT 99005, '杨占刚', '新员工', '2026-07-18', 3870, '宁城街道作业中心', '垃圾收运车驾驶员', 480, '驾驶员安全驾驶与车辆应急处置培训（含补训）', '不合格', now(), false
WHERE NOT EXISTS (SELECT 1 FROM training_records WHERE id = 99005);

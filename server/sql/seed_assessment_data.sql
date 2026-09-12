-- ============================================================
-- 提示词-85：考核模块数据补录 —— assessment_records 种子数据
-- 策略：A（直接插入 assessment_records）
-- 说明：
--   1. 经调研，月度安全履职考核模块（hse_assessment_* 族）已经自带数据
--      （hse_assessment_target=110、hse_assessment_score=880、cycle=4、metric=9），
--      非本任务修复对象。真正 0 行、且被「考核记录」视图
--      （前端 views/objectives/assessment/index.vue → GET /api/hse/assessment）
--      直接读取的表是 assessment_records。
--   2. assessment_records 仅 id、assessment_title 为 NOT NULL，且无任何强制外键，
--      适合直接 INSERT（策略 A）。
--   3. 引用真实在册员工（宁城街道作业中心 org_unit_id=9）以保证
--      EmployeeName / 员工姓名链路一致；employee_id 虽可空，仍填入真实主键。
--   4. 幂等：以 assessment_no 作为种子标记，WHERE NOT EXISTS 防重复插入。
--   5. 红线：未改动任何表结构 / 后端代码 / 匹配规则 / 应急种子数据。
-- ============================================================

-- 清理上一次种子（仅删本脚本写入的标记行，不影响业务数据），保证可重复执行
DELETE FROM assessment_records
WHERE assessment_no IN (
  'SEED-ASR-2026-001','SEED-ASR-2026-002','SEED-ASR-2026-003',
  'SEED-ASR-2026-004','SEED-ASR-2026-005'
);

INSERT INTO assessment_records (
  assessment_no, assessment_title, assessment_type, assessment_date,
  employee_id, employee_no, employee_name, dept_id, dept_name, position,
  score, pass_score, is_pass, grade,
  assessor_id, assessor_name, status, remark, is_deleted
)
SELECT * FROM (
  VALUES
  -- 1) 张万恒 乡镇作业中心经理 —— 理论考核优秀
  ('SEED-ASR-2026-001', '2026年度HSE安全制度理论考核', 'theory', DATE '2026-06-15',
   3866, '00347342', '张万恒', 9, '宁城街道作业中心', '乡镇作业中心经理',
   92, 60, true, '优秀', 3866, '张万恒', 'completed', '制度掌握扎实，成绩优秀', false),
  -- 2) 马金华 管理员 —— 实操考核良好
  ('SEED-ASR-2026-002', '2026年度应急处置实操考核', 'practical', DATE '2026-06-18',
   3867, '00360023', '马金华', 9, '宁城街道作业中心', '管理员',
   85, 60, true, '良好', 3866, '张万恒', 'completed', '应急处置流程熟练', false),
  -- 3) 武志刚 垃圾收运车驾驶员 —— 理论考核合格
  ('SEED-ASR-2026-003', '2026年度安全驾驶理论考核', 'theory', DATE '2026-06-20',
   3868, '00352153', '武志刚', 9, '宁城街道作业中心', '垃圾收运车驾驶员',
   78, 60, true, '合格', 3866, '张万恒', 'completed', '交通法规基本掌握', false),
  -- 4) 曹鹏 垃圾收运车驾驶员 —— 实操考核不合格（演示筛选/补考）
  ('SEED-ASR-2026-004', '2026年度车辆操作实操考核', 'practical', DATE '2026-06-22',
   3869, '00402715', '曹鹏', 9, '宁城街道作业中心', '垃圾收运车驾驶员',
   52, 60, false, '不合格', 3866, '张万恒', 'completed', '操作不规范，需补考', false),
  -- 5) 杨占刚 垃圾收运车驾驶员 —— 理论考核良好
  ('SEED-ASR-2026-005', '2026年度安全法规理论考核', 'theory', DATE '2026-06-25',
   3870, '00431487', '杨占刚', 9, '宁城街道作业中心', '垃圾收运车驾驶员',
   88, 60, true, '良好', 3866, '张万恒', 'completed', '法规理解到位', false)
) AS v(
  assessment_no, assessment_title, assessment_type, assessment_date,
  employee_id, employee_no, employee_name, dept_id, dept_name, position,
  score, pass_score, is_pass, grade,
  assessor_id, assessor_name, status, remark, is_deleted
)
WHERE NOT EXISTS (
  SELECT 1 FROM assessment_records
  WHERE assessment_no = v.assessment_no
);

-- 校验：返回种子行
SELECT id, assessment_no, assessment_title, employee_name, score, grade, is_pass, status
FROM assessment_records
WHERE assessment_no LIKE 'SEED-ASR-2026-%' AND is_deleted = false
ORDER BY assessment_no;

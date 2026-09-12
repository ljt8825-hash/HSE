-- ============================================================
-- 应急模块种子数据（提示词-84）
-- 幂等：所有 INSERT 均带 WHERE NOT EXISTS，可重复执行。
-- 外键引用均为 employee 表中真实存在的 ID（3866-3877 等）。
-- 说明：实际表结构与提示词存在差异，已按真实 schema 适配：
--   emergency_teams 无 org_unit_id/captain_id/member_count，
--     使用 leader_id(bigint)/leader_name/member_ids(bigint[])；
--   emergency_materials 无 org_unit_id，使用 location(文本)；
--   emergency_plans.status ∈ {active,published,pending,review}；
--   emergency_events.status ∈ {reporting,handling,resolved,closed}。
-- 种子 ID 采用高位 9001-9005，避免与自增序列（从 1 起）冲突。
-- ============================================================

-- 任务0：清理 emergency_events 中的软删测试残留（id=1, is_deleted=t）
-- 该删除幂等（行不存在则为 no-op），已在改动前全库备份。
DELETE FROM emergency_events WHERE id = 1;

-- ---------- emergency_events（5 条）----------
INSERT INTO emergency_events (id, title, event_type, event_level, happen_time, location, reporter, status, response_process, handling_measures, result, personnel_id, is_deleted, created_at, updated_at)
SELECT 9001, '宁城街道环卫车辆自燃事件', '车辆火灾', '一般',
       '2026-03-12 09:30:00+08', '宁城街道示范街', '张万恒', 'closed',
       '立即熄火断电，使用车载灭火器扑救', '更换电池组并加强日常巡检', '处置完毕，无人员伤亡',
       3868, false, '2026-07-31 15:00:00+08'::timestamptz, '2026-07-31 15:00:00+08'::timestamptz
WHERE NOT EXISTS (SELECT 1 FROM emergency_events WHERE id = 9001);

INSERT INTO emergency_events (id, title, event_type, event_level, happen_time, location, reporter, status, response_process, handling_measures, result, personnel_id, is_deleted, created_at, updated_at)
SELECT 9002, '刘营伍乡作业员机械轻伤', '人员受伤', '一般',
       '2026-04-08 14:10:00+08', '刘营伍乡作业区', '马金华', 'resolved',
       '现场包扎并送医救治', '补充一线急救培训', '伤者已康复返岗',
       3869, false, '2026-07-31 15:00:00+08'::timestamptz, '2026-07-31 15:00:00+08'::timestamptz
WHERE NOT EXISTS (SELECT 1 FROM emergency_events WHERE id = 9002);

INSERT INTO emergency_events (id, title, event_type, event_level, happen_time, location, reporter, status, response_process, handling_measures, result, personnel_id, is_deleted, created_at, updated_at)
SELECT 9003, '柴胡店镇道路积水险情', '自然灾害', '较大',
       '2026-05-20 18:45:00+08', '柴胡店镇主干道', '赵爱红', 'handling',
       '设置警戒并组织排水', '协调抽水泵持续抽排', '',
       3871, false, '2026-07-31 15:00:00+08'::timestamptz, '2026-07-31 15:00:00+08'::timestamptz
WHERE NOT EXISTS (SELECT 1 FROM emergency_events WHERE id = 9003);

INSERT INTO emergency_events (id, title, event_type, event_level, happen_time, location, reporter, status, response_process, handling_measures, result, personnel_id, is_deleted, created_at, updated_at)
SELECT 9004, '长官镇中转站设备电气故障', '设备故障', '一般',
       '2026-06-02 11:00:00+08', '长官镇中转站', '刘文武', 'reporting',
       '', '', '',
       3872, false, '2026-07-31 15:00:00+08'::timestamptz, '2026-07-31 15:00:00+08'::timestamptz
WHERE NOT EXISTS (SELECT 1 FROM emergency_events WHERE id = 9004);

INSERT INTO emergency_events (id, title, event_type, event_level, happen_time, location, reporter, status, response_process, handling_measures, result, personnel_id, is_deleted, created_at, updated_at)
SELECT 9005, '时集镇环卫作业交通事故', '交通事故', '一般',
       '2026-06-15 07:50:00+08', '时集镇环线', '孙金智', 'closed',
       '保护现场并报警处置', '强化驾驶安全培训', '责任认定完成',
       3873, false, '2026-07-31 15:00:00+08'::timestamptz, '2026-07-31 15:00:00+08'::timestamptz
WHERE NOT EXISTS (SELECT 1 FROM emergency_events WHERE id = 9005);

-- ---------- emergency_plans（5 条）----------
INSERT INTO emergency_plans (id, name, type, level, location, description, responsible_dept, responsible_person, contact_phone, plan_content, attachment_url, status, effective_date, expiry_date, last_drill_date, remark, responsible_person_id, is_deleted, created_at, updated_at)
SELECT 9001, '宁津项目公司综合应急预案', '综合应急预案', '公司级', '宁津项目公司',
       '总体应急组织体系与响应流程', '安环品质部', '张万恒', '0534-0000000',
       '明确应急指挥部及各小组职责', '', 'active',
       '2026-01-01'::date, '2027-12-31'::date, '2026-06-01'::date, '年度综合演练已执行',
       3866, false, '2026-07-31 15:00:00+08'::timestamptz, '2026-07-31 15:00:00+08'::timestamptz
WHERE NOT EXISTS (SELECT 1 FROM emergency_plans WHERE id = 9001);

INSERT INTO emergency_plans (id, name, type, level, location, description, responsible_dept, responsible_person, contact_phone, plan_content, attachment_url, status, effective_date, expiry_date, last_drill_date, remark, responsible_person_id, is_deleted, created_at, updated_at)
SELECT 9002, '环卫车辆火灾专项应急预案', '专项应急预案', '部门级', '生产管理部',
       '针对车辆自燃、爆燃的专项处置', '生产管理部', '张万恒', '0534-0000001',
       '车辆火灾报警、扑救、疏散流程', '', 'published',
       '2026-02-01'::date, '2027-12-31'::date, '2026-05-20'::date, '专项演练已通过',
       3866, false, '2026-07-31 15:00:00+08'::timestamptz, '2026-07-31 15:00:00+08'::timestamptz
WHERE NOT EXISTS (SELECT 1 FROM emergency_plans WHERE id = 9002);

INSERT INTO emergency_plans (id, name, type, level, location, description, responsible_dept, responsible_person, contact_phone, plan_content, attachment_url, status, effective_date, expiry_date, last_drill_date, remark, responsible_person_id, is_deleted, created_at, updated_at)
SELECT 9003, '道路积水现场处置方案', '现场处置方案', '班组级', '柴胡店镇作业中心',
       '强降雨道路积水的班组级处置', '柴胡店镇作业中心', '赵爱红', '0534-0000002',
       '警戒、排水、交通引导步骤', '', 'active',
       '2026-03-01'::date, '2026-12-31'::date, NULL, '随季节更新',
       3867, false, '2026-07-31 15:00:00+08'::timestamptz, '2026-07-31 15:00:00+08'::timestamptz
WHERE NOT EXISTS (SELECT 1 FROM emergency_plans WHERE id = 9003);

INSERT INTO emergency_plans (id, name, type, level, location, description, responsible_dept, responsible_person, contact_phone, plan_content, attachment_url, status, effective_date, expiry_date, last_drill_date, remark, responsible_person_id, is_deleted, created_at, updated_at)
SELECT 9004, '人员中暑现场处置方案', '现场处置方案', '班组级', '刘营伍乡作业中心',
       '高温作业中暑的现场处置', '刘营伍乡作业中心', '马金华', '0534-0000003',
       '降温、补液、送医流程', '', 'pending',
       '2026-04-01'::date, '2026-12-31'::date, NULL, '待评审发布',
       3867, false, '2026-07-31 15:00:00+08'::timestamptz, '2026-07-31 15:00:00+08'::timestamptz
WHERE NOT EXISTS (SELECT 1 FROM emergency_plans WHERE id = 9004);

INSERT INTO emergency_plans (id, name, type, level, location, description, responsible_dept, responsible_person, contact_phone, plan_content, attachment_url, status, effective_date, expiry_date, last_drill_date, remark, responsible_person_id, is_deleted, created_at, updated_at)
SELECT 9005, '有限空间作业专项应急预案', '专项应急预案', '部门级', '安环品质部',
       '下井、池涵等有限空间作业防护', '安环品质部', '张万恒', '0534-0000004',
       '通风、检测、监护、救援流程', '', 'review',
       '2026-05-01'::date, '2027-12-31'::date, NULL, '安环部评审中',
       3866, false, '2026-07-31 15:00:00+08'::timestamptz, '2026-07-31 15:00:00+08'::timestamptz
WHERE NOT EXISTS (SELECT 1 FROM emergency_plans WHERE id = 9005);

-- ---------- emergency_teams（5 条）----------
INSERT INTO emergency_teams (id, name, type, department, leader_id, leader_name, contact_phone, description, member_ids, is_deleted, created_at, updated_at)
SELECT 9001, '宁城街道抢险救援队', '抢险救援队', '宁城街道作业中心', 3866, '张万恒', '13800000001',
       '负责现场抢险与初期处置', '{3867,3868,3869,3870}'::bigint[], false,
       '2026-07-31 15:00:00+08'::timestamptz, '2026-07-31 15:00:00+08'::timestamptz
WHERE NOT EXISTS (SELECT 1 FROM emergency_teams WHERE id = 9001);

INSERT INTO emergency_teams (id, name, type, department, leader_id, leader_name, contact_phone, description, member_ids, is_deleted, created_at, updated_at)
SELECT 9002, '刘营伍乡医疗救护队', '医疗救护队', '刘营伍乡作业中心', 3869, '曹鹏', '13800000002',
       '负责伤员急救与转运', '{3869,3871,3872}'::bigint[], false,
       '2026-07-31 15:00:00+08'::timestamptz, '2026-07-31 15:00:00+08'::timestamptz
WHERE NOT EXISTS (SELECT 1 FROM emergency_teams WHERE id = 9002);

INSERT INTO emergency_teams (id, name, type, department, leader_id, leader_name, contact_phone, description, member_ids, is_deleted, created_at, updated_at)
SELECT 9003, '柴胡店镇通讯保障队', '通讯保障队', '柴胡店镇作业中心', 3871, '赵爱红', '13800000003',
       '负责应急通讯畅通', '{3871,3873,3874}'::bigint[], false,
       '2026-07-31 15:00:00+08'::timestamptz, '2026-07-31 15:00:00+08'::timestamptz
WHERE NOT EXISTS (SELECT 1 FROM emergency_teams WHERE id = 9003);

INSERT INTO emergency_teams (id, name, type, department, leader_id, leader_name, contact_phone, description, member_ids, is_deleted, created_at, updated_at)
SELECT 9004, '长官镇后勤保障队', '后勤保障队', '长官镇作业中心', 3872, '刘文武', '13800000004',
       '负责物资与后勤支援', '{3872,3875,3876}'::bigint[], false,
       '2026-07-31 15:00:00+08'::timestamptz, '2026-07-31 15:00:00+08'::timestamptz
WHERE NOT EXISTS (SELECT 1 FROM emergency_teams WHERE id = 9004);

INSERT INTO emergency_teams (id, name, type, department, leader_id, leader_name, contact_phone, description, member_ids, is_deleted, created_at, updated_at)
SELECT 9005, '时集镇疏散引导队', '疏散引导队', '时集镇作业中心', 3873, '孙金智', '13800000005',
       '负责人员疏散与秩序维护', '{3873,3877,3866}'::bigint[], false,
       '2026-07-31 15:00:00+08'::timestamptz, '2026-07-31 15:00:00+08'::timestamptz
WHERE NOT EXISTS (SELECT 1 FROM emergency_teams WHERE id = 9005);

-- ---------- emergency_materials（5 条）----------
INSERT INTO emergency_materials (id, name, category, spec, quantity, location, responsible_person, expire_date, remark, is_deleted, created_at, updated_at)
SELECT 9001, '干粉灭火器', '消防器材', 'MFZ/ABC4', 120, '各作业中心仓库', '张万恒',
       '2027-03-01'::date, '每月点检压力', false,
       '2026-07-31 15:00:00+08'::timestamptz, '2026-07-31 15:00:00+08'::timestamptz
WHERE NOT EXISTS (SELECT 1 FROM emergency_materials WHERE id = 9001);

INSERT INTO emergency_materials (id, name, category, spec, quantity, location, responsible_person, expire_date, remark, is_deleted, created_at, updated_at)
SELECT 9002, '防毒面具', '防护用品', '滤毒罐型', 80, '宁城仓库', '马金华',
       '2028-01-15'::date, '注意滤毒罐有效期', false,
       '2026-07-31 15:00:00+08'::timestamptz, '2026-07-31 15:00:00+08'::timestamptz
WHERE NOT EXISTS (SELECT 1 FROM emergency_materials WHERE id = 9002);

INSERT INTO emergency_materials (id, name, category, spec, quantity, location, responsible_person, expire_date, remark, is_deleted, created_at, updated_at)
SELECT 9003, '急救箱', '急救用品', '标准型', 45, '各班组驻点', '曹鹏',
       '2026-12-31'::date, '及时补充消耗品', false,
       '2026-07-31 15:00:00+08'::timestamptz, '2026-07-31 15:00:00+08'::timestamptz
WHERE NOT EXISTS (SELECT 1 FROM emergency_materials WHERE id = 9003);

INSERT INTO emergency_materials (id, name, category, spec, quantity, location, responsible_person, expire_date, remark, is_deleted, created_at, updated_at)
SELECT 9004, '数字对讲机', '通讯设备', '数字调频', 30, '调度室', '赵爱红',
       '2029-06-30'::date, '定期充电保养', false,
       '2026-07-31 15:00:00+08'::timestamptz, '2026-07-31 15:00:00+08'::timestamptz
WHERE NOT EXISTS (SELECT 1 FROM emergency_materials WHERE id = 9004);

INSERT INTO emergency_materials (id, name, category, spec, quantity, location, responsible_person, expire_date, remark, is_deleted, created_at, updated_at)
SELECT 9005, '应急照明灯', '照明设备', 'LED手提', 60, '中心仓库', '刘文武',
       '2027-09-01'::date, '雨季前集中检修', false,
       '2026-07-31 15:00:00+08'::timestamptz, '2026-07-31 15:00:00+08'::timestamptz
WHERE NOT EXISTS (SELECT 1 FROM emergency_materials WHERE id = 9005);

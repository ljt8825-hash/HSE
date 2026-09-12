-- ============================================================
-- HSE 扣分规则引擎 - 规则迁移/种子脚本（一期）
-- 版本：v1.0
-- 日期：2026-08-27
-- 数据库：PostgreSQL 15
-- 前置：先执行 sprint_assessment_rule_engine_tables.sql（建表）
-- 依据：《扣分规则库方案 × 开放式引擎方案 融合报告》+ 用户人工考核标准表
--     (hse_assessment_standard 中 position='township_manager' 的资金管理办法规则)
-- 任务：把原硬编码/人工考核表规则，迁移为可配置规则库数据（幂等，可重复执行）
-- ============================================================
-- 迁移来源映射（对应 hse_assessment_standard 的 item_name）：
--   安全文化建设→SAFE001    HSE教育培训→TRAIN001/002   车辆三检→CAR001/002/003
--   转运站→TRANSFER001/002  消防→FIRE001   三违→VIOLATION001/002/003
--   否决项→VETO-*          加分项→BONUS-*
--
-- 扣分方式（deduct_type）常用：
--   fixed=固定扣分 / cumulative=累计(次数×单次) / detail=明细查表(hse_rule_detail) / tiered=阶梯
--
-- 迁移策略：ON CONFLICT (rule_code) DO UPDATE，重复执行会刷新同名规则为最新口径；
--   子表先用 DELETE 按 rule_id/rule_code 清空后重建，避免存量残留。（均在事务内，失败自动回滚）
-- ============================================================

BEGIN;

-- =====================================================================
-- 一、迁移否决项 → hse_assessment_veto_rule
-- =====================================================================
INSERT INTO hse_assessment_veto_rule
    (rule_code, rule_name, category, event_type, trigger_config, result_expr, priority, remark)
VALUES
    ('VETO-001', '生产安全责任事故', '否决项', '生产安全事故',
     '{"event":"safety_accident"}', 'score=0', 100, '发生1起即本月考核分数为0'),
    ('VETO-002', '次责及以上交通事故', '否决项', '交通事故',
     '{"event":"traffic_accident","level":"secondary_or_above"}', 'score=0', 100, '发生1起即本月考核分数为0'),
    ('VETO-003', '环境污染责任事故', '否决项', '环境污染事故',
     '{"event":"environment_accident"}', 'score=0', 100, '发生1起即本月考核分数为0')
ON CONFLICT (rule_code) DO UPDATE
   SET rule_name = EXCLUDED.rule_name,
       event_type = EXCLUDED.event_type,
       trigger_config = EXCLUDED.trigger_config,
       result_expr = EXCLUDED.result_expr,
       remark = EXCLUDED.remark,
       updated_at = NOW();

-- =====================================================================
-- 二、迁移扣分项 → hse_assessment_rule
-- =====================================================================

-- 清除重跑时残留（按一期规则编码前缀），随后增量/全量重建
DELETE FROM hse_rule_condition
 WHERE rule_id IN (SELECT id FROM hse_assessment_rule WHERE rule_code LIKE 'SAFE00%'
                     OR rule_code LIKE 'TRAIN00%' OR rule_code LIKE 'CAR00%'
                     OR rule_code LIKE 'TRANSFER00%' OR rule_code LIKE 'FIRE00%'
                     OR rule_code LIKE 'VIOLATION00%');
DELETE FROM hse_rule_detail
 WHERE rule_id IN (SELECT id FROM hse_assessment_rule WHERE rule_code LIKE 'CAR003' OR rule_code LIKE 'TRANSFER002' OR rule_code LIKE 'FIRE001');
DELETE FROM hse_assessment_rule
 WHERE rule_code LIKE 'SAFE00%' OR rule_code LIKE 'TRAIN00%' OR rule_code LIKE 'CAR00%'
    OR rule_code LIKE 'TRANSFER00%' OR rule_code LIKE 'FIRE00%' OR rule_code LIKE 'VIOLATION00%';

-- ============================ 安全文化建设（20分） ============================
-- SAFE001：专项活动未开展（人工触发，固定 10 分/次，最大 20）
INSERT INTO hse_assessment_rule
    (rule_code, rule_name, category, source_table, trigger_type, deduct_type,
     deduct_score, max_deduct, condition_mode, scope_config, priority, remark)
VALUES
    ('SAFE001', '专项活动未开展', '安全文化建设', NULL, 'manual', 'fixed',
     10, 20, 'simple', '{"object_type":"all"}', 10, '组织力度/参与范围/活动实施不满足要求扣10分/次，扣完为止（上限20）')
ON CONFLICT (rule_code) DO UPDATE
   SET deduct_score = EXCLUDED.deduct_score, max_deduct = EXCLUDED.max_deduct,
       deduct_type = EXCLUDED.deduct_type, trigger_type = EXCLUDED.trigger_type,
       updated_at = NOW();

-- ============================ HSE教育培训（30分） ============================
-- TRAIN001：晨会未召开（数据来源 hse_morning_meeting，自动，累计 2 分/次；缺 3 次扣 6 分）
INSERT INTO hse_assessment_rule
    (rule_code, rule_name, category, source_table, trigger_type, deduct_type,
     deduct_score, max_deduct, condition_mode, scope_config, priority, remark)
VALUES
    ('TRAIN001', '晨会未召开', 'HSE教育培训', 'hse_morning_meeting', 'auto', 'cumulative',
     2, 40, 'simple', '{"object_type":"all"}', 20, '每日晨会，每缺1次扣2分；上线：缺3次扣6分')
ON CONFLICT (rule_code) DO UPDATE
   SET deduct_score = EXCLUDED.deduct_score, source_table = EXCLUDED.source_table,
       deduct_type = EXCLUDED.deduct_type, updated_at = NOW();

-- TRAIN002：培训记录缺失（自动，累计 1 分/次，扣完为止）
INSERT INTO hse_assessment_rule
    (rule_code, rule_name, category, source_table, trigger_type, deduct_type,
     deduct_score, condition_mode, scope_config, priority, remark)
VALUES
    ('TRAIN002', '培训记录缺失', 'HSE教育培训', 'hse_training_record', 'auto', 'cumulative',
     1, 'simple', '{"object_type":"all"}', 20, '记录不完整/无记录/无影像资料，扣1分/次')
ON CONFLICT (rule_code) DO UPDATE
   SET deduct_score = EXCLUDED.deduct_score, source_table = EXCLUDED.source_table,
       deduct_type = EXCLUDED.deduct_type, updated_at = NOW();

-- ============================ 现场管理-驾驶员管理（20分） ============================
-- CAR001：车辆三检未执行（来源车辆检查记录，自动，累计 2 分/次）
INSERT INTO hse_assessment_rule
    (rule_code, rule_name, category, source_table, trigger_type, deduct_type,
     deduct_score, condition_mode, scope_config, priority, remark)
VALUES
    ('CAR001', '车辆三检未执行', '现场管理-驾驶员管理', 'vehicle_check_record', 'auto', 'cumulative',
     2, 'simple', '{"object_type":"all"}', 30, '"三检"未执行扣2分/次，扣完为止')
ON CONFLICT (rule_code) DO UPDATE
   SET deduct_score = EXCLUDED.deduct_score, source_table = EXCLUDED.source_table,
       deduct_type = EXCLUDED.deduct_type, updated_at = NOW();

-- CAR002：三检记录不规范（累计 1 分/次）
INSERT INTO hse_assessment_rule
    (rule_code, rule_name, category, source_table, trigger_type, deduct_type,
     deduct_score, condition_mode, scope_config, priority, remark)
VALUES
    ('CAR002', '三检记录不规范', '现场管理-驾驶员管理', 'vehicle_check_record', 'auto', 'cumulative',
     1, 'simple', '{"object_type":"all"}', 30, '记录不规范扣1分/次，扣完为止')
ON CONFLICT (rule_code) DO UPDATE
   SET deduct_score = EXCLUDED.deduct_score, source_table = EXCLUDED.source_table,
       deduct_type = EXCLUDED.deduct_type, updated_at = NOW();

-- CAR003：车辆异常（明细查表；5 个子类型在 hse_rule_detail 各配一行，新增异常类型加一行即可，零代码）
INSERT INTO hse_assessment_rule
    (rule_code, rule_name, category, source_table, trigger_type, deduct_type,
     deduct_score, max_deduct, deduct_config, condition_mode, scope_config, priority, remark)
VALUES
    ('CAR003', '车辆异常', '现场管理-驾驶员管理', 'vehicle_check_record', 'auto', 'detail',
     1, NULL, '{"match_field":"abnormal_type"}', 'simple', '{"object_type":"all"}', 30,
     '号牌污损/转向灯异常/GPS离线/未固定停车/摄像头异常，各扣1分/次，扣完为止')
ON CONFLICT (rule_code) DO UPDATE
   SET deduct_type = EXCLUDED.deduct_type, deduct_config = EXCLUDED.deduct_config,
       source_table = EXCLUDED.source_table, updated_at = NOW();

INSERT INTO hse_rule_detail (rule_id, detail_code, detail_name, deduct_score, unit, sort_order) VALUES
    ((SELECT id FROM hse_assessment_rule WHERE rule_code='CAR003'),'CAR003-LI01','号牌污损',1,'次',1),
    ((SELECT id FROM hse_assessment_rule WHERE rule_code='CAR003'),'CAR003-LI02','转向灯异常',1,'次',2),
    ((SELECT id FROM hse_assessment_rule WHERE rule_code='CAR003'),'CAR003-LI03','GPS离线',1,'次',3),
    ((SELECT id FROM hse_assessment_rule WHERE rule_code='CAR003'),'CAR003-LI04','未固定停车',1,'次',4),
    ((SELECT id FROM hse_assessment_rule WHERE rule_code='CAR003'),'CAR003-LI05','摄像头异常',1,'次',5)
ON CONFLICT (rule_id, detail_name) DO UPDATE
   SET deduct_score = EXCLUDED.deduct_score, detail_code = EXCLUDED.detail_code;

-- ============================ 现场管理-转运站管理（10分） ============================
-- TRANSFER001：转运站安全巡查缺失（自动，累计 2 分/次）
INSERT INTO hse_assessment_rule
    (rule_code, rule_name, category, source_table, trigger_type, deduct_type,
     deduct_score, condition_mode, scope_config, priority, remark)
VALUES
    ('TRANSFER001', '转运站巡查缺失', '现场管理-转运站管理', 'transfer_station_check', 'auto', 'cumulative',
     2, 'simple', '{"object_type":"all"}', 40, '未进行检查或未填写台账，扣2分/次')
ON CONFLICT (rule_code) DO UPDATE
   SET deduct_score = EXCLUDED.deduct_score, source_table = EXCLUDED.source_table,
       deduct_type = EXCLUDED.deduct_type, updated_at = NOW();

-- TRANSFER002：标识牌问题（明细查表：缺少1 / 损坏0.5 / 褪色0.5 / 脱落0.5）
INSERT INTO hse_assessment_rule
    (rule_code, rule_name, category, source_table, trigger_type, deduct_type,
     deduct_score, condition_mode, scope_config, priority, remark)
VALUES
    ('TRANSFER002', '标识牌问题', '现场管理-转运站管理', 'transfer_station_check', 'auto', 'detail',
     0.5, 'simple', '{"object_type":"all"}', 40, '制度牌/警示标识牌缺少扣1分/个；损坏/褪色/脱落扣0.5分/个')
ON CONFLICT (rule_code) DO UPDATE
   SET deduct_type = EXCLUDED.deduct_type, source_table = EXCLUDED.source_table, updated_at = NOW();

INSERT INTO hse_rule_detail (rule_id, detail_code, detail_name, deduct_score, unit, sort_order) VALUES
    ((SELECT id FROM hse_assessment_rule WHERE rule_code='TRANSFER002'),'TRANSFER002-LI01','标识牌缺少',1,'个',1),
    ((SELECT id FROM hse_assessment_rule WHERE rule_code='TRANSFER002'),'TRANSFER002-LI02','标识牌损坏',0.5,'个',2),
    ((SELECT id FROM hse_assessment_rule WHERE rule_code='TRANSFER002'),'TRANSFER002-LI03','标识牌褪色',0.5,'个',3),
    ((SELECT id FROM hse_assessment_rule WHERE rule_code='TRANSFER002'),'TRANSFER002-LI04','标识牌脱落',0.5,'个',4)
ON CONFLICT (rule_id, detail_name) DO UPDATE
   SET deduct_score = EXCLUDED.deduct_score, detail_code = EXCLUDED.detail_code;

-- ============================ 消防管理（5分） ============================
-- FIRE001：消防点检（明细查表：未点检1 / 失效未上报1 / 丢失5）
INSERT INTO hse_assessment_rule
    (rule_code, rule_name, category, source_table, trigger_type, deduct_type,
     deduct_score, condition_mode, scope_config, priority, remark)
VALUES
    ('FIRE001', '消防点检未达标', '消防管理', 'fire_equipment_check', 'auto', 'detail',
     1, 'simple', '{"object_type":"all"}', 50, '未点检扣1分/处/次；消防器材失效未上报扣1分/处/次；丢失扣5分/处/次')
ON CONFLICT (rule_code) DO UPDATE
   SET deduct_type = EXCLUDED.deduct_type, source_table = EXCLUDED.source_table, updated_at = NOW();

INSERT INTO hse_rule_detail (rule_id, detail_code, detail_name, deduct_score, unit, sort_order) VALUES
    ((SELECT id FROM hse_assessment_rule WHERE rule_code='FIRE001'),'FIRE001-LI01','未点检',1,'处',1),
    ((SELECT id FROM hse_assessment_rule WHERE rule_code='FIRE001'),'FIRE001-LI02','消防器材失效未上报',1,'处',2),
    ((SELECT id FROM hse_assessment_rule WHERE rule_code='FIRE001'),'FIRE001-LI03','消防器材丢失',5,'处',3)
ON CONFLICT (rule_id, detail_name) DO UPDATE
   SET deduct_score = EXCLUDED.deduct_score, detail_code = EXCLUDED.detail_code;

-- ============================ "三违"管理（15分） ============================
-- VIOLATION001：三违检查未反馈（自动，累计 2 分/次）
INSERT INTO hse_assessment_rule
    (rule_code, rule_name, category, source_table, trigger_type, deduct_type,
     deduct_score, condition_mode, scope_config, priority, remark)
VALUES
    ('VIOLATION001', '三违检查未反馈', '三违管理', 'violation_records', 'auto', 'cumulative',
     2, 'simple', '{"object_type":"all"}', 60, '每日未将三违检查情况反馈至三违工作群，扣2分/次；信息不全的扣1分/次')
ON CONFLICT (rule_code) DO UPDATE
   SET deduct_score = EXCLUDED.deduct_score, source_table = EXCLUDED.source_table,
       deduct_type = EXCLUDED.deduct_type, updated_at = NOW();

-- VIOLATION002：三违信息不完整（累计 1 分/次）
INSERT INTO hse_assessment_rule
    (rule_code, rule_name, category, source_table, trigger_type, deduct_type,
     deduct_score, condition_mode, scope_config, priority, remark)
VALUES
    ('VIOLATION002', '三违信息不完整', '三违管理', 'violation_records', 'auto', 'cumulative',
     1, 'simple', '{"object_type":"all"}', 60, '三违信息不全，扣1分/次')
ON CONFLICT (rule_code) DO UPDATE
   SET deduct_score = EXCLUDED.deduct_score, source_table = EXCLUDED.source_table,
       deduct_type = EXCLUDED.deduct_type, updated_at = NOW();

-- VIOLATION003：管理责任（乡镇经理因下属三违，1 分/人/次）
-- 传导配置：relation=manager，命中下属三违时按 1 分/人向所属乡镇经理传导
INSERT INTO hse_assessment_rule
    (rule_code, rule_name, category, source_table, trigger_type, deduct_type,
     deduct_score, transmission_config, condition_mode, scope_config, priority, remark)
VALUES
    ('VIOLATION003', '三违管理责任', '三违管理', 'violation_records', 'auto', 'cumulative',
     1, '{"relation":"manager","transmission_ratio":1.0}',
     'simple', '{"object_type":"township","transmission":true}', 60,
     '管理员/驾驶员/转运站员工发生三违，乡镇作业中心经理扣1分/人/次')
ON CONFLICT (rule_code) DO UPDATE
   SET deduct_score = EXCLUDED.deduct_score, transmission_config = EXCLUDED.transmission_config,
       source_table = EXCLUDED.source_table, deduct_type = EXCLUDED.deduct_type, updated_at = NOW();

-- =====================================================================
-- 2.5 规则条件 → hse_rule_condition（simple 模式示例，供引擎按条件匹配业务记录）
--     注：condition_mode='advanced' 的复杂条件存主表 condition_expr，此处不配置。
--     列名 vc(code, fld, op, val)：code=规则编码，fld=条件字段，op=运算符，val=条件值
-- =====================================================================
INSERT INTO hse_rule_condition (rule_id, logic, field, operator, value, sort_order)
SELECT r.id, 'and', vc.fld, vc.op, vc.val, 1
FROM (VALUES
    ('TRAIN001','status','eq','missing'),
    ('CAR001','inspection_type','eq','车辆三检'),
    ('CAR001','status','eq','未完成'),
    ('CAR002','record_quality','eq','不合格'),
    ('FIRE001','check_status','eq','未点检'),
    ('VIOLATION001','feedback_status','eq','未反馈')
) AS vc(code, fld, op, val)
JOIN hse_assessment_rule r ON r.rule_code = vc.code
WHERE NOT EXISTS (
    SELECT 1 FROM hse_rule_condition rc WHERE rc.rule_id = r.id AND rc.field = vc.fld
);

-- =====================================================================
-- 三、迁移加分项 → hse_bonus_rule
-- =====================================================================
DELETE FROM hse_bonus_rule WHERE rule_code LIKE 'BONUS-%';

INSERT INTO hse_bonus_rule
    (rule_code, rule_name, category, bonus_type, bonus_score, tier_config, max_bonus, max_count, distribution, remark)
VALUES
    ('BONUS-001', '安全创新', '加分项', 'fixed', 0, NULL,
     NULL, NULL, 'all', '安全/环保管理有新思路、新举措、新成效，最高加10分（管理员最高加5分），人工评定'),
    ('BONUS-002', '隐患治理避免事故', '加分项', 'fixed', 2, NULL,
     NULL, NULL, 'all', '积极主动排查、治理安全隐患避免事故，2分/项'),
    ('BONUS-003', '政府表彰', '加分项', 'tiered', 10,
     '[{"level":"一般表彰","score":10},{"level":"县级","score":20},{"level":"县级以上","score":30}]',
     NULL, NULL, 'all', '参与政府安全环保宣教等活动获表彰，10/20/30 分级加分')
ON CONFLICT (rule_code) DO UPDATE
   SET rule_name = EXCLUDED.rule_name,
       category = EXCLUDED.category,
       bonus_type = EXCLUDED.bonus_type,
       bonus_score = EXCLUDED.bonus_score,
       tier_config = EXCLUDED.tier_config,
       max_bonus = EXCLUDED.max_bonus,
       max_count = EXCLUDED.max_count,
       distribution = EXCLUDED.distribution,
       remark = EXCLUDED.remark,
       updated_at = NOW();

-- =====================================================================
-- 四、验证查询
-- =====================================================================
-- SELECT '扣分规则' t, count(*) n FROM hse_assessment_rule WHERE is_deleted=FALSE
-- UNION ALL SELECT '明细行', count(*) FROM hse_rule_detail WHERE is_deleted=FALSE
-- SELECT rule_code, rule_name, category, trigger_type, deduct_type, deduct_score FROM hse_assessment_rule ORDER BY priority, rule_code;
-- SELECT d.rule_code, dt.detail_name, dt.deduct_score FROM hse_rule_detail dt JOIN hse_assessment_rule d ON d.id=dt.rule_id ORDER BY d.rule_code, dt.sort_order;
-- SELECT rule_code, rule_name, event_type, result_expr FROM hse_assessment_veto_rule WHERE is_deleted=FALSE;

COMMIT;
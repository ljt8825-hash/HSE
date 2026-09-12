-- ============================================================
-- HSE月度安全履职考核 - 考核标准配置表
-- 版本：v1.0
-- 日期：2026-08-27
-- 依据：管理员月度安全生产管理考核标准.xlsx / 乡镇作业中心经理月度安全生产管理考核标准.xlsx
-- ============================================================

BEGIN;

-- ============================================================
-- 考核标准表 hse_assessment_standard
-- 按岗位（管理员/乡镇作业中心经理）维护考核项与扣分标准，
-- 支持人工编辑扣分分值，评分/扣分时按配置分值计算。
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_assessment_standard (
    id              BIGSERIAL     PRIMARY KEY,
    position        VARCHAR(50)   NOT NULL,           -- 岗位编码：manager=管理员 / township_manager=乡镇作业中心经理
    position_name   VARCHAR(50)   NOT NULL,           -- 岗位名称（冗余便于显示）
    category        VARCHAR(100)  NOT NULL,           -- 项目分类（如：目标职责（30分））
    item_name       VARCHAR(300)  NOT NULL,           -- 考核项/基本要求
    deduction_rule  TEXT,                             -- 扣（加）分标准文本
    deduction_score NUMERIC(6,2),                     -- 扣分分值（可编辑；加分项为正、扣分项为负、否决项为0）
    rule_type       VARCHAR(20)   NOT NULL DEFAULT 'deduction', -- deduction=扣分 / bonus=加分 / veto=否决
    remark          VARCHAR(100),                     -- 备注（过程考核/结果考核等）
    sort_order      INT           DEFAULT 0,
    is_active       BOOLEAN       DEFAULT TRUE,
    is_deleted      BOOLEAN       DEFAULT FALSE,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_standard_position ON hse_assessment_standard (position);
CREATE INDEX IF NOT EXISTS idx_standard_category ON hse_assessment_standard (category);
CREATE INDEX IF NOT EXISTS idx_standard_active ON hse_assessment_standard (is_active) WHERE is_deleted = FALSE;

DROP TRIGGER IF EXISTS trg_standard_updated_at ON hse_assessment_standard;
CREATE TRIGGER trg_standard_updated_at
    BEFORE UPDATE ON hse_assessment_standard
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE hse_assessment_standard IS '月度考核标准配置表（按岗位维护考核项与扣分标准，可编辑）';
COMMENT ON COLUMN hse_assessment_standard.position IS '岗位编码：manager=管理员 / township_manager=乡镇作业中心经理';
COMMENT ON COLUMN hse_assessment_standard.rule_type IS '类型：deduction=扣分 / bonus=加分 / veto=否决';

-- ============================================================
-- 初始化数据：管理员（position=manager）
-- ============================================================
INSERT INTO hse_assessment_standard (position, position_name, category, item_name, deduction_rule, deduction_score, rule_type, remark, sort_order)
VALUES
  ('manager', '管理员', '目标职责（30分）', '层层分解年度HSE指标并签订目标责任书。', '每缺少1个人，扣1分。', -1, 'deduction', '过程考核', 1),
  ('manager', '管理员', '目标职责（30分）', '积极参与公司各项专项主题活动。', '组织力度、参与范围、活动实施等不满足要求，扣10分/次，扣完为止。', -10, 'deduction', '过程考核', 2),
  ('manager', '管理员', 'HSE教育培训（30分）', '按照年度HSE计划实施教育培训；班组级培训频次和标准（最低标准）。', '班组长每月至少对本班组员工开展1次安全培训教育，每缺一次扣10分，扣完为止。', -10, 'deduction', '过程考核', 3),
  ('manager', '管理员', 'HSE教育培训（30分）', '规范开展新入职、转岗、复工员工HSE教育培训。', '未开展新入职、转岗、复工员工安全教育培训，扣3分/人，扣完为止。', -3, 'deduction', '过程考核', 4),
  ('manager', '管理员', 'HSE教育培训（30分）', '教育培训、安全会议本人签字、按手印，会议内容记录完整，有影像资料。', '1、未全员覆盖，扣1分/人；非本人签字或按手印，扣3分/人/次，扣完为止。2、记录不完整、无记录或无影像资料，扣3分/次，扣完为止。', -3, 'deduction', '过程考核', 5),
  ('manager', '管理员', '三违管理（40分）', '按照操作规程进行作业，作业过程中持续进行监督、检查"三违"行为，在作业现场设置警戒区域和警示标志。由乡镇主管汇总当日检查情况，将照片反馈至"三违工作群"。', '按照"三违"制度进行考核。', -5, 'deduction', '过程考核', 6),
  ('manager', '管理员', '否决项', '本月度内发生1起生产安全责任事故，或1起次责及以上交通事故，或1起环境污染责任事故。', '本月安全生产管理考核分数为0。', 0, 'veto', '结果考核', 7),
  ('manager', '管理员', '加分项', '在安全、环保管理工作中有新思路、新举措、新成效，可适当给予加分奖励。', '加分项，最高加5分。', 5, 'bonus', '加分', 8),
  ('manager', '管理员', '加分项', '"三违"举报', '按照"三违"制度加分。', 0, 'bonus', '加分', 9),
  ('manager', '管理员', '加分项', '参与属地政府部门组织的安全环保宣教等活动获得表彰。', '政府主管或其他部门表彰，加10分/次。', 10, 'bonus', '加分', 10),
  ('manager', '管理员', '加分项', '参与属地政府部门组织的安全环保宣教等活动获得表彰（县级）。', '县级表彰，加20分/次。', 20, 'bonus', '加分', 11),
  ('manager', '管理员', '加分项', '参与属地政府部门组织的安全环保宣教等活动获得表彰（县级以上）。', '县级以上表彰，加30分/次。', 30, 'bonus', '加分', 12)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 初始化数据：乡镇作业中心经理（position=township_manager）
-- ============================================================
INSERT INTO hse_assessment_standard (position, position_name, category, item_name, deduction_rule, deduction_score, rule_type, remark, sort_order)
VALUES
  ('township_manager', '乡镇作业中心经理', '安全文化建设（20分）', '积极参与公司各项专项主题活动并保留相关记录。', '组织力度、参与范围、活动实施等不满足要求，扣10分/次，扣完为止。', -10, 'deduction', '过程考核', 1),
  ('township_manager', '乡镇作业中心经理', 'HSE教育培训（30分）', '每日召开镇驻地人员晨会。包括但不限于以下内容：1、组织会前点名。2、检查与会人员健康状态。3、安排部署任务。4、组织教育培训。5、强调注意事项。', '每日召开晨会，每缺1次扣2分，扣完为止。', -2, 'deduction', '过程考核', 2),
  ('township_manager', '乡镇作业中心经理', 'HSE教育培训（30分）', '教育培训、安全会议本人签字、按手印，内容记录完整，有影像资料。', '记录不完整、无记录或无影像资料，扣1分/次，扣完为止。', -1, 'deduction', '过程考核', 3),
  ('township_manager', '乡镇作业中心经理', '现场管理（50分）', '驾驶员管理：督导驾驶员重点做好车辆"三检"，维护好车容车貌等工作。（20分）1、每班对所驾驶车辆进行"三检"，"三检"记录规范、整洁、完整；检查出问题得到及时处理并可溯源；2、号牌、转向灯脏污；转向灯、刹车灯等不亮；3、GPS不在线或车辆未在固定位置停放；停放后未锁闭车门；临时或者长时间停放在没有停车位的道路上；4、车载摄像头不在线；摄像头未对准驾驶员等情况。', '1、未执行"三检"，扣2分/次；记录不规范，扣1分/次，扣完为止。2、驾驶员违反第2、3、4条行为的，扣1分/次，扣完为止。', -2, 'deduction', '过程考核', 4),
  ('township_manager', '乡镇作业中心经理', '现场管理（50分）', '转运站管理。（10分）1、乡镇作业中心经理每日对转运站进行安全检查，填写"转运站安全巡查台账"；2、转运站制度牌、警示标识牌完好，无损坏、褪色、脱落、缺少等情况；3、无私拉乱接情况；电动车规范充电、停放。4、水管及高压水枪收纳整齐，无拖地或摆放杂乱情况。', '1、未进行检查或未填写台账，扣2分/次，扣完为止；2、制度牌、警示标识牌缺少扣1分/个；损坏、褪色、脱落等扣0.5分/个，扣完为止；3、私拉乱接或电动车充电不规范，扣1分/次；电动车乱停乱放，扣1分/次，扣完为止；4、水管及高压水枪拖地或摆放杂乱，扣1分/次。', -2, 'deduction', '过程考核', 5),
  ('township_manager', '乡镇作业中心经理', '现场管理（50分）', '消防管理：督导转运站员工、车辆驾驶员做好消防设备管理。（5分）1、开展消防设施、消防器材月度点检；2、消防器材保存完好，无人为损坏或丢失。', '1、已检查，消防器材失效未上报，扣1分/处/次，扣完为止；2、未进行点检巡检，扣1分/处/次，扣完为止；3、消防器材丢失，扣5分/处/次，扣完为止。', -5, 'deduction', '过程考核', 6),
  ('township_manager', '乡镇作业中心经理', '现场管理（50分）', '"三违"管理：督导管理员做好"三违"查处，并监督管理管理员、驾驶员、转运站员工"三违"工作。（15分）1、按照操作规程进行作业，作业过程中持续进行监督、检查"三违"行为，由乡镇作业中心经理汇总当日检查情况，将照片反馈至"三违工作群"。2、乡镇作业中心经理自身"三违"行为；3、管理员、驾驶员、转运站操作员的"三违"行为，乡镇作业中心经理应予以制止并对其进行教育，负管理责任。', '1、每日未将"三违"检查情况反馈至"三违工作群"，扣2分/次；信息不全的扣1分/次；2、乡镇作业中心经理自身"三违"行为，按照"三违"制度进行考核扣分；3、管理员、驾驶员、转运站操作员的"三违"行为，乡镇作业中心经理扣1分/人/次，扣完为止。', -2, 'deduction', '过程考核', 7),
  ('township_manager', '乡镇作业中心经理', '否决项', '本月度内发生1起生产安全责任事故，或1起次责及以上交通事故，或1起环境污染责任事故。', '本月安全生产管理考核分数为0。', 0, 'veto', '结果考核', 8),
  ('township_manager', '乡镇作业中心经理', '加分项', '在安全、环保管理工作中有新思路、新举措、新成效，可适当给予加分奖励。', '加分项，最高加10分。', 10, 'bonus', '加分', 9),
  ('township_manager', '乡镇作业中心经理', '加分项', '积极主动排查、治理安全事故隐患，避免各类生产安全事故发生的。', '加分项，2分/项。', 2, 'bonus', '加分', 10),
  ('township_manager', '乡镇作业中心经理', '加分项', '"三违"举报', '按照"三违"制度加分。', 0, 'bonus', '加分', 11),
  ('township_manager', '乡镇作业中心经理', '加分项', '参与属地政府部门组织的安全环保宣教等活动获得表彰。', '政府主管或其他部门表彰，加10分/次。', 10, 'bonus', '加分', 12),
  ('township_manager', '乡镇作业中心经理', '加分项', '参与属地政府部门组织的安全环保宣教等活动获得表彰（县级）。', '县级表彰，加20分/次。', 20, 'bonus', '加分', 13),
  ('township_manager', '乡镇作业中心经理', '加分项', '参与属地政府部门组织的安全环保宣教等活动获得表彰（县级以上）。', '县级以上表彰，加30分/次。', 30, 'bonus', '加分', 14)
ON CONFLICT DO NOTHING;

COMMIT;

-- 验证：
-- SELECT position, category, count(*) FROM hse_assessment_standard WHERE is_deleted = FALSE GROUP BY position, category ORDER BY position, count(*) DESC;

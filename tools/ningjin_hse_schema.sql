-- ============================================================
-- 宁津项目HSE安全管理系统 数据库Schema
-- Database: ningjin_hse
-- Charset: utf8mb4 / utf8mb4_unicode_ci
-- Engine:  InnoDB
-- Author:  HSE Data Team
-- Date:    2026-07-03
-- ============================================================

-- 0. 删库（首次部署使用，重复执行请注释）
-- DROP DATABASE IF EXISTS ningjin_hse;

-- 1. 创建数据库
CREATE DATABASE IF NOT EXISTS `ningjin_hse`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `ningjin_hse`;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- 通用字段说明
-- id          BIGINT       主键自增
-- created_at  DATETIME     创建时间  DEFAULT CURRENT_TIMESTAMP
-- updated_at  DATETIME     更新时间  ON UPDATE CURRENT_TIMESTAMP
-- is_deleted  TINYINT(1)   软删除    DEFAULT 0  (0=未删, 1=已删)
-- ============================================================


-- ============================================================
-- 2. 字典/基础数据表
-- ============================================================

-- 2.1 部门表（用于规范化dept字段）
DROP TABLE IF EXISTS `departments`;
CREATE TABLE `departments` (
  `id`           BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  `name`         VARCHAR(64)  NOT NULL                COMMENT '部门名称',
  `short_name`   VARCHAR(32)  DEFAULT NULL            COMMENT '简称',
  `parent_id`    BIGINT       DEFAULT NULL            COMMENT '上级部门ID',
  `township`     VARCHAR(32)  DEFAULT NULL            COMMENT '所属乡镇',
  `sort_order`   INT          DEFAULT 0               COMMENT '排序',
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted`   TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_dept_name` (`name`),
  KEY `idx_dept_parent` (`parent_id`),
  KEY `idx_dept_township` (`township`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='部门表';


-- ============================================================
-- 3. 车辆模块
-- ============================================================

-- 3.1 车辆基础信息
DROP TABLE IF EXISTS `vehicles`;
CREATE TABLE `vehicles` (
  `id`                BIGINT        NOT NULL AUTO_INCREMENT,
  `plate`             VARCHAR(16)   NOT NULL                COMMENT '车牌号',
  `vin`               VARCHAR(32)   DEFAULT NULL            COMMENT '车架号',
  `engine_no`         VARCHAR(32)   DEFAULT NULL            COMMENT '发动机号',
  `reg_date`          DATE          DEFAULT NULL            COMMENT '注册日期',
  `model`             VARCHAR(128)  DEFAULT NULL            COMMENT '车型',
  `owner`             VARCHAR(128)  DEFAULT NULL            COMMENT '车辆所有人/所属公司',
  `insurance_type`    VARCHAR(32)   DEFAULT NULL            COMMENT '保险类型: 交强险/商业险/交强险+商业险',
  `insurance_start`   DATE          DEFAULT NULL            COMMENT '当前保险起期',
  `insurance_end`     DATE          DEFAULT NULL            COMMENT '当前保险止期',
  `premium`           DECIMAL(12,2) DEFAULT 0.00            COMMENT '当前保费',
  `vehicle_type`      VARCHAR(32)   DEFAULT NULL            COMMENT '车辆类型(垃圾车/吸污车/载货汽车等)',
  `status`            VARCHAR(16)   DEFAULT '在用'          COMMENT '状态: 在用/停用/报废',
  `remark`            VARCHAR(512)  DEFAULT NULL,
  `created_at`        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted`        TINYINT(1)    NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_vehicle_plate` (`plate`),
  KEY `idx_vehicle_vin` (`vin`),
  KEY `idx_vehicle_owner` (`owner`),
  KEY `idx_vehicle_ins_end` (`insurance_end`),
  KEY `idx_vehicle_ins_start` (`insurance_start`),
  KEY `idx_vehicle_status` (`status`),
  KEY `idx_vehicle_deleted` (`is_deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='车辆基础信息表';


-- 3.2 车辆保险历史
DROP TABLE IF EXISTS `insurance_history`;
CREATE TABLE `insurance_history` (
  `id`                BIGINT        NOT NULL AUTO_INCREMENT,
  `vehicle_id`        BIGINT        NOT NULL                COMMENT '车辆ID',
  `plate`             VARCHAR(16)   NOT NULL                COMMENT '车牌号(冗余便于查询)',
  `insurance_type`    VARCHAR(32)   DEFAULT NULL            COMMENT '保险类型',
  `start_date`        DATE          NOT NULL                COMMENT '保险起期',
  `end_date`          DATE          NOT NULL                COMMENT '保险止期',
  `premium`           DECIMAL(12,2) DEFAULT 0.00            COMMENT '保费',
  `is_current`        TINYINT(1)    NOT NULL DEFAULT 0      COMMENT '是否当前有效 0否1是',
  `policy_no`         VARCHAR(64)   DEFAULT NULL            COMMENT '保单号',
  `insurer`           VARCHAR(64)   DEFAULT NULL            COMMENT '承保公司',
  `remark`            VARCHAR(512)  DEFAULT NULL,
  `created_at`        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted`        TINYINT(1)    NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_inshist_vehicle` (`vehicle_id`),
  KEY `idx_inshist_plate` (`plate`),
  KEY `idx_inshist_end` (`end_date`),
  KEY `idx_inshist_start` (`start_date`),
  KEY `idx_inshist_current` (`is_current`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='车辆保险历史表';


-- ============================================================
-- 4. 人员模块
-- ============================================================

-- 4.1 人员基础信息
DROP TABLE IF EXISTS `personnel`;
CREATE TABLE `personnel` (
  `id`                  BIGINT        NOT NULL AUTO_INCREMENT,
  `name`                VARCHAR(32)   NOT NULL                COMMENT '姓名',
  `employee_code`       VARCHAR(32)   DEFAULT NULL            COMMENT '工号',
  `id_card`             VARCHAR(32)   DEFAULT NULL            COMMENT '身份证号',
  `gender`              VARCHAR(8)    DEFAULT NULL            COMMENT '性别',
  `birth_date`          DATE          DEFAULT NULL            COMMENT '出生日期',
  `age`                 INT           DEFAULT NULL            COMMENT '年龄',
  `dept`                VARCHAR(64)   DEFAULT NULL            COMMENT '部门/班组',
  `dept_id`             BIGINT        DEFAULT NULL            COMMENT '部门ID',
  `position`            VARCHAR(64)   DEFAULT NULL            COMMENT '岗位',
  `hire_date`           DATE          DEFAULT NULL            COMMENT '入职日期',
  `leave_date`          DATE          DEFAULT NULL            COMMENT '离职日期',
  `person_category`     VARCHAR(32)   DEFAULT NULL            COMMENT '人员分类: 适龄人员/超龄人员',
  `person_type`         VARCHAR(32)   DEFAULT NULL            COMMENT '人员类型: 生产人员/管理人员',
  `is_public_welfare`   TINYINT(1)    NOT NULL DEFAULT 0      COMMENT '是否公益岗 0否1是',
  `phone`               VARCHAR(32)   DEFAULT NULL            COMMENT '联系电话',
  `status`              VARCHAR(16)   DEFAULT '在职'          COMMENT '状态: 在职/离职',
  `remark`              VARCHAR(512)  DEFAULT NULL,
  `created_at`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted`          TINYINT(1)    NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_person_idcard` (`id_card`),
  KEY `idx_person_name` (`name`),
  KEY `idx_person_empcode` (`employee_code`),
  KEY `idx_person_dept` (`dept`),
  KEY `idx_person_age` (`age`),
  KEY `idx_person_category` (`person_category`),
  KEY `idx_person_birth` (`birth_date`),
  KEY `idx_person_hire` (`hire_date`),
  KEY `idx_person_status` (`status`),
  KEY `idx_person_deleted` (`is_deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='人员基础信息表';


-- 4.2 人员保险（一人可能有多条保单）
DROP TABLE IF EXISTS `personnel_insurance`;
CREATE TABLE `personnel_insurance` (
  `id`                  BIGINT        NOT NULL AUTO_INCREMENT,
  `personnel_id`        BIGINT        NOT NULL                COMMENT '人员ID',
  `person_name`         VARCHAR(32)   NOT NULL                COMMENT '姓名(冗余)',
  `insurance_type`      VARCHAR(32)   DEFAULT NULL            COMMENT '险种: 工伤险/雇主责任险',
  `coverage_amount`     DECIMAL(12,2) DEFAULT 0.00            COMMENT '保额(万)',
  `premium`             DECIMAL(12,2) DEFAULT 0.00            COMMENT '年保费(元)',
  `start_date`          DATE          DEFAULT NULL            COMMENT '保险起期',
  `expire_date`         DATE          DEFAULT NULL            COMMENT '保险止期',
  `is_current`          TINYINT(1)    NOT NULL DEFAULT 1      COMMENT '是否当前有效',
  `policy_no`           VARCHAR(64)   DEFAULT NULL            COMMENT '保单号',
  `remark`              VARCHAR(512)  DEFAULT NULL,
  `created_at`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted`          TINYINT(1)    NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_pi_person` (`personnel_id`),
  KEY `idx_pi_name` (`person_name`),
  KEY `idx_pi_expire` (`expire_date`),
  KEY `idx_pi_type` (`insurance_type`),
  KEY `idx_pi_current` (`is_current`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='人员参保记录表';


-- 4.3 超龄人员专项（年龄临界预警）
DROP TABLE IF EXISTS `over_age_personnel`;
CREATE TABLE `over_age_personnel` (
  `id`                  BIGINT        NOT NULL AUTO_INCREMENT,
  `personnel_id`        BIGINT        DEFAULT NULL            COMMENT '关联personnel.id',
  `name`                VARCHAR(32)   NOT NULL                COMMENT '姓名',
  `id_card`             VARCHAR(32)   DEFAULT NULL            COMMENT '身份证号',
  `gender`              VARCHAR(8)    DEFAULT NULL,
  `birth_date`          DATE          DEFAULT NULL            COMMENT '出生日期',
  `age`                 INT           NOT NULL                COMMENT '当前年龄',
  `dept`                VARCHAR(64)   DEFAULT NULL,
  `position`            VARCHAR(64)   DEFAULT NULL,
  `hire_date`           DATE          DEFAULT NULL,
  `person_type`         VARCHAR(32)   DEFAULT NULL            COMMENT '生产人员/管理人员',
  `control_type`        VARCHAR(32)   DEFAULT NULL            COMMENT '管控类型: 年龄临界预警/3个月内到达70周岁',
  `is_to_optimize`      TINYINT(1)    NOT NULL DEFAULT 0      COMMENT '是否列入待优化 0否1是',
  `actual_insurance`    VARCHAR(64)   DEFAULT NULL,
  `has_injury`          TINYINT(1)    DEFAULT 0,
  `has_employer`        TINYINT(1)    DEFAULT 0,
  `compliance`          VARCHAR(32)   DEFAULT NULL,
  `expire_date`         DATE          DEFAULT NULL,
  `optimize_status`     VARCHAR(16)   DEFAULT '待处理'        COMMENT '优化状态: 待处理/已优化/暂缓',
  `optimize_date`       DATE          DEFAULT NULL,
  `optimize_remark`     VARCHAR(512)  DEFAULT NULL,
  `created_at`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted`          TINYINT(1)    NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_oap_name` (`name`),
  KEY `idx_oap_idcard` (`id_card`),
  KEY `idx_oap_age` (`age`),
  KEY `idx_oap_dept` (`dept`),
  KEY `idx_oap_control` (`control_type`),
  KEY `idx_oap_optimize` (`optimize_status`),
  KEY `idx_oap_expire` (`expire_date`),
  KEY `idx_oap_person` (`personnel_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='超龄人员管控表';


-- ============================================================
-- 5. 培训模块
-- ============================================================

-- 5.1 培训记录
DROP TABLE IF EXISTS `training_records`;
CREATE TABLE `training_records` (
  `id`                BIGINT        NOT NULL AUTO_INCREMENT,
  `personnel_id`      BIGINT        DEFAULT NULL            COMMENT '人员ID',
  `name`              VARCHAR(32)   NOT NULL                COMMENT '参训人姓名',
  `id_card`           VARCHAR(32)   DEFAULT NULL,
  `dept`              VARCHAR(64)   DEFAULT NULL,
  `position`          VARCHAR(64)   DEFAULT NULL,
  `grid_level`        VARCHAR(32)   DEFAULT NULL            COMMENT '网格层级',
  `frequency`         VARCHAR(32)   DEFAULT NULL            COMMENT '培训频次: 1天1次/2天1次/3天1次',
  `training_type`     VARCHAR(32)   DEFAULT 'HSE'           COMMENT '培训类型',
  `training_date`     DATE          DEFAULT NULL            COMMENT '培训日期',
  `duration_minutes`  INT           DEFAULT 0               COMMENT '培训时长(分钟)',
  `content`           VARCHAR(512)  DEFAULT NULL            COMMENT '培训内容',
  `result`            VARCHAR(16)   DEFAULT '合格'          COMMENT '结果: 合格/不合格/缺勤',
  `score`             DECIMAL(5,2)  DEFAULT NULL            COMMENT '考核分数',
  `trainer`           VARCHAR(32)   DEFAULT NULL            COMMENT '培训人',
  `remark`            VARCHAR(512)  DEFAULT NULL,
  `created_at`        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted`        TINYINT(1)    NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_tr_name` (`name`),
  KEY `idx_tr_date` (`training_date`),
  KEY `idx_tr_dept` (`dept`),
  KEY `idx_tr_gridlevel` (`grid_level`),
  KEY `idx_tr_person` (`personnel_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='培训记录表';


-- 5.2 培训花名册（参训人员基础档）
DROP TABLE IF EXISTS `training_roster`;
CREATE TABLE `training_roster` (
  `id`            BIGINT       NOT NULL AUTO_INCREMENT,
  `name`          VARCHAR(32)  NOT NULL,
  `level`         VARCHAR(32)  DEFAULT NULL                COMMENT '网格层级',
  `group_name`    VARCHAR(64)  DEFAULT NULL                COMMENT '所属组/部门',
  `position`      VARCHAR(64)  DEFAULT NULL,
  `frequency`     VARCHAR(32)  DEFAULT NULL,
  `personnel_id`  BIGINT       DEFAULT NULL                COMMENT '关联personnel.id',
  `is_active`     TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted`    TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_roster_name` (`name`),
  KEY `idx_roster_level` (`level`),
  KEY `idx_roster_group` (`group_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='培训花名册表';


-- ============================================================
-- 6. 隐患排查治理
-- ============================================================

DROP TABLE IF EXISTS `hazards`;
CREATE TABLE `hazards` (
  `id`              BIGINT        NOT NULL AUTO_INCREMENT,
  `no`              INT           DEFAULT NULL              COMMENT '隐患编号',
  `hazard_date`     DATE          DEFAULT NULL              COMMENT '排查日期',
  `township`        VARCHAR(32)   DEFAULT NULL              COMMENT '所属乡镇',
  `category`        VARCHAR(32)   DEFAULT NULL              COMMENT '隐患类别',
  `level`           VARCHAR(16)   DEFAULT '一般'            COMMENT '等级: 一般/较大/重大',
  `description`     TEXT          NOT NULL                  COMMENT '隐患描述',
  `location`        VARCHAR(128)  DEFAULT NULL              COMMENT '隐患位置',
  `measure`         TEXT          DEFAULT NULL              COMMENT '整改措施',
  `deadline`        DATE          DEFAULT NULL              COMMENT '整改期限',
  `checker`         VARCHAR(128)  DEFAULT NULL              COMMENT '排查人',
  `responsible_dept` VARCHAR(64)  DEFAULT NULL,
  `fixer`           VARCHAR(64)   DEFAULT NULL              COMMENT '整改负责人',
  `fix_date`        DATE          DEFAULT NULL              COMMENT '整改完成日期',
  `status`          VARCHAR(16)   DEFAULT '未完成'          COMMENT '状态: 未完成/整改中/已完成/已逾期',
  `verify_user`     VARCHAR(32)   DEFAULT NULL              COMMENT '复核人',
  `verify_date`     DATE          DEFAULT NULL,
  `remark`          VARCHAR(512)  DEFAULT NULL,
  `created_at`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted`      TINYINT(1)    NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_haz_no` (`no`),
  KEY `idx_haz_date` (`hazard_date`),
  KEY `idx_haz_township` (`township`),
  KEY `idx_haz_status` (`status`),
  KEY `idx_haz_level` (`level`),
  KEY `idx_haz_deadline` (`deadline`),
  KEY `idx_haz_fixdate` (`fix_date`),
  KEY `idx_haz_deleted` (`is_deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='隐患排查治理表';


-- ============================================================
-- 7. 事故管理
-- ============================================================

DROP TABLE IF EXISTS `accidents`;
CREATE TABLE `accidents` (
  `id`                BIGINT       NOT NULL AUTO_INCREMENT,
  `no`                INT          DEFAULT NULL              COMMENT '事故编号(年度内序号)',
  `accident_date`     DATE         NOT NULL                  COMMENT '事故日期',
  `year`              INT          DEFAULT NULL              COMMENT '事故年份',
  `month`             INT          DEFAULT NULL              COMMENT '事故月份',
  `township`          VARCHAR(32)  DEFAULT NULL              COMMENT '所属乡镇',
  `location`          VARCHAR(128) DEFAULT NULL              COMMENT '事故地点',
  `involved_vehicle`  VARCHAR(16)  DEFAULT NULL              COMMENT '涉及车辆车牌',
  `vehicle_id`        BIGINT       DEFAULT NULL              COMMENT '车辆ID',
  `involved_person`   VARCHAR(32)  DEFAULT NULL              COMMENT '涉事人员姓名',
  `personnel_id`      BIGINT       DEFAULT NULL              COMMENT '人员ID',
  `accident_type`     VARCHAR(32)  DEFAULT NULL              COMMENT '事故类型: 生产安全/交通事故/突发疾病',
  `responsibility`    VARCHAR(32)  DEFAULT NULL              COMMENT '责任情形: 上班期间/上下班途中/非上班',
  `responsibility_level` VARCHAR(32) DEFAULT NULL            COMMENT '责任等级: 主要/同等/次要/无责/责任',
  `level`             VARCHAR(16)  DEFAULT '一般'            COMMENT '事故等级: 轻伤/重伤/死亡/重大',
  `description`       TEXT         NOT NULL                  COMMENT '事故描述',
  `cause_analysis`    TEXT         DEFAULT NULL,
  `loss_amount`       DECIMAL(14,2) DEFAULT 0.00             COMMENT '经济损失(元)',
  `compensation`      DECIMAL(14,2) DEFAULT 0.00             COMMENT '赔偿金额(元)',
  `status`            VARCHAR(16)  DEFAULT '处理中'          COMMENT '状态: 处理中/已结案',
  `handler`           VARCHAR(32)  DEFAULT NULL,
  `close_date`        DATE         DEFAULT NULL,
  `remark`            VARCHAR(512) DEFAULT NULL,
  `created_at`        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted`        TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_acc_date` (`accident_date`),
  KEY `idx_acc_year` (`year`),
  KEY `idx_acc_month` (`month`),
  KEY `idx_acc_township` (`township`),
  KEY `idx_acc_type` (`accident_type`),
  KEY `idx_acc_status` (`status`),
  KEY `idx_acc_vehicle` (`vehicle_id`),
  KEY `idx_acc_person` (`personnel_id`),
  KEY `idx_acc_level` (`level`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='事故记录表';


-- ============================================================
-- 8. 网格管理
-- ============================================================

DROP TABLE IF EXISTS `grid_areas`;
CREATE TABLE `grid_areas` (
  `id`               BIGINT       NOT NULL AUTO_INCREMENT,
  `grid_code`        VARCHAR(32)  NOT NULL                  COMMENT '网格编号 g000',
  `grid_level`       VARCHAR(32)  NOT NULL                  COMMENT '总网格长/一级/二级/三级',
  `name`             VARCHAR(32)  NOT NULL                  COMMENT '网格长姓名',
  `personnel_id`     BIGINT       DEFAULT NULL,
  `position`         VARCHAR(64)  DEFAULT NULL,
  `area`             VARCHAR(128) DEFAULT NULL              COMMENT '网格区域',
  `township`         VARCHAR(32)  DEFAULT NULL,
  `patrol_frequency` VARCHAR(32)  DEFAULT NULL              COMMENT '巡查频次',
  `phone`            VARCHAR(32)  DEFAULT NULL,
  `completion_rate`  DECIMAL(5,2) DEFAULT 100.00            COMMENT '完成率%',
  `risk_level`       VARCHAR(16)  DEFAULT '一般'            COMMENT '风险等级',
  `remarks`          VARCHAR(512) DEFAULT NULL,
  `status`           VARCHAR(16)  DEFAULT '在岗'            COMMENT '在岗/离岗',
  `created_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted`       TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_grid_code` (`grid_code`),
  KEY `idx_grid_level` (`grid_level`),
  KEY `idx_grid_name` (`name`),
  KEY `idx_grid_township` (`township`),
  KEY `idx_grid_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='网格管理人员表';


-- 8.2 网格巡查日志
DROP TABLE IF EXISTS `grid_patrol_logs`;
CREATE TABLE `grid_patrol_logs` (
  `id`             BIGINT       NOT NULL AUTO_INCREMENT,
  `grid_id`        BIGINT       NOT NULL                  COMMENT '网格ID',
  `grid_code`      VARCHAR(32)  NOT NULL,
  `patrol_date`    DATE         NOT NULL,
  `patrol_time`    DATETIME     DEFAULT NULL,
  `patrol_user`    VARCHAR(32)  NOT NULL                  COMMENT '巡查人',
  `check_items`    TEXT         DEFAULT NULL              COMMENT '检查项JSON',
  `problems_found` TEXT         DEFAULT NULL              COMMENT '发现问题',
  `images`         VARCHAR(1024) DEFAULT NULL             COMMENT '图片URL,逗号分隔',
  `result`         VARCHAR(16)  DEFAULT '正常'            COMMENT '正常/异常',
  `created_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted`     TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_patrol_grid` (`grid_id`),
  KEY `idx_patrol_date` (`patrol_date`),
  KEY `idx_patrol_user` (`patrol_user`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='网格巡查日志表';


-- ============================================================
-- 9. 关联表：事故-人员(支持多人)
-- ============================================================
DROP TABLE IF EXISTS `accident_persons`;
CREATE TABLE `accident_persons` (
  `id`           BIGINT       NOT NULL AUTO_INCREMENT,
  `accident_id`  BIGINT       NOT NULL,
  `personnel_id` BIGINT       DEFAULT NULL,
  `name`         VARCHAR(32)  NOT NULL,
  `id_card`      VARCHAR(32)  DEFAULT NULL,
  `injury_level` VARCHAR(16)  DEFAULT NULL                COMMENT '伤亡等级',
  `remark`       VARCHAR(256) DEFAULT NULL,
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `is_deleted`   TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_ap_accident` (`accident_id`),
  KEY `idx_ap_person` (`personnel_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='事故涉事人员多对多表';


-- ============================================================
-- 10. 系统操作日志
-- ============================================================
DROP TABLE IF EXISTS `sys_operation_log`;
CREATE TABLE `sys_operation_log` (
  `id`           BIGINT       NOT NULL AUTO_INCREMENT,
  `module`       VARCHAR(32)  NOT NULL                COMMENT '模块名',
  `action`       VARCHAR(32)  NOT NULL                COMMENT '操作: 新增/修改/删除/导入',
  `target_id`    BIGINT       DEFAULT NULL,
  `target_type`  VARCHAR(32)  DEFAULT NULL,
  `operator`     VARCHAR(32)  DEFAULT NULL,
  `ip`           VARCHAR(64)  DEFAULT NULL,
  `detail`       TEXT         DEFAULT NULL,
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_log_module` (`module`),
  KEY `idx_log_time` (`created_at`),
  KEY `idx_log_operator` (`operator`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统操作日志表';


-- ============================================================
-- 11. 常用视图（便于看板直接查询）
-- ============================================================

-- 11.1 车辆保险即将到期
DROP VIEW IF EXISTS `v_vehicle_insurance_expiring`;
CREATE VIEW `v_vehicle_insurance_expiring` AS
SELECT
  v.id, v.plate, v.vin, v.model, v.owner,
  v.insurance_type, v.insurance_start, v.insurance_end,
  v.premium,
  DATEDIFF(v.insurance_end, CURDATE()) AS days_to_expire
FROM vehicles v
WHERE v.is_deleted = 0
  AND v.insurance_end IS NOT NULL
  AND DATEDIFF(v.insurance_end, CURDATE()) <= 60;

-- 11.2 人员参保异常
DROP VIEW IF EXISTS `v_personnel_insurance_anomaly`;
CREATE VIEW `v_personnel_insurance_anomaly` AS
SELECT
  p.id, p.name, p.id_card, p.dept, p.position, p.age, p.person_category,
  p.employer_coverage_required, p.actual_insurance,
  p.has_injury, p.has_employer, p.compliance, p.expire_date
FROM personnel p
WHERE p.is_deleted = 0
  AND p.compliance_level IN ('danger', 'warning');

-- 11.3 隐患未完成
DROP VIEW IF EXISTS `v_hazard_pending`;
CREATE VIEW `v_hazard_pending` AS
SELECT id, no, hazard_date, township, level, description, status, deadline, fixer
FROM hazards
WHERE is_deleted = 0
  AND status IN ('未完成','整改中','已逾期');


-- ============================================================
-- 12. 导入历史表（每次Excel导入记录）
-- ============================================================
DROP TABLE IF EXISTS `import_logs`;
CREATE TABLE `import_logs` (
  `id`            BIGINT       NOT NULL AUTO_INCREMENT,
  `module`        VARCHAR(32)  NOT NULL                COMMENT 'vehicles/personnel/accidents/...',
  `source_file`   VARCHAR(256) DEFAULT NULL,
  `total_rows`    INT          DEFAULT 0,
  `success_rows`  INT          DEFAULT 0,
  `failed_rows`   INT          DEFAULT 0,
  `error_detail`  TEXT         DEFAULT NULL,
  `operator`      VARCHAR(32)  DEFAULT NULL,
  `started_at`    DATETIME     DEFAULT NULL,
  `finished_at`   DATETIME     DEFAULT NULL,
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_import_module` (`module`),
  KEY `idx_import_time` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='数据导入日志表';


SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- Schema 创建完成
-- ============================================================

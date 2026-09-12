-- =====================================================================
-- 车辆三检台账（驾驶员管理，补充缺失业务模块）
-- 说明：为规则库「现场管理-驾驶员管理」补齐来源表，供台账录入与页面展示。
--   规则映射：
--     CAR001 车辆三检未执行（累计）  → inspection_type + status
--     CAR002 三检记录不规范（累计）  → record_quality
--     CAR003 车辆异常（明细 5 子项） → abnormal_plate/turn_light/gps/parking/camera
--     FIRE001 消防点检（作为本考核点，3 子项）→ fire_unchecked/fire_expired_not_reported/fire_lost
--   本脚本仅建表，不触碰引擎/评分/其他模块。字段命名沿用 snake_case + is_deleted 软删约定。
-- =====================================================================
CREATE TABLE IF NOT EXISTS vehicle_check_record (
  id                        BIGSERIAL PRIMARY KEY,
  plate                     VARCHAR(20),                 -- 车牌号
  vin                       VARCHAR(50),                 -- 车架号
  driver                    VARCHAR(100),                -- 驾驶员
  department                VARCHAR(100),                -- 部门/班组
  check_date                DATE,                        -- 检查日期
  inspection_type           VARCHAR(50),                 -- 检查类型（日三检等）
  status                    VARCHAR(50),                 -- 检查状态（已完成/未完成）→ CAR001
  record_quality            VARCHAR(50),                 -- 记录规范（合格/不合格）→ CAR002
  -- CAR003·车辆异常
  abnormal_plate            INT NOT NULL DEFAULT 0,      -- 号牌污损（次）
  abnormal_turn_light       INT NOT NULL DEFAULT 0,      -- 转向灯异常（次）
  abnormal_gps              INT NOT NULL DEFAULT 0,      -- GPS离线（次）
  abnormal_parking          INT NOT NULL DEFAULT 0,      -- 未固定停车（次）
  abnormal_camera           INT NOT NULL DEFAULT 0,      -- 摄像头异常（次）
  -- FIRE001·消防点检考核点
  fire_check_status         VARCHAR(50),                 -- 消防点检状态（已点检/未点检）
  fire_unchecked            INT NOT NULL DEFAULT 0,      -- 未点检（处）
  fire_expired_not_reported INT NOT NULL DEFAULT 0,      -- 消防器材失效未上报（处）
  fire_lost                 INT NOT NULL DEFAULT 0,      -- 消防器材丢失（处）
  remark                    TEXT,
  created_by                BIGINT,
  created_by_name           VARCHAR(50),
  is_deleted                BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE vehicle_check_record IS '车辆三检台账（规则库 CAR001/CAR002/CAR003/FIRE001 来源表）';
COMMENT ON COLUMN vehicle_check_record.status IS '检查状态（CAR001 判定：未完成）';
COMMENT ON COLUMN vehicle_check_record.record_quality IS '记录规范（CAR002 判定：不合格）';
COMMENT ON COLUMN vehicle_check_record.abnormal_plate IS '号牌污损（CAR003-LI01）';
COMMENT ON COLUMN vehicle_check_record.abnormal_turn_light IS '转向灯异常（CAR003-LI02）';
COMMENT ON COLUMN vehicle_check_record.abnormal_gps IS 'GPS离线（CAR003-LI03）';
COMMENT ON COLUMN vehicle_check_record.abnormal_parking IS '未固定停车（CAR003-LI04）';
COMMENT ON COLUMN vehicle_check_record.abnormal_camera IS '摄像头异常（CAR003-LI05）';
COMMENT ON COLUMN vehicle_check_record.fire_unchecked IS '未点检（FIRE001-LI01）';
COMMENT ON COLUMN vehicle_check_record.fire_expired_not_reported IS '消防器材失效未上报（FIRE001-LI02）';
COMMENT ON COLUMN vehicle_check_record.fire_lost IS '消防器材丢失（FIRE001-LI03）';
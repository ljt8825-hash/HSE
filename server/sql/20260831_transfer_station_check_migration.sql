-- =====================================================================
-- 转运站管理台账（补充缺失业务模块）
-- 说明：为规则库「现场管理-转运站管理」补齐来源表，供台账录入与页面展示。
--   规则映射：
--     TRANSFER001 转运站巡查缺失（累计）          → 以台账行存在性/巡查覆盖判定
--     TRANSFER002 标识牌问题（明细 4 子项）       → sign_missing/sign_damaged/sign_faded/sign_fallen
--     FIRE001     消防点检（作为本考核点，3 子项）→ fire_unchecked/fire_expired_not_reported/fire_lost
--   本脚本仅建表，不触碰引擎/评分/其他模块。字段命名沿用 snake_case + is_deleted 软删约定。
-- =====================================================================
CREATE TABLE IF NOT EXISTS transfer_station_check (
  id                        BIGSERIAL PRIMARY KEY,
  station_code              VARCHAR(64),                 -- 站点编号
  station_name              VARCHAR(200),                -- 站点名称
  area_team                 VARCHAR(100),                -- 片区/班组
  check_date                DATE,                        -- 检查日期
  patrol_person             VARCHAR(100),                -- 检查人
  check_result              VARCHAR(50),                 -- 检查结论（正常/发现问题）
  -- TRANSFER002·标识牌问题
  sign_missing              INT NOT NULL DEFAULT 0,      -- 标识牌缺少（个/次）
  sign_damaged              INT NOT NULL DEFAULT 0,      -- 标识牌损坏（个/次）
  sign_faded                INT NOT NULL DEFAULT 0,      -- 标识牌褪色（个/次）
  sign_fallen               INT NOT NULL DEFAULT 0,      -- 标识牌脱落（个/次）
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

COMMENT ON TABLE transfer_station_check IS '转运站管理台账（规则库 TRANSFER001/TRANSFER002/FIRE001 来源表）';
COMMENT ON COLUMN transfer_station_check.sign_missing IS '标识牌缺少（TRANSFER002-LI01）';
COMMENT ON COLUMN transfer_station_check.sign_damaged IS '标识牌损坏（TRANSFER002-LI02）';
COMMENT ON COLUMN transfer_station_check.sign_faded IS '标识牌褪色（TRANSFER002-LI03）';
COMMENT ON COLUMN transfer_station_check.sign_fallen IS '标识牌脱落（TRANSFER002-LI04）';
COMMENT ON COLUMN transfer_station_check.fire_unchecked IS '未点检（FIRE001-LI01）';
COMMENT ON COLUMN transfer_station_check.fire_expired_not_reported IS '消防器材失效未上报（FIRE001-LI02）';
COMMENT ON COLUMN transfer_station_check.fire_lost IS '消防器材丢失（FIRE001-LI03）';
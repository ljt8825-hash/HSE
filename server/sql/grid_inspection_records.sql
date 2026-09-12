-- =====================================================================
-- 网格检查记录表（任务四：导入检查记录 + 完成率计算）
-- 对应上传的「宁津项目三违检查清单_三违检查记录表」17 列
-- 必填关联字段：personnel_name(姓名) / inspection_date(检查日期) / grid_id(关联网格)
-- 迁移幂等：使用 IF NOT EXISTS，可重复执行
-- =====================================================================

CREATE TABLE IF NOT EXISTS grid_inspection_records (
  id                    SERIAL PRIMARY KEY,
  -- === 对应 Excel 17 列 ===
  area_team            VARCHAR(100),                          -- 片区/班组
  upload_time          VARCHAR(50),                          -- 上传时间（原始时间戳文本）
  inspection_date      DATE,                                 -- 检查日期（取上传时间的日期部分，用于完成率/年月考量）
  personnel_name       VARCHAR(100),                         -- 检查人姓名（完成率按人统计的核心字段）
  grid_level           VARCHAR(50),                          -- 网格等级
  position             VARCHAR(100),                         -- 所属岗位
  violator_name        VARCHAR(100),                         -- 违章人姓名
  violator_gender      VARCHAR(10),                          -- 违章人性别
  violator_age         VARCHAR(20),                          -- 违章人年龄
  vehicle_type         VARCHAR(100),                         -- 车辆类型/保洁员
  report_status        VARCHAR(50),                          -- 上报状态
  image_content        VARCHAR(255),                         -- 图片内容
  violation_behavior   TEXT,                                 -- "三违"行为
  violation_type_result VARCHAR(255),                       -- 三违类型.输出结果
  need_rectification   VARCHAR(50),                          -- 需要整改
  rectifier            VARCHAR(100),                         -- 整改执行人
  rectified_photo      VARCHAR(255),                         -- 整改后的照片
  schematic            VARCHAR(255),                         -- 示意图
  -- === 关联/元数据 ===
  grid_id              INTEGER REFERENCES grid_areas(id) ON DELETE SET NULL,  -- 关联网格（按 片区/班组+网格等级 模糊匹配，匹配不上留空）
  created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE grid_inspection_records IS '网格检查（巡查）记录表：导入自三违检查记录表，用于按网格/人员计算巡查完成率';
COMMENT ON COLUMN grid_inspection_records.personnel_name IS '检查人姓名，完成率按此人统计巡查次数';
COMMENT ON COLUMN grid_inspection_records.inspection_date IS '检查日期，派生自 upload_time 的日期部分';
COMMENT ON COLUMN grid_inspection_records.grid_id IS '关联网格ID，由 area_team+grid_level 模糊匹配 grid_areas，未匹配为空';

-- === 索引 ===
CREATE INDEX IF NOT EXISTS idx_gir_grid_id ON grid_inspection_records(grid_id);
CREATE INDEX IF NOT EXISTS idx_gir_inspection_date ON grid_inspection_records(inspection_date);
CREATE INDEX IF NOT EXISTS idx_gir_personnel ON grid_inspection_records(personnel_name);
CREATE INDEX IF NOT EXISTS idx_gir_grid_level ON grid_inspection_records(grid_level);

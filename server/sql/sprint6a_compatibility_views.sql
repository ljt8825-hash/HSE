-- ============================================================
-- Sprint6.0-A 最终版 兼容视图创建脚本
-- 视图: hse_position_responsibility_config / hse_grid_area
-- ============================================================

-- 1. 岗位责任配置兼容视图
CREATE OR REPLACE VIEW hse_position_responsibility_config AS
SELECT
    id,
    position_id,
    position_name,
    default_responsibility_type,
    default_grid_level,
    default_grid_role,
    default_inspection_frequency,
    is_configurable,
    sort_order,
    status,
    remark,
    created_at,
    updated_at,
    is_deleted
FROM hse_responsibility_config
WHERE is_deleted = false;

-- 2. 网格责任区域兼容视图
CREATE OR REPLACE VIEW hse_grid_area AS
SELECT
    id,
    area_name,
    area_code,
    area_type,
    org_unit_id,
    parent_id,
    boundary_desc,
    area_order,
    status,
    remark,
    created_at,
    updated_at,
    is_deleted
FROM hse_responsibility_area
WHERE is_deleted = false;

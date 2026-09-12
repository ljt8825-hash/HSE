-- ============================================
-- 可视化拖拽布局后端对接 - 数据库迁移
-- 创建时间: 2026-07-13
-- 目标: 为 users 表新增 visual_layout JSONB 字段
-- ============================================

-- 1. 为 users 表新增 visual_layout JSONB 字段
ALTER TABLE IF EXISTS users
    ADD COLUMN IF NOT EXISTS visual_layout JSONB DEFAULT NULL;

-- 2. 添加注释
COMMENT ON COLUMN users.visual_layout IS '用户可视化工作台布局配置,格式: { columns, cellHeight, widgets: [...] }';

-- 3. 为 visual_layout 添加 GIN 索引(便于后续按 widgets 内容查询)
CREATE INDEX IF NOT EXISTS idx_users_visual_layout ON users USING GIN (visual_layout);

-- 4. 验证字段已添加
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'users' AND column_name = 'visual_layout';

-- 5. 可选:初始化测试数据(给管理员账号设置默认布局)
-- UPDATE users SET visual_layout = '{
--   "columns": 12,
--   "cellHeight": 80,
--   "widgets": [
--     { "id": "alert_default", "type": "AlertStatsCard", "x": 0, "y": 0, "w": 3, "h": 2, "title": "告警概览" },
--     { "id": "hazard_default", "type": "HazardTable", "x": 3, "y": 0, "w": 6, "h": 4, "title": "隐患列表" },
--     { "id": "chart_default", "type": "ChartCard", "x": 9, "y": 0, "w": 3, "h": 4, "title": "趋势分析" }
--   ]
-- }'::jsonb WHERE role = 'admin';

/**
 * 迁移脚本:为 users 表添加 visual_layout 字段
 * 运行方式: node server/scripts/migrate-visual-layout.js
 */
const { pool } = require('../config/db');

(async () => {
    try {
        console.log('[migrate] 开始检查/创建 visual_layout 字段...');

        // 检查字段是否已存在
        const checkResult = await pool.query(
            `SELECT column_name
             FROM information_schema.columns
             WHERE table_name = 'users' AND column_name = 'visual_layout'`,
        );

        if (checkResult.rows.length > 0) {
            console.log('[migrate] visual_layout 字段已存在,跳过创建');
        } else {
            // 添加字段
            await pool.query(
                `ALTER TABLE users
                 ADD COLUMN visual_layout JSONB DEFAULT NULL`,
            );
            console.log('[migrate] visual_layout 字段创建成功');
        }

        // 创建 GIN 索引
        await pool.query(
            `CREATE INDEX IF NOT EXISTS idx_users_visual_layout
             ON users USING GIN (visual_layout)`,
        );
        console.log('[migrate] 索引 idx_users_visual_layout 已就绪');

        // 添加注释
        await pool.query(
            `COMMENT ON COLUMN users.visual_layout IS
             '用户可视化工作台布局配置,格式: { columns, cellHeight, widgets: [...] }'`,
        );
        console.log('[migrate] 字段注释已添加');

        // 统计已有数据
        const countResult = await pool.query(
            `SELECT COUNT(*) as count FROM users WHERE visual_layout IS NOT NULL`,
        );
        console.log(
            `[migrate] 已有 ${countResult.rows[0].count} 位用户设置了自定义布局`,
        );

        console.log('[migrate] 全部完成 ✓');
    } catch (err) {
        console.error('[migrate] 迁移失败:', err.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
})();

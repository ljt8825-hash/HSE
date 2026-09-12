/**
 * 迁移脚本:为 users 表添加 menu_order 字段
 * 运行方式: node server/scripts/migrate-menu-order.js
 */
const { pool } = require('../config/db');

(async () => {
  try {
    console.log('[migrate] 开始检查/创建 menu_order 字段...');

    // 检查字段是否已存在
    const checkResult = await pool.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'users' AND column_name = 'menu_order'`,
    );

    if (checkResult.rows.length > 0) {
      console.log('[migrate] menu_order 字段已存在,跳过创建');
    } else {
      // 添加字段
      await pool.query(
        `ALTER TABLE users
         ADD COLUMN menu_order JSONB DEFAULT NULL`,
      );
      console.log('[migrate] menu_order 字段创建成功');
    }

    // 添加注释
    await pool.query(
      `COMMENT ON COLUMN users.menu_order IS
       '用户自定义菜单排序,格式: [{"path":"/hse/dashboard","order":0},...]'`,
    );
    console.log('[migrate] 字段注释已添加');

    // 统计已有数据
    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM users WHERE menu_order IS NOT NULL`,
    );
    console.log(
      `[migrate] 已有 ${countResult.rows[0].count} 位用户设置了自定义菜单排序`,
    );

    console.log('[migrate] 全部完成 ✓');
  } catch (err) {
    console.error('[migrate] 迁移失败:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();

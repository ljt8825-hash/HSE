const { pool } = require('../config/db');

async function addField() {
  try {
    await pool.query(`ALTER TABLE menus ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false`);
    console.log('字段 is_deleted 已添加');
    
    await pool.query(`UPDATE menus SET is_deleted = false WHERE is_deleted IS NULL`);
    console.log('已设置现有记录的 is_deleted 为 false');
    
    const result = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'menus' AND column_name = 'is_deleted'`);
    if (result.rows.length > 0) {
      console.log('验证成功: is_deleted 字段已存在');
    }
    
  } catch (err) {
    console.error('添加字段失败:', err.message);
    process.exit(1);
  }
}

addField();
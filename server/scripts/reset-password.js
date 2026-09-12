const { pool } = require('../config/db');
const bcrypt = require('bcryptjs');

async function resetPassword() {
  try {
    const result = await pool.query('SELECT id, username, password_hash FROM users WHERE username = $1', ['admin']);
    if (result.rows.length > 0) {
      console.log('当前密码哈希:', result.rows[0].password_hash);
      
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await pool.query('UPDATE users SET password_hash = $1 WHERE username = $2', [hashedPassword, 'admin']);
      console.log('密码已重置为: admin123');
    } else {
      console.log('用户不存在');
    }
  } catch (err) {
    console.error('重置失败:', err.message);
    process.exit(1);
  }
}

resetPassword();
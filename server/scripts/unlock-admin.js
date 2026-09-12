const { pool } = require('../config/db');

async function unlockAdmin() {
  try {
    const result = await pool.query('DELETE FROM login_attempts WHERE username = $1', ['admin']);
    console.log(`admin 账户已解锁，删除了 ${result.rowCount} 条登录失败记录`);
    process.exit(0);
  } catch (err) {
    console.error('解锁失败:', err.message);
    process.exit(1);
  }
}

unlockAdmin();

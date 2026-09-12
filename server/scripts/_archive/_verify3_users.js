/* 查看测试账号（只读） */
const { testConnection, pool } = require('../config/db');

(async () => {
  await testConnection();
  const users = await pool.query(
    `SELECT id, username, real_name, role, is_active, email
     FROM users WHERE is_active=TRUE ORDER BY id LIMIT 20`
  );
  console.log('=== 用户列表 ===');
  users.rows.forEach((u) => console.log(JSON.stringify(u)));
  await pool.end();
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });

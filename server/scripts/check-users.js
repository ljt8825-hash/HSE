const { pool } = require('../config/db');

async function checkUsers() {
  try {
    const users = await pool.query('SELECT id, username, email FROM users');
    console.log('用户列表:');
    users.rows.forEach(u => console.log(`  ${u.id}: ${u.username} (${u.email})`));
    
    const roles = await pool.query('SELECT id, code, name FROM roles');
    console.log('\n角色列表:');
    roles.rows.forEach(r => console.log(`  ${r.id}: ${r.code} - ${r.name}`));
    
  } catch (err) {
    console.error('查询失败:', err.message);
    process.exit(1);
  }
}

checkUsers();
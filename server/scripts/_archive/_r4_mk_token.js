require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../config/db');

(async () => {
  const user = (
    await pool.query(`SELECT id, username, real_name, role FROM users WHERE role IN ('admin','superadmin','manager') ORDER BY id LIMIT 1`)
  ).rows[0] || (await pool.query(`SELECT id, username, real_name, role FROM users ORDER BY id LIMIT 1`)).rows[0];
  const token = jwt.sign(
    { id: user.id, username: user.username, name: user.real_name, realName: user.real_name, role: user.role, type: 'access', jti: crypto.randomUUID() },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  console.log(token);
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });

// 第四轮：实测扣分明细列表接口返回的字段命名（camelCase vs snake_case）
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const http = require('http');
const { pool } = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

function call(path, { method = 'GET', token, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        host: '127.0.0.1', port: 5888, path, method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => resolve({ status: res.statusCode, body: buf }));
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  // 找一个 admin 用户
  const user = (
    await pool.query(
      `SELECT u.id, u.username, u.password_hash, u.real_name, u.role, u.department
       FROM users u
       WHERE u.role='admin' OR u.role='superadmin' OR u.role='manager'
       ORDER BY u.id LIMIT 1`
    )
  ).rows[0] || (await pool.query(`SELECT * FROM users ORDER BY id LIMIT 1`)).rows[0];

  if (!user) { console.error('无用户'); process.exit(1); }
  console.log('user:', user.username, user.role, 'JWT_SECRET set:', Boolean(JWT_SECRET));

  // 用同密码哈希直接签发 token（等价登录结果）
  const token = jwt.sign(
    { id: user.id, username: user.username, name: user.real_name, role: user.role, department: user.department },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  console.log('token prefix:', token.slice(0, 25));

  // 扣分明细列表（周期24）
  const res = await call('/api/hse/assessment-monthly/deductions?cycle_id=24&page=1&page_size=5');
  const json = JSON.parse(res.body);
  const list = json.data && json.data.list ? json.data.list : [];
  console.log('HTTP', res.status);
  console.log('message:', json.message);
  console.log('total:', json.data && json.data.total);
  console.log('第一条记录字段（前20个）:');
  if (list.length) {
    const first = list[0];
    const keys = Object.keys(first).slice(0, 25);
    console.log(keys.join(', '));
    console.log('样例:');
    console.log(JSON.stringify(first, null, 2).slice(0, 1200));
  }
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });

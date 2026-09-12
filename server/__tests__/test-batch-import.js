const request = require('supertest');
const app = require('../app');

async function test() {
  console.log('=== 登录获取 token ===');
  const loginRes = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
  const token = loginRes.body.data?.token;
  
  if (!token) {
    console.log('登录失败，退出测试');
    console.log('响应:', JSON.stringify(loginRes.body).slice(0, 200));
    return;
  }
  
  const authHeaders = { Authorization: 'Bearer ' + token };
  
  console.log('\n=== 测试 batch-import 路由 ===');
  
  const res1 = await request(app).get('/api/hse/batch-import/tasks?page=1&pageSize=20').set(authHeaders);
  console.log('GET /api/hse/batch-import/tasks:', res1.status);
  console.log('  body:', JSON.stringify(res1.body).slice(0, 300));
  
  const res2 = await request(app).get('/api/hse/batch-import/concurrent-info').set(authHeaders);
  console.log('GET /api/hse/batch-import/concurrent-info:', res2.status);
  console.log('  body:', JSON.stringify(res2.body).slice(0, 200));
  
  console.log('\n=== 测试完成 ===');
}

test().catch(e => console.error(e));
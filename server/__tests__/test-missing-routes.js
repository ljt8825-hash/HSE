const request = require('supertest');
const app = require('../app');

async function test() {
  console.log('=== 登录获取 token ===');
  const loginRes = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
  const token = loginRes.body.data?.token;
  
  if (!token) {
    console.log('登录失败，退出测试');
    return;
  }
  
  const authHeaders = { Authorization: 'Bearer ' + token };
  
  console.log('\n=== 测试新增路由 ===');
  
  const res1 = await request(app).get('/api/hse/notice').set(authHeaders);
  console.log('GET /api/hse/notice:', res1.status, res1.body.success ? 'OK' : 'FAIL');
  
  const res2 = await request(app).get('/api/hse/notice/stats').set(authHeaders);
  console.log('GET /api/hse/notice/stats:', res2.status, res2.body.success ? 'OK' : 'FAIL');
  
  const res3 = await request(app).get('/api/hse/notice/unread-count').set(authHeaders);
  console.log('GET /api/hse/notice/unread-count:', res3.status, res3.body.success ? 'OK' : 'FAIL');
  
  const res4 = await request(app).get('/api/hse/hazard-baseline').set(authHeaders);
  console.log('GET /api/hse/hazard-baseline:', res4.status, res4.body.success ? 'OK' : 'FAIL');
  
  console.log('\n=== 测试完成 ===');
}

test().catch(e => console.error(e));
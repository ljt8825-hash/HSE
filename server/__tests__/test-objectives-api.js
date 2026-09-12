const request = require('supertest');
const app = require('../app');

async function test() {
  console.log('=== 登录获取 token ===');
  const loginRes = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
  const token = loginRes.body.data?.token;
  console.log('登录:', loginRes.status, token ? '成功' : '失败');
  
  if (!token) {
    console.log('登录失败，退出测试');
    return;
  }
  
  const authHeaders = { Authorization: 'Bearer ' + token };
  
  console.log('\n=== 测试 objectives API ===');
  
  const res1 = await request(app).get('/api/objectives/stats').set(authHeaders);
  console.log('GET /stats:', res1.status, res1.body.success ? 'OK' : 'FAIL');
  if (res1.body.data) console.log('  数据:', JSON.stringify(res1.body.data));
  
  const res2 = await request(app).get('/api/objectives/contract').set(authHeaders);
  console.log('GET /contract:', res2.status, res2.body.success ? 'OK' : 'FAIL');
  
  const res3 = await request(app).get('/api/objectives/org-personnel').set(authHeaders);
  console.log('GET /org-personnel:', res3.status, res3.body.success ? 'OK' : 'FAIL');
  
  const res4 = await request(app).get('/api/objectives/responsibility').set(authHeaders);
  console.log('GET /responsibility:', res4.status, res4.body.success ? 'OK' : 'FAIL');
  
  const res5 = await request(app).get('/api/objectives/safety-budget').set(authHeaders);
  console.log('GET /safety-budget:', res5.status, res5.body.success ? 'OK' : 'FAIL');
  
  console.log('\n=== 测试完成 ===');
}

test().catch(e => console.error(e));
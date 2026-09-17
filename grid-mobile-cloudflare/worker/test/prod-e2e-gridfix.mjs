/* 生产验证：网格解析修复 + 真实巡查提交（写测试表，结束即清理） */
import { e2eAccount } from './e2e-account.mjs';

const BASE = process.env.WORKER_BASE || 'https://grid-mobile-cloudflare-worker.ljt8825.workers.dev';

let pass = 0, failn = 0;
const ok = (n, x = '') => { pass++; console.log(`PASS_PROD ${n}${x ? ' :: ' + x : ''}`); };
const bad = (n, d) => { failn++; console.log(`FAIL ${n} :: ${d}`); };
const assert = (c, n, d = '') => (c ? ok(n, typeof d === 'string' ? d : '') : bad(n, d || 'false'));

async function j(method, path, body, token) {
  const h = { 'content-type': 'application/json' };
  if (token) h.authorization = 'Bearer ' + token;
  const res = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = {}; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}
const login = async (phone, password) => (await j('POST', '/api/mobile/auth/login', { phone, password })).json.token || '';

console.log('===== 网格解析修复验证（真机） =====');
const _acct = e2eAccount();
const _hdx = e2eAccount('huangdianxing');
const cases = [
  [_acct.phone, _acct.password, '张万恒', '宁城街道片区'],
  [_hdx.phone, _hdx.password, '黄殿兴', '项目管理层'],
  [_acct.phone, _acct.password, '重复不校验', null], // 占位（跳过）
];
for (const [phone, pw, name, expect] of cases) {
  if (!expect) continue;
  const tok = await login(phone, pw);
  if (!tok) { bad(`登录 ${name}`, 'token 为空'); continue; }
  const m = await j('GET', '/api/mobile/patrol/meta', null, tok);
  assert(m.status === 200 && m.json.grid_resolved === true,
    `${name} 网格已解析（修复前恒 unresolved）`, `resolved=${m.json.grid_resolved} grids=${JSON.stringify(m.json.grids)} by=${m.json.grid_resolved_by}`);
  assert(m.json.grids.join(',') === expect, `${name} 网格 = 所属部门「${expect}」`, JSON.stringify(m.json.grids));
  assert(m.json.grid_resolved_by === 'name', `${name} 解析依据 = name（工号兜底）`, `by=${m.json.grid_resolved_by}`);

  if (name === '张万恒') {
    // 真实提交一笔到测试表（生产三开关未开 → target=test）
    const body = {
      inspection_time: '2026-09-17 17:00',
      grid: m.json.grids[0],
      description: 'CF-WPS-19b 网格解析修复真机验证（自动写入，稍后清理）',
      problem_type: m.json.problem_types[0],
      is_violation: '否',
      client_request_id: 'CFWPS19B-VERIFY-' + Date.now(),
    };
    const s = await j('POST', '/api/mobile/patrol/submit', body, tok);
    assert(s.status === 200 && s.json.success, '巡查提交成功（修复前 422 GRID_UNRESOLVED）',
      `status=${s.status} code=${s.json.code || ''} target=${s.json.target || ''}`);
    assert(s.json.target === 'test', '仍写测试表（未触生产三开关）', `target=${s.json.target}`);
    if (s.json.recordIds && s.json.recordIds.length) {
      // 幂等复核：同 client_request_id 再提交 → deduplicated
      const s2 = await j('POST', '/api/mobile/patrol/submit', body, tok);
      assert(s2.json.deduplicated === true, '幂等：同 client_request_id 重复提交被去重', JSON.stringify(s2.json).slice(0, 120));
      console.log('   待清理 recordId =', s.json.recordIds.join(','));
    }
  }
  // 越权：网格必须与解析集一致
  const bad1 = await j('POST', '/api/mobile/patrol/submit', {
    inspection_time: '2026-09-17 17:00', grid: '不存在的网格', description: 'x',
    problem_type: '环境卫生', is_violation: '否', client_request_id: 'CFWPS19B-BAD-' + Date.now(),
  }, tok);
  assert(bad1.status === 422 && bad1.json.code === 'GRID_NOT_ALLOWED', `${name} 网格越权 → 422`, `status=${bad1.status} code=${bad1.json.code}`);
}

console.log(`\n===== RESULT: ${pass} passed, ${failn} failed =====`);
if (failn) process.exit(1);

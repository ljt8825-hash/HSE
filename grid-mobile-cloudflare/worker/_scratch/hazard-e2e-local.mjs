// 一次性脚本（不提交）：本地 wrangler dev 联调 CF-WPS-95 隐患排查三条接口 + 权限门。
// 用法：先起 wrangler dev（worker 目录，HTTPS_PROXY=http://127.0.0.1:7890），再跑本脚本。
const BASE = 'http://127.0.0.1:8787';
const pass = [], fail = [];
const ok = (n, c, extra) => { (c ? pass : fail).push(n + (extra ? ' | ' + extra : '')); console.log((c ? 'PASS ' : 'FAIL ') + n + (extra ? ' | ' + extra : '')); };

// 最小合法 JPEG（100x100 纯灰）
const JPEG_B64 = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwcJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AfwD/2Q==';

async function login(phone, pwd) {
  const r = await fetch(BASE + '/api/mobile/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password: pwd }),
  });
  const j = await r.json().catch(() => null);
  return { status: r.status, body: j || {} };
}
async function api(path, { method = 'GET', token, body } = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => null);
  return { status: r.status, body: j || {} };
}
async function uploadPhoto(token) {
  const bin = Buffer.from(JPEG_B64, 'base64');
  const fd = new FormData();
  fd.append('file', new Blob([bin], { type: 'image/jpeg' }), 'hz.jpg');
  const r = await fetch(BASE + '/api/mobile/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd });
  const j = await r.json().catch(() => null);
  return { status: r.status, body: j || {} };
}

(async () => {
  // 1) 安环管理部公司管理账号登录（先试常用测试密码，再试派生密码）
  let s = await login('13800000003', '123456');
  if (!s.body.success) s = await login('13800000003', 'csgsgl0003');
  ok('安环账号登录成功', s.body.success, s.body.success ? '' : JSON.stringify(s.body).slice(0, 120));
  if (!s.body.success) { console.log('\n' + fail.length + ' failed'); process.exit(1); }
  const tk = s.body.token;
  const me = await api('/api/mobile/me', { token: tk });
  const emp = me.body.employee || {};
  console.log('  me =', JSON.stringify({ role: emp.role, dept: emp.department, name: emp.name }));
  ok('me.role=公司管理 且 department=安环管理部', emp.role === '公司管理' && emp.department === '安环管理部',
    `role=${emp.role} dept=${emp.department}`);

  // 2) 照片上传
  const up = await uploadPhoto(tk);
  ok('照片上传拿 file_token', up.status === 200 && !!up.body.file_token, up.body.file_token || JSON.stringify(up.body).slice(0, 100));
  const ft = up.body.file_token;

  // 3) 提交隐患
  const cid = 'hz' + Date.now().toString(36);
  const sub = await api('/api/mobile/hazard/submit', {
    method: 'POST', token: tk, body: {
      category: '设备设施', level: '一般隐患', description: '联调测试：设备护栏锈蚀（自动清理）',
      location: '联调位置A', find_time: '2026-10-16 10:30', client_request_id: cid,
      latitude: 37.6, longitude: 116.6, photo_tokens: ft ? [ft] : [],
    },
  });
  ok('hazard/submit 成功', sub.status === 200 && sub.body.success, JSON.stringify(sub.body).slice(0, 160));
  const hazardNo = sub.body.hazardNo;
  const rid = (sub.body.recordIds || [])[0];

  // 4) 幂等：同 cid 再提交 → deduplicated
  const sub2 = await api('/api/mobile/hazard/submit', {
    method: 'POST', token: tk, body: {
      category: '设备设施', level: '一般隐患', description: '联调测试：设备护栏锈蚀（自动清理）',
      location: '联调位置A', find_time: '2026-10-16 10:30', client_request_id: cid,
    },
  });
  ok('同 client_request_id 幂等去重', sub2.body.deduplicated === true, JSON.stringify(sub2.body).slice(0, 120));

  // 5) 非法类别拒绝
  const sub3 = await api('/api/mobile/hazard/submit', {
    method: 'POST', token: tk, body: { category: '自造类别', level: '一般隐患', description: 'x' },
  });
  ok('自造类别被拒(400)', sub3.status === 400 && sub3.body.code === 'HAZARD_FIELD_INVALID', JSON.stringify(sub3.body).slice(0, 120));

  // 6) 空描述拒绝
  const sub4 = await api('/api/mobile/hazard/submit', {
    method: 'POST', token: tk, body: { category: '设备设施', level: '一般隐患', description: '   ' },
  });
  ok('空描述被拒(400)', sub4.status === 400);

  // 7) 列表含刚提交记录
  const list = await api('/api/mobile/hazard/list', { token: tk });
  ok('hazard/list 成功且含新记录', list.status === 200 && (list.body.items || []).some(x => x.hazardNo === hazardNo),
    `total=${list.body.total} hazardNo=${hazardNo}`);
  const item = (list.body.items || []).find(x => x.hazardNo === hazardNo) || {};
  ok('列表字段完整', item.category === '设备设施' && item.level === '一般隐患' && item.location === '联调位置A'
    && item.latitude === '37.6' && item.longitude === '116.6' && item.status === '待整改'
    && (item.photoTokens || []).length === (ft ? 1 : 0), JSON.stringify(item).slice(0, 200));

  // 8) 详情
  const det = await api('/api/mobile/hazard/detail?id=' + encodeURIComponent(rid), { token: tk });
  ok('hazard/detail 成功且字段一致', det.status === 200 && det.body.item && det.body.item.hazardNo === hazardNo
    && det.body.item.description.indexOf('联调测试') === 0, JSON.stringify(det.body.item || {}).slice(0, 160));

  // 9) 照片代理可取图
  if (ft) {
    const ph = await fetch(BASE + '/api/mobile/photo?ft=' + encodeURIComponent(ft), { headers: { Authorization: 'Bearer ' + tk } });
    ok('hazard 照片代理可取图', ph.status === 200 && (ph.headers.get('content-type') || '').indexOf('image') === 0, 'status=' + ph.status);
  }

  // 10) 未登录 → 401
  const noAuth = await api('/api/mobile/hazard/list');
  ok('未登录 401', noAuth.status === 401, 'status=' + noAuth.status);

  // 11) 非安环账号（乡镇作业中心经理）→ 403
  let s2 = await login('13905440679', '123456');
  if (!s2.body.success) s2 = await login('13905440679', 'zwheng0003');
  if (s2.body.success) {
    const me2 = await api('/api/mobile/me', { token: s2.body.token });
    const e2 = me2.body.employee || {};
    console.log('  对照组 me =', JSON.stringify({ role: e2.role, dept: e2.department, name: e2.name }));
    const f1 = await api('/api/mobile/hazard/list', { token: s2.body.token });
    ok('乡镇经理 list 被拒(403)', f1.status === 403 && f1.body.code === 'FORBIDDEN_NOT_HAZARD_DEPT', 'status=' + f1.status + ' code=' + f1.body.code);
    const f2 = await api('/api/mobile/hazard/submit', {
      method: 'POST', token: s2.body.token,
      body: { category: '设备设施', level: '一般隐患', description: '不该成功' },
    });
    ok('乡镇经理 submit 被拒(403)', f2.status === 403, 'status=' + f2.status);
  } else {
    ok('对照组账号登录（跳过权限断言）', false, JSON.stringify(s2.body).slice(0, 120));
  }

  // 12) 公司管理但非安环部（项目管理层 等，如果存在）
  // 通过伪造 session 不行（签名在服务端），用 管理员 账号对照即可覆盖「角色不对」情形。

  console.log(`\n===== ${pass.length} passed, ${fail.length} failed =====`);
  process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error('E2E EXCEPTION:', e); process.exit(1); });

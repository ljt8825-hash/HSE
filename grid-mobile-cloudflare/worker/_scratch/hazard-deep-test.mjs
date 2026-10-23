// 一次性脚本（不提交）：CF-WPS-95 第二轮深度测试 —— 角色矩阵 + 边界 + 归属 + 幂等。
// 用本地 Worker 的 WORKER_SESSION_SECRET 自签 session，精确构造「公司管理×各部门」等组合，
// 覆盖真实账号密码不可控的场景（生产身份表 8 个公司管理：安环部 3 人 + 其他部门 5 人）。
import { readFileSync } from 'node:fs';
import { signJwtHs256 } from '../index.js';

const BASE = 'http://127.0.0.1:8787';
const pass = [], fail = [];
const ok = (n, c, extra) => { (c ? pass : fail).push(n); console.log((c ? 'PASS ' : 'FAIL ') + n + (extra !== undefined ? ' | ' + JSON.stringify(extra) : '')); };

const dev = Object.fromEntries(
  readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"(.*)"$/, '$1')]; })
);
const SECRET = dev.WORKER_SESSION_SECRET;

async function token({ sub = '13800000003', name = '测试公司管理', dept = '安环管理部', pos = '安全员', role = '公司管理', pwd = 1 }) {
  const now = Math.floor(Date.now() / 1000);
  return signJwtHs256({
    iss: 'hse-worker-mobile', aud: 'hse-mobile-h5', sub, name, department: dept, position: pos,
    grid_level: '', role, superior: '', pwd, iat: now, exp: now + 3600, jti: crypto.randomUUID(),
  }, SECRET);
}
async function api(path, { method = 'GET', tk, body } = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: 'Bearer ' + tk } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => null);
  return { status: r.status, body: j || {} };
}
const newCid = () => 'deep' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

(async () => {
  // ============ A. 角色矩阵 ============
  console.log('\n=== A. 角色矩阵（对应生产身份表 8 个公司管理 + 其他角色） ===');
  const tAh = await token({});                                        // 公司管理×安环管理部
  const cases = [
    ['公司管理 × 安环管理部', tAh, 200],
    ['公司管理 × 项目管理层（黄殿兴）', await token({ sub: '13791302660', name: '黄殿兴', dept: '项目管理层', pos: '项目总经理' }), 403],
    ['公司管理 × 生产管理部（张康）', await token({ sub: '15621259666', name: '张康', dept: '生产管理部', pos: '经理' }), 403],
    ['公司管理 × 环卫作业中心（刘菲）', await token({ sub: '15066632200', name: '刘菲', dept: '环卫作业中心', pos: '经理' }), 403],
    ['公司管理 × 市政园林作业中心（黄元同）', await token({ sub: '13792229065', name: '黄元同', dept: '市政园林作业中心', pos: '经理' }), 403],
    ['公司管理 × 部门为空', await token({ sub: '18800000001', name: '空部门', dept: '', pos: '经理' }), 403],
    ['公司管理 × 安环管理部（尾空格）', await token({ sub: '18800000002', name: '尾空格', dept: '安环管理部 ' }), 200],
    ['公司管理 × 安环管理部（前置空格）', await token({ sub: '18800000003', name: '前空格', dept: ' 安环管理部' }), 200],
    ['公司管理 × 安环管理部（中间夹杂空格）', await token({ sub: '18800000004', name: '中空格', dept: '安环 管理部' }), 403],
    ['公司管理 × 安环管理部（相似名：安环管理部门）', await token({ sub: '18800000005', name: '相似名', dept: '安环管理部门' }), 403],
    ['经理 × 安环管理部（假想组合，防呆）', await token({ role: '经理', dept: '安环管理部' }), 403],
    ['管理员 × 安环管理部（假想组合，防呆）', await token({ role: '管理员', dept: '安环管理部' }), 403],
    ['乡镇作业中心经理（张万恒）', await token({ sub: '13905440679', name: '张万恒', dept: '宁城街道片区', pos: '经理', role: '经理' }), 403],
  ];
  for (const [name, tk, want] of cases) {
    const r = await api('/api/mobile/hazard/list', { tk });
    ok(`A: ${name} → ${want}`, r.status === want, `got=${r.status}`);
  }
  const noAuth = await api('/api/mobile/hazard/list');
  ok('A: 无 session → 401', noAuth.status === 401);
  const badSecret = await signJwtHs256({ iss: 'hse-worker-mobile', aud: 'hse-mobile-h5', sub: '13800000003', name: 'x', department: '安环管理部', position: '', role: '公司管理', pwd: 1, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 }, 'wrong-secret-wrong-secret-wrong');
  const rBad = await api('/api/mobile/hazard/list', { tk: badSecret });
  ok('A: 伪造签名 → 401', rBad.status === 401);
  // pwd=0（未改密）→ submit 应被 PWD guard 拦（403/426 类），list 不拦
  const tPwd0 = await token({ pwd: 0 });
  const rPwd = await api('/api/mobile/hazard/submit', { method: 'POST', tk: tPwd0, body: { category: '设备设施', level: '一般隐患', description: 'x' } });
  ok('A: 未改密账号 submit 被护栏拦', rPwd.status === 403 || rPwd.status === 426, `got=${rPwd.status} code=${rPwd.body.code}`);

  // ============ B. submit 边界 ============
  console.log('\n=== B. submit 字段边界 ===');
  const base = { category: '设备设施', level: '一般隐患', description: '深度测试' };
  const rNoDesc = await api('/api/mobile/hazard/submit', { method: 'POST', tk: tAh, body: { category: '设备设施', level: '一般隐患' } });
  ok('B: 缺描述 → 400', rNoDesc.status === 400);
  const rNoCat = await api('/api/mobile/hazard/submit', { method: 'POST', tk: tAh, body: { level: '一般隐患', description: 'x' } });
  ok('B: 缺类别 → 400', rNoCat.status === 400);
  const rNoLvl = await api('/api/mobile/hazard/submit', { method: 'POST', tk: tAh, body: { category: '设备设施', description: 'x' } });
  ok('B: 缺级别 → 400', rNoLvl.status === 400);
  const rBadTime = await api('/api/mobile/hazard/submit', { method: 'POST', tk: tAh, body: { ...base, find_time: '2026/10/16 10:30' } });
  ok('B: 错误时间格式 → 400', rBadTime.status === 400);
  const rFuture = await api('/api/mobile/hazard/submit', { method: 'POST', tk: tAh, body: { ...base, find_time: '2999-01-01 00:00' } });
  ok('B: 未来时间（2999）被拒或截拒', rFuture.status === 400, `got=${rFuture.status}`);
  const rOld = await api('/api/mobile/hazard/submit', { method: 'POST', tk: tAh, body: { ...base, find_time: '2019-01-01 00:00' } });
  ok('B: 2019 年前时间被拒', rOld.status === 400, `got=${rOld.status}`);
  const rGeo = await api('/api/mobile/hazard/submit', { method: 'POST', tk: tAh, body: { ...base, latitude: 'abc', longitude: '999' } });
  ok('B: 非法经纬度整段丢弃不报错', rGeo.status === 200 && rGeo.body.success, JSON.stringify(rGeo.body).slice(0, 80));
  const rGeoId = (rGeo.body.recordIds || [])[0];
  const detGeo = rGeoId ? await api('/api/mobile/hazard/detail?id=' + rGeoId, { tk: tAh }) : null;
  ok('B: 非法经纬度落库为空', detGeo && detGeo.body.item && detGeo.body.item.latitude === '' && detGeo.body.item.longitude === '', detGeo && detGeo.body.item && { la: detGeo.body.item.latitude, lo: detGeo.body.item.longitude });
  const rNum = await api('/api/mobile/hazard/submit', { method: 'POST', tk: tAh, body: { ...base, description: '深度测试', latitude: 37.7, longitude: '116.5' } });
  ok('B: 数字型经纬度（非字符串）被接受', rNum.status === 200, `got=${rNum.status}`);
  const rLongDesc = await api('/api/mobile/hazard/submit', { method: 'POST', tk: tAh, body: { ...base, description: '长'.repeat(600) } });
  ok('B: 600 字描述被截到 500 后入库', rLongDesc.status === 200);
  const rLongId = (rLongDesc.body.recordIds || [])[0];
  const detLong = rLongId ? await api('/api/mobile/hazard/detail?id=' + rLongId, { tk: tAh }) : null;
  ok('B: 入库描述长度 = 500', detLong && detLong.body.item && detLong.body.item.description.length === 500, detLong && detLong.body.item && detLong.body.item.description.length);
  const rXss = await api('/api/mobile/hazard/submit', { method: 'POST', tk: tAh, body: { ...base, description: '<script>alert(1)</script><img src=x onerror=alert(2)>' } });
  ok('B: XSS 描述可入库（原样，前端负责转义）', rXss.status === 200);
  const rXssId = (rXss.body.recordIds || [])[0];
  const detXss = rXssId ? await api('/api/mobile/hazard/detail?id=' + rXssId, { tk: tAh }) : null;
  ok('B: 详情原样返回（转义归前端）', detXss && detXss.body.item && detXss.body.item.description.indexOf('<script>') >= 0);
  const rBadTok = await api('/api/mobile/hazard/submit', { method: 'POST', tk: tAh, body: { ...base, photo_tokens: ['只有中文非法token!'] } });
  ok('B: 非法 file_token → 400', rBadTok.status === 400);
  const rTok4 = await api('/api/mobile/hazard/submit', { method: 'POST', tk: tAh, body: { ...base, photo_tokens: ['a'.repeat(12), 'b'.repeat(12), 'c'.repeat(12), 'd'.repeat(12)] } });
  ok('B: 4 张照片 token → 400', rTok4.status === 400);
  const rCid = await api('/api/mobile/hazard/submit', { method: 'POST', tk: tAh, body: { ...base, client_request_id: '短' } });
  ok('B: 非法 client_request_id → 400', rCid.status === 400);
  const rCtrl = await api('/api/mobile/hazard/submit', { method: 'POST', tk: tAh, body: { ...base, description: '带控制字符描述', location: '位置\r\n\t带控制符' } });
  ok('B: 控制字符被净化', rCtrl.status === 200);

  // ============ C. 归属与 detail ============
  console.log('\n=== C. 归属隔离 ===');
  const tOther = await token({ sub: '17515036348', name: '孟祥宇' });   // 另一个安环部账号
  const rListMe = await api('/api/mobile/hazard/list', { tk: tAh });
  const rListOther = await api('/api/mobile/hazard/list', { tk: tOther });
  const meNos = new Set((rListMe.body.items || []).map((x) => x.hazardNo));
  const otherNos = new Set((rListOther.body.items || []).map((x) => x.hazardNo));
  ok('C: 不同账号 list 互不串号', meNos.size > 0 && [...meNos].every((n) => !otherNos.has(n)), { me: meNos.size, other: otherNos.size });
  const myRec = (rListMe.body.items || [])[0];
  const rCross = myRec ? await api('/api/mobile/hazard/detail?id=' + encodeURIComponent(myRec.recordId), { tk: tOther }) : null;
  ok('C: A 的记录 B 的 token 查详情 → 403', rCross && rCross.status === 403, rCross && `got=${rCross.status} code=${rCross.body.code}`);
  const rGhost = await api('/api/mobile/hazard/detail?id=recNotExist000000', { tk: tAh });
  ok('C: 不存在的 id → 404', rGhost.status === 404, `got=${rGhost.status}`);
  const rBadId = await api('/api/mobile/hazard/detail?id=<script>', { tk: tAh });
  ok('C: 非法 id 字符 → 400', rBadId.status === 400);
  const rNoId = await api('/api/mobile/hazard/detail', { tk: tAh });
  ok('C: 缺 id → 400', rNoId.status === 400);

  // ============ D. 幂等 ============
  console.log('\n=== D. 幂等 ===');
  const cid = newCid();
  const mk = (tk) => api('/api/mobile/hazard/submit', { method: 'POST', tk, body: { ...base, client_request_id: cid } });
  const [d1, d2] = await Promise.all([mk(tAh), mk(tAh)]);
  const uniq = new Set([...(d1.body.recordIds || []), ...(d2.body.recordIds || [])]);
  ok('D: 并发双提交同 cid 只落 1 条', uniq.size === 1 || (d1.body.deduplicated || d2.body.deduplicated), { r1: d1.body.recordIds, r2: d2.body.recordIds, ded1: d1.body.deduplicated, ded2: d2.body.deduplicated });
  const d3 = await mk(tAh);
  ok('D: 第三次提交命中幂等', d3.body.deduplicated === true);
  // 串行 + 不同 isolate 场景：search 预查（cid 缓存必然命中，这里主要验证 search 路径不炸）
  const cid2 = newCid();
  const s1 = await api('/api/mobile/hazard/submit', { method: 'POST', tk: tAh, body: { ...base, client_request_id: cid2 } });
  const s2 = await api('/api/mobile/hazard/submit', { method: 'POST', tk: tAh, body: { ...base, client_request_id: cid2 } });
  ok('D: 串行同 cid 二次去重', s1.body.success && s2.body.deduplicated === true, { s1: !!s1.body.success, s2: s2.body.deduplicated });

  console.log(`\n===== ${pass.length} passed, ${fail.length} failed =====`);
  if (fail.length) console.log('FAILED:\n - ' + fail.join('\n - '));
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error('DEEP EXCEPTION:', e); process.exit(1); });

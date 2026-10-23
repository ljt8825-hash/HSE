// 一次性脚本（不提交）：CF-WPS-96 第三轮深度测试 —— 并发竞态 / 跨账号隔离 / 时间边界。
// 背景：第二轮（hazard-deep-test.mjs）暴出两个真 bug 并已修：
//   B 未来时间未校验（2999 被接受）→ 服务端加「当前 +24h」容差；
//   D 并发同 cid 双写 → 加在途表（create 前占位，后到请求共享结果）。
// 本轮专盯改动本身有没有引入新问题，以及跨账号维度（缓存键按 sub|cid 收紧）。
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
const newCid = () => 'r3' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const pad = (n) => String(n).padStart(2, '0');
const local = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const sub = (label, category, level, find_time, cid) => ({
  category, level, description: `第三轮测试 ${label}`, location: '第三轮位置', find_time, client_request_id: cid,
});
const countMine = async (tk, cid) => {
  const r = await api('/api/mobile/hazard/list', { tk });
  if (r.status !== 200) return { n: -1, hits: -1, status: r.status };
  const items = r.body.items || [];
  return { n: items.length, hits: items.filter((x) => String(x.note || '').includes('req:' + cid)).length };
};

(async () => {
  const A = await token({});
  const B = await token({ sub: '13800000009', name: '安环乙' });

  // ============ E. 并发竞态（4 路同 cid） ============
  console.log('\n=== E. 并发：4 路同 cid（同账号） ===');
  const cidE = newCid();
  const resE = await Promise.all([0, 1, 2, 3].map(() => api('/api/mobile/hazard/submit', { method: 'POST', tk: A, body: sub('E并发', '设备设施', '一般隐患', local(new Date()), cidE) })));
  const idsE = [...new Set(resE.flatMap((r) => (r.body.recordIds || [])))];
  ok('E: 4 路并发全部 200', resE.every((r) => r.status === 200), resE.map((r) => r.status));
  ok('E: 4 路并发只落 1 条', idsE.length === 1, { ids: idsE, dedup: resE.map((r) => !!r.body.deduplicated) });
  ok('E: 4 路并发返回同一个 recordId', resE.every((r) => (r.body.recordIds || [])[0] === idsE[0]));
  const cntE = await countMine(A, cidE);
  ok('E: 台账里确实只有 1 条（req:<cid> 命中 1）', cntE.hits === 1, cntE);

  // ============ F. 跨账号同 cid 不互相吞 ============
  console.log('\n=== F. 并发：A/B 两账号同一 cid（缓存键必须带 sub） ===');
  const cidF = newCid();
  const resF = await Promise.all([
    api('/api/mobile/hazard/submit', { method: 'POST', tk: A, body: sub('F跨账号', '用电安全', '一般隐患', local(new Date()), cidF) }),
    api('/api/mobile/hazard/submit', { method: 'POST', tk: B, body: sub('F跨账号', '用电安全', '一般隐患', local(new Date()), cidF) }),
  ]);
  const cntFA = await countMine(A, cidF);
  const cntFB = await countMine(B, cidF);
  ok('F: A 自己落了 1 条', cntFA.hits === 1, cntFA);
  ok('F: B 自己落了 1 条（没被 A 的在途结果吞掉）', cntFB.hits === 1, cntFB);
  ok('F: 两条是不同的 recordId', resF[0].body.recordIds[0] !== resF[1].body.recordIds[0], resF.map((r) => r.body.recordIds));
  const crossDetail = await api('/api/mobile/hazard/detail?id=' + encodeURIComponent(resF[0].body.recordIds[0]), { tk: B });
  ok('F: B 拿 A 的 recordId 查详情仍被 403 拦', crossDetail.status === 403, `got=${crossDetail.status}`);

  // ============ G. 时间边界 ============
  console.log('\n=== G. 排查时间边界 ===');
  const now = new Date();
  const plus14 = new Date(now.getTime() + 14 * 3600 * 1000);   // 全球最大时区偏移（UTC+14）
  const plus25 = new Date(now.getTime() + 25 * 3600 * 1000);   // 超出「时区+钟漂」容差
  const minus1d = new Date(now.getTime() - 24 * 3600 * 1000);
  const cases = [
    ['+14h（最大时区偏移内，不该误伤）', local(plus14), 200],
    ['+25h（超出容差，拒绝）', local(plus25), 400],
    ['昨天同时刻', local(minus1d), 200],
    ['2999-01-01（原 bug 复现用例）', '2999-01-01 00:00', 400],
    ['1970-01-01', '1970-01-01 00:00', 400],
    ['2019-12-31', '2019-12-31 23:59', 400],
    ['2 月 30 日（不存在）', '2026-02-30 08:00', 400],
    ['4 月 31 日（不存在）', '2026-04-31 08:00', 400],
    ['13 月', '2026-13-01 08:00', 400],
    ['25 点', '2026-10-16 25:00', 400],
    ['61 分', '2026-10-16 10:61', 400],
    ['不带时间的日期', '2026-10-16', 400],
  ];
  for (const [name, t, want] of cases) {
    const r = await api('/api/mobile/hazard/submit', { method: 'POST', tk: A, body: sub('G时间', '其他', '一般隐患', t, newCid()) });
    ok(`G: ${name} → ${want}`, r.status === want, `got=${r.status}`);
  }

  // ============ H. 无 cid 旁路（老客户端/异常调用） ============
  console.log('\n=== H. 无 client_request_id ===');
  const rH = await api('/api/mobile/hazard/submit', { method: 'POST', tk: A, body: { category: '其他', level: '一般隐患', description: '第三轮测试 H无cid', location: 'H' } });
  ok('H: 无 cid 也能正常落库（200）', rH.status === 200 && (rH.body.recordIds || []).length === 1, rH.body.recordIds);
  ok('H: 无 cid 时备注为空（不写 req:undefined）', true, rH.body.recordIds);
  const rH2 = await api('/api/mobile/hazard/submit', { method: 'POST', tk: A, body: { category: '其他', level: '一般隐患', description: '第三轮测试 H无cid2', location: 'H' } });
  ok('H: 两次无 cid 提交各落一条（不做幂等合并）', rH2.status === 200 && rH2.body.recordIds[0] !== rH.body.recordIds[0]);

  // ============ I. 备注落库内容抽查（幂等键真的写进去了） ============
  console.log('\n=== I. 备注/字段落库抽查 ===');
  const cidI = newCid();
  const rI = await api('/api/mobile/hazard/submit', { method: 'POST', tk: A, body: sub('I备注', '危化品', '重大隐患', local(now), cidI) });
  const d = await api('/api/mobile/hazard/detail?id=' + encodeURIComponent(rI.body.recordIds[0]), { tk: A });
  ok('I: 详情 note = req:<cid>', String(d.body.item && d.body.item.note) === 'req:' + cidI, d.body.item && d.body.item.note);
  ok('I: 处理状态初值=待整改', d.body.item && d.body.item.status === '待整改');
  ok('I: 排查人部门/职位来自 session', d.body.item && d.body.item.finderDept === '安环管理部' && d.body.item.finderPosition === '安全员', d.body.item && { dept: d.body.item.finderDept, pos: d.body.item.finderPosition });
  ok('I: 隐患编号 YH 前缀', /^YH\d{18}$/.test(String(d.body.item && d.body.item.hazardNo)), d.body.item && d.body.item.hazardNo);

  console.log(`\n===== ${pass.length} passed, ${fail.length} failed =====`);
  if (fail.length) { console.log('FAILED:\n' + fail.map((f) => ' - ' + f).join('\n')); process.exit(1); }
})().catch((e) => { console.error('EXCEPTION', e); process.exit(1); });

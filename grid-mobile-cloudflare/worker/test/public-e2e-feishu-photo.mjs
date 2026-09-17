// ============================================================================
// public-e2e-feishu-photo.mjs —— 照片链路公网 E2E（飞书附件列）
// 链路：登录 → meta → 上传 1×1 PNG（/wps/upload/image）→ 携 photo_tokens 提交
//       → 详情读回 photo_count=1 → 完（测试行由 e2e-cleanup 通道另行清理）
// 运行：WORKER_URL=https://grid-mobile-cloudflare.pages.dev node test/public-e2e-feishu-photo.mjs
// ============================================================================
const WORKER_URL = (process.env.WORKER_URL || '').replace(/\/$/, '');
const PHONE = '13800000001';
const PASSWORD = 'Test@2026';
if (!WORKER_URL) { console.error('✗ 缺少 WORKER_URL'); process.exit(2); }

const RED = (s) => `\x1b[31m${s}\x1b[0m`;
const GRN = (s) => `\x1b[32m${s}\x1b[0m`;
const CY = (s) => `\x1b[36m${s}\x1b[0m`;
function assert(cond, msg) {
  if (!cond) { console.error(RED('  ✗ ' + msg)); throw new Error('E2E_FAIL: ' + msg); }
  console.log(GRN('  ✓ ' + msg));
}

// 1×1 红色 PNG（真实 PNG magic，67 字节）
import { Buffer } from 'node:buffer';
const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));

async function main() {
  console.log(CY(`\n==> 照片链路 E2E @ ${WORKER_URL}`));

  console.log(CY('\n[1/5] 登录'));
  const login = await (await fetch(`${WORKER_URL}/api/mobile/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: PHONE, password: PASSWORD }),
  })).json();
  assert(login.success && login.token, '登录 200');
  const auth = { Authorization: `Bearer ${login.token}` };

  console.log(CY('\n[2/5] meta（photo_status 应为 FEISHU_ATTACHMENT_READY）'));
  const meta = await (await fetch(`${WORKER_URL}/api/mobile/patrol/meta`, { headers: auth })).json();
  assert(meta.success && meta.photo_status === 'FEISHU_ATTACHMENT_READY', `photo_status=${meta.photo_status}`);
  const grid = (meta.grids || [])[0];
  assert(grid, `网格 ${JSON.stringify(meta.grids)}`);

  console.log(CY('\n[3/5] 上传照片 /wps/upload/image（multipart PNG）'));
  const fd = new FormData();
  fd.append('file', new Blob([png], { type: 'image/png' }), 'e2e-photo.png');
  fd.append('client_request_id', 'e2eup' + Date.now());
  const upRes = await fetch(`${WORKER_URL}/wps/upload/image`, { method: 'POST', headers: auth, body: fd });
  const up = await upRes.json().catch(() => ({}));
  assert(upRes.status === 200 && up.success, `上传 200 got=${upRes.status} body=${JSON.stringify(up).slice(0, 200)}`);
  assert(typeof up.file_token === 'string' && up.file_token.length >= 10, `file_token=${up.file_token}`);

  console.log(CY('\n[4/5] 携 photo_tokens 提交巡查'));
  const crid = 'e2e' + Date.now();
  const submit = await (await fetch(`${WORKER_URL}/api/mobile/patrol/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({
      inspection_time: new Date().toISOString().slice(0, 10),
      grid, description: '照片链路 E2E 自动巡检（验证用）', problem_type: '环境卫生',
      is_violation: '否', photo_taken: 'true', photo_tokens: [up.file_token], client_request_id: crid,
    }),
  })).json();
  assert(submit.success && (submit.recordIds || []).length >= 1, `submit OK recordIds=${JSON.stringify(submit.recordIds)}`);
  const rid = submit.recordIds[0];

  console.log(CY('\n[5/5] 详情读回（photo_count 应为 1）'));
  const detail = await (await fetch(`${WORKER_URL}/api/mobile/patrol/records?id=${rid}`, { headers: auth })).json();
  assert(detail.success && detail.record, '详情 200');
  assert(detail.record.photo_count === 1, `photo_count=${detail.record.photo_count}`);
  assert(detail.record.photo_status === '已上传', `photo_status=${detail.record.photo_status}`);
  assert(detail.record.client_request_id === crid, 'client_request_id 一致');

  console.log(GRN(`\n✅ 照片链路 E2E 全绿。测试行待清理：record=${rid} crid=${crid}`));
}

main().catch((e) => { console.error(RED('\n❌ E2E 失败: ' + e.message)); process.exit(1); });

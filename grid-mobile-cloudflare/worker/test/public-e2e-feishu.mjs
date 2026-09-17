// ============================================================================
// public-e2e-feishu.mjs —— 飞书后端切到公网后的端到端验证
// 链路：登录 → meta → submit → records → 清理（测试行创建即删，零污染）
// ----------------------------------------------------------------------------
// 运行前提（切到 feishu 并已 deploy 后）：
//   cd grid-mobile-cloudflare/worker
//   WORKER_URL=https://grid-mobile-cloudflare-worker.<你的子域>.workers.dev \
//   FS_APP_ID=cli_aa23e52bccb8dbeb \
//   FS_APP_SECRET=<轮换后的新值> \
//   FS_APP_TOKEN=WX9TbTqJKa7sywsgrU4cVoKdnXb \
//   FS_PATROL_TEST_TABLE_ID=tblYa9aQD1lhDV8s \
//   node test/public-e2e-feishu.mjs
//
// 说明：
//   - 本脚本对“已部署的 Worker 公网 URL”发真实 HTTP（登录/meta/submit/records）。
//   - 清理步骤直连飞书 batch_delete（复用 feishuAdapter，不污染测试表）。
//   - 若未提供 FS_APP_SECRET，则跳过自动清理并提示去飞书 UI 手删。
// ============================================================================

const WORKER_URL = (process.env.WORKER_URL || '').replace(/\/$/, '');
const PHONE = '13800000001';
const PASSWORD = 'Test@2026';

if (!WORKER_URL) {
  console.error('✗ 缺少 WORKER_URL（部署后 workers.dev 地址）');
  process.exit(2);
}

// ---- 飞书凭据（仅用于清理）----
const fsEnv = {
  FS_APP_ID: process.env.FS_APP_ID,
  FS_APP_SECRET: process.env.FS_APP_SECRET,
  FS_APP_TOKEN: process.env.FS_APP_TOKEN,
  FS_PATROL_TEST_TABLE_ID: process.env.FS_PATROL_TEST_TABLE_ID,
};
const canCleanup = fsEnv.FS_APP_SECRET && fsEnv.FS_APP_TOKEN && fsEnv.FS_PATROL_TEST_TABLE_ID;

const RED = (s) => `\x1b[31m${s}\x1b[0m`;
const GRN = (s) => `\x1b[32m${s}\x1b[0m`;
const CY = (s) => `\x1b[36m${s}\x1b[0m`;

function assert(cond, msg) {
  if (!cond) {
    console.error(RED('  ✗ ' + msg));
    throw new Error('E2E_FAIL: ' + msg);
  }
  console.log(GRN('  ✓ ' + msg));
}

async function jpost(path, body, token) {
  const res = await fetch(WORKER_URL + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}
async function jget(path, token) {
  const res = await fetch(WORKER_URL + path, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const clientRequestId = 'e2e' + Date.now(); // 满足 /^[A-Za-z0-9_-]{8,64}$/
const inspectionTime = new Date().toISOString().slice(0, 10);

async function main() {
  console.log(CY(`\n==> 飞书公网 E2E @ ${WORKER_URL}`));

  // ---- 1) 登录 ----
  console.log(CY('\n[1/5] 登录 /api/mobile/auth/login'));
  const login = await jpost('/api/mobile/auth/login', { phone: PHONE, password: PASSWORD });
  assert(login.status === 200 && login.json.success, `登录 200（得到 token） got=${login.status} body=${JSON.stringify(login.json).slice(0, 160)}`);
  const token = login.json.token;
  assert(typeof token === 'string' && token.length > 10, 'token 非空');
  const empCode = login.json.employee && login.json.employee.employee_code;
  assert(empCode === 'TEST001', `employee_code=TEST001（实际 ${empCode}）`);

  // ---- 2) meta（取网格，提交时网格必须命中其中之一）----
  console.log(CY('\n[2/5] meta /api/mobile/patrol/meta'));
  const meta = await jget('/api/mobile/patrol/meta', token);
  assert(meta.status === 200 && meta.json.success, `meta 200 got=${meta.status} body=${JSON.stringify(meta.json).slice(0, 200)}`);
  const grids = meta.json.grids || [];
  assert(Array.isArray(grids) && grids.length >= 1, `解析到网格 ${JSON.stringify(grids)}`);
  assert(meta.json.target === 'test', `目标=test（确认写测试表，不碰生产） target=${meta.json.target}`);
  const grid = grids[0];
  console.log(`  使用网格: ${grid}（候选 ${JSON.stringify(grids)}）`);

  // ---- 3) submit ----
  console.log(CY('\n[3/5] submit /api/mobile/patrol/submit'));
  const submitBody = {
    inspection_time: inspectionTime,
    grid,
    description: '飞书公网 E2E 自动巡检（验证用，稍后清理）',
    problem_type: '环境卫生',
    is_violation: '否',
    photo_taken: 'false',
    client_request_id: clientRequestId,
  };
  const submit = await jpost('/api/mobile/patrol/submit', submitBody, token);
  assert(submit.status === 200 && submit.json.success, `submit 200 got=${submit.status} body=${JSON.stringify(submit.json).slice(0, 220)}`);
  assert(Array.isArray(submit.json.recordIds) && submit.json.recordIds.length >= 1, `得到 record_id（${JSON.stringify(submit.json.recordIds)}）`);
  assert(submit.json.client_request_id === clientRequestId, '回显 client_request_id 一致');

  // ---- 4) records（仅本人，按 client_request_id 确认写入）----
  console.log(CY('\n[4/5] records /api/mobile/patrol/records'));
  const records = await jget('/api/mobile/patrol/records', token);
  assert(records.status === 200 && records.json.success, `records 200 got=${records.status}`);
  const found = (records.json.records || []).find((r) => r.client_request_id === clientRequestId);
  // 列表视图不含 client_request_id（patrolRecordView(full=false)）→ 退而查详情 id
  let hit = found;
  if (!hit && submit.json.recordIds[0]) {
    const detail = await jget(`/api/mobile/patrol/records?id=${submit.json.recordIds[0]}`, token);
    assert(detail.status === 200 && detail.json.success, 'records?id= 详情 200');
    hit = detail.json.record && detail.json.record.client_request_id === clientRequestId ? detail.json.record : null;
  }
  assert(!!hit, `在本人记录中查到本次提交（client_request_id=${clientRequestId}）`);

  // ---- 5) 清理 ----
  console.log(CY('\n[5/5] 清理（删除测试行，零污染）'));
  if (canCleanup) {
    const { getFsToken, scanRecords, batchDelete } = await import('../storage/feishuAdapter.js');
    const appToken = fsEnv.FS_APP_TOKEN;
    const tableId = fsEnv.FS_PATROL_TEST_TABLE_ID;
    const all = await scanRecords(fsEnv, appToken, tableId, 50);
    const target = all.filter((r) => String(r.fields && r.fields['client_request_id']) === clientRequestId);
    assert(target.length >= 1, `飞书侧命中测试行 ${target.length} 条`);
    const ids = target.map((r) => r.id);
    await batchDelete(fsEnv, appToken, tableId, ids);
    console.log(GRN(`  ✓ 已删除 ${ids.length} 条：${JSON.stringify(ids)}`));
  } else {
    console.log(RED('  ! 未提供 FS_* 凭据，跳过自动清理。请手动在飞书 UI 删除测试行：'));
    console.log(`    base=${fsEnv.FS_APP_TOKEN} 表=${fsEnv.FS_PATROL_TEST_TABLE_ID} client_request_id=${clientRequestId}`);
  }

  console.log(GRN('\n✅ 飞书公网 E2E 全绿（登录→meta→submit→records→清理）'));
}

main().catch((e) => {
  console.error(RED('\n❌ E2E 失败: ' + e.message));
  process.exit(1);
});

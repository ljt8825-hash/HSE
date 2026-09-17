/* CF-WPS-B：飞书 adapter 本地冒烟（真实飞书 API，无需 Cloudflare 部署）
 * 验证 feishuAdapter 在真实飞书上的 scan / create / read / batch_delete 全链正确。
 * 创建即删，零污染。
 *
 * 运行（在 worker 目录）：
 *   FS_APP_ID=cli_xxx FS_APP_SECRET=xxx \
 *   FS_APP_TOKEN=WX9TbTqJKa7sywsgrU4cVoKdnXb \
 *   FS_PATROL_TEST_TABLE_ID=tblYa9aQD1lhDV8s \
 *   node test/cfwpsB-feishu-adapter-smoke.mjs
 *
 * 安全：仅回显 status/ms/code/recordId 数量，绝不回显 token / secret / 完整记录内容。
 */
import { createHash } from 'node:crypto';
import feishuAdapter, { getFsToken } from '../storage/feishuAdapter.js';

const FS_BASE = 'https://open.feishu.cn/open-apis';
// 巡查表规范列（单行文本 type=1），冒烟测试会按需自动补齐缺失列
const PATROL_COLUMNS = [
  '巡查人员Id', '姓名', '巡查时间', '网格', '问题描述', '问题类型', '是否三违',
  '三违行为', '涉及人员', '来源', '测试状态', '测试编号', '照片状态',
  'client_request_id', '创建时间',
];

// 自动补齐缺失文本列（DDL），使冒烟自包含，不依赖表已按规范预建
async function ensureColumns(env, appToken, tableId) {
  const token = await getFsToken(env);
  const res = await fetch(`${FS_BASE}/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/fields?page_size=200`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  const existing = new Set(((json.data && json.data.items) || []).map((f) => f.field_name));
  const missing = PATROL_COLUMNS.filter((c) => !existing.has(c));
  for (const name of missing) {
    const r = await fetch(`${FS_BASE}/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/fields`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ field_name: name, type: 1 }),
    });
    const j = await r.json();
    if (!r.ok || j.code !== 0) {
      throw Object.assign(new Error(`create field ${name} failed`), { fsCode: j && j.code, fsMsg: j && j.msg });
    }
  }
  return missing;
}


const env = {
  FS_APP_ID: process.env.FS_APP_ID,
  FS_APP_SECRET: process.env.FS_APP_SECRET,
};
const appToken = process.env.FS_APP_TOKEN;
const tableId = process.env.FS_PATROL_TEST_TABLE_ID;

let failures = 0;
function check(name, cond, extra = '') {
  if (cond) console.log(`PASS ${name} ${extra}`);
  else { console.log(`FAIL ${name} ${extra}`); failures++; }
}

if (!env.FS_APP_ID || !env.FS_APP_SECRET || !appToken || !tableId) {
  console.log('缺少环境变量 FS_APP_ID / FS_APP_SECRET / FS_APP_TOKEN / FS_PATROL_TEST_TABLE_ID');
  process.exit(2);
}

// 测试记录用随机 client_request_id，便于定位/幂等校验
const clientReqId = 'CFWPSB-' + createHash('sha256').update(String(Date.now()) + Math.random()).digest('hex').slice(0, 16);
const probe = {
  '巡查人员Id': 'PROBE_' + clientReqId.slice(0, 8),
  '姓名': 'adapter-probe',
  '巡查时间': new Date().toISOString().slice(0, 10),
  '网格': 'probe-grid',
  '问题描述': 'CF-WPS-B 适配器冒烟',
  '问题类型': '其他',
  '是否三违': '否',
  '三违行为': '',
  '涉及人员': '',
  '来源': 'h5-mobile',
  '测试状态': 'probe',
  '测试编号': clientReqId,
  '照片状态': '未拍摄',
  'client_request_id': clientReqId,
  '创建时间': new Date().toISOString().slice(0, 10),
};

try {
  // 0) 自动补齐缺失巡查列（DDL，自包含）
  const tPre = Date.now();
  const missing = await ensureColumns(env, appToken, tableId);
  check('ensure_columns', true, `missing_created=${missing.length} ms=${Date.now() - tPre}`);

  // 1) scan（read 链路）
  const t0 = Date.now();
  const before = await feishuAdapter.scanRecords(env, appToken, tableId, 5);
  check('scan_records', Array.isArray(before), `count=${before.length} ms=${Date.now() - t0}`);

  // 2) create（写链路 —— 此前 WPS 在此挂死）
  const c0 = Date.now();
  const ids = await feishuAdapter.createRecords(env, appToken, tableId, [probe]);
  check('create_records', Array.isArray(ids) && ids.length === 1, `ids=${ids.length} ms=${Date.now() - c0}`);
  const rid = ids[0];

  // 3) read back（按 id 命中）
  const after = await feishuAdapter.scanRecords(env, appToken, tableId, 5);
  const hit = after.find((r) => r.id === rid);
  check('read_back_by_id', !!hit, hit ? `fields_keys=${Object.keys(hit.fields).length}` : 'NOT FOUND');
  check('read_back_client_request_id', hit && String(hit.fields.client_request_id) === clientReqId, '');

  // 4) batch_delete（清理）
  const d0 = Date.now();
  const okDel = await feishuAdapter.batchDelete(env, appToken, tableId, [rid]);
  check('batch_delete', okDel === true, `ms=${Date.now() - d0}`);

  // 5) 确认已删
  const final = await feishuAdapter.scanRecords(env, appToken, tableId, 5);
  const still = final.find((r) => r.id === rid);
  check('cleanup_verified', !still, still ? 'STILL EXISTS (污染!)' : '已清除');
} catch (e) {
  console.log('EXCEPTION', e && e.message, 'isRateLimit=', !!(e && e.isRateLimit), 'fsCode=', e && e.fsCode);
  failures++;
}

console.log(failures === 0 ? '\nFEISHU_ADAPTER_SMOKE: ALL PASS' : `\nFEISHU_ADAPTER_SMOKE: ${failures} FAIL`);
process.exit(failures === 0 ? 0 : 1);

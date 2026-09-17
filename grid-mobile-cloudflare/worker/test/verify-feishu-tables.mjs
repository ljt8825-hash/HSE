/* verify-feishu-tables.mjs —— 校验 4 张飞书表的列名是否与 Worker 真实字段键一致
 * 用法（worker 目录）：
 *   FS_APP_ID=... FS_APP_SECRET=... FS_APP_TOKEN=WX9... \
 *   FS_IDENTITY_TABLE_ID=tbl... FS_ROSTER_TABLE_ID=tbl... \
 *   FS_PATROL_TEST_TABLE_ID=tblYa9a... FS_PATROL_PRODUCTION_TABLE_ID=tbl... \
 *   node test/verify-feishu-tables.mjs
 */
import { getFsToken } from '../storage/feishuAdapter.js';

const FS_BASE = 'https://open.feishu.cn/open-apis';
const EXPECT = {
  identity: ['姓名', '手机号码', 'password_hash', '部门', '职位', '网格长等级', '身份状态', 'employee_code'],
  roster: ['员工编码', '姓名', '用工关系状态', '负责区域（在职）'],
  test: ['测试编号', 'employee_code', '姓名', '巡查时间', '网格', '问题描述', '问题类型', '是否三违', '三违行为描述', '涉及人员', '照片状态', '来源', '测试状态', 'client_request_id', '创建时间'],
  prod: ['巡查人员ID', '姓名', '巡查时间', '网格', '问题描述', '问题类型', '是否三违', '三违行为', '涉及人员', '来源', 'client_request_id', '创建时间'],
};

const env = { FS_APP_ID: process.env.FS_APP_ID, FS_APP_SECRET: process.env.FS_APP_SECRET };
const appToken = process.env.FS_APP_TOKEN;
const ids = {
  identity: process.env.FS_IDENTITY_TABLE_ID,
  roster: process.env.FS_ROSTER_TABLE_ID,
  test: process.env.FS_PATROL_TEST_TABLE_ID,
  prod: process.env.FS_PATROL_PRODUCTION_TABLE_ID,
};

let fails = 0;
const token = await getFsToken(env);
for (const key of Object.keys(EXPECT)) {
  const tid = ids[key];
  const res = await fetch(`${FS_BASE}/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tid)}/fields?page_size=200`, { headers: { Authorization: `Bearer ${token}` } });
  const j = await res.json();
  const fields = (j.data && j.data.items) || [];
  const have = new Set(fields.map((f) => f.field_name));
  const want = EXPECT[key];
  const missing = want.filter((c) => !have.has(c));
  const extra = [...have].filter((c) => !want.includes(c));
  const ok = missing.length === 0;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${key} (${tid}) 列数=${fields.length} 期望=${want.length} 缺失=[${missing.join(',') || '无'}] 多余=[${extra.join(',') || '无'}]`);
  if (extra.length) console.log(`     多余列(无害，handler 不写): ${extra.join(', ')}`);
}
console.log(fails === 0 ? '\nVERIFY: ALL TABLES MATCH HANDLER' : `\nVERIFY: ${fails} TABLE(S) MISMATCH`);
process.exit(fails === 0 ? 0 : 1);

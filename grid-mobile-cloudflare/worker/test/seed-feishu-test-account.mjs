/* seed-feishu-test-account.mjs —— 在飞书身份表/花名册表各插 1 行测试登录账号
 * 仅用于打通 E2E；正式数据请自行在飞书 UI 维护/替换。可删除这两行重跑。
 *
 * 运行（worker 目录）：
 *   FS_APP_ID=cli_xxx FS_APP_SECRET=xxx FS_APP_TOKEN=WX9... \
 *   FS_IDENTITY_TABLE_ID=tbl... FS_ROSTER_TABLE_ID=tbl... \
 *   node test/seed-feishu-test-account.mjs
 *
 * 测试账号：手机号 13800000001 / 密码 Test@2026 / employee_code TEST001
 */
import feishuAdapter from '../storage/feishuAdapter.js';

const env = { FS_APP_ID: process.env.FS_APP_ID, FS_APP_SECRET: process.env.FS_APP_SECRET };
const appToken = process.env.FS_APP_TOKEN;
const identityId = process.env.FS_IDENTITY_TABLE_ID;
const rosterId = process.env.FS_ROSTER_TABLE_ID;

// 测试密码 Test@2026 的 bcrypt cost10 哈希（由 worker 同源 bcryptjs 生成，VERIFY=true）
const TEST_HASH = '$2a$10$YNl.VEtvErsCcEX23.8tzuKvV02Tj2ZyxRSMQ/IzWx9II8CGKqxra';

const identityRow = {
  '姓名': '测试网格员',
  '手机号码': '13800000001',
  'password_hash': TEST_HASH,
  '部门': '测试部门',
  '职位': '网格长',
  '网格长等级': '',
  '身份状态': '正常',
  'employee_code': 'TEST001',
};
const rosterRow = {
  '员工编码': 'TEST001',
  '姓名': '测试网格员',
  '用工关系状态': '正式员工',
  '负责区域（在职）': '八里堂村+惠宁',
};

try {
  const idIds = await feishuAdapter.createRecords(env, appToken, identityId, [identityRow]);
  console.log(`身份表插入 OK record_id=${idIds[0]}`);
  const rIds = await feishuAdapter.createRecords(env, appToken, rosterId, [rosterRow]);
  console.log(`花名册表插入 OK record_id=${rIds[0]}`);
  console.log('\nSEED_OK：测试账号 手机号=13800000001 密码=Test@2026 employee_code=TEST001');
  console.log('可直接走公网 E2E：登录 -> meta -> submit -> records -> 清理');
  process.exit(0);
} catch (e) {
  console.log('SEED_FAIL', e && e.message, 'fsCode=', e && e.fsCode, 'isRateLimit=', !!(e && e.isRateLimit));
  process.exit(1);
}

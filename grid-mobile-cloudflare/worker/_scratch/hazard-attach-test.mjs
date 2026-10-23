// 一次性脚本（不提交）：附件 parent_node 取值对比实验。
// 测 3 组：同一 ft 写主台账 / parent_node=table_id 传后写新表 / parent_node=app_token 传后写新表。
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"(.*)"$/, '$1')]; })
);
const BASE = 'https://open.feishu.cn/open-apis';
const APP = env.FS_APP_TOKEN;
const HAZARD = 'tblnyMjxtxjpP08q';
const MAIN = 'tbl5QiCv5Qbal044';
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwcJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AfwD/2Q==', 'base64');
(async () => {
  const tok = (await (await fetch(`${BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: env.FS_APP_ID, app_secret: env.FS_APP_SECRET }),
  })).json()).tenant_access_token;
  const H = { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' };

  const upload = async (parentNode) => {
    const fd = new FormData();
    fd.append('file_name', 't.jpg');
    fd.append('parent_type', 'bitable_image');
    fd.append('parent_node', parentNode);
    fd.append('size', String(JPEG.length));
    fd.append('file', new Blob([JPEG], { type: 'image/jpeg' }), 't.jpg');
    const r = await (await fetch(`${BASE}/drive/v1/medias/upload_all`, { method: 'POST', headers: { Authorization: 'Bearer ' + tok }, body: fd })).json();
    return r.code === 0 ? r.data.file_token : (r.code + ' ' + r.msg);
  };
  const write = async (tid, fields, tag) => {
    const r = await (await fetch(`${BASE}/bitable/v1/apps/${APP}/tables/${tid}/records`, { method: 'POST', headers: H, body: JSON.stringify({ fields }) })).json();
    console.log(tag, '→', r.code, r.msg || '', r.data?.record?.record_id || '');
    return r.code === 0 ? r.data.record.record_id : null;
  };

  // 组1：parent_node=app_token 上传 → 写主台账「违章照片」
  const ft1 = await upload(APP);
  console.log('upload parent_node=app_token →', ft1);
  if (typeof ft1 === 'string' && ft1.length > 20) {
    const rid = await write(MAIN, { '检查人姓名': '联调-parentnode', '违章照片': [{ file_token: ft1 }] }, '组1 主台账写入');
    if (rid) await fetch(`${BASE}/bitable/v1/apps/${APP}/tables/${MAIN}/records/${rid}`, { method: 'DELETE', headers: H });
  }

  // 组2：parent_node=hazard table_id 上传 → 写 hazard 表
  const ft2 = await upload(HAZARD);
  console.log('upload parent_node=hazard表id →', ft2);
  if (typeof ft2 === 'string' && ft2.length > 20) {
    await write(HAZARD, { '隐患编号': 'T-parentnode2', '排查人ID': '13800000003', '排查人姓名': '联调', '排查时间': '2026-10-16 11:00', '隐患类别': '设备设施', '隐患级别': '一般隐患', '隐患描述': '附件测试2', '处理状态': '待整改', '现场照片': [{ file_token: ft2 }] }, '组2 hazard表写入');
  }

  // 组3：parent_node=主台账 table_id 上传 → 写 hazard 表（跨表复用）
  const ft3 = await upload(MAIN);
  console.log('upload parent_node=主台账id →', ft3);
  if (typeof ft3 === 'string' && ft3.length > 20) {
    await write(HAZARD, { '隐患编号': 'T-parentnode3', '排查人ID': '13800000003', '排查人姓名': '联调', '排查时间': '2026-10-16 11:00', '隐患类别': '设备设施', '隐患级别': '一般隐患', '隐患描述': '附件测试3', '处理状态': '待整改', '现场照片': [{ file_token: ft3 }] }, '组3 hazard表写入(跨表token)');
  }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });

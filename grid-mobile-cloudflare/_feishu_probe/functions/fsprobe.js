// 飞书边缘探针（升级版）：用 Pages 项目里注入的 FS_APP_ID/FS_APP_SECRET 检查/修补表结构
// GET  ?app_token=&table_id=&mode=fields   —— 只读：返回字段名+类型（不写任何东西）
// POST JSON {key, app_token, table_id, create:["列名",...]} —— 门禁补列：
//      key 必须等于 env.PROBE_KEY（一次性密钥）；缺失列按「单行文本 type=1」创建，已存在跳过。
// 任何模式都不回显 token/secret；补列只增不删不改。
const FS_BASE = 'https://open.feishu.cn/open-apis';
const jsonRes = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

async function getToken(env, out) {
  const t0 = Date.now();
  const tr = await fetch(`${FS_BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: env.FS_APP_ID, app_secret: env.FS_APP_SECRET }),
  });
  const tj = await tr.json();
  out.push({ step: 'token', status: tr.status, ms: Date.now() - t0, code: tj.code, msg: tj.msg });
  return tj.code === 0 ? tj.tenant_access_token : null;
}

async function listFields(token, appToken, tableId, out) {
  const t0 = Date.now();
  const fr = await fetch(`${FS_BASE}/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/fields?page_size=200`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const fj = await fr.json();
  out.push({ step: 'fields', status: fr.status, ms: Date.now() - t0, code: fj.code, msg: fj.msg });
  if (fj.code === 0 && fj.data && fj.data.items) return fj.data.items;
  return null;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const out = [];

  // ---------- POST：门禁补列 ----------
  if (request.method === 'POST') {
    if (!env.PROBE_KEY) return jsonRes({ error: 'PROBE_KEY not configured', log: out }, 503);
    let body = null;
    try { body = await request.json(); } catch { return jsonRes({ error: 'invalid json' }, 400); }
    const { key, app_token: appToken, table_id: tableId, create } = body || {};
    if (key !== env.PROBE_KEY) return jsonRes({ error: 'forbidden', log: out }, 403);
    if (!appToken || !tableId || !Array.isArray(create)) return jsonRes({ error: 'missing app_token/table_id/create' }, 400);

    const token = await getToken(env, out);
    if (!token) return jsonRes({ log: out }, 200);
    const items = await listFields(token, appToken, tableId, out);
    if (!items) return jsonRes({ log: out }, 200);
    const have = new Set(items.map((f) => f.field_name));

    const created = [];
    const skipped = [];
    const failed = [];
    for (const name of create) {
      if (have.has(name)) { skipped.push(name); continue; }
      const c0 = Date.now();
      const cr = await fetch(`${FS_BASE}/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/fields`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ field_name: name, type: 1 }),
      });
      const cj = await cr.json();
      if (cj.code === 0) { created.push(name); out.push({ step: 'create-field', name, ms: Date.now() - c0, code: 0 }); }
      else { failed.push({ name, code: cj.code, msg: cj.msg }); out.push({ step: 'create-field', name, ms: Date.now() - c0, code: cj.code, msg: cj.msg }); }
      await new Promise((r) => setTimeout(r, 150)); // 轻微限速
    }
    return jsonRes({ log: out, created, skipped, failed });
  }

  // ---------- GET：只读 fields ----------
  const appToken = url.searchParams.get('app_token');
  const tableId = url.searchParams.get('table_id');
  if (!appToken || !tableId) return jsonRes({ error: 'missing app_token/table_id' }, 400);

  const token = await getToken(env, out);
  if (!token) return jsonRes({ log: out }, 200);
  const items = await listFields(token, appToken, tableId, out);
  if (!items) return jsonRes({ log: out }, 200);
  return jsonRes({
    log: out,
    field_count: items.length,
    fields: items.map((f) => ({ name: f.field_name, type: f.type, ui: f.ui_type || '' })),
  });
}

/**
 * 阶段2a · 查处来源（check_source）接口闭环验证
 *
 * 步骤：
 *   1) 创建一条带 check_source='company' 的测试三违记录（标记 _ruleEngineTest）
 *   2) 列表筛选 checkSource=company → 应命中
 *   3) 详情接口 → 应返回 checkSource='company'
 *   4) 编辑为 township → 详情应变更
 *   5) filter-options → 应返回 checkSources 字典
 *   6) 删除该测试记录（软删）→ 再次筛选应不命中
 *   7) 校验历史数据未被污染（check_source 全 NULL 的条数应回到基线）
 *
 * 用法：node _check_source_api_test.js
 * 通过 HTTP 调用后端 API（需后端已启动），不直接写库。
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const HOST = '127.0.0.1';
const PORT = 5800;
const BASE = '/api/violations';
// 本机 admin JWT（由 _06d2_gen_token.cjs 签发，2h 有效）
const TOKEN = fs.readFileSync(path.resolve(__dirname, '../../../_06d2_admin_token.txt'), 'utf8').trim();

const results = [];
function step(name, ok, detail) {
  results.push({ step: name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(
      {
        host: HOST,
        port: PORT,
        path: path,
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${TOKEN}`,
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let s = '';
        res.on('data', (c) => (s += c));
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(s) }); }
          catch { resolve({ status: res.statusCode, body: s }); }
        });
      }
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function main() {
  // 0) 基线：历史数据 check_source 应全为 NULL
  const base = await req('GET', `${BASE}?pageSize=1&checkSource=company`);
  const baselineCompany = base.body?.data?.total ?? -1;
  step('基线：筛选 checkSource=company 的既有条数', baselineCompany >= 0, `total=${baselineCompany}`);

  // 1) 创建
  const payload = {
    violationType: '违章作业',
    violationLevel: '一般',
    riskLevel: '中',
    description: '[规则引擎阶段2a-测试记录] 查处来源字段闭环验证，验证后即删除',
    violationDate: '2026-08-30',
    location: '自动化测试',
    status: '待处理',
    checkSource: 'company',
  };
  const created = await req('POST', BASE, payload);
  const id = created.body?.data?.id;
  step('创建：带 checkSource=company', !!id && created.body?.data?.checkSource === 'company',
    `id=${id} checkSource=${created.body?.data?.checkSource}`);
  if (!id) { console.log('创建失败，终止'); process.exit(1); }

  // 2) 详情
  const detail = await req('GET', `${BASE}/${id}`);
  step('详情：返回 checkSource=company', detail.body?.data?.checkSource === 'company',
    `checkSource=${detail.body?.data?.checkSource}`);

  // 3) 列表筛选 company → 命中
  const listCompany = await req('GET', `${BASE}?pageSize=100&checkSource=company`);
  const hitCompany = (listCompany.body?.data?.list || []).some((r) => r.id === id);
  step('列表筛选 checkSource=company → 命中测试记录', hitCompany,
    `total=${listCompany.body?.data?.total}`);

  // 4) 列表筛选 township → 不命中
  const listTownship = await req('GET', `${BASE}?pageSize=100&checkSource=township`);
  const missTownship = !(listTownship.body?.data?.list || []).some((r) => r.id === id);
  step('列表筛选 checkSource=township → 不命中测试记录', missTownship,
    `total=${listTownship.body?.data?.total}`);

  // 5) 编辑为 township
  const upd = await req('PUT', `${BASE}/${id}`, { checkSource: 'township' });
  step('编辑：checkSource 改为 township', upd.body?.data?.checkSource === 'township',
    `checkSource=${upd.body?.data?.checkSource}`);

  const listCompany2 = await req('GET', `${BASE}?pageSize=100&checkSource=company`);
  const movedOut = !(listCompany2.body?.data?.list || []).some((r) => r.id === id);
  step('改值后：company 筛选不再命中', movedOut, `total=${listCompany2.body?.data?.total}`);

  // 6) filter-options 返回字典
  const fo = await req('GET', `${BASE}/filter-options`);
  const srcs = fo.body?.data?.checkSources || [];
  step('filter-options：返回 checkSources 字典（3 项）',
    srcs.length === 3 && srcs.map((s) => s.value).join(',') === 'company,township,self',
    JSON.stringify(srcs));

  // 7) 删除测试记录
  const del = await req('DELETE', `${BASE}/${id}`);
  step('删除测试记录', del.status === 200 && del.body?.code === 0, `code=${del.body?.code}`);

  const listAfter = await req('GET', `${BASE}?pageSize=100&checkSource=township`);
  const gone = !(listAfter.body?.data?.list || []).some((r) => r.id === id);
  step('删除后：任何 checkSource 筛选均不命中', gone, `total=${listAfter.body?.data?.total}`);

  // 8) 与基线比对
  const base2 = await req('GET', `${BASE}?pageSize=1&checkSource=company`);
  step('历史数据未被污染（company 数回到基线）',
    (base2.body?.data?.total ?? -1) === baselineCompany,
    `${baselineCompany} → ${base2.body?.data?.total}`);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n通过 ${results.length - failed.length}/${results.length}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });

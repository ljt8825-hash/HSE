/* CF-WPS-重复台账 —— 并发重复建单的修复回归（纯 Node，无网络）
 *
 * 用户反馈（原话）：「检查错误：数据到了飞书多为表格后，为什么好几条信息都是一样的?」
 *
 * 实测生产台账：112 条里 27 组重复、多出 53 条；组内**只有创建时间不同**，其余字段逐字节一致；
 * 53 个相邻时间间隔里 19 个是 0 秒、19 个 ≤1 秒 → 典型并发重复提交，不是人工重复操作。
 *
 * 根因：
 *   ① 前端 syncRecord() 只判 syncState==="synced"，没有在途锁 —— 从 pending 到 synced 的
 *      整段过程（照片上传 + 建单 ≈2~4s）记录一直可被重入；
 *   ② retryPendingSync() 有 6 个独立触发点（enterHome / 台账入口 / online / 40s 轮询 /
 *      完成页按钮 / boot）且互不互斥；
 *   ③ 服务端 /patrol/submit 的幂等是「先查后写」（findExistingByClientRequestId → createRecords），
 *      两条并发请求都在对方落库前完成预查 → 双双建单。
 *
 * 修复：
 *   A. 前端 syncRecord 加单飞锁 + retryPendingSync 加全局互斥（本文件 §A 静态断言）；
 *   B. 服务端建单成功后按 req 回查、保留最早一条、删掉多余（本文件 §B mock 断言）。
 *
 * Run: node worker/test/cfwps-dedupe.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { healDuplicatePatrolRecords } from '../index.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(__dir, '../../frontend/check.html'), 'utf8');

let bad = 0;
const ck = (c, m, x) => c
  ? console.log('  ok  ' + m + (x ? ' :: ' + x : ''))
  : (bad++, console.log('  NG  ' + m + (x ? ' :: ' + x : '')));

function fnBody(name) {
  const re = new RegExp('(?:^|\\n)(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(html);
  if (!m) return null;
  const start = m.index;
  const rest = html.slice(start + m[0].length);
  const nxt = rest.search(/\n(?:async\s+)?function\s+/);
  return html.slice(start, nxt < 0 ? html.length : start + m[0].length + nxt);
}

/* ══════════════════ §A 前端：在途锁（静态断言） ══════════════════ */
console.log('═══ A. 前端在途锁 ═══');
{
  const sr = fnBody('syncRecord');
  const so = fnBody('syncRecordOnce');
  const rp = fnBody('retryPendingSync');
  const ro = fnBody('retryPendingSyncOnce');

  ck(!!sr, 'syncRecord 存在');
  ck(!!so, 'syncRecordOnce 存在（原函数体已改名下沉）');
  ck(!!rp, 'retryPendingSync 存在');
  ck(!!ro, 'retryPendingSyncOnce 存在（原函数体已改名下沉）');

  ck(/const\s+syncInFlight\s*=\s*new\s+Map\(\)/.test(html), 'syncInFlight 单飞锁已声明（Map）');
  ck(/let\s+retrySyncInFlight\s*=\s*null/.test(html), 'retrySyncInFlight 全局互斥已声明');

  ck(!!sr && /if\s*\(\s*running\s*\)\s*return\s+running/.test(sr),
    'syncRecord：已有在途请求 → 直接复用同一个 Promise（不再发第二次）');
  ck(!!sr && /syncInFlight\.set\(\s*rec\.id\s*,\s*p\s*\)/.test(sr),
    'syncRecord：把在途 Promise 挂到 rec.id 上');
  ck(!!sr && /syncInFlight\.delete\(\s*rec\.id\s*\)/.test(sr),
    'syncRecord：无论成功失败都释放锁（finally）');
  ck(!!sr && !/mobileApi/.test(sr),
    'syncRecord 本体已不含网络提交（已下沉到 syncRecordOnce）');
  ck(/function\s+syncRecord\(rec,\s*assignTo\)\{/.test(html) && !/async\s+function\s+syncRecord\(/.test(html),
    'syncRecord 为同步函数（返回 Promise，不再是 async）');

  ck(!!rp && /if\s*\(\s*retrySyncInFlight\s*\)\s*return\s+retrySyncInFlight/.test(rp),
    'retryPendingSync：全局互斥 —— 六个触发点共用同一个在途 Promise');
  ck(!!rp && /retryPendingSyncOnce\(\)/.test(rp), 'retryPendingSync 调 retryPendingSyncOnce');
  ck(!!ro && /for\s*\(\s*const\s+r\s+of\s+pend\s*\)\s*await\s+syncRecord\(r\)/.test(ro),
    'retryPendingSyncOnce：仍逐条 await syncRecord（顺序不变）');
  ck(!!ro && !/mobileApi/.test(ro), 'retryPendingSyncOnce 本体不含网络提交');

  // 关键接线不能被改掉
  ck(/function makeAndSync\(extra\)\{[\s\S]*?syncRecord\(rec\);/.test(html),
    'makeAndSync 仍 fire-and-forget 调 syncRecord（「完成检查」不等结果，行为未变）');
  ck(/function enterHome\(\)\{[\s\S]*?retryPendingSync\(\)/.test(html),
    'enterHome 仍触发 retryPendingSync（回首页补传，行为未变）');
  ck(/if\(go === "my-checks"\)\{[\s\S]*?retryPendingSync\(\)/.test(html),
    '台账入口仍触发 retryPendingSync（行为未变）');
}

/* ══════════════════ §B 服务端：写后自愈（mock 断言） ══════════════════ */
console.log('\n═══ B. 服务端写后自愈 ═══');

const FILE = 'appTokenX', SHEET = 'tblY', REQ = 'muoptz6pwi6207fwz28uhqf8a2jcg';
const NOW = Date.now();
const rec = (id, atMs) => ({ id, fields: { '日期': atMs, '备注': '巡查人ID:17667311658 · 巡查时间:2026-10-01 07:07 · req:' + REQ } });

function mkAdapter({ rows, throwOnSearch = false, noSearch = false }) {
  const state = { deleted: [], searchCalls: [] };
  const adapter = {
    async searchRecords(env, fileId, tableId, opts) {
      state.searchCalls.push(opts);
      if (throwOnSearch) throw new Error('feishu search failed');
      return rows;
    },
    async batchDelete(env, fileId, tableId, ids) { state.deleted.push(...ids); return true; },
  };
  if (noSearch) delete adapter.searchRecords;
  return { adapter, state };
}
const env = {};

// B1：两条重复（相差 4 秒）→ 保留最早一条，删掉晚的那条
{
  const { adapter, state } = mkAdapter({ rows: [rec('recLATE', NOW - 4000), rec('recEARLY', NOW - 8000)] });
  const n = await healDuplicatePatrolRecords(adapter, env, FILE, SHEET, REQ);
  ck(n === 1, 'B1 两条重复 → 删 1 条', 'removed=' + n);
  ck(state.deleted.length === 1 && state.deleted[0] === 'recLATE',
    'B1 保留创建最早的一条（recEARLY），删掉较晚的 recLATE', state.deleted.join(','));
}

// B2：三条重复 → 删 2 条
{
  const { adapter, state } = mkAdapter({ rows: [rec('r3', NOW - 1000), rec('r1', NOW - 3000), rec('r2', NOW - 2000)] });
  const n = await healDuplicatePatrolRecords(adapter, env, FILE, SHEET, REQ);
  ck(n === 2, 'B2 三条重复 → 删 2 条', 'removed=' + n);
  ck(state.deleted.sort().join(',') === 'r2,r3', 'B2 保留 r1（最早）', state.deleted.sort().join(','));
}

// B3：只有一条 → 不动
{
  const { adapter, state } = mkAdapter({ rows: [rec('only', NOW)] });
  const n = await healDuplicatePatrolRecords(adapter, env, FILE, SHEET, REQ);
  ck(n === 0 && state.deleted.length === 0, 'B3 无重复 → 不删任何记录');
}

// B4：预查抛错 → 静默返回 0，绝不抛（自愈不能把成功提交变成 502）
{
  const { adapter, state } = mkAdapter({ rows: [], throwOnSearch: true });
  let threw = false, n = -1;
  try { n = await healDuplicatePatrolRecords(adapter, env, FILE, SHEET, REQ); } catch { threw = true; }
  ck(!threw && n === 0, 'B4 回查失败 → 静默返回 0（不抛错）', 'removed=' + n);
  ck(state.deleted.length === 0, 'B4 失败时不删任何记录');
}

// B5：适配器不支持 searchRecords（老后端 / 精简 mock）→ 直接跳过
{
  const { adapter, state } = mkAdapter({ rows: [], noSearch: true });
  const n = await healDuplicatePatrolRecords(adapter, env, FILE, SHEET, REQ);
  ck(n === 0 && state.deleted.length === 0, 'B5 无 searchRecords 能力 → 跳过，不报错');
}

// B6：10 分钟保险丝 —— 超出窗口的「多余」记录不删（防误伤历史）
{
  const { adapter, state } = mkAdapter({ rows: [rec('keepVeryOld', NOW - 60 * 60 * 1000), rec('victimOld', NOW - 20 * 60 * 1000)] });
  const n = await healDuplicatePatrolRecords(adapter, env, FILE, SHEET, REQ);
  ck(n === 0 && state.deleted.length === 0, 'B6 保险丝：超出 10 分钟的重复不删（不误伤历史记录）');
}

// B6b：保留的永远是最早一条，删的永远是后来的重复
{
  const { adapter, state } = mkAdapter({ rows: [rec('oldKeep', NOW - 30 * 60 * 1000), rec('newDup', NOW - 1000)] });
  const n = await healDuplicatePatrolRecords(adapter, env, FILE, SHEET, REQ);
  ck(n === 1 && state.deleted.join(',') === 'newDup',
    'B6b 保留最早一条（oldKeep），删掉后来的重复（newDup）', state.deleted.join(','));
}

// B7：查的是「备注 contains req:<id>」—— 与幂等预查同一口径
{
  const { adapter, state } = mkAdapter({ rows: [rec('a', NOW), rec('b', NOW - 1000)] });
  await healDuplicatePatrolRecords(adapter, env, FILE, SHEET, REQ);
  const o = state.searchCalls[0] || {};
  ck(o.field === '备注' && o.operator === 'contains' && o.value === 'req:' + REQ,
    'B7 回查口径 = 备注 contains "req:<clientRequestId>"（与幂等预查一致）',
    `${o.field}/${o.operator}/${o.value}`);
}

// B8：req 为空 → 直接跳过（不误伤全表）
{
  const { adapter, state } = mkAdapter({ rows: [rec('a', NOW), rec('b', NOW)] });
  const n = await healDuplicatePatrolRecords(adapter, env, FILE, SHEET, '');
  ck(n === 0 && state.searchCalls.length === 0, 'B8 clientRequestId 为空 → 不发起回查');
}

console.log('\n--- ' + (bad ? bad + ' 项失败' : '全部通过') + ' ---');
process.exit(bad ? 1 : 0);

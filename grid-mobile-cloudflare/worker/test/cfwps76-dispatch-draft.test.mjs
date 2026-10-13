/* CF-WPS-派发草稿残留（.76）—— 前端流程静态断言（纯 Node，无网络）
 *
 * 用户报的现象（原话）：
 *   「公司管理账号在派发任务后，点击上一步还是返回首页，会回到三违的界面。」
 *
 * 根因链：
 *   ① selectViolation() 选完三违行为就 saveDraft() —— 草稿里 lastView="vio"；
 *   ② 公司管理走「转给作业中心」时，pick() 自己 makeRecord + syncRecord，
 *      **绕开了 makeAndSync()**，而 clearDraft() 只写在 makeAndSync 里 ⇒ 派发成功后草稿还在；
 *   ③ 于是首页 renderResumeCard() 一直挂着「继续上次未完成的检查 · 已选三违行为：XXX」，
 *      点了就 resumeTargetView("vio")；更狠的是 enterHome() 的自动续传分支
 *      （草稿未 parked 且 30 分钟内）在**任何一次页面重载**时直接把人拽回「选择三违」屏。
 *
 * 修法：pick() 内在 syncRecord 之前补 clearDraft()（与 makeAndSync 同口径，
 *       同步失败时记录仍留在本机 db.records 待补传，不依赖草稿）。
 *
 * 本文件是对单页 HTML（frontend/check.html）的**静态**校验，抓关键接线，
 * 防止后续重构把 clearDraft 又弄丢 / 挪到 syncRecord 之后。
 * 真机级验证见 test/_t76-dispatch-draft.mjs（CDP 走完整派发流程）。
 *
 * Run: node test/cfwps76-dispatch-draft.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = resolve(__dir, '../../frontend/check.html');
const html = readFileSync(HTML_PATH, 'utf8');

let bad = 0;
const ck = (c, m, x) => c
  ? console.log('  ok  ' + m + (x ? ' :: ' + x : ''))
  : (bad++, console.log('  NG  ' + m + (x ? ' :: ' + x : '')));

/* 抽取一个顶层具名函数 / 箭头常量的函数体（到下一个顶层 `\nfunction ` 之前）。
   单页脚本里这些都是顶层声明，朴素切片够用。 */
function fnBody(header) {
  const start = html.indexOf(header);
  if (start < 0) return null;
  const rest = html.slice(start + header.length);
  const nxt = rest.search(/\n(?:async\s+)?function\s+/);
  return html.slice(start, nxt < 0 ? html.length : start + header.length + nxt);
}

console.log('═══ 1. 版本自洽（≥ .76）═══');
{
  const build = (html.match(/<meta name="hse-build" content="([^"]+)">/) || [])[1];
  const cfg = (html.match(/config\.js\?v=([^"]+)"/) || [])[1];
  const app = (html.match(/app\.js\?v=([^"]+)"/) || [])[1];
  ck(!!build, 'hse-build meta 存在', build);
  ck(build === cfg && build === app, 'hse-build / config.js / app.js 三处版本一致', `${build} / ${cfg} / ${app}`);
  const minor = Number(String(build || '').split('.')[1] || 0);
  ck(minor >= 76, 'build 号 ≥ .76', String(minor));
}

console.log('═══ 2. 派发（pick）必须清草稿 ═══');
const PICK_HEADER = 'const pick = async (node, kind) => {';
const pick = fnBody(PICK_HEADER);
{
  ck(!!pick, '找到派发入口 pick()（转给作业中心 → 选接收人）');
  const hasClear = /clearDraft\(\)/.test(pick || '');
  ck(hasClear, 'pick() 内有 clearDraft()');
  const iClear = (pick || '').search(/clearDraft\(\)/);
  const iSync = (pick || '').search(/syncRecord\(rec/);
  ck(iClear >= 0 && iSync >= 0 && iClear < iSync,
    'clearDraft() 在 syncRecord() **之前**（先清草稿再同步，同步失败也有 db.records 兜底）',
    `clear@${iClear} < sync@${iSync}`);
  const iBusy = (pick || '').search(/showBusy\(/);
  ck(iBusy >= 0 && iClear > iBusy, 'clearDraft() 在 try 块内（showBusy 之后），不会因早退漏掉', `busy@${iBusy}`);
  // 派发路径**没有**走 makeAndSync —— 这正是当初漏清草稿的原因，
  // 所以这里必须钉死：只要 pick 自己建单没走 makeAndSync，就必须自带 clearDraft。
  // （只截取 pick 到 syncRecord 之间的那段来判断，避免把后面别的函数里的 makeAndSync 算进来）
  const seg = (pick || '').slice(0, iSync < 0 ? undefined : iSync);
  ck(!/makeAndSync\(/.test(seg) && hasClear,
    'pick() 自己建单、未走 makeAndSync() ⇒ 必须自带 clearDraft()');
}

console.log('═══ 3. 生成记录的另一条路 makeAndSync 仍然清草稿 ═══');
{
  const m = fnBody('function makeAndSync(extra)');
  ck(!!m, '找到 makeAndSync()');
  ck(/clearDraft\(\)/.test(m || ''), 'makeAndSync() 内有 clearDraft()');
  const iClear = (m || '').search(/clearDraft\(\)/);
  const iSync = (m || '').search(/syncRecord\(/);
  ck(iClear >= 0 && iSync >= 0 && iClear < iSync, 'makeAndSync()：clearDraft 在 syncRecord 之前');
}

console.log('═══ 4. 「为什么会回到三违」的三处接线仍在（这条是背景，改了要连带重审第 2 节）═══');
{
  const sv = fnBody('function selectViolation(name)');
  ck(!!sv, '找到 selectViolation()');
  ck(/saveDraft\(\)/.test(sv || ''), 'selectViolation() 仍会 saveDraft()（草稿 lastView 因此变成 vio）');
  ck(/session\.role === "公司管理"/.test(sv || ''), '公司管理：选完行为直接进「处理方式」');
  ck(/clearDraft\(\)/.test(sv || '') === false, 'selectViolation() 自身不清草稿（清的责任在建单处）');

  // resumeTargetView 不是硬编码 "vio"，而是靠 RESUME_VIEWS 白名单放行
  // （RESUME_VIEWS 含 vio，见第 5 节断言）
  const rt = fnBody('function resumeTargetView(lastView)');
  ck(/RESUME_VIEWS\.includes\(v\)/.test(rt || ''),
    'resumeTargetView() 仍按 RESUME_VIEWS 白名单放行 ⇒ lastView="vio" 会回到三违屏');

  const eh = fnBody('function enterHome()');
  ck(/autoResumeChecked/.test(eh || '') && /resumeCheck\(/.test(eh || ''),
    'enterHome() 仍有「首次进首页自动续传」分支 ⇒ 残留草稿会被直接拽回 vio');
  ck(/renderResumeCard\(\)/.test(eh || ''), 'enterHome() 仍渲染「继续上次检查」卡片');
}

console.log('═══ 5. 草稿工具本身没被改坏 ═══');
{
  ck(/function clearDraft\(\)\{ try\{ localStorage\.removeItem\(DRAFT_KEY\); \}catch\(e\)\{\} \}/
    .test(html), 'clearDraft() 实现未变（且吞掉配额异常，不抛）');
  ck(/const DRAFT_KEY = "hse_draft_v1"/.test(html), 'DRAFT_KEY 未变');
  ck(/RESUME_VIEWS = \["photo", "classify", "vio", "patrol"\]/.test(html),
    'RESUME_VIEWS 仍包含 vio（= 残留草稿能落到三违屏）');
}

console.log('══════════════════════════════');
console.log(bad ? `❌ ${bad} 项未通过` : '✅ 全部通过');
process.exit(bad ? 1 : 0);

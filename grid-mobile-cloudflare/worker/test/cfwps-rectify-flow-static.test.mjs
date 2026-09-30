/* CF-WPS-被指派人确认（第二版）—— 前端流程静态断言（纯 Node，无网络）
 *
 * 用户需求（原话）：
 *   「被指派人点击打开这个派发的隐患整改，可以看到照片，点击下一步，进入选择人员，
 *     然后再拍摄整改后照片，拍摄后**只显示拍摄后的照片**，最后是完成。」
 *   ⇒ 相比第一版：① 去掉「选三违行为」一步（下一步直接进选人）；
 *               ② 拍完整改照片后收起「派发原图 / 上下文卡」，只显示整改后照片。
 *
 * 这是对单页 HTML（frontend/check.html）的**静态**校验 —— 抓关键接线是否还在，
 * 防止后续改动把这套流程悄悄改回去（比如又插回三违宫格、或拍照后没收起派发卡）。
 *
 * Run: node test/cfwps-rectify-flow-static.test.mjs
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

/* 抽取一个具名函数的函数体（从 `function NAME(` 到下一个顶层 `\nfunction ` 之前）。
   单页脚本里函数都是顶层声明，这个朴素切片够用。 */
function fnBody(name) {
  const re = new RegExp('(?:^|\\n)(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(html);
  if (!m) return null;
  const start = m.index;
  const rest = html.slice(start + m[0].length);
  const nxt = rest.search(/\n(?:async\s+)?function\s+/);
  return html.slice(start, nxt < 0 ? html.length : start + m[0].length + nxt);
}

console.log('═══ 1. 版本自洽（.73）═══');
{
  const build = (html.match(/<meta name="hse-build" content="([^"]+)">/) || [])[1];
  const cfg = (html.match(/config\.js\?v=([^"]+)"/) || [])[1];
  const app = (html.match(/app\.js\?v=([^"]+)"/) || [])[1];
  ck(!!build, 'hse-build meta 存在', build);
  ck(build === cfg && build === app, 'hse-build / config.js / app.js 三处版本一致', `${build} / ${cfg} / ${app}`);
  ck(build === '2026-09-23.73', '版本 = .73', build);
}

console.log('\n═══ 2. openRectify：派发任务进「下一步」态 ═══');
{
  const b = fnBody('openRectify');
  ck(!!b, 'openRectify 存在');
  ck(/rectifyFlow\s*=\s*needConfirm\s*\?/.test(b || ''), 'rectifyFlow 由 needConfirm 决定');
  ck(/classifying:\s*false/.test(b || ''), 'rectifyFlow.classifying 初值 false（不再预置三违步骤）');
  ck(/\$\(["']#rf-next["']\)\.style\.display\s*=\s*needConfirm\s*\?\s*["']["']\s*:\s*["']none["']/.test(b || ''),
    'rf-next 仅在 needConfirm 时显示');
  ck(/\$\(["']#rf-pre["']\)\.style\.display\s*=\s*needConfirm\s*\?\s*["']none["']/.test(b || ''),
    'rf-pre（拍照按钮）在 needConfirm 时隐藏');
  ck(/ctxBox\.style\.display\s*=\s*["']["']/.test(b || ''), '每次进整改页复位派发卡显示（拍完照收起后可恢复）');
}

console.log('\n═══ 3. startRectifyConfirm：下一步 → 直接选人（不再选三违）═══');
{
  const b = fnBody('startRectifyConfirm');
  ck(!!b, 'startRectifyConfirm 存在');
  ck(/goPersonSelect\s*\(/.test(b || ''), '直接调用 goPersonSelect()');
  ck(!/renderVioGrid|showView\(\s*["']vio["']\s*\)/.test(b || ''), '**不再**进三违宫格（无 renderVioGrid / showView("vio")）');
}

console.log('\n═══ 4. finishRectifyConfirm：选完人回整改页拍照 ═══');
{
  const b = fnBody('finishRectifyConfirm');
  ck(!!b, 'finishRectifyConfirm 存在');
  ck(/_rectifyPersonName/.test(b || ''), '记录所选人员到 _rectifyPersonName');
  ck(/\$\(["']#rf-next["']\)\.style\.display\s*=\s*["']none["']/.test(b || ''), '隐藏「下一步」');
  ck(/\$\(["']#rf-pre["']\)\.style\.display\s*=\s*["']["']/.test(b || ''), '显示拍照按钮');
  ck(!/draft\.behavior\s*=/.test(b || ''), '不再写入 draft.behavior（三违行为沿用派发值）');
}

console.log('\n═══ 5. setAfterPhoto：拍完只显示整改后照片 ═══');
{
  const b = fnBody('setAfterPhoto');
  ck(!!b, 'setAfterPhoto 存在');
  ck(/after-photo-box/.test(b || ''), '渲染整改后照片到 #after-photo-box');
  ck(/rf-context/.test(b || '') && /style\.display\s*=\s*["']none["']/.test(b || ''),
    '收起 #rf-context（派发原图/上下文卡）——「只显示拍摄后的照片」');
  ck(/rf-post/.test(b || ''), '切到拍后两列轻量行');
}

console.log('\n═══ 6. submitRectify：回写违章人员、不再回写三违行为 ═══');
{
  const b = fnBody('submitRectify');
  ck(!!b, 'submitRectify 存在');
  ck(/violation_people\s*:/.test(b || ''), '提交 violation_people');
  ck(!/violation_desc\s*:/.test(b || ''), '**不**提交 violation_desc（行为沿用派发值）');
  ck(/assign\/complete/.test(b || ''), '仍走 /api/mobile/assign/complete');
}

console.log('\n═══ 7. 返回键 / 上下文清理（防串味）═══');
{
  const start = fnBody('startCheck');
  ck(/rectifyFlow\s*=\s*null/.test(start || ''), 'startCheck 开新检查即清 rectifyFlow');
  ck(/function rectifyBackOr/.test(html), '存在 rectifyBackOr()（整改流程选人页返回 → 整改页）');
  const back = fnBody('rectifyBackOr');
  ck(/rectifyFlow\s*&&\s*rectifyFlow\.classifying/.test(back || ''), 'rectifyBackOr 判定 classifying');
  ck(/showView\(\s*["']rectify["']\s*\)/.test(back || ''), 'rectifyBackOr 回整改页');
  ck(/#view-pick-admin \[data-back\]/.test(html), 'pick-admin 返回键已接管（经理两步选人）');
  ck(/#btn-photo-next["']\)\.onclick\s*=\s*\(\)\s*=>\s*\{\s*rectifyFlow\s*=\s*null/.test(html),
    'btn-photo-next 进分类前清 rectifyFlow');
}

console.log('\n═══ 8. 入口文案与三违库解耦 ═══');
{
  ck(/选择违章人员/.test(html), '「下一步」CTA 副文案为「选择违章人员」');
  // selectViolation 的 rectifyFlow 分支即便保留也不该是整改流程的必经路径
  ck(!/rectifyFlow\.classifying\s*\)\s*\{\s*rectifyFlow\.behavior\s*=\s*name/.test(fnBody('startRectifyConfirm') || ''),
    'startRectifyConfirm 内不再写 rectifyFlow.behavior');
}

console.log(`\n--- ${bad === 0 ? '全部通过' : bad + ' 项失败'} ---`);
process.exit(bad === 0 ? 0 : 1);

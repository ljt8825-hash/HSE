/* _t6c-deploy-drift.mjs —— 防漂移：校验 deploy.js 是否与 index.js 同步。
   背景：deploy.js 是**生成物**（index.js 砍掉 61 个具名导出），
   副作用是改了 index.js 却忘记重新生成 → 线上跑的是旧逻辑，且**没有任何报错**。
   本脚本把「忘了」变成「红灯」。

   跑法：node worker/test/_t6c-deploy-drift.mjs
   退出码：0 = 同步；1 = 漂移（需重跑 _scratch/mkdeploy.py） */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const W = path.join(HERE, '..');

let pass = 0, fail = 0;
const check = (n, c, extra) => {
  if (c) { pass++; console.log('  ok   ' + n + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('  FAIL ' + n + (extra ? ' :: ' + extra : '')); }
};

console.log('\n=== deploy.js 漂移检查 ===\n');

const src = fs.readFileSync(path.join(W, 'index.js'), 'utf8');
const dep = fs.readFileSync(path.join(W, 'deploy.js'), 'utf8');
const srcLines = src.split('\n');
const depLines = dep.split('\n').slice(0, -1); // 末尾空串去掉

/* 1) 行数：deploy.js 必须比 index.js 少（少了具名导出块） */
check('deploy.js 行数 < index.js（确实抽掉了导出块）',
  depLines.length < srcLines.length,
  'deploy=' + depLines.length + ' index=' + srcLines.length);

/* 2) 核心：deploy.js 的每一行必须等于 index.js 的对应行（前 N 行严格相等） */
const N = depLines.length;
let firstDiff = -1;
for (let i = 0; i < N; i++) {
  if (srcLines[i] !== depLines[i]) { firstDiff = i; break; }
}
check('deploy.js 与 index.js 前 ' + N + ' 行逐行一致',
  firstDiff === -1,
  firstDiff === -1 ? '' : '首个差异在第 ' + (firstDiff + 1) + ' 行\n        index: ' + JSON.stringify(srcLines[firstDiff]).slice(0, 120) + '\n        deploy: ' + JSON.stringify(depLines[firstDiff]).slice(0, 120));

/* 3) 字节级：无 CR（Windows write_text 会把 \n 变 \r\n，曾真实踩过） */
check('deploy.js 无 CR 字符（纯 LF）', !dep.includes('\r'),
  dep.includes('\r') ? 'offset=' + dep.indexOf('\r') : '');

/* 4) deploy.js 不得含具名导出块 */
const named = depLines.filter(l => /^\s*export\s*\{/.test(l));
check('deploy.js 无具名导出块', named.length === 0, named.slice(0, 2).join(' | '));

/* 5) deploy.js 必须保留 export default 与全部路由 */
check('deploy.js 含 export default', /^export default \{/m.test(dep));
const routes = (dep.match(/if \(p === '[^']*'\)/g) || []).length;
const srcRoutes = (src.match(/if \(p === '[^']*'\)/g) || []).length;
check('路由数一致（deploy=' + routes + ' index=' + srcRoutes + '）', routes === srcRoutes);

/* 6) wrangler.toml 的 main 指向 deploy.js */
const toml = fs.readFileSync(path.join(W, 'wrangler.toml'), 'utf8');
const m = /^main\s*=\s*"([^"]+)"/m.exec(toml);
check('wrangler.toml main = "deploy.js"', m && m[1] === 'deploy.js', 'main=' + (m && m[1]));

console.log('\n--- ' + pass + ' passed, ' + fail + ' failed ---');
if (fail) {
  console.log('\n⚠️ deploy.js 与 index.js 已漂移！请重新生成：');
  console.log('   python worker/_scratch/mkdeploy.py');
  console.log('   然后 wrangler deploy\n');
}
process.exit(fail ? 1 : 0);

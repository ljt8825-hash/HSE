#!/usr/bin/env node
/**
 * 版本库源码完整性自检 —— 找出「运行代码引用、但版本库里拿不到」的源文件。
 *
 * ## 为什么需要它
 *
 * 2026-09-17 一天内连撞两次同一类事故，都是**本机跑得好好的、换台机器就死**：
 *
 *   ① 文件不以 `_` 开头、**从未 git add**（规则修不了，纯漏 add）
 *      实例：`server/services/ai/signinCodeMap.js`
 *      —— `services/ai/visionService.js` 用 `require('./signinCodeMap')` 引它，
 *         而 visionService 已在 5876 生产后端加载 ⇒ 线上依赖一个版本库里不存在的文件。
 *         任何 clone / 回滚 / 换人接手都会在 require 阶段 MODULE_NOT_FOUND，
 *         且故障点不在改动处，极难定位。
 *
 *   ② 文件以下划线开头、**被 `.gitignore` 的全局 `_*.js` 规则误伤**
 *      实例：`grid-mobile-cloudflare/pages/functions/_workerProxy.js`
 *      —— 它不是调试脚本，而是被 `functions/api/[[route]].js`、`functions/wps/[[route]].js`
 *         用 `import { proxyToWorker } from '../_workerProxy.js'` 导入的运行时模块。
 *         缺它 ⇒ Pages Functions 导不出来 ⇒ `/api/*` 落静态兜底 ⇒ **登录 POST 405**
 *         （与 2026-09-17 那次真实生产中断同症状，只是成因不同）。
 *
 * 这两类缺陷靠肉眼读代码看不出来，必须用「被跟踪代码 → 文件是否存在 / 是否在库里」的交叉引用去查。
 *
 * ## 两项检查
 *
 *   A. **相对说明符解析**：扫描全部 JS 的 CJS `require('.')` 与 ESM `import ... from '.'`，
 *      凡解析不到落盘文件的即报。含三个必要处理，否则会被误报淹没：
 *        · 剥掉注释 —— 大量文件头部注释写着 `require('./routes/xxx')` 或自身相对路径，
 *          不剥注释会把它们全算成缺件（与「HTML 注释里的 meta refresh」同一类误报）；
 *        · 归档/备份副本分组单列 —— `server/backups` 与 `_archive` 目录是从别处拷来的历史副本，
 *          其相对路径本就相对原位置，不代表线上运行依赖；
 *        · 落在 `try/catch` 或含「可选」语义的单独归为「疑似可选」待人工确认。
 *
 *   B. **被跟踪代码 → 被 gitignore 文件 的交叉引用**：A 只验证「磁盘上存在」，
 *      **发现不了「本地存在但被 gitignore」**（B 类事故正是这样漏掉的）。本项专治该盲区。
 *
 * ## 用法
 *
 *   node tools/check-repo-source-integrity.mjs          # 检查，有问题 exit 1
 *   node tools/check-repo-source-integrity.mjs --quiet  # 只输出问题行
 *
 * 只读：纯静态分析 + fs 存在性判定，不执行任何业务代码、不连数据库、不发网络请求。
 * 建议在提交前跑一次（第二类缺陷一旦入库就是隐性炸弹）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
process.chdir(ROOT);
const QUIET = process.argv.includes('--quiet');

const SCAN_ROOTS = ['server', 'grid-mobile-cloudflare', 'tools', 'scripts'];
const SKIP_DIRS = new Set(['node_modules', '.git', '.wrangler', 'dist', '__pycache__']);
const NON_RUNTIME = [/^server[\\/]backups[\\/]/, /[\\/]_archive[\\/]/, /^server[\\/]scripts[\\/]_archive[\\/]/];
const JS_EXT = /\.(js|cjs|mjs)$/;

const norm = (p) => p.replace(/\\/g, '/');
const rel = (p) => norm(path.relative(ROOT, p));

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.' || e.name === '..') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p, out); }
    else if (e.isFile() && JS_EXT.test(e.name)) out.push(p);
  }
  return out;
}

/** 剥注释（保留换行数以报准行号）。字符串里的 `//` 会有极少数误判，
 *  但方向安全：只会漏报注释里的假路径，不会制造假缺件。 */
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:'"\\])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));

/** 解析候选路径 —— **只认文件**。`fs.existsSync` 对目录也返回 true，
 *  `require('../routes/insurance')` 会先命中 `server/routes/insurance`（目录）而被当成已解析，
 *  接着因「目录不在 git 索引里」误报成未入库（实测：不过滤时有 58/62 条是这类目录假阳性）。 */
const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const resolveCandidates = (base) => [base, `${base}.js`, `${base}.cjs`, `${base}.mjs`, `${base}.json`,
  path.join(base, 'index.js'), path.join(base, 'index.cjs')].filter(isFile);

const SPEC_PATTERNS = [
  { re: /require\(\s*['"](\.[^'"]+)['"]\s*\)/g, kind: 'require' },
  { re: /\bfrom\s*['"](\.[^'"]+)['"]/g, kind: 'import-from' },
  { re: /\bimport\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g, kind: 'import-dynamic' },
  { re: /^\s*import\s*['"](\.[^'"]+)['"]/gm, kind: 'import-bare' },
];

const git = (args) => execSync(`git ${args}`, { maxBuffer: 128 * 1024 * 1024, encoding: 'utf8' });

/* ------------------------------- 检查 A ------------------------------- */
const files = SCAN_ROOTS.filter((r) => fs.existsSync(r)).flatMap((r) => walk(r));
let nRequire = 0; let nImport = 0; let nDynamic = 0;
const hardMissing = []; const softMissing = []; const archivedMissing = [];

for (const f of files) {
  const src = stripComments(fs.readFileSync(f, 'utf8'));
  for (const { re, kind } of SPEC_PATTERNS) {
    re.lastIndex = 0; // 含 /g 的正则跨文件复用必须重置
    let m;
    while ((m = re.exec(src))) {
      if (kind === 'require') nRequire++; else nImport++;
      if (resolveCandidates(path.resolve(path.dirname(f), m[1])).some((c) => fs.existsSync(c))) continue;
      const line = src.slice(0, m.index).split('\n').length;
      const rec = { from: rel(f), line, spec: m[1], kind };
      if (NON_RUNTIME.some((r) => r.test(rec.from))) { archivedMissing.push(rec); continue; }
      const ctx = src.split('\n').slice(Math.max(0, line - 8), line + 6).join('\n');
      if (kind !== 'import-from' && /try\s*\{|catch\s*\(|可选|optional/i.test(ctx)) softMissing.push(rec);
      else hardMissing.push(rec);
    }
  }
  const dyn = src.match(/require\(\s*[^'"\s)]/g);
  if (dyn) nDynamic += dyn.length;
}

/* ------------------------------- 检查 B -------------------------------
 * 不变量：**被跟踪文件里的相对说明符，必须解析到「也在 git 索引里」的文件**。
 * 只判「是否被 gitignore」是不够的 —— 实测踩过：给 `_workerProxy.js` 加了 .gitignore 例外后
 * 它从「被忽略」变成「未跟踪」，检查 B 反而报 0，问题依旧（文件仍不在版本库）。
 * 正确做法 = 拿 git 索引做全集，报表里同时给出成因（gitignored / 仅未 add），便于对症下药。
 */
const trackedSet = new Set(git('ls-files').split('\n').filter(Boolean).map((p) => norm(path.resolve(p))));
const ignoredRawSet = new Set();
for (const line of git('status --ignored --porcelain -- ' + SCAN_ROOTS.join(' ')).split('\n')) {
  if (!line.startsWith('!!')) continue;
  const p = line.slice(3).trim();
  if (JS_EXT.test(p) && !p.includes('node_modules') && fs.existsSync(p) && fs.statSync(p).isFile()) {
    ignoredRawSet.add(norm(path.resolve(p)));
  }
}
const trackedJs = git('ls-files "*.js" "*.cjs" "*.mjs"').split('\n').filter(Boolean)
  .map((p) => norm(path.resolve(p)));

/** 已知且可接受的例外（**显式列出并写明理由，不静默放过**）：
 *  `scripts/<pkg>/bin/*.mjs` 的命令行包装器会动态 import 同包 `scripts/<pkg>/dist/` 的构建产物。
 *  源码仓里 dist 由该包的构建步骤生成、已在 .gitignore 中排除（构建产物本就不入库），
 *  fresh clone 需先 build 才能跑该 CLI —— 这是预期行为，不是缺件。
 *  放行范围严格限定为「bin 包装器 → 同包 dist」，不放行任何运行时代码。 */
const isBenignBuildOutput = (from, to) => {
  const m = /^安全看板vben[\\/]scripts[\\/]([^\\/]+)[\\/]bin[\\/][^\\/]+\.mjs$/.exec(from);
  return !!m && to.replace(/\\/g, '/').startsWith(`安全看板vben/scripts/${m[1]}/dist/`);
};

const unversioned = [];
for (const f of trackedJs) {
  if (!fs.existsSync(f)) continue;
  const fromRel = rel(f);
  const src = stripComments(fs.readFileSync(f, 'utf8'));
  for (const { re, kind } of SPEC_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) {
      const hit = resolveCandidates(path.resolve(path.dirname(f), m[1]))
        .find((c) => fs.existsSync(c) && !trackedSet.has(norm(c)));
      if (!hit) continue;
      const abs = norm(path.resolve(hit));
      if (isBenignBuildOutput(fromRel, rel(hit))) continue;
      unversioned.push({
        from: fromRel,
        line: src.slice(0, m.index).split('\n').length,
        to: rel(hit),
        kind,
        why: ignoredRawSet.has(abs) ? '被 gitignore 忽略' : '仅未 git add',
      });
    }
  }
}

/* ------------------------------- 输出 ------------------------------- */
const problems = hardMissing.length + unversioned.length;

if (!QUIET) {
  console.log(`扫描 ${files.length} 个 JS：CJS require ${nRequire} 处 + ESM 相对 import ${nImport} 处`
    + `；动态 require（无法静态判定）${nDynamic} 处`);
  console.log(`git 索引内文件 ${trackedSet.size} 个；被 gitignore 的 JS（非 node_modules）${ignoredRawSet.size} 个；`
    + `被跟踪的 JS ${trackedJs.length} 个`);
}

console.log(`\n=== A. 相对说明符硬缺件（运行路径上的真实缺件）: ${hardMissing.length} ===`);
hardMissing.forEach((x) => console.log(`  ✗ ${x.from}:${x.line}  [${x.kind}]  →  ${x.spec}`));

console.log(`\n=== B. 被跟踪代码引用、但不在 git 索引里的文件（须立即入库）: ${unversioned.length} ===`);
unversioned.forEach((x) => console.log(`  ✗ ${x.from}:${x.line}  [${x.kind}]  成因=${x.why}\n        → ${x.to}`));

if (!QUIET) {
  if (softMissing.length) {
    console.log(`\n=== 疑似可选（落在 try/catch 或含「可选」语义，需人工确认）: ${softMissing.length} ===`);
    softMissing.forEach((x) => console.log(`  ? ${x.from}:${x.line}  [${x.kind}]  →  ${x.spec}`));
  }
  console.log(`\n=== 归档/备份副本（非运行代码，仅登记）: ${archivedMissing.length} 处`
    + `${archivedMissing.length ? ' —— 分布在 server/backups、**/_archive' : ''} ===`);
}

console.log(problems === 0
  ? '\n✅ 未发现「引用得到、版本库拿不到」的源文件'
  : `\n⛔ 发现 ${problems} 处问题（A ${hardMissing.length} + B ${unversioned.length}）：`
    + 'A 类补文件、B 类改 .gitignore 规则后重新入库。');
process.exit(problems ? 1 : 0);

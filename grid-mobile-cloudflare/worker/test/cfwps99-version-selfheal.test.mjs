// CF-WPS-99：版本自愈（SPA 旧标签页自动重载）+ version.json 一致性 回归测试。
// 背景：2026-10-16 用户在部署前打开的标签页里继续操作，照片修复不生效（刷新后才好）——
// HTML 已 no-store，但**已打开的标签页**不会重新加载，SPA 会一直跑旧代码。
// 防线：运行时就的 hse-build 与 version.json 比对，不一致 → 整页重载；本会话为某版本
// 重载过就绝不重试（防 version.json 漂移导致死循环）。guard 第 5 节负责挡住漂移。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = readFileSync(path.join(root, 'frontend', 'check.html'), 'utf8');
const depHtml = readFileSync(path.join(root, '_pages_deploy', 'check.html'), 'utf8');
const guard = readFileSync(path.join(root, 'tools', 'predeploy-guard.mjs'), 'utf8');

let bad = 0;
const ck = (name, cond, extra) => {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (cond ? '' : '  => ' + (extra ?? '')));
  if (!cond) bad++;
};

const build = (html.match(/<meta name="hse-build" content="([^"]+)"/) || [])[1] || null;
const vjson = (() => {
  try { return JSON.parse(readFileSync(path.join(root, 'frontend', 'version.json'), 'utf8')); } catch { return null; }
})();
const dvjson = (() => {
  try { return JSON.parse(readFileSync(path.join(root, '_pages_deploy', 'version.json'), 'utf8')); } catch { return null; }
})();

console.log('=== A. 版本自愈脚本存在且防循环 ===');
ck('check.html 含版本自愈脚本（version.json 比对）', html.includes("fetch('./version.json"));
ck('自愈脚本读 hse-build meta 作运行时版本', /meta\[name="hse-build"\]/.test(html));
ck('有防死循环闸：hse_build_reloaded_for（同版本只重载一次）', html.includes('hse_build_reloaded_for'));
ck('比对不一致才重载（j.build !== running 才继续）', /j\.build === running\)\s*return/.test(html));
ck('visibilitychange 切回标签页时复核（离开再回来看一眼的场景）', html.includes("addEventListener('visibilitychange'"));
ck('取 version.json 用 no-store（防浏览器缓存旧版本号）', /version\.json\?t=' \+ Date\.now\(\)/.test(html) && html.includes("cache: 'no-store'"));
ck('version.json 404 / 解析失败一律静默跳过（不影响使用）', /r\.ok \? r\.json\(\) : null/.test(html) && /\.catch\(function\(\)\{\}\)/.test(html));
ck('脚本整体 try/catch 包裹，任何异常不影响页面', /\(function\(\)\{[\s\S]{0,80}try\{[\s\S]*hse-build_reloaded_for[\s\S]*\}\(\)\);/.test(html) || html.includes("var running = meta && meta.content;"));

console.log('=== B. version.json 与 hse-build 三处一致 ===');
ck('frontend/version.json 存在且可解析', !!vjson && !!vjson.build, vjson);
ck('frontend/version.json build === hse-build', vjson && vjson.build === build, 'vjson=' + (vjson && vjson.build) + ' build=' + build);
ck('_pages_deploy/version.json 同步', dvjson && dvjson.build === build, 'deploy=' + (dvjson && dvjson.build));
ck('_pages_deploy/check.html 同为 ' + build, (depHtml.match(/<meta name="hse-build" content="([^"]+)"/) || [])[1] === build);

console.log('=== C. guard 挡住 version.json 漂移 ===');
ck('predeploy-guard 含 version.json 一致性检查', guard.includes('version.json 与 hse-build 一致'));
ck('guard 比对 frontend/version.json build = hse-build', guard.includes('frontend/version.json build = hse-build'));
ck('guard 比对 _pages_deploy/version.json 同步', guard.includes('_pages_deploy/version.json 同步'));

console.log('\n' + (bad === 0 ? 'ALL PASS' : bad + ' FAILED'));
process.exit(bad === 0 ? 0 : 1);

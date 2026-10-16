// CF-WPS-98：隐患排查「照片不显示 / 提交后列表没有」回归测试（静态断言 + 源码切片）。
// 背景（2026-10-16 用户实测）：隐患详情/列表照片全是裂图 —— /api/mobile/photo 要登录态，
// 而 <img src="...?ft="> 带不上 Authorization 头 → 401。修法：fetch+blob（loadServerPhoto）
// 与懒加载队（thumbObserver/thumbQueue），和派发图、台账缩略图同一条链路。
// 另加固：列表由 filter search（索引有分钟级延迟）改全量 scan + 本地过滤。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = readFileSync(path.join(root, 'frontend', 'check.html'), 'utf8');
const worker = readFileSync(path.join(root, 'worker', 'index.js'), 'utf8');

let bad = 0;
const ck = (name, cond, extra) => {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (cond ? '' : '  => ' + (extra ?? '')));
  if (!cond) bad++;
};
const slice = (src, start, end) => {
  const i = src.indexOf(start);
  if (i < 0) return '';
  const j = src.indexOf(end, i);
  return src.slice(i, j < 0 ? undefined : j);
};

console.log('=== A. 前端：照片必须走带登录态的取图链路 ===');
// 1) hzPhotoUrl（<img src> 直链）必须彻底不存在
ck('frontend/check.html 不再有 hzPhotoUrl（img 直链取图）', !html.includes('hzPhotoUrl'), html.includes('hzPhotoUrl') ? '仍有残留' : '');
// 2) 隐患列表/详情源码里不允许再出现 img src= 拼 /api/mobile/photo
const hazardStart = html.indexOf('async function renderHazardList');
const hazardEnd = html.indexOf('function openEntry');
const hazardBlock = html.slice(hazardStart, hazardEnd);
ck('隐患区块内无 <img ... src=" + hzPhotoUrl/photo 直链', !/src="'\s*\+\s*(hzPhotoUrl|API_BASE)/.test(hazardBlock), '仍有直链写法');
ck('详情照片走 renderHazardPhotos → loadServerPhoto（带登录态）',
  /async function renderHazardPhotos[\s\S]{0,600}loadServerPhoto/.test(hazardBlock));
ck('renderHazardDetail 调用了 renderHazardPhotos', /renderHazardPhotos\(\$\("#hz-detail-photos"\)/.test(hazardBlock));
// 3) 列表缩略图必须挂懒加载队（thumbObserver/thumbQueue），不允许裸 img
ck('列表缩略图挂 thumbObserver（进视口才拉原图）', hazardBlock.includes('thumbObserver()'));
ck('列表缩略图有老 WebView 兜底（thumbQueue.push）', hazardBlock.includes('thumbQueue.push'));
ck('列表重绘前 resetThumbObserver（防死节点攒积）', /resetThumbObserver\(\);/.test(hazardBlock));

console.log('=== B. Worker：列表换 scan（消 filter search 索引延迟）===');
const listFn = slice(worker, 'async function handleHazardList', 'async function handleHazardDetail')
  .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');   // 去注释：注释里为说明缘由会提到 searchRecords
ck('handleHazardList 用 scanRecords 全量 + 本地过滤', listFn.includes('adapter.scanRecords'));
ck('handleHazardList 不再用 searchRecords(filter)（索引延迟）', !listFn.includes('searchRecords'), listFn.match(/.*searchRecords.*/)?.[0]);
ck('本地过滤按 排查人ID === 本人', listFn.includes("'排查人ID'") && listFn.includes('payload.sub'));
ck('scan 页数上限受控（3 页 = 1500 条）', /scanRecords\(env, cfg\.fileId, tableId, 3\)/.test(listFn));

console.log('=== C. Worker：submit→list 立即可见的语义依赖（mapHazardRecord 形状一致）===');
// scanRecords 与 searchRecords 返回同为 [{id, fields}]，mapHazardRecord 直接复用
ck('mapHazardRecord 仍读 rec.fields/rec.id（scan 返回同构）', /rec\.fields \|\| \{\}/.test(worker) && /recordId: rec\.id/.test(worker));

console.log('=== D. 取图接口与派发图同一条（handleServerPhoto）===');
const photoFn = slice(worker, 'async function handleServerPhoto', 'export default {');
ck('/api/mobile/photo 路由仍注册', worker.includes("if (p === '/api/mobile/photo') return handleServerPhoto"));
ck('handleServerPhoto 要求登录态（所以前端必须带 token）', /verifyWorkerSession/.test(photoFn));

console.log('\n' + (bad === 0 ? 'ALL PASS' : bad + ' FAILED'));
process.exit(bad === 0 ? 0 : 1);

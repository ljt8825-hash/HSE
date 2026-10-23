// 一次性脚本（不提交）：check.html 的 id 一致性静态核对（HTML 声明 vs JS 引用）。
import { readFileSync } from 'node:fs';
const html = readFileSync('G:/hse-dashboard/grid-mobile-cloudflare/frontend/check.html', 'utf8');
const htmlIds = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const hazardIds = [...htmlIds].filter((i) => i.startsWith('hz-') || i.includes('hazard'));
console.log('HTML hazard 相关 ids:', hazardIds.join(', '));
const js = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join('\n');
const refs = [...js.matchAll(/\$\("#([A-Za-z0-9_-]+)"\)/g)].map((m) => m[1]);
const missing = [...new Set(refs)].filter((r) => !htmlIds.has(r));
console.log('JS 引用但 HTML 未声明:', missing.length ? missing.join(', ') : '(无)');
const bindIds = ['btn-hazard-new', 'btn-hz-geo', 'btn-hz-camera', 'btn-hz-album', 'hz-file-camera', 'hz-file-album', 'btn-hz-submit', 'hz-desc', 'hz-location', 'hazard-entry-card', 'hazard-list', 'hz-cat-grid', 'hz-level-grid', 'hz-photos', 'hz-desc-count'];
const bad = bindIds.filter((i) => !htmlIds.has(i));
console.log('关键绑定 id 检查:', bad.length ? 'MISSING: ' + bad.join(', ') : '全部 OK');
// view section 齐全
const viewIds = ['hazard-list', 'hazard-form', 'hazard-detail'].map((v) => 'view-' + v);
console.log('视图 section 检查:', viewIds.map((v) => v + (htmlIds.has(v) ? '=OK' : '=MISSING')).join(' '));
// HAZARD_VIEWS 常量与 section 对齐
const m = js.match(/const HAZARD_VIEWS = \[([^\]]+)\]/);
console.log('HAZARD_VIEWS =', m ? m[1].trim() : '(未找到)');

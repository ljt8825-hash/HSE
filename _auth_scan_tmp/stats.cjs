const fs = require('fs');
const path = require('path');
const base = '安全看板vben/apps/web-naive/src';
function walk(d, ext, acc) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p, ext, acc);
    else if (!ext || p.endsWith(ext)) acc.push(p);
  }
  return acc;
}
const vue = walk(base, '.vue', []);
const ts = walk(base, '.ts', []);
const lines = (f) => fs.readFileSync(f, 'utf8').split('\n').length;
const vueLines = vue.reduce((a, f) => a + lines(f), 0);
const tsLines = ts.reduce((a, f) => a + lines(f), 0);
console.log('vue文件:', vue.length, '行数:', vueLines);
console.log('ts文件:', ts.length, '行数:', tsLines);
console.log('总行数:', vueLines + tsLines);
const dirs = {};
for (const v of vue) {
  const parts = v.split(path.sep);
  const idx = parts.indexOf('views');
  if (idx >= 0 && parts[idx + 1]) {
    const m = parts[idx + 1];
    dirs[m] = (dirs[m] || 0) + 1;
  }
}
console.log('--- views 各模块 vue 数量 ---');
for (const k of Object.keys(dirs).sort()) console.log(k, dirs[k]);
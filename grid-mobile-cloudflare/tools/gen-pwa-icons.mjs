/**
 * gen-pwa-icons.mjs —— 生成「添加到手机桌面」所需的全部图标
 * ---------------------------------------------------------------------------
 * 背景：现场巡检人员每次都要在微信/浏览器里输网址，误操作多、也容易被别的页面盖掉。
 *      加了桌面图标后点一下直接进系统（登录态在本机，通常免登录）。
 *
 * 产出（同时写 frontend/ 与 _pages_deploy/）：
 *   icon-192.png            192×192  圆角背景（Android 标准）
 *   icon-512.png            512×512  圆角背景（Android 标准 / 安装弹窗）
 *   icon-maskable-512.png   512×512  全幅背景 + 内容缩到中央 62%（Android 自适应图标）
 *   apple-touch-icon.png    180×180  全幅背景 + 内容 78%（iOS 自己加圆角，别自带圆角）
 *   favicon-32.png           32×32
 *
 * ⚠️ maskable 的安全区是「中心直径 80% 的圆」，四角会被系统裁掉，
 *    所以关键图形必须收进中央 —— 否则在部分 launcher 上会被切掉。
 * ⚠️ 图标里不放文字：服务器上不一定装中文字体，SVG→PNG 会渲染成方块。
 *
 * 运行：node tools/gen-pwa-icons.mjs
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(new URL('../worker/node_modules/', import.meta.url));
const sharp = require('sharp');

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIRS = [path.join(ROOT, 'frontend'), path.join(ROOT, '_pages_deploy')];

const BRAND = '#1D4ED8';   // 与 check.html --primary 一致
const WHITE = '#FFFFFF';

// 盾牌 + 对勾（安全/检查的语义；纯几何，不依赖字体）
const SHIELD = `
  <path d="M256 96 L392 146 V274 c0 92-60 138-136 162 -76-24-136-70-136-162 V146 Z" fill="${WHITE}" fill-opacity=".16"/>
  <path d="M256 96 L392 146 V274 c0 92-60 138-136 162 -76-24-136-70-136-162 V146 Z" fill="none" stroke="${WHITE}" stroke-width="24" stroke-linejoin="round"/>
  <path d="M198 264 l46 46 92-98" fill="none" stroke="${WHITE}" stroke-width="36" stroke-linecap="round" stroke-linejoin="round"/>
`;

// rounded=true → 圆角方块背景（普通图标）；false → 铺满整幅（maskable / iOS）
function svg(size, { rounded = true, inset = 1 } = {}) {
  const r = rounded ? Math.round(size * 0.22) : 0;
  // 注意：必须写成 transform="..."，不能把 translate()/scale() 直接当属性名写在 <g> 上
  //（那样是裸属性，XML 解析直接失败，报的却是莫名其妙的「标签不匹配」）
  const scale = inset < 1 ? ` transform="translate(${size / 2} ${size / 2}) scale(${inset}) translate(${-size / 2} ${-size / 2})"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${Math.round(r * (512 / size))}" fill="${BRAND}"/>
  <g${scale}>${SHIELD}</g>
</svg>`;
}

const JOBS = [
  { file: 'icon-192.png', size: 192, opts: { rounded: true } },
  { file: 'icon-512.png', size: 512, opts: { rounded: true } },
  // maskable：背景铺满 + 图形收到中央 62%（安全区 = 中心 80% 直径的圆）
  { file: 'icon-maskable-512.png', size: 512, opts: { rounded: false, inset: 0.62 } },
  // iOS：系统自己叠圆角遮罩，图本身不要圆角；图形留 78%
  { file: 'apple-touch-icon.png', size: 180, opts: { rounded: false, inset: 0.78 } },
  { file: 'favicon-32.png', size: 32, opts: { rounded: true } },
];

for (const job of JOBS) {
  const buf = await sharp(Buffer.from(svg(job.size, job.opts))).png({ compressionLevel: 9 }).toBuffer();
  for (const dir of OUT_DIRS) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, job.file), buf);
  }
  console.log('  ✓ ' + job.file.padEnd(24) + job.size + '×' + job.size + '  ' + buf.length + ' B');
}
console.log('\n已写入：' + OUT_DIRS.map((d) => path.relative(ROOT, d)).join(' / '));

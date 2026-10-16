/* CF-WPS-97 隐患照片水印（右下角、年-月-日）—— 离线逻辑验证（纯 Node）
 * 覆盖：
 *   A 静态：compressImage 签名带 wmText；draw 内 encode 前调用水印；全文件只有隐患一路带水印
 *   B 位置/样式：右下角（x=w-pad, y=h-pad）、右对齐、白字 + 深色描边、字号按短边比例且下限 14
 *   C 兜底：空文本不画、ctx 为空不抛、save/restore 成对
 *   D 日期串：/^\d{4}-\d{2}-\d{2}$/ 且等于本机今日
 *   E 接线：pickHazardPhoto 第三参=photoWatermarkDate()；配额满时不调 compressImage
 * Run: node test/cfwps97-photo-watermark.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHECK = path.join(HERE, '..', '..', 'frontend', 'check.html');
const src = fs.readFileSync(CHECK, 'utf8');

let bad = 0;
const ck = (c, m, x) => c ? console.log('  ok  ' + m + (x !== undefined ? ' :: ' + x : '')) : (bad++, console.log('  NG  ' + m + (x !== undefined ? ' :: ' + x : '')));

/* 从源码中按名抽取一个 function 声明（花括号配平） */
function extractFn(name) {
  const at = src.indexOf('function ' + name + '(');
  if (at < 0) throw new Error('未找到 function ' + name);
  const open = src.indexOf('{', at);
  let depth = 0, i = open;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  if (depth !== 0) throw new Error('花括号未配平: ' + name);
  return src.slice(at, i);
}

/* ================= A. 静态接线 ================= */
console.log('\n=== A. 静态接线 ===');
const sig = extractFn('compressImage');
ck(/function compressImage\(file, cb, wmText\)/.test(sig), 'compressImage 第三参 wmText');
const drawBody = sig.slice(sig.indexOf('const draw ='), sig.indexOf('if(typeof createImageBitmap'));
ck(/if\(wmText\)\s*drawPhotoWatermark\(ctx, w, h, wmText\)/.test(drawBody), 'draw 内 encode 前画水印', 'if(wmText) drawPhotoWatermark(...)');
// 全文件只允许「隐患一路」带水印：}, photoWatermarkDate());
const wmSites = src.match(/\}, photoWatermarkDate\(\)\);/g) || [];
ck(wmSites.length === 1, '全文件仅 1 处带水印（只有隐患登记）', 'count=' + wmSites.length);
// 另外三处 compressImage（巡查/现场/整改照片）必须仍是两参（同行不带日期参数）
const calls = src.split('\n').filter((l) => /compressImage\((f|file)\b/.test(l) && !/function compressImage/.test(l));
ck(calls.length === 4 && calls.every((l) => !/photoWatermarkDate/.test(l)),
   'compressImage 共 4 处调用、同行均不带水印参数（隐患那处的第三参在收尾行，由上一条断言管）',
   calls.map((l) => l.trim().slice(0, 40)).join(' | '));

/* ================= B/C. drawPhotoWatermark 行为 ================= */
console.log('\n=== B/C. drawPhotoWatermark ===');
const W_FN = extractFn('drawPhotoWatermark');
function makeCtx() {
  const calls = [];
  const ctx = {
    save: () => calls.push(['save']), restore: () => calls.push(['restore']),
    font: '', textAlign: '', textBaseline: '', lineWidth: 0, lineJoin: '', strokeStyle: '', fillStyle: '',
    strokeText: (t, x, y) => calls.push(['strokeText', t, x, y]),
    fillText: (t, x, y) => calls.push(['fillText', t, x, y]),
  };
  return { ctx, calls };
}
const wm = new Function(W_FN + '\nreturn drawPhotoWatermark;')();

// B1 常规图 400x300：size=max(14,round(300*.05))=15, pad=round(15*.8)=12 → x=388 y=288
{
  const { ctx, calls } = makeCtx();
  wm(ctx, 400, 300, '2026-10-16');
  const fills = calls.filter((c) => c[0] === 'fillText');
  const strokes = calls.filter((c) => c[0] === 'strokeText');
  ck(fills.length === 1 && strokes.length === 1, 'fill/stroke 各一次');
  ck(fills[0][1] === '2026-10-16' && fills[0][2] === 388 && fills[0][3] === 288,
     '右下角坐标 x=w-pad y=h-pad（400×300 → 388,288）', fills[0] && fills[0].slice(1).join(','));
  ck(ctx.textAlign === 'right', '右对齐', ctx.textAlign);
  ck(/bold 15px/.test(ctx.font), '字号按短边比例 15px（400×300）', ctx.font);
  ck(ctx.fillStyle === '#ffffff', '白字', ctx.fillStyle);
  ck(/^rgba\(0,\s*0,\s*0,\s*0\.55\)$/.test(ctx.strokeStyle), '深色描边（压亮底色）', ctx.strokeStyle);
  ck(ctx.lineWidth === Math.max(2, Math.round(15 / 8)), '描边宽度=字号/8 下限2', String(ctx.lineWidth));
  const si = calls.findIndex((c) => c[0] === 'strokeText'), fi = calls.findIndex((c) => c[0] === 'fillText');
  ck(si > -1 && fi > si, '先描边后填充（否则白字会把描边盖掉）');
  ck(calls[0][0] === 'save' && calls[calls.length - 1][0] === 'restore', 'save/restore 成对（不污染调用方 ctx 状态）');
}
// B2 小图 100x75：比例字号只有 4px → 抬到下限 14
{
  const { ctx } = makeCtx();
  wm(ctx, 100, 75, '2026-10-16');
  ck(/bold 14px/.test(ctx.font) && ctx.textAlign === 'right', '极小图字号下限 14px（300px 短边*0.05<14）', ctx.font);
}
// B3 日期串前后空白被裁掉
{
  const { ctx, calls } = makeCtx();
  wm(ctx, 400, 300, '  2026-10-16  ');
  ck(calls.filter((c) => c[0] === 'fillText')[0][1] === '2026-10-16', '文本 trim');
}
// C1 空串 / null → 不画不抛
{
  const { ctx, calls } = makeCtx();
  wm(ctx, 400, 300, '');
  wm(ctx, 400, 300, null);
  wm(ctx, 400, 300, '   ');
  ck(calls.length === 0, '空文本零绘制调用', 'calls=' + calls.length);
}
{
  let threw = false;
  try { wm(null, 400, 300, '2026-10-16'); wm(undefined, 0, 0, 'x'); } catch (e) { threw = true; }
  ck(!threw, 'ctx 为空 / 尺寸 0 不抛异常');
}

/* ================= D. 日期串 ================= */
console.log('\n=== D. photoWatermarkDate ===');
const dateFn = new Function(extractFn('photoWatermarkDate') + '\nreturn photoWatermarkDate;')();
const dstr = dateFn();
const p = (n) => String(n).padStart(2, '0');
const now = new Date();
const expect = now.getFullYear() + '-' + p(now.getMonth() + 1) + '-' + p(now.getDate());
ck(/^\d{4}-\d{2}-\d{2}$/.test(dstr), '格式 年-月-日', dstr);
ck(dstr === expect, '等于本机今日（不掺时分秒）', 'got=' + dstr + ' want=' + expect);

/* ================= E. pickHazardPhoto 接线 ================= */
console.log('\n=== E. pickHazardPhoto 接线 ===');
function harness(photos) {
  const ctx = {
    hazardForm: { photos: photos || [] },
    HAZARD_PHOTO_MAX: 3,
    flashMsg: (t) => ctx._flashed.push(t),
    renderHzPhotos: () => { ctx._rendered++; },
    compressImage: (f, cb, wmText) => { ctx._ci = { wm: wmText }; cb('data:image/jpeg;base64,xxx'); },
    _flashed: [], _rendered: 0, _ci: null,
    photoWatermarkDate: new Function(extractFn('photoWatermarkDate') + '\nreturn photoWatermarkDate;')(),
  };
  const fn = new Function('ctx', `
    const hazardForm = ctx.hazardForm, HAZARD_PHOTO_MAX = ctx.HAZARD_PHOTO_MAX;
    const flashMsg = ctx.flashMsg, renderHzPhotos = ctx.renderHzPhotos, compressImage = ctx.compressImage;
    const photoWatermarkDate = ctx.photoWatermarkDate;
    ${extractFn('pickHazardPhoto')}
    return pickHazardPhoto;
  `)(ctx);
  return { ctx, fn };
}
{
  const { ctx, fn } = harness();
  const input = { files: [{ name: 't.jpg' }], value: 'x' };
  fn(input);
  ck(ctx._ci && /^\d{4}-\d{2}-\d{2}$/.test(String(ctx._ci.wm)), '拍照即带当日日期水印', ctx._ci && ctx._ci.wm);
  ck(ctx.hazardForm.photos.length === 1 && ctx._rendered === 1, '照片入表单并刷新缩略图');
  ck(input.value === '', 'input.value 复位（同文件可二次选择）');
}
{
  const { ctx, fn } = harness(['a', 'b', 'c']);
  fn({ files: [{ name: 't.jpg' }], value: 'x' });
  ck(ctx._ci === null && ctx._flashed.join('').indexOf('最多上传 3 张') >= 0, '配额满：不压缩、给可见提示');
}

/* ================= F. probeImageWidth（只读文件头，防小图被放大） ================= */
console.log('\n=== F. probeImageWidth ===');
const probe = new Function(extractFn('probeImageWidth') + '\nreturn probeImageWidth;')();
function fakeFile(u8) { return { slice: (a, b) => ({ arrayBuffer: async () => u8.slice(a, b).buffer }) }; }
const u8 = (n) => new Uint8Array(n);
{
  const p = u8(64); p.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  p[16] = 0x00; p[17] = 0x00; p[18] = 0x01; p[19] = 0x90;   // 宽 400
  ck((await probe(fakeFile(p))) === 400, 'PNG：IHDR 宽=400');
}
{
  const p = u8(64); p.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  p[16] = 0x00; p[17] = 0x00; p[18] = 0x0b; p[19] = 0xd0;   // 宽 3024
  ck((await probe(fakeFile(p))) === 3024, 'PNG：IHDR 宽=3024');
}
{
  const j = u8(64);
  j[0] = 0xff; j[1] = 0xd8; j[2] = 0xff; j[3] = 0xc0; j[4] = 0x00; j[5] = 0x11; j[6] = 0x08;
  j[7] = 0x07; j[8] = 0x08; j[9] = 0x06; j[10] = 0x40;      // 高 1800 宽 1600
  ck((await probe(fakeFile(j))) === 1600, 'JPEG：SOF0 宽=1600');
}
{
  // 相机/微信常见：SOF0 前面还有 APP1(EXIF) 段 —— 必须按段长跳过，不能瞎扫
  const j = u8(64);
  j[0] = 0xff; j[1] = 0xd8; j[2] = 0xff; j[3] = 0xe1; j[4] = 0x00; j[5] = 0x20;   // APP1 len=32
  j[38] = 0xff; j[39] = 0xc0; j[40] = 0x00; j[41] = 0x11; j[42] = 0x08;
  j[43] = 0x02; j[44] = 0x58; j[45] = 0x07; j[46] = 0x80;                        // 高 600 宽 1920
  ck((await probe(fakeFile(j))) === 1920, 'JPEG：跳过 EXIF APP1 后取到 SOF0 宽=1920');
}
{
  const w = u8(32); w.set([0x52, 0x49, 0x46, 0x46], 0);   // RIFF/WEBP：不支持 → null
  ck((await probe(fakeFile(w))) === null, 'WebP：不支持，返回 null（维持原行为）');
  ck((await probe(fakeFile(u8(16)))) === null, '纯垃圾字节：返回 null');
  ck((await probe({})) === null, '无 slice 的文件对象：返回 null');
  ck((await probe(null)) === null, 'null：返回 null');
}
ck(/const pw = await probeImageWidth\(file\)/.test(sig) && /Math\.min\(PHOTO_MAX_EDGE, pw \|\| PHOTO_MAX_EDGE\)/.test(sig),
   'compressImage 用探测宽度收敛 resizeWidth（小图不放大）');
ck(/Math\.min\(1, PHOTO_MAX_EDGE/.test(sig), 'legacy 回退路径仍按 min(1,…) 收敛（本来就不会放大）');

console.log('\n' + (bad === 0 ? 'ALL PASS' : bad + ' FAILED'));
process.exit(bad === 0 ? 0 : 1);

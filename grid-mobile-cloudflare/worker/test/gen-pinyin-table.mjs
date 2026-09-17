// 一次性生成脚本：产出 worker/pinyin-init.js（CJK → 拼音首字母压缩表）
// 一次性生成工具：重建 ../pinyin-init.js（CJK→拼音首字母压缩表）。
// 运行：在装有 pinyin-pro 的环境执行（如 WorkBuddy node workspace），node 同名脚本路径即可。
import { pinyin } from 'pinyin-pro';
import fs from 'fs';

const KEYS = [];
const VALS = [];
let miss = 0, total = 0;
for (let cp = 0x3400; cp <= 0x9FFF; cp++) {
  const ch = String.fromCodePoint(cp);
  total++;
  let p = '';
  try {
    p = pinyin(ch, { pattern: 'first', toneType: 'none', type: 'string', nonZh: 'consecutive' });
  } catch { p = ''; }
  if (/^[a-z]$/.test(p)) { KEYS.push(ch); VALS.push(p); } else miss++;
}
const keysStr = KEYS.join('');
const valsStr = VALS.join('');

const out = `// pinyin-init.js —— CJK 汉字 → 拼音首字母（构建期由 pinyin-pro 生成，覆盖 U+3400..U+9FFF）
// 覆盖 ${KEYS.length} 字 / 扫描 ${total} 字；多音字取词典默认读音；姓氏特殊读音由 SURNAME_OVERRIDE 兜底。
// 运行时二分查找，零依赖。未知字符返回 ''（调用方 fail-closed 拒绝）。
const KEYS = ${JSON.stringify(keysStr)};
const VALS = ${JSON.stringify(valsStr)};

// 常见姓氏特殊读音（仅当该字是姓名第一个字时生效）
const SURNAME_OVERRIDE = new Map(Object.entries({
  '翟': 'z', '曾': 'z', '仇': 'q', '单': 's', '解': 'x', '朴': 'p', '区': 'o',
  '查': 'z', '折': 's', '缪': 'm', '乐': 'y', '燕': 'y', '召': 's', '覃': 'q',
  '员': 'y', '种': 'c', '祭': 'z', '句': 'g', '能': 'n', '阚': 'k',
  '都': 'd', '盖': 'g', '郗': 'x', '郄': 'q', '冼': 'x', '庹': 't', '昝': 'z',
  '乜': 'n', '璩': 'q', '臧': 'z', '逄': 'p', '宓': 'f', '谯': 'q', '筦': 'g',
}));

function fallback(ch) {
  if (/[a-zA-Z]/.test(ch)) return ch.toLowerCase();
  if (/[0-9]/.test(ch)) return ch;
  return ''; // 未知字符 fail-closed
}

function lowerInitial(ch, isFirst) {
  if (isFirst && SURNAME_OVERRIDE.has(ch)) return SURNAME_OVERRIDE.get(ch);
  const code = ch.codePointAt(0);
  if (code < KEYS.charCodeAt(0) || code > KEYS.charCodeAt(KEYS.length - 1)) return fallback(ch);
  let lo = 0, hi = KEYS.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = KEYS.charCodeAt(mid);
    if (c === code) return VALS[mid];
    if (c < code) lo = mid + 1; else hi = mid - 1;
  }
  return fallback(ch);
}

// 姓名拼音首字母（逐字取首字母；任何字无法解析 → 返回 null，由调用方拒绝登录）
export function pinyinInitials(name) {
  const s = String(name || '').trim().replace(/[\\u00B7\\s]/g, '');
  if (!s) return null;
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const v = lowerInitial(s[i], i === 0);
    if (!v) return null;
    out += v;
  }
  return out;
}
`;
fs.writeFileSync('G:/hse-dashboard/grid-mobile-cloudflare/worker/pinyin-init.js', out, 'utf-8');
console.log('KEYS len:', KEYS.length, 'miss:', miss, 'file KB:', Math.round(Buffer.byteLength(out) / 1024));

// 多音字/特殊姓氏样例验证
const t = (n) => console.log(n, '=>', pinyin(n, { pattern: 'first', toneType: 'none', type: 'string' }));
for (const n of ['翟中坡', '占先洪', '回伦山', '苑恩林', '靳洪刚', '傅学武', '盖广勇', '车书新', '单忠华']) t(n);

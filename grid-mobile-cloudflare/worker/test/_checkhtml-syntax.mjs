/* 语法自检：抽取 check.html 内联 <script> 逐段 node --check（不执行） */
import fs from 'fs';
import { execFileSync } from 'child_process';
import os from 'os';
import path from 'path';

const file = process.argv[2] || '../frontend/check.html';
const html = fs.readFileSync(file, 'utf8');
const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
console.log(`内联脚本段数: ${blocks.length}`);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synchk-'));
let bad = 0;
blocks.forEach((code, i) => {
  const f = path.join(tmpDir, `b${i}.js`);
  fs.writeFileSync(f, code, 'utf8');
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    console.log(`  PASS block#${i} (${code.length} chars)`);
  } catch (e) {
    bad++;
    console.log(`  FAIL block#${i}: ${String(e.stderr || e.message).slice(0, 400)}`);
  }
});
fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(bad ? `\nSYNTAX: ${bad} block(s) failed` : '\nSYNTAX: ALL BLOCKS OK');
process.exit(bad ? 1 : 0);

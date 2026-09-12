const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'dbt_chunks');
const subDir = path.join(dir, 'sub');
if (!fs.existsSync(subDir)) fs.mkdirSync(subDir, { recursive: true });

const CHUNK = 15;
const manifest = [];

for (const name of ['chunk_04.json', 'chunk_05.json', 'chunk_06.json']) {
  const arr = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
  let idx = 0;
  for (let i = 0; i < arr.length; i += CHUNK) {
    const slice = arr.slice(i, i + CHUNK);
    // newline-delimited JSON: one record per line (compact)
    const ndjson = slice.map((r) => JSON.stringify(r)).join('\n');
    const outName = name.replace('chunk_', 'sub_').replace('.json', `_${String(idx).padStart(2, '0')}.jsonl`);
    fs.writeFileSync(path.join(subDir, outName), ndjson + '\n');
    manifest.push({ file: outName, count: slice.length });
    idx++;
  }
}
console.log(JSON.stringify(manifest, null, 1));

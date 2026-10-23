import sharp from '../node_modules/sharp/lib/index.js';
import path from 'node:path'; import fs from 'node:fs';
const W = 4000, H = 3000;
const out = path.join(import.meta.dirname, '_assets', 'big-camera.jpg');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2b6cb0"/><stop offset="1" stop-color="#f6ad55"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/><circle cx="${W/2}" cy="${H/2}" r="${H/3}" fill="#fff" opacity="0.35"/></svg>`;
await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toFile(out);
console.log('big-camera.jpg', fs.statSync(out).size, 'bytes', W + 'x' + H);

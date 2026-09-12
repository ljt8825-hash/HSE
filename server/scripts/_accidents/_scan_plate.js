// 扫描事故描述里所有「车牌号」候选，以便定正则
const { pool } = require('../../config/db');

const PROVINCE = '京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼';
const plateRegex = new RegExp('[' + PROVINCE + '][A-Z][A-Z0-9]{5,7}', 'g');

(async () => {
  const r = await pool.query("SELECT id, description, involved_vehicle FROM accidents WHERE is_deleted = false AND description IS NOT NULL ORDER BY id");
  const stats = { withPlate: 0, noPlate: 0, total: 0, inDescription: 0 };
  const details = [];
  for (const x of r.rows) {
    stats.total++;
    const desc = x.description || '';
    const ms = [...new Set([...desc.matchAll(plateRegex)].map((m) => m[0]))];
    if (x.involved_vehicle) stats.inDescription++;
    if (ms.length > 0) {
      stats.withPlate++;
      if (details.length < 8) {
        details.push({ id: x.id, plates: ms, already: x.involved_vehicle });
      }
    } else {
      stats.noPlate++;
    }
  }
  console.log('total=', stats.total, '描述含车牌=', stats.withPlate, '描述不含=', stats.noPlate, '已填车牌=', stats.inDescription);
  console.log('样例：');
  for (const d of details) {
    console.log(' id=' + d.id, 'plates=' + JSON.stringify(d.plates), ' already=' + d.already);
  }

  // 检查误中：把人名里的「车牌」式误识别
  console.log('--- 误中扫描 ---');
  const wrongs = [];
  for (const x of r.rows) {
    const desc = x.description || '';
    const ms = [...new Set([...desc.matchAll(plateRegex)].map((m) => m[0]))];
    if (ms.length > 0) {
      // 提取上下文
      const first = ms[0];
      const idx = desc.indexOf(first);
      const before = desc.slice(Math.max(0, idx - 10), idx);
      const after = desc.slice(idx + first.length, Math.min(desc.length, idx + first.length + 10));
      if (details.length < 18 || !before.includes('驾驶') && !before.includes('车牌')) {
        if (wrongs.length < 6) {
          wrongs.push({ id: x.id, plate: first, before, after, segment: desc.slice(Math.max(0, idx - 8), idx + first.length + 8) });
        }
      }
    }
  }
  for (const w of wrongs) {
    console.log(' id=' + w.id, 'plate=' + w.plate, 'ctx=' + JSON.stringify(w.segment));
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

/**
 * 风险点坐标回填脚本
 * ---------------------------------------------------------------------------
 * 位置：安全看板vben/server/scripts/backfill-risk-coords.js
 *
 * 用途：为 risk_sources 表中 lng/lat 为 NULL 的风险点，依据 location/sheet/name
 *       等字段智能匹配 GPS 坐标，生成并执行 UPDATE 语句。
 *
 * 匹配优先级（逐级降级）：
 *   1) 转运站精确匹配：location 含某转运站名称 → 该转运站坐标
 *   2) 自有设施匹配：   location 含"办公室"/"仓库" → 对应坐标
 *   3) 公园范围匹配：   location 含某公园名称 → 该公园中心坐标
 *   4) 乡镇模糊匹配：   location/sheet 含某乡镇名 → 乡镇中心 + 确定性微偏移
 *   5) 哈希分配：       以上均不匹配 → 按 id 确定性哈希分配到一个乡镇中心
 *
 * 数据库配置：复用真实后端 server/config/db.js（其自动读取 server/.env）。
 *   本脚本位于 安全看板vben/server/scripts/，向上三层即到仓库根，
 *   故用 '../../../server/config/db' 解析到 F:/hse-dashboard/server/config/db.js。
 *   若将来目录结构调整，resolveDb() 会按候选路径依次尝试。
 *
 * 用法：
 *   node backfill-risk-coords.js            # 默认 --dry-run，仅打印 SQL 与统计，不写库
 *   node backfill-risk-coords.js --execute  # 真正执行 UPDATE（事务内，失败回滚）
 *   node backfill-risk-coords.js --help      # 查看帮助
 *
 * 安全：默认 --dry-run（不写库）；--execute 时在事务中执行，失败自动 ROLLBACK。
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// 兼容：仓库根 package.json 含 "type": "module"，此 .js 被当作 ESM。
// 用 createRequire 在 ESM 上下文中恢复 CommonJS require，从而复用后端 server/config/db（CJS）。
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 解析数据库配置（server/config/db 的 { pool }）。
 * 依次尝试多个候选相对路径，命中第一个可用者。
 */
function resolveDb() {
  const candidates = [
    path.join(__dirname, '..', '..', '..', 'server', 'config', 'db'), // 安全看板vben/server/scripts -> ../../../server/config/db
    path.join(__dirname, '..', '..', 'config', 'db'),                 // 安全看板vben/server/scripts -> ../../config/db
    path.join(__dirname, '..', 'config', 'db'),                       // 安全看板vben/server/scripts -> ../config/db
  ];
  let lastErr;
  for (const c of candidates) {
    try {
      return require(c);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(
    `[backfill] 无法定位数据库配置 server/config/db。候选路径均已失败，最后错误: ${lastErr && lastErr.message}`,
  );
}

const { pool } = resolveDb();

// ===================== 匹配数据源（与前端地图常量保持一致） =====================
// 12 个转运站坐标（内联；与 map.vue / 提示词-202 §4.4 一致）
const TRANSFER_STATIONS = [
  { name: '大曹镇转运站', lng: 116.59978399, lat: 37.5677537 },
  { name: '保店镇转运站', lng: 116.69413842, lat: 37.60782273 },
  { name: '相衙镇转运站', lng: 116.69304203, lat: 37.66332576 },
  { name: '时集镇转运站', lng: 116.76077978, lat: 37.69101086 },
  { name: '刘营伍乡转运站', lng: 116.78000476, lat: 37.76202433 },
  { name: '张大庄转运站', lng: 116.833725, lat: 37.78435017 },
  { name: '长官镇转运站', lng: 116.92363535, lat: 37.78334669 },
  { name: '大柳镇转运站', lng: 116.83921723, lat: 37.72366746 },
  { name: '杜集镇转运站', lng: 116.94402388, lat: 37.7301902 },
  { name: '柴胡店转运站', lng: 116.90707714, lat: 37.63870936 },
  { name: '乐陵光大环保', lng: 117.30003017, lat: 37.70145604 },
  { name: '德州润电环保', lng: 116.84101635, lat: 37.53324452 },
];

// 2 个自有设施
const FACILITIES = [
  { name: '办公室', lng: 116.81585532, lat: 37.63514208 },
  { name: '仓库', lng: 116.81590903, lat: 37.63653545 },
];

// 5 个公园中心坐标（从边界点计算中心；康宁湖拆为西区/东区，与 kangning-lake.ts 对应）
const PARKS = [
  { name: '中心公园', lng: 116.79738671, lat: 37.63632261 },
  { name: '福宁河景观带', lng: 116.80569098, lat: 37.642924 },
  { name: '新河公园（湿地）', lng: 116.79332627, lat: 37.66315 },
  { name: '康宁湖（西区）', lng: 116.7802801, lat: 37.62537245 },
  { name: '康宁湖（东区）', lng: 116.7915655, lat: 37.624862 },
];

// 12 个乡镇中心坐标（与 src/components/hse/risk-map-data.ts 的 TOWNSHIP_CENTERS 完全一致）
// 顺序保持与前端一致，以保证按 id 哈希分配的确定性结果可复现。
const TOWNSHIP_CENTERS = [
  ['刘营伍乡', 116.7665, 37.7475],
  ['张大庄镇', 116.7984, 37.8012],
  ['柴胡店镇', 116.9276, 37.6317],
  ['大曹镇', 116.5892, 37.5754],
  ['保店镇', 116.6868, 37.6202],
  ['长官镇', 116.8925, 37.8117],
  ['大柳镇', 116.8594, 37.7522],
  ['时集镇', 116.7656, 37.6965],
  ['杜集镇', 116.9341, 37.7143],
  ['相衙镇', 116.6892, 37.6901],
  ['宁城街道', 116.7949, 37.6347],
  ['津城街道', 116.803, 37.6232],
];

// ===================== 工具函数 =====================
/**
 * 基于 id 的确定性伪随机偏移（±0.008 度，约 ±800m）。
 * 相同 center + seed 永远得到相同结果（确定性），便于回填后复现。
 * @param {[number, number]} center [lng, lat]
 * @param {number} seed 通常用记录 id
 */
function jitter(center, seed) {
  const a = Math.sin(seed * 1234.5678) * 0.008;
  const b = Math.cos(seed * 8765.4321) * 0.008;
  return [center[0] + a, center[1] + b];
}

function fmt(n) {
  return Number(n).toFixed(6);
}

// ===================== 匹配策略 =====================
/**
 * 返回 { lng, lat, strategy }，strategy ∈ 1..5
 * 未匹配（理论上不会，因策略 5 兜底）返回 null
 */
function matchRisk(risk) {
  const text = `${risk.location || ''} ${risk.sheet || ''} ${risk.name || ''} ${risk.area || ''}`;

  // 1) 转运站精确匹配
  for (const s of TRANSFER_STATIONS) {
    if (text.includes(s.name)) {
      return { lng: s.lng, lat: s.lat, strategy: 1 };
    }
  }

  // 2) 自有设施匹配
  if (text.includes('办公室')) {
    const f = FACILITIES.find((x) => x.name === '办公室');
    return { lng: f.lng, lat: f.lat, strategy: 2 };
  }
  if (text.includes('仓库')) {
    const f = FACILITIES.find((x) => x.name === '仓库');
    return { lng: f.lng, lat: f.lat, strategy: 2 };
  }

  // 3) 公园范围匹配
  for (const p of PARKS) {
    if (text.includes(p.name)) {
      return { lng: p.lng, lat: p.lat, strategy: 3 };
    }
  }

  // 4) 乡镇模糊匹配
  for (const [town, clng, clat] of TOWNSHIP_CENTERS) {
    if (text.includes(town)) {
      const [jlng, jlat] = jitter([clng, clat], risk.id || 0);
      return { lng: jlng, lat: jlat, strategy: 4 };
    }
  }

  // 5) 哈希分配（兜底）
  const idx = Math.abs(risk.id || 0) % TOWNSHIP_CENTERS.length;
  const [clng, clat] = [TOWNSHIP_CENTERS[idx][1], TOWNSHIP_CENTERS[idx][2]];
  const [jlng, jlat] = jitter([clng, clat], risk.id || 0);
  return { lng: jlng, lat: jlat, strategy: 5 };
}

const STRATEGY_LABEL = {
  1: '转运站匹配',
  2: '自有设施匹配',
  3: '公园匹配',
  4: '乡镇模糊匹配',
  5: '哈希分配',
};

// ===================== 主流程 =====================
async function main() {
  const args = process.argv.slice(2);
  const showHelp = args.includes('--help') || args.includes('-h');
  if (showHelp) {
    console.log('用法: node backfill-risk-coords.js [--execute|--dry-run|--help]');
    console.log('  --dry-run  (默认) 仅生成并打印 SQL 与统计，不写库');
    console.log('  --execute        在事务中执行 UPDATE（失败自动回滚）');
    console.log('  --help           打印本说明');
    console.log('');
    console.log('数据源（内联）：12 转运站 / 2 自有设施 / 5 公园 / 12 乡镇中心');
    console.log('目标表：risk_sources（lng/lat 为 NULL 的记录）');
    return;
  }

  const execute = args.includes('--execute');
  const dryRun = !execute;

  if (dryRun) {
    console.log('=== 风险点坐标回填（DRY RUN）===');
  } else {
    console.log('=== 风险点坐标回填（EXECUTE）===');
  }

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, name, type, level, location, lng, lat, area, sheet
       FROM risk_sources
       WHERE lng IS NULL OR lat IS NULL
       ORDER BY id`,
    );

    const total = rows.length;
    const strategyCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const unmatched = []; // 策略 5（哈希兜底）视为"未精确匹配"
    const updates = []; // { id, lng, lat, strategy }

    for (const r of rows) {
      const m = matchRisk(r);
      if (!m) {
        unmatched.push(r.id);
        continue;
      }
      strategyCounts[m.strategy] += 1;
      if (m.strategy === 5) unmatched.push(r.id);
      updates.push({ id: r.id, lng: m.lng, lat: m.lat, strategy: m.strategy });
    }

    console.log(`待回填记录数: ${total}`);
    console.log(`策略1（转运站匹配）: ${strategyCounts[1]}`);
    console.log(`策略2（自有设施匹配）: ${strategyCounts[2]}`);
    console.log(`策略3（公园匹配）: ${strategyCounts[3]}`);
    console.log(`策略4（乡镇模糊匹配）: ${strategyCounts[4]}`);
    console.log(`策略5（哈希分配）: ${strategyCounts[5]}`);
    console.log(`未精确匹配记录数: ${unmatched.length}`);
    if (unmatched.length > 0) {
      console.log(`未精确匹配记录 ID: [${unmatched.join(', ')}]`);
    }

    if (dryRun) {
      console.log('\n=== 生成的 SQL（前10条）===');
      const preview = updates.slice(0, 10);
      for (const u of preview) {
        console.log(`UPDATE risk_sources SET lng = ${fmt(u.lng)}, lat = ${fmt(u.lat)} WHERE id = ${u.id};`);
      }
      if (updates.length > preview.length) {
        console.log(`...（其余 ${updates.length - preview.length} 条省略，--execute 时全部执行）`);
      }
      return;
    }

    // EXECUTE：事务内执行（参数化，避免 SQL 注入）
    console.log('\n[EXECUTE] 在事务中执行 UPDATE...');
    await client.query('BEGIN');
    let failed = 0;
    for (const u of updates) {
      try {
        await client.query(
          'UPDATE risk_sources SET lng = $1, lat = $2 WHERE id = $3',
          [Number(u.lng), Number(u.lat), u.id],
        );
      } catch (e) {
        failed += 1;
        console.error(`  [失败] id=${u.id}: ${e.message}`);
      }
    }
    if (failed > 0) {
      await client.query('ROLLBACK');
      console.log(`\n失败: ${failed} 条，事务已回滚`);
      process.exitCode = 1;
    } else {
      await client.query('COMMIT');
      console.log(`\n已更新: ${updates.length} 条`);
      console.log('失败: 0 条');
      console.log('事务已提交');
    }
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      /* noop */
    }
    console.error('[EXECUTE] 执行异常，已回滚:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('脚本异常:', err);
  process.exitCode = 1;
});

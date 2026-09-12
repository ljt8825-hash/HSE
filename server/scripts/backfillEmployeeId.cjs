/**
 * Sprint D Step 10 (v1.2 增强): 历史数据回填脚本
 *
 * 目标: 将培训/三违/隐患/事故/应急预案表中 employee 外键列（employee_id /
 *       violator_id / checker_id / fixer_id / handler_id / responsible_person_id）
 *       为 NULL 的记录，通过 身份证号哈希 或 姓名（唯一匹配）关联 employee.id 回填。
 *
 * v1.2 增强点（相对 v1.0）:
 *   1. 覆盖范围从 2 张表扩展到 5 张表（6 个目标外键列）。
 *   2. 三违表新增 身份证号 匹配路径（优先），降级姓名匹配。
 *   3. 逐条 SELECT 改为 批量查询（name / id_card_hash 各一次），减少 DB 往返。
 *   4. 全量回填包裹在单个事务中（BEGIN / COMMIT / ROLLBACK）。
 *   5. 每次执行结果持久化至 backfill_log 表（如不存在则自动创建）。
 *
 * ⚠️ 生产安全加固 (Step 11): NODE_ENV=production 且无 --dry-run 时硬拦截 exit(1)
 *
 * 用法: node scripts/backfillEmployeeId.cjs [--dry-run]
 *   --dry-run : 仅统计预估可回填数量，不执行任何 UPDATE / 不写入日志行
 */

require('dotenv').config();
const { Pool } = require('pg');
const { hashSensitive } = require('../utils/encryption');

const pool = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'safety_dashboard',
  max: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
  client_encoding: 'UTF8'
});

const isDryRun = process.argv.includes('--dry-run');

// ============================================================
// v1.2 回填目标配置：5 张表 / 6 个目标外键列
//   idCardCol: 存在则该表支持身份证号优先匹配（哈希后比对 employee.id_card_hash）
//   nameCol  : 用于降级姓名唯一匹配（比对 employee.name）
// ============================================================
const BACKFILL_TARGETS = [
  { table: 'training_records',     targetCol: 'employee_id',          idCardCol: 'id_card',            nameCol: 'name' },
  { table: 'violation_records',    targetCol: 'violator_id',          idCardCol: 'violator_id_card',   nameCol: 'violator_name' },
  { table: 'hazards',              targetCol: 'checker_id',           idCardCol: null,                 nameCol: 'checker' },
  { table: 'hazards',              targetCol: 'fixer_id',             idCardCol: null,                 nameCol: 'fixer' },
  { table: 'accidents',            targetCol: 'handler_id',           idCardCol: null,                 nameCol: 'handler' },
  { table: 'emergency_plans',      targetCol: 'responsible_person_id', idCardCol: null,                nameCol: 'responsible_person' },
];

// 回填日志表（审计用，幂等创建）
const LOG_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS backfill_log (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(100),
    column_name VARCHAR(100),
    total_nulls INTEGER,
    matched_count INTEGER,
    updated_count INTEGER,
    skipped_count INTEGER,
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    dry_run BOOLEAN DEFAULT false
  );
`;

/**
 * 确保 backfill_log 表存在（幂等 DDL，不写入数据行）
 */
async function ensureLogTable(client) {
  await client.query(LOG_TABLE_DDL);
}

/**
 * 回填单个目标外键列
 */
async function backfillColumn(client, cfg) {
  const { table, targetCol, idCardCol, nameCol } = cfg;
  const qTable = `"${table}"`;
  const qTarget = `"${targetCol}"`;
  const qName = `"${nameCol}"`;

  console.log(`\n=== ${table}.${targetCol} 回填 ===`);
  console.log('模式:', isDryRun ? 'DRY RUN（仅查询不修改）' : '实际执行');

  // 1. 统计可回填条数
  const statSql = `
    SELECT
      COUNT(*) AS total_null,
      COUNT(*) FILTER (WHERE ${qName} IS NOT NULL AND ${qName} != '') AS has_name
      ${idCardCol ? `, COUNT(*) FILTER (WHERE "${idCardCol}" IS NOT NULL AND "${idCardCol}" != '') AS has_id_card` : ''}
    FROM ${qTable}
    WHERE is_deleted = false AND ${qTarget} IS NULL
  `;
  const stats = await client.query(statSql);
  const s = stats.rows[0];
  console.log('统计:', JSON.stringify(s));

  const totalNull = parseInt(s.total_null) || 0;
  if (totalNull === 0) {
    console.log('无可回填记录');
    return { table, targetCol, totalNull: 0, matched: 0, updated: 0, skipped: 0 };
  }

  // 2. 取候选记录
  const candCols = [`id`, `${qName} AS match_name`];
  if (idCardCol) candCols.push(`"${idCardCol}" AS id_card_raw`);
  const candidates = await client.query(`
    SELECT ${candCols.join(', ')}
    FROM ${qTable}
    WHERE is_deleted = false AND ${qTarget} IS NULL
  `);
  const rows = candidates.rows;

  // 3. 批量构建 employee 映射（各一次查询，替代逐条 SELECT）
  // 3a. 姓名唯一映射
  const nameSet = new Set();
  for (const r of rows) {
    if (r.match_name) nameSet.add(r.match_name.trim());
  }
  const nameToId = new Map();
  if (nameSet.size > 0) {
    const emp = await client.query(
      `SELECT id, name FROM employee WHERE name = ANY($1) AND is_deleted = false`,
      [Array.from(nameSet)]
    );
    const nameCounts = new Map();
    for (const e of emp.rows) {
      nameCounts.set(e.name, (nameCounts.get(e.name) || 0) + 1);
      if (!nameToId.has(e.name)) nameToId.set(e.name, e.id);
    }
    // 仅保留唯一匹配（重名删除，避免误填）
    for (const [n, c] of nameCounts) {
      if (c > 1) nameToId.delete(n);
    }
  }

  // 3b. 身份证号哈希映射（仅当表含 id_card 列）
  const hashToId = new Map();
  const ambiguousHashes = new Set();
  if (idCardCol) {
    const hashSet = new Set();
    for (const r of rows) {
      if (r.id_card_raw && r.id_card_raw.trim()) {
        const h = hashSensitive(r.id_card_raw.trim());
        if (h) hashSet.add(h);
      }
    }
    if (hashSet.size > 0) {
      const emp = await client.query(
        `SELECT id, id_card_hash FROM employee WHERE id_card_hash = ANY($1) AND is_deleted = false`,
        [Array.from(hashSet)]
      );
      const hashCounts = new Map();
      for (const e of emp.rows) {
        hashCounts.set(e.id_card_hash, (hashCounts.get(e.id_card_hash) || 0) + 1);
        if (!hashToId.has(e.id_card_hash)) hashToId.set(e.id_card_hash, e.id);
      }
      for (const [h, c] of hashCounts) {
        if (c > 1) { hashToId.delete(h); ambiguousHashes.add(h); }
      }
    }
  }

  // 4. 逐候选匹配：优先身份证号，降级姓名（唯一）
  let matched = 0;
  let skipped = 0;
  const updates = [];
  for (const r of rows) {
    let empId = null;

    // 优先：身份证号匹配
    if (idCardCol && r.id_card_raw && r.id_card_raw.trim()) {
      const h = hashSensitive(r.id_card_raw.trim());
      if (h && hashToId.has(h) && !ambiguousHashes.has(h)) {
        empId = hashToId.get(h);
      }
    }
    // 降级：姓名唯一匹配
    if (empId === null && r.match_name && r.match_name.trim()) {
      const nm = r.match_name.trim();
      if (nameToId.has(nm)) {
        empId = nameToId.get(nm);
      }
    }

    if (empId !== null) {
      matched++;
      updates.push({ id: r.id, empId });
    } else {
      skipped++;
    }
  }

  console.log(`可回填: ${matched},  跳过(无唯一匹配/重名): ${skipped}  /  总计空值: ${totalNull}`);

  // 5. 执行 UPDATE（仅实际模式）
  let updated = 0;
  if (!isDryRun && updates.length > 0) {
    for (const u of updates) {
      await client.query(
        `UPDATE ${qTable} SET ${qTarget} = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [u.empId, u.id]
      );
      updated++;
    }
    console.log(`已回填 ${updated} 条 ${table}.${targetCol}`);
  } else if (isDryRun) {
    console.log('[DRY RUN] 不执行 UPDATE');
    if (updates.length > 0) {
      console.log('将回填记录样本:', JSON.stringify(updates.slice(0, 3), null, 2));
    }
  }

  return { table, targetCol, totalNull, matched, updated, skipped };
}

/**
 * 写入一条回填日志（仅实际模式）
 */
async function logResult(client, res) {
  if (isDryRun) return;
  await client.query(
    `INSERT INTO backfill_log
       (table_name, column_name, total_nulls, matched_count, updated_count, skipped_count, dry_run)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [res.table, res.targetCol, res.totalNull, res.matched, res.updated, res.skipped, isDryRun]
  );
}

async function main() {
  console.log('========================================');
  console.log('Sprint D Step 10 (v1.2): 历史数据回填脚本');
  console.log('环境:', process.env.NODE_ENV || 'development');
  console.log('模式:', isDryRun ? 'DRY RUN' : '实际执行');
  console.log('时间:', new Date().toISOString());
  console.log('目标:', `${BACKFILL_TARGETS.length} 个外键列 / 5 张表`);
  console.log('========================================');

  // Step 11 生产安全硬拦截: production 环境且非 dry-run 时禁止执行 UPDATE
  if (process.env.NODE_ENV === 'production' && !isDryRun) {
    console.error('');
    console.error('╔══════════════════════════════════════════════════════════╗');
    console.error('║  ⚠️  生产环境安全拦截                                       ║');
    console.error('║  检测到 NODE_ENV=production 且未指定 --dry-run             ║');
    console.error('║  回填脚本禁止直接对生产库执行 UPDATE！                      ║');
    console.error('║                                                            ║');
    console.error('║  如需在生产环境执行回填：                                    ║');
    console.error('║  1. 先以 --dry-run 模式预估可回填数量                       ║');
    console.error('║  2. DBA 签字确认后，临时移除 NODE_ENV 或联系运维执行        ║');
    console.error('╚══════════════════════════════════════════════════════════╝');
    console.error('');
    process.exit(1);
  }

  if (process.env.NODE_ENV === 'production' && isDryRun) {
    console.log('⚠️ 生产环境 DRY RUN 模式：仅查询，不执行 UPDATE');
  }

  const client = await pool.connect();
  try {
    // 确保审计表存在（幂等 DDL，不写入数据行）
    await ensureLogTable(client);

    if (!isDryRun) {
      await client.query('BEGIN');
    }

    const results = [];
    for (const cfg of BACKFILL_TARGETS) {
      const res = await backfillColumn(client, cfg);
      results.push(res);
      await logResult(client, res);
    }

    if (!isDryRun) {
      await client.query('COMMIT');
      console.log('\n✅ 事务已提交');
    } else {
      console.log('\n[DRY RUN] 未写入任何数据（仅统计）');
    }

    console.log('\n=== 回填总结 ===');
    for (const r of results) {
      console.log(`${r.table}.${r.targetCol}:`, JSON.stringify(r));
    }
    console.log('\n⚠️ 此脚本仅限 dev 环境执行。生产回填需 DBA 签字后执行。');
  } catch (err) {
    if (!isDryRun) {
      try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
      console.error('❌ 回填失败，已 ROLLBACK');
    }
    throw err;
  } finally {
    client.release();
  }
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
}).finally(async () => {
  await pool.end();
});

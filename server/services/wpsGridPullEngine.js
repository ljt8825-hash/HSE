/**
 * 网格长巡查台账 · WPS → PostgreSQL 单向 Pull Engine（WPS-PG-SYNC-02 冻结）
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ 唯一方向：WPS ──(只读拉取)──▶ PostgreSQL。反向写入（PG→WPS）恒封禁。  │
 * │ WPS = 外部三违采集源 / 历史只读源；PG = HSE 正式业务库 + 唯一身份权威。│
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * 冻结铁律（每一条都有对应门禁断言，见 scripts/_wpssync02_gate.cjs）：
 *   1. 幂等键唯一 = (wps_record_id, wps_file_id)。禁用 姓名/日期/违章人/行号/serialNo/inspectionId/自然键。
 *   2. 新记录 = 单事务 INSERT grid_inspection_records + INSERT grid_record_sync_map；任一步失败整体 ROLLBACK，
 *      绝不允许「PG 有数据 / sync_map 没数据」或反之。
 *   3. PG 权威字段 inspector_employee_id / grid_id **永不写入、永不覆盖**（fail-closed，新记录为 NULL）。
 *   4. WPS 删除 ⇏ PG 删除。只统计 wpsDeleted，绝不 DELETE grid_inspection_records / grid_record_sync_map。
 *   5. pgDeleted 恒 = 0；任何导致 pgDeleted > 0 的路径直接抛错 FAIL。
 *   6. 排除名单（BT / EA）以 wps_record_id 判定，绝不依赖「PG 里已经有了所以自然跳过」。
 *   7. 图片列仅接受 ^https?:// ；异常独立记入 imageWarnings，不影响身份/网格归属。
 *   8. 本文件**不含任何 DDL**：不建表、不加列、不 ensureTables。
 *   9. dryRun 只读（不 INSERT / UPDATE / DELETE / 不写 WPS），是正式写入的前置条件。
 *  10. 同一时刻只允许一个 Pull 在跑（进程内互斥锁）。
 *
 * 字段真源：services/wps/wpsFieldMap.js（SYNC_PROJECTION），本文件不额外声明字段映射。
 */
const crypto = require('crypto');
const { pool, isConnected } = require('../config/db');
const wps = require('./wpsClient');
const {
  SYNC_PROJECTION,
  SYNC_HASH_COLUMN_COUNT,
  SYNC_URL_COLUMNS,
  PROTECTED_COLUMNS,
} = require('./wps/wpsFieldMap');

// ============================================================
// 开关
// ============================================================
// 仅显式 'true' 启用（fail-closed；未设置 / 'false' / '' / 其他值 一律 disabled）
const SYNC_ENABLED = process.env.WPS_GRID_SYNC === 'true';
// 反向写入硬锁：本引擎恒 false，任何环境变量都无法开启
const REVERSE_WRITE_ENABLED = false;

function isEnabled() {
  return SYNC_ENABLED && wps.isConfigured() && typeof isConnected === 'function' && isConnected();
}

// ============================================================
// 排除名单（冻结）
// ============================================================
/**
 * BT / EA 为 WPS-only 记录，人工裁定「WPS 保留、PG 不迁入」。
 * 判定依据 = wps_record_id（**不是**姓名/日期/serialNo 等自然键）。
 * 额外排除只能「追加」，永远无法移除冻结项（fail-safe）。
 */
const FROZEN_EXCLUSIONS = [
  { recordId: 'BT', serialNo: 'L2609', name: '王铁民', date: '2026-09-02', reason: '人工裁定：WPS 保留、PG 不迁入' },
  { recordId: 'EA', serialNo: 'L2794', name: '谢俊章', date: '2026-09-05', reason: '人工裁定：WPS 保留、PG 不迁入' },
];
const FROZEN_EXCLUSION_IDS = FROZEN_EXCLUSIONS.map((x) => x.recordId);
/** 追加排除（可选，逗号/空白分隔；支持 `recordId` 或 `fileId:recordId`）。只能追加，不能移除冻结项。 */
const EXTRA_EXCLUSION_RAW = String(process.env.WPS_SYNC_EXCLUDE_EXTRA || '').trim();
const EXTRA_EXCLUSION_IDS = EXTRA_EXCLUSION_RAW ? EXTRA_EXCLUSION_RAW.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean) : [];

/** 是否为排除记录。@returns {{excluded:boolean, reason:string}} */
function checkExcluded(recordId, fileId) {
  const id = String(recordId);
  const hit = FROZEN_EXCLUSIONS.find((x) => x.recordId === id);
  if (hit) return { excluded: true, reason: `FROZEN_EXCLUSION(${hit.recordId}): ${hit.reason}` };
  if (EXTRA_EXCLUSION_IDS.includes(id) || EXTRA_EXCLUSION_IDS.includes(`${fileId}:${id}`)) {
    return { excluded: true, reason: 'EXTRA_EXCLUSION(env WPS_SYNC_EXCLUDE_EXTRA)' };
  }
  return { excluded: false, reason: '' };
}

// ============================================================
// 值规范化
// ============================================================

const PSEUDO_EMPTY = new Set(['nan', 'null', 'none', 'undefined', '--', '-', '无', '']);
const norm = (v) => String(v ?? '').trim();
const isPseudoEmpty = (v) => v === null || v === undefined || PSEUDO_EMPTY.has(norm(v).toLowerCase());
const isUrl = (v) => /^https?:\/\//i.test(norm(v));

/** '2026年09月01日' | '2026-09-01' | '2026-09-01 15:27' | '2026/9/1' | Date → 'YYYY-MM-DD'；不可解析 → null。
 *  取本地日期分量（禁 toISOString，防 UTC 偏 8 小时）。与历史同步口径逐字节一致。 */
function toIsoDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return null;
}

/**
 * WPS 记录 fields → canonical DTO（**唯一写入口径**）。
 *
 * 值处理规则（WPS-PG-SYNC-02，基于真机实测的存量数据形态制定）：
 *   1. 真空白（WPS 中不存在该字段）      → 键不出现（PG 保持原值）
 *   2. 真空串（null / '' / 纯空白）        → null（用户主动清空，显式写 null）
 *   3. 伪空占位符（nan / -- / - / 无 …）  → **键省略** + warning，绝不把占位符写成 NULL
 *      真机依据：存量 PG 有 1238 行 violator_name/gender/age = `'--'`（历史占位符），
 *      若按「伪空→NULL」处理，任何一次真实 UPDATE 都会把这些历史值抹成 NULL（数据降级）。
 *      省略键 ⇒ 新记录取列默认 NULL（与冻结口径一致）；存量行保留历史原文（fail-safe）。
 *   4. 日期列                            → YYYY-MM-DD（不可解析 → null）
 *   5. 图片列                            → 仅合法 http(s) URL 才写入；非 URL 值键省略 + warning
 *      真机依据：存量 PG 的 image_content/rectified_photo 有 1700+ 行为 `/uploads/grid-inspection/...`
 *      站内相对路径，按「非 http(s)→NULL」处理会抹掉既有引用。
 *   6. 其余                               → trim 后原样写入
 *
 * 绝不产出 grid_id / inspector_employee_id（受保护列硬断言）。
 */
function toCanonicalDto(fields) {
  const f = fields || {};
  const dto = {};
  const warnings = [];
  for (const p of SYNC_PROJECTION) {
    if (!(p.wps in f)) continue;                                  // 规则 1
    const raw = f[p.wps];
    if (raw === null || raw === undefined) { dto[p.pg] = null; continue; } // 规则 2
    if (p.tf === 'date') { dto[p.pg] = toIsoDate(raw); continue; }         // 规则 4
    const s = norm(raw);
    if (s === '') { dto[p.pg] = null; continue; }                          // 规则 2
    if (PSEUDO_EMPTY.has(s.toLowerCase())) {                               // 规则 3
      warnings.push(`${p.wps} 伪空占位符 "${s}"：省略 ${p.pg}（保留 PG 现值，不写 NULL）`);
      continue;
    }
    if (SYNC_URL_COLUMNS.includes(p.pg) && !isUrl(s)) {                    // 规则 5
      warnings.push(`${p.wps} 非 http(s) 值：省略照片字段 ${p.pg}（保留 PG 现值，绝不置空）: "${s.slice(0, 40)}"`);
      continue;
    }
    dto[p.pg] = s;
  }
  // 防御：任何情况下都不得产出受保护列
  for (const col of PROTECTED_COLUMNS) delete dto[col];
  return { dto, warnings };
}

/**
 * 冻结 hash 投影（**仅用于 sync_hash 变更检测**）。
 * 口径与历史 wpsGridSyncService.wpsToPg + canonicalHash 逐字节一致（''→null，不做伪空/URL 过滤），
 * 以保证既有 2061 条 grid_record_sync_map.sync_hash 继续命中「未变更」。
 */
function toLegacyHashDict(fields) {
  const f = fields || {};
  const d = {};
  for (const p of SYNC_PROJECTION) {
    if (!p.hash) continue;
    if (!(p.wps in f)) continue;
    const raw = f[p.wps];
    if (raw === null || raw === undefined) { d[p.pg] = null; continue; }
    const s = String(raw).trim();
    if (p.tf === 'date') { d[p.pg] = toIsoDate(s); continue; }
    d[p.pg] = s === '' ? null : s;
  }
  return d;
}

/** 变更检测哈希：18 个冻结列固定顺序、''≡null 的 SHA-256 */
function canonicalHash(dictOrRow) {
  const parts = [];
  for (const p of SYNC_PROJECTION) {
    if (!p.hash) continue;
    let v = dictOrRow ? dictOrRow[p.pg] : undefined;
    if (p.tf === 'date') v = toIsoDate(v);
    if (v === null || v === undefined || String(v).trim() === '') v = null;
    else v = String(v).trim();
    parts.push(`${p.pg}=${v === null ? '' : v}`);
  }
  return crypto.createHash('sha256').update(parts.join('|'), 'utf8').digest('hex');
}

/** 字段级比较：DTO 与 PG 现行行是否一致（仅比较 DTO 中出现的投影列） */
function dtoEqualsPgRow(dto, pgRow) {
  for (const col of Object.keys(dto)) {
    if (!SYNC_PROJECTION.some((p) => p.pg === col)) continue;
    const a = dto[col] === null || dto[col] === undefined ? null : String(dto[col]).trim();
    const b = pgRow[col] === null || pgRow[col] === undefined ? null : String(pgRow[col]).trim();
    if (a !== b) return false;
  }
  return true;
}

// ============================================================
// Schema 就绪校验（只读，零 DDL）
// ============================================================

async function assertSchemaReady() {
  // 只读 Existence 校验（search_path 感知，兼容 pg_temp 隔离测试）；**零 DDL**
  const r = await pool.query(
    `SELECT to_regclass('grid_inspection_records') AS a, to_regclass('grid_record_sync_map') AS b`
  );
  const row = r.rows[0] || {};
  const missing = [];
  if (!row.a) missing.push('grid_inspection_records');
  if (!row.b) missing.push('grid_record_sync_map');
  if (missing.length) {
    const e = new Error(`Pull Engine 前置校验失败：缺少表 ${missing.join(', ')}（本引擎禁止自动 DDL，请人工建表）`);
    e.code = 'SCHEMA_NOT_READY';
    throw e;
  }
  // 幂等键唯一约束必须存在（缺失即视为结构漂移，fail-closed）
  const idx = await pool.query(
    `SELECT indexdef FROM pg_indexes
      WHERE schemaname = current_schema() AND tablename = 'grid_record_sync_map'
        AND indexdef ILIKE '%(wps_record_id, wps_file_id)%'`
  );
  if (!idx.rows.length) {
    const e = new Error('Pull Engine 前置校验失败：grid_record_sync_map 缺少 UNIQUE(wps_record_id, wps_file_id)');
    e.code = 'IDEMPOTENCY_KEY_MISSING';
    throw e;
  }
  return true;
}

// ============================================================
// 写操作（全部受保护列硬断言）
// ============================================================

function assertNoProtectedColumns(cols) {
  const bad = cols.filter((c) => PROTECTED_COLUMNS.includes(c));
  if (bad.length) {
    const e = new Error(`Pull Engine 安全违规：试图写入受保护列 ${bad.join(', ')}（inspector_employee_id / grid_id 为 PG 权威字段）`);
    e.code = 'PROTECTED_COLUMN_WRITE_FORBIDDEN';
    throw e;
  }
}

function assertNoPgDelete(stats) {
  if (stats.pgDeleted !== 0 || stats.pgDeletedCatchUp !== 0) {
    const e = new Error(`Pull Engine 安全违规：pgDeleted=${stats.pgDeleted}（必须恒为 0）`);
    e.code = 'PG_DELETE_FORBIDDEN';
    throw e;
  }
}

/** 新记录：单事务 INSERT 业务行 + INSERT 映射行 */
async function insertWithMap(dto, wpsRecordId, wpsFileId, wpsSheetId, syncHash) {
  const cols = Object.keys(dto);
  if (!cols.length) return { status: 'SKIPPED_EMPTY_DTO' };
  assertNoProtectedColumns(cols);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existed = await client.query(
      'SELECT pg_record_id FROM grid_record_sync_map WHERE wps_record_id = $1 AND wps_file_id = $2 FOR SHARE',
      [wpsRecordId, wpsFileId]
    );
    if (existed.rows.length > 0) {
      await client.query('ROLLBACK');
      return { status: 'ALREADY_EXISTS', pgRecordId: existed.rows[0].pg_record_id };
    }
    const vals = cols.map((c) => dto[c] ?? null);
    const ph = cols.map((_, i) => `$${i + 1}`);
    const ins = await client.query(
      `INSERT INTO grid_inspection_records (${cols.join(', ')}) VALUES (${ph.join(', ')}) RETURNING id`,
      vals
    );
    const pgId = ins.rows[0].id;
    await client.query(
      `INSERT INTO grid_record_sync_map
         (pg_record_id, wps_record_id, wps_file_id, wps_sheet_id, last_sync_at, pg_updated_at, wps_updated_at, sync_hash, conflict)
       VALUES ($1, $2, $3, $4, NOW(), NOW(), NOW(), $5, false)`,
      [pgId, wpsRecordId, wpsFileId, wpsSheetId, syncHash]
    );
    await client.query('COMMIT');
    return { status: 'SUCCESS', pgRecordId: pgId };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err && err.code === '23505') return { status: 'ALREADY_EXISTS', error: 'unique_violation' };
    return { status: 'FAILED', error: err && (err.message || String(err)) };
  } finally {
    client.release();
  }
}

/** 已有记录：仅更新非身份/非权限/非网格的业务列；受保护列硬断言；业务行 + 映射行同事务 */
async function updateBusinessColumns(pgId, dto, wpsRecordId, syncHash) {
  const cols = Object.keys(dto);
  assertNoProtectedColumns(cols);
  if (!cols.length) return { status: 'SKIPPED_EMPTY_DTO' };
  const sets = cols.map((c, i) => `${c} = $${i + 1}`);
  const params = cols.map((c) => dto[c] ?? null);
  params.push(pgId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE grid_inspection_records SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${cols.length + 1}`,
      params
    );
    await client.query(
      `UPDATE grid_record_sync_map SET last_sync_at = NOW(), pg_updated_at = NOW(), sync_hash = $3, conflict = false
        WHERE pg_record_id = $1 AND wps_record_id = $2`,
      [pgId, wpsRecordId, syncHash]
    );
    await client.query('COMMIT');
    return { status: 'SUCCESS' };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    return { status: 'FAILED', error: e.message };
  } finally {
    client.release();
  }
}

/** 仅重基线 sync_map.sync_hash（业务行零变更时使用，保持哈希有意义） */
async function rebaselineHash(pgId, wpsRecordId, syncHash) {
  await pool.query(
    `UPDATE grid_record_sync_map SET sync_hash = $3, last_sync_at = NOW() WHERE pg_record_id = $1 AND wps_record_id = $2`,
    [pgId, wpsRecordId, syncHash]
  );
}

// ============================================================
// 并发保护（进程内互斥）
// ============================================================
let pullRunning = false;

// ============================================================
// 主入口：pullWpsToPg
// ============================================================
/**
 * WPS → PG 单向拉取。
 * @param {object} opts
 *   - dryRun {boolean} 只读干跑（零 INSERT/UPDATE/DELETE、零 WPS 写）
 *   - limit  {number}  最多处理 N 条（>0 生效）
 *   - fileId / sheetId {string|number} 记录元信息；若与配置不一致则 fail-closed 抛错
 * @returns 统计报告（含 dryRun 明细）
 */
async function pullWpsToPg(opts = {}) {
  const dryRun = !!opts.dryRun;
  const limit = Number.isFinite(Number(opts.limit)) && Number(opts.limit) > 0 ? Math.floor(Number(opts.limit)) : 0;
  const fileId = opts.fileId === undefined || opts.fileId === null || opts.fileId === '' ? wps.CONF.fileId : String(opts.fileId);
  const sheetId = opts.sheetId === undefined || opts.sheetId === null || opts.sheetId === '' ? wps.CONF.sheetId : Number(opts.sheetId);

  const stats = {
    direction: 'wps->pg',
    dryRun,
    enabled: isEnabled(),
    fileId,
    sheetId,
    // —— 计数 ——
    pulled: 0,
    inserted: 0,
    updated: 0,
    skippedUnchanged: 0,
    skippedExcluded: 0,
    skippedUnbound: 0,
    conflicts: 0,
    wpsDeleted: 0,
    pgDeleted: 0,
    pgDeletedCatchUp: 0,
    hashRebaselined: 0,
    // —— dry run / 诊断明细 ——
    totalWps: 0,
    alreadyExists: 0,
    newCandidates: 0,
    changedCandidates: 0,
    excluded: 0,
    unbound: 0,
    gridNull: 0,
    inspectorNull: 0,
    bt: 0,
    ea: 0,
    errors: [],
    imageWarnings: [],
    excludedDetail: [],
    unboundDetail: [],
    wpsDeletedDetail: [],
  };

  if (!isEnabled()) {
    return { ...stats, skipped: true, reason: 'DISABLED（WPS_GRID_SYNC !== true / 凭证未配置 / DB 未连接）' };
  }
  if (fileId !== wps.CONF.fileId || Number(sheetId) !== Number(wps.CONF.sheetId)) {
    const e = new Error(`fileId/sheetId 与配置不一致（请求 ${fileId}/${sheetId} ≠ 配置 ${wps.CONF.fileId}/${wps.CONF.sheetId}），拒绝执行`);
    e.code = 'FILE_MISMATCH';
    throw e;
  }
  if (pullRunning) {
    return { ...stats, skipped: true, reason: 'ALREADY_RUNNING（同一时刻只允许一个 Pull）' };
  }
  pullRunning = true;

  try {
    await assertSchemaReady();

    const records = await wps.listAllRecords({ pageSize: 200 });
    stats.totalWps = records.length;
    const seenWpsIds = new Set(records.map((r) => String(r.id)));

    // 映射表 + PG 现行行（一次读入；2061 量级）
    const mapRows = (await pool.query(
      'SELECT id, pg_record_id, wps_record_id, wps_file_id, sync_hash, conflict FROM grid_record_sync_map'
    )).rows;
    const mapByKey = new Map();
    const dupKeys = new Set();
    for (const m of mapRows) {
      const k = `${m.wps_record_id}|${m.wps_file_id}`;
      if (mapByKey.has(k)) dupKeys.add(k);
      mapByKey.set(k, m);
    }
    stats.conflicts = dupKeys.size;

    const pgIds = [...new Set(mapRows.map((m) => Number(m.pg_record_id)).filter((n) => Number.isFinite(n)))];
    // 日期列用 to_char 取本地日期分量（node-pg 会把 date 还原为 JS Date / 受时区影响，直接字符串比较会假报全变更）
    const proj = SYNC_PROJECTION.map((p) => (p.tf === 'date' ? `to_char(${p.pg}, 'YYYY-MM-DD') AS ${p.pg}` : p.pg));
    const pgRows = pgIds.length
      ? (await pool.query(`SELECT id, ${proj.join(', ')} FROM grid_inspection_records WHERE id = ANY($1::int[])`, [pgIds])).rows
      : [];
    const pgById = new Map(pgRows.map((r) => [Number(r.id), r]));

    const processList = limit > 0 ? records.slice(0, limit) : records;

    for (const rec of processList) {
      stats.pulled++;
      const rid = String(rec.id);
      const fields = rec.fields || {};
      try {
        // ① 排除名单（BT / EA）
        const ex = checkExcluded(rid, fileId);
        if (ex.excluded) {
          stats.skippedExcluded++;
          stats.excluded++;
          if (rid === 'BT') stats.bt++;
          if (rid === 'EA') stats.ea++;
          if (stats.excludedDetail.length < 50) stats.excludedDetail.push({ wps_record_id: rid, reason: ex.reason });
          continue;
        }

        // ② 规范化 DTO（唯一写入口径；不含 grid_id / inspector_employee_id）
        const { dto, warnings } = toCanonicalDto(fields);
        for (const w of warnings) if (stats.imageWarnings.length < 200) stats.imageWarnings.push(`wps记录 ${rid}: ${w}`);

        const hash = canonicalHash(toLegacyHashDict(fields));
        const key = `${rid}|${fileId}`;
        const mapped = mapByKey.get(key);

        // ③ 未映射 → 新增候选
        if (!mapped) {
          stats.newCandidates++;
          stats.inspectorNull++;              // 身份恒 fail-closed NULL
          stats.gridNull++;                   // 网格恒 fail-closed NULL（WPS 无可靠 grid 键）
          stats.unbound++;
          if (!dryRun) {
            const r = await insertWithMap(dto, rid, fileId, sheetId, hash);
            if (r.status === 'SUCCESS') stats.inserted++;
            else if (r.status === 'ALREADY_EXISTS') { stats.alreadyExists++; }
            else { stats.errors.push(`新增 ${rid}: ${r.status} ${r.error || ''}`); }
          } else {
            stats.inserted++;
          }
          continue;
        }

        // ④ 已映射但 PG 行不存在 → ORPHAN（不自动修复、不改绑、不删除）
        const pgRow = pgById.get(Number(mapped.pg_record_id));
        if (!pgRow) {
          stats.skippedUnbound++;
          if (stats.unboundDetail.length < 50) {
            stats.unboundDetail.push({ wps_record_id: rid, pg_record_id: mapped.pg_record_id, reason: 'ORPHAN: sync_map 指向的 PG 行不存在（保留映射，不自动修复）' });
          }
          continue;
        }

        stats.alreadyExists++;

        // ⑤ 变更检测：先哈希快路径，再字段级比较（权威）
        if (mapped.sync_hash && mapped.sync_hash === hash) { stats.skippedUnchanged++; continue; }
        if (dtoEqualsPgRow(dto, pgRow)) {
          stats.skippedUnchanged++;
          if (!dryRun) { await rebaselineHash(mapped.pg_record_id, rid, hash); stats.hashRebaselined++; }
          continue;
        }

        // ⑥ 真实变更 → UPDATE（仅业务列）
        stats.changedCandidates++;
        if (!dryRun) {
          const r = await updateBusinessColumns(mapped.pg_record_id, dto, rid, hash);
          if (r.status === 'SUCCESS') stats.updated++;
        } else {
          stats.updated++;
        }
      } catch (e) {
        stats.errors.push(`wps记录 ${rid}: ${e.message}`);
      }
    }

    // ⑦ WPS 端已消失：只统计，绝不删除 PG / sync_map
    for (const m of mapRows) {
      if (seenWpsIds.has(String(m.wps_record_id))) continue;
      stats.wpsDeleted++;
      if (stats.wpsDeletedDetail.length < 50) {
        stats.wpsDeletedDetail.push({ wps_record_id: m.wps_record_id, pg_record_id: m.pg_record_id });
      }
    }
    if (stats.wpsDeleted > 0) {
      console.warn(
        `[wps-pull] 检测到 ${stats.wpsDeleted} 条映射记录的 WPS 源已不存在；` +
        `冻结策略=保留 PG 历史（pgDeleted 恒 0，绝不物理删除 PG / sync_map）`
      );
    }

    assertNoPgDelete(stats);
    stats.ok = stats.errors.length === 0;
    return stats;
  } finally {
    pullRunning = false;
  }
}

// ============================================================
// 内部入口别名（兼容历史调用点）；语义与 pullWpsToPg 完全等价
// ============================================================
async function pullFromWps(opts = {}) {
  return pullWpsToPg(opts);
}

module.exports = {
  // 常量 / 配置
  SYNC_ENABLED,
  REVERSE_WRITE_ENABLED,
  FROZEN_EXCLUSIONS,
  PROTECTED_COLUMNS,
  SYNC_HASH_COLUMN_COUNT,
  isEnabled,
  checkExcluded,
  // 纯函数（供仓储 / 迁移复用）
  toIsoDate,
  toCanonicalDto,
  toLegacyHashDict,
  canonicalHash,
  // 执行
  pullWpsToPg,
  pullFromWps,
  assertSchemaReady,
  // 状态
  isRunning: () => pullRunning,
  status: () => ({
    enabled: isEnabled(),
    configured: wps.isConfigured(),
    syncEnabledByEnv: SYNC_ENABLED,
    reverseWriteEnabled: REVERSE_WRITE_ENABLED,
    // 兼容旧字段名（历史 status 契约）
    deleteSyncEnabled: false,
    running: pullRunning,
    fileId: wps.CONF.fileId,
    sheetId: wps.CONF.sheetId,
    exclusions: FROZEN_EXCLUSIONS.map((x) => x.recordId),
  }),
};

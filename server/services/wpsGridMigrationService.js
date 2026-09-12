/**
 * Sprint-WPS-03-B：A段 327 条历史数据正式迁移服务（专用事务路径）
 *
 * 铁律：
 * - migrationScope = A_ONLY（代码级硬保护，非参数依赖）
 * - 幂等键唯一 = wps_record_id + wps_file_id（varchar，严禁 Number 化）
 * - 禁用 serial_no/姓名/日期/组合字段/WPS行号 作幂等键
 * - 不复用 wpsGridSyncService 的非事务写入路径，不使用 bindMap()
 * - 每条记录独立事务：BEGIN → INSERT grid_inspection_records RETURNING id
 *   → INSERT grid_record_sync_map（纯 INSERT，无 ON CONFLICT DO UPDATE）→ COMMIT
 *   任一步失败 ROLLBACK，禁止半成功状态
 * - inspectorEmployeeId / violatorEmployeeId 一律不写入（Batch 3 / RESERVED）
 * - 脏值原样保留，不清洗；"nan" → NULL
 * - 仅合法 http(s) URL 进入照片字段；不解析 DISPIMG
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const wps = require('./wpsClient');
// 复用现有同步服务的纯函数（wpsToPg/canonicalHash），保证 sync_hash 语义与现有 WPS↔PG 同步完全一致。
// 仅用其纯函数，不触碰其 pool/同步流程（isEnabled/SYNC_ENABLED 状态不受影响）。
const sync = require('./wpsGridSyncService');

const MIGRATION_SCOPE = 'A_ONLY';
const EXPECTED_CANDIDATES = 327;
const PSEUDO_EMPTY = new Set(['nan', 'NaN', 'NULL', 'null', 'None', 'undefined', '--', '-', '无', '']);

const norm = (v) => String(v ?? '').trim();
const isPseudoEmpty = (v) => v === null || v === undefined || PSEUDO_EMPTY.has(norm(v));
const isUrl = (v) => /^https?:\/\//i.test(norm(v));

/** WPS 全量读取 + A 段候选推导（与 Sprint-WPS-03-A v2 完全同口径） */
async function deriveCandidates(wpsClient) {
  const all = await (wpsClient || wps).listAllRecords({ pageSize: 200 });
  const g = (r, f) => norm((r.fields || {})[f]);
  const bandOf = (r) => { const d = g(r, '日期'); return /^2026-09-0[1-6]/.test(d) ? 'A' : /^2026-08/.test(d) ? 'B' : 'C'; };
  const bandCount = { A: 0, B: 0, C: 0 };
  all.forEach((r) => bandCount[bandOf(r)]++);
  const aBand = all.filter((r) => bandOf(r) === 'A');
  // A 段保护性重复检查（组合A：姓名+日期+三违行为+违章人姓名），疑似重复排除（→C 段人工池）
  const dupMap = new Map();
  aBand.forEach((r) => {
    const k = [g(r, '姓名'), g(r, '日期').slice(0, 10), g(r, '三违行为'), g(r, '违章人姓名')].join('|');
    if (!dupMap.has(k)) dupMap.set(k, []);
    dupMap.get(k).push(r.id);
  });
  const dupIdsInA = new Set([...dupMap.entries()].filter(([, v]) => v.length > 1).flatMap(([, v]) => v));
  const candidates = aBand.filter((r) => !dupIdsInA.has(r.id));
  return { all, bandCount, aBand, candidates, excludedDups: aBand.filter((r) => dupIdsInA.has(r.id)) };
}

// WPS-PG-SYNC-02：字段映射不再在此文件重复声明 —— 全部取自唯一真源 services/wps/wpsFieldMap.js。
// 语义与历史字面量完全等价（集合相同；顺序仅影响 INSERT 列枚举顺序，不进 sync_hash）。
const { SYNC_PROJECTION, SYNC_URL_COLUMNS } = require('./wps/wpsFieldMap');
const PHOTO_KEY = { image_content: 'violationPhoto', rectified_photo: 'rectifiedPhoto', schematic: 'sketch' };
// 单独处理（日期/编号/违章人三列/照片列）不进入通用循环
const SPECIAL_PG = new Set(['inspection_date', 'serial_no', 'violator_name', 'violator_gender', 'violator_age', ...SYNC_URL_COLUMNS]);
/** 通用业务字段映射（WPS字段 → PG列） */
const FIELD_MAP = SYNC_PROJECTION.filter((p) => !SPECIAL_PG.has(p.pg)).map((p) => [p.wps, p.pg]);
/** 照片链接镜像列 */
const PHOTO_MAP = SYNC_PROJECTION.filter((p) => SYNC_URL_COLUMNS.includes(p.pg)).map((p) => [p.wps, p.pg, PHOTO_KEY[p.pg]]);

/** 单条 WPS 记录 → 迁移 DTO（严格沿用 v2 规则；不清洗、不猜测） */
function buildDto(r, pgCols, rosterMap) {
  const f = r.fields || {};
  const g = (k) => norm(f[k]);
  const colMap = new Map(pgCols.map((c) => [c.column_name, c]));
  const warnings = [];
  const target = {};
  const source = {};

  // 日期（仅 DTO 标准化，WPS 原值不动）
  const rawDate = g('日期');
  const m = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  target.inspection_date = m ? `${m[1]}-${m[2]}-${m[3]}` : null;
  source['日期'] = rawDate;

  // 编号：原值保留，不作幂等键
  target.serial_no = g('编号') || null;
  source['编号'] = g('编号');

  // 通用映射 + 伪空值 → NULL（"nan" 不入库）
  for (const [wf, pgc] of FIELD_MAP) {
    source[wf] = g(wf);
    target[pgc] = colMap.has(pgc) && !isPseudoEmpty(source[wf]) ? source[wf] : null;
  }

  // 违章人（姓名/性别/年龄；脏值原样保留仅告警，PG 均为 varchar）
  source['违章人姓名'] = g('违章人姓名');
  target.violator_name = isPseudoEmpty(source['违章人姓名']) ? null : source['违章人姓名'];
  for (const [wf, pgc] of [['违章人性别', 'violator_gender'], ['违章人年龄', 'violator_age']]) {
    const v = g(wf); source[wf] = v;
    if (isPseudoEmpty(v)) { target[pgc] = null; continue; }
    const bad = pgc === 'violator_gender' ? !['男', '女'].includes(v) : !/^\d{1,2}$/.test(v);
    if (bad) warnings.push(`${wf} 脏值原样保留: "${v}"`);
    target[pgc] = v; // varchar 列，原值写入
  }

  // 图片：仅合法 http(s) URL 进入目标；非 URL 置 NULL 不伪装
  const attachments = {};
  for (const [wf, pgc, key] of PHOTO_MAP) {
    const v = g(wf); attachments[key] = { raw: v, isUrl: isUrl(v) };
    target[pgc] = isUrl(v) ? v : null;
    if (!isPseudoEmpty(v) && !isUrl(v)) warnings.push(`${wf} 非URL值不写入照片字段: "${v.slice(0, 30)}"`);
  }

  // 身份边界：一律不写（PG 亦无对应列，双重保险）
  const inspectorName = g('姓名');
  const ros = rosterMap ? rosterMap.get(inspectorName) : null;
  const matchType = !inspectorName ? 'empty' : !ros ? 'none' : ros.n === 1 ? 'unique' : 'multiple';
  if (matchType === 'multiple') warnings.push(`巡查人员多人匹配(${ros.ids})，inspectorEmployeeId 不回填，等待 Batch 3 人工确认`);
  else if (matchType === 'none') warnings.push('巡查人员无花名册匹配，inspectorEmployeeId 不回填，等待 Batch 3 人工确认');
  else if (matchType === 'empty') warnings.push('巡查人员姓名为空，inspectorEmployeeId 不回填');
  const identity = {
    inspectorName,
    matchType,
    candidateIds: matchType === 'unique' ? [Number(ros.ids)] : matchType === 'multiple' ? ros.ids.split(',').map(Number) : [],
    inspectorEmployeeId: 'NOT_FILLED（Batch 3 人工确认后回填）',
    violatorEmployeeId: 'RESERVED（不自动绑定）',
  };

  // INSERT 列（仅 PG 实际存在的列；photo 列源空即 NULL）
  const insertCols = [...FIELD_MAP.map(([, c]) => c), 'violator_name', 'violator_gender', 'violator_age', 'inspection_date', 'serial_no', ...PHOTO_MAP.map(([, c]) => c)]
    .filter((c, i, arr) => arr.indexOf(c) === i && colMap.has(c));

  // sync_hash = 现有同步服务的 canonicalHash(wpsToPg(原始字段))——与上行同步对账口径逐字节一致，
  // 未来 WPS_GRID_SYNC 重开时上行对账可直接命中"unchanged 跳过"。批次号不入 sync_hash（仅审计产物）。
  const pgDict = sync.wpsToPg(f);
  const syncHash = sync.canonicalHash(pgDict);

  return { wpsRecordId: String(r.id), source, target, attachments, identity, warnings, insertCols, syncHash, hashScopeFields: sync.FIELD_MAP.length };
}

/** 权威幂等预检（键 = wps_record_id + wps_file_id） */
async function classifyIdempotency(pool, candidates, fileId) {
  const ids = candidates.map((r) => String(r.id));
  const hits = (await pool.query('SELECT pg_record_id, wps_record_id, wps_file_id FROM grid_record_sync_map WHERE wps_record_id = ANY($1::text[])', [ids])).rows;
  const byId = new Map();
  hits.forEach((h) => { if (!byId.has(h.wps_record_id)) byId.set(h.wps_record_id, []); byId.get(h.wps_record_id).push(h); });
  const pgExist = new Set((await pool.query('SELECT id FROM grid_inspection_records')).rows.map((r) => String(r.id)));
  const result = { NOT_EXISTS: [], ALREADY_EXISTS: [], CONFLICT: [], ORPHAN: [] };
  for (const cid of ids) {
    const hs = byId.get(cid);
    if (!hs || hs.length === 0) { result.NOT_EXISTS.push(cid); continue; }
    const sameFile = hs.filter((h) => h.wps_file_id === fileId);
    if (hs.length !== sameFile.length || hs.length > 1) { result.CONFLICT.push(cid); continue; }
    const h = sameFile[0];
    if (h.pg_record_id == null || !pgExist.has(String(h.pg_record_id))) result.ORPHAN.push(cid);
    else result.ALREADY_EXISTS.push(cid);
  }
  return result;
}

/**
 * 单条迁移（独立事务）：
 * BEGIN → 事务内幂等预检(wps_record_id+wps_file_id) → INSERT grid_inspection_records RETURNING id
 *       → INSERT grid_record_sync_map（纯 INSERT，无 ON CONFLICT DO UPDATE，
 *          sync_hash = canonicalHash(wpsToPg(原始字段))，与现有同步语义一致）→ COMMIT
 * 事务内预检命中已存在映射 → ROLLBACK 返回 ALREADY_EXISTS（跳过，不改绑）
 * sync_map 唯一键冲突（并发兜底）→ ROLLBACK 并重读判定，禁止改绑
 * migrationBatchId 仅作返回值/审计产物，绝不写入 sync_hash
 */
async function migrateRecord(pool, dto, fileId, sheetId, batchId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // 事务内幂等预检：已存在映射 → 本事务放弃写入（单边 PG 成功不可能发生）
    const existed = await client.query(
      'SELECT pg_record_id FROM grid_record_sync_map WHERE wps_record_id = $1 AND wps_file_id = $2 FOR SHARE',
      [dto.wpsRecordId, fileId]
    );
    if (existed.rows.length > 0) {
      await client.query('ROLLBACK');
      return { status: 'ALREADY_EXISTS', pgRecordId: existed.rows[0].pg_record_id, error: 'mapped_inside_transaction' };
    }
    const cols = dto.insertCols;
    const vals = cols.map((c) => dto.target[c] ?? null);
    const ph = cols.map((_, i) => `$${i + 1}`);
    const ins = await client.query(
      `INSERT INTO grid_inspection_records (${cols.join(', ')}) VALUES (${ph.join(', ')}) RETURNING id`,
      vals
    );
    const pgId = ins.rows[0].id;
    await client.query(
      `INSERT INTO grid_record_sync_map (pg_record_id, wps_record_id, wps_file_id, wps_sheet_id, last_sync_at, pg_updated_at, wps_updated_at, sync_hash, conflict)
       VALUES ($1, $2, $3, $4, NOW(), NOW(), NOW(), $5, false)`,
      [pgId, dto.wpsRecordId, fileId, sheetId, dto.syncHash]
    );
    await client.query('COMMIT');
    return { status: 'SUCCESS', pgRecordId: pgId, migrationBatchId: batchId || null, syncHash: dto.syncHash };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err && err.code === '23505') {
      // sync_map 唯一键冲突 → 按幂等逻辑重新读取判定，禁止改绑
      const cur = await pool.query('SELECT pg_record_id FROM grid_record_sync_map WHERE wps_record_id = $1 AND wps_file_id = $2', [dto.wpsRecordId, fileId]);
      return { status: cur.rows.length ? 'ALREADY_EXISTS' : 'CONFLICT', error: 'unique_violation', detail: err.detail };
    }
    return { status: 'FAILED', error: err && (err.message || String(err)) };
  } finally {
    client.release();
  }
}

/** 迁移前快照 */
async function snapshot(pool) {
  const g = (await pool.query('SELECT COUNT(*)::int n, COALESCE(MAX(id),0)::int maxid FROM grid_inspection_records')).rows[0];
  const aug = (await pool.query("SELECT COUNT(*)::int n FROM grid_inspection_records WHERE inspection_date >= '2026-08-01' AND inspection_date < '2026-09-01'")).rows[0].n;
  const sep = (await pool.query("SELECT COUNT(*)::int n FROM grid_inspection_records WHERE inspection_date >= '2026-09-01'")).rows[0].n;
  const mapN = (await pool.query('SELECT COUNT(*)::int n FROM grid_record_sync_map')).rows[0].n;
  const fileDist = (await pool.query('SELECT wps_file_id, COUNT(*)::int n FROM grid_record_sync_map GROUP BY 1 ORDER BY 1')).rows;
  return { at: new Date().toISOString(), grid: { count: g.n, maxId: g.maxid, month2026_08: aug, month2026_09: sep }, syncMap: { count: mapN, fileIdDist: fileDist } };
}

/**
 * 安全门（DRY_RUN / EXECUTE 共用）
 *
 * phase 自动判定（首次执行与失败重试分离，重试不被 327 硬门阻断）：
 * - first:    ALREADY_EXISTS=0 且 NOT_EXISTS=327 → 首次 EXECUTE，要求全量未映射
 * - retry:    0 < NOT_EXISTS < 327（部分成功后的重跑）→ 只处理 NOT_EXISTS 动态子集，
 *             仅要求 A_ONLY 总范围仍为 327（NOT_EXISTS+ALREADY_EXISTS=327 完整性）
 * - all_done: NOT_EXISTS=0 且 ALREADY_EXISTS=327 → 无待处理，非错误
 *
 * 硬保护（无论何种 phase）：
 * - A_ONLY_TOTAL 必须 = 327（总范围不变）
 * - 候选混入非 A 段 → 阻断；CONFLICT>0 / ORPHAN>0 → 阻断
 * - WPS_GRID_SYNC=true → 阻断（只检查，不修改 .env）
 */
function checkGates(ctx) {
  const errors = [];
  if (MIGRATION_SCOPE !== 'A_ONLY') errors.push(`migrationScope=${MIGRATION_SCOPE} != A_ONLY`);
  if (ctx.candidates.length !== EXPECTED_CANDIDATES) errors.push(`A_ONLY_TOTAL=${ctx.candidates.length} != ${EXPECTED_CANDIDATES}（历史迁移总范围变化，阻断）`);
  const contaminated = ctx.candidates.filter((r) => ctx.bandOf(r) !== 'A');
  if (contaminated.length > 0) errors.push(`候选集混入非A段记录 ${contaminated.length} 条（B/C 不得进入候选）`);
  if (ctx.idem.CONFLICT.length > 0) errors.push(`CONFLICT=${ctx.idem.CONFLICT.length} > 0`);
  if (ctx.idem.ORPHAN.length > 0) errors.push(`ORPHAN=${ctx.idem.ORPHAN.length} > 0`);
  // WPS 实时同步安全门：只检查并阻断，绝不自动关闭、不修改 .env
  if (String(ctx.wpsGridSync ?? '').trim().toLowerCase() === 'true') {
    errors.push('WPS_GRID_SYNC=true：实时同步开启期间禁止历史迁移（只检查不修改 .env，需人工关闭后重跑）');
  }
  const { NOT_EXISTS, ALREADY_EXISTS } = ctx.idem;
  let phase;
  if (NOT_EXISTS.length === 0 && ALREADY_EXISTS.length === ctx.candidates.length) phase = 'all_done';
  else if (ALREADY_EXISTS.length === 0 && NOT_EXISTS.length === EXPECTED_CANDIDATES) phase = 'first';
  else phase = 'retry';
  if (phase === 'first') {
    if (NOT_EXISTS.length !== EXPECTED_CANDIDATES) errors.push(`首次执行要求 NOT_EXISTS=${EXPECTED_CANDIDATES}，实际 ${NOT_EXISTS.length}`);
    if (ALREADY_EXISTS.length !== 0) errors.push(`首次执行要求 ALREADY_EXISTS=0，实际 ${ALREADY_EXISTS.length}`);
  } else if (phase === 'retry') {
    // 重试：完整性校验（CONFLICT/ORPHAN 已在上方阻断为 0，故二者之和必为 327）
    if (NOT_EXISTS.length + ALREADY_EXISTS.length !== ctx.candidates.length) {
      errors.push(`重试完整性异常: NOT_EXISTS(${NOT_EXISTS.length}) + ALREADY_EXISTS(${ALREADY_EXISTS.length}) != ${ctx.candidates.length}`);
    }
    if (NOT_EXISTS.length === 0) errors.push('重试态但 NOT_EXISTS=0（无待处理记录，应判定 all_done 而非 retry）');
  }
  return { pass: errors.length === 0, errors, phase, processSetSize: NOT_EXISTS.length };
}

/** 迁移批次号（写入 sync_map.sync_hash，无 DDL） */
function genBatchId() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `WPS03B-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

module.exports = { MIGRATION_SCOPE, EXPECTED_CANDIDATES, deriveCandidates, buildDto, classifyIdempotency, migrateRecord, snapshot, checkGates, genBatchId, norm };

/**
 * 网格长巡查台账 · WPS 同步服务（facade）
 *
 * 架构（WPS-PG-SYNC-02 收敛，2026-09-11）：
 *   历史遗留的「双向同步引擎」已被彻底收敛为**唯一单向 Pull Engine**：
 *
 *       services/wpsGridPullEngine.js   ← 唯一 WPS → PG 单向拉取实现（幂等/事务/排除/保护）
 *       services/wps/wpsFieldMap.js     ← 唯一字段真源（SYNC_PROJECTION）
 *       services/wpsGridSyncService.js  ← 本文件：兼容层（转发 + 反向写入硬封禁）
 *
 *   本文件**不再包含**任何字段映射字面量、任何写入逻辑、任何 DDL。
 *   反向写入（PG → WPS）恒封禁：pushRow / onPgRowChanged / onPgRowsDeleted 一律 no-op。
 *
 * 环境变量：
 *   WPS_GRID_SYNC         仅显式 'true' 才启用（未设置/'false'/''/其他值 一律 disabled）
 *   WPS_SYNC_DELETE       已失效（硬锁）：任何值都不得触发 PG 物理删除或 WPS 删除
 *   WPS_SYNC_PUSH_CUTOFF  已失效（下行推送能力已封禁）
 *   WPS_SYNC_EXCLUDE_EXTRA 仅可**追加** WPS 排除记录（无法移除 BT/EA 冻结排除）
 */
const wps = require('./wpsClient');
const engine = require('./wpsGridPullEngine');
const { SYNC_PROJECTION, SYNC_HASH_COLUMN_COUNT } = require('./wps/wpsFieldMap');

// ============================================================
// 兼容导出：冻结的 18 列 WPS → PG 投影（顺序与内容均不可变）
// ============================================================
// 历史消费方：
//   - services/wps/gridInspectionRepository.js（PG 列 → WPS 字段名兜底，含 检查日期 date 归一）
//   - services/wpsGridMigrationService.js（sync_hash 口径 == wpsToPg + canonicalHash）
// 注意：`FIELD_MAP.length` 为历史审计字段 `hashScopeFields` 的来源，必须保持 18。
const FIELD_MAP = SYNC_PROJECTION.filter((p) => p.hash).map((p) => ({ wps: p.wps, pg: p.pg, ...(p.tf ? { tf: p.tf } : {}) }));

/** 仅 WPS 侧存在，不回灌 PG（保留在 .dbt 供移动端查看） */
const WPS_ONLY_FIELDS = ['当日序号', '来源日期'];
/** 仅系统侧维护，不下发 WPS（PG 权威字段，同步引擎永不触碰） */
const PG_ONLY_COLUMNS = ['vehicle_type', 'report_status', 'violation_type_result', 'need_rectification', 'rectifier', 'grid_id', 'inspector_employee_id'];

const SYNC_ENABLED = engine.SYNC_ENABLED;
const REVERSE_WRITE_ENABLED = engine.REVERSE_WRITE_ENABLED;

function isEnabled() { return engine.isEnabled(); }
/** 反向写入（PG→WPS）是否可用：恒 false（硬锁） */
function isReverseWriteEnabled() { return REVERSE_WRITE_ENABLED === true; }

// ============================================================
// 纯函数转发（口径唯一实现在 Pull Engine / 字段真源）
// ============================================================
const toIsoDate = engine.toIsoDate;
/** WPS fields → PG 列字典（冻结 hash 口径，'' → null） */
const wpsToPg = engine.toLegacyHashDict;
/** 变更检测哈希（18 冻结列固定顺序、''≡null 的 SHA-256） */
const canonicalHash = engine.canonicalHash;

/** PG 原始行（snake_case）→ WPS 字段字典（全部映射字段，空值 → ''） */
function pgRowToWpsFields(row) {
  const f = {};
  for (const m of FIELD_MAP) {
    let v = row[m.pg];
    if (m.tf === 'date') v = toIsoDate(v);
    f[m.wps] = v === null || v === undefined ? '' : String(v).trim();
  }
  return f;
}

// ============================================================
// 表就绪：**只读校验**（WPS-PG-SYNC-02：Pull 路径禁止任何自动 DDL）
// ============================================================
/** @deprecated 名称保留以兼容历史调用；语义已改为只读断言，**不再执行 CREATE TABLE**。 */
async function ensureTables() { return engine.assertSchemaReady(); }

// ============================================================
// 方向 A：上行（WPS → PG）—— 唯一执行路径
// ============================================================
/**
 * 拉取 WPS 记录并同步进 PG（WPS → PG 单向）。
 * @param {object} opts { dryRun, limit, fileId, sheetId }
 */
async function pullFromWps(opts = {}) { return engine.pullWpsToPg(opts); }
const pullWpsToPg = engine.pullWpsToPg;

// ============================================================
// 方向 B：下行（PG → WPS）—— WPS-PG-SYNC-01/02 恒封禁（fail-closed）
// ============================================================
// 以下函数保留签名仅为兼容历史调用点，均不触达任何 WPS 写 API，亦不改动 PG。

/** 推送单条 PG 行到 WPS —— 已禁用。@returns {{disabled:true, reason:string}} */
async function pushRow(_row, _opts = {}) {
  console.warn('[wps-grid-sync] pushRow 已禁用（PG→WPS 反向写入封禁），请求被忽略');
  return { disabled: true, reason: 'REVERSE_WRITE_DISABLED' };
}

/** 桌面写入挂钩 —— 已禁用（no-op）。 */
function onPgRowChanged(row) {
  if (REVERSE_WRITE_ENABLED) return;
  if (row && row.id) console.warn(`[wps-grid-sync] onPgRowChanged(pg=${row.id}) 已禁用（PG→WPS 反向写入封禁），忽略`);
}

/** 桌面批量删除挂钩 —— 已禁用（no-op，不删 WPS，也不删 sync_map）。 */
async function onPgRowsDeleted(pgIds) {
  if (REVERSE_WRITE_ENABLED) return;
  if (Array.isArray(pgIds) && pgIds.length) {
    console.warn(`[wps-grid-sync] onPgRowsDeleted(${pgIds.length} 条) 已禁用（PG→WPS 反向写入封禁），忽略`);
  }
}

// ============================================================
// 对账：已单向化 —— 与 pullWpsToPg 完全等价（不再是旧双向 reconcile）
// ============================================================
/**
 * @param {object} opts { dryRun, limit }
 * @returns {{startedAt:string, direction:'wps->pg', pull:object, push:object, pgDeletedCatchUp:number, errors:string[]}}
 */
async function reconcile(opts = {}) {
  const report = {
    startedAt: new Date().toISOString(),
    direction: 'wps->pg',
    pull: null,
    push: { disabled: true, reason: 'REVERSE_WRITE_DISABLED', scanned: 0, pushed: 0, created: 0, updated: 0, skipped: 0, errors: [] },
    pgDeletedCatchUp: 0,
    errors: [],
  };
  report.pull = await engine.pullWpsToPg(opts);
  if (report.pull && Array.isArray(report.pull.errors)) report.errors.push(...report.pull.errors);
  return report;
}

// ============================================================
// 状态查询
// ============================================================
async function status() {
  const base = engine.status();
  const out = {
    ...base,
    deleteSyncEnabled: false, // 硬锁
    wpsFileIdForAudit: wps.CONF.fileId,
    hashScopeColumns: SYNC_HASH_COLUMN_COUNT,
  };
  try {
    const { pool } = require('../config/db');
    const [cnt, conflict] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS n FROM grid_record_sync_map'),
      pool.query('SELECT COUNT(*)::int AS n FROM grid_record_sync_map WHERE conflict = true'),
    ]);
    return { ...out, mappingCount: cnt.rows[0].n, conflicts: conflict.rows[0].n };
  } catch (e) {
    return { ...out, error: e.message };
  }
}

module.exports = {
  FIELD_MAP,
  WPS_ONLY_FIELDS,
  PG_ONLY_COLUMNS,
  SYNC_ENABLED,
  isEnabled,
  isReverseWriteEnabled,
  toIsoDate,
  wpsToPg,
  pgRowToWpsFields,
  canonicalHash,
  ensureTables,
  pullFromWps,
  pullWpsToPg,
  pushRow,
  onPgRowChanged,
  onPgRowsDeleted,
  reconcile,
  status,
};

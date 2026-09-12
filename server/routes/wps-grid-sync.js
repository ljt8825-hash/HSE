/**
 * WPS 多维表格 → 网格长巡查台账 单向 Pull 管理路由（WPS-PG-SYNC-02）
 *
 * 挂载：app.use('/api/wps-grid-sync', ...)（全局 JWT 保护，管理端点）
 * 方向：**仅** WPS → PG。PG→WPS 反向写入已于 WPS-PG-SYNC-01 下线、SYNC-02 保持封禁。
 *
 * 端点：
 *   GET  /status       同步状态（启用/凭证/映射数/冲突数/排除名单/哈希口径）
 *   POST /pull         WPS → PG 拉取；body { dryRun?:boolean, limit?:number }
 *                      · dryRun=true 只读干跑（零 INSERT/UPDATE/DELETE、零 WPS 写）
 *                      · dryRun=false 需 admin/system_admin（防误触全量生产写入）
 *   POST /reconcile    等价于 /pull（单向化后语义相同，保留兼容）
 *   POST /push         【已下线】PG→WPS 反向推送 → 410 REVERSE_WRITE_DISABLED
 *   GET  /mapping      映射表分页（page/pageSize）
 *   GET  /conflicts    冲突记录列表
 *   POST /trigger      调度器手动触发（等价单向 pull）
 *   POST /webhook      WPS Webhook 回调（预留：仅触发上行 pull）
 */
const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { success, error } = require('../middleware/response');
const svc = require('../services/wpsGridSyncService');
const scheduler = require('../services/wpsGridSyncScheduler');

const WRITE_ROLES = ['admin', 'system_admin'];

/** 非干跑的拉取（真实写 PG）仅允许管理员角色触发 */
function canWrite(req) {
  const role = req && req.user && req.user.role;
  return WRITE_ROLES.includes(role);
}

function buildOpts(req) {
  const b = req.body || {};
  const dryRun = !!b.dryRun;
  const limit = b.limit === undefined || b.limit === null || b.limit === '' ? 0 : Number(b.limit);
  return { dryRun, limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 0 };
}

function summarize(r) {
  if (!r || typeof r !== 'object') return r;
  return {
    direction: r.direction, dryRun: r.dryRun, skipped: r.skipped || false, reason: r.reason || '',
    pulled: r.pulled, inserted: r.inserted, updated: r.updated,
    skippedUnchanged: r.skippedUnchanged, skippedExcluded: r.skippedExcluded, skippedUnbound: r.skippedUnbound,
    conflicts: r.conflicts, wpsDeleted: r.wpsDeleted, pgDeleted: r.pgDeleted,
    totalWps: r.totalWps, alreadyExists: r.alreadyExists,
    newCandidates: r.newCandidates, changedCandidates: r.changedCandidates,
    excluded: r.excluded, unbound: r.unbound, gridNull: r.gridNull, inspectorNull: r.inspectorNull,
    bt: r.bt, ea: r.ea,
    errorCount: (r.errors || []).length,
    errors: (r.errors || []).slice(0, 20),
  };
}

// ========== GET /status ==========
router.get('/status', async (req, res) => {
  try {
    res.json(success(await svc.status(), '查询成功'));
  } catch (e) {
    res.json(error(-1, e.message));
  }
});

// ========== POST /pull（WPS → PG 唯一写入口）==========
router.post('/pull', async (req, res) => {
  try {
    if (!svc.isEnabled()) {
      return res.json(error(-2, '同步未启用（需 WPS 凭证齐备且 WPS_GRID_SYNC=true）', { code: 'SYNC_DISABLED' }));
    }
    const opts = buildOpts(req);
    if (!opts.dryRun && !canWrite(req)) {
      return res.status(403).json(error(403, '真实拉取（写 PG）仅允许管理员触发；如需预览请使用 dryRun=true', { code: 'ADMIN_REQUIRED' }));
    }
    const r = await svc.pullWpsToPg(opts);
    res.json(success(summarize(r), opts.dryRun ? '干跑完成（未落库）' : 'WPS → PG 单向同步完成'));
  } catch (e) {
    res.json(error(-1, e.message));
  }
});

// ========== POST /reconcile（单向化后与 /pull 等价）==========
router.post('/reconcile', async (req, res) => {
  try {
    if (!svc.isEnabled()) {
      return res.json(error(-2, '同步未启用（需 WPS 凭证齐备且 WPS_GRID_SYNC=true）', { code: 'SYNC_DISABLED' }));
    }
    const opts = buildOpts(req);
    if (!opts.dryRun && !canWrite(req)) {
      return res.status(403).json(error(403, '真实拉取（写 PG）仅允许管理员触发；如需预览请使用 dryRun=true', { code: 'ADMIN_REQUIRED' }));
    }
    const r = await svc.pullWpsToPg(opts);
    res.json(success(summarize(r), opts.dryRun ? '干跑完成（未落库）' : '对账完成（仅上行 WPS→PG）'));
  } catch (e) {
    res.json(error(-1, e.message));
  }
});

// ========== POST /push —— 已下线（PG→WPS 反向写入封禁）==========
router.post('/push', async (_req, res) => {
  return res
    .status(410)
    .json(error(410, 'PG→WPS 反向推送功能已下线（WPS-PG-SYNC-01/02 反向写入隔离）', { code: 'REVERSE_WRITE_DISABLED' }));
});

// ========== GET /mapping ==========
router.get('/mapping', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;
    const cnt = await pool.query('SELECT COUNT(*)::int AS total FROM grid_record_sync_map');
    const rows = await pool.query(
      'SELECT * FROM grid_record_sync_map ORDER BY pg_record_id LIMIT $1 OFFSET $2',
      [pageSize, offset]
    );
    res.json(success({ list: rows.rows, total: cnt.rows[0].total, page, pageSize }, '查询成功'));
  } catch (e) {
    res.json(error(-1, e.message));
  }
});

// ========== GET /conflicts ==========
router.get('/conflicts', async (req, res) => {
  try {
    const rows = await pool.query(
      'SELECT * FROM grid_record_sync_map WHERE conflict = true ORDER BY last_sync_at DESC LIMIT 200'
    );
    res.json(success({ list: rows.rows, total: rows.rows.length }, '查询成功'));
  } catch (e) {
    res.json(error(-1, e.message));
  }
});

// ========== POST /webhook（预留：WPS 回调，需公网可达；仅触发上行 pull）==========
router.post('/webhook', async (req, res) => {
  const secret = process.env.WPS_WEBHOOK_SECRET || '';
  console.log('[wps-pull] 收到 Webhook 回调:', JSON.stringify(req.body || {}).slice(0, 500));
  if (secret) {
    const provided = req.query.secret || req.get('x-wps-secret') || '';
    if (provided !== secret) return res.status(401).json({ code: 401, msg: 'invalid secret' });
  }
  // 立即应答，异步触发单向增量拉取（内部有 hash/字段级比对，只会同步真实变更）
  res.json({ code: 0, msg: 'ok' });
  svc.pullWpsToPg({}).catch((e) => console.error('[wps-pull] Webhook 触发拉取失败:', e.message));
});

// ========== POST /trigger（调度器手动触发，调试用；单向 pull）==========
// WPS-PG-SYNC-05-E-0 R3：手动触发与 /pull 真实写路径同权限（复用 canWrite，admin/system_admin），
// 非管理员 403。不改变引擎内部 fail-closed / 硬锁 / 排除 / 保护语义。
router.post('/trigger', async (req, res) => {
  try {
    if (!canWrite(req)) {
      return res.status(403).json(error(403, '手动触发仅允许管理员角色', { code: 'ADMIN_REQUIRED' }));
    }
    const r = await scheduler.runPull();
    res.json(success(summarize(r), '触发完成（仅上行 WPS→PG）'));
  } catch (e) {
    res.json(error(-1, e.message));
  }
});

module.exports = router;

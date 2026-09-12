/**
 * 三违管理考核 台账（web-naive · 二级菜单「三违管理」→ 三级「三违管理考核」）
 *   GET  /api/hse/violation-assessment/list?cycleId=&position=
 *       - 返回某考核周期 + 岗位（乡镇作业中心经理/管理员）的考核对象名单
 *       - 每人聚合三列扣分（从 hse_assessment_deduction 已落库生效值读取，只读）：
 *           网格长巡查考核 = kind 'grid_unchecked_monthly'
 *           三违巡查       = kind 'violation_event'
 *           三违信息填报   = kind 'violation_unrectified'
 *   GET  /api/hse/violation-assessment/config?cycleId=&position=
 *   PUT  /api/hse/violation-assessment/config
 *       - 读写「自定义动态列」（列名 + 每行数值），存 hse_sanwei_ledger_config（幂等建表）
 *
 * 边界：禁用「自动带出+可手改」——三固定列只读展示已落库生效分；自定义列由人工手填并持久化。
 * 不修改任何其它模块代码；扣分口径复用既有 scoring 引擎落库结果。
 */
const express = require('express');
const { pool } = require('../config/db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

// 三固定列 → hse_assessment_deduction.source_detail->>'kind' 映射
const KIND_MAP = {
  gridDeduct: 'grid_unchecked_monthly', // 网格长巡查考核
  violationDeduct: 'violation_event', // 三违巡查
  unrectifiedDeduct: 'violation_unrectified', // 三违信息填报
};
const KIND_VALUES = Object.values(KIND_MAP);

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * GET /list
 * query: cycleId (int), position ('乡镇作业中心经理' | '管理员')
 */
router.get(
  '/list',
  authMiddleware,
  requireRole('admin', 'safety_manager'),
  async (req, res) => {
    const cycleId = Number(req.query.cycleId);
    const position = String(req.query.position ?? '').trim();
    if (!Number.isInteger(cycleId) || cycleId <= 0) {
      return res.status(400).json({ success: false, code: 400, message: 'cycleId 参数无效' });
    }
    if (!['乡镇作业中心经理', '管理员'].includes(position)) {
      return res.status(400).json({ success: false, code: 400, message: 'position 需为 乡镇作业中心经理 或 管理员' });
    }
    try {
      // 1) 考核对象名单
      const tgt = await pool.query(
        `SELECT id, employee_id, employee_name, position, township, department
           FROM hse_assessment_target
          WHERE cycle_id = $1 AND position = $2 AND is_deleted = FALSE
          ORDER BY township, employee_name`,
        [cycleId, position],
      );

      // 2) 按人 × kind 聚合已落库生效扣分（join 到 target 取 employee_id）
      const ded = await pool.query(
        `SELECT t.employee_id, d.source_detail->>'kind' AS kind,
                SUM(COALESCE(d.confirmed_score, d.suggested_score, 0))::numeric AS s
           FROM hse_assessment_deduction d
           JOIN hse_assessment_target t ON t.id = d.target_id
          WHERE d.cycle_id = $1 AND d.is_deleted = FALSE
            AND COALESCE(d.review_status, '') <> 'rejected'
            AND d.source_detail->>'kind' = ANY($2::text[])
          GROUP BY t.employee_id, d.source_detail->>'kind'`,
        [cycleId, KIND_VALUES],
      );
      const dedMap = new Map(); // `${employeeId}::${kind}` -> 分数
      for (const r of ded.rows || []) {
        const key = `${String(r.employee_id)}::${r.kind}`;
        dedMap.set(key, round2(r.s));
      }

      // 3) 驾驶员三违：仅「乡镇作业中心经理」tab 回填；管理员无驾驶员归属，值为 0。
      //    口径 = 「驾驶员月度考核」本乡镇驾驶员当考月份「考核分数」列之和，
      //    考核分数 = 五项子项（三检/灯牌/灯具/监控/消防）合计 + 当月三违记录条数（复现前端 monthlyScore）。
      //    归属：驾驶员 department 与考核对象 township 经 regionBase 去后缀后按乡镇匹配。
      const drvByTown = new Map(); // regionBase(township) -> 合计分
      if (position === '乡镇作业中心经理') {
        const cyc = await pool.query(
          `SELECT assessment_year, assessment_month
             FROM hse_assessment_cycle WHERE id = $1 AND is_deleted = FALSE`,
          [cycleId],
        );
        const cycRow = cyc.rows[0];
        if (cycRow && cycRow.assessment_year != null) {
          const month = `${cycRow.assessment_year}-${String(cycRow.assessment_month).padStart(2, '0')}`;
          const dm = await pool.query(
            `WITH tv AS (
                SELECT trim(name) AS dname, COUNT(*)::int AS cnt
                  FROM driver_three_violation
                 WHERE left(violation_time, 7) = $1 AND is_deleted = FALSE AND trim(name) <> ''
                 GROUP BY trim(name)
             )
             SELECT d.department,
                    SUM(COALESCE(d.three_check_management,0) + COALESCE(d.lamp_dirty,0)
                        + COALESCE(d.lamp_failure,0) + COALESCE(d.safety_monitor,0)
                        + COALESCE(d.fire_management,0) + COALESCE(tv.cnt,0))::numeric AS s
               FROM driver_monthly d
               LEFT JOIN tv ON tv.dname = trim(d.name)
              WHERE d.month = $1 AND d.is_deleted = FALSE AND d.department <> ''
              GROUP BY d.department`,
            [month],
          );
          for (const r of dm.rows || []) {
            const base = regionBase(r.department);
            if (!base) continue;
            drvByTown.set(base, round2((drvByTown.get(base) || 0) + Number(r.s || 0)));
          }
        }
      }

      const rows = (tgt.rows || []).map((r) => {
        const ekey = String(r.employee_id);
        return {
          targetId: r.id,
          employeeId: r.employee_id,
          name: r.employee_name,
          position: r.position,
          township: r.township || '',
          department: r.department || '',
          gridDeduct: dedMap.get(`${ekey}::${KIND_MAP.gridDeduct}`) ?? 0,
          violationDeduct: dedMap.get(`${ekey}::${KIND_MAP.violationDeduct}`) ?? 0,
          unrectifiedDeduct: dedMap.get(`${ekey}::${KIND_MAP.unrectifiedDeduct}`) ?? 0,
          driverDeduct: drvByTown.get(regionBase(r.township)) ?? 0,
        };
      });

      return res.json({
        success: true, code: 0,
        data: { cycleId, position, total: rows.length, rows, kinds: { ...KIND_MAP, driverDeduct: 'driver_monthly' } },
      });
    } catch (e) {
      console.error('[violation-assessment/list]', e.message);
      return res.status(500).json({ success: false, code: 500, message: e.message });
    }
  },
);

// ===================== 自定义动态列持久化 =====================
async function ensureConfigTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hse_sanwei_ledger_config (
      id          BIGSERIAL PRIMARY KEY,
      cycle_id    BIGINT      NOT NULL,
      position    VARCHAR(64) NOT NULL,
      columns     JSONB       NOT NULL DEFAULT '[]',
      cells       JSONB       NOT NULL DEFAULT '{}',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_sanwei_ledger_config UNIQUE (cycle_id, position)
    )`);
}

/**
 * 预置列池（对齐「安全文化建设」活动列的下拉式增加/删除）：
 *  - kind='auto'   ：自动列，值来自 /list 的已落库扣分（grid/violation/unrectified），只读展示；
 *  - kind='manual' ：人工列，值来自 cells（可手填），参与「考核分数」求和。
 *  - shown          ：是否在当前展示（默认 auto 展示，manual 隐藏待「增加列」）。
 * 删除列 = 置 shown=false（数据保留，可再「增加列」恢复），与安全文化建设行为一致。
 */
const DEFAULT_POOL = [
  { key: 'grid', title: '网格长巡查考核', kind: 'auto', shown: true },
  { key: 'violation', title: '三违巡查', kind: 'auto', shown: true },
  { key: 'unrectified', title: '三违信息填报', kind: 'auto', shown: true },
  { key: 'manual_rectify', title: '未按时整改', kind: 'manual', shown: false },
  { key: 'manual_instruct', title: '违章指挥', kind: 'manual', shown: false },
  { key: 'manual_protect', title: '劳保用品未佩戴', kind: 'manual', shown: false },
  { key: 'manual_cert', title: '无证上岗', kind: 'manual', shown: false },
  { key: 'manual_hidden', title: '现场隐患未上报', kind: 'manual', shown: false },
  { key: 'driver', title: '驾驶员三违', kind: 'auto', shown: false },
];

const AUTO_KEYS = new Set(['grid', 'violation', 'unrectified', 'driver']);

/** 乡镇/片区 → 乡镇基名：截掉「片区/作业中心/中心」后缀，用于驾驶员部门与考核对象乡镇做归属匹配 */
function regionBase(s) {
  const v = String(s || '').trim();
  if (!v) return '';
  if (v.endsWith('片区')) return v.slice(0, -2);
  if (v.endsWith('作业中心')) return v.slice(0, -4);
  if (v.endsWith('中心')) return v.slice(0, -2);
  return v;
}
/** 若手动新增了自定义列（旧数据，无 kind）也默认视为 manual，且若旧无 shown 默认展示 */
function normalizePoolCols(input = []) {
  const defMap = new Map(DEFAULT_POOL.map((d) => [d.key, d]));
  const exists = new Set();
  const out = [];
  // 1) 预置列：以定义为准（标题/kind），shown 以既有存储为准（不存在则按默认）
  for (const d of DEFAULT_POOL) {
    const cur = input.find((c) => c && c.key === d.key);
    out.push({
      key: d.key,
      title: cur && cur.title ? String(cur.title).trim() : d.title,
      kind: d.kind,
      shown: cur ? cur.shown !== false : d.shown,
    });
    exists.add(d.key);
  }
  // 2) 历史/自定义扩展列（不在预置池内，兼容旧数据）：默认 shown=true、kind='manual'
  for (const c of input) {
    const key = String(c?.key ?? '');
    if (!key || exists.has(key)) continue;
    out.push({ key, title: String(c?.title ?? '').trim() || key, kind: 'manual', shown: c.shown !== false });
    exists.add(key);
  }
  return out;
}

/**
 * GET /config?cycleId=&position=
 * 返回 { columns: [{key,title,kind,shown}], cells: { [employeeKey]: {manualKey: value} } }
 * 首次访问播种预置列池并回落持久化。
 */
router.get(
  '/config',
  authMiddleware,
  requireRole('admin', 'safety_manager'),
  async (req, res) => {
    const cycleId = Number(req.query.cycleId);
    const position = String(req.query.position ?? '').trim();
    if (!Number.isInteger(cycleId) || cycleId <= 0 || !position) {
      return res.status(400).json({ success: false, code: 400, message: 'cycleId/position 参数无效' });
    }
    try {
      await ensureConfigTable();
      const r = await pool.query(
        `SELECT columns, cells FROM hse_sanwei_ledger_config
          WHERE cycle_id = $1 AND position = $2`,
        [cycleId, position],
      );
      const row = r.rows[0];
      const persistedCols = Array.isArray(row?.columns) ? row.columns : [];
      const cells = row?.cells && typeof row.cells === 'object' ? row.cells : {};
      const columns = normalizePoolCols(persistedCols);
      // 首次访问（无配置行）回落，保证后续改动基于该列池
      if (!row) {
        await pool.query(
          `INSERT INTO hse_sanwei_ledger_config (cycle_id, position, columns, cells)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (cycle_id, position) DO NOTHING`,
          [cycleId, position, JSON.stringify(columns), JSON.stringify({})],
        );
      }
      return res.json({
        success: true, code: 0,
        data: { cycleId, position, columns, cells },
      });
    } catch (e) {
      console.error('[violation-assessment/config]', e.message);
      return res.status(500).json({ success: false, code: 500, message: e.message });
    }
  },
);

/**
 * PUT /config
 * body: { cycleId, position, columns: [{key,title,kind,shown}], cells: { [employeeKey]: {manualKey:value} } }
 */
router.put(
  '/config',
  authMiddleware,
  requireRole('admin', 'safety_manager'),
  async (req, res) => {
    const body = req.body || {};
    const cycleId = Number(body.cycleId);
    const position = String(body.position ?? '').trim();
    const columns = Array.isArray(body.columns) ? body.columns : [];
    const cells = body.cells && typeof body.cells === 'object' ? body.cells : {};
    if (!Number.isInteger(cycleId) || cycleId <= 0 || !position) {
      return res.status(400).json({ success: false, code: 400, message: 'cycleId/position 参数无效' });
    }
    try {
      await ensureConfigTable();
      const cleanCols = normalizePoolCols(columns);
      await pool.query(
        `INSERT INTO hse_sanwei_ledger_config (cycle_id, position, columns, cells)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (cycle_id, position) DO UPDATE
           SET columns = EXCLUDED.columns, cells = EXCLUDED.cells, updated_at = NOW()`,
        [cycleId, position, JSON.stringify(cleanCols), JSON.stringify(cells)],
      );
      return res.json({ success: true, code: 0, data: { saved: true } });
    } catch (e) {
      console.error('[violation-assessment/config]', e.message);
      return res.status(500).json({ success: false, code: 500, message: e.message });
    }
  },
);

module.exports = router;
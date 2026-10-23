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
// 三违活源按人聚合共享服务（与评分引擎同源口径，见 getPerEmployeeScores）
const { getPerEmployeeScores, KIND_MAP: SHARED_KIND_MAP } = require('../services/violationAssessmentService');
// 违章人 → 直接上级/部门 解析（未按时整改「管理员 tab 按人归属」明细用）
const { resolveViolatorAttribs, cleanVName, NAME_ALIAS } = require('../services/violatorResolver');

const router = express.Router();

// 三固定列 → hse_assessment_deduction.source_detail->>'kind' 映射（与共享服务同源）
const KIND_MAP = SHARED_KIND_MAP;
const KIND_VALUES = Object.values(KIND_MAP);

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** 乡镇/片区 → 乡镇基名（与共享服务同源） */
function regionBase(s) {
  const v = String(s || '').replace(/乡镇/g, '').trim();
  if (!v) return '';
  if (v.endsWith('片区')) return v.slice(0, -2);
  if (v.endsWith('作业中心')) return v.slice(0, -4);
  if (v.endsWith('中心')) return v.slice(0, -2);
  return v;
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

      // 2) 三违活源按人聚合（共享服务：网格/三违巡查/信息填报 + 未按时整改 + 驾驶员三违 + 公司查处）
      const perEmp = await getPerEmployeeScores(cycleId, position);

      const rows = (tgt.rows || []).map((r) => {
        const s = perEmp.get(r.employee_id) || {};
        return {
          targetId: r.id,
          employeeId: r.employee_id,
          name: r.employee_name,
          position: r.position,
          township: r.township || '',
          department: r.department || '',
          gridDeduct: s.gridDeduct ?? 0,
          violationDeduct: s.violationDeduct ?? 0,
          unrectifiedDeduct: s.unrectifiedDeduct ?? 0,
          /** 未按时整改：真三违未整改（rectified_photo 缺失/占位）条数，每起 1 分；
           *  管理员 tab：责任网格长优先（grid_id→grid_areas.personnel_id→考核目标 employee_id），违章人直接上级兜底；
           *  经理 tab：按乡镇归因。 */
          rectifiedDeduct: s.rectifiedDeduct ?? 0,
          driverDeduct: s.driverDeduct ?? 0,
          companyDeduct: s.companyDeduct || { score: 0, helmetCount: 0, otherCount: 0, details: [] },
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

/**
 * GET /deductions?cycleId=&targetId=&kinds=violation_event,grid_unchecked_monthly,violation_unrectified
 * 返回某考核对象(target)在该周期内、指定 kind（逗号分隔）下的扣分明细（每条：日期/原因/分值/附加信息）。
 * 供前端点击扣分数字弹出二级悬浮明细（哪天扣分、什么原因）。只读，不修改任何表。
 */
router.get(
  '/deductions',
  authMiddleware,
  requireRole('admin', 'safety_manager'),
  async (req, res) => {
    const cycleId = Number(req.query.cycleId);
    const targetId = Number(req.query.targetId);
    const kinds = String(req.query.kinds ?? '')
      .split(',')
      .map((k) => String(k).trim())
      .filter((k) => KIND_VALUES.includes(k));
    if (!Number.isInteger(cycleId) || cycleId <= 0) {
      return res.status(400).json({ success: false, code: 400, message: 'cycleId 参数无效' });
    }
    if (!Number.isInteger(targetId) || targetId <= 0) {
      return res.status(400).json({ success: false, code: 400, message: 'targetId 参数无效' });
    }
    if (!kinds.length) {
      return res.status(400).json({ success: false, code: 400, message: 'kinds 参数无效' });
    }
    try {
      const r = await pool.query(
        `SELECT d.id, d.deduction_item, d.suggested_score, d.confirmed_score,
                d.violation_date, d.remark, d.source_table, d.source_id, d.source_detail
           FROM hse_assessment_deduction d
          WHERE d.cycle_id = $1 AND d.target_id = $2 AND d.is_deleted = FALSE
            AND COALESCE(d.review_status, '') <> 'rejected'
            AND d.source_detail->>'kind' = ANY($3::text[])
          ORDER BY d.violation_date NULLS LAST, d.id`,
        [cycleId, targetId, kinds],
      );
      const list = (r.rows || []).map((row) => {
        let detail = null;
        if (row.source_detail && typeof row.source_detail === 'object') detail = row.source_detail;
        return {
          deductionId: row.id,
          date: row.violation_date || (detail && detail.violationDate) || null,
          item: row.deduction_item || '',
          score: round2(row.confirmed_score != null ? row.confirmed_score : row.suggested_score),
          sourceTable: row.source_table || null,
          sourceId: row.source_id != null ? String(row.source_id) : null,
          remark: row.remark || '',
          detail,
        };
      });
      return res.json({ success: true, code: 0, data: { cycleId, targetId, kinds, list } });
    } catch (e) {
      console.error('[violation-assessment/deductions]', e.message);
      return res.status(500).json({ success: false, code: 500, message: e.message });
    }
  },
);

/**
 * GET /unrectified-detail?cycleId=&targetId=
 * 「未按时整改」列拆分明细：某考核对象(target)所在乡镇当月的「真三违未整改」记录逐条拉取
 * （日期/违规行为/班组，每起 1 分）。数据源 grid_inspection_records 只读，不写库。
 * 口径与 /list 的 rectifiedDeduct 完全一致：同月 + 真三违（violation_behavior<>'无三违行为'）
 * + rectified_photo 缺失/占位（NULL/''/--/-/无）+ 按 regionBase(area_team) 归属乡镇。
 */
router.get(
  '/unrectified-detail',
  authMiddleware,
  requireRole('admin', 'safety_manager'),
  async (req, res) => {
    const cycleId = Number(req.query.cycleId);
    const targetId = Number(req.query.targetId);
    if (!Number.isInteger(cycleId) || cycleId <= 0 || !Number.isInteger(targetId) || targetId <= 0) {
      return res.status(400).json({ success: false, code: 400, message: 'cycleId/targetId 参数无效' });
    }
    try {
      const cyc = await pool.query(
        `SELECT assessment_year, assessment_month FROM hse_assessment_cycle WHERE id = $1 AND is_deleted = FALSE`,
        [cycleId],
      );
      const cycRow = cyc.rows[0];
      const month =
        cycRow && cycRow.assessment_year != null
          ? `${cycRow.assessment_year}-${String(cycRow.assessment_month).padStart(2, '0')}`
          : '';
      if (!month) return res.json({ success: true, code: 0, data: { cycleId, targetId, list: [] } });

      const tg = await pool.query(
        `SELECT township, position, employee_name, employee_id FROM hse_assessment_target WHERE id = $1 AND cycle_id = $2 AND is_deleted = FALSE`,
        [targetId, cycleId],
      );
      const trow = tg.rows[0];
      const townBase = trow ? regionBase(trow.township) : '';
      if (!trow || !townBase) {
        return res.json({ success: true, code: 0, data: { cycleId, targetId, list: [] } });
      }

      const rd = await pool.query(
        `SELECT id, to_char(inspection_date, 'YYYY-MM-DD') AS d, violation_behavior, area_team, violator_name, grid_id
           FROM grid_inspection_records
          WHERE to_char(inspection_date, 'YYYY-MM') = $1
            AND trim(violation_behavior) <> '无三违行为'
            AND (rectified_photo IS NULL OR trim(rectified_photo) = '' OR trim(rectified_photo) IN ('--', '-', '无'))
          ORDER BY inspection_date, area_team`,
        [month],
      );
      let rows = rd.rows || [];
      // 管理员 tab：明细归因与 /list 的 rectifiedDeduct 完全一致 = 责任网格长优先（grid_id→grid_areas.personnel_id→考核目标 employee_id）
      // + 违章人直接上级兜底；逐条算出归属 employee_id 后再按当前 target 过滤。经理 tab 保持按 area_team 乡镇归因。
      if (trow.position === '管理员' && rows.length) {
        const targetEmpId = String(trow.employee_id ?? '');
        const candQ = await pool.query(
          `SELECT DISTINCT town FROM hse_sanwei_score_monthly WHERE month = $1 AND is_deleted = FALSE`,
          [month],
        );
        const rectCandTowns = (candQ.rows || []).map((r) => r.town).filter(Boolean);
        const tAll = await pool.query(
          `SELECT employee_id, employee_name FROM hse_assessment_target
            WHERE cycle_id = $1 AND position = '管理员' AND is_deleted = FALSE`,
          [cycleId],
        );
        const targetEmpIds = new Set((tAll.rows || []).map((t) => String(t.employee_id)));
        const empIdByName = new Map();
        for (const t of tAll.rows || []) {
          const n = String(t.employee_name || '').trim();
          if (n) empIdByName.set(n, String(t.employee_id));
        }
        let gridLeaderMap = new Map(); // grid_id -> 责任网格长 employee_id
        const gq = await pool.query(
          `SELECT id, personnel_id FROM grid_areas
            WHERE is_deleted = FALSE AND personnel_id IS NOT NULL AND trim(personnel_id::text) <> ''`,
        );
        for (const g of gq.rows || []) gridLeaderMap.set(String(g.id), String(g.personnel_id).trim());
        const attribs = await resolveViolatorAttribs(rows.map((x) => x.violator_name));
        rows = rows.filter((r) => {
          // 1) 责任网格长优先
          let empId =
            r.grid_id != null && r.grid_id !== '' ? gridLeaderMap.get(String(r.grid_id)) || '' : '';
          if (empId && !targetEmpIds.has(empId)) empId = ''; // 网格长未命中考核目标 → 走兜底
          // 2) 违章人直接上级兜底
          if (!empId) {
            const raw = cleanVName(r.violator_name) || '';
            const alias = NAME_ALIAS[raw] || raw;
            const attr = attribs.get(alias);
            const sup = String(attr?.supervisor || '').trim();
            const dept = String(attr?.dept || '').trim();
            const town = sup && dept ? (rectCandTowns.find((t) => dept.includes(t)) || '') : '';
            if (town) empId = empIdByName.get(sup) || '';
          }
          return empId === targetEmpId;
        });
      } else {
        // 乡镇作业中心经理 tab：按 area_team 乡镇归因（保持原口径）
        rows = rows.filter((r) => regionBase(r.area_team) === townBase);
      }
      const list = rows.map((r) => ({
          /** 网格长巡查台账原始记录 id（供点击跳转定位，见「网格长巡查台账」页） */
          recordId: r.id,
          date: r.d || null,
          item: r.violation_behavior || '未按时整改',
          score: 1,
          detail: { summary: `（${r.area_team || ''}）未按时整改`, unit: 1 },
          remark: '',
        }));
      return res.json({ success: true, code: 0, data: { cycleId, targetId, list } });
    } catch (e) {
      console.error('[violation-assessment/unrectified-detail]', e.message);
      return res.status(500).json({ success: false, code: 500, message: e.message });
    }
  },
);

/**
 * GET /driver-detail?cycleId=&targetId=
 * 「驾驶员三违」列拆分明细：某考核对象(target)所处乡镇 + 周期月份的驾驶员月度考核分逐人列出，
 * 每人一行（姓名/部门/当月考核分），供点击跳转「驾驶员月度考核」页并定位到该驾驶员原始记录。只读。
 */
router.get(
  '/driver-detail',
  authMiddleware,
  requireRole('admin', 'safety_manager'),
  async (req, res) => {
    const cycleId = Number(req.query.cycleId);
    const targetId = Number(req.query.targetId);
    if (!Number.isInteger(cycleId) || cycleId <= 0 || !Number.isInteger(targetId) || targetId <= 0) {
      return res.status(400).json({ success: false, code: 400, message: 'cycleId/targetId 参数无效' });
    }
    try {
      const tRow = (
        await pool.query(`SELECT township FROM hse_assessment_target WHERE id = $1 AND is_deleted = FALSE`, [targetId])
      ).rows[0];
      if (!tRow) {
        return res.json({ success: true, code: 0, data: { cycleId, targetId, town: '', month: '', list: [] } });
      }
      const townBase = regionBase(tRow.township);
      const cycRow = (
        await pool.query(
          `SELECT assessment_year, assessment_month FROM hse_assessment_cycle WHERE id = $1 AND is_deleted = FALSE`,
          [cycleId],
        )
      ).rows[0];
      const month = cycRow && cycRow.assessment_year != null
        ? `${cycRow.assessment_year}-${String(cycRow.assessment_month).padStart(2, '0')}`
        : '';
      if (!month || !townBase) {
        return res.json({ success: true, code: 0, data: { cycleId, targetId, town: townBase, month, list: [] } });
      }
      const dr = await pool.query(
        `WITH tv AS (
            SELECT trim(name) AS dname, COUNT(*)::int AS cnt
              FROM driver_three_violation
             WHERE left(violation_time, 7) = $1 AND is_deleted = FALSE AND trim(name) <> ''
             GROUP BY trim(name)
         )
         SELECT d.id, trim(d.name) AS name, d.department,
                SUM(COALESCE(d.three_check_management,0) + COALESCE(d.lamp_dirty,0)
                    + COALESCE(d.lamp_failure,0) + COALESCE(d.safety_monitor,0)
                    + COALESCE(d.fire_management,0) + COALESCE(tv.cnt,0))::numeric AS s
           FROM driver_monthly d
           LEFT JOIN tv ON tv.dname = trim(d.name)
          WHERE d.month = $1 AND d.is_deleted = FALSE AND d.department <> ''
          GROUP BY d.id, trim(d.name), d.department`,
        [month],
      );
      const list = (dr.rows || [])
        .filter((x) => regionBase(x.department) === townBase)
        .map((x) => ({
          driverId: x.id,
          name: x.name,
          department: x.department,
          score: round2(Number(x.s || 0)),
          month,
        }))
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
      return res.json({ success: true, code: 0, data: { cycleId, targetId, town: townBase, month, list } });
    } catch (e) {
      console.error('[violation-assessment/driver-detail]', e.message);
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
  // 未按时整改：自 2026-09-26 起由手填改为自动（值取自三违台账「真三违未整改」，见 /list rectifiedDeduct）
  { key: 'manual_rectify', title: '未按时整改', kind: 'auto', shown: true },
  { key: 'manual_instruct', title: '违章指挥', kind: 'manual', shown: false },
  { key: 'manual_protect', title: '劳保用品未佩戴', kind: 'manual', shown: false },
  { key: 'manual_cert', title: '无证上岗', kind: 'manual', shown: false },
  { key: 'driver', title: '驾驶员三违', kind: 'auto', shown: false },
];

const AUTO_KEYS = new Set(['grid', 'violation', 'unrectified', 'driver', 'manual_rectify']);
/** 已从预置列池移除的历史列 key（避免 normalizePoolCols 当作历史扩展列重新加入） */
const REMOVED_POOL_KEYS = new Set(['manual_hidden']); // '现场隐患未上报'（无数据源，移除）
/** 原 manual 改 auto 的列 → 强制按新默认展示（忽略旧 shown=false 快照） */
const FORCE_SHOWN = new Map([['manual_rectify', true]]);

/** 乡镇/片区 → 乡镇基名：截掉「片区/作业中心/中心」后缀，用于驾驶员部门与考核对象乡镇做归属匹配。
 *  驾驶员部门为「XX镇乡镇作业中心」（多一个「乡镇」token），考核对象 township 为「XX镇作业中心」，
 *  故先剥掉「乡镇」，两侧才能对齐（乡镇名本身不包含字面「乡镇」，见 sanwei 统计口径 town）。 */
function regionBase(s) {
  const v = String(s || '').replace(/乡镇/g, '').trim();
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
  // 1) 预置列：以定义为准（标题/kind），shown 以既有存储为准（不存在则按默认；FORCE_SHOWN 列忽略旧快照）
  for (const d of DEFAULT_POOL) {
    const cur = input.find((c) => c && c.key === d.key);
    const forceShown = FORCE_SHOWN.get(d.key);
    out.push({
      key: d.key,
      title: cur && cur.title ? String(cur.title).trim() : d.title,
      kind: d.kind,
      shown: forceShown != null ? forceShown : cur ? cur.shown !== false : d.shown,
    });
    exists.add(d.key);
  }
  // 2) 历史/自定义扩展列（不在预置池内，兼容旧数据）：默认 shown=true、kind='manual'；剔除已移除的列
  for (const c of input) {
    const key = String(c?.key ?? '');
    if (!key || exists.has(key) || REMOVED_POOL_KEYS.has(key)) continue;
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
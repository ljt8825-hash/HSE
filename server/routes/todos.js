const express = require('express');
const router = express.Router();
const { success, error } = require('../middleware/response');
const { pool, isConnected } = require('../config/db');
const XLSX = require('xlsx');

// 聚合结果缓存：避免同一来源在 日/周/月 多个 Tab 间重复打库
const CACHE_TTL = 5 * 60 * 1000;
const cache = new Map(); // sourceCode -> { count, updatedAt, at, error }

function getYearRange(year) {
  const y = parseInt(year) || new Date().getFullYear();
  return { year, yearStart: `${y}-01-01`, yearEnd: `${y}-12-31` };
}

// ============================================================
// 各数据源 gap 查询：统一返回 { count:int, items:[{...}] }
// items 的字段名必须与 hse_todo_sources.export_columns 的 field 对齐
// ============================================================
const HANDLERS = {
  // 1) 目标责任书未签订人员（持续型）
  'objectives:responsibility-unsigned': async () => {
    const where = `
      FROM v_employee_current e
      LEFT JOIN LATERAL (
        SELECT status FROM hse_target_contracts
        WHERE signee_employee_id = e.employee_id AND is_deleted = false
        ORDER BY sign_date DESC NULLS LAST, id DESC LIMIT 1
      ) c ON true
      WHERE e.employee_deleted = false
        AND e.assignment_status = 'active'
        AND (c.status IS NULL OR c.status <> 'signed')`;
    const countR = await pool.query(`SELECT COUNT(*)::int AS count ${where}`);
    const itemsR = await pool.query(`
      SELECT
        e.employee_code AS "employeeCode",
        e.name AS "name",
        e.org_name AS "department",
        e.position_name AS "position",
        e.supervisor_name AS "supervisor"
      ${where}
      ORDER BY e.org_name, e.employee_code
      LIMIT 500`);
    return { count: parseInt(countR.rows[0].count), items: itemsR.rows };
  },

  // 2) 未生成保险记录人员（持续型）
  'insurance:uncovered': async () => {
    const where = `
      FROM v_employee_current e
      WHERE e.employee_deleted = false
        AND e.name IS NOT NULL AND e.name <> ''
        AND NOT EXISTS (
          SELECT 1 FROM personnel_insurance p
          WHERE p.employee_id = e.employee_id AND p.is_deleted = false
        )`;
    const countR = await pool.query(`SELECT COUNT(*)::int AS count ${where}`);
    const itemsR = await pool.query(`
      SELECT
        e.employee_code AS "employeeCode",
        e.name AS "name",
        e.org_name AS "department",
        e.position_name AS "position"
      ${where}
      ORDER BY e.employee_id
      LIMIT 500`);
    return { count: parseInt(countR.rows[0].count), items: itemsR.rows };
  },

  // 3) 培训逾期未复训/缺失（持续型）
  'training:expiry': async () => {
    const cte = `
      WITH latest_training AS (
        SELECT DISTINCT ON (ev.employee_id)
          ev.employee_code, ev.name, ev.org_name, ev.position_name,
          t.name AS training_name,
          (t.training_date::timestamp + INTERVAL '12 months')::date AS expiry_date,
          CASE WHEN t.training_date IS NULL THEN 'missing'
               WHEN (t.training_date::timestamp + INTERVAL '12 months')::date < CURRENT_DATE THEN 'expired'
               ELSE 'normal' END AS expiry_status
        FROM v_employee_current ev
        LEFT JOIN training_records t ON t.employee_id = ev.employee_id AND t.is_deleted = false AND t.result IN ('合格', 'passed')
        WHERE ev.assignment_status = 'active'
        ORDER BY ev.employee_id, t.training_date DESC NULLS LAST
      )`;
    const countR = await pool.query(`${cte} SELECT COUNT(*)::int AS count FROM latest_training WHERE expiry_status IN ('expired','missing')`);
    const itemsR = await pool.query(`
      ${cte}
      SELECT
        employee_code AS "employeeCode", name AS "name", org_name AS "department",
        position_name AS "position", training_name AS "trainingName", expiry_date AS "expiryDate"
      FROM latest_training
      WHERE expiry_status IN ('expired','missing')
      ORDER BY expiry_status, expiry_date NULLS LAST
      LIMIT 500`);
    return { count: parseInt(countR.rows[0].count), items: itemsR.rows };
  },

  // 4) 逾期未整改隐患（持续型）
  'hazard:overdue': async () => {
    const where = `
      FROM hazards h
      LEFT JOIN v_employee_current e ON h.responsible_id = e.employee_id
      WHERE h.is_deleted = false
        AND h.status != 'CLOSED'
        AND h.hazard_date IS NOT NULL
        AND h.hazard_date + (h.deadline_days || ' days')::interval < CURRENT_DATE`;
    const countR = await pool.query(`SELECT COUNT(*)::int AS count ${where}`);
    const itemsR = await pool.query(`
      SELECT
        h.no AS "hazardNo",
        h.location AS "location",
        h.risk_level AS "level",
        e.name AS "responsibleName",
        e.org_name AS "department",
        ROUND(EXTRACT(DAY FROM AGE(CURRENT_DATE, h.hazard_date + (h.deadline_days || ' days')::interval)))::int AS "overdueDays"
      ${where}
      ORDER BY "overdueDays" DESC
      LIMIT 500`);
    return { count: parseInt(countR.rows[0].count), items: itemsR.rows };
  },

  // 5) 年度责任书到期/已逾期（年度型）
  'objectives:contract-annual-expiry': async (query) => {
    const { yearStart, yearEnd } = getYearRange(query && query.year);
    const where = `
      FROM hse_target_contracts c
      WHERE c.is_deleted = false
        AND c.review_cycle_months = 12
        AND c.status = 'signed'
        AND c.expiry_date IS NOT NULL
        AND (c.expiry_date BETWEEN '${yearStart}' AND '${yearEnd}' OR c.expiry_date < CURRENT_DATE)`;
    const countR = await pool.query(`SELECT COUNT(*)::int AS count ${where}`);
    const itemsR = await pool.query(`
      SELECT
        c.title AS "title",
        c.contract_type AS "contractType",
        c.signee_person_name AS "signeeName",
        c.department AS "department",
        to_char(c.expiry_date, 'YYYY-MM-DD') AS "expiryDate",
        (c.expiry_date - CURRENT_DATE)::int AS "daysRemaining"
      ${where}
      ORDER BY c.expiry_date ASC
      LIMIT 500`);
    return { count: parseInt(countR.rows[0].count), items: itemsR.rows };
  },

  // 6) 年度考核未提交（年度型）：当前年周期内 status=pending/overdue 或 未提交
  'assessment:annual-unsubmitted': async (query) => {
    const { yearStart, yearEnd } = getYearRange(query && query.year);
    const where = `
      FROM hse_assessment_target t
      JOIN hse_assessment_cycle c ON c.id = t.cycle_id
      WHERE c.is_deleted = false AND t.is_deleted = false
        AND c.start_time >= '${yearStart}' AND c.start_time <= '${yearEnd}'
        AND (t.status IN ('pending','overdue') OR t.submitted_at IS NULL)`;
    const countR = await pool.query(`SELECT COUNT(*)::int AS count ${where}`);
    const itemsR = await pool.query(`
      SELECT
        c.cycle_name AS "assessmentName",
        c.cycle_code AS "period",
        t.department AS "department",
        t.employee_name AS "targetName",
        t.status AS "status"
      ${where}
      ORDER BY t.department, t.employee_name
      LIMIT 500`);
    return { count: parseInt(countR.rows[0].count), items: itemsR.rows };
  },

  // 7) 安委会会议未录入（持续型）：按 1/4/8/10 月排期，已过期的应开会议若未录入即缺口
  'committee:meeting-missing': async () => {
    const where = `
      FROM (
        SELECT g.yr AS yr, m.m AS mon,
               (DATE_TRUNC('month', MAKE_DATE(g.yr, m.m, 1)) + INTERVAL '1 month - 1 day')::date AS due_end
        FROM unnest(ARRAY[1,4,8,10]) AS m(m)
        CROSS JOIN unnest(ARRAY[EXTRACT(YEAR FROM CURRENT_DATE)::int - 1, EXTRACT(YEAR FROM CURRENT_DATE)::int]) AS g(yr)
      ) expected
      LEFT JOIN (
        SELECT DISTINCT EXTRACT(YEAR FROM activity_date)::int AS yr, EXTRACT(MONTH FROM activity_date)::int AS mon
        FROM hse_safety_committee_activity
        WHERE is_deleted = false AND activity_date IS NOT NULL
      ) rec ON rec.yr = expected.yr AND rec.mon = expected.mon
      WHERE expected.due_end < CURRENT_DATE AND rec.mon IS NULL`;
    const countR = await pool.query(`SELECT COUNT(*)::int AS count ${where}`);
    const itemsR = await pool.query(`
      SELECT
        expected.yr AS "year",
        expected.mon AS "month",
        expected.yr || '年' || expected.mon || '月' AS "periodLabel",
        '安委会会议未录入' AS "itemName",
        to_char(expected.due_end, 'YYYY-MM-DD') AS "dueEnd"
      ${where}
      ORDER BY expected.yr, expected.mon
      LIMIT 100`);
    return { count: parseInt(countR.rows[0].count), items: itemsR.rows };
  },

  // 8) 规章制度待发布/修订（持续型）：仍处 draft/revising 状态未正式发布
  'regulation:pending': async () => {
    const where = `
      FROM regulations r
      WHERE r.is_deleted = false
        AND r.status IN ('draft','revising')`;
    const countR = await pool.query(`SELECT COUNT(*)::int AS count ${where}`);
    const itemsR = await pool.query(`
      SELECT
        r.name AS "name",
        r.category AS "category",
        r.status AS "status",
        to_char(r.effective_date, 'YYYY-MM-DD') AS "effectiveDate"
      ${where}
      ORDER BY r.status, r.name
      LIMIT 500`);
    return { count: parseInt(countR.rows[0].count), items: itemsR.rows };
  },

  // 9) 三违待处理（持续型）：violation_records 中 status='待处理'
  'violation:pending': async () => {
    const where = `
      FROM violation_records v
      WHERE v.is_deleted = false
        AND v.status = '待处理'`;
    const countR = await pool.query(`SELECT COUNT(*)::int AS count ${where}`);
    const itemsR = await pool.query(`
      SELECT
        v.no AS "no",
        v.violation_type AS "violationType",
        v.violator_name AS "violatorName",
        v.location AS "location",
        to_char(v.violation_date, 'YYYY-MM-DD') AS "violationDate",
        v.status AS "status"
      ${where}
      ORDER BY v.violation_date DESC NULLS LAST
      LIMIT 500`);
    return { count: parseInt(countR.rows[0].count), items: itemsR.rows };
  },

  // 10) 网格巡查完成率不达标（持续型）：completion_rate < 80
  'grid:completion': async () => {
    const where = `
      FROM grid_areas g
      WHERE g.is_deleted = false
        AND COALESCE(g.completion_rate, 100) < 80`;
    const countR = await pool.query(`SELECT COUNT(*)::int AS count ${where}`);
    const itemsR = await pool.query(`
      SELECT
        g.grid_code AS "gridCode",
        g.name AS "name",
        g.grid_level AS "gridLevel",
        g.patrol_frequency AS "patrolFrequency",
        g.completion_rate AS "completionRate"
      ${where}
      ORDER BY g.completion_rate ASC NULLS LAST
      LIMIT 500`);
    return { count: parseInt(countR.rows[0].count), items: itemsR.rows };
  },
};

async function runHandler(key, query) {
  const h = HANDLERS[key];
  if (!h) return { count: 0, items: [], error: 'unknown source' };
  try {
    return await h(query);
  } catch (e) {
    console.error('[todos] handler error:', key, e.message);
    return { count: 0, items: [], error: e.message };
  }
}

// ============================================================
// GET /api/hse/todos?cadence=daily|weekly|monthly|yearly
// 读取 enabled 且 cadence 含该周期的源，逐个取 count（带缓存）
// ============================================================
router.get('/', async (req, res) => {
  try {
    if (!isConnected()) {
      return res.json(success({ list: [], summary: { total: 0, modules: 0 } }, '查询成功(内存模式)'));
    }
    const cadence = req.query.cadence || 'daily';
    const srcRes = await pool.query(
      `SELECT * FROM hse_todo_sources WHERE enabled = true AND cadence && ARRAY[$1]`,
      [cadence],
    );
    const now = Date.now();
    const list = [];
    for (const s of srcRes.rows) {
      let entry = cache.get(s.source_code);
      if (!entry || now - entry.at > CACHE_TTL) {
        const r = await runHandler(s.detail_api, req.query);
        entry = {
          count: r.count,
          updatedAt: new Date().toISOString(),
          at: now,
          error: r.error || null,
        };
        cache.set(s.source_code, entry);
      }
      list.push({
        sourceCode: s.source_code,
        module: s.module,
        subBoard: s.sub_board,
        title: s.title,
        count: entry.count,
        link: s.link,
        updatedAt: entry.updatedAt,
        error: entry.error,
      });
    }
    const total = list.reduce((a, b) => a + (Number(b.count) || 0), 0);
    const modules = new Set(list.filter((l) => (l.count || 0) > 0).map((l) => l.module)).size;
    res.json(success({ list, summary: { total, modules } }, '查询成功'));
  } catch (e) {
    res.json(error(-1, e.message));
  }
});

// ============================================================
// GET /api/hse/todos/export?sourceCode=xxx
// 按注册表 export_columns 生成 Excel 明细
// ============================================================
router.get('/export', async (req, res) => {
  try {
    const { sourceCode, year } = req.query;
    if (!sourceCode) return res.json(error(-1, '缺少 sourceCode'));
    const srcRes = await pool.query(`SELECT * FROM hse_todo_sources WHERE source_code = $1`, [sourceCode]);
    if (!srcRes.rows.length) return res.json(error(-1, '未找到数据源'));
    const s = srcRes.rows[0];
    const r = await runHandler(s.detail_api, { year });
    const items = r.items || [];
    const cols = Array.isArray(s.export_columns) && s.export_columns.length
      ? s.export_columns
      : Object.keys(items[0] || {}).map((k) => ({ field: k, header: k }));
    const header = cols.map((c) => c.header);
    const data = items.map((it) => cols.map((c) => (it[c.field] === null || it[c.field] === undefined ? '' : it[c.field])));
    const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '待办明细');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const fname = `待办明细_${s.title}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fname)}"; filename*=UTF-8''${encodeURIComponent(fname)}`);
    return res.send(buf);
  } catch (e) {
    res.json(error(-1, e.message));
  }
});

module.exports = router;

/**
 * 总览汇总路由 - 聚合各模块统计数据
 * DB 在线时从 PostgreSQL 查询，离线时返回空结构（前端回退到 MOCK 数据）
 */

const express = require('express');
const router = express.Router();
const { pool, isConnected } = require('../config/db');
const { success, error } = require('../middleware/response');
// P3-04-00.2 (F-04b)：隐患“已闭环/未闭环”判定统一取自 hazardService，
// 禁止在本路由内另写 '已完成' 字面量（旧词汇 + NULL 陷阱，见 hazardService 同名注释）。
const { sqlStatusClosed, sqlStatusOpen } = require('../services/hazardService');

// GET /api/overview/summary — 全量汇总
router.get('/summary', async (req, res, next) => {
  try {
    if (!isConnected()) {
      return res.json(success({
        hazard: { total: 0, fixed: 0 },
        training: { total: 0, completed: 0 },
        site_mgmt: { fire_equipment_total: 0, fire_equipment_abnormal: 0 },
        risk: {},
        accident: {},
        alerts: [],
        emergency: {}
      }, '查询成功(内存模式)'));
    }

    // 并行查询各模块统计
    const [hazardResult, trainingResult, fireResult, accidentResult] = await Promise.all([
      pool.query(`
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE ${sqlStatusClosed()}) AS fixed
        FROM hazards WHERE is_deleted = false
      `),
      pool.query(`
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE result = '合格') AS completed
        FROM training_records WHERE is_deleted = false
      `),
      pool.query(`
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE status IS NOT NULL AND status != '完好' AND status != '正常') AS abnormal
        FROM "t_08_现场管理_消防器材管理台账_无照片"
      `).catch(() => ({ rows: [{ total: '0', abnormal: '0' }] })),
      pool.query(`
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE "处理状态" IS NOT NULL AND "处理状态" NOT IN ('已结案','已关闭','已完成')) AS unsettled
        FROM "t_05_事故管理_历史未完成案件"
      `).catch(() => ({ rows: [{ total: '0', unsettled: '0' }] }))
    ]);

    const hazard = hazardResult.rows[0];
    const training = trainingResult.rows[0];
    const fire = fireResult.rows[0];
    const accident = accidentResult.rows[0];

    // 生成预警列表
    const alerts = [];

    // 保险到期预警（从车辆表）
    try {
      const vehicleAlerts = await pool.query(`
        SELECT plate, model, owner, insurance_end,
               (insurance_end::date - CURRENT_DATE) AS days_left
        FROM vehicles
        WHERE is_deleted = false
          AND insurance_end IS NOT NULL
          AND (insurance_end::date - CURRENT_DATE) <= 30
        ORDER BY insurance_end ASC
        LIMIT 10
      `);
      vehicleAlerts.rows.forEach(r => {
        alerts.push({
          type: '保险到期',
          level: r.days_left < 0 ? 'danger' : 'warning',
          owner: r.owner || r.plate,
          detail: `${r.plate} ${r.model}`,
          days_left: r.days_left,
          overdue: r.days_left < 0
        });
      });
    } catch (e) { /* vehicles 表可能不存在 */ }

    // 隐患超期预警
    try {
      const hazardAlerts = await pool.query(`
        SELECT no, description, responsible_dept, deadline,
               (deadline::date - CURRENT_DATE) AS days_left
        FROM hazards
        WHERE is_deleted = false
          AND ${sqlStatusOpen()}
          AND deadline IS NOT NULL
          AND (deadline::date - CURRENT_DATE) <= 7
        ORDER BY deadline ASC
        LIMIT 10
      `);
      hazardAlerts.rows.forEach(r => {
        alerts.push({
          type: '隐患超期',
          level: r.days_left < 0 ? 'danger' : 'warning',
          owner: r.responsible_dept || '未指定',
          detail: `#${r.no} ${r.description ? r.description.substring(0, 30) : ''}`,
          days_left: r.days_left,
          overdue: r.days_left < 0
        });
      });
    } catch (e) { /* hazards 表可能不存在 */ }

    res.json(success({
      hazard: {
        total: parseInt(hazard.total) || 0,
        fixed: parseInt(hazard.fixed) || 0
      },
      training: {
        total: parseInt(training.total) || 0,
        completed: parseInt(training.completed) || 0
      },
      site_mgmt: {
        fire_equipment_total: parseInt(fire.total) || 0,
        fire_equipment_abnormal: parseInt(fire.abnormal) || 0
      },
      risk: {},
      accident: {
        total: parseInt(accident.total) || 0,
        unsettled: parseInt(accident.unsettled) || 0
      },
      alerts,
      emergency: {}
    }, '查询成功'));
  } catch (err) {
    next(err);
  }
});

// GET /api/overview/stats — 安全总览轻量聚合（复用各模块统计，无新计算）
router.get('/stats', async (req, res, next) => {
  try {
    const year = req.query.year || new Date().getFullYear();
    const dept_id = req.query.dept_id || null;

    // 风险管控
    let risk = { total: 0, byLevel: {}, byStatus: {}, expiring: 0, expired: 0, linkedHazards: 0 };
    try {
      const r = await pool.query('SELECT COUNT(*) as total FROM risk_sources WHERE is_deleted=FALSE');
      risk.total = parseInt(r.rows[0]?.total || 0);
      const lvl = await pool.query('SELECT risk_level, COUNT(*) FROM risk_sources WHERE is_deleted=FALSE GROUP BY risk_level');
      lvl.rows.forEach(row => risk.byLevel[row.risk_level] = parseInt(row.count));
      const now = new Date().toISOString().split('T')[0];
      const exp = await pool.query(`
        SELECT 'expiring' as type, COUNT(*) FROM risk_sources WHERE is_deleted=FALSE AND next_review_date >= CURRENT_DATE AND next_review_date <= CURRENT_DATE + INTERVAL '30 days'
        UNION ALL
        SELECT 'expired', COUNT(*) FROM risk_sources WHERE is_deleted=FALSE AND next_review_date < CURRENT_DATE
      `);
      exp.rows.forEach(row => { if (row.type === 'expiring') risk.expiring = parseInt(row.count); else risk.expired = parseInt(row.count); });
    } catch (e) {}

    // 隐患治理
    let hazard = { total: 0, byLevel: {}, byStatus: {}, expiring: 0, expired: 0, closed: 0, relatedRisks: 0 };
    try {
      const h = await pool.query('SELECT COUNT(*) as total FROM hazards WHERE is_deleted=FALSE');
      hazard.total = parseInt(h.rows[0]?.total || 0);
      const lvl = await pool.query('SELECT hazard_level, COUNT(*) FROM hazards WHERE is_deleted=FALSE GROUP BY hazard_level');
      lvl.rows.forEach(row => hazard.byLevel[row.hazard_level] = parseInt(row.count));
      const sts = await pool.query('SELECT status, COUNT(*) FROM hazards WHERE is_deleted=FALSE GROUP BY status');
      sts.rows.forEach(row => hazard.byStatus[row.status] = parseInt(row.count));
      const cl = await pool.query("SELECT COUNT(*) FROM hazards WHERE is_deleted=FALSE AND status='closed'");
      hazard.closed = parseInt(cl.rows[0]?.count || 0);
      const hd = await pool.query(`
        SELECT 'expiring' as type, COUNT(*) FROM hazards WHERE is_deleted=FALSE AND deadline_date IS NOT NULL AND deadline_date >= CURRENT_DATE AND deadline_date <= CURRENT_DATE + INTERVAL '7 days'
        UNION ALL
        SELECT 'expired', COUNT(*) FROM hazards WHERE is_deleted=FALSE AND deadline_date IS NOT NULL AND deadline_date < CURRENT_DATE AND status != 'closed'
      `);
      hd.rows.forEach(row => { if (row.type === 'expiring') hazard.expiring = parseInt(row.count); else hazard.expired = parseInt(row.count); });
    } catch (e) {}

    // 培训考核
    let training = { plans: { total: 0, byStatus: {} }, records: { totalHours: 0, count: 0 }, assessments: { pass: 0, fail: 0, byGrade: {} }, certificates: { valid: 0, expiring: 0, expired: 0 }, comprehensive: { gradeA: 0 } };
    try {
      const pl = await pool.query('SELECT status, COUNT(*) FROM training_plans WHERE is_deleted=FALSE GROUP BY status');
      pl.rows.forEach(row => { training.plans.total += parseInt(row.count); training.plans.byStatus[row.status] = parseInt(row.count); });
      const rc = await pool.query(`SELECT COALESCE(SUM(hours_actual),0) as hours, COUNT(*) as cnt FROM training_records WHERE is_deleted=FALSE AND EXTRACT(YEAR FROM training_date)=$1`, [year]);
      training.records.totalHours = parseFloat(rc.rows[0].hours || 0);
      training.records.count = parseInt(rc.rows[0].cnt || 0);
      const as = await pool.query(`SELECT is_pass, grade, COUNT(*) FROM assessment_records WHERE is_deleted=FALSE AND EXTRACT(YEAR FROM assessment_date)=$1 GROUP BY is_pass, grade`, [year]);
      as.rows.forEach(row => {
        if (row.is_pass) training.assessments.pass += parseInt(row.count);
        else training.assessments.fail += parseInt(row.count);
        training.assessments.byGrade[row.grade] = (training.assessments.byGrade[row.grade] || 0) + parseInt(row.count);
      });
      const ce = await pool.query(`
        SELECT CASE
          WHEN is_permanent=TRUE THEN 'valid'
          WHEN valid_to IS NULL THEN 'valid'
          WHEN valid_to < CURRENT_DATE THEN 'expired'
          WHEN valid_to <= CURRENT_DATE + INTERVAL '30 days' THEN 'expiring'
          ELSE 'valid' END as status, COUNT(*)
        FROM certificates WHERE is_deleted=FALSE GROUP BY 1
      `);
      ce.rows.forEach(row => { if (training.certificates[row.status] !== undefined) training.certificates[row.status] = parseInt(row.count); });
      const cA = await pool.query("SELECT COUNT(*) FROM personnel_assessment_summary WHERE is_deleted=FALSE AND grade='A'");
      training.comprehensive.gradeA = parseInt(cA.rows[0]?.count || 0);
    } catch (e) {}

    // 人员
    let personnel = { total: 0, overAge: 0 };
    try {
      const p = await pool.query("SELECT COUNT(*) as total FROM employees WHERE is_deleted=FALSE AND status='在职'");
      personnel.total = parseInt(p.rows[0]?.total || 0);
    } catch (e) {}

    // 三违
    let violations = { total: 0, pending: 0 };
    try {
      const v = await pool.query('SELECT COUNT(*) as total FROM violations WHERE is_deleted=FALSE');
      violations.total = parseInt(v.rows[0]?.total || 0);
    } catch (e) {}

    res.json(success({ risk, hazard, training, personnel, violations, year }, '安全总览统计聚合成功'));
  } catch (err) {
    next(err);
  }
});

// GET /api/overview/cards — 获取安全总览卡片配置（分组）
router.get('/cards', async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT card_code, card_title, module_code, icon, semantic_color, data_source_api, data_source_params,
             click_action, target_route, filter_conditions, help_code, sort_order, width
      FROM hse_dashboard_card_config
      WHERE dashboard_code='overview' AND is_visible=TRUE AND status='active'
      ORDER BY sort_order, card_code
    `);
    const groups = {
      risk_control: { title: '风险管控', cards: [] },
      hazard_governance: { title: '隐患治理', cards: [] },
      training_assessment: { title: '培训考核', cards: [] },
      personnel: { title: '人员管理', cards: [] },
      site_mgmt: { title: '现场管理', cards: [] },
      other: { title: '其他', cards: [] },
    };
    result.rows.forEach(card => {
      const mc = card.module_code;
      if (mc === 'risk_control') groups.risk_control.cards.push(card);
      else if (mc === 'hazard_governance') groups.hazard_governance.cards.push(card);
      else if (['training_plan','training_record','assessment','certificate','comprehensive'].includes(mc)) groups.training_assessment.cards.push(card);
      else if (mc === 'personnel') groups.personnel.cards.push(card);
      else if (['violation','site_mgmt'].includes(mc)) groups.site_mgmt.cards.push(card);
      else groups.other.cards.push(card);
    });
    res.json(success({ groups, list: result.rows }, '卡片配置获取成功'));
  } catch (err) {
    next(err);
  }
});

// GET /api/overview/stats/:module — 单模块统计（兼容前端多接口调用）
router.get('/stats/:module', async (req, res, next) => {
  try {
    const { module } = req.params;
    // 统一走 summary 接口，前端按需取子字段
    res.json(success({ module, note: '请使用 /api/overview/summary 获取全量数据' }, '查询成功'));
  } catch (err) {
    next(err);
  }
});

// GET /api/overview/alerts?limit=10 — 最近预警列表（前端 Dashboard 调用）
// 复用 summary 的 alerts 字段，避免重复实现
router.get('/alerts', async (req, res, next) => {
  try {
    var limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit || '10'), 10) || 10));
    var alerts = [];
    if (isConnected()) {
      try {
        const r = await pool.query(
          'SELECT id, title, level, created_at AS time FROM alerts ORDER BY created_at DESC LIMIT $1',
          [limit]
        );
        alerts = r.rows.map(function (row) {
          return { id: row.id, title: row.title, level: row.level, time: row.time };
        });
      } catch (e) { /* alerts 表可能不存在，回退到空数组 */ }
    }
    res.json(success(alerts, '查询成功'));
  } catch (err) {
    next(err);
  }
});

module.exports = router;

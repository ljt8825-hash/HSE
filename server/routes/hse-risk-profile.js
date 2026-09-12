/**
 * Sprint6.1 员工风险画像 API
 *
 * 路由前缀: /api/hse/risk-profile
 *
 * 接口：
 *   GET  /list              - 员工风险画像列表（分页）
 *   GET  /:employeeId       - 员工风险画像详情
 *   GET  /:employeeId/score - 员工风险评分计算
 *   GET  /risk-stats        - 风险统计概览
 *   GET  /score-config      - 评分配置列表
 *   PUT  /score-config/:id  - 更新评分配置
 *   POST /calculate-all     - 批量计算所有员工评分
 *   GET  /dimension/:type   - 维度明细查询
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { requirePermission } = require('../middleware/auth');
const { success, error } = require('../middleware/response');
const { buildListResponse, buildDetailResponse, camelKeys } = require('../utils/commonResponse');

// ============================================================
// 员工风险画像列表
// ============================================================
router.get('/list', async (req, res) => {
  try {
    const {
      page = 1, pageSize = 20,
      org_unit_id, position_id, responsibility_type,
      risk_level, keyword
    } = req.query;

    const offset = (page - 1) * pageSize;
    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (org_unit_id) {
      conditions.push(`o.id = $${paramIdx++}`);
      params.push(org_unit_id);
    }
    if (position_id) {
      conditions.push(`p.id = $${paramIdx++}`);
      params.push(position_id);
    }
    if (responsibility_type) {
      conditions.push(`r.responsibility_type = $${paramIdx++}`);
      params.push(responsibility_type);
    }
    if (keyword) {
      conditions.push(`(e.name ILIKE $${paramIdx} OR e.employee_code ILIKE $${paramIdx})`);
      params.push(`%${keyword}%`);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? 'AND ' + conditions.join(' AND ') : '';

    const countResult = await pool.query(
      `SELECT COUNT(DISTINCT e.id) as cnt
       FROM employee e
       JOIN employee_assignment er ON er.employee_id = e.id AND er.is_current = true AND er.is_deleted = false
       LEFT JOIN hse_org_unit o ON o.id = er.org_unit_id
       LEFT JOIN position p ON p.id = er.position_id
       LEFT JOIN hse_responsibility r ON r.employee_id = e.id AND r.is_deleted = false AND r.status = 'active'
       WHERE e.is_deleted = false ${whereClause}`,
      params
    );

    const listResult = await pool.query(
      `SELECT
         e.id as employee_id, e.employee_code, e.name, e.gender,
         o.org_name, ou.unit_name, ou.unit_type,
         p.name as position_name,
         r.responsibility_type, r.grid_level, r.grid_role,
         COALESCE(vs.cnt_12m, 0) as violation_count_12m,
         COALESCE(ts.compliance_rate, 0) as training_compliance_rate,
         COALESCE(a_s.accident_count, 0) as accident_count,
         COALESCE(hs.responsible_count, 0) as hazard_responsible_count,
         COALESCE(snap.total_score, 0) as risk_score,
         snap.risk_level
       FROM employee e
       JOIN employee_assignment er ON er.employee_id = e.id AND er.is_current = true AND er.is_deleted = false
       LEFT JOIN hse_org_unit o ON o.id = er.org_unit_id
       LEFT JOIN hse_operation_unit ou ON ou.id = er.operation_unit_id
       LEFT JOIN position p ON p.id = er.position_id
       LEFT JOIN hse_responsibility r ON r.employee_id = e.id AND r.is_deleted = false AND r.status = 'active'
       LEFT JOIN LATERAL (
         SELECT COUNT(*) as cnt_12m FROM violations v
         WHERE v.name = e.name AND v.violation_date >= CURRENT_DATE - INTERVAL '12 months'
       ) vs ON true
       LEFT JOIN LATERAL (
         SELECT compliance_rate FROM employee_training_status WHERE employee_id = e.id AND is_deleted = false LIMIT 1
       ) ts ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*) as accident_count FROM accidents WHERE is_deleted = false AND involved_person = e.name
       ) a_s ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*) as responsible_count FROM hazard_record WHERE is_deleted = false AND employee_id::bigint = e.id
       ) hs ON true
       LEFT JOIN hse_employee_risk_snapshot snap ON snap.employee_id = e.id AND snap.is_deleted = false
         AND snap.snapshot_date = (SELECT MAX(snapshot_date) FROM hse_employee_risk_snapshot WHERE employee_id = e.id AND is_deleted = false)
       WHERE e.is_deleted = false ${whereClause}
       ORDER BY COALESCE(snap.total_score, 0) ASC, e.id
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, pageSize, offset]
    );

    buildListResponse(res, listResult.rows, parseInt(countResult.rows[0].cnt), page, pageSize, '查询成功', { camelCase: true });
  } catch (e) {
    console.error('Risk profile list error:', e);
    res.json(error(-1, e.message));
  }
});

// ============================================================
// 员工风险画像详情
// ============================================================
router.get('/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;

    // 基础画像
    const profileResult = await pool.query(
      `SELECT * FROM v_employee_risk_profile WHERE employee_id = $1`,
      [employeeId]
    );

    if (profileResult.rows.length === 0) {
      return res.json(error(404, '员工不存在'));
    }

    const profile = profileResult.rows[0];

    // 三违明细（近12个月）
    const violationDetail = await pool.query(
      `SELECT v.violation_date, v.violation_type, v.description, v.punishment, v.amount, v.status, v.township
       FROM violations v
       WHERE v.name = $1
         AND v.violation_date >= CURRENT_DATE - INTERVAL '12 months'
       ORDER BY v.violation_date DESC`,
      [profile.name]
    );

    // 培训明细
    const trainingDetail = await pool.query(
      `SELECT ts.compliance_rate, ts.compliance_status, ts.total_requirements,
              ts.completed_count, ts.pending_count, ts.expired_count,
              ts.last_training_date, ts.next_due_date
       FROM employee_training_status ts
       WHERE ts.employee_id = $1 AND ts.is_deleted = false
       LIMIT 1`,
      [employeeId]
    );

    // 三级安全教育
    const inductionDetail = await pool.query(
      `SELECT overall_status, overall_result, qualified_date, expiry_date,
              company_level_status, department_level_status, team_level_status
       FROM employee_induction_training
       WHERE employee_id = $1 AND is_deleted = false
       LIMIT 1`,
      [employeeId]
    );

    // 事故明细
    const accidentDetail = await pool.query(
      `SELECT a.accident_date, a.accident_type, a.description, a.responsibility_level,
              a.level, a.status, a.casualties, a.injuries, a.loss_amount
       FROM accidents a
       WHERE a.is_deleted = false
         AND (a.involved_person = $1 OR a.personnel_id::bigint = $2)
       ORDER BY a.accident_date DESC`,
      [profile.name, employeeId]
    );

    // 隐患明细
    const hazardDetail = await pool.query(
      `SELECT hr.hazard_code, hr.hazard_level, hr.hazard_category, hr.description,
              hr.location, hr.status, hr.deadline_date, hr.actual_completion_date
       FROM hazard_record hr
       WHERE hr.is_deleted = false
         AND (hr.employee_id::bigint = $1 OR hr.responsible_id::bigint = $1)
       ORDER BY hr.created_at DESC`,
      [employeeId]
    );

    // 驾驶员信息（仅驾驶员岗位）
    let trafficInfo = null;
    const isDriver = profile.position_name && (
      profile.position_name.includes('驾驶员') || profile.position_name.includes('司机')
    );
    if (isDriver) {
      trafficInfo = {
        is_driver: true,
        position_name: profile.position_name,
        // 交通事故
        traffic_accidents: accidentDetail.rows.filter(a =>
          a.accident_type === '交通事故' || a.accident_type === '交通'
        ),
        // 交通相关三违
        traffic_violations: violationDetail.rows.filter(v =>
          v.violation_type && (v.violation_type.includes('交通') || v.violation_type.includes('驾驶'))
        )
      };
    }

    // 网格巡查（仅grid_leader）
    let patrolInfo = null;
    if (profile.responsibility_type === 'grid_leader') {
      const patrolResult = await pool.query(
        `SELECT ga.grid_code, ga.name, ga.grid_level, ga.completion_rate, ga.patrol_frequency
         FROM grid_areas ga
         WHERE ga.personnel_id = $1 AND ga.is_deleted = false`,
        [employeeId]
      );
      patrolInfo = patrolResult.rows;
    }

    // 最新评分
    const scoreResult = await pool.query(
      `SELECT total_score, risk_level, dimension_scores, dimension_details, calculated_at
       FROM hse_employee_risk_snapshot
       WHERE employee_id = $1 AND is_deleted = false
       ORDER BY snapshot_date DESC LIMIT 1`,
      [employeeId]
    );

    res.json(success({
      profile: camelKeys(profile),
      violations: violationDetail.rows.map(camelKeys),
      training: trainingDetail.rows[0] ? camelKeys(trainingDetail.rows[0]) : null,
      induction: inductionDetail.rows[0] ? camelKeys(inductionDetail.rows[0]) : null,
      accidents: accidentDetail.rows.map(camelKeys),
      hazards: hazardDetail.rows.map(camelKeys),
      traffic: trafficInfo ? camelKeys(trafficInfo) : null,
      patrol: patrolInfo ? (Array.isArray(patrolInfo) ? patrolInfo.map(camelKeys) : camelKeys(patrolInfo)) : null,
      score: scoreResult.rows[0] ? camelKeys(scoreResult.rows[0]) : null
    }, '查询成功'));
  } catch (e) {
    console.error('Risk profile detail error:', e);
    res.json(error(-1, e.message));
  }
});

// ============================================================
// 风险评分计算（规则评分）
// ============================================================
router.get('/:employeeId/score', async (req, res) => {
  try {
    const { employeeId } = req.params;

    // 获取员工画像数据
    const profileResult = await pool.query(
      `SELECT * FROM v_employee_risk_profile WHERE employee_id = $1`,
      [employeeId]
    );
    if (profileResult.rows.length === 0) {
      return res.json(error(404, '员工不存在'));
    }
    const profile = profileResult.rows[0];

    // 获取评分配置
    const configResult = await pool.query(
      `SELECT * FROM hse_risk_score_config WHERE is_deleted = false AND status = 'active' ORDER BY risk_dimension`
    );

    const dimensionScores = {};
    const dimensionDetails = {};
    let totalWeightedScore = 0;
    let totalWeight = 0;

    for (const config of configResult.rows) {
      const dim = config.risk_dimension;
      let rawValue = 0;

      // 获取原始指标值
      switch (config.indicator_code) {
        case 'violation_count':
          rawValue = profile.violation_count_12m || 0;
          break;
        case 'training_rate':
          rawValue = parseFloat(profile.training_compliance_rate) || 0;
          break;
        case 'accident_count':
          rawValue = profile.accident_count || 0;
          break;
        case 'hazard_count':
          rawValue = profile.hazard_responsible_count || 0;
          break;
        case 'traffic_violation': {
          const isDriver = profile.position_name && profile.position_name.includes('驾驶员');
          rawValue = isDriver ? (profile.violation_count_12m || 0) : -1; // -1 表示不适用
          break;
        }
        case 'patrol_rate': {
          const isGridLeader = profile.responsibility_type === 'grid_leader';
          rawValue = isGridLeader ? (parseFloat(profile.patrol_completion_rate) || 0) : -1;
          break;
        }
      }

      // 根据评分规则计算分数
      let score = 0;
      if (rawValue === -1) {
        // 不适用的维度不参与评分
        score = -1;
      } else {
        const rule = config.score_rule;
        if (rule && rule.ranges) {
          for (const range of rule.ranges) {
            const min = range.min !== undefined ? range.min : -Infinity;
            const max = range.max !== undefined ? range.max : Infinity;
            if (rawValue >= min && rawValue <= max) {
              score = range.score;
              break;
            }
          }
        } else {
          score = rawValue >= 0 ? Math.max(0, config.max_score - rawValue * 10) : 0;
        }
      }

      dimensionScores[dim] = score;
      dimensionDetails[dim] = {
        indicator: config.indicator_code,
        raw_value: rawValue,
        score: score,
        weight: parseFloat(config.weight),
        applicable: score !== -1
      };

      if (score !== -1) {
        totalWeightedScore += score * parseFloat(config.weight);
        totalWeight += parseFloat(config.weight);
      }
    }

    const totalScore = totalWeight > 0 ? Math.round(totalWeightedScore / totalWeight) : 0;

    // 确定风险等级
    let riskLevel = 'low';
    if (totalScore < 40) riskLevel = 'critical';
    else if (totalScore < 60) riskLevel = 'high';
    else if (totalScore < 80) riskLevel = 'medium';

    // 保存评分快照
    await pool.query(
      `INSERT INTO hse_employee_risk_snapshot
         (employee_id, snapshot_date, total_score, risk_level, dimension_scores, dimension_details)
       VALUES ($1, CURRENT_DATE, $2, $3, $4, $5)
       ON CONFLICT (employee_id, snapshot_date)
       DO UPDATE SET total_score = $2, risk_level = $3, dimension_scores = $4,
                     dimension_details = $5, calculated_at = CURRENT_TIMESTAMP`,
      [employeeId, totalScore, riskLevel,
       JSON.stringify(dimensionScores), JSON.stringify(dimensionDetails)]
    );

    res.json(success(camelKeys({
      employee_id: employeeId,
      total_score: totalScore,
      risk_level: riskLevel,
      dimension_scores: dimensionScores,
      dimension_details: dimensionDetails
    }), '评分计算成功'));
  } catch (e) {
    console.error('Risk score calculate error:', e);
    res.json(error(-1, e.message));
  }
});

// ============================================================
// 风险统计概览
// ============================================================
router.get('/risk-stats/overview', async (req, res) => {
  try {
    const stats = await pool.query(
      `SELECT
         COUNT(DISTINCT e.id) as total_employees,
         COUNT(DISTINCT e.id) FILTER (WHERE r.responsibility_type = 'grid_leader') as grid_leader_count,
         COUNT(DISTINCT e.id) FILTER (WHERE r.responsibility_type = 'production_manager') as production_manager_count,
         COUNT(DISTINCT e.id) FILTER (WHERE p.name LIKE '%驾驶员%') as driver_count,
         COUNT(DISTINCT CASE WHEN vs.cnt > 0 THEN e.id END) as employees_with_violations,
         COUNT(DISTINCT CASE WHEN a_s.cnt > 0 THEN e.id END) as employees_with_accidents
       FROM employee e
       JOIN employee_assignment er ON er.employee_id = e.id AND er.is_current = true AND er.is_deleted = false
       LEFT JOIN position p ON p.id = er.position_id
       LEFT JOIN hse_responsibility r ON r.employee_id = e.id AND r.is_deleted = false AND r.status = 'active'
       LEFT JOIN LATERAL (SELECT COUNT(*) as cnt FROM violations WHERE name = e.name AND violation_date >= CURRENT_DATE - INTERVAL '12 months') vs ON true
       LEFT JOIN LATERAL (SELECT COUNT(*) as cnt FROM accidents WHERE is_deleted = false AND involved_person = e.name) a_s ON true
       WHERE e.is_deleted = false`
    );

    // 风险等级分布
    const riskDist = await pool.query(
      `SELECT risk_level, COUNT(*) as cnt
       FROM hse_employee_risk_snapshot
       WHERE is_deleted = false AND snapshot_date = (SELECT MAX(snapshot_date) FROM hse_employee_risk_snapshot WHERE is_deleted = false)
       GROUP BY risk_level`
    );

    res.json(success({
      overview: camelKeys(stats.rows[0]),
      riskDistribution: riskDist.rows.map(camelKeys)
    }, '查询成功'));
  } catch (e) {
    console.error('Risk stats error:', e);
    res.json(error(-1, e.message));
  }
});

// ============================================================
// 评分配置
// ============================================================
router.get('/score-config', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM hse_risk_score_config WHERE is_deleted = false ORDER BY risk_dimension`
    );
    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (e) {
    res.json(error(-1, e.message));
  }
});

router.put('/score-config/:id', requirePermission('hse:risk:update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { weight, score_rule, status } = req.body;
    const result = await pool.query(
      `UPDATE hse_risk_score_config
       SET weight = COALESCE($1, weight),
           score_rule = COALESCE($2, score_rule),
           status = COALESCE($3, status),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND is_deleted = false
       RETURNING *`,
      [weight, score_rule ? JSON.stringify(score_rule) : null, status, id]
    );
    if (result.rows.length === 0) {
      return res.json(error(404, '配置不存在'));
    }
    buildDetailResponse(res, result.rows[0], '更新成功', { camelCase: true });
  } catch (e) {
    res.json(error(-1, e.message));
  }
});

// ============================================================
// 批量计算所有员工评分
// ============================================================
router.post('/calculate-all', requirePermission('hse:risk:create'), async (req, res) => {
  try {
    const employees = await pool.query(
      `SELECT e.id FROM employee e
       JOIN employee_assignment er ON er.employee_id = e.id AND er.is_current = true AND er.is_deleted = false
       WHERE e.is_deleted = false
       GROUP BY e.id`
    );

    let calculated = 0;
    for (const emp of employees.rows) {
      // 调用评分计算逻辑
      const scoreUrl = `http://localhost:${process.env.PORT || 3000}/api/hse/risk-profile/${emp.id}/score`;
      // 直接计算，不通过HTTP
      const profileResult = await pool.query(`SELECT * FROM v_employee_risk_profile WHERE employee_id = $1`, [emp.id]);
      if (profileResult.rows.length === 0) continue;

      const configResult = await pool.query(
        `SELECT * FROM hse_risk_score_config WHERE is_deleted = false AND status = 'active'`
      );
      const profile = profileResult.rows[0];
      let totalWeightedScore = 0, totalWeight = 0;
      const dimScores = {}, dimDetails = {};

      for (const config of configResult.rows) {
        const dim = config.risk_dimension;
        let rawValue = 0;
        switch (config.indicator_code) {
          case 'violation_count': rawValue = profile.violation_count_12m || 0; break;
          case 'training_rate': rawValue = parseFloat(profile.training_compliance_rate) || 0; break;
          case 'accident_count': rawValue = profile.accident_count || 0; break;
          case 'hazard_count': rawValue = profile.hazard_responsible_count || 0; break;
          case 'traffic_violation': rawValue = profile.position_name?.includes('驾驶员') ? (profile.violation_count_12m || 0) : -1; break;
          case 'patrol_rate': rawValue = profile.responsibility_type === 'grid_leader' ? (parseFloat(profile.patrol_completion_rate) || 0) : -1; break;
        }
        let score = 0;
        if (rawValue === -1) { score = -1; }
        else {
          const rule = config.score_rule;
          if (rule?.ranges) {
            for (const range of rule.ranges) {
              const min = range.min ?? -Infinity, max = range.max ?? Infinity;
              if (rawValue >= min && rawValue <= max) { score = range.score; break; }
            }
          }
        }
        dimScores[dim] = score;
        dimDetails[dim] = { raw_value: rawValue, score, weight: parseFloat(config.weight), applicable: score !== -1 };
        if (score !== -1) { totalWeightedScore += score * parseFloat(config.weight); totalWeight += parseFloat(config.weight); }
      }

      const totalScore = totalWeight > 0 ? Math.round(totalWeightedScore / totalWeight) : 0;
      let riskLevel = 'low';
      if (totalScore < 40) riskLevel = 'critical';
      else if (totalScore < 60) riskLevel = 'high';
      else if (totalScore < 80) riskLevel = 'medium';

      await pool.query(
        `INSERT INTO hse_employee_risk_snapshot (employee_id, snapshot_date, total_score, risk_level, dimension_scores, dimension_details)
         VALUES ($1, CURRENT_DATE, $2, $3, $4, $5)
         ON CONFLICT (employee_id, snapshot_date) DO UPDATE SET total_score = $2, risk_level = $3, dimension_scores = $4, dimension_details = $5, calculated_at = CURRENT_TIMESTAMP`,
        [emp.id, totalScore, riskLevel, JSON.stringify(dimScores), JSON.stringify(dimDetails)]
      );
      calculated++;
    }

    res.json(success(camelKeys({ calculated, total: employees.rows.length }), '批量计算完成'));
  } catch (e) {
    console.error('Calculate all error:', e);
    res.json(error(-1, e.message));
  }
});

module.exports = router;

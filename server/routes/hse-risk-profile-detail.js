/**
 * Sprint6.4-A 员工风险画像详情接口
 * 
 * 路由前缀: /api/hse/risk/profile
 * 
 * 接口：
 *   GET /{employee_id}       - 员工风险画像详情
 *   GET /{employee_id}/trend - 员工风险趋势
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { success, error } = require('../middleware/response');

/**
 * 获取员工风险画像详情
 * GET /api/hse/risk/profile/{employee_id}
 */
router.get('/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;

    // 员工基础信息
    const employeeResult = await pool.query(
      `SELECT e.id, e.employee_code, e.name, e.gender, e.status, e.phone, e.id_card,
              e.person_type, e.person_category, e.is_public_welfare, e.birth_date
       FROM employee e
       WHERE e.id = $1 AND e.is_deleted = false`,
      [employeeId]
    );

    if (employeeResult.rows.length === 0) {
      return res.status(404).json({ code: 1, message: '员工不存在' });
    }

    const employee = employeeResult.rows[0];

    // 当前组织信息
    const assignmentResult = await pool.query(
      `SELECT o.org_name, ou.unit_name, ou.unit_type,
              p.name as position_name
       FROM employee_assignment ea
       LEFT JOIN hse_org_unit o ON o.id = ea.org_unit_id AND o.is_deleted = false
       LEFT JOIN hse_operation_unit ou ON ou.id = ea.operation_unit_id AND ou.is_deleted = false
       LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
       WHERE ea.employee_id = $1 AND ea.is_current = true AND ea.is_deleted = false
       LIMIT 1`,
      [employeeId]
    );

    const assignment = assignmentResult.rows[0] || {};

    // 最新风险评分
    const scoreResult = await pool.query(
      `SELECT total_score, risk_level, dimension_scores, dimension_details, calculated_at
       FROM hse_employee_risk_snapshot
       WHERE employee_id = $1 AND is_deleted = false
       ORDER BY snapshot_date DESC LIMIT 1`,
      [employeeId]
    );

    const latestScore = scoreResult.rows[0] || null;

    // 风险等级配置
    const levelConfigResult = await pool.query(
      `SELECT level_code, level_name, color_code, min_score, max_score
       FROM risk_level_config
       WHERE is_enabled = true AND is_deleted = false
       ORDER BY level_order`
    );

    const levelConfig = levelConfigResult.rows;

    // 风险等级名称映射
    const levelMap = {};
    levelConfig.forEach(l => {
      levelMap[l.level_code] = { name: l.level_name, color: l.color_code };
    });

    // 风险排名（当前快照）
    const rankResult = await pool.query(
      `SELECT COUNT(*) + 1 as rank
       FROM hse_employee_risk_snapshot rs
       WHERE rs.is_deleted = false
         AND rs.snapshot_date = (SELECT MAX(snapshot_date) FROM hse_employee_risk_snapshot WHERE is_deleted = false)
         AND rs.total_score < COALESCE((SELECT total_score FROM hse_employee_risk_snapshot WHERE employee_id = $1 AND is_deleted = false ORDER BY snapshot_date DESC LIMIT 1), 0)`,
      [employeeId]
    );

    const rank = parseInt(rankResult.rows[0].rank) || null;

    // 三违记录（近12个月）
    const violationResult = await pool.query(
      `SELECT v.violation_date, v.violation_type, v.description, v.punishment, v.amount, v.status, v.township, v.created_at
       FROM violations v
       WHERE v.name = $1 AND v.violation_date >= CURRENT_DATE - INTERVAL '12 months'
       ORDER BY v.violation_date DESC`,
      [employee.name]
    );

    // 驾驶证扣分记录（近5年）
    const driverRecordResult = await pool.query(
      `SELECT dr.violation_date, dr.violation_type, dr.description, dr.points, dr.fine_amount, dr.status
       FROM driver_records dr
       WHERE dr.employee_id = $1 AND dr.violation_date >= CURRENT_DATE - INTERVAL '5 years'
       ORDER BY dr.violation_date DESC`,
      [employeeId]
    );

    // 三检记录
    const inspectionResult = await pool.query(
      `SELECT i.inspection_date, i.inspection_type, i.result, i.description, i.inspector_name, i.site_name
       FROM hse_inspection_records i
       WHERE i.employee_id = $1 AND i.is_deleted = false
       ORDER BY i.inspection_date DESC`,
      [employeeId]
    );

    // 事故记录
    const accidentResult = await pool.query(
      `SELECT a.accident_date, a.accident_type, a.description, a.level, a.responsibility_level,
              a.status, a.casualties, a.injuries, a.loss_amount, a.township
       FROM accidents a
       WHERE a.is_deleted = false AND (a.involved_person = $1 OR a.personnel_id::bigint = $2)
       ORDER BY a.accident_date DESC`,
      [employee.name, employeeId]
    );

    // 培训记录
    const trainingResult = await pool.query(
      `SELECT t.training_date, t.training_name, t.training_type, t.duration_hours, t.result,
              t.expiry_date, t.organization
       FROM employee_training_records t
       WHERE t.employee_id = $1 AND t.is_deleted = false
       ORDER BY t.training_date DESC`,
      [employeeId]
    );

    // 三级安全教育
    const inductionResult = await pool.query(
      `SELECT overall_status, overall_result, qualified_date, expiry_date,
              company_level_status, department_level_status, team_level_status
       FROM employee_induction_training
       WHERE employee_id = $1 AND is_deleted = false
       LIMIT 1`,
      [employeeId]
    );

    // 培训合规状态
    const trainingStatusResult = await pool.query(
      `SELECT compliance_rate, compliance_status, total_requirements,
              completed_count, pending_count, expired_count,
              last_training_date, next_due_date
       FROM employee_training_status ts
       WHERE ts.employee_id = $1 AND ts.is_deleted = false
       LIMIT 1`,
      [employeeId]
    );

    // 网格巡查
    const patrolResult = await pool.query(
      `SELECT ga.grid_code, ga.name as grid_name, ga.grid_level, ga.completion_rate, ga.patrol_frequency
       FROM grid_areas ga
       WHERE ga.personnel_id = $1 AND ga.is_deleted = false`,
      [employeeId]
    );

    res.json({
      code: 0,
      data: {
        basicInfo: {
          id: employee.id,
          employeeCode: employee.employee_code,
          name: employee.name,
          gender: employee.gender,
          department: assignment.org_name || '-',
          position: assignment.position_name || '-',
          operationUnit: assignment.unit_name || '-',
          unitType: assignment.unit_type || '-',
          status: employee.status || '-',
          personType: employee.person_type || '-',
          personCategory: employee.person_category || '-',
          isPublicWelfare: employee.is_public_welfare || false,
          phone: employee.phone || '-',
          idCard: employee.id_card || '-',
          birthDate: employee.birth_date || '-',
        },
        riskOverview: {
          totalScore: latestScore ? parseFloat(latestScore.total_score) : 0,
          riskLevel: latestScore ? latestScore.risk_level : 'unknown',
          riskLevelName: latestScore && levelMap[latestScore.risk_level] ? levelMap[latestScore.risk_level].name : '-',
          riskLevelColor: latestScore && levelMap[latestScore.risk_level] ? levelMap[latestScore.risk_level].color : '#999',
          rank: rank,
          totalEmployees: 0,
          calculatedAt: latestScore ? latestScore.calculated_at : null,
        },
        riskComposition: latestScore ? {
          violation: {
            score: latestScore.dimension_scores ? parseFloat(latestScore.dimension_scores.violation) : 0,
            weight: latestScore.dimension_details && latestScore.dimension_details.violation ? parseFloat(latestScore.dimension_details.violation.weight) : 0,
            applicable: latestScore.dimension_details && latestScore.dimension_details.violation ? latestScore.dimension_details.violation.applicable : true,
            rawValue: latestScore.dimension_details && latestScore.dimension_details.violation ? latestScore.dimension_details.violation.raw_value : 0,
          },
          driverCompliance: {
            score: latestScore.dimension_scores ? parseFloat(latestScore.dimension_scores.traffic) : 0,
            weight: latestScore.dimension_details && latestScore.dimension_details.traffic ? parseFloat(latestScore.dimension_details.traffic.weight) : 0,
            applicable: latestScore.dimension_details && latestScore.dimension_details.traffic ? latestScore.dimension_details.traffic.applicable : false,
            rawValue: latestScore.dimension_details && latestScore.dimension_details.traffic ? latestScore.dimension_details.traffic.raw_value : 0,
          },
          incident: {
            score: latestScore.dimension_scores ? parseFloat(latestScore.dimension_scores.accident) : 0,
            weight: latestScore.dimension_details && latestScore.dimension_details.accident ? parseFloat(latestScore.dimension_details.accident.weight) : 0,
            applicable: latestScore.dimension_details && latestScore.dimension_details.accident ? latestScore.dimension_details.accident.applicable : true,
            rawValue: latestScore.dimension_details && latestScore.dimension_details.accident ? latestScore.dimension_details.accident.raw_value : 0,
          },
          trainingCompliance: {
            score: latestScore.dimension_scores ? parseFloat(latestScore.dimension_scores.training) : 0,
            weight: latestScore.dimension_details && latestScore.dimension_details.training ? parseFloat(latestScore.dimension_details.training.weight) : 0,
            applicable: latestScore.dimension_details && latestScore.dimension_details.training ? latestScore.dimension_details.training.applicable : true,
            rawValue: latestScore.dimension_details && latestScore.dimension_details.training ? latestScore.dimension_details.training.raw_value : 0,
          },
          managementExecution: {
            score: latestScore.dimension_scores ? parseFloat(latestScore.dimension_scores.patrol) : 0,
            weight: latestScore.dimension_details && latestScore.dimension_details.patrol ? parseFloat(latestScore.dimension_details.patrol.weight) : 0,
            applicable: latestScore.dimension_details && latestScore.dimension_details.patrol ? latestScore.dimension_details.patrol.applicable : false,
            rawValue: latestScore.dimension_details && latestScore.dimension_details.patrol ? latestScore.dimension_details.patrol.raw_value : 0,
          },
        } : null,
        riskEvents: {
          violations: violationResult.rows.map(v => ({
            date: v.violation_date,
            type: v.violation_type || '-',
            description: v.description || '-',
            punishment: v.punishment || '-',
            amount: v.amount || 0,
            status: v.status || '-',
            township: v.township || '-',
          })),
          driverRecords: driverRecordResult.rows.map(dr => ({
            date: dr.violation_date,
            type: dr.violation_type || '-',
            description: dr.description || '-',
            points: dr.points || 0,
            fineAmount: dr.fine_amount || 0,
            status: dr.status || '-',
          })),
          inspections: inspectionResult.rows.map(i => ({
            date: i.inspection_date,
            type: i.inspection_type || '-',
            result: i.result || '-',
            description: i.description || '-',
            inspector: i.inspector_name || '-',
            siteName: i.site_name || '-',
          })),
          accidents: accidentResult.rows.map(a => ({
            date: a.accident_date,
            type: a.accident_type || '-',
            description: a.description || '-',
            level: a.level || '-',
            responsibilityLevel: a.responsibility_level || '-',
            status: a.status || '-',
            casualties: a.casualties || 0,
            injuries: a.injuries || 0,
            lossAmount: a.loss_amount || 0,
            township: a.township || '-',
          })),
          trainings: trainingResult.rows.map(t => ({
            date: t.training_date,
            name: t.training_name || '-',
            type: t.training_type || '-',
            durationHours: t.duration_hours || 0,
            result: t.result || '-',
            expiryDate: t.expiry_date || '-',
            organization: t.organization || '-',
          })),
        },
        trainingStatus: trainingStatusResult.rows[0] || null,
        inductionTraining: inductionResult.rows[0] || null,
        patrolInfo: patrolResult.rows,
      }
    });
  } catch (e) {
    console.error('Employee risk profile detail error:', e);
    res.status(500).json({ code: 1, message: e.message });
  }
});

/**
 * 获取员工风险趋势
 * GET /api/hse/risk/profile/{employee_id}/trend
 */
router.get('/:employeeId/trend', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { period = 'week' } = req.query;

    let dateCondition = '';
    let groupBy = '';

    switch (period) {
      case 'day':
        dateCondition = `WHERE rs.snapshot_date >= CURRENT_DATE - INTERVAL '30 days'`;
        groupBy = 'DATE(rs.snapshot_date)';
        break;
      case 'month':
        dateCondition = `WHERE rs.snapshot_date >= CURRENT_DATE - INTERVAL '12 months'`;
        groupBy = `DATE_TRUNC('month', rs.snapshot_date)`;
        break;
      case 'week':
      default:
        dateCondition = `WHERE rs.snapshot_date >= CURRENT_DATE - INTERVAL '12 weeks'`;
        groupBy = `DATE_TRUNC('week', rs.snapshot_date)`;
        break;
    }

    const trendResult = await pool.query(
      `SELECT ${groupBy} as period_date,
              AVG(rs.total_score) as avg_score,
              MAX(rs.total_score) as max_score,
              MIN(rs.total_score) as min_score,
              COUNT(*) as sample_count
       FROM hse_employee_risk_snapshot rs
       WHERE rs.employee_id = $1 AND rs.is_deleted = false
       ${dateCondition}
       GROUP BY period_date
       ORDER BY period_date`,
      [employeeId]
    );

    const dimensionTrendResult = await pool.query(
      `SELECT ${groupBy} as period_date,
              AVG((rs.dimension_scores->>'violation')::numeric) as violation_score,
              AVG((rs.dimension_scores->>'training')::numeric) as training_score,
              AVG((rs.dimension_scores->>'accident')::numeric) as accident_score,
              AVG((rs.dimension_scores->>'hazard')::numeric) as hazard_score,
              AVG((rs.dimension_scores->>'traffic')::numeric) as traffic_score,
              AVG((rs.dimension_scores->>'patrol')::numeric) as patrol_score
       FROM hse_employee_risk_snapshot rs
       WHERE rs.employee_id = $1 AND rs.is_deleted = false
       ${dateCondition}
       GROUP BY period_date
       ORDER BY period_date`,
      [employeeId]
    );

    res.json({
      code: 0,
      data: {
        period: period,
        trend: trendResult.rows.map(r => ({
          periodDate: r.period_date,
          avgScore: parseFloat(r.avg_score) || 0,
          maxScore: parseFloat(r.max_score) || 0,
          minScore: parseFloat(r.min_score) || 0,
          sampleCount: parseInt(r.sample_count) || 0,
        })),
        dimensionTrend: dimensionTrendResult.rows.map(r => ({
          periodDate: r.period_date,
          violationScore: parseFloat(r.violation_score) || 0,
          trainingScore: parseFloat(r.training_score) || 0,
          accidentScore: parseFloat(r.accident_score) || 0,
          hazardScore: parseFloat(r.hazard_score) || 0,
          trafficScore: parseFloat(r.traffic_score) || 0,
          patrolScore: parseFloat(r.patrol_score) || 0,
        })),
      }
    });
  } catch (e) {
    console.error('Employee risk trend error:', e);
    res.status(500).json({ code: 1, message: e.message });
  }
});

module.exports = router;
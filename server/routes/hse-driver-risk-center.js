/**
 * Sprint6.4-B 驾驶员专项风险中心 API
 *
 * 路由前缀: /api/hse/driver-risk-center
 *
 * 接口：
 *   GET /overview              - 驾驶员专项总览
 *   GET /drivers               - 驾驶员风险列表
 *   GET /demerit/statistics    - 驾驶证扣分统计
 *   GET /accident/statistics   - 交通事故统计
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');

const DRIVER_POSITIONS = ['驾驶员', '司机', '垃圾转运车驾驶员', '垃圾收运车驾驶员', '吸污车驾驶员'];

/**
 * 驾驶员专项总览
 * GET /api/hse/driver-risk-center/overview
 */
router.get('/overview', async (req, res) => {
  try {
    const driverCondition = `p.name ILIKE '%驾驶员%' OR p.name ILIKE '%司机%'`;

    const driverCountResult = await pool.query(
      `SELECT COUNT(DISTINCT ea.employee_id) as driver_count
       FROM employee_assignment ea
       LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
       WHERE ea.is_current = true AND ea.is_deleted = false
         AND (${driverCondition})`
    );

    const driverCount = parseInt(driverCountResult.rows[0].driver_count) || 0;

    const latestSnapshotDateResult = await pool.query(
      `SELECT MAX(snapshot_date) as latest_date
       FROM hse_employee_risk_snapshot
       WHERE is_deleted = false`
    );
    const latestDate = latestSnapshotDateResult.rows[0].latest_date;

    const levelDistributionResult = await pool.query(
      `SELECT rlc.level_code, rlc.level_name, rlc.color_code,
              COUNT(DISTINCT s.employee_id) as count
       FROM risk_level_config rlc
       LEFT JOIN hse_employee_risk_snapshot s
         ON s.risk_level = rlc.level_code AND s.is_deleted = false
         AND s.snapshot_date = $1
       LEFT JOIN employee_assignment ea
         ON ea.employee_id = s.employee_id AND ea.is_current = true AND ea.is_deleted = false
       LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
       WHERE rlc.is_enabled = true AND rlc.is_deleted = false
         AND (${driverCondition} OR s.employee_id IS NULL)
       GROUP BY rlc.level_code, rlc.level_name, rlc.color_code, rlc.level_order
       ORDER BY rlc.level_order`,
      [latestDate]
    );

    const levels = levelDistributionResult.rows.map(r => ({
      levelCode: r.level_code,
      levelName: r.level_name,
      colorCode: r.color_code,
      count: parseInt(r.count) || 0,
    }));

    const highRiskCount = levels.filter(l => ['high', 'critical'].includes(l.levelCode))
      .reduce((sum, l) => sum + l.count, 0);

    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

    const demeritResult = await pool.query(
      `SELECT COUNT(DISTINCT lr.employee_id) as demerit_driver_count,
              COUNT(*) as demerit_total_count,
              COALESCE(SUM(lr.demerit_points), 0) as total_points
       FROM license_demerit_records lr
       WHERE lr.is_deleted = false AND lr.demerit_date >= $1`,
      [fiveYearsAgo.toISOString().split('T')[0]]
    );

    const accidentResult = await pool.query(
      `SELECT COUNT(DISTINCT a.personnel_id) as accident_driver_count,
              COUNT(*) as accident_total_count
       FROM accidents a
       WHERE a.is_deleted = false AND a.accident_type = '交通事故'
         AND a.involved_person IN (
           SELECT e.name FROM employee e
           JOIN employee_assignment ea ON ea.employee_id = e.id
             AND ea.is_current = true AND ea.is_deleted = false
           LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
           WHERE e.is_deleted = false AND (${driverCondition})
         )`
    );

    const inspectionResult = await pool.query(
      `SELECT COUNT(DISTINCT vr.employee_id) as inspection_driver_count,
              COUNT(*) as inspection_total_count,
              COUNT(*) FILTER (WHERE vr.result = '不合格') as failed_count
       FROM hse_driver_inspection_records vr
       WHERE vr.is_deleted = false
         AND vr.employee_id IN (
           SELECT ea.employee_id FROM employee_assignment ea
           LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
           WHERE ea.is_current = true AND ea.is_deleted = false
             AND (${driverCondition})
         )`
    );

    const trainingResult = await pool.query(
      `SELECT COUNT(DISTINCT ts.employee_id) as trained_driver_count,
              COALESCE(AVG(ts.compliance_rate), 0) as avg_compliance_rate
       FROM employee_training_status ts
       WHERE ts.is_deleted = false
         AND ts.employee_id IN (
           SELECT ea.employee_id FROM employee_assignment ea
           LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
           WHERE ea.is_current = true AND ea.is_deleted = false
             AND (${driverCondition})
         )`
    );

    res.json({
      code: 0,
      data: {
        driverCount,
        levelDistribution: levels,
        highRiskCount,
        demeritStatistics: {
          demeritDriverCount: parseInt(demeritResult.rows[0].demerit_driver_count) || 0,
          demeritTotalCount: parseInt(demeritResult.rows[0].demerit_total_count) || 0,
          totalPoints: parseInt(demeritResult.rows[0].total_points) || 0,
        },
        accidentStatistics: {
          accidentDriverCount: parseInt(accidentResult.rows[0].accident_driver_count) || 0,
          accidentTotalCount: parseInt(accidentResult.rows[0].accident_total_count) || 0,
        },
        inspectionStatistics: {
          inspectionDriverCount: parseInt(inspectionResult.rows[0].inspection_driver_count) || 0,
          inspectionTotalCount: parseInt(inspectionResult.rows[0].inspection_total_count) || 0,
          failedCount: parseInt(inspectionResult.rows[0].failed_count) || 0,
        },
        trainingStatistics: {
          trainedDriverCount: parseInt(trainingResult.rows[0].trained_driver_count) || 0,
          avgComplianceRate: parseFloat(trainingResult.rows[0].avg_compliance_rate) || 0,
        },
      }
    });
  } catch (e) {
    console.error('Driver risk overview error:', e);
    res.status(500).json({ code: 1, message: e.message });
  }
});

/**
 * 驾驶员风险列表
 * GET /api/hse/driver-risk-center/drivers
 */
router.get('/drivers', async (req, res) => {
  try {
    const { page = 1, pageSize = 20, keyword, risk_level, org_unit_id, operation_unit_id } = req.query;

    const offset = (page - 1) * pageSize;
    const conditions = [];
    const params = [];
    let paramIdx = 1;

    const driverCondition = `p.name ILIKE '%驾驶员%' OR p.name ILIKE '%司机%'`;

    if (keyword) {
      conditions.push(`(e.name ILIKE $${paramIdx} OR e.employee_code ILIKE $${paramIdx})`);
      params.push(`%${keyword}%`);
      paramIdx++;
    }

    if (org_unit_id) {
      conditions.push(`o.id = $${paramIdx}`);
      params.push(org_unit_id);
      paramIdx++;
    }

    if (operation_unit_id) {
      conditions.push(`ou.id = $${paramIdx}`);
      params.push(operation_unit_id);
      paramIdx++;
    }

    if (risk_level) {
      conditions.push(`snap.risk_level = $${paramIdx}`);
      params.push(risk_level);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? 'AND ' + conditions.join(' AND ') : '';

    const countResult = await pool.query(
      `SELECT COUNT(DISTINCT e.id) as cnt
       FROM employee e
       JOIN employee_assignment ea ON ea.employee_id = e.id AND ea.is_current = true AND ea.is_deleted = false
       LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
       LEFT JOIN hse_org_unit o ON o.id = ea.org_unit_id AND o.is_deleted = false
       LEFT JOIN hse_operation_unit ou ON ou.id = ea.operation_unit_id AND ou.is_deleted = false
       LEFT JOIN hse_employee_risk_snapshot snap
         ON snap.employee_id = e.id AND snap.is_deleted = false
         AND snap.snapshot_date = (SELECT MAX(snapshot_date) FROM hse_employee_risk_snapshot WHERE is_deleted = false)
       WHERE e.is_deleted = false AND (${driverCondition})
         ${whereClause}`,
      params
    );

    const total = parseInt(countResult.rows[0].cnt) || 0;

    const listResult = await pool.query(
      `SELECT DISTINCT
         e.id as employee_id, e.employee_code, e.name, e.gender,
         o.org_name, ou.unit_name, ou.unit_type,
         p.name as position_name,
         snap.total_score, snap.risk_level,
         rlc.level_name as risk_level_name, rlc.color_code,
         lr_d.total_demerit_points,
         lr_d.demerit_count,
         a_c.accident_count,
         COALESCE(snap.total_score, 100) as sort_score
       FROM employee e
       JOIN employee_assignment ea ON ea.employee_id = e.id AND ea.is_current = true AND ea.is_deleted = false
       LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
       LEFT JOIN hse_org_unit o ON o.id = ea.org_unit_id AND o.is_deleted = false
       LEFT JOIN hse_operation_unit ou ON ou.id = ea.operation_unit_id AND ou.is_deleted = false
       LEFT JOIN hse_employee_risk_snapshot snap
         ON snap.employee_id = e.id AND snap.is_deleted = false
         AND snap.snapshot_date = (SELECT MAX(snapshot_date) FROM hse_employee_risk_snapshot WHERE is_deleted = false)
       LEFT JOIN risk_level_config rlc ON rlc.level_code = snap.risk_level AND rlc.is_deleted = false
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(demerit_points), 0) as total_demerit_points,
                COUNT(*) as demerit_count
         FROM license_demerit_records lr
         WHERE lr.employee_id = e.id AND lr.is_deleted = false
           AND lr.demerit_date >= CURRENT_DATE - INTERVAL '5 years'
       ) lr_d ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*) as accident_count
         FROM accidents a
         WHERE a.is_deleted = false AND a.accident_type = '交通事故'
           AND (a.involved_person = e.name OR a.personnel_id::bigint = e.id)
       ) a_c ON true
       WHERE e.is_deleted = false AND (${driverCondition})
         ${whereClause}
       ORDER BY sort_score ASC, employee_id
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, pageSize, offset]
    );

    res.json({
      code: 0,
      data: {
        list: listResult.rows.map(r => ({
          employeeId: r.employee_id,
          employeeCode: r.employee_code,
          name: r.name,
          gender: r.gender,
          orgName: r.org_name,
          unitName: r.unit_name,
          unitType: r.unit_type,
          positionName: r.position_name,
          totalScore: parseFloat(r.total_score) || 0,
          riskLevel: r.risk_level,
          riskLevelName: r.risk_level_name || '-',
          riskLevelColor: r.color_code || '#999',
          demeritPoints: parseInt(r.total_demerit_points) || 0,
          demeritCount: parseInt(r.demerit_count) || 0,
          accidentCount: parseInt(r.accident_count) || 0,
        })),
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
      }
    });
  } catch (e) {
    console.error('Driver list error:', e);
    res.status(500).json({ code: 1, message: e.message });
  }
});

/**
 * 驾驶证扣分统计
 * GET /api/hse/driver-risk-center/demerit/statistics
 */
router.get('/demerit/statistics', async (req, res) => {
  try {
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
    const fiveYearsAgoStr = fiveYearsAgo.toISOString().split('T')[0];

    const overallResult = await pool.query(
      `SELECT COUNT(DISTINCT employee_id) as demerit_driver_count,
              COUNT(*) as demerit_total_count,
              COALESCE(SUM(demerit_points), 0) as total_points,
              ROUND(AVG(demerit_points), 1) as avg_points_per_record
       FROM license_demerit_records
       WHERE is_deleted = false AND demerit_date >= $1`,
      [fiveYearsAgoStr]
    );

    const pointsDistributionResult = await pool.query(
      `SELECT
         CASE
           WHEN demerit_points BETWEEN 1 AND 3 THEN '1-3分'
           WHEN demerit_points BETWEEN 4 AND 6 THEN '4-6分'
           WHEN demerit_points BETWEEN 7 AND 9 THEN '7-9分'
           WHEN demerit_points >= 10 THEN '10分以上'
           ELSE '其他'
         END as points_range,
         COUNT(*) as count
       FROM license_demerit_records
       WHERE is_deleted = false AND demerit_date >= $1
       GROUP BY points_range
       ORDER BY points_range`,
      [fiveYearsAgoStr]
    );

    const topDriversResult = await pool.query(
      `SELECT e.id as employee_id, e.name, e.employee_code, p.name as position_name,
              COALESCE(SUM(lr.demerit_points), 0) as total_points,
              COUNT(*) as demerit_count
       FROM license_demerit_records lr
       JOIN employee e ON e.id = lr.employee_id AND e.is_deleted = false
       LEFT JOIN employee_assignment ea
         ON ea.employee_id = e.id AND ea.is_current = true AND ea.is_deleted = false
       LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
       WHERE lr.is_deleted = false AND lr.demerit_date >= $1
       GROUP BY e.id, e.name, e.employee_code, p.name
       ORDER BY total_points DESC
       LIMIT 10`,
      [fiveYearsAgoStr]
    );

    const monthlyTrendResult = await pool.query(
      `SELECT DATE_TRUNC('month', demerit_date) as month,
              COUNT(*) as count,
              COALESCE(SUM(demerit_points), 0) as total_points
       FROM license_demerit_records
       WHERE is_deleted = false AND demerit_date >= $1
       GROUP BY month
       ORDER BY month`,
      [fiveYearsAgoStr]
    );

    res.json({
      code: 0,
      data: {
        period: '近5年',
        overall: {
          demeritDriverCount: parseInt(overallResult.rows[0].demerit_driver_count) || 0,
          demeritTotalCount: parseInt(overallResult.rows[0].demerit_total_count) || 0,
          totalPoints: parseInt(overallResult.rows[0].total_points) || 0,
          avgPointsPerRecord: parseFloat(overallResult.rows[0].avg_points_per_record) || 0,
        },
        pointsDistribution: pointsDistributionResult.rows.map(r => ({
          range: r.points_range,
          count: parseInt(r.count) || 0,
        })),
        topDrivers: topDriversResult.rows.map(r => ({
          employeeId: r.employee_id,
          name: r.name,
          employeeCode: r.employee_code,
          positionName: r.position_name,
          totalPoints: parseInt(r.total_points) || 0,
          demeritCount: parseInt(r.demerit_count) || 0,
        })),
        monthlyTrend: monthlyTrendResult.rows.map(r => ({
          month: r.month,
          count: parseInt(r.count) || 0,
          totalPoints: parseInt(r.total_points) || 0,
        })),
      }
    });
  } catch (e) {
    console.error('Demerit statistics error:', e);
    res.status(500).json({ code: 1, message: e.message });
  }
});

/**
 * 交通事故统计
 * GET /api/hse/driver-risk-center/accident/statistics
 */
router.get('/accident/statistics', async (req, res) => {
  try {
    const driverCondition = `p.name ILIKE '%驾驶员%' OR p.name ILIKE '%司机%'`;

    const overallResult = await pool.query(
      `SELECT COUNT(DISTINCT a.personnel_id) as accident_driver_count,
              COUNT(*) as accident_total_count,
              COUNT(*) FILTER (WHERE a.responsibility_level = '责任') as responsible_count,
              COALESCE(SUM(CASE WHEN a.responsibility_level = '责任' THEN 1 ELSE 0 END), 0) as responsibility_ratio
       FROM accidents a
       WHERE a.is_deleted = false AND a.accident_type = '交通事故'
         AND (a.involved_person IN (
           SELECT e.name FROM employee e
           JOIN employee_assignment ea ON ea.employee_id = e.id
             AND ea.is_current = true AND ea.is_deleted = false
           LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
           WHERE e.is_deleted = false AND (${driverCondition})
         ) OR a.personnel_id IN (
           SELECT e.id FROM employee e
           JOIN employee_assignment ea ON ea.employee_id = e.id
             AND ea.is_current = true AND ea.is_deleted = false
           LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
           WHERE e.is_deleted = false AND (${driverCondition})
         ))`
    );

    const levelDistributionResult = await pool.query(
      `SELECT a.level,
              COUNT(*) as count
       FROM accidents a
       WHERE a.is_deleted = false AND a.accident_type = '交通事故'
         AND (a.involved_person IN (
           SELECT e.name FROM employee e
           JOIN employee_assignment ea ON ea.employee_id = e.id
             AND ea.is_current = true AND ea.is_deleted = false
           LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
           WHERE e.is_deleted = false AND (${driverCondition})
         ) OR a.personnel_id IN (
           SELECT e.id FROM employee e
           JOIN employee_assignment ea ON ea.employee_id = e.id
             AND ea.is_current = true AND ea.is_deleted = false
           LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
           WHERE e.is_deleted = false AND (${driverCondition})
         ))
       GROUP BY a.level
       ORDER BY a.level`
    );

    const yearlyTrendResult = await pool.query(
      `SELECT DATE_TRUNC('year', a.accident_date) as year,
              COUNT(*) as count
       FROM accidents a
       WHERE a.is_deleted = false AND a.accident_type = '交通事故'
         AND a.accident_date >= CURRENT_DATE - INTERVAL '5 years'
         AND (a.involved_person IN (
           SELECT e.name FROM employee e
           JOIN employee_assignment ea ON ea.employee_id = e.id
             AND ea.is_current = true AND ea.is_deleted = false
           LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
           WHERE e.is_deleted = false AND (${driverCondition})
         ) OR a.personnel_id IN (
           SELECT e.id FROM employee e
           JOIN employee_assignment ea ON ea.employee_id = e.id
             AND ea.is_current = true AND ea.is_deleted = false
           LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
           WHERE e.is_deleted = false AND (${driverCondition})
         ))
        GROUP BY DATE_TRUNC('year', a.accident_date)
        ORDER BY DATE_TRUNC('year', a.accident_date)`
    );

    const responsibleDriversResult = await pool.query(
      `SELECT e.id as employee_id, e.name, e.employee_code, p.name as position_name,
              COUNT(*) as accident_count,
              COUNT(*) FILTER (WHERE a.responsibility_level = '责任') as responsible_count
       FROM accidents a
       JOIN employee e ON e.id = a.personnel_id::bigint AND e.is_deleted = false
       LEFT JOIN employee_assignment ea
         ON ea.employee_id = e.id AND ea.is_current = true AND ea.is_deleted = false
       LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
       WHERE a.is_deleted = false AND a.accident_type = '交通事故'
       GROUP BY e.id, e.name, e.employee_code, p.name
       ORDER BY responsible_count DESC, accident_count DESC
       LIMIT 10`
    );

    res.json({
      code: 0,
      data: {
        overall: {
          accidentDriverCount: parseInt(overallResult.rows[0].accident_driver_count) || 0,
          accidentTotalCount: parseInt(overallResult.rows[0].accident_total_count) || 0,
          responsibleCount: parseInt(overallResult.rows[0].responsible_count) || 0,
        },
        levelDistribution: levelDistributionResult.rows.map(r => ({
          level: r.level || '未分级',
          count: parseInt(r.count) || 0,
        })),
        yearlyTrend: yearlyTrendResult.rows.map(r => ({
          year: r.year,
          count: parseInt(r.count) || 0,
        })),
        responsibleDrivers: responsibleDriversResult.rows.map(r => ({
          employeeId: r.employee_id,
          name: r.name,
          employeeCode: r.employee_code,
          positionName: r.position_name,
          accidentCount: parseInt(r.accident_count) || 0,
          responsibleCount: parseInt(r.responsible_count) || 0,
        })),
      }
    });
  } catch (e) {
    console.error('Accident statistics error:', e);
    res.status(500).json({ code: 1, message: e.message });
  }
});

module.exports = router;

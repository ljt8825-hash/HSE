/**
 * Sprint6.4-C 事故分析中心 API
 *
 * 路由前缀: /api/hse/accident-analysis
 *
 * 接口：
 *   GET /overview       - 事故分析总览
 *   GET /trend          - 事故趋势（年度/月度）
 *   GET /classification - 事故分类分析
 *   GET /responsible    - 责任人员分析
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');

/**
 * 事故分析总览
 * GET /api/hse/accident-analysis/overview
 */
router.get('/overview', async (req, res) => {
  try {
    const overallResult = await pool.query(
      `SELECT
         COUNT(*) as total_count,
         COUNT(DISTINCT COALESCE(NULLIF(involved_person, ''), NULLIF(personnel_id::text, ''))) as involved_count,
         COUNT(*) FILTER (WHERE responsibility_level = '责任') as responsible_count,
         COUNT(*) FILTER (WHERE level IN ('重大', '特别重大')) as major_count,
         COALESCE(SUM(casualties), 0) as total_casualties,
         COALESCE(SUM(injuries), 0) as total_injuries,
         COALESCE(SUM(loss_amount), 0) as total_loss
       FROM accidents
       WHERE is_deleted = false`
    );

    const typeResult = await pool.query(
      `SELECT
         CASE
           WHEN accident_type = '交通事故' THEN '交通事故'
           ELSE '生产安全事故'
         END as category,
         COUNT(*) as count,
         COALESCE(SUM(casualties), 0) as casualties,
         COALESCE(SUM(injuries), 0) as injuries,
         COALESCE(SUM(loss_amount), 0) as loss_amount
       FROM accidents
       WHERE is_deleted = false
       GROUP BY category`
    );

    const levelResult = await pool.query(
      `SELECT
         COALESCE(NULLIF(level, ''), '未分级') as level,
         COUNT(*) as count
       FROM accidents
       WHERE is_deleted = false
       GROUP BY level
       ORDER BY
         CASE level
           WHEN '特别重大' THEN 1
           WHEN '重大' THEN 2
           WHEN '较大' THEN 3
           WHEN '一般' THEN 4
           ELSE 5
         END`
    );

    const statusResult = await pool.query(
      `SELECT
         COALESCE(NULLIF(status, ''), '未知') as status,
         COUNT(*) as count
       FROM accidents
       WHERE is_deleted = false
       GROUP BY status`
    );

    const row = overallResult.rows[0];

    res.json({
      code: 0,
      data: {
        totalCount: parseInt(row.total_count) || 0,
        involvedCount: parseInt(row.involved_count) || 0,
        responsibleCount: parseInt(row.responsible_count) || 0,
        majorCount: parseInt(row.major_count) || 0,
        totalCasualties: parseInt(row.total_casualties) || 0,
        totalInjuries: parseInt(row.total_injuries) || 0,
        totalLoss: parseFloat(row.total_loss) || 0,
        typeDistribution: typeResult.rows.map(r => ({
          category: r.category,
          count: parseInt(r.count) || 0,
          casualties: parseInt(r.casualties) || 0,
          injuries: parseInt(r.injuries) || 0,
          lossAmount: parseFloat(r.loss_amount) || 0,
        })),
        levelDistribution: levelResult.rows.map(r => ({
          level: r.level,
          count: parseInt(r.count) || 0,
        })),
        statusDistribution: statusResult.rows.map(r => ({
          status: r.status,
          count: parseInt(r.count) || 0,
        })),
      }
    });
  } catch (e) {
    console.error('Accident analysis overview error:', e);
    res.status(500).json({ code: 1, message: e.message });
  }
});

/**
 * 事故趋势
 * GET /api/hse/accident-analysis/trend
 * Query: period=year|month, year=YYYY (optional, for monthly)
 */
router.get('/trend', async (req, res) => {
  try {
    const { period = 'year', year } = req.query;

    if (period === 'month') {
      const targetYear = year || new Date().getFullYear();

      const monthlyResult = await pool.query(
        `SELECT
           EXTRACT(MONTH FROM accident_date)::int as month,
           COUNT(*) as count,
           COUNT(*) FILTER (WHERE responsibility_level = '责任') as responsible_count,
           COALESCE(SUM(casualties), 0) as casualties,
           COALESCE(SUM(injuries), 0) as injuries,
           COALESCE(SUM(loss_amount), 0) as loss_amount
         FROM accidents
         WHERE is_deleted = false
           AND EXTRACT(YEAR FROM accident_date) = $1
         GROUP BY EXTRACT(MONTH FROM accident_date)
         ORDER BY EXTRACT(MONTH FROM accident_date)`,
        [targetYear]
      );

      const typeMonthlyResult = await pool.query(
        `SELECT
           EXTRACT(MONTH FROM accident_date)::int as month,
           CASE
             WHEN accident_type = '交通事故' THEN '交通事故'
             ELSE '生产安全事故'
           END as category,
           COUNT(*) as count
         FROM accidents
         WHERE is_deleted = false
           AND EXTRACT(YEAR FROM accident_date) = $1
         GROUP BY EXTRACT(MONTH FROM accident_date),
                  CASE
                    WHEN accident_type = '交通事故' THEN '交通事故'
                    ELSE '生产安全事故'
                  END
         ORDER BY EXTRACT(MONTH FROM accident_date), category`,
        [targetYear]
      );

      res.json({
        code: 0,
        data: {
          period: 'month',
          year: parseInt(targetYear),
          monthly: monthlyResult.rows.map(r => ({
            month: r.month,
            count: parseInt(r.count) || 0,
            responsibleCount: parseInt(r.responsible_count) || 0,
            casualties: parseInt(r.casualties) || 0,
            injuries: parseInt(r.injuries) || 0,
            lossAmount: parseFloat(r.loss_amount) || 0,
          })),
          typeMonthly: typeMonthlyResult.rows.map(r => ({
            month: r.month,
            category: r.category,
            count: parseInt(r.count) || 0,
          })),
        }
      });
    } else {
      // 年度趋势
      const yearlyResult = await pool.query(
        `SELECT
           EXTRACT(YEAR FROM accident_date)::int as year,
           COUNT(*) as count,
           COUNT(*) FILTER (WHERE responsibility_level = '责任') as responsible_count,
           COALESCE(SUM(casualties), 0) as casualties,
           COALESCE(SUM(injuries), 0) as injuries,
           COALESCE(SUM(loss_amount), 0) as loss_amount
         FROM accidents
         WHERE is_deleted = false
           AND accident_date >= CURRENT_DATE - INTERVAL '5 years'
         GROUP BY EXTRACT(YEAR FROM accident_date)
         ORDER BY EXTRACT(YEAR FROM accident_date)`
      );

      const typeYearlyResult = await pool.query(
        `SELECT
           EXTRACT(YEAR FROM accident_date)::int as year,
           CASE
             WHEN accident_type = '交通事故' THEN '交通事故'
             ELSE '生产安全事故'
           END as category,
           COUNT(*) as count
         FROM accidents
         WHERE is_deleted = false
           AND accident_date >= CURRENT_DATE - INTERVAL '5 years'
         GROUP BY EXTRACT(YEAR FROM accident_date),
                  CASE
                    WHEN accident_type = '交通事故' THEN '交通事故'
                    ELSE '生产安全事故'
                  END
         ORDER BY EXTRACT(YEAR FROM accident_date), category`
      );

      res.json({
        code: 0,
        data: {
          period: 'year',
          yearly: yearlyResult.rows.map(r => ({
            year: r.year,
            count: parseInt(r.count) || 0,
            responsibleCount: parseInt(r.responsible_count) || 0,
            casualties: parseInt(r.casualties) || 0,
            injuries: parseInt(r.injuries) || 0,
            lossAmount: parseFloat(r.loss_amount) || 0,
          })),
          typeYearly: typeYearlyResult.rows.map(r => ({
            year: r.year,
            category: r.category,
            count: parseInt(r.count) || 0,
          })),
        }
      });
    }
  } catch (e) {
    console.error('Accident trend error:', e);
    res.status(500).json({ code: 1, message: e.message });
  }
});

/**
 * 事故分类分析
 * GET /api/hse/accident-analysis/classification
 */
router.get('/classification', async (req, res) => {
  try {
    // 按事故类型分类
    const typeResult = await pool.query(
      `SELECT
         COALESCE(NULLIF(accident_type, ''), '未分类') as accident_type,
         COUNT(*) as count,
         COUNT(*) FILTER (WHERE responsibility_level = '责任') as responsible_count,
         COALESCE(SUM(casualties), 0) as casualties,
         COALESCE(SUM(injuries), 0) as injuries,
         COALESCE(SUM(loss_amount), 0) as loss_amount
       FROM accidents
       WHERE is_deleted = false
       GROUP BY accident_type
       ORDER BY count DESC`
    );

    // 按事故等级分类
    const levelResult = await pool.query(
      `SELECT
         COALESCE(NULLIF(level, ''), '未分级') as level,
         COUNT(*) as count,
         COALESCE(SUM(casualties), 0) as casualties,
         COALESCE(SUM(injuries), 0) as injuries,
         COALESCE(SUM(loss_amount), 0) as loss_amount
       FROM accidents
       WHERE is_deleted = false
       GROUP BY level
       ORDER BY
         CASE level
           WHEN '特别重大' THEN 1
           WHEN '重大' THEN 2
           WHEN '较大' THEN 3
           WHEN '一般' THEN 4
           ELSE 5
         END`
    );

    // 按乡镇/单位分类
    const townshipResult = await pool.query(
      `SELECT
         COALESCE(NULLIF(township, ''), '未知') as township,
         COUNT(*) as count,
         COUNT(*) FILTER (WHERE responsibility_level = '责任') as responsible_count
       FROM accidents
       WHERE is_deleted = false
       GROUP BY township
       ORDER BY count DESC
       LIMIT 20`
    );

    // 分类汇总（生产安全 vs 交通事故）
    const categoryResult = await pool.query(
      `SELECT
         CASE
           WHEN accident_type = '交通事故' THEN '交通事故'
           ELSE '生产安全事故'
         END as category,
         COUNT(*) as count,
         COUNT(*) FILTER (WHERE responsibility_level = '责任') as responsible_count,
         COALESCE(SUM(casualties), 0) as casualties,
         COALESCE(SUM(injuries), 0) as injuries,
         COALESCE(SUM(loss_amount), 0) as loss_amount,
         COUNT(*) FILTER (WHERE level IN ('重大', '特别重大')) as major_count
       FROM accidents
       WHERE is_deleted = false
       GROUP BY category`
    );

    res.json({
      code: 0,
      data: {
        categories: categoryResult.rows.map(r => ({
          category: r.category,
          count: parseInt(r.count) || 0,
          responsibleCount: parseInt(r.responsible_count) || 0,
          casualties: parseInt(r.casualties) || 0,
          injuries: parseInt(r.injuries) || 0,
          lossAmount: parseFloat(r.loss_amount) || 0,
          majorCount: parseInt(r.major_count) || 0,
        })),
        typeDetails: typeResult.rows.map(r => ({
          accidentType: r.accident_type,
          count: parseInt(r.count) || 0,
          responsibleCount: parseInt(r.responsible_count) || 0,
          casualties: parseInt(r.casualties) || 0,
          injuries: parseInt(r.injuries) || 0,
          lossAmount: parseFloat(r.loss_amount) || 0,
        })),
        levelDetails: levelResult.rows.map(r => ({
          level: r.level,
          count: parseInt(r.count) || 0,
          casualties: parseInt(r.casualties) || 0,
          injuries: parseInt(r.injuries) || 0,
          lossAmount: parseFloat(r.loss_amount) || 0,
        })),
        townshipDistribution: townshipResult.rows.map(r => ({
          township: r.township,
          count: parseInt(r.count) || 0,
          responsibleCount: parseInt(r.responsible_count) || 0,
        })),
      }
    });
  } catch (e) {
    console.error('Accident classification error:', e);
    res.status(500).json({ code: 1, message: e.message });
  }
});

/**
 * 责任人员分析
 * GET /api/hse/accident-analysis/responsible
 */
router.get('/responsible', async (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const offset = (page - 1) * pageSize;

    // TOP责任人员（按责任事故次数排序）
    const topResponsibleResult = await pool.query(
      `SELECT
         COALESCE(NULLIF(involved_person, ''), '未知') as person_name,
         COUNT(*) as accident_count,
         COUNT(*) FILTER (WHERE responsibility_level = '责任') as responsible_count,
         COUNT(*) FILTER (WHERE level IN ('重大', '特别重大')) as major_count,
         COALESCE(SUM(casualties), 0) as casualties,
         COALESCE(SUM(injuries), 0) as injuries,
         MAX(accident_date) as latest_accident_date
       FROM accidents
       WHERE is_deleted = false
         AND involved_person IS NOT NULL
         AND involved_person != ''
       GROUP BY person_name
       ORDER BY responsible_count DESC, accident_count DESC
       LIMIT 20`
    );

    // 责任人员岗位分布
    const positionResult = await pool.query(
      `SELECT
         COALESCE(p.name, '未知岗位') as position_name,
         COUNT(DISTINCT a.personnel_id) as person_count,
         COUNT(*) as accident_count,
         COUNT(*) FILTER (WHERE a.responsibility_level = '责任') as responsible_count
       FROM accidents a
       LEFT JOIN employee e ON e.id = a.personnel_id::bigint AND e.is_deleted = false
       LEFT JOIN employee_assignment ea ON ea.employee_id = e.id AND ea.is_current = true AND ea.is_deleted = false
       LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
       WHERE a.is_deleted = false
         AND a.personnel_id IS NOT NULL
         AND a.personnel_id::text ~ '^[0-9]+$'
       GROUP BY p.name
       ORDER BY responsible_count DESC
       LIMIT 20`
    );

    // 责任人员部门分布
    const deptResult = await pool.query(
      `SELECT
         COALESCE(o.org_name, '未知部门') as dept_name,
         COUNT(DISTINCT a.personnel_id) as person_count,
         COUNT(*) as accident_count,
         COUNT(*) FILTER (WHERE a.responsibility_level = '责任') as responsible_count
       FROM accidents a
       LEFT JOIN employee e ON e.id = a.personnel_id::bigint AND e.is_deleted = false
       LEFT JOIN employee_assignment ea ON ea.employee_id = e.id AND ea.is_current = true AND ea.is_deleted = false
       LEFT JOIN hse_org_unit o ON o.id = ea.org_unit_id AND o.is_deleted = false
       WHERE a.is_deleted = false
         AND a.personnel_id IS NOT NULL
         AND a.personnel_id::text ~ '^[0-9]+$'
       GROUP BY o.org_name
       ORDER BY responsible_count DESC
       LIMIT 20`
    );

    // 关联员工信息（用于跳转风险画像）
    const linkedEmployeesResult = await pool.query(
      `SELECT DISTINCT
         e.id as employee_id,
         e.name,
         e.employee_code,
         p.name as position_name,
         o.org_name,
         COUNT(a.id) as accident_count,
         COUNT(a.id) FILTER (WHERE a.responsibility_level = '责任') as responsible_count,
         MAX(a.accident_date) as latest_accident_date
       FROM accidents a
       JOIN employee e ON e.id = a.personnel_id::bigint AND e.is_deleted = false
       LEFT JOIN employee_assignment ea ON ea.employee_id = e.id AND ea.is_current = true AND ea.is_deleted = false
       LEFT JOIN position p ON p.id = ea.position_id AND p.is_deleted = false
       LEFT JOIN hse_org_unit o ON o.id = ea.org_unit_id AND o.is_deleted = false
       WHERE a.is_deleted = false
         AND a.personnel_id IS NOT NULL
         AND a.personnel_id::text ~ '^[0-9]+$'
       GROUP BY e.id, e.name, e.employee_code, p.name, o.org_name
       ORDER BY responsible_count DESC, accident_count DESC
       LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    );

    const totalResult = await pool.query(
      `SELECT COUNT(DISTINCT a.personnel_id) as total
       FROM accidents a
       WHERE a.is_deleted = false
         AND a.personnel_id IS NOT NULL
         AND a.personnel_id::text ~ '^[0-9]+$'`
    );

    res.json({
      code: 0,
      data: {
        topResponsible: topResponsibleResult.rows.map(r => ({
          personName: r.person_name,
          accidentCount: parseInt(r.accident_count) || 0,
          responsibleCount: parseInt(r.responsible_count) || 0,
          majorCount: parseInt(r.major_count) || 0,
          casualties: parseInt(r.casualties) || 0,
          injuries: parseInt(r.injuries) || 0,
          latestAccidentDate: r.latest_accident_date,
        })),
        positionDistribution: positionResult.rows.map(r => ({
          positionName: r.position_name,
          personCount: parseInt(r.person_count) || 0,
          accidentCount: parseInt(r.accident_count) || 0,
          responsibleCount: parseInt(r.responsible_count) || 0,
        })),
        departmentDistribution: deptResult.rows.map(r => ({
          departmentName: r.dept_name,
          personCount: parseInt(r.person_count) || 0,
          accidentCount: parseInt(r.accident_count) || 0,
          responsibleCount: parseInt(r.responsible_count) || 0,
        })),
        linkedEmployees: {
          list: linkedEmployeesResult.rows.map(r => ({
            employeeId: r.employee_id,
            name: r.name,
            employeeCode: r.employee_code,
            positionName: r.position_name,
            orgName: r.org_name,
            accidentCount: parseInt(r.accident_count) || 0,
            responsibleCount: parseInt(r.responsible_count) || 0,
            latestAccidentDate: r.latest_accident_date,
          })),
          total: parseInt(totalResult.rows[0].total) || 0,
          page: parseInt(page),
          pageSize: parseInt(pageSize),
        },
      }
    });
  } catch (e) {
    console.error('Responsible analysis error:', e);
    res.status(500).json({ code: 1, message: e.message });
  }
});

module.exports = router;

/**
 * BI 大屏数据路由
 * 提供 HSE 大屏展示所需的各类数据接口
 * 所有接口使用缓存层（TTL 30 秒），减少数据库压力
 *
 * 路由前缀: /api/hse/bi
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { success, error } = require('../middleware/response');
const { cacheMiddleware } = require('../middleware/cache');

// BI 缓存 TTL（毫秒），默认 30 秒
const BI_CACHE_TTL = parseInt(process.env.BI_CACHE_TTL) || 30000;

/**
 * GET /bi/overview - 总览数据
 * 返回所有核心安全指标的汇总数据
 *
 * 查询参数:
 *   - dimension: 维度筛选（可选，如 department, area）
 */
router.get('/overview', cacheMiddleware(BI_CACHE_TTL), async (req, res) => {
  try {
    // 并行查询各模块汇总数据
    const [hazardsResult, accidentsResult, trainingResult, vehiclesResult] = await Promise.all([
      // 隐患汇总
      pool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = '待整改') AS pending,
          COUNT(*) FILTER (WHERE status = '已整改') AS resolved,
          COUNT(*) FILTER (WHERE status = '整改中') AS in_progress,
          COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') AS last_30_days
        FROM hazards
        WHERE created_at >= CURRENT_DATE - INTERVAL '12 months'
      `),
      // 事故汇总
      pool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = '处理中') AS processing,
          COUNT(*) FILTER (WHERE status = '已结案') AS closed,
          COUNT(*) FILTER (WHERE severity = '重大') AS major,
          COUNT(*) FILTER (WHERE occurred_at >= CURRENT_DATE - INTERVAL '30 days') AS last_30_days
        FROM accidents
        WHERE occurred_at >= CURRENT_DATE - INTERVAL '12 months'
      `),
      // 培训汇总
      pool.query(`
        SELECT
          COUNT(*) AS total_sessions,
          COUNT(DISTINCT trainee_id) AS total_trainees,
          COUNT(*) FILTER (WHERE training_date >= CURRENT_DATE - INTERVAL '30 days') AS last_30_days
        FROM training_records
        WHERE training_date >= CURRENT_DATE - INTERVAL '12 months'
      `),
      // 车辆安全汇总
      pool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = '正常') AS normal,
          COUNT(*) FILTER (WHERE status = '维修中') AS maintenance,
          COUNT(*) FILTER (WHERE status = '停用') AS disabled
        FROM vehicles
      `)
    ]);

    const overview = {
      // 隐患指标
      hazards: {
        total: parseInt(hazardsResult.rows[0]?.total) || 0,
        pending: parseInt(hazardsResult.rows[0]?.pending) || 0,
        resolved: parseInt(hazardsResult.rows[0]?.resolved) || 0,
        inProgress: parseInt(hazardsResult.rows[0]?.in_progress) || 0,
        last30Days: parseInt(hazardsResult.rows[0]?.last_30_days) || 0
      },
      // 事故指标
      accidents: {
        total: parseInt(accidentsResult.rows[0]?.total) || 0,
        processing: parseInt(accidentsResult.rows[0]?.processing) || 0,
        closed: parseInt(accidentsResult.rows[0]?.closed) || 0,
        major: parseInt(accidentsResult.rows[0]?.major) || 0,
        last30Days: parseInt(accidentsResult.rows[0]?.last_30_days) || 0
      },
      // 培训指标
      training: {
        totalSessions: parseInt(trainingResult.rows[0]?.total_sessions) || 0,
        totalTrainees: parseInt(trainingResult.rows[0]?.total_trainees) || 0,
        last30Days: parseInt(trainingResult.rows[0]?.last_30_days) || 0
      },
      // 车辆指标
      vehicles: {
        total: parseInt(vehiclesResult.rows[0]?.total) || 0,
        normal: parseInt(vehiclesResult.rows[0]?.normal) || 0,
        maintenance: parseInt(vehiclesResult.rows[0]?.maintenance) || 0,
        disabled: parseInt(vehiclesResult.rows[0]?.disabled) || 0
      },
      // 系统时间
      timestamp: new Date().toISOString()
    };

    res.json(success(overview, '获取总览数据成功'));
  } catch (err) {
    console.error('[BI] 获取总览数据失败:', err.message);
    res.json(error(-1, '获取总览数据失败', { detail: err.message }));
  }
});

/**
 * GET /bi/trend - 趋势数据
 * 返回指定指标的时间趋势数据，用于折线图/柱状图展示
 *
 * 查询参数:
 *   - metricKey: 指标键（hazards, accidents, training 等）
 *   - period: 时间粒度（day, week, month）
 *   - dimension: 维度（department, area, level, type）
 *   - startDate: 开始日期（YYYY-MM-DD）
 *   - endDate: 结束日期（YYYY-MM-DD）
 */
router.get('/trend', cacheMiddleware(BI_CACHE_TTL), async (req, res) => {
  try {
    const {
      metricKey = 'hazards',
      period = 'month',
      dimension = '',
      startDate,
      endDate
    } = req.query;

    // 计算时间范围，默认最近 12 个月
    const start = startDate || '2025-07-01';
    const end = endDate || new Date().toISOString().split('T')[0];

    // 根据时间粒度确定 date_trunc 参数
    const truncMap = { day: 'day', week: 'week', month: 'month' };
    const trunc = truncMap[period] || 'month';

    let sql = '';
    const params = [start, end];

    switch (metricKey) {
      case 'hazards':
        sql = `
          SELECT
            date_trunc($3, created_at) AS period,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status = '待整改') AS pending,
            COUNT(*) FILTER (WHERE status = '已整改') AS resolved
          FROM hazards
          WHERE created_at >= $1 AND created_at <= $2
          GROUP BY date_trunc($3, created_at)
          ORDER BY period
        `;
        params.push(trunc);
        break;

      case 'accidents':
        sql = `
          SELECT
            date_trunc($3, occurred_at) AS period,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE severity = '重大') AS major,
            COUNT(*) FILTER (WHERE severity = '一般') AS minor
          FROM accidents
          WHERE occurred_at >= $1 AND occurred_at <= $2
          GROUP BY date_trunc($3, occurred_at)
          ORDER BY period
        `;
        params.push(trunc);
        break;

      case 'training':
        sql = `
          SELECT
            date_trunc($3, training_date) AS period,
            COUNT(*) AS sessions,
            COUNT(DISTINCT trainee_id) AS trainees
          FROM training_records
          WHERE training_date >= $1 AND training_date <= $2
          GROUP BY date_trunc($3, training_date)
          ORDER BY period
        `;
        params.push(trunc);
        break;

      default:
        return res.json(error(-1, `不支持的指标: ${metricKey}`));
    }

    const result = await pool.query(sql, params);

    const trend = {
      metricKey,
      period,
      dimension,
      startDate: start,
      endDate: end,
      data: result.rows.map(row => ({
        period: row.period,
        total: parseInt(row.total) || 0,
        ...(row.pending !== undefined && { pending: parseInt(row.pending) || 0 }),
        ...(row.resolved !== undefined && { resolved: parseInt(row.resolved) || 0 }),
        ...(row.major !== undefined && { major: parseInt(row.major) || 0 }),
        ...(row.minor !== undefined && { minor: parseInt(row.minor) || 0 }),
        ...(row.sessions !== undefined && { sessions: parseInt(row.sessions) || 0 }),
        ...(row.trainees !== undefined && { trainees: parseInt(row.trainees) || 0 })
      }))
    };

    res.json(success(trend, '获取趋势数据成功'));
  } catch (err) {
    console.error('[BI] 获取趋势数据失败:', err.message);
    res.json(error(-1, '获取趋势数据失败', { detail: err.message }));
  }
});

/**
 * GET /bi/ranking - 排名数据
 * 返回部门/区域的安全指标排名
 *
 * 查询参数:
 *   - type: 排名类型（department, area）
 *   - metricKey: 排名依据指标（hazards, accidents, training）
 *   - top: 返回前 N 名，默认 10
 *   - order: 排序方向（asc, desc），默认 desc
 */
router.get('/ranking', cacheMiddleware(BI_CACHE_TTL), async (req, res) => {
  try {
    const {
      type = 'department',
      metricKey = 'hazards',
      top = 10,
      order = 'desc'
    } = req.query;

    const limit = Math.min(parseInt(top) || 10, 50); // 最多返回 50 条
    const orderDir = order === 'asc' ? 'ASC' : 'DESC';
    const dimension = type === 'area' ? 'area' : 'department';

    let sql = '';
    const params = [limit];

    switch (metricKey) {
      case 'hazards':
        sql = `
          SELECT
            COALESCE(${dimension}, '未分配') AS name,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status = '待整改') AS pending,
            COUNT(*) FILTER (WHERE status = '已整改') AS resolved
          FROM hazards
          WHERE created_at >= CURRENT_DATE - INTERVAL '12 months'
          GROUP BY ${dimension}
          ORDER BY total ${orderDir}
          LIMIT $1
        `;
        break;

      case 'accidents':
        sql = `
          SELECT
            COALESCE(${dimension}, '未分配') AS name,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE severity = '重大') AS major
          FROM accidents
          WHERE occurred_at >= CURRENT_DATE - INTERVAL '12 months'
          GROUP BY ${dimension}
          ORDER BY total ${orderDir}
          LIMIT $1
        `;
        break;

      case 'training':
        sql = `
          SELECT
            COALESCE(${dimension}, '未分配') AS name,
            COUNT(*) AS sessions,
            COUNT(DISTINCT trainee_id) AS trainees
          FROM training_records
          WHERE training_date >= CURRENT_DATE - INTERVAL '12 months'
          GROUP BY ${dimension}
          ORDER BY sessions ${orderDir === 'ASC' ? 'ASC' : 'DESC'}
          LIMIT $1
        `;
        break;

      default:
        return res.json(error(-1, `不支持的指标: ${metricKey}`));
    }

    const result = await pool.query(sql, params);

    const ranking = {
      type,
      metricKey,
      order,
      data: result.rows.map(row => ({
        name: row.name,
        total: parseInt(row.total) || 0,
        ...(row.pending !== undefined && { pending: parseInt(row.pending) || 0 }),
        ...(row.resolved !== undefined && { resolved: parseInt(row.resolved) || 0 }),
        ...(row.major !== undefined && { major: parseInt(row.major) || 0 }),
        ...(row.sessions !== undefined && { sessions: parseInt(row.sessions) || 0 }),
        ...(row.trainees !== undefined && { trainees: parseInt(row.trainees) || 0 })
      }))
    };

    res.json(success(ranking, '获取排名数据成功'));
  } catch (err) {
    console.error('[BI] 获取排名数据失败:', err.message);
    res.json(error(-1, '获取排名数据失败', { detail: err.message }));
  }
});

/**
 * GET /bi/map - 地图数据
 * 返回各区域的隐患/事故热力数据
 *
 * 查询参数:
 *   - type: 数据类型（hazards, accidents）
 */
router.get('/map', cacheMiddleware(BI_CACHE_TTL), async (req, res) => {
  try {
    const { type = 'hazards' } = req.query;

    let sql = '';

    switch (type) {
      case 'hazards':
        sql = `
          SELECT
            COALESCE(area, '未分配') AS area,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status = '待整改') AS pending,
            COUNT(*) FILTER (WHERE level = '重大') AS high_risk,
            COUNT(*) FILTER (WHERE level = '一般') AS medium_risk,
            COUNT(*) FILTER (WHERE level = '轻微') AS low_risk
          FROM hazards
          WHERE created_at >= CURRENT_DATE - INTERVAL '3 months'
          GROUP BY area
          ORDER BY total DESC
        `;
        break;

      case 'accidents':
        sql = `
          SELECT
            COALESCE(area, '未分配') AS area,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE severity = '重大') AS major,
            COUNT(*) FILTER (WHERE severity = '一般') AS minor,
            COUNT(*) FILTER (WHERE severity = '轻微') AS slight
          FROM accidents
          WHERE occurred_at >= CURRENT_DATE - INTERVAL '3 months'
          GROUP BY area
          ORDER BY total DESC
        `;
        break;

      default:
        return res.json(error(-1, `不支持的数据类型: ${type}`));
    }

    const result = await pool.query(sql);

    const mapData = {
      type,
      data: result.rows.map(row => ({
        area: row.area,
        total: parseInt(row.total) || 0,
        ...(row.pending !== undefined && { pending: parseInt(row.pending) || 0 }),
        ...(row.high_risk !== undefined && { highRisk: parseInt(row.high_risk) || 0 }),
        ...(row.medium_risk !== undefined && { mediumRisk: parseInt(row.medium_risk) || 0 }),
        ...(row.low_risk !== undefined && { lowRisk: parseInt(row.low_risk) || 0 }),
        ...(row.major !== undefined && { major: parseInt(row.major) || 0 }),
        ...(row.minor !== undefined && { minor: parseInt(row.minor) || 0 }),
        ...(row.slight !== undefined && { slight: parseInt(row.slight) || 0 })
      }))
    };

    res.json(success(mapData, '获取地图数据成功'));
  } catch (err) {
    console.error('[BI] 获取地图数据失败:', err.message);
    res.json(error(-1, '获取地图数据失败', { detail: err.message }));
  }
});

/**
 * GET /bi/realtime - 实时数据
 * 返回当前系统实时状态，辅助 WebSocket 推送
 * 使用较短的缓存 TTL（10 秒）
 */
router.get('/realtime', cacheMiddleware(10000), async (req, res) => {
  try {
    const [todayHazards, todayAccidents, onlineUsers, pendingTasks] = await Promise.all([
      // 今日新增隐患
      pool.query(`SELECT COUNT(*) AS count FROM hazards WHERE created_at >= CURRENT_DATE`),
      // 今日新增事故
      pool.query(`SELECT COUNT(*) AS count FROM accidents WHERE occurred_at >= CURRENT_DATE`),
      // 在线用户数（近似值，基于最近的登录记录）
      pool.query(`
        SELECT COUNT(DISTINCT user_id) AS count
        FROM login_attempts
        WHERE attempt_time >= NOW() - INTERVAL '30 minutes' AND success = true
      `),
      // 待处理任务数
      pool.query(`
        SELECT COUNT(*) AS count FROM workflow_instances WHERE status = '进行中'
      `)
    ]);

    const realtime = {
      timestamp: new Date().toISOString(),
      todayHazards: parseInt(todayHazards.rows[0]?.count) || 0,
      todayAccidents: parseInt(todayAccidents.rows[0]?.count) || 0,
      onlineUsers: parseInt(onlineUsers.rows[0]?.count) || 0,
      pendingTasks: parseInt(pendingTasks.rows[0]?.count) || 0
    };

    res.json(success(realtime, '获取实时数据成功'));
  } catch (err) {
    console.error('[BI] 获取实时数据失败:', err.message);
    res.json(error(-1, '获取实时数据失败', { detail: err.message }));
  }
});

module.exports = router;

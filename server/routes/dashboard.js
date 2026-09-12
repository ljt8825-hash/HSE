/**
 * Dashboard 路由 — 前端看板核心 API
 * 提供指标汇总、趋势分析、安全告警、历史记录与导出接口
 */

const express = require('express');
const router = express.Router();
const { pool, isConnected } = require('../config/db');
const { success, error } = require('../middleware/response');
const fs = require('fs');
const path = require('path');

// ========= 辅助函数 =========

/**
 * 安全查询：表不存在时返回空结果而非抛错
 */
async function safeQuery(sql, params = []) {
  const result = await pool.query(sql, params);
  return result;
}

/**
 * 根据 period 计算当前周期与上一周期的时间范围
 * 返回 { currentStart, previousStart, previousEnd, periodLabel }
 */
function getPeriodRanges(period) {
  const now = new Date();
  let currentStart, previousStart, previousEnd, periodLabel;

  switch (period) {
    case 'year':
      currentStart = new Date(now.getFullYear(), 0, 1);
      previousStart = new Date(now.getFullYear() - 1, 0, 1);
      previousEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
      periodLabel = '较去年';
      break;
    case 'month':
      currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
      previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      previousEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      periodLabel = '较上月';
      break;
    case 'week':
      const dayOfWeek = now.getDay() || 7; // 周日=7
      currentStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek + 1);
      previousStart = new Date(currentStart.getTime() - 7 * 24 * 60 * 60 * 1000);
      previousEnd = new Date(currentStart.getTime() - 1);
      periodLabel = '较上周';
      break;
    case 'day':
    default:
      currentStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      previousStart = new Date(currentStart.getTime() - 24 * 60 * 60 * 1000);
      previousEnd = new Date(currentStart.getTime() - 1);
      periodLabel = '较昨日';
      break;
  }

  return { currentStart, previousStart, previousEnd, periodLabel };
}

/**
 * 计算变化率
 */
function calcChangeRate(current, previous) {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  const rate = ((current - previous) / previous) * 100;
  return Math.round(rate * 10) / 10;
}

/**
 * metricKey → 数据库表/字段的映射配置
 */
const METRIC_CONFIG = {
  hazards_total: { table: 'hazards', dateColumn: 'created_at', statusFilter: null, name: '隐患排查' },
  hazards_fixed: { table: 'hazards', dateColumn: 'created_at', statusFilter: "'已整改','已验收'", name: '已整改' },
  accidents_total: { table: 'accidents', dateColumn: 'occurred_at', statusFilter: null, name: '事故总数' },
  accidents_pending: { table: 'accidents', dateColumn: 'occurred_at', statusFilter: "'待处理','处理中'", name: '待处理' },
  training_count: { table: 'training_records', dateColumn: 'training_date', statusFilter: null, name: '培训次数' },
  sanwei_count: { table: 'sanwei_violations', dateColumn: 'violation_date', statusFilter: null, name: '三违次数' }
};

// ========= 1. GET /metrics — 核心指标汇总 =========

router.get('/metrics', async (req, res) => {
  try {
    const period = req.query.period || 'day';
    const departmentId = req.query.departmentId || null;

    if (!isConnected()) {
      // 数据库离线时返回全零指标
      const metrics = [
        { key: 'hazards_total', name: '隐患总数', value: 0, unit: '条', changeRate: 0, changeType: 'flat', period: '' },
        { key: 'hazards_fixed', name: '已整改', value: 0, unit: '条', changeRate: 0, changeType: 'flat', period: '' },
        { key: 'accidents_total', name: '事故总数', value: 0, unit: '起', changeRate: 0, changeType: 'flat', period: '' },
        { key: 'accidents_pending', name: '待处理', value: 0, unit: '起', changeRate: 0, changeType: 'flat', period: '' },
        { key: 'training_count', name: '培训次数', value: 0, unit: '次', changeRate: 0, changeType: 'flat', period: '' },
        { key: 'sanwei_count', name: '三违次数', value: 0, unit: '次', changeRate: 0, changeType: 'flat', period: '' }
      ];
      return res.json(success(metrics, '查询成功(内存模式)'));
    }

    const { currentStart, previousStart, previousEnd, periodLabel } = getPeriodRanges(period);

    // 构建部门过滤条件
    const deptCondition = departmentId ? ' AND department = $3' : '';
    const currentParams = departmentId
      ? [currentStart.toISOString(), '已整改', departmentId]
      : [currentStart.toISOString(), '已整改'];
    const previousParams = departmentId
      ? [previousStart.toISOString(), previousEnd.toISOString(), departmentId]
      : [previousStart.toISOString(), previousEnd.toISOString()];

    // 为避免 statusFilter 注入，用白名单映射
    const metricQueries = [
      {
        key: 'hazards_total',
        currentSql: `SELECT COUNT(*)::int AS cnt FROM hazards WHERE created_at >= $1${departmentId ? ' AND department = $3' : ''}`,
        previousSql: `SELECT COUNT(*)::int AS cnt FROM hazards WHERE created_at >= $1 AND created_at < $2${departmentId ? ' AND department = $3' : ''}`
      },
      {
        key: 'hazards_fixed',
        currentSql: `SELECT COUNT(*)::int AS cnt FROM hazards WHERE created_at >= $1 AND status = '已整改'${departmentId ? ' AND department = $3' : ''}`,
        previousSql: `SELECT COUNT(*)::int AS cnt FROM hazards WHERE created_at >= $1 AND created_at < $2 AND status = '已整改'${departmentId ? ' AND department = $3' : ''}`
      },
      {
        key: 'accidents_total',
        currentSql: `SELECT COUNT(*)::int AS cnt FROM accidents WHERE occurred_at >= $1${departmentId ? ' AND department = $3' : ''}`,
        previousSql: `SELECT COUNT(*)::int AS cnt FROM accidents WHERE occurred_at >= $1 AND occurred_at < $2${departmentId ? ' AND department = $3' : ''}`
      },
      {
        key: 'accidents_pending',
        currentSql: `SELECT COUNT(*)::int AS cnt FROM accidents WHERE occurred_at >= $1 AND status IN ('待处理','处理中')${departmentId ? ' AND department = $3' : ''}`,
        previousSql: `SELECT COUNT(*)::int AS cnt FROM accidents WHERE occurred_at >= $1 AND occurred_at < $2 AND status IN ('待处理','处理中')${departmentId ? ' AND department = $3' : ''}`
      },
      {
        key: 'training_count',
        currentSql: `SELECT COUNT(*)::int AS cnt FROM training_records WHERE training_date >= $1${departmentId ? ' AND department = $3' : ''}`,
        previousSql: `SELECT COUNT(*)::int AS cnt FROM training_records WHERE training_date >= $1 AND training_date < $2${departmentId ? ' AND department = $3' : ''}`
      },
      {
        key: 'sanwei_count',
        currentSql: `SELECT COUNT(*)::int AS cnt FROM sanwei_violations WHERE violation_date >= $1${departmentId ? ' AND department = $3' : ''}`,
        previousSql: `SELECT COUNT(*)::int AS cnt FROM sanwei_violations WHERE violation_date >= $1 AND violation_date < $2${departmentId ? ' AND department = $3' : ''}`
      }
    ];

    // 并行查询所有指标的当前值和上一周期值
    const results = await Promise.all(
      metricQueries.map(async (mq) => {
        try {
          const [currentRes, previousRes] = await Promise.all([
            safeQuery(mq.currentSql, currentParams),
            safeQuery(mq.previousSql, previousParams)
          ]);
          const currentVal = currentRes.rows[0]?.cnt || 0;
          const previousVal = previousRes.rows[0]?.cnt || 0;
          return { key: mq.key, current: currentVal, previous: previousVal };
        } catch (e) {
          return { key: mq.key, current: 0, previous: 0 };
        }
      })
    );

    // 组装指标数组
    const metricMap = {
      hazards_total: { name: '隐患总数', unit: '条' },
      hazards_fixed: { name: '已整改', unit: '条' },
      accidents_total: { name: '事故总数', unit: '起' },
      accidents_pending: { name: '待处理', unit: '起' },
      training_count: { name: '培训次数', unit: '次' },
      sanwei_count: { name: '三违次数', unit: '次' }
    };

    const metrics = results.map((r) => {
      const config = metricMap[r.key];
      const changeRate = calcChangeRate(r.current, r.previous);
      let changeType = 'flat';
      if (changeRate > 0) changeType = 'up';
      else if (changeRate < 0) changeType = 'down';

      return {
        key: r.key,
        name: config.name,
        value: r.current,
        unit: config.unit,
        changeRate,
        changeType,
        period: periodLabel
      };
    });

    res.json(success(metrics, '查询成功'));
  } catch (err) {
    console.error('[Dashboard /metrics] 查询失败:', err.message);
    res.status(500).json(error(500, '服务器内部错误'));
  }
});

// ========= 2. GET /trend — 趋势数据 =========

router.get('/trend', async (req, res) => {
  try {
    const { metricKey, startDate, endDate, dimension } = req.query;

    if (!metricKey) {
      return res.status(400).json(error(400, '缺少必填参数 metricKey'));
    }

    const config = METRIC_CONFIG[metricKey];
    if (!config) {
      return res.status(400).json(error(400, `不支持的 metricKey: ${metricKey}`));
    }

    if (!isConnected()) {
      return res.json(success({
        metricName: config.name,
        unit: '条',
        data: []
      }, '查询成功(内存模式)'));
    }

    const dim = dimension || 'day';
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const end = endDate || new Date().toISOString().split('T')[0];

    // 验证 dimension 白名单
    const validDims = ['day', 'week', 'month'];
    const truncDim = validDims.includes(dim) ? dim : 'day';

    // 构建 WHERE 子句
    let whereClause = `${config.dateColumn}::date >= $1 AND ${config.dateColumn}::date <= $2`;
    const params = [start, end];
    let paramIdx = 3;

    if (config.statusFilter) {
      whereClause += ` AND status IN (${config.statusFilter})`;
    }

    // 构建 SQL：按时间维度分组统计
    const sql = `
      SELECT 
        date_trunc('${truncDim}', ${config.dateColumn})::date AS date,
        COUNT(*)::int AS value
      FROM ${config.table}
      WHERE ${whereClause}
      GROUP BY date_trunc('${truncDim}', ${config.dateColumn})
      ORDER BY date ASC
    `;

    let data = [];
    try {
      const result = await safeQuery(sql, params);
      data = result.rows.map((row) => ({
        date: row.date ? row.date.toISOString().split('T')[0] : null,
        value: row.value || 0,
        targetValue: null
      }));
    } catch (e) {
      // 表不存在，返回空数组
      data = [];
    }

    const unitMap = {
      hazards_total: '条', hazards_fixed: '条',
      accidents_total: '起', accidents_pending: '起',
      training_count: '次', sanwei_count: '次'
    };

    res.json(success({
      metricName: config.name,
      unit: unitMap[metricKey] || '条',
      data
    }, '查询成功'));
  } catch (err) {
    console.error('[Dashboard /trend] 查询失败:', err.message);
    res.status(500).json(error(500, '服务器内部错误'));
  }
});

// ========= 3. GET /alerts — 安全告警列表 =========

router.get('/alerts', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.max(1, Math.min(100, parseInt(req.query.pageSize) || 10));
    const { level, status, keyword } = req.query;
    const offset = (page - 1) * pageSize;

    if (!isConnected()) {
      return res.json(success({ list: [], total: 0 }, '查询成功(内存模式)'));
    }

    // 构建查询条件
    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (level) {
      conditions.push(`level = $${paramIdx++}`);
      params.push(level);
    }

    if (status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(status);
    }

    if (keyword) {
      conditions.push(`title ILIKE $${paramIdx++}`);
      params.push(`%${keyword}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 并行查询总数和数据列表
    let total = 0;
    let list = [];

    try {
      const [countResult, dataResult] = await Promise.all([
        safeQuery(`SELECT COUNT(*)::int AS total FROM hazards ${whereClause}`, params),
        safeQuery(
          `SELECT id, title, level, created_at AS time, status
           FROM hazards
           ${whereClause}
           ORDER BY created_at DESC
           LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
          [...params, pageSize, offset]
        )
      ]);

      total = countResult.rows[0]?.total || 0;
      list = dataResult.rows.map((row) => ({
        id: row.id,
        title: row.title,
        level: row.level,
        time: row.time,
        status: row.status
      }));
    } catch (e) {
      // hazards 表不存在
      list = [];
      total = 0;
    }

    res.json(success({ list, total }, '查询成功'));
  } catch (err) {
    console.error('[Dashboard /alerts] 查询失败:', err.message);
    res.status(500).json(error(500, '服务器内部错误'));
  }
});

// ========= 4. GET /history — 历史记录 =========

router.get('/history', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.max(1, Math.min(100, parseInt(req.query.pageSize) || 10));
    const { type, keyword } = req.query;
    const offset = (page - 1) * pageSize;

    if (!isConnected()) {
      return res.json(success({ list: [], total: 0 }, '查询成功(内存模式)'));
    }

    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (type) {
      conditions.push(`type = $${paramIdx++}`);
      params.push(type);
    }

    if (keyword) {
      conditions.push(`(title ILIKE $${paramIdx++} OR description ILIKE $${paramIdx++})`);
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    let total = 0;
    let list = [];

    try {
      const [countResult, dataResult] = await Promise.all([
        safeQuery(`SELECT COUNT(*)::int AS total FROM audit_logs ${whereClause}`, params),
        safeQuery(
          `SELECT id, type, title, description, created_by, created_at
           FROM audit_logs
           ${whereClause}
           ORDER BY created_at DESC
           LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
          [...params, pageSize, offset]
        )
      ]);

      total = countResult.rows[0]?.total || 0;
      list = dataResult.rows.map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        description: row.description,
        operator: row.created_by,
        time: row.created_at
      }));
    } catch (e) {
      list = [];
      total = 0;
    }

    res.json(success({ list, total }, '查询成功'));
  } catch (err) {
    console.error('[Dashboard /history] 查询失败:', err.message);
    res.status(500).json(error(500, '服务器内部错误'));
  }
});

// ========= 5. GET /export — 数据导出 =========

router.get('/export', async (req, res) => {
  try {
    const { format, type, startDate, endDate } = req.query;
    const exportFormat = format || 'excel';
    const exportType = type || 'metrics';

    if (!isConnected()) {
      return res.json(error(500, '数据库未连接，无法导出'));
    }

    const exportsDir = path.join(__dirname, '../exports');
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }

    let filename, content, contentType;

    if (exportFormat === 'excel') {
      filename = `dashboard_export_${exportType}_${Date.now()}.csv`;
      contentType = 'text/csv';

      let headers = '';
      let rows = [];

      if (exportType === 'metrics') {
        headers = '指标名称,数值,单位,变化率,变化类型\n';
        const metricsRes = await safeQuery(`SELECT * FROM hazards LIMIT 100`);
        rows = metricsRes.rows.map(r => `${r.title || '隐患'},${r.id || 0},条,0,flat`);
      } else if (exportType === 'alerts') {
        headers = '标题,级别,状态,创建时间\n';
        const alertsRes = await safeQuery(`SELECT title, level, status, created_at FROM hazards LIMIT 100`);
        rows = alertsRes.rows.map(r => `${r.title || ''},${r.level || ''},${r.status || ''},${r.created_at || ''}`);
      } else if (exportType === 'history') {
        headers = '类型,标题,描述,操作人,操作时间\n';
        const historyRes = await safeQuery(`SELECT type, title, description, created_by, created_at FROM audit_logs LIMIT 100`);
        rows = historyRes.rows.map(r => `${r.type || ''},${r.title || ''},${r.description || ''},${r.created_by || ''},${r.created_at || ''}`);
      }

      content = headers + rows.join('\n');
    } else if (exportFormat === 'pdf') {
      filename = `dashboard_export_${exportType}_${Date.now()}.txt`;
      contentType = 'text/plain';
      content = `宁津环卫HSE安全管理系统 - 数据导出\n导出类型: ${exportType}\n导出时间: ${new Date().toISOString()}\n\n[暂不支持PDF，导出为文本格式]\n\n数据统计:\n- 导出记录数: 0\n- 导出周期: ${startDate || '全部'} ~ ${endDate || '全部'}`;
    } else {
      return res.status(400).json(error(400, '不支持的导出格式'));
    }

    const filePath = path.join(exportsDir, filename);
    fs.writeFileSync(filePath, content, 'utf8');

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', contentType);
    res.send(content);
  } catch (err) {
    console.error('[Dashboard /export] 导出失败:', err.message);
    res.status(500).json(error(500, '导出失败'));
  }
});

// ========= 6. PATCH /alerts/:id/status — 更新告警状态 =========

router.patch('/alerts/:id/status', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status } = req.body;

    if (!id || !status) {
      return res.status(400).json(error(400, '缺少必填参数'));
    }

    const validStatus = ['待处理', '处理中', '已关闭', '已整改', '已验收'];
    if (!validStatus.includes(status)) {
      return res.status(400).json(error(400, `无效状态值: ${status}`));
    }

    if (!isConnected()) {
      return res.json(success({ id, status }, '操作成功(内存模式)'));
    }

    const result = await safeQuery(
      'UPDATE hazards SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, status',
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json(error(404, '记录不存在'));
    }

    res.json(success(result.rows[0], '状态更新成功'));
  } catch (err) {
    console.error('[Dashboard /alerts/status] 更新失败:', err.message);
    res.status(500).json(error(500, '服务器内部错误'));
  }
});

module.exports = router;

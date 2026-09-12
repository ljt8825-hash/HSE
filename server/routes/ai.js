/**
 * AI 辅助路由
 * 提供 HSE 智能分析接口（风险预测、智能分类、异常检测、智能问答）
 * 当前版本基于统计规则实现，后续可接入 ML 模型
 *
 * 路由前缀: /api/hse/ai
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { success, error } = require('../middleware/response');
const { validateBody } = require('../middleware/validate');
const { z } = require('zod');

// ============================================================
// Zod 校验 Schema
// ============================================================

/** 风险预测请求参数 */
const riskPredictSchema = z.object({
  /** 分析的时间范围（天数），默认 30 */
  periodDays: z.number().int().min(7).max(365).optional().default(30),
  /** 分析的区域 */
  area: z.string().optional(),
  /** 分析的维度（department, area, type） */
  dimension: z.string().optional().default('area'),
  /** 是否返回详细数据 */
  detail: z.boolean().optional().default(false)
});

/** 智能分类请求参数 */
const classifySchema = z.object({
  /** 待分类的数据类型 */
  type: z.enum(['hazard', 'accident']),
  /** 待分类的数据 */
  data: z.object({
    title: z.string().min(1),
    description: z.string().optional().default(''),
    area: z.string().optional(),
    category: z.string().optional()
  })
});

/** 异常检测请求参数 */
const anomalyDetectSchema = z.object({
  /** 检测的数据源 */
  dataSource: z.enum(['hazards', 'accidents', 'training', 'login']),
  /** 检测的时间窗口（天数） */
  windowDays: z.number().int().min(7).max(90).optional().default(30),
  /** 异常阈值倍数（标准差倍数），默认 2 */
  threshold: z.number().min(1).max(5).optional().default(2)
});

/** 智能问答请求参数 */
const qaSchema = z.object({
  /** 用户提出的问题 */
  question: z.string().min(1).max(500),
  /** 上下文信息 */
  context: z.string().optional().default('')
});

// ============================================================
// 路由定义
// ============================================================

/**
 * POST /ai/risk-predict - 风险预测
 * 基于历史数据的统计分析，预测未来可能出现的安全风险
 *
 * 请求体:
 *   - periodDays: 分析历史天数（默认 30）
 *   - area: 区域筛选（可选）
 *   - dimension: 分析维度
 *   - detail: 是否返回详细数据
 */
router.post('/risk-predict', validateBody(riskPredictSchema), async (req, res) => {
  try {
    const { periodDays, area, dimension, detail } = req.body;

    // 1. 获取历史数据
    const params = [periodDays];
    let areaFilter = '';
    if (area) {
      params.push(area);
      areaFilter = ` AND COALESCE(area, '') = $${params.length}`;
    }

    // 隐患趋势
    const hazardTrend = await pool.query(`
      SELECT
        date_trunc('day', created_at) AS day,
        COUNT(*) AS count
      FROM hazards
      WHERE created_at >= CURRENT_DATE - ($1 || ' days')::INTERVAL ${areaFilter}
      GROUP BY date_trunc('day', created_at)
      ORDER BY day
    `, params);

    // 事故趋势
    const accidentTrend = await pool.query(`
      SELECT
        date_trunc('day', occurred_at) AS day,
        COUNT(*) AS count
      FROM accidents
      WHERE occurred_at >= CURRENT_DATE - ($1 || ' days')::INTERVAL ${areaFilter}
      GROUP BY date_trunc('day', occurred_at)
      ORDER BY day
    `, params);

    // 2. 统计分析
    const hazardCounts = hazardTrend.rows.map(r => parseInt(r.count) || 0);
    const accidentCounts = accidentTrend.rows.map(r => parseInt(r.count) || 0);

    // 计算均值和标准差
    const mean = arr => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const stddev = arr => {
      const m = mean(arr);
      return Math.sqrt(arr.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / arr.length);
    };

    const hazardMean = mean(hazardCounts);
    const hazardStd = stddev(hazardCounts);
    const accidentMean = mean(accidentCounts);
    const accidentStd = stddev(accidentCounts);

    // 3. 生成预测
    const prediction = {
      periodDays,
      dimension,
      area: area || '全部',
      timestamp: new Date().toISOString(),
      // 隐患风险预测
      hazardRisk: {
        dailyAverage: Math.round(hazardMean * 100) / 100,
        dailyStddev: Math.round(hazardStd * 100) / 100,
        trend: hazardCounts.length >= 7
          ? (hazardCounts.slice(-7).reduce((a, b) => a + b, 0) / 7) > hazardMean ? '上升' : '下降'
          : '数据不足',
        riskLevel: hazardStd > hazardMean * 0.5 ? '高' : hazardStd > hazardMean * 0.2 ? '中' : '低',
        predictedNextWeek: Math.round(hazardMean * 7)
      },
      // 事故风险预测
      accidentRisk: {
        dailyAverage: Math.round(accidentMean * 100) / 100,
        dailyStddev: Math.round(accidentStd * 100) / 100,
        trend: accidentCounts.length >= 7
          ? (accidentCounts.slice(-7).reduce((a, b) => a + b, 0) / 7) > accidentMean ? '上升' : '下降'
          : '数据不足',
        riskLevel: accidentStd > accidentMean * 0.5 ? '高' : accidentStd > accidentMean * 0.2 ? '中' : '低',
        predictedNextWeek: Math.round(accidentMean * 7)
      }
    };

    // 附加详细数据（可选）
    if (detail) {
      prediction.hazardRisk.dailyData = hazardTrend.rows.map(r => ({
        day: r.day,
        count: parseInt(r.count) || 0
      }));
      prediction.accidentRisk.dailyData = accidentTrend.rows.map(r => ({
        day: r.day,
        count: parseInt(r.count) || 0
      }));
    }

    res.json(success(prediction, '风险预测分析完成'));
  } catch (err) {
    console.error('[AI] 风险预测失败:', err.message);
    res.json(error(-1, '风险预测分析失败', { detail: err.message }));
  }
});

/**
 * POST /ai/classify - 智能分类
 * 基于关键词规则对隐患/事故进行智能分类
 *
 * 请求体:
 *   - type: 数据类型（hazard, accident）
 *   - data: 待分类数据 { title, description, area, category }
 */
router.post('/classify', validateBody(classifySchema), async (req, res) => {
  try {
    const { type, data } = req.body;

    // 关键词分类规则（可后续替换为 ML 模型）
    const hazardCategories = {
      '电气安全': ['电线', '电缆', '配电', '漏电', '触电', '电气', '开关', '电箱'],
      '机械安全': ['机械', '设备', '齿轮', '传动', '防护罩', '刹车', '起重'],
      '消防安全': ['消防', '灭火器', '喷淋', '防火', '疏散', '通道', '烟感'],
      '交通安全': ['交通', '车辆', '道路', '驾驶', '运输', '车速', '盲区'],
      '化学安全': ['化学', '危化品', '毒物', '泄漏', '腐蚀', '爆炸', '气体'],
      '高处作业': ['高空', '坠落', '脚手架', '安全带', '临边', '护栏'],
      '环境卫生': ['垃圾', '污水', '扬尘', '噪音', '卫生', '清洁'],
      '其他': []
    };

    const accidentTypes = {
      '物体打击': ['砸伤', '坠物', '打击', '掉落'],
      '车辆伤害': ['碰撞', '碾压', '刮擦', '追尾'],
      '机械伤害': ['绞伤', '夹伤', '切割', '卷入'],
      '触电': ['电击', '漏电', '触电'],
      '火灾爆炸': ['着火', '爆炸', '燃烧'],
      '高处坠落': ['坠落', '摔伤', '跌落'],
      '中毒窒息': ['中毒', '窒息', '缺氧'],
      '其他': []
    };

    const rules = type === 'hazard' ? hazardCategories : accidentTypes;
    const text = `${data.title} ${data.description}`.toLowerCase();

    // 匹配关键词
    let bestMatch = '其他';
    let matchScore = 0;

    for (const [category, keywords] of Object.entries(rules)) {
      const score = keywords.reduce((sum, kw) => {
        return sum + (text.includes(kw) ? 1 : 0);
      }, 0);
      if (score > matchScore) {
        matchScore = score;
        bestMatch = category;
      }
    }

    const classification = {
      type,
      input: { title: data.title, description: data.description.substring(0, 100) },
      result: {
        category: bestMatch,
        confidence: matchScore > 0 ? Math.min(Math.round((matchScore / text.length) * 100 + 50), 95) : 30,
        method: 'keyword-rules',
        matchedKeywords: matchScore
      },
      timestamp: new Date().toISOString()
    };

    res.json(success(classification, '智能分类完成'));
  } catch (err) {
    console.error('[AI] 智能分类失败:', err.message);
    res.json(error(-1, '智能分类失败', { detail: err.message }));
  }
});

/**
 * POST /ai/anomaly-detect - 异常检测
 * 基于统计方法检测安全数据中的异常波动
 *
 * 请求体:
 *   - dataSource: 数据源（hazards, accidents, training, login）
 *   - windowDays: 时间窗口（天）
 *   - threshold: 异常阈值（标准差倍数）
 */
router.post('/anomaly-detect', validateBody(anomalyDetectSchema), async (req, res) => {
  try {
    const { dataSource, windowDays, threshold } = req.body;

    // 根据数据源查询时间序列数据
    let sql = '';
    const params = [windowDays, threshold];

    switch (dataSource) {
      case 'hazards':
        sql = `
          SELECT
            date_trunc('day', created_at) AS day,
            COUNT(*) AS value
          FROM hazards
          WHERE created_at >= CURRENT_DATE - ($1 || ' days')::INTERVAL
          GROUP BY day ORDER BY day
        `;
        break;
      case 'accidents':
        sql = `
          SELECT
            date_trunc('day', occurred_at) AS day,
            COUNT(*) AS value
          FROM accidents
          WHERE occurred_at >= CURRENT_DATE - ($1 || ' days')::INTERVAL
          GROUP BY day ORDER BY day
        `;
        break;
      case 'training':
        sql = `
          SELECT
            date_trunc('day', training_date) AS day,
            COUNT(*) AS value
          FROM training_records
          WHERE training_date >= CURRENT_DATE - ($1 || ' days')::INTERVAL
          GROUP BY day ORDER BY day
        `;
        break;
      case 'login':
        sql = `
          SELECT
            date_trunc('day', attempt_time) AS day,
            COUNT(*) FILTER (WHERE success = false) AS value
          FROM login_attempts
          WHERE attempt_time >= CURRENT_DATE - ($1 || ' days')::INTERVAL
          GROUP BY day ORDER BY day
        `;
        break;
      default:
        return res.json(error(-1, `不支持的数据源: ${dataSource}`));
    }

    const result = await pool.query(sql, params.slice(0, 1));
    const values = result.rows.map(r => parseInt(r.value) || 0);

    // 计算统计指标
    const mean = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const std = Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length);
    const upperBound = mean + threshold * std;
    const lowerBound = Math.max(0, mean - threshold * std);

    // 检测异常点
    const anomalies = result.rows
      .map((row, idx) => ({
        day: row.day,
        value: parseInt(row.value) || 0,
        isAnomaly: (parseInt(row.value) || 0) > upperBound || (parseInt(row.value) || 0) < lowerBound,
        deviation: mean > 0 ? Math.round(Math.abs((parseInt(row.value) || 0) - mean) / mean * 100) : 0
      }))
      .filter(item => item.isAnomaly);

    const detection = {
      dataSource,
      windowDays,
      threshold,
      statistics: {
        dataPoints: values.length,
        mean: Math.round(mean * 100) / 100,
        stddev: Math.round(std * 100) / 100,
        upperBound: Math.round(upperBound * 100) / 100,
        lowerBound: Math.round(lowerBound * 100) / 100
      },
      anomalyCount: anomalies.length,
      anomalies,
      hasAnomaly: anomalies.length > 0,
      timestamp: new Date().toISOString()
    };

    res.json(success(detection, '异常检测完成'));
  } catch (err) {
    console.error('[AI] 异常检测失败:', err.message);
    res.json(error(-1, '异常检测失败', { detail: err.message }));
  }
});

/**
 * POST /ai/qa - 智能问答（预留接口）
 * 当前返回 mock 数据，后续接入 LLM 模型
 *
 * 请求体:
 *   - question: 用户问题
 *   - context: 上下文信息
 */
router.post('/qa', validateBody(qaSchema), async (req, res) => {
  try {
    const { question, context } = req.body;

    // 当前为预留接口，返回 mock 响应
    // 后续可接入 GPT/通义千问/文心一言等 LLM 服务
    const mockResponse = {
      question,
      answer: '智能问答功能正在开发中，即将支持自然语言查询 HSE 安全数据。' +
        '当前可用功能包括：风险预测、隐患分类、异常检测等。',
      confidence: 0,
      source: 'mock',
      timestamp: new Date().toISOString(),
      _note: '此接口为预留接口，当前返回 mock 数据。接入 LLM 后将返回真实回答。'
    };

    res.json(success(mockResponse, '智能问答（预留接口）'));
  } catch (err) {
    console.error('[AI] 智能问答失败:', err.message);
    res.json(error(-1, '智能问答处理失败', { detail: err.message }));
  }
});

module.exports = router;

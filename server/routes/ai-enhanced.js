/**
 * AI 增强路由
 * 在 ai.js 基础上扩展，提供智能报告生成、根因分析、AI 生成历史管理等功能
 * 独立文件，不覆盖 ai.js 的原有路由
 *
 * 路由前缀: /api/hse/ai
 *
 * 与 ai.js 的路径分工：
 *   ai.js:          /risk-predict, /classify, /anomaly-detect, /qa
 *   ai-enhanced.js: /generate-report, /root-cause, /records, /provider/status
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { success, error } = require('../middleware/response');
const { requireRole } = require('../middleware/auth');
const aiService = require('../services/aiService');

// ============================================================
// 内部工具函数
// ============================================================

/**
 * 根据数据类型从数据库获取原始数据
 * @param {string} type - 数据类型（hazard, accident, training, patrol）
 * @param {number} dataId - 数据 ID
 * @returns {Promise<Object>} 查询到的数据
 */
async function fetchDataByType(type, dataId) {
  switch (type) {
    case 'hazard': {
      const result = await pool.query(
        `SELECT id, title, description, level, status, area, category,
                reporter_name, created_at, rectification_deadline
         FROM hazards WHERE id = $1`, [dataId]
      );
      if (result.rows.length === 0) throw new Error(`隐患记录不存在（ID: ${dataId}）`);
      return result.rows[0];
    }
    case 'accident': {
      const result = await pool.query(
        `SELECT id, title, description, type, severity, status, area,
                occurred_at, casualties, economic_loss, reporter_name
         FROM accidents WHERE id = $1`, [dataId]
      );
      if (result.rows.length === 0) throw new Error(`事故记录不存在（ID: ${dataId}）`);
      return result.rows[0];
    }
    case 'training': {
      const result = await pool.query(
        `SELECT id, title, training_type, trainer, training_date,
                location, participant_count, status, description
         FROM training_records WHERE id = $1`, [dataId]
      );
      if (result.rows.length === 0) throw new Error(`培训记录不存在（ID: ${dataId}）`);
      return result.rows[0];
    }
    case 'patrol': {
      const result = await pool.query(
        `SELECT id, title, area, patrol_person, patrol_date,
                findings_count, status, description, created_at
         FROM site_inspections WHERE id = $1`, [dataId]
      );
      if (result.rows.length === 0) throw new Error(`巡检记录不存在（ID: ${dataId}）`);
      return result.rows[0];
    }
    default:
      throw new Error(`不支持的数据类型: ${type}`);
  }
}

/**
 * 获取隐患/事故的批量数据（用于根因分析）
 * @param {number[]} ids - 数据 ID 列表
 * @param {string} type - 'hazard' 或 'accident'
 * @returns {Promise<Object[]>} 数据列表
 */
async function fetchIncidentsByIds(ids, type) {
  if (!ids || ids.length === 0) throw new Error('请至少提供一个事故/隐患 ID');

  if (type === 'accident') {
    const result = await pool.query(
      `SELECT id, title, description, type, severity, status, area,
              occurred_at, casualties, economic_loss, reporter_name
       FROM accidents WHERE id = ANY($1::int[]) ORDER BY occurred_at DESC`,
      [ids]
    );
    return result.rows;
  } else {
    // 默认查询隐患
    const result = await pool.query(
      `SELECT id, title, description, level, status, area, category,
              reporter_name, created_at, rectification_deadline
       FROM hazards WHERE id = ANY($1::int[]) ORDER BY created_at DESC`,
      [ids]
    );
    return result.rows;
  }
}

/**
 * 保存 AI 生成记录到数据库
 * @param {Object} record - 记录数据
 * @returns {Promise<Object>} 插入的记录
 */
async function saveGenerationRecord(record) {
  const result = await pool.query(
    `INSERT INTO ai_generation_records
      (user_id, type, sub_type, title, prompt, result, provider, model,
       input_tokens, output_tokens, duration_ms, status, error_message)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *`,
    [
      record.userId,
      record.type,
      record.subType || null,
      record.title || null,
      record.prompt,
      record.result || null,
      record.provider,
      record.model || null,
      record.inputTokens || 0,
      record.outputTokens || 0,
      record.durationMs || null,
      record.status || 'success',
      record.errorMessage || null
    ]
  );
  return result.rows[0];
}

/**
 * 更新 AI 生成记录状态
 * @param {number} id - 记录 ID
 * @param {Object} fields - 要更新的字段
 */
async function updateGenerationRecord(id, fields) {
  const setClauses = [];
  const values = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(fields)) {
    // 将驼峰命名转为下划线
    const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    setClauses.push(`${snakeKey} = $${paramIndex}`);
    values.push(value);
    paramIndex++;
  }

  values.push(id);
  await pool.query(
    `UPDATE ai_generation_records SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex}`,
    values
  );
}

// ============================================================
// 路由定义
// ============================================================

/**
 * POST /generate-report - 生成智能报告
 *
 * 请求体:
 *   - type: 'hazard' | 'accident' | 'training' | 'patrol'
 *   - dataId: 数据记录 ID
 *   - customPrompt: 用户自定义补充说明（可选）
 *   - format: 'markdown' | 'json'（可选，默认 markdown）
 *
 * 查询参数:
 *   - stream=true 启用流式输出（SSE）
 *
 * 权限：仅 admin 和 safety_manager 角色
 */
router.post('/generate-report', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const { type, dataId, customPrompt, format } = req.body;
    const useStream = req.query.stream === 'true';

    // 参数校验
    if (!type || !dataId) {
      return res.json(error(-1, '缺少必要参数: type 和 dataId'));
    }
    const validTypes = ['hazard', 'accident', 'training', 'patrol'];
    if (!validTypes.includes(type)) {
      return res.json(error(-1, `不支持的报告类型: ${type}，可选: ${validTypes.join(', ')}`));
    }

    // 检查 AI 服务可用性
    const available = await aiService.isAvailable();
    if (!available) {
      return res.json(error(-1, 'AI 服务当前不可用，请检查配置或稍后重试'));
    }

    // 从数据库获取原始数据
    const data = await fetchDataByType(type, dataId);
    const templateName = `report_${type}`;

    // 构建 prompt
    const prompt = aiService.buildReportPrompt(templateName, data, customPrompt);
    const title = `${type === 'hazard' ? '隐患' : type === 'accident' ? '事故' : type === 'training' ? '培训' : '巡检'}分析报告 - ${data.title || dataId}`;

    if (useStream) {
      // 流式模式：先创建 pending 记录，流式完成后更新
      const record = await saveGenerationRecord({
        userId: req.user.id,
        type: 'report',
        subType: type,
        title,
        prompt,
        provider: aiService.getProvider(),
        status: 'pending'
      });

      try {
        const streamResult = await aiService.chatStream(prompt, res, { format });
        // 流式完成后更新记录
        await updateGenerationRecord(record.id, {
          result: streamResult.totalContent,
          model: streamResult.model,
          durationMs: streamResult.durationMs,
          status: 'success'
        });
      } catch (err) {
        // 流式失败时更新记录
        await updateGenerationRecord(record.id, {
          status: 'error',
          errorMessage: err.message
        });
      }
    } else {
      // 非流式模式
      const startTime = Date.now();
      const record = await saveGenerationRecord({
        userId: req.user.id,
        type: 'report',
        subType: type,
        title,
        prompt,
        provider: aiService.getProvider(),
        status: 'pending'
      });

      try {
        const result = await aiService.chat(prompt, { format });
        await updateGenerationRecord(record.id, {
          result: result.content,
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          durationMs: result.durationMs,
          status: 'success'
        });

        res.json(success({
          recordId: record.id,
          content: result.content,
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          durationMs: result.durationMs,
          provider: aiService.getProvider()
        }, '智能报告生成成功'));
      } catch (err) {
        await updateGenerationRecord(record.id, {
          status: 'error',
          errorMessage: err.message
        });
        res.json(error(-1, `报告生成失败: ${err.message}`));
      }
    }
  } catch (err) {
    console.error('[AI Enhanced] 生成报告失败:', err.message);
    res.json(error(-1, `报告生成失败: ${err.message}`));
  }
});

/**
 * POST /root-cause - 根因分析（5W1H）
 *
 * 请求体:
 *   - incidentIds: 事故/隐患 ID 数组
 *   - type: 'accident' | 'hazard'（可选，默认 'accident'）
 *   - customPrompt: 用户自定义补充说明（可选）
 *
 * 支持批量分析（多个事故/隐患一起分析）
 */
router.post('/root-cause', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const { incidentIds, type = 'accident', customPrompt } = req.body;

    if (!incidentIds || !Array.isArray(incidentIds) || incidentIds.length === 0) {
      return res.json(error(-1, '请提供至少一个事故/隐患 ID（incidentIds 数组）'));
    }

    // 检查 AI 服务可用性
    const available = await aiService.isAvailable();
    if (!available) {
      return res.json(error(-1, 'AI 服务当前不可用，请检查配置或稍后重试'));
    }

    // 批量获取事故/隐患数据
    const incidents = await fetchIncidentsByIds(incidentIds, type);
    if (incidents.length === 0) {
      return res.json(error(-1, '未找到匹配的事故/隐患记录'));
    }

    // 构建 RCA prompt
    const rcaData = {
      type,
      incidentCount: incidents.length,
      incidents: incidents
    };
    const prompt = aiService.buildRCAPrompt(rcaData, customPrompt);
    const title = `根因分析报告 - ${type === 'accident' ? '事故' : '隐患'}（${incidents.length}条）`;

    // 创建 pending 记录
    const record = await saveGenerationRecord({
      userId: req.user.id,
      type: 'rca',
      subType: type,
      title,
      prompt,
      provider: aiService.getProvider(),
      status: 'pending'
    });

    try {
      const result = await aiService.chat(prompt);
      await updateGenerationRecord(record.id, {
        result: result.content,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        durationMs: result.durationMs,
        status: 'success'
      });

      res.json(success({
        recordId: record.id,
        analyzedIncidents: incidents.length,
        incidentIds: incidents.map(i => i.id),
        content: result.content,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        durationMs: result.durationMs,
        provider: aiService.getProvider()
      }, '根因分析完成'));
    } catch (err) {
      await updateGenerationRecord(record.id, {
        status: 'error',
        errorMessage: err.message
      });
      res.json(error(-1, `根因分析失败: ${err.message}`));
    }
  } catch (err) {
    console.error('[AI Enhanced] 根因分析失败:', err.message);
    res.json(error(-1, `根因分析失败: ${err.message}`));
  }
});

/**
 * GET /records - 获取 AI 生成历史（分页）
 *
 * 查询参数:
 *   - page: 页码（默认 1）
 *   - pageSize: 每页条数（默认 20）
 *   - type: 按类型筛选（可选）
 *   - startDate: 开始日期（可选）
 *   - endDate: 结束日期（可选）
 */
router.get('/records', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    // 构建 WHERE 条件
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // 按用户筛选（普通用户只能看自己的，管理员可看全部）
    if (req.user.role !== 'admin') {
      conditions.push(`user_id = $${paramIndex}`);
      params.push(req.user.id);
      paramIndex++;
    }

    // 按类型筛选
    if (req.query.type) {
      conditions.push(`type = $${paramIndex}`);
      params.push(req.query.type);
      paramIndex++;
    }

    // 按日期筛选
    if (req.query.startDate) {
      conditions.push(`created_at >= $${paramIndex}`);
      params.push(req.query.startDate);
      paramIndex++;
    }
    if (req.query.endDate) {
      conditions.push(`created_at <= $${paramIndex}`);
      params.push(req.query.endDate + ' 23:59:59');
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 查询总数
    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM ai_generation_records ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    // 查询分页数据
    const dataResult = await pool.query(
      `SELECT id, user_id, type, sub_type, title, provider, model,
              input_tokens, output_tokens, duration_ms, status,
              error_message, created_at, updated_at
       FROM ai_generation_records
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, pageSize, offset]
    );

    res.json(success({
      list: dataResult.rows,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize)
      }
    }, '获取 AI 生成历史成功'));
  } catch (err) {
    console.error('[AI Enhanced] 获取生成记录失败:', err.message);
    res.json(error(-1, '获取生成记录失败'));
  }
});

/**
 * GET /records/:id - 获取单条 AI 生成记录详情
 *
 * 包含完整的 prompt 和生成结果
 */
router.get('/records/:id', async (req, res) => {
  try {
    const recordId = parseInt(req.params.id);
    if (isNaN(recordId)) {
      return res.json(error(-1, '无效的记录 ID'));
    }

    const result = await pool.query(
      `SELECT * FROM ai_generation_records WHERE id = $1`,
      [recordId]
    );

    if (result.rows.length === 0) {
      return res.json(error(-1, '记录不存在'));
    }

    const record = result.rows[0];

    // 权限检查：普通用户只能看自己的记录
    if (req.user.role !== 'admin' && record.user_id !== req.user.id) {
      return res.json(error(-1, '无权查看此记录'));
    }

    res.json(success(record, '获取记录详情成功'));
  } catch (err) {
    console.error('[AI Enhanced] 获取记录详情失败:', err.message);
    res.json(error(-1, '获取记录详情失败'));
  }
});

/**
 * DELETE /records/:id - 删除 AI 生成记录
 * 仅 admin 角色可操作
 */
router.delete('/records/:id', requireRole('admin'), async (req, res) => {
  try {
    const recordId = parseInt(req.params.id);
    if (isNaN(recordId)) {
      return res.json(error(-1, '无效的记录 ID'));
    }

    const result = await pool.query(
      `DELETE FROM ai_generation_records WHERE id = $1 RETURNING id`,
      [recordId]
    );

    if (result.rows.length === 0) {
      return res.json(error(-1, '记录不存在'));
    }

    res.json(success({ deletedId: recordId }, '记录已删除'));
  } catch (err) {
    console.error('[AI Enhanced] 删除记录失败:', err.message);
    res.json(error(-1, '删除记录失败'));
  }
});

/**
 * POST /provider/status - 检查 AI Provider 状态
 * 返回当前 provider、模型、连接状态
 */
router.post('/provider/status', async (req, res) => {
  try {
    const provider = aiService.getProvider();
    const available = await aiService.isAvailable();

    // 获取详细配置信息（隐藏敏感字段）
    const statusInfo = {
      provider,
      model: provider === 'grok'
        ? (process.env.GROK_MODEL || 'grok-2')
        : (process.env.OLLAMA_MODEL || 'qwen2.5:7b'),
      baseUrl: provider === 'grok'
        ? (process.env.GROK_BASE_URL || 'https://api.x.ai/v1')
        : (process.env.OLLAMA_BASE_URL || 'http://localhost:11434'),
      available,
      apiKeyConfigured: provider === 'grok' ? !!process.env.GROK_API_KEY : true,
      timeoutMs: parseInt(process.env.AI_TIMEOUT_MS) || 60000,
      maxRetries: parseInt(process.env.AI_MAX_RETRIES) || 2,
      timestamp: new Date().toISOString()
    };

    res.json(success(statusInfo, `AI Provider 状态: ${available ? '正常' : '不可用'}`));
  } catch (err) {
    console.error('[AI Enhanced] 获取 Provider 状态失败:', err.message);
    res.json(error(-1, '获取 Provider 状态失败'));
  }
});

module.exports = router;

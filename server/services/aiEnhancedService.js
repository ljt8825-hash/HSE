/**
 * AI 增强（/api/hse/ai，ai-enhanced）—— service 层
 * 在 ai.js 基础上扩展：智能报告生成、根因分析、AI 生成历史管理等。
 *
 * 描述符语义（__t:'json'）：
 *  - ok(payload, message)                  成功 → res.json(success(payload, message))
 *  - errf(code, message, fallback)          业务错误 → res.json(error(code, message))
 * 未捕获异常：外抛 → controller 兜底 res.json(error(-1, fallbackMsg))。
 *
 * 鉴权分工：AI 写端点（generate-report/root-cause/删除）由路由层 requireRole 保护，
 * 列表/详情的行级过滤（普通用户仅自己的记录）由 service 依据传入的 user 完成。
 * 说明：generate-report 的流式路径将 res 直接交给 aiService.chatStream，故该端点的
 * AI 编排保留在 controller；本 service 提供其所需的 SQL/数据/记录持久化与 prompt 构建。
 */
const { pool } = require('../config/db');
const aiService = require('./aiService');
const aiGateway = require('./ai/aiGateway');

const ok = (payload, message) => ({ __t: 'json', payload, message });
const errf = (code, message) => ({ __t: 'json', error: { code, message } });

// ---------- 内部数据获取 ----------

/** 根据数据类型从数据库获取原始数据 */
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

/** 获取隐患/事故的批量数据（用于根因分析） */
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
    const result = await pool.query(
      `SELECT id, title, description, level, status, area, category,
              reporter_name, created_at, rectification_deadline
       FROM hazards WHERE id = ANY($1::int[]) ORDER BY created_at DESC`,
      [ids]
    );
    return result.rows;
  }
}

// ---------- AI 生成记录持久化 ----------

/** 保存 AI 生成记录 */
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

/** 更新 AI 生成记录状态（驼峰→下划线） */
async function updateGenerationRecord(id, fields) {
  const setClauses = [];
  const values = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(fields)) {
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

// ---------- 业务端点 ----------

/** GET /records - 获取 AI 生成历史（分页；非 admin 只能看自己的） */
async function listRecords(query, user) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize) || 20));
  const offset = (page - 1) * pageSize;

  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (user.role !== 'admin') {
    conditions.push(`user_id = $${paramIndex}`);
    params.push(user.id);
    paramIndex++;
  }

  if (query.type) {
    conditions.push(`type = $${paramIndex}`);
    params.push(query.type);
    paramIndex++;
  }

  if (query.startDate) {
    conditions.push(`created_at >= $${paramIndex}`);
    params.push(query.startDate);
    paramIndex++;
  }
  if (query.endDate) {
    conditions.push(`created_at <= $${paramIndex}`);
    params.push(query.endDate + ' 23:59:59');
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await pool.query(
    `SELECT COUNT(*) AS total FROM ai_generation_records ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].total);

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

  return ok({
    list: dataResult.rows,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize)
    }
  }, '获取 AI 生成历史成功');
}

/** GET /records/:id - 单条记录详情（包含 prompt/结果；非 admin 只能看自己） */
async function getRecordDetail(params, user) {
  const recordId = parseInt(params.id);
  if (isNaN(recordId)) return errf(-1, '无效的记录 ID');

  const result = await pool.query(
    `SELECT * FROM ai_generation_records WHERE id = $1`,
    [recordId]
  );

  if (result.rows.length === 0) return errf(-1, '记录不存在');

  const record = result.rows[0];
  if (user.role !== 'admin' && record.user_id !== user.id) {
    return errf(-1, '无权查看此记录');
  }

  return ok(record, '获取记录详情成功');
}

/** DELETE /records/:id - 删除记录（路由层已 requireRole('admin')） */
async function deleteRecord(params) {
  const recordId = parseInt(params.id);
  if (isNaN(recordId)) return errf(-1, '无效的记录 ID');

  const result = await pool.query(
    `DELETE FROM ai_generation_records WHERE id = $1 RETURNING id`,
    [recordId]
  );

  if (result.rows.length === 0) return errf(-1, '记录不存在');

  return ok({ deletedId: recordId }, '记录已删除');
}

/** POST /provider/status - 检查 AI Provider 状态（隐藏敏感字段）
 * AI-02 增强：保留旧字段（provider/model/available/... 兼容），
 * 新增统一健康状态 providers[]（AVAILABLE/NOT_CONFIGURED/UNREACHABLE/AUTH_ERROR/... 不伪造成功）。
 */
async function providerStatus() {
  const provider = aiService.getProvider();
  const available = await aiService.isAvailable();
  const summary = await aiGateway.getHealthSummary();

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
    timestamp: new Date().toISOString(),
    // ---- AI-02 统一健康状态（新增，向后兼容） ----
    aiEnabled: String(process.env.AI_ENABLE || 'true').toLowerCase() !== 'false',
    activeProvider: summary.activeProvider,
    providers: summary.providers,
  };

  return ok(statusInfo, `AI Provider 状态: ${available ? '正常' : '不可用'}`);
}

module.exports = {
  fetchDataByType,
  fetchIncidentsByIds,
  saveGenerationRecord,
  updateGenerationRecord,
  listRecords,
  getRecordDetail,
  deleteRecord,
  providerStatus,
};
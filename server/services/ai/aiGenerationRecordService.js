/**
 * AI Generation Record（AI-02 Capability Layer）
 *
 * 复用现有 ai_generation_records 表（AI-02 任务书 §15：优先复用，不新建 ai_records/ai_logs 等重复表）。
 * 当前仅写入现有字段；request_id/prompt_key/prompt_version/evidence 等扩展字段
 * 见 server/sql/ai_capability_layer_v1.sql（migration 待用户授权后执行，执行后本服务自动追加写入）。
 *
 * 注意：aiEnhancedService.saveGenerationRecord 与本文件为同构实现（AI-02 不动既有 domain 层），
 * AI-03 收编统一（见 AI-02 建设报告「未完成事项」）。
 */

const { pool } = require('../../config/db');

/** 尝试探测扩展字段是否已存在（migration 执行后为 true，未执行时静默降级） */
let _extendedColumns = null;

async function _hasExtendedColumns() {
  if (_extendedColumns !== null) return _extendedColumns;
  try {
    const result = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'ai_generation_records' AND column_name = ANY($1::text[])`,
      [['request_id', 'prompt_key', 'prompt_version', 'evidence']]
    );
    _extendedColumns = result.rows.length === 4;
  } catch (e) {
    _extendedColumns = false;
  }
  return _extendedColumns;
}

/**
 * 保存 AI 生成记录（现有字段 + 扩展字段自动探测）
 * @param {Object} record
 * @returns {Promise<{id:number, saved:boolean, extended:boolean}>}
 */
async function saveGenerationRecord(record) {
  const extended = await _hasExtendedColumns();

  const baseCols = ['user_id', 'type', 'sub_type', 'title', 'prompt', 'result', 'provider', 'model',
    'input_tokens', 'output_tokens', 'duration_ms', 'status', 'error_message'];
  const baseVals = [
    record.userId || null,
    record.type || 'report',
    record.subType || null,
    record.title || null,
    record.prompt || '',
    record.result || null,
    record.provider || null,
    record.model || null,
    record.inputTokens || 0,
    record.outputTokens || 0,
    record.durationMs || null,
    record.status || 'success',
    record.errorMessage || null,
  ];

  const cols = [...baseCols];
  const vals = [...baseVals];

  if (extended) {
    cols.push('request_id', 'prompt_key', 'prompt_version', 'evidence');
    vals.push(record.requestId || null, record.promptKey || null, record.promptVersion || null,
      record.evidence ? JSON.stringify(record.evidence) : null);
  }

  const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
  const result = await pool.query(
    `INSERT INTO ai_generation_records (${cols.join(', ')})
     VALUES (${placeholders})
     RETURNING id`,
    vals
  );
  return { id: result.rows[0].id, saved: true, extended };
}

module.exports = { saveGenerationRecord };

const { pool } = require('../config/db');
const logger = require('../utils/logger');
const aiService = require('./aiService');
const documentService = require('./documentService');
const notificationService = require('./notificationService');
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');

const PROMPT_VERSION = 'v1.0';
const MAX_TEXT_LENGTH = 50000;

const ANALYSIS_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

const ANALYSIS_BASIS = {
  FULL_TEXT: 'full_text',
  METADATA_ONLY: 'metadata_only',
  FILENAME_ONLY: 'filename_only',
};

const EXCEL_EXTENSIONS = ['.xls', '.xlsx', '.xlsm', '.xlsb', '.csv'];
const KNOWN_DOC_EXTENSIONS = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.txt', '.md'];

async function createAnalysisTask(fileId, triggeredBy) {
  const existing = await pool.query(
    `SELECT id FROM document_ai_analysis
     WHERE file_id = $1 AND status IN ($2, $3) AND is_deleted = false
     LIMIT 1`,
    [fileId, ANALYSIS_STATUS.PENDING, ANALYSIS_STATUS.PROCESSING]
  );
  if (existing.rows.length > 0) {
    const err = new Error('该文件已有分析任务正在进行中');
    err.statusCode = 409;
    throw err;
  }

  const result = await pool.query(
    `INSERT INTO document_ai_analysis
     (file_id, status, triggered_by, triggered_at, prompt_version)
     VALUES ($1, $2, $3, NOW(), $4)
     RETURNING id, status, triggered_at`,
    [fileId, ANALYSIS_STATUS.PENDING, triggeredBy, PROMPT_VERSION]
  );

  return result.rows[0];
}

async function startAnalysisAsync(fileId, analysisId, customPrompt) {
  setImmediate(() => {
    runAnalysis(fileId, analysisId, customPrompt).catch((err) => {
      logger.error('[documentAi] 后台分析任务异常', { fileId, analysisId, error: err.message });
    });
  });
}

async function runAnalysis(fileId, analysisId, customPrompt) {
  try {
    await pool.query(
      `UPDATE document_ai_analysis SET status = $1, started_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [ANALYSIS_STATUS.PROCESSING, analysisId]
    );

    const fileResult = await pool.query(
      `SELECT df.*, dc.name as category_name
       FROM document_files df
       LEFT JOIN document_categories dc ON df.category_id = dc.id
       WHERE df.id = $1 AND df.is_deleted = false`,
      [fileId]
    );
    if (fileResult.rows.length === 0) {
      throw new Error('文件不存在');
    }
    const fileRow = fileResult.rows[0];

    const extraction = await extractText(fileRow);

    await pool.query(
      `UPDATE document_ai_analysis
       SET analysis_basis = $1, extract_method = $2, extract_text_length = $3, updated_at = NOW()
       WHERE id = $4`,
      [
        extraction.analysisBasis,
        extraction.method,
        extraction.textLength,
        analysisId,
      ]
    );

    if (!aiService.isAvailable()) {
      throw new Error('AI 服务未配置或不可用');
    }

    const prompt = buildDocumentAnalysisPrompt(fileRow, extraction, customPrompt);

    const aiResult = await aiService.chat(prompt);
    const parsed = parseAiResponse(aiResult.content);

    const updateResult = await pool.query(
      `UPDATE document_ai_analysis
       SET status = $1,
           ai_summary = $2,
           ai_score = $3,
           ai_risk_level = $4,
           ai_suggestions = $5,
           ai_missing_items = $6,
           ai_keywords = $7,
           ai_full_response = $8,
           ai_provider = $9,
           ai_model = $10,
           ai_input_tokens = $11,
           ai_output_tokens = $12,
           ai_duration_ms = $13,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $14
       RETURNING *`,
      [
        ANALYSIS_STATUS.COMPLETED,
        parsed.summary || null,
        parsed.score || 0,
        parsed.riskLevel || null,
        JSON.stringify(parsed.suggestions || []),
        JSON.stringify(parsed.missingItems || []),
        JSON.stringify(parsed.keywords || []),
        aiResult.content,
        aiResult.model || null,
        aiResult.provider || null,
        aiResult.inputTokens || 0,
        aiResult.outputTokens || 0,
        aiResult.durationMs || 0,
        analysisId,
      ]
    );

    const analysisRow = updateResult.rows[0];
    await documentService.syncLatestAnalysis(fileId, analysisRow);

    if (fileRow.uploaded_by) {
      notificationService.createNotification({
        userId: fileRow.uploaded_by,
        title: 'AI分析完成',
        content: `文件「${fileRow.original_name}」的AI分析已完成，评分${parsed.score || 0}分`,
        type: 'system',
        bizType: 'document_analysis',
        bizId: String(fileId),
        pushWs: true,
      }).catch((err) => {
        logger.warn('[documentAi] 通知发送失败', { error: err.message });
      });
    }

    logger.info('[documentAi] 分析完成', { fileId, analysisId, score: parsed.score });
  } catch (err) {
    logger.error('[documentAi] 分析失败', { fileId, analysisId, error: err.message, stack: err.stack });
    try {
      await pool.query(
        `UPDATE document_ai_analysis
         SET status = $1, error_message = $2, error_stack = $3, failed_at = NOW(), updated_at = NOW()
         WHERE id = $4`,
        [ANALYSIS_STATUS.FAILED, err.message, err.stack || null, analysisId]
      );
    } catch (updateErr) {
      logger.error('[documentAi] 更新失败状态出错', { error: updateErr.message });
    }
  }
}

async function extractText(fileRow) {
  const ext = path.extname(fileRow.original_name || '').toLowerCase();
  const fullPath = path.join(__dirname, '..', fileRow.file_path);

  if (EXCEL_EXTENSIONS.includes(ext)) {
    try {
      if (!fs.existsSync(fullPath)) {
        throw new Error('文件不存在于磁盘');
      }
      const workbook = xlsx.readFile(fullPath, { type: 'file' });
      let text = '';
      const sheetNames = workbook.SheetNames;
      for (const name of sheetNames) {
        const sheet = workbook.Sheets[name];
        const sheetText = xlsx.utils.sheet_to_csv(sheet, { RS: '\n', FS: ' ' });
        text += `【${name}】\n${sheetText}\n\n`;
        if (text.length > MAX_TEXT_LENGTH) break;
      }
      if (text.length > MAX_TEXT_LENGTH) {
        text = text.substring(0, MAX_TEXT_LENGTH) + '\n...（内容过长，已截断）';
      }
      return {
        text,
        textLength: text.length,
        analysisBasis: ANALYSIS_BASIS.FULL_TEXT,
        method: 'excel_full_text',
      };
    } catch (err) {
      logger.warn('[documentAi] Excel解析失败，降级为元数据', { error: err.message });
    }
  }

  const hasUserSummary = fileRow.summary && fileRow.summary.trim().length > 0;
  const hasCategory = fileRow.category_name;

  if (hasUserSummary || hasCategory || KNOWN_DOC_EXTENSIONS.includes(ext)) {
    return {
      text: buildMetadataText(fileRow),
      textLength: 0,
      analysisBasis: ANALYSIS_BASIS.METADATA_ONLY,
      method: 'metadata_only',
    };
  }

  return {
    text: fileRow.original_name || '',
    textLength: 0,
    analysisBasis: ANALYSIS_BASIS.FILENAME_ONLY,
    method: 'filename_only',
  };
}

function buildMetadataText(fileRow) {
  const lines = [];
  lines.push(`文件名：${fileRow.original_name || '未知'}`);
  lines.push(`文件类型：${fileRow.file_type || '未知'}`);
  lines.push(`文件分类：${fileRow.category_name || '未分类'}`);
  if (fileRow.summary) {
    lines.push(`用户摘要：${fileRow.summary}`);
  }
  lines.push(`文件大小：${formatFileSize(fileRow.file_size)}`);
  lines.push(`上传时间：${fileRow.uploaded_at || '未知'}`);
  return lines.join('\n');
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = Number(bytes);
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

function buildDocumentAnalysisPrompt(fileRow, extraction, customPrompt) {
  return aiService.buildDocumentAnalysisPrompt(
    {
      filename: fileRow.original_name || '',
      fileType: fileRow.file_type || '',
      category: fileRow.category_name || '',
      summary: fileRow.summary || '',
      analysisBasis: extraction.analysisBasis,
      documentText: extraction.text || '',
    },
    customPrompt
  );
}

function parseAiResponse(content) {
  if (!content) {
    return { summary: '', score: 0, riskLevel: 'low', suggestions: [], missingItems: [], keywords: [] };
  }

  let jsonStr = content.trim();

  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.substring(7);
  }
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.substring(3);
  }
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.substring(0, jsonStr.length - 3);
  }
  jsonStr = jsonStr.trim();

  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  }

  try {
    const parsed = JSON.parse(jsonStr);
    return {
      summary: parsed.summary || '',
      score: clampScore(parsed.score),
      riskLevel: normalizeRiskLevel(parsed.riskLevel || parsed.risk_level),
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.map(s => ({
        standard: s.standard || '',
        suggestion: s.suggestion || '',
        level: normalizePriority(s.level || s.priority || 'medium'),
      })) : [],
      missingItems: Array.isArray(parsed.missingItems) || Array.isArray(parsed.missing_items)
        ? (parsed.missingItems || parsed.missing_items).map(m => ({
            item: m.item || '',
            reason: m.reason || '',
            priority: normalizePriority(m.priority || m.level || 'medium'),
          }))
        : [],
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
    };
  } catch (err) {
    logger.warn('[documentAi] AI响应JSON解析失败，使用原文作为摘要', { error: err.message });
    return {
      summary: content,
      score: 0,
      riskLevel: 'low',
      suggestions: [],
      missingItems: [],
      keywords: [],
    };
  }
}

function clampScore(score) {
  const num = Number(score);
  if (isNaN(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function normalizeRiskLevel(level) {
  if (!level) return 'low';
  const l = String(level).toLowerCase();
  if (['critical', '严重', '极高', '高风险'].includes(l)) return 'critical';
  if (['high', '高', '高的'].includes(l)) return 'high';
  if (['medium', '中', '中等', '一般'].includes(l)) return 'medium';
  if (['low', '低', '低的'].includes(l)) return 'low';
  return 'medium';
}

function normalizePriority(priority) {
  if (!priority) return 'medium';
  const p = String(priority).toLowerCase();
  if (['high', '高', '重要'].includes(p)) return 'high';
  if (['medium', '中', '一般'].includes(p)) return 'medium';
  if (['low', '低', '次要'].includes(p)) return 'low';
  return 'medium';
}

async function getLatestAnalysis(fileId) {
  const result = await pool.query(
    `SELECT * FROM document_ai_analysis
     WHERE file_id = $1 AND is_deleted = false
     ORDER BY triggered_at DESC
     LIMIT 1`,
    [fileId]
  );
  if (result.rows.length === 0) return null;
  return formatAnalysisRow(result.rows[0]);
}

async function getAnalysisDetail(fileId, analysisId) {
  const result = await pool.query(
    `SELECT * FROM document_ai_analysis
     WHERE id = $1 AND file_id = $2 AND is_deleted = false`,
    [analysisId, fileId]
  );
  if (result.rows.length === 0) return null;
  return formatAnalysisRow(result.rows[0]);
}

async function getAnalysisHistory(fileId, page = 1, pageSize = 10) {
  const offset = (page - 1) * pageSize;

  const countResult = await pool.query(
    `SELECT COUNT(*) as total FROM document_ai_analysis
     WHERE file_id = $1 AND is_deleted = false`,
    [fileId]
  );
  const total = parseInt(countResult.rows[0].total, 10);

  const listResult = await pool.query(
    `SELECT id, status, analysis_basis, ai_score, ai_risk_level,
            triggered_by, triggered_at, completed_at, failed_at
     FROM document_ai_analysis
     WHERE file_id = $1 AND is_deleted = false
     ORDER BY triggered_at DESC
     LIMIT $2 OFFSET $3`,
    [fileId, pageSize, offset]
  );

  return {
    list: listResult.rows.map(row => ({
      id: row.id,
      status: row.status,
      analysisBasis: row.analysis_basis,
      aiScore: row.ai_score,
      aiRiskLevel: row.ai_risk_level,
      triggeredBy: row.triggered_by,
      triggeredAt: row.triggered_at,
      completedAt: row.completed_at,
      failedAt: row.failed_at,
    })),
    total,
    page,
    pageSize,
  };
}

function formatAnalysisRow(row) {
  return {
    id: row.id,
    fileId: row.file_id,
    status: row.status,
    analysisBasis: row.analysis_basis,
    promptVersion: row.prompt_version,
    extractMethod: row.extract_method,
    extractTextLength: row.extract_text_length,
    extractError: row.extract_error,
    aiSummary: row.ai_summary,
    aiScore: row.ai_score,
    aiRiskLevel: row.ai_risk_level,
    aiSuggestions: row.ai_suggestions ? JSON.parse(JSON.stringify(row.ai_suggestions)) : [],
    aiMissingItems: row.ai_missing_items ? JSON.parse(JSON.stringify(row.ai_missing_items)) : [],
    aiKeywords: row.ai_keywords ? JSON.parse(JSON.stringify(row.ai_keywords)) : [],
    confirmedStatus: row.confirmed_status,
    confirmedBy: row.confirmed_by,
    confirmedAt: row.confirmed_at,
    errorMessage: row.error_message,
    failedAt: row.failed_at,
    triggeredBy: row.triggered_by,
    triggeredAt: row.triggered_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

async function retryAnalysis(fileId, analysisId, triggeredBy) {
  const existing = await getAnalysisDetail(fileId, analysisId);
  if (!existing) {
    const err = new Error('分析记录不存在');
    err.statusCode = 404;
    throw err;
  }

  const newTask = await createAnalysisTask(fileId, triggeredBy);
  startAnalysisAsync(fileId, newTask.id, null);
  return newTask;
}

module.exports = {
  ANALYSIS_STATUS,
  ANALYSIS_BASIS,
  createAnalysisTask,
  startAnalysisAsync,
  getLatestAnalysis,
  getAnalysisDetail,
  getAnalysisHistory,
  retryAnalysis,
};

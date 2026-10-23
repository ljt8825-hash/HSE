/**
 * 公司级 AI Skill API 路由（AI-Phase-01-02 / AI-Phase-01-04 / AI-Phase-01-05）
 * 挂载前缀：/api/company/ai（app.js）
 *
 * 定位：公司通用 Skill 命名空间（与 HSE 业务路由 /api/hse/ai 完全隔离，互不影响）。
 * Skills：SK-005 企业知识问答（company.knowledge.answer）| SK-001 Excel 数据分析（company.excel.analysis）
 *        | SK-002 文档解析（company.document.parse）| SK-003 检查数据分析（company.inspection.analysis）
 *        | SK-004 报告生成（company.report.generate）。
 * 链路：Route → Skill → 权限 →（检索/确定性解析）→ Evidence → Prompt Registry → AI Gateway → Provider（禁止直连）。
 */
const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/auth');
const { createUploader } = require('../middleware/upload');
const { AiError, toErrorResponse } = require('../services/ai/errors');
const ctl = require('../controllers/companyAiController');
const { SKILL_ALLOWED_ROLES } = require('../services/ai/skills/companyKnowledgeAnswer');
const sk001 = require('../services/ai/skills/companyExcelAnalysis');
const sk002 = require('../services/ai/skills/companyDocumentParse');

// 角色准入（fail-closed：仅清单内角色可用；SK-001/SK-002 与 SK-005 同一 allowlist）
const SKILL_USER = requireRole(...SKILL_ALLOWED_ROLES);

// SK-001 上传器（复用现有 multer 体系；excel 类型 + 20MB 上限与 INPUT_LIMITS 同步）
const uploadSK001 = createUploader({
  type: 'excel',
  subDir: 'excel',
  maxSize: sk001.INPUT_LIMITS.fileMaxBytes,
  fieldName: 'file',
});

/** multer 错误 → 统一 AI 错误结构（AI_FILE_TOO_LARGE / AI_FILE_INVALID）。
 *  注意：AI 统一错误信封由控制器 handleError 渲染；上传层错误不经控制器，
 *  必须在此直接 res.json(toErrorResponse(...))，next(err) 会落入通用错误处理器（HTTP 500 + code:-1）。 */
function sk001Upload(req, res, next) {
  uploadSK001.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err && err.code === 'LIMIT_FILE_SIZE') {
      const mb = Math.round(sk001.INPUT_LIMITS.fileMaxBytes / 1024 / 1024);
      return res.json(toErrorResponse(new AiError(sk001.AI_ERROR_CODES_SK001.AI_FILE_TOO_LARGE, `文件大小超过限制（最大 ${mb}MB）`)));
    }
    return res.json(toErrorResponse(new AiError(sk001.AI_ERROR_CODES_SK001.AI_FILE_INVALID, (err && err.message) || '文件上传失败')));
  });
}

// SK-002 上传器（20MB 上限与 INPUT_LIMITS 同步）。
// type 用 'all'：document 类型白名单（.pdf/.doc/.docx）不含 SK-002 支持的 .txt/.md/.markdown，
// 扩展名收敛改在控制器 allowlist 执行（不在清单 → AI_UNSUPPORTED_FILE_TYPE），
// pdf/docx 内容真实性由控制器魔术字节校验兜底。
const uploadSK002 = createUploader({
  type: 'all',
  subDir: 'documents',
  maxSize: sk002.INPUT_LIMITS.fileMaxBytes,
  fieldName: 'file',
});

/** multer 错误 → 统一 AI 错误结构（AI_FILE_TOO_LARGE / AI_FILE_INVALID；同 sk001Upload，直接渲染 AI 信封） */
function sk002Upload(req, res, next) {
  uploadSK002.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err && err.code === 'LIMIT_FILE_SIZE') {
      const mb = Math.round(sk002.INPUT_LIMITS.fileMaxBytes / 1024 / 1024);
      return res.json(toErrorResponse(new AiError(sk002.AI_ERROR_CODES_SK002.AI_FILE_TOO_LARGE, `文件大小超过限制（最大 ${mb}MB）`)));
    }
    return res.json(toErrorResponse(new AiError(sk002.AI_ERROR_CODES_SK002.AI_FILE_INVALID, (err && err.message) || '文件上传失败')));
  });
}

// ---- Skill 元数据 ----
router.get('/skills', SKILL_USER, ctl.listSkills);
router.get('/skills/:id', SKILL_USER, ctl.getSkill);

// ---- SK-005 企业知识问答 ----
router.post('/skills/SK-005/answer', SKILL_USER, ctl.answerSK005);

// ---- SK-001 Excel 数据分析（multipart：file + analysis_goal + sheet_name）----
router.post('/skills/SK-001/analyze', SKILL_USER, sk001Upload, ctl.analyzeSK001);

// ---- SK-002 文档解析（multipart：file + parse_goal + extract_structure/tables/metadata）----
router.post('/skills/SK-002/parse', SKILL_USER, sk002Upload, ctl.parseSK002);

// ---- SK-003 检查数据分析（application/json：data 或 source + analysis_goal + time_range/group_by/top_n/compare/field_mapping）----
router.post('/skills/SK-003/analyze', SKILL_USER, ctl.analyzeSK003);

// ---- SK-004 报告生成（application/json：facts/analysis/document/evidence 至少其一 + report_type/title/report_goal/template/sections/style）----
router.post('/skills/SK-004/generate', SKILL_USER, ctl.generateSK004);

module.exports = router;

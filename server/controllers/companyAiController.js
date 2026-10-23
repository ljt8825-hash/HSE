/**
 * 公司级 AI Skill API 控制器（AI-Phase-01-02 / AI-Phase-01-04）
 * 对应路由前缀：/api/company/ai（routes/company-ai.js）
 *
 * 权限：角色准入（requireRole 中间件）+ Skill 内部范围收敛；userId 取 req.user.id，不推断身份。
 * 说明：本控制器不直接调用任何模型，全部经 SK-005 / SK-001 → AI Gateway。
 */

const path = require('path');
const fs = require('fs');

const { AiError, AI_ERROR_CODES, toErrorResponse } = require('../services/ai/errors');
const sk005 = require('../services/ai/skills/companyKnowledgeAnswer');
const sk001 = require('../services/ai/skills/companyExcelAnalysis');
const sk002 = require('../services/ai/skills/companyDocumentParse');
const sk003 = require('../services/ai/skills/companyInspectionAnalysis');
const sk004 = require('../services/ai/skills/companyReportGenerate');
const { validateUploadedFile, deleteFile } = require('../middleware/upload');

/** 认证上下文 → 最小 actor 字段（不推断 employee_id） */
function actorOf(req) {
  return {
    userId: req.user && req.user.id != null ? req.user.id : null,
    role: req.user && req.user.role ? req.user.role : null,
  };
}

/** 统一错误响应：SkillPermissionError(403) / AiError(结构) / 未知(内部错误) */
function handleError(res, err) {
  if (err && err.name === 'SkillPermissionError') {
    return res.status(403).json({
      success: false,
      error: { code: err.code || 'SKILL_PERMISSION_DENIED', message: err.message, retryable: false },
    });
  }
  const body = toErrorResponse(err);
  // 保留字段级校验明细（errors.js 的 toJSON 不含 details，此处最小补充）
  if (err && err.details && Array.isArray(err.details.validationErrors)) {
    body.error.details = err.details.validationErrors;
  }
  return res.json(body);
}

/** 已注册 Skill 注册表（id/key → manifest） */
const SKILL_REGISTRY = () => [sk005.manifest(), sk001.manifest(), sk002.manifest(), sk003.manifest(), sk004.manifest()];

/** GET /skills —— 已注册的公司级 Skill 清单 */
async function listSkills(req, res) {
  try {
    const skills = SKILL_REGISTRY();
    res.json({ success: true, skills, count: skills.length });
  } catch (err) {
    handleError(res, err);
  }
}

/** GET /skills/:id —— 单个 Skill 元数据 */
async function getSkill(req, res) {
  try {
    const id = String(req.params.id || '').toUpperCase();
    const skill = SKILL_REGISTRY().find((s) => s.id.toUpperCase() === id || s.key.toUpperCase() === id);
    if (!skill) {
      return res.status(404).json({
        success: false,
        error: { code: 'SKILL_NOT_FOUND', message: `未注册的 Skill: ${req.params.id}`, retryable: false },
      });
    }
    res.json({ success: true, skill });
  } catch (err) {
    handleError(res, err);
  }
}

/** POST /skills/SK-005/answer —— SK-005 企业知识问答（统一输出协议） */
async function answerSK005(req, res) {
  try {
    const result = await sk005.answer(req.body || {}, actorOf(req));
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
}

/**
 * POST /skills/SK-001/analyze —— SK-001 Excel 数据分析（multipart/form-data）
 * 文件经 multer 落盘后：扩展名/魔术字节校验（xlsx/xls/xlsm 复用 validateUploadedFile，
 * csv 为纯文本无魔术字节、由 xlsx 解析兜底）→ SK-001 → AI Gateway。
 * 临时上传文件在响应后清理（SK-001 为一次性分析输入，不保留文件记录）。
 */
async function analyzeSK001(req, res) {
  const file = req.file;
  try {
    if (!file) {
      throw new AiError(
        AI_ERROR_CODES.AI_INVALID_REQUEST,
        '缺少上传文件：请以 multipart/form-data 提供 file 字段（.xlsx/.xls/.xlsm/.csv）',
        { validationErrors: [{ field: 'file', code: 'REQUIRED', message: 'file 不能为空' }] }
      );
    }
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!sk001.INPUT_LIMITS.allowedExtensions.includes(ext)) {
      throw new AiError(
        sk001.AI_ERROR_CODES_SK001.AI_FILE_INVALID,
        `不支持的文件类型: ${ext}（支持: ${sk001.INPUT_LIMITS.allowedExtensions.join(' / ')}）`
      );
    }
    if (ext !== '.csv') {
      const sig = validateUploadedFile(file, 'excel');
      if (!sig.valid) {
        throw new AiError(sk001.AI_ERROR_CODES_SK001.AI_FILE_INVALID, sig.error);
      }
    }

    const result = await sk001.analyze(
      {
        filePath: file.path,
        fileName: file.originalname,
        analysis_goal: req.body ? req.body.analysis_goal : undefined,
        sheet_name: req.body ? req.body.sheet_name : undefined,
      },
      actorOf(req)
    );
    res.json(result);
  } catch (err) {
    handleError(res, err);
  } finally {
    if (file && file.path) {
      deleteFile(file.path);
    }
  }
}

/**
 * POST /skills/SK-002/parse —— SK-002 文档解析（multipart/form-data）
 * 文件经 multer 落盘后：扩展名 allowlist（.pdf/.docx/.txt/.md/.markdown；
 * 不在清单 → AI_UNSUPPORTED_FILE_TYPE，含 .doc）→ 魔术字节校验
 * （pdf→pdf / docx→word；txt/md 为纯文本无魔术字节，跳过）→ 读入 buffer → SK-002。
 * 临时上传文件在响应后清理（一次性解析输入，不保留文件记录）。
 */
async function parseSK002(req, res) {
  const file = req.file;
  try {
    if (!file) {
      throw new AiError(
        AI_ERROR_CODES.AI_INVALID_REQUEST,
        '缺少上传文件：请以 multipart/form-data 提供 file 字段（.pdf/.docx/.txt/.md/.markdown）',
        { validationErrors: [{ field: 'file', code: 'REQUIRED', message: 'file 不能为空' }] }
      );
    }
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!sk002.INPUT_LIMITS.allowedExtensions.includes(ext)) {
      throw new AiError(
        sk002.AI_ERROR_CODES_SK002.AI_UNSUPPORTED_FILE_TYPE,
        `不支持的文件类型: ${ext}（支持: ${sk002.INPUT_LIMITS.allowedExtensions.join(' / ')}；.doc 无稳定纯 Node 解析方案）`
      );
    }
    if (ext === '.pdf' || ext === '.docx') {
      const sig = validateUploadedFile(file, ext === '.pdf' ? 'pdf' : 'word');
      if (!sig.valid) {
        throw new AiError(sk002.AI_ERROR_CODES_SK002.AI_FILE_INVALID, sig.error);
      }
    }

    const body = req.body || {};
    const result = await sk002.parse(
      {
        buffer: fs.readFileSync(file.path),
        fileName: file.originalname,
        fileType: ext.slice(1),
        fileSize: file.size,
        parse_goal: body.parse_goal,
        extract_structure: body.extract_structure,
        extract_tables: body.extract_tables,
        extract_metadata: body.extract_metadata,
      },
      actorOf(req)
    );
    res.json(result);
  } catch (err) {
    handleError(res, err);
  } finally {
    if (file && file.path) {
      deleteFile(file.path);
    }
  }
}

/**
 * POST /skills/SK-003/analyze —— SK-003 检查数据分析（application/json）
 * 数据来源二选一：data（结构化行数组，可来自上游 Skill/DB 查询结果）或
 * source:{type:"hse_grid"}（HSE Adapter 只读 SELECT grid_inspection_records）。
 * 链路：权限 → 字段映射 → 确定性统计 → Evidence → Prompt Registry → AI Gateway。
 */
async function analyzeSK003(req, res) {
  try {
    const body = req.body || {};
    if (!body.data && !body.source) {
      throw new AiError(
        AI_ERROR_CODES.AI_INVALID_REQUEST,
        '缺少检查数据：请以 application/json 提供 data（结构化行数组）或 source（{"type":"hse_grid"}）',
        { validationErrors: [{ field: 'data', code: 'REQUIRED', message: 'data 与 source 必须提供其一' }] }
      );
    }
    const result = await sk003.analyze(body, actorOf(req));
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
}

/**
 * POST /skills/SK-004/generate —— SK-004 报告生成（application/json）
 * 报告素材至少其一：facts / analysis（可直接传 SK-003 result）/ document（SK-002 结果）/ evidence。
 * 链路：权限 → 事实锁定 → 章节规划 → 确定性表格 → Prompt Registry → AI Gateway → 事实一致性检查。
 * 注意：Controller 不硬编码 Prompt（§三十），Prompt 全部经 aiPromptRegistry。
 */
async function generateSK004(req, res) {
  try {
    const body = req.body || {};
    const result = await sk004.generate(body, actorOf(req));
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
}

module.exports = { listSkills, getSkill, answerSK005, analyzeSK001, parseSK002, analyzeSK003, generateSK004 };

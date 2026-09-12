/**
 * 安全资料中心路由 - HSE V2.0 Sprint 1
 *
 * 端点:
 *   POST   /upload              文件上传（所有登录用户）
 *   GET    /                    文件列表（所有登录用户）
 *   GET    /stats               文件统计（所有登录用户）
 *   GET    /categories          分类树（所有登录用户）
 *   POST   /categories          创建分类（admin/safety_manager）
 *   PUT    /categories/:id      更新分类（admin/safety_manager）
 *   DELETE /categories/:id      删除分类（admin/safety_manager）
 *   GET    /tags                标签列表（所有登录用户）
 *   POST   /tags                创建标签（admin/safety_manager）
 *   GET    /:id                 文件详情（所有登录用户）
 *   GET    /:id/download        文件下载（所有登录用户）
 *   PUT    /:id                 更新文件（admin/safety_manager）
 *   DELETE /:id                 文件删除（admin/safety_manager，软删除）
 *   POST   /:id/review          文件审核（admin/safety_manager）
 *   POST   /:id/analyze         触发AI分析（admin/safety_manager）
 *   GET    /:id/analysis        获取最新分析结果（所有登录用户）
 *   GET    /:id/analysis/history 分析历史列表（所有登录用户）
 *   GET    /:id/analysis/:aid   获取指定分析详情（所有登录用户）
 *   POST   /:id/analysis/:aid/retry 重试分析（admin/safety_manager）
 *
 * 复用（不修改）:
 *   - middleware/upload.js  的 createUploader / validateUploadedFile
 *   - middleware/auth.js    的 requireRole（角色校验）
 *   - middleware/response.js 的 success / error
 *   - services/notificationService 的 createNotification
 *   - services/documentService 文件管理业务逻辑
 */

const express = require('express');
const router = express.Router();
const { success, error } = require('../middleware/response');
const { requireRole } = require('../middleware/auth');
const { createUploader, validateUploadedFile, fixFilenameEncoding } = require('../middleware/upload');
const documentService = require('../services/documentService');
const documentAiService = require('../services/documentAiService');

// 自建上传器：支持所有类型文件，存储到 documents 子目录
const documentUploader = createUploader({ type: 'all', subDir: 'documents' });

// ============================================================
// 文件上传
// ============================================================
router.post('/upload', documentUploader.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.json(error(-1, '请选择要上传的文件'));
    }

    // 魔术字节校验（防伪造扩展名）
    const ext = require('path').extname(fixFilenameEncoding(req.file.originalname)).toLowerCase();
    let expectedType = 'all';
    if (['.pdf'].includes(ext)) expectedType = 'pdf';
    else if (['.doc', '.docx'].includes(ext)) expectedType = 'word';
    else if (['.xls', '.xlsx'].includes(ext)) expectedType = 'excel';
    else if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext)) expectedType = 'image';

    const valid = validateUploadedFile(req.file, expectedType);
    if (!valid.valid) {
      return res.json(error(-1, `文件校验失败: ${valid.reason}`));
    }

    // 解析附加字段（FormData 文本字段）
    const extra = {
      categoryId: req.body.categoryId ? parseInt(req.body.categoryId, 10) : null,
      summary: req.body.summary || null,
      validStartDate: req.body.validStartDate || null,
      validEndDate: req.body.validEndDate || null,
      remindDays: req.body.remindDays ? parseInt(req.body.remindDays, 10) : 30,
      metadata: {},
    };

    const result = await documentService.uploadFile(req.file, extra, req.user, req);
    res.json(success(result, '文件上传成功'));
  } catch (err) {
    console.error('[HSE-Documents] 上传失败:', err);
    res.json(error(-1, `文件上传失败: ${err.message}`));
  }
});

// ============================================================
// 文件列表
// ============================================================
router.get('/', async (req, res) => {
  try {
    const result = await documentService.getFileList(req.query);
    res.json(success(result, '查询成功'));
  } catch (err) {
    console.error('[HSE-Documents] 列表查询失败:', err);
    res.json(error(-1, `查询失败: ${err.message}`));
  }
});

// ============================================================
// 文件统计
// ============================================================
router.get('/stats', async (req, res) => {
  try {
    const result = await documentService.getFileStats();
    res.json(success(result, '查询成功'));
  } catch (err) {
    console.error('[HSE-Documents] 统计查询失败:', err);
    res.json(error(-1, `统计查询失败: ${err.message}`));
  }
});

// ============================================================
// 分类管理
// ============================================================
router.get('/categories', async (req, res) => {
  try {
    const tree = await documentService.getCategoryTree();
    res.json(success(tree, '查询成功'));
  } catch (err) {
    console.error('[HSE-Documents] 分类树查询失败:', err);
    res.json(error(-1, `查询失败: ${err.message}`));
  }
});

router.post('/categories', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const result = await documentService.createCategory(req.body, req.user);
    res.json(success(result, '分类创建成功'));
  } catch (err) {
    console.error('[HSE-Documents] 创建分类失败:', err);
    res.json(error(-1, `创建失败: ${err.message}`));
  }
});

router.put('/categories/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const result = await documentService.updateCategory(
      parseInt(req.params.id, 10),
      req.body,
      req.user
    );
    if (!result) return res.json(error(-1, '分类不存在'));
    res.json(success(result, '分类更新成功'));
  } catch (err) {
    console.error('[HSE-Documents] 更新分类失败:', err);
    res.json(error(-1, `更新失败: ${err.message}`));
  }
});

router.delete('/categories/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    await documentService.deleteCategory(parseInt(req.params.id, 10));
    res.json(success(null, '分类删除成功'));
  } catch (err) {
    console.error('[HSE-Documents] 删除分类失败:', err);
    res.json(error(-1, err.message));
  }
});

// ============================================================
// 标签管理
// ============================================================
router.get('/tags', async (req, res) => {
  try {
    const list = await documentService.getTagList();
    res.json(success(list, '查询成功'));
  } catch (err) {
    console.error('[HSE-Documents] 标签查询失败:', err);
    res.json(error(-1, `查询失败: ${err.message}`));
  }
});

router.post('/tags', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const result = await documentService.createTag(req.body, req.user);
    res.json(success(result, '标签创建成功'));
  } catch (err) {
    console.error('[HSE-Documents] 创建标签失败:', err);
    res.json(error(-1, `创建失败: ${err.message}`));
  }
});

// ============================================================
// 文件详情/下载/更新/删除/审核
// ============================================================
router.get('/:id', async (req, res) => {
  try {
    const result = await documentService.getFileDetail(parseInt(req.params.id, 10));
    if (!result) return res.json(error(-1, '文件不存在'));
    res.json(success(result, '查询成功'));
  } catch (err) {
    console.error('[HSE-Documents] 详情查询失败:', err);
    res.json(error(-1, `查询失败: ${err.message}`));
  }
});

router.get('/:id/download', async (req, res) => {
  try {
    const ok = await documentService.downloadFile(req, res, parseInt(req.params.id, 10));
    if (!ok) return res.json(error(-1, '文件不存在或已被删除'));
    // 流式响应已由 service 处理，无需再 res.json
  } catch (err) {
    console.error('[HSE-Documents] 下载失败:', err);
    if (!res.headersSent) {
      res.json(error(-1, `下载失败: ${err.message}`));
    }
  }
});

router.put('/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const result = await documentService.updateFile(
      parseInt(req.params.id, 10),
      req.body
    );
    if (!result) return res.json(error(-1, '文件不存在'));
    // 更新标签使用次数
    if (Array.isArray(req.body.tagIds)) {
      await documentService.incrementTagUsage(req.body.tagIds);
    }
    res.json(success(result, '更新成功'));
  } catch (err) {
    console.error('[HSE-Documents] 更新失败:', err);
    res.json(error(-1, `更新失败: ${err.message}`));
  }
});

// 软删除（仅数据库标记，不物理删除服务器文件）
router.delete('/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const ok = await documentService.softDeleteFile(parseInt(req.params.id, 10));
    if (!ok) return res.json(error(-1, '文件不存在'));
    res.json(success(null, '文件已删除'));
  } catch (err) {
    console.error('[HSE-Documents] 删除失败:', err);
    res.json(error(-1, `删除失败: ${err.message}`));
  }
});

// 文件审核（仅 admin/safety_manager）
router.post('/:id/review', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const result = await documentService.reviewFile(
      parseInt(req.params.id, 10),
      req.body,
      req.user
    );
    if (!result) return res.json(error(-1, '文件不存在'));
    res.json(success(result, '审核完成'));
  } catch (err) {
    console.error('[HSE-Documents] 审核失败:', err);
    res.json(error(-1, err.message));
  }
});

// ============================================================
// AI 分析
// ============================================================

// 触发AI分析（仅 admin/safety_manager）
router.post('/:id/analyze', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const fileId = parseInt(req.params.id, 10);
    const username = req.user?.username || 'unknown';
    const customPrompt = req.body?.customPrompt;

    const task = await documentAiService.createAnalysisTask(fileId, username);
    documentAiService.startAnalysisAsync(fileId, task.id, customPrompt);

    res.json(success({
      analysisId: task.id,
      status: task.status,
      triggeredAt: task.triggered_at,
    }, '分析任务已创建'));
  } catch (err) {
    console.error('[HSE-Documents] 触发AI分析失败:', err);
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json(error(-1, err.message));
  }
});

// 获取最新分析结果
router.get('/:id/analysis', async (req, res) => {
  try {
    const fileId = parseInt(req.params.id, 10);
    const result = await documentAiService.getLatestAnalysis(fileId);
    if (!result) return res.json(success(null, '暂无分析记录'));
    res.json(success(result));
  } catch (err) {
    console.error('[HSE-Documents] 获取分析结果失败:', err);
    res.json(error(-1, err.message));
  }
});

// 获取分析历史列表
router.get('/:id/analysis/history', async (req, res) => {
  try {
    const fileId = parseInt(req.params.id, 10);
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 10;
    const result = await documentAiService.getAnalysisHistory(fileId, page, pageSize);
    res.json(success(result));
  } catch (err) {
    console.error('[HSE-Documents] 获取分析历史失败:', err);
    res.json(error(-1, err.message));
  }
});

// 获取指定分析详情
router.get('/:id/analysis/:aid', async (req, res) => {
  try {
    const fileId = parseInt(req.params.id, 10);
    const analysisId = parseInt(req.params.aid, 10);
    const result = await documentAiService.getAnalysisDetail(fileId, analysisId);
    if (!result) return res.json(error(-1, '分析记录不存在'));
    res.json(success(result));
  } catch (err) {
    console.error('[HSE-Documents] 获取分析详情失败:', err);
    res.json(error(-1, err.message));
  }
});

// 重试分析（仅 admin/safety_manager）
router.post('/:id/analysis/:aid/retry', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const fileId = parseInt(req.params.id, 10);
    const analysisId = parseInt(req.params.aid, 10);
    const username = req.user?.username || 'unknown';

    const task = await documentAiService.retryAnalysis(fileId, analysisId, username);
    res.json(success({
      analysisId: task.id,
      status: task.status,
      triggeredAt: task.triggered_at,
    }, '分析任务已重新创建'));
  } catch (err) {
    console.error('[HSE-Documents] 重试分析失败:', err);
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json(error(-1, err.message));
  }
});

module.exports = router;

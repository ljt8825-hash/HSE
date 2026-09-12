/**
 * HSE 批量导入中心路由 - HSE V2 Sprint5
 *
 * 端点（共 11 个）:
 *   POST   /tasks                  创建导入任务（上传文件）
 *   POST   /tasks/:id/precheck     触发预检查
 *   POST   /tasks/:id/confirm      确认执行
 *   GET    /tasks                  任务列表（分页）
 *   GET    /tasks/:id              任务详情
 *   GET    /tasks/:id/progress     任务进度（轮询用）
 *   GET    /tasks/:id/items        任务明细列表（分页）
 *   POST   /items/:id/retry        单个失败项重试
 *   POST   /tasks/:id/retry        批量重试失败项
 *   GET    /templates/:type        下载导入模板
 *   GET    /concurrent-info        获取并发限制信息
 *
 * 复用（不修改）:
 *   - middleware/auth.js     的 requireRole（角色校验）
 *   - middleware/response.js 的 success / error
 *   - middleware/upload.js   的 createUploader
 *   - services/batchImportService 批量导入业务逻辑
 *
 * 权限码:
 *   batch_import:create   - 创建导入任务
 *   batch_import:view     - 查看任务/进度
 *   batch_import:retry    - 失败重试
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const { success, error } = require('../middleware/response');
const { requireRole } = require('../middleware/auth');
const { createUploader } = require('../middleware/upload');
const batchImportService = require('../services/batchImportService');

// 批量上传配置（不修改 upload.js，直接使用 createUploader）
const batchUploader = createUploader({
  type: 'all',
  subDir: 'batch-import',
  maxSize: 100 * 1024 * 1024,
  fieldName: 'files',
  multiple: true,
  maxCount: 500,
});

// ============================================================
// 工具函数：从 req 中提取用户信息
// ============================================================
function _getUser(req) {
  return {
    id: req.user?.id || req.user?.userId || 0,
    username: req.user?.username || req.user?.name || 'system',
  };
}

// ============================================================
// 1. 创建导入任务（上传文件）
// POST /api/hse/batch-import/tasks
// ============================================================
router.post('/tasks', requireRole('admin', 'safety_manager', 'safety_officer'), (req, res) => {
  batchUploader.array('files', 500)(req, res, async (err) => {
    if (err) {
      console.error('[BatchImport] 文件上传失败:', err.message);
      return res.json(error(-1, `上传失败: ${err.message}`));
    }

    try {
      const { importType, module, importVersion, enterpriseId, departmentId, businessScope } = req.body;

      if (!importType) {
        return res.json(error(-1, '请指定导入类型'));
      }

      const user = _getUser(req);
      const parsedScope = businessScope ? JSON.parse(businessScope) : {};

      const result = await batchImportService.createTask({
        importType,
        module: module || null,
        importVersion: importVersion || 'v1.0',
        enterpriseId: enterpriseId ? parseInt(enterpriseId, 10) : null,
        departmentId: departmentId ? parseInt(departmentId, 10) : null,
        businessScope: parsedScope,
        files: req.files || [],
        user,
        req,
      });

      res.json(success(result, '任务创建成功'));
    } catch (err) {
      console.error('[BatchImport] 创建任务失败:', err.message);
      res.json(error(-1, `创建失败: ${err.message}`));
    }
  });
});

// ============================================================
// 2. 触发预检查
// POST /api/hse/batch-import/tasks/:id/precheck
// ============================================================
router.post('/tasks/:id/precheck', requireRole('admin', 'safety_manager', 'safety_officer'), async (req, res) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    if (isNaN(taskId)) {
      return res.json(error(-1, '无效的任务ID'));
    }

    const user = _getUser(req);
    const result = await batchImportService.precheckTask(taskId, user, req);

    res.json(success(result, '预检查已启动'));
  } catch (err) {
    console.error('[BatchImport] 预检查失败:', err.message);
    res.json(error(-1, `预检查失败: ${err.message}`));
  }
});

// ============================================================
// 3. 确认执行
// POST /api/hse/batch-import/tasks/:id/confirm
// ============================================================
router.post('/tasks/:id/confirm', requireRole('admin', 'safety_manager', 'safety_officer'), async (req, res) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    if (isNaN(taskId)) {
      return res.json(error(-1, '无效的任务ID'));
    }

    const { skipInvalid = true, skipDuplicate = true } = req.body || {};
    const user = _getUser(req);

    const result = await batchImportService.confirmTask(
      taskId,
      { skipInvalid, skipDuplicate },
      user,
      req
    );

    res.json(success(result, '已确认执行'));
  } catch (err) {
    console.error('[BatchImport] 确认执行失败:', err.message);
    res.json(error(-1, `确认失败: ${err.message}`));
  }
});

// ============================================================
// 4. 任务列表（分页）
// GET /api/hse/batch-import/tasks
// ============================================================
router.get('/tasks', requireRole('admin', 'safety_manager', 'safety_officer', 'group_admin'), async (req, res) => {
  try {
    const user = _getUser(req);
    const result = await batchImportService.getTaskList(req.query, user);
    res.json(success(result, '查询成功'));
  } catch (err) {
    console.error('[BatchImport] 任务列表查询失败:', err.message);
    res.json(error(-1, `查询失败: ${err.message}`));
  }
});

// ============================================================
// 5. 任务详情
// GET /api/hse/batch-import/tasks/:id
// ============================================================
router.get('/tasks/:id', requireRole('admin', 'safety_manager', 'safety_officer', 'group_admin'), async (req, res) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    if (isNaN(taskId)) {
      return res.json(error(-1, '无效的任务ID'));
    }

    const result = await batchImportService.getTaskDetail(taskId);
    if (!result) {
      return res.json(error(-1, '任务不存在'));
    }

    res.json(success(result, '查询成功'));
  } catch (err) {
    console.error('[BatchImport] 任务详情查询失败:', err.message);
    res.json(error(-1, `查询失败: ${err.message}`));
  }
});

// ============================================================
// 6. 任务进度（轮询用）
// GET /api/hse/batch-import/tasks/:id/progress
// ============================================================
router.get('/tasks/:id/progress', requireRole('admin', 'safety_manager', 'safety_officer', 'group_admin'), async (req, res) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    if (isNaN(taskId)) {
      return res.json(error(-1, '无效的任务ID'));
    }

    const result = await batchImportService.getProgress(taskId);
    if (!result) {
      return res.json(error(-1, '任务不存在'));
    }

    res.json(success(result, '查询成功'));
  } catch (err) {
    console.error('[BatchImport] 进度查询失败:', err.message);
    res.json(error(-1, `查询失败: ${err.message}`));
  }
});

// ============================================================
// 7. 任务明细列表（分页）
// GET /api/hse/batch-import/tasks/:id/items
// ============================================================
router.get('/tasks/:id/items', requireRole('admin', 'safety_manager', 'safety_officer', 'group_admin'), async (req, res) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    if (isNaN(taskId)) {
      return res.json(error(-1, '无效的任务ID'));
    }

    const result = await batchImportService.getItemList(taskId, req.query);
    res.json(success(result, '查询成功'));
  } catch (err) {
    console.error('[BatchImport] 明细列表查询失败:', err.message);
    res.json(error(-1, `查询失败: ${err.message}`));
  }
});

// ============================================================
// 8. 单个失败项重试
// POST /api/hse/batch-import/items/:id/retry
// ============================================================
router.post('/items/:id/retry', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const itemId = parseInt(req.params.id, 10);
    if (isNaN(itemId)) {
      return res.json(error(-1, '无效的明细ID'));
    }

    const user = _getUser(req);
    const result = await batchImportService.retryItem(itemId, user, req);

    res.json(success(result, '重试已启动'));
  } catch (err) {
    console.error('[BatchImport] 重试失败:', err.message);
    res.json(error(-1, `重试失败: ${err.message}`));
  }
});

// ============================================================
// 9. 批量重试失败项
// POST /api/hse/batch-import/tasks/:id/retry
// ============================================================
router.post('/tasks/:id/retry', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    if (isNaN(taskId)) {
      return res.json(error(-1, '无效的任务ID'));
    }

    const user = _getUser(req);
    const result = await batchImportService.retryTaskFailed(taskId, user, req);

    res.json(success(result, '批量重试已启动'));
  } catch (err) {
    console.error('[BatchImport] 批量重试失败:', err.message);
    res.json(error(-1, `批量重试失败: ${err.message}`));
  }
});

// ============================================================
// 10. 下载导入模板
// GET /api/hse/batch-import/templates/:type
// ============================================================
router.get('/templates/:type', requireRole('admin', 'safety_manager', 'safety_officer'), async (req, res) => {
  try {
    const { type } = req.params;
    const { version = 'v1.0' } = req.query;

    const template = await batchImportService.getTemplate(type, version);
    if (!template || template.error) {
      return res.json(error(-1, template?.error || '模板文件不存在'));
    }

    res.setHeader('X-Import-Version', version);
    res.setHeader('Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(template.fileName)}"`
    );

    res.sendFile(template.filePath, (err) => {
      if (err) {
        console.error('[BatchImport] 模板下载失败:', err.message);
      }
    });
  } catch (err) {
    console.error('[BatchImport] 模板下载失败:', err.message);
    res.json(error(-1, `下载失败: ${err.message}`));
  }
});

// ============================================================
// 11. 获取并发限制信息
// GET /api/hse/batch-import/concurrent-info
// ============================================================
router.get('/concurrent-info', requireRole('admin', 'safety_manager', 'safety_officer'), async (req, res) => {
  try {
    const result = await batchImportService.getConcurrentInfo();
    res.json(success(result, '查询成功'));
  } catch (err) {
    console.error('[BatchImport] 并发信息查询失败:', err.message);
    res.json(error(-1, `查询失败: ${err.message}`));
  }
});

module.exports = router;

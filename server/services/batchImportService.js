/**
 * HSE 批量导入中心 - 核心服务层
 *
 * 职责: 批量导入任务创建、预检查、确认执行、异步处理、失败重试、进度查询
 * 复用: config/db(pool)、middleware/upload(validateFileSignature, deleteFile)
 *       services/documentService.uploadFile()、services/standardService.batchImportClauses()
 *       services/notificationService.createNotification()
 * 不修改: 任何现有Service、任何现有表、upload.js
 *
 * 数据库表（见 sql/hse_batch_import_v58_migration.sql）:
 *   hse_batch_import_tasks  批量导入任务主表
 *   hse_batch_import_items  批量导入明细表
 *   sys_operation_log       操作日志（复用）
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pool } = require('../config/db');
const { validateFileSignature, deleteFile, ensureDir, fixFilenameEncoding } = require('../middleware/upload');
const { createNotification } = require('../services/notificationService');

// ============================================================
// 常量配置
// ============================================================
const CONCURRENT_TASK_LIMIT = 3;
const MAX_FILES_PER_TASK = 500;
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_RETRY_COUNT = 3;

const TASK_STATUS = {
  PENDING: 'pending',
  PRECHECKING: 'prechecking',
  PRECHECKED: 'prechecked',
  CONFIRMED: 'confirmed',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

const ITEM_STATUS = {
  PENDING: 'pending',
  PRECHECKING: 'prechecking',
  PRECHECKED: 'prechecked',
  INVALID: 'invalid',
  DUPLICATE: 'duplicate',
  PROCESSING: 'processing',
  SUCCESS: 'success',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  RETRYING: 'retrying',
};

const IMPORT_TYPE = {
  DOCUMENT: 'document',
  STANDARD_CLAUSE: 'standard_clause',
  SAFETY_RECORD: 'safety_record',
};

const ALLOWED_EXTENSIONS = {
  document: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'],
  standard_clause: ['.xlsx', '.xls'],
  safety_record: ['.xlsx', '.xls'],
};

const FILE_TYPE_MAP = {
  '.pdf': 'pdf',
  '.doc': 'word',
  '.docx': 'word',
  '.xls': 'excel',
  '.xlsx': 'excel',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.png': 'image',
  '.gif': 'image',
  '.webp': 'image',
  '.bmp': 'image',
};

const ERROR_CODES = {
  DUP_FILE: 'DUP_FILE',
  INVALID_TYPE: 'INVALID_TYPE',
  INVALID_SIGNATURE: 'INVALID_SIGNATURE',
  OVERSIZE: 'OVERSIZE',
  BIZ_ERROR: 'BIZ_ERROR',
  PARSE_ERROR: 'PARSE_ERROR',
  DB_ERROR: 'DB_ERROR',
  UNKNOWN: 'UNKNOWN',
};

// ============================================================
// 辅助函数
// ============================================================

/**
 * 生成任务编号
 */
function generateTaskNo() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(Math.random() * 9000 + 1000);
  return `BI${dateStr}${random}`;
}

/**
 * 计算文件 SHA-256
 */
function computeFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * 数据库行转驼峰格式 - 任务
 */
function camelTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    taskNo: row.task_no,
    importType: row.import_type,
    module: row.module,
    importVersion: row.import_version,
    enterpriseId: row.enterprise_id,
    departmentId: row.department_id,
    businessScope: row.business_scope,
    totalCount: row.total_count,
    successCount: row.success_count,
    failCount: row.fail_count,
    pendingCount: row.pending_count,
    status: row.status,
    precheckResult: row.precheck_result,
    progress: row.progress,
    fileStorageDir: row.file_storage_dir,
    resultSummary: row.result_summary,
    errorMessage: row.error_message,
    createdBy: row.created_by,
    createdAt: row.created_at,
    precheckedAt: row.prechecked_at,
    confirmedAt: row.confirmed_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 数据库行转驼峰格式 - 明细
 */
function camelItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    taskId: row.task_id,
    seqNo: row.seq_no,
    originalName: row.original_name,
    storageName: row.storage_name,
    filePath: row.file_path,
    fileSize: row.file_size,
    fileType: row.file_type,
    mimeType: row.mime_type,
    fileHash: row.file_hash,
    status: row.status,
    precheckStatus: row.precheck_status,
    precheckMessage: row.precheck_message,
    targetTable: row.target_table,
    targetId: row.target_id,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    retryCount: row.retry_count,
    maxRetry: row.max_retry,
    metadata: row.metadata,
    createdAt: row.created_at,
    precheckedAt: row.prechecked_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 写入操作日志（复用 sys_operation_log）
 */
async function _writeOperationLog({ userId, username, action, module, description, ip, userAgent, statusCode = 200, detail = {} }) {
  try {
    await pool.query(
      `INSERT INTO sys_operation_log
        (user_id, username, action, module, description, ip_address, user_agent, status_code, detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        userId || 0,
        username || 'system',
        action,
        module || 'batch_import',
        description || '',
        ip || null,
        userAgent || null,
        statusCode,
        detail,
      ]
    );
  } catch (err) {
    console.warn('[BatchImport] 操作日志写入失败:', err.message);
  }
}

// ============================================================
// 并发控制
// ============================================================

/**
 * 检查并发任务限制
 * @returns {Object} { canCreate, currentCount, maxAllowed }
 */
async function _checkConcurrentLimit() {
  const res = await pool.query(
    `SELECT COUNT(*) as count 
     FROM hse_batch_import_tasks 
     WHERE status IN ($1, $2) 
       AND is_deleted = FALSE`,
    [TASK_STATUS.PROCESSING, TASK_STATUS.CONFIRMED]
  );
  const currentCount = parseInt(res.rows[0].count, 10);
  return {
    currentCount,
    maxAllowed: CONCURRENT_TASK_LIMIT,
    canCreate: currentCount < CONCURRENT_TASK_LIMIT,
  };
}

// ============================================================
// 任务管理
// ============================================================

/**
 * 创建批量导入任务
 * @param {Object} params
 * @param {string} params.importType - 导入类型
 * @param {string} params.importVersion - 导入版本
 * @param {number} params.enterpriseId - 企业ID
 * @param {number} params.departmentId - 部门ID
 * @param {Object} params.businessScope - 业务范围
 * @param {Array} params.files - multer 文件数组
 * @param {Object} params.user - 当前用户 { id, username }
 * @param {Object} params.req - Express 请求对象
 */
async function createTask({ importType, module, importVersion = 'v1.0', enterpriseId, departmentId, businessScope = {}, files, user, req }) {
  if (!Object.values(IMPORT_TYPE).includes(importType)) {
    throw new Error(`不支持的导入类型: ${importType}`);
  }

  if (!files || files.length === 0) {
    throw new Error('请至少上传一个文件');
  }

  if (files.length > MAX_FILES_PER_TASK) {
    throw new Error(`单任务最多支持 ${MAX_FILES_PER_TASK} 个文件`);
  }

  const { canCreate, currentCount, maxAllowed } = await _checkConcurrentLimit();
  if (!canCreate) {
    throw new Error(`当前运行任务数已达上限（${currentCount}/${maxAllowed}），请稍后再试`);
  }

  const allowedExts = ALLOWED_EXTENSIONS[importType] || [];
  const taskNo = generateTaskNo();
  const storageDir = path.join(__dirname, `../uploads/batch-import/${taskNo}`);
  ensureDir(storageDir);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const taskResult = await client.query(
      `INSERT INTO hse_batch_import_tasks
        (task_no, import_type, module, import_version, enterprise_id, department_id, business_scope,
         total_count, pending_count, status, file_storage_dir, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        taskNo,
        importType,
        module || null,
        importVersion,
        enterpriseId || null,
        departmentId || null,
        businessScope,
        files.length,
        files.length,
        TASK_STATUS.PENDING,
        storageDir,
        user.username,
      ]
    );
    const task = taskResult.rows[0];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const originalName = fixFilenameEncoding(file.originalname || 'unknown');
      const ext = path.extname(originalName).toLowerCase();
      const fileType = FILE_TYPE_MAP[ext] || 'other';

      const targetPath = path.join(storageDir, file.filename);
      fs.renameSync(file.path, targetPath);

      await client.query(
        `INSERT INTO hse_batch_import_items
          (task_id, seq_no, original_name, storage_name, file_path, file_size, file_type,
           mime_type, status, precheck_status, max_retry, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          task.id,
          i + 1,
          originalName,
          file.filename,
          targetPath,
          file.size,
          fileType,
          file.mimetype,
          ITEM_STATUS.PENDING,
          'pending',
          MAX_RETRY_COUNT,
          { originalExt: ext },
        ]
      );
    }

    await client.query('COMMIT');

    _writeOperationLog({
      userId: user.id,
      username: user.username,
      action: 'create',
      module: 'batch_import',
      description: `创建批量导入任务 ${taskNo}，共 ${files.length} 个文件`,
      ip: req?.ip,
      userAgent: req?.headers?.['user-agent'],
      detail: { taskId: task.id, taskNo, importType, fileCount: files.length },
    });

    return camelTask(task);
  } catch (err) {
    await client.query('ROLLBACK');
    try {
      if (fs.existsSync(storageDir)) {
        fs.rmSync(storageDir, { recursive: true, force: true });
      }
    } catch (e) {
      console.warn('[BatchImport] 清理临时文件失败:', e.message);
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 预检查任务
 * @param {number} taskId
 * @param {Object} user
 * @param {Object} req
 */
async function precheckTask(taskId, user, req) {
  const taskResult = await pool.query(
    `SELECT * FROM hse_batch_import_tasks WHERE id = $1 AND is_deleted = FALSE`,
    [taskId]
  );
  const task = taskResult.rows[0];
  if (!task) throw new Error('任务不存在');
  if (task.status !== TASK_STATUS.PENDING && task.status !== TASK_STATUS.PRECHECKED) {
    throw new Error(`当前状态 ${task.status} 不允许预检查`);
  }

  await pool.query(
    `UPDATE hse_batch_import_tasks SET status = $1, updated_at = NOW() WHERE id = $2`,
    [TASK_STATUS.PRECHECKING, taskId]
  );

  setImmediate(() => {
    _doPrecheck(taskId, user, req).catch((err) => {
      console.error('[BatchImport] 预检查失败:', err.message);
      pool.query(
        `UPDATE hse_batch_import_tasks 
         SET status = $1, error_message = $2, updated_at = NOW() 
         WHERE id = $3`,
        [TASK_STATUS.FAILED, err.message, taskId]
      ).catch((e) => console.warn('[BatchImport] 更新任务状态失败:', e.message));
    });
  });

  return { taskId, status: TASK_STATUS.PRECHECKING, message: '预检查已开始，请稍候' };
}

/**
 * 执行预检查（后台异步）
 */
async function _doPrecheck(taskId, user, req) {
  const itemsResult = await pool.query(
    `SELECT * FROM hse_batch_import_items 
     WHERE task_id = $1 AND is_deleted = FALSE 
     ORDER BY seq_no`,
    [taskId]
  );
  const items = itemsResult.rows;
  const taskResult = await pool.query(
    `SELECT * FROM hse_batch_import_tasks WHERE id = $1`,
    [taskId]
  );
  const task = taskResult.rows[0];
  if (!task) return;

  const importType = task.import_type;
  const existingHashes = new Set();

  const dupResult = await pool.query(
    `SELECT DISTINCT file_hash 
     FROM hse_batch_import_items 
     WHERE task_id != $1 AND file_hash IS NOT NULL AND is_deleted = FALSE`,
    [taskId]
  );
  dupResult.rows.forEach((r) => existingHashes.add(r.file_hash));

  let validCount = 0;
  let invalidCount = 0;
  let dupCount = 0;
  const precheckItems = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    let precheckStatus = 'passed';
    let precheckMessage = '';
    let fileHash = null;
    let errorCode = null;

    try {
      if (item.file_size > MAX_FILE_SIZE) {
        precheckStatus = 'failed';
        precheckMessage = `文件大小超过限制（${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB）`;
        errorCode = ERROR_CODES.OVERSIZE;
      }

      if (precheckStatus === 'passed') {
        fileHash = await computeFileHash(item.file_path);

        if (existingHashes.has(fileHash)) {
          precheckStatus = 'duplicate';
          precheckMessage = '文件已存在（系统检测到重复文件）';
          errorCode = ERROR_CODES.DUP_FILE;
          dupCount++;
        } else {
          existingHashes.add(fileHash);
        }
      }

      if (precheckStatus === 'passed') {
        const ext = path.extname(item.original_name).toLowerCase();
        const allowedExts = ALLOWED_EXTENSIONS[importType] || [];
        if (allowedExts.length > 0 && !allowedExts.includes(ext)) {
          precheckStatus = 'failed';
          precheckMessage = `不支持的文件类型: ${ext}`;
          errorCode = ERROR_CODES.INVALID_TYPE;
        }
      }

      if (precheckStatus === 'passed' && importType === 'document') {
        const ext = path.extname(item.original_name).toLowerCase();
        let sigType = null;
        if (['.pdf'].includes(ext)) sigType = 'pdf';
        else if (['.doc', '.docx'].includes(ext)) sigType = 'word';
        else if (['.xls', '.xlsx'].includes(ext)) sigType = 'excel';
        else if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext)) sigType = 'image';

        if (sigType) {
          const valid = validateFileSignature(item.file_path, sigType);
          if (!valid) {
            precheckStatus = 'failed';
            precheckMessage = '文件内容校验失败，文件可能已损坏或被伪造';
            errorCode = ERROR_CODES.INVALID_SIGNATURE;
          }
        }
      }

      if (precheckStatus === 'passed') {
        validCount++;
      } else if (precheckStatus === 'failed') {
        invalidCount++;
      }

      await pool.query(
        `UPDATE hse_batch_import_items 
         SET file_hash = $1, precheck_status = $2, precheck_message = $3, 
             error_code = $4, prechecked_at = NOW(), updated_at = NOW()
         WHERE id = $5`,
        [fileHash, precheckStatus, precheckMessage, errorCode, item.id]
      );

      precheckItems.push({
        itemId: item.id,
        seqNo: item.seq_no,
        originalName: item.original_name,
        fileSize: item.file_size,
        precheckStatus,
        precheckMessage,
        errorCode,
      });
    } catch (err) {
      invalidCount++;
      await pool.query(
        `UPDATE hse_batch_import_items 
         SET precheck_status = $1, precheck_message = $2, 
             error_code = $3, prechecked_at = NOW(), updated_at = NOW()
         WHERE id = $4`,
        ['failed', `预检查异常: ${err.message}`, ERROR_CODES.UNKNOWN, item.id]
      );
      precheckItems.push({
        itemId: item.id,
        seqNo: item.seq_no,
        originalName: item.original_name,
        precheckStatus: 'failed',
        precheckMessage: `预检查异常: ${err.message}`,
        errorCode: ERROR_CODES.UNKNOWN,
      });
    }
  }

  const precheckResult = {
    validCount,
    invalidCount,
    dupCount,
    totalCount: items.length,
    items: precheckItems,
  };

  await pool.query(
    `UPDATE hse_batch_import_tasks 
     SET status = $1, precheck_result = $2, prechecked_at = NOW(), updated_at = NOW() 
     WHERE id = $3`,
    [TASK_STATUS.PRECHECKED, precheckResult, taskId]
  );

  _writeOperationLog({
    userId: user?.id || 0,
    username: user?.username || 'system',
    action: 'precheck',
    module: 'batch_import',
    description: `预检查任务 ${task.task_no} 完成：通过 ${validCount}，失败 ${invalidCount}，重复 ${dupCount}`,
    ip: req?.ip,
    userAgent: req?.headers?.['user-agent'],
    detail: { taskId, taskNo: task.task_no, validCount, invalidCount, dupCount },
  });

  try {
    const userRow = await pool.query(
      `SELECT id FROM users WHERE username = $1 LIMIT 1`,
      [task.created_by]
    );
    if (userRow.rows.length > 0) {
      await createNotification({
        userId: userRow.rows[0].id,
        title: '批量导入预检查完成',
        content: `任务 ${task.task_no} 预检查完成：通过 ${validCount}，失败 ${invalidCount}，重复 ${dupCount}`,
        type: 'system',
        bizType: 'batch_import',
        bizId: String(taskId),
      });
    }
  } catch (e) {
    console.warn('[BatchImport] 通知发送失败:', e.message);
  }
}

/**
 * 确认执行任务
 * @param {number} taskId
 * @param {Object} opts - { skipInvalid: true, skipDuplicate: true }
 * @param {Object} user
 * @param {Object} req
 */
async function confirmTask(taskId, opts = {}, user, req) {
  const { skipInvalid = true, skipDuplicate = true } = opts;

  const taskResult = await pool.query(
    `SELECT * FROM hse_batch_import_tasks WHERE id = $1 AND is_deleted = FALSE`,
    [taskId]
  );
  const task = taskResult.rows[0];
  if (!task) throw new Error('任务不存在');
  if (task.status !== TASK_STATUS.PRECHECKED) {
    throw new Error(`当前状态 ${task.status} 不允许确认执行，请先完成预检查`);
  }

  const itemsResult = await pool.query(
    `SELECT * FROM hse_batch_import_items 
     WHERE task_id = $1 AND is_deleted = FALSE 
     ORDER BY seq_no`,
    [taskId]
  );
  const items = itemsResult.rows;

  let pendingCount = 0;
  let skipCount = 0;

  for (const item of items) {
    let newStatus = ITEM_STATUS.PRECHECKED;
    if (item.precheck_status === 'failed' && skipInvalid) {
      newStatus = ITEM_STATUS.SKIPPED;
      skipCount++;
    } else if (item.precheck_status === 'duplicate' && skipDuplicate) {
      newStatus = ITEM_STATUS.SKIPPED;
      skipCount++;
    } else {
      pendingCount++;
    }

    if (newStatus !== item.status) {
      await pool.query(
        `UPDATE hse_batch_import_items SET status = $1, updated_at = NOW() WHERE id = $2`,
        [newStatus, item.id]
      );
    }
  }

  await pool.query(
    `UPDATE hse_batch_import_tasks 
     SET status = $1, pending_count = $2, confirmed_at = NOW(), updated_at = NOW() 
     WHERE id = $3`,
    [TASK_STATUS.CONFIRMED, pendingCount, taskId]
  );

  _writeOperationLog({
    userId: user?.id || 0,
    username: user?.username || 'system',
    action: 'confirm',
    module: 'batch_import',
    description: `确认执行任务 ${task.task_no}，待处理 ${pendingCount} 个，跳过 ${skipCount} 个`,
    ip: req?.ip,
    userAgent: req?.headers?.['user-agent'],
    detail: { taskId, taskNo: task.task_no, pendingCount, skipCount, skipInvalid, skipDuplicate },
  });

  setImmediate(() => {
    processTask(taskId, user, req).catch((err) => {
      console.error('[BatchImport] 处理任务失败:', err.message);
    });
  });

  return { taskId, status: TASK_STATUS.CONFIRMED, pendingCount, skipCount };
}

// ============================================================
// 任务处理（核心执行）
// ============================================================

/**
 * 启动任务处理
 */
async function processTask(taskId, user, req) {
  const taskResult = await pool.query(
    `SELECT * FROM hse_batch_import_tasks WHERE id = $1 AND is_deleted = FALSE`,
    [taskId]
  );
  const task = taskResult.rows[0];
  if (!task) return;

  if (task.status !== TASK_STATUS.CONFIRMED) {
    return;
  }

  await pool.query(
    `UPDATE hse_batch_import_tasks 
     SET status = $1, started_at = NOW(), progress = 0, updated_at = NOW() 
     WHERE id = $2`,
    [TASK_STATUS.PROCESSING, taskId]
  );

  _writeOperationLog({
    userId: user?.id || 0,
    username: user?.username || 'system',
    action: 'start',
    module: 'batch_import',
    description: `开始处理任务 ${task.task_no}`,
    ip: req?.ip,
    userAgent: req?.headers?.['user-agent'],
    detail: { taskId, taskNo: task.task_no },
  });

  const pendingItemsResult = await pool.query(
    `SELECT * FROM hse_batch_import_items 
     WHERE task_id = $1 AND status = $2 AND is_deleted = FALSE 
     ORDER BY seq_no`,
    [taskId, ITEM_STATUS.PRECHECKED]
  );
  const pendingItems = pendingItemsResult.rows;
  const total = pendingItems.length;

  let successCount = 0;
  let failCount = 0;
  const errorTypeStats = {};

  for (let i = 0; i < pendingItems.length; i++) {
    const item = pendingItems[i];
    try {
      await pool.query(
        `UPDATE hse_batch_import_items 
         SET status = $1, started_at = NOW(), updated_at = NOW() 
         WHERE id = $2`,
        [ITEM_STATUS.PROCESSING, item.id]
      );

      const result = await _processItem(item, task, user, req);

      if (result.success) {
        successCount++;
        await pool.query(
          `UPDATE hse_batch_import_items 
           SET status = $1, target_table = $2, target_id = $3, 
               completed_at = NOW(), updated_at = NOW() 
           WHERE id = $4`,
          [ITEM_STATUS.SUCCESS, result.targetTable, result.targetId, item.id]
        );
      } else {
        failCount++;
        errorTypeStats[result.errorCode] = (errorTypeStats[result.errorCode] || 0) + 1;
        await pool.query(
          `UPDATE hse_batch_import_items 
           SET status = $1, error_code = $2, error_message = $3, 
               completed_at = NOW(), updated_at = NOW() 
           WHERE id = $4`,
          [ITEM_STATUS.FAILED, result.errorCode, result.errorMessage, item.id]
        );
      }
    } catch (err) {
      failCount++;
      errorTypeStats[ERROR_CODES.UNKNOWN] = (errorTypeStats[ERROR_CODES.UNKNOWN] || 0) + 1;
      await pool.query(
        `UPDATE hse_batch_import_items 
         SET status = $1, error_code = $2, error_message = $3, 
             completed_at = NOW(), updated_at = NOW() 
         WHERE id = $4`,
        [ITEM_STATUS.FAILED, ERROR_CODES.UNKNOWN, err.message, item.id]
      ).catch((e) => console.warn('[BatchImport] 更新明细状态失败:', e.message));
    }

    const progress = Math.round(((i + 1) / total) * 100);
    if ((i + 1) % 5 === 0 || i === total - 1) {
      await pool.query(
        `UPDATE hse_batch_import_tasks 
         SET success_count = $1, fail_count = $2, 
             pending_count = $3, progress = $4, updated_at = NOW()
         WHERE id = $5`,
        [successCount, failCount, total - i - 1, progress, taskId]
      );
    }
  }

  const resultSummary = {
    errorTypeStats,
    totalProcessed: total,
    successCount,
    failCount,
  };

  await pool.query(
    `UPDATE hse_batch_import_tasks 
     SET status = $1, success_count = $2, fail_count = $3, 
         pending_count = 0, progress = 100, result_summary = $4,
         completed_at = NOW(), updated_at = NOW() 
     WHERE id = $5`,
    [TASK_STATUS.COMPLETED, successCount, failCount, resultSummary, taskId]
  );

  _writeOperationLog({
    userId: user?.id || 0,
    username: user?.username || 'system',
    action: 'complete',
    module: 'batch_import',
    description: `任务 ${task.task_no} 处理完成：成功 ${successCount}，失败 ${failCount}`,
    ip: req?.ip,
    userAgent: req?.headers?.['user-agent'],
    detail: { taskId, taskNo: task.task_no, successCount, failCount, total, resultSummary },
  });

  try {
    const userRow = await pool.query(
      `SELECT id FROM users WHERE username = $1 LIMIT 1`,
      [task.created_by]
    );
    if (userRow.rows.length > 0) {
      await createNotification({
        userId: userRow.rows[0].id,
        title: '批量导入任务完成',
        content: `任务 ${task.task_no} 处理完成：成功 ${successCount}，失败 ${failCount}`,
        type: 'system',
        bizType: 'batch_import',
        bizId: String(taskId),
      });
    }
  } catch (e) {
    console.warn('[BatchImport] 通知发送失败:', e.message);
  }
}

/**
 * 处理单个文件
 */
async function _processItem(item, task, user, req) {
  const importType = task.import_type;
  const businessScope = task.business_scope || {};

  try {
    if (importType === IMPORT_TYPE.DOCUMENT) {
      return await _processDocument(item, task, businessScope, user, req);
    } else if (importType === IMPORT_TYPE.STANDARD_CLAUSE) {
      return await _processStandardClause(item, task, businessScope, user, req);
    } else if (importType === IMPORT_TYPE.SAFETY_RECORD) {
      return { success: false, errorCode: 'NOT_SUPPORTED', errorMessage: '安全记录导入暂未实现' };
    } else {
      return { success: false, errorCode: ERROR_CODES.BIZ_ERROR, errorMessage: `不支持的导入类型: ${importType}` };
    }
  } catch (err) {
    return {
      success: false,
      errorCode: ERROR_CODES.BIZ_ERROR,
      errorMessage: err.message || '处理失败',
    };
  }
}

/**
 * 处理资料文件导入
 */
async function _processDocument(item, task, businessScope, user, req) {
  try {
    const documentService = require('./documentService');

    const fakeFile = {
      fieldname: 'file',
      originalname: item.original_name,
      encoding: '7bit',
      mimetype: item.mime_type,
      destination: path.dirname(item.file_path),
      filename: item.storage_name,
      path: item.file_path,
      size: item.file_size,
    };

    const extra = {
      categoryId: businessScope.categoryId || null,
      summary: '',
      validStartDate: null,
      validEndDate: null,
      remindDays: 30,
      metadata: {
        batchTaskId: task.id,
        batchTaskNo: task.task_no,
        importVersion: task.import_version,
      },
    };

    const result = await documentService.uploadFile(fakeFile, extra, user, req);

    return {
      success: true,
      targetTable: 'document_files',
      targetId: result.id,
    };
  } catch (err) {
    return {
      success: false,
      errorCode: ERROR_CODES.BIZ_ERROR,
      errorMessage: `资料导入失败: ${err.message}`,
    };
  }
}

/**
 * 处理标准条款Excel导入
 */
async function _processStandardClause(item, task, businessScope, user, req) {
  try {
    const xlsx = require('xlsx');
    const standardService = require('./standardService');

    const workbook = xlsx.readFile(item.file_path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = xlsx.utils.sheet_to_json(worksheet, { defval: '' });

    if (!Array.isArray(jsonData) || jsonData.length === 0) {
      return {
        success: false,
        errorCode: ERROR_CODES.PARSE_ERROR,
        errorMessage: 'Excel文件为空或格式不正确',
      };
    }

    const clauses = jsonData.map((row, idx) => ({
      code: row['条款编号'] || row['code'] || row['clause_code'] || '',
      parentCode: row['上级编号'] || row['parent_code'] || null,
      level: row['层级'] || row['level'] || 1,
      elementName: row['要素名称'] || row['element_name'] || row['element'] || '',
      clauseTitle: row['条款标题'] || row['clause_title'] || row['title'] || '',
      clauseContent: row['条款内容'] || row['clause_content'] || row['content'] || '',
      checkMethod: row['检查方法'] || row['check_method'] || '',
      scoreWeight: row['分值权重'] || row['score_weight'] || 0,
      requiredDocTypes: row['所需资料类型'] || row['required_doc_types'] || '',
      keywords: row['关键词'] || row['keywords'] || '',
      sortOrder: row['排序号'] || row['sort_order'] || (idx + 1),
      status: row['状态'] || row['status'] || 'active',
    })).filter((c) => c.code && c.clauseTitle);

    if (clauses.length === 0) {
      return {
        success: false,
        errorCode: ERROR_CODES.PARSE_ERROR,
        errorMessage: '未解析到有效条款数据，请检查Excel格式',
      };
    }

    const importResult = await standardService.batchImportClauses(clauses, user);

    if (importResult.failed > 0) {
      return {
        success: false,
        errorCode: ERROR_CODES.BIZ_ERROR,
        errorMessage: `导入完成：成功 ${importResult.success} 条，失败 ${importResult.failed} 条。${importResult.errors.slice(0, 3).map(e => `${e.code}: ${e.message}`).join('; ')}`,
      };
    }

    return {
      success: true,
      targetTable: 'safety_standard_clauses',
      targetId: null,
    };
  } catch (err) {
    if (err.message?.includes('Cannot find module') || err.code === 'MODULE_NOT_FOUND') {
      return {
        success: false,
        errorCode: ERROR_CODES.PARSE_ERROR,
        errorMessage: '缺少xlsx依赖，无法解析Excel文件',
      };
    }
    return {
      success: false,
      errorCode: ERROR_CODES.PARSE_ERROR,
      errorMessage: `Excel解析失败: ${err.message}`,
    };
  }
}

// ============================================================
// 任务查询
// ============================================================

/**
 * 获取任务列表（分页）
 */
async function getTaskList(params, user) {
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(params.pageSize, 10) || 20));
  const offset = (page - 1) * pageSize;

  const conditions = ['is_deleted = FALSE'];
  const values = [];
  let idx = 1;

  if (params.importType) {
    conditions.push(`import_type = $${idx++}`);
    values.push(params.importType);
  }
  if (params.module) {
    conditions.push(`module = $${idx++}`);
    values.push(params.module);
  }
  if (params.status) {
    conditions.push(`status = $${idx++}`);
    values.push(params.status);
  }
  if (params.keyword) {
    conditions.push(`(task_no ILIKE $${idx} OR created_by ILIKE $${idx})`);
    values.push(`%${params.keyword}%`);
    idx++;
  }
  if (params.createdBy) {
    conditions.push(`created_by = $${idx++}`);
    values.push(params.createdBy);
  }
  if (params.enterpriseId) {
    conditions.push(`enterprise_id = $${idx++}`);
    values.push(params.enterpriseId);
  }
  if (params.departmentId) {
    conditions.push(`department_id = $${idx++}`);
    values.push(params.departmentId);
  }

  const where = conditions.join(' AND ');

  const countResult = await pool.query(
    `SELECT COUNT(*) as total FROM hse_batch_import_tasks WHERE ${where}`,
    values
  );
  const total = parseInt(countResult.rows[0].total, 10);

  const listResult = await pool.query(
    `SELECT * FROM hse_batch_import_tasks 
     WHERE ${where} 
     ORDER BY created_at DESC 
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...values, pageSize, offset]
  );

  return {
    list: listResult.rows.map(camelTask),
    total,
    page,
    pageSize,
  };
}

/**
 * 获取任务详情
 */
async function getTaskDetail(taskId) {
  const taskResult = await pool.query(
    `SELECT * FROM hse_batch_import_tasks WHERE id = $1 AND is_deleted = FALSE`,
    [taskId]
  );
  if (taskResult.rows.length === 0) return null;

  const itemsResult = await pool.query(
    `SELECT * FROM hse_batch_import_items 
     WHERE task_id = $1 AND is_deleted = FALSE 
     ORDER BY seq_no`,
    [taskId]
  );

  return {
    task: camelTask(taskResult.rows[0]),
    items: itemsResult.rows.map(camelItem),
  };
}

/**
 * 获取任务进度
 */
async function getProgress(taskId) {
  const taskResult = await pool.query(
    `SELECT status, progress, total_count, success_count, fail_count, pending_count, 
            precheck_result, result_summary, error_message
     FROM hse_batch_import_tasks 
     WHERE id = $1 AND is_deleted = FALSE`,
    [taskId]
  );
  if (taskResult.rows.length === 0) return null;

  const row = taskResult.rows[0];
  return {
    taskId,
    status: row.status,
    progress: row.progress,
    totalCount: row.total_count,
    successCount: row.success_count,
    failCount: row.fail_count,
    pendingCount: row.pending_count,
    precheckResult: row.precheck_result,
    resultSummary: row.result_summary,
    errorMessage: row.error_message,
  };
}

/**
 * 获取任务明细列表
 */
async function getItemList(taskId, params = {}) {
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(params.pageSize, 10) || 50));
  const offset = (page - 1) * pageSize;

  const conditions = ['task_id = $1', 'is_deleted = FALSE'];
  const values = [taskId];
  let idx = 2;

  if (params.status) {
    conditions.push(`status = $${idx++}`);
    values.push(params.status);
  }
  if (params.keyword) {
    conditions.push(`original_name ILIKE $${idx++}`);
    values.push(`%${params.keyword}%`);
  }

  const where = conditions.join(' AND ');

  const countResult = await pool.query(
    `SELECT COUNT(*) as total FROM hse_batch_import_items WHERE ${where}`,
    values
  );
  const total = parseInt(countResult.rows[0].total, 10);

  const listResult = await pool.query(
    `SELECT * FROM hse_batch_import_items 
     WHERE ${where} 
     ORDER BY seq_no 
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...values, pageSize, offset]
  );

  return {
    list: listResult.rows.map(camelItem),
    total,
    page,
    pageSize,
  };
}

// ============================================================
// 失败重试
// ============================================================

/**
 * 重试单个失败项
 */
async function retryItem(itemId, user, req) {
  const itemResult = await pool.query(
    `SELECT bi.*, bt.* as task_info
     FROM hse_batch_import_items bi
     JOIN hse_batch_import_tasks bt ON bi.task_id = bt.id
     WHERE bi.id = $1 AND bi.is_deleted = FALSE`,
    [itemId]
  );
  if (itemResult.rows.length === 0) throw new Error('明细不存在');

  const row = itemResult.rows[0];
  const item = row;
  const task = {
    id: row.task_id,
    import_type: row.import_type,
    import_version: row.import_version,
    business_scope: row.business_scope,
    task_no: row.task_no,
  };

  if (item.status !== ITEM_STATUS.FAILED) {
    throw new Error(`当前状态 ${item.status} 不允许重试`);
  }

  if (item.retry_count >= item.max_retry) {
    throw new Error(`已达最大重试次数（${item.max_retry}）`);
  }

  await pool.query(
    `UPDATE hse_batch_import_items 
     SET status = $1, retry_count = retry_count + 1, 
         error_code = NULL, error_message = NULL,
         started_at = NULL, completed_at = NULL, updated_at = NOW()
     WHERE id = $2`,
    [ITEM_STATUS.RETRYING, itemId]
  );

  _writeOperationLog({
    userId: user?.id || 0,
    username: user?.username || 'system',
    action: 'retry',
    module: 'batch_import',
    description: `重试明细 ${itemId}（第 ${item.retry_count + 1} 次）`,
    ip: req?.ip,
    userAgent: req?.headers?.['user-agent'],
    detail: { itemId, taskId: task.id, taskNo: task.task_no, retryCount: item.retry_count + 1 },
  });

  setImmediate(async () => {
    try {
      await pool.query(
        `UPDATE hse_batch_import_items 
         SET status = $1, started_at = NOW(), updated_at = NOW() 
         WHERE id = $2`,
        [ITEM_STATUS.PROCESSING, itemId]
      );

      const result = await _processItem(item, task, user, req);

      if (result.success) {
        await pool.query(
          `UPDATE hse_batch_import_items 
           SET status = $1, target_table = $2, target_id = $3, 
               completed_at = NOW(), updated_at = NOW() 
           WHERE id = $4`,
          [ITEM_STATUS.SUCCESS, result.targetTable, result.targetId, itemId]
        );
        await pool.query(
          `UPDATE hse_batch_import_tasks 
           SET success_count = success_count + 1, fail_count = fail_count - 1, updated_at = NOW()
           WHERE id = $1`,
          [task.id]
        );
      } else {
        await pool.query(
          `UPDATE hse_batch_import_items 
           SET status = $1, error_code = $2, error_message = $3, 
               completed_at = NOW(), updated_at = NOW() 
           WHERE id = $4`,
          [ITEM_STATUS.FAILED, result.errorCode, result.errorMessage, itemId]
        );
      }
    } catch (err) {
      await pool.query(
        `UPDATE hse_batch_import_items 
         SET status = $1, error_code = $2, error_message = $3, 
             completed_at = NOW(), updated_at = NOW() 
         WHERE id = $4`,
        [ITEM_STATUS.FAILED, ERROR_CODES.UNKNOWN, err.message, itemId]
      ).catch((e) => console.warn('[BatchImport] 重试更新状态失败:', e.message));
    }
  });

  return { itemId, status: ITEM_STATUS.RETRYING, message: '重试已开始' };
}

/**
 * 批量重试任务中所有失败项
 */
async function retryTaskFailed(taskId, user, req) {
  const taskResult = await pool.query(
    `SELECT * FROM hse_batch_import_tasks WHERE id = $1 AND is_deleted = FALSE`,
    [taskId]
  );
  if (taskResult.rows.length === 0) throw new Error('任务不存在');

  const failedItemsResult = await pool.query(
    `SELECT id FROM hse_batch_import_items 
     WHERE task_id = $1 AND status = $2 AND retry_count < max_retry AND is_deleted = FALSE`,
    [taskId, ITEM_STATUS.FAILED]
  );
  const failedCount = failedItemsResult.rows.length;

  if (failedCount === 0) {
    return { taskId, retryCount: 0, message: '没有可重试的失败项' };
  }

  for (const row of failedItemsResult.rows) {
    await retryItem(row.id, user, req).catch((e) => {
      console.warn(`[BatchImport] 重试项 ${row.id} 启动失败:`, e.message);
    });
  }

  return { taskId, retryCount: failedCount, message: `已启动 ${failedCount} 个失败项重试` };
}

// ============================================================
// 模板下载
// ============================================================

/**
 * 获取导入模板
 */
async function getTemplate(importType, version = 'v1.0') {
  // 白名单校验（防任意类型/路径遍历）
  const VALID_IMPORT_TYPES = ['document', 'standard_clause', 'safety_record'];
  const VALID_VERSION_REGEX = /^v\d+\.\d+$/;

  if (!VALID_IMPORT_TYPES.includes(importType)) {
    return { error: '不支持的模板类型' };
  }
  if (!VALID_VERSION_REGEX.test(version)) {
    return { error: '无效的模板版本格式' };
  }

  const templateDir = path.join(__dirname, '../data/templates');
  const templateName = `hse-import-template-${importType}-${version}.xlsx`;
  // 使用 path.basename 防止路径遍历
  const safeName = path.basename(templateName);
  const templatePath = path.join(templateDir, safeName);

  if (!fs.existsSync(templatePath)) {
    return null;
  }

  return {
    filePath: templatePath,
    fileName: templateName,
    version,
  };
}

/**
 * 获取并发限制信息
 */
async function getConcurrentInfo() {
  return await _checkConcurrentLimit();
}

// ============================================================
// 导出
// ============================================================

module.exports = {
  createTask,
  precheckTask,
  confirmTask,
  processTask,
  getTaskList,
  getTaskDetail,
  getProgress,
  getItemList,
  retryItem,
  retryTaskFailed,
  getTemplate,
  getConcurrentInfo,
  TASK_STATUS,
  ITEM_STATUS,
  IMPORT_TYPE,
  ERROR_CODES,
  CONCURRENT_TASK_LIMIT,
  MAX_FILES_PER_TASK,
  MAX_FILE_SIZE,
};

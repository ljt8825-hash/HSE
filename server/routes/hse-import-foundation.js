const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { success, error } = require('../middleware/response');
const { auditLog } = require('./audit');

function generateBatchNo() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const timeStr = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `IMP${dateStr}${timeStr}${random}`;
}

router.get('/batches', async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20, moduleCode, status, keyword } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(pageSize) || 20), 200);
    const offset = (pageNum - 1) * limitNum;

    const conditions = ['is_deleted = false'];
    const params = [];
    let idx = 1;

    if (moduleCode) {
      conditions.push(`module_code = $${idx++}`);
      params.push(moduleCode);
    }
    if (status) {
      conditions.push(`status = $${idx++}`);
      params.push(status);
    }
    if (keyword) {
      conditions.push(`(file_name ILIKE $${idx} OR batch_no ILIKE $${idx})`);
      params.push(`%${keyword}%`);
      idx++;
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM import_batch ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    params.push(limitNum, offset);
    const result = await pool.query(
      `SELECT id, batch_no, module_name, module_code, file_name, file_size,
              total_count, success_count, error_count, status, started_at, finished_at,
              operator_id, operator_name, remark, created_at
       FROM import_batch ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      params
    );

    res.json(success({ list: result.rows, total, page: pageNum, pageSize: limitNum }, '导入批次列表获取成功'));
  } catch (err) {
    next(err);
  }
});

router.get('/batches/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT id, batch_no, module_name, module_code, file_name, file_path, file_size,
              total_count, success_count, error_count, status, started_at, finished_at,
              operator_id, operator_name, remark, created_at
       FROM import_batch WHERE id = $1 AND is_deleted = false`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json(error(404, '导入批次不存在'));
    }

    const errorResult = await pool.query(
      `SELECT id, row_number, field_name, field_value, error_code, error_message, created_at
       FROM import_error_log WHERE batch_id = $1 ORDER BY row_number LIMIT 500`,
      [id]
    );

    res.json(success({
      ...result.rows[0],
      errors: errorResult.rows
    }, '导入批次详情获取成功'));
  } catch (err) {
    next(err);
  }
});

router.get('/batches/:id/errors', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { page = 1, pageSize = 100 } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(pageSize) || 100), 1000);
    const offset = (pageNum - 1) * limitNum;

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM import_error_log WHERE batch_id = $1`,
      [id]
    );
    const total = parseInt(countResult.rows[0].total);

    const result = await pool.query(
      `SELECT id, row_number, field_name, field_value, error_code, error_message, raw_data, created_at
       FROM import_error_log WHERE batch_id = $1
       ORDER BY row_number, id
       LIMIT $2 OFFSET $3`,
      [id, limitNum, offset]
    );

    res.json(success({ list: result.rows, total, page: pageNum, pageSize: limitNum }, '错误日志获取成功'));
  } catch (err) {
    next(err);
  }
});

async function createBatch(options) {
  const {
    moduleName, moduleCode, fileName, filePath, fileSize,
    operatorId, operatorName, remark
  } = options;

  const batchNo = generateBatchNo();
  const result = await pool.query(
    `INSERT INTO import_batch
      (batch_no, module_name, module_code, file_name, file_path, file_size,
       status, operator_id, operator_name, remark)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9)
     RETURNING id, batch_no, status`,
    [batchNo, moduleName, moduleCode, fileName, filePath, fileSize,
      operatorId, operatorName, remark]
  );
  return result.rows[0];
}

async function updateBatchStatus(batchId, updates) {
  const { status, totalCount, successCount, errorCount, startedAt, finishedAt } = updates;
  const fields = [];
  const params = [];
  let idx = 1;

  if (status !== undefined) { fields.push(`status = $${idx++}`); params.push(status); }
  if (totalCount !== undefined) { fields.push(`total_count = $${idx++}`); params.push(totalCount); }
  if (successCount !== undefined) { fields.push(`success_count = $${idx++}`); params.push(successCount); }
  if (errorCount !== undefined) { fields.push(`error_count = $${idx++}`); params.push(errorCount); }
  if (startedAt !== undefined) { fields.push(`started_at = $${idx++}`); params.push(startedAt); }
  if (finishedAt !== undefined) { fields.push(`finished_at = $${idx++}`); params.push(finishedAt); }
  fields.push(`updated_at = CURRENT_TIMESTAMP`);
  params.push(batchId);

  await pool.query(
    `UPDATE import_batch SET ${fields.join(', ')} WHERE id = $${idx}`,
    params
  );
}

async function logImportError(batchId, errorInfo) {
  const { rowNumber, fieldName, fieldValue, errorCode, errorMessage, rawData } = errorInfo;
  await pool.query(
    `INSERT INTO import_error_log
      (batch_id, row_number, field_name, field_value, error_code, error_message, raw_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [batchId, rowNumber || 0, fieldName, fieldValue, errorCode, errorMessage,
      rawData ? JSON.stringify(rawData) : null]
  );
}

module.exports = router;
module.exports.createBatch = createBatch;
module.exports.updateBatchStatus = updateBatchStatus;
module.exports.logImportError = logImportError;
module.exports.generateBatchNo = generateBatchNo;

/**
 * 保险模块 · 受保护保单文件读取服务（/policies/:id/file、/other/:id/file）
 * 从 routes/insurance.js 受保护保单读取子域迁移（任务0.2）。
 * 客户端只提交记录 ID，服务端从数据库/内存记录解析服务端文件字段；
 * 实际文件流由 controller 层调用 insuranceShared.streamInsuranceFile 输出（涉及 res）。
 * 返回描述符：__t: 'stream-file' / 'http-error'。
 */

const { pool, isConnected } = require('../config/db');
const logger = require('../utils/logger');
const { memoryStores } = require('./insuranceShared');

function invalidId(id) {
  const n = parseInt(id, 10);
  if (!Number.isInteger(n) || n <= 0) {
    return { __t: 'http-error', status: 404, message: '记录不存在' };
  }
  return null;
}

// GET /policies/:id/file — 人员主保单文件（按记录 ID 定位）
async function readPolicyFile(id) {
  const bad = invalidId(id);
  if (bad) return bad;
  try {
    if (!isConnected()) {
      const rec = memoryStores.policies.find((r) => r.id === parseInt(id) && !r.is_deleted);
      if (!rec) return { __t: 'http-error', status: 404, message: '记录不存在' };
      return { __t: 'stream-file', fileName: rec.file_name, dispositionName: rec.original_name || rec.file_name };
    }
    const result = await pool.query(
      'SELECT file_name, original_name FROM insurance_policies WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) {
      return { __t: 'http-error', status: 404, message: '记录不存在' };
    }
    const row = result.rows[0];
    return { __t: 'stream-file', fileName: row.file_name, dispositionName: row.original_name || row.file_name };
  } catch (err) {
    logger.error('[Insurance] 保单文件读取异常:', { message: err.message, stack: err.stack });
    return { __t: 'http-error', status: 500, message: '文件读取失败' };
  }
}

// GET /other/:id/file — 其他保险文件（按记录 ID 定位，未删除）
async function readOtherFile(id) {
  const bad = invalidId(id);
  if (bad) return bad;
  try {
    if (!isConnected()) {
      const rec = memoryStores.other.find((r) => r.id === parseInt(id) && !r.is_deleted);
      if (!rec) return { __t: 'http-error', status: 404, message: '记录不存在' };
      return { __t: 'stream-file', fileName: rec.pdf_file };
    }
    const result = await pool.query(
      'SELECT pdf_file FROM other_insurance WHERE id = $1 AND is_deleted = false',
      [id]
    );
    if (result.rows.length === 0) {
      return { __t: 'http-error', status: 404, message: '记录不存在' };
    }
    return { __t: 'stream-file', fileName: result.rows[0].pdf_file };
  } catch (err) {
    logger.error('[Insurance] 其他保险文件读取异常:', { message: err.message, stack: err.stack });
    return { __t: 'http-error', status: 500, message: '文件读取失败' };
  }
}

module.exports = { readPolicyFile, readOtherFile };
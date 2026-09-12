/**
 * 通用响应辅助函数 - 减少 Fat Router 中的重复代码
 *
 * 使用方式：
 *   const { paginateMemory, buildListResponse, buildStatsResponse, sendNotFound } = require('../utils/commonResponse');
 *
 * 约束：仅作为现有 routes/*.js 的工具函数，不创建新 Service 层。
 * 保持路由文件结构不变，仅减少重复的内存分页/统计/未找到等样板代码。
 */

const { success, error } = require('../middleware/response');

/**
 * 将 snake_case 字符串转为 camelCase
 * 例如: effective_date → effectiveDate, document_no → documentNo
 */
function toCamelCase(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * 将 camelCase 字符串转为 snake_case
 * 例如: effectiveDate → effective_date, documentNo → document_no
 */
function toSnakeCase(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/([A-Z])/g, (_, c) => '_' + c.toLowerCase());
}

/**
 * 递归将对象的所有 key 从 snake_case 转为 camelCase
 * 用于统一后端 snake_case 数据库字段 → 前端 camelCase 期望格式
 * @param {*} obj - 任意值（对象/数组/原始值）
 * @returns {*} 转换后的值
 */
function camelKeys(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(camelKeys);
  if (obj instanceof Date) return obj;
  if (typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[toCamelCase(key)] = camelKeys(value);
    }
    return result;
  }
  return obj;
}

/**
 * 递归将对象的所有 key 从 camelCase 转为 snake_case
 * 用于前端 camelCase 入参 → 后端 snake_case 数据库字段
 * @param {*} obj - 任意值（对象/数组/原始值）
 * @returns {*} 转换后的值
 */
function snakeKeys(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(snakeKeys);
  if (obj instanceof Date) return obj;
  if (typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[toSnakeCase(key)] = snakeKeys(value);
    }
    return result;
  }
  return obj;
}

/**
 * 兼容读取：从对象中按优先级取出字段值
 * 优先 camelCase，其次 snake_case
 * 用于 POST/PUT 入参兼容前端两种命名风格
 * @param {Object} obj - 数据源
 * @param {string} camelKey - camelCase 字段名
 * @returns {*} 找到的值（找不到返回 undefined）
 */
function pickField(obj, camelKey) {
  if (!obj || typeof obj !== 'object') return undefined;
  if (obj[camelKey] !== undefined) return obj[camelKey];
  const snakeKey = toSnakeCase(camelKey);
  return obj[snakeKey];
}

/**
 * 内存模式下的分页切片
 * @param {Array} data - 已过滤的内存数组
 * @param {number|string} page - 当前页码
 * @param {number|string} pageSize - 每页条数
 * @returns {{ list: Array, total: number, page: number, pageSize: number }}
 */
function paginateMemory(data, page = 1, pageSize = 20) {
  const p = parseInt(page);
  const ps = parseInt(pageSize);
  const total = data.length;
  const offset = (p - 1) * ps;
  const list = data.slice(offset, offset + ps);
  return { list, total, page: p, pageSize: ps };
}

/**
 * 构建列表响应（统一格式：{ list, total, page, pageSize }）
 * 适用于内存模式与数据库模式的一致化输出。
 * @param {Object} res - Express response 对象
 * @param {Array} list - 列表数据
 * @param {number} total - 总条数
 * @param {number} page - 当前页
 * @param {number} pageSize - 每页条数
 * @param {string} [msg] - 提示消息
 * @param {Object} [options] - 可选配置
 * @param {boolean} [options.camelCase=false] - 是否将 list 中的 key 转为 camelCase
 */
function buildListResponse(res, list, total, page, pageSize, msg = '查询成功', options = {}) {
  const { camelCase = false } = options;
  const finalList = camelCase ? list.map(camelKeys) : list;
  return res.json(success({ list: finalList, total, page: parseInt(page), pageSize: parseInt(pageSize) }, msg));
}

/**
 * 构建详情响应（统一格式：单条记录）
 * 用于 GET /:id 等单条记录接口，可选将 key 转为 camelCase
 * @param {Object} res - Express response 对象
 * @param {*} data - 单条记录数据
 * @param {string} [msg] - 提示消息
 * @param {Object} [options] - 可选配置
 * @param {boolean} [options.camelCase=false] - 是否将 data 的 key 转为 camelCase
 */
function buildDetailResponse(res, data, msg = '查询成功', options = {}) {
  const { camelCase = false } = options;
  const finalData = camelCase ? camelKeys(data) : data;
  return res.json(success(finalData, msg));
}

/**
 * 构建统计响应（统一格式：{ total, byStatus, byCategory, ... }）
 * 适用于内存模式的简单统计兜底。
 * @param {Object} res - Express response 对象
 * @param {Object} stats - 统计对象
 * @param {string} [msg] - 提示消息
 */
function buildStatsResponse(res, stats, msg = '统计成功') {
  return res.json(success(stats, msg));
}

/**
 * 返回"记录不存在"错误响应
 * @param {Object} res - Express response 对象
 * @param {string} [msg] - 自定义消息
 */
function sendNotFound(res, msg = '记录不存在') {
  return res.json(error(-2, msg));
}

/**
 * 返回"参数校验失败"错误响应
 * @param {Object} res - Express response 对象
 * @param {string} [msg] - 自定义消息
 */
function sendValidationError(res, msg = '参数错误') {
  return res.json(error(-1, msg));
}

/**
 * 生成内存模式的通用记录字段（id、is_deleted、时间戳）
 * 用于 POST 创建路由的内存降级分支，减少重复样板。
 * @param {number} id - 新记录 ID
 * @param {Object} [extra] - 附加字段
 * @returns {Object} 含 id / is_deleted / created_at / updated_at 的基础记录
 */
function buildMemoryRecord(id, extra = {}) {
  const now = new Date().toISOString();
  return {
    id,
    is_deleted: false,
    created_at: now,
    updated_at: now,
    ...extra,
  };
}

module.exports = {
  toCamelCase,
  toSnakeCase,
  camelKeys,
  snakeKeys,
  pickField,
  paginateMemory,
  buildListResponse,
  buildDetailResponse,
  buildStatsResponse,
  sendNotFound,
  sendValidationError,
  buildMemoryRecord,
};

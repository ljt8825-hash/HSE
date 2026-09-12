/**
 * 宁津环卫 HSE 安全管理系统 v4.1 - k6 通用 CRUD Helper
 *
 * 封装标准 RESTful CRUD 操作，所有请求自动携带 JWT Auth header
 *
 * 使用示例：
 *   import { createRecord, getRecords } from './helpers/crud.js';
 *   const res = createRecord('/api/hazards', { title: 'test' });
 *   const list = getRecords('/api/hazards', { page: 1, size: 20 });
 */

import http from 'k6/http';
import { getEnvConfig } from '../config/environments.js';
import { getAuthHeaders } from './auth.js';

// ============================================================
// 通用 CRUD 操作
// ============================================================

/**
 * 创建记录
 * POST /api/{path}
 *
 * @param {string} path - API 路径，如 '/api/hazards'
 * @param {object} data - 请求体数据
 * @param {object} [overrides] - 覆盖默认 params
 * @returns {object} k6 HTTP response
 */
export function createRecord(path, data, overrides) {
  const config = getEnvConfig();
  const authParams = getAuthHeaders(undefined, config);
  const url = `${config.baseUrl}${path}`;

  const params = {
    ...authParams,
    tags: {
      ...authParams.tags,
      endpoint: 'crud',
      operation: 'create',
      path: path,
    },
    timeout: config.timeout.request,
    ...(overrides || {}),
  };

  return http.post(url, JSON.stringify(data), params);
}

/**
 * 获取记录列表（分页）
 * GET /api/{path}?page=1&size=20
 *
 * @param {string} path - API 路径
 * @param {object} [params] - 查询参数 { page, size, sort, order, ... }
 * @param {object} [overrides] - 覆盖默认 params
 * @returns {object} k6 HTTP response
 */
export function getRecords(path, queryParams, overrides) {
  const config = getEnvConfig();
  const authParams = getAuthHeaders(undefined, config);
  const url = `${config.baseUrl}${path}`;

  const params = {
    ...authParams,
    tags: {
      ...authParams.tags,
      endpoint: 'crud',
      operation: 'list',
      path: path,
    },
    timeout: config.timeout.request,
    ...(overrides || {}),
  };

  // 构建 query string
  if (queryParams) {
    const queryString = Object.entries(queryParams)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
    return http.get(`${url}?${queryString}`, params);
  }

  return http.get(url, params);
}

/**
 * 根据 ID 获取单条记录
 * GET /api/{path}/:id
 *
 * @param {string} path - API 路径
 * @param {string|number} id - 记录 ID
 * @param {object} [overrides] - 覆盖默认 params
 * @returns {object} k6 HTTP response
 */
export function getRecordById(path, id, overrides) {
  const config = getEnvConfig();
  const authParams = getAuthHeaders(undefined, config);
  const url = `${config.baseUrl}${path}/${id}`;

  const params = {
    ...authParams,
    tags: {
      ...authParams.tags,
      endpoint: 'crud',
      operation: 'getById',
      path: path,
    },
    timeout: config.timeout.request,
    ...(overrides || {}),
  };

  return http.get(url, params);
}

/**
 * 更新记录
 * PUT /api/{path}/:id
 *
 * @param {string} path - API 路径
 * @param {string|number} id - 记录 ID
 * @param {object} data - 更新数据
 * @param {object} [overrides] - 覆盖默认 params
 * @returns {object} k6 HTTP response
 */
export function updateRecord(path, id, data, overrides) {
  const config = getEnvConfig();
  const authParams = getAuthHeaders(undefined, config);
  const url = `${config.baseUrl}${path}/${id}`;

  const params = {
    ...authParams,
    tags: {
      ...authParams.tags,
      endpoint: 'crud',
      operation: 'update',
      path: path,
    },
    timeout: config.timeout.request,
    ...(overrides || {}),
  };

  return http.put(url, JSON.stringify(data), params);
}

/**
 * 删除记录
 * DELETE /api/{path}/:id
 *
 * @param {string} path - API 路径
 * @param {string|number} id - 记录 ID
 * @param {object} [overrides] - 覆盖默认 params
 * @returns {object} k6 HTTP response
 */
export function deleteRecord(path, id, overrides) {
  const config = getEnvConfig();
  const authParams = getAuthHeaders(undefined, config);
  const url = `${config.baseUrl}${path}/${id}`;

  const params = {
    ...authParams,
    tags: {
      ...authParams.tags,
      endpoint: 'crud',
      operation: 'delete',
      path: path,
    },
    timeout: config.timeout.request,
    ...(overrides || {}),
  };

  return http.del(url, null, params);
}

/**
 * 搜索记录
 * GET /api/{path}?keyword=xxx&...
 *
 * @param {string} path - API 路径
 * @param {object} searchParams - 搜索参数 { keyword, department, status, dateFrom, dateTo, ... }
 * @param {object} [overrides] - 覆盖默认 params
 * @returns {object} k6 HTTP response
 */
export function searchRecords(path, searchParams, overrides) {
  const config = getEnvConfig();
  const authParams = getAuthHeaders(undefined, config);
  const url = `${config.baseUrl}${path}`;

  const params = {
    ...authParams,
    tags: {
      ...authParams.tags,
      endpoint: 'crud',
      operation: 'search',
      path: path,
    },
    timeout: config.timeout.request,
    ...(overrides || {}),
  };

  if (searchParams) {
    const queryString = Object.entries(searchParams)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
    return http.get(`${url}?${queryString}`, params);
  }

  return http.get(url, params);
}

// ============================================================
// 批量操作辅助
// ============================================================

/**
 * 批量创建记录
 * @param {string} path - API 路径
 * @param {object[]} dataList - 数据数组
 * @returns {object[]} 响应数组
 */
export function batchCreate(path, dataList) {
  return dataList.map((data) => createRecord(path, data));
}

/**
 * 获取所有分页数据
 * 自动翻页直到获取全部数据
 *
 * @param {string} path - API 路径
 * @param {number} [pageSize=50] - 每页大小
 * @param {number} [maxPages=100] - 最大页数（防止无限循环）
 * @returns {object[]} 所有记录
 */
export function getAllRecords(path, pageSize, maxPages) {
  const size = pageSize || 50;
  const limit = maxPages || 100;
  const allRecords = [];

  for (let page = 1; page <= limit; page++) {
    const res = getRecords(path, { page, size });
    if (res.status !== 200) break;

    try {
      const data = res.json();
      const list = data.data || data.list || data.rows || data.items || [];
      const total = data.total || data.totalCount || 0;

      allRecords.push(...list);

      // 已获取全部数据
      if (allRecords.length >= total || list.length < size) {
        break;
      }
    } catch (e) {
      break;
    }
  }

  return allRecords;
}

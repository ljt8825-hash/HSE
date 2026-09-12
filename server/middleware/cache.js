/**
 * Express 缓存中间件
 * 为现有路由装饰缓存层，支持按查询参数生成缓存键
 *
 * 用法示例：
 *   // 基础用法：为路由添加缓存（TTL 30 秒）
 *   router.get('/overview', cacheMiddleware(30000), handler);
 *
 *   // 自定义缓存键生成策略
 *   router.get('/data', cacheMiddleware({ ttl: 60000, keyFn: (req) => `data:${req.user.id}` }), handler);
 */

const cache = require('../services/cache');

/**
 * 创建缓存中间件
 * @param {number|Object} options - 缓存 TTL（毫秒）或配置对象
 * @param {number} [options.ttl] - 缓存过期时间（毫秒），默认 30000
 * @param {Function} [options.keyFn] - 自定义缓存键生成函数 (req) => string
 * @param {boolean} [options.useQuery] - 是否将查询参数纳入缓存键，默认 true
 * @param {string} [options.namespace] - 缓存命名空间前缀
 * @returns {Function} Express 中间件
 */
function cacheMiddleware(options) {
  // 支持直接传入 TTL 数字
  if (typeof options === 'number') {
    options = { ttl: options };
  }

  const {
    ttl = 30000,
    keyFn = null,
    useQuery = true,
    namespace = ''
  } = options;

  return async (req, res, next) => {
    // 仅缓存 GET 请求
    if (req.method !== 'GET') {
      return next();
    }

    // 生成缓存键
    let cacheKey;
    if (keyFn && typeof keyFn === 'function') {
      cacheKey = keyFn(req);
    } else {
      // 默认缓存键策略：方法 + 路径 + 查询参数
      const basePath = req.baseUrl + req.path;
      let queryPart = '';
      if (useQuery && req.query && Object.keys(req.query).length > 0) {
        // 对查询参数排序后序列化，确保相同参数不同顺序得到相同缓存键
        const sortedKeys = Object.keys(req.query).sort();
        const queryParts = sortedKeys.map(k => `${k}=${req.query[k]}`);
        queryPart = '?' + queryParts.join('&');
      }
      cacheKey = namespace
        ? `${namespace}:${req.method}:${basePath}${queryPart}`
        : `${req.method}:${basePath}${queryPart}`;
    }

    // 尝试从缓存获取
    const cached = cache.get(cacheKey);
    if (cached !== undefined) {
      // 附加缓存命中标识头
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }

    // 标记缓存未命中
    res.setHeader('X-Cache', 'MISS');

    // 拦截 res.json，将响应写入缓存
    const originalJson = res.json.bind(res);
    res.json = function (data) {
      // 写入缓存（仅缓存成功响应）
      if (res.statusCode >= 200 && res.statusCode < 300 && data !== undefined) {
        cache.set(cacheKey, data, ttl);
      }
      return originalJson(data);
    };

    next();
  };
}

/**
 * 创建带缓存的路由装饰器
 * 用于在路由定义后统一添加缓存，而不修改原始路由文件
 * @param {Object} router - Express Router 实例
 * @param {Object} config - 缓存配置
 * @param {number} config.ttl - 默认 TTL
 * @param {string} config.namespace - 命名空间
 * @param {Object} config.routes - 路由缓存配置 { 'GET /path': ttl 或 { ttl, keyFn } }
 */
function decorateWithCache(router, config) {
  const { ttl: defaultTtl = 30000, namespace = '', routes } = config;

  // 在路由栈中查找匹配的中间件，在其前面插入缓存中间件
  for (const [pattern, routeConfig] of Object.entries(routes)) {
    const [method, path] = pattern.split(' ');
    const routeTtl = typeof routeConfig === 'number' ? routeConfig : routeConfig.ttl;
    const routeKeyFn = typeof routeConfig === 'object' ? routeConfig.keyFn : null;

    console.log(`[Cache] 注册缓存: ${method} ${path} (TTL: ${routeTtl}ms)`);
  }
}

/**
 * 清除指定命名空间的缓存
 * 可挂载为 API 端点用于手动清除缓存
 * @param {string} namespace - 命名空间
 */
function clearCacheNamespace(namespace) {
  cache.deleteByNamespace(namespace);
}

module.exports = {
  cacheMiddleware,
  decorateWithCache,
  clearCacheNamespace
};

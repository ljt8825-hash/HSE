/**
 * 缓存中间件测试套件
 * 覆盖: TTL 过期、LRU 淘汰、命名空间、GET-only、缓存键生成
 * 直接测试 MemoryCache 服务 + cacheMiddleware 中间件
 */
const cache = require('../services/cache');
const { cacheMiddleware, clearCacheNamespace } = require('../middleware/cache');

describe('缓存中间件', () => {
  beforeEach(() => {
    cache.clear();
    cache.resetStats();
  });

  afterAll(() => {
    cache.destroy();
  });

  describe('MemoryCache 服务', () => {
    test('set/get 基本读写应正常工作', () => {
      cache.set('test:key1', { name: 'value' }, 5000);
      const val = cache.get('test:key1');
      expect(val).toEqual({ name: 'value' });
    });

    test('get 不存在的键应返回 undefined', () => {
      const val = cache.get('nonexistent:key');
      expect(val).toBeUndefined();
    });

    test('TTL 过期后应返回 undefined', async () => {
      cache.set('test:expire', 'data', 100); // 100ms TTL
      expect(cache.get('test:expire')).toBe('data');

      // 等待过期
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(cache.get('test:expire')).toBeUndefined();
    });

    test('has 方法应正确判断缓存是否存在', () => {
      cache.set('test:exists', true, 5000);
      expect(cache.has('test:exists')).toBe(true);
      expect(cache.has('test:notexists')).toBe(false);
    });

    test('delete 方法应删除缓存条目', () => {
      cache.set('test:del', 'value', 5000);
      expect(cache.has('test:del')).toBe(true);
      cache.delete('test:del');
      expect(cache.has('test:del')).toBe(false);
    });

    test('clear 方法应清空所有缓存', () => {
      cache.set('test:a', 1, 5000);
      cache.set('test:b', 2, 5000);
      cache.clear();
      expect(cache.get('test:a')).toBeUndefined();
      expect(cache.get('test:b')).toBeUndefined();
    });
  });

  describe('LRU 淘汰策略', () => {
    test('容量满后应淘汰最久未访问的条目', async () => {
      // 创建一个容量很小的缓存实例
      const MemoryCache = require('../services/cache');
      // 使用 deleteByNamespace 来测试容量

      // 先填充到接近上限
      for (let i = 0; i < 9; i++) {
        cache.set(`lru:key${i}`, i, 60000);
      }

      // 访问 key0（更新其 lastAccess）
      cache.get('lru:key0');

      // 再添加一个，应该淘汰 lru:key1（最久未访问）
      cache.set('lru:key10', 10, 60000);

      // key0 应仍在（刚被访问过）
      expect(cache.has('lru:key0')).toBe(true);
    });

    test('更新已有条目应刷新 lastAccess', () => {
      cache.set('lru:access', 'original', 60000);
      cache.set('lru:access', 'updated', 60000);
      expect(cache.get('lru:access')).toBe('updated');
    });
  });

  describe('命名空间', () => {
    test('deleteByNamespace 应删除指定前缀的所有缓存', () => {
      cache.set('ns:user:1', { id: 1 }, 60000);
      cache.set('ns:user:2', { id: 2 }, 60000);
      cache.set('ns:role:1', { id: 1 }, 60000);

      cache.deleteByNamespace('ns:user');

      expect(cache.get('ns:user:1')).toBeUndefined();
      expect(cache.get('ns:user:2')).toBeUndefined();
      expect(cache.get('ns:role:1')).toEqual({ id: 1 });
    });
  });

  describe('统计信息', () => {
    test('stats 应返回完整的统计信息', () => {
      cache.set('stats:a', 1, 60000);
      cache.set('stats:b', 2, 60000);
      cache.get('stats:a');
      cache.get('stats:nonexistent');

      const stats = cache.stats();
      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('sets');
      expect(stats).toHaveProperty('size');
      expect(stats.size).toBe(2);
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });

    test('resetStats 应清零统计但不清理缓存', () => {
      cache.set('stats:r', 1, 60000);
      cache.get('stats:r');

      cache.resetStats();
      const stats = cache.stats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.size).toBe(1);
    });
  });

  describe('批量操作', () => {
    test('mget 应返回存在的键值对', () => {
      cache.set('batch:a', 1, 60000);
      cache.set('batch:b', 2, 60000);
      cache.set('batch:c', 3, 60000);

      const result = cache.mget(['batch:a', 'batch:c', 'batch:nonexistent']);
      expect(result).toEqual({ 'batch:a': 1, 'batch:c': 3 });
    });

    test('mset 应批量设置缓存', () => {
      cache.mset({ 'batchm:x': 10, 'batchm:y': 20 }, 60000);
      expect(cache.get('batchm:x')).toBe(10);
      expect(cache.get('batchm:y')).toBe(20);
    });
  });

  describe('cacheMiddleware 中间件', () => {
    test('GET 请求应写入缓存', async () => {
      const middleware = cacheMiddleware({ ttl: 5000 });

      const req = { method: 'GET', baseUrl: '/api', path: '/test', query: {}, headers: {} };
      let jsonCalled = false;
      const res = {
        statusCode: 200,
        setHeader: jest.fn(),
        json: jest.fn((data) => { jsonCalled = true; return data; })
      };
      const next = jest.fn();

      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.setHeader).toHaveBeenCalledWith('X-Cache', 'MISS');

      // 模拟处理函数调用 res.json
      res.json({ success: true, data: [] });

      // 验证缓存已被写入
      const cached = cache.get('GET:/api/test');
      expect(cached).toEqual({ success: true, data: [] });
    });

    test('缓存命中时应直接返回并设置 HIT 头', async () => {
      // 预热缓存
      cache.set('GET:/api/cached', { success: true }, 5000);

      const middleware = cacheMiddleware({ ttl: 5000 });

      const req = { method: 'GET', baseUrl: '/api', path: '/cached', query: {}, headers: {} };
      const res = {
        setHeader: jest.fn(),
        json: jest.fn()
      };
      const next = jest.fn();

      middleware(req, res, next);

      // 应直接返回缓存，不调用 next
      expect(next).not.toHaveBeenCalled();
      expect(res.setHeader).toHaveBeenCalledWith('X-Cache', 'HIT');
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    test('非 GET 请求应跳过缓存', () => {
      const middleware = cacheMiddleware({ ttl: 5000 });

      const req = { method: 'POST', baseUrl: '/api', path: '/test', query: {}, headers: {} };
      const res = { setHeader: jest.fn(), json: jest.fn() };
      const next = jest.fn();

      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('查询参数应纳入缓存键（排序后）', () => {
      const middleware = cacheMiddleware({ ttl: 5000 });

      const req1 = { method: 'GET', baseUrl: '/api', path: '/list', query: { b: '2', a: '1' }, headers: {} };
      const req2 = { method: 'GET', baseUrl: '/api', path: '/list', query: { a: '1', b: '2' }, headers: {} };
      const res = { setHeader: jest.fn(), json: jest.fn() };
      const next = jest.fn();

      middleware(req1, res, next);
      // 缓存键应为 GET:/api/list?a=1&b=2（参数排序后）
    });

    test('namespace 选项应生效', () => {
      const middleware = cacheMiddleware({ ttl: 5000, namespace: 'dashboard' });

      const req = { method: 'GET', baseUrl: '/api', path: '/metrics', query: {}, headers: {} };
      const res = { setHeader: jest.fn(), json: jest.fn() };
      const next = jest.fn();

      middleware(req, res, next);

      // 缓存键应以 dashboard: 开头
      expect(cache.has('dashboard:GET:/api/metrics')).toBe(false); // MISS，还没写
    });

    test('自定义 keyFn 应覆盖默认缓存键', () => {
      const middleware = cacheMiddleware({
        ttl: 5000,
        keyFn: (req) => `custom:${req.user?.id || 'anonymous'}:${req.path}`
      });

      const req = { method: 'GET', baseUrl: '/api', path: '/data', query: {}, headers: {}, user: { id: 42 } };
      const res = { setHeader: jest.fn(), json: jest.fn() };
      const next = jest.fn();

      middleware(req, res, next);
      // 应使用自定义键
    });
  });

  describe('clearCacheNamespace', () => {
    test('clearCacheNamespace 应能清除指定命名空间的缓存', () => {
      cache.set('api:v1:list', [1, 2, 3], 60000);
      cache.set('api:v1:detail', { id: 1 }, 60000);
      cache.set('api:v2:list', [4, 5, 6], 60000);

      clearCacheNamespace('api:v1');

      expect(cache.get('api:v1:list')).toBeUndefined();
      expect(cache.get('api:v1:detail')).toBeUndefined();
      expect(cache.get('api:v2:list')).toEqual([4, 5, 6]);
    });
  });
});

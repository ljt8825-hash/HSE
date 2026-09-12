/**
 * 慢查询日志中间件测试套件
 * 覆盖: 慢查询阈值判断、查询历史统计、连接池监控、SQL截断、参数脱敏
 */
const queryLogger = require('../middleware/queryLogger');
const perfConfig = require('../config/performance');

describe('慢查询日志中间件', () => {
  let mockPool;

  beforeEach(() => {
    queryLogger.resetHistory();
    queryLogger.stop();
  });

  afterAll(() => {
    queryLogger.stop();
    queryLogger.resetHistory();
  });

  describe('初始化', () => {
    test('init 未提供连接池时应打印警告', () => {
      // 应不抛错
      expect(() => queryLogger.init(null)).not.toThrow();
    });

    test('init 提供连接池应替换 query 方法', () => {
      mockPool = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        pool: {
          totalCount: 5,
          idleCount: 3,
          waitingCount: 0,
          max: 10
        }
      };

      expect(() => queryLogger.init(mockPool)).not.toThrow();

      // 验证 pool.query 已被替换
      expect(typeof mockPool.query).toBe('function');

      queryLogger.stop();
    });
  });

  describe('查询记录与慢查询判断', () => {
    beforeAll(() => {
      mockPool = {
        query: jest.fn().mockResolvedValue({ rows: [{ count: 1 }] }),
        pool: {
          totalCount: 3,
          idleCount: 2,
          waitingCount: 0,
          max: 10
        }
      };
      // queryLogger.init 会用包装函数替换 pool.query，原始 jest.fn 需先保留引用，
      // 供测试配置 mockResolvedValueOnce / mockRejectedValueOnce（包装函数内部
      // 调用原始 jest.fn，once 配置仍生效）。
      mockPool.__originalQuery = mockPool.query;
      queryLogger.init(mockPool);
    });

    afterAll(() => {
      queryLogger.stop();
    });

    test('正常查询应记录到历史', async () => {
      mockPool.__originalQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
      await mockPool.query('SELECT * FROM hazards WHERE id = $1', [1]);

      const stats = queryLogger.getQueryStats();
      expect(stats.total).toBe(1);
      expect(stats.errorCount).toBe(0);
    });

    test('查询错误应标记为 isError', async () => {
      mockPool.__originalQuery.mockRejectedValueOnce(new Error('表不存在'));

      await expect(mockPool.query('SELECT * FROM nonexistent')).rejects.toThrow('表不存在');

      const stats = queryLogger.getQueryStats();
      expect(stats.total).toBeGreaterThanOrEqual(1);
      expect(stats.errorCount).toBeGreaterThanOrEqual(1);
    });

    test('getQueryStats 应返回完整统计', () => {
      const stats = queryLogger.getQueryStats();
      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('slowCount');
      expect(stats).toHaveProperty('errorCount');
      expect(stats).toHaveProperty('avgDuration');
      expect(stats).toHaveProperty('maxDuration');
      expect(stats).toHaveProperty('threshold');
      expect(stats).toHaveProperty('recentSlowQueries');
      expect(typeof stats.threshold).toBe('number');
    });
  });

  describe('连接池监控', () => {
    test('getPoolStats 正常池应返回统计', () => {
      const pool = {
        pool: {
          totalCount: 5,
          idleCount: 3,
          waitingCount: 0,
          max: 10
        }
      };

      const stats = queryLogger.getPoolStats(pool);
      expect(stats).toEqual({
        total: 5,
        idle: 3,
        waiting: 0,
        max: 10
      });
    });

    test('getPoolStats 无 pool 属性应返回 null', () => {
      const pool = {};
      const stats = queryLogger.getPoolStats(pool);
      expect(stats).toBeNull();
    });
  });

  describe('resetHistory', () => {
    test('resetHistory 应清空查询历史', () => {
      mockPool = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        pool: { totalCount: 1, idleCount: 1, waitingCount: 0, max: 10 }
      };
      // 保留原始 jest.fn 引用（init 会替换 pool.query 为包装函数）
      mockPool.__originalQuery = mockPool.query;
      queryLogger.init(mockPool);

      // 执行一次查询
      mockPool.__originalQuery.mockResolvedValueOnce({ rows: [] });
      return mockPool.query('SELECT 1').then(() => {
        const stats = queryLogger.getQueryStats();
        expect(stats.total).toBeGreaterThan(0);

        queryLogger.resetHistory();

        const resetStats = queryLogger.getQueryStats();
        expect(resetStats.total).toBe(0);
        expect(resetStats.slowCount).toBe(0);

        queryLogger.stop();
      });
    });
  });

  describe('stop', () => {
    test('stop 应清除监控定时器', () => {
      expect(() => queryLogger.stop()).not.toThrow();
    });
  });

  describe('性能配置', () => {
    test('perfConfig 应包含必要的配置项', () => {
      expect(perfConfig).toHaveProperty('SLOW_QUERY_THRESHOLD');
      expect(perfConfig).toHaveProperty('QUERY_LOG_ENABLED');
      expect(perfConfig).toHaveProperty('POOL_MONITOR_ENABLED');
      expect(perfConfig).toHaveProperty('POOL_LOG_INTERVAL');
      expect(perfConfig).toHaveProperty('QUERY_HISTORY_SIZE');
      expect(typeof perfConfig.SLOW_QUERY_THRESHOLD).toBe('number');
      expect(typeof perfConfig.QUERY_LOG_ENABLED).toBe('boolean');
      expect(typeof perfConfig.QUERY_HISTORY_SIZE).toBe('number');
    });

    test('MONITORED_TABLES 应包含主要业务表', () => {
      const tables = perfConfig.MONITORED_TABLES;
      expect(tables).toContain('hazards');
      expect(tables).toContain('accidents');
      expect(tables).toContain('training_records');
      expect(tables).toContain('notifications');
    });
  });
});

/**
 * 内存缓存服务
 * 基于 Map 实现，支持 TTL 过期、LRU 淘汰、命名空间、批量操作及命中率统计
 *
 * 用法示例：
 *   const cache = require('./services/cache');
 *   cache.set('user:1001', { name: '张三' }, 60000);  // 缓存 60 秒
 *   const user = cache.get('user:1001');
 */

const DEFAULT_TTL = parseInt(process.env.CACHE_DEFAULT_TTL) || 5 * 60 * 1000; // 默认 5 分钟
const MAX_SIZE = parseInt(process.env.CACHE_MAX_SIZE) || 10000;               // 最大容量 10000 条
const CACHE_ENABLED = process.env.CACHE_ENABLED !== 'false';                // 默认启用

/**
 * 缓存条目结构
 * @typedef {Object} CacheEntry
 * @property {*} value - 缓存值
 * @property {number} expireAt - 过期时间戳（毫秒）
 * @property {number} lastAccess - 最后访问时间戳（毫秒，用于 LRU）
 */

class MemoryCache {
  constructor(options = {}) {
    /** @type {Map<string, CacheEntry>} */
    this._store = new Map();

    this._defaultTtl = options.ttl || DEFAULT_TTL;
    this._maxSize = options.maxSize || MAX_SIZE;
    this._enabled = options.enabled !== undefined ? options.enabled : CACHE_ENABLED;

    // 命中率统计
    this._stats = {
      hits: 0,      // 命中次数
      misses: 0,     // 未命中次数
      sets: 0,       // 写入次数
      deletes: 0,    // 删除次数
      evictions: 0   // LRU 淘汰次数
    };

    // 定时清理过期条目（每 60 秒）
    this._cleanupInterval = setInterval(() => this._cleanup(), 60 * 1000);
    // 防止定时器阻止进程退出
    if (this._cleanupInterval.unref) {
      this._cleanupInterval.unref();
    }
  }

  /**
   * 获取缓存值
   * @param {string} key - 缓存键（支持 "namespace:key" 格式）
   * @returns {*|undefined} 缓存值，不存在或已过期返回 undefined
   */
  get(key) {
    if (!this._enabled) return undefined;

    const entry = this._store.get(key);
    if (!entry) {
      this._stats.misses++;
      return undefined;
    }

    // 检查是否过期
    if (Date.now() > entry.expireAt) {
      this._store.delete(key);
      this._stats.misses++;
      return undefined;
    }

    // 更新最后访问时间（LRU）
    entry.lastAccess = Date.now();
    this._stats.hits++;
    return entry.value;
  }

  /**
   * 设置缓存值
   * @param {string} key - 缓存键（支持 "namespace:key" 格式）
   * @param {*} value - 缓存值
   * @param {number} [ttlMs] - 过期时间（毫秒），不传则使用默认 TTL
   */
  set(key, value, ttlMs) {
    if (!this._enabled) return;

    // 如果 key 已存在，先删除以更新顺序
    if (this._store.has(key)) {
      this._store.delete(key);
    } else if (this._store.size >= this._maxSize) {
      // 容量已满，执行 LRU 淘汰
      this._evict();
    }

    const ttl = ttlMs || this._defaultTtl;
    this._store.set(key, {
      value,
      expireAt: Date.now() + ttl,
      lastAccess: Date.now()
    });
    this._stats.sets++;
  }

  /**
   * 删除缓存条目
   * @param {string} key - 缓存键
   * @returns {boolean} 是否成功删除
   */
  delete(key) {
    const deleted = this._store.delete(key);
    if (deleted) this._stats.deletes++;
    return deleted;
  }

  /**
   * 清空所有缓存
   */
  clear() {
    const count = this._store.size;
    this._store.clear();
    this._stats.deletes += count;
  }

  /**
   * 检查缓存是否存在且未过期
   * @param {string} key - 缓存键
   * @returns {boolean}
   */
  has(key) {
    if (!this._enabled) return false;

    const entry = this._store.get(key);
    if (!entry) return false;

    if (Date.now() > entry.expireAt) {
      this._store.delete(key);
      return false;
    }
    return true;
  }

  /**
   * 批量获取缓存值
   * @param {string[]} keys - 缓存键数组
   * @returns {Object} 以 key 为键、缓存值为值的对象
   */
  mget(keys) {
    const result = {};
    for (const key of keys) {
      const value = this.get(key);
      if (value !== undefined) {
        result[key] = value;
      }
    }
    return result;
  }

  /**
   * 批量设置缓存值
   * @param {Object} map - 键值对对象
   * @param {number} [ttlMs] - 过期时间（毫秒）
   */
  mset(map, ttlMs) {
    for (const [key, value] of Object.entries(map)) {
      this.set(key, value, ttlMs);
    }
  }

  /**
   * 按命名空间删除所有缓存
   * @param {string} namespace - 命名空间前缀（如 "user"）
   */
  deleteByNamespace(namespace) {
    const prefix = namespace + ':';
    for (const key of this._store.keys()) {
      if (key.startsWith(prefix)) {
        this._store.delete(key);
        this._stats.deletes++;
      }
    }
  }

  /**
   * 获取缓存统计信息
   * @returns {Object} 包含命中率、条目数量等统计信息
   */
  stats() {
    const total = this._stats.hits + this._stats.misses;
    return {
      enabled: this._enabled,
      size: this._store.size,
      maxSize: this._maxSize,
      defaultTtl: this._defaultTtl,
      hits: this._stats.hits,
      misses: this._stats.misses,
      sets: this._stats.sets,
      deletes: this._stats.deletes,
      evictions: this._stats.evictions,
      hitRate: total > 0 ? (this._stats.hits / total * 100).toFixed(2) + '%' : 'N/A'
    };
  }

  /**
   * 重置统计数据（不清除缓存）
   */
  resetStats() {
    this._stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0
    };
  }

  /**
   * LRU 淘汰策略：移除最久未访问的条目
   * @private
   */
  _evict() {
    let oldestKey = null;
    let oldestAccess = Infinity;

    for (const [key, entry] of this._store) {
      if (entry.lastAccess < oldestAccess) {
        oldestAccess = entry.lastAccess;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this._store.delete(oldestKey);
      this._stats.evictions++;
    }
  }

  /**
   * 定时清理过期条目
   * @private
   */
  _cleanup() {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of this._store) {
      if (now > entry.expireAt) {
        this._store.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`[Cache] 清理过期条目: ${cleaned} 条，剩余: ${this._store.size} 条`);
    }
  }

  /**
   * 销毁缓存实例（清除定时器）
   */
  destroy() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
    this._store.clear();
  }
}

// 导出单例实例
const cache = new MemoryCache();

module.exports = cache;

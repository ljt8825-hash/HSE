(() => {
  const cache = require('module')._cache;
  const find = (re) => Object.keys(cache).find((k) => re.test(k));
  const dbKey = find(/config[\\/]db\.js$/);
  if (!dbKey) return JSON.stringify({ err: 'config/db not loaded' });
  const db = cache[dbKey].exports;
  const pool = db.pool;
  const brief = (q) => {
    try { return q && q.text ? String(q.text).replace(/\s+/g, ' ').slice(0, 90) : null; } catch (e) { return 'ERR'; }
  };
  const clients = (pool._clients || []).map((c) => ({
    processID: c.processID,
    _queryable: c._queryable,
    readyForQuery: c.readyForQuery,
    hasActiveQuery: !!c.activeQuery,
    activeQuery: brief(c.activeQuery),
    activeQueryDurationMs: c.activeQuery && c.activeQuery.startTime ? (Date.now() - c.activeQuery.startTime) : null,
    queueLen: c.queryQueue ? c.queryQueue.length : null,
    queued: c.queryQueue ? c.queryQueue.map(brief) : null,
    idle: c._idle,
    ending: c.ending,
    released: c._poolUseCount !== undefined ? c._poolUseCount : undefined,
  }));
  return JSON.stringify({
    poolTotal: pool.totalCount, poolIdle: pool.idleCount, poolWaiting: pool.waitingCount,
    poolEnded: pool.ending,
    clients,
    hookInstalled: typeof pool.query === 'function' && pool.query.name,
  });
})()

(() => {
  const cache = require('module')._cache;
  const find = (re) => Object.keys(cache).find((k) => re.test(k));
  const eKey = find(/wpsGridPullEngine\.js$/);
  const wKey = find(/wpsClient\.js$/);
  const sKey = find(/wpsGridSyncService\.js$/);
  let running = null, stat = null, conf = null, exp = null;
  try { exp = eKey ? Object.keys(cache[eKey].exports) : null; } catch (e) { exp = 'ERR ' + e.message; }
  try { running = eKey && cache[eKey].exports.isRunning ? cache[eKey].exports.isRunning() : 'no isRunning'; } catch (e) { running = 'ERR ' + e.message; }
  try { stat = eKey && cache[eKey].exports.status ? cache[eKey].exports.status() : null; } catch (e) { stat = 'ERR ' + e.message; }
  try {
    const w = wKey ? cache[wKey].exports : null;
    conf = w && w.CONF ? { base: w.CONF.base, fileId: w.CONF.fileId, sheetId: w.CONF.sheetId, timeoutMs: w.CONF.timeoutMs } : null;
  } catch (e) { conf = 'ERR ' + e.message; }
  return JSON.stringify({
    engineLoaded: !!eKey, engineExports: exp, engineIsRunning: running, engineStatus: stat,
    wpsLoaded: !!wKey, wpsConf: conf, svcLoaded: !!sKey,
    moduleCount: Object.keys(cache).length,
    unhandledRejHandlers: process.listenerCount('unhandledRejection'),
    uncaughtHandlers: process.listenerCount('uncaughtException'),
    sigHandlers: ['SIGINT', 'SIGTERM'].map((s) => [s, process.listenerCount(s)]),
  });
})()

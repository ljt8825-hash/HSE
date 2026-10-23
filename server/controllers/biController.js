/**
 * BI 数据看板（/api/hse/bi）—— 薄 controller
 * 仅做 req 解析 + 调 service + res 包装；业务规则与 SQL 全在 services/biService.js。
 * 响应契约与 leader-dashboard 一致：service 返回 { __t:'json', body }，异常归一 500。
 */
const service = require('../services/biService');

function respond(req, res, r) {
  if (r && r.__t === 'json') return res.json(r.body);
  if (r == null) return res.status(500).json({ code: 1, message: '服务无返回' });
  return res.json(r);
}

async function run(req, res, fn) {
  try {
    respond(req, res, await fn());
  } catch (err) {
    console.error('[bi] error:', err && err.message);
    res.status(500).json({ code: 1, message: err && err.message ? err.message : String(err) });
  }
}

const overview = (req, res) => run(req, res, () => service.overview(req));
const trend = (req, res) => run(req, res, () => service.trend(req));
const ranking = (req, res) => run(req, res, () => service.ranking(req));
const mapData = (req, res) => run(req, res, () => service.mapData(req));
const realtime = (req, res) => run(req, res, () => service.realtime());

module.exports = { overview, trend, ranking, mapData, realtime };

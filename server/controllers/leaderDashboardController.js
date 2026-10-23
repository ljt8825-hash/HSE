/**
 * 领导视角统一看板（/api/hse/leader-dashboard）—— 薄 controller
 * 仅做 req 解析 + 调 service + res 包装；业务规则与 SQL 全在 services/leaderDashboardService.js。
 * 响应契约与 executive-cockpit 一致：service 返回 { __t:'json', body }，异常归一 500。
 */
const service = require('../services/leaderDashboardService');

function respond(req, res, r) {
  if (r && r.__t === 'json') return res.json(r.body);
  if (r == null) return res.status(500).json({ code: 1, message: '服务无返回' });
  return res.json(r);
}

async function run(req, res, fn) {
  try {
    respond(req, res, await fn());
  } catch (err) {
    console.error('[leader-dashboard] error:', err && err.message);
    res.status(500).json({ code: 1, message: err && err.message ? err.message : String(err) });
  }
}

const centers = (req, res) => run(req, res, () => service.centers());
const townsByCenter = (req, res) => run(req, res, () => service.townsByCenter(req));
const rolesByTown = (req, res) => run(req, res, () => service.rolesByTown(req));
const employeeDetail = (req, res) => run(req, res, () => service.employeeDetail(req));
const townTrend = (req, res) => run(req, res, () => service.townTrend(req));
const townManagers = (req, res) => run(req, res, () => service.townManagers(req));
const managerOverview = (req, res) => run(req, res, () => service.managerOverview(req));
const managerMonthDetail = (req, res) => run(req, res, () => service.managerMonthDetail(req));
const dimRecords = (req, res) => run(req, res, () => service.dimRecords(req));

module.exports = {
  centers,
  townsByCenter,
  rolesByTown,
  employeeDetail,
  townTrend,
  townManagers,
  managerOverview,
  managerMonthDetail,
  dimRecords,
};

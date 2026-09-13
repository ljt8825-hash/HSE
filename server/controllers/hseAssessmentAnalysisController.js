/**
 * 集团HSE考核分析中心（/api/hse-assessment-analysis）—— 薄 controller
 * 仅做 req 解析 + 调 service + res 包装；业务规则与 SQL 全在 services/hseAssessmentAnalysisService.js。
 *
 * 本域响应为「原生对象」契约（非 success/error 包装体系）：
 *  - 成功：service 返回 { __t:'json', body }，其中 body 即 {code:0, data}，controller 直接 res.json(r.body)。
 *  - 异常：service 抛错，controller 归一为 res.status(500).json({code:1, message:err.message})
 *    （等价原文件所有端点 catch 的 res.status(500).json({code:1, message:e.message})，传真实 error message）。
 */
const service = require('../services/hseAssessmentAnalysisService');

/** 统一解释 service 返回描述符 → 对外响应 */
function respond(req, res, r) {
  if (r && r.__t === 'json') return res.json(r.body);
  if (r == null) return res.status(500).json({ code: 1, message: '服务无返回' });
  return res.json(r);
}

/** 包裹 service 调用：异常 → 500 + {code:1, message:err.message}（等价原 catch） */
async function run(req, res, fn) {
  try {
    respond(req, res, await fn());
  } catch (err) {
    res.status(500).json({ code: 1, message: err && err.message ? err.message : String(err) });
  }
}

// ---- 5 个公开只读统计端点（无鉴权） ----
const overview = (req, res) => run(req, res, () => service.overview());
const departmentRanking = (req, res) => run(req, res, () => service.departmentRanking());
const townshipRanking = (req, res) => run(req, res, () => service.townshipRanking());
const goals = (req, res) => run(req, res, () => service.goals());
const deduction = (req, res) => run(req, res, () => service.deduction());

module.exports = {
  overview,
  departmentRanking,
  townshipRanking,
  goals,
  deduction,
};
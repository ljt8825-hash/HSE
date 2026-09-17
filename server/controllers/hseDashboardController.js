/**
 * HSE 综合驾驶舱（/api/hse/dashboard）—— 薄 controller
 * 仅做 req 解析 + 调 service + res 包装；业务与 SQL 全在 services/hseDashboardService.js。
 *
 * 响应形状忠实复刻原文件（Sprint6.3-B-1）：
 *  - 成功 res.json({ success:true, data, message })   —— **不含 code 字段**
 *  - 失败 res.status(500).json({ success:false, message })  —— 失败响应不使用标准 error()，
 *    不套用 middleware/response 的 success/error，也不走全局 errorHandler。
 *
 * service 返回 hse-dash 描述符；未捕获异常 → 兜底 500（等价原文件 try/catch → status(500)）。
 */
const service = require('../services/hseDashboardService');

/**
 * 解释 service 返回的 hse-dash 描述符 → 原形状响应。
 *   { ok:true, data, message }                     → res.json  {success:true, data, message}
 *   { ok:false, httpStatus, message, data }        → res.status(httpStatus).json({success:false, message})
 *   异常 → res.status(500).json({ success:false, message: err.message })
 */
async function run(req, res, fn) {
  try {
    const r = await fn();
    if (r && r.__t === 'hse-dash') {
      if (r.ok) return res.json({ success: true, data: r.data, message: r.message });
      return res.status(r.httpStatus).json({ success: false, message: r.message });
    }
    return res.json({ success: true, data: r ?? null, message: '操作成功' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

const overview = (req, res) => run(req, res, () => service.overview());
const levelDistribution = (req, res) => run(req, res, () => service.levelDistribution());
const riskTypeAnalysis = (req, res) => run(req, res, () => service.riskTypeAnalysis());
const riskTop = (req, res) => run(req, res, () => service.riskTop(req.query));
const riskTrend = (req, res) => run(req, res, () => service.riskTrend(req.query));
const managementExecution = (req, res) => run(req, res, () => service.managementExecution(req.query));
const riskLevelConfig = (req, res) => run(req, res, () => service.riskLevelConfig());

module.exports = {
  overview,
  levelDistribution,
  riskTypeAnalysis,
  riskTop,
  riskTrend,
  managementExecution,
  riskLevelConfig,
};
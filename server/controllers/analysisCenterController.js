/**
 * Sprint8-A HSE智能分析中心（/api/hse/analysis-center）—— 薄 controller
 * 仅做 req 解析 + 调 service + res 包装；业务规则与 SQL 全在 services/analysisCenterService.js。
 * 各 service 返回统一描述符（__t:'json'），由 respond() 统一解释为对外契约，行为与原 routes/hse-analysis-center.js 一致。
 *
 * 描述符语义：
 *  - 成功：{ __t:'json', payload, message } → res.json(success(payload, message))
 *  - error 且带 httpStatus：{ __t:'json', error:{code,message}, httpStatus } → res.status(httpStatus).json(error(...))
 *    （等价原 catch 分支的 res.status(500).json(error(-1, e.message))）
 *  - error 无 httpStatus：{ __t:'json', error:{code,message} } → res.json(error(...))（200 JSON，等价原 !isConnected / 业务校验分支）
 */
const { success, error } = require('../middleware/response');
const service = require('../services/analysisCenterService');

/** 统一解释 service 返回描述符 → 对外响应 */
function respond(req, res, r) {
  if (r == null) return res.status(500).json(error(-1, '服务无返回'));
  if (r.__t === 'json') {
    if (r.error) {
      if (r.httpStatus) res.status(r.httpStatus);
      return res.json(error(r.error.code, r.error.message));
    }
    return res.json(success(r.payload, r.message));
  }
  return res.json(success(r.payload ?? null, r.message));
}

/** 执行描述符构建；遇未捕获异常降级为标准 500 JSON（与原 catch 归一），正常情况下 service 均已自包 W() */
async function run(req, res, fn) {
  try {
    const r = await fn();
    respond(req, res, r);
  } catch (err) {
    res.status(500).json(error(-1, err.message || '操作失败，请稍后重试'));
  }
}

// ---- 模块一：风险趋势分析 ----
async function riskTrend(req, res) {
  return run(req, res, () => service.riskTrend(req.query));
}
async function riskTrendDetail(req, res) {
  return run(req, res, () => service.riskTrendDetail(req.params, req.query));
}

// ---- 模块二：事故趋势分析 ----
async function accidentTrend(req, res) {
  return run(req, res, () => service.accidentTrend(req.query));
}
async function accidentRepeat(req, res) {
  return run(req, res, () => service.accidentRepeat(req.query));
}

// ---- 模块三：整改效果分析 ----
async function rectificationAnalysis(req, res) {
  return run(req, res, () => service.rectificationAnalysis(req.query));
}

// ---- 模块四：组织风险画像 ----
async function orgPortrait(req, res) {
  return run(req, res, () => service.orgPortrait(req.query, req.user));
}
async function orgPortraitDetail(req, res) {
  return run(req, res, () => service.orgPortraitDetail(req.params, req.user));
}

// ---- 模块五：风险预测模型 ----
async function predict(req, res) {
  return run(req, res, () => service.predict(req.body, req.user));
}
async function predictions(req, res) {
  return run(req, res, () => service.predictions(req.query));
}
async function predictionDetail(req, res) {
  return run(req, res, () => service.predictionDetail(req.params));
}
async function abnormal(req, res) {
  return run(req, res, () => service.abnormal(req.query));
}

// ---- Sprint8-A-1 预测模型版本管理 ----
async function modelVersions(req, res) {
  return run(req, res, () => service.modelVersions(req.query));
}
async function modelVersionDetail(req, res) {
  return run(req, res, () => service.modelVersionDetail(req.params));
}
async function modelVersionActive(req, res) {
  return run(req, res, () => service.modelVersionActive());
}
async function modelVersionCreate(req, res) {
  return run(req, res, () => service.modelVersionCreate(req.body, req.user));
}
async function modelVersionUpdate(req, res) {
  return run(req, res, () => service.modelVersionUpdate(req.params, req.body));
}
async function modelVersionFreeze(req, res) {
  return run(req, res, () => service.modelVersionFreeze(req.params));
}
async function modelVersionDelete(req, res) {
  return run(req, res, () => service.modelVersionDelete(req.params));
}

// ---- Sprint8-A-1 预测预警联动 ----
async function generateWarning(req, res) {
  return run(req, res, () => service.generateWarning(req.params));
}
async function predictionWarnings(req, res) {
  return run(req, res, () => service.predictionWarnings(req.query));
}
async function predictionWarningStats(req, res) {
  return run(req, res, () => service.predictionWarningStats(req.query));
}

module.exports = {
  riskTrend,
  riskTrendDetail,
  accidentTrend,
  accidentRepeat,
  rectificationAnalysis,
  orgPortrait,
  orgPortraitDetail,
  predict,
  predictions,
  predictionDetail,
  abnormal,
  modelVersions,
  modelVersionDetail,
  modelVersionActive,
  modelVersionCreate,
  modelVersionUpdate,
  modelVersionFreeze,
  modelVersionDelete,
  generateWarning,
  predictionWarnings,
  predictionWarningStats,
};
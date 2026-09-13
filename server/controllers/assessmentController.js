/**
 * Sprint6.5-B 集团HSE考核分析系统（/api/hse/assessment）—— 薄 controller
 * 仅做 req 解析 + 调 service + res 包装；业务规则与 SQL 全在 services/assessmentService.js。
 * 各 service 返回统一描述符（__t:'json'），由 respond() 统一解释为对外契约，行为与原 routes/hse-assessment.js 一致。
 *
 * 描述符语义（对应本文件裸 JSON 契约，逐字节还原）：
 *  - 成功：{ __t:'json', payload, message } → res.json({ code:0, data: payload })（HTTP 200）
 *  - error 且带 httpStatus：{ __t:'json', error:{code,message}, httpStatus } → res.status(httpStatus).json({ code:1, message })
 *    （等价原 catch 分支的 res.status(500).json({code:1, message})）
 *  - error 无 httpStatus：{ __t:'json', error:{code,message} } → res.json({ code:1, message })（200）
 *
 * 注意：本域原文件成功/失败均为裸对象（无 success/message 包装字段），故此处不使用 middleware/response 的
 * success()/error()（那会附带 success:true/false 等额外字段，破坏对外契约），改为逐字节输出原 shape。
 */
const service = require('../services/assessmentService');

/** 统一解释 service 返回描述符 → 对外响应（还原原 bytes） */
function respond(req, res, r) {
  if (r == null) return res.status(500).json({ code: 1, message: '服务无返回' });
  if (r.__t === 'json') {
    if (r.error) {
      if (r.httpStatus) res.status(r.httpStatus);
      return res.json({ code: r.error.code, message: r.error.message });
    }
    return res.json({ code: 0, data: r.payload });
  }
  return res.json({ code: 0, data: r.payload ?? null });
}

/** 执行描述符构建；遇未捕获异常降级为标准 500 JSON（与原 catch 归一），正常情况下 service 均已自包 W() */
async function run(req, res, fn) {
  try {
    const r = await fn();
    respond(req, res, r);
  } catch (err) {
    res.status(500).json({ code: 1, message: err.message });
  }
}

// ---- GET /overview ----
async function overview(req, res) {
  return run(req, res, () => service.overview(req.query));
}
// ---- GET /ranking ----
async function ranking(req, res) {
  return run(req, res, () => service.ranking(req.query));
}
// ---- GET /indicator-analysis ----
async function indicatorAnalysis(req, res) {
  return run(req, res, () => service.indicatorAnalysis(req.query));
}
// ---- GET /target-progress ----
async function targetProgress(req, res) {
  return run(req, res, () => service.targetProgress(req.query));
}
// ---- GET /deduction-detail ----
async function deductionDetail(req, res) {
  return run(req, res, () => service.deductionDetail(req.query, req));
}
// ---- GET / ----
async function assessmentList(req, res) {
  return run(req, res, () => service.assessmentList(req.query));
}

module.exports = {
  overview,
  ranking,
  indicatorAnalysis,
  targetProgress,
  deductionDetail,
  assessmentList,
};
/**
 * 智能预警与整改闭环中心（/api/hse/warning-center）—— 薄 controller
 * 仅做 req 解析 + 调 service + res 包装；业务规则与 SQL 全在 services/warningCenterService.js。
 * 各 service 返回统一描述符（__t:'json'），由 respond() 统一解释为对外契约，行为与原 routes/hse-warning-center.js 一致。
 *
 * 描述符语义：
 *  - 成功：{ __t:'json', payload, message } → res.json(success(payload, message))
 *  - error 且带 httpStatus：{ __t:'json', error:{code,message}, httpStatus } → res.status(httpStatus).json(error(...))
 *    （等价原 catch 分支的 res.status(500).json(error(-1, e.message))）
 *  - error 无 httpStatus：{ __t:'json', error:{code,message} } → res.json(error(...))（200 JSON，等价原 !isConnected / 业务校验分支）
 */
const { success, error } = require('../middleware/response');
const service = require('../services/warningCenterService');

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

// ---- 模块一：风险预警中心 ----
async function warnings(req, res) {
  return run(req, res, () => service.warnings(req.query));
}
async function warningStats(req, res) {
  return run(req, res, () => service.warningStats());
}
async function warningDetail(req, res) {
  return run(req, res, () => service.warningDetail(req.params.id));
}
async function warningScan(req, res) {
  return run(req, res, () => service.warningScan());
}
async function warningEscalate(req, res) {
  return run(req, res, () => service.warningEscalate());
}

// ---- 模块二：整改任务中心 ----
async function taskList(req, res) {
  return run(req, res, () => service.taskList(req.query));
}
async function taskDetail(req, res) {
  return run(req, res, () => service.taskDetail(req.params.id));
}
async function taskCreate(req, res) {
  return run(req, res, () => service.taskCreate(req.body, req.user));
}
async function taskDispatch(req, res) {
  return run(req, res, () => service.taskDispatch(req.params.id));
}
async function taskProcess(req, res) {
  return run(req, res, () => service.taskProcess(req.params.id));
}
async function taskSubmitProof(req, res) {
  return run(req, res, () => service.taskSubmitProof(req.params.id, req.body));
}
async function taskReview(req, res) {
  return run(req, res, () => service.taskReview(req.params.id, req.body, req.user));
}
async function taskClose(req, res) {
  return run(req, res, () => service.taskClose(req.params.id, req.body, req.user));
}

// ---- 模块三：整改闭环分析 ----
async function analysis(req, res) {
  return run(req, res, () => service.analysis(req.query));
}

// ---- 模块四：预警规则管理 ----
async function ruleList(req, res) {
  return run(req, res, () => service.ruleList(req.query));
}
async function ruleDetail(req, res) {
  return run(req, res, () => service.ruleDetail(req.params.id));
}
async function ruleCreate(req, res) {
  return run(req, res, () => service.ruleCreate(req.body, req.user));
}
async function ruleUpdate(req, res) {
  return run(req, res, () => service.ruleUpdate(req.params.id, req.body, req.user));
}
async function ruleToggle(req, res) {
  return run(req, res, () => service.ruleToggle(req.params.id));
}
async function ruleVersions(req, res) {
  return run(req, res, () => service.ruleVersions(req.query));
}

// ---- Sprint7-C 模块五：整改效果验证 ----
async function taskEvaluate(req, res) {
  return run(req, res, () => service.taskEvaluate(req.params.id, req.body, req.user));
}
async function taskEvaluation(req, res) {
  return run(req, res, () => service.taskEvaluation(req.params.id));
}
async function evaluationStats(req, res) {
  return run(req, res, () => service.evaluationStats(req.query));
}

// ---- Sprint7-C 模块六：预警调度管理 ----
async function schedulerList(req, res) {
  return run(req, res, () => service.schedulerList(req.query));
}
async function schedulerCreate(req, res) {
  return run(req, res, () => service.schedulerCreate(req.body, req.user));
}
async function schedulerUpdate(req, res) {
  return run(req, res, () => service.schedulerUpdate(req.params.id, req.body));
}
async function schedulerToggle(req, res) {
  return run(req, res, () => service.schedulerToggle(req.params.id));
}
async function schedulerExecute(req, res) {
  return run(req, res, () => service.schedulerExecute(req.params.id));
}

module.exports = {
  warnings,
  warningStats,
  warningDetail,
  warningScan,
  warningEscalate,
  taskList,
  taskDetail,
  taskCreate,
  taskDispatch,
  taskProcess,
  taskSubmitProof,
  taskReview,
  taskClose,
  analysis,
  ruleList,
  ruleDetail,
  ruleCreate,
  ruleUpdate,
  ruleToggle,
  ruleVersions,
  taskEvaluate,
  taskEvaluation,
  evaluationStats,
  schedulerList,
  schedulerCreate,
  schedulerUpdate,
  schedulerToggle,
  schedulerExecute,
};
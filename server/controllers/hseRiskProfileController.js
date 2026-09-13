/**
 * HSE 员工风险画像（/api/hse/risk-profile）—— 薄 controller
 * 只做 req 解析 + 调 service + res 包装；业务规则与 SQL 全在 services/hseRiskProfileService.js。
 *
 * 响应契约（与原 routes/hse-risk-profile.js 逐一等价）：
 *  - 成功：res.json(success(...)) / buildListResponse / buildDetailResponse → HTTP 200。
 *  - 业务分支：service 返回 { notFound: true } → res.json(error(404, '员工不存在'|'配置不存在')) → HTTP 200。
 *  - 非预期异常：service 抛出 → catch → res.json(error(-1, e.message)) → HTTP 200（原文件所有 catch 同此）。
 *  - 写法端点（PUT /score-config/:id、POST /calculate-all）的 requirePermission 中间件在路由层绑定，不入 controller。
 */
const { success, error } = require('../middleware/response');
const { buildListResponse, buildDetailResponse, camelKeys } = require('../utils/commonResponse');
const service = require('../services/hseRiskProfileService');

const list = async (req, res) => {
  try {
    const {
      page = 1, pageSize = 20,
      org_unit_id, position_id, responsibility_type,
      risk_level, keyword
    } = req.query;
    void risk_level; // 原文件解构但未参与过滤，保留字段以等价解析
    const { rows, count } = await service.list({ page, pageSize, org_unit_id, position_id, responsibility_type, keyword });
    buildListResponse(res, rows, count, page, pageSize, '查询成功', { camelCase: true });
  } catch (e) {
    console.error('Risk profile list error:', e);
    res.json(error(-1, e.message));
  }
};

const detail = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const r = await service.detail(employeeId);
    if (r.notFound) return res.json(error(404, '员工不存在'));
    res.json(success(camelKeys(r.payload), '查询成功'));
  } catch (e) {
    console.error('Risk profile detail error:', e);
    res.json(error(-1, e.message));
  }
};

const score = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const r = await service.score(employeeId);
    if (r.notFound) return res.json(error(404, '员工不存在'));
    res.json(success(camelKeys({
      employee_id: r.employeeId,
      total_score: r.totalScore,
      risk_level: r.riskLevel,
      dimension_scores: r.dimensionScores,
      dimension_details: r.dimensionDetails
    }), '评分计算成功'));
  } catch (e) {
    console.error('Risk score calculate error:', e);
    res.json(error(-1, e.message));
  }
};

const riskStats = async (req, res) => {
  try {
    const r = await service.riskStats();
    res.json(success({
      overview: camelKeys(r.overview),
      riskDistribution: r.riskDistribution.map(camelKeys)
    }, '查询成功'));
  } catch (e) {
    console.error('Risk stats error:', e);
    res.json(error(-1, e.message));
  }
};

const scoreConfig = async (req, res) => {
  try {
    const rows = await service.scoreConfig();
    res.json(success(rows.map(camelKeys), '查询成功'));
  } catch (e) {
    res.json(error(-1, e.message));
  }
};

const updateScoreConfig = async (req, res) => {
  try {
    const { id } = req.params;
    const r = await service.updateScoreConfig(id, req.body);
    if (r.notFound) return res.json(error(404, '配置不存在'));
    buildDetailResponse(res, r.row, '更新成功', { camelCase: true });
  } catch (e) {
    res.json(error(-1, e.message));
  }
};

const calculateAll = async (req, res) => {
  try {
    const r = await service.calculateAll();
    res.json(success(camelKeys({ calculated: r.calculated, total: r.total }), '批量计算完成'));
  } catch (e) {
    console.error('Calculate all error:', e);
    res.json(error(-1, e.message));
  }
};

module.exports = {
  list,
  detail,
  score,
  riskStats,
  scoreConfig,
  updateScoreConfig,
  calculateAll,
};
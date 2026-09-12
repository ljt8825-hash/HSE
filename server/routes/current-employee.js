/**
 * 当前登录员工上下文 API（Sprint-WPS-02 · 目标 A）
 *
 * GET /api/current-employee
 *   由 authMiddleware 鉴权（在 app.use('/api', authMiddleware) 之后挂载）。
 *   返回当前登录用户解析到的员工身份与当前业务快照；身份解析失败时 fail-closed，
 *   返回安全中文提示与简洁 reason，绝不暴露 SQL / JWT / 内部路径。
 */
const express = require('express');
const router = express.Router();
const { success, error } = require('../middleware/response');
const { resolveCurrentEmployee } = require('../services/currentEmployeeContext');

router.get('/', async (req, res) => {
  const result = await resolveCurrentEmployee(req.user, { logger: req.logger || console });
  if (!result.ok) {
    // Fail-Closed：身份不唯一 / 无员工 / 无当前任职，明确返回业务错误，禁止继续巡查
    return res.status(422).json(error(-1, result.message, { resolved: false, reason: result.reason }));
  }
  res.json(success({ resolved: true, context: result.context }, '查询成功'));
});

module.exports = router;
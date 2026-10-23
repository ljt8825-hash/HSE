/**
 * 风险快照管理接口（仅 admin）
 *   POST /api/hse/risk-snapshot-admin/rebuild   body: {action:'dry'|'write'}
 *     - 'dry':   只计算预览，不写表（默认）
 *     - 'write': 落库重建 hse_employee_risk_snapshot（授权生产操作，留痕）
 * 挂载时强制 requireRole('admin')，见 server/app.js
 */
const router = require('express').Router();
const { rebuildSnapshot } = require('../services/riskSnapshotService');

router.post('/rebuild', async (req, res) => {
  try {
    const action = (req.body && req.body.action) || 'dry';
    if (!['dry', 'write'].includes(action)) {
      return res.status(400).json({ code: 1, message: "action 须为 'dry' 或 'write'" });
    }
    const result = await rebuildSnapshot({ write: action === 'write' });
    res.json({
      code: 0,
      message: action === 'write' ? '风险快照已重建落库' : 'dry-run 预览（未写表）',
      data: result,
    });
  } catch (e) {
    res.status(500).json({ code: 1, message: e.message, data: null });
  }
});

module.exports = router;
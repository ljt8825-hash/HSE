/**
 * 培训台账 OCR（/api/training-ocr）—— 子路由绑定层
 * 严格按原 routes/training-ocr.js 的端点注册顺序绑定 → controller。
 *
 * 端点顺序约束（与原文件一致）：
 *  - /export-signin 必须定义在 /signin-sessions/:id 之前，否则会被 :id 抢先匹配；
 *    （比 :id 更早的静态路径 /signin-sessions 亦然，保持原列序）。原文件即如此。
 *
 * 鉴权：四个写端点 + 三个读端点全部 requireRole('admin','safety_manager')（保持原状）。
 *
 * /recognize 的 multipart 处理：multer upload.single('file') 为路由中间件，
 * 其在解析失败（超限/坏文件）时产生的错误按原文件语义在此处响应 error(-1,'文件上传失败: msg')。
 */
const express = require('express');
const router = express.Router();
const { requireRole } = require('../../middleware/auth');
const { error } = require('../../middleware/response');
const service = require('../../services/trainingOcrService');
const ctl = require('../../controllers/trainingOcrController');

const GUARD = requireRole('admin', 'safety_manager');

// /recognize 需要 multer 处理 multipart：遍历错误 → 原语义 error(-1,'文件上传失败: msg')，成功 → 交 controller
const uploadGuard = (req, res, next) => {
  service.upload.single('file')(req, res, (multerErr) => {
    if (multerErr) return res.json(error(-1, `文件上传失败: ${multerErr.message}`));
    next();
  });
};

// ---- 1. 识别（原始文件在此端点内联处理上传 + 业务；拆后上传中间件 + controller 分工，语义不变） ----
router.post('/recognize', GUARD, uploadGuard, ctl.recognize);

// ---- 1.5 AI 识图（本地 Ollama 视觉模型，独立入口；复用同一 multer 上传中间件） ----
router.post('/ai-recognize', GUARD, uploadGuard, ctl.aiRecognize);

// ---- 2. 导出 Excel（GET，rows/columns 经 query base64 传入） ----
router.get('/export', GUARD, ctl.exportExcel);

// ---- 3. 确认入库 ----
router.post('/confirm', GUARD, ctl.confirm);

// ---- 4. 签到场次入库 ----
router.post('/confirm-signin', GUARD, ctl.confirmSignin);

// ---- 5. 场次台账列表（静态路径，先于 :id） ----
router.get('/signin-sessions', GUARD, ctl.signinList);

// ---- 7. 导出场次台账（需在 /signin-sessions/:id 之前注册，避免被 :id 遮蔽） ----
router.get('/export-signin', GUARD, ctl.exportSignin);

// ---- 6. 场次明细（放在静态 export-signin 之后） ----
router.get('/signin-sessions/:id', GUARD, ctl.signinDetail);

module.exports = router;
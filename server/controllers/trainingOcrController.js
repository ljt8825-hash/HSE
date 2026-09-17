/**
 * 培训台账 OCR（/api/training-ocr）—— 薄 controller
 * 仅做 req 解析 + 调 service + res 包装；业务规则、子进程 OCR、Excel 生成与 SQL 全在
 * services/trainingOcrService.js。
 *
 * 描述符 → 对外响应（__t:'json'）：
 *  - { payload, message }          成功 → res.json(success(payload, message))
 *  - { error:{ code, message } }   业务错误 → res.json(error(code, message))（HTTP 200）
 *  - throw                         未捕获异常 → res.json(error(-1, err.message))
 *
 * 两个 Excel 导出端点（exportExcel / exportSignin）成功时返回二进制 payload
 * （{ buffer, finalName }），由本层直接渲染为 xlsx 附件发送。
 */
const { success, error } = require('../middleware/response');
const service = require('../services/trainingOcrService');

/** 统一解释 service 返回描述符 → 对外响应 */
function respond(res, r, fallbackMsg = '操作失败') {
  if (r == null) return res.json(error(-1, fallbackMsg));
  if (r.__t === 'json') {
    if (r.error) return res.json(error(r.error.code, r.error.message));
    return res.json(success(r.payload, r.message));
  }
  return res.json(success(r.payload ?? null, r.message));
}

/** 包裹 service 调用：描述符由 respond 解释；未捕获异常 → error(-1, err.message) */
async function run(req, res, fn) {
  try {
    respond(res, await fn());
  } catch (err) {
    res.json(error(-1, err.message));
  }
}

// ---- 1. 识别：multipart 由路由层 upload.single('file') 处理，req.file 已就绪 ----
const recognize = (req, res) => run(req, res, () => service.recognize(req));

// ---- 1.5 AI 识图（本地 Ollama 视觉模型识别培训台账照片，独立入口）----
const aiRecognize = (req, res) => run(req, res, () => service.aiRecognize(req));

// ---- 2. 导出 Excel（rows/columns 经 query 传入）→ 二进制附件 ----
const exportExcel = async (req, res) => {
  try {
    const r = await service.exportExcel(req.query);
    if (r && r.__t === 'json' && !r.error) {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(r.payload.finalName)}`);
      return res.send(r.payload.buffer);
    }
    respond(res, r);
  } catch (err) {
    res.json(error(-1, err.message));
  }
};

// ---- 3. 确认入库 ----
const confirm = (req, res) => run(req, res, () => service.confirm(req));

// ---- 4. 签到场次入库 ----
const confirmSignin = (req, res) => run(req, res, () => service.confirmSignin(req));

// ---- 5. 场次台账列表 ----
const signinList = (req, res) => run(req, res, () => service.signinList(req.query));

// ---- 6. 场次明细 ----
const signinDetail = (req, res) => run(req, res, () => service.signinDetail(req.params));

// ---- 7. 导出场次台账 → 二进制附件 ----
const exportSignin = async (req, res) => {
  try {
    const r = await service.exportSignin();
    if (r && r.__t === 'json' && !r.error) {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(r.payload.finalName)}`);
      return res.send(r.payload.buffer);
    }
    respond(res, r);
  } catch (err) {
    res.json(error(-1, err.message));
  }
};

module.exports = {
  recognize, aiRecognize, exportExcel, confirm, confirmSignin,
  signinList, signinDetail, exportSignin,
};
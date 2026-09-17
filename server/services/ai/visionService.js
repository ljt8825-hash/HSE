/**
 * visionService —— AI 视觉识图（多模态 VL 模型）通道
 *
 * 能力：把一张/一份图片（培训台账照片等）交给本地 Ollama 视觉大模型（qwen2.5vl 系列），
 * 识别图片中的表格内容，返回结构化的培训台账行（rows 为 snake_case 字段，同 OCR 脚本口径）。
 *
 * 定位：独立于「AI 统一 API」（generate/stream/analyze 走 aiGateway 的文本通道）。
 * 视觉识图需要把图片以 base64 塞进消息的多模态 images 字段，文本 Provider 不支持，
 * 故此处单独实现 Ollama /api/chat 多模态调用；不修改 .env（VL 模型可用环境变量进程级覆盖）。
 *
 * 未接入 Provider 注册表（aiProviderRegistry）是刻意为之：
 *  - 不改变现有 Grok/Ollama/OpenAI 文本链路与能力声明（visionInput 仍如实标 false）
 *  - troubleshooting 最小化，仅服务“培训台账照片识图”这一业务点
 */
const fs = require('fs');

const VL_MODEL = process.env.OLLAMA_VL_MODEL || 'qwen2.5vl:7b';
const BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
// 超时优先级：OLLAMA_VL_TIMEOUT_MS > AI_TIMEOUT_MS > 默认 300s（覆盖 CPU 冷加载，见 AI-07 延迟口径）
const AI_TIMEOUT_MS = Number(process.env.OLLAMA_VL_TIMEOUT_MS) || Number(process.env.AI_TIMEOUT_MS) || 5 * 60 * 1000;

/** 字段说明（snake 口径，与 scripts/ocr_ledger.py 的 FORM_LABELS 一致；补 id_card/grid_level/frequency） */
const FIELD_DESC = [
  'name：姓名',
  'id_card：身份证号',
  'dept：部门',
  'position：岗位',
  'grid_level：网格级别',
  'frequency：培训频次',
  'training_type：培训类型',
  'training_date：培训日期，统一为YYYY-MM-DD',
  'duration_minutes：培训学时/时长，仅填数字(分钟)；识别不到填0',
  'content：培训内容',
  'score：考核成绩，仅填数字；识别不到填0',
  'result：培训结果（如合格/不合格）',
  'trainer：培训人',
  'remark：备注（培训地点/参加人数等）',
].join('\n');

/** 组装识别提示词：固定输出“仅JSON数组”，避免模型加解释文本 */
function buildPrompt() {
  return [
    '你是一名 HSE 培训台账识别助手。请仔细阅读图片中的培训记录/培训台账表格，',
    '把表格中的每一行识别为一条培训记录。',
    '',
    `输出要求：仅输出一个合法的 JSON 对象，形如 {"rows":[{...},{...}]}，切勿添加任何解释、Markdown 或多余文字。`,
    `每个元素的字段与含义如下：\n${FIELD_DESC}`,
    '无法从图上识别到的字段填空字符串，数字类字段填0。',
    '若图片中没有规整的培训记录表格，则返回 {"rows":[]}。',
  ].join('\n');
}

/** 通用 http/https POST 并返回 {status, body} */
function postJson(pathname, payload, timeoutMs) {
  const urlObj = new URL(`${BASE_URL.replace(/\/$/, '')}${pathname}`);
  const isHttps = urlObj.protocol === 'https:';
  const lib = isHttps ? require('https') : require('http');
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: timeoutMs,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          let parsed = data;
          try { parsed = JSON.parse(data); } catch (e) { /* 保持原始文本 */ }
          resolve({ status: res.statusCode, body: parsed });
        });
      },
    );
    req.on('timeout', () => { req.destroy(); reject(new Error('Ollama 视觉识别请求超时')); });
    req.on('error', (err) => reject(err));
    req.write(body);
    req.end();
  });
}

/** 从模型原始返回中抽取 message/response 文本 */
function extractText(modelBody) {
  if (modelBody && modelBody.message && typeof modelBody.message.content === 'string') {
    return modelBody.message.content;
  }
  if (modelBody && typeof modelBody.response === 'string') {
    return modelBody.response;
  }
  return '';
}

/** 提取字符串中第一段合法 JSON（容忍 ```json 包裹与说明文字前缀） */
function extractJson(text) {
  let s = String(text || '').trim();
  // 去掉围栏
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  const candidate = s.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch (e) {
    return null;
  }
}

/** 行清洗：仅保留对象、丢弃全空行、字段转字符串（数字保持可入库） */
function normalizeRows(rows) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const clean = {};
    for (const k of Object.keys(r)) {
      const v = r[k];
      if (v === undefined || v === null) {
        clean[k] = '';
        continue;
      }
      if (typeof v === 'boolean') {
        clean[k] = v ? '合格' : '';
      } else {
        clean[k] = v;
      }
    }
    const nonEmpty = Object.values(clean).some(
      (v) => typeof v === 'number' ? v !== 0 && !Number.isNaN(v) : String(v).trim() !== '',
    );
    if (nonEmpty) out.push(clean);
  }
  return out;
}

/**
 * 识别图片中的培训台账
 * @param {Object} params
 * @param {string} params.filePath - 已上传到本机的图片文件绝对路径（png/jpg/jpeg/bmp/webp）
 * @returns {Promise<{ rows: Object[] }>}
 * @throws 当 Ollama 不可达 / VL 模型缺失 / 输出无法解析时抛出带清晰提示的 Error
 */
async function recognizeLedgerImage({ filePath }) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('图片文件不存在');
  }
  const b64 = fs.readFileSync(filePath, { encoding: 'base64' });
  const payload = {
    model: VL_MODEL,
    messages: [
      {
        role: 'user',
        content: buildPrompt(),
        images: [b64],
      },
    ],
    format: 'json',
    stream: false,
    // num_ctx 需大于图片视觉 token（A4@2x 约 2.5k）+ 文本；qwen2.5vl 默认 4096 偏紧，扩到 8192
    options: { temperature: 0.1, num_ctx: Number(process.env.OLLAMA_VL_NUM_CTX) || 8192 },
  };

  let result;
  try {
    result = await postJson('/api/chat', payload, AI_TIMEOUT_MS);
  } catch (e) {
    throw new Error(`AI 视觉识别请求失败：${e.message}`);
  }

  const status = result && result.status;
  const body = (result && result.body) || {};
  if (status === 404 && /model/i.test(JSON.stringify(body))) {
    throw new Error(`AI 视觉模型不可用：请先执行「ollama pull ${VL_MODEL}」下载后重试`);
  }
  if (status === 404) {
    throw new Error(`Ollama 视觉端点不可用（HTTP 404），请检查 OLLAMA_BASE_URL=${BASE_URL}`);
  }
  if (status === 500 && /model.*fallback|no.*vision|does not support/i.test(JSON.stringify(body))) {
    throw new Error(`模型 ${VL_MODEL} 不支持图像输入`);
  }
  if (status >= 400) {
    const msg = (body && body.error) ? String(body.error).slice(0, 300) : JSON.stringify(body).slice(0, 300);
    throw new Error(`Ollama 视觉识别失败（HTTP ${status}）：${msg}`);
  }
  if (body.error) {
    throw new Error(`Ollama 视觉识别失败：${String(body.error)}`);
  }

  const parsed = extractJson(extractText(body));
  if (!parsed) {
    throw new Error('AI 视觉识别结果无法解析为 JSON，请更换清晰、规整的培训台账照片后重试');
  }
  return { rows: normalizeRows(parsed.rows) };
}

module.exports = { recognizeLedgerImage, VL_MODEL, normalizeRows };
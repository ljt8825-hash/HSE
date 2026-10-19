/**
 * visionService —— AI 视觉识图（多模态 VL 模型）通道
 *
 * 双通道：
 *  A. recognizeLedgerImage  通用「培训台账表格」识别（逐行识别文字内容）
 *  B. recognizeSigninSheet  培训会议签到表「填写完整性检查」（只判断单元格填/空，不识字）
 *
 * 能力：把一张/一份图片交给视觉大模型，返回结构化 JSON。
 *
 * 双传输（2026-10-19 新增，默认行为不变）：
 *  A. ollama —— 原生 `POST /api/chat`，图片放 `messages[].images`（默认，qwen2.5vl 系列）
 *  B. openai —— OpenAI 兼容 `POST /v1/chat/completions`，图片走 `image_url` dataURL
 *     适配任意 OpenAI 兼容网关（本机 dsh「本地 OpenAI 网关」、云厂商 VL API 等）。
 *     由 `VISION_PROVIDER=openai` 显式开启；只配了 `VISION_OPENAI_BASE_URL` 也视为开启。
 *
 * 定位：独立于「AI 统一 API」（generate/stream/analyze 走 aiGateway 的文本通道）。
 * 视觉识图需要把图片内联进多模态消息，文本 Provider 不支持，故此处单独实现。
 *
 * 未接入 Provider 注册表（aiProviderRegistry）是刻意为之：
 *  - 不改变现有 Grok/Ollama/OpenAI 文本链路与能力声明（visionInput 仍如实标 false）
 *  - troubleshooting 最小化，仅服务“培训台账/签到表照片识图”这一业务点
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveTeamCode } = require('./signinCodeMap');

const VL_MODEL = process.env.OLLAMA_VL_MODEL || 'qwen2.5vl:7b';
const BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
// 超时优先级：OLLAMA_VL_TIMEOUT_MS > AI_TIMEOUT_MS > 默认 300s（覆盖 CPU 冷加载，见 AI-07 延迟口径）
const AI_TIMEOUT_MS = Number(process.env.OLLAMA_VL_TIMEOUT_MS) || Number(process.env.AI_TIMEOUT_MS) || 5 * 60 * 1000;
// 签到表「退化输出」重跑次数：模型承认是签到表但内容全空时重跑，0=不重跑，上限 3
const AI_SIGNIN_RETRY = (() => {
  const n = Number(process.env.AI_SIGNIN_RETRY);
  if (!Number.isFinite(n) || n < 0) return 1;
  return Math.min(Math.floor(n), 3);
})();

// ---------------------------------------------------------------------------
// 传输通道解析（ollama / openai 兼容）
// 刻意做成**每次调用时**读 process.env 的函数：既能让测试在同一进程里切换两路，
// 也避免「改了 .env 必须重启」之外的隐性状态（重启仍是最稳的生效方式）。
// ---------------------------------------------------------------------------
const OPENAI_KINDS = new Set(['openai', 'openai-compatible', 'gateway', 'relay']);

// DSH（dsh-our-free-model 插件的「本地 OpenAI 网关」）默认值。
// 网关默认只监听回环地址，端口由插件设置决定，默认 18899。
const DSH_DEFAULT_BASE_URL = 'http://127.0.0.1:18899/v1';
const DSH_DEFAULT_MODEL = 'nvidia/nemotron-3.5-super-vl:free';

/**
 * DSH 网关可选的「免费视觉模型」白名单（前端下拉框数据源）。
 *
 * 只有真正接受 image_url 的模型才能进这个列表 —— 其余会在识别时直接报
 * 「No endpoints found that support image input」。
 * 2026-10-19 在本机 127.0.0.1:18899 逐个实测：
 *   ✅ nvidia/nemotron-3.5-super-vl:free（2.3s）
 *   ✅ nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free（4.1s）
 *   ✅ openrouter/free（4.3s）
 *   ✅ kilo-auto/free（4.5s）
 *   ❌ nvidia/nemotron-3.5-lightning:free —— 明确拒绝图像输入
 *   ⚠️ 裸 id（xxx-free）属 EAC 渠道：本机 IP 被判「abusive traffic」时整批 403
 * 需要加自己的模型：设 `DSH_VISION_MODELS=a,b,c`（逗号分隔）即可追加。
 */
const DSH_VISION_MODELS = [
  { id: 'nvidia/nemotron-3.5-super-vl:free', label: 'Nemotron 3.5 Super VL（推荐）', channel: 'kilo', note: '' },
  { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', label: 'Nemotron 3 Nano Omni', channel: 'kilo', note: '' },
  { id: 'openrouter/free', label: 'OpenRouter Free（自动路由）', channel: 'kilo', note: '' },
  { id: 'kilo-auto/free', label: 'Kilo Auto Free（自动路由）', channel: 'kilo', note: '' },
  { id: 'nemotron-3.5-super-vl-free', label: 'Nemotron 3.5 Super VL（EAC）', channel: 'eac', note: 'EAC 渠道，网络受限时不可用' },
  { id: 'deepseek-v4.1-flash-free', label: 'DeepSeek V4.1 Flash（EAC）', channel: 'eac', note: 'EAC 渠道，网络受限时不可用' },
  { id: 'glm-5.3-flash-free', label: 'GLM 5.3 Flash（EAC）', channel: 'eac', note: 'EAC 渠道，网络受限时不可用' },
  { id: 'space-bunny-free', label: 'Space Bunny（EAC）', channel: 'eac', note: 'EAC 渠道，网络受限时不可用' },
  { id: 'big-pickle', label: 'Big Pickle（EAC）', channel: 'eac', note: 'EAC 渠道，网络受限时不可用' },
];

/** 当前可选模型（白名单 + DSH_VISION_MODELS 追加项） */
function listDshVisionModels() {
  const list = DSH_VISION_MODELS.map((m) => ({ ...m }));
  const extra = String(process.env.DSH_VISION_MODELS || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const id of extra) {
    if (!list.some((m) => m.id === id)) {
      list.push({ id, label: id, channel: 'custom', note: '自定义（DSH_VISION_MODELS）' });
    }
  }
  return list;
}

/** 服务端校验：只接受白名单内的模型，避免前端传任意字符串打到网关 */
function isDshVisionModel(id) {
  const want = String(id || '').trim();
  return !!want && listDshVisionModels().some((m) => m.id === want);
}

/** 读 dsh 插件的 availability.json（EAC 渠道的可用性），失败返回空对象 */
function readDshAvailability() {
  const home = String(process.env.DSH_HOME || '').trim() || path.join(os.homedir(), '.dsh');
  try {
    const j = JSON.parse(fs.readFileSync(path.join(home, 'our-free-model', 'availability.json'), 'utf8'));
    return (j && j.results) || {};
  } catch (e) {
    return {};
  }
}

/** Ollama 本地通道描述 */
function ollamaProvider() {
  return {
    kind: 'ollama',
    label: '本地 Ollama',
    baseUrl: BASE_URL,
    model: VL_MODEL,
    apiKey: '',
    timeoutMs: AI_TIMEOUT_MS,
    jsonMode: 'on',
    channel: 'ollama-vl',
  };
}

/**
 * 读 DSH 网关的 forward key。
 * 优先 DSH_API_KEY；没配就去插件的 settings.json 取 `forwardKey`（零配置）。
 * ⚠️ 不要用 `~/.dsh/openai-gateway/api-key` —— 那是 chan-relay 的 key，打 forward 网关必 401。
 */
function readDshForwardKey() {
  const fromEnv = String(process.env.DSH_API_KEY || '').trim();
  if (fromEnv) return fromEnv;
  const home = String(process.env.DSH_HOME || '').trim() || path.join(os.homedir(), '.dsh');
  const file = path.join(home, 'our-free-model', 'settings.json');
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    return String((j && j.forwardKey) || '').trim();
  } catch (e) {
    return '';
  }
}

/** DSH 通道描述（强制走 OpenAI 兼容协议）；modelOverride 来自前端下拉框 */
function dshProvider(modelOverride) {
  return {
    kind: 'openai',
    label: 'DSH 网关',
    baseUrl: String(process.env.DSH_BASE_URL || '').trim() || DSH_DEFAULT_BASE_URL,
    model: String(modelOverride || '').trim()
      || String(process.env.DSH_MODEL || '').trim()
      || DSH_DEFAULT_MODEL,
    apiKey: readDshForwardKey(),
    timeoutMs: Number(process.env.DSH_TIMEOUT_MS)
      || Number(process.env.VISION_OPENAI_TIMEOUT_MS)
      || AI_TIMEOUT_MS,
    jsonMode: String(process.env.DSH_JSON_MODE || process.env.VISION_OPENAI_JSON_MODE || 'auto')
      .trim()
      .toLowerCase(),
    channel: 'dsh-vl',
  };
}

/**
 * 解析视觉通道。
 * @param {'local'|'dsh'|'ollama'|'openai'|''} [override]
 *   - `local` / `ollama`：强制本地 Ollama（忽略 VISION_PROVIDER）
 *   - `dsh`：强制 DSH 网关（忽略 VISION_PROVIDER）
 *   - 空：沿用原有 env 逻辑（VISION_PROVIDER / VISION_OPENAI_* / 默认 Ollama）
 * @param {{model?:string}} [opts] 仅 dsh 生效：前端下拉框选中的模型
 * @returns {{kind:'ollama'|'openai', label:string, baseUrl:string, model:string,
 *            apiKey:string, timeoutMs:number, jsonMode:string, channel:string}}
 */
function resolveVisionProvider(override, opts = {}) {
  const want = String(override || '').trim().toLowerCase();
  if (want === 'dsh') return dshProvider(opts && opts.model);
  if (want === 'local' || want === 'ollama') return ollamaProvider();

  const kindRaw = String(process.env.VISION_PROVIDER || '').trim().toLowerCase();
  const openAiBase = String(process.env.VISION_OPENAI_BASE_URL || '').trim();
  const openAiModel = String(process.env.VISION_OPENAI_MODEL || '').trim();
  const wantOpenAi = OPENAI_KINDS.has(kindRaw) || (!kindRaw && !!openAiBase);

  if (wantOpenAi) {
    if (!openAiBase) {
      throw new Error('VISION_PROVIDER=openai 时必须配置 VISION_OPENAI_BASE_URL（如 http://127.0.0.1:18899/v1）');
    }
    if (!openAiModel) {
      throw new Error('VISION_PROVIDER=openai 时必须配置 VISION_OPENAI_MODEL（如 nvidia/nemotron-3.5-super-vl:free）');
    }
    return {
      kind: 'openai',
      label: 'OpenAI 兼容网关',
      baseUrl: openAiBase,
      model: openAiModel,
      apiKey: String(process.env.VISION_OPENAI_API_KEY || '').trim(),
      timeoutMs: Number(process.env.VISION_OPENAI_TIMEOUT_MS) || AI_TIMEOUT_MS,
      jsonMode: String(process.env.VISION_OPENAI_JSON_MODE || 'auto').trim().toLowerCase(),
      channel: 'openai-vl',
    };
  }

  return ollamaProvider();
}

/** 供接口 meta / 排错页展示「当前用的是哪一路、哪个模型」 */
function visionProviderMeta(override, opts) {
  const p = resolveVisionProvider(override, opts);
  return { model: p.model, channel: p.channel, provider: p.kind, baseUrl: p.baseUrl };
}

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

/**
 * 把用户自定义提示词追加到系统提示词尾部。
 * 刻意**不替换**原提示词：JSON schema、枚举候选、字段口径这些硬约束必须保留，
 * 否则模型自由发挥会让下游解析直接失败。用户要求只能作为「附加约束」。
 */
function appendUserPrompt(lines, extraPrompt) {
  const extra = String(extraPrompt || '').trim();
  if (extra) {
    lines.push(
      '',
      '【用户附加要求（必须服从上面的 JSON 输出格式与字段口径；与本要求冲突时以 JSON 格式为准）】',
      extra,
    );
  }
  return lines.join('\n');
}

/** A. 通用台账提示词：固定输出“仅JSON对象”，避免模型加解释文本 */
function buildLedgerPrompt(extraPrompt) {
  return appendUserPrompt([
    '你是一名 HSE 培训台账识别助手。请仔细阅读图片中的培训记录/培训台账表格，',
    '把表格中的每一行识别为一条培训记录。',
    '',
    `输出要求：仅输出一个合法的 JSON 对象，形如 {"rows":[{...},{...}]}，切勿添加任何解释、Markdown 或多余文字。`,
    `每个元素的字段与含义如下：\n${FIELD_DESC}`,
    '无法从图上识别到的字段填空字符串，数字类字段填0。',
    '若图片中没有规整的培训记录表格，则返回 {"rows":[]}。',
  ], extraPrompt);
}

// ---------------------------------------------------------------------------
// B. 培训会议签到表「填写完整性检查」提示词
//    关键约束：只判断单元格「已填写 / 为空」，**不做文字识别**（业务要求：只计数不识字）。
//    让模型输出逐行布尔值，由本模块在 JS 侧做确定性计数，避免让 7B 模型做算术。
// ---------------------------------------------------------------------------
const HEADER_FIELDS = ['date', 'place', 'host', 'recorder', 'dept', 'headcount'];
const HEADER_CN = {
  date: '培训日期',
  place: '培训地点',
  host: '主持人',
  recorder: '记录人',
  dept: '部门',
  headcount: '参加人数',
};

/**
 * 组装签到表提示词
 * @param {string} rosterText 已格式化的「乡镇 → 经理姓名」名单（闭集选择，避免模型编造）
 * @param {string} [extraPrompt] 用户附加要求（不改变「只判填/空」的硬约束）
 */
function buildSigninPrompt(rosterText, extraPrompt) {
  return appendUserPrompt([
    '你是一名 HSE「培训会议签到表」完整性检查助手。',
    '',
    '【最重要的约束】本任务**不要求识别汉字内容**，不要输出任何姓名/日期/地点文字。',
    '你唯一要做的事：判断每个单元格「有内容」还是「空白」。',
    '',
    '请按下列步骤检查这张图片：',
    '',
    '第0步 判断本页是否是「培训会议签到表」：标题通常含“签到表/培训会议签到表”，',
    '  版面含“培训日期、培训地点、主持人、记录人、部门、参加人数”等表头字段，',
    '  下方有“序号 | 姓名 | 签名”三列的人员表格。',
    '  若本页是现场照片/合影/空白页/其它无关表格，则输出：',
    '  {"rows":[],"is_signin_sheet":false,"skip_reason":"photo"}（blank/other 亦可）',
    '',
    '第1步 读取表头处的「班组编号」（形如 DC-1、DC-01、CHD-2）。',
    '  原样输出这个编号（字母+数字+短横线），不要翻译、不要补全。读不到则输出空字符串。',
    '',
    '第2步 检查 6 个表头字段**右侧单元格**是否填写（有字、有勾、有数字都算已填）：',
    '  date=培训日期, place=培训地点, host=主持人, recorder=记录人, dept=部门, headcount=参加人数',
    '  逐项输出 true(已填) / false(空白)。**只输出布尔值，绝不要输出单元格里的文字。**',
    '',
    '第3步 统计下方“序号 | 姓名 | 签名”人员表格（**只报数字，不要逐行列举**）：',
    '  row_total：表格数据总行数（不含标题行，整行全空的行不计入）；',
    '  name_count：「姓名」列有字的行数；',
    '  signature_count：「签名」列有签名/笔迹的行数；',
    '  missing_signature_count：姓名列有字、但签名列为空白的行数（即未签字人数）；',
    '  newcomer_count：姓名列为空白、但签名列有签名的行数（即新员工）。',
    '  可用 name_count 与 signature_count 交叉核对：missing = name_count - signature_count + newcomer_count。',
    '  只输出整数，绝不输出任何姓名文字。',
    '',
    '第4步 若表上能看出培训人/经理姓名，从下列名单中挑选最可能的一位；',
    '  名单之外的名字不要编造，不确定就输出空字符串。',
    rosterText ? `\n【乡镇作业中心经理名单】\n${rosterText}\n` : '',
    '',
    '输出严格为如下 JSON（不要任何解释、Markdown 或多余文字）：',
    '{"rows":[{',
    '  "is_signin_sheet": true,',
    '  "team_code": "DC-1",',
    '  "manager": "孙建栋",',
    '  "header": {"date":true,"place":true,"host":true,"recorder":true,"dept":true,"headcount":false},',
    '  "row_total": 15,',
    '  "name_count": 15,',
    '  "signature_count": 14,',
    '  "missing_signature_count": 1,',
    '  "newcomer_count": 0',
    '}]}',
  ], extraPrompt);
}

// ---------------------------------------------------------------------------
// Ollama 调用 / JSON 解析（两通道共用）
// ---------------------------------------------------------------------------

/** 通用 http/https POST（绝对 URL），返回 {status, body} */
function postJsonUrl(fullUrl, payload, timeoutMs, headers = {}) {
  const urlObj = new URL(fullUrl);
  const isHttps = urlObj.protocol === 'https:';
  const lib = isHttps ? require('https') : require('http');
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...headers,
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
    req.on('timeout', () => { req.destroy(); reject(new Error(`视觉识别请求超时（${timeoutMs}ms）`)); });
    req.on('error', (err) => reject(err));
    req.write(body);
    req.end();
  });
}

/** Ollama 通道沿用原签名：相对路径拼接 OLLAMA_BASE_URL */
function postJson(pathname, payload, timeoutMs) {
  return postJsonUrl(`${BASE_URL.replace(/\/$/, '')}${pathname}`, payload, timeoutMs);
}

/** 由文件扩展名推断 dataURL 的 mime（OpenAI 通道必须显式带 mime） */
function mimeOf(filePath) {
  const ext = String(filePath || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  switch (ext && ext[1]) {
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'gif': return 'image/gif';
    case 'bmp': return 'image/bmp';
    case 'jpg':
    case 'jpeg':
    default: return 'image/jpeg';
  }
}

/**
 * 把用户填的 base URL 归一成 chat/completions 完整地址。
 * 已带版本段（/v1、/v1beta、/openai/v1 …）就只补路径；否则补 /v1。
 * @param {string} baseUrl
 */
function openAiChatUrl(baseUrl) {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) throw new Error('VISION_OPENAI_BASE_URL 不能为空');
  if (/\/v\d+[a-z0-9]*$/i.test(base)) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
}

/**
 * 构造 OpenAI 兼容的多模态请求体。
 * @param {{model:string, jsonMode:string}} provider
 * @param {string} b64   图片 base64（不含前缀）
 * @param {string} mime  image/jpeg 等
 * @param {string} prompt
 */
function buildOpenAiPayload(provider, b64, mime, prompt) {
  const payload = {
    model: provider.model,
    temperature: 0.1,
    stream: false,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } },
      ],
    }],
  };
  // jsonMode: on=必带 / off=不带 / auto=先带，被拒再去掉重试（见 callOpenAiVision）
  if (provider.jsonMode !== 'off') payload.response_format = { type: 'json_object' };
  return payload;
}

/** 从模型原始返回中抽取正文文本（兼容 OpenAI 与 Ollama 两种响应形状） */
function extractText(modelBody) {
  if (!modelBody || typeof modelBody !== 'object') return '';

  // OpenAI 兼容：choices[0].message.content（字符串或 parts 数组）
  const choice = Array.isArray(modelBody.choices) ? modelBody.choices[0] : null;
  const oaMsg = choice && choice.message;
  if (oaMsg) {
    if (typeof oaMsg.content === 'string') return oaMsg.content;
    if (Array.isArray(oaMsg.content)) {
      return oaMsg.content
        .map((p) => (typeof p === 'string' ? p : (p && typeof p.text === 'string' ? p.text : '')))
        .join('');
    }
  }
  // OpenAI 兼容（老版 completions / 少数网关）
  if (choice && typeof choice.text === 'string') return choice.text;

  // Ollama /api/chat 与 /api/generate
  if (modelBody.message && typeof modelBody.message.content === 'string') {
    return modelBody.message.content;
  }
  if (typeof modelBody.response === 'string') {
    return modelBody.response;
  }
  return '';
}

/** 截取一段字符串用于日志/预览，避免把整页模型输出塞进提示词 */
function preview(text, max = 200) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…（已截断，共 ${s.length} 字）`;
}

/** 寻找字符串中所有最外层 {...} 段（平衡括号匹配，从前往后扫）。
 *  模型常把答案放在最后，前面跟着解释里零散的 {}（例如说明中引用字段名）；
 *  这里返回**所有**匹配区间，由调用方按需挑选。
 *  返回 [[start,end], ...] 闭区间（含两端），可能为空。 */
function findAllBalancedBraces(s) {
  const results = [];
  let from = 0;
  while (from < s.length) {
    const first = s.indexOf('{', from);
    if (first === -1) break;
    let depth = 0;
    let inString = false;
    let escape = false;
    let end = -1;
    for (let i = first; i < s.length; i += 1) {
      const ch = s[i];
      if (escape) { escape = false; continue; }
      if (inString) {
        if (ch === '\\') { escape = true; continue; }
        if (ch === '"') { inString = false; }
        continue;
      }
      if (ch === '"') { inString = true; continue; }
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) { end = i; break; }
      }
    }
    if (end === -1) break;
    results.push([first, end]);
    from = end + 1;
  }
  return results;
}

/** 同上，但针对 [...] 数组（部分模型会直接吐一个数组） */
function findBalancedBracket(s, from = 0) {
  const first = s.indexOf('[', from);
  if (first === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = first; i < s.length; i += 1) {
    const ch = s[i];
    if (escape) { escape = false; continue; }
    if (inString) {
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inString = false; }
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) return [first, i];
    }
  }
  return null;
}

/**
 * 从模型原始输出中尽力抽出 JSON 对象。多种常见输出形态都覆盖：
 *   1. 纯 JSON：`{"rows":[...]}`                       直接 parse
 *   2. 围栏包裹：```json\n{...}\n```                  去围栏后 parse
 *   3. 前缀说明 + JSON：'下面是结果：\n{...}\n完毕'    找最外层平衡 {...}
 *   4. 裸数组：[...]             包成 `{"rows": [...]}` 再 parse
 *   5. 字符串里漏引号 / 多余逗号等：尽力，失败如实返回 null
 *
 * @param {string} text  模型原始 message.content / response
 * @returns {{ json: any, raw: string } | null}  解析成功返回 {json, raw}，raw 为真正被 parse 的子串（便于排错）
 */
function extractJson(text) {
  let s = String(text || '');
  if (!s.trim()) return null;
  // 去围栏（多次匹配，覆盖 ```json / ``` / 末尾 ``` 等）
  s = s.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();

  const tryParse = (candidate) => {
    try {
      return JSON.parse(candidate);
    } catch (e) {
      return undefined;
    }
  };

  // 策略 1：整体直接 parse
  let parsed = tryParse(s);
  if (parsed !== undefined) {
    // 裸数组（模型直接吐 [{...},{...}]）统一包成 {rows:[...]}，与策略 3 口径一致；
    // 否则调用方读 json.rows 会拿到 undefined，整页识别结果被静默丢弃。
    if (Array.isArray(parsed)) return { json: { rows: parsed }, raw: s };
    return { json: parsed, raw: s };
  }

  // 策略 2：在所有最外层平衡 {...} 中优先挑含 rows 字段的；
  //         模型常把解释 prose 中零散的 {} 放在前面，把最终答案放在末尾。
  const candidates = findAllBalancedBraces(s);
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const txt = s.slice(candidates[i][0], candidates[i][1] + 1);
    const obj = tryParse(txt);
    if (obj && typeof obj === 'object' && Array.isArray(obj.rows)) {
      return { json: obj, raw: txt };
    }
  }

  // 策略 3：找最外层平衡 [...] → 包装成 {"rows": [...]}
  //         优先于「任意 {...} 兜底」，避免把裸数组里嵌套的 {} 误当 prose 中的 JSON 对象。
  const bracket = findBalancedBracket(s);
  if (bracket) {
    const arrText = s.slice(bracket[0], bracket[1] + 1);
    parsed = tryParse(arrText);
    if (parsed !== undefined && Array.isArray(parsed)) {
      return { json: { rows: parsed }, raw: arrText };
    }
  }

  // 兜底：最后一段平衡 {...}（不论字段）能 parse 就用
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const txt = s.slice(candidates[i][0], candidates[i][1] + 1);
    const obj = tryParse(txt);
    if (obj && typeof obj === 'object') {
      return { json: obj, raw: txt };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// 两条传输通道的请求与错误翻译
// ---------------------------------------------------------------------------

/** Ollama 原生 /api/chat（默认通道，行为与改造前完全一致） */
async function requestOllama(provider, b64, prompt) {
  const payload = {
    model: provider.model,
    messages: [{ role: 'user', content: prompt, images: [b64] }],
    format: 'json',
    stream: false,
    // num_ctx 需大于图片视觉 token（A4@2x 约 2.5k）+ 文本；qwen2.5vl 默认 4096 偏紧，扩到 8192
    options: { temperature: 0.1, num_ctx: Number(process.env.OLLAMA_VL_NUM_CTX) || 8192 },
  };
  return postJson('/api/chat', payload, provider.timeoutMs);
}

/** 网关是否明确拒了 response_format / json_object（据此决定要不要去掉重试） */
function isResponseFormatRejected(result) {
  if (!result || !(result.status >= 400)) return false;
  return /response_format|json_object|json mode|json_mode/i.test(JSON.stringify(result.body || ''));
}

/** OpenAI 兼容 /chat/completions（图片走 image_url dataURL） */
async function requestOpenAi(provider, b64, prompt, filePath) {
  const url = openAiChatUrl(provider.baseUrl);
  const headers = {};
  if (provider.apiKey) {
    // dsh 本地网关两种都认；云厂商只认 Authorization。多带一个头无副作用。
    headers.Authorization = `Bearer ${provider.apiKey}`;
    headers['x-api-key'] = provider.apiKey;
  }
  const payload = buildOpenAiPayload(provider, b64, mimeOf(filePath), prompt);
  let result = await postJsonUrl(url, payload, provider.timeoutMs, headers);
  // jsonMode=auto：先按标准带 response_format，被拒就去掉再试一次（免费/自建网关常不支持）
  if (provider.jsonMode === 'auto' && payload.response_format && isResponseFormatRejected(result)) {
    delete payload.response_format;
    result = await postJsonUrl(url, payload, provider.timeoutMs, headers);
  }
  return result;
}

/** 把上游的 HTTP 状态翻译成业务可读的错误（两条通道口径不同） */
function assertVisionResponse(provider, result) {
  const status = result && result.status;
  const body = (result && result.body) || {};
  const bodyText = typeof body === 'string' ? body : JSON.stringify(body || {});
  const rawMsg = (body && body.error && (body.error.message || body.error.code))
    ? String(body.error.message || body.error.code)
    : bodyText;
  const short = String(rawMsg || '').slice(0, 300);

  if (provider.kind === 'openai') {
    if (status === 401 || status === 403) {
      throw new Error(`视觉网关鉴权失败（HTTP ${status}）：请检查 VISION_OPENAI_API_KEY 是否正确。${short}`);
    }
    if (status === 404) {
      throw new Error(`视觉网关端点或模型不存在（HTTP 404）：请检查 VISION_OPENAI_BASE_URL=${provider.baseUrl} 与 VISION_OPENAI_MODEL=${provider.model}。${short}`);
    }
    if (status === 429) {
      throw new Error(`视觉网关限流（HTTP 429），请稍后重试或调大 VISION_OPENAI_TIMEOUT_MS。${short}`);
    }
    if (status >= 400 && /image|vision|modal|multimodal|image_url/i.test(bodyText)) {
      throw new Error(`模型 ${provider.model} 不支持图像输入（HTTP ${status}）。${short}`);
    }
    if (status >= 400) {
      throw new Error(`视觉网关识别失败（HTTP ${status}）：${short}`);
    }
    if (body && body.error) {
      throw new Error(`视觉网关识别失败：${short}`);
    }
    return;
  }

  // ---- Ollama：保留改造前的原文案，避免既有排错手册失效 ----
  if (status === 404 && /model/i.test(bodyText)) {
    throw new Error(`AI 视觉模型不可用：请先执行「ollama pull ${provider.model}」下载后重试`);
  }
  if (status === 404) {
    throw new Error(`Ollama 视觉端点不可用（HTTP 404），请检查 OLLAMA_BASE_URL=${provider.baseUrl}`);
  }
  if (status === 500 && /model.*fallback|no.*vision|does not support/i.test(bodyText)) {
    throw new Error(`模型 ${provider.model} 不支持图像输入`);
  }
  if (status >= 400) {
    throw new Error(`Ollama 视觉识别失败（HTTP ${status}）：${short}`);
  }
  if (body && body.error) {
    throw new Error(`Ollama 视觉识别失败：${String(body.error)}`);
  }
}

/**
 * 发起一次 VL 识别并取回解析后的 JSON。
 * @param {Object} p
 * @param {string} p.filePath 本地图片绝对路径
 * @param {string} p.prompt   提示词
 * @param {string} [p.tag]    日志标记
 * @param {'local'|'dsh'|''} [p.provider] 本次调用的通道覆盖（缺省走 env 配置）
 * @param {string} [p.model] 本次调用的模型覆盖（仅 dsh 通道生效）
 * @returns {Promise<Object>} 解析后的 JSON 对象
 */
async function callVision({ filePath, prompt, tag = 'vision', provider: providerOverride = '', model = '' }) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('图片文件不存在');
  }
  const provider = resolveVisionProvider(providerOverride, { model });
  const b64 = fs.readFileSync(filePath, { encoding: 'base64' });

  let result;
  try {
    result = provider.kind === 'openai'
      ? await requestOpenAi(provider, b64, prompt, filePath)
      : await requestOllama(provider, b64, prompt);
  } catch (e) {
    throw new Error(`AI 视觉识别请求失败：${e.message}`);
  }
  assertVisionResponse(provider, result);

  const raw = extractText(result && result.body);
  const extracted = extractJson(raw);
  if (!extracted || !extracted.json || typeof extracted.json !== 'object') {
    // 服务端日志：把模型原始输出和截断预览落下来，便于排查
    console.error(`[visionService:${tag}] JSON 解析失败`, {
      provider: provider.kind,
      channel: provider.channel,
      model: provider.model,
      filePath,
      rawLen: raw.length,
      rawPreview: preview(raw, 300),
    });
    const empty = !raw || !raw.trim();
    const msg = empty
      ? 'AI 视觉识别结果为空，请确认图片清晰可读、或更换其他模型（当前模型：' + provider.model + '）后重试'
      : `AI 视觉识别结果无法解析为 JSON，请更换清晰、规整的培训台账照片后重试。模型原始输出：${preview(raw, 160)}`;
    throw new Error(msg);
  }
  return extracted.json;
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

// ---------------------------------------------------------------------------
// B. 签到表：模型原始输出 → 结构化统计行
// ---------------------------------------------------------------------------

const TRUE_SET = new Set([true, 'true', '1', 1, 'yes', 'y', '有', '已填', '填写']);

function toBool(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = String(v == null ? '' : v).trim().toLowerCase();
  return TRUE_SET.has(s);
}

function toInt(v, dflt = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : dflt;
}

/**
 * 由模型输出的 header / sign_rows 推导确定性统计值。
 * 计数全部在 JS 侧完成，不信任模型的算术结果。
 * @param {Object} raw 模型输出的一页对象
 * @param {number} pageNo 页码（1 基）
 */
function deriveSigninRow(raw, pageNo = 0) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const code = String(r.team_code || '').trim();
  const parsed = resolveTeamCode(code);

  // ---- 表头 6 项：空一项 → 资料不完整 +1 ----
  const header = (r.header && typeof r.header === 'object') ? r.header : {};
  let incomplete = 0;
  const emptyFields = [];
  for (const k of HEADER_FIELDS) {
    if (k in header && !toBool(header[k])) {
      incomplete += 1;
      emptyFields.push(HEADER_CN[k]);
    }
  }
  // 模型未逐项给出、但直接给了空项数时，回退使用其计数
  if (HEADER_FIELDS.every((k) => !(k in header)) && r.header_empty_count !== undefined) {
    incomplete = Math.max(0, toInt(r.header_empty_count, 0));
  }

  // ---- 人员表：逐行布尔 → 计数 ----
  const signRows = Array.isArray(r.sign_rows) ? r.sign_rows : [];
  let nameFilled = 0;   // 姓名格有字
  let signFilled = 0;   // 签名格有字
  let missingSign = 0;  // 有姓名但未签名 → 缺少签字人数
  let newcomer = 0;     // 姓名空但签了名 → 新入职（未上花名册）
  for (const it of signRows) {
    if (!it || typeof it !== 'object') continue;
    const hasName = toBool(it.name);
    const hasSign = toBool(it.sign);
    if (hasName) nameFilled += 1;
    if (hasSign) signFilled += 1;
    if (hasName && !hasSign) missingSign += 1;
    if (!hasName && hasSign) newcomer += 1;
  }
  // 模型未给逐行明细时，使用其自报计数，并按「姓名/签名计数交叉核对」做越界校正
  if (signRows.length === 0) {
    // 应到人数优先取「姓名列已填行数」，缺失时用表格总行数兜底
    nameFilled = toInt(r.name_count, 0) || toInt(r.row_total, 0);
    signFilled = toInt(r.signature_count, 0);
    newcomer = toInt(r.newcomer_count, 0);
    // missing = 姓名已填 - 签名已填 + 新员工（姓名空但签了名）
    const derived = Math.max(0, nameFilled - signFilled + newcomer);
    const reported = r.missing_signature_count !== undefined
      ? toInt(r.missing_signature_count, 0)
      : null;
    // 自报值越界（负数或超过应到人数）时，以交叉核对结果为准
    missingSign = reported === null || reported < 0 || (nameFilled > 0 && reported > nameFilled)
      ? derived
      : reported;
  }

  const manager = String(r.manager || '').trim();

  return {
    page_no: Number(pageNo) || 0,
    team_code: parsed.code,
    town: parsed.town,
    dept: parsed.unitName,
    trainer: manager,            // 培训人（乡镇作业中心经理），对应月度台账 trainer_name
    trainee_role: parsed.traineeRole,
    expected_count: nameFilled,  // 应到 = 姓名已填行数
    actual_count: signFilled,    // 实到 = 签名已填行数
    missing_signature_count: missingSign,  // 「缺少签字人数」→ 列表「缺少」
    incomplete_material_count: incomplete, // 「资料不完整」→ 列表「资料不完整」
    newcomer_count: newcomer,
    missing_fields: emptyFields.join('、'),
  };
}

/**
 * 退化结果判定：模型承认这是签到表，但既没读出班组编号、所有计数也都是 0。
 * 7B VL 模型偶发「看得见表但什么都不填」，这类输出不可信，需要重跑。
 * @param {Object|null} row deriveSigninRow 的产物
 */
function isDegenerateRow(row) {
  if (!row) return true;
  const noCode = !String(row.team_code || '').trim();
  const noCount = !row.expected_count && !row.actual_count
    && !row.missing_signature_count && !row.incomplete_material_count;
  // 既没编号又全 0 计数 = 模型「看得见表但什么都没填」，必须重跑
  return noCode && noCount;
}

/**
 * 解析花名册文本（形如「大曹镇：宋长城、孙建栋、周福贵」）为 乡镇→经理姓名[] 索引。
 * @param {string} rosterText
 * @returns {Map<string, string[]>}
 */
function buildRosterIndex(rosterText) {
  const map = new Map();
  String(rosterText || '').split(/\r?\n/).forEach((line) => {
    const m = line.match(/^([^：:]+)[：:](.+)$/);
    if (!m) return;
    const town = m[1].trim();
    const names = m[2].split(/[、,，/|]/).map((s) => s.trim()).filter(Boolean);
    if (town && names.length) map.set(town, names);
  });
  return map;
}

/**
 * 用「班组编号推导出的乡镇」反向校验模型挑出的经理姓名。
 * 模型经常从名单里挑错人（例：把杜集镇的张卫新安到大曹镇的 DC-03 上），
 * 宁可留空让人工补，也不能把错误培训人写进月度台账。
 * 若该乡镇只有一位经理，则直接确定（消歧）。
 */
function reconcileManager(row, rosterIndex) {
  if (!row || !rosterIndex || rosterIndex.size === 0) return row;
  const names = row.town ? rosterIndex.get(row.town) : null;
  if (!names || names.length === 0) return row;
  if (row.trainer && !names.includes(row.trainer)) {
    console.warn(`[vision.signin] 第 ${row.page_no} 页经理「${row.trainer}」不属于${row.town}，已置空待人工补全`);
    row.trainer = '';
  }
  if (!row.trainer && names.length === 1) row.trainer = names[0];
  return row;
}

/**
 * 批次级经理补全。同一份 PDF 通常是同一位乡镇作业中心经理的整套台账，
 * 逐页识别时总有几页读不出经理姓名（签名潦草/印刷不清）。
 * 若某乡镇在本批次中只出现**一位**有效经理，则用他补全同乡镇的空缺页，
 * 避免用户逐页手填。出现两位及以上则说明无法消歧，保持空缺由用户判断。
 *
 * @param {Object[]} rows recognizeSigninSheet 逐页产出的行（会被就地修改）
 * @returns {Object[]} 同一数组
 */
function reconcileBatchManagers(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  const byTown = new Map();
  for (const r of rows) {
    if (!r || !r.town || !r.trainer) continue;
    if (!byTown.has(r.town)) byTown.set(r.town, new Set());
    byTown.get(r.town).add(r.trainer);
  }
  for (const r of rows) {
    if (!r || r.trainer || !r.town) continue;
    const names = byTown.get(r.town);
    if (names && names.size === 1) r.trainer = [...names][0];
  }
  return rows;
}

/**
 * 弱结果：重跑也不值得再等，但数据不足以直接入库 —— 缺班组编号（无法定位乡镇/培训人）
 * 或应到人数为 0（人员表没读出来）。这类页会在界面上被标出，要求人工核对。
 */
function isWeakRow(row) {
  if (!row) return true;
  return !String(row.team_code || '').trim() || !Number(row.expected_count);
}

/**
 * 识别一页「培训会议签到表」的填写完整性。
 * 只判断单元格填/空并计数，不做文字识别；照片页/无关页直接跳过。
 * 对「退化输出」（识别出是签到表但内容全空）自动重跑，最多 AI_SIGNIN_RETRY 次。
 *
 * @param {Object} p
 * @param {string} p.filePath   页图绝对路径
 * @param {string} [p.rosterText] 乡镇→经理名单（闭集）
 * @param {number} [p.pageNo]   页码（1 基）
 * @param {'local'|'dsh'|''} [p.provider] 本次调用的通道覆盖
 * @param {string} [p.model] 模型覆盖（仅 dsh）
 * @param {string} [p.extraPrompt] 用户附加要求（追加到系统提示词，不改变 JSON 约束）
 * @returns {Promise<{ row: Object|null, skipped: boolean, reason: string, weak: boolean, attempts: number }>}
 */
async function recognizeSigninSheet({ filePath, rosterText = '', pageNo = 0, provider = '', model = '', extraPrompt = '' }) {
  const prompt = buildSigninPrompt(rosterText, extraPrompt);
  const rosterIndex = buildRosterIndex(rosterText);
  let last = { row: null, skipped: true, reason: 'other', weak: true, attempts: 0 };
  const maxAttempts = AI_SIGNIN_RETRY + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const json = await callVision({ filePath, prompt, tag: 'signin', provider, model });
    const rows = Array.isArray(json.rows) ? json.rows : [];
    const first = rows.find((x) => x && typeof x === 'object') || null;

    // 跳过判定：rows 为空，或首行显式声明不是签到表
    const isSignin = first ? first.is_signin_sheet !== false : (json.is_signin_sheet !== false);
    if (!first || !isSignin) {
      const reason = String((first && first.skip_reason) || json.skip_reason || 'other');
      // 「不是签到表」是稳定判断（照片/空白页），无需重试
      return { row: null, skipped: true, reason, weak: false, attempts: attempt };
    }

    const row = reconcileManager(deriveSigninRow(first, pageNo), rosterIndex);
    if (!isDegenerateRow(row)) {
      return { row, skipped: false, reason: '', weak: isWeakRow(row), attempts: attempt };
    }
    last = { row, skipped: false, reason: '', weak: true, attempts: attempt };
    console.warn(`[vision.signin] 第 ${pageNo} 页第 ${attempt} 次识别为退化输出，准备重跑`);
  }

  return last;
}

/**
 * 识别图片中的培训台账（通用文字识别通道）
 * @param {Object} params
 * @param {string} params.filePath - 已上传到本机的图片文件绝对路径（png/jpg/jpeg/bmp/webp）
 * @param {'local'|'dsh'|''} [params.provider] - 本次调用的通道覆盖
 * @param {string} [params.model] - 模型覆盖（仅 dsh）
 * @param {string} [params.extraPrompt] - 用户附加要求
 * @returns {Promise<{ rows: Object[] }>}
 * @throws 当视觉通道不可达 / 模型缺失 / 输出无法解析时抛出带清晰提示的 Error
 */
async function recognizeLedgerImage({ filePath, provider = '', model = '', extraPrompt = '' }) {
  const json = await callVision({
    filePath,
    prompt: buildLedgerPrompt(extraPrompt),
    tag: 'ledger',
    provider,
    model,
  });
  const rows = Array.isArray(json.rows) ? json.rows : [];
  return { rows: normalizeRows(rows) };
}

// ---------------------------------------------------------------------------
// 通道健康探测（给前端「DSH 识别」开关做状态灯，永不抛错）
// ---------------------------------------------------------------------------

/** 轻量 GET，返回 { ok, status, body } 或 { ok:false, detail } */
function httpGetJson(fullUrl, headers = {}, timeoutMs = 2500) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    let urlObj;
    try {
      urlObj = new URL(fullUrl);
    } catch (e) {
      return done({ ok: false, detail: 'URL 非法' });
    }
    const lib = urlObj.protocol === 'https:' ? require('https') : require('http');
    const req = lib.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers,
        timeout: timeoutMs,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          let body = data;
          try { body = JSON.parse(data); } catch (e) { /* 保留原文 */ }
          done({ ok: res.statusCode < 400, status: res.statusCode, body });
        });
      },
    );
    req.on('timeout', () => { req.destroy(); done({ ok: false, detail: `超时（${timeoutMs}ms）` }); });
    req.on('error', (err) => done({ ok: false, detail: err.code || err.message }));
    req.end();
  });
}

let _probeCache = { at: 0, value: null };
const PROBE_TTL_MS = 10 * 1000;

/**
 * 探测本地 Ollama 与 DSH 网关是否可用（结果缓存 10s）。
 * @returns {Promise<{local:Object, dsh:Object}>}
 */
async function probeVisionProviders() {
  if (_probeCache.value && Date.now() - _probeCache.at < PROBE_TTL_MS) return _probeCache.value;

  const local = ollamaProvider();
  const dsh = dshProvider();

  const localUrl = `${local.baseUrl.replace(/\/+$/, '')}/api/tags`;
  let dshModelsUrl = '';
  try {
    dshModelsUrl = openAiChatUrl(dsh.baseUrl).replace(/\/chat\/completions$/, '/models');
  } catch (e) {
    dshModelsUrl = '';
  }
  const dshHeaders = {};
  if (dsh.apiKey) {
    dshHeaders.Authorization = `Bearer ${dsh.apiKey}`;
    dshHeaders['x-api-key'] = dsh.apiKey;
  }

  const [l, d] = await Promise.all([
    httpGetJson(localUrl, {}),
    dshModelsUrl ? httpGetJson(dshModelsUrl, dshHeaders) : Promise.resolve({ ok: false, detail: '地址非法' }),
  ]);

  const localModels = l.ok && l.body && Array.isArray(l.body.models)
    ? l.body.models.map((m) => m && m.name).filter(Boolean)
    : [];
  const dshModels = d.ok && d.body && Array.isArray(d.body.data)
    ? d.body.data.map((m) => m && m.id).filter(Boolean)
    : [];
  // EAC 渠道的可用性由插件自己记在 availability.json；kilo 渠道不在里面 → available=null（未知）
  const availability = readDshAvailability();

  const value = {
    local: {
      provider: 'local',
      channel: local.channel,
      model: local.model,
      baseUrl: local.baseUrl,
      ok: !!l.ok,
      hasModel: l.ok ? localModels.includes(local.model) : false,
      detail: l.ok ? '' : String(l.detail || `HTTP ${l.status || '?'}`),
    },
    dsh: {
      provider: 'dsh',
      channel: dsh.channel,
      model: dsh.model,
      baseUrl: dsh.baseUrl,
      ok: !!d.ok,
      hasModel: d.ok ? dshModels.includes(dsh.model) : false,
      hasKey: !!dsh.apiKey,
      detail: d.ok
        ? ''
        : (dsh.apiKey ? String(d.detail || `HTTP ${d.status || '?'}`) : '未找到 DSH 网关 key（检查 dsh 是否已开启本地网关）'),
      /** 下拉框数据源：白名单模型 + 网关是否真的暴露 + EAC 可用性 */
      models: listDshVisionModels().map((m) => {
        const av = availability[m.id];
        return {
          ...m,
          present: dshModels.includes(m.id),
          available: av ? av.state === 'available' : null,
        };
      }),
    },
  };
  _probeCache = { at: Date.now(), value };
  return value;
}

module.exports = {
  recognizeLedgerImage,
  recognizeSigninSheet,
  deriveSigninRow,
  buildRosterIndex,
  reconcileManager,
  reconcileBatchManagers,
  buildSigninPrompt,
  VL_MODEL,
  normalizeRows,
  // 传输通道（CF-WPS-VISION-01/02，2026-10-19）
  resolveVisionProvider,
  visionProviderMeta,
  probeVisionProviders,
  listDshVisionModels,
  isDshVisionModel,
  appendUserPrompt,
  buildLedgerPrompt,
  openAiChatUrl,
  buildOpenAiPayload,
  mimeOf,
  extractText,
  extractJson,
};

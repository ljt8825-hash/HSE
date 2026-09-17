/**
 * 培训台账 OCR（/api/training-ocr）—— service 层
 * PDF / 图片识别 → Excel / 入库；业务 + 子进程 OCR + Excel 生成全在此。
 *
 * 描述符语义（__t:'json'）：
 *  - ok(payload, message)                 → res.json(success(payload, message))，或由 controller 处理二进制 payload
 *  - err(code, message)                   → res.json(error(code, message))（HTTP 200）
 * 未捕获异常：外抛 → controller 兜底 res.json(error(-1, err.message))。
 *
 * 安全注：本域全部为写/导入能力，路由层统一 requireRole('admin','safety_manager') 保护，
 * 鉴权不入 service。
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const multer = require('multer');
const XLSX = require('xlsx');

const { pool, isConnected } = require('../config/db');
const {
  resolveTrainingPersonId, resolveTrainingPersonName, computeMonthRange,
} = require('./trainingShared');
const { SigninAttribution } = require('./signinAttribution');
const {
  recognizeLedgerImage, recognizeSigninSheet, reconcileBatchManagers, VL_MODEL,
} = require('./ai/visionService');

const ok = (payload, message) => ({ __t: 'json', payload, message });
const err = (code, message) => ({ __t: 'json', error: { code, message } });

// ---------- Python 解释器解析 ----------
function resolvePythonPath() {
  if (process.env.PYTHON_PATH && fs.existsSync(process.env.PYTHON_PATH)) {
    return process.env.PYTHON_PATH;
  }
  // 回退：读取 server/.env 中的 PYTHON_PATH
  try {
    const envFile = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
    const m = envFile.match(/^PYTHON_PATH\s*=\s*(.+)$/m);
    if (m) {
      const p = m[1].trim().replace(/^["']|["']$/g, '');
      if (fs.existsSync(p)) return p;
    }
  } catch (e) { /* 忽略 */ }
  return 'python';
}

const OCR_SCRIPT = path.join(__dirname, '../../scripts/ocr_ledger.py');
const SIGNIN_OCR_SCRIPT = path.join(__dirname, '../../scripts/training_signin_ocr.py');
const PDF_RENDER_SCRIPT = path.join(__dirname, '../../scripts/pdf_render_png.py');
// 签到表合集常达十余页；缺省放宽到 20 页（前端超时 40min 足够），可用环境变量收紧/放开
const AI_PDF_MAX_PAGES = Number(process.env.AI_PDF_MAX_PAGES) || 20;

// 花名册匹配/归属服务（懒加载单例，加载全量在册员工）
let _attribution = null;
async function getAttribution() {
  if (!_attribution) {
    _attribution = new SigninAttribution(pool);
    await _attribution.load();
  }
  return _attribution;
}

// ---------- 上传（PDF / 图片） ----------
const _tmpDir = path.join(os.tmpdir(), 'hse-training-ocr');
if (!fs.existsSync(_tmpDir)) fs.mkdirSync(_tmpDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Temp 目录可能被系统清理（模块加载时创建的 mkdir 不重建），每次上传前兜底重建
    try {
      if (!fs.existsSync(_tmpDir)) fs.mkdirSync(_tmpDir, { recursive: true });
      cb(null, _tmpDir);
    } catch (e) {
      cb(e);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.img';
    cb(null, `${Date.now()}_${Math.round(Math.random() * 1e6)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } });

function isSupported(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ['.pdf', '.png', '.jpg', '.jpeg', '.bmp', '.webp'].includes(ext);
}

function runOcr(filePath, scriptPath = OCR_SCRIPT, extraEnv = {}) {
  const py = resolvePythonPath();
  return new Promise((resolve, reject) => {
    const child = spawn(py, [scriptPath, filePath], {
      windowsHide: true,
      env: { ...process.env, ...extraEnv },
    });
    let stdout = '';
    let stderr = '';
    // 子进程总超时保护：脚本内部有 OCR_SCAN_BUDGET(默认1800s) 兜底，这里再加一层保险，
    // 防止极端情况下 tesseract 挂起导致后端进程泄漏。前端请求超时(40min)需大于此值。
    const timeoutMs = Number(process.env.OCR_TIMEOUT_MS) || 45 * 60 * 1000;
    const timer = setTimeout(() => {
      try { child.kill(); } catch (e) { /* 忽略 */ }
      reject(new Error(`OCR 识别超时（超过 ${Math.round(timeoutMs / 60000)} 分钟），请重试或改用 Excel 模板`));
    }, timeoutMs);
    const clearTimer = () => clearTimeout(timer);
    child.stdout.on('data', (d) => (stdout += d.toString('utf8')));
    child.stderr.on('data', (d) => (stderr += d.toString('utf8')));
    child.on('error', (err) => { clearTimer(); reject(err); });
    child.on('close', (code) => {
      clearTimer();
      if (code !== 0) {
        return reject(new Error(`OCR 脚本失败(code=${code}): ${stderr.trim()}`));
      }
      // 兼容 stdout 前带 Python 第三方库打印的警告/日志，提取其中 JSON 对象
      const s = stdout;
      const start = s.indexOf('{');
      const end = s.lastIndexOf('}');
      if (start === -1 || end === -1 || end <= start) {
        return reject(new Error(`OCR 输出解析失败: ${s.slice(0, 500)}`));
      }
      try {
        const data = JSON.parse(s.slice(start, end + 1));
        resolve(data);
      } catch (e) {
        reject(new Error(`OCR 输出解析失败: ${s.slice(0, 500)}`));
      }
    });
  });
}

// ---------- Excel 列展示映射 ----------
const FIELD_LABELS = {
  name: '姓名',
  id_card: '身份证号',
  dept: '部门',
  position: '岗位',
  grid_level: '网格级别',
  frequency: '培训频次',
  training_type: '培训类型',
  training_date: '培训日期',
  duration_minutes: '时长(分钟)',
  content: '培训内容',
  result: '培训结果',
  score: '成绩',
  trainer: '培训人',
  remark: '备注',
  // —— 签到表「填写完整性检查」专用字段（AI 识图输出，映射到月度培训台账两列）——
  page_no: '页码',
  team_code: '班组编号',
  town: '乡镇',
  dept: '部门/班组',
  trainee_role: '培训对象',
  expected_count: '应到人数',
  actual_count: '实到人数',
  missing_signature_count: '缺少签字人数',
  incomplete_material_count: '资料不完整',
  newcomer_count: '新入职',
  missing_fields: '空缺表头项',
};

// ---------- 1. 识别 ----------
async function recognize(req) {
  try {
    // 注：multer 已由路由层 upload.single('file') 提前处理，req.file 已就绪
    const tmp = req.file ? path.join(_tmpDir, req.file.filename) : null;
    try {
      if (!req.file) return err(-2, '未接收到文件');
      const originalName = (req.file.originalname || '').replace(/\.(pdf|png|jpe?g|bmp|webp)$/i, '');
      if (!isSupported(tmp)) return err(-3, '仅支持 PDF / PNG / JPG / BMP / WebP 文件');

      // 先探测：是否为「培训会议签到表」扫描合集（前 2 页快速判定）
      let probe = null;
      try {
        probe = await runOcr(tmp, SIGNIN_OCR_SCRIPT, { SIGNIN_PROBE: '1' });
      } catch (e) { probe = null; }

      if (probe && probe.ok && probe.mode === 'signin_probe' && probe.isSignin) {
        // 签到表合集：全量识别 → 花名册匹配/归属/计数
        const result = await runOcr(tmp, SIGNIN_OCR_SCRIPT);
        if (!result || result.ok !== true) {
          return err(-4, (result && result.message) || '识别失败');
        }
        const attr = await getAttribution();
        const sessions = (result.sessions || [])
          .filter((s) => s.kind === 'team' || s.kind === 'company')
          .map((s) => {
            const built = attr.buildSession(s);
            built.trainingDate = normalizeDate(built.trainingDateText);
            if (built.kind === 'company') {
              // 公司级表无印刷应到名单（序号|签名|备注）：应到按实签计、缺少恒 0，
              // 不纳入乡镇/班组统计、不做人员比对（签名者非"新入职"语义），仅保留头部完整性检查
              built.expectedCount = built.actualCount;
              built.missingCount = 0;
              built.untrainedCount = 0;
              built.groups = { onPostUntrained: [], resignedUntrained: [], unknownUntrained: [], newcomers: [] };
              built.people = [];
            }
            return built;
          });
        const m = result.meta || {};
        return ok({
          mode: 'signin_ledger',
          sessions,
          message: `识别到 ${sessions.length} 场培训（跳过照片/非表格页 ${m.photoPages || 0} 页`
            + `${m.unknownPages ? `，未识别 ${m.unknownPages} 页` : ''}）`,
          sourceName: originalName,
          meta: m,
        }, '识别成功，请核对场次预览');
      }

      // 普通培训台账：走通用 OCR 脚本
      const result = await runOcr(tmp);
      if (!result || result.ok !== true) {
        return err(-4, (result && result.message) || '识别失败');
      }
      return ok({
        sourceType: result.sourceType,
        mode: result.mode || 'record',
        columns: result.columns || [],
        rows: result.rows || [],
        signin: result.signin || null,
        message: result.message || `识别到 ${(result.rows || []).length} 行`,
        sourceName: originalName,
        meta: result.meta || null,
      }, '识别成功，请核对预览');
    } finally {
      if (tmp && fs.existsSync(tmp)) {
        try { fs.unlinkSync(tmp); } catch (e) { /* 忽略 */ }
      }
    }
  } catch (e) {
    return err(-1, `OCR 识别失败: ${e.message}`);
  }
}

// ---------- 1.5 AI 识图（本地 Ollama 视觉大模型识别培训台账照片） ----------
// 独立入口，与上面的传统 OCR 互不影响：上传图片 → 交给 qwen2.5vl → 结构化行。
// 行字段为 snake_case（同 OCR 口径），columns 用中文标题，前端 buildOcrPreview 复用。
const AI_IMG_EXTS = ['.png', '.jpg', '.jpeg', '.bmp', '.webp'];
const AI_FIELD_ORDER = [
  'name', 'id_card', 'dept', 'position', 'grid_level', 'frequency', 'training_type',
  'training_date', 'duration_minutes', 'content', 'score', 'result', 'trainer', 'remark',
];
function hasValueInRows(rows, key) {
  return rows.some((r) => {
    const v = r[key];
    return typeof v === 'number' ? v !== 0 && !Number.isNaN(v) : String(v == null ? '' : v).trim() !== '';
  });
}
function buildAiColumns(rows) {
  const cols = [];
  for (const f of AI_FIELD_ORDER) {
    if (hasValueInRows(rows, f)) cols.push(FIELD_LABELS[f] || f);
  }
  // 模型额外输出的未知字段（后端无中文标签）仍透出，避免信息丢失
  const known = new Set(AI_FIELD_ORDER);
  for (const k of Object.keys(rows[0] || {})) {
    if (!known.has(k) && !cols.includes(k) && hasValueInRows(rows, k)) cols.push(k);
  }
  return cols;
}

// 签到表「填写完整性检查」列序：核心统计列**恒定展示**（即使为 0，业务需要看到「0 缺失」）
const AI_SIGNIN_FIELD_ORDER = [
  'page_no', 'team_code', 'town', 'dept', 'trainer', 'trainee_role',
  'expected_count', 'actual_count', 'missing_signature_count',
  'incomplete_material_count', 'newcomer_count', 'missing_fields',
];
// 任何情况下都要透出的列（缺了就无法与「培训记录」列表的缺少/资料不完整对齐）
const AI_SIGNIN_ALWAYS = [
  'team_code', 'trainer', 'missing_signature_count', 'incomplete_material_count',
];
function buildSigninColumns(rows) {
  const cols = [];
  for (const f of AI_SIGNIN_FIELD_ORDER) {
    if (AI_SIGNIN_ALWAYS.includes(f) || hasValueInRows(rows, f)) {
      cols.push(FIELD_LABELS[f] || f);
    }
  }
  return cols;
}

// ---------- 乡镇作业中心经理花名册（注入提示词的闭集名单） ----------
// 在职口径以「花名册·用工关系状态」为权威，与 employeeService / 考核资格口径一致：
//   在职 = employment_relation = '正式员工'；离职 = IN ('辞职','死亡')
// 必须排除辞职/死亡人员，否则模型会从闭集名单里挑到已离职的经理。
const ACTIVE_EMPLOYEE_SQL = `is_deleted = false AND employment_relation = '正式员工'`;

async function loadTownManagers() {
  if (!isConnected()) return [];
  try {
    const r = await pool.query(`
      SELECT name, roster_department
        FROM employee
       WHERE ${ACTIVE_EMPLOYEE_SQL}
         AND roster_position IN ('人工片区长', '乡镇作业中心经理')
         AND roster_department LIKE '%乡镇作业中心'
       ORDER BY roster_department, name`);
    const byTown = new Map();
    for (const row of r.rows) {
      const town = String(row.roster_department || '').replace(/乡镇作业中心\s*$/, '').trim();
      const name = String(row.name || '').trim();
      if (!town || !name) continue;
      if (!byTown.has(town)) byTown.set(town, []);
      const list = byTown.get(town);
      if (!list.includes(name)) list.push(name);
    }
    return [...byTown.entries()].map(([town, names]) => ({ town, names }));
  } catch (e) {
    console.warn('[trainingOcr] 读取乡镇经理花名册失败：', e.message);
    return [];
  }
}

function formatRoster(list) {
  if (!Array.isArray(list) || list.length === 0) return '';
  return list.map((x) => `${x.town}：${x.names.join('、')}`).join('\n');
}
/** 读取 server/.env 中的某个键（进程环境变量优先，其次文件） */
function readEnvValue(key) {
  const fromProc = process.env[key];
  if (fromProc && String(fromProc).trim()) return String(fromProc).trim();
  try {
    const envFile = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
    const m = envFile.match(new RegExp(`^${key}\\s*=\\s*(.+)$`, 'm'));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  } catch (e) { /* 忽略 */ }
  return '';
}

/**
 * 枚举可用于渲染 PDF 的 Python 解释器。
 * 痛点：PyMuPDF(fitz) 只装在某一个解释器上（本机会话里是系统 Python 3.10），
 * 而 PYTHON_PATH / PATH 上的 python 可能是另一个没装 fitz 的版本，导致渲染必失败。
 * 这里把「环境变量指定 → 命令名 → 常见安装目录扫描」全部列为候选，
 * renderPdfPages 会依次尝试（脚本在 fitz 缺失时以 code=2 退出），直到某个能跑通。
 */
function listRenderPythonCandidates() {
  const seen = new Set();
  const push = (p) => {
    if (!p) return;
    const s = String(p).trim();
    if (!s || seen.has(s)) return;
    if (path.isAbsolute(s) && !fs.existsSync(s)) return;
    seen.add(s);
  };

  push(readEnvValue('PDF_RENDER_PYTHON'));
  push(readEnvValue('PYTHON_PATH'));
  push('python');
  push('python3');

  // 常见安装目录扫描（Windows / 托管运行时）
  const home = os.homedir();
  const roots = [
    path.join(home, 'AppData/Local/Programs/Python'),
    path.join(home, '.workbuddy-ai/binaries/python/versions'),
    path.join(home, 'anaconda3'),
    path.join(home, 'miniconda3'),
    'C:/ProgramData/Anaconda3',
    'C:/ProgramData/miniconda3',
    'C:/Python313', 'C:/Python312', 'C:/Python311', 'C:/Python310', 'C:/Python39',
  ];
  for (const root of roots) {
    try {
      const exe = path.join(root, 'python.exe');
      if (fs.existsSync(exe)) push(exe);
      if (!fs.existsSync(root)) continue;
      const entries = fs.readdirSync(root, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        const p = path.join(root, e.name, 'python.exe');
        if (fs.existsSync(p)) push(p);
      }
    } catch (e) { /* 忽略无权限/不存在的目录 */ }
  }
  return [...seen];
}

async function renderPdfPages(pdfPath) {
  const candidates = listRenderPythonCandidates();

  const outDir = path.join(os.tmpdir(), `hse-ai-pdf-${Date.now()}`);
  fs.mkdirSync(outDir, { recursive: true });

  const run = (py) => new Promise((resolve, reject) => {
    const child = spawn(py, [PDF_RENDER_SCRIPT, pdfPath, outDir], { windowsHide: true });
    let out = '';
    let errOut = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { errOut += d; });
    child.on('error', (e) => reject(e));
    child.on('close', (code) => {
      if (code === 0) {
        try {
          const j = JSON.parse(out.trim().split('\n').pop());
          if (j.error) return reject(new Error(j.error));
          resolve(j.pages || []);
        } catch (e) {
          reject(new Error('PDF 渲染输出解析失败'));
        }
      } else {
        reject(new Error(`PDF 渲染失败(code=${code}): ${errOut.trim().slice(0, 200) || 'PyMuPDF 缺失或运行异常'}`));
      }
    });
  });

  const failures = [];
  for (let i = 0; i < candidates.length; i += 1) {
    const py = candidates[i];
    try {
      const pages = await run(py);
      if (i > 0) {
        console.warn(`[trainingOcr] PDF 渲染已回退到解释器：${py}（前 ${i} 个候选不可用）`);
      }
      return { pages, outDir };
    } catch (e) {
      failures.push(`${py} → ${e.message}`);
    }
  }
  try { fs.rmSync(outDir, { recursive: true, force: true }); } catch (e) { /* 忽略 */ }
  throw new Error(
    `PDF 渲染失败：已尝试 ${candidates.length} 个 Python 解释器均不可用（多为缺少 PyMuPDF）。`
    + `请执行「pip install pymupdf」或设置 PDF_RENDER_PYTHON 指向已安装 PyMuPDF 的解释器。`
    + `明细：${failures.slice(0, 3).join(' | ')}`,
  );
}

async function aiRecognize(req) {
  const tmp = req.file ? path.join(_tmpDir, req.file.filename) : null;
  let pdfDir = null;
  try {
    if (!req.file) return err(-2, '未接收到文件');
    const originalName = (req.file.originalname || '').replace(/\.[^.]+$/, '');
    const ext = path.extname(tmp).toLowerCase();
    // mode: auto(默认，先按签到表试，识别不到再回退通用台账) | signin(强制签到表) | ledger(强制通用台账)
    const mode = String((req.body && req.body.mode) || 'auto').toLowerCase();

    // 统一成「页图 + 页码」列表
    let images = [];
    let totalPages = 0;
    if (ext === '.pdf') {
      const { pages, outDir } = await renderPdfPages(tmp);
      pdfDir = outDir;
      totalPages = pages.length;
      images = pages.slice(0, AI_PDF_MAX_PAGES).map((p, i) => ({ path: p, pageNo: i + 1 }));
    } else if (AI_IMG_EXTS.includes(ext)) {
      totalPages = 1;
      images = [{ path: tmp, pageNo: 1 }];
    } else {
      return err(-5, 'AI 识图仅支持图片文件（PNG / JPG / BMP / WebP）或 PDF');
    }

    let rows = [];
    let usedMode = 'ledger';
    let skipped = 0;
    const skipReasons = { photo: 0, blank: 0, other: 0 };

    // ---- 通道 B：签到表「填写完整性检查」 ----
    if (mode === 'auto' || mode === 'signin') {
      const rosterText = formatRoster(await loadTownManagers());
      const signinRows = [];
      const weakPages = [];
      for (const img of images) {
        // eslint-disable-next-line no-await-in-loop
        const r = await recognizeSigninSheet({
          filePath: img.path,
          rosterText,
          pageNo: img.pageNo,
        });
        if (r.skipped) {
          skipped += 1;
          if (Object.prototype.hasOwnProperty.call(skipReasons, r.reason)) skipReasons[r.reason] += 1;
          else skipReasons.other += 1;
          continue;
        }
        // 重跑后仍为空的页：保留行但标记为待人工核对
        if (r.weak) weakPages.push(Number(img.pageNo) || 0);
        signinRows.push(r.row);
      }
      // 批次级补全：同乡镇只出现一位有效经理时，补上其余页的空缺经理
      reconcileBatchManagers(signinRows);
      if (signinRows.length > 0 || mode === 'signin') {
        usedMode = 'signin';
        rows = signinRows;
      }
    }

    // ---- 通道 A：通用培训台账文字识别（auto 模式下签到表未命中才回退） ----
    if (usedMode !== 'signin') {
      for (const img of images) {
        // eslint-disable-next-line no-await-in-loop
        const r = await recognizeLedgerImage({ filePath: img.path });
        rows.push(...(r.rows || []));
      }
    }

    const tailPages = Math.max(0, totalPages - images.length);
    const skipDesc = [
      skipReasons.photo ? `照片 ${skipReasons.photo} 页` : '',
      skipReasons.blank ? `空白 ${skipReasons.blank} 页` : '',
      skipReasons.other ? `其它 ${skipReasons.other} 页` : '',
    ].filter(Boolean).join('、');
    const weakDesc = weakPages.length ? `第 ${weakPages.join('、')} 页未读出内容，请人工核对` : '';

    if (usedMode === 'signin') {
      return ok(
        {
          sourceType: 'ai_image',
          mode: 'ai_signin',
          columns: buildSigninColumns(rows),
          rows,
          message: rows.length
            ? `AI 识别到 ${rows.length} 张签到表${skipped ? `（跳过 ${skipDesc}）` : ''}${weakDesc ? `；${weakDesc}` : ''}`
            : `AI 未识别到签到表${skipped ? `（跳过 ${skipDesc}）` : ''}`,
          sourceName: originalName,
          meta: {
            model: VL_MODEL,
            channel: 'ollama-vl',
            mode: 'signin',
            totalPages,
            scannedPages: images.length,
            skippedPages: skipped,
            skipReasons,
            weakPages,
            tailPages,
          },
        },
        rows.length
          ? (weakDesc ? `AI 识别成功，但${weakDesc}` : 'AI 识别成功，请核对「缺少签字人数 / 资料不完整」')
          : 'AI 识图完成，但未识别到签到表',
      );
    }

    return ok(
      {
        sourceType: 'ai_image',
        mode: 'record',
        columns: buildAiColumns(rows),
        rows,
        message: rows.length
          ? `AI 识别到 ${rows.length} 行${tailPages ? `（仅处理前 ${AI_PDF_MAX_PAGES} 页，跳过 ${tailPages} 页）` : ''}`
          : 'AI 未能识别到有效培训记录',
        sourceName: originalName,
        meta: { model: VL_MODEL, channel: 'ollama-vl', mode: 'ledger', totalPages, tailPages },
      },
      rows.length ? 'AI 识别成功，请核对预览' : 'AI 识图完成，但未识别到有效培训记录',
    );
  } catch (e) {
    return err(-6, `AI 识图失败: ${e.message}`);
  } finally {
    if (tmp && fs.existsSync(tmp)) {
      try { fs.unlinkSync(tmp); } catch (e) { /* 忽略 */ }
    }
    if (pdfDir && fs.existsSync(pdfDir)) {
      try { fs.rmSync(pdfDir, { recursive: true, force: true }); } catch (e) { /* 忽略 */ }
    }
  }
}

// ---------- Excel 列展示映射（导出用） ----------
function parseJsonParam(raw) {
  if (raw === undefined || raw === null) return undefined;
  try {
    return JSON.parse(Buffer.from(String(raw), 'base64').toString('utf8'));
  } catch (e) {
    return undefined;
  }
}

// ---------- 2. 导出 Excel（GET，rows/columns 以 JSON 字符串经 query 传入） ----------
// 成功返回 { __t:'json', payload:{ buffer, finalName } }，由 controller 渲染二进制
async function exportExcel(query) {
  try {
    let rows = parseJsonParam(query.rows) || [];
    const columns = parseJsonParam(query.columns) || [];
    const sourceName = query.sourceName || '';
    const fileName = query.fileName || '';
    if (!Array.isArray(rows) || rows.length === 0) {
      return err(-2, '没有可导出的数据');
    }

    // 表头：优先用 columns（中文标签），否则用字段映射
    const colDefs = [];
    if (Array.isArray(columns) && columns.length > 0) {
      for (const c of columns) colDefs.push({ label: String(c), field: null });
    }
    // 若 columns 为空，从行数据的键推断
    if (colDefs.length === 0) {
      const keys = Object.keys(rows[0] || {});
      for (const k of keys) colDefs.push({ label: FIELD_LABELS[k] || k, field: k });
    } else {
      // 用 columns 时,尝试把已知字段标签映射回对应行键
      const labelToField = {};
      for (const k of Object.keys(FIELD_LABELS)) labelToField[FIELD_LABELS[k]] = k;
      for (const cd of colDefs) {
        if (labelToField[cd.label]) cd.field = labelToField[cd.label];
      }
    }

    const sheetData = [colDefs.map((c) => c.label)];
    for (const row of rows) {
      const line = colDefs.map((c) => {
        const v = c.field ? row[c.field] : undefined;
        if (v !== undefined && v !== null) return String(v);
        // columns 无字段映射时，按原顺序取行值（row 为对象）
        return '';
      });
      sheetData.push(line);
    }

    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    ws['!cols'] = colDefs.map((c) => ({ wch: Math.max(10, String(c.label).length * 2 + 6) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '培训台账');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const base = (fileName || sourceName || '培训台账OCR');
    const safe = base.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || '培训台账OCR';
    const finalName = `${safe}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`;
    return ok({ buffer: buf, finalName }, '导出成功');
  } catch (e) {
    return err(-1, `导出失败: ${e.message}`);
  }
}

// 清洗 PDF 字体缺映射产生的替换字符（U+FFFD / 方块 / 菱形）
function cleanNoise(v) {
  if (v == null) return v;
  return String(v).replace(/[\ufffd\u25a0\u25a1\u25c6\u25cf\ufffc]/g, '').trim();
}

// 归一化日期：2025.11.18 / 2025-11-18 / 25.11.18 / 025.11.18 → YYYY-MM-DD；无法解析返回空串
function normalizeDate(v) {
  const raw = cleanNoise(v);
  if (!raw) return '';
  const m = raw.match(/(?:^|[^\d])(\d{2,4})[^\d](\d{1,2})[^\d](\d{1,2})(?:[^\d]|$)/);
  if (!m) return '';
  let y = m[1];
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y.length === 2) y = '20' + y;
  else if (y.length === 3 && y.startsWith('0')) y = '20' + y.slice(1);
  if (y.length !== 4 || !(mo >= 1 && mo <= 12) || !(d >= 1 && d <= 31)) return '';
  const pad = (n) => (n < 10 ? '0' + n : String(n));
  return `${y}-${pad(mo)}-${pad(d)}`;
}

// ---------- 2.5 AI 签到表统计 → 月度培训台账（hse_training_ledger_monthly） ----------
// 映射口径（与 Excel「月度培训台账」导入一致）：
//   缺少签字人数 → missing_count（列表「缺少」）
//   资料不完整   → incomplete_count（列表「资料不完整」）
//   应到/实到    → expected_count / actual_count
// 按「培训人（乡镇作业中心经理）」聚合；同月同培训人重复上传为覆盖而非累加（幂等）。
const SIGNIN_METRIC_KEYS = ['missing_signature_count', 'incomplete_material_count', 'team_code'];
function isSigninMetricRows(rows) {
  return rows.some((r) => r && typeof r === 'object'
    && SIGNIN_METRIC_KEYS.some((k) => r[k] !== undefined && r[k] !== null && r[k] !== ''));
}

/** 从来源文件名推断月份：2026年8月 / 2026-08 / 202608 / 8月 → YYYY-MM */
function resolveMonthFromText(text) {
  const s = String(text || '');
  let m = s.match(/(\d{4})\s*[年\-./]?\s*(\d{1,2})\s*月/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}`;
  m = s.match(/(?:^|[^\d])(\d{4})(\d{2})(?:[^\d]|$)/);
  if (m) {
    const mm = Number(m[2]);
    if (mm >= 1 && mm <= 12) return `${m[1]}-${String(mm).padStart(2, '0')}`;
  }
  m = s.match(/(\d{1,2})\s*月/);
  if (m) {
    const mm = Number(m[1]);
    if (mm >= 1 && mm <= 12) return `${new Date().getFullYear()}-${String(mm).padStart(2, '0')}`;
  }
  return '';
}

const toInt0 = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
};

async function confirmSigninMetrics(req, rows) {
  try {
    if (!isConnected()) return err(-3, '当前为内存模式，不支持入库');
    const body = req.body || {};
    const month = /^\d{4}-\d{2}$/.test(String(body.month || ''))
      ? String(body.month)
      : (resolveMonthFromText(body.sourceName || '') || computeMonthRange(null).monthLabel);

    // 按培训人（经理）姓名聚合
    const agg = new Map();
    let noManager = 0;
    for (const r of rows) {
      if (!r || typeof r !== 'object') continue;
      const name = cleanNoise(r.trainer || r.trainer_name || r.name || '');
      if (!name) { noManager += 1; continue; }
      const cur = agg.get(name)
        || { name, expected: 0, actual: 0, missing: 0, incomplete: 0, newcomer: 0, sheets: 0 };
      cur.expected += toInt0(r.expected_count);
      cur.actual += toInt0(r.actual_count);
      cur.missing += toInt0(r.missing_signature_count);
      cur.incomplete += toInt0(r.incomplete_material_count);
      cur.newcomer += toInt0(r.newcomer_count);
      cur.sheets += 1;
      agg.set(name, cur);
    }
    if (agg.size === 0) {
      return err(-7, '未能确定「培训人（经理）」姓名，无法写入月度台账。请在预览中补全「培训人」列后重试。');
    }

    const names = [...agg.keys()];
    // 同名时只认在职（正式员工）那一位，避免把台账挂到已辞职/已死亡的同名人员 ID 上
    const empRes = await pool.query(
      `SELECT v.employee_id, v.name
         FROM v_employee_org_full v
         JOIN employee e ON e.id = v.employee_id
        WHERE v.is_deleted = false AND v.is_current = true
          AND e.is_deleted = false AND e.employment_relation = '正式员工'
          AND v.name = ANY($1)`,
      [names],
    );
    const nameToId = new Map();
    empRes.rows.forEach((r) => {
      if (!nameToId.has(r.name)) nameToId.set(r.name, r.employee_id);
    });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // 幂等：清掉本通道（ai-vision）同月同培训人的历史结果，重复上传即覆盖而非累加
      await client.query(
        `DELETE FROM hse_training_ledger_monthly
          WHERE month = $1 AND source = 'ai-vision' AND trainer_name = ANY($2)`,
        [month, names],
      );
      for (const item of agg.values()) {
        await client.query(
          `INSERT INTO hse_training_ledger_monthly
             (trainer_id, trainer_name, month, expected_count, actual_count,
              missing_count, incomplete_count, source)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'ai-vision')
           ON CONFLICT (trainer_id, month) DO UPDATE SET
             trainer_name = EXCLUDED.trainer_name,
             expected_count = EXCLUDED.expected_count,
             actual_count = EXCLUDED.actual_count,
             missing_count = EXCLUDED.missing_count,
             incomplete_count = EXCLUDED.incomplete_count,
             source = 'ai-vision',
             updated_at = CURRENT_TIMESTAMP`,
          [
            nameToId.get(item.name) || null,
            item.name, month, item.expected, item.actual, item.missing, item.incomplete,
          ],
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    const values = [...agg.values()];
    const missingTotal = values.reduce((s, x) => s + x.missing, 0);
    const incompleteTotal = values.reduce((s, x) => s + x.incomplete, 0);
    const unmatched = names.filter((n) => !nameToId.has(n));
    return ok(
      {
        inserted: agg.size,
        month,
        unmatched,
        noManager,
        missingTotal,
        incompleteTotal,
        expectedTotal: values.reduce((s, x) => s + x.expected, 0),
        actualTotal: values.reduce((s, x) => s + x.actual, 0),
      },
      `已写入 ${month} 月度台账 ${agg.size} 人：缺少 ${missingTotal}、资料不完整 ${incompleteTotal}`
      + (unmatched.length ? `（${unmatched.join('、')} 未在花名册匹配到）` : '')
      + (noManager ? `；${noManager} 张表未识别出培训人，已跳过` : ''),
    );
  } catch (e) {
    return err(-1, `写入月度台账失败: ${e.message}`);
  }
}

// ---------- 3. 确认入库 ----------
async function confirm(req) {
  try {
    const rows = Array.isArray(req.body && req.body.rows) ? req.body.rows : [];
    if (rows.length === 0) return err(-2, '没有可入库的数据');
    // 签到表「填写完整性」统计行：写入月度培训台账（缺少/资料不完整），而非逐人培训记录
    if (isSigninMetricRows(rows)) return confirmSigninMetrics(req, rows);
    if (!isConnected()) {
      return err(-3, '当前为内存模式，不支持入库');
    }

    let inserted = 0;
    for (const r of rows) {
      const idCard = cleanNoise(r.id_card || r.idCard || '') || null;
      const employeeId = r.employee_id || r.employeeId || null;
      // 阶段5：复用 training 路由同口径落键（显式 ID > 身份证 hash > 姓名唯一匹配）
      let resolvedEmployeeId = await resolveTrainingPersonId(
        cleanNoise(r.name || ''), idCard, employeeId || r.personnel_id || null,
      );
      // 落键成功则以员工主数据为准同步标准姓名，避免 OCR/自由文本错名
      const standardName = resolvedEmployeeId ? await resolveTrainingPersonName(resolvedEmployeeId) : null;

      const trainingDate = normalizeDate(r.training_date || r.trainingDate || '') || null;
      const duration = (r.duration_minutes !== undefined && r.duration_minutes !== null)
        ? Number(r.duration_minutes) : (Number(r.durationMinutes || 0) || 0);
      const score = (r.score !== undefined && r.score !== null)
        ? (Number(r.score) || null) : (r.scoreNum !== undefined ? Number(r.scoreNum) || null : null);

      await pool.query(`
        INSERT INTO training_records
          (personnel_id, name, id_card, dept, position, grid_level, frequency,
           training_type, training_date, duration_minutes, content, result, score,
           trainer, remark, employee_id, trainer_id, training_plan_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [
          resolvedEmployeeId != null ? resolvedEmployeeId : (r.personnel_id || null),
          standardName || cleanNoise(r.name || '') || '',
          idCard || '',
          cleanNoise(r.dept || r.dept_name || '') || '',
          cleanNoise(r.position || r.position_name || '') || '',
          cleanNoise(r.grid_level || '') || '',
          cleanNoise(r.frequency || '') || '',
          cleanNoise(r.training_type || 'HSE') || 'HSE',
          trainingDate,
          Number.isFinite(duration) ? duration : 0,
          cleanNoise(r.content || '') || '',
          cleanNoise(r.result || '合格') || '合格',
          score,
          cleanNoise(r.trainer || '') || '',
          cleanNoise(r.remark || '') || '',
          resolvedEmployeeId,
          r.trainer_id || null,
          r.training_plan_id || null,
        ],
      );
      inserted += 1;
    }

    return ok({ inserted }, `成功入库 ${inserted} 条`);
  } catch (e) {
    return err(-1, `入库失败: ${e.message}`);
  }
}

// ---------- 4. 签到场次入库 ----------
// body: { sourceName, sessions: [识别预览场次（可含用户校正 trainingDate/deptName）] }
async function confirmSignin(req) {
  try {
    const sourceName = cleanNoise((req.body && req.body.sourceName) || '') || '签到表导入';
    const sessions = Array.isArray(req.body && req.body.sessions) ? req.body.sessions : [];
    if (sessions.length === 0) return err(-2, '没有可入库的场次');
    if (!isConnected()) return err(-3, '当前为内存模式，不支持入库');

    let insertedSessions = 0;
    let insertedRecords = 0;
    for (const s of sessions) {
      if (s.kind !== 'team' && s.kind !== 'company') continue;
      // 用户可在校正预览中修改日期/部门
      const trainingDate = normalizeDate(s.trainingDate || s.trainingDateText || '') || null;
      const deptName = cleanNoise(s.deptName || '') || null;
      const detail = {
        groups: s.groups || {},
        people: s.people || [],
        missingFields: s.missingFields || [],
        contentText: s.contentText || '',
      };
      const r = await pool.query(`
        INSERT INTO training_signin_sessions
          (source_name, page_no, kind, dept_name, team_unit_id, team_unit_name, center_name,
           training_date, expected_count, actual_count, missing_count, untrained_count,
           resigned_count, newcomer_count, tags, content, detail, created_by_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
        RETURNING id`,
        [
          sourceName,
          Number(s.page) || null,
          s.kind,
          deptName,
          s.teamUnitId || null,
          cleanNoise(s.teamUnitName || '') || null,
          cleanNoise(s.centerName || '') || null,
          trainingDate,
          Number(s.expectedCount) || 0,
          Number(s.actualCount) || 0,
          Number(s.missingCount) || 0,
          Number(s.untrainedCount) || 0,
          (s.groups && s.groups.resignedUntrained ? s.groups.resignedUntrained.length : 0),
          (s.groups && s.groups.newcomers ? s.groups.newcomers.length : 0),
          Array.isArray(s.tags) ? s.tags : [],
          cleanNoise(s.contentText || '') || null,
          JSON.stringify(detail),
          (req.user && req.user.id) || null,
        ],
      );
      const sessionId = r.rows[0].id;
      insertedSessions += 1;

      // 逐人落痕：仅在册人员（花名册匹配命中）。已签=completed，未签=未培训
      const people = Array.isArray(s.people) ? s.people : [];
      for (const p of people) {
        if (!p.match || !p.match.employeeId) continue;
        // 同人重复印刷行（本人已在其他行签名）：不落痕，由其签名行记 completed
        if (p.status === 'signed_dup') continue;
        const signed = !!p.signed;
        await pool.query(`
          INSERT INTO training_records
            (training_title, training_type, training_date, dept_name, position,
             employee_id, name, has_checkin, result, remark, source_session_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            `HSE培训签到（${deptName || '公司级'} ${trainingDate || ''}）`.trim(),
            'HSE',
            trainingDate,
            p.match.teamName || deptName || '',
            p.match.positionName || '',
            p.match.employeeId,
            p.match.name,
            signed,
            signed ? '合格' : '未培训',
            signed
              ? `签到表导入-已签到（${sourceName} 第${s.page}页）`
              : `签到表导入-未签到（${sourceName} 第${s.page}页，在岗未培训）`,
            sessionId,
          ],
        );
        insertedRecords += 1;
      }
    }

    return ok(
      { insertedSessions, insertedRecords },
      `成功入库 ${insertedSessions} 场培训、${insertedRecords} 条人员记录`,
    );
  } catch (e) {
    return err(-1, `入库失败: ${e.message}`);
  }
}

// ---------- 5. 场次台账列表 ----------
async function signinList(query) {
  try {
    if (!isConnected()) return ok({ list: [], total: 0 });
    const where = ['is_deleted = false'];
    const params = [];
    const { kind, dept, dateFrom, dateTo, tag } = query;
    if (kind && (kind === 'team' || kind === 'company')) {
      params.push(kind); where.push(`kind = $${params.length}`);
    }
    if (dept) {
      params.push(`%${String(dept)}%`); where.push(`dept_name LIKE $${params.length}`);
    }
    if (dateFrom) { params.push(dateFrom); where.push(`training_date >= $${params.length}`); }
    if (dateTo) { params.push(dateTo); where.push(`training_date <= $${params.length}`); }
    if (tag) { params.push(String(tag)); where.push(`$${params.length} = ANY(tags)`); }

    const cnt = await pool.query(
      `SELECT COUNT(*)::int AS n FROM training_signin_sessions WHERE ${where.join(' AND ')}`,
      params,
    );
    const r = await pool.query(`
      SELECT id, source_name, page_no, kind, dept_name, team_unit_name, center_name,
             training_date, expected_count, actual_count, missing_count, untrained_count,
             resigned_count, newcomer_count, tags, created_at
      FROM training_signin_sessions
      WHERE ${where.join(' AND ')}
      ORDER BY training_date DESC NULLS LAST, id DESC
      LIMIT 500`,
      params,
    );
    return ok({ list: r.rows, total: cnt.rows[0].n });
  } catch (e) {
    return err(-1, `查询失败: ${e.message}`);
  }
}

// ---------- 6. 场次明细（未培训人员悬浮） ----------
async function signinDetail(params) {
  try {
    if (!isConnected()) return err(-3, '当前为内存模式');
    const r = await pool.query(
      'SELECT * FROM training_signin_sessions WHERE id = $1 AND is_deleted = false',
      [Number(params.id)],
    );
    if (r.rows.length === 0) return err(-4, '场次不存在');
    const row = r.rows[0];
    return ok(row);
  } catch (e) {
    return err(-1, `查询失败: ${e.message}`);
  }
}

// ---------- 7. 导出场次台账（汇总 sheet + 未培训人员明细 sheet） ----------
// 成功返回 { __t:'json', payload:{ buffer, finalName } }，由 controller 渲染二进制
async function exportSignin() {
  try {
    if (!isConnected()) return err(-3, '当前为内存模式');
    const r = await pool.query(`
      SELECT * FROM training_signin_sessions
      WHERE is_deleted = false
      ORDER BY training_date DESC NULLS LAST, id DESC`);
    const sessions = r.rows;
    if (sessions.length === 0) return err(-2, '没有可导出的场次');

    // Sheet1：场次汇总（一场一行）
    const sumHead = ['部门/班组', '类型', '培训日期', '应到', '实到', '缺少',
      '在岗未培训', '离职未培训', '新入职冲抵', '标签', '来源', '页码'];
    const sumRows = [sumHead];
    // Sheet2：未培训人员逐人展开（带在岗/离职状态）
    const detHead = ['部门/班组', '培训日期', '姓名', '状态', '作业中心', '岗位', '来源页码'];
    const detRows = [detHead];

    for (const s of sessions) {
      sumRows.push([
        s.dept_name || '',
        s.kind === 'company' ? '公司级' : '班组级',
        s.training_date ? String(s.training_date).slice(0, 10) : '',
        s.expected_count, s.actual_count, s.missing_count,
        s.untrained_count, s.resigned_count, s.newcomer_count,
        (s.tags || []).join('、'),
        s.source_name || '',
        s.page_no || '',
      ]);
      const detail = s.detail || {};
      const groups = detail.groups || {};
      const dateStr = s.training_date ? String(s.training_date).slice(0, 10) : '';
      for (const p of groups.onPostUntrained || []) {
        detRows.push([
          s.dept_name || '', dateStr, p.name || '', '在岗',
          p.centerName || s.center_name || '', p.positionName || '', s.page_no || '',
        ]);
      }
      for (const p of groups.resignedUntrained || []) {
        detRows.push([
          s.dept_name || '', dateStr, p.name || '', '离职',
          s.center_name || '', '', s.page_no || '',
        ]);
      }
    }

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet(sumRows);
    ws1['!cols'] = sumHead.map((h) => ({ wch: Math.max(10, h.length * 2 + 6) }));
    XLSX.utils.book_append_sheet(wb, ws1, '培训场次汇总');
    const ws2 = XLSX.utils.aoa_to_sheet(detRows);
    ws2['!cols'] = detHead.map((h) => ({ wch: Math.max(10, h.length * 2 + 6) }));
    XLSX.utils.book_append_sheet(wb, ws2, '未培训人员明细');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const finalName = `培训签到台账_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`;
    return ok({ buffer: buf, finalName }, '导出成功');
  } catch (e) {
    return err(-1, `导出失败: ${e.message}`);
  }
}

module.exports = {
  upload,               // 路由层负责 upload.single('file') 中间件
  recognize,
  aiRecognize,
  exportExcel,
  confirm,
  confirmSignin,
  signinList,
  signinDetail,
  exportSignin,
};
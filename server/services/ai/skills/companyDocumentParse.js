/**
 * SK-002 文档解析 Skill（公司级标准 AI Skill — AI-Phase-01-05）
 *
 * 定位（AI-Phase-01-05 任务书 §三/§四十四）：
 *   Skill ID     SK-002
 *   Skill Name   文档解析
 *   技术标识      company.document.parse
 *   Version      v1.0.0
 *   Domain       company
 *   Type         document_parse
 *   Status       Active（AI-Phase-01-05 验收 A~P 全过后由 Testing 转 Active，2026-10-13）
 *
 * 核心原则（任务书 §三/§四十四）：SK-002 不是「AI 读文档」，而是
 *   「程序先把文档可靠地读出来、结构化，再让 AI 解释结构化结果」。
 *   文档 → 文件校验 → 确定性解析 → 文档结构化（文本/标题/段落/表格/页码/元数据）
 *       → 确定性统计 → Evidence → Prompt Registry → AI Gateway → AI 解释
 *       → 统一 Skill Output → Generation Record
 *   AI 只做结构解释/内容概览/重点提炼，禁止重算结构数字、禁止虚构文档内容。
 *
 * 复用与边界（任务书 §二/§六 审计结论）：
 *   - pdf：复用 server 既有依赖 pdf-parse ^2.4.5（knowledgeParser / insuranceOtherService 生产在用）；
 *   - txt/md：复用 knowledgeParser 语义（UTF-8 + BOM 剥离）+ md 标题/表格/图片轻量识别（确定性正则）；
 *   - docx：现有项目完全无解析能力（Node 无内置 zip 容器解析），按任务书 §三十七 经必要性证明
 *     后最小新增 mammoth@1.13.0（BSD-2-Clause，纯 JS，docx→HTML 保留标题样式/表格/列表/图片数）；
 *   - .doc 无稳定纯 Node 解析方案 → AI_UNSUPPORTED_FILE_TYPE（任务书 §七：不为格式齐全强行实现）；
 *   - xlsx/xls/csv → AI_UNSUPPORTED_FILE_TYPE（表格数据职责归 SK-001，避免能力重叠）；
 *   - OCR 是独立能力（trainingOcrService，HSE 域），不混入本 Skill（任务书 §八）；
 *     扫描型 PDF → extractable=false 安全返回，禁止 AI 猜测内容；
 *   - 不直连任何模型：只调用 aiGateway（§二十三）；provider=null 交 Gateway/Provider Registry（§二十二）；
 *   - 复用 aiPromptRegistry / aiEvidenceService / ai_generation_records（不做 migration，§二十七）。
 *
 * 文件错误码（§三十四 最小扩展，先查 errors.js：全局无文件类码，skill 本地定义同 SK-001 范式）：
 *   AI_FILE_INVALID           文件无法解析（损坏/伪扩展/解析器失败）
 *   AI_FILE_TOO_LARGE         文件超过大小限制
 *   AI_UNSUPPORTED_FILE_TYPE  扩展名不在支持清单（fail-closed allowlist）
 *   空文档/扫描 PDF（文件合法但无有效文本）不走错误：success=true + ai_called=false + confidence=low（§二十五）。
 */

const fs = require('fs');
const mammoth = require('mammoth');
const { PDFParse } = require('pdf-parse');

const { AI_ERROR_CODES, AiError } = require('../errors');
const gateway = require('../aiGateway');
const { createRequestContext } = require('../aiRequestContext');
const { createEvidence } = require('../aiEvidenceService');
const generationRecordService = require('../aiGenerationRecordService');

/** 依赖版本读取（pdf-parse v2 exports 未暴露 ./package.json，失败时退回主版本号，不影响解析） */
function depVersion(name, fallback) {
  try {
    return require(`${name}/package.json`).version;
  } catch (e) {
    return fallback;
  }
}
const PDF_PARSE_VERSION = depVersion('pdf-parse', '2.x');
const MAMMOTH_VERSION = depVersion('mammoth', '1.x');

// ============================================================
// Skill 元数据（标准定义，AI-Phase-01-01 §4；AI-Phase-01-05 §五）
// ============================================================
const SKILL_ID = 'SK-002';
const SKILL_NAME = '文档解析';
const SKILL_KEY = 'company.document.parse';
const SKILL_VERSION = 'v1.0.0';
const SKILL_DOMAIN = 'company';
const SKILL_TYPE = 'document_parse';
/** 生命周期（AI-Phase-01-01 §5~§6）：初始 Testing，A~P 验收全过后转 Active（2026-10-13 已转）。 */
const SKILL_STATUS = 'Active';
const SKILL_OWNER = 'company-ai';

/** 允许调用 SK-002 的角色（与 SK-005 / SK-001 SKILL_ALLOWED_ROLES 逐字一致，fail-closed，§二十六） */
const SKILL_ALLOWED_ROLES = [
  'system_admin',
  'admin',
  'safety_manager',
  'hse_manager',
  'manager',
  'township_manager',
  'viewer',
  'grid_inspector',
];

/**
 * Model Policy（§二十二：模型不得写死）
 * document_parse → provider=null 交 AI Gateway 当前活动 Provider 决定。
 */
const MODEL_POLICIES = {
  document_parse: {
    provider: null,
    promptKey: SKILL_KEY,
    promptVersion: SKILL_VERSION,
    options: { temperature: 0.2, maxTokens: 1500 },
  },
};

/**
 * 输入与处理边界（§十；初始建议值按解析器能力与实测调整）
 * 统计覆盖全部内容（至上限），明细列表另有展示上限，超出在 quality 如实登记。
 */
const INPUT_LIMITS = {
  parseGoalMaxLength: 500,
  fileMaxBytes: 20 * 1024 * 1024, // 20MB（multer limits 同步使用）
  allowedExtensions: ['.pdf', '.docx', '.txt', '.md', '.markdown'],
  maxPages: 100, // PDF 参与解析的最大页数
  maxTextChars: 100000, // 参与解析的最大文本字符
  maxParagraphs: 5000, // 参与统计的最大段落数
  maxParagraphsDetail: 200, // result.paragraphs 明细返回条数（统计仍覆盖全部）
  maxHeadings: 500, // 标题明细上限
  maxTables: 100, // 表格数上限
  maxTableRows: 5000, // 单表参与统计的最大行数
  maxTableSample: 3, // 每表 sample 返回行数
  maxListItems: 2000, // 列表项统计上限
  // AI 上下文预算（documentSummary 压缩后）。初始 3000 字符（任务书 §十六 建议 4000~6000，
  // 但须按实际模型测试确定）：本地 Ollama qwen2.5:7b 纯 CPU prefill ≈39 tokens/s、
  // 冷启动重载 +~40s、前端 120s 超时。集成实测校准（AI-Phase-01-05）：3000 字符时
  // T01 AI 耗时 129.7s 超预算，REAL-1/2（ctx 832/1251）为 99.4s/89.7s——按
  // SK-001 先例收紧到 2000 字符，配合 limitAiContext 层内二次截断保障 120s 预算。
  aiContextMaxChars: 2000,
  evidenceMaxItems: 8, // Evidence 上限（§二十 沿用 SK-001）
};

/** 文件类错误码（§三十四 最小扩展：skill 本地定义，不改 errors.js） */
const AI_ERROR_CODES_SK002 = {
  AI_FILE_INVALID: 'AI_FILE_INVALID',
  AI_FILE_TOO_LARGE: 'AI_FILE_TOO_LARGE',
  AI_UNSUPPORTED_FILE_TYPE: 'AI_UNSUPPORTED_FILE_TYPE',
};

/** 人机边界声明（§十八 / §三十人机边界） */
const DISCLAIMER =
  '本解析与解读由 AI 基于程序确定性解析结果生成，仅为 AI 辅助文档解读，' +
  '不构成正式管理决定、HSE 专业判定（风险等级/隐患等级/三违定性/责任认定/事故定责/考核结论/合规最终结论）；' +
  '文档内容以原文为准，最终结论以人工审核为准。';

/** 无法解析场景的安全返回文案（§二十五 / §13.2） */
const UNPARSEABLE_TEXT =
  '该文件可识别，但未提取到有效文本内容，未调用 AI 生成解读。\n' +
  '可能原因：文件为扫描件/图片型文档（当前 SK-002 未启用 OCR），或文档没有正文。\n' +
  '请确认文件内容后重新上传。';

function permissionError(message) {
  const err = new Error(message);
  err.name = 'SkillPermissionError';
  err.code = 'SKILL_PERMISSION_DENIED';
  return err;
}

// ============================================================
// 输入校验（§九）
// ============================================================

/** 归一化输入（multipart 文本字段均为 string；布尔字段 'true'/'false'/'1'/'0'） */
function normalizeInput(raw = {}) {
  const boolOf = (v, dflt) => {
    if (v == null || String(v).trim() === '') return dflt;
    const s = String(v).trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(s)) return true;
    if (['false', '0', 'no', 'off'].includes(s)) return false;
    return dflt;
  };
  return {
    parse_goal:
      raw.parse_goal != null && String(raw.parse_goal).trim() !== ''
        ? String(raw.parse_goal).trim()
        : '通用文档解析：结构识别、统计与内容概览',
    request_id: raw.request_id != null ? String(raw.request_id) : null,
    scope: raw.scope != null ? raw.scope : null,
    options: raw.options != null ? raw.options : {},
    extract_structure: boolOf(raw.extract_structure, true),
    extract_tables: boolOf(raw.extract_tables, true),
    extract_metadata: boolOf(raw.extract_metadata, true),
  };
}

/**
 * 校验输入合法性
 * @returns {{valid:boolean, errors:Array<{field:string, code:string, message:string}>}}
 */
function validateInput(input) {
  const errors = [];
  if (input.parse_goal && typeof input.parse_goal !== 'string') {
    errors.push({ field: 'parse_goal', code: 'INVALID', message: 'parse_goal 必须为字符串' });
  } else if (input.parse_goal && input.parse_goal.length > INPUT_LIMITS.parseGoalMaxLength) {
    errors.push({
      field: 'parse_goal',
      code: 'TOO_LONG',
      message: `parse_goal 长度不得超过 ${INPUT_LIMITS.parseGoalMaxLength} 字（当前 ${input.parse_goal.length}）`,
    });
  }
  return { valid: errors.length === 0, errors };
}

/** 权限（§二十六：JWT 身份 + 角色 allowlist；身份来自 req.user，禁止请求体传入） */
function resolvePermission(actor) {
  if (!actor || actor.userId == null) {
    throw permissionError('无法识别用户身份，禁止调用 SK-002');
  }
  if (!actor.role || !SKILL_ALLOWED_ROLES.includes(actor.role)) {
    throw permissionError(`当前角色（${actor.role || '未知'}）无权使用 SK-002 文档解析`);
  }
  return { permission_model: 'role_allowlist（文件自包含，无行级数据范围）' };
}

// ============================================================
// 确定性解析引擎（§十一~§十六；无业务规则；无法可靠识别的结构如实 null/空）
// ============================================================

/** HTML 实体解码（mammoth 输出的受限实体集合） */
function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&nbsp;|&#xA0;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/>/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function cleanText(s) {
  return decodeEntities(String(s || '')).replace(/\s+/g, ' ').trim();
}

/**
 * DOCX 结构化解析：mammoth convertToHtml → 轻量 HTML 状态机
 * （mammoth 输出为受控 HTML 子集：h1~h6/p/table/tr/td/th/ul/ol/li/img/strong/em/a/br）
 * 标题仅来自真实 Word Heading 样式；bold 段落不猜测为标题（§十二：不伪造结构）。
 * 页码 docx 无可靠来源 → 全部 page=null（§十一：不得虚构 Word 页码）。
 */
function parseDocxStructured(buffer) {
  return mammoth.convertToHtml({ buffer }).then((r) => {
    const html = String(r.value || '');
    const warnings = [];
    if (Array.isArray(r.messages) && r.messages.length > 0) {
      const dropped = r.messages.filter((m) => m && m.type === 'warning').length;
      if (dropped > 0) warnings.push(`docx 转换产生 ${dropped} 条非致命提示（无法映射的样式/元素已按纯文本处理）`);
    }

    const headings = [];
    const paragraphs = [];
    const tables = [];
    let imageCount = 0;
    let listItemCount = 0;
    let textChars = 0;

    // 状态机容器
    let para = null; // { style, text } 顶层段落缓冲
    let table = null; // { rows: [[cellText,...]], curRow: null, curCell: null }
    let listDepth = 0;

    const flushParagraph = () => {
      if (!para) return;
      const text = cleanText(para.text);
      if (para.style.startsWith('heading')) {
        const level = Number(para.style.split('_')[1]);
        if (headings.length < INPUT_LIMITS.maxHeadings) {
          headings.push({ level: Number.isFinite(level) ? level : null, text });
        }
        if (text) paragraphs.push({ style: para.style, text });
      } else if (listDepth > 0) {
        listItemCount += 1;
        if (listItemCount <= INPUT_LIMITS.maxListItems && text) {
          paragraphs.push({ style: 'list_item', text });
        }
      } else if (text) {
        paragraphs.push({ style: 'body', text });
      }
      para = null;
    };
    const flushCell = () => {
      if (!table || !table.curRow || table.curCell == null) return;
      const text = cleanText(table.curCell);
      table.curRow.push(text);
      table.curCell = null;
    };
    const flushRow = () => {
      if (!table || !table.curRow) return;
      flushCell();
      if (table.rows.length < INPUT_LIMITS.maxTableRows) table.rows.push(table.curRow);
      table.curRow = null;
    };
    const flushTable = () => {
      if (!table) return;
      flushRow();
      const rows = table.rows;
      let columns = 0;
      let headers = [];
      if (rows.length > 0) {
        columns = rows.reduce((m, r) => (r.length > m ? r.length : m), 0);
        headers = rows[0].filter((c) => c !== '');
      }
      if (rows.length > 0) tables.push({ rows: rows.length, columns, headers, sample: rows.slice(0, INPUT_LIMITS.maxTableSample) });
      table = null;
    };

    // 标签流切分（受控子集，无需完整 DOM）
    // a/strong/em/br 为透明标签：锚点（Word 书签）/加粗/斜体/换行不改变段落归属，开闭标签均忽略，
    // 文本继续流入当前容器（避免 `<a id="_Toc...">` `<strong>` 等字面量泄漏进提取文本）
    const re = /<\/?(h[1-6]|p|table|tr|td|th|ul|ol|li|img|a|strong|em|br)\b([^>]*)>|<img\b([^>]*)>/gi;
    let last = 0;
    let m;
    const TRANSPARENT = new Set(['a', 'strong', 'em', 'br']);
    const pushText = (chunk) => {
      if (!chunk) return;
      const t = decodeEntities(chunk).replace(/\s+/g, ' ');
      if (table && table.curCell != null) table.curCell += t;
      else if (table && table.curRow) {
        /* 行间游离文本忽略 */
      } else if (para) para.text += t;
    };
    while ((m = re.exec(html)) !== null) {
      pushText(html.slice(last, m.index));
      last = re.lastIndex;
      const closing = m[0].startsWith('</');
      const tag = (m[1] || 'img').toLowerCase();
      const attrs = m[2] || m[3] || '';
      if (TRANSPARENT.has(tag)) continue; // 开闭均忽略
      if (closing) {
        if (tag === 'p') flushParagraph();
        else if (tag === 'td' || tag === 'th') flushCell();
        else if (tag === 'tr') flushRow();
        else if (tag === 'table') flushTable();
        else if (tag === 'li') flushParagraph(); // 列表项闭合即落段（否则末项会并入后续元素）
        else if (tag === 'ul' || tag === 'ol') {
          flushParagraph(); // 兜底：空列表闭合不影响已落段
          listDepth = Math.max(0, listDepth - 1);
        } else if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') flushParagraph();
      } else {
        if (tag === 'p') {
          if (table) {
            /* 单元格内段落：文本继续并入 curCell */
          } else {
            flushParagraph();
            para = { style: 'body', text: '' };
          }
        } else if (/^h[1-6]$/.test(tag)) {
          if (!table) {
            flushParagraph();
            para = { style: `heading_${tag.slice(1)}`, text: '' };
          }
        } else if (tag === 'table') {
          flushParagraph();
          flushTable();
          table = { rows: [], curRow: null, curCell: null };
        } else if (tag === 'tr') {
          flushRow();
          if (table) table.curRow = [];
        } else if (tag === 'td' || tag === 'th') {
          flushCell();
          if (table && table.curRow) {
            table.curCell = '';
            // colspan 计入列数：在行尾按列跨度补空单元格
            const span = /colspan\s*=\s*["']?(\d+)/i.exec(attrs);
            table._pendingSpan = span ? Math.max(1, Number(span[1])) : 1;
          }
        } else if (tag === 'ul' || tag === 'ol') {
          flushParagraph();
          listDepth += 1;
        } else if (tag === 'li') {
          flushParagraph();
          para = { style: 'list_item', text: '' };
        } else if (tag === 'img') {
          imageCount += 1;
        }
      }
      // colspan：flushCell 后按跨度补齐占位列
      if (!closing && (tag === 'td' || tag === 'th') && table && table._pendingSpan > 1) {
        const span = table._pendingSpan;
        table._pendingSpan = 1;
        const idx = table.curRow ? table.curRow.length : 0;
        flushCell();
        if (table.curRow) for (let i = 1; i < span; i++) table.curRow.splice(idx, 0, '');
      }
    }
    pushText(html.slice(last));
    flushParagraph();
    flushTable();

    if (headings.length === 0) {
      warnings.push('文档未使用 Word 标题样式（标题1~标题9），标题结构未识别（headings=null，不做猜测）。');
    }
    textChars = paragraphs.reduce((s, p) => s + p.text.length, 0);
    return {
      headings,
      paragraphs,
      tables,
      imageCount,
      listItemCount,
      textChars,
      notes: r.messages || [],
      warnings,
    };
  });
}

/**
 * PDF 结构化解析：pdf-parse v2 getText()（页界=「-- N of M --」标记行；旧版 \f 兼容）+ getInfo() 元数据。
 * PDF 文本流无可靠标题层级与表格结构 → headings=null / tables=null（§十三，不做启发式猜测）。
 * 段落 = 页内非空文本行（pdf-parse 粒度）；page 为真实页码（1 起）。
 */
async function parsePdfStructured(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const textResult = await parser.getText();
    const rawText = typeof textResult === 'string' ? textResult : (textResult && textResult.text) || '';
    let pages = typeof (textResult && textResult.total) === 'number' ? textResult.total : null;

    // pdf-parse v2 不输出 \f，而是在每页末尾追加「-- N of M --」标记行。
    // 页界判定：优先按标记行切分（标记行本身过滤，不计入段落）；无标记时退回 \f 切分（旧版语义）；再无则整文档单页。
    const markerRe = /^\s*--\s*\d+\s+of\s+\d+\s*--\s*$/;
    let pageTexts;
    if (rawText.split(/\r?\n/).some((l) => markerRe.test(l))) {
      pageTexts = [];
      let cur = [];
      rawText.split(/\r?\n/).forEach((ln) => {
        if (markerRe.test(ln)) {
          pageTexts.push(cur.join('\n'));
          cur = [];
        } else {
          cur.push(ln);
        }
      });
      pageTexts.push(cur.join('\n')); // 最后一个标记后无内容 → 尾段为空
      if (pages != null) pageTexts = pageTexts.slice(0, pages);
    } else if (rawText.includes('\f')) {
      pageTexts = rawText.split('\f');
    } else {
      pageTexts = [rawText];
    }

    let meta = { title: null, author: null, created_at: null, modified_at: null };
    try {
      const info = await parser.getInfo();
      const i = (info && info.info) || {};
      meta = {
        title: i.Title || null,
        author: i.Author || null,
        created_at: i.CreationDate || null,
        modified_at: i.ModDate || i.Custom && i.Custom.SourceModified || null,
      };
    } catch (e) {
      /* 元数据不可得 → 保持 null（§十一：缺失如实 null） */
    }

    const paragraphs = [];
    pageTexts.forEach((pageText, idx) => {
      const lines = String(pageText).split(/\r?\n/);
      let buf = '';
      const flush = () => {
        const t = buf.replace(/\s+/g, ' ').trim();
        if (t) paragraphs.push({ text: t, page: idx + 1 });
        buf = '';
      };
      lines.forEach((ln) => {
        if (ln.trim() === '') flush();
        else buf += (buf ? ' ' : '') + ln.trim();
      });
      flush();
    });

    const warnings = [];
    const textChars = paragraphs.reduce((s, p) => s + p.text.length, 0);
    if (rawText.trim() !== '' && textChars === 0) {
      // 有原始文本流但过滤后无有效段落（如整页均为页标记）→ 如实按不可提取处理
      return { text: rawText, pages, meta, paragraphs: [], textChars: 0, extractable: false, warnings };
    }
    if (pages == null && pageTexts.length > 0) pages = rawText.trim() === '' ? 0 : pageTexts.length;
    return { text: rawText, pages, meta, paragraphs, textChars, extractable: textChars > 0, warnings };
  } finally {
    try {
      await parser.destroy();
    } catch (e) {
      /* 释放失败不影响解析结果 */
    }
  }
}

/**
 * TXT / Markdown 结构化解析（确定性正则；knowledgeParser 语义：UTF-8 + BOM 剥离）
 * md：#/##/###… 标题（1~6 级）、| 表格（首行表头 + 分隔行）、![alt](src) 图片；
 * txt：无可靠结构 → headings=null / tables=null；两者均按空行切段落（page=null）。
 */
function parseTxtStructured(buffer, isMd) {
  let text = buffer.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const warnings = [];
  const paragraphs = [];
  const headings = [];
  const tables = [];
  let imageCount = 0;
  let listItemCount = 0;
  let inCodeBlock = false;

  const lines = text.split(/\r?\n/);
  let buf = [];
  let tableBuf = [];
  const flushBuf = () => {
    if (buf.length === 0) return;
    const t = buf.join(' ').replace(/\s+/g, ' ').trim();
    if (t) paragraphs.push({ style: 'body', text: t, page: null });
    buf = [];
  };
  const flushTableBuf = () => {
    if (tableBuf.length === 0) return;
    const rows = tableBuf
      .map((ln) => ln.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim()))
      .filter((cells) => !cells.every((c) => /^:?-{2,}:?$/.test(c) || c === ''));
    if (rows.length >= 2) {
      const columns = rows[0].length;
      tables.push({
        rows: rows.length - 1, // 不含表头行
        columns,
        headers: rows[0],
        sample: rows.slice(1, 1 + INPUT_LIMITS.maxTableSample),
      });
    }
    tableBuf = [];
  };

  lines.forEach((raw) => {
    const ln = raw.trimEnd();
    if (isMd && /^\s*```/.test(ln)) {
      flushBuf();
      flushTableBuf();
      inCodeBlock = !inCodeBlock;
      return;
    }
    if (inCodeBlock) {
      buf.push(ln.trim());
      return;
    }
    if (isMd && /^\s*\|.*\|\s*$/.test(ln)) {
      flushBuf();
      tableBuf.push(ln);
      return;
    }
    flushTableBuf();
    if (isMd && /^(#{1,6})\s+(.+)$/.test(ln)) {
      flushBuf();
      headings.push({ level: RegExp.$1.length, text: cleanText(RegExp.$2) });
      return;
    }
    if (isMd && /^\s*[-*+]\s+\S/.test(ln)) {
      flushBuf();
      listItemCount += 1;
      const t = cleanText(ln.replace(/^\s*[-*+]\s+/, ''));
      if (t) paragraphs.push({ style: 'list_item', text: t, page: null });
      return;
    }
    if (isMd && /^\s*\d+[.)]\s+\S/.test(ln)) {
      flushBuf();
      listItemCount += 1;
      const t = cleanText(ln.replace(/^\s*\d+[.)]\s+/, ''));
      if (t) paragraphs.push({ style: 'list_item', text: t, page: null });
      return;
    }
    if (isMd) imageCount += (ln.match(/!\[[^\]]*\]\([^)]+\)/g) || []).length;
    if (ln.trim() === '') {
      flushBuf();
      return;
    }
    buf.push(ln.trim());
  });
  flushTableBuf();
  flushBuf();

  if (isMd && headings.length === 0) {
    warnings.push('Markdown 中未识别到 # 标题，标题结构未识别（headings=null 语义：无标题而非缺失）。');
  }
  const textChars = paragraphs.reduce((s, p) => s + p.text.length, 0);
  return {
    headings: headings.length > 0 ? headings : null,
    paragraphs,
    tables: tables.length > 0 ? tables : null,
    imageCount,
    listItemCount,
    textChars,
    warnings,
  };
}

/** 组装确定性解析结果（§十一/§十五；统计覆盖全部至上限，明细有展示上限） */
function analyzeDeterministic({ fileName, fileType, fileSize, parsed, options }) {
  const warnings = [...parsed.warnings];
  const { extract_structure = true, extract_tables = true, extract_metadata = true } = options || {};

  // 统一段落形态：docx/txt/md 已有 style；pdf 无 style 字段
  let paragraphs = (parsed.paragraphs || []).map((p, i) => ({
    index: i + 1,
    text: p.text,
    style: p.style || 'body',
    page: p.page != null ? p.page : null,
    section: null, // v1.0 无可靠章节归属来源，如实 null
  }));
  const totalParagraphs = paragraphs.length;
  if (totalParagraphs > INPUT_LIMITS.maxParagraphs) {
    warnings.push(`段落数 ${totalParagraphs} 超过统计上限 ${INPUT_LIMITS.maxParagraphs}，超出部分未参与统计。`);
    paragraphs = paragraphs.slice(0, INPUT_LIMITS.maxParagraphs);
  }
  const emptyParagraphs = paragraphs.filter((p) => !p.text).length;
  const nonEmptyParagraphs = paragraphs.length - emptyParagraphs;

  let headings = parsed.headings; // null=未识别（如实）；数组=已识别
  if (!extract_structure) {
    headings = null;
    warnings.push('按输入要求未提取标题结构（extract_structure=false）。');
    paragraphs = []; // 不提取结构时明细也不返回
  }
  const headingsDetail = Array.isArray(headings) ? headings.slice(0, INPUT_LIMITS.maxHeadings) : null;

  let tables = parsed.tables; // null=该文档类型无可靠表格结构；数组=已识别
  if (!extract_tables) {
    tables = null;
    warnings.push('按输入要求未提取表格（extract_tables=false）。');
  }
  const tablesDetail = Array.isArray(tables) ? tables.slice(0, INPUT_LIMITS.maxTables) : null;
  if (Array.isArray(tables) && tables.length > INPUT_LIMITS.maxTables) {
    warnings.push(`表格数 ${tables.length} 超过上限 ${INPUT_LIMITS.maxTables}，仅返回前 ${INPUT_LIMITS.maxTables} 个的明细（统计已覆盖全部）。`);
  }

  const headingByLevel = {};
  if (Array.isArray(headings)) {
    headings.forEach((h) => {
      headingByLevel[h.level] = (headingByLevel[h.level] || 0) + 1;
    });
  }

  const textCharsTotal = parsed.textChars || 0;
  if (textCharsTotal > INPUT_LIMITS.maxTextChars) {
    warnings.push(`文本量 ${textCharsTotal} 字符超过解析上限 ${INPUT_LIMITS.maxTextChars}，超出部分未参与结构统计。`);
  }

  const page_count = parsed.pageCount != null ? parsed.pageCount : null; // docx/txt/md 无可靠页数 → null
  const detailTruncated = totalParagraphs > INPUT_LIMITS.maxParagraphsDetail;

  const result = {
    document: {
      file_name: fileName,
      file_type: fileType,
      file_size: fileSize,
      page_count,
      title: extract_metadata ? parsed.meta.title ?? null : null,
      author: extract_metadata ? parsed.meta.author ?? null : null,
      created_at: extract_metadata ? parsed.meta.created_at ?? null : null,
      modified_at: extract_metadata ? parsed.meta.modified_at ?? null : null,
      parsed_at: new Date().toISOString(),
      engine: parsed.engine,
    },
    structure: {
      heading_count: Array.isArray(headings) ? headings.length : null,
      heading_count_by_level: Array.isArray(headings) ? headingByLevel : null,
      paragraph_count: paragraphs.length,
      total_paragraph_in_doc: totalParagraphs,
      non_empty_paragraphs: nonEmptyParagraphs,
      empty_paragraphs: emptyParagraphs,
      list_item_count: parsed.listItemCount != null ? parsed.listItemCount : null,
      table_count: Array.isArray(tables) ? tables.length : null,
      table_total_rows: Array.isArray(tables) ? tables.reduce((s, t) => s + t.rows, 0) : null,
      table_total_cols_max: Array.isArray(tables) ? tables.reduce((m, t) => Math.max(m, t.columns), 0) : null,
      image_count: parsed.imageCount != null ? parsed.imageCount : null,
      text_chars: textCharsTotal,
    },
    headings: headingsDetail,
    paragraphs: paragraphs.slice(0, INPUT_LIMITS.maxParagraphsDetail),
    tables: tablesDetail,
    quality: {
      extractable: parsed.extractable !== false,
      truncated: detailTruncated || (Array.isArray(tables) && tablesDetail.length < tables.length),
      truncated_paragraphs: Math.max(0, totalParagraphs - INPUT_LIMITS.maxParagraphsDetail),
      truncated_tables: Array.isArray(tables) ? Math.max(0, tables.length - INPUT_LIMITS.maxTables) : 0,
      warnings,
    },
  };
  if (detailTruncated) {
    warnings.push(`段落明细仅返回前 ${INPUT_LIMITS.maxParagraphsDetail} 段（共 ${totalParagraphs} 段）；统计数字覆盖全部段落。`);
  }
  return { result, warnings: [...new Set(warnings)] };
}

// ============================================================
// Evidence（§十九/§二十：来自确定性解析结果；缺失字段 null，不伪造；上限 8）
// ============================================================

function buildEvidence(result, warnings) {
  const evidence = [];
  const base = {
    sourceType: 'business_record',
    sourceId: result.document.file_name,
    sourceDomain: SKILL_KEY,
  };
  const push = (sourceField, text, strength = 'high') => {
    if (!text) return;
    if (evidence.length >= INPUT_LIMITS.evidenceMaxItems) return;
    evidence.push(createEvidence({ ...base, sourceField, evidenceText: text, evidenceStrength: strength }));
  };

  const d = result.document;
  const s = result.structure;
  push(
    'document_metadata',
    `文档「${d.file_name}」（${d.file_type}，${d.file_size} 字节，页数=${d.page_count == null ? '不可靠/无' : d.page_count}）` +
      (d.title ? `，标题「${d.title}」` : '') +
      (d.author ? `，作者「${d.author}」` : '')
  );
  push(
    'structure',
    `结构统计：标题 ${s.heading_count == null ? '未识别' : s.heading_count} 个；段落 ${s.paragraph_count} 个（非空 ${s.non_empty_paragraphs}）；` +
      `表格 ${s.table_count == null ? '未识别' : s.table_count} 个（总行 ${s.table_total_rows == null ? '-' : s.table_total_rows}）；` +
      `列表项 ${s.list_item_count == null ? '-' : s.list_item_count}；图片 ${s.image_count == null ? '-' : s.image_count}；文本 ${s.text_chars} 字符。`
  );
  if (Array.isArray(result.headings) && result.headings.length > 0) {
    push(
      'headings',
      `标题结构：` +
        result.headings
          .slice(0, 8)
          .map((h) => `${'  '.repeat(Math.max(0, h.level - 1))}H${h.level} ${h.text}`)
          .join('；')
    );
  }
  const headParas = (result.paragraphs || []).filter((p) => p.text).slice(0, 2);
  if (headParas.length > 0) {
    push(
      'paragraphs',
      `开头段落摘录：` + headParas.map((p) => `第${p.index}段「${p.text.slice(0, 120)}${p.text.length > 120 ? '…' : ''}」`).join('；')
    );
  }
  if (Array.isArray(result.tables)) {
    for (const t of result.tables.slice(0, 2)) {
      push(
        `tables[${t.index ?? ''}]`,
        `表格（${t.rows} 行 × ${t.columns} 列）表头：${(t.headers || []).slice(0, 10).join(' | ') || '(无表头文本)'}`
      );
    }
  }
  push(
    'quality',
    `解析质量：可提取文本=${result.quality.extractable}；截断段落明细 ${result.quality.truncated_paragraphs} 段；` +
      `截断表格 ${result.quality.truncated_tables} 个。` +
      (result.quality.warnings.length ? `解析警告：${result.quality.warnings.join(' ')}` : ''),
    result.quality.warnings.length ? 'medium' : 'high'
  );
  if (warnings.length > 0) {
    push('processing_notes', `处理警告：${warnings.join(' ')}`, 'medium');
  }
  return evidence;
}

// ============================================================
// AI 上下文（§十六 documentSummary：中文重标签 + 降载；对齐 SK-001 防幻觉范式）
// ============================================================

function relabelForAi(result) {
  const d = result.document;
  const s = result.structure;
  const out = {
    文档: {
      文件名: d.file_name,
      类型: d.file_type,
      大小字节: d.file_size,
      页数: d.page_count,
      标题: d.title,
      作者: d.author,
      创建时间: d.created_at,
      修改时间: d.modified_at,
    },
    结构统计: {
      标题数量: s.heading_count,
      各级标题数量: s.heading_count_by_level,
      段落数量: s.paragraph_count,
      非空段落数量: s.non_empty_paragraphs,
      空段落数量: s.empty_paragraphs,
      列表项数量: s.list_item_count,
      表格数量: s.table_count,
      表格总行数: s.table_total_rows,
      表格最大列数: s.table_total_cols_max,
      图片数量: s.image_count,
      文本字符数: s.text_chars,
    },
    解析质量: {
      可提取文本: result.quality.extractable,
      截断段落数: result.quality.truncated_paragraphs,
      截断表格数: result.quality.truncated_tables,
      解析警告: result.quality.warnings,
    },
  };
  if (Array.isArray(result.headings)) {
    out.标题结构 = result.headings.slice(0, 20).map((h) => ({ 级别: h.level, 文字: h.text }));
  } else if (result.headings === null) {
    out.标题结构 = '未能可靠识别（该文档类型/样式未提供标题结构，程序不做猜测）';
  }
  const ps = (result.paragraphs || []).filter((p) => p.text).slice(0, 4);
  if (ps.length > 0) {
    out.开头段落摘录 = ps.map((p) => ({
      段序: p.index,
      页码: p.page,
      内容: p.text.slice(0, 160) + (p.text.length > 160 ? '…' : ''),
    }));
  }
  if (Array.isArray(result.tables) && result.tables.length > 0) {
    out.表格概览 = result.tables.slice(0, 8).map((t, i) => ({
      表序: i + 1,
      行数: t.rows,
      列数: t.columns,
      表头: (t.headers || []).slice(0, 8),
    }));
  } else if (result.tables === null) {
    out.表格概览 = '未能可靠识别（该文档类型未提供表格结构，程序不做猜测）';
  }
  return out;
}

/** 控制给 AI 的上下文体积；超预算时逐级降载并告警 */
function limitAiContext(result, warnings) {
  const base = relabelForAi(result);
  let text = JSON.stringify(base);
  if (text.length <= INPUT_LIMITS.aiContextMaxChars) return text;

  // tier2：段落摘录 4→2、表格概览 8→4、标题树 20→10；再对明细文本限长
  //（摘录 160→80 字/条、标题 40 字/条、表头 8→4 列）——避免中小文档因少量长段落
  // 直接跌入 tier3 丢失全部结构明细（AI 解读退化为「未能可靠识别」）。
  const trimmed = JSON.parse(text);
  if (Array.isArray(trimmed.标题结构)) {
    trimmed.标题结构 = trimmed.标题结构
      .slice(0, 10)
      .map((h) => ({ 级别: h.级别, 文字: String(h.文字 || '').slice(0, 40) }));
  }
  if (Array.isArray(trimmed.开头段落摘录)) {
    trimmed.开头段落摘录 = trimmed.开头段落摘录
      .slice(0, 2)
      .map((p) => ({ 段序: p.段序, 页码: p.页码, 内容: String(p.内容 || '').slice(0, 80) }));
  }
  if (Array.isArray(trimmed.表格概览)) {
    trimmed.表格概览 = trimmed.表格概览
      .slice(0, 4)
      .map((t) => ({ 表序: t.表序, 行数: t.行数, 列数: t.列数, 表头: Array.isArray(t.表头) ? t.表头.slice(0, 4) : t.表头 }));
  }
  text = JSON.stringify(trimmed);
  if (text.length <= INPUT_LIMITS.aiContextMaxChars) {
    warnings.push('文档结构较大，已压缩提供给 AI 的解析上下文（标题树/段落摘录/表格概览截断）。结构统计未删减，完整结果以 result 字段为准。');
    return text;
  }
  // tier3：仅文档元数据 + 结构统计 + 质量
  warnings.push('文档规模超出 AI 上下文预算，AI 解读仅基于结构统计与解析质量摘要；完整解析结果以 result 字段为准。');
  return JSON.stringify({
    文档: trimmed.文档,
    结构统计: trimmed.结构统计,
    解析质量: trimmed.解析质量,
    note: '标题/段落/表格明细见接口 result 字段（未发送给 AI）',
  });
}

/**
 * AI 数字一致性检查（对齐 SK-001 范式，SK-002 数字集合）：
 * 允许集合=程序结构统计全部数值 + 表格行列 + 文件大小 + 页数 + 标题级别；
 * 文档正文/标题文本内含数字（strs 覆盖，正文引用合法）；序数 1~paragraph_count+10。
 * 已知局限同 SK-001：无法识别「真实数字+错误归属」，由中文重标签 + Prompt 铁律 7 + result 为准兜底。
 * @returns {null|string} null=通过；否则返回告警文案
 */
function checkAiNumberConsistency(answer, det) {
  if (!answer || !det) return null;
  const nums = new Set();
  const strs = [];
  (function walk(o) {
    if (o == null) return;
    if (Array.isArray(o)) {
      o.forEach(walk);
      return;
    }
    if (typeof o === 'object') {
      Object.values(o).forEach(walk);
      return;
    }
    if (typeof o === 'number' && Number.isFinite(o)) {
      nums.add(Math.round(o * 10000) / 10000);
      nums.add(Math.round(o * 100) / 100);
    } else if (typeof o === 'string' && o.trim()) {
      strs.push(o.trim());
    }
  })(det);
  const found = String(answer).match(/-?\d+(?:\.\d+)?/g) || [];
  const unknown = [];
  for (const s of found) {
    const n = Number(s);
    if (nums.has(Math.round(n * 10000) / 10000) || nums.has(Math.round(n * 100) / 100)) continue;
    if (n >= 1900 && n <= 2100) continue; // 年份
    if (Number.isInteger(n) && n >= 1 && n <= (det.structure?.paragraph_count || 0) + 10) continue; // 段序/序数
    if (strs.some((str) => str.includes(s))) continue; // 正文/标题文本内含数字
    if (!unknown.includes(s)) unknown.push(s);
  }
  if (unknown.length === 0) return null;
  return `AI 解读中出现程序解析结果中不存在的数字（${unknown.slice(0, 5).join('、')}），相关表述不可作为事实依据，结构统计请以 result 确定性解析结果为准。`;
}

// ============================================================
// 输出组装
// ============================================================

function skillBlock() {
  return {
    id: SKILL_ID,
    name: SKILL_NAME,
    key: SKILL_KEY,
    version: SKILL_VERSION,
    domain: SKILL_DOMAIN,
    type: SKILL_TYPE,
    status: SKILL_STATUS,
  };
}

/** 置信度：解析质量 + AI 是否拒绝解读 */
function deriveConfidence(result, warnings, aiText) {
  if (/无法解读|无法分析|不足以|无法给出/.test(String(aiText || ''))) return 'low';
  if (!result.quality.extractable) return 'low';
  let score = 2;
  if (result.structure.paragraph_count >= 3) score--;
  if (warnings.length === 0) score--;
  if (score <= 0) return 'high';
  return score === 1 ? 'medium' : 'low';
}

function manifest() {
  return {
    ...skillBlock(),
    owner: SKILL_OWNER,
    allowed_roles: SKILL_ALLOWED_ROLES,
    model_policy: SKILL_TYPE,
    prompt_key: MODEL_POLICIES[SKILL_TYPE].promptKey,
    prompt_version: MODEL_POLICIES[SKILL_TYPE].promptVersion,
    input: {
      transport: 'multipart/form-data',
      fields: {
        file: { type: 'file', required: true, exts: INPUT_LIMITS.allowedExtensions, maxBytes: INPUT_LIMITS.fileMaxBytes },
        parse_goal: { type: 'string', required: false, maxLength: INPUT_LIMITS.parseGoalMaxLength, note: '解析目标；缺省为通用解析' },
        extract_structure: { type: 'boolean', required: false, default: true, note: '提取标题/段落结构' },
        extract_tables: { type: 'boolean', required: false, default: true, note: '提取表格（pdf 类型恒为 null）' },
        extract_metadata: { type: 'boolean', required: false, default: true, note: '提取文档元数据（docx 无可靠来源 → null）' },
      },
    },
    scope_note: 'scope 为公共协议保留字段；SK-002 数据范围为「上传文件本身」，无行级数据范围（如实登记）',
    output_schema: {
      success: 'boolean',
      skill: 'object',
      request_id: 'string',
      result: 'object（确定性解析结果：document/structure/headings/paragraphs/tables/quality）',
      answer: 'string（AI 解释）',
      evidence: 'array<object>',
      confidence: 'high|medium|low',
      warnings: 'array<string>',
      suggestions: 'array<string>',
      metadata: 'object',
    },
  };
}

// ============================================================
// 记录（§二十七：复用 ai_generation_records；type=document_parse / sub_type=SK-002；R2 缺口不做 migration）
// ============================================================

async function _saveSkillRecord({
  actor, title, status, requestId, provider, model, durationMs, result, evidence, errorMessage, promptText,
}) {
  try {
    const saved = await generationRecordService.saveGenerationRecord({
      userId: actor.userId,
      type: SKILL_TYPE,
      subType: SKILL_ID,
      title: String(title || '').slice(0, 200),
      prompt: promptText || '',
      result: typeof result === 'string' ? result : null,
      provider,
      model,
      inputTokens: 0,
      outputTokens: 0,
      durationMs,
      status,
      errorMessage: errorMessage || null,
      requestId,
      promptKey: MODEL_POLICIES[SKILL_TYPE].promptKey,
      promptVersion: MODEL_POLICIES[SKILL_TYPE].promptVersion,
      evidence: evidence || null,
    });
    return { recordId: saved.id, recordSaved: true };
  } catch (err) {
    return { recordId: null, recordSaved: false, recordError: err.message };
  }
}

// ============================================================
// 主流程
// ============================================================

/**
 * SK-002 文档解析
 * @param {Object} input - { buffer, fileName, fileSize, parse_goal, extract_structure, extract_tables, extract_metadata }
 * @param {{userId:number|null, role:string|null}} actor - req.user 派生最小字段
 * @returns {Promise<Object>} 统一输出协议（result 为核心 + answer 为 AI 解释）
 */
async function parse(input = {}, actor = {}) {
  const startAt = Date.now();
  const norm = normalizeInput(input);

  // 1) 输入校验 → 结构化错误
  const { valid, errors } = validateInput(norm);
  if (!valid) {
    throw new AiError(
      AI_ERROR_CODES.AI_INVALID_REQUEST,
      `SK-002 输入校验失败：${errors.map((e) => e.message).join('；')}`,
      { validationErrors: errors }
    );
  }

  // 2) 权限
  const perm = resolvePermission(actor);
  const warnings = [];
  const suggestions = [];

  // 3) 文件内容形态守卫（仅拦截非 Buffer 的程序性错误）。
  //    0 字节文件不在此拦截（§二十五：txt/md「文本为空」→ 安全返回；
  //    0 字节 pdf/docx 由解析器抛错 → catch → AI_FILE_INVALID「非法文件」路径）。
  if (!Buffer.isBuffer(input.buffer)) {
    throw new AiError(AI_ERROR_CODES_SK002.AI_FILE_INVALID, '文件内容缺失或读取失败，请重新上传');
  }

  // 4) 确定性解析（解析器失败 → 结构化错误 + 失败记录）
  const ext = String(input.fileType || '').toLowerCase();
  const goalTitle = `${input.fileName || 'document'}：${norm.parse_goal}`;

  let parsed;
  try {
    if (ext === 'pdf') {
      const pdf = await parsePdfStructured(input.buffer);
      parsed = {
        ...pdf,
        pageCount: pdf.pages,
        imageCount: null, // 文本层不含图片统计，如实 null
        listItemCount: null,
        engine: `pdf-parse@${PDF_PARSE_VERSION}`,
        meta: pdf.meta,
        warnings: pdf.extractable
          ? [
              'PDF 为文本流解析：标题层级与表格结构无法可靠识别（headings/tables=null），段落按页内文本行切分。',
              ...pdf.warnings,
            ]
          : pdf.warnings,
      };
    } else if (ext === 'docx') {
      const docx = await parseDocxStructured(input.buffer);
      parsed = {
        headings: docx.headings.length > 0 ? docx.headings : null,
        paragraphs: docx.paragraphs,
        tables: docx.tables.length > 0 ? docx.tables : null,
        imageCount: docx.imageCount,
        listItemCount: docx.listItemCount,
        textChars: docx.textChars,
        pageCount: null, // docx 页码为渲染期概念，无可靠来源 → null（§十一）
        meta: { title: null, author: null, created_at: null, modified_at: null }, // mammoth 不提供 core properties，如实 null
        engine: `mammoth@${MAMMOTH_VERSION}`,
        extractable: docx.paragraphs.length > 0,
        warnings: docx.warnings,
      };
    } else if (ext === 'txt' || ext === 'md' || ext === 'markdown') {
      const t = parseTxtStructured(input.buffer, ext !== 'txt');
      parsed = {
        ...t,
        pageCount: null,
        imageCount: t.imageCount,
        listItemCount: t.listItemCount,
        engine: 'builtin-text',
        meta: { title: null, author: null, created_at: null, modified_at: null },
        extractable: t.textChars > 0 || (t.headings || []).length > 0,
        warnings: t.warnings,
      };
    } else {
      throw new AiError(
        AI_ERROR_CODES_SK002.AI_UNSUPPORTED_FILE_TYPE,
        `不支持的文件类型: .${ext}（支持: ${INPUT_LIMITS.allowedExtensions.join(' / ')}；.doc 无稳定纯 Node 解析方案，表格数据请使用 SK-001 Excel 数据分析）`
      );
    }
  } catch (err) {
    if (err && err.name === 'AiError') throw err;
    const wrapped = new AiError(
      AI_ERROR_CODES_SK002.AI_FILE_INVALID,
      `文件无法解析（${ext}）：${err && err.message ? err.message : '格式错误或文件损坏'}`
    );
    await _saveSkillRecord({
      actor,
      title: goalTitle,
      status: 'failed',
      requestId: createRequestContext({ userId: actor.userId }).requestId,
      provider: null,
      model: null,
      durationMs: Date.now() - startAt,
      result: null,
      evidence: null,
      errorMessage: wrapped.message,
    });
    throw wrapped;
  }

  const analysis = analyzeDeterministic({
    fileName: input.fileName,
    fileType: ext === 'markdown' ? 'md' : ext,
    fileSize: input.fileSize != null ? input.fileSize : input.buffer.length,
    parsed,
    options: { extract_structure: norm.extract_structure, extract_tables: norm.extract_tables, extract_metadata: norm.extract_metadata },
  });
  warnings.push(...analysis.warnings);
  const det = analysis.result;

  const metadataBase = {
    skill_key: SKILL_KEY,
    skill_id: SKILL_ID,
    skill_version: SKILL_VERSION,
    model_policy: SKILL_TYPE,
    prompt_key: MODEL_POLICIES[SKILL_TYPE].promptKey,
    prompt_version: MODEL_POLICIES[SKILL_TYPE].promptVersion,
    provider: null,
    model: null,
    duration_ms: 0,
    record_id: null,
    record_saved: false,
    gateway_request_id: null,
    trace_id: null,
    usage: { input_tokens: 0, output_tokens: 0 },
    file: {
      file_name: det.document.file_name,
      file_type: det.document.file_type,
      file_size: det.document.file_size,
      page_count: det.document.page_count,
    },
    permission_model: perm.permission_model,
    disclaimer: DISCLAIMER,
  };

  // 5) 无法解析场景（§二十五：文件合法但无有效文本 → 安全返回，不调 AI，不编造）
  if (!det.quality.extractable || det.structure.paragraph_count === 0) {
    const requestId = createRequestContext({ userId: actor.userId }).requestId;
    const rec = await _saveSkillRecord({
      actor,
      title: goalTitle,
      status: 'success',
      requestId,
      provider: null,
      model: null,
      durationMs: Date.now() - startAt,
      result: UNPARSEABLE_TEXT,
      evidence: null,
    });
    suggestions.push('若为扫描件/图片型 PDF，请使用具备 OCR 的独立流程处理后再上传');
    return {
      success: true,
      skill: skillBlock(),
      request_id: requestId,
      result: det,
      answer: UNPARSEABLE_TEXT,
      evidence: [],
      confidence: 'low',
      warnings,
      suggestions,
      metadata: {
        ...metadataBase,
        duration_ms: Date.now() - startAt,
        record_id: rec.recordId,
        record_saved: rec.recordSaved,
        ai_called: false,
      },
    };
  }

  // 6) Evidence（确定性解析结果 → 统一证据；与 Gateway 同源）
  const evidence = buildEvidence(det, warnings);

  // 7) AI 上下文（§十六 documentSummary：结构化摘要，非全文）
  const aiContext = limitAiContext(det, warnings);

  // 8) AI Gateway（禁止直连 Provider；Prompt Registry + Evidence + Record 统一收敛）
  const policy = MODEL_POLICIES[SKILL_TYPE];
  let gatewayResult;
  try {
    gatewayResult = await gateway.generate({
      promptKey: policy.promptKey,
      promptVersion: policy.promptVersion,
      data: aiContext,
      customInstructions: norm.parse_goal,
      evidence,
      provider: policy.provider,
      options: policy.options,
      userId: actor.userId,
      sourceDomain: SKILL_KEY,
      record: {
        type: SKILL_TYPE,
        subType: SKILL_ID,
        title: goalTitle,
      },
    });
  } catch (err) {
    // Provider / Gateway 异常：结构化错误 + 失败记录
    await _saveSkillRecord({
      actor,
      title: goalTitle,
      status: 'failed',
      requestId: err && err.details && err.details.requestId ? err.details.requestId : createRequestContext({ userId: actor.userId }).requestId,
      provider: err && err.provider ? err.provider : null,
      model: null,
      durationMs: Date.now() - startAt,
      result: null,
      evidence,
      errorMessage: err && err.message ? err.message : String(err),
    });
    throw err;
  }

  // 9) 统一输出（结构数字以 result 为准）
  const confidence = deriveConfidence(det, warnings, gatewayResult.content);
  const inconsistent = checkAiNumberConsistency(gatewayResult.content, det);
  if (inconsistent) warnings.push(inconsistent);
  if (det.document.page_count == null) {
    suggestions.push('该文档类型无可靠页码来源，结果中 page_count=null 为如实缺省，AI 不会虚构页码');
  }
  suggestions.push('结构统计以 result 确定性解析结果为准，AI 文字仅为解读');
  suggestions.push('文档内容以原文为准；涉及 HSE 专业判定（风险等级/责任认定/合规结论）须人工复核');

  return {
    success: true,
    skill: skillBlock(),
    request_id: gatewayResult.requestId,
    result: det,
    answer: gatewayResult.content,
    evidence: gatewayResult.evidence || evidence,
    confidence,
    warnings,
    suggestions,
    metadata: {
      ...metadataBase,
      provider: gatewayResult.provider,
      model: gatewayResult.model,
      duration_ms: gatewayResult.durationMs || Date.now() - startAt,
      record_id: gatewayResult.recordId || null,
      record_saved: !!gatewayResult.recordSaved,
      gateway_request_id: gatewayResult.requestId,
      trace_id: gatewayResult.traceId || null,
      usage: {
        input_tokens: gatewayResult.inputTokens || 0,
        output_tokens: gatewayResult.outputTokens || 0,
      },
      ai_called: true,
      ai_context_chars: aiContext.length,
    },
  };
}

module.exports = {
  SKILL_ID,
  SKILL_NAME,
  SKILL_KEY,
  SKILL_VERSION,
  SKILL_DOMAIN,
  SKILL_TYPE,
  SKILL_STATUS,
  SKILL_OWNER,
  SKILL_ALLOWED_ROLES,
  MODEL_POLICIES,
  INPUT_LIMITS,
  AI_ERROR_CODES_SK002,
  DISCLAIMER,
  UNPARSEABLE_TEXT,
  normalizeInput,
  validateInput,
  resolvePermission,
  parseDocxStructured,
  parsePdfStructured,
  parseTxtStructured,
  analyzeDeterministic,
  buildEvidence,
  limitAiContext,
  checkAiNumberConsistency,
  deriveConfidence,
  manifest,
  parse,
};

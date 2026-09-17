/**
 * 知识文档分块器（AI-05）
 *
 * 策略：结构优先 + 长度控制 + 适度 overlap。
 * - Markdown：按标题（#/##/###）分节，节内按段落累积；保留 section 元数据。
 * - txt/pdf：按段落（空行分隔）累积；PDF 按 \f 分页保留 page。
 * - 中文 token 估算启发式：CJK ≈ 0.6 token/字，ASCII ≈ 0.28 token/字符
 *   （nomic-embed-text 上下文 8192 token；chunk_size=512，overlap≈10%）。
 */

const DEFAULT_CHUNK_SIZE = 512; // token（估算）
const DEFAULT_OVERLAP = 48; // token（估算），约 10%
const MAX_CHUNK_CONTENT = 4000; // 安全上限（字符），防超长块

/** 估算 token 数（中文优先启发式） */
function estimateTokens(text) {
  if (!text) return 0;
  const cjk = (text.match(/[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/g) || []).length;
  const other = text.length - cjk;
  return Math.max(1, Math.ceil(cjk * 0.6 + other * 0.28));
}

/** sha256 哈希 */
function sha256Hex(text) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

/** 规范化换行 */
function normalizeText(text) {
  return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** 按标题切分 markdown：返回 [{heading, level, content}] */
function splitMarkdownSections(text) {
  const lines = normalizeText(text).split('\n');
  const sections = [];
  let current = { heading: '', level: 0, lines: [] };
  const headingRe = /^(#{1,6})\s+(.+)$/;
  for (const line of lines) {
    const m = line.match(headingRe);
    if (m) {
      if (current.lines.length || current.heading) {
        sections.push(current);
      }
      current = { heading: m[2].trim(), level: m[1].length, lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.length || current.heading) sections.push(current);
  return sections;
}

/** 按段落切分：返回 [{paragraph, page}]（\f 视为分页符） */
function splitParagraphs(text) {
  const pages = normalizeText(text).split('\f');
  const out = [];
  pages.forEach((pageText, pageIdx) => {
    const parts = pageText.split(/\n{2,}/);
    for (const part of parts) {
      const trimmed = part.replace(/^\s+|\s+$/g, '');
      if (trimmed) out.push({ paragraph: trimmed, page: pageIdx + 1 });
    }
  });
  return out;
}

/**
 * 通用块累积切分：把原子块（段落/行）合并为 chunk，超限开新块并带 overlap。
 * @param {Array<{text:string, page?:number, section?:string, isHeading?:boolean}>} blocks
 * @param {Object} opts
 * @returns {Array<{content:string, char_count:number, token_estimate:number, page:number|null, section:string|null, metadata:Object}>}
 */
function accumulateBlocks(blocks, opts = {}) {
  const maxTokens = opts.maxTokens || DEFAULT_CHUNK_SIZE;
  const overlapTokens = opts.overlapTokens != null ? opts.overlapTokens : DEFAULT_OVERLAP;
  const chunks = [];
  let current = [];
  let currentTokens = 0;
  let currentPage = null;
  let currentSection = null;

  /** 从上一 chunk 尾部取 overlap 文本 */
  function buildOverlapLines(prevContent) {
    if (!prevContent || overlapTokens <= 0) return [];
    const prevLines = prevContent.split('\n');
    const overlap = [];
    let t = 0;
    for (let i = prevLines.length - 1; i >= 0; i--) {
      const lt = estimateTokens(prevLines[i]) + 1;
      if (t + lt > overlapTokens && overlap.length > 0) break;
      overlap.unshift(prevLines[i]);
      t += lt;
      if (t >= overlapTokens) break;
    }
    return overlap;
  }

  function flush(withOverlap) {
    if (current.length === 0) return;
    let lines = current;
    let page = currentPage;
    let section = currentSection;
    if (withOverlap && chunks.length > 0) {
      const overlap = buildOverlapLines(chunks[chunks.length - 1].content);
      if (overlap.length) {
        lines = overlap.concat(lines);
        if (page == null) page = chunks[chunks.length - 1].page;
        if (section == null) section = chunks[chunks.length - 1].section;
      }
    }
    const content = lines.join('\n');
    chunks.push({
      content,
      char_count: content.length,
      token_estimate: estimateTokens(content),
      page: page != null ? page : null,
      section: section != null ? section : null,
      metadata: { chunk_size_tokens: maxTokens, overlap_tokens: overlapTokens },
    });
    current = [];
    currentTokens = 0;
    currentPage = null;
    currentSection = null;
  }

  for (const block of blocks) {
    if (block.isHeading) {
      // 标题开启新节：先 flush 当前，再以标题行起新块
      if (current.length > 0) flush(true);
      currentSection = block.section != null ? block.section : null;
      current = [block.text];
      currentTokens = estimateTokens(block.text);
      continue;
    }
    if (block.section != null) currentSection = block.section;
    if (block.page != null) currentPage = block.page;

    let text = block.text;
    // 超长段落：按 maxTokens 硬切（中文最坏 ~0.6 token/字）
    while (estimateTokens(text) > maxTokens && text.length > 0) {
      if (current.length > 0) flush(true);
      const cut = Math.floor(maxTokens / 0.6);
      const part0 = text.slice(0, cut);
      const idx = Math.max(part0.lastIndexOf('。'), part0.lastIndexOf('\n'), part0.lastIndexOf('，'));
      const breakAt = idx > cut * 0.5 ? idx + 1 : cut;
      const part = text.slice(0, breakAt).trim();
      if (part) {
        current = [part];
        currentTokens = estimateTokens(part);
        flush(false);
      }
      text = text.slice(breakAt).trim();
    }
    if (!text) continue;

    const t = estimateTokens(text);
    if (currentTokens + t > maxTokens && current.length > 0) flush(true);
    current.push(text);
    currentTokens += t;
  }
  flush(false);
  return chunks;
}

/**
 * 分块入口
 * @param {string} text - 已解析纯文本
 * @param {Object} opts - { maxTokens, overlapTokens, fileType }
 * @returns {Array<{content, char_count, token_estimate, page, section, metadata, content_hash}>}
 */
function chunkText(text, opts = {}) {
  const fileType = (opts.fileType || 'txt').toLowerCase();
  const blocks = [];

  if (fileType === 'md' || fileType === 'markdown') {
    const sections = splitMarkdownSections(text);
    for (const sec of sections) {
      if (sec.heading) {
        blocks.push({ text: `# ${sec.heading}`.replace(/^#\s/, ''), section: sec.heading, isHeading: true });
      }
      const paras = splitParagraphs(sec.lines.join('\n'));
      for (const p of paras) {
        blocks.push({ text: p.paragraph, section: sec.heading || null, page: p.page });
      }
    }
  } else {
    const paras = splitParagraphs(text);
    for (const p of paras) {
      blocks.push({ text: p.paragraph, page: p.page });
    }
  }

  const chunks = accumulateBlocks(blocks, opts);
  return chunks.map((c) => ({ ...c, content_hash: sha256Hex(c.content) }));
}

module.exports = {
  DEFAULT_CHUNK_SIZE,
  DEFAULT_OVERLAP,
  estimateTokens,
  sha256Hex,
  splitMarkdownSections,
  splitParagraphs,
  accumulateBlocks,
  chunkText,
};

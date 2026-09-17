/**
 * 知识文档解析器（AI-05）
 *
 * 支持：txt / md（直接纯文本）；pdf（复用现有依赖 pdf-parse 2.4.5）。
 * 不引入新的文档解析依赖（任务书 §14：禁止为 AI-05 引入大量新解析依赖）。
 * docx/xlsx 解析能力后续按需复用既有 xlsx 依赖扩展（本阶段不要求）。
 */

const path = require('path');
const { PDFParse } = require('pdf-parse');

const SUPPORTED_TYPES = ['txt', 'md', 'markdown', 'pdf'];

/** 由文件扩展名推断类型 */
function fileTypeOf(fileName) {
  const ext = path.extname(fileName || '').replace('.', '').toLowerCase();
  return ext || 'txt';
}

function assertSupported(type) {
  if (!SUPPORTED_TYPES.includes(type)) {
    throw new Error(`不支持的文档类型: ${type}，当前支持 ${SUPPORTED_TYPES.join('/')}`);
  }
}

/**
 * 解析 PDF buffer → 纯文本（复用 pdf-parse，保留 \f 分页符供分块器切页）
 * @param {Buffer} buffer
 * @returns {Promise<{text:string, pages:number}>}
 */
async function parsePdf(buffer) {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  let text = '';
  if (typeof result === 'string') {
    text = result;
  } else if (result && typeof result.text === 'string') {
    text = result.text;
  } else if (Array.isArray(result)) {
    // 分页数组 → 用 \f 连接（分块器按 \f 识别页码）
    text = result.map((p) => (typeof p === 'string' ? p : (p && p.text) || '')).join('\f');
  }
  // pdf-parse 2.x pages 可能是数组（逐页对象）或数字；统一为数字
  let pages = text.split('\f').length;
  if (result && typeof result === 'object' && result.pages != null) {
    pages = Array.isArray(result.pages) ? result.pages.length : (typeof result.pages === 'number' ? result.pages : pages);
  }
  return { text, pages };
}

/**
 * 解析入口：buffer + fileName → { text, fileType, pages }
 * @param {Buffer} buffer
 * @param {Object} opts - { fileName, fileType }
 */
async function parseDocument(buffer, opts = {}) {
  const fileType = (opts.fileType || fileTypeOf(opts.fileName || '')).toLowerCase();
  assertSupported(fileType);

  if (fileType === 'pdf') {
    const { text, pages } = await parsePdf(buffer);
    return { text, fileType: 'pdf', pages };
  }
  // txt / md：UTF-8 直接读取（含 BOM 剥离）
  let text = buffer.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return { text, fileType: fileType === 'markdown' ? 'md' : fileType, pages: 1 };
}

module.exports = {
  SUPPORTED_TYPES,
  fileTypeOf,
  parsePdf,
  parseDocument,
};

/**
 * SK-001 Excel 数据分析 Skill（公司级标准 AI Skill — AI-Phase-01-04）
 *
 * 定位（AI-Phase-01-04 任务书 §四）：
 *   Skill ID     SK-001
 *   Skill Name   Excel 数据分析
 *   技术标识      company.excel.analysis
 *   Version      v1.0.0
 *   Domain       company
 *   Type         data_analysis
 *   Status       Testing（通过 A~P 完整验收后转 Active，不跳过）
 *
 * 核心原则（任务书 §八 / §四十）：确定性计算优先于 AI。
 *   Excel → 文件校验 → Workbook 解析 → 表头识别 → 类型标准化 → 数据质量检查
 *         → 确定性统计 → 结构化 Analysis Result → Evidence
 *         → Prompt Registry → AI Gateway → Provider Registry → Model → AI 解释
 *         → 统一 Skill Output → Generation Record
 *   AI 只做解释（主要发现/趋势/异常/建议），禁止重新计算；程序与 AI 不一致时以程序为准。
 *
 * 复用与边界（§三 / §二十二）：
 *   - 解析复用 xlsx(^0.18.5) 与 ExcelUtils.parseDate；不新增 npm 依赖；
 *   - 不复用 utils/excel.js 的别名映射式通用段 / importExcelService（强 HSE 耦合，01-00 §12），
 *     在本 Skill 内实现最小通用解析与统计引擎（无业务规则，§二十九 禁止硬编码业务语义）；
 *   - 不直连任何模型：只调用 aiGateway（§十六）；
 *   - 复用 aiPromptRegistry / aiEvidenceService / ai_generation_records（不做 R2 migration，§二十一）；
 *   - Model Policy：provider=null 交 Gateway/Provider Registry 决定，禁止写死 grok/ollama/qwen（§十五）。
 *
 * 文件错误码（§十九 最小扩展，定义于本 Skill 而非 errors.js，不改变既有 HSE AI 错误协议）：
 *   AI_FILE_INVALID    文件无法解析（损坏/非 Excel/无工作表/无有效表头）
 *   AI_FILE_TOO_LARGE  文件超过大小限制
 */

const xlsx = require('xlsx');
const fs = require('fs');

const { AI_ERROR_CODES, AiError } = require('../errors');
const gateway = require('../aiGateway');
const { createRequestContext } = require('../aiRequestContext');
const { createEvidence, EVIDENCE_SOURCE_TYPES } = require('../aiEvidenceService');
const generationRecordService = require('../aiGenerationRecordService');
const ExcelUtils = require('../../../utils/excel');

// ============================================================
// Skill 元数据（标准定义，AI-Phase-01-01 §4）
// ============================================================
const SKILL_ID = 'SK-001';
const SKILL_NAME = 'Excel 数据分析';
const SKILL_KEY = 'company.excel.analysis';
const SKILL_VERSION = 'v1.0.0';
const SKILL_DOMAIN = 'company';
const SKILL_TYPE = 'data_analysis';
/** 生命周期（AI-Phase-01-01 §5~§6）：初始 Testing，A~P 验收全过后转 Active。
 * 2026-10-12 AI-Phase-01-04 验收通过（12/12 集成回归 + 真实业务 Excel AI 解读
 * 人工核对 + HSE 回归 + 前端 E2E），由 Testing 转 Active。 */
const SKILL_STATUS = 'Active';
const SKILL_OWNER = '公司AI能力建设组（AI-Phase-01-04）';

/** 允许调用 SK-001 的角色（与 SK-005 SKILL_ALLOWED_ROLES 逐字一致，fail-closed） */
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
 * Model Policy（§十五：模型不得写死）
 * data_analysis → provider=null 交 AI Gateway 当前活动 Provider 决定。
 */
const MODEL_POLICIES = {
  data_analysis: {
    provider: null,
    promptKey: SKILL_KEY,
    promptVersion: SKILL_VERSION,
    options: { temperature: 0.2, maxTokens: 1500 },
  },
};

/** 输入与处理边界（§三十一 性能要求：行/列/文件大小/AI Context 限制，超限明确警告） */
const INPUT_LIMITS = {
  analysisGoalMaxLength: 500,
  fileMaxBytes: 20 * 1024 * 1024, // 20MB（multer limits 同步使用）
  allowedExtensions: ['.xlsx', '.xls', '.xlsm', '.csv'],
  maxRows: 5000, // 参与确定性分析的最大数据行
  maxCols: 100, // 参与分析的最大列
  maxStatColumns: 12, // 数值统计列上限
  maxGroupCards: 4, // 分组统计卡上限
  maxRankingCards: 4, // 排名卡上限
  maxGroupItems: 10, // 每卡分组条目上限
  maxTrendPoints: 60, // 趋势点上限
  maxAnomalyItems: 20, // 异常值清单上限
  typeSampleSize: 200, // 类型推断采样值数
  // AI 上下文预算（确定性结果压缩后）。校准依据：本地 Ollama qwen2.5:7b 实测
  // CPU prefill ≈39 tokens/s、加载后 num_ctx=4096、前端超时 120s —— 2400 字符
  // （≈1300 tokens，prefill ~34s）可在「模型冷启动重载 + 生成」叠加后仍留在
  // 120s 预算内；确定性数字始终完整输出于 result，上下文只承载「解释」职责，
  // 压缩不影响用户可见的统计完整性。
  aiContextMaxChars: 2400,
  evidenceMaxItems: 8, // Evidence 上限
};

/** 文件类错误码（§十九 最小扩展：skill 本地定义，命名遵循 AI_* 规范，不改 errors.js） */
const AI_ERROR_CODES_SK001 = {
  AI_FILE_INVALID: 'AI_FILE_INVALID',
  AI_FILE_TOO_LARGE: 'AI_FILE_TOO_LARGE',
};

/** 人机边界声明（§十四 4.4 / 任务书 §三十） */
const DISCLAIMER =
  '本分析由 AI 基于程序确定性统计结果生成，仅为 AI 辅助解读，' +
  '不构成正式管理决定、HSE 专业判定（风险等级/责任认定/违规定性/考核结论）；最终结论以人工审核为准。';

const UNANALYZABLE_TEXT =
  '该文件无法进行有效数据分析（缺少有效表头或数据行），未调用 AI 生成解读。\n' +
  '请检查文件内容：工作表需包含表头行和至少 1 行数据。';

function permissionError(message) {
  const err = new Error(message);
  err.name = 'SkillPermissionError';
  err.code = 'SKILL_PERMISSION_DENIED';
  return err;
}

// ============================================================
// 输入校验（§六 / §七）
// ============================================================

/** 归一化输入（multipart 文本字段均为 string；不做语义判断） */
function normalizeInput(raw = {}) {
  return {
    analysis_goal:
      raw.analysis_goal != null && String(raw.analysis_goal).trim() !== ''
        ? String(raw.analysis_goal).trim()
        : '通用数据分析：数据概况、质量、统计、分组、排名、趋势与异常',
    sheet_name: raw.sheet_name != null && String(raw.sheet_name).trim() !== '' ? String(raw.sheet_name).trim() : null,
    request_id: raw.request_id != null ? String(raw.request_id) : null,
    scope: raw.scope != null ? raw.scope : null,
    options: raw.options != null ? raw.options : {},
  };
}

/**
 * 校验输入合法性（业务字段；文件本身在解析阶段校验）
 * @returns {{valid:boolean, errors:Array<{field:string, code:string, message:string}>}}
 */
function validateInput(input) {
  const errors = [];
  if (!input.analysis_goal || typeof input.analysis_goal !== 'string') {
    errors.push({ field: 'analysis_goal', code: 'REQUIRED', message: 'analysis_goal 不能为空' });
  } else if (input.analysis_goal.length > INPUT_LIMITS.analysisGoalMaxLength) {
    errors.push({
      field: 'analysis_goal',
      code: 'TOO_LONG',
      message: `analysis_goal 长度不得超过 ${INPUT_LIMITS.analysisGoalMaxLength} 字（当前 ${input.analysis_goal.length}）`,
    });
  }
  if (input.sheet_name != null && String(input.sheet_name).length > 64) {
    errors.push({ field: 'sheet_name', code: 'TOO_LONG', message: 'sheet_name 长度不得超过 64' });
  }
  return { valid: errors.length === 0, errors };
}

/** 权限（§二十：JWT 身份 + 角色 allowlist；身份来自 req.user，禁止请求体传入） */
function resolvePermission(actor) {
  if (!actor || actor.userId == null) {
    throw permissionError('无法识别用户身份，禁止调用 SK-001');
  }
  if (!actor.role || !SKILL_ALLOWED_ROLES.includes(actor.role)) {
    throw permissionError(`当前角色（${actor.role || '未知'}）无权使用 SK-001 Excel 数据分析`);
  }
  return { permission_model: 'role_allowlist（文件自包含，无行级数据范围）' };
}

// ============================================================
// 确定性解析引擎（§九 流水线；无任何业务规则，§二十九）
// ============================================================

/** 读 workbook（xlsx 同步读取；csv 由 xlsx 自动识别） */
function loadWorkbook(filePath) {
  let workbook;
  try {
    workbook = xlsx.readFile(filePath, { cellDates: false });
  } catch (err) {
    throw new AiError(
      AI_ERROR_CODES_SK001.AI_FILE_INVALID,
      `文件无法解析为 Excel/CSV：${err && err.message ? err.message : '格式错误'}`,
    );
  }
  if (!workbook || !Array.isArray(workbook.SheetNames) || workbook.SheetNames.length === 0) {
    throw new AiError(AI_ERROR_CODES_SK001.AI_FILE_INVALID, '文件中没有工作表');
  }
  return workbook;
}

/** 选择工作表：优先指定名，否则第一个含非空单元格的表 */
function selectSheet(workbook, requestedName) {
  const names = workbook.SheetNames;
  let name = null;
  if (requestedName) {
    if (!names.includes(requestedName)) {
      throw new AiError(
        AI_ERROR_CODES.AI_INVALID_REQUEST,
        `工作表不存在: ${requestedName}（可用: ${names.join(' / ')}）`,
        { validationErrors: [{ field: 'sheet_name', code: 'NOT_FOUND', message: `工作表不存在: ${requestedName}` }] },
      );
    }
    name = requestedName;
  } else {
    for (const n of names) {
      const ws = workbook.Sheets[n];
      if (ws && Object.keys(ws).some((k) => !k.startsWith('!') && ws[k] && ws[k].v != null && ws[k].v !== '')) {
        name = n;
        break;
      }
    }
    if (!name) name = names[0];
  }
  return { name, worksheet: workbook.Sheets[name] };
}

/** 矩阵化（raw:false：格式化字符串统一入口，与 utils/excel.js readFile 现行用法一致） */
function extractMatrix(worksheet) {
  return xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: null, blankrows: false, raw: false });
}

/** 表头行检测：第一个「非空单元格数 ≥ 2」的行；列名去空/去重 */
function detectHeader(matrix) {
  const scanRows = Math.min(matrix.length, 10);
  for (let i = 0; i < scanRows; i++) {
    const row = matrix[i] || [];
    const nonEmpty = row.filter((c) => c != null && String(c).trim() !== '');
    if (nonEmpty.length >= 2) {
      const seen = new Map();
      const headers = row.map((c, idx) => {
        let h = c != null ? String(c).trim() : '';
        if (!h) h = `列${idx + 1}`;
        if (seen.has(h)) {
          const n = seen.get(h) + 1;
          seen.set(h, n);
          h = `${h}(${n})`;
        } else {
          seen.set(h, 1);
        }
        return h;
      });
      return { headerRowIndex: i, headers };
    }
  }
  return null;
}

/** 数值解析（严格格式：去千分位逗号；"3人"/"12%" 不算数值） */
function parseNumberLike(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v).trim().replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** 日期解析：复用 ExcelUtils.parseDate；SK-001 本地扩展两位年 m/d/yy（真实业务 Excel 常见）。
 *  口径假设：m/d/yy（Excel 美式导出惯例）；Excel 序列日期 v1 不做反解（实施报告登记）。 */
function parseDateLike(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return null;
  const s = String(v).trim();
  const std = ExcelUtils.parseDate(s);
  if (std) return std;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})(?:\s+\d{1,2}:\d{2}(:\d{2})?)?$/);
  if (m) {
    const year = 2000 + Number(m[3]);
    const month = String(Number(m[1])).padStart(2, '0');
    const day = String(Number(m[2])).padStart(2, '0');
    if (Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 && Number(day) <= 31) {
      return `${year}-${month}-${day}`;
    }
  }
  return null;
}

/** 列类型推断（采样）：number / date / mixed / string + 类型异常计数 */
function inferColumnType(values) {
  const samples = [];
  for (const v of values) {
    if (v != null && String(v).trim() !== '') samples.push(v);
    if (samples.length >= INPUT_LIMITS.typeSampleSize) break;
  }
  if (samples.length === 0) return { type: 'string', invalid: 0, sampled: 0 };

  let numCount = 0;
  let dateCount = 0;
  for (const v of samples) {
    if (parseNumberLike(v) != null) numCount++;
    else if (parseDateLike(v) != null) dateCount++;
  }
  const total = samples.length;
  if (numCount / total >= 0.8) {
    return { type: 'number', invalid: total - numCount, sampled: total };
  }
  if (dateCount / total >= 0.8) {
    return { type: 'date', invalid: total - dateCount, sampled: total };
  }
  if ((numCount + dateCount) / total >= 0.5) {
    return { type: 'mixed', invalid: total - numCount - dateCount, sampled: total };
  }
  return { type: 'string', invalid: 0, sampled: total };
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

/**
 * 确定性分析主引擎：解析 → 质量 → 统计 → 分组 → 排名 → 趋势 → 异常
 * @returns {{result:Object, warnings:string[]}}
 */
function analyzeDeterministic({ fileName, sheetName, sheetCount, matrix, headers, headerRowIndex }) {
  const warnings = [];
  const parsedAt = new Date().toISOString();

  // 列裁剪
  let cols = headers;
  if (cols.length > INPUT_LIMITS.maxCols) {
    warnings.push(`列数 ${cols.length} 超过上限 ${INPUT_LIMITS.maxCols}，仅分析前 ${INPUT_LIMITS.maxCols} 列。`);
    cols = cols.slice(0, INPUT_LIMITS.maxCols);
  }

  // 数据行
  let dataRows = matrix.slice(headerRowIndex + 1).map((r) => (Array.isArray(r) ? r.slice(0, cols.length) : []));
  const totalRowsInFile = dataRows.length;
  if (totalRowsInFile > INPUT_LIMITS.maxRows) {
    warnings.push(`数据行数 ${totalRowsInFile} 超过上限 ${INPUT_LIMITS.maxRows}，仅分析前 ${INPUT_LIMITS.maxRows} 行（统计结果基于截断后数据）。`);
    dataRows = dataRows.slice(0, INPUT_LIMITS.maxRows);
  }

  const rowCount = dataRows.length;

  // 每列取值与类型推断
  const columnValues = cols.map((_, ci) => dataRows.map((r) => (r[ci] == null ? null : r[ci])));
  const columnMeta = cols.map((name, ci) => {
    const { type, invalid, sampled } = inferColumnType(columnValues[ci]);
    const nonEmpty = columnValues[ci].filter((v) => v != null && String(v).trim() !== '').length;
    return {
      name,
      type,
      non_empty: nonEmpty,
      empty: rowCount - nonEmpty,
      empty_rate: rowCount > 0 ? round4((rowCount - nonEmpty) / rowCount) : 0,
      invalid: type === 'string' ? 0 : invalid,
      sampled,
    };
  });

  // 质量检查：重复行（整行全字段比对，字符串 trim 后）
  const rowSigMap = new Map();
  let duplicateRows = 0;
  const duplicateSamples = [];
  for (let ri = 0; ri < dataRows.length; ri++) {
    const sig = JSON.stringify((dataRows[ri] || []).map((v) => (v == null ? '' : String(v).trim())));
    if (rowSigMap.has(sig)) {
      duplicateRows++;
      rowSigMap.get(sig).dupAt.push(ri + 1);
      if (duplicateSamples.length < 5 && rowSigMap.get(sig).dupAt.length === 2) {
        duplicateSamples.push({ first_row: rowSigMap.get(sig).firstAt, dup_row: ri + 1 });
      }
    } else {
      rowSigMap.set(sig, { firstAt: ri + 1, dupAt: [] });
    }
  }
  const nonEmptyRows = dataRows.filter((r) => (r || []).some((v) => v != null && String(v).trim() !== '')).length;
  const emptyCells = columnMeta.reduce((s, c) => s + c.empty, 0);

  const quality = {
    total_rows: rowCount,
    non_empty_rows: nonEmptyRows,
    empty_cells: emptyCells,
    empty_rate: rowCount * cols.length > 0 ? round4(emptyCells / (rowCount * cols.length)) : 0,
    duplicate_rows: duplicateRows,
    duplicate_samples: duplicateSamples,
    truncated_rows: totalRowsInFile - rowCount,
    truncated_cols: headers.length - cols.length,
  };

  // 数值统计（前 maxStatColumns 个数值列）
  const numericCols = columnMeta
    .map((m, ci) => ({ ...m, ci }))
    .filter((m) => m.type === 'number')
    .slice(0, INPUT_LIMITS.maxStatColumns);
  const statistics = numericCols.map((m) => {
    const nums = columnValues[m.ci].map(parseNumberLike).filter((n) => n != null);
    const sum = nums.reduce((s, n) => s + n, 0);
    return {
      column: m.name,
      count: nums.length,
      empty_or_invalid: rowCount - nums.length,
      sum: round4(sum),
      mean: nums.length ? round4(sum / nums.length) : null,
      min: nums.length ? round4(Math.min(...nums)) : null,
      max: nums.length ? round4(Math.max(...nums)) : null,
    };
  });

  // 分组统计（string 列，distinct ∈ [2,50]，取非空数前 maxGroupCards 列）
  const distinctOf = (ci) => new Set(columnValues[ci].map((v) => (v == null ? null : String(v).trim()))).size;
  const categoryCols = columnMeta
    .map((m, ci) => ({ ...m, ci }))
    .filter((m) => (m.type === 'string' || m.type === 'mixed') && distinctOf(m.ci) >= 2 && distinctOf(m.ci) <= 50)
    .sort((a, b) => b.non_empty - a.non_empty)
    .slice(0, INPUT_LIMITS.maxGroupCards);
  const group_by = categoryCols.map((m) => {
    const counter = new Map();
    for (const v of columnValues[m.ci]) {
      if (v == null || String(v).trim() === '') continue;
      const key = String(v).trim();
      counter.set(key, (counter.get(key) || 0) + 1);
    }
    const items = [...counter.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, INPUT_LIMITS.maxGroupItems)
      .map(([value, count]) => ({ value, count, share: rowCount > 0 ? round4(count / rowCount) : 0 }));
    return {
      column: m.name,
      distinct: counter.size,
      truncated: counter.size > INPUT_LIMITS.maxGroupItems,
      items,
    };
  });

  // 排名（类别列 × 数值列组合，按数值列 sum 降序 top N）
  const ranking = [];
  const rankPairs = [];
  for (const cc of categoryCols.slice(0, 2)) {
    for (const nc of numericCols.slice(0, 2)) {
      rankPairs.push({ category: cc, numeric: nc });
      if (rankPairs.length >= INPUT_LIMITS.maxRankingCards) break;
    }
    if (rankPairs.length >= INPUT_LIMITS.maxRankingCards) break;
  }
  for (const pair of rankPairs) {
    const agg = new Map();
    for (let ri = 0; ri < dataRows.length; ri++) {
      const cv = columnValues[pair.category.ci][ri];
      const nv = parseNumberLike(columnValues[pair.numeric.ci][ri]);
      if (cv == null || String(cv).trim() === '' || nv == null) continue;
      const key = String(cv).trim();
      const cur = agg.get(key) || { sum: 0, count: 0 };
      cur.sum += nv;
      cur.count += 1;
      agg.set(key, cur);
    }
    const items = [...agg.entries()]
      .sort((a, b) => b[1].sum - a[1].sum)
      .slice(0, INPUT_LIMITS.maxGroupItems)
      .map(([value, v]) => ({
        value,
        sum: round4(v.sum),
        mean: v.count ? round4(v.sum / v.count) : null,
        count: v.count,
      }));
    ranking.push({
      by: pair.numeric.name,
      of: pair.category.name,
      items,
      note: `按「${pair.category.name}」分组对「${pair.numeric.name}」求和降序排名（仅统计两者均有效的行）`,
    });
  }

  // 趋势（date 列，≥3 个不同期；粒度：跨度≤62天按日，否则按月）
  let trend = [];
  const dateCols = columnMeta.map((m, ci) => ({ ...m, ci })).filter((m) => m.type === 'date');
  for (const dc of dateCols.slice(0, 1)) {
    const parsed = columnValues[dc.ci].map(parseDateLike);
    const valid = parsed.filter(Boolean);
    if (valid.length < 3) continue;
    const sorted = [...valid].sort();
    const spanDays = Math.round((new Date(sorted[sorted.length - 1]) - new Date(sorted[0])) / 86400000);
    const granularity = spanDays <= 62 ? 'day' : 'month';
    const keyOf = (d) => (granularity === 'day' ? d : d.slice(0, 7));
    const pointsMap = new Map();
    for (let ri = 0; ri < dataRows.length; ri++) {
      const d = parsed[ri];
      if (!d) continue;
      const k = keyOf(d);
      if (!pointsMap.has(k)) pointsMap.set(k, { count: 0, sums: {} });
      const p = pointsMap.get(k);
      p.count += 1;
      for (const nc of numericCols.slice(0, 2)) {
        const nv = parseNumberLike(columnValues[nc.ci][ri]);
        if (nv != null) p.sums[nc.name] = round4((p.sums[nc.name] || 0) + nv);
      }
    }
    let points = [...pointsMap.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([period, v]) => ({ period, count: v.count, sums: v.sums }));
    let truncated = false;
    if (points.length > INPUT_LIMITS.maxTrendPoints) {
      points = points.slice(0, INPUT_LIMITS.maxTrendPoints);
      truncated = true;
      warnings.push(`趋势期数超过 ${INPUT_LIMITS.maxTrendPoints}，仅保留前 ${INPUT_LIMITS.maxTrendPoints} 期。`);
    }
    trend.push({
      column: dc.name,
      granularity,
      span: { from: sorted[0], to: sorted[sorted.length - 1], days: spanDays },
      invalid_dates: rowCount - valid.length,
      truncated,
      points,
    });
  }

  // 异常（数值列 z-score |z|≥3；高空值列；重复行）
  const anomalies = { zscore: [], high_empty_cols: [], duplicates: duplicateRows > 0 ? duplicateRows : null };
  for (const m of numericCols) {
    const stats = statistics.find((s) => s.column === m.name);
    if (!stats || stats.count < 8 || stats.mean == null) continue;
    const nums = columnValues[m.ci].map(parseNumberLike).filter((n) => n != null);
    const variance = nums.reduce((s, n) => s + (n - stats.mean) ** 2, 0) / nums.length;
    const std = Math.sqrt(variance);
    if (!std || !Number.isFinite(std) || std === 0) continue;
    const found = [];
    for (let ri = 0; ri < dataRows.length && found.length < 5; ri++) {
      const nv = parseNumberLike(columnValues[m.ci][ri]);
      if (nv == null) continue;
      const z = (nv - stats.mean) / std;
      if (Math.abs(z) >= 3) found.push({ column: m.name, row: ri + 1, value: round4(nv), z: round4(z) });
    }
    anomalies.zscore.push(...found);
  }
  anomalies.zscore = anomalies.zscore.slice(0, INPUT_LIMITS.maxAnomalyItems);
  anomalies.high_empty_cols = columnMeta
    .filter((c) => rowCount >= 5 && c.empty_rate >= 0.3)
    .map((c) => ({ column: c.name, empty_rate: c.empty_rate }));

  const result = {
    dataset: {
      file_name: fileName,
      sheet_name: sheetName,
      sheet_count: sheetCount,
      row_count: rowCount,
      column_count: cols.length,
      total_rows_in_file: totalRowsInFile,
      parsed_at: parsedAt,
      engine: 'sk001-deterministic-v1（xlsx raw:false + 程序统计，AI 未参与计算）',
    },
    quality,
    columns: columnMeta.map(({ name, type, non_empty, empty, empty_rate, invalid }) => ({
      name,
      type,
      non_empty,
      empty,
      empty_rate,
      invalid,
    })),
    statistics,
    group_by,
    ranking,
    trend,
    anomalies,
    sample_rows: dataRows.slice(0, 3).map((r) => {
      const obj = {};
      cols.forEach((c, i) => {
        obj[c] = r[i] == null ? null : String(r[i]);
      });
      return obj;
    }),
  };

  if (quality.truncated_rows > 0 || quality.truncated_cols > 0) {
    // 已在上方 push 明细，这里不重复
  }
  if (rowCount === 0) {
    warnings.push('工作表没有数据行，无法进行统计分析。');
  }

  return { result, warnings };
}

// ============================================================
// Evidence（§十三：来自 Excel→Worksheet→确定性计算结果；缺失字段 null，不伪造）
// ============================================================

/** 由确定性分析结果构建统一证据（createEvidence；sourceType=business_record） */
function buildEvidence(result, warnings) {
  const evidence = [];
  const base = {
    sourceType: 'business_record',
    sourceId: result.dataset.file_name,
    sourceDomain: SKILL_KEY,
  };
  const push = (sourceField, text, strength = 'high') => {
    if (!text) return;
    if (evidence.length >= INPUT_LIMITS.evidenceMaxItems) return;
    evidence.push(createEvidence({ ...base, sourceField, evidenceText: text, evidenceStrength: strength }));
  };

  push(
    'dataset',
    `文件「${result.dataset.file_name}」工作表「${result.dataset.sheet_name}」：` +
      `${result.dataset.row_count} 行 × ${result.dataset.column_count} 列` +
      `（工作表共 ${result.dataset.sheet_count} 个，文件内总数据行 ${result.dataset.total_rows_in_file}）。`
  );
  push(
    'quality',
    `数据质量：空单元格 ${result.quality.empty_cells}（占比 ${result.quality.empty_rate}），` +
      `完全重复行 ${result.quality.duplicate_rows} 行，非空数据行 ${result.quality.non_empty_rows} 行。` +
      (result.anomalies.high_empty_cols.length
        ? `高空值列：${result.anomalies.high_empty_cols.map((c) => `${c.column}(${c.empty_rate})`).join('、')}。`
        : '')
  );
  if (result.statistics.length > 0) {
    push(
      'statistics',
      `数值统计：` +
        result.statistics
          .map((s) => `${s.column}：count=${s.count} sum=${s.sum} mean=${s.mean} min=${s.min} max=${s.max}`)
          .join('；')
    );
  }
  for (const g of result.group_by.slice(0, 2)) {
    push(
      `group_by:${g.column}`,
      `按「${g.column}」分组（distinct=${g.distinct}）Top：` +
        g.items.map((it, i) => `${i + 1}.${it.value}（${it.count}，${it.share}）`).join('；')
    );
  }
  for (const r of result.ranking.slice(0, 2)) {
    push(
      `ranking:${r.by}@${r.of}`,
      `排名（${r.note}）Top：` +
        r.items.map((it, i) => `${i + 1}.${it.value}（sum=${it.sum}，count=${it.count}）`).join('；')
    );
  }
  for (const t of result.trend.slice(0, 1)) {
    const head = t.points.slice(0, 6).map((p) => `${p.period}:${p.count}`).join('、');
    push(
      `trend:${t.column}`,
      `趋势（${t.column}，粒度=${t.granularity}，跨度 ${t.span.from}~${t.span.to}）：` +
        `前 ${Math.min(6, t.points.length)} 期记录数 ${head}${t.points.length > 6 ? ' …' : ''}`
    );
  }
  if (result.anomalies.zscore.length > 0) {
    push(
      'anomalies',
      `数值异常（z-score |z|≥3）：` +
        result.anomalies.zscore.map((a) => `${a.column} 第${a.row}行=${a.value}(z=${a.z})`).join('；')
    );
  }
  if (warnings.length > 0) {
    push('processing_notes', `处理警告：${warnings.join(' ')}`, 'medium');
  }
  return evidence;
}

// ============================================================
// AI 上下文压缩（§三十一/§三十二：只发结构化分析结果，不发原始 Excel）
// ============================================================

function compactForAi(result) {
  const clone = JSON.parse(JSON.stringify(result));
  delete clone.sample_rows;
  return clone;
}

/**
 * AI 上下文专用重标签：数字字段中文化命名，防止模型把「合计」误读为「次数」
 * （实测 qwen2.5 将 sums.序号=122 误述为「违章次数122次」）。
 * 仅作用于发给 AI 的上下文；对外 result 协议保持英文键不变。
 */
function relabelForAi(r) {
  const out = JSON.parse(JSON.stringify(r));
  if (out.dataset) {
    out.dataset = {
      文件名: out.dataset.file_name,
      工作表: out.dataset.sheet_name,
      工作表数: out.dataset.sheet_count,
      数据行数: out.dataset.row_count,
      列数: out.dataset.column_count,
    };
  }
  if (out.quality) {
    out.quality = {
      数据行数: out.quality.total_rows,
      非空行数: out.quality.non_empty_rows,
      空单元格数: out.quality.empty_cells,
      空值率: out.quality.empty_rate,
      完全重复行数: out.quality.duplicate_rows,
    };
  }
  if (Array.isArray(out.columns)) {
    out.columns = out.columns.map((c) => ({ 列名: c.name, 类型: c.type, 空值率: c.empty_rate, 非法值数: c.invalid }));
  }
  if (Array.isArray(out.statistics)) {
    out.statistics = out.statistics.map((s) => ({
      列: s.column, 非空值数: s.count, 空或非法值数: s.empty_or_invalid,
      合计: s.sum, 均值: s.mean, 最小值: s.min, 最大值: s.max,
    }));
  }
  if (Array.isArray(out.group_by)) {
    out.group_by = out.group_by.map((g) => ({
      分组列: g.column,
      不同取值数: g.distinct,
      items: (g.items || []).map((it) => ({ 值: it.value, 出现次数: it.count, 占比: it.share })),
    }));
  }
  if (Array.isArray(out.ranking)) {
    out.ranking = out.ranking.map((r2) => ({
      按列: r2.by, 对列: r2.of, 说明: r2.note,
      items: (r2.items || []).map((it) => ({ 值: it.value, 合计: it.sum, 均值: it.mean, 出现次数: it.count })),
    }));
  }
  if (Array.isArray(out.trend)) {
    out.trend = out.trend.map((t) => ({
      时间列: t.column,
      粒度: t.granularity,
      非法日期数: t.invalid_dates,
      points: (t.points || []).map((p) => {
        const row = { 期间: p.period, 记录条数: p.count };
        for (const [k, v] of Object.entries(p.sums || {})) row[`${k}合计`] = v;
        return row;
      }),
    }));
  }
  if (out.anomalies) {
    out.anomalies = {
      Z分数异常点: (out.anomalies.zscore || []).map((z) => ({ 列: z.column, 行号: z.row, 数值: z.value, Z分数: z.z })),
      高空值列: (out.anomalies.high_empty_cols || []).map((c) => ({ 列: c.column, 空值率: c.empty_rate })),
      完全重复行数: out.anomalies.duplicates,
    };
  }
  return out;
}

/** 控制给 AI 的上下文体积；超预算时逐级降载并告警 */
function limitAiContext(result, warnings) {
  const base = relabelForAi(compactForAi(result));
  let text = JSON.stringify(base);
  if (text.length <= INPUT_LIMITS.aiContextMaxChars) return text;

  const trimmed = JSON.parse(text);
  trimmed.group_by = trimmed.group_by.map((g) => ({ ...g, items: g.items.slice(0, 3) }));
  trimmed.ranking = trimmed.ranking.map((r) => ({ ...r, items: r.items.slice(0, 3) }));
  if (trimmed.trend) {
    trimmed.trend = trimmed.trend.map((t) => ({
      ...t,
      points: t.points.length > 12 ? [...t.points.slice(0, 6), ...t.points.slice(-6)] : t.points,
    }));
  }
  text = JSON.stringify(trimmed);
  if (text.length <= INPUT_LIMITS.aiContextMaxChars) {
    warnings.push('数据规模较大，已压缩提供给 AI 的确定性分析上下文（分组/排名仅保留前 3 项、趋势保留首尾各 6 期）。统计数字未删减，完整结果以 result 字段为准。');
    return text;
  }
  warnings.push('数据规模超出 AI 上下文预算，AI 解读仅基于数据概况与质量摘要；完整确定性统计以 result 字段为准。');
  return JSON.stringify({
    dataset: trimmed.dataset,
    quality: trimmed.quality,
    statistics_head: trimmed.statistics.slice(0, 4),
    note: '完整统计见接口 result 字段（未发送给 AI）',
  });
}

/**
 * AI 数字一致性检查（最小实现，确定性）：answer 中出现、但程序统计数字集合中
 * 不存在的数字 → warning（§核心原则：不一致时信程序）。
 * 允许集合：程序结果全部数值（含占比×100 百分位口径）；年份 1900~2100；
 * 1~row_count+10 的行号/序数；类别值字符串内含的数字（如「100元」）。
 * 已知局限：无法识别「真实数字 + 错误归属」（如把 A 月合计说成 B 月次数）——
 * 由上下文中文重标签 + Prompt 字段纪律 + 前端「以 result 为准」三重防线兜底。
 * @returns {null|string} null=通过；否则返回告警文案
 */
function checkAiNumberConsistency(answer, det) {
  if (!answer || !det) return null;
  const nums = new Set();
  const strs = [];
  (function walk(o) {
    if (o == null) return;
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (typeof o === 'object') { Object.values(o).forEach(walk); return; }
    if (typeof o === 'number' && Number.isFinite(o)) {
      nums.add(Math.round(o * 10000) / 10000);
      nums.add(Math.round(o * 100) / 100);
      if (Math.abs(o) < 1) nums.add(Math.round(o * 10000) / 100); // 占比 → 百分数（29.32）
    } else if (typeof o === 'string' && o.trim()) {
      strs.push(o.trim());
    }
  })(det);
  const found = answer.match(/-?\d+(?:\.\d+)?/g) || [];
  const unknown = [];
  for (const s of found) {
    const n = Number(s);
    if (nums.has(Math.round(n * 10000) / 10000) || nums.has(Math.round(n * 100) / 100)) continue;
    if (n >= 1900 && n <= 2100) continue; // 年份
    if (Number.isInteger(n) && n >= 1 && n <= (det.dataset?.row_count || 0) + 10) continue; // 行号/序数
    if (strs.some((str) => str.includes(s))) continue; // 类别值内含数字
    if (!unknown.includes(s)) unknown.push(s);
  }
  if (unknown.length === 0) return null;
  return `AI 解读中出现程序统计结果中不存在的数字（${unknown.slice(0, 5).join('、')}），相关表述不可作为事实依据，统计数字请以 result 确定性计算结果为准。`;
}

// ============================================================
// 输出组装（§十七 / §十八）
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

/** 置信度：确定性结果质量 + AI 是否拒绝解读 */
function deriveConfidence(result, warnings, aiText) {
  if (/无法解读|无法分析|数据不足以|无法给出/.test(String(aiText || ''))) return 'low';
  let score = 2;
  if (result.dataset.row_count >= 5) score--;
  if (result.quality.empty_rate <= 0.2) score--;
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
        analysis_goal: { type: 'string', required: false, maxLength: INPUT_LIMITS.analysisGoalMaxLength, note: '分析目标；缺省为通用分析' },
        sheet_name: { type: 'string', required: false, note: '指定工作表名；缺省取第一个非空工作表' },
      },
    },
    scope_note: 'scope 为公共协议保留字段；SK-001 数据范围为「上传文件本身」，无行级数据范围（如实登记）',
    output_schema: {
      success: 'boolean',
      skill: 'object',
      request_id: 'string',
      result: 'object（确定性分析结果：dataset/quality/columns/statistics/group_by/ranking/trend/anomalies/sample_rows）',
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
// 记录（§二十一：复用 ai_generation_records；R2 缺口以 type/sub_type 近似，不做 migration）
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
 * SK-001 Excel 数据分析
 * @param {Object} input - { filePath, fileName, analysis_goal, sheet_name }
 * @param {{userId:number|null, role:string|null}} actor - req.user 派生最小字段
 * @returns {Promise<Object>} 统一输出协议（result 为核心 + answer 为 AI 解释）
 */
async function analyze(input = {}, actor = {}) {
  const startAt = Date.now();
  const norm = normalizeInput(input);

  // 1) 输入校验 → 结构化错误
  const { valid, errors } = validateInput(norm);
  if (!valid) {
    throw new AiError(
      AI_ERROR_CODES.AI_INVALID_REQUEST,
      `SK-001 输入校验失败：${errors.map((e) => e.message).join('；')}`,
      { validationErrors: errors }
    );
  }

  // 2) 权限
  const perm = resolvePermission(actor);
  const warnings = [];
  const suggestions = [];

  // 3) 文件存在性
  if (!input.filePath || !fs.existsSync(input.filePath)) {
    throw new AiError(AI_ERROR_CODES_SK001.AI_FILE_INVALID, '上传文件不存在或已被清理，请重新上传');
  }

  // 4) 解析 → 表头 → 确定性分析（确定性引擎失败 → 结构化错误 + 失败记录）
  let analysis;
  try {
    const workbook = loadWorkbook(input.filePath);
    const { name: sheetName, worksheet } = selectSheet(workbook, norm.sheet_name);
    const matrix = extractMatrix(worksheet);
    const header = detectHeader(matrix);
    if (!header) {
      const err = new AiError(
        AI_ERROR_CODES_SK001.AI_FILE_INVALID,
        '未找到有效表头行（前 10 行内没有至少 2 个非空表头单元格的行）'
      );
      err._safeRecord = {
        title: `${input.fileName}：${norm.analysis_goal}`,
        status: 'failed',
        errorMessage: '无有效表头',
      };
      throw err;
    }
    analysis = analyzeDeterministic({
      fileName: input.fileName,
      sheetName,
      sheetCount: workbook.SheetNames.length,
      matrix,
      headers: header.headers,
      headerRowIndex: header.headerRowIndex,
    });
  } catch (err) {
    if (err && err.name === 'AiError' && err.code !== AI_ERROR_CODES.AI_INVALID_REQUEST) {
      await _saveSkillRecord({
        actor,
        title: `${input.fileName || ''}：${norm.analysis_goal}`,
        status: 'failed',
        requestId: createRequestContext({ userId: actor.userId }).requestId,
        provider: null,
        model: null,
        durationMs: Date.now() - startAt,
        result: null,
        evidence: null,
        errorMessage: err.message,
      });
    }
    throw err;
  }

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
      file_name: det.dataset.file_name,
      sheet_name: det.dataset.sheet_name,
      sheet_count: det.dataset.sheet_count,
      row_count: det.dataset.row_count,
      column_count: det.dataset.column_count,
    },
    permission_model: perm.permission_model,
    disclaimer: DISCLAIMER,
  };

  // 5) 无法分析（0 数据行 / 无有效列）→ 安全返回（T05：success=true，不调 AI，不编造）
  if (det.dataset.row_count === 0 || det.columns.length === 0) {
    const requestId = createRequestContext({ userId: actor.userId }).requestId;
    const rec = await _saveSkillRecord({
      actor,
      title: `${det.dataset.file_name}：${norm.analysis_goal}`,
      status: 'success',
      requestId,
      provider: null,
      model: null,
      durationMs: Date.now() - startAt,
      result: UNANALYZABLE_TEXT,
      evidence: null,
    });
    suggestions.push('请检查文件是否包含表头行与数据行后重新上传');
    return {
      success: true,
      skill: skillBlock(),
      request_id: requestId,
      result: det,
      answer: UNANALYZABLE_TEXT,
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

  // 6) Evidence（确定性结果 → 统一证据；传入 Gateway 与响应同源）
  const evidence = buildEvidence(det, warnings);

  // 7) AI 上下文（§三十二：结构化分析结果，非原始 Excel）
  const aiContext = limitAiContext(det, warnings);

  // 8) AI Gateway（禁止直连 Provider；Prompt Registry + Evidence + Record 统一收敛）
  const policy = MODEL_POLICIES[SKILL_TYPE];
  let gatewayResult;
  try {
    gatewayResult = await gateway.generate({
      promptKey: policy.promptKey,
      promptVersion: policy.promptVersion,
      data: aiContext,
      customInstructions: norm.analysis_goal,
      evidence,
      provider: policy.provider,
      options: policy.options,
      userId: actor.userId,
      sourceDomain: SKILL_KEY,
      record: {
        type: SKILL_TYPE,
        subType: SKILL_ID,
        title: `${det.dataset.file_name}：${norm.analysis_goal}`,
      },
    });
  } catch (err) {
    // Provider / Gateway 异常：结构化错误 + 失败记录（T06 / T10）
    await _saveSkillRecord({
      actor,
      title: `${det.dataset.file_name}：${norm.analysis_goal}`,
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

  // 9) 统一输出（§十七：result 核心 + answer；§三十三：数字以 result 为准）
  const confidence = deriveConfidence(det, warnings, gatewayResult.content);
  const inconsistent = checkAiNumberConsistency(gatewayResult.content, det);
  if (inconsistent) warnings.push(inconsistent);
  if (det.quality.duplicate_rows > 0) {
    suggestions.push('文件存在完全重复行，建议先清洗数据再做正式统计口径分析');
  }
  if (det.anomalies.high_empty_cols.length > 0) {
    suggestions.push('部分列空值率较高，建议核对数据采集/导出流程');
  }
  suggestions.push('统计数字以 result 确定性计算结果为准，AI 文字仅为解读');

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
  AI_ERROR_CODES_SK001,
  DISCLAIMER,
  normalizeInput,
  validateInput,
  resolvePermission,
  loadWorkbook,
  selectSheet,
  extractMatrix,
  detectHeader,
  inferColumnType,
  analyzeDeterministic,
  buildEvidence,
  limitAiContext,
  deriveConfidence,
  manifest,
  analyze,
  _internal: { EVIDENCE_SOURCE_TYPES },
};

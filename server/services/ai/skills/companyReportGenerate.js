/**
 * SK-004 报告生成 Skill（company.report.generate v1.0.0）—— AI-Phase-01-07
 *
 * 定位（任务书 §三/§四）：公司级结构化业务报告生成 Skill，不是「AI 自由写报告」。
 * 核心原则：**事实先于文字** ——
 *   结构化事实 → 确定性结果 → Evidence → 报告结构规划 → AI 文字生成 → 事实一致性检查 → 结构化报告。
 *
 * 职责边界（§五/§六）：
 *   - SK-004 不得重新计算核心业务数据（不能成为第二个 SK-003）；报告需要新统计指标时回 SK-003 层；
 *   - 确定性表格由程序从 facts/analysis 直接组装（§二十四/§二十五），AI 只写文字、不得改数；
 *   - 不在核心中硬编码 HSE 专业规则（§二十）：输入已含的等级结论可忠实转述，不得自行判定。
 *
 * 复用与边界：
 *   - 复用 aiPromptRegistry / aiEvidenceService / aiGateway / ai_generation_records（§三十~§三十四）；
 *   - Evidence 复用 aiEvidenceService（§十四，不建第二套）；输出层的 ev_001 引用 id 仅为
 *     「sections[].evidence_ids → evidence[]」的输出索引，不是新 Evidence 系统；
 *   - Model Policy：provider=null 交 Gateway/Provider Registry（§三十二），禁止直连模型；
 *   - GR：type=report_generation / sub_type=SK-004（§三十三，R2 缺口以 type/sub_type 近似，不做 migration）;
 *   - 权限复用 JWT + SKILL_USER + 角色 allowlist（§三十四），与 SK-005/SK-001/SK-002/SK-003 同一清单；
 *   - 事实一致性双层检查（§四十四）：生成前事实锁定（factIndex）+ 生成后 checkReportFactConsistency，
 *     不一致 → warnings + 自动重试一次 → 仍不一致 → 标记人工审核，禁止静默通过；
 *   - 不修改 SK-001~003（§四十）；R1~R5 冻结只记录（§四十一）。
 */

const { AI_ERROR_CODES, AiError } = require('../errors');
const gateway = require('../aiGateway');
const { createRequestContext } = require('../aiRequestContext');
const { createEvidence, validateEvidenceList } = require('../aiEvidenceService');
const generationRecordService = require('../aiGenerationRecordService');

// ============================================================
// Skill 元数据（标准定义，AI-Phase-01-01 §4；任务书 §二）
// ============================================================
const SKILL_ID = 'SK-004';
const SKILL_NAME = '报告生成';
const SKILL_KEY = 'company.report.generate';
const SKILL_VERSION = 'v1.0.0';
const SKILL_DOMAIN = 'company';
const SKILL_TYPE = 'report_generation';
/** 生命周期（AI-Phase-01-01 §5~§6）：初始 Testing，A~Z 验收全过后转 Active（不跳过）。 */
const SKILL_STATUS = 'Active';
const SKILL_OWNER = 'company-ai';

/** 允许调用 SK-004 的角色（与 SK-005/SK-001/SK-002/SK-003 逐字一致，fail-closed，§三十四） */
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
 * Model Policy（§三十二：模型不得写死，provider=null 交 Gateway 当前活动 Provider）。
 * maxTokens=2600：六章节 JSON（摘要+每节 120~250 字+suggestions）实测预估 ~2000 token，留余量。
 */
const MODEL_POLICIES = {
  report_generation: {
    provider: null,
    promptKey: SKILL_KEY,
    promptVersion: SKILL_VERSION,
    options: { temperature: 0.2, maxTokens: 2600 },
  },
};

/** 输入与处理边界（任务书 §八/§九/§三十九） */
const INPUT_LIMITS = {
  titleMaxLength: 200,
  reportGoalMaxLength: 500,
  sectionsMax: 20,
  sectionTitleMaxLength: 100,
  evidenceMaxItems: 50,
  factsMaxChars: 50000,
  analysisMaxChars: 300000,
  documentMaxChars: 100000,
  documentDigestMaxChars: 1600,
  /** AI 上下文预算：事实清单+约束+确定性表格+证据（SK-003 T17 教训：任何降级档都不得把 AI 置于「没有事实素材」状态） */
  aiContextMaxChars: 4200,
  aiRetryMax: 2,
  factMaxItems: 80,
  tableRowsMax: 12,
};

/** 报告类型（§九：第一版至少支持五种，不提前开发几十种） */
const REPORT_TYPES = {
  inspection_monthly: { label: '检查月度分析', defaultTitle: '检查情况分析报告' },
  inspection_summary: { label: '检查工作总结', defaultTitle: '检查工作情况总结报告' },
  business_analysis: { label: '业务分析', defaultTitle: '业务分析报告' },
  management_report: { label: '管理汇报', defaultTitle: '管理工作情况报告' },
  custom: { label: '自定义报告', defaultTitle: '综合分析报告' },
};

/** 章节默认标题（key → 标题；用户/模板指定优先） */
const SECTION_TITLE_BY_KEY = {
  overview: '总体情况',
  trend: '趋势变化',
  ranking: '结构分布与排名',
  problems: '重点问题',
  findings: '重点发现',
  anomalies: '异常与数据质量',
  quality: '数据质量说明',
  suggestions: '下一步建议',
  changes: '重点变化',
};

/** 自动章节规划（§十二：数据驱动——没有异常不硬写异常严重，数据不足明确说明） */
const AUTO_SECTIONS = {
  inspection_monthly: [
    { key: 'overview', title: '总体情况' },
    { key: 'trend', title: '检查趋势' },
    { key: 'ranking', title: '重点区域' },
    { key: 'problems', title: '重点问题' },
    { key: 'anomalies', title: '异常情况' },
    { key: 'suggestions', title: '下一步建议' },
  ],
  default: [
    { key: 'overview', title: '总体情况' },
    { key: 'findings', title: '重点发现' },
    { key: 'anomalies', title: '异常与数据质量' },
    { key: 'suggestions', title: '下一步建议' },
  ],
};

/** 中文标题 → 语义 key 反查（用户以中文写章节名时仍映射到语义键，如「总体情况」→ overview） */
const SECTION_KEY_BY_TITLE = (() => {
  const m = new Map();
  for (const [key, title] of Object.entries(SECTION_TITLE_BY_KEY)) if (!m.has(title)) m.set(title, key);
  for (const list of Object.values(AUTO_SECTIONS)) for (const s of list) if (!m.has(s.title)) m.set(s.title, s.key);
  return m;
})();

/** 安全文案（§二十六：数据为空 ≠ 业务未发生） */
const NO_DATA_TEXT = '当前没有有效数据，无法判断本月实际检查情况。';
const NO_DATA_NOTE =
  '该结果仅说明「当前输入无可用数据」，不代表「未开展检查/业务未发生」；请确认数据来源与筛选条件后重试。';
const MISSING_SECTION_TEXT = '该章节内容生成缺失，建议人工补充核实。';
const NO_EVIDENCE_TEXT = '该结论缺少可追溯数据依据，暂不形成确定性表述。';

const DISCLAIMER = '本报告由 AI 辅助生成，所有统计数字以确定性事实/分析结果为准，发布前必须经人工审核。';

// ============================================================
// 通用工具
// ============================================================

function permissionError(message) {
  const err = new Error(message);
  err.name = 'SkillPermissionError';
  err.code = 'SKILL_PERMISSION_DENIED';
  return err;
}

function isPlainObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function strOrNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

/** 占比小数 → 百分数字符串（与 SK-003 pctStr 同口径） */
function pctStr(f) {
  const n = Number(f);
  if (!Number.isFinite(n)) return '-';
  return `${(n * 100).toFixed(1)}%`;
}

const ZH_NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十'];

/** 章节标题中文序号前缀（已有序号则不重复加） */
function numberedTitle(i, title) {
  const t = String(title || '').trim();
  if (/^[(（]?[一二三四五六七八九十0-9第]/.test(t)) return t;
  const zh = ZH_NUMS[i] || String(i + 1);
  return `${zh}、${t}`;
}

function tryParseJson(s) {
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

function jsonSize(v) {
  try {
    return JSON.stringify(v || null).length;
  } catch {
    return Infinity;
  }
}

/** 提取文本中的全部数字（含位置）；负号仅在前一字符非数字时视为符号（避免 2026-08 被拆成 -08） */
function numberPositions(text) {
  const re = /(?<!\d)-?\d+(?:\.\d+)?/g;
  const out = [];
  let m;
  while ((m = re.exec(text))) out.push({ n: Number(m[0]), raw: m[0], i: m.index });
  return out;
}

/** 期间字符串 → 时间表述词集合（2026-09 → {2026-09, 2026年9月, 9月}） */
function periodTokens(period) {
  const p = String(period || '').trim();
  const toks = new Set(p ? [p] : []);
  const m = /^(\d{4})-(\d{1,2})$/.exec(p);
  if (m) {
    const y = m[1];
    const mo = parseInt(m[2], 10);
    toks.add(`${y}年${mo}月`);
    toks.add(`${y}年${m[2]}月`);
    toks.add(`${mo}月`);
  }
  return [...toks];
}

/** 期间/时间表述是否可作为归属检查 token（过短易误伤，需含中文或为标准期间格式） */
function isUsableToken(tok) {
  const t = String(tok || '').trim();
  if (t.length < 2) return false;
  if (/^\d{4}-\d{1,2}$/.test(t)) return true;
  if (/^\d{4}年\d{1,2}月$/.test(t)) return true;
  if (/^\d{1,2}月$/.test(t)) return true;
  return /[\u4e00-\u9fa5]/.test(t) && t.length >= 2;
}

// ============================================================
// 输入归一化与校验（§八/§九；先鉴权再处理输入由控制器+Skill 内共同保证）
// ============================================================

function normalizeInput(raw = {}) {
  const r = isPlainObject(raw) ? raw : {};
  const boolOf = (v, dflt) => {
    if (v == null || String(v).trim() === '') return dflt;
    return v === true || v === 'true';
  };
  return {
    report_type: strOrNull(r.report_type),
    title: strOrNull(r.title),
    report_goal: strOrNull(r.report_goal),
    facts: isPlainObject(r.facts) ? r.facts : null,
    analysis: isPlainObject(r.analysis) ? r.analysis : null,
    evidence: Array.isArray(r.evidence) ? r.evidence : null,
    document: isPlainObject(r.document) ? r.document : null,
    template: isPlainObject(r.template) ? r.template : null,
    sections: Array.isArray(r.sections) ? r.sections : null,
    style: isPlainObject(r.style) ? r.style : null,
    require_citation: boolOf(r.require_citation, true),
  };
}

function validateInput(norm) {
  const errors = [];
  if (norm.report_type && !REPORT_TYPES[norm.report_type]) {
    errors.push({
      field: 'report_type',
      code: 'INVALID',
      message: `不支持 report_type=${norm.report_type}（允许: ${Object.keys(REPORT_TYPES).join('/')}）`,
    });
  }
  if (norm.title && norm.title.length > INPUT_LIMITS.titleMaxLength) {
    errors.push({ field: 'title', code: 'TOO_LONG', message: `title 超过 ${INPUT_LIMITS.titleMaxLength} 字符` });
  }
  if (norm.report_goal && norm.report_goal.length > INPUT_LIMITS.reportGoalMaxLength) {
    errors.push({
      field: 'report_goal',
      code: 'TOO_LONG',
      message: `report_goal 超过 ${INPUT_LIMITS.reportGoalMaxLength} 字符`,
    });
  }
  if (norm.facts && jsonSize(norm.facts) > INPUT_LIMITS.factsMaxChars) {
    errors.push({ field: 'facts', code: 'TOO_LARGE', message: `facts 序列化超过 ${INPUT_LIMITS.factsMaxChars} 字符` });
  }
  if (norm.analysis && jsonSize(norm.analysis) > INPUT_LIMITS.analysisMaxChars) {
    errors.push({
      field: 'analysis',
      code: 'TOO_LARGE',
      message: `analysis 序列化超过 ${INPUT_LIMITS.analysisMaxChars} 字符`,
    });
  }
  if (norm.document && jsonSize(norm.document) > INPUT_LIMITS.documentMaxChars) {
    errors.push({
      field: 'document',
      code: 'TOO_LARGE',
      message: `document 序列化超过 ${INPUT_LIMITS.documentMaxChars} 字符`,
    });
  }
  if (norm.evidence && norm.evidence.length > INPUT_LIMITS.evidenceMaxItems) {
    errors.push({
      field: 'evidence',
      code: 'TOO_MANY',
      message: `evidence 超过 ${INPUT_LIMITS.evidenceMaxItems} 条上限`,
    });
  }
  if (norm.evidence && norm.evidence.length > 0 && !validateEvidenceList(norm.evidence)) {
    errors.push({
      field: 'evidence',
      code: 'INVALID',
      message: 'evidence 结构不合法，请使用 aiEvidenceService.createEvidence 创建（或直接传上游 Skill 输出的 evidence 数组）',
    });
  }
  if (norm.sections && norm.sections.length > INPUT_LIMITS.sectionsMax) {
    errors.push({ field: 'sections', code: 'TOO_MANY', message: `sections 超过 ${INPUT_LIMITS.sectionsMax} 个上限` });
  }
  if (norm.sections) {
    for (let i = 0; i < norm.sections.length; i++) {
      const it = norm.sections[i];
      const okShape = typeof it === 'string' || (isPlainObject(it) && (it.key || it.title));
      if (!okShape) {
        errors.push({ field: 'sections', code: 'INVALID', message: `sections[${i}] 必须为字符串或 {key,title}` });
        break;
      }
      const title = typeof it === 'string' ? it : String(it.title || it.key || '');
      if (title.length > INPUT_LIMITS.sectionTitleMaxLength) {
        errors.push({
          field: 'sections',
          code: 'TOO_LONG',
          message: `sections[${i}] 标题超过 ${INPUT_LIMITS.sectionTitleMaxLength} 字符`,
        });
        break;
      }
    }
  }
  if (norm.template && norm.template.sections != null && !Array.isArray(norm.template.sections)) {
    errors.push({ field: 'template.sections', code: 'INVALID', message: 'template.sections 必须为数组' });
  }
  // 至少一个内容来源（T01 空报告输入 → 结构化错误，不 500）
  const hasSource =
    (norm.facts && Object.keys(norm.facts).length > 0) ||
    (norm.analysis && Object.keys(norm.analysis).length > 0) ||
    (norm.document && Object.keys(norm.document).length > 0) ||
    (norm.evidence && norm.evidence.length > 0);
  if (!hasSource) {
    errors.push({
      field: 'facts',
      code: 'REQUIRED',
      message: '报告需要至少一个内容来源：facts / analysis / document / evidence（T01 空输入拒绝）',
    });
  }
  return { valid: errors.length === 0, errors };
}

function resolvePermission(actor) {
  if (!actor || actor.userId == null) {
    throw permissionError('无法识别用户身份，禁止调用 SK-004');
  }
  if (!actor.role || !SKILL_ALLOWED_ROLES.includes(actor.role)) {
    throw permissionError(`当前角色（${actor.role || '未知'}）无权使用 SK-004 报告生成`);
  }
  return {
    permission_model:
      'role_allowlist（报告素材由调用方提供；提供素材不扩大数据库访问权限，SK-004 不负责数据授权，§三十五）',
  };
}

// ============================================================
// 事实锁定层（§四十四 第一层）：从 facts/analysis/document/evidence 提取事实清单
// fi = { facts:[{id,metric,value,display,dim,dimValue,time,source,refId}],
//        constraints:[], numbers:Set, valuePool:Set, dimTokenFacts:Map, timeTokenFacts:Map,
//        timeRange, rowCount }
// ============================================================

function pickNum(obj, keys) {
  for (const k of keys) {
    if (obj && typeof obj[k] === 'number' && Number.isFinite(obj[k])) return obj[k];
  }
  return null;
}

/** facts 对象：遍历数值叶子（路径即指标名）；字符串叶子 → 约束/说明不作为数字事实 */
function collectFactsNumbers(obj, prefix, out, sourceLabel) {
  if (obj == null || typeof obj !== 'object' || out.length >= INPUT_LIMITS.factMaxItems) return;
  for (const [k, v] of Object.entries(obj)) {
    if (out.length >= INPUT_LIMITS.factMaxItems) break;
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'number' && Number.isFinite(v)) {
      out.push({ metric: path, value: v, display: `${path}=${v}`, dim: null, dimValue: null, time: null, source: sourceLabel });
    } else if (isPlainObject(v)) {
      collectFactsNumbers(v, path, out, sourceLabel);
    }
  }
}

/** SK-003 result（或其他分析结果）→ 事实清单（四元组：value×metric×dimension×time，§十六/§十七） */
function collectAnalysisFacts(analysis, out) {
  const ds = analysis.dataset || {};
  const timeRange = ds.time_range || ds.time_span || null;
  const timeText = timeRange && (timeRange.from || timeRange.to) ? `${timeRange.from || '?'}~${timeRange.to || '?'}` : null;

  // dataset 行数事实（row_count/valid_rows/invalid_rows）
  for (const k of ['row_count', 'valid_rows', 'valid_count', 'invalid_rows', 'invalid_count']) {
    const v = typeof ds[k] === 'number' ? ds[k] : null;
    if (v != null && out.length < INPUT_LIMITS.factMaxItems) {
      out.push({ metric: `dataset.${k}`, value: v, display: `${k}=${v}`, dim: null, dimValue: null, time: timeText, source: 'analysis.dataset' });
    }
  }
  // 汇总数值（兼容 SK-003 result 的 totals 与通用 summary 两种形态）
  const sumObj = isPlainObject(analysis.summary) ? analysis.summary : isPlainObject(analysis.totals) ? analysis.totals : null;
  const sumPrefix = isPlainObject(analysis.summary) ? 'summary' : 'totals';
  if (sumObj) {
    for (const [k, v] of Object.entries(sumObj)) {
      if (typeof v === 'number' && Number.isFinite(v) && out.length < INPUT_LIMITS.factMaxItems) {
        out.push({ metric: `${sumPrefix}.${k}`, value: v, display: `${k}=${v}`, dim: null, dimValue: null, time: timeText, source: `analysis.${sumPrefix}` });
      }
    }
  }
  // groups：维度值 → 数量/占比（value+dim+time 四元组核心来源）
  if (Array.isArray(analysis.groups)) {
    for (const g of analysis.groups) {
      if (!isPlainObject(g) || !Array.isArray(g.items)) continue;
      const dimLabel = strOrNull(g.label) || strOrNull(g.dimension) || '分组';
      for (const it of g.items) {
        if (!isPlainObject(it) || typeof it.count !== 'number' || out.length >= INPUT_LIMITS.factMaxItems) break;
        out.push({
          metric: '记录条数',
          value: it.count,
          share: typeof it.share === 'number' ? it.share : null,
          display: `${dimLabel}「${it.value}」=${it.count}条${typeof it.share === 'number' ? `（${pctStr(it.share)}）` : ''}`,
          dim: dimLabel,
          dimValue: String(it.value),
          time: timeText,
          source: 'analysis.groups',
        });
      }
    }
  }
  // rankings：排名条目（与 groups 同口径，rank 附加）
  if (Array.isArray(analysis.rankings)) {
    for (const r of analysis.rankings) {
      if (!isPlainObject(r) || !Array.isArray(r.items)) continue;
      const dimLabel = strOrNull(r.label) || strOrNull(r.dimension) || '排名';
      for (const it of r.items) {
        if (!isPlainObject(it) || typeof it.count !== 'number' || out.length >= INPUT_LIMITS.factMaxItems) break;
        out.push({
          metric: '记录条数',
          value: it.count,
          rank: typeof it.rank === 'number' ? it.rank : null,
          share: typeof it.share === 'number' ? it.share : null,
          display: `${dimLabel}第${it.rank || '?'}名「${it.value}」=${it.count}条`,
          dim: dimLabel,
          dimValue: String(it.value),
          time: timeText,
          source: 'analysis.rankings',
        });
      }
    }
  }
  // trend：期间 → 数量（时间四元组核心来源）
  if (isPlainObject(analysis.trend) && Array.isArray(analysis.trend.points)) {
    for (const p of analysis.trend.points) {
      if (!isPlainObject(p) || typeof p.count !== 'number' || out.length >= INPUT_LIMITS.factMaxItems) break;
      out.push({
        metric: '记录条数',
        value: p.count,
        display: `${p.period}=${p.count}条`,
        dim: null,
        dimValue: null,
        time: String(p.period),
        source: 'analysis.trend',
      });
    }
  }
  // compare：同比/环比数值
  if (isPlainObject(analysis.compare)) {
    for (const key of ['mom', 'yoy']) {
      const c = analysis.compare[key];
      if (!isPlainObject(c)) continue;
      for (const [k, v] of Object.entries(c)) {
        if (typeof v === 'number' && Number.isFinite(v) && out.length < INPUT_LIMITS.factMaxItems) {
          out.push({
            metric: `${key}.${k}`,
            value: v,
            display: `${key === 'mom' ? '环比' : '同比'} ${k}=${v}`,
            dim: null,
            dimValue: null,
            time: key,
            source: 'analysis.compare',
          });
        }
      }
    }
  }
  // anomalies：异常为文本事实（不抽取数字，保留原表述供 AI 忠实引用）
  if (Array.isArray(analysis.anomalies)) {
    for (const a of analysis.anomalies.slice(0, 5)) {
      if (out.length >= INPUT_LIMITS.factMaxItems) break;
      const text = isPlainObject(a) ? strOrNull(a.note) || JSON.stringify(a) : String(a);
      if (text) out.push({ metric: '异常', value: null, display: `异常：${String(text).slice(0, 120)}`, dim: null, dimValue: null, time: null, source: 'analysis.anomalies' });
    }
  }
  return timeText;
}

/** 文档（SK-002 输出）摘要：供 AI 参考结构/要点（确定性裁剪，非事实数字源） */
function buildDocumentDigest(document) {
  if (!isPlainObject(document) || Object.keys(document).length === 0) return null;
  const parts = [];
  // SK-002 result 结构（AI-Phase-01-05）：{document:{title,...}, structure, headings, paragraphs}
  const meta = isPlainObject(document.metadata)
    ? document.metadata
    : isPlainObject(document.document)
      ? document.document
      : document;
  for (const k of ['title', 'file_name', 'fileName', 'name', 'page_count', 'pages', 'word_count']) {
    if (meta[k] != null && meta[k] !== '') parts.push(`${k}: ${String(meta[k]).slice(0, 60)}`);
  }
  if (Array.isArray(document.sections) && document.sections.length) {
    const titles = document.sections
      .map((s) => (isPlainObject(s) ? strOrNull(s.title) || strOrNull(s.heading) : strOrNull(s)))
      .filter(Boolean)
      .slice(0, 10);
    if (titles.length) parts.push(`章节: ${titles.join(' / ')}`);
  }
  // SK-002 headings（元素可为字符串或 {text/title,...}）
  if (Array.isArray(document.headings) && document.headings.length) {
    const heads = document.headings
      .map((h) => (isPlainObject(h) ? strOrNull(h.text) || strOrNull(h.title) : strOrNull(h)))
      .filter(Boolean)
      .slice(0, 10);
    if (heads.length) parts.push(`标题: ${heads.join(' / ')}`);
  }
  // SK-002 paragraphs（元素为 {index,text,style,page,section} 或字符串）
  if (Array.isArray(document.paragraphs) && document.paragraphs.length) {
    const texts = document.paragraphs
      .map((p) => (isPlainObject(p) ? strOrNull(p.text) : strOrNull(p)))
      .filter(Boolean)
      .slice(0, 8)
      .map((t) => String(t).slice(0, 60));
    if (texts.length) parts.push(`段落摘录: ${texts.join(' / ')}`);
  }
  if (Array.isArray(document.tables) && document.tables.length) {
    parts.push(`表格 ${document.tables.length} 张`);
  }
  const longText = document.full_text || document.fullText || document.summary || document.content;
  if (typeof longText === 'string' && longText.trim()) {
    parts.push(`摘录: ${longText.trim().slice(0, Math.max(200, INPUT_LIMITS.documentDigestMaxChars - parts.join('；').length - 4))}`);
  }
  const digest = parts.join('；');
  return digest ? digest.slice(0, INPUT_LIMITS.documentDigestMaxChars) : null;
}

/** 约束清单（§十二/§二十七：数据驱动——不足/缺失必须显式告知 AI 不得越界） */
function buildConstraints(norm, fi, warnings) {
  const cs = [];
  const a = norm.analysis;
  if (a) {
    const rowCount = pickNum(a.dataset || {}, ['row_count']);
    if (rowCount === 0) {
      cs.push('分析结果显示记录条数为 0：只能表述「当前未提供有效数据，无法判断实际业务情况」，严禁写「未开展检查/业务量为 0」。');
    }
    const trendPoints = isPlainObject(a.trend) && Array.isArray(a.trend.points) ? a.trend.points.length : 0;
    // SK-003 compare 形态：{mom:{available:true/false,...}|null, yoy:...}；仅当存在可用同比/环比才算有
    const cmp = isPlainObject(a.compare) ? a.compare : null;
    const cmpAvailable = (x) =>
      isPlainObject(x) &&
      (x.available === true || Object.values(x).some((v) => typeof v === 'number' && Number.isFinite(v)));
    const hasCompare = !!(cmp && (cmpAvailable(cmp.mom) || cmpAvailable(cmp.yoy)));
    if (!hasCompare) {
      cs.push('输入分析结果未包含同比/环比数据：报告中不得自行得出同比/环比结论，涉及时只能表述「当前数据跨度不足，无法形成可靠同比/环比判断」。');
    } else if (trendPoints < 2) {
      cs.push('趋势数据不足 2 期：趋势解读必须谨慎，不得虚构趋势方向。');
    }
    if (isPlainObject(a.quality) && Array.isArray(a.quality.warnings)) {
      for (const w of a.quality.warnings.slice(0, 4)) {
        if (strOrNull(w)) cs.push(`数据质量提示（如实转述）：${String(w).slice(0, 120)}`);
      }
    }
    if (isPlainObject(a.trend) && Array.isArray(a.trend.missing_periods) && a.trend.missing_periods.length) {
      const periods = a.trend.missing_periods.map((p) => (isPlainObject(p) ? p.period : p)).filter(Boolean).slice(0, 5).join('、');
      cs.push(`以下期间无有效数据：${periods}。必须表述为「该期无有效数据，无法判断」，严禁解读为业务量为 0 或业务未发生。`);
    }
  }
  if (!norm.require_citation) {
    cs.push('本次不要求逐条标注证据引用，但仍不得虚构任何事实。');
  } else if (!norm.evidence || norm.evidence.length === 0) {
    cs.push(`本次输入未提供 Evidence：对没有可追溯依据的结论，使用安全表述「${NO_EVIDENCE_TEXT}」，严禁伪造引用。`);
  }
  return cs;
}

/**
 * 事实锁定主入口：facts + analysis + document + evidence → fi
 * 同时构建：
 *   numbers         全部允许数字（含占比×100、期间内数字、字符串内数字）
 *   valuePool       带归属的数值集合（用于维度/时间错位检查）
 *   dimTokenFacts   维度 token → 事实（A乡镇 → 36）
 *   timeTokenFacts  时间 token → 事实（9月 → 172）
 */
function buildFactIndex(norm, warnings) {
  const facts = [];
  if (norm.facts) {
    collectFactsNumbers(norm.facts, '', facts, 'facts');
  }
  let timeRange = null;
  if (norm.analysis) {
    timeRange = collectAnalysisFacts(norm.analysis, facts);
  }
  // 事实 id 统一分配（f001…；收集函数只负责收集，不带 id）
  facts.forEach((f, i) => {
    f.id = `f${String(i + 1).padStart(3, '0')}`;
  });
  const fi = {
    facts,
    constraints: [],
    numbers: new Set(),
    valuePool: new Set(),
    dimTokenFacts: new Map(),
    timeTokenFacts: new Map(),
    timeRange,
    rowCount: norm.analysis && isPlainObject(norm.analysis.dataset) ? pickNum(norm.analysis.dataset, ['row_count']) : null,
  };

  const addNumber = (n) => {
    if (typeof n !== 'number' || !Number.isFinite(n)) return;
    fi.numbers.add(Math.round(n * 10000) / 10000);
    fi.numbers.add(Math.round(n * 100) / 100);
    if (Math.abs(n) < 1) fi.numbers.add(Math.round(n * 10000) / 100); // 占比 → 百分数
    if (Math.abs(n) <= 100 && !Number.isInteger(n)) fi.numbers.add(Math.round(n * 10) / 10);
  };

  for (const f of facts) {
    if (f.value != null) {
      addNumber(f.value);
      if (f.share != null) addNumber(f.share);
      if (f.dimValue || f.time) fi.valuePool.add(f.value);
      // 维度 token（值字符串含中文或为标准格式，且非纯期间）
      if (f.dimValue && isUsableToken(f.dimValue) && !/^\d{4}(-\d{1,2})?$/.test(f.dimValue) && !/^\d{4}年\d{1,2}月$/.test(f.dimValue)) {
        if (!fi.dimTokenFacts.has(f.dimValue)) fi.dimTokenFacts.set(f.dimValue, f);
      }
      // 时间 token
      if (f.time && f.time !== 'mom' && f.time !== 'yoy') {
        for (const tok of periodTokens(f.time)) {
          if (isUsableToken(tok) && !fi.timeTokenFacts.has(tok)) fi.timeTokenFacts.set(tok, f);
        }
      }
    }
    // 字符串表述内的数字同样允许（如类别值「3级隐患」）
    const m = String(f.display || '').match(/\d+(?:\.\d+)?/g);
    if (m) for (const s of m) fi.numbers.add(Number(s));
  }

  // 时间范围文本中的数字（如 2026-09-01 ~ 2026-09-30）
  if (fi.timeRange) {
    for (const s of String(fi.timeRange).match(/\d+/g) || []) fi.numbers.add(Number(s));
  }
  // evidence 文本中的数字允许（上游 Evidence 提供的事实）
  if (norm.evidence) {
    for (const ev of norm.evidence) {
      const m = String(ev && ev.evidence_text ? ev.evidence_text : '').match(/\d+(?:\.\d+)?/g);
      if (m) for (const s of m.slice(0, 30)) fi.numbers.add(Number(s));
    }
  }
  // document 摘要中的数字允许（文档原文引用）
  const digest = buildDocumentDigest(norm.document);
  fi.documentDigest = digest;
  if (digest) {
    for (const s of digest.match(/\d+(?:\.\d+)?/g) || []) fi.numbers.add(Number(s));
  }

  fi.constraints = buildConstraints(norm, fi, warnings);
  return fi;
}

/** 空数据状态（§二十六）：无有效数字事实、无 Evidence、无文档 → 安全文案路径，不调 AI。
 *  全 0 数值（如 dataset.row_count=0）不视为有效数字事实——空数据 ≠ 业务未发生。 */
function isEmptyDataState(norm, fi) {
  const hasEvidence = Array.isArray(norm.evidence) && norm.evidence.length > 0;
  const hasDocument = !!fi.documentDigest;
  const hasNumberFact = fi.facts.some((f) => f.value != null && f.value !== 0);
  return !hasEvidence && !hasDocument && !hasNumberFact;
}

// ============================================================
// 确定性表格（§二十四/§二十五：数字直接来自 facts/analysis，AI 不得改）
// 返回 [{key, title, columns, rows}]
// ============================================================

const SUMMARY_LABELS = {
  total: '总数',
  valid: '有效数',
  invalid: '无效数',
  row_count: '记录条数',
  valid_rows: '有效记录条数',
  valid_count: '有效记录条数',
  invalid_count: '无效记录条数',
  invalid_rows: '无效记录条数',
};

function buildDeterministicTables(norm, fi) {
  const tables = [];
  const cap = INPUT_LIMITS.tableRowsMax;

  // 1) 总体情况表：analysis.summary/totals（兼容两种形态）或 facts 顶层数值
  const overviewRows = [];
  const sumObj = norm.analysis
    ? isPlainObject(norm.analysis.summary)
      ? norm.analysis.summary
      : isPlainObject(norm.analysis.totals)
        ? norm.analysis.totals
        : null
    : null;
  if (sumObj) {
    for (const [k, v] of Object.entries(sumObj)) {
      if (typeof v === 'number' && Number.isFinite(v)) {
        overviewRows.push([SUMMARY_LABELS[k] || k, v]);
      }
      if (overviewRows.length >= cap) break;
    }
  }
  if (overviewRows.length === 0 && norm.facts) {
    for (const f of fi.facts) {
      if (f.source === 'facts' && f.value != null && !f.metric.includes('.')) {
        overviewRows.push([SUMMARY_LABELS[f.metric] || f.metric, f.value]);
      }
      if (overviewRows.length >= cap) break;
    }
  }
  if (overviewRows.length > 0) {
    tables.push({ key: 'overview', title: '总体情况一览', columns: ['指标', '数值'], rows: overviewRows });
  }

  // 2) 趋势表：trend.points（期间, 数量）
  const trend = norm.analysis && isPlainObject(norm.analysis.trend) ? norm.analysis.trend : null;
  if (trend && Array.isArray(trend.points) && trend.points.length > 0) {
    const rows = trend.points
      .slice(0, 24)
      .filter((p) => isPlainObject(p))
      .map((p) => [String(p.period), typeof p.count === 'number' ? p.count : '-']);
    if (rows.length > 0) {
      tables.push({ key: 'trend', title: '分期间数量表', columns: ['期间', '数量'], rows });
    }
  }

  // 3) 排名表：rankings[0]（退化取 groups[0]）——占位 share 直接引用，不重算
  const rank = norm.analysis && Array.isArray(norm.analysis.rankings) && norm.analysis.rankings.length ? norm.analysis.rankings[0] : null;
  const group = !rank && norm.analysis && Array.isArray(norm.analysis.groups) && norm.analysis.groups.length ? norm.analysis.groups[0] : null;
  const src = rank || group;
  if (src && Array.isArray(src.items) && src.items.length > 0) {
    const dimLabel = strOrNull(src.label) || strOrNull(src.dimension) || '分组值';
    const rows = src.items.slice(0, cap).map((it, i) => [
      typeof it.rank === 'number' ? it.rank : i + 1,
      String(it.value),
      typeof it.count === 'number' ? it.count : '-',
      typeof it.share === 'number' ? pctStr(it.share) : '-',
    ]);
    tables.push({
      key: rank ? 'ranking' : 'ranking',
      title: `${dimLabel}分布（Top ${rows.length}）`,
      columns: ['排名', dimLabel, '数量', '占比'],
      rows,
    });
  }

  return tables;
}

// ============================================================
// 章节规划（§十二：用户指定 > 模板 > 自动；数据驱动安全文案）
// ============================================================

function resolveSections(norm) {
  let plan = null;
  let planSource = 'auto';
  const toEntry = (it, i) => {
    if (typeof it === 'string') {
      const title = it.trim();
      if (!title) return null;
      // 语义 key 字符串（如 'overview'）→ 补全中文标题
      if (SECTION_TITLE_BY_KEY[title]) return { key: title, title: SECTION_TITLE_BY_KEY[title] };
      // 中文标题 → 反查语义 key（如 '总体情况' → overview；未命中则用顺序键）
      const mapped = SECTION_KEY_BY_TITLE.get(title);
      if (mapped) return { key: mapped, title };
      return { key: `sec_${i + 1}`, title };
    }
    if (isPlainObject(it)) {
      const key = strOrNull(it.key) || `sec_${i + 1}`;
      const title = strOrNull(it.title) || SECTION_TITLE_BY_KEY[key] || key;
      return { key: /^[A-Za-z0-9_]{1,40}$/.test(key) ? key : `sec_${i + 1}`, title };
    }
    return null;
  };

  if (Array.isArray(norm.sections) && norm.sections.length > 0) {
    plan = norm.sections.map(toEntry).filter(Boolean);
    planSource = 'user';
  } else if (norm.template && Array.isArray(norm.template.sections) && norm.template.sections.length > 0) {
    plan = norm.template.sections.map(toEntry).filter(Boolean);
    planSource = 'template';
  } else {
    plan = (AUTO_SECTIONS[norm.report_type] || AUTO_SECTIONS.default).map((s) => ({ ...s }));
  }
  plan = plan.slice(0, INPUT_LIMITS.sectionsMax);
  return { sections: plan, planSource };
}

// ============================================================
// Evidence（§十四/§二十八：复用 aiEvidenceService；输出层 ev_001 引用索引）
// ============================================================

/** 输入 Evidence + 程序自建的「素材来源」Evidence → 带 ev_001 引用 id 的输出数组 */
function prepareEvidence(norm, fi, warnings) {
  const list = [];
  const inputEv = Array.isArray(norm.evidence) ? norm.evidence : [];
  for (const ev of inputEv.slice(0, INPUT_LIMITS.evidenceMaxItems)) {
    list.push({ ...ev });
  }
  // 程序自建：素材来源登记（非伪造结论证据，仅登记「事实从哪里来」）
  const own = [];
  if (norm.facts && Object.keys(norm.facts).length > 0) {
    own.push(
      createEvidence({
        sourceType: 'business_record',
        sourceId: 'sk004_input_facts',
        sourceDomain: SKILL_KEY,
        sourceField: 'facts',
        evidenceText: `调用方提供的确定性事实输入（keys: ${Object.keys(norm.facts).slice(0, 10).join('、')}）`,
        evidenceStrength: 'medium',
      }),
    );
  }
  if (norm.analysis && Object.keys(norm.analysis).length > 0) {
    own.push(
      createEvidence({
        sourceType: 'business_record',
        sourceId: 'sk004_input_analysis',
        sourceDomain: SKILL_KEY,
        sourceField: 'analysis',
        evidenceText: `调用方提供的确定性分析结果（如 SK-003 result；dataset.row_count=${fi.rowCount == null ? '未知' : fi.rowCount}）`,
        evidenceStrength: 'high',
      }),
    );
  }
  if (fi.documentDigest) {
    own.push(
      createEvidence({
        sourceType: 'document',
        sourceId: 'sk004_input_document',
        sourceDomain: SKILL_KEY,
        sourceField: 'document',
        evidenceText: `调用方提供的参考文档摘录：${fi.documentDigest.slice(0, 150)}`,
        evidenceStrength: 'medium',
      }),
    );
  }
  const final = [...list, ...own].slice(0, INPUT_LIMITS.evidenceMaxItems + 3);
  return final.map((e, i) => ({ id: `ev_${String(i + 1).padStart(3, '0')}`, ...e }));
}

// ============================================================
// AI 上下文（预算控制 + 降级链；T17 教训：任何档都不得让 AI「没有事实素材」）
// ============================================================

function factStatement(f) {
  const scope = [];
  if (f.time) scope.push(`期间:${f.time}`);
  if (f.dimValue) scope.push(`${f.dim || '维度'}:${f.dimValue}`);
  const head = f.value != null ? `${f.metric}=${f.value}` : f.metric;
  return `${f.id}: ${head}${scope.length ? `（${scope.join('，')}）` : ''}${f.share != null ? `，占比${pctStr(f.share)}` : ''}`;
}

function buildAiContext(norm, fi, tables, evidence, sectionPlan) {
  const warningsRef = [];
  const typeName = REPORT_TYPES[norm.report_type] ? REPORT_TYPES[norm.report_type].label : '自定义报告';
  const styleHints = norm.style
    ? Object.entries(norm.style)
        .filter(([, v]) => v != null && String(v).trim())
        .map(([k, v]) => `${k}=${String(v).trim().slice(0, 60)}`)
        .join('；')
    : '';

  const base = {
    报告配置: {
      报告类型: typeName,
      报告标题: norm.title || '(未指定，按类型命名)',
      报告目标: norm.report_goal || '(未指定，按事实清单与类型组织)',
      风格要求: styleHints || '(默认正式、客观、管理汇报风格)',
      引用要求: norm.require_citation ? '关键数据结论尽量标注证据编号（ev_xxx）' : '不要求逐条标注证据编号',
    },
    章节规划: sectionPlan.map((s, i) => ({ key: s.key, title: numberedTitle(i, s.title) })),
    事实清单: fi.facts.map(factStatement),
    写作约束: fi.constraints,
    确定性表格: tables.map((t) => ({ 表格标题: t.title, 列: t.columns, 行: t.rows })),
    证据: evidence.map((e) => ({ id: e.id, 内容: String(e.evidence_text || '').slice(0, 120) })),
  };
  if (fi.documentDigest) base.参考文档摘录 = fi.documentDigest;
  if (fi.timeRange) base.事实清单时间范围 = fi.timeRange;

  let text = JSON.stringify(base);
  if (text.length <= INPUT_LIMITS.aiContextMaxChars) return { text, warnings: warningsRef };

  // 档1：去参考文档摘录
  const t1 = JSON.parse(text);
  delete t1.参考文档摘录;
  text = JSON.stringify(t1);
  if (text.length <= INPUT_LIMITS.aiContextMaxChars) {
    warningsRef.push('输入规模较大，已省略参考文档摘录（报告正文仍基于事实清单生成）。');
    return { text, warnings: warningsRef };
  }

  // 档2：证据内容截短、表格行截断
  const t2 = JSON.parse(text);
  t2.证据 = t2.证据.map((e) => ({ id: e.id, 内容: String(e.内容).slice(0, 60) }));
  t2.确定性表格 = t2.确定性表格.map((t) => ({ ...t, 行: t.行.slice(0, 6) }));
  text = JSON.stringify(t2);
  if (text.length <= INPUT_LIMITS.aiContextMaxChars) {
    warningsRef.push('输入规模较大，已压缩证据摘录与表格行数（事实清单完整送达，统计数字未删减）。');
    return { text, warnings: warningsRef };
  }

  // 档3：事实清单收缩（每组维度值前 8；期间点首尾各 8）——但清单不可为空
  const t3 = JSON.parse(text);
  if (Array.isArray(t3.事实清单) && t3.事实清单.length > 40) {
    const dimFacts = [];
    const otherFacts = [];
    t3.事实清单.forEach((s, i) => {
      (fi.facts[i] && fi.facts[i].dimValue ? dimFacts : otherFacts).push(s);
    });
    t3.事实清单 = [...otherFacts.slice(0, 30), ...dimFacts.slice(0, 30), '（注：维度明细因篇幅收缩，未列出者以确定性表格为准）'];
  }
  text = JSON.stringify(t3);
  if (text.length <= INPUT_LIMITS.aiContextMaxChars) {
    warningsRef.push('输入规模很大，事实清单已收缩（未列出维度明细以确定性表格为准），事实清单与约束完整送达。');
    return { text, warnings: warningsRef };
  }

  // 档4（反幻觉最小集）：事实清单（前 40）+ 约束 + 表格（行前 5）必须送达
  const t4 = JSON.parse(text);
  t4.事实清单 = t4.事实清单.slice(0, 40);
  t4.确定性表格 = t4.确定性表格.map((t) => ({ ...t, 行: t.行.slice(0, 5) }));
  t4.证据 = t4.证据.slice(0, 6);
  warningsRef.push('输入规模极大：事实清单/表格/证据均已收缩至最小集（约束完整送达），报告数字以确定性表格与 result 为准。');
  return { text: JSON.stringify(t4), warnings: warningsRef };
}

// ============================================================
// AI 输出解析（§十一：结构化报告；解析失败 → 重试一次 → 降级原样保留并告警）
// ============================================================

/** Markdown 标题规范化（去「###」「一、」与空白，用于与章节规划标题比对） */
function _normHeading(t) {
  return String(t)
    .replace(/^\s*#{1,6}\s*/, '')
    .replace(/^\s*[一二三四五六七八九十百]+、\s*/, '')
    .replace(/\s+/g, '')
    .trim();
}

/** 章节语义关键词（弱模型常自定义标题名，如「分期间数量表」对应 trend） */
const _SECTION_TITLE_KEYWORDS = [
  { key: 'overview', re: /总体|概况/ },
  { key: 'trend', re: /趋势|分期间|期间|数量/ },
  { key: 'ranking', re: /排名|分布|区域|片区/ },
  { key: 'problems', re: /问题/ },
  { key: 'anomalies', re: /异常|质量/ },
  { key: 'suggestions', re: /建议|下一步/ },
];

/**
 * Markdown 抢救映射（§十一：AI 输出结构错误但内容可用时，尽量保住结构化而非降级）
 * 匹配规则：标题精确匹配（规范化后与章节规划标题相等）优先，其次按语义关键词；
 * 每个标题只投喂一个章节；正文按标题切块，「---」及之后的客套尾注剥离。
 * 一个章节都没匹配上 → 返回 null（走原有重试/降级链路）。
 */
function trySalvageMarkdownSections(raw, sectionPlan) {
  const lines = String(raw || '').split(/\r?\n/);
  const isHeading = (t) => {
    const s = String(t).trim();
    return /^#{1,6}\s*\S/.test(s) || /^[一二三四五六七八九十百]+、\s*\S/.test(s);
  };
  const idx = [];
  lines.forEach((line, i) => { if (isHeading(line)) idx.push(i); });
  if (idx.length === 0) return null;
  const preamble = lines.slice(0, idx[0]).join('\n').replace(/```[a-zA-Z]*\s*/g, '').trim();
  const bodies = [];
  for (let k = 0; k < idx.length; k++) {
    const end = k + 1 < idx.length ? idx[k + 1] : lines.length;
    const body = lines.slice(idx[k] + 1, end).join('\n').replace(/```/g, '').split(/\n-{3,}\s*\n?/)[0].trim();
    bodies.push({ title: _normHeading(lines[idx[k]]), body });
  }
  const used = new Set();
  const sections = sectionPlan.map((p) => {
    const pTitle = _normHeading(p.title);
    let hit = bodies.find((b, i) => !used.has(i) && b.body && b.title === pTitle);
    if (!hit) {
      const kw = _SECTION_TITLE_KEYWORDS.find((k2) => k2.key === p.key);
      if (kw) hit = bodies.find((b, i) => !used.has(i) && b.body && kw.re.test(b.title));
    }
    if (hit) { used.add(bodies.indexOf(hit)); return { ...p, content: hit.body }; }
    return { ...p, content: null };
  });
  if (used.size === 0) return null;
  const missing = sections.filter((s) => !s.content).map((s) => s.key);
  return { summary: preamble.length >= 20 ? preamble : '', sections, missing };
}

function parseAiReport(content, sectionPlan) {
  const raw = String(content || '').trim();
  let parsed = tryParseJson(raw);
  if (!parsed) {
    const s = raw.indexOf('{');
    const e = raw.lastIndexOf('}');
    if (s >= 0 && e > s) parsed = tryParseJson(raw.slice(s, e + 1));
  }
  if (parsed && !Array.isArray(parsed)) {
    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
    const secMap = new Map();
    if (Array.isArray(parsed.sections)) {
      for (const s of parsed.sections) {
        if (isPlainObject(s) && strOrNull(s.key)) secMap.set(String(s.key).trim(), typeof s.content === 'string' ? s.content.trim() : '');
      }
    }
    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions.filter((x) => typeof x === 'string' && x.trim()).slice(0, 6)
      : [];
    const sections = sectionPlan.map((p) => ({ ...p, content: secMap.has(p.key) ? secMap.get(p.key) : null }));
    const missing = sections
      .filter((s) => s.content == null || String(s.content).trim() === '')
      .map((s) => s.key);
    return {
      mode: 'json',
      ok: true,
      summary,
      sections: sections.map((s) => ({ ...s, content: s.content == null ? '' : s.content })),
      missing,
      suggestions,
    };
  }
  const salvaged = trySalvageMarkdownSections(raw, sectionPlan);
  if (salvaged) {
    return {
      mode: 'markdown',
      ok: true,
      summary: salvaged.summary,
      sections: salvaged.sections,
      missing: salvaged.missing,
      suggestions: [],
    };
  }
  return { mode: 'raw', ok: false, raw };
}

// ============================================================
// 事实一致性检查（§十六/§十七/§四十四 第二层：checkReportFactConsistency）
// 数字：AI 文本数字必须在允许集合（事实值/占比/年份/序数/期间/字符串内数字）
// 维度/时间：token 与最近数字配对，值错位 → violation（继承 SK-003 四元组机制）
// ============================================================

function isAllowedNumber(n, fi) {
  if (fi.numbers.has(Math.round(n * 10000) / 10000)) return true;
  if (fi.numbers.has(Math.round(n * 100) / 100)) return true;
  if (n >= 1900 && n <= 2100) return true; // 年份
  // 月份/日期/名次等小序数（固定小上限，不得随 rowCount 放大，否则任意编造的数字都会被放行）
  if (Number.isInteger(n) && n >= 1 && n <= 31) return true;
  return false;
}

/**
 * token 与最近数字的配对（距离 ≤12 字符）：
 * - 跳过 token 自身内部的数字（如「8月」的 8、「3级隐患」的 3），否则 token 永远与自己配对；
 * - 跳过「第 N」序数；
 * - 距离相同时优先取 token 之后的数字（中文表述「B乡镇检查29次」数字在后）。
 */
function nearestNumberForToken(sentence, tokenIdx, tokenLen, positions) {
  const tokenCenter = tokenIdx + tokenLen / 2;
  const tokenEnd = tokenIdx + tokenLen;
  let best = null;
  let bestDist = Infinity;
  for (const p of positions) {
    if (p.i < tokenEnd && p.i + p.raw.length > tokenIdx) continue;
    const before = sentence.slice(Math.max(0, p.i - 1), p.i);
    if (before === '第') continue;
    // 「N月至M月」中的 N 是月份序数，不是数量（如「3月至5月检查数量较少」的 3）
    if (/^(月至|月到|月-|月—)/.test(sentence.slice(p.i + p.raw.length, p.i + p.raw.length + 2))) continue;
    const center = p.i + p.raw.length / 2;
    const dist = Math.abs(center - tokenCenter);
    if (dist < bestDist || (dist === bestDist && best && p.i > best.i)) {
      bestDist = dist;
      best = p;
    }
  }
  if (!best || bestDist > 12) return null;
  return best;
}

/** token 所在逗号级子句范围（以 ,，;；。！？!?\n 分隔） */
function clauseRange(sentence, tokenIdx, tokenLen) {
  let start = 0;
  for (let i = tokenIdx - 1; i >= 0; i--) {
    if (/[,，;；。！？!?\n]/.test(sentence[i])) { start = i + 1; break; }
  }
  let end = sentence.length;
  for (let i = tokenIdx + tokenLen; i < sentence.length; i++) {
    if (/[,，;；。！？!?\n]/.test(sentence[i])) { end = i; break; }
  }
  return { start, end };
}

/**
 * @param {string} text - 报告文本（summary + sections content，不含确定性表格）
 * @param {Object} fi - buildFactIndex 产物
 * @returns {Array<{type:'number'|'dimension'|'time', detail:string}>} violations
 */
function checkReportFactConsistency(text, fi) {
  const violations = [];
  if (!text || !String(text).trim()) return violations;
  const sentences = String(text)
    .split(/(?<=[。！？；;\n])/)
    .map((s) => s.trim())
    .filter((s) => /\d/.test(s));

  for (const sentence of sentences) {
    const positions = numberPositions(sentence);

    // 1) 数字存在性：不在允许集合 → violation
    for (const p of positions) {
      if (isAllowedNumber(p.n, fi)) continue;
      violations.push({ type: 'number', detail: `出现事实输入中不存在的数字 ${p.raw}（原文：「${sentence.slice(0, 40)}…」）` });
    }

    // 2) 维度归属：token 最近数字 ≠ 事实值，且该数字属于其他事实值 → violation
    for (const [tok, fact] of fi.dimTokenFacts) {
      let idx = sentence.indexOf(tok);
      while (idx >= 0) {
        const near = nearestNumberForToken(sentence, idx, tok.length, positions);
        if (near && near.n !== fact.value && fi.valuePool.has(near.n)) {
          const owner = fi.facts.find((f) => f.value === near.n && (f.dimValue || f.time));
          if (owner && owner.dimValue !== tok) {
            violations.push({
              type: 'dimension',
              detail: `维度归属存疑：「${tok}」与数字 ${near.raw} 相邻，但事实为 ${fact.dimValue}=${fact.value}、${near.raw} 属于「${owner.dimValue || owner.time}」（原文：「${sentence.slice(0, 40)}…」）`,
            });
          }
          break; // 每个句子每个 token 只报一次
        }
        idx = sentence.indexOf(tok, idx + tok.length);
        if (idx < 0) break;
        // 同句多次出现 token，只检查第一次配对即可（防重复）
        break;
      }
    }

    // 3) 时间归属：同上（「2026-08」出现在「2026-08-01」等完整日期内不是独立月份指代，跳过该次出现）
    for (const [tok, fact] of fi.timeTokenFacts) {
      let idx = sentence.indexOf(tok);
      while (idx >= 0) {
        const after = sentence.slice(idx + tok.length, idx + tok.length + 2);
        if (/^-\d/.test(after)) {
          idx = sentence.indexOf(tok, idx + tok.length);
          continue;
        }
        // 子句优先：时间 token 与数量数字同属一个逗号级子句才配对
        // （「8月检查148次，9月增至172次」——跨子句纯距离配对会把「9月」错配到 148）
        const clause = clauseRange(sentence, idx, tok.length);
        const clausePos = positions.filter((p) => p.i >= clause.start && p.i < clause.end);
        if (clausePos.length === 0) break; // 子句内无数字，不配对（避免跨子句误报）
        const near = nearestNumberForToken(sentence, idx, tok.length, clausePos);
        if (near && near.n !== fact.value && fi.valuePool.has(near.n)) {
          const owner = fi.facts.find((f) => f.value === near.n && (f.time || f.dimValue));
          if (owner && owner.time && owner.time !== fact.time && periodTokens(owner.time).includes(tok) === false) {
            violations.push({
              type: 'time',
              detail: `时间归属存疑：「${tok}」与数字 ${near.raw} 相邻，但事实为 ${fact.time}=${fact.value}、${near.raw} 属于 ${owner.time}（原文：「${sentence.slice(0, 40)}…」）`,
            });
          }
        }
        break;
      }
    }
  }

  // 去重 + 截断
  const seen = new Set();
  const out = [];
  for (const v of violations) {
    const key = `${v.type}|${v.detail.slice(0, 50)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= 30) break;
  }
  return out;
}

// ============================================================
// facts.used / unresolved（§十三：事实 → 报告文本 可追踪）
// ============================================================

function buildFactTrace(fi, reportText) {
  const used = [];
  const unresolved = [];
  const text = String(reportText || '');
  for (const f of fi.facts) {
    if (f.value == null) {
      // 文本事实（异常说明等）：取前 8 个非数字字符做包含判断
      const probe = String(f.display || '').replace(/[^\u4e00-\u9fa5A-Za-z]/g, '').slice(0, 8);
      (probe && text.includes(probe) ? used : unresolved).push(f);
      continue;
    }
    const forms = [String(f.value)];
    if (!Number.isInteger(f.value)) {
      forms.push(f.value.toFixed(2), f.value.toFixed(1), String(Math.round(f.value * 100) / 100));
    }
    if (Math.abs(f.value) < 1) forms.push((f.value * 100).toFixed(1)); // 占比百分数
    const hit = forms.some((s) => text.includes(s));
    (hit ? used : unresolved).push(f);
  }
  const fmt = (f) => `${f.id}:${f.display}`;
  return {
    used: used.slice(0, 30).map(fmt),
    unresolved: unresolved.slice(0, 30).map(fmt),
    usedCount: used.length,
    unresolvedCount: unresolved.length,
  };
}

// ============================================================
// Evidence 引用分配（§十四：内容与证据数字重叠才引用，不伪造引用）
// ============================================================

function assignEvidenceIds(sectionContent, tables, evidence) {
  const ids = [];
  if (!sectionContent) return ids;
  const contentNums = new Set((sectionContent.match(/\d+(?:\.\d+)?/g) || []).map(Number));
  const tableText = JSON.stringify(tables || []);
  for (const ev of evidence) {
    if (ids.includes(ev.id)) continue;
    const evText = String(ev.evidence_text || '');
    if (!evText) continue;
    const evNums = (evText.match(/\d+(?:\.\d+)?/g) || []).map(Number);
    const numHit = evNums.some((n) => contentNums.has(n));
    const tableHit = evNums.length > 0 && evNums.some((n) => tableText.includes(String(n)));
    // 证据文本中 6 个以上连续中文字符出现在正文 → 视为被引用
    const zhProbe = evText.replace(/[^\u4e00-\u9fa5]/g, '').slice(0, 6);
    const zhHit = zhProbe.length >= 4 && sectionContent.includes(zhProbe);
    if (numHit || zhHit) ids.push(ev.id);
    else if (tableHit) ids.push(ev.id); // 表格数字与证据同源（确定性表格来自同一 analysis）
  }
  return ids;
}

// ============================================================
// 记录（§三十三：复用 ai_generation_records，type=report_generation / sub_type=SK-004）
// ============================================================

async function _saveSkillRecord({
  actor, title, status, requestId, provider, model, durationMs, result, evidence, errorMessage,
}) {
  try {
    const saved = await generationRecordService.saveGenerationRecord({
      userId: actor.userId,
      type: SKILL_TYPE,
      subType: SKILL_ID,
      title: String(title || '').slice(0, 200),
      prompt: '',
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
// 输出组装（统一输出协议，任务书 §十）
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

function deriveConfidence({ violations, degraded, missingCount, contextWarnings }) {
  if (violations > 0 || degraded) return 'low';
  if (missingCount > 0 || contextWarnings > 0) return 'medium';
  return 'high';
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
      transport: 'application/json',
      fields: {
        report_type: { type: 'string', required: false, note: `报告类型（${Object.keys(REPORT_TYPES).join('/')}）` },
        title: { type: 'string', required: false, maxLength: INPUT_LIMITS.titleMaxLength, note: '报告标题；用户指定优先，缺省按类型生成' },
        report_goal: { type: 'string', required: false, maxLength: INPUT_LIMITS.reportGoalMaxLength, note: '报告生成目标' },
        facts: { type: 'object', required: false, note: '确定性事实（如 {total:172, valid:170}）' },
        analysis: { type: 'object', required: false, note: '确定性分析结果（可直接传 SK-003 result）' },
        evidence: { type: 'object[]', required: false, note: 'aiEvidenceService 产物（或上游 Skill evidence 数组），不得伪造' },
        document: { type: 'object', required: false, note: 'SK-002 解析结果（参考制度/会议材料/历史报告结构）' },
        template: { type: 'object', required: false, note: '报告模板 {template_key, version, sections:[key|{key,title}]}' },
        sections: { type: 'string[]|object[]', required: false, note: '用户指定章节（字符串或 {key,title}），优先级最高' },
        style: { type: 'object', required: false, note: '风格控制 {formality/brevity/audience...}；只影响文字表达，不得改变事实' },
        require_citation: { type: 'boolean', required: false, note: '是否要求 Evidence 引用（默认 true）' },
      },
    },
    scope_note: 'scope 为公共协议保留字段；SK-004 不访问数据库，全部素材由调用方提供（§三十五：提供素材不扩大数据权限）',
    output_schema: {
      success: 'boolean',
      skill: 'object',
      request_id: 'string',
      report: 'object（title/report_type/report_version/summary/sections[{key,title,content,tables,evidence_ids}]/disclaimer）',
      facts: 'object（used/unresolved：事实 → 报告文本追踪）',
      evidence: 'array<object>（含输出层引用 id：ev_001…）',
      warnings: 'array<string>',
      suggestions: 'array<string>',
      confidence: 'high|medium|low',
      metadata: 'object（skill_*/report_type/prompt_*/provider/model/duration_ms/record_id/gateway_request_id/trace_id/evidence_count/fact_count/consistency_status…）',
    },
  };
}

// ============================================================
// 主流程（§四 事实先于文字）
// ============================================================

/**
 * SK-004 报告生成
 * @param {Object} input - normalizeInput 输入
 * @param {{userId:number|null, role:string|null}} actor - req.user 派生最小字段
 */
async function generate(input = {}, actor = {}) {
  const startAt = Date.now();
  const norm = normalizeInput(input);

  // 1) 权限（§三十四 fail-closed：先鉴权，再处理报告输入）
  const perm = resolvePermission(actor);

  // 2) 输入校验 → 结构化错误（T01 空输入）
  const { valid, errors } = validateInput(norm);
  if (!valid) {
    throw new AiError(AI_ERROR_CODES.AI_INVALID_REQUEST, `SK-004 输入校验失败：${errors.map((e) => e.message).join('；')}`, {
      validationErrors: errors,
    });
  }
  const warnings = [];
  const suggestions = [];

  // 3) 事实锁定层（§四十四 第一层）
  const fi = buildFactIndex(norm, warnings);
  const { sections: sectionPlan, planSource } = resolveSections(norm);
  const tables = buildDeterministicTables(norm, fi);
  const evidence = prepareEvidence(norm, fi, warnings);
  const typeName = REPORT_TYPES[norm.report_type] ? REPORT_TYPES[norm.report_type].label : REPORT_TYPES.custom.label;
  const defaultTitle = REPORT_TYPES[norm.report_type] ? REPORT_TYPES[norm.report_type].defaultTitle : REPORT_TYPES.custom.defaultTitle;
  const reportTitle = norm.title || defaultTitle;

  const metadataBase = {
    skill_key: SKILL_KEY,
    skill_id: SKILL_ID,
    skill_version: SKILL_VERSION,
    model_policy: SKILL_TYPE,
    report_type: norm.report_type || 'custom',
    template_key: norm.template ? strOrNull(norm.template.template_key) || null : null,
    section_plan_source: planSource,
    prompt_key: MODEL_POLICIES[SKILL_TYPE].promptKey,
    prompt_version: MODEL_POLICIES[SKILL_TYPE].promptVersion,
    permission_model: perm.permission_model,
    disclaimer: DISCLAIMER,
  };

  // 4) 空数据安全路径（§二十六：success=true + 安全文案，不调 AI、不编造）
  if (isEmptyDataState(norm, fi)) {
    warnings.push(NO_DATA_NOTE);
    const requestId = createRequestContext({ userId: actor.userId }).requestId;
    const rec = await _saveSkillRecord({
      actor,
      title: `SK-004 ${reportTitle}`,
      status: 'success',
      requestId,
      provider: null,
      model: null,
      durationMs: Date.now() - startAt,
      result: 'no_data',
      evidence,
      errorMessage: null,
    });
    return {
      success: true,
      skill: skillBlock(),
      request_id: requestId,
      report: {
        title: reportTitle,
        report_type: metadataBase.report_type,
        report_version: 'v1',
        summary: NO_DATA_TEXT,
        sections: sectionPlan.map((s) => ({
          key: s.key,
          title: numberedTitle(s.__i || sectionPlan.indexOf(s), s.title),
          content: NO_DATA_TEXT,
          tables: [],
          evidence_ids: [],
        })),
        disclaimer: DISCLAIMER,
      },
      facts: { used: [], unresolved: fi.facts.map((f) => `${f.id}:${f.display}`) },
      evidence,
      warnings,
      suggestions: ['确认数据来源与筛选条件后重新生成报告'],
      confidence: 'low',
      metadata: {
        ...metadataBase,
        provider: null,
        model: null,
        duration_ms: Date.now() - startAt,
        record_id: rec.recordId,
        record_saved: rec.recordSaved,
        gateway_request_id: null,
        trace_id: null,
        usage: { input_tokens: 0, output_tokens: 0 },
        ai_called: false,
        ai_context_chars: 0,
        evidence_count: evidence.length,
        fact_count: fi.facts.length,
        consistency_status: 'not_applicable',
      },
    };
  }

  // 5) AI 上下文（预算控制 + 降级链）
  const aiCtx = buildAiContext(norm, fi, tables, evidence, sectionPlan);
  warnings.push(...aiCtx.warnings);

  // 6) AI 生成（Gateway 统一链路；§四十四：一致性不通过自动重试一次）
  const policy = MODEL_POLICIES[SKILL_TYPE];
  const maxAttempts = Math.max(1, INPUT_LIMITS.aiRetryMax);
  let gatewayResult = null;
  let parsed = null;
  let violations = [];
  let lastMissing = [];
  let degraded = false;
  let styleLine = norm.style
    ? Object.entries(norm.style)
        .filter(([, v]) => v != null && String(v).trim())
        .map(([k, v]) => `${k}: ${String(v).trim().slice(0, 60)}`)
        .join('；')
    : '';
  let customInstructions = [
    norm.report_goal ? `报告目标：${norm.report_goal}` : `按报告类型（${typeName}）组织报告内容`,
    styleLine ? `风格要求（只影响文字表达，不得改变事实）：${styleLine}` : '',
    '章节 key 与顺序必须与【报告事实输入】中的章节规划完全一致。',
  ]
    .filter(Boolean)
    .join('\n');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // §四十四：重试更正要求 = 事实不一致明细 + 缺失章节点名（§十二.3：无异常/数据不足必须用安全文案，禁止空章节）
    const corrLines = [];
    if (violations.length > 0) {
      corrLines.push(...violations.slice(0, 8).map((v) => `- [${v.type}] ${v.detail}`));
    }
    if (lastMissing.length > 0) {
      corrLines.push(
        `- 以下章节 content 缺失或为空：${lastMissing.join('、')}。必须逐章写足实质内容（120~250 字）；` +
        '无异常可写时写「本期未发现达到当前分析规则的明显异常波动。」；数据不足时写「当前数据不足，无法形成可靠判断。」；' +
        '如以 JSON 输出困难，可改用 Markdown 中文序号章节标题（如「一、总体情况」）逐章书写全部章节，系统会自动转换为结构化章节'
      );
    }
    const attemptInstructions =
      attempt === 1 || corrLines.length === 0
        ? customInstructions
        : `${customInstructions}\n【更正要求】上一次输出存在以下问题，必须严格修正：\n${corrLines.join('\n')}`;
    try {
      // eslint-disable-next-line no-await-in-loop
      gatewayResult = await gateway.generate({
        promptKey: policy.promptKey,
        promptVersion: policy.promptVersion,
        data: aiCtx.text,
        customInstructions: attemptInstructions,
        evidence,
        provider: policy.provider,
        options: policy.options,
        userId: actor.userId,
        sourceDomain: SKILL_KEY,
        record: {
          type: SKILL_TYPE,
          subType: SKILL_ID,
          title: `${reportTitle}（attempt ${attempt}）`,
        },
      });
    } catch (err) {
      // §四十五：Provider/Gateway 异常 → 统一错误信封 + failed 记录落库（确定性表格已算出，留痕）
      await _saveSkillRecord({
        actor,
        title: `SK-004 ${reportTitle}`,
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

    // 7) 解析 AI 输出
    // eslint-disable-next-line no-await-in-loop
    parsed = parseAiReport(gatewayResult.content, sectionPlan);
    if (!parsed.ok) {
      if (attempt < maxAttempts) {
        warnings.push('AI 输出结构解析失败（要求 JSON），已自动重试一次。');
        // eslint-disable-next-line no-continue
        continue;
      }
      degraded = true;
      warnings.push('AI 输出结构解析失败（已重试仍不符合 JSON 结构），报告正文按原文降级保留，请人工整理。');
      break;
    }
    if (parsed.missing && parsed.missing.length > 0) {
      warnings.push(`AI 未生成 ${parsed.missing.length} 个章节内容（${parsed.missing.join('、')}），已用占位文案，建议人工补充。`);
    }
    if (parsed.mode === 'markdown') {
      warnings.push('AI 输出为 Markdown 而非 JSON，已按章节规划顺序抢救为结构化章节（摘要可能缺失），建议人工核对。');
    }

    // 8) 事实一致性检查（§四十四 第二层）+ 空章节纳入重试条件（§十二.3 数据驱动章节）
    const aiText = [parsed.summary, ...parsed.sections.map((s) => s.content)].filter(Boolean).join('\n');
    violations = checkReportFactConsistency(aiText, fi);
    const missingNow = Array.isArray(parsed.missing) ? parsed.missing : [];
    if (violations.length === 0 && missingNow.length === 0) break;
    if (attempt < maxAttempts) {
      warnings.push(
        violations.length > 0
          ? `第 ${attempt} 次生成存在 ${violations.length} 处事实不一致，已自动重试。`
          : `第 ${attempt} 次生成有 ${missingNow.length} 个章节内容缺失，已自动重试。`
      );
      lastMissing = missingNow;
    }
  }

  // 9) 一致性终态（禁止静默通过：不一致 → warnings + 标记人工审核）
  let consistencyStatus = 'pass';
  if (degraded) {
    consistencyStatus = 'degraded';
  } else if (violations.length > 0) {
    consistencyStatus = 'failed';
    for (const v of violations.slice(0, 5)) {
      warnings.push(`事实一致性告警[${v.type}]：${v.detail}`);
    }
    warnings.push('报告存在与事实输入不一致的表述，已标记人工审核：相关数字一律以确定性事实/表格为准，修正后方可正式使用。');
    suggestions.push('请人工核对告警章节中的数字表述，或修正素材后重新生成');
  }

  // 10) 组装结构化报告（§十一：title/summary/sections/tables/evidence/warnings/metadata 解耦于文件格式）
  let reportSections;
  let reportSummary;
  if (degraded) {
    reportSummary = '';
    reportSections = [
      {
        key: 'report_body',
        title: '报告正文（未结构化，AI 原文降级保留）',
        content: String(parsed && parsed.raw ? parsed.raw : '').trim() || MISSING_SECTION_TEXT,
        tables,
        evidence_ids: [],
      },
    ];
  } else {
    reportSummary = parsed.summary;
    reportSections = parsed.sections.map((s, i) => {
      const myTables = tables.filter((t) => t.key === s.key);
      return {
        key: s.key,
        title: numberedTitle(i, s.title),
        content: s.content === '' || s.content == null
          ? (s.key === 'anomalies' && !fi.facts.some((f) => f.metric === '异常')
            ? '本期未发现达到当前分析规则的明显异常波动。' // §十二.3 数据驱动：无异常事实时安全文案，禁止硬写异常
            : s.key === 'problems'
              ? '基于当前分析结果与数据质量检查，本期未提取到明确的重点问题清单；建议结合检查明细与业务台账进一步核查。' // §十二.3 数据驱动：模型未产出问题章节时如实兜底，禁止硬写问题
              : MISSING_SECTION_TEXT)
          : s.content,
        tables: myTables,
        evidence_ids: norm.require_citation ? assignEvidenceIds(s.content, myTables, evidence) : [],
      };
    });
    // 未被章节匹配到的确定性表格 → 附加到第一个章节（表格数字不丢失）
    const attached = reportSections.flatMap((s) => s.tables.map((t) => t.title));
    const leftover = tables.filter((t) => !attached.includes(t.title));
    if (leftover.length > 0 && reportSections.length > 0) {
      reportSections[0].tables = [...reportSections[0].tables, ...leftover];
    }
  }

  // 11) 事实追踪（§十三：事实 → 报告文本）
  const reportText = [reportSummary, ...reportSections.map((s) => s.content)].filter(Boolean).join('\n');
  const trace = buildFactTrace(fi, reportText);
  if (trace.unresolvedCount > 0 && !degraded) {
    suggestions.push(`有 ${trace.unresolvedCount} 项事实未被报告正文引用（facts.unresolved），请确认是否需要覆盖`);
  }

  const confidence = deriveConfidence({
    violations: violations.length,
    degraded,
    missingCount: degraded ? 0 : parsed.missing.length,
    contextWarnings: aiCtx.warnings.length,
  });

  return {
    success: true,
    skill: skillBlock(),
    request_id: gatewayResult.requestId,
    report: {
      title: reportTitle,
      report_type: metadataBase.report_type,
      report_version: 'v1',
      summary: reportSummary,
      sections: reportSections,
      disclaimer: DISCLAIMER,
    },
    facts: { used: trace.used, unresolved: trace.unresolved },
    evidence,
    warnings,
    suggestions,
    confidence,
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
      ai_context_chars: aiCtx.text.length,
      evidence_count: evidence.length,
      fact_count: fi.facts.length,
      fact_used_count: trace.usedCount,
      fact_unresolved_count: trace.unresolvedCount,
      consistency_status: consistencyStatus,
      consistency_violations: violations.length,
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
  REPORT_TYPES,
  NO_DATA_TEXT,
  manifest,
  generate,
  // 测试与诊断用途导出（不在控制器使用）
  _internal: {
    normalizeInput,
    validateInput,
    buildFactIndex,
    buildDeterministicTables,
    resolveSections,
    buildAiContext,
    parseAiReport,
    checkReportFactConsistency,
    buildFactTrace,
    assignEvidenceIds,
    isEmptyDataState,
    prepareEvidence,
  },
};

/**
 * SK-003 检查数据分析 Skill（公司级标准 AI Skill — AI-Phase-01-06）
 *
 * 定位（AI-Phase-01-06 任务书 §二/§三）：
 *   Skill ID     SK-003
 *   Skill Name   检查数据分析
 *   技术标识      company.inspection.analysis
 *   Version      v1.0.0
 *   Domain       company
 *   Type         inspection_analysis
 *   Status       Testing（A~W 验收全过后转 Active，不跳过）
 *
 * 核心原则（任务书 §三/§五/§十二）：
 *   「公司级通用检查数据分析 Skill」——服务安环/生产/环卫/市政园林/人力/财务 6 部门的
 *   检查数据 → 数据整理 → 统计 → 分组 → 排名 → 趋势 → 同比环比 → 异常 → AI 解释。
 *   不是 HSE 三违/隐患/风险/合规判定 Skill（§三）；核心内禁止任何 HSE 专业规则（§四）。
 *   AI 不是计算器：全部统计由程序确定性计算，AI 只解释（为什么变化/可能原因/建议核查），
 *   禁止重算数字（§十二），metric+value+dimension+time 四元组必须一致（§十三）。
 *
 * 通用字段语义（任务书 §十；实际字段由 Adapter / field_mapping 映射，核心不认识业务字段）：
 *   date / organization / project / inspector / subject / type / status /
 *   category / description / location / metric
 *
 * 数据来源（任务书 §六/§十九/§二十七）：
 *   - source.type='hse_grid'：HSE Adapter（adapters/hseInspectionAdapter.js）只读 SELECT
 *     grid_inspection_records → 通用语义行（真实数据测试只读，prod-boundary）；
 *   - data：直接传入结构化行数组（DB 查询结果/系统记录/上游 Skill 结构化输出）；
 *   - Excel → SK-001 解析 → 行数组 → SK-003（Skill 组合验证，不做 Orchestrator，§二十八）；
 *   - 不重建文件解析能力（无 Excel/文档解析，文件输入请走 SK-001/SK-002）。
 *
 * 复用与边界：
 *   - 复用 aiPromptRegistry / aiEvidenceService / ai_generation_records（不做 R2 migration，§十七）；
 *   - Model Policy：provider=null 交 Gateway/Provider Registry 决定（§十六），禁止直连模型；
 *   - 权限复用 JWT + 角色 allowlist（§十八），与 SK-005/SK-001/SK-002 同一清单，fail-closed；
 *   - 冻结问题 R1~R5 只记录不顺手修（§三十）；HSE AI 核心不修改（§三十一）。
 */

const { AI_ERROR_CODES, AiError } = require('../errors');
const gateway = require('../aiGateway');
const { createRequestContext } = require('../aiRequestContext');
const { createEvidence, EVIDENCE_SOURCE_TYPES } = require('../aiEvidenceService');
const generationRecordService = require('../aiGenerationRecordService');
const ExcelUtils = require('../../../utils/excel');
const hseInspectionAdapter = require('../adapters/hseInspectionAdapter');

// ============================================================
// Skill 元数据（标准定义，AI-Phase-01-01 §4）
// ============================================================
const SKILL_ID = 'SK-003';
const SKILL_NAME = '检查数据分析';
const SKILL_KEY = 'company.inspection.analysis';
const SKILL_VERSION = 'v1.0.0';
const SKILL_DOMAIN = 'company';
const SKILL_TYPE = 'inspection_analysis';
/** 生命周期（AI-Phase-01-01 §5~§6）：初始 Testing，A~W 验收全过后转 Active（不跳过）。 */
const SKILL_STATUS = 'Active';
const SKILL_OWNER = 'company-ai';

/** 允许调用 SK-003 的角色（与 SK-005 / SK-001 / SK-002 SKILL_ALLOWED_ROLES 逐字一致，fail-closed，§十八） */
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
 * Model Policy（§十六：模型不得写死）
 * inspection_analysis → provider=null 交 AI Gateway 当前活动 Provider 决定。
 */
const MODEL_POLICIES = {
  inspection_analysis: {
    provider: null,
    promptKey: SKILL_KEY,
    promptVersion: SKILL_VERSION,
    options: { temperature: 0.2, maxTokens: 1500 },
  },
};

/** Adapter 注册表（§十九：业务 Adapter 负责实际字段映射；核心只认识通用语义） */
const DATA_SOURCES = {
  [hseInspectionAdapter.ADAPTER_ID]: hseInspectionAdapter,
};

/**
 * 输入与处理边界（§六/§二十一；AI 上下文预算初始取 SK-002 校准值 2000，集成实测再调）。
 * 统计覆盖全部行（至上限），明细列表另有展示上限，超出在 quality/warnings 如实登记。
 */
const INPUT_LIMITS = {
  analysisGoalMaxLength: 500,
  dataJsonMaxBytes: 10 * 1024 * 1024, // 与 app.js express.json limit 对齐
  maxRows: 5000, // 参与分析的最大数据行
  maxGroupDims: 6, // 分组维度上限
  defaultGroupDims: 4, // 未指定 group_by 时自动选择的维度数
  maxGroupItems: 15, // 每维度分组条目上限
  topNDefault: 10, // 排名默认 TOP N
  topNMax: 50, // 排名 TOP N 上限
  maxTrendPoints: 60, // 趋势点上限
  maxMetricCols: 6, // 数值指标列上限（v1 实现单指标语义列 metric）
  maxAnomalyItems: 20, // 异常清单上限
  maxMissingPeriods: 20, // 无数据期清单上限
  // AI 上下文预算（确定性结果压缩后）。SK-003 确定性结果区块多于 SK-001(2400)/SK-002(2000)：
  // 实测 326 行×4 分组维度的中型数据 relabel 全量 2880 字符——预算 2000 时会降级到
  // 「仅概况」档，导致 AI 无统计素材而编造数字（T17 实证：AI 编造 40.75 条/月），
  // 故取 3200 保证中型数据全量直通；更大的数据走逐级压缩档（档1→档4，见 limitAiContext）。
  // 本地 qwen2.5:7b CPU prefill ≈39 tokens/s；前端 SK-003 调用超时单独放宽（240s，company-ai.ts）。
  aiContextMaxChars: 3200,
  evidenceMaxItems: 8, // Evidence 上限（沿用 SK-001/SK-002）
};

/** 通用字段语义（§十；核心只认识这些键 + metric） */
const GENERIC_FIELDS = [
  'date',
  'organization',
  'project',
  'inspector',
  'subject',
  'type',
  'status',
  'category',
  'description',
  'location',
];
/** 指标语义（数值列，可选；缺省为记录条数 count 统计） */
const METRIC_FIELD = 'metric';

/** 通用语义中文名（AI 上下文重标签与前端展示共用） */
const FIELD_LABELS = {
  date: '检查日期',
  organization: '组织/片区',
  project: '项目',
  inspector: '检查人',
  subject: '被检查对象',
  type: '检查类型',
  status: '状态',
  category: '类别',
  description: '描述',
  location: '地点',
  metric: '数值指标',
};

/**
 * 通用字段同义词自动识别（§十：不同业务字段名不一致的最小兜底；仅按列名匹配，
 * 不含任何业务语义判断，非 HSE 专业规则。显式 field_mapping 优先级最高）。
 */
const FIELD_SYNONYMS = {
  date: ['检查日期', '巡查日期', '检查时间', '发生时间', '创建时间', '日期', '时间', 'date', 'inspection_date', 'record_date', 'check_date'],
  organization: ['组织', '部门', '片区', '班组', '乡镇', '区域', '作业中心', '单位', 'organization', 'area_team', 'department', 'dept', 'township'],
  project: ['项目', '项目名称', '作业项目', '工程', 'project', 'project_name'],
  inspector: ['检查人', '检查人员', '检查人姓名', '巡查人', '检查员', 'inspector', 'inspector_name', 'personnel_name', 'checker'],
  subject: ['被检查人', '被检查对象', '违章人', '检查对象', '对象', 'subject', 'violator_name', 'target'],
  type: ['检查类型', '类型', 'type', 'inspection_type', 'check_type'],
  status: ['状态', '上报状态', '整改状态', '状态结果', 'status', 'report_status'],
  category: ['类别', '分类', '问题类型', '事项类别', 'category', 'violation_type', 'type_result'],
  description: ['描述', '问题描述', '内容', '行为描述', '具体情况', 'description', 'violation_behavior', 'remark'],
  location: ['地点', '位置', '网格', '网格名称', '区域位置', 'location', 'grid_name', 'grid', 'address'],
  metric: ['数量', '次数', '分值', '金额', '数量值', 'metric', 'count', 'value', 'score', 'amount'],
};

/** 数据质量检查项定义（§九 12 类；status: pass=正常 warn=数据问题 fail=无法分析） */
const QUALITY_CHECK_KEYS = [
  'empty_data', // 1 空数据
  'empty_table', // 2 空表（全部行无任何字段值）
  'no_valid_records', // 3 无有效记录
  'missing_required_fields', // 4 必要字段缺失（日期/维度语义未映射）
  'field_type_anomaly', // 5 字段类型异常（指标列非数值）
  'unparseable_dates', // 6 日期无法解析
  'metric_anomaly', // 7 数值字段异常（z-score |z|≥3）
  'duplicates', // 8 重复数据
  'high_null_fields', // 9 大量 NULL
  'time_range_anomaly', // 10 时间范围异常
  'empty_dimension_fields', // 11 维度字段为空
  'empty_metric_fields', // 12 指标字段为空
];

/** 人机边界声明（§四/§二十三/§三十人机边界） */
const DISCLAIMER =
  '本分析由 AI 基于程序确定性统计结果生成，仅为 AI 辅助数据解读，' +
  '不构成正式管理决定，不含 HSE 专业判定（风险等级/隐患等级/三违定性/责任认定/事故定责/合规最终结论/考核结论）；' +
  '统计数字以 result 确定性计算结果为准，最终结论以人工审核为准。';

/** 空数据/无有效记录场景的安全返回文案（§九：区分数据问题与业务结果；不调 AI、不编造） */
const NO_DATA_TEXT =
  '未提供有效检查数据（数据为空或全部记录无有效字段值），未调用 AI 生成解读。\n' +
  '该结果仅说明「当前输入无可用数据」，不代表「检查未发生」；请确认数据来源与筛选条件后重试。';

function permissionError(message) {
  const err = new Error(message);
  err.name = 'SkillPermissionError';
  err.code = 'SKILL_PERMISSION_DENIED';
  return err;
}

// ============================================================
// 输入校验（§六）
// ============================================================

/** 归一化输入（JSON body；不做语义判断） */
function normalizeInput(raw = {}) {
  const boolOf = (v, dflt) => {
    if (v == null || String(v).trim() === '') return dflt;
    const s = String(v).trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(s)) return true;
    if (['false', '0', 'no', 'off'].includes(s)) return false;
    return dflt;
  };
  const arrOf = (v) => {
    if (v == null) return null;
    if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
    if (typeof v === 'string' && v.trim()) {
      return v.split(/[,，;；\s]+/).map((x) => x.trim()).filter(Boolean);
    }
    return null;
  };

  let timeRange = null;
  const tr = raw.time_range;
  if (tr && typeof tr === 'object' && (tr.from || tr.to)) {
    timeRange = {
      from: tr.from ? String(tr.from).trim().slice(0, 10) : null,
      to: tr.to ? String(tr.to).trim().slice(0, 10) : null,
    };
    if (!timeRange.from) timeRange.from = null;
    if (!timeRange.to) timeRange.to = null;
  }

  let compare = raw.compare == null ? null : arrOf(raw.compare);
  if (compare) {
    compare = compare.map((c) => c.toLowerCase());
    // 先展开 both 再过滤白名单（否则 'both' 被过滤成空 → compare 丢失）
    if (compare.includes('both')) compare = ['mom', 'yoy'];
    else compare = compare.filter((c) => ['mom', 'yoy'].includes(c));
    if (compare.length === 0) compare = null;
  }

  let source = null;
  if (raw.source && typeof raw.source === 'object' && raw.source.type) {
    source = { type: String(raw.source.type).trim() };
  } else if (raw.source && typeof raw.source === 'string' && raw.source.trim()) {
    source = { type: raw.source.trim() };
  }

  return {
    analysis_goal:
      raw.analysis_goal != null && String(raw.analysis_goal).trim() !== ''
        ? String(raw.analysis_goal).trim()
        : '综合分析：总体概况、分组、排名、趋势、同比环比与异常',
    data: Array.isArray(raw.data) ? raw.data : null,
    source,
    time_range: timeRange,
    group_by: arrOf(raw.group_by),
    dimensions: arrOf(raw.dimensions),
    top_n: raw.top_n != null && String(raw.top_n).trim() !== '' ? Number(raw.top_n) : null,
    sort: ['name', 'count'].includes(String(raw.sort || '').trim().toLowerCase())
      ? String(raw.sort).trim().toLowerCase()
      : 'count',
    compare,
    field_mapping:
      raw.field_mapping && typeof raw.field_mapping === 'object' && !Array.isArray(raw.field_mapping)
        ? raw.field_mapping
        : null,
    require_citation: boolOf(raw.require_citation, true),
    request_id: raw.request_id != null ? String(raw.request_id) : null,
    scope: raw.scope != null ? raw.scope : null,
    options: raw.options != null && typeof raw.options === 'object' ? raw.options : {},
  };
}

/** 校验输入合法性（data 与 source 二选一；语义键白名单校验） */
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
  if (!input.data && !input.source) {
    errors.push({
      field: 'data',
      code: 'REQUIRED',
      message: '必须提供检查数据：data（结构化行数组）或 source（数据来源，如 hse_grid）',
    });
  }
  if (input.data && input.source) {
    errors.push({
      field: 'source',
      code: 'CONFLICT',
      message: 'data 与 source 只能二选一（Excel 文件请先经 SK-001 解析为行数组）',
    });
  }
  if (input.source && !DATA_SOURCES[input.source.type]) {
    errors.push({
      field: 'source.type',
      code: 'NOT_FOUND',
      message: `未注册的数据来源: ${input.source.type}（可用: ${Object.keys(DATA_SOURCES).join(' / ')}）`,
    });
  }
  if (input.data) {
    const nonObj = input.data.filter((r) => r == null || typeof r !== 'object' || Array.isArray(r)).length;
    if (nonObj > 0) {
      errors.push({
        field: 'data',
        code: 'INVALID',
        message: `data 必须为对象数组（发现 ${nonObj} 个非对象元素）`,
      });
    }
  }
  const validDims = new Set([...GENERIC_FIELDS, METRIC_FIELD]);
  for (const [field, key] of [['group_by', 'group_by'], ['dimensions', 'dimensions']]) {
    if (input[field]) {
      const bad = input[field].filter((d) => !validDims.has(d));
      if (bad.length > 0) {
        errors.push({
          field: key,
          code: 'INVALID',
          message: `${key} 含非法维度: ${bad.join('、')}（允许: ${[...GENERIC_FIELDS, METRIC_FIELD].join('、')}）`,
        });
      }
    }
  }
  if (input.top_n != null && (!Number.isFinite(input.top_n) || input.top_n < 1 || input.top_n > INPUT_LIMITS.topNMax)) {
    errors.push({
      field: 'top_n',
      code: 'INVALID',
      message: `top_n 必须为 1~${INPUT_LIMITS.topNMax} 的数值`,
    });
  }
  if (input.time_range) {
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    for (const k of ['from', 'to']) {
      if (input.time_range[k] && !dateRe.test(input.time_range[k])) {
        errors.push({ field: `time_range.${k}`, code: 'INVALID', message: `time_range.${k} 必须为 YYYY-MM-DD` });
      }
    }
    if (
      input.time_range.from &&
      input.time_range.to &&
      input.time_range.from > input.time_range.to
    ) {
      errors.push({ field: 'time_range', code: 'INVALID', message: 'time_range.from 不能晚于 time_range.to' });
    }
  }
  if (input.field_mapping) {
    if (Array.isArray(input.field_mapping.metric) && input.field_mapping.metric.length > 1) {
      errors.push({
        field: 'field_mapping.metric',
        code: 'INVALID',
        message: 'field_mapping.metric 当前仅支持单个指标列（v1 实现单指标语义）',
      });
    }
    const bad = Object.keys(input.field_mapping).filter((k) => !validDims.has(k));
    if (bad.length > 0) {
      errors.push({
        field: 'field_mapping',
        code: 'INVALID',
        message: `field_mapping 含非法语义键: ${bad.join('、')}（允许: ${[...GENERIC_FIELDS, METRIC_FIELD].join('、')}）`,
      });
    }
  }
  return { valid: errors.length === 0, errors };
}

/** 权限（§十八：JWT 身份 + 角色 allowlist；身份来自 req.user，禁止请求体传入） */
function resolvePermission(actor) {
  if (!actor || actor.userId == null) {
    throw permissionError('无法识别用户身份，禁止调用 SK-003');
  }
  if (!actor.role || !SKILL_ALLOWED_ROLES.includes(actor.role)) {
    throw permissionError(`当前角色（${actor.role || '未知'}）无权使用 SK-003 检查数据分析`);
  }
  return {
    permission_model:
      'role_allowlist（数据来源为用户提供的行数据或只读 Adapter；无行级数据范围收敛，scope 保留字段）',
  };
}

// ============================================================
// 字段映射（§十：显式 field_mapping > 同义词自动识别；Adapter 输出已映射行，跳过本层）
// ============================================================

/**
 * 解析直接传入行数组的字段映射
 * @param {Array<Object>} rows - 原始行
 * @returns {{resolved: Object, unresolved: string[], auto: Object}}
 *   resolved: {语义键: 实际字段名}；unresolved: 未映射语义；auto: 自动识别结果
 */
function resolveFieldMapping(rows, explicitMapping) {
  const headers = new Set();
  for (const r of rows) {
    if (r && typeof r === 'object') {
      for (const k of Object.keys(r)) headers.add(k);
    }
  }
  const resolved = {};
  const auto = {};
  const norm = (s) => String(s).trim().toLowerCase();

  for (const semantic of [...GENERIC_FIELDS, METRIC_FIELD]) {
    // 1) 显式映射（值必须是数据中真实存在的字段）
    const ex = explicitMapping && explicitMapping[semantic] ? String(explicitMapping[semantic]).trim() : null;
    if (ex && headers.has(ex)) {
      resolved[semantic] = ex;
      continue;
    }
    // 2) 语义键本身存在（调用方已按通用语义命名）
    if (headers.has(semantic)) {
      resolved[semantic] = semantic;
      continue;
    }
    // 3) 同义词自动识别（列名精确/小写匹配）
    let hit = null;
    for (const syn of FIELD_SYNONYMS[semantic] || []) {
      if (headers.has(syn)) { hit = syn; break; }
    }
    if (!hit) {
      // 大小写不敏感兜底
      for (const syn of FIELD_SYNONYMS[semantic] || []) {
        const found = [...headers].find((h) => norm(h) === norm(syn));
        if (found) { hit = found; break; }
      }
    }
    if (hit) {
      resolved[semantic] = hit;
      auto[semantic] = hit;
    }
  }
  const unresolved = [...GENERIC_FIELDS].filter((s) => !resolved[s]);
  return { resolved, unresolved, auto };
}

/** 按映射把原始行转换为通用语义行（不做业务清洗；值原样保留，仅 trim 字符串） */
function applyFieldMapping(rows, mapping) {
  return rows.map((r, idx) => {
    const out = { _row: idx + 1 };
    for (const semantic of [...GENERIC_FIELDS, METRIC_FIELD]) {
      const field = mapping[semantic];
      if (!field) { out[semantic] = null; continue; }
      const v = r ? r[field] : null;
      if (v == null || String(v).trim() === '') out[semantic] = null;
      else out[semantic] = typeof v === 'string' ? v.trim() : v;
    }
    return out;
  });
}

// ============================================================
// 确定性分析引擎（§八 9 能力 / §九 12 质量检查；无业务规则；无法可靠识别的如实 null）
// ============================================================

/**
 * 通用日期解析：复用 ExcelUtils.parseDate（生产在用口径），扩展常见文本格式。
 * 支持后追加：YYYY年M月D日、YYYY/M/D、YYYY-M-D、YYYY.M.D、M/D/YY（美式导出惯例）。
 */
function parseGenericDate(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return null; // Excel 序列日期不做反解（同 SK-001 口径）
  const s = String(v).trim();
  const std = ExcelUtils.parseDate(s);
  if (std) {
    // ExcelUtils 口径对文本只校验格式不校验日历（如 2026-13-40 / 2026-02-30 会原样透传，
    // 且无效日期串会让时间跨度算出 NaN 连锁把粒度推到 year）；SK-003 输入面更宽，复核日历合法性。
    const m2 = std.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m2) {
      const y = Number(m2[1]);
      const mo = Number(m2[2]);
      const d = Number(m2[3]);
      const dt = new Date(Date.UTC(y, mo - 1, d));
      if (y >= 1900 && y <= 2100 && dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d) {
        return std;
      }
      return null; // 日历非法（越界月/日）
    }
    return std; // 数字序列日期等生产口径直通
  }
  let m = s.match(/^(\d{4})[年./-](\d{1,2})[月./-](\d{1,2})日?$/);
  if (m) {
    const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3]);
    if (y >= 1900 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})(?:\s+\d{1,2}:\d{2}(:\d{2})?)?$/);
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

function parseNumberLike(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v).trim().replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

function pctStr(n) {
  return `${(n * 100).toFixed(1)}%`;
}

/** 期间键与粒度（§七：日/周/月/季度/年；自动粒度按数据跨度） */
function periodKeyOf(dateStr, granularity) {
  const d = dateStr; // YYYY-MM-DD
  if (granularity === 'day') return d;
  if (granularity === 'month') return d.slice(0, 7);
  if (granularity === 'year') return d.slice(0, 4);
  if (granularity === 'quarter') {
    const q = Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1;
    return `${d.slice(0, 4)}-Q${q}`;
  }
  if (granularity === 'week') {
    // ISO 周：以周一所在日期为周期起点（period_start 承载相邻性判断）
    const dt = new Date(`${d}T00:00:00Z`);
    const dow = (dt.getUTCDay() + 6) % 7; // Mon=0
    dt.setUTCDate(dt.getUTCDate() - dow);
    return `W${dt.toISOString().slice(0, 10)}`; // 用周一日期做周键，避免 ISO 周号跨年歧义
  }
  return d;
}

function chooseGranularity(spanDays) {
  if (spanDays <= 62) return 'day';
  if (spanDays <= 180) return 'week';
  if (spanDays <= 1095) return 'month';
  if (spanDays <= 2190) return 'quarter';
  return 'year';
}

/** 上一自然期键（环比口径：与上一自然期比较，而非与数据中前一个点比较——期间缺失时如实说明） */
function prevPeriodKey(key, granularity) {
  if (granularity === 'day') {
    const d = new Date(`${key}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  if (granularity === 'month') {
    const [y, mo] = key.split('-').map(Number);
    const d = new Date(Date.UTC(y, mo - 2, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  if (granularity === 'year') return String(Number(key) - 1);
  if (granularity === 'quarter') {
    const [y, q] = key.split('-Q').map(Number);
    return q === 1 ? `${y - 1}-Q4` : `${y}-Q${q - 1}`;
  }
  if (granularity === 'week') {
    const d = new Date(`${key.slice(1)}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 7);
    return `W${d.toISOString().slice(0, 10)}`;
  }
  return null;
}

/** 去年同期键（同比口径） */
function prevYearPeriodKey(key, granularity) {
  if (granularity === 'day') {
    const d = new Date(`${key}T00:00:00Z`);
    d.setUTCFullYear(d.getUTCFullYear() - 1);
    return d.toISOString().slice(0, 10);
  }
  if (granularity === 'month') return `${Number(key.slice(0, 4)) - 1}${key.slice(4)}`;
  if (granularity === 'year') return String(Number(key) - 1);
  if (granularity === 'quarter') {
    const [y, q] = key.split('-Q').map(Number);
    return `${y - 1}-Q${q}`;
  }
  if (granularity === 'week') {
    const d = new Date(`${key.slice(1)}T00:00:00Z`);
    d.setUTCFullYear(d.getUTCFullYear() - 1);
    return `W${d.toISOString().slice(0, 10)}`;
  }
  return null;
}

/** 期间键 → 该期起始日 ISO（YYYY-MM-DD） */
function periodStartIso(key, granularity) {
  if (granularity === 'week') return key.slice(1);
  if (granularity === 'day') return key;
  if (granularity === 'year') return `${key}-01-01`;
  if (granularity === 'month') return `${key}-01`;
  if (granularity === 'quarter') {
    const [y, q] = key.split('-Q').map(Number);
    return `${y}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`;
  }
  return key;
}

/** 全部自然期枚举（用于「无数据期」识别——数据问题 ≠ 业务结果，§九） */
function enumeratePeriods(fromKey, toKey, granularity) {
  const keys = [];
  let guard = 0;
  let iso = periodStartIso(fromKey, granularity);
  const endIso = toKey ? periodStartIso(toKey, granularity) : null;
  while (iso && guard <= 2000) {
    keys.push(periodKeyOf(iso, granularity));
    const d = new Date(`${iso}T00:00:00Z`);
    if (granularity === 'day') d.setUTCDate(d.getUTCDate() + 1);
    else if (granularity === 'week') d.setUTCDate(d.getUTCDate() + 7);
    else if (granularity === 'month') d.setUTCMonth(d.getUTCMonth() + 1);
    else if (granularity === 'quarter') d.setUTCMonth(d.getUTCMonth() + 3);
    else d.setUTCFullYear(d.getUTCFullYear() + 1);
    iso = d.toISOString().slice(0, 10);
    if (endIso && iso > endIso) break;
    guard++;
  }
  return [...new Set(keys)];
}

/**
 * 确定性分析主引擎：总量 → 质量 → 分组 → 排名 → 趋势 → 同比环比 → 极值 → 异常
 * @param {Object} p - { rows(通用语义行), mapping, timeRange, dims, topN, compare, metricCols }
 * @returns {{result:Object, warnings:string[]}}
 */
function analyzeDeterministic({ rows, mapping, timeRange, dims, topN, compare, metricCols, sort }) {
  const warnings = [];
  const parsedAt = new Date().toISOString();
  const sortByName = sort === 'name';
  const metricFields = (metricCols || []).slice(0, INPUT_LIMITS.maxMetricCols);
  const checks = [];
  const pushCheck = (check, status, detail) => checks.push({ check, status, detail });

  // ---- 行规范化：日期解析 + 指标数值解析 ----
  let workRows = rows;
  const totalRowsInInput = rows.length;
  if (totalRowsInInput > INPUT_LIMITS.maxRows) {
    warnings.push(`数据行数 ${totalRowsInInput} 超过上限 ${INPUT_LIMITS.maxRows}，仅分析前 ${INPUT_LIMITS.maxRows} 行（统计结果基于截断后数据）。`);
    workRows = rows.slice(0, INPUT_LIMITS.maxRows);
  }
  const rowsCount = workRows.length;

  for (const r of workRows) {
    r._date = parseGenericDate(r.date);
    r._metrics = {};
    for (const mf of metricFields) r._metrics[mf] = parseNumberLike(r[mf]);
  }

  // ---- §九 1/2/3：空数据 / 空表 / 无有效记录 ----
  const SEMANTIC_VALUE_FIELDS = [...GENERIC_FIELDS, ...metricFields];
  const nonEmptyRows = workRows.filter((r) => SEMANTIC_VALUE_FIELDS.some((f) => r[f] != null));
  const emptyRows = rowsCount - nonEmptyRows.length;

  pushCheck('empty_data', rowsCount === 0 ? 'fail' : 'pass', rowsCount === 0 ? '输入数据为空（0 行）' : `共 ${rowsCount} 行`);
  pushCheck('empty_table', rowsCount > 0 && nonEmptyRows.length === 0 ? 'fail' : 'pass',
    rowsCount > 0 && nonEmptyRows.length === 0 ? '全部行没有任何有效字段值（空表）' : `非空行 ${nonEmptyRows.length} 行`);
  pushCheck('no_valid_records', rowsCount > 0 && nonEmptyRows.length === 0 ? 'fail' : 'pass',
    rowsCount > 0 && nonEmptyRows.length === 0 ? '无任何含有效字段值的记录' : `有效记录 ${nonEmptyRows.length} 行`);

  // ---- §九 4：必要字段缺失（映射层面）----
  const missingSemantic = GENERIC_FIELDS.filter((s) => !mapping[s]);
  pushCheck(
    'missing_required_fields',
    missingSemantic.includes('date') || missingSemantic.length >= GENERIC_FIELDS.length ? 'warn' : 'pass',
    missingSemantic.length > 0
      ? `未映射语义字段: ${missingSemantic.map((s) => `${s}(${FIELD_LABELS[s]})`).join('、')}——相关维度分析不可用`
      : '通用语义字段全部完成映射',
  );

  // ---- §九 6：日期无法解析 ----
  const dateMapped = Boolean(mapping.date);
  let unparseableDates = 0;
  const unparseableSamples = [];
  if (dateMapped) {
    for (const r of workRows) {
      if (r.date != null && r._date == null) {
        unparseableDates++;
        if (unparseableSamples.length < 5) unparseableSamples.push({ row: r._row, value: String(r.date).slice(0, 30) });
      }
    }
  }
  pushCheck(
    'unparseable_dates',
    unparseableDates > 0 ? 'warn' : 'pass',
    dateMapped
      ? `日期列「${mapping.date}」无法解析 ${unparseableDates} 个${unparseableSamples.length ? `（样例: ${unparseableSamples.map((s) => `第${s.row}行「${s.value}」`).join('、')}）` : ''}`
      : '日期语义未映射，跳过日期解析',
  );

  // ---- §九 5/12：指标字段类型异常 / 指标字段为空 ----
  const metricTypeInvalid = {};
  const metricEmpty = {};
  for (const mf of metricFields) {
    let invalid = 0;
    let empty = 0;
    for (const r of workRows) {
      if (r[mf] == null) empty++;
      else if (r._metrics[mf] == null) invalid++;
    }
    metricTypeInvalid[mf] = invalid;
    metricEmpty[mf] = empty;
  }
  const totalMetricInvalid = Object.values(metricTypeInvalid).reduce((s, n) => s + n, 0);
  pushCheck(
    'field_type_anomaly',
    totalMetricInvalid > 0 ? 'warn' : 'pass',
    metricFields.length > 0
      ? `指标列非数值: ${metricFields.map((mf) => `${mf}=${metricTypeInvalid[mf]}`).join('、')}`
      : '未指定数值指标列（仅做记录条数统计）',
  );
  const totalMetricEmpty = Object.values(metricEmpty).reduce((s, n) => s + n, 0);
  pushCheck(
    'empty_metric_fields',
    metricFields.length > 0 && totalMetricEmpty === rowsCount * metricFields.length ? 'warn' : 'pass',
    metricFields.length > 0
      ? `指标列空值: ${metricFields.map((mf) => `${mf}=${metricEmpty[mf]}/${rowsCount}`).join('、')}`
      : '未指定数值指标列',
  );

  // ---- §九 8：重复数据（整行全语义字段比对）----
  const rowSigMap = new Map();
  let duplicateRows = 0;
  const duplicateSamples = [];
  for (const r of workRows) {
    const sig = JSON.stringify(SEMANTIC_VALUE_FIELDS.map((f) => (r[f] == null ? '' : String(r[f]))));
    if (rowSigMap.has(sig)) {
      duplicateRows++;
      rowSigMap.get(sig).dupCount++;
      if (duplicateSamples.length < 5 && rowSigMap.get(sig).dupCount === 1) {
        duplicateSamples.push({ first_row: rowSigMap.get(sig).firstRow, dup_row: r._row });
      }
    } else {
      rowSigMap.set(sig, { firstRow: r._row, dupCount: 0 });
    }
  }
  pushCheck('duplicates', duplicateRows > 0 ? 'warn' : 'pass',
    duplicateRows > 0 ? `完全重复行 ${duplicateRows} 行${duplicateSamples.length ? `（样例: ${duplicateSamples.map((s) => `第${s.first_row}行≈第${s.dup_row}行`).join('、')}）` : ''}` : '无完全重复行');

  // ---- §九 9：大量 NULL（各语义字段空值率）----
  const nullRates = {};
  const highNullFields = [];
  for (const f of GENERIC_FIELDS) {
    if (!mapping[f]) continue;
    let empty = 0;
    for (const r of workRows) if (r[f] == null) empty++;
    const rate = rowsCount > 0 ? round4(empty / rowsCount) : 0;
    nullRates[f] = rate;
    if (rowsCount >= 5 && rate >= 0.3) highNullFields.push({ field: f, label: FIELD_LABELS[f], null_rate: rate });
  }
  pushCheck('high_null_fields', highNullFields.length > 0 ? 'warn' : 'pass',
    highNullFields.length > 0
      ? `高空值字段（空值率≥30%）: ${highNullFields.map((h) => `${h.label}(${pctStr(h.null_rate)})`).join('、')}`
      : '各映射字段空值率均低于 30%');

  // ---- §九 10：时间范围异常 ----
  const dates = dateMapped ? workRows.map((r) => r._date).filter(Boolean).sort() : [];
  const todayStr = new Date().toISOString().slice(0, 10);
  let outOfPlausibility = 0;
  if (dateMapped) {
    for (const r of workRows) {
      if (r._date && (r._date < '2000-01-01' || r._date > todayStr)) outOfPlausibility++;
    }
  }
  let outsideTimeRange = 0;
  let filteredRows = workRows;
  if (timeRange && (timeRange.from || timeRange.to) && dateMapped) {
    filteredRows = workRows.filter((r) => {
      if (r._date == null) return true; // 无法判断日期的行保留，由质量项单独登记
      if (timeRange.from && r._date < timeRange.from) return false;
      if (timeRange.to && r._date > timeRange.to) return false;
      return true;
    });
    outsideTimeRange = rowsCount - filteredRows.length;
  }
  pushCheck(
    'time_range_anomaly',
    outOfPlausibility > 0 ? 'warn' : 'pass',
    `超出合理时间范围（<2000-01-01 或未来日期）的记录 ${outOfPlausibility} 条` +
      (timeRange && (timeRange.from || timeRange.to)
        ? `；请求时间范围 ${timeRange.from || '不限'} ~ ${timeRange.to || '不限'} 之外记录 ${outsideTimeRange} 条（已排除）`
        : ''),
  );

  // ---- §九 11：维度字段为空 ----
  const dimStats = {};
  for (const d of dims) {
    if (d === METRIC_FIELD || !mapping[d]) continue;
    let empty = 0;
    for (const r of filteredRows) if (r[d] == null) empty++;
    dimStats[d] = { empty, empty_rate: filteredRows.length > 0 ? round4(empty / filteredRows.length) : 0 };
  }
  pushCheck(
    'empty_dimension_fields',
    dims.some((d) => dimStats[d] && dimStats[d].empty_rate >= 0.5 && filteredRows.length >= 5) ? 'warn' : 'pass',
    Object.keys(dimStats).length > 0
      ? `分析维度空值: ${dims.filter((d) => dimStats[d]).map((d) => `${FIELD_LABELS[d]}(${pctStr(dimStats[d].empty_rate)})`).join('、')}`
      : '无可用分组维度',
  );

  // ---- §8.1 总量统计 ----
  const validRows = filteredRows.filter((r) => SEMANTIC_VALUE_FIELDS.some((f) => r[f] != null));
  const totals = {
    total: rowsCount,
    valid: validRows.length,
    invalid: rowsCount - validRows.length,
    outside_time_range: outsideTimeRange,
  };
  const timeSpan = dateMapped && dates.length > 0
    ? { from: dates[0], to: dates[dates.length - 1], days: Math.round((new Date(dates[dates.length - 1]) - new Date(dates[0])) / 86400000) }
    : null;

  // ---- §8.2/8.3/8.7 分组 / 排名 / 占比 ----
  const groups = [];
  const rankings = [];
  const extremes = [];
  const groupMaps = {};
  for (const d of dims) {
    if (d === METRIC_FIELD || !mapping[d]) continue;
    const counter = new Map();
    const metricAgg = new Map();
    for (const r of filteredRows) {
      const v = r[d];
      if (v == null || String(v).trim() === '') continue;
      const key = String(v).trim();
      counter.set(key, (counter.get(key) || 0) + 1);
      if (metricFields.length > 0) {
        const cur = metricAgg.get(key) || {};
        for (const mf of metricFields) {
          if (r._metrics[mf] != null) cur[mf] = round4((cur[mf] || 0) + r._metrics[mf]);
        }
        metricAgg.set(key, cur);
      }
    }
    groupMaps[d] = counter;
    if (counter.size === 0) continue;
    const allItems = [...counter.entries()]
      .sort((a, b) => (sortByName ? (a[0] < b[0] ? -1 : 1) : b[1] - a[1]))
      .map(([value, count]) => ({
        value,
        count,
        share: validRows.length > 0 ? round4(count / validRows.length) : 0,
        ...(metricFields.length > 0 ? { metric_sums: metricAgg.get(value) || {} } : {}),
      }));
    groups.push({
      dimension: d,
      label: FIELD_LABELS[d],
      source_field: mapping[d],
      distinct: counter.size,
      truncated: counter.size > INPUT_LIMITS.maxGroupItems,
      items: allItems.slice(0, INPUT_LIMITS.maxGroupItems),
    });
    rankings.push({
      dimension: d,
      label: FIELD_LABELS[d],
      top_n: topN,
      truncated: counter.size > topN,
      items: [...allItems]
        .sort((a, b) => b.count - a.count)
        .slice(0, topN)
        .map((it, i) => ({ rank: i + 1, value: it.value, count: it.count, share: it.share })),
    });
    const countsArr = [...counter.values()];
    const maxC = Math.max(...countsArr);
    const minC = Math.min(...countsArr);
    const valOf = (c) => [...counter.entries()].filter(([, n]) => n === c).map(([v]) => v);
    extremes.push({
      dimension: d,
      label: FIELD_LABELS[d],
      max: { value: valOf(maxC)[0], count: maxC, tied: valOf(maxC).length > 1 },
      min: { value: valOf(minC)[0], count: minC, tied: valOf(minC).length > 1 },
    });
  }

  // ---- §8.4 时间趋势 ----
  let trend = null;
  let trendPointsMap = new Map();
  if (dateMapped && dates.length >= 3) {
    const spanDays = timeSpan ? timeSpan.days : 0;
    const granularity = chooseGranularity(spanDays);
    for (const r of filteredRows) {
      if (r._date == null) continue;
      const k = periodKeyOf(r._date, granularity);
      if (!trendPointsMap.has(k)) trendPointsMap.set(k, { period: k, period_start: r._date, count: 0, sums: {} });
      const p = trendPointsMap.get(k);
      p.count += 1;
      if (p.period_start > r._date) p.period_start = r._date;
      for (const mf of metricFields) {
        if (r._metrics[mf] != null) p.sums[mf] = round4((p.sums[mf] || 0) + r._metrics[mf]);
      }
    }
    let points = [...trendPointsMap.values()].sort((a, b) => (a.period < b.period ? -1 : 1));
    const periodList = points.map((p) => p.period);
    // 无数据期识别（数据问题 ≠ 业务结果，§九；Case D 支撑）
    let missingPeriods = [];
    if (points.length >= 2) {
      const allPeriods = enumeratePeriods(periodList[0], periodList[periodList.length - 1], granularity);
      missingPeriods = allPeriods.filter((k) => !trendPointsMap.has(k));
    }
    let truncated = false;
    if (points.length > INPUT_LIMITS.maxTrendPoints) {
      points = [...points.slice(0, 6), ...points.slice(-6)];
      truncated = true;
      warnings.push(`趋势期数超过 ${INPUT_LIMITS.maxTrendPoints}，仅保留首尾各 6 期。`);
    }
    if (missingPeriods.length > INPUT_LIMITS.maxMissingPeriods) {
      warnings.push(`无数据期 ${missingPeriods.length} 个，超过清单上限，仅保留前 ${INPUT_LIMITS.maxMissingPeriods} 期。`);
      missingPeriods = missingPeriods.slice(0, INPUT_LIMITS.maxMissingPeriods);
    }
    trend = {
      dimension: 'date',
      label: FIELD_LABELS.date,
      source_field: mapping.date,
      granularity,
      span: timeSpan,
      invalid_dates: unparseableDates,
      truncated,
      points,
      missing_periods: missingPeriods.map((k) => ({ period: k, note: '该期无有效数据，无法判断实际检查数量' })),
    };
  } else if (dateMapped) {
    warnings.push('有效日期不足 3 个，无法生成时间趋势。');
  }

  // ---- §8.5/8.6 同比 / 环比 ----
  const compareResult = { granularity: trend ? trend.granularity : null, mom: null, yoy: null };
  if (trend && trend.points.length >= 2 && !trend.truncated) {
    const pts = trendPointsMap;
    const sortedPeriods = [...pts.keys()].sort();
    const latest = sortedPeriods[sortedPeriods.length - 1];
    compareResult.latest = { period: latest, count: pts.get(latest).count };

    const mkCompare = (kind) => {
      const targetKey = kind === 'mom' ? prevPeriodKey(latest, trend.granularity) : prevYearPeriodKey(latest, trend.granularity);
      if (!targetKey) return { available: false, reason: '无法计算上一期键' };
      const prev = pts.get(targetKey);
      if (!prev) {
        return {
          available: false,
          reason:
            kind === 'mom'
              ? `数据中不存在上一自然期（${targetKey}）的有效数据，无法计算环比；该期为数据缺失，不代表当期检查量为 0`
              : `数据中不存在去年同期（${targetKey}）的有效数据，无法计算同比`,
        };
      }
      const cur = pts.get(latest).count;
      const prevCount = prev.count;
      const change = cur - prevCount;
      const changePct = prevCount === 0 ? null : round4(change / prevCount);
      return {
        available: true,
        base: { period: latest, count: cur },
        against: { period: targetKey, count: prevCount },
        change,
        change_pct: changePct,
        basis:
          `${latest} 为 ${cur} 次，${targetKey} 为 ${prevCount} 次` +
          (changePct == null ? '（基期为 0，无法计算百分比变化）' : `，${change >= 0 ? '增加' : '减少'} ${Math.abs(round4(changePct * 100))}%`),
      };
    };
    if (!compare || compare.includes('mom')) compareResult.mom = mkCompare('mom');
    if (!compare || compare.includes('yoy')) compareResult.yoy = mkCompare('yoy');
  } else if (compare && compare.length > 0) {
    warnings.push('数据期数不足，无法计算同比/环比。');
  }

  // ---- §8.9 异常值（必须给出异常依据，§八.9/§二十三）----
  const anomalies = [];
  // 1) 趋势突增/突降：最新期 vs 此前各期均值（≥2 期），偏离 ≥30% 触发
  if (trend && trendPointsMap.size >= 3) {
    const sortedPeriods = [...trendPointsMap.keys()].sort();
    const latest = sortedPeriods[sortedPeriods.length - 1];
    const prevPeriods = sortedPeriods.slice(0, -1).slice(-3);
    const prevAvg = prevPeriods.reduce((s, k) => s + trendPointsMap.get(k).count, 0) / prevPeriods.length;
    if (prevAvg > 0) {
      const dev = round4((trendPointsMap.get(latest).count - prevAvg) / prevAvg);
      if (Math.abs(dev) >= 0.3) {
        anomalies.push({
          type: dev > 0 ? 'trend_spike' : 'trend_drop',
          target: `${FIELD_LABELS.date}=${latest}`,
          value: trendPointsMap.get(latest).count,
          baseline: round4(prevAvg),
          deviation_pct: dev,
          basis:
            `${latest} 记录 ${trendPointsMap.get(latest).count} 次，较此前 ${prevPeriods.length} 期均值 ${round4(prevAvg)} 次` +
            `${dev > 0 ? '高' : '低'} ${Math.abs(round4(dev * 100))}%（对比期: ${prevPeriods.join('、')}）`,
          note: '仅描述数据现象，原因需结合检查计划执行情况与数据完整性进一步核查',
        });
      }
    }
  }
  // 2) 单一取值高度集中：某维度 TOP1 占比 ≥40% 且 distinct ≥3
  for (const d of dims) {
    if (d === METRIC_FIELD || !mapping[d]) continue;
    const counter = groupMaps[d];
    if (!counter || counter.size < 3) continue;
    const totalCnt = [...counter.values()].reduce((s, n) => s + n, 0);
    const [topVal, topCnt] = [...counter.entries()].sort((a, b) => b[1] - a[1])[0];
    const share = totalCnt > 0 ? round4(topCnt / totalCnt) : 0;
    if (share >= 0.4) {
      anomalies.push({
        type: 'concentration',
        target: `${FIELD_LABELS[d]}=${topVal}`,
        value: topCnt,
        baseline: totalCnt,
        deviation_pct: share,
        basis: `「${topVal}」在 ${FIELD_LABELS[d]} 维度记录 ${topCnt}/${totalCnt} 条（占比 ${pctStr(share)}），其余 ${counter.size - 1} 个取值合计 ${totalCnt - topCnt} 条`,
        note: '仅描述分布集中现象，是否需要干预由业务人工判断',
      });
    }
  }
  // 3) 指标 z-score |z|≥3
  for (const mf of metricFields) {
    const nums = filteredRows.map((r) => r._metrics[mf]).filter((n) => n != null);
    if (nums.length < 8) continue;
    const mean = nums.reduce((s, n) => s + n, 0) / nums.length;
    const variance = nums.reduce((s, n) => s + (n - mean) ** 2, 0) / nums.length;
    const std = Math.sqrt(variance);
    if (!std || !Number.isFinite(std) || std === 0) continue;
    let found = 0;
    for (const r of filteredRows) {
      if (found >= 5 || anomalies.length >= INPUT_LIMITS.maxAnomalyItems) break;
      const nv = r._metrics[mf];
      if (nv == null) continue;
      const z = (nv - mean) / std;
      if (Math.abs(z) >= 3) {
        found++;
        anomalies.push({
          type: 'metric_zscore',
          target: `指标（${mapping.metric || mf}）第${r._row}行`,
          value: round4(nv),
          baseline: round4(mean),
          deviation_pct: round4(z),
          basis: `数值 ${round4(nv)} 的 z-score=${round4(z)}（|z|≥3，均值 ${round4(mean)}）`,
          note: '统计离群点，建议核对原始数据',
        });
      }
    }
  }
  // 4) 无数据期（数据问题，不算业务异常）
  if (trend && trend.missing_periods.length > 0) {
    anomalies.push({
      type: 'missing_periods',
      target: `${FIELD_LABELS.date}（${trend.granularity} 粒度）`,
      value: trend.missing_periods.length,
      baseline: trend.points.length,
      deviation_pct: null,
      basis: `数据时间跨度内存在 ${trend.missing_periods.length} 个无有效数据期（${trend.missing_periods.map((m) => m.period).slice(0, 8).join('、')}${trend.missing_periods.length > 8 ? '…' : ''}）`,
      note: '属于数据完整性问题：该期无有效数据，不能解读为该期检查量为 0 或检查未发生',
    });
  }
  if (anomalies.length > INPUT_LIMITS.maxAnomalyItems) {
    anomalies.splice(INPUT_LIMITS.maxAnomalyItems);
    warnings.push(`异常条目超过 ${INPUT_LIMITS.maxAnomalyItems}，已截断。`);
  }
  pushCheck('metric_anomaly',
    anomalies.some((a) => a.type === 'metric_zscore') ? 'warn' : 'pass',
    anomalies.filter((a) => a.type === 'metric_zscore').length > 0
      ? `指标离群点 ${anomalies.filter((a) => a.type === 'metric_zscore').length} 个（z-score |z|≥3）`
      : metricFields.length > 0 ? '指标列无统计离群点' : '未指定数值指标列');

  const result = {
    dataset: {
      source: null, // analyze() 填充（adapter 描述或 inline）
      row_count: rowsCount,
      total_rows_in_input: totalRowsInInput,
      valid_rows: validRows.length,
      invalid_rows: totals.invalid,
      time_span: timeSpan,
      parsed_at: parsedAt,
      engine: 'sk003-deterministic-v1（程序统计：总量/分组/排名/趋势/同比环比/占比/极值/异常，AI 未参与计算）',
    },
    mapping: {
      resolved: mapping,
      unresolved: missingSemantic,
      labels: FIELD_LABELS,
    },
    quality: {
      checks,
      duplicates: duplicateRows,
      duplicate_samples: duplicateSamples,
      unparseable_dates: unparseableDates,
      unparseable_samples: unparseableSamples,
      outside_time_range: outsideTimeRange,
      null_rates: nullRates,
      high_null_fields: highNullFields,
      metric_type_invalid: metricTypeInvalid,
      metric_empty: metricEmpty,
    },
    totals,
    groups,
    rankings,
    trend,
    compare: compareResult,
    extremes,
    anomalies,
    metric_columns: metricFields.map((mf) => ({ key: mf, source_field: mapping[mf] || null })),
    sample_rows: filteredRows.slice(0, 3).map((r) => {
      const obj = {};
      for (const s of [...GENERIC_FIELDS, ...metricFields]) {
        obj[s] = r[s] == null ? null : String(r[s]);
      }
      return obj;
    }),
  };

  if (rowsCount === 0) warnings.push('输入数据为空（0 行），无法进行统计分析。');
  if (rowsCount > 0 && validRows.length === 0) warnings.push('全部行均无有效字段值（空表），无法进行统计分析。');

  return { result, warnings };
}

// ============================================================
// Evidence（§十四：数据来源/数据集/字段/筛选条件/统计口径/统计结果；复用 aiEvidenceService）
// ============================================================

/** 由确定性分析结果构建统一证据（createEvidence；sourceType=business_record） */
function buildEvidence(result, warnings, sourceDesc) {
  const evidence = [];
  const base = {
    sourceType: 'business_record',
    sourceId: sourceDesc.id,
    sourceDomain: SKILL_KEY,
  };
  const push = (sourceField, text, strength = 'high') => {
    if (!text) return;
    if (evidence.length >= INPUT_LIMITS.evidenceMaxItems) return;
    evidence.push(createEvidence({ ...base, sourceField, evidenceText: text, evidenceStrength: strength }));
  };

  push(
    'dataset',
    `数据来源：${sourceDesc.text}；记录 ${result.dataset.row_count} 条（有效 ${result.dataset.valid_rows} 条）` +
      (result.dataset.time_span ? `，时间跨度 ${result.dataset.time_span.from} ~ ${result.dataset.time_span.to}。` : '，无有效日期字段。'),
  );
  push(
    'mapping',
    `字段映射：${Object.entries(result.mapping.resolved).filter(([k]) => k !== METRIC_FIELD && k !== 'metric')
      .map(([k, v]) => `${FIELD_LABELS[k]}←${v}`).join('、')}` +
      (result.mapping.unresolved.length ? `；未映射: ${result.mapping.unresolved.join('、')}` : ''),
  );
  if (result.quality.duplicates > 0 || result.quality.unparseable_dates > 0 || result.quality.high_null_fields.length > 0) {
    push(
      'quality',
      `数据质量：重复行 ${result.quality.duplicates}，无法解析日期 ${result.quality.unparseable_dates}` +
        (result.quality.high_null_fields.length
          ? `，高空值字段: ${result.quality.high_null_fields.map((h) => `${h.label}(${pctStr(h.null_rate)})`).join('、')}`
          : '') +
        '。',
    );
  }
  for (const g of result.groups.slice(0, 2)) {
    push(
      `group_by:${g.dimension}`,
      `按「${g.label}」分组（distinct=${g.distinct}，口径=记录条数）：` +
        g.items.slice(0, 8).map((it, i) => `${i + 1}.${it.value}=${it.count}（${pctStr(it.share)}）`).join('；') +
        (g.truncated ? '…' : ''),
    );
  }
  for (const rk of result.rankings.slice(0, 2)) {
    push(
      `ranking:${rk.dimension}`,
      `排名（按记录条数降序 TOP${rk.top_n}）：` +
        rk.items.slice(0, 8).map((it) => `${it.rank}.${it.value}=${it.count}`).join('；') +
        (rk.truncated ? '…' : ''),
    );
  }
  if (result.trend) {
    const head = result.trend.points.slice(0, 6).map((p) => `${p.period}:${p.count}`).join('、');
    push(
      'trend',
      `趋势（${FIELD_LABELS.date}，粒度=${result.trend.granularity}，跨度 ${result.trend.span.from}~${result.trend.span.to}）：` +
        `${head}${result.trend.points.length > 6 ? ' …' : ''}` +
        (result.trend.missing_periods.length ? `；无数据期 ${result.trend.missing_periods.length} 个（该期无有效数据，不等于检查量为 0）` : ''),
    );
  }
  const cmp = result.compare;
  if (cmp && (cmp.mom || cmp.yoy)) {
    const parts = [];
    if (cmp.mom) parts.push(cmp.mom.available ? `环比（${cmp.mom.against.period}→${cmp.mom.base.period}）：${cmp.mom.basis}` : `环比不可用：${cmp.mom.reason}`);
    if (cmp.yoy) parts.push(cmp.yoy.available ? `同比（${cmp.yoy.against.period}→${cmp.yoy.base.period}）：${cmp.yoy.basis}` : `同比不可用：${cmp.yoy.reason}`);
    push('compare', parts.join('；'));
  }
  if (result.anomalies.length > 0) {
    push(
      'anomalies',
      `异常识别（含依据）：` +
        result.anomalies.slice(0, 5).map((a) => `${a.type}@${a.target}（依据: ${a.basis}）`).join('；'),
    );
  }
  if (warnings.length > 0) {
    push('processing_notes', `处理警告：${warnings.join(' ')}`, 'medium');
  }
  return evidence;
}

// ============================================================
// AI 上下文压缩（§十三/§三十二同款：只发结构化分析结果，不发原始行数据）
// ============================================================

function compactForAi(result) {
  const clone = JSON.parse(JSON.stringify(result));
  delete clone.sample_rows;
  delete clone.quality.null_rates;
  delete clone.quality.metric_empty;
  return clone;
}

/**
 * AI 上下文专用重标签：通用语义键 → 中文名 + 口径显式化（记录条数/占比），
 * 防止模型把「占比」误读为「次数」、把 A 期间/分组的数字安到 B 上（§十三 四元组纪律）。
 * 仅作用于发给 AI 的上下文；对外 result 协议保持英文键不变。
 */
function relabelForAi(r) {
  const out = JSON.parse(JSON.stringify(r));
  if (out.dataset) {
    out.dataset = {
      数据来源: out.dataset.source,
      记录总数: out.dataset.row_count,
      有效记录数: out.dataset.valid_rows,
      无效记录数: out.dataset.invalid_rows,
      时间跨度: out.dataset.time_span ? `${out.dataset.time_span.from} ~ ${out.dataset.time_span.to}` : null,
    };
  }
  if (out.mapping) {
    out.mapping = {
      字段映射: out.mapping.resolved,
      未映射语义: out.mapping.unresolved.map((s) => FIELD_LABELS[s] || s),
    };
  }
  if (out.quality) {
    out.quality = {
      数据质量问题: (out.quality.checks || [])
        .filter((c) => c.status !== 'pass')
        .map((c) => `${c.check}: ${c.detail}`),
      完全重复行数: out.quality.duplicates,
      无法解析日期数: out.quality.unparseable_dates,
    };
  }
  if (out.totals) {
    out.totals = { 记录总数: out.totals.total, 有效记录数: out.totals.valid, 无效记录数: out.totals.invalid };
  }
  if (Array.isArray(out.groups)) {
    out.groups = out.groups.map((g) => ({
      分组维度: g.label,
      不同取值数: g.distinct,
      统计口径: '记录条数（条）',
      items: (g.items || []).map((it) => ({
        取值: it.value,
        记录条数: it.count,
        占比: it.share,
        ...(it.metric_sums && it.metric_sums.metric != null ? { 指标合计: it.metric_sums.metric } : {}),
      })),
    }));
  }
  if (Array.isArray(out.rankings)) {
    out.rankings = out.rankings.map((rk) => ({
      排名维度: rk.label,
      统计口径: '按记录条数降序',
      items: (rk.items || []).map((it) => ({ 名次: it.rank, 取值: it.value, 记录条数: it.count, 占比: it.share })),
    }));
  }
  if (out.trend) {
    out.trend = {
      趋势维度: out.trend.label,
      粒度: out.trend.granularity,
      统计口径: '每期记录条数（条）',
      points: (out.trend.points || []).map((p) => {
        const row = { 期间: p.period, 记录条数: p.count };
        if (p.sums && p.sums.metric != null) row.指标合计 = p.sums.metric;
        return row;
      }),
      无数据期: (out.trend.missing_periods || []).map((m) => m.period),
      无数据期说明: out.trend.missing_periods && out.trend.missing_periods.length > 0
        ? '以下期间没有任何有效数据记录，属于数据缺失，禁止解读为「检查量为0」或「检查未发生」'
        : undefined,
    };
  }
  if (out.compare) {
    out.compare = {
      环比: out.compare.mom
        ? out.compare.mom.available
          ? { 对比: `${out.compare.mom.against.period}(${out.compare.mom.against.count}条) → ${out.compare.mom.base.period}(${out.compare.mom.base.count}条)`, 变化量: out.compare.mom.change, 变化率: out.compare.mom.change_pct }
          : { 不可用原因: out.compare.mom.reason }
        : null,
      同比: out.compare.yoy
        ? out.compare.yoy.available
          ? { 对比: `${out.compare.yoy.against.period}(${out.compare.yoy.against.count}条) → ${out.compare.yoy.base.period}(${out.compare.yoy.base.count}条)`, 变化量: out.compare.yoy.change, 变化率: out.compare.yoy.change_pct }
          : { 不可用原因: out.compare.yoy.reason }
        : null,
    };
  }
  if (Array.isArray(out.extremes)) {
    out.extremes = out.extremes.map((e) => ({
      维度: e.label,
      最多: `${e.max.value}（${e.max.count}条${e.max.tied ? '，并列' : ''}）`,
      最少: `${e.min.value}（${e.min.count}条${e.min.tied ? '，并列' : ''}）`,
    }));
  }
  if (Array.isArray(out.anomalies)) {
    out.anomalies = out.anomalies.map((a) => ({
      异常类型: a.type,
      对象: a.target,
      依据: a.basis,
      说明: a.note,
    }));
  }
  return out;
}

/** 逐级压缩 AI 载荷（档1/档2 复用）：不删区块，只收窄 items/points/条数，统计数字本身不删减 */
function shrinkAiPayload(o, { groupItems, trendHead, trendTail, anomalyMax, extremeMax }) {
  if (Array.isArray(o.groups)) o.groups = o.groups.map((g) => ({ ...g, items: (g.items || []).slice(0, groupItems) }));
  if (Array.isArray(o.rankings)) o.rankings = o.rankings.map((r) => ({ ...r, items: (r.items || []).slice(0, groupItems) }));
  if (o.trend && Array.isArray(o.trend.points) && o.trend.points.length > trendHead + trendTail) {
    o.trend.points = [...o.trend.points.slice(0, trendHead), ...o.trend.points.slice(-trendTail)];
  }
  if (Array.isArray(o.anomalies)) o.anomalies = o.anomalies.slice(0, anomalyMax);
  if (extremeMax != null && Array.isArray(o.extremes)) o.extremes = o.extremes.slice(0, extremeMax);
}

/**
 * 控制给 AI 的上下文体积；超预算时逐级降载并告警（SK-001 同款策略，档位为 SK-003 扩展）。
 * 铁律：任何降级档都不得把 AI 置于「没有统计素材」的状态——T17 实证：仅发概况/质量摘要时
 * AI 会自行编造数字（40.75 条/月）。因此最终保底档（档4）也必须送达趋势/同比环比/异常。
 */
function limitAiContext(result, warnings) {
  const base = relabelForAi(compactForAi(result));
  let text = JSON.stringify(base);
  if (text.length <= INPUT_LIMITS.aiContextMaxChars) return text;

  // 档1：分组/排名 items 前5、趋势首尾各6、异常前5（极值不动）
  const t1 = JSON.parse(text);
  shrinkAiPayload(t1, { groupItems: 5, trendHead: 6, trendTail: 6, anomalyMax: 5, extremeMax: null });
  text = JSON.stringify(t1);
  if (text.length <= INPUT_LIMITS.aiContextMaxChars) {
    warnings.push('数据规模较大，已压缩提供给 AI 的确定性分析上下文（分组/排名仅保留前 5 项、趋势保留首尾各 6 期）。统计数字未删减，完整结果以 result 字段为准。');
    return text;
  }

  // 档2：items 前3、趋势首尾各4、异常前3、极值前3
  shrinkAiPayload(t1, { groupItems: 3, trendHead: 4, trendTail: 4, anomalyMax: 3, extremeMax: 3 });
  text = JSON.stringify(t1);
  if (text.length <= INPUT_LIMITS.aiContextMaxChars) {
    warnings.push('数据规模较大，已深度压缩提供给 AI 的确定性分析上下文（分组/排名仅保留前 3 项、趋势保留首尾各 4 期、异常前 3 条）。统计数字未删减，完整结果以 result 字段为准。');
    return text;
  }

  // 档3（小而全保底）：所有分析区块保留核心数字（每组前3、趋势首尾6、异常前3、极值前3），
  // 宁可丢分组明细也不允许丢掉整个统计面——无素材自由发挥必然诱发编造。
  const t3 = t1;
  const minimal = {
    dataset: t3.dataset,
    quality: t3.quality,
    totals: t3.totals,
    trend: t3.trend,
    compare: t3.compare,
    anomalies: t3.anomalies,
    groups: Array.isArray(t3.groups) ? t3.groups.map((g) => ({ ...g, items: (g.items || []).slice(0, 3) })) : undefined,
    rankings: Array.isArray(t3.rankings) ? t3.rankings.map((r) => ({ ...r, items: (r.items || []).slice(0, 3) })) : undefined,
    extremes: t3.extremes,
  };
  text = JSON.stringify(minimal);
  if (text.length <= INPUT_LIMITS.aiContextMaxChars) {
    warnings.push('数据规模很大，已深度压缩提供给 AI 的确定性分析上下文（分组/排名每组仅保留前 3 项）。统计数字未删减，完整结果以 result 字段为准。');
    return text;
  }

  // 档4（反幻觉最小集）：分组/排名/极值明细不发送，但趋势/同比环比/异常必须送达——
  // 这三块是时间与异常解读的事实依据，缺失会诱发 AI 编造（T17 历史教训）。
  const core = {
    dataset: t3.dataset,
    quality: t3.quality,
    totals: t3.totals,
    trend: t3.trend,
    compare: t3.compare,
    anomalies: t3.anomalies,
    note: '数据规模极大：分组/排名/极值明细未发送给 AI，相关维度解读请以 result 字段为准。',
  };
  warnings.push('数据规模极大，分组/排名/极值明细未发送给 AI（趋势/同比环比/异常已送达）；相关维度解读请以 result 字段为准。');
  return JSON.stringify(core);
}

/**
 * AI 数字一致性检查（确定性，SK-001 同款最小实现）：
 * answer 中出现、但程序统计数字集合中不存在的数字 → warning（不一致时信程序）。
 * 允许集合：程序结果全部数值（含占比×100 百分位口径）；年份 1900~2100；
 * 1~row_count+10 的行号/序数；类别值字符串内含的数字。
 * 已知局限：无法识别「真实数字 + 错误归属」（时间/维度错位）——
 * 由上下文中文重标签 + Prompt 四元组纪律 + 前端「以 result 为准」三重防线兜底（T19/T20 验证）。
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
      if (Math.abs(o) < 1) nums.add(Math.round(o * 10000) / 100); // 占比 → 百分数
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
    if (Number.isInteger(n) && n >= 1 && n <= (det.dataset?.row_count || 0) + 10) continue; // 行号/序数/名次
    if (strs.some((str) => str.includes(s))) continue; // 类别值内含数字
    if (!unknown.includes(s)) unknown.push(s);
  }
  if (unknown.length === 0) return null;
  return `AI 解读中出现程序统计结果中不存在的数字（${unknown.slice(0, 5).join('、')}），相关表述不可作为事实依据，统计数字请以 result 确定性计算结果为准。`;
}

// ============================================================
// 输出组装（统一输出协议，SK-001/SK-002 同款）
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
  if (result.dataset.valid_rows >= 5) score--;
  if (result.dataset.time_span) score--;
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
    data_sources: Object.values(DATA_SOURCES).map((a) => a.adapterInfo()),
    input: {
      transport: 'application/json',
      fields: {
        data: { type: 'object[]', required: false, note: '结构化检查数据行数组（与 source 二选一）' },
        source: { type: 'object', required: false, note: '数据来源 {type:"hse_grid"}（只读 Adapter）' },
        analysis_goal: { type: 'string', required: false, maxLength: INPUT_LIMITS.analysisGoalMaxLength, note: '分析目标；缺省为综合分析' },
        time_range: { type: 'object', required: false, note: '{from,to} YYYY-MM-DD（检查日期范围）' },
        group_by: { type: 'string[]', required: false, note: `分组维度（通用语义键: ${GENERIC_FIELDS.join('/')}）；缺省自动选择` },
        dimensions: { type: 'string[]', required: false, note: '分析维度（group_by 的别名，group_by 优先）' },
        top_n: { type: 'number', required: false, note: `排名 TOP N（默认 ${INPUT_LIMITS.topNDefault}，上限 ${INPUT_LIMITS.topNMax}）` },
        sort: { type: 'string', required: false, note: '分组条目排序: count（默认，按记录数降序）/ name（按取值字典序）' },
        compare: { type: 'string[]', required: false, note: '同比环比: mom/yoy/both；缺省都算' },
        field_mapping: { type: 'object', required: false, note: '显式字段映射 {语义键: 实际字段名}（直接传 data 时可用）' },
        require_citation: { type: 'boolean', required: false, note: '是否要求 Evidence（默认 true，协议保留字段）' },
      },
    },
    scope_note: 'scope 为公共协议保留字段；SK-003 数据范围为「调用方提供的行数据/只读 Adapter 查询结果」，无行级数据范围收敛（如实登记）',
    output_schema: {
      success: 'boolean',
      skill: 'object',
      request_id: 'string',
      result: 'object（确定性分析结果：dataset/mapping/quality/totals/groups/rankings/trend/compare/extremes/anomalies/sample_rows）',
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
// 记录（§十七：复用 ai_generation_records；R2 缺口以 type/sub_type 近似，不做 migration）
// type=inspection_analysis / sub_type=SK-003
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
// 主流程
// ============================================================
/**
 * SK-003 检查数据分析
 * @param {Object} input - normalizeInput 输入（data 或 source）
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
      `SK-003 输入校验失败：${errors.map((e) => e.message).join('；')}`,
      { validationErrors: errors },
    );
  }

  // 2) 权限（§十八：先鉴权，再访问数据，再执行分析）
  const perm = resolvePermission(actor);
  const warnings = [];
  const suggestions = [];

  // 3) 取数：Adapter 只读查询 或 直接结构化行（Adapter 失败 → 结构化错误 + 失败记录）
  let rawRows = null;
  let sourceMeta = null;
  let sourceDesc;
  if (norm.source) {
    const adapter = DATA_SOURCES[norm.source.type];
    try {
      const fetched = await adapter.fetchRows({ time_range: norm.time_range });
      rawRows = fetched.rows;
      sourceMeta = fetched.meta;
      sourceDesc = {
        id: adapter.SOURCE_TABLE,
        text: `${adapter.ADAPTER_NAME}${norm.time_range ? `（${norm.time_range.from || '不限'} ~ ${norm.time_range.to || '不限'}）` : ''}`,
      };
    } catch (err) {
      const wrapped = new AiError(
        AI_ERROR_CODES.AI_INTERNAL_ERROR,
        `数据来源「${adapter.ADAPTER_NAME}」读取失败：${err && err.message ? err.message : '未知错误'}`,
      );
      await _saveSkillRecord({
        actor,
        title: `SK-003 ${adapter.SOURCE_TABLE}：${norm.analysis_goal}`,
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
  } else {
    rawRows = norm.data;
    sourceDesc = { id: 'inline_data', text: '调用方提供的结构化行数据' };
  }

  // 4) 字段映射（Adapter 行已是通用语义 → 直接透传；直接 data → 显式映射 > 同义词识别）
  let mapping;
  let mappedRows;
  if (norm.source) {
    mapping = {};
    for (const [k, v] of Object.entries(sourceMeta.mapping)) {
      if (v) mapping[k] = v;
    }
    mappedRows = rawRows;
  } else {
    const fm = resolveFieldMapping(rawRows, norm.field_mapping);
    mapping = fm.resolved;
    if (fm.auto && Object.keys(fm.auto).length > 0) {
      warnings.push(`部分字段由同义词自动识别（${Object.entries(fm.auto).map(([k, v]) => `${FIELD_LABELS[k]}←${v}`).join('、')}），请用 field_mapping 显式指定以确保口径正确。`);
    }
    if (norm.field_mapping) {
      const badTargets = Object.entries(norm.field_mapping)
        .filter(([k]) => [...GENERIC_FIELDS, METRIC_FIELD].includes(k))
        .filter(([, v]) => v != null && !Object.values(fm.resolved).includes(String(v).trim()))
        .map(([k, v]) => `${k}←${v}`);
      if (badTargets.length > 0) {
        warnings.push(`field_mapping 指定的字段在数据中不存在: ${badTargets.join('、')}（已忽略）。`);
      }
    }
    mappedRows = applyFieldMapping(rawRows, mapping);
  }

  // 5) 分析维度：group_by > dimensions > 自动选择（可用维度中取前 defaultGroupDims 个）
  let dims = norm.group_by || norm.dimensions;
  if (!dims || dims.length === 0) {
    const autoPriority = ['organization', 'category', 'type', 'status', 'location', 'project', 'inspector', 'subject'];
    dims = autoPriority.filter((d) => mapping[d]).slice(0, INPUT_LIMITS.defaultGroupDims);
  } else {
    dims = dims.filter((d) => d !== METRIC_FIELD && mapping[d]);
    if (dims.length > INPUT_LIMITS.maxGroupDims) {
      warnings.push(`分组维度 ${dims.length} 个超过上限 ${INPUT_LIMITS.maxGroupDims}，仅分析前 ${INPUT_LIMITS.maxGroupDims} 个。`);
      dims = dims.slice(0, INPUT_LIMITS.maxGroupDims);
    }
  }
  const topN = norm.top_n != null ? Math.round(norm.top_n) : INPUT_LIMITS.topNDefault;
  // v1 单指标语义：映射成功的 metric 列以语义键 'metric' 参与统计（映射名见 result.metric_columns）
  const metricCols = mapping[METRIC_FIELD] ? [METRIC_FIELD] : [];

  // 6) 确定性分析
  const analysis = analyzeDeterministic({
    rows: mappedRows,
    mapping,
    timeRange: norm.time_range,
    dims,
    topN,
    compare: norm.compare,
    metricCols,
    sort: norm.sort,
  });
  warnings.push(...analysis.warnings);
  const det = analysis.result;
  det.dataset.source = sourceDesc.text;

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
    source: {
      type: norm.source ? norm.source.type : 'inline_data',
      description: sourceDesc.text,
      row_count: det.dataset.row_count,
      access_mode: norm.source ? 'read_only_select' : 'caller_provided',
      filters: norm.source ? sourceMeta.filters : { time_range: norm.time_range },
    },
    permission_model: perm.permission_model,
    disclaimer: DISCLAIMER,
  };

  // 7) 空数据 / 空表 / 无有效记录 → 安全返回（§九：success=true，不调 AI，不编造）
  if (det.dataset.row_count === 0 || det.dataset.valid_rows === 0) {
    const requestId = createRequestContext({ userId: actor.userId }).requestId;
    const rec = await _saveSkillRecord({
      actor,
      title: `${sourceDesc.text}：${norm.analysis_goal}`,
      status: 'success',
      requestId,
      provider: null,
      model: null,
      durationMs: Date.now() - startAt,
      result: NO_DATA_TEXT,
      evidence: null,
    });
    suggestions.push('请确认数据来源、筛选条件与字段完整性后重试');
    return {
      success: true,
      skill: skillBlock(),
      request_id: requestId,
      result: det,
      answer: NO_DATA_TEXT,
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

  // 8) Evidence（§十四：数据来源/数据集/字段/筛选条件/统计口径/统计结果）
  const evidence = buildEvidence(det, warnings, sourceDesc);

  // 9) AI 上下文（中文重标签 + 预算控制）
  const aiContext = limitAiContext(det, warnings);

  // 10) AI Gateway（禁止直连 Provider；Prompt Registry + Evidence + Record 统一收敛）
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
        title: `${sourceDesc.text}：${norm.analysis_goal}`,
      },
    });
  } catch (err) {
    // Provider / Gateway 异常：结构化错误 + 失败记录（确定性结果仍已算出，errorMessage 留痕）
    await _saveSkillRecord({
      actor,
      title: `${sourceDesc.text}：${norm.analysis_goal}`,
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

  // 11) 统一输出（§十三：数字以 result 为准；§二十三：异常解读克制）
  const confidence = deriveConfidence(det, warnings, gatewayResult.content);
  const inconsistent = checkAiNumberConsistency(gatewayResult.content, det);
  if (inconsistent) warnings.push(inconsistent);
  if (det.quality.duplicates > 0) {
    suggestions.push('数据存在完全重复行，建议先清洗数据再做正式统计口径分析');
  }
  if (det.quality.unparseable_dates > 0) {
    suggestions.push('存在无法解析的日期，建议核对日期字段格式（趋势与同比环比未包含这些记录）');
  }
  if (det.trend && det.trend.missing_periods.length > 0) {
    suggestions.push('数据时间跨度内存在无数据期：该期为数据缺失，不能解读为检查量为 0 或检查未发生，建议核实数据采集完整性');
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
  GENERIC_FIELDS,
  FIELD_LABELS,
  FIELD_SYNONYMS,
  DATA_SOURCES,
  DISCLAIMER,
  normalizeInput,
  validateInput,
  resolvePermission,
  resolveFieldMapping,
  applyFieldMapping,
  parseGenericDate,
  periodKeyOf,
  prevPeriodKey,
  prevYearPeriodKey,
  analyzeDeterministic,
  buildEvidence,
  limitAiContext,
  deriveConfidence,
  checkAiNumberConsistency,
  manifest,
  analyze,
  _internal: { EVIDENCE_SOURCE_TYPES },
};

/**
 * AI Prompt Registry（AI-02 Capability Layer）
 *
 * 轻量级 Prompt 版本注册表（内存实现；DB 持久化见 ai_capability_layer_v1.sql，待授权执行）。
 *
 * 设计基线：AI-02 任务书 §11/§12/§25。
 * - 只负责：Prompt 模板 / Prompt 版本 / Prompt 元数据。
 * - 不负责：HSE 业务规则判断（禁止 if(x) return "违规" 之类的硬编码——规则由未来独立规则体系提供）。
 * - 现有 aiService.PROMPT_TEMPLATES 的 9 个模板以 templateRef 方式注册（不复制文本，避免漂移），
 *   渲染时委托 aiService 的既有 build*Prompt（复用优先，非重写）。
 */

const aiService = require('../aiService');

const PROMPT_STATUS = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  DISABLED: 'DISABLED',
};

/** 基础测试 Prompt：hse.general.analysis v1.0（AI-02 任务书 §11 要求建立的基础 Prompt） */
const BASE_PROMPT = {
  prompt_key: 'hse.general.analysis',
  version: 'v1.0',
  name: 'HSE 通用安全数据分析',
  description: '通用安全数据分析 Prompt：对给定的 HSE 业务数据做结构化分析，输出问题与建议。AI-02 基础测试 Prompt。',
  system_prompt:
    '你是宁津环卫 HSE 安全管理系统的 AI 分析助手。' +
    '请基于给定的业务数据，客观描述现状、指出潜在问题，并提出可执行的改进建议。' +
    '回答必须基于给定的数据与证据，不得臆造事实；AI 输出仅为分析建议，最终结论以人工审核为准。',
  user_prompt_template:
    '业务数据：\n{data}\n\n{custom_instructions}\n\n请使用 Markdown 格式输出分析结果。',
  status: PROMPT_STATUS.ACTIVE,
};

/**
 * AI-05：RAG 问答 Prompt（DRAFT → 测试 → 验证 → 再考虑 ACTIVE）
 * 强制要求：优先依据知识库、不得捏造来源、无知识时明确说明。
 */
const RAG_PROMPT = {
  prompt_key: 'hse.rag.answer',
  version: 'v1.0',
  name: 'HSE 知识库 RAG 问答',
  description:
    '基于知识库检索结果的问答 Prompt（AI-05，DRAFT 状态）。' +
    '要求模型优先依据【知识库资料】回答，不得凭空捏造来源，知识库无相关内容时明确说明。',
  system_prompt:
    '你是宁津环卫 HSE 安全管理系统的知识库问答助手。\n' +
    '请严格依据【知识库资料】中提供的内容回答用户问题，优先采用相关知识作答；\n' +
    '不得凭空捏造来源或事实；如果知识库中没有任何相关内容能够回答问题，请明确说明"知识库中未找到相关内容"。\n' +
    '回答中引用知识时，使用 [来源:文档标题·章节] 形式标注，与【知识库资料】中的引用编号保持一致。\n' +
    'AI 输出仅为知识参考，不构成最终管理结论，最终结论以人工审核为准。',
  user_prompt_template: '【知识库资料】\n{data}\n\n【用户问题】\n{custom_instructions}',
  status: PROMPT_STATUS.DRAFT,
};

/**
 * AI-06：结构化数据分析 Prompt（DRAFT）
 * 铁律（AI-06 任务书 §10/§11/§12）：数字必须来自统计层、AI 禁止自行计算、
 * 只输出合法 JSON、原因只能是「可能原因」假设、禁止事实认定与责任指向。
 * 完整指令由 analysisPromptBuilder 生成，经 {custom_instructions} 注入。
 */
const DATA_ANALYSIS_PROMPT = {
  prompt_key: 'hse.data.analysis',
  version: 'v1.0',
  name: 'HSE 结构化数据分析',
  description:
    '基于确定性统计结果的 HSE 数据分析 Prompt（AI-06，DRAFT 状态）。' +
    '数字全部来自统计层，AI 仅做解释；输出固定 JSON 结构；原因只能为可能原因假设。',
  system_prompt:
    '你是 HSE 安全管理数据分析助手。\n' +
    '所有数字必须直接引用【确定性统计结果】中的数字，禁止自行计算、估算或编造任何数字。\n' +
    '原因分析只能使用"可能原因/分析假设"措辞，禁止事实认定、责任指向、扣分或定责表述。\n' +
    'AI 输出仅为分析建议，最终管理结论以人工审核为准。\n' +
    '输出必须是合法 JSON 对象（禁止 markdown 代码块）。',
  user_prompt_template: '{custom_instructions}',
  status: PROMPT_STATUS.DRAFT,
};

/**
 * AI-10：管理建议 Prompt（DRAFT）
 * 输入为 AI-09 结构化分析结果 + 统计快照，输出固定 JSON 协议（AI-10 任务书 §6）：
 * overall_assessment / priority_issues / management_actions / monitoring_points /
 * follow_up_suggestions / limitations。
 * 人机边界（§7/§8）：仅输出建议性内容，禁止责任认定/扣分/处罚/整改指令/风险等级与考核结果变更。
 * 完整指令由 managementSuggestionPromptBuilder 生成，经 {custom_instructions} 注入。
 */
const MANAGEMENT_SUGGESTION_PROMPT = {
  prompt_key: 'hse.management.suggestion',
  version: 'v1.0',
  name: 'HSE 管理建议生成',
  description:
    '基于 AI-09 结构化分析结果生成管理建议（AI-10，DRAFT 状态）。' +
    '输出固定 JSON 协议；仅建议性措辞；禁止责任认定、扣分/处罚、整改指令、风险等级与考核结果变更。',
  system_prompt:
    '你是 HSE 安全管理数据的管理建议助手。\n' +
    '所有数字必须直接引用【结构化分析结果/统计快照】中的数字，禁止自行计算、估算或编造。\n' +
    '只能输出建议性内容（"建议进一步核查""建议重点关注"等），严禁认定某员工/部门违规或负责任、\n' +
    '自动扣分、处罚、追责、责任认定、下达/责令整改任务、改变风险等级、改变考核结果。\n' +
    'AI 输出仅为建议，最终管理决定由 HSE 管理人员作出。\n' +
    '输出必须是合法 JSON 对象（禁止 markdown 代码块）。',
  user_prompt_template: '{custom_instructions}',
  status: PROMPT_STATUS.DRAFT,
};

/**
 * 现有 aiService 模板 → 注册表映射（templateRef 方式，文本不复制）
 * key: registry prompt_key; aiTemplateKey: aiService.TEMPLATES 键
 */
const AISERVICE_TEMPLATE_REFS = [
  { prompt_key: 'hse.risk.hazard', aiTemplateKey: 'report_hazard', name: '隐患分析报告' },
  { prompt_key: 'hse.risk.accident', aiTemplateKey: 'report_accident', name: '事故分析报告' },
  { prompt_key: 'hse.training.analysis', aiTemplateKey: 'report_training', name: '培训效果分析报告' },
  { prompt_key: 'hse.patrol.analysis', aiTemplateKey: 'report_patrol', name: '巡检工作报告' },
  { prompt_key: 'hse.rca.analysis', aiTemplateKey: 'rca_analysis', name: '5W1H 根因分析' },
  { prompt_key: 'hse.document.analysis', aiTemplateKey: 'document_analysis', name: '文档 AI 分析' },
  { prompt_key: 'hse.report.monthly', aiTemplateKey: 'report_monthly', name: '安全生产月报' },
  { prompt_key: 'hse.report.group', aiTemplateKey: 'report_group', name: '集团/区域汇报' },
  { prompt_key: 'hse.standard.evaluation', aiTemplateKey: 'standard_evaluation', name: '标准化条款评价' },
];

/** 内存注册表：Map<prompt_key, Map<version, PromptEntry>> */
const _registry = new Map();

function _now() {
  return new Date().toISOString();
}

/**
 * 注册一个 Prompt（同 key 同 version 重复注册会覆盖并保留旧时间线）
 * @param {Object} entry
 * @param {string} entry.promptKey
 * @param {string} entry.version
 * @param {string} [entry.name]
 * @param {string} [entry.description]
 * @param {string} [entry.systemPrompt]
 * @param {string} [entry.userPromptTemplate]
 * @param {'DRAFT'|'ACTIVE'|'DISABLED'} [entry.status]
 * @returns {Object} 注册后的条目
 */
function register({
  promptKey,
  prompt_key,
  version,
  name = '',
  description = '',
  systemPrompt,
  system_prompt,
  userPromptTemplate,
  user_prompt_template,
  status = PROMPT_STATUS.ACTIVE,
} = {}) {
  const key = promptKey || prompt_key;
  if (!key) throw new Error('prompt_key 不能为空');
  if (!version) throw new Error('prompt_version 不能为空');

  const entry = {
    prompt_key: key,
    version,
    name,
    description,
    system_prompt: systemPrompt !== undefined ? systemPrompt : (system_prompt || ''),
    user_prompt_template: userPromptTemplate !== undefined ? userPromptTemplate : (user_prompt_template || ''),
    template_ref: null, // null | 'aiService'
    ai_template_key: null,
    status,
    created_at: _now(),
    updated_at: _now(),
  };

  if (!_registry.has(key)) _registry.set(key, new Map());
  const versions = _registry.get(key);
  if (!versions.has(version)) entry.created_at = _now();
  versions.set(version, entry);
  return { ...entry };
}

/** 注册 aiService 模板引用（只登记元数据，不复制文本） */
function _registerAiServiceRefs() {
  for (const ref of AISERVICE_TEMPLATE_REFS) {
    const entry = {
      prompt_key: ref.prompt_key,
      version: 'v1.0',
      name: ref.name,
      description: `现有 aiService.PROMPT_TEMPLATES 模板引用（${ref.aiTemplateKey}），文本不复制，渲染委托 aiService build*Prompt。`,
      system_prompt: '',
      user_prompt_template: '',
      template_ref: 'aiService',
      ai_template_key: ref.aiTemplateKey,
      status: PROMPT_STATUS.ACTIVE,
      created_at: _now(),
      updated_at: _now(),
    };
    if (!_registry.has(ref.prompt_key)) _registry.set(ref.prompt_key, new Map());
    _registry.get(ref.prompt_key).set(entry.version, entry);
  }
}

/**
 * 获取指定版本 Prompt（不传 version 返回 ACTIVE 版本；无 ACTIVE 返回最新）
 * @param {string} promptKey
 * @param {string} [version]
 * @returns {Object|null}
 */
function get(promptKey, version) {
  const versions = _registry.get(promptKey);
  if (!versions || versions.size === 0) return null;

  if (version) {
    return versions.get(version) || null;
  }

  const active = [...versions.values()].find((e) => e.status === PROMPT_STATUS.ACTIVE);
  if (active) return { ...active };

  // 无 ACTIVE：返回最新注册版本
  const latest = [...versions.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
  return latest ? { ...latest } : null;
}

/** 全部 Prompt（按 key 分组，含版本历史） */
function list() {
  const result = [];
  for (const [key, versions] of _registry.entries()) {
    const items = [...versions.values()]
      .sort((a, b) => (a.version < b.version ? -1 : 1))
      .map((e) => ({ ...e }));
    result.push({ prompt_key: key, versions: items, activeVersion: get(key).version });
  }
  return result;
}

/** 是否存在该 key（任意版本） */
function has(promptKey) {
  return _registry.has(promptKey);
}

/**
 * 渲染 Prompt：返回实际发送给模型的完整文本（审计用 prompt_snapshot 的基准）。
 * - template_ref='aiService'：委托 aiService.build*Prompt（复用现有模板与占位符 {data}/{custom_instructions}）
 * - 普通模板：替换 {data} 与 {custom_instructions}
 * @param {Object} entry - get() 返回的注册项
 * @param {Object} args - { data, customInstructions, ... }
 */
function render(entry, args = {}) {
  if (!entry) throw new Error('Prompt 条目不存在，无法渲染');

  if (entry.template_ref === 'aiService') {
    const { data, customInstructions } = args;
    switch (entry.ai_template_key) {
      case 'rca_analysis':
        return aiService.buildRCAPrompt(data, customInstructions);
      case 'document_analysis':
        return aiService.buildDocumentAnalysisPrompt(data, customInstructions);
      case 'report_monthly':
        return aiService.buildMonthlyReportPrompt(data, customInstructions);
      case 'report_group':
        return aiService.buildGroupReportPrompt(data, customInstructions);
      case 'standard_evaluation':
        return aiService.buildStandardEvaluationPrompt(
          data && data.clause,
          data && data.relatedDocuments,
          customInstructions
        );
      default:
        return aiService.buildReportPrompt(entry.ai_template_key, data, customInstructions);
    }
  }

  // 普通文本模板：{data} / {custom_instructions} 占位符替换（与 aiService 占位符体系一致）
  const dataText = args.data != null
    ? (typeof args.data === 'string' ? args.data : JSON.stringify(args.data, null, 2))
    : '';
  const customText = args.customInstructions && args.customInstructions.trim()
    ? `【用户附加要求】\n${args.customInstructions.trim()}`
    : '无额外要求，按标准格式输出。';

  let prompt = (entry.system_prompt ? `${entry.system_prompt}\n\n` : '') + (entry.user_prompt_template || '');
  prompt = prompt.replace(/\{data\}/g, dataText).replace(/\{custom_instructions\}/g, customText);
  return prompt;
}

// 启动时预注册：基础 Prompt + RAG 问答（DRAFT）+ 数据分析（DRAFT）+ 管理建议（DRAFT）+ aiService 模板引用
register(BASE_PROMPT);
register(RAG_PROMPT);
register(DATA_ANALYSIS_PROMPT);
register(MANAGEMENT_SUGGESTION_PROMPT);
_registerAiServiceRefs();

module.exports = {
  PROMPT_STATUS,
  AISERVICE_TEMPLATE_REFS,
  register,
  get,
  getActive: (promptKey) => get(promptKey),
  list,
  has,
  render,
};

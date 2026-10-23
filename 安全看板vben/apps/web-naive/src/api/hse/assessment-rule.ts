/**
 * HSE 考核扣分规则库 API（web-naive）
 * 契约来源：server/routes/hse-assessment-rule.js（唯一契约来源）。
 * 端点：/hse/assessment-rule（服务端挂载于 /api/hse/assessment-rule）。
 * 全量使用 requestClient（JSON）。字段为后端 camelCase。
 */
import { requestClient } from '#/api/request';

const BASE = '/hse/assessment-rule';

export namespace AssessmentRuleApi {
  export interface RuleDetail {
    id: number;
    detailCode: string | null;
    detailName: string;
    deductScore: number;
    unit: string;
    sortOrder: number;
  }

  export interface RuleCondition {
    id: number;
    logic: 'and' | 'or';
    field: string;
    operator: string;
    value: string;
    sortOrder: number;
  }

  export interface AssessmentRule {
    id: number;
    ruleCode: string | null;
    ruleName: string;
    category: string;
    metricCode: string | null;
    indicatorName: string | null;
    itemName: string | null;
    sourceTable: string | null;
    /** 手动链接：在一级/二级/三级菜单中选中的页面路由（空则仅自动链接到来源表） */
    sourceRoute: string | null;
    triggerType: 'auto' | 'manual';
    deductType: 'fixed' | 'cumulative' | 'detail' | 'tiered';
    deductScore: number;
    maxDeduct: number | null;
    deductConfig: any;
    transmissionConfig: any;
    conditionMode: 'simple' | 'advanced';
    conditionExpr: any;
    scopeConfig: any;
    cycleType: string;
    priority: number;
    version: number;
    validFrom: string;
    validTo: string | null;
    status: 'enabled' | 'disabled';
    remark: string | null;
    isDeleted: boolean;
    createdAt: string;
    updatedAt: string;
    detailCount?: number;

    // ===== 阶段0 新增：接入状态与最近执行结果（server/sql/sprint_rule_engine_phase0_observability.sql）=====
    /** 适配器标识：grid_unchecked 等；空=尚未建设自动适配器 */
    adapterKey?: string | null;
    /** 接入状态：active=已接入 / pending_data=待数据 / no_table=未接表 / manual=人工 */
    integrationStatus?: 'active' | 'pending_data' | 'no_table' | 'manual' | null;
    /** 接入说明：为何暂未自动生效，界面提示用 */
    integrationNote?: string | null;
    /** 最近一次实际扫描时间（dryRun 不记录） */
    lastRunAt?: string | null;
    /** 最近一次扫描对应的考核周期 id */
    lastRunCycleId?: number | null;
    /** 提示词-14：最近一次扫描所属考核周期编码（如 HSE-CYCLE-202608），用于"执行周期"标签；NULL 不显示 */
    lastRunCycleCode?: string | null;
    /** 最近一次扫描覆盖的考核对象人数（含非本期考核对象） */
    lastScannedCount?: number | null;
    /** 阶段1.5 新增：最近一次扫描中实际命中考核对象的人数（不含非考核对象） */
    lastAssessedCount?: number | null;
    /** 最近一次扫描实际产生有效扣分的人数 */
    lastDeductedCount?: number | null;
    /** 最近执行结果展示文案，如「扫描62人/扣分24人」 */
    lastRunSummary?: string | null;
  }

  /** 接入状态字典（与后端 integration_status 取值一致） */
  export type IntegrationStatus = 'active' | 'pending_data' | 'no_table' | 'manual';

  export interface RuleDetailItem extends RuleDetail {
    /** 前端编辑态临时主键（新增行） */
    _t?: string;
  }

  /** 导入返回的子项行 */
  export interface RuleDetailImportRow {
    detailName: string;
    deductScore: number | null;
    unit: string;
    detailCode: string;
  }

  export interface RuleDetailPayload {
    id?: number;
    detailCode?: string | null;
    detailName: string;
    deductScore: number;
    unit?: string;
  }

  export interface RuleConditionPayload {
    id?: number;
    logic?: 'and' | 'or';
    field: string;
    operator?: string;
    value?: string;
  }

  export interface RulePayload {
    ruleCode?: string | null;
    ruleName: string;
    category: string;
    metricCode?: string | null;
    indicatorName?: string | null;
    itemName?: string | null;
    sourceTable?: string | null;
    /** 手动链接选中的页面路由（可空） */
    sourceRoute?: string | null;
    triggerType?: 'auto' | 'manual';
    deductType: 'fixed' | 'cumulative' | 'detail' | 'tiered';
    deductScore?: number;
    maxDeduct?: number | null;
    deductConfig?: any;
    conditionMode?: 'simple' | 'advanced';
    scopeConfig?: any;
    priority?: number;
    validFrom?: string;
    validTo?: string | null;
    status?: 'enabled' | 'disabled';
    remark?: string | null;
    details?: RuleDetailPayload[];
    conditions?: RuleConditionPayload[];
  }

  export interface ListResult {
    list: AssessmentRule[];
    total: number;
    page: number;
    size: number;
  }

  export interface ListParams {
    page?: number;
    size?: number;
    category?: string;
    trigger_type?: string;
    deduct_type?: string;
    status?: string;
    /** 阶段0 新增：按接入状态筛选 */
    integration_status?: string;
    keyword?: string;
  }

  export interface Stats {
    total: number;
    enabled: number;
    fixedCnt: number;
    cumulativeCnt: number;
    detailCnt: number;
    tieredCnt: number;
    autoCnt: number;
    manualCnt: number;
    detailRows: number;
    // 阶段0 新增：各接入状态计数
    integrationActive?: number;
    integrationPendingData?: number;
    integrationNoTable?: number;
    integrationManual?: number;
  }

  export interface RuleDetailResult {
    rule: AssessmentRule;
    details: RuleDetail[];
    conditions: RuleCondition[];
  }
}

// GET / — 列表
export function getAssessmentRuleList(params: AssessmentRuleApi.ListParams) {
  return requestClient.get<AssessmentRuleApi.ListResult>(`${BASE}`, { params });
}

// GET /stats — 统计
export function getAssessmentRuleStats() {
  return requestClient.get<AssessmentRuleApi.Stats>(`${BASE}/stats`);
}

// GET /categories — 类别字典
export function getAssessmentRuleCategories() {
  return requestClient.get<string[]>(`${BASE}/categories`);
}

// GET /:id — 详情
export function getAssessmentRuleDetail(id: number) {
  return requestClient.get<AssessmentRuleApi.RuleDetailResult>(`${BASE}/${id}`);
}

// POST / — 新建
export function createAssessmentRule(payload: AssessmentRuleApi.RulePayload) {
  return requestClient.post<AssessmentRuleApi.AssessmentRule>(`${BASE}`, payload);
}

// PUT /:id — 更新（整体替换子项/条件）
export function updateAssessmentRule(id: number, payload: AssessmentRuleApi.RulePayload) {
  return requestClient.put<AssessmentRuleApi.RuleDetailResult>(`${BASE}/${id}`, payload);
}

// PUT /:id/status — 启停
export function updateAssessmentRuleStatus(id: number, status: 'enabled' | 'disabled') {
  return requestClient.put<AssessmentRuleApi.AssessmentRule>(`${BASE}/${id}/status`, { status });
}

// DELETE /:id — 删除（软删）
export function deleteAssessmentRule(id: number) {
  return requestClient.delete<void>(`${BASE}/${id}`);
}

// POST /import-details — 导入扣分明细（Excel/CSV/文本），返回解析出的子项行
export function importRuleDetails(file: File) {
  const fd = new FormData();
  fd.append('file', file);
  return requestClient.post<AssessmentRuleApi.RuleDetailImportRow[]>(`${BASE}/import-details`, fd, {
    // 覆盖 requestClient 默认的 application/json，交由浏览器自动生成 multipart boundary（与 uploadImport 一致）
    headers: { 'Content-Type': undefined as any },
  });
}

// ============================================================
// 类别扣分上限（hse_assessment_category_limit）
// 契约来源：server/routes/hse-assessment-category.js
// ============================================================
const CAT_BASE = '/hse/assessment-category';

export namespace CategoryLimitApi {
  /** 每行规则（图片式表单数组：考核内容/扣分/状态） */
  export interface CategoryRuleItem {
    name: string;
    deductScore: number | null;
    status: 'enabled' | 'disabled';
  }
  export interface CategoryLimit {
    id: number | null;
    /** 客户端唯一键（VXE row-key），非持久化字段 */
    _key?: string;
    category: string;
    maxDeduct: number | null;
    /** 扣分对象：self=扣本人 / manager=传导到所属乡镇作业中心经理 / 其它=自定义 */
    deductTarget?: string | null;
    remark: string | null;
    ruleCount: number | null;
    ruleTotal: number;
    ruleEnabled: number;
    /** 可编辑的规则名称文本（持久化，多个用顿号分隔） */
    ruleNames?: string | null;
    /** 由规则表派生的规则名称数组（只读回填用） */
    ruleNamesDerived?: string[];
    /** 由规则表派生的每行规则扣分（只在无 ruleItems 时用于回填） */
    ruleScoresDerived?: (number | null)[];
    /** 由规则表派生的每行规则状态（只在无 ruleItems 时用于回填） */
    ruleStatusesDerived?: ('enabled' | 'disabled')[];
    /** 每行规则（考核内容/扣分/状态），持久化于 rule_items，优先于 ruleNames */
    ruleItems?: CategoryRuleItem[];
    /** 行编辑用的规则数组（客户端工作字段，非持久化） */
    _ruleItems?: CategoryRuleItem[];
    /** 加载时的原始类别（基线），用于检测类别改名并同步规则表 */
    originalCategory?: string | null;
  }
  export interface CategoryLimitPayload {
    category: string;
    maxDeduct: number | null;
    /** 扣分对象：self=本人 / manager=传导到乡镇作业中心经理 / 自定义文本 */
    deductTarget?: string | null;
    ruleCount?: number | null;
    ruleNames?: string | null;
    /** 每行规则（考核内容/扣分/状态） */
    ruleItems?: CategoryRuleItem[];
    remark?: string | null;
    /** 原始类别（改名基线，用于同步规则表） */
    originalCategory?: string | null;
  }
}

// GET /limits — 类别扣分上限列表（role=manager|admin 按岗位取套，缺省 manager）
export function getCategoryLimits(role: 'manager' | 'admin' = 'manager') {
  return requestClient.get<CategoryLimitApi.CategoryLimit[]>(`${CAT_BASE}/limits`, {
    params: { role },
  });
}

// POST /limits — 全量保存类别上限（支持新增/修改/删除行；按 role 岗位各自独立）
export function updateCategoryLimits(
  payload: CategoryLimitApi.CategoryLimitPayload[],
  role: 'manager' | 'admin' = 'manager'
) {
  return requestClient.post<number>(`${CAT_BASE}/limits`, payload, {
    params: { role },
  });
}
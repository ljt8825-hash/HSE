/**
 * 人员任职段状态编码字典 —— A-02d 状态编码统一（唯一事实源）
 *
 * 背景（B02-DEC-03.13 / A-02d 已确定业务规则）：
 *   1. employee.employment_relation 是人员关系的权威字段；
 *   2. employee_assignment.status 由其单向派生，禁止反向写入 employment_relation；
 *   3. employment_relation = NULL 保持「待核实」，不推断、不补值；
 *   4. 辞职 / 死亡 / 退休 的新业务终态统一编码为 inactive，终止原因只由 employment_relation 表达；
 *   5. 待岗 = pending；6. 借调 = secondment（不得与 transfer 混淆）；
 *   7. 停薪留职 = unpaid_leave；
 *   8. former 为历史兼容值，不新增、不批量改写、不删除；
 *   9. retired 保留历史读取兼容，新业务不再作为退休标准写入值；
 *  10. reinstated 业务规则未冻结，保留现状。
 *      （B02-DEC-03.26 / A-02e.5-B2.2 已冻结：reinstated 仍为可写的任职段编码，
 *        但【只能由返聘动作 rehireEmployee 写入】，通用状态变更接口不得写入该值 —— 见第 13 条）
 *
 * B02-DEC-03.15 / D1 补充（退休原因权威来源）：
 *  11. 「退休」纳入 employee.employment_relation 的正式取值，与 辞职 / 死亡 并列为终态原因。
 *      依据：A-02d.1 已证实——若无此取值，退休归一为 inactive 后系统无法区分退休与辞职，
 *      且「退休」筛选对新数据永远失效。该列为 VARCHAR(40)，无 CHECK 约束、无枚举类型、
 *      无外键（见 server/sql/alter_employee_relation_status.sql 与库结构 dump），
 *      扩展取值【不需要任何 DDL】。
 *  12. assignment.status = inactive 单独【不得】决定展示为辞职 / 死亡 / 退休；
 *      展示必须结合关系事实派生（见 displayStatusSql / profileStatusSql）。
 *
 * 本模块只做「编码字典 + 终态判定 + 展示映射 + 关系取值校验」，不含任何业务写库逻辑。
 */

// ------------------------------------------------------------
// 写入归一：中文 / 别称 / 英文直写 → 存储编码
// ------------------------------------------------------------
const STATUS_MAP = {
  // 中文业务语义（UI 与接口主入口）
  '在职': 'active',
  '待岗': 'pending',
  '借调': 'secondment',
  '停薪留职': 'unpaid_leave',
  '离职': 'inactive',
  '辞职': 'inactive',   // §二.4：终态统一 inactive，原因由 employment_relation 表达
  '死亡': 'inactive',   // 同上
  '退休': 'inactive',   // 同上（新业务不再写 retired）
  '返聘': 'reinstated', // §二.10：业务规则未冻结，保留现状

  // 英文直写（幂等，供内部调用与脚本）
  'active': 'active',
  'pending': 'pending',
  'secondment': 'secondment',
  'unpaid_leave': 'unpaid_leave',
  'inactive': 'inactive',
  'reinstated': 'reinstated',
  // §二.9：retired 为历史兼容值，直写时归一到 inactive（不新增 retired 写入）
  'retired': 'inactive',
};

// ------------------------------------------------------------
// 展示映射：存储编码 → 中文（含历史值兼容）
// ------------------------------------------------------------
const STATUS_REVERSE_MAP = {
  'active': '在职',
  'pending': '待岗',
  'secondment': '借调',
  'unpaid_leave': '停薪留职',
  'inactive': '离职',        // §四.8：通用的「离职」，不一律显示为「辞职」（原因见 employment_relation）
  'retired': '退休',         // §二.9：历史数据/兼容消费者保留
  'reinstated': '返聘',
  // §二.8：former 为历史兼容值。真实数据证据（B02-DEC-03.3 报告 F-2/E-6）表明其来源是
  // 2026-09-06 单批次「月度花名册切段」产生的已结束段，业务语义未冻结 ⇒ 展示用中性表述，
  // 不推断为「辞职/离职」。
  'former': '历史段',
};

/** 可写入编码白名单（former 不在其中：§二.8 不新增） */
const WRITABLE_STATUS_CODES = Object.freeze([
  'active', 'pending', 'secondment', 'unpaid_leave', 'inactive', 'reinstated',
]);

/**
 * 终态编码：写入后关闭任职段（is_current=false + end_date）
 * retired 仅因历史数据存在而保留终态语义；新业务终态统一走 inactive。
 */
const TERMINAL_STATUS_CODES = Object.freeze(['inactive', 'retired']);

/**
 * 中间态编码：不得仅因状态名而自动关闭任职段（is_current 保持 true，end_date 不写）
 * 待岗 / 借调 / 停薪留职 均属中间态。
 */
const INTERMEDIATE_STATUS_CODES = Object.freeze(['pending', 'secondment', 'unpaid_leave']);

/** 历史兼容、只读不写的编码（§二.8 / §二.9） */
const LEGACY_READ_ONLY_CODES = Object.freeze(['former']);

/**
 * 「只能由专用业务动作写入」的编码（B02-DEC-03.26 / A-02e.5-B2.2）。
 *
 * reinstated 不是一次「状态切换」，而是一次「返聘」业务动作的结果：
 * 它必须与新建任职段、重置用工关系、写返聘历史在同一事务内完成
 * （见 employeeAssignmentService.rehireEmployee）。
 * 因此通用状态变更接口（changeAssignmentStatus / PUT /org/:id/status）不得写入该值，
 * 否则只会把一条既有（在职）段的 status 改成「返聘」，既不建段也不改关系，
 * 制造「段说返聘、关系说退休」的畸形数据（A-02e.5-B2.1 §5 证据）。
 */
const ACTION_ONLY_STATUS_CODES = Object.freeze(['reinstated']);

/**
 * 展示映射的固定 SQL 顺序（避免 ORDER 变化导致快照/断言漂移）
 */
const LABEL_SQL_ORDER = Object.freeze([
  'active', 'pending', 'secondment', 'unpaid_leave', 'inactive', 'retired', 'reinstated', 'former',
]);

// ============================================================
// 用工关系（employee.employment_relation）权威取值 —— B02-DEC-03.15 / D1
// ============================================================

/**
 * 关系事实取值。这是【权威事实】，assignment.status 只能由它单向派生，
 * 任何状态变更都不得反向写入这里（A-02 / A-05）。
 */
const RELATION = Object.freeze({
  FORMAL: '正式员工',   // 在职 / 具备考核对象资格
  RESIGNED: '辞职',     // 终态原因
  DECEASED: '死亡',     // 终态原因
  RETIRED: '退休',      // 终态原因（D1 新增的正式取值）
});

/** 全部【正式】关系取值（不含 NULL：NULL = 待核实，是合法状态而非取值） */
const RELATION_VALUES = Object.freeze([
  RELATION.FORMAL, RELATION.RESIGNED, RELATION.DECEASED, RELATION.RETIRED,
]);

/**
 * 历史兼容取值：前端「用工关系状态」下拉历史上混入了「待岗」（属字段混用 ——
 * 待岗是 assignment.status 的中间态，不是关系事实，见 A-05）。
 * 为保证历史数据在编辑其他字段时不被拒绝、也不被静默清空，此处保留【写入兼容】，
 * 但不纳入正式取值集合，也不推荐新增写入。是否清理属后续数据治理裁决。
 */
const LEGACY_RELATION_VALUES = Object.freeze(['待岗']);

/** 可写入的关系取值白名单（正式值 + 历史兼容值） */
const WRITABLE_RELATION_VALUES = Object.freeze([
  ...RELATION_VALUES, ...LEGACY_RELATION_VALUES,
]);

/** 终态原因取值：可写入 employee_history 的原因标签，也是「已离开」的完整集合 */
const TERMINAL_RELATION_VALUES = Object.freeze([
  RELATION.RESIGNED, RELATION.DECEASED, RELATION.RETIRED,
]);

/**
 * 「离职」口径：辞职 + 死亡。
 * 退休【不并入】离职——§七 要求退休不得误标为离职，退休在展示与筛选中单列。
 */
const LEFT_RELATION_VALUES = Object.freeze([
  RELATION.RESIGNED, RELATION.DECEASED,
]);


/**
 * 状态归一化。
 * @param {string|null|undefined} input 中文 / 编码 / 别称
 * @returns {string|null} 存储编码；无法识别返回 null（调用方必须显式报错，禁止静默落库）
 */
function normalizeStatus(input) {
  if (input == null) return null;
  const key = String(input).trim();
  if (!key) return null;
  return STATUS_MAP[key] || null;
}

/**
 * 状态归一化（带默认值），保持既有 createAssignment 行为：空值默认 active。
 * @param {string|null|undefined} input
 * @param {string} fallback
 * @returns {string|null}
 */
function normalizeStatusOrDefault(input, fallback = 'active') {
  if (input == null || String(input).trim() === '') return fallback;
  return normalizeStatus(input);
}

/** 是否终态（写入后关闭任职段） */
function isTerminalStatus(code) {
  return TERMINAL_STATUS_CODES.includes(code);
}

/** 是否中间态（不得自动关闭任职段） */
function isIntermediateStatus(code) {
  return INTERMEDIATE_STATUS_CODES.includes(code);
}

/** 是否可写入编码 */
function isWritableStatus(code) {
  return WRITABLE_STATUS_CODES.includes(code);
}

/**
 * 是否「只能由专用业务动作写入」的编码。
 * 用于状态变更接口的门禁：命中即拒绝，并把调用方指向真正的业务流程。
 * @param {string|null|undefined} code 存储编码（不是中文入参）
 * @returns {boolean}
 */
function isActionOnlyStatus(code) {
  if (code == null) return false;
  return ACTION_ONLY_STATUS_CODES.includes(code);
}

/** 编码 → 中文展示；未知编码原样返回（§四.9：不得静默丢弃未知状态） */
function toStatusLabel(code) {
  if (code == null) return code;
  return STATUS_REVERSE_MAP[code] || code;
}

/**
 * 生成「状态编码 → 中文」的 SQL CASE 表达式，替代各处重复的硬编码 CASE 块。
 * @param {string} column 列引用（仅允许简单标识符，如 ea.status / a.status / status）
 * @returns {string}
 */
function statusLabelSql(column = 'status') {
  if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(column)) {
    throw new Error(`statusLabelSql: 非法列引用 ${column}`);
  }
  const whens = LABEL_SQL_ORDER
    .map((code) => `WHEN ${column} = '${code}' THEN '${STATUS_REVERSE_MAP[code]}'`)
    .join('\n              ');
  return `CASE
              ${whens}
              ELSE ${column}
            END`;
}

// ============================================================
// 用工关系（employment_relation）：校验与 SQL 片段生成 —— D1 / D2
// ============================================================

const COLUMN_PATTERN = /^[A-Za-z_][A-Za-z0-9_.]*$/;

function assertColumn(column, fnName) {
  if (typeof column !== 'string' || !COLUMN_PATTERN.test(column)) {
    throw new Error(`${fnName}: 非法列引用 ${column}`);
  }
  return column;
}

function relationInSql(column, values, fnName) {
  assertColumn(column, fnName);
  return `${column} IN (${values.map((v) => `'${v}'`).join(',')})`;
}

/** 已知关系取值（正式值 + 历史兼容值）——「花名册全员」口径，避免退休人员被漏统计 */
function knownRelationInSql(column) {
  return relationInSql(column, WRITABLE_RELATION_VALUES, 'knownRelationInSql');
}

/** 终态原因（辞职 / 死亡 / 退休）——「已离开」口径 */
function terminalRelationInSql(column) {
  return relationInSql(column, TERMINAL_RELATION_VALUES, 'terminalRelationInSql');
}

/** 离职口径（辞职 / 死亡，不含退休 —— §七 退休不得误标为离职） */
function leftRelationInSql(column) {
  return relationInSql(column, LEFT_RELATION_VALUES, 'leftRelationInSql');
}

/**
 * 终态原因的值列表（含引号），用于 NOT IN 这类无法直接传列名的场景。
 * 例：`) NOT IN (${terminalRelationValueListSql()})`
 */
function terminalRelationValueListSql() {
  return TERMINAL_RELATION_VALUES.map((v) => `'${v}'`).join(',');
}

/**
 * 判定「用工关系」是否明确属于终态（辞职 / 死亡 / 退休）。
 *
 * A-02e.5-B1 / C1 的统一判定出口：普通分配、V1 Excel 导入、V2 花名册导入的终态闸门
 * 都只读 employee.employment_relation，且都必须经由本函数，避免三处各写一套白名单。
 *
 * 语义边界（不得放宽）：
 *  - null / undefined / 空串 → false（「待核实」，禁止推断、禁止补值）；
 *  - '待岗' 等历史兼容值、中间状态、未知历史值 → false（无证据不得判为终态）；
 *  - 仅 TERMINAL_RELATION_VALUES 精确命中（去首尾空白）→ true。
 * 禁止用 assignment.status / is_current / 历史任职段形态等间接信息替代本判定。
 *
 * @param {string|null|undefined} value - employee.employment_relation 原值
 * @returns {boolean}
 */
function isTerminalRelation(value) {
  if (value == null) return false;
  const v = String(value).trim();
  if (!v) return false;
  return TERMINAL_RELATION_VALUES.includes(v);
}

/**
 * 校验 employment_relation 写入值。
 *  - undefined（未传该字段）→ { ok:true, skip:true }
 *  - null / 空串            → { ok:true, value:null }：表示「待核实」，禁止自动补值（A-01）
 *  - 已知取值               → { ok:true, value:<标准值> }
 *  - 其它                   → { ok:false }：拒绝并提示，不静默丢弃（§四.9）
 * @param {*} input
 */
function validateRelationInput(input) {
  if (input === undefined) return { ok: true, skip: true };
  if (input === null) return { ok: true, value: null };
  const v = String(input).trim();
  if (!v) return { ok: true, value: null };
  if (WRITABLE_RELATION_VALUES.includes(v)) return { ok: true, value: v };
  return {
    ok: false,
    message: `无效的用工关系取值「${v}」，可选：${WRITABLE_RELATION_VALUES.join(' / ')}；留空表示待核实`,
  };
}

/** 关系 → 中文展示；未知值原样返回（不静默丢弃） */
function toRelationLabel(value) {
  if (value == null) return value;
  const v = String(value).trim();
  return WRITABLE_RELATION_VALUES.includes(v) ? v : value;
}

/**
 * 员工「组织状态 / 人员状态」展示值派生（读侧派生值，非存储值）。
 *
 * 关键（§二）：assignment.status = inactive 不得单独决定原因，因此先看关系事实：
 *   关系 = 退休       → 'retired'（前端已有「退休」标签；历史 retired 数据同码，天然兼容）
 *   关系 = 辞职 / 死亡 → 'left'
 *   其它              → 任职段状态
 */
function displayStatusSql(relationColumn, statusColumn) {
  assertColumn(relationColumn, 'displayStatusSql');
  assertColumn(statusColumn, 'displayStatusSql');
  return `CASE
              WHEN ${relationColumn} = '${RELATION.RETIRED}' THEN 'retired'
              WHEN ${relationInSql(relationColumn, LEFT_RELATION_VALUES, 'displayStatusSql')} THEN 'left'
              ELSE ${statusColumn}
            END`;
}

/**
 * 员工档案维度（无任职段状态）派生。
 * 既有结构：CASE WHEN 关系 IN(辞职,死亡) THEN 'left' WHEN is_deleted THEN 'inactive' ELSE 'active'，
 * 此处保持既有回退顺序，仅前置退休分支。
 */
function profileStatusSql(relationColumn, deletedColumn) {
  assertColumn(relationColumn, 'profileStatusSql');
  assertColumn(deletedColumn, 'profileStatusSql');
  return `CASE
              WHEN ${relationColumn} = '${RELATION.RETIRED}' THEN 'retired'
              WHEN ${relationInSql(relationColumn, LEFT_RELATION_VALUES, 'profileStatusSql')} THEN 'left'
              WHEN ${deletedColumn} THEN 'inactive'
              ELSE 'active'
            END`;
}

/**
 * 人事历史 after_status 标签（D2）。
 * 终态原因原样写入（辞职 / 死亡 / 退休），保证与同记录 event_type 一致；
 * 其余走编码 → 中文标签。历史旧记录不批量改写。
 */
const TERMINAL_REASON_LABELS = Object.freeze(['辞职', '死亡', '退休']);

function toHistoryStatusLabel(rawInput, normalizedCode) {
  const raw = rawInput == null ? '' : String(rawInput).trim();
  if (TERMINAL_REASON_LABELS.includes(raw)) return raw;
  return toStatusLabel(normalizedCode);
}

module.exports = {
  STATUS_MAP,
  STATUS_REVERSE_MAP,
  WRITABLE_STATUS_CODES,
  TERMINAL_STATUS_CODES,
  INTERMEDIATE_STATUS_CODES,
  LEGACY_READ_ONLY_CODES,
  ACTION_ONLY_STATUS_CODES,
  normalizeStatus,
  normalizeStatusOrDefault,
  isTerminalStatus,
  isIntermediateStatus,
  isWritableStatus,
  isActionOnlyStatus,
  toStatusLabel,
  statusLabelSql,
  // 用工关系（D1 / D2）
  RELATION,
  RELATION_VALUES,
  LEGACY_RELATION_VALUES,
  TERMINAL_RELATION_VALUES,
  LEFT_RELATION_VALUES,
  WRITABLE_RELATION_VALUES,
  TERMINAL_REASON_LABELS,
  knownRelationInSql,
  terminalRelationInSql,
  leftRelationInSql,
  terminalRelationValueListSql,
  isTerminalRelation,
  validateRelationInput,
  toRelationLabel,
  displayStatusSql,
  profileStatusSql,
  toHistoryStatusLabel,
};

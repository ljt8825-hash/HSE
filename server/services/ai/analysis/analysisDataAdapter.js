/**
 * AI-06 Analysis Data Adapter —— 只读数据适配层
 *
 * 设计原则（AI-06 任务书 §5/§6/§7 + AI-09 截断可见）：
 *  - 不绑定任何单一业务表：通过「领域注册表」描述每个域的只读读取方式；
 *  - 业务原始数据是唯一事实来源，禁止复制到万能分析表；
 *  - 支持两种数据来源：
 *      1) records 注入（显式传入标准记录，用于人工构造测试数据 / 调用方自带数据）
 *      2) db 只读（真实业务表最小范围查询：timeRange + limit，脱敏、不写）
 *  - 截断可见（AI-09）：db 模式先 COUNT(*) 得到 totalAvailable（不加载全部记录），
 *    再 LIMIT 拉取 analyzedRecords，返回 dataScope = { totalAvailable, analyzedRecords, limit, truncated }，
 *    让上层（统计/前端）能明确告知「本次分析仅使用部分数据」；
 *    注入模式数据范围即注入条数（totalAvailable === analyzedRecords，truncated=false）。
 *  - 无法确认的域返回 DOMAIN_NOT_SUPPORTED，不伪造。
 */

const { pool } = require('../../../config/db');
const { AiError } = require('../errors');

const ERROR = {
  DOMAIN_NOT_SUPPORTED: 'AI_DOMAIN_NOT_SUPPORTED',
  INVALID_TIME_RANGE: 'AI_INVALID_TIME_RANGE',
  DATA_READ_FAILED: 'AI_DATA_READ_FAILED',
};

/**
 * 领域注册表（hazard 为 AI-06 主域；inspection 数据不足仅注册结构）
 * 每域描述 db 模式的表与字段映射；records 注入模式与 db 模式共用同一标准结构。
 */
const DOMAINS = {
  hazard: {
    name: '隐患',
    table: 'hazards',
    columns: {
      id: 'id',
      date: 'hazard_date',
      status: 'status',
      category: 'hazard_category', // 回退 category / hazard_type 见 SQL COALESCE
      categoryAlt: ['category', 'hazard_type'],
      level: 'risk_level',
      levelAlt: ['level'],
      org: 'responsible_dept',
      orgAlt: ['township', 'area'],
      area: 'area',
      source: 'hazard_source',
      rectifyDate: 'fix_date',
      rectifyDateAlt: ['actual_rectify_date'],
      deadline: 'deadline_date',
      deadlineAlt: ['deadline'],
      verifyDate: 'verify_date',
    },
  },
  inspection: {
    name: '检查/巡检',
    table: 'hse_inspection_tasks',
    columns: {
      id: 'id',
      date: 'scheduled_date',
      status: 'status',
      category: null,
      level: null,
      org: 'department_id',
      area: null,
      source: null,
      rectifyDate: null,
      deadline: null,
      verifyDate: 'completed_date',
    },
  },
};

const MAX_RECORDS = 2000;

function domainConfig(domain) {
  return DOMAINS[domain] || null;
}

function _coalesceSql(primary, alts) {
  const cols = [primary, ...(alts || [])].filter(Boolean);
  return cols.length ? `COALESCE(${cols.join(', ')})` : 'NULL';
}

function buildSelectSql(cfg) {
  const c = cfg.columns;
  return `
    SELECT
      ${c.id ? `${c.id} AS "id"` : 'NULL AS "id"'},
      ${c.date ? `${c.date} AS "date"` : 'NULL AS "date"'},
      ${c.status ? `${c.status} AS "status"` : 'NULL AS "status"'},
      ${c.category ? _coalesceSql(c.category, c.categoryAlt) + ` AS "category"` : 'NULL AS "category"'},
      ${c.level ? _coalesceSql(c.level, c.levelAlt) + ` AS "level"` : 'NULL AS "level"'},
      ${c.org ? _coalesceSql(c.org, c.orgAlt) + ` AS "org"` : 'NULL AS "org"'},
      ${c.area ? `${c.area} AS "area"` : 'NULL AS "area"'},
      ${c.source ? `${c.source} AS "source"` : 'NULL AS "source"'},
      ${c.rectifyDate ? _coalesceSql(c.rectifyDate, c.rectifyDateAlt) + ` AS "rectify_date"` : 'NULL AS "rectify_date"'},
      ${c.deadline ? _coalesceSql(c.deadline, c.deadlineAlt) + ` AS "deadline"` : 'NULL AS "deadline"'},
      ${c.verifyDate ? `${c.verifyDate} AS "verify_date"` : 'NULL AS "verify_date"'}
    FROM ${cfg.table}
  `;
}

/**
 * 读取原始记录（两种模式）：
 * @param {Object} input
 * @param {string} input.domain - 数据域（hazard / inspection）
 * @param {Object} [input.timeRange] - { start, end } 日期过滤
 * @param {Array} [input.records] - 注入标准记录（跳过 db）
 * @param {number} [input.limit] - db 模式最大读取条数（默认 1000）
 * @returns {Promise<{ domain, available, records, sourceMode, dataScope }>}
 *   dataScope（AI-09 截断可见）：{ totalAvailable, analyzedRecords, limit, truncated }
 *   - db 模式：totalAvailable = COUNT(*)（同一过滤条件，不加载全部记录），
 *     analyzedRecords = 实际 LIMIT 拉取条数，truncated = analyzedRecords < totalAvailable。
 *   - 注入模式：totalAvailable = analyzedRecords = 注入条数，truncated = false。
 */
async function fetchRawRecords(input = {}) {
  const domain = String(input.domain || '').trim();
  const cfg = domainConfig(domain);
  if (!cfg) {
    throw new AiError(ERROR.DOMAIN_NOT_SUPPORTED, `不支持的 data domain: ${domain}（支持: ${Object.keys(DOMAINS).join(', ')}）`);
  }

  const { start, end } = input.timeRange || {};
  if (start && end && new Date(start) > new Date(end)) {
    throw new AiError(ERROR.INVALID_TIME_RANGE, `timeRange 起始时间不能晚于结束时间: ${start} > ${end}`);
  }

  // 模式 1：records 注入
  if (Array.isArray(input.records)) {
    const n = input.records.length;
    return {
      domain,
      available: true,
      sourceMode: 'injected',
      records: input.records,
      dataScope: {
        totalAvailable: n,
        analyzedRecords: n,
        limit: n,
        truncated: false,
      },
    };
  }

  // 模式 2：db 只读（最小范围 + 脱敏，仅 SELECT）
  const limit = Math.min(Math.max(parseInt(input.limit) || 1000, 1), MAX_RECORDS);
  try {
    const sql = buildSelectSql(cfg);
    const conds = ['is_deleted = false'];
    const vals = [];
    if (start) { conds.push(`${cfg.columns.date || '1=1'} >= $${vals.length + 1}::date`); vals.push(String(start)); }
    if (end) { conds.push(`${cfg.columns.date || '1=1'} <= $${vals.length + 1}::date`); vals.push(String(end)); }

    // 先 COUNT(*)（同条件，不带 LIMIT）：得到符合条件的总量，不加载全部记录到内存（AI-09 §9）
    const cnt = await pool.query(
      `SELECT COUNT(*)::int AS c FROM ${cfg.table} WHERE ${conds.join(' AND ')}`,
      vals
    );
    const totalAvailable = parseInt(cnt.rows[0].c, 10) || 0;

    // 再 LIMIT 拉取本次分析记录
    const r = await pool.query(`${sql} WHERE ${conds.join(' AND ')} LIMIT $${vals.length + 1}`, [...vals, limit]);
    const analyzedRecords = r.rows.length;
    return {
      domain,
      available: true,
      sourceMode: 'db',
      records: r.rows,
      dataScope: {
        totalAvailable,
        analyzedRecords,
        limit,
        truncated: analyzedRecords < totalAvailable,
      },
    };
  } catch (e) {
    throw new AiError(ERROR.DATA_READ_FAILED, `数据读取失败(domain=${domain}): ${e.message}`);
  }
}

module.exports = {
  DOMAINS,
  MAX_RECORDS,
  domainConfig,
  fetchRawRecords,
  AiError,
  ERROR,
};

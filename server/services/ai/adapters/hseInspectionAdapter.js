/**
 * HSE 检查数据 Adapter（SK-003 业务适配层 — AI-Phase-01-06 任务书 §十九）
 *
 * 定位：
 *   HSE Data → HSE Adapter → Generic Inspection Dataset → SK-003 → Analysis Result
 *   Adapter 负责把 HSE 实际字段映射为 SK-003 核心认识的「通用字段语义」，
 *   SK-003 核心不出现任何 HSE 字段名 / HSE 业务规则（§四/§十九）。
 *
 * 数据边界（prod-boundary 规则）：
 *   - grid_inspection_records / grid_areas 为生产表：本 Adapter 只做只读 SELECT，
 *     禁止 INSERT / UPDATE / DELETE / ALTER / TRUNCATE；
 *   - 不做姓名/工号/网格的自动身份推断（身份链权威口径不归本 Adapter），
 *     仅按数据行内已有文本字段原样映射，不做 employee_id / grid_id 反推。
 *
 * 映射口径（v1，grid_inspection_records 17 列 → 通用语义）：
 *   date         ← inspection_date        检查日期（DATE 类型）
 *   inspector    ← personnel_name         检查人姓名
 *   subject      ← violator_name          违章人姓名（被检查对象）
 *   organization ← area_team              片区/班组
 *   location     ← grid_name              网格名称（grid_id LEFT JOIN grid_areas）
 *   category     ← violation_type_result  三违类型.输出结果（文本类别）
 *   status       ← report_status          上报状态
 *   description  ← violation_behavior     三违行为描述
 *   type/project/metric：源表无对应业务字段 → 如实 null（不伪造，§十九：不能假定所有数据都有）
 */

const { pool } = require('../../../config/db');

const ADAPTER_ID = 'hse_grid';
const ADAPTER_NAME = 'HSE 网格检查记录（grid_inspection_records · 只读）';
const SOURCE_TABLE = 'grid_inspection_records';

/** 实际字段 → 通用语义映射（对 SK-003 核心暴露 mapping 元数据，供 Evidence/前端展示） */
const FIELD_MAPPING = {
  date: 'inspection_date',
  inspector: 'personnel_name',
  subject: 'violator_name',
  organization: 'area_team',
  location: 'grid_name',
  category: 'violation_type_result',
  status: 'report_status',
  description: 'violation_behavior',
  type: null,
  project: null,
  metric: null,
};

/** 行数上限（与 SK-003 INPUT_LIMITS.maxRows 对齐；超限由 SQL LIMIT 收敛并在 meta 登记） */
const MAX_ROWS = 5000;

/**
 * 拉取检查数据（只读）并映射为通用语义行
 * @param {Object} params
 * @param {{from:string,to:string}|null} [params.time_range] - YYYY-MM-DD ~ YYYY-MM-DD（检查日期）
 * @param {number} [params.limit] - 最大行数（≤MAX_ROWS）
 * @returns {Promise<{rows:Array<Object>, meta:Object}>}
 *   rows：通用语义行（键为 date/inspector/...，值保持源文本原样，不做业务清洗）；
 *   meta：来源与查询口径（供 Evidence 与前端「数据来源」展示）
 */
async function fetchRows({ time_range = null, limit = MAX_ROWS } = {}) {
  const cappedLimit = Math.max(1, Math.min(Number(limit) || MAX_ROWS, MAX_ROWS));

  const conds = [];
  const args = [];
  if (time_range && time_range.from) {
    args.push(String(time_range.from).slice(0, 10));
    conds.push(`g.inspection_date >= $${args.length}::date`);
  }
  if (time_range && time_range.to) {
    args.push(String(time_range.to).slice(0, 10));
    conds.push(`g.inspection_date <= $${args.length}::date`);
  }
  const whereClause = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
  args.push(cappedLimit);

  // 只读 SELECT：禁止任何写操作；LEFT JOIN 网格主数据取网格名称（未匹配留空）
  const sql = `
    SELECT
      g.id,
      to_char(g.inspection_date, 'YYYY-MM-DD') AS inspection_date,
      g.personnel_name,
      g.violator_name,
      g.area_team,
      ga.name AS grid_name,
      g.violation_type_result,
      g.report_status,
      g.violation_behavior,
      g.grid_level
    FROM grid_inspection_records g
    LEFT JOIN grid_areas ga ON ga.id = g.grid_id
    ${whereClause}
    ORDER BY g.inspection_date ASC NULLS LAST, g.id ASC
    LIMIT $${args.length}`;

  const result = await pool.query(sql, args);

  const rows = result.rows.map((r) => ({
    date: r.inspection_date || null,
    inspector: r.personnel_name || null,
    subject: r.violator_name || null,
    organization: r.area_team || null,
    location: r.grid_name || null,
    category: r.violation_type_result || null,
    status: r.report_status || null,
    description: r.violation_behavior || null,
    // type / project / metric：源表无对应语义字段 → null（不伪造）
    type: null,
    project: null,
    metric: null,
    _source_id: r.id,
  }));

  const meta = {
    adapter_id: ADAPTER_ID,
    adapter_name: ADAPTER_NAME,
    source_table: SOURCE_TABLE,
    joined_tables: ['grid_areas（仅取 name，网格名称）'],
    mapping: FIELD_MAPPING,
    filters: {
      time_range: time_range ? { from: time_range.from || null, to: time_range.to || null } : null,
    },
    row_count: rows.length,
    limit: cappedLimit,
    truncated: result.rows.length >= cappedLimit,
    access_mode: 'read_only_select',
  };
  return { rows, meta };
}

/** Adapter 元信息（Skill manifest 用） */
function adapterInfo() {
  return {
    type: ADAPTER_ID,
    name: ADAPTER_NAME,
    source_table: SOURCE_TABLE,
    mapping: FIELD_MAPPING,
    max_rows: MAX_ROWS,
    access_mode: 'read_only_select',
  };
}

module.exports = {
  ADAPTER_ID,
  ADAPTER_NAME,
  SOURCE_TABLE,
  FIELD_MAPPING,
  MAX_ROWS,
  fetchRows,
  adapterInfo,
};

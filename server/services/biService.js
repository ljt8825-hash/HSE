/**
 * BI 数据看板服务（/api/hse/bi）—— 公司级聚合层
 *
 * 口径对齐「领导视角统一看板」（services/leaderDashboardService.js）：
 *  - overview / trend / ranking 全部复用 leader 域同源同表聚合函数
 *    （loadAllDimensionRows / summarizeWithMatcher / collectMonthlyWithMatcher /
 *    monthlyRows / fillSummaries），保证 BI 看板与领导看板同一套统计口径，
 *    禁止在本文件另起 SQL 分叉。
 *  - overview 公司级 = 全量台账记录数（未归因乡镇的记录同样计入，为全公司真实总量）；
 *  - ranking 乡镇级 = 与领导看板乡镇汇总归因完全一致（fillSummaries）；
 *  - map（隐患类型 / 事故等级分布）与 realtime（今日动态）为 BI 特有轻量聚合，
 *    同源表 + is_deleted=false 过滤保持一致。
 */
const { pool } = require('../config/db');
const leader = require('./leaderDashboardService');

const {
  getYearRange,
  currentMonthKey,
  emptySummary,
  emptyMonthCell,
  loadOrg,
  loadEmployees,
  loadAllDimensionRows,
  summarizeWithMatcher,
  collectMonthlyWithMatcher,
  monthlyRows,
  fillSummaries,
} = leader;

/**
 * 查询范围：year 缺省/'all' → null（历年累计）；显式年份 → 年范围；
 * 显式年份 + month(1-12) → 单月范围（用户确认语义：单月快照）。
 * month 非法/缺省 → 全年范围。
 */
function biScope(rawReq) {
  const year = rawReq.query.year;
  if (year == null || year === '' || String(year).toLowerCase() === 'all') return null;
  const y = parseInt(year, 10);
  const validY = Number.isFinite(y) && y >= 2000 && y <= 2100 ? y : new Date().getFullYear();
  const m = parseInt(rawReq.query.month, 10);
  const validM = Number.isFinite(m) && m >= 1 && m <= 12 ? m : null;
  if (!validM) return getYearRange(validY);
  const mm = String(validM).padStart(2, '0');
  // end = 选中月实际最后一天；硬编码 31 号会让 9/4/6/11 等无 31 号月份报「日期/时间值超出范围」→ 500
  const lastDay = new Date(validY, validM, 0).getDate();
  return {
    year: validY,
    month: validM,
    start: `${validY}-${mm}-01`,
    end: `${validY}-${mm}-${lastDay}`,
  };
}

/** 全匹配 matcher：公司级聚合对每一行都计入（与领导看板逐行归因是同一套行数据） */
const MATCH_ALL = {
  accidents: () => true,
  violations: () => true,
  inspections: () => true,
  assessments: () => true,
  trainings: () => true,
  emergencies: () => true,
  demerits: () => true,
  vehicleChecks: () => true,
  driverChecks: () => true,
  driverViolations: () => true,
  driverThreeViolations: () => true,
  risks: () => true,
  hazards: () => true,
  transferChecks: () => true,
};

/** GET /bi/overview —— 公司级 10 维汇总（year 缺省=历年累计；year+month=单月快照） */
async function overview(rawReq) {
  const scope = biScope(rawReq);
  const all = await loadAllDimensionRows(scope);
  const employees = await loadEmployees();
  let driverPersonCount = 0;
  for (const e of employees.values()) {
    if (
      (e.orgType === 'town_center' || e.orgType === 'park') &&
      /驾驶|司机/.test(String(e.positionName || ''))
    ) {
      driverPersonCount += 1;
    }
  }
  const summary = summarizeWithMatcher(all, MATCH_ALL, driverPersonCount);
  return {
    __t: 'json',
    body: {
      code: 0,
      data: {
        year: scope ? scope.year : null,
        month: scope && scope.month ? scope.month : null,
        cumulative: !scope,
        timestamp: new Date().toISOString(),
        summary,
      },
    },
  };
}

/** GET /bi/trend —— 公司级逐月趋势（累计截断当前月；显式年份截断该年 12 月；单月模式仅保留选中月）
 * 注：loadAllDimensionRows 中 driver_violation / transfer_station_check / 考核表按年过滤（yearLike/tsLike/assessment_year），
 * 单月模式下会泄漏同年前序月份的行 → collectMonthlyWithMatcher 会产出选中月之前月份的伪 0 单元格。
 * 快照语义下必须剔除这些月份，只保留选中月。 */
async function trend(rawReq) {
  const scope = biScope(rawReq);
  const all = await loadAllDimensionRows(scope);
  const capMonth = !scope
    ? currentMonthKey()
    : scope.month
      ? `${scope.year}-${String(scope.month).padStart(2, '0')}`
      : `${scope.year}-12`;
  const { months: rawMonths, cells } = collectMonthlyWithMatcher(all, MATCH_ALL, capMonth);
  // 单月快照：无论选中月是否有数据记录，都固定返回 [capMonth]（空则各维 0）；
  // collectMonthly 的 months 只含实际有数据行的月份，选中无记录月（如未来月）会落空成 []。
  let months;
  if (scope && scope.month) {
    if (!cells.has(capMonth)) cells.set(capMonth, emptyMonthCell());
    months = [capMonth];
  } else {
    months = rawMonths;
  }
  const rows = monthlyRows(cells, months);
  return {
    __t: 'json',
    body: {
      code: 0,
      data: {
        year: scope ? scope.year : null,
        month: scope && scope.month ? scope.month : null,
        cumulative: !scope,
        months,
        rows,
      },
    },
  };
}

/** 排名取值映射（与 leader 域 10 维结构一一对应） */
const RANKING_VALUE = {
  accidents: s => s.accidents.count,
  violations: s => s.violations.count,
  inspections: s => s.inspections.count,
  hazards: s => s.hazards.count,
  trainings: s => s.trainings.recordCount,
  emergencies: s => s.emergencies.count,
};

/** 公司管理检查名单（总网格长+一级网格长，冻结口径，见项目记忆；台账岗位列有乡镇员工误标，故按名单判定） */
const COMPANY_MANAGERS = ['黄殿兴', '刘金涛', '张康', '刘菲', '韩晓亮', '黄元同'];

/** 单条公司管理检查记录 → 乡镇名（未归因入「未匹配」桶）：
 *  a) violator_dept 文本 → matchTownship（与 leader 域乡镇名匹配同口径）
 *  b) 被检查人姓名 → 花名册全局唯一姓名反推乡镇（重名不参与，避免错配）
 *  c) 均未命中 → 未匹配 */
function resolveCompanyCheckTown(row, townIndex, employees, uniqueByName, townById) {
  const dept = leader.cleanText(row.violator_dept);
  if (dept) {
    const m = leader.matchTownship(dept, townIndex);
    if (m) return townById.get(m.orgId) || '未匹配';
  }
  const vn = leader.cleanPersonName(row.violator_name);
  if (vn && uniqueByName.has(vn)) {
    const emp = employees.get(uniqueByName.get(vn));
    if (emp && emp.orgType === 'town_center') return townById.get(emp.orgId) || emp.orgName || '未匹配';
  }
  return '未匹配';
}

/** 公司管理检查按乡镇归因排行（检查人=公司管理名单；scope 为 null=历年累计） */
async function companyChecksByTownship(scope) {
  const dateClause = scope
    ? ` AND inspection_date >= '${scope.start}' AND inspection_date <= '${scope.end}'`
    : '';
  const r = await pool.query(
    `SELECT violator_dept, violator_name FROM grid_inspection_records
     WHERE btrim(regexp_replace(personnel_name, '[（(][^）)]*[）)]', '', 'g')) = ANY($1)${dateClause}`,
    [COMPANY_MANAGERS],
  );
  const { townIndex } = await loadOrg();
  const employees = await loadEmployees();
  const townById = new Map(townIndex.map(t => [t.id, t.short || t.orgName]));
  const nameCount = new Map();
  for (const e of employees.values()) nameCount.set(e.name, (nameCount.get(e.name) || 0) + 1);
  const uniqueByName = new Map();
  for (const e of employees.values()) {
    if (nameCount.get(e.name) === 1) uniqueByName.set(e.name, e.employeeId);
  }
  const counts = new Map();
  for (const row of r.rows) {
    const town = resolveCompanyCheckTown(row, townIndex, employees, uniqueByName, townById);
    counts.set(town, (counts.get(town) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((x, y) => y.value - x.value);
}

/** GET /bi/ranking —— 乡镇作业中心排行（归因口径=领导看板乡镇汇总）
 *  metricKey=companyChecks 时为公司管理检查次数排行（独立聚合，非 10 维 summary 维度） */
async function ranking(rawReq) {
  const metricKey = String(rawReq.query.metricKey || 'violations');
  const order = String(rawReq.query.order || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
  const top = Math.min(parseInt(rawReq.query.top, 10) || 10, 50);
  const scope = biScope(rawReq);
  const meta = {
    year: scope ? scope.year : null,
    month: scope && scope.month ? scope.month : null,
    cumulative: !scope,
  };

  if (metricKey === 'companyChecks') {
    const rows = await companyChecksByTownship(scope);
    const ordered = order === 'asc' ? [...rows].reverse() : rows;
    return {
      __t: 'json',
      body: {
        code: 0,
        data: {
          metricKey,
          order,
          top,
          ...meta,
          rows: ordered.slice(0, top),
        },
      },
    };
  }

  if (!RANKING_VALUE[metricKey]) {
    return { __t: 'json', body: { code: 1, message: `不支持的排名指标: ${metricKey}` } };
  }

  const { towns, townIndex } = await loadOrg();
  const employees = await loadEmployees();
  const unitMap = new Map(
    towns.map(t => [
      t.id,
      { id: t.id, orgName: t.orgName, shortName: t.short, orgType: t.orgType, summary: emptySummary() },
    ]),
  );
  await fillSummaries({ unitMap, employees, townIndex, scope });

  const rows = Array.from(unitMap.values())
    .map(u => ({
      id: u.id,
      orgName: u.orgName,
      shortName: u.shortName,
      orgType: u.orgType,
      value: RANKING_VALUE[metricKey](u.summary),
    }))
    .sort((a, b) => (order === 'asc' ? a.value - b.value : b.value - a.value))
    .slice(0, top);

  return {
    __t: 'json',
    body: {
      code: 0,
      data: {
        metricKey,
        order,
        top,
        ...meta,
        rows,
      },
    },
  };
}

/** 按 leader 域文本归因口径分组到乡镇（隐患描述 / 演练 township||name） */
async function groupedByTownship(selectSql, textOf) {
  const r = await pool.query(selectSql);
  const { townIndex } = await loadOrg();
  const employees = await loadEmployees();
  const townById = new Map(townIndex.map(t => [t.id, t.short || t.orgName]));
  const counts = new Map();
  for (const row of r.rows) {
    const a = leader.attributeRecord({ employeeId: null, text: textOf(row) }, townIndex, employees);
    const name = a && a.orgId ? townById.get(a.orgId) || '未匹配' : '未匹配';
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((x, y) => y.value - x.value);
}

/** GET /bi/map —— 隐患乡镇分布 / 事故等级分布 / 演练乡镇分布（year+month=单月快照） */
async function mapData(rawReq) {
  const type = String(rawReq.query.type || 'hazards');
  const scope = biScope(rawReq);
  const dateClause = col =>
    scope ? ` AND ${col} >= '${scope.start}' AND ${col} <= '${scope.end}'` : '';
  const meta = {
    year: scope ? scope.year : null,
    month: scope && scope.month ? scope.month : null,
    cumulative: !scope,
  };
  if (type === 'hazards') {
    // 隐患无独立分类维度（hazard_type 实测全空），按描述文本归因乡镇（与领导看板同口径）
    const rows = await groupedByTownship(
      `SELECT id, description FROM hazards WHERE is_deleted = false${dateClause('hazard_date')}`,
      r => r.description,
    );
    return {
      __t: 'json',
      body: {
        code: 0,
        data: {
          type,
          label: '隐患乡镇分布',
          total: rows.reduce((acc, x) => acc + x.value, 0),
          rows,
          ...meta,
        },
      },
    };
  }
  if (type === 'accidents') {
    const r = await pool.query(
      `SELECT COALESCE(NULLIF(level, ''), '未分级') AS name, COUNT(*)::int AS value
       FROM accidents WHERE is_deleted = false${dateClause('accident_date')}
       GROUP BY 1 ORDER BY value DESC`,
    );
    const total = r.rows.reduce((acc, x) => acc + x.value, 0);
    return {
      __t: 'json',
      body: {
        code: 0,
        data: { type, label: '事故等级分布', total, rows: r.rows, ...meta },
      },
    };
  }
  if (type === 'emergencies') {
    // 演练 result 实测全空 → 不用「通过率」，按 township||name 文本归因乡镇（与领导看板同口径）
    const rows = await groupedByTownship(
      `SELECT id, township, name FROM emergency_drills WHERE is_deleted = false${dateClause('drill_date')}`,
      r => r.township || r.name,
    );
    return {
      __t: 'json',
      body: {
        code: 0,
        data: {
          type,
          label: '演练乡镇分布',
          total: rows.reduce((acc, x) => acc + x.value, 0),
          rows,
          ...meta,
        },
      },
    };
  }
  return { __t: 'json', body: { code: 1, message: `不支持的数据类型: ${type}` } };
}

/** GET /bi/realtime —— 今日动态（短缓存 10s） */
async function realtime() {
  const [h, i, v, t, a] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS c FROM hazards WHERE is_deleted = false AND hazard_date >= CURRENT_DATE`),
    // grid_inspection_records 无 is_deleted 列（与 leader 域巡查查询一致）
    pool.query(`SELECT COUNT(*)::int AS c FROM grid_inspection_records WHERE inspection_date >= CURRENT_DATE`),
    pool.query(`SELECT COUNT(*)::int AS c FROM violation_records WHERE is_deleted = false AND violation_date >= CURRENT_DATE`),
    pool.query(`SELECT COUNT(*)::int AS c FROM training_records WHERE is_deleted = false AND training_date >= CURRENT_DATE`),
    pool.query(`SELECT COUNT(*)::int AS c FROM accidents WHERE is_deleted = false AND accident_date >= CURRENT_DATE`),
  ]);
  return {
    __t: 'json',
    body: {
      code: 0,
      data: {
        timestamp: new Date().toISOString(),
        todayHazards: h.rows[0].c,
        todayInspections: i.rows[0].c,
        todayViolations: v.rows[0].c,
        todayTrainings: t.rows[0].c,
        todayAccidents: a.rows[0].c,
      },
    },
  };
}

module.exports = { overview, trend, ranking, mapData, realtime };

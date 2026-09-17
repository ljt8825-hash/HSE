/**
 * AI-06 Analysis Statistics —— 确定性统计层（不经过 AI）
 *
 * 铁律（AI-06 任务书 §10）：AI 不能自己计算关键数字。
 * 本层所有数字来自数据库/注入记录，纯 JS 聚合，与 AI 完全解耦；
 * 即使 Ollama 不可用，统计结果依然完整可用。
 *
 * 字段不足时明确标记 NOT_AVAILABLE，绝不猜测。
 */

const TOP_N = 10;

/** AI-09：analysisTypes → 统计重点标记（确定性，不参与数字计算，仅标注重点方向供 Prompt/前端强调） */
function deriveFocus(analysisTypes = []) {
  const set = new Set(Array.isArray(analysisTypes) ? analysisTypes : []);
  const order = ['trend', 'frequency', 'rectification', 'clustering'];
  return {
    trend: set.has('trend'),
    frequency: set.has('frequency'),
    rectification: set.has('rectification'),
    clustering: set.has('clustering'),
    primary: order.find((t) => set.has(t)) || null,
    empty: set.size === 0,
  };
}

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

/** ISO 周键：所在周的周一日期 */
function weekKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = (d.getUTCDay() + 6) % 7; // 周一=0
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

function monthKey(dateStr) {
  return String(dateStr).slice(0, 7);
}

/** 计算整改时长（天） */
function rectifyDays(dateStr, rectifyDateStr) {
  if (!dateStr || !rectifyDateStr) return null;
  const a = new Date(dateStr + 'T00:00:00');
  const b = new Date(rectifyDateStr + 'T00:00:00');
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b - a) / 86400000);
}

/**
 * 确定性统计
 * @param {Array} records - 已归一化记录（normalizer 输出）
 * @param {Object} opts - { domain, timeRange, filters, sourceMode, limitations, analysisTypes }
 * @returns {Object} statistics JSON
 */
function computeStatistics(records = [], opts = {}) {
  const focus = deriveFocus(opts.analysisTypes);
  const total = records.length;
  const rectified = records.filter((r) => r.rectified === true);
  const unrectified = records.filter((r) => r.rectified === false);
  const unknownStatus = records.filter((r) => r.rectified == null);
  const rectificationRate = rectified.length > 0 ? Number((rectified.length / total * 100).toFixed(1)) : 0;

  // 逾期（未整改且 deadline < today）
  const today = new Date().toISOString().slice(0, 10);
  const overdue = unrectified.filter((r) => r.deadline && r.deadline < today);
  const overdueRate = unrectified.length > 0 ? Number((overdue.length / unrectified.length * 100).toFixed(1)) : 0;

  // 平均整改时长（仅对 date+rectifyDate 完整且 >= 的记录）
  const withDays = records
    .map((r) => ({ ...r, _days: rectifyDays(r.date, r.rectifyDate) }))
    .filter((r) => r._days != null && r._days >= 0);
  const avgRectifyDays = withDays.length > 0
    ? Number((withDays.reduce((s, r) => s + r._days, 0) / withDays.length).toFixed(1))
    : null;

  // 高频 TOP
  const countBy = (keyFn) => {
    const m = new Map();
    for (const r of records) {
      const k = keyFn(r);
      if (k == null) continue;
      const e = m.get(k) || { name: k, count: 0, rectifiedCount: 0 };
      e.count += 1;
      if (r.rectified === true) e.rectifiedCount += 1;
      m.set(k, e);
    }
    return [...m.values()].sort((a, b) => b.count - a.count).slice(0, TOP_N);
  };

  const topCategories = countBy((r) => r.category || null);
  const topSources = countBy((r) => r.source || null);
  const topOrgs = countBy((r) => r.org || null);
  const topAreas = countBy((r) => r.area || null);
  const topLevels = countBy((r) => r.level || null);

  // 时间趋势：日 / 周 / 月
  const trendDaily = new Map();
  const trendWeekly = new Map();
  const trendMonthly = new Map();
  for (const r of records) {
    if (!r.date) continue;
    for (const [map, keyFn] of [[trendDaily, (d) => d], [trendWeekly, weekKey], [trendMonthly, monthKey]]) {
      const k = keyFn(r.date);
      const e = map.get(k) || { period: k, total: 0, issueCount: 0, rectified: 0 };
      e.total += 1;
      e.issueCount += 1;
      if (r.rectified === true) e.rectified += 1;
      map.set(k, e);
    }
  }
  const sortByPeriod = (arr) => arr.sort((a, b) => (a.period < b.period ? -1 : 1));
  const trend = {
    daily: sortByPeriod([...trendDaily.values()]),
    weekly: sortByPeriod([...trendWeekly.values()]),
    monthly: sortByPeriod([...trendMonthly.values()]),
    granularity: total > 60 ? 'monthly' : (total > 20 ? 'weekly' : 'daily'),
  };

  // 重复问题：相同 分类+组织 的未整改记录 >= 2
  const dupMap = new Map();
  for (const r of unrectified) {
    const key = `${r.category || '未知分类'}@${r.org || '未知组织'}`;
    const e = dupMap.get(key) || { key, category: r.category || null, org: r.org || null, count: 0, ids: [] };
    e.count += 1;
    if (r.id != null) e.ids.push(r.id);
    dupMap.set(key, e);
  }
  const duplicates = [...dupMap.values()].filter((e) => e.count >= 2)
    .sort((a, b) => b.count - a.count).slice(0, TOP_N);

  // 未整改清单（脱敏：不含人员姓名，仅 id/日期/分类/组织/期限/逾期天数）
  const unrectifiedList = unrectified
    .map((r) => ({
      id: r.id,
      date: r.date,
      category: r.category || null,
      org: r.org || null,
      deadline: r.deadline,
      overdueDays: r.deadline && r.deadline < today ? Math.round((new Date(today) - new Date(r.deadline)) / 86400000) : null,
    }))
    .sort((a, b) => (b.overdueDays || 0) - (a.overdueDays || 0))
    .slice(0, TOP_N);

  // 聚集分析（仅为统计：时间段/类型/区域集中度，非风险判定）
  const periodCounts = trend.monthly.length > 0 ? trend.monthly : trend.weekly.length > 0 ? trend.weekly : trend.daily;
  const topTimePeriods = [...periodCounts].sort((a, b) => b.total - a.total).slice(0, 5);
  const clustering = {
    topTimePeriods: topTimePeriods.map((p) => ({ period: p.period, count: p.total })),
    topTypes: topCategories.slice(0, 5).map((c) => ({ type: c.name, count: c.count })),
    topAreas: topAreas.slice(0, 5).map((a) => ({ area: a.name, count: a.count })),
    note: '聚集分析仅为统计描述，不等同于 AI 自动判定高风险',
  };

  const limitations = opts.limitations || [];
  if (topCategories.length === 0) limitations.push('分类维度 NOT_AVAILABLE：无分类字段数据');
  if (topOrgs.length === 0) limitations.push('组织维度 NOT_AVAILABLE：无组织字段数据');
  if (records.some((r) => r.level == null)) limitations.push('风险等级维度 NOT_AVAILABLE：无等级字段数据');
  if (trend.daily.length === 0) limitations.push('时间维度 NOT_AVAILABLE：无日期字段数据');
  if (unknownStatus.length > 0) limitations.push(`状态字段部分缺失：${unknownStatus.length} 条记录状态未知，整改率按已整改/总数计算`);

  return {
    domain: opts.domain,
    timeRange: opts.timeRange || null,
    filters: opts.filters || {},
    sourceMode: opts.sourceMode || null,
    analysisTypes: (opts.analysisTypes || []).slice(),
    focus,
    totalRecords: total,
    summary: {
      total,
      issueCount: total,
      rectifiedCount: rectified.length,
      unrectifiedCount: unrectified.length,
      rectificationRate,
      duplicateCount: duplicates.reduce((s, d) => s + d.count, 0),
      overdueCount: overdue.length,
      overdueRate,
      avgRectifyDays,
    },
    trend,
    topCategories,
    topSources,
    topOrgs,
    topAreas,
    topLevels,
    duplicates,
    unrectifiedList,
    clustering,
    limitations: [...new Set(limitations)],
  };
}

module.exports = {
  TOP_N,
  computeStatistics,
  deriveFocus,
  rectifyDays,
  weekKey,
  monthKey,
};

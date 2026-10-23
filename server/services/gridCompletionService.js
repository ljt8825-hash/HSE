/**
 * 网格完成率计算服务（任务四核心业务逻辑）
 *
 * 完成率 = (指定年/月范围内该网格的实际检查记录条数 / 该时间段应检查次数) × 100%，上限 100%
 *
 * 业务规则（来自网格表 patrol_frequency 字段）：
 *   每日一次 → 约30次/月（按当月实际天数）
 *   每日两次 → 约60次/月（按当月实际天数×2）
 *   每周一次 → 约4次/月
 *   每周两次 → 约8次/月
 *   每月一次 → 1次/月
 *
 * 说明：
 *   - 实际检查次数按 grid_id 关联统计（由导入时 片区/班组+网格等级 模糊匹配得到）
 *   - 时间范围：年仅选→全年；年仅选+月选→当月；均未选→当前系统月
 *   - 巡查频率无法识别时返回 expected=null（无法计算，完成率记 0）
 */

const { pool, isConnected } = require('../config/db');

// 每月应检查次数映射（非按天的频率取此值；按天的频率另乘当月天数）
const FREQ_MONTHLY = {
  '每日一次': 30,
  '每日两次': 60,
  '每周一次': 4,
  '每周两次': 8,
  '每月一次': 1,
};

// 判断是否为按天计频的频率
function isDailyFreq(freq) {
  return freq === '每日一次' || freq === '每日两次';
}

/**
 * 解析巡查频率 → 每天应巡查次数 patrolsPerDay。
 * 优先识别「N天N次」格式（如 1天1次=1、2天1次=0.5、3天1次≈0.333）；
 * 兼容旧词表（每日一次=1、每周一次=1/7、每月一次=1/30 …）。
 * 无法识别返回 null。
 */
function patrolsPerDayOfFreq(freq) {
  if (!freq) return null;
  const s = String(freq).trim();
  const m = s.match(/^(\d+)\s*天\s*(\d+)\s*次$/);
  if (m) {
    const days = parseInt(m[1], 10);
    const times = parseInt(m[2], 10);
    if (days > 0 && times > 0) return times / days;
    return null;
  }
  const LEGACY = {
    '每日一次': 1, '每日两次': 2, '每日三次': 3,
    '每周一次': 1 / 7, '每周两次': 2 / 7,
    '每月一次': 1 / 30, '每季度一次': 1 / 90,
  };
  return Object.prototype.hasOwnProperty.call(LEGACY, s) ? LEGACY[s] : null;
}

// 某频率每月应检查次数；无法识别返回 null
function getMonthlyExpected(freq) {
  if (!freq) return null;
  return Object.prototype.hasOwnProperty.call(FREQ_MONTHLY, freq) ? FREQ_MONTHLY[freq] : null;
}

// 当月天数
function daysInMonth(year, month) {
  // month: 1-12
  return new Date(year, month, 0).getDate();
}

// 解析 year/month 参数，缺失时回落到当前系统年月
function normalizeRange(year, month) {
  const now = new Date();
  const y = year ? parseInt(year, 10) : now.getFullYear();
  const hasMonth = !!(month && parseInt(month, 10) >= 1 && parseInt(month, 10) <= 12);
  const m = hasMonth ? parseInt(month, 10) : now.getMonth() + 1;
  return { y, m, hasMonth };
}

// 计算时间范围边界 [start, end)（含当年/当月第一天，不含下一段第一天）
function rangeBounds(year, month) {
  const { y, m, hasMonth } = normalizeRange(year, month);
  if (hasMonth) {
    const start = `${y}-${String(m).padStart(2, '0')}-01`;
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    return { start, end: next, isYearOnly: false };
  }
  return { start: `${y}-01-01`, end: `${y + 1}-01-01`, isYearOnly: true };
}

// 指定年/月下，某巡查频率的应检查次数；无法识别返回 null
function expectedForFreq(freq, year, month) {
  const monthly = getMonthlyExpected(freq);
  if (monthly == null) return null;
  const { y, m, hasMonth } = normalizeRange(year, month);
  if (!hasMonth) {
    // 年仅选 → 全年 = 月基准 × 12
    return monthly * 12;
  }
  if (isDailyFreq(freq)) {
    const perDay = freq === '每日两次' ? 2 : 1;
    return perDay * daysInMonth(y, m);
  }
  return monthly;
}

/**
 * 单次聚合：统计指定时间范围内、每个 grid_id 的实际检查记录数
 * 返回 { [gridId]: { actual } }；内存模式下返回空对象
 */
async function getCompletionRateMap(year, month) {
  const map = {};
  if (!isConnected()) return map;
  const { start, end } = rangeBounds(year, month);
  try {
    const r = await pool.query(
      `SELECT grid_id, COUNT(*)::int AS c
       FROM grid_inspection_records
       WHERE grid_id IS NOT NULL AND inspection_date >= $1 AND inspection_date < $2
       GROUP BY grid_id`,
      [start, end]
    );
    r.rows.forEach((row) => { map[row.grid_id] = { actual: row.c }; });
  } catch (e) {
    // 表尚未创建等情况：安全降级为空（完成率按 0 处理）
    console.warn('[gridCompletion] getCompletionRateMap 失败，降级为空:', e.message);
  }
  return map;
}

/**
 * 计算单个网格在指定年/月的完成率
 * 返回 { rate, actual, expected, reason? }
 */
async function calculateCompletionRate(gridId, year, month) {
  if (!isConnected()) {
    return { rate: 0, actual: 0, expected: null, reason: 'memory-mode' };
  }
  const gridR = await pool.query(
    'SELECT patrol_frequency FROM grid_areas WHERE id = $1 AND is_deleted = false',
    [gridId]
  );
  if (!gridR.rows.length) {
    return { rate: 0, actual: 0, expected: 0 };
  }
  const expected = expectedForFreq(gridR.rows[0].patrol_frequency, year, month);
  if (expected == null) {
    return { rate: 0, actual: 0, expected: null, reason: 'unknown-frequency' };
  }
  const { start, end } = rangeBounds(year, month);
  const cntR = await pool.query(
    `SELECT COUNT(*)::int AS c FROM grid_inspection_records
     WHERE grid_id = $1 AND inspection_date >= $2 AND inspection_date < $3`,
    [gridId, start, end]
  );
  const actual = cntR.rows[0].c;
  const rate = Math.min(100, Math.round((actual / expected) * 100));
  return { rate, actual, expected };
}

/**
 * 获取网格入职日期映射：grid_id → hire_date（取当前任职 assignment.start_date，无则回退 employee.created_at）
 * 一条 SQL 批量返回所有请求的网格，避免逐行查库。
 */
async function getHireDateMap(gridIds) {
  const map = new Map();
  if (!isConnected() || !gridIds || !gridIds.length) return map;
  try {
    const r = await pool.query(
      `SELECT ga.id AS grid_id,
              COALESCE(
                to_char((ea.start_date AT TIME ZONE 'Asia/Shanghai'), 'YYYY-MM-DD'),
                to_char((e.created_at AT TIME ZONE 'Asia/Shanghai'), 'YYYY-MM-DD')
              ) AS hire_date
       FROM grid_areas ga
       LEFT JOIN employee_assignment ea
              ON ea.employee_id = ga.personnel_id
             AND ea.is_current = true
             AND COALESCE(ea.is_deleted, false) = false
       LEFT JOIN employee e ON e.id = ga.personnel_id
       WHERE ga.id = ANY($1)`,
      [gridIds]
    );
    for (const row of r.rows) map.set(Number(row.grid_id), row.hire_date);
  } catch (e) {
    console.warn('[gridCompletion] getHireDateMap 失败:', e.message);
  }
  return map;
}

/**
 * 按网格计算「月度完成率 + 月/年巡查次数」（网格长巡查管理主口径）
 *
 * 口径（2026-08-29 约定）：
 *   1. 周期为每月：默认当前月，可被 year/month 覆盖；
 *   2. 新入职以入职首日为窗口起点（本月入职 → 从入职日起算应巡次数）；
 *   3. 计数以「网格长巡查台账」personnel_name（与网格 name 匹配）为准；
 *   4. 应巡次数 = 窗口天数 × 每天应巡次数（由巡查频率 patrols_per_day 折算）。
 *
 * 返回 Map<gridId, { completionRate, monthCount, yearCount, expected, actual }>
 */
async function getGridPatrolStats(grids, options = {}) {
  const result = new Map();
  const fallback = () => {
    for (const g of grids) result.set(g.id, { completionRate: 0, monthCount: 0, yearCount: 0, expected: 0, actual: 0 });
    return result;
  };
  if (!isConnected() || !grids || !grids.length) return fallback();

  const now = new Date();
  const y = options.year ? parseInt(options.year, 10) : now.getFullYear();
  const hasMonth = !!(options.month && parseInt(options.month, 10) >= 1 && parseInt(options.month, 10) <= 12);
  const m = hasMonth ? parseInt(options.month, 10) : now.getMonth() + 1;
  const pad = (n) => String(n).padStart(2, '0');
  const yStart = `${y}-01-01`;
  const yEnd = `${y + 1}-01-01`;
  const mStart = `${y}-${pad(m)}-01`;
  const mEnd = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;

  const names = Array.from(new Set(
    grids.map((g) => (g.name ? String(g.name).trim() : '')).filter(Boolean)
  ));
  if (!names.length) return fallback();

  // 台账按姓名聚合全年/当月检查条数（一次扫描）
  const yearCnt = {};
  const monthCnt = {};
  try {
    const r = await pool.query(
      `SELECT personnel_name,
              COUNT(*) FILTER (WHERE inspection_date >= $1 AND inspection_date < $2)::int AS yc,
              COUNT(*) FILTER (WHERE inspection_date >= $3 AND inspection_date < $4)::int AS mc
       FROM grid_inspection_records
       WHERE personnel_name = ANY($5)
         AND inspection_date >= $1 AND inspection_date < $2
       GROUP BY personnel_name`,
      [yStart, yEnd, mStart, mEnd, names]
    );
    for (const row of r.rows) {
      yearCnt[row.personnel_name] = row.yc;
      monthCnt[row.personnel_name] = row.mc;
    }
  } catch (e) {
    console.warn('[gridCompletion] getGridPatrolStats 聚合失败，降级为 0:', e.message);
  }

  const mStartDate = new Date(y, m - 1, 1);
  const lastDayOfMonth = new Date(y, m, 0);
  const isTodayInTargetMonth = y === now.getFullYear() && m === now.getMonth() + 1;
  // 当前月按「今天」截止（应巡次数随天数演进）；过去月按整月截止
  const endDate = isTodayInTargetMonth ? now : lastDayOfMonth;

  for (const g of grids) {
    const name = g.name ? String(g.name).trim() : '';
    const yearCount = name ? yearCnt[name] || 0 : 0;
    const monthCount = name ? monthCnt[name] || 0 : 0;
    let completionRate = 0;
    let expected = 0;
    let actual = monthCount;
    const ppd = patrolsPerDayOfFreq(g.patrol_frequency);
    if (ppd != null) {
      let startDate = mStartDate;
      let hireD = null;
      const hire = options.hireDateByGrid && options.hireDateByGrid.get(g.id);
      if (hire) {
        hireD = new Date(`${String(hire).slice(0, 10)}T00:00:00`);
        if (!isNaN(hireD.getTime()) && hireD.getTime() > mStartDate.getTime()) {
          startDate = hireD;
        }
      }
      if (hireD && hireD.getTime() > endDate.getTime()) {
        // 尚未到入职首日（含未来入职）→ 本月无应巡要求
        completionRate = 100;
        expected = 0;
        actual = 0;
      } else {
        const periodDays = Math.max(0, Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1);
        expected = periodDays > 0 ? Math.max(1, Math.ceil(periodDays * ppd)) : 0;
        completionRate = expected > 0 ? Math.min(100, Math.round((actual / expected) * 100)) : 100;
      }
    }
    result.set(g.id, { completionRate, monthCount, yearCount, expected, actual });
  }
  return result;
}

/**
 * 批量重算并回写 grid_areas.completion_rate（导入完成后触发；静态字段，仅作兜底）
 */
async function recalculateAllCompletionRates(year, month) {
  if (!isConnected()) return { updated: 0, reason: 'memory-mode' };
  const grids = await pool.query('SELECT id, name, patrol_frequency FROM grid_areas WHERE is_deleted = false');
  const hireDateByGrid = await getHireDateMap(grids.rows.map((g) => g.id));
  const statMap = await getGridPatrolStats(grids.rows, { year, month, hireDateByGrid });
  let updated = 0;
  for (const g of grids.rows) {
    const s = statMap.get(g.id);
    if (!s) continue;
    await pool.query(
      'UPDATE grid_areas SET completion_rate = $1, updated_at = NOW() WHERE id = $2',
      [s.completionRate, g.id]
    );
    updated++;
  }
  return { updated };
}

/**
 * 按「网格长（人）」粒度把逐日缺巡日期算出来，供网格缺巡引擎逐日落库/前端展示"哪一天没巡查"。
 *
 * 定义（2026-09-26 收口）：
 *   - 只有巡查频率可按天定位（patrolsPerDayOfFreq 非空，即"每日N次/N天N次"等）的网格，
 *     才能把应巡精确定位到具体某天；周/月/季等非按天频率无法定位具体日，不参与逐日标记。
 *   - 某日"应巡次数" = 该网格长名下、当天已任职（hire_date ≤ 当日）的所有可定位网格
 *     每天应巡次数之和；"实巡次数" = 当天该网格长台账（personnel_name 命中其网格名）
 *     记录条数。当 应巡>实巡 时该日判定为缺巡。
 *   - 返回 Map<personnel_id, string[] missingDates>（YYYY-MM-DD，升序）。
 *
 * @param {Array<{id,name,personnel_id,patrol_frequency}>} grids
 * @param {object} [options] { year, month, hireDateByGrid }
 * @returns {Promise<Map<number,string[]>>}
 */
async function getMissedDatesMap(grids, options = {}) {
  const result = new Map();
  if (!isConnected() || !grids || !grids.length) return result;

  const now = new Date();
  const y = options.year ? parseInt(options.year, 10) : now.getFullYear();
  const hasMonth = !!(options.month && parseInt(options.month, 10) >= 1 && parseInt(options.month, 10) <= 12);
  const m = hasMonth ? parseInt(options.month, 10) : now.getMonth() + 1;
  const pad = (n) => String(n).padStart(2, '0');
  const mStartStr = `${y}-${pad(m)}-01`;
  const mEndBefore = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
  const isTargetMonth = y === now.getFullYear() && m === now.getMonth() + 1;
  // 当前月按「今天」截止，与 getGridPatrolStats 口径一致；过去月按整月
  const endDate = isTargetMonth ? now : new Date(y, m, 0);

  // 按人收集"可按天定位"的网格（含其任职起始日 start 与每天应巡次数）
  const perPerson = new Map(); // personnel_id -> { groups:[{start,ppd}], names:Set }
  const nameToPersonnel = new Map(); // 网格名 -> Set<personnel_id>，把台账记名归并到其名下网格长
  for (const g of grids) {
    if (!g || g.personnel_id == null) continue;
    const ppd = patrolsPerDayOfFreq(g.patrol_frequency);
    if (ppd == null) continue; // 非按天频率，无法逐日标记
    let start = new Date(y, m - 1, 1);
    const hire = options.hireDateByGrid && options.hireDateByGrid.get(g.id);
    if (hire) {
      const hireD = new Date(`${String(hire).slice(0, 10)}T00:00:00`);
      if (!isNaN(hireD.getTime()) && hireD.getTime() > start.getTime()) start = hireD;
    }
    let pp = perPerson.get(g.personnel_id);
    if (!pp) {
      pp = { groups: [], names: new Set() };
      perPerson.set(g.personnel_id, pp);
    }
    pp.groups.push({ start, ppd });
    const nm = String(g.name || '').trim();
    if (nm) {
      pp.names.add(nm);
      if (!nameToPersonnel.has(nm)) nameToPersonnel.set(nm, new Set());
      nameToPersonnel.get(nm).add(g.personnel_id);
    }
  }
  if (!perPerson.size) return result;

  // 台账按"网格长名字 + 天"聚合实巡次数，再归并到各网格长（personnel）名下逐日累计
  // （按人逐日比对；若仅按天聚合，会把全体网格长当天记录合计当某单人实巡，掩盖个别缺巡日）
  const dayCountByPerson = new Map(); // personnel_id -> Map<date, 实巡次数>
  const allNames = Array.from(new Set([...perPerson.values()].flatMap((pp) => [...pp.names]))).filter(Boolean);
  if (allNames.length) {
    try {
      const r = await pool.query(
        `SELECT personnel_name, to_char(inspection_date, 'YYYY-MM-DD') AS d, COUNT(*)::int AS c
           FROM grid_inspection_records
          WHERE personnel_name = ANY($1)
            AND inspection_date >= $2 AND inspection_date < $3
          GROUP BY personnel_name, d`,
        [allNames, mStartStr, mEndBefore],
      );
      for (const row of r.rows) {
        const owners = nameToPersonnel.get(row.personnel_name);
        if (!owners) continue;
        for (const pid of owners) {
          let mm = dayCountByPerson.get(pid);
          if (!mm) {
            mm = new Map();
            dayCountByPerson.set(pid, mm);
          }
          mm.set(row.d, (mm.get(row.d) || 0) + row.c);
        }
      }
    } catch (e) {
      console.warn('[gridCompletion] getMissedDatesMap 台账聚合失败:', e.message);
    }
  }

  const walk = new Date(`${mStartStr}T00:00:00`);
  while (walk.getTime() <= endDate.getTime()) {
    const ds = `${walk.getFullYear()}-${pad(walk.getMonth() + 1)}-${pad(walk.getDate())}`;
    const walkMs = walk.getTime();
    for (const [personnelId, pp] of perPerson) {
      let expect = 0;
      for (const gr of pp.groups) {
        if (gr.start.getTime() <= walkMs) expect += gr.ppd;
      }
      if (expect <= 0) continue; // 当日无人任职应巡
      const mm = dayCountByPerson.get(personnelId);
      const actual = mm ? mm.get(ds) || 0 : 0;
      if (actual >= expect) continue;
      const arr = result.get(personnelId) || [];
      arr.push(ds);
      result.set(personnelId, arr);
    }
    walk.setDate(walk.getDate() + 1);
  }

  // 升序排序
  for (const [k, v] of result) v.sort();

  return result;
}

module.exports = {
  FREQ_MONTHLY,
  getMonthlyExpected,
  expectedForFreq,
  rangeBounds,
  normalizeRange,
  patrolsPerDayOfFreq,
  getCompletionRateMap,
  calculateCompletionRate,
  getGridPatrolStats,
  getHireDateMap,
  getMissedDatesMap,
  recalculateAllCompletionRates,
};

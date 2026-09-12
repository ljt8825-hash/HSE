/**
 * 规则引擎 · 适配器：现场管理-转运站管理「月度」「台账/标识牌/用电/消防/物品」扣分
 *
 * 数据源：transfer_station_check（转运站月度检查台账）
 * 口径（2026-09-04 拍板；2026-09-06 修订）：
 *   - 五列即为「考核分数」贡献（台账管理/标识牌管理/用电安全/消防管理/物品摆放），
 *     rawScore = 五列之和（与转运站管理页面「考核分数」列一致），直接作为扣分额；
 *     不再按整数项次 × 规则上限值（否则无法表达 0.5 等分数，如『制度牌损坏 0.5分/个』）。
 *   - 扣分对象 = 所属乡镇作业中心经理；站点→经理经 area_team(片区) 在 v_employee_org_full
 *     里按 org_name 匹配「乡镇作业中心经理」；匹配不到 → 跳过（reason=no-manager）
 *   - 计入「现场管理-转运站管理」类别，受类别上限钳制（引擎统一处理）
 * 前置：需先执行补列迁移（加 ledger_management/sign_management/electricity_safety/fire_management/item_placement）。
 * 幂等：月度模式，按经理 + 周期每人一条。
 */

const { pool } = require('../../../config/db');
const engine = require('../../assessmentScoringEngine');

const KEY = 'transfer_check';
const RULE_CODE = 'TRANSFER001';
const SOURCE_TABLE = 'transfer_station_check';
const KIND = 'transfer_check';
const EVENT_TYPE = 'TRANSFER_MONTHLY';
const METRIC_CODE = 'HSE-KPI-TRF-003';
const METRIC_NAME = '转运站月度问题（台账/标识/用电/消防/物品）';

// 子项 → 「考核分数」贡献列（五列之和即页面「考核分数」=应扣分额）
const SUBITEMS = [
  { key: 'ledger', label: '台账管理', col: 'ledger_management' },
  { key: 'sign', label: '标识牌管理', col: 'sign_management' },
  { key: 'electric', label: '用电安全', col: 'electricity_safety' },
  { key: 'fire', label: '消防管理', col: 'fire_management' },
  { key: 'place', label: '物品摆放', col: 'item_placement' },
];

function buildDeductKey({ cycleId, employeeId }) {
  return `transfer-check:${cycleId}:${employeeId}`;
}

async function ensureMetric(metricCode) {
  let code = metricCode;
  if (code) {
    const existing = await engine.findMetricByCode(code);
    if (existing) return { code, id: existing.id };
    code = METRIC_CODE;
  }
  const metric = await engine.findMetricByCode(METRIC_CODE);
  if (metric) return { code: METRIC_CODE, id: metric.id };
  const r = await pool.query(
    `INSERT INTO hse_assessment_metric
       (metric_code, metric_name, category, target_post, base_score, metric_type,
        data_source, calc_formula, sort_order, status, remark)
     VALUES ($1,$2,'SAFETY','all',0,'auto','transfer_station_check',
             '转运站本月各问题项次×单次分值，传导到所属乡镇作业中心经理',7,'active',
             '自动考核：现场管理-转运站管理月度扣分，传导到经理')
     ON CONFLICT (metric_code) DO UPDATE SET is_deleted=FALSE
     RETURNING id`,
    [METRIC_CODE, METRIC_NAME]
  );
  return { code: METRIC_CODE, id: r.rows[0].id };
}

// 按月区间换算 month 参数为 check_date 的起止（check_date 为 varchar 'YYYY-MM'/'YYYY-MM-DD'，
// 用纯字符串比较，避免 varchar 与 date 比较报「操作符不存在」）。
// 注意：边界用 'YYYY-MM'（不带 -01）。若用 'YYYY-MM-01'，字符串比较会把当月 check_date
// （如 '2025-10'）判定为落在上一个月区间内（'2025-10' >= '2025-09-01' 且 < '2025-10-01'），
// 导致全表记录错位到上一周期。
function monthRange(year, month) {
  const pad = (n) => String(n).padStart(2, '0');
  const start = `${year}-${pad(month)}`;
  const next = new Date(year, month, 1); // 下月第一日（JS 月份 0 基，month 为 1-12）
  const end = `${next.getFullYear()}-${pad(next.getMonth() + 1)}`;
  return { start, end };
}

// 站点(片区) → 乡镇作业中心经理。匹配不到返回 null。
// area_team 在台账里可能存裸地名（如「保店」「张大庄」「刘营伍」），而经理 org_name 为
// 全称（如「保店镇作业中心」「张大庄镇作业中心」「刘营伍乡作业中心」），因此除精确匹配外，
// 需再拼各行政区后缀变体（镇/乡/街道作业中心）尝试匹配。
async function findTownOperatorManager(areaTeam) {
  if (!areaTeam) return null;
  const norm = String(areaTeam).trim();
  if (!norm) return null;

  const queryByOrg = async (orgName) => {
    const r = await pool.query(
      `SELECT v.employee_id, v.name
         FROM v_employee_org_full v
        WHERE v.relation_status = 'active'
          AND v.position_name = '乡镇作业中心经理'
          AND v.org_name = $1
        LIMIT 1`,
      [orgName]
    );
    return r.rows.length ? r.rows[0] : null;
  };

  // 1) 精确匹配
  const exact = await queryByOrg(norm);
  if (exact) return exact;

  // 2) 已是全称（末段含「作业中心」）则不再拼接
  if (norm.endsWith('作业中心')) return null;

  // 3) 拼行政区后缀变体匹配（镇/乡/街道作业中心）
  for (const suffix of ['镇作业中心', '乡作业中心', '街道作业中心']) {
    const found = await queryByOrg(norm + suffix);
    if (found) return found;
  }
  return null;
}

async function scan({ cycle, year, month, rule, dryRun }) {
  const cycleId = cycle.id;
  const { start, end } = monthRange(year, month);

  const cover = await pool.query(
    `SELECT COUNT(*)::int AS c FROM transfer_station_check
      WHERE check_date >= $1 AND check_date < $2 AND is_deleted = FALSE`,
    [start, end]
  );
  if (!cover.rows.length || cover.rows[0].c <= 0) {
    return { scanned: 0, assessed: 0, intents: [], revocations: [], skipped: [], noLedger: true, metric: null };
  }

  const metric = await ensureMetric(rule.metricCode);

  const records = (
    await pool.query(
      `SELECT id, station_code, station_name, area_team, check_date,
              COALESCE(ledger_management,0)    AS ledger_management,
              COALESCE(sign_management,0)      AS sign_management,
              COALESCE(electricity_safety,0)   AS electricity_safety,
              COALESCE(fire_management,0)      AS fire_management,
              COALESCE(item_placement,0)       AS item_placement
         FROM transfer_station_check
        WHERE check_date >= $1 AND check_date < $2 AND is_deleted = FALSE`,
      [start, end]
    )
  ).rows;

  const byManager = new Map();
  const skipped = [];
  const managerCache = new Map();
  let scanned = 0;

  for (const rec of records) {
    scanned++;
    const counts = {};
    let any = false;
    for (const si of SUBITEMS) {
      const v = Number(rec[si.col]) || 0;
      counts[si.key] = v;
      if (v !== 0) any = true;
    }
    if (!any) continue;

    const cacheKey = rec.area_team || '__none__';
    let mgr = managerCache.get(cacheKey);
    if (mgr === undefined) {
      if (!rec.area_team) {
        mgr = null;
        skipped.push({ employeeId: null, name: rec.station_name, reason: 'no-area-team' });
      } else {
        const found = await findTownOperatorManager(rec.area_team);
        if (!found) {
          skipped.push({ employeeId: null, name: rec.station_name, reason: 'no-manager', areaTeam: rec.area_team });
        } else {
          const tgt = await engine.findAssessmentTarget(cycleId, found.employee_id);
          if (!tgt) {
            skipped.push({ employeeId: found.employee_id, name: found.name, reason: 'manager-not-assessment-target' });
          } else {
            mgr = { employeeId: found.employee_id, name: found.name };
          }
        }
      }
      managerCache.set(cacheKey, mgr);
    }
    if (!mgr) continue;

    const acc = byManager.get(mgr.employeeId) || { name: mgr.name, counts: {}, stations: [] };
    acc.stations.push(rec.station_name || rec.station_code);
    for (const k of Object.keys(counts)) acc.counts[k] = (acc.counts[k] || 0) + counts[k];
    acc.name = mgr.name;
    byManager.set(mgr.employeeId, acc);
  }

  const intents = [];
  const revocations = [];
  let seq = 0;
  for (const [mgrId, acc] of byManager) {
    const target = await engine.findAssessmentTarget(cycleId, mgrId);
    if (!target) {
      skipped.push({ employeeId: mgrId, name: acc.name, reason: 'manager-not-assessment-target' });
      continue;
    }
    let total = 0;
    for (const si of SUBITEMS) {
      const v = acc.counts[si.key] || 0;
      if (v !== 0) total += v;
    }
    // 「考核分数」五列之和即应扣额（含 0.5 等分数），不做单位相乘
    const rawScore = Math.round(total * 100) / 100;
    const base = {
      _seq: seq++, cycleId, targetId: target.id, employeeId: mgrId, employeeName: acc.name,
      ruleName: rule.ruleName, category: rule.category, counts: acc.counts, stations: acc.stations,
      unit: 1, rawScore, year, month,
    };
    if (rawScore <= 0) revocations.push(base);
    else intents.push(base);
  }

  return { scanned, assessed: intents.length + revocations.length, intents, revocations, skipped, noLedger: false, metric };
}

function buildItem(intent, rule) {
  return rule.ruleName;
}

function buildDetail(intent, capRes) {
  const names = { ledger: '台账管理', sign: '标识牌', electric: '用电安全', fire: '消防', place: '物品摆放' };
  const lines = Object.keys(intent.counts)
    .filter((k) => (intent.counts[k] || 0) > 0)
    .map((k) => `${names[k] || k}${intent.counts[k]}次`);
  return {
    kind: KIND,
    deductKey: buildDeductKey({ cycleId: intent.cycleId, employeeId: intent.employeeId }),
    ruleName: intent.ruleName,
    category: intent.category,
    eventType: EVENT_TYPE,
    counts: intent.counts,
    stations: intent.stations,
    unit: intent.unit,
    rawScore: intent.rawScore,
    cap: capRes.cap,
    cappedScore: capRes.cappedScore,
    otherCatScore: capRes.otherCatScore,
    year: intent.year,
    month: intent.month,
    summary: `转运站问题（${lines.join('、')}，传导）`,
  };
}

function buildReportDetail(intent, outcome) {
  const base = {
    employeeId: intent.employeeId,
    employeeName: intent.employeeName,
    counts: intent.counts,
    stations: intent.stations,
    rawScore: intent.rawScore,
  };
  if (outcome.type === 'revoke') return { ...base, cappedScore: 0, action: outcome.action };
  if (outcome.type === 'capped-out') return { ...base, cappedScore: 0, cappedOut: true, action: outcome.action };
  return { ...base, cappedScore: outcome.cappedScore, action: outcome.action };
}

module.exports = {
  key: KEY,
  ruleCode: RULE_CODE,
  sourceTable: SOURCE_TABLE,
  kind: KIND,
  metricCode: METRIC_CODE,
  ensureMetric,
  buildDeductKey,
  scan,
  buildItem,
  buildDetail,
  buildReportDetail,
};
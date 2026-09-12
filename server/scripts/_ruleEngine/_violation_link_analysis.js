/**
 * 三违数据治理 · 人员关联可行性分析（只读，不写任何业务表）
 *
 * 用途：评估「违规人 → 员工」关联的可行性，为阶段3 三违适配器是否可开工提供数据依据。
 * 依据：提示词-02 第 4 节 B2。
 *
 * 用法：node server/scripts/_ruleEngine/_violation_link_analysis.js [outJsonFile]
 *      outJsonFile 缺省时只打印到 stdout。
 *
 * 严格只读：全流程仅执行 SELECT。
 */

const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { pool, testConnection } = require('../../config/db');

// 中文姓名：2~15 个汉字
const RE_CN_NAME = /^[一-龥]{2,15}$/;

// 占位符/非姓名值：录入页把「--」或性别填进了违规人姓名列
const PLACEHOLDER_NAMES = new Set(['--', '-', '—', '无', '/', '男', '女']);

/** 姓名归一化：去空白与全角空格 */
function normName(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[\s　]/g, '').trim();
}

/**
 * 判定是否为占位符/非姓名值
 * 先精确匹配已知占位符；再剥离「男/女」等性别残留后判断是否为空
 */
function isPlaceholder(name) {
  if (!name) return true;
  if (PLACEHOLDER_NAMES.has(name)) return true;
  // 形如「男。」「女6」：剥离非汉字后只剩性别字或为空
  const cn = name.replace(/[^一-龥]/g, '');
  if (!cn) return true;
  if (cn === '男' || cn === '女') return true;
  return false;
}

/**
 * 姓名清洗：剔除所有非汉字字符（标点、数字、反斜杠、英文等）
 * 例：「.张书芹」→「张书芹」、「刘1连强」→「刘连强」
 */
function cleanName(name) {
  return String(name || '').replace(/[^一-龥]/g, '');
}

/** 百分比（保留 2 位小数） */
function pct(n, d) {
  if (!d) return '0.00%';
  return `${((n / d) * 100).toFixed(2)}%`;
}

async function main() {
  await testConnection();
  const out = { generatedAt: new Date().toISOString() };

  // ========== 1) 员工主数据表确认 ==========
  // 依据：violations.js 的 resolveViolatorId 用 employee 表（id / name / id_card_hash）；
  //       hse_assessment_target.employee_id 可 100% 在视图 v_employee_org_full 命中。
  const tblR = await pool.query(`
    SELECT
      (SELECT count(*) FROM employee)                                   AS employee_rows,
      (SELECT count(*) FROM employee WHERE is_deleted = FALSE OR is_deleted IS NULL) AS employee_alive,
      (SELECT count(*) FROM v_employee_org_full)                        AS view_rows,
      (SELECT count(*) FROM v_employee_org_full WHERE is_current)       AS view_current
  `);
  out.employeeMaster = {
    table: 'employee',
    columns: ['id', 'name', 'id_card_hash', 'is_deleted'],
    rows: Number(tblR.rows[0].employee_rows),
    alive: Number(tblR.rows[0].employee_alive),
    authoritativeView: {
      name: 'v_employee_org_full',
      rows: Number(tblR.rows[0].view_rows),
      current: Number(tblR.rows[0].view_current),
      nameColumn: 'name',
      idColumn: 'employee_id',
    },
    note: '考核对象 hse_assessment_target.employee_id 与视图 employee_id 100% 命中，故以视图为关联基准',
  };

  // 目标覆盖校验
  const covR = await pool.query(`
    SELECT count(DISTINCT t.employee_id)                    AS target_ids,
           count(DISTINCT e.employee_id)                    AS matched_ids
      FROM hse_assessment_target t
      LEFT JOIN v_employee_org_full e ON e.employee_id = t.employee_id
     WHERE t.is_deleted = FALSE
  `);
  out.employeeMaster.targetIdCoverage = {
    targetIds: Number(covR.rows[0].target_ids),
    matchedInView: Number(covR.rows[0].matched_ids),
  };

  // ========== 2) 员工姓名 → employee_id 映射 ==========
  const empR = await pool.query(`
    SELECT employee_id, name, org_name, position_name
      FROM v_employee_org_full
     WHERE is_current = TRUE AND name IS NOT NULL
  `);
  const nameToIds = new Map(); // 归一化姓名 -> Set<employee_id>
  const idToName = new Map();
  for (const r of empR.rows) {
    const n = normName(r.name);
    if (!n) continue;
    if (!nameToIds.has(n)) nameToIds.set(n, new Set());
    nameToIds.get(n).add(Number(r.employee_id));
    if (!idToName.has(Number(r.employee_id))) idToName.set(Number(r.employee_id), r.name);
  }
  out.employeeNameIndex = {
    employeeRows: empR.rows.length,
    distinctNormalizedNames: nameToIds.size,
    duplicateNames: [...nameToIds.entries()].filter(([, s]) => s.size > 1).map(([n, s]) => ({ name: n, count: s.size })),
  };

  // ========== 3) 违规记录逐条匹配 ==========
  const vioR = await pool.query(`
    SELECT id, violator_name, violation_behavior, area_team, violator_id, violation_date
      FROM violation_records
     WHERE is_deleted IS NOT TRUE
  `);

  let total = 0;
  let nameEmpty = 0;
  let placeholder = 0;          // 占位符/性别等非姓名值（--、男、女）
  let recoveredByCleaning = 0;   // 含噪声但清洗后匹配成功
  let cleanFailed = 0;           // 含噪声且清洗后仍匹配失败
  let uniqueMatch = 0;           // 形态规范且唯一匹配
  let dupMatch = 0;
  let noMatch = 0;

  const unmatchedNames = new Map();  // 姓名 -> 次数
  const dupNames = new Map();        // 姓名 -> 次数
  const matchedEmployeeIds = new Set();
  const matchedByCycle = new Map();  // employee_id -> 违规条数

  let behaviorNonEmpty = 0;
  let behaviorExactName = 0;
  let behaviorContainsName = 0;
  let behaviorLooksLikeName = 0;

  const empNameSet = new Set(nameToIds.keys());

  for (const v of vioR.rows) {
    total++;
    const rawName = v.violator_name;
    const name = normName(rawName);

    // --- violation_behavior 污染度 ---
    const beh = normName(v.violation_behavior);
    if (beh) {
      behaviorNonEmpty++;
      if (empNameSet.has(beh)) behaviorExactName++;
      else {
        let hit = false;
        for (const en of empNameSet) {
          if (en.length >= 2 && beh.includes(en)) { hit = true; break; }
        }
        if (hit) behaviorContainsName++;
        else if (RE_CN_NAME.test(beh)) behaviorLooksLikeName++;
      }
    }

    // --- 违规人姓名匹配 ---
    if (!name) { nameEmpty++; continue; }

    // 占位符/性别等非姓名值：与「姓名」分开统计，不计入匹配率分母
    if (isPlaceholder(name)) {
      placeholder++;
      continue;
    }

    // 形态不规范的姓名（含标点/数字/反斜杠等噪声）：先清洗再匹配
    let candidate = name;
    let cleaned = false;
    if (!RE_CN_NAME.test(name)) {
      candidate = cleanName(name);
      cleaned = true;
    }

    const ids = nameToIds.get(candidate);
    if (!ids || ids.size === 0) {
      if (cleaned) {
        cleanFailed++;
        unmatchedNames.set(name, (unmatchedNames.get(name) || 0) + 1);
      } else {
        noMatch++;
        unmatchedNames.set(name, (unmatchedNames.get(name) || 0) + 1);
      }
      continue;
    }
    if (ids.size === 1) {
      if (cleaned) recoveredByCleaning++; else uniqueMatch++;
      const eid = [...ids][0];
      matchedEmployeeIds.add(eid);
      matchedByCycle.set(eid, (matchedByCycle.get(eid) || 0) + 1);
    } else {
      dupMatch++;
      dupNames.set(candidate, (dupNames.get(candidate) || 0) + 1);
    }
  }

  const namePresent = total - nameEmpty;                 // 姓名非空
  const validNames = namePresent - placeholder;          // 剔除占位符后的「真实姓名」基数
  const totalMatched = uniqueMatch + recoveredByCleaning; // 可关联总数
  out.violationRecords = {
    total,
    violatorNameEmpty: nameEmpty,
    violatorNameEmptyPct: pct(nameEmpty, total),
    violatorNamePresent: namePresent,
    violatorNamePresentPct: pct(namePresent, total),
    placeholderOrGender: placeholder,
    placeholderOrGenderPctOfPresent: pct(placeholder, namePresent),
    validNameBase: validNames,
    validNameBasePct: pct(validNames, total),
    uniqueMatched: uniqueMatch,
    uniqueMatchedPctOfValid: pct(uniqueMatch, validNames),
    recoveredByCleaning,
    recoveredByCleaningPctOfValid: pct(recoveredByCleaning, validNames),
    totalMatched,
    totalMatchedPctOfValid: pct(totalMatched, validNames),
    totalMatchedPctOfTotal: pct(totalMatched, total),
    duplicateMatched: dupMatch,
    duplicateMatchedPctOfValid: pct(dupMatch, validNames),
    noMatch,
    noMatchPctOfValid: pct(noMatch, validNames),
    cleanFailed,
    cleanFailedPctOfValid: pct(cleanFailed, validNames),
    distinctMatchedEmployeeIds: matchedEmployeeIds.size,
  };

  out.duplicateNameSamples = [...dupNames.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([name, count]) => ({ name, records: count, candidateEmployees: nameToIds.get(name).size }));

  out.unmatchedNameSamples = [...unmatchedNames.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 20)
    .map(([name, count]) => ({ name, records: count }));

  out.violationBehaviorPollution = {
    nonEmpty: behaviorNonEmpty,
    nonEmptyPct: pct(behaviorNonEmpty, total),
    exactlyEqualsEmployeeName: behaviorExactName,
    exactlyEqualsEmployeeNamePct: pct(behaviorExactName, total),
    containsEmployeeName: behaviorContainsName,
    containsEmployeeNamePct: pct(behaviorContainsName, total),
    looksLikeChineseNameButUnmatched: behaviorLooksLikeName,
    looksLikeChineseNameButUnmatchedPct: pct(behaviorLooksLikeName, total),
  };

  // ========== 4) 与考核对象交集 ==========
  const cycR = await pool.query(`
    SELECT id, assessment_year, assessment_month, status
      FROM hse_assessment_cycle
     WHERE is_deleted = FALSE
     ORDER BY assessment_year DESC, assessment_month DESC
     LIMIT 3
  `);
  out.cycles = [];
  for (const c of cycR.rows) {
    const tR = await pool.query(
      `SELECT DISTINCT employee_id FROM hse_assessment_target WHERE cycle_id=$1 AND is_deleted=FALSE`,
      [c.id]
    );
    const targetIds = new Set(tR.rows.map((r) => Number(r.employee_id)));
    const hitIds = [...matchedEmployeeIds].filter((e) => targetIds.has(e));
    const hitRecords = hitIds.reduce((s, e) => s + (matchedByCycle.get(e) || 0), 0);
    out.cycles.push({
      cycleId: c.id,
      period: `${c.assessment_year}-${String(c.assessment_month).padStart(2, '0')}`,
      status: c.status,
      assessmentTargets: targetIds.size,
      coverableTargets: hitIds.length,
      coverableTargetsPct: pct(hitIds.length, targetIds.size),
      coverableViolationRecords: hitRecords,
    });
  }

  const allTargetIds = new Set();
  for (const c of out.cycles) void c;
  const tAllR = await pool.query(
    `SELECT DISTINCT employee_id FROM hse_assessment_target
      WHERE cycle_id = ANY($1::bigint[]) AND is_deleted = FALSE`,
    [cycR.rows.map((r) => r.id)]
  );
  for (const r of tAllR.rows) allTargetIds.add(Number(r.employee_id));
  const hitAll = [...matchedEmployeeIds].filter((e) => allTargetIds.has(e));
  out.threeCycleUnion = {
    distinctAssessmentTargets: allTargetIds.size,
    coverableTargets: hitAll.length,
    coverableTargetsPct: pct(hitAll.length, allTargetIds.size),
    coverableViolationRecords: hitAll.reduce((s, e) => s + (matchedByCycle.get(e) || 0), 0),
  };

  // ========== 5) 结论 ==========
  // 门槛口径：仅对「真实姓名」基数（剔除空值与占位符）计算唯一匹配率
  const rate = validNames ? totalMatched / validNames : 0;
  const THRESHOLD = 0.9;
  out.conclusion = {
    uniqueMatchRate: pct(totalMatched, validNames),
    threshold: '≥90%（分母 = 真实姓名记录数，即剔除空值与 --/男/女 占位符）',
    canAutoBackfill: rate >= THRESHOLD,
    verdict: rate >= THRESHOLD
      ? '达标：可对唯一匹配的记录自动回填 violator_id'
      : `未达标（${pct(totalMatched, validNames)} < 90%）：不建议自动回填，需先治理录入页`,
    blockers: [
      `violator_name 为空 ${nameEmpty} 条（占全部 ${pct(nameEmpty, total)}）—— 无法关联`,
      `占位符/性别值 ${placeholder} 条（占姓名非空 ${pct(placeholder, namePresent)}）—— 录入页把「--」或性别填进了姓名列`,
      `重名 ${dupMatch} 条（占真实姓名 ${pct(dupMatch, validNames)}）—— 必须人工裁定`,
      `匹配不到 ${noMatch + cleanFailed} 条（占真实姓名 ${pct(noMatch + cleanFailed, validNames)}）—— 疑似离职/外包/错字/异体字`,
    ],
  };

  const text = JSON.stringify(out, null, 2);
  const outFile = process.argv[2];
  if (outFile) {
    fs.writeFileSync(path.resolve(outFile), text, 'utf8');
    console.log(`分析完成，结果已写入: ${outFile}`);
  }
  console.log(text);
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try { await pool.end(); } catch {}
  process.exit(1);
});

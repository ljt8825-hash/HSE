/**
 * 三违规范行为字典与匹配服务（P2-B1-E-06-IMPLEMENT）
 *
 * 职责：
 *   - 加载 sanwei_behavior_dict（启用、未删、is_violation=true 的违规行为 + 非违规登记行）
 *   - 将 gir.violation_behavior 原文匹配到规范行为（aliases 精确匹配，禁模糊猜测）
 *   - 组合行为拆分（逗号/顿号/分号等分隔符），矛盾组合行标注
 *
 * 边界（硬性）：
 *   - 历史原文只读、永不回写；
 *   - 匹配是【精确等值】（canonical 名 + aliases），不做 includes() 子串猜测——
 *     防止"未佩戴头盔"误命中"佩戴头盔"之类的语义反转；
 *   - 未命中原子 = fail-closed：不计候选，进入 unmatched 清单由人工维护字典；
 *   - '无三违行为' 是登记行（is_violation=false），永不生成候选；
 *     但组合行「无三违行为,X」仍按 X 拆出候选，并标注矛盾。
 */
const { pool, isConnected } = require('../config/db');

// 组合行为分隔符：中英文逗号、顿号、分号、斜杠、加号（不含普通空格——行为名内无空格场景）
const ATOM_SPLIT_RE = /[，,、;；/＋+]+/;

let _dictCache = null;
let _dictCacheAt = 0;
const DICT_CACHE_TTL_MS = 60 * 1000; // 60s：字典低频变更，扫描批次内一致

/** 加载字典（进程内短 TTL 缓存） */
async function loadDict({ force = false } = {}) {
  if (!isConnected()) return { violations: [], nonViolations: [] };
  if (!force && _dictCache && Date.now() - _dictCacheAt < DICT_CACHE_TTL_MS) return _dictCache;
  const r = await pool.query(
    `SELECT id, behavior_code, behavior_name, behavior_type, aliases, is_violation
       FROM sanwei_behavior_dict
      WHERE is_deleted = FALSE AND enabled = TRUE`
  );
  const violations = [];
  const nonViolations = [];
  for (const row of r.rows) {
    const entry = {
      id: row.id,
      code: row.behavior_code,
      name: row.behavior_name,
      type: row.behavior_type,
      isViolation: row.is_violation,
      // 匹配集合 = 规范名 + aliases（全部精确等值）
      terms: new Set([row.behavior_name, ...(row.aliases || [])].filter(Boolean)),
    };
    (row.is_violation ? violations : nonViolations).push(entry);
  }
  _dictCache = { violations, nonViolations };
  _dictCacheAt = Date.now();
  return _dictCache;
}

/** 清缓存（字典维护后调用） */
function clearDictCache() {
  _dictCache = null;
  _dictCacheAt = 0;
}

/**
 * 精确匹配一个原子文本 → 违规行为条目 | null
 */
function matchViolationAtom(dict, atom) {
  const t = String(atom || '').trim();
  if (t === '') return null;
  for (const v of dict.violations) {
    if (v.terms.has(t)) return v;
  }
  return null;
}

/** 原子文本是否为登记的非违规文本（如'无三违行为'） */
function matchNonViolationAtom(dict, atom) {
  const t = String(atom || '').trim();
  if (t === '') return false;
  for (const nv of dict.nonViolations) {
    if (nv.terms.has(t)) return true;
  }
  return false;
}

/**
 * 匹配 gir.violation_behavior 原文 → 候选识别结果
 *
 * @param {string} rawText 原文（gir.violation_behavior）
 * @returns {{
 *   isEmpty: boolean,                  // 原文为空/空白
 *   matched: Array<{behaviorId, behaviorCode, behaviorName, behaviorType, atomText}>,
 *                                     // 命中的规范行为（去重，按原文出现顺序）
 *   hasNoViolationToken: boolean,      // 原文含'无三违行为'类登记文本
 *   isContradiction: boolean,          // 同时含非违规文本与违规行为（矛盾组合行）
 *   unmatched: string[],               // 未能匹配的非空原子（fail-closed，不产生候选）
 * }}
 */
function matchBehaviorText(dict, rawText) {
  const text = rawText == null ? '' : String(rawText).trim();
  if (text === '') {
    return { isEmpty: true, matched: [], hasNoViolationToken: false, isContradiction: false, unmatched: [] };
  }

  // 1) 整体精确匹配（绝大多数行 = 单一行为原文）
  const whole = matchViolationAtom(dict, text);
  if (whole) {
    return {
      isEmpty: false,
      matched: [toMatched(whole, text)],
      hasNoViolationToken: false,
      isContradiction: false,
      unmatched: [],
    };
  }

  // 2) 组合拆分（按分隔符），逐原子精确匹配
  const atoms = text.split(ATOM_SPLIT_RE).map((s) => s.trim()).filter((s) => s !== '');
  const matched = [];
  const unmatched = [];
  let hasNoViolationToken = false;
  const seen = new Set();
  for (const atom of atoms) {
    if (matchNonViolationAtom(dict, atom)) {
      hasNoViolationToken = true;
      continue;
    }
    const v = matchViolationAtom(dict, atom);
    if (v) {
      if (!seen.has(v.code)) {
        seen.add(v.code);
        matched.push(toMatched(v, atom));
      }
    } else {
      unmatched.push(atom);
    }
  }

  return {
    isEmpty: false,
    matched,
    hasNoViolationToken,
    isContradiction: hasNoViolationToken && matched.length > 0,
    unmatched,
  };
}

function toMatched(entry, atomText) {
  return {
    behaviorId: entry.id,
    behaviorCode: entry.code,
    behaviorName: entry.name,
    behaviorType: entry.type,
    atomText,
  };
}

module.exports = {
  loadDict,
  clearDictCache,
  matchBehaviorText,
  matchViolationAtom,
  matchNonViolationAtom,
  ATOM_SPLIT_RE,
};

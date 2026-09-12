/**
 * 培训签到表（扫描件）花名册匹配 / 归属 / 计数服务
 *
 * 数据口径与 server/routes/accidents.js 的责任归属保持一致：
 *   - 花名册权威源：v_employee_current JOIN employee_assignment
 *   - 保洁员等 → 班组 = employee_assignment.dept_name（"xx镇xx班"），
 *     与 hse_operation_unit.unit_name 精确同名
 *   - 驾驶员 / 转运站操作员 / 收运辅助工 → 归属 "xx镇作业中心"
 *   - 乡镇提取：TOWN_PREFIXES（含别名归一）
 *
 * 与事故模块的差异（培训场景特有）：
 *   - 姓名来自印刷体 OCR，存在错字（如"苜国臣"→"菅国臣"），需模糊匹配
 *     （等价 Python difflib.SequenceMatcher.ratio，Ratcliff/Obershelp 最长公共块）
 *   - 一张签到表 = 一场培训，归属由场内高置信匹配人员投票得出
 *   - 人员状态：已签 / 在岗未培训 / 离职未培训 / 新入职(花名册外签名) / 待核
 */

// ---------- 乡镇与岗位口径（与 accidents.js 一致） ----------
const TOWN_PREFIXES = [
  '宁城街道', '津城街道', '保店镇', '柴胡店镇', '大曹镇', '大柳镇',
  '杜集镇', '刘营伍乡', '时集镇', '相衙镇', '张大庄镇', '长官镇',
];
const TOWN_ALIASES = { 杜集: '杜集镇' };
const CENTER_POSITION_KEYWORDS = ['驾驶员', '转运站操作员', '收运辅助工'];

function isCenterPosition(positionName) {
  if (!positionName) return false;
  const p = String(positionName);
  return CENTER_POSITION_KEYWORDS.some((k) => p.includes(k));
}

function extractTown(text) {
  if (!text) return null;
  const t = String(text).trim();
  if (TOWN_ALIASES[t]) return TOWN_ALIASES[t];
  for (const town of TOWN_PREFIXES) {
    if (t.includes(town)) return town;
  }
  return null;
}

function unitTown(unitName) {
  if (!unitName) return null;
  for (const town of TOWN_PREFIXES) {
    if (String(unitName).includes(town)) return town;
  }
  return null;
}

// ---------- 姓名模糊匹配（等价 difflib.SequenceMatcher.ratio） ----------
/** Ratcliff/Obershelp：递归最长公共子串，返回匹配字符总数 M */
function matchedChars(a, b) {
  let m = 0;
  const stack = [[0, a.length, 0, b.length]];
  while (stack.length) {
    const [alo, ahi, blo, bhi] = stack.pop();
    const la = ahi - alo;
    const lb = bhi - blo;
    let bestLen = 0;
    let bestAi = -1;
    let bestBi = -1;
    let prev = new Array(lb + 1).fill(0);
    for (let i = 1; i <= la; i++) {
      const cur = new Array(lb + 1).fill(0);
      for (let j = 1; j <= lb; j++) {
        if (a[alo + i - 1] === b[blo + j - 1]) {
          cur[j] = prev[j - 1] + 1;
          if (cur[j] > bestLen) {
            bestLen = cur[j];
            bestAi = alo + i - bestLen;
            bestBi = blo + j - bestLen;
          }
        }
      }
      prev = cur;
    }
    if (bestLen > 0) {
      m += bestLen;
      const ae = bestAi + bestLen;
      const be = bestBi + bestLen;
      if (bestAi > alo && bestBi > blo) stack.push([alo, bestAi, blo, bestBi]);
      if (ae < ahi && be < bhi) stack.push([ae, ahi, be, bhi]);
    }
  }
  return m;
}

/** 相似度 = 2M/(len(a)+len(b))，与 Python SequenceMatcher.ratio 一致 */
function nameSimilarity(a, b) {
  if (!a || !b) return 0;
  const m = matchedChars(a, b);
  return (2 * m) / (a.length + b.length);
}

const NAME_SIM_TH = 0.55;      // 模糊匹配阈值（原型验证：管国臣→菅国臣 0.67）
const HIGH_CONFIDENCE = 0.8;   // 高置信（用于场次归属投票）

// ---------- 主服务 ----------
class SigninAttribution {
  constructor(pool) {
    this.pool = pool;
    this.roster = null;        // 在职员工列表
    this.byName = null;        // 姓名 → 员工（重名为数组）
    this.unitByName = null;    // hse_operation_unit.unit_name → {id, name, unitType}
  }

  async load() {
    if (this.roster) return;
    const r = await this.pool.query(`
      SELECT v.employee_id, v.name, v.position_name, v.operation_unit_id, v.unit_name,
             v.org_unit_id, v.org_name, v.supervisor_id, v.supervisor_name,
             ea.dept_name
      FROM v_employee_current v
      LEFT JOIN employee_assignment ea ON ea.id = v.assignment_id
      WHERE v.is_current = true AND (v.employee_deleted = false OR v.employee_deleted IS NULL)
    `);
    this.roster = r.rows;
    this.byName = new Map();
    for (const e of this.roster) {
      const key = String(e.name || '').trim();
      if (!key) continue;
      if (!this.byName.has(key)) this.byName.set(key, []);
      this.byName.get(key).push(e);
    }
    const u = await this.pool.query(
      `SELECT id, unit_name, unit_type FROM hse_operation_unit WHERE is_deleted = false`,
    );
    this.unitByName = new Map();
    for (const row of u.rows) {
      this.unitByName.set(String(row.unit_name).trim(), {
        id: Number(row.id), name: row.unit_name, unitType: row.unit_type,
      });
    }
  }

  /** 姓名匹配：精确（唯一优先）→ 模糊（长度差≤1 中相似度最高且 ≥0.55） */
  matchPerson(nameOcr) {
    const nm = String(nameOcr || '').replace(/\s/g, '');
    if (!nm) return null;
    const exact = this.byName.get(nm);
    if (exact && exact.length === 1) return { employee: exact[0], sim: 1 };
    if (exact && exact.length > 1) return { employee: exact[0], sim: 1, ambiguous: true };
    let best = null;
    let bestSim = 0;
    for (const e of this.roster) {
      const en = String(e.name || '');
      if (!en || Math.abs(en.length - nm.length) > 1) continue;
      const sim = nameSimilarity(nm, en);
      if (sim > bestSim) {
        bestSim = sim;
        best = e;
      }
    }
    if (best && bestSim >= NAME_SIM_TH) return { employee: best, sim: Number(bestSim.toFixed(3)) };
    return null;
  }

  /** 单人归属：{teamId, teamName, centerName}（与 accidents.computePartyInfo 同口径） */
  personAttribution(emp) {
    if (!emp) return { teamId: null, teamName: '', centerName: '' };
    if (isCenterPosition(emp.position_name)) {
      const town = extractTown(emp.org_name) || extractTown(emp.dept_name) || unitTown(emp.unit_name);
      const centerName = town ? `${town}作业中心` : (emp.org_name || '');
      return { teamId: null, teamName: '', centerName };
    }
    // 保洁员等：班组 = dept_name 对应真实单元
    let teamName = '';
    let teamId = null;
    if (emp.dept_name) {
      const unit = this.unitByName.get(String(emp.dept_name).trim());
      if (unit) {
        teamName = unit.name;
        teamId = unit.id;
      } else {
        teamName = String(emp.dept_name).trim();
      }
    } else if (emp.unit_name) {
      teamName = emp.unit_name;
      teamId = emp.operation_unit_id != null ? Number(emp.operation_unit_id) : null;
    }
    const town = extractTown(emp.dept_name) || extractTown(emp.org_name) || unitTown(emp.unit_name);
    const centerName = town ? `${town}作业中心` : '';
    return { teamId, teamName, centerName };
  }

  /**
   * 处理一场签到（Python 脚本输出的单个 session）。
   * 返回带计数/标签/归属/人员分组的场次结构。
   */
  buildSession(sess) {
    const persons = Array.isArray(sess.persons) ? sess.persons : [];
    const people = [];
    const groups = {
      onPostUntrained: [],   // 在岗未培训（花名册有此人、未签名）
      resignedUntrained: [], // 离职未培训（有印刷姓名、未签名、花名册无此人）
      unknownUntrained: [],  // 待核（姓名 OCR 失败且未签名）
      newcomers: [],         // 新入职/花名册外到场（无印刷姓名但有签名，冲抵缺少）
    };

    // ---- 第一遍：全员匹配（全局花名册，暂不做乡镇约束）----
    for (const p of persons) {
      const hasName = !!p.has_printed_name;
      const signed = !!p.signed;
      if (!hasName && !signed) continue; // 纯空格，跳过
      const person = {
        seq: p.seq, row: p.row, group: p.group,
        nameOcr: p.name_ocr || '',
        hasName,
        signed,
        match: null,
        status: '',
      };
      if (hasName) {
        const m = p.name_ocr ? this.matchPerson(p.name_ocr) : null;
        if (m) {
          const attr = this.personAttribution(m.employee);
          person.match = {
            employeeId: Number(m.employee.employee_id),
            name: m.employee.name,
            sim: m.sim,
            deptName: m.employee.dept_name || '',
            positionName: m.employee.position_name || '',
            teamId: attr.teamId,
            teamName: attr.teamName,
            centerName: attr.centerName,
          };
        }
      }
      people.push(person);
    }

    // ---- 场次归属：高置信匹配人员投票（先用未过滤的匹配）----
    let deptName = '';
    let teamUnitId = null;
    let teamUnitName = '';
    let centerName = '';
    if (sess.kind === 'company') {
      deptName = '宁津项目（公司级跨部门）';
    } else {
      const votes = new Map();
      for (const p of people) {
        if (!p.match) continue;
        if (p.match.sim < HIGH_CONFIDENCE) continue;
        const key = p.match.teamName
          ? `team:${p.match.teamId || ''}:${p.match.teamName}`
          : `center:${p.match.centerName}`;
        votes.set(key, (votes.get(key) || 0) + 1);
      }
      let bestKey = null;
      let bestN = 0;
      for (const [k, n] of votes) {
        if (n > bestN) { bestN = n; bestKey = k; }
      }
      if (bestKey) {
        if (bestKey.startsWith('team:')) {
          const [, id, name] = bestKey.split(':');
          teamUnitName = name;
          teamUnitId = id ? Number(id) : null;
          deptName = name;
          const town = extractTown(name);
          centerName = town ? `${town}作业中心` : '';
        } else {
          centerName = bestKey.slice('center:'.length);
          deptName = centerName;
        }
      }
    }
    // 场次所属乡镇（用于约束低置信模糊匹配，防止跨乡镇误配，如张大庄表误配津城街道的人）
    const sessionTown = extractTown(teamUnitName || centerName || '');

    // ---- 第二遍：乡镇 scope 过滤低置信匹配 + 同人签名去重 + 分组 ----
    // 同人同场已签过一次（重复印刷行）即视为已签，不重复计未培训
    const signedEmps = new Set(
      people.filter((p) => p.signed && p.match).map((p) => p.match.employeeId),
    );
    for (const person of people) {
      if (!person.hasName) {
        // 无印刷姓名但有签名：月中新入职等，计入实到冲抵缺少
        person.status = 'newcomer';
        groups.newcomers.push({ seq: person.seq, row: person.row, group: person.group });
        continue;
      }
      // 低置信模糊匹配（0.55~0.8）：若场次乡镇明确而候选人属其他乡镇，判为误配，撤销
      if (person.match && person.match.sim < HIGH_CONFIDENCE && sessionTown) {
        const empTown = extractTown(
          person.match.teamName || person.match.centerName || person.match.deptName || '',
        );
        if (empTown && empTown !== sessionTown) {
          person.match = null;
        }
      }
      if (person.signed) {
        person.status = 'signed';
        continue;
      }
      // 未签名
      if (person.match) {
        if (signedEmps.has(person.match.employeeId)) {
          // 同一人在本场其他行已签名（制表重复印刷），不算未培训
          person.status = 'signed_dup';
        } else {
          person.status = 'on_post_untrained';
          groups.onPostUntrained.push({
            name: person.match.name, ocrName: person.nameOcr, employeeId: person.match.employeeId,
            teamName: person.match.teamName, centerName: person.match.centerName,
            positionName: person.match.positionName, sim: person.match.sim,
          });
        }
      } else if (person.nameOcr.trim().length < 2) {
        // OCR 失败（空或单字噪声，如"叨/四/否"）→ 待核，不臆断为离职
        person.status = 'unknown_untrained';
        groups.unknownUntrained.push({
          seq: person.seq, row: person.row, group: person.group, ocrName: person.nameOcr,
        });
      } else {
        person.status = 'resigned_untrained';
        groups.resignedUntrained.push({ name: person.nameOcr, sim: null });
      }
    }

    // ---- 计数（用户口径）----
    const expectedCount = persons.filter((p) => !!p.has_printed_name).length;
    const actualCount = persons.filter((p) => !!p.signed).length; // 含无名签名（新入职冲抵）
    // 同名重复印刷且本人已在其他行签名（signed_dup）的行，其"应到"已由签名行抵消，不计入缺少
    const dupRows = people.filter((p) => p.status === 'signed_dup').length;
    const missingCount = Math.max(expectedCount - actualCount - dupRows, 0);

    const header = sess.header || {};
    return {
      page: sess.page,
      kind: sess.kind,
      tags: Array.isArray(sess.tags) ? sess.tags : [],
      missingFields: Array.isArray(header.missing_fields) ? header.missing_fields : [],
      trainingDateText: (header.fields && header.fields.training_date && header.fields.training_date.text) || '',
      contentText: (header.fields && header.fields.content && header.fields.content.text) || '',
      expectedCount,
      actualCount,
      missingCount,
      untrainedCount: groups.onPostUntrained.length,
      deptName,
      teamUnitId,
      teamUnitName,
      centerName,
      people,
      groups,
    };
  }
}

module.exports = {
  SigninAttribution,
  nameSimilarity,
  extractTown,
  isCenterPosition,
  TOWN_PREFIXES,
};

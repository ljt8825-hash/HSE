/**
 * 一次性回填 accidents 的花名册推断字段
 *
 * 目标字段：
 *   - responsibility_team / responsibility_team_id（责任班组 + ID）
 *   - party_dept / party_dept_id（当事人所属部门）
 *   - party_supervisor / party_supervisor_id（当事人上级链）
 *
 * 策略：复用 accidents.js 中的 computeResponsibilityTeam / computePartyInfo
 *       对 is_deleted=false 的所有记录逐行跑一次，缺失字段回写 DB。
 *
 * 幂等：所有路径 COALESCE/IF EXISTS，可重复执行。
 * 进度：每 10 条打印一次进度；结束输出统计。
 *
 * 用法：
 *   cd G:/hse-dashboard
 *   ./node.exe server/scripts/_accidents/backfill_party.js
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'development';

// 直接 require 后端 accidents 路由文件中的函数 ——
// 路由主体用 module.exports = router 暴露，所以函数不直接对外；
// 这里改为 require 相关 utils（compute 函数通过相对 require 内部实现）。
// 为避免对路由实现做侵入式改造，改为在这里重新实现回填逻辑（与路由内一致的规则）
const { pool, testConnection } = require('../../config/db');

const CENTER_POSITION_KEYWORDS = ['驾驶员', '转运站操作员', '收运辅助工'];
function isCenterPosition(positionName) {
  if (!positionName) return false;
  return CENTER_POSITION_KEYWORDS.some((k) => String(positionName).includes(k));
}

async function findRosterPerson(client, { personnelId, name }) {
  if (!personnelId && !name) return null;
  const SELECT_COLS = `v.employee_id, v.name, v.operation_unit_id, v.unit_name, v.position_name,
       v.org_unit_id, v.org_name, v.supervisor_id, v.supervisor_name,
       ea.dept_name`;
  const FROM_JOIN = `FROM v_employee_current v
           LEFT JOIN employee_assignment ea ON ea.id = v.assignment_id`;
  if (personnelId) {
    const r = await client.query(
      `SELECT ${SELECT_COLS} ${FROM_JOIN}
       WHERE v.employee_id = $1 AND v.is_current = true AND (v.employee_deleted = false OR v.employee_deleted IS NULL)
       LIMIT 1`,
      [personnelId],
    );
    return r.rows[0] || null;
  }
  const r = await client.query(
    `SELECT ${SELECT_COLS} ${FROM_JOIN}
     WHERE v.name = $1 AND v.is_current = true AND (v.employee_deleted = false OR v.employee_deleted IS NULL)
     LIMIT 1`,
    [name],
  );
  return r.rows[0] || null;
}

async function findUnitByName(client, unitName) {
  if (!unitName) return null;
  const r = await client.query(
    `SELECT id, unit_name FROM hse_operation_unit WHERE unit_name = $1 AND is_deleted = false LIMIT 1`,
    [String(unitName).trim()],
  );
  if (r.rows.length === 0) return null;
  return { id: Number(r.rows[0].id), name: r.rows[0].unit_name };
}

async function findOperationCenterUnit(client, town) {
  if (!town) return null;
  const r = await client.query(
    `SELECT id, unit_name FROM hse_operation_unit WHERE unit_name = $1 AND is_deleted = false LIMIT 1`,
    [`${town}作业中心`],
  );
  return r.rows.length ? { id: Number(r.rows[0].id), name: r.rows[0].unit_name } : null;
}

const TOWN_PREFIXES = [
  '宁城街道', '宁城', '津城', '长官', '时集', '张大庄', '杜集', '大柳',
  '大曹', '相衙', '保店', '柴胡店', '刘营伍', '香坊李', '赵庄', '徐庄',
  '张鳌', '张宅', '田庄', '小店', '龙昌', '双碓', '陈万侯', '傅集',
];

function extractTown(text) {
  if (!text) return null;
  const t = String(text).trim();
  for (const town of TOWN_PREFIXES) if (t.includes(town)) return town;
  return null;
}

function unitTown(unitName) {
  if (!unitName) return null;
  for (const town of TOWN_PREFIXES) if (String(unitName).includes(town)) return town;
  return null;
}

async function computeResponsibilityTeamFor(client, { personnelId, name, location, locationFallback }) {
  const fallbackCenter = async (town) => {
    if (!town) return { responsibilityTeamId: null, responsibilityTeam: '' };
    const center = await findOperationCenterUnit(client, town);
    return center
      ? { responsibilityTeamId: center.id, responsibilityTeam: center.name }
      : { responsibilityTeamId: null, responsibilityTeam: `${town}作业中心` };
  };
  const centerByPerson = (person) => {
    const town =
      extractTown(person.dept_name) ||
      extractTown(person.org_name) ||
      unitTown(person.unit_name) ||
      extractTown(location) ||
      extractTown(locationFallback);
    return fallbackCenter(town);
  };
  const person = await findRosterPerson(client, { personnelId, name });
  if (person) {
    if (isCenterPosition(person.position_name)) return centerByPerson(person);
    const team = await findUnitByName(client, person.dept_name);
    if (team) return { responsibilityTeamId: team.id, responsibilityTeam: team.name };
    if (person.operation_unit_id) {
      return {
        responsibilityTeamId: Number(person.operation_unit_id),
        responsibilityTeam: person.unit_name || '',
      };
    }
    return centerByPerson(person);
  }
  return fallbackCenter(extractTown(location) || extractTown(locationFallback));
}

async function computePartyInfoFor(client, { personnelId, name, location, locationFallback }) {
  const person = await findRosterPerson(client, { personnelId, name });
  if (!person) return { partyDept: '', partyDeptId: null, partySupervisor: '', partySupervisorId: null };
  let partyDept = '';
  let partyDeptId = null;
  if (isCenterPosition(person.position_name)) {
    const town = extractTown(person.org_name) || extractTown(person.dept_name) || extractTown(location) || extractTown(locationFallback);
    const center = town ? await findOperationCenterUnit(client, town) : null;
    if (center) {
      partyDept = center.name;
      partyDeptId = center.id;
    } else {
      partyDept = person.org_name || '';
      partyDeptId = person.org_unit_id != null ? Number(person.org_unit_id) : null;
    }
  } else {
    const team = person.dept_name ? await findUnitByName(client, person.dept_name) : null;
    if (team) {
      partyDept = team.name;
      partyDeptId = team.id;
    } else if (person.dept_name) {
      partyDept = person.dept_name;
      partyDeptId = person.org_unit_id != null ? Number(person.org_unit_id) : null;
    } else if (person.org_name) {
      partyDept = person.org_name;
      partyDeptId = person.org_unit_id != null ? Number(person.org_unit_id) : null;
    }
  }
  const chain = [];
  let curId = person.supervisor_id != null ? Number(person.supervisor_id) : null;
  let guard = 0;
  while (curId && guard < 2) {
    const sup = await findRosterPerson(client, { personnelId: curId });
    if (!sup) break;
    if (sup.employee_id && Number(sup.employee_id) === Number(person.employee_id)) break;
    chain.push({
      id: Number(sup.employee_id),
      label: sup.name,
    });
    curId = sup.supervisor_id != null ? Number(sup.supervisor_id) : null;
    guard++;
  }
  const partySupervisor = chain.map((c) => c.label).join(' / ');
  const partySupervisorId = chain.length ? chain[chain.length - 1].id : null;
  return { partyDept, partyDeptId, partySupervisor, partySupervisorId };
}

// 责任班组 → 当事人部门/上级 反推（当事人不在花名册、仅手填责任班组场景）
// 与路由内 computePartyFromTeam 同规则：部门=单元名；上级=单元 supervisor_id，否则父中心管理岗追溯 1~2 级
async function followSupervisorChainFor(client, startId) {
  const chain = [];
  let curId = startId != null ? Number(startId) : null;
  let guard = 0;
  while (curId && guard < 2) {
    const sup = await findRosterPerson(client, { personnelId: curId });
    if (!sup) break;
    if (chain.length && sup.employee_id && Number(sup.employee_id) === Number(chain[chain.length - 1].id)) break;
    chain.push({ id: Number(sup.employee_id), label: `${sup.name}${sup.position_name ? `（${sup.position_name}）` : ''}` });
    curId = sup.supervisor_id != null ? Number(sup.supervisor_id) : null;
    guard++;
  }
  return chain;
}

async function findCenterManagerChainFor(client, orgUnitId, unitName) {
  if (orgUnitId) {
    const r = await client.query(
      `SELECT v.employee_id
       FROM v_employee_current v
       WHERE v.is_current = true AND (v.employee_deleted = false OR v.employee_deleted IS NULL)
         AND v.org_unit_id = $1
         AND v.position_name IN ('管理员', '乡镇作业中心经理', '环卫作业中心副经理（人工）', '部门经理')
       ORDER BY (CASE v.position_name
         WHEN '管理员' THEN 1 WHEN '乡镇作业中心经理' THEN 2
         WHEN '环卫作业中心副经理（人工）' THEN 3 WHEN '部门经理' THEN 4 ELSE 5 END)
       LIMIT 1`,
      [Number(orgUnitId)],
    );
    if (r.rows.length) return followSupervisorChainFor(client, Number(r.rows[0].employee_id));
  }
  const town = unitName ? extractTown(unitName) : null;
  if (town) {
    const r = await client.query(
      `SELECT v.employee_id
       FROM v_employee_current v
       WHERE v.is_current = true AND (v.employee_deleted = false OR v.employee_deleted IS NULL)
         AND v.position_name IN ('管理员', '乡镇作业中心经理', '环卫作业中心副经理（人工）', '部门经理')
         AND (v.org_name LIKE '%' || $1 || '%' OR v.unit_name LIKE '%' || $1 || '%')
       ORDER BY (CASE v.position_name
         WHEN '管理员' THEN 1 WHEN '乡镇作业中心经理' THEN 2
         WHEN '环卫作业中心副经理（人工）' THEN 3 WHEN '部门经理' THEN 4 ELSE 5 END)
       LIMIT 1`,
      [town],
    );
    if (r.rows.length) return followSupervisorChainFor(client, Number(r.rows[0].employee_id));
  }
  return [];
}

async function computePartyFromTeamFor(client, { teamId, teamName }) {
  if (!teamId && !teamName) return { partyDept: '', partyDeptId: null, partySupervisor: '', partySupervisorId: null };
  let unit = null;
  if (teamId) {
    const r = await client.query(
      `SELECT id, unit_name, supervisor_id, org_unit_id FROM hse_operation_unit WHERE id = $1 AND is_deleted = false LIMIT 1`,
      [Number(teamId)],
    );
    if (r.rows.length) unit = r.rows[0];
  }
  if (!unit && teamName) {
    const r = await client.query(
      `SELECT id, unit_name, supervisor_id, org_unit_id FROM hse_operation_unit WHERE unit_name = $1 AND is_deleted = false LIMIT 1`,
      [String(teamName).trim()],
    );
    if (r.rows.length) unit = r.rows[0];
  }
  if (!unit) return { partyDept: '', partyDeptId: null, partySupervisor: '', partySupervisorId: null };
  const partyDept = unit.unit_name || '';
  const partyDeptId = unit.id != null ? Number(unit.id) : null;
  let chain = [];
  if (unit.supervisor_id != null) {
    chain = await followSupervisorChainFor(client, Number(unit.supervisor_id));
  } else if (unit.org_unit_id != null) {
    chain = await findCenterManagerChainFor(client, Number(unit.org_unit_id), unit.unit_name);
  }
  const partySupervisor = chain.map((c) => c.label).join(' / ');
  const partySupervisorId = chain.length ? chain[chain.length - 1].id : null;
  return { partyDept, partyDeptId, partySupervisor, partySupervisorId };
}

async function main() {
  await testConnection();
  // 开发环境 isConnected() 依赖 dbConnected 标志；脚本主动跑一次连接检测
  const probe = await pool.query('SELECT 1 AS ok').then((r) => r.rows[0]).catch(() => null);
  if (!probe) {
    console.error('[backfill_party] 数据库未连接，跳过');
    process.exit(0);
  }
  const client = await pool.connect();
  let total = 0;
  let filledTeam = 0;
  let filledDept = 0;
  let filledSuper = 0;
  let fromTeam = 0;
  try {
    const all = await client.query(
      `      SELECT id, involved_person, personnel_id, location, responsibility_team, responsibility_team_id, party_supervisor
       FROM accidents
       WHERE is_deleted = false
       ORDER BY id`,
    );
    total = all.rows.length;
    console.log(`[backfill_party] 找到 ${total} 条事故，开始回填`);
    for (let i = 0; i < all.rows.length; i++) {
      const row = all.rows[i];
      try {
        // 推断责任班组
        const team = await computeResponsibilityTeamFor(client, {
          personnelId: row.personnel_id ? Number(row.personnel_id) : undefined,
          name: row.involved_person || undefined,
          location: row.location || undefined,
          locationFallback: '',
        });
        // 推断所属部门 + 上级
        const party = await computePartyInfoFor(client, {
          personnelId: row.personnel_id ? Number(row.personnel_id) : undefined,
          name: row.involved_person || undefined,
          location: row.location || undefined,
          locationFallback: '',
        });
        // 反向派生：当事人部门/上级 也可从责任班组反推（当事人不在花名册、仅手填责任班组场景）
        // 仅当 person 推断未产出时，用有效责任班组（person 推断结果优先，否则回退 DB 已填的责任班组）补位
        if (!party.partyDept || !party.partySupervisor) {
          const effTeamId = team.responsibilityTeamId != null ? team.responsibilityTeamId
            : (row.responsibility_team_id ? Number(row.responsibility_team_id) : null);
          const effTeamName = team.responsibilityTeam || (row.responsibility_team || '');
          if (effTeamId || effTeamName) {
            const teamParty = await computePartyFromTeamFor(client, { teamId: effTeamId, teamName: effTeamName });
            if (!party.partyDept) { party.partyDept = teamParty.partyDept; party.partyDeptId = teamParty.partyDeptId; }
            if (!party.partySupervisor) { party.partySupervisor = teamParty.partySupervisor; party.partySupervisorId = teamParty.partySupervisorId; }
          }
        }
        const fields = [];
        const params = [];
        let p = 1;
        // 注意：COALESCE(col, $val) 不会覆盖已存的空字符串 ''（空串非 NULL）。
        // 历史记录可能存在 party_supervisor=''（非 NULL）导致反推值被吞，故用
        // COALESCE(NULLIF(col, ''), $val)：当前为 NULL 或 '' 时回填，已有真实值则保留。
        if (team.responsibilityTeam) {
          fields.push(`responsibility_team = COALESCE(NULLIF(responsibility_team, ''), $${p++})`);
          params.push(team.responsibilityTeam);
        }
        if (team.responsibilityTeamId != null) {
          fields.push(`responsibility_team_id = COALESCE(responsibility_team_id, $${p++})`);
          params.push(team.responsibilityTeamId);
        }
        if (party.partyDept) {
          fields.push(`party_dept = COALESCE(NULLIF(party_dept, ''), $${p++})`);
          params.push(party.partyDept);
        }
        if (party.partyDeptId != null) {
          fields.push(`party_dept_id = COALESCE(party_dept_id, $${p++})`);
          params.push(party.partyDeptId);
        }
        // 当事人上级只要姓名（去掉职位/岗位）：可重算时强制改写，覆盖「空串」与「历史带职位（…）」旧值
        const curSup = (row.party_supervisor || '').trim();
        if (party.partySupervisor && (curSup === '' || curSup.includes('（'))) {
          fields.push(`party_supervisor = $${p++}`);
          params.push(party.partySupervisor);
        }
        if (party.partySupervisorId != null) {
          fields.push(`party_supervisor_id = COALESCE(party_supervisor_id, $${p++})`);
          params.push(party.partySupervisorId);
        }
        if (fields.length) {
          params.push(row.id);
          await client.query(
            `UPDATE accidents SET ${fields.join(', ')} WHERE id = $${p}`,
            params,
          );
          if (team.responsibilityTeamId != null) filledTeam++;
          if (party.partyDept) filledDept++;
          if (party.partySupervisor) filledSuper++;
          if (!row.party_dept && party.partyDept && !row.personnel_id) fromTeam++;
        }
        if ((i + 1) % 10 === 0) {
          console.log(`[backfill_party] 进度 ${i + 1}/${total}`);
        }
      } catch (e) {
        console.warn(`[backfill_party] id=${row.id} 失败: ${e.message}`);
      }
    }
    console.log(`[backfill_party] 完成：处理 ${total} 条，回填责任班组 ${filledTeam}、部门 ${filledDept}、上级 ${filledSuper}（其中责任班组反推 ${fromTeam}）`);
  } catch (e) {
    console.error('[backfill_party] 失败:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end().catch(() => {});
    process.exit(process.exitCode || 0);
  }
}

main();

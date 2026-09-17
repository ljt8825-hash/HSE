/**
 * MOBILE-WPS-V1 · 检查范围 / 人员选择范围控制
 *
 * 硬约束：
 * 1. 登录后**不允许**加载全公司人员让用户自己找 —— 必须按登录人的
 *    部门 / 作业单元 / 班组 / 网格等级（以及账号上配置的检查范围）过滤。
 * 2. **禁止**「输入姓名 → 前端猜员工ID」。搜索只是缩小列表，
 *    最终选中必须是「一个有 employeeId 的员工对象」。
 * 3. 选中后带出的姓名/性别/职位/班组/作业单元/乡镇是**只读身份快照**。
 */

import type { MobileAccount, RosterEmployee, Scope } from './types';

/**
 * 求账号的实际检查范围值。
 * 账号未显式配置 values 时，用账号自身的班组/作业单元/乡镇兜底（fail-closed：兜底为空则无候选）。
 */
export function resolveScopeValues(account: MobileAccount): string[] {
  const raw = (account.scope?.values || []).map((v) => String(v || '').trim()).filter(Boolean);
  if (raw.length) return raw;
  switch (account.scope?.type) {
    case 'OWN_TEAM':
      return account.team ? [account.team] : [];
    case 'OWN_UNIT':
      return account.workUnit ? [account.workUnit] : [];
    case 'OWN_TOWNSHIP':
      return account.dept ? [account.dept] : [];
    default:
      return [];
  }
}

/** 单个员工是否落在账号的检查范围内 */
export function isInScope(account: MobileAccount, emp: RosterEmployee): boolean {
  if (emp.status !== 'ENABLED') return false;
  const type = account.scope?.type;
  if (type === 'ALL') return true;
  const values = resolveScopeValues(account);
  if (!values.length) return false; // fail-closed：范围未知 ⇒ 不给人
  switch (type) {
    case 'OWN_TEAM':
      return values.includes(emp.team);
    case 'OWN_UNIT':
      return values.includes(emp.workUnit);
    case 'OWN_TOWNSHIP':
      return values.includes(emp.township) || values.includes(emp.workUnit);
    default:
      return false;
  }
}

/** 按账号范围过滤花名册 */
export function filterRosterByScope(
  account: MobileAccount,
  roster: RosterEmployee[],
): RosterEmployee[] {
  return roster.filter((e) => isInScope(account, e));
}

/**
 * 在**已过滤**的候选池内按关键字搜索（姓名 / 员工ID / 班组 / 职位）。
 * 注意：搜索结果仍是候选池子集，不引入范围外人员。
 */
export function searchRoster(
  pool: RosterEmployee[],
  keyword: string,
): RosterEmployee[] {
  const kw = String(keyword || '').trim().toLowerCase();
  if (!kw) return pool;
  return pool.filter((e) =>
    [e.name, e.employeeId, e.team, e.position, e.workUnit, e.township]
      .filter(Boolean)
      .some((f) => String(f).toLowerCase().includes(kw)),
  );
}

/** 从候选池中按 employeeId 精确取员工（取不到返回 null，绝不猜） */
export function pickByEmployeeId(
  pool: RosterEmployee[],
  employeeId: string,
): RosterEmployee | null {
  const id = String(employeeId || '').trim();
  if (!id) return null;
  return pool.find((e) => e.employeeId === id) || null;
}

/** 生成只读身份快照（写入三违记录，之后花名册变更不追溯改写已发生的事件） */
export function toViolatorSnapshot(emp: RosterEmployee) {
  return {
    employeeId: emp.employeeId,
    name: emp.name,
    gender: emp.gender,
    position: emp.position,
    team: emp.team,
    workUnit: emp.workUnit,
    township: emp.township,
  };
}

/** 公司管理人员：检查范围通常覆盖全域，允许转派 */
export function canTransfer(account: MobileAccount): boolean {
  return account.role === 'COMPANY_ADMIN' || account.role === 'ADMIN';
}

/** 账号是否可作为「责任管理员」被转派（启用 + 非自己） */
export function isAssignable(
  target: MobileAccount,
  fromAccountId: string,
): boolean {
  return target.status === 'ENABLED' && target.accountId !== fromAccountId;
}

/** 范围描述（页面展示用） */
export function describeScope(scope: Scope | undefined): string {
  if (!scope) return '未配置（不可选人）';
  const map: Record<string, string> = {
    OWN_TEAM: '本班组',
    OWN_UNIT: '本作业单元',
    OWN_TOWNSHIP: '本乡镇',
    ALL: '全公司',
  };
  return map[scope.type] || scope.type;
}

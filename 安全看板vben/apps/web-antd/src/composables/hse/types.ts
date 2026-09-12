/**
 * 消费层公共类型定义（Sprint-Q / Q3）
 *
 * 统一员工信息结构 `EmployeeInfo`（camelCase），映射后端 snake_case
 * （`EmployeeItem` / `SelectorItem`），解决 Q1 P0-2 / P0-6 标识符与状态枚举分裂。
 * 所有消费层 Composable 仅接触本文件定义的类型，不直接接触 snake_case。
 */

import type { EmployeeSelectorApi } from '#/api/hse/employee-selector';
import type { EmployeeApi } from '#/api/hse/employee';

/** 统一员工信息（解决 Q1 P0-2 / P0-6）—— Q2 §5.1 */
export interface EmployeeInfo {
  /** 唯一规范键，映射 EmployeeItem.id / SelectorItem.employee_id */
  employeeId: number;
  /** 映射 employee_code */
  employeeCode: string;
  name: string;
  /** 映射 dept_name / org_name */
  deptName: string;
  /** 映射 position_name */
  positionName: string;
  /** 映射 org_status，取值：在职/待岗/离职/退休/返聘 */
  orgStatus: string;
  phone?: string;
  idCard?: string;
}

/** 员工变更事件类型（Q2 §2.1） */
export type EmployeeEventType =
  | 'EMPLOYEE_TRANSFERRED'
  | 'EMPLOYEE_RESIGNED'
  | 'EMPLOYEE_STATUS_CHANGED'
  | 'EMPLOYEE_INFO_UPDATED';

/** 调岗事件载荷 */
export interface TransferredPayload {
  oldOrgId: number;
  newOrgId: number;
  oldPosition?: string;
  newPosition?: string;
  effectiveDate: string;
}

/** 离职事件载荷 */
export interface ResignedPayload {
  resignDate: string;
  lastWorkingDay: string;
}

/** 状态变更事件载荷 */
export interface StatusChangedPayload {
  oldStatus: string;
  newStatus: string;
  effectiveDate: string;
}

/** 基础信息变更事件载荷 */
export interface InfoUpdatedPayload {
  changedFields: string[];
  newValues: Record<string, unknown>;
}

/** 统一事件信封（Q2 §2.2） */
export interface EmployeeEventEnvelope<T = unknown> {
  type: EmployeeEventType;
  employeeId: number;
  /** ISO8601 */
  occurredAt: string;
  payload: T;
  schemaVersion: 1;
}

/** useEmployeeSearch 选项（Q2 §3.4） */
export interface EmployeeSearchOptions {
  mode?: 'single' | 'multiple';
  maxCount?: number;
  /** 部门过滤，透传给选择器 API 的 org_unit_id */
  filterDept?: number;
  /**
   * 状态过滤（org_status）。
   * 注意：当前选择器 API / EmployeeSelector 组件均无 status 过滤能力（Q2 §4.2 为 Q4 增强项），
   * 此处仅接收参数并标注，暂未透传。
   */
  filterStatus?: string;
  /** 防抖毫秒，默认 300 */
  debounceMs?: number;
}

/**
 * SelectorItem(snake_case) → EmployeeInfo(camelCase) 映射（Q2 §5.1）。
 *
 * 限制：SelectorItem 仅含 employee_id/employee_code/name/org_name/position_name 等字段，
 * 不含 org_status/phone/id_card。在 Phase 1 任务 2（`getEmployeesByIds` 批量端点，返回完整
 * EmployeeItem）实现前，这几个字段保持空值；届时在 useEmployeeData / useEmployeeSearch 中
 * 切换到 getEmployeesByIds 即可补全，本映射函数无需改动。
 */
export function mapSelectorToInfo(item: EmployeeSelectorApi.SelectorItem): EmployeeInfo {
  return {
    employeeId: item.employee_id,
    employeeCode: item.employee_code ?? '',
    name: item.name,
    deptName: item.org_name ?? '',
    positionName: item.position_name ?? '',
    orgStatus: '',
    phone: undefined,
    idCard: undefined,
  };
}

/**
 * EmployeeItem(snake_case) → EmployeeInfo(camelCase) 映射（R1-Phase1 P0-1）。
 *
 * 与 `mapSelectorToInfo` 关键差异：EmployeeItem 含 `org_status` / `phone` / `id_card`
 * （SelectorItem 缺失），因此这几个字段在此可正确赋值（不再为空字符串 / undefined）。
 * 切换数据源到 `getEmployeesByIds` 后，EmployeeInfo.orgStatus/phone/idCard 即为真实值。
 */
export function mapEmployeeItemToInfo(item: EmployeeApi.EmployeeItem): EmployeeInfo {
  return {
    employeeId: item.id,
    employeeCode: item.employee_code ?? '',
    name: item.name,
    deptName: item.dept_name ?? '',
    positionName: item.position_name ?? '',
    orgStatus: item.org_status ?? '',
    phone: item.phone,
    idCard: item.id_card,
  };
}

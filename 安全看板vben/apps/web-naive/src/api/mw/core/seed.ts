/**
 * MOBILE-WPS-V1 · TEST 占位数据（**严禁当作正式业务数据**）
 *
 * 使用条件（三条全部满足才允许加载）：
 * 1. 真实花名册**尚未提供**（项目负责人将在第二阶段提供）；
 * 2. 真实三违行为**尚未提供**；
 * 3. 当前未接入真实 WPS 表（NODE-01 默认走本地适配器）。
 *
 * 所有数据一律带 `TEST` 前缀/标识，UI 上会显式打「TEST 数据」横幅。
 * ⚠️ 真实数据到位后，本文件的全部内容应被 WPS 表数据整体替换，不得混用。
 */

import type {
  Area,
  MobileAccount,
  RosterEmployee,
  ViolationRule,
} from './types';

export const TEST_TAG = 'TEST';

/** 判定某条文本是否为 TEST 占位数据 */
export function isTestValue(v: unknown): boolean {
  return String(v ?? '').toUpperCase().includes(TEST_TAG);
}

/* ------------------------------ 账号 ------------------------------ */
export const TEST_ACCOUNTS: MobileAccount[] = [
  {
    accountId: 'TEST-ACC-001',
    name: 'TEST·张三(乡镇经理)',
    phone: '13800000001',
    dept: 'TEST-甲镇作业中心',
    position: '作业中心经理',
    gridLevel: '二级',
    workUnit: 'TEST-甲镇作业单元',
    team: 'TEST-甲镇一组',
    status: 'ENABLED',
    role: 'TOWNSHIP_MANAGER',
    scope: { type: 'OWN_UNIT', values: ['TEST-甲镇作业单元'] },
  },
  {
    accountId: 'TEST-ACC-002',
    name: 'TEST·李四(公司管理)',
    phone: '13800000002',
    dept: 'TEST-公司管理',
    position: 'HSE 管理员',
    gridLevel: '一级',
    workUnit: '',
    team: '',
    status: 'ENABLED',
    role: 'COMPANY_ADMIN',
    scope: { type: 'ALL', values: [] },
  },
  {
    accountId: 'TEST-ACC-003',
    name: 'TEST·王五(已停用)',
    phone: '13800000003',
    dept: 'TEST-乙镇作业中心',
    position: '作业中心经理',
    gridLevel: '二级',
    workUnit: 'TEST-乙镇作业单元',
    team: 'TEST-乙镇一组',
    status: 'DISABLED',
    role: 'TOWNSHIP_MANAGER',
    scope: { type: 'OWN_UNIT', values: ['TEST-乙镇作业单元'] },
  },
  {
    accountId: 'TEST-ACC-004',
    name: 'TEST·赵六(乙镇管理员)',
    phone: '13800000004',
    dept: 'TEST-乙镇作业中心',
    position: '作业中心副经理',
    gridLevel: '二级',
    workUnit: 'TEST-乙镇作业单元',
    team: 'TEST-乙镇二组',
    status: 'ENABLED',
    role: 'TOWNSHIP_MANAGER',
    scope: { type: 'OWN_UNIT', values: ['TEST-乙镇作业单元'] },
  },
];

/* ------------------------------ 花名册 ------------------------------ */
export const TEST_ROSTER: RosterEmployee[] = [
  {
    employeeId: 'TEST-EMP-001',
    name: 'TEST·孙七',
    gender: '男',
    phone: '13900000001',
    position: '保洁员',
    dept: 'TEST-甲镇作业中心',
    workUnit: 'TEST-甲镇作业单元',
    team: 'TEST-甲镇一组',
    township: 'TEST-甲镇',
    status: 'ENABLED',
  },
  {
    employeeId: 'TEST-EMP-002',
    name: 'TEST·周八',
    gender: '女',
    phone: '13900000002',
    position: '驾驶员',
    dept: 'TEST-甲镇作业中心',
    workUnit: 'TEST-甲镇作业单元',
    team: 'TEST-甲镇一组',
    township: 'TEST-甲镇',
    status: 'ENABLED',
  },
  {
    employeeId: 'TEST-EMP-003',
    name: 'TEST·吴九',
    gender: '男',
    phone: '13900000003',
    position: '装卸工',
    dept: 'TEST-甲镇作业中心',
    workUnit: 'TEST-甲镇作业单元',
    team: 'TEST-甲镇二组',
    township: 'TEST-甲镇',
    status: 'ENABLED',
  },
  {
    employeeId: 'TEST-EMP-004',
    name: 'TEST·郑十',
    gender: '男',
    phone: '13900000004',
    position: '保洁员',
    dept: 'TEST-乙镇作业中心',
    workUnit: 'TEST-乙镇作业单元',
    team: 'TEST-乙镇一组',
    township: 'TEST-乙镇',
    status: 'ENABLED',
  },
  {
    employeeId: 'TEST-EMP-005',
    name: 'TEST·钱十一',
    gender: '女',
    phone: '13900000005',
    position: '驾驶员',
    dept: 'TEST-乙镇作业中心',
    workUnit: 'TEST-乙镇作业单元',
    team: 'TEST-乙镇二组',
    township: 'TEST-乙镇',
    status: 'ENABLED',
  },
  {
    employeeId: 'TEST-EMP-006',
    name: 'TEST·冯十二(已离职)',
    gender: '男',
    phone: '13900000006',
    position: '保洁员',
    dept: 'TEST-甲镇作业中心',
    workUnit: 'TEST-甲镇作业单元',
    team: 'TEST-甲镇一组',
    township: 'TEST-甲镇',
    status: 'DISABLED',
  },
];

/* ------------------------------ 三违行为（占位） ------------------------------ */
export const TEST_RULES: ViolationRule[] = [
  {
    ruleId: 'TEST-RULE-001',
    name: '【TEST】未按规定佩戴安全帽',
    category: '违章作业',
    description: 'TEST 占位行为，非真实三违规则，真实数据待项目负责人提供。',
    applicablePosition: '',
    applicableScope: '',
    enabled: true,
    sortOrder: 1,
    remark: TEST_TAG,
  },
  {
    ruleId: 'TEST-RULE-002',
    name: '【TEST】违规驾驶作业车辆',
    category: '违章作业',
    description: 'TEST 占位行为，非真实三违规则，真实数据待项目负责人提供。',
    applicablePosition: '',
    applicableScope: '',
    enabled: true,
    sortOrder: 2,
    remark: TEST_TAG,
  },
  {
    ruleId: 'TEST-RULE-003',
    name: '【TEST】作业现场未设置警示标志',
    category: '违反劳动纪律',
    description: 'TEST 占位行为，非真实三违规则，真实数据待项目负责人提供。',
    applicablePosition: '',
    applicableScope: '',
    enabled: false,
    sortOrder: 3,
    remark: `${TEST_TAG}（已停用，用于验证「是否启用」过滤）`,
  },
];

/* ------------------------------ 责任区域 ------------------------------ */
export const TEST_AREAS: Area[] = [
  {
    areaCode: 'TEST-AREA-01',
    areaName: 'TEST·甲镇',
    areaTeam: 'TOWNSHIP',
    parentCode: '',
    managerAccountId: 'TEST-ACC-001',
    status: 'ENABLED',
  },
  {
    areaCode: 'TEST-AREA-02',
    areaName: 'TEST·乙镇',
    areaTeam: 'TOWNSHIP',
    parentCode: '',
    managerAccountId: 'TEST-ACC-004',
    status: 'ENABLED',
  },
  {
    areaCode: 'TEST-AREA-WC',
    areaName: 'TEST·环卫作业中心',
    areaTeam: 'WORK_CENTER',
    parentCode: '',
    managerAccountId: '',
    status: 'ENABLED',
  },
  {
    // ⚠️「公司管理」是**历史检查区域/管理分类**，不是普通部门。
    //    乡镇作业中心在组织架构上隶属环卫作业中心，但历史检查区域可以是具体乡镇。
    areaCode: 'TEST-AREA-COMPANY',
    areaName: 'TEST·公司管理',
    areaTeam: 'COMPANY_MANAGEMENT',
    parentCode: '',
    managerAccountId: 'TEST-ACC-002',
    status: 'ENABLED',
  },
];

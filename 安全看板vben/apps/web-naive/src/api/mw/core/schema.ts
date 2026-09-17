/**
 * MOBILE-WPS-V1 · WPS 多维表结构定义（8 张表）
 *
 * 用途：
 * 1. 作为「建表说明书」——下一阶段在 WPS 多维表格里按此建表/建字段；
 * 2. 作为适配层的字段映射事实源——避免字段名散落在页面里；
 * 3. 作为文档生成器的数据源（docs/MOBILE-WPS/WPS-DATA-MODEL.md 由此导出）。
 *
 * ⚠️ 字段类型按 WPS 多维表实际能力标注；若建表时平台不支持某类型，
 *    一律降级为 MultiLineText / SingleLineText，并在映射表注明，不影响业务语义。
 *
 * ⚠️ 本项目使用的 WPS 表是**独立文件**（MW_HSE_V1），
 *    与现有 WPS-PG-SYNC 冻结体系使用的文件**物理隔离**，互不读写。
 */

import type { PhotoType, ViolationStatus } from './types';

/** WPS 字段类型（本项目实际会用到的子集） */
export type WpsFieldType =
  | 'SingleLineText'
  | 'MultiLineText'
  | 'Number'
  | 'SingleSelect'
  | 'DateTime'
  | 'Attachment'
  | 'URL';

export interface FieldDef {
  /** 业务字段名（代码内使用） */
  key: string;
  /** WPS 表列名（建表用，中文） */
  column: string;
  type: WpsFieldType;
  required: boolean;
  /** 唯一键（如手机号、员工ID） */
  unique?: boolean;
  /** 说明 */
  note: string;
}

export interface TableDef {
  /** 代码内表名 */
  name: string;
  /** WPS 数据表中文名 */
  label: string;
  /** 建表说明 */
  purpose: string;
  fields: FieldDef[];
}

/* ------------------------------ T1 账号 ------------------------------ */
const T_ACCOUNT: TableDef = {
  name: 't_account',
  label: '手机端账号表',
  purpose: '手机端登录与身份加载。V1 以手机号作为临时身份识别（非正式安全认证）。',
  fields: [
    { key: 'accountId', column: '账号ID', type: 'SingleLineText', required: true, unique: true, note: '稳定主键' },
    { key: 'name', column: '姓名', type: 'SingleLineText', required: true, note: '' },
    { key: 'phone', column: '手机号', type: 'SingleLineText', required: true, unique: true, note: 'V1 登录键' },
    { key: 'dept', column: '所在部门', type: 'SingleLineText', required: false, note: '组织归属维度' },
    { key: 'position', column: '职位', type: 'SingleLineText', required: false, note: '' },
    { key: 'gridLevel', column: '网格等级', type: 'SingleLineText', required: false, note: '' },
    { key: 'workUnit', column: '作业单元', type: 'SingleLineText', required: false, note: '' },
    { key: 'team', column: '班组', type: 'SingleLineText', required: false, note: '' },
    { key: 'status', column: '状态', type: 'SingleSelect', required: true, note: 'ENABLED/DISABLED' },
    { key: 'role', column: '角色', type: 'SingleSelect', required: true, note: 'TOWNSHIP_MANAGER/COMPANY_ADMIN/INSPECTOR/ADMIN' },
    { key: 'scopeType', column: '检查范围类型', type: 'SingleSelect', required: false, note: 'OWN_TEAM/OWN_UNIT/OWN_TOWNSHIP/ALL' },
    { key: 'scopeValues', column: '检查范围值', type: 'MultiLineText', required: false, note: '逗号分隔：班组名/作业单元名/乡镇代码' },
  ],
};

/* ------------------------------ T2 花名册 ------------------------------ */
const T_ROSTER: TableDef = {
  name: 't_roster',
  label: '花名册',
  purpose: '员工身份主数据。员工ID 为稳定标识；选中后姓名/性别/职位/班组/作业单元/乡镇作为只读快照写入三违记录。',
  fields: [
    { key: 'employeeId', column: '员工ID', type: 'SingleLineText', required: true, unique: true, note: '稳定身份标识，禁止只存姓名' },
    { key: 'name', column: '姓名', type: 'SingleLineText', required: true, note: '' },
    { key: 'gender', column: '性别', type: 'SingleSelect', required: false, note: '' },
    { key: 'phone', column: '手机号', type: 'SingleLineText', required: false, note: '' },
    { key: 'position', column: '职位', type: 'SingleLineText', required: false, note: '' },
    { key: 'dept', column: '部门', type: 'SingleLineText', required: false, note: '组织归属维度' },
    { key: 'workUnit', column: '作业单元', type: 'SingleLineText', required: false, note: '' },
    { key: 'team', column: '班组', type: 'SingleLineText', required: false, note: '' },
    { key: 'township', column: '乡镇', type: 'SingleLineText', required: false, note: '历史检查区域维度' },
    { key: 'status', column: '状态', type: 'SingleSelect', required: true, note: 'ENABLED/DISABLED' },
  ],
};

/* ------------------------------ T3 三违规则 ------------------------------ */
const T_VIOLATION_RULE: TableDef = {
  name: 't_violation_rule',
  label: '三违行为表',
  purpose: '三违行为唯一来源。严禁前端硬编码；NODE-01 无真实数据 ⇒ 空或显式 TEST 占位数据。',
  fields: [
    { key: 'ruleId', column: '规则ID', type: 'SingleLineText', required: true, unique: true, note: '' },
    { key: 'name', column: '三违名称', type: 'SingleLineText', required: true, note: '' },
    { key: 'category', column: '三违分类', type: 'SingleSelect', required: false, note: '违章作业/违章指挥/违反劳动纪律等' },
    { key: 'description', column: '行为描述', type: 'MultiLineText', required: false, note: '' },
    { key: 'applicablePosition', column: '适用岗位', type: 'MultiLineText', required: false, note: '空=不限' },
    { key: 'applicableScope', column: '适用范围', type: 'MultiLineText', required: false, note: '空=不限' },
    { key: 'enabled', column: '是否启用', type: 'SingleSelect', required: true, note: 'TRUE/FALSE' },
    { key: 'sortOrder', column: '排序', type: 'Number', required: false, note: '' },
    { key: 'remark', column: '备注', type: 'MultiLineText', required: false, note: '' },
  ],
};

/* ------------------------------ T4 责任区域 ------------------------------ */
const T_AREA: TableDef = {
  name: 't_area',
  label: '责任区域目录',
  purpose:
    '责任乡镇/作业中心/公司管理 目录。⚠️「公司管理」是历史检查区域分类，不是部门；组织归属与本表是两个正交维度。本表只表达历史检查区域维度。',
  fields: [
    { key: 'areaCode', column: '区域代码', type: 'SingleLineText', required: true, unique: true, note: '' },
    { key: 'areaName', column: '区域名称', type: 'SingleLineText', required: true, note: '' },
    { key: 'areaTeam', column: '区域性质', type: 'SingleSelect', required: true, note: 'TOWNSHIP/WORK_CENTER/COMPANY_MANAGEMENT' },
    { key: 'parentCode', column: '上级区域代码', type: 'SingleLineText', required: false, note: '' },
    { key: 'managerAccountId', column: '责任管理员账号ID', type: 'SingleLineText', required: false, note: '转派时的默认责任人' },
    { key: 'status', column: '状态', type: 'SingleSelect', required: true, note: 'ENABLED/DISABLED' },
  ],
};

/* ------------------------------ T5 三违记录 ------------------------------ */
const T_VIOLATION_RECORD: TableDef = {
  name: 't_violation_record',
  label: '三违记录主表',
  purpose:
    '业务链主线。一次事件=一个三违记录ID；照片/人员/行为/整改/转派/复查全部挂在该 ID 上。V1 不做任何扣分计算。',
  fields: [
    { key: 'violationId', column: '三违记录ID', type: 'SingleLineText', required: true, unique: true, note: '业务主键，如 SW-20260915-0001' },
    { key: 'status', column: '整改状态', type: 'SingleSelect', required: true, note: 'DRAFT/PENDING_RECTIFY/RECTIFYING/PENDING_REVIEW/COMPLETED/TRANSFERRED' },
    { key: 'discoverAccountId', column: '发现人账号ID', type: 'SingleLineText', required: true, note: '' },
    { key: 'discoverName', column: '发现人姓名', type: 'SingleLineText', required: true, note: '只读快照' },
    { key: 'discoveredAt', column: '发现时间', type: 'DateTime', required: true, note: '' },
    { key: 'location', column: '发现地点', type: 'SingleLineText', required: true, note: '' },
    { key: 'discoverAreaCode', column: '检查区域分类', type: 'SingleLineText', required: false, note: '历史检查区域维度，可为「公司管理」' },
    { key: 'violatorEmployeeId', column: '违章人员员工ID', type: 'SingleLineText', required: false, note: '稳定标识' },
    { key: 'violatorName', column: '违章人员姓名', type: 'SingleLineText', required: false, note: '只读快照' },
    { key: 'violatorGender', column: '违章人员性别', type: 'SingleLineText', required: false, note: '只读快照' },
    { key: 'violatorPosition', column: '违章人员职位', type: 'SingleLineText', required: false, note: '只读快照' },
    { key: 'violatorTeam', column: '违章人员班组', type: 'SingleLineText', required: false, note: '只读快照' },
    { key: 'violatorWorkUnit', column: '违章人员作业单元', type: 'SingleLineText', required: false, note: '只读快照' },
    { key: 'violatorTownship', column: '违章人员乡镇', type: 'SingleLineText', required: false, note: '只读快照' },
    { key: 'ruleId', column: '三违规则ID', type: 'SingleLineText', required: false, note: '' },
    { key: 'ruleName', column: '三违名称', type: 'SingleLineText', required: false, note: '只读快照' },
    { key: 'ruleCategory', column: '三违分类', type: 'SingleLineText', required: false, note: '只读快照' },
    { key: 'rectifyAccountId', column: '整改责任人账号ID', type: 'SingleLineText', required: false, note: '发现人 ≠ 整改人' },
    { key: 'rectifyName', column: '整改责任人姓名', type: 'SingleLineText', required: false, note: '' },
    { key: 'measure', column: '整改措施', type: 'MultiLineText', required: false, note: '' },
    { key: 'rectifiedAt', column: '整改时间', type: 'DateTime', required: false, note: '' },
    { key: 'reviewAccountId', column: '复查人账号ID', type: 'SingleLineText', required: false, note: '' },
    { key: 'reviewName', column: '复查人姓名', type: 'SingleLineText', required: false, note: '' },
    { key: 'reviewedAt', column: '复查时间', type: 'DateTime', required: false, note: '' },
    { key: 'reviewResult', column: '复查结论', type: 'SingleSelect', required: false, note: 'PASS/REJECT' },
    { key: 'reviewNote', column: '复查意见', type: 'MultiLineText', required: false, note: '' },
    { key: 'responsibleAreaCode', column: '责任区域代码', type: 'SingleLineText', required: false, note: '' },
    { key: 'transferId', column: '当前转派单号', type: 'SingleLineText', required: false, note: '' },
    { key: 'createdAt', column: '创建时间', type: 'DateTime', required: true, note: '' },
    { key: 'updatedAt', column: '更新时间', type: 'DateTime', required: true, note: '' },
  ],
};

/* ------------------------------ T6 照片 ------------------------------ */
const T_PHOTO: TableDef = {
  name: 't_photo',
  label: '照片表',
  purpose:
    '现场照片(BEFORE) 与 整改后照片(AFTER)。必须绑定三违记录ID，不允许停留在浏览器内存。⚠️ WPS 原生附件无公网直链，链接镜像列(URL 文本)为 v1 折中方案。',
  fields: [
    { key: 'photoId', column: '照片ID', type: 'SingleLineText', required: true, unique: true, note: '' },
    { key: 'violationId', column: '三违记录ID', type: 'SingleLineText', required: true, note: '强绑定' },
    { key: 'photoType', column: '照片类型', type: 'SingleSelect', required: true, note: 'BEFORE/AFTER' },
    { key: 'storageRef', column: '存储引用', type: 'SingleLineText', required: true, note: '本地键 / WPS uploadId / 对象存储 key' },
    { key: 'url', column: '可访问地址', type: 'URL', required: false, note: '可空：WPS 原生附件可能换不出直链' },
    { key: 'fileName', column: '文件名', type: 'SingleLineText', required: false, note: '' },
    { key: 'uploadedAt', column: '上传时间', type: 'DateTime', required: true, note: '' },
    { key: 'uploadedByAccountId', column: '上传人账号ID', type: 'SingleLineText', required: true, note: '' },
  ],
};

/* ------------------------------ T7 转派 ------------------------------ */
const T_TRANSFER: TableDef = {
  name: 't_transfer',
  label: '转派表',
  purpose:
    '公司管理人员转派给责任乡镇/管理员。责任人必须「选区域 → 读人员 → 选管理员」，禁止自由文本。发现人 ≠ 整改人。',
  fields: [
    { key: 'transferId', column: '转派单号', type: 'SingleLineText', required: true, unique: true, note: '' },
    { key: 'violationId', column: '三违记录ID', type: 'SingleLineText', required: true, note: '' },
    { key: 'fromAccountId', column: '发起人账号ID', type: 'SingleLineText', required: true, note: '发现人' },
    { key: 'fromName', column: '发起人姓名', type: 'SingleLineText', required: true, note: '' },
    { key: 'toAreaCode', column: '责任区域代码', type: 'SingleLineText', required: true, note: '' },
    { key: 'toAreaName', column: '责任区域名称', type: 'SingleLineText', required: true, note: '' },
    { key: 'toAccountId', column: '责任管理员账号ID', type: 'SingleLineText', required: true, note: '' },
    { key: 'toName', column: '责任管理员姓名', type: 'SingleLineText', required: true, note: '' },
    { key: 'status', column: '转派状态', type: 'SingleSelect', required: true, note: 'PENDING/ACCEPTED/FEEDBACK/CLOSED' },
    { key: 'remark', column: '转派说明', type: 'MultiLineText', required: false, note: '' },
    { key: 'transferredAt', column: '转派时间', type: 'DateTime', required: true, note: '' },
    { key: 'feedbackAt', column: '反馈时间', type: 'DateTime', required: false, note: '' },
    { key: 'feedbackNote', column: '反馈说明', type: 'MultiLineText', required: false, note: '' },
  ],
};

/* ------------------------------ T8 复查 ------------------------------ */
const T_REVIEW: TableDef = {
  name: 't_review',
  label: '复查表',
  purpose: '复查记录。一次整改可有多轮复查（不通过→继续整改）。',
  fields: [
    { key: 'reviewId', column: '复查ID', type: 'SingleLineText', required: true, unique: true, note: '' },
    { key: 'violationId', column: '三违记录ID', type: 'SingleLineText', required: true, note: '' },
    { key: 'reviewerAccountId', column: '复查人账号ID', type: 'SingleLineText', required: true, note: '' },
    { key: 'reviewerName', column: '复查人姓名', type: 'SingleLineText', required: true, note: '' },
    { key: 'result', column: '复查结论', type: 'SingleSelect', required: true, note: 'PASS/REJECT' },
    { key: 'note', column: '复查意见', type: 'MultiLineText', required: false, note: '' },
    { key: 'reviewedAt', column: '复查时间', type: 'DateTime', required: true, note: '' },
  ],
};

/** 全部表定义（顺序即建表建议顺序） */
export const MW_TABLES: TableDef[] = [
  T_ACCOUNT,
  T_ROSTER,
  T_VIOLATION_RULE,
  T_AREA,
  T_VIOLATION_RECORD,
  T_PHOTO,
  T_TRANSFER,
  T_REVIEW,
];

export const TABLE_MAP: Record<string, TableDef> = MW_TABLES.reduce<
  Record<string, TableDef>
>((acc, t) => {
  acc[t.name] = t;
  return acc;
}, {});

/* ---------------------------- 枚举值（建表用） ---------------------------- */

export const ENUM_VALUES = {
  status: ['ENABLED', 'DISABLED'],
  role: ['TOWNSHIP_MANAGER', 'COMPANY_ADMIN', 'INSPECTOR', 'ADMIN'],
  scopeType: ['OWN_TEAM', 'OWN_UNIT', 'OWN_TOWNSHIP', 'ALL'],
  areaTeam: ['TOWNSHIP', 'WORK_CENTER', 'COMPANY_MANAGEMENT'],
  violationStatus: [
    'DRAFT',
    'PENDING_RECTIFY',
    'RECTIFYING',
    'PENDING_REVIEW',
    'COMPLETED',
    'TRANSFERRED',
  ] satisfies ViolationStatus[],
  photoType: ['BEFORE', 'AFTER'] satisfies PhotoType[],
  transferStatus: ['PENDING', 'ACCEPTED', 'FEEDBACK', 'CLOSED'],
  reviewResult: ['PASS', 'REJECT'],
} as const;

/**
 * MOBILE-WPS-V1 · 数据模型类型定义（唯一事实源）
 *
 * 边界声明（务必遵守）：
 * 1. 本文件是**业务数据模型**，不是 WPS API 结构。WPS 侧的行 ID / 附件对象 / 字段 ID
 *    一律由适配层（transports/*）消化，不在业务层出现。
 * 2. 严禁在此硬编码任何真实人员、班组、乡镇、三违行为、扣分规则。
 *    真实数据一律来自 WPS 表（NODE-01 阶段为空或显式 TEST 占位数据）。
 * 3. 本文件零 Vue / 零 DOM 依赖，可被 Node 环境单测直接引用。
 */

/* ============================ 通用 ============================ */

/** 启用/停用 */
export type EnableStatus = 'ENABLED' | 'DISABLED';

/**
 * 检查范围类型（决定「登录人能看到哪些花名册人员」）。
 * 服务端/适配层按此求交集，前端不做「姓名猜 ID」。
 */
export type ScopeType =
  /** 仅本班组 */
  | 'OWN_TEAM'
  /** 仅本作业单元 */
  | 'OWN_UNIT'
  /** 仅本乡镇（历史检查区域） */
  | 'OWN_TOWNSHIP'
  /** 全公司（公司管理人员） */
  | 'ALL';

/** 检查范围：类型 + 值（值为空表示不限） */
export interface Scope {
  type: ScopeType;
  /** 允许的取值集合：班组名 / 作业单元名 / 乡镇代码 */
  values: string[];
}

/* ==================== T1 手机端账号表 t_account ==================== */

/**
 * 手机端账号（V1）。
 *
 * 注意：V1 以「手机号」作为**临时身份识别方式**，
 * 它**不等同于正式安全认证**（无短信验证码、无企业身份、无 JWT 强校验）。
 * 升级路径：手机号 → 手机号+短信 → 企业微信/钉钉/企业身份体系。
 */
export interface MobileAccount {
  /** 账号ID（稳定主键） */
  accountId: string;
  /** 姓名 */
  name: string;
  /** 手机号（V1 登录键） */
  phone: string;
  /** 所在部门（组织归属维度） */
  dept: string;
  /** 职位 */
  position: string;
  /** 网格等级 */
  gridLevel: string;
  /** 作业单元 */
  workUnit: string;
  /** 班组 */
  team: string;
  /** 状态 */
  status: EnableStatus;
  /**
   * 角色：
   * - TOWNSHIP_MANAGER 乡镇作业中心经理
   * - COMPANY_ADMIN    公司管理人员
   * - INSPECTOR        巡查员
   * - ADMIN            系统管理员
   */
  role: 'TOWNSHIP_MANAGER' | 'COMPANY_ADMIN' | 'INSPECTOR' | 'ADMIN';
  /** 可选范围：选人时的候选池过滤依据 */
  scope: Scope;
}

/* ==================== T2 花名册 t_roster ==================== */

/**
 * 花名册。
 *
 * 关键：**员工ID 是唯一稳定身份标识**，姓名不是。
 * 选中员工后带出的姓名/性别/职位/班组/作业单元/乡镇均为**只读身份快照**。
 */
export interface RosterEmployee {
  /** 员工ID（稳定身份标识） */
  employeeId: string;
  name: string;
  gender: string;
  phone: string;
  position: string;
  /** 部门：组织归属维度 */
  dept: string;
  /** 作业单元 */
  workUnit: string;
  /** 班组 */
  team: string;
  /** 乡镇（历史检查区域，可空） */
  township: string;
  status: EnableStatus;
}

/* ==================== T3 三违行为规则 t_violation_rule ==================== */

/**
 * 三违行为规则。
 *
 * 严禁在前端写 `const violations = ['不戴安全帽', ...]`。
 * 规则 100% 来自本表；NODE-01 无真实数据 ⇒ 空数组或显式 TEST 占位数据。
 */
export interface ViolationRule {
  ruleId: string;
  /** 三违名称 */
  name: string;
  /** 三违分类（如 违章作业/违章指挥/违反劳动纪律） */
  category: string;
  /** 行为描述 */
  description: string;
  /** 适用岗位（可空=不限） */
  applicablePosition: string;
  /** 适用范围（可空=不限） */
  applicableScope: string;
  enabled: boolean;
  sortOrder: number;
  remark: string;
}

/* ==================== T4 责任区域目录 t_area ==================== */

/**
 * 责任区域 / 乡镇目录。
 *
 * ⚠️ 业务含义硬约束：
 * `areaTeam = 公司管理` **不是一个普通部门**，它是「历史检查区域 / 管理分类」，
 * 可覆盖公司总经理、各部门人员、环卫作业中心经理/副经理、市政绿化管理人员等。
 * 乡镇作业中心在**组织架构**上隶属于环卫作业中心，但**历史检查区域**可以是具体乡镇。
 * ⇒ 「组织归属」与「历史检查区域」是两个正交维度，本表只表达后者。
 */
export interface Area {
  areaCode: string;
  areaName: string;
  /**
   * 区域性质：
   * - TOWNSHIP           具体乡镇
   * - WORK_CENTER        作业中心
   * - COMPANY_MANAGEMENT 公司管理（历史检查区域分类，非部门）
   */
  areaTeam: 'TOWNSHIP' | 'WORK_CENTER' | 'COMPANY_MANAGEMENT';
  /** 上级区域代码（可空） */
  parentCode: string;
  /** 该区域的默认责任管理员账号ID（可空，转派时动态读取） */
  managerAccountId: string;
  status: EnableStatus;
}

/* ==================== T5 三违记录主表 t_violation_record ==================== */

/** 整改状态（可扩展；V1 六态） */
export type ViolationStatus =
  /** 待补充：已生成三违记录ID，尚未选齐人员/行为 */
  | 'DRAFT'
  /** 待整改：人员与行为已定，尚未整改（记录不可删除） */
  | 'PENDING_RECTIFY'
  /** 整改中 */
  | 'RECTIFYING'
  /** 待复查：已提交整改，等待复查 */
  | 'PENDING_REVIEW'
  /** 已完成 */
  | 'COMPLETED'
  /** 已转派：等待责任乡镇/管理员接收与整改 */
  | 'TRANSFERRED';

export const VIOLATION_STATUS_LABEL: Record<ViolationStatus, string> = {
  DRAFT: '待补充',
  PENDING_RECTIFY: '待整改',
  RECTIFYING: '整改中',
  PENDING_REVIEW: '待复查',
  COMPLETED: '已完成',
  TRANSFERRED: '已转派',
};

/** 违章人员身份快照（选中即固化，只读，不随花名册变更而追溯改写） */
export interface ViolatorSnapshot {
  employeeId: string;
  name: string;
  gender: string;
  position: string;
  team: string;
  workUnit: string;
  township: string;
}

/** 三违行为快照 */
export interface RuleSnapshot {
  ruleId: string;
  name: string;
  category: string;
}

/**
 * 三违记录 —— 整条业务链的主线。
 *
 * 一次事件 = 一个 violationId。现场照片 / 违章人员 / 违章行为 / 发现人 /
 * 发现时间 / 发现地点 / 整改责任人 / 责任区域 / 整改措施 / 整改后照片 /
 * 整改时间 / 转派记录 / 反馈 / 复查，全部挂在这个 ID 上。
 *
 * ⚠️ V1 不做任何扣分计算。E-08-11 正式扣分逻辑在正式 HSE 后端，本项目不复制。
 */
export interface ViolationRecord {
  /** 三违记录ID（业务主键，全局唯一，形如 SW-20260915-0001） */
  violationId: string;
  /** 适配层内部行标识（WPS record id / 本地 uuid），禁止用于业务语义 */
  rowId: string;

  status: ViolationStatus;

  /* ---- 发现侧 ---- */
  /** 发现人账号ID */
  discoverAccountId: string;
  /** 发现人姓名（快照，只读） */
  discoverName: string;
  /** 发现时间 ISO */
  discoveredAt: string;
  /** 发现地点 */
  location: string;
  /**
   * 发现时的检查区域分类（历史检查区域维度）。
   * 可为「公司管理」——它不是部门。
   */
  discoverAreaCode: string;

  /* ---- 违章侧 ---- */
  violator: ViolatorSnapshot | null;
  rule: RuleSnapshot | null;

  /* ---- 整改侧（发现人 ≠ 整改人） ---- */
  /** 整改责任人账号ID */
  rectifyAccountId: string;
  /** 整改责任人姓名 */
  rectifyName: string;
  /** 整改措施 */
  measure: string;
  /** 整改完成时间 ISO */
  rectifiedAt: string;

  /* ---- 复查侧 ---- */
  reviewAccountId: string;
  reviewName: string;
  reviewedAt: string;
  /** 复查结论：PASS 通过 / REJECT 不通过 / 空=未复查 */
  reviewResult: '' | 'PASS' | 'REJECT';
  reviewNote: string;

  /* ---- 转派侧（冗余快照，便于列表展示，权威在 t_transfer） ---- */
  /** 责任区域代码 */
  responsibleAreaCode: string;
  /** 当前转派单号（可空） */
  transferId: string;

  createdAt: string;
  updatedAt: string;
}

/* ==================== T6 照片表 t_photo ==================== */

/**
 * 照片类型。
 * BEFORE = 现场发现照片（**必须存在**，且是整个流程第一步）；
 * AFTER  = 整改后照片（整改完成时必须存在）。
 */
export type PhotoType = 'BEFORE' | 'AFTER';

/**
 * 照片记录。
 *
 * ⚠️ 照片**必须绑定 violationId**，不允许停留在浏览器内存/组件状态里。
 * `storageRef` 是适配层内部存储引用（本地键 / WPS uploadId / 对象存储 key），
 * `url` 是可渲染地址（WPS 原生附件没有公网直链，可能为空 ⇒ 见报告风险章节）。
 */
export interface PhotoRecord {
  photoId: string;
  violationId: string;
  photoType: PhotoType;
  /** 适配层内部引用 */
  storageRef: string;
  /** 可渲染地址（可空） */
  url: string;
  /** 文件名 */
  fileName: string;
  uploadedAt: string;
  /**上传人账号ID */
  uploadedByAccountId: string;
}

/* ==================== T7 转派表 t_transfer ==================== */

/**
 * 转派单。
 *
 * 公司管理人员发现问题后，可转派给责任乡镇/管理员。
 * 硬约束：**发现人 ≠ 整改人**。不能因为公司管理人员发现了问题就自动认为其负责整改。
 * 责任人**不允许自由文本填写**，必须：选择责任区域 → 读取该区域人员 → 选择管理员。
 */
export interface TransferRecord {
  transferId: string;
  violationId: string;
  /** 发起人账号ID（发现人） */
  fromAccountId: string;
  fromName: string;
  /** 责任区域代码（必选） */
  toAreaCode: string;
  toAreaName: string;
  /** 责任管理员账号ID（必选） */
  toAccountId: string;
  toName: string;
  /**
   * 状态：
   * PENDING  待接收
   * ACCEPTED 已接收（整改中）
   * FEEDBACK 已反馈（整改完成，待发起人确认）
   * CLOSED   已关闭（发起人确认完成）
   */
  status: 'PENDING' | 'ACCEPTED' | 'FEEDBACK' | 'CLOSED';
  remark: string;
  transferredAt: string;
  /** 整改人反馈（AFTER 照片提交后写入） */
  feedbackAt: string;
  feedbackNote: string;
}

/* ==================== T8 复查表 t_review ==================== */

export interface ReviewRecord {
  reviewId: string;
  violationId: string;
  reviewerAccountId: string;
  reviewerName: string;
  result: 'PASS' | 'REJECT';
  note: string;
  reviewedAt: string;
}

/* ==================== 复合视图 ==================== */

/** 记录 + 关联照片 + 关联转派（详情页/列表页使用） */
export interface ViolationBundle {
  record: ViolationRecord;
  photos: PhotoRecord[];
  transfers: TransferRecord[];
  reviews: ReviewRecord[];
}

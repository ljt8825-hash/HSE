# MOBILE-WPS-V1 · WPS 数据模型（8 张表）

> 本文件是**建表说明书 + 字段映射事实源**。
> 代码内事实源：`安全看板vben/apps/web-naive/src/api/mw/core/schema.ts`（`MW_TABLES`）。
> 两者冲突时以 `schema.ts` 为准，本文件由它导出。

## 0. 通用约定

1. **独立文件**：本项目使用独立的 WPS 多维表格文件（代号 `MW_HSE_V1`），与现有 WPS-PG-SYNC 冻结体系的文件**物理隔离、互不读写**。
2. **字段类型降级**：若建表时平台不支持某类型，一律降级为 `MultiLineText` / `SingleLineText`，并在映射表注明。降级不影响业务语义。
3. **`SingleSelect` 的取值**必须先在表里配好选项，否则写入会失败。
4. **Record ID ≠ 业务 ID**：WPS 生成的 Record ID 是内部行标识，业务一律使用本文件的业务主键（如 `violationId`）。
5. **快照字段只读**：凡标注「只读快照」的字段，写入后不再随主数据变更而改写。

### 状态枚举（建表时必须先配好 SingleSelect 选项）

| 表 · 字段 | 取值 |
|---|---|
| `t_account.状态` / `t_roster.状态` / `t_area.状态` | `ENABLED` / `DISABLED` |
| `t_account.角色` | `TOWNSHIP_MANAGER` / `COMPANY_ADMIN` / `INSPECTOR` / `ADMIN` |
| `t_account.检查范围类型` | `OWN_TEAM` / `OWN_UNIT` / `OWN_TOWNSHIP` / `ALL` |
| `t_area.区域性质` | `TOWNSHIP` / `WORK_CENTER` / `COMPANY_MANAGEMENT` |
| `t_violation_rule.是否启用` | `TRUE` / `FALSE` |
| `t_violation_record.整改状态` | `DRAFT` / `PENDING_RECTIFY` / `RECTIFYING` / `PENDING_REVIEW` / `COMPLETED` / `TRANSFERRED` |
| `t_violation_record.复查结论` | `PASS` / `REJECT` |
| `t_photo.照片类型` | `BEFORE` / `AFTER` |
| `t_transfer.转派状态` | `PENDING` / `ACCEPTED` / `FEEDBACK` / `CLOSED` |
| `t_review.复查结论` | `PASS` / `REJECT` |

---

## T1 手机端账号表 · `t_account`

用途：手机端登录与身份加载。V1 以手机号作为**临时身份识别**（非正式安全认证）。

| 代码字段 | WPS 列名 | 类型 | 必填 | 唯一 | 说明 |
|---|---|---|---|---|---|
| `accountId` | 账号ID | SingleLineText | ✅ | ✅ | 稳定主键 |
| `name` | 姓名 | SingleLineText | ✅ | | |
| `phone` | 手机号 | SingleLineText | ✅ | ✅ | V1 登录键 |
| `dept` | 所在部门 | SingleLineText | | | **组织归属维度** |
| `position` | 职位 | SingleLineText | | | |
| `gridLevel` | 网格等级 | SingleLineText | | | |
| `workUnit` | 作业单元 | SingleLineText | | | |
| `team` | 班组 | SingleLineText | | | |
| `status` | 状态 | SingleSelect | ✅ | | ENABLED / DISABLED |
| `role` | 角色 | SingleSelect | ✅ | | 见枚举表 |
| `scopeType` | 检查范围类型 | SingleSelect | | | 决定选人候选池 |
| `scopeValues` | 检查范围值 | MultiLineText | | | 逗号分隔：班组名 / 作业单元名 / 乡镇代码 |

> ⚠️ `scopeType + scopeValues` 是「登录人能看到哪些花名册人员」的唯一依据。**禁止**前端加载全表名单后自行筛选。

---

## T2 花名册 · `t_roster`

用途：员工身份主数据。**员工ID 是唯一稳定身份标识，姓名不是。**

| 代码字段 | WPS 列名 | 类型 | 必填 | 唯一 | 说明 |
|---|---|---|---|---|---|
| `employeeId` | 员工ID | SingleLineText | ✅ | ✅ | 稳定身份标识，禁止只存姓名 |
| `name` | 姓名 | SingleLineText | ✅ | | |
| `gender` | 性别 | SingleSelect | | | |
| `phone` | 手机号 | SingleLineText | | | |
| `position` | 职位 | SingleLineText | | | |
| `dept` | 部门 | SingleLineText | | | 组织归属维度 |
| `workUnit` | 作业单元 | SingleLineText | | | |
| `team` | 班组 | SingleLineText | | | |
| `township` | 乡镇 | SingleLineText | | | **历史检查区域维度** |
| `status` | 状态 | SingleSelect | ✅ | | ENABLED / DISABLED |

> 选中员工后带出的姓名/性别/职位/班组/作业单元/乡镇，作为**只读快照**写入 `t_violation_record`，不随花名册变更而追溯改写。

---

## T3 三违行为表 · `t_violation_rule`

用途：三违行为的**唯一来源**。严禁在前端写 `const violations = [...]`。

| 代码字段 | WPS 列名 | 类型 | 必填 | 唯一 | 说明 |
|---|---|---|---|---|---|
| `ruleId` | 规则ID | SingleLineText | ✅ | ✅ | |
| `name` | 三违名称 | SingleLineText | ✅ | | |
| `category` | 三违分类 | SingleSelect | | | 违章作业 / 违章指挥 / 违反劳动纪律 等 |
| `description` | 行为描述 | MultiLineText | | | |
| `applicablePosition` | 适用岗位 | MultiLineText | | | 空 = 不限 |
| `applicableScope` | 适用范围 | MultiLineText | | | 空 = 不限 |
| `enabled` | 是否启用 | SingleSelect | ✅ | | TRUE / FALSE |
| `sortOrder` | 排序 | Number | | | |
| `remark` | 备注 | MultiLineText | | | |

> **NODE-01 状态**：本表为空（或仅显式 `TEST-` 占位数据）。**未伪造任何正式三违规则。** 真实数据由项目负责人在 NODE-02 提供。

---

## T4 责任区域目录 · `t_area`

用途：责任乡镇 / 作业中心 / 公司管理 的目录。

> ⚠️ **「公司管理」是历史检查区域分类，不是部门。**
> 它可覆盖公司总经理、各部门人员、环卫作业中心经理/副经理、市政绿化管理人员等。
> 乡镇作业中心在**组织架构**上隶属环卫作业中心，但**历史检查区域**可以是具体乡镇。
> ⇒ 「组织归属」（`dept`）与「历史检查区域」（本表）是两个**正交维度**，本表只表达后者。

| 代码字段 | WPS 列名 | 类型 | 必填 | 唯一 | 说明 |
|---|---|---|---|---|---|
| `areaCode` | 区域代码 | SingleLineText | ✅ | ✅ | |
| `areaName` | 区域名称 | SingleLineText | ✅ | | |
| `areaTeam` | 区域性质 | SingleSelect | ✅ | | TOWNSHIP / WORK_CENTER / COMPANY_MANAGEMENT |
| `parentCode` | 上级区域代码 | SingleLineText | | | |
| `managerAccountId` | 责任管理员账号ID | SingleLineText | | | 转派时的默认责任人 |
| `status` | 状态 | SingleSelect | ✅ | | ENABLED / DISABLED |

---

## T5 三违记录主表 · `t_violation_record`

用途：**业务链主线**。一次事件 = 一个 `violationId`；照片 / 人员 / 行为 / 整改 / 转派 / 复查全部挂在该 ID 上。

> ⚠️ **V1 不做任何扣分计算。** 表内不存在任何分数字段，也未复制正式 E-08-11 扣分逻辑。

| 代码字段 | WPS 列名 | 类型 | 必填 | 唯一 | 说明 |
|---|---|---|---|---|---|
| `violationId` | 三违记录ID | SingleLineText | ✅ | ✅ | 业务主键，如 `SW-20260915-0001` |
| `status` | 整改状态 | SingleSelect | ✅ | | 六态，见枚举表 |
| `discoverAccountId` | 发现人账号ID | SingleLineText | ✅ | | |
| `discoverName` | 发现人姓名 | SingleLineText | ✅ | | 只读快照 |
| `discoveredAt` | 发现时间 | DateTime | ✅ | | |
| `location` | 发现地点 | SingleLineText | ✅ | | |
| `discoverAreaCode` | 检查区域分类 | SingleLineText | | | 历史检查区域维度，可为「公司管理」 |
| `violatorEmployeeId` | 违章人员员工ID | SingleLineText | | | 稳定标识 |
| `violatorName` | 违章人员姓名 | SingleLineText | | | 只读快照 |
| `violatorGender` | 违章人员性别 | SingleLineText | | | 只读快照 |
| `violatorPosition` | 违章人员职位 | SingleLineText | | | 只读快照 |
| `violatorTeam` | 违章人员班组 | SingleLineText | | | 只读快照 |
| `violatorWorkUnit` | 违章人员作业单元 | SingleLineText | | | 只读快照 |
| `violatorTownship` | 违章人员乡镇 | SingleLineText | | | 只读快照 |
| `ruleId` | 三违规则ID | SingleLineText | | | |
| `ruleName` | 三违名称 | SingleLineText | | | 只读快照 |
| `ruleCategory` | 三违分类 | SingleLineText | | | 只读快照 |
| `rectifyAccountId` | 整改责任人账号ID | SingleLineText | | | **发现人 ≠ 整改人** |
| `rectifyName` | 整改责任人姓名 | SingleLineText | | | |
| `measure` | 整改措施 | MultiLineText | | | |
| `rectifiedAt` | 整改时间 | DateTime | | | |
| `reviewAccountId` | 复查人账号ID | SingleLineText | | | |
| `reviewName` | 复查人姓名 | SingleLineText | | | |
| `reviewedAt` | 复查时间 | DateTime | | | |
| `reviewResult` | 复查结论 | SingleSelect | | | PASS / REJECT |
| `reviewNote` | 复查意见 | MultiLineText | | | |
| `responsibleAreaCode` | 责任区域代码 | SingleLineText | | | |
| `transferId` | 当前转派单号 | SingleLineText | | | 冗余快照，权威在 T7 |
| `createdAt` | 创建时间 | DateTime | ✅ | | |
| `updatedAt` | 更新时间 | DateTime | ✅ | | |

> **记录永不删除**：任何状态下只做状态流转，不提供删除能力。

---

## T6 照片表 · `t_photo`

用途：现场照片（`BEFORE`）与整改后照片（`AFTER`）。**必须绑定三违记录ID**，不允许停留在浏览器内存。

| 代码字段 | WPS 列名 | 类型 | 必填 | 唯一 | 说明 |
|---|---|---|---|---|---|
| `photoId` | 照片ID | SingleLineText | ✅ | ✅ | |
| `violationId` | 三违记录ID | SingleLineText | ✅ | | 强绑定 |
| `photoType` | 照片类型 | SingleSelect | ✅ | | BEFORE / AFTER |
| `storageRef` | 存储引用 | SingleLineText | ✅ | | 本地键 / WPS uploadId / 对象存储 key |
| `url` | 可访问地址 | URL | | | **可空**：WPS 原生附件可能换不出直链 |
| `fileName` | 文件名 | SingleLineText | | | |
| `uploadedAt` | 上传时间 | DateTime | ✅ | | |
| `uploadedByAccountId` | 上传人账号ID | SingleLineText | ✅ | | |

> ⚠️ **WPS 附件二段式写入**：① 上传文件 → `upload_id`；② 字段值 = `[{uploadId, fileName, source:"upload_ks3"}]`。
> 原生 Attachment 字段值**不含可直接渲染的 URL**。
> ⇒ 若使用 WPS 原生附件列，`url` 列必然为空，UI 已做优雅降级（显示"附件无直链"）。
> ⇒ **建议**：图片改走中间层对象存储，`url` 列存可访问地址，完全绕开这项未确证能力。

---

## T7 转派表 · `t_transfer`

用途：公司管理人员转派给责任乡镇/管理员。

| 代码字段 | WPS 列名 | 类型 | 必填 | 唯一 | 说明 |
|---|---|---|---|---|---|
| `transferId` | 转派单号 | SingleLineText | ✅ | ✅ | |
| `violationId` | 三违记录ID | SingleLineText | ✅ | | |
| `fromAccountId` | 发起人账号ID | SingleLineText | ✅ | | 发现人 |
| `fromName` | 发起人姓名 | SingleLineText | ✅ | | |
| `toAreaCode` | 责任区域代码 | SingleLineText | ✅ | | |
| `toAreaName` | 责任区域名称 | SingleLineText | ✅ | | |
| `toAccountId` | 责任管理员账号ID | SingleLineText | ✅ | | |
| `toName` | 责任管理员姓名 | SingleLineText | ✅ | | |
| `status` | 转派状态 | SingleSelect | ✅ | | PENDING / ACCEPTED / FEEDBACK / CLOSED |
| `remark` | 转派说明 | MultiLineText | | | |
| `transferredAt` | 转派时间 | DateTime | ✅ | | |
| `feedbackAt` | 反馈时间 | DateTime | | | |
| `feedbackNote` | 反馈说明 | MultiLineText | | | |

> 硬约束：**发现人 ≠ 整改人**。责任人必须「选区域 → 读人员 → 选管理员」，**禁止自由文本填写**。

### 转派状态流转

```
PENDING 待接收 → ACCEPTED 已接收 → FEEDBACK 已反馈（整改提交） → CLOSED 已关闭（复查通过）
```

---

## T8 复查表 · `t_review`

用途：复查记录。一次整改可有多轮复查（不通过 → 继续整改 → 再复查）。

| 代码字段 | WPS 列名 | 类型 | 必填 | 唯一 | 说明 |
|---|---|---|---|---|---|
| `reviewId` | 复查ID | SingleLineText | ✅ | ✅ | |
| `violationId` | 三违记录ID | SingleLineText | ✅ | | |
| `reviewerAccountId` | 复查人账号ID | SingleLineText | ✅ | | |
| `reviewerName` | 复查人姓名 | SingleLineText | ✅ | | |
| `result` | 复查结论 | SingleSelect | ✅ | | PASS / REJECT |
| `note` | 复查意见 | MultiLineText | | | |
| `reviewedAt` | 复查时间 | DateTime | ✅ | | |

---

## 建表建议顺序

```
1. t_account            手机端账号表
2. t_roster             花名册
3. t_violation_rule     三违行为表
4. t_area               责任区域目录
5. t_violation_record   三违记录主表
6. t_photo              照片表
7. t_transfer           转派表
8. t_review             复查表
```

## 数据量与查询提示

WPS `list_by_page` **不支持条件过滤、无单条查询端点**（详见阶段报告第 5 节）。
⇒ 按 `violationId` 取单条需 O(n) 全表扫描。
⇒ 数据量上升到千级以上时，建议在中间层做索引缓存，或直接迁移到 PostgreSQL（适配层已预留接缝）。

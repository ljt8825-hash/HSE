# MOBILE-WPS-V1 · WPS 建表规格与导入模板

> 节点：NODE-02A（建表准备，**未建表、未导入**）
> 生成方式：由 `src/api/mw/core/schema.ts` 自动导出（脚本 `_mw_audit/gen-build-spec.cjs`），
> 与代码字段定义逐字一致，避免手写走样。
> 生成日期：2026-09-15

> 🔴 **本目录下的 CSV 只含表头，不含任何真实业务数据。**
> 真实数据导入属 NODE-02B，且须先解除 D-01…D-04 阻塞。

---

## 建表顺序

```text
1. t_account（手机端账号表）
2. t_roster（花名册）
3. t_violation_rule（三违行为表）
4. t_area（责任区域目录）
5. t_violation_record（三违记录主表）
6. t_photo（照片表）
7. t_transfer（转派表）
8. t_review（复查表）
```

> ⚠️ 建表时**先建齐 SingleSelect 字段的全部选项，再写记录**（契约条款 M-6）。

## 枚举选项清单（建表时必须先建）

- **status**：`ENABLED` / `DISABLED`
- **role**：`TOWNSHIP_MANAGER` / `COMPANY_ADMIN` / `INSPECTOR` / `ADMIN`
- **scopeType**：`OWN_TEAM` / `OWN_UNIT` / `OWN_TOWNSHIP` / `ALL`
- **areaTeam**：`TOWNSHIP` / `WORK_CENTER` / `COMPANY_MANAGEMENT`
- **violationStatus**：`DRAFT` / `PENDING_RECTIFY` / `RECTIFYING` / `PENDING_REVIEW` / `COMPLETED` / `TRANSFERRED`
- **photoType**：`BEFORE` / `AFTER`
- **transferStatus**：`PENDING` / `ACCEPTED` / `FEEDBACK` / `CLOSED`
- **reviewResult**：`PASS` / `REJECT`

---

## t_account · 手机端账号表

> '手机端登录与身份加载。V1 以手机号作为临时身份识别（非正式安全认证）。'

| # | 列名（WPS） | 字段键 | 类型 | 必填 | 唯一 | 枚举选项 | 说明 |
|---:|---|---|---|---|---|---|---|
| 1 | **账号ID** | `accountId` | SingleLineText | ✅ | ✅ | — | 稳定主键 |
| 2 | **姓名** | `name` | SingleLineText | ✅ | — | — |  |
| 3 | **手机号** | `phone` | SingleLineText | ✅ | ✅ | — | V1 登录键 |
| 4 | **所在部门** | `dept` | SingleLineText | — | — | — | 组织归属维度 |
| 5 | **职位** | `position` | SingleLineText | — | — | — |  |
| 6 | **网格等级** | `gridLevel` | SingleLineText | — | — | — |  |
| 7 | **作业单元** | `workUnit` | SingleLineText | — | — | — |  |
| 8 | **班组** | `team` | SingleLineText | — | — | — |  |
| 9 | **状态** | `status` | SingleSelect | ✅ | — | `ENABLED` / `DISABLED` | ENABLED/DISABLED |
| 10 | **角色** | `role` | SingleSelect | ✅ | — | `TOWNSHIP_MANAGER` / `COMPANY_ADMIN` / `INSPECTOR` / `ADMIN` | TOWNSHIP_MANAGER/COMPANY_ADMIN/INSPECTOR/ADMIN |
| 11 | **检查范围类型** | `scopeType` | SingleSelect | — | — | `OWN_TEAM` / `OWN_UNIT` / `OWN_TOWNSHIP` / `ALL` | OWN_TEAM/OWN_UNIT/OWN_TOWNSHIP/ALL |
| 12 | **检查范围值** | `scopeValues` | MultiLineText | — | — | — | 逗号分隔：班组名/作业单元名/乡镇代码 |

**导入模板**：`import-templates/t_account.csv`（仅表头）

```text
账号ID,姓名,手机号,所在部门,职位,网格等级,作业单元,班组,状态,角色,检查范围类型,检查范围值
```

---

## t_roster · 花名册

> '员工身份主数据。员工ID 为稳定标识；选中后姓名/性别/职位/班组/作业单元/乡镇作为只读快照写入三违记录。'

| # | 列名（WPS） | 字段键 | 类型 | 必填 | 唯一 | 枚举选项 | 说明 |
|---:|---|---|---|---|---|---|---|
| 1 | **员工ID** | `employeeId` | SingleLineText | ✅ | ✅ | — | 稳定身份标识，禁止只存姓名 |
| 2 | **姓名** | `name` | SingleLineText | ✅ | — | — |  |
| 3 | **性别** | `gender` | SingleSelect | — | — | — |  |
| 4 | **手机号** | `phone` | SingleLineText | — | — | — |  |
| 5 | **职位** | `position` | SingleLineText | — | — | — |  |
| 6 | **部门** | `dept` | SingleLineText | — | — | — | 组织归属维度 |
| 7 | **作业单元** | `workUnit` | SingleLineText | — | — | — |  |
| 8 | **班组** | `team` | SingleLineText | — | — | — |  |
| 9 | **乡镇** | `township` | SingleLineText | — | — | — | 历史检查区域维度 |
| 10 | **状态** | `status` | SingleSelect | ✅ | — | `ENABLED` / `DISABLED` | ENABLED/DISABLED |

**导入模板**：`import-templates/t_roster.csv`（仅表头）

```text
员工ID,姓名,性别,手机号,职位,部门,作业单元,班组,乡镇,状态
```

---

## t_violation_rule · 三违行为表

> '三违行为唯一来源。严禁前端硬编码；NODE-01 无真实数据 ⇒ 空或显式 TEST 占位数据。'

| # | 列名（WPS） | 字段键 | 类型 | 必填 | 唯一 | 枚举选项 | 说明 |
|---:|---|---|---|---|---|---|---|
| 1 | **规则ID** | `ruleId` | SingleLineText | ✅ | ✅ | — |  |
| 2 | **三违名称** | `name` | SingleLineText | ✅ | — | — |  |
| 3 | **三违分类** | `category` | SingleSelect | — | — | — | 违章作业/违章指挥/违反劳动纪律等 |
| 4 | **行为描述** | `description` | MultiLineText | — | — | — |  |
| 5 | **适用岗位** | `applicablePosition` | MultiLineText | — | — | — | 空=不限 |
| 6 | **适用范围** | `applicableScope` | MultiLineText | — | — | — | 空=不限 |
| 7 | **是否启用** | `enabled` | SingleSelect | ✅ | — | — | TRUE/FALSE |
| 8 | **排序** | `sortOrder` | Number | — | — | — |  |
| 9 | **备注** | `remark` | MultiLineText | — | — | — |  |

**导入模板**：`import-templates/t_violation_rule.csv`（仅表头）

```text
规则ID,三违名称,三违分类,行为描述,适用岗位,适用范围,是否启用,排序,备注
```

---

## t_area · 责任区域目录

> '责任乡镇/作业中心/公司管理 目录。⚠️「公司管理」是历史检查区域分类，不是部门；组织归属与本表是两个正交维度。本表只表达历史检查区域维度。'

| # | 列名（WPS） | 字段键 | 类型 | 必填 | 唯一 | 枚举选项 | 说明 |
|---:|---|---|---|---|---|---|---|
| 1 | **区域代码** | `areaCode` | SingleLineText | ✅ | ✅ | — |  |
| 2 | **区域名称** | `areaName` | SingleLineText | ✅ | — | — |  |
| 3 | **区域性质** | `areaTeam` | SingleSelect | ✅ | — | `TOWNSHIP` / `WORK_CENTER` / `COMPANY_MANAGEMENT` | TOWNSHIP/WORK_CENTER/COMPANY_MANAGEMENT |
| 4 | **上级区域代码** | `parentCode` | SingleLineText | — | — | — |  |
| 5 | **责任管理员账号ID** | `managerAccountId` | SingleLineText | — | — | — | 转派时的默认责任人 |
| 6 | **状态** | `status` | SingleSelect | ✅ | — | `ENABLED` / `DISABLED` | ENABLED/DISABLED |

**导入模板**：`import-templates/t_area.csv`（仅表头）

```text
区域代码,区域名称,区域性质,上级区域代码,责任管理员账号ID,状态
```

---

## t_violation_record · 三违记录主表

> '业务链主线。一次事件=一个三违记录ID；照片/人员/行为/整改/转派/复查全部挂在该 ID 上。V1 不做任何扣分计算。'

| # | 列名（WPS） | 字段键 | 类型 | 必填 | 唯一 | 枚举选项 | 说明 |
|---:|---|---|---|---|---|---|---|
| 1 | **三违记录ID** | `violationId` | SingleLineText | ✅ | ✅ | — | 业务主键，如 SW-20260915-0001 |
| 2 | **整改状态** | `status` | SingleSelect | ✅ | — | `ENABLED` / `DISABLED` | DRAFT/PENDING_RECTIFY/RECTIFYING/PENDING_REVIEW/COMPLETED/TRANSFERRED |
| 3 | **发现人账号ID** | `discoverAccountId` | SingleLineText | ✅ | — | — |  |
| 4 | **发现人姓名** | `discoverName` | SingleLineText | ✅ | — | — | 只读快照 |
| 5 | **发现时间** | `discoveredAt` | DateTime | ✅ | — | — |  |
| 6 | **发现地点** | `location` | SingleLineText | ✅ | — | — |  |
| 7 | **检查区域分类** | `discoverAreaCode` | SingleLineText | — | — | — | 历史检查区域维度，可为「公司管理」 |
| 8 | **违章人员员工ID** | `violatorEmployeeId` | SingleLineText | — | — | — | 稳定标识 |
| 9 | **违章人员姓名** | `violatorName` | SingleLineText | — | — | — | 只读快照 |
| 10 | **违章人员性别** | `violatorGender` | SingleLineText | — | — | — | 只读快照 |
| 11 | **违章人员职位** | `violatorPosition` | SingleLineText | — | — | — | 只读快照 |
| 12 | **违章人员班组** | `violatorTeam` | SingleLineText | — | — | — | 只读快照 |
| 13 | **违章人员作业单元** | `violatorWorkUnit` | SingleLineText | — | — | — | 只读快照 |
| 14 | **违章人员乡镇** | `violatorTownship` | SingleLineText | — | — | — | 只读快照 |
| 15 | **三违规则ID** | `ruleId` | SingleLineText | — | — | — |  |
| 16 | **三违名称** | `ruleName` | SingleLineText | — | — | — | 只读快照 |
| 17 | **三违分类** | `ruleCategory` | SingleLineText | — | — | — | 只读快照 |
| 18 | **整改责任人账号ID** | `rectifyAccountId` | SingleLineText | — | — | — | 发现人 ≠ 整改人 |
| 19 | **整改责任人姓名** | `rectifyName` | SingleLineText | — | — | — |  |
| 20 | **整改措施** | `measure` | MultiLineText | — | — | — |  |
| 21 | **整改时间** | `rectifiedAt` | DateTime | — | — | — |  |
| 22 | **复查人账号ID** | `reviewAccountId` | SingleLineText | — | — | — |  |
| 23 | **复查人姓名** | `reviewName` | SingleLineText | — | — | — |  |
| 24 | **复查时间** | `reviewedAt` | DateTime | — | — | — |  |
| 25 | **复查结论** | `reviewResult` | SingleSelect | — | — | `PASS` / `REJECT` | PASS/REJECT |
| 26 | **复查意见** | `reviewNote` | MultiLineText | — | — | — |  |
| 27 | **责任区域代码** | `responsibleAreaCode` | SingleLineText | — | — | — |  |
| 28 | **当前转派单号** | `transferId` | SingleLineText | — | — | — |  |
| 29 | **创建时间** | `createdAt` | DateTime | ✅ | — | — |  |
| 30 | **更新时间** | `updatedAt` | DateTime | ✅ | — | — |  |

**导入模板**：`import-templates/t_violation_record.csv`（仅表头）

```text
三违记录ID,整改状态,发现人账号ID,发现人姓名,发现时间,发现地点,检查区域分类,违章人员员工ID,违章人员姓名,违章人员性别,违章人员职位,违章人员班组,违章人员作业单元,违章人员乡镇,三违规则ID,三违名称,三违分类,整改责任人账号ID,整改责任人姓名,整改措施,整改时间,复查人账号ID,复查人姓名,复查时间,复查结论,复查意见,责任区域代码,当前转派单号,创建时间,更新时间
```

---

## t_photo · 照片表

> '现场照片(BEFORE) 与 整改后照片(AFTER)。必须绑定三违记录ID，不允许停留在浏览器内存。⚠️ WPS 原生附件无公网直链，链接镜像列(URL 文本)为 v1 折中方案。'

| # | 列名（WPS） | 字段键 | 类型 | 必填 | 唯一 | 枚举选项 | 说明 |
|---:|---|---|---|---|---|---|---|
| 1 | **照片ID** | `photoId` | SingleLineText | ✅ | ✅ | — |  |
| 2 | **三违记录ID** | `violationId` | SingleLineText | ✅ | — | — | 强绑定 |
| 3 | **照片类型** | `photoType` | SingleSelect | ✅ | — | `BEFORE` / `AFTER` | BEFORE/AFTER |
| 4 | **存储引用** | `storageRef` | SingleLineText | ✅ | — | — | 本地键 / WPS uploadId / 对象存储 key |
| 5 | **可访问地址** | `url` | URL | — | — | — | 可空：WPS 原生附件可能换不出直链 |
| 6 | **文件名** | `fileName` | SingleLineText | — | — | — |  |
| 7 | **上传时间** | `uploadedAt` | DateTime | ✅ | — | — |  |
| 8 | **上传人账号ID** | `uploadedByAccountId` | SingleLineText | ✅ | — | — |  |

**导入模板**：`import-templates/t_photo.csv`（仅表头）

```text
照片ID,三违记录ID,照片类型,存储引用,可访问地址,文件名,上传时间,上传人账号ID
```

---

## t_transfer · 转派表

> '公司管理人员转派给责任乡镇/管理员。责任人必须「选区域 → 读人员 → 选管理员」，禁止自由文本。发现人 ≠ 整改人。'

| # | 列名（WPS） | 字段键 | 类型 | 必填 | 唯一 | 枚举选项 | 说明 |
|---:|---|---|---|---|---|---|---|
| 1 | **转派单号** | `transferId` | SingleLineText | ✅ | ✅ | — |  |
| 2 | **三违记录ID** | `violationId` | SingleLineText | ✅ | — | — |  |
| 3 | **发起人账号ID** | `fromAccountId` | SingleLineText | ✅ | — | — | 发现人 |
| 4 | **发起人姓名** | `fromName` | SingleLineText | ✅ | — | — |  |
| 5 | **责任区域代码** | `toAreaCode` | SingleLineText | ✅ | — | — |  |
| 6 | **责任区域名称** | `toAreaName` | SingleLineText | ✅ | — | — |  |
| 7 | **责任管理员账号ID** | `toAccountId` | SingleLineText | ✅ | — | — |  |
| 8 | **责任管理员姓名** | `toName` | SingleLineText | ✅ | — | — |  |
| 9 | **转派状态** | `status` | SingleSelect | ✅ | — | `ENABLED` / `DISABLED` | PENDING/ACCEPTED/FEEDBACK/CLOSED |
| 10 | **转派说明** | `remark` | MultiLineText | — | — | — |  |
| 11 | **转派时间** | `transferredAt` | DateTime | ✅ | — | — |  |
| 12 | **反馈时间** | `feedbackAt` | DateTime | — | — | — |  |
| 13 | **反馈说明** | `feedbackNote` | MultiLineText | — | — | — |  |

**导入模板**：`import-templates/t_transfer.csv`（仅表头）

```text
转派单号,三违记录ID,发起人账号ID,发起人姓名,责任区域代码,责任区域名称,责任管理员账号ID,责任管理员姓名,转派状态,转派说明,转派时间,反馈时间,反馈说明
```

---

## t_review · 复查表

> '复查记录。一次整改可有多轮复查（不通过→继续整改）。'

| # | 列名（WPS） | 字段键 | 类型 | 必填 | 唯一 | 枚举选项 | 说明 |
|---:|---|---|---|---|---|---|---|
| 1 | **复查ID** | `reviewId` | SingleLineText | ✅ | ✅ | — |  |
| 2 | **三违记录ID** | `violationId` | SingleLineText | ✅ | — | — |  |
| 3 | **复查人账号ID** | `reviewerAccountId` | SingleLineText | ✅ | — | — |  |
| 4 | **复查人姓名** | `reviewerName` | SingleLineText | ✅ | — | — |  |
| 5 | **复查结论** | `result` | SingleSelect | ✅ | — | — | PASS/REJECT |
| 6 | **复查意见** | `note` | MultiLineText | — | — | — |  |
| 7 | **复查时间** | `reviewedAt` | DateTime | ✅ | — | — |  |

**导入模板**：`import-templates/t_review.csv`（仅表头）

```text
复查ID,三违记录ID,复查人账号ID,复查人姓名,复查结论,复查意见,复查时间
```

---


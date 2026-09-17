# MOBILE-WPS-V1-NODE-01 · 基础架构与业务骨架 阶段报告

> 项目：WPS 多维表格驱动的无云移动 HSE / 三违巡查应用 V1
> 节点：**MOBILE-WPS-V1-NODE-01（基础架构与业务骨架）**
> 日期：2026-09-15
> 代码根：`G:\hse-dashboard\安全看板vben\apps\web-naive`

---

## 1. 执行摘要

本阶段完成了「手机 → WPS 多维表格」方向的**数据模型、适配层、移动端页面骨架与全链路业务骨架**，并通过 29 条自动化断言验证。

三条最重要的结论：

1. **手机不能直连 WPS**。审计确认 WPS 开放平台 `client_credentials` 是**应用级（租户级）凭证**，下发到浏览器等于交出整表读写权，且 WPS 侧无法按登录用户做行级隔离。因此本项目**没有**把 Token 放进前端，而是设计了「业务门面 → 适配层接口 → 可替换传输层」三层结构，WPS 密钥只可能存在于**未来的轻量中间层**，不在本阶段前端代码里。
2. **NODE-01 跑的是本地 TEST 适配层**。真实花名册与三违行为尚未提供，故所有数据为显式 `TEST-` 前缀的占位数据，不伪造任何正式业务数据。切换到真实 WPS 只需替换一个 Transport 实现，业务门面与页面**零改动**（已由测试 F3 / G1-G3 锁定）。
3. **现有正式系统零影响**。本次改动的 git 变更面为 **4 项新增（untracked）、0 项修改**：未改登录/JWT 体系、未改 WPS-PG-SYNC 冻结架构、未改 E-08-11 扣分逻辑、未改现有 PC 三违业务、未新增任何 npm 依赖、未启动任何云服务器。

阶段判定：**CONDITIONAL_PASS**（理由见第 27 节）。

---

## 2. 修改文件清单

**无。**

本次未修改任何既有文件。经 `git status --porcelain` 逐项核对，变更面只有新增。

---

## 3. 新增文件清单

全部位于 `安全看板vben/apps/web-naive/` 下（除文档外）：

### 3.1 业务内核（`src/api/mw/core/`，零 Vue / 零 DOM 依赖，可 Node 单测）

| 文件 | 职责 |
|---|---|
| `types.ts` | 8 张表的业务数据模型（唯一事实源） |
| `schema.ts` | WPS 建表说明书 + 字段映射事实源（8 表 × 字段定义） |
| `id.ts` | 三违记录ID 生成（`SW-YYYYMMDD-NNNN`）、时间/随机 ID |
| `status.ts` | 六态状态机与合法流转图 |
| `scope.ts` | 检查范围解析、花名册范围过滤、转派权限判定 |
| `flow.ts` | 流程守卫（照片优先、选人/选行为/整改/转派/复查的全部硬约束） |
| `seed.ts` | TEST 占位数据（全部 `TEST-` 前缀，显式标记） |

### 3.2 适配层（`src/api/mw/transports/`）

| 文件 | 职责 |
|---|---|
| `types.ts` | `MwTransport` 接口契约（未来替换为 WPS/Backend 的唯一接缝） |
| `local.ts` | 本地 TEST 实现（localStorage 结构化数据 + IndexedDB 照片，无 localStorage 时退进程内 Map） |
| `http.ts` | 轻量中间层 REST 实现（**凭证由调用方注入，源码零密钥**） |
| `index.ts` | 传输层选择与注入 |

### 3.3 业务门面与支撑

| 文件 | 职责 |
|---|---|
| `src/api/mw/index.ts` | **页面唯一入口**：登录、候选池、规则、区域、拍照、建单、选人、选行为、整改、转派、复查、分桶清单 |
| `src/api/mw/photo-store.ts` | 图片压缩（长边 1280 / JPEG 0.72）与 dataURL 读取 |
| `src/api/mw/staging.ts` | 拍照暂存区（**持久化**，非组件内存） |
| `src/api/mw/session.ts` | V1 临时会话（手机号，与正式 JWT 完全无关） |
| `src/api/mw/__tests__/foundation.spec.ts` | 29 条验收断言（A–G 七组） |

### 3.4 移动端页面（`src/views/mw/`）

| 文件 | 职责 |
|---|---|
| `shared.ts` | 展示层工具（时间格式化、状态标签、登录守卫、照片解析、拍照触发） |
| `login.vue` | 移动登录（手机号） |
| `home.vue` | 移动首页（巡查/三违上报/我的整改/我的复查/我的任务） |
| `violation/capture.vue` | 第 1 步 拍现场照片 → 生成三违记录ID |
| `violation/person.vue` | 第 2 步 选择违章人员（范围内候选，非全公司名单） |
| `violation/behavior.vue` | 第 3 步 选择三违行为（动态读规则表） |
| `violation/dispose.vue` | 第 4 步 处置方式（立即整改 / 暂不整改 / 转派） |
| `violation/rectify.vue` | 第 5 步 拍整改后照片 + 措施 + 提交 |
| `violation/transfer.vue` | 公司管理转派（选区域 → 选管理员） |
| `rectify.vue` / `review.vue` / `task.vue` | 我的整改 / 我的复查 / 我的任务 |
| `record-list.vue` | 清单组件（分桶展示） |
| `record.vue` | 三违记录详情（全流程汇总 + 复查动作） |

### 3.5 布局、路由与文档

| 文件 | 职责 |
|---|---|
| `src/layouts/mw.vue` | 移动端布局（复用现有 `mobile.css` 设计令牌，无新 UI 框架） |
| `src/router/routes/modules/mw.ts` | 独立 `/mw` 路由树（`noBasicLayout` + `ignoreAccess` + `hideInMenu`） |
| `docs/MOBILE-WPS/MOBILE-WPS-V1-FOUNDATION-REPORT.md` | 本报告 |
| `docs/MOBILE-WPS/WPS-DATA-MODEL.md` | WPS 数据模型（8 表字段级建表说明书） |
| `docs/MOBILE-WPS/MIDDLEWARE-CONTRACT.md` | 未来轻量中间层 REST 契约 |

**新增 npm 依赖：0。** 复用仓库已有的 vue / vue-router / vitest / `@vben/*`，未安装任何新包，未引入任何新 UI 框架（继续使用 Naive UI 体系下的既有移动端样式令牌，未使用 Ant Design Vue）。

---

## 4. WPS 数据模型

8 张表，独立 WPS 文件（代号 `MW_HSE_V1`），**与现有 WPS-PG-SYNC 冻结体系使用的文件物理隔离、互不读写**。字段级定义见 `docs/MOBILE-WPS/WPS-DATA-MODEL.md`。

| # | 代码表名 | WPS 中文表名 | 用途 | 关键约束 |
|---|---|---|---|---|
| T1 | `t_account` | 手机端账号表 | 手机号登录与身份加载 | 手机号唯一；含检查范围（scopeType + scopeValues） |
| T2 | `t_roster` | 花名册 | 员工身份主数据 | **员工ID 为稳定标识**，禁止只存姓名 |
| T3 | `t_violation_rule` | 三违行为表 | 三违行为**唯一来源** | 严禁前端硬编码；无真实数据即空/TEST |
| T4 | `t_area` | 责任区域目录 | 责任乡镇/作业中心/公司管理 | 「公司管理」是**历史检查区域分类**，不是部门 |
| T5 | `t_violation_record` | 三违记录主表 | 业务链主线 | 一次事件 = 一个 `violationId`；记录**永不删除** |
| T6 | `t_photo` | 照片表 | BEFORE / AFTER 证据 | 必须绑定 `violationId` + `photoType` |
| T7 | `t_transfer` | 转派表 | 公司管理 → 责任乡镇/管理员 | 发现人 ≠ 整改人；责任人不得自由文本 |
| T8 | `t_review` | 复查表 | 复查记录（可多轮） | 不通过打回整改中 |

### 4.1 三违记录主表核心字段组

主表把一次事件的所有维度收在一行，避免跨表查询（WPS 无 JOIN、无条件查询，见第 5 节）：

```
发现侧：discoverAccountId / discoverName / discoveredAt / location / discoverAreaCode
违章侧：violator{employeeId,name,gender,position,team,workUnit,township}  ← 身份快照
        rule{ruleId,name,category}                                        ← 规则快照
整改侧：rectifyAccountId / rectifyName / measure / rectifiedAt
复查侧：reviewAccountId / reviewName / reviewedAt / reviewResult / reviewNote
转派侧：responsibleAreaCode / transferId
状态  ：status（六态）
```

**身份快照与规则快照「选中即固化」**：花名册后续变更不追溯改写历史记录，这正是"不能只保存姓名"的落地方式。

### 4.2 「公司管理」的建模方式

`areaTeam = COMPANY_MANAGEMENT` 作为**区域性质**的一个枚举值存在于 `t_area`，与 `TOWNSHIP`（具体乡镇）、`WORK_CENTER`（作业中心）并列。它**不是** `t_account.dept` 的取值。

两个维度正交：

| 维度 | 字段 | 例子 |
|---|---|---|
| 组织归属 | `t_account.dept` / `t_roster.dept` | 环卫作业中心 |
| 历史检查区域 | `t_area.areaTeam` / `t_violation_record.discoverAreaCode` | 甲镇 / 公司管理 |

因此"乡镇作业中心在组织架构上隶属环卫作业中心，但历史检查区域可以是具体乡镇"这一业务事实被完整保留，不会被错误压平成单一部门字段。

---

## 5. WPS API 能力审计结果

审计依据：本项目已沉淀的 WPS 多维表 V7 真机联调知识（`server/services/wpsClient.js` + 既有 Sprint 验收记录），非推测。

| 能力 | 结论 | 对本项目的影响 |
|---|---|---|
| 认证方式 | `client_credentials` → Bearer；KSO-1 签名仅在控制台开启时需要 | **应用级凭证，绝不能下发浏览器** |
| Token / AppId / Secret / BaseId / 表ID | 存在，属服务端配置 | 只能放在未来的中间层；**本阶段前端源码零密钥**（测试 G1 静态扫描锁定） |
| 读取 | `POST .../records/list_by_page`（分页 100/页） | 可用 |
| 新增 / 修改 / 删除 | `records/create` / `update` / `batch_delete` | 可用（50 条/批） |
| **条件过滤** | ❌ **不支持**：body 仅 `page_num/page_size/prefer_id/show_record_extra_info`，无 filter / view_id | **关键约束**：筛选只能在中间层内存里做；按 `violationId` 查单条 = O(n) 全表扫描 ⇒ 数据量上升后必须换后端或建索引表 |
| **按 ID 查单条** | ❌ 不存在专用端点 | 同上 |
| 批量操作 | ✅ create/update 50 条/批 | 建表/初始导入可用 |
| 文件/图片附件 | ⚠️ **二段式**：先 `upload` 拿 `upload_id`，再写字段值 `[{uploadId,fileName,source}]` | 见下条 |
| **附件可渲染 URL** | ❌ **原生 Attachment 字段值不含 URL**（仅 `{fileName, uploadId, source}`） | **最大风险点**。本项目在 UI 层做了优雅降级（显示"附件无直链"而不是破图），并把"换 URL"定义为中间层职责 |
| DBT v1 附件换 URL 端点 | ⚠️ 实测在本项目 V7 coop 域 **404**，不可用 | 不能假设可用；`resolvePhotoUrl` 返回空串时页面必须能降级 |
| 限频 | 10 次/秒（按 app_id） | 中间层需退避重试 |

### 5.1 审计结论：手机不能直连 WPS

```
client_credentials 是应用级凭证
  ⇒ 下发到浏览器 = 交出整表读写权
  ⇒ 且 WPS 侧无按登录用户的行级隔离
  ⇒ 任何人打开 DevTools 都能拿走凭证、读改全表
```

因此本阶段**明确拒绝**「为了 V1 先跑起来把 Token 塞进前端」，改为：

1. 前端只依赖 `MwTransport` 接口；
2. NODE-01 默认装载 `LocalTestTransport`（本机 TEST 数据）；
3. 未来接 WPS 时新增一个 `HttpMiddlewareTransport`，指向**轻量中间层**——WPS 密钥只在中间层；
4. 不擅自启动云服务器（本阶段**未启动任何服务器**），中间层的选型与部署留待下一阶段决策。

---

## 6. 移动端页面结构

```
/mw/login                     移动登录（手机号）
  ↓
/mw/home                      移动首页
  ├── 巡查（占位入口，NODE-02+）
  ├── 三违上报 ─→ /mw/violation/capture
  ├── 我的整改 ─→ /mw/rectify
  ├── 我的复查 ─→ /mw/review
  └── 我的任务 ─→ /mw/task
```

三违主链路（严格顺序，页面不可跳过）：

```
/mw/violation/capture    ① 拍现场照片【必须】 → 生成三违记录ID
        ↓
/mw/violation/person     ② 选择违章人员（范围内候选）
        ↓
/mw/violation/behavior   ③ 选择三违行为（动态读表）
        ↓
/mw/violation/dispose    ④ 处置方式三选一
        ↓
    ┌───────────────┼───────────────┐
    ↓               ↓               ↓
 立即整改        暂不整改          转派
    ↓               ↓               ↓
/violation/rectify  挂起→/mw/rectify  /violation/transfer
   （拍 AFTER）     （之后补整改）     （选区域→选管理员）

/mw/record?id=xxx   记录详情（全流程汇总 + 接收任务 / 去整改 / 复查）
```

路由以 `meta.noBasicLayout` 脱离 PC 端 BasicLayout，使用 `src/layouts/mw.vue`；`meta.ignoreAccess` 使 `/mw` 在**未登录 PC 端**时也可访问（V1 用独立手机号会话）；`hideInMenu` 保证不出现在 PC 菜单。**现有 `/mobile` 路由树完全未动。**

---

## 7. 登录流程

```
输入手机号
   ↓
WPS 账号表查询（本阶段=TEST 账号表）
   ↓
├─ 不存在        → NOT_FOUND   明确失败
├─ 已停用        → DISABLED    明确失败
├─ 空            → EMPTY       明确失败
└─ 命中启用账号   → OK，加载身份（姓名/部门/职位/作业单元/班组/角色/检查范围）
                    写入 V1 临时会话 → 进入 /mw/home
```

**重要声明（不允许含糊）**：V1 的手机号识别是**临时身份识别方式，不等同于正式安全认证**。它无短信验证码、无企业身份、不接入 JWT。升级路径预留为：

```
手机号 → 手机号 + 短信验证码 → 企业微信 / 钉钉 / 企业身份体系
```

本阶段**未实现 SMS**，也未修改现有 JWT 体系——`/mw` 的会话是独立的 `mw_v1_session`，与 `accessStore.accessToken` 无任何耦合。

---

## 8. 三违业务流程

冻结规则一：**现场照片必须是第一步**。代码级保证（`core/flow.ts`）：

- 未拍 BEFORE 照片 ⇒ `createViolationFromDraft` 直接抛 `FlowError`，**根本拿不到三违记录ID**；
- 未选人 ⇒ 不允许选行为；未选人/未选行为 ⇒ 不允许整改或转派；
- 上述全部为**服务端式 fail-closed 断言**，不是页面禁用按钮（页面禁用只是 UX，绕过 UI 也会被拒）。

```
拍现场照片【必须】
   ↓
生成三违记录ID（SW-20260915-0001）
   ↓
选择违章人员（登录人**范围内**的花名册）
   ↓
选择三违行为（WPS 三违规则表，动态）
   ↓
处置：立即整改 / 暂不整改 / 转派
```

记录**在任何状态下都不可删除**，只做状态流转（`core/status.ts`）。

---

## 9. 照片流程

两类证据：

| 类型 | 含义 | 何时必须存在 |
|---|---|---|
| `BEFORE` | 现场发现照片 | **建单前（第一步）** |
| `AFTER` | 整改后照片 | **提交整改时** |

关系模型：`violationId + photoType + storageRef + url + fileName + uploadedAt + uploadedByAccountId`。

**照片绝不依赖浏览器内存中的临时状态**：

1. 建单前还没有 `violationId` ⇒ 照片先落**持久化暂存区**（`staging.ts`，localStorage 键，非组件 ref），并与 `draftId` 绑定；
2. 建单成功拿到 `violationId` ⇒ 暂存照片**批量 bind 到该 ID**并清空草稿；
3. 之后所有 AFTER 照片直接 `putPhoto({violationId, photoType:'AFTER'})`。

压缩：长边 1280、JPEG 0.72（`photo-store.ts`），避免手机流量与 WPS 附件体积问题。

**WPS 附件无公网直链的风险已前置处理**：`resolvePhotoUrl` 换不出 URL 时返回空串，页面渲染"附件无直链"占位，不出现破图（测试 G4 断言 `storageRef` 必须存在）。

---

## 10. 三违记录ID 设计

格式：

```
SW-YYYYMMDD-NNNN
例：SW-20260915-0001
```

- `SW` = 三违（固定前缀，便于人工识别与后续与正式 HSE 对接时区分来源）；
- `YYYYMMDD` = 建单日期，天然按日分桶，便于 WPS 侧人工检索；
- `NNNN` = 当日序号，由 `nextViolationSeq(date)` 分配（本地实现按当日已有记录计数；中间层实现应改为**原子分配**，见 MIDDLEWARE-CONTRACT）。

**ID 是整个业务链的主线**：现场照片、违章人员、违章行为、发现人、发现时间、发现地点、整改责任人、责任乡镇、整改措施、整改后照片、整改时间、转派记录、反馈、复查 —— 全部挂在同一个 `violationId` 上，可通过 `/mw/record?id=` 一屏汇总。

测试 F1 断言：同日两单 ID 不同且序号递增（`seqB === seqA + 1`）。

---

## 11. 整改流程

### 路径 A：立即整改

```
拍现场照片 → 生成ID → 选人 → 选行为 → 【立即整改】
   → 拍整改后照片 → 填措施 → 提交 → 待复查 → 复查通过 → 已完成
```

### 路径 B：暂不整改（延后整改）

```
拍现场照片 → 生成ID → 选人 → 选行为 → 【暂不整改】
   → 状态置「待整改」，记录保留不可删除
   → 之后：我的整改 → 选该记录 → 拍整改后照片 → 填措施 → 提交
   → 待复查 → 复查通过 → 已完成
```

两条路径**共存**（状态机同时允许 `DRAFT → PENDING_REVIEW` 直通与 `DRAFT → PENDING_RECTIFY` 挂起后再补）。测试 C2 覆盖路径 A 全链路，D1/D2 覆盖路径 B。

### 状态机（六态）

```
DRAFT 待补充
  ├→ PENDING_RECTIFY 待整改   （暂不整改挂起）
  ├→ RECTIFYING      整改中   （立即整改 / 复查打回）
  ├→ PENDING_REVIEW  待复查   （提交整改）
  └→ TRANSFERRED     已转派   （公司管理转派）

PENDING_RECTIFY → RECTIFYING | TRANSFERRED
RECTIFYING      → PENDING_REVIEW
PENDING_REVIEW  → COMPLETED（复查通过） | RECTIFYING（复查不通过，可多轮）
TRANSFERRED     → RECTIFYING
COMPLETED       已完成（终态）
```

**提交整改的硬约束**（`assertCanSubmitRectify`）：BEFORE 存在 + AFTER 存在 + 措施非空 + 整改责任人明确。缺任一项抛错，测试 C1 覆盖"无 AFTER ⇒ 拒绝"。

---

## 12. 公司管理转派流程

```
拍现场照片 → 生成ID → 选人 → 选行为 → 【转派】
   ↓
第 1 步 选择责任乡镇 / 区域   （来自 t_area，仅 ENABLED）
   ↓
第 2 步 读取该区域可指派管理员 → 选择管理员
   ↓
提交转派 → 状态「已转派」，生成转派单
   ↓
责任管理员：我的任务 → 接收 → 拍整改后照片 → 提交整改
   ↓
转派单自动置 FEEDBACK（反馈给发起人）
   ↓
发起人：我的任务 → 看到反馈 → 复查通过 → 转派单 CLOSED
```

**发现人 ≠ 整改人**是代码级硬约束：

- 转派给**发现人自己** ⇒ 拒绝（测试 E1）；
- 未选责任区域 ⇒ 拒绝（测试 E2，责任人不得自由文本填写）；
- 未选管理员 / 管理员账号已停用 ⇒ 拒绝；
- 整改完成后 `rectifyAccountId` 与 `discoverAccountId` 必须不同（测试 E3 断言）。

公司管理人员发现问题时**不会自动成为整改人**：转派后 `rectifyAccountId` 指向所选管理员，发起人只保留 `discoverAccountId`。

---

## 13. 权限 / 范围控制

### 13.1 选人范围（禁止"加载全公司名单让用户自己找"）

```
登录用户
  ↓ 读取 scope{type, values}
  ↓ 类型：OWN_TEAM 本班组 / OWN_UNIT 本作业单元 / OWN_TOWNSHIP 本乡镇 / ALL 全公司
  ↓ 与花名册求交集（scope.ts filterRosterByScope）
  ↓ 返回候选池
  ↓ 页面只渲染候选池（大按钮，少输入）
```

- 选**范围外**员工 ⇒ 拒绝（测试 B4）；
- **不存在**"输入姓名 → 前端猜员工ID"的路径：选人必须传 `employeeId`，由 `pickByEmployeeId` 在候选池内匹配，池外即失败。

### 13.2 转派权限

`canTransfer(account)`：仅 `COMPANY_ADMIN`（公司管理人员）可转派。乡镇经理在处置页看到转派按钮为禁用态并提示"仅公司管理人员可转派"。

### 13.3 复查权限

详情页判定 `canReview = status === PENDING_REVIEW && 当前登录人不是整改责任人`，避免**自整改自复查**。

### 13.4 页面不做业务判断

所有约束在 `core/flow.ts` / `core/status.ts` / `core/scope.ts`，页面只负责展示与调用。绕过 UI 直接调门面仍会被拒（测试全部直接调门面，不经过页面，正是对这一点的验证）。

---

## 14. 安全风险

| # | 风险 | 等级 | 处置 |
|---|---|---|---|
| 1 | WPS 应用级凭证下发浏览器 = 整表读写权泄露 | **高** | 本阶段前端**零密钥**；`HttpTransport` 的 token 由调用方注入，源码无字面量。测试 G1 静态扫描 5 类凭证正则 |
| 2 | 前端直连 WPS 域名 | **高** | 测试 G3 扫描 `*.wps.cn` URL，当前 0 命中 |
| 3 | 手机号登录可被冒用 | **高** | 已在登录页与本报告**明示为临时身份识别**，非正式认证；不接入正式权限；升级路径已预留 |
| 4 | WPS 附件无公网直链，图片可能不可渲染 | 中 | UI 优雅降级；`resolvePhotoUrl` 失败返回空串；换 URL 归为中间层职责 |
| 5 | WPS 无条件查询 + 无单条查询，数据量上升后 O(n) | 中 | 中间层需做缓存/索引表；若量大应直接迁移到 PostgreSQL（本阶段已预留适配层） |
| 6 | 三违记录ID 并发序号冲突 | 中 | 本地实现为单机计数；**中间层必须原子分配**（契约已写明） |
| 7 | 照片只落本机（本地适配层） | 中 | 仅 TEST 阶段成立；接中间层后照片走服务端存储 |
| 8 | `/mw` 使用 `ignoreAccess` 绕过 PC 端登录 | 中 | 有意设计（手机端独立使用）；`/mw` **不接触任何正式 HSE 数据表**，风险面仅限 TEST/中间层数据 |
| 9 | 硬编码业务数据（人员/班组/乡镇/三违/扣分） | **高** | 测试 F2 / G2 扫描；种子数据全部 `TEST-` 前缀并显式标记 |

### 14.1 静态安全扫描（测试组 G，随 CI 可重复执行）

```
G1 源码中不存在任何 WPS 凭证（AppId / Secret / Token 字面量）        PASS
G2 源码中不存在硬编码的三违行为清单                                  PASS
G3 源码中不存在前端直连 WPS 开放平台域名                              PASS
G4 照片必须绑定到三违记录ID（不依赖组件内存）                          PASS
G5 清单分桶：待整改 / 待复查 / 任务互不串桶                            PASS
```

扫描前会剔除注释与文档块（避免"禁止这样写"的反例被误判），只扫可执行代码。

---

## 15. 测试结果

运行环境：Node（显式 `@vitest-environment node`，**无 document / localStorage / IndexedDB**），以验证适配层在无浏览器能力时的降级不破坏业务规则。

```
 ✓ apps/web-naive/src/api/mw/__tests__/foundation.spec.ts (29 tests)
 Test Files  1 passed (1)
      Tests  29 passed (29)
```

| 组 | 覆盖 | 结果 |
|---|---|---|
| **A 登录**（5） | A1 手机号存在 / A2 不存在 NOT_FOUND / A3 停用 DISABLED / A4 空 EMPTY / A5 取回当前账号 | ✅ 5/5 |
| **B 三违主流程**（6） | B1 未拍照片不得生成ID / B2 拍照片生成ID且照片绑定 / B3 候选按范围过滤 / B4 范围外选人被拒 / B5 快照固化 / B6 停用规则被拒 | ✅ 6/6 |
| **C 立即整改**（3） | C1 无 AFTER 提交被拒 / C2 全链路到完成 / C3 复查不通过打回 | ✅ 3/3 |
| **D 延后整改**（2） | D1 挂起为待整改且出现在我的整改、记录不可删除 / D2 我的整改补整改到待复查 | ✅ 2/2 |
| **E 公司管理转派**（3） | E1 转派给自己被拒 / E2 未选区域被拒 / E3 转派→接收→整改→反馈→复查→关闭全链路 | ✅ 3/3 |
| **F 数据模型与适配层**（5） | F1 ID 格式与序号递增 / F2 规则来自表非硬编码 / F3 适配层可替换 / F4 公司管理是分类非部门 / F5 员工ID 稳定标识 | ✅ 5/5 |
| **G 安全边界静态审计**（5） | 凭证 / 硬编码 / 直连域名 / 照片绑定 / 分桶 | ✅ 5/5 |

### 类型检查

```
vue-tsc --noEmit -p tsconfig.json
  mw 相关错误   0
  全仓错误总数  66（本次改动前为 72，其中 6 个属 mw 新增 → 已全部修复）
```

**未新增任何类型错误**，未触碰既有 66 个基线错误（均为 hse/site/training 等历史遗留，与本项目无关）。

### 模板编译冒烟

对新增的 14 个 `.vue`（13 个页面 + 1 个布局）逐个执行 `@vue/compiler-sfc` 解析 + 模板编译：

```
checked 14 files; failures= 0
```

### Vite dev 模块解析冒烟

dev server（5178）下逐个请求 13 个新增模块（路由模块 / 门面 / 11 个页面布局），全部 HTTP 200 且无 `Failed to resolve / Transform failed / Internal server error`：

```
src/router/routes/modules/mw.ts     OK
src/api/mw/index.ts                 OK
src/views/mw/*.{vue}  (11 个)       OK
src/layouts/mw.vue                  OK
--- modules: 13 failures: 0
```

### 真实浏览器端到端冒烟（Playwright + Chrome，390×844 移动视口）

脚本：`G:\hse-dashboard\_mw_smoke.cjs`；截图：`G:\hse-dashboard\_mw_smoke_shots\`。

**路径 A：立即整改（乡镇经理 张三 13800000001）**

```
✓ 登录 → /mw/home（身份、检查范围「本作业单元」正确渲染）
✓ 三违上报 → 拍现场照片（BEFORE）→ 生成三违记录ID = SW-20260915-0001
✓ 选人（范围候选）→ 选行为 → 处置「立即整改」
✓ 拍整改后照片（AFTER）→ 快捷措施 → 提交整改 → 回到我的整改
✓ 我的复查列表出现该「待复查」记录
✓ 记录详情：violationId / BEFORE / AFTER / 整改措施 / 等待复查说明 全部渲染
```

**路径 B：公司管理转派（李四 13800000002）**

```
✓ 登录 → 全流程建单 → 转派按钮可用（公司管理权限）
✓ 选责任区域 → 该区域可指派管理员候选 = 5 → 选管理员 → 提交转派
✓ 我的任务列表出现「已转派」记录
```

```
console / page errors:  (none)
E2E RESULT: PASS
```

全程 **0 控制台错误、0 页面异常**，浅色主题移动端渲染正常（大按钮、少输入、照片优先）。

---

## 16. 已知问题

1. **本地适配层不具备跨设备能力**：数据存在当前浏览器，换手机/清缓存即丢。这是 TEST 阶段的预期行为，`transportInfo().isTestData === true` 已在 UI 明示。
2. **WPS 附件换不出直链**（实测 DBT v1 端点在本项目 V7 coop 域 404）：接真实 WPS 后照片可能只能在中间层渲染，需在下一阶段确认图片存储方案（建议：图片走中间层对象存储，完全绕开这项未确证能力）。
3. **`list_by_page` 无条件查询**：按 `violationId` 取单条需 O(n) 全表扫描。数据量到千级以上会明显变慢。
4. **手机号登录无任何防冒用**：任何知道他人手机号的人都能以其身份进入。NODE-01 阶段可接受（数据为 TEST），**进入真实数据前必须先升级认证**。
5. **`discoverAreaCode` 目前由页面按角色推断**（公司管理角色填公司管理区域，否则填账号所属区域）。真实数据接入后应改为让用户在登录/上报时显式选择或由账号表带出。
6. **复查权限矩阵未定义，自查自纠类记录存在"待复查无人可处理"的空窗**（端到端冒烟实测发现）：`bucketOf` 把「待复查」记录分给发现人，但详情页禁止"自整改自复查"；且该记录对其他账号（含公司管理）分桶结果为 `NONE` ⇒ **没有任何账号能对它执行复查**，记录将停在「待复查」。
   本阶段的处置：**不擅自编造复查人规则**（那属于硬编码业务），在详情页显式提示"等待复查，复查人指派规则留待下一阶段由业务方确定"。下一阶段必须先定规则，候选方案：
   - ① 复查人 = 发现人的上级（需要组织架构/汇报关系数据）；
   - ② 提交整改时显式指定复查人（需要业务确认默认值来源）；
   - ③ 复查人 = 责任区域的管理员。
7. **首页"巡查"入口为占位**：本阶段只做三违链路，巡查（`inspection`）模块未实现。

---

## 17. 尚未实现内容

| 项 | 状态 | 说明 |
|---|---|---|
| 真实花名册导入 | ❌ 未做 | **本阶段明确不索要**，等下一阶段 |
| 真实三违行为导入 | ❌ 未做 | **本阶段明确不索要**，等下一阶段 |
| WPS 建表与字段映射落地 | ❌ 未做 | 表结构与字段定义已完成（schema.ts + WPS-DATA-MODEL.md），实际建表待下一阶段 |
| 轻量中间层（服务端） | ❌ 未做 | 仅定义契约（MIDDLEWARE-CONTRACT.md），**未启动云服务器** |
| SMS 短信验证码 | ❌ 未做 | 按任务书明确不做 |
| 企业微信 / 钉钉身份 | ❌ 未做 | 按任务书明确不做 |
| 离线能力 | ❌ 未做 | 暂存区已持久化，但无完整离线队列/冲突合并 |
| 统计分析 / 看板 | ❌ 未做 | 按任务书明确不做 |
| **正式扣分（E-08-11）** | ❌ **明确不做** | V1 只记录事实，不计算任何分数；未复制、未引用正式扣分逻辑 |
| PostgreSQL 迁移 | ❌ 未做 | 仅预留适配层接缝 |
| 云服务器部署 | ❌ 未做 | 按任务书明确不做 |
| 巡查模块（inspection） | ❌ 未做 | 首页入口为占位 |

---

## 18. 下一阶段建议

按优先级排序，均需本阶段审核通过后再启动：

1. **NODE-02 · 真实数据准备与 WPS 建表**
   由项目负责人提供**第一批花名册**与**第二批三违行为**（本阶段不索要）。拿到后按 `WPS-DATA-MODEL.md` 在独立 WPS 文件建 8 表，做字段映射与导入校验。
2. **NODE-03 · 认证加固决策**
   在进入真实数据前必须解决手机号冒用问题。建议顺序：手机号+短信 → 企业微信身份。
3. **NODE-04 · 轻量中间层实现**
   按 `MIDDLEWARE-CONTRACT.md` 实现 REST 中间层，WPS 凭证只落服务端。需先决策部署形态（任务书要求"不擅自启动云服务器"，需业务方明确）。
4. **NODE-05 · 图片存储方案确认**
   优先推荐图片不落 WPS 原生 Attachment，改走中间层对象存储，绕开"附件无直链"未确证能力。
5. **NODE-06 · 清单分页与查询优化**
   若 WPS 数据量过千，需中间层建索引表或直接迁移 PostgreSQL。

**不建议**在下一阶段之前开始：扣分、统计、AI、离线。

---

## 19. 数据准备要求

> **本阶段不索要数据。** 以下清单供下一阶段（NODE-02）准备，届时再确定字段映射与导入方式。

### 第一批：花名册（对应 T2 `t_roster`）

用途：员工身份、部门、职位、班组、作业单元、乡镇、责任范围。

必需字段：`员工ID`（稳定唯一）、`姓名`、`部门`、`职位`、`作业单元`、`班组`、`乡镇`、`状态`。
建议补充：`性别`、`手机号`。

**关键要求**：`员工ID` 必须是**公司已有的稳定编号**（如工号），不能临时生成、不能只用姓名。

### 第二批：三违行为（对应 T3 `t_violation_rule`）

用途：WPS 三违规则表，作为移动端三违行为的唯一来源。

必需字段：`规则ID`、`三违名称`、`三违分类`、`是否启用`。
建议补充：`行为描述`、`适用岗位`、`适用范围`、`排序`、`备注`。

### 第三批（如需要）：账号与责任区域

- **账号表 T1**：姓名、手机号、所在部门、职位、网格等级、作业单元、班组、角色、**检查范围类型与取值**（决定选人候选池）。
- **责任区域表 T4**：区域代码、区域名称、区域性质（乡镇/作业中心/公司管理）、上级区域、默认责任管理员账号ID。

**特别提醒**：`公司管理` 请作为**区域性质**提供（历史检查区域分类），不要当作部门名填进"所在部门"字段。

---

## 27. 阶段节点状态

```text
MOBILE-WPS-V1-NODE-01
```

**状态：`CONDITIONAL_PASS`**

判定理由：基础架构与业务骨架**已全部完成并通过自动化验证**（29/29 断言、0 新增类型错误、0 修改现有文件），但**缺少真实花名册与三违行为数据，无法进行真实业务验证**，且 WPS 侧尚未建表/接入（当前跑本地 TEST 适配层）。按任务书第二十七条要求，不得强行写 PASS。

### 完成项

```text
WPS数据模型             PASS   8 表字段级定义（schema.ts + WPS-DATA-MODEL.md）
WPS适配层设计           PASS   MwTransport 接口 + 本地TEST实现 + 中间层契约
移动端登录骨架           PASS   手机号四态（存在/不存在/停用/空）
现场拍照流程             PASS   BEFORE 必须第一步，持久化暂存区
三违记录ID               PASS   SW-YYYYMMDD-NNNN，全链路主线
人员选择流程             PASS   范围过滤，禁止全量名单与姓名猜ID
动态三违规则接口         PASS   100% 读表，零硬编码
立即整改流程             PASS   含状态流转与复查
延后整改流程             PASS   挂起 → 我的整改 → 补整改
公司管理转派模型         PASS   选区域→选管理员，发现人≠整改人
整改后照片               PASS   AFTER 提交时强校验
记录查询                 PASS   三个分桶 + 详情全流程汇总
未来迁移适配层           PASS   业务门面 → 适配层 → WPS，替换接缝唯一
安全边界审计             PASS   G1-G5 静态扫描 + 前端零密钥
零影响现有系统           PASS   git 变更面 4 新增 / 0 修改
无新增依赖               PASS   0 npm 包，未引入新 UI 框架
浏览器端到端冒烟         PASS   Playwright+Chrome 移动视口，路径A/B 全链路，0 控制台错误
```

### 未完成项

```text
真实花名册导入           本阶段明确不索要
真实三违行为导入         本阶段明确不索要
WPS 实际建表与接入       仅完成表结构定义与适配层，未连真实 WPS
轻量中间层实现           仅定义契约，未启动云服务器
认证加固（SMS/企业身份）  按任务书明确不做
巡查模块                 首页入口为占位
```

### 阻塞项

```text
无硬阻塞。
以下为 CONDITIONAL_PASS 的成因（需下一阶段解除）：
  C1 无真实花名册 ⇒ 人员选择仅 TEST 数据验证，未做真实数据量与重名场景验证
  C2 无真实三违行为 ⇒ 规则选择仅 TEST 数据验证，未做真实分类/适用范围验证
  C3 WPS 未建表、中间层未实现 ⇒ 真实 WPS 读写、附件二段式上传、换 URL 均未真机验证
  C4 未部署任何服务端 ⇒ 手机浏览器 → 中间层 → WPS 的**跨端**链路未验证
     （本机 UI 端到端已验证：Playwright + Chrome 移动视口，路径A/B 全链路 PASS）
  C5 复查人指派规则未定义 ⇒ 自查自纠类记录停在「待复查」无人可处理（详见已知问题 #6）
```

### 下一节点

```text
MOBILE-WPS-V1-NODE-02：真实数据准备与 WPS 建表
（需本节点审核通过后启动；启动前请勿提供数据）
```

### 需要用户提供的数据

```text
本阶段：无需提供任何数据。
下一阶段（NODE-02）再按第 19 节清单提供：
  第一批  花名册（员工ID 为稳定标识）
  第二批  三违行为（三违名称/分类/适用范围）
  第三批  账号表（含检查范围）与责任区域表（公司管理作为区域性质）
```

---

## 附：如何运行本阶段产物

```bash
# 1. 验收测试（29 条断言）
cd G:/hse-dashboard/安全看板vben
node node_modules/vitest/vitest.mjs run "apps/web-naive/src/api/mw/__tests__/foundation.spec.ts"

# 2. 类型检查（mw 相关应为 0 错误）
cd 安全看板vben/apps/web-naive
../../node_modules/.bin/vue-tsc --noEmit -p tsconfig.json
```

移动端入口（需先启动 web-naive dev server）：`http://localhost:5173/mw/login`

TEST 账号（`core/seed.ts`，均为显式 TEST 数据）：

| 手机号 | 身份 | 角色 |
|---|---|---|
| 13800000001 | TEST·张三（甲镇经理） | TOWNSHIP_MANAGER |
| 13800000002 | TEST·李四（公司管理） | COMPANY_ADMIN |
| 13800000003 | TEST·王五（已停用） | INSPECTOR |
| 13800000004 | TEST·赵六（乙镇管理员） | TOWNSHIP_MANAGER |

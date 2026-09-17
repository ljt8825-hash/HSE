# MOBILE-WPS-V1 范围重新基线（SCOPE-REBASELINE-01）

> **任务性质**：范围纠偏 + 现状审计（**只读**）。不是开发、不是删代码、不是改 schema。
> **触发**：业务负责人明确「当前项目只做**手机端网格长巡查管理**」，前期 NODE-01 存在过度设计。
> **报告生成时间**：2026-09-15
> **报告路径**：`docs/AI智能分析/MOBILE-WPS-V1-SCOPE-REBASELINE-01.md`

---

## 0. 本轮执行纪律自证（先行）

| 禁止项 | 本轮实际 |
|---|---|
| 修改业务代码 | ✅ **0 文件**（git 复核：目标路径仅新增，既有文件修改数 0） |
| 修改数据库 | ✅ 未建立任何 DB 连接，0 DDL / 0 DML |
| 创建/修改 WPS 正式业务数据 | ✅ 0 次 WPS 调用 |
| 修改现有 WPS-PG-SYNC | ✅ 未触碰（`server/routes/wps-grid-sync.js`、`wpsFieldMap.js`、`wpsGridPullEngine.js` 只读） |
| 修改 PC 三违台账 | ✅ 未触碰（`routes/violations/main.js`、`services/violationService.js` 只读） |
| 修改责任判定/扣分/复查逻辑 | ✅ 未触碰（E-08-11、ruleEngine 只读） |
| 修改登录/JWT/权限体系 | ✅ 未触碰 |
| 启动新云服务器 / 进入生产 | ✅ 未执行 |
| 删除 NODE-01 已有代码 | ✅ **0 删除**（含 `t_review`、`review.vue` 一并**保留**，只做标记） |

**本轮唯一新增产物 = 本报告文件 + 一行工作记忆。**

---

## 1. 项目原始定位（NODE-01 实际建成的东西）

NODE-01 在 `安全看板vben/apps/web-naive` 下新建了一条**与现有 `/mobile` 完全隔离**的路由树 `/mw`，并配了一套 WPS 多维表数据模型：

- **路由**：`src/router/routes/modules/mw.ts`（107 行），`meta.ignoreAccess` + 独立布局 `layouts/mw.vue`，**不接入现有 JWT**；
- **数据模型**：`src/api/mw/core/schema.ts`（259 行）定义 **8 张 WPS 表** `t_account / t_roster / t_violation_rule / t_area / t_violation_record / t_photo / t_transfer / t_review`；
- **业务内核**：`core/{types,status,flow,scope,id,seed}.ts`（1093 行），含**六态状态机** `DRAFT→PENDING_RECTIFY→RECTIFYING→PENDING_REVIEW→COMPLETED / TRANSFERRED`；
- **适配层**：`transports/{local,http}.ts` + `index.ts` 门面（686 行），默认跑本地 TEST 数据；
- **页面**：`views/mw/` 共 13 个 `.vue`（约 2400 行），覆盖 登录/首页/拍照/选人/选行为/处置/整改/转派/三个清单/详情；
- **测试**：`__tests__/foundation.spec.ts`(476) + `review-gate.audit.spec.ts`(164)，33/33 通过。

**原始定位一句话**：在无云条件下，用 WPS 多维表当数据层，从零建一套**手机端三违闭环**（发现 → 选人 → 选行为 → 整改 → 复查 → 完成）。

---

## 2. 最新业务负责人确认后的正式定位

> **当前项目只做「手机端网格长巡查管理」。**

- 手机端 = **网格长巡查的移动记录工具**；
- 巡查中可：拍现场照片、记录巡查情况、记录三违人员、选择三违行为、保存记录；
- **后续业务处理使用现有 HSE 系统已有能力**；
- **不是**重建一套独立 HSE 三违管理系统。

```text
【重基线后】            【原 NODE-01（作废）】
网格长巡查              手机端三违
  ↓                       ↓
拍现场照片               责任判定
  ↓                       ↓
记录巡查                 整改
  ↓                       ↓
发现三违                 复查
  ↓                       ↓
选择三违人员             扣分
  ↓                       ↓
选择三违行为             完成
  ↓
保存
  ↓
交给现有 HSE 系统继续处理
```

---

## 3. 当前范围（重基线后 V1 只做这些）

| # | 范围项 | 说明 |
|---|---|---|
| S-1 | 网格长登录/身份 | **沿用现有 JWT 登录体系**，手机端不新建登录、不新建账号表 |
| S-2 | 巡查入口 + 现场照片 | 拍照/选图 → 上传 → 记录与巡查强绑定 |
| S-3 | 巡查记录 | 日期/网格/区域/情况说明 → 保存 |
| S-4 | 发现三违：选人 | 必须从**正式员工主数据选择器**选，禁止姓名猜 ID |
| S-5 | 发现三违：选行为 | 从**三违行为字典**选择（当前缺口，见 §10 G-1） |
| S-6 | 保存并提交 | 交给现有正式 API 处理 |
| S-7 | 巡查/三违记录查询 | 按登录身份服务端过滤后的列表 + 详情 |
| S-8 | 数据范围 | 由服务端 `gridScope` 权威判定，前端只做展示收窄 |

---

## 4. 明确排除范围

| 排除项 | 具体禁止复制的能力 | 判定 |
|---|---|---|
| 三违**责任判定** | E-08-11 责任规则、responsibility resolver、responsibility layer、checker 责任判定、responsibility target 计算 | `CURRENTLY_OUT_OF_SCOPE` |
| 三违**扣分** | deduction、assessment、score、月度扣分、15/40 封顶、公司管理扣分规则、头盔 5/1 分规则 | `CURRENTLY_OUT_OF_SCOPE` |
| **PC 三违台账** | 三违记录/台账/整改/责任/扣分/复查（PC 已有） | 不重建第二套 |
| **手机端复查** | reviewer 分配、复查规则、多轮复查、`PENDING_REVIEW`、`t_review` | `CURRENTLY_OUT_OF_SCOPE` |
| 独立**转派** | `t_transfer`、转派状态机、责任管理员指派算法 | `CURRENTLY_OUT_OF_SCOPE` |
| 独立**整改闭环** | 三违整改措施、整改后照片、整改责任人指派（在手机端） | `CURRENTLY_OUT_OF_SCOPE` |
| 独立 assessment / 独立 E-08-11 | — | `CURRENTLY_OUT_OF_SCOPE` |

> ⚠️ 需区分：**网格巡查记录自身的整改照片补传**（既有 `/mobile/grid/rectify/:id`，走 `PUT /api/site-mgmt/grid-records/:id`）属于**已有能力**，不属于本排除项；被排除的是**三违整改闭环**。

---

## 5. 五个复查例外的最终决定

| # | 场景 | 最终决定 | 对代码的直接后果 |
|---|---|---|---|
| ① | **自查自纠** | 手机端**无需复查**；业务需要复查时**由安环部李真真在 PC 系统中处理**；手机端不建立 reviewer 分配规则 | `reviewAccountId / reviewName / reviewedAt / reviewResult / reviewNote`、`t_review`、`assertCanReview()`、`bucketOf()` 的 `REVIEW` 分支、`views/mw/review.vue` → 全部 `OUT_OF_CURRENT_SCOPE` |
| ② | **总经理（无上级）** | **无需复查**，不为无上级设计特殊 reviewer | 同上；无需 `supervisor_id` 兜底逻辑 |
| ③ | **津城街道** | 按 ① 处理 | 同上；不建特殊复查机制 |
| ④ | **公司管理区域 5 人平级** | 按 ① 处理；不建"5 人平级自动指定复查人"算法 | 同上；且 **`公司管理` = `t_area.areaTeam` 历史巡查/管理区域分类，不是部门**，禁止重新解释为部门组织 |
| ⑤ | **复查打回后的第二轮** | 按 ① 处理；手机端不负责重新分配复查人，由 PC 处理 | 多轮复查（`PENDING_REVIEW → RECTIFYING → PENDING_REVIEW`）整条链路 `OUT_OF_CURRENT_SCOPE` |

**连带结论（重要）**：

1. NODE-02A 遗留决策 **D-01（复查人方案 A/B/C/D）作废**——不是"待选"，而是**本轮不实现**，因此不再需要业务方在 A/B/C/D 之间选择；
2. NODE-02A 用可执行用例证明的 **B-04 越权缺陷**（`assertCanReview()` 不校验操作人，任意账号可复查他人记录）**不再通过 V1 路径暴露**（整块暂缓），但代码仍在；**本轮不修、不删**，仅在 §12 作为启用风险登记；
3. NODE-02A 报告状态 `WAITING_HUMAN_DECISION` 由本报告**关闭**：复查问题已由业务负责人直接裁定为"手机端不做"。

---

## 6. NODE-01 模块 A / B / C 分类

### 分类定义
- **A 类**：当前 V1 必须保留的能力；
- **B 类**：可保留作技术基础，但**不得继续扩展**；
- **C 类**：当前 V1 暂缓、不继续开发，统一标记 `FUTURE / OUT_OF_CURRENT_SCOPE`，**代码不删除**。

### 6.1 关键前置结论：A 类能力**已存在于既有 `/mobile`**

审计发现：仓库中**已有完整的手机端网格长巡查 WebApp**（不是计划，是已实现代码）：

| 既有文件 | 行数 | 已实现能力 |
|---|---|---|
| `src/router/routes/modules/mobile.ts` | 111 | `/mobile` 独立路由树 |
| `src/layouts/mobile.vue` | 176 | 移动端壳（顶栏 + 底部四导航） |
| `src/views/mobile/index.vue` | 265 | 首页：我的网格/今日巡查/历史巡查 + 开始巡查 + **三违录入**入口 |
| `src/views/mobile/grid/new.vue` | 932 | **新增巡查**：拍照 + 上传 + 提交 `POST /api/site-mgmt/grid-records` |
| `src/views/mobile/grid/ledger.vue` | 440 | 巡查台账（服务端 gridScope 过滤） |
| `src/views/mobile/grid/index.vue` | 273 | 我的网格 |
| `src/views/mobile/grid/detail.vue` | 233 | 巡查详情 |
| `src/views/mobile/grid/rectify.vue` | 622 | 补传整改照片（走正式 PUT 接口） |
| `src/views/mobile/violation/new.vue` | 979 | **手机端三违录入**：人员选择器 + 照片 + 提交 `POST /api/violations` + 服务端责任/扣分结果回显 |
| `src/views/mobile/me.vue` | 119 | 我的（登录身份/退出） |
| `src/views/mobile/grid/photo-group.ts` | 202 | 照片组（上传中/失败重试/删除） |
| `src/api/hse/grid-upload.ts` | — | 图片上传封装（入库相对路径） |

**因此：A 类能力的正确落点是既有 `/mobile`，而 `/mw` 中与之重复的模块一律降为 C 类。**

### 6.2 逐模块分类

| 模块（NODE-01 产物） | 行数 | 分类 | 判定依据 |
|---|---|---|---|
| `core/status.ts` 六态状态机（含 `PENDING_REVIEW`） | 63 | **C** | 复查/转派态整体 OUT；V1 只需"已保存/已提交"这类展示态 |
| `core/flow.ts` — BEFORE 必须第一步 | 189 | **A（概念）/ B（代码）** | "先拍照"仍是采集纪律；但 `assertCanReview`、`assertCanTransfer`、`assertCanSubmitRectify`、`bucketOf` 的 REVIEW 分支 → **C** |
| `core/flow.ts` — 发现人 ≠ 整改人 | — | **C** | 属责任判定域，手机端不做 |
| `core/types.ts` 8 表实体 | 352 | **B** | 类型定义本身无害，保留不扩展；`ReviewRecord`/`TransferRecord` 相关 → C |
| `core/schema.ts` WPS 8 表定义 | 259 | **C**（表）/ **B**（文档价值） | 作为"过度设计证据"保留；`t_review`/`t_transfer`/`t_account`/`t_roster`/`t_area`/`t_violation_rule` 六表不建 |
| `core/id.ts` violationId 生成 | 74 | **B** | 编号思路可留；正式 ID 必须由服务端生成 |
| `core/scope.ts` 范围过滤 | 123 | **B** | 服务端 `gridScope` 才是权威；客户端只做体验收窄 |
| `core/seed.ts` TEST 种子数据 | 232 | **B** | 仅本地测试用，禁止与正式数据混淆 |
| `photo-store.ts` 图片压缩/DataURL | 186 | **B** | 与既有 `photo-group.ts`/`grid-upload.ts` 功能重叠，不得扩展 |
| `session.ts` 独立手机号会话 | 79 | **C** | 与"禁改登录/JWT"冲突，且已有 JWT 体系；**不应启用** |
| `staging.ts` 照片暂存 | 144 | **B** | 暂存思路可留，不得发展成离线业务库 |
| `transports/types.ts` + `index.ts` 抽象 | 147 | **B** | 保留抽象，不得扩展成独立业务体系 |
| `transports/local.ts` 本地 TEST | 264 | **B** | 仅测试用 |
| `transports/http.ts` WPS/中间层 | 207 | **C** | WPS 作为独立业务库定位已降级（见 §10） |
| `index.ts` 门面 — 登录/主数据/照片/选人/选行为/生成记录 | ~400 | **B**（作参考） | 能力已在既有 `/mobile` + 正式 API 中存在 |
| `index.ts` — `submitRectify` / `transferOut` / `acceptTransfer` / `closeTransfer` / `reviewViolation` / `listMyBuckets`(REVIEW/TASK) | ~250 | **C** | 属排除范围 |
| `views/mw/login.vue` 手机号登录 | 255 | **C** | 越界：不得新建登录体系 |
| `views/mw/home.vue` | 251 | **B** | 首页形态可参考既有 `mobile/index.vue` |
| `views/mw/violation/capture.vue` 拍现场照片 | 320 | **B** | 采集能力已有（既有 `grid/new.vue`、`photo-group.ts`） |
| `views/mw/violation/person.vue` 选人 | 236 | **B** | 已有正式选择器实现 |
| `views/mw/violation/behavior.vue` 选行为（字典驱动） | 219 | **B** ⭐ | 既有手机端三违用的是**自由文本**，`字典选择`是真实增量方向，但须改为消费正式字典接口（G-1） |
| `views/mw/violation/dispose.vue` 处置三选一 | 209 | **C** | 整改/转派/延后均不在手机端 |
| `views/mw/violation/rectify.vue` 整改 | 292 | **C** | 三违整改归 PC |
| `views/mw/violation/transfer.vue` 转派 | 289 | **C** | 转派 OUT |
| `views/mw/record.vue` 记录详情 | 371 | **B** | 简单状态展示可留，但须删除整改/复查字段展示 |
| `views/mw/record-list.vue` | 195 | **B** | 同上 |
| `views/mw/rectify.vue` / `review.vue` / `task.vue` 三清单 | 34 | **C** | 我的整改/我的复查/我的任务 均 OUT |
| `layouts/mw.vue` 移动端布局 | 176 | **B** | 已有 `layouts/mobile.vue` |
| `router/routes/modules/mw.ts` 整树 | 107 | **C** ⭐ | **建议不对外发布**（见 §12 R-1/R-3） |
| `__tests__/foundation.spec.ts` | 476 | **B** | 断言的是暂缓行为，重基线后需复审 |
| `__tests__/review-gate.audit.spec.ts` | 164 | **B** | 作为决策证据保留（证明了死结 + B-04 越权） |
| `docs/MOBILE-WPS/*`（10 份） | — | **B** | 保留为决策留痕；由本报告统一覆盖口径 |
| `_mw_audit/*`（4 个脚本） | — | **B** | 只读审计工具，保留 |

---

## 7. 8 张 WPS 表重新评估

| 表 | V1 是否真正需要 | 判定 | 处置 |
|---|---|---|---|
| `t_account` 账号表 | **否** | 重复建设 | **C**：沿用现有 users + JWT + `employee_assignment`；字段保留作未来扩展 |
| `t_roster` 花名册 | **否** | 重复建设 | **C**：唯一真源已有 `v_employee_org_full` + `GET /api/hse/employee/employees/selector` |
| `t_violation_rule` 三违行为 | **概念需要，表不需要** | 部分重复 | **C（表）/ A（概念）**：正式字典已有 `sanwei_behavior_dict`，但**缺面向网格长的只读接口**（G-1） |
| `t_area` 责任区域 | **否** | 重复建设 | **C**：已有 `grid_areas` + `GET /api/site-mgmt/grid-areas` |
| `t_violation_record` 记录主表 | **是（需裁剪）** | 核心 | **A（裁剪后）**：保留 发现人/时间/地点/检查区域/违章人快照/三违行为/照片；整改与复查字段 → C |
| `t_photo` 照片表 | **是（仅 BEFORE）** | 核心 | **A（BEFORE）**：`AFTER`（整改后照片）→ **C**（三违整改归 PC） |
| `t_transfer` 转派表 | **否** | 过度设计 | **C** |
| `t_review` 复查表 | **否** | 过度设计 | **C**（**不删除代码**） |

### 7.1 八问八答

1. **哪些表是当前"手机端网格长巡查"真正需要的？**
   只有 `t_violation_record`（裁剪后）与 `t_photo`（仅 BEFORE）。**且这两项在正式链路中已由 `grid_record` / `violation_record` + `/uploads` 承载**——若走正式 API，连这两张 WPS 表都不需要。
2. **哪些表属于为独立三违闭环而过度设计？**
   `t_account`、`t_roster`、`t_violation_rule`、`t_area`、`t_transfer`、`t_review` 六张，全部是在复制 PC 既有能力。
3. **哪些字段可保留作为未来扩展？**
   `t_violation_record` 的 `rectifyAccountId/rectifyName/measure/rectifiedAt/reviewAccountId/reviewName/reviewedAt/reviewResult/reviewNote/responsibleAreaCode/transferId` —— **仅作字段预留，V1 不写、不展示、不参与状态流转**。
4. **哪些字段当前页面根本不应该出现？**
   整改责任人、整改措施、整改时间、复查人、复查结论、复查意见、复查时间、责任区域、转派单号，以及一切扣分相关字段。
5. **V1 是否真的需要 `t_review`？** **否。**
6. **V1 是否真的需要 `t_transfer`？** **否。**
7. **V1 是否应该把"整改"放在手机端？** **否**（三违整改）。例外：网格巡查记录自身的整改照片补传是既有能力，保留。
8. **如果现有 PC 系统已负责整改，手机端只做什么？**
   **只做：采集（照片 + 事实）→ 提交 → 查询**。

---

## 8. 当前手机端真正需要的业务流程

```text
[登录] 现有 JWT（不新建登录）
   ↓
[首页] 我的网格 / 今日巡查 / 历史巡查
   ↓
[开始巡查] 拍现场照片 → 填巡查信息 → 保存 → POST /api/site-mgmt/grid-records
   ↓
[发现三违] 选三违人员（正式选择器）→ 选三违行为（字典）→ 拍照 → 保存 → POST /api/violations
   ↓
[结果] 服务端责任解析 + 扣分在服务端完成，手机端只回显实际结果
   ↓
[查询] 巡查台账 / 三违记录（服务端按身份过滤）
   ↓
[交棒] 后续整改 / 复查 / 扣分 / 归档 全部由现有 PC HSE 系统处理
```

---

## 9. 已有 HSE 系统可复用能力（只读审计结论）

### 9.1 已有能力 → 直接复用

| 能力 | 现有实现 | 证据位置 |
|---|---|---|
| 登录 / 身份 / 权限 | 现有 JWT + `accessStore` + `authenticatedEmployeeResolver` | `server/middleware/auth.js`、`services/authenticatedEmployeeResolver.js` |
| 网格范围（行级） | `gridScope.js` `resolveGridScope()` + `buildScopeSqlCondition()`，越权 403 `SCOPE_DENIED` | `server/services/gridScope.js` |
| 移动端壳与导航 | `/mobile` 路由树 + `layouts/mobile.vue`（3130 行页面） | `src/views/mobile/**` |
| 照片上传链 | `POST /api/files/upload/image`，前端已封装 `grid-upload.ts`（入库相对路径） | `server/routes/files.js:37`、`src/api/hse/grid-upload.ts` |
| 照片组交互（重试/删除/进度） | `photo-group.ts` | `src/views/mobile/grid/photo-group.ts` |
| 责任解析 + 扣分（E-08-11） | `violationService` + `ruleEngine` 服务端计算，前端只回显 | `server/services/violationService.js`、`services/ruleEngine/*` |
| WPS 云端缓冲（既有通道） | WPS→PG 单向 Pull，`grid_record_sync_map` | `server/routes/wps-grid-sync.js`、`services/wpsGridPullEngine.js` |

### 9.2 已有接口 → 直接调用

| 需求 | 接口 | 权限 |
|---|---|---|
| 我的网格 | `GET /api/site-mgmt/grid-areas` | `hse:site:grid:view` |
| 巡查列表 / 台账 | `GET /api/site-mgmt/grid-records`（服务端按身份过滤）、`/filter-options` | `hse:site:grid:view` |
| 新增巡查 | `POST /api/site-mgmt/grid-records` | `hse:site:grid:create` |
| 更新/补传整改照片 | `PUT /api/site-mgmt/grid-records/:id` | `hse:site:grid:update` |
| 人员选择（唯一真源） | `GET /api/hse/employee/employees/selector`（`v_employee_org_full`） | 已登录 |
| 三违录入 | `POST /api/violations` | `admin / safety_manager / grid_inspector` |
| 三违台账 / 统计 | `GET /api/violations`、`/stats`、`/filter-options`、`/statistics/*`、`/export/csv` | 读权限 |
| 三违详情 + 证据链 | `GET /api/violations/:id`、`/:id/evidence-chain` | 读权限 |
| **三违整改** | `PUT /api/violations/:id/rectify` | 写权限 |
| **三违复查** | `PUT /api/violations/:id/review` | 写权限 |
| 三违候选（巡查→三违） | `GET/POST /api/grid-violation-candidates`（`/generate`、`/:id/confirm`、`/reject`、`/revoke`、`/dict`） | `admin / hse_manager / safety_manager` |
| 网格归属 | `GET /api/grid-attribution/pending`、`POST /attribute`、`DELETE /revoke`、`GET /attributed` | `admin / hse_manager / safety_manager` |

### 9.3 重复建设 → 暂缓

`/mw` 的账号体系、花名册、区域目录、转派、复查、整改、扣分 —— 上表中**每一项都已有正式实现**，全部暂缓。

---

## 10. 当前真正缺口（只补最小缺口，不擅自改 PC 业务）

| # | 缺口 | 现状 | 建议（待授权，本轮不改） |
|---|---|---|---|
| **G-1** | **三违行为字典对网格长不可用** | 既有 `/mobile/violation/new.vue` 的"三违行为"是**自由文本**；正式字典 `sanwei_behavior_dict` 存在，但 `GET /api/grid-violation-candidates/dict` 角色白名单为 `admin/hse_manager/safety_manager`，**不含 `grid_inspector`**；而 `POST /api/violations` 却允许 `grid_inspector` —— 权限不一致 | 三选一：① 新增面向网格长的**只读**字典端点；② 放宽 `/dict` 白名单；③ 维持自由文本 + 服务端映射。**须业务/后端授权** |
| **G-2** | 手机端三违的**检查来源口径** | 现有 `check_source` 枚举 = `company / township / self`；"网格长巡查发现"归属哪一类未定义 | 请业务确认映射；未确认前手机端**原样提交、不做默认转换** |
| **G-3** | 离线/无云提交 | 既有 `/mobile` 走在线正式 API。ARCH-02 已判定："关机也能提交取决于 HSE Backend 部署位置，不是 WPS 能力" | 属运维/部署决策；若 Backend 长期在线，**WPS 缓冲不是必需** |
| **G-4** | 手机端查询筛选维度 | 现有 `/mobile` 台账筛选维度有限 | 按网格/日期/状态补齐（最小改动） |
| **G-5** | 行为字典与台账口径 | 前期审计发现 `sanwei_behavior_dict` 仅 15 条/1 类，实际台账出现 21 个值（含组合与字典外） | 字典治理，属既有数据治理事项 |

> **纪律**：以上缺口**只登记、不动手**。不得以"填补缺口"为由修改 PC 业务接口或权限模型。

---

## 11. 后续 NODE-02 应该做什么

**原 NODE-02（WPS 建表 + 独立闭环落地）作废。** 建议 NODE-02 重新定义为：

1. **确认唯一手机端载体 = 既有 `/mobile`**，`/mw` 不对外发布（或仅本地保留作参考）；
2. **与正式 API 对齐**：逐页核对 `/mobile` 六个页面调用的字段与后端契约；
3. **最小缺口补齐**：按 §10 的 G-1 / G-2 / G-4 补，且每补一项都要单独授权；
4. **真机验证**：沿用 ARCH-03 系列的真机验收方法；
5. **WPS 定位降级**：从"独立业务库"降为"（可选）离线暂存方案"；若采用，**必须与既有 WPS-PG-SYNC 物理隔离**，不得双写、不得成为第二事实源；
6. **NODE-01 文档收口**：`docs/MOBILE-WPS/` 下 10 份文档保留作留痕，口径以本报告为准。

**NODE-02 不应该做**：建 8 张 WPS 表、实现复查、实现转派、实现责任判定、实现扣分、重建 PC 台账。

---

## 12. 风险与待确认事项

| # | 风险/待确认 | 说明 | 建议 |
|---|---|---|---|
| **R-1** | **两套移动端并存** | `/mobile`（正式）与 `/mw`（NODE-01）同时存在，用户与运维会混淆 | `/mw` 标记为 `FUTURE / OUT_OF_CURRENT_SCOPE`，**不挂入口、不发布** |
| **R-2** | **`/mw` 会话绕过 JWT** | `meta.ignoreAccess` + 独立手机号会话（`session.ts`），V1 是"临时身份识别，非正式安全认证" | 与"禁改登录/JWT/权限体系"冲突；启用即绕过正式鉴权 |
| **R-3** | **B-04 越权缺陷仍在代码中** | `assertCanReview()` 不校验操作人，任意账号可复查他人记录（NODE-02A H3 用例已实证） | 因整块暂缓不再经 V1 暴露；**任何人启用 `/mw` 路由即重新暴露**。本轮不修、不删 |
| **R-4** | **数据双写 / 双事实源** | 若 `/mw` 的 WPS 表与既有 `grid_record` WPS 表并存 | 明令：MOBILE-WPS-V1 与既有 WPS-PG-SYNC 物理隔离，禁止 PG→WPS、禁止覆盖正式数据 |
| **R-5** | **三违行为字典权限不一致** | 见 G-1 | 需业务 + 后端共同裁定 |
| **R-6** | **既有 `/mobile` 的 V1 完成度未逐页验收** | ARCH-03 系列有真机验证报告，但本轮未逐页确认"巡查→三违"衔接是否已打通 | NODE-02 首项任务应为**逐页验收** |
| **R-7** | **业务口径待确认** | ① 网格巡查发现的三违归属哪个 `check_source`；② 是否仍需要 WPS 离线缓冲；③ 152 名 `employment_relation=NULL` 是否纳入人员选择范围 | 列入 NODE-02 前置清单 |
| **R-8** | **既有工作区存在他人并发修改** | `git status` 显示 `server/`、`docs/191副/`、`views/hse/ai-analysis/` 等文件为已修改态（非本轮、非本节点产生） | 提请确认是否存在并发会话/计划任务 |

---

## 13. 最终状态

```text
MOBILE_WPS_SCOPE_REBASELINE = PASS

MOBILE_WPS_CURRENT_SCOPE      = GRID_INSPECTION_MOBILE_ENTRY
MOBILE_WPS_REVIEW_MODULE      = CURRENTLY_OUT_OF_SCOPE
MOBILE_WPS_DEDUCTION          = CURRENTLY_OUT_OF_SCOPE
MOBILE_WPS_RESPONSIBILITY     = CURRENTLY_OUT_OF_SCOPE
```

补充状态量：

```text
MOBILE_WPS_TRANSFER_MODULE    = CURRENTLY_OUT_OF_SCOPE
MOBILE_WPS_T_REVIEW_TABLE     = FUTURE / OUT_OF_CURRENT_SCOPE（代码保留，不删除）
MOBILE_WPS_T_TRANSFER_TABLE   = FUTURE / OUT_OF_CURRENT_SCOPE（代码保留，不删除）
MOBILE_WPS_ROUTE_MW           = NOT_FOR_RELEASE（不挂入口、不发布）
MOBILE_WPS_MOBILE_CARRIER     = 既有 /mobile（唯一手机端载体）
MOBILE_WPS_NODE_02A_DECISION  = CLOSED_BY_BUSINESS（复查不做，D-01 A/B/C/D 作废）
NEXT_STAGE                    = WAITING_AUTHORIZATION（等待 NODE-02 重新定义授权）
```

**本轮到此停止，等待下一阶段授权。**

---

## 附：审计证据索引

| 结论 | 证据 |
|---|---|
| `/mw` 为独立路由树、不接 JWT | `src/router/routes/modules/mw.ts:9-11, 26, 33-102` |
| 8 张 WPS 表定义 | `src/api/mw/core/schema.ts:52-232` |
| 六态状态机含 PENDING_REVIEW | `src/api/mw/core/status.ts:17-31` |
| 复查断言不校验操作人（B-04） | `src/api/mw/core/flow.ts:150-154` |
| 复查/转派/整改门面方法 | `src/api/mw/index.ts:405-601` |
| 既有手机端网格巡查路由 | `src/router/routes/modules/mobile.ts:17-107` |
| 既有手机端三违录入复用正式 API | `src/views/mobile/violation/new.vue:1-19, 299-319` |
| 既有巡查新增/整改照片走正式接口 | `src/views/mobile/grid/new.vue:6,23,353`；`grid/rectify.vue:13,191` |
| 三违 CRUD + 整改 + 复查接口 | `server/routes/violations/main.js:64-98` |
| 网格记录 CRUD 接口 | `server/routes/site-mgmt/main.js:74-81` |
| 照片上传接口 | `server/routes/files.js:37` |
| 三违候选字典角色白名单（不含 grid_inspector） | `server/routes/hse-grid-violation-candidates.js:31` |
| WPS→PG 单向 Pull（既有缓冲通道） | `server/routes/wps-grid-sync.js:1-14, 58-108` |
| 人员选择器接口 | `src/api/hse/employee.ts:513` |
| git 复核：目标路径仅新增 | `git status --porcelain` → `?? .../api/mw/`、`?? layouts/mw.vue`、`?? routes/modules/mw.ts`、`?? views/mw/` |

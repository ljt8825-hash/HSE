# HSE 平台总体业务架构基线 V1.0

| 项 | 内容 |
|---|---|
| 文档编号 | HSE-ARCH-BASELINE-V1.0 |
| 制定日期 | 2026-10-27 |
| 版本 | V1.0（首版） |
| 状态 | **基线草案 · 待业务签字** |
| 适用仓库 | `ljt8825-hash/HSE`，分支 `feat/hse-business-closure` |
| 基线提交 | `a02aab01ed5ab8bf5fb1fecad1f4d23e510bf28b` |
| 上位依据 | 本文件为后续前端、数据模型、后端、模块重构的**上位架构依据** |
| 配套文档 | `HSE平台架构决策与工作日志.md`、`HSE平台模块实施状态总表.md` |
| 证据等级 | 全部结论来源于**仓库实际代码 + DEV 库实际结构/数据**；生产库**未读取**（见 §0） |

---

## 0. 证据口径与免责声明

### 0.1 本文件的事实来源

| 来源 | 具体对象 | 用途 |
|---|---|---|
| 代码事实 | `server/app.js` 的 104 处 `app.use('/api…')` 挂载；`server/routes`、`controllers`、`services` | 判定"后端是否存在" |
| 代码事实 | `安全看板vben/apps/web-naive/src/router/routes/modules/*.ts`（22 个文件 / 165 个路由节点） | 判定"前端页面是否存在" |
| 代码事实 | `安全看板vben/apps/web-naive/src/views/**`（21 个一级目录） | 判定"前端是否已建页面" |
| 数据库事实 | DEV 库 `safety_dashboard_dev`（127.0.0.1）的 `information_schema` + 精确 `COUNT(*)` | 判定"表是否存在 / 是否有真实数据" |
| 文档事实 | `docs/**`、仓库根目录 `*.md` 中已有设计文档 | 判定"是否只有规划" |

### 0.2 必须声明的三点

1. **生产库 `safety_dashboard` 本次未读取。** 本任务明确禁止生产环境操作。凡标记为「行数」的数据，一律是 **DEV 库** 数据，只能证明"该表有真实业务数据流入"，**不能**等价于生产数据量。
2. **`COUNT(*) = 0` 不等于"该模块没做"。** 存在三种情况：(a) 建了表无数据；(b) 模块走的是**内存降级**分支；(c) 数据在另一张表。本文件对零行表逐项标注判断依据，不合并处理。
3. **"已建成"≠"可验收"。** 本文的 `FROZEN` 只用于**已经过独立审计并出具 PASS 结论**的模块（见 `HSE平台模块实施状态总表.md` 的"证据"列）。其余一律不写成"已完成"。

### 0.3 与既有文档的关系（不覆盖，只收敛）

仓库已有大量架构/模型文档，本文件**不取代**它们，而是作为上位收敛：

| 既有文档 | 与本文件关系 |
|---|---|
| `HSE业务能力模型.md`（L1-L3 能力域） | 互补：它回答"业务能力"，本文件回答"代码与数据归属" |
| `HSE核心数据模型设计报告.md`（1571 行）、`HSE系统核心业务数据模型设计报告.md`（973 行） | 下游：本文件确认归属后，它们才是有效的数据模型依据 |
| `HSE系统建设决策基线与AI协同开发记录_Sprint11.md` | **已被本文件部分推翻**：其记录的 `F:\deploy\...` 路径、Ant Design Vue 技术栈已与现状不符（现为 `G:\hse-dashboard` + Naive UI）。该文件保留为历史档案，不再作为约束 |
| `docs/HSE系统架构审计报告_20260912.md`、`docs/HSE架构重构行动计划_20260912.md` | 前序审计；本文件在其基础上补齐"数据归属"与"模块状态"两个缺口 |
| `docs/191副/project_memory.md` | **受保护文件，本次零改动**（blob `0e0e178…` 前后一致） |

---

## 1. 仓库真实结构审计

### 1.1 顶层结构（仅列有架构意义的目录）

```text
G:\hse-dashboard\
├── server\                      ← 唯一后端（Express 4 / Node）
│   ├── app.js                   ← 658 行，104 个 app.use('/api…') 挂载点
│   ├── routes\        (170+ 文件，含 .bak 历史副本)
│   ├── controllers\   (52 个)
│   ├── services\      (129 个，含 1 个 *.unit.test.js)
│   ├── config\        (db / performance / hseRules 规则中心)
│   ├── middleware\    (auth / error / requestLogger / validate)
│   ├── schemas\       (zod 校验层)
│   ├── utils\         (logger / encryption 等)
│   └── scripts\       (prod-launch.cjs ← 生产启动器)
├── 安全看板vben\                 ← pnpm monorepo（Vben5）
│   ├── apps\web-naive\           ← ★ 生产在用前端（Naive UI，dist 10-19 构建）
│   ├── apps\web-antd\            ← 遗留前端（Ant Design Vue，dist 09-28 构建，已非生产）
│   ├── apps\web-ele / web-tdesign / web-antdv-next / backend-mock  ← 框架示例，非业务
│   └── packages\                 ← Vben 共享包
├── safety-check-h5\             ← 单文件 H5（index.html）
├── grid-mobile-cloudflare\      ← 独立子项目：Cloudflare Pages + Worker + 飞书多维表格
│   ├── pages\  worker\  frontend\  docs\  _pages_deploy\
├── docs\                        ← 业务/审计文档主目录（含 AI智能分析\ 各期报告）
├── sql\                         ← 建库/迁移脚本（unified_schema.sql 48KB 等）
├── deploy\ nginx\ monitoring\ logstash\ security\   ← 部署与运维配套
├── scripts\ tools\              ← 仓库级脚本
└── （大量历史调试产物：*.log、*.cjs、_shots、_verify、backups 等，非架构对象）
```

### 1.2 真实技术栈（以代码为准）

| 层 | 实际技术 | 证据 |
|---|---|---|
| PC 前端 | Vue 3 + Vben5 + **Naive UI** | `apps/web-naive`；`server/app.js:285` 静态托管 `apps/web-naive/dist` |
| 移动端 | 两套并存：① `web-naive/src/views/mobile/**`（14 个 vue）② `grid-mobile-cloudflare`（Cloudflare Pages+Worker→飞书） | 两处均存在，见 §11-C3 |
| 后端 | Node + Express，三层（routes→controllers→services） | `server/app.js` |
| 数据库 | PostgreSQL 17，`safety_dashboard`（生产）/ `safety_dashboard_dev`（开发） | `server/config/db.js` |
| 规则 | `server/config/hseRules/*.json` 单一源 + `index.js` loader | 培训 `planStatusFlow` 已落地为后端状态机 |
| 日志 | winston + winston-daily-rotate-file（2026-10-27 修复） | `server/utils/logger.js` |
| 生产启动 | **Windows 计划任务 `HSE-Backend`** → `node scripts/prod-launch.cjs`（**不是** Windows Service） | 计划任务实测；`prod-launch.cjs` 头注释"Windows 服务"与事实不符，属文档缺陷 |

### 1.3 规模基线（可用于判断"改动影响面"）

| 指标 | 数量 | 口径 |
|---|---|---|
| 后端 service 文件 | 129 | `server/services/*.js` |
| 后端 controller 文件 | 52 | `server/controllers/*.js` |
| 已挂载 API 前缀 | 104 | `app.js` 中 `app.use('/api…')` |
| 前端路由模块 | 22 | `router/routes/modules/*.ts` |
| 前端路由节点 | 165 | 其中 `demos` 4 + `vben` 9 = 13 为框架示例，业务节点 152 |
| 前端视图一级目录 | 21 | `web-naive/src/views/*` |
| DB 表（全库） | 366 | DEV `information_schema` 基线表 |
| DB 表（系统表） | **263** | 排除 42 `backup_9x_*` + 48 `t_0X_*` + 6 `*_bak_*` + 7 `*_backup_*` |
| 其中非空 | 160 | 精确 `COUNT(*) > 0` |
| 其中零行 | 103 | 精确 `COUNT(*) = 0` |
| 外键约束总数 | **185** | 相对 263 张系统表，覆盖率显著偏低（见 §10.4） |

---

## 2. 分层架构总览

任务书提出的"基础主数据 / HSE 核心业务 / 专项安全 / 保障经营 / 综合分析"五层，经实际代码校正后为 **7 层**——多出的两层不是规划，是**已经在跑的代码与数据**：

```text
┌─ L0 平台支撑层 ────────────────────────────────┐
│ 认证鉴权 / 组织权限 / 审计 / 通知 / 工作流 / 文件 / 导入框架 │
└───────────────────┬───────────────────────────┘
                    │ 被所有层依赖
┌─ L1 基础主数据层 ───────────────────────────────┐
│ 人员 · 组织 · 岗位 · 作业单元 · 区域 · 车辆 · 字典 · 证书 │
└───────────────────┬───────────────────────────┘
                    │ 被引用，不反向拥有
┌─ L2 HSE 核心业务域 ─────────────────────────────┐
│ 风险 · 检查 · 隐患 · 三违 · 事故 · 培训 · 安全生产费 │
└───────────────────┬───────────────────────────┘
                    │
┌─ L3 专项安全管理域 ─────────────────────────────┐
│ 交通 · 消防 · 职业健康 · 特种设备 · 应急 · 标准化 · 制度 │
└───────────────────┬───────────────────────────┘
                    │
┌─ L4 保障/经营管理域 ────────────────────────────┐
│ 保险 · 责任合同 · 会务 · 安全文化 · 供应链        │
└───────────────────┬───────────────────────────┘
                    │
┌─ L5 责任与考核域（★ 任务书草案未列，实际代码已存在）─┐
│ 月度履职考核 · 扣分 · 评分 · 周期 · 冻结 · 门户    │
└───────────────────┬───────────────────────────┘
                    │
┌─ L6 综合分析与智能层 ───────────────────────────┐
│ 驾驶舱 · 统计 · 预警 · 报告 · BI · AI · 数据质量   │
└────────────────────────────────────────────────┘
```

### 2.1 为什么必须新增 L0 和 L5

- **L0 必须单列**：`users/roles/role_menu/menus` 与 `sys_operation_log` 是所有业务域的横切依赖。如果把它当"系统管理一个小菜单"，会导致权限模型在重构时被反复踩坏（历史上已发生：`router/routes/index.ts` 注释记录了"全量展开绕过 `meta.authority`"这个 P0 权限缺陷）。
- **L5 必须单列**：`hse_assessment_*` 共 **24 张表**，`hse_assessment_score` 3670 行、`deduction` 940 行、`target` 925 行、`event_log` 717 行，且月度考核有独立调度器 `assessmentScheduler.js` 与独立门户页 `assessment-portal`。**它不是"综合分析"的一个视图，而是有独立事实数据的一级业务域**。任务书把它归入"考核"（在综合分析层），与实际代码冲突，**本文以代码为准**。

---

## 3. L0 平台支撑层

| 模块 | 后端 | 前端 | 核心表（DEV 行数） | 实施状态 |
|---|---|---|---|---|
| 认证与登录 | `routes/auth.js`、`routes/mobileAuth.js`、`middleware/auth.js` | `views/_core/authentication` | `users`(64)、`login_attempts`(6)、`token_blacklist`(13) | FROZEN（改动需单独授权） |
| 角色与权限 | `routes/roles.js`、`menus.js`、`requireRole`/`requirePermission` | `views/system/roles`、`system/users` | `roles`(5)、`user_role`(1)、`role_menu`(98)、`menus`(80) | FROZEN |
| 审计 | `routes/audit.js`、`hse-audit-records.js` | `views/security/audit` | `sys_operation_log`(4929)、`audit_record`(0) | BACKEND（旧 `audit_record` 已停用） |
| 通知 | `services/notificationService.js` | `views/hse/notifications` | `notifications`(9) | BACKEND |
| 工作流 | `services/workflowService.js` | `views/hse/workflow` | `workflows`(0)/`workflow_instances`(0)/`workflow_tasks`(0)/`workflow_history`(0) | **DATA_MODEL（建表未启用，零数据零写入）** |
| 文件 | `routes/files.js`、`file-records.js`、`documentService.js` | 分散在各业务页 | `file_records`(396) ← **被 42 张表外键引用，是实际的文件中枢** | BACKEND |
| 导入框架 | `services/importExcelService.js`、`batchImportService.js`、`importMemoryService.js` | `views/hse/batch-import` | `employee_import_batch`(7)、`employee_import_pending`(13642)、`field_mapping_config`(20)、`hse_batch_import_tasks`(1) | BACKEND（详见 §15） |
| 待办中心 | `routes/todos.js`、`todo-plans.js`、`services/hseTasksService.js` | `views/hse/todos` | `hse_todo_sources`(10)、`hse_tasks`(0) | **BACKEND 部分实现**（`hseTasksService:144` 存在恒早退缺陷，见 §12-P1-4） |
| 事件总线 | `routes/hse-events.js`、`hse-chain.js` | `views/hse/alerts`（部分） | `hse_events`(16)、`hse_event_timeline`(0)、`hse_event_links`(0) | DATA_MODEL |

---

## 4. L1 基础主数据层

### 4.1 主数据认定（不是照搬任务书候选，而是按"是否被多域引用"判定）

判定标准（三条同时满足才算主数据）：

1. 有独立生命周期（可增删改，不因某业务单据消亡而消亡）；
2. 被 **≥2 个不同业务域**引用；
3. 有稳定的业务唯一键。

| 候选 | 实际表 | DEV 行数 | 被谁引用（外键实证） | 认定 |
|---|---|---|---|---|
| **人员** | `employee` | 3417 | **31 张表**（accidents / hazards / violation_records / training_record / personnel_insurance / hse_assessment_target / project_risk_record / emergency_* …） | ✅ **主数据（最强）** |
| **组织** | `hse_org_unit` | 21 | **13 张表**（department / employee_assignment / hse_events / hse_rectifications / hse_safety_budget / hse_target_contracts / project_risk_record / risk_area_dict …） | ✅ **主数据** |
| **岗位** | `position` | 50 | **7 张表**（employee_assignment / employee_induction_training / employee_training_status / hse_position_alias / position_safety_profile / position_training_requirement / training_record） | ✅ **主数据** |
| **作业单元 / 工作类型** | `hse_operation_unit`(89)、`risk_work_type_dict`(9)、`risk_work_unit_dict`(43) | 有数据 | 仅风险域内部使用（`project_risk_record` 块键） | ⚠️ **主数据候选，但当前仅风险域独占** |
| **区域 / 网格** | `grid_areas`(63)、`risk_area_dict`(17) | 有数据 | `grid_inspection_records.grid_id → grid_areas`；`risk_area_dict.org_unit_id → hse_org_unit` | ⚠️ **两套区域并存，需归位（§11-C5）** |
| **车辆** | `vehicles` | 55 | **0 张表外键引用** | ❌ **物理上存在，架构上不是主数据**（见 §10.4 重大缺陷） |
| **基础字典** | `sanwei_behavior_dict`(15)、`risk_type_dict`(5)、`risk_work_type_dict`(9)、`risk_sources`(61)、`risk_lec_scale`(12)、`risk_level_config`(4)、`risk_level_thresholds`(6) | 有数据 | 各域内部 | ✅ 字典（分散，未统一字典中心） |
| **资格 / 证书** | `employee_certificate`(0)、`certificates`(0)、`license_demerit_records`(3) | **两张主表零行** | 无外键 | ❌ **未落地**（页面 `training/certificates` 存在但无数据链路） |
| **超龄人员** | `over_age_personnel`(1304) | 有数据 | 无外键；**另有孤儿表 `overage_personnels`(1108)** | ⚠️ **重复建设（§11-C6）** |
| **项目 / 合同** | `hse_target_contracts`(2433) | 有数据 | `org_unit_id`/`signee_employee_id` | ❌ 属业务单据（目标责任书），**非主数据** |

**结论：真正成立的主数据只有 3 个（人员 / 组织 / 岗位）+ 1 个准主数据（作业单元）。** 车辆、地点、证书都还没有成为架构意义上的主数据。

### 4.2 人员主数据的实际复杂度（必须写进基线，否则后续重构会踩空）

人员不是"一张 `employee` 表"，而是 **1 主表 + 5 张关系/派生表**：

| 表 | 行数 | 职责 | 问题 |
|---|---|---|---|
| `employee` | 3417 | 人员基本身份 | 主键 `id`，业务键为手机号/工号（历史存在双键） |
| `employee_assignment` | **28864** | 任职（人员×岗位×组织×时间） | 行数 = 8.4 倍人员数，**同一人多条并存，无"当前任职"唯一约束** |
| `hse_employee_org` | 1285 | 人员-组织映射 | 与 `employee_assignment.org_unit_id` **职责重叠** |
| `hse_employee_relation` | 1304 | 人员关系（上下级/监管） | 语义未在代码中统一 |
| `employee_history` | 1300 | 变更历史 | 与 `employee_assignment` 时间维度重叠 |
| `personnel` / `org_personnel` / `org_personnels` | 0 / 0 / 0 | 历史遗留 | **零行孤儿表** |

> 花名册唯一权威源已由既有任务确认为飞书表 `tbl2ZHdXX5d8R12a`，解析键顺序 phone → employee_code → name，fail-closed。本基线沿用该结论，不重新讨论。

---

## 5. L2 HSE 核心业务域

对每个域，给出「事实表 → 后端入口 → 前端页面 → 状态」四段证据。状态取值见 §16。

### 5.1 风险管理域

| 项 | 实际内容 |
|---|---|
| 事实表 | `risk_scene`(164) / `risk_scene_version`(164) / `risk_scene_applicability`(**1500**) / `project_risk_record`(714) / `risk_library_version`(1) / `risk_library_import_item`(328) / `risk_assessment_rule`(1) / `risk_area_dict`(17) / `risk_lec_scale`(12) / `risk_level_thresholds`(6) |
| 后端 | `services/riskLibraryService.js`、`riskControlService.js`、`riskScoreService.js`、`riskSnapshotService.js`、`hseRiskProfileService.js`；路由 `/api/risk-library`、`/api/risk-control`、`/api/hse/risk-profile`、`/api/hse/risk-score`、`/api/hse/risk-snapshot-admin` |
| 前端 | `views/risk-library/{scenes,project-risks,blocks}`、`views/risk-control`（风险清单 + 风险地图） |
| 规则 | `server/config/hseRules/` 内 `risk-*` JSON；等级 D=L×E×C，块 Σ D，阈值 ≥80/≥50/<50 |
| 状态 | **DATA_MODEL + BACKEND（DEV 已建 14 表 / 57 索引 / 84 约束，业务零种子）**。`hse_control_measures`(0) 与 `risk_hazard_links`(0) 未启用 |
| 关键约束 | 「风险 02」为可版本化数据源，**禁硬编码**；`content_hash`=SHA-256/10 字段；块键冻结 `(project_id, area_id, work_type_id, work_link)` |

### 5.2 检查管理域 —— **本域是全平台最严重的形式与实质断裂点**

| 子系统 | 表 | DEV 行数 | 后端 | 前端 | 判定 |
|---|---|---|---|---|---|
| 检查计划/任务/记录（新版） | `hse_inspection_plans` / `hse_inspection_tasks` / `hse_inspection_executions` | **0 / 0 / 0** | `services/inspectionCenterService.js`（52 处 SQL）+ `routes/hse-employee/inspection-center.js` | **无独立页面** | **DATA_MODEL 空壳** |
| 检查计划/任务/记录（旧版） | `inspection_plan` / `inspection_task` / `inspection_record` / `inspection_checklist_template` / `inspection_checklist_item` | **0 / 0 / 0 / 0 / 0** | 仅 `services/workflowService.js` 等零星引用 | `web-antd/src/views/inspection`（**遗留前端，生产不加载**） | **死表** |
| 网格巡查（真在跑） | `grid_inspection_records` | **2069** | `services/gridCompletionService.js`、`gridAttributionService.js`、`wpsGridSyncService.js` | `views/mobile/{grid,inspection}`、`views/ledger/grid`、`views/site/grid` | **FROZEN**（WPS→PG 单向同步，05-A~05-E 已验收） |
| 转运站检查（真在跑） | `transfer_station_check` | **130** | `services/transferStations.js` 链路 | `views/site/transfer-stations` | **BACKEND** |
| 车辆检查（真在跑） | `vehicle_check_record`(1)、`hse_driver_inspection_records`(3)、`vehicle_inspection_records`(3) | 少量 | `routes/vehicle-checks.js` | `views/site/vehicle-checks` | **BACKEND（三表并存，§11-C7）** |
| 驾驶员月度检查 | `driver_monthly` | **612** | `services/ruleEngine/adapters/driverMonthlyAdapter.js` | `views/assessment-monthly/mirror/driver-monthly` | **BACKEND** |

**架构结论：**

1. 「检查管理」在代码上有**两套完整的数据模型（新版 3 表 + 旧版 5 表）全部零行**，而真实现场检查分散在 4 个不同子系统（网格巡查 / 转运站 / 车辆 / 驾驶员）。
2. 检查中心的 API 挂在 **`/api/hse/employee/inspection-plans`** 这种语义错位的前缀下（`routes/hse-employee.js:52` 用 `router.use('/', ...)` 把检查中心塞进人员路由），且权限码复用 `hse:personnel:create/update/delete`。
3. 因此「检查管理域」不能算"已建设"，只能是 **ARCHITECTURE（待重新归位）**。

### 5.3 隐患治理域

| 项 | 实际内容 |
|---|---|
| 事实表 | **`hazards`(110)** ← 主流程；**`hazard_record`(9)** ← 检查中心派生；`hazard_versions`(0)、`hazard_attachments`(0)、`hse_rectifications`(0)、`rectification_action`(1)、`hse_reviews`(**0**)、`review_record`(1) |
| 后端 | `services/hazardService.js`（写入 `hazards`）、`hazardRectificationService.js`、`inspectionCenterService.js`（写入 `hazard_record`） |
| 前端 | `views/hazards`（列表）、`views/mobile/inspection/issue`（现场上报） |
| 状态 | **BACKEND**（`hazards` 110 行 = closed 60 / discovered 50） |
| 已知铁律 | 隐患 C1 = FROZEN：`review(pass)` 是**唯一正式关闭方式**；`close()` 为非正式收尾；`update()` 禁写复查字段；`hse_reviews.writer=1`，canonical key = `hazard_id`；`hse:hazard:review` 仅 `hse_manager` |
| ⚠️ 冲突 | `hazards` 与 `hazard_record` 是**两套隐患事实**，字段语义不同（前者文本人名 + 多 ID 冗余，后者纯 ID 引用），**未合并** |

### 5.4 三违管理域

| 项 | 实际内容 |
|---|---|
| 事实表 | **`violation_records`(2645)** ← 唯一活表；`violations`(1451) ← **零 INSERT/UPDATE，只读历史**；`grid_violation_candidates`(439)（AI/人工候选池）；`driver_violation`(194)、`driver_three_violation`(8)（交通侧）；`hse_sanwei_score_monthly`(170)（月度扣分汇总） |
| 字典 | `sanwei_behavior_dict`(15) |
| 后端 | `services/violationService.js`（27 处 `violation_records` SQL）、`violationCheckerScope.js`、`violatorResolver.js`、`gridViolationCandidateService.js`、`companyViolationDeduct.js` |
| 前端 | `views/site/violation/{candidates,records,analysis,ledger,assessment}`、`views/mw/**`（WPS V1 移动端 13 页）、`views/mobile/violation/new`、`views/ledger/violation` |
| 状态 | **BACKEND**（有真实数据、有闭环：候选→确认→记录→整改→复查→扣分） |
| ⚠️ 冲突 | `violations`(1451) 是**历史只读表**，仍有 25 个文件读它（多为统计/兼容接口）→ 报表口径可能同时读两表，**存在双源不合并风险** |

### 5.5 事故管理域

| 项 | 实际内容 |
|---|---|
| 事实表 | `accidents`(110)、`accident_versions`(436)、`hse_incident_records`(44)、`accident_persons`(0)、`accident_attachments`(0) |
| 后端 | `services/accidentService.js`（含 `STATUS_EN_TO_CN` 归一化 `:1522`、`STATUS_MAP:49-62`） |
| 前端 | `views/accidents`（1 个 vue）、`views/analysis/accident`（事故分析中心） |
| 状态 | **BACKEND + 状态重构 BLOCKED** |
| 已知缺陷（P3-13/14 实证） | `status` 为 `VARCHAR(16) NULL DEFAULT '处理中'`，无 CHECK/ENUM/FK；**6 套词表并存**（DDL 注释 2 值 / 原 zod 3 值 / 现 zod 8 值 / 后端 4+4 / 前端 4 EN / 性能种子另 2 套）；存在孤儿值 `pending`、`跟踪中`；`accidentUnsettled`(`:1067`) 用原始中文比较且 NULL 行被三值逻辑排除；**事故→保险理赔无任何链路** |
| 阻塞原因 | 真实生产 `accidents.status` 分布不可得 → RC-1 = BLOCKED（`hse-db` DNS 不可解析、本机无 docker） |

### 5.6 培训管理域

| 项 | 实际内容 |
|---|---|
| 事实表 | `training_plans`(35)、`training_records`(**19**)、**`hse_training_ledger_monthly`(598)**、`training_roster`(58)、`training_attachments`(12)、`training_versions`(12)、`training_requirements`(0)、`training_record`(0)、`taihang_trainings`(0) |
| 后端 | `services/trainingPlanService.js`、`trainingPlanStatusMachine.js`（S1 新增）、`trainingLedgerService.js`、`trainingRecordService.js`、`trainingStatsService.js`、`trainingRequirementService.js`、`trainingLedgerAutoInitScheduler.js` |
| 前端 | `views/training/{plans,records,certificates,assessments,comprehensive}`、`views/ledger/training` |
| 状态 | **BACKEND + 状态机 WARN-ONLY 观察期（自 2026-10-27 11:45 起两周）** |
| ⚠️ 核心冲突 | **台账 598 行（应培 14165 / 实际 14027 / 缺培 188 / 不完整 85，`source` 全部为 `excel-import`）vs 明细 `training_records` 19 行（其中 `is_deleted=false` 仅 5 行）→ 14027 : 5 = 2805:1**。事实源断裂，`S2 = BLOCKED / 业务需签字"培训完成以台账还是明细为准"` |
| 已修复 | `planStatusFlow` 6 态 6 转换已后端化；`createPlan` 绕过状态机已补齐；`updatePlan` 已加事务 + `FOR UPDATE`；审批字段 `approval_by_id/approved_by/approval_date` 已接入（存量 35 行仍全 NULL，**未回填，按授权保持原样**） |
| 已知缺陷 | `trainingLedgerAutoInitScheduler.js:83-88` 每月自动生成台账时把四项计数**直接写 0,0,0,0**（"默认都完成"），属**伪造完成**语义，需业务决策 |

### 5.7 安全生产费域

| 项 | 实际内容 |
|---|---|
| 事实表 | **`hse_safety_budget`(342)** ← 唯一有数据；`hse_material_price`(78)；`hse_safety_budget_backup_*`(3 张历史备份)；**`hse_cost_request`/`hse_cost_commitment`/`hse_cost_actual`/`hse_cost_allocation`/`hse_cost_import_batch` 全部 0 行**；`hse_budget_item`(0)；`safety_budgets`(0) |
| 字典 | `hse_cost_biz_domain`(3)、`hse_cost_invest_category`(7)、`hse_cost_op_type`(7) |
| 后端 | `services/costService.js`、`routes/cost.js`、`routes/hse-material-price.js` |
| 前端 | `views/objectives/budget/{annual,monthly-plan,expenditure,cost,material-price}`（5 页全建） |
| 状态 | **FRONTEND + BACKEND（预算侧）/ DATA_MODEL（申请→承诺→实际→分摊四段零数据）** |
| ⚠️ 冲突 | 任务书要求"预算 / 申请 / 承诺 / 实际 / 分摊 / 统计"，实际只有**预算段有数据**；后半段四表是纯 DDL 空壳。前端 5 个页面里 `expenditure`、`cost` 两页面对应的是空表 |

---

## 6. L3 专项安全管理域

| 专项 | 实际表 | 后端 | 前端 | 状态判定（有证据） |
|---|---|---|---|---|
| **交通安全** | `vehicles`(55)、`driver_monthly`(612)、`driver_violation`(194)、`driver_three_violation`(8)、`driver_assessment`(88)、`license_demerit_records`(3)、`vehicle_check_record`(1) | `services/ruleEngine/adapters/driverMonthlyAdapter.js`、`hse-driver-risk*.js` 路由组、`driver-risk-center` | `views/site/driver`、`views/training/driver`、`views/hse/driver-risk-center`（7 组件）、`views/assessment-monthly/mirror/driver-monthly` | **BACKEND（最完整的专项）** |
| **消防安全** | **`fire_equipment`(0)** | 仅 `services/importShared.js:493` 指向一个**内存表** `memory_fire_equipment`；`routes/overview.js:44` 消防统计**直接查 Excel 残留表** `t_08_现场管理_消防器材管理台账_无照片` | `views/site/fire-facility`（页面已建，接口契约 `/site-mgmt/fire-equipment`） | **FRONTEND 空壳 + 统计口径污染（§12-P0-2）** |
| **职业健康** | `employee_safety_profile`(30)、`position_safety_profile`(0) | `services/employeeHealthCheckScheduler.js`（体检提醒调度）、`hseRiskProfileService.js` | `views/hse/employee-profile`、`views/hse/risk-profile-detail` | **BACKEND 部分**（无独立"职业健康"域，寄居在风险画像） |
| **特种设备** | **无表、无 service、无路由** | 无（`grep 特种设备` 仅命中 `employeeCertificateService.js` 的证书类型关键字） | 无 | **❌ 未建设（规划）** |
| **应急管理** | `emergency_plans`(5)、`emergency_drills`(48)、`emergency_teams`(65)、`emergency_team_members`(401)、`emergency_materials`(5)、`emergency_events`(0)、`emergency_supplies`(0) | `services/emergencyService.js`、`routes/emergency.js` | `views/emergency/{plans,drills,teams,materials,events}`（5 页） | **BACKEND**（计划/演练/队伍/物资有数据；事件表 0 行） |
| **标准化** | `hse_assessment_standard`(26)、`safety_standard_clauses`(59)、`hse_clause_relations`(1)、`standard_evaluation_items`(0)、`standard_evaluation_tasks`(0) | `services/standardService.js`、`standardsService.js`、`standardEvaluationService.js`、`standardRelationService.js` | `views/hse/standard/{clauses,relation,suggestions}`、`views/hse/documents/{library,review}`、`views/regulations` | **BACKEND（条款/关系有数据；评价任务两表零行）** |
| **制度规章** | `regulations`(25)、`hse_regulations`(1)、`regulation_versions`(0)、`regulation_attachments`(2) | `services/regulationsService.js` | `views/regulations`、`views/standards/regulations` | **BACKEND（`regulations` 与 `hse_regulations` 双表并存，§11-C8）** |

---

## 7. L4 保障/经营管理域

### 7.1 保险管理 —— 违反"保险只引用主数据"原则，实际是**反过来的**

代码与表结构的实证：

```text
vehicles（车辆主数据表）
  ├─ 业务字段：plate / vin / engine_no / owner / vehicle_type / status
  └─ ★ 保险字段（污染）：insurance_type / insurance_start / insurance_end / premium
                          policy_holder / registered_owner
                          compulsory_start / compulsory_end / compulsory_premium
                          commercial_start / commercial_end / commercial_total
                          vehicle_damage_amount / vehicle_damage_premium
                          third_party_amount / third_party_premium
                          passenger_amount / passenger_premium
                          vehicle_tax / total_premium          ← 共 20 个保险/保费列（含车船税）
```

| 保险子域 | 表 | 行数 | 后端引用 | 判定 |
|---|---|---|---|---|
| 人员保险（活） | `personnel_insurance` | **2474** | 10 个文件 | **BACKEND（活）** |
| 人员保险（孤儿） | `personnel_insurances` | **1330** | **0 个文件** | ❌ **有数据但无任何代码读写 = 历史导入残留** |
| 其他保险 | `other_insurance` | 16 | 7 个文件 | BACKEND |
| 车辆保险（独立表） | `vehicle_insurances` | **0** | **0 个文件** | ❌ **建表未用** |
| 保单 | `insurance_policies` | 2 | `insurancePolicyService.js` | DATA_MODEL（仅附件登记：字段只有 `name/type/file_name/policy_no/year`） |
| 保单版本/历史/附件 | `insurance_versions`/`insurance_history`/`insurance_attachments` | 0/0/0 | — | 空壳 |
| 超龄保障 | `over_age_personnel` | 1304 | 9 个文件 | BACKEND |
| 五险 | 无独立表 | — | 散落 `personnel_insurance.insurance_type` 枚举 | ❌ 未建模 |
| 出险 / 理赔 | **无表、无代码** | — | `accidents.compensation` 单字段（无人写链路） | ❌ **未建设** |

**架构结论：**

1. **车辆的保险信息寄居在车辆主数据表里**（20 个保险/保费列），而本该独立的 `vehicle_insurances` 是 0 行 0 引用。这与任务书 §七"保险只引用车辆"**正好相反**。
2. **保险域没有"出险→理赔"链路**：事故表的 `compensation`/`loss_amount` 字段与保险域无任何关联（无外键、无 service 调用）。
3. 「五险」未建模，只在 `insurance_type` 字符串里区分。

### 7.2 其他保障/经营模块

| 模块 | 表（DEV 行数） | 前端 | 状态 |
|---|---|---|---|
| 目标责任书 | `hse_target_contracts`(2433)、`safety_responsibility_forms`(5)、`hse_responsibility_config`(18)、`hse_responsibility_unmatched`(77) | `views/objectives/responsibility`、`views/hse/responsibility-forms` | BACKEND |
| 安委会 | `hse_safety_committee`(1)、`hse_safety_committee_activity`(19) | `views/objectives/committee` | BACKEND |
| 会务 | `meeting_records`(4) | `views/hse/meeting-records` | BACKEND（数据极少） |
| 安全文化 | `hse_safety_culture_monthly`(122) | `views/objectives/safety-culture`、`views/hse/safety-culture` | BACKEND |
| 供应链安全 | 无独立表 | `views/hse/supply-chain` | **FRONTEND 空壳（规划）** |
| 物资价格库 | `hse_material_price`(78) | `views/objectives/budget/material-price` | BACKEND |

---

## 8. L5 责任与考核域（★ 实际存在，任务书草案缺失）

| 项 | 实际内容 |
|---|---|
| 事实表（24 张） | `hse_assessment_cycle`(15)、`target`(925)、`score`(**3670**)、`score_detail`(0)、`deduction`(**940**)、`deduction_adjustment`(1)、`audit_log`(232)、`event_log`(**717**)、`plan`(32)、`plan_item`(168)、`metric`(29)、`metric_rule`(0)、`metric_source`(2)、`standard`(26)、`rule`(22)、`rule_detail`(12)、`rule_condition`(6)、`category_limit`(12)、`veto_rule`(3)、`bonus_rule`(3)、`sanwei_score_monthly`(170)、`safety_culture_monthly`(122)、`deduction` 相关 5 表 |
| 旧考核表（死） | `assessment_records`(5)、`assessment_rule`(1)、`assessment_rule_detail`(3) |
| 后端 | `assessmentMonthly{Chain,Cycle,Deduction,Export,Freeze,Health,Metric,Result,Scoring,Standard,Target}Service.js`（13 个 service）+ `assessmentScoringEngine.js` + `assessmentScheduler.js`（每日校验 + 网格校验 cron） |
| 前端 | `views/objectives/assessment-*`（6 页）+ `views/hse/assessment-monthly/**`（7 页）+ `views/hse/assessment-portal` + 10 个 `mirror/*` 镜像页 |
| 状态 | **BACKEND（数据量全平台第二）**，但**自动评分引擎存在硬编码跨模块查询**（既有结论），且旧考核表残留未清 |
| ⚠️ 架构问题 | 「月度考核」通过 10 个 `mirror/*` 页面**复制**三违/驾驶员/转运站/网格/培训等业务页面来展示考核口径 → **同一业务事实在考核门户里是第二套只读视图，若口径分开维护必然漂移**（§12-P1-3） |

---

## 9. L6 综合分析与智能层

| 模块 | 后端 | 前端 | 事实来源 | 状态 |
|---|---|---|---|---|
| 安全总览 | `routes/overview.js` | `views/hse/overview` | ⚠️ **直接查 Excel 残留表**（§12-P0-2） | BACKEND（口径待纠） |
| 领导驾驶舱 | `services/leaderDashboardService.js` | `views/hse/leader-dashboard` | 实时聚合 | BACKEND |
| 董事长/高管驾驶舱 | `services/executiveCockpitService.js` | `views/analysis/cockpit*` | 实时聚合 | BACKEND |
| BI 大屏 | `services/biService.js`、`routes/bi.js` | `views/hse/bi`、`views/analysis/cockpit-dashboard` | 实时聚合 | BACKEND |
| 统计分析 | `services/statisticsService.js` | `views/hse/reports` | `hse_statistics_daily`(1) / `_dept`(0) / `_monthly`(0) / `_person`(0) / `_yearly`(0) → **物化表基本未启用，实际走实时计算** | BACKEND（实时） |
| 预警中心 | `services/warningCenterService.js`、`hse_warning_rule`(10) / `hse_warning_scheduler`(7) / **`hse_warning_record`(0)** / `hse_warning_task`(0) | `views/hse/warning-center`、`views/hse/alerts` | 规则驱动，**但从未生成过一条预警记录** | BACKEND（规则在跑，产出为 0，需核查） |
| 报表中心 | `services/reportService.js`、`hse_reports`(7)、`hse_report_templates`(7) | `views/hse/reports` | 模板驱动 | BACKEND |
| 事故分析中心 | `routes/hse-accident-analysis.js` | `views/analysis/accident` | 读 `accidents` | BACKEND |
| 三违分析 | `services/violationService.js` 聚合段 | `views/analysis/violation`、`views/site/violation/analysis` | 读 `violation_records` | BACKEND |
| AI 能力层 | `services/ai/`（`aiGateway`、`aiProviderRegistry`、`aiHealthService`）、`aiService.js`、`aiEnhancedService.js`、`aiV2`、`aiKnowledge` | `views/analysis/ai`、`views/company/**`（5 页） | — | BACKEND（AI-02/AI-05 已有架构基线） |
| 数据质量 | 无独立模块 | 无 | — | ❌ 未建设（仅 `hse_business_help` 63 条帮助数据） |
| 仪表盘配置 | `hse_dashboard_card_config`(47)、`hse_filter_config`(48) | — | — | BACKEND |

**架构原则落地情况**：任务书要求"综合分析层尽可能从业务事实实时计算，不重复成为事实数据源"。实际：**`hse_statistics_*` 5 张物化表基本为空（1/0/0/0/0），反而符合原则**——统计确实走实时。但 `hse_warning_record`/`hse_warning_task` 零行说明预警产出链路未通。

---

## 10. 数据归属矩阵（谁拥有、谁引用）

### 10.1 主数据 → 业务域 引用关系（外键实证）

| 主数据 | 引用方（按域） | 实现程度 |
|---|---|---|
| **人员 `employee`** | 培训（`training_record.employee_id`） | ✅ 已实现（外键） |
| | 三违（`violation_records.violator_id/inspector_id/handler_id/punisher_id`） | ✅ 已实现 |
| | 事故（`accidents.reporter_id/handler_id`） | ✅ 已实现 |
| | 检查（`hse_grid_inspection_records.employee_id`、`hazard_record.employee_id`） | ⚠️ 部分（`grid_inspection_records` 无 employee 外键） |
| | 隐患（`hazards.fixer_id/checker_id`） | ✅ 已实现（**但同时保留文本 `fixer`/`checker` 双写**） |
| | 保险（`personnel_insurance.employee_id`） | ✅ 已实现 |
| | 考核（`hse_assessment_target.employee_id`、`hse_assessment_deduction.violator_id`） | ✅ 已实现 |
| | 应急（`emergency_plans.responsible_person_id`、`emergency_events.personnel_id`） | ✅ 已实现 |
| | 费用（`hse_safety_budget.responsible_employee_id`） | ✅ 已实现 |
| **组织 `hse_org_unit`** | 人员任职（`employee_assignment.org_unit_id`） | ✅ 已实现 |
| | 隐患（`hse_rectifications.department_id`） | ⚠️ **活表 `hazards` 用的是文本 `responsible_dept` + `responsible_dept_id`（无外键）** |
| | 费用（`hse_safety_budget.org_unit_id`） | ✅ 已实现 |
| | 考核（`hse_assessment_target`、`hse_target_contracts.org_unit_id`） | ✅ 已实现 |
| | 风险（`project_risk_record.project_id`、`risk_area_dict.org_unit_id`） | ✅ 已实现 |
| **岗位 `position`** | 培训（`training_record.position_id`） | ✅ 已实现 |
| | 任职（`employee_assignment.position_id`） | ✅ 已实现 |
| | 岗位画像/要求（`position_safety_profile`、`position_training_requirement`） | ⚠️ 建表零行 |
| **区域 `grid_areas`** | 检查（`grid_inspection_records.grid_id`） | ✅ 已实现（**唯一一处区域外键**） |
| | 隐患（`hazards.grid_id`） | ❌ **有列无外键** |
| | 三违（`violation_records` 只有文本 `area_team`/`grid_level`） | ❌ **未引用** |
| | 事故（`accidents.township` 文本） | ❌ **未引用** |
| | 风险（`risk_area_dict` 是**第二套区域**） | ⚠️ 冲突 |
| **车辆 `vehicles`** | 交通（`driver_monthly` 无 vehicle_id 外键） | ❌ **未引用** |
| | 三违（`violation_records.vehicle_type_or_cleaner` 文本） | ❌ **未引用** |
| | 事故（`accidents.involved_vehicle` 文本 + `vehicle_id` 有列无外键） | ❌ **未引用** |
| | 保险（保险字段直接内嵌在 `vehicles` 表里） | ❌ **归属倒置** |

### 10.2 业务域之间的链路（任务书要求验证的）

| 链路 | 要求 | 实际实现 | 判定 |
|---|---|---|---|
| 风险 → 检查 | 风险驱动检查 | `hazards.related_risk_id`（隐患指向风险）；`project_risk_record` 与检查无关联 | ⚠️ **部分**（是"检查→风险"，方向相反） |
| 检查 → 隐患 | 检查发现问题生成隐患 | 双路径：`inspectionCenterService` → `hazard_record`；`hazardService` → `hazards`（无 task_id） | ❌ **双源，未统一** |
| 隐患 → 整改 | 整改任务 | `hazards` 内部字段（`deadline/fix_date/rectification/status`）+ `hse_rectifications`(0) 未启用 | ⚠️ **字段内联，无独立整改事实** |
| 隐患 → 复查 | 复查记录 | `hazards.review_result/review_date/reviewer_id` 内联 + `hse_reviews`(0) 空表 | ⚠️ **内联为主，独立表未用** |
| 隐患 → 费用 | 隐患整改支出 | 无任何关联列 | ❌ **未实现** |
| 事故 → 保险理赔 | 出险理赔 | 无任何关联列/service | ❌ **未实现** |
| 三违 → 培训 | 违章人员再培训 | `violation_records.need_retraining`(bool) + `training_plan_id`(bigint) | ⚠️ **有字段，无外键；是否真写需业务确认** |
| 三违 → 考核 | 违章扣分 | `hse_assessment_deduction`(940) + `hse_sanwei_score_monthly`(170) | ✅ **已实现** |
| 事故 → 考核 | 事故扣分 | `hse_assessment_deduction.source_type` | ✅ 已实现 |
| 培训 → 考核 | 培训完成率扣分 | 同上报 | ⚠️ 依赖台账 vs 明细口径（S2 未决） |
| 检查 → 考核 | 网格缺巡扣分 | `gridUncheckedDeductionService.js` | ✅ 已实现 |

### 10.3 归属结论（可直接作为后续表结构设计的依据）

```text
【唯一拥有者】
人员       = employee
组织       = hse_org_unit
岗位       = position
网格/区域   = grid_areas（★ risk_area_dict 是第二套，待收敛）
车辆       = vehicles（★ 但必须剥离 20 个保险/保费列）
文件       = file_records（已被 42 张表引用，事实上的文件中枢）
字典       = 各域私有（未统一，见 §12-P1-5）

【必须只引用、不得拥有】
培训 / 三违 / 事故 / 检查 / 隐患 / 保险 / 考核 —— 一律只存 *_id 外键，不存人员姓名、车牌号、区域名称快照
（现状：以上 6 个域全部存在"文本快照 + ID"双写，见 §11-C1）
```

### 10.4 外键覆盖率：263 张系统表中 **185 张（70.3%）没有任何出向外键**

| 指标 | 值 | 含义 |
|---|---|---|
| 全库外键约束 | 185 条 | 集中在 78 张表上 |
| 有出向外键的表 | **78 / 263（29.7%）** | 其余 185 张表完全没有外键 |
| 被引用最多的表 | `file_records`(42 表) > `employee`(31) > `users`(17) > `hse_org_unit`(13) > `position`(7) | 主数据确实在被引用，但覆盖不全 |
| **`vehicles` 入向外键** | **0** | 车辆主数据在物理层完全没有被任何表引用 |
| `accidents` 出向外键 | 2（都是 → employee） | 事故的车辆、地点、组织全是文本或裸 ID |
| `training_plans` / `training_records` / `training_record` 出向外键 | **1**（仅 `training_record.employee_id`） | 培训的**计划与明细两张活表零外键**，与人员无任何物理关联 |
| `violation_records` 出向外键 | 4（全 → employee） | 违章的地点、车辆、组织全是文本 |

---

## 11. 重复主数据与数据归属冲突清单

> 分级：C1 级 = 直接导致数据不一致；C2 级 = 造成维护双份；C3 级 = 结构冗余但当前无害。

| 编号 | 冲突 | 实证 | 级别 | 建议 |
|---|---|---|---|---|
| **C1** | **人员身份三套并存**：`*_id`(FK) / `*_id`(无 FK) / 文本姓名 | `hazards`：`checker`+`checker_id`、`fixer`+`fixer_id`、`verify_user`+`reviewer_id`；`accidents`：`involved_person`+`personnel_id`、`handler`+`handler_id`；`training_records`：`name`+`id_card`+`personnel_id`+`employee_id` | **C1** | 逐步以 `employee_id` 为唯一业务键；文本列降级为展示缓存并在写入层统一生成 |
| **C2** | **车辆主数据被保险字段污染**（20 个保险/保费列） | `vehicles` 表直接持有 `insurance_*`/`compulsory_*`/`commercial_*`/`total_premium` 等；而 `vehicle_insurances` 0 行 0 引用 | **C1** | 保险字段迁出至保险域，`vehicles` 只保留车辆属性 |
| **C3** | **两套移动端**：`web-naive/src/views/mobile`（14 vue）与 `grid-mobile-cloudflare`（Pages+Worker→飞书） | 两处均活跃；前者走 PG，后者走飞书 | C2 | 明确边界：现场无网采集走 Cloudflare→飞书→PG 单向 Pull；在线查询走 PG。已在 WPS-PG-SYNC 系列部分落地 |
| **C4** | **两套三违事实表** | `violation_records`(2645, 唯一写入) vs `violations`(1451, **零 INSERT/UPDATE**) | **C1** | `violations` 冻结只读，报表口径禁止再读；分阶段下线 |
| **C5** | **两套区域** | `grid_areas`(63, 网格巡查用) vs `risk_area_dict`(17, 风险块用, FK→hse_org_unit) | C2 | 风险块键已冻结（`area_id`），需建 `risk_area_dict → grid_areas` 映射，不重建 |
| **C6** | **超龄人员两套** | `over_age_personnel`(1304, 9 文件引用) vs `overage_personnels`(1108, **0 引用**) | C2 | 后者为历史导入残留，标注只读 |
| **C7** | **车辆检查三表** | `vehicle_check_record`(1) / `hse_driver_inspection_records`(3) / `vehicle_inspection_records`(3) | C2 | 需业务确认哪张是权威；当前三表都几乎没有数据 |
| **C8** | **制度两表** | `regulations`(25) vs `hse_regulations`(1) | C2 | 同上 |
| **C9** | **隐患两套** | `hazards`(110) vs `hazard_record`(9)，字段语义不同 | **C1** | 必须定一套权威（建议 `hazards`），另一套做"检查派生"过渡 |
| **C10** | **培训两套** | `training_records`(19) vs `training_record`(0)；`taihang_trainings`(0) | C2 | 零行表标注 deprecated |
| **C11** | **检查五表空壳** | `inspection_plan/task/record/checklist_template/checklist_item` 全 0；`hse_inspection_plans/tasks/executions` 全 0 | C2 | 两套都空 → **重新设计比修复更省** |
| **C12** | **保险两套** | `personnel_insurance`(2474, 活) vs `personnel_insurances`(1330, **0 引用**) | C2 | 后者只读 |
| **C13** | **费用两套** | `hse_safety_budget`(342, 活) vs `safety_budgets`(0) vs 3 张 `hse_safety_budget_backup_*` | C2 | 备份表移出主 schema |
| **C14** | **考核两套** | `hse_assessment_*`(24 表活) vs `assessment_records`(5)/`assessment_rule`(1)/`assessment_rule_detail`(3) | C2 | 旧三表标注 deprecated |
| **C15** | **部门三表** | `department`(98, FK→hse_org_unit) / `departments`(0) / `hse_org_unit`(21) | C2 | `department` 是 `hse_org_unit` 的下级视图，语义需明确 |
| **C16** | **48 张 Excel 导表残留进主 schema** | `t_01_* ~ t_10_*`（如 `t_10_隐患排查治理_6月安全生产隐患排查登记表` 66 行、`t_08_现场管理_消防器材管理台账_无照片`） | **C1** | 必须移出或加 `_ext` schema，且**禁止业务代码直接查询**（现有违规见 §12-P0-2） |
| **C17** | **42 张 `backup_9x_*` 备份表留在主 schema** | `backup_97_employee`(1366)、`backup_98_violation_records`(890) 等 | C3 | 移出 `public` |

---

## 12. 重大架构问题登记（只登记，不修改）

> 本任务明确禁止修改业务代码。以下问题一律标记为 `待处理架构问题`。

### P0（阻断后续重构，必须先决策）

**P0-1｜检查管理域无真实数据模型，"检查"分散在 4 个子系统**
- 证据：`inspection_plan/task/record` 与 `hse_inspection_plans/tasks/executions` 共 8 张表全 0 行；真实检查在 `grid_inspection_records`(2069) / `transfer_station_check`(130) / `vehicle_check_record`(1) / `driver_monthly`(612)。
- 影响：任何"检查计划→任务→问题→隐患"的统一改造都无既有数据可依赖。
- 待处理：决定"检查"是**一个域**还是**四个专项的内嵌能力**。

**P0-2｜安全总览接口直接读 Excel 残留表作为事实源**
- 证据：`server/routes/overview.js:44` `FROM "t_08_现场管理_消防器材管理台账_无照片"`；`:49` `FROM "t_05_事故管理_历史未完成案件"`。
- 影响：`/api/overview` 的消防与事故统计**绕过 `fire_equipment` / `accidents`**，口径与其他所有页面不一致；Excel 表一旦改名/删除，接口靠 `.catch()` 静默返回 0。
- 这是"外部表格直接当事实库"的反面样本，直接违反本文件 §13 原则 4/7/8。

**P0-3｜车辆主数据在架构上不存在（0 外键 + 保险归属倒置）**
- 证据：`vehicles.vehicles` 入向外键 0；20 个保险/保费列内嵌；`vehicle_insurances` 0 行 0 引用。
- 影响：交通安全、三违、事故、保险四个域都无法可靠关联车辆。

**P0-4｜事故状态词表 6 套并存且无约束**
- 证据：`accidents.status VARCHAR(16) NULL DEFAULT '处理中'`，无 CHECK/ENUM/FK；6 套词表；孤儿值 `pending`/`跟踪中`；真实生产分布不可得 → `RC-1 = BLOCKED`。

### P1（影响正确性，需排期）

**P1-1｜培训事实源断裂 2805:1**：`hse_training_ledger_monthly`(598 行，`source` **全部为 `excel-import`**，应培 14165 / 实际 14027) vs `training_records`(19 行，有效 **5 行**) → 14027 : 5 = 2805:1。**"培训完成"这个结论 100% 来自一次 Excel 导入，系统内没有任何可交叉验证的事实**。`S2 = BLOCKED / BUSINESS DECISION REQUIRED`。

**P1-2｜培训台账自动生成"默认都完成"**：`trainingLedgerAutoInitScheduler.js:83-88` 四项计数直写 0,0,0,0，属伪造完成语义。

**P1-3｜考核门户用 10 个 `mirror/*` 页面复制业务口径**：口径双份维护，必然漂移。

**P1-4｜`hseTasksService:144` 存在恒早退缺陷**：待办中心实际不产出（`hse_tasks` 0 行可对照）。

**P1-5｜无统一字典中心**：`sanwei_behavior_dict`、`risk_type_dict`、`risk_work_type_dict`、`hse_cost_*`、`risk_sources` 各自成表，无统一 code→name 服务。

**P1-6｜检查中心 API 前缀语义错位**：挂在 `/api/hse/employee/inspection-plans`，权限码复用 `hse:personnel:*`。

**P1-7｜`regulations` / `hse_regulations` 双表**、`vehicle_check_*` 三表、`over_age_*` 两表并存。

**P1-8｜`hse_warning_record` 从未产生过数据**：10 条规则 + 7 条调度配置在跑，产出表 0 行，需核查是 cron 未触发还是生成失败。

### P2（结构性冗余）

- 42 张 `backup_9x_*` + 6 张 `*_bak_*` + 7 张 `*_backup_*` 备份表占用 `public` schema。
- 103 张零行表（其中约 40 张是"建了没启用"的空壳）。
- `web-antd` 遗留前端（17 视图目录 + dist）未删除，与 `web-naive` 并存。
- `routes/` 目录内 20+ 个 `.bak-pre-*` 文件。

---

## 13. 架构原则（15 条，后续开发的强制约束）

| # | 原则 | 本平台的落地要求 |
|---|---|---|
| 1 | **一套主数据，多业务引用** | 人员=employee、组织=hse_org_unit、岗位=position、网格=grid_areas。任何新模块**禁止**再建 `xxx_person`/`xxx_vehicle` 表 |
| 2 | **一套业务事实，多视图展示** | 事实只写一处。`mirror/*` 页面只能是只读视图，禁止在后端为镜像页单独写口径 SQL |
| 3 | **不重复建设人员、车辆、地点基础数据** | 新增业务表只允许存 `*_id`；文本姓名/车牌/区域名仅作**展示缓存**，由写入层统一生成，不允许人工填写成为事实 |
| 4 | **汇总数据原则上不与事实数据脱节** | `hse_statistics_*` 只允许由事实表计算得出；禁止像 `trainingLedgerAutoInitScheduler` 那样直接写死计数 |
| 5 | **状态机由业务规则定义** | 状态流转必须来自 `server/config/hseRules/*.json`，禁止在 service 里硬编码状态数组。培训域已示范（`trainingPlanStatusMachine.js` 零硬编码零缓存） |
| 6 | **重要业务事实必须可追溯** | 关键状态变更需写 `hse_assessment_event_log` 或 `sys_operation_log`；禁止"改完无痕" |
| 7 | **导入数据必须保留来源** | 必须落批次表（`employee_import_batch` / `hse_batch_import_tasks`）+ 原始文件（`file_records`）+ 行级 hash |
| 8 | **固定 Excel 与系统数据模型必须有映射关系** | 每份 Excel 必须有 `field_mapping_config` 条目；**禁止业务代码直接查询 Excel 原始表**（现违规见 P0-2） |
| 9 | **前端台账不能反向决定数据库结构** | 新增字段必须先过"业务模型确认"，前端只能提出需求，不得以"页面要显示"为由加列 |
| 10 | **生产环境不是开发验证环境** | `safety_dashboard_dev` 与 `safety_dashboard` 严格分离；DDL 只准作用于 dev（`config/db.js` 默认连生产的风险已知，操作前必须硬设 `DB_NAME` 并断言 `current_database()`） |
| 11 | **任何架构决策必须记录** | 一律写入 `HSE平台架构决策与工作日志.md`，编号 DECISION-xxx，含影响范围与验收状态 |
| 12 | **已完成模块不得因架构调整而无依据推倒重做** | FROZEN 模块（网格巡查 WPS-PG 链、隐患 C1、风险 02/03/04、培训 S1）调整需单独授权 + 独立回归证据 |
| 13 | **先确定边界，再细化模块** | 边界未定的域（检查、保险、特种设备）禁止先开工数据模型 |
| 14 | **先确定数据归属，再确定表结构** | 任何新表必须先在 §10 归属矩阵中声明"拥有什么、引用什么" |
| 15 | **前端、后端、数据库围绕同一业务模型建设** | 三者以本基线 + 状态总表为共同契约；偏离必须登记为 `待处理架构问题` |

### 13.1 附：本平台特有的一条硬约束（超出任务书 15 条）

**16｜规则与事实分离**：`server/config/hseRules/*.json` 是规则的唯一源，代码只做适配不做复制。改规则 = 改 JSON + 重启 + 观察期，不允许在 service 里写第二套阈值/状态表。（源于风险域"02 冻结"与培训域 `planStatusFlow` 的实践）

---

## 14. 前端优先实施策略（新开发范式）

### 14.1 为什么必须改

历史做法是"后端建表 → 写 API → 前端拼页面"，结果产生了本文件 §11 的 17 项冲突：**表建了但没人用（103 张零行表）、页面建了但没数据（消防/供应链/检查中心）、同一业务两套表**。根因是**数据模型在没有可视化验证的情况下先被固化**。

### 14.2 新的实施链路（强制）

```text
① 总体架构（本基线 §2~§10：定层、定域、定归属）
        ↓
② 业务域（定边界：这个域拥有什么事实、引用哪些主数据）
        ↓
③ 页面 / 台账设计（用户实际看到的表长什么样、字段有哪些、谁填）
        ↓
④ 字段与数据关系（字段 → 归属哪张表 → 是事实还是展示缓存）
        ↓
⑤ 导入模板（Excel 列 → 字段映射 → 校验规则）
        ↓
⑥ 后端数据模型（DDL：只建 ③④⑤ 已确认的表，禁止预建空壳）
        ↓
⑦ API（对齐 ③ 的页面契约）
        ↓
⑧ 前后端联调
        ↓
⑨ 验收（含"是否有真实业务数据"这一条）
```

### 14.3 三条硬规则

1. **没有台账设计，不开工 DDL。** 台账设计必须包含：列名、单位、是否必填、数据来源（系统原生/Excel 导入/计算）、谁维护。
2. **没有导入模板，不开工导入功能。** 模板必须先有真实的样例文件（≥1 个月真实数据）。
3. **前端页面不能脱离业务模型独立设计。** 页面可以先行（作为需求表达工具），但**不得据页面直接生成 DB 列**——必须回到 ④ 确认归属。

### 14.4 与"已完成模块"的关系

本策略**只约束新开发与重构**。已 FROZEN 的模块不因策略变化而重做（原则 12）。当前适用新策略的候选域（边界清晰、可先做台账）：

| 优先序 | 域 | 理由 |
|---|---|---|
| 1 | 消防器材管理 | 页面已建、表空、统计口径已被污染 → 最适合用新范式重做一遍 |
| 2 | 特种设备 | 完全空白，无历史包袱 |
| 3 | 保险（出险理赔） | 完全空白，且能顺带修正 C2（车辆保险字段剥离） |
| 4 | 检查管理 | 8 张空表 → 用台账反推模型，比修补更省 |

---

## 15. Excel / 固定台账输入层

### 15.1 现状（不是规划，是已发生的事实）

| 现状 | 证据 |
|---|---|
| Excel 会被**直接建成表**灌入 `public` schema | 48 张 `t_01_*` ~ `t_10_*` 表，如 `t_07_三违管理_宁津项目三违检查清单_表_2_全员`(58 行) |
| 部分 Excel 表被**业务接口直接查询** | `routes/overview.js:44,49` |
| 已有映射配置机制 | `field_mapping_config`(20 行)、`employee_import_mapping_rule`(79 行)、`employee_position_mapping_rule`(42 行)、`employee_import_skip_rule`(3 行) |
| 已有批次与待处理机制 | `employee_import_batch`(7)、`employee_import_pending`(**13642**)、`hse_batch_import_tasks`(1)、`hse_batch_import_items`(13) |
| 已有导入实现 | `importExcelService.js`、`batchImportService.js`、`employeeImportV2Service.js`、`rosterImportService.js`、`safetyCultureImport.js`、`sanweiAnalysisImport.js` |

### 15.2 四类输入的定义（本基线确立）

| 类别 | 定义 | 落库策略 | 现存实例 |
|---|---|---|---|
| **A. 系统原生台账** | 由系统页面直接维护，事实源在 PG | 直接写业务表，**不允许**Excel 反向覆盖 | 隐患、事故、三违记录、培训计划、月度考核 |
| **B. 固定格式导入表** | 企业已有固定表格，系统必须兼容 | 经映射规则 → 校验 → 待确认 → 入业务表；**保留批次与原始文件** | 员工花名册（飞书 `tbl2ZHdXX5d8R12a`）、人员保险、驾驶员三检表、转运站月度检查表 |
| **C. 外部业务表** | 只作为数据输入，不一定全部入库 | 只入"需要的字段"到指定表；**原始表不得进入 `public` 业务 schema** | `t_02_保险及人员管理_*`（14 张）、`t_03_规章制度_*`（9 张） |
| **D. 临时分析表** | 只用于分析 | **不入核心事实库**；放独立 schema 或只留文件 | `t_01_hse教育培训_乡镇教育培训扣分汇总`、`t_05_事故管理_历史未完成案件` |

### 15.3 每份 Excel 必须回答的 8 个问题（新增 Excel 的准入清单）

| # | 问题 | 判定影响 |
|---|---|---|
| 1 | **是否入库？** | 不入库 → 归 D 类，只留文件 |
| 2 | **入哪些表？** | 必须写明表名；禁止"整表建表" |
| 3 | **哪些字段作为主数据？** | 若含人员/车辆/地点 → 必须走主数据解析（phone→employee_code→name，fail-closed） |
| 4 | **哪些字段作为业务事实？** | 写业务表 |
| 5 | **哪些字段只是展示字段？** | 不入库或入展示缓存列 |
| 6 | **是否允许反向导出？** | 默认**不允许**（防止 Excel 变成第二事实源） |
| 7 | **是否需要保留原始文件？** | B/C 类必须保留 → `file_records` |
| 8 | **是否需要版本管理？** | 固定格式表（B 类）必须版本化 → `*_version` 表 |

> 现状违规：48 张 `t_0X_*` 表**没有一份回答过这 8 个问题**，导致 §12-P0-2。

---

## 16. 模块实施状态体系

统一取自以下 10 个值，禁止自造：

| 状态 | 含义 | 判定门槛 |
|---|---|---|
| `PLANNED` | 规划中 | 只有文档/需求，无代码无表 |
| `ARCHITECTURE` | 架构已确定 | 本基线已定归属与边界，可开工 |
| `FRONTEND` | 前端建设中/已建 | 有页面，但后端或数据未就绪 |
| `DATA_MODEL` | 数据模型建设中/已建 | 有 DDL，**但无真实业务数据或未接入 service** |
| `BACKEND` | 后端建设中/已建 | 有 service + API，**有真实数据流入** |
| `INTEGRATION` | 前后端联调 | 页面已接真接口，正在联调 |
| `ACCEPTANCE` | 验收中 | 已提交验收，未出结论 |
| `FROZEN` | 已冻结 | **有独立审计/验收报告并出具 PASS** |
| `BLOCKED` | 阻塞 | 有明确阻塞原因（缺业务决策/缺生产证据/缺授权） |
| `DEFERRED` | 暂缓 | 主动排期后置 |

**判定纪律（三条）**：

1. `BACKEND` 的必要条件是**表里有真实数据**。零行表最高只能给 `DATA_MODEL`。
2. `FROZEN` 必须有报告编号支撑，不允许凭印象给。
3. `PLANNED` 不允许写进任何"已完成"统计。

---

## 17. 验收问题回答

> 对应任务书 §十七 的 15 问。

### Q1 当前仓库实际存在多少一级业务域？

**7 个**（分层见 §2）：L0 平台支撑 / L1 基础主数据 / L2 HSE 核心业务 / L3 专项安全管理 / L4 保障经营 / **L5 责任与考核** / L6 综合分析与智能。

其中 **L0 与 L5 是任务书草案未列、但实际代码与数据已存在的**（L5 有 24 张表、3670 条评分记录）。

### Q2 当前实际存在多少业务模块？

按"有独立路由 + 独立表 + 独立页面"三个条件**至少满足两个**计，**126 个模块**（逐行清单见 `HSE平台模块实施状态总表.md`）：

| 层级 | 模块数 |
|---|---|
| L0 平台支撑 | 9 |
| L1 基础主数据 | 10 |
| L2 风险管理 | 8 |
| L2 检查管理 | 10 |
| L2 隐患治理 | 6 |
| L2 三违管理 | 7 |
| L2 事故管理 | 6 |
| L2 培训管理 | 8 |
| L2 安全生产费 | 10 |
| L3 专项安全管理 | 14 |
| L4 保障/经营管理 | 14 |
| L5 责任与考核 | 10 |
| L6 综合分析与智能 | 14 |
| **合计** | **126** |

其中状态分布：`BACKEND` 67 / `DATA_MODEL` 32 / `FROZEN` 8 / `DEFERRED` 6 / `PLANNED` 6 / `BLOCKED` 5 / `FRONTEND` 2。

### Q3 哪些模块是已经开发的？

有真实数据 + 有 API + 有页面的（`BACKEND` 及以上）：
人员、组织、岗位、任职、网格区域、车辆、三违（记录/候选/分析/台账/考核）、隐患（主流程）、事故（含版本，**状态重构 BLOCKED**）、培训（计划/记录/台账/统计，**S2 BLOCKED**）、安全生产费（**仅预算段**）、月度考核（全链）、目标责任书、安委会、安全文化、会议、应急（计划/演练/队伍/物资）、标准化（条款/关系）、制度、保险（人员/超期/其他）、驾驶员风险、转运站检查、网格巡查（FROZEN）、导入框架、驾驶舱/BI/报表/预警规则/AI、权限审计通知文件。

FROZEN 的 6 个：网格巡查 WPS-PG 链、隐患 C1 关闭语义、风险 02 规则源、风险 03/04 数据模型、培训状态机 S1（WARN-ONLY）。

### Q4 哪些模块只是规划？

| 模块 | 判定依据 |
|---|---|
| **特种设备** | 无表、无 service、无路由、无页面（`grep 特种设备` 仅命中证书类型关键字） |
| **保险出险与理赔** | 无表、无代码 |
| **五险** | 未建模，仅 `insurance_type` 字符串 |
| **供应链安全** | 仅 `views/hse/supply-chain` 一个页面，无表无 API |
| **数据质量** | 无模块 |
| **检查管理（统一域）** | 8 张表全 0 行，无统一入口（现场检查分散在 4 个子系统） |
| **消防器材管理** | `fire_equipment` 0 行 + 统计口径被 Excel 表污染 |
| **工作流引擎** | 4 张表全 0 行 |
| **统计物化表** | `hse_statistics_*` 5 表 1/0/0/0/0，实际走实时计算 |
| **证书/资格** | `employee_certificate`/`certificates` 双表 0 行 |

### Q5 哪些属于基础主数据？

**成立的主数据 3 个**：人员 `employee`(3417)、组织 `hse_org_unit`(21)、岗位 `position`(50)。
**准主数据 1 个**：作业单元 `hse_operation_unit`(89) + `risk_work_type_dict`(9) + `risk_work_unit_dict`(43)（目前仅风险域使用）。
**字典类**：`sanwei_behavior_dict` / `risk_type_dict` / `risk_sources` / `risk_lec_scale` / `risk_level_config` / `risk_level_thresholds` / `hse_cost_*` / `position_alias_mapping`。
**未成立**：车辆（0 外键）、区域（两套）、证书（0 行）。

### Q6 哪些属于核心 HSE？

**7 个**：风险管理、检查管理、隐患治理、三违管理、事故管理、培训管理、安全生产费。

### Q7 哪些属于专项管理？

**7 个**：交通安全（最完整）、消防安全（空壳）、职业健康（寄居风险画像）、特种设备（未建设）、应急管理（计划/演练/队伍/物资完备）、标准化、制度规章。

### Q8 哪些属于保障/经营管理？

**6 个**：保险管理、目标责任书、安委会、会务、安全文化、供应链（空壳）+ 物资价格库。

### Q9 哪些属于综合分析？

**12 个**：安全总览、领导驾驶舱、高管驾驶舱、BI 大屏、统计分析、预警中心、报表中心、事故分析中心、三违分析、月度考核分析、AI 能力层、仪表盘配置。（数据质量未建设）

### Q10 哪些地方存在重复主数据？

**17 项，见 §11 C1-C17**。最严重的 5 项：

1. **车辆保险字段内嵌在车辆主数据表**（20 个保险/保费列），独立保险表 0 行；
2. **人员身份三套并存**（FK ID / 裸 ID / 文本姓名）；
3. **两套三违事实**（`violation_records` 活 / `violations` 零写入）；
4. **两套隐患事实**（`hazards` / `hazard_record`，两者都在写）；
5. **48 张 Excel 导表进主 schema**，其中 2 张被业务接口直接查询。

### Q11 哪些地方存在数据归属不清？

| 问题 | 归属争议 |
|---|---|
| 车辆 | 是主数据还是"交通业务的一部分"？保险字段归谁？ |
| 区域 | `grid_areas` 还是 `risk_area_dict`？ |
| 部门 | `department`(98) / `departments`(0) / `hse_org_unit`(21) — 三级还是两级？ |
| 检查问题 | 归"隐患"还是"检查记录"？（现两套都在写隐患） |
| 文件 | `file_records` 被 42 表引用，但 `document_files`/`file_attachments` 另有两套 |
| 培训完成 | 台账（汇总）还是明细（记录）？→ S2 BLOCKED |
| 保险 | `personnel_insurance` 还是 `personnel_insurances`？ |
| 考核 | `hse_assessment_*` 还是 `assessment_records`？ |

### Q12 哪些模块后续必须重新归位？

| 模块 | 归位动作 |
|---|---|
| 检查管理 | 从"8 张空表 + 分散 4 子系统"改为**单一检查域**（或明确为专项内嵌能力） |
| 消防器材 | 从 Excel 表 → `fire_equipment` 正规化，统计口径改回业务表 |
| 保险 | 车辆保险字段从 `vehicles` 剥离；`personnel_insurances` 下线 |
| 区域 | `risk_area_dict` 与 `grid_areas` 建映射，统一到 `grid_areas` |
| 车辆 | 建立真正的主数据地位（补外键，剥离保险字段） |
| 三违 | `violations` 冻结只读，报表口径统一到 `violation_records` |
| 隐患 | `hazard_record` 合并进 `hazards`（或明确"检查派生"定位） |
| 培训 | 台账 vs 明细定权威（S2） |
| 考核 | 旧三表下线；10 个 `mirror/*` 页改为真实只读视图 |
| 费用 | 申请/承诺/实际/分摊四段（全 0 行）重新按台账设计 |

### Q13 哪些前面已经完成的工作可以直接保留？

| 保留项 | 理由 |
|---|---|
| 网格巡查 WPS-PG 单向同步链（05-A~05-E 已验收） | FROZEN，有幂等性证据 |
| 隐患 C1 关闭语义（`review(pass)` 唯一正式关闭） | FROZEN，有意为之的语义设计 |
| 风险 02/03/04 数据模型（14 表/57 索引/84 约束/视图） | FROZEN，已过审计 |
| 培训状态机 S1 + `createPlan` 覆盖 | 与本基线原则 5/16 一致 |
| 导入框架（批次/映射/待确认/原始文件） | 与本基线 §15 一致，只需规范使用 |
| 月度考核 24 表 + 13 service + 调度器 | 有真实数据，只需清旧表与收敛口径 |
| 驾驶员风险中心 7 组件 | 交通专项最完整，直接保留 |
| 权限模型（`requireRole`/`requirePermission` + 前端 `meta.authority`） | FROZEN，已修过 P0 缺陷 |

### Q14 哪些需要重新设计？

1. **检查管理域**（8 张空表 + 4 个分散子系统）→ 重新设计，不修补。
2. **消防器材管理**（0 行表 + 被污染的统计口径）→ 用前端优先范式重做。
3. **车辆主数据**（0 外键 + 保险字段污染）→ 重新设计边界。
4. **保险出险理赔**（完全空白）→ 新设计。
5. **安全生产费后半段**（申请/承诺/实际/分摊全 0 行）→ 按台账重设计。
6. **事故状态机**（6 套词表 + 无约束）→ 已冻结设计（P3-14），等 RC-1 解锁。
7. **区域统一**（两套）→ 需设计映射而非重建。
8. **Excel 输入层**（48 张残留表）→ 按 §15 重新规范。

### Q15 下一阶段应该先做什么？

**建议顺序（每步都需单独授权）：**

| 步 | 动作 | 产出 | 前置 |
|---|---|---|---|
| **1** | **基线签字** | 本文件 + 状态总表由业务确认 | 无 |
| **2** | **清理 Excel 事实源污染（P0-2）** | `overview.js` 改读 `fire_equipment`/`accidents`；48 张 `t_0X_*` 表移出 `public` | 步 1 |
| **3** | **选定第一个"前端优先"试点域 = 消防器材** | 台账设计 → 导入模板 → DDL → API → 页面 | 步 2 |
| **4** | **区域统一设计（C5）** | `risk_area_dict ↔ grid_areas` 映射表 + 数据核对 | 步 1 |
| **5** | **培训 S2 业务决策** | 台账 vs 明细定权威（需业务签字） | 步 1 |
| **6** | **车辆主数据边界设计（P0-3）** | 剥离 20 个保险/保费列方案 + 补外键方案 | 步 4 |
| **7** | **检查管理域重新设计（P0-1）** | 域边界决策 + 台账 | 步 3 完成 |

**为什么不建议先做检查域**：检查域 8 张空表 + 4 个子系统耦合最深，且无历史数据可校验；先用消防这个"小而完整"的域跑通新范式（前端优先 → 台账 → 模型 → API），再动大域，风险最低。

---

## 18. 变更控制

| 规则 | 说明 |
|---|---|
| 版本 | 本文件为 V1.0；重大边界变化升 V1.x，分层调整升 V2.0 |
| 修改方式 | 只允许追加"变更记录"章节 + 修订对应小节，**不删除历史结论**（保留可追溯性） |
| 与代码冲突时 | **以代码为准**，并在 §12 登记为问题；不允许为让文档好看而改代码 |
| 决策留痕 | 所有影响边界的决定必须进 `HSE平台架构决策与工作日志.md`，编号 DECISION-xxx |
| 受保护文件 | `docs/191副/project_memory.md` 永久受保护，任何任务不得覆盖 |

---

## 附：本文件未做的事（明确声明）

1. **未读生产库**。所有行数是 DEV 库。生产与 DEV 存在已知差异（本机 `safety_dashboard` 与 dev 曾为 110 行近孪生，逐行 diff 仅 2 行差异），不能互相冒充。
2. **未修改任何业务代码、数据库、配置、前端**。
3. **未做性能评估**（索引命中、慢查询）。
4. **未做安全评估**（除已登记的 P0 凭据轮换事项，本轮不重复）。
5. **未评估 H5/Cloudflare 子项目的细节架构**，仅在 §11-C3 登记其存在与边界。
6. **未对 103 张零行表逐张判定"该删还是该建"**——这需要业务逐项确认，属后续任务。

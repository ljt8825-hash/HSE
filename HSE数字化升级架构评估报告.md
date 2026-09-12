# HSE 数字化升级架构评估报告

> **项目名称**：宁津环卫 HSE 安全管理系统
> **版本**：v4.1
> **评估日期**：2026-07-11
> **评估角色**：高级软件架构师
> **评估范围**：整体架构、数据库、业务模型、数据中心、趋势分析、开发路线图
> **评估方式**：只读分析，未修改任何代码

---

## 0. 执行摘要

宁津环卫 HSE 安全管理系统已具备较为完整的功能底座：前端基于 vue-vben-admin v5.7.0 + Ant Design Vue + TypeScript，后端基于 Node.js + Express + PostgreSQL，覆盖 30+ 业务页面、27 个后端路由模块、约 46 张业务表（另含 20 张 Excel 导入动态表）。系统已实现认证授权、RBAC、工作流、WebSocket、多租户基础、AI 辅助、IoT 接入、BI 大屏、性能压测、安全加固等工程能力，工程完成度约 96%。

但若要升级为**企业内部安环管理数字化平台**，系统当前存在**五项结构性短板**：

1. **数据孤岛严重**：应急、目标、规章、风险源、IoT、三违等模块与人员/车辆/部门主数据无外键关联，15+ 张表完全孤立。
2. **缺乏统一安全事件模型**：隐患、事故、三违、IoT 告警、人工巡检告警各自独立存表，无统一事件流水表，无法支撑安全驾驶舱与趋势分析。
3. **闭环链路断裂**：风险→隐患→整改→培训→事故 5 个环节在数据库层无关联字段，仅靠业务人员记忆衔接，无法自动追溯。
4. **Schema 多源冲突**：unified_schema.sql、server/sql/*、路由内嵌建表、归档 schema 之间存在字段定义不一致（如 hazards.title、accidents.occurred_at 等字段被代码引用但表中不存在），多租户覆盖不彻底。
5. **趋势分析能力缺失**：当前仅有 dashboard 聚合查询，缺少周报/月报/年度指标体系和安全指数模型，无法形成多年数据沉淀后的趋势洞察。

本报告将围绕这五项短板提出系统性升级方案，并给出分阶段开发路线图。

---

## 一、当前系统架构

### 1.1 前端技术

| 维度 | 选型 | 说明 |
|------|------|------|
| 框架基座 | vue-vben-admin v5.7.0 | Monorepo（pnpm + Turbo） |
| 核心框架 | Vue 3 (Composition API) | ESM 模式 |
| UI 库 | Ant Design Vue | 主子应用 `apps/web-antd` |
| 状态管理 | Pinia（@vben/stores） | 含 auth store |
| 路由 | vue-router | 15 个业务路由模块 + 5 个核心文件 |
| 请求封装 | @vben/request | 含拦截器、错误处理 |
| 构建工具 | Vite + Turbo | TypeScript + vue-tsc 严格模式 |
| 多语言 | i18n（zh-CN / en-US） | 已接入 |
| PWA | vite-plugin-pwa | 已配置 |
| 移动端 | 独立 mobile 视图 | dashboard/patrol/scan/alerts/profile |
| 代码规范 | oxlint + eslint + stylelint + cspell + lefthook | 完整工具链 |
| 测试 | Vitest + Playwright | 单测 + e2e |
| 包管理 | pnpm 10.33.4 | workspace:* 内部包 |

**前端现状**：唯一生产入口为 `安全看板vben/apps/web-antd/`，启动命令 `pnpm dev:antd`。根目录 `src/`（v3，Element Plus）与 `安全管理系统/`（v2，Naive UI）均已归档弃用。

### 1.2 后端技术

| 维度 | 选型 | 说明 |
|------|------|------|
| 运行时 | Node.js ^22 | |
| Web 框架 | Express 4.19 | 唯一生产入口 `server/app.js` |
| 数据库 | PostgreSQL（pg 8.22） | 库名 `safety_dashboard`，认证 scram-sha-256，专用 `hse_app` 用户 |
| 认证 | JWT（jsonwebtoken） | token_blacklist + login_attempts |
| 校验 | Zod 4.x | validateBody/Query/Params 中间件 |
| 日志 | Winston + morgan | 结构化请求日志 |
| 安全 | helmet + cors + express-rate-limit | CSP/HSTS/限流齐全 |
| 压缩 | compression | |
| 文件 | multer | 上传目录可配置 |
| Excel | xlsx 0.18 | 导入导出 |
| WebSocket | 自研 wsServer | 挂载 `/ws`，JWT 鉴权，30s 心跳 |
| 实时通信 | wsServer | 与 HTTP 共享端口 |
| 监控 | Prometheus + Grafana | `/metrics` 端点 |
| 加密 | 自研 encryption 中间件 | 字段级加密（手机号等） |
| 多租户 | tenant 中间件 + tenant_id | 部分表覆盖 |
| AI | aiService（Grok/Ollama） | 报告/RCA/分类/预测 |
| 进程管理 | PM2（ecosystem.config.js） | |
| 测试 | Jest 30 + supertest | 单测 + e2e |

**后端现状**：`server/app.js` 为唯一生产入口（server/src/app.ts TypeScript 版与 安全管理系统/backend/ Python Flask 版均已归档）。注册了 27 个路由模块（含 BI/AI/IoT），健康检查、PostgreSQL 状态检测、Prometheus 指标端点齐全。

### 1.3 数据库结构

- **数据库引擎**：PostgreSQL
- **数据库名**：`safety_dashboard`
- **认证方式**：scram-sha-256
- **业务用户**：`hse_app`（最小权限）
- **业务表数量**：约 46 张（含 4 张工作流、1 张通知、3 张认证、5 张 RBAC、1 张租户、4 张 AI/IoT、2 张文件导入、1 张字段映射、20 张 Excel 动态表 `t_*`）
- **Schema 来源**（多源，存在冲突）：
  - `sql/unified_schema.sql`（权威主表 + 视图 + 字段映射）
  - `sql/auth_schema.sql`（认证）
  - `sql/migrate_rbac.sql`（RBAC）
  - `sql/migrate_workflow.sql`（工作流）
  - `sql/migrate_notifications.sql`（通知）
  - `sql/migrate_multi_tenant.sql`（多租户）
  - `sql/migrate_emergency_objectives.sql`（应急/目标软删除）
  - `sql/migrate_indexes_optimization.sql`（性能索引）
  - `server/create_regulations_table.sql`（规章制度）
  - `server/sql/ai_tables.sql`（AI 记录）
  - `server/sql/sys_operation_log.sql`（审计日志增强版）
  - `server/sql/performance_indexes.sql`（高频索引）
  - `server/routes/file-records.js`（内嵌建表）
- **显式外键约束**：仅 6 处（token_blacklist→users、role_menu→roles/menus、user_role→users/roles、workflow_*→workflows/instances、import_logs→file_records、ai_generation_records→users、users→tenants）
- **现代特性使用**：JSONB（risk_sources.polygon、form_data、definition、column_mapping、error_details）、pgcrypto（字段加密）、GIN 索引、pg_trgm（模糊检索）、物化视图（performance/optimize）

### 1.4 当前模块列表

#### 后端路由模块（27 个）

| 分类 | 路由 | 模块说明 |
|------|------|----------|
| 认证 | `/api/auth` | 登录/登出/刷新令牌 |
| 用户 | `/api/users` | 用户管理（含加密） |
| 角色 | `/api/roles` | RBAC 角色 |
| 菜单 | `/api/menus` | 动态菜单 |
| 人员 | `/api/personnel` | 人员主数据 |
| 超龄人员 | `/api/over-age-personnel` | 超龄管控 |
| 车辆 | `/api/vehicles` | 车辆主数据 |
| 保险 | `/api/insurance` | 人员/车辆保险 |
| 风险管控 | `/api/risk-control` | 风险源管理 |
| 隐患 | `/api/hazards` | 隐患排查治理 |
| 事故 | `/api/accidents` | 事故管理（含 RCA） |
| 培训 | `/api/training` | 培训记录/花名册 |
| 应急 | `/api/emergency` | 预案/物资/演练 |
| 目标 | `/api/objectives` | 合同/组织人员/责任制/预算 |
| 规章 | `/api/regulations` | 规章制度 |
| 现场 | `/api/site-mgmt` | 网格/三违/巡查 |
| 看板 | `/api/dashboard` | 数据聚合 |
| 总览 | `/api/overview` | 首页总览 |
| 告警 | `/api/alerts` | 告警中心 |
| 审计 | `/api/audit` | 操作日志 |
| 工作流 | `/api/workflow` | 流程引擎 |
| 通知 | `/api/notifications` | 站内消息 |
| 文件 | `/api/files` `/api/file-records` | 文件上传/记录 |
| 导入 | `/api/import` | Excel 导入 |
| BI | `/api/hse/bi` | 商业智能大屏 |
| AI | `/api/hse/ai` | AI 辅助 |
| IoT | `/api/hse/iot` | 物联网设备 |

#### 前端业务页面（按模块）

| 模块 | 页面 | 完成度 |
|------|------|--------|
| 数据看板 | workspace + analytics（6 个） | 已完成 |
| HSE AI | 异常检测、根因分析、报告生成、风险预测 | 已完成 |
| HSE BI | 商业智能大屏 | 已完成 |
| HSE IoT | 设备列表、设备地图 | 已完成 |
| 移动端 | dashboard/patrol/scan/alerts/profile | 已完成 |
| 目标职责 | 预算、合同、组织人员、责任制 | 已完成 |
| 应急管理 | 预案、演练、物资 | 已完成 |
| 人员管理 | 人员、超龄人员 | 已完成 |
| 安全管理 | 总览、风险评估、风险趋势、漏洞、威胁、访问日志、审计、资产、合规 | 已完成 |
| 核心 | 登录/注册/404/403/500/个人中心 | 已完成 |

### 1.5 已完成能力清单

#### 工程能力
- [x] TypeScript 严格模式（前后端）
- [x] Feature-Sliced Design + 组件化架构
- [x] API 类型安全 + 请求封装 + 拦截器
- [x] 多环境支持（dev/test/production）
- [x] 权限控制（RBAC + 动态菜单 + 路由守卫）
- [x] 国际化（中英双语）
- [x] Docker 多阶段构建（Nginx + Node.js）
- [x] PM2 进程管理
- [x] Prometheus + Grafana 监控
- [x] OpenTelemetry 可观测性
- [x] k6 性能压测 + Lighthouse 前端基线
- [x] OWASP 安全审计 + 2 项 Critical 修复
- [x] 字段级加密（手机号等敏感数据）
- [x] 多租户基础设施（部分表覆盖）
- [x] WebSocket 实时推送（30s 心跳）
- [x] 软删除（大部分业务表）
- [x] 审计日志全局集成

#### 业务能力
- [x] 风险源地理空间管理（GIS + 多边形）
- [x] 隐患排查治理流程
- [x] 事故管理 + 根因分析（RCA）
- [x] 培训记录与花名册
- [x] 人员与超龄人员管控
- [x] 车辆与保险历史
- [x] 应急预案/物资/演练
- [x] 目标职责四子模块
- [x] 规章制度库
- [x] 网格化巡查
- [x] 三违管理（Excel 同步）
- [x] BI 大屏
- [x] AI 辅助（报告/RCA/分类/预测）
- [x] IoT 设备接入
- [x] 工作流引擎（4 张表）
- [x] 站内通知
- [x] Excel 导入（动态建表 + 字段映射配置）

---

## 二、数据库分析

### 2.1 当前业务表清单（46 张 + 20 张动态表）

> 详细字段清单见附录 A，本节聚焦关联关系与问题。

#### 业务主数据表（5 张）

| 表名 | 模块 | 关联情况 |
|------|------|----------|
| `departments` | 基础 | 自关联（parent_id） |
| `personnel` | 人员 | 被 8 张表引用（业务字段，无外键） |
| `vehicles` | 车辆 | 被 3 张表引用 |
| `users` | 系统 | RBAC + 审计 + AI 记录引用 |
| `tenants` | 系统 | 被 8 张表 tenant_id 引用 |

#### 风险隐患事故培训表（6 张）

| 表名 | 模块 | 关联情况 |
|------|------|----------|
| `risk_sources` | 风险 | **孤立**（仅 source_file_id） |
| `hazards` | 隐患 | **孤立**（无人员/部门外键） |
| `accidents` | 事故 | vehicle_id + personnel_id（无外键） |
| `accident_persons` | 事故 | accident_id + personnel_id（无外键） |
| `training_records` | 培训 | personnel_id（无外键） |
| `training_roster` | 培训 | personnel_id（无外键） |

#### 应急目标规章表（7 张，全部孤立）

| 表名 | 模块 | 关联情况 |
|------|------|----------|
| `emergency_plans` | 应急 | **完全孤立** |
| `emergency_supplies` | 应急 | **完全孤立** |
| `emergency_drills` | 应急 | **完全孤立**（无 emergency_plan_id） |
| `contract_signs` | 目标 | **完全孤立** |
| `org_personnel` | 目标 | **完全孤立** |
| `responsibilities` | 目标 | **完全孤立** |
| `safety_budgets` | 目标 | **完全孤立** |
| `regulations` | 规章 | **完全孤立** |

#### 网格与现场表（3 张）

| 表名 | 模块 | 关联情况 |
|------|------|----------|
| `grid_areas` | 现场 | personnel_id（无外键） |
| `grid_patrol_logs` | 现场 | grid_id（无外键） |
| `sanwei_violations` | 三违 | **完全孤立**（无人员/车辆/部门字段） |

#### 保险表（3 张）

| 表名 | 模块 | 关联情况 |
|------|------|----------|
| `insurance_history` | 保险 | vehicle_id（无外键） |
| `personnel_insurance` | 保险 | personnel_id（无外键） |
| `over_age_personnel` | 保险 | personnel_id（无外键） |

#### 系统与基础设施表（15 张）

| 表名 | 模块 | 关联情况 |
|------|------|----------|
| `token_blacklist` | 认证 | user_id（FK） |
| `login_attempts` | 认证 | 仅 username 业务关联 |
| `roles` | RBAC | tenant_id（FK） |
| `menus` | RBAC | 自关联 |
| `role_menu` | RBAC | role_id + menu_id（FK） |
| `user_role` | RBAC | user_id + role_id（FK） |
| `sys_operation_log` | 审计 | user_id 业务关联 |
| `audit_logs` | 审计 | **未正式建表**（dashboard 引用） |
| `alerts` | 告警 | **未正式建表**（overview 引用） |
| `workflows` / `workflow_instances` / `workflow_tasks` / `workflow_history` | 工作流 | 内部互关联 |
| `notifications` | 通知 | user_id 业务关联 |
| `ai_generation_records` | AI | user_id（FK） |

#### IoT 表（3 张，全部未正式建表）

| 表名 | 模块 | 关联情况 |
|------|------|----------|
| `iot_devices` | IoT | 内部互关联 |
| `iot_device_data` | IoT | device_id 业务关联 |
| `iot_device_alerts` | IoT | device_id 业务关联，**与业务主数据完全隔离** |

#### 文件导入表（3 张）

| 表名 | 模块 | 关联情况 |
|------|------|----------|
| `file_records` | 文件 | 被 risk_sources、t_* 引用 |
| `import_logs` | 导入 | file_record_id（FK） |
| `field_mapping_config` | 配置 | 独立配置表 |

#### 动态表（20 张 `t_*`）

由 Excel 导入按需创建，命名形如 `t_<模块号>_<模块名>_<sheet>`，通用追加字段：`data_period`、`source_file_id`、`import_job_id`、`row_hash`、`last_updated_at`、`version`。**与规范化业务表并行存在，数据冗余但不互通**。

### 2.2 表之间关联关系

#### 关联关系总图（文字版）

```
                    departments (字典, 自关联)
                         ↑ dept_id (无外键)
                         │
personnel ←─────────┬─── personnel_insurance
  ↑                 ├─── over_age_personnel
  │                 ├─── training_records
  personnel_id      ├─── training_roster
  (无外键)          ├─── grid_areas
  │                 ├─── accident_persons
  │                 └─── accidents (主事故)
  │
vehicles ←────┬─── insurance_history
  ↑           ├─── accidents (vehicle_id)
  vehicle_id  └─── risk-control 引用
  (无外键)

accidents ──── accident_persons (多对多)
grid_areas ── grid_patrol_logs
workflows ── workflow_instances ── workflow_tasks ── workflow_history
users ── user_role ── roles ── role_menu ── menus
  ├── token_blacklist (FK)
  ├── notifications
  ├── ai_generation_records (FK)
  ├── sys_operation_log
  └── tenant_id → tenants

file_records ── import_logs (FK)
           └── risk_sources.source_file_id
           └── t_* 表.source_file_id

【完全孤立岛屿】
  regulations · emergency_plans · emergency_supplies · emergency_drills
  contract_signs · org_personnel · responsibilities · safety_budgets
  risk_sources · sanwei_violations · iot_devices · iot_device_data · iot_device_alerts
```

#### 显式外键约束统计

| 类型 | 数量 |
|------|------|
| 显式 FOREIGN KEY 约束 | 6 处 |
| 业务字段关联（无外键） | 15+ 处 |
| 完全孤立表 | 14 张 |

### 2.3 当前数据孤岛分析

#### 孤立表清单（14 张完全孤立）

| 表名 | 模块 | 孤立原因 | 影响 |
|------|------|----------|------|
| `regulations` | 规章 | 无 personnel_id/dept_id | 无法追溯制度起草人/责任部门 |
| `emergency_plans` | 应急 | 仅有字符串 responsible_dept/person | 无法联动责任人/部门 |
| `emergency_supplies` | 应急 | 仅有字符串 responsible_person | 无法关联库存与人员 |
| `emergency_drills` | 应急 | 无 emergency_plan_id | 演练与预案脱节 |
| `contract_signs` | 目标 | 无 signer_id/dept_id | 合同无法关联签字人 |
| `org_personnel` | 目标 | 字段全为字符串 | 安全组织与人员主数据脱节 |
| `responsibilities` | 目标 | 字段全为字符串 | 责任制考核无法到人到岗 |
| `safety_budgets` | 目标 | 无任何关联 | 预算无法关联部门/项目 |
| `risk_sources` | 风险 | 仅 source_file_id | 风险无法关联责任人/隐患/车辆 |
| `sanwei_violations` | 三违 | 无人员/车辆/部门字段 | 三违无法追溯违章人/车辆 |
| `iot_devices` | IoT | 内部互关联 | 设备无法关联网格/风险源 |
| `iot_device_alerts` | IoT | 仅 device_id | IoT 告警无法触发业务流程 |
| `audit_logs` | 审计 | 未正式建表 | 审计与 sys_operation_log 概念重叠 |
| `alerts` | 告警 | 未正式建表 | 告警源不统一（alerts.js 查 hazards，overview.js 查 alerts） |

#### 数据冗余与不互通

- `t_02_保险及人员管理_花名册` 与 `personnel` 数据重叠，无同步机制
- `t_02_*_车辆保险统计表` 与 `vehicles` + `insurance_history` 重叠
- `t_10_隐患排查_登记表` 与 `hazards` 重叠
- Excel 导入到 `t_*` 表后不会自动同步到规范化业务表

### 2.4 需要增加关联的字段

| 表名 | 缺失字段 | 建议关联目标 | 业务价值 |
|------|----------|--------------|----------|
| `hazards` | `responsible_person_id`、`checker_id`、`department_id`、`verify_user_id` | personnel / users / departments | 隐患责任到人 |
| `hazards` | `risk_source_id` | risk_sources | 风险→隐患闭环 |
| `accidents` | `department_id`、`accident_type_id`（字典） | departments / 字典表 | 事故维度分析 |
| `accidents` | `related_hazard_ids`（数组） | hazards | 隐患→事故追溯 |
| `training_records` | `trainer_id`、`related_hazard_id`、`related_accident_id` | personnel / hazards / accidents | 培训针对性追溯 |
| `grid_patrol_logs` | `patrol_user_id`、`discovered_hazard_id` | personnel / hazards | 巡查→隐患闭环 |
| `regulations` | `department_id`、`creator_user_id` | departments / users | 制度责任部门 |
| `emergency_plans` | `responsible_person_id`、`responsible_dept_id`、`creator_user_id` | personnel / departments / users | 应急责任到人 |
| `emergency_drills` | `emergency_plan_id`、`organizer_id`、`participant_ids`（数组） | emergency_plans / personnel | 演练关联预案 |
| `emergency_supplies` | `responsible_person_id`、`department_id` | personnel / departments | 物资责任到人 |
| `contract_signs` | `signer_id`（personnel_id）、`department_id` | personnel / departments | 合同电子化 |
| `org_personnel` | `personnel_id`、`department_id` | personnel / departments | 安全组织与主数据对齐 |
| `responsibilities` | `personnel_id`、`department_id` | personnel / departments | 责任制考核到人 |
| `safety_budgets` | `department_id`、`creator_user_id` | departments / users | 预算部门化 |
| `risk_sources` | `department_id`、`responsible_person_id`、`vehicle_id` | departments / personnel / vehicles | 风险责任到人/车 |
| `sanwei_violations` | `violator_person_id`、`vehicle_id`、`department_id`、`related_hazard_id` | personnel / vehicles / departments / hazards | 三违追溯 |
| `iot_devices` | `grid_id`、`risk_source_id` | grid_areas / risk_sources | 设备位置关联 |
| `iot_device_alerts` | `triggered_hazard_id` | hazards | IoT 告警触发隐患 |
| `users` | `dept_id`（显式外键） | departments | 用户部门归属 |

### 2.5 Schema 一致性问题汇总

| 问题 | 位置 | 风险 |
|------|------|------|
| `hazards` 表被代码查询 `title`/`resolved_at`/`severity`/`area`/`department` 字段，但表定义中无 | `alerts.js`、`dashboard.js`、`bi.js`、`performance_indexes.sql` | 查询失败/索引创建失败 |
| `accidents` 表被查询 `occurred_at`/`severity`/`area`/`department`，实际字段是 `accident_date`/`level`/`township` | `bi.js`、`dashboard.js`、`performance_indexes.sql` | 同上 |
| `sys_operation_log` 在 unified_schema.sql 与 server/sql/sys_operation_log.sql 中字段不一致 | 双定义冲突 | CREATE TABLE IF NOT EXISTS 保留先创建版本 |
| `audit_logs` 无正式 CREATE 语句，但被 dashboard.js/migrate_multi_tenant.sql 引用 | 未建表 | 运行时报错 |
| `alerts` 无正式 CREATE 语句，但被 overview.js 引用 | 未建表 | 运行时报错 |
| 关联表命名混乱：`user_role`/`role_menu`（单数）vs 索引指向 `user_roles`/`role_menus`（复数） | migrate_rbac.sql vs migrate_indexes_optimization.sql | 索引创建失败 |
| `org_personnel`（单数）vs legacy `org_personnels`（复数） | 新代码 vs legacy Python | 命名歧义 |
| `roles`/`menus` 表无 `is_deleted`，但 `roles.js`/`menus.js` 路由使用 | migrate_rbac.sql vs 路由代码 | 查询失败 |
| 多租户仅覆盖 8 张表，核心业务表（vehicles/personnel/hazards/accidents 等）未加 tenant_id | migrate_multi_tenant.sql | 多租户隔离失效 |

---

## 三、HSE 业务模型分析（安全生产标准化视角）

### 3.1 风险管理（risk-control）

- **现状**：`risk_sources` 表存储风险源（含 GIS 多边形、风险等级、管控措施），支持 Excel 导入与地理空间展示。
- **数据流**：Excel → `t_09_*` 动态表 → `risk_sources`（部分）→ BI 大屏展示。
- **缺口**：
  - 无 `responsible_person_id`/`department_id`/`vehicle_id`，风险责任无法到人。
  - 无 `risk_source_id` 在 hazards 表中关联，**风险→隐患链路断裂**。
  - 无风险动态评估记录表（风险等级变化历史）。
  - 无风险管控措施有效性回评估机制。

### 3.2 隐患治理（hazards）

- **现状**：`hazards` 表覆盖隐患排查登记、整改、验收全流程（status、deadline、fixer、verify_user）。
- **数据流**：人工录入/Excel 导入 → `hazards` → alerts.js 派生告警 → overview 看板。
- **缺口**：
  - 无 `risk_source_id`，无法追溯隐患源自哪个风险源。
  - 无 `responsible_person_id`/`checker_id`/`verify_user_id`，仅字符串 fixer/checker。
  - 无整改措施有效性记录（整改后是否复发）。
  - 无 `related_accident_id`，**隐患→事故链路缺失**。
  - 字段定义与代码引用不一致（title/resolved_at/severity 等字段不存在）。

### 3.3 培训管理（training）

- **现状**：`training_records` + `training_roster` 双表，支持培训记录与花名册管理。
- **数据流**：Excel 导入花名册 → 培训实施 → 录入 training_records。
- **缺口**：
  - 无 `trainer_id`，培训师仅字符串。
  - 无 `related_hazard_id`/`related_accident_id`，**无法针对性培训**（事故后培训、隐患专项培训）。
  - 无培训效果评估（考试通过率、行为改变度）。
  - 无培训计划与排期表。
  - 无培训档案（员工历年培训总览）。

### 3.4 人员管理（personnel）

- **现状**：`personnel` 主数据 + `over_age_personnel` 超龄管控 + `personnel_insurance` 参保记录。
- **数据流**：Excel 导入 → personnel → 各业务表引用 personnel_id。
- **缺口**：
  - `dept_id` 字段存在但无外键，且与 `departments` 表可能不同步。
  - 无人员资质证书表（特种作业证、安全合格证、健康证）。
  - 无人员岗位变动历史表。
  - 无人员安全画像（培训学时、违章次数、事故记录、隐患发现数）。

### 3.5 车辆管理（vehicles）

- **现状**：`vehicles` + `insurance_history` 双表，支持车辆基础信息与保险历史。
- **数据流**：Excel 导入 → vehicles → accidents 引用。
- **缺口**：
  - 无车辆维护保养记录表。
  - 无车辆年检记录表。
  - 无车辆行驶里程记录（油耗/驾驶员绑定）。
  - 无车辆事故历史聚合视图。
  - 无车辆安全评分模型。

### 3.6 事故管理（accidents）

- **现状**：`accidents` + `accident_persons` 双表，支持事故登记与多涉事人员，含 RCA 根因分析（AI 辅助）。
- **数据流**：事故录入 → accident_persons 关联人员 → AI 生成 RCA → dashboard 聚合。
- **缺口**：
  - 无 `related_hazard_ids`，**无法追溯事故源自哪些未整改隐患**。
  - 无 `department_id`，仅有字符串 township。
  - 无事故整改措施追踪表（事故后整改闭环）。
  - 无事故经济损失统计分析视图。
  - 字段定义与代码引用不一致（occurred_at/severity/area 等不存在）。

### 3.7 应急管理（emergency）

- **现状**：`emergency_plans` + `emergency_supplies` + `emergency_drills` 三表。
- **数据流**：预案登记 → 物资储备 → 定期演练。
- **缺口**：
  - 三表之间完全孤立，**演练不关联预案**。
  - 无 `responsible_person_id`/`department_id`，仅字符串。
  - 无演练参演人员明细表。
  - 无应急物资调用记录表。
  - 无预案启动记录表（真实事件触发预案）。
  - 无与事故/隐患的关联（事故触发应急响应）。

### 3.8 目标管理（objectives）

- **现状**：`contract_signs` + `org_personnel` + `responsibilities` + `safety_budgets` 四表。
- **数据流**：年度签订合同 → 组织人员 → 责任制考核 → 预算执行。
- **缺口**：
  - 四表全部孤立，无人员/部门外键。
  - 无目标指标分解表（年度目标→季度→月度→部门→个人）。
  - 无目标完成度自动计算（需从其他模块聚合，当前无机制）。
  - `org_personnel` 与 `personnel` 主数据脱节，存在两套人员数据。
  - 无安全投入与隐患整改/培训的关联（投入产出分析）。

### 3.9 现场管理（site-mgmt）

- **现状**：`grid_areas` + `grid_patrol_logs` + `sanwei_violations`（三违）。
- **数据流**：网格人员分配 → 巡查打卡 → 发现问题 → 派生三违/隐患。
- **缺口**：
  - `sanwei_violations` 完全孤立，无人员/车辆/部门字段。
  - `grid_patrol_logs` 无 `discovered_hazard_id`，**巡查→隐患链路缺失**。
  - 三违管理当前走内存模式（createMemoryCrud），未持久化到数据库。
  - 无现场作业许可（危险作业票）管理。
  - 无现场实时视频/图片取证归档。

### 3.10 模块数据闭环分析（现状 vs 目标）

#### 目标闭环：风险 → 隐患 → 整改 → 培训 → 事故 → 风险

| 闭环环节 | 数据库关联 | 当前状态 | 闭环情况 |
|----------|-----------|----------|---------|
| 风险 → 隐患 | hazards.risk_source_id | **缺失** | 断裂 |
| 隐患 → 整改 | hazards.status + fixer | 部分实现 | 半闭环（无整改有效性追踪） |
| 整改 → 培训 | training_records.related_hazard_id | **缺失** | 断裂 |
| 培训 → 事故 | accidents.related_training_ids | **缺失** | 断裂 |
| 事故 → 风险 | risk_sources.related_accident_ids | **缺失** | 断裂 |
| 事故 → 隐患（追溯） | accidents.related_hazard_ids | **缺失** | 断裂 |
| 隐患 → 应急 | emergency_plans.related_hazard_id | **缺失** | 断裂 |
| 巡查 → 隐患 | grid_patrol_logs.discovered_hazard_id | **缺失** | 断裂 |
| IoT → 隐患 | iot_device_alerts.triggered_hazard_id | **缺失** | 断裂 |
| 三违 → 人员/车辆 | sanwei_violations.violator_person_id | **缺失** | 断裂 |

**结论**：当前 10 条闭环链路中，9 条断裂，仅"隐患→整改"实现半闭环。系统目前是**功能堆砌型**而非**数据驱动型**，无法支撑安全驾驶舱与趋势分析。

---

## 四、HSE 数据中心设计方案

### 4.1 设计目标

建立**统一安全事件模型（Unified Safety Event Model, USEM）**，将隐患、事故、三违、IoT 告警、人工巡检告警、应急事件等所有安全事件统一抽象为一张事件流水表，实现：

1. **统一查询入口**：所有安全事件可按时间、空间、人员、车辆、部门、类型、等级、状态多维检索。
2. **自动追溯**：任一事件可追溯其上游事件（如事故→隐患→风险）与下游事件（如隐患→整改→培训）。
3. **驾驶舱数据源**：BI 大屏、趋势分析、安全指数计算统一从事件表聚合。
4. **多年沉淀**：事件表按年分区，支持 5 年以上历史数据查询。

### 4.2 统一安全事件表设计（safety_events）

```sql
-- 统一安全事件表（HSE 数据中心核心）
CREATE TABLE safety_events (
    id              BIGSERIAL PRIMARY KEY,
    event_code      VARCHAR(64) UNIQUE NOT NULL,      -- 事件编号 SE-YYYYMMDD-NNNNN
    event_type      VARCHAR(32) NOT NULL,             -- hazard/accident/violation/iot_alert/patrol_alert/emergency/audit
    event_subtype   VARCHAR(64),                     -- 子类型：如 accident.traffic / hazard.electrical
    source_table    VARCHAR(64) NOT NULL,             -- 源表名：hazards/accidents/sanwei_violations/iot_device_alerts
    source_id       BIGINT NOT NULL,                  -- 源表记录 ID
    title           VARCHAR(255) NOT NULL,            -- 事件标题（冗余便于查询）
    description     TEXT,                             -- 事件描述
    severity        VARCHAR(16) NOT NULL,             -- critical/major/minor/info（统一等级）
    status          VARCHAR(32) NOT NULL DEFAULT 'open', -- open/processing/resolved/closed
    occurred_at     TIMESTAMPTZ NOT NULL,             -- 事件发生时间（统一字段，替代 accident_date/hazard_date）
    occurred_date   DATE GENERATED ALWAYS AS (occurred_at::date) STORED, -- 日期维度（用于按日聚合）
    location        VARCHAR(255),                     -- 地点
    township        VARCHAR(64),                       -- 乡镇
    lat             NUMERIC(10,7),                     -- 纬度
    lng             NUMERIC(10,7),                     -- 经度
    -- 业务关联（统一维度）
    department_id   BIGINT REFERENCES departments(id), -- 责任部门
    personnel_id    BIGINT REFERENCES personnel(id),  -- 主要责任人/涉事人
    vehicle_id      BIGINT REFERENCES vehicles(id),   -- 涉事车辆
    risk_source_id  BIGINT,                            -- 关联风险源（若源自风险）
    grid_id         BIGINT,                            -- 关联网格
    iot_device_id   BIGINT,                           -- 关联 IoT 设备（若源自 IoT）
    -- 闭环关联
    parent_event_id BIGINT REFERENCES safety_events(id), -- 上游事件（如事故的隐患来源）
    root_event_id   BIGINT,                            -- 根事件（闭环追溯链顶端）
    -- 工作流关联
    workflow_instance_id BIGINT,                       -- 关联工作流实例
    -- 评估字段
    loss_amount     NUMERIC(14,2),                     -- 经济损失
    risk_score      NUMERIC(6,2),                      -- 风险评分（0-100）
    -- 元数据
    extra           JSONB,                             -- 扩展字段（源表特有字段）
    tenant_id      BIGINT NOT NULL DEFAULT 1,
    created_by     BIGINT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted     BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE(source_table, source_id, tenant_id)
);

-- 按年分区（多年数据沉淀）
CREATE INDEX idx_safety_events_type_date ON safety_events(event_type, occurred_date);
CREATE INDEX idx_safety_events_dept_date ON safety_events(department_id, occurred_date);
CREATE INDEX idx_safety_events_person ON safety_events(personnel_id);
CREATE INDEX idx_safety_events_vehicle ON safety_events(vehicle_id);
CREATE INDEX idx_safety_events_status ON safety_events(status, occurred_at);
CREATE INDEX idx_safety_events_parent ON safety_events(parent_event_id);
CREATE INDEX idx_safety_events_tenant ON safety_events(tenant_id, occurred_date);
CREATE INDEX idx_safety_events_extra ON safety_events USING GIN(extra);
```

### 4.3 事件关联关系表（safety_event_links）

用于建立事件之间的多对多关联（比 parent_event_id 更灵活）：

```sql
CREATE TABLE safety_event_links (
    id             BIGSERIAL PRIMARY KEY,
    from_event_id  BIGINT NOT NULL REFERENCES safety_events(id),
    to_event_id    BIGINT NOT NULL REFERENCES safety_events(id),
    link_type      VARCHAR(32) NOT NULL,  -- triggered_by / led_to / related_to / caused_by
    description    TEXT,
    created_by     BIGINT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(from_event_id, to_event_id, link_type)
);
```

### 4.4 安全维度表（safety_dimensions）

存储可复用的安全维度（事故类型、隐患类别、违章类型、风险类型等），替代散落在各表的字符串字段：

```sql
CREATE TABLE safety_dimensions (
    id          BIGSERIAL PRIMARY KEY,
    dim_type    VARCHAR(32) NOT NULL,  -- accident_type / hazard_category / violation_type / risk_type
    dim_code    VARCHAR(64) NOT NULL,
    dim_name    VARCHAR(128) NOT NULL,
    parent_id   BIGINT REFERENCES safety_dimensions(id), -- 支持层级
    sort_order  INT DEFAULT 0,
    is_active   BOOLEAN DEFAULT TRUE,
    tenant_id   BIGINT DEFAULT 1,
    UNIQUE(dim_type, dim_code, tenant_id)
);
```

### 4.5 数据流向设计

#### 4.5.1 事件入库流向

```
┌─────────────────────────────────────────────────────────────────┐
│  业务系统事件源                                                  │
├─────────────────────────────────────────────────────────────────┤
│  hazards 表        accidents 表      sanwei_violations 表       │
│  iot_device_alerts  grid_patrol_logs  emergency_drills          │
└──────────┬──────────────┬──────────────────┬─────────────────────┘
           │              │                  │
           ▼              ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│  事件同步层（Trigger / 应用层 Sync Service）                    │
│  - PostgreSQL AFTER INSERT/UPDATE/DELETE Trigger                │
│  - 或应用层在业务路由中调用 eventSyncService.sync()              │
│  - 字段映射：hazard_date → occurred_at，level → severity 等     │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  safety_events（统一事件表）                                     │
│  - 统一字段：event_type / severity / occurred_at / status       │
│  - 统一维度：department_id / personnel_id / vehicle_id          │
│  - 闭环字段：parent_event_id / root_event_id                    │
└──────────────────────┬──────────────────────────────────────────┘
                       │
           ┌───────────┼───────────┬──────────────┐
           ▼           ▼           ▼              ▼
┌──────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐
│ BI 大屏      │ │ 趋势分析  │ │ 安全指数  │ │ 驾驶舱       │
│ 聚合查询     │ │ 周月年报  │ │ 模型计算  │ │ 多维下钻     │
└──────────────┘ └──────────┘ └──────────┘ └──────────────┘
```

#### 4.5.2 闭环数据流向（以事故为例）

```
1. 风险源录入 → risk_sources → safety_events(event_type=risk)
2. 风险源失控 → 隐患发现 → hazards → safety_events(event_type=hazard, parent=risk)
3. 隐患整改 → training_records(专项培训) → safety_events(event_type=training, parent=hazard)
4. 隐患未整改 → 事故发生 → accidents → safety_events(event_type=accident, parent=hazard)
5. 事故处置 → emergency_drills(预案启动) → safety_events(event_type=emergency, parent=accident)
6. 事故整改 → 新增隐患/培训 → safety_events(parent=accident)
7. 全链路追溯：accident → hazard → risk（root_event_id = risk 的 event_id）
```

### 4.6 同步机制设计（两种方案）

#### 方案 A：PostgreSQL Trigger（推荐，数据强一致）

为每张源表创建 AFTER INSERT/UPDATE/DELETE Trigger，自动同步到 `safety_events`。

**优点**：数据强一致，无应用层侵入。
**缺点**：增加数据库负担，需为每张源表单独编写 Trigger。

#### 方案 B：应用层 Event Sync Service

在后端业务路由（hazards.js、accidents.js 等）的 create/update 逻辑中调用 `eventSyncService.sync('hazards', recordId)`。

**优点**：业务可见，可加复杂逻辑。
**缺点**：需修改所有业务路由，易遗漏。

**建议**：采用方案 A 为主（保证一致性），方案 B 为辅（处理复杂字段映射）。

### 4.7 历史数据迁移方案

```sql
-- 一次性迁移脚本示例（hazards → safety_events）
INSERT INTO safety_events (
    event_code, event_type, source_table, source_id,
    title, description, severity, status,
    occurred_at, location, township,
    department_id, personnel_id, vehicle_id,
    created_at, tenant_id
)
SELECT
    'SE-' || TO_CHAR(hazard_date, 'YYYYMMDD') || '-' || LPAD(id::TEXT, 5, '0'),
    'hazard',
    'hazards',
    id,
    description,
    description,
    CASE level WHEN '重大' THEN 'critical' WHEN '较大' THEN 'major'
               WHEN '一般' THEN 'minor' ELSE 'info' END,
    CASE status WHEN '已整改' THEN 'resolved' WHEN '已验收' THEN 'closed'
                ELSE 'open' END,
    hazard_date,
    location,
    township,
    NULL, NULL, NULL,
    created_at,
    1
FROM hazards
WHERE is_deleted = FALSE;
```

---

## 五、安全趋势分析方案

### 5.1 指标体系设计

#### 5.1.1 周报指标（15 项）

| 指标 | 计算逻辑 | 数据源 |
|------|----------|--------|
| 本周新增隐患数 | COUNT(safety_events WHERE event_type=hazard AND occurred_at 本周) | safety_events |
| 本周整改隐患数 | COUNT(safety_events WHERE event_type=hazard AND status=resolved AND updated_at 本周) | safety_events |
| 隐患整改率 | 本周整改/本周新增 × 100% | safety_events |
| 本周新增事故数 | COUNT(safety_events WHERE event_type=accident) | safety_events |
| 本周三违次数 | COUNT(safety_events WHERE event_type=violation) | safety_events |
| 本周培训场次/学时 | COUNT(training_records) / SUM(duration_minutes) | training_records |
| 本周巡查次数 | COUNT(grid_patrol_logs) | grid_patrol_logs |
| 本周 IoT 告警数 | COUNT(safety_events WHERE event_type=iot_alert) | safety_events |
| 本周应急演练次数 | COUNT(emergency_drills WHERE drill_date 本周) | emergency_drills |
| 隐患平均整改时长 | AVG(updated_at - occurred_at WHERE status=resolved) | safety_events |
| 高风险事件占比 | COUNT(severity IN critical,major)/总事件 × 100% | safety_events |
| 部门隐患 TOP5 | GROUP BY department_id ORDER BY COUNT DESC LIMIT 5 | safety_events |
| 乡镇事故分布 | GROUP BY township WHERE event_type=accident | safety_events |
| 车辆事故率 | 本周事故车辆数/总车辆数 × 100% | accidents + vehicles |
| 安全投入执行率 | 本周 safety_budgets.used_amount / budget_amount | safety_budgets |

#### 5.1.2 月报指标（25 项，含周报全部 + 以下）

| 指标 | 计算逻辑 |
|------|----------|
| 月度安全指数 | 见 5.2 安全指数模型 |
| 月度千人违章率 | 三违次数 / 人员数 × 1000 |
| 月度千人事故率 | 事故涉事人数 / 人员数 × 1000 |
| 月度隐患复发率 | 复发隐患数 / 已整改隐患数 × 100% |
| 月度培训覆盖率 | 参训人数 / 应参训人数 × 100% |
| 月度培训合格率 | 考核合格人数 / 参训人数 × 100% |
| 月度保险覆盖率 | 参保人员 / 总人员 × 100% |
| 月度超龄人员优化率 | 已优化超龄人员 / 超龄人员总数 × 100% |
| 月度车辆完好率 | 完好车辆数 / 总车辆数 × 100% |
| 月度应急物资完备率 | 达标物资种类 / 应储备种类 × 100% |
| 隐患类型 TOP10 分布 | GROUP BY event_subtype |
| 事故类型分布 | GROUP BY accident_type |
| 风险等级分布 | GROUP BY severity |
| 各乡镇安全评分排名 | 见 5.2 |
| 各部门安全评分排名 | 见 5.2 |
| 闭环完成率 | 有 parent_event_id 且 status=closed 的事件占比 |
| 平均闭环时长 | AVG(root_event 闭环时长) |
| 同比/环比变化 | 与上月/去年同月对比 |
| 重大风险管控有效性 | 风险源→隐患转化率 |
| 应急预案演练覆盖率 | 已演练预案数 / 预案总数 × 100% |
| 三违类型分布 | GROUP BY violation_type |
| 经济损失统计 | SUM(loss_amount) |
| 安全投入产出比 | 投入金额 / 损失金额 |
| 隐患整改平均成本 | 整改投入 / 整改数量 |
| 人员安全画像 | 培训学时 + 违章次数 + 事故次数（前 10%/后 10%） |

#### 5.1.3 年度指标（30 项，含月报全部 + 以下）

| 指标 | 计算逻辑 |
|------|----------|
| 年度安全生产目标达成率 | 实际指标 / 目标责任书指标 × 100% |
| 年度安全指数趋势 | 12 个月安全指数曲线 |
| 年度事故同比下降率 | (去年事故数 - 今年事故数) / 去年事故数 × 100% |
| 年度千人事故率 | 全年事故涉事人数 / 平均人数 × 1000 |
| 年度千人伤亡率 | 死亡+重伤人数 / 平均人数 × 1000 |
| 年度经济损失同比下降率 | (去年损失 - 今年损失) / 去年损失 × 100% |
| 年度培训总学时/人均学时 | SUM(duration) / AVG(人员数) |
| 年度隐患整改率 | 全年整改/全年新增 × 100% |
| 年度隐患平均整改时长 | AVG(整改时长) |
| 年度保险投入 | SUM(personnel_insurance.premium + insurance_history.premium) |
| 年度安全投入总额 | SUM(safety_budgets.used_amount) |
| 年度安全投入占比 | 安全投入 / 营业收入（需对接财务） |
| 各模块多年趋势对比 | 风险/隐患/事故/培训 5 年曲线 |
| 年度闭环完成率 | 全年闭环事件 / 全年事件总数 × 100% |
| 年度高风险事件处置率 | 已处置重大事件 / 重大事件总数 × 100% |
| 年度应急演练覆盖率 | 已演练预案 / 预案总数 × 100% |
| 年度应急演练参演人次 | SUM(participants) |
| 年度三违趋势 | 12 个月三违曲线 + 同比 |
| 年度车辆事故率 | 事故车辆 / 总车辆 × 100% |
| 年度超龄人员清零进度 | 优化数 / 超龄总数 × 100% |
| 年度规章制度更新数 | COUNT(regulations WHERE updated_at 本年) |
| 年度安全文化评估 | 培训覆盖率 + 三违下降率 + 隐患主动发现率 |
| 年度安全投入产出比 | 投入总额 / 损失总额 |
| 年度人员安全画像分布 | 高/中/低风险人员占比 |
| 年度风险源变化 | 新增/消除/等级变化数量 |
| 年度安全绩效排名 | 各部门安全评分综合排名 |
| 年度安全生产标准化达标情况 | 各模块达标率 |
| 年度安全生产责任制考核结果 | responsibilities 表聚合 |
| 年度安全事故根本原因分析 | 基于事故 RCA 聚合 |
| 年度预测（AI） | 基于 5 年数据预测下一年趋势 |

### 5.2 安全指数模型

#### 5.2.1 综合安全指数（Safety Index, SI）

采用 **0-100 分制**，分数越高越安全。

```
SI = 100 - (事故严重度 × 40%) - (隐患未整改率 × 25%) - (三违率 × 15%) - (培训缺失率 × 10%) - (应急准备不足率 × 10%)
```

#### 5.2.2 五维子指数

| 子指数 | 权重 | 计算公式 |
|--------|------|----------|
| 事故指数（Accident Index, AI） | 40% | 100 - (重大事故数×20 + 一般事故数×5 + 轻微事故数×1) / 人员数 × 1000 |
| 隐患指数（Hazard Index, HI） | 25% | 100 - (未整改隐患数×3 + 逾期整改数×5) / 应整改总数 × 100 |
| 三违指数（Violation Index, VI） | 15% | 100 - 三违次数 / 人员数 × 1000 |
| 培训指数（Training Index, TI） | 10% | 培训覆盖率 × 0.6 + 培训合格率 × 0.4 |
| 应急指数（Emergency Index, EI） | 10% | 预案演练覆盖率 × 0.5 + 物资完备率 × 0.3 + 整改闭环率 × 0.2 |

#### 5.2.3 部门/乡镇安全评分

```
Dept_SI = SI × 0.6 + 目标完成率 × 20 + 闭环完成率 × 20
```

#### 5.2.4 人员安全画像

```
Person_Risk_Score = 
    培训学时缺失 × 20 +
    违章次数 × 15 +
    事故责任次数 × 30 +
    隐患未整改数 × 10 +
    超龄未优化 × 25
```

### 5.3 趋势分析实现方案

#### 5.3.1 物化视图（高性能聚合）

```sql
-- 日聚合物化视图
CREATE MATERIALIZED VIEW mv_safety_events_daily AS
SELECT
    occurred_date,
    event_type,
    severity,
    department_id,
    township,
    COUNT(*) AS event_count,
    COUNT(*) FILTER (WHERE status='closed') AS closed_count,
    AVG(loss_amount) AS avg_loss,
    SUM(loss_amount) AS total_loss
FROM safety_events
WHERE is_deleted = FALSE
GROUP BY occurred_date, event_type, severity, department_id, township;

-- 唯一索引
CREATE UNIQUE INDEX idx_mv_daily ON mv_safety_events_daily(occurred_date, event_type, severity, department_id, township);

-- 每日刷新（定时任务）
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_safety_events_daily;
```

#### 5.3.2 报表生成服务

- **周报**：每周一凌晨 2:00 由定时任务（node-cron）自动生成，基于 `mv_safety_events_daily` 聚合上周数据。
- **月报**：每月 1 日生成，包含月度指标 + 同比环比 + 部门排名 + Top 风险点。
- **年报**：每年 1 月生成，包含年度趋势 + 5 年对比 + AI 预测。
- **存储**：生成的报告写入 `safety_reports` 表（新增），含 markdown/json 双格式，前端可在线查看与下载。

#### 5.3.3 安全驾驶舱数据流

```
safety_events（实时） ──→ 物化视图（T+1 聚合） ──→ 趋势分析 ──→ 安全指数
        │                                            │
        └──→ 实时告警推送（WebSocket）←──── 阈值监控 ←─┘
                                              │
                                              ▼
                                         安全驾驶舱
```

---

## 六、系统下一阶段开发路线图

### 6.1 路线图总览

| 阶段 | 名称 | 优先级 | 核心目标 |
|------|------|--------|----------|
| 阶段 1 | 数据基础治理 | P0（最高） | 统一 Schema、修复字段不一致、补齐显式外键 |
| 阶段 2 | HSE 数据中心 | P0 | 统一安全事件表、事件同步机制、闭环关联字段 |
| 阶段 3 | 闭环链路打通 | P1 | 风险→隐患→整改→培训→事故 5 环闭环 |
| 阶段 4 | 趋势分析平台 | P1 | 周月年报、安全指数、物化视图、报表服务 |
| 阶段 5 | 安全驾驶舱 | P2 | BI 升级、实时下钻、多维分析 |
| 阶段 6 | 多年数据沉淀 | P2 | 按年分区、历史归档、AI 预测 |
| 阶段 7 | Excel 替代工程 | P2 | t_* 动态表数据迁移到规范化表 |
| 阶段 8 | 业务深化 | P3 | 资质证书、车辆维保、危险作业票等 |

### 6.2 阶段 1：数据基础治理（P0）

| 维度 | 内容 |
|------|------|
| **目标** | 消除 Schema 多源冲突，修复代码与表定义不一致，建立权威 Schema |
| **新增功能** | - 权威 Schema 文件（合并所有 SQL 到 `sql/v4.2_unified_schema.sql`）<br>- Schema 版本管理机制（migration 工具）<br>- 数据库一致性校验脚本 |
| **涉及数据库** | - 修复 hazards 表（补 title/resolved_at/severity/area/department 字段或修正代码引用）<br>- 修复 accidents 表（补 occurred_at/severity/area/department 或修正代码）<br>- 正式创建 audit_logs 表（统一与 sys_operation_log）<br>- 正式创建 alerts 表<br>- 为 roles/menus 补 is_deleted 字段<br>- 为核心业务表补 tenant_id<br>- 修正 user_role/role_menu 索引命名 |
| **涉及接口** | 修正 bi.js、dashboard.js、alerts.js、overview.js 中字段引用错误 |
| **涉及前端页面** | 无（仅后端数据层） |
| **风险点** | - 生产数据迁移风险：需停机维护窗口<br>- 字段重命名导致历史数据丢失：需先备份再 ALTER<br>- 索引重建锁表：需在低峰期执行<br>- 多个迁移脚本执行顺序依赖：需制定严格执行顺序文档 |

### 6.3 阶段 2：HSE 数据中心（P0）

| 维度 | 内容 |
|------|------|
| **目标** | 建立统一安全事件表，实现所有安全事件统一查询、统一追溯、统一分析 |
| **新增功能** | - safety_events 表（统一事件流水）<br>- safety_event_links 表（事件关联）<br>- safety_dimensions 表（维度字典）<br>- 事件同步服务（Trigger + 应用层双机制）<br>- 事件查询 API（多维检索、聚合统计、闭环追溯）<br>- 历史数据迁移脚本（hazards/accidents/sanwei_violations/iot_device_alerts → safety_events） |
| **涉及数据库** | - 新增 safety_events、safety_event_links、safety_dimensions 表<br>- 为 hazards 补 risk_source_id、responsible_person_id、department_id<br>- 为 accidents 补 related_hazard_ids、department_id<br>- 为 training_records 补 related_hazard_id、related_accident_id<br>- 为 grid_patrol_logs 补 discovered_hazard_id<br>- 为 sanwei_violations 补 violator_person_id、vehicle_id、department_id、related_hazard_id<br>- 为 emergency_drills 补 emergency_plan_id、organizer_id<br>- 为 risk_sources 补 department_id、responsible_person_id |
| **涉及接口** | - 新增 `/api/safety-events` 路由（CRUD + 检索 + 聚合 + 追溯）<br>- 新增 `/api/safety-dimensions` 路由（维度字典管理）<br>- 改造 hazards.js、accidents.js、training.js、emergency.js、risk-control.js、site-mgmt.js（写入时同步事件） |
| **涉及前端页面** | - 新增"安全事件中心"页面（统一事件列表 + 多维筛选）<br>- 新增"事件追溯图"页面（闭环链路可视化）<br>- 改造 BI 大屏（数据源切换到 safety_events） |
| **风险点** | - Trigger 性能影响：需压测高并发写入<br>- 历史数据迁移量大：需分批执行<br>- 字段映射复杂：需详细的映射规则文档<br>- 应用层同步遗漏：需自动化测试覆盖<br>- safety_events 表数据膨胀：需分区策略 |

### 6.4 阶段 3：闭环链路打通（P1）

| 维度 | 内容 |
|------|------|
| **目标** | 实现"风险→隐患→整改→培训→事故→风险"完整闭环，任一事件可全链路追溯 |
| **新增功能** | - 闭环配置（可配置闭环规则：如"重大隐患未整改 7 天自动派生事故预警"）<br>- 自动派生事件（隐患超期未整改→自动生成培训需求）<br>- 闭环看板（可视化展示闭环完成率、平均闭环时长）<br>- 闭环提醒（接近超期自动 WebSocket 推送） |
| **涉及数据库** | - 新增 closed_loop_rules 表（闭环规则配置）<br>- 新增 closed_loop_tasks 表（闭环任务）<br>- safety_events 表补闭环状态字段（is_closed, closed_at） |
| **涉及接口** | - 新增 `/api/closed-loop/rules` 路由<br>- 新增 `/api/closed-loop/tasks` 路由<br>- 改造 workflow.js（闭环任务与工作流集成）<br>- 改造 notifications.js（闭环超期提醒） |
| **涉及前端页面** | - 新增"闭环管理"页面（规则配置 + 任务列表 + 看板）<br>- 改造隐患/事故/培训详情页（展示上下游事件链） |
| **风险点** | - 闭环规则复杂：需与业务方充分沟通<br>- 自动派生误判：需人工确认机制<br>- 闭环状态更新并发：需乐观锁<br>- 跨模块数据一致性：需分布式事务或最终一致性方案 |

### 6.5 阶段 4：趋势分析平台（P1）

| 维度 | 内容 |
|------|------|
| **目标** | 建立周/月/年报自动生成能力，实现安全指数模型，支撑多年趋势分析 |
| **新增功能** | - 物化视图（日/周/月聚合）<br>- 报表生成服务（node-cron 定时任务）<br>- 安全指数计算引擎<br>- 报表在线查看与导出（PDF/Excel）<br>- 报表订阅（邮件/钉钉/飞书推送）<br>- 同比环比分析<br>- AI 报告生成（基于 aiService 增强） |
| **涉及数据库** | - 新增 safety_reports 表（生成的报告存储）<br>- 新增 mv_safety_events_daily、mv_safety_events_monthly 物化视图<br>- 新增 safety_index_history 表（安全指数历史）<br>- 新增 report_subscriptions 表（报告订阅配置） |
| **涉及接口** | - 新增 `/api/reports/weekly`、`/api/reports/monthly`、`/api/reports/annual` 路由<br>- 新增 `/api/safety-index` 路由（安全指数查询）<br>- 改造 bi.js（接入趋势数据） |
| **涉及前端页面** | - 新增"周报中心"页面<br>- 新增"月报中心"页面<br>- 新增"年度报告"页面<br>- 新增"安全指数"看板页面<br>- 新增"趋势分析"页面（多年曲线 + 同比环比）<br>- 改造 BI 大屏（接入安全指数组件） |
| **风险点** | - 物化视图刷新性能：需 CONCURRENTLY 刷新<br>- 报表生成耗时长：需异步任务队列<br>- 安全指数模型校准：需业务专家确认权重<br>- AI 报告质量：需 prompt 工程优化<br>- 报表导出格式：需 PDF/Excel 模板设计 |

### 6.6 阶段 5：安全驾驶舱（P2）

| 维度 | 内容 |
|------|------|
| **目标** | 打造企业级 HSE 安全驾驶舱，实现一屏统揽、多维下钻、实时预警 |
| **新增功能** | - 驾驶舱首页（综合安全指数 + 五维雷达 + 实时告警 + 趋势曲线）<br>- 多维下钻（部门→乡镇→网格→事件）<br>- 实时事件流（WebSocket 推送）<br>- GIS 地图（风险源/隐患/事故/车辆分布）<br>- 人员/车辆/部门安全画像<br>- 预警阈值配置（超阈值自动推送）<br>- 移动端驾驶舱（高管移动查看） |
| **涉及数据库** | - 新增 dashboard_configs 表（驾驶舱配置）<br>- 新增 alert_thresholds 表（预警阈值）<br>- 新增 person_profiles 表（人员安全画像物化） |
| **涉及接口** | - 新增 `/api/cockpit` 路由（驾驶舱聚合数据）<br>- 新增 `/api/profiles/person`、`/api/profiles/vehicle`、`/api/profiles/dept` 路由<br>- 改造 alerts.js（接入阈值预警） |
| **涉及前端页面** | - 新增"安全驾驶舱"页面（核心）<br>- 新增"GIS 安全地图"页面<br>- 新增"安全画像"页面（人员/车辆/部门）<br>- 改造移动端 dashboard（高管视图） |
| **风险点** | - 实时数据量：需 Redis 缓存<br>- GIS 性能：需矢量切片<br>- 移动端适配：需响应式设计<br>- 高管使用习惯：需 UX 调研 |

### 6.7 阶段 6：多年数据沉淀（P2）

| 维度 | 内容 |
|------|------|
| **目标** | 支持 5 年以上历史数据存储与查询，为长期趋势分析奠定基础 |
| **新增功能** | - safety_events 按年分区（pg_partman 自动管理）<br>- 历史数据归档（3 年前数据迁移到冷存储）<br>- 5 年趋势对比看板<br>- AI 长期趋势预测（基于 5 年数据训练）<br>- 数据冷热分离（热数据 1 年内 SSD，冷数据归档） |
| **涉及数据库** | - safety_events 改为分区表（PARTITION BY RANGE(occurred_at)）<br>- 安装 pg_partman 扩展<br>- 配置自动分区维护任务<br>- 新增 archived_events 表（冷存储） |
| **涉及接口** | - 改造 `/api/safety-events`（支持跨年查询路由）<br>- 新增 `/api/trends/5year` 路由 |
| **涉及前端页面** | - 新增"多年趋势对比"页面<br>- 新增"AI 预测"页面增强 |
| **风险点** | - 分区迁移风险：需停机<br>- 跨年查询性能：需并行查询<br>- 冷存储恢复：需恢复演练<br>- AI 预测准确率：需数据积累 |

### 6.8 阶段 7：Excel 替代工程（P2）

| 维度 | 内容 |
|------|------|
| **目标** | 将 20 张 t_* 动态表数据迁移到规范化业务表，消除数据冗余，实现 Excel 在线替代 |
| **新增功能** | - 在线 Excel 编辑器（替代离线 Excel 录入）<br>- 数据迁移工具（t_* → 规范化表）<br>- Excel 模板下载与在线导入<br>- 数据校验规则引擎<br>- 批量操作（增删改）<br>- 数据版本管理（保留 Excel 导入历史） |
| **涉及数据库** | - t_* 表数据迁移到 personnel、vehicles、hazards、insurance_history 等<br>- t_* 表标记为 deprecated（不删除，保留历史）<br>- field_mapping_config 增加迁移映射规则 |
| **涉及接口** | - 改造 `/api/import`（导入直接写规范化表）<br>- 新增 `/api/migration/t-to-normalized` 路由<br>- 改造各业务路由（支持批量操作） |
| **涉及前端页面** | - 改造所有业务页面（支持在线批量编辑）<br>- 新增"数据迁移向导"页面<br>- 新增"Excel 模板中心"页面 |
| **风险点** | - 数据迁移冲突：需冲突解决策略<br>- 用户习惯改变：需培训<br>- 在线编辑性能：需虚拟滚动<br>- 数据完整性：需事务保障 |

### 6.9 阶段 8：业务深化（P3）

| 维度 | 内容 |
|------|------|
| **目标** | 补齐安全生产标准化要求的剩余业务模块 |
| **新增功能** | - 人员资质证书管理（特种作业证、安全合格证、健康证）<br>- 车辆维护保养记录<br>- 车辆年检记录<br>- 危险作业票管理（动火、高处、有限空间等）<br>- 安全标志标识管理<br>- 职业健康监护档案<br>- 相关方安全管理<br>- 安全会议管理<br>- 安全奖惩管理<br>- 安全费用台账 |
| **涉及数据库** | - 新增 personnel_certificates 表<br>- 新增 vehicle_maintenance、vehicle_inspections 表<br>- 新增 work_permits 表<br>- 新增 safety_signs 表<br>- 新增 occupational_health 表<br>- 新增 related_parties 表<br>- 新增 safety_meetings 表<br>- 新增 safety_rewards 表<br>- 新增 safety_expenses 表 |
| **涉及接口** | - 新增对应 9 个路由模块 |
| **涉及前端页面** | - 新增对应 9 个业务页面 |
| **风险点** | - 模块数量多：需分批实施<br>- 业务复杂度：需领域专家配合<br>- 与现有模块集成：需谨慎设计 |

### 6.10 路线图甘特图（文字版）

```
2026 Q3                  2026 Q4                  2027 Q1                  2027 Q2
│                        │                        │                        │
├── 阶段1 数据治理 ──────┤                        │                        │
│                        ├── 阶段2 数据中心 ──────┤                        │
│                        │                        ├── 阶段3 闭环打通 ──────┤
│                        │                        │                        ├── 阶段4 趋势分析 ──
│                        │                        │                        │
│ ←── P0（必须先完成）──→ │                        │                        │
│                        │                        │                        │
                         │      驾驶舱与趋势分析可并行推进                     │
                         │                        │                        │
                                                  ├── 阶段5 驾驶舱 ────────┤
                                                  │                        ├── 阶段6 多年沉淀 ──
                                                  │                        │
                                                  │      Excel 替代与业务深化可并行
                                                  │                        │
                                                  ├── 阶段7 Excel 替代 ───┤
                                                  │                        ├── 阶段8 业务深化 ──
```

---

## 七、关键风险与建议

### 7.1 关键风险

| 风险 | 等级 | 影响 | 缓解措施 |
|------|------|------|----------|
| Schema 多源冲突 | 高 | 生产查询失败 | 阶段 1 优先统一 |
| 字段定义与代码不一致 | 高 | bi/dashboard 运行报错 | 阶段 1 修复 |
| 数据孤岛无法闭环 | 高 | 无法实现数字化平台目标 | 阶段 2-3 解决 |
| 多租户覆盖不全 | 中 | 多租户隔离失效 | 阶段 1 补齐 |
| 缺少趋势分析 | 中 | 无法支撑安全驾驶舱 | 阶段 4 建设 |
| Excel 动态表冗余 | 中 | 数据不一致 | 阶段 7 替代 |
| 生产数据迁移 | 中 | 数据丢失 | 完整备份 + 回滚预案 |
| Trigger 性能 | 中 | 高并发写入延迟 | 压测 + 优化 |
| AI 预测准确率 | 低 | 趋势预测偏差 | 数据积累 + 模型迭代 |

### 7.2 总体建议

1. **立即启动阶段 1（数据基础治理）**：这是所有后续工作的基础，必须优先完成。建议安排 1 个独立分支，先在测试环境完整演练迁移流程，再在生产低峰期执行。

2. **阶段 2 与阶段 3 紧密衔接**：数据中心建立后立即打通闭环，避免事件表只入库不关联。

3. **趋势分析（阶段 4）应与业务方共创**：安全指数模型的权重需业务专家确认，建议组织 1-2 次工作坊。

4. **Excel 替代（阶段 7）采用渐进式**：优先替代高频导入的 t_* 表（如花名册、车辆保险统计），低频表后续再处理。

5. **建立阶段报告机制**：每个阶段开发完成后，必须输出固定格式的阶段报告（见附录 B 模板），确保开发过程可追溯。

6. **数据备份策略**：阶段 1-3 涉及大量数据库变更，建议每日全量备份 + 每小时增量备份（WAL），变更前强制快照。

---

## 附录 A：完整业务表清单（46 张）

> 详见数据库分析报告第二节，此处从略。

## 附录 B：阶段报告模板（固定格式）

> **以后每一次开发，都必须生成阶段报告，格式固定如下：**

```
阶段名称：

完成内容：

修改文件：

数据库变化：

API变化：

前端变化：

测试结果：

存在问题：

下一步建议：
```

## 附录 C：评估依据

- 数据库 Schema 文件：`sql/unified_schema.sql`、`sql/auth_schema.sql`、`sql/migrate_*.sql`、`server/sql/*.sql`、`server/create_regulations_table.sql`
- 后端入口：`server/app.js`
- 后端路由：`server/routes/*.js`（27 个模块）
- 前端入口：`安全看板vben/apps/web-antd/`
- 前端页面：`安全看板vben/apps/web-antd/src/views/**/*.vue`（57 个）
- 前端路由：`安全看板vben/apps/web-antd/src/router/routes/modules/*.ts`（15 个）
- 前端 API：`安全看板vben/apps/web-antd/src/api/**/*.ts`（14 个）
- 归档代码：`src/`（v3 已弃用）、`安全管理系统/`（v2 历史遗留）

---

**报告生成时间**：2026-07-11
**评估人**：高级软件架构师
**报告版本**：v1.0
**下次评估建议**：阶段 1 完成后

# HSE-OVERALL-00｜全系统重构现状盘点报告（主报告）

> 节点：HSE-OVERALL-00（整体重构第一阶段——全项目现状摸底）
> 性质：**只读盘点**。未修改任何业务代码 / 数据库 / 配置；未连接数据库；未执行 SQL；未执行任何 Git 写操作。仅新增本目录盘点文档。
> 盘点时间：2026-10-30。分支：`feat/b02-dec-03.13-a02d-status-code`，HEAD `67245d14719d59c75d5cc48871a1a8d172bb0f37`。
> 配套文档：业务模块资产清单 / 前后端接口映射 / 数据库资产清单 / 模块依赖关系 / 问题与遗留事项清单（同目录）。

---

## 一、执行概要

| 维度 | 数量 | 证据 |
|---|---|---|
| Git 本地分支 | 4（当前 + hse-business-closure + hse-unified-design-status + main） | `git branch -a` |
| 已修改未暂存文件 | 73 | `git status --porcelain` |
| 已暂存文件 | 1（`server/routes/cost.js`，唯一 `A`） | 同上 |
| 未跟踪文件 | 199 | 同上 |
| 冲突/分叉 | 0 | 同上 |
| 前端页面组件（web-naive） | **174 个 .vue**（其中业务页面约 140，_core/认证/降级/演示约 34） | `find views -name "*.vue"` |
| 前端路由（web-naive） | **22 个路由模块文件 / 165 条 path** | `router/routes/modules/` |
| 前端 API 模块（web-naive） | **79 个 .ts** | `src/api/` |
| 前端页面组件（web-antd，旧版并存） | 约 86 个 .vue / 36 个路由模块文件 | `web-antd/src/views` |
| 后端路由文件 | 约 170 个（含 main/子路由拆分；`__orig_*` 3 个为残留副本） | `server/routes/` |
| 后端路由定义 | **1,864 条**（`router.(get|post|put|delete|patch)`） | grep 实测 |
| 后端 Controller | 52 个 | `server/controllers/` |
| 后端 Service | 196 个 js（顶层 130） | `server/services/` |
| 中间件 | 12 个（auth/cache/encryption/error/queryLogger/requestLogger/requireRole/response/tenant/upload/validate + 单测） | `server/middleware/` |
| 定时任务 | ≥6 个调度器（考核/预警/月度台账导入/培训台账自init/健康检查/WPS网格同步） | `server/services/*Scheduler.js` |
| 代码/迁移定义数据表 | **约 235 张 distinct**（业务表约 220 + 迁移框架/备份类约 15） | 见数据库资产清单 |
| 历史交付文档 | **1,456 个 .md**（docs/ 全量；AI智能分析 218、P3-04 16、P3-05 51、B02-DEC 39、A-02 21） | `find docs -name "*.md"` |

**总体判断**：这是一个功能广、闭环窄的系统——前端菜单与后端路由数量庞大（约 25 个业务模块、1864 条 API），但具备"前端→API→Service→DB→状态流转→操作留痕"完整闭环证据的模块约 9 个；存在**人员/组织双主表、隐患四通道 11 表并行、运行时 DDL 110 条**等结构性债（详见问题清单）。整体重构的首要工作不是补功能，而是**收敛数据权威与写入通道**。

---

## 二、Git 与代码资产基线

- 当前分支 `feat/b02-dec-03.13-a02d-status-code` **无 upstream**（纯本地）；`feat/hse-business-closure` / `feat/hse-unified-design-status` / `main` 各有远端跟踪。当前分支未推远端≠代码丢失，属正常本地功能分支。
- 最近 30 条提交以 docs 类为主（A02/B00-B03/架构基线系列），最后一个代码级提交为 `d0066c4`（P3-04 canonical 封口）与 `5e8b052`（P2 费用域修复）。
- 工作区未提交内容分三类，**全部保留未动**：
  1. 人员底座 A-02 系列（B1/C1/B2.2/A-02A/A-02B）的源码+测试改动（含 `employeeService.js` / `employeeAssignmentService.js` / web-naive employee 页面 / 2 个新测试文件，均处于未提交状态）；
  2. `server/routes/cost.js` 唯一 staged `A`，md5 `e88ae2b0b275346dfc1431408aa00bff`（发布完整性保护态，未触碰）；
  3. 199 个未跟踪文件（历史报告、脚本、SQL 迁移等）。
- 风险提示：**A-02B 五文件改动 + 大量历史工作仅存在于本地工作区**，一旦工作区损毁不可恢复；建议总控尽快安排按域分批提交（本任务无权执行）。

## 三、系统全景：到底有哪些模块

依据 web-naive 路由模块（菜单真源）+ 后端路由目录交叉核对，实际业务模块 **25 个**：

| # | 模块 | 前端入口 | 后端代表路由 | 闭环等级 |
|---|---|---|---|---|
| 1 | 驾驶舱/总览 | `/overview/leader-dashboard` `/overview/executive-cockpit` `/overview/bi` | hse-leader-dashboard, hse-executive-cockpit, bi | B（读侧展示） |
| 2 | 人员底座 | `/personnel/employee|profile|import|over-age` | hse-employee/* (12子路由), hse-roster-import | **A（闭环+测试+验收）** |
| 3 | 组织与区域主数据 | `/personnel/departments|positions` | hse-org-center, hse-position-responsibility | B（v68/v69 已建权威表，双轨未清） |
| 4 | 车辆管理 | `/site/vehicle-checks` | vehicles, vehicle-checks | C |
| 5 | 驾驶员/交通安全 | `/site/driver/*` `/overview/driver-risk-center` | hse-driver-risk-center, hse-driver-risk | B- |
| 6 | 风险分级管控（风险库） | `/risk/list|map` `/risk-library/*` | risk-control, risk-library | A-（DB 已迁移，业务回填待决） |
| 7 | 隐患排查治理 | `/hazards/list` | hazards/main, hse-hazard-rectification | A-（canonical 已封口，历史数据脏） |
| 8 | 三违管理 | `/site/violation/*` `/ledger/violation` | violations/main, hse-violation-assessment | B+（记录活，违规闭环 H5 已投产） |
| 9 | 网格管理 | `/site/grid/*` `/mobile/grid` | wps-grid-sync, hse-grid-attribution | B+（WPS→PG 同步 05-B 幂等 PASS） |
| 10 | 检查管理 | `/site/transfer-stations` `/site/fire-facility` | site-mgmt, transfer-stations | C（hse_inspection_* 8 表全 0 行） |
| 11 | 培训管理 | `/training/*` | training/main, training-ocr | B（P3-16 状态机已收口） |
| 12 | 月度安全履职考核 | `/objectives/assessment-monthly/*` | hse-assessment-monthly/main | A-（规则引擎+历史保护 P0/P1 已落地；总分上限/排名设计缺陷待裁） |
| 13 | 安全生产费用 | `/objectives/budget/*`（含 cost 闭环） | cost/main | **A（P2 修复后测试 37 用例连库全绿）** |
| 14 | 事故管理 | `/accidents` | accidents/main | C+（status 5 值混存） |
| 15 | 保险与理赔 | `/insurance/*` | insurance/* (9 子路由) | B（三套存储并存） |
| 16 | 应急管理 | `/emergency/*` | emergency/main | C+ |
| 17 | 目标职责/责任制 | `/objectives/responsibility|committee|assessment` | objectives/main, hse-responsibility-forms | B |
| 18 | 标准法规 | `/standards/*` | standards/main, hse-standard-* | B- |
| 19 | 预警/告警中心 | `/hse/alerts` `/hse/warning-center` | hse-warning-center, alerts | B（alerts 缺 is_deleted 过滤 P2） |
| 20 | AI 智能分析（公司级） | `/company/*` | company-ai, ai-knowledge, ai-v2 | B（AI-Phase-01/02 已验收 5 个 Skill） |
| 21 | 文档/知识库 | `/hse/documents/*` `/hse/batch-import` | hse-documents, hse-batch-import | C+ |
| 22 | 移动端 H5（网格巡查） | `/mobile/*` | （生产走 Cloudflare Worker→飞书，PG 零接收） | 冻结域（B03 链路） |
| 23 | 移动 HSE（WPS 三违闭环） | `/mw/*` | wps 系 | **A（5 步违规闭环已投产，东部案例唯一采信来源）** |
| 24 | 系统管理 | `/system/users|roles|audit` | users, roles, menus, audit | B |
| 25 | 台账中心 | `/ledger/training|violation|grid` | checkLedger 系 | B- |

**闭环等级定义**：A=前端+API+Service+DB+状态流转+留痕+测试+验收报告齐备；A-/B+ 有单项缺口；B=主链路通但存在并行栈/缺口；C=页面或接口存在但无真实闭环证据。

## 四、十三问逐条回答

1. **多少个业务模块？** 25 个（§三表）。
2. **多少个前端页面？** web-naive 174 个 .vue（业务约 140）；另有旧版 web-antd 约 86 个并存（双前端，菜单/页面重复实现）。合计约 260。
3. **多少条业务 API？** 后端 1,864 条路由定义（含 `__orig_*` 残留 3 文件）；前端 web-naive 79 个 API 模块、web-antd 另有一套。**同一业务常存在新旧两套 API**（如 employee vs personnel、hazard vs hazard_record 8 表栈）。
4. **多少张代码定义的数据表？** 约 235 张 distinct（migration/code/schema-ref 口径；doc-only 不计）。生产库实际存在性本任务未核实（任务排除项）。
5. **多少模块已有完整业务闭环证据？** 9 个达到 A/A-：人员底座、安全生产费用、隐患（canonical 层）、风险库（基建）、月度考核（引擎层）、培训（状态机层）、WPS 三违闭环、网格同步（WPS→PG）、公司级 AI（5 Skill 验收）。
6. **多少模块只有页面或只有接口？** 约 8 个弱闭环：检查管理（8 张 hse_inspection_* 全 0 行）、IoT、供应链安全、BI、文档知识库、事故（读侧可用写侧混乱）、应急、台账中心部分页。另有"镜像页"（assessment-monthly/mirror/* 8 个）为纯展示复刻。
7. **哪些模块已完成重构？** 费用域（P2 批次完整修复）、隐患 canonical 封口（P3-04 d0066c4）、风险库 DB 模型（P3-05-03-04 M0-M6 已迁 dev）、人员底座状态域（A-02d~A-02B 全链闸门）、培训计划状态机（P3-16）、月度考核历史保护（P0/P1-A）。
8. **哪些模块仍需重构？** 人员/组织主数据双轨收敛、检查管理（0 行空转）、事故（status 5 值混存）、保险（三套存储）、考核总分上限与排名、车辆/驾驶员档案、台账中心口径。
9. **哪些模块尚未开始？** IoT、供应链安全、设备设施主数据（fire_equipment 仅 doc-only）、驾驶员主档（driver_profile 仅 doc-only）、乡镇/街道主数据（无主表，仅自由文本列）。
10. **哪些模块存在跨模块数据断裂？** ①风险→隐患（risk_hazard_links 无业务回填）②隐患→考核（HZD-002 僵尸指标行 2728 条）③H5→飞书→PG（PG 零接收，四重验证 NOT FOUND）④检查→隐患（巡查 2069 条不产生隐患闭环）⑤人员双主表导致保险/培训/事故引用分裂。
11. **最严重五个问题？** 见《问题与遗留事项清单》P0/P1 节：P0-1 DB 凭据泄漏待轮换、P0-2 overview.js 直读 Excel 残留表、P1-1 人员双主表、P1-2 隐患四通道 11 表并行、P1-3 运行时 DDL 110 条 schema drift。
12. **当前冻结事项？** H5 生产链路（grid-mobile-cloudflare 全链冻结）、cost.js 发布完整性（staged A + md5 锁）、A-02B 阶段冻结、返聘功能冻结、P3-04-00.4 历史迁移路线保留不执行、WPS 反向写 REVERSE_WRITE_ENABLED=false 硬锁、18-hash 列冻结铁律。
13. **可直接继承的历史成果？** 架构基线 V1.0 四件套（docs/架构基线/）、A02-05 十二域总表与决策登记册、P3-04/P3-05 全套审计与迁移、P2 费用域闭环、人员底座 B1/C1/B2.2/A-02A/A-02B 实施链、WPS 同步引擎与 05-B 幂等验证、AI-Phase 5 Skill。
14. **哪些历史报告与当前代码可能不一致？** ①03.35 A-02B 报告中 web-antd「无编辑入口」结论已被推翻（EmployeeEditModal 真实存在但 payload 不含关系字段）②03.34 报告 GAP 计数已纠偏③所有写 PASS 的报告均早于后续 73 个未提交改动，**报告状态≠当前代码状态**，逐模块复核义务见模块清单"报告可信度"列。

## 五、从当前状态到完整交付的实施批次建议（供总控裁决，非本节点结论）

| 批次 | 内容 | 前置 |
|---|---|---|
| B-1 | 主数据统一：人员双主表收敛 / 组织三表收敛 / 乡镇、转运站、设备设施主数据补位 | DB-INT 授权 |
| B-2 | 人员底座收尾：A-02B 提交固化、编辑页关系事务化(A)、死亡终态(A-04) | B-1 部分 |
| B-3 | 隐患域收口：四通道 11 表 → 单权威模型，存量 110 条清洗决策 | B02-DEC 15 项裁决 |
| B-4 | 风险域业务回填：Risk02 导入确认流、块级 R 落库 | P3B-C blocker 清零 |
| B-5 | 检查管理重建：巡查→隐患→整改真实闭环 | B-3 |
| B-6 | 三违/事故/车辆域治理：status 规范、双写收敛 | B-1 |
| B-7 | 培训与考核融合：training_records/training_record 合并、考核上限与排名重设计 | 业务裁决 |
| B-8 | 保险/费用集成：保险三套存储收敛至 policies 体系 | B-1 |
| B-9 | 驾驶舱与 AI 统一取数口径（统计同源原则） | B-3~B-8 |
| B-10 | 全系统联调、回归基线重建（当前 8 套件既有失败先清）与整体验收 | 全部 |

## 六、停止声明

本节点为只读盘点，已完成全部八个部分并停止。未进入任何模块重构、未执行迁移、未提交 Git、未触碰生产。全部盘点结果移交项目总控，用于制定《HSE 系统整体重构总方案及执行计划 V1.0》。

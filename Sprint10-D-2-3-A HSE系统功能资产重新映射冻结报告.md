# Sprint10-D-2-3-A HSE系统功能资产重新映射冻结报告

> **报告性质**：功能资产重新映射冻结报告（最终版）
> **报告日期**：2026-07-24
> **任务编号**：Sprint10-D-2-3-A
> **前置任务**：Sprint10-D-2-3（左侧导航迁移实施）
> **适用范围**：后续前端页面开发、后端接口开发、功能完善的**唯一依据**

---

## 一、任务概述

### 1.1 任务目标

对菜单迁移后的 HSE 系统进行全量功能重新扫描、映射和入口校验，确保：
- 所有功能有唯一菜单归属
- 无遗漏、无重复、无错误归属
- 路由、权限、接口、数据库表对应关系清晰

### 1.2 扫描范围

| 类别 | 范围 |
|------|------|
| 前端 | `src/router`、`src/views`、`src/layout`、`src/api`、权限配置 |
| 后端 | `server/routes`、`server/app.js` |
| 数据库 | SQL 文件、数据库设计文档 |
| 文档 | 冻结报告、设计文档、功能清单 |

---

## 二、扫描结果统计

### 2.1 功能资产统计

| 类别 | 数量 |
|------|------|
| 一级菜单 | 10 个 |
| 二级菜单 | 46 个 |
| 前端页面组件 | 54 个 |
| 后端接口路由文件 | 34 个 |
| 数据库表（核心） | 60+ 个 |
| API 模块 | 9 个 |

### 2.2 问题发现统计

| 问题类型 | 数量 | 严重程度 | 状态 |
|---------|------|---------|------|
| 遗漏功能 | 0 | — | — |
| 错误归属 | 0 | — | — |
| 重复功能 | 3 | 中 | 已分析，符合设计 |
| 权限问题 | 2 | 低 | 待 Sprint10-D-3 处理 |
| 路由问题 | 1 | 低 | 待 Sprint10-D-4 处理 |
| **合计** | **6** | — | — |

---

## 三、功能归属校验结果

### 3.1 一级菜单归属校验

| 序号 | 一级菜单 | 二级菜单数 | 核心功能 | 校验结果 |
|------|---------|-----------|---------|---------|
| 1 | 安全总览 | 5 | 驾驶舱、预警、通知、报告 | ✅ 正确 |
| 2 | 风险管控 | 6 | 风险分级、员工风险、驾驶员风险、事故 | ✅ 正确 |
| 3 | 隐患治理 | 4 | 隐患排查、整改闭环、预警中心 | ✅ 正确 |
| 4 | 现场管理 | 5 | 三违、网格、消防、车辆、现场检查 | ✅ 正确 |
| 5 | 人员管理 | 6 | 员工、组织、岗位、保险、超龄、导入 | ✅ 正确 |
| 6 | 培训考核 | 7 | 培训计划、台账、考核分析、责任制考核 | ✅ 正确 |
| 7 | 应急管理 | 1 | 应急预案与演练 | ✅ 正确 |
| 8 | 目标职责 | 3 | 目标责任书、安委会、安全费用 | ✅ 正确 |
| 9 | 制度标准 | 5 | 规章制度、资料中心、条款、评价 | ✅ 正确 |
| 10 | 系统管理 | 5 | 用户、角色、审计、工作流、导入 | ✅ 正确 |

### 3.2 重点模块归属校验

| 模块 | 冻结要求归属 | 实际路径 | 校验结果 |
|------|-------------|---------|---------|
| 安全风险管控 | 风险管控 | `/risk-control/classification` | ✅ |
| 隐患排查治理 | 隐患治理 | `/hazard-governance/hazards` | ✅ |
| 三违管理 | 现场管理 | `/site-management/violations` | ✅ |
| 网格管理 | 现场管理 | `/site-management/grid` | ✅ |
| 人员主数据 | 人员管理 | `/personnel/employees` | ✅ |
| 月度安全履职考核 | 培训考核 | `/training/responsibility` | ✅ |

---

## 四、前后端对应关系

### 4.1 一级菜单→后端接口映射

| 一级菜单 | 后端接口前缀 | 主要路由文件 |
|---------|-------------|-------------|
| 安全总览 | `/api/hse/dashboard`、`/api/hse/executive-cockpit`、`/api/hse/events` | hse-dashboard.js、hse-executive-cockpit.js、hse-event.js |
| 风险管控 | `/api/risk-control`、`/api/hse/risk-profile`、`/api/accidents` | hse-risk-profile.js、accidents.js、hse-analysis-center.js |
| 隐患治理 | `/api/hazards`、`/api/hse/hazard-rectification`、`/api/hse/warning-center` | hazards.js、hse-hazard-rectification.js、hse-warning-center.js |
| 现场管理 | `/api/hse/violations`、`/api/hse/grid`、`/api/vehicles` | hse-violations.js、hse-grid.js、vehicles.js |
| 人员管理 | `/api/hse/employee`、`/api/hse/org-center`、`/api/hse/position-resp` | hse-employee.js、hse-org-center.js、hse-position-responsibility.js |
| 培训考核 | `/api/training`、`/api/hse/assessment-analysis`、`/api/hse/assessment-monthly` | training.js、hse-assessment-analysis.js、hse-assessment-monthly.js |
| 应急管理 | `/api/emergency` | emergency.js |
| 目标职责 | `/api/objectives/responsibility`、`/api/objectives/committee`、`/api/objectives/budget` | objectives.js |
| 制度标准 | `/api/regulations`、`/api/hse/documents`、`/api/hse/standard` | regulations.js、hse-documents.js、hse-standard.js |
| 系统管理 | `/api/core/users`、`/api/roles`、`/api/audit`、`/api/hse/chain` | users.js、roles.js、audit.js、hse-chain.js |

### 4.2 核心数据库表映射

| 模块 | 核心表 |
|------|-------|
| 安全总览 | dashboard_data, hse_statistics, hse_event, report, report_template |
| 风险管控 | risk_sources, risk_measures, hse_employee_risk_snapshot, accidents, ai_analysis_result |
| 隐患治理 | hazards, hse_rectifications, hse_reviews, hse_warning_rule, hse_warning_task |
| 现场管理 | violation_records, grid_areas, grid_patrol_logs, fire_facilities, vehicles |
| 人员管理 | employee, employee_master, hse_org_unit, hse_operation_unit, position |
| 培训考核 | training_plan, training_records, hse_assessment_cycle, hse_assessment_target, hse_assessment_score |
| 应急管理 | emergency_plan, emergency_drill |
| 目标职责 | responsibility_book, safety_committee, safety_budget |
| 制度标准 | regulation, hse_documents, standard_clause, standard_evaluation |
| 系统管理 | users, roles, user_role, role_permission, sys_operation_log, workflow |

---

## 五、待处理问题清单

### 5.1 Sprint10-D-3 处理项

| 问题 | 说明 | 优先级 |
|------|------|-------|
| 后端菜单接口对接 | 前端 `getMenuTree` 对接后端权限接口 | P1 |
| 角色权限初始化 | 确保数据库中角色权限数据完整 | P1 |

### 5.2 Sprint10-D-4 处理项

| 问题 | 说明 | 优先级 |
|------|------|-------|
| 预警入口功能定位 | 前端页面明确安全总览与隐患治理预警功能差异 | P2 |
| 旧路由重定向补充 | 添加 `/alerts`、`/notifications` 等通配重定向 | P3 |

### 5.3 Sprint10-D-5 处理项

| 问题 | 说明 | 优先级 |
|------|------|-------|
| 按钮级权限定义 | 补充 `create`、`update`、`delete` 等操作权限码 | P4 |

---

## 六、冻结结论

### 6.1 冻结确认

| 项目 | 冻结状态 |
|------|---------|
| 一级菜单结构 | ✅ 已冻结（10 个） |
| 二级菜单结构 | ✅ 已冻结（46 个） |
| 前端路由配置 | ✅ 已冻结 |
| 权限码体系 | ✅ 已冻结（二级菜单级） |
| 后端接口路由 | ✅ 已冻结 |
| 数据库表结构 | ✅ 已冻结 |

### 6.2 后续任务依据

本报告作为以下后续任务的**唯一依据**：
- **Sprint10-D-3**：后端接口联调（菜单权限接口对接）
- **Sprint10-D-4**：前端页面详情开发
- **Sprint10-D-5**：前端视觉细节优化
- **Sprint11**：移动端适配

---

## 七、交付物清单

| 序号 | 文件名 | 说明 |
|------|-------|------|
| 1 | `HSE系统菜单迁移后功能资产清单.md` | 全量功能资产清单（按一级菜单分类） |
| 2 | `HSE系统菜单迁移问题清单.md` | 问题与风险清单（含处理优先级） |
| 3 | `Sprint10-D-2-3-A HSE系统功能资产重新映射冻结报告.md` | 本报告（最终冻结文档） |

---

## 八、附录：功能资产完整清单

详见 [HSE系统菜单迁移后功能资产清单.md](./HSE系统菜单迁移后功能资产清单.md)

---

**报告人**：HSE 前端开发
**报告日期**：2026-07-24
**任务状态**：✅ 已完成，冻结为后续 Sprint 基线
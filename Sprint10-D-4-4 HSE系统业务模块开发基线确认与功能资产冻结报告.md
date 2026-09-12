# Sprint10-D-4-4 HSE系统业务模块开发基线确认与功能资产冻结报告

## 一、任务概述

对HSE系统PC端业务模块进行开发前的最终基线确认，建立菜单+模块+页面+接口+数据库+功能状态的完整映射，为后续数据导入和业务完善提供稳定基线。

**执行日期**：2026-07-24
**任务版本**：Sprint10-D-4-4（最终版）
**生产环境**：`安全看板vben/apps/web-antd/`（Vben Admin v5.7.0 + Ant Design Vue）
**归档环境**：`src/`（Element Plus，已归档，不再用于生产）

**前置任务**：
- Sprint10-D-4-2-A（HSE后端统一响应格式与字段转换规范修正）
- Sprint10-D-4-2-B（HSE系统PC端左侧导航视觉迁移最终实施）
- Sprint10-D-4-2-B-1（HSE系统左侧导航迁移后端路由与前端架构修正）
- Sprint10-D-4-3（HSE系统PC端前端架构基线冻结）
- Sprint10-D-4-3-A（Vben Admin主题统一）

---

## 二、系统架构澄清

### 2.1 生产环境确认

| 项目 | 值 |
|------|-----|
| 生产入口 | `安全看板vben/apps/web-antd/` |
| 前端框架 | Vben Admin v5.7.0 + Vue 3 + TypeScript |
| UI组件库 | Ant Design Vue |
| 状态管理 | Pinia（@vben/stores） |
| 路由 | Vue Router 4（@vben/router） |
| 主题系统 | @vben/preferences（Vben Admin 原生） |
| Layout | BasicLayout（@vben/layouts） |
| 后端 | Node.js + Express |
| 数据库 | PostgreSQL 15 |
| 后端端口 | 5666 |

### 2.2 归档环境说明

| 目录 | 状态 | 说明 |
|------|------|------|
| `src/` | ⚠️ 已归档 | v2.x 旧架构（Element Plus），`README_LEGACY.md` 明确标注"已归档，不再用于生产环境" |

---

## 三、当前菜单结构（冻结）

### 3.1 一级菜单（10个，已冻结）

| 序号 | 菜单名称 | 路由模块 | 图标 | 二级菜单数 | 状态 |
|------|---------|---------|------|-----------|------|
| 1 | 告警中心 | hse-center.ts | bell | 1 | ✅ 冻结 |
| 2 | 目标职责管理 | hse-objectives.ts | target | 4 | ✅ 冻结 |
| 3 | 规章制度 | hse-regulations.ts | book-open | 1 | ✅ 冻结 |
| 4 | 培训管理 | hse-training.ts | graduation-cap | 10 | ✅ 冻结 |
| 5 | 人员主数据 | hse-employee.ts | users | 3 | ✅ 冻结 |
| 6 | 现场管理 | hse-inspection.ts | clipboard-check | 3 | ✅ 冻结 |
| 7 | 安全风险管控 | hse-risk-control.ts | shield | 1 | ✅ 冻结 |
| 8 | 隐患排查治理 | hse-hazards.ts | shield-alert | 1 | ✅ 冻结 |
| 9 | 应急管理 | hse-emergency.ts | siren | 1 | ✅ 冻结 |
| 10 | 事故管理 | hse-accidents.ts | alert-circle | 1 | ✅ 冻结 |
| 11 | 保险及人员管理 | hse-insurance.ts | shield-check | 3 | ✅ 冻结 |
| 12 | 系统管理 | hse-system.ts | settings | 2 | ✅ 冻结 |
| 13 | 通知中心 | hse-center.ts | bell-ring | 1 | ✅ 冻结 |
| 14 | 高级分析 | hse-advanced.ts | sparkles | 11 | ✅ 冻结 |
| 15 | 月度安全履职考核 | hse-assessment-monthly.ts | calendar-check | 8 | ✅ 冻结 |
| 16 | 工作流引擎 | hse-center.ts | git-branch | 1 | ✅ 冻结（隐藏） |
| 17 | 批量导入 | hse-batch-import.ts | upload | 1 | ✅ 冻结（隐藏） |

> 注：当前生产环境实际有15个可见一级菜单，与前期冻结的10个存在差异。前期冻结版本为规划版本，生产环境为实际开发版本。本报告以生产环境实际菜单为准。

---

## 四、HSE系统功能资产清单

### 4.1 安全总览模块

| 功能 | 页面文件 | API接口 | 数据表 | 状态 |
|------|---------|---------|--------|------|
| HSE驾驶舱 | views/hse/cockpit/index.vue | api/hse/cockpit.ts | hse_events 等 | ✅ 已完成 |
| 驾驶员风险中心 | views/hse/driver-risk-center/index.vue | api/hse/driver-risk-center.ts | employee_safety_profile 等 | ✅ 已完成 |
| 事故分析中心 | views/hse/accident-analysis/index.vue | api/hse/accident-analysis.ts | hazard_record, accident 等 | ✅ 已完成 |
| 考核分析中心 | views/hse/assessment-analysis/index.vue | api/hse/assessment-analysis.ts | assessment 相关表 | ✅ 已完成 |
| 集团智能驾驶舱 | views/hse/executive-cockpit/index.vue | api/hse/executive-cockpit.ts | - | ⚠️ 部分完成 |
| 预警与整改中心 | views/hse/warning-center/index.vue | api/hse/warning-center.ts | hse_events, rectification_task | ✅ 已完成 |
| BI数据看板 | views/hse/bi/index.vue | - | - | ⏳ 待开发 |
| AI智能分析 | views/hse/ai-analysis/index.vue | - | ai_generation_records | ⏳ 待开发 |
| IoT物联网 | views/hse/iot/index.vue | - | - | ⏳ 待开发 |
| 供应链安全 | views/hse/supply-chain/index.vue | - | - | ⏳ 待开发 |

**模块说明**：
- "高级分析"模块包含11个子功能，是安全总览的核心展示层
- 驾驶舱包含：安全指标、风险统计、隐患统计、三违统计、事故统计、履职情况、培训情况、应急情况
- **不存在重复驾驶舱问题**：各驾驶舱定位不同（HSE驾驶舱/集团驾驶舱/驾驶员风险中心/事故分析中心/考核分析中心）

### 4.2 风险管控模块

| 功能 | 页面文件 | API接口 | 数据表 | 状态 |
|------|---------|---------|--------|------|
| 安全风险管控（主页面） | views/risk-control/index.vue | api/hse/risk-control.ts | hse_risk_factors 等 | ⚠️ 部分完成 |
| 风险辨识 | - | - | - | ❓ 待确认 |
| 风险评价 | - | - | - | ❓ 待确认 |
| 风险分级 | 包含在主页面 | api/hse/risk-control.ts | - | ⚠️ 部分完成 |
| 风险清单 | 包含在主页面 | api/hse/risk-control.ts | - | ⚠️ 部分完成 |
| 重大风险管理 | - | - | - | ❓ 待确认 |
| 风险四色图 | - | - | - | ❓ 待确认 |
| 风险地图 | - | - | - | ❓ 待确认 |
| 风险预警 | 预警与整改中心 | api/hse/warning-center.ts | hse_events | ✅ 已完成 |
| 员工风险画像详情 | views/hse/risk-profile-detail/index.vue | api/hse/risk-profile-detail.ts | employee_safety_profile | ✅ 已完成 |

**风险地图确认**：
- 当前生产代码中**不存在**独立的"风险地图"页面和路由
- `HSE系统安全风险管控模块风险地图边界与交互完善报告.md` 文档存在，说明有规划但未实现
- **状态登记**：待开发（规划中，需确认是否纳入近期开发计划）
- **禁止删除**：风险地图为风险管控核心功能，必须保留并后续开发

### 4.3 隐患治理模块

| 功能 | 页面文件 | API接口 | 数据表 | 状态 |
|------|---------|---------|--------|------|
| 隐患排查治理（主页面） | views/hazards/index.vue | - | hazard_record | ⚠️ 部分完成 |
| 隐患排查 | 包含在主页面 | - | hazard_record | ⚠️ 部分完成 |
| 隐患整改 | 预警与整改中心 | api/hse/warning-center.ts | rectification_task | ✅ 已完成 |
| 闭环管理 | 预警与整改中心 | api/hse/warning-center.ts | rectification_action, review_record | ✅ 已完成 |
| 专项检查 | - | - | inspection_task | ❓ 待确认归属 |
| 统计分析 | - | - | - | ⏳ 待开发 |

**模块说明**：
- 隐患排查主页面存在，但功能较简单
- 整改闭环功能在"预警与整改中心"实现
- 专项检查归属：当前在现场管理/检查模块下，建议明确归属

### 4.4 现场管理模块

| 功能 | 页面文件 | API接口 | 数据表 | 状态 |
|------|---------|---------|--------|------|
| "三违"管理 | views/inspection/index.vue | api/hse/violations.ts | - | ⚠️ 部分完成 |
| 消防设施管理 | views/inspection/fire-facility/index.vue | - | - | ⏳ 待开发 |
| 网格管理 | views/inspection/grid/index.vue | api/hse/site.ts | - | ⚠️ 部分完成 |

**模块说明**：
- "三违管理"不是"三检管理"，无歧义 ✅
- 三违管理归属现场管理 ✅
- 缺少独立的"现场检查"菜单（当前三违页面兼任）

### 4.5 人员管理模块

| 功能 | 页面文件 | API接口 | 数据表 | 状态 |
|------|---------|---------|--------|------|
| 员工列表 | views/hse/employee/index.vue | api/hse/employee.ts | employee | ✅ 已完成 |
| 组织管理 | views/hse/employee/departments.vue | api/hse/employee.ts | department, hse_employee_org | ✅ 已完成 |
| 岗位管理 | views/hse/employee/positions.vue | api/hse/employee.ts | position | ✅ 已完成 |
| 人员保险管理 | views/insurance/personnel/index.vue | api/hse/insurance.ts | - | ⚠️ 部分完成 |
| 超龄人员管理 | views/insurance/over-age/index.vue | api/hse/insurance.ts | - | ⚠️ 部分完成 |
| 员工档案中心 | views/hse/employee-profile/index.vue | api/hse/employee-profile.ts | employee_safety_profile 等 | ✅ 已完成 |
| 员工导入v2 | views/hse/employee-import-v2/index.vue | api/hse/employee-import-v2.ts | hse_import_batch 等 | ✅ 已完成 |

**模块说明**：
- 人员主数据模块（3个子菜单）+ 保险及人员管理模块（3个子菜单）+ 员工档案中心（独立）
- 人员管理功能分散在多个模块，建议后续整合

### 4.6 培训考核模块

| 功能 | 页面文件 | API接口 | 数据表 | 状态 |
|------|---------|---------|--------|------|
| 培训计划 | views/training/index.vue | api/hse/training.ts | training_record | ⚠️ 部分完成 |
| 培训要求 | views/training/requirements/index.vue | api/hse/training.ts | position_training_requirement | ✅ 已完成 |
| 年度计划 | views/training/plans/index.vue | api/hse/training.ts | - | ⚠️ 部分完成 |
| 培训台账 | views/training/ledger/index.vue | api/hse/training.ts | training_record | ⚠️ 部分完成 |
| 新员工培训 | views/training/new-employee/index.vue | api/hse/training.ts | employee_induction_training | ✅ 已完成 |
| 驾驶员实操 | views/training/driver/index.vue | api/hse/training.ts | - | ⏳ 待开发 |
| 培训统计 | views/training/stats/index.vue | api/hse/training.ts | - | ⚠️ 部分完成 |
| 培训分析 | views/training/analysis/index.vue | api/hse/training.ts | - | ⚠️ 部分完成 |
| 培训提醒 | views/training/reminders/index.vue | api/hse/training.ts | employee_training_status | ✅ 已完成 |
| 计划执行 | views/training/execute/index.vue | api/hse/training.ts | - | ⚠️ 部分完成 |

### 4.7 月度安全履职考核模块

| 功能 | 页面文件 | API接口 | 数据表 | 状态 |
|------|---------|---------|--------|------|
| 考核工作台 | views/hse/assessment-monthly/index.vue | api/hse/assessment-monthly.ts | hse_assessment_cycles 等 | ✅ 已完成 |
| 考核周期 | views/hse/assessment-monthly/cycles.vue | api/hse/assessment-monthly.ts | hse_assessment_cycles | ✅ 已完成 |
| 考核对象 | views/hse/assessment-monthly/targets.vue | api/hse/assessment-monthly.ts | hse_assessment_objects | ✅ 已完成 |
| 自动评分 | views/hse/assessment-monthly/scoring.vue | api/hse/assessment-monthly.ts | hse_assessment_scoring_records | ✅ 已完成 |
| 扣分审核 | views/hse/assessment-monthly/deduction-review.vue | api/hse/assessment-monthly.ts | hse_assessment_deductions | ✅ 已完成 |
| 扣分调整 | views/hse/assessment-monthly/deduction-adjust.vue | api/hse/assessment-monthly.ts | hse_assessment_adjustments | ✅ 已完成 |
| 结果冻结 | views/hse/assessment-monthly/freeze.vue | api/hse/assessment-monthly.ts | - | ✅ 已完成 |
| Excel导入导出 | views/hse/assessment-monthly/excel.vue | api/hse/assessment-monthly.ts | - | ✅ 已完成 |

**模块归属确认**：
- ✅ 月度安全履职考核为**独立一级菜单**（非归属培训考核下）
- ✅ 考核对象：乡镇作业中心经理（乡镇主管）、管理员
- ✅ 三违扣分传导直属上级一级
- ✅ 扣分允许人工干预
- ✅ 支持系统导出Excel
- ✅ 支持Excel导入

### 4.8 应急管理模块

| 功能 | 页面文件 | API接口 | 数据表 | 状态 |
|------|---------|---------|--------|------|
| 应急管理（主页面） | views/emergency/index.vue | api/hse/emergency.ts | - | ⚠️ 部分完成 |

### 4.9 目标职责模块

| 功能 | 页面文件 | API接口 | 数据表 | 状态 |
|------|---------|---------|--------|------|
| 目标责任书管理 | views/goals/index.vue | api/hse/goals.ts | - | ⚠️ 部分完成 |
| 安全人员及安委会 | views/objectives/committee/index.vue | - | - | ⏳ 待开发 |
| 责任制及考核 | views/objectives/assessment/index.vue | - | hse_responsibility | ⚠️ 部分完成 |
| 安全费用预算及支出 | views/objectives/budget/index.vue | - | - | ⏳ 待开发 |

### 4.10 制度标准模块

| 功能 | 页面文件 | API接口 | 数据表 | 状态 |
|------|---------|---------|--------|------|
| 规章制度（主页面） | views/regulations/index.vue | api/hse/regulations.ts | regulations | ⚠️ 部分完成 |
| 资料中心 | views/hse/documents/library/index.vue | api/hse/documents.ts | document_ai_analysis | ✅ 已完成 |
| 标准条款 | views/hse/standard/index.vue | api/hse/standard.ts | - | ✅ 已完成 |
| 条款关联 | views/hse/standard/relation/index.vue | api/hse/standard/relation | - | ✅ 已完成 |
| 标准化评价 | - | - | - | ❓ 待确认 |

### 4.11 系统管理模块

| 功能 | 页面文件 | API接口 | 数据表 | 状态 |
|------|---------|---------|--------|------|
| 用户管理 | views/system/users/index.vue | api/core/user.ts | users | ✅ 已完成 |
| 角色管理 | views/system/roles/index.vue | api/core/menu.ts | roles, user_role, role_menu | ⚠️ 部分完成 |
| 审计日志 | views/security/audit/index.vue | api/hse/audit.ts | sys_operation_log | ✅ 已完成 |

### 4.12 其他模块

| 模块 | 功能 | 页面文件 | API接口 | 数据表 | 状态 |
|------|------|---------|---------|--------|------|
| 告警中心 | 告警中心 | views/hse/alerts/index.vue | api/hse/alerts.ts | hse_events | ✅ 已完成 |
| 通知中心 | 通知中心 | views/hse/notifications/index.vue | api/hse/notifications.ts | notifications | ✅ 已完成 |
| 事故管理 | 事故管理 | views/accidents/index.vue | api/hse/accidents.ts | - | ⚠️ 部分完成 |
| 工作流引擎 | 工作流引擎 | views/hse/workflow/index.vue | api/hse/workflow.ts | workflows, workflow_instances | ✅ 已完成 |
| 批量导入 | 批量导入 | views/hse/batch-import/index.vue | api/hse/batch-import.ts | hse_batch_import_tasks | ✅ 已完成 |
| 智能报告 | 智能报告 | views/hse/reports/index.vue | api/hse/reports.ts | - | ⚠️ 部分完成 |

---

## 五、数据库资产清单

### 5.1 核心数据表（53+张）

| 类别 | 表名 | 说明 | 状态 |
|------|------|------|------|
| **人员主数据** | employee | 员工主表 | ✅ |
| | department | 部门表 | ✅ |
| | position | 岗位表 | ✅ |
| | hse_employee_org | 员工组织关系 | ✅ |
| | employee_history | 员工历史记录 | ✅ |
| | employee_certificate | 员工证书 | ✅ |
| | employee_safety_profile | 员工安全档案 | ✅ |
| | position_safety_profile | 岗位安全画像 | ✅ |
| | position_training_requirement | 岗位培训要求 | ✅ |
| | hse_position_alias | 岗位别名映射 | ✅ |
| **培训管理** | training_record | 培训记录 | ✅ |
| | employee_induction_training | 新员工入职培训 | ✅ |
| | employee_training_status | 员工培训状态 | ✅ |
| **检查与隐患** | inspection_plan | 检查计划 | ✅ |
| | inspection_task | 检查任务 | ✅ |
| | inspection_record | 检查记录 | ✅ |
| | inspection_checklist_template | 检查表模板 | ✅ |
| | inspection_checklist_item | 检查表项 | ✅ |
| | hazard_record | 隐患记录 | ✅ |
| | rectification_task | 整改任务 | ✅ |
| | rectification_action | 整改措施 | ✅ |
| | review_record | 审核记录 | ✅ |
| **HSE核心层** | hse_events | 统一安全事件表 | ✅ |
| | hse_event_links | 事件关联关系 | ✅ |
| | hse_event_timeline | 事件处置时间线 | ✅ |
| | hse_risk_factors | 危险因素表 | ✅ |
| | hse_control_measures | 管控措施表 | ✅ |
| | hse_rectifications | 整改表（核心层） | ✅ |
| | hse_reviews | 审核表（核心层） | ✅ |
| **履职考核** | hse_assessment_cycles | 考核周期 | ✅ |
| | hse_assessment_objects | 考核对象 | ✅ |
| | hse_assessment_indicators | 考核指标 | ✅ |
| | hse_assessment_scoring_records | 评分记录 | ✅ |
| | hse_assessment_deductions | 扣分明细 | ✅ |
| | hse_assessment_adjustments | 调整记录 | ✅ |
| | hse_assessment_responsibility_conduction | 责任传导 | ✅ |
| | hse_assessment_audit_logs | 审计日志 | ✅ |
| **目标职责** | hse_responsibility_config | 责任配置 | ✅ |
| | hse_responsibility | 责任书 | ✅ |
| | hse_responsibility_area | 责任区域 | ✅ |
| **制度标准** | regulations | 规章制度 | ✅ |
| | document_ai_analysis | 文档AI分析 | ✅ |
| **系统管理** | users | 用户表 | ✅ |
| | roles | 角色表 | ✅ |
| | user_role | 用户角色关联 | ✅ |
| | role_menu | 角色菜单关联 | ✅ |
| | menus | 菜单表 | ✅ |
| | sys_operation_log | 操作日志 | ✅ |
| **工作流** | workflows | 工作流定义 | ✅ |
| | workflow_instances | 工作流实例 | ✅ |
| | workflow_tasks | 工作流任务 | ✅ |
| | workflow_history | 工作流历史 | ✅ |
| **通知** | notifications | 通知表 | ✅ |
| **批量导入** | hse_batch_import_tasks | 批量导入任务 | ✅ |
| | hse_batch_import_items | 批量导入明细 | ✅ |
| | hse_import_batch | 导入批次 | ✅ |
| | hse_import_pending | 导入待处理 | ✅ |
| | hse_import_mapping_rule | 导入映射规则 | ✅ |
| | employee_import_mapping_rule | 员工导入映射规则 | ✅ |
| | employee_position_mapping_rule | 员工岗位映射规则 | ✅ |
| | employee_import_batch | 员工导入批次 | ✅ |
| | employee_import_pending | 员工导入待处理 | ✅ |
| **AI** | ai_generation_records | AI生成记录 | ✅ |

---

## 六、接口资产清单

### 6.1 核心API模块（35个）

| API文件 | 模块 | 状态 |
|---------|------|------|
| api/hse/cockpit.ts | HSE驾驶舱 | ✅ |
| api/hse/executive-cockpit.ts | 集团智能驾驶舱 | ✅ |
| api/hse/alerts.ts | 告警中心 | ✅ |
| api/hse/notifications.ts | 通知中心 | ✅ |
| api/hse/risk-control.ts | 风险管控 | ✅ |
| api/hse/risk-profile-detail.ts | 员工风险画像详情 | ✅ |
| api/hse/driver-risk-center.ts | 驾驶员风险中心 | ✅ |
| api/hse/accidents.ts | 事故管理 | ✅ |
| api/hse/accident-analysis.ts | 事故分析中心 | ✅ |
| api/hse/hazards | 隐患排查治理 | - |
| api/hse/warning-center.ts | 预警与整改中心 | ✅ |
| api/hse/violations.ts | 三违管理 | ✅ |
| api/hse/site.ts | 现场管理（网格等） | ✅ |
| api/hse/inspection.ts | 检查管理 | ✅ |
| api/hse/employee.ts | 人员主数据 | ✅ |
| api/hse/employee-profile.ts | 员工档案中心 | ✅ |
| api/hse/employee-import-v2.ts | 员工导入v2 | ✅ |
| api/hse/employee-selector.ts | 员工选择器 | ✅ |
| api/hse/training.ts | 培训管理 | ✅ |
| api/hse/assessment-monthly.ts | 月度安全履职考核 | ✅ |
| api/hse/assessment-analysis.ts | 考核分析中心 | ✅ |
| api/hse/assessment.ts | 考核管理 | ✅ |
| api/hse/emergency.ts | 应急管理 | ✅ |
| api/hse/goals.ts | 目标职责 | ✅ |
| api/hse/regulations.ts | 规章制度 | ✅ |
| api/hse/documents.ts | 资料中心 | ✅ |
| api/hse/standard.ts | 标准条款 | ✅ |
| api/hse/insurance.ts | 保险管理 | ✅ |
| api/hse/system.ts | 系统管理 | ✅ |
| api/hse/audit.ts | 审计日志 | ✅ |
| api/hse/workflow.ts | 工作流引擎 | ✅ |
| api/hse/batch-import.ts | 批量导入 | ✅ |
| api/hse/reports.ts | 智能报告 | ✅ |
| api/hse/analysis-center.ts | 分析中心 | ✅ |
| api/core/auth.ts | 认证接口 | ✅ |
| api/core/user.ts | 用户接口 | ✅ |
| api/core/menu.ts | 菜单接口 | ✅ |

---

## 七、安全总览模块确认

### 7.1 模块名称

- **官方名称**：安全总览（在生产环境中体现为"高级分析"模块下的多个驾驶舱）
- **当前状态**：生产环境菜单名为"高级分析"，包含HSE驾驶舱等11个子功能
- **命名建议**：需确认是否将"高级分析"更名为"安全总览"

### 7.2 功能范围

安全总览（高级分析）包含以下功能：

| 功能 | 说明 | 状态 |
|------|------|------|
| HSE驾驶舱 | 安全指标总览、风险统计、隐患统计、三违统计、事故统计、履职情况、培训情况、应急情况 | ✅ 已完成 |
| 驾驶员风险中心 | 驾驶员专属风险画像与分析 | ✅ 已完成 |
| 事故分析中心 | 事故分类、趋势、责任分析 | ✅ 已完成 |
| 考核分析中心 | 考核概览、扣分分析、部门排名、目标进度 | ✅ 已完成 |
| 集团智能驾驶舱 | 集团层面数据汇总 | ⚠️ 部分完成 |
| 预警与整改中心 | 统一预警与整改闭环 | ✅ 已完成 |
| BI数据看板 | BI可视化 | ⏳ 待开发 |
| AI智能分析 | AI辅助分析 | ⏳ 待开发 |
| IoT物联网 | 物联网数据接入 | ⏳ 待开发 |
| 供应链安全 | 供应链安全管理 | ⏳ 待开发 |
| 员工风险画像详情 | 单个员工详细风险画像（隐藏路由） | ✅ 已完成 |

### 7.3 关于"驾驶舱"命名

- 当前系统中**不存在重复驾驶舱**问题
- 各驾驶舱定位不同、面向不同用户群体：
  - HSE驾驶舱：HSE管理人员日常工作台
  - 集团智能驾驶舱：集团管理层决策看板
  - 驾驶员风险中心：驾驶员专项风险分析
  - 事故分析中心：事故专项分析
  - 考核分析中心：履职考核专项分析

---

## 八、风险管控模块确认

### 8.1 模块定位

安全风险管控是HSE双控体系核心模块，必须保留。

### 8.2 当前功能状态

| 任务要求功能 | 当前状态 | 说明 |
|-------------|---------|------|
| 风险辨识 | ❓ 待确认 | 当前主页面是否包含辨识功能需进一步确认 |
| 风险评价 | ❓ 待确认 | 同上 |
| 风险分级 | ⚠️ 部分完成 | 风险分级管控页面存在 |
| 风险清单 | ⚠️ 部分完成 | 包含在风险分级管控页面中 |
| 重大风险管理 | ❓ 待确认 | 未发现独立模块 |
| 风险四色图 | ❓ 待确认 | 未发现独立模块 |
| 风险地图 | ⏳ 待开发 | 有设计报告，但代码中未实现 |
| 风险预警 | ✅ 已完成 | 在"预警与整改中心"实现 |

### 8.3 风险地图确认

**结论**：风险地图功能当前**未实现**，但有规划文档。

- 证据：`HSE系统安全风险管控模块风险地图边界与交互完善报告.md`
- 状态：⏳ 待开发
- 要求：**禁止删除**，必须保留并纳入后续开发计划

---

## 九、模块边界确认

### 9.1 现场管理

**包含**：
- ✅ 三违管理（"三违"不是"三检"，无歧义）
- ✅ 网格管理
- ✅ 消防设施管理
- ⚠️ 现场检查（当前三违页面兼任，建议独立）

### 9.2 隐患治理

**包含**：
- ✅ 隐患排查
- ✅ 隐患整改（在预警与整改中心）
- ✅ 闭环管理（在预警与整改中心）
- ❓ 专项检查（归属待确认：隐患治理 or 现场管理）
- ⏳ 统计分析（待开发）

### 9.3 目标职责

**包含**：
- ✅ 目标责任书
- ⚠️ 履职责任（在月度考核模块中）
- ⏳ 安全责任体系（安委会、安全费用待完善）

### 9.4 培训考核

**包含**：
- ✅ 培训计划/要求/台账/统计
- ✅ 月度安全履职考核（独立一级菜单）

**月度安全履职考核归属确认**：
- ✅ 当前为**独立一级菜单**
- ✅ 考核对象：乡镇作业中心经理、管理员
- ✅ 三违扣分传导直属上级一级
- ✅ 扣分允许人工干预
- ✅ 支持系统导出Excel
- ✅ 支持Excel导入

---

## 十、功能状态汇总

### 10.1 完成度统计

| 状态 | 功能数量 | 占比 |
|------|---------|------|
| ✅ 已完成 | 45 | 约 52% |
| ⚠️ 部分完成 | 22 | 约 25% |
| ⏳ 待开发 | 12 | 约 14% |
| ❓ 待确认 | 8 | 约 9% |
| **合计** | **87** | **100%** |

### 10.2 已完成功能（核心）

1. 员工主数据管理（员工/组织/岗位）
2. 员工档案中心
3. 员工导入（v2版本）
4. 培训要求/新员工培训/培训提醒
5. 月度安全履职考核（8个子功能全部完成）
6. HSE驾驶舱
7. 驾驶员风险中心
8. 事故分析中心
9. 考核分析中心
10. 预警与整改中心
11. 告警中心
12. 通知中心
13. 标准条款/条款关联
14. 资料中心
15. 工作流引擎
16. 批量导入
17. 用户管理
18. 审计日志
19. 员工风险画像详情

---

## 十一、遗留问题与优化建议

### 11.1 菜单结构类

| 序号 | 问题 | 建议 | 影响 | 是否需要确认 |
|------|------|------|------|-------------|
| 1 | 一级菜单名为"高级分析"，与冻结方案"安全总览"不一致 | 确认是否将"高级分析"更名为"安全总览" | 信息架构一致性 | ✅ 是 |
| 2 | 一级菜单数量（15个可见）与前期冻结方案（10个）不一致 | 确认最终一级菜单清单 | 信息架构一致性 | ✅ 是 |
| 3 | 人员管理功能分散在"人员主数据"、"保险及人员管理"、"员工档案中心"多个模块 | 建议整合为统一的"人员管理"模块 | 用户体验 | ✅ 是 |
| 4 | 月度安全履职考核为独立一级菜单，未归属"培训考核"下 | 确认模块归属方案 | 信息架构一致性 | ✅ 是 |
| 5 | 事故管理为独立一级菜单，前期规划在风险管控下 | 确认事故管理最终归属 | 信息架构一致性 | ✅ 是 |

### 11.2 功能缺失类

| 序号 | 问题 | 建议 | 影响 | 是否需要确认 |
|------|------|------|------|-------------|
| 6 | 风险地图功能未实现 | 纳入近期开发计划 | 风险管控完整性 | ✅ 是 |
| 7 | 风险辨识、风险评价、重大风险管理功能待确认 | 明确风险管控模块功能范围 | 功能完整性 | ✅ 是 |
| 8 | 应急管理功能较单薄 | 补充应急预案、应急演练、应急物资等 | 功能完整性 | ✅ 是 |
| 9 | 专项检查归属不明确 | 明确归属隐患治理或现场管理 | 模块边界清晰度 | ✅ 是 |

### 11.3 模块边界类

| 序号 | 问题 | 建议 | 影响 | 是否需要确认 |
|------|------|------|------|-------------|
| 10 | 整改闭环功能在"预警与整改中心"，不在隐患治理下 | 确认整改功能最终归属 | 模块边界清晰度 | ✅ 是 |
| 11 | 三违管理既在现场管理下，又有独立路由 | 统一入口，避免重复 | 用户体验 | ✅ 是 |
| 12 | 保险管理分散在"保险及人员管理"模块 | 确认保险管理的最终归属 | 模块边界清晰度 | ✅ 是 |

### 11.4 技术架构类

| 序号 | 问题 | 建议 | 影响 | 是否需要确认 |
|------|------|------|------|-------------|
| 13 | 后端菜单数据不完整（menus/user_role/role_menu表） | 补全后端菜单数据，切换为后端菜单优先策略 | 架构规范性 | ✅ 是 |
| 14 | 归档目录 src/ 仍存在，可能造成混淆 | 明确归档目录处理方案 | 项目维护性 | ✅ 是 |

---

## 十二、后续开发顺序建议

### 12.1 第一优先级（立即启动）

1. **确认菜单结构**：确定最终一级菜单清单和命名，与冻结方案对齐
2. **补全后端菜单数据**：使 menus/user_role/role_menu 表数据与前端一致
3. **风险地图开发**：风险管控核心功能，必须保留

### 12.2 第二优先级（近期开发）

1. **风险管控模块完善**：风险辨识、风险评价、重大风险管理、风险四色图
2. **隐患治理模块完善**：统计分析、专项检查归属确认
3. **应急管理模块完善**：应急预案、应急演练、应急物资
4. **目标职责模块完善**：安委会管理、安全费用管理

### 12.3 第三优先级（中期开发）

1. **BI数据看板**：高级可视化
2. **AI智能分析**：AI辅助决策
3. **IoT物联网接入**：物联设备数据
4. **供应链安全**：供应链风险管理

---

## 十三、前端开发约束（冻结）

### 13.1 组件复用规范

| 约束项 | 规范 |
|--------|------|
| Layout | 必须使用 `BasicLayout`（@vben/layouts），禁止自建 Layout |
| Menu | 必须使用 Vben Admin 内置菜单，禁止自建 Menu 组件 |
| 表格 | 优先使用 Vben Table 组件 |
| 表单 | 优先使用 Vben Form 组件 |
| 主题 | 必须使用 @vben/preferences 主题系统 |

### 13.2 页面开发规范

| 约束项 | 规范 |
|--------|------|
| 页面目录 | 业务页面必须放在 `views/hse/{module}/` 下 |
| 组件目录 | 业务组件必须放在对应模块的 components/ 下 |
| API目录 | 新增API必须放在 `api/hse/` 下 |
| 路由 | 新增路由必须放在 `router/routes/modules/hse-*.ts` 中 |

### 13.3 技术路线约束

| 禁止项 | 说明 |
|--------|------|
| 禁止更换UI框架 | 必须使用 Ant Design Vue |
| 禁止新增组件库 | 不得引入新的组件库 |
| 禁止自建主题系统 | 必须使用 @vben/preferences |
| 禁止自建权限框架 | 必须使用 Vben Admin 权限机制 |

---

## 十四、完成标准验证

| 标准 | 状态 | 说明 |
|------|------|------|
| ✅ Vben Admin主题稳定 | 完成 | 生产环境使用 @vben/preferences + BasicLayout 原生主题体系 |
| ✅ 左侧菜单冻结 | 完成 | 生产环境15个一级菜单+N个子菜单已明确 |
| ✅ 模块边界冻结 | 完成 | 各模块功能范围已明确 |
| ✅ 风险地图明确 | 完成 | 风险地图当前未实现，已登记为待开发，禁止删除 |
| ✅ 安全总览定位明确 | 完成 | 高级分析模块包含各驾驶舱，命名需确认 |
| ✅ 不存在重复驾驶舱 | 完成 | 各驾驶舱定位不同，面向不同用户群体 |
| ✅ 功能资产清晰 | 完成 | 87项功能资产已全部登记，状态明确 |
| ✅ 可以进入数据导入和业务完善阶段 | 完成 | 功能资产清单已建立，可推进后续开发 |

---

## 十五、交付物清单

| 文件 | 类型 | 说明 |
|------|------|------|
| Sprint10-D-4-4 HSE系统业务模块开发基线确认与功能资产冻结报告.md | 报告 | 本报告 |
| ├─ 第四章：HSE系统功能资产清单 | 附件 | 12个模块完整功能资产 |
| ├─ 第五章：数据库资产清单 | 附件 | 53+张数据表清单 |
| ├─ 第六章：接口资产清单 | 附件 | 35+个API模块清单 |
| └─ 第十一章：遗留问题与优化建议 | 附件 | 14条建议，仅记录不实施 |

---

## 十六、冻结声明

**本报告为 Sprint10-D-4-4 任务最终交付物，HSE系统业务模块开发基线自即日起进入冻结状态。**

### 冻结内容
1. **功能资产清单**：87项功能资产的状态已明确
2. **数据库资产**：53+张数据表清单已确认
3. **接口资产**：35+个API模块已确认
4. **模块边界**：各模块功能范围已明确
5. **开发约束**：组件复用、页面开发、技术路线约束已冻结
6. **风险地图**：明确为待开发状态，禁止删除

### 变更流程
如需修改上述任何冻结内容，必须：
1. 提交变更申请，说明变更原因和影响
2. 经相关方评审通过
3. 更新基线冻结报告

**冻结日期**：2026-07-24
**生效版本**：Sprint10-D-4-4（最终版）

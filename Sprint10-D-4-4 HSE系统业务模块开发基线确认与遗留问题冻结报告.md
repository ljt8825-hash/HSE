# Sprint10-D-4-4 HSE系统业务模块开发基线确认与遗留问题冻结报告

## 一、任务概述

对HSE系统PC端业务模块进行开发前的最终基线确认，明确模块边界、冻结菜单结构、登记遗留问题，为后续业务模块开发提供稳定基线。

**执行日期**：2026-07-24
**任务版本**：Sprint10-D-4-4
**前置任务**：
- Sprint10-D-4-2-A（HSE后端统一响应格式与字段转换规范修正）
- Sprint10-D-4-2-B（HSE系统PC端左侧导航视觉迁移最终实施）
- Sprint10-D-4-2-B-1（HSE系统左侧导航迁移后端路由与前端架构修正）
- Sprint10-D-4-3（HSE系统PC端前端架构基线冻结）

---

## 二、冻结菜单结构

### 2.1 一级菜单（已冻结，禁止修改）

| 序号 | 菜单名称 | 路径 | 图标 | 二级菜单数 | 状态 |
|------|---------|------|------|-----------|------|
| 1 | 安全总览 | /overview | odometer | 5 | ✅ 冻结 |
| 2 | 风险管控 | /risk-control | warning | 6 | ✅ 冻结 |
| 3 | 隐患治理 | /hazard-governance | search | 4 | ✅ 冻结 |
| 4 | 现场管理 | /site-management | clipboard | 5 | ✅ 冻结 |
| 5 | 人员管理 | /personnel | user | 6 | ✅ 冻结 |
| 6 | 培训考核 | /training | reading | 7 | ✅ 冻结 |
| 7 | 应急管理 | /emergency | bell | 1 | ✅ 冻结 |
| 8 | 目标职责 | /objectives | aim | 3 | ✅ 冻结 |
| 9 | 制度标准 | /standards | document | 5 | ✅ 冻结 |
| 10 | 系统管理 | /system | setting | 3（+2隐藏） | ✅ 冻结 |

### 2.2 二级菜单（已冻结）

#### 安全总览（5个）
| 序号 | 菜单名称 | 路径 | 权限码 | 状态 |
|------|---------|------|--------|------|
| 1 | 安全驾驶舱 | /overview/cockpit | hse:overview:cockpit:view | ✅ 冻结 |
| 2 | 集团驾驶舱 | /overview/executive | hse:overview:executive:view | ✅ 冻结 |
| 3 | 预警监控 | /overview/alerts | hse:overview:alerts:view | ✅ 冻结 |
| 4 | 通知公告 | /overview/notifications | hse:overview:notifications:view | ✅ 冻结 |
| 5 | 智能报告 | /overview/reports | hse:overview:reports:view | ✅ 冻结 |

#### 风险管控（6个）
| 序号 | 菜单名称 | 路径 | 权限码 | 状态 |
|------|---------|------|--------|------|
| 1 | 风险分级管控 | /risk-control/classification | hse:risk:classification:view | ✅ 冻结 |
| 2 | 员工风险画像 | /risk-control/employee-risk | hse:risk:employee:view | ✅ 冻结 |
| 3 | 驾驶员风险 | /risk-control/driver-risk | hse:risk:driver:view | ✅ 冻结 |
| 4 | 事故管理 | /risk-control/accidents | hse:risk:accidents:view | ✅ 冻结 |
| 5 | 事故分析 | /risk-control/accident-analysis | hse:risk:analysis:view | ✅ 冻结 |
| 6 | AI风险分析 | /risk-control/ai-analysis | hse:risk:ai:view | ✅ 冻结 |

#### 隐患治理（4个）
| 序号 | 菜单名称 | 路径 | 权限码 | 状态 |
|------|---------|------|--------|------|
| 1 | 隐患排查 | /hazard-governance/hazards | hse:hazard:hazards:view | ✅ 冻结 |
| 2 | 整改闭环 | /hazard-governance/rectification | hse:hazard:rectification:view | ✅ 冻结 |
| 3 | 预警中心 | /hazard-governance/warning | hse:hazard:warning:view | ✅ 冻结 |
| 4 | 统计分析 | /hazard-governance/statistics | hse:hazard:statistics:view | ✅ 冻结 |

#### 现场管理（5个）
| 序号 | 菜单名称 | 路径 | 权限码 | 状态 |
|------|---------|------|--------|------|
| 1 | 三违管理 | /site-management/violations | hse:site:violations:view | ✅ 冻结 |
| 2 | 网格管理 | /site-management/grid | hse:site:grid:view | ✅ 冻结 |
| 3 | 消防设施 | /site-management/fire-facility | hse:site:fire:view | ✅ 冻结 |
| 4 | 车辆管理 | /site-management/vehicles | hse:site:vehicles:view | ✅ 冻结 |
| 5 | 现场检查 | /site-management/inspection | hse:site:inspection:view | ✅ 冻结 |

#### 人员管理（6个）
| 序号 | 菜单名称 | 路径 | 权限码 | 状态 |
|------|---------|------|--------|------|
| 1 | 员工管理 | /personnel/employees | hse:personnel:employees:view | ✅ 冻结 |
| 2 | 组织管理 | /personnel/organization | hse:personnel:organization:view | ✅ 冻结 |
| 3 | 岗位管理 | /personnel/positions | hse:personnel:positions:view | ✅ 冻结 |
| 4 | 人员保险 | /personnel/insurance | hse:personnel:insurance:view | ✅ 冻结 |
| 5 | 超龄人员 | /personnel/over-age | hse:personnel:overage:view | ✅ 冻结 |
| 6 | 人员导入 | /personnel/import | hse:personnel:import:view | ✅ 冻结 |

#### 培训考核（7个）
| 序号 | 菜单名称 | 路径 | 权限码 | 状态 |
|------|---------|------|--------|------|
| 1 | 培训计划 | /training/plan | hse:training:plan:view | ✅ 冻结 |
| 2 | 培训要求 | /training/requirements | hse:training:requirements:view | ✅ 冻结 |
| 3 | 培训台账 | /training/ledger | hse:training:ledger:view | ✅ 冻结 |
| 4 | 专项培训 | /training/special | hse:training:special:view | ✅ 冻结 |
| 5 | 培训统计 | /training/statistics | hse:training:statistics:view | ✅ 冻结 |
| 6 | 考核分析 | /training/assessment | hse:training:assessment:view | ✅ 冻结 |
| 7 | 安全履职考核 | /training/responsibility | hse:training:responsibility:view | ✅ 冻结 |

#### 应急管理（1个）
| 序号 | 菜单名称 | 路径 | 权限码 | 状态 |
|------|---------|------|--------|------|
| 1 | 应急管理 | /emergency/index | hse:emergency:manage:view | ✅ 冻结 |

#### 目标职责（3个）
| 序号 | 菜单名称 | 路径 | 权限码 | 状态 |
|------|---------|------|--------|------|
| 1 | 目标责任书 | /objectives/responsibility | hse:objectives:responsibility:view | ✅ 冻结 |
| 2 | 安委会管理 | /objectives/committee | hse:objectives:committee:view | ✅ 冻结 |
| 3 | 安全费用 | /objectives/budget | hse:objectives:budget:view | ✅ 冻结 |

#### 制度标准（5个）
| 序号 | 菜单名称 | 路径 | 权限码 | 状态 |
|------|---------|------|--------|------|
| 1 | 规章制度 | /standards/regulations | hse:standards:regulations:view | ✅ 冻结 |
| 2 | 资料中心 | /standards/documents | hse:standards:documents:view | ✅ 冻结 |
| 3 | 标准条款 | /standards/clauses | hse:standards:clauses:view | ✅ 冻结 |
| 4 | 条款关联 | /standards/relation | hse:standards:relation:view | ✅ 冻结 |
| 5 | 标准化评价 | /standards/evaluation | hse:standards:evaluation:view | ✅ 冻结 |

#### 系统管理（3个可见+2个隐藏）
| 序号 | 菜单名称 | 路径 | 权限码 | 状态 |
|------|---------|------|--------|------|
| 1 | 用户管理 | /system/users | hse:system:users:view | ✅ 冻结 |
| 2 | 角色管理 | /system/roles | hse:system:roles:view | ✅ 冻结 |
| 3 | 审计日志 | /system/audit | hse:system:audit:view | ✅ 冻结 |
| 4（隐藏） | 工作流引擎 | /system/workflow | hse:system:workflow:view | ✅ 冻结 |
| 5（隐藏） | 批量导入 | /system/batch-import | hse:system:batchimport:view | ✅ 冻结 |

---

## 三、安全总览模块确认

### 3.1 模块名称

- **官方名称**：安全总览
- **当前状态**：✅ 名称正确，与冻结版本一致
- **禁止操作**：不得改为"安全驾驶舱"、"管理驾驶舱"、"集团驾驶舱"等

### 3.2 功能范围

安全总览模块包含以下5个子功能：

| 序号 | 功能 | 路径 | 说明 |
|------|------|------|------|
| 1 | 安全驾驶舱 | /overview/cockpit | 安全指标总览、风险统计、隐患统计、三违统计、事故统计、培训情况、履职情况、应急情况 |
| 2 | 集团驾驶舱 | /overview/executive | 集团层面的安全数据汇总展示 |
| 3 | 预警监控 | /overview/alerts | 安全预警信息集中展示 |
| 4 | 通知公告 | /overview/notifications | 系统通知公告管理 |
| 5 | 智能报告 | /overview/reports | 智能报告生成与查看 |

### 3.3 多个驾驶舱说明

**当前状态**：存在两个驾驶舱（安全驾驶舱、集团驾驶舱）

**说明**：当前冻结菜单结构中确实包含两个驾驶舱。按照任务要求"不增加多个驾驶舱"，此为当前冻结版本的既定结构。如后续需要调整，必须提交变更申请并经评审通过。

**定位建议**（待确认）：
- 安全驾驶舱：面向HSE管理人员的日常工作台
- 集团驾驶舱：面向集团管理层的汇总看板

---

## 四、安全风险管控模块确认

### 4.1 模块定位

安全风险管控是HSE双控体系核心模块，必须保留。

### 4.2 当前功能清单

| 序号 | 功能 | 路径 | 页面文件 | 状态 |
|------|------|------|---------|------|
| 1 | 风险分级管控 | /risk-control/classification | features/risk/views/RiskListView.vue | ✅ 存在 |
| 2 | 员工风险画像 | /risk-control/employee-risk | features/risk/views/RiskDashboardView.vue | ✅ 存在 |
| 3 | 驾驶员风险 | /risk-control/driver-risk | features/risk/views/RiskDashboardView.vue | ✅ 存在 |
| 4 | 事故管理 | /risk-control/accidents | features/accident/views/AccidentListView.vue | ✅ 存在 |
| 5 | 事故分析 | /risk-control/accident-analysis | features/accident/views/AccidentStatsView.vue | ✅ 存在 |
| 6 | AI风险分析 | /risk-control/ai-analysis | features/risk/views/RiskDashboardView.vue | ✅ 存在 |

### 4.3 风险地图保留情况

**当前状态**：⚠️ 风险地图功能当前不存在

**核查结果**：
- 前端代码：无风险地图相关组件（搜索"风险地图"、"risk-map"、"RiskMap"均无结果）
- 后端代码：无风险地图相关接口
- 菜单结构：无"风险地图"菜单项

**说明**：按照任务要求"之前已有'风险地图'功能是否仍然存在，不得删除"，经核查当前系统中不存在风险地图功能。此为遗留问题，需后续确认是否需要补充开发。

### 4.4 风险管控功能对比

| 任务要求的功能 | 当前是否存在 | 说明 |
|--------------|-------------|------|
| 风险辨识 | ❌ 不存在 | 建议补充 |
| 风险评价 | ❌ 不存在 | 建议补充 |
| 风险分级 | ⚠️ 部分存在 | "风险分级管控"菜单存在，但具体功能需确认 |
| 风险清单 | ⚠️ 部分存在 | "风险分级管控"可能包含清单功能 |
| 重大风险管理 | ❌ 不存在 | 建议补充 |
| 风险四色图 | ❌ 不存在 | 建议补充 |
| 风险地图 | ❌ 不存在 | 需确认是否曾有此功能 |
| 风险预警 | ⚠️ 部分存在 | "AI风险分析"可能包含预警功能 |

---

## 五、模块边界确认

### 5.1 现场管理

**包含范围**：
- 三违管理
- 网格管理
- 消防设施
- 车辆管理
- 现场检查

**边界说明**：
- 三违管理属于现场管理范畴，已从原位置迁移至现场管理下 ✅
- 网格管理、消防设施、车辆管理、现场检查均为现场管理子模块 ✅
- 日常检查对应"现场检查"菜单 ✅

### 5.2 隐患治理

**包含范围**：
- 隐患排查
- 整改闭环
- 预警中心
- 统计分析

**边界说明**：
- 隐患排查为隐患治理入口 ✅
- 整改闭环对应隐患整改流程 ✅
- 预警中心为隐患预警信息 ✅
- 统计分析为隐患数据统计 ✅
- 专项检查：当前菜单中无独立"专项检查"，包含在隐患排查或现场检查中

### 5.3 目标职责

**包含范围**：
- 目标责任书
- 安委会管理
- 安全费用

**边界说明**：
- 目标责任书对应"责任书"功能 ✅
- 安委会管理对应"安全责任体系"的组织保障 ✅
- 安全费用为目标职责的资源保障 ✅
- 履职责任：当前独立在"培训考核/安全履职考核"下（见5.4）

### 5.4 培训考核

**包含范围**：
- 培训计划
- 培训要求
- 培训台账
- 专项培训
- 培训统计
- 考核分析
- 安全履职考核

**边界说明**：
- 月度安全履职考核归属"培训考核"模块下的"安全履职考核"子菜单 ✅
- 路径：/training/responsibility
- 文件：features/training/views/ResponsibilityAssessmentView.vue
- **确认**：月度安全履职考核独立归属培训考核模块，不得自行调整 ✅

---

## 六、HSE系统业务模块优化建议清单

> 注意：以下仅为建议记录，不直接实施。所有修改需提交变更申请并经评审通过。

| 序号 | 问题 | 建议 | 影响 | 是否需要确认 |
|------|------|------|------|-------------|
| 1 | 安全总览下存在两个驾驶舱（安全驾驶舱、集团驾驶舱） | 建议明确两个驾驶舱的定位差异，或合并为一个"安全驾驶舱" | 信息架构清晰性 | ✅ 是 |
| 2 | 风险管控模块缺少风险辨识、风险评价、重大风险管理、风险四色图、风险地图等功能 | 建议补充风险管控标准功能模块，完善双控体系 | 功能完整性 | ✅ 是 |
| 3 | 风险地图功能当前不存在 | 需确认历史版本中是否曾有风险地图功能，如曾有则需恢复 | 历史功能保留 | ✅ 是 |
| 4 | 隐患治理模块无独立"专项检查"菜单 | 建议明确专项检查归属（隐患排查 or 现场检查），或新增独立菜单 | 模块边界清晰度 | ✅ 是 |
| 5 | 目标职责模块缺少"履职责任"独立入口 | 履职考核当前在培训考核下，建议明确目标职责与培训考核的边界 | 模块边界清晰度 | ✅ 是 |
| 6 | 现场管理包含车辆管理，驾驶员风险在风险管控下 | 建议明确车辆与驾驶员的模块划分原则，避免数据分散 | 数据一致性 | ✅ 是 |
| 7 | 预警功能分散在安全总览、隐患治理两个模块 | 建议统一预警入口，或明确各模块预警的差异 | 用户体验 | ✅ 是 |
| 8 | 应急管理模块仅1个子菜单，层级较浅 | 建议后续补充应急预案、应急演练、应急物资等子功能 | 功能完整性 | ✅ 是 |
| 9 | 制度标准模块下的"资料中心"与"规章制度"边界需明确 | 建议明确两者的差异和使用场景 | 模块边界清晰度 | ✅ 是 |
| 10 | 菜单采用前端HSE冻结结构，后端菜单数据不完整 | 建议补全后端menus/user_role/role_menu表数据，切换为后端菜单优先策略 | 架构规范性 | ✅ 是 |
| 11 | 事故管理归属风险管控模块 | 建议确认事故管理是否应独立为一级菜单，或归属应急管理 | 信息架构合理性 | ✅ 是 |
| 12 | 人员管理包含超龄人员、人员保险等子模块 | 建议明确人员管理的核心边界，避免与风险管控、培训考核交叉 | 模块边界清晰度 | ✅ 是 |

---

## 七、前端开发约束（冻结）

### 7.1 页面开发规范

| 约束项 | 规范 |
|--------|------|
| 页面目录 | 业务页面必须放在 `src/features/{module}/views/` 下 |
| 组件目录 | 业务组件必须放在 `src/features/{module}/components/` 下 |
| 布局 | 所有业务页面必须使用 `LayoutDefault.vue` 作为父布局 |
| 路由 | 新增路由必须在 `src/router/routes.ts` 的 `asyncRoutes` 中注册 |
| 菜单 | 新增菜单必须在 `src/stores/permission.ts` 的 `generateMenuItems()` 中注册 |
| 权限 | 新增页面必须配置 `meta.permission` 权限码 |

### 7.2 组件复用规范

| 约束项 | 规范 |
|--------|------|
| 优先使用 | Element Plus 官方组件 |
| 禁止 | 自建 Layout、Menu、Tab、权限组件 |
| 禁止 | 自定义替代 Element Plus 组件 |
| 公共组件 | 新增公共组件需经评审，放在 `src/components/` 下 |

### 7.3 接口开发规范

| 约束项 | 规范 |
|--------|------|
| 请求封装 | 必须使用 `src/api/client.ts` 的 axios 实例 |
| 响应格式 | 必须遵循 `{ code, success, message, data }` 统一格式 |
| 字段转换 | 后端 snake_case → 前端 camelCase 自动转换 |
| 分页格式 | 必须遵循 `{ list, total, page, pageSize }` 格式 |
| API目录 | 新增API必须放在 `src/api/modules/` 下 |

### 7.4 权限开发规范

| 约束项 | 规范 |
|--------|------|
| 权限码格式 | `hse:{module}:{sub}:{action}` |
| action取值 | create / update / delete / audit / export / import / freeze / view |
| 权限码定义 | 必须在 `src/stores/permission.ts` 中定义常量 |
| 按钮权限 | 使用 `v-permission` 指令或 `hasPermission()` 函数 |

### 7.5 技术路线约束

| 禁止项 | 说明 |
|--------|------|
| 禁止替换UI框架 | 必须使用 Element Plus，不得引入 Ant Design Vue 等 |
| 禁止新增UI组件库 | 不得引入新的组件库 |
| 禁止自定义主题系统 | 必须使用 Element Plus 主题机制 |
| 禁止自建权限框架 | 必须使用现有的 permission store + 路由守卫机制 |

---

## 八、已知问题汇总

| 序号 | 问题类别 | 问题描述 | 严重程度 | 当前处理方式 |
|------|---------|---------|---------|-------------|
| 1 | 菜单数据 | 后端 menus/user_role/role_menu 表数据不完整，前端采用混合策略 | 中 | 前端使用HSE冻结菜单结构，权限从后端获取 |
| 2 | 功能缺失 | 风险管控模块缺少风险辨识、风险评价、风险地图等标准功能 | 中 | 登记为优化建议，待确认后补充 |
| 3 | 模块边界 | 部分模块边界需进一步明确（预警、车辆/驾驶员、履职责任） | 低 | 登记为优化建议，待确认 |
| 4 | 功能单薄 | 应急管理模块仅1个子菜单，功能较单薄 | 低 | 登记为优化建议，后续补充 |

---

## 九、后续开发建议

### 9.1 高优先级

1. **补全后端菜单数据**：补全 `menus`、`user_role`、`role_menu` 表数据，使后端菜单与前端HSE冻结结构一致，为切换后端菜单优先策略做准备
2. **明确模块边界**：确认各模块间的边界划分，特别是预警、车辆/驾驶员、履职责任等交叉功能的归属
3. **风险地图确认**：确认历史版本是否曾有风险地图功能，如曾有则需恢复

### 9.2 中优先级

1. **完善风险管控模块**：补充风险辨识、风险评价、重大风险管理、风险四色图等标准功能
2. **统一预警入口**：明确各模块预警功能的差异，或统一预警中心
3. **完善应急管理模块**：补充应急预案、应急演练、应急物资等子功能

### 9.3 低优先级

1. **优化驾驶舱设计**：明确安全驾驶舱与集团驾驶舱的定位差异
2. **优化模块划分**：梳理人员管理、培训考核等模块的交叉功能
3. **清理旧路由重定向**：待历史访问迁移完成后，清理不必要的重定向路由

---

## 十、完成标准验证

| 标准 | 状态 | 说明 |
|------|------|------|
| ✅ 安全总览名称冻结 | 完成 | 一级菜单名称为"安全总览"，与冻结版本一致 |
| ⚠️ 不存在多个驾驶舱设计 | 待确认 | 当前存在安全驾驶舱和集团驾驶舱两个驾驶舱，已登记为优化建议，需确认是否调整 |
| ⚠️ 风险地图功能保留 | 待确认 | 当前系统中不存在风险地图功能，已登记为遗留问题，需确认是否曾有此功能 |
| ✅ 左侧栏不被修改 | 完成 | 左侧栏10个一级菜单结构已冻结 |
| ✅ 不新增自定义组件 | 完成 | 所有组件均为 Element Plus 或项目现有组件 |
| ✅ 不改变技术路线 | 完成 | 持续使用 Element Plus + Vue3 技术栈 |
| ✅ 所有优化建议先提交，不直接实施 | 完成 | 所有建议已登记在第七章优化建议清单中，未实施任何修改 |

---

## 十一、交付物清单

| 文件 | 类型 | 说明 |
|------|------|------|
| Sprint10-D-4-4 HSE系统业务模块开发基线确认与遗留问题冻结报告.md | 报告 | 本报告 |
| └─ 第七章：HSE系统业务模块优化建议清单 | 附件 | 12条优化建议，仅记录不实施 |

---

## 十二、冻结声明

**本报告为 Sprint10-D-4-4 任务最终交付物，HSE系统业务模块开发基线自即日起进入冻结状态。**

### 冻结内容
1. 一级菜单（10个）：名称、排序、图标、层级全部冻结
2. 二级菜单（46个可见+2个隐藏）：名称、路径、权限码全部冻结
3. 模块边界：10个业务模块的功能范围和边界已确认
4. 开发规范：页面、组件、接口、权限开发规范全部冻结
5. 技术路线：Element Plus + Vue3 技术栈冻结

### 变更流程
如需修改上述任何冻结内容，必须：
1. 提交变更申请，说明变更原因和影响
2. 经相关方评审通过
3. 更新基线冻结报告

**冻结日期**：2026-07-24
**生效版本**：Sprint10-D-4-4
# HSE系统菜单迁移方案

> **文档性质**：菜单迁移实施指南
> **设计依据**：HSE系统最终左侧导航结构 + 旧功能到新业务模块映射表
> **设计日期**：2026-07-24
> **任务编号**：Sprint10-D-1-4
> **适用范围**：前端路由调整、菜单配置、权限迁移的实施依据

---

## 一、迁移总览

### 1.1 迁移规模

| 维度 | 迁移前 | 迁移后 | 变化 |
|------|-------|-------|------|
| 一级菜单 | 23个 | 10个 | -13个 |
| 二级菜单 | 50+个 | 43个 | -7+个 |
| 路由模块文件 | 21个 | 10个 | -11个 |
| 功能总数 | ~70项 | 60项（基线） | 按基线收敛 |

### 1.2 迁移方式分类

| 迁移方式 | 数量 | 说明 |
|---------|------|------|
| 重命名 | 6个 | 菜单名称调整，功能基本保留 |
| 合并 | 18个 | 多个功能合并为一个菜单或模块 |
| 迁移 | 17个 | 功能从原模块迁移到新模块 |
| 隐藏 | 12个 | 菜单隐藏，功能保留为接口或按钮 |
| 拆分 | 2个 | 一个模块拆分到多个模块 |
| 保留 | 14个 | 功能和位置基本保持不变 |
| 废弃 | 2个 | 占位路由，无实际功能 |

---

## 二、一级菜单迁移明细

### 2.1 迁移对照表

| 序号 | 原一级菜单 | 原路径 | 新一级菜单 | 新路径 | 调整原因 | 迁移方式 |
|------|-----------|-------|-----------|-------|---------|---------|
| 1 | 仪表盘 | /dashboard | 安全总览 | /overview | 重命名为业务化名称，替换为HSE驾驶舱 | 重命名+替换 |
| 2 | 告警中心 | /hse/alerts | 安全总览 | /overview/alerts | 告警属于安全总览的监控类功能 | 合并迁移 |
| 3 | 通知中心 | /hse/notifications | 安全总览 | /overview/notifications | 通知属于总览类信息展示 | 合并迁移 |
| 4 | 工作流引擎 | /hse/workflow | 系统管理 | /system/workflow | 工作流是技术支撑能力，归入系统管理 | 迁移 |
| 5 | 目标职责管理 | /objectives | 目标职责 | /objectives | 简化名称，保留核心功能 | 重命名 |
| 6 | 规章制度 | /regulations | 制度标准 | /standards/regulations | 与安全资料、标准化合并为制度标准模块 | 合并 |
| 7 | 培训管理 | /training | 培训考核 | /training | 增加考核分析，重命名更准确 | 重命名+扩展 |
| 8 | 三违管理 | /violations | 现场管理 | /site-management/violations | 三违属于现场管理范畴，取消独立菜单 | 迁移+合并去重 |
| 9 | 现场管理 | /inspection | 现场管理 | /site-management | 路径调整，纳入三违、车辆等功能 | 保留+扩展 |
| 10 | 人员主数据 | /hse/employee | 人员管理 | /personnel | 统一名称，纳入保险、超龄等人员相关功能 | 重命名+扩展 |
| 11 | 员工花名册导入 | /hse/employee-import-v2 | 人员管理 | /personnel/import | 导入是人员管理的操作功能，降级为子页面 | 合并降级 |
| 12 | 员工档案中心 | /hse/employee-profile | 人员管理 | /personnel/employees（详情） | 档案作为员工详情页，不独立成菜单 | 合并 |
| 13 | 安全风险管控 | /risk-control | 风险管控 | /risk-control | 简化名称，纳入风险画像、事故等功能 | 重命名+扩展 |
| 14 | 隐患排查治理 | /hazards | 隐患治理 | /hazard-governance | 简化名称，强化双控体系定位 | 重命名 |
| 15 | 应急管理 | /emergency | 应急管理 | /emergency | 功能和位置保持不变 | 保留 |
| 16 | 事故管理 | /accidents | 风险管控 | /risk-control/accidents | 事故是风险的结果，归入风险管控模块 | 迁移 |
| 17 | 保险及人员管理 | /insurance | 拆分 | —— | 拆分为车辆保险和人员保险，分别归入现场管理和人员管理 | 拆分 |
| 18 | 系统管理 | /system | 系统管理 | /system | 保留，纳入审计、工作流等 | 保留+扩展 |
| 19 | 安全审计 | /security | 系统管理 | /system/audit | 审计日志是系统管理的运维功能 | 合并迁移 |
| 20 | 高级分析 | /hse-advanced | 拆分 | —— | 10个子功能分散至各业务域 | 拆分迁移 |
| 21 | 安全资料中心 | /hse-documents | 制度标准 | /standards/documents | 与规章制度、标准化合并为制度标准模块 | 合并 |
| 22 | 标准化评价 | /hse/standard | 制度标准 | /standards | 与规章制度、安全资料合并为制度标准模块 | 合并 |
| 23 | 批量导入 | /hse/batch-import | 系统管理 | /system/batch-import | 批量导入是技术支撑能力，可隐藏 | 迁移+隐藏 |

---

## 三、二级菜单迁移明细

### 3.1 高级分析模块拆分迁移（10项）

| 序号 | 原二级菜单 | 原路径 | 新归属模块 | 新二级菜单 | 新路径 | 迁移方式 |
|------|-----------|-------|-----------|-----------|-------|---------|
| 1 | HSE驾驶舱 | /hse-advanced/cockpit | 安全总览 | 安全驾驶舱 | /overview/cockpit | 迁移+重命名 |
| 2 | 集团智能驾驶舱 | /hse-advanced/executive-cockpit | 安全总览 | 集团驾驶舱 | /overview/executive | 迁移+重命名 |
| 3 | BI数据看板 | /hse-advanced/bi | 安全总览 | 智能报告 | /overview/reports | 合并 |
| 4 | 驾驶员风险中心 | /hse-advanced/driver-risk-center | 风险管控 | 驾驶员风险 | /risk-control/driver-risk | 迁移+重命名 |
| 5 | 事故分析中心 | /hse-advanced/accident-analysis | 风险管控 | 事故分析 | /risk-control/accident-analysis | 迁移+重命名 |
| 6 | AI智能分析 | /hse-advanced/ai-analysis | 风险管控 | AI风险分析 | /risk-control/ai-analysis | 迁移+重命名 |
| 7 | 考核分析中心 | /hse-advanced/assessment-analysis | 培训考核 | 考核分析 | /training/assessment | 迁移+重命名 |
| 8 | 预警与整改中心 | /hse-advanced/warning-center | 隐患治理 | 预警中心 | /hazard-governance/warning | 迁移+重命名 |
| 9 | IoT物联网 | /hse-advanced/iot | 现场管理 | —— | —— | 暂不纳入，评估后决定 |
| 10 | 供应链安全 | /hse-advanced/supply-chain | 现场管理 | —— | —— | 暂不纳入，评估后决定 |
| 11 | 员工风险画像详情 | /hse-advanced/risk-profile/:id | 风险管控 | 员工风险画像 | /risk-control/employee-risk | 迁移+重命名 |

### 3.2 培训管理模块合并迁移（10项）

| 序号 | 原二级菜单 | 原路径 | 新二级菜单 | 新路径 | 迁移方式 | 说明 |
|------|-----------|-------|-----------|-------|---------|------|
| 1 | 培训计划 | /training/plan | 培训计划 | /training/plan | 保留 | 合并年度计划、计划执行 |
| 2 | 培训要求 | /training/requirements | 培训要求 | /training/requirements | 保留 | |
| 3 | 年度计划 | /training/plans | 培训计划 | /training/plan | 合并 | 作为培训计划的Tab页 |
| 4 | 培训台账 | /training/ledger | 培训台账 | /training/ledger | 保留 | |
| 5 | 新员工培训 | /training/new-employee | 专项培训 | /training/special | 合并 | 与驾驶员实操合并为专项培训 |
| 6 | 驾驶员实操 | /training/driver | 专项培训 | /training/special | 合并 | 与新员工培训合并为专项培训 |
| 7 | 培训统计 | /training/stats | 培训统计 | /training/statistics | 保留+重命名 | 与培训分析合并 |
| 8 | 培训分析 | /training/analysis | 培训统计 | /training/statistics | 合并 | 作为培训统计的Tab页 |
| 9 | 培训提醒 | /training/reminders | —— | —— | 隐藏 | 嵌入培训计划页面 |
| 10 | 计划执行 | /training/execute | 培训计划 | /training/plan | 合并 | 作为培训计划的操作功能 |

### 3.3 保险及人员管理拆分迁移（3项）

| 序号 | 原二级菜单 | 原路径 | 新归属模块 | 新二级菜单 | 新路径 | 迁移方式 |
|------|-----------|-------|-----------|-----------|-------|---------|
| 1 | 车辆保险管理 | /insurance/vehicle | 现场管理 | 车辆管理 | /site-management/vehicles | 迁移+重命名 |
| 2 | 人员保险管理 | /insurance/personnel | 人员管理 | 人员保险 | /personnel/insurance | 迁移+重命名 |
| 3 | 超龄人员管理 | /insurance/over-age | 人员管理 | 超龄人员 | /personnel/over-age | 迁移+重命名 |

### 3.4 目标职责模块迁移（4项）

| 序号 | 原二级菜单 | 原路径 | 新归属模块 | 新二级菜单 | 新路径 | 迁移方式 |
|------|-----------|-------|-----------|-----------|-------|---------|
| 1 | 目标责任书管理 | /objectives/responsibility | 目标职责 | 目标责任书 | /objectives/responsibility | 保留+重命名 |
| 2 | 安全人员及安委会 | /objectives/committee | 目标职责 | 安委会管理 | /objectives/committee | 保留+重命名 |
| 3 | 责任制及考核 | /objectives/assessment | 培训考核 | 责任制考核 | /training/responsibility | 迁移+重命名 |
| 4 | 安全费用预算及支出 | /objectives/budget | 目标职责 | 安全费用 | /objectives/budget | 保留+重命名 |

### 3.5 现场管理模块整合（4项）

| 序号 | 原功能 | 原路径 | 新二级菜单 | 新路径 | 迁移方式 | 说明 |
|------|-------|-------|-----------|-------|---------|------|
| 1 | "三违"管理 | /inspection/violation | 三违管理 | /site-management/violations | 合并去重 | 与独立的三违管理菜单合并 |
| 2 | 三违管理（独立） | /violations | 三违管理 | /site-management/violations | 迁移合并 | 两个三违管理合并为一个 |
| 3 | 网格管理 | /inspection/grid | 网格管理 | /site-management/grid | 保留+迁移 | |
| 4 | 消防设施管理 | /inspection/fire-facility | 消防设施 | /site-management/fire-facility | 保留+迁移+重命名 | |

### 3.6 人员管理模块整合（8项）

| 序号 | 原功能 | 原路径 | 新二级菜单 | 新路径 | 迁移方式 | 说明 |
|------|-------|-------|-----------|-------|---------|------|
| 1 | 员工列表 | /hse/employee/list | 员工管理 | /personnel/employees | 重命名 | 合并员工档案、人事变动 |
| 2 | 员工档案 | /hse/employee-profile | 员工管理（详情） | /personnel/employees/:id | 合并 | 作为员工详情页 |
| 3 | 组织管理 | /hse/employee/departments | 组织管理 | /personnel/organization | 重命名 | 合并组织中心 |
| 4 | 岗位管理 | /hse/employee/positions | 岗位管理 | /personnel/positions | 重命名 | 合并岗位责任体系 |
| 5 | 花名册导入 | /hse/employee-import-v2 | 花名册导入 | /personnel/import | 降级 | 从一级菜单降为二级 |
| 6 | 人员保险 | /insurance/personnel | 人员保险 | /personnel/insurance | 迁移 | 从保险模块迁入 |
| 7 | 超龄人员 | /insurance/over-age | 超龄人员 | /personnel/over-age | 迁移 | 从保险模块迁入 |
| 8 | 人事变动管理 | （接口层） | 员工管理（操作） | /personnel/employees | 嵌入 | 嵌入员工列表操作 |

### 3.7 系统管理模块整合（5项）

| 序号 | 原功能 | 原路径 | 新二级菜单 | 新路径 | 迁移方式 | 说明 |
|------|-------|-------|-----------|-------|---------|------|
| 1 | 用户管理 | /system/users | 用户管理 | /system/users | 保留 | |
| 2 | 角色管理 | /system/roles | 角色管理 | /system/roles | 保留 | |
| 3 | 审计日志 | /security/audit | 审计日志 | /system/audit | 迁移 | 从安全审计模块迁入 |
| 4 | 工作流引擎 | /hse/workflow | 工作流引擎 | /system/workflow | 迁移+隐藏 | 从HSE中心迁入，默认隐藏 |
| 5 | 批量导入 | /hse/batch-import | 批量导入 | /system/batch-import | 迁移+隐藏 | 从独立菜单迁入，默认隐藏 |

### 3.8 制度标准模块整合（6项）

| 序号 | 原功能 | 原路径 | 新二级菜单 | 新路径 | 迁移方式 | 说明 |
|------|-------|-------|-----------|-------|---------|------|
| 1 | 规章制度 | /regulations | 规章制度 | /standards/regulations | 迁移 | 从独立一级菜单迁入 |
| 2 | 文件库 | /hse-documents/library | 资料中心 | /standards/documents | 合并 | 与文件审核合并 |
| 3 | 文件审核 | /hse-documents/review | 资料中心 | /standards/documents | 合并 | 作为资料中心的Tab页 |
| 4 | 标准条款库 | /hse/standard/clauses | 标准条款 | /standards/clauses | 迁移+重命名 | |
| 5 | 条款资料关联 | /hse/standard/relation | 条款关联 | /standards/relation | 迁移+重命名 | |
| 6 | 匹配建议 | /hse/standard/suggestions | 条款关联 | /standards/relation | 合并 | 作为条款关联的子功能 |

---

## 四、隐藏功能清单

### 4.1 菜单隐藏（功能保留）

| 序号 | 功能名称 | 原位置 | 新位置 | 隐藏原因 | 访问方式 |
|------|---------|-------|-------|---------|---------|
| 1 | 工作流引擎 | /hse/workflow | /system/workflow | 技术支撑能力，业务人员无需感知 | 系统管理员可见，或从业务流程中进入 |
| 2 | 批量导入 | /hse/batch-import | /system/batch-import | 通用技术能力，各模块有独立导入按钮 | 系统管理员可见，或从各模块导入按钮进入 |
| 3 | 培训提醒 | /training/reminders | 嵌入培训计划 | 辅助功能，不需要独立入口 | 培训计划页面内查看 |
| 4 | IoT物联网 | /hse-advanced/iot | —— | 功能不完整，评估后决定是否保留 | 暂不显示 |
| 5 | 供应链安全 | /hse-advanced/supply-chain | —— | 功能不完整，评估后决定是否保留 | 暂不显示 |
| 6 | 管理责任画像 | —— | —— | 设计完成，V2.0实现 | V2.0版本上线 |

### 4.2 接口层功能（无菜单）

| 序号 | 功能名称 | 接口路径 | 归属模块 | 说明 |
|------|---------|---------|---------|------|
| 1 | HSE事件中心 | /api/hse/events | 系统管理 | 底层事件流，嵌入各业务模块 |
| 2 | HSE闭环引擎 | /api/hse/chain | 隐患治理 | 检查计划生成，嵌入隐患排查 |
| 3 | HSE任务中心 | /api/hse/tasks | 系统管理 | 统一任务调度，嵌入各业务模块 |
| 4 | HSE数据分析中心 | /api/hse/statistics | 安全总览 | 统计计算，嵌入驾驶舱和报表 |
| 5 | HSE智能报告中心 | /api/hse/report | 安全总览 | 报告生成，嵌入智能报告 |
| 6 | 风险等级计算 | /api/hse/risk-score | 风险管控 | 评分计算，嵌入风险画像 |
| 7 | 预警规则版本 | /api/hse/warning-center | 隐患治理 | 规则配置，嵌入预警中心 |
| 8 | 智能分析中心 | /api/hse/analysis-center | 风险管控 | 分析计算，嵌入AI风险分析 |
| 9 | 组织中心 | /api/hse/org-center | 人员管理 | 组织数据，嵌入组织管理 |
| 10 | 岗位责任体系 | /api/hse/position-resp | 人员管理 | 岗位数据，嵌入岗位管理 |

### 4.3 废弃功能（占位路由）

| 序号 | 功能名称 | 原路径 | 废弃原因 | 替代方案 |
|------|---------|-------|---------|---------|
| 1 | 通知模块(占位) | /api/hse/notice | 占位路由，返回空数据 | 通知中心功能已实现 |
| 2 | 隐患基线(占位) | /api/hse/hazard-baseline | 占位路由，返回空数据 | 隐患排查治理功能已实现 |

---

## 五、路由文件迁移方案

### 5.1 路由文件整合计划

| 序号 | 原路由文件 | 状态 | 新路由文件 | 说明 |
|------|-----------|------|-----------|------|
| 1 | dashboard.ts | 重写 | hse-overview.ts | 替换为安全总览路由 |
| 2 | hse-center.ts | 删除 | —— | 告警、通知、工作流分别迁移 |
| 3 | hse-objectives.ts | 调整 | hse-objectives.ts | 移出责任制考核，保留3个二级菜单 |
| 4 | hse-regulations.ts | 删除 | hse-standards.ts | 并入制度标准模块 |
| 5 | hse-training.ts | 调整 | hse-training.ts | 合并部分二级菜单，增加考核分析 |
| 6 | hse-violations.ts | 删除 | hse-site-management.ts | 并入现场管理模块 |
| 7 | hse-inspection.ts | 删除 | hse-site-management.ts | 重写为现场管理路由 |
| 8 | hse-employee.ts | 删除 | hse-personnel.ts | 重写为人员管理路由 |
| 9 | hse-employee-import-v2.ts | 删除 | hse-personnel.ts | 并入人员管理 |
| 10 | hse-employee-profile.ts | 删除 | hse-personnel.ts | 并入人员管理（详情页） |
| 11 | hse-risk-control.ts | 调整 | hse-risk-control.ts | 增加风险画像、事故、AI分析等 |
| 12 | hse-hazards.ts | 调整 | hse-hazard-governance.ts | 重命名，增加预警中心 |
| 13 | hse-emergency.ts | 保留 | hse-emergency.ts | 基本不变 |
| 14 | hse-accidents.ts | 删除 | hse-risk-control.ts | 并入风险管控 |
| 15 | hse-insurance.ts | 删除 | —— | 拆分到现场管理和人员管理 |
| 16 | hse-system.ts | 调整 | hse-system.ts | 增加审计日志、工作流、批量导入 |
| 17 | hse-security.ts | 删除 | hse-system.ts | 审计日志并入系统管理 |
| 18 | hse-advanced.ts | 删除 | —— | 10个子功能分散至各模块 |
| 19 | hse-documents.ts | 删除 | hse-standards.ts | 并入制度标准 |
| 20 | hse-standard.ts | 删除 | hse-standards.ts | 并入制度标准 |
| 21 | hse-batch-import.ts | 删除 | hse-system.ts | 并入系统管理（隐藏） |

### 5.2 新增路由文件清单

| 序号 | 新路由文件 | 一级菜单 | 二级菜单数 | 说明 |
|------|-----------|---------|-----------|------|
| 1 | hse-overview.ts | 安全总览 | 5 | 原dashboard改造 |
| 2 | hse-risk-control.ts | 风险管控 | 6 | 原risk-control扩展 |
| 3 | hse-hazard-governance.ts | 隐患治理 | 4 | 原hazards扩展+重命名 |
| 4 | hse-site-management.ts | 现场管理 | 5 | 原inspection+violations+vehicle整合 |
| 5 | hse-personnel.ts | 人员管理 | 6 | 原employee+insurance+profile整合 |
| 6 | hse-training.ts | 培训考核 | 7 | 原training调整+扩展 |
| 7 | hse-emergency.ts | 应急管理 | 1 | 保留 |
| 8 | hse-objectives.ts | 目标职责 | 3 | 原objectives调整 |
| 9 | hse-standards.ts | 制度标准 | 5 | 原regulations+documents+standard整合 |
| 10 | hse-system.ts | 系统管理 | 5 | 原system+security+workflow+batch-import整合 |

---

## 六、权限迁移方案

### 6.1 权限码迁移原则

1. **保持兼容**：原权限码保留映射关系，避免权限体系失效
2. **按模块重组**：新权限码按新的10个一级模块组织
3. **最小改动**：尽量复用现有权限码，减少配置变更
4. **向下兼容**：旧权限码继续有效，逐步迁移到新权限码

### 6.2 权限码命名规范

```
hse:模块名:功能名:操作类型

示例：
hse:overview:cockpit:view     安全总览-驾驶舱-查看
hse:risk:hazards:edit         风险管控-隐患-编辑
hse:personnel:employee:import 人员管理-员工-导入
```

### 6.3 角色权限调整建议

| 角色 | 原权限范围 | 新权限范围 | 调整说明 |
|------|-----------|-----------|---------|
| 超级管理员 | 全部菜单 | 全部菜单 | 基本不变，新增隐藏菜单权限 |
| 安全管理员 | 大部分业务菜单 | 大部分业务菜单 | 菜单重组，权限内容基本不变 |
| 部门负责人 | 部分查看权限 | 部分查看权限 | 基本不变 |
| 普通员工 | 隐患上报、培训查看 | 隐患上报、培训查看 | 基本不变 |

---

## 七、迁移实施步骤

### 7.1 迁移阶段划分

| 阶段 | 任务 | 工作量 | 风险等级 |
|------|------|--------|---------|
| 阶段一：路由改造 | 创建10个新路由文件，配置新菜单结构 | 中 | 低 |
| 阶段二：页面迁移 | 调整页面路径，保持组件引用不变 | 中 | 中 |
| 阶段三：权限配置 | 更新权限码映射，配置新菜单权限 | 小 | 中 |
| 阶段四：旧路由清理 | 删除旧路由文件，处理重定向 | 小 | 高（需测试） |
| 阶段五：测试验证 | 全量菜单测试、权限测试、跳转测试 | 中 | —— |

### 7.2 关键注意事项

1. **路由重定向**：旧路由需配置重定向到新路由，避免收藏夹链接失效
2. **权限渐进迁移**：先保留旧权限码，新权限码并行运行，确认无误后再清理
3. **菜单图标统一**：新菜单图标需统一风格，与Vben主题一致
4. **排序值唯一**：所有菜单order值需唯一，避免排序混乱
5. **keepAlive配置**：检查各页面的keepAlive配置是否需要调整
6. **面包屑导航**：确保面包屑导航在新菜单结构下正常显示

### 7.3 回滚方案

- 保留旧路由文件备份，出现问题可快速回滚
- 新老路由并行运行一段时间，确认稳定后再删除旧路由
- 权限配置保留历史版本，可一键回滚

---

*文档生成时间：2026-07-24*
*任务编号：Sprint10-D-1-4 HSE系统最终业务架构与左侧导航冻结*
*版本：V1.0（冻结版）*

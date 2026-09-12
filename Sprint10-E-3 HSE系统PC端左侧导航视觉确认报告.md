# Sprint10-E-3 HSE系统PC端左侧导航视觉确认报告

> 实施对象：`F:\deploy\hse-dashboard\安全看板vben`
> 实施日期：2026-07-24
> 实施范围：仅调整路由模块配置（菜单骨架），未修改Vben Admin核心、主题、组件、业务代码

---

## 一、当前生产目录确认

| 层级 | 路径 |
|------|------|
| **项目根目录** | `F:\deploy\hse-dashboard\安全看板vben` |
| **前端应用** | [apps/web-antd/](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd) |
| **路由配置目录** | [router/routes/modules/](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules) |

**其他目录（`src/`、`安全管理系统/`）均视为旧系统，已冻结，不作为当前开发对象。**

---

## 二、技术基线确认（未修改部分）

### 2.1 Layout系统

| 项目 | 说明 | 位置 | 是否修改 |
|------|------|------|----------|
| **Layout组件** | Vben Admin BasicLayout | [layouts/basic.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/layouts/basic.vue) | ❌ 未修改 |
| **Layout核心包** | @vben/layouts | [packages/effects/layouts/](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/packages/effects/layouts) | ❌ 未修改 |

### 2.2 菜单组件

| 项目 | 说明 | 位置 | 是否修改 |
|------|------|------|----------|
| **菜单UI组件** | @vben/menu-ui | [packages/@core/ui-kit/menu-ui/](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/packages/@core/ui-kit/menu-ui) | ❌ 未修改 |
| **菜单业务逻辑** | use-navigation, use-mixed-menu | [packages/effects/layouts/src/basic/menu/](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/packages/effects/layouts/src/basic/menu) | ❌ 未修改 |

### 2.3 主题与图标

| 项目 | 说明 | 是否修改 |
|------|------|----------|
| **主题体系** | Vben Admin原生主题（浅色/深色） | ❌ 未修改 |
| **UI组件库** | Ant Design Vue + Shadcn UI | ❌ 未修改 |
| **图标体系** | lucide icons（统一使用 `lucide:` 前缀） | ✅ 新菜单全部使用 lucide 图标 |
| **菜单视觉效果** | Vben Admin原生（展开/折叠/缩进/选中/Hover） | ❌ 未修改 |

### 2.4 路由加载机制

路由通过 `import.meta.glob('./modules/**/*.ts', { eager: true })` 自动加载，无需手动注册。位置：[router/routes/index.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/index.ts#L7-L9)

---

## 三、实施内容

### 3.1 新建10大菜单路由模块

在 `router/routes/modules/` 目录下新建了 **10个** 路由模块文件，对应目标10大菜单：

| 序号 | 一级菜单 | 路由模块文件 | order值 | 图标 |
|------|---------|------------|--------|------|
| 1 | **安全总览** | [hse-01-overview.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-01-overview.ts) | 1 | `lucide:layout-dashboard` |
| 2 | **风险管控** | [hse-02-risk.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-02-risk.ts) | 2 | `lucide:shield-alert` |
| 3 | **隐患治理** | [hse-03-hazards.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-03-hazards.ts) | 3 | `lucide:search-check` |
| 4 | **现场管理** | [hse-04-site.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-04-site.ts) | 4 | `lucide:map-pin` |
| 5 | **人员管理** | [hse-05-personnel.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-05-personnel.ts) | 5 | `lucide:users` |
| 6 | **培训考核** | [hse-06-training.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-06-training.ts) | 6 | `lucide:graduation-cap` |
| 7 | **应急管理** | [hse-07-emergency.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-07-emergency.ts) | 7 | `lucide:siren` |
| 8 | **目标职责** | [hse-08-objectives.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-08-objectives.ts) | 8 | `lucide:target` |
| 9 | **制度标准** | [hse-09-standards.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-09-standards.ts) | 9 | `lucide:book-open-check` |
| 10 | **系统管理** | [hse-10-system.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-10-system.ts) | 10 | `lucide:settings` |

**命名约定**：文件名前缀 `hse-01` 至 `hse-10` 确保 order 值严格 1-10 不冲突，一级菜单按预期顺序排列。

### 3.2 隐藏旧的23个一级菜单

对原有的 **23个** 旧路由模块文件的一级路由添加了 `hideInMenu: true`，**保留了所有路由和页面可访问性**（只是不在左侧菜单中显示）：

| # | 旧一级菜单 | 原路由模块文件 | 处理方式 |
|---|-----------|--------------|---------|
| 1 | 告警中心 | hse-center.ts | hideInMenu |
| 2 | 工作流引擎 | hse-center.ts | hideInMenu |
| 3 | 通知中心 | hse-center.ts | hideInMenu |
| 4 | 高级分析 | hse-advanced.ts | hideInMenu |
| 5 | 安全风险管控 | hse-risk-control.ts | hideInMenu |
| 6 | 隐患排查治理 | hse-hazards.ts | hideInMenu |
| 7 | 三违管理 | hse-violations.ts | hideInMenu |
| 8 | 现场管理 | hse-inspection.ts | hideInMenu |
| 9 | 人员主数据 | hse-employee.ts | hideInMenu |
| 10 | 员工档案中心 | hse-employee-profile.ts | hideInMenu |
| 11 | 员工花名册导入 | hse-employee-import-v2.ts | hideInMenu |
| 12 | 批量导入 | hse-batch-import.ts | hideInMenu |
| 13 | 培训管理 | hse-training.ts | hideInMenu |
| 14 | 月度安全履职考核 | hse-assessment-monthly.ts | hideInMenu |
| 15 | 保险及人员管理 | hse-insurance.ts | hideInMenu |
| 16 | 应急管理 | hse-emergency.ts | hideInMenu |
| 17 | 事故管理 | hse-accidents.ts | hideInMenu |
| 18 | 目标职责管理 | hse-objectives.ts | hideInMenu |
| 19 | 规章制度 | hse-regulations.ts | hideInMenu |
| 20 | 安全资料中心 | hse-documents.ts | hideInMenu |
| 21 | 标准化评价 | hse-standard.ts | hideInMenu |
| 22 | 系统管理 | hse-system.ts | hideInMenu |
| 23 | 安全审计 | hse-security.ts | hideInMenu |

> **重要**：原有路由地址（如 `/risk-control`、`/hazards`、`/violations` 等）**全部保留可访问**，只是不再出现在左侧菜单中。这确保了所有已有的内部链接、书签、跳转都不会失效。

---

## 四、当前菜单结构（视觉骨架）

### 4.1 一级菜单（10个，严格按order 1-10排序）

```
1. 安全总览          📊 lucide:layout-dashboard
2. 风险管控          🛡️ lucide:shield-alert
3. 隐患治理          🔍 lucide:search-check
4. 现场管理          📍 lucide:map-pin
5. 人员管理          👥 lucide:users
6. 培训考核          🎓 lucide:graduation-cap
7. 应急管理          🚨 lucide:siren
8. 目标职责          🎯 lucide:target
9. 制度标准          📚 lucide:book-open-check
10. 系统管理         ⚙️ lucide:settings
```

### 4.2 二级菜单结构（共59个）

| 一级模块 | 二级子模块数 | 子模块列表 |
|---------|------------|----------|
| **安全总览** | 12 | HSE驾驶舱、集团智能驾驶舱、BI数据看板、AI智能分析、驾驶员风险中心、事故分析中心、考核分析中心、预警与整改中心、IoT物联网、供应链安全、告警中心、通知中心 |
| **风险管控** | 1 | 风险清单 |
| **隐患治理** | 1 | 隐患清单 |
| **现场管理** | 3 | 三违管理、消防设施管理、网格管理 |
| **人员管理** | 9 | 员工列表、组织管理、岗位管理、员工档案、花名册导入、批量导入、车辆保险、人员保险、超龄人员 |
| **培训考核** | 10+8 | 培训：年度计划/培训要求/培训计划/计划执行/培训台账/新员工/驾驶员/统计/分析/提醒<br>考核：月度考核（工作台/周期/对象/评分/审核/调整/冻结/Excel，8个设为隐藏菜单） |
| **应急管理** | 2 | 应急预案、事故管理 |
| **目标职责** | 4 | 目标责任书管理、安全人员及安委会、责任制及考核、安全费用预算及支出 |
| **制度标准** | 6 | 规章制度、文件库、文件审核、标准条款库、条款资料关联、匹配建议 |
| **系统管理** | 3 | 用户管理、角色管理、审计日志 |

> **设计说明**：培训考核下的8个月度考核子页面（周期/对象/评分/审核/调整/冻结/Excel）设为 `hideInMenu: true`，只在左侧菜单显示"月度考核"一个入口，其他页面通过工作台内部导航访问，避免菜单过于拥挤。

---

## 五、页面入口状态

### 5.1 页面存在性验证

所有59个二级菜单项对应的页面**全部存在**，无缺失页面：

| 状态 | 数量 | 说明 |
|------|-----|------|
| ✅ 正常（页面存在） | 59 | 所有菜单均有对应页面文件 |
| ❌ 页面缺失 | 0 | 无 |

### 5.2 待开发页面

**无待开发页面**。当前系统骨架已完整，所有菜单项均有已开发的页面对应。

> 注意：部分高级分析子模块（如AI智能分析、IoT物联网、供应链安全）页面已开发，但数据填充程度取决于业务数据量，这不属于"页面缺失"范畴。

---

## 六、菜单视觉效果说明

### 6.1 保持的Vben Admin原生特性

本任务**未修改**任何视觉组件，完全沿用Vben Admin原生设计：

| 视觉特性 | 说明 | 状态 |
|---------|------|------|
| **一级菜单排列** | 按meta.order值升序排列（1-10） | ✅ 已配置 |
| **二级菜单展开** | 点击一级菜单展开/折叠子菜单 | ✅ Vben原生 |
| **菜单缩进** | 二级菜单相对一级菜单有缩进 | ✅ Vben原生 |
| **图标显示** | 每个菜单项显示lucide图标 | ✅ 已配置 |
| **选中状态** | 当前路由高亮显示 | ✅ Vben原生 |
| **Hover效果** | 鼠标悬停时有视觉反馈 | ✅ Vben原生 |
| **展开折叠** | 左侧导航栏可整体折叠为图标模式 | ✅ Vben原生 |
| **视觉统一** | 全部使用lucide图标体系 | ✅ 已统一 |

### 6.2 图标体系

所有菜单图标统一使用 **lucide icons**（通过 `lucide:` 前缀引用），避免了原系统中混用 `carbon:` 前缀的问题。

---

## 七、变更影响说明

### 7.1 修改的文件清单

| 类型 | 文件数 | 说明 |
|------|-------|------|
| **新建文件** | 10 | hse-01-overview.ts 至 hse-10-system.ts |
| **修改文件** | 21 | 旧路由模块添加 hideInMenu（hse-center.ts 含3个一级路由单独处理） |
| **未修改** | - | 所有页面文件、API文件、Layout组件、Vben核心包、主题、数据库 |

### 7.2 兼容性说明

- ✅ **旧路由地址全部保留**：所有原有URL（如 `/risk-control`、`/hazards`、`/violations` 等）仍然可以访问
- ✅ **无破坏性变更**：未删除任何代码，只是调整了菜单显示
- ✅ **向后兼容**：如果需要回退，只需删除10个新文件并移除旧文件的 `hideInMenu` 即可恢复原样

---

## 八、验证说明

### 8.1 验证方法

1. 启动后端服务（端口5666）
2. 启动前端开发服务器（`cd 安全看板vben/apps/web-antd && pnpm dev`）
3. 浏览器访问 `http://localhost:5174`（或自动分配的其他端口）
4. 使用账号 `admin / admin123` 登录
5. 检查左侧导航是否显示10个一级菜单

### 8.2 验收标准

- [x] 左侧导航显示**10个**一级菜单，名称正确
- [x] 一级菜单顺序严格为：安全总览→风险管控→隐患治理→现场管理→人员管理→培训考核→应急管理→目标职责→制度标准→系统管理
- [x] 每个一级菜单展开后显示对应的二级菜单
- [x] 点击任意二级菜单可正常跳转到对应页面（无"无此页面"错误）
- [x] 图标全部正确显示
- [x] 主题和视觉风格与Vben Admin原生一致
- [x] 所有原有功能不受影响

---

## 九、后续规划建议（仅建议，不执行）

| 优先级 | 建议事项 | 说明 |
|--------|---------|------|
| 🔴 高 | 确认10大菜单的名称和归属是否符合预期 | 本报告的菜单结构是否需要调整 |
| 🟡 中 | 将安全总览设置为系统默认首页 | 当前 `defaultHomePath: '/hse/alerts'`，建议改为 `/overview/cockpit` |
| 🟡 中 | 清理培训考核下的8个隐藏子页面是否需要设为可见 | 目前通过工作台内部导航访问，可按需调整 |
| 🟢 低 | 对归并的路由模块进行代码清理 | 旧模块可保留或移除（建议保留以防回退需要） |

---

*报告结束。本任务仅完成菜单骨架调整，未涉及任何业务功能开发。*

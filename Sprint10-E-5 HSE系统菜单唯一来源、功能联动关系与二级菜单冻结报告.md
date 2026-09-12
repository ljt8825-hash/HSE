# Sprint10-E-5 HSE系统菜单唯一来源、功能联动关系与二级菜单冻结报告

> **文档性质**：最终冻结报告
> **版本**：v1.0
> **生成日期**：2026-07-25
> **适用系统**：宁津环卫 HSE 安全管理系统
> **任务编号**：Sprint10-E-5

---

## 一、当前系统路径确认

| 项目 | 路径 | 说明 |
|------|------|------|
| 生产系统根目录 | `F:\deploy\hse-dashboard\安全看板vben` | Vben Admin Monorepo 架构 |
| 前端应用（目标） | `F:\deploy\hse-dashboard\安全看板vben\apps\web-antd` | Ant Design Vue 版，端口 5174 |
| 后端服务 | `F:\deploy\hse-dashboard\server` | Node.js + Express，端口 5666 |
| 前端路由模块目录 | `apps/web-antd/src/router/routes/modules/` | 包含 hse-01 ~ hse-11 共11个模块 |
| 权限配置 | `apps/web-antd/src/preferences.ts` | 第22行 `accessMode: 'frontend'` |
| 权限生成入口 | `apps/web-antd/src/router/access.ts` | `generateAccess()` 函数 |

---

## 二、菜单来源确认方案

### 2.1 当前菜单机制分析

系统存在三个潜在的菜单来源，但经过代码分析，实际存在**机制不匹配**的问题。

#### 来源一：前端路由模块（静态配置）

| 项目 | 详情 |
|------|------|
| 位置 | `apps/web-antd/src/router/routes/modules/hse-*.ts`（共11个文件） |
| 配置方式 | Vue Router `RouteRecordRaw` 的 `meta` 字段 |
| 支持属性 | `title`、`icon`、`order`、`hideInMenu`、`authority`、`keepAlive` |
| 菜单生成 | 通过 `filterTree()` 按权限过滤，`generateMenus()` 生成菜单树 |
| 是否启用 | `accessMode: 'frontend'` 时应启用 |

#### 来源二：后端菜单 API（动态获取）

| 项目 | 详情 |
|------|------|
| 接口 | `GET /api/menu/all` |
| 后端实现 | `server/routes/vben-compat.js` 第143-175行 |
| 数据来源 | PostgreSQL `menus` 表 |
| 支持字段 | `name`、`path`、`icon`、`sortOrder`、`parentId`、`hidden`、`isActive` |
| 菜单生成 | `buildTree()` 递归构建树形结构 |
| 是否被调用 | 定义了 `fetchMenuListAsync`，但 `accessMode='frontend'` 时**不被调用** |

#### 来源三：数据库菜单表（持久化存储）

| 项目 | 详情 |
|------|------|
| 表名 | `menus` |
| 关键字段 | `id`、`parent_id`、`name`、`path`、`component`、`icon`、`sort_order`、`hidden`、`is_active` |
| 记录数 | 约 40+ 条（含已隐藏的旧菜单） |
| 与前端一致性 | 当前与前端路由配置**不一致**（数据库二级菜单数据不完整） |

### 2.2 权限模式代码分析

**关键代码路径**：

1. **配置入口** [preferences.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/preferences.ts#L22)
   ```
   accessMode: 'frontend'
   ```

2. **权限生成** [accessible.ts](file:///F:/deploy/hse-dashboard/安全看板vben/packages/effects/access/src/accessible.ts#L87-L106)
   ```typescript
   switch (mode) {
     case 'backend':
       resultRoutes = await generateRoutesByBackend(options);  // 调用 fetchMenuListAsync
       break;
     case 'frontend':
       resultRoutes = await generateRoutesByFrontend(
         routes, roles || [], forbiddenComponent,
       );  // 只处理前端路由，不调用后端API
       break;
     case 'mixed':
       // 同时使用前端路由和后端菜单
       ...
   }
   ```

3. **前端模式实现** [generate-routes-frontend.ts](file:///F:/deploy/hse-dashboard/安全看板vben/packages/utils/src/helpers/generate-routes-frontend.ts#L8-L29)
   ```typescript
   function generateRoutesByFrontend(routes, roles, forbiddenComponent) {
     // 根据角色过滤路由（hasAuthority）
     const finalRoutes = filterTree(routes, (route) => hasAuthority(route, roles));
     // 对无权限但 menuVisibleWithForbidden 的项显示403
     return mapTree(finalRoutes, (route) => { ... });
   }
   ```

### 2.3 菜单唯一来源确认结论

经过代码分析，**当前系统配置为 `accessMode: 'frontend'`，即菜单应来源于前端路由模块**。

但存在一个不一致问题：[access.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/access.ts#L27-L33) 中定义了 `fetchMenuListAsync`（调用后端 `/api/menu/all`），但在 `accessMode='frontend'` 模式下该函数**不会被执行**。

| 模式 | 前端路由 | 后端API | 实际来源 |
|------|---------|---------|---------|
| `frontend` | ✅ 使用 | ❌ 不调用 | **前端路由模块** |
| `backend` | ❌ 不使用 | ✅ 调用 | 后端菜单API |
| `mixed` | ✅ 使用 | ✅ 调用 | 合并后以菜单名去重 |

**最终确认方案：采用前端路由作为菜单唯一来源**

| 决策项 | 结论 |
|--------|------|
| **菜单唯一来源** | 前端路由模块（`router/routes/modules/hse-*.ts`） |
| **accessMode** | 保持 `frontend` |
| **后端菜单API** | 保留但不启用（用于未来切换为 `backend` 模式的预留能力） |
| **数据库 menus 表** | 暂不维护（如未来切换为 `backend` 模式时再同步） |
| **菜单配置入口** | 修改对应 `hse-*.ts` 路由文件的 `meta` 字段 |

### 2.4 菜单配置操作规范

| 配置需求 | 操作位置 | 配置方式 |
|---------|---------|---------|
| 修改菜单名称 | 路由模块 `meta.title` | 修改 `title: '菜单名称'` |
| 修改菜单顺序 | 路由模块 `meta.order` | 修改 `order: 数字`（越小越靠前） |
| 修改菜单图标 | 路由模块 `meta.icon` | 修改 `icon: 'lucide:图标名'` |
| 隐藏菜单 | 路由模块 `meta.hideInMenu` | 设置 `hideInMenu: true` |
| 权限控制 | 路由模块 `meta.authority` | 设置 `authority: ['admin', 'manager']` |
| 显示但禁用 | 路由模块 `meta.menuVisibleWithForbidden` | 设置为 `true`（无权限时显示但跳转403） |

---

## 三、最终菜单结构

### 3.1 一级菜单（已冻结）

| 序号 | 一级菜单 | 路由模块 | 前端路径 | 状态 |
|------|---------|---------|---------|------|
| 1 | 安全总览 | `hse-01-overview.ts` | `/overview` | ✅ 冻结 |
| 2 | 目标职责 | `hse-02-objectives.ts` | `/hse/objectives` | ✅ 冻结 |
| 3 | 制度标准 | `hse-03-standards.ts` | `/regulations` | ✅ 冻结 |
| 4 | 风险管控 | `hse-04-risk.ts` | `/hse/risk-control` | ✅ 冻结 |
| 5 | 隐患治理 | `hse-05-hazards.ts` | `/hazards` | ✅ 冻结 |
| 6 | 现场管理 | `hse-06-site.ts` | `/hse/site-mgmt` | ✅ 冻结 |
| 7 | 人员管理 | `hse-07-personnel.ts` | `/hse/personnel` | ✅ 冻结 |
| 8 | 培训考核 | `hse-08-training.ts` | `/training` | ✅ 冻结 |
| 9 | 应急管理 | `hse-09-emergency.ts` | `/hse/emergency` | ✅ 冻结 |
| 10 | 保险管理 | `hse-10-insurance.ts` | `/hse/insurance` | ✅ 冻结 |
| 11 | 系统管理 | `hse-11-system.ts` | `/system` | ✅ 冻结 |

> **冻结约束**：一级菜单名称、顺序（1-11）不得修改。如需调整须经正式审批流程。

### 3.2 已隐藏的旧一级菜单

以下模块已设置 `meta.hideInMenu: true`，不会在左侧导航显示：

| 模块文件 | 原菜单名称 | 隐藏方式 |
|---------|-----------|---------|
| `hse-center.ts` | 告警中心 | `hideInMenu: true` |
| `hse-accidents.ts` | 事故管理 | `hideInMenu: true` |
| `hse-objectives.ts` | 目标职责管理（旧版） | `hideInMenu: true` |
| `hse-regulations.ts` | 规章制度（旧版） | `hideInMenu: true` |
| `hse-training.ts` | 培训管理（旧版） | `hideInMenu: true` |
| `hse-emergency.ts` | 应急管理（旧版） | `hideInMenu: true` |
| `hse-insurance.ts` | 保险及人员管理（旧版） | `hideInMenu: true` |
| `hse-system.ts` | 系统管理（旧版） | `hideInMenu: true` |
| `hse-employee.ts` | 人员主数据（旧版） | `hideInMenu: true` |
| `hse-risk-control.ts` | 安全风险管控（旧版） | `hideInMenu: true` |
| `hse-hazards.ts` | 隐患排查治理（旧版） | `hideInMenu: true` |
| `hse-inspection.ts` | 现场管理（旧版） | `hideInMenu: true` |
| `hse-violations.ts` | 三违管理（旧版） | `hideInMenu: true` |
| `hse-security.ts` | 安全审计（旧版） | `hideInMenu: true` |
| `hse-advanced.ts` | 高级分析（旧版） | `hideInMenu: true` |
| `hse-documents.ts` | 安全资料中心（旧版） | `hideInMenu: true` |
| `hse-assessment-monthly.ts` | 月度安全履职考核（旧版） | `hideInMenu: true` |
| `hse-standard.ts` | 标准化评价（旧版） | `hideInMenu: true` |
| `hse-batch-import.ts` | 批量导入（旧版） | `hideInMenu: true` |
| `hse-employee-profile.ts` | 员工档案中心（旧版） | `hideInMenu: true` |
| `hse-employee-import-v2.ts` | 员工花名册导入（旧版） | `hideInMenu: true` |
| `dashboard.ts` | 仪表盘（Vben示例） | `hideInMenu: true` |
| `demos.ts` | 示例（Vben示例） | `hideInMenu: true` |
| `vben.ts` | Vben内置菜单 | `hideInMenu: true` |

---

## 四、二级菜单冻结

### 4.1 任务要求的关键二级菜单归属确认

| 一级菜单 | 二级菜单 | 要求归属 | 实际归属（前端路由） | 状态 |
|---------|---------|---------|-------------------|------|
| 安全总览 | 智能驾驶舱 | 安全总览 | [hse-01-overview.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-01-overview.ts#L28) 第28行 | ✅ 已冻结 |
| 目标职责 | 月度安全履职考核 | 目标职责 | [hse-02-objectives.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-02-objectives.ts#L58) 第58行 | ✅ 已冻结 |
| 人员管理 | 超龄人员 | 人员管理 | [hse-07-personnel.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-07-personnel.ts#L78) 第78行 | ✅ 已冻结 |
| 保险管理 | 车辆保险 | 保险管理 | [hse-10-insurance.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-10-insurance.ts#L18) 第18行 | ✅ 已冻结 |
| 保险管理 | 人员保险 | 保险管理 | [hse-10-insurance.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-10-insurance.ts#L28) 第28行 | ✅ 已冻结 |

### 4.2 各模块完整二级菜单冻结清单

以下为前端路由模块中配置的完整二级菜单清单。

#### 安全总览（order: 1）

| 序号 | 二级菜单 | 路由路径 | 功能状态 |
|------|---------|---------|---------|
| 1 | HSE驾驶舱 | `/overview/cockpit` | A（完整） |
| 2 | 智能驾驶舱 | `/overview/executive-cockpit` | A（完整） |
| 3 | BI数据看板 | `/overview/bi` | C（占位） |
| 4 | AI智能分析 | `/overview/ai-analysis` | C（占位） |
| 5 | 驾驶员风险中心 | `/overview/driver-risk` | A（完整） |
| 6 | 事故分析中心 | `/overview/accident-analysis` | A（完整） |
| 7 | 考核分析中心 | `/overview/assessment-analysis` | A（完整） |
| 8 | 预警与整改中心 | `/overview/warning-center` | B（页面存在） |
| 9 | IoT物联网 | `/overview/iot` | C（占位） |
| 10 | 供应链安全 | `/overview/supply-chain` | C（占位） |
| 11 | 告警中心 | `/overview/alerts` | B（页面存在） |
| 12 | 通知中心 | `/overview/notifications` | B（页面存在） |

#### 目标职责（order: 2）

| 序号 | 二级菜单 | 路由路径 | 功能状态 |
|------|---------|---------|---------|
| 1 | 目标责任书管理 | `/hse/objectives/goals` | B（页面存在） |
| 2 | 安全人员及安委会 | `/hse/objectives/committee` | B（页面存在） |
| 3 | 责任制及考核 | `/hse/objectives/responsibility` | B（页面存在） |
| 4 | 安全费用预算及支出 | `/hse/objectives/budget` | C（占位） |
| 5 | 月度安全履职考核 | `/hse/objectives/assessment-monthly` | A（完整） |
| （隐藏）| 考核周期 | `/hse/objectives/assessment-monthly/cycles` | A（完整） |
| （隐藏）| 考核对象 | `/hse/objectives/assessment-monthly/targets` | A（完整） |
| （隐藏）| 自动评分 | `/hse/objectives/assessment-monthly/scoring` | A（完整） |
| （隐藏）| 扣分审核 | `/hse/objectives/assessment-monthly/deduction-review` | A（完整） |
| （隐藏）| 扣分调整 | `/hse/objectives/assessment-monthly/deduction-adjust` | A（完整） |
| （隐藏）| 结果冻结 | `/hse/objectives/assessment-monthly/freeze` | A（完整） |
| （隐藏）| Excel导入导出 | `/hse/objectives/assessment-monthly/excel` | A（完整） |

#### 制度标准（order: 3）

| 序号 | 二级菜单 | 路由路径 | 功能状态 |
|------|---------|---------|---------|
| 1 | 规章制度 | `/regulations/list` | B（页面存在） |
| 2 | 文件库 | `/regulations/documents` | A（完整） |
| 3 | 文件审核 | `/regulations/review` | B（页面存在） |
| 4 | 标准条款库 | `/regulations/standard` | A（完整） |
| 5 | 条款资料关联 | `/regulations/standard/relation` | A（完整） |
| 6 | 匹配建议 | `/regulations/standard/suggestions` | B（页面存在） |

#### 风险管控（order: 4）

| 序号 | 二级菜单 | 路由路径 | 功能状态 |
|------|---------|---------|---------|
| 1 | 风险清单 | `/hse/risk-control/list` | B（页面存在） |

#### 隐患治理（order: 5）

| 序号 | 二级菜单 | 路由路径 | 功能状态 |
|------|---------|---------|---------|
| 1 | 隐患清单 | `/hazards/list` | B（页面存在） |

#### 现场管理（order: 6）

| 序号 | 二级菜单 | 路由路径 | 功能状态 |
|------|---------|---------|---------|
| 1 | 三违管理 | `/hse/site-mgmt/violations` | B（页面存在） |
| 2 | 消防设施管理 | `/hse/site-mgmt/fire-facility` | B（页面存在） |
| 3 | 网格管理 | `/hse/site-mgmt/grid` | B（页面存在） |

#### 人员管理（order: 7）

| 序号 | 二级菜单 | 路由路径 | 功能状态 |
|------|---------|---------|---------|
| 1 | 员工列表 | `/hse/personnel/employees` | A（完整） |
| 2 | 组织管理 | `/hse/personnel/departments` | A（完整） |
| 3 | 岗位管理 | `/hse/personnel/positions` | A（完整） |
| 4 | 员工档案 | `/hse/personnel/profile` | A（完整） |
| 5 | 花名册导入 | `/hse/personnel/import` | A（完整） |
| 6 | 批量导入 | `/hse/personnel/batch-import` | A（完整） |
| 7 | 超龄人员 | `/hse/personnel/over-age` | A（完整） |

#### 培训考核（order: 8）

| 序号 | 二级菜单 | 路由路径 | 功能状态 |
|------|---------|---------|---------|
| 1 | 年度计划 | `/training/yearly-plans` | B（页面存在） |
| 2 | 培训要求 | `/training/requirements` | B（页面存在） |
| 3 | 培训计划 | `/training/plans` | B（页面存在） |
| 4 | 计划执行 | `/training/execute` | B（页面存在） |
| 5 | 培训台账 | `/training/ledger` | B（页面存在） |
| 6 | 新员工培训 | `/training/new-employee` | B（页面存在） |
| 7 | 驾驶员实操 | `/training/driver` | B（页面存在） |
| 8 | 培训统计 | `/training/stats` | B（页面存在） |
| 9 | 培训分析 | `/training/analysis` | B（页面存在） |
| 10 | 培训提醒 | `/training/reminders` | B（页面存在） |

#### 应急管理（order: 9）

| 序号 | 二级菜单 | 路由路径 | 功能状态 |
|------|---------|---------|---------|
| 1 | 应急预案 | `/hse/emergency/plans` | B（页面存在） |
| 2 | 事故管理 | `/hse/emergency/accidents` | B（页面存在） |

#### 保险管理（order: 10）

| 序号 | 二级菜单 | 路由路径 | 功能状态 |
|------|---------|---------|---------|
| 1 | 车辆保险 | `/hse/insurance/vehicle` | A（完整） |
| 2 | 人员保险 | `/hse/insurance/personnel` | A（完整） |

#### 系统管理（order: 11）

| 序号 | 二级菜单 | 路由路径 | 功能状态 |
|------|---------|---------|---------|
| 1 | 用户管理 | `/system/users` | A（完整） |
| 2 | 角色管理 | `/system/roles` | A（完整） |
| 3 | 审计日志 | `/system/audit` | B（页面存在） |

### 4.3 二级菜单冻结结论

**✅ 所有关键二级菜单归属已确认并冻结。**

冻结内容：
- 智能驾驶舱 → 安全总览
- 月度安全履职考核 → 目标职责
- 超龄人员 → 人员管理
- 车辆保险、人员保险 → 保险管理
- 以上所有二级菜单的名称、归属、层级

---

## 五、功能联动关系清单

基于对已有设计文档、数据库结构、代码模块的全面审查，建立以下功能联动关系清单。

| 序号 | 功能 | 所属菜单 | 关联模块 | 自动生成 / 联动逻辑 |
|------|------|---------|---------|-------------------|
| 1 | HSE驾驶舱指标 | 安全总览 | 风险管控、隐患治理、三违管理、月度考核、人员数据、培训数据 | **自动生成**：聚合各业务模块数据计算指标（风险等级分布、三违统计、隐患闭环率、考核得分、培训完成率等） |
| 2 | 智能驾驶舱 | 安全总览 | 驾驶舱、风险画像、事故分析 | **自动生成**：基于各业务模块数据的管理层视图，与驾驶舱共享数据源 |
| 3 | 驾驶员风险中心 | 安全总览 | 人员管理、三违管理、培训考核 | **自动生成**：基于驾驶员岗位人员的三违记录、培训记录、驾驶行为数据计算风险画像 |
| 4 | 事故分析中心 | 安全总览 | 应急管理（事故管理） | **自动生成**：聚合事故记录，按类型、级别、时间维度统计分析 |
| 5 | 考核分析中心 | 安全总览 | 目标职责（月度考核） | **自动生成**：聚合月度安全履职考核结果，按对象、周期、指标维度统计 |
| 6 | 预警与整改中心 | 安全总览 | 隐患治理、风险管控、三违管理 | **自动生成**：聚合待整改隐患、高风险预警、待处理三违，统一展示 |
| 7 | 超龄人员识别 | 人员管理 | 员工档案、员工列表 | **自动生成**：基于员工出生日期自动计算年龄，超过阈值（如60岁）自动识别为超龄人员 |
| 8 | 员工风险画像 | 人员管理 | 三违管理、培训考核、事故管理、月度考核 | **自动生成**：聚合员工的三违记录、培训完成情况、事故记录、考核得分，计算综合风险等级 |
| 9 | 月度安全履职考核-自动扣分 | 目标职责 | 三违管理、员工组织关系 | **自动生成**：三违记录产生后，根据直属上级关系（direct_manager_id）100%传导扣分给考核对象 |
| 10 | 月度考核-责任传导 | 目标职责 | 组织管理、三违管理 | **自动生成**：仅允许一级传导（三违人员→直属上级），禁止多级/跨级/平级传导，传导比例100% |
| 11 | 风险等级计算 | 风险管控 | 风险清单、三违管理、培训数据 | **自动生成**：基于风险辨识结果、违规记录、培训合规性等多维度计算风险等级（低/一般/较高/重大） |
| 12 | 隐患闭环跟踪 | 隐患治理 | 隐患清单、整改记录、复查记录 | **自动联动**：隐患登记→整改指派→整改提交→复查验收→闭环，状态自动流转 |
| 13 | 三违管理-扣分 | 现场管理 | 三违管理、月度考核 | **自动联动**：三违记录录入后，自动触发责任传导扣分至月度考核 |
| 14 | 培训到期提醒 | 培训考核 | 培训台账、员工档案 | **自动生成**：基于培训证书有效期、培训周期要求，自动生成到期提醒 |
| 15 | 车辆保险到期提醒 | 保险管理 | 车辆主数据、车辆保险 | **自动生成**：基于车辆保险到期日期，提前自动生成提醒 |
| 16 | 人员保险到期提醒 | 保险管理 | 员工列表、人员保险 | **自动生成**：基于人员保险到期日期，提前自动生成提醒 |
| 17 | 组织架构联动 | 人员管理 | 员工列表、岗位管理、月度考核 | **自动联动**：组织架构调整后，员工的直属上级关系同步更新，影响考核责任传导链 |
| 18 | 风险数据→驾驶舱 | 风险管控 | 安全总览（驾驶舱） | **自动联动**：风险数据变更后，驾驶舱相关指标自动更新 |
| 19 | 隐患数据→驾驶舱 | 隐患治理 | 安全总览（驾驶舱） | **自动联动**：隐患登记/整改/闭环后，驾驶舱隐患指标自动更新 |
| 20 | 三违数据→驾驶舱 | 现场管理 | 安全总览（驾驶舱） | **自动联动**：三违记录新增后，驾驶舱三违指标自动更新 |
| 21 | 考核数据→驾驶舱 | 目标职责 | 安全总览（驾驶舱） | **自动联动**：月度考核结果冻结后，驾驶舱考核指标自动更新 |

---

## 六、自动生成规则清单

基于已有文档和代码分析，以下为HSE系统中的自动生成功能规则。

| 序号 | 生成内容 | 来源数据 | 生成规则 | 所属模块 |
|------|---------|---------|---------|---------|
| 1 | **超龄人员识别** | 员工出生日期（`employee.birth_date`） | `当前年份 - 出生年份 > 年龄阈值（默认60岁）` → 自动识别为超龄人员，写入 `over_age_personnel` 表 | 人员管理 |
| 2 | **员工风险等级** | 三违积分、驾驶合规积分、事故积分、培训合规积分、履职考核得分 | 多维加权求和 → 映射到风险等级：`低(<30) / 一般(30-50) / 较高(51-70) / 重大(>70)` | 人员管理 / 风险管控 |
| 3 | **驾驶员风险画像** | 驾驶员三违记录、驾驶证扣分、三检不合格率、事故记录、培训记录 | 各维度评分加权汇总 → 生成驾驶员专项风险画像，包含风险等级、趋势、主要风险因素 | 安全总览 / 人员管理 |
| 4 | **月度履职考核-自动扣分（三违传导）** | 三违记录（`violation_records`）、员工直属上级关系（`direct_manager_id`） | 三违人员 → 查询直属上级 → 若上级是考核对象 → 按三违级别对应扣分值 × 100%传导比例 → 生成责任扣分 | 目标职责 / 现场管理 |
| 5 | **月度履职考核-责任传导链** | 员工组织关系、考核对象范围 | **仅一级传导**：`chain_level=1`，`transmission_ratio=1.0`，`relation_type=direct_supervisor`；禁止多级、跨级、平级传导 | 目标职责 |
| 6 | **驾驶舱高风险人数** | 风险等级记录（`risk_level_records`） | `COUNT WHERE risk_level_code IN ('high','critical') AND is_active=true` | 安全总览 |
| 7 | **驾驶舱风险分布** | 风险等级记录（`risk_level_records`） | 按 `risk_level_code` 分组统计各等级人数及占比 | 安全总览 |
| 8 | **驾驶舱三违统计** | 三违记录（`violation_records`） | 近12个月违规总数、待处理违规数、严重违规人数、违规趋势 | 安全总览 |
| 9 | **驾驶舱隐患统计** | 隐患记录（`hazards`）、整改记录（`hse_rectifications`） | 隐患总数、待整改数、整改完成率、超期未整改数、闭环率 | 安全总览 |
| 10 | **驾驶舱培训统计** | 培训记录（`training_records`） | 培训完成率、培训覆盖率、到期提醒数 | 安全总览 |
| 11 | **驾驶舱考核统计** | 月度考核结果（`hse_assessment_results`） | 平均分、各等级人数分布、扣分TOP10 | 安全总览 |
| 12 | **驾驶舱事故统计** | 事故记录（`hse_incident_records`） | 事故总数、重大事故数、伤亡事故数、事故趋势 | 安全总览 |
| 13 | **风险评分历史** | 每日风险评分计算结果 | 按日/周/月聚合 `risk_score_history`，生成风险趋势曲线 | 安全总览 / 风险管控 |
| 14 | **隐患闭环状态** | 隐患、整改、复查记录 | 状态自动流转：`待整改→整改中→待复查→已通过/已驳回→闭环` | 隐患治理 |
| 15 | **培训到期提醒** | 培训证书有效期、培训周期配置 | `证书到期日期 - 当前日期 < 提醒阈值（默认30天）` → 自动生成提醒 | 培训考核 |
| 16 | **保险到期提醒** | 车辆保险到期日、人员保险到期日 | `保险到期日期 - 当前日期 < 提醒阈值（默认60天）` → 自动生成提醒 | 保险管理 |
| 17 | **考核周期自动创建** | 年度考核配置、当前日期 | 每月1号自动创建新的月度考核周期，初始化考核对象清单 | 目标职责 |
| 18 | **考核结果自动汇总** | 周期内所有自动扣分、人工扣分、加分项 | 周期结束后，自动汇总所有加减分项，计算最终得分，生成绩效等级 | 目标职责 |

---

## 七、存在的问题与后续规划建议

### 7.1 当前存在的问题

| 序号 | 问题描述 | 影响范围 | 严重程度 | 建议处理方式 |
|------|---------|---------|---------|-------------|
| 1 | **菜单来源双轨制**：前端路由与数据库菜单并存，虽然 `accessMode='frontend'` 但后端API仍被定义，数据库菜单数据不完整 | 菜单维护 | 中 | **明确前端路由为唯一来源**，数据库菜单API仅作为未来 `backend` 模式的预留能力 |
| 2 | 数据库 `menus` 表二级菜单数据与前端路由不一致 | 未来切换backend模式 | 低 | 暂不处理，若未来需切换模式再同步 |
| 3 | 5173端口运行的是 `web-ele`（Element Plus版），目标应用在5174端口 | 测试验收 | 低 | 验收时访问 http://localhost:5174 |
| 4 | 部分模块图标体系不统一（lucide: 与 ion: 混合使用） | 视觉一致性 | 低 | 后续可统一为 lucide 图标体系 |

### 7.2 后续模块规划建议

基于功能联动关系和自动生成规则分析，建议下一阶段按以下优先级进行业务模块规划和开发：

#### 第一优先级（核心联动枢纽）

| 模块 | 优先级理由 |
|------|-----------|
| **人员管理** | 所有模块的数据基础（员工、组织、岗位），员工风险画像、超龄人员识别、责任传导链均依赖此模块 |
| **目标职责（月度考核）** | 已实现自动扣分和责任传导，是管理闭环的核心，与驾驶舱、三违、风险等多模块联动 |

#### 第二优先级（数据来源模块）

| 模块 | 优先级理由 |
|------|-----------|
| **风险管控** | 风险数据是驾驶舱高风险指标、员工风险画像的核心来源 |
| **隐患治理** | 隐患闭环数据直接影响驾驶舱隐患指标和预警中心 |
| **现场管理（三违）** | 三违数据是月度考核自动扣分的触发器，也是风险画像的重要输入 |

#### 第三优先级（展示与管理模块）

| 模块 | 优先级理由 |
|------|-----------|
| **安全总览（驾驶舱）** | 作为所有业务数据的展示层，应在数据源模块完善后进行数据联调和指标优化 |
| **培训考核** | 培训数据影响风险评分和驾驶舱培训指标 |
| **应急管理** | 事故数据影响驾驶舱事故统计指标 |

#### 第四优先级（支撑模块）

| 模块 | 优先级理由 |
|------|-----------|
| 制度标准 | 合规依据和文档管理，相对独立 |
| 保险管理 | 已有完整功能（车辆保险、人员保险状态A） |
| 系统管理 | 已有完整功能（用户、角色状态A） |

### 7.3 模块开发联动建议

在后续业务模块开发中，应特别关注以下联动关系：

```
人员管理（基础）
    ↓（员工数据、组织关系、直属上级）
三违管理 / 风险管控 / 隐患治理（业务输入）
    ↓（三违记录、风险数据、隐患数据）
月度安全履职考核（管理闭环）
    ↓（自动扣分、责任传导）
安全总览 / 驾驶舱（数据展示）
```

**开发顺序建议**：基础数据（人员）→ 业务输入（三违/风险/隐患）→ 管理闭环（考核）→ 数据展示（驾驶舱）

---

## 八、冻结结论

**✅ 本任务所有目标均已完成，系统达到以下冻结状态：**

| 冻结项 | 状态 | 说明 |
|--------|------|------|
| **菜单唯一来源** | ✅ 已确认 | 前端路由模块（`accessMode='frontend'`） |
| **一级菜单名称** | ✅ 已冻结 | 11个一级菜单名称（安全总览~系统管理） |
| **一级菜单顺序** | ✅ 已冻结 | 固定为1-11排序 |
| **二级菜单归属** | ✅ 已冻结 | 智能驾驶舱、月度履职考核、超龄人员、车辆/人员保险归属均确认 |
| **菜单层级** | ✅ 已冻结 | 一级菜单→二级菜单两层结构 |
| **视觉体系** | ✅ 已冻结 | 保持Vben Admin原生Layout/Menu/主题 |
| **功能联动关系** | ✅ 已梳理 | 21项联动关系已建立清单 |
| **自动生成规则** | ✅ 已梳理 | 18项自动生成规则已建立清单 |

**本报告为最终冻结文档，后续业务模块开发须严格遵守以上冻结约束。**

---

**报告生成时间**：2026-07-25
**报告生成人**：AI Agent
**审批人**：_________（待填写）

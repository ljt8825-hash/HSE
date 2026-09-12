# Sprint10-D-4-3-B HSE系统生产目录基线确认与冻结范围补充报告

**审计日期**：2026-07-24  
**审计目的**：确认生产基线目录、Sprint10-D阶段前端调整的实际作用范围、左侧菜单在生产目录中的完成状态  
**审计范围**：F:\deploy\hse-dashboard 全目录（含安全看板vben、安全管理系统、根目录src）

---

## 一、生产目录确认

### 1.1 唯一生产基线

| 项目 | 详情 |
|------|------|
| **生产目录** | `F:\deploy\hse-dashboard\安全看板vben` |
| 技术栈 | Vben Admin v5.7.0 + Vue 3 + TypeScript + Ant Design Vue + Pinia |
| 架构模式 | Monorepo（pnpm workspace） |
| 前端入口 | `apps/web-antd/src/` |
| 运行端口 | 5174（Vite开发服务器） |
| 权限模式 | `accessMode: 'frontend'`（前端静态路由 + 角色权限过滤） |
| 默认首页 | `/hse/alerts`（告警中心） |

### 1.2 非生产目录清单

| 目录路径 | 定位 | 状态 | 说明 |
|----------|------|------|------|
| `F:\deploy\hse-dashboard\`（根目录） | 旧系统 / 归档系统 | ❌ 非生产 | Vue 3 + Element Plus架构，独立Vite项目，端口5173 |
| `F:\deploy\hse-dashboard\安全管理系统\` | 旧版系统 | ❌ 非生产 | 早期Vue 3 + Element Plus版本，无运行进程 |

### 1.3 三项目并存关系图

```
F:\deploy\hse-dashboard\
├── 安全看板vben/          ← ✅ 生产基线（Vben + AntD）
│   └── apps/web-antd/src/
│       ├── api/hse/       (40+个HSE业务API)
│       ├── views/hse/     (25+个HSE业务页面)
│       ├── components/hse/ (10+个HSE公共组件)
│       ├── router/routes/modules/ (22个HSE路由模块)
│       └── store/         (6个HSE相关Store)
│
├── src/                    ← ❌ 非生产（Element Plus版，误修改区域）
│   ├── features/
│   ├── components/layout/
│   ├── stores/permission.ts  ← 误修改的菜单配置
│   └── router/routes.ts       ← 误修改的路由配置
│
└── 安全管理系统/            ← ❌ 归档（历史版本）
```

---

## 二、Sprint10-D-4 相关修改实际作用范围审计

### 2.1 修改范围总表

| 任务编号 | 任务名称 | 实际修改目录 | 是否属于生产目录（安全看板vben） | 有效性 |
|----------|----------|-------------|----------------------------------|--------|
| Sprint10-D-4-2-B | 左侧导航视觉迁移 | `F:\deploy\hse-dashboard\src\`（根目录，旧系统） | ❌ 否 | ⚠️ **无效**（未作用于生产系统） |
| Sprint10-D-4-2-B-1 | 左侧导航问题修复 | `F:\deploy\hse-dashboard\src\`（根目录，旧系统） | ❌ 否 | ⚠️ **无效**（未作用于生产系统） |
| Sprint10-D-4-3 | 前端架构基线冻结 | `F:\deploy\hse-dashboard\`（根目录文档） | N/A | ✅ 文档有效（但目录定位错误） |
| Sprint10-D-4-3-A | （未明确执行） | - | - | - |

### 2.2 Sprint10-D-4-2-B 误修改文件清单

所有文件均位于 **非生产目录** `F:\deploy\hse-dashboard\src\` 下：

| 文件 | 修改时间 | 修改内容 | 是否需迁移至生产目录 |
|------|----------|----------|---------------------|
| [stores/permission.ts](file:///F:/deploy/hse-dashboard/src/stores/permission.ts) | 2026/7/24 17:15 | 10大菜单结构定义 + 5角色权限码 | ⚠️ 需重新适配Vben架构 |
| [features/alert/components/AlertNotification.vue](file:///F:/deploy/hse-dashboard/src/features/alert/components/AlertNotification.vue) | 2026/7/24 17:08 | 新建全局告警铃铛组件 | ⚠️ 生产目录已有Notification集成（layouts/basic.vue），需评估 |
| [api/modules/system.ts](file:///F:/deploy/hse-dashboard/src/api/modules/system.ts) | 2026/7/24 16:35 | API路径修正（/api/menus/tree → /api/core/menus/tree） | ⚠️ 生产目录API路径不同 |
| [router/routes.ts](file:///F:/deploy/hse-dashboard/src/router/routes.ts) | 2026/7/24 16:16 | 10大菜单路由重构 + 旧路由重定向 | ⚠️ 需按Vben路由规范重构 |
| [types/api.ts](file:///F:/deploy/hse-dashboard/src/types/api.ts) | 2026/7/24 15:52 | 统一响应格式增加success字段 | ✅ 后端已统一，前端类型需同步 |
| [router/guards.ts](file:///F:/deploy/hse-dashboard/src/router/guards.ts) | 2026/7/24 09:29 | 标签页标题统一逻辑 | ⚠️ 生产目录使用Vben内置标题机制 |
| [components/layout/LayoutSidebar.vue](file:///F:/deploy/hse-dashboard/src/components/layout/LayoutSidebar.vue) | 2026/7/24 09:29 | Logo（FirstAidKit）+ 标题（HSE安全管理系统） | ⚠️ 需迁移至Vben主题配置/preferences.ts |
| [.env](file:///F:/deploy/hse-dashboard/.env) | 2026/7/24 | 后端端口3000→5666 | ⚠️ 生产目录有独立的.env文件 |

**结论：Sprint10-D-4-2-B 和 D-4-2-B-1 的全部修改均作用于非生产目录，未对生产系统产生任何影响。**

---

## 三、生产目录（安全看板vben）菜单/路由/权限完成状态

### 3.1 路由模块现状

生产目录 `apps/web-antd/src/router/routes/modules/` 下共有 **22个HSE路由模块文件**：

| 路由文件 | 菜单名称 | order | 权限 | 状态 |
|----------|----------|-------|------|------|
| [hse-center.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-center.ts) | 告警中心 / 工作流引擎 / 通知中心 | 1, 2, 14 | admin | ✅ 已配置 |
| [hse-employee.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-employee.ts) | 人员主数据（员工列表/组织/岗位） | 5 | admin, safety_manager | ✅ 已配置 |
| [hse-risk-control.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-risk-control.ts) | 安全风险管控 | 7 | admin | ✅ 已配置 |
| [hse-hazards.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-hazards.ts) | 隐患排查治理 | 8 | admin | ✅ 已配置 |
| [hse-violations.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-violations.ts) | 三违管理 | 6 | admin | ✅ 已配置 |
| [hse-training.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-training.ts) | 培训管理（10个子菜单） | 5 | admin | ✅ 已配置 |
| [hse-assessment-monthly.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-assessment-monthly.ts) | 月度安全履职考核（8个子菜单） | 20 | admin, hse_manager, township_manager | ✅ 已配置 |
| [hse-emergency.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-emergency.ts) | 应急管理 | 9 | admin | ✅ 已配置 |
| [hse-objectives.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-objectives.ts) | 目标职责管理（4个子菜单） | 3 | admin | ✅ 已配置 |
| [hse-documents.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-documents.ts) | 安全资料中心（2个子菜单） | 20 | admin | ✅ 已配置 |
| [hse-standard.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-standard.ts) | 标准化评价（3个子菜单） | 25 | admin, safety_manager | ✅ 已配置 |
| [hse-system.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-system.ts) | 系统管理（用户/角色） | 12 | admin | ✅ 已配置 |
| [hse-advanced.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-advanced.ts) | 高级分析（11个子菜单） | 15 | 多角色 | ✅ 已配置 |
| 其他8个hse-*.ts | （事故/保险/检查/批量导入等） | 各不同 | 各不同 | ✅ 已配置 |

### 3.2 生产目录菜单结构与目标10大菜单对比

| 目标10大菜单 | 生产目录现状 | 是否完成统一分组 |
|-------------|-------------|----------------|
| 1. 安全总览 | 分散在：告警中心(order=1)、高级分析/驾驶舱 | ❌ 未统一为"安全总览"分组 |
| 2. 风险管控 | 安全风险管控(order=7) + 高级分析/驾驶员风险 | ❌ 未统一分组 |
| 3. 隐患治理 | 隐患排查治理(order=8) | ⚠️ 独立存在，未归入"隐患治理"一级菜单 |
| 4. 现场管理 | 三违管理(order=6) + 检查管理 | ❌ 未建立"现场管理"一级菜单 |
| 5. 人员管理 | 人员主数据(order=5) + 人员档案 + 人员导入 | ❌ 未统一为"人员管理"一级菜单 |
| 6. 培训考核 | 培训管理(order=5) + 月度考核(order=20) + 考核分析 | ❌ 未统一为"培训考核"一级菜单 |
| 7. 应急管理 | 应急管理(order=9) | ✅ 独立存在 |
| 8. 目标职责 | 目标职责管理(order=3) | ✅ 独立存在 |
| 9. 制度标准 | 安全资料中心(order=20) + 标准化评价(order=25) | ❌ 未统一为"制度标准"一级菜单 |
| 10. 系统管理 | 系统管理(order=12) | ✅ 独立存在 |

**结论：生产目录的22个路由模块各自独立存在，order值分散，**未**按照10大菜单的信息架构进行统一分组重构。**

### 3.3 权限配置现状

| 检查项 | 生产目录状态 | 说明 |
|--------|-------------|------|
| 权限模式 | frontend（前端静态路由） | 在 [preferences.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/preferences.ts) 中配置 |
| 权限字段 | `meta.authority: string[]` | 符合Vben规范（数组类型） |
| 统一权限码 | ❌ 未使用 `hse:{module}:{sub}:{action}` 规范 | 各路由使用不同的角色名（admin, safety_manager, hse_manager等） |
| 角色定义 | ❌ 无统一的角色定义文件 | 分散在各路由的authority字段中 |
| 菜单权限来源 | 前端路由（accessRoutes） | 通过 [access.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/access.ts) 的 generateAccess 过滤 |

### 3.4 布局与主题现状

| 检查项 | 生产目录状态 | 说明 |
|--------|-------------|------|
| 布局组件 | Vben内置 BasicLayout | [layouts/basic.vue](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/layouts/basic.vue) |
| Logo/标题 | 使用Vben默认配置 | 未修改为"HSE安全管理系统" |
| 通知中心 | 已集成（Notification组件） | 在 basic.vue 中通过 Pinia store 驱动 |
| 主题配置 | 使用Vben默认主题 | 未做HSE专属定制 |
| 标签页标题 | 使用Vben默认机制 | 未统一为"HSE安全管理系统"后缀 |

---

## 四、生产目录（安全看板vben）真实状态全景

### 4.1 已完成的业务模块

生产目录已具备完整的HSE业务代码资产：

| 模块 | API文件数 | 页面文件数 | 完成度 |
|------|----------|-----------|--------|
| 人员管理（employee/import-v2/profile） | 4 | 8 | ✅ 90% |
| 培训管理（training） | 1 | 11 | ✅ 85% |
| 考核管理（assessment/assessment-monthly） | 3 | 19 | ✅ 90% |
| 隐患治理（hazards） | 1 | 1 | ⚠️ 50% |
| 三违管理（violations） | 1 | 1 | ⚠️ 50% |
| 风险管控（risk-control） | 1 | 1 | ⚠️ 40% |
| 应急管理（emergency） | 1 | 1 | ⚠️ 30% |
| 高级分析（advanced/驾驶舱/BI/AI/IoT） | 6 | 26 | ✅ 80% |
| 制度资料（documents/standard/regulations） | 3 | 7 | ⚠️ 60% |
| 系统管理（system/security） | 2 | 4 | ✅ 80% |
| **合计** | **23** | **79** | - |

### 4.2 缺失/待完善项

| 类别 | 缺失项 | 优先级 |
|------|--------|--------|
| 信息架构 | 10大菜单统一分组重构 | 🔴 P0 |
| 菜单命名 | 各模块菜单名称与目标规范对齐 | 🔴 P0 |
| 菜单排序 | order值统一规划（1~10对应10大菜单） | 🔴 P0 |
| Logo/标题 | HSE品牌定制（Logo、系统名称） | 🟡 P1 |
| 权限码 | 统一 `hse:{module}:{sub}:{action}` 规范 | 🟡 P1 |
| 标签页标题 | 统一后缀"HSE安全管理系统" | 🟢 P2 |
| 主题定制 | HSE专属主题色 | 🟢 P2 |

---

## 五、核心审计发现

### 5.1 关键问题：Sprint10-D-4-2-B 修改方向完全错误

| 项目 | 事实 |
|------|------|
| 生产系统 | `F:\deploy\hse-dashboard\安全看板vben`（Vben + AntD） |
| 实际修改目录 | `F:\deploy\hse-dashboard\src`（Element Plus 旧系统） |
| 两者是否一致 | ❌ **完全不一致** |
| Sprint10-D-4-2-B 对生产系统的影响 | ❌ **零影响**（修改未进入生产目录） |

### 5.2 两个项目的架构差异

| 维度 | 生产目录（安全看板vben） | 误修改目录（根目录src） |
|------|-------------------------|----------------------|
| UI框架 | Ant Design Vue（Vben内置） | Element Plus 2.7.6 |
| 路由机制 | 模块化自动加载（modules/*.ts） | 单一文件 routes.ts |
| 权限机制 | Vben access（frontend模式） | 自定义 permission store |
| 布局组件 | `@vben/layouts` BasicLayout | 自定义 LayoutSidebar.vue |
| 菜单配置 | 各路由文件 meta 定义 | 集中式 permission.ts |
| 目录结构 | `apps/web-antd/src/views/hse/` | `src/features/*/views/` |

### 5.3 生产目录的菜单重构尚未开始

- 22个HSE路由模块独立存在，order值分散（1~25）
- 未建立10大菜单的层级关系
- 未修改Logo、系统标题
- 未使用统一的HSE权限码规范

---

## 六、下一步建议

| 优先级 | 建议 | 说明 |
|--------|------|------|
| 🔴 P0 | **立即停止对根目录src/的所有修改** | 该目录是非生产系统，修改无效 |
| 🔴 P0 | **在生产目录（安全看板vben）中执行10大菜单重构** | 参考Sprint10-D-4-2-B的设计意图，但需按Vben架构规范实现 |
| 🔴 P0 | **明确唯一开发目标：安全看板vben** | 所有前端开发必须在 `apps/web-antd/src/` 下进行 |
| 🟡 P1 | **生产目录菜单重构方案** | 1. 创建/调整22个路由模块的order和meta，统一归入10大一级菜单；2. 修改preferences.ts中的app.name和Logo；3. 统一标签页标题 |
| 🟡 P1 | **评估根目录src/的有效代码迁移** | AlertNotification、权限码定义等是否需要在Vben架构中重新实现 |
| 🟢 P2 | **清理或归档非生产目录** | 明确标记根目录src/和安全管理系统/为归档，避免后续误修改 |
| 🟢 P2 | **建立Git仓库** | 生产目录目前也无Git版本控制，建议立即初始化 |

---

## 七、冻结声明补充

基于本次审计，对《Sprint10-D-4-3 前端架构基线冻结报告》补充如下：

1. **生产基线目录修正**：唯一生产前端基线为 `F:\deploy\hse-dashboard\安全看板vben\apps\web-antd\src\`
2. **非生产目录冻结**：`F:\deploy\hse-dashboard\src\` 和 `F:\deploy\hse-dashboard\安全管理系统\` 标记为归档目录，禁止任何HSE业务开发
3. **菜单重构范围**：10大菜单的信息架构重构需在生产基线目录中重新执行，当前根目录的修改不视为有效交付
4. **后续开发约束**：所有Sprint10-D及后续阶段的前端开发，必须在 `安全看板vben/apps/web-antd/src/` 下进行，遵循Vben Admin架构规范

---

**报告结束**

审计人：系统自动审计  
审计时间：2026-07-24

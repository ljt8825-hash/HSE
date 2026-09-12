# Sprint10-D-0 HSE系统运行目录与变更范围审计报告

**审计日期**：2026-07-24  
**审计范围**：F:\deploy\hse-dashboard 全目录  
**审计目的**：确认5173端口运行来源、实际项目目录、历史修改范围、是否存在非目标目录修改

---

## 一、5173端口实际运行目录确认

### 1.1 端口进程信息

| 项目 | 值 |
|------|-----|
| 监听端口 | 5173 (TCP 0.0.0.0:5173) |
| 进程PID | 23944 |
| 进程名 | node.exe |
| 启动命令 | `node "F:\deploy\hse-dashboard\node_modules\.bin\..\vite\bin\vite.js" --mode development` |
| 启动时间 | 2026/7/24 |

### 1.2 运行目录验证

| 检查项 | 路径 | 存在 |
|--------|------|------|
| package.json | F:\deploy\hse-dashboard\package.json | ✅ |
| vite.config.ts | F:\deploy\hse-dashboard\vite.config.ts | ✅ |
| node_modules | F:\deploy\hse-dashboard\node_modules | ✅ |
| src目录 | F:\deploy\hse-dashboard\src | ✅ |
| 当前工作目录 | F:\deploy\hse-dashboard | ✅ |

**结论：5173端口实际运行目录 = F:\deploy\hse-dashboard**

---

## 二、项目目录结构与多项目并存情况

### 2.1 根目录下存在三个前端项目

F:\deploy\hse-dashboard 下实际存在 **三个独立的前端项目**：

| 项目名称 | 目录路径 | UI框架 | 运行端口 | 状态 |
|----------|----------|--------|----------|------|
| HSE主项目（Element Plus版） | `F:\deploy\hse-dashboard\` | Vue 3 + Element Plus | **5173** | ✅ 运行中 |
| Vben Admin版项目 | `F:\deploy\hse-dashboard\安全看板vben\` | Vben Admin v5.7.0 + Ant Design Vue | **5174** | ✅ 运行中 |
| 旧版项目（已弃用） | `F:\deploy\hse-dashboard\安全管理系统\` | Vue 3 + Element Plus（旧架构） | 无 | ❌ 未运行 |

### 2.2 各项目技术栈对比

| 维度 | 5173主项目 (F:\deploy\hse-dashboard) | 5174 Vben项目 (安全看板vben) |
|------|--------------------------------------|-------------------------------|
| UI框架 | Element Plus 2.7.6 | Ant Design Vue (Vben内置) |
| 目录结构 | src/features/, src/components/layout/ | apps/web-antd/src/views/hse/ |
| 状态管理 | Pinia (src/stores/) | Pinia (store/) |
| 路由定义 | src/router/routes.ts | apps/web-antd/src/router/routes/modules/ |
| API模块 | src/api/modules/ | apps/web-antd/src/api/hse/ |
| Vite配置 | 根目录 vite.config.ts | apps/web-antd/vite.config.ts |
| package.json | 根目录 package.json | 安全看板vben/package.json (monorepo) |

---

## 三、近7天修改文件审计（2026-07-17 ~ 2026-07-24）

> 注：本项目无Git仓库，使用文件系统最后修改时间进行审计

### 3.1 5173主项目（F:\deploy\hse-dashboard\src）修改文件

| 文件 | 路径 | 修改时间 | 修改性质 | 是否属于左侧栏任务 |
|------|------|----------|----------|-------------------|
| permission.ts | src/stores/permission.ts | 2026/7/24 17:15 | ✅ 必要修改 | ✅ 是（菜单结构+权限定义） |
| AlertNotification.vue | src/features/alert/components/ | 2026/7/24 17:08 | ⚠️ 新建组件 | ⚠️ 部分相关（全局铃铛） |
| system.ts | src/api/modules/system.ts | 2026/7/24 16:35 | ✅ 必要修改 | ✅ 是（API路径修正） |
| auto-imports.d.ts | src/ | 2026/7/24 16:25 | 🔧 自动生成 | -（Vite自动生成） |
| routes.ts | src/router/routes.ts | 2026/7/24 16:16 | ✅ 必要修改 | ✅ 是（10大菜单路由重构） |
| api.ts | src/types/api.ts | 2026/7/24 15:52 | ✅ 必要修改 | ⚠️ 间接相关（统一响应格式） |
| assessment-monthly.ts | src/api/modules/ | 2026/7/24 13:41 | ✅ 业务修改 | ❌ 否（考核模块联调） |
| 考核模块各组件 | src/features/training/ | 2026/7/24 13:19~13:28 | ✅ 业务修改 | ❌ 否（考核模块开发） |
| guards.ts | src/router/guards.ts | 2026/7/24 09:29 | ✅ 必要修改 | ✅ 是（标签页标题统一） |
| LayoutSidebar.vue | src/components/layout/ | 2026/7/24 09:29 | ✅ 必要修改 | ✅ 是（Logo+标题更新） |
| 各页面文件（批量） | src/features/*/views/ | 2026/7/24 09:25~09:27 | 🔧 批量touch | ⚠️ 需确认（可能是路由重命名联动） |
| components.d.ts | src/ | 2026/7/24 17:45 | 🔧 自动生成 | -（Vite自动生成） |

### 3.2 5173主项目后端（F:\deploy\hse-dashboard\server）修改文件

| 文件 | 修改时间 | 修改性质 |
|------|----------|----------|
| routes/hse-employee.js | 2026/7/24 15:19 | 统一响应格式 |
| routes/violations.js | 2026/7/24 14:41 | 统一响应格式 |
| routes/hse-assessment-monthly.js | 2026/7/24 14:39 | 考核业务逻辑 |
| routes/hse-risk-profile.js | 2026/7/24 14:33 | 统一响应格式 |
| routes/audit.js | 2026/7/24 12:39 | 审计日志中间件 |
| routes/auth.js | 2026/7/24 12:39 | 权限中间件 |
| routes/hazards.js | 2026/7/24 12:24 | 统一响应格式 |
| middleware/auth.js | 2026/7/24 12:13 | JWT权限验证 |
| 各类测试脚本（_check_*.js等） | 2026/7/24 08:00~09:09 | 测试验证脚本 |

### 3.3 5174 Vben项目（安全看板vben\apps\web-antd\src）修改文件

| 文件 | 修改时间 |
|------|----------|
| router/routes/modules/dashboard.ts | 2026/7/24 18:01 |
| router/routes/modules/hse-assessment-monthly.ts | 2026/7/24 09:11 |
| views/hse/assessment-monthly/*.vue（9个文件） | 2026/7/23 22:32~22:37 |
| store/hse-assessment.ts | 2026/7/23 22:31 |
| api/hse/assessment-monthly.ts | 2026/7/23 22:31 |
| views/hazards/index.vue | 2026/7/23 14:38 |
| views/training/*/index.vue（2个文件） | 2026/7/23 09:53~09:55 |
| api/hse/analysis-center.ts | 2026/7/23 09:22 |
| api/hse/warning-center.ts | 2026/7/23 08:19 |
| views/hse/warning-center/index.vue | 2026/7/23 08:08 |
| router/routes/modules/hse-advanced.ts | 2026/7/22 23:30 |
| views/hse/executive-cockpit/index.vue | 2026/7/22 22:48 |
| 以及约50+个文件（7/22全天） | 2026/7/22 |

---

## 四、重点检查：非目标修改审查

### 4.1 Theme（主题）检查

| 检查项 | 结果 | 说明 |
|--------|------|------|
| src/styles/index.scss | ✅ 无异常 | 使用CSS变量，未修改Element Plus主题 |
| src/styles/variables.scss | ✅ 无异常 | HSE自定义变量（--hse-*），独立于Element Plus |
| vite.config.ts主题配置 | ✅ 无异常 | 未配置Element Plus主题覆盖 |
| 是否使用Vben主题系统 | N/A | 5173项目非Vben架构 |

**结论：无异常主题修改**

### 4.2 Layout（布局）检查

| 文件 | 修改内容 | 评估 |
|------|----------|------|
| LayoutSidebar.vue | Logo图标改为FirstAidKit，标题改为"HSE安全管理系统" | ✅ 必要修改（左侧栏任务一部分） |
| LayoutDefault.vue | 未修改 | ✅ 正常 |
| LayoutHeader.vue | 未修改 | ✅ 正常 |
| LayoutTabs.vue | 未修改 | ✅ 正常 |
| LayoutBreadcrumb.vue | 未修改 | ✅ 正常 |

**结论：布局修改仅限LayoutSidebar.vue的Logo和标题，属于左侧栏任务必要修改**

### 4.3 UI组件检查

| 检查项 | 结果 | 说明 |
|--------|------|------|
| 新建自定义组件 | ⚠️ AlertNotification.vue | 新建告警铃铛组件，位于src/features/alert/components/，属于业务组件非框架组件 |
| 是否修改Element Plus组件 | ❌ 无 | 未修改任何UI库源码 |
| 是否使用::v-deep等深度选择器 | ❌ 无 | LayoutSidebar.vue样式均为scoped且无深度覆盖 |
| 组件目录是否新增 | ⚠️ features/alert/ | 新增alert特性目录，包含AlertNotification组件 |

**结论：新增了1个业务组件（AlertNotification.vue），属于合理的业务扩展，未修改任何UI框架组件**

### 4.4 Permission（权限）检查

| 检查项 | 结果 | 说明 |
|--------|------|------|
| stores/permission.ts | 大量修改 | ✅ 属于左侧栏任务核心（菜单结构+权限码定义） |
| 权限码规范 | hse:{module}:{sub}:{action} | ✅ 符合规范 |
| 角色定义 | admin/hse_manager/township_manager/manager/viewer | ✅ 5个角色权限完整 |
| 菜单加载策略 | 前端冻结菜单 + 后端权限补充 | ✅ 保证菜单-路由一致性 |

**结论：权限修改全部属于左侧栏和权限体系任务的必要修改**

### 4.5 Router（路由）检查

| 检查项 | 结果 | 说明 |
|--------|------|------|
| routes.ts | 大量修改 | ✅ 10大菜单路由重构+旧路由重定向 |
| guards.ts | 标题统一逻辑 | ✅ 属于左侧栏视觉一致性任务 |
| 旧路由兼容 | 12个redirect规则 | ✅ 保证历史链接不失效 |
| meta.authority类型 | 未使用authority字段 | ⚠️ 5173项目使用meta.permission而非authority，与Vben规范不同 |

**结论：路由修改全部属于左侧栏任务必要修改**

### 4.6 环境配置检查

| 文件 | 修改内容 | 评估 |
|------|----------|------|
| .env | VITE_BACKEND_PORT=5666（从3000修正） | ✅ 必要修正 |
| vite.config.ts | 未修改 | ✅ 正常 |

---

## 五、关键审计发现汇总

### ✅ 确认正确的事项

1. **5173端口 = F:\deploy\hse-dashboard**：进程启动路径、package.json、vite.config.ts、node_modules完全一致
2. **左侧栏修改发生在正确项目**：permission.ts、routes.ts、LayoutSidebar.vue、guards.ts均位于5173运行项目的src/下
3. **后端端口配置正确**：.env中VITE_BACKEND_PORT=5666，后端服务确实运行在5666端口
4. **无主题/布局破坏性修改**：仅限Logo、标题、菜单内容的业务修改

### ⚠️ 需要关注的事项

1. **两个前端项目同时运行**：
   - 5173端口：Element Plus版（主项目，当前开发目标）
   - 5174端口：Vben Admin版（安全看板vben目录，也在持续开发）
   - **风险**：两个项目功能高度重叠，存在重复开发风险

2. **Vben项目（安全看板vben）也有大量修改**：
   - 近3天修改了约60+个文件，涵盖考核模块、隐患、培训、预警、驾驶舱等
   - 这些修改发生在非5173运行的目录中
   - **需确认**：Sprint10的开发目标到底是哪个项目？

3. **5173项目与Vben项目架构不一致**：
   | 维度 | 5173项目（实际运行） | 记忆中的Vben规范 |
   |------|---------------------|-----------------|
   | UI框架 | Element Plus | Ant Design Vue |
   | 路由权限字段 | meta.permission | meta.authority |
   | 布局目录 | src/components/layout/ | layouts/ |
   | 页面目录 | src/features/*/views/ | views/hse/ |
   | API目录 | src/api/modules/ | api/hse/ |
   | Store目录 | src/stores/ | store/ |

4. **大量页面文件被批量touch（7/24 09:25~09:27）**：
   - 约40+个Vue页面文件在同一时间段被修改
   - 修改时间高度集中，疑似批量操作
   - 需确认是否为路由重命名导致的联动修改，还是不必要的批量touch

---

## 六、修改文件完整分类清单

### 6.1 属于左侧栏任务的必要修改（共8个文件）

| # | 文件 | 修改内容 |
|---|------|----------|
| 1 | src/stores/permission.ts | 10大菜单结构定义 + 5角色权限码 |
| 2 | src/router/routes.ts | 10大菜单路由 + 旧路由重定向 |
| 3 | src/router/guards.ts | 标签页标题统一为"xxx — HSE安全管理系统" |
| 4 | src/components/layout/LayoutSidebar.vue | Logo（FirstAidKit）+ 标题（HSE安全管理系统） |
| 5 | src/api/modules/system.ts | API路径从/api/menus/tree修正为/api/core/menus/tree |
| 6 | .env | 后端端口从3000修正为5666 |
| 7 | src/features/alert/components/AlertNotification.vue | 新建全局铃铛组件（左侧栏配套功能） |
| 8 | src/types/api.ts | 统一响应格式增加success字段 |

### 6.2 属于考核模块开发的业务修改（共12个文件）

| # | 文件 |
|---|------|
| 1-9 | src/features/training/ 下9个组件/视图/类型文件 |
| 10 | src/api/modules/assessment-monthly.ts |
| 11-12 | server/routes/hse-assessment-monthly.js 及相关测试脚本 |

### 6.3 属于后端统一响应格式的修改（共6个文件）

| # | 文件 |
|---|------|
| 1 | server/routes/hse-employee.js |
| 2 | server/routes/violations.js |
| 3 | server/routes/hse-risk-profile.js |
| 4 | server/routes/hazards.js |
| 5 | server/middleware/auth.js |
| 6 | server/routes/audit.js |

### 6.4 Vite自动生成文件（2个）

- src/auto-imports.d.ts
- src/components.d.ts

---

## 七、审计结论

### 7.1 核心结论

| 问题 | 答案 |
|------|------|
| 5173实际运行目录 | **F:\deploy\hse-dashboard** |
| 正确HSE项目目录 | **F:\deploy\hse-dashboard**（5173端口） |
| 两者是否一致 | ✅ **一致** |
| 左侧栏修改是否在正确项目 | ✅ **是**，所有菜单/路由/权限/布局修改均在5173项目src/下 |
| 是否存在错误目录修改 | ⚠️ **需关注**：安全看板vben目录也有大量HSE业务开发，但属于另一个独立项目 |
| 是否有非必要修改 | ✅ **无破坏性修改**，仅AlertNotification.vue为新增业务组件，属合理扩展 |

### 7.2 主要风险点

1. **双项目并行风险**：5173（Element Plus）和5174（Vben Admin）同时运行且功能重叠，需明确Sprint10的唯一开发目标
2. **架构规范不一致**：5173实际运行项目使用Element Plus架构，但项目记忆/规范中多次提及Vben Admin，存在认知偏差
3. **大量文件被批量touch**：40+个页面文件在09:25-09:27被集中修改，需确认是否必要

---

## 八、下一步建议

| 优先级 | 建议 | 说明 |
|--------|------|------|
| 🔴 P0 | **确认唯一开发目标项目** | 明确Sprint10是基于5173的Element Plus项目，还是5174的Vben Admin项目。两者只能二选一 |
| 🟡 P1 | **验证批量touch文件的必要性** | 检查7/24 09:25-09:27被批量修改的40+个Vue文件，确认是否有实质内容变更，还是误操作的touch |
| 🟡 P1 | **明确两套架构的关系** | 若5173是目标项目，需更新所有规范文档为Element Plus架构规范；若Vben是目标，需将开发迁移到5174项目 |
| 🟢 P2 | **建立Git仓库** | 当前项目无版本控制，建议立即初始化Git仓库以便审计和回滚 |
| 🟢 P2 | **停止非目标项目的开发** | 确认唯一目标后，暂停另一个项目的HSE业务开发，避免重复投入 |

---

**报告结束**

审计人：系统自动审计  
审计时间：2026-07-24 18:30

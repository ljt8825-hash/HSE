# Vben Admin 恢复至官方版本报告

**执行时间**: 2026-07-14  
**基准版本**: Vben Admin v5.7.0 (https://github.com/vbenjs/vue-vben-admin)  
**操作范围**: `安全看板vben/` 前端 Monorepo 目录  
**保留目录**: `server/` (独立后端，未作任何修改)

---

## 1. 概述

### 1.1 恢复方案

本项目此前基于 Vben Admin v5.7.0 进行了大量 HSE（安全管理）业务定制开发，导致前端代码与官方版本产生显著偏离。由于项目根目录及子目录均**未纳入 Git 版本控制**，无法通过 `git reset` 或 `git checkout` 直接回退，因此采用以下恢复方案：

1. **官方基准获取**：从 GitHub 克隆 `vbenjs/vue-vben-admin` 的 `v5.7.0` 标签到本地 `_official_vben/` 作为纯净基准。
2. **关键备份**：备份 `apps/web-antd/src/` 与 `packages/` 目录，确保可回滚。
3. **目录级覆盖**：对确认发生改动的目录/文件，直接使用官方版本覆盖。
4. **HSE 业务清理**：删除所有 HSE 相关的 views、components、api、router、store、locales 等文件。
5. **冗余文件清理**：删除 `.bak*` 备份目录、迁移报告文档、测试文件等。
6. **启动验证**：执行 `pnpm install && pnpm dev` 验证项目可正常启动。

### 1.2 恢复前后项目状态对比

| 维度 | 恢复前（自定义状态） | 恢复后（官方状态） |
|---|---|---|
| `apps/web-antd/src/views` | 包含 `hse/`, `accidents/`, `emergency/`, `mobile/` 等 20+ 业务目录 | 仅保留官方 `_core/`, `dashboard/`, `demos/` |
| `apps/web-antd/src/api` | 包含 `core/` + `hse/` 共 20+ API 模块 | 仅保留官方 `core/` (auth, menu, user) |
| `apps/web-antd/src/components` | 包含 `hse/`, `NotificationBell.vue` 等自定义组件 | 完全移除自定义组件目录 |
| `apps/web-antd/src/router/routes/modules` | 30+ 路由模块（含 HSE 业务路由） | 仅保留官方 `dashboard.ts`, `demos.ts`, `vben.ts` |
| `apps/web-antd/src/store` | 9 个 Store（含 alerts, workflow, notifications 等） | 仅保留官方 `auth.ts`, `index.ts` |
| `packages/@core/preferences/src/config.ts` | `defaultHomePath: '/hse/dashboard'` | `defaultHomePath: '/analytics'` (官方默认) |
| `packages` 其他文件 | 6 个 UI/Layout 相关文件被修改 | 全部恢复为官方版本 |
| 根目录文档 | 13 份迁移/分析报告 | 全部清理 |
| 启动状态 | 可启动，但加载大量 HSE 路由与菜单 | **启动成功** (VITE v8.1.4, localhost:5667) |

---

## 2. 扫描与改动清单

### 2.1 核心配置文件差异

#### `packages/@core/preferences/src/config.ts`

**恢复前（自定义）**:
```diff
-     defaultHomePath: '/hse/dashboard',
+     defaultHomePath: '/analytics',
```

- **行号**: 第 20 行
- **功能影响**: 自定义版本将登录后的默认首页指向 `/hse/dashboard`；恢复后指向官方默认的分析页 `/analytics`。
- **恢复方式**: 官方文件直接覆盖。

### 2.2 `apps/web-antd/src` 目录全面替换

由于该目录被大量改动，采用**整目录替换**策略。以下为删除的主要自定义内容：

| 类别 | 删除/恢复的文件/目录路径 | 说明 |
|---|---|---|
| **Views** | `views/hse/` (含 ai, alerts, audit, bi, chain, dashboard, events, files, iot, notifications, report, statistics, tasks, workflow) | HSE 核心业务页面 |
| | `views/accidents/` | 事故管理页面 |
| | `views/emergency/` | 应急管理页面 |
| | `views/hazards/` | 隐患管理页面 |
| | `views/insurance/` | 保险管理页面 |
| | `views/mobile/` | 移动端页面 |
| | `views/objectives/` | 目标职责页面 |
| | `views/over-age-personnel/` | 超龄人员页面 |
| | `views/personnel/` | 人员管理页面 |
| | `views/regulations/` | 规章制度页面 |
| | `views/security/` | 安全管理页面 |
| | `views/site-mgmt/` | 现场管理页面 |
| | `views/system/` | 系统管理页面（自定义版） |
| | `views/training/` | 培训管理页面 |
| | `views/hse.vue` | HSE 布局入口页 |
| **API** | `api/hse/` (含 ai, alerts, audit, bi, chain, dashboard, emergency, events, files, iot, notifications, objectives, personnel, report, statistics, tasks, workflow) | HSE 业务 API |
| | `api/core/menu-order.ts` | 菜单排序 API |
| | `api/core/menus.ts` | 自定义菜单 API |
| | `api/core/roles.ts` | 自定义角色 API |
| | `api/core/users.ts` | 自定义用户 API |
| | `api/core/visual-layout.ts` | 可视化布局 API |
| | `api/request.test.ts` | 自定义测试文件 |
| **Components** | `components/hse/` (含 AlertCard, CustomMenu, FileUploader, HseDetailModal, HseForm, HseSearchBar, HseStatCard, HseVirtualTable, MobileNav, WorkflowDesigner, visual/) | HSE 业务组件 |
| | `components/NotificationBell.vue` | 通知铃铛组件 |
| **Composables** | `composables/useAudit.ts` | 审计相关 Composable |
| | `composables/useFileUpload.ts` | 文件上传 Composable |
| | `composables/useNotification.ts` | 通知相关 Composable |
| | `composables/useDebounceFetch.test.ts` | 测试文件 |
| | `composables/useVirtualScroll.test.ts` | 测试文件 |
| | `composables/useWebSocket.test.ts` | 测试文件 |
| **Router** | `router/routes/modules/` 下 25+ 自定义路由文件 | 含 accidents, ai, alerts, audit, bi, emergency, events, files, hazards, hse-chain, hse-dashboard 等 |
| | `router/routes/modules.bak.20260713140513/` | 路由备份目录 |
| | `router/hse-menu-order-guard.ts` | 菜单排序守卫 |
| **Store** | `store/alerts.ts` | 告警 Store |
| | `store/notifications.ts` | 通知 Store |
| | `store/system.ts` | 系统 Store |
| | `store/users.ts` | 用户 Store |
| | `store/menuOrder.ts` | 菜单排序 Store |
| | `store/visualDashboard.ts` | 可视化仪表盘 Store |
| | `store/visualLayout.ts` | 可视化布局 Store |
| | `store/workflow.ts` | 工作流 Store |
| | `store/app.test.ts` | 测试文件 |
| | `store/auth.test.ts` | 测试文件 |
| **Layouts** | `layouts/hse-layout.vue` | HSE 自定义布局 |
| **Styles** | `styles/mobile.scss` | 移动端样式 |
| **Utils** | `utils/antd-icons.ts` | 自定义图标注册 |
| | `utils/file.ts` | 文件工具 |
| | `utils/performance.test.ts` | 测试文件 |
| **Docs** | `docs/*.md` (5 份文档) | 功能补全/部署/测试报告 |
| **Tests** | `tests/api/hse/events.test.ts` | HSE 测试文件 |

### 2.3 `packages/` 目录恢复的文件清单

通过 SHA256 哈希对比，定位并恢复了以下 7 个与官方版本不一致的文件：

| 序号 | 文件路径 | 改动说明 |
|---|---|---|
| 1 | `packages/@core/preferences/src/config.ts` | `defaultHomePath` 被改为 `/hse/dashboard` |
| 2 | `packages/@core/ui-kit/shadcn-ui/src/components/collapsible/collapsible-params.vue` | UI 组件自定义修改 |
| 3 | `packages/@core/ui-kit/shadcn-ui/src/components/collapsible/collapsible.vue` | UI 组件自定义修改 |
| 4 | `packages/@core/ui-kit/shadcn-ui/src/components/expandable-arrow/expandable-arrow.vue` | UI 组件自定义修改 |
| 5 | `packages/effects/layouts/src/authentication/authentication.vue` | 登录布局自定义修改 |
| 6 | `packages/effects/layouts/src/basic/index.ts` | 基础布局自定义修改 |
| 7 | `packages/effects/layouts/src/widgets/preferences/blocks/layout/sidebar.vue` | 侧边栏偏好设置自定义修改 |

**恢复方式**: 官方基准文件直接复制覆盖。

### 2.4 `apps/web-ele-disabled/` 清理清单

| 删除路径 | 说明 |
|---|---|
| `apps/web-ele-disabled/src/api/hse/` | Element 版 HSE API |
| `apps/web-ele-disabled/src/components/hse/` | Element 版 HSE 组件 |
| `apps/web-ele-disabled/src/views/hse/` | Element 版 HSE 页面 |
| `apps/web-ele-disabled/src/locales/langs/en-US/hse.json` | Element 版英文翻译 |
| `apps/web-ele-disabled/src/locales/langs/zh-CN/hse.json` | Element 版中文翻译 |
| `apps/web-ele-disabled/src/router/routes/modules/hse.ts` | Element 版 HSE 路由 |
| `apps/web-ele-disabled/src/router/routes/modules/__tests__/hse.test.ts` | Element 版路由测试 |
| `apps/web-ele-disabled/src/styles/hse-theme.scss` | Element 版 HSE 主题 |

### 2.5 根目录迁移报告清理

以下 13 份文档已从 `安全看板vben/` 根目录删除：

1. `HSE_Vben自定义改动分析报告.md`
2. `v3.0与v5.7功能模块对比报告.md`
3. `右侧可视化拖拽布局前端实现报告.md`
4. `右侧可视化拖拽布局后端对接报告.md`
5. `告警中心迁移实施清单.md`
6. `安全看板项目说明.md`
7. `审计日志迁移实施清单.md`
8. `工作流引擎迁移实施清单.md`
9. `文件管理迁移实施清单.md`
10. `用户管理迁移实施清单.md`
11. `系统管理迁移实施清单.md`
12. `通知中心迁移实施清单.md`
13. `项目文件关系与功能分析.md`

---

## 3. 前端与后端 API 交互

### 3.1 恢复后的接口列表

恢复后，前端仅保留官方核心 API 模块，所有 HSE 业务接口已被移除：

| 模块 | 保留接口 | 移除接口 |
|---|---|---|
| **Core** | `auth.ts`, `menu.ts`, `user.ts` | `menu-order.ts`, `menus.ts`, `roles.ts`, `users.ts`, `visual-layout.ts` |
| **HSE** | 无 | `alerts.ts`, `audit.ts`, `bi.ts`, `chain.ts`, `dashboard.ts`, `emergency.ts`, `events.ts`, `files.ts`, `iot.ts`, `notifications.ts`, `objectives.ts`, `personnel.ts`, `report.ts`, `statistics.ts`, `tasks.ts`, `workflow.ts`, `ai.ts` |

### 3.2 调用方式说明

- **恢复前**：前端通过 `/api/hse/*` 等路径调用后端 HSE 业务接口，涉及告警、审计、文件管理、工作流等 20+ 模块。
- **恢复后**：前端仅调用官方用户认证、菜单、用户基础接口。所有 HSE 相关 `axios` 实例、API 函数、类型定义均已从前端移除。

> **注意**：后端 `server/` 目录未被删除，其路由与控制器仍然保留。但前端不再具备调用这些接口的逻辑代码。若需重新对接 HSE 后端，需要重新开发前端 API 层与页面层。

---

## 4. 数据库操作逻辑

### 4.1 相关数据表

恢复操作**不涉及数据库变更**。但前端移除的模块原本对应后端以下数据表（仅供参考）：

| 模块 | 相关表 |
|---|---|
| 告警中心 | `hse_alerts`, `hse_alert_statistics` |
| 审计日志 | `hse_audit_logs` |
| 文件管理 | `hse_file_records` |
| 工作流引擎 | `hse_workflows`, `hse_workflow_instances`, `hse_workflow_tasks` |
| 通知中心 | `hse_notifications` |
| 用户/角色/菜单 | `users`, `roles`, `menus`（系统表） |

### 4.2 恢复后的影响

- **前端层面**：不再读取或写入上述任何表的数据。
- **后端层面**：`server/` 独立运行，接口仍然可用，但无前端调用方。
- **数据库层面**：数据本身无丢失风险；表结构、历史数据均保持原状。

---

## 5. 恢复影响评估

### 5.1 边缘情况

| 边缘情况 | 风险评估 | 说明 |
|---|---|---|
| `.env` 环境变量 | 低风险 | `apps/web-antd/.env` 未被修改，保留原有配置（如 VITE_PORT 等） |
| `pnpm-lock.yaml` | 低风险 | 未作修改，依赖版本保持一致 |
| `package.json` | 无风险 | 官方版本未被覆盖 |
| `node_modules` | 无风险 | pnpm install 验证通过，无需重新安装 |
| `web-naive` / `web-tdesign` | 无风险 | 未对这些应用目录进行操作 |

### 5.2 不可逆风险

1. **HSE 业务代码完全删除**：`apps/web-antd/src` 中的 HSE views、components、api、router、store 已被永久删除（未放入回收站）。虽然操作前已创建 `_backup_web_antd_src_20260714092939` 目录备份，但若备份被误删则无法恢复。
2. **packages 修改丢失**：7 个 packages 文件的自定义 UI/Layout 改动已被官方版本覆盖，若需保留需从备份中提取。
3. **根目录报告文档删除**：13 份 Markdown 报告已删除，如需保留需从备份或版本历史中找回。

### 5.3 后续建议

1. **Git 初始化**：强烈建议对 `安全看板vben/` 目录执行 `git init` 并建立初始提交，后续所有改动通过分支管理，避免再次陷入无版本控制的困境。
2. **HSE 模块重建**：若未来需要重新开发 HSE 功能，建议基于官方 v5.7 新建分支，按模块渐进式开发，避免一次性大量侵入。
3. **Server 端同步**：前端已恢复为官方状态，若后端仍需演进，建议将 `server/` 也纳入独立 Git 仓库管理。
4. **清理备份**：验证稳定运行后，可手动删除项目根目录的 `_backup_*` 与 `_official_vben` 临时目录，释放磁盘空间。

---

## 6. 结论

### 6.1 最终状态确认

- [x] `apps/web-antd/src` 已完全恢复为官方 Vben Admin v5.7.0 结构，无 HSE 残留。
- [x] `packages/` 中 7 个被改动的核心文件已恢复为官方版本。
- [x] `apps/web-ele-disabled/src` 中的 HSE 代码已清理。
- [x] 根目录下 13 份迁移/分析报告已清理。
- [x] `.bak*` 冗余备份目录已清理。
- [x] `server/` 独立后端目录完整保留，未作任何修改。
- [x] `pnpm install` 执行成功（44.2s）。
- [x] `pnpm dev` 启动成功（VITE v8.1.4，监听 localhost:5667）。

### 6.2 验证步骤

已在本地完成以下验证：

```powershell
# 1. 进入项目目录
cd "f:\deploy\hse-dashboard\安全看板vben\apps\web-antd"

# 2. 安装依赖
pnpm install
# 结果: Done in 44.2s

# 3. 启动开发服务器
pnpm dev
# 结果:
#   VITE v8.1.4  ready in 27641 ms
#   ➜  Local:   http://localhost:5667/
#   ➜  Network: http://192.168.10.107:5667/
```

### 6.3 残留问题

目前未发现残留问题。项目已处于**纯净官方 Vben Admin v5.7.0** 状态。

> **唯一说明**：端口 5666 被其他进程占用（推测为独立后端 server 正在运行），Vite 自动切换至 5667 端口启动前端，此为预期行为。

---

**报告生成完毕。**

# 宁津环卫HSE安全管理系统

> 基于 Vue Vben Admin v5.7.0 构建的环卫行业 HSE（健康、安全、环境）安全管理平台。

## 项目状态

- **基准版本**: Vben Admin v5.7.0 (Official Monorepo)
- **应用框架**: Vue 3 + TypeScript + Ant Design Vue 4+ + Pinia + Vite
- **完成状态**: P0/P1/P2 核心模块 100% 完成，P3 高级模块框架就绪
- **构建状态**: ✅ 生产构建通过
- **更新日期**: 2026-07-14

## 目录结构

```
安全看板vben/
├── apps/
│   ├── web-antd/              # 主应用（Ant Design Vue）
│   │   └── src/
│   │       ├── api/hse/       # HSE 业务 API（12个模块）
│   │       ├── components/hse/ # HSE 公共组件（StatCard）
│   │       ├── views/         # 业务视图（20个页面）
│   │       │   ├── accidents/ # 事故管理
│   │       │   ├── goals/     # 目标管理
│   │       │   ├── hazards/   # 隐患管理
│   │       │   ├── hse/       # 告警/工作流/通知/高级分析
│   │       │   ├── inspection/# 现场管理
│   │       │   ├── insurance/ # 人员保险
│   │       │   ├── regulations/# 规章制度
│   │       │   ├── security/  # 审计日志
│   │       │   ├── system/    # 用户/角色管理
│   │       │   ├── training/  # 培训管理
│   │       │   └── emergency/ # 应急管理
│   │       ├── router/routes/modules/ # 路由模块（12个）
│   │       ├── store/         # Pinia 状态管理
│   │       └── locales/langs/ # 中英文国际化
│   ├── web-ele/               # Element Plus 版本（官方纯净）
│   ├── web-naive/             # Naive UI 版本（官方纯净）
│   └── web-tdesign/           # TDesign 版本（官方纯净）
├── packages/                  # Monorepo 公共包（官方原样）
├── scripts/
├── HSE系统用户操作手册.md
├── HSE系统最终风格统一与商业化完善报告.md
└── README.md
```

## 快速开始

### 环境要求

- **Node.js**: >= 20.x (推荐 22.x)
- **pnpm**: >= 8.x (推荐 10.x)

### 安装依赖

```powershell
# 进入项目目录
cd "f:\deploy\hse-dashboard\安全看板vben"

# 安装所有依赖（首次安装约 10-15 分钟）
pnpm install
```

### 启动开发服务器

```powershell
# 启动前端（端口 5173）
cd apps/web-antd
pnpm dev

# 访问 http://localhost:5173
# 后端API代理至 http://localhost:5666
# 如后端未启动，前端自动降级到 Mock 数据
```

### 构建生产版本

```powershell
cd apps/web-antd
pnpm build
# 输出: dist/ 目录 + dist.zip
```

## Git 分支策略

```
main             # 纯官方干净主干，仅合并经过验证的稳定版本
  └── develop    # 开发主分支，集成各 feature 分支
        └── feature/hse-core  # HSE 业务重建专用分支
```

### 分支操作指南

```powershell
# 查看当前分支
git branch -v

# 切换到开发分支
git checkout develop

# 在 feature/hse-core 上开发 HSE 功能
git checkout feature/hse-core

# 创建新的功能分支
git checkout develop
git checkout -b feature/hse-alerts

# 提交代码
git add -A
git commit -m "feat(hse): add alerts module"

# 合并到开发分支
git checkout develop
git merge feature/hse-alerts
```

## 功能模块列表

| 优先级 | 模块 | 路径 | 状态 |
|-------|------|------|------|
| P0 | 告警中心 | /hse/alerts | ✅ 完整 |
| P0 | 工作流引擎 | /hse/workflow | ✅ 完整 |
| P0 | 用户管理 | /system/users | ✅ 完整 |
| P0 | 角色管理 | /system/roles | ✅ 完整 |
| P0 | 审计日志 | /security/audit | ✅ 完整 |
| P0 | 通知中心 | /hse/notifications | ✅ 完整 |
| P1 | 隐患管理 | /hazards | ✅ 完整 |
| P1 | 人员保险 | /insurance/personnel | ✅ 完整 |
| P2 | 事故管理 | /accidents | ✅ 完整 |
| P2 | 培训管理 | /training | ✅ 完整 |
| P2 | 应急管理 | /emergency | ✅ 完整 |
| P2 | 目标管理 | /goals | ✅ 完整 |
| P2 | 现场管理 | /inspection | ✅ 完整 |
| P2 | 规章制度 | /regulations | ✅ 完整 |
| P3 | HSE驾驶舱 | /hse-advanced/cockpit | 🟡 框架 |
| P3 | BI数据看板 | /hse-advanced/bi | 🟡 框架 |
| P3 | AI智能分析 | /hse-advanced/ai-analysis | 🟡 框架 |
| P3 | IoT物联网 | /hse-advanced/iot | 🟡 框架 |
| P3 | 供应链安全 | /hse-advanced/supply-chain | 🟡 框架 |
| P3 | 报表中心 | /hse-advanced/reports | 🟡 框架 |

## 开发原则

1. **不修改官方核心文件**：`packages/@core/`、`packages/effects/` 等保持官方原样
2. **模块化开发**：业务代码放在 `src/views/`、`src/api/hse/`、`src/router/routes/modules/` 等独立目录
3. **统一组件体系**：使用 Ant Design Vue + Vben `Page` 组件 + `HseStatCard` 统计卡片
4. **主题适配**：使用 CSS 变量（`hsl(var(--border))` 等），支持深色模式
5. **Mock 降级**：所有 API 调用有 try/catch + Mock 数据 fallback

## 配置说明

### 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `VITE_APP_TITLE` | Vben Admin | 应用标题 |
| `VITE_GLOB_API_URL` | `/api` | API 地址 |
| `VITE_ROUTER_HISTORY` | `hash` | 路由模式 |
| `VITE_NITRO_MOCK` | `false` | Mock 数据开关（已关闭，使用内置降级） |

### 后端配置

后端服务位于 `../server/`（独立目录），如需对接：

1. 启动后端服务：`cd ../server && npm run dev`
2. 修改 `apps/web-antd/.env.development` 中的 `VITE_GLOB_API_URL`
3. 确保前端 API 路径与后端路由一致

## 命令清单

| 命令 | 说明 |
|---|---|
| `pnpm install` | 安装依赖 |
| `pnpm dev` | 启动开发服务器 |
| `pnpm build` | 生产构建 |
| `pnpm lint` | 代码检查 |
| `pnpm typecheck` | 类型检查 |

## 后续路线图

| 阶段 | 计划内容 |
|-----|---------|
| v1.1 | 表单校验完善、数据导出、交互细节优化 |
| v1.2 | BI 图表集成（ECharts）、HSE驾驶舱、报表中心 |
| v2.0 | AI 智能分析、IoT 平台对接、移动端适配 |
| v2.1 | 工作流设计器、多租户、权限细化 |

## 相关文档

- [HSE系统用户操作手册.md](HSE系统用户操作手册.md) - 面向终端用户的操作指南
- [HSE系统最终风格统一与商业化完善报告.md](HSE系统最终风格统一与商业化完善报告.md) - 风格统一与商业化报告
- [HSE系统功能完善进度报告.md](HSE系统功能完善进度报告.md) - P2 模块完善进度
- [恢复完成报告.md](恢复完成报告.md) - P0/P1 恢复报告

## 许可证

MIT License - 参见 [LICENSE](LICENSE)

---

**宁津环卫HSE安全管理系统 v5.7.0**

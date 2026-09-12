
# 宁津环卫 HSE 安全管理系统（P0修复与启动指南）

> 企业级健康、安全、环境（HSE）一体化管理平台

![Vue 3](https://img.shields.io/badge/Vue-3.4+-4FC08D?logo=vue.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?logo=typescript&logoColor=white)
![Vben Admin](https://img.shields.io/badge/vben--admin-v5.7.0-409eff?logo=vue.js&logoColor=white)
![Element Plus](https://img.shields.io/badge/Element--Plus-2.x-409eff?logo=element&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-22+-339933?logo=node.js&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-4169E1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-supported-2496ED?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

> **当前版本**：前端唯一主程序为 `安全看板vben/apps/web-antd`，基于 **vue-vben-admin v5.7.0** Monorepo 架构。根目录仅保留后端、启动脚本和项目运维配置。

---

## 📋 项目简介

宁津环卫 HSE 安全管理系统是面向环卫行业的企业级安全管理平台，涵盖**健康（Health）、安全（Safety）、环境（Environment）**三大维度，提供从隐患排查、事故管理、培训教育到风险管控的全流程数字化解决方案。

系统采用前后端分离架构，前端基于 **vue-vben-admin v5.7.0**（Vue 3 + TypeScript + Element Plus + Monorepo），后端基于 **Express + PostgreSQL**，具备完整的 RBAC 权限控制、高级工作流引擎、实时告警、审计日志等企业级能力。

### 核心特性

- 🎯 **完整业务模块**：隐患排查、事故管理、培训教育、保险管理、车辆管理、设备管理、风险分级管控等
- 🔐 **企业级权限**：RBAC 权限体系、动态菜单、按钮级权限、数据权限
- 🔄 **高级工作流**：可视化流程设计器（LogicFlow）、条件分支、并行审批、动态审批人、流程图可视化
- ⚡ **实时告警**：WebSocket 实时推送、多级别告警、告警状态流转
- 📊 **数据可视化**：Dashboard 数据大屏、ECharts 图表、统计报表
- 🛡️ **安全可靠**：JWT 认证、密码哈希、Zod 参数校验、SQL 注入防护、审计日志
- 🚀 **生产就绪**：Docker 一键部署、CI/CD 流水线、Sentry 错误监控、性能优化
- 🧪 **质量保障**：前端 Vitest + 后端 Jest 测试体系，核心模块覆盖率 70%+
- 🏗️ **Monorepo 架构**：pnpm + turbo + workspace，多应用共享核心包

---

## 📸 系统截图

> 以下为系统关键页面截图说明（部署后可替换为实际截图）。

### 1. Dashboard 数据概览

系统首页，展示安全关键指标、隐患统计、告警趋势、待办任务等概览信息。

```
┌─────────────────────────────────────────────────┐
│  📊 Dashboard 数据概览                          │
├──────────┬──────────┬──────────┬───────────────┤
│ 隐患总数  │ 待办任务  │ 告警数    │ 安全评分      │
│   128    │    12    │    5     │     92分      │
├──────────┴──────────┴──────────┴───────────────┤
│  📈 告警趋势图              📊 隐患分类统计      │
│  (ECharts 折线图)           (ECharts 饼图)      │
├─────────────────────────────────────────────────┤
│  📋 待办任务列表                                 │
└─────────────────────────────────────────────────┘
```
> 截图位置：`docs/screenshots/dashboard.png`（部署后替换）

### 2. 工作流设计器

基于 LogicFlow 的可视化流程设计器，支持节点拖拽、连线、条件分支配置。

```
┌─────────────────────────────────────────────────┐
│  🔄 流程设计器                                  │
├────────┬─────────────────────────┬──────────────┤
│ 节点面板│      画布区域            │  属性配置    │
│        │                         │              │
│ ▶ 开始  │   (○)──→(□)──→(◇)──→(○)│  节点名称    │
│ ✓ 审批  │         │      │        │  审批人类型  │
│ ◇ 条件  │    ┌────┘      └────┐   │  条件表达式  │
│ ≡ 并行  │   (□)              (□)  │              │
│ ■ 结束  │                         │              │
├────────┴─────────────────────────┴──────────────┤
│  工具栏：缩放 | 撤销 | 重做 | 清空 | 保存        │
└─────────────────────────────────────────────────┘
```
> 截图位置：`docs/screenshots/workflow-designer.png`（部署后替换）

### 3. 告警中心

实时告警管理，支持 WebSocket 实时推送、多级别告警、状态流转。

```
┌─────────────────────────────────────────────────┐
│  🚨 告警中心                    [WebSocket ●在线]│
├─────────────────────────────────────────────────┤
│  状态：[全部] [待处理] [处理中] [已解决]         │
├────┬──────────┬──────┬─────────┬────────┬──────┤
│ ID │ 标题     │ 级别 │ 来源    │ 时间   │ 操作 │
├────┼──────────┼──────┼─────────┼────────┼──────┤
│ 12 │ 设备过热 │ 紧急 │ 传感器A │ 10:32  │ 处理 │
│ 11 │ 人员闯入 │ 重要 │ 门禁B   │ 09:15  │ 处理 │
│ 10 │ 液位超标 │ 一般 │ 液位计C │ 08:40  │ 查看 │
└────┴──────────┴──────┴─────────┴────────┴──────┘
```
> 截图位置：`docs/screenshots/alert-center.png`（部署后替换）

### 4. RBAC 角色权限管理

角色管理界面，支持角色 CRUD、权限分配、菜单树配置。

```
┌─────────────────────────────────────────────────┐
│  👥 角色管理                                    │
├─────────────────────────────────────────────────┤
│  [新增角色] [刷新] [导出]                        │
├────┬────────────┬──────────┬──────┬────────────┤
│ ID │ 角色名称   │ 角色编码 │ 状态 │ 操作       │
├────┼────────────┼──────────┼──────┼────────────┤
│  1 │ 超级管理员 │ super    │ 启用 │ 编辑 权限  │
│  2 │ 安全管理员 │ safety   │ 启用 │ 编辑 权限  │
│  3 │ 部门主管   │ manager  │ 启用 │ 编辑 权限  │
│  4 │ 普通员工   │ employee │ 启用 │ 编辑 权限  │
└────┴────────────┴──────────┴──────┴────────────┘
```
> 截图位置：`docs/screenshots/role-manage.png`（部署后替换）

### 5. 通知中心

站内消息通知，支持未读筛选、标记已读、消息分类、WebSocket 实时推送。

```
┌─────────────────────────────────────────────────┐
│  🔔 通知中心                    未读: 3 条       │
├─────────────────────────────────────────────────┤
│  [全部] [未读] [已读]  | [全部类型][系统][工作流]│
├─────────────────────────────────────────────────┤
│  🔵 新的待办任务：隐患审批              [未读]   │
│     流程「隐患整改」有新的待办任务需要您处理      │
│     10分钟前                    标记已读 | 删除   │
├─────────────────────────────────────────────────┤
│  🟢 流程已通过：培训申请                [已读]   │
│     您的培训申请已通过审批                        │
│     2小时前                              删除     │
└─────────────────────────────────────────────────┘
```
> 截图位置：`docs/screenshots/notification-center.png`（部署后替换）

---

## 🏗️ 技术栈

### 前端架构

> **v3.0+**：基于 **vue-vben-admin v5.7.0** Monorepo 架构

| 类别 | 技术 | 版本 | 说明 |
|------|------|------|------|
| 基础框架 | vue-vben-admin | v5.7.0 | 企业级前端架构 |
| 视图层 | Vue 3 | 3.4+ | Composition API |
| 语言 | TypeScript | 5.0+ | 严格类型 |
| 构建工具 | Vite | 5.x | 极速开发构建 |
| 包管理器 | pnpm | 10.x | Monorepo 专用 |
| 构建编排 | Turbo | - | 增量构建 |
| 状态管理 | Pinia | 2.x | Vue 官方推荐 |
| 路由 | Vue Router | 4.x | 懒加载路由 |
| UI 库 | Element Plus | 2.x | 企业级组件库 |
| Layout | @vben/layouts | - | 完整布局系统 |
| 权限系统 | @vben/access | - | RBAC + 权限码 |
| 请求库 | @vben/request | - | Axios 封装 + 拦截器链 |
| 偏好设置 | @vben/preferences | - | 主题/布局/多语言 |
| 图表 | ECharts | 5.5+ | 数据可视化 |
| 流程引擎 | LogicFlow | 2.x | 可视化流程设计 |
| 国际化 | @vben/locales | - | 多语言支持 |
| 代码规范 | ESLint + Stylelint + Oxlint | - | 全链路规范 |
| 测试框架 | Vitest | 1.x | Vite 原生测试 |
| 错误监控 | Sentry | 7.x | 生产环境监控 |

### 后端

| 类别 | 技术 | 版本 | 说明 |
|------|------|------|------|
| 框架 | Express | 4.x | 轻量高效 |
| 语言 | JavaScript (ES6+) | - | 计划迁移 TypeScript |
| 数据库 | PostgreSQL | 16+ | 关系型数据库 |
| 连接池 | node-postgres | 8.x | pg 客户端 |
| 认证 | JWT | 9.x | Access + Refresh Token |
| 密码加密 | bcryptjs | 2.x | 哈希存储 |
| 参数校验 | Zod | 3.x | Schema 验证 |
| 文件上传 | multer | 1.x | 中间件 |
| 实时通信 | ws | 8.x | WebSocket |
| 测试框架 | Jest | 29.x | 单元测试 |
| 测试工具 | Supertest | 7.x | HTTP 接口测试 |
| 进程管理 | PM2 | 5.x | 生产进程守护 |

### 部署与运维

- **Docker + docker-compose**：一键容器化部署
- **Nginx**：反向代理 + 静态资源 + Gzip 压缩
- **GitHub Actions**：CI/CD 自动化流水线
- **Sentry**：错误监控 + 性能监控
- **PM2**：Node.js 进程管理

---

## 📦 功能模块

### 1. 认证与授权
- 用户名/密码登录、注册
- JWT Token 认证（Access + Refresh 双 Token）
- 登出 / Token 黑名单
- 密码修改、个人资料编辑

### 2. Dashboard 概览
- 关键指标卡片展示
- 隐患统计图表
- 告警趋势分析
- 待办任务概览
- 安全评分概览

### 3. 用户管理
- 用户 CRUD（增删改查）
- 用户状态管理
- 角色分配
- 部门归属

### 4. RBAC 权限系统
- 角色管理（增删改查、权限分配）
- 菜单管理（树形结构、按钮级权限）
- 动态路由（根据权限加载菜单）
- 权限指令（v-permission）

### 5. 隐患排查治理
- 隐患登记、整改、复查闭环
- 隐患分级（一般 / 较大 / 重大）
- 隐患分类管理
- 整改跟踪与超期提醒

### 6. 事故管理
- 事故登记与报告
- 事故分级分类
- 事故调查处理
- 事故统计分析

### 7. 培训教育
- 培训计划管理
- 培训记录登记
- 培训效果评估
- 人员培训档案

### 8. 保险与人员管理
- 人员信息管理
- 保险台账管理
- 保险到期提醒
- 人员异动管理

### 9. 车辆与设备管理
- 车辆信息管理
- 车辆保险/年检管理
- 设备台账管理
- 设备维护保养

### 10. 实时告警中心
- 告警接收与展示
- 告警分级（一般 / 重要 / 紧急）
- 告警确认、处置、闭环
- WebSocket 实时推送
- 告警历史记录

### 11. 高级工作流
- **可视化流程设计器**（LogicFlow 拖拽配置）
- 6 种节点类型：开始、结束、审批、条件分支、并行、抄送
- 条件分支（表达式动态计算）
- 并行审批（会签模式）
- 动态审批人（用户/角色/部门/发起人/动态字段）
- 流程图可视化（高亮当前节点）
- 站内消息 + WebSocket 通知推送
- 审批历史时间线

### 12. 审计日志
- 用户操作全记录
- 按模块/操作/用户筛选
- 登录日志追踪
- IP 地址记录

### 13. 通知中心
- 站内消息通知
- 未读消息统计
- 消息分类（系统/工作流/告警）
- WebSocket 实时推送

### 14. 系统管理
- 菜单管理
- 角色管理
- 字典管理（可选）
- 系统配置

---

## 🚀 快速开始

### 环境要求

- **Node.js** >= 22.18.0（推荐 24.x，兼容 vben-admin 要求）
- **pnpm** >= 10.0.0（Monorepo 必需，推荐 10.33.4）
- **PostgreSQL** >= 14.0（推荐 16+）
- **Docker**（可选，推荐用于生产部署）

> 💡 Vben Monorepo 需要 Node.js `^22.18.0 || ^24.0.0`，请不要在根目录重新初始化或安装旧版前端依赖。

### 本地开发

> **v3.0+ 推荐使用 vben 架构**，以下为 vben 项目启动方式。

#### 1. 克隆项目

```bash
git clone <repository-url>
cd 新安全看板
```

#### 2. 配置环境变量

```bash
# vben 前端（唯一主程序）
cd 安全看板vben/apps/web-antd
cp .env.development .env.development.local
cp .env.production .env.production.local
cd ../../..

# 后端
cd server
cp .env.example .env   # 如无示例文件，参考 server/.env
cd ..
```

vben 前端配置（`安全看板vben/apps/web-antd/.env.development`）：

```env
VITE_GLOB_API_URL=/api
VITE_APP_BASE_API=/api
VITE_GLOB_ENABLE_ENCRYPT=false
VITE_GLOB_MULTI_TENANT=false
```

后端配置项（`server/.env`）：

```env
PORT=5666
FRONTEND_PORT=5173
FRONTEND_URL=http://localhost:5173
NODE_ENV=development

# 数据库配置
DB_HOST=localhost
DB_PORT=5432
DB_DATABASE=hse_db
DB_USER=hse_user
DB_PASSWORD=your_password

# JWT 配置
JWT_SECRET=your_jwt_secret_key_change_in_production
JWT_EXPIRES_IN=2h
JWT_REFRESH_EXPIRES_IN=7d

# 文件上传
UPLOAD_DIR=uploads
MAX_FILE_SIZE=10485760

# 多租户（可选）
MULTI_TENANT_ENABLED=false
DEFAULT_TENANT_ID=1
```

#### 3. 初始化数据库

```bash
# 创建数据库
createdb hse_db

# 执行初始化脚本（按顺序）
psql -U hse_user -d hse_db -f sql/auth_schema.sql
psql -U hse_user -d hse_db -f sql/migrate_rbac.sql
psql -U hse_user -d hse_db -f sql/migrate_workflow.sql
psql -U hse_user -d hse_db -f sql/migrate_notifications.sql

# 性能优化索引（可选，推荐生产环境）
psql -U hse_user -d hse_db -f sql/migrate_indexes_optimization.sql

# 多租户支持（可选）
psql -U hse_user -d hse_db -f sql/migrate_multi_tenant.sql
```

#### 4. 安装依赖

```bash
# vben 前端依赖（推荐方式）
cd 安全看板vben
pnpm install

# 后端依赖
cd ../server && npm install && cd ..
```

> ⚠️ vben 项目必须使用 pnpm，不能用 npm/yarn（Monorepo workspace 依赖 `workspace:*` 协议）。

#### 5. 启动开发服务器

```bash
# 推荐：根目录双击 start-hse-system.bat
# 它只启动唯一主前端安全看板vben/apps/web-antd，并自动打开浏览器。

# 也可以分别启动：终端 1 启动后端
cd server && npm run dev

# 终端 2 启动唯一前端
cd ../安全看板vben/apps/web-antd
pnpm dev
```

启动后访问：
- 前端：http://localhost:5173
- 后端 API：http://localhost:5666/api
- WebSocket：ws://localhost:5666/ws

> 旧版静态目录和旧数据更新入口已删除；根目录批处理脚本是唯一推荐入口。

根目录命令 `npm run dev` 和 `npm start` 均指向同一个 `start-hse-v2.ps1` 启动流程，不再启动根目录 Vite 应用。

#### 6. 生产构建（Vben）

```bash
cd 安全看板vben
pnpm build:antd
```

构建产物位于：`安全看板vben/apps/web-antd/dist/`

#### 默认账号

| 用户名 | 密码 | 角色 |
|--------|------|------|
| admin | admin123 | 超级管理员 |
| safety | safety123 | 安全管理员 |
| user | user123 | 普通员工 |

> ⚠️ 生产环境请务必修改默认密码！

---

## 🧪 测试

### 前端测试（Vitest）

```bash
# 运行测试（watch 模式）
npm run test:unit

# 单次运行
npx vitest run

# 覆盖率报告
npm run test:coverage
```

### 后端测试（Jest）

```bash
cd server

# 运行测试
npm test

# 覆盖率报告
npm run test:coverage

# watch 模式
npm run test:watch
```

### 全栈测试

```bash
npm run test:all
```

### 测试覆盖范围

- **前端**：工具函数、Store、组件（核心模块 ≥ 70%）
- **后端**：中间件、Schema 校验、核心路由（核心模块 ≥ 60%）

---

## 🐳 Docker 部署

### 一键部署（推荐）

```bash
# 克隆项目
git clone <repository-url>
cd 新安全看板

# 配置环境变量
cp .env.docker.example .env
# 修改 .env 中的数据库密码等敏感配置

# 启动服务
docker-compose -f docker-compose.yml -f docker-compose.production.yml up -d

# 查看状态
docker-compose ps

# 查看日志
docker-compose logs -f frontend backend postgres

# 停止服务
docker-compose down
```

### 服务说明

| 服务 | 端口 | 说明 |
|------|------|------|
| frontend | 80 / 443 | Nginx 托管前端静态资源 |
| backend | 3000 | Express API 服务 |
| postgres | 5432 | PostgreSQL 数据库 |
| nginx | 80 / 443 | 反向代理入口 |

访问地址：http://服务器IP 或 https://域名（需配置 SSL 证书）

### 生产部署建议

1. **HTTPS**：配置 SSL 证书（Let's Encrypt 免费证书）
2. **域名**：绑定正式域名
3. **数据库**：数据持久化 + 定期备份
4. **监控**：接入 Sentry 错误监控、服务器监控
5. **备份**：数据库每日自动备份
6. **日志**：访问日志 + 错误日志轮转

---

## 🔧 CI/CD 流水线

项目内置 GitHub Actions CI/CD 流水线配置，位置：`.github/workflows/`

### 流水线文件

| 文件 | 说明 |
|------|------|
| `ci-cd.yml` | 完整流水线（测试 + 构建 + Docker + 部署） |
| `deploy.yml` | 简化版部署流水线（向后兼容） |

### 流水线流程

```
代码推送 → Lint检查 → 单元测试(前后端) → 前端构建 → Docker构建 → 部署服务器
```

### 7 个 Job

1. **frontend-lint**：ESLint + TypeScript 类型检查
2. **backend-test**：后端单元测试（含 PostgreSQL 服务）
3. **frontend-test**：前端单元测试 + 覆盖率
4. **frontend-build**：前端生产构建
5. **docker-build**：前后端 Docker 镜像构建 + 推送
6. **deploy**：SSH 部署到服务器 + 健康检查
7. **summary**：流水线结果总结

### 配置 Secrets

在 GitHub 仓库 Settings → Secrets and variables → Actions 中配置：

| Secret | 说明 |
|--------|------|
| `SERVER_HOST` | 服务器地址 |
| `SERVER_USER` | SSH 用户名 |
| `SERVER_SSH_KEY` | SSH 私钥 |
| `SERVER_PORT` | SSH 端口（默认 22） |
| `DOCKER_REGISTRY` | Docker 镜像仓库地址 |
| `DOCKER_REGISTRY_USER` | 镜像仓库用户名 |
| `DOCKER_REGISTRY_PASSWORD` | 镜像仓库密码 |
| `VITE_SENTRY_DSN` | Sentry DSN（可选） |
| `APP_URL` | 应用访问地址（可选） |
| `APP_DIR` | 服务器部署目录（默认 /opt/hse-app） |

### 手动触发

在 GitHub Actions 页面可手动选择环境触发部署：
- development（开发环境）
- staging（预发布环境）
- production（生产环境）

---

## 📁 项目结构

```
新安全看板/
├── .github/workflows/        # CI/CD 流水线
│   ├── ci-cd.yml             # 完整流水线
│   └── deploy.yml            # 简化部署
├── 安全看板vben/              # 唯一前端 Monorepo
│   ├── apps/web-antd/         # HSE 主程序（Ant Design Vue）
│   │   ├── src/               # 前端业务源码
│   │   ├── index.html         # 前端入口
│   │   └── vite.config.ts     # Vben 构建配置
│   ├── packages/              # Vben 核心共享包
│   ├── internal/              # Vben 内部配置包
│   ├── pnpm-workspace.yaml    # workspace 配置
│   └── package.json           # Vben Monorepo 命令
├── server/                    # 后端源码
│   ├── app.js                 # 入口文件
│   ├── routes/                # 路由层
│   ├── middleware/            # 中间件
│   ├── services/              # 服务层
│   ├── utils/                 # 工具函数
│   ├── schemas/               # Zod 校验 Schema
│   ├── config/                # 配置文件
│   ├── __tests__/             # 测试文件
│   ├── test/                  # 测试配置
│   └── jest.config.js         # Jest 配置
├── sql/                       # 数据库脚本
│   ├── auth_schema.sql        # 基础表结构
│   ├── migrate_rbac.sql       # RBAC 权限表
│   ├── migrate_workflow.sql   # 工作流表
│   ├── migrate_notifications.sql   # 通知表
│   ├── migrate_indexes_optimization.sql   # 性能优化索引
│   └── migrate_multi_tenant.sql     # 多租户支持
├── deploy/                    # 部署相关
│   ├── frontend/Dockerfile    # 前端 Dockerfile
│   ├── nginx/hse.conf         # Nginx 配置
│   └── scripts/               # 部署脚本
├── .github/workflows/         # CI/CD 配置
├── docker-compose.yml         # Docker Compose 基础配置
├── docker-compose.production.yml  # 生产环境配置
├── Dockerfile.frontend.vben   # Vben 前端 Dockerfile
├── Dockerfile.backend         # 后端 Dockerfile
├── nginx.conf                 # Nginx 配置
├── package.json               # 根目录启动与运维命令
├── start-hse-system.bat       # 推荐的一键启动入口
├── start-hse-v2.ps1           # 后端 + web-antd 启动逻辑
├── .env.example               # 环境变量示例
├── .dockerignore              # Docker 忽略文件
├── .gitignore                 # Git 忽略文件
├── HSE系统P0修复与启动指南.md   # P0 修复与启动说明（本文件）
├── CHANGELOG.md               # 变更日志
├── SECURITY.md                # 安全策略
└── 项目完成情况总览.md        # 项目进度总览
```

---

## 🔌 API 文档

### 接口约定

- Base URL: `/api`
- 认证方式：Bearer Token（请求头 `Authorization: Bearer <token>`）
- 数据格式：JSON
- 字符编码：UTF-8
- 时间格式：ISO 8601

### 响应格式

```json
{
  "code": 0,
  "message": "操作成功",
  "data": {
    // 业务数据
  }
}
```

- `code = 0` 表示成功
- `code != 0` 表示失败，message 为错误信息

### 主要 API 模块

| 模块 | 前缀 | 说明 |
|------|------|------|
| 认证 | `/api/auth` | 登录、注册、登出、获取用户信息、修改密码 |
| 用户 | `/api/users` | 用户 CRUD、状态管理 |
| 角色 | `/api/roles` | 角色 CRUD、权限分配 |
| 菜单 | `/api/menus` | 菜单树形结构、CRUD |
| 告警 | `/api/alerts` | 告警 CRUD、状态流转、WebSocket 推送 |
| 工作流 | `/api/workflow` | 流程定义、实例、任务、审批 |
| 通知 | `/api/notifications` | 站内消息、未读数、标记已读 |
| 审计 | `/api/audit` | 审计日志查询 |
| Dashboard | `/api/dashboard` | 概览统计数据 |
| 文件 | `/api/files` | 文件上传下载 |

### WebSocket

- 连接地址：`ws://<host>:<port>/ws`
- 认证：连接时携带 `token` 参数
- 消息格式：JSON

```json
{
  "type": "ALERT_NEW",
  "timestamp": 1718000000000,
  "payload": {
    "id": 1,
    "title": "告警标题",
    "level": "high"
  }
}
```

消息类型：
- `ALERT_NEW` — 新告警
- `ALERT_UPDATE` — 告警更新
- `ALERT_RESOLVE` — 告警解决
- `NOTIFICATION` — 站内通知
- `HEARTBEAT` — 心跳

---

## 🛡️ 安全

- 密码使用 bcrypt 哈希存储
- JWT Token 认证 + Refresh Token 刷新机制
- Zod 参数校验（body/query/params）
- SQL 注入防护（参数化查询）
- XSS 防护（Vue 模板自动转义）
- 文件上传类型和大小限制
- WebSocket 连接认证
- 完整审计日志
- 生产环境 Sentry 错误监控

详细安全策略请参考 [SECURITY.md](./SECURITY.md)

---

## 📈 性能优化

### 前端

- ✅ 路由懒加载
- ✅ 组件按需引入（unplugin-vue-components）
- ✅ 代码分割（manualChunks）
- ✅ Terser 压缩（移除 console/debugger）
- ✅ 图片懒加载（Vue 指令）
- ✅ Gzip/Brotli 压缩（Nginx 层）

### 后端

- ✅ 数据库连接池
- ✅ 索引优化（详见 `sql/migrate_indexes_optimization.sql`）
- ✅ 分页查询
- ✅ Zod 校验提前拦截
- ✅ WebSocket 心跳保活

---

## ❓ 常见问题 (FAQ)

### Q1: 启动时报数据库连接失败？

**A**: 检查以下几项：
1. PostgreSQL 服务是否已启动
2. `server/.env` 中的数据库配置是否正确
3. 数据库 `hse_db` 是否已创建（`createdb hse_db`）
4. 防火墙是否放行 5432 端口

### Q2: WebSocket 连接不上？

**A**: 确认以下配置：
1. 后端服务已启动且 WebSocket 路径为 `/ws`
2. 前端代理配置中 `/ws` 指向正确（`安全看板vben/apps/web-antd/vite.config.ts`）
3. Nginx 配置中 WebSocket 升级头（`Upgrade` / `Connection`）已设置
4. Token 有效（WebSocket 连接需携带 JWT）

### Q3: 工作流设计器拖拽不生效？

**A**: 确保：
1. 已安装 `@logicflow/core` 和 `@logicflow/extension`
2. 画布容器有明确的高度（非 0）
3. 浏览器支持 HTML5 Drag API

### Q4: Docker 部署后页面空白？

**A**: 检查：
1. 前端构建产物是否正确挂载到 Nginx
2. Nginx 配置中 `try_files` 是否正确指向 `index.html`
3. 浏览器控制台是否有 CSP 或路径错误

### Q5: 如何开启多租户模式？

**A**:
1. 执行 `sql/migrate_multi_tenant.sql` 迁移脚本
2. 在 `.env` 中设置 `MULTI_TENANT_ENABLED=true`
3. 重启后端服务
4. 默认单租户模式（`false`）完全兼容现有数据

### Q6: 生产环境如何更新版本？

**A**:
```bash
# 拉取最新代码
git pull origin main

# 重新构建镜像
docker compose -f docker-compose.yml -f docker-compose.production.yml build

# 重启服务
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d

# 如有数据库迁移，执行对应 SQL
```

### Q7: 如何备份数据库？

**A**:
```bash
# 手动备份
docker compose exec postgres pg_dump -U hse_user hse_db > backup_$(date +%Y%m%d).sql

# 自动备份（crontab）
0 2 * * * docker compose exec -T postgres pg_dump -U hse_user hse_db > /backups/hse_$(date +\%Y\%m\%d).sql
```

---

## 🤝 贡献指南

欢迎贡献代码！请遵循以下步骤：

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

### 代码规范

- 遵循 ESLint 规则
- 提交前运行测试
- 使用 TypeScript 严格模式
- 组件命名使用 PascalCase
- 函数命名使用 camelCase
- 常量使用 UPPER_SNAKE_CASE

### 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/v1.0.0/) 规范：

```
feat: 新功能
fix: 修复 bug
docs: 文档更新
style: 代码格式调整
refactor: 重构
perf: 性能优化
test: 测试相关
chore: 构建/工具链相关
```

---

## 📄 许可证

本项目采用 MIT 许可证 — 详见 [LICENSE](#) 文件。

---

## 📞 技术支持

- 项目文档：参见 `docs/` 目录
- 问题反馈：GitHub Issues
- 变更日志：[CHANGELOG.md](./CHANGELOG.md)
- 安全问题：参见 [SECURITY.md](./SECURITY.md)

---

## 🎯 版本里程碑

- [x] **v1.0** — P0/P1 基础版（核心业务 + 认证 + Dashboard）
- [x] **v2.0** — P2 功能完善版（RBAC + 告警 + 工作流 + 审计日志）
- [x] **v3.0** — P3 生产就绪版（测试体系 + 高级工作流 + CI/CD + 性能优化 + 多租户 + 通知中心）
- [ ] **v4.0** — 未来规划（移动端、AI 辅助、UI 框架迁移评估、更多业务模块）

### 版本升级指南

#### 从 v2.x 升级到 v3.0

1. **数据库迁移**（按顺序执行）：
   ```bash
   psql -U hse_user -d hse_db -f sql/migrate_notifications.sql
   psql -U hse_user -d hse_db -f sql/migrate_indexes_optimization.sql
   # 如需多租户：
   psql -U hse_user -d hse_db -f sql/migrate_multi_tenant.sql
   ```

2. **更新环境变量**：
   ```bash
   # 新增配置项
   MULTI_TENANT_ENABLED=false
   DEFAULT_TENANT_ID=1
   WS_HEARTBEAT_INTERVAL=30000
   ```

3. **更新依赖**：
   ```bash
   cd 安全看板vben && pnpm install  # 前端 Monorepo
   cd server && npm install && cd ..  # 后端
   ```

4. **重新构建部署**：
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.production.yml build
   docker compose -f docker-compose.yml -f docker-compose.production.yml up -d
   ```

### UI 框架说明

> 当前项目使用 **vue-vben-admin v5.7.0 + Ant Design Vue**。
>
> - 主程序位于 `安全看板vben/apps/web-antd/`
> - 共享组件与基础能力位于 `安全看板vben/packages/`
> - 根目录不再包含可启动的旧版前端 `src/`

---

> **项目状态**：✅ v3.0 正式交付完成，已完全可生产交付
>
> 所有核心功能已开发完成并通过测试，具备企业级生产部署条件。

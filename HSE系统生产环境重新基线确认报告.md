# HSE系统生产环境重新基线确认报告

**报告日期**：2026-07-24  
**报告类型**：基线审计报告  
**审计范围**：F:\deploy\hse-dashboard 全目录  
**目的**：重新确认生产系统真实状态，建立可信开发基线

---

## 一、当前生产目录确认

### 1.1 唯一生产前端基线

| 项目 | 详情 |
|------|------|
| **生产前端目录** | `F:\deploy\hse-dashboard\安全看板vben` |
| 前端应用名 | @vben/web-antd |
| 前端入口 | `F:\deploy\hse-dashboard\安全看板vben\apps\web-antd\src\` |
| 框架版本 | Vben Admin v5.7.0 |
| 架构模式 | Monorepo（pnpm workspace） |
| package.json | [package.json](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/package.json)（根） / [apps/web-antd/package.json](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/package.json)（应用） |
| vite配置 | [vite.config.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/vite.config.ts) |
| 生产后端目录 | `F:\deploy\hse-dashboard\server\` |
| 后端入口 | [app.js](file:///F:/deploy/hse-dashboard/server/app.js) |

### 1.2 运行端口与进程映射

| 端口 | PID | 对应目录 | 系统角色 | 启动命令 |
|------|-----|--------|----------|---------|
| **5173** | 23944 | `F:\deploy\hse-dashboard\`（根目录旧系统） | ❌ **非生产前端（Element Plus版 | `vite --mode development |
| **5174** | 13792 | `F:\deploy\hse-dashboard\安全看板vben\` | ✅ **生产前端**（Vben + AntD） | `vite --mode development` |
| **5666** | 24840 | `F:\deploy\hse-dashboard\server\` | ✅ **生产后端**（Node.js + Express） | `node app.js` |

> **重要确认**：
> - 当前浏览器访问 http://localhost:5173 对应的是**旧系统**（Element Plus版）
> - 生产系统（Vben Admin版）实际运行在 **http://localhost:5174**
> - 安全看板vben的vite.config.ts配置的默认端口是5173，但因被占用自动偏移到5174

---

## 二、当前运行入口确认

### 2.1 5173端口（旧系统）

| 项 | 详情 |
|----|------|
| 对应项目 | `F:\deploy\hse-dashboard\`（根目录） |
| 技术栈 | Vue 3.4.31 + Element Plus 2.7.6 + Pinia 2.1.7 |
| vite.config | [vite.config.ts](file:///F:/deploy/hse-dashboard/vite.config.ts) |
| package.json | [package.json](file:///F:/deploy/hse-dashboard/package.json) |
| 入口页面 | 驾驶舱 / 各features目录 |
| 状态 | ❌ **非生产系统，仅作历史保留 |

### 2.2 5174端口（生产系统）

| 项 | 详情 |
|----|------|
| 对应项目 | `F:\deploy\hse-dashboard\安全看板vben\` |
| 技术栈 | Vben Admin v5.7.0 + Vue 3 + Ant Design Vue + Pinia |
| vite.config | [vite.config.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/vite.config.ts) |
| package.json | [apps/web-antd/package.json](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/package.json) |
| API代理 | `/api` → `http://localhost:5666` |
| WebSocket代理 | `/ws` → `ws://localhost:5666` |
| 状态 | ✅ **生产系统，后续所有开发必须基于此目录 |

---

## 三、当前技术架构确认

### 3.1 生产前端技术栈

| 维度 | 技术选型 | 版本/说明 |
|------|---------|----------|
| 框架 | **Vben Admin** | v5.7.0（Monorepo架构） |
| 前端框架 | Vue 3 | ^3.4.31 |
| 构建工具 | Vite | ^5.3.2 |
| 语言 | TypeScript | ^5.5.2 |
| UI组件库 | **Ant Design Vue** | catalog:（Vben内置） |
| 状态管理 | Pinia | ^2.1.7 |
| 路由 | Vue Router | ^4.4.0 |
| 菜单实现方式 | 前端静态路由（accessMode: frontend） | 路由modules自动加载 |
| 路由实现方式 | 模块化路由（modules/*.ts自动注册） | Vben动态路由机制 |
| HTTP请求 | @vben/request | 基于axios封装 |
| 权限验证 | @vben/access | 角色权限过滤 |
| 主题体系 | @vben/preferences | 主题/布局/颜色统一配置 |
| 国际化 | @vben/locales | zh-CN / en-US |
| 包管理 | pnpm | v10.33.4 |
| 默认首页 | `/hse/alerts`（告警中心） |

### 3.2 生产后端技术栈

| 维度 | 技术选型 |
|------|---------|
| 运行时 | Node.js |
| 框架 | Express |
| 数据库 | PostgreSQL 15 |
| 验证 | Zod |
| 日志 | Winston |
| 实时通信 | ws (WebSocket) |

### 3.3 生产目录完整结构

```
F:\deploy\hse-dashboard\安全看板vben\
├── apps/
│   └── web-antd/
│       ├── src/
│       │   ├── adapter/              组件适配器
│       │   ├── api/
│       │   │   ├── core/       核心API（auth/menu/user）
│       │   │   └── hse/        23个HSE业务API
│       │   ├── components/
│       │   │   └── hse/        10个HSE公共组件
│       │   ├── composables/       组合式函数
│       │   ├── layouts/          布局（auth/basic）
│       │   ├── locales/         国际化
│       │   ├── router/
│       │   │   └── routes/
│       │   │       └── modules/  22个HSE路由模块
│       │   ├── store/           6个Pinia Store
│       │   ├── views/
│       │   │   ├── _core/     核心页面（登录/个人中心/404等）
│       │   │   └── hse/      79个HSE业务页面
│       │   ├── preferences.ts   项目偏好配置
│       │   ├── bootstrap.ts
│       │   ├── main.ts
│       │   └── app.vue
│       ├── .env
│       ├── .env.development
│       ├── .env.production
│       ├── index.html
│       ├── package.json
│       └── vite.config.ts
├── packages/              Vben核心包（@core/@effects/等）
│   ├── @core/
│   ├── constants/
│   ├── effects/        access/layouts/request/stores等
│   ├── icons/
│   ├── locales/
│   ├── preferences/
│   ├── styles/
│   ├── types/
│   └── utils/
├── internal/            内部工具包
├── playground/        演示项目
├── docs/            文档
└── scripts/         脚本
```

---

## 四、旧系统目录说明

### 4.1 旧系统1：根目录src/

| 项 | 详情 |
|----|------|
| 目录 | `F:\deploy\hse-dashboard\src\` |
| 技术栈 | Vue 3.4.31 + **Element Plus** 2.7.6 + Pinia |
| UI框架 | Element Plus（非Vben架构） |
| 运行端口 | 5173 |
| 是否生产 | ❌ **否**，历史系统 |
| 是否被引用 | 独立项目，与安全看板vben无代码隔离 |
| 是否参与5174运行 | ❌ **否**，完全独立 |

**关键结论**：
- 根目录 `src/` 是一个**完全独立的旧系统**
- 与生产系统（安全看板vben）**无任何代码关联**
- 此前Sprint10-D-4-2-B期间对该目录的所有修改**不影响生产系统**
- 后续所有开发**必须停止对该目录的修改**

### 4.2 旧系统2：安全管理系统/

| 项 | 详情 |
|----|------|
| 目录 | `F:\deploy\hse-dashboard\安全管理系统\` |
| 状态 | ❌ 归档系统，无运行进程 |
| 是否生产 | 否 |

---

## 五、当前左侧菜单状态（生产目录）

### 5.1 菜单实现方式

生产系统使用**前端静态路由模式**（accessMode: frontend），菜单由路由模块自动生成：

- 路由文件位置：`router/routes/modules/*.ts`
- 自动加载机制：`import.meta.glob('./modules/**/*.ts', { eager: true })`
- 权限过滤：@vben/access 根据用户角色过滤

### 5.2 当前真实菜单结构（按order排序）

生产目录共有 **22个HSE路由模块**，合计约 **57个菜单项**：

| order | 一级菜单 | 子菜单数 | 路由文件 | 状态 |
|-------|---------|----------|----------|------|
| 1 | 告警中心 | 1 | [hse-center.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-center.ts) | ✅ |
| 2 | 工作流引擎 | 1 | [hse-center.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-center.ts) | ✅ |
| 3 | 目标职责管理 | 4 | [hse-objectives.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-objectives.ts) | ✅ |
| 5 | 人员主数据 | 3 | [hse-employee.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-employee.ts) | ✅ |
| 5 | 培训管理 | 10 | [hse-training.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-training.ts) | ✅ |
| 6 | 三违管理 | 1 | [hse-violations.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-violations.ts) | ✅ |
| 7 | 安全风险管控 | 1 | [hse-risk-control.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-risk-control.ts) | ✅ |
| 8 | 隐患排查治理 | 1 | [hse-hazards.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-hazards.ts) | ✅ |
| 9 | 应急管理 | 1 | [hse-emergency.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-emergency.ts) | ✅ |
| 12 | 系统管理 | 2 | [hse-system.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-system.ts) | ✅ |
| 14 | 通知中心 | 1 | [hse-center.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-center.ts) | ✅ |
| 15 | 高级分析 | 11 | [hse-advanced.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-advanced.ts) | ✅ |
| 20 | 月度安全履职考核 | 8 | [hse-assessment-monthly.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-assessment-monthly.ts) | ✅ |
| 20 | 安全资料中心 | 2 | [hse-documents.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-documents.ts) | ✅ |
| 25 | 标准化评价 | 3 | [hse-standard.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-standard.ts) | ✅ |
| - | （其他8个模块） | 约15个 | （事故/保险/检查/批量导入/人员档案等 | ✅ |

### 5.3 菜单状态总结

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 菜单总数 | ~57个菜单项 | 22个路由模块 |
| 10大菜单统一分组 | ❌ **未完成** | 22个模块order值分散（1~25） |
| 菜单order冲突 | ⚠️ 存在冲突 | order=5同时有"人员主数据"和"培训管理" |
| 权限配置 | ✅ 已配置 | 各路由均有authority数组 |
| 权限码规范 | ❌ 未统一 | 使用角色名而非hse:{module}:{sub}:{action} |
| Logo/标题定制 | ❌ 未定制 | VITE_APP_TITLE=Vben Admin |
| 标签页标题 | ❌ 未统一 | 使用Vben默认机制 |

**结论：左侧菜单的业务模块已齐全，但10大菜单的信息架构统一分组**尚未在生产目录中执行**。

---

## 六、当前修改范围确认

### 6.1 生产目录（安全看板vben）近14天修改

修改文件分类

| 类别 | 文件数 | 主要内容 |
|------|--------|----------|
| 考核模块 | 12 | 月度考核页面+API+Store |
| 高级分析 | 30+ | 驾驶舱/风险/事故/考核分析等 |
| 培训模块 | 5 | 培训页面+路由 |
| 人员模块 | 8 | 人员选择器/档案/导入v2 |
| 隐患/三违 | 4 | 页面+API |
| 路由模块 | 5 | 各路由模块order调整 |
| **合计** | **80+** | |

### 6.2 历史修改是否在正确目录

| 任务 | 修改目录 | 是否生产目录 | 有效性 |
|------|---------|------------|--------|
| Sprint10-D-4-2-B 左侧导航视觉迁移 | 根目录 `src/`（旧系统） | ❌ 否 | ❌ **无效**，未作用于生产 |
| Sprint10-D-4-2-B-1 左侧导航问题修复 | 根目录 `src/`（旧系统） | ❌ 否 | ❌ **无效**，未作用于生产 |
| Sprint10-D-4-3 前端架构冻结 | 根目录文档 | N/A | ⚠️ 目录定位错误 |
| 近14天HSE业务开发 | 安全看板vben | ✅ 是 | ✅ **有效** |

---

## 七、当前系统真实状态全景

### 7.1 生产系统资产盘点

| 类别 | 数量 | 说明 |
|------|------|------|
| HSE API模块 | 23个 | `api/hse/` 目录 |
| HSE路由模块 | 22个 | `router/routes/modules/` 目录 |
| HSE业务页面 | 79个 | `views/hse/` + 其他views目录 |
| HSE公共组件 | 10个 | `components/hse/` 目录 |
| HSE Store | 6个 | `store/` 目录 |
| 后端路由接口 | 80+ | `server/routes/` 目录 |
| 后端服务层 | 15+ | `server/services/` 目录 |
| 数据库表 | 50+ | PostgreSQL 15 |

### 7.2 已完成 vs 待完成

| 维度 | 已完成 | 待完成 |
|------|--------|--------|
| 业务模块代码 | ✅ 22个HSE业务模块齐全 | - |
| 后端接口 | ✅ 80+接口齐全 | - |
| 数据库 | ✅ 50+表齐全 | - |
| 10大菜单分组 | - | ❌ 需在生产目录中重新执行 |
| 菜单命名规范 | - | ❌ 需统一order和命名 |
| Logo/标题定制 | - | ❌ 需修改preferences.ts |
| 权限码规范 | - | ❌ 需统一hse:前缀 |
| 生产端口规范 | - | ❌ 需调整默认5173→5174 |

---

## 八、新的可信开发基线（冻结声明）

### 8.1 唯一生产基线

**自本报告发布之日起，HSE系统PC端唯一开发基线为：**

```
F:\deploy\hse-dashboard\安全看板vben\
```

前端代码必须基于：
```
F:\deploy\hse-dashboard\安全看板vben\apps\web-antd\src\
```

后端代码必须基于：
```
F:\deploy\hse-dashboard\server\
```

### 8.2 非生产目录冻结

以下目录标记为**归档/历史**，**禁止任何HSE业务开发**：

| 目录 | 状态 | 说明 |
|------|------|------|
| `F:\deploy\hse-dashboard\src\` | 🔒 归档 | Element Plus旧系统，历史版本 |
| `F:\deploy\hse-dashboard\安全管理系统\` | 🔒 归档 | 早期历史版本 |

### 8.3 访问端口规范

| 端口 | 用途 | 说明 |
|------|------|------|
| 5173 | ❌ 旧系统 | 停止使用 |
| **5174** | ✅ 生产前端 | Vben Admin系统 |
| 5666 | ✅ 生产后端 | Node.js Express服务 |

### 8.4 技术栈规范

所有前端开发必须遵循：
- **框架**：Vben Admin v5.7.0
- **UI库**：Ant Design Vue
- **路由**：模块化路由（`router/routes/modules/*.ts`）
- **权限**：`meta.authority: string[]`
- **主题**：`@vben/preferences`
- **API**：`@vben/request`，路径 `/api/hse/*`
- **目录**：所有HSE代码放在 `api/hse/`、`views/hse/`、`components/hse/`、`store/`

---

## 九、下一步建议

| 优先级 | 建议项 | 说明 |
|--------|--------|------|
| 🔴 P0 | **立即停止对根目录src/的所有修改** | 该目录为旧系统，修改无效 |
| 🔴 P0 | **确认开发访问端口为5174** | 生产系统运行在5174，不是5173 |
| 🔴 P0 | **在生产目录中执行10大菜单重构** | 参考D-4-2-B设计意图，按Vben规范在安全看板vben中重新实现 |
| 🟡 P1 | 统一生产目录vite端口为5173 | 释放5173给生产系统，避免混淆 |
| 🟡 P1 | 修改VITE_APP_TITLE为HSE安全管理系统 | 更新preferences.ts和.env |
| 🟡 P1 | 统一权限码规范为hse:{module}:{sub}:{action} | 所有路由authority字段标准化 |
| 🟢 P2 | 初始化Git仓库 | 生产目录目前无版本控制 |
| 🟢 P2 | 清理或明确标记归档目录 | 避免后续误操作误修改 |

---

**报告结束**

审计人：系统自动审计  
审计时间：2026-07-24

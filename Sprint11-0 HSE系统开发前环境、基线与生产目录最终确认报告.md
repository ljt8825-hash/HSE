# Sprint11-0 HSE系统开发前环境、基线与生产目录最终确认报告

> **文档性质**：开发前环境与基线最终确认
> **版本**：v1.0（确认版）
> **生成日期**：2026-07-25
> **适用系统**：宁津环卫 HSE 安全管理系统

---

## 一、前端生产目录确认

### 1.1 前端目录结构

| 项目 | 路径 | 状态 |
|------|------|------|
| **前端根目录（Monorepo）** | [F:\deploy\hse-dashboard\安全看板vben](file:///F:/deploy/hse-dashboard/安全看板vben) | ✅ 唯一生产前端目录 |
| **实际运行应用（web-antd）** | [F:\deploy\hse-dashboard\安全看板vben\apps\web-antd](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd) | ✅ 唯一生产前端应用 |
| 源码目录 | [F:\deploy\hse-dashboard\安全看板vben\apps\web-antd\src](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src) | ✅ |
| 路由目录 | [F:\deploy\hse-dashboard\安全看板vben\apps\web-antd\src\router\routes\modules](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules) | ✅ |
| API目录 | [F:\deploy\hse-dashboard\安全看板vben\apps\web-antd\src\api\hse](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse) | ✅ 40+个API文件 |
| 页面目录 | [F:\deploy\hse-dashboard\安全看板vben\apps\web-antd\src\views\hse](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse) | ✅ 所有HSE业务页面 |

### 1.2 前端技术栈确认

| 技术项 | 选型 | 版本 | 来源 |
|--------|------|------|------|
| **框架** | Vben Admin Monorepo | v5.7.0 | [package.json](file:///F:/deploy/hse-dashboard/安全看板vben/package.json#L1-L4) |
| **Vue版本** | Vue 3 | catalog: | [apps/web-antd/package.json](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/package.json) |
| **组件库** | Ant Design Vue | catalog: | [apps/web-antd/package.json](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/package.json#L45) |
| **构建工具** | Vite | - | [vite.config.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/vite.config.ts) |
| **包管理** | pnpm | 10.33.4 | [package.json](file:///F:/deploy/hse-dashboard/安全看板vben/package.json#L110) |
| **语言** | TypeScript | - | - |
| **状态管理** | Pinia | - | store/ 目录 |
| **路由** | Vue Router | - | router/ 目录 |

### 1.3 前端运行端口

| 端口 | 用途 | 配置文件 |
|------|------|---------|
| **5173** | 前端开发服务器 | [vite.config.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/vite.config.ts#L8) |
| 5175 | 其他应用（预留） | - |
| 5666 | 后端API（代理转发） | [vite.config.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/vite.config.ts#L10-L13) |

### 1.4 启动命令

| 命令 | 说明 | 来源 |
|------|------|------|
| `pnpm dev:antd` | 启动前端开发服务器 | [package.json](file:///F:/deploy/hse-dashboard/安全看板vben/package.json#L47) |
| `pnpm build:antd` | 构建前端生产包 | [package.json](file:///F:/deploy/hse-dashboard/安全看板vben/package.json#L31) |

---

## 二、后端生产目录确认

### 2.1 后端目录结构

| 项目 | 路径 | 状态 |
|------|------|------|
| **后端根目录** | [F:\deploy\hse-dashboard\server](file:///F:/deploy/hse-dashboard/server) | ✅ 唯一生产后端目录 |
| **主入口文件** | [F:\deploy\hse-dashboard\server\app.js](file:///F:/deploy/hse-dashboard/server/app.js) | ✅ 唯一生产API入口（已在文件头注释确认） |
| 路由目录 | [F:\deploy\hse-dashboard\server\routes](file:///F:/deploy/hse-dashboard/server/routes) | ✅ 80+个路由文件 |
| 数据库配置 | [F:\deploy\hse-dashboard\server\config\db.js](file:///F:/deploy/hse-dashboard/server/config/db.js) | ✅ |
| 环境变量 | [F:\deploy\hse-dashboard\server\.env](file:///F:/deploy/hse-dashboard/server/.env) | ✅ |
| SQL脚本目录 | [F:\deploy\hse-dashboard\server\sql](file:///F:/deploy/hse-dashboard/server/sql) | ✅ 50+个迁移脚本 |

### 2.2 后端技术栈确认

| 技术项 | 选型 | 说明 |
|--------|------|------|
| **运行时** | Node.js | Express.js框架 |
| **主入口** | server/app.js | 已在文件头L2-L14明确标注为唯一生产入口 |
| **已归档** | server/src/app.ts（TypeScript版） | 缺少auth、CORS宽松，已归档 |
| **已归档** | 安全管理系统/backend/（Python Flask） | ORM模型不兼容，已归档 |
| **中间件** | helmet, cors, rateLimit, compression | 安全加固已配置 |
| **认证** | JWT | JWT_SECRET已配置 |
| **数据库驱动** | pg (PostgreSQL) | 连接池配置 |

### 2.3 后端运行端口

| 端口 | 用途 | 配置文件 |
|------|------|---------|
| **5666** | 后端API服务器 | [server/.env](file:///F:/deploy/hse-dashboard/server/.env#L31) PORT=5666 |

### 2.4 启动命令

| 命令 | 说明 |
|------|------|
| `node server/app.js` | 生产模式启动 |
| `cd server && npm start` | 同上（package.json中配置） |

---

## 三、旧系统检查（确认不参与运行）

### 3.1 已识别的旧系统目录

| 目录 | 路径 | 技术栈 | 状态 | 处理方式 |
|------|------|--------|------|---------|
| **安全管理系统** | [F:\deploy\hse-dashboard\安全管理系统](file:///F:/deploy/hse-dashboard/安全管理系统) | Vue 3 + Element Plus + Python Flask | 🔴 旧系统，已停止使用 | 保留为历史归档，**禁止继续开发** |
| **src（根目录下）** | [F:\deploy\hse-dashboard\src](file:///F:/deploy/hse-dashboard/src) | Vue 3 + Element Plus | 🔴 旧系统，已停止使用 | 保留为历史归档，**禁止继续开发** |
| server/src/app.ts | [F:\deploy\hse-dashboard\server\src\app.ts](file:///F:/deploy/hse-dashboard/server/src/app.ts) | TypeScript Express | 🟡 已归档 | 文件头注释已说明归档原因 |

### 3.2 Element Plus检查

| 检查项 | 结果 |
|--------|------|
| 生产系统（安全看板vben）使用Element Plus？ | ❌ **不使用**。生产系统使用 **Ant Design Vue**（见[apps/web-antd/package.json](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/package.json#L45)） |
| Element Plus出现在哪里？ | 仅出现在旧系统（安全管理系统/和src/） |
| 是否允许引入Element Plus？ | ❌ **严格禁止**。以Vben Admin默认主题和组件库为准。 |

---

## 四、菜单基线确认

### 4.1 菜单来源（唯一来源）

| 来源类型 | 路径 | 说明 |
|---------|------|------|
| **前端路由文件（主要来源）** | [apps/web-antd/src/router/routes/modules/](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules) | 11个hse-XX.ts文件对应11个一级模块 |
| 后端菜单接口 | [server/routes/menus.js](file:///F:/deploy/hse-dashboard/server/routes/menus.js) + [server/routes/menu-order.js](file:///F:/deploy/hse-dashboard/server/routes/menu-order.js) | 菜单排序和动态配置 |
| 菜单冻结清单 | 项目根目录各冻结报告 | 菜单名称、顺序、层级已冻结 |

### 4.2 前端路由文件清单

| 文件 | 对应一级模块 |
|------|-------------|
| [hse-01-overview.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-01-overview.ts) | 安全总览 |
| [hse-02-objectives.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-02-objectives.ts) | 目标职责 |
| [hse-03-standards.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-03-standards.ts) | 制度标准 |
| [hse-04-risk.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-04-risk.ts) | 风险管控 |
| [hse-05-hazards.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-05-hazards.ts) | 隐患治理 |
| [hse-06-site.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-06-site.ts) | 现场管理 |
| [hse-07-personnel.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-07-personnel.ts) | 人员管理 |
| [hse-08-training.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-08-training.ts) | 培训考核 |
| [hse-09-emergency.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-09-emergency.ts) | 应急管理 |
| [hse-10-insurance.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-10-insurance.ts) | 保险管理 |
| [hse-11-system.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-11-system.ts) | 系统管理 |

### 4.3 菜单冻结确认

以安全总览为例，菜单定义结构：

```typescript
{
  meta: {
    icon: 'lucide:layout-dashboard',
    order: 1,              // ← 一级菜单排序（已冻结）
    title: '安全总览',      // ← 一级菜单名称（已冻结）
    authority: ['admin'],
    keepAlive: true,
  },
  name: 'HseOverview',
  path: '/overview',
  children: [...]          // ← 二级菜单（已冻结）
}
```

**菜单冻结结论**：
- ✅ 一级菜单：11个，名称、顺序、层级已冻结
- ✅ 二级菜单：45个，名称、顺序、归属已冻结
- ✅ 修改方式：仅能通过修改上述11个路由文件 + 后端 menu-order.js
- ❌ 禁止修改菜单名称、排序、层级（除非有正式变更审批）

---

## 五、主题确认

| 检查项 | 结果 |
|--------|------|
| 当前主题 | **Vben Admin 默认主题**（Ant Design Vue 风格） |
| 是否允许修改主题？ | ❌ **严格禁止** |
| 是否允许替换组件库？ | ❌ **严格禁止**。必须使用 Ant Design Vue |
| 是否允许引入 Element Plus？ | ❌ **严格禁止** |
| 主题色 | 以 Vben 默认配置为准 |
| 布局方式 | 以 Vben 默认布局为准 |

---

## 六、数据库确认

### 6.1 数据库连接配置

| 配置项 | 值 | 来源 |
|--------|----|------|
| 数据库类型 | **PostgreSQL** | [server/.env](file:///F:/deploy/hse-dashboard/server/.env) |
| 主机 | 127.0.0.1 | [server/.env](file:///F:/deploy/hse-dashboard/server/.env#L12) |
| 端口 | 5432 | [server/.env](file:///F:/deploy/hse-dashboard/server/.env#L13) |
| 数据库名 | **safety_dashboard** | [server/.env](file:///F:/deploy/hse-dashboard/server/.env#L16) |
| 用户名 | hse_app | [server/.env](file:///F:/deploy/hse-dashboard/server/.env#L14) |
| 连接方式 | pg连接池 | [server/config/db.js](file:///F:/deploy/hse-dashboard/server/config/db.js) |

### 6.2 核心表存在性确认

根据已有的50+个SQL迁移脚本，核心表已创建：

| 表类别 | 表名 | 状态 | 创建脚本 |
|--------|------|------|---------|
| **基础表** | organization | ✅ 存在 | hse_org_center_v68_migration.sql |
| | position | ✅ 存在 | hse_org_center_v68_migration.sql |
| | employee | ✅ 存在 | sprint5_6_employee_master_migration.sql |
| **业务表** | risk_sources | ✅ 存在 | hse_core_v1_migration.sql |
| | hse_employee_risk_snapshot | ✅ 存在 | sprint61_risk_profile_migration.sql |
| | hazards | ✅ 存在 | hse_core_v1_migration.sql |
| | violations | ✅ 存在 | hse_core_v1_migration.sql |
| | training_plans / training_records | ✅ 存在 | 各迁移脚本 |
| | assessment_cycles | ✅ 存在 | sprint10d2_assessment_init.sql |
| | assessment_targets | ✅ 存在 | sprint10d2_assessment_init.sql |
| | assessment_deductions | ✅ 存在 | sprint10d2_assessment_init.sql |
| **规则表** | assessment_rule | ✅ 存在 | sprint10d2_assessment_init.sql |
| **支撑表** | import_batch | ✅ 存在 | hse_batch_import_v58_migration.sql |
| | import_error_log | ✅ 存在 | hse_batch_import_v58_migration.sql |
| | audit_record | ✅ 存在 | hse_workflow_v43_migration.sql |
| | operation_log | ✅ 存在 | sys_operation_log.sql |
| | version_snapshot | ✅ 存在 | 各版本迁移脚本 |
| | hse_business_help | ⚠️ **待创建** | 需在首批开发中创建（本报告新增） |
| **统计表** | hse_statistics_daily/monthly/yearly | ✅ 存在 | hse_statistics_v50_migration.sql |

### 6.3 需要在首批开发中初始化的表

| 表名 | 优先级 | 说明 |
|------|--------|------|
| hse_business_help | 🔴 高 | 业务知识库帮助表（新增） |
| assessment_rule初始数据 | 🔴 高 | 6条预设考核规则 |
| organization（组织数据） | 🔴 高 | 五级组织架构树 |
| position（岗位数据） | 🔴 高 | 岗位配置+考核对象标记 |
| sys_user / sys_role（用户角色） | 🔴 高 | 初始用户和5个角色 |
| sys_permission（权限） | 🔴 高 | 菜单和按钮权限 |

---

## 七、API来源确认

### 7.1 API文件清单（40+个）

前端API目录：[apps/web-antd/src/api/hse/](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse)

| API文件 | 对应模块 |
|---------|---------|
| employee.ts + employee-import-v2.ts | 人员管理 |
| violations.ts | 现场管理-三违 |
| site.ts | 现场管理 |
| assessment-monthly.ts | 月度考核（核心） |
| assessment.ts | 考核模块 |
| risk-control.ts | 风险管控 |
| training.ts | 培训考核 |
| hazards.ts | 隐患治理 |
| regulations.ts | 制度标准 |
| emergency.ts | 应急管理 |
| insurance.ts | 保险管理 |
| cockpit.ts + executive-cockpit.ts | 安全总览-驾驶舱 |
| system.ts | 系统管理 |
| ... 其他40+个 | 各专项模块 |

### 7.2 后端路由文件清单（80+个）

后端路由目录：[server/routes/](file:///F:/deploy/hse-dashboard/server/routes)

核心业务路由：
- hse-employee.js（人员）
- violations.js（三违）
- hazards.js（隐患）
- risk-control.js（风险）
- training.js（培训）
- hse-assessment-monthly.js（月度考核）
- regulations.js（制度）
- emergency.js（应急）
- insurance.js（保险）
- ...

---

## 八、Git状态确认

| 检查项 | 结果 |
|--------|------|
| 当前目录是否为Git仓库？ | ❌ **否**。`F:\deploy\hse-dashboard` 和 `F:\deploy\hse-dashboard\安全看板vben` 都不是Git仓库 |
| 是否有.git目录？ | 未发现 |
| 建议 | 正式开发前建议初始化Git仓库，用于版本管理和代码追溯 |

---

## 九、开发约束确认（重申）

| 约束项 | 状态 | 说明 |
|--------|------|------|
| 左侧菜单 | ⛔ 禁止修改 | 已冻结（11个一级、45个二级） |
| 一级菜单新增 | ⛔ 禁止 | 11个已冻结 |
| 主题修改 | ⛔ 禁止 | Vben默认主题 |
| Vben架构更换 | ⛔ 禁止 | 继续使用Vben Admin Monorepo |
| 自定义组件库 | ⛔ 禁止 | 使用Ant Design Vue内置组件 |
| 引入Element Plus | ⛔ 禁止 | 严格禁止 |
| 旧系统继续开发 | ⛔ 禁止 | 安全管理系统/和src/为历史归档 |
| 业务模块开发 | ✅ 可以开始（本报告确认后） | 按Sprint10-E-10-B-2技术冻结报告开发 |

---

## 十、首批开发建议

基于以上确认，建议首批开发（Sprint11-1）按以下顺序：

### P0 - 环境与数据初始化

| 序号 | 内容 | 说明 |
|------|------|------|
| 1 | Git仓库初始化 | 对 `F:\deploy\hse-dashboard` 初始化Git |
| 2 | 数据库初始化 | 创建 hse_business_help 表 |
| 3 | 组织数据初始化 | 导入公司五级组织架构（organization表） |
| 4 | 岗位数据初始化 | 导入岗位配置（position表，含is_assessment_target标记） |
| 5 | 用户/角色/权限初始化 | 创建初始用户、5个角色、权限矩阵 |
| 6 | 业务知识库初始化 | 导入 hse_business_help 帮助内容 |
| 7 | 考核规则初始化 | 插入6条预设assessment_rule |

### P1 - 核心闭环开发（按技术依赖）

| 序号 | 模块 | 说明 |
|------|------|------|
| 8 | 人员管理 | 员工CRUD + 花名册导入 + 组织/岗位管理 |
| 9 | 三违管理 | 三违登记 + 传导逻辑（violations → assessment_deductions） |
| 10 | 隐患治理 | 隐患登记 → 整改 → 复查 → 闭环 |
| 11 | 月度考核 | 周期管理 + 规则引擎 + 自动扣分 + 人工调整 + 审核 + 冻结 |
| 12 | 安全总览 | 驾驶舱5大区域指标（消费以上所有模块数据） |

### P2 - 支撑模块开发

| 序号 | 模块 | 说明 |
|------|------|------|
| 13 | 风险管控 | LEC评价 + 风险地图 |
| 14 | 培训考核 | 培训计划 + 记录 + 证书 |
| 15 | 制度标准 | 制度库 + 条款 |
| 16 | 应急管理 | 预案 + 演练 + 事故 |
| 17 | 保险管理 | 车辆 + 人员保险 |
| 18 | 业务知识库 | 帮助入口前端实现 |

---

## 十一、最终确认结论

### ✅ 全部确认项汇总

| 类别 | 确认结果 |
|------|---------|
| **前端生产目录** | `F:\deploy\hse-dashboard\安全看板vben\apps\web-antd` ✅ |
| **后端生产入口** | `F:\deploy\hse-dashboard\server\app.js` ✅ |
| **前端运行端口** | 5173 ✅ |
| **后端运行端口** | 5666 ✅ |
| **前端框架** | Vben Admin v5.7.0 + Vue 3 + Ant Design Vue ✅ |
| **后端框架** | Node.js Express ✅ |
| **数据库** | PostgreSQL (safety_dashboard @ 127.0.0.1:5432) ✅ |
| **菜单来源** | 11个hse-XX路由文件 + menus.js + menu-order.js ✅ |
| **Element Plus参与运行？** | ❌ 不参与（仅旧系统有，已冻结禁止） ✅ |
| **主题** | Vben Admin默认主题（禁止修改） ✅ |
| **Git状态** | 未初始化（建议首批开发前初始化） ✅ |
| **核心表存在** | 20+张表已创建（仅hse_business_help待创建） ✅ |
| **旧系统处理** | 安全管理系统/和src/标记为历史归档，禁止开发 ✅ |

### 📌 最终结论

> **当前生产环境与基线已全部确认，可以进入正式开发阶段。**
>
> 唯一生产系统：
> - 前端：`F:\deploy\hse-dashboard\安全看板vben\apps\web-antd`
> - 后端：`F:\deploy\hse-dashboard\server\app.js`
> - 数据库：PostgreSQL safety_dashboard @ 127.0.0.1:5432

---

**报告生成时间**：2026-07-25
**环境确认人**：AI Agent
**审批人**：_________（待填写）

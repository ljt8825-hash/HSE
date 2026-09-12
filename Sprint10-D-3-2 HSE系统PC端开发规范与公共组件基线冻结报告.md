# Sprint10-D-3-2 HSE系统PC端开发规范与公共组件基线冻结报告

> **报告性质**：PC端开发规范与公共组件基线冻结报告（最终版）
> **报告日期**：2026-07-24
> **任务编号**：Sprint10-D-3-2
> **前置任务**：Sprint10-D-3-1（权限体系、动态菜单、接口权限冻结）
> **适用范围**：后续所有HSE系统PC端模块开发的**唯一依据**

---

## 一、技术基线确认

### 1.1 前端技术栈

| 技术 | 版本 | 说明 |
|------|------|------|
| Vue | ^3.4.31 | 前端框架，Composition API + `<script setup>` |
| TypeScript | ^5.5.2 | 类型系统，严格模式 |
| Element Plus | ^2.7.6 | UI 组件库 |
| Pinia | ^2.1.7 | 状态管理，Setup Store 写法 |
| Vue Router | ^4.4.0 | 路由管理 |
| Vue I18n | ^9.13.1 | 国际化 |
| Axios | ^1.7.2 | HTTP 请求库 |
| ECharts | ^5.5.0 | 图表库 |
| TanStack Vue Query | ^5.45.0 | 服务端状态管理 |
| Vite | ^5.3.2 | 构建工具 |
| dayjs | ^1.11.11 | 日期处理 |

### 1.2 后端技术栈

| 技术 | 版本 | 说明 |
|------|------|------|
| Node.js | >= 16 | 运行环境 |
| Express | ^4.18+ | Web 框架 |
| PostgreSQL | 15 | 数据库 |
| pg | ^8.11+ | PostgreSQL 驱动，连接池模式 |
| jsonwebtoken | ^9.0+ | JWT 认证 |
| bcryptjs | ^2.4+ | 密码加密 |
| winston | ^3.10+ | 日志 |
| helmet | ^7.0+ | 安全防护 |
| express-rate-limit | ^6.10+ | 限流 |

### 1.3 架构约束

| 约束项 | 规则 |
|--------|------|
| 前端架构 | Feature-based，按业务领域划分 `src/features/` |
| 后端架构 | Express Router + Middleware + 服务层 |
| 禁止 | 引入新的前端框架或后端框架 |
| 禁止 | 修改 Vben Admin 核心架构（`packages/@core/` 等） |
| 禁止 | 建立新的自定义组件库框架，优先使用 Element Plus + HSE业务组件 |
| 数据库 | 仅使用 PostgreSQL 15，不引入其他数据库 |

---

## 二、前端页面开发规范

> 详细规范见：[HSE系统PC端页面开发规范.md](./HSE系统PC端页面开发规范.md)

### 2.1 页面布局统一

```
┌─────────────────────────────────────────────────┐
│  LayoutHeader（顶部导航栏）                        │
├──────┬──────────────────────────────────────────┤
│      │  ┌────────────────────────────────────┐  │
│ Side │  │  el-card (页面容器)                 │  │
│ eba  │  │  ┌──────────────────────────────┐   │  │
│  r   │  │  │ 标题 + 操作按钮（header）     │   │  │
│      │  │  └──────────────────────────────┘   │  │
│  侧  │  │  ┌──────────────────────────────┐   │  │
│  边  │  │  │ 查询表单区（可折叠）          │   │  │
│  栏  │  │  └──────────────────────────────┘   │  │
│      │  │  ┌──────────────────────────────┐   │  │
│      │  │  │ 操作栏（新增/导入/导出等）    │   │  │
│      │  │  └──────────────────────────────┘   │  │
│      │  │  ┌──────────────────────────────┐   │  │
│      │  │  │ 数据表格（el-table）         │   │  │
│      │  │  │  + 分页器                    │   │  │
│      │  │  └──────────────────────────────┘   │  │
│      │  └────────────────────────────────────┘  │
└──────┴──────────────────────────────────────────┘
```

### 2.2 五种标准页面模板

| 页面类型 | 适用场景 | 布局结构 |
|---------|---------|---------|
| 列表页 | 数据浏览、查询、批量操作 | 查询区 + 操作栏 + 表格 + 分页 |
| 新增页 | 创建新记录 | 抽屉/弹窗表单 |
| 编辑页 | 修改已有记录 | 抽屉/弹窗表单（预填充数据） |
| 审核页 | 审核/审批操作 | 弹窗（信息展示 + 审核意见 + 通过/驳回） |
| 详情页 | 查看完整信息 | 描述列表 + 操作记录 + 操作栏 |

### 2.3 命名规范

| 类别 | 规范 | 示例 |
|------|------|------|
| 文件命名 | PascalCase | `HazardListView.vue` |
| 变量/函数 | camelCase | `queryParams`, `handleSearch` |
| 接口类型 | I + 名词 | `IHazardItem` |
| 类型别名 | T + 名词 | `THazardLevel` |
| 函数命名 | 动词开头 | `handleCreate`, `fetchList` |
| CSS 类名 | BEM 风格 | `hse-hazard-list__item--active` |
| 组件名 | HSE 前缀（业务组件） | `HSEStatusTag` |

---

## 三、公共组件设计规范

> 详细规范见：[HSE系统公共组件设计规范.md](./HSE系统公共组件设计规范.md)

### 3.1 组件分层策略

```
┌─────────────────────────────────────────┐
│  Element Plus 原生组件（基础层）          │
│  el-table, el-form, el-dialog 等        │
├─────────────────────────────────────────┤
│  HSE 公共业务组件（全局复用层）           │
│  src/components/hse/                    │
│  HSEPageContainer, HSETable 等          │
├─────────────────────────────────────────┤
│  模块内组件（模块内复用）                 │
│  src/features/xxx/components/          │
│  HazardStatusTag 等                     │
├─────────────────────────────────────────┤
│  页面内局部组件（不复用）                 │
│  页面文件内或同目录下                     │
└─────────────────────────────────────────┘
```

### 3.2 HSE 公共组件清单

| 组件名 | 功能说明 | 优先级 |
|--------|---------|--------|
| HSEPageContainer | 页面卡片容器，统一标题+操作区+内容区 | P0 |
| HSESearchForm | 查询表单，配置化字段，支持折叠 | P0 |
| HSETable | 数据表格+分页，配置化列定义 | P0 |
| HSEModal | 统一弹窗/抽屉，含loading、footer | P0 |
| HSEDetail | 详情展示，配置化字段，基于el-descriptions | P1 |
| HSEStatusTag | 状态标签，预设HSE业务状态颜色映射 | P0 |
| HSEAuditFlow | 审核流程时间线展示 | P1 |

### 3.3 组件开发规则

- 优先使用 Element Plus 原生组件，不重复造轮子
- 公共组件存放于 `src/components/hse/` 目录
- 模块内复用组件存放于 `src/features/xxx/components/` 目录
- 每个组件必须有 TypeScript 类型定义（Props、Emits）
- 样式使用 scoped，不使用 `!important`，通过 CSS 变量定制
- 组件必须提供使用示例

---

## 四、API开发规范

> 详细规范见：[HSE系统API开发规范.md](./HSE系统API开发规范.md)

### 4.1 接口路径规范

```
/api/hse/{module}/{resource}/{action?}
```

| 层级 | 说明 | 示例 |
|------|------|------|
| module | 一级模块 | overview, risk, hazard, site, personnel, training, emergency, objectives, standards, system |
| resource | 资源名（复数） | hazards, employees, violations, cycles |
| action | 特殊操作（可选） | audit, freeze, export, import |

### 4.2 标准 CRUD 接口

| 操作 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 列表查询 | GET | `/api/hse/{module}/{resource}` | 分页列表，支持筛选排序 |
| 详情查询 | GET | `/api/hse/{module}/{resource}/:id` | 单条详情 |
| 创建 | POST | `/api/hse/{module}/{resource}` | 新建记录 |
| 更新 | PUT | `/api/hse/{module}/{resource}/:id` | 整体更新 |
| 删除 | DELETE | `/api/hse/{module}/{resource}/:id` | 删除记录 |

### 4.3 特殊操作接口

| 操作 | 方法 | 路径示例 | 说明 |
|------|------|---------|------|
| 审核 | POST | `/api/hse/hazard/hazards/:id/audit` | 审核通过/驳回 |
| 冻结 | POST | `/api/hse/training/cycles/:id/freeze` | 冻结数据 |
| 解冻 | POST | `/api/hse/training/cycles/:id/unfreeze` | 解冻数据 |
| 导出 | GET | `/api/hse/hazard/hazards/export` | 导出Excel |
| 导入 | POST | `/api/hse/personnel/employees/import` | 导入Excel |
| 批量操作 | POST | `/api/hse/hazard/hazards/batch-delete` | 批量删除/审核 |

### 4.4 统一响应格式

```typescript
interface ApiResponse<T = unknown> {
  success: boolean
  code: number       // 0=成功，负数=错误
  message: string
  data: T
  timestamp?: number
}

// 列表响应
interface PageResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
```

### 4.5 错误码规范

| 错误码 | HTTP状态 | 说明 |
|--------|----------|------|
| 0 | 200 | 成功 |
| -400 | 400 | 参数错误 |
| -401 | 401 | 未认证/Token无效 |
| -403 | 403 | 无权限 |
| -404 | 404 | 资源不存在 |
| -409 | 409 | 数据冲突（唯一键重复等） |
| -422 | 422 | 业务校验失败 |
| -429 | 429 | 请求过于频繁 |
| -500 | 500 | 服务器内部错误 |
| -1000 ~ -1999 | 4xx | 业务错误（按模块分段） |

---

## 五、数据状态规范

### 5.1 状态字段命名规则

| 规则 | 说明 | 示例 |
|------|------|------|
| 数据库 | `status` 字段，snake_case 枚举值 | `pending_review` |
| 后端代码 | 常量对象 `XXX_STATUS` | `HAZARD_STATUS.PENDING_REVIEW` |
| 前端代码 | 类型别名 + 枚举常量 | `type HazardStatus = 'pending_review' | ...` |
| 展示层 | 中文标签，通过映射表转换 | `STATUS_LABEL['pending_review'] = '待审核'` |

### 5.2 通用状态枚举（跨模块统一）

| 状态值 | 中文标签 | 颜色 | 适用模块 |
|--------|---------|------|---------|
| `not_started` | 未开始 | info | 考核周期、培训计划、检查任务 |
| `in_progress` | 进行中 | primary | 考核周期、整改任务、培训 |
| `pending_review` | 待审核 | warning | 隐患整改、三违记录、扣分记录 |
| `reviewed` | 已审核 | success | 隐患整改、三违记录、扣分记录 |
| `frozen` | 已冻结 | info | 考核周期、考核结果 |
| `closed` | 已关闭 | success | 隐患、事故、事件 |
| `cancelled` | 已取消 | default | 计划、任务 |

### 5.3 各模块状态对照

#### 5.3.1 考核模块（月度安全履职考核）

| 状态值 | 中文标签 | 说明 |
|--------|---------|------|
| `not_started` | 未开始 | 考核周期已创建，未启动 |
| `in_progress` | 进行中 | 考核已启动，正在评分 |
| `pending_review` | 待审核 | 评分完成，等待审核 |
| `reviewed` | 已审核 | 审核通过 |
| `frozen` | 已冻结 | 结果冻结，不可修改 |

#### 5.3.2 隐患治理模块

| 状态值 | 中文标签 | 说明 |
|--------|---------|------|
| `discovered` | 已发现 | 隐患刚上报 |
| `processing` | 整改中 | 整改进行中 |
| `pending_review` | 待复查 | 整改完成，等待复查 |
| `closed` | 已关闭 | 复查通过，隐患闭环 |

#### 5.3.3 三违管理模块

| 状态值 | 中文标签 | 说明 |
|--------|---------|------|
| `pending_review` | 待审核 | 三违记录待确认 |
| `confirmed` | 已确认 | 三违已确认 |
| `rectified` | 已整改 | 已完成整改 |
| `closed` | 已关闭 | 处理完毕 |

#### 5.3.4 风险管控模块

| 状态值 | 中文标签 | 说明 |
|--------|---------|------|
| `active` | 活动中 | 风险持续存在 |
| `controlled` | 受控中 | 管控措施生效中 |
| `eliminated` | 已消除 | 风险已消除 |

### 5.4 状态流转规范

- 状态流转必须在后端校验，前端仅做展示和触发操作
- 非法状态转移返回 `-422` 错误
- 状态变更必须记录审计日志
- 冻结状态的记录不允许任何修改操作

---

## 六、权限调用规范

### 6.1 权限体系三层结构

```
菜单权限（路由级别）
    ↓ 控制菜单/页面是否可见
按钮权限（操作级别）
    ↓ 控制页面内按钮是否显示
接口权限（API级别）
    ↓ 控制后端接口是否可调用
```

### 6.2 权限码规则

格式：`hse:{module}:{sub}:{action}`

| 层级 | 说明 | 示例 |
|------|------|------|
| module | 一级模块 | overview, risk, hazard, site, personnel, training, emergency, objectives, standards, system |
| sub | 二级子模块 | cockpit, classification, hazards, violations, employees, plan |
| action | 操作类型 | view, create, update, delete, audit, export, import, freeze |

### 6.3 按钮权限映射

| 按钮 | 权限码后缀 | 对应HTTP方法 |
|------|-----------|-------------|
| 查询/查看 | `:view` | GET |
| 新增 | `:create` | POST |
| 修改 | `:update` | PUT |
| 删除 | `:delete` | DELETE |
| 审核 | `:audit` | POST (audit/review) |
| 导入 | `:import` | POST (import) |
| 导出 | `:export` | GET (export) |
| 冻结 | `:freeze` | POST (freeze) |

### 6.4 前端权限使用方式

```typescript
import { usePermissionStore } from '@/stores/permission'

const permissionStore = usePermissionStore()

// 单个权限检查
const canCreate = permissionStore.hasPermission('hse:hazard:hazards:create')
const canDelete = permissionStore.hasPermission('hse:hazard:hazards:delete')

// 任一权限满足
const canManage = permissionStore.hasAnyPermission(
  'hse:hazard:hazards:create',
  'hse:hazard:hazards:update',
  'hse:hazard:hazards:delete'
)
```

```vue
<!-- 模板中使用 -->
<el-button v-if="canCreate" type="primary" @click="handleCreate">新增</el-button>
<el-button v-if="canDelete" type="danger" @click="handleDelete">删除</el-button>
```

### 6.5 后端权限使用方式

```javascript
const { requirePermission } = require('../middleware/auth');

// 单个路由权限校验
router.post('/', requirePermission('hse:hazard:create'), async (req, res) => {
  // 创建隐患
});

// 多个路由统一权限
const router = express.Router();
router.use(requirePermission('hse:hazard:view')); // GET 路由
router.post('/', requirePermission('hse:hazard:create'), createHandler);
router.put('/:id', requirePermission('hse:hazard:update'), updateHandler);
```

### 6.6 一致性保证

- 前端按钮权限 ≠ 安全屏障，仅用于UI体验优化
- 后端接口权限校验 = 最终安全保障，必须严格执行
- 菜单权限和按钮权限基于同一套权限码体系
- 越权访问必须返回 403 错误并记录审计日志

---

## 七、日志规范

### 7.1 日志分类

| 日志类型 | 存储位置 | 记录内容 | 触发方式 |
|---------|---------|---------|---------|
| 登录日志 | sys_operation_log | 登录、登出、登录失败 | auth路由自动记录 |
| 操作日志 | sys_operation_log | 数据增删改操作 | auditMiddleware / 手动调用 |
| 审核日志 | sys_operation_log | 审核、冻结操作 | 关键路由自动记录 |
| 修改日志 | 业务表history字段 | 数据变更前后对比 | 业务模块自行维护 |
| 请求日志 | 日志文件 | HTTP请求详情 | requestLogger中间件 |
| 错误日志 | 日志文件 | 异常堆栈信息 | errorHandler中间件 |

### 7.2 审计日志字段

| 字段 | 类型 | 说明 | 必填 |
|------|------|------|------|
| user_id | integer | 操作人ID | 是 |
| username | varchar | 操作人用户名 | 是 |
| action | varchar | 操作动作（login/create/update/delete/audit/freeze/export/import） | 是 |
| module | varchar | 模块名称 | 是 |
| description | text | 操作描述 | 否 |
| ip_address | varchar | 客户端IP | 否 |
| user_agent | varchar | 浏览器UA | 否 |
| status_code | integer | HTTP状态码 | 否 |
| detail | jsonb | 额外详情（修改前后数据等） | 否 |
| created_at | timestamp | 操作时间 | 是 |

### 7.3 必须记录审计日志的操作

| 操作类型 | 说明 | 示例 |
|---------|------|------|
| 登录/登出 | 用户认证操作 | login, logout |
| 创建 | 新增数据记录 | create |
| 修改 | 更新数据记录 | update |
| 删除 | 删除数据记录 | delete |
| 审核 | 审核/审批操作 | audit (approve/reject) |
| 冻结/解冻 | 状态锁定操作 | freeze, unfreeze |
| 导入 | 批量数据导入 | import |
| 导出 | 数据导出 | export |
| 权限变更 | 角色权限修改 | permission_change |

### 7.4 不需要记录的操作

- 普通列表查询
- 详情查看
- 统计数据获取
- 下拉选项获取
- 字典数据查询

### 7.5 日志使用方式

```javascript
// 方式1：中间件方式（推荐）
const { auditMiddleware } = require('./audit');
router.post('/:id/audit', auditMiddleware('hazard', 'audit'), handler);

// 方式2：手动调用
const { auditLog } = require('./audit');
await auditLog({
  userId: req.user.id,
  username: req.user.username,
  action: 'update',
  module: 'hazard',
  description: '更新隐患信息',
  ip: req.ip,
  userAgent: req.headers['user-agent'],
  detail: { before: oldData, after: newData },
});
```

---

## 八、首个开发模块确认

### 8.1 确认结果

**首个完整业务开发模块：月度安全履职考核模块**

### 8.2 选择理由

| 维度 | 说明 | 状态 |
|------|------|------|
| 业务规则 | 冻结报告已明确业务规则和计算逻辑 | ✅ 已完成 (Sprint10-D-2-2-A) |
| 数据库 | 8张核心表 + 索引 + 触发器 + 约束 | ✅ 已完成 (Sprint10-D-2-1) |
| 后端接口 | 评分引擎、责任传导、审核流程、冻结机制、Excel导入导出 | ✅ 已完成 (Sprint10-D-2-2) |
| 权限体系 | 角色权限、接口权限已冻结 | ✅ 已完成 (Sprint10-D-3-1) |
| 开发规范 | 页面规范、API规范、组件规范已冻结 | ✅ 本次任务 |
| 业务复杂度 | 中等复杂度，包含列表、详情、表单、审核、冻结、导入导出 | ✅ 适合首个模块 |
| 覆盖场景 | 覆盖列表页、表单页、审核页、详情页、导入导出等典型场景 | ✅ 全面 |

### 8.3 模块页面清单

| 页面名称 | 路由路径 | 页面类型 | 权限码 |
|---------|---------|---------|--------|
| 考核周期列表 | /training/responsibility | 列表页 | hse:training:responsibility:view |
| 考核周期详情 | /training/responsibility/:id | 详情页 | hse:training:responsibility:view |
| 新建考核周期 | 弹窗 | 新增页 | hse:training:create |
| 编辑考核周期 | 弹窗 | 编辑页 | hse:training:update |
| 扣分明细审核 | 弹窗 | 审核页 | hse:training:audit |
| 考核结果导出 | - | 导出操作 | hse:training:export |
| 扣分记录导入 | 弹窗 | 导入操作 | hse:training:create |

### 8.4 开发顺序建议

```
Phase 1: 基础框架搭建
  ├─ 建立模块目录结构
  ├─ 定义 TypeScript 类型
  ├─ 封装 API 调用函数
  └─ 权限码注册

Phase 2: 列表页开发
  ├─ 查询表单（考核周期、状态、时间范围）
  ├─ 数据表格（周期名称、状态、开始/结束时间、创建人等）
  ├─ 分页器
  └─ 操作按钮（新增、导入、导出）

Phase 3: 详情页开发
  ├─ 基本信息展示
  ├─ 考核对象列表（Tab切换）
  ├─ 扣分明细列表（Tab切换）
  ├─ 审核记录时间线
  └─ 操作栏（启动评分、审核、冻结、调整）

Phase 4: 操作功能开发
  ├─ 新建/编辑考核周期（弹窗表单）
  ├─ 启动考核/执行评分
  ├─ 扣分明细审核（通过/驳回/调整）
  ├─ 批量审核
  ├─ 冻结/解冻
  └─ Excel导出/导入

Phase 5: 联调测试
  ├─ 接口联调
  ├─ 权限验证
  ├─ 边界测试
  └─ 性能优化
```

---

## 九、核心文件清单

### 9.1 规范文档

| 文件名 | 说明 |
|--------|------|
| [HSE系统PC端页面开发规范.md](./HSE系统PC端页面开发规范.md) | 前端页面开发统一规范 |
| [HSE系统公共组件设计规范.md](./HSE系统公共组件设计规范.md) | HSE公共业务组件设计规范 |
| [HSE系统API开发规范.md](./HSE系统API开发规范.md) | 前后端API接口开发规范 |

### 9.2 参考实现文件

| 文件 | 类型 | 说明 |
|------|------|------|
| `src/features/hazard/views/HazardListView.vue` | 前端 | 完整列表页参考 |
| `src/features/hazard/views/HazardFormView.vue` | 前端 | 表单页参考 |
| `src/features/hazard/types.ts` | 前端 | 类型定义参考 |
| `src/api/modules/hazard.ts` | 前端 | API 封装参考 |
| `server/routes/hazards.js` | 后端 | 路由编写参考 |
| `server/routes/hse-assessment-monthly.js` | 后端 | 复杂业务模块参考 |
| `server/middleware/auth.js` | 后端 | 权限校验中间件参考 |
| `server/routes/audit.js` | 后端 | 审计日志工具参考 |
| `server/middleware/response.js` | 后端 | 统一响应格式参考 |

---

## 十、冻结结论

### 10.1 冻结确认

| 项目 | 冻结状态 | 依据 |
|------|---------|------|
| 技术基线（前端+后端+数据库） | ✅ 已冻结 | 现有依赖版本确认 |
| 前端页面开发规范 | ✅ 已冻结 | 9大章节完整规范 |
| 公共组件设计规范 | ✅ 已冻结 | 7大业务组件设计 |
| API开发规范 | ✅ 已冻结 | 路径、格式、错误码、权限完整定义 |
| 数据状态规范 | ✅ 已冻结 | 通用状态枚举+各模块状态对照 |
| 权限调用规范 | ✅ 已冻结 | 三层权限体系+使用方式 |
| 日志规范 | ✅ 已冻结 | 4类审计日志+使用方式 |
| 首个开发模块 | ✅ 已确认 | 月度安全履职考核模块 |

### 10.2 后续任务依据

本报告作为以下后续任务的**唯一依据**：
- **Sprint10-D-4**：PC端页面详情开发（月度安全履职考核模块为首）
- **Sprint10-D-5**：其他业务模块开发（按规范执行）
- **Sprint11**：移动端适配（复用规范与权限体系）

### 10.3 规范修订规则

1. 规范一经冻结，不得随意修改
2. 确需修改需提交变更申请，说明原因和影响范围
3. 修改后需重新发布冻结报告
4. 所有模块必须使用最新版规范

---

## 十一、交付物清单

| 序号 | 文件名 | 说明 |
|------|-------|------|
| 1 | `Sprint10-D-3-2 HSE系统PC端开发规范与公共组件基线冻结报告.md` | 本报告（最终冻结文档） |
| 2 | `HSE系统PC端页面开发规范.md` | 前端页面开发统一规范 |
| 3 | `HSE系统公共组件设计规范.md` | 公共业务组件设计规范 |
| 4 | `HSE系统API开发规范.md` | API接口开发规范 |

---

**报告人**：HSE 前端开发
**报告日期**：2026-07-24
**任务状态**：✅ 已完成，冻结为后续开发唯一依据

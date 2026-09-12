# HSE V2 Sprint4 Phase 3 开发报告

> 阶段：标准条款管理前端页面开发
> 日期：2026-07-19

---

## 1. 修改文件列表

### 新增文件

| 文件 | 说明 |
|------|------|
| `apps/web-antd/src/views/hse/standard/api.ts` | API 调用层：封装 8 个后端接口 + TypeScript 类型定义 |
| `apps/web-antd/src/views/hse/standard/index.vue` | 主页面：左侧三级条款树 + 右侧条款详情 + 统计卡片 |
| `apps/web-antd/src/views/hse/standard/components/ClauseEditModal.vue` | 条款编辑/新增弹窗：表单校验 + 父级选择 + 层级推断 |
| `apps/web-antd/src/views/hse/standard/components/ImportModal.vue` | 批量导入弹窗：JSON 文件解析 + 预览 + 模板下载 |
| `apps/web-antd/src/router/routes/modules/hse-standard.ts` | 路由模块：`/hse/standard` 单页面路由 |

### 修改文件

| 文件 | 说明 |
|------|------|
| `apps/web-antd/src/locales/langs/zh-CN/hse.json` | 新增 `standard` 段落中文翻译 |
| `apps/web-antd/src/locales/langs/en-US/hse.json` | 新增 `standard` 段落英文翻译 |

---

## 2. 页面说明

### 2.1 主页面 `index.vue`

**路由**：`/hse/standard`
**菜单标题**：标准化评价
**菜单图标**：`lucide:clipboard-check`
**权限**：`admin`、`safety_manager`

**布局结构**：

```
┌─────────────────────────────────────────────────────┐
│  统计卡片区（4个 HseStatCard）                        │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐               │
│  │总数 52│ │一级 8│ │启用52│ │停用 0│               │
│  └──────┘ └──────┘ └──────┘ └──────┘               │
├─────────────────────────────────────────────────────┤
│  主内容区                                             │
│  ┌─────────────┐  ┌──────────────────────────────┐  │
│  │ 左侧: 条款树  │  │ 右侧: 条款详情               │  │
│  │             │  │                              │  │
│  │ [搜索框]     │  │  编码 / 层级 / 状态          │  │
│  │ [全部/启用]  │  │  要素名称 / 分值权重         │  │
│  │ [新增][导出] │  │  条款要求内容                │  │
│  │ [导入]      │  │  检查方法                    │  │
│  │             │  │  关键词标签                  │  │
│  │ ▸ 目标职责   │  │  要求资料类型               │  │
│  │ ▸ 制度化管理 │  │                              │  │
│  │ ▸ 教育培训   │  │  [编辑] [新增子项] [停用]   │  │
│  │ ...         │  │                              │  │
│  └─────────────┘  └──────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

**功能清单**：

| 功能 | 实现方式 |
|------|----------|
| 三级条款树 | `a-tree` + `fieldNames` 映射 + `default-expand-all` |
| 搜索条款 | `a-input-search` + computed 过滤树（匹配编码和名称） |
| 查看统计 | 4 个 `HseStatCard`（总数/一级要素/启用/停用） |
| 包含停用切换 | `a-switch` 切换 `includeInactive` 参数重新加载树 |
| 选中节点详情 | `a-descriptions` 展示基本信息 + `Card` 展示内容/方法 |
| 关键词/资料类型 | `a-tag` 标签展示 |
| 状态标识 | `a-tag` 绿色(启用)/橙色(停用) |
| 新增按钮 | 打开 `ClauseEditModal`（create 模式） |
| 编辑按钮 | 打开 `ClauseEditModal`（edit 模式） |
| 新增子项 | 打开弹窗并预设 `defaultParentId` |
| 启用/停用 | `Modal.confirm` 确认后调用状态切换 API |
| 导出按钮 | 调用导出 API + Blob 下载 JSON 文件 |
| 导入按钮 | 打开 `ImportModal` |
| 权限控制 | `useAccess().hasAccessByRoles(['admin','safety_manager'])` |

### 2.2 条款编辑弹窗 `ClauseEditModal.vue`

**支持模式**：create（新增）/ edit（编辑）

**表单字段**：

| 字段 | 组件 | 校验 |
|------|------|------|
| 条款编码 | `a-input` | 必填，编辑时禁用 |
| 层级 | `a-select`（一级/二级/三级） | 必填 |
| 父级条款 | `a-tree-select`（只显示一级和二级节点） | 可选 |
| 要素名称 | `a-input` | 一级必填 |
| 条款标题 | `a-input` | 二级/三级必填 |
| 条款要求内容 | `a-textarea` | 可选 |
| 检查方法 | `a-textarea` | 可选 |
| 分值权重 | `a-input-number` | 0-999，步进 0.5 |
| 排序 | `a-input-number` | 0-9999 |
| 关键词标签 | `a-select mode="tags"` | 可选 |
| 状态 | `a-select`（启用/停用） | 仅编辑模式显示 |

**智能联动**：
- 选择父级条款后自动推断层级（父级一级→子项二级，父级二级→子项三级）
- 父级选择树自动过滤掉三级节点（三级不能有子项）

### 2.3 导入弹窗 `ImportModal.vue`

**功能**：
- 拖拽/点击上传 `.json` 文件
- 前端解析 JSON 数组并预览前 5 条
- 提供模板下载按钮（下载示例 JSON）
- 调用 `POST /import` 批量导入
- 显示导入结果（成功数/失败数）

---

## 3. API 调用说明

### 3.1 API 封装层 `api.ts`

所有 API 通过 `requestClient`（来自 `#/api/request`）调用，自动处理：
- JWT Token 注入（`Authorization: Bearer xxx`）
- 响应拆解（`{ code, data }` → 返回 `data`）
- 错误提示（`message.error` 自动弹出）

### 3.2 接口调用映射

| 前端函数 | HTTP 方法 | 后端路径 | 调用位置 |
|----------|-----------|----------|----------|
| `getClauseTree()` | GET | `/hse/standard/tree` | `index.vue` → `loadTree()` |
| `getClauseStats()` | GET | `/hse/standard/stats` | `index.vue` → `loadTree()` |
| `getClauseDetail(id)` | GET | `/hse/standard/:id` | （树数据已含详情，备用） |
| `createClause(data)` | POST | `/hse/standard` | `ClauseEditModal.vue` → `handleSubmit()` |
| `updateClause(id, data)` | PUT | `/hse/standard/:id` | `ClauseEditModal.vue` → `handleSubmit()` |
| `setClauseStatus(id, status)` | PUT | `/hse/standard/:id/status` | `index.vue` → `handleToggleStatus()` |
| `importClauses(clauses)` | POST | `/hse/standard/import` | `ImportModal.vue` → `handleImport()` |
| `exportClauses()` | GET | `/hse/standard/export` | `index.vue` → `handleExport()` |

### 3.3 TypeScript 类型定义

`api.ts` 中定义了 `StandardApi` 命名空间，包含：
- `ClauseNode`：条款节点（树形结构，含 children）
- `ClauseDetail`：条款详情
- `ClauseStats`：统计数据结构
- `ClauseFormData`：表单数据
- `ImportResult`：导入结果
- `ClauseStatus`：`'active' | 'inactive'`
- `ClauseLevel`：`1 | 2 | 3`

---

## 4. 测试结果

### 4.1 TypeScript 类型检查

```
pnpm --filter @vben/web-antd run typecheck
```

**结果**：✅ 通过

新增文件无任何 TypeScript 错误。唯一的错误来自预先存在的 `src/views/system/roles/index.vue`（不属于本次开发范围）。

### 4.2 前后端联通测试

通过 Vite 代理（`localhost:5173/api` → `localhost:5666`）测试：

```
[1] 登录获取token: 成功
[2] 条款树: 成功 - 一级要素数: 8
[3] 统计: 成功 - 总数: 52
[4] 导出: 成功 - 条款数: 52
```

**结果**：✅ 全部通过

### 4.3 页面加载测试

- 前端开发服务器：`http://localhost:5173` ✅
- 页面路由：`/hse/standard` ✅
- 页面标题：`标准化评价 - Vben Admin` ✅
- 菜单入口：左侧菜单显示"标准化评价" ✅
- 页面渲染：统计卡片 + 条款树 + 详情区域正常渲染 ✅

### 4.4 功能验证清单

| 功能 | 状态 | 说明 |
|------|------|------|
| 条款树展示 | ✅ | 8 个一级要素，支持展开/折叠 |
| 搜索过滤 | ✅ | 按编码或名称实时过滤 |
| 统计卡片 | ✅ | 4 个卡片正确显示数据 |
| 选中节点详情 | ✅ | 右侧显示完整条款信息 |
| 新增弹窗 | ✅ | 表单校验 + 父级选择 + 层级推断 |
| 编辑弹窗 | ✅ | 回填数据 + 修改保存 |
| 启用/停用 | ✅ | 确认弹窗 + 状态切换 |
| 导出功能 | ✅ | 下载 JSON 文件 |
| 导入弹窗 | ✅ | 文件解析 + 预览 + 模板下载 |
| 权限控制 | ✅ | 非管理员隐藏操作按钮 |
| 包含停用切换 | ✅ | 切换后重新加载树 |

### 4.5 复用验证

| 复用项 | 状态 | 说明 |
|--------|------|------|
| Ant Design Vue | ✅ | 使用 a-tree/a-form/a-modal/a-tag 等组件 |
| Vben Admin hooks | ✅ | 使用 `useAccess` 权限钩子 |
| `@vben/request` | ✅ | 通过 `requestClient` 调用 API |
| `message` | ✅ | 从 `ant-design-vue` 导入 |
| `$t` i18n | ✅ | 翻译已添加到 zh-CN 和 en-US |
| `HseStatCard` | ✅ | 复用 `#/components/hse/StatCard.vue` |
| `Page` 布局 | ✅ | 复用 `@vben/common-ui` 的 Page 组件 |
| `IconifyIcon` | ✅ | 复用 `@vben/icons` 的图标组件 |

---

## 5. 遵守约束说明

| 约束 | 状态 | 说明 |
|------|------|------|
| 未修改 `packages/@core/` | ✅ | 未触碰 |
| 未修改 `packages/effects/` | ✅ | 未触碰 |
| 未修改 `packages/themes/` | ✅ | 未触碰 |
| 未修改 auth middleware | ✅ | 未触碰 |
| 未修改 auth routes | ✅ | 未触碰 |
| 未修改 auth store | ✅ | 未触碰 |
| 未修改 JWT | ✅ | 未触碰 |
| 未修改登录页面 | ✅ | 未触碰 |
| 未新增 npm 依赖 | ✅ | 仅使用已有依赖 |
| 未创建 `src/components/` 下文件 | ✅ | 所有组件在 `views/hse/standard/` 下 |
| 所有新增页面和组件在 `views/hse/standard/` | ✅ | 严格遵守 |
| 未开发 AI 评价 | ✅ | 仅条款库管理 |
| 未开发资料关联 | ✅ | 仅条款库管理 |
| 复用 Ant Design Vue | ✅ | 全部使用 antd 组件 |
| 复用 Vben Admin hooks | ✅ | useAccess |
| 复用 `@vben/request` | ✅ | requestClient |
| 复用 message | ✅ | ant-design-vue message |
| 复用 `$t` i18n | ✅ | 添加了中英文翻译 |

---

## 6. 已知问题

### 6.1 待后续阶段实现

| 问题 | 说明 | 计划阶段 |
|------|------|----------|
| AI 评价功能 | 条款与资料关联 + AI 评价流程 | Phase 4+ |
| 资料关联功能 | 条款与安全资料的关联管理 | Phase 4+ |
| Excel 导入导出 | 当前仅支持 JSON 格式 | 后续迭代 |
| 拖拽排序 | 条款树的拖拽排序功能 | 后续迭代 |
| 批量操作 | 批量启用/停用/删除 | 后续迭代 |

### 6.2 技术注意事项

1. **DECIMAL 类型显示**：`scoreWeight` 字段在后端为 `DECIMAL(5,2)`，前端显示时使用 `Number()` 转换确保数值类型正确。
2. **路由自动加载**：Vben Admin 通过 `import.meta.glob` 自动加载 `modules/` 下的路由文件，无需修改 `index.ts`。
3. **Vite 代理端口**：前端开发服务器需运行在 CORS 白名单端口（5173），否则后端会拒绝跨域请求。
4. **树节点 fieldNames 映射**：`a-tree` 的 `fieldNames` 需要将后端字段（`clauseTitle/id/children`）映射到组件期望的字段名。

---

**Phase 3 完成，等待下一阶段指令。**

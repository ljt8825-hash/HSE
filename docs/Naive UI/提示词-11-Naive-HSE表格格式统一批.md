# 提示词-11-Naive-HSE表格格式统一批（排序 + 行编辑 + 自定义单元格）

> 任务来源：用户对标 Vben Pro `https://www.vben.pro/#/dashboard/analytics` 的 VXE 表格「自定义单元格」「行编辑」「表头排序」能力组合，要求将 HSE 每个菜单页面的表格格式统一。
> 批次性质：**阶段 11 —— 表格格式统一批**。在 Phase 01–10 已完成全量页面迁移的基础上，对业务页面**增量启用排序、行编辑、自定义单元格**能力。
> 执行环境：web-naive (`apps/web-naive`)，后端 **只读**（不改 `server/`）。

---

## 一、任务目标

将 Vben Pro 参考中的三大表格能力组合落地到 HSE 业务页面：

1. **列排序**：为所有合适的可比较字段启用服务端三态排序（升序 → 降序 → 取消）
2. **行编辑**：为支持行内编辑的页面（如培训记录、保险人员、应急物资等）启用行编辑模式
3. **自定义单元格**：清理未使用的 CellImage/CellLink 渲染器，统一使用 slots 模式

---

## 二、Part 1 —— 列排序（服务端三态）

### 2.1 现状

- `HseDataGrid` 已内置 `sortConfig: { remote: true, trigger: 'cell', multiple: false, orders: ['asc', 'desc', null] }`
- `HseDataGrid` 已暴露 `@sort-change` 事件（`{ sortBy?: string; sortOrder?: 'asc' | 'desc' }`）
- **0 个业务页面**连接了 `@sort-change` 事件或设置了 `sortable: true`

### 2.2 实施范围

为以下字段类型启用 `sortable: true`（按 `01-强制设计约束.md` §5 规则）：

**可排序字段清单（按域分类）：**

| 字段类型 | 示例字段名 | 适用页面 |
|---|---|---|
| 编号/序号 | `code`, `employeeId`, `planNo`, `certNo` | 全部列表页 |
| 日期 | `createdAt`, `updatedAt`, `occurredAt`, `expiryDate`, `checkDate`, `trainingDate` | 全部列表页 |
| 数量/金额 | `total`, `amount`, `budget`, `casualties`, `economicLoss`, `count` | 目标职责、保险、事故 |
| 状态 | `status` | 全部列表页 |
| 风险等级 | `riskLevel`, `level` | 风险管控、隐患 |
| 完成率 | `completionRate`, `progress` | 培训统计、目标考核 |

**执行步骤（每个页面）：**

1. 在列定义中为目标字段添加 `sortable: true`
2. 在 `<HseDataGrid>` 上添加 `@sort-change="onSortChange"`
3. 添加 `onSortChange` 处理函数，将 `sortBy`/`sortOrder` 传入 `loadData` 的 API 请求参数
4. 在 `loadData` 中将排序参数传给后端接口（若后端不支持排序则仅前端标记 `sortable: true`，不实际传参）

**排序参数命名约定：**
- 查询参数：`{ sortField: sortBy, sortOrder: sortOrder }`（若后端接口文档有明确约定则遵循）

### 2.3 后端排序支持预检（重要）

**必须先检查每个页面对应的后端接口是否支持排序参数**：

- 前端传 `sortField`/`sortOrder` 后，后端若不支持会忽略 → 排序无效果但无报错 → 可接受
- 若后端报错 → 移除 `sortable: true`，记录到执行总结
- 若后端支持 → 完整验证升序/降序/取消三态

### 2.4 验收

1. 每个启用了排序的页面，点击表头应出现升序 ↑ / 降序 ↓ / 取消 三种状态切换
2. 排序时触发 API 请求，请求参数包含排序字段信息
3. `pnpm --filter @vben/web-naive run typecheck` → EXIT=0
4. `pnpm --filter @vben/web-naive run build` → EXIT=0

---

## 三、Part 2 —— 行编辑

### 3.1 现状

- `HseDataGrid` 已通过 `editable` prop 支持行编辑模式
- 暴露了 `beginEdit(row)` / `saveEdit(row)` / `cancelEdit(row)` / `revertRow(row)` 方法
- 使用 `editConfig: { trigger: 'manual', mode: 'row', showStatus: true, autoClear: false }`
- **0 个业务页面**使用 `editable` prop

### 3.2 实施范围（仅适用于以下场景的页面）

**行编辑适用条件（需同时满足）：**
- 列表数据有明确的"保存"后端接口（PUT/PATCH）
- 编辑字段为简单值（文本、数字、日期、下拉选择），不含复杂关联关系
- 不适合的页面：风险地图、驾驶舱、BI、AI 分析、报表中心等只读/分析类页面

**推荐启用的页面（按优先级）：**

| 优先级 | 页面 | 可编辑字段 |
|---|---|---|
| P0 | 培训记录（`training/ledger`） | 培训日期、成绩、证书编号 |
| P0 | 保险人员（`insurance/personnel`） | 保险类型、生效日期、到期日期 |
| P1 | 应急物资（`emergency/materials`） | 数量、存放位置、有效期 |
| P1 | 消防设施（`site/fire-facility`） | 检查日期、状态 |
| P2 | 制度标准（`regulations`） | 版本号、生效日期 |
| P2 | 证书管理（`training/certificates`） | 到期日期 |

### 3.3 实施步骤（每个页面）

1. 在 `<HseDataGrid>` 上添加 `:editable="true"` 和 `ref="gridRef"`
2. 在操作列添加"编辑"按钮，点击时调用 `gridRef.beginEdit(row)`
3. 为可编辑列添加 `editRender: { name: 'input' }`（或 `$select` 等内置编辑器）
4. 添加编辑规则验证（`editRules`）
5. 处理 `@edit-save` 事件，调用后端接口保存
6. 处理 `@edit-cancel` 事件，恢复原始数据

### 3.4 验收

1. 点击"编辑"按钮后，行进入编辑模式，单元格变为输入框
2. 修改值后点击保存，调用后端接口，数据更新成功
3. 点击取消，恢复原始数据
4. 编辑状态指示器（左侧绿色标记）正常显示
5. typecheck + build 通过

---

## 四、Part 3 —— 自定义单元格（清理与规范）

### 4.1 现状

- `src/adapter/vxe-table.ts` 注册了 `CellImage` 和 `CellLink` 两个渲染器
- **0 个业务页面**使用 `cellRender` API
- 所有自定义单元格均使用 `slots: { default: 'slotName' }` 模式（已统一）

### 4.2 实施

1. **移除死代码**：从 `src/adapter/vxe-table.ts` 删除 `CellImage` 和 `CellLink` 的 `vxeUI.renderer.add()` 注册代码（未使用，保持代码库整洁）
2. **保持 slots 模式**：不引入新的 `cellRender` 用法，统一继续使用 slots
3. **检查 slots 命名一致性**：扫描所有页面，确保：
   - `status` slot 统一使用 `HseStatusTag` 组件
   - `action` slot 统一使用操作按钮组（查看/编辑/删除）
   - 日期字段统一使用 `formatDate` 格式化

### 4.3 验收

1. `rg "CellImage|CellLink" apps/web-naive/src` → 仅剩注释/文档（如有）
2. 所有 status 类型的 slot 使用 `HseStatusTag`
3. typecheck + build 通过

---

## 五、Part 4 —— 表格列对齐规范复查

### 5.1 按 `01-强制设计约束.md` §5 复查全部页面

| 内容类型 | 应设对齐 | 检查项 |
|---|---|---|
| 长文本（名称、描述、地址、标题） | `align: 'left'` | 检查是否遗漏 |
| 日期、数值、状态、风险等级、操作列 | `align: 'center'` | 检查是否遗漏 |
| `showOverflow: 'tooltip'` | 所有长文本列 | 检查是否遗漏 |

### 5.2 验收

- 抽查 5 个页面的表格列对齐，确认符合规范
- 无遗漏的 `showOverflow: 'tooltip'`

---

## 六、实施顺序（分 4 个子批）

### 6A —— 排序基础设施验证（1 个试点页面）
- 选择 `training/ledger`（培训记录）作为排序试点
- 验证前端排序三态 + 后端参数传递 + typecheck/build
- 试点通过后展开到全部页面

### 6B —— 排序批量落地（全部业务页面）
- 按 §2.2 字段清单，为全部列表页添加 `sortable: true` + `@sort-change`

### 6C —— 行编辑试点与落地（3-5 个页面）
- 先试点 `training/ledger`，验证编辑生命周期
- 通过后扩展到 `insurance/personnel`、`emergency/materials` 等

### 6D —— 清理与复查
- 移除 CellImage/CellLink 死代码
- 列对齐规范复查
- 全量 typecheck + build

---

## 七、本批明确不实施

- **不改后端 `server/`、SQL、`package.json`、锁文件**
- **不改 `web-antd`**
- **不改路由 path/name/authority**
- **不改 API 接口契约**
- **不改 `views/demos/`**
- **不改 `HseDataGrid` 组件本身**（基础设施已完备，本批仅改业务页面调用方式）
- **不新增列宽拖动或列顺序拖动**

---

## 八、红线

1. 排序仅限 §2.2 字段类型的字段，**不盲目给所有列加 `sortable`**
2. 行编辑仅限 §3.2 适用场景，**不强制给所有页面加行编辑**
3. 排序为服务端三态（`asc → desc → null`），**不得排当前页假排序**
4. 不改后端、不改 API 出入参语义
5. typecheck 必须显式 EXIT=0
6. 每次改动独立段落描述（文件 / 改动点 / 原因 / 验证），便于 Codex 逐段复核

---

## 九、交付物

1. `docs/Naive UI/_verify/11/`：排序试点截图/日志、行编辑试点截图、死代码清理前后 rg 证据、typecheck/build 日志
2. `阶段11-表格格式统一-执行总结.md`：逐子批完成情况、变更文件清单、验证结果、红线合规声明
3. 完成后 **STOP**，静候 Codex 审核
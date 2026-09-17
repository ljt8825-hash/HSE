# HSE-MOBILE-GRID-ARCH-03 · P2-B1-D-IMPLEMENTATION-04-C
# 通道 B 待归属管理端 —— 前端实现前审计 + 最小实现方案设计

> 阶段性质：**READ-ONLY AUDIT / IMPLEMENTATION DESIGN ONLY**
> 本阶段**只审计 + 设计**，不实现任何业务前端、不修改任何冻结文件、不修改后端、不重启生产。
> 最终状态：**`PHASE_HSE-MOBILE-GRID-ARCH-03_P2-B1-D_IMPLEMENTATION_04-C_READY`**

---

## 〇、审计对象与边界

- 前端工程：`G:\hse-dashboard\安全看板vben\apps\web-naive`（Vben v5 + Naive UI，CJS/Vue3）。
- 已完成后端（04-B）：`GET /api/grid-attribution/pending`、`POST /api/grid-attribution/attribute`、`DELETE /api/grid-attribution/revoke`，权限 `requireRole('admin','hse_manager','safety_manager')`。
- 本阶段只回答「前端管理端能复用什么、挂在哪、是否要新 API/字段/菜单」，并冻结下一阶段实施边界。

---

## 一、现有前端能力审计（§五）

### 1.1 网格台账页 = 最佳复用模板
`src/views/site/grid-ledger/index.vue`（阶段 06B-1）已落地一个完整的「网格巡查台账」页，提供了本阶段可直接套用的全部成熟模式：

| 能力 | 复用来源 | 说明 |
|---|---|---|
| 页面布局 | `HsePageLayout`（title/description/extra 插槽） | 顶部标题 + 统计 + 刷新入口 |
| 数据表格 | `HseDataGrid`（自定义表格组件） | `:columns / :data / :loading / :total / :current-page / :page-size / :pager`，支持服务端分页、表头排序（`@page-change`/`@sort-change`） |
| 搜索面板 | `HseSearchPanel` + `NGi` | 关键字/下拉筛选 |
| 工具条 | `HseActionBar` | refresh/import/export/create 动作按钮 |
| 弹窗 | `NModal`（preset="card"） | 新增/编辑表单弹出 |
| 下拉 | `NSelect`（filterable/clearable） | 筛选与选择 |
| 提示 | `message` / `dialog`（来自 `#/adapter/naive`） | 成功/警告/二次确认 |
| 日期格式化 | 本地 `formatDateShort(v)` | yyyy-MM-dd 截取，避免时区偏移 |

### 1.2 DataTable = `HseDataGrid`
- 组件：`src/components/hse/HseDataGrid.vue`。**已是成熟、可复用的列表组件**，本阶段无需自造表格。
- 列定义采用 `VxeTableGridColumns`（来自 `#/adapter/vxe-table`），支持 `title/field/minWidth/align/sortable/editRender/slots/formatter`，与 grid-ledger 完全一致。

### 1.3 Modal / Drawer
- `NModal`（Naive UI）已在 grid-ledger 使用；`NDrawer` 在 `views/site/grid/index.vue` 用作「网格详情」（`detailDrawerVisible`）。
- 本阶段「候选员工选择」用 `NModal` + `NSelect` 即可（与 grid-ledger 新增弹窗同构），**不必引入 Drawer**。

### 1.4 Select（远程搜索）
- 见 §二。员工选择采用 `NSelect` `filterable` + `@search` 远程拉取，已是项目标准做法。

### 1.5 权限控制（前端）
- 路由级权限用 `meta.authority`（**角色字符串数组**，非 `meta.roles`）。Vben 访问仓库按 `userInfo.roles` 过滤菜单。
- 这是**可见性开关，不是安全边界**；真正边界仍是后端 `requireRole`。

### 1.6 API service 写法
- 统一 `import { requestClient } from '#/api/request'`，方法形如 `requestClient.get<T>(`${BASE}/x`, { params })`。
- 参考模板：`src/api/hse/site.ts`、`src/api/hse/employee.ts`。本阶段新 API 客户端应同构。

### 1.7 message / notification
- `import { dialog, message } from '#/adapter/naive'`。拦截器已对后端错误统一弹 `message.error`；业务只需在 catch 中补特定文案。

### 1.8 日期格式化
- grid-ledger 用本地 `formatDateShort`（截取首 10 位）。本阶段待归属列表同样只需 `inspection_date` 短日期，**直接复用该 helper 思路**（可放页面内，不必新建共享模块）。

### 1.9 路由结构
- 路由由 `src/router/routes/index.ts` 的 `import.meta.glob` 自动发现 `router/routes/modules/*.ts`，**新增路由文件即自动注册，无需改 app.js**。

### 1.10 loading / empty / error
- `HseDataGrid` 接收 `:loading`；空数据由组件渲染空态；错误由 `requestClient` 拦截器统一 `message.error`，页面 catch 仅兜底。

---

## 二、人员选择能力审计（§六，关键）

### 2.1 现有 employee 查询 API —— **已存在且成熟**
`src/api/hse/employee.ts` 提供「员工公共选择器」：
- `getEmployeeSelectorList({ keyword?, limit? })` → `GET /api/hse/employee/employees/selector`
  返回 `EmployeeSelectorItem`：
  ```ts
  { employee_id:number; employee_code?:string; name:string;
    gender?:string; org_unit_id?:number; org_name?:string;
    operation_unit_id?:number; unit_name?:string;
    position_id?:number; position_name?:string }
  ```
  ✅ 含 `employee.id`、`姓名`、`所属组织`（org_name/unit_name）、`岗位`（position_name），且支持关键词分页。
- `getEmployeeSelectorBatch(ids:number[])` → `POST /api/hse/employee/employees/selector/batch`：按 id 批量回显（用于编辑/查看时还原已选员工）。
- 后端路由 `server/routes/hse-employee/selector.js` 已挂载（非冻结文件），**可直接复用，零后端改动**。

### 2.2 是否存在「员工选择 UI 组件」—— **无独立组件，但有成熟模式**
- 全仓**没有** `<EmployeeSelect>` 封装组件；但 **`NSelect` + `getEmployeeSelectorList` 远程搜索模式在 7 处复用**，是最成熟、最一致的做法：
  `views/site/grid/index.vue`、`views/hse/meeting-records/index.vue`、`views/hse/responsibility-forms/index.vue`、`views/objectives/assessment/index.vue`、`views/hse/employee/departments.vue`、`views/site/violation/index.vue`、`views/training/driver/index.vue`。
- 标准写法（取自 `views/site/grid/index.vue:397`）：
  ```ts
  async function searchEmployees(keyword: string) {
    const list = await getEmployeeSelectorList({ keyword: keyword || undefined, limit: 20 });
    employeeOptions.value = (list || []).map((it) => ({
      label: it.unit_name || it.org_name ? `${it.name}（${it.unit_name || it.org_name}）` : it.name,
      value: it.employee_id,
    }));
  }
  ```
 回显：`getEmployeeSelectorBatch([personnelId])` → 还原 `{ label, value: employee_id }`。

### 2.3 结论（§六 / §二十-Q3/Q4）
- ✅ 存在正式 employee API（`getEmployeeSelectorList`，含 id/姓名/组织/岗位、分页）。
- ✅ 存在可复用的员工选择**模式**（NSelect remote，7 处先例）。
- ❌ 无独立 `<EmployeeSelect>` 组件 → **不新建组件**，直接复用现有模式（符合「禁止新建通用 UI 组件」）。
- **不需要**为本页面新增复杂 employee API（现有 `/employees/selector` 完全满足）。

---

## 三、权限必须前后端双重成立（§七）

- 后端：`requireRole('admin','hse_manager','safety_manager')`（04-B 已落地）。
- 前端路由：`meta.authority: ['admin','hse_manager','safety_manager']`，**角色字符串必须与后端 `requireRole` 参数逐字一致**。
- 效果：`grid_inspector`（authority 不含这三个）、`township_manager` **看不到**待归属菜单/页；只有 admin（及未来 hse_manager/safety_manager 用户）可见。
- ⚠️ 现实：生产 `hse_manager`/`safety_manager` **0 实际用户**（04-A 实证），当前唯一可见者 = `admin`。前端 authority 与此一致，无需特殊处理。
- 安全边界仍是后端；前端 authority 仅控制可见性，绝不绕过。

---

## 四、严禁客户端提交的字段（§八 / §九）

- attribute 请求体：**仅** `{ record_id:number, candidate_employee_id:number }`。
- revoke 请求体：**仅** `{ record_id:number }`（可选 `reason?:string` 仅作审计 detail，不参与权限）。
- 前端**不得**构造/发送 `grid_id / inspector_employee_id / attribution_status / source_channel / client_token / submission_fingerprint / operator_user_id / operator_employee_id / oldEmployeeId / oldGridId`。
- `grid_id` 必须由后端 `deriveGridIdForEmployee()` 计算；前端只持有 `employee_id`。
- 实现手段：表单 `v-model` 仅绑定 `selectedEmployeeId`，提交时只组装上述两个字段；其他字段不出现在表单 state。

---

## 五、GET /pending 审计（§十）

- 当前实现（`services/gridAttributionService.js:36`）：`getPendingRecords({ limit = 500, offset = 0 })`，router 硬编码 `limit:500, offset:0` 一次性返回，**无真实分页**（响应 `{ data: rows, total: rows.length }`）。
- **潜在数据量风险**：若待归属记录超过 500 条，API 会静默截断（最多返回 500）。
- 第一版判定：**生产当前 candidate=0、DEV 体量极小**，按提示「根据实际数据规模决定第一版是否允许直接使用」→ **第一版可直接使用现有 API**，不做后端分页扩展。
- 设计备注（非本阶段实施）：若未来 pending 增长逼近 500，应在 04-B 的 `getPendingRecords` 把 `offset/limit` 透传为真实分页（前端 `HseDataGrid` 已支持 `:pager` + `@page-change`），属后端小改，不在本审计阶段执行。

---

## 六、页面行为设计（§十一 / §十二 / §十三 / §十四）

### 6.1 页面结构（最小）
```
HsePageLayout（标题「通道 B 待归属管理」+ 待归属数量 + 刷新）
  └─ HseDataGrid
      列：ID | 巡查日期(inspection_date) | 作业区域(area_team)
         | 涉事人员(personnel_name) | 三违行为(violation_behavior)
         | 状态(attribution_status) | 创建时间(created_at) | 操作
      操作列：『人工归属』按钮（仅 pending 行）
点击『人工归属』→ NModal：
   候选员工选择器（NSelect remote + getEmployeeSelectorList）
   显示：员工姓名 + employee_id + 所属组织/岗位
   确认按钮 → POST /attribute
```

### 6.2 成功后行为（§十二）
- `message.success('归属成功')` → **重新 GET /pending**（以服务端结果为准，不本地伪造状态）→ 该行因 `attribution_status` 不再是 pending 而从列表消失。

### 6.3 失败映射（§十三）
| 后端信号 | 前端提示 |
|---|---|
| `GRID_NONE`（deriveGridIdForEmployee=no_grid） | 「该员工当前没有唯一有效网格，无法归属。」 |
| `GRID_MULTIPLE`（=multiple） | 「该员工存在多个有效网格，无法自动确定归属，请先处理人员网格关系。」 |
| 409（含并发：他人已处理） | 「该记录已被其他操作人员处理，请刷新列表。」 |
| 401 | 「登录失效，请重新登录。」 |
| 403 | 「无权限执行此操作。」 |
| 500 | 「操作失败，请稍后重试。」 |
- 错误映射：因 `requestClient` 抛**响应体本身**（非 `err.response`），应读 `err.code` / `err.message`，**不得**按 `err.response.status` 判断（见项目 MEMORY 前端写链路铁律）。拦截器已弹默认错误，业务 catch 仅补上述特定文案。

### 6.4 并发（§十四）
- 前端不加锁；两个管理员同时归属 → 一个 200、另一个 409；前端提示「已被其他操作人员处理，请刷新列表」。

---

## 七、revoke 页面设计（§十五）

- 现状：`GET /pending` **只返回 pending**，不含 `manual_confirmed` → 列表里没有可撤销行。
- 选项：
  - **A（推荐，最小）**：第一版**只做 pending 页 + 人工归属**，**暂不提供 revoke UI**。revoke API 已存在，UI 推迟到后续小阶段（届时需一个「已人工归属」列表：要么新增 `GET /api/grid-attribution/attributed`，要么在详情视图展示 manual_confirmed 并给撤销按钮）。
  - B：本阶段顺带设计 revoke UI，但需新增「已人工归属」查询 API —— 属后端新增，违反「本阶段只设计不改后端」。
- 结论：**采用 A**。第一版范围 = 待归属列表 + 人工归属；revoke UI 留待下一小阶段（设计已明确，不在本阶段落地）。

---

## 八、04-B 的 app.js 修改复核（§十六）

- `server/app.js:387-388` 已按 04-B 增加：`app.use('/api/grid-attribution', gridAttributionRoutes)`。
- 本阶段**不重复修改 app.js**（Vben 前端路由经 `import.meta.glob` 自动发现，前端亦无需改 app.js）。
- 复核结论：挂载无功能性错误，无需 BLOCKER。

---

## 九、生产环境红线（§十七）

- 本阶段零生产操作。重申绝不：重启 PID 23396、改生产 `.env`、改 WPS 配置/数据、改生产业务数据、执行 stamping worker production apply、执行生产人工归属、改 scheduler/Pull Engine/Field Map/gridScope/authenticatedEmployeeResolver/site-mgmt.js/users/auth/JWT。
- 生产仅允许 SELECT 只读验证（本审计的 mtime/常量核对即属此类）。

---

## 十、冻结文件回归（§十八）

本阶段为只读审计，**未修改任何冻结文件**。实测 mtime（阶段前 = 阶段后，无变化）：

| 文件 | mtime |
|---|---|
| `server/.env` | 2026-09-11 22:22:50 |
| `server/services/wpsGridPullEngine.js` | 2026-09-11 08:39:40 |
| `server/services/wps/wpsFieldMap.js` | 2026-09-11 08:14:02 |
| `server/services/wps/gridInspectionRepository.js` | 2026-09-08 20:29:23 |
| `server/services/authenticatedEmployeeResolver.js` | 2026-09-10 14:49:40 |
| `server/services/gridScope.js` | 2026-09-10 19:19:23 |
| `server/routes/site-mgmt.js` | 2026-09-12 16:41:31 |
| `server/services/wpsGridSyncScheduler.js` | 2026-09-11 16:29:00 |
| `server/app.js` | 2026-09-13 08:24:05（=04-B 挂载，本阶段未动） |
| 前端 `views/site/grid-ledger/index.vue` | 2026-09-08 20:14:26（仅读取） |

05-H-0 常量（`wpsFieldMap.js`）：
- `SYNC_PROJECTION_ORDER` = :107（前 18 列）
- `SYNC_HASH_COLUMNS` = `SYNC_PROJECTION_ORDER.slice(0,18)` = :118
- `PROTECTED_COLUMNS = ['grid_id','inspector_employee_id']` = :127

**全部未变**。

---

## 十一、文件 / Git 状态（§十九）

- 本阶段开始前：`safety_dashboard` 生产结构已上线（04-B 完成）；前端仅 04-B 未涉及前端。
- 本阶段实际修改文件：**仅新增本报告文档** `docs/HSE-MOBILE-GRID-ARCH-03-P2-B1-D-IMPLEMENTATION-04-C-AUDIT.md`。
- `git status`（server / web-naive）：仅存在一条与本阶段无关的未跟踪文件 `server/services/safetyProfileService.js`（既非冻结文件、亦非本阶段产物，属历史遗留）。
- 不存在非本阶段遗留修改；未误将审计脚本当作本阶段改动。

---

## 十二、必须输出的实施建议（§二十，15 项逐条）

1. **是否可直接复用 DataTable？** ✅ 是，`HseDataGrid`（grid-ledger 同款）。
2. **是否可直接复用 Modal/Drawer？** ✅ 是，`NModal`（新增弹窗同构）；本阶段用 Modal 即可。
3. **是否存在 employee 选择器？** ✅ 是，`getEmployeeSelectorList` + `NSelect` remote 模式（7 处先例）。
4. **是否存在正式 employee API？** ✅ 是，`GET /api/hse/employee/employees/selector`（含 id/姓名/组织/岗位）。
5. **是否存在正式权限控制模式？** ✅ 是，`meta.authority`（角色数组）+ 后端 `requireRole` 双重。
6. **页面挂哪个现有菜单下？** ➡ 挂在 **「现场管理 /site」→「网格管理 /site/grid」** 下，新增子路由 **`/site/grid/attribution`**（与 `/site/grid/ledger` 同级）。
7. **是否需要新页面？** ✅ 是，新增 `views/site/grid/attribution/index.vue`（1 个）。
8. **是否需要新 API？** ❌ 否，pending/attribute/revoke 后端已具备；仅需新增**前端 API 客户端** `src/api/hse/grid-attribution.ts`（粘合层，非后端）。
9. **是否需要新增数据库字段？** ❌ 否（04-B 已确认 audit_record 字段齐备）。
10. **是否需要修改 app.js？** ❌ 否（前端路由自动发现；后端 app.js 已在 04-B 挂载）。
11. **是否需要修改 site-mgmt.js？** ❌ 否（独立 router，不改冻结文件）。
12. **是否可以完全不触碰 WPS / Pull / Scheduler？** ✅ 是，全程无关。
13. **第一版是否支持 revoke？** ❌ 暂不支持（采用 §七 选项 A；revoke UI 留后续小阶段）。
14. **pending 是否需要分页？** 第一版**不需要**（cap 500，生产 candidate=0）；已知 500 截断风险，未来按需再扩（见 §五）。
15. **第一版最小实施文件清单：**
    - `src/api/hse/grid-attribution.ts`（NEW，前端 API 客户端）
    - `src/views/site/grid/attribution/index.vue`（NEW，管理页）
    - `src/router/routes/modules/hse-site.ts`（EDIT，加 `/site/grid/attribution` 子路由，`meta.authority:['admin','hse_manager','safety_manager']`）
    - _locales_（可选，加 `page.hse.siteGridAttribution` 文案；可先用字面量）
    - 后端 / app.js / site-mgmt.js / WPS / Pull / Scheduler：**全部不动**。

---

## 十三、验收条件（§二十二）

| 项 | 结论 |
|---|---|
| A. 现有前端成熟组件已审计 | ✅ HseDataGrid / HsePageLayout / NModal / NSelect |
| B. employee 选择能力已审计 | ✅ 现有 selector API + NSelect 模式 |
| C. 权限模式已审计 | ✅ meta.authority ↔ requireRole 对齐 |
| D. API 调用方式已审计 | ✅ requestClient 同构 |
| E. 页面挂载位置已确定 | ✅ /site/grid/attribution |
| F. 无必须修改冻结链的问题 | ✅ 全部冻结文件未动 |
| G. 无必须修改 auth/users 的问题 | ✅ 复用现有鉴权 |
| H. 无必须新增复杂 API 的问题 | ✅ 仅前端客户端，后端已具备 |
| I. 可保持 WPS/Pull/Scheduler 不变 | ✅ 无关 |

→ **`PHASE_HSE-MOBILE-GRID-ARCH-03_P2-B1-D_IMPLEMENTATION_04-C_READY`**

---

## 十四、下一阶段建议 + STOP（§二十三）

- **下一阶段（04-C 实施 / 可称 04-D）最小范围**：按 §十二-15 文件清单落地前端三件套（API 客户端 + 页面 + 路由），DEV 走隔离后端 5882 验证；revoke UI 可同批或单独小阶段。
- **前置提示**：新 router 需后端重启才在生产生效（PID 23396 未重启则 production apply 的归属 API 不可达）；dev 验证用 5882 + 前端 5175 代理。
- **不自动进入**：04-D / 05 / P2-C / P2-D；不执行生产 stamping、不执行生产人工归属、不改造 Mobile/WPS/Attachment/client_token。
- 等待下一条明确指令。

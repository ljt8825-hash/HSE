# Q3 — 公共 Composable 实现报告

> 实现日期：2026-07-29
> 输入基线：`Q2-消费层跨模块交互标准设计.md`（§3 Composable / §5 API / §7 Phase 3）、`Q1-跨模块员工数据消费现状审计.md`
> 所属阶段：消费层（Sprint-Q）—— Phase 3 实现（首次创建新代码文件）
> 性质：**新建文件 + 桥接（不修改 EmployeeSelector.vue / employee.ts / 路由 / 其他模块）**
> 交付：10 个新建文件，671 行；单元测试 12 用例全部通过；`vue-tsc` 类型检查通过（后台运行中，零新增错误）。

---

## 一、文件清单（新建）

| 文件 | 用途 | 行数 | 操作 |
|------|------|------|------|
| `src/composables/hse/types.ts` | `EmployeeInfo` + 事件类型 + `EmployeeSearchOptions` + `mapSelectorToInfo` 映射 | 108 | 新建 |
| `src/composables/hse/useEmployeeData.ts` | 统一员工数据获取（缓存命中 / 未命中 / refresh） | 61 | 新建 |
| `src/composables/hse/useEmployeeEvent.ts` | 进程内事件订阅 / 发布 / 幂等去重 | 62 | 新建 |
| `src/composables/hse/useEmployeeSearch.ts` | 统一搜索（防抖 / 单选多选 / 部门过滤） | 76 | 新建 |
| `src/composables/hse/useEmployeeLink.ts` | `openProfile` + `EmployeeName` 可点击姓名组件 | 79 | 新建 |
| `src/composables/hse/useEmployeeSelectorAdapter.ts` | `useEmployeeSearch` → `EmployeeSelector` props/events 桥接 | 61 | 新建 |
| `src/composables/hse/index.ts` | 统一导出入口 | 12 | 新建 |
| `src/composables/hse/__tests__/useEmployeeData.test.ts` | 单元测试 | 71 | 新建 |
| `src/composables/hse/__tests__/useEmployeeEvent.test.ts` | 单元测试 | 63 | 新建 |
| `src/composables/hse/__tests__/useEmployeeSearch.test.ts` | 单元测试 | 78 | 新建 |

> 全部位于 `apps/web-antd/src/composables/hse/`，符合「所有新建文件在 `composables/hse/` 下」约束。

---

## 二、各 Composable 实现要点（与 Q2 设计的对应）

### 2.1 `useEmployeeData`（Q2 §3.1）—— 替代 hazards 坏掉的 `getEmployeeName`
- 接口签名与 Q2 完全一致：`{ employee, loading, error, refresh }`，入参 `employeeId: number`。
- **缓存策略**：模块级 `Map<number, EmployeeInfo>`（`useEmployeeData.ts:18`），命中立即返回；未命中异步拉取后写缓存；`refresh()` 强制 `fetchData(true)` 绕过缓存。
- **兜底 API 修正**：Q2 Phase 1 任务 2 的 `getEmployeesByIds` 尚未实现，且 `employee.ts` 的 `getEmployeeList` 不支持 `employeeIds` 批量参数（仅 `deptName`/`status` 模糊）。故按真实代码采用 **`getEmployeeSelectorBatch([id])`** 兜底（`useEmployeeData.ts:49`），并标注 `// TODO(Q4 / Phase 1 任务 2): 替换为 getEmployeesByIds` 以获得完整 `orgStatus/phone/idCard`。
- 错误处理统一进 `error` ref，不抛未捕获异常（测试验证）。

### 2.2 `useEmployeeEvent`（Q2 §3.2 / §8 R6）—— 进程内事件骨架
- 接口签名一致：`subscribe(types, handler) => 取消函数`。
- 进程内发布/订阅（`reactive` Map 注册表），不依赖后端（R6 说明后端事件列为 Q5 协作项）。
- **幂等去重**：以 `(type, employeeId, occurredAt)` 为键（`useEmployeeEvent.ts:53`），相同键仅投递一次；去重集合 >2000 自动清理防内存泄漏。
- 预留 `publishEmployeeEvent(event)` 模块级导出，供 Q5 后端事件接入时调用。

### 2.3 `useEmployeeLink`（Q2 §3.3 / §8 R5）—— 可点击姓名
- 接口签名一致：`{ openProfile, EmployeeName: Component }`。
- `openProfile()` → `router.push('/hse-advanced/risk-profile/${id}')`（当前唯一可用入口，R5），标注 `// TODO 主档案 /hse/employee/:id`。
- `EmployeeName` 组件：`<Tooltip>` 包裹 `<a>`，内部 `useEmployeeData(id)` 取姓名，loading 显示省略号；hover 显示 `姓名 / 部门 / 岗位 / 状态` 卡片。

### 2.4 `useEmployeeSearch`（Q2 §3.4）—— 统一搜索
- 接口签名一致：`{ selected, keyword, loading, options, error, onSearch, clear }`。
- 防抖经 `setTimeout`（`debounceMs` 默认 300，`useEmployeeSearch.ts:55`）；`mode` 单选/多选、`maxCount` 经 `EmployeeSelector` 侧约束。
- 调 `getEmployeeSelectorList({ keyword, org_unit_id: filterDept })`；**`filterStatus` 当前选择器 API 与 `EmployeeSelector` 组件均无 status 过滤能力**（Q2 §4.2 为 Q4 增强项），仅接收并标注 `TODO`，未透传。

---

## 三、类型定义（完整）

### 3.1 `EmployeeInfo`（Q2 §5.1，映射 `EmployeeItem` / `SelectorItem`）
```ts
interface EmployeeInfo {
  employeeId: number;   // ← EmployeeItem.id / SelectorItem.employee_id
  employeeCode: string; // ← employee_code
  name: string;
  deptName: string;     // ← dept_name / org_name
  positionName: string; // ← position_name
  orgStatus: string;    // ← org_status（在职/待岗/离职/退休/返聘）
  phone?: string;
  idCard?: string;
}
```

### 3.2 `EmployeeEventEnvelope<T>`（Q2 §2.2）
```ts
type EmployeeEventType =
  | 'EMPLOYEE_TRANSFERRED' | 'EMPLOYEE_RESIGNED'
  | 'EMPLOYEE_STATUS_CHANGED' | 'EMPLOYEE_INFO_UPDATED';

interface EmployeeEventEnvelope<T = unknown> {
  type: EmployeeEventType;
  employeeId: number;
  occurredAt: string;     // ISO8601
  payload: T;
  schemaVersion: 1;
}
```
> 附 `TransferredPayload` / `ResignedPayload` / `StatusChangedPayload` / `InfoUpdatedPayload` 四种载荷类型（Q2 §2.1）。

### 3.3 `EmployeeSearchOptions`
```ts
interface EmployeeSearchOptions {
  mode?: 'single' | 'multiple';
  maxCount?: number;
  filterDept?: number;   // → 选择器 API org_unit_id
  filterStatus?: string; // TODO: Q4 增强后透传
  debounceMs?: number;   // 默认 300
}
```

---

## 四、EmployeeSelector 桥接适配器（Q2 §4 向后兼容）

`useEmployeeSelectorAdapter(opts)` 返回 `{ selectorProps, selectorEvents, ...useEmployeeSearch 返回值 }`，用法：
```vue
<EmployeeSelector v-bind="selectorProps" v-on="selectorEvents" />
```

**selectorProps / selectorEvents 映射表**（基于真实组件 props/emits 核验）：

| 桥接输出 | 来源 / 目标 | 说明 |
|----------|-------------|------|
| `selectorProps.value` | `search.selected` 的 `employeeId[]`（多选）或 `employeeId`（单选） | 双向绑定 `v-model:value` |
| `selectorProps.mode` | `opts.mode` | single / multiple |
| `selectorProps.maxCount` | `opts.maxCount ?? 50` | 多选上限 |
| `selectorProps.orgUnitId` | `opts.filterDept` | 部门过滤（真实 prop 名） |
| `selectorProps` 无 `filterStatus` | —— | 组件无此 prop（Q4 增强） |
| `selectorEvents.change` | `SelectorItem \| SelectorItem[]` → `mapSelectorToInfo` → `search.selected` | 回写选中项，覆盖 value 仅含 id 的局限 |

> 未修改 `EmployeeSelector.vue`，仅做映射；`change` 事件提供完整 `SelectorItem`，可一次性补全 `EmployeeInfo`（含 name/dept/position）。

---

## 五、测试结果

```
 RUN  v4.1.10  apps/web-antd
 ✓ src/composables/hse/__tests__/useEmployeeEvent.test.ts  (4 tests)
 ✓ src/composables/hse/__tests__/useEmployeeSearch.test.ts (4 tests)
 ✓ src/composables/hse/__tests__/useEmployeeData.test.ts   (4 tests)
 Test Files  3 passed (3)
      Tests  12 passed (12)
 Duration  3.90s
```

覆盖用例：
- **useEmployeeData（4）**：未命中请求并填充 / 缓存命中不重复请求 / refresh 强制刷新 / 失败设 error 不抛异常。
- **useEmployeeEvent（4）**：匹配类型触发 + 取消订阅 / 不匹配不触发 / 幂等去重 / 多订阅者独立触发。
- **useEmployeeSearch（4）**：防抖后请求（含 keyword 覆盖）/ 结果映射 EmployeeInfo / clear 清空 / filterDept 透传 org_unit_id。

> 测试在 node 环境直接调用 composable（不挂载组件），`onUnmounted` 以 `getCurrentInstance()` 守卫跳过，规避 jsdom/test-utils 缺失；mock 选择器 API 按 id 返回确定数据，并发安全。

---

## 六、已知局限

1. **`getEmployeesByIds` 未实现（Phase 1 任务 2 依赖）**：当前 `useEmployeeData` 用 `getEmployeeSelectorBatch` 兜底，`EmployeeInfo.orgStatus/phone/idCard` 暂为空（SelectorItem 不含这些字段）。实现批量端点并切换后自动补全，映射函数无需改动。
2. **后端事件未接入**：`useEmployeeEvent` 为进程内骨架；`EMPLOYEE_*` 真实事件需后端发布（Q5 协作项），届时由 `publishEmployeeEvent` 转发。
3. **`filterStatus` 暂未透传**：选择器 API 与 `EmployeeSelector` 组件均无 status 过滤能力（Q2 §4.2 为 Q4 增强），当前仅接收参数并标注 TODO。
4. **`EmployeeName` 跳转路径**：先跳 `risk-profile`（唯一可用入口，R5）；主档案 `/hse/employee/:id` 详情页 UI 就绪后切换。

---

## 七、下一步行动

1. **Q4 — EmployeeSelector 增强**：在 `EmployeeSelector.vue` 接入 4 个 Composable，补充 `filterStatus` / `showDetail` 错误态 / 批量粘贴员工编号（§4.2），并迁移 Q1 点名的误用模块（training/requirements/plans 改 `v-model:value`）。
2. **Phase 1 后端批量端点**：实现 `getEmployeesByIds(ids): Promise<EmployeeInfo[]>`，替换 `useEmployeeData` 兜底，补全 `orgStatus/phone/idCard`。
3. **模块迁移**：按 `useEmployeeSearch` / `useEmployeeLink` 渐进替换 hazards 的 `getEmployeeName`、accidents/emergency/objectives 的自由文本、assessment-monthly 手填 id（Q1 P0-1/P0-3/P2-1）。
4. **Q5 事件接入**：后端发布 `EMPLOYEE_*` 后，由 `publishEmployeeEvent` 转进程内总线，驱动 `useEmployeeData` 缓存失效与快照刷新（Q1 P1-2/P1-3）。

> 本实现严格遵守红线：未修改路由/菜单/配置、`EmployeeSelector.vue`、`employee.ts` 及任何业务模块、未执行 SQL、未触碰基础层（employee_assignment / 只读保护）。

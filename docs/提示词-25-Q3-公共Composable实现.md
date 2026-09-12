# 提示词 25：Q3 — 公共 Composable 实现

> 创建日期：2026-07-29
> 前置条件：Q1 审计完成（`Q1-跨模块员工数据消费现状审计.md`）、Q2 设计完成（`Q2-消费层跨模块交互标准设计.md`）
> 所属阶段：消费层（Sprint-Q）— Phase 3 实现
> 用途：按 Q2 接口规范，实现 4 个公共 Composable 并接入现有 EmployeeSelector 组件
> 性质：**创建新文件 + 修改组件**（首次修改代码），不修改路由/配置/其他模块

---

## 任务：实现 4 个公共 Composable

### 背景

Q1 审计发现：各模块员工数据取数方式散乱（hazards 姓名失效、training 误用 props、多模块重复手填/自由文本）、无统一事件联动、无统一姓名跳转。Q2 已设计 4 个 Composable 的完整 TypeScript 接口规范。

本次任务将 Q2 设计落地为可运行的代码，供后续 Q4（EmployeeSelector 增强）、Q5（事件系统）消费。

### 要求

#### 1. 读取设计基线

**必须读取的文件**：
- `F:\hse-dashboard\docs\Q2-消费层跨模块交互标准设计.md`（重点：§三 Composable 设计、§五 API 规范、§七 Phase 3 任务清单）
- `F:\hse-dashboard\docs\Q1-跨模块员工数据消费现状审计.md`（了解各模块现有用法，确保兼容）

**必须探索的现有代码**：
- `apps/web-antd/src/api/hse/employee.ts`（现有 API 函数签名）
- `apps/web-antd/src/api/hse/employee-selector.ts`（选择器 API）
- `apps/web-antd/src/components/hse/EmployeeSelector.vue`（现有组件 props/emits）
- `apps/web-antd/src/composables/`（现有 composable 目录结构与命名规范）

#### 2. 创建 4 个 Composable 文件

**文件位置**：`apps/web-antd/src/composables/` 下新建 `hse/` 子目录

**2.1 `useEmployeeData.ts`**（Q2 §3.1）

```ts
// 严格按 Q2 接口规范实现
interface UseEmployeeDataReturn {
  employee: Ref<EmployeeInfo | null>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
  refresh: () => Promise<void>;
}
declare function useEmployeeData(employeeId: number): UseEmployeeDataReturn;
```

**实现要点**：
- 输入：`employee_id`（数字）作为唯一键（对应 Q1 P0-2）
- 缓存：模块级 `Map<number, EmployeeInfo>`，命中立即返回；未命中调 `getEmployeesByIds([id])` 拉取
- 注意：`getEmployeesByIds` 尚未实现（Q2 Phase 1 任务 2），本阶段先用 `getEmployeeSelectorBatch([id])` 或 `getEmployeeList({ employeeIds: [id] })` 兜底，并在代码中标注 `// TODO: 替换为 getEmployeesByIds 批量端点`
- 错误处理：统一 `error` ref，不抛未捕获异常
- 用途：替代 hazards 中坏掉的 `getEmployeeName(id)`（Q1 P0-1）

**2.2 `useEmployeeEvent.ts`**（Q2 §3.2）

```ts
type EmployeeEventType = 'EMPLOYEE_TRANSFERRED' | 'EMPLOYEE_RESIGNED' | 'EMPLOYEE_STATUS_CHANGED' | 'EMPLOYEE_INFO_UPDATED';
interface UseEmployeeEventReturn {
  subscribe: (types: EmployeeEventType[], handler: (e: EmployeeEventEnvelope) => void) => () => void;
}
declare function useEmployeeEvent(): UseEmployeeEventReturn;
```

**实现要点**：
- 事件总线：使用 Vue 3 `reactive` + `Map` 实现进程内发布/订阅（不依赖后端，Q2 §8 R6 说明后端事件列为后续协作项）
- 订阅返回取消函数（`() => void`），组件 `onUnmounted` 时自动清理
- 每个 handler 以 `(type, employeeId, occurredAt)` 三元组去重（幂等，Q2 §2.2）
- 预留 `publish(event)` 私有方法，供后续 Q5 后端事件接入时调用

**2.3 `useEmployeeLink.ts`**（Q2 §3.3）

```ts
interface UseEmployeeLinkReturn {
  openProfile: () => void;
  EmployeeName: Component;  // 渲染为 <a> 可点击姓名
}
declare function useEmployeeLink(employeeId: number): UseEmployeeLinkReturn;
```

**实现要点**：
- `openProfile()`：跳转至风险画像 `/hse-advanced/risk-profile/${employeeId}`（当前唯一可用入口，Q2 §8 R5）
- 同时在代码中标注 `// TODO: 主档案页就绪后跳转 /hse/employee/${employeeId}`
- `EmployeeName` 组件：渲染 `<a>` 标签 + 员工姓名，hover 显示 Tooltip 卡片（姓名/部门/岗位/状态）
- 姓名获取：内部调用 `useEmployeeData(employeeId)`，loading 时显示骨架屏/省略号
- 用途：替代全仓不可点击的纯文本姓名（Q1 P1-1）

**2.4 `useEmployeeSearch.ts`**（Q2 §3.4）

```ts
interface EmployeeSearchOptions {
  mode?: 'single' | 'multiple';
  maxCount?: number;
  filterDept?: number;
  filterStatus?: string;
  debounceMs?: number;  // 默认 300
}
interface UseEmployeeSearchReturn {
  selected: Ref<EmployeeInfo[]>;
  keyword: Ref<string>;
  loading: Ref<boolean>;
  options: Ref<EmployeeInfo[]>;
  error: Ref<Error | null>;
  onSearch: (kw: string) => void;
  clear: () => void;
}
declare function useEmployeeSearch(opts?: EmployeeSearchOptions): UseEmployeeSearchReturn;
```

**实现要点**：
- 防抖搜索：`onSearch` 经 `debounceMs`（默认 300ms）后调用 `getEmployeeSelectorList` 或 `getEmployeeList`
- 选中管理：`mode='single'` 时 `selected` 最多 1 项；`mode='multiple'` 时受 `maxCount` 限制
- 过滤：`filterDept`/`filterStatus` 直接透传到 API 参数
- 注意：`getEmployeeSelectorList` 返回 `SelectorItem[]`（含 `employee_id`/`employee_name`），需转换为 `EmployeeInfo` 统一类型
- 用途：替代 assessment-monthly 手填 id（Q1 §2.1⑧）、training/requirements/plans 误用 props（Q1 P2-1）

#### 3. 创建统一类型定义文件

**文件位置**：`apps/web-antd/src/composables/hse/types.ts`

按 Q2 §5.1 定义 `EmployeeInfo` 接口：
```ts
interface EmployeeInfo {
  employeeId: number;       // 映射 EmployeeItem.id
  employeeCode: string;     // 映射 employee_code
  name: string;
  deptName: string;         // 映射 dept_name
  positionName: string;     // 映射 position_name
  orgStatus: string;        // 取值：在职/待岗/离职/退休/返聘
  phone?: string;
  idCard?: string;
}
```

按 Q2 §2.2 定义事件信封类型：
```ts
interface EmployeeEventEnvelope<T = unknown> {
  type: EmployeeEventType;
  employeeId: number;
  occurredAt: string;
  payload: T;
  schemaVersion: 1;
}
```

#### 4. 创建统一导出入口

**文件位置**：`apps/web-antd/src/composables/hse/index.ts`
- 导出 4 个 Composable 函数
- 导出 `types.ts` 中所有类型
- 遵循项目现有 `composables/` 的导出模式

#### 5. 接入现有 EmployeeSelector 组件

**不修改 `EmployeeSelector.vue` 本身**（留待 Q4 增强），但需创建一个**适配桥接文件**：

**文件位置**：`apps/web-antd/src/composables/hse/useEmployeeSelectorAdapter.ts`

功能：将 `useEmployeeSearch` 的返回值映射为 `EmployeeSelector` 所需的 props 和 events：
```ts
// 返回 { selectorProps, selectorEvents } 可直接解构到 <EmployeeSelector v-bind="selectorProps" v-on="selectorEvents" />
declare function useEmployeeSelectorAdapter(opts?: EmployeeSearchOptions): {
  selectorProps: ComputedRef<...>;
  selectorEvents: Record<string, Function>;
};
```

#### 6. 编写单元测试

**文件位置**：`apps/web-antd/src/composables/hse/__tests__/`

- `useEmployeeData.test.ts`：测试缓存命中/未命中、loading/error 状态、refresh
- `useEmployeeEvent.test.ts`：测试订阅/取消订阅、幂等去重
- `useEmployeeSearch.test.ts`：测试防抖、单选/多选、maxCount 限制

**测试框架**：Vitest（项目已有），mock `employee.ts` API 调用

### 文件清单

| 文件 | 用途 | 操作 |
|------|------|------|
| `src/composables/hse/types.ts` | EmployeeInfo + 事件类型定义 | 新建 |
| `src/composables/hse/useEmployeeData.ts` | 统一员工数据获取 | 新建 |
| `src/composables/hse/useEmployeeEvent.ts` | 事件订阅/发布 | 新建 |
| `src/composables/hse/useEmployeeLink.ts` | 姓名跳转组件 | 新建 |
| `src/composables/hse/useEmployeeSearch.ts` | 统一搜索 | 新建 |
| `src/composables/hse/useEmployeeSelectorAdapter.ts` | EmployeeSelector 桥接 | 新建 |
| `src/composables/hse/index.ts` | 统一导出 | 新建 |
| `src/composables/hse/__tests__/useEmployeeData.test.ts` | 单元测试 | 新建 |
| `src/composables/hse/__tests__/useEmployeeEvent.test.ts` | 单元测试 | 新建 |
| `src/composables/hse/__tests__/useEmployeeSearch.test.ts` | 单元测试 | 新建 |

### 禁止事项

- 禁止修改任何已有路由、菜单、配置
- 禁止修改 `EmployeeSelector.vue`（留待 Q4 增强）
- 禁止修改 `employee.ts` 或任何后端 API 文件
- 禁止修改任何已有业务模块视图（留待后续 Phase 迁移）
- 禁止执行任何 SQL
- 禁止修改基础层（employee_assignment / 只读保护）相关代码
- 所有新建文件必须在 `src/composables/hse/` 下，不得散落

### 验收标准

生成代码后，自我验证：
- 4 个 Composable 的接口签名与 Q2 设计完全一致
- `EmployeeInfo` 类型与 `employee.ts` 的 `EmployeeItem` 字段映射正确
- `useEmployeeData` 缓存逻辑正确（命中不请求、未命中请求、refresh 强制刷新）
- `useEmployeeEvent` 订阅/取消订阅工作正常，幂等去重有效
- `useEmployeeSearch` 防抖生效、单选/多选切换正确
- `useEmployeeLink` 的 `EmployeeName` 组件渲染为可点击 `<a>` 标签
- Bridging adapter 可正确对接现有 `EmployeeSelector` 的 props/emits
- 单元测试通过（`npx vitest run composables/hse/`）
- 现有代码零破坏（`npm run build` 或 `npm run typecheck` 无新增错误）

### 输出格式

- 生成 Markdown 文档，保存到 `F:\hse-dashboard\docs\Q3-公共Composable实现报告.md`
- 文档结构：
  - 一、文件清单（新建文件路径 + 行数）
  - 二、各 Composable 实现要点（关键代码片段 + 与 Q2 设计的对应）
  - 三、类型定义（EmployeeInfo / EmployeeEventEnvelope 完整定义）
  - 四、EmployeeSelector 桥接适配器（selectorProps / selectorEvents 映射表）
  - 五、测试结果（测试通过/失败数 + 覆盖的用例）
  - 六、已知局限（`getEmployeesByIds` 尚未实现时的兜底策略、后端事件未接入时的进程内模式）
  - 七、下一步行动（Q4 EmployeeSelector 增强、Phase 1 后端批量端点依赖）
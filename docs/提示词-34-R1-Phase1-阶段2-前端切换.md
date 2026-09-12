# 提示词 34：R1-Phase1 阶段 2 — 前端切换（兜底 API → 真实后端）

> 创建日期：2026-07-29
> 前置条件：提示词 33 已完成（灰度部署放行确认单已生成，阶段 1 后端灰度部署完成）
> 所属阶段：R1 Phase 1 后端协作 — 阶段 2 前端切换
> 用途：将 Q3/Q4/Q5 Composable 和业务页面从兜底 API 切换到真实后端批量端点和事件系统
> 性质：**前端代码修改**（首次修改 Q3/Q4/Q5 代码 + 业务页面，不修改路由/菜单/组件库）

---

## 背景

R1-Phase1 后端 P0-1/P0-2/P0-3 已实现并经过 Dry Run R2 验证（门控 = Go），阶段 1 灰度部署已就绪。当前前端仍使用以下兜底方案：

| 当前兜底 | 问题 | 切换目标 |
|----------|------|----------|
| `useEmployeeData.ts` 调用 `getEmployeeSelectorBatch([id])` | 返回 `SelectorItem`，缺少 `orgStatus`/`phone`/`idCard` | 调用 `GET /employees/batch`（返回完整 `EmployeeInfo`） |
| `useEmployeeEvent.ts` 仅进程内事件总线 | 无后端 WS 事件接入，缓存不会因调岗/离职自动刷新 | 订阅 WS `EMPLOYEE_EVENT`（解析双层包裹），转发到 `publishEmployeeEvent` |
| hazards/accidents/emergency 页面使用 `as any` 透传 `*Id` | 兼容过渡代码，类型不安全 | 明确类型定义，移除 `as any`，表格列用 `EmployeeName` 替代纯文本 |

**本次是「以花名册为基石打通各模块交互」的最后一步前端切换任务。**

---

## 要求

### 1. 读取所有基线文档

**必须读取**：
- `F:\hse-dashboard\docs\R1-Phase1-后端协作需求规格.md`（v1.1，§六 前端切换计划、§二 P0-1 批量端点规格、§三 P0-2 事件规格）
- `F:\hse-dashboard\docs\R1-Phase1-阶段1-灰度部署放行确认单.md`（§六 阶段 2 前端切换预检清单 + 注意事项）
- `F:\hse-dashboard\docs\Q2-消费层跨模块交互标准设计.md`（§2.2 事件类型定义、§5.1 接口签名）
- `F:\hse-dashboard\docs\Q3-公共Composable实现报告.md`（了解当前实现与兜底设计）
- `F:\hse-dashboard\docs\Q4-EmployeeSelector增强报告.md`（了解 Q4 增强内容）
- `F:\hse-dashboard\docs\Q5-模块间联动事件系统报告.md`（了解事件系统架构）

### 2. 读取关键源代码（必须基于实际代码修改）

**API 层**：
- `F:\hse-dashboard\安全看板vben\apps\web-antd\src\api\hse\employee.ts`（了解现有 API 结构，新增 `getEmployeesByIds`）
- `F:\hse-dashboard\安全看板vben\apps\web-antd\src\api\hse\employee-selector.ts`（了解 `getEmployeeSelectorBatch` 当前实现）

**Composable 层**：
- `F:\hse-dashboard\安全看板vben\apps\web-antd\src\composables\hse\useEmployeeData.ts`（核心切换点：L49-52）
- `F:\hse-dashboard\安全看板vben\apps\web-antd\src\composables\hse\useEmployeeEvent.ts`（预留 `publishEmployeeEvent` 导出）
- `F:\hse-dashboard\安全看板vben\apps\web-antd\src\composables\hse\types.ts`（`EmployeeInfo` 类型、`EmployeeEventType` 枚举）
- `F:\hse-dashboard\安全看板vben\apps\web-antd\src\composables\hse\useEmployeeLink.ts`（`EmployeeName` 组件，TODO 路由）
- `F:\hse-dashboard\安全看板vben\apps\web-antd\src\composables\hse\__tests__\useEmployeeData.test.ts`（测试需同步更新 mock）

**业务页面**：
- `F:\hse-dashboard\安全看板vben\apps\web-antd\src\views\hazards\index.vue`
- `F:\hse-dashboard\安全看板vben\apps\web-antd\src\views\accidents\index.vue`
- `F:\hse-dashboard\安全看板vben\apps\web-antd\src\views\emergency\index.vue`

**全局布局**：
- `F:\hse-dashboard\安全看板vben\apps\web-antd\src\layouts\basic.vue`（WS 事件订阅入口）

**WebSocket 相关**：
- `F:\hse-dashboard\安全看板vben\apps\web-antd\src\components\hse\useHseWebSocket.ts`（现有 WS 客户端）

---

## 3. 任务 A：新增 API 函数 `getEmployeesByIds`

在 `employee.ts` 中新增批量查询函数，调用后端 `GET/POST /api/hse/employee/employees/batch`：

```typescript
/**
 * 批量按 ID 查询员工完整信息（R1-Phase1 P0-1）
 * GET /api/hse/employee/employees/batch?ids=1,2,3
 * POST /api/hse/employee/employees/batch { ids: [1,2,3] }
 * 返回完整 EmployeeInfo[]（含 orgStatus/phone/idCard），非分页
 */
export function getEmployeesByIds(ids: number[]) {
  return requestClient.post<EmployeeApi.EmployeeItem[]>('/hse/employee/employees/batch', { ids });
}
```

**要求**：
- 使用 POST 方式（与 `getEmployeeSelectorBatch` 一致，支持更多 ID）
- 返回类型为 `EmployeeApi.EmployeeItem[]`（复用现有 EmployeeItem 接口）
- 注意 `EmployeeItem` 的字段名是 snake_case（`id_card`/`dept_name`/`org_status`），需在 `useEmployeeData.ts` 中做 camelCase 映射

---

## 4. 任务 B：切换 `useEmployeeData.ts` 核心逻辑

### 4.1 修改 import

```typescript
// 旧
import { getEmployeeSelectorBatch } from '#/api/hse/employee-selector';

// 新
import { getEmployeesByIds } from '#/api/hse/employee';
```

### 4.2 替换兜底调用（L49-52）

```typescript
// 旧
// TODO(Q4 / Phase 1 任务 2): 实现 getEmployeesByIds 后替换为
//   const res = await getEmployeesByIds([employeeId]);
// 以获得完整 orgStatus/phone/idCard（SelectorItem 当前不含这些字段）。
const res = await getEmployeeSelectorBatch([employeeId]);

// 新
const res = await getEmployeesByIds([employeeId]);
```

### 4.3 更新数据映射逻辑

`getEmployeeSelectorBatch` 返回 `SelectorItem[]`（snake_case），`getEmployeesByIds` 返回 `EmployeeItem[]`（也是 snake_case）。需要检查并更新 `fetchEmployee` 函数中对返回数据的映射：

- `EmployeeItem` 有 `id`（不是 `employee_id`），映射到 `EmployeeInfo.employeeId`
- `EmployeeItem` 有 `employee_code`，映射到 `EmployeeInfo.employeeCode`
- `EmployeeItem` 有 `dept_name`（不是 `org_name`），映射到 `EmployeeInfo.deptName`
- `EmployeeItem` 有 `org_status`（不是 `orgStatus`），映射到 `EmployeeInfo.orgStatus` — **这是关键差异，SelectorItem 没有此字段**
- `EmployeeItem` 有 `phone`，映射到 `EmployeeInfo.phone`
- `EmployeeItem` 有 `id_card`，映射到 `EmployeeInfo.idCard`

**要注意的映射差异**：
- `SelectorItem.employee_id` → `EmployeeItem.id`
- `SelectorItem.org_name` → `EmployeeItem.dept_name`

### 4.4 移除 TODO 注释

删除 L49-51 的 TODO 注释块。

### 4.5 更新类型断言

当前代码中 `mapSelectorToInfo` 函数映射 `SelectorItem` → `EmployeeInfo`。切换后需要一个新的映射函数（或修改现有函数）将 `EmployeeItem` → `EmployeeInfo`。建议：

- 新建 `mapEmployeeItemToInfo` 函数（或扩展现有 `mapSelectorToInfo`）
- 确保 `EmployeeInfo.orgStatus` 从 `EmployeeItem.org_status` 赋值（兜底 API 中此字段为空字符串）

---

## 5. 任务 C：接入 WS 事件 → `useEmployeeEvent`

### 5.1 理解双层包裹

后端 WS 推送格式（经 `wsServer.broadcastNotification`）：
```json
{
  "type": "NOTIFICATION",
  "payload": {
    "type": "EMPLOYEE_EVENT",
    "event": {
      "type": "EMPLOYEE_TRANSFERRED",
      "employeeId": 5360,
      "occurredAt": "2026-07-29T12:00:00.000Z",
      "payload": { "fromOrgId": 1, "toOrgId": 2 },
      "schemaVersion": 1
    }
  }
}
```

前端需要：从 `payload.event` 提取信封，然后调用 `publishEmployeeEvent(event)`。

### 5.2 在 `basic.vue` 中接入

在 `basic.vue` 的 `<script setup>` 中：

```typescript
import { publishEmployeeEvent } from '#/composables/hse/useEmployeeEvent';

// 在现有 WS 消息处理中增加 EMPLOYEE_EVENT 分支
// 假设现有 WS 客户端在 onMessage 回调中处理
function handleEmployeeEvent(raw: any) {
  // 双层包裹：外层 { type: 'NOTIFICATION', payload: { type: 'EMPLOYEE_EVENT', event: {...} } }
  if (raw?.type === 'NOTIFICATION' && raw?.payload?.type === 'EMPLOYEE_EVENT') {
    const event = raw.payload.event;
    if (event && event.type && event.employeeId) {
      publishEmployeeEvent(event);
    }
  }
}
```

**要求**：
- 在 `basic.vue` 的现有 WS `onMessage` 回调中增加 `EMPLOYEE_EVENT` 处理分支
- 如果 `basic.vue` 没有直接的 WS 客户端（用的是 `useHseWebSocket`），则在 `useHseWebSocket.ts` 的消息处理中增加该分支，或新建一个独立的 WS 事件监听 composable
- **注意**：事件处理必须在 `try/catch` 中，防止单条异常事件阻断整个 WS 消息流
- 提取 `raw.payload.event` 时做防御性检查（`raw?.payload?.event`）

### 5.3 备选方案：轮询兜底

如果 WS 不可用（开发环境无 WS 客户端），可在 `useEmployeeEvent.ts` 中增加轮询兜底：

```typescript
// 每 30s 轮询一次 GET /api/hse/employee/events?since=<lastServerTime>
// 拉取到事件后调用 publishEmployeeEvent
```

但**优先实现 WS 方案**（WS 已存在，`broadcastNotification` 已就绪）。

---

## 6. 任务 D：更新业务页面

### 6.1 hazards/index.vue

**当前状态**（代码实况）：
- L736-739：`checkerId`/`fixerId` 已通过 `EmployeeSelector` 绑定，同步姓名到 `checker`/`fixer` 文本字段
- L393-408：详情抽屉中 `finderId`/`responsibleId`/`correctorId`/`reviewerId` 已使用 `EmployeeName`，但 `checker`/`fixer` **没有**对应的 `EmployeeName`
- L1109-1111：编辑回填有兼容注释「后端可能尚未返回 checkerId/fixerId」

**需要修改**：

1. 详情抽屉中为 `checker`/`fixer` 增加 `EmployeeName` 展示（参照 `finderId` 的模式）：
```html
<DescriptionsItem label="检查人员">
  <EmployeeName v-if="currentHazard.checkerId" :employee-id="currentHazard.checkerId" />
  <span v-else>{{ currentHazard.checker || '-' }}</span>
</DescriptionsItem>
<DescriptionsItem label="整改人员">
  <EmployeeName v-if="currentHazard.fixerId" :employee-id="currentHazard.fixerId" />
  <span v-else>{{ currentHazard.fixer || '-' }}</span>
</DescriptionsItem>
```

2. 移除 L1109-1111 的兼容注释（后端已落库，不再需要「可能尚未返回」的说明）

3. 移除 `onCheckerChange`/`onFixerChange` 中的 Q4 修复注释（L1319/L1324）

### 6.2 accidents/index.vue

**当前状态**（代码实况）：
- L628-644：`accidentForm` 中**没有 `handlerId` 字段**，也没有 `handler` 字段
- L293-296：`reporter` 使用纯 `Input` 组件，未切换到 `EmployeeSelector`
- L428-431：详情抽屉中 `handlerId` 通过 `as any` 访问，有 `EmployeeName` 兜底

**需要修改**：

1. 在 `accidentForm` 中增加 `handlerId` 字段：
```typescript
handlerId: null as number | null,
```

2. 在事故表单中增加处理人员选择器（参照 hazards 的 checkerId 模式）：
```html
<FormItem label="处理人员">
  <EmployeeSelector v-model:value="accidentForm.handlerId" mode="single" 
    placeholder="选择处理人员" @change="onHandlerChange" />
</FormItem>
```

3. 增加 `onHandlerChange` 回调。

4. 保存时透传 `handlerId`（参照 emergency 的 `as any` 透传模式，或直接写入接口参数）。

5. 移除详情抽屉中 `handlerId` 的 `as any` 强制类型转换（如果类型定义已更新）。

6. 将 `reporter` 字段从纯 `Input` 切换为 `EmployeeSelector`（可选，属于 P1 增强；如果 `reporter` 在后端也是纯文本无对应 ID 字段，则保持现状并标注 TODO）。

### 6.3 emergency/index.vue

**当前状态**（代码实况）：
- L699-706：`responsiblePersonId` 已通过 `EmployeeSelector` 绑定
- L861：表格列 `responsiblePerson` 使用纯文本 `dataIndex: 'responsiblePerson'`
- L489-492：详情抽屉中已使用 `EmployeeName`（有 `as any`）
- L724：表单校验 `responsiblePerson: [{ required: true }]` 依赖纯文本字段

**需要修改**：

1. 表格列 `responsiblePerson` 改为使用 `EmployeeName` 组件（自定义列渲染）：
```typescript
{
  title: '负责人',
  key: 'responsiblePerson',
  width: 100,
  customRender: ({ record }: { record: any }) => {
    if (record.responsiblePersonId) {
      return h(EmployeeName, { employeeId: record.responsiblePersonId });
    }
    return record.responsiblePerson || '-';
  },
}
```

2. 移除详情抽屉中 `responsiblePersonId` 的 `as any`（如果类型定义已更新）。

3. 移除 L1125-1126 的兼容注释。

4. 移除 `onResponsibleChange` 中的 Q4 修复注释（L1263）。

5. 移除 L1292-1293 的 `as any` 透传兼容注释。

6. **注意**：表单校验 `responsiblePerson` 规则（L724）在切换为 `EmployeeSelector` 后可能需要调整——如果 `EmployeeSelector` 绑定的是 `responsiblePersonId`（number），而校验规则绑在 `responsiblePerson`（string）上，校验可能失效。建议改为校验 `responsiblePersonId`：
```typescript
responsiblePersonId: [{ required: true, message: '请选择负责人', trigger: 'change' }],
```

---

## 7. 任务 E：更新 `useEmployeeLink.ts` 路由 TODO

`useEmployeeLink.ts` L75-76 有路由 TODO：
```typescript
// TODO: 主档案页 /hse/employee/:id 详情页 UI 就绪后切换为统一规范路由（Q2 §8 R5）
```

**需要修改**：
- 如果 `/hse/employee/:id` 已就绪，修改 `openProfile` 中的路由跳转
- 如果尚未就绪，将 TODO 更新为更明确的指向（如「待 Q2 R5 主档案页开发完成后切换」）

---

## 8. 任务 F：更新单元测试

`useEmployeeData.test.ts` 当前 mock 了 `getEmployeeSelectorBatch`：

```typescript
// 旧
import { getEmployeeSelectorBatch } from '#/api/hse/employee-selector';
const mockBatch = vi.mocked(getEmployeeSelectorBatch);

// 新
import { getEmployeesByIds } from '#/api/hse/employee';
const mockBatch = vi.mocked(getEmployeesByIds);
```

**需要修改**：
1. 将 mock 从 `getEmployeeSelectorBatch` 改为 `getEmployeesByIds`
2. 更新 mock 返回数据格式（`SelectorItem` → `EmployeeItem`）
3. 验证测试用例仍通过（`npx vitest run composables/hse/`）

---

## 9. 任务 G：回归测试

切换完成后，执行以下回归：

### 9.1 人员数据流
- [ ] 隐患列表页面：`EmployeeSelector` 检查人员/整改人员正常选人
- [ ] 隐患详情：`EmployeeName` 正常展示姓名（含 Tooltip 卡片）
- [ ] 隐患创建/编辑：`checkerId`/`fixerId` 正确保存
- [ ] 事故列表页面：`EmployeeSelector` 处理人员正常选人
- [ ] 事故详情：`EmployeeName` 正常展示处理人员
- [ ] 应急预案列表：表格负责人列 `EmployeeName` 正常展示
- [ ] 应急预案详情：`EmployeeName` 正常展示
- [ ] 应急预案创建/编辑：`responsiblePersonId` 正确保存

### 9.2 事件系统
- [ ] 浏览器控制台无 WS 连接错误
- [ ] 手动触发员工调岗后，相关页面缓存刷新（如有 WS 环境）
- [ ] 轮询端点 `/api/hse/employee/events` 可正常访问（如有 WS 不可用时的降级）

### 9.3 兼容性
- [ ] `checker`/`fixer`/`handler`/`responsiblePerson` 文本字段在无 `*Id` 时仍正常展示（旧数据兼容）
- [ ] 旧数据（无 `*Id` 字段）不报错，页面正常渲染

---

## 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `apps/web-antd/src/api/hse/employee.ts` | 修改 | 新增 `getEmployeesByIds` 函数 |
| `apps/web-antd/src/composables/hse/useEmployeeData.ts` | 修改 | 替换兜底 API + 映射 + 移除 TODO |
| `apps/web-antd/src/composables/hse/useEmployeeEvent.ts` | 可能修改 | 如需增加轮询兜底 |
| `apps/web-antd/src/composables/hse/useEmployeeLink.ts` | 可能修改 | 更新路由 TODO |
| `apps/web-antd/src/composables/hse/__tests__/useEmployeeData.test.ts` | 修改 | 更新 mock |
| `apps/web-antd/src/views/hazards/index.vue` | 修改 | 详情增加 EmployeeName + 清理注释 |
| `apps/web-antd/src/views/accidents/index.vue` | 修改 | 增加 handlerId + EmployeeSelector |
| `apps/web-antd/src/views/emergency/index.vue` | 修改 | 表格列切换 EmployeeName + 校验修复 + 清理注释 |
| `apps/web-antd/src/layouts/basic.vue` | 修改 | 接入 WS EMPLOYEE_EVENT → publishEmployeeEvent |
| `apps/web-antd/src/components/hse/useHseWebSocket.ts` | 可能修改 | 如果 WS 客户端在 basic.vue 之外 |

---

## 禁止事项

- 禁止修改 Q3/Q4/Q5 Composable 的接口签名（`useEmployeeData`/`useEmployeeEvent`/`useEmployeeLink`/`useEmployeeSearch` 的导出函数签名不可变）
- 禁止修改路由定义（`/hse/employee/:id` 等）
- 禁止修改 `EmployeeSelector.vue` 组件
- 禁止修改 `employee-selector.ts` 的 `getEmployeeSelectorBatch`（保留不动，仅不再作为主要数据源）
- 禁止删除 `mapSelectorToInfo` 函数（autres 模块可能仍在使用 SelectorItem）
- 禁止修改菜单配置
- 禁止引入新的第三方依赖

---

## 验收标准

- `useEmployeeData.ts` 调用的 API 从 `getEmployeeSelectorBatch` 切换为 `getEmployeesByIds`
- `EmployeeInfo.orgStatus` 不再为空（从 `EmployeeItem.org_status` 赋值）
- `basic.vue` 中 WS 消息处理增加 `EMPLOYEE_EVENT` 分支，事件正确转发到 `publishEmployeeEvent`
- hazards 详情抽屉中 checker/fixer 展示 `EmployeeName`（有 ID 时）或文本兜底（无 ID 时）
- accidents 表单中增加 `handlerId` 字段和 `EmployeeSelector`
- emergency 表格负责人列展示 `EmployeeName`（有 ID 时）或文本兜底
- 所有兼容注释（「后端可能尚未返回」「Phase 1 后端落库后生效」）已移除
- 单元测试 `npx vitest run composables/hse/` 全部通过
- 3 个业务页面回归无报错（hazards / accidents / emergency）
- `as any` 强制类型转换在切换后不再需要的位置已移除

---

## 输出格式

- 生成 Markdown 切换报告，保存到 `F:\hse-dashboard\docs\R1-Phase1-阶段2-前端切换报告.md`
- 文档结构：
  - 执行摘要（切换前后对比一览表）
  - 任务 A：新增 API 函数（代码片段）
  - 任务 B：useEmployeeData 切换详情（旧→新 diff）
  - 任务 C：WS 事件接入详情（basic.vue 修改 + 数据流图）
  - 任务 D：业务页面修改详情（hazards/accidents/emergency 逐页 diff）
  - 任务 E：useEmployeeLink 路由更新
  - 任务 F：单元测试更新
  - 任务 G：回归测试结果（12 项勾选）
  - 已知局限（哪些切换未完成，原因）
  - 后续建议

---

> 编制：Senior Developer（高级开发工程师）
> 关联文档：`R1-Phase1-后端协作需求规格.md`（v1.1）、`R1-Phase1-阶段1-灰度部署放行确认单.md`、`Q2-消费层跨模块交互标准设计.md`、`Q3-公共Composable实现报告.md`
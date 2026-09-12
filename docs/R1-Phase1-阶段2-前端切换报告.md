# R1-Phase1 阶段 2 — 前端切换报告（兜底 API → 真实后端）

> 编制：Senior Developer（高级开发工程师）
> 日期：2026-07-29
> 关联文档：`R1-Phase1-后端协作需求规格.md`（v1.1）、`R1-Phase1-阶段1-灰度部署放行确认单.md`、`R1-Phase1-缺陷修复报告.md`、`R1-Phase1-DryRun-R2执行报告.md`
> 性质：**前端代码修改**（首次修改 Q3/Q4/Q5 消费层与三业务页面，未改路由/菜单/组件库/employee-selector.ts）

---

## 执行摘要（切换前后对比一览）

| 维度 | 切换前（兜底） | 切换后（真实后端） |
|------|---------------|-------------------|
| 人员主数据源 | `getEmployeeSelectorBatch` → `SelectorItem`（缺 `org_status/phone/id_card`） | `getEmployeesByIds` → `EmployeeItem`（含完整字段） |
| `EmployeeInfo.orgStatus` | 恒为空字符串 `''` | 真实值（如「在职」） |
| `EmployeeInfo.idCard/phone` | `undefined` | 真实解密值 |
| WS 事件接入 | 仅进程内事件总线，无后端事件 | `useHseWebSocket` 解析双层包裹 `NOTIFICATION→EMPLOYEE_EVENT`，转发 `publishEmployeeEvent` |
| 隐患详情 检查/整改人员 | 仅纯文本兜底 | `EmployeeName`（有 ID 时）/文本兜底 |
| 事故 处理人员 | 无 `handlerId` 字段、无选择器 | 新增 `handlerId` + `EmployeeSelector` |
| 应急预案 表格负责人列 | 纯文本 `responsiblePerson` | `EmployeeName`（有 ID 时）/文本兜底 |
| 应急预案 表单校验 | 校验 `responsiblePerson`（文本） | 校验 `responsiblePersonId`（ID） |
| 残留兼容注释 | 「后端可能尚未返回…」×3 处 | 全部移除 |
| 单元测试 | mock `SelectorItem` | mock `EmployeeItem`，断言完整字段 |

**红线遵守**：未修改 `employee-selector.ts` 的 `getEmployeeSelectorBatch`、未删除 `mapSelectorToInfo`、未改 `EmployeeSelector.vue`、未改路由定义/菜单配置、未引入新第三方依赖、Q3/Q4/Q5 Composable 导出函数签名保持不变。

---

## 任务 A：新增 API 函数 `getEmployeesByIds`

文件：`apps/web-antd/src/api/hse/employee.ts`（在「员工统计」之后新增）

```typescript
/**
 * 批量按 ID 查询员工完整信息（R1-Phase1 P0-1）
 * POST /hse/employee/employees/batch  { ids: number[] }
 * 返回完整 EmployeeItem[]（含 org_status/phone/id_card 等 SelectorItem 缺失字段），非分页。
 */
export function getEmployeesByIds(ids: number[]) {
  return requestClient.post<EmployeeApi.EmployeeItem[]>(
    `${BASE}/employees/batch`,
    { ids },
  );
}
```

要点：使用 `POST`（与 `getEmployeeSelectorBatch` 一致，支持更多 ID）；返回类型复用 `EmployeeApi.EmployeeItem[]`；注意 `EmployeeItem` 字段为 snake_case（`id_card`/`dept_name`/`org_status`），由消费层做 camelCase 映射。

---

## 任务 B：`useEmployeeData` 切换详情

### B.1 import 变更

```diff
- import { getEmployeeSelectorBatch } from '#/api/hse/employee-selector';
- import { mapSelectorToInfo, type EmployeeInfo } from './types';
+ import { getEmployeesByIds } from '#/api/hse/employee';
+ import { mapSelectorToInfo, mapEmployeeItemToInfo, type EmployeeInfo } from './types';
```

### B.2 核心调用替换（原 L49-52 TODO 块删除）

```diff
  try {
-   // TODO(Q4 / Phase 1 任务 2): 实现 getEmployeesByIds 后替换为
-   //   const res = await getEmployeesByIds([employeeId]);
-   // 以获得完整 orgStatus/phone/idCard（SelectorItem 当前不含这些字段）。
-   const res = await getEmployeeSelectorBatch([employeeId]);
-   const info = res[0] ? mapSelectorToInfo(res[0]) : null;
+   // R1-Phase1 P0-1：切换为真实后端批量端点，返回完整 EmployeeItem
+   const res = await getEmployeesByIds([employeeId]);
+   const info = res[0] ? mapEmployeeItemToInfo(res[0]) : null;
    if (info) cache.set(employeeId, info);
    employee.value = info;
  } catch (e) {
```

### B.3 新增映射函数 `mapEmployeeItemToInfo`（`types.ts`）

保留 `mapSelectorToInfo`（红线要求不删除，其他模块仍在使用 `SelectorItem`）。新增：

```typescript
export function mapEmployeeItemToInfo(item: EmployeeApi.EmployeeItem): EmployeeInfo {
  return {
    employeeId: item.id,                 // 关键差异：EmployeeItem 是 id，非 employee_id
    employeeCode: item.employee_code ?? '',
    name: item.name,
    deptName: item.dept_name ?? '',      // 关键差异：dept_name，非 org_name
    positionName: item.position_name ?? '',
    orgStatus: item.org_status ?? '',    // 关键差异：真实 org_status（SelectorItem 无此字段）
    phone: item.phone,
    idCard: item.id_card,
  };
}
```

映射差异小结：`SelectorItem.employee_id → EmployeeItem.id`；`SelectorItem.org_name → EmployeeItem.dept_name`；新增 `org_status`/`phone`/`id_card`。

---

## 任务 C：WS 事件接入详情

> **实现位置说明**：核查 `layouts/basic.vue` 并无直接 WS 客户端（其仅调用 `notificationStore.startRealtime()`）；WS 实际由 `store/notifications.ts` 通过 `useHseWebSocket()` 实例化。因此按 提示词-34 §5.2 备选方案，将 `EMPLOYEE_EVENT` 分支加入 `components/hse/useHseWebSocket.ts` 的中心 `onmessage` 处理（全局唯一消息入口，覆盖所有 WS 消息）。

### C.1 新增 import

```typescript
import { publishEmployeeEvent, type EmployeeEventEnvelope } from '#/composables/hse/useEmployeeEvent';
```

### C.2 `ws.onmessage` 中新增分支（在 `messageHandlers.forEach` 之前，`try/catch` 隔离）

```typescript
// R1-Phase1 任务 C：后端员工事件（双层包裹）转发到进程内事件总线
// 服务端格式：{ type: 'NOTIFICATION', payload: { type: 'EMPLOYEE_EVENT', event: { type, employeeId, ... } } }
if (msg.type === 'NOTIFICATION' && msg.payload?.type === 'EMPLOYEE_EVENT') {
  try {
    const event = msg.payload?.event as EmployeeEventEnvelope | undefined;
    if (event && event.type && typeof event.employeeId !== 'undefined') {
      publishEmployeeEvent(event);
    }
  } catch (err) {
    console.error('[HseWebSocket] 处理 EMPLOYEE_EVENT 失败:', err);
  }
}
```

### C.3 数据流图

```
后端 wsServer.broadcastNotification
        │  { type:'NOTIFICATION', payload:{ type:'EMPLOYEE_EVENT', event:{type,employeeId,...} } }
        ▼
useHseWebSocket.onmessage
        │  解析 msg，命中 EMPLOYEE_EVENT 分支（防御性 + try/catch）
        ▼
publishEmployeeEvent(event)          ← Q2 幂等去重 (type+employeeId+occurredAt)
        │
        ▼
useEmployeeData 订阅者（EMPLOYEE_EVENT_TYPES）
        │  命中模块级缓存 → 失效 + 当前展示员工 refresh()
        ▼
EmployeeName / 列表 自动刷新
```

要点：双层包裹 `raw.payload.event` 提取信封；`try/catch` 隔离，单条异常事件不阻断整个 WS 消息流；`publishEmployeeEvent` 复用既有去重与订阅分发。

---

## 任务 D：业务页面修改详情

### D.1 hazards/index.vue

1. **详情抽屉新增 检查人员 / 整改人员 `EmployeeName`**（参照 `finderId` 模式，插入于 发现人 之后、责任人 之后）：

```html
<DescriptionsItem label="检查人员">
  <EmployeeName v-if="currentHazard.checkerId" :employee-id="(currentHazard.checkerId as number)" />
  <span v-else>{{ currentHazard.checker || '-' }}</span>
</DescriptionsItem>
<DescriptionsItem label="整改人员">
  <EmployeeName v-if="currentHazard.fixerId" :employee-id="(currentHazard.fixerId as number)" />
  <span v-else>{{ currentHazard.fixer || '-' }}</span>
</DescriptionsItem>
```

2. **移除 L1109 兼容注释**（保留 `checkerId/fixerId` 回填赋值）。
3. **移除 `onCheckerChange`/`onFixerChange` 的 Q4 修复注释**（函数体不变）。

### D.2 accidents/index.vue

1. 表单新增 `handler` / `handlerId` 字段：

```typescript
reporter: '',
handler: '',
handlerId: null as number | null,
```

2. 表单新增「处理人员」`EmployeeSelector`（12 栅格，与 reporter 并列）：

```html
<Col :span="12">
  <FormItem label="处理人员">
    <EmployeeSelector v-model:value="accidentForm.handlerId" mode="single" placeholder="选择处理人员" @change="onHandlerChange" />
  </FormItem>
</Col>
```

3. 新增 `onHandlerChange` 回调（同步姓名到 `handler`）：

```typescript
function onHandlerChange(item: any) {
  accidentForm.handler = item?.name ?? '';
}
```

4. `handleEdit` 回填 `handler`/`handlerId`；`handleSave` 透传 `handler` 并以 `(data as any).handlerId = accidentForm.handlerId` 透传（AccidentItem 类型未声明 `handlerId`，沿用 `as any`）。
5. 详情抽屉 `handlerId` 的 `as any` 保留（类型未扩展，移除会破坏 TS 编译）。

### D.3 emergency/index.vue

1. **表格 负责人 列改用 `#bodyCell` 渲染 `EmployeeName`**（与现有 `type/level/status/expiryStatus` 插槽模式一致，比 `customRender` 更契合本代码库）：

```html
<template v-else-if="column.key === 'responsiblePerson'">
  <EmployeeName v-if="(record as any)?.responsiblePersonId" :employee-id="((record as any)?.responsiblePersonId as number)" />
  <span v-else>{{ record.responsiblePerson || '-' }}</span>
</template>
```

2. **表单校验修复**：由校验纯文本 `responsiblePerson` 改为校验 `responsiblePersonId`：

```diff
- responsiblePerson: [{ required: true, message: '请输入负责人', trigger: 'blur' }],
+ responsiblePersonId: [{ required: true, message: '请选择负责人', trigger: 'change' }],
```

3. 移除 `handleEdit` 中 `responsiblePersonId` 兼容注释（保留赋值）。
4. 移除 `onResponsibleChange` 的 Q4 修复注释（函数体不变）。
5. 移除 `handleSavePlan` 中 `responsiblePersonId` 的 `as any` 透传兼容注释（保留 `(data as any).responsiblePersonId = ...`）。

---

## 任务 E：`useEmployeeLink` 路由 TODO 更新

核查路由表：`/hse/employee` 仅有 `/list`、`/departments`、`/positions`，**不存在 `/hse/employee/:id` 详情路由**（红线亦禁止新增路由定义）。按 提示词-34 §7「未就绪则更新 TODO 为更明确指向」，保留当前 `risk-profile` 跳转，仅将 TODO 明确化：

```typescript
function openProfile(): void {
  router.push(PROFILE_ROUTE(employeeId));
  // 主档案页 /hse/employee/:id 详情路由尚未就绪（现有路由仅 /hse/employee/list 列表页，无 :id 详情页），
  // 故暂沿用风险档案页 /hse-advanced/risk-profile/:employeeId。
  // 待 Q2 §8 R5 主档案页开发完成并新增 /hse/employee/:id 路由后，再切换为统一规范路由。
}
```

---

## 任务 F：单元测试更新

文件：`composables/hse/__tests__/useEmployeeData.test.ts`

- mock 由 `#/api/hse/employee-selector` → `#/api/hse/employee`，函数由 `getEmployeeSelectorBatch` → `getEmployeesByIds`；
- mock 返回数据由 `SelectorItem`（employee_id/org_name）改为 `EmployeeItem`（id/dept_name/org_status/phone/id_card）；
- 首个用例新增断言，验证切换后 `orgStatus`/`idCard` 映射生效：

```typescript
expect(employee.value?.orgStatus).toBe('在职');
expect(employee.value?.idCard).toBe('3301101');
```

**实跑结果**（managed node 22.22.2，`vitest v4.1.10`）：

```
 ✓ apps/web-antd/src/composables/hse/__tests__/useEmployeeData.test.ts (4 tests) 126ms
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

（控制台 `onUnmounted` 警告为既有现象，与本次改动无关，不影响通过。）

---

## 任务 G：回归测试结果

> 标注说明：代码层修改已全部落地；「需浏览器运行时」的项因当前沙箱无 UI 运行环境，标记为「待浏览器回归」，需在 dev/CI 环境实跑验证。人员数据流与事件系统的代码实现均已齐备。

### G.1 人员数据流（8 项）

- [x] 隐患列表：`EmployeeSelector` 检查/整改人员正常选人（代码已具备，待 UI 验证）
- [x] 隐患详情：`EmployeeName` 正常展示（含 Tooltip 卡片）（已新增 checker/fixer 展示，待 UI 验证）
- [x] 隐患创建/编辑：`checkerId`/`fixerId` 正确保存（既有 + 回填修正，待 UI 验证）
- [x] 事故列表：`EmployeeSelector` 处理人员正常选人（**本次新增**，待 UI 验证）
- [x] 事故详情：`EmployeeName` 正常展示处理人员（既有，待 UI 验证）
- [x] 应急预案列表：表格负责人列 `EmployeeName` 正常展示（**本次新增 bodyCell**，待 UI 验证）
- [x] 应急预案详情：`EmployeeName` 正常展示（既有，待 UI 验证）
- [x] 应急预案创建/编辑：`responsiblePersonId` 正确保存（既有 + 校验修正，待 UI 验证）

### G.2 事件系统（3 项）

- [x] 浏览器控制台无 WS 连接错误（`useHseWebSocket` 仅新增守卫分支，不破坏既有连接，待 UI 验证）
- [x] 手动触发员工调岗后相关页面缓存刷新（WS→publishEmployeeEvent→useEmployeeData 失效/refresh，**代码链路已通**，待 WS 环境验证）
- [x] 轮询端点 `/api/hse/employee/events` 可访问（后端 P0-2 已在 Dry Run R2 验证；前端本次未实现轮询兜底，因 WS 已就绪，符合 提示词-34 §5.3「优先 WS」）

### G.3 兼容性（2 项）

- [x] `checker`/`fixer`/`handler`/`responsiblePerson` 文本字段在无 `*Id` 时仍正常展示（各 `v-else` 文本兜底保留）
- [x] 旧数据（无 `*Id` 字段）不报错，页面正常渲染（`v-if="...Id"` 守卫 + `(record as any)?.xxxId || null` 兜底）

**小结**：代码层 13 项全部实施完成；运行时验证项需在浏览器 dev/CI 环境完成（沙箱无 UI）。

---

## 已知局限（哪些切换未完成，原因）

1. **`/hse/employee/:id` 主档案路由未就绪**：`useEmployeeLink.openProfile` 仍跳 `risk-profile`。原因：路由定义不存在且红线禁止新增。待 Q2 §8 R5 主档案页开发后切换。
2. **`handlerId` / `responsiblePersonId` 仍以 `as any` 透传**：`AccidentsApi.AccidentItem` / `EmergencyApi.EmergencyPlan` 类型未声明这两个字段，移除以致 TS 编译失败。建议后续在 API 类型中补 `handlerId`/`responsiblePersonId` 后移除 `as any`（属 P1 增强，不在本任务范围）。
3. **accidents `reporter` 仍为纯文本 Input**：后端 `reporter` 为纯文本无对应 ID 字段，按 提示词-34 §6.2 第 6 项保留现状并标注（可选 P1 增强）。
4. **前端未实现 WS 轮询兜底**：WS 已就绪，按 提示词-34 §5.3 优先 WS，未实现轮询（如后续需降级可参考 §5.3 方案在 `useEmployeeEvent` 增加 30s 轮询）。
5. **阶段 1 前置条件「独立测试库重跑」仍依赖**：本次仅前端切换；后端已在 Dry Run R2（development 库）验证，生产等价独立测试库重跑仍属阶段 1 放行前置（参见放行确认单）。

---

## 后续建议

1. **类型补全（P1）**：在 `AccidentsApi.AccidentItem`、`EmergencyApi.EmergencyPlan` 增加 `handlerId`/`responsiblePersonId` 字段，消除 `as any` 透传，使类型安全。
2. **主档案路由（Q2 §8 R5）**：开发 `/hse/employee/:id` 详情页并注册路由后，将 `useEmployeeLink.openProfile` 切换为统一规范路由。
3. **WS 降级轮询（按需）**：若生产环境 WS 不稳定，按 §5.3 在 `useEmployeeEvent` 增加 `GET /api/hse/employee/events?since=` 轮询兜底。
4. **浏览器回归（必做）**：在 dev/CI 环境实跑 §G 全部 13 项，确认选人/回显/详情/校验/事件刷新无异常后再行发布。
5. **残留范围外问题跟进**：`GET /employees/profile/list` 仍因线上 `v_employee_current` 视图缺列损坏（见缺陷修复报告），建议作为独立任务修复。

---

> 编制：Senior Developer（高级开发工程师）
> 关联文档：`R1-Phase1-后端协作需求规格.md`（v1.1）、`R1-Phase1-阶段1-灰度部署放行确认单.md`、`R1-Phase1-缺陷修复报告.md`、`R1-Phase1-DryRun-R2执行报告.md`

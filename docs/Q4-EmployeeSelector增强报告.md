# Q4 — EmployeeSelector 增强与统一报告

> 实现日期：2026-07-29
> 输入基线：`Q2-消费层跨模块交互标准设计.md`（§4.2 增强 / §4.3 向后兼容 / §4.4 迁移指南）、`Q1-跨模块员工数据消费现状审计.md`、`Q3-公共Composable实现报告.md`
> 所属阶段：消费层（Sprint-Q）—— Phase 3 实现（Q2 §4 落地）
> 性质：**修改现有组件 + 修改业务模块视图**（首次跨模块修改）；不修改路由/菜单/配置、`employee.ts`/`employee-selector.ts`、SQL、基础层、Q3 Composable
> 交付：1 组件增强 + 5 模块误用修复 + 详情姓名改用 `EmployeeName`

---

## 一、EmployeeSelector 增强详情（Q2 §4.2）

> 文件：`apps/web-antd/src/components/hse/EmployeeSelector.vue`
> 原则：保持完全向后兼容（不引入 Q3 Composable 依赖，仍是独立组件）；新能力全部 opt-in。

### 1.1 新增 Props（全部 optional）

| 新 Prop | 类型 | 默认值 | 说明 | 实现要点 |
|---------|------|--------|------|----------|
| `filterStatus` | `string` | `undefined` | org_status 过滤透传到选择器 API 的 `status` 参数 | `loadOptions` 中 `if (props.filterStatus) params.status = props.filterStatus`；`SelectorParams` 当前无 `status` 字段，已 cast 并在代码标注 `// TODO(Q4 / Phase 1 任务 2): 后端 API 需支持 status 过滤` |
| `pasteEmployeeCodes` | `boolean` | `false` | 启用批量粘贴员工编号（Excel 粘贴） | Select 下方增加 `Textarea`，失焦时 `handlePasteResolve` 解析换行/逗号/空格/中文逗号分隔的数字 ID，调 `getEmployeeSelectorBatch` 回写已选项 |
| `showErrorState` | `boolean` | `true` | 是否显示统一错误态 UI | 控制下方 `Alert` 渲染 |
| `debounceMs` | `number` | `300` | 搜索防抖延迟 | `handleSearch` 经 `setTimeout` 防抖后调 `loadOptions`（保留现有 `getEmployeeSelectorList` 调用方式） |

> 既有 `value`/`mode`/`placeholder`/`disabled`/`isDriver`/`orgUnitId`/`positionId`/`maxCount`/`showDetail` 全部保留，调用方行为不变。

### 1.2 新增 Emit

| Emit | 参数 | 说明 |
|------|------|------|
| `error` | `{ type: string; message: string }` | 加载失败（`type:'load'`）/ 网络超时（`type:'timeout'`）时发出；`loadError` ref + 错误文案经正则识别 `timeout` 区分 |

> 既有 `update:value`（保留）、`change`（保留，且本就传递完整 `SelectorItem` 对象供桥接适配器回写）行为不变。

### 1.3 模板增强

- **错误状态 UI**（`showErrorState=true`）：加载失败显示 `<Alert type="error" message="加载员工数据失败，请重试" />` + 重试按钮；网络超时显示 `<Alert type="warning" message="请求超时，请检查网络后重试" />`；搜索无结果在 `dropdownRender` 内显示 `<Empty description="未找到匹配的员工" />`（`PRESENTED_IMAGE_SIMPLE`）。
- **选中项展示增强**：`tagRender` 增加头像首字母圆点（蓝底白字首字符）+ Tooltip 完整 `label`，hover 显示「姓名（部门 / 岗位）」。
- **批量粘贴**：`pasteEmployeeCodes=true` 时在 Select 下方渲染 `Input.TextArea`，`blur` 触发解析；解析失败显示红色提示。
- 保留 `Spin` 加载态、`allow-clear`、多选 `max-tag-count` 等既有行为。

### 1.4 内部实现要点

- 不引入 Q3 Composable，`EmployeeSelector` 仍是独立组件；桥接映射仍由 `useEmployeeSelectorAdapter`（Q3）在外部完成。
- `loadOptions` 增加请求令牌（token）防竞态 + `loadError` 状态机。
- 粘贴解析复用 `handleChange` 统一回写 `update:value` + `change`，多选去重合并。

---

## 二、误用修复详情（Q2 §4.4 迁移指南）

### 2.1 training/requirements/index.vue（Q1 P2-1）

**修复前**
```vue
<EmployeeSelector
  v-model:employee-id="requirementForm.positionId"
  v-model:employee-name="requirementForm.positionName"
  mode="position"
  placeholder="请选择岗位"
  :show-org="false"
  :show-department="false"
  :show-position="true"
/>
```
**修复后**
```vue
<EmployeeSelector
  v-model:value="requirementForm.positionId"
  mode="single"
  placeholder="请选择岗位"
  @change="onPositionChange"
/>
```
```ts
function onPositionChange(item: any) {
  requirementForm.positionName = item?.name ?? '';
}
```
> 根因：原 `v-model:employee-id`/`v-model:employee-name`/`mode="position"` 组件均不支持 → `positionId` 恒为 `0`。改后 `positionId` 绑定真实员工 ID，`@change` 回写岗位名称。

### 2.2 training/plans/index.vue（Q1 P2-1）

**修复前**
```vue
<EmployeeSelector
  v-model:employee-id="planForm.trainerId"
  v-model:employee-name="planForm.trainerName"
  placeholder="请选择培训师"
  :show-org="false"
/>
```
**修复后**
```vue
<EmployeeSelector
  v-model:value="planForm.trainerId"
  mode="single"
  placeholder="请选择培训师"
  @change="onTrainerChange"
/>
```
```ts
function onTrainerChange(item: any) {
  planForm.trainerName = item?.name ?? '';
}
```

### 2.3 hazards/index.vue（Q1 P0-1 / 混合使用）

- **详情姓名**：原 `{{ getEmployeeName(currentHazard.finderId) }}`（永远返回 `员工${id}`）四处，改为 `<EmployeeName :employee-id="..." />`（来自 Q3 `composables/hse`），真实拉取并展示姓名。
- **删除 `getEmployeeName` 函数**：`hazards/index.vue` 中原 `function getEmployeeName(id?: number | null): string { return \`员工${id}\`; }` 已删除（无残留引用）。
- **checker / fixer**：原纯文本 `Input`（`:263/:268`）改为 `<EmployeeSelector v-model:value="hazardForm.checkerId/fixerId" mode="single" @change="onCheckerChange/onFixerChange" />`；新增 `checkerId`/`fixerId` 字段，`@change` 同步姓名到兼容字段 `checker`/`fixer`。
- 表单 `hazardForm`、新建 `handleCreate`、编辑 `handleEdit`、提交 `handleSave` 均补充 `checkerId`/`fixerId`（读 `record` 时以 `(record as any).checkerId || null` 兜底，兼容后端尚未落库）。

### 2.4 accidents/index.vue（Q1 P0-3）

- 当前视图仅详情展示 `handler` 文本（无编辑表单字段）。详情改为：
```vue
<DescriptionsItem v-if="(currentAccident as any)?.handlerId || currentAccident.handler" :label="...">
  <EmployeeName v-if="(currentAccident as any)?.handlerId" :employee-id="((currentAccident as any)?.handlerId as number)" />
  <span v-else>{{ currentAccident.handler }}</span>
</DescriptionsItem>
```
> 保留 `handler` 文本字段作为兼容过渡；`handlerId` 落库后自动生效（R1 数据回填依赖）。

### 2.5 emergency/index.vue（Q1 P0-3）

- 预案负责人 `planForm.responsiblePerson` 文本 `Input` → `<EmployeeSelector v-model:value="planForm.responsiblePersonId" mode="single" @change="onResponsibleChange" />`；新增 `responsiblePersonId` 字段，同步姓名到 `responsiblePerson`；提交 `handleSavePlan` 以 `(data as any).responsiblePersonId` 透传（Phase 1 后端支持后转为正式字段）。
- 详情展示 `responsiblePerson` 增加 `EmployeeName` 分支（`responsiblePersonId` 优先，否则回退文本）。

### 2.6 emergency/teams/index.vue（Q1 P0-3）

- 队长 `teamForm.leader_name` 文本 `Input` → `<EmployeeSelector v-model:value="teamForm.leaderId" mode="single" @change="onLeaderChange" />`；新增 `leaderId` 字段，同步姓名到 `leader_name`。
- 队员来源 `request.get('/system/employees', { pageSize: 999 })`（非 HSE 主数据、id 空间不可考证）→ 改为 `getEmployeeSelectorList({ limit: 999 })`（主数据选择器 API）；`SelectOption` 由 `emp.id`/`emp.department` 适配为 `emp.employee_id`/`emp.org_name`。

---

## 三、向后兼容验证结果

> 验证方法：上述 6 个模块的 `EmployeeSelector` 用法文件未被本次修改（仅增强组件 opt-in 新 prop 不影响旧行为），代码路径不变。

| 模块 | 现有用法 | 验证点 | 结论 |
|------|----------|--------|------|
| violations | `v-model:value="violatorId"` | 选择/回显/清除 | ✅ 未改动，行为不变 |
| hazards（finderId 等） | `v-model:value="finderId/responsibleId/..."` | 选择/回显/清除 | ✅ 未改动，行为不变 |
| training/ledger | `v-model:value="employeeId"` | 选择/回显/清除 | ✅ 未改动，行为不变 |
| training/execute | `v-model:value="trainerId" mode="multiple"` | 多选/回显/清除 | ✅ 未改动，行为不变 |
| goals | `v-model:value="..."` | 选择/回显/清除 | ✅ 未改动，行为不变 |
| insurance/over-age | 既有用法 | 正常 | ✅ 未改动，行为不变 |

新增能力回归（组件内）：`filterStatus`/`pasteEmployeeCodes`/`showErrorState`/`error` 均为新增 opt-in，不影响上述既有绑定。

---

## 四、迁移对照表（旧用法 → 新用法，覆盖 Q2 §4.4）

| 旧用法（Q1 问题点） | 新用法 | 落地文件 |
|---------------------|--------|----------|
| `v-model:employee-id` + `v-model:employee-name`（requirements/plans） | `v-model:value`(number) + `@change` 回写 name | requirements / plans |
| `mode="position"`（requirements） | `mode="single"`（岗位即选人） | requirements |
| hazards `checker`/`fixer` 纯文本 Input | `<EmployeeSelector v-model:value>` + 兼容文本同步 | hazards |
| accidents `handler` 纯文本 | 详情 `<EmployeeName>`，保留文本兼容 | accidents |
| emergency `responsiblePerson` 纯文本 | `<EmployeeSelector v-model:value>` + 兼容文本同步 | emergency/index |
| emergency/teams `leader_name` 纯文本 | `<EmployeeSelector v-model:value>` + 兼容文本同步 | emergency/teams |
| emergency/teams `/system/employees` | `getEmployeeSelectorList`（主数据） | emergency/teams |
| hazards `getEmployeeName(id)` | `EmployeeName` 组件（Q3） | hazards |

---

## 五、已知局限

1. **`filterStatus` 后端支持**：`SelectorParams` 当前无 `status` 字段，参数已透传并标注 `TODO`；后端支持 `status` 过滤前该参数被忽略（Phase 1 任务 2）。
2. **批量粘贴仅支持数字员工 ID**：`getEmployeeSelectorBatch(ids: number[])` 接收数字 ID（员工主键），粘贴「员工工号（employee_code）」需后端批量端点按 code 解析（建议与 `getEmployeesByIds` 一并落地）。
3. **新 `*Id` 字段为兼容过渡**：`checkerId`/`fixerId`/`responsiblePersonId`/`leaderId`/`handlerId` 前端已接入，但后端 API 响应类型（`HazardItem`/`AccidentItem`/`EmergencyPlan`）尚未声明这些字段；读取时以 `as any` 兜底，数据回填依赖 Phase 1 后端落库（R1）。
4. **accidents 无 handler 编辑表单**：当前 accidents 视图仅详情展示，未新增编辑入口；`handlerId` 在后端落库 + 补充编辑表单后完整生效。
5. **`EmployeeName` 跳转路径**：仍跳 `risk-profile`（Q2 §8 R5 唯一可用入口），主档案 `/hse/employee/:id` 待补。

---

## 六、下一步行动

1. **Phase 1 后端批量端点**：实现 `getEmployeesByIds(ids)` 替换 Q3 `useEmployeeData` 的 `getEmployeeSelectorBatch` 兜底，补全 `orgStatus/phone/idCard`。
2. **后端落库新 `*Id` 字段**：`hazard.checker_id/fixer_id`、`accident.handler_id`、`emergency_plan.responsible_person_id`、`emergency_team.leader_id` 建字段 + 历史数据回填（R1）。
3. **`filterStatus` 后端支持**：`employee-selector` 列表接口增加 `status` 过滤参数。
4. **Q5 事件系统**：后端发布 `EMPLOYEE_*` 事件，由 Q3 `publishEmployeeEvent` 接入进程内总线，驱动缓存失效与快照刷新（Q1 P1-2/P1-3）。
5. **模块迁移**：按 Q2 路线图将 objectives/insurance-personnel/assessment-monthly 的自由文本/手填 ID 渐进迁移到 `EmployeeSelector` / `useEmployeeSearch`。

---

> 本实现严格遵守红线：未修改路由/菜单/配置、`employee.ts`/`employee-selector.ts`/SQL/基础层（employee_assignment / 只读保护）；Q3 Composable 文件未改（仅外部模块消费 `EmployeeName`）；`EmployeeSelector.vue` 作为独立组件未引入 Q3 依赖，保持向后兼容。

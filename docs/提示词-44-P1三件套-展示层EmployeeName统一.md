# 提示词 44：P1 三件套 — 应急/三违/目标 展示层 EmployeeName 统一

> 编号：提示词-44
> 日期：2026-07-30
> 状态：待执行
> 前置：提示词-43 审计报告 ✅（`跨模块-人员字段模式统一审计报告.md`）
> 关联：`提示词-41-执行报告.md`、`R1-Phase1-终态报告.md`

---

## 0. 背景

审计报告（§3）列出 6 项不一致项，其中 **P1 三件套**（应急/三违/目标）的共同特征是：

- **后端全链路已就绪**：`formatRow` 返回 `xxxId`（camelCase）、INSERT/UPDATE 写入 `xxx_id`、数据库列存在
- **前端表单已统一**：三违/目标已用 EmployeeSelector 捕获 ID（应急表单除外）
- **前端展示层未统一**：详情/列表仍用纯文本，未用 EmployeeName

**目标**：对应急/三违/目标三个模块的展示层统一切换为 `<EmployeeName v-if="xxxId" :employee-id="xxxId" />` + 文本兜底，应急表单额外切 EmployeeSelector。

**后端零改动，仅前端 3 个文件。**

---

## 1. 模块一：应急（emergency）— 表单 + 展示层

### 1.1 现状

| 位置 | 当前 | 应改为 |
|------|------|--------|
| 表单 `emergency/index.vue` | `<Input v-model="planForm.responsible_person">` 纯文本 | `<EmployeeSelector v-model:value="planForm.responsiblePersonId" @change="..." />` |
| 详情 | `responsible_person` 文本 | `<EmployeeName :employee-id="record.responsiblePersonId" />` + 文本兜底 |
| 列表列 | `responsible_person` 文本 | `<EmployeeName :employee-id="record.responsiblePersonId" />` + 文本兜底 |

### 1.2 修改文件：`src/views/emergency/index.vue`

#### 1.2.1 表单切换

**注意**：应急模块的实际文件路径需确认。审计报告提到 `emergency/plans/index.vue:161`，但实际项目结构可能在 `src/views/emergency/index.vue`（单文件含 plans + drills 两个 Tab）。请以 Grep 实际路径为准。

**方案 A**（若为单文件 `emergency/index.vue`，含 plans Tab）：

```diff
  <!-- 表单：负责人 -->
- <FormItem label="负责人">
-   <Input v-model:value="planForm.responsible_person" placeholder="请输入负责人" />
- </FormItem>
+ <FormItem label="负责人">
+   <EmployeeSelector
+     v-model:value="planForm.responsiblePersonId"
+     placeholder="选择负责人"
+     @change="onResponsiblePersonChange"
+   />
+ </FormItem>
```

**方案 B**（若为 `emergency/plans/index.vue` 独立文件）：

同上，在对应 FormItem 中替换。

#### 1.2.2 表单声明更新

```diff
  const planForm = reactive({
    // ... existing fields ...
-   responsible_person: '',
+   responsiblePersonId: undefined as number | undefined,
    // ... rest ...
  });
```

> 注意：`responsiblePersonId` 类型应为 `number | undefined`（与 P1 收尾修复的 EmergencyPlan 接口一致，`null` 已改为 `undefined`）。

#### 1.2.3 onChange 处理

```typescript
function onResponsiblePersonChange(item: EmployeeSelectorApi.SelectorItem | undefined) {
  planForm.responsible_person = item?.name || '';
}
```

> 若 `responsible_person` 字段在后端仍有文本列存储，保留同步写入（向后兼容）。

#### 1.2.4 编辑回填

```diff
  // 编辑预案时回填
+ planForm.responsiblePersonId = record.responsiblePersonId ?? undefined;
  planForm.responsible_person = record.responsiblePerson || '';
```

#### 1.2.5 重置表单

```diff
  function resetPlanForm() {
    // ... existing resets ...
+   planForm.responsiblePersonId = undefined;
    planForm.responsible_person = '';
  }
```

#### 1.2.6 保存提交

```diff
  const data = {
    // ... existing fields ...
+   responsiblePersonId: planForm.responsiblePersonId,
    responsible_person: planForm.responsible_person,
    // ... rest ...
  };
```

#### 1.2.7 详情展示切换

```diff
  <!-- 详情：负责人 -->
- <DescriptionsItem label="负责人">{{ currentPlan.responsible_person || '-' }}</DescriptionsItem>
+ <DescriptionsItem label="负责人">
+   <EmployeeName v-if="currentPlan.responsiblePersonId" :employee-id="currentPlan.responsiblePersonId" />
+   <span v-else>{{ currentPlan.responsible_person || '-' }}</span>
+ </DescriptionsItem>
```

#### 1.2.8 列表列切换

```diff
  <!-- 列表列：负责人 -->
  <template v-else-if="column.key === 'responsiblePerson'">
-   {{ record.responsible_person || '-' }}
+   <EmployeeName v-if="record.responsiblePersonId" :employee-id="record.responsiblePersonId" />
+   <span v-else>{{ record.responsible_person || '-' }}</span>
  </template>
```

---

## 2. 模块二：三违（violations）— 仅展示层

### 2.1 现状

审计报告（§2.5）：
- 表单已统一：`violatorId`/`handlerId`/`inspectorId`/`punisherId` 均用 EmployeeSelector ✅
- 详情/列表用 `violatorName`/`handlerName` 文本，未用 EmployeeName 🔴

**后端零改动，仅前端 2 处展示层。**

### 2.2 修改文件：`src/views/violations/index.vue`

#### 2.2.1 详情展示切换

```diff
  <!-- 详情：违规人员 -->
- <DescriptionsItem label="违规人员">{{ currentViolation.violatorName || '-' }}</DescriptionsItem>
+ <DescriptionsItem label="违规人员">
+   <EmployeeName v-if="currentViolation.violatorId" :employee-id="currentViolation.violatorId" />
+   <span v-else>{{ currentViolation.violatorName || '-' }}</span>
+ </DescriptionsItem>

  <!-- 详情：处理人员 -->
- <DescriptionsItem label="处理人员">{{ currentViolation.handlerName || '-' }}</DescriptionsItem>
+ <DescriptionsItem label="处理人员">
+   <EmployeeName v-if="currentViolation.handlerId" :employee-id="currentViolation.handlerId" />
+   <span v-else>{{ currentViolation.handlerName || '-' }}</span>
+ </DescriptionsItem>
```

#### 2.2.2 列表列切换

```diff
  <!-- 列表列：违规人员 -->
  <template v-else-if="column.key === 'violatorName'">
-   {{ record.violatorName || '-' }}
+   <EmployeeName v-if="record.violatorId" :employee-id="record.violatorId" />
+   <span v-else>{{ record.violatorName || '-' }}</span>
  </template>
```

> 注：若列表列 key 为 `violator` 而非 `violatorName`，以实际 Grep 结果为准。

---

## 3. 模块三：目标（goals）— 仅展示层

### 3.1 现状

审计报告（§2.6）：
- 表单已统一：`responsiblePersonId` 用 EmployeeSelector ✅
- 详情/列表用 `responsiblePerson` 文本，未用 EmployeeName 🔴

**后端零改动，仅前端 2 处展示层。**

### 3.2 修改文件：`src/views/goals/index.vue`

#### 3.2.1 详情展示切换

```diff
  <!-- 详情：负责人 -->
- <DescriptionsItem label="负责人">{{ currentGoal.responsiblePerson || '-' }}</DescriptionsItem>
+ <DescriptionsItem label="负责人">
+   <EmployeeName v-if="currentGoal.responsiblePersonId" :employee-id="currentGoal.responsiblePersonId" />
+   <span v-else>{{ currentGoal.responsiblePerson || '-' }}</span>
+ </DescriptionsItem>
```

#### 3.2.2 列表列切换

```diff
  <!-- 列表列：负责人 -->
  <template v-else-if="column.key === 'responsiblePerson'">
-   {{ record.responsiblePerson || '-' }}
+   <EmployeeName v-if="record.responsiblePersonId" :employee-id="record.responsiblePersonId" />
+   <span v-else>{{ record.responsiblePerson || '-' }}</span>
  </template>
```

---

## 4. 验证清单

### 4.1 应急（emergency）

- [ ] E-1 表单负责人字段为 EmployeeSelector（非纯文本 Input）
- [ ] E-2 选择负责人后，`responsiblePersonId` 正确捕获
- [ ] E-3 编辑预案时，`responsiblePersonId` 正确回填到 EmployeeSelector
- [ ] E-4 详情中负责人显示为 EmployeeName（有 ID 时可点击）
- [ ] E-5 详情中负责人无 ID 时显示文本兜底
- [ ] E-6 列表列负责人显示为 EmployeeName + 文本兜底
- [ ] E-7 创建/编辑/删除预案功能不受影响（回归）
- [ ] E-8 演练记录 Tab 不受影响（回归）

### 4.2 三违（violations）

- [ ] V-1 详情中违规人员显示为 EmployeeName（有 ID 时可点击）
- [ ] V-2 详情中处理人员显示为 EmployeeName（有 ID 时可点击）
- [ ] V-3 详情中无 ID 时显示文本兜底
- [ ] V-4 列表列违规人员显示为 EmployeeName + 文本兜底
- [ ] V-5 创建/编辑/删除三违记录功能不受影响（回归）
- [ ] V-6 表单中 EmployeeSelector 选人功能不受影响（回归）

### 4.3 目标（goals）

- [ ] G-1 详情中负责人显示为 EmployeeName（有 ID 时可点击）
- [ ] G-2 详情中无 ID 时显示文本兜底
- [ ] G-3 列表列负责人显示为 EmployeeName + 文本兜底
- [ ] G-4 创建/编辑/删除目标功能不受影响（回归）
- [ ] G-5 表单中 EmployeeSelector 选人功能不受影响（回归）

### 4.4 红线

- [ ] 不修改路由定义
- [ ] 不修改菜单配置
- [ ] 不修改组件库
- [ ] 不修改后端代码
- [ ] 不修改数据库结构
- [ ] 不修改其他模块代码
- [ ] 不修改登录代码

---

## 5. 执行顺序

```
1. 确认三个模块的实际文件路径（Grep 定位）
   ↓
2. 应急模块：表单 EmployeeSelector 切换 + 详情/列表 EmployeeName 切换
   ↓
3. 三违模块：详情/列表 EmployeeName 切换
   ↓
4. 目标模块：详情/列表 EmployeeName 切换
   ↓
5. 全链路验证（E-1~E-8 + V-1~V-6 + G-1~G-5）
```

---

## 6. 关键注意事项

1. **应急模块路径**：审计报告提到 `emergency/plans/index.vue:161`，需确认是否为独立 plans 子路由文件。若实际为 `emergency/index.vue` 单文件，Grep 定位后按实际路径修改。

2. **EmployeeSelector 注册**：确认 `EmployeeSelector` 在目标模块中是否已通过 Vben 组件解析器自动注册。若未注册，需显式 import：
   ```typescript
   import EmployeeSelector from '#/components/hse/EmployeeSelector.vue';
   ```

3. **EmployeeName 导入**：确认 `EmployeeName` 是否已导入：
   ```typescript
   import { EmployeeName } from '#/composables/hse';
   ```

4. **类型兼容**：`EmployeeSelector` 的 `value` prop 期望 `number | number[] | undefined`，`planForm.responsiblePersonId` 必须为 `number | undefined`（非 `null`）。

5. **文本兜底字段名**：各模块的文本字段名可能不同（`responsible_person` / `responsiblePerson` / `violatorName` / `handlerName`），以实际 Grep 结果为准。

---

## 7. 范围外（后续独立任务）

| # | 内容 | 优先级 |
|---|------|--------|
| 1 | 培训 training 展示层 EmployeeName 统一 | P2 |
| 2 | 考核 assessment 语义确认 + employeeId 链路补全 | P2 |
| 3 | 保险 over-age personnel↔employee 映射评估 | P2 |
| 4 | FK 补全（training/violations/goals/assessment 缺 FK 约束） | P2 |
| 5 | 全项目 TS 存量错误清零（576 处） | P2 |
| 6 | 回填策略增强 v1.2 | P2 |

---

> 编制：Senior Developer（高级开发工程师）
> 关联文档：`跨模块-人员字段模式统一审计报告.md`、`提示词-43-跨模块人员字段模式统一审计.md`
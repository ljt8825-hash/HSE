# 提示词 26：Q4 — EmployeeSelector 增强与统一

> 创建日期：2026-07-29
> 前置条件：Q3 Composable 实现完成（`Q3-公共Composable实现报告.md`），4 个 Composable + 类型定义 + 桥接适配器就位
> 所属阶段：消费层（Sprint-Q）— Phase 3 实现
> 用途：按 Q2 §4 增强 EmployeeSelector 组件，修复 Q1 识别的误用，迁移脱钩模块
> 性质：**修改现有组件 + 修改业务模块视图**（首次跨模块修改），不修改路由/配置/API/SQL

---

## 任务：增强 EmployeeSelector 组件并修复误用

### 背景

Q1 审计发现 5 类 EmployeeSelector 问题：
- **误用不存在的 props**：`training/requirements:98-100`、`training/plans:161-162` 用 `v-model:employee-id`/`v-model:employee-name`/`mode="position"` → `positionId`/`trainerId` 恒为 0
- **用纯文本代替**：hazards 的 `checker`/`fixer`、emergency 的 `responsiblePerson`/`leader_name`、accidents 的 `handler` 等
- **不调用选择器**：accidents/emergency/objectives/assessment-monthly/warning-center/workflow 均未 import
- **v-model 字段名不一致**：`finderId`/`responsibleId`/`violatorId`/`employeeId`/`trainerId` 等
- **只读回显缺失**：hazards 详情 `getEmployeeName` 返回 `员工${id}`

Q3 已实现 4 个 Composable + 桥接适配器。现在增强 EmployeeSelector 本身，使其成为 Q2 设计中的完整规范组件。

### 要求

#### 1. 读取设计基线与现有代码

**必须读取的文件**：
- `F:\hse-dashboard\docs\Q2-消费层跨模块交互标准设计.md`（重点：§4 EmployeeSelector 增强方案、§4.2 增强设计、§4.3 向后兼容、§4.4 迁移指南）
- `F:\hse-dashboard\docs\Q1-跨模块员工数据消费现状审计.md`（§2.1 各模块具体问题点）
- `F:\hse-dashboard\docs\Q3-公共Composable实现报告.md`（了解 Composable 接口）

**必须探索的现有代码**：
- `apps/web-antd/src/components/hse/EmployeeSelector.vue`（当前组件完整代码，理解 props/emits/模板结构）
- `apps/web-antd/src/views/training/requirements/index.vue`（误用点）
- `apps/web-antd/src/views/training/plans/index.vue`（误用点）
- `apps/web-antd/src/views/hazards/index.vue`（混合使用点 + `getEmployeeName` 失效点）
- `apps/web-antd/src/views/accidents/index.vue`（纯文本点）
- `apps/web-antd/src/views/emergency/*.vue`（纯文本点）

#### 2. 增强 EmployeeSelector.vue（Q2 §4.2）

**新增 Props**（全部 optional，不影响现有用法）：

| 新 Props | 类型 | 默认值 | 说明 |
|----------|------|--------|------|
| `filterStatus` | `string` | `undefined` | org_status 过滤（在职/离职等），透传到选择器 API 的 `status` 参数 |
| `pasteEmployeeCodes` | `boolean` | `false` | 启用批量粘贴员工编号（Excel 粘贴） |
| `showErrorState` | `boolean` | `true` | 是否显示加载失败/搜索无结果/网络超时统一 UI |

**新增 Emits**：
| Emit | 参数 | 说明 |
|------|------|------|
| `update:value` | `number \| number[]` | 双向绑定值（已有，保持） |
| `change` | `SelectorItem \| SelectorItem[]` | 选择变更回调（已有，保持），**额外传递完整 `SelectorItem` 对象**（供桥接适配器回写） |
| `error` | `{ type: string; message: string }` | 新增：错误事件（加载失败/超时） |

**增强模板**：

- **搜索体验增强**：保留现有 `Select` 组件，防抖逻辑已由 `useEmployeeSearch` 封装（组件内部仍用现有 `getEmployeeSelectorList`，但新增 `debounceMs` prop 控制延迟，默认 300ms）
- **选中项展示增强**：在 `tagRender` 或 `optionLabel` 中显示"头像首字母 + 姓名 + 部门简称"；`showDetail=true` 时 hover 显示完整 Tooltip 卡片（姓名/部门/岗位/员工编号/状态）
- **批量粘贴员工编号**：`pasteEmployeeCodes=true` 时，在 Select 下方添加一个 `Textarea` 输入框，支持粘贴换行/逗号/空格分隔的员工编号，失焦时自动调用 `getEmployeeSelectorBatch` 解析并添加到已选项
- **错误状态处理**（`showErrorState=true`）：
  - 加载失败：显示 `<Alert type="error" message="加载员工数据失败，请重试" />` + 重试按钮
  - 搜索无结果：显示 `<Empty description="未找到匹配的员工" />`
  - 网络超时：显示 `<Alert type="warning" message="请求超时，请检查网络后重试" />`

**内部实现要点**：
- 保留现有 `getEmployeeSelectorList` + `getEmployeeSelectorBatch` 调用方式
- 新增 `filterStatus` 参数透传到 `getEmployeeSelectorList` 的 `status` 字段（需确认后端 API 是否支持，若不支持则在代码中标注 `// TODO: 后端 API 需支持 status 过滤`）
- 保持现有 `Spin` 加载态
- 不引入 Q3 的 Composable 依赖（EmployeeSelector 作为独立组件，不依赖 composables/hse，保持向后兼容；桥接适配器在外部做映射）

#### 3. 修复 Q1 识别的误用（Q2 §4.4 迁移指南）

**3.1 training/requirements/index.vue**（Q1 P2-1）

修改前（`requirements/index.vue:98-100`）：
```vue
<EmployeeSelector
  v-model:employee-id="requirementForm.positionId"
  v-model:employee-name="requirementForm.positionName"
  mode="position"
/>
```

修改后：
```vue
<EmployeeSelector
  v-model:value="requirementForm.positionId"
  mode="single"
  :filter-dept="positionDeptId"
  @change="(item) => { requirementForm.positionName = item?.name ?? '' }"
/>
```

**3.2 training/plans/index.vue**（Q1 P2-1）

修改前（`plans/index.vue:161-162`）：
```vue
<EmployeeSelector
  v-model:employee-id="planForm.trainerId"
  v-model:employee-name="planForm.trainerName"
/>
```

修改后：
```vue
<EmployeeSelector
  v-model:value="planForm.trainerId"
  mode="single"
  @change="(item) => { planForm.trainerName = item?.name ?? '' }"
/>
```

**3.3 hazards/index.vue**（Q1 P0-1）

修改详情抽屉中的姓名显示（`index.vue:394/398/402/406`）：
- 将 `<span>{{ getEmployeeName(currentHazard.finderId) }}</span>` 改为使用 Q3 的 `EmployeeName` 组件：
  ```vue
  <EmployeeName :employee-id="currentHazard.finderId" />
  ```
- 删除 `getEmployeeName` 函数定义（`index.vue:1402-1405`）
- 同时将 `checker`/`fixer` 纯文本 Input（`:263/:268`）替换为 `<EmployeeSelector v-model:value="xxx" mode="single" />`：
  - `checker` → `checkerId`（新增字段，需在表单中增加）
  - `fixer` → `fixerId`（新增字段，需在表单中增加）
  - 保持 `checker`/`fixer` 文本字段作为兼容（`@change` 时同步 name 到旧字段）

**3.4 accidents/index.vue**（Q1 P0-3）

- 将 `handler` 文本 Input（`index.vue:428-429`）替换为 `<EmployeeSelector v-model:value="currentAccident.handlerId" mode="single" />`
- 新增 `handlerId` 字段，详情展示改用 `EmployeeName` 组件
- 保留 `handler` 文本字段作为兼容过渡

**3.5 emergency 系列**（Q1 P0-3）

- `emergency/index.vue:346`：将 `responsiblePerson` 文本 Input 替换为 `<EmployeeSelector v-model:value="form.responsiblePersonId" mode="single" />`
- `emergency/teams/index.vue:140`：将 `leader_name` 文本 Input 替换为 `<EmployeeSelector v-model:value="form.leaderId" mode="single" />`
- `emergency/teams/index.vue:239-240`：`/system/employees` 调用替换为 `getEmployeeSelectorList`（或后续 `getEmployeeSelectorBatch`）

#### 4. 向后兼容验证

**必须保证**：以下现有用法行为不变（逐一验证）：

| 模块 | 现有用法 | 验证点 |
|------|----------|--------|
| violations | `v-model:value="violatorId"` | 选择/回显/清除正常 |
| hazards | `v-model:value="finderId"` | 选择/回显/清除正常 |
| training/ledger | `v-model:value="employeeId"` | 选择/回显/清除正常 |
| training/execute | `v-model:value="trainerId" mode="multiple"` | 多选/回显/清除正常 |
| goals | `v-model:value="..."` | 选择/回显/清除正常 |
| insurance/over-age | 已有用法 | 正常 |

#### 5. 接入 Q3 桥接适配器

在 `EmployeeSelector` 增强后，验证 `useEmployeeSelectorAdapter` 的 `selectorProps`/`selectorEvents` 仍能正确映射（确认 `value`/`mode`/`maxCount`/`orgUnitId` 的 props 名和 `change` 事件签名未变）。

### 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/components/hse/EmployeeSelector.vue` | 修改 | 新增 3 个 props + 1 个 emit + 模板增强 |
| `src/views/training/requirements/index.vue` | 修改 | 修复误用 props（Q1 P2-1） |
| `src/views/training/plans/index.vue` | 修改 | 修复误用 props（Q1 P2-1） |
| `src/views/hazards/index.vue` | 修改 | 详情姓名改用 EmployeeName + checker/fixer 改用选择器（Q1 P0-1） |
| `src/views/accidents/index.vue` | 修改 | handler 文本→选择器（Q1 P0-3） |
| `src/views/emergency/index.vue` | 修改 | responsiblePerson 文本→选择器（Q1 P0-3） |
| `src/views/emergency/teams/index.vue` | 修改 | leader_name 文本→选择器 + /system/employees→主数据 API（Q1 P0-3） |

### 禁止事项

- 禁止修改路由、菜单、配置
- 禁止修改 `employee.ts` 或任何后端 API 文件
- 禁止修改 `employee-selector.ts`（选择器 API）
- 禁止修改 Q3 新建的 Composable 文件（除非需要适配新增 props）
- 禁止执行任何 SQL
- 禁止修改基础层（employee_assignment / 只读保护）相关代码
- 所有修改必须保持向后兼容：现有 `v-model:value` / `mode` / `placeholder` / `disabled` / `isDriver` / `orgUnitId` / `positionId` / `maxCount` / `showDetail` 用法**不可破坏**

### 验收标准

增强完成后，自我验证：
- EmployeeSelector 新增 props 全部生效（filterStatus/pasteEmployeeCodes/showErrorState）
- 错误状态 UI 正确显示（加载失败/无结果/超时三种场景）
- 批量粘贴员工编号功能正常（换行/逗号/空格分隔均支持）
- training/requirements 的 `positionId` 不再恒为 0
- training/plans 的 `trainerId` 不再恒为 0
- hazards 详情显示真实员工姓名（不再显示"员工123"）
- accidents/emergency 人员字段支持选择器选人
- 现有 violations/hazards-finderId/training-ledger/training-execute/goals 用法零破坏
- `npm run typecheck` 无新增错误
- 所有修改过的页面在浏览器中可正常加载

### 输出格式

- 生成 Markdown 文档，保存到 `F:\hse-dashboard\docs\Q4-EmployeeSelector增强报告.md`
- 文档结构：
  - 一、EmployeeSelector 增强详情（新增 props/emits/模板 逐项说明）
  - 二、误用修复详情（training requirements / plans / hazards / accidents / emergency，含修改前后代码对比）
  - 三、向后兼容验证结果（6 个现有模块的回归测试结果）
  - 四、迁移对照表（旧用法→新用法，完整覆盖 Q2 §4.4）
  - 五、已知局限（filterStatus 后端支持情况、pasteEmployeeCodes 边界情况）
  - 六、下一步行动（Q5 事件系统实现、Phase 1 后端批量端点依赖）
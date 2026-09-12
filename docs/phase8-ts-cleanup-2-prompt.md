# Phase 8：TypeScript 类型错误清理（第二批）提示词

> 项目路径：`f:\hse-dashboard\安全看板vben\apps\web-antd`
> 框架：Vben Admin 5.7.0 + Ant Design Vue + Vue 3 + TypeScript
> 前置：Phase 5（第一批 TS 清理，over-age/violations/hazards/training）已完成
> 关联：Phase 6（emergency）+ Phase 7（accidents/goals）composable 改造已完成

---

## 一、任务目标

消除 Phase 6–7 composable 改造的 3 个目标文件中 **25 处既有 TS 类型错误**，完成代码质量闭环。修复模式与 Phase 5 完全一致。

## 二、目标文件与错误分布

| 文件 | 既有错误数 | 错误类别 |
|------|----------|---------|
| `src/views/emergency/index.vue` | 12 | `:color` / bodyCell `record` / `:rules` / `getExpiryBadgeStatus` 参数 / `DatePicker` 未使用导入 |
| `src/views/accidents/index.vue` | 6 | `:color` / bodyCell `record` / `:rules` / DatePicker `v-model` |
| `src/views/goals/index.vue` | 7 | `:color` / bodyCell `record` / `:rules` / `responsiblePersonId` 类型 |
| **合计** | **25** | 全部归零 |

## 三、emergency/index.vue（12 处）

### 错误明细

| 行号 | 错误 | 修复方式 |
|------|------|---------|
| ~16 | `:color="stat.color"` string 不可赋给 Badge color 联合类型 | `:color="(stat.color as any)"` |
| ~156/157/162 | bodyCell 槽位 `record: Record<string,any>` 传入 `handleViewPlan/EditPlan/DeletePlan(EmergencyPlan)` | 回调参数 `(record as any)` |
| ~263/264/269 | 同上，`DrillRecord` | 回调参数 `(record as any)` |
| ~289/388 | `:rules="formRules"` / `:rules="drillFormRules"` 不满足索引签名 | `:rules="(formRules as any)"` / `:rules="(drillFormRules as any)"` |
| ~485 | `getExpiryBadgeStatus(currentPlan.expiryStatus)` 参数 `string\|undefined` 不可赋给 `string` | 函数签名放宽为 `expiryStatus?: string \| undefined` |
| ~545 | bodyCell 槽位 `record` 传入 `handleDeleteAttachment(PlanAttachment)` | 回调参数 `(record as any)` |
| ~621 | `DatePicker` 导入未使用（TS6133） | 删除该 import |

### 修复模板

```html
<!-- 统计卡片 -->
<HseStatCard :color="(stat.color as any)" />

<!-- 表格 bodyCell 槽位 -->
<template #bodyCell="{ column, record }">
  <template v-if="column.key === 'action'">
    <Button :type="'link'" @click="handleViewPlan(record as any)">查看</Button>
    <Button :type="'link'" @click="handleEditPlan(record as any)">编辑</Button>
    <Button :type="'link'" @click="handleDeletePlan(record as any)">删除</Button>
  </template>
  <!-- 附件表同理 -->
  <Button :type="'link'" @click="handleDeleteAttachment(record as any)">删除</Button>
</template>
```

```typescript
// 表单 rules
:rules="(formRules as any)"
:rules="(drillFormRules as any)"

// getExpiryBadgeStatus 参数放宽
function getExpiryBadgeStatus(expiryStatus?: string | undefined): string {
  if (!expiryStatus) return 'default';
  // ...
}
```

## 四、accidents/index.vue（6 处）

### 错误明细

| 行号 | 错误 | 修复方式 |
|------|------|---------|
| ~16 | `:color="stat.color"` | `:color="(stat.color as any)"` |
| ~192/195/202 | bodyCell `record` → `AccidentItem` | 回调参数 `(record as any)` |
| ~222 | `:rules="formRules"` | `:rules="(formRules as any)"` |
| ~278 | DatePicker `v-model` Dayjs\|null 不兼容 string\|Dayjs | `undefined as Dayjs \| undefined` |
| ~505 | bodyCell `record` → `Attachment`（附件子表） | `(record as any)` |

## 五、goals/index.vue（7 处）

### 错误明细

| 行号 | 错误 | 修复方式 |
|------|------|---------|
| ~16 | `:color="stat.color"` | `:color="(stat.color as any)"` |
| ~132/133/138 | bodyCell `record` → `SafetyGoal` | 回调参数 `(record as any)` |
| ~155 | `:rules="formRules"` | `:rules="(formRules as any)"` |
| ~637 | `responsiblePersonId: number\|null` 不兼容 `number\|undefined` | `(formData as any)` 或字段标注 `undefined as number \| undefined` |

## 六、通用执行规范

### 6.1 修复原则

- **仅类型层面**：只加 `as any` 断言、放宽函数签名、删除未使用导入、调整 `reactive` 字段初始值。**不修改业务逻辑、API 调用、模板结构。**
- **不引入新错误**：每修复一处，确认不产生新的 TS 错误。
- **逐文件推进**：先做完 emergency，构建验证通过后再做 accidents，最后 goals。

### 6.2 分步工作流

```
1. 修复目标文件的所有 TS 错误
2. vue-tsc --noEmit --skipLibCheck 验证目标文件错误数归零
3. pnpm build 验证构建通过
4. 继续下一个文件
```

### 6.3 构建命令

```bash
cd f:\hse-dashboard\安全看板vben\apps\web-antd
rm -rf dist
CODEBUDDY_SAFE_DELETE_BULK_STATE_DIR= CODEBUDDY_TOOL_CALL_ID= pnpm build
```

## 七、严格边界

1. **仅改动 3 个目标文件**：`emergency/index.vue`、`accidents/index.vue`、`goals/index.vue`。
2. **不改动**：`packages/`、`src/router/`、`src/api/`、`src/store/`、`src/composables/`、`vite.config.ts`、及其他任何业务页面。
3. **不改业务逻辑**：弹窗 CRUD、统计卡片、导出、附件、版本、Tab 切换等逻辑全部保留。
4. **不改样式**：`<style>` 块不触碰。
5. **不扩大 scope**：本次只清理 Phase 6-7 报告列出的既有错误，不主动搜索全仓其他错误。

## 八、验收标准

- [ ] `emergency/index.vue` 12 处 TS 错误全部归零
- [ ] `accidents/index.vue` 6 处 TS 错误全部归零
- [ ] `goals/index.vue` 7 处 TS 错误全部归零
- [ ] **合计 25 处错误全部归零**，净新增 0
- [ ] `pnpm build` 构建通过（exit code 0）
- [ ] 生成修改清单报告 `docs/phase8-ts-cleanup-report.md`

## 九、产出物

1. 改造后的 3 个目标文件
2. 修改清单报告 `docs/phase8-ts-cleanup-report.md`（含改动明细、错误归零确认、构建结果）
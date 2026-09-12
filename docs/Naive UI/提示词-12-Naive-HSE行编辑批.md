# 提示词-12-Naive-HSE行编辑批

> 任务来源：Phase 11 中子批 6C（行编辑）因涉及后端变更验证和业务交互调整，转入本独立批次。
> 批次性质：**阶段 12 —— 行编辑批**。在 Phase 11 已完成 28 页面排序统一的基础上，为支持行内编辑的业务页面增量启用行编辑能力。
> 执行环境：web-naive (`apps/web-naive`)，后端 **只读**（不改 `server/`）。
> 前置条件：Phase 10 生产后端已重启（hazards.js 修复生效）、Phase 11 Codex 审核通过。

---

## 一、任务目标

将 Vben Pro 参考中的行编辑能力落地到 HSE 业务页面，实现：

1. 点击行内"编辑"按钮 → 行进入编辑模式（单元格变为可编辑控件）
2. 修改值 → 保存 → 调用后端接口更新 → 行退出编辑模式
3. 修改值 → 取消 → 恢复原始数据 → 行退出编辑模式
4. 编辑状态指示器（左侧绿色标记）正常显示

---

## 二、HseDataGrid 行编辑能力回顾

HseDataGrid 已内置完整行编辑基础设施（Phase 03 已验证）：

```typescript
// 启用行编辑
<HseDataGrid ref="gridRef" :editable="true" :edit-rules="editRules"
  @edit-save="onEditSave" @edit-cancel="onEditCancel"
>

// 暴露方法
gridRef.beginEdit(row)   // 进入编辑模式
gridRef.saveEdit(row)    // 校验并保存
gridRef.cancelEdit(row)  // 取消编辑
gridRef.revertRow(row)   // 仅回滚不改动

// editConfig（HseDataGrid 内部）
{ trigger: 'manual', mode: 'row', showStatus: true, autoClear: false }
```

**VXE 内置编辑器（`editRender`）：**

| 名称 | 用途 | 示例 |
|---|---|---|
| `{ name: 'input' }` | 文本输入 | `editRender: { name: 'input' }` |
| `{ name: '$input' }` | 数字输入 | `editRender: { name: '$input', props: { type: 'number' } }` |
| `{ name: 'select' }` | 下拉选择 | `editRender: { name: 'select', options: [...] }` |
| `{ name: '$select' }` | 多选下拉 | `editRender: { name: '$select', options: [...] }` |
| `{ name: 'date' }` | 日期选择 | `editRender: { name: 'date' }` |

---

## 三、实施范围（按优先级）

### 3.1 行编辑适用条件（需同时满足）

- 列表数据有明确的后端"保存"接口（PUT/PATCH）
- 编辑字段为简单值（文本、数字、日期、下拉选择），不含复杂关联关系
- 不适合的页面：只读/分析/统计类页面（驾驶舱、BI、AI 分析、报表中心等）

### 3.2 推荐启用的页面（分三批）

**第一批（P0，3 个页面，编辑字段简单、后端接口完备）：**

| 页面 | 可编辑字段 | 编辑器类型 |
|---|---|---|
| `training/ledger`（培训台账） | `trainingType`（培训类型）、`trainingDate`（培训日期）、`durationMinutes`（时长）、`score`（成绩）、`result`（结果） | select, date, $input, $input, select |
| `emergency/materials`（应急物资） | `quantity`（数量）、`expire_date`（到期日期）、`status`（状态） | $input, date, select |
| `insurance/personnel`（保险人员） | `insuranceType`（保险类型）、`startDate`（生效日期）、`endDate`（到期日期） | select, date, date |

**第二批（P1，3 个页面，编辑字段中等复杂）：**

| 页面 | 可编辑字段 | 编辑器类型 |
|---|---|---|
| `site/fire-facility`（消防设施） | `lastCheckDate`（检查日期）、`status`（状态） | date, select |
| `regulations`（制度标准） | `version`（版本号）、`effectiveDate`（生效日期）、`status`（状态） | input, date, select |
| `emergency/teams`（应急队伍） | `memberCount`（成员数）、`status`（状态） | $input, select |

**第三批（P2，按需扩展，不在本批强制实施）：**

- `training/plans`（培训计划）
- `training/certificates`（证书管理）
- `site/violation`（违章记录）
- `site/grid`（网格化）

---

## 四、实施步骤（每个页面通用模式）

### 4.1 准备工作

1. 读取页面文件，确认现有 `loadData`、`columns`、API 导入
2. 确认后端接口支持 PUT/PATCH（已有 `update*` 函数则无需新建）

### 4.2 模板层

```html
<HseDataGrid
  ref="gridRef"
  :columns="columns"
  :data="data"
  :loading="loading"
  :pager="true"
  :total="total"
  :editable="true"
  :edit-rules="editRules"
  @page-change="onPageChange"
  @sort-change="onSortChange"
  @edit-save="onEditSave"
  @edit-cancel="onEditCancel"
>
```

### 4.3 脚本层

```typescript
// 1. 引用 HseDataGrid 实例
const gridRef = ref<InstanceType<typeof HseDataGrid>>();

// 2. 编辑校验规则
const editRules = {
  name: [{ required: true, message: '姓名不能为空' }],
  score: [{ type: 'number', min: 0, max: 100, message: '成绩需在 0-100 之间' }],
};

// 3. 列定义 —— 为可编辑列添加 editRender
{ title: '培训日期', field: 'trainingDate', width: 120, sortable: true,
  editRender: { name: 'date' } },
{ title: '时长(分钟)', field: 'durationMinutes', width: 110, sortable: true,
  editRender: { name: '$input', props: { type: 'number' } } },
{ title: '培训类型', field: 'trainingType', width: 110, slots: { default: 'trainingType' },
  editRender: { name: 'select', options: [...] } },

// 4. 操作列 —— 新增"编辑"按钮
<template #action="{ row }">
  <NSpace justify="center">
    <NButton size="small" quaternary type="primary" @click="openView(row)">查看</NButton>
    <NButton size="small" quaternary type="primary" @click="gridRef?.beginEdit(row)">编辑</NButton>
    <NPopconfirm @positive-click="onDelete(row)">
      <template #trigger>
        <NButton size="small" quaternary type="error">删除</NButton>
      </template>
      确定删除吗？
    </NPopconfirm>
  </NSpace>
</template>

// 5. 编辑保存
async function onEditSave({ row }: { row: any }) {
  try {
    await updateXxx(row.id, row);
    message.success('保存成功');
    loadData();
  } catch { /* 拦截器已提示 */ }
}

// 6. 编辑取消
function onEditCancel() {
  // VXE 已自动回滚数据，无需额外处理
}
```

### 4.4 操作列改造

**改造前**（查看 | 编辑（弹窗） | 删除）：
```
查看 | 编辑 | 删除
```
↓

**改造后**（查看 | 行内编辑 | 删除）：
```
查看 | 编辑 | 删除
```
其中"编辑"按钮从"打开弹窗"改为 `gridRef.beginEdit(row)`。原有的弹窗编辑（`openEdit`）和新增（`openCreate`）保留不变——行编辑仅处理列表快速修改场景，复杂表单仍走弹窗。

---

## 五、验收标准

### 5.1 每个页面逐项验收

| 验收项 | 预期行为 |
|---|---|
| 1. 点击"编辑" | 行进入编辑模式，左侧出现绿色编辑状态指示器，可编辑单元格变为输入框/选择器/日期选择器 |
| 2. 修改值 + 保存 | 调用后端 PUT 接口成功，数据刷新，行退出编辑模式 |
| 3. 修改值 + 取消 | 数据恢复为原始值，行退出编辑模式 |
| 4. 校验失败 | 输入框/选择器显示错误提示，不提交后端 |
| 5. 编辑中切换排序 | 编辑状态保持，排序不丢失（HseDataGrid 已保证） |
| 6. 编辑中翻页 | 应提示"有未保存的更改"（可后续优化，本批不强制） |

### 5.2 全局门禁

- `pnpm typecheck` → EXIT=0
- `pnpm build` → EXIT=0
- 各页面排序功能无回归（Phase 11 已覆盖）

---

## 六、实施顺序（分 2 个子批）

### 12A —— 行编辑试点（1 个页面）
- 选择 `training/ledger`（培训台账）作为试点
- 实施完整行编辑流程（编辑 → 保存 → 取消 → 校验）
- 验证 typecheck + build
- 试点通过后展开

### 12B —— 行编辑批量落地（5 个页面）
- 第一批（P0）：`emergency/materials`、`insurance/personnel`
- 第二批（P1）：`site/fire-facility`、`regulations`、`emergency/teams`

---

## 七、本批明确不实施

- **不改后端 `server/`、SQL、`package.json`、锁文件**
- **不改 `web-antd`**
- **不改路由 path/name/authority**
- **不改 API 接口契约**
- **不改 `views/demos/`**
- **不改 `HseDataGrid` 组件本身**（基础设施已完备）
- **不改 cockpit / BI / AI 分析 / 报表中心等只读分析类页面**
- **不删除弹窗编辑功能**（行编辑是弹窗编辑的补充，不是替代）

---

## 八、红线

1. 行编辑仅限 §3.2 适用场景，**不强制给所有页面加行编辑**
2. 行编辑的保存必须调用后端真实接口，**不得仅修改前端本地数据**
3. 校验失败时不得提交后端
4. 不改后端、不改 API 出入参语义
5. typecheck 必须显式 EXIT=0
6. 每次改动独立段落描述（文件 / 改动点 / 原因 / 验证）
7. 弹窗编辑（`openEdit`/`openCreate`/`NModal`）**不得删除或降级**，行编辑是快速编辑的补充手段

---

## 九、交付物

1. `docs/Naive UI/_verify/12/`：试点截图、行编辑操作录屏或截图、typecheck/build 日志
2. `docs/Naive UI/阶段12-行编辑-执行总结.md`：逐页面完成情况、变更文件清单、验证结果、红线合规声明
3. 完成后 **STOP**，静候 Codex 审核
# 阶段 12 行编辑批 — Codex 审核

> 审核日期：2026-08-22
> 审核对象：`阶段12-行编辑-执行总结.md`、`_verify/12/` 证据、实码验证
> 审核依据：`提示词-12-Naive-HSE行编辑批.md`

---

## 一、12A 试点（training/ledger）核查

### 1.1 变更逐项验证

| 提示词要求 | 实码位置 | 状态 |
|---|---|---|
| `gridRef` 引用 | L316 | ✅ |
| `rowEditingId` (ref\<string\|null\>) | L318 | ✅ |
| `editRules`（result 必填、score 0-100） | L321 | ✅ |
| `startEdit` → `beginEdit` + `String(row.id)` | L335-337 | ✅ |
| `onEditSave` → `updateLedger` + `rowEditingId = null` + `Number()` 数值化 | L340-358 | ✅ |
| `onEditCancel` → `rowEditingId = null` | L360-361 | ✅ |
| 5 列 `editRender`（trainingType→select, trainingDate→input, durationMinutes→input number, score→input number, result→select） | L371-376 | ✅ |
| `:editable="true"` + `:edit-rules` + `@edit-save` + `@edit-cancel` | L462-467 | ✅ |
| `String(row.id) !== rowEditingId` 模板比较 | L483 | ✅ |
| 操作列 保存/取消 按钮 | L498-501 | ✅ |
| columns 由 `ref` 改 `computed`（依赖 resultOptions 异步加载） | 执行总结 §1.1 | ✅ |

### 1.2 CDP 实机验证（执行总结 §1.2）

| 步骤 | 结果 |
|---|---|
| 点编辑 → 行进入编辑模式（3 inputs + 2 selects + 保存/取消） | ✅ |
| 点取消 → 退出编辑模式、行恢复原值 | ✅ |
| 修改培训日期 → 保存 → PUT 200 → toast "保存成功" | ✅ |
| 改回原值 → 保存 → 净零变更、数据不变 | ✅ |
| 排序/翻页不丢失编辑状态 | ✅ |
| console 0 error | ✅ |

---

## 二、12B 批量落地核查

### 2.1 启用页面（4）模式一致性

| 页面 | gridRef | rowEditingId | editRules | startEdit | onEditSave | onEditCancel | editRender | editable | v-if String(id) |
|---|---|---|---|---|---|---|---|---|---|
| `training/ledger` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 5列 | ✅ | ✅ |
| `emergency/materials` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 2列 | ✅ | ✅ |
| `site/fire-facility` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 2列 | ✅ | ✅ |
| `regulations` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 3列 | ✅ | ✅ |

### 2.2 跳用页面（2）核查

| 页面 | 行编辑改动 | 理由 | 判定 |
|---|---|---|---|
| `insurance/personnel` | 0 改动（rg "editable" → 无匹配） | 透视表，行无顶层 startDate/endDate，保险类型歧义 | ✅ 正确跳用 |
| `emergency/teams` | 0 改动（rg "editable" → 无匹配） | 无简单值可编辑字段（member_ids 为 ID 数组） | ✅ 正确跳用 |

### 2.3 弹窗编辑保留（红线 §7）

| 页面 | 弹窗编辑保留方式 |
|---|---|
| `training/ledger` | 原有 `openEdit` 弹窗不受影响 |
| `emergency/materials` | 原有模态编辑保留 |
| `site/fire-facility` | 详情抽屉加「弹窗编辑」按钮 → `openEdit(currentRecord)` |
| `regulations` | 详情抽屉加「弹窗编辑」按钮 → `openEdit(currentRecord)` |

---

## 三、修复项核查

### 3.1 字符串 id 比较 bug（4 文件统一）

| 修复项 | 实码验证 |
|---|---|
| `rowEditingId` 类型 `ref<string\|null>` | ✅ 4 文件统一 |
| `rowEditingId.value = String(row.id)` | ✅ 4 文件统一 |
| 模板 `String(row.id) !== rowEditingId` | ✅ 4 文件统一 |

### 3.2 vite dev CORS 修复

| 检查项 | 结果 |
|---|---|
| `vite.config.ts` 含 `proxyReq.removeHeader('origin')` | ✅ |
| 仅改 web-naive 前端 dev 设施 | ✅ |
| 未改后端 `server/`、SQL、`package.json`、锁文件 | ✅ |

---

## 四、门禁核查

| 门禁 | 结果 |
|---|---|
| `pnpm typecheck` | EXIT=0 ✅ |
| `pnpm build` | EXIT=0 ✅（dist.zip 2,026,364 bytes） |
| `ant-design-vue` 残留 | 0 ✅ |
| `useAntdDesignTokens\|useAntd` 残留 | 0 ✅ |
| 排序/翻页无回归 | ✅ HseDataGrid `keepSource: true` |
| 弹窗编辑不删除不降级 | ✅ 4 页面保留 |

---

## 五、红线合规

| 红线 | 状态 |
|---|---|
| 行编辑仅限适用场景（4 页 + 2 正确跳用） | ✅ |
| 保存调用后端真实接口（PUT） | ✅ CDP 验证 PUT 200 |
| 校验失败不提交后端 | ✅ editRules 配置 |
| 不改后端/server/SQL/package.json/锁文件 | ✅ |
| 不改路由/API 出入参语义 | ✅ |
| 不改 HseDataGrid 组件本身 | ✅ |
| 弹窗编辑不删除不降级 | ✅ |
| typecheck 显式 EXIT=0 | ✅ |

---

## 六、审核结论

**✅ 通过。**

4 页面行编辑模式一致、2 页面正确跳用（理由充分）、字符串 id 比较 bug 统一修复、vite CORS 缺口修复（仅 dev 设施）、CDP 实机验证 PUT 200、弹窗编辑保留。门禁通过、红线合规。

---

## 七、下一步

Phase 12 审核通过。下一阶段方向建议：

1. **Phase 13**：表格列对齐规范全量复查（Phase 11 仅抽查 5 页）+ `sortField`/`sortBy` 命名统一
2. **Phase 14**：剩余页面排序补充（hse/employee 系列、assessment-monthly 系列、alerts/notifications 等）
3. **Phase 15**：生产切换前最终回归（全量 typecheck/build + 关键路径浏览器验证）

建议优先执行 Phase 13（列对齐复查 + 命名统一），改动量小、风险低，且能闭环 Phase 11 的非阻塞建议。
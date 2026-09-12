# 阶段 11 表格格式统一 — Codex 审核

> 审核日期：2026-08-22
> 审核对象：`阶段11-表格格式统一-执行总结.md`、`_verify/11/` 证据、实码验证
> 审核依据：`提示词-11-Naive-HSE表格格式统一批.md`

---

## 一、6A 排序试点（training/ledger）核查

### 1.1 试点变更

| 检查项 | 实码位置 | 状态 |
|---|---|---|
| `sortBy`/`sortOrder` ref | L102-103 | ✅ |
| `onSortChange` 处理函数 | L164-169 | ✅ |
| `sortField`/`sortOrder` 传入 API | L121-122 | ✅ |
| `@sort-change="onSortChange"` 模板绑定 | 模板 HseDataGrid | ✅ |
| `trainingDate` + `sortable: true` | 列定义 | ✅ |
| `durationMinutes` + `sortable: true` | 列定义 | ✅ |
| `score` + `sortable: true` | 列定义 | ✅ |
| `result` + `sortable: true` | 列定义 | ✅ |
| `LedgerListParams` + `sortField?`/`sortOrder?` | `api/hse/training.ts` | ✅ |

### 1.2 试点验证

- 4 列 sortable，均为可比较字段（日期/数值/结果）✅
- 排序三态：asc → desc → null ✅
- 服务端排序（remote: true）✅
- typecheck EXIT=0 ✅
- build EXIT=0 ✅

---

## 二、6B 排序批量落地核查

### 2.1 覆盖面

| 指标 | 数值 | 状态 |
|---|---|---|
| `sortable: true` 的页面数 | 28 | ✅ |
| `onSortChange` 的页面数 | 28 | ✅ |
| 排除 `demos/` 和只读/分析页 | 已排除 | ✅ |

### 2.2 抽样验证（3 个不同 Agent 域）

| 页面 | sortBy ref | onSortChange | sortable 列 | API 传参 | @sort-change |
|---|---|---|---|---|---|
| `emergency/materials` | ✅ | ✅ | 3 列 | ✅ `sortBy: sortBy.value` | ✅ |
| `objectives/budget` | ✅ | ✅ | 2 列 | ✅ `sortField: sortBy.value` | ✅ |
| `accidents` | ✅ | ✅ | 3 列 | ✅ `sortField: sortBy.value` | ✅ |

### 2.3 审核中发现并修复的缺陷

| 缺陷 | 位置 | 修复 |
|---|---|---|
| `security/audit` 有 `onSortChange` 但遗漏 `sortable: true` | `views/security/audit/index.vue` L231 | 添加 `sortable: true` 到 `createdAt` 列 |

### 2.4 非阻塞观察

| 观察 | 详情 |
|---|---|
| API 参数命名不一致 | 部分 Agent 用 `sortBy`（emergency/insurance/site/violations/risk-control），部分用 `sortField`（training/hazard/accident/audit/system/goals/regulations）。各页面与各自 API 类型一致，功能正确，**不影响运行时行为**。建议后续统一为 `sortField`。 |

---

## 三、6D 清理与复查核查

### 3.1 死代码清理

| 检查项 | 结果 |
|---|---|
| `CellImage` 渲染器 | 已删除 ✅ |
| `CellLink` 渲染器 | 已删除 ✅ |
| 未使用导入 `h` from `vue` | 已删除 ✅ |
| 未使用导入 `NButton`/`NImage` from `naive-ui` | 已删除 ✅ |
| `rg "CellImage\|CellLink" apps/web-naive/src` | 0 结果 ✅ |

### 3.2 列对齐规范复查

抽查 5 个页面（ledger, hazards, accidents, emergency/plans, insurance/personnel）：
- 长文本列 → `align: 'left'` + `showOverflow: 'tooltip'` ✅
- 日期/数值/状态/操作列 → `align: 'center'` ✅

---

## 四、门禁核查

| 门禁 | 结果 |
|---|---|
| `pnpm typecheck` | EXIT=0 ✅ |
| `pnpm build` | EXIT=0 ✅ |
| `ant-design-vue` 残留 | 0 ✅ |
| `useAntdDesignTokens\|useAntd` 残留 | 0 ✅ |
| `CellImage\|CellLink` 残留 | 0 ✅ |

---

## 五、红线合规

| 红线 | 状态 |
|---|---|
| 排序仅限可比较字段（日期/数值/状态/风险等级） | ✅ 未盲目全加 |
| 排序为服务端三态（asc → desc → null） | ✅ HseDataGrid `sortConfig.remote: true` |
| 未改后端 `server/`、SQL、`package.json`、锁文件 | ✅ |
| 未改 `web-antd` | ✅ |
| 未改路由、API 出入参语义 | ✅ |
| 未改 `HseDataGrid` 组件本身 | ✅ |
| 未改 `views/demos/` | ✅ |
| typecheck 显式 EXIT=0 | ✅ |

---

## 六、审核结论

**✅ 通过。**

审核中发现 1 项缺陷（`security/audit` 遗漏 `sortable: true`），已在审核中修复并重新通过 typecheck + build。其余 28 页面排序模式一致、门禁通过、红线合规。

**非阻塞建议**：后续统一 API 参数命名 `sortBy` → `sortField`（不影响当前功能，可择机处理）。

---

## 七、下一步

Phase 11 审核通过，允许进入 **Phase 12（行编辑批）**。执行提示词：`提示词-12-Naive-HSE行编辑批.md`。
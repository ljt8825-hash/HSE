# 阶段 13 列对齐复查与命名统一 — Codex 审核

> 审核日期：2026-08-22
> 审核对象：`阶段13-列对齐与命名统一-执行总结.md`、`_verify/13/` 证据、实码验证
> 审核依据：`提示词-13-Naive-HSE列对齐复查与命名统一批.md`

---

## 一、Part 1 命名统一核查

### 1.1 API 类型

| 检查项 | 命令 | 结果 |
|---|---|---|
| `sortBy?` 残留 | `rg "sortBy\?" src/api` | **0** ✅ |
| `sortField?` 覆盖 | `rg "sortField\?" src/api` | 13 个业务模块全部统一 ✅ |

### 1.2 Vue 视图调用

| 检查项 | 命令 | 结果 |
|---|---|---|
| `sortBy: sortBy` 残留 | `rg "sortBy: sortBy" src/views` | **0** ✅ |

### 1.3 逐文件验证

| 文件 | 变更数 | 实物验证 |
|---|---|---|
| `api/hse/emergency.ts` | 5 处 `sortBy?` → `sortField?` | 5 处 `sortField?` ✅ |
| `api/hse/insurance.ts` | 3 处 | 3 处 `sortField?` ✅ |
| `api/hse/site.ts` | 2 处 | 2 处 `sortField?` ✅ |
| `api/hse/violations.ts` | 1 处 | 1 处 `sortField?` ✅ |
| `api/risk-control/index.ts` | 1 处 | 1 处 `sortField?` ✅ |
| `api/hse/employee.ts` | 1 处 | 1 处 `sortField?` ✅ |
| 12 个 Vue 视图 | 12 处 `sortBy:` → `sortField:` | 变量名 `sortBy` 不变 ✅ |

---

## 二、Part 2 列对齐复查核查

### 2.1 修正项验证

| 文件 | 列 | 变更 | 实码 |
|---|---|---|---|
| `emergency/plans` | 预案名称 | center→left + `showOverflow:'tooltip'` | `align: 'left', showOverflow: 'tooltip'` ✅ |
| `risk-control` | 风险点名称 | center→left + `showOverflow:'tooltip'` | `align: 'left', showOverflow: 'tooltip'` ✅ |
| `insurance/other` | 保险公司 | center→left（保留 tooltip） | ✅ |
| `site/fire-facility` | 设施名称 | center→left（保留 tooltip）×2 | ✅ |

### 2.2 红线验证

- 仅改 `align` / `showOverflow` ✅
- 未改列宽/列顺序/字段名 ✅

---

## 三、Part 3 Slot 一致性核查

| 检查项 | 结果 |
|---|---|
| 孤立 slot（有 `slots:{default:'X'}` 无 `<template #X>`） | 0 ✅ |
| 状态类 slot 统一 `HseStatusTag` | 全部 ✅ |
| `emergency/materials` `expire_date` 补 `formatDate` | `formatDate(row.expire_date)` ✅ |
| 2 条误报人工复核 | 合规（hazards `expiry`=状态标签、training/plans `attendees`=计数） ✅ |

---

## 四、门禁核查

| 门禁 | 结果 |
|---|---|
| `pnpm typecheck` | EXIT=0 ✅ |
| `pnpm build` | EXIT=0（21.40s） ✅ |

---

## 五、红线合规

| 红线 | 状态 |
|---|---|
| 命名统一仅改前端 TS 类型和 Vue 调用，后端 `server/` 零改动 | ✅ |
| 列对齐仅改 `align`/`showOverflow`，未改列宽/列顺序/字段名 | ✅ |
| typecheck 显式 EXIT=0 | ✅ |
| build 显式 EXIT=0 | ✅ |
| 未改 web-antd、routes、API 接口契约、demos、HseDataGrid、行编辑 | ✅ |

---

## 六、审核结论

**✅ 通过。**

Phase 11 留下的两笔非阻塞建议全部闭环：`sortBy` → `sortField` 命名统一（19 文件 25 处）、列对齐规范由抽查 5 页扩展为全量 28 页。无缺陷发现。

---

## 七、下一步

Phase 13 审核通过。建议进入 **Phase 14（生产切换前最终回归）**：全量 typecheck + build 复查、关键路径浏览器验证、生产后端重启确认。这是生产切换前的最后一道门禁。
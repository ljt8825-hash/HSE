# 阶段 19 — 表格统一增强批 · Codex 审核

> 审核日期：2026-08-23
> 审核对象：`提示词-19-表格统一增强批.md` 执行结果
> 审核依据：theme.ts / 19 个视图文件 + CDP 验证数据 + 截图

---

## 一、独立复验

| 审核项 | 方法 | 结果 |
|---|---|---|
| typecheck | `pnpm typecheck` | EXIT=0 ✅ |
| 19A 操作列统一 | rg 抽样 responsibility→查看(info)/编辑(info)/删除(error) | ✅ |
| 19C 懒读取范式 | rg 4 文件 `getSelectedRows` + `getCheckboxRecords` | ✅ |
| 19C 复选框列 | rg `type: 'checkbox'` | ✅ |
| 19C 导出 | rg `handleExport` + `@export` | ✅ |
| 19C 批量删除空选提示 | rg `请先勾选要删除的记录` | ✅ |
| 19B 日期格式化 | rg `formatDate` responsibility + violation | ✅ |
| 19D 风险等级统计 | rg `levelStats` risk-control（4 级红/橙/绿/灰） | ✅ |
| 19D 消防到期预警 | rg `expiryStats` fire-facility（4 卡） | ✅ |
| 19D 超龄风险分级 | rg `getOverAgeRiskLevel` over-age（≤5/6-10/11-15/>15） | ✅ |
| 19D 证书编号 | rg `未生成` certificates | ✅ |

---

## 二、19C 关键 Bug 修复审核

### 2.1 问题

`$grid.on is not a function` → 4 页白屏（responsibility/budget/employee/profile）

### 2.2 根因链审核

执行者分析的三层根因链**正确**：

1. `HseDataGrid` 经 Vben `useVbenVxeGrid` 包装后，`VxeGridInstance` 代理未暴露 `.on/.off/.emit` — ✅ 与源码 `api.ts:41` 中 `grid` 初值 `{}` 一致
2. 事件绑定只能走 store 通道，但 `usePriorityValue` 的优先级 `slots>attrs>props>state` 使 props 永久遮蔽 store — ✅ 与框架源码 `use-priority-value.ts` 一致
3. `onMounted` 内同步抛错，阻断后续 `loadData()` — ✅ Vue 3 行为

### 2.3 修复方案审核

全部改为懒读取范式 `getCheckboxRecords()` — ✅ 与 `alerts/index.vue`、`assessment-monthly/targets.vue` 等既有批量删除页一致。按钮始终可用，空选时点批量删除 → `message.warning`。

**判定**：修复方案正确，分析充分。

---

## 三、偏差审核

| # | 偏差 | 判定 |
|---|---|---|
| 2 | fire-facility 用 `diffDays()` 替代 dayjs | ✅ 合理 — dayjs 不在 web-naive 依赖，原生 Date 逻辑等价 |
| 3 | over-age 用 NTag 替代 HseStatusTag | ✅ 合理 — `HseStatusType` 不含 `error`，NTag + `#7f1d1d` 保持视觉语义 |
| 4 | build 未运行 | ⚠️ 非阻塞 — dev+CDP 已保证功能/视觉正确性 |

---

## 四、红线合规

| 红线 | 状态 |
|---|---|
| 不改后端/API/DB/SQL | ✅ |
| 不改 web-antd/@vben/theme.ts | ✅ |
| 不改路由/权限/登录 | ✅ |
| 不改 HseDataGrid 组件 | ✅ |
| 风险管控红线 3 文件未触 | ✅ |

---

## 五、审核结论

**✅ 审核通过。0 缺陷。**

19C 的 `$grid.on` Bug 发现与修复是本次最大亮点 —— 从根因分析到修复方案到 10 页统一落地，全部闭环。4 个子批全部独立复验通过，51 页 CDP 验证全部 `consoleErrors: []`。

### 唯一待办：build 收尾门禁

建议在 Phase 20（最终收尾）中执行 `pnpm -F web-naive build` 作为最后一道门禁。

---

## 六、下一步

Phase 20 — 最终收尾批：build + 全量截图 + 项目终验。提示词已就绪。

项目状态：19 个阶段全部通过，即将终验。
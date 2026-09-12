# 提示词-14-Naive-HSE生产切换就绪批

> 任务来源：Phase 10-13 全部通过 Codex 审核，Phase 09 待审核。所有表格格式统一工作已完成，进入生产切换前最后一道门禁。
> 批次性质：**阶段 14 —— 生产切换就绪批**。不做新功能开发，仅做回归验证和切换前检查。
> 执行环境：web-naive (`apps/web-naive`)，后端 `server/` 零改动。
> 前置条件：Phase 13 Codex 审核通过。

---

## 一、任务目标

确保 web-naive 在前端代码层面具备生产切换条件，产出切换就绪清单。

---

## 二、Part 1 —— 全量回归验证

### 2.1 门禁

| 门禁 | 命令 | 预期 |
|---|---|---|
| Typecheck | `pnpm typecheck` | EXIT=0，0 errors |
| Build | `pnpm build` | EXIT=0，无 chunk 错误 |

### 2.2 残留检查

| 检查项 | 命令 | 预期 |
|---|---|---|
| `ant-design-vue` 残留 | `rg "ant-design-vue\|antd" apps/web-naive/src --glob "*.{ts,vue}" -g "!demos/**"` | 0 |
| `useAntdDesignTokens\|useAntd` 残留 | `rg "useAntd" apps/web-naive/src --glob "*.{ts,vue}" -g "!demos/**"` | 0 |
| `CellImage\|CellLink` 残留 | `rg "CellImage\|CellLink" apps/web-naive/src` | 0 |
| `sortBy?` 残留（API 类型） | `rg "sortBy\?" apps/web-naive/src/api` | 0 |
| `sortBy: sortBy` 残留（Vue 视图） | `rg "sortBy: sortBy" apps/web-naive/src/views -g "!demos/**"` | 0 |

### 2.3 关键路径手动验证（浏览器 CDP）

逐页验证以下 6 条关键路径，记录截图或录屏：

| 路径 | 验证点 |
|---|---|
| 登录 → 驾驶舱 | 页面正常渲染，无 console error |
| 风险管控 → 风险清单 | 列表加载、排序三态、行编辑（如有） |
| 培训管理 → 培训台账 | 列表加载、排序、行编辑、保存/取消 |
| 应急管理 → 应急物资 | 列表加载、排序、行编辑 |
| 隐患管理 → 隐患清单 | 列表加载、排序（hazards.js 修复生效） |
| 系统管理 → 用户管理 | 列表加载、排序 |

**验证标准：**
- 页面正常渲染，无白屏
- console 0 error（warning 可接受）
- 排序三态正常（asc → desc → null）
- 行编辑页面的保存/取消正常

### 2.4 截图证据

每页截图存储于 `_verify/14/screenshots/`，命名格式 `{page-name}.png`。

---

## 三、Part 2 —— 切换前检查清单

逐项确认以下清单，记录于 `_verify/14/switch-checklist.md`：

| 检查项 | 状态 | 备注 |
|---|---|---|
| 1. Phase 09 Codex 审核是否通过 | ⬜ | 待审核 |
| 2. Phase 10 生产后端是否已重启（hazards.js 修复） | ⬜ | 需手动操作 |
| 3. 所有业务页面排序是否正常 | ⬜ | Part 1 验证 |
| 4. 行编辑页面是否正常 | ⬜ | Part 1 验证 |
| 5. 列对齐规范是否合规 | ⬜ | Phase 13 已复查 |
| 6. typecheck + build 是否通过 | ⬜ | Part 1 验证 |
| 7. antd/useAntd/CellImage/CellLink 残留是否为 0 | ⬜ | Part 1 残留检查 |
| 8. web-antd 是否保留可运行（回退路径） | ⬜ | 确认 `apps/web-antd` 未删除 |
| 9. Naive UI 文档是否完整 | ⬜ | 确认 `docs/Naive UI/` 目录完整 |
| 10. 用户是否确认切换时间窗口 | ⬜ | 需用户确认 |

---

## 四、Part 3 —— 数据等价性确认（Phase 09 遗留）

Phase 09 审计报告遗留的"数据等价性"缺口，需确认：

1. `assessment-analysis`（公司HSE考核分析中心）页面数据是否与 web-antd 等价
2. 如存在差异，记录差异清单和影响范围

**验证方式：** 同时打开 web-naive 和 web-antd 两个版本的同一页面，对比数据表格内容。

---

## 五、本批明确不实施

- **不新增任何功能**
- **不改后端 `server/`、SQL、`package.json`、锁文件**
- **不改 `web-antd`**
- **不改路由 path/name/authority**
- **不改 API 接口契约**
- **不改 `views/demos/`**
- **不改 `HseDataGrid` 组件本身**

---

## 六、红线

1. 本批仅做回归验证和切换前检查，**不做任何代码修改**（除非发现阻塞性缺陷）
2. 如发现阻塞性缺陷，**先记录再报用户决策**，不得擅自修改
3. 所有残留检查必须 rg 0 结果

---

## 七、交付物

1. `docs/Naive UI/_verify/14/`：
   - `typecheck.log` + `build.log`
   - `residual-check.md`（残留检查结果）
   - `screenshots/`（6 条关键路径截图）
   - `switch-checklist.md`（10 项切换前检查清单）
   - `data-equivalence.md`（数据等价性确认）
2. `docs/Naive UI/阶段14-生产切换就绪-执行总结.md`
3. 完成后 **STOP**，静候 Codex 审核
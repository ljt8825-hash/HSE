# 提示词-07-Naive-HSE回归·并行验收·切换准备

> 任务来源：`阶段06F-审核.md` 结论「通过（无附条件）」；阶段 06 全部 15 个迁移批次完成，进度推进至 `06 / 07`
> 批次性质：**阶段 07 首批 —— 只读回归 + 并行验收 + 差异/决策清单 + 切换准备验证**；本批**不实施任何需授权的代码改动**（删除/路由化/补差等一律只列清单、等用户拍板）
> 执行环境：web-naive (`apps/web-naive`) vs web-antd (`apps/web-antd`) 并行对比

---

## 一、任务目标

1. 对 web-naive 全量菜单/子路由/隐藏路由做**只读浏览器回归**，产出回归矩阵。
2. 对关键页面做 **web-antd vs web-naive 并行数据/功能等价性验收**。
3. 汇总**差异清单 + 决策清单**（关闭已积累的遗留决策项，标注建议处置，交用户拍板）。
4. 完成**切换准备验证**（typecheck / build / 关键流程）。

---

## 二、权威基线

- 迁移清单与 60/17 路由计数以 `docs/Naive UI/阶段06A-Naive-HSE菜单迁移清单.md` 为唯一权威（勿凭记忆计数）。
- 设计约束以 `docs/Naive UI/01-强制设计约束.md` 与 `apps/web-naive/AGENTS.md` 为准。

---

## 三、只读回归（Part A）

- 范围：清单内 **11 个一级菜单 + 60 子路由 + 17 隐藏路由**，逐一浏览器导航。
- 断言每路由：可达（200 / 无 404）、面包屑正确、正文标题/内容渲染、**无 JS console error**、无「Failed to resolve component」。
- 重点复核历史易错项：数据表格 VXE 渲染、`useDialog/useMessage` 离散实例、AMap 地图（风险清单抽屉 + 风险地图）、图表 echarts 挂载、导入导出按钮据实降级。
- 产出：`_verify/07/regression-matrix.md`（逐路由：可达/面包屑/标题/内容/consoleError/截图索引）；截图按需存 `_verify/07/`。

## 四、并行验收（Part B，web-antd vs web-naive）

对比以下**关键页面**的功能与**数据等价性**（同一登录角色，同一后端）：

| 页面 | 验收点 |
|---|---|
| 安全总览首页 / BI / AI / 驾驶风险 / 事故 / 考核 / 预警（06E-1~3 全部 12 路由） | 图表数据、统计卡数值、选项卡切换 |
| `考核分析`（assessment-analysis） | **偏离①数据等价性业务复核**：双 API 整合为 `assessment-analysis.ts` 后，概览/部门排名/乡镇排名/目标/扣分五块数据与 web-antd 一致性 |
| 风险清单 + 风险地图（RiskControlList / RiskControlMap） | 风险集完整性（**`map.vue` `pageSize:500` 是否截断**）、乡镇悬浮跟随、边界样式 |
| 隐患治理 + 保险管理 + 系统管理（06D-4/5） | 树/列表/表单核心流程 |
| 人员管理（06D-1~3） | 员工列表/导入/组织/岗位/超龄 |

- 差异分级：等价 / 已知并已记录的降级 / **新发现差异**。
- 产出：`_verify/07/parity-report.md`（逐页面：结果、截图、数据差异、根因归属 web-naive 或后端或基线同源）。

## 五、差异与决策清单（Part C，只列不实施）

汇总以下**已积累 + 新发现**的遗留/差异，逐项标注「现状 / 建议处置 / 是否需授权」：

1. **68 视图 `useMessage`/`useNotification` 直引 naive-ui**（06F）—— 功能正常（app.vue 已挂 `NMessageProvider/NNotificationProvider`），偏离 `#/adapter/naive` 离散实例阶段 02 门禁。建议：统一迁移或接受现状（待产品/架构拍板）。
2. **`assessment-analysis` 标题硬编码**（06F）—— 与基线一致，可选 i18n 补键。
3. **`hse-employee.ts` split-brain 重复路由**（06F）—— 基线侧 legacy，建议评估去重（不删 web-antd）。
4. **`reports` 孤儿视图路由化**（06D-4）—— 需授权后新增路由。
5. **`insurance/over-age` 孤儿视图物理删除**（06D-4）—— 破坏性，需明确授权。
6. **隐患清单功能补差**（附件/整改流转/提醒/统计/风险转隐患，06D-4）—— 需授权后实施。
7. **风险地图风险集 `pageSize:500` 截断**（06E-4）—— 需确认生产风险总数，若 >500 改全量加载。

## 六、切换准备验证（Part D，只读）

- `pnpm --filter @vben/web-naive run typecheck` **EXIT=0**（显式回填）。
- `pnpm --filter @vben/web-naive run build` **EXIT=0**（回填 dist 大小/耗时）。
- `rg "ant-design-vue" apps/web-naive/src` 0；`rg "useAntdDesignTokens|useAntd"` 0。
- 关键流程验证（登录后真实角色）：发消息/通知主题、编辑/导入预览、排序三态、二次确认 dialog。

---

## 七、红线与边界

1. API 只读：除登录/token 外**不调用任何写接口**，杜绝误写生产数据。
2. 不修改 `web-antd`、后端 `server/`、SQL、`package.json`、锁文件；本批**不改 web-naive 源码**（§五 各项待用户拍板后再单独开实施批）。
3. 截图不泄露生产敏感数据（人员身份证号/手机号等打码或仅取脱敏页）。

---

## 八、交付物

1. `docs/Naive UI/_verify/07/regression-matrix.md`（全量回归矩阵）。
2. `docs/Naive UI/_verify/07/parity-report.md`（并行验收报告 + 差异分级）。
3. `docs/Naive UI/_verify/07/decision-list.md`（§五 决策清单，逐项现状/建议/授权）。
4. `docs/Naive UI/_verify/07/` 截图 + report.json（console 断言）。
5. `docs/Naive UI/阶段07-执行总结.md`（回归结论、验收结论、决策清单、切换准备门禁证据）。
6. 完成后 **STOP**，静候 Codex 审核；§五 决策项待用户在审核后拍板，再拆分后续实施批（按授权分：只读回归通过 + 授权项单独开）。
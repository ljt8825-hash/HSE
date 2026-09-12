# 提示词-08-3-Naive-HSE功能补差批（reports路由化 + 隐患清单全量补差）

> 任务来源：`阶段08-2-审核.md` 结论「通过（无阻塞项）」；决策清单 7 项仅剩 `#4 reports 路由化`、`#6 隐患清单全量补差`（用户已拍板纳入实施），`#5 over-age 保留不动`、`#7 ≤500 免改`。
> 用户已拍板：`reports` 挂载到 **「安全总览」(/overview) 子页面**。
> 批次性质：**阶段 08 第三批 —— 功能补差批**；只含 #4、#6 两项，**不含** #5（保留）。
> 执行环境：web-naive (`apps/web-naive`)；后端 `:5800` 只读（本批不改后端，仅补前端 service 与 UI）。

---

## 一、任务目标

1. **决策项 #4**：`reports` 孤儿视图路由化，新增路由到「安全总览」下，补 i18n 标题键。
2. **决策项 #6**：隐患清单功能补差，使 web-naive 与基线 web-antd 功能等价（附件 / 整改流转 / 隐患提醒 / 统计分析 / 关联风险联动，另含基线「版本记录」）。

---

## 二、Part 1 —— 决策项 #4 reports 路由化

### 2.1 现状（审核已预核验）

- `views/hse/reports/index.vue`（28,475 B）为**完整实现**：报表生成 / 查看 / 导出（HTML·Word）/ 归档 / 删除 / 4 统计卡，已使用 `#/adapter/naive` 离散 `message/dialog`（06D-2/06D-4 已闭环）。
- 前端 API 已存在：`apps/web-naive/src/api/hse/reports.ts`（5,519 B，含 generateReport / getReportList / getReportDetail / exportReportHtml / exportReportWord / archiveReport / confirmReport / deleteReport / regenerateReport / getReportStatus）。
- 视图 `defineOptions({ name: 'HseReports' })`；页面标题 `HsePageLayout title="报表中心" description="安全生产月报与公司汇报材料管理"` 为**硬编码**。
- 路由侧 `rg "reports" apps/web-naive/src/router` → **0**，确认为孤儿视图；web-antd 同为孤儿（无路由），故本项为**净新增路由**，无基线路由可抄。

### 2.2 处置

1. **新增路由**（`router/routes/modules/hse.ts`，`HseOverview` 的 children）：
   - `name: 'HseReports'`、`path: '/overview/reports'`、`component: () => import('#/views/hse/reports/index.vue')`
   - `meta: { title: $t('page.hse.reports'), icon: 'lucide:file-bar-chart', authority: ['admin'] }`
   - 插入位置建议：`HseAssessmentAnalysis` 之后、`HseWarningCenter` 之前（分析/报表类页面连续）；如觉更合适可微调，但须说明理由。
2. **补 i18n 键**（未新增时可加）：
   - zh-CN `page.hse.reports = "报表中心"`；en-US `page.hse.reports = "Report Center"`（`locales/langs/{zh-CN,en-US}/page.json`）。
   - 可选：`page.hse.reportsDesc`（zh「安全生产月报与公司汇报材料管理」/ en 对应），如顺带转 description。
3. **视图标题转 i18n**（与 08-1 #2 先例一致，仅改 `HsePageLayout` 标题行）：
   ```diff
   -  <HsePageLayout title="报表中心" description="安全生产月报与公司汇报材料管理">
   +  <HsePageLayout :title="$t('page.hse.reports')" :description="$t('page.hse.reportsDesc')">
   ```
   （若不为 description 增键，则 description 可保持硬编码，仅必须改 `title`。）

### 2.3 验收

1. `rg "reports" apps/web-naive/src/router` 命中新路由（name/path/component 正确）。
2. 两 locale 含 `page.hse.reports`（+ 若启用则 `reportsDesc`）。
3. 视图 `title="报表中心"` 硬编码消除（注释除外）；`rg "公司HSE|报表中心"` 在 title 行 0（注释除外）。
4. `pnpm --filter @vben/web-naive run typecheck` → EXIT=0；`rg "ant-design-vue|useAntd" apps/web-naive/src` → 0。

---

## 三、Part 2 —— 决策项 #6 隐患清单全量补差

### 3.1 现状与基准

- 现状：`views/hazards/index.vue`（18,020 B）为**列表骨架**（服务端分页 / 导入 / 导出 / 新增 / 编辑 / 删除 / 统计卡 NStatistic），已支持 `getHazardList/getHazardStats/getHazardDetail/create/update/delete/exportHazards`。
- 基准：`apps/web-antd/src/views/hazards/index.vue`（58,599 B 全量版，**唯一功能等价基准**）。
- 前端 service：web-naive 为 `api/hse/hazard.ts`；**基线 service 在 `apps/web-antd/src/api/hse/insurance.ts`**（含隐患 + 保险两域，函数名见下）。本批在 web-naive 补 front-end 函数，**不改后端**（`server/routes/hazards.js` 已全量支持）。

### 3.2 缺口清单（逐域，按基线 1:1）

> 以下为基线实际实现的能力，web-naive 逐域补齐。每域完成后逐一在总结中列「域 / 落地点 / 基线函数 / 验证」。

1. **附件**：`getHazardAttachments / uploadHazardAttachment / deleteHazardAttachment`（基线 antd `Upload` → naive `NUpload`）。
2. **整改流转**：`rectifyHazard / submitReviewHazard / reviewHazard / closeHazard`。状态流 `discovered → processing → pending_review → (pass|fail)→closed`；操作按钮按状态显隐（整改 / 提交复查 / 复查确认）；含「整改提交」与「复查确认（合格/不合格→重新整改）」两个 Modal。
3. **隐患提醒抽屉**：`getHighRiskReminders / getOverdueReminders`（基线「隐患提醒」入口按钮 + 抽屉）。
4. **统计分析抽屉**：`getResponsibleOverdueAnalysis` + `HazardStatsEnhanced`（基线「统计分析」入口按钮 + 抽屉）。
5. **关联风险联动**：`getRelatedRisk`（详情抽屉展示关联风险 + 跳转风险详情，含风险等级色 / 措施 / 位置 / 最近排查 / 隐患数 Badge）。
6. **版本记录**（基线额外项，一并核对）：`getHazardVersions`。

### 3.3 依赖的 baseline 组件/组合式（web-naive 若无，按既有模式移植或复用）

- **`EmployeeSelector`**（基线 `#/components/hse/EmployeeSelector.vue` + `#/composables/hse/useEmployeeSelectorAdapter.ts`）：发现人/责任人/整改人/复查人/检查人员/整改人员选择。web-naive 若缺此组件，可移植，或复用既有员工远程检索模式（如 `objectives/responsibility` 的 `lookupEmployees`），但须保持「员工 ID/编号/姓名」关联语义。
- **`EmployeeName`**（id → 姓名展示）、**`useSearchForm / useDataTable`**（基线 composables）：web-naive 若有等价物则复用，无则以 web-naive 既有 HSE 组件（`HseSearchPanel` / `HseDataGrid`）实现，**不照搬 antd 写法**。

### 3.4 验收

1. 六域逐一落地并与基线「功能等价」；`rg "rectifyHazard|submitReviewHazard|reviewHazard|closeHazard|getHazardAttachments|uploadHazardAttachment|getRelatedRisk|getHighRiskReminders|getResponsibleOverdueAnalysis" apps/web-naive/src` 全部命中（service 已补）。
2. `pnpm --filter @vben/web-naive run typecheck` → EXIT=0；`rg "ant-design-vue|useAntd" apps/web-naive/src` → 0。
3. 现有列表/分页/导入/导出/统计卡功能**不回归**（改动为增量，不删既有能力）。
4. `_verify/08-3/` 证据（typecheck 日志、rg 扫描、关键页面截图/断言）。

---

## 四、本批明确不实施

- **#5 `insurance/over-age` 删除**：用户拍板「保留不动」，本批及后续均不删（`views/insurance/over-age` 目录完好）。
- **#2 已闭环**；**#7 ≤500 免改**；**#1/#3 已闭环（08-2）**。
- **name 改名**（`HseIot/HseSupplyChain/HseAlerts/HseNotifications` 基线同源重名）：不擅改，维持 08-2 结论。
- **`views/demos/`**：不纳入。
- **后端 `server/`、SQL、`package.json`、锁文件、web-antd**：一律不动。

---

## 五、红线

1. 不改 `web-antd`、后端 `server/`、SQL、`package.json`、锁文件；不改路由 path/name/authority 的既有项（除 §二 新增 reports 路由）。
2. 不改业务契约：新增前端 service 函数须与后端既有接口 1:1，**不得伪造写入成功、不得改后端语义**（错误如实提示）。
3. #6 为增量补差，**不得回退既有列表/导入/导出/统计卡能力**。
4. 每次改动独立段落描述（文件 / 改动点 / 原因 / 验证），便于 Codex 逐段复核。
5. 完成后 typecheck 显式 EXIT=0；antd 残留 0。

---

## 六、交付物

1. `docs/Naive UI/_verify/08-3/`：typecheck 日志、rg 扫描、关键页面截图/断言、reports 路由生效证据、隐患六域落地证据。
2. `阶段08-3-执行总结.md`：Part 1（#4 路由 + i18n）+ Part 2（#6 六域，逐域落地点/基线函数/验证）+ 红线无越权声明 + 未闭环项如实声明。
3. 完成后 **STOP**，静候 Codex 审核；本批为阶段 08 最后一批，不进入后续阶段。
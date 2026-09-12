# 提示词-06E-2-Naive-HSE安全总览B迁移

> 任务来源：`阶段06E-1-审核.md` 结论「通过（无附条件）」，总体进度 05/07
> 基线唯一来源：`apps/web-antd/src/router/routes/modules/hse-01-overview.ts` + `apps/web-antd/src/views/hse/{accident-analysis,assessment-analysis,warning-center,alerts,notifications}/` + 对应 `apps/web-antd/src/api/hse/*`
> 执行环境：web-naive (`apps/web-naive`)，Vben 5.7.0 + Naive UI 2.44.1 + VXE Table + `@vben/plugins/echarts`
> 范围性质：**B 批次（安全总览第 6~10 个二级页，共 5 路由）**；3 个图表页从零移植 + 2 个列表页整流核对，非后端/数据库改动。

---

## 一、任务目标

在 06E-1 已整流的父路由 `HseOverview` `/overview` 下，按基线补齐 B 批次 5 个二级页，使路由/权限/名称/图标/标题与 `hse-01-overview.ts` 1:1；3 个缺失图表页（accident-analysis / assessment-analysis / warning-center）从 web-antd 移植，2 个已存在列表页（alerts / notifications）整流核对对齐基线。

---

## 二、前置决策（已定，无需再等待）

- **图表方案**：延续 06E-1，复用 `@vben/plugins/echarts`（`EchartsUI`/`useEcharts`/`ECOption`/`EchartsUIType`），import 路径不变、仅替换 antd 外壳（Card/Row/Col → NCard/NGrid/NGi）。不引入任何新依赖；`useAntdDesignTokens` 一律替换为固定色值/令牌。
- **HelpButton / ImportButtonGroup**：沿用既有约定——看板/列表页据实降级，不得谎报后端导入能力。

---

## 三、路由整流（唯一改动文件：`src/router/routes/modules/hse.ts`，仅在父 `children` 末尾按基线顺序追加 5 子路由）

| 二级名称 | route name | 路径 | icon | authority/hide | 组件（web-naive 目标路径） | 复杂度 |
|---|---|---|---|---|---|---|
| 事故分析中心 | `HseAccidentAnalysis` | `/overview/accident-analysis` | `lucide:alert-triangle` | admin | `views/hse/accident-analysis/index.vue` | 高 |
| 考核分析中心 | `HseAssessmentAnalysis` | `/overview/assessment-analysis` | `lucide:pie-chart` | admin | `views/hse/assessment-analysis/index.vue` | 高 |
| 预警与整改中心 | `HseWarningCenter` | `/overview/warning-center` | `lucide:bell-alert` | admin | `views/hse/warning-center/index.vue` | 中 |
| 告警中心 | `HseAlerts` | `/overview/alerts` | `lucide:bell` | admin | `views/hse/alerts/index.vue` | 中 |
| 通知中心 | `HseNotifications` | `/overview/notifications` | `lucide:bell-ring` | admin | `views/hse/notifications/index.vue` | 中 |

> 追加顺序必须与基线 `hse-01-overview.ts` 一致（事故→考核→预警→告警→通知；IoT/供应链属 06E-3，**本批不追加**）。标题全部转 `$t('page.hse.*')`。

---

## 四、视图移植 / 整流

### 4.1 现状核实（执行前据此判定新建 vs 整流）

| 目标 | 现状 | 动作 |
|---|---|---|
| `views/hse/accident-analysis/` | **缺失** | 新建（基线含 `index.vue` + 4 子组件：`AccidentClassification`/`AccidentOverview`/`AccidentTrend`/`ResponsibleAnalysis`） |
| `views/hse/assessment-analysis/` | **缺失** | 新建（基线含 `index.vue` + 8 子组件：`AssessmentOverview`/`DeductionAnalysis`/`DeductionDetail`/`DepartmentRanking`/`GoalsAssociation`/`IndicatorAnalysis`/`TargetProgress`/`TownshipRanking`） |
| `views/hse/warning-center/` | **缺失** | 新建（基线单文件 `index.vue`，内联 2 处 `EchartsUI`：趋势 + 来源） |
| `views/hse/alerts/index.vue` | **已存在** | 整流核对：`defineOptions name=HseAlerts` 已与路由一致；核对列表列/筛选/状态/操作与基线 1:1；标题转 i18n |
| `views/hse/notifications/index.vue` | **已存在** | 整流核对：`defineOptions name=HseNotifications` 已一致；核对列/筛选/状态/详情抽屉与基线 1:1；标题转 i18n |

### 4.2 移植要点

- **3 个图表页**：子组件文件名与基线一致，`EchartsUI`/`useEcharts` 用法照搬；图表数据逻辑（computed option、renderEcharts 调用、resize）逐行移植；筛选/联动（年份、维度切换）按基线语义等价实现。
- **antd → naive 映射**（沿用 06E-1 规范）：`Page`→`HsePageLayout`、`Card`→`NCard`、`Row`/`Col`→`NGrid`/`NGi`、`Space`→`NSpace`、`Select`→`NSelect`、`RangePicker`→`NDatePicker type="daterange"`、`Tabs`→`NTabs`、`Table`(组织/排名列表)→`HseDataGrid`（若为简单展示可 `NDataTable`）、`Statistic`→`HseStatCard`。
- **2 个列表页**：已用 `HsePageLayout`/`HseDataGrid`/`HseSearchPanel`/`HseStatusTag`，仅按基线核对补齐字段/操作/状态映射，不得退回 antd、不缩水功能。

---

## 五、API 适配（`src/api/hse/`）

| 目标文件 | 基线来源 | 现状 | 动作 |
|---|---|---|---|
| `accident-analysis.ts` | `web-antd/api/hse/accident-analysis.ts` | 缺失 | **新建**，逐函数/类型对齐 |
| `assessment-analysis.ts` | `web-antd/api/hse/assessment-analysis.ts` | 缺失 | **新建**，逐函数/类型对齐 |
| `warning-center.ts` | `web-antd/api/hse/warning-center.ts` | 缺失 | **新建**，逐函数/类型对齐 |
| `alerts.ts` | `web-antd/api/hse/alerts.ts` | 已存在 | 核对端点/类型与基线 1:1，有偏差则整流 |
| `notifications.ts` | `web-antd/api/hse/notifications.ts` | 已存在 | 核对端点/类型与基线 1:1，有偏差则整流 |

> 铁律：仅「对照基线契约创建/核对 web-naive 适配层」，**不改服务端接口**；所有写端点只读核对，**严禁调用**。后端契约以 `server/routes/*.js` 只读确认（注意 `alerts`/`notifications` 可能复用既有 `server/routes/alerts.js`/`notifications.js`）。

---

## 六、i18n（zh-CN + en-US，`page.hse` 下新增 5 键）

```
accidentAnalysis   事故分析中心   /  Accident Analysis
assessmentAnalysis 考核分析中心   /  Assessment Analysis
warningCenter      预警与整改中心 /  Warning & Rectification Center
alerts             告警中心       /  Alerts
notifications      通知中心       /  Notifications
```

> 路由 `$t` 引用与键定义逐一核对；alerts/notifications 视图内 `HsePageLayout title` 由硬编码改为 `$t`（或据实标注遗留，非阻塞）。

---

## 七、红线与边界（务必逐条遵守）

1. 不修改 `web-antd`、后端 `server/`、SQL·数据库、`package.json`·锁文件、`src/router/routes/index.ts`。
2. 仅追改 `hse.ts` 一个路由文件（追加 5 子），不触碰 06E-1 已有 5 子路由，不触碰 `views/hse/{iot,supply-chain,reports,risk-profile-detail,todos,workflow}` 等属 06E-3/其它模块的视图。
3. 不引入 `ant-design-vue` 或新依赖；图表只用 `@vben/plugins/echarts`。
4. 严禁任何写操作；后端写端点只读核对不调用。
5. 子组件文件名、`defineOptions` name 与基线一致，不擅自改名/删功能。

---

## 八、验证要求

- `pnpm --filter @vben/web-naive run typecheck` EXIT=0。
- `pnpm --filter @vben/web-naive run build` EXIT=0（如需 `dist.zip` 则一并）。
- `rg "ant-design-vue" apps/web-naive/src` 0 命中；`useAntdDesignTokens` 0 命中（仅注释除外）。
- `hse.ts` 父 + 10 子 path 齐全；`/overview/{accident-analysis,assessment-analysis,warning-center,alerts,notifications}` 5 条存在。
- i18n 5 键 × 2 locale 齐全。
- 浏览器 CDP：注入 token 后导航 5 路由，抓侧栏/面包屑/正文截图 + 原始 console（0 error），产物入 `_verify/06E-2/`（含 report.json）；375px 视口补 1 张截图并说明需人工目视复核。

---

## 九、交付物

1. `hse.ts` 追加 5 子路由 + 新建 3 图表页（含子组件）+ 整流 2 列表页 + 3 API 新建/2 API 核对 + 2 locale。
2. `docs/Naive UI/阶段06E-2-执行总结.md`（按既定格式记录变更清单、路由/API 映射、i18n、Static/Browser 验证证据、红线遵守、遗留项）。
3. `docs/Naive UI/_verify/06E-2/` 截图与 report.json。
4. 完成后 **STOP**，静候 Codex 审核。
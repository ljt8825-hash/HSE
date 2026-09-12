# 提示词-06E-1-Naive-HSE安全总览A迁移

> 任务来源：`阶段06D-5-审核.md` 结论「通过（无附条件）」，总体进度 05/07
> 基线唯一来源：`apps/web-antd/src/router/routes/modules/hse-01-overview.ts` + `apps/web-antd/src/views/hse/{cockpit,executive-cockpit,bi,ai-analysis,driver-risk-center}/` + 对应 `apps/web-antd/src/api/hse/*`
> 执行环境：web-naive (`apps/web-naive`)，Vben 5.7.0 + Naive UI 2.44.1 + VXE Table + `@vben/plugins/echarts`
> 范围性质：**A 批次（1 个一级菜单「安全总览」的前 5 个二级页）**；本批为既有占位路由整流 + 从 web-antd 移植视图/API，非后端/数据库改动。

---

## 一、任务目标

将「安全总览」一级菜单从当前占位状态整流为基线形态，并移植 A 批次 5 个二级页面（含 3 个真实图表页 + 2 个占位看板页），使路由、权限、名称、图标、标题与 web-antd 基线 `hse-01-overview.ts` 1:1，视图/API 契约与基线视图真实行为一致。

---

## 二、前置决策（已定，无需再等待用户）

### 2.1 图表方案：复用 `@vben/plugins/echarts`（唯一选项，无二义）

- 旧版 `web-antd` 全部总览图表页（cockpit 的 `RiskTypeAnalysis`/`RiskTrend`/`LevelDistribution`、executive-cockpit、driver-risk-center 的 `LevelDistribution`/`DemeritAnalysis`/`AccidentAnalysis`）均使用 **`@vben/plugins/echarts`**（`EchartsUI` / `useEcharts` / `ECOption` / `EchartsUIType`）。
- 该插件是 Vben 共享 workspace 包（`@vben/plugins: workspace:*`），**与 antd 解耦、非 antd 专属**；web-naive 自身 dashboard 分析页（`views/dashboard/analytics/*.vue`）已在使用同一 API（`import { EchartsUI, useEcharts } from '@vben/plugins/echarts'`）。
- 结论：**直接复用 `@vben/plugins/echarts`，API 与 import 路径不变**；`useEcharts(ref)` / `renderEcharts(option)` / `resize()` 用法照搬。图表 option 数据逻辑从基线 vue 文件逐行移植。不引入 echarts 主库、不引入任何新依赖。
- 唯一需要替换的是「外壳」：`EchartsUI` 外的容器由 antd `Card`/`Row`/`Col` 改为 Naive `NCard`/`NGrid`/`NGi`（或既有 tailwind grid 类），`EchartsUI` 组件本身沿基线直接使用。

### 2.2 视图/API 现状核实结果（执行前据此判定新建 vs 整流）

- 当前 web-naive `hse.ts`：`HseOverview` `/hse/overview` 占位路由（`ignoreAccess:true`、order 0、icon `shield-check`、指向 `views/hse/overview/index.vue`）——**需整流为基线父路由**，占位视图 `views/hse/overview/index.vue` 整流后成为孤儿（物理删除与否转后续决策）。
- 5 个总览二级视图在 web-naive **全部缺失**，需从 web-antd 逐个移植。
- API 适配：web-naive `api/hse/` 目前**没有** `cockpit.ts` / `executive-cockpit.ts` / `driver-risk-center.ts`，需按基线新建；`bi`、`ai-analysis` 基线视图为纯前端占位（硬编码 `statItems`，无 API 调用），无需新建 API。

---

## 三、路由整流（唯一范围：`src/router/routes/modules/hse.ts`）

### 3.1 父路由（对照基线 `hse-01-overview.ts`）

| 项 | 基线 | 现状 | 目标 |
|----|------|------|------|
| name | `HseOverview` | `HseOverview` | 保持 |
| path | `/overview` | `/hse/overview` | **改 `/overview`** |
| redirect | `/overview/cockpit` | 无 | **补** |
| icon | `lucide:layout-dashboard` | `lucide:shield-check` | **改 layout-dashboard** |
| order | `1` | `0` | **改 1** |
| authority | `['admin']` | `ignoreAccess:true` | **删 ignoreAccess，改 `authority:['admin']`** |
| keepAlive | `true` | 无 | **补** |
| title | 硬编码 `'安全总览'` | `$t('page.hse.overview')` | `$t('page.hse.overview')`（键已存在） |

### 3.2 子路由（5 项，顺序与基线一致）

| 二级名称 | route name | 路径 | icon | authority/hide | 组件（web-naive 目标路径） |
|---|---|---|---|---|---|
| 安全总览首页 | `HseCockpit` | `/overview/cockpit` | `lucide:gauge` | admin | `views/hse/cockpit/index.vue` |
| 智能分析面板 | `HseExecutiveCockpit` | `/overview/executive-cockpit` | `lucide:building-2` | admin / **hideInMenu:true** | `views/hse/executive-cockpit/index.vue` |
| BI数据看板 | `HseBi` | `/overview/bi` | `lucide:bar-chart-3` | admin | `views/hse/bi/index.vue` |
| AI智能分析 | `HseAiAnalysis` | `/overview/ai-analysis` | `lucide:brain-circuit` | admin | `views/hse/ai-analysis/index.vue` |
| 驾驶员风险中心 | `HseDriverRiskCenter` | `/overview/driver-risk-center` | `lucide:car` | admin | `views/hse/driver-risk-center/index.vue` |

> 标题全部转 i18n（见 §六）。路由 name 保持基线命名（无 `Hse` 前缀策略不适用于本菜单——基线即 `HseCockpit` 等）。

---

## 四、API 适配文件（在 `src/api/hse/` 按基线新建）

| 目标文件 | 基线来源 | 说明 |
|---|---|---|
| `executive-cockpit.ts` | `web-antd/api/hse/executive-cockpit.ts` | 逐函数/逐类型对齐，导出与基线同名符号 |
| `driver-risk-center.ts` | `web-antd/api/hse/driver-risk-center.ts` | 逐函数/逐类型对齐 |
| `cockpit.ts`（如基线视图/子组件有 import） | `web-antd/api/hse/cockpit.ts` | 注意：`cockpit/index.vue` 主文件基线为 `requestClient from '#/api/request'` 直连，**子组件是否引用 `api/hse/cockpit.ts` 需执行时逐文件核实**（`rg "from '#/api"` 基线 cockpit 目录）；有则按基线新建，无则不新建 |

> 铁律：仅「对照基线契约创建 web-naive 适配层」，**不改服务端接口**；所有写端点只读核对，**严禁调用**。后端契约核对以 `server/routes/*.js` 只读确认。

---

## 五、视图移植要点

### 5.1 各页复杂度与移植重心

| 视图 | 复杂度 | 移植重心 |
|---|---|---|
| `hse/cockpit/index.vue` | 高 | 真实仪表盘：统计卡分组 + 待办提醒 + 3 个图表子组件；筛选 `Select`(年) + `RangePicker`(日期)；`requestClient` 直连取 stats |
| `hse/executive-cockpit/index.vue` | 高 | 图表分析面板：3 处 `EchartsUI`（trend/inspection/closure）+ `executive-cockpit.ts` API |
| `hse/driver-risk-center/index.vue` | 高 | 驾驶员风险：3 子组件 `LevelDistribution`/`DemeritAnalysis`/`AccidentAnalysis`（均 `EchartsUI`）+ `driver-risk-center.ts` |
| `hse/bi/index.vue` | 低 | 占位看板：`statItems` 统计卡 + 「功能开发中」占位块，无 API 无图表 |
| `hse/ai-analysis/index.vue` | 低 | 占位看板：`statItems` 统计卡 + 「功能开发中」占位块，无 API 无图表 |

> 子组件（cockpit 的 3 个、driver-risk-center 的 3 个）需一并移植到 `views/hse/{cockpit,driver-risk-center}/` 下，文件名与基线一致。

### 5.2 antd → naive 组件映射（按既有规范）

| 基线（antd/vben） | naive 等价 |
|---|---|
| `Page` | `HsePageLayout`（既有） |
| `Card` | `NCard` |
| `Row`/`Col` | `NGrid`/`NGi`（或既有 tailwind grid 类，如 `grid grid-cols-*`） |
| `Space` | `NSpace` |
| `Select` | `NSelect` |
| `RangePicker` | `NDatePicker type="daterange"` |
| `HseStatCard` | **新建共享组件 `components/hse/HseStatCard.vue`**（Naive 实现，props 对齐基线：title/value/icon/color/clickable/suffix/loading + click） |
| `HelpButton` | 沿用既有「HelpButton 弱化」约定（省略或降级，见各历史审核记录） |
| `ImportButtonGroup` | 占位看板页的「导入」按既有 `HseActionBar`/`HseImportDialog` 规范处理；若基线在仪表盘为占位性入口且后端无对应导入端点，据实降级，**不得谎报后端能力** |

### 5.3 公共组件

- 新建 `HseStatCard.vue` 并加入 `components/hse/index.ts` 导出（统一风格：主色安全绿、语义色对齐基线、禁用/加载态齐全）。
- 复用既有 `HsePageLayout`；图表直接 `EchartsUI`/`useEcharts`（不二次封装）。

---

## 六、i18n（zh-CN + en-US，`page.hse` 下新增 5 键）

```
cockpit           安全总览首页  /  Safety Overview Home
executiveCockpit  智能分析面板  /  Executive Cockpit
bi                BI数据看板    /  BI Dashboard
aiAnalysis        AI智能分析    /  AI Analysis
driverRiskCenter  驾驶员风险中心 /  Driver Risk Center
```

> 父菜单用既有 `overview` 键，不新增。路由 `$t` 引用与键定义逐一核对，无孤儿键/缺失键。

---

## 七、红线与边界（务必逐条遵守）

1. 不修改 `web-antd`、后端 `server/`、SQL·数据库、`package.json`·锁文件、`src/router/routes/index.ts`。
2. 仅整流 `hse.ts` 一个路由文件；**不触碰** web-naive 已存在的其它总览子视图（`views/hse/alerts`、`iot`、`notifications`、`supply-chain`、`reports`、`risk-profile-detail` 等属 06E-2/06E-3 或其它模块，一律不得改动）。
3. 不引入 `ant-design-vue` 或任何新依赖；图表只用 `@vben/plugins/echarts`。
4. 严禁任何写操作（仅导航/读取/截图）；后端写端点只读核对不调用。
5. 子组件文件名、`defineOptions` name 与基线一致，不擅自改名/删功能。

---

## 八、验证要求

- `pnpm --filter @vben/web-naive run typecheck` EXIT=0。
- `pnpm --filter @vben/web-naive run build` EXIT=0（如任务书要求产出 `dist.zip` 则一并）。
- `rg "ant-design-vue" apps/web-naive/src` 0 命中。
- `rg "ignoreAccess" src/router/routes/modules/hse.ts` 0 命中；`/hse/overview` 占位路径 0 命中；父路由 `path:'/overview'` + 5 子 path 齐全。
- i18n 5 键 × 2 locale 齐全。
- 浏览器 CDP：注入 token 后导航 `/overview/{cockpit,executive-cockpit,bi,ai-analysis,driver-risk-center}`，抓取侧栏/面包屑/正文截图 + 原始 console 记录（0 error），产物入 `_verify/06E-1/`（含 report.json）。375px 视口补 1 张截图。
- 375px 视口需人工复核说明。

---

## 九、交付物

1. 整流后的 `hse.ts` + 5 个移植视图（含子组件）+ 新建 API 适配 + `HseStatCard.vue` + 2 locale。
2. `docs/Naive UI/阶段06E-1-执行总结.md`（按既定格式记录变更清单、路由/API 映射、i18n、Static/Browser 验证证据、红线遵守、遗留项）。
3. `docs/Naive UI/_verify/06E-1/` 截图与 report.json。
4. 完成后 **STOP**，静候 Codex 审核。
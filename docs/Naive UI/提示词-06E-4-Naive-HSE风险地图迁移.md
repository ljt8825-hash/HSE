# 提示词-06E-4-Naive-HSE风险地图迁移

> 任务来源：`阶段06E-3-审核.md` 结论「通过（附 2 项条件）」，总体进度 05/07
> 基线唯一来源：`apps/web-antd/src/router/routes/modules/hse-04-risk.ts`（RiskControlMap 子路由）+ `apps/web-antd/src/views/risk-control/map.vue`（67211B）
> 执行环境：web-naive (`apps/web-naive`)，Vben 5.7.0 + Naive UI 2.44.1
> 范围性质：**1 个前置修复 + 1 个路由新增 + 1 个视图整页移植**（AMap 交互地图），无后端/数据库改动。

---

## 一、任务目标

1. **前置修复 A**：消除「高级分析」侧栏可见重复（P1）。
2. **前置修复 B**：补齐 06E-3 未完成的 production build。
3. **主任务**：新增 `/risk/map` 路由（`RiskControlMap`）并**整页移植** `risk-control/map.vue`（AMap 高德交互地图）至 web-naive，与基线结构 1:1、样式不缩水、不退回 antd、不引入新依赖。

---

## 二、前置修复（须先完成，再进入 §四）

### A. 消除「高级分析」侧栏可见重复（P1，来自 06E-3 审核）

- 文件：`src/router/routes/modules/hse-advanced.ts`
- 现状：`HseAdvanced`（`/hse-advanced`）父级**缺 `hideInMenu`**（基线 `hse-advanced.ts` 为 `hideInMenu: true`），导致侧栏出现可见「高级分析」分组，重复展示 `HseIot`/`HseSupplyChain`（与 `hse.ts` 的 `/overview/iot|supply-chain` 重名）。
- 动作：给 `HseAdvanced` 的 `meta` 增加 **`hideInMenu: true`**（对齐基线），**不做其他改动**（保留 `/hse-advanced/iot|supply-chain` 深链、保留 redirect）。
- 说明：`hse.ts` 与 `hse-advanced.ts` 的 `HseIot`/`HseSupplyChain` **route name 重名**为基线同源遗留（基线 `hse-01-overview.ts` 与 `hse-advanced.ts` 本就各自定义同名），**本批只隐藏不删**，消除可见重复即可，不强行去重。
- 自检：`rg -n "hideInMenu" src/router/routes/modules/hse-advanced.ts` 应在 `HseAdvanced` 父级 meta 命中。

### B. 补齐 production build

- 运行 `pnpm --filter @vben/web-naive run build`，确认 **EXIT=0** 且产出 dist（06E-3 build 停在 `transforming` 无 EXIT 码，需回填）。

---

## 三、主任务：RiskControlMap 迁移

### 3.1 路由（唯一改动文件：`src/router/routes/modules/risk.ts`）

在既有 `HseRisk`（`/risk`）父下，「风险清单」之后**新增**一个子路由：

| name | path | icon | authority | component |
|---|---|---|---|---|
| `RiskControlMap` | `/risk/map` | `lucide:map` | admin | `#/views/risk-control/map.vue` |

> 标题转 `$t('page.hse.riskMap')`；沿用 naive `risk.ts` 现有 `HseRisk` 父结构，不触碰既有 `HseRiskControl`（`/risk/list`）子路由语义（其 name 与基线 `RiskControlList` 的命名差异属阶段 04 遗留，本批不追改）。

### 3.2 视图整页移植：`views/risk-control/map.vue`（新建）

- 源：`apps/web-antd/src/views/risk-control/map.vue`（67211B，AMap 高德全屏交互地图）。
- 目标：`apps/web-naive/src/views/risk-control/map.vue`（新建，`defineOptions name: 'RiskControlMap'`）。

**AMap 复用约定（关键，避免二次造轮子）**：
- **必须复用 naive 已证明可用的加载模式**：参照 `apps/web-naive/src/views/risk-control/components/RiskMapDrawer.vue` 的动态 `<script>` 加载写法与降级处理（`loadError` 提示、`_AMapSecurityConfig`、失败降级）。
- **常量一致**：`AMAP_KEY = '2dbd01fb5cba78d98503d6d19c46b56b'`、`AMAP_SECURITY = '78c2d6a946eb410c19bf9ab999b866f1'`（与基线 map.vue、naive RiskMapDrawer 三者一致，勿改）。
- **插件名按基线补全**：`AMap.PolygonEditor, AMap.Geocoder, AMap.MarkerClusterer, AMap.Driving`（naive RiskMapDrawer 仅 `AMap.Geocoder`，本页需含 `Driving` 以渲染转运路线；`Driving` 缺失时按基线跳过转运路线并 `console.warn`，不崩）。
- 地图渲染能力按基线完整移植，缺一不可：`renderBoundary`（乡镇 `AMap.Polygon`）、`renderRoads`（`AMap.Polyline`）、`renderStations` / `renderFacilities`（`AMap.Marker`）、`renderParks`（公园 `AMap.Polygon` + 悬浮名称）、`renderTransitRoutes` / `fetchDrivingPath`（`AMap.Driving`）、`loadAndRenderRisks`（`getRiskList` → 风险点 marker + 区域/乡镇坐标吸附）、图例 `ROAD_LEGEND`。
- **复用既有数据与 API（均已存在，无需新建）**：
  - `#/components/hse/risk-map-data`：`ROAD_NETWORK_DATA`、`ROAD_LEGEND`
  - `#/components/hse/kangning-lake`：`KANGNING_LAKE_POLYGONS`
  - `#/api/risk-control`（naive 路径为 `src/api/risk-control/index.ts`）：`getRiskList`、`RiskControlApi` 类型（**注意：naive 的 API 不在 `api/hse/risk-control`，勿照抄基线的 `#/api/hse/risk-control` 导入路径**）

**antd → naive 映射（沿用 web-naive 既有约定）**：
- 外层布局 `Page` → `HsePageLayout`（`#/components/hse`）
- `Card` → `NCard`；`Row`/`Col`（gutter 栅格）→ `NGrid`/`NGi`；`Divider` → `NDivider`；`Space` → `NFlex`（或 `NSpace`）；`Tag` → `NTag`
- `message` → `import { message } from '#/adapter/naive'`（离散实例，勿用 `useMessage` 以免 provider 崩溃，与 06E-2 warning-center 教训一致）
- 图例/筛选的可见性切换控件按 antd 语义用 naive 等价控件（`NSwitch`/`NCheckbox`）实现，不缩水

**样式红线（项目 MEMORY，必须严格对齐）**：
1. 乡镇悬浮名称**跟随鼠标移动**（`mousemove` 实时更新 `InfoWindow` 位置）。
2. 乡镇边界样式：**2px 宽、0.55 透明度实线**，填充透明度 **0.06**。
3. 乡镇悬浮名称样式（白底卡片 + 边框 + 圆角 + 阴影）与**风险清单中的风险地图（naive `RiskMapDrawer.vue`）保持一致**。
4. 乡镇边界 `zIndex` 提到 15（高于道路 ≤10，避免遮挡 hover/click）。
5. 常驻 label 已移除，一律 hover 提示（与基线一致）。

### 3.3 i18n（zh-CN + en-US，`page.hse` 下新增 1 键）

```
riskMap   风险地图  /  Risk Map
```

> 置于 `riskControl`（风险清单）附近；路由 `$t` 引用与键定义核对。视图内标题/图例文案据实转 i18n 或标注遗留（描述性占位文案可据实保留中文，非阻塞）。

---

## 四、红线与边界

1. 不修改 `web-antd`、后端 `server/`、SQL·数据库、`package.json`·锁文件、`src/router/routes/index.ts`。
2. 路由仅新增 `risk.ts` 的 `RiskControlMap` 子路由 + `hse-advanced.ts` 的 `hideInMenu`；不触碰其它模块路由与视图，不触碰登录/权限代码。
3. 不引入 `ant-design-vue` 或新依赖（AMap 为运行时 script 动态加载，非 npm 依赖）。
4. 不改变 `AMAP_KEY`/`AMAP_SECURITY`，不另起一份 AMap 加载器（复用 RiskMapDrawer 模式）。
5. 严禁任何写操作（浏览器验证为纯导航/只读断言）。

---

## 五、验证要求

- `pnpm --filter @vben/web-naive run typecheck` **EXIT=0**。
- `pnpm --filter @vben/web-naive run build` **EXIT=0**（补齐 §二.B，回填 EXIT 码）。
- `rg "ant-design-vue" apps/web-naive/src` 0 命中。
- `rg "useAntdDesignTokens|useAntd" apps/web-naive/src` 0 命中。
- `risk.ts` 父 + **2 子**（`/risk/list`、`/risk/map`）齐全，`RiskControlMap` name/path/icon/authority 与基线 1:1；`hse-advanced.ts` 父级 `hideInMenu: true` 在位。
- i18n `riskMap` 1 键 × 2 locale 齐全。
- 浏览器 CDP：注入 token 后导航 `/risk/map`，抓侧栏（**确认「高级分析」分组已消失、`/risk/map` 归入「风险管控」且顺序在「风险清单」之后**）、面包屑、正文地图容器；抓原始 console（0 error，`AMap.Driving` 未加载时允许 1 条 warn）；产物入 `_verify/06E-4/`（含 report.json）；375px 视口补 1 张并说明需人工目视复核。
- 附图抽查：乡镇悬浮跟随、边界样式（2px/0.55/0.06）、风险点 marker 渲染，产出截图留档。

---

## 六、交付物

1. `risk.ts`（新增 `RiskControlMap` 子路由）+ `hse-advanced.ts`（`hideInMenu: true`）+ `views/risk-control/map.vue`（整页移植）+ 2 locale（`riskMap`）。
2. `docs/Naive UI/阶段06E-4-执行总结.md`（变更清单、AMap 复用说明、路由映射、i18n、Static/Browser 验证证据、红线遵守、遗留项；**须说明 P1 已修复、build EXIT=0 已回填**）。
3. `docs/Naive UI/_verify/06E-4/` 截图与 report.json。
4. 完成后 **STOP**，静候 Codex 审核。
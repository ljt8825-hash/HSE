# 提示词-06E-3-Naive-HSE安全总览C迁移

> 任务来源：`阶段06E-2-审核.md` 结论「通过（无附条件）」，总体进度 05/07
> 基线唯一来源：`apps/web-antd/src/router/routes/modules/hse-01-overview.ts`（第 97~116 行）+ `apps/web-antd/src/views/hse/{iot,supply-chain}/index.vue`
> 执行环境：web-naive (`apps/web-naive`)，Vben 5.7.0 + Naive UI 2.44.1
> 范围性质：**C 批次（安全总览最后 2 个二级页）** — 2 个占位看板页，整流 + 路由插入，非后端/数据库改动。

---

## 一、任务目标

补齐安全总览 C 批次最后 2 个二级页（`HseIot`、`HseSupplyChain`），并**校正 06E-2 遗留的子菜单顺序偏离**（见 §三.4），使父路由 `HseOverview` `/overview` 最终 12 子路由与基线 `hse-01-overview.ts` 完全 1:1（含顺序）。

---

## 二、前置决策（已定）

- 2 页为**纯前端占位看板**（基线同为 3981/4056 字节占位页，无 API、无图表、无表格，硬编码 `statItems` + 「功能开发中」占位块），**无需新建 API**、无需图表库。
- HelpButton/ImportButtonGroup 沿用既有「据实降级」约定。

---

## 三、路由整流（唯一改动文件：`src/router/routes/modules/hse.ts`）

### 3.1 新增 2 子路由

| 二级名称 | route name | 路径 | icon | authority | 组件（web-naive 目标路径） |
|---|---|---|---|---|---|
| IoT物联网 | `HseIot` | `/overview/iot` | `lucide:radio` | admin | `views/hse/iot/index.vue` |
| 供应链安全 | `HseSupplyChain` | `/overview/supply-chain` | `lucide:truck` | admin | `views/hse/supply-chain/index.vue` |

> 标题转 `$t('page.hse.iot')` / `$t('page.hse.supplyChain')`。

### 3.2 关键：**插入**而非追加

基线上两个路由位于「预警与整改中心」与「告警中心」之间（基线第 93/103/113/123/133 行顺序：warning-center → **iot → supply-chain** → alerts → notifications）。06E-2 已把 alerts/notifications 临时紧随 warning-center。本批必须将 `HseIot`、`HseSupplyChain` **按此顺序插入到 `HseAlerts` 之前**，使最终 12 子顺序与基线逐一一致：
`cockpit, executive-cockpit(hidden), bi, ai-analysis, driver-risk-center, accident-analysis, assessment-analysis, warning-center, iot, supply-chain, alerts, notifications`。

### 3.3 完成后自检

`rg -n "name: 'Hse"` 输出顺序应与基线 12 个 name 完全一致。

---

## 四、视图整流（现状核实：两视图已存在）

| 目标 | 现状 | 动作 |
|---|---|---|
| `views/hse/iot/index.vue` | 已存在（占位） | 核对与基线 `web-antd/views/hse/iot/index.vue` 结构 1:1（占位看板 + statItems + 功能开发中块）；`defineOptions name=HseIot` 与路由一致；标题转 i18n |
| `views/hse/supply-chain/index.vue` | 已存在（占位） | 同上；`defineOptions name=HseSupplyChain` 一致；标题转 i18n |

> 两页为占位看板，若 naive 版本已为同类占位，仅需核对标题/名称/占位文案与基线语义一致，不缩水、不退回 antd、不引入新依赖。

---

## 五、API 适配

**无需新建**。基线 `web-antd/api/hse/` 无 `iot.ts` / `supply-chain.ts`（已核实 False），两页为纯占位、无 API 调用。若 naive 两视图当前存在对本不存在的 API 的引用，据实修正为占位（不谎报后端能力）。

---

## 六、i18n（zh-CN + en-US，`page.hse` 下新增 2 键）

```
iot        IoT物联网   /  IoT Monitoring
supplyChain 供应链安全  /  Supply Chain Safety
```

> 路由 `$t` 引用与键定义逐一核对；视图内 `HsePageLayout title` 由硬编码改为 `$t`（或据实标注遗留，非阻塞）。

---

## 七、红线与边界

1. 不修改 `web-antd`、后端 `server/`、SQL·数据库、`package.json`·锁文件、`src/router/routes/index.ts`。
2. 仅追改 `hse.ts`（插入 2 子），不触碰 06E-1/06E-2 已有其它子路由语义（仅调整 alerts/notifications 的相对位置由插入自然达成）；不触碰 `views/hse/{reports,risk-profile-detail,todos,workflow}` 等其它模块视图。
3. 不引入 `ant-design-vue` 或新依赖。
4. 严禁任何写操作。

---

## 八、验证要求

- `pnpm --filter @vben/web-naive run typecheck` EXIT=0。
- `pnpm --filter @vben/web-naive run build` EXIT=0（如需 `dist.zip` 则一并）。
- `rg "ant-design-vue" apps/web-naive/src` 0 命中。
- `hse.ts` 父 + **12 子** path 齐全，12 子顺序与基线逐一一致。
- i18n 2 键 × 2 locale 齐全。
- 浏览器 CDP：注入 token 后导航 `/overview/iot`、`/overview/supply-chain`，抓侧栏/面包屑/正文截图 + 原始 console（0 error），产物入 `_verify/06E-3/`（含 report.json）；375px 视口补 1 张截图并说明需人工目视复核。

---

## 九、交付物

1. `hse.ts` 插入 2 子路由（含顺序校正）+ 整流 2 占位视图 + 2 locale。
2. `docs/Naive UI/阶段06E-3-执行总结.md`（变更清单、路由/顺序映射、i18n、Static/Browser 验证证据、红线遵守、遗留项；**须说明 06E-2 顺序偏离已纠正**）。
3. `docs/Naive UI/_verify/06E-3/` 截图与 report.json。
4. 完成后 **STOP**，静候 Codex 审核。
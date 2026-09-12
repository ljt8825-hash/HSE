# 提示词-06F-Naive-HSE收尾与归一化

> 任务来源：`阶段06E-4-审核.md` 结论「通过（无附条件）」；阶段 06 的 15 个迁移批次（06B-1~06E-4）已全部就位
> 批次性质：**阶段 06 收尾** — 修复必须缺陷 + name/icon 归一化 + i18n 补齐；破坏性/需授权项**单列转决策，本批不擅自执行**
> 执行环境：web-naive (`apps/web-naive`)，Vben 5.7.0 + Naive UI 2.44.1

---

## 一、任务目标

1. **必须修复**：`HseTodos` 缺 `NTag` 导入（运行时组件解析失败），并系统排查同类缺陷。
2. **i18n 补齐**：硬编码 `HsePageLayout title` 转 `$t`。
3. **name/icon 归一化**：对齐基线（非破坏改名，先盘点后改名）。
4. **转决策项**：破坏性/需授权/需业务复核项**只列不执行**，等用户拍板后再单独开任务。

---

## 二、必须修复（P0 · 直接改代码）

### A. `HseTodos` 缺 `NTag` 导入
- 文件：`apps/web-naive/src/views/hse/todos/index.vue`
- 现状：第 418 行 `<NTag v-if="s.error" type="error" size="small">异常</NTag>`，但第 9-18 行 naive-ui 导入列表缺 `NTag`，导致 `[Vue warn]: Failed to resolve component: NTag`、标签不渲染。
- 动作：在 `import { ... } from 'naive-ui'` 中补 `NTag`。
- 自检：`rg "NTag" views/hse/todos/index.vue` 应在导入与使用两处命中。

### B. 系统排查同类「naive-ui 组件引用但未导入」
- 范围：`apps/web-naive/src/views` 全量。
- 手段：对 `<N[A-Z][A-Za-z]*` 使用点逐一比对 `<script setup>` 导入；重点复查既往同源缺陷件（`NResult`→employee-import-v2 已闭环、`NTag`→todos、`useDialog`/`useMessage` 离散实例化）。凡「模板引用但未导入」或「`useMessage`/`useDialog`/`useNotification` 未走 provider / 应改 `#/adapter/naive` 离散实例」的，据实修复。
- 产出：`_verify/06F/naive-import-sweep.md`（逐视图结论表：视图 | 引用组件 | 是否已导入 | 处置）。

---

## 三、硬编码标题 i18n 补齐（非破坏）

将以下视图 `HsePageLayout` 的硬编码 `title` 改为 `:title="$t(...)"`（`page.hse` 已有对应键，**无需新增键**）：

| 视图 | 现状硬编码 | 改后 |
|---|---|---|
| `views/hse/alerts/index.vue` (L349) | `title="告警中心"` | `:title="$t('page.hse.alerts')"` |
| `views/hse/notifications/index.vue` (L385) | `title="通知中心"` | `:title="$t('page.hse.notifications')"` |
| `views/hse/assessment-analysis/index.vue` | 标题「公司HSE考核分析中心」 | 视基线语义转 `$t` 或据实标注遗留 |

> 逐个视图核对 `page.hse.*` 键存在性；若缺键则补（zh-CN/en-US），不谎报密钥。`description` 属可选双语，若已硬编码中文可据实标注遗留（非阻塞）。

---

## 四、name/icon 归一化（先盘点，后改名；非破坏）

**先产出核对表再改名**，逐项对照基线确认「基线实际生效路由」后统一；只改 `name`（与基线对齐）与缺失的 `icon`，**不改 path、不打乱 authority、不减少功能**。

已知待核对项：

| # | naive 现状 | 基线 | 备注 |
|---|---|---|---|
| 1 | `hse-personnel.ts` 员工列表 `name: 'HseEmployeeList'`（无 icon） | 基线既有 `hse-07-personnel.ts` `PersonnelEmployee` 又有 `hse-employee.ts` `HseEmployeeList`（split-brain） | 先确认基线实际生效路由与 icon，再对齐；改名后 **keepAlive/`router.push({name})`/include 列表全量 grep 无漏** |
| 2 | audit 视图 `defineOptions({ name: 'HseSecurityAudit' })` vs 路由 `SystemAudit` | 路由 `SystemAudit` | 统一组件 `defineOptions name` 与路由 name 一致（以路由为准） |
| 3 | `risk.ts` `/risk/list` `name: 'HseRiskControl'` | 基线 `hse-04-risk.ts` `RiskControlList` | 对齐 `RiskControlList` |

- 改名/加 icon 后必须 `typecheck` EXIT=0 + `build` EXIT=0 + `rg` 全量引用复查（`router.push({ name: 'X' })`、`include: ['X']`、`defineOptions name` 与路由一致）。

---

## 五、转决策项（本批**不执行**，单列交用户拍板）

1. **孤儿视图路由化/删除**：`reports`（隐患报告）孤儿视图路由化、`insurance/over-age` 孤儿视图物理删除 —— 涉及删除/新增路由，需用户明确授权。
2. **隐患清单功能补差**：附件/整改流转/提醒/统计/风险转隐患（06D-4 遗留）。
3. **风险地图风险集规模**：`map.vue` `getRiskList({ page:1, pageSize:500 })` >500 截断，需确认生产数据规模或改全量。
4. **偏离①考核分析数据等价性业务复核**（06E-2 遗留，验收阶段处理）。

---

## 六、红线与边界

1. 不修改 `web-antd`、后端 `server/`、SQL·数据库、`package.json`·锁文件、`src/router/routes/index.ts`、登录/权限代码。
2. 改名/加 icon 仅限 §四 清单内条目；未列入的 name/icon 一律不动（除非核对表先经本批执行总结披露并通过审核）。
3. 不引入 `ant-design-vue` 或新依赖。
4. §五 各转决策项**严禁在本批实施**（尤其禁止物理删除 `insurance/over-age`、路由化 `reports`）。
5. 严禁任何写操作（浏览器验证为纯导航/只读断言）。

---

## 七、验证要求

- `pnpm --filter @vben/web-naive run typecheck` **EXIT=0**（日志显式回填 EXIT）。
- `pnpm --filter @vben/web-naive run build` **EXIT=0**。
- `rg "ant-design-vue" apps/web-naive/src` 0 命中。
- `rg "useAntdDesignTokens|useAntd" apps/web-naive/src` 0 命中。
- `naive-import-sweep.md` 逐视图结论齐全。
- 浏览器 CDP：导航 `/hse/todos`（验证 NTag 不再报错、待办页正常），及受影响页（alerts/notifications/assessment-analysis，标题已 i18n），抓原始 console（0 error）；对改名项抓侧栏/breadcrumb 确认 path 未变、菜单正常；产物入 `_verify/06F/`（含 report.json）。

---

## 八、交付物

1. §二/三/四 的代码改动 + 2 locale 补键（如有）。
2. `docs/Naive UI/阶段06F-执行总结.md`（变更清单、naive-import-sweep 结论、归一化核对表、i18n 补齐、Static/Browser 验证证据、红线遵守、§五 转决策项清单）。
3. `docs/Naive UI/_verify/06F/` 截图与 report.json。
4. 完成后 **STOP**，静候 Codex 审核（§五 转决策项待用户在审核结论后拍板）。
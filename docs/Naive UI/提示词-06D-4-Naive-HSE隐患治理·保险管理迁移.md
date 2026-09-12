# 提示词-06D-4-Naive-HSE 隐患治理·保险管理迁移

> 任务类型：Naive HSE 批量迁移 · 隐患治理（1 路由）+ 保险管理（3 路由）+ 1 附带整改 + 完备性核验
> 前置：`阶段06D-3-审核.md` 已结论「通过（无附条件）」；总体进度 `05 / 07`。
> 基线唯一来源：`apps/web-antd/src/router/routes/modules/hse-05-hazards.ts`、`hse-10-insurance.ts`，以及对应旧版 `web-antd` 视图（作功能契约，非复制实现）。
> 目标工程：`apps/web-naive`。**严禁触碰 `web-antd`、后端 `server/`、SQL/数据库、`package.json`/锁文件、`src/router/routes/index.ts`。**

---

## 零、本轮现状关键结论（执行者先读，勿重复踩坑）

本批视图与 API 文件在 web-naive **已存在**（属「未跟踪 naive 实现」，需整流对齐 + 完备性核验，而非从零新建），已核实：

| 物 | 现状 |
|---|---|
| `views/hazards/index.vue`（18024B） | naive 实现，`ant-design-vue` 0 命中；`defineOptions name: 'HseHazardList'`（**与目标 `HazardsList` 不符**） |
| `views/insurance/personnel·vehicle·other/index.vue`（17~19KB） | naive 实现，0 泄漏 |
| `views/insurance/over-age/index.vue`（16303B） | **残留视图，对应路由 `InsuranceOverAge` 待移除** |
| `api/hse/hazard.ts`（3690B） | 11 函数（list/stats/detail/create/update/delete/export），`BASE='/hazards'` |
| `api/hse/insurance.ts`（14987B） | 三子模块（personnel/vehicle/other）类型 + 端点齐备 |
| 路由 | `hse-hazards.ts` / `hse-insurance.ts` 存在，但存在 name/icon/order/title/残留 漂移（见下表） |

---

## 一、范围总览

| 项 | 类型 | 优先级 |
|---|---|---|
| 隐患治理路由对齐（hse-hazards.ts） | 主任务 | 高 |
| 保险管理路由对齐（hse-insurance.ts，含移除 `InsuranceOverAge`） | 主任务 | 高 |
| i18n 配套（hazards 拆分 + insurance 新增 + en-US 补 hazards） | 主任务配套 | 高 |
| 视图/API 完备性核验与补差（隐患 + 保险） | 主任务 | 高 |
| `reports/index.vue` 补离散 dialog（闭环 06D-2 遗留隐患） | 附带整改 | 中 |

---

## 二、主任务 A：隐患治理路由对齐（hse-hazards.ts）

### 2.1 基线（唯一契约）`hse-05-hazards.ts`

```ts
{
  meta: {
    icon: 'lucide:search-check',
    order: 5,
    title: '隐患治理',
    authority: ['admin'],
    keepAlive: true,
  },
  name: 'HseHazards',
  path: '/hazards',
  redirect: '/hazards/list',
  children: [
    {
      meta: {
        title: '隐患清单',
        icon: 'lucide:clipboard-list',
        authority: ['admin'],
      },
      name: 'HazardsList',
      path: '/hazards/list',
      component: () => import('#/views/hazards/index.vue'),
    },
  ],
}
```

### 2.2 现状差异 → 逐项整改

| # | 字段 | 现状（web-naive） | 目标（基线） | 整改 |
|---|---|---|---|---|
| 1 | 父 `meta.icon` | `lucide:triangle-alert` | `lucide:search-check` | 改 icon |
| 2 | 父 `meta.title` | `$t('page.hse.hazards')`（=「隐患排查」） | 「隐患治理」 | 改用新键 `hazardGovernance`（见 §六），**不得复用 `hazards`**（该键被视图 header 占用） |
| 3 | 子 `name` | `HseHazardList` | `HazardsList` | 改 name（**无 `Hse` 前缀**） |
| 4 | 子 `meta.title` | `$t('page.hse.hazards')`（=「隐患排查」） | 「隐患清单」 | 改用新键 `hazardList` |
| 5 | 子 `meta.icon` | 缺失 | `lucide:clipboard-list` | 补 icon |
| 6 | 视图 `defineOptions name` | `HseHazardList`（`views/hazards/index.vue` L44） | `HazardsList` | 同步改 name，与路由 name 保持一致 |

其余字段（父 name/path/redirect/order/authority/keepAlive、子 path/component/authority）已与基线一致，**不得改动**。

---

## 三、主任务 B：保险管理路由对齐（hse-insurance.ts）

### 3.1 基线（唯一契约）`hse-10-insurance.ts`

```ts
{
  meta: {
    icon: 'lucide:shield-check',
    order: 10,
    title: '保险管理',
    authority: ['admin'],
    keepAlive: true,
  },
  name: 'HseInsurance',
  path: '/insurance',
  redirect: '/insurance/personnel',
  children: [
    { meta: { title: '人员保险', icon: 'lucide:shield-plus',  authority: ['admin'] }, name: 'InsurancePersonnel', path: '/insurance/personnel', component: () => import('#/views/insurance/personnel/index.vue') },
    { meta: { title: '车辆保险', icon: 'lucide:car-front',     authority: ['admin'] }, name: 'InsuranceVehicle',   path: '/insurance/vehicle',   component: () => import('#/views/insurance/vehicle/index.vue') },
    { meta: { title: '其他保险', icon: 'lucide:shield-alert',  authority: ['admin'] }, name: 'InsuranceOther',     path: '/insurance/other',     component: () => import('#/views/insurance/other/index.vue') },
  ],
}
```

### 3.2 现状差异 → 逐项整改

| # | 字段 | 现状（web-naive） | 目标（基线） | 整改 |
|---|---|---|---|---|
| 1 | 父 `meta.icon` | `lucide:shield` | `lucide:shield-check` | 改 icon |
| 2 | 父 `meta.order` | `8` | `10` | 改 order |
| 3 | 父 `meta.title` | 硬编码 `'保险管理'` | `$t('page.hse.insurance')` | 转 i18n（新增键，见 §六），显示值不变 |
| 4 | 残留子路由 | `InsuranceOverAge` `/insurance/over-age`（第 4 个子） | **基线无此路由** | **删除该子路由条目** |
| 5 | vehicle `meta.icon` | `lucide:car` | `lucide:car-front` | 改 icon |
| 6 | 三子 `meta.title` | 硬编码 `'人员保险'/'车辆保险'/'其他保险'` | `$t(...)` | 转 i18n（新增键），显示值不变 |

> 子路由 name/path/component/authority、父 name/path/redirect/authority/keepAlive 已与基线一致，不得改动。
> 删除 `InsuranceOverAge` 后，`views/insurance/over-age/index.vue` 成为孤儿视图：**仅删除路由条目；视图文件保留**（避免扩大范围；是否物理删除视图文件在总结中记录为遗留项，交由后续批次决策）。

---

## 四、附带整改：`reports/index.vue` 补离散 dialog（闭环 06D-2 遗留隐患）

`apps/web-naive/src/views/hse/reports/index.vue` 使用 `useDialog()`（`naive-ui` 第 28 行导入、第 65 行调用），但应用根无 `NDialogProvider`，运行期会失败。项目既定修复模式（`employee-import-v2/index.vue` 已采用）：改用 `#/adapter/naive` 导出的离散 `dialog`。

具体改动（仅此 3 处，**不得改动该文件其它逻辑**）：

1. 从 `naive-ui` 导入块删除 `useDialog`。
2. 新增 `import { dialog } from '#/adapter/naive';`（`#/adapter/naive.ts` 的 `createDiscreteApi` 已导出 `dialog`）。
3. 删除第 65 行 `const dialog = useDialog();`。

现有 `dialog.warning({...})`（L256 / L274 / L292）调用点均不变，改用导入的离散 `dialog` 后语义不变。

---

## 五、完备性核验与补差（隐患 + 保险，本轮重点）

两模块视图已存在但属「未跟踪实现」，必须对照 `web-antd` 旧版视图做**功能契约核验**，识别缺口并补齐（原则：功能不缩水，与既有批次一致）。

### 5.1 隐患清单（views/hazards/index.vue，94 行↔基线 rich 实现）

web-naive 当前为「统计卡 + 主表 + 分页 + 导入/导出 + 新增/编辑/删除」。对照基线 `web-antd/src/views/hazards/index.vue`，重点核验以下基线能力是否具备，缺失则补齐：

- 附件管理（上传/删除/版本历史，`relatedRiskId` 风险关联）
- 整改提交 / 复查确认 / 关闭隐患 状态流转
- 「隐患提醒」抽屉（重大隐患 / 超期隐患 两个 tab）
- 「隐患统计分析」抽屉（重复隐患、按部门/岗位/区域排名）
- 风险转隐患联动（`relatedRiskId` 关联展示）

> 若某基线能力在当前 naive 视图已用不同交互等价实现，需在总结中逐项说明；若缺失，须补齐或在总结中如实记录为**经确认的超范围遗留项**（附理由），不得静默跳过。

### 5.2 保险管理（views/insurance/personnel·vehicle·other）

对照基线 `web-antd/src/views/insurance/*/index.vue` 核验：列表、分页/搜索、统计卡、导入、编辑、导出是否完整；personnel 的「花名册关联」（雇主险/工伤险透视）契约是否与后端一致。

### 5.3 API 端点契约核验

- `api/hse/hazard.ts`（`BASE='/hazards'`）：核对端点 path/参数/返回结构是否与后端 `server/routes/hazards.js`（或 insurance.js 中 hazards 段）一致。**注意**：基线隐患视图复用 `api/hse/insurance.ts`，web-naive 改用独立 `hazard.ts`，须确认其端点与后端真实一致；若不一致，修正 `hazard.ts` 或改回复用 `insurance.ts`。
- `api/hse/insurance.ts`：核对三子模块端点与后端 `server/routes/insurance.js` 一致（不做写操作，仅静态核对）。

---

## 六、i18n 配套清单

统一规范：路由 `meta.title` 一律用 `$t('page.hse.xxx')`，不得硬编码中文；zh-CN / en-US 两份 `page.json` 同步。

| 键 | zh-CN | en-US | 用途 |
|---|---|---|---|
| `hazardGovernance` | 隐患治理 | Hazard Governance | 隐患治理父菜单 title |
| `hazardList` | 隐患清单 | Hazard List | 隐患清单子菜单 title |
| `insurance` | 保险管理 | Insurance Management | 保险管理父菜单 title |
| `insurancePersonnel` | 人员保险 | Personnel Insurance | 人员保险子菜单 title |
| `insuranceVehicle` | 车辆保险 | Vehicle Insurance | 车辆保险子菜单 title |
| `insuranceOther` | 其他保险 | Other Insurance | 其他保险子菜单 title |
| `hazards`（en-US 补） | — | Hazard Inspection | **en-US 缺失补全**（zh 已存在，供视图 header 使用） |
| `hazardsDesc`（en-US 补） | — | Hazard inspection & control · server pagination / stats / import / export | **en-US 缺失补全** |

> 现有 `page.hse.hazards`（zh=「隐患排查」）与基线父菜单「隐患治理」、视图 header「隐患排查治理」存在历史术语漂移。本批**只保证菜单 title 1:1**（用 `hazardGovernance`/`hazardList` 新键），页内 header 术语统一归入既有「name/icon/术语归一化批次」遗留项，不在本批铺开。en-US 缺 `hazards`/`hazardsDesc` 为本次顺带补齐的完整性修复。

---

## 七、红线（严禁触碰）

1. 不修改 `web-antd`、后端 `server/`、SQL/数据库、`package.json`/锁文件、`src/router/routes/index.ts`。
2. 不改动两路由模块既有子路由的 name/path/component/authority（仅本表列出的 icon/name/order/title + 删除 `InsuranceOverAge` 属本批允许）。
3. 不改动各视图除 §四（reports 离散 dialog）与 §五（完备性补差）明确允许范围外的逻辑。
4. 不引入 `ant-design-vue` 或任何新依赖。
5. **严禁执行任何写操作**（导入/上传/删除/新增/编辑/整改确认等）。本批为路由整流 + 视图补差 + 静态核验；浏览器验证仅导航 + 读取 + 截图，全程只读。

---

## 八、验证与交付（提交 `阶段06D-4-执行总结.md` 供审核）

1. **静态**：
   - `pnpm --filter @vben/web-naive run typecheck` 退出码 0。
   - `rg -n "ant-design-vue" apps/web-naive/src` → 0 命中。
   - `rg -n "HseHazardList" apps/web-naive/src` → 0 命中（仅 `HazardsList`）。
   - `rg -n "InsuranceOverAge" apps/web-naive/src/router/routes/modules/hse-insurance.ts` → 0 命中。
   - `rg -n "page\.hse\.(hazardGovernance|hazardList|insurance|insurancePersonnel|insuranceVehicle|insuranceOther)" apps/web-naive/src/locales` → zh-CN + en-US 各 6 键齐全。
2. **路由语义**（浏览器无写入验证，仅导航/截图）：
   - 访问 `/hazards/list`：菜单显示「隐患治理 › 隐患清单」，页面正常渲染，控制台 0 错误。
   - 访问 `/insurance/personnel`、`/insurance/vehicle`、`/insurance/other`：菜单「保险管理」下严格 3 项，无「超龄人员」；页面正常渲染。
   - 侧边栏菜单图标/顺序与基线一致（隐患 order 5、保险 order 10）。
   - `reports` 页（报表中心）挂载控制台无 `Failed to resolve component` / `dialog` 报错。
3. **完备性**：§五 逐项附结论（已具备 / 已补齐 / 超范围遗留说明）。
4. 交付物：`阶段06D-4-执行总结.md`，含变更文件清单、路由映射表（基线 vs 落地）、i18n 键清单、完备性核验结论、验证截图/日志路径，并逐条说明红线遵守情况。
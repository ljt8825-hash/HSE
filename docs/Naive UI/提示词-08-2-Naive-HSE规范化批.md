# 提示词-08-2-Naive-HSE规范化批（composable归一化 + split-brain去重）

> 任务来源：`阶段08-1-审核.md` 结论「通过（附 1 处非阻塞勘误）」；用户已拍板：`#1 composable 归一化`、`#3 split-brain 去重` 纳入实施。
> 批次性质：**阶段 08 第二批 —— 规范化批**；只含 #1、#3 两项，**不含** #4/#6（转 08-3）、不含 #5（保留不动）。
> 执行环境：web-naive (`apps/web-naive`)。

---

## 一、任务目标

1. **决策项 #1**：将 HSE 业务视图中对 naive-ui `useMessage`/`useNotification` 的直引，统一回归到 `#/adapter/naive` 离散实例（阶段 02 主题门禁约定）。
2. **决策项 #3**：核实并确认 split-brain 重复路由现状，据此做最小必要去重。

---

## 二、Part 1 —— 决策项 #1 composable 归一化

### 2.1 现状（审核已预核验）

- `#/adapter/naive` 已导出离散实例：`{ dialog, loadingBar, message, modal, notification }`（`src/adapter/naive.ts:33`）。
- 直引 `useMessage` 的文件：**69 个**，其中 `views/demos/naive/index.vue`、`views/demos/form/basic.vue` 为框架演示页，**HSE 业务视图 67 个**。
- 直引 `useNotification`：`views/demos/naive/index.vue` 1 个（同为 demos）。
- 直引形态（抽样 `views/objectives/responsibility/index.vue:22-32`）：
  ```js
  import { ..., useMessage, type UploadFileInfo } from 'naive-ui';
  ...
  const message = useMessage();
  ```

### 2.2 实施范围

**仅 HSE 业务视图**（`apps/web-naive/src/views/` 下，**排除 `views/demos/`**）中所有：
- `import { useMessage } from 'naive-ui'` + `const message = useMessage()` 的直引；
- 若存在 `useNotification` 直引亦同法处理（若 HSE 视图无，则本项为空）。

正确改法（两处同步，缺一不可）：
1. 移除 naive-ui 导入块中的 `useMessage`（及 `useNotification`）；若该导入块因此变空，则整块删除。
2. 删除局部 `const message = useMessage();`（及 `const notification = useNotification();`）。
3. 新增导入：`import { message } from '#/adapter/naive';`（如需 notification 则 `import { message, notification } from '#/adapter/naive';`）。
4. 调用处 `message.success(...)` / `message.error(...)` 等**保持不变**（离散实例 API 同名）。

> 注意：`#/adapter/naive` 的 `message` 是离散实例（继承 HSE 主题），**不是** naive-ui 的 `useMessage()` 返回值，禁止从 naive-ui 再 import `message` 作为独立函数。

### 2.3 范围红线

- **不改 `views/demos/`**（框架演示页，非 HSE 迁移范围；如需统一另行单独立项）。
- **不碰** `app.vue` 的 `NMessageProvider`/`NNotificationProvider` 全局挂载（保留），仅改各视图的直引方式。
- 不改 `dialog`/`modal`/`loadingBar` 相关既有用法（早前已统一，本批不涉及）。
- 不改其它逻辑、不改路由、不改 API。

### 2.4 验收

1. `rg "useMessage|useNotification" apps/web-naive/src/views --glob '*.vue' --glob '*.ts' -g '!demos/**'` → **0 命中**。
2. `rg "#/adapter/naive" apps/web-naive/src/views --glob '*.vue' --glob '*.ts' -l | wc -l` → 与改动文件数一致（用于核对离散实例已就位）。
3. `pnpm --filter @vben/web-naive run typecheck` → **EXIT=0**（显式回填）。
4. `rg "ant-design-vue" apps/web-naive/src` → 0；`rg "useAntdDesignTokens|useAntd"` → 0。

---

## 三、Part 2 —— 决策项 #3 split-brain 去重

### 3.1 审核预核验发现（重要，须按此执行）

1. **原对象已闭合**：决策清单 #3 所述 `hse-employee.ts` 前端路由文件**已不存在**（06F name/icon 归一化时，人员域已并入 `hse-personnel.ts`，员工列表路由为 `PersonnelEmployee`）。全量 `rg "hse-employee.ts"` 仅剩 `api/hse/*` 注释里的**后端路由名** `server/routes/hse-employee.js`，与前端 split-brain 无关。
2. **人员域无残留重复**：`hse-personnel.ts` 内 9 条子路由 path 逐一唯一；全模块 name 重复扫描**仅剩**下列一对。
3. **真实残留 = `HseIot` / `HseSupplyChain` name 重名**（`hse.ts` 与 `hse-advanced.ts` 各定义一次，component 均指向 `views/hse/iot/index.vue`、`views/hse/supply-chain/index.vue`）：

   | name | hse.ts（总览，可见） | hse-advanced.ts（高级分析，`hideInMenu:true`） |
   |---|---|---|
   | `HseIot` | `/overview/iot` | `/hse-advanced/iot` |
   | `HseSupplyChain` | `/overview/supply-chain` | `/hse-advanced/supply-chain` |

   - 这是 **06E-3 审核已记录的「基线同源遗留」**（web-antd `hse-01-overview.ts` 与 `hse-advanced.ts` 亦同名），06E-4 已通过给 `HseAdvanced` 加 `hideInMenu:true` 消除侧栏可见重复；name 重名本身不阻塞（无 `router.push({name})` 编程式导航引用，仅 `views/hse/iot|supply-chain` 的 `defineOptions({name})` 是字符串，非引用）。

### 3.2 本批 #3 的处置（核实为主，最小改）

1. **核实并记录**：「hse-employee.ts split-brain」已随 06F 闭合；人员域无重复路由。此结论写入执行总结。
2. **`HseIot`/`HseSupplyChain` 重名 → 保持不动，仅记录在案**：
   - 理由：基线同源（web-antd 同名同构）；06E-3 已判「不阻塞」；已通过 `hideInMenu` 缓解可见重复；改名会**偏离基线 name 1:1 原则**。
   - 若你认为存在实际功能影响（如 keep-alive `include` 按 name 匹配歧义），**只做评估并写建议，不擅自改 name**，转用户另行授权。

### 3.3 验收

- 全模块 `name:` 重复扫描结果 = 仅 `HseIot`/`HseSupplyChain`（各 2 次，基线同源），无新增、无消除（除经授权开发）。
- 人员域（`/personnel/*`）路由 name/path 无重复。

---

## 四、本批明确不实施

- **#4 reports 路由化、#6 隐患清单全量补差**：转 08-3 功能补差批。
- **#5 `insurance/over-age` 删除**：用户拍板「保留不动」，不删。
- **#7 pageSize**：已于 08-1 确认 ≤500 免改，本批不涉及。
- **`HseIot`/`HseSupplyChain` name 改名**：本批不改（见 §3.2），除非另有授权。
- **`views/demos/`**：不纳入归一化范围。

---

## 五、红线

1. 不改 `web-antd`、后端 `server/`、SQL、`package.json`、锁文件。
2. 不改路由 path/name/authority（除经授权），不改 API、不改业务逻辑。
3. 每次改动独立段落描述（文件 / 改动点 / 原因 / 验证），便于 Codex 逐段复核。
4. `#5` 已拍板保留，禁止删除 `views/insurance/over-age` 目录。
5. 完成后 typecheck 必须显式 EXIT=0。

---

## 六、交付物

1. `docs/Naive UI/_verify/08-2/`：归一化扫描前后 `rg` 证据、name 重复扫描结果、typecheck 日志。
2. `阶段08-2-执行总结.md`：#1 归一化（文件数、改法、验证）+ #3 split-brain 核实结论 + 记录 `HseIot`/`HseSupplyChain` 基线同源重名 + 红线无越权声明。
3. 完成后 **STOP**，静候 Codex 审核；本批不进入 08-3。
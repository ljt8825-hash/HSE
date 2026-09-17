# HSE-MOBILE-GRID-ARCH-03 P2-B1-D — IMPLEMENTATION 04-D-B 实施报告

**阶段**：`P2-B1-D-IMPLEMENTATION-04-D-B`（已归属记录查询 + DEF-A 路由权限修复）
**日期**：2026-09-13
**前置**：04-A（READY）/ 04-B（COMPLETED）/ 04-C（IMPLEMENTED）/ 04-D-A（READY，本阶段的设计依据）
**最终状态**：`PHASE_HSE-MOBILE-GRID-ARCH-03_P2-B1-D_IMPLEMENTATION_04-D-B_IMPLEMENTED`
**04-D-A ✅ ｜ 04-D-B ✅ ｜ 04-E Revoke UI ⏳（未实施，等待指令）**

---

## 0. 结果总览

| 项 | 结果 |
|---|---|
| DEF-A（祖先路由 authority 放宽） | ✅ 实施并经全项目运行时证明（18/19 模块解析，含真实 filterTree） |
| 已归属查询后端 `GET /api/grid-attribution/attributed` | ✅ 实施，权限矩阵 6/6、正确性 18/18 API 断言全过 |
| 已归属查询前端页面 `/site/grid/attributed` | ✅ 实施，E2E 20/20 全过（默认代理链路，零拦截） |
| Revoke | **未实现**（页面上无任何撤销元素，且被 E2E 显式断言） |
| 类型检查 | `60` 个错误 = 既有基线（全部在无关 training/assessment 文件），本阶段文件 0 错误 |
| dev 库基线 | gir=2061 / max_id=7192 / pending=0 / audit_record=0 / sync_map=2061 **全部恢复** |
| 生产库写入 | **0**（全程 `pg_stat_database` 计数器差值 delta=0，两次独立证明） |

---

## 1. 实施范围与文件清单（任务书 §十八 Q1/Q2/Q10）

### 1.1 本阶段修改/新增的文件（共 7 个）

| # | 文件 | 动作 | 内容 |
|---|---|---|---|
| 1 | `server/services/gridAttributionService.js` | 修改（追加） | 新增 `listAttributed({page,pageSize,keyword})`：状态口径 `IN ('attributed','manual_confirmed')`、真分页（LIMIT/OFFSET + 独立 count、pageSize 上限 200）、`ORDER BY id DESC`、LEFT JOIN `employee`/`grid_areas` 带出姓名、keyword 白名单（serial_no/personnel_name/violator_name 模糊 + 纯数字按 id 精确、LIKE 转义）。**未改动任何既有函数** |
| 2 | `server/routes/hse-grid-attribution.js` | 修改（追加） | 新增只读 `GET /attributed`，`requireRole(...ATTR_ROLES)` 逐字沿用，`sendUnhandled` 兜底；成功 `code:0` 与拦截器对齐 |
| 3 | `安全看板vben/.../src/api/hse/grid-attribution.ts` | 修改（追加） | 新增 `AttributedRecord`/`AttributedPage` 类型 + `listAttributedRecords()`（仅提交 page/pageSize/keyword） |
| 4 | `安全看板vben/.../src/views/site/grid/attributed/index.vue` | **新增** | 已归属记录页：HsePageLayout + HseDataGrid（服务端分页）+ keyword 搜索 + NTag 状态 + **零操作列** |
| 5 | `安全看板vben/.../src/router/routes/modules/hse-site.ts` | 修改 | **DEF-A**：`/site` 与 `/site/grid` 两个祖先 authority 追加 `hse_manager`/`safety_manager`（+注释说明）；新增 `/site/grid/attributed` 路由（authority 与后端逐字一致） |
| 6 | `安全看板vben/.../src/locales/langs/zh-CN/page.json` | 修改 | `siteGridAttributed`/`siteGridAttributedDesc` |
| 7 | `安全看板vben/.../src/locales/langs/en-US/page.json` | 修改 | 同上（英文） |

### 1.2 明确不应/未修改的文件

- `server/middleware/auth.js`、`users`、JWT、`gridScope.js` —— 未动
- `server/middleware/encryption.js` —— **本阶段未动**（R2 已于此前阶段修复；04-D-A 亦要求不再改）
- `hse-audit-records.js`（H1）—— **按任务书 §三 明确不处理**
- `site-mgmt.js`、`app.js`、`.env`、Pull Engine、Scheduler、WPS 相关 —— 未动
- `gridAreas`/`gir` 表结构 —— **无任何 DDL**（Q10：否）
- 04-C 页面 `views/site/grid/attribution/index.vue` —— 未动（回归通过）

---

## 2. 任务书 §十八 十七问逐答

**Q1 DEF-A 修改了哪些文件？**
仅 1 个：`src/router/routes/modules/hse-site.ts`（前端路由；本阶段另在该文件追加了 `/site/grid/attributed` 新路由，属 04-D-B 页面注册）。

**Q2 是否修改了已验收的 04-C 路由文件？**
是——`hse-site.ts` 正是 04-C 注册 `attribution` 路由时所用的同一文件。但 04-C 注册的 `SiteGridAttribution` 路由节点本身**逐字未动**（path/name/component/authority 均保持）；本阶段只改了它的两个祖先节点（见 Q3）并追加了一个**并列新节点**。

**Q3 为什么修改？**
04-D-A（DEF-A 发现）已证明：Vben 路由过滤是严格自顶向下的——`/site` 与 `/site/grid` 祖先 authority 仅 `['admin','grid_inspector']`，导致允许访问后端归属 API 的 `hse_manager`/`safety_manager` 在前端**整棵子树被丢弃**（只有 admin 能进页面）。后端 `requireRole` 与前端菜单可见性因此不一致。

**Q4 是否仅增加 admin / hse_manager / safety_manager？**
是。`hse_manager`/`safety_manager` 只被追加到 `/site`、`/site/grid` 两个祖先（叶子本就如此）；`admin` 原有权限无任何变化。

**Q5 是否明确没有增加 grid_inspector？**
是。`grid_inspector` 在所有相关节点保持原样；E2E 用真实 grid_inspector 账号（h2660）验证：菜单不含两页、直连渲染 fallback、API 403。

**Q6 是否导致其他子菜单权限扩大？**
**否，已被运行时证明**：用仓库真实 `filterTree` + 真实 19 个路由模块源文件跑「修改前/后」全项目路径矩阵——
`hse_manager`/`safety_manager` 各 **+3** 条（`/site`、`/site/grid`、`/site/grid/attribution`，均为放行目标所必需的中间节点）；`admin`/`grid_inspector`/`township_manager` **+0/-0**。三违管理、消防设施、转运站、驾驶员管理等兄弟子树（各自 `authority:['admin']`）未受任何影响。修改后对真实文件复跑：矩阵与建模完全一致。

**Q7 已归属查询使用什么状态判断？**
服务端 SQL 固定 `WHERE g.attribution_status IN ('attributed','manual_confirmed')`（冻结状态机），**不使用** `id>7192`、`wps_record_id IS NOT NULL`、`inspector_employee_id IS NOT NULL` 等推断（任务书 §五）。

**Q8 是否存在任何客户端可控的身份/网格越权参数？**
**否**。路由处理器仅读取 `query.page/pageSize/keyword` 三个参数；`grid_id`/`inspector_employee_id`/`operator_employee_id`/`attribution_status` 即使传入也被忽略（实测：携带 `attribution_status=pending&grid_id=99999&inspector_employee_id=99999` 请求，返回仍仅含已归属状态、未带出 grid_id=99999 行）。

**Q9 是否实现 Revoke？**
**否。** 页面无操作列、无撤销按钮、无撤销弹窗，前端 API 层未封装 revoke 调用；E2E 显式断言页面文本不含「撤销/Revoke」。`DELETE /api/grid-attribution/revoke` 后端保留但本阶段前端零调用。

**Q10 是否修改数据库结构？**
否。零 DDL、零 DDL 脚本；仅复用 P2-B1-D-02 已上线的既有列（`attribution_status`/`inspector_employee_id`/`grid_id`）。

**Q11 是否产生 DEV 数据？**
是（仅 `safety_dashboard_dev`）：API 测试种入 gir 7451-7454 + E2E 种入 7456-7461（分两轮：7456-7458、7459-7461），标记 `serial_no LIKE 'P2B1D04DB%'`；另产生 2 条归属审计（04-C 回归动作）。

**Q12 是否已清理 DEV 测试数据？**
**是，且基线逐项核对一致**：清理后 gir=2061 / max_id=7192 / pending=0 / audit_record=0 / sync_map=2061 —— 与测试前基线完全相同（脚本内自动断言 PASS）。

**Q13 生产 DB 是否写入？（证据）**
**零写入。** 证据：每次测试前后对 `pg_stat_database` 中 `safety_dashboard` 的 `xact_commit+xact_rollback` 与 `tup_returned+tup_fetched` 取差值——API 套件全程 **delta=0 (x=0,t=0)**；E2E 全程 **delta=0**。脚本内显式断言 PASS。

**Q14 生产 PID 23396 是否 untouched？**
是。全程 `5876 → LISTENING 23396` 未变（开工/收工两次 netstat 取证一致）；未连接、未重启、未请求生产 5876 的任何端点。

**Q15 WPS 是否 untouched？**
是。无任何 WPS 写入/表单提交/Pull 调用；`WPS_GRID_DATA_SOURCE=false`、`WPS_GRID_SYNC=false` 显式注入两个 dev 实例。

**Q16 Scheduler 是否 untouched？**
是。dev 实例以 `SCHEDULER_ENABLED=false` 启动；生产 Scheduler（PID 23396 进程内）未被触碰；未修改任何调度配置。

**Q17 04-C 原有功能是否回归通过？**
是。API 层：`GET /pending` 200/code=0 且能检索到种入的 pending 行（首测脚本曾按 `serial_no` 匹配而误报 ❌——`/pending` 的 SELECT 本就不含该字段；已用按 id 断言的聚焦复测闭环 ✅）；`POST /attribute` 200/code=0、服务端派生 grid、同事务审计。浏览器层：`/site/grid/attribution` 正常渲染、待处理数量：0、employee selector 正常（数组）。控制台零错误。

---

## 3. 关键设计决策

### 3.1 DEF-A 最小化（§二）
- 只放宽 `/site`、`/site/grid` 两个**重定向/分组节点**的 authority；兄弟子树（violation/fire-facility/transfer-stations/driver）各自保有自己的 `authority:['admin']`，不被级联放行——这一点由全项目 filterTree 运行时证明，不是推断。
- 两处均留注释说明「不随之扩大」的边界与证明方法。
- 权限矩阵的一个客观限制：`users` 表当前**无** hse_manager/safety_manager 真实账号（62×grid_inspector + 1×admin），故这两个角色的 API 200 断言用「admin 身份铸 role=目标角色 的 JWT」代跑（后端鉴权读取 token.role，已由 grid_inspector 真实 403 交叉印证）；前端可达性则以**仓库真实 filterTree 运行时证明**为准（确定性等价于 Vben 线上行为）。

### 3.2 新页面挂在哪（§十）
选择 **`/site/grid/attributed` 作为 `/site/grid` 的第三个叶子**（与 `mgmt`/`ledger`/`attribution` 并列），理由：现有项目模式就是「兄弟叶子页」而非同页 Tab（三违管理虽有 Tab，但其父页为纯容器；04-C attribution 是已验收的功能页，同页 Tab 需改造其结构，风险大）。菜单名「已归属记录」未改动任何既有菜单项。

### 3.3 查询能力取舍（§十一/§十二）
- **真分页**：LIMIT/OFFSET + 独立 count；pageSize 服务端裁剪上限 200（与 `/hse/audit-records` 同一纪律）。04-D-A 登记的 G2（`/pending` 硬编码 limit=500 无真分页）**本阶段未动**（不在范围）。
- **排序 `id DESC`**：`updated_at` 每 15 分钟被 Pull 重写（04-D-A 陷阱 1），禁作排序/时间依据；无独立归属时间列，列表不显示归属时间（04-D-A §建议：归可从 audit_record 溯源）。
- **keyword 白名单**：serial_no / personnel_name / violator_name ILIKE（`\%_` 转义 + `ESCAPE '\'`），纯数字时附加 `id = 精确`。
- **联表取姓名**：LEFT JOIN `employee`（inspector_name）、`grid_areas`（grid_name/township）——避免前端逐行调 selector/batch 的 N+1；无冗余列、无 DDL。
- **陷阱 2 防护**：只按 `attribution_status` 过滤，**未**加 `grid_id IS NOT NULL`——`grid_id ON DELETE SET NULL` 产生的「manual_confirmed 但 grid_id 为 NULL」行必须仍在已归属列表（E2E 有专门样本 ✅）。

### 3.4 状态展示（§五）
`attributed` → 蓝色 NTag「已归属」；`manual_confirmed` → 绿色 NTag「人工归属」；其他值（理论不可达）原样灰色显示。不自造第三种状态。

---

## 4. 验证记录

### 4.1 DEF-A 路由证明（运行时，非推断）
- 工具：`.workbuddy/tmp/p2b1d04db_route_proof.mjs`（读真实 **19/19** 模块源码 → 确定性降级 → import 仓库真实 `filterTree` dist → 逐角色前后矩阵 diff；vben.ts 的构建期常量与 Svg 组件以占位符补齐后全量加载）
- 首轮（18/19，vben.ts 未解析）：修改前 admin=128 / grid_inspector=19 / hse_manager=15 / safety_manager=24 / township=17；修改后 **hse_manager=18（+3）、safety_manager=27（+3），其余角色路径集合逐条相等**。
- 终轮（**19/19**，含 vben demo 模块——其对全员开放，各角色 +9 条 demo 路径）：admin=138 / grid_inspector=28 / hse_manager=28 / safety_manager=37 / township=26；**after−before 对全部角色仍为 +0/−0**，全部判定 PASS——结论与首轮完全一致，DEF-A 影响面结论不依赖 vben 模块是否纳入。
- 真实文件落地后复跑：与建模 after 矩阵完全一致。

### 4.2 API 测试（dev :5881，24/24）
权限矩阵 6/6（admin/hse/safety→200 code=0；grid_inspector→403 code=403；township 代跑→403；无 token→401）；
正确性 18/18（形态、恰 3 条种子、pending 不混入、NULL grid 陷阱样本、状态集合、联表姓名、id DESC、keyword 模糊/精确/空结果、真分页 p1≠p2、total 稳定、pageSize 999→200、非法参数容错、越权参数忽略×2）。
1 个 ❌ 为测试脚本字段错误（按 `serial_no` 匹配 `/pending`，该端点 SELECT 无此列），聚焦复测（按 id）通过后闭环；**产品代码无缺陷**。

### 4.3 前端 E2E（默认代理 5173→5881→dev 库，零拦截，20/20）
页面渲染/标题/3 行种子（文本级断言，规避 vxe 固定列镜像行 ×2 的计数假象）/状态标签/NULL 网格行 `-`/分页器「共 3 条」/keyword 过滤与重置/**无撤销元素**/admin 菜单含两页/grid_inspector（真实账号）菜单不可见+直连 fallback+API 403/04-C 回归/控制台零错误/基线恢复/生产零增量。截图：`.workbuddy/tmp/shots-04db-e2e/1-attributed-list.png` 等 3 张。

### 4.4 类型检查
`vue-tsc` 全量 60 错误 = 既有基线（training/*、assessment-* 等无关文件）；本阶段 4 个前端文件 **0 错误**（期间新页面曾引入 1 个未使用导入的 TS6133，已修复并复测回 60）。

---

## 5. 边界取证（§十四）

| 检查项 | 开工 | 收工 |
|---|---|---|
| `server/.env` mtime | 2026-09-11 22:22:50 | **同（未动）** |
| 生产 5876 | PID 23396 | **PID 23396（未动）** |
| dev 5881/5882 | 本会话早期实例（40456/40820 为本轮重启后新 PID） | 显式 dev 环境运行（DB_NAME=safety_dashboard_dev + 三开关 false），计数器差值法实测仅 dev 库增长、生产 0 |
| 冻结文件（site-mgmt/auth/gridScope/Pull/.env） | — | 未改 |
| git status | 仅既有改动 | server 新增 `M gridAttributionService.js`；web-naive 新增 attributed 页 + hse-site.ts/locale 修改；其余为并行开发（assessment-*）非本阶段产物 |
| 生产库数据 | gir=2061/扩展列非空=0 | **不变（零 DML/DDL）** |

## 6. 遗留与下一步

1. **04-E Revoke UI**：后端 `DELETE /revoke`（事务 + FOR UPDATE + 条件 UPDATE 守卫 + 同事务审计）与查询页均已就绪；届时可在已归属页为 `manual_confirmed` 行增加撤销操作（`attributed` 行按 04-D-A 建议不可撤销）。
2. **G2**：`/pending` 真分页缺口仍在（本阶段按任务书未动）。
3. **H1**：`hse-audit-records` 无 role gate——按任务书 §三 明确未处理。
4. **生产生效**：R2 修复与 04-B/04-D-B 后端路由在生产生效仍需生产 23396 重启（单独授权、择窗口）。
5. `attributed` 状态目前全库 0 行（stamping worker 生产未 apply），页面空态即真实态；dev 造数验收路径已固化在本报告脚本中。

---

## 附录 A：本阶段临时脚本（均在 `.workbuddy/tmp/`，gitignore 锚点内）

| 脚本 | 用途 |
|---|---|
| `p2b1d04db_cols.cjs` / `p2b1d04db_emp2.cjs` | 只读取 gir/grid_areas/employee 列结构 |
| `p2b1d04db_route_proof.mjs` | 全项目路由可达性证明（真实源码 + 真实 filterTree） |
| `p2b1d04db_api_test.cjs` | API 套件（权限矩阵 + 正确性 + 回归 + 清理 + 生产零写入断言） |
| `p2b1d04db_retest_pending.cjs` | 聚焦复测 /pending（按 id） |
| `p2b1d04db_e2e.cjs` | 前端 E2E（默认代理链路） |
| `p2b1d04db_recon.cjs` / `p2b1d04db_probe.cjs` | 库绑定判定（计数器差值法）+ selector/pending 形态 |

## 附录 B：vxe 固定列镜像行陷阱（测试方法论）

VXE Table 对 `fixed: 'left'/'right'` 列会渲染 `.vxe-body--row` 的镜像副本，`locator('.vxe-body--row').count()` 返回约 2×真实行数。**断言行数应使用文本级断言**（行内容 contains/不 contains），或限定主渲染容器；本报告 E2E 已按此修正。该陷阱与 04-C 阶段「月份筛选器假阳性」同类：UI 断言必须先确认控件/渲染语义。

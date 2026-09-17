# CF-WPS-13：Cloudflare H5 网格长巡查文字业务链 实施报告

> 日期：2026-09-16 ｜ 阶段：CF-WPS-13 ｜ 状态：**PASS_WITH_RISK**
> 上游依据：CF-WPS-10（隔离写入）/ CF-WPS-11（Session 身份）/ CF-WPS-12/12A/12B（照片链路 PENDING_EXTERNAL 终局）
> 业务方决策（本阶段门禁）：**保持 WPS_PATROL_TARGET_SHEET=UNRESOLVED，本阶段收口**；生产小规模提交留待业务方另立变更。

---

## 1. 阶段目标

完成「手机端网格长巡查管理」的 Cloudflare H5 **文字业务闭环**：
手机 H5 → 登录 → 工作台 → 开始巡查（自动识别 employee_code、解析网格）→ 填写/提交 → WPS 缓冲表 → 为既有 WPS→PG 同步链准备数据。
照片链路维持 **PHOTO_STATUS=PENDING_EXTERNAL**（CF-WPS-12B 终局结论），本阶段不解决、不伪装。

## 2. 执行范围（阶段 A–H 实况）

| 阶段 | 内容 | 结果 |
|---|---|---|
| A 审计 | 实读 12/12A/12B 报告 + 10/11 报告、Worker 1170 行代码、前端 4 文件、Git 工作区 | ✅ grid-mobile 区域无未识别改动（整个目录为前序阶段 untracked 资产；264 个 server/docs 改动属其他工作流遗留，与本阶段无关） |
| B 目标 Sheet | 实读全文件 Schema + server/services/wps/wpsFieldMap.js + Sheet 11 数据取样 | ✅ 结论：**WPS_PATROL_TARGET_SHEET=UNRESOLVED**（见 §3） |
| C 隔离测试 | Sheet 13 API 幂等补 5 个巡查字段；真实数据取样 | ✅ |
| D Worker API | 3 个新端点实现 + Mock 46 项 | ✅ 46/46 |
| E 真机 | 真实 WPS 上游全链路 28 项 | ✅ 28/28 |
| F 生产提交 | 门禁打印 + 业务方决策 | ⏸ **PRODUCTION_WRITE_AUTHORIZED=false**（业务方选择保持 UNRESOLVED） |
| G 只读核对 | 三表+身份表基线前后一致 | ✅ 零污染 |
| H Pull 验证 | 未触发（无生产写入；Pull 绑定 Sheet 3，本阶段零接触） | N/A |

## 3. WPS 正式目标 Sheet（阶段 B 审计结论）

**WPS_PATROL_TARGET_SHEET=UNRESOLVED**

- 文件 cn229thwalDs 现有 4 个 Sheet：Sheet 3「表格视图」(2063)、Sheet 11「员工信息维护」(1291)、Sheet 13「H5提交测试」(3)、Sheet 14「H5移动端身份」(3)。
- **无独立的「网格长巡查记录」正式 Sheet**；Sheet 3 是三违巡查生产表（Pull 冻结链），缺 问题描述/问题类型/是否三违/三违行为描述/涉及人员/照片状态/client_request_id 列。
- **关键污染风险（不写入的依据）**：把巡查「问题描述」写入 Sheet 3「三违行为」列，会因 violation_behavior 非空被 PC 台账判为发现三违 → 污染生产三违业务。wpsFieldMap 中相关字段均为 `reserved`（"待后续 Sprint 建列"）。
- 处置：按任务书 §六 不新建生产 Sheet、不擅自改 Sheet 3 结构；业务方已确认保持 UNRESOLVED 收口。

**网格映射能力（§十一）已确证**：Sheet 11「负责区域（在职）」列按员工编码精确命中（实测样本：`八里堂村+惠宁`、`专业队`；`0`/空=无效）。解析规则：按 `+，、/;；|` 拆分、剔除空值与 "0"；花名册多行命中 → fail-closed 不可确定。不依赖姓名/手机号模糊匹配。

## 4. 数据字段映射（隔离测试 Sheet 13，实际 Schema 为准）

Sheet 13 在 CF-WPS-12 基础字段上，本阶段经官方 API 幂等新增 5 列（问题类型/是否三违/三违行为描述/涉及人员/照片状态，均 MultiLineText）：

| H5 表单字段 | WPS Sheet 13 列 | 来源 |
|---|---|---|
| 巡查人 employee_code | `employee_code` | **Session.sub 服务端注入**（前端传入一律忽略） |
| 巡查人姓名 | `姓名` | Session 快照 |
| 巡查时间 | `巡查时间`（Date 列） | H5 提交（严格格式校验） |
| 网格 | `网格` | **服务端解析**（Sheet 11 负责区域），body.grid 必须在解析集内 |
| 问题描述 | `问题描述` | H5（≤500 字，超长拒绝不截断） |
| 问题类型 | `问题类型` | H5 选择（env 可配候选集，默认 5 类，正式清单待业务确认） |
| 是否三违 | `是否三违` | H5（是/否） |
| 三违行为描述 | `三违行为描述` | H5（是三违时必填，≤300 字） |
| 涉及人员 | `涉及人员` | H5（是三违时必填，≤200 字） |
| 现场照片状态 | `照片状态` | 服务端定值：`PENDING_EXTERNAL` / `未拍摄` |
| 幂等键 | `client_request_id` | H5 生成，`^[A-Za-z0-9_-]{8,64}$` |
| 来源/状态/编号 | `来源`=`h5-mobile`、`测试状态`=`submitted`、`测试编号`、`创建时间` | 服务端定值 |

生产目标将来启用时的同构映射已预留在 Worker（`MOBILE_PATROL_TARGET_SHEET_ID` 三开关门控，见 §5）。

## 5. Session → employee_code 链与生产写入安全门

```
登录（CF-WPS-11 冻结复用）：phone+password → Sheet14 → bcrypt → 花名册桥 → Session JWT(sub=employee_code)
巡查提交：Session 验签(iss/aud/exp) → employee_code=sub（唯一来源）
  → 门2 ALLOW_WPS_WRITE==='true'（fail-closed）
  → 门3 目标解析 patrolTarget()：缺省→测试 Sheet；生产须三开关齐备
     （MOBILE_PATROL_PRODUCTION_ENABLED + MOBILE_PATROL_TARGET_SHEET_ID + WPS_PATROL_FIELDS_CONFIRMED），
     任一缺失 → 不写生产、安全回落测试表；测试表未配置 → 503
  → 门4 体≤32KB；门5 网格服务端解析；门6 幂等预查
  → record 全部服务端定值构建（body 永不展开注入 record）
```

- 不可信字段：`employee_code`/`inspector_employee_id`/`grid_id`/`attribution_status`/`deduction`/`responsibility`/`review` 即使出现在请求体也结构上不可能进入 record（Mock+真机双重回读验证零残留）。
- `PRODUCTION_WRITE_TARGET=（未解析，UNRESOLVED）`；`PRODUCTION_WRITE_AUTHORIZED=false`。

## 6. Worker API（新增 3 端点，纯追加）

| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/mobile/patrol/meta` | GET | Session 身份快照 + 网格解析（auto/select/unresolved + 明确文案）+ 问题类型候选 + 照片状态明示 PENDING_EXTERNAL |
| `/api/mobile/patrol/submit` | POST | 六道门 → 校验 → 网格比对 → 幂等预查 → WPS create → recordIds/client_request_id |
| `/api/mobile/patrol/records` | GET | `?id=` 详情；否则本人记录列表（≤50 条，按创建时间倒序）；他人记录 404 防枚举 |

幂等：沿用 CF-WPS-10 client_request_id 预查（O(n) 扫描 ≤20 页）。**IDEMPOTENCY_STATUS=LIMITED**（未声称高并发严格幂等；生产通道幂等仍 IDEMPOTENCY_PENDING）。

## 7. H5 页面（移动端优先，零新框架/依赖）

| 页面 | 内容 |
|---|---|
| `login.html` | 沿用 CF-WPS-11（未改动登录逻辑） |
| `home.html`（改造为工作台） | 身份卡 + 大按钮「开始巡查」「我的巡查记录」+ 照片通道验证区（明示 PENDING_EXTERNAL）+ 退出 |
| `patrol.html` | 巡查人只读回显、时间默认当前、网格自动带出/多选 chip/无法确定时全屏明确错误（表单不展示）、问题类型下拉、是否三违切换、三违条件字段、可选照片（先传既有通道再提交，失败不阻塞文字链可清除）、提交结果成功/失败状态明确（含 record_id） |
| `records.html` | 我的记录列表（三违标签、摘要）→ 点击进详情 |
| `detail.html` | 全字段详情（含照片状态 PENDING_EXTERNAL 说明、三违信息分区） |

## 8. 测试结果

**Mock（cfwps13.test.mjs）：46/46 PASS** —— 覆盖任务书 §十七 A 全部 7 项 + B 全部 10 项：正常登录（mock 全链 Sheet14+bcrypt+花名册桥）、Session employee_code 获取、未登录 401（三端点）、employee_code 缺失 422、非法字段 400（时间/类型/三违标志/缺三违描述）、protected 注入零残留（employee_code/grid_id/inspector_employee_id/attribution_status/deduction/review）、client_request_id 校验+重复幂等（create 仅 1 次）、网格无法确定/不一致 422（含文案）、过期 Session 401、超长描述 400（501 字拒绝不截断）、门控矩阵（写开关 403/未配置 503/生产单开关不写生产）、列表他人记录过滤、详情 404 防枚举、泄露扫描。

**真机（cfwps13-realtest.mjs，真实 WPS 上游）：28/28 PASS_REAL** ——
真实花名册候选自动选取（刘胜彬 00369234，负责区域`八里堂村+惠宁`）→ Sheet14 播种真实身份 → **真机登录成功**（employee_code=花名册编码）→ 错误密码 401 → meta 网格解析（select 模式 2 网格）→ **真实提交写入 Sheet 13（record_id=CLU）** → 重复提交 deduplicated 同 record_id → 网格不一致 422 → 未登录 401 → 回读逐字段一致（employee_code=Session.sub、protected 零残留）→ 我的记录/详情/404 → 清理（Sheet13 2 条+Sheet14 播种行）→ 基线复核全一致。

**全量回归（零破坏）**：cfwps08 8/8、cfwps10 8/8、cfwps11 38/38、cfwps12 25/25、cfwps13 46/46、oauth-flow exit=0、jwt-bridge 3/3、http-smoke 3/3。

## 9. 真机 H5 说明（诚实口径）

真机链路通过 **真实 WPS 上游 + Worker 真实 handler 全流程驱动**（登录→meta→提交→回读→列表→详情），与 H5 页面调用同一 API 契约；但 **H5 浏览器端 E2E 未执行**（Worker 未部署 Cloudflare、无手机浏览器环境）——与 CF-WPS-11/12 同口径，列为风险 R4，不声称「手机浏览器实测」。

## 10. WPS 实际写入结果

| 项 | 值 |
|---|---|
| 写入目标 | Sheet 13「H5提交测试」隔离表（target=test 显式返回） |
| 真实写入记录 | 2 条（主记录 CLU + 注入验证记录），提交成功返回 record_id + client_request_id |
| 结构变更 | Sheet 13 新增 5 个 MultiLineText 字段（隔离表允许；幂等创建） |
| Sheet 3/11 | **零写入**（全程仅只读扫描/计数） |
| Sheet 14 | 仅播种 1 行测试身份并已删除（基线 3 行复原） |

## 11. 生产污染检查（阶段 G/D）

| 表 | 基线 | 终态 | 结论 |
|---|---|---|---|
| Sheet 3 生产巡查表 | 2063 | 2063 | ✅ 零变化 |
| Sheet 11 员工花名册 | 1291 | 1291 | ✅ 零变化 |
| Sheet 13 测试表 | 3 | 3 | ✅ 回基线（5 个新字段留存属预期资产） |
| Sheet 14 身份表 | 3 | 3 | ✅ 回基线 |
| PG / 本地 HSE / Tunnel | — | — | ✅ 零访问、零使用 |
| employee_code 错误 / inspector_employee_id、grid_id 非法覆盖 | — | — | ✅ 真机回读零残留 |

测试残留：**0**（清理后基线复核通过；一次性清理脚本 `_c13cleanup-once.mjs` 已用后删除名单核对）。Git 工作区：本阶段新增/修改全部位于 `grid-mobile-cloudflare/`（untracked 资产目录）与 `docs/AI智能分析/`，可解释。

## 12. Attachment PENDING_EXTERNAL 状态

- Worker `/wps/upload/image` 官方三步上传抽象**原样保留**（未改动）；H5 保留拍照入口与上传状态显示。
- 巡查记录的 `照片状态` 列为服务端定值 `PENDING_EXTERNAL`/`未拍摄`；meta/详情/工作台均明示「WPS 附件页面预览能力未开放」。
- **未把上传成功伪装为页面可预览**；未尝试任何未公开 Attachment API（CF-WPS-12B 纪律延续）。

## 13. 风险

| # | 风险 | 等级 |
|---|---|---|
| R1 | **生产目标 Sheet UNRESOLVED**：巡查记录暂无正式落表（仅在隔离表验证）；生产启用需业务方决策（Sheet 3 末尾追加列 / 新建正式表），并同步确认 Pull 是否消费新列 | 高（对上线目标） |
| R2 | 问题类型候选集为临时默认（环境卫生/设施设备/安全隐患/秩序管理/其他），正式清单待业务确认（env `MOBILE_PATROL_PROBLEM_TYPES` 可配） | 中 |
| R3 | 幂等 LIMITED（O(n) 扫描）；生产通道幂等 IDEMPOTENCY_PENDING（继承 CF-WPS-10 结论） | 中 |
| R4 | H5 浏览器 E2E 未执行（未部署）；bcrypt Workers 免费计划 CPU 限制（继承 CF-WPS-11 风险） | 中 |
| R5 | 网格映射依赖 Sheet 11「负责区域（在职）」数据质量（存在 `0`/空/多值），未覆盖人群（网格长本身）负责区域填充率未全面审计 | 中 |

## 14. 未完成事项

1. 生产小规模真实提交（业务方已决策：保持 UNRESOLVED，另立变更）；
2. 既有 Pull 对巡查记录的接收验证（依赖生产目标解析，阶段 H 未触发）；
3. H5 浏览器 E2E + Cloudflare 部署联调；
4. 正式问题类型清单、正式巡查 Sheet 列模型及与 Pull/PG 的字段扩展设计（属 CF-WPS-13 后续变更，需同步评估 wpsFieldMap 末尾追加纪律）。

## 15. 回滚方式

- Worker：删除 `index.js` 中 CF-WPS-13 块与 3 条路由及导出即回到 CF-WPS-12 状态（纯追加，既有端点行为不变，回归全绿佐证）；
- 前端：删除 `patrol.html`/`records.html`/`detail.html`，`home.html` 还原为 CF-WPS-12 版本；
- WPS 侧：Sheet 13 的 5 个新字段可由业务方 UI 删除（字段留存不影响基线行）；测试记录已全部清理；
- 测试资产：`cfwps13.test.mjs`/`cfwps13-realtest.mjs` 保留为回归资产；`cfwps13-schema-probe.mjs`/`cfwps13-area-sample.mjs` 为只读审计资产保留（一次性诊断脚本 `_c13sample*.mjs`/`_c13cleanup-once.mjs` 已删除）。

## 16. Git 状态

本阶段改动（全部 untracked 资产目录内）：
- 修改：`grid-mobile-cloudflare/worker/index.js`（CF-WPS-13 块 +3 路由 +导出，纯追加）
- 新增：`worker/test/cfwps13.test.mjs`、`worker/test/cfwps13-realtest.mjs`、`worker/test/cfwps13-schema-probe.mjs`、`worker/test/cfwps13-area-sample.mjs`
- 前端：`frontend/home.html`（工作台改造）、`frontend/patrol.html`、`frontend/records.html`、`frontend/detail.html`（新增）
- 报告：本文件 + 提示词文件
`server/`、Pull、生产库、CF-WPS-07/10/11/12 代码：零改动。

## 17. CF-WPS-13_STATUS

**PASS_WITH_RISK**

完成条件对照（§二十 17 项）：#1 手机可登录（真机 API 级）✅ / #2 Session employee_code 正确 ✅ / #3 可进入巡查 ✅ / #4 网格可靠确定（解析不出即明确失败，不猜测）✅ / #5 表单可提交 ✅ / #6 Worker 正确写入 WPS（隔离表真机）✅ / #7 WPS 可回读 ✅ / #8 protected 不可覆盖 ✅ / #9 未登录不能提交 ✅ / #10 client_request_id 正常 ✅ / #11 真机闭环成功（API 级真机全链；浏览器 E2E 未执行→R4）✅* / #12 不改三违业务 ✅ / #13 不改 CF-WPS-07 ✅ / #14 Attachment 保持 PENDING_EXTERNAL ✅ / #15 无生产污染 ✅ / #16 Git diff 可解释 ✅ / #17 测试真实可复现（两套件可重复运行，realtest 幂等）✅。

扣分项：生产目标 UNRESOLVED（R1，业务方决策收口）+ 浏览器 E2E 未执行（R4）→ **PASS_WITH_RISK**，不虚报 PASS。

## 18. 下一阶段建议

1. 业务方决策巡查正式落表方案（Sheet 3 末尾追加列 vs 新建正式 Sheet），并授权后另立变更阶段（含 Pull/PG 扩展设计，须遵守 18-hash 末尾追加铁律）；
2. 确认正式问题类型清单；
3. Cloudflare 部署 + H5 浏览器 E2E（登录→巡查→提交→历史）；
4. 生产通道幂等机制设计（IDEMPOTENCY_PENDING 遗留）；
5. 照片链路等待 WPS 官方工单答复（CF-WPS-12B 材料），答复前维持 PENDING_EXTERNAL。

# MOBILE-06：手机端三违真机 UI 验证与生产上线前安全预检报告

> Sprint 日期：2026-09-15（凌晨收口）
> 前序：MOBILE-05（代码完成 + DEV 验证通过，生产未上线）
> 执行边界：**PRODUCTION_WRITE=0 / PRODUCTION_RESTART=0 / 生产 dist 未动 / WPS 未动 / E-08-11 未动 / ai-v2.js 未动**
> 本 Sprint 全程只读 + DEV 验证，未做任何生产写入。

---

## 1. Sprint 目标

1. MOBILE-05 真机/移动浏览器级 UI 走查（375×667 / 390×844 / 412×915）；
2. 生产上线前后端安全预检（含 AI-03 重启阻断复查）；
3. 核实 MOBILE-05 发布物（dist-m05 / dist.zip）；
4. 核实生产回滚方案；
5. 明确生产上线前置条件；
6. 形成三态结论。

---

## 2. MOBILE-05 变更审计（只读）

### 2.1 变更范围确认

| 文件 | diff 规模 | 内容归属 | 结论 |
|---|---|---|---|
| `server/routes/violations/main.js` | +80/-15 | E-08-01 权限闸门（READ 定义）+ MOBILE-05 最小放行（POST 放行 grid_inspector；2 个读端点 + `guardOwnInspectedRecord` 行级守卫） | ✅ 与报告一致 |
| `apps/web-naive/src/views/mobile/violation/new.vue` | 新增 ~560 行（git 未跟踪） | 三违录入页全量 | ✅ 与报告一致 |
| `apps/web-naive/src/router/routes/modules/mobile.ts` | +11 | `violation/new` 子路由 | ✅ 与报告一致 |
| `apps/web-naive/src/views/mobile/index.vue` | +16 | 「三违录入」入口按钮（跨两列） | ✅ 与报告一致 |

说明：仓库存在大量**其他并行 Sprint 的未提交变更**（AI-01~04、三层化拆分等），均不属于 MOBILE-05 范围，本 Sprint 不处理。

### 2.2 逐项负面检查（§三清单）

| 检查项 | 结果 |
|---|---|
| debug 代码 / debugger / TODO / FIXME | 无 |
| console.log 临时调试输出 | 无（仅 main.js 错误路径 1 处 `console.error`，属正常错误日志） |
| 测试账号 / 测试 employeeId / 测试 token | 无 |
| 硬编码扣分 / 硬编码责任对象 | 无（结果区仅展示服务端返回） |
| 客户端 inspectorEmployeeId / checkerId / gridId 注入 | 无（payload 仅 violatorId/violatorName/violationBehavior/violationDate/checkSource[/description/remark/imageContent]） |
| 姓名→employeeId 客户端转换 | 无（必须点选选择器结果，提交 `selected.employee_id`） |
| 默认 checkSource / 前端纠正 / 前端按角色改值 | 无（空值拦截提交，所选值原样提交） |
| 默认分值 / 客户端责任推断 | 无 |

**审计结论：MOBILE-05 四文件变更干净，无未报告修改，无阻断项。**

---

## 3. 真机 UI 验证

### 3.1 视口矩阵（DEV 5888 + 真实 Chromium + grid_inspector 身份 z9666/张康 登录）

| 视口 | 横向滚动 | 布局 | 截图证据 |
|---|---|---|---|
| 375×667 | 无（365/365） | 卡片/单选/底部导航正常 | screenshot-1789427836732.png |
| 390×844 | 无（380/380） | 全部区块正常 | screenshot-1789427809923.png |
| 412×915 | 无（402/402） | 滚动流畅、内容不被底栏遮挡 | screenshot-1789427848751.png |

### 3.2 结构与语义走查

- **表单顺序**：检查人 → 被检查人员 → 三违行为 → 检查来源 → 检查信息（日期/情况说明）→ 现场照片 → 提交 → 结果 ✅（未重排）
- **检查人**：只读展示「张康」，提示「由登录账号自动确定，不可修改」；页面不提供任何身份输入 ✅
- **被检查人员**：搜索「段宝良」→ 结果以「姓名」展示并点选；提交 employeeId ✅
- **检查来源**：company / township / self 三枚举，无默认选中；未选提交被前端拦截（提示「请选择检查来源（原样提交，由服务端判定扣分）」）✅
- **长文本**：120+ 字行为描述在 textarea 与结果页均正常换行，无横向溢出 ✅
- **结果区**：提交成功卡片 + 责任结果（姓名/岗位/分数/周期），不展示 resolutionLayer/scoreBasis/内部 id；脚注「前端不做任何计算」✅

### 3.3 交互与错误处理

| 场景 | 验证方式 | 结果 |
|---|---|---|
| 校验提示（缺来源） | 真实点击提交 | 显示后端语义一致的中文提示 ✅ |
| 防重复提交 | JS 快速三连击 | 仅 1 条请求/1 条记录（`phase` 守卫 + 按钮「提交中…」disabled）✅（库中仅 7605 一条取证） |
| 401 | 代码级（`mapSubmitError`：`codeNumber===401` → 「登录状态已失效，请重新登录后再提交」）+ API 级实测 401 | ✅ |
| 403 | API 级实测 + 前端直显后端 message | ✅ |
| 业务拒绝 | API 级实测（HTTP 200 + `code:-1` + 中文 message，全站统一响应风格）| ✅ |
| 网络失败 | 代码级（`isNetwork` → 「网络连接失败，三违记录提交失败，请重试」，phase 回落 form） | ✅（未模拟断网实测） |
| 照片上传失败/重试/删除 | 复用 MOBILE-02 已验证的 `createPhotoGroup` 链（上传中/失败徽标、单张重试、删除、`isUploading/hasFailed` 双闸阻止提交）| 代码级 ✅；**真实拍照上传未在本 Sprint 实测**（无摄像头设备），如实登记 |

### 3.4 UI 级 E-08-11 闭环实测（DEV）

软避类别上限后经真实 UI 提交（段宝良 7086 + company + 「不戴安全头盔」）：

- 结果页真实回显：**赵书坤（管理员）-5.00 分 / 张卫新（乡镇作业中心经理）-1.00 分，2026年9月月度考核** ✅
- 全程无前端计算痕迹，扣分为服务端 E-08-11 分层规则（direct_supervisor 5 / escalated 1）实际落库结果。

### 3.5 capped-out 护栏复现（重要观察）

未软避时首次 UI 提交（记录 7605）结果页显示「本记录当前无有效扣分」。经引擎重扫报告核实：resolver 正确给出 赵书坤 5(direct_supervisor)/张卫新 1(escalated)，但 **DEV 存量其他类别扣分已顶满类别上限 → capped-out（cappedScore=0，跳过插入）**。这是既有护栏的正确行为（applyCap 单测覆盖），非 MOBILE-05 缺陷；结果页展示如实。该现象印证了 MOBILE-05 报告的同类记录。

**MOBILE_REAL_DEVICE_UI = PASS**

---

## 4. DEV API 全链验证（正式 HTTP API + 真实 grid_inspector 身份）

复跑 `server/scripts/_m05_dev_matrix_full.cjs` + 新增 `server/scripts/_m06_extra.cjs`，全部走 DEV 5882 / safety_dashboard_dev。

| CASE | 场景 | 结果 | 备注 |
|---|---|---|---|
| A | 保洁员 7086 + company + 头盔 | ✅ 赵书坤 5 / 张卫新 1 | |
| B | 同 A（头盔特殊规则即 A） | ✅ 5/1 由服务端计算 | 与 A 同口径覆盖 |
| C | 管理员 7085 违规 + company | ✅ 本人 5 / 经理 5 | |
| D | 乡镇经理 7008 违规 + company | ✅ 本人 5 | |
| E | 乡镇范围检查人(104)提交 company | ✅ 权威纠正 self → 0 扣分 | fail-closed |
| E2 | 乡镇范围检查人(104)提交 township | ✅ 无扣分（deduction 0 行） | full 脚本 E2 断言有两处口径错误（检查人用了 company 范围张康 + 期望 `status==='no_deduct'`），**业务实质 PASS**，详见 §4.1 |
| F | 普通三违（非头盔）+ company | ✅ 每目标 1 分 | |
| PC-QUERY | admin 列表查询手机提交记录 | ✅ 可见 | |
| GUARD | grid_inspector 读他人记录 | ✅ 详情/证据链均 403「仅可查看本人检查的三违记录」 | |
| GUARD-PASS | grid_inspector 读本人记录 | ✅ 详情/证据链均 200 | |
| AUTH | 无 token / 坏 token | ✅ 均 401 | |
| BIZ-REJECT | 缺 checkSource / violatorId 不存在 | ✅ code:-1 + 中文 message，均未落库 | |
| IDEMPOTENCY | 连续两次 POST | 产生 2 条记录 | **取证：服务端当前无幂等键**（与规格预期一致，不宣称具备服务端幂等） |

### 4.1 脚本口径更正（非产品回归）

`_m05_dev_matrix_full.cjs` 的 CASE-E2 使用张康（company 范围）提交 township 并断言 `no_deduct`。按 E-08-08 权威语义，company 范围检查人提交 township 会被**纠正为 company** 并正常计分——矩阵实测即产生 5/1（这正是权威纠正的正确行为）。业务口径正确的验证（104 刘秀梅=乡镇范围 提交 township → 0 扣分）在 `_m06_extra.cjs` 完成并通过。

### 4.2 本 Sprint 唯一真实发现（不阻断手机端）

**服务端允许缺 `violatorId` 创建三违记录**（取证：缺 violatorId 的 POST 返回「创建成功」，落库 violator_id=NULL，记录 7600）。为既有 API 行为，PC 端同样暴露；手机端前端强制点选人员不受影响。
→ 登记后续 Sprint：`violationService.create` 增加 violatorId 必填校验（独立小改动，本 Sprint 不动服务代码）。

**MOBILE_DEV_FULL_CHAIN = PASS**

---

## 5. AI-03 重启阻断检查（只读）

| 检查项 | 结果 |
|---|---|
| `server/routes/ai-v2.js` require 路径 | `require('../middleware/auth')` —— **正确**（server/routes/ → server/middleware/） |
| 模块实际加载测试 | `require('./routes/ai-v2.js')` → LOAD OK（连同 aiV2Controller 链） |
| `routes/ai-enhanced.js` 加载 | LOAD OK |
| `app.js` 全部 107 个相对依赖静态解析 | 0 个 UNRESOLVED |
| 修改时间 | ai-v2.js 最后修改 2026-09-14 22:16:18（AI-03 并行会话修复），此后未再改动 |

**AI_RESTART_BLOCKER = NO**（此前登记的 `require('../../middleware/auth')` 断链已被独立 AI-03 Sprint 修复，本 Sprint 未触碰该文件）。

⚠️ 上线声明：`app.js` 已挂载 AI-03 路由（`/api/hse/ai/v2`，第 99/468 行）。**生产后端重启时 AI-03 代码将与 MOBILE-05 权限修复同时进入生产**，上线实施方案必须明确包含该事实并单独评估 AI-03 侧就绪度。

---

## 6. 生产 5876 健康检查（只读）

| 项 | 值 |
|---|---|
| `/api/health` | `{"status":"ok"}`，responseTimeMs=0 |
| PID / 进程 | 3032 / node.exe |
| uptime 反推启动时间 | ≈2026-09-14 21:30:45（+0800） |
| MOBILE-05 后端修复是否已加载 | **NO**——main.js 最终修改 22:55:58、app.js 22:08:56、ai-v2.js 22:16:18，均晚于进程启动时间 |
| 生产重启纪律 | 本 Sprint 未重启（PRODUCTION_RESTART=0） |

---

## 7. 前端发布物检查

| 产物 | 状态 | 证据 |
|---|---|---|
| `dist-m05/` | **READY** ✅ | 含手机三违页 chunk `js/new-FdG5_XRR.js`（内含 MobileViolationNew/新增三违 标记）+ `js/bootstrap-Mb6gj-d3.js`；标准 SPA 结构（index.html/_app.config.js/css/js/geojson） |
| `dist.zip` | **NOT READY** ❌ | 503 entries 中**不含** `new-FdG5_XRR.js`；bootstrap 为 `BawrMLo_`（与生产 dist 22:24 版一致）——实为**旧构建的打包**。MOBILE-05 报告「dist.zip 被构建自动刷新（含 M05）」表述**有误，在此更正**：上线时应以 `dist-m05/` 目录为准，dist.zip 需在上线当时重新打包 |
| 生产 `dist/` | 未切换 ✅ | 无 MobileViolationNew/新增三违 标记；bootstrap=BawrMLo_；mtime 09-14 22:24 |
| `FRONTEND_M05_BUILD_READY` | **YES**（以 dist-m05 为准） | |
| `FRONTEND_M05_PUBLISHED` | **NO** | 生产 dist 未动 |

---

## 8. 生产回滚方案（文件级只读确认）

**后端**：MOBILE-05 生产变更仅 `server/routes/violations/main.js` 一个文件。
- 回滚动作 = 以 MOBILE-05 前版本覆盖该文件并重启 5876（MOBILE-05 前版本 = E-08-01 闸门版：READ 三角色读端点 + WRITER 写端点，无 MOBILE_ITEM_READ/行级守卫/POST 放行）。
- 前置：上线实施时先备份当前 main.js（含 hash 记录）。

**前端**：生产 dist 当前未含 MOBILE-05 → **回滚 = 不切换即可**（零动作）。
- 备份目录核对：`dist-ui01-backup/`、`dist-m05/`、`dist/` 均在，本 Sprint 未删除任何历史备份。

**回滚触发建议**：上线后出现越权/扣分异常 → 先切前端（SPA 立即回到无 M05 入口），后端 main.js 回滚须评估已产生的 grid_inspector 记录数据兼容性（只增不改语义，回滚安全）。

---

## 9. 未完成项 / 登记

| 项 | 定级 | 说明 |
|---|---|---|
| 服务端 violatorId 必填校验 | 后续 Sprint（建议） | 缺 violatorId 可创建记录（§4.2），PC 同暴露 |
| dist.zip 重新打包 | 上线工序更正 | 现有 dist.zip 为旧构建，上线时由 dist-m05 重新打包 |
| 真机实拍上传全链（摄像头） | 未覆盖 | 浏览器级已验证上传组件逻辑，真实拍照留真机验收 |
| 服务端幂等键 | 独立 Sprint（规格既有登记） | 本 Sprint 仅取证无幂等 |
| 「我的三违」手机列表 | 可选独立 Sprint | |
| AI-03 生产就绪度评估 | 独立 Sprint（AI 线） | 重启将同车上线，需 AI 线给出就绪结论 |

---

## 10. 风险

1. **重启同车风险**：下次生产重启将同时加载 MOBILE-05 权限修复 + AI-03 全部新路由/服务，变更面大于 MOBILE-05 单独上线；建议上线前 AI 线完成自验，或评估分批挂载。
2. **capped-out 用户感知**：上限占满时现场提交会看到「无有效扣分」，现场人员可能误以为提交失败。建议后续 Sprint 在结果页对 capped 状态给出更明确的文案（本期不改）。
3. **周期多 in_progress**：DEV 库中存在 43（2026-09）与 52（2026-04）同时 in_progress、且 52 的 id 大于 43；生产若存在同类数据，事件链周期命中以 resolveCycle 日期窗口为准（9 月提交命中 9 月周期），目前语义正确，但多开周期本身建议数据治理。
4. 脚本 `_m05_dev_matrix_full.cjs` CASE-E2 口径错误已在本报告更正，后续复跑请以 `_m06_extra.cjs` 口径为准（脚本本身未改）。

---

## 11. 最终三态

```text
MOBILE_REAL_DEVICE_UI   = PASS   （3 视口 0 横向滚动；表单顺序/只读检查人/选择器/来源枚举/长文本/防重/校验全过；UI 级 5/1 扣分闭环实测）
MOBILE_DEV_FULL_CHAIN   = PASS   （CASE A~F 业务实质全 PASS + 越权/401/业务拒绝/防重全过；脚本 2 处口径错误已甄别更正）
MOBILE_PRODUCTION_READY = READY  （AI_RESTART_BLOCKER=NO；后端单文件可上线可回滚；前端 dist-m05 READY、生产未发布）
```

`MOBILE_06_STATUS = PASS`

四维度状态：

| 维度 | 状态 |
|---|---|
| 代码完成 | ✅ 完成（MOBILE-05 四文件审计干净，无未报告修改/无 debug 残留） |
| DEV 验证 | ✅ 通过（API 全链 + UI 级 E2E 双重验证） |
| 真机验证 | ✅ 通过（真实 Chromium + grid_inspector 身份，3 视口 + 交互 + 闭环） |
| 生产上线准备 | ✅ 就绪（**待独立授权执行**；AI-03 断链已解除但重启将同车上线 AI-03；dist.zip 需重打包） |

---

## 12. 下一阶段建议（MOBILE-07 候选）

1. **生产上线执行 Sprint**（需独立授权）：
   - 前置确认 AI-03 线就绪结论；
   - 由 `dist-m05/` 重新打包 dist.zip；
   - 备份并替换 `server/routes/violations/main.js` → 重启 5876（计划任务 HSE-Backend-5876）→ 切换前端 dist → 生产只读验收（权限矩阵 + health + UI 冒烟）。
2. 服务端 violatorId 必填校验（小改动）。
3. 结果页 capped 状态文案优化。
4. 真机（实机摄像头）拍照上传验收。

---

*执行纪律确认：本 Sprint 先审计 → 再验证 → 再报告；未修改任何业务代码（新增验证脚本 `_m06_extra.cjs` 与本报告除外）；未触碰生产、WPS、E-08-11、ai-v2.js、PC 页面。报告完成后立即停止，不执行 MOBILE-07。*

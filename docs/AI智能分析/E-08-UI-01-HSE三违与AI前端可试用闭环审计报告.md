# E-08-UI-01：HSE 三违 + AI 前端可试用闭环审计报告

**阶段**：P2-B1-E-08-UI-01 · 只读审计（零代码修改 / 零生产写入 / 零重启）
**审计时间**：2026-09-14 21:59 – 22:15（GMT+8）
**正式前端**：`安全看板vben/apps/web-naive`（Vben Admin v5 + Vue 3 + TS + Naive UI）
**生产后端**：:5876（PID 3032，health 200）

---

## 1. 审计范围

- 三违录入→责任解析→扣分→前端展示的**全操作链**逐环审计（业务使用者视角）。
- E-08-11 分层分值（self/direct=5、escalated=1）的 **UI 回显能力**。
- HSE AI 功能的**真实可操作 UI** 存在性与调用链。
- 路由/菜单/API/构建/发布/访问地址。审计方式=代码审计 + HTTP 层验证；未执行浏览器级登录走查（无登录凭据，不猜测），已如实标注。

## 2. 正式前端确认

`FRONTEND_SOURCE=apps/web-naive` ✅（web-antd 未作为验收对象）。
三违相关源码：`src/views/site/violation/`（index.vue 1616 行 / ledger.vue / analysis.vue / candidates/）、`src/api/hse/violations.ts`（16 个 API 函数）、`src/api/hse/employee.ts`（人员选择器）。

## 3. 三违页面清单与路由/菜单

| 菜单路径（现场管理 ▸ 三违管理） | 路由 | 页面 | authority |
|---|---|---|---|
| 三违候选 | /site/violation/candidates | candidates/index.vue | admin/hse_manager/safety_manager |
| **三违记录管理（录入页）** | **/site/violation/records** | **index.vue（E-08-01 挂载）** | admin/hse_manager/safety_manager |
| 三违分析 | /site/violation/analysis | analysis.vue | admin |
| 三违台账 | /site/violation/ledger | ledger.vue | admin |
| 三违管理考核 | /site/violation/assessment | violation-assessment/index.vue | admin |

路由由 `routes/index.ts` glob 自动发现（modules/hse-site.ts 定义完整）；菜单=路由 meta 自动生成（Vben5 静态路由），登录后按 authority 过滤。

## 4. 三违录入闭环逐环核验（第五节 20 项）

| # | 检查项 | 结果 | 证据（index.vue 行号） |
|---|---|---|---|
| 1-4 | 页面存在/路由可达/菜单入口/属 web-naive | ✅ | 见上表 |
| 5 | 人员选择 | ✅ | getEmployeeSelectorList 远程搜索 + batch 回显（66, 389, 404） |
| 6 | 检查来源 | ✅ | CHECK_SOURCE_OPTIONS 公司检查/乡镇查处/自查自纠，新建必填（117-119, 547） |
| 7-8 | 违规行为/可录入「不戴安全头盔」 | ✅ | violationBehavior 自由文本 NInput，placeholder「骑车不戴头盔…」（1344-1350） |
| 9 | 提交 | ✅ | onSubmit → createViolation（537-596） |
| 10 | 调用正式后端 API | ✅ | /api/violations（api/hse/violations.ts BASE）→ server/routes/violations/main.js + site-mgmt/main.js |
| 11 | API 返回结构 | ✅ | ViolationEvidenceChain（evidence-chain 端点 :277） |
| 12-14 | 解析责任对象/deduction/显示扣分 | ✅ | transmissionTargets：deductionStatusInfo.deductions 优先 + ec.deductions 回退，confirmedScore ?? suggestedScore 展示（706-737, 1186-1188） |
| 15 | 多责任对象 | ✅ | v-for NDescriptions 每对象一张卡 + 合计扣分 deductionTotalScore（1181, 1244） |
| 16-17 | 区分 5 分/1 分 | ✅ | 分值展示**全部来自后端实际计算值**（confirmedScore/suggestedScore），前端零分值计算（432 行注释明示） |
| 18 | evidence-chain | ✅ | getViolationEvidenceChain + 证据链追溯区（source_type=grid_candidate 时） |
| 19 | deductionStatusInfo | ✅ | 状态标签/说明/扣分明细全消费（1216-1258） |
| 20 | 错误/空/loading | ✅ | failClosedNotice NAlert（fail-closed 告警）、「暂无责任对象」「加载中」「服务暂不可达」四态齐全（1141, 1199, 1211） |

**操作链**：新建 → 必填校验（类型/严重程度/描述/日期/查处来源）→ 创建成功自动打开详情抽屉 → 加载 evidence-chain → 「责任传递结果」区域展示责任对象+分值。✅ 闭环成立。

## 5. E-08-11 结果展示能力（第六节）

前端按 **后端实际返回分值** 渲染（`confirmedScore ?? suggestedScore`），场景 A（5/1）、B（5）、C（5/5）、D（5）的分值差异由后端计算、前端如实显示——**具备正确回显能力，无需前端改动**。

字段核验：`deductionStatusInfo.deductions`（✅ 主数据源）、`target/targetEmployeeName`（✅）、`score/confirmedScore/suggestedScore`（✅）、`evidence`（✅ 证据链区）。
`resolutionLayer`：前端**不直接展示**该字段本身，但其业务结果（不同层级不同分值）通过扣分分值如实体现；如需在 UI 标注「本人/直接上级/上级的上级」角色，属增强项非缺口（deductionItem 已可承载角色标注）。

**BACKEND_READY_FRONTEND_MISSING：未发现**（后端产出均有展示通道）。

## 6. 分值写死风险检查（第七节）

| 位置 | 内容 | 风险 |
|---|---|---|
| index.vue:564 | 用户可见 dialog：「未标注查处来源…将按 1 分/次计分」 | ⚠️ **文案风险**：与现行后端权威判定语义不完全一致（后端按检查人身份 fail-closed 判定，并非简单 1 分/次） |
| index.vue:1342 | 代码注释「普通三违 1 分 / 仅不戴安全头盔 5 分」 | 低（E-08-08 口径注释，非用户可见文案，仅误导维护者） |

**分值展示无任何写死**（无「5 分」「1 分」作为计算/展示规则出现，`company_score` 前端零引用）→ 前端展示后端实际计算结果 ✅。

## 7. HSE AI UI 审计（第八节）

| 项 | 结果 |
|---|---|
| 独立 AI 页面 `/overview/ai-analysis`（AI 智能分析，菜单已挂，authority admin） | ⚠️ **静态占位壳**：113 行，写死统计数字（如「分析次数 3580」）与占位图表，**未调用任何 AI API** |
| `api/hse/ai.ts`（/hse/ai/provider/status、/hse/ai/generate-report） | API 封装存在，但**无任何页面引用**（generate-report 死封装） |
| **`/overview/reports` 报告管理（真实 AI UI）** | ✅ **真实可操作**：AI 辅助生成（generate → 轮询 getReportStatus）、AI 生成中状态列、重新生成、AI 辅助生成提示、导出 HTML/Word；调用链 reports/index.vue → api/hse/reports.ts → /api/hse/report/v2/* → server/routes/hse-report.js → services/ai/*（aiGateway/aiProviderRegistry/aiPromptRegistry，env AI_PROVIDER+API_KEY 已配置）→ 结果回传 Vue 渲染 |
| 三违页面内嵌 AI 操作（[AI分析] 按钮） | ❌ 不存在（三违与 AI 未在页面级结合） |
| 后端 AI 能力面 | routes/ai.js（risk-predict/classify/anomaly-detect/qa）、ai-enhanced、documentAi/trainingOcr 等 service 齐全，但多数无前端 UI 消费 |

## 8. ⚠️ 重大风险：并行 AI-03 半成品（22:04 写入，非本阶段产生）

审计中发现 `server/app.js` 于 **22:04 被并行工作修改**（新增 `require('./routes/ai-v2')`，AI-03 统一 AI API），同时新增 `server/routes/ai-v2.js` + `controllers/aiV2Controller.js`。但 `routes/ai-v2.js` 第 14 行 `require('../../middleware/auth')` **路径断链**（实际 `routes/ai-v2.js` 位于 routes/ 下，正确应为 `../middleware/auth`；aiV2Controller 本身可加载）。

**后果**：当前生产 PID 3032（21:30 启动）不含该变更、运行正常；但**下一次生产重启将因 require 抛错无法启动**。本阶段按纪律未修改，仅登记。需在下次重启前由 AI-03 责任方修复该 require 路径。

## 9. 构建状态 / 发布状态 / 访问方式（第九、十节）

- **构建**：dist/index.html mtime 2026-09-14 20:17（2.37MB dist.zip 同批），含 E-08-08/E-09 全部前端增量；E-08-11 前端零修改，dist 无需重建。`/_app.config.js` → 200。
- **发布**：5876 单端口同源托管（app.js SERVE_DIST 块，PID 3032 加载中）。
- **HTTP 验证**（浏览器等效 Accept: text/html 头）：`/`、`/site/violation/records`、`/overview/ai-analysis`、`/overview/reports` 全部 **200**；`/api/health` 200。⚠️ 注意：curl 默认头（无 text/html）会得到 404——SPA 回退按 Accept 头工作，浏览器不受影响（审计中实际踩到此假象并已用等效头复核）。
- **开发环境**：vite dev 5173 在线（200），代理 → 5882 DEV 后端。

业务人员实际操作路径：

```text
浏览器 → http://localhost:5876（局域网 http://192.168.10.101:5876）
      → 登录（admin / hse_manager / safety_manager 角色）
      → 左侧菜单：现场管理 ▸ 三违管理 ▸ 三违记录管理
      → URL：/site/violation/records
      → 「新增」→ 选人员 / 选查处来源「公司检查」/ 填三违行为（如：骑车不戴头盔）→ 提交
      → 详情抽屉「责任传递结果」展示责任对象与扣分
AI 报告：总览 ▸ 报告管理（/overview/reports）
```

ACCESS_PATH=CONFIRMED（HTTP 层 + 代码级；浏览器级登录走查未执行，无凭据）。

## 10. 五状态与最终结论

```text
FRONTEND_SOURCE=apps/web-naive

FRONTEND_SOURCE_READY=YES      （页面/路由/API/组件源码齐全）
FRONTEND_BUILD_READY=YES       （dist 20:17 构建成功，资源在线）
FRONTEND_ROUTE_READY=YES       （静态路由注册 + HTTP 200 + authority 闭环）
FRONTEND_PUBLISHED=YES         （5876 同源托管，PID 3032 加载现行 dist）
FRONTEND_BUSINESS_USABLE=YES   （三违录入→后端解析→扣分→展示链路完整；唯一保留=未经浏览器级人工登录走查）

SANWEI_UI_STATUS=READY
AI_UI_STATUS=PARTIAL
```

**业务试用结论：UI_READY_FOR_TRIAL** —— HSE 管理人员现在即可从正式前端（5876）完成公司检查三违录入，并在页面看到后端按 E-08-11 分层规则计算的责任对象与分值（页面展示后端实际计算值，场景 A/B/C/D 分值差异均可正确回显）。

AI 单独结论：**AI_UI_STATUS=PARTIAL** —— 真实可用 AI UI 仅「报告管理」（AI 辅助生成/重新生成/状态/导出，全链路接线）；「AI 智能分析」页为静态占位壳；三违页面无内嵌 AI 操作；api/hse/ai.ts 为死封装；AI 能力面（risk-predict/classify/anomaly-detect/qa）无 UI 消费。

## 11. 缺失功能清单（第十四节，仅记录不开发）

1. AI 智能分析页（/overview/ai-analysis）无真实功能（占位壳，未接 /hse/ai/*）。
2. 三违页面无内嵌 [AI分析]/AI 判断/人工复核交互。
3. api/hse/ai.ts（provider/status、generate-report）无页面消费。
4. 后端 AI 端点（/api/ai/risk-predict、classify、anomaly-detect、qa）无前端 UI。
5. （增强项）责任对象卡片未展示 resolutionLayer 角色标注（本人/直接上级/更高一级）。

## 12. 风险清单

| # | 风险 | 等级 | 说明 |
|---|---|---|---|
| 1 | **routes/ai-v2.js require 断链**（22:04 并行写入） | **高** | 下次生产重启 app.js 将 crash；须 AI-03 责任方修复（`../../middleware/auth` → `../middleware/auth`）后再重启 |
| 2 | index.vue:564 dialog 文案「未标注将按 1 分/次计分」 | 中 | 与后端权威判定/fail-closed 语义不一致，可能误导录入人 |
| 3 | index.vue:1342 注释仍为 E-08-08 口径 | 低 | 维护性误导，非用户可见 |
| 4 | 工作树未提交变更持续变动（app.js 22:04、21:17 等） | 中 | 生产运行版本与工作树不同步，重启前须先稳定/提交工作树 |
| 5 | 浏览器级端到端走查未执行 | 低 | 无登录凭据；建议业务人员首验时按 §9 路径人工走查一遍 |

## 13. 下一阶段建议

1. **立即**：通知 AI-03 责任方修复 ai-v2.js require 断链（一行路径），恢复安全重启条件。
2. 纠正 564 行 dialog 文案与 1342 行注释至 E-08-11 口径（小改动，可与下一前端批次合并）。
3. AI UI 补全方向：ai-analysis 页接真实 API 或先摘除菜单；三违页可评估嵌入 AI 判断/建议入口。
4. 首例真实 company 三违事件出现后，按 §9 路径人工走查「录入 → 展示」端到端，即完成 BUSINESS_USABLE 的最终人工确认。

---

```text
PRODUCTION_WRITE=0
PRODUCTION_RESTART=0
DATABASE_MODIFIED=0
WPS_MODIFIED=0
CODE_MODIFIED=0

E08_UI01_STATUS=READY_FOR_NEXT_PHASE
```

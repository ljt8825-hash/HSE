# AI-08：HSE AI 智能分析中心 PC 端正式接入报告

> 执行方：Trae + DeepSeek V4 Flash
> 执行日期：2026-09-15
> 任务书：`# AI-08：HSE AI 智能分析中心 PC 端正式接入`
> 审核前置：AI-01～AI-05 PASS；AI-06 PASS；AI-07 PASS
> 状态：**PASS**（真实链路 35/35 全通过）

---

## 1. 执行摘要

AI-08 将 AI-06 结构化数据分析能力 + AI-07 异步任务能力正式接入现有 PC 端 HSE 系统（web-naive / Naive UI 2.44.1 / Vue 3 / Vben 5.7.0）。未新建平行架构、未修改菜单冻结结构、未触碰生产环境与 Workbuddy 保护域。

交付内容：

- **AI 入口审计**：确认 `/overview/ai-analysis` 已存在占位路由（`hse.ts` L61，菜单「AI 智能分析」），直接替换为真实 AI 智能分析中心，未新增/重命名任何一级菜单（§3/§4）。
- **页面（Naive UI）**：`views/hse/ai-analysis/index.vue` 完整实现——创建区（分析域/时间范围/分析方向/知识库开关）→ 任务列表（分页/状态过滤/降级标记）→ 详情 Drawer（基本信息 → 统计结果 → AI 分析 → Evidence）→ 辅助判断定位说明（§5/§9）。
- **API 接入**：`api/hse/ai.ts` 补齐 AI-07 analysis-tasks 四接口（create/get/list/cancel）+ AI v2 信封解包（success=false 抛错误码），页面主流程只走异步任务，不调用 AI-06 同步接口（§7）。
- **任务轮询**：2.5s 单 timer 轮询，仅 PENDING/RUNNING 激活，终态停止，页面离开清理，不允许重复 timer（§8）。
- **统计前置**：COMPLETED 先展示确定性统计（总记录/已整改/未整改/整改率/趋势/TOP/重复/聚集/未整改清单），AI 解释层在后（§11）。
- **降级**：AI 不可用（grok NOT_CONFIGURED / 空数据）→ 统计照常、任务 COMPLETED + degraded=true + 「当前 AI 分析服务暂不可用」明确提示，不伪装成功、不整页报错（§13）。
- **取消行为**：PENDING → CANCELLED（真取消）；RUNNING → 仅记录 `cancel_requested_at`，页面提示「已提交取消请求…」，绝不显示「已取消」（§14）。
- **Evidence**：数据依据（business_record）+ 知识依据（knowledge_base）按 source_type 分类真实展示（§12）。
- **测试**：**35/35 PASS**（Integration 20 + Route 6 + Frontend 9），含 1 次真实 Ollama qwen2.5:7b 闭环（77 条真实 hazard 数据，generationRecordId=15），报告数字与脚本输出逐项对应（§16/§17）。
- **数据库**：本阶段零 migration（仅 E2E 脚本按 id 自建自清测试任务，结束时已删除）；生产库零写入、零 `.env` 修改（§15/§18）。

核心链路（任务书 §5 目标流程，页面真实执行）：

```text
用户进入 AI 智能分析中心（/overview/ai-analysis）
    ↓ 选择分析对象/时间范围/分析方向/知识库 → 开始分析
POST /api/hse/ai/v2/analysis-tasks → 同步返回 PENDING（页面不阻塞）
    ↓ 列表/详情 2.5s 轮询
RUNNING → COMPLETED
    ↓
统计结果（确定性，前置）→ AI 分析（解释层，qwen2.5:7b）→ Evidence（数据依据/知识依据）
```

---

## 2. AI-01～AI-07 基线确认

执行前已读取 `AI智能分析实施进度.md` 及 AI-01～AI-07 报告/任务书（主进度文件存在，无伪造历史），并**实际检查 AI-07 后端代码**（`server/services/ai/tasks/`、`server/controllers/aiAnalysisTaskController.js`、`server/routes/ai-v2.js`）与前端 `api/hse/ai.ts` 现状，而非只信报告。

| 基线项 | AI-07 冻结状态 | AI-08 状态 |
|---|---|---|
| AI-07 任务模型 ai_analysis_tasks（23 列） | 开发库已建 | 只读复用，零结构改动 |
| 状态机 PENDING/RUNNING/COMPLETED/FAILED/CANCELLED/RETRYING | 已冻结 | 页面全量展示 6 态 |
| 幂等创建 request_hash | 已冻结 | 页面展示「已复用进行中的相同分析任务」提示 |
| aiAnalysisWorker 异步执行器 | 已冻结 | 未改动，E2E 复用 |
| AI-06 analysisService（统计/归一化/RAG/解析/Evidence） | 已冻结 | 页面只消费返回，未复制 analysisService2 |
| analysis-tasks 四端点 | 已冻结 | 前端封装 + 页面主流程真实调用 |
| AI v2 信封（success/error） | 已冻结 | 前端 unwrapAiEnvelope 解包 |
| 权限（写=admin/safety_manager，读=authenticated） | 已冻结 | 未改认证体系，前端按 401/403 实际处理 |
| hse.data.analysis Prompt | DRAFT（冻结） | 未改 ACTIVE |
| 菜单信息架构 | 已冻结 | 未改名/未新增一级菜单，仅替换占位页面 |

---

## 3. 当前菜单/路由审计

按任务书 §3 搜索 `overview/ai-analysis / ai-analysis / AI分析 / 智能分析 / 分析中心` 等关键词，实际检查路由模块：

- **路由文件**：`apps/web-naive/src/router/routes/modules/hse.ts` L61-62 已注册：

  ```ts
  name: 'HseAiAnalysis',
  path: '/overview/ai-analysis',
  component: () => import('#/views/hse/ai-analysis/index.vue'),
  ```

- **菜单**：一级菜单「总览（overview）」下二级菜单「AI 智能分析」（`$t('page.hse.aiAnalysis')`，icon `lucide:brain-circuit`，authority `admin`）——**已存在现成菜单入口**。
- **页面**：`views/hse/ai-analysis/index.vue` 原为占位页，本阶段直接替换为真实实现。
- **未做**：未新增一级菜单、未重命名菜单、未调整现有一级菜单、未把 AI 做成新的一级菜单。

结论：满足任务书 §4 菜单冻结原则——「直接把现有 placeholder 替换为真实 AI 分析中心」，无需 `[需要用户确认]`。

---

## 4. 当前 AI 页面审计

- 现有 AI 页面：`views/hse/ai-analysis/index.vue`（占位页，已替换）。
- 现有可复用组件：`components/hse/HsePageLayout.vue`（页面布局）、`components/hse/HseStatusTag.vue`（语义状态标签）——本页面复用。
- 现成 UI 组件：NCard/NDataTable/NSelect/NDrawer/NDrawerContent/NDescriptions/NStatistic/NList/NAlert/NEmpty/NSpin/NTag/NRadioGroup/NCheckboxGroup/NSwitch/NDivider/NSpace/NButton 均来自项目已用的 Naive UI，未新建组件体系。
- 现有 API：`api/hse/ai.ts` 已有 v2 health/providers/models/generate/analyze/stream，缺 analysis-tasks 四接口 → 本阶段补齐（§7）。
- 状态管理：未新建全局 AI Store，仅页面级 ref/reactive（任务书 §20）。

---

## 5. 页面设计

### 5.1 信息架构（对齐任务书 §28 建议布局，按项目 Naive UI 规范实现）

```text
AI 智能分析中心（HsePageLayout）
├─ NAlert 辅助判断定位说明（AI 仅辅助参考，人工为最终决策者）
├─ 创建分析任务（NCard）
│   ├─ 分析对象 NSelect：隐患分析 / hazard（inspection 未注册真实数据，不展示）
│   ├─ 时间范围 NRadioGroup：近7天/近30天/本月/上月/近3个月/近6个月/自定义（含起止日期换算展示）
│   ├─ 分析方向 NCheckboxGroup：趋势/高频问题/整改情况（文案「选择希望重点关注的分析方向」，不宣传只算选中项）
│   ├─ 知识库 NSwitch：useRag（说明：RAG 不可用时自动降级）
│   └─ [开始分析] NButton（loading 防重复提交）
├─ 分析任务（NCard + NDataTable）
│   ├─ 列：任务ID/分析对象/时间范围/创建时间/状态/降级/Provider·Model/耗时/操作（查看、取消）
│   ├─ 服务端分页（10/20/50）+ 状态过滤 + 刷新
│   └─ 取消按钮：终态（COMPLETED/FAILED/CANCELLED）禁用
└─ 任务详情（NDrawer 960px 右侧，resizable）
    ├─ 状态标签 + 降级标记 + 刷新
    ├─ 基本信息 NDescriptions：ID/类型/分析对象/时间范围/创建·开始·完成时间/耗时/Provider/Model/知识库开关/Generation Record
    ├─ 状态提示 NAlert（PENDING 等待执行 / RUNNING CPU 推理提示 / CANCELLED / FAILED 错误码+错误信息+可重试标记 / cancelRequestedAt 已提交取消请求）
    ├─ COMPLETED → 统计结果 NCard（NStatistic×6 + 趋势表 + TOP 分类/来源/组织/区域 + 重复问题 + 聚集分析 + 未整改清单 + 统计局限 NAlert）
    ├─ COMPLETED → AI 分析 NCard（八段式：摘要/关键发现/趋势分析/异常情况/高频问题/可能原因/管理建议/分析局限 + Provider/Model/耗时/Prompt 元信息）
    └─ COMPLETED → 分析依据 NCard（数据依据 business_record + 知识依据 knowledge_base）
```

### 5.2 设计要点（任务书核心约束落实）

- **统计前置、AI 在后**：详情 Drawer 中「统计结果」NCard 位于「AI 分析」NCard 之前（E2E 断言位置顺序）。
- **AI 辅助判断定位**：页面顶部 NAlert + HsePageLayout description 双重声明「AI 分析结果仅作为 HSE 管理辅助参考，不替代人工判断、调查、审核和最终决策」。
- **不展示后端未暴露字段**：AI-06/07 未返回 truncated/totalAvailable/analyzedRecords，页面不猜、不硬编码（§15 治理遗留）。
- **不为展示方便请求业务 records**：页面只消费 request/statistics/ai/evidence/status/error/metadata，任务表数据边界不变。

---

## 6. 实际修改文件

| 文件 | 变更 | 说明 |
|---|---|---|
| `apps/web-naive/src/api/hse/ai.ts` | 新增（本阶段） | AI-07 analysis-tasks 四接口 + AI v2 信封解包 + 类型定义（AiAnalysisTask/AnalysisTaskStatus/CreateAnalysisTaskParams 等） |
| `apps/web-naive/src/views/hse/ai-analysis/index.vue` | 重写（替换占位页） | AI 智能分析中心完整页面（Naive UI） |
| `server/scripts/ai08_analysis_task_e2e_check.cjs` | 新增 | AI-08 E2E 测试脚本（Integration/Route/Frontend 三套件） |

**未修改**：路由注册（复用既有 `/overview/ai-analysis`）、菜单、权限核心、登录/JWT、AI-06/07 后端逻辑、数据库结构、生产配置、Workbuddy 保护域。

---

## 7. API 接入

`api/hse/ai.ts`（同文件内补齐，未建平行 API 文件）：

```ts
// AI-07：analysis-tasks 异步分析任务（AI-08 PC 端正式接入）
export type AnalysisTaskStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'RETRYING';

export function createAnalysisTask(data)   // POST /hse/ai/v2/analysis-tasks → { task: {id,status,...}, reused }
export function getAnalysisTask(id)        // GET  /hse/ai/v2/analysis-tasks/:id → { task }
export function listAnalysisTasks(params)  // GET  /hse/ai/v2/analysis-tasks?page&pageSize&status → { list, total, page, pageSize }
export function cancelAnalysisTask(id)     // POST /hse/ai/v2/analysis-tasks/:id/cancel → { task, cancelled, cancelRequested, note }
```

- 四接口均 `responseReturn: 'body'` 取原始响应，经 `unwrapAiEnvelope` 解包：`success=true` 返回 payload；`success=false` 抛出携带 `code/provider/retryable` 的 Error（页面按错误码提示）。
- 页面主流程（创建/轮询/详情/取消）全部走 analysis-tasks，不调用 AI-06 同步 `analyze` 作为主流程。

---

## 8. 任务轮询机制

- **周期**：2500ms（任务书 §19 建议 2～3 秒）。
- **条件**：仅当列表存在 PENDING/RUNNING 任务时启动（`anyActiveTask()` → `syncPolling()`）；终态（COMPLETED/FAILED/CANCELLED）停止。
- **单 timer 守卫**：`startPolling` 内 `if (pollTimer) return;`，杜绝重复 timer。
- **清理**：`onUnmounted(() => stopPolling())`，组件卸载后不再请求、不再更新状态。
- **详情联动**：轮询 tick 同时刷新打开中的详情 Drawer（`detailOpen && detailId` 才刷新）。

---

## 9. UI 实现

- **技术栈**：Vue 3 + Vben 5.7.0 + Naive UI 2.44.1（与项目一致，未引入 Ant Design Vue / Element Plus）。
- **组件复用**：HsePageLayout、HseStatusTag（components/hse）；其余全部 Naive UI 现成组件。
- **类型安全**：`vue-tsc --noEmit` 真实执行，AI-08 变更文件（index.vue + ai.ts）0 错误（项目存在 60 处既有类型错误，属其他模块治理遗留，非本阶段引入，见 §16/§21）。
- **样式**：页面级 scoped 样式，无硬编码语义色（使用项目 token `--muted-foreground`）。

---

## 10. 权限

- 沿用 AI-07 既有权限：写=admin/safety_manager，读=authenticated user；未修改 authMiddleware/JWT/login/权限核心。
- 前端按 API 实际返回处理：401（未认证/无效令牌）、403（非写角色创建/取消被拒）由 request 拦截器与页面错误提示承接，页面不伪造降级路径。
- E2E 实测：401 ×2、403 ×2、读者读权限 200（§16）。

---

## 11. AI 结果展示

- 页面明确「统计是确定性的，AI 是解释层」：详情中统计结果区（NStatistic 汇总 + 趋势 + TOP + 重复 + 聚集 + 未整改清单）在 AI 分析区之前。
- AI 分析区固定按 AI-06 当前真实结构展示八段：summary / key_findings / trend_analysis / anomalies / high_frequency_issues / possible_causes / management_suggestions / limitations（仅展示非空段）。
- 元信息：Provider / Model / 耗时 / Prompt Key+Version 来自真实返回。
- 未增加任何「责任人/责任单位/违规认定/扣分建议/事故等级/处罚建议」等越权字段（任务书 §15）。
- 空段不渲染，无 NaN/undefined/Infinity（E2E 空数据用例逐层校验）。

---

## 12. Evidence 展示

详情「分析依据（Evidence）」NCard 按 `source_type` 分类：

- **数据依据（business_record）**：`evidence_text` + `evidence_strength` 标签（高/中/低），真实来自任务返回。
- **知识依据（knowledge_base）**：`source_field`（文档/章节名）+ `evidence_text`（相关内容）+ 强度标签；未使用知识库或 RAG 降级时显示「本任务未使用知识库或暂无知识依据」。
- 所有内容来自真实 API 返回，前端不编造依据。

---

## 13. AI unavailable 降级

- 场景实测：provider=grok（NOT_CONFIGURED，无 API Key）任务 → COMPLETED + `degraded=true` + `aiResult.available=false` + `errorMessage` 含「降级」；空数据任务 → COMPLETED + `degraded=true` + `AI_EMPTY_DATA`。
- 页面行为：统计结果照常展示；AI 分析区显示 NAlert「当前 AI 分析服务暂不可用，以下仍展示确定性统计结果」+ 实际错误状态（code/message）；不整页报错。
- 不把「AI unavailable」显示成「分析完成」：状态标签仍为 COMPLETED（任务执行完成），但 AI 区明确「暂不可用」。

---

## 14. 取消行为

- **PENDING → CANCELLED**（真取消）：E2E 实测任务 35 取消后状态=CANCELLED，note「任务已取消」。
- **RUNNING → 仅记录取消请求**：E2E 实测任务 34 取消后 status 仍 RUNNING、`cancelRequestedAt` 有值、`cancelled=false`、`cancelRequested=true`；任务最终照常 COMPLETED 且 `cancelRequestedAt` 保留。
- 页面交互：取消 RUNNING 前 Dialog 明示「AI 分析调用不可可靠中断，提交后将记录取消请求，任务完成后仍会保存结果」；取消成功后提示「已提交取消请求，当前 AI 分析仍在执行，完成后系统将更新任务状态」——不显示「已取消」。
- 详情区：`cancelRequestedAt` 非空时显示 NAlert「已提交取消请求（时间），当前 AI 分析仍在执行，完成后系统将更新任务状态」。
- 终态任务取消按钮禁用。

---

## 15. 截断数据风险

已核实 AI-06 实际代码：`server/services/ai/analysis/analysisDataAdapter.js`

```js
const MAX_RECORDS = 2000;                                  // L68
const limit = Math.min(Math.max(parseInt(input.limit) || 1000, 1), MAX_RECORDS);  // L130
```

- 确认存在 `MAX_RECORDS = 2000` 上限（db 只读模式 `LIMIT` 生效）。
- **AI-06/AI-07 当前 API 未向前端暴露 `truncated / totalAvailable / analyzedRecords` 截断标识**（fetchRawRecords 仅返回 records + MAX_RECORDS 常量，不返回是否截断/总量/已分析数）。
- AI-08 页面不猜、不硬编码截断提示，按任务书 §35 记录：

```text
[治理遗留]
后端存在最大记录数限制（MAX_RECORDS=2000），但 API 未向前端明确暴露截断状态
（无 truncated/totalAvailable/analyzedRecords 字段），前端无法识别当前任务是否
分析部分数据。本阶段不擅自修改 AI-06/07，建议后续 AI-09/AI-10 在分析服务层暴露
截断标识并同步前端展示。
```

---

## 16. 测试

执行 `server/scripts/ai08_analysis_task_e2e_check.cjs`（真实运行，5881 dev 后端 + 真实 worker + 真实 Ollama qwen2.5:7b + 真实 web-naive 源码/vue-tsc）。环境：dev 后端 5881、vite 5176、Ollama 11434、ai07_worker ×2（advisory lock 保证并发 ≤1）均运行中；5176 页面 HTTP 200（title=HSE 安全看板）。

### Integration（20 项）

1. 前提：分析范围存在真实 hazard 数据（只读 SELECT，2026-06-01~07-31 = 77 条）
2. 创建任务立即返回 PENDING（页面主流程）
3. 幂等复用（PENDING/RUNNING 同 hash → reused=true，同一任务 id）
4. 轮询到达 RUNNING（worker 领取）
5. 并发任务 B 创建为 PENDING（排队）
6. 取消 PENDING → CANCELLED（真取消）
7. 取消 RUNNING → 仅记录取消请求（不伪装已取消）
8. 轮询到达 COMPLETED（真实 AI 分析闭环）
9. 统计结果完整（summary/trend/top/duplicates/unrectified）
10. 真实 AI 结果完整（analysis 八段齐全，ollama/qwen2.5:7b）
11. Evidence 展示（business_record 数据依据）
12. generationRecordId 可读（AI 生成记录已落库 = 15）
13. RUNNING 取消请求保留且结果完成（cancelRequestedAt 不丢）
14. AI 不可用降级（grok）→ degraded=true、统计照常、AI 明确不可用
15. 空数据 → 统计为空 + AI 合理降级，无 NaN/undefined/Infinity
16. 历史任务列表（分页 + 当前用户）可读
17. 状态过滤（COMPLETED）正确
18. 任务详情（与列表一致）可读
19. 非法参数（缺 domain）→ 错误信封 + AI_INVALID_REQUEST
20. records 注入禁止（任务表不存业务记录）

### Route（6 项）

1. 401：未提供认证令牌
2. 401：无效令牌
3. 403：非写角色创建被拒
4. 403：非写角色取消被拒
5. 200：读者角色可访问列表（认证用户读权限）
6. 404 语义：任务不存在 → AI_TASK_NOT_FOUND

### Frontend（9 项）

1. 路由注册：/overview/ai-analysis 指向真实页面（复用占位路由）
2. 页面调用 analysis-tasks 四接口（AI-07 异步主流程）
3. 轮询机制：单 timer 守卫 / 终态停止 / onUnmounted 清理
4. 取消行为：RUNNING 仅提示已提交取消请求（不显示已取消）
5. 降级提示存在且统计（确定性）在 AI 之前展示
6. Evidence：数据依据/知识依据按 source_type 分类展示
7. 空数据：统计空态 + AI 不执行提示
8. API 层：AI v2 信封解包（success=false 抛错误码）
9. vue-tsc --noEmit：AI-08 变更文件 0 错误（既有错误记治理遗留）

---

## 17. 测试真实数字

脚本实际输出（非手工修改）：

```text
Integration: 20/20
Route: 6/6
Frontend: 9/9
Total: 35/35
Result: ALL PASS
```

关键真实数据：

| 项目 | 值 |
|---|---|
| 真实 AI 闭环 | 任务 34：77 条真实 hazard（2026-06-01~07-31），ollama / qwen2.5:7b，COMPLETED，degraded=false |
| 统计结果 | total=77，整改率 57.1%，trend granularity=monthly，summary/trend/top/duplicates/unrectified 齐全 |
| generationRecordId | 15（ai_generation_records 已落库） |
| 幂等复用 | 同 hash 活跃任务 → reused=true，任务 id 一致 |
| 取消 | PENDING→CANCELLED（任务 35）；RUNNING 仅 cancelRequestedAt（任务 34，保留至 COMPLETED） |
| 降级 | grok（NOT_CONFIGURED）→ degraded=true、统计照常、aiResult.available=false；空数据 → AI_EMPTY_DATA |
| 权限 | 401×2、403×2、读者读 200、404 AI_TASK_NOT_FOUND |
| vue-tsc | exit=2，totalErrors=60（既有，非 AI-08），ai08Errors=0 |
| 测试任务清理 | 脚本结束按 id 删除本次创建任务（34/35/36/37），零残留 |

---

## 18. Git 前后状态

- 执行前：`git status` 显示 183 个未提交条目（AI-01～AI-07 阶段积累 + Workbuddy 并行任务，与 AI-08 无关的文件未触碰）。
- 执行后（AI-08 相关变更）：
  - `M apps/web-naive/src/views/hse/ai-analysis/index.vue`（替换占位页）
  - `?? apps/web-naive/src/api/hse/ai.ts`（新增）
  - `?? server/scripts/ai08_analysis_task_e2e_check.cjs`（新增）
  - `?? server/scripts/ai07_worker.cjs`（AI-07 遗留新增，未归入本阶段交付）
- 未执行 git reset / checkout -- . / clean；未删除其他未提交修改。

---

## 19. Workbuddy 隔离检查

- 未修改：WPS / grid* / wpsGrid* / violations / ruleEngine / assessment / risk / accident / hse-tasks / training-ocr / `.workbuddy` 目录及 `views/site/violation/*`。
- 本阶段改动文件均位于 AI 专属区域（api/hse/ai.ts、views/hse/ai-analysis/、server/scripts/ai08_*），与 Workbuddy 并行任务（WPS 台账 + 三违）零交集。

---

## 20. 未完成事项

- 浏览器级可视化 E2E（Playwright/Tabbit 打开页面真实点击）未执行——本阶段采用「真实 API + 真实任务 + 源码断言 + vue-tsc」组合验证页面行为，任务书 §30 允许非浏览器 E2E，但若后续要求更高保真可补。
- 截断标识（truncated/totalAvailable/analyzedRecords）前端展示——依赖 AI-06/07 服务层暴露（§15 治理遗留）。
- 历史任务「重试」按钮——后端无重试端点，前端不伪造（任务书 §11）。

---

## 21. 风险

1. **[治理遗留] 截断不可见**：MAX_RECORDS=2000 存在但 API 无截断标识，AI-08 页面无法告知用户「分析部分数据」（§15）。建议 AI-09/AI-10 在分析服务层暴露。
2. **vue-tsc 全量 60 处既有类型错误**：分布在其他模块（assessment-* 等，AI-08 未引入、未修复）。修复需跨模块改动，本阶段不越界。
3. **CPU Ollama 单次分析耗时数十秒**：页面已用异步任务+轮询解耦，但多次任务排队时（并发 ≤1）任务完成时间叠加，属 AI-07 既有约束。
4. **多 worker 进程（×2）**：advisory lock 保证并发安全，但运维上建议后续收敛为单实例看护（AI-07 遗留）。

---

## 22. [需要用户确认]

无。任务书 §4 预置的菜单冲突未发生（既有 `/overview/ai-analysis` 直接复用），无其他需用户决策事项。

---

## 23. 下一阶段建议

- **AI-09（待 ChatGPT 审核）**：建议聚焦（1）分析服务层暴露截断标识（truncated/totalAvailable/analyzedRecords）并前端展示；（2）既有 vue-tsc 类型错误治理；（3）如业务需要，补充浏览器级 E2E（页面真实打开/点击/轮询时序录制）。严禁本阶段自行开展。
- AI-08 页面已具备真实可用闭环：创建→轮询→统计→AI→Evidence→取消/降级全链路可用，可作为后续 AI 报告、视觉分析等能力的前端承载入口。

---

## AI-08 最终状态

```text
AI-08 PASS（35/35 全通过）
```

- 现有 AI 页面/入口已审计，复用既有 /overview/ai-analysis 占位路由 ✓
- 未破坏菜单冻结结构 ✓
- PC 页面使用 Naive UI 2.44.1 ✓
- 真实调用 AI-07 analysis-tasks API（非同步主流程）✓
- 创建任务立即返回 PENDING，页面不阻塞 ✓
- 六状态（PENDING/RUNNING/COMPLETED/FAILED/CANCELLED/RETRYING 映射）展示 ✓
- 真实 AI 结果（qwen2.5:7b，八段齐全，generationRecordId=15）展示 ✓
- 统计（确定性）前置 + AI（解释层）分层展示 ✓
- Evidence（数据依据/知识依据）展示 ✓
- AI unavailable 正常降级（grok/空数据实测）✓
- RUNNING 取消不伪装已取消 ✓
- 轮询正确停止与清理（单 timer + onUnmounted）✓
- 历史任务可查看（列表/详情/过滤/分页）✓
- 权限行为正确（401/403/读者读）✓
- 生产环境零改动（0 migration / 0 写入 / .env 未动）✓
- Workbuddy 保护域零冲突 ✓
- 未创建第二套 AI 架构 ✓
- 测试真实执行且数字一致（35/35）✓

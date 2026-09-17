# MOBILE-06.5：生产上线最终闸门与 AI-03 联合变更评估报告

> Sprint 类型：Gate Sprint（只读审计，不执行生产上线）
> 执行日期：2026-09-15 07:46 – 08:0x (GMT+8)
> 项目：G:\hse-dashboard ｜ 生产 5876 ｜ DEV 5882 / safety_dashboard_dev
> 边界声明：本 Sprint 全程 `PRODUCTION_WRITE=0 / PRODUCTION_RESTART=0 / PRODUCTION_CONFIG_CHANGE=0 / PRODUCTION_DIST_PUBLISH=0 / WPS_CHANGE=0 / E-08-11_RULE_CHANGE=0 / PC_SANWEI_CHANGE=0 / MOBILE-05_BUSINESS_LOGIC_CHANGE=0`

---

## 一、执行摘要

本 Sprint 对 MOBILE-05 生产发布条件、AI-03 联合上线条件与 MOBILE-07 执行前置条件做了最终闸门评估，全程只读，生产零写入零重启。

核心结论：

1. **MOBILE-05 变更面干净**：四文件与报告完全一致，12 项安全检查全部通过；
2. **AI-03 可加载、可运行**：`ai-v2.js` 等 5 个入口模块实际 `require` 全部 LOAD OK，AI 依赖链 31 个相对 require 0 断链，app.js 108 个相对依赖 0 断链；DEV 实测 `/api/hse/ai/v2/health` 与 `/providers` 均 HTTP 200；
3. **⚠️ AI-03 是"移动目标"**：审计开始前 13–60 分钟内（06:42–07:33）AI-03/AI-05 多个文件仍在被并行会话修改，闸门结论基于"当前快照"，MOBILE-07 重启前必须复冻；
4. **⚠️ 联合重启列车比 MOBILE-05 大得多**：重启 5876 将同时加载 **24 个新变更文件**（MOBILE-05 + AI-03 v2 + AI-05 知识库 + aiService 等），非仅 MOBILE-05 一个文件；
5. **⚠️ 生产 `.env` 中 `GROK_API_KEY` 值为空**：AI Provider 状态为 NOT_CONFIGURED（安全降级、不 crash），AI 生成类功能在配置密钥前不可用；
6. **生产未受任何影响**：PID 3032（启动 09-14 21:30:56）早于全部待发布代码 → `MOBILE05_BACKEND_PUBLISHED = NO`；
7. **dist.zip 仍为旧构建**（503 项、无 M05 chunk）→ `DIST_ZIP_STATUS = REPACK_REQUIRED_AT_RELEASE`。

**最终判定：`MOBILE_PRODUCTION_GATE = READY_FOR_AUTHORIZATION`（待授权 ≠ 已授权）。**

---

## 二、MOBILE-05 变更面审计

### 2.1 变更范围核对（git + mtime）

| 文件 | 状态 | mtime（本地） | 与报告一致 |
|---|---|---|---|
| `server/routes/violations/main.js` | M（+80/-15） | 09-14 22:55:58 | ✅ |
| `src/views/mobile/violation/new.vue` | ??（新增 ~560 行） | 09-14 23:10:35 | ✅ |
| `src/router/routes/modules/mobile.ts` | M（+11） | 09-14 22:56:12 | ✅ |
| `src/views/mobile/index.vue` | M（+16） | 09-14 23:01:07 | ✅ |

四文件 mtime 与 MOBILE-06 审计时完全一致 → **MOBILE-06 审计后零新增修改，无未报告变更**。

### 2.2 变更面审计表（12 项）

| # | 检查项 | 结果 | 证据 |
|---|---|---|---|
| 1 | 仅 MOBILE-05 范围修改 | ✅ PASS | diff 规模 92+/15-，逐块核对一致 |
| 2 | 无额外未报告修改 | ✅ PASS | mtime 冻结于 MOBILE-06 审计时刻 |
| 3 | 无 debug/console.log/test token/test employeeId | ✅ PASS | grep 0 命中（main.js 仅 1 处 console.error 属错误日志惯例） |
| 4 | 无硬编码扣分 | ✅ PASS | 前端 0 处 score 赋值 |
| 5 | 无客户端责任推断 | ✅ PASS | 页脚明确「前端不做任何计算」，MOBILE-06 真机实测服务端计算 |
| 6 | 无 inspectorEmployeeId/checkerId/gridId 注入 | ✅ PASS | grep 0 命中 |
| 7 | 无姓名→employeeId 自动猜测 | ✅ PASS | violatorId 唯一来源=`selected.value.employee_id`（选择器点选） |
| 8 | checkSource 无默认值 | ✅ PASS | `ref<'' \| CheckSource>('')`；空值提交被前端拦截（「请选择检查来源」） |
| 9 | 前端只展示服务端扣分结果 | ✅ PASS | 双源取数仅读取 statusInfo/evidence-chain |
| 10 | grid_inspector 行级只读本人记录 | ✅ PASS | `guardOwnInspectedRecord` 挂载于 GET /:id 与 /:id/evidence-chain |
| 11 | POST 放行仅既定角色 | ✅ PASS | `requireRole('admin','safety_manager','grid_inspector')` |
| 12 | PUT/DELETE/list/stats/export 权限未扩大 | ✅ PASS | 全部保持 READ/WRITER 原状（grep 全端点核对） |

**变更面结论：MOBILE_CODE_READY = YES**

---

## 三、MOBILE-05 DEV 状态

- MOBILE-05 DEV 全链矩阵 8/8 PASS（MOBILE-05 报告）+ MOBILE-06 增补验证（CASE-E2 修正版、双端点越权 403、本人可读、业务拒绝、防重提交）全 PASS；
- MOBILE-06 真机 UI（真实 Chromium 移动视口 375/390/412）全 PASS，UI 级扣分闭环实测（赵书坤 -5.00 / 张卫新 -1.00）通过；
- 本 Sprint 未重复执行 DEV 业务矩阵（代码 mtime 未变，DEV 结论继承有效）。

**MOBILE_DEV_READY = YES**（注：MOBILE_REAL_DEVICE_UI 的实际证据为真实 Chromium 移动视口走查，不含实体手机摄像头验收，不再扩大解释。）

---

## 四、MOBILE-05 发布物状态

| 发布物 | 状态 | 证据 |
|---|---|---|
| `dist-m05/` | ✅ 含 M05 | `js/new-FdG5_XRR.js`、`js/bootstrap-Mb6gj-d3.js` 均含 MobileViolationNew 标记 |
| 生产 `dist/` | ✅ 未含 M05（未切换） | grep 0 命中 |
| `dist.zip` | ❌ 旧构建打包 | 503 项、无 `new-FdG5_XRR.js` → **DIST_ZIP_STATUS = REPACK_REQUIRED_AT_RELEASE** |
| `dist-ui01-backup/`、`dist-ui02/` | ✅ 历史备份保留 | 目录在位，未删除 |

**MOBILE_RELEASE_READY = YES**（仅评价 MOBILE-05 自身；dist.zip 需在发布时以 dist-m05 内容重新打包。）

---

## 五、AI-03 生产就绪度评估

### 5.1 模块加载（实际 require 执行）

| 模块 | 结果 |
|---|---|
| `routes/ai-v2.js` | ✅ LOAD OK（Express router） |
| `routes/ai-enhanced.js`（聚合入口） | ✅ LOAD OK |
| `routes/ai-knowledge.js`（AI-05） | ✅ LOAD OK |
| `services/ai/aiGateway.js` | ✅ LOAD OK |
| `services/ai/aiProviderRegistry.js` | ✅ LOAD OK |
| `services/ai/analysis/analysisService.js` | ✅ LOAD OK |

### 5.2 相对路径检查

- AI 依赖链（routes/ai-v2、ai-enhanced/main、aiV2Controller、services/ai 全家、ai-knowledge 链）共 **31 个相对 require，0 断链**；
- `ai-v2.js` 第 14 行 `require('../middleware/auth')` 路径正确（原断链已由 AI-03 会话修复）；
- `app.js` 全量相对依赖 **108 个，0 断链**（require.resolve 静态扫描）。

### 5.3 路由挂载检查（只读，app.js）

| 行号 | 挂载 | 说明 |
|---|---|---|
| 468 | `/api/hse/ai` → ai-enhancedRoutes | AI-02 聚合入口（09-13 重构版已在当前生产进程内运行） |
| 469 | `/api/hse/ai/v2` → aiV2Routes | **AI-03 本次新增** |
| 470 | `/api/hse/ai/v2/knowledge` → aiKnowledgeRoutes | AI-05 本次新增 |

### 5.4 运行时依赖逐项（DEV 5882 实测 + 静态检查）

| 依赖项 | 判定 | 证据/说明 |
|---|---|---|
| controller（aiV2Controller） | OK | require 加载 OK |
| service（services/ai 全家） | OK | 加载 OK + 0 断链 |
| middleware（auth.js requireRole） | OK | 路径正确、文件在位 |
| 配置读取（provider registry） | OK | 全部 env 均有 fallback |
| 数据库访问 | OK | 不在 require 期访问 DB（无顶层副作用，await 均在函数体内） |
| 外部 AI provider | **WARNING** | 生产 `.env` `GROK_API_KEY` **值为空**（长度 0）→ DEV 实测 providers 返回 NOT_CONFIGURED；安全降级不 crash，但 AI 生成类端点在配置密钥前功能不可用 |
| 环境变量依赖 | OK | 12 个 env 键全部有缺省值；`AI_ENABLE` 缺省=启用；生产 .env 已含 AI_PROVIDER/AI_TIMEOUT_MS/GROK_*/OLLAMA_* 键名 |
| 文件依赖 | OK | 全部相对路径可解析 |

**DEV 运行时探针**（自签 JWT）：
- `GET /api/hse/ai/v2/health` → **HTTP 200**，`aiEnabled:true, activeProvider:"grok"`
- `GET /api/hse/ai/v2/providers` → **HTTP 200**，grok 状态 NOT_CONFIGURED（与空密钥一致）
- （旧 `/api/hse/ai/provider/status` 为 POST 端点，GET 探测 404 属预期）

### 5.5 生产环境依赖风险清单

| 风险项 | 结论 |
|---|---|
| 依赖 DEV-only 环境变量 | ❌ 无（12 键均有缺省） |
| 硬编码 localhost | ⚠️ 仅 1 处：Ollama fallback `http://localhost:11434`（env 可覆盖，属常规缺省） |
| 硬编码 DEV 端口 5882 | ❌ 无 |
| 硬编码测试数据库 | ❌ 无 |
| 测试 token / 测试 employeeId | ❌ 无 |
| 启动时立即执行危险操作 | ❌ 无（无 require 期 DB/FS/网络副作用） |
| 启动阶段访问不存在资源 | ❌ 无（108 依赖 0 断链） |
| 改变现有 HSE 路由行为 | ❌ 无（仅新增挂载，不改既有路由） |
| ai-enhanced 6 端点重构对齐 | ✅ 6/6 路由名一致（generate-report/root-cause/records/records/:id DELETE/provider/status）；行为级对齐未逐行验证（AI-02 范畴，且重构版已在当前生产进程运行，非本次新增风险） |

### 5.6 AI-03 与 MOBILE-05 联合重启风险

**问题：如果现在重启生产 5876，除 MOBILE-05 `main.js` 外哪些新代码会被同时加载？**

依据"mtime 晚于当前生产进程启动时间（09-14 21:30:56）"递归扫描 app.js 依赖树，**去重后 24 个文件**将首次进入生产运行实例：

- **MOBILE-05（1）**：`routes/violations/main.js`
- **AI-03 v2（8）**：`routes/ai-v2.js`、`controllers/aiV2Controller.js`、`services/ai/aiGateway.js`、`aiProviderRegistry.js`、`aiPromptRegistry.js`、`analysis/analysisService.js`、`analysisDataAdapter.js`、`analysisNormalizer.js`、`analysisStatistics.js`、`analysisPromptBuilder.js`
- **AI-05 知识库（10）**：`routes/ai-knowledge.js`、`controllers/knowledgeController.js`、`services/ai/knowledge/{retriever,knowledgeSourceService,knowledgeDocumentService,knowledgeParser,knowledgeChunker,embeddingService,vectorStore,ragService,ragContextBuilder}.js`
- **其他（4）**：`app.js`（06:46 修改）、`services/aiService.js`（09-14 23:42 修改，legacy AI 服务）、以及 aiV2Controller/aiGateway 等的连带更新

（注：ai-enhanced 重构版 main.js mtime=09-13，已在当前 3032 进程内，不属本次新增列车。）

```text
AI03_RESTART_RISK = MEDIUM
```

依据：
1. **列车规模**：一次重启同车 24 个新文件（MOBILE-05 仅占 1 席），回滚粒度不再"单文件"；
2. **移动目标**：`analysisPromptBuilder.js` mtime=07:33（本审计开始前 13 分钟）、ai-v2.js/aiV2Controller=07:09 → AI-03 会话极近期仍在活动，快照随时可能失效；
3. **GROK_API_KEY 为空**：AI 写端点功能不可用（fail-safe），若业务期待 AI 功能可用则需先配密钥；
4. **缓解因素**：全部模块 LOAD OK、0 断链、无启动副作用、env 全有缺省、AI 端点独立挂载不影响既有 HSE 路由、AI-02 重构版已在生产进程运行。

**AI03_PRODUCTION_READY = YES**（基于当前快照的技术就绪判定；附带上文 4 条 WARNING，其中"移动目标"要求 MOBILE-07 重启前复冻验证。）

---

## 六、生产当前状态（只读）

| 项 | 值 |
|---|---|
| health | HTTP 200，`status:"ok"`，`environment:"development"`（既有现象，登记观察） |
| PID | **3032**（netstat 确认 LISTENING） |
| 启动时间 | **2026-09-14 21:30:56**（health uptime≈37255s 反推） |
| uptime | ≈10.35 小时 |

**是否仍是旧进程：是。** MOBILE-05 `main.js` mtime（09-14 22:55:58）晚于进程启动时间：

```text
MOBILE05_BACKEND_PUBLISHED = NO
```

（"代码存在"≠"生产已上线"。生产数据库本 Sprint 零写入，未做任何查询以外操作。）

---

## 七、前端发布物（同第四节）

- `dist-m05/`：含 M05 chunk ✅，可直接由生产 SPA 托管；
- 生产 `dist/`：未含 M05，未切换 ✅；
- `dist.zip`：**REPACK_REQUIRED_AT_RELEASE**（本 Sprint 不重打包、不发布；发布时应以 dist-m05 内容重新打包并校验 chunk 清单）。

---

## 八、后端发布物

- MOBILE-05 后端唯一发布文件 = `server/routes/violations/main.js`；
- 该文件当前未进入生产运行实例（第六节）；
- 发布时执行顺序（本 Sprint 未执行）：backup 当前生产版 main.js + 记录 hash → 替换为 MOBILE-05 版 → 重启 5876（经计划任务 HSE-Backend-5876）→ health 验证。

---

## 九、回滚方案（文件级只读确认）

```text
BACKEND_ROLLBACK = AVAILABLE   # main.js 单文件：备份→替换→重启即回滚（附加列车文件见第十一节风险说明）
FRONTEND_ROLLBACK = AVAILABLE  # 生产 dist 未切换 → 不切换即回滚，前端零动作
```

历史备份目录 `dist-ui01-backup/`、`dist-ui02/` 均在位未删除。

⚠️ 回滚注意：由于联合列车含 24 文件（AI-03/AI-05 未跟踪新文件），若重启后出现 AI 侧故障，最小回滚 = 恢复 main.js + 在 app.js 注释 469/470 两行挂载（或按 AI-03 会话提供的开关方案），需在 MOBILE-07 方案中预先明确。

---

## 十、技术债务登记（只登记，不修改）

### 债务 A：服务端 violatorId 非必填

```text
SERVER_VIOLATOR_ID_REQUIRED = TODO
```

- `violationService.create` 当前允许 `violatorId=NULL` 创建（MOBILE-06 取证记录 7600，已清理）；
- PC 与手机 API 均受影响；手机前端已强制点选人员，实际暴露面有限；
- **不阻断 MOBILE-05 手机端上线**；后续独立 Sprint 修复。

### 债务 B：服务端无幂等键

```text
SERVER_IDEMPOTENCY = TODO
```

- 客户端有 phase 锁防重复提交（MOBILE-06 真机三连击实测仅 1 条）；
- 服务端连续 POST 仍产生多条记录（IDEMPOTENCY 取证 2 条）；
- 非 MOBILE-05 回归；后续独立 Sprint。

---

## 十一、生产上线前置条件（进入 MOBILE-07 前）

1. **复冻验证**（必须）：AI-03 文件审计前 13–60 分钟仍在修改；MOBILE-07 开工时必须重跑本报告 §5.1/§5.2 加载与断链检查，并确认 AI-03 会话已收口；
2. **联合列车声明**（必须）：MOBILE-07 方案必须明确声明 24 文件同车上线（AI-03 v2 + AI-05 知识库 + aiService 等），不得表述为"仅上线 MOBILE-05"；
3. **dist.zip 重打包**（必须）：以 dist-m05 内容重新打包并校验 chunk；
4. **AI 配置决策**（建议）：GROK_API_KEY 置值或明确接受 AI 功能降级上线（NOT_CONFIGURED 不影响进程安全）；
5. **AI 故障回滚预案**（建议）：预先写明 app.js 469/470 挂载的摘除步骤；
6. **main.js 备份 + hash**（必须）：替换前执行；
7. **生产 .env 不改动**（除 4 项用户授权决策外）。

---

## 十二、最终状态矩阵

```text
MOBILE_CODE_READY      = YES
MOBILE_DEV_READY       = YES
MOBILE_RELEASE_READY   = YES
AI03_PRODUCTION_READY  = YES      # 基于 2026-09-15 07:46–08:0x 快照；附 4 条 WARNING（移动目标/空密钥/列车规模/行为级对齐未逐行验证）
MOBILE_PRODUCTION_GATE = READY_FOR_AUTHORIZATION
MOBILE_06_5_STATUS     = PASS
```

四维度状态：

| 维度 | 状态 |
|---|---|
| 代码完成 | ✅ 完成（变更面 12/12 干净） |
| DEV 验证 | ✅ 通过（矩阵 8/8 + 增补 + 真机 UI） |
| 真机验证 | ✅ 通过（Chromium 移动视口 375/390/412；不含实体手机摄像头验收） |
| 生产上线准备 | 🟡 READY_FOR_AUTHORIZATION（技术就绪，待用户授权 + 前置条件 1–3 落实） |

---

## 十三、下一阶段建议

1. **MOBILE-07（生产上线执行）**：待用户明确授权后执行，方案须包含第十一节全部前置条件；
2. **独立 Sprint**：SERVER_VIOLATOR_ID_REQUIRED、SERVER_IDEMPOTENCY；
3. **AI-03 会话收口确认**：建议用户确认并行 AI-03 会话已全部完成，再冻结代码进入 MOBILE-07；
4. **AI 功能配置**：GROK_API_KEY 配置决策；
5. **观察项（继承）**：health `environment:"development"`（NODE_ENV 未设 production）、周期 53 辞职 target、来源不明进程 30660、_e0810_real_event_observer.cjs 旧口径。

---

*本报告为 MOBILE-06.5 Gate Sprint 正式项目记录。全程只读，生产零写入零重启零配置变更。*

---

## 附录：午后变更补充（2026-09-15 16:3x 追加，非晨间快照内容）

触发：DEV 后台任务 6eoRJP（5882 后端）退出通知 → 排查发现 AI-03 会话午后仍在活动。

| 事实 | 内容 |
|---|---|
| ai-v2.js 再次修改 | mtime **14:40:05**（晨间审计时为 07:09）；端点 7 → **15**（新增异步 analysis-tasks 任务体系：create/get/list/cancel/management-suggestions 等） |
| 新增文件 | `controllers/aiAnalysisTaskController.js`（14:42）及其配套 service |
| 最新加载测试 | `require('./routes/ai-v2.js')` **LOAD OK**（14:40 版本实测） |
| 404 证据 | 过期 5882 进程（昨夜启动、未加载午后代码）在 16:22–16:25 被 PS 5.1/7.6.6 及 Chrome 探测 `/api/hse/ai/v2/analysis-tasks` → 404；属进程过期而非代码缺失 |
| DEV 环境状态 | **5882 后端已停止**（后台任务收尾退出）；MOBILE-07 复冻验证时需以标准 env 重启 |
| 联合列车 | 较晨间 24 文件快照进一步扩大（至少 +2：aiAnalysisTaskController 及其 service） |

对晨间结论的影响：

- 闸门判定逻辑不变——`AI03_PRODUCTION_READY=YES` 本就基于「当前快照 + 重启前复冻」前提；
- **「移动目标」WARNING 权重升级**：AI-03 会话截至 14:42 仍在改代码且未见收口，MOBILE-07 开工前的复冻验证（§5.1/§5.2 重跑）从「建议必须」升级为「绝对前置」，且应先向用户确认 AI-03 会话已完成；
- 本附录不改写晨间状态矩阵（`MOBILE_06_5_STATUS=PASS` 维持），复冻结果以 MOBILE-07 记录为准。

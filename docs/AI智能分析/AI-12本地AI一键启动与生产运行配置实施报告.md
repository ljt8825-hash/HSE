# AI-12 本地 AI 一键启动 / 生产运行配置实施报告

> 阶段：AI-12（本地 AI 可运行性、启动管理、健康检查、异常诊断、长期运行配置、生产化准备）
> 执行方式：先审计 → 再设计 → 最小修改 → 真实验证 → 写报告
> 报告时间：2026-09-15
> 关联文档：《AI本地一键启动运行说明.md》《AI本地生产运行配置说明.md》

---

## 1. 审计前状态

| 组件 | 审计前状态 |
|------|-----------|
| 统一启动入口 | **不存在**——Ollama/Backend/Frontend 需人工分别启动，无依赖检查、无健康确认 |
| 统一健康检查 | **不存在**——无系统化检查脚本，仅有零散 curl/浏览器人工验证 |
| Ollama | 运行中（11434），经 winget 便携版（DBX）拉起 `G:\ollama\ollama.exe serve` |
| 模型 | `qwen2.5:7b`、`nomic-embed-text` 均已安装（此前 AI-04 建设） |
| PostgreSQL | 运行中（5432），`safety_dashboard`；pgvector 0.8.2；AI 7 表齐全（AI-11 后含 ai_generation_reviews） |
| Backend | 生产 5876 由 `HSE-Backend` 计划任务（SYSTEM）管理；无开发栈标准启动脚本 |
| AI Worker | `server\scripts\ai07_worker.cjs` 存在，**未挂载 app.js**，需独立进程启动 |
| Frontend | `apps/web-naive`，vite dev 5173；代理目标硬编码（/api→5882、uploads→5876） |
| 超时链 | `AI_TIMEOUT_MS=60000`（.env）与 CPU qwen2.5:7b 真实耗时（几十秒~超 60 秒）不匹配 |

结论：运行层四缺（无统一入口、无统一检查、无停止脚本、无生产运行说明），符合本阶段建设目标。

---

## 2. 实际项目启动结构

```text
Frontend:      安全看板vben\apps\web-naive  （vite dev，开发 5173；生产 = build + Nginx）
Backend:       server\app.js                （Express；开发 5888；生产 5876 = HSE-Backend 计划任务）
Ollama:        G:\ollama\ollama.exe serve   （11434；DBX 便携版拉起，非 Windows Service）
PostgreSQL:    127.0.0.1:5432 / safety_dashboard / pgvector 0.8.2
AI API:        /api/hse/ai/v2/*（health / generate / knowledge / analysis-tasks / reviews）
AI Analysis Page: 菜单「AI智能分析」，路由 /overview/ai-analysis（admin/safety_manager）
AI Worker:     server\scripts\ai07_worker.cjs（独立进程，PG advisory lock 并发 ≤1）
```

实测端口（2026-09-15 17:05）：

```text
Frontend:  http://127.0.0.1:5173
Backend:   http://127.0.0.1:5888（开发栈，一键启动）
Ollama:    http://127.0.0.1:11434
PostgreSQL: 127.0.0.1:5432
AI API:    http://127.0.0.1:5888/api/hse/ai/v2/health
AI Analysis Page: http://127.0.0.1:5173/overview/ai-analysis
```

---

## 3. Ollama 当前运行方式

- 运行形态：**DBX 便携版**（winget `Ollama.Ollama.Portable`），由 `dbx.exe` 拉起 `G:\ollama\ollama.exe serve`，监听 11434
- 非 Windows Service；非计划任务；依赖 DBX 自启或手动 `ollama serve`
- 端口冲突风险：此前存在 TRAE 父进程覆盖 `OLLAMA_HOST` 的记录；本阶段启动/检查脚本一律以 `http://127.0.0.1:11434` 显式访问，不受影响
- 本阶段处理：启动脚本**只检查不拉起**（Ollama 未运行时明确报错并提示启动方式），避免重复实例

---

## 4. 模型状态

| 模型 | 用途 | 状态 | 验证方式 |
|------|------|------|----------|
| `qwen2.5:7b` | 推理 | 已安装 | `/api/tags` + 真实生成冒烟（17:05 实测 response 含 HSE_AI_OK） |
| `nomic-embed-text` | 向量嵌入 | 已安装 | `/api/tags` 存在 |

策略：脚本默认**不自动 pull**（避免无提示下载大模型）；缺失时输出 `[ERROR] 缺少模型 xxx，请先执行 ollama pull`。

---

## 5. Backend 启动方式

- 开发栈：一键启动脚本以 `node app.js` 拉起，**进程级**注入 `PORT=5888`、`AI_PROVIDER=ollama`、`AI_TIMEOUT_MS=300000`（**不修改 server\.env**）
- 就绪判定：轮询 `/api/health` 返回 200（最长 90 秒），不只判断进程存在
- 生产：5876 由 `HSE-Backend` 计划任务（SYSTEM）管理，**本阶段零触碰**
- 关键修复：`set "AI_PROVIDER=ollama"` 带引号赋值，消除尾部空格导致 Provider 注册表查找失败（`activeProvider=null`）的问题——已实测修复后 `activeProvider=ollama`

---

## 6. Worker 启动方式

- 独立进程：`server\scripts\ai07_worker.cjs`（**未挂载 app.js**，保持独立，避免多 Backend 实例重复启动）
- 一键启动自动拉起；已存在命令行含 `scripts\ai07_worker.cjs` 的 node 进程则复用（不产生多个 Worker）
- 并发控制：PostgreSQL advisory lock，全局并发 ≤1
- 生产建议：独立计划任务托管（放行后配置），见《AI本地生产运行配置说明.md》§5

---

## 7. Frontend 启动方式

- 实际前端：`安全看板vben\apps\web-naive`（**非 web-antd**）
- 开发：vite dev（`--mode development --host 127.0.0.1 --port 5173 --strictPort`），一键启动自动拉起，冷启动等待最长 180 秒
- 代理：vite.config.ts 支持 `VITE_PROXY_TARGET` / `VITE_UPLOADS_PROXY_TARGET` 环境变量覆盖；一键启动注入指向本栈后端 5888；**未设置时保持原默认值（5882 / 5876），行为不变**

---

## 8. 一键启动方案

入口：`G:\hse-dashboard\start-hse-ai.bat` → `start-hse-ai.ps1`

```text
[1/7] 环境检查（Node/pnpm/结构/依赖）→ [2/7] PostgreSQL → [3/7] Ollama（HTTP）
→ [4/7] 模型 → [5/7] Backend（等 /api/health）→ [6/7] Worker → [7/7] Frontend（等 HTTP 200）
→ 收尾自动执行健康检查
```

关键设计：

- **幂等**：重复执行识别 `Already running` 并复用（端口监听 + HTTP 探活双确认）
- **端口契约**：开发 5888/5173 可环境变量覆盖；**5876 硬禁止**（脚本内显式拦截）
- **环境隔离**：进程级注入 AI 变量，不改 `.env`；不触碰生产数据库表
- **日志**：组件级时间戳输出（`[OK]/[WARN]/[ERROR]`），失败不闪退、给出处置指引
- 停止脚本 `scripts\stop-hse-ai.ps1`：仅停开发栈（Worker/5888/5173），生产 5876/PostgreSQL/Ollama 不触碰；执行前列清单并请求确认（-Force 跳过）

---

## 9. 健康检查方案

脚本：`scripts\hse-ai-health.ps1` + 只读 DB 探针 `server\scripts\ai12_runtime_probe.cjs`

11 项检查（2026-09-15 17:05 实测，exit 0，HSE LOCAL AI READY）：

```text
Node              [OK]  v22.16.0
PostgreSQL        [OK]  127.0.0.1:5432 监听中
Ollama            [OK]  127.0.0.1:11434 可达
qwen2.5:7b        [OK]  已安装
nomic-embed-text  [OK]  已安装
Backend           [OK]  HTTP 200, db=connected, ai=ollama
AI v2 Health      [OK]  activeProvider=ollama, available=true
RAG capability    [OK]  sources API OK; pgvector 0.8.2 + 7 AI 表 OK
AI Analysis API   [OK]  total=2
Frontend          [OK]  http://127.0.0.1:5173 HTTP 200
AI Generate Smoke [OK]  model=qwen2.5:7b, response 含 HSE_AI_OK
```

- 冒烟测试：真实调用 `qwen2.5:7b`（极短 Prompt `请仅返回：HSE_AI_OK`，num_predict=24，超时 120 秒），**不写业务库、不建 generation record / 分析任务**
- 只读 JWT：`server\scripts\_ai12_token.cjs` 独立生成探测令牌（users.id=1 真实用户），绕过命令行引号解析问题
- 退出码：0=全部 OK / 1=有 SKIP/WARN / 2=有 FAIL

---

## 10. 故障诊断方案

| 域 | 覆盖场景 | 输出 |
|----|----------|------|
| Ollama | 11434 未监听 / 模型缺失 / 加载失败 / 进程退出 | 健康检查 [3][4][5] FAIL + 处置指引 |
| Backend | Node 启动失败 / .env 错误 / PG 连接失败 / AI v2 路由失败 | Backend 窗口日志 + 健康检查 [6][7] |
| AI | MODEL_NOT_FOUND / UNREACHABLE / TIMEOUT / AUTH_ERROR / ERROR / DISABLED | 统一错误模型透出 |
| Worker | 未启动 / 长期 PENDING / RUNNING 卡死 / 重复 Worker | DB 探针任务状态分布（pending/running/failed）+ advisory lock 说明 |
| Frontend | 未启动 / API 地址错误 / CORS / 页面无法加载 | 健康检查 [10] + 代理配置核对 |

统一入口：健康检查输出即诊断报告；详见《AI本地一键启动运行说明.md》§10。

---

## 11. 生产运行方案

- 生产端口/进程：Backend 5876 = `HSE-Backend` 计划任务（SYSTEM，实证 10 秒自动拉回）；前端 = build + Nginx；Worker = 独立计划任务（放行后配置）
- 启动顺序：PostgreSQL → Ollama → Backend → Worker → Frontend/Nginx
- 停止顺序：Frontend/Nginx → Worker → Backend → Ollama（PostgreSQL 视架构决定）
- 配置原则：**禁止复制开发 .env**；生产独立配置 `AI_PROVIDER / OLLAMA_BASE_URL / OLLAMA_MODEL / AI_TIMEOUT_MS / DB_*`
- 长期运行：推荐**方案 B 任务计划程序**（项目已实证）+ 方案 A Windows Service（Backend/Worker 服务化）；不引入 PM2
- 本阶段**未修改生产服务器 / 生产 .env / 生产库**；放行清单见《AI本地生产运行配置说明.md》§6

---

## 12. 修改文件清单

| 文件 | 修改原因 | 修改内容 |
|------|----------|----------|
| `start-hse-ai.ps1` | 建立统一启动入口（Runtime-01） | 7 步链路：环境/PostgreSQL/Ollama/模型检查 + Backend/Worker/Frontend 启动 + 幂等复用 + 5876 硬禁止 + 进程级 AI 变量注入（带引号赋值修复 Provider 匹配） |
| `start-hse-ai.bat` | 双击入口（BOM/UTF-8 安全） | `chcp 65001` + 调用 ps1 |
| `scripts\stop-hse-ai.ps1` | 一键停止（仅开发栈） | 停止 Worker/Backend/前端进程，生产 5876/PostgreSQL/Ollama 不触碰；列清单 + 确认 |
| `scripts\hse-ai-health.ps1` | 统一运行检查（Runtime-02） | 11 项健康检查 + 真实 qwen2.5:7b 冒烟测试 + 退出码语义 |
| `server\scripts\ai12_runtime_probe.cjs` | 健康检查只读 DB 探针 | SELECT 只读：db/pgvector/7 表/任务状态分布/生成记录数 |
| `server\scripts\_ai12_token.cjs` | 探测 JWT 生成 | 独立脚本输出只读探测令牌（避免命令行引号问题） |
| `server\scripts\_ai12_audit_db.cjs` | 数据库表审计（审计阶段） | 只读核对 AI 7 表存在性 |
| `安全看板vben\apps\web-naive\vite.config.ts` | 前端代理可被一键启动覆盖 | `/api` 与 uploads 代理目标支持 `VITE_PROXY_TARGET` / `VITE_UPLOADS_PROXY_TARGET`，未设置时保持原默认值 |

---

## 13. 未修改文件

以下 Workbuddy 保护区域与业务域**零触碰**（本阶段未修改）：

```text
WPS：grid_record_sync_map / grid_inspection_records / grid_areas / wps_account_employee_map /
     routes/wps-grid-sync.js / routes/wps-dbsheet.js / services/wpsGridSyncService.js /
     wpsGridSyncScheduler.js / wpsGridPullEngine.js / wpsGridMigrationService.js / services/wps/*
三违/规则：violationService.js / violationCheckerScope.js / violationController.js /
     routes/violations/* / ruleEngine/* / sanwei* / gridViolationCandidateService.js /
     gridAttributionService.js / gridScope.js / gridCompletionService.js / violation-rule.json
登录/JWT/权限：登录页 / auth store / JWT 逻辑 / 权限模型 / users / employee / employee_assignment
其他：考核 / 风险 / 事故 / HSE任务 / 培训OCR / .workbuddy 配置
生产：server\.env（生产）未改；生产库未迁移；生产 5876 未启停；WPS 反向写未调用
```

---

## 14. 测试结果（真实执行）

### Test 1~8（健康检查链路，2026-09-15 17:05 实测）

| # | 项目 | 结果 | 证据 |
|---|------|------|------|
| 1 | Ollama 已运行 | PASS | /api/tags 可达（health [3] OK） |
| 2 | qwen2.5:7b 可用 | PASS | health [4] OK（已安装） |
| 3 | nomic-embed-text 可用 | PASS | health [5] OK（已安装） |
| 4 | Backend 可启动 | PASS | 5888 /api/health HTTP 200（health [6] OK, db=connected） |
| 5 | AI v2 health 正常 | PASS | activeProvider=ollama, available=true（health [7] OK） |
| 6 | 真实 qwen2.5:7b generate | PASS | 冒烟 response 含 HSE_AI_OK（health [11] OK，直接调 Ollama 不写库） |
| 7 | Frontend 可启动 | PASS | 5173 HTTP 200（health [10] OK） |
| 8 | AI 智能分析页面可访问 | PASS | `/overview/ai-analysis` HTTP 200（SPA 路由；菜单「AI智能分析」admin/safety_manager） |

### Test 9（最小真实 AI 分析任务）

| 项目 | 值 |
|------|-----|
| task id | 69（DATA_ANALYSIS / hazard） |
| status | COMPLETED（16:28:04 → 16:28:06，统计路径快速完成） |
| generation record | 历史真实生成记录 14 条，近 8 条（id 11~18）provider=ollama / model=qwen2.5:7b / status=success |
| 残留 | 测试数据未清理需求（任务 20/69 为真实验证任务，保留可追溯；未写任何业务表） |

### 一键启动四次验收

| 轮次 | 场景 | 结果 |
|------|------|------|
| 第 1 次 | 冷启动（Ollama/Backend/Frontend/Worker 全停） | PASS——全链路按序拉起，健康检查 AI READY |
| 第 2 次 | 再次执行 | PASS——`Already running` 复用，无重复 Ollama/Worker/端口冲突 |
| 第 3 次 | 关闭 Ollama 后健康检查 | PASS——Ollama/AI Generate FAIL，Backend/Frontend 保持 OK，系统不崩溃 |
| 第 4 次 | 恢复 Ollama 后健康检查 | PASS——11/11 OK，exit 0，AI READY（17:05 实测记录） |

### 关键回归：AI_PROVIDER 引号修复

修复前：`set AI_PROVIDER=ollama && ...` 产生尾部空格 → `activeProvider=null`（Provider 注册表查找失败）。
修复后：`set "AI_PROVIDER=ollama"` → 实测 `activeProvider=ollama`、`available=true`。

---

## 15. 已知限制

1. **CPU 推理速度**：qwen2.5:7b 无 GPU，单次生成几十秒、复杂分析可超 60 秒、冷启动更慢；`AI_TIMEOUT_MS=300000`（开发栈进程级）为验证值，生产保持 ≥300000，**未**盲目改小 `.env` 的 60000
2. **Worker 生产启用**：本阶段仅开发栈一键启动拉起 Worker；生产 Worker 计划任务需放行后配置
3. **Ollama 形态**：本机为 DBX 便携版（非 Windows Service）；生产建议独立服务账号 + 自启，属放行事项
4. **生产 .env 未切换**：生产 AI Provider 现状以实际配置为准，本阶段零触碰；切换 ollama 需用户授权
5. **生产数据库迁移**：AI 表生产迁移（含 ai_generation_reviews）需独立授权，不随应用自动执行
6. **vite.config.ts 默认值**：保持 5882/5876（未设置环境变量时行为不变）；一键启动场景由环境变量覆盖
7. **前端生产托管**：Nginx 配置模板本阶段未交付（属生产放行任务）
8. **历史遗留**：vue-tsc 60 处历史错误（非本阶段引入，不修复）；AI-05 57/57 vs 51 历史矛盾保留

---

## 16. 最终结论

```text
PASS WITH CONDITIONS
```

- **PASS**：本阶段 7 项核心能力（统一启动 / 统一健康检查 / 一键停止 / 真实冒烟 / 故障诊断 / 生产运行说明 / 前端入口确认）全部交付并真实验证；一键启动四次验收通过；健康检查 11/11 OK（exit 0）；生产边界与 Workbuddy 保护区域零触碰。
- **CONDITIONS（放行前必须满足）**：
  1. 生产 Worker 计划任务与生产 AI Provider（ollama）切换需用户独立授权（当前生产未启用）
  2. 生产数据库 AI 表迁移需独立授权执行
  3. 生产 Ollama 建议服务化/自启（当前为 DBX 便携版）
  4. 生产前端 Nginx 托管配置属后续放行任务
  5. CPU 环境复杂分析耗时可能超过 300 秒，生产超时配置需按实测复核

---

*报告完成。按任务书纪律：执行完毕即停止，不自行进入 AI-13，等待下一步审计。*

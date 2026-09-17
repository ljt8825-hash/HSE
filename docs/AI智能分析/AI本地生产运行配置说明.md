# AI 本地生产运行配置说明

> 适用：将 HSE + 本地 AI（Ollama / qwen2.5:7b / nomic-embed-text）从开发栈升级为生产长期运行。
> 关联：AI-12 本地 AI 一键启动 / 生产运行配置；操作说明见《AI本地一键启动运行说明.md》。
> ⚠️ 本说明为**配置指引**，不直接修改生产服务器；任何生产变更需用户独立授权后执行。

---

## 一、系统组件

| 组件 | 说明 | 开发栈端口 | 生产端口/形态 |
|------|------|-----------|--------------|
| HSE Frontend | `安全看板vben\apps\web-naive`（Naive UI） | 5173（vite dev） | 构建产物 + Nginx 静态托管 |
| HSE Backend | `server\app.js`（Express） | 5888（一键启动） | **5876（HSE-Backend 计划任务，SYSTEM 管理）** |
| AI Worker | `server\scripts\ai07_worker.cjs` | 独立进程（一键启动拉起） | 独立进程 / 计划任务，并发 ≤1（PG advisory lock） |
| PostgreSQL | `safety_dashboard` 库 + pgvector | 5432 | 5432（生产实例，独立账号） |
| Ollama | DBX 便携版（本机） / 独立服务 | 11434 | 11434（专用服务账号运行） |
| qwen2.5:7b | 推理模型（CPU 运行） | 已安装 | 需在生产 Ollama 实例预装 |
| nomic-embed-text | 向量嵌入模型 | 已安装 | 需在生产 Ollama 实例预装 |

---

## 二、启动顺序（生产）

```text
1. PostgreSQL   （数据库先于一切）
  ↓
2. Ollama       （推理/嵌入依赖）
  ↓
3. Backend      （等待 /api/health 就绪后再进入下一步）
  ↓
4. Worker       （独立进程；advisory lock 保证并发 ≤1）
  ↓
5. Frontend / Nginx
```

要点：

- **Backend 等待条件**：`/api/health` 返回 200 且 `database.status=connected`，不能只看进程存在
- **Worker 幂等**：多个 Worker 实例可共存，但全局并发 ≤1（PostgreSQL advisory lock），不会重复执行任务
- **前端形态**：生产用 `vite build` 产物 + Nginx，代理 `/api` 指向生产后端 5876

---

## 三、停止顺序（生产）

```text
1. Frontend / Nginx
  ↓
2. Worker（先停消费方，避免新任务被拉取）
  ↓
3. Backend
  ↓
4. Ollama
```

- **PostgreSQL 是否停止**：视生产架构决定——若数据库为共享生产实例（多系统共用），**不停止**；若为 HSE 专用实例且维护窗口需要，才按维护流程停止
- 停止时注意：先停 Worker 再停 Backend，防止 RUNNING 任务中断写死；已中断任务可由 Worker 重启后按状态机恢复或人工处置

---

## 四、生产配置原则

### 4.1 禁止直接复制开发 `.env`

开发 `.env`（`server\.env`）包含开发用途的密钥/端口/Provider 覆盖，生产必须独立配置。

### 4.2 关键环境变量

| 变量 | 开发（一键启动进程级注入） | 生产（写入生产环境配置） | 说明 |
|------|---------------------------|--------------------------|------|
| PORT | 5888 | 5876 | 生产由计划任务启动，禁止 AI/脚本手动绑定 |
| AI_PROVIDER | ollama | 生产现状以实际为准 | **不擅自改**；若切换为 ollama 需生产放行流程 |
| OLLAMA_BASE_URL | http://localhost:11434 | http://127.0.0.1:11434（生产 Ollama 地址） | |
| OLLAMA_MODEL | qwen2.5:7b | qwen2.5:7b | 需在生产 Ollama 预装 |
| AI_TIMEOUT_MS | 300000 | 300000（CPU 环境） | CPU 生成几十秒~超 60 秒，勿改小 |
| AI_ENABLE | 默认启用 | 按放行状态 | 未放行时保持禁用/降级 |
| DATABASE_URL / DB_* | safety_dashboard | 生产实例 | 独立账号、最小权限 |

### 4.3 当前生产状态（AI-12 审计结论）

```text
生产环境当前 AI Provider = 以 server\.env 实际配置为准（本阶段未修改生产 .env）
本地 Ollama 是否已进入生产配置 = 否（生产切换需用户授权）
前置条件 = 生产 Ollama 实例 + 模型预装 + 生产 .env 独立配置 + 放行测试
```

---

## 五、Windows 长期运行方案

评估结论（AI-12）：

| 方案 | 适用 | 结论 |
|------|------|------|
| **A. Windows Service** | 系统级长驻、开机自启、崩溃自拉起 | 适合生产 Backend/Worker（需服务化封装，如 NSSM/自建服务） |
| **B. 任务计划程序（Task Scheduler）** | 轻量守护、开机自启 | **推荐**——项目已实证：生产 5876 由 `HSE-Backend` 计划任务管理（SYSTEM 看护，实证 10 秒拉回） |
| C. PM2 | 进程守护/日志 | 项目未安装，**不为此新增依赖** |
| D. 现有项目启动器 | 开发栈一键启动（start-hse-ai.ps1） | 开发/试运行用；生产仍以计划任务/服务为准 |

**推荐**：生产 Backend 沿用 `HSE-Backend` 计划任务体系；Worker 增加一个独立计划任务（含失败重启）；Frontend 用 Nginx + 构建产物；Ollama 用系统服务/开机自启便携版。

---

## 六、生产放行检查清单（供运维使用）

- [ ] 生产 PostgreSQL：pgvector 已安装、AI 7 表已迁移（`ai_analysis_tasks` / `ai_generation_records` / `ai_generation_reviews` / `knowledge_sources` / `knowledge_documents` / `knowledge_chunks` / `knowledge_embeddings`）
- [ ] 生产 Ollama：`qwen2.5:7b`、`nomic-embed-text` 已 `ollama pull`
- [ ] 生产 `.env`：独立配置（AI_PROVIDER / OLLAMA_BASE_URL / OLLAMA_MODEL / AI_TIMEOUT_MS / DB 连接），**不得复制开发 .env**
- [ ] 生产 Backend 5876 健康：`/api/health`（带 token）→ `database.status=connected`、`ai.provider=ollama`
- [ ] AI v2 健康：`/api/hse/ai/v2/health` → `activeProvider=ollama`、`available=true`
- [ ] Worker：独立进程运行，advisory lock 并发 ≤1，无重复 Worker
- [ ] 冒烟测试：真实 `qwen2.5:7b` 生成通过（返回 HSE_AI_OK）
- [ ] 前端：Nginx 代理 `/api` → 5876；`/overview/ai-analysis` 页面可用
- [ ] 超时链核对：AI_TIMEOUT_MS(≥300000) > Ollama/Express 层超时 > 前端轮询间隔

---

## 七、生产故障诊断

复用开发栈健康检查逻辑（`scripts\hse-ai-health.ps1` 的 11 项），生产执行时覆盖端口：

```powershell
$env:HSE_BACKEND_PORT = 5876   # ⚠️ 仅只读健康检查，不启动/停止 5876
powershell -NoProfile -ExecutionPolicy Bypass -File G:\hse-dashboard\scripts\hse-ai-health.ps1
```

| 故障 | 检查点 |
|------|--------|
| Backend 5876 不健康 | 计划任务 `HSE-Backend` 状态；后端日志；`/api/health` |
| AI 不可用 | `ai.provider` 配置；Ollama 11434 可达性；模型存在性 |
| 任务长期 PENDING | Worker 存活；advisory lock 是否被僵尸进程持有；任务状态分布 |
| 任务 RUNNING 卡死 | Ollama 生成中（CPU 慢）；Worker 日志；超时后状态机回收 |
| 前端 502 | Nginx 代理目标 5876 可达性；CORS_ORIGINS 是否含生产域名 |

---

## 八、已知限制（生产）

1. **CPU 推理速度**：qwen2.5:7b 无 GPU 加速，单次生成几十秒、复杂分析可超 60 秒、冷启动更慢 → AI_TIMEOUT_MS 保持 ≥300000
2. **Worker 生产启用**：本阶段仅开发栈自动拉起 Worker；生产 Worker 计划任务需放行后配置
3. **Ollama 形态**：本机为 DBX 便携版；生产建议独立服务账号 + 开机自启
4. **生产 .env 未切换**：AI Provider 切换为 ollama 属生产放行事项，需用户授权
5. **数据库迁移**：AI 表生产迁移需独立授权执行，不随应用启动自动执行
6. **前端生产**：需 `vite build` 产物 + Nginx 配置（本阶段未交付 Nginx 配置模板，见生产放行任务）

---

*本文档由 AI-12 交付；生产变更严格执行「先授权、后执行、留痕、验收」。*

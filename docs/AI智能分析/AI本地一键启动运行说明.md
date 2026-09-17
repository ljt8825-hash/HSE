# HSE 本地 AI 一键启动运行说明

> 适用：HSE + 本地 AI（Ollama / qwen2.5:7b / nomic-embed-text）在 Windows 本机的一键启动、停止、健康检查与故障排查。
> 关联：AI-12 本地 AI 一键启动 / 生产运行配置（实施报告见《AI-12本地AI一键启动与生产运行配置实施报告.md》）。
> 生产环境运行配置见《AI本地生产运行配置说明.md》。

---

## 一、一键启动

### 1.1 启动入口

双击 `G:\hse-dashboard\start-hse-ai.bat`（或手动执行）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File G:\hse-dashboard\start-hse-ai.ps1
```

### 1.2 启动链路（脚本自动完成）

```text
[1/7] 环境检查（Node / pnpm / 项目结构 / 依赖）
  ↓
[2/7] PostgreSQL 检查（127.0.0.1:5432）
  ↓
[3/7] Ollama 检查（http://127.0.0.1:11434/api/tags，以 HTTP 为准，不只看进程）
  ↓
[4/7] 模型检查（qwen2.5:7b、nomic-embed-text，缺失不自动下载）
  ↓
[5/7] Backend 启动（默认 5888；等待 /api/health 就绪，最长 90 秒）
  ↓
[6/7] AI Worker 检查/启动（scripts\ai07_worker.cjs，独立进程，并发 ≤1）
  ↓
[7/7] Frontend 启动（vite dev，默认 5173；等待编译就绪，最长 180 秒）
  ↓
收尾：自动执行 scripts\hse-ai-health.ps1 健康检查
```

### 1.3 端口契约

| 组件 | 默认端口 | 说明 |
|------|----------|------|
| HSE Backend（开发栈） | 5888 | 环境变量 `HSE_BACKEND_PORT` 可覆盖；**禁止 5876** |
| HSE Frontend（vite dev） | 5173 | 环境变量 `HSE_FRONTEND_PORT` 可覆盖 |
| PostgreSQL | 5432 | 沿用 `server\.env` 的 `safety_dashboard` 库 |
| Ollama | 11434 | 启动脚本只检查，不负责拉起 |
| 生产 HSE Backend | 5876 | 由 `HSE-Backend` 计划任务（SYSTEM）管理，**脚本永不触碰** |

覆盖端口示例：

```powershell
$env:HSE_BACKEND_PORT = 5889
$env:HSE_FRONTEND_PORT = 5176
powershell -NoProfile -ExecutionPolicy Bypass -File G:\hse-dashboard\start-hse-ai.ps1
```

### 1.4 环境变量覆盖（不改 `server\.env`）

启动脚本在**进程级**注入以下变量（不修改任何配置文件）：

```text
PORT=5888
AI_PROVIDER=ollama
AI_TIMEOUT_MS=300000
VITE_PROXY_TARGET=http://127.0.0.1:5888   （前端 /api 代理目标）
VITE_UPLOADS_PROXY_TARGET=http://127.0.0.1:5888
```

> `AI_TIMEOUT_MS=300000` 是 CPU 环境 qwen2.5:7b 真实延迟的验证值（单次生成可达几十秒、复杂分析可能超过 60 秒）。不要为了"看起来快"改小。

### 1.5 幂等性（重复执行安全）

再次执行启动脚本时，对已运行组件输出 `Already running（复用）`，不会重复启动：

- Backend：端口已被监听且 `/api/health` 返回 200 → 复用
- Worker：已存在命令行含 `scripts\ai07_worker.cjs` 的 node 进程 → 复用
- Frontend：端口已被监听且返回 HTTP 200 → 复用

---

## 二、一键停止

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File G:\hse-dashboard\scripts\stop-hse-ai.ps1
# 跳过确认：
powershell -NoProfile -ExecutionPolicy Bypass -File G:\hse-dashboard\scripts\stop-hse-ai.ps1 -Force
```

停止范围（仅开发栈）：

```text
AI Worker（命令行含 scripts\ai07_worker.cjs 的 node 进程）
  ↓
开发栈 Backend（默认 5888）
  ↓
开发栈 Frontend（默认 5173）
```

**不停止**（生产边界）：

```text
生产 Backend 5876（HSE-Backend 计划任务管理，永不触碰）
PostgreSQL 5432
Ollama 11434
```

执行前会列出待停止进程并请求确认（`-Force` 跳过）。

---

## 三、健康检查

### 3.1 执行方式

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File G:\hse-dashboard\scripts\hse-ai-health.ps1
```

默认检查开发栈（Backend 5888 / Frontend 5173），可用环境变量覆盖：

```powershell
$env:HSE_BACKEND_PORT = 5888
$env:HSE_FRONTEND_PORT = 5173
powershell -NoProfile -ExecutionPolicy Bypass -File G:\hse-dashboard\scripts\hse-ai-health.ps1
```

### 3.2 检查项（11 项）

```text
[1]  Node                版本检查
[2]  PostgreSQL          127.0.0.1:5432 监听 + 只读 DB 探针（7 张 AI 表 / pgvector）
[3]  Ollama              127.0.0.1:11434 /api/tags 可达（HTTP 为准）
[4]  qwen2.5:7b          模型已安装
[5]  nomic-embed-text    模型已安装
[6]  Backend             /api/health（带只读探测 JWT，含 db/ai 详情）
[7]  AI v2 Health        /api/hse/ai/v2/health（activeProvider / available）
[8]  RAG capability      知识库 sources API + pgvector + 7 表
[9]  AI Analysis API     任务列表只读接口（total）
[10] Frontend            HTTP 200
[11] AI Generate Smoke   真实 qwen2.5:7b 生成冒烟测试
```

### 3.3 输出与退出码

```text
========================================
 HSE LOCAL AI HEALTH CHECK
========================================
Node              [OK]  v22.x
...
========================================
 HSE LOCAL AI READY            ← 全部 OK
 HSE LOCAL AI READY (WITH SKIPS)  ← 有 SKIP/WARN
 HSE LOCAL AI DEGRADED (FAIL=N)   ← 存在 FAIL
========================================
```

```text
退出码 0 = 全部 OK；1 = 存在 SKIP/WARN；2 = 存在 FAIL
```

### 3.4 冒烟测试说明（[11]）

真实调用 `qwen2.5:7b`（直接调 Ollama `/api/generate`，极短 Prompt：`请仅返回：HSE_AI_OK`）：

- **不写业务数据库**、不创建 AI generation record、不创建分析任务、不污染 HSE 业务数据
- CPU 环境可能耗时 10~60 秒（甚至更久），请耐心等待（超时 120 秒）
- 通过标准：response 含 `HSE_AI_OK`

---

## 四、Ollama 检查

- 启动脚本与健康检查均以 HTTP 为准：`http://127.0.0.1:11434/api/tags`，**不只看进程名**
- 当前本机 Ollama 运行方式：**DBX 便携版**（Ollama.Ollama.Portable，winget 安装），自动监听 11434
- 手动启动命令：`ollama serve`（若 Ollama 未运行）
- 检查脚本不会自动拉起 Ollama；Ollama 未运行时会明确报 `Ollama 未运行（127.0.0.1:11434 不可达）`

---

## 五、模型检查

必需模型：

```text
qwen2.5:7b          （推理模型）
nomic-embed-text    （向量嵌入模型）
```

- 缺失时启动脚本报 `[ERROR] 缺少模型 xxx`，提示先执行 `ollama pull <model>`
- **默认不自动下载大模型**（避免无提示地占用磁盘与带宽）
- 模型列表查询：`ollama list` 或 `http://127.0.0.1:11434/api/tags`

---

## 六、Backend

- 开发栈后端由启动脚本拉起：`node app.js`（PORT=5888，进程级注入 AI_PROVIDER=ollama / AI_TIMEOUT_MS=300000）
- 启动判定：**等待 `/api/health` 返回 200**，不只看 Node 进程存在
- 日志：启动脚本会新开一个「HSE AI Backend - Port 5888」cmd 窗口，后端日志输出在该窗口
- 数据库：连接 `server\.env` 的 `safety_dashboard`（AI 7 表与 pgvector 已就绪，AI-12 审计确认）
- 手动启动（替代方式）：

```powershell
cd G:\hse-dashboard\server
$env:PORT=5888; $env:AI_PROVIDER='ollama'; $env:AI_TIMEOUT_MS=300000
node app.js
```

---

## 七、Worker（AI 分析任务执行器）

- 脚本：`server\scripts\ai07_worker.cjs`（独立进程，随一键启动自动拉起）
- 作用：轮询 `ai_analysis_tasks` 中 PENDING 任务并执行 AI 分析
- 并发控制：**PostgreSQL advisory lock，全局并发 ≤1**，多实例不会重复执行同一任务
- 重复执行启动脚本不会产生多个 Worker（已运行则复用）
- 手动启动：`cd G:\hse-dashboard\server; node scripts\ai07_worker.cjs`
- 诊断：任务长期 PENDING → 检查 Worker 窗口是否有异常；任务 RUNNING 卡死 → 检查 Worker 是否存活、Ollama 是否可用

---

## 八、Frontend

- 当前实际前端：`安全看板vben\apps\web-naive`（**不是 web-antd**）
- 启动方式：vite dev（`node_modules\.bin\vite.cmd --mode development --host 127.0.0.1 --port 5173 --strictPort`）
- 代理：vite.config.ts 支持 `VITE_PROXY_TARGET` / `VITE_UPLOADS_PROXY_TARGET` 环境变量覆盖，一键启动时自动指向本栈后端（5888）
- 访问地址：`http://127.0.0.1:5173`
- 首次冷启动编译最长 180 秒，期间页面可能短暂不可用属正常

---

## 九、AI 页面使用

- 入口菜单：**AI 智能分析**（左侧菜单，实际路由 `/overview/ai-analysis`）
- 页面能力：AI 结构化分析任务、RAG 知识库问答、管理建议、人工审核（AI-10/AI-11）
- 使用前提：登录用户（AI v2 接口需 JWT）；AI 任务写操作（创建/取消/管理建议/人工审核）需 `admin` / `safety_manager` 角色
- 首次分析在 CPU 环境可能需等待较长时间（见下节），页面轮询任务状态即可，无需刷新

---

## 十、常见故障

### Ollama 相关

| 现象 | 诊断 | 处理 |
|------|------|------|
| 11434 未监听 | `Test-NetConnection 127.0.0.1 -Port 11434` 失败 | 启动 Ollama（`ollama serve` 或打开 DBX） |
| 模型不存在 | 健康检查 [4]/[5] FAIL | `ollama pull qwen2.5:7b` / `ollama pull nomic-embed-text` |
| 模型加载失败 / 生成超时 | Worker 窗口报错、冒烟测试超时 | 查看 Ollama 日志；CPU 环境冷启动慢属正常，等 2~3 分钟重试 |
| Ollama 进程退出 | 健康检查 [3] FAIL | 重启 Ollama；检查是否被其他进程改过 OLLAMA_HOST |

### Backend 相关

| 现象 | 诊断 | 处理 |
|------|------|------|
| Node 启动失败 | Backend 窗口立即报错 | 查看窗口错误；确认 Node 20+ |
| .env 错误 | 启动时报配置错误 | 检查 `server\.env`（注意：生产 .env 由生产计划任务使用，勿随意改动） |
| PostgreSQL 连接失败 | Backend 窗口报连接错误 | 确认 PostgreSQL 5432 已启动、账号密码正确 |
| AI v2 路由失败 | 健康检查 [7] FAIL | 确认后端为最新代码；查后端窗口日志 |

### AI 错误模型

健康检查/任务接口按统一错误模型返回：`MODEL_NOT_FOUND / UNREACHABLE / TIMEOUT / AUTH_ERROR / ERROR / DISABLED`，可据此定位。

### Worker 相关

| 现象 | 处理 |
|------|------|
| worker 未启动 | 一键启动会自动拉起；手动执行 `node scripts\ai07_worker.cjs` |
| 任务长期 PENDING | 检查 Worker 是否存活；查看 `ai_analysis_tasks` 任务状态 |
| 任务 RUNNING 卡死 | 确认 Worker 存活、Ollama 可达；CPU 生成耗时久属正常，可等待 |
| 重复 worker | advisory lock 保证并发 ≤1，重复实例会空转等待，无需处理 |

### Frontend 相关

| 现象 | 处理 |
|------|------|
| Frontend 未启动 | 一键启动会自动拉起；检查 vite 窗口编译错误 |
| API 地址错误 | 确认前端代理指向正确后端（vite.config.ts 的 VITE_PROXY_TARGET） |
| CORS | 确认后端 CORS_ORIGINS 包含 `http://127.0.0.1:5173` |
| AI 页面无法加载 | F12 看网络请求；确认后端 5888 健康、页面路由 `/overview/ai-analysis` |

---

## 十一、CPU 性能说明

- 当前机器：无 NVIDIA GPU，`qwen2.5:7b` 运行在 **CPU 环境**
- 实测表现：单次生成可能几十秒；复杂分析可能超过 60 秒；冷启动更慢
- 本阶段配置：`AI_TIMEOUT_MS=300000`（进程级，开发栈）——**不要改小**，否则复杂任务会误报超时
- 建议：
  - 单任务分析时避免同时发起多个任务（Worker 并发 ≤1 已保证队列化）
  - 大文档/长文本 RAG 分析预留 2~5 分钟
  - 日常使用以轮询任务状态为主，不要频繁刷新页面

---

## 十二、生产部署准备（摘要）

完整说明见《AI本地生产运行配置说明.md》。要点：

```text
启动顺序：PostgreSQL → Ollama → Backend → Worker → Frontend/Nginx
停止顺序：Frontend → Worker → Backend → Ollama（PostgreSQL 视架构决定）
端口：生产 Backend = 5876（HSE-Backend 计划任务）；前端生产 = 构建产物 + Nginx
生产 .env：不得直接复制开发 .env；需独立配置 AI_PROVIDER/OLLAMA_BASE_URL/OLLAMA_MODEL/AI_TIMEOUT_MS
```

---

## 十三、生产环境注意事项

1. **生产 5876 归 HSE-Backend 计划任务（SYSTEM）管理**，任何一键脚本/手动操作都禁止启动、停止、重启 5876
2. 一键启动/停止脚本只作用于开发栈（5888/5173/Worker），**不触碰生产**：生产 5876、PostgreSQL、Ollama 均不受影响
3. 生产数据库迁移（如 ai_generation_reviews 等）需用户**独立授权**后另行执行，不随一键启动自动执行
4. 生产 AI Provider 是否切换为 Ollama，需按生产放行流程单独决策（当前生产 .env 的 AI 配置以实际为准）
5. 长期运行推荐 Windows 计划任务/服务（原生能力），不引入 PM2 等新依赖（详见生产运行配置说明）

---

*本文档由 AI-12 交付，与本仓库规则（生产边界 / 记忆同步 / 自动归档）保持一致。*

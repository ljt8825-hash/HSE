# HSE V2.0 批量导入中心设计方案

> 版本：v1.2（最终冻结版，待审核）
> 日期：2026-07-19
> 前置基础：Sprint1~4 已稳定交付（V2.0 已达发布条件）
> 设计目标：构建统一的批量导入中心，支持资料/标准条款/安全记录三类业务的批量导入
> 修订说明：基于代码扫描分析结果，修正操作日志表名、明确 Excel 解析责任、确认并发控制实现、新增 import_version、增加预检查流程

---

## 〇、设计背景与原则

### 0.1 现状问题

| 模块 | 现状 | 问题 |
|------|------|------|
| 安全资料中心（Sprint1） | `POST /api/hse/documents/upload` 单文件上传 | 无法一次导入 100+ 文件 |
| 标准条款管理（Sprint4） | `POST /api/hse/standard/import` 单文件导入 | 仅支持 JSON 格式，不含 Excel 解析 |
| 安全记录（隐患/培训/应急等） | 各业务路由均使用 `uploadDocument.single('file')` 附件上传 | 一次仅一个附件，无统一进度 |

### 0.2 设计目标

构建 **HSE Batch Import Center**，作为统一批量入口，支持：

| 导入类型 | 业务来源 | 数据载体 |
|---------|---------|---------|
| 资料批量导入 | document_files | 多文件（PDF/Word/Excel/图片） |
| 标准条款批量导入 | safety_standard_clauses | Excel/JSON（Excel 解析由 batchImportService 负责） |
| 安全记录批量导入 | hazards / training / emergency 等 | Excel + 附件（MVP 暂不实现） |

### 0.3 设计原则

1. **异步处理**：HTTP 仅创建任务并立即返回，大量处理在后台进行
2. **失败隔离**：单个文件失败不影响其他文件，支持失败重试
3. **统一入口**：一个 Service + 一个路由模块，复用现有 upload/通知/权限
4. **复用不重造**：调用现有 `documentService.uploadFile`、`standardService.batchImportClauses` 等方法
5. **全流程留痕**：任务 + 明细双层记录 + sys_operation_log 操作日志，可追溯每一次导入
6. **数据隔离**：支持集团-区域-企业数据隔离，enterprise_id/department_id 贯穿全流程
7. **AI 解耦**：批量导入不负责 AI 分析，导入完成后只产生资料，AI 分析由 Sprint2 已有流程处理
8. **预检查优先**：导入前执行文件校验+重复检测，生成预检查报告供人工确认后再正式执行

### 0.4 红线约束（严格遵守）

| 约束 | 说明 |
|------|------|
| 不修改 packages/@core/、effects/、themes/ | Vben 核心保护 |
| 不修改 auth / JWT / 登录逻辑 | 复用现有 requireRole 中间件 |
| 不新增 npm 依赖 | 复用 multer、xlsx、pg、crypto（Node.js 内置）等现有依赖 |
| 不创建 src/components/ | 业务组件放 views/hse/batch-import/components/ |
| 不修改 upload.js 中间件 | 复用 createUploader，不改动原文件 |
| 不修改现有业务路由 | 通过调用现有 Service 方法集成，不改动原路由 |
| 批量导入不负责 AI 分析 | 导入完成后只产生资料，AI 分析由 Sprint2 已有流程处理 |
| 不新增队列依赖 | 并发控制使用 PostgreSQL 查询，不引入队列库 |

### 0.5 MVP 限制

| 限制项 | 值 | 说明 |
|--------|-----|------|
| 单任务最大文件数 | 500 | multer `maxCount` 配置 |
| 单文件最大大小 | 100 MB | 支持大型文档导入 |
| 同时运行任务数 | 3 | PostgreSQL 查询 processing 任务数，超过则拒绝创建 |
| 导入类型 | 2 种 | document（资料）、standard_clause（标准条款）；safety_record 暂缓 |
| 预检查模式 | 支持 | 文件校验 + 重复检测，人工确认后执行 |

---

## 一、架构设计

### 1.1 总体架构图

```
┌──────────────────────────────────────────────────────────────┐
│                    前端（Vben Admin + Antd Vue）              │
│  views/hse/batch-import/                                      │
│  ├─ index.vue              批量导入中心列表页                  │
│  ├─ BatchImportDrawer.vue  拖拽上传 + 文件列表 + 预检查 + 进度  │
│  ├─ TaskDetailDrawer.vue   任务详情（成功/失败明细 + 重试）    │
│  └─ components/            业务子组件                          │
└────────────────────┬─────────────────────────────────────────┘
                     │  HTTP（异步）
                     ▼
┌──────────────────────────────────────────────────────────────┐
│              后端（Node.js + Express）                         │
│  routes/hse-batch-import.js                                   │
│  ├─ POST /api/hse/batch-import/tasks         创建任务+接收文件 │
│  ├─ POST /api/hse/batch-import/tasks/:id/precheck  预检查     │
│  ├─ POST /api/hse/batch-import/tasks/:id/confirm   确认执行   │
│  ├─ GET  /api/hse/batch-import/tasks         任务列表          │
│  ├─ GET  /api/hse/batch-import/tasks/:id     任务详情          │
│  ├─ GET  /api/hse/batch-import/tasks/:id/progress  进度轮询   │
│  ├─ POST /api/hse/batch-import/items/:id/retry     失败重试   │
│  ├─ GET  /api/hse/batch-import/templates/:type    模板下载     │
│  └─ GET  /api/hse/batch-import/tasks/:id/export   结果导出    │
└────────────────────┬─────────────────────────────────────────┘
                     │  调用
                     ▼
┌──────────────────────────────────────────────────────────────┐
│             services/batchImportService.js                    │
│  ├─ createTask             创建任务（写表+日志）               │
│  ├─ precheckTask           预检查（文件校验+重复检测）         │
│  ├─ confirmAndExecute      确认并执行（setImmediate 触发）     │
│  ├─ processTask            异步处理任务                       │
│  ├─ processItem            单文件处理（调用业务 Service）      │
│  ├─ parseStandardExcel     Excel 解析为 JSON（标准条款）       │
│  ├─ retryItem              失败重试                           │
│  ├─ checkDuplicate         重复文件检测（hash）                │
│  ├─ validateFile           文件类型+大小校验                   │
│  ├─ getTemplate            获取导入模板（含 import_version）   │
│  ├─ buildResultReport      生成结果汇总                        │
│  └─ _checkConcurrentLimit  并发控制（PostgreSQL 查询）         │
└────────────────────┬─────────────────────────────────────────┘
                     │  复用
                     ▼
┌──────────────────────────────────────────────────────────────┐
│             现有业务 Service（不修改）                         │
│  ├─ documentService.uploadFile           资料落盘              │
│  ├─ standardService.batchImportClauses   条款批量落盘（JSON） │
│  ├─ hazardService / trainingService 等   安全记录业务（按需）  │
│  ├─ notificationService.createNotification  通知              │
│  └─ sys_operation_log                       操作日志记录       │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 预检查 + 确认执行时序

```
前端                                            后端
 │                                               │
 │  1. POST /tasks (files + metadata)            │
 │ ─────────────────────────────────────────────▶│
 │                                               │  并发任务数检查（≤3）
 │                                               │  创建 task（status=pending + enterprise_id + department_id）
 │                                               │  批量接收文件到 uploads/batch-import/{taskId}/
 │                                               │  为每个文件创建 item（status=pending）
 │                                               │  写入操作日志（sys_operation_log, action=create）
 │  200 {taskId, total, status: pending}         │
 │ ◀─────────────────────────────────────────────│
 │                                               │
 │  2. POST /tasks/:id/precheck                  │
 │ ─────────────────────────────────────────────▶│
 │                                               │  遍历 items：
 │                                               │    - 文件校验（类型/大小/魔术字节）
 │                                               │    - 重复检测（SHA-256 hash）
 │                                               │  生成预检查结果（validCount/invalidCount/dupCount）
 │                                               │  更新 task.precheck_result
 │  200 {valid, invalid, duplicated, items: [...]}│
 │ ◀─────────────────────────────────────────────│
 │                                               │
 │  3. 人工确认（点击"确认导入"按钮）              │
 │                                               │
 │  4. POST /tasks/:id/confirm                   │
 │ ─────────────────────────────────────────────▶│
 │                                               │  更新 task.status=confirmed
 │                                               │  写入操作日志（action=confirm）
 │                                               │  setImmediate(() => processTask(taskId))
 │  200 {taskId, status: processing}             │
 │ ◀─────────────────────────────────────────────│
 │                                               │
 │  5. 后台 processTask：                        │
 │     - 写入操作日志（action=start）            │
 │     - for each item: processItem              │
 │     - 全部完成后 task.status=completed        │
 │     - 写入操作日志（action=complete）         │
 │     - 发送通知                                │
 │                                               │
 │  6. GET /tasks/:id/progress (轮询，2秒/次)    │
 │ ─────────────────────────────────────────────▶│
 │  200 {total, success, fail, progress, ...}    │
 │ ◀─────────────────────────────────────────────│
```

### 1.3 标准条款 Excel 导入流程

```
Excel 文件（.xlsx / .xls）
    │
    ▼
batchImportService.parseStandardExcel(filePath)
    ├─ xlsx.readFile(filePath)         ← 复用现有 xlsx 依赖
    ├─ sheet_to_json(sheet)           ← 解析为 JSON 数组
    ├─ 字段映射（code/title/content/...）
    └─ 返回 clauses: [...]
          │
          ▼
standardService.batchImportClauses(clauses, user)
    └─ 逐条调用 createClause（复用 Sprint4 逻辑）
```

**责任划分**：

| 模块 | 责任 |
|------|------|
| batchImportService | Excel 读取、解析、字段映射、数据校验 → 输出 JSON 数组 |
| standardService | 接收 JSON 数组、逐条落库、失败隔离 → 返回 { total, success, failed, errors } |

### 1.4 并发控制实现

**方案**：使用 PostgreSQL 查询 `status='processing'` 的任务数

```
创建任务时：
    1. SELECT COUNT(*) FROM hse_batch_import_tasks WHERE status = 'processing' AND is_deleted = FALSE
    2. count >= 3 → 拒绝创建，返回 TOO_MANY_TASKS 错误
    3. count < 3 → 允许创建
```

**为什么不使用队列库**：

| 方案 | 优点 | 缺点 |
|------|------|------|
| PostgreSQL 查询（采用） | 零新增依赖、简单可靠、与现有架构一致 | 极端并发下可能有竞态（3 个任务同时通过检查），可接受 |
| 队列库（如 Bull） | 精确控制 | 新增依赖，违反"不新增 npm 依赖"约束 |

**竞态缓解**：即使极端情况下有 4-5 个任务同时 processing，也不会导致系统崩溃，只是性能略有下降，属于可接受风险。

### 1.5 与现有模块的关系

```
HSE 批量导入中心（新）
    │
    ├─ 调用 → documentService.uploadFile（Sprint1，资料落盘）
    │       └─ document_files 表
    │
    ├─ 调用 → standardService.batchImportClauses（Sprint4，条款批量，接收 JSON）
    │       └─ safety_standard_clauses 表
    │
    ├─ 调用 → 现有各业务 Service（如 hazardService 等，按需扩展）
    │       └─ 各业务表
    │
    ├─ 复用 → upload.js（createUploader + validateUploadedFile）
    ├─ 复用 → notificationService（任务完成通知）
    ├─ 复用 → auth.js（requireRole + 权限码校验）
    ├─ 复用 → response.js（统一响应格式）
    └─ 复用 → sys_operation_log（操作日志记录）
```

---

## 二、数据库设计

### 2.1 新增表清单

| 表名 | 用途 |
|------|------|
| `hse_batch_import_tasks` | 批量导入任务主表 |
| `hse_batch_import_items` | 批量导入明细表（每个文件一条） |

### 2.2 hse_batch_import_tasks 表结构

```sql
-- ============================================================
-- HSE 批量导入任务表
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_batch_import_tasks (
    id                  BIGSERIAL    PRIMARY KEY,
    task_no             VARCHAR(32)  NOT NULL,                -- 任务编号（业务可读，如 BI20260719001）
    import_type         VARCHAR(32)  NOT NULL,                -- 导入类型: document / standard_clause / safety_record
    import_version      VARCHAR(20)  DEFAULT 'v1.0',          -- 导入模板版本（支持模板版本追踪）
    enterprise_id       BIGINT,                               -- 企业ID（支持集团-区域-企业数据隔离）
    department_id       BIGINT,                               -- 部门ID（支持部门数据隔离）
    business_scope      JSONB        DEFAULT '{}',            -- 业务范围（分类ID/企业ID/部门等）
    total_count         INTEGER      NOT NULL DEFAULT 0,      -- 总数量
    success_count       INTEGER      NOT NULL DEFAULT 0,      -- 成功数量
    fail_count          INTEGER      NOT NULL DEFAULT 0,      -- 失败数量
    pending_count       INTEGER      NOT NULL DEFAULT 0,      -- 待处理数量
    status              VARCHAR(20)  NOT NULL DEFAULT 'pending',
        -- pending      待处理（已上传，待预检查）
        -- prechecking  预检查中
        -- prechecked   预检查完成，待确认
        -- confirmed    已确认，待执行
        -- processing   处理中
        -- completed    已完成（含失败）
        -- failed       任务级失败（如参数错误）
        -- cancelled    已取消
    precheck_result     JSONB        DEFAULT '{}',            -- 预检查结果（{validCount, invalidCount, dupCount, items: [...]}）
    progress            INTEGER      NOT NULL DEFAULT 0,       -- 进度百分比 0-100
    file_storage_dir    VARCHAR(512),                          -- 文件临时存储目录
    result_summary      JSONB        DEFAULT '{}',             -- 结果汇总（分类统计/错误类型统计）
    error_message       TEXT,                                  -- 任务级错误信息
    created_by          VARCHAR(64)  NOT NULL,                 -- 创建人
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    prechecked_at       TIMESTAMP,                             -- 预检查完成时间
    confirmed_at        TIMESTAMP,                             -- 确认执行时间
    started_at          TIMESTAMP,                             -- 开始处理时间
    completed_at        TIMESTAMP,                             -- 完成时间
    updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted          BOOLEAN      NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE  hse_batch_import_tasks IS 'HSE 批量导入任务主表';
COMMENT ON COLUMN hse_batch_import_tasks.task_no        IS '任务编号，业务可读';
COMMENT ON COLUMN hse_batch_import_tasks.import_type    IS '导入类型: document/standard_clause/safety_record';
COMMENT ON COLUMN hse_batch_import_tasks.import_version IS '导入模板版本: v1.0';
COMMENT ON COLUMN hse_batch_import_tasks.enterprise_id IS '企业ID，支持集团-区域-企业数据隔离';
COMMENT ON COLUMN hse_batch_import_tasks.department_id IS '部门ID，支持部门数据隔离';
COMMENT ON COLUMN hse_batch_import_tasks.business_scope IS '业务范围: {categoryId, enterpriseId, department, ...}';
COMMENT ON COLUMN hse_batch_import_tasks.status         IS '任务状态: pending/prechecking/prechecked/confirmed/processing/completed/failed/cancelled';
COMMENT ON COLUMN hse_batch_import_tasks.precheck_result IS '预检查结果: {validCount, invalidCount, dupCount, items: [...]}';
COMMENT ON COLUMN hse_batch_import_tasks.file_storage_dir IS '本次导入文件的临时存储目录';
COMMENT ON COLUMN hse_batch_import_tasks.result_summary IS '结果汇总: {byErrorType: {...}, byCategory: {...}}';

-- 索引
CREATE UNIQUE INDEX IF NOT EXISTS uk_batch_import_task_no   ON hse_batch_import_tasks (task_no);
CREATE INDEX IF NOT EXISTS idx_batch_import_tasks_type      ON hse_batch_import_tasks (import_type);
CREATE INDEX IF NOT EXISTS idx_batch_import_tasks_status    ON hse_batch_import_tasks (status);
CREATE INDEX IF NOT EXISTS idx_batch_import_tasks_created   ON hse_batch_import_tasks (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_batch_import_tasks_creator   ON hse_batch_import_tasks (created_by);
CREATE INDEX IF NOT EXISTS idx_batch_import_tasks_enterprise ON hse_batch_import_tasks (enterprise_id);
CREATE INDEX IF NOT EXISTS idx_batch_import_tasks_department ON hse_batch_import_tasks (department_id);
CREATE INDEX IF NOT EXISTS idx_batch_import_tasks_scope      ON hse_batch_import_tasks (enterprise_id, department_id, status);
```

### 2.3 hse_batch_import_items 表结构

```sql
-- ============================================================
-- HSE 批量导入明细表
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_batch_import_items (
    id                  BIGSERIAL    PRIMARY KEY,
    task_id             BIGINT       NOT NULL,                -- 关联任务 ID
    seq_no              INTEGER      NOT NULL,                -- 文件序号（1,2,3...）
    original_name       VARCHAR(256) NOT NULL,                -- 原始文件名
    storage_name        VARCHAR(128),                         -- 存储文件名
    file_path           VARCHAR(512),                         -- 文件路径
    file_size           BIGINT       DEFAULT 0,               -- 文件大小（字节）
    file_type           VARCHAR(32),                          -- 文件扩展名
    mime_type           VARCHAR(128),                         -- MIME 类型
    file_hash           VARCHAR(64),                          -- 文件 SHA-256（重复检测用）
    status              VARCHAR(20)  NOT NULL DEFAULT 'pending',
        -- pending      待处理（已上传）
        -- prechecking  预检查中
        -- prechecked   预检查通过
        -- invalid      预检查不通过（文件类型/大小/魔术字节不合法）
        -- duplicate    预检查重复
        -- processing   处理中
        -- success      成功
        -- failed       失败
        -- skipped      跳过（人工跳过）
        -- retrying     重试中
    precheck_status     VARCHAR(20)  DEFAULT 'pending',       -- 预检查状态: pending/passed/failed
    precheck_message    TEXT,                                 -- 预检查说明
    target_table        VARCHAR(64),                          -- 落库目标表（如 document_files）
    target_id           BIGINT,                               -- 落库目标记录 ID
    error_code          VARCHAR(32),                          -- 错误码（见 2.5）
    error_message       TEXT,                                 -- 失败原因（中文可读）
    retry_count         INTEGER      NOT NULL DEFAULT 0,      -- 已重试次数
    max_retry           INTEGER      NOT NULL DEFAULT 3,      -- 最大重试次数
    metadata            JSONB        DEFAULT '{}',            -- 扩展元数据（如行号、分类等）
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    prechecked_at       TIMESTAMP,                            -- 预检查完成时间
    started_at          TIMESTAMP,                            -- 开始处理时间
    completed_at        TIMESTAMP,                            -- 完成时间
    updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted          BOOLEAN      NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE  hse_batch_import_items IS 'HSE 批量导入明细表';
COMMENT ON COLUMN hse_batch_import_items.task_id      IS '关联任务 ID';
COMMENT ON COLUMN hse_batch_import_items.file_hash    IS '文件 SHA-256，用于重复检测';
COMMENT ON COLUMN hse_batch_import_items.status       IS '明细状态: pending/prechecking/prechecked/invalid/duplicate/processing/success/failed/skipped/retrying';
COMMENT ON COLUMN hse_batch_import_items.precheck_status IS '预检查状态: pending/passed/failed';
COMMENT ON COLUMN hse_batch_import_items.target_id    IS '落库目标记录 ID（仅逻辑关联，不加外键）';
COMMENT ON COLUMN hse_batch_import_items.error_code   IS '错误码: DUP_FILE/INVALID_TYPE/INVALID_SIGNATURE/OVERSIZE/BIZ_ERROR/PARSE_ERROR/DB_ERROR/UNKNOWN';

-- 索引
CREATE INDEX IF NOT EXISTS idx_batch_import_items_task   ON hse_batch_import_items (task_id);
CREATE INDEX IF NOT EXISTS idx_batch_import_items_status ON hse_batch_import_items (status);
CREATE INDEX IF NOT EXISTS idx_batch_import_items_hash   ON hse_batch_import_items (file_hash);
CREATE INDEX IF NOT EXISTS idx_batch_import_items_target ON hse_batch_import_items (target_table, target_id);
```

### 2.4 状态机

#### 任务状态机

```
pending ──(开始预检查)──▶ prechecking ──(预检查完成)──▶ prechecked
                                                             │
                                      ┌──────────────────────┘
                                      │  用户确认
                                      ▼
                                confirmed ──(开始处理)──▶ processing ──(全部完成)──▶ completed
                                                               │
                                                               └──(任务级异常)──▶ failed

任意状态 ──(用户取消)──▶ cancelled
```

#### 明细状态机

```
pending ──(预检查)──▶ prechecking ──(通过)──▶ prechecked ──(确认执行)──▶ processing ──(成功)──▶ success
                      │                                    │
                      ├─(类型/大小不合法)──▶ invalid       ├─(重复文件)──▶ duplicate
                      │                                                           │
                      └─(重复文件)──▶ duplicate                                     └─(人工跳过)──▶ skipped

processing ──(失败)──▶ failed ──(重试)──▶ retrying ──▶ processing
```

### 2.5 错误码定义

| 错误码 | 含义 | 处理建议 |
|--------|------|---------|
| `DUP_FILE` | 重复文件（hash 命中） | 跳过，提示用户 |
| `INVALID_TYPE` | 文件类型不允许 | 永久失败，不重试 |
| `INVALID_SIGNATURE` | 文件魔术字节校验失败 | 永久失败，不重试 |
| `OVERSIZE` | 文件超过大小限制（100MB） | 永久失败，不重试 |
| `BIZ_ERROR` | 业务层抛出错误（如分类不存在） | 可重试，修正数据后 |
| `PARSE_ERROR` | Excel/JSON 解析失败 | 永久失败，不重试 |
| `DB_ERROR` | 数据库异常 | 可重试 |
| `UNKNOWN` | 未知异常 | 可重试 |
| `TOO_MANY_TASKS` | 并发任务数超过限制（>3） | 等待其他任务完成后重试 |

### 2.6 操作日志表（复用 sys_operation_log）

**复用现有表**：[sys_operation_log](file:///f:/deploy/hse-dashboard/server/sql/sys_operation_log.sql)

**字段映射**：

| sys_operation_log 字段 | 批量导入使用说明 |
|-----------------------|-----------------|
| user_id | 操作用户 ID |
| username | 操作用户名 |
| action | 操作类型：`create` / `precheck` / `confirm` / `start` / `retry` / `complete` / `cancel` |
| module | 模块：固定 `batch_import` |
| description | 操作描述（如"创建批量导入任务 BI20260719001"） |
| ip_address | 操作者 IP（从 req.ip 获取） |
| user_agent | 浏览器 UA（从 req.headers['user-agent'] 获取） |
| status_code | HTTP 状态码（成功 200，失败 400/500） |
| detail | 详情 JSON：{ taskId, taskNo, importType, totalCount, ... } |
| created_at | 操作时间 |

**记录的操作类型**：

| action | 触发时机 | description 示例 |
|--------|---------|-----------------|
| `create` | 创建任务成功 | 创建批量导入任务 BI20260719001，共 120 个文件 |
| `precheck` | 预检查完成 | 批量导入任务 BI20260719001 预检查完成：通过 115，不通过 3，重复 2 |
| `confirm` | 用户确认执行 | 确认执行批量导入任务 BI20260719001 |
| `start` | 任务开始处理 | 批量导入任务 BI20260719001 开始处理 |
| `retry` | 失败明细重试 | 重试批量导入明细 ID=2001（第 1 次重试） |
| `complete` | 任务完成 | 批量导入任务 BI20260719001 完成：成功 105，失败 12，跳过 3 |
| `cancel` | 任务取消 | 取消批量导入任务 BI20260719001 |

### 2.7 迁移脚本

新增文件：`server/sql/hse_batch_import_v58_migration.sql`

```sql
-- 幂等迁移：创建批量导入两张表
-- 在事务中执行，IF NOT EXISTS 保证可重复执行
-- 版本号：v58（紧接 Sprint4 v57）

BEGIN;

-- ============================================================
-- HSE 批量导入任务表
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_batch_import_tasks (
    id                  BIGSERIAL    PRIMARY KEY,
    task_no             VARCHAR(32)  NOT NULL,
    import_type         VARCHAR(32)  NOT NULL,
    import_version      VARCHAR(20)  DEFAULT 'v1.0',
    enterprise_id       BIGINT,
    department_id       BIGINT,
    business_scope      JSONB        DEFAULT '{}',
    total_count         INTEGER      NOT NULL DEFAULT 0,
    success_count       INTEGER      NOT NULL DEFAULT 0,
    fail_count          INTEGER      NOT NULL DEFAULT 0,
    pending_count       INTEGER      NOT NULL DEFAULT 0,
    status              VARCHAR(20)  NOT NULL DEFAULT 'pending',
    precheck_result     JSONB        DEFAULT '{}',
    progress            INTEGER      NOT NULL DEFAULT 0,
    file_storage_dir    VARCHAR(512),
    result_summary      JSONB        DEFAULT '{}',
    error_message       TEXT,
    created_by          VARCHAR(64)  NOT NULL,
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    prechecked_at       TIMESTAMP,
    confirmed_at        TIMESTAMP,
    started_at          TIMESTAMP,
    completed_at        TIMESTAMP,
    updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted          BOOLEAN      NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE  hse_batch_import_tasks IS 'HSE 批量导入任务主表';
COMMENT ON COLUMN hse_batch_import_tasks.task_no        IS '任务编号，业务可读';
COMMENT ON COLUMN hse_batch_import_tasks.import_type    IS '导入类型: document/standard_clause/safety_record';
COMMENT ON COLUMN hse_batch_import_tasks.import_version IS '导入模板版本: v1.0';
COMMENT ON COLUMN hse_batch_import_tasks.enterprise_id IS '企业ID，支持集团-区域-企业数据隔离';
COMMENT ON COLUMN hse_batch_import_tasks.department_id IS '部门ID，支持部门数据隔离';
COMMENT ON COLUMN hse_batch_import_tasks.business_scope IS '业务范围: {categoryId, enterpriseId, department, ...}';
COMMENT ON COLUMN hse_batch_import_tasks.status         IS '任务状态: pending/prechecking/prechecked/confirmed/processing/completed/failed/cancelled';
COMMENT ON COLUMN hse_batch_import_tasks.precheck_result IS '预检查结果: {validCount, invalidCount, dupCount, items: [...]}';
COMMENT ON COLUMN hse_batch_import_tasks.file_storage_dir IS '本次导入文件的临时存储目录';
COMMENT ON COLUMN hse_batch_import_tasks.result_summary IS '结果汇总: {byErrorType: {...}, byCategory: {...}}';

CREATE UNIQUE INDEX IF NOT EXISTS uk_batch_import_task_no   ON hse_batch_import_tasks (task_no);
CREATE INDEX IF NOT EXISTS idx_batch_import_tasks_type      ON hse_batch_import_tasks (import_type);
CREATE INDEX IF NOT EXISTS idx_batch_import_tasks_status    ON hse_batch_import_tasks (status);
CREATE INDEX IF NOT EXISTS idx_batch_import_tasks_created   ON hse_batch_import_tasks (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_batch_import_tasks_creator   ON hse_batch_import_tasks (created_by);
CREATE INDEX IF NOT EXISTS idx_batch_import_tasks_enterprise ON hse_batch_import_tasks (enterprise_id);
CREATE INDEX IF NOT EXISTS idx_batch_import_tasks_department ON hse_batch_import_tasks (department_id);
CREATE INDEX IF NOT EXISTS idx_batch_import_tasks_scope      ON hse_batch_import_tasks (enterprise_id, department_id, status);

-- ============================================================
-- HSE 批量导入明细表
-- ============================================================
CREATE TABLE IF NOT EXISTS hse_batch_import_items (
    id                  BIGSERIAL    PRIMARY KEY,
    task_id             BIGINT       NOT NULL,
    seq_no              INTEGER      NOT NULL,
    original_name       VARCHAR(256) NOT NULL,
    storage_name        VARCHAR(128),
    file_path           VARCHAR(512),
    file_size           BIGINT       DEFAULT 0,
    file_type           VARCHAR(32),
    mime_type           VARCHAR(128),
    file_hash           VARCHAR(64),
    status              VARCHAR(20)  NOT NULL DEFAULT 'pending',
    precheck_status     VARCHAR(20)  DEFAULT 'pending',
    precheck_message    TEXT,
    target_table        VARCHAR(64),
    target_id           BIGINT,
    error_code          VARCHAR(32),
    error_message       TEXT,
    retry_count         INTEGER      NOT NULL DEFAULT 0,
    max_retry           INTEGER      NOT NULL DEFAULT 3,
    metadata            JSONB        DEFAULT '{}',
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    prechecked_at       TIMESTAMP,
    started_at          TIMESTAMP,
    completed_at        TIMESTAMP,
    updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted          BOOLEAN      NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE  hse_batch_import_items IS 'HSE 批量导入明细表';
COMMENT ON COLUMN hse_batch_import_items.task_id      IS '关联任务 ID';
COMMENT ON COLUMN hse_batch_import_items.file_hash    IS '文件 SHA-256，用于重复检测';
COMMENT ON COLUMN hse_batch_import_items.status       IS '明细状态: pending/prechecking/prechecked/invalid/duplicate/processing/success/failed/skipped/retrying';
COMMENT ON COLUMN hse_batch_import_items.precheck_status IS '预检查状态: pending/passed/failed';
COMMENT ON COLUMN hse_batch_import_items.target_id    IS '落库目标记录 ID（仅逻辑关联，不加外键）';
COMMENT ON COLUMN hse_batch_import_items.error_code   IS '错误码: DUP_FILE/INVALID_TYPE/INVALID_SIGNATURE/OVERSIZE/BIZ_ERROR/PARSE_ERROR/DB_ERROR/UNKNOWN';

CREATE INDEX IF NOT EXISTS idx_batch_import_items_task   ON hse_batch_import_items (task_id);
CREATE INDEX IF NOT EXISTS idx_batch_import_items_status ON hse_batch_import_items (status);
CREATE INDEX IF NOT EXISTS idx_batch_import_items_hash   ON hse_batch_import_items (file_hash);
CREATE INDEX IF NOT EXISTS idx_batch_import_items_target ON hse_batch_import_items (target_table, target_id);

COMMIT;
```

**迁移规范**：
- 遵循 Sprint4 增量迁移规范（IF NOT EXISTS + BEGIN/COMMIT）
- 不修改任何已有表结构
- 不删除任何字段
- 版本号 v58，紧接 Sprint4 v57

---

## 三、API 设计

### 3.1 接口总览

所有接口挂载在 `/api/hse/batch-import` 前缀下。

| 方法 | 路径 | 说明 | 权限码 | 角色要求 |
|------|------|------|--------|---------|
| POST | `/tasks` | 创建批量导入任务（上传文件） | `batch_import:create` | admin / safety_manager / group_admin |
| POST | `/tasks/:id/precheck` | 执行预检查 | `batch_import:create` | admin / safety_manager / group_admin |
| POST | `/tasks/:id/confirm` | 确认执行 | `batch_import:create` | admin / safety_manager / group_admin |
| GET | `/tasks` | 任务列表（分页 + 筛选） | `batch_import:view` | 所有登录用户 |
| GET | `/tasks/:id` | 任务详情（含明细汇总） | `batch_import:view` | 所有登录用户 |
| GET | `/tasks/:id/progress` | 任务进度（轮询用，轻量） | `batch_import:view` | 所有登录用户 |
| GET | `/tasks/:id/items` | 任务明细列表（分页 + 状态筛选） | `batch_import:view` | 所有登录用户 |
| POST | `/items/:id/retry` | 失败明细重试 | `batch_import:retry` | admin / safety_manager / group_admin |
| POST | `/tasks/:id/cancel` | 取消任务 | `batch_import:create` | admin / safety_manager / group_admin |
| GET | `/tasks/:id/export` | 导出结果报表（Excel） | `batch_import:view` | 所有登录用户 |
| GET | `/templates/:type` | 下载导入模板（Excel，含 import_version） | `batch_import:view` | 所有登录用户 |

### 3.2 关键接口详情

#### 3.2.1 创建批量导入任务

`POST /api/hse/batch-import/tasks`（multipart/form-data）

**请求**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| importType | string | 是 | `document` / `standard_clause` / `safety_record` |
| importVersion | string | 否 | 模板版本，默认 `v1.0` |
| enterpriseId | string | 否 | 企业 ID（支持集团-区域-企业数据隔离） |
| departmentId | string | 否 | 部门 ID（支持部门数据隔离） |
| businessScope | JSON string | 否 | 业务范围（如 `{"categoryId": 5}`） |
| files | File[] | 是 | 多文件，字段名 `files`，最大 500 个 |

**文件限制**：
- 单次最大 **500 个文件**（multer `maxCount` 配置）
- 单文件最大 **100 MB**

**并发检查**：
- 创建前查询 `status='processing'` 的任务数
- ≥ 3 → 返回错误 `TOO_MANY_TASKS`
- < 3 → 允许创建

**响应**：

```json
{
  "code": 200,
  "message": "批量导入任务已创建，请执行预检查",
  "data": {
    "taskId": 1001,
    "taskNo": "BI20260719001",
    "importType": "document",
    "importVersion": "v1.0",
    "totalCount": 120,
    "status": "pending"
  }
}
```

**失败响应（并发任务数超过限制）**：

```json
{
  "code": 400,
  "message": "当前并发任务数已达上限（最多 3 个），请稍后再试",
  "data": {
    "currentRunningTasks": 3,
    "maxAllowed": 3
  }
}
```

**说明**：
- 接口立即返回，文件已落盘到 `uploads/batch-import/{taskId}/`
- 任务状态为 `pending`，等待用户触发预检查
- 前端跳转到预检查页面或提示用户点击"预检查"按钮

#### 3.2.2 执行预检查

`POST /api/hse/batch-import/tasks/:id/precheck`

**说明**：
- 仅 `status=pending` 的任务可预检查
- 对所有 pending items 执行：
  1. 文件校验（扩展名、大小、魔术字节）
  2. SHA-256 hash 计算
  3. 重复文件检测（hash 查重）
- 生成预检查报告，更新 `precheck_result` 字段
- 任务状态变为 `prechecked`

**响应**：

```json
{
  "code": 200,
  "message": "预检查完成",
  "data": {
    "taskId": 1001,
    "status": "prechecked",
    "totalCount": 120,
    "validCount": 115,
    "invalidCount": 3,
    "duplicateCount": 2,
    "items": [
      {
        "itemId": 2001,
        "fileName": "应急预案A.pdf",
        "fileSize": 2359296,
        "precheckStatus": "passed",
        "precheckMessage": "文件校验通过"
      },
      {
        "itemId": 2002,
        "fileName": "病毒.exe",
        "fileSize": 1048576,
        "precheckStatus": "failed",
        "precheckMessage": "不支持的文件类型: .exe"
      },
      {
        "itemId": 2003,
        "fileName": "安全生产责任制.pdf",
        "fileSize": 524288,
        "precheckStatus": "failed",
        "precheckMessage": "重复文件，已存在于任务 BI20260718003"
      }
    ]
  }
}
```

#### 3.2.3 确认执行

`POST /api/hse/batch-import/tasks/:id/confirm`

**说明**：
- 仅 `status=prechecked` 的任务可确认执行
- 确认后任务状态变为 `confirmed`，然后通过 `setImmediate` 启动 `processTask`
- 状态从 `confirmed` → `processing`

**请求**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| skipInvalid | boolean | 否 | 是否跳过不合法文件（默认 true） |
| skipDuplicate | boolean | 否 | 是否跳过重复文件（默认 true） |

**响应**：

```json
{
  "code": 200,
  "message": "已确认执行，导入任务开始处理",
  "data": {
    "taskId": 1001,
    "status": "processing",
    "estimatedSeconds": 180
  }
}
```

#### 3.2.4 任务进度轮询

`GET /api/hse/batch-import/tasks/:id/progress`

**响应**（轻量，仅返回进度数据）：

```json
{
  "code": 200,
  "data": {
    "taskId": 1001,
    "status": "processing",
    "progress": 65,
    "totalCount": 120,
    "successCount": 70,
    "failCount": 8,
    "skippedCount": 5,
    "pendingCount": 37,
    "currentItem": "安全生产责任制.pdf",
    "estimatedRemainingSeconds": 60
  }
}
```

**轮询策略**：
- 前端每 2 秒轮询一次
- 任务状态变为 `completed` / `failed` / `cancelled` 后停止轮询
- 单次轮询响应 < 50ms（仅查询汇总字段，不查明细）

#### 3.2.5 任务详情

`GET /api/hse/batch-import/tasks/:id`

**响应**：

```json
{
  "code": 200,
  "data": {
    "taskId": 1001,
    "taskNo": "BI20260719001",
    "importType": "document",
    "importVersion": "v1.0",
    "enterpriseId": 1,
    "departmentId": 5,
    "businessScope": { "categoryId": 5 },
    "status": "completed",
    "progress": 100,
    "totalCount": 120,
    "successCount": 105,
    "failCount": 12,
    "skippedCount": 3,
    "pendingCount": 0,
    "precheckResult": {
      "validCount": 115,
      "invalidCount": 3,
      "duplicateCount": 2
    },
    "resultSummary": {
      "byErrorType": {
        "BIZ_ERROR": 5,
        "PARSE_ERROR": 2,
        "DB_ERROR": 1,
        "OVERSIZE": 2
      },
      "byCategory": { "责任制": 30, "应急预案": 25 }
    },
    "createdBy": "admin",
    "createdAt": "2026-07-19T10:00:00Z",
    "precheckedAt": "2026-07-19T10:00:30Z",
    "confirmedAt": "2026-07-19T10:01:00Z",
    "startedAt": "2026-07-19T10:01:01Z",
    "completedAt": "2026-07-19T10:04:25Z"
  }
}
```

#### 3.2.6 任务明细列表

`GET /api/hse/batch-import/tasks/:id/items?status=failed&page=1&pageSize=20`

**响应**：

```json
{
  "code": 200,
  "data": {
    "list": [
      {
        "id": 2001,
        "taskId": 1001,
        "seqNo": 5,
        "originalName": "应急预案演练记录.doc",
        "fileSize": 5242880,
        "fileType": ".doc",
        "status": "failed",
        "precheckStatus": "passed",
        "targetTable": "document_files",
        "targetId": null,
        "errorCode": "BIZ_ERROR",
        "errorMessage": "分类 ID 99 不存在",
        "retryCount": 0,
        "maxRetry": 3,
        "completedAt": "2026-07-19T10:02:15Z"
      }
    ],
    "total": 12,
    "page": 1,
    "pageSize": 20
  }
}
```

#### 3.2.7 失败重试

`POST /api/hse/batch-import/items/:id/retry`

**说明**：
- 仅 `status=failed` 且 `error_code` 在可重试列表中的明细可重试
- 可重试错误码：`BIZ_ERROR` / `DB_ERROR` / `UNKNOWN`
- 重试次数 +1，状态变为 `retrying` → `processing`
- 重试达到 `max_retry` 仍失败，最终状态为 `failed`
- 重试同样异步执行，前端继续轮询
- 写入操作日志（sys_operation_log, action=retry）

**响应**：

```json
{
  "code": 200,
  "message": "重试已提交",
  "data": {
    "itemId": 2001,
    "status": "retrying",
    "retryCount": 1,
    "maxRetry": 3
  }
}
```

#### 3.2.8 导出结果报表

`GET /api/hse/batch-import/tasks/:id/export`

**实现**：使用现有 `xlsx` 库生成 Excel，包含三个 Sheet：
- Sheet1「任务概览」：任务信息 + 统计数据 + 预检查结果
- Sheet2「明细列表」：所有文件的处理结果
- Sheet3「失败清单」：仅失败的文件及失败原因

**响应**：
- Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Content-Disposition: `attachment; filename="batch-import-result-{taskNo}.xlsx"`

#### 3.2.9 下载导入模板

`GET /api/hse/batch-import/templates/:type`

**支持的模板类型**：

| type 值 | 模板名称 | import_version | 用途 |
|---------|---------|---------------|------|
| `document` | 安全资料导入模板 | v1.0 | 资料批量导入的分类映射模板 |
| `standard_clause` | 标准条款导入模板 | v1.0 | 条款批量导入的 Excel 格式模板 |
| `safety_record` | 安全记录导入模板 | v1.0 | 安全记录批量导入的 Excel 格式模板（预留） |

**响应**：
- Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Content-Disposition: `attachment; filename="hse-import-template-{type}-v1.0.xlsx"`
- Header 中包含 `X-Import-Version: v1.0`

**标准条款导入模板内容**：

| 列 | 列名 | 必填 | 说明 |
|----|------|------|------|
| A | clause_code | 是 | 条款编码（如 1.1.1） |
| B | clause_title | 是 | 条款标题 |
| C | clause_content | 是 | 条款内容 |
| D | parent_code | 否 | 父条款编码（三级层级） |
| E | clause_level | 是 | 条款层级（1/2/3） |
| F | standard_code | 否 | 关联标准编码 |
| G | status | 否 | 状态（active/inactive） |

**安全资料导入模板内容**：

| 列 | 列名 | 必填 | 说明 |
|----|------|------|------|
| A | file_name | 是 | 文件名（不含路径） |
| B | category_code | 是 | 分类编码（如 safety_policy） |
| C | summary | 否 | 文件摘要 |
| D | valid_start_date | 否 | 有效期开始（YYYY-MM-DD） |
| E | valid_end_date | 否 | 有效期结束（YYYY-MM-DD） |

---

## 四、后端服务设计

### 4.1 新增文件

| 文件 | 类型 | 说明 |
|------|------|------|
| `server/services/batchImportService.js` | 新增 | 批量导入核心服务 |
| `server/routes/hse-batch-import.js` | 新增 | 批量导入路由 |
| `server/sql/hse_batch_import_v58_migration.sql` | 新增 | 数据库迁移 |
| `server/test/sprint5-batch-import-test.js` | 新增 | 单元测试 |
| `server/data/templates/` | 新增 | 导入模板文件目录（3 个 Excel 模板 + import_version） |

### 4.2 batchImportService.js 方法清单

```javascript
// ============================================================
// 核心方法（公共）
// ============================================================

/**
 * 创建批量导入任务
 * - 并发任务数检查（PostgreSQL 查询 processing 任务数 ≤ 3）
 * - 接收已落盘的文件列表（multer 已完成）
 * - 生成任务编号 BI{yyyyMMdd}{3位序号}
 * - 写入 hse_batch_import_tasks（含 import_version + enterprise_id + department_id）
 * - 批量写入 hse_batch_import_items（每个文件一条，status=pending）
 * - 写入操作日志（sys_operation_log, action=create）
 * @returns { taskId, taskNo, totalCount, status, importVersion }
 */
async createTask({ importType, importVersion, enterpriseId, departmentId, businessScope, files, createdBy, req })

/**
 * 执行预检查
 * - 仅 status=pending 可调用
 * - 更新 task.status=prechecking
 * - 遍历所有 pending items：
 *     1. 文件校验（类型/大小/魔术字节）
 *     2. SHA-256 hash 计算
 *     3. 重复文件检测（hash 查重）
 * - 更新 item.precheck_status + precheck_message
 * - 更新 task.precheck_result + status=prechecked
 * - 写入操作日志（action=precheck）
 * @returns { totalCount, validCount, invalidCount, duplicateCount, items: [...] }
 */
async precheckTask(taskId)

/**
 * 确认执行
 * - 仅 status=prechecked 可调用
 * - 更新 task.status=confirmed, confirmed_at=NOW()
 * - 写入操作日志（action=confirm）
 * - setImmediate(() => processTask(taskId))
 * @returns { taskId, status }
 */
async confirmAndExecute(taskId, { skipInvalid, skipDuplicate }, operator)

/**
 * 异步处理任务
 * - 更新 task.status=processing, started_at=NOW()
 * - 写入操作日志（action=start）
 * - 遍历所有 prechecked 且未被跳过的 items，逐个调用 processItem
 * - 每处理 5 个 item 刷新一次 task.progress
 * - 全部完成后更新 task.status=completed, completed_at=NOW()
 * - 生成 result_summary
 * - 写入操作日志（action=complete）
 * - 发送通知给 createdBy
 */
async processTask(taskId)

/**
 * 处理单个明细
 * - 更新 item.status=processing
 * - 根据 importType 分发到对应业务 Service
 * - 更新 item.status + target_id / error_code / error_message
 * - 累加 task.success_count / fail_count
 */
async processItem(itemId)

/**
 * 失败重试
 * - 校验 status=failed 且 retry_count < max_retry
 * - 校验 error_code 在可重试列表中
 * - 写入操作日志（action=retry）
 * - 重置 status=retrying, retry_count+1
 * - setImmediate(() => processItem(itemId))
 */
async retryItem(itemId, operator)

/**
 * 取消任务
 * - 仅 pending/prechecked/processing 可取消
 * - status=cancelled，未处理 items 标记为 skipped
 * - 写入操作日志（action=cancel）
 */
async cancelTask(taskId, operator)

/**
 * 查询任务列表
 * - 支持按 importType / status / createdBy / enterpriseId / departmentId 筛选
 * - 数据隔离：group_admin 可见全部，其他用户仅见本企业/部门
 * - 分页
 */
async listTasks({ page, pageSize, importType, status, createdBy, enterpriseId, departmentId, userRole, userEnterpriseId, userDepartmentId })

/**
 * 查询任务详情
 * - 含预检查结果 + 结果汇总
 * - 数据隔离校验：非 group_admin 只能查看本企业/部门任务
 */
async getTaskDetail(taskId, userRole, userEnterpriseId)

/**
 * 查询任务进度（轻量）
 * - 仅返回计数字段，不查明细
 */
async getTaskProgress(taskId)

/**
 * 查询任务明细列表
 * - 支持按 status 筛选
 * - 分页
 */
async listTaskItems({ taskId, status, page, pageSize })

/**
 * 生成结果报表（Excel）
 * - 调用 xlsx 库
 * - 返回 Buffer
 */
async exportTaskResult(taskId)

/**
 * 获取导入模板
 * - 根据 type 返回对应的模板文件 Buffer
 * - 返回 { buffer, filename, importVersion }
 */
async getTemplate(type)

/**
 * 解析标准条款 Excel
 * - 使用 xlsx.readFile 读取 Excel
 * - sheet_to_json 解析为 JSON 数组
 * - 字段映射（clause_code → code 等）
 * - 返回 clauses 数组
 */
async parseStandardExcel(filePath)

// ============================================================
// 辅助方法（私有）
// ============================================================

/**
 * 生成任务编号 BI{yyyyMMdd}{3位序号}
 */
async _generateTaskNo()

/**
 * 计算文件 SHA-256（流式读取，避免大文件内存溢出）
 * - 使用 Node.js 内置 crypto 模块（无新增依赖）
 */
_calculateFileHash(filePath)

/**
 * 文件校验
 * - 扩展名白名单（按 importType）
 * - 文件大小限制（100MB）
 * - 魔术字节校验（调用 upload.validateUploadedFile）
 * - 返回 { valid: boolean, errorCode?: string, errorMessage?: string }
 */
_validateFile(file, importType)

/**
 * 重复文件检测
 * - 按 file_hash 在 hse_batch_import_items（历史成功记录）+ 目标业务表查重
 * - 命中则返回 { duplicated: true, existingTaskId, existingTargetId, existingFileName }
 */
async _checkDuplicate(fileHash, importType)

/**
 * 分发到业务 Service
 * - document        → documentService.uploadFile（传入 enterprise_id + department_id）
 * - standard_clause → parseStandardExcel → standardService.batchImportClauses
 * - safety_record   → MVP 暂不实现，留作扩展点
 */
async _dispatchToBusiness(item, importType, businessScope, enterpriseId, departmentId, user)

/**
 * 更新任务进度（每 5 个 item 刷新一次）
 */
async _updateTaskProgress(taskId)

/**
 * 生成结果汇总
 * - 按 error_code 分组统计
 * - 按 category 分组统计
 */
async _buildResultSummary(taskId)

/**
 * 发送任务完成通知
 * - 复用 notificationService.createNotification
 * - type=system, bizType=batch_import
 */
async _notifyTaskCompletion(task)

/**
 * 写入操作日志
 * - 复用 sys_operation_log 表
 * - 字段：user_id, username, action, module='batch_import', description, ip_address, user_agent, status_code, detail
 */
async _writeOperationLog({ req, userId, username, action, description, statusCode, detail })

/**
 * 检查并发任务数
 * - 使用 PostgreSQL 查询 status='processing' 的任务数
 * - 返回 { currentCount, maxAllowed: 3, canCreate: boolean }
 * - 不使用任何队列库，零新增依赖
 */
async _checkConcurrentLimit()
```

### 4.3 业务分发逻辑

#### 资料导入（document）

```
item（文件）
  │
  ▼
documentService.uploadFile(file, extra, user, req)
  ├─ 参数：
  │   - file: multer 文件对象（需构造）
  │   - extra: { categoryId, summary, validStartDate, validEndDate, remindDays, metadata }
  │   - user: { username }
  │   - req: Express 请求对象（用于生成 fileUrl）
  └─ 返回：{ id, fileUuid, originalName, ... }（camelRow 格式）
```

#### 标准条款导入（standard_clause）

```
item（Excel 文件）
  │
  ▼
batchImportService.parseStandardExcel(filePath)
  ├─ xlsx.readFile(filePath)
  ├─ 获取第一个 sheet
  ├─ xlsx.utils.sheet_to_json(sheet)
  ├─ 字段映射：
  │   - clause_code → code
  │   - clause_title → clauseTitle
  │   - clause_content → clauseContent
  │   - clause_level → level
  │   - parent_code → parentCode（需转换为 parent_id）
  │   - standard_code → standardCode
  │   - status → status
  └─ 返回 clauses: [...]（JSON 数组）
       │
       ▼
standardService.batchImportClauses(clauses, user)
  └─ 返回 { total, success, failed, errors: [...] }
```

### 4.4 并发控制实现

**零新增依赖**，使用 PostgreSQL 查询实现：

```javascript
// 伪代码（不实现）
async _checkConcurrentLimit() {
  const res = await pool.query(
    `SELECT COUNT(*) as count 
     FROM hse_batch_import_tasks 
     WHERE status IN ('processing', 'confirmed') 
       AND is_deleted = FALSE`
  );
  const currentCount = parseInt(res.rows[0].count, 10);
  return {
    currentCount,
    maxAllowed: 3,
    canCreate: currentCount < 3
  };
}
```

**计数范围**：
- 包含 `processing`（正在处理中）
- 包含 `confirmed`（已确认，即将开始）
- 不包含 `pending` / `prechecking` / `prechecked`（还没确认执行）

**竞态说明**：
- 极端情况下（多个请求同时创建），可能有 4-5 个任务同时 processing
- 不会导致系统崩溃，仅是性能略有下降
- 属于可接受风险，不引入队列库来解决

### 4.5 预检查流程

```
用户上传文件 → 创建任务（pending）
  │
  ▼
用户点击"预检查" → precheckTask(taskId)
  │
  ├─ 更新 task.status = prechecking
  │
  ├─ 遍历每个 item：
  │    │
  │    ├─ 1. 文件校验
  │    │   ├─ 扩展名白名单检查 → 不合法 → precheck_status=failed, message=INVALID_TYPE
  │    │   ├─ 文件大小检查（≤100MB）→ 超大小 → precheck_status=failed, message=OVERSIZE
  │    │   └─ 魔术字节校验 → 不合法 → precheck_status=failed, message=INVALID_SIGNATURE
  │    │
  │    ├─ 2. SHA-256 hash 计算
  │    │
  │    └─ 3. 重复文件检测
  │        └─ hash 命中历史成功记录 → precheck_status=failed, message=DUP_FILE
  │
  ├─ 统计 validCount / invalidCount / duplicateCount
  │
  ├─ 更新 task.precheck_result（含统计 + 前 50 条明细）
  ├─ 更新 task.status = prechecked
  ├─ 更新 task.prechecked_at = NOW()
  │
  └─ 返回预检查结果
       │
       ▼
前端展示预检查报告
  ├─ 通过的文件（绿色）
  ├─ 不合法的文件（红色，显示原因）
  └─ 重复的文件（黄色，显示重复来源）
  │
  └─ [确认导入] 按钮 → 调用 confirmAndExecute
```

### 4.6 文件存储策略

```
uploads/batch-import/
  └─ {taskId}/
       ├─ {timestamp}_{random}_{originalName}.ext   ← 接收时落盘
       ├─ ...
       └─ (任务完成后)
          ├─ 成功文件：由业务 Service 移动到对应业务目录（如 uploads/documents/）
          └─ 失败文件：保留在 batch-import/{taskId}/ 下，7 天后清理

server/data/templates/
  ├─ hse-import-template-document-v1.0.xlsx         ← 资料导入模板
  ├─ hse-import-template-standard_clause-v1.0.xlsx  ← 条款导入模板
  └─ hse-import-template-safety_record-v1.0.xlsx    ← 安全记录导入模板（预留）
```

**清理策略**：
- 定时任务（cron）每天清理 7 天前的失败文件
- 任务记录永久保留（软删除）
- 模板文件版本化命名，更新时保留旧版本

### 4.7 import_version 版本追踪

**用途**：
- 标识导入模板的版本
- 支持未来模板格式升级时的兼容判断
- 便于追溯某批数据使用的模板版本

**使用方式**：

| 场景 | import_version 来源 |
|------|-------------------|
| 创建任务时 | 前端传入（从模板下载的 Header 中获取），默认 v1.0 |
| 模板下载时 | 响应 Header 中 `X-Import-Version: v1.0` |
| 任务记录中 | 保存到 `hse_batch_import_tasks.import_version` 字段 |
| 模板文件命名 | `hse-import-template-{type}-v{version}.xlsx` |

**版本升级策略**：
- 小版本变更（新增可选列）：向后兼容，版本号 v1.1、v1.2...
- 大版本变更（列名调整/必填项变更）：版本号 v2.0，需前端提示用户更新模板

---

## 五、前端页面设计

### 5.1 目录结构

```
apps/web-antd/src/views/hse/batch-import/
  ├─ api.ts                       API 层（就近放置，参考 standard 模式）
  ├─ types.ts                     TypeScript 类型定义
  ├─ index.vue                    批量导入中心列表页
  ├─ BatchImportDrawer.vue        批量导入抽屉（上传 + 预检查 + 确认 + 进度）
  ├─ TaskDetailDrawer.vue         任务详情抽屉（明细 + 重试）
  └─ components/
       ├─ FileDropZone.vue        拖拽上传区域
       ├─ FileListTable.vue       文件列表表格
       ├─ PrecheckPanel.vue       预检查结果面板
       ├─ ProgressPanel.vue       进度面板（环形+数字）
       ├─ ResultSummary.vue       结果统计卡片
       ├─ ItemRetryButton.vue     失败重试按钮
       └─ TemplateDownload.vue    模板下载按钮
```

### 5.2 列表页（index.vue）

```
┌──────────────────────────────────────────────────────────────┐
│  批量导入中心                                                 │
├──────────────────────────────────────────────────────────────┤
│  [统计卡片]                                                   │
│  ┌─总任务─┐ ┌─本月任务─┐ ┌─成功率─┐ ┌─进行中─┐                │
│  │   56   │ │    12    │ │  92.3% │ │    2   │                │
│  └────────┘ └──────────┘ └────────┘ └────────┘                │
├──────────────────────────────────────────────────────────────┤
│  筛选：[导入类型 ▼] [状态 ▼] [企业 ▼] [部门 ▼] [查询]        │
│                                                              │
│  [+ 新建批量导入]    [下载导入模板]                            │
├──────────────────────────────────────────────────────────────┤
│  任务编号 │ 类型 │ 企业 │ 部门 │ 总数 │ 成功 │ 失败 │ 状态 │ 创建人 │
│  BI...001 │ 资料 │ 宁津 │ 总部 │ 120  │ 105  │ 12   │ 完成 │ admin │
│  BI...002 │ 条款 │ 宁津 │ 总部 │ 1    │ 1    │ 0    │ 完成 │ admin │
│  BI...003 │ 资料 │ 区域A│ 运营 │ 80   │ -    │ -    │ 处理中│admin │
│                                                              │
│  操作：[查看详情] [导出结果] [取消]                           │
└──────────────────────────────────────────────────────────────┘
```

### 5.3 批量导入抽屉（BatchImportDrawer.vue）

**Step 1: 选择导入类型 + 配置参数**

```
┌──────────────────────────────────────────────────────────────┐
│  新建批量导入                                          [x]    │
├──────────────────────────────────────────────────────────────┤
│  Step 1: 选择导入类型                                        │
│  ◉ 安全资料    ◯ 标准条款    ◯ 安全记录（暂未开放）           │
│                                                              │
│  Step 2: 配置业务参数                                        │
│  所属企业：[选择企业 ▼]    所属部门：[选择部门 ▼]              │
│  资料分类：[选择分类 ▼] *                                    │
│  有效期至：[2026-12-31]    提醒天数：[30]                    │
│  模板版本：v1.0（自动检测）                                   │
│                                                              │
│  Step 3: 上传文件                                            │
│  ┌────────────────────────────────────────────────────────┐ │
│  │     📂  拖拽文件到此处，或 [点击选择]                    │ │
│  │                                                          │ │
│  │     支持 PDF/Word/Excel/图片，单个文件 ≤ 100MB          │ │
│  │     单次最多 500 个文件，最多 3 个任务同时运行           │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Step 4: 文件列表（已选择 5 个文件，共 7.8MB）                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ # │ 文件名              │ 大小   │ 类型 │ 状态   │ 操作│ │
│  │ 1 │ 安全生产责任制.pdf  │ 2.3MB  │ PDF  │ 待上传 │ [×] │ │
│  │ 2 │ 应急预案.docx       │ 1.1MB  │ DOCX │ 待上传 │ [×] │ │
│  │ 3 │ 培训记录.xlsx       │ 156KB  │ XLSX │ 待上传 │ [×] │ │
│  │ 4 │ 现场照片.jpg        │ 3.5MB  │ JPG  │ 待上传 │ [×] │ │
│  │ 5 │ 设备清单.xls        │ 892KB  │ XLS  │ 待上传 │ [×] │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│                              [取消]    [下一步：预检查]       │
└──────────────────────────────────────────────────────────────┘
```

**Step 2: 预检查结果**

```
┌──────────────────────────────────────────────────────────────┐
│  预检查结果                                            [x]    │
├──────────────────────────────────────────────────────────────┤
│  任务编号：BI20260719001    模板版本：v1.0                     │
│  所属企业：宁津环卫    所属部门：总部                          │
│                                                              │
│  ┌─ 预检查统计 ────────────────────────────────────────────┐ │
│  │  ┌─总计─┐ ┌─通过─┐ ┌─不合法─┐ ┌─重复─┐                  │ │
│  │  │  120  │ │  115 │ │   3    │ │  2   │                  │ │
│  │  └──────┘ └──────┘ └────────┘ └──────┘                  │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                              │
│  筛选：[全部 ▼] [搜索文件名____]                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ # │ 文件名              │ 大小   │ 状态  │ 说明        │ │
│  │ 1 │ 应急预案A.pdf       │ 2.3MB  │ ✅ 通过 │ -          │ │
│  │ 2 │ 培训记录.xlsx       │ 156KB  │ ✅ 通过 │ -          │ │
│  │ 3 │ 病毒.exe            │ 1.0MB  │ ❌ 不合法 │ 不支持的类型│ │
│  │ 4 │ 旧版预案.doc        │ 1.2MB  │ ⚠️ 重复 │ 已存在于BI...003││
│  │ 5 │ 超大文件.pdf        │ 120MB  │ ❌ 不合法 │ 超过100MB  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ☑ 跳过不合法文件    ☑ 跳过重复文件                            │
│                                                              │
│                          [上一步]    [确认导入]    [取消]     │
└──────────────────────────────────────────────────────────────┘
```

**Step 3: 处理进度**

```
┌──────────────────────────────────────────────────────────────┐
│  批量导入进行中                                       [x]    │
├──────────────────────────────────────────────────────────────┤
│  任务编号：BI20260719001                                     │
│  所属企业：宁津环卫    所属部门：总部                          │
│                                                              │
│         ╭──────────╮                                         │
│        │     65%     │  当前：安全生产责任制.pdf              │
│         ╰──────────╯  剩余约 60 秒                            │
│                                                              │
│  ┌─ 实时统计 ─────────────────────────────────────────────┐ │
│  │  总数 120  │  成功 70  │  失败 8  │  跳过 5 │ 待处理 37  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─ 文件处理列表（前 10 条） ──────────────────────────────┐ │
│  │ # │ 文件名              │ 状态   │ 说明                │ │
│  │ 1 │ 应急预案A.pdf       │ ✅ 成功 │ -                  │ │
│  │ 2 │ 培训记录.xlsx       │ ✅ 成功 │ -                  │ │
│  │ 3 │ 旧版预案.doc        │ ⏭ 跳过  │ 重复文件           │ │
│  │ 4 │ 现场照片.jpg        │ ❌ 失败 │ 分类不存在         │ │
│  │ 5 │ 处理中：责任制.pdf │ ⏳ 处理 │ -                  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  [查看全部明细]    [任务完成后查看结果]                       │
└──────────────────────────────────────────────────────────────┘
```

### 5.4 任务详情抽屉（TaskDetailDrawer.vue）

```
┌──────────────────────────────────────────────────────────────┐
│  任务详情 - BI20260719001                              [x]   │
├──────────────────────────────────────────────────────────────┤
│  [基本信息]                                                   │
│  类型：安全资料   版本：v1.0   企业：宁津环卫   部门：总部       │
│  创建人：admin   创建时间：2026-07-19 10:00:00                │
│  预检查：10:00:30   确认执行：10:01:00   开始：10:01:01       │
│  完成：10:04:25   耗时：3m24s                                 │
│                                                              │
│  [预检查结果]                                                 │
│  ┌─总计─┐ ┌─通过─┐ ┌─不合法─┐ ┌─重复─┐                      │
│  │  120  │ │  115 │ │   3    │ │  2   │                      │
│  └──────┘ └──────┘ └────────┘ └──────┘                      │
│                                                              │
│  [结果统计]                                                   │
│  ┌─总数量─┐ ┌─成功─┐ ┌─失败─┐ ┌─跳过─┐ ┌─成功率─┐           │
│  │  120   │ │  105 │ │  12  │ │   3  │ │ 87.5%  │           │
│  └────────┘ └──────┘ └──────┘ └──────┘ └────────┘           │
│                                                              │
│  [失败原因分布]                                               │
│  BIZ_ERROR    ████████ 5                                     │
│  PARSE_ERROR  ██ 2                                           │
│  DB_ERROR     █ 1                                            │
│  OVERSIZE     ██ 2                                           │
│                                                              │
│  [明细筛选]   [全部 ▼] [搜索文件名____]                      │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ # │ 文件名              │ 大小   │ 状态  │ 失败原因 │ 操作│ │
│  │ 4 │ 现场照片.jpg        │ 3.5MB  │ 失败  │ 分类不存在│ [重试]│ │
│  │ 7 │ 旧版预案.doc        │ 1.2MB  │ 跳过  │ 重复文件 │  -   │ │
│  │ 12│ 设备清单.xls        │ 892KB  │ 失败  │ 解析失败 │  -   │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  [导出结果报表]    [下载导入模板]                              │
└──────────────────────────────────────────────────────────────┘
```

### 5.5 复用组件清单

| 现有能力 | 用途 |
|---------|------|
| `Page` (@vben/common-ui) | 页面容器 |
| `useVbenDrawer` | 抽屉组件 |
| `useAccess` | 权限控制（基于角色） |
| `requestClient` (@vben/request) | API 调用 |
| Antd Vue `Upload.Dragger` | 拖拽上传 |
| Antd Vue `Table` | 文件列表 |
| Antd Vue `Progress` | 进度条 |
| Antd Vue `Statistic` | 统计卡片 |
| Antd Vue `Tag` | 状态标签 |
| Antd Vue `Popconfirm` | 取消任务确认 |
| Antd Vue `Select` | 企业/部门/分类选择 |
| Antd Vue `Steps` | 步骤条（上传→预检查→处理→完成） |
| `message` / `notification` | 提示 |
| `IconifyIcon` (@vben/icons) | 图标 |
| `HseStatCard` (#/components/hse/) | 统计卡片 |
| `$t` i18n | 国际化 |

### 5.6 i18n 规划

在 `locales/langs/zh-CN/hse.json` 新增 `batchImport` 模块：

```json
{
  "batchImport": {
    "title": "批量导入中心",
    "newTask": "新建批量导入",
    "downloadTemplate": "下载导入模板",
    "importType": {
      "document": "安全资料",
      "standard_clause": "标准条款",
      "safety_record": "安全记录"
    },
    "status": {
      "pending": "待预检查",
      "prechecking": "预检查中",
      "prechecked": "待确认",
      "confirmed": "已确认",
      "processing": "处理中",
      "completed": "已完成",
      "failed": "已失败",
      "cancelled": "已取消"
    },
    "itemStatus": {
      "pending": "待处理",
      "prechecking": "预检查中",
      "prechecked": "预检查通过",
      "invalid": "不合法",
      "duplicate": "重复文件",
      "processing": "处理中",
      "success": "成功",
      "failed": "失败",
      "skipped": "跳过",
      "retrying": "重试中"
    },
    "precheck": {
      "title": "预检查结果",
      "total": "总计",
      "passed": "通过",
      "invalid": "不合法",
      "duplicate": "重复",
      "skipInvalid": "跳过不合法文件",
      "skipDuplicate": "跳过重复文件",
      "confirm": "确认导入"
    },
    "limit": {
      "maxFiles": "单次最多 500 个文件",
      "maxFileSize": "单个文件 ≤ 100MB",
      "maxTasks": "当前最多 3 个任务同时运行"
    },
    "error": {
      "tooManyTasks": "当前并发任务数已达上限（最多 3 个），请稍后再试"
    },
    "version": {
      "label": "模板版本",
      "current": "当前版本"
    }
  }
}
```

### 5.7 路由规划

```typescript
// apps/web-antd/src/router/routes/modules/hse-batch-import.ts
const routes: RouteRecordRaw[] = [
  {
    path: '/hse/batch-import',
    name: 'HseBatchImport',
    component: () => import('#/views/hse/batch-import/index.vue'),
    meta: {
      title: '批量导入中心',
      icon: 'lucide:upload-cloud',
      authority: ['admin', 'safety_manager', 'group_admin'],
      order: 50,
      keepAlive: true,
    },
  },
];
```

**路由规范**（从现有代码确认）：
- `authority` 必须为数组
- `icon` 使用 `lucide:` 前缀
- 放入 `modules/` 目录即自动加载
- `keepAlive: true` 启用缓存

---

## 六、权限设计

### 6.1 权限码定义

| 权限码 | 说明 | 适用操作 |
|--------|------|---------|
| `batch_import:create` | 创建批量导入任务 | POST /tasks, POST /tasks/:id/precheck, POST /tasks/:id/confirm, POST /tasks/:id/cancel |
| `batch_import:view` | 查看批量导入任务 | GET /tasks, GET /tasks/:id, GET /tasks/:id/progress, GET /tasks/:id/items, GET /tasks/:id/export, GET /templates/:type |
| `batch_import:retry` | 失败重试 | POST /items/:id/retry |

### 6.2 角色权限矩阵

| 角色 | batch_import:create | batch_import:view | batch_import:retry | 说明 |
|------|---------------------|-------------------|--------------------|------|
| admin | ✅ | ✅ | ✅ | 全部权限 |
| safety_manager | ✅ | ✅ | ✅ | 创建/查看/重试 |
| safety_officer | ❌ | ✅ | ❌ | 仅查看 |
| group_admin | ✅ | ✅ | ✅ | 全部权限（含跨企业） |

### 6.3 数据隔离规则

| 角色 | 数据可见范围 |
|------|-------------|
| admin | 全部企业/部门 |
| group_admin | 全部企业/部门 |
| safety_manager | 当前企业下全部部门 |
| safety_officer | 当前企业当前部门 |

### 6.4 权限校验实现

在路由层复用现有 `requireRole` 中间件，并在 Service 层校验数据权限：

```javascript
// 伪代码（不实现）
const { requireRole } = require('../middleware/auth');

// 创建任务：需要 batch_import:create 权限
router.post('/tasks', requireRole('admin', 'safety_manager', 'group_admin'), async (req, res) => {
  // Service 层进一步校验数据权限
});

// 查看列表：需要 batch_import:view 权限
router.get('/tasks', requireRole('admin', 'safety_manager', 'safety_officer', 'group_admin'), async (req, res) => {
  // 根据用户角色和 enterprise_id/department_id 过滤数据
});

// 失败重试：需要 batch_import:retry 权限
router.post('/items/:id/retry', requireRole('admin', 'safety_manager', 'group_admin'), async (req, res) => {
  // ...
});
```

---

## 七、操作日志设计

### 7.1 复用 sys_operation_log

**复用现有表**：[server/sql/sys_operation_log.sql](file:///f:/deploy/hse-dashboard/server/sql/sys_operation_log.sql)

**表字段**：

| 字段 | 类型 | 批量导入使用 |
|------|------|------------|
| id | SERIAL | 主键 |
| user_id | INTEGER | 操作用户 ID（req.user.id） |
| username | VARCHAR(100) | 操作用户名（req.user.username） |
| action | VARCHAR(50) | 操作类型：create/precheck/confirm/start/retry/complete/cancel |
| module | VARCHAR(100) | 固定：`batch_import` |
| description | TEXT | 操作描述（可读文本） |
| ip_address | VARCHAR(50) | 操作者 IP（req.ip） |
| user_agent | VARCHAR(500) | 浏览器 UA（req.headers['user-agent']） |
| status_code | INTEGER | HTTP 状态码（成功 200，失败 400/500） |
| detail | JSONB | 详情 JSON 对象 |
| created_at | TIMESTAMP WITH TIME ZONE | 操作时间 |

### 7.2 记录的操作类型

| action | 触发时机 | module | description 示例 |
|--------|---------|--------|-----------------|
| `create` | 创建任务成功 | batch_import | 创建批量导入任务 BI20260719001，共 120 个文件，类型：安全资料 |
| `precheck` | 预检查完成 | batch_import | 批量导入任务 BI20260719001 预检查完成：通过 115，不合法 3，重复 2 |
| `confirm` | 用户确认执行 | batch_import | 确认执行批量导入任务 BI20260719001 |
| `start` | 任务开始处理 | batch_import | 批量导入任务 BI20260719001 开始处理 |
| `retry` | 失败明细重试 | batch_import | 重试批量导入明细 ID=2001（第 1 次重试） |
| `complete` | 任务完成 | batch_import | 批量导入任务 BI20260719001 完成：成功 105，失败 12，跳过 3 |
| `cancel` | 任务取消 | batch_import | 取消批量导入任务 BI20260719001 |

### 7.3 detail JSON 结构

```json
{
  "taskId": 1001,
  "taskNo": "BI20260719001",
  "importType": "document",
  "importVersion": "v1.0",
  "enterpriseId": 1,
  "departmentId": 5,
  "totalCount": 120,
  "successCount": 105,
  "failCount": 12,
  "skippedCount": 3
}
```

---

## 八、安全要求

### 8.1 重复文件检测

**方案**：SHA-256 文件指纹

**实现方式**：
- 使用 Node.js 内置 `crypto` 模块（零新增依赖）
- 流式读取文件计算 hash，避免大文件内存溢出

**查重逻辑**：
1. 预检查阶段计算每个文件的 SHA-256
2. 查询 `hse_batch_import_items` 中 `status='success'` 且 `file_hash` 相同的历史记录
3. 查询目标业务表（document_files 等）中是否有相同 hash 的文件
4. 命中则标记为 `duplicate`，error_code=`DUP_FILE`，error_message 注明重复来源

### 8.2 文件类型检查

**三层校验**（复用 upload.js）：

| 层级 | 校验内容 | 实现 |
|------|---------|------|
| L1 | 扩展名白名单 | upload.js createFileFilter |
| L2 | MIME 类型 | upload.js createFileFilter |
| L3 | 文件魔术字节 | upload.js validateUploadedFile |

**各导入类型允许的扩展名**：

| 导入类型 | 允许扩展名 |
|---------|-----------|
| document | .pdf, .doc, .docx, .xls, .xlsx, .jpg, .jpeg, .png |
| standard_clause | .xlsx, .xls, .json |
| safety_record | .xlsx, .xls |

### 8.3 文件大小限制（MVP 限制）

| 限制项 | 值 | 说明 |
|--------|-----|------|
| 单文件大小 | **100 MB** | multer limits.fileSize 配置 |
| 单任务文件数 | **500 个** | multer maxCount 配置 |
| 同时运行任务 | **3 个** | PostgreSQL 查询 processing 任务数 |

### 8.4 失败隔离

**实现方式**：
- 每个 `processItem` 调用包裹在 `try/catch` 中
- 单个失败仅更新该 item 的 status=failed，不影响其他
- 失败信息记录到 `error_code` + `error_message`
- 任务主流程继续执行下一个 item

### 8.5 全流程留痕

**三层留痕**：

| 层级 | 记录内容 | 存储 |
|------|---------|------|
| 任务级 | 任务创建/预检查/确认/开始/完成/取消 + 汇总统计 + 企业/部门 | `hse_batch_import_tasks` |
| 明细级 | 每个文件的预检查结果 + 处理过程 + 失败原因 + 重试历史 | `hse_batch_import_items` |
| 操作级 | 创建/预检查/确认/开始/重试/完成/取消 | `sys_operation_log` |

**查询能力**：
- 任意任务的完整处理历史可查
- 失败原因可追溯到具体文件 + 具体错误码
- 支持按错误类型聚合统计
- 支持按企业/部门筛选

---

## 九、技术要求实现

### 9.1 异步处理

**严格异步原则**：
- HTTP 接口仅负责创建任务 + 接收文件，立即返回
- 文件处理全部在 `setImmediate` 中执行
- 前端通过轮询获取进度

**与 Sprint2/3/4 的异步模式一致**：
- Sprint2：`setImmediate(() => documentAiService.runAnalysis(...))`
- Sprint3：`setImmediate(() => reportService._doGenerateReport(...))`
- Sprint4：`setImmediate(() => standardEvaluationService._doEvaluate(...))`
- Sprint5 批量导入：`setImmediate(() => batchImportService.processTask(taskId))`

### 9.2 大文件量支持

**支持 500+ 文件**：

| 策略 | 说明 |
|------|------|
| multer.array maxCount=500 | 一次接收最多 500 个文件 |
| 接收阶段串行落盘 | multer 自动处理，HTTP 长连接保持 |
| 处理阶段串行执行 | 避免数据库连接耗尽 |
| 进度刷新降频 | 每 5 个 item 更新一次进度，减少 DB 写入 |
| 大文件流式 hash | SHA-256 计算使用流式读取，避免内存溢出 |
| 并发任务限制 | 最多 3 个任务同时运行（PostgreSQL 查询控制） |

**预计处理时长**：
- 500 个文件（平均 2MB）约需 10-30 分钟
- 前端轮询每 2 秒一次，单次响应 < 50ms

### 9.3 AI 分析边界（严格遵守）

**批量导入不负责 AI 分析**：

| 阶段 | 责任方 | 说明 |
|------|--------|------|
| 文件上传与落库 | 批量导入中心 | 创建 document_files 记录 |
| AI 分析触发 | Sprint2 documentAiService | 由资料中心原有流程触发（用户手动点击） |
| AI 分析执行 | Sprint2 AI 分析流程 | 独立异步任务 |
| AI 结果展示 | Sprint2 分析结果 Drawer | 独立展示 |

**导入完成后只产生资料**，AI 分析由 Sprint2 已有流程处理。

### 9.4 零新增依赖

**所有依赖均为现有或 Node.js 内置**：

| 依赖 | 用途 | 来源 |
|------|------|------|
| multer | 文件上传 | 现有依赖 |
| xlsx | Excel 解析和生成 | 现有依赖 |
| pg | PostgreSQL 驱动 | 现有依赖 |
| crypto | SHA-256 计算 | Node.js 内置 |
| fs / path | 文件操作 | Node.js 内置 |

**不新增任何 npm 包**。

### 9.5 并发控制实现

**方案**：PostgreSQL 查询，零队列库

**查询语句**：
```sql
SELECT COUNT(*) 
FROM hse_batch_import_tasks 
WHERE status IN ('processing', 'confirmed') 
  AND is_deleted = FALSE
```

**限制**：< 3 时允许创建新任务

**优点**：
- 零新增依赖
- 简单可靠
- 与现有架构一致

**缺点**：
- 极端并发下有竞态（可接受）

### 9.6 降级策略

| 场景 | 降级方案 |
|------|---------|
| 文件接收失败（HTTP 超时） | 已接收文件正常处理，未接收文件不创建记录 |
| 预检查异常 | 任务状态保持 pending，用户可重新触发预检查 |
| 后台处理异常 | 任务状态置为 failed，已处理 item 保留结果 |
| 数据库连接断开 | 单个 item 失败，任务继续，最终汇总失败数 |
| 业务 Service 抛错 | 记录 BIZ_ERROR，可重试 |
| 并发任务数超限 | 返回 TOO_MANY_TASKS 错误，前端提示等待 |

---

## 十、实施计划

### 10.1 Phase 拆分

```
Phase1: 数据库设计与迁移
    │
    ├─ hse_batch_import_v58_migration.sql
    │   ├─ hse_batch_import_tasks（含 import_version + enterprise_id + department_id + precheck_result）
    │   └─ hse_batch_import_items（含 precheck_status + precheck_message）
    ├─ 导入模板文件准备（3 个 Excel + import_version）
    └─ 迁移幂等性测试
         │
         ▼
Phase2: 后端核心服务
    │
    ├─ batchImportService.js
    │   ├─ createTask（并发限制 + 企业/部门 + 操作日志）
    │   ├─ precheckTask（文件校验 + hash 计算 + 重复检测）
    │   ├─ confirmAndExecute（确认 + setImmediate）
    │   ├─ processTask + processItem（操作日志）
    │   ├─ parseStandardExcel（Excel 解析为 JSON）
    │   ├─ getTemplate（模板下载 + import_version）
    │   └─ _writeOperationLog（复用 sys_operation_log）
    ├─ hse-batch-import.js 路由（11 个接口）
    ├─ 在 server/app.js 挂载路由
    └─ 单元测试：创建 + 预检查 + 执行 + 失败隔离 + 并发限制
         │
         ▼
Phase3: 前端列表页 + API
    │
    ├─ views/hse/batch-import/index.vue（企业/部门筛选）
    ├─ api.ts + types.ts（11 个 API）
    ├─ 路由注册（hse-batch-import.ts）
    ├─ i18n 翻译
    └─ 测试：列表查询 + 筛选 + 分页 + 数据隔离
         │
         ▼
Phase4: 前端导入抽屉（三步流程）
    │
    ├─ BatchImportDrawer.vue
    │   ├─ Step1: 类型选择 + 参数配置（企业/部门/模板版本）
    │   ├─ Step2: 拖拽上传 + 文件列表
    │   ├─ Step3: 预检查结果展示 + 确认执行
    │   └─ Step4: 进度面板（2 秒轮询）
    ├─ components/FileDropZone.vue
    ├─ components/FileListTable.vue
    ├─ components/PrecheckPanel.vue
    ├─ components/ProgressPanel.vue
    ├─ components/TemplateDownload.vue
    └─ 测试：500 文件上传 + 预检查 + 进度显示
         │
         ▼
Phase5: 任务详情与重试
    │
    ├─ TaskDetailDrawer.vue
    │   ├─ 基本信息 + 预检查结果 + 结果统计（企业/部门）
    │   ├─ 失败原因分布图
    │   ├─ 明细列表 + 筛选
    │   └─ 失败重试按钮（操作日志）
    ├─ components/ResultSummary.vue
    ├─ components/ItemRetryButton.vue
    └─ 测试：重试流程 + 取消任务 + 导出报表 + 模板下载
         │
         ▼
Phase6: 集成与验收
    │
    ├─ 端到端测试：从上传 → 预检查 → 确认 → 结果导出
    ├─ 500 文件压力测试
    ├─ 重复文件检测测试
    ├─ 失败重试测试
    ├─ 权限测试（数据隔离）
    ├─ 操作日志完整性测试（sys_operation_log）
    └─ 生成 sprint5-batch-import-report.md
```

### 10.2 各 Phase 交付物

| Phase | 后端 | 前端 | 测试 | 文档 |
|-------|------|------|------|------|
| Phase1 | 1 个迁移脚本 + 3 个模板文件 | - | 迁移幂等 | - |
| Phase2 | batchImportService + 路由 | - | 单元测试 | - |
| Phase3 | - | 列表页 + api + 路由 | 列表查询 | - |
| Phase4 | - | 导入抽屉 + 5 个组件 | 预检查 + 进度 | - |
| Phase5 | - | 详情抽屉 + 2 个组件 | 重试 + 导出 | - |
| Phase6 | - | - | 端到端 + 压测 | 开发报告 |

### 10.3 依赖关系

```
Phase1（数据库）→ Phase2（后端）→ Phase3（前端列表）
                                   │
                                   └─→ Phase4（导入抽屉）→ Phase5（详情重试）→ Phase6（集成验收）
```

### 10.4 风险与缓解

| 风险 | 等级 | 缓解措施 |
|------|------|---------|
| 大文件上传超时 | 中 | 配置 nginx/proxy 超时时间，前端提示 |
| 数据库连接耗尽 | 中 | 单任务串行处理，并发任务限制为 3 |
| 内存溢出（大文件 hash） | 低 | 使用流式读取计算 hash |
| Excel 解析性能 | 低 | 使用 xlsx.readFile，大文件提示 |
| 权限越权访问 | 中 | Service 层强制校验 enterprise_id/department_id |
| 重复文件堆积 | 中 | SHA-256 重复检测，预检查阶段标记 |
| 并发任务竞态 | 低 | 接受 4-5 个并发的极端情况，不引入队列库 |
| 模板版本兼容 | 低 | 版本号管理，向后兼容小版本 |

---

## 十一、v1.2 修订内容对照表（v1.1 → v1.2）

| 修订项 | v1.1 | v1.2 | 说明 |
|--------|------|------|------|
| 操作日志表名 | hse_operation_logs | **sys_operation_log** | 基于代码扫描修正，项目中实际表名为 sys_operation_log |
| 操作日志字段 | operator, operation, target_type, target_id | **user_id, username, action, module, description, ip_address, user_agent, status_code, detail** | 修正为实际表结构 |
| 标准条款 Excel 解析 | standardService 负责 | **batchImportService 负责** | standardService 仅接收 JSON，Excel 解析由 batchImportService.parseStandardExcel 实现 |
| 并发控制 | 未明确实现方式 | **PostgreSQL 查询 processing 任务数，最大 3 个** | 不使用队列库，零新增依赖 |
| import_version | 无 | **新增 import_version 字段** | 支持模板版本追踪，模板文件名含版本号 |
| 预检查流程 | 无 | **新增预检查 + 人工确认流程** | 上传 → 预检查 → 人工确认 → 正式执行 |
| 任务状态 | pending/processing/completed/failed/cancelled | **pending/prechecking/prechecked/confirmed/processing/completed/failed/cancelled** | 增加 3 个预检查相关状态 |
| 明细状态 | pending/processing/success/failed/skipped/retrying | **pending/prechecking/prechecked/invalid/duplicate/processing/success/failed/skipped/retrying** | 增加 3 个预检查相关状态 |
| 接口数量 | 9 个 | **11 个** | 新增 precheck 和 confirm 接口 |
| 红线约束 | 7 条 | **8 条** | 新增"不新增队列依赖" |

---

## 十二、冻结确认

### 12.1 冻结范围

本 v1.2 版本为最终冻结版，冻结以下内容：

| 类别 | 冻结内容 |
|------|---------|
| 数据库 | 表结构、字段、索引、迁移脚本（v58） |
| API 接口 | 11 个接口的路径、方法、参数、响应结构 |
| 后端服务 | batchImportService 方法清单、职责划分 |
| 前端页面 | 目录结构、三个主要页面、7 个组件 |
| 权限设计 | 权限码、角色矩阵、数据隔离规则 |
| 操作日志 | 表名、字段映射、操作类型 |
| 限制参数 | 500 文件、100MB、3 个并发 |

### 12.2 不变原则（红线）

| 编号 | 原则 | 严格遵守 |
|------|------|---------|
| 1 | 不修改 packages/@core/、effects/、themes/ | ✅ |
| 2 | 不修改 auth / JWT / 登录逻辑 | ✅ |
| 3 | 不新增 npm 依赖 | ✅ |
| 4 | 不创建 src/components/ | ✅ |
| 5 | 不修改 upload.js 中间件 | ✅ |
| 6 | 不修改现有业务路由 | ✅ |
| 7 | 批量导入不负责 AI 分析 | ✅ |
| 8 | 不新增队列依赖 | ✅ |

### 12.3 待审核确认项

请审核以下关键设计决策：

1. ✅ **操作日志表名**：使用 sys_operation_log（基于代码扫描修正）
2. ✅ **Excel 解析责任**：batchImportService 负责解析，standardService 仅接收 JSON
3. ✅ **并发控制实现**：PostgreSQL 查询，不使用队列库，最大 3 个并发
4. ✅ **import_version**：新增模板版本字段，支持版本追踪
5. ✅ **预检查流程**：上传 → 预检查 → 人工确认 → 正式执行（三步流程）
6. ✅ **状态机扩展**：任务和明细各增加 3 个预检查相关状态
7. ✅ **API 数量**：从 9 个增加到 11 个（新增 precheck 和 confirm）

---

**本文档为 v1.2 最终冻结版，等待审核后进入编码阶段。**

# HSE V2.0 批量导入中心设计方案

> 版本：v1.0（设计版，待审核）
> 日期：2026-07-19
> 前置基础：Sprint1~4 已稳定交付（V2.0 已达发布条件）
> 设计目标：构建统一的批量导入中心，支持资料/标准条款/安全记录三类业务的批量导入

---

## 〇、设计背景与原则

### 0.1 现状问题

| 模块 | 现状 | 问题 |
|------|------|------|
| 安全资料中心（Sprint1） | `POST /api/hse/documents/upload` 单文件上传 | 无法一次导入 100+ 文件 |
| 标准条款管理（Sprint4） | `POST /api/hse/standard/import` 单 Excel 导入 | 仅支持条款 JSON，不支持多文件并行 |
| 安全记录（隐患/培训/应急等） | 各业务路由均使用 `uploadDocument.single('file')` 附件上传 | 一次仅一个附件，无统一进度 |

### 0.2 设计目标

构建 **HSE Batch Import Center**，作为统一批量入口，支持：

| 导入类型 | 业务来源 | 数据载体 |
|---------|---------|---------|
| 资料批量导入 | document_files | 多文件（PDF/Word/Excel/图片） |
| 标准条款批量导入 | safety_standard_clauses | Excel/JSON |
| 安全记录批量导入 | hazards / training / emergency 等 | Excel + 附件 |

### 0.3 设计原则

1. **异步处理**：HTTP 仅创建任务并立即返回，大量处理在后台进行
2. **失败隔离**：单个文件失败不影响其他文件，支持失败重试
3. **统一入口**：一个 Service + 一个路由模块，复用现有 upload/通知/权限
4. **复用不重造**：调用现有 `documentService.createFile`、`standardService.batchImportClauses` 等方法
5. **全流程留痕**：任务 + 明细双层记录，可追溯每一次导入

### 0.4 红线约束（严格遵守）

| 约束 | 说明 |
|------|------|
| 不修改 packages/@core/、effects/、themes/ | Vben 核心保护 |
| 不修改 auth / JWT / 登录逻辑 | 复用现有 requireRole 中间件 |
| 不新增 npm 依赖 | 复用 multer、xlsx、pg 等现有依赖 |
| 不创建 src/components/ | 业务组件放 views/hse/batch-import/components/ |
| 不修改 upload.js 中间件 | 复用 createUploader，不改动原文件 |
| 不修改现有业务路由 | 通过调用现有 Service 方法集成，不改动原路由 |

---

## 一、架构设计

### 1.1 总体架构图

```
┌──────────────────────────────────────────────────────────────┐
│                    前端（Vben Admin + Antd Vue）              │
│  views/hse/batch-import/                                      │
│  ├─ index.vue              批量导入中心列表页                  │
│  ├─ BatchImportDrawer.vue  拖拽上传 + 文件列表 + 进度抽屉      │
│  ├─ TaskDetailDrawer.vue   任务详情（成功/失败明细 + 重试）    │
│  └─ components/            业务子组件                          │
└────────────────────┬─────────────────────────────────────────┘
                     │  HTTP（异步）
                     ▼
┌──────────────────────────────────────────────────────────────┐
│              后端（Node.js + Express）                         │
│  routes/hse-batch-import.js                                   │
│  ├─ POST /api/hse/batch-import/tasks         创建任务+接收文件 │
│  ├─ GET  /api/hse/batch-import/tasks         任务列表          │
│  ├─ GET  /api/hse/batch-import/tasks/:id     任务详情          │
│  ├─ GET  /api/hse/batch-import/tasks/:id/progress  进度轮询   │
│  ├─ POST /api/hse/batch-import/items/:id/retry     失败重试   │
│  └─ GET  /api/hse/batch-import/tasks/:id/export   结果导出    │
└────────────────────┬─────────────────────────────────────────┘
                     │  调用
                     ▼
┌──────────────────────────────────────────────────────────────┐
│             services/batchImportService.js                    │
│  ├─ createTask             创建任务（写表+入队）               │
│  ├─ processTask            异步处理（setImmediate 触发）       │
│  ├─ processItem            单文件处理（调用业务 Service）      │
│  ├─ retryItem              失败重试                            │
│  ├─ checkDuplicate         重复文件检测（hash）                │
│  ├─ validateFile           文件类型+大小校验                   │
│  └─ buildResultReport      生成结果汇总                        │
└────────────────────┬─────────────────────────────────────────┘
                     │  复用
                     ▼
┌──────────────────────────────────────────────────────────────┐
│             现有业务 Service（不修改）                         │
│  ├─ documentService.createFile         资料落库                │
│  ├─ standardService.batchImportClauses 条款批量落库            │
│  ├─ hazardService / trainingService 等  安全记录业务（按需）   │
│  └─ notificationService.createNotification  通知               │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 异步处理时序

```
前端                                后端
 │                                   │
 │  POST /tasks (files + metadata)   │
 │ ─────────────────────────────────▶│
 │                                   │  1. 创建 task 记录（status=pending）
 │                                   │  2. 批量接收文件到 uploads/batch-import/{taskId}/
 │                                   │  3. 为每个文件创建 item 记录（status=pending）
 │                                   │  4. setImmediate(() => processTask(taskId))
 │  200 {taskId, total, status}      │
 │ ◀─────────────────────────────────│
 │                                   │  5. 后台 processTask：
 │                                   │     - for each item: processItem
 │                                   │     - 校验 → 重复检测 → 调用业务 Service
 │                                   │     - 更新 item.status + target_id/error_message
 │                                   │     - 累加 task.success_count / fail_count
 │                                   │     - 全部完成后 task.status=completed
 │                                   │     - 发送通知
 │                                   │
 │  GET /tasks/:id/progress (轮询)   │
 │ ─────────────────────────────────▶│
 │  200 {total, success, fail, ...}  │
 │ ◀─────────────────────────────────│
 │                                   │
 │  (任务完成后) POST /items/:id/retry  (失败重试)
 │ ─────────────────────────────────▶│
```

### 1.3 与现有模块的关系

```
HSE 批量导入中心（新）
    │
    ├─ 调用 → documentService.createFile（Sprint1，资料落库）
    │       └─ document_files 表
    │
    ├─ 调用 → standardService.batchImportClauses（Sprint4，条款批量）
    │       └─ safety_standard_clauses 表
    │
    ├─ 调用 → 现有各业务 Service（如 hazardService 等，按需扩展）
    │       └─ 各业务表
    │
    ├─ 复用 → upload.js（createUploader + validateUploadedFile）
    ├─ 复用 → notificationService（任务完成通知）
    ├─ 复用 → auth.js（requireRole）
    └─ 复用 → response.js（统一响应格式）
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
    business_scope      JSONB        DEFAULT '{}',            -- 业务范围（分类ID/企业ID/部门等）
    total_count         INTEGER      NOT NULL DEFAULT 0,      -- 总数量
    success_count       INTEGER      NOT NULL DEFAULT 0,      -- 成功数量
    fail_count          INTEGER      NOT NULL DEFAULT 0,      -- 失败数量
    pending_count       INTEGER      NOT NULL DEFAULT 0,      -- 待处理数量
    status              VARCHAR(20)  NOT NULL DEFAULT 'pending',
        -- pending      待处理
        -- processing   处理中
        -- completed    已完成（含失败）
        -- failed       任务级失败（如参数错误）
        -- cancelled    已取消
    progress            INTEGER      NOT NULL DEFAULT 0,       -- 进度百分比 0-100
    file_storage_dir    VARCHAR(512),                          -- 文件临时存储目录
    result_summary      JSONB        DEFAULT '{}',             -- 结果汇总（分类统计/错误类型统计）
    error_message       TEXT,                                  -- 任务级错误信息
    created_by          VARCHAR(64)  NOT NULL,                 -- 创建人
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at          TIMESTAMP,                             -- 开始处理时间
    completed_at        TIMESTAMP,                             -- 完成时间
    updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted          BOOLEAN      NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE  hse_batch_import_tasks IS 'HSE 批量导入任务主表';
COMMENT ON COLUMN hse_batch_import_tasks.task_no        IS '任务编号，业务可读';
COMMENT ON COLUMN hse_batch_import_tasks.import_type    IS '导入类型: document/standard_clause/safety_record';
COMMENT ON COLUMN hse_batch_import_tasks.business_scope IS '业务范围: {categoryId, enterpriseId, department, ...}';
COMMENT ON COLUMN hse_batch_import_tasks.status         IS '任务状态: pending/processing/completed/failed/cancelled';
COMMENT ON COLUMN hse_batch_import_tasks.file_storage_dir IS '本次导入文件的临时存储目录';
COMMENT ON COLUMN hse_batch_import_tasks.result_summary IS '结果汇总: {byErrorType: {...}, byCategory: {...}}';

-- 索引
CREATE UNIQUE INDEX IF NOT EXISTS uk_batch_import_task_no   ON hse_batch_import_tasks (task_no);
CREATE INDEX IF NOT EXISTS idx_batch_import_tasks_type      ON hse_batch_import_tasks (import_type);
CREATE INDEX IF NOT EXISTS idx_batch_import_tasks_status    ON hse_batch_import_tasks (status);
CREATE INDEX IF NOT EXISTS idx_batch_import_tasks_created   ON hse_batch_import_tasks (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_batch_import_tasks_creator   ON hse_batch_import_tasks (created_by);
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
        -- pending      待处理
        -- processing   处理中
        -- success      成功
        -- failed       失败
        -- skipped      跳过（如重复文件）
        -- retrying     重试中
    target_table        VARCHAR(64),                          -- 落库目标表（如 document_files）
    target_id           BIGINT,                               -- 落库目标记录 ID
    error_code          VARCHAR(32),                          -- 错误码（见 2.5）
    error_message       TEXT,                                 -- 失败原因（中文可读）
    retry_count         INTEGER      NOT NULL DEFAULT 0,      -- 已重试次数
    max_retry           INTEGER      NOT NULL DEFAULT 3,      -- 最大重试次数
    metadata            JSONB        DEFAULT '{}',            -- 扩展元数据（如行号、分类等）
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at          TIMESTAMP,                            -- 开始处理时间
    completed_at        TIMESTAMP,                            -- 完成时间
    updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted          BOOLEAN      NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE  hse_batch_import_items IS 'HSE 批量导入明细表';
COMMENT ON COLUMN hse_batch_import_items.task_id      IS '关联任务 ID';
COMMENT ON COLUMN hse_batch_import_items.file_hash    IS '文件 SHA-256，用于重复检测';
COMMENT ON COLUMN hse_batch_import_items.status       IS '明细状态: pending/processing/success/failed/skipped/retrying';
COMMENT ON COLUMN hse_batch_import_items.target_id    IS '落库目标记录 ID（仅逻辑关联，不加外键）';
COMMENT ON COLUMN hse_batch_import_items.error_code   IS '错误码: DUP_FILE/INVALID_TYPE/OVERSIZE/BIZ_ERROR/UNKNOWN';

-- 索引
CREATE INDEX IF NOT EXISTS idx_batch_import_items_task   ON hse_batch_import_items (task_id);
CREATE INDEX IF NOT EXISTS idx_batch_import_items_status ON hse_batch_import_items (status);
CREATE INDEX IF NOT EXISTS idx_batch_import_items_hash   ON hse_batch_import_items (file_hash);
CREATE INDEX IF NOT EXISTS idx_batch_import_items_target ON hse_batch_import_items (target_table, target_id);
```

### 2.4 状态机

#### 任务状态机

```
pending ──(开始处理)──▶ processing ──(全部完成)──▶ completed
                            │
                            └──(任务级异常)──▶ failed

任意状态 ──(用户取消)──▶ cancelled
```

#### 明细状态机

```
pending ──(开始)──▶ processing ──(成功)──▶ success
                        │
                        ├─(失败)──▶ failed ──(重试)──▶ retrying ──▶ processing
                        │
                        └─(重复文件)──▶ skipped
```

### 2.5 错误码定义

| 错误码 | 含义 | 处理建议 |
|--------|------|---------|
| `DUP_FILE` | 重复文件（hash 命中） | 跳过，提示用户 |
| `INVALID_TYPE` | 文件类型不允许 | 永久失败，不重试 |
| `INVALID_SIGNATURE` | 文件魔术字节校验失败 | 永久失败，不重试 |
| `OVERSIZE` | 文件超过大小限制 | 永久失败，不重试 |
| `BIZ_ERROR` | 业务层抛出错误（如分类不存在） | 可重试，修正数据后 |
| `PARSE_ERROR` | Excel/JSON 解析失败 | 永久失败，不重试 |
| `DB_ERROR` | 数据库异常 | 可重试 |
| `UNKNOWN` | 未知异常 | 可重试 |

### 2.6 迁移脚本

新增文件：`server/sql/hse_batch_import_v58_migration.sql`

```sql
-- 幂等迁移：创建批量导入两张表
-- 在事务中执行，IF NOT EXISTS 保证可重复执行

BEGIN;

-- hse_batch_import_tasks（见 2.2）
-- hse_batch_import_items（见 2.3）

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

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/tasks` | 创建批量导入任务（含文件接收） | admin / safety_manager |
| GET | `/tasks` | 任务列表（分页 + 筛选） | 所有登录用户 |
| GET | `/tasks/:id` | 任务详情（含明细汇总） | 所有登录用户 |
| GET | `/tasks/:id/progress` | 任务进度（轮询用，轻量） | 所有登录用户 |
| GET | `/tasks/:id/items` | 任务明细列表（分页 + 状态筛选） | 所有登录用户 |
| POST | `/items/:id/retry` | 失败明细重试 | admin / safety_manager |
| POST | `/tasks/:id/cancel` | 取消任务 | admin / safety_manager |
| GET | `/tasks/:id/export` | 导出结果报表（Excel） | 所有登录用户 |

### 3.2 关键接口详情

#### 3.2.1 创建批量导入任务

`POST /api/hse/batch-import/tasks`

**请求**（multipart/form-data）：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| importType | string | 是 | `document` / `standard_clause` / `safety_record` |
| businessScope | JSON string | 否 | 业务范围（如 `{"categoryId": 5}`） |
| files | File[] | 是 | 多文件，字段名 `files`，最大 200 个 |

**文件数量限制**：
- 单次最大 200 个文件（在 multer `maxCount` 中配置）
- 超过 200 个建议分多次任务

**响应**：

```json
{
  "code": 200,
  "message": "批量导入任务已创建",
  "data": {
    "taskId": 1001,
    "taskNo": "BI20260719001",
    "importType": "document",
    "totalCount": 120,
    "status": "pending",
    "estimatedSeconds": 180
  }
}
```

**说明**：
- 接口立即返回，文件已落盘到 `uploads/batch-import/{taskId}/`
- 后台 `setImmediate(() => processTask(taskId))` 启动异步处理
- 前端通过 `GET /tasks/:id/progress` 轮询进度

#### 3.2.2 任务进度轮询

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
    "pendingCount": 42,
    "currentItem": "安全生产责任制.pdf",
    "estimatedRemainingSeconds": 60
  }
}
```

**轮询策略**：
- 前端每 2 秒轮询一次
- 任务状态变为 `completed` / `failed` / `cancelled` 后停止轮询
- 单次轮询响应 < 50ms（仅查询汇总字段，不查明细）

#### 3.2.3 任务详情

`GET /api/hse/batch-import/tasks/:id`

**响应**：

```json
{
  "code": 200,
  "data": {
    "taskId": 1001,
    "taskNo": "BI20260719001",
    "importType": "document",
    "businessScope": { "categoryId": 5 },
    "status": "completed",
    "progress": 100,
    "totalCount": 120,
    "successCount": 105,
    "failCount": 12,
    "pendingCount": 0,
    "skippedCount": 3,
    "resultSummary": {
      "byErrorType": {
        "DUP_FILE": 3,
        "INVALID_TYPE": 2,
        "BIZ_ERROR": 5,
        "OVERSIZE": 2
      },
      "byCategory": { "责任制": 30, "应急预案": 25 }
    },
    "createdBy": "admin",
    "createdAt": "2026-07-19T10:00:00Z",
    "startedAt": "2026-07-19T10:00:01Z",
    "completedAt": "2026-07-19T10:03:25Z"
  }
}
```

#### 3.2.4 任务明细列表

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

#### 3.2.5 失败重试

`POST /api/hse/batch-import/items/:id/retry`

**说明**：
- 仅 `status=failed` 且 `error_code` 在可重试列表（`BIZ_ERROR`/`DB_ERROR`/`UNKNOWN`）中的明细可重试
- 重试次数 +1，状态变为 `retrying` → `processing`
- 重试达到 `max_retry` 仍失败，最终状态为 `failed`
- 重试同样异步执行，前端继续轮询

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

#### 3.2.6 导出结果报表

`GET /api/hse/batch-import/tasks/:id/export`

**实现**：使用现有 `xlsx` 库生成 Excel，包含两个 Sheet：
- Sheet1「任务概览」：任务信息 + 统计数据
- Sheet2「明细列表」：所有文件的处理结果

**响应**：
- Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Content-Disposition: `attachment; filename="batch-import-result-{taskNo}.xlsx"`

---

## 四、后端服务设计

### 4.1 新增文件

| 文件 | 类型 | 说明 |
|------|------|------|
| `server/services/batchImportService.js` | 新增 | 批量导入核心服务 |
| `server/routes/hse-batch-import.js` | 新增 | 批量导入路由 |
| `server/sql/hse_batch_import_v58_migration.sql` | 新增 | 数据库迁移 |
| `server/test/sprint5-batch-import-test.js` | 新增 | 单元测试 |

### 4.2 batchImportService.js 方法清单

```javascript
// ============================================================
// 核心方法
// ============================================================

/**
 * 创建批量导入任务
 * - 接收已落盘的文件列表
 * - 生成任务编号 BI{yyyyMMdd}{3位序号}
 * - 写入 hse_batch_import_tasks（status=pending）
 * - 批量写入 hse_batch_import_items（每个文件一条，status=pending）
 * - 计算文件 SHA-256（用于重复检测）
 * - setImmediate(() => processTask(taskId)) 异步触发
 * @returns { taskId, taskNo, totalCount, status }
 */
async createTask({ importType, businessScope, files, createdBy })

/**
 * 异步处理任务
 * - 更新 task.status=processing, started_at
 * - 遍历所有 pending items，逐个调用 processItem
 * - 每处理 5 个 item 刷新一次 task.progress
 * - 全部完成后更新 task.status=completed, completed_at
 * - 发送通知给 createdBy
 */
async processTask(taskId)

/**
 * 处理单个明细
 * - 校验文件（类型/大小/魔术字节）
 * - 重复检测（file_hash 在目标表查重）
 * - 根据 importType 分发到对应业务 Service
 * - 更新 item.status + target_id / error_code / error_message
 * - 累加 task.success_count / fail_count
 */
async processItem(itemId)

/**
 * 失败重试
 * - 校验 status=failed 且 retry_count < max_retry
 * - 重置 status=retrying, retry_count+1
 * - setImmediate(() => processItem(itemId))
 */
async retryItem(itemId, operator)

/**
 * 取消任务
 * - 仅 pending/processing 可取消
 * - status=cancelled，未处理 items 标记为 skipped
 */
async cancelTask(taskId, operator)

/**
 * 查询任务列表
 * - 支持按 importType / status / createdBy 筛选
 * - 分页
 */
async listTasks({ page, pageSize, importType, status, createdBy })

/**
 * 查询任务详情
 * - 含汇总统计（result_summary）
 */
async getTaskDetail(taskId)

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

// ============================================================
// 辅助方法
// ============================================================

/**
 * 生成任务编号 BI{yyyyMMdd}{3位序号}
 */
async _generateTaskNo()

/**
 * 计算文件 SHA-256
 * - 使用 Node.js 内置 crypto 模块（无新增依赖）
 */
_calculateFileHash(filePath)

/**
 * 文件校验
 * - 扩展名白名单（按 importType）
 * - 文件大小限制（10MB，沿用 upload.js）
 * - 魔术字节校验（调用 upload.validateUploadedFile）
 */
_validateFile(file, importType)

/**
 * 重复文件检测
 * - 按 file_hash 在 hse_batch_import_items（历史成功记录）+ 目标业务表查重
 * - 命中则返回 { duplicated: true, existingTaskId, existingTargetId }
 */
async _checkDuplicate(fileHash, importType)

/**
 * 分发到业务 Service
 * - document        → documentService.createFile
 * - standard_clause → standardService.batchImportClauses（解析 Excel/JSON 后）
 * - safety_record   → 按业务子类型分发
 */
async _dispatchToBusiness(item, importType, businessScope)

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
```

### 4.3 业务分发逻辑

```javascript
async _dispatchToBusiness(item, importType, businessScope) {
  switch (importType) {
    case 'document':
      // 调用 documentService.createFile
      // 传入: originalName, filePath, fileSize, fileType,
      //       mimeType, categoryId（从 businessScope 取）, uploadedBy
      // 返回: { fileId }
      return await documentService.createFile({...});

    case 'standard_clause':
      // 1. 读取 Excel 文件（xlsx 库）
      // 2. 解析为 clauses 数组
      // 3. 调用 standardService.batchImportClauses
      // 返回: { insertedCount, clauseIds: [] }
      return await standardService.batchImportClauses(clauses, user);

    case 'safety_record':
      // 根据 businessScope.subType 分发:
      //   hazard    → hazardService.createHazard（如有）
      //   training  → trainingService.createRecord
      //   emergency → emergencyService.createPlan
      // 当前 MVP 可仅支持 document + standard_clause，
      // safety_record 留作扩展点
      throw new Error('safety_record 暂未实现，待后续 Sprint');

    default:
      throw new Error(`不支持的导入类型: ${importType}`);
  }
}
```

### 4.4 并发控制策略

```javascript
// 单任务内文件串行处理（避免数据库压力）
// 多任务间天然并发（不同 setImmediate 调用）

async processTask(taskId) {
  const items = await getPendingItems(taskId);
  for (const item of items) {
    if (taskCancelled(taskId)) break;  // 支持取消
    await processItem(item.id);
    await _updateTaskProgress(taskId); // 每 5 个刷一次
  }
  await _finalizeTask(taskId);
}
```

**策略说明**：
- **单任务内串行**：避免一次 100+ 文件并发导致 DB 连接耗尽
- **每 5 个 item 刷新一次进度**：减少 UPDATE 次数
- **支持取消**：每次循环前检查任务状态
- **失败隔离**：单个 item 失败不影响后续，try/catch 包裹

### 4.5 文件存储策略

```
uploads/batch-import/
  └─ {taskId}/
       ├─ {timestamp}_{random}_{originalName}.ext   ← 接收时落盘
       ├─ ...
       └─ (任务完成后)
          ├─ 成功文件：由业务 Service 移动到对应业务目录（如 uploads/documents/）
          └─ 失败文件：保留在 batch-import/{taskId}/ 下，7 天后清理
```

**清理策略**：
- 定时任务（cron）每天清理 7 天前的失败文件
- 任务记录永久保留（软删除）

---

## 五、前端设计

### 5.1 目录结构

```
apps/web-antd/src/views/hse/batch-import/
  ├─ api.ts                       API 层（@vben/request 封装）
  ├─ types.ts                     TypeScript 类型定义
  ├─ index.vue                    批量导入中心列表页
  ├─ BatchImportDrawer.vue        批量导入抽屉（拖拽上传 + 进度）
  ├─ TaskDetailDrawer.vue         任务详情抽屉（明细 + 重试）
  └─ components/
       ├─ FileDropZone.vue        拖拽上传区域
       ├─ FileListTable.vue       文件列表表格
       ├─ ProgressPanel.vue       进度面板（环形+数字）
       ├─ ResultSummary.vue       结果统计卡片
       └─ ItemRetryButton.vue     失败重试按钮
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
│  筛选：[导入类型 ▼] [状态 ▼] [创建人 ▼] [日期范围]  [查询]    │
│                                                              │
│  [+ 新建批量导入]                                            │
├──────────────────────────────────────────────────────────────┤
│  任务编号 │ 类型 │ 总数 │ 成功 │ 失败 │ 状态 │ 创建人 │ 时间 │
│  BI...001 │ 资料 │ 120  │ 105  │ 12   │ 完成 │ admin │ ...  │
│  BI...002 │ 条款 │ 1    │ 1    │ 0    │ 完成 │ admin │ ...  │
│  BI...003 │ 资料 │ 80   │ -    │ -    │ 处理中│admin │ ...  │
│                                                              │
│  操作：[查看详情] [导出结果] [取消]                           │
└──────────────────────────────────────────────────────────────┘
```

### 5.3 批量导入抽屉（BatchImportDrawer.vue）

```
┌──────────────────────────────────────────────────────────────┐
│  新建批量导入                                          [x]    │
├──────────────────────────────────────────────────────────────┤
│  Step 1: 选择导入类型                                        │
│  ◉ 安全资料    ◯ 标准条款    ◯ 安全记录                       │
│                                                              │
│  Step 2: 配置业务参数                                        │
│  资料分类：[选择分类 ▼] *                                    │
│  有效期至：[2026-12-31]    提醒天数：[30]                    │
│                                                              │
│  Step 3: 上传文件                                            │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                                                          │ │
│  │     📂  拖拽文件到此处，或 [点击选择]                    │ │
│  │                                                          │ │
│  │     支持 PDF/Word/Excel/图片，单个文件 ≤ 10MB           │ │
│  │     单次最多 200 个文件                                  │ │
│  │                                                          │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Step 4: 文件列表（已选择 5 个文件）                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ # │ 文件名              │ 大小   │ 类型 │ 状态   │ 操作│ │
│  │ 1 │ 安全生产责任制.pdf  │ 2.3MB  │ PDF  │ 待上传 │ [×] │ │
│  │ 2 │ 应急预案.docx       │ 1.1MB  │ DOCX │ 待上传 │ [×] │ │
│  │ 3 │ 培训记录.xlsx       │ 156KB  │ XLSX │ 待上传 │ [×] │ │
│  │ 4 │ 现场照片.jpg        │ 3.5MB  │ JPG  │ 待上传 │ [×] │ │
│  │ 5 │ 设备清单.xls        │ 892KB  │ XLS  │ 待上传 │ [×] │ │
│  └────────────────────────────────────────────────────────┘ │
│  总大小：7.8MB    重复文件：0    异常文件：0                  │
│                                                              │
│  ┌─ 提交后展示 ────────────────────────────────────────────┐ │
│  │  📤 上传中... 60%                                       │ │
│  │  ████████████░░░░░░░░  3/5                              │ │
│  │                                                          │ │
│  │  (上传完成后自动切换到处理进度面板)                       │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│                              [取消]    [开始导入]            │
└──────────────────────────────────────────────────────────────┘
```

### 5.4 处理进度面板（提交后切换）

```
┌──────────────────────────────────────────────────────────────┐
│  批量导入进行中                                       [x]    │
├──────────────────────────────────────────────────────────────┤
│  任务编号：BI20260719001                                     │
│                                                              │
│         ╭──────────╮                                         │
│        │     65%     │  当前：安全生产责任制.pdf              │
│         ╰──────────╯  剩余约 60 秒                            │
│                                                              │
│  ┌─ 实时统计 ─────────────────────────────────────────────┐ │
│  │  总数 120  │  成功 70  │  失败 8  │  待处理 42          │ │
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

### 5.5 任务详情抽屉（TaskDetailDrawer.vue）

```
┌──────────────────────────────────────────────────────────────┐
│  任务详情 - BI20260719001                              [x]   │
├──────────────────────────────────────────────────────────────┤
│  [基本信息]                                                   │
│  类型：安全资料   范围：分类-责任制   创建人：admin           │
│  开始：2026-07-19 10:00:01   完成：10:03:25   耗时：3m24s    │
│                                                              │
│  [结果统计]                                                   │
│  ┌─总数量─┐ ┌─成功─┐ ┌─失败─┐ ┌─跳过─┐ ┌─成功率─┐           │
│  │  120   │ │  105 │ │  12  │ │   3  │ │ 87.5%  │           │
│  └────────┘ └──────┘ └──────┘ └──────┘ └────────┘           │
│                                                              │
│  [失败原因分布]                                               │
│  BIZ_ERROR    ████████ 5                                     │
│  DUP_FILE     █████ 3                                        │
│  INVALID_TYPE ██ 2                                           │
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
│  [导出结果报表]                                              │
└──────────────────────────────────────────────────────────────┘
```

### 5.6 复用组件清单

| 现有能力 | 用途 |
|---------|------|
| `Page` (@vben/common-ui) | 页面容器 |
| `useVbenDrawer` | 抽屉组件 |
| `useVbenForm` | 表单（业务参数配置） |
| `requestClient` (@vben/request) | API 调用 |
| `useAccess` | 权限控制 |
| Antd Vue `Upload.Dragger` | 拖拽上传 |
| Antd Vue `Table` | 文件列表 |
| Antd Vue `Progress` | 进度条 |
| Antd Vue `Statistic` | 统计卡片 |
| Antd Vue `Tag` | 状态标签 |
| Antd Vue `Popconfirm` | 取消任务确认 |
| `message` / `notification` | 提示 |
| `IconifyIcon` (@vben/icons) | 图标 |
| `$t` i18n | 国际化 |

### 5.7 i18n 规划

在 `locales/langs/zh-CN/hse.json` 新增 `batchImport` 模块：

```json
{
  "batchImport": {
    "title": "批量导入中心",
    "newTask": "新建批量导入",
    "importType": {
      "document": "安全资料",
      "standard_clause": "标准条款",
      "safety_record": "安全记录"
    },
    "status": {
      "pending": "待处理",
      "processing": "处理中",
      "completed": "已完成",
      "failed": "已失败",
      "cancelled": "已取消"
    },
    "itemStatus": {
      "pending": "待处理",
      "processing": "处理中",
      "success": "成功",
      "failed": "失败",
      "skipped": "跳过",
      "retrying": "重试中"
    }
  }
}
```

### 5.8 路由规划

```typescript
// apps/web-antd/src/router/routes/modules/hse.ts 新增子路由
{
  path: 'batch-import',
  name: 'HseBatchImport',
  component: () => import('#/views/hse/batch-import/index.vue'),
  meta: {
    title: $t('hse.batchImport.title'),
    icon: 'lucide:upload-cloud',
    authority: ['admin', 'safety_manager'],
    order: 50,
  },
}
```

---

## 六、安全要求

### 6.1 重复文件检测

**方案**：SHA-256 文件指纹

```javascript
const crypto = require('crypto');  // Node.js 内置，无新增依赖

_calculateFileHash(filePath) {
  const hash = crypto.createHash('sha256');
  const buffer = fs.readFileSync(filePath);
  hash.update(buffer);
  return hash.digest('hex');
}
```

**查重逻辑**：
1. 接收文件后计算 SHA-256
2. 写入 `hse_batch_import_items.file_hash`
3. 处理时查询 `hse_batch_import_items` 中 `status=success` 且 `file_hash` 相同的历史记录
4. 命中则标记为 `skipped`，error_code=`DUP_FILE`，error_message=`重复文件，已存在于任务 BI...`

### 6.2 文件类型检查

**三层校验**：

| 层级 | 校验内容 | 实现 |
|------|---------|------|
| L1 | 扩展名白名单 | upload.js `createFileFilter` |
| L2 | MIME 类型 | upload.js `createFileFilter` |
| L3 | 文件魔术字节 | upload.js `validateUploadedFile` |

**各导入类型允许的扩展名**：

| 导入类型 | 允许扩展名 |
|---------|-----------|
| document | .pdf, .doc, .docx, .xls, .xlsx, .jpg, .jpeg, .png |
| standard_clause | .xlsx, .xls, .json |
| safety_record | .xlsx, .xls |

### 6.3 文件大小限制

| 限制项 | 值 | 说明 |
|--------|-----|------|
| 单文件大小 | 10 MB | 沿用 upload.js 默认限制 |
| 单任务总大小 | 500 MB | 防止一次提交过大 |
| 单任务文件数 | 200 个 | multer `maxCount` 配置 |

### 6.4 失败隔离

**实现方式**：
- 每个 `processItem` 调用包裹在 `try/catch` 中
- 单个失败仅更新该 item 的 status=failed，不影响其他
- 失败信息记录到 `error_code` + `error_message`
- 任务主流程继续执行下一个 item

```javascript
async processTask(taskId) {
  const items = await getPendingItems(taskId);
  for (const item of items) {
    try {
      await processItem(item.id);
    } catch (err) {
      // 失败已记录到 item，继续下一个
      logger.error(`[BatchImport] Item ${item.id} failed:`, err);
    }
  }
  await _finalizeTask(taskId);
}
```

### 6.5 全过程留痕

**两层留痕**：

| 层级 | 记录内容 | 存储 |
|------|---------|------|
| 任务级 | 任务创建/开始/完成/取消 + 汇总统计 | `hse_batch_import_tasks` |
| 明细级 | 每个文件的处理过程 + 失败原因 + 重试历史 | `hse_batch_import_items` |

**查询能力**：
- 任意任务的完整处理历史可查
- 失败原因可追溯到具体文件 + 具体错误码
- 支持按错误类型聚合统计

### 6.6 权限控制

复用现有 `requireRole` 中间件：

| 操作 | 允许角色 |
|------|---------|
| 创建任务 | admin, safety_manager |
| 查看任务列表/详情 | 所有登录用户 |
| 失败重试 | admin, safety_manager |
| 取消任务 | admin, safety_manager |
| 导出结果 | 所有登录用户 |

---

## 七、技术要求实现

### 7.1 异步处理

**严格异步原则**：
- HTTP 接口仅负责创建任务 + 接收文件，立即返回
- 文件处理全部在 `setImmediate` 中执行
- 前端通过轮询获取进度

**与 Sprint2/3/4 的异步模式一致**：
- Sprint2：`setImmediate(() => documentAiService.processAnalysis(...))`
- Sprint3：`setImmediate(() => reportService._doGenerateReport(...))`
- Sprint4：`setImmediate(() => standardEvaluationService._doEvaluate(...))`
- Sprint5 批量导入：`setImmediate(() => batchImportService.processTask(taskId))`

### 7.2 大文件量支持

**支持 100+ 文件**：

| 策略 | 说明 |
|------|------|
| multer.array maxCount=200 | 一次接收最多 200 个文件 |
| 接收阶段串行落盘 | multer 自动处理，HTTP 长连接保持 |
| 处理阶段串行执行 | 避免数据库连接耗尽 |
| 进度刷新降频 | 每 5 个 item 更新一次进度，减少 DB 写入 |
| 大文件分块读取 | SHA-256 计算使用流式读取，避免内存溢出 |

**预计处理时长**：
- 100 个文件（平均 2MB）约需 2-5 分钟
- 前端轮询每 2 秒一次，单次响应 < 50ms

### 7.3 降级策略

| 场景 | 降级方案 |
|------|---------|
| 文件接收失败（HTTP 超时） | 已接收文件正常处理，未接收文件标记为 failed |
| 后台处理异常 | 任务状态置为 failed，已处理 item 保留结果 |
| 数据库连接断开 | 单个 item 失败，任务继续，最终汇总失败数 |
| 业务 Service 抛错 | 记录 BIZ_ERROR，可重试 |

---

## 八、实施计划

### 8.1 Phase 拆分

```
Phase1: 数据库设计与迁移
    │
    ├─ hse_batch_import_v58_migration.sql
    ├─ 创建 hse_batch_import_tasks 表
    ├─ 创建 hse_batch_import_items 表
    └─ 迁移幂等性测试
         │
         ▼
Phase2: 后端核心服务
    │
    ├─ batchImportService.js
    │   ├─ createTask
    │   ├─ processTask + processItem
    │   ├─ _validateFile + _checkDuplicate
    │   └─ _dispatchToBusiness（document + standard_clause）
    ├─ hse-batch-import.js 路由
    ├─ 在 server/app.js 挂载路由
    └─ 单元测试：创建任务 + 异步处理 + 失败隔离
         │
         ▼
Phase3: 前端列表页
    │
    ├─ views/hse/batch-import/index.vue
    ├─ api.ts + types.ts
    ├─ 路由注册
    ├─ i18n 翻译
    └─ 测试：列表查询 + 筛选 + 分页
         │
         ▼
Phase4: 前端导入抽屉
    │
    ├─ BatchImportDrawer.vue
    │   ├─ 类型选择 + 业务参数配置
    │   ├─ 拖拽上传 + 文件列表
    │   ├─ 提交后切换进度面板
    │   └─ 2 秒轮询进度
    ├─ components/FileDropZone.vue
    ├─ components/FileListTable.vue
    ├─ components/ProgressPanel.vue
    └─ 测试：100+ 文件上传 + 进度显示
         │
         ▼
Phase5: 任务详情与重试
    │
    ├─ TaskDetailDrawer.vue
    │   ├─ 基本信息 + 结果统计
    │   ├─ 失败原因分布图
    │   ├─ 明细列表 + 筛选
    │   └─ 失败重试按钮
    ├─ components/ResultSummary.vue
    ├─ components/ItemRetryButton.vue
    └─ 测试：重试流程 + 取消任务 + 导出报表
         │
         ▼
Phase6: 集成与验收
    │
    ├─ 端到端测试：从上传到结果导出
    ├─ 100 文件压力测试
    ├─ 重复文件检测测试
    ├─ 失败重试测试
    ├─ 权限测试
    └─ 生成 sprint5-batch-import-report.md
```

### 8.2 各 Phase 交付物

| Phase | 后端 | 前端 | 测试 | 文档 |
|-------|------|------|------|------|
| Phase1 | 1 个迁移脚本 | - | 迁移幂等 | - |
| Phase2 | batchImportService + 路由 | - | 单元测试 | - |
| Phase3 | - | 列表页 + api + 路由 | 列表查询 | - |
| Phase4 | - | 导入抽屉 + 组件 | 100 文件上传 | - |
| Phase5 | - | 详情抽屉 + 重试 | 重试 + 导出 | - |
| Phase6 | - | - | 端到端 + 压测 | 开发报告 |

### 8.3 依赖关系

```
Phase1（数据库）→ Phase2（后端）→ Phase3（前端列表）
                                   │
                                   └─→ Phase4（导入抽屉）→ Phase5（详情重试）→ Phase6（集成验收）
```

### 8.4 风险与缓解

| 风险 | 等级 | 缓解措施 |
|------|------|---------|
| 大文件 HTTP 超时 | 中 | nginx/express 调高 timeout；前端提示耐心等待 |
| 数据库连接耗尽 | 中 | 串行处理 + 连接池复用 |
| 磁盘空间不足 | 低 | 失败文件 7 天清理；任务完成后可选清理 |
| 重复文件误判 | 低 | SHA-256 + 文件名双重判断；用户可强制导入 |
| 重试风暴 | 低 | 单 item 最多 3 次重试；重试需手动触发 |

---

## 九、约束遵守确认

### 9.1 技术约束

| 约束 | 遵守情况 |
|------|---------|
| 禁止修改 packages/@core/、effects/、themes/ | ✅ 完全不涉及 |
| 禁止修改 auth / JWT / 登录逻辑 | ✅ 仅复用 requireRole |
| 禁止新增 npm 依赖 | ✅ 仅使用 multer、xlsx、crypto（内置）、pg |
| 禁止创建 src/components/ | ✅ 业务组件放 views/hse/batch-import/components/ |
| 禁止修改 upload.js 中间件 | ✅ 通过 createUploader 复用，不改动原文件 |
| 禁止修改现有业务路由 | ✅ 通过调用现有 Service 方法集成 |
| 数据库增量迁移 | ✅ v58 版本，仅 CREATE TABLE IF NOT EXISTS |
| 复用 notificationService | ✅ 任务完成通过 notificationService 通知 |
| 复用 @vben/request、useVbenDrawer、useAccess | ✅ 前端全部复用 |

### 9.2 与 Sprint4 设计规范一致

| 规范 | 遵守情况 |
|------|---------|
| 业务代码隔离 | ✅ 全部在 views/hse/batch-import/ 和 services/batchImportService.js |
| 软删除 + is_deleted | ✅ 两张表均含 |
| created_at + updated_at | ✅ 两张表均含 |
| 索引规范 | ✅ 唯一索引 + 普通索引组合 |
| 注释规范 | ✅ COMMENT ON TABLE/COLUMN |
| 异步模式 | ✅ setImmediate + 进度轮询 |
| 通知规范 | ✅ type=system, bizType=batch_import |

### 9.3 AI 边界

本方案不涉及 AI 能力，纯批量导入工具。如后续需要 AI 辅助：
- 可在文件导入完成后，调用 Sprint2 的 documentAiService 触发 AI 分析
- 但 AI 分析不纳入批量导入中心本身，保持职责单一

---

## 十、总结

### 10.1 核心价值

批量导入中心解决了 Sprint1~4 各模块只能单文件操作的问题，提供：

1. **统一入口**：一个抽屉完成资料/条款/记录的批量导入
2. **异步处理**：100+ 文件一次提交，后台处理，前端实时查看进度
3. **失败隔离**：单个失败不影响其他，支持失败重试
4. **全流程留痕**：任务 + 明细双层记录，可追溯
5. **安全防护**：重复检测 + 类型校验 + 大小限制 + 魔术字节

### 10.2 与现有系统的关系

- **不改动**：现有 documentService / standardService / upload.js / 任何路由
- **仅调用**：通过 Service 方法集成，保持现有业务逻辑独立
- **仅扩展**：新增 2 张表 + 1 个 Service + 1 个路由模块 + 1 个前端模块

### 10.3 待确认事项

| 待确认项 | 说明 |
|---------|------|
| safety_record 子类型范围 | MVP 是否仅支持 document + standard_clause，safety_record 后续扩展 |
| 文件清理周期 | 失败文件 7 天清理是否合适 |
| 单任务文件数上限 | 200 是否足够，是否需要支持 500+ |
| 并发任务数限制 | 是否限制同一用户同时只能有 1 个进行中的任务 |
| 集团监管关联 | 是否需要 enterprise_id 字段（与 Sprint5 集团监管衔接） |

---

**文档版本**：v1.0（设计版，待审核）
**生成日期**：2026-07-19
**前置条件**：Sprint4 V2.0 已达发布条件
**等待审核后进入编码阶段**

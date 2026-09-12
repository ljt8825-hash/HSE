# HSE V2 Sprint4 安全生产标准化评价中心设计方案

> 版本：v1.0  
> 日期：2026-07-19  
> 范围：安全生产标准化资料评价中心  
> 前置依赖：Sprint1（安全资料中心）、Sprint2（AI 文件分析）、Sprint3（安全生产汇报中心）

---

## 一、设计目标与约束

### 1.1 设计目标

实现安全生产标准化资料评价中心，覆盖以下核心流程：

```
标准条款库 → 关联资料 → AI辅助检查 → 缺项分析 → 整改建议 → 自评报告生成
```

### 1.2 必须遵守的约束

| 禁止项 | 说明 |
|--------|------|
| 修改 `packages/` | 不修改 Vben 核心包 |
| 修改 `auth/` | 不修改认证模块 |
| 修改 JWT | 不修改令牌机制 |
| 新增 npm 依赖 | 复用 dayjs、ant-design-vue 等已有依赖 |

### 1.3 与前序 Sprint 的衔接

| Sprint | 衔接点 | 复用内容 |
|--------|--------|---------|
| Sprint1 | 资料中心 | `document_files`（资料文件）、`document_standard_relation`（Sprint1 预留的条款-资料关联表，Sprint4 激活使用）、`document_ai_analysis`（AI 分析结果） |
| Sprint2 | AI 文件分析 | `document_ai_analysis.ai_summary` / `ai_suggestions` / `ai_missing_items`（已包含对照标准的合规建议） |
| Sprint3 | 报告中心 | `hse_reports` / `hse_report_templates` / `reportService.generateReportV2()` / `aiService` 的 Prompt 强约束模式 |

### 1.4 MVP 范围

Sprint4 聚焦实现：

- ✅ 标准条款库管理（参照 GB/T 33000-2016《企业安全生产标准化基本规范》）
- ✅ 条款与资料关联（自动匹配 + 手动关联）
- ✅ AI 辅助条款检查（逐条对照标准，判定合规状态）
- ✅ 缺项分析与整改建议
- ✅ 自评报告生成（复用 Sprint3 报告体系）

暂不实现（后续 Sprint）：

- ⏳ 综合安全标准化指数评分看板（`standard-score-model.md` 中的 5 维度评分模型）
- ⏳ 评价结果定时自动计算
- ⏳ 整改任务与 `hse_rectifications` 表的深度联动
- ⏳ 整改闭环追踪看板

---

## 二、业务流程

### 2.1 总体业务流程

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  1.标准条款  │────→│  2.关联资料  │────→│  3.AI检查   │────→│  4.缺项分析 │
│   库管理     │     │  (自动+手动) │     │  (逐条评价) │     │  (统计汇总) │
└─────────────┘     └─────────────┘     └─────────────┘     └──────┬──────┘
                                                                    │
                    ┌─────────────┐     ┌─────────────┐            │
                    │  6.自评报告  │←────│  5.整改建议  │←───────────┘
                    │   生成       │     │  (AI生成)   │
                    └─────────────┘     └─────────────┘
                         │
                         ↓
                    复用 Sprint3
                    reportService
                    生成 hse_reports
```

### 2.2 标准条款库管理流程

```
管理员进入条款库
    ↓
查看/编辑标准条款树（三级层级）
    ├── 一级要素（8 个，参照 GB/T 33000-2016）
    │   1. 目标职责    2. 制度化管理   3. 教育培训
    │   4. 现场管理    5. 安全风险管控及隐患排查治理
    │   6. 应急管理    7. 事故管理     8. 持续改进
    ├── 二级要素
    └── 具体条款（带评分分值、要求描述、检查方法）
    ↓
支持：新增、编辑、排序、批量导入、软删除
```

### 2.3 条款-资料关联流程

```
选择某个具体条款
    ↓
查看已关联资料列表
    ↓
两种关联方式：
    ├── 自动匹配：基于条款关键词 + document_files.original_name 匹配
    │   → 匹配结果需人工确认（match_type = 'auto', status = 'pending'）
    └── 手动关联：从资料中心选择文件
        → 直接关联（match_type = 'manual', status = 'valid'）
    ↓
关联信息写入 document_standard_relation 表（Sprint1 预留表）
    ↓
可查看关联文件的 AI 分析摘要（来自 Sprint2 document_ai_analysis）
```

### 2.4 AI 辅助检查流程

```
创建评价任务（选择评价范围：全部条款 / 指定要素）
    ↓
启动评价任务（异步执行）
    ↓
逐条条款检查：
    ├── 查询条款关联的资料文件
    ├── 读取资料的 AI 分析结果（document_ai_analysis）
    ├── 构建 AI 检查 Prompt（条款要求 + 资料摘要）
    ├── 调用 AI 判定合规状态：
    │   compliant（符合）/ partial（部分符合）
    │   non_compliant（不符合）/ missing（缺失，无关联资料）
    └── AI 输出：判定结果 + 缺项说明 + 整改建议
    ↓
AI 失败降级：标记为 pending，不阻断整体评价
    ↓
支持人工复核：覆盖 AI 判定结果
```

### 2.5 缺项分析与整改建议

```
评价任务完成后
    ↓
缺项分析：
    ├── 按要素统计：各要素的符合/部分符合/不符合/缺失数量
    ├── 计算标准化完成率 = 符合条款数 / 总条款数 × 100
    ├── 识别高风险缺项（权重高的不符合/缺失条款）
    └── 生成缺项清单（含 AI 整改建议）
    ↓
整改建议：
    ├── AI 针对每个不合规条款生成具体整改建议
    ├── 建议包含：整改方向、优先级、预期完成标准
    └── 整改建议支持人工编辑
    ↓
（后续 Sprint）整改建议可转为整改任务，关联 hse_rectifications
```

### 2.6 自评报告生成流程

```
评价任务完成 + 缺项分析完成
    ↓
点击"生成自评报告"
    ↓
调用 reportService.generateReportV2()
    ├── template_category = 'self_assessment'（新增类型）
    ├── 数据来源：评价任务结果 + 缺项分析 + AI 整改建议
    ├── AI 辅助：生成报告整体分析摘要
    └── 报告 HTML：自评报告模板渲染
    ↓
报告存入 hse_reports 表（复用 Sprint3 报告体系）
    ↓
支持：预览、编辑、确认、导出（HTML/Word）、归档
    ↓
在 Sprint3 报告中心"全部报告"标签页可查看
```

---

## 三、数据库设计

### 3.1 设计原则

延续 Sprint3 的数据库扩展策略：

1. **新建表**使用 `CREATE TABLE IF NOT EXISTS`
2. **扩展已有表**使用 `ALTER TABLE ADD COLUMN IF NOT EXISTS`
3. **不删除字段**、**不修改已有数据结构**
4. **禁止物理删除**：使用 `is_deleted` 或状态字段管理
5. **复用已有表**：`document_standard_relation`（Sprint1 预留）、`hse_reports`（Sprint3 扩展）

### 3.2 新增表

#### 3.2.1 `safety_standard_clauses` — 标准条款主表

Sprint1 的 `document_standard_relation.clause_code` 注释已明确预留与此表 `code` 字段的关联。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | BIGSERIAL | PRIMARY KEY | 主键 |
| `code` | VARCHAR(64) | NOT NULL UNIQUE | 条款编码（业务唯一键，如 `5.1.1`） |
| `parent_id` | BIGINT | | 父条款 ID（层级树自关联，一级要素 parent_id = NULL） |
| `level` | SMALLINT | NOT NULL DEFAULT 1 | 层级：1=一级要素，2=二级要素，3=具体条款 |
| `element_name` | VARCHAR(128) | | 要素名称（一级/二级要素时使用） |
| `clause_title` | VARCHAR(256) | | 条款标题（具体条款时使用） |
| `clause_content` | TEXT | | 条款要求描述（详细要求内容） |
| `check_method` | TEXT | | 检查方法（如何验证条款是否满足） |
| `score_weight` | DECIMAL(5,2) | DEFAULT 0 | 分值权重（用于计算标准化完成率） |
| `required_doc_types` | JSONB | DEFAULT '[]' | 要求的资料类型（用于自动匹配，如 `["培训计划","培训记录"]`） |
| `keywords` | JSONB | DEFAULT '[]' | 匹配关键词（用于自动关联资料文件） |
| `sort_order` | INTEGER | DEFAULT 0 | 排序序号 |
| `status` | VARCHAR(20) | DEFAULT 'active' CHECK IN ('active','inactive') | 状态 |
| `created_by` | BIGINT | | 创建人 |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | 创建时间 |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | 更新时间 |
| `is_deleted` | BOOLEAN | DEFAULT FALSE | 软删除标记 |

**索引**：
- `uk_safety_standard_code` — code 唯一索引
- `idx_safety_standard_parent` — parent_id 索引（树查询）
- `idx_safety_standard_level` — level 索引

#### 3.2.2 `standard_evaluation_tasks` — 评价任务表

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | BIGSERIAL | PRIMARY KEY | 主键 |
| `task_name` | VARCHAR(256) | NOT NULL | 评价任务名称 |
| `evaluation_scope` | JSONB | DEFAULT '{}' | 评价范围（如 `{"elementCodes": ["1","2","3"]}` 或 `{"all": true}`） |
| `evaluation_period` | VARCHAR(20) | | 评价周期（如 `2026-Q3`） |
| `total_clauses` | INTEGER | DEFAULT 0 | 总条款数（快照） |
| `compliant_count` | INTEGER | DEFAULT 0 | 符合数 |
| `partial_count` | INTEGER | DEFAULT 0 | 部分符合数 |
| `non_compliant_count` | INTEGER | DEFAULT 0 | 不符合数 |
| `missing_count` | INTEGER | DEFAULT 0 | 缺失数 |
| `completion_rate` | DECIMAL(5,2) | DEFAULT 0 | 标准化完成率（%） |
| `overall_score` | DECIMAL(5,2) | | 综合得分 |
| `overall_level` | VARCHAR(20) | | 综合等级：excellent/good/qualified/basic/unqualified |
| `task_status` | VARCHAR(20) | DEFAULT 'draft' CHECK IN ('draft','in_progress','completed','failed','archived') | 任务状态 |
| `ai_enabled` | BOOLEAN | DEFAULT TRUE | 是否启用 AI 辅助检查 |
| `ai_status` | VARCHAR(20) | DEFAULT 'none' CHECK IN ('none','pending','processing','completed','failed') | AI 检查状态 |
| `ai_summary` | TEXT | | AI 整体评价摘要 |
| `error_message` | TEXT | | 错误信息 |
| `created_by` | BIGINT | | 创建人 |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | 创建时间 |
| `started_at` | TIMESTAMPTZ | | 开始执行时间 |
| `completed_at` | TIMESTAMPTZ | | 完成时间 |
| `is_deleted` | BOOLEAN | DEFAULT FALSE | 软删除标记 |

**索引**：
- `idx_eval_task_status` — task_status 索引
- `idx_eval_task_period` — evaluation_period 索引

#### 3.2.3 `standard_evaluation_items` — 评价明细表

每个条款在一次评价任务中的评价结果。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | BIGSERIAL | PRIMARY KEY | 主键 |
| `task_id` | BIGINT | NOT NULL | 评价任务 ID（逻辑关联 standard_evaluation_tasks） |
| `clause_id` | BIGINT | NOT NULL | 条款 ID（逻辑关联 safety_standard_clauses） |
| `clause_code` | VARCHAR(64) | NOT NULL | 条款编码（快照，冗余存储防止条款修改影响历史评价） |
| `clause_title` | VARCHAR(256) | | 条款标题（快照） |
| `clause_content` | TEXT | | 条款要求（快照） |
| `score_weight` | DECIMAL(5,2) | | 分值权重（快照） |
| `compliance_status` | VARCHAR(20) | DEFAULT 'pending' CHECK IN ('pending','compliant','partial','non_compliant','missing') | 合规状态 |
| `matched_file_ids` | JSONB | DEFAULT '[]' | 关联资料文件 ID 列表 |
| `matched_file_summary` | JSONB | DEFAULT '[]' | 关联资料摘要（文件名 + AI 分析摘要片段） |
| `ai_check_result` | JSONB | | AI 检查结果详情 |
| `ai_suggestion` | TEXT | | AI 整改建议 |
| `ai_confidence` | DECIMAL(5,2) | | AI 判定置信度 |
| `manual_status` | VARCHAR(20) | | 人工复核状态（覆盖 AI 判定，为空则使用 AI 判定） |
| `manual_remark` | TEXT | | 人工备注 |
| `checked_by` | BIGINT | | 检查人 |
| `checked_at` | TIMESTAMPTZ | | 检查时间 |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | 创建时间 |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | 更新时间 |
| `is_deleted` | BOOLEAN | DEFAULT FALSE | 软删除标记 |

**`ai_check_result` JSON 结构**：
```json
{
  "verdict": "partial",
  "findings": "条款要求配备安全生产费用使用计划，关联资料中有费用台账但未找到使用计划",
  "missingItems": ["安全生产费用使用计划"],
  "evidence": "关联文件《2026年安全费用台账》第3页",
  "suggestion": "补充编制安全生产费用使用计划，明确费用使用范围和审批流程"
}
```

**索引**：
- `idx_eval_item_task` — task_id 索引
- `idx_eval_item_clause` — clause_id 索引
- `uk_eval_item_task_clause` — (task_id, clause_id) 唯一索引

### 3.3 扩展已有表

#### 3.3.1 `hse_report_templates` — 新增自评报告模板类型

```sql
-- ALTER TABLE hse_report_templates 的 template_category CHECK 约束需扩展
-- 原: CHECK (template_category IN ('statistical', 'monthly_report', 'group_report'))
-- 新: CHECK (template_category IN ('statistical', 'monthly_report', 'group_report', 'self_assessment'))
```

同时插入 1 条新模板：
- `template_category = 'self_assessment'`，`ai_enabled = true`
- 模板内容：安全生产标准化自评报告模板

> **注意**：修改 CHECK 约束不属于"修改已有数据结构"，是约束扩展（PostgreSQL 支持 DROP CONSTRAINT + ADD CONSTRAINT）。已有数据不受影响。

#### 3.3.2 `hse_reports` — template_category CHECK 约束同步扩展

```sql
-- 原: CHECK (template_category IN ('statistical', 'monthly_report', 'group_report'))
-- 新: CHECK (template_category IN ('statistical', 'monthly_report', 'group_report', 'self_assessment'))
```

`hse_reports` 的其他字段（`generation_status`、`ai_status`、`confirm_status`、`report_status`、`source_data_ref` 等）全部复用，无需新增字段。

### 3.4 复用已有表

#### 3.4.1 `document_standard_relation`（Sprint1 预留，Sprint4 激活）

Sprint1 已建表但未使用，Sprint4 正式激活：

| 已有字段 | Sprint4 用途 |
|---------|-------------|
| `file_id` | 关联 document_files.id |
| `clause_code` | 关联 safety_standard_clauses.code（业务键关联，无外键） |
| `clause_name` | 冗余存储条款名称 |
| `match_type` | `auto`（自动匹配）/ `manual`（手动关联） |
| `match_confidence` | 自动匹配置信度 |
| `status` | `valid`（有效）/ `pending`（待确认）/ `invalid`（无效） |
| `verified_by` | 确认人 |
| `verified_at` | 确认时间 |

**无需修改表结构**，直接使用。

#### 3.4.2 `document_ai_analysis`（Sprint2，只读引用）

AI 检查时读取资料的 AI 分析结果：
- `ai_summary` — 资料摘要（注入条款检查 Prompt）
- `ai_suggestions` — 已有的合规建议（格式 `[{standard, suggestion, level}]`）
- `ai_missing_items` — 已识别的缺失项（格式 `[{item, reason, priority}]`）

#### 3.4.3 `hse_reports` / `hse_report_templates`（Sprint3，扩展使用）

自评报告通过 `reportService.generateReportV2()` 生成，存入 `hse_reports`：
- `template_category = 'self_assessment'`
- `source_data_ref` 存储评价任务 ID + 缺项分析快照
- `generation_status` / `ai_status` / `confirm_status` / `report_status` 全部复用

### 3.5 ER 关系图

```
safety_standard_clauses (新)
    │ code (业务键)
    │
    ├─────── document_standard_relation (Sprint1预留)
    │           │ file_id → document_files.id
    │           │ clause_code → safety_standard_clauses.code
    │           │
    │           └── document_files (Sprint1)
    │                   │ latest_ai_analysis_id
    │                   │
    │                   └── document_ai_analysis (Sprint2, 只读)
    │
    └─────── standard_evaluation_items (新)
                │ task_id → standard_evaluation_tasks.id
                │ clause_id → safety_standard_clauses.id
                │
                └── standard_evaluation_tasks (新)
                        │
                        └── hse_reports (Sprint3扩展)
                                │ template_category = 'self_assessment'
                                │ source_data_ref → evaluation_task_id
```

### 3.6 种子数据：标准条款初始数据

参照 GB/T 33000-2016《企业安全生产标准化基本规范》，预置 8 个一级要素：

| 编码 | 要素名称 | 权重 |
|------|---------|------|
| 1 | 目标职责 | 5 |
| 2 | 制度化管理 | 15 |
| 3 | 教育培训 | 10 |
| 4 | 现场管理 | 25 |
| 5 | 安全风险管控及隐患排查治理 | 25 |
| 6 | 应急管理 | 10 |
| 7 | 事故管理 | 5 |
| 8 | 持续改进 | 5 |

每个一级要素下预置 2-3 个二级要素（共约 20 个），每个二级要素下预置 1-2 个示例条款（共约 30 个）。具体条款可由管理员后续维护扩充。

---

## 四、API 设计

### 4.1 路由规划

新建路由文件 `server/routes/hse-standard.js`，在 `app.js` 中挂载：

```
app.use('/api/hse/standard', standardRoutes);
```

完整前缀：`/api/hse/standard`

### 4.2 接口清单

#### 4.2.1 标准条款管理（6 个接口）

| 序号 | 方法 | 路径 | 功能 | 关键参数 |
|------|------|------|------|---------|
| 1 | GET | `/clauses/tree` | 获取条款树（全量层级） | - |
| 2 | GET | `/clauses/:id` | 获取条款详情 | - |
| 3 | POST | `/clauses` | 新增条款 | `code`, `parentId`, `level`, `clauseTitle`, `clauseContent`, `scoreWeight`, `keywords` |
| 4 | PUT | `/clauses/:id` | 编辑条款 | 同上可编辑字段 |
| 5 | DELETE | `/clauses/:id` | 软删除条款（检查子条款） | - |
| 6 | POST | `/clauses/import` | 批量导入条款 | `clauses[]`（JSON 数组） |

#### 4.2.2 条款-资料关联（5 个接口）

| 序号 | 方法 | 路径 | 功能 | 关键参数 |
|------|------|------|------|---------|
| 7 | GET | `/clauses/:id/documents` | 获取条款关联的资料列表 | - |
| 8 | POST | `/clauses/:id/documents` | 手动关联资料 | `fileIds[]` |
| 9 | DELETE | `/clauses/:id/documents/:fileId` | 取消关联 | - |
| 10 | POST | `/clauses/:id/auto-match` | 自动匹配资料 | 返回匹配建议列表，需确认 |
| 11 | POST | `/clauses/:id/documents/confirm` | 确认自动匹配结果 | `relations[]`（fileId + clauseCode） |

#### 4.2.3 评价任务（9 个接口）

| 序号 | 方法 | 路径 | 功能 | 关键参数 |
|------|------|------|------|---------|
| 12 | POST | `/evaluations` | 创建评价任务 | `taskName`, `evaluationScope`, `evaluationPeriod`, `aiEnabled` |
| 13 | GET | `/evaluations` | 评价任务列表 | `status`, `keyword`, `page`, `pageSize` |
| 14 | GET | `/evaluations/:id` | 评价任务详情（含统计概览） | - |
| 15 | POST | `/evaluations/:id/start` | 启动评价（异步触发 AI 检查） | - |
| 16 | GET | `/evaluations/:id/status` | 查询评价进度 | 返回 `progress`, `currentStep`, `checkedCount`, `totalCount` |
| 17 | GET | `/evaluations/:id/items` | 获取评价明细列表 | `complianceStatus`（筛选）, `elementCode`（筛选） |
| 18 | PUT | `/evaluations/:id/items/:itemId` | 更新条款评价结果（人工复核） | `manualStatus`, `manualRemark` |
| 19 | GET | `/evaluations/:id/gaps` | 缺项分析报告 | 返回按要素分组的缺项统计 + 缺项清单 |
| 20 | POST | `/evaluations/:id/generate-report` | 生成自评报告 | 调用 `reportService.generateReportV2()` |

#### 4.2.4 评价任务管理（2 个接口）

| 序号 | 方法 | 路径 | 功能 | 关键参数 |
|------|------|------|------|---------|
| 21 | POST | `/evaluations/:id/archive` | 归档评价任务 | - |
| 22 | DELETE | `/evaluations/:id` | 软删除评价任务（草稿状态才可删） | - |

### 4.3 关键接口设计说明

#### 4.3.1 启动评价（异步流程）

```
POST /api/hse/standard/evaluations/:id/start
```

**响应**：
```json
{
  "taskId": 1,
  "status": "in_progress",
  "totalClauses": 30,
  "estimatedSeconds": 60
}
```

**后台异步执行**（参考 Sprint3 的 `setImmediate` 模式）：
1. `task_status` → `in_progress`
2. 遍历评价范围内的所有具体条款（level = 3）
3. 对每个条款：
   - 查询关联资料（`document_standard_relation`）
   - 读取资料 AI 分析摘要（`document_ai_analysis`）
   - 若 `ai_enabled`：构建 Prompt → 调用 AI → 解析结果
   - 若无关联资料：`compliance_status = 'missing'`
   - AI 失败降级：`compliance_status = 'pending'`，不阻断
4. 更新统计：`compliant_count` / `partial_count` / `non_compliant_count` / `missing_count`
5. 计算 `completion_rate` 和 `overall_score`
6. `task_status` → `completed`

#### 4.3.2 缺项分析

```
GET /api/hse/standard/evaluations/:id/gaps
```

**响应**：
```json
{
  "summary": {
    "totalClauses": 30,
    "compliantCount": 18,
    "partialCount": 5,
    "nonCompliantCount": 4,
    "missingCount": 3,
    "completionRate": 60.0,
    "overallScore": 72.5,
    "overallLevel": "qualified"
  },
  "byElement": [
    {
      "elementCode": "2",
      "elementName": "制度化管理",
      "total": 6,
      "compliant": 3,
      "partial": 2,
      "nonCompliant": 1,
      "missing": 0,
      "rate": 50.0
    }
  ],
  "gapList": [
    {
      "itemId": 45,
      "clauseCode": "2.1.3",
      "clauseTitle": "安全生产费用管理",
      "complianceStatus": "partial",
      "aiSuggestion": "补充编制安全生产费用使用计划...",
      "scoreWeight": 2.0
    }
  ]
}
```

#### 4.3.3 生成自评报告

```
POST /api/hse/standard/evaluations/:id/generate-report
```

**内部流程**：
1. 收集评价任务数据（统计概览 + 缺项清单 + AI 整改建议）
2. 调用 `reportService.generateReportV2()`：
   - `templateCategory = 'self_assessment'`
   - `reportPeriod = evaluationPeriod`
   - `aiEnabled = true`
   - `source_data_ref` = `{ evaluationTaskId, completionRate, gapCount, ... }`
3. `reportService._collectStatistics()` 中新增 `self_assessment` 分支，从评价任务采集数据
4. `reportService._generateAiContent()` 中新增 `self_assessment` 分支，调用 `aiService.buildSelfAssessmentPrompt()`
5. 生成报告 HTML，存入 `hse_reports`

**响应**：
```json
{
  "reportId": 15,
  "generationStatus": "pending",
  "estimatedSeconds": 30
}
```

报告生成后可在 Sprint3 报告中心查看，前端轮询 `GET /api/hse/report/v2/:id/status`。

---

## 五、AI 评价流程设计

### 5.1 新增 Prompt 模板

在 `aiService.js` 的 `PROMPT_TEMPLATES` 中新增 `standard_evaluation`：

**Prompt 结构**：
```
【强约束规则】
1. 你是环卫企业安全生产管理系统的AI助手，仅基于提供的标准条款要求和关联资料进行分析。
2. 禁止编造任何数据。如果某项资料缺失，必须明确说明"暂无资料"或"未找到相关资料"。
3. 仅根据关联资料的内容判定条款合规状态，不得引用未提供的资料。
4. 判定必须有依据，必须引用关联资料的具体内容作为证据。
5. 整改建议必须具体、可操作、贴合环卫行业特点。
6. 严格按指定JSON结构返回，不允许返回Markdown代码块。

【标准条款信息】
条款编码：{clauseCode}
条款标题：{clauseTitle}
条款要求：{clauseContent}
检查方法：{checkMethod}

【关联资料】
{遍历关联文件，输出文件名 + AI分析摘要}
（若无关联资料，输出"暂无关联资料"）

【请输出以下JSON结构】
{
  "verdict": "compliant|partial|non_compliant|missing",
  "findings": "检查发现描述（说明资料是否满足条款要求）",
  "missingItems": ["缺失的资料项列表"],
  "evidence": "判定依据（引用关联资料的具体内容）",
  "suggestion": "整改建议（不符合或部分符合时给出）"
}
```

**新增构建函数**：
- `aiService.buildStandardEvaluationPrompt(params, customPrompt)`

### 5.2 AI 失败降级策略

延续 Sprint3 的降级策略：

| 场景 | 处理方式 |
|------|---------|
| AI 调用超时/失败 | `compliance_status = 'pending'`，`ai_check_result = null`，不阻断整体评价 |
| AI 返回非 JSON | 尝试解析（剥离代码块 → 截取首尾大括号 → JSON.parse），失败则降级为 pending |
| 无关联资料 | 不调用 AI，直接标记 `compliance_status = 'missing'` |
| 评价任务整体 AI 失败 | `ai_status = 'failed'`，已完成的条款结果保留，未完成的标记 pending |

### 5.3 人工复核机制

AI 检查完成后，用户可逐条复核：

- `manual_status` 覆盖 `compliance_status`（AI 判定）
- 最终合规状态 = `manual_status ?? compliance_status`
- 人工复核后重新计算统计数据（`completion_rate` 等）

---

## 六、前端设计

### 6.1 路由规划

新建路由模块文件：`router/routes/modules/hse-standard.ts`

> 前端路由自动加载机制（`import.meta.glob('./modules/**/*.ts')`）会自动识别，**无需修改 index.ts**。

**路由结构**：
```
/hse-standard (安全生产标准化评价中心)
├── /hse-standard/clauses      标准条款库
└── /hse-standard/evaluation   评价任务
```

| 路由 name | 路径 | 组件 | 菜单标题 | 图标 |
|-----------|------|------|---------|------|
| HseStandard | /hse-standard | redirect | 安全生产标准化 | lucide:clipboard-check |
| HseStandardClauses | /hse-standard/clauses | views/hse/standard/clauses/index.vue | 标准条款库 | lucide:list-tree |
| HseStandardEvaluation | /hse-standard/evaluation | views/hse/standard/evaluation/index.vue | 评价任务 | lucide:file-check |

### 6.2 页面设计

#### 6.2.1 标准条款库页面

**文件**：`views/hse/standard/clauses/index.vue`

**布局**：左右分栏
- **左侧**：条款树（a-tree），三级层级展示，支持展开/折叠
- **右侧**：选中条款的详情面板
  - 条款信息（编码、标题、要求描述、检查方法、分值权重）
  - 关联资料列表（已关联的资料文件 + AI 分析摘要）
  - 操作：编辑条款、关联资料、自动匹配、取消关联

#### 6.2.2 评价任务列表页面

**文件**：`views/hse/standard/evaluation/index.vue`

**布局**：
- 顶部统计卡片：总评价次数、最近完成率、待处理任务数
- 任务列表表格：
  - 列：任务名称、评价周期、状态、完成率、综合等级、创建时间、操作
  - 操作：查看详情、启动评价、生成报告、归档、删除
- 新建评价任务弹窗

#### 6.2.3 评价任务详情页面

**文件**：`views/hse/standard/evaluation/detail.vue`

**布局**：
- 顶部概览栏：任务名称、状态、完成率（环形进度图）、各状态统计
- 标签页：
  - **评价明细**：按要素分组的条款列表，每条显示合规状态、AI 检查结果、整改建议、人工复核操作
  - **缺项分析**：按要素的缺项统计柱状图 + 缺项清单表格
  - **自评报告**：已生成的报告列表 + 生成报告按钮
- 评价进行中时显示进度条（轮询状态）

#### 6.2.4 自评报告预览

复用 Sprint3 的 `ReportViewerDrawer.vue` 组件，通过 `template_category = 'self_assessment'` 筛选展示。

### 6.3 组件设计

所有组件位于 `views/hse/standard/components/` 目录下，**不进入 `src/components/`**。

| 组件 | 功能 | 复用情况 |
|------|------|---------|
| `ClauseTree.vue` | 标准条款树（左侧） | 新增 |
| `ClauseDetailPanel.vue` | 条款详情 + 关联资料面板（右侧） | 新增 |
| `ClauseDocumentModal.vue` | 资料关联弹窗（手动选择 + 自动匹配） | 新增 |
| `EvaluationProgress.vue` | 评价进度展示（进度条 + 状态轮询） | 新增，参考 Sprint3 轮询模式 |
| `EvaluationItemCard.vue` | 评价明细卡片（单条条款的评价结果） | 新增 |
| `GapAnalysisChart.vue` | 缺项分析图表（按要素分组柱状图） | 新增 |

### 6.4 前端 API 层

新建文件：`api/hse/standard.ts`

**TypeScript 类型定义**：
- `StandardClause` — 标准条款类型
- `EvaluationTask` — 评价任务类型
- `EvaluationItem` — 评价明细类型
- `GapAnalysisResult` — 缺项分析结果类型
- `ComplianceStatus` — 合规状态枚举

**API 函数**：与后端接口一一对应，共 22 个函数。

### 6.5 国际化

在 `locales/langs/zh-CN/hse.json` 中新增 `standardCenter` 模块：

```
standardCenter: {
  title, clauses, evaluation, ...
  complianceStatus: { compliant, partial, nonCompliant, missing, pending },
  taskStatus: { draft, inProgress, completed, failed, archived },
  ...
}
```

---

## 七、修改文件范围

### 7.1 后端（7 个文件）

| 文件 | 操作 | 说明 |
|------|------|------|
| `server/sql/hse_standard_v54_migration.sql` | 新增 | 3 张新表 + 2 张表 CHECK 约束扩展 + 种子数据 |
| `server/services/standardService.js` | 新增 | 评价中心核心服务（条款管理、关联管理、评价流程、缺项分析） |
| `server/services/aiService.js` | 修改 | 新增 `standard_evaluation` Prompt 模板 + `buildStandardEvaluationPrompt()` |
| `server/services/reportService.js` | 修改 | `_collectStatistics()` 新增 `self_assessment` 分支 + `_generateAiContent()` 新增 `self_assessment` 分支 + `_generateV2Html()` 新增自评报告模板 |
| `server/routes/hse-standard.js` | 新增 | 22 个 API 路由 |
| `server/app.js` | 修改 | 挂载新路由 `app.use('/api/hse/standard', standardRoutes)`（1 行） |
| `server/test/sprint4-standard-test.js` | 新增 | 后端测试脚本 |

### 7.2 前端（11 个文件）

| 文件 | 操作 | 说明 |
|------|------|------|
| `api/hse/standard.ts` | 新增 | API 客户端 + 类型定义 |
| `views/hse/standard/clauses/index.vue` | 新增 | 标准条款库页面 |
| `views/hse/standard/evaluation/index.vue` | 新增 | 评价任务列表页面 |
| `views/hse/standard/evaluation/detail.vue` | 新增 | 评价任务详情页面 |
| `views/hse/standard/components/ClauseTree.vue` | 新增 | 条款树组件 |
| `views/hse/standard/components/ClauseDetailPanel.vue` | 新增 | 条款详情面板 |
| `views/hse/standard/components/ClauseDocumentModal.vue` | 新增 | 资料关联弹窗 |
| `views/hse/standard/components/EvaluationProgress.vue` | 新增 | 评价进度组件 |
| `views/hse/standard/components/EvaluationItemCard.vue` | 新增 | 评价明细卡片 |
| `views/hse/standard/components/GapAnalysisChart.vue` | 新增 | 缺项分析图表 |
| `router/routes/modules/hse-standard.ts` | 新增 | 路由模块（自动加载） |
| `locales/langs/zh-CN/hse.json` | 修改 | 新增 standardCenter 翻译模块 |

### 7.3 不修改的文件

| 文件/目录 | 原因 |
|-----------|------|
| `packages/` | 禁止修改 Vben 核心 |
| `auth/` | 禁止修改认证模块 |
| `server/services/documentService.js` | 不修改资料中心服务（只读引用 document_files） |
| `server/services/documentAiService.js` | 不修改 AI 分析服务（只读引用 document_ai_analysis） |
| `server/routes/hse-report.js` | 不修改 Sprint3 路由（自评报告复用已有 V2 接口） |
| `src/components/` | 禁止进入公共组件目录 |

### 7.4 文件规模统计

- 新增文件：17 个（后端 4 + 前端 13）
- 修改文件：4 个（后端 3 + 前端 1）
- 合计：21 个文件

---

## 八、与 Sprint3 报告中心的连接

### 8.1 连接方式

自评报告通过 `reportService.generateReportV2()` 生成，完全复用 Sprint3 的报告体系：

| Sprint3 能力 | Sprint4 复用 |
|-------------|-------------|
| `hse_reports` 表 | 存储自评报告（`template_category = 'self_assessment'`） |
| `hse_report_templates` 表 | 新增自评报告模板 |
| `generateReportV2()` | 触发自评报告生成 |
| 异步生成 + 状态轮询 | 自评报告生成使用相同流程 |
| `_collectStatistics()` | 新增 `self_assessment` 数据采集分支 |
| `_generateAiContent()` | 新增 `self_assessment` AI 内容生成分支 |
| `_generateV2Html()` | 新增自评报告 HTML 模板 |
| `getReportListV2()` | 自评报告在报告中心"全部报告"可见 |
| `getReportByIdV2()` | 自评报告详情查看 |
| `confirmReport()` | 自评报告确认发布 |
| `exportHtml()` / `exportWord()` | 自评报告导出 |
| `archiveReport()` | 自评报告归档 |

### 8.2 报告中心展示

在 Sprint3 报告中心主页面（`views/hse/reports/index.vue`）的"全部报告"标签页中，自评报告会自动出现（`template_category = 'self_assessment'`），无需修改 Sprint3 前端代码。

> **可选增强**：如果需要在报告中心增加"自评报告"独立标签页，可在 Sprint3 前端添加第 4 个标签页。但 MVP 阶段建议先在"全部报告"中展示，避免修改 Sprint3 已完成代码。

---

## 九、风险分析

### 9.1 技术风险

| 风险 | 等级 | 影响 | 缓解措施 |
|------|------|------|---------|
| AI 评价准确性不足 | 中 | AI 对条款合规判定可能不够精确 | 1) Prompt 强约束（禁止编造、必须引用证据）；2) 人工复核覆盖机制；3) AI 置信度展示 |
| AI 调用耗时较长 | 中 | 30 个条款逐条检查可能超过 2 分钟 | 1) 异步执行 + 进度轮询；2) 批量处理优化（多个条款合并为一次 AI 调用）；3) 超时降级 |
| CHECK 约束修改风险 | 低 | 扩展 template_category 枚举值需 DROP + ADD CONSTRAINT | 1) 事务包裹；2) 迁移脚本幂等；3) 新增值不影响已有数据 |
| 条款树层级查询性能 | 低 | 递归查询层级数据 | 1) parent_id 索引；2) 一次查询全部后在内存构建树（参考 Sprint1 getCategoryTree） |
| 评价快照一致性 | 中 | 条款修改后历史评价结果可能不一致 | 评价明细表冗余存储 clause_code/clause_title/clause_content 快照 |

### 9.2 业务风险

| 风险 | 等级 | 影响 | 缓解措施 |
|------|------|------|---------|
| 标准条款初始数据不全 | 中 | 初始条款覆盖面不足影响评价效果 | 1) 预置 GB/T 33000-2016 八大要素 + 示例条款；2) 支持批量导入；3) 条款可后续扩充 |
| 资料关联覆盖率低 | 中 | 条款未关联资料导致大量"缺失"判定 | 1) 自动匹配功能；2) 评价前提示关联覆盖率；3) "缺失"状态需人工确认 |
| 整改建议落地难 | 中 | AI 建议可能不够具体或无法执行 | 1) Prompt 要求贴合环卫行业；2) 建议支持人工编辑；3) 后续 Sprint 关联整改任务闭环 |

### 9.3 依赖风险

| 风险 | 等级 | 影响 | 缓解措施 |
|------|------|------|---------|
| Sprint1 `document_standard_relation` 表结构固定 | 低 | 表结构已预留，字段满足需求 | 无需修改表结构，直接使用 |
| Sprint2 AI 分析结果质量 | 中 | 资料摘要质量影响 AI 评价准确性 | 1) 读取 `ai_suggestions` 和 `ai_missing_items` 辅助判定；2) 无 AI 分析的资料使用文件名 + summary 降级 |
| Sprint3 `reportService` 接口稳定性 | 低 | 自评报告依赖 V2 生成流程 | 接口已测试通过（Sprint3 12/12 测试通过），新增分支不影响已有逻辑 |

### 9.4 约束遵守风险

| 约束 | 风险 | 缓解措施 |
|------|------|---------|
| 禁止新增 npm 依赖 | Word 导出已用 HTML 方案解决（Sprint3） | 无风险 |
| 禁止修改 packages/ | 前端组件均在 views/hse/standard/ 下 | 无风险 |
| 禁止修改 auth/JWT | 评价中心使用现有认证中间件 | 无风险 |
| 增量开发 | 新增表 + 扩展 CHECK 约束，不修改已有字段 | 迁移脚本幂等 |

---

## 十、开发顺序建议

| 阶段 | 内容 | 依赖 |
|------|------|------|
| Phase 1 | 数据库迁移（3 张新表 + CHECK 扩展 + 种子数据） | - |
| Phase 2 | aiService 新增 `standard_evaluation` Prompt + 构建函数 | Phase 1 |
| Phase 3 | standardService 核心方法（条款 CRUD + 树构建） | Phase 1 |
| Phase 4 | standardService 关联管理（资料关联 + 自动匹配） | Phase 3 |
| Phase 5 | standardService 评价流程（异步检查 + 缺项分析） | Phase 2, 4 |
| Phase 6 | reportService 扩展（self_assessment 分支） | Phase 5 |
| Phase 7 | 后端 API 路由（22 个接口） | Phase 3-6 |
| Phase 8 | 前端 API 层 + 类型定义 | Phase 7 |
| Phase 9 | 前端条款库页面 + 组件 | Phase 8 |
| Phase 10 | 前端评价任务页面 + 组件 | Phase 8, 9 |
| Phase 11 | 后端测试 + 整体联调 | Phase 7, 10 |

---

## 附录 A：与 `standard-score-model.md` 的关系

`standard-score-model.md` 描述了一个**综合安全标准化指数评分模型**（5 维度加权评分），Sprint4 与其关系：

| 维度 | Sprint4 实现 | 评分模型设计 |
|------|-------------|-------------|
| 标准化完成率 | ✅ **Sprint4 核心**：条款级评价直接计算 | 30% 权重 |
| 资料完整率 | ✅ **Sprint4 衍生**：条款关联资料覆盖率 | 25% 权重 |
| 隐患整改率 | ⏳ 后续 Sprint：从 hazards 表采集 | 20% 权重 |
| 培训完成率 | ⏳ 后续 Sprint：从 training_records 采集 | 15% 权重 |
| 风险管控率 | ⏳ 后续 Sprint：从 risk_sources 采集 | 10% 权重 |

Sprint4 的评价任务 `completion_rate` 即为评分模型中"标准化完成率"维度的数据来源。综合评分看板（`safety_scores` 表）留待后续 Sprint 实现。

---

## 附录 B：GB/T 33000-2016 标准要素参考

| 一级要素 | 二级要素示例 |
|---------|------------|
| 1. 目标职责 | 1.1 安全目标、1.2 机构和职责、1.3 安全生产投入 |
| 2. 制度化管理 | 2.1 法规标准识别、2.2 规章制度、2.3 操作规程、2.4 文档管理 |
| 3. 教育培训 | 3.1 教育培训管理、3.2 人员教育培训 |
| 4. 现场管理 | 4.1 设备设施管理、4.2 作业安全、4.3 职业健康 |
| 5. 安全风险管控及隐患排查治理 | 5.1 安全风险管理、5.2 重大危险源辨识与管理、5.3 隐患排查治理 |
| 6. 应急管理 | 6.1 应急准备、6.2 应急处置 |
| 7. 事故管理 | 7.1 事故报告、7.2 事故调查和处理 |
| 8. 持续改进 | 8.1 绩效评定、8.2 持续改进 |

---

**文档版本**：v1.0  
**生成日期**：2026-07-19  
**设计范围**：安全生产标准化评价中心（标准条款库 + AI 辅助检查 + 缺项分析 + 自评报告）

# HSE V2 Sprint4 安全生产标准化评价中心最终设计方案

> 版本：v1.0（最终版）  
> 日期：2026-07-19  
> 前置依赖：Sprint1（安全资料中心）、Sprint2（AI 文件分析）、Sprint3（安全生产汇报中心）

---

## 一、Sprint4 目标

### 1.1 MVP 范围（6 项，全部实现）

| 序号 | 功能模块 | 说明 |
|------|---------|------|
| 1 | 安全标准条款管理 | 三级层级条款库（参照 GB/T 33000-2016），支持增删改查、批量导入 |
| 2 | 标准条款与资料关联 | 自动匹配 + 手动关联，自动匹配需人工确认后才生效 |
| 3 | AI 辅助标准化检查 | AI 逐条对照标准检查资料合规性，给出建议状态和证据链 |
| 4 | 缺项分析 | 按要素统计缺项，识别高风险不合规条款 |
| 5 | 整改建议生成 | AI 针对不合规条款生成具体整改建议 |
| 6 | 标准化自评报告生成 | 复用 Sprint3 报告体系，生成自评报告（仅使用人工确认后的结果） |

### 1.2 禁止开发范围（5 项，Sprint4 不做）

| ❌ 禁止项 | 说明 | 后续 Sprint 计划 |
|-----------|------|----------------|
| 安全驾驶舱 | 独立的标准化评分驾驶舱页面 | 后续 Sprint |
| 自动认证 | 自动生成认证报告、自动判定达标 | 后续 Sprint |
| 自动达标判定 | AI 直接给出"企业达标/不达标"结论 | **永远禁止**，必须人工确认 |
| 复杂评分模型 | `safety_scores` 五维评分体系（标准化/资料/隐患/培训/风险） | 后续 Sprint |
| 五维安全评分体系 | 五维度加权综合评分 | 后续 Sprint |

### 1.3 系统级约束

| 约束 | 状态 |
|------|------|
| 禁止修改 Vben Admin 核心（packages/@core/、packages/effects/、packages/themes/） | ✅ 遵守 |
| 禁止修改登录相关（auth middleware / routes / store / JWT / 登录页） | ✅ 遵守 |
| 禁止新增 npm 依赖 | ✅ 遵守（echarts 已通过 @vben/plugins/echarts 引入） |
| 不创建公共组件（所有组件放 views/hse/standard/ 下） | ✅ 遵守 |
| 优先复用已有能力（aiService / reportService / Ant Design Vue / EchartsUI） | ✅ 遵守 |

---

## 二、业务流程

### 2.1 总体流程

```
标准条款库管理                    资料中心 (Sprint1)
     │                                 │
     ├─ 新增/编辑/删除条款             ├─ 文件上传
     └─ 批量导入                      └─ AI分析 (Sprint2)
                                       │
                                       ▼
                              条款-资料关联
                               ├─ 自动匹配 (status=pending)
                               └─ 人工确认 (status=valid)
                                       │
                                       ▼
                              创建评价任务 (异步)
                               ├─ 选择评价范围
                               ├─ 启动 AI 辅助检查
                               └─ 进度轮询
                                       │
                                       ▼
                              AI 逐条评价
                               ├─ ai_verdict (建议状态)
                               ├─ evidence (证据链)
                               ├─ ai_suggestion (整改建议)
                               └─ compliance_status = pending (待人工确认)
                                       │
                                       ▼
                              人工复核
                               ├─ 逐条确认 / 批量确认
                               ├─ 覆盖 AI 判定
                               └─ compliance_status = 最终值
                                       │
                                       ▼
                              缺项分析 + 整改建议
                               ├─ 按要素统计
                               ├─ 缺项清单
                               └─ AI 整改建议汇总
                                       │
                                       ▼
                              自评报告生成 (复用 Sprint3)
                               ├─ hse_reports 存储
                               ├─ template_category = self_assessment
                               └─ 报告中心查看/导出
```

### 2.2 标准条款管理流程

```
管理员进入条款库页面
    │
    ├─ 查看三级条款树（左侧）
    │   ├─ 一级要素（8 个）
    │   ├─ 二级要素
    │   └─ 具体条款
    │
    ├─ 选中条款 → 右侧详情面板
    │   ├─ 条款基本信息（编码、标题、要求描述、检查方法、分值权重）
    │   ├─ 已关联资料列表
    │   └─ 操作：编辑、删除、关联资料、自动匹配
    │
    └─ 批量操作
        ├─ 批量导入条款（JSON 格式）
        └─ 批量调整排序
```

### 2.3 条款-资料关联流程

```
选择某个具体条款 → 进入关联管理
    │
    ├─ 方式一：自动匹配
    │   ├─ 系统按条款关键词匹配资料中心文件
    │   ├─ 结果列表：文件名、匹配置信度、AI 分析摘要
    │   ├─ 写入 document_standard_relation
    │   │   └─ status = pending, match_type = auto
    │   └─ 人工确认 → status = valid
    │
    └─ 方式二：手动关联
        ├─ 从资料中心选择文件
        ├─ 直接关联
        └─ 写入 status = valid, match_type = manual
```

### 2.4 AI 辅助检查流程（异步）

```
创建评价任务 → 启动评价
    │
    ▼
task_status = in_progress
    │
    ├─ 遍历评价范围内的所有具体条款
    │   │
    │   ├─ 对于每个条款：
    │   │   ├─ 查询 status = valid 的关联资料
    │   │   ├─ 读取资料 AI 分析摘要 (document_ai_analysis)
    │   │   ├─ 构建 AI 检查 Prompt
    │   │   │   └─ 强约束：必须包含 evidence
    │   │   ├─ 调用 AI
    │   │   ├─ 解析 AI 响应
    │   │   │   ├─ ai_verdict (AI 建议状态)
    │   │   │   ├─ evidence (证据链)
    │   │   │   ├─ findings (检查发现)
    │   │   │   ├─ missingItems (缺项)
    │   │   │   └─ suggestion (整改建议)
    │   │   └─ 后处理校验
    │   │       ├─ 若 verdict=compliant 但 evidence 为空
    │   │       │   └─ 自动降级：ai_verdict = unknown
    │   │       └─ compliance_status 始终 = pending（待人工确认）
    │   │
    │   └─ 写入 standard_evaluation_items (evaluation_round + 1)
    │
    ├─ 完成后计算 AI 辅助指标
    │   ├─ ai_overall_score (AI 建议得分)
    │   └─ ai_overall_level (AI 建议等级)
    │
    └─ task_status = completed
```

### 2.5 人工复核流程

```
进入评价任务详情 → 评价明细
    │
    ├─ 按要素分组展示条款列表
    │   └─ 每条显示：
    │       ├─ 条款编码、标题
    │       ├─ ai_verdict (AI 建议状态，带标签颜色)
    │       ├─ evidence (证据链，可展开查看)
    │       ├─ compliance_status (最终状态，初始为 pending)
    │       └─ 操作：确认合规 / 部分符合 / 不符合 / 缺失
    │
    ├─ 人工复核操作
    │   ├─ 单条确认：选择最终状态 + 填写备注
    │   ├─ 批量确认：选中多条 → 批量设置最终状态
    │   └─ 重置：清空人工状态，恢复为 pending
    │
    └─ 复核完成
        ├─ 计算最终统计
        ├─ 生成缺项分析报告
        └─ 支持生成自评报告
```

### 2.6 自评报告生成流程

```
评价任务详情 → 自评报告标签页
    │
    ├─ 点击"生成自评报告"
    │
    ├─ 数据校验
    │   └─ 仅使用 compliance_status 为非 pending 的条款
    │   （未确认的条款不计入统计）
    │
    ├─ 调用 reportService.generateReportV2()
    │   ├─ template_category = self_assessment
    │   ├─ 数据来源：人工确认后的评价结果
    │   ├─ AI 辅助：生成报告整体摘要
    │   └─ 报告 HTML 渲染
    │
    └─ 存入 hse_reports 表
        ├─ 报告中心 (Sprint3) 可查看
        └─ 支持：预览、编辑、确认、导出、归档
```

---

## 三、系统架构

### 3.1 整体架构

```
┌──────────────────────────────────────────────────────────────────┐
│                        前端 (Vben Admin)                          │
│                                                                  │
│  views/hse/standard/                                             │
│    ├─ clauses/index.vue          标准条款库页面                   │
│    ├─ evaluation/index.vue       评价任务列表页面                 │
│    ├─ evaluation/detail.vue      评价任务详情页面                 │
│    └─ components/                业务组件（6个）                  │
│                                                                  │
│  api/hse/standard.ts             API 客户端 + 类型定义            │
│  router/routes/modules/hse-standard.ts  路由模块（自动加载）      │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                        后端 (Node.js + Express)                   │
│                                                                  │
│  routes/hse-standard.js          API 路由（22个端点）             │
│  services/standardService.js     评价中心核心服务                 │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  复用服务                                                  │   │
│  │  ├─ aiService.js        →  AI 调用 + Prompt 管理          │   │
│  │  ├─ reportService.js    →  自评报告生成 (V2 流程)          │   │
│  │  ├─ documentAiService.js →  资料 AI 分析结果读取           │   │
│  │  └─ notificationService  →  评价完成通知                   │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                      数据库 (PostgreSQL)                          │
│                                                                  │
│  新建表（3张）                                                    │
│    ├─ safety_standard_clauses    标准条款主表                    │
│    ├─ standard_evaluation_tasks  评价任务表                      │
│    └─ standard_evaluation_items  评价明细表                      │
│                                                                  │
│  复用表（4张，不修改结构或仅扩展 CHECK 约束）                     │
│    ├─ document_standard_relation  资料-条款关联 (Sprint1 预留)   │
│    ├─ document_ai_analysis       资料 AI 分析 (Sprint2)          │
│    ├─ hse_reports                报告主表 (Sprint3)              │
│    └─ hse_report_templates       报告模板表 (Sprint3)            │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 复用能力清单

| 现有能力 | Sprint4 复用方式 |
|---------|----------------|
| `aiService.js` | 新增 `standard_evaluation` Prompt 模板，复用 chat / 强约束 / JSON 解析 |
| `documentAiService.js` | 只读调用 `getLatestAnalysis()` 获取资料 AI 分析结果 |
| `reportService.js` | 自评报告复用 V2 流程，新增 `self_assessment` 分支 |
| `notificationService` | 评价任务完成后发送通知 |
| `@vben/request` | HTTP 请求封装 |
| `Ant Design Vue` | UI 组件库（树、表格、抽屉、进度条、标签等） |
| `EchartsUI` (@vben/plugins/echarts) | 缺项分析柱状图 |
| `document_standard_relation` 表 | Sprint1 预留，直接激活使用 |

---

## 四、数据库设计

### 4.1 设计原则

1. **新增表**：3 张，使用 `CREATE TABLE IF NOT EXISTS`
2. **扩展已有表**：仅扩展 CHECK 约束（`template_category` 新增 `'self_assessment'`），不修改字段/索引/数据
3. **复用表**：4 张表直接复用（`document_standard_relation` 激活使用）
4. **禁止覆盖历史**：评价明细按 `evaluation_round` 保留历史轮次
5. **AI 与人工分离**：AI 建议结果和人工最终结果分字段存储
6. **禁止物理删除**：使用 `is_deleted` 或状态字段

### 4.2 新建表

#### 4.2.1 `safety_standard_clauses` — 标准条款主表

三级层级标准条款库，参照 GB/T 33000-2016。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | BIGSERIAL | PRIMARY KEY | 主键 |
| `code` | VARCHAR(64) | NOT NULL, UNIQUE | 条款编码（业务唯一键，如 `5.1.1`） |
| `parent_id` | BIGINT | | 父条款 ID，一级要素为 NULL |
| `level` | SMALLINT | NOT NULL DEFAULT 1 | 层级：1=一级要素，2=二级要素，3=具体条款 |
| `element_name` | VARCHAR(128) | | 要素名称（一级/二级要素时使用） |
| `clause_title` | VARCHAR(256) | | 条款标题（具体条款时使用） |
| `clause_content` | TEXT | | 条款要求描述（详细要求内容） |
| `check_method` | TEXT | | 检查方法（如何验证条款是否满足） |
| `score_weight` | DECIMAL(5,2) | DEFAULT 0 | 分值权重（辅助指标） |
| `required_doc_types` | JSONB | DEFAULT '[]' | 要求的资料类型（用于自动匹配提示） |
| `keywords` | JSONB | DEFAULT '[]' | 匹配关键词（用于自动关联资料文件） |
| `sort_order` | INTEGER | DEFAULT 0 | 排序序号 |
| `status` | VARCHAR(20) | DEFAULT 'active' CHECK IN ('active','inactive') | 状态 |
| `created_by` | BIGINT | | 创建人 |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | 创建时间 |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | 更新时间 |
| `is_deleted` | BOOLEAN | DEFAULT FALSE | 软删除标记 |

**索引**：
- `uk_safety_standard_code` — `code` 唯一索引
- `idx_safety_standard_parent` — `parent_id` 索引（树查询）
- `idx_safety_standard_level` — `level` 索引

#### 4.2.2 `standard_evaluation_tasks` — 评价任务表

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | BIGSERIAL | PRIMARY KEY | 主键 |
| `task_name` | VARCHAR(256) | NOT NULL | 评价任务名称 |
| `evaluation_scope` | JSONB | DEFAULT '{}' | 评价范围：`{"all": true}` 或 `{"elementCodes": ["1","2"]}` |
| `evaluation_period` | VARCHAR(20) | | 评价周期（如 `2026-Q3`） |
| `current_round` | INTEGER | DEFAULT 0 | 当前评价轮次（从 0 开始，每次重新评价 +1） |
| `total_clauses` | INTEGER | DEFAULT 0 | 总条款数（快照） |
| `task_status` | VARCHAR(20) | DEFAULT 'draft' | 任务状态：draft / in_progress / completed / failed / archived |
| `ai_enabled` | BOOLEAN | DEFAULT TRUE | 是否启用 AI 辅助检查 |
| `ai_status` | VARCHAR(20) | DEFAULT 'none' | AI 检查状态：none / pending / processing / completed / failed |
| `ai_overall_score` | DECIMAL(5,2) | | **AI 建议得分**（辅助指标） |
| `ai_overall_level` | VARCHAR(20) | | **AI 建议等级**（辅助）：excellent / good / qualified / basic / unqualified |
| `final_overall_score` | DECIMAL(5,2) | | **最终得分**（人工确认后） |
| `final_overall_level` | VARCHAR(20) | | **最终等级**（人工确认后） |
| `level_confirmed_by` | BIGINT | | 等级确认人 |
| `level_confirmed_at` | TIMESTAMPTZ | | 等级确认时间 |
| `error_message` | TEXT | | 错误信息 |
| `created_by` | BIGINT | | 创建人 |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | 创建时间 |
| `started_at` | TIMESTAMPTZ | | 开始执行时间 |
| `completed_at` | TIMESTAMPTZ | | 完成时间 |
| `is_deleted` | BOOLEAN | DEFAULT FALSE | 软删除标记 |

**索引**：
- `idx_eval_task_status` — `task_status` 索引
- `idx_eval_task_period` — `evaluation_period` 索引
- `idx_eval_task_created_by` — `created_by` 索引

> **关键设计**：AI 结果（`ai_overall_score/level`）和最终结果（`final_overall_score/level`）分字段存储，禁止 AI 结果直接作为最终结论。

#### 4.2.3 `standard_evaluation_items` — 评价明细表

每个条款在一次评价任务的某一轮次中的评价结果。禁止覆盖历史。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | BIGSERIAL | PRIMARY KEY | 主键 |
| `task_id` | BIGINT | NOT NULL | 评价任务 ID |
| `clause_id` | BIGINT | NOT NULL | 条款 ID |
| `evaluation_round` | INTEGER | NOT NULL DEFAULT 0 | **评价轮次**（每次重新评价 +1） |
| `clause_code` | VARCHAR(64) | NOT NULL | 条款编码（快照，防条款修改影响历史） |
| `clause_title` | VARCHAR(256) | | 条款标题（快照） |
| `clause_content` | TEXT | | 条款要求（快照） |
| `score_weight` | DECIMAL(5,2) | | 分值权重（快照） |
| **`ai_verdict`** | VARCHAR(20) | DEFAULT 'unknown' | **AI 建议状态**：compliant / partial / non_compliant / missing / unknown |
| **`compliance_status`** | VARCHAR(20) | DEFAULT 'pending' | **最终状态（人工）**：pending / compliant / partial / non_compliant / missing |
| `matched_file_ids` | JSONB | DEFAULT '[]' | 关联资料文件 ID 列表（快照） |
| `matched_file_summary` | JSONB | DEFAULT '[]' | 关联资料摘要（文件名 + AI 分析摘要片段） |
| `ai_check_result` | JSONB | | AI 检查结果详情 |
| `ai_evidence` | TEXT | | AI 证据链摘要（从 ai_check_result.evidence 提取） |
| `ai_suggestion` | TEXT | | AI 整改建议 |
| `ai_confidence` | DECIMAL(5,2) | | AI 判定置信度 |
| `manual_remark` | TEXT | | 人工备注 |
| `checked_by` | BIGINT | | 检查（确认）人 |
| `checked_at` | TIMESTAMPTZ | | 检查（确认）时间 |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | 创建时间 |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | 更新时间 |
| `is_deleted` | BOOLEAN | DEFAULT FALSE | 软删除标记 |

**`ai_check_result` JSON 结构**：
```json
{
  "verdict": "partial",
  "findings": "条款要求配备安全生产费用使用计划，关联资料中有费用台账但未找到使用计划",
  "missingItems": ["安全生产费用使用计划"],
  "evidence": "关联文件《2026年安全费用台账》第3页，费用支出明细中...",
  "suggestion": "补充编制安全生产费用使用计划，明确费用使用范围和审批流程"
}
```

**唯一约束**：
- `uk_eval_item_task_clause_round` — `(task_id, clause_id, evaluation_round)` 唯一
  - > 设计调整：原设计为 `(task_id, clause_id)`，现增加轮次维度，保留历史评价

**索引**：
- `idx_eval_item_task` — `task_id` 索引
- `idx_eval_item_clause` — `clause_id` 索引
- `idx_eval_item_round` — `evaluation_round` 索引
- `idx_eval_item_status` — `compliance_status` 索引

> **关键设计**：
> - `ai_verdict`：AI 建议状态，仅作参考
> - `compliance_status`：最终状态，仅人工确认后更新
> - `evaluation_round`：保留历史评价，重新评价不覆盖旧数据

### 4.3 扩展已有表

#### 4.3.1 `hse_report_templates` — 扩展 template_category 枚举

```sql
-- 原 CHECK 约束枚举值：
-- ['statistical', 'monthly_report', 'group_report']
--
-- 扩展后：
-- ['statistical', 'monthly_report', 'group_report', 'self_assessment']
--
-- 修改方式（PostgreSQL 不支持 ALTER CONSTRAINT，需 DROP + ADD）：
ALTER TABLE hse_report_templates
  DROP CONSTRAINT IF EXISTS hse_report_templates_template_category_check;

ALTER TABLE hse_report_templates
  ADD CONSTRAINT hse_report_templates_template_category_check
  CHECK (template_category = ANY (ARRAY[
    'statistical'::character varying,
    'monthly_report'::character varying,
    'group_report'::character varying,
    'self_assessment'::character varying
  ]));
```

同时插入 1 条自评报告模板记录（`template_category = 'self_assessment'`, `ai_enabled = true`）。

#### 4.3.2 `hse_reports` — 扩展 template_category 枚举

同步扩展 `template_category` CHECK 约束，新增 `'self_assessment'`。

```sql
ALTER TABLE hse_reports
  DROP CONSTRAINT IF EXISTS hse_reports_template_category_check;

ALTER TABLE hse_reports
  ADD CONSTRAINT hse_reports_template_category_check
  CHECK (template_category = ANY (ARRAY[
    'statistical'::character varying,
    'monthly_report'::character varying,
    'group_report'::character varying,
    'self_assessment'::character varying
  ]));
```

> `hse_reports` 的其他字段（`generation_status`、`ai_status`、`confirm_status`、`report_status`、`source_data_ref` 等）全部复用，无需新增。

### 4.4 复用表（不修改结构）

#### 4.4.1 `document_standard_relation`（Sprint1 预留）

Sprint1 已建表但未使用，Sprint4 激活。字段列表：

| 字段 | 类型 | Sprint4 用途 |
|------|------|-------------|
| `file_id` | BIGINT | 关联 document_files.id |
| `clause_code` | VARCHAR(64) | 关联 safety_standard_clauses.code（业务键，无外键） |
| `clause_name` | VARCHAR(256) | 冗余存储条款名称 |
| `match_type` | VARCHAR(16) | `auto`（自动匹配）/ `manual`（手动关联） |
| `match_confidence` | DECIMAL(5,2) | 自动匹配置信度 |
| `status` | VARCHAR(16) | **pending**（待确认）/ **valid**（有效）/ invalid（无效） |
| `verified_by` | VARCHAR(64) | 确认人 |
| `verified_at` | TIMESTAMP | 确认时间 |
| `is_deleted` | BOOLEAN | 软删除 |

**关键规则**：
- 自动匹配写入时 `status = 'pending'`
- 人工确认后 `status = 'valid'`
- AI 评价时只使用 `status = 'valid'` 的关联资料作为证据

#### 4.4.2 `document_ai_analysis`（Sprint2，只读引用）

| 字段 | Sprint4 用途 |
|------|-------------|
| `ai_summary` | 注入条款检查 Prompt 作为资料摘要 |
| `ai_suggestions` | 格式 `[{standard, suggestion, level}]`，辅助判定 |
| `ai_missing_items` | 格式 `[{item, reason, priority}]`，补充缺项分析 |

### 4.5 ER 关系图

```
safety_standard_clauses (新)
    │ code (业务键)
    │
    ├─────────────────────────────── document_standard_relation (Sprint1)
    │                                    │ file_id → document_files.id
    │                                    │ clause_code → safety_standard_clauses.code
    │                                    │
    │                                    └── document_files (Sprint1)
    │                                            │ latest_ai_analysis_id
    │                                            │
    │                                            └── document_ai_analysis (Sprint2, 只读)
    │
    └──────── standard_evaluation_items (新)
                 │ task_id → standard_evaluation_tasks.id
                 │ clause_id → safety_standard_clauses.id
                 │ evaluation_round (历史轮次)
                 │
                 └── standard_evaluation_tasks (新)
                          │
                          └── hse_reports (Sprint3 扩展)
                                  │ template_category = 'self_assessment'
                                  │ source_data_ref → evaluation_task_id
```

### 4.6 种子数据

标准条款初始数据（参照 GB/T 33000-2016 八大要素）：

| 编码 | 一级要素 | 辅助权重 |
|------|---------|---------|
| 1 | 目标职责 | 5 |
| 2 | 制度化管理 | 15 |
| 3 | 教育培训 | 10 |
| 4 | 现场管理 | 25 |
| 5 | 安全风险管控及隐患排查治理 | 25 |
| 6 | 应急管理 | 10 |
| 7 | 事故管理 | 5 |
| 8 | 持续改进 | 5 |

每个一级要素下预置 2-3 个二级要素，每个二级要素下预置 1-2 个示例条款（共约 30 条具体条款）。管理员可后续维护扩充。

---

## 五、AI 评价流程

### 5.1 异步执行模型

```
HTTP 请求
  POST /evaluations/:id/start
      │
      ├─ 验证权限
      ├─ 更新 task_status = in_progress, ai_status = processing
      ├─ current_round + 1
      ├─ 立即返回响应（不等待 AI 完成）
      └─ setImmediate 触发后台执行
              │
              ▼
        后台异步执行 (setImmediate)
              │
              ├─ 逐条条款评价
              │   ├─ 查询关联资料 (status = valid)
              │   ├─ 读取 AI 分析摘要
              │   ├─ 构建 Prompt
              │   ├─ 调用 AI
              │   ├─ 解析 + 校验 evidence
              │   └─ 写入 item (evaluation_round = current_round)
              │
              ├─ 计算 ai_overall_score / ai_overall_level
              └─ 更新 task_status = completed
```

### 5.2 Prompt 设计

在 `aiService.js` 的 `PROMPT_TEMPLATES` 中新增 `standard_evaluation`。

**Prompt 结构**：

```
【强约束规则】
1. 你是环卫企业安全生产管理系统的AI助手，仅基于提供的标准条款要求和关联资料进行分析。
2. 禁止编造任何数据。如果某项资料缺失，必须明确说明"暂无资料"或"未找到相关资料"。
3. 仅根据关联资料的内容判定条款合规状态，不得引用未提供的资料。
4. 【证据链要求】判定必须有依据，evidence 字段必须引用关联资料的具体内容作为证据。
5. 如果 verdict = compliant 但你无法提供具体证据，必须将 verdict 设为 unknown。
6. 禁止直接给出"企业达标"或"企业不达标"的最终结论，你仅提供单条款的辅助判断。
7. 整改建议必须具体、可操作、贴合环卫行业特点。
8. 严格按指定JSON结构返回，不允许返回Markdown代码块。

【标准条款信息】
条款编码：{clauseCode}
条款标题：{clauseTitle}
条款要求：{clauseContent}
检查方法：{checkMethod}

【关联资料（已人工确认有效的资料）】
{
  遍历关联文件，输出：
  - 文件名
  - AI分析摘要
  - 已有合规建议
}
（若无关联资料，输出"暂无关联资料"）

【请输出以下JSON结构】
{
  "verdict": "compliant|partial|non_compliant|missing|unknown",
  "findings": "检查发现描述（说明资料是否满足条款要求）",
  "missingItems": ["缺失的资料项列表"],
  "evidence": "判定依据（必须引用关联资料的具体内容，无证据填空字符串）",
  "suggestion": "整改建议（不符合或部分符合时给出，符合时填空）"
}
```

### 5.3 证据链强制校验

AI 返回后，后端必须做强制校验：

```
AI 响应 → JSON 解析成功
    │
    ├─ 校验：verdict = compliant 且 evidence 为空
    │   └─ 是 → 自动降级：ai_verdict = unknown
    │           ai_evidence = ''
    │
    ├─ 校验：verdict = missing（无关联资料时）
    │   └─ 是 → ai_verdict = missing
    │
    └─ compliance_status 始终保持 = pending（不随 AI 修改）
```

**规则**：
- 无证据的合规判定一律降级为 unknown
- 缺失资料的判定为 missing
- compliance_status 始终由人工确认

### 5.4 AI 失败降级策略

| 场景 | 处理方式 |
|------|---------|
| AI 调用超时/失败 | ai_verdict = 'unknown'，error_message 记录，不阻断整体评价 |
| AI 返回非 JSON | 尝试解析（剥离代码块 → 截取首尾大括号 → JSON.parse），失败则 unknown |
| 无关联资料 | 不调用 AI，直接 ai_verdict = 'missing' |
| 评价任务整体 AI 失败 | ai_status = 'failed'，已完成的条款保留 ai_verdict，未完成的为 unknown |

### 5.5 AI 响应可追溯性

每条评价明细都可追溯完整证据链：

```
评价明细 (standard_evaluation_items)
    ├─ clause_code / clause_title
    │   → safety_standard_clauses（标准条款）
    ├─ matched_file_ids / matched_file_summary
    │   → document_files（关联资料）
    │       → document_ai_analysis（资料 AI 分析结果）
    ├─ ai_verdict / ai_check_result / ai_evidence
    │   → AI 判定详情
    └─ evaluation_round
        → 历史轮次对比
```

---

## 六、人工审核流程

### 6.1 审核模型

```
AI 辅助评价（ai_verdict） → 人工确认（compliance_status） → 最终结果
```

**双轨制**：AI 结果和人工结果分字段存储，互不覆盖。

### 6.2 审核操作

| 操作 | 说明 |
|------|------|
| 单条确认 | 选中单条条款，选择最终状态（compliant/partial/non_compliant/missing）+ 备注 |
| 批量确认 | 选中多条，批量设置同一最终状态 |
| 重置 | 清空人工状态，恢复为 pending |
| 一键采纳 AI | 将 ai_verdict 写入 compliance_status（仍需人工点击确认操作，不是自动） |
| 查看证据 | 展开查看关联资料 + AI 证据链 + 资料 AI 分析详情 |

### 6.3 审核状态流转

```
pending（待确认）
    │
    ├─ 人工确认合规 → compliant
    ├─ 人工确认部分符合 → partial
    ├─ 人工确认不符合 → non_compliant
    └─ 人工确认缺失 → missing

任何已确认状态 ── 重置 ──→ pending
```

### 6.4 等级确认

```
评价明细全部/部分确认后
    │
    ├─ 系统计算（基于 compliance_status）
    │   ├─ 完成率 = 已确认条款数 / 总条款数
    │   ├─ 合规率 = compliant 条款数 / 已确认条款数
    │   └─ 建议得分（辅助） = 按权重加权计算
    │
    └─ 人工确认等级
        ├─ 设置 final_overall_score
        ├─ 设置 final_overall_level
        ├─ 记录 level_confirmed_by / level_confirmed_at
        └─ 等级确认后才可生成正式自评报告
```

### 6.5 历史评价对比

支持查看不同轮次的评价结果对比：

- 默认展示最新轮次
- 可切换查看历史轮次
- 可对比两轮之间的状态变化（哪些条款改进了、哪些新增了缺项）

---

## 七、标准条款管理设计

### 7.1 数据模型

三级树形结构：

```
一级要素（level = 1）
  └─ 二级要素（level = 2）
        └─ 具体条款（level = 3）
```

### 7.2 功能列表

| 功能 | 说明 |
|------|------|
| 条款树展示 | 左侧树，三级展开，支持搜索定位 |
| 条款详情 | 右侧面板展示选中条款的完整信息 |
| 新增条款 | 选择父级，填写编码/标题/要求/检查方法/权重/关键词 |
| 编辑条款 | 修改条款信息 |
| 删除条款 | 软删除，检查是否有子条款/关联评价 |
| 调整排序 | 拖拽或手动输入 sort_order |
| 启用/禁用 | 控制条款是否参与评价 |
| 批量导入 | JSON 格式批量导入条款树 |
| 关联资料管理 | 查看/关联/取消关联资料 |
| 自动匹配 | 按关键词自动匹配资料中心文件 |

### 7.3 自动匹配逻辑

```
输入：选中的条款（keywords 字段）
    │
    ├─ 关键词匹配 document_files.original_name ILIKE
    │   └─ 取 Top 10 结果
    ├─ 关联 document_ai_analysis 获取 AI 摘要
    ├─ 计算匹配置信度（关键词命中数 / 总关键词数）
    │
    └─ 返回匹配建议列表
        └─ 管理员确认后写入 document_standard_relation
            status = pending（需二次确认才变 valid）
```

---

## 八、资料关联设计

### 8.1 关联模型

复用 Sprint1 预留的 `document_standard_relation` 表。

```
条款 (safety_standard_clauses)
    │ code
    │
    └── 关联表 (document_standard_relation)
            ├─ clause_code
            ├─ file_id → document_files
            ├─ match_type: auto / manual
            ├─ status: pending / valid / invalid
            └─ verified_by / verified_at
```

### 8.2 关联方式

| 方式 | match_type | 初始 status | 确认后 status |
|------|-----------|------------|--------------|
| 自动匹配 | auto | pending | valid（人工确认） |
| 手动关联 | manual | valid | -（直接生效） |

### 8.3 关联状态流转

```
自动匹配 → pending ── 人工确认 ──→ valid
                └── 忽略/删除 ──→ is_deleted = true

手动关联 → valid ── 取消关联 ──→ is_deleted = true
```

### 8.4 AI 评价的资料使用规则

**AI 评价时只使用 `status = 'valid'` 的关联资料**：
- 自动匹配但未确认的资料（pending）不参与 AI 评价
- 确保证据链的可靠性
- 避免误匹配的资料干扰 AI 判定

---

## 九、缺项分析设计

### 9.1 缺项定义

以下状态的条款计入缺项：
- `non_compliant`（不符合）
- `missing`（缺失）
- `partial`（部分符合）— 半缺项

### 9.2 统计维度

| 维度 | 说明 |
|------|------|
| 按要素统计 | 每个一级要素的：总条款数、符合数、部分符合数、不符合数、缺失数、待确认数 |
| 整体统计 | 总条款数、已确认数、待确认数、合规率、完成率 |
| 高风险缺项 | 按权重排序的 Top N 缺项条款 |
| 缺项清单 | 所有缺项条款的详细列表（含整改建议） |

### 9.3 数据来源

缺项分析的数据来源为**人工确认后的结果**（`compliance_status`）。

- 待确认（pending）的条款不计入缺项统计
- 展示时标注"已确认 X / 共 Y 条"
- 确保统计结果的可靠性

### 9.4 可视化

- 各要素缺项柱状图（EchartsUI）
- 整体合规率环形图
- 缺项清单表格（可按要素/权重/状态筛选）

### 9.5 整改建议汇总

针对所有缺项条款，汇总 AI 整改建议：
- 按要素分组
- 按优先级排序（高/中/低）
- 支持人工编辑建议
- 支持导出缺项 + 整改建议清单

---

## 十、自评报告设计

### 10.1 设计原则

- **复用 Sprint3 报告体系**：通过 `reportService.generateReportV2()` 生成
- **仅使用人工确认数据**：报告数据来源于 `compliance_status`（人工确认后的最终状态）
- **AI 未确认数据不进入报告**：待确认（pending）的条款不计入统计
- **报告可编辑**：生成后支持人工编辑调整

### 10.2 报告模板

新增 `template_category = 'self_assessment'` 模板。

**报告结构**：

```
1. 封面
   ├─ 报告名称
   ├─ 评价周期
   ├─ 评价范围
   └─ 生成日期

2. 评价概述
   ├─ 评价范围说明
   ├─ 标准依据（GB/T 33000-2016）
   └─ 评价方法

3. 总体评价结果
   ├─ 已确认条款数 / 总条款数
   ├─ 最终得分（final_overall_score）
   ├─ 最终等级（final_overall_level）
   └─ 等级确认人 + 时间

4. 各要素评价情况
   ├─ 按 8 个一级要素分组
   │   ├─ 要素名称
   │   ├─ 评价结果（符合/部分符合/不符合/缺失 数量）
   │   └─ 要素分析摘要

5. 缺项分析
   ├─ 缺项统计图表
   ├─ 高风险缺项 Top 10
   └─ 缺项清单（含条款编码、标题、缺项说明）

6. 整改建议
   ├─ 按优先级排序
   ├─ 按要素分组
   └─ 整改建议详细列表

7. 附件
   └─ 评价明细表（可选）
```

### 10.3 数据来源

| 报告章节 | 数据来源 |
|---------|---------|
| 总体评价结果 | standard_evaluation_tasks.final_overall_score/level |
| 各要素评价 | standard_evaluation_items（按 compliance_status 统计） |
| 缺项分析 | standard_evaluation_items（缺项过滤 + 分组） |
| 整改建议 | standard_evaluation_items.ai_suggestion + 人工编辑 |
| AI 摘要 | hse_reports.ai_summary（AI 生成的整体分析摘要） |

### 10.4 生成流程

```
评价任务详情 → 生成自评报告
    │
    ├─ 数据校验
    │   ├─ 检查是否有 final_overall_level（等级已确认）
    │   └─ 检查已确认条款数 ≥ 阈值（如 ≥ 50%）
    │
    ├─ 调用 reportService.generateReportV2()
    │   ├─ template_category = 'self_assessment'
    │   ├─ reportPeriod = evaluationPeriod
    │   ├─ aiEnabled = true
    │   ├─ source_data_ref = { evaluationTaskId, ... }
    │   └─ 异步生成
    │
    └─ 返回 reportId
        └─ 前端轮询状态 → 完成后在报告中心查看
```

### 10.5 与 Sprint3 报告中心的集成

- 自评报告存入 `hse_reports` 表，`template_category = 'self_assessment'`
- 在 Sprint3 报告中心的"全部报告"标签页中自动可见
- 复用 Sprint3 的所有报告能力：预览、编辑、确认、归档、HTML 导出、Word 导出
- **不需要修改 Sprint3 前端代码**

---

## 十一、后端接口设计

### 11.1 路由信息

- 路由文件：`server/routes/hse-standard.js`
- 挂载前缀：`/api/hse/standard`
- 权限控制：复用 `requireRole('admin', 'safety_manager')` 中间件

### 11.2 接口清单（22 个）

#### 11.2.1 标准条款管理（7 个）

| 序号 | 方法 | 路径 | 功能 | 关键参数 |
|------|------|------|------|---------|
| 1 | GET | `/clauses/tree` | 获取条款树（全量层级） | - |
| 2 | GET | `/clauses/:id` | 获取条款详情 | - |
| 3 | POST | `/clauses` | 新增条款 | `code`, `parentId`, `level`, `clauseTitle`, `clauseContent`, `checkMethod`, `scoreWeight`, `keywords` |
| 4 | PUT | `/clauses/:id` | 编辑条款 | 同上可编辑字段 |
| 5 | DELETE | `/clauses/:id` | 软删除条款（检查子条款 + 关联评价） | - |
| 6 | POST | `/clauses/import` | 批量导入条款 | `clauses[]`（JSON 数组） |
| 7 | PUT | `/clauses/sort` | 批量调整排序 | `items[]`（id + sortOrder） |

#### 11.2.2 条款-资料关联（5 个）

| 序号 | 方法 | 路径 | 功能 | 关键参数 |
|------|------|------|------|---------|
| 8 | GET | `/clauses/:id/documents` | 获取条款关联的资料列表 | `status`（可选筛选） |
| 9 | POST | `/clauses/:id/documents` | 手动关联资料 | `fileIds[]` → status=valid, match_type=manual |
| 10 | DELETE | `/clauses/:id/documents/:fileId` | 取消关联（软删除） | - |
| 11 | POST | `/clauses/:id/auto-match` | 自动匹配资料（返回建议列表） | 返回建议，不直接写入 |
| 12 | POST | `/clauses/:id/documents/confirm` | 确认自动匹配结果 | `fileIds[]` → 更新 status=valid |

#### 11.2.3 评价任务（10 个）

| 序号 | 方法 | 路径 | 功能 | 关键参数 |
|------|------|------|------|---------|
| 13 | POST | `/evaluations` | 创建评价任务（草稿） | `taskName`, `evaluationScope`, `evaluationPeriod`, `aiEnabled` |
| 14 | GET | `/evaluations` | 评价任务列表 | `status`, `keyword`, `page`, `pageSize` |
| 15 | GET | `/evaluations/:id` | 评价任务详情（含统计概览） | - |
| 16 | POST | `/evaluations/:id/start` | 启动评价（**异步触发**） | - |
| 17 | GET | `/evaluations/:id/status` | 查询评价进度 | `progress`, `currentRound`, `checkedCount`, `totalCount` |
| 18 | GET | `/evaluations/:id/items` | 获取评价明细列表（最新轮次） | `complianceStatus`, `elementCode`, `page`, `pageSize` |
| 19 | PUT | `/evaluations/:id/items/:itemId` | 更新条款评价结果（人工复核） | `complianceStatus`, `manualRemark` |
| 20 | POST | `/evaluations/:id/items/batch-confirm` | 批量确认评价结果 | `itemIds[]`, `complianceStatus` |
| 21 | GET | `/evaluations/:id/gaps` | 缺项分析报告 | 按要素分组统计 + 缺项清单 |
| 22 | POST | `/evaluations/:id/generate-report` | 生成自评报告（调用 reportService） | 返回 reportId |

#### 11.2.4 评价任务管理（2 个）

| 序号 | 方法 | 路径 | 功能 | 关键参数 |
|------|------|------|------|---------|
| 23 | POST | `/evaluations/:id/confirm-level` | 确认最终等级 | `finalScore`, `finalLevel`, `remark` |
| 24 | DELETE | `/evaluations/:id` | 软删除评价任务（仅草稿状态） | - |

### 11.3 关键接口说明

#### 启动评价（异步）

```
POST /api/hse/standard/evaluations/:id/start
```

**请求响应**（立即返回，不等待 AI）：
```json
{
  "taskId": 1,
  "taskStatus": "in_progress",
  "evaluationRound": 1,
  "totalClauses": 30,
  "estimatedSeconds": 120
}
```

**后台执行**：
1. `task_status` → `in_progress`
2. `current_round` + 1
3. 遍历评价范围内的所有 level=3 条款
4. 逐条 AI 评价（带 evidence 校验）
5. 计算 `ai_overall_score` / `ai_overall_level`
6. `task_status` → `completed`

---

## 十二、前端页面设计

### 12.1 路由设计

新建路由模块文件：`apps/web-antd/src/router/routes/modules/hse-standard.ts`

> 自动加载机制（`import.meta.glob('./modules/**/*.ts')`）自动识别，无需修改 index.ts。

| 路由 name | 路径 | 组件 | 菜单标题 | 图标 |
|-----------|------|------|---------|------|
| HseStandard | /hse-standard | redirect | 安全生产标准化 | lucide:clipboard-check |
| HseStandardClauses | /hse-standard/clauses | views/hse/standard/clauses/index.vue | 标准条款库 | lucide:list-tree |
| HseStandardEvaluation | /hse-standard/evaluation | views/hse/standard/evaluation/index.vue | 评价任务 | lucide:file-check |

### 12.2 页面结构

#### 12.2.1 标准条款库页面

**文件**：`views/hse/standard/clauses/index.vue`

**布局**：左右分栏

```
┌──────────────────┬──────────────────────────────────┐
│                  │  条款详情面板                     │
│  左侧：条款树     │  ┌────────────────────────────┐  │
│  (a-tree)        │  │ 基本信息                     │  │
│                  │  │ 编码 / 标题 / 层级 / 权重   │  │
│  一级要素        │  ├────────────────────────────┤  │
│    └─ 二级要素   │  │ 条款要求                     │  │
│         └─ 具体  │  ├────────────────────────────┤  │
│                  │  │ 检查方法                     │  │
│  [搜索框]        │  ├────────────────────────────┤  │
│  [新增条款]      │  │ 关键词 / 要求资料类型       │  │
│                  │  ├────────────────────────────┤  │
│                  │  │ 关联资料                     │  │
│                  │  │ ┌─文件列表─┐  [自动匹配]    │  │
│                  │  │ │ 文件名   │  [手动关联]    │  │
│                  │  │ │ 匹配方式 │                │  │
│                  │  │ └─────────┘                │  │
│                  │  └────────────────────────────┘  │
│                  │  [编辑] [删除] [调整排序]        │
└──────────────────┴──────────────────────────────────┘
```

#### 12.2.2 评价任务列表页面

**文件**：`views/hse/standard/evaluation/index.vue`

**布局**：
- 顶部统计卡片：总任务数、进行中、已完成、待确认
- 筛选栏：状态、关键词、周期
- 任务列表表格：
  - 列：任务名称、评价周期、状态、当前轮次、AI 建议等级、最终等级、创建时间、操作
  - 操作：查看详情、启动评价、生成报告、删除

#### 12.2.3 评价任务详情页面

**文件**：`views/hse/standard/evaluation/detail.vue`

**布局**：
- 顶部概览栏：
  - 任务名称、状态
  - 已确认 / 总条款数（进度条）
  - AI 建议等级（标签，标注"AI 建议，仅供参考"）
  - 最终等级（待确认时显示"待确认"按钮）
- 标签页：
  1. **评价明细** — 按要素分组的条款列表 + 人工复核操作
  2. **缺项分析** — 图表 + 缺项清单表格
  3. **历史对比** — 轮次切换 + 变化对比
  4. **自评报告** — 报告列表 + 生成报告按钮

### 12.3 组件设计

所有组件位于 `views/hse/standard/components/` 目录下。

| 组件 | 功能 | 复用技术 |
|------|------|---------|
| `ClauseTree.vue` | 标准条款树（左侧） | Ant Design Vue Tree |
| `ClauseDetailPanel.vue` | 条款详情 + 关联资料面板（右侧） | Ant Design Vue Tabs / List |
| `ClauseDocumentModal.vue` | 资料关联弹窗（手动选择 + 自动匹配结果确认） | Ant Design Vue Modal / Table |
| `EvaluationProgress.vue` | 评价进度展示（进度条 + 状态轮询） | 参考 Sprint3 进度轮询模式 |
| `EvaluationItemCard.vue` | 评价明细卡片（单条条款的 AI 结果 + 人工确认操作） | Ant Design Vue Card / Tag / Button |
| `GapAnalysisChart.vue` | 缺项分析图表（按要素分组柱状图） | EchartsUI (@vben/plugins/echarts) |

> **不创建公共组件**，全部业务组件放在模块内部 `components/` 目录下。

### 12.4 前端 API 层

新建文件：`api/hse/standard.ts`

**TypeScript 类型**：
- `StandardClause` — 标准条款
- `EvaluationTask` — 评价任务
- `EvaluationItem` — 评价明细
- `GapAnalysisResult` — 缺项分析结果
- `AiVerdict` — AI 建议状态枚举
- `ComplianceStatus` — 最终合规状态枚举

### 12.5 国际化

在 `locales/langs/zh-CN/hse.json` 中新增 `standardCenter` 模块（约 60 个 key）。

---

## 十三、修改文件清单

### 13.1 后端（7 个文件）

#### 新增文件（4 个）

| 文件 | 说明 | 预估行数 |
|------|------|---------|
| `server/sql/hse_standard_v54_migration.sql` | 数据库迁移脚本（3 新表 + 2 CHECK 扩展 + 种子数据） | ~350 行 |
| `server/services/standardService.js` | 评价中心核心服务（条款/关联/评价/缺项） | ~900-1100 行 |
| `server/routes/hse-standard.js` | 24 个 API 路由 | ~400 行 |
| `server/test/sprint4-standard-test.js` | 后端测试脚本 | ~500 行 |

#### 修改文件（3 个）

| 文件 | 修改内容 | 修改量 |
|------|---------|--------|
| `server/services/aiService.js` | 新增 standard_evaluation Prompt + buildStandardEvaluationPrompt + TEMPLATES 常量 | ~120 行 |
| `server/services/reportService.js` | 6 个方法新增 self_assessment 分支（数据采集 / AI 内容 / HTML 模板 / 类型映射 / 关键词） | ~180 行 |
| `server/app.js` | 挂载新路由（+1 行） | 1 行 |

### 13.2 前端（13 个文件）

#### 新增文件（12 个）

| 文件 | 说明 | 预估行数 |
|------|------|---------|
| `api/hse/standard.ts` | API 客户端 + TypeScript 类型定义 | ~280 行 |
| `views/hse/standard/clauses/index.vue` | 标准条款库页面 | ~250 行 |
| `views/hse/standard/evaluation/index.vue` | 评价任务列表页面 | ~200 行 |
| `views/hse/standard/evaluation/detail.vue` | 评价任务详情页面 | ~300 行 |
| `views/hse/standard/components/ClauseTree.vue` | 条款树组件 | ~150 行 |
| `views/hse/standard/components/ClauseDetailPanel.vue` | 条款详情面板 | ~250 行 |
| `views/hse/standard/components/ClauseDocumentModal.vue` | 资料关联弹窗 | ~220 行 |
| `views/hse/standard/components/EvaluationProgress.vue` | 评价进度组件 | ~120 行 |
| `views/hse/standard/components/EvaluationItemCard.vue` | 评价明细卡片 | ~200 行 |
| `views/hse/standard/components/GapAnalysisChart.vue` | 缺项分析图表 | ~150 行 |
| `router/routes/modules/hse-standard.ts` | 路由模块（自动加载） | ~60 行 |

#### 修改文件（1 个）

| 文件 | 修改内容 | 修改量 |
|------|---------|--------|
| `locales/langs/zh-CN/hse.json` | 新增 standardCenter 翻译模块 | ~60 行 |

### 13.3 文件总数

| 类型 | 新增 | 修改 | 合计 |
|------|------|------|------|
| 后端 | 4 | 3 | 7 |
| 前端 | 12 | 1 | 13 |
| **总计** | **16** | **4** | **20** |

### 13.4 明确不修改的文件

| 文件/目录 | 原因 |
|-----------|------|
| `packages/` | 禁止修改 Vben 核心 |
| `auth/` / JWT / 登录 | 禁止修改认证相关 |
| `src/components/` | 禁止创建公共组件 |
| `server/services/documentService.js` | 不修改资料中心服务（只读引用） |
| `server/services/documentAiService.js` | 不修改 AI 分析服务（只读引用） |
| `server/routes/hse-documents.js` | 不修改资料中心路由 |
| `server/routes/hse-report.js` | 不修改报告中心路由（自评报告复用 V2 接口） |

---

## 十四、数据库迁移方案

### 14.1 迁移脚本

**文件**：`server/sql/hse_standard_v54_migration.sql`

### 14.2 执行步骤

```
Phase 1: 新建表（3 张）
  ├─ safety_standard_clauses
  ├─ standard_evaluation_tasks
  └─ standard_evaluation_items

Phase 2: 扩展 CHECK 约束（2 张表）
  ├─ hse_report_templates.template_category 新增 'self_assessment'
  └─ hse_reports.template_category 新增 'self_assessment'
  注意：DROP CONSTRAINT + ADD CONSTRAINT，事务包裹

Phase 3: 新建索引
  └─ 3 张新表的索引全部 IF NOT EXISTS

Phase 4: 插入种子数据
  ├─ 标准条款：8 一级 + ~20 二级 + ~30 具体条款
  │   └─ INSERT ... ON CONFLICT DO NOTHING（幂等）
  └─ 自评报告模板：1 条 hse_report_templates
      └─ INSERT ... ON CONFLICT DO NOTHING（幂等）
```

### 14.3 幂等性保证

- 建表：`CREATE TABLE IF NOT EXISTS`
- 加字段：`ALTER TABLE ADD COLUMN IF NOT EXISTS`（本迁移无新增字段，仅约束扩展）
- 建索引：`CREATE INDEX IF NOT EXISTS`
- 插数据：`INSERT ... ON CONFLICT DO NOTHING`
- CHECK 约束扩展：先 `DROP CONSTRAINT IF EXISTS` 再 `ADD CONSTRAINT`

可重复执行，无副作用。

### 14.4 迁移回滚方案

| 操作 | 回滚方式 |
|------|---------|
| 新建表 | DROP TABLE IF EXISTS（会丢失数据，仅开发环境可用） |
| CHECK 约束扩展 | DROP CONSTRAINT + ADD 旧约束（还原枚举值） |
| 种子数据 | DELETE FROM ... WHERE created_by = 'system_seed' |

生产环境不建议回滚，迁移脚本经过测试环境验证后再执行。

---

## 十五、风险分析

### 15.1 技术风险

| 风险 | 等级 | 描述 | 缓解措施 |
|------|------|------|---------|
| CHECK 约束修改 | 低 | 扩展 template_category 枚举值需 DROP + ADD | 事务包裹；测试环境先行；仅扩展，不缩小范围 |
| AI 评价准确性 | 中 | AI 对条款合规判定可能不够精确 | AI 仅作辅助；强制 evidence 证据链；人工确认机制；置信度展示 |
| AI 逐条调用耗时长 | 中 | 30 条款 × 3-5 秒 = 90-150 秒 | 异步执行 + 进度轮询；后续可优化为批量调用 |
| 证据链校验遗漏 | 低 | 某些场景下 AI 可能绕过 evidence 校验 | 后端二次校验：compliant 且 evidence 为空 → 降级 unknown |
| 评价历史数据量大 | 低 | 多轮次评价后 items 表数据增长快 | 软删除过滤；分页查询；按 task_id + round 索引 |
| 唯一约束调整 | 低 | items 表唯一约束从 (task, clause) 改为 (task, clause, round) | 新建表无历史数据，直接建正确约束 |

### 15.2 业务风险

| 风险 | 等级 | 描述 | 缓解措施 |
|------|------|------|---------|
| 初始条款数据不足 | 中 | 预置 30 条示例条款覆盖面有限 | 预置 GB/T 33000-2016 八大要素框架；支持批量导入；管理员可扩充 |
| 资料关联覆盖率低 | 中 | 初期条款未关联资料导致大量 missing | 自动匹配功能；评价前提示关联覆盖率；缺项引导补充资料 |
| AI 建议不可靠 | 中 | AI 判定可能与实际有偏差 | AI 仅辅助，最终人工确认；evidence 证据链；高置信度才可一键采纳 |
| 等级确认主观性 | 低 | 最终等级人工确认可能有主观偏差 | 提供 AI 建议等级参考；提供量化得分辅助；等级确认人留痕 |

### 15.3 约束遵守风险

| 约束项 | 风险等级 | 验证结论 |
|--------|---------|---------|
| 禁止修改 packages/ | 无风险 | 全部前端代码在 views/hse/standard/ 下 |
| 禁止修改 auth/JWT | 无风险 | 仅使用现有 requireRole 中间件 |
| 禁止新增 npm 依赖 | 无风险 | echarts 已通过 @vben/plugins/echarts 引入 |
| 增量开发 | 无风险 | 新增 3 表 + CHECK 约束扩展，不修改已有字段/索引/数据 |
| 不重构已有体系 | 无风险 | reportService 通过新增分支实现，不破坏 V1/V2 现有逻辑 |
| 不创建公共组件 | 无风险 | 全部组件在 views/hse/standard/components/ 下 |

### 15.4 集成风险

| 风险 | 等级 | 描述 | 缓解措施 |
|------|------|------|---------|
| 自评报告与 Sprint3 集成 | 低 | reportService 的 self_assessment 分支可能影响其他类型 | 每个 template_category 走独立分支；充分测试 |
| 资料关联表激活 | 低 | Sprint1 预留表直接使用，无历史数据 | 零历史数据，无迁移风险 |
| 前端路由自动加载 | 低 | 模块文件命名冲突 | 命名为 hse-standard.ts，现有模块无冲突 |
| 翻译模块冲突 | 低 | hse.json 新增 key 冲突 | 命名空间 standardCenter，与现有模块无重叠 |

---

## 十六、测试方案

### 16.1 测试环境

- 数据库：PostgreSQL（执行 v54 迁移后）
- Node.js：现有版本
- 前端：浏览器端验证（开发环境）

### 16.2 测试分类

#### 16.2.1 数据库迁移测试

| 测试项 | 预期结果 |
|--------|---------|
| 执行迁移脚本 | 3 张新表创建成功，2 个 CHECK 约束扩展成功 |
| 重复执行迁移 | 无报错，幂等性验证通过 |
| 种子数据插入 | 8 一级 + ~20 二级 + ~30 具体条款，1 个自评报告模板 |
| 索引创建 | 所有索引创建成功 |

#### 16.2.2 条款管理测试

| 测试项 | 预期结果 |
|--------|---------|
| 获取条款树 | 三级树形结构正确返回 |
| 新增条款 | 数据正确插入，唯一编码校验 |
| 编辑条款 | 字段正确更新 |
| 删除条款 | 软删除，子条款检查正常 |
| 批量导入 | 全部正确导入，冲突处理正常 |

#### 16.2.3 资料关联测试

| 测试项 | 预期结果 |
|--------|---------|
| 自动匹配 | 返回匹配建议列表（不直接写入） |
| 自动匹配写入 status | status = pending（非 valid） |
| 人工确认自动匹配结果 | status 更新为 valid |
| 手动关联 | 直接 status = valid |
| 取消关联 | 软删除 |

#### 16.2.4 AI 评价测试

| 测试项 | 预期结果 |
|--------|---------|
| 启动评价（异步） | 立即返回，后台执行 |
| 进度查询 | progress 递增，最终 completed |
| AI verdict 生成 | ai_verdict 有值（5 种状态之一） |
| evidence 强制校验 | verdict=compliant 但 evidence 为空 → 自动降级 unknown |
| compliance_status 初始值 | 始终为 pending（不由 AI 设置） |
| AI 失败降级 | 单条失败不影响整体，标记为 unknown |
| 历史轮次 | 重新评价新增 round，不覆盖旧数据 |
| 唯一约束 (task, clause, round) | 同轮次同条款不重复 |

#### 16.2.5 人工复核测试

| 测试项 | 预期结果 |
|--------|---------|
| 单条确认 | compliance_status 更新，checked_by/checked_at 记录 |
| 批量确认 | 多条同时更新 |
| 重置 | 恢复为 pending |
| 等级确认 | final_overall_score/level 写入，确认人留痕 |
| AI 结果不被覆盖 | ai_verdict 保持原值 |

#### 16.2.6 缺项分析测试

| 测试项 | 预期结果 |
|--------|---------|
| 按要素统计 | 各要素数量正确 |
| 缺项清单 | 过滤正确，仅非 compliant/missing/partial |
| 待确认不计入 | pending 条款不进入缺项统计 |

#### 16.2.7 自评报告测试

| 测试项 | 预期结果 |
|--------|---------|
| 报告生成 | reportService.generateReportV2 成功执行 |
| 数据来源 | 仅使用人工确认后的 compliance_status |
| template_category | self_assessment |
| 报告中心可见 | Sprint3 报告中心全部报告中可见 |
| 导出 | HTML / Word 导出正常 |

### 16.3 测试脚本

后端单元测试脚本：`server/test/sprint4-standard-test.js`

覆盖：条款 CRUD、资料关联、评价流程、缺项分析、报告生成

### 16.4 通过标准

- 数据库迁移：全部通过（幂等 + 正确）
- 后端单元测试：≥ 95% 用例通过
- AI 评价：evidence 校验 100% 生效
- 自评报告：成功生成且数据准确
- 前端：关键路径可正常操作

---

**文档版本**：v1.0（最终版）  
**生成日期**：2026-07-19  
**设计范围**：安全生产标准化评价中心 MVP（6 项功能）  
**前置 Sprint**：Sprint1（资料中心）、Sprint2（AI 分析）、Sprint3（报告中心）

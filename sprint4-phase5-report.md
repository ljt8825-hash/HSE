# HSE V2 Sprint4 Phase5 开发报告 — AI 辅助标准化评价

## 一、阶段概述

**阶段目标**：实现 AI 辅助标准化评价功能，为每个三级安全生产标准化条款提供 AI 辅助判定结果（合规/部分合规/不合规/资料缺失/未知），仅供人工参考，不自动生成最终结论。

**严格约束**：
- ✅ AI 仅辅助判断，不自动生成企业达标/不达标结论
- ✅ 禁止自动认证、复杂评分模型
- ✅ 复用既有表结构（不新建评价表）
- ✅ 异步执行，禁止 HTTP 同步等待 AI
- ✅ verdict=compliant 但 evidence 为空 → 自动降级为 unknown

---

## 二、数据库迁移（复用现有表，仅扩展字段）

**文件**：`server/sql/hse_standard_evaluation_ai_v56_migration.sql`

### standard_evaluation_tasks 新增字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `ai_started_at` | TIMESTAMPTZ | AI 评价开始时间 |
| `ai_completed_at` | TIMESTAMPTZ | AI 评价完成时间 |
| `ai_total_items` | INTEGER | AI 待评价条款总数 |
| `ai_completed_items` | INTEGER | AI 已完成评价数 |
| `ai_failed_items` | INTEGER | AI 失败评价数 |
| `ai_error_message` | TEXT | AI 评价错误信息 |
| `ai_summary` | TEXT | AI 总体摘要 |
| `prompt_version` | VARCHAR(32) | Prompt 版本号 |

### standard_evaluation_items 新增字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `ai_findings` | JSONB | AI 发现的问题点（数组） |
| `ai_missing_items` | JSONB | AI 识别的缺项（数组） |
| `ai_evidence_files` | JSONB | AI 引用的证据文件 ID（数组） |
| `ai_processed_at` | TIMESTAMPTZ | AI 处理完成时间 |
| `ai_error` | TEXT | AI 单条评价错误信息 |

### 新增索引
- `idx_eval_task_ai_status` — 任务 AI 状态索引
- `idx_eval_item_task_ai_verdict` — 按任务+AI判定查询明细

**设计原则**：所有字段均用 `IF NOT EXISTS` 包裹，幂等安全，不影响现有数据。

---

## 三、后端实现

### 3.1 AI Service 扩展

**文件**：`server/services/aiService.js`

新增 `standard_evaluation` Prompt 模板，核心要点：
- 明确 AI 仅辅助、不构成最终结论（身份与定位）
- 严格 JSON 输出：`{ verdict, findings, missingItems, evidence, suggestion }`
- verdict 枚举：`compliant | partial | non_compliant | missing | unknown`
- 约束：禁止无证据认定合规、禁止编造资料内容、禁止给出最终达标结论
- 新增 `buildStandardEvaluationPrompt(clauseData, relatedDocs)` 构造函数

### 3.2 评价服务（核心）

**文件**：`server/services/standardEvaluationService.js`

#### 任务管理
- `createTask()` — 创建评价任务，批量生成三级条款明细（compliance_status=pending）
- `getTaskList()` / `getTaskById()` — 任务查询
- `deleteTask()` — 软删除
- `getTaskStats()` — 按 AI verdict 分组统计

#### AI 评价流程（异步）
```
startAiEvaluation(taskId) 
  → setImmediate 异步执行
  → runAiEvaluation()
    → 更新任务状态 processing
    → 遍历所有三级条款
      → evaluateSingleClause()
        1. 查询 document_standard_relation (status='valid')
        2. 读取关联文件的 document_ai_analysis (最新 completed)
        3. 无关联资料 → verdict=missing
        4. 调用 aiService.chat(standard_evaluation prompt)
        5. 解析 JSON，执行强制规则（compliant+空evidence → unknown）
        6. 保存结果到 standard_evaluation_items
    → 每完成一条更新进度 ai_completed_items
    → 全部完成更新任务状态 completed
```

#### 强制规则实现
```javascript
if (result.verdict === 'compliant' && (!result.evidence || result.evidence.trim() === '')) {
  result.verdict = 'unknown';
  result.missingItems.push('证据不足，无法确认合规性');
  result.suggestion += ' 因缺少明确证据，系统自动降级为未知状态，请人工复核。';
}
```

#### 结果字段保存
| 字段 | 值来源 | 人工字段 |
|---|---|---|
| `ai_verdict` | AI verdict | compliance_status 保持 `pending` |
| `ai_check_result` | { findings, missingItems } | manual_remark 保持空 |
| `ai_evidence` | AI evidence | checked_by 保持空 |
| `ai_suggestion` | AI suggestion | checked_at 保持空 |
| `ai_findings` / `ai_missing_items` / `ai_evidence_files` | 结构化 JSON | |
| `ai_processed_at` | 当前时间 | |

### 3.3 路由层

**文件**：`server/routes/hse-standard-evaluation.js`

| 方法 | 路径 | 功能 | 权限 |
|---|---|---|---|
| GET | `/api/hse/standard/evaluation` | 任务列表 | - |
| POST | `/api/hse/standard/evaluation` | 创建任务 | admin / safety_manager |
| GET | `/api/hse/standard/evaluation/:taskId` | 任务详情 | - |
| DELETE | `/api/hse/standard/evaluation/:taskId` | 删除任务 | admin / safety_manager |
| POST | `/api/hse/standard/evaluation/:taskId/start-ai` | 启动 AI 评价（异步） | admin / safety_manager |
| GET | `/api/hse/standard/evaluation/:taskId/stats` | 评价统计 | - |
| GET | `/api/hse/standard/evaluation/:taskId/items` | 评价明细列表 | - |
| GET | `/api/hse/standard/evaluation/items/:itemId` | 单条明细 | - |
| POST | `/api/hse/standard/evaluation/items/:itemId/re-evaluate` | 单条重新评价 | admin / safety_manager |

**挂载点**：`server/app.js` 第 362-363 行。

---

## 四、前端实现

### 4.1 API 层

**文件**：`src/api/modules/evaluation.ts`

封装所有评价相关 API 调用，使用统一的 client 实例。

### 4.2 类型定义

**文件**：`src/features/standard-evaluation/types.ts`

- `AiVerdict` — `compliant | partial | non_compliant | missing | unknown`
- `TaskStatus` — `draft | pending | in_progress | completed | failed`
- `AiStatus` — `none | pending | processing | completed | failed`
- `EvaluationTask` / `EvaluationItem` / `EvaluationStats`

### 4.3 评价任务列表页

**文件**：`src/features/standard-evaluation/views/EvaluationTaskList.vue`

功能：
- 任务列表（状态/关键词筛选、分页）
- 创建评价任务弹窗（任务名称、评价周期）
- 启动 AI 评价（异步，5秒轮询刷新进度）
- 查看详情、删除任务
- 显示任务状态、AI 状态、AI 进度条

### 4.4 评价详情页

**文件**：`src/features/standard-evaluation/views/EvaluationDetail.vue`

布局：**左右分栏**

| 左侧 | 右侧 |
|---|---|
| 标准条款列表 | AI 评价结果 |
| - 条款编号 + AI 判定标签 | - 判定结果徽章（颜色区分） |
| - 按 AI verdict 筛选 | - 条款内容 |
| - 关键词搜索 | - 关联资料列表 |
| - 分页 | - AI 发现的问题（warning 样式） |
| | - 缺项 / 不足（danger 样式） |
| | - 证据说明（绿色边栏） |
| | - 整改建议（蓝色边栏） |
| | - 单条重新评价按钮 |

顶部：
- 任务名称、状态、AI 状态、周期、条款数、轮次
- 6 个统计卡片（总数/合规/部分合规/不合规/资料缺失/未知）
- 启动 AI 评价按钮

### 4.5 路由注册

**文件**：`src/router/routes.ts`

```
/standard-evaluation/list      评价任务列表
/standard-evaluation/:taskId   评价详情（hidden）
```

---

## 五、设计要点回顾

### 5.1 合规性保障

| 要求 | 实现方式 |
|---|---|
| AI 只辅助不决策 | 所有 AI 结果字段前缀 `ai_`，人工字段保持 `pending` |
| 禁止自动评分 | 未实现评分模型，仅提供 verdict 判定 |
| 禁止自动认证 | 无认证相关逻辑 |
| 禁止无证据通过 | `verdict=compliant && evidence空 → unknown` 强制降级 |
| 异步执行 | `setImmediate` 后台执行，HTTP 立即返回 |

### 5.2 复用清单

- ✅ `safety_standard_clauses` — 三级条款数据源
- ✅ `standard_evaluation_tasks` — 任务表（扩展字段）
- ✅ `standard_evaluation_items` — 评价明细表（扩展字段）
- ✅ `document_standard_relation` — 条款-资料关联（status='valid'）
- ✅ `document_ai_analysis` — 资料 AI 分析结果
- ✅ `aiService.js` — AI 调用（新增 prompt 模板）
- ✅ `reportService.js` — 未修改（后续报告阶段使用）

---

## 六、未开发（待下一阶段）

按要求，以下内容 **未开发**，等待后续指令：

- ❌ 自动评分 / 评分模型
- ❌ 自动认证
- ❌ 最终等级评定
- ❌ 报告导出（reportService.js 预留，暂未接入）
- ❌ 人工审核确认流程（compliance_status 切换）

---

## 七、TypeScript 校验

`vue-tsc --noEmit` 通过，新增代码无类型错误。

---

## 八、文件清单

### 新增文件
- `server/sql/hse_standard_evaluation_ai_v56_migration.sql`
- `server/services/standardEvaluationService.js`
- `server/routes/hse-standard-evaluation.js`
- `src/api/modules/evaluation.ts`
- `src/features/standard-evaluation/types.ts`
- `src/features/standard-evaluation/views/EvaluationTaskList.vue`
- `src/features/standard-evaluation/views/EvaluationDetail.vue`

### 修改文件
- `server/services/aiService.js` — 新增 standard_evaluation prompt
- `server/app.js` — 挂载评价路由
- `src/router/routes.ts` — 注册前端路由

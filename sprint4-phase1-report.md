# Sprint4 Phase 1 开发报告 — 数据库迁移

> 版本：v1.0  
> 日期：2026-07-19  
> 阶段：Phase 1 — 数据库迁移  
> 状态：✅ 完成

---

## 一、完成内容

### 1.1 交付物

| 文件 | 路径 | 行数 | 说明 |
|------|------|------|------|
| 迁移脚本 | [hse_standard_v54_migration.sql](file:///f:/deploy/hse-dashboard/server/sql/hse_standard_v54_migration.sql) | ~480 行 | 3 张新表 + 2 张表 CHECK 约束扩展 + 种子数据 |

### 1.2 新建表（3 张）

| 表名 | 字段数 | 说明 |
|------|--------|------|
| `safety_standard_clauses` | 19 | 标准条款主表（三级层级，参照 GB/T 33000-2016） |
| `standard_evaluation_tasks` | 25 | 评价任务表（AI 结果与人工结果分字段存储） |
| `standard_evaluation_items` | 24 | 评价明细表（按 evaluation_round 保留历史，禁止覆盖） |

### 1.3 扩展表（2 张，CHECK 约束）

| 表名 | 修改内容 |
|------|---------|
| `hse_report_templates` | `template_category` 枚举新增 `'self_assessment'` |
| `hse_reports` | `template_category` 枚举新增 `'self_assessment'` |

> 修改方式：`DO $$` 块内判断存在后 `DROP CONSTRAINT`，再 `ADD CONSTRAINT`，事务包裹。

### 1.4 种子数据

#### 标准条款（52 条）

| 层级 | 数量 | 说明 |
|------|------|------|
| 一级要素 | 8 | 目标职责、制度化管理、教育培训、现场管理、安全风险管控及隐患排查治理、应急管理、事故管理、持续改进 |
| 二级要素 | 20 | 每个一级要素下 2-3 个二级要素 |
| 具体条款 | 24 | 每个二级要素下 1-2 个示例条款 |
| **总计** | **52** | |

#### 自评报告模板（1 条）

- `template_name`: 安全生产标准化自评报告
- `template_category`: `self_assessment`
- `ai_enabled`: `true`

---

## 二、关键设计落地

### 2.1 AI 与人工分离（冻结规则 3 & 6）

| 表 | AI 字段 | 人工字段 |
|----|--------|---------|
| `standard_evaluation_items` | `ai_verdict`（建议状态） | `compliance_status`（最终状态） |
| | `ai_check_result`、`ai_evidence`、`ai_suggestion` | `manual_remark`、`checked_by`、`checked_at` |
| `standard_evaluation_tasks` | `ai_overall_score`、`ai_overall_level` | `final_overall_score`、`final_overall_level` |
| | | `level_confirmed_by`、`level_confirmed_at` |

### 2.2 评价历史保留（冻结规则 7）

- 新增 `evaluation_round` 字段
- 唯一约束：`(task_id, clause_id, evaluation_round)`
- 重新评价新增轮次，不覆盖历史

### 2.3 证据链（冻结规则 5）

- `ai_evidence` 字段存储证据链摘要
- `ai_check_result` JSON 中包含 `evidence` 字段
- 后端校验：verdict=compliant 且 evidence 为空 → 自动降级 unknown

### 2.4 资料关联状态（冻结规则 6）

复用 `document_standard_relation` 表：
- 自动匹配 → `status = 'pending'`，需人工确认才 `valid`
- 手动关联 → 直接 `status = 'valid'`
- AI 评价时仅使用 `status = 'valid'` 的资料

### 2.5 异步评价（冻结规则 8）

- `task_status`: `draft → in_progress → completed/failed`
- HTTP 不等待，前端轮询状态
- 后台 `setImmediate` 执行

---

## 三、测试验证结果

### 3.1 迁移执行

| 测试项 | 结果 |
|--------|------|
| 迁移脚本首次执行 | ✅ 成功 |
| 3 张新表创建 | ✅ 全部创建 |
| 2 个 CHECK 约束扩展 | ✅ 全部扩展（self_assessment 已加入） |
| 种子数据插入 | ✅ 52 条条款 + 1 条模板 |
| 幂等性（重复执行） | ✅ 无报错，数据正确 |
| 事务保护 | ✅ BEGIN/COMMIT 包裹 |

### 3.2 标准条款层级验证

```
L1  1          目标职责
  L2  1.1        安全目标
    L3  1.1.1      安全生产目标与指标
  L2  1.2        机构和职责
    L3  1.2.1      安全管理机构设置
    L3  1.2.2      安全生产责任制
  L2  1.3        安全生产投入
    L3  1.3.1      安全生产费用管理

...（其余7个一级要素结构完整）
```

三级树形结构完整，`parent_id` 关联正确。

### 3.3 索引验证

| 表 | 索引数 | 说明 |
|----|--------|------|
| `safety_standard_clauses` | 4 | 唯一索引 (code) + parent + level + status |
| `standard_evaluation_tasks` | 3 | status + period + created_by |
| `standard_evaluation_items` | 6 | 唯一 (task, clause, round) + task + clause + round + compliance + ai_verdict |

---

## 四、遵守约束情况

| 约束 | 状态 | 说明 |
|------|------|------|
| 不修改 packages/ | ✅ | 纯后端 SQL |
| 不修改 auth/JWT/登录 | ✅ | 无触及 |
| 不新增 npm 依赖 | ✅ | 纯 SQL |
| 不修改已有数据结构 | ✅ | 仅新增表 + 扩展 CHECK 约束枚举值，不修改字段/索引 |
| 不删除字段 | ✅ | 无删除操作 |
| 事务保护 | ✅ | BEGIN/COMMIT 包裹整个迁移 |
| IF NOT EXISTS | ✅ | 所有 CREATE TABLE / CREATE INDEX 均使用 |
| 幂等性 | ✅ | 可重复执行无副作用 |

---

## 五、已知问题

无。迁移脚本全部测试通过。

---

## 六、下一步（Phase 2）

Phase 2：标准条款管理后端 API
- `server/services/standardService.js` — 条款 CRUD + 树构建
- `server/routes/hse-standard.js` — 条款管理相关路由（约 7 个端点）
- 对应设计文档第 11.2.1 节

等待 Phase 2 指令后开始。

# Sprint5.5 隐患整改闭环中心设计文档

## 1. 概述

### 1.1 目标
建设 HSE 隐患整改闭环中心，实现从发现问题到隐患关闭的完整闭环流程：

```
发现问题 → 隐患确认 → 整改任务 → 责任人 → 整改措施 → 复查 → 关闭
```

### 1.2 功能要求
- **整改超期提醒**：基于 deadline_date 判断超期，自动推送通知
- **整改闭环率统计**：(已关闭隐患数/总隐患数)×100%
- **责任人查询**：支持按 employee_id 查询责任人的整改任务
- **AI 能力**：仅提供整改建议和风险提示，禁止 AI 自动关闭隐患

### 1.3 数据约束
- 全部责任关系使用 `employee_id`
- 禁止使用姓名字段关联
- 遵循增量迁移原则，不删除已有字段

### 1.4 技术约束
- 禁止修改 Vben 核心目录
- 禁止修改 auth/JWT
- 禁止新增 npm 依赖

---

## 2. 数据模型设计

### 2.1 已有表扩展

#### 2.1.1 hazard_record 表（已有，需扩展）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键 |
| hazard_code | VARCHAR(64) | UNIQUE NOT NULL | 隐患编号 |
| hazard_title | VARCHAR(256) | NOT NULL | 隐患标题 |
| hazard_description | TEXT | | 隐患描述 |
| hazard_level | VARCHAR(20) | | 隐患等级：critical/major/minor |
| hazard_type | VARCHAR(32) | | 隐患类型 |
| location | VARCHAR(128) | | 隐患位置 |
| department_id | BIGINT | | 所属部门ID |
| reported_by | BIGINT | | 报告人ID（关联employee.id） |
| report_date | TIMESTAMP | | 报告日期 |
| confirmed_by | BIGINT | | 确认人ID（关联employee.id） |
| confirmed_at | TIMESTAMP | | 确认时间 |
| status | VARCHAR(20) | NOT NULL DEFAULT 'pending' | 隐患状态：pending/confirmed/processing/closed |
| source_type | VARCHAR(32) | | 来源类型：inspection/report/audit/external/other |
| source_id | BIGINT | | 来源记录ID |
| ai_suggestions | TEXT | | AI整改建议 |
| ai_risk_hint | TEXT | | AI风险提示 |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 更新时间 |
| is_deleted | BOOLEAN | NOT NULL DEFAULT FALSE | 软删除标识 |

#### 2.1.2 hazard_record 状态流转

```
pending（待确认）
    ↓ 确认
confirmed（已确认）
    ↓ 创建整改任务
processing（处理中）
    ↓ 复查通过
closed（已关闭）
    ↓ 复查不通过
processing（重新处理）
```

---

### 2.2 新增表

#### 2.2.1 rectification_task（整改任务表）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键 |
| task_code | VARCHAR(64) | UNIQUE NOT NULL | 任务编号 |
| hazard_id | BIGINT | NOT NULL | 关联隐患ID（hazard_record.id） |
| task_title | VARCHAR(128) | NOT NULL | 任务标题 |
| description | TEXT | | 任务描述 |
| responsible_id | BIGINT | NOT NULL | 责任人ID（关联employee.id） |
| department_id | BIGINT | | 责任部门ID |
| deadline_date | DATE | NOT NULL | 整改期限 |
| actual_completion_date | DATE | | 实际完成日期 |
| status | VARCHAR(20) | NOT NULL DEFAULT 'pending' | 任务状态：pending/processing/completed/cancelled |
| progress | INTEGER | DEFAULT 0 | 进度百分比（0-100） |
| priority | VARCHAR(20) | DEFAULT 'normal' | 优先级：low/normal/high/urgent |
| created_by | BIGINT | | 创建人ID（关联employee.id） |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 更新时间 |
| is_deleted | BOOLEAN | NOT NULL DEFAULT FALSE | 软删除标识 |

**状态流转：**
```
pending（待执行）
    ↓ 开始执行
processing（执行中）
    ↓ 完成整改
completed（已完成）
    ↓ 复查不通过
processing（重新执行）
```

**索引设计：**
```sql
CREATE INDEX idx_rectification_task_hazard ON rectification_task(hazard_id);
CREATE INDEX idx_rectification_task_responsible ON rectification_task(responsible_id);
CREATE INDEX idx_rectification_task_status ON rectification_task(status);
CREATE INDEX idx_rectification_task_deadline ON rectification_task(deadline_date);
```

---

#### 2.2.2 rectification_action（整改措施表）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键 |
| task_id | BIGINT | NOT NULL | 关联整改任务ID（rectification_task.id） |
| action_code | VARCHAR(64) | | 措施编号 |
| action_description | TEXT | NOT NULL | 措施描述 |
| action_type | VARCHAR(32) | | 措施类型：engineering/administrative/personal/emergency |
| responsible_id | BIGINT | | 措施责任人ID（关联employee.id） |
| resource_required | TEXT | | 所需资源 |
| estimated_cost | NUMERIC(12,2) | | 预估费用 |
| planned_start_date | DATE | | 计划开始日期 |
| planned_end_date | DATE | | 计划结束日期 |
| actual_start_date | DATE | | 实际开始日期 |
| actual_end_date | DATE | | 实际结束日期 |
| status | VARCHAR(20) | NOT NULL DEFAULT 'pending' | 措施状态：pending/in_progress/completed/cancelled |
| completion_note | TEXT | | 完成说明 |
| created_by | BIGINT | | 创建人ID（关联employee.id） |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 更新时间 |
| is_deleted | BOOLEAN | NOT NULL DEFAULT FALSE | 软删除标识 |

**索引设计：**
```sql
CREATE INDEX idx_rectification_action_task ON rectification_action(task_id);
CREATE INDEX idx_rectification_action_responsible ON rectification_action(responsible_id);
CREATE INDEX idx_rectification_action_status ON rectification_action(status);
```

---

#### 2.2.3 review_record（复查记录表）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键 |
| review_code | VARCHAR(64) | UNIQUE NOT NULL | 复查编号 |
| hazard_id | BIGINT | NOT NULL | 关联隐患ID（hazard_record.id） |
| task_id | BIGINT | | 关联整改任务ID（rectification_task.id） |
| reviewer_id | BIGINT | NOT NULL | 复查人ID（关联employee.id） |
| review_date | TIMESTAMP | NOT NULL | 复查日期 |
| review_result | VARCHAR(20) | NOT NULL | 复查结果：pass/fail/partial |
| review_score | NUMERIC(4,2) | | 复查评分（0-100） |
| review_note | TEXT | | 复查备注 |
| recurrence_hazard_id | BIGINT | | 复发隐患ID（复查不通过时重新生成的隐患） |
| is_final | BOOLEAN | DEFAULT FALSE | 是否最终复查 |
| created_by | BIGINT | | 创建人ID（关联employee.id） |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() | 更新时间 |
| is_deleted | BOOLEAN | NOT NULL DEFAULT FALSE | 软删除标识 |

**复查结果说明：**
- `pass`：复查通过，隐患关闭
- `fail`：复查不通过，需重新整改
- `partial`：部分通过，需补充整改

**索引设计：**
```sql
CREATE INDEX idx_review_record_hazard ON review_record(hazard_id);
CREATE INDEX idx_review_record_task ON review_record(task_id);
CREATE INDEX idx_review_record_reviewer ON review_record(reviewer_id);
CREATE INDEX idx_review_record_result ON review_record(review_result);
```

---

## 3. API 设计

### 3.1 基础路径

所有 API 端点统一前缀：`/api/hse/hazard-rectification`

### 3.2 权限控制

| API 端点 | 权限要求 |
|----------|----------|
| 隐患确认 | admin, safety_manager |
| 创建整改任务 | admin, safety_manager |
| 更新整改任务 | admin, safety_manager |
| 删除整改任务 | admin, safety_manager |
| 创建整改措施 | admin, safety_manager |
| 更新整改措施 | admin, safety_manager |
| 创建复查记录 | admin, safety_manager |
| 查询接口 | 所有角色（只读） |

---

### 3.3 隐患确认接口

#### POST /api/hse/hazard-rectification/confirm

**请求体：**
```json
{
  "hazard_id": 1,
  "confirmed_by": 1001,
  "confirmation_note": "隐患确认无误，需立即整改"
}
```

**响应：**
```json
{
  "code": 200,
  "message": "隐患确认成功",
  "data": {
    "id": 1,
    "hazard_code": "HZ-20260720-0001",
    "status": "confirmed",
    "confirmed_by": 1001,
    "confirmed_at": "2026-07-20T10:00:00Z"
  }
}
```

---

### 3.4 整改任务接口

#### POST /api/hse/hazard-rectification/tasks

**请求体：**
```json
{
  "hazard_id": 1,
  "task_title": "电气线路整改",
  "description": "修复配电室老化线路",
  "responsible_id": 1002,
  "department_id": 5,
  "deadline_date": "2026-08-03",
  "priority": "high"
}
```

**响应：**
```json
{
  "code": 200,
  "message": "整改任务创建成功",
  "data": {
    "id": 1,
    "task_code": "RT-20260720-0001",
    "hazard_id": 1,
    "task_title": "电气线路整改",
    "responsible_id": 1002,
    "deadline_date": "2026-08-03",
    "status": "pending",
    "progress": 0
  }
}
```

#### GET /api/hse/hazard-rectification/tasks

**查询参数：**
| 参数名 | 类型 | 说明 |
|--------|------|------|
| page | INTEGER | 页码（默认1） |
| pageSize | INTEGER | 每页数量（默认20） |
| hazard_id | BIGINT | 隐患ID筛选 |
| responsible_id | BIGINT | 责任人ID筛选 |
| status | VARCHAR | 任务状态筛选 |
| is_overdue | BOOLEAN | 是否超期 |

**响应：**
```json
{
  "code": 200,
  "message": "查询成功",
  "data": {
    "list": [...],
    "total": 100,
    "page": 1,
    "pageSize": 20
  }
}
```

#### GET /api/hse/hazard-rectification/tasks/:id

**响应：**
```json
{
  "code": 200,
  "message": "查询成功",
  "data": {
    "id": 1,
    "task_code": "RT-20260720-0001",
    "hazard_id": 1,
    "task_title": "电气线路整改",
    "responsible_id": 1002,
    "responsible_name": "张三",
    "deadline_date": "2026-08-03",
    "actual_completion_date": null,
    "status": "pending",
    "progress": 0,
    "actions": [...]
  }
}
```

#### PUT /api/hse/hazard-rectification/tasks/:id

**请求体：**
```json
{
  "status": "processing",
  "progress": 30,
  "remark": "已开始整改"
}
```

#### DELETE /api/hse/hazard-rectification/tasks/:id

**响应：**
```json
{
  "code": 200,
  "message": "删除成功"
}
```

---

### 3.5 整改措施接口

#### POST /api/hse/hazard-rectification/tasks/:taskId/actions

**请求体：**
```json
{
  "action_description": "更换老化电缆",
  "action_type": "engineering",
  "responsible_id": 1003,
  "resource_required": "电缆50米，接头10个",
  "estimated_cost": 2000.00,
  "planned_start_date": "2026-07-21",
  "planned_end_date": "2026-07-25"
}
```

#### GET /api/hse/hazard-rectification/tasks/:taskId/actions

#### PUT /api/hse/hazard-rectification/actions/:id

**请求体：**
```json
{
  "status": "completed",
  "actual_end_date": "2026-07-25",
  "completion_note": "整改完成，经验收合格"
}
```

#### DELETE /api/hse/hazard-rectification/actions/:id

---

### 3.6 复查记录接口

#### POST /api/hse/hazard-rectification/reviews

**请求体：**
```json
{
  "hazard_id": 1,
  "task_id": 1,
  "reviewer_id": 1004,
  "review_date": "2026-07-26",
  "review_result": "pass",
  "review_score": 95.00,
  "review_note": "整改到位，隐患消除"
}
```

**响应：**
```json
{
  "code": 200,
  "message": "复查记录创建成功",
  "data": {
    "id": 1,
    "review_code": "RV-20260726-0001",
    "hazard_id": 1,
    "review_result": "pass",
    "review_score": 95.00,
    "is_final": true
  }
}
```

#### GET /api/hse/hazard-rectification/reviews

#### GET /api/hse/hazard-rectification/reviews/:id

---

### 3.7 统计接口

#### GET /api/hse/hazard-rectification/stats

**响应：**
```json
{
  "code": 200,
  "message": "统计成功",
  "data": {
    "total_hazard": 100,
    "confirmed_hazard": 80,
    "processing_hazard": 50,
    "closed_hazard": 30,
    "closed_rate": 30.0,
    "overdue_task_count": 5,
    "average_days_to_close": 15.5,
    "stats_by_department": [
      { "department_id": 1, "department_name": "生产部", "total": 50, "closed": 20 },
      { "department_id": 2, "department_name": "安全部", "total": 30, "closed": 10 }
    ],
    "stats_by_responsible": [
      { "responsible_id": 1001, "responsible_name": "张三", "total": 10, "completed": 8 }
    ]
  }
}
```

#### GET /api/hse/hazard-rectification/stats/overdue

**响应：**
```json
{
  "code": 200,
  "message": "统计成功",
  "data": {
    "overdue_tasks": [...],
    "expiring_tasks": [...]
  }
}
```

---

## 4. AI 能力设计

### 4.1 AI 整改建议

**触发时机：**
- 创建整改任务时（可选）
- 更新整改任务状态时（可选）

**API：** POST /api/hse/hazard-rectification/tasks/:id/ai-suggestions

**请求体：**
```json
{
  "hazard_description": "电气线路老化",
  "hazard_level": "major",
  "location": "配电室"
}
```

**响应：**
```json
{
  "code": 200,
  "message": "AI建议生成成功",
  "data": {
    "ai_suggestions": "1. 更换老化电缆；2. 安装漏电保护器；3. 定期巡检",
    "ai_risk_hint": "若不及时整改，可能引发电气火灾",
    "analysis_basis": "full_text",
    "prompt_version": "1.0"
  }
}
```

**约束：**
- AI 仅提供建议，不参与决策
- AI 生成的建议需人工确认后才能生效
- 不保存 AI 生成的结论性内容（如"达标"、"不达标"）

---

## 5. 数据关联关系

```
hazard_record (隐患记录)
    ├── 1:N ──→ rectification_task (整改任务)
    │                   ├── 1:N ──→ rectification_action (整改措施)
    │                   └── 1:N ──→ review_record (复查记录)
    └── 1:N ──→ review_record (复查记录)

employee (员工)
    ├── 1:N ──→ hazard_record.reported_by (报告人)
    ├── 1:N ──→ hazard_record.confirmed_by (确认人)
    ├── 1:N ──→ rectification_task.responsible_id (任务责任人)
    ├── 1:N ──→ rectification_action.responsible_id (措施责任人)
    └── 1:N ──→ review_record.reviewer_id (复查人)

department (部门)
    ├── 1:N ──→ hazard_record.department_id (隐患所属部门)
    └── 1:N ──→ rectification_task.department_id (任务所属部门)
```

---

## 6. 整改超期提醒机制

### 6.1 判断逻辑

```
超期 = 当前日期 > deadline_date 且 status != 'completed'
临期 = 当前日期 + 7天 >= deadline_date 且 status != 'completed'
```

### 6.2 提醒方式

| 类型 | 触发条件 | 通知级别 |
|------|----------|----------|
| 临期提醒 | 距整改期限 ≤ 7 天 | warning |
| 超期提醒 | 已超过整改期限 | urgent |

### 6.3 通知内容

```json
{
  "title": "整改超期提醒：电气线路整改",
  "content": "任务编号 RT-20260720-0001（电气线路整改）已超期3天，请立即处置。",
  "type": "system",
  "bizType": "rectification_overdue",
  "bizId": "RT-20260720-0001",
  "pushWs": true
}
```

---

## 7. 整改闭环率计算

### 7.1 计算公式

```
整改闭环率 = (已关闭隐患数 / 总隐患数) × 100%
```

### 7.2 统计维度

| 维度 | 说明 |
|------|------|
| 总体闭环率 | 全部隐患的闭环率 |
| 部门闭环率 | 按部门统计的闭环率 |
| 责任人闭环率 | 按责任人统计的闭环率 |
| 时间段闭环率 | 按月份/季度统计的闭环率 |

---

## 8. 责任人查询

### 8.1 查询接口

#### GET /api/hse/hazard-rectification/responsible/:employeeId/tasks

**响应：**
```json
{
  "code": 200,
  "message": "查询成功",
  "data": {
    "employee_id": 1001,
    "employee_name": "张三",
    "total_tasks": 10,
    "completed_tasks": 8,
    "overdue_tasks": 1,
    "tasks": [...]
  }
}
```

---

## 9. 与现有系统的集成

### 9.1 与 hazards 模块集成

- hazard_record 与 hazards 表通过 hazard_id 关联
- 隐患确认后同步更新 hazards 表状态

### 9.2 与通知中心集成

- 超期提醒通过 notificationService 推送
- 使用 type=system, bizType=rectification_overdue

### 9.3 与审计日志集成

- 所有操作记录到 sys_operation_log
- 记录创建人、操作类型、目标对象

---

## 10. 数据库迁移说明

### 10.1 迁移策略

- 采用增量迁移，不删除已有字段
- 使用 IF NOT EXISTS 确保可重复执行
- 创建新表 rectification_task, rectification_action, review_record
- 扩展 hazard_record 表新增字段

### 10.2 数据初始化

- 从现有 hazards 表迁移已确认的隐患到 hazard_record
- 从现有 hse_rectifications 表迁移数据到 rectification_task
- 从现有 hse_reviews 表迁移数据到 review_record

---

## 11. 技术实现要点

### 11.1 代码组织

```
server/
├── routes/
│   └── hse-hazard-rectification.js    # 隐患整改闭环路由
├── sql/
│   └── hse_employee_master_v66_extension.sql    # v66迁移脚本
└── __tests__/
    └── hse-hazard-rectification.test.js    # 集成测试
```

### 11.2 安全约束

- 所有人员关联必须使用 employee_id
- 禁止存储姓名字段作为关联键
- 敏感字段使用加密存储（继承现有加密机制）

### 11.3 性能优化

- 合理创建索引提升查询效率
- 分页查询避免全表扫描
- 批量操作使用事务

---

## 12. 验收标准

### 12.1 功能验收

| 功能 | 验收标准 |
|------|----------|
| 隐患确认 | 可通过 API 确认隐患，状态变更为 confirmed |
| 整改任务 | 可创建、更新、删除整改任务，关联隐患和责任人 |
| 整改措施 | 可创建、更新整改措施，关联整改任务 |
| 复查记录 | 可创建复查记录，支持通过/不通过/部分通过 |
| 超期提醒 | 自动计算超期状态，推送通知 |
| 闭环率统计 | 正确计算整改闭环率 |
| 责任人查询 | 支持按责任人查询整改任务 |

### 12.2 数据验收

| 检查项 | 验收标准 |
|--------|----------|
| 数据完整性 | 所有关联使用 employee_id，无姓名字段关联 |
| 状态流转 | 隐患状态按设计流程正确流转 |
| 超期计算 | 超期判断逻辑正确 |
| AI 约束 | AI 仅提供建议，不参与决策 |

### 12.3 测试验收

- 单元测试覆盖率 ≥ 80%
- 集成测试覆盖率 ≥ 90%
- 所有测试用例通过

---

## 13. 后续设计建议（不在 Sprint5.5 开发范围）

### 13.1 设计目的

为提升隐患整改闭环中心的可追溯性和决策可解释性，建议在后续迭代中为 `hazard_record` 表增加关闭原因和驳回原因字段。**此建议仅作为设计预留，不在 Sprint5.5 范围内开发。**

### 13.2 建议新增字段

#### 13.2.1 close_reason（关闭原因）

| 属性 | 值 |
|------|------|
| 所属表 | hazard_record |
| 字段名 | close_reason |
| 类型 | VARCHAR(64) |
| 是否可空 | NULL |
| 默认值 | NULL |
| 说明 | 隐患关闭原因分类，仅在 status='closed' 时有值 |

**建议枚举值：**

| 值 | 说明 |
|----|------|
| rectified | 已整改完成 |
| not_applicable | 不适用（误报） |
| transferred | 转其他流程处理 |
| risk_accepted | 风险接受（暂不整改） |
| duplicate | 重复隐患 |
| other | 其他 |

**使用场景：**
- 复查通过关闭隐患时记录关闭原因
- 便于后续统计分析关闭原因分布
- 区分"真整改关闭"和"非整改关闭"

#### 13.2.2 reject_reason（驳回原因）

| 属性 | 值 |
|------|------|
| 所属表 | hazard_record |
| 字段名 | reject_reason |
| 类型 | TEXT |
| 是否可空 | NULL |
| 默认值 | NULL |
| 说明 | 隐患驳回原因说明，记录驳回详细理由 |

**使用场景：**
- 隐患确认环节驳回报告时记录原因
- 复查不通过时记录具体驳回理由
- 整改任务延期申请被拒绝时记录原因
- 提供完整的决策追溯链

**与 close_reason 的区别：**
- `close_reason`：分类化的关闭原因（枚举值，便于统计）
- `reject_reason`：自由文本的驳回说明（详细描述，便于追溯）

### 13.3 建议的 DDL（仅供参考，不在本 Sprint 执行）

```sql
-- 以下 SQL 仅为设计建议，不在 Sprint5.5 执行
-- 预留至 Sprint6 或后续迭代时实施

ALTER TABLE hazard_record ADD COLUMN IF NOT EXISTS close_reason VARCHAR(64);
ALTER TABLE hazard_record ADD COLUMN IF NOT EXISTS reject_reason TEXT;

COMMENT ON COLUMN hazard_record.close_reason IS '关闭原因：rectified/not_applicable/transferred/risk_accepted/duplicate/other';
COMMENT ON COLUMN hazard_record.reject_reason IS '驳回原因说明（自由文本）';
```

### 13.4 建议的 API 调整（仅供参考，不在本 Sprint 实施）

#### 关闭隐患时支持 close_reason

```json
// POST /api/hse/hazard-rectification/reviews
{
  "hazard_id": 1,
  "reviewer_id": 1004,
  "review_result": "pass",
  "close_reason": "rectified",
  "review_note": "整改到位，隐患消除"
}
```

#### 驳回时支持 reject_reason

```json
// POST /api/hse/hazard-rectification/reviews
{
  "hazard_id": 1,
  "reviewer_id": 1004,
  "review_result": "fail",
  "reject_reason": "整改措施未落实，电缆未更换，仅做了临时处理",
  "review_note": "需重新整改"
}
```

### 13.5 实施建议

1. **时机：** Sprint6 或后续迭代
2. **迁移策略：** 增量迁移，使用 `IF NOT EXISTS` 保证可重复执行
3. **兼容性：** 新增字段允许 NULL，不影响现有数据和接口
4. **前端适配：** 关闭/驳回时增加原因选择或填写表单
5. **统计扩展：** 闭环统计可增加按 close_reason 分组的维度

### 13.6 设计原则

- ✅ 不破坏现有数据结构
- ✅ 不修改已有字段语义
- ✅ 增量扩展，向后兼容
- ✅ 字段可空，不影响现有业务流程
# Sprint5.10 培训管理深化开发报告

## 一、开发概述

### 1.1 开发目标
建立岗位驱动培训管理体系，实现从岗位→培训要求→培训计划→员工培训记录→完成统计的完整业务闭环。

### 1.2 开发范围
- 培训要求管理（关联岗位）
- 培训计划管理（年度/专项/新员工）
- 培训记录深化（增加附件管理）
- 培训统计分析（岗位/员工完成率、逾期人员）

### 1.3 前置依赖
- Sprint5.9 人员关联改造已完成，所有人员关联统一使用 `employee_id`

---

## 二、数据库设计

### 2.1 培训要求表（training_requirements）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | BIGSERIAL | 主键 |
| position_id | BIGINT | 岗位ID |
| position_name | VARCHAR(128) | 岗位名称 |
| training_name | VARCHAR(255) | 培训名称 |
| training_cycle | VARCHAR(32) | 培训周期（年度/半年/季度/月度/专项/入职） |
| is_required | BOOLEAN | 是否必须培训 |
| duration_minutes | INT | 培训时长（分钟） |
| remark | TEXT | 备注 |
| is_deleted | BOOLEAN | 软删除标记 |
| created_at | TIMESTAMPTZ | 创建时间 |
| updated_at | TIMESTAMPTZ | 更新时间 |

**索引**: `idx_training_requirements_position`

### 2.2 培训计划表（training_plans）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | BIGSERIAL | 主键 |
| title | VARCHAR(255) | 计划标题 |
| plan_type | VARCHAR(32) | 计划类型（annual/special/new_employee） |
| training_type | VARCHAR(64) | 培训类型 |
| target_audience | VARCHAR(255) | 目标人群 |
| trainer_name | VARCHAR(64) | 培训师姓名 |
| trainer_id | BIGINT | 培训师ID |
| planned_attendees | INT | 计划人数 |
| actual_attendees | INT | 实际人数 |
| start_date | DATE | 开始日期 |
| end_date | DATE | 结束日期 |
| location | VARCHAR(255) | 培训地点 |
| duration_hours | DECIMAL(5,1) | 时长（小时） |
| content | TEXT | 培训内容 |
| exam_required | BOOLEAN | 是否需要考试 |
| pass_score | INT | 及格分数 |
| status | VARCHAR(32) | 状态（draft/approved/in_progress/completed/cancelled） |
| remark | TEXT | 备注 |
| is_deleted | BOOLEAN | 软删除标记 |
| created_at | TIMESTAMPTZ | 创建时间 |
| updated_at | TIMESTAMPTZ | 更新时间 |

**索引**: `idx_training_plans_status`, `idx_training_plans_plan_type`

---

## 三、后端API开发

### 3.1 培训要求管理

| API路径 | 方法 | 功能 |
|---------|------|------|
| `/training/requirements` | GET | 查询培训要求列表（分页、岗位筛选、关键词搜索） |
| `/training/requirements/:id` | GET | 查询单个培训要求 |
| `/training/requirements` | POST | 创建培训要求 |
| `/training/requirements/:id` | PUT | 更新培训要求 |
| `/training/requirements/:id` | DELETE | 删除培训要求（软删除） |

### 3.2 培训计划管理

| API路径 | 方法 | 功能 |
|---------|------|------|
| `/training/plans` | GET | 查询培训计划列表（分页、类型筛选、状态筛选、关键词搜索） |
| `/training/plans/:id` | GET | 查询单个培训计划 |
| `/training/plans` | POST | 创建培训计划 |
| `/training/plans/:id` | PUT | 更新培训计划 |
| `/training/plans/:id` | DELETE | 删除培训计划（软删除） |

### 3.3 培训统计增强

| API路径 | 方法 | 功能 |
|---------|------|------|
| `/training/stats/enhanced` | GET | 获取增强统计数据 |

**返回数据结构**:
```json
{
  "byPosition": { "岗位名": { "required": 数量, "completed": 数量 } },
  "byEmployee": { "员工名(工号)": 培训次数 },
  "overdueEmployees": [{ "name": "姓名", "employeeCode": "工号", "positionName": "岗位", ... }],
  "positionCompletionRate": { "岗位名": 完成率 },
  "employeeCompletionRate": {}
}
```

### 3.4 后端文件修改

- [server/routes/training.js](file:///f:/deploy/hse-dashboard/server/routes/training.js)
  - 添加 `training_requirements` 表初始化
  - 添加 `training_plans` 表初始化
  - 添加培训要求管理 CRUD API（第763-899行）
  - 添加培训计划管理 CRUD API（第907-1083行）
  - 添加培训统计增强 API（第1088-1165行）

---

## 四、前端开发

### 4.1 API定义更新

- [src/api/hse/training.ts](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse/training.ts)
  - 添加 `TrainingRequirementApi` 命名空间及接口定义
  - 添加 `TrainingPlanApi` 命名空间及接口定义
  - 添加 `EnhancedTrainingStats` 接口定义
  - 添加培训要求 CRUD API 调用函数
  - 添加培训计划 CRUD API 调用函数
  - 添加 `getEnhancedTrainingStats` 函数

### 4.2 新增页面组件

#### 4.2.1 培训要求管理页面
- 文件: [src/views/training/requirements/index.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/training/requirements/index.vue)
- 功能:
  - 培训要求列表展示（岗位、培训名称、周期、是否必须、时长）
  - 使用 `EmployeeSelector` 组件选择岗位
  - 新增/编辑培训要求弹窗
  - 软删除功能

#### 4.2.2 培训计划管理页面
- 文件: [src/views/training/plans/index.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/training/plans/index.vue)
- 功能:
  - 培训计划列表展示（标题、类型、培训师、人数、日期、状态）
  - 计划类型筛选（年度/专项/新员工）
  - 状态筛选（草稿/已审批/进行中/已完成/已取消）
  - 使用 `EmployeeSelector` 组件选择培训师
  - 新增/编辑培训计划弹窗
  - 计划详情抽屉

#### 4.2.3 培训统计页面
- 文件: [src/views/training/stats/index.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/training/stats/index.vue)
- 功能:
  - 统计卡片（岗位数量、员工数量、平均完成率、逾期人数）
  - 岗位培训完成率进度条图表
  - 员工培训完成情况进度条图表
  - 逾期未培训人员列表

### 4.3 培训台账页面增强

- 文件: [src/views/training/ledger/index.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/training/ledger/index.vue)
- 增强内容:
  - 新增培训证明附件上传功能（新增记录弹窗中）
  - 详情抽屉新增"培训证明附件"Tab页
  - 支持附件上传、预览、删除、版本管理

### 4.4 路由配置更新

- [src/router/routes/modules/hse-training.ts](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-training.ts)
  - `/training/requirements` - 培训要求管理
  - `/training/plans` - 年度计划管理
  - `/training/stats` - 培训统计分析

---

## 五、人员关联规范执行

### 5.1 遵循规范
所有人员选择均使用 `EmployeeSelector` 组件，禁止姓名关联，禁止新增人员表。

### 5.2 关联字段
- 培训要求: `position_id`（岗位关联）
- 培训计划: `trainer_id`（培训师关联）
- 培训记录: `employee_id`（参训人员）、`trainer_id`（培训师）

---

## 六、工程约束遵守

- ✅ 未修改 Vben 核心目录
- ✅ 未修改 auth/JWT
- ✅ 未新增 npm 依赖
- ✅ 使用现有组件库（ant-design-vue）

---

## 七、功能验证清单

| 模块 | 功能点 | 状态 |
|------|--------|------|
| 培训要求管理 | 列表查询 | ✅ |
| | 岗位筛选 | ✅ |
| | 关键词搜索 | ✅ |
| | 新增培训要求 | ✅ |
| | 编辑培训要求 | ✅ |
| | 删除培训要求 | ✅ |
| 培训计划管理 | 列表查询 | ✅ |
| | 类型/状态筛选 | ✅ |
| | 关键词搜索 | ✅ |
| | 新增培训计划 | ✅ |
| | 编辑培训计划 | ✅ |
| | 删除培训计划 | ✅ |
| | 详情查看 | ✅ |
| 培训记录深化 | 培训日期 | ✅（已有） |
| | 培训内容 | ✅（已有） |
| | 培训结果 | ✅（已有） |
| | 考试成绩 | ✅（已有） |
| | 培训证明附件 | ✅（新增） |
| 培训统计 | 岗位完成率 | ✅ |
| | 员工完成率 | ✅ |
| | 逾期人员 | ✅ |

---

## 八、文件变更清单

### 8.1 后端文件

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| server/routes/training.js | 修改 | 添加培训要求、计划、统计增强 API |

### 8.2 前端文件

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| src/api/hse/training.ts | 修改 | 添加新 API 定义和类型 |
| src/views/training/requirements/index.vue | 新建 | 培训要求管理页面 |
| src/views/training/plans/index.vue | 新建 | 培训计划管理页面 |
| src/views/training/stats/index.vue | 新建 | 培训统计分析页面 |
| src/views/training/ledger/index.vue | 修改 | 增强培训证明附件管理 |
| src/router/routes/modules/hse-training.ts | 修改 | 添加新路由 |

---

## 九、后续建议

1. 培训计划与培训记录建立关联关系，支持从计划创建培训记录
2. 添加培训到期提醒功能
3. 培训统计增加图表可视化（柱状图、饼图）
4. 支持培训要求批量导入
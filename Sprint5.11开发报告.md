# Sprint5.11 培训闭环强化开发报告

## 一、开发概述

### 1.1 开发目标
实现培训管理完整闭环：培训计划 → 培训记录 → 员工完成情况 → 到期提醒 → 逾期管理。

### 1.2 开发范围
- 数据库调整：training_records 增加 training_plan_id 关联字段
- 培训计划执行：从培训计划生成培训记录（使用 EmployeeSelector 选择员工）
- 培训到期检查：即将到期、已逾期、从未培训人员查询能力
- 新员工培训自动识别：基于入职日期 + 新员工培训要求
- 培训分析增强：高风险岗位、驾驶员、新员工培训完成率

### 1.3 前置依赖
- Sprint5.10 培训管理深化已完成
- v_employee_current 视图可用（用于员工查询）

---

## 二、数据库调整

### 2.1 training_records 表新增字段

| 字段名 | 类型 | 说明 |
|--------|------|------|
| training_plan_id | BIGINT | 关联 training_plans.id |

**新增索引**:
- `idx_training_records_plan` - 培训计划关联查询索引
- `idx_training_records_employee` - 员工关联查询索引

### 2.2 关系模型
```
training_plans (1) ──→ (N) training_records
                           ↓
                     employee_id → v_employee_current
```

---

## 三、后端API开发

### 3.1 从培训计划生成培训记录

| API路径 | 方法 | 功能 |
|---------|------|------|
| `/training/plans/:id/execute` | POST | 从培训计划批量生成培训记录 |

**请求参数**:
```json
{
  "employeeIds": [1, 2, 3],
  "trainingDate": "2026-07-21",
  "result": "合格",
  "score": 85,
  "remark": "备注",
  "trainerId": 10
}
```

**处理逻辑**:
1. 校验培训计划存在性
2. 批量查询员工信息（v_employee_current）
3. 为每个 employeeId 创建 training_records 记录，关联 training_plan_id
4. 自动填充培训类型、时长、内容（继承自培训计划）
5. 更新培训计划的 actual_attendees 字段

### 3.2 培训到期检查

| API路径 | 方法 | 功能 |
|---------|------|------|
| `/training/reminders/expiry` | GET | 查询到期情况（支持 days 参数） |

**返回数据**:
```json
{
  "expiring": [...],     // 即将到期（days天内）
  "expired": [...],      // 已逾期
  "missing": [...],      // 从未培训
  "summary": {
    "expiringCount": 0,
    "expiredCount": 0,
    "missingCount": 0,
    "total": 0
  },
  "note": "接口能力已完成，定时调度 Sprint6 实现"
}
```

**时效计算规则**:
- 到期日 = training_date + 12个月
- expired: 当前日期 > 到期日
- expiring: 距到期日 ≤ days天
- missing: 无任何合格培训记录

### 3.3 新员工培训自动识别

| API路径 | 方法 | 功能 |
|---------|------|------|
| `/training/reminders/new-employee` | GET | 识别未完成新员工培训人员 |

**识别规则**:
1. 查询入职日期在90天内的新员工（assignment_status='active'）
2. 检查每个新员工是否有 training_type 包含"新员工"的合格培训记录
3. 返回未完成人员列表（含入职天数、最近培训信息）

### 3.4 培训分析增强

| API路径 | 方法 | 功能 |
|---------|------|------|
| `/training/analysis/enhanced` | GET | 获取三类完成率分析 |

**返回数据**:
```json
{
  "highRiskPosition": { "total": 0, "completed": 0, "rate": 0 },
  "driver": { "total": 0, "completed": 0, "rate": 0 },
  "newEmployee": { "total": 0, "completed": 0, "rate": 0 },
  "summary": { "overallRate": 0 }
}
```

**高风险岗位定义**: 岗位名称包含 司机/电工/焊工/锅炉/起重/叉车/特种/危化

### 3.5 后端文件修改

- [server/routes/training.js](file:///f:/deploy/hse-dashboard/server/routes/training.js)
  - 第66-69行: 新增 training_plan_id 字段及索引初始化
  - 第172/192行: formatRecordRow 增加 trainingPlanId 字段
  - 第459-506行: create/update ledger API 支持 training_plan_id
  - 第1175-1259行: 新增从培训计划生成培训记录 API
  - 第1261-1352行: 新增培训到期检查 API
  - 第1354-1437行: 新增新员工培训自动识别 API
  - 第1439-1558行: 新增培训分析增强 API

---

## 四、前端开发

### 4.1 API定义更新

- [src/api/hse/training.ts](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse/training.ts)
  - 新增 `ExecutePlanParams`、`ExecutePlanResult` 接口
  - 新增 `executeTrainingPlan` 函数
  - 新增 `ExpiryReminderItem`、`ExpiryReminderResult` 接口
  - 新增 `getExpiryReminders` 函数
  - 新增 `NewEmployeeIncompleteItem`、`NewEmployeeReminderResult` 接口
  - 新增 `getNewEmployeeReminders` 函数
  - 新增 `TrainingAnalysisResult` 接口
  - 新增 `getTrainingAnalysis` 函数

### 4.2 新增页面组件

#### 4.2.1 培训计划执行页面
- 文件: [src/views/training/execute/index.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/training/execute/index.vue)
- 功能:
  - 选择培训计划（显示计划详情）
  - 使用 EmployeeSelector 多选参训员工
  - 设置培训日期、结果、成绩、备注
  - 批量生成培训记录
  - 显示执行结果列表

#### 4.2.2 培训提醒页面
- 文件: [src/views/training/reminders/index.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/training/reminders/index.vue)
- 功能:
  - Tab1 培训到期检查:
    - 统计卡片（即将到期、已逾期、从未培训）
    - 可配置到期天数（15/30/60/90天）
    - 三个独立列表展示不同状态人员
  - Tab2 新员工培训识别:
    - 统计卡片（新员工总数、未完成、已完成）
    - 新员工培训要求列表
    - 未完成人员列表（含入职天数高亮）

#### 4.2.3 培训分析页面
- 文件: [src/views/training/analysis/index.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/training/analysis/index.vue)
- 功能:
  - 四个统计卡片（综合、高风险、驾驶员、新员工完成率）
  - 三个环形进度图（高风险岗位、驾驶员、新员工）
  - 培训薄弱环节自动分析（基于阈值生成告警）
  - 高风险岗位关键词标签展示

### 4.3 路由配置更新

- [src/router/routes/modules/hse-training.ts](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-training.ts)
  - `/training/analysis` - 培训分析
  - `/training/reminders` - 培训提醒
  - `/training/execute` - 计划执行

---

## 五、培训闭环实现

### 5.1 闭环流程
```
培训计划（training_plans）
    ↓ execute API
培训记录（training_records, 关联 training_plan_id）
    ↓ employee_id 关联
员工完成情况（v_employee_current + training_records）
    ↓ 时效计算
到期提醒（/reminders/expiry）
    ↓ 逾期识别
逾期管理（expired 列表）
```

### 5.2 新员工培训闭环
```
入职日期（hire_date）
    ↓ 90天内识别
新员工列表（v_employee_current）
    ↓ 检查培训记录
未完成识别（/reminders/new-employee）
    ↓ 培训要求对照
培训安排（training_requirements）
```

---

## 六、人员关联规范执行

### 6.1 遵循规范
- ✅ 使用 EmployeeSelector 组件选择参训员工
- ✅ 禁止姓名关联，统一使用 employee_id
- ✅ 未新增人员表
- ✅ 所有员工查询通过 v_employee_current 视图

### 6.2 关联字段
- training_records.employee_id → v_employee_current.employee_id
- training_records.training_plan_id → training_plans.id
- training_records.trainer_id → v_employee_current.employee_id

---

## 七、工程约束遵守

- ✅ 未修改 Vben 核心目录
- ✅ 未修改 auth/JWT
- ✅ 未新增 npm 依赖
- ✅ 定时任务标注：接口能力已完成，定时调度 Sprint6 实现

---

## 八、文件变更清单

### 8.1 后端文件

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| server/routes/training.js | 修改 | 新增4个API、字段调整 |

### 8.2 前端文件

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| src/api/hse/training.ts | 修改 | 新增5个API函数和类型定义 |
| src/views/training/execute/index.vue | 新建 | 培训计划执行页面 |
| src/views/training/reminders/index.vue | 新建 | 培训提醒页面 |
| src/views/training/analysis/index.vue | 新建 | 培训分析页面 |
| src/router/routes/modules/hse-training.ts | 修改 | 新增3个路由 |

---

## 九、后续建议（Sprint6）

1. **定时任务调度**: 实现定时执行到期检查，自动推送提醒
2. **消息通知**: 集成钉钉/企业微信推送培训到期提醒
3. **培训计划审批流**: 增加培训计划审批工作流
4. **培训证书管理**: 培训记录关联电子证书，支持证书到期预警
5. **培训成本统计**: 增加培训费用字段，支持成本分析

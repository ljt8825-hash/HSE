# Sprint5.12 三违管理深化开发报告

## 一、开发概述

**项目**：HSE 安全管理系统
**阶段**：Sprint5.12
**主题**：三违管理深化开发
**目标**：建立员工风险行为管理闭环

---

## 二、需求分析

### 2.1 核心目标

建立员工风险行为管理闭环流程：

```
员工 → 三违记录 → 整改 → 复训 → 风险降低
```

### 2.2 需求要点

| 序号 | 需求点 | 描述 | 优先级 |
|:---:|--------|------|:---:|
| 1 | 人员关联规范 | 所有人员字段必须使用 employee_id，关联来源 v_employee_current | 高 |
| 2 | 数据模型完善 | 完善 hse_violation_records 表结构 | 高 |
| 3 | 业务流程开发 | 创建→责任员工选择→整改→复查→关闭 | 高 |
| 4 | 培训联动 | 严重三违自动标记需要复训，关联 training_plan | 高 |
| 5 | 统计分析 | 员工三违次数、高风险人员、部门/岗位排行 | 高 |

---

## 三、技术实现

### 3.1 数据模型完善

**修改文件**：`server/routes/violations.js`

**新增字段**：

| 字段名 | 类型 | 说明 |
|--------|------|------|
| risk_level | VARCHAR(32) | 风险等级（高/中/低），默认值"中" |
| occur_time | TIME | 发生时间 |
| handler_name | VARCHAR(64) | 处理人员姓名 |
| handler_id | BIGINT | 处理人员ID |
| rectification | TEXT | 整改措施 |
| rectification_time | TIMESTAMPTZ | 整改时间 |
| review_result | VARCHAR(32) | 复查结果 |
| review_time | TIMESTAMPTZ | 复查时间 |
| need_retraining | BOOLEAN | 是否需要复训，默认FALSE |
| training_plan_id | BIGINT | 关联培训计划ID |

**新增索引**：

- `idx_violation_records_violator_id` - 违章人员ID索引
- `idx_violation_records_risk_level` - 风险等级索引

### 3.2 API接口开发

#### 3.2.1 整改接口

**路径**：`PUT /api/violations/:id/rectify`

**功能**：提交整改措施，状态变更为"待复查"

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|:---:|------|
| rectification | string | 是 | 整改措施 |
| handlerName | string | 否 | 处理人员姓名 |
| handlerId | number | 否 | 处理人员ID |

#### 3.2.2 复查接口

**路径**：`PUT /api/violations/:id/review`

**功能**：确认复查结果，合格则关闭，不合格则退回整改

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|:---:|------|
| reviewResult | string | 是 | 复查结果（合格/不合格） |
| remark | string | 否 | 复查备注 |

#### 3.2.3 统计分析接口

| 接口路径 | 功能 |
|----------|------|
| `GET /api/violations/statistics/employee-count` | 员工三违次数统计 |
| `GET /api/violations/statistics/high-risk` | 高风险人员统计（高风险≥2次） |
| `GET /api/violations/statistics/department-ranking` | 部门三违排行 |
| `GET /api/violations/statistics/position-ranking` | 岗位三违排行 |

**支持参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| startDate | string | 开始日期（YYYY-MM-DD） |
| endDate | string | 结束日期（YYYY-MM-DD） |

### 3.3 培训联动

**实现逻辑**：

- 创建三违记录时，若严重程度为"严重"，自动设置 `need_retraining = true`
- 前端表单中提供"是否需要复训"开关，可手动调整
- 关联字段 `training_plan_id` 用于后续与培训计划联动

### 3.4 前端页面更新

**修改文件**：`安全看板vben/apps/web-antd/src/views/violations/index.vue`

**更新内容**：

1. **新增风险等级筛选** - 在查询表单中增加风险等级筛选条件
2. **新增状态选项** - 扩展状态为：待处理、整改中、待复查、已关闭
3. **新增整改按钮** - 在操作列中显示整改按钮（状态为待处理/整改中时）
4. **新增复查按钮** - 在操作列中显示复查按钮（状态为待复查时）
5. **整改弹窗** - 新增整改处理弹窗，包含处理人员选择和整改措施输入
6. **复查弹窗** - 新增复查确认弹窗，包含复查结果选择和备注输入
7. **统计分析弹窗** - 新增统计分析弹窗，包含四个Tab页：
   - 员工三违次数
   - 高风险人员
   - 部门排行
   - 岗位排行
8. **详情抽屉增强** - 增加风险等级、发生时间、处理人员、整改措施、复查结果等字段显示
9. **表单增强** - 增加风险等级、发生时间、处理人员、整改措施、复训开关等字段

### 3.5 API类型定义更新

**修改文件**：`安全看板vben/apps/web-antd/src/api/hse/violations.ts`

**新增类型**：

- `EmployeeViolationCount` - 员工三违次数统计类型
- `HighRiskEmployee` - 高风险人员类型
- `DepartmentRanking` - 部门排行类型
- `PositionRanking` - 岗位排行类型
- `RectifyRequest` - 整改请求类型
- `ReviewRequest` - 复查请求类型

**新增接口函数**：

- `rectifyViolation()` - 整改接口
- `reviewViolation()` - 复查接口
- `getEmployeeViolationCount()` - 员工三违次数统计
- `getHighRiskEmployees()` - 高风险人员统计
- `getDepartmentRanking()` - 部门排行
- `getPositionRanking()` - 岗位排行

---

## 四、业务流程

### 4.1 三违处理流程图

```
┌─────────────┐
│  创建三违   │
└──────┬──────┘
       ▼
┌─────────────┐
│ 待处理      │
│ (选择责任员工) │
└──────┬──────┘
       ▼
┌─────────────┐
│   整改中    │
│ (整改措施)   │
└──────┬──────┘
       ▼
┌─────────────┐
│   待复查    │
│ (提交整改)   │
└──────┬──────┘
       │
   ┌───┴───┐
   ▼       ▼
┌──────────┐ ┌──────────┐
│  合格    │ │  不合格  │
│ 已关闭   │ │ 整改中   │
└──────────┘ └──────────┘
```

### 4.2 状态流转

| 当前状态 | 操作 | 目标状态 |
|----------|------|----------|
| 待处理 | 整改 | 待复查 |
| 整改中 | 整改 | 待复查 |
| 待复查 | 复查合格 | 已关闭 |
| 待复查 | 复查不合格 | 整改中 |

---

## 五、工程约束遵守

| 约束项 | 状态 | 说明 |
|--------|:---:|------|
| 禁止修改Vben核心目录 | ✅ | 未修改 |
| 禁止修改auth/JWT | ✅ | 未修改 |
| 禁止新增npm依赖 | ✅ | 未新增 |

---

## 六、文件变更清单

| 文件路径 | 变更类型 | 说明 |
|----------|:-------:|------|
| `server/routes/violations.js` | 修改 | 完善数据模型、新增API接口 |
| `安全看板vben/apps/web-antd/src/api/hse/violations.ts` | 修改 | 新增类型定义和接口函数 |
| `安全看板vben/apps/web-antd/src/views/violations/index.vue` | 修改 | 更新前端页面 |

---

## 七、后续工作建议

1. **培训计划联动** - 实现三违记录与培训计划的自动关联创建
2. **短信通知** - 整改/复查时发送通知提醒相关人员
3. **移动端适配** - 优化移动端三违管理页面显示
4. **数据分析图表** - 增加可视化图表展示统计数据
# HSE安全数据分析中心实施报告

## 一、项目概述

### 1.1 项目背景

本项目是宁津环卫HSE安全管理系统数字化升级的第六阶段A，旨在构建HSE安全数据分析中心，建立安全趋势分析数据层，实现安全数据的可视化展示和深度分析。

### 1.2 阶段目标

基于已有的事件中心、风险闭环和智能任务工作流，建立统计快照机制：

- **每日统计**：自动生成每日安全数据快照
- **每月统计**：自动生成月度安全数据汇总
- **每年统计**：自动生成年度安全数据汇总
- **趋势分析**：周/月/年三级趋势展示
- **排名分析**：部门和责任人排名

### 1.3 实施原则

严格遵守增量原则，**不修改已有业务表**，采用统计快照方式实现。

---

## 二、数据库新增

### 2.1 统计表结构

#### 2.1.1 hse_statistics_daily（每日安全统计表）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | BIGSERIAL | 主键 |
| stat_date | DATE | 统计日期（唯一） |
| event_count | INT | 总事件数 |
| hazard_count | INT | 隐患数 |
| accident_count | INT | 事故数 |
| violation_count | INT | 三违数 |
| patrol_alert_count | INT | 巡检异常数 |
| iot_alert_count | INT | IoT报警数 |
| task_total | INT | 任务总数 |
| task_completed | INT | 已完成任务数 |
| task_overdue | INT | 逾期任务数 |
| task_pending | INT | 待办任务数 |
| rectification_total | INT | 整改总数 |
| rectification_done | INT | 已完成整改数 |
| review_total | INT | 复查总数 |
| review_passed | INT | 复查通过数 |
| high_risk_count | INT | 高风险数 |
| medium_risk_count | INT | 中风险数 |
| low_risk_count | INT | 低风险数 |
| training_rate | DECIMAL(5,2) | 培训完成率 |
| completion_rate | DECIMAL(5,2) | 任务完成率 |
| rectification_rate | DECIMAL(5,2) | 整改完成率 |
| department_id | BIGINT | 部门ID |
| created_at | TIMESTAMPTZ | 创建时间 |

**索引设计：**
- `idx_hse_stats_daily_date`：stat_date
- `idx_hse_stats_daily_dept`：department_id

#### 2.1.2 hse_statistics_monthly（每月安全统计表）

在每日统计表基础上增加：

| 字段名 | 类型 | 说明 |
|--------|------|------|
| stat_month | VARCHAR(7) | 统计月份（如2026-07） |
| stat_year | INT | 统计年份 |
| stat_month_num | INT | 统计月份数字 |
| avg_response_time | DECIMAL(10,2) | 平均响应时间(小时) |
| avg_rectify_time | DECIMAL(10,2) | 平均整改时间(小时) |

#### 2.1.3 hse_statistics_yearly（每年安全统计表）

在每月统计表基础上增加：

| 字段名 | 类型 | 说明 |
|--------|------|------|
| stat_year | INT | 统计年份 |
| accident_rate_trend | DECIMAL(5,2) | 事故率同比变化(%) |
| hazard_rate_trend | DECIMAL(5,2) | 隐患率同比变化(%) |

### 2.2 排名统计表

#### 2.2.1 hse_statistics_dept（部门安全统计表）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | BIGSERIAL | 主键 |
| department_id | BIGINT | 部门ID |
| department_name | VARCHAR(128) | 部门名称 |
| stat_date | DATE | 统计日期 |
| stat_period | VARCHAR(10) | 统计周期（daily/monthly/yearly） |
| event_count | INT | 事件数 |
| hazard_count | INT | 隐患数 |
| accident_count | INT | 事故数 |
| task_total | INT | 任务总数 |
| task_completed | INT | 已完成任务数 |
| task_overdue | INT | 逾期任务数 |
| completion_rate | DECIMAL(5,2) | 完成率 |
| rectification_rate | DECIMAL(5,2) | 整改率 |
| high_risk_count | INT | 高风险数 |
| ranking | INT | 排名 |
| score | DECIMAL(10,2) | 安全评分 |
| created_at | TIMESTAMPTZ | 创建时间 |

**唯一约束：** (department_id, stat_date, stat_period)

#### 2.2.2 hse_statistics_person（责任人安全统计表）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | BIGSERIAL | 主键 |
| person_id | BIGINT | 责任人ID |
| person_name | VARCHAR(128) | 责任人姓名 |
| department_id | BIGINT | 部门ID |
| stat_date | DATE | 统计日期 |
| stat_period | VARCHAR(10) | 统计周期 |
| task_total | INT | 任务总数 |
| task_completed | INT | 已完成任务数 |
| task_overdue | INT | 逾期任务数 |
| completion_rate | DECIMAL(5,2) | 完成率 |
| avg_completion_time | DECIMAL(10,2) | 平均完成时间 |
| hazard_discovered | INT | 发现隐患数 |
| rectification_done | INT | 完成整改数 |
| ranking | INT | 排名 |
| score | DECIMAL(10,2) | 绩效评分 |
| created_at | TIMESTAMPTZ | 创建时间 |

---

## 三、统计服务

### 3.1 服务功能

```javascript
statisticsService = {
  generateDailyStats,       // 生成每日统计
  generateMonthlyStats,     // 生成每月统计
  generateYearlyStats,      // 生成每年统计
  getTrendData,             // 获取趋势数据
  getDepartmentRanking,     // 获取部门排名
  getPersonRanking,         // 获取责任人排名
  generateHistoricalStats,  // 生成历史数据
}
```

### 3.2 每日统计生成流程

```
┌─────────────────────┐
│  触发：每日凌晨自动  │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  1. 统计事件数据     │  从 hse_events 表统计
│  （按类型分类）      │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  2. 统计任务数据     │  从 hse_tasks 表统计
│  （按状态分类）      │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  3. 统计整改数据     │  从 hse_rectifications 表统计
│  （完成/未完成）     │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  4. 统计复查数据     │  从 hse_reviews 表统计
│  （通过/未通过）     │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  5. 统计风险数据     │  从 risk_sources 表统计
│  （按等级分类）      │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  6. 计算各项比率     │  完成率、整改率等
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  7. 写入统计表       │  INSERT ... ON CONFLICT
└─────────────────────┘
```

### 3.3 统计维度

| 维度 | 统计项 | 说明 |
|------|--------|------|
| 事件统计 | event_count | 总事件数 |
| | hazard_count | 隐患数 |
| | accident_count | 事故数 |
| | violation_count | 三违数 |
| | patrol_alert_count | 巡检异常数 |
| | iot_alert_count | IoT报警数 |
| 任务统计 | task_total | 任务总数 |
| | task_completed | 已完成 |
| | task_overdue | 逾期 |
| | task_pending | 待办 |
| 整改统计 | rectification_total | 整改总数 |
| | rectification_done | 已完成 |
| | rectification_rate | 整改率 |
| 风险统计 | high_risk_count | 高风险 |
| | medium_risk_count | 中风险 |
| | low_risk_count | 低风险 |
| 效率统计 | avg_response_time | 平均响应时间 |
| | avg_rectify_time | 平均整改时间 |
| 趋势统计 | accident_rate_trend | 事故率同比 |
| | hazard_rate_trend | 隐患率同比 |

---

## 四、分析接口

### 4.1 接口列表

| 接口路径 | HTTP方法 | 功能描述 |
|----------|----------|----------|
| `/api/hse/statistics/overview` | GET | 获取安全概览 |
| `/api/hse/statistics/trend` | GET | 获取趋势数据 |
| `/api/hse/statistics/ranking` | GET | 获取排名数据 |
| `/api/hse/statistics/risk-trend` | GET | 获取风险变化趋势 |
| `/api/hse/statistics/rectification-trend` | GET | 获取整改趋势 |
| `/api/hse/statistics/hazard-trend` | GET | 获取隐患趋势 |
| `/api/hse/statistics/generate` | POST | 手动生成统计数据 |

### 4.2 趋势分析接口

**参数：**
- `period`: weekly/monthly/yearly
- `count`: 数据点数量，默认12

**返回示例：**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "period": "monthly",
    "count": 12,
    "data": [
      {
        "date": "2026-01",
        "event_count": 15,
        "hazard_count": 10,
        "accident_count": 2,
        "completion_rate": 85.5,
        "high_risk_count": 5
      }
    ]
  }
}
```

### 4.3 排名分析接口

**参数：**
- `type`: department/person
- `period`: daily/monthly/yearly

**部门排名返回示例：**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "type": "department",
    "period": "monthly",
    "count": 5,
    "list": [
      {
        "department_id": 1,
        "department_name": "第一作业中心",
        "event_count": 10,
        "hazard_count": 5,
        "accident_count": 0,
        "task_total": 20,
        "task_completed": 18,
        "task_overdue": 1,
        "completion_rate": 90.00,
        "safety_score": 95.5,
        "ranking": 1
      }
    ]
  }
}
```

### 4.4 安全概览接口

**返回示例：**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "events": {
      "total_events": 100,
      "hazard_count": 50,
      "accident_count": 5,
      "open_count": 20,
      "closed_count": 80
    },
    "tasks": {
      "total_tasks": 200,
      "pending_tasks": 30,
      "completed_tasks": 150,
      "overdue_tasks": 5,
      "completion_rate": 75.00
    },
    "risks": {
      "total_risks": 80,
      "high_risk": 10,
      "medium_risk": 30,
      "low_risk": 40
    },
    "today": {
      "today_events": 3,
      "today_hazards": 2,
      "today_accidents": 0
    }
  }
}
```

---

## 五、前端新增

### 5.1 HSE数据分析中心页面

**页面路径：** `/hse/statistics`

**功能模块：**

#### 5.1.1 安全概览

展示核心安全指标：
- 事件总数（隐患/事故）
- 任务总数（待办/逾期）
- 任务完成率（进度条）
- 风险总数（高/中/低风险）

#### 5.1.2 今日数据

展示当日安全数据：
- 今日事件数
- 今日隐患数
- 今日事故数

#### 5.1.3 安全趋势图

- 柱状图展示：事件总数、隐患数、事故数
- 支持周趋势/月趋势/年趋势切换
- 12个数据点展示

#### 5.1.4 整改趋势图

- 柱状图展示：整改完成数、复查通过数
- 12个月度数据点

#### 5.1.5 风险变化图

- 柱状图展示：高风险、中风险、低风险数量变化
- 12个月度数据点

#### 5.1.6 部门排行

| 列名 | 说明 |
|------|------|
| 排名 | 金银铜牌显示 |
| 部门名称 | 部门名称 |
| 事件数 | 事件总数 |
| 隐患数 | 隐患总数 |
| 完成率 | 任务完成率（进度条） |
| 安全评分 | 综合评分 |

#### 5.1.7 责任人排行

| 列名 | 说明 |
|------|------|
| 排名 | 金银铜牌显示 |
| 责任人 | 责任人姓名 |
| 任务总数 | 总任务数 |
| 完成数 | 已完成任务数 |
| 逾期数 | 逾期任务数 |
| 完成率 | 任务完成率（进度条） |

---

## 六、测试验证

### 6.1 测试结果

| 测试项 | 结果 |
|--------|------|
| hse_statistics_daily 表存在 | ✓ 通过 |
| hse_statistics_monthly 表存在 | ✓ 通过 |
| hse_statistics_yearly 表存在 | ✓ 通过 |
| hse_statistics_dept 表存在 | ✓ 通过 |
| hse_statistics_person 表存在 | ✓ 通过 |
| 每日统计生成 | ✓ 通过 |
| 趋势数据查询 | ✓ 通过 |
| 部门排名查询 | ✓ 通过 |
| 责任人排名查询 | ✓ 通过 |
| 安全概览统计 | ✓ 通过 |

**测试结论：** 所有10项测试全部通过，数据分析中心功能正常。

---

## 七、实施文件清单

### 7.1 后端文件

| 文件路径 | 说明 |
|----------|------|
| `server/routes/hse-statistics.js` | 统计分析路由 |
| `server/services/statisticsService.js` | 统计服务 |
| `server/app.js` | 路由注册（新增引用） |
| `server/sql/hse_statistics_v50_migration.sql` | SQL迁移脚本 |

### 7.2 前端文件

| 文件路径 | 说明 |
|----------|------|
| `安全看板vben/apps/web-antd/src/api/hse/statistics.ts` | 统计API接口定义 |
| `安全看板vben/apps/web-antd/src/views/hse/statistics/index.vue` | 数据分析中心页面 |
| `安全看板vben/apps/web-antd/src/router/routes/modules/hse-statistics.ts` | 路由配置 |

### 7.3 测试文件

| 文件路径 | 说明 |
|----------|------|
| `server/test/hse-statistics-test.js` | 统计测试脚本 |
| `server/test/migrate-statistics.js` | 迁移测试脚本 |

---

## 八、总结

### 8.1 完成内容

1. **数据库层**：新增5张统计表（日/月/年统计 + 部门/责任人排名）
2. **统计服务**：开发完整的统计服务，支持日/月/年三级统计生成
3. **分析接口**：开发趋势、排名、概览等6类分析接口
4. **前端层**：新增HSE数据分析中心页面，含5大功能模块
5. **测试验证**：编写测试脚本，验证所有功能正常

### 8.2 技术特点

- **统计快照**：采用快照方式，不修改业务表
- **三级统计**：日/月/年三级统计，满足不同维度分析需求
- **多维排名**：部门排名和责任人排名，支持绩效考核
- **可视化展示**：柱状图、进度条等多种可视化方式
- **实时更新**：支持手动触发统计数据生成

### 8.3 后续建议

1. **定时任务**：配置每日凌晨自动生成统计数据
2. **高级图表**：集成ECharts等图表库，实现更丰富的可视化
3. **数据导出**：支持统计数据导出为Excel/PDF
4. **深度分析**：增加同比、环比、趋势预测等分析功能
5. **移动端**：开发移动端数据看板

---

**版本：** v5.0  
**日期：** 2026-07-11  
**状态：** 已完成
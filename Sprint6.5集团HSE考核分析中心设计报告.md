# Sprint6.5 集团HSE考核分析中心设计报告

## 一、项目概述

### 1.1 建设目标

建立集团HSE考核分析中心，实现：
- **指标监控**：实时监控集团HSE核心指标完成情况
- **目标完成分析**：年度目标责任书关联与完成度分析
- **部门排名**：安全排名、风险排名、事故排名、整改排名
- **乡镇排名**：风险等级、三违情况、驾驶风险、事故情况、巡查情况
- **责任追踪**：考核扣分分析，定位责任单位与人员

### 1.2 组织层级

```
集团
  ↓
部门
  ↓
环卫作业中心
  ↓
乡镇作业中心
  ↓
片区
  ↓
班组
```

### 1.3 权限设计

| 角色 | 可见范围 |
|------|----------|
| 集团领导 | 全集团 |
| 部门经理 | 所属部门 |
| 乡镇作业中心经理 | 所属中心 |
| 片区长 | 所属片区 |

---

## 二、系统架构

### 2.1 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 前端框架 | Vue | 3.x |
| 构建工具 | Vite | 6.x |
| 语言 | TypeScript | 5.x |
| UI组件 | Ant Design Vue | 4.x |
| 图表库 | ECharts | 5.x |
| 后端框架 | Express | 4.x |
| 数据库 | PostgreSQL | 16.x |

### 2.2 模块架构

```
┌─────────────────────────────────────────────────────────────┐
│                      前端页面层                              │
├─────────────────────────────────────────────────────────────┤
│  考核分析中心主页 (index.vue)                                │
│    ├── 指标总览 (AssessmentOverview.vue)                    │
│    ├── 部门考核排名 (DepartmentRanking.vue)                 │
│    ├── 乡镇/片区排名 (TownshipRanking.vue)                   │
│    ├── 目标责任书关联 (GoalsAssociation.vue)                 │
│    └── 考核扣分分析 (DeductionAnalysis.vue)                  │
├─────────────────────────────────────────────────────────────┤
│                      API接口层                               │
├─────────────────────────────────────────────────────────────┤
│  assessment-analysis.ts                                     │
│    ├── getAssessmentOverview()                              │
│    ├── getDepartmentRanking()                               │
│    ├── getTownshipRanking()                                 │
│    ├── getAssessmentGoals()                                 │
│    └── getAssessmentDeduction()                             │
├─────────────────────────────────────────────────────────────┤
│                      后端路由层                              │
├─────────────────────────────────────────────────────────────┤
│  hse-assessment-analysis.js                                 │
│    ├── GET /overview                                        │
│    ├── GET /department-ranking                              │
│    ├── GET /township-ranking                                │
│    ├── GET /goals                                           │
│    └── GET /deduction                                       │
├─────────────────────────────────────────────────────────────┤
│                      数据访问层                              │
├─────────────────────────────────────────────────────────────┤
│  PostgreSQL Tables:                                          │
│    ├── accidents                                            │
│    ├── violation_records                                    │
│    ├── training_records                                     │
│    ├── rectification_task                                   │
│    ├── license_demerit_records                              │
│    ├── hse_employee_risk_snapshot                          │
│    ├── hse_org_unit                                         │
│    ├── employee                                             │
│    └── objective_contract                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、核心模块设计

### 3.1 集团HSE指标总览

**功能描述**：展示年度目标、当前完成值、完成率及趋势分析

**数据指标**：
- 事故起数（一般/重大）
- 三违次数（一般/严重）
- 培训完成率
- 隐患整改率
- 驾驶证扣分情况
- 员工风险评分统计

**前端组件**：`AssessmentOverview.vue`

**后端接口**：`GET /api/hse/assessment-analysis/overview`

### 3.2 部门考核排名

**功能描述**：按部门维度进行多维度排名

**排名维度**：
- 安全排名（事故+三违）
- 风险排名（风险等级分布）
- 事故排名（事故数量与等级）
- 整改排名（整改完成率）
- 综合排名（加权得分）

**评分模型**：
- 安全得分 = 100 - 事故扣分 - 三违扣分
- 风险得分 = 风险管控系数 × 基础分
- 事故得分 = 100 - 事故等级扣分
- 整改得分 = 整改完成率 × 100
- 综合得分 = 安全×0.3 + 风险×0.2 + 事故×0.3 + 整改×0.2

**前端组件**：`DepartmentRanking.vue`

**后端接口**：`GET /api/hse/assessment-analysis/department-ranking`

### 3.3 乡镇/片区考核排名

**功能描述**：按乡镇/片区维度进行综合考核

**考核维度**：
- 风险等级（员工风险评分分布）
- 三违情况（三违次数统计）
- 驾驶风险（驾驶证扣分）
- 事故情况（事故起数）
- 巡查情况（隐患整改）

**前端组件**：`TownshipRanking.vue`

**后端接口**：`GET /api/hse/assessment-analysis/township-ranking`

### 3.4 年度目标责任书关联

**功能描述**：读取年度目标责任书指标，展示目标、完成值、差距

**目标类别**：
- 安全事故类
- 三违管理类
- 培训考核类
- 隐患整改类
- 驾驶风险类
- 风险管控类

**状态判定**：
- 已完成：完成率 ≥ 100%
- 进行中：60% ≤ 完成率 < 100%
- 预警：完成率 < 60%

**前端组件**：`GoalsAssociation.vue`

**后端接口**：`GET /api/hse/assessment-analysis/goals`

### 3.5 考核扣分分析

**功能描述**：分析扣分原因、责任单位、责任人员及整改情况

**扣分维度**：
- 扣分原因分析（事故/三违/培训/整改）
- 责任单位扣分统计
- 责任人员扣分统计
- 整改状态统计

**前端组件**：`DeductionAnalysis.vue`

**后端接口**：`GET /api/hse/assessment-analysis/deduction`

---

## 四、数据库设计

### 4.1 核心数据表

| 表名 | 说明 |
|------|------|
| `accidents` | 事故记录 |
| `violation_records` | 三违记录 |
| `training_records` | 培训记录 |
| `rectification_task` | 整改任务 |
| `license_demerit_records` | 驾驶证扣分记录 |
| `hse_employee_risk_snapshot` | 员工风险快照 |
| `hse_org_unit` | 组织单元 |
| `employee` | 员工信息 |
| `employee_assignment` | 员工组织分配 |
| `objective_contract` | 目标责任书 |

### 4.2 数据关联

```
objective_contract
  ↓
hse_org_unit ─── employee_assignment ─── employee
                   ↓                          ↓
            hse_employee_risk_snapshot   license_demerit_records
                   ↓                          ↓
            violation_records          accidents
                   ↓                          ↓
            training_records           rectification_task
```

---

## 五、安全与权限

### 5.1 角色定义

| 角色编码 | 角色名称 | 权限范围 |
|----------|----------|----------|
| `admin` | 系统管理员 | 全部 |
| `safety_manager` | 安全管理员 | 全部 |
| `group_leader` | 集团领导 | 全集团 |
| `department_manager` | 部门经理 | 所属部门 |
| `township_manager` | 乡镇经理 | 所属中心 |
| `area_manager` | 片区长 | 所属片区 |

### 5.2 权限控制

后端接口通过 `req.user.role` 进行数据过滤：
- 集团领导：无过滤
- 部门经理：按部门ID过滤
- 乡镇经理：按乡镇ID过滤
- 片区长：按片区ID过滤

---

## 六、部署说明

### 6.1 后端部署

```bash
cd server
npm install
npm run start
```

### 6.2 前端部署

```bash
cd 安全看板vben/apps/web-antd
pnpm install
pnpm run build
```

### 6.3 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `PORT` | 服务端口 | 3000 |
| `DATABASE_URL` | 数据库连接串 | - |

---

## 七、文件清单

### 7.1 后端文件

| 文件路径 | 说明 |
|----------|------|
| `server/routes/hse-assessment-analysis.js` | 考核分析接口 |
| `server/app.js` | 路由注册 |

### 7.2 前端文件

| 文件路径 | 说明 |
|----------|------|
| `安全看板vben/apps/web-antd/src/api/hse/assessment-analysis.ts` | API接口定义 |
| `安全看板vben/apps/web-antd/src/views/hse/assessment-analysis/index.vue` | 主页面 |
| `安全看板vben/apps/web-antd/src/views/hse/assessment-analysis/AssessmentOverview.vue` | 指标总览 |
| `安全看板vben/apps/web-antd/src/views/hse/assessment-analysis/DepartmentRanking.vue` | 部门排名 |
| `安全看板vben/apps/web-antd/src/views/hse/assessment-analysis/TownshipRanking.vue` | 乡镇排名 |
| `安全看板vben/apps/web-antd/src/views/hse/assessment-analysis/GoalsAssociation.vue` | 目标责任书 |
| `安全看板vben/apps/web-antd/src/views/hse/assessment-analysis/DeductionAnalysis.vue` | 扣分分析 |
| `安全看板vben/apps/web-antd/src/router/routes/modules/hse-advanced.ts` | 路由配置 |

---

## 八、约束条件

- 禁止修改风险评分模型
- 禁止修改岗位权重
- 禁止修改员工主数据
- 禁止新增车辆管理模型
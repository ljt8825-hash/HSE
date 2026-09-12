# Sprint6.5-B 集团HSE考核分析系统设计报告

## 一、系统概述

### 1.1 建设目标
建设集团HSE考核分析中心，实现集团考核展示、组织排名、指标分析、目标责任书完成情况、责任追踪等核心功能，为集团各级管理者提供统一、可视化的HSE考核数据决策支持平台。

### 1.2 模型版本
- 基于**冻结模型v1.1**开发
- 从 `hse_assessment_model_version` 表读取模型版本
- 严格遵守Sprint6.5阶段开发约束，不修改既有考核模型与权重规则

### 1.3 业务范围
- 覆盖集团所有部门、环卫作业中心、乡镇作业中心、片区组织
- 支持事故、三违、风险、驾驶、整改、管理履职六大指标分类
- 集成目标责任书跟踪与扣分原因深度分析

## 二、系统架构

### 2.1 技术栈

| 层级 | 技术选型 |
|------|----------|
| 后端 | Node.js + Express + PostgreSQL |
| 前端 | Vue3 + Vite + TypeScript + Ant Design Vue + ECharts |
| 认证 | JWT（req.user.role 获取角色） |
| 数据可视化 | ECharts 5.x |
| UI组件库 | Ant Design Vue 4.x |

### 2.2 模块架构

| 模块 | 技术实现 |
|------|----------|
| 后端路由 | server/routes/hse-assessment.js |
| 前端API | api/hse/assessment.ts |
| 前端页面 | views/hse/assessment-analysis/ |
| 路由配置 | router/routes/modules/hse-advanced.ts |
| 数据访问 | server/db/index.js（PostgreSQL连接池） |
| 认证中间件 | server/middleware/auth.js |

### 2.3 系统层次
```
┌─────────────────────────────────────────┐
│  前端展示层 (Vue3 + Ant Design Vue)      │
├─────────────────────────────────────────┤
│  API 接入层 (axios + TypeScript)         │
├─────────────────────────────────────────┤
│  路由控制层 (Express Router + JWT)       │
├─────────────────────────────────────────┤
│  业务逻辑层 (考核计算/排名/分析)          │
├─────────────────────────────────────────┤
│  数据持久层 (PostgreSQL)                 │
└─────────────────────────────────────────┘
```

## 三、接口设计

### 3.1 接口清单

| 方法 | 路径 | 功能 | 权限 |
|------|------|------|------|
| GET | /api/hse/assessment/overview | 集团HSE考核总览 | 全部角色 |
| GET | /api/hse/assessment/ranking | 组织考核排名 | 全部角色（数据按角色过滤） |
| GET | /api/hse/assessment/indicator-analysis | 指标分析 | 全部角色 |
| GET | /api/hse/assessment/target-progress | 目标责任书完成情况 | 全部角色 |
| GET | /api/hse/assessment/deduction-detail | 扣分原因分析 | 全部角色 |

### 3.2 接口详细说明

#### 3.2.1 集团HSE考核总览
- **路径**：`GET /api/hse/assessment/overview`
- **查询参数**：`year`（年份，默认当前年）
- **返回数据**：年度考核得分、等级、趋势、排名、网格长巡查统计、事故双轴图数据
- **数据来源**：hse_assessment_scores、hse_accident_records、hse_inspection_logs

#### 3.2.2 组织考核排名
- **路径**：`GET /api/hse/assessment/ranking`
- **查询参数**：`year`、`level`（department/center/township/area）、`filterType`
- **返回数据**：组织列表、综合得分、主要扣分项、事故数、三违数、员工数
- **角色过滤**：根据 req.user.role 自动应用 filterType

#### 3.2.3 指标分析
- **路径**：`GET /api/hse/assessment/indicator-analysis`
- **查询参数**：`year`、`category`（accident/violation/risk/driving/rectification/management）
- **返回数据**：指标列表、得分、状态（优秀/良好/预警/危险）、同比环比

#### 3.2.4 目标责任书完成情况
- **路径**：`GET /api/hse/assessment/target-progress`
- **查询参数**：`year`
- **返回数据**：9项目标完成情况、完成率、责任层级、责任书版本信息

#### 3.2.5 扣分原因分析
- **路径**：`GET /api/hse/assessment/deduction-detail`
- **查询参数**：`year`、`category`
- **返回数据**：5个扣分类别详情、总扣分、数据来源、责任对象

## 四、权限设计

### 4.1 角色权限矩阵

| 角色 | 权限范围 | 数据过滤 |
|------|----------|----------|
| group_leader（集团领导） | 查看全集团 | 无过滤 |
| department_manager（部门经理） | 查看部门 | filterType=department |
| area_manager（片区长） | 查看片区 | filterType=area |
| township_manager（乡镇经理） | 查看乡镇 | filterType=township |
| safety_manager（安全管理员） | 查看全集团 | 无过滤 |
| admin（管理员） | 查看责任网格 | 无过滤 |

### 4.2 权限实现机制
- 通过 JWT Token 解析用户角色，存储于 `req.user.role`
- 在 ranking 接口中根据角色自动注入 filterType 参数
- 其他接口提供全集团视图，由前端控制展示层级
- 权限校验中间件统一拦截未授权访问

## 五、评分模型集成

### 5.1 模型版本管理
- 从 `hse_assessment_model_version` 表读取 `status='active'` 的版本记录
- 当前激活版本：**v1.1 冻结规则**
- 版本信息包含：版本号、生效日期、规则配置JSON、状态

### 5.2 部门考核权重（v1.1冻结）

| 指标分类 | 权重 |
|----------|------|
| 安全 | 20% |
| 风险 | 15% |
| 事故 | 25% |
| 整改 | 15% |
| 管理 | 25% |

### 5.3 乡镇考核权重（v1.1冻结）

| 指标分类 | 权重 |
|----------|------|
| 风险 | 15% |
| 三违 | 15% |
| 驾驶 | 15% |
| 事故 | 20% |
| 巡查 | 15% |
| 管理 | 20% |

### 5.4 关键规则常量
- **驾驶风险周期**：统一近5年周期
- **事故等级权重**：

| 事故等级 | 权重系数 |
|----------|----------|
| 轻微 | 1 |
| 一般 | 3 |
| 较大 | 6 |
| 重大 | 10 |
| 特别重大 | 15 |

### 5.5 规则读取流程
```
1. 查询 hse_assessment_model_version 表
2. 过滤 status='active' 记录
3. 解析 rule_config JSON
4. 应用权重计算综合得分
5. 按角色过滤数据范围
6. 返回分析结果
```

## 六、开发约束遵守

### 6.1 约束执行情况

| 约束项 | 遵守情况 |
|--------|----------|
| 不修改员工风险模型 | ✅ |
| 不修改岗位权重 | ✅ |
| 不修改考核模型v1.1 | ✅ |
| 规则读取hse_assessment_model_version | ✅ |

### 6.2 约束说明
- **员工风险模型**：保持现有 `employee_risk_score` 计算逻辑不变，仅读取不修改
- **岗位权重**：维持 `position_weight` 表配置不变，仅在排名计算时引用
- **考核模型v1.1**：所有权重与规则常量严格遵循冻结版本，不进行任何调整
- **版本表读取**：所有评分计算必须先查询 `hse_assessment_model_version` 获取当前激活规则

## 七、文档信息

- **文档版本**：v1.0
- **生成日期**：2026年7月
- **所属阶段**：Sprint6.5-B
- **适用范围**：集团HSE考核分析系统开发与实施

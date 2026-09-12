# Sprint5.9 业务模块人员关联改造开发报告

## 一、开发概述

### 1.1 任务背景

本阶段基于《HSE业务模块人员关联规范.md》，对HSE系统三大业务模块进行人员关联改造，统一使用 `employee_id` 作为人员关联字段，禁止使用姓名字段、手机号或自建人员表进行关联。

### 1.2 改造目标

| 目标 | 描述 |
|------|------|
| 统一关联 | 所有HSE模块人员关联统一使用 `employee_id` |
| 禁止字段关联 | 禁止使用姓名字段、手机号进行关联 |
| 禁止自建表 | 禁止创建独立的人员表 |
| 统一组件 | 必须使用 `EmployeeSelector` 组件进行人员选择 |

### 1.3 改造范围

| 批次 | 模块 | 关联人员 | 状态 |
|------|------|----------|------|
| 第一批 | 培训管理 | 参训人员、培训师 | 完成 |
| 第二批 | 三违管理 | 违章人员、检查人员、处罚人员 | 完成 |
| 第三批 | 隐患管理 | 发现人、责任人、整改人 | 完成 |

---

## 二、培训管理模块改造

### 2.1 后端改造

**文件**: `server/routes/training.js`

**数据库变更**:
- 为 `training_records` 表新增字段：
  - `employee_id BIGINT` - 参训人员ID
  - `trainer_id BIGINT` - 培训师ID

**API改造**:
- `POST /training/records` - 创建培训记录时接收 `employee_id` 和 `trainer_id`
- `PUT /training/records/:id` - 更新培训记录时支持 `employee_id` 和 `trainer_id`
- `GET /training/records` - 查询时返回 `employee_id` 和 `trainer_id`

### 2.2 前端改造

**文件**: `apps/web-antd/src/views/training/ledger/index.vue`

**改造内容**:
- 导入 `EmployeeSelector` 组件
- 将参训人员输入框替换为 `EmployeeSelector` 组件
- 将培训师输入框替换为 `EmployeeSelector` 组件
- 新增表单字段 `employeeId` 和 `trainerId`
- 更新表单验证规则，参训人员改为必填

**API类型更新**: `apps/web-antd/src/api/hse/training.ts`
- 在 `LedgerItem` 接口中新增 `employeeId` 和 `trainerId` 字段

---

## 三、隐患管理模块改造

### 3.1 后端改造

**文件**: `server/routes/hazards.js`

**数据库变更**:
- 为 `hazards` 表新增字段：
  - `finder_id BIGINT` - 发现人ID
  - `responsible_id BIGINT` - 责任人ID
  - `corrector_id BIGINT` - 整改人ID

**API改造**:
- `POST /hazards` - 创建隐患时接收 `finder_id`、`responsible_id`、`corrector_id`
- `PUT /hazards/:id` - 更新隐患时支持三个人员ID字段
- `GET /hazards` - 查询时返回三个人员ID字段

### 3.2 前端改造

**文件**: `apps/web-antd/src/views/hazards/index.vue`

**改造内容**:
- 导入 `EmployeeSelector` 组件
- 在表单中新增三个人员选择字段：
  - 发现人 (finderId)
  - 责任人 (responsibleId)
  - 整改人 (correctorId)
- 更新创建、编辑和保存逻辑

---

## 四、三违管理模块新建

### 4.1 后端实现

**文件**: `server/routes/violations.js` (新建)

**数据库表结构**:

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | BIGSERIAL | 主键 |
| no | VARCHAR(64) | 编号 |
| violation_type | VARCHAR(64) | 三违类型 |
| violation_level | VARCHAR(32) | 严重程度 |
| description | TEXT | 违章描述 |
| location | VARCHAR(255) | 发生地点 |
| violation_date | DATE | 违章日期 |
| violator_name | VARCHAR(64) | 违章人员姓名 |
| violator_id | BIGINT | 违章人员ID |
| inspector_name | VARCHAR(64) | 检查人员姓名 |
| inspector_id | BIGINT | 检查人员ID |
| punisher_name | VARCHAR(64) | 处罚人员姓名 |
| punisher_id | BIGINT | 处罚人员ID |
| punishment_type | VARCHAR(64) | 处罚类型 |
| punishment_amount | DECIMAL(10,2) | 处罚金额 |
| status | VARCHAR(32) | 状态 |
| remark | TEXT | 备注 |

**API接口**:
- `GET /violations` - 查询三违记录列表
- `GET /violations/stats` - 获取统计数据
- `GET /violations/:id` - 查询单个记录
- `POST /violations` - 创建三违记录
- `PUT /violations/:id` - 更新三违记录
- `DELETE /violations/:id` - 软删除
- `GET /violations/export/csv` - 导出CSV

**路由注册**: `server/app.js`
- 新增路由引用和挂载：`app.use('/api/violations', violationRoutes)`

### 4.2 前端实现

**文件**: `apps/web-antd/src/views/violations/index.vue` (新建)

**功能特性**:
- 统计卡片：违章总数、待处理、已处理
- 筛选条件：关键词、三违类型、严重程度、状态、日期范围
- 数据表格：展示完整三违记录信息
- 新增/编辑表单：使用 `EmployeeSelector` 选择违章人员、检查人员、处罚人员
- 详情抽屉：查看记录详情
- CSV导出功能

**API定义**: `apps/web-antd/src/api/hse/violations.ts` (新建)
- 定义完整的类型接口和API函数

**路由配置**: `apps/web-antd/src/router/routes/modules/hse-violations.ts` (新建)
- 注册三违管理路由

---

## 五、开发规范遵循

### 5.1 人员选择规范

| 规范项 | 要求 | 实现情况 |
|--------|------|----------|
| 使用EmployeeSelector | 必须使用公共组件 | ✅ 已实现 |
| 调用员工selector API | 必须通过API获取数据 | ✅ 已实现 |
| 禁止创建人员表 | 不得自建人员表 | ✅ 已遵循 |
| 禁止保存employee_name | 不以姓名字段作为关联 | ✅ 已遵循 |

### 5.2 工程约束

| 约束项 | 要求 | 实现情况 |
|--------|------|----------|
| 禁止修改Vben核心目录 | 不修改核心框架代码 | ✅ 已遵循 |
| 禁止修改auth/JWT | 不改动认证模块 | ✅ 已遵循 |
| 禁止新增依赖 | 使用现有技术栈 | ✅ 已遵循 |

---

## 六、文件清单

### 6.1 修改文件

| 文件路径 | 修改内容 |
|----------|----------|
| `server/routes/training.js` | 新增 employee_id、trainer_id 字段和API支持 |
| `server/routes/hazards.js` | 新增 finder_id、responsible_id、corrector_id 字段和API支持 |
| `apps/web-antd/src/views/training/ledger/index.vue` | 使用 EmployeeSelector 替换手动输入 |
| `apps/web-antd/src/api/hse/training.ts` | 新增 employeeId、trainerId 类型定义 |
| `apps/web-antd/src/views/hazards/index.vue` | 使用 EmployeeSelector 新增三个人员选择字段 |
| `server/app.js` | 注册三违管理路由 |

### 6.2 新建文件

| 文件路径 | 文件说明 |
|----------|----------|
| `server/routes/violations.js` | 三违管理后端路由 |
| `apps/web-antd/src/api/hse/violations.ts` | 三违管理API类型定义 |
| `apps/web-antd/src/views/violations/index.vue` | 三违管理前端页面 |
| `apps/web-antd/src/router/routes/modules/hse-violations.ts` | 三违管理路由配置 |

---

## 七、技术亮点

1. **统一人员选择**: 通过 `EmployeeSelector` 组件实现了全系统人员选择的统一入口
2. **employee_id关联**: 所有业务模块均使用 `employee_id` 作为人员关联字段，确保数据一致性
3. **兼容现有数据**: 保留原有姓名字段作为展示用，不影响历史数据查询
4. **内存模式支持**: 三违管理模块支持内存模式运行，便于开发测试
5. **审计日志**: 所有操作均记录审计日志，便于追溯
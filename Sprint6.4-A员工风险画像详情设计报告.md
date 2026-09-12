# Sprint6.4-A 员工风险画像详情设计报告

## 一、阶段概述

### 1.1 阶段目标
开发员工风险画像详情页面，为HSE综合驾驶舱提供员工级风险详情查看能力。

### 1.2 前置依赖
- Sprint6.1 风险模型建设
- Sprint6.2 风险等级计算
- Sprint6.3-A 驾驶舱指标体系
- Sprint6.3-B-1 后端接口
- Sprint6.3-B-2 HSE综合驾驶舱

### 1.3 冻结项
- employee_assignment 员工关系模型
- employee_id 风险主体
- risk_score_records
- risk_level_records
- risk_score_history
- risk_level_config

---

## 二、技术栈

### 2.1 后端技术栈
- Node.js + Express
- PostgreSQL
- 已有路由注册机制

### 2.2 前端技术栈
- Vue3 + TypeScript + Vite
- Element Plus (Ant Design Vue)
- ECharts (@vben/plugins/echarts)
- Vue Router
- Pinia

---

## 三、开发内容

### 3.1 后端接口开发

**新增文件**: `server/routes/hse-risk-profile-detail.js`

**接口列表**:
| 接口路径 | 方法 | 功能 |
|---------|------|------|
| `/api/hse/risk/profile/{employee_id}` | GET | 员工风险画像详情 |
| `/api/hse/risk/profile/{employee_id}/trend` | GET | 员工风险趋势 |

**数据来源**:
- employee 表 - 员工基础信息
- employee_assignment 表 - 当前组织信息
- hse_employee_risk_snapshot 表 - 风险评分快照
- risk_level_config 表 - 风险等级配置
- violations 表 - 三违记录
- driver_records 表 - 驾驶证扣分记录
- hse_inspection_records 表 - 三检记录
- accidents 表 - 事故记录
- employee_training_records 表 - 培训记录
- employee_training_status 表 - 培训合规状态
- employee_induction_training 表 - 三级安全教育
- grid_areas 表 - 网格巡查

### 3.2 前端API封装

**新增文件**: `src/api/hse/risk-profile-detail.ts`

**TypeScript类型定义**:
- BasicInfo - 员工基础信息
- RiskOverview - 风险总览
- RiskComposition - 风险构成
- RiskEvents - 风险事件明细
- TrainingStatus - 培训状态
- TrendData - 趋势数据

**API方法**:
- `getProfileDetail(employeeId)` - 获取员工风险画像详情
- `getProfileTrend(employeeId, period)` - 获取员工风险趋势

### 3.3 前端组件开发

**新增组件目录**: `src/views/hse/risk-profile-detail/`

| 组件 | 说明 |
|------|------|
| `BasicInfo.vue` | 员工基础信息模块 |
| `RiskOverview.vue` | 风险总览模块 |
| `RiskComposition.vue` | 风险构成模块 |
| `RiskEvents.vue` | 风险事件明细模块 |
| `RiskTrend.vue` | 风险趋势模块 |
| `index.vue` | 主页面集成 |

### 3.4 路由配置

**修改文件**: `src/router/routes/modules/hse-advanced.ts`

```typescript
{
  name: 'HseRiskProfileDetail',
  path: '/hse-advanced/risk-profile/:employeeId',
  component: () => import('#/views/hse/risk-profile-detail/index.vue'),
  meta: {
    title: '员工风险画像详情',
    authority: ['admin', 'safety_manager', 'group_leader', 'department_manager', 'township_manager', 'area_manager'],
    hideInMenu: true,
  },
}
```

---

## 四、页面模块设计

### 4.1 员工基础信息

**展示内容**:
- 头像
- 姓名
- 员工编号
- 部门
- 岗位
- 作业单元
- 人员状态
- 人员类别
- 人员性质
- 联系方式（脱敏）
- 身份证号（脱敏）

**设计要点**:
- 响应式布局
- 敏感信息脱敏展示
- 状态标签颜色区分

### 4.2 风险总览

**展示内容**:
- 综合风险积分（环形图）
- 风险等级（颜色区分）
- 风险趋势
- 风险排名
- 计算时间

**设计要点**:
- 环形进度条展示积分
- 风险等级颜色：低绿/一般黄/较高橙/重大红

### 4.3 风险构成

**展示内容**:
- 三违风险（权重30%）
- 驾驶风险（权重10%，仅驾驶员）
- 事故风险（权重25%）
- 培训风险（权重20%）
- 管理履职风险（权重15%，仅网格长）

**设计要点**:
- 进度条展示各维度分数
- 不适用维度灰色显示
- 显示原始值和权重

### 4.4 风险事件明细

**展示内容**:
- 三违记录（近12个月）
- 驾驶证扣分记录（近5年）
- 三检记录
- 事故记录
- 培训记录

**设计要点**:
- Tab切换不同类型
- 记录数量徽章
- 状态标签颜色区分

### 4.5 风险趋势

**展示内容**:
- 日趋势
- 周趋势
- 月趋势

**设计要点**:
- ECharts折线图
- 展示平均/最高/最低积分
- 支持周期切换

---

## 五、权限设计

### 5.1 路由权限

| 角色 | 权限 |
|------|------|
| admin | 查看所有 |
| safety_manager | 查看所有 |
| group_leader | 查看全集团 |
| department_manager | 查看本部门 |
| township_manager | 查看所属中心 |
| area_manager | 查看所属片区 |

### 5.2 数据权限
数据范围由后端根据登录用户角色控制，前端不做过滤。

---

## 六、约束遵守

- ✅ 未修改风险评分模型
- ✅ 未修改岗位权重
- ✅ 未修改employee表
- ✅ 未新增车辆管理模块

---

## 七、文件清单

| 文件路径 | 类型 | 说明 |
|---------|------|------|
| `server/routes/hse-risk-profile-detail.js` | 后端 | 员工风险画像详情接口 |
| `server/app.js` | 后端 | 注册新路由 |
| `src/api/hse/risk-profile-detail.ts` | 前端API | API封装和类型定义 |
| `src/views/hse/risk-profile-detail/BasicInfo.vue` | 组件 | 员工基础信息 |
| `src/views/hse/risk-profile-detail/RiskOverview.vue` | 组件 | 风险总览 |
| `src/views/hse/risk-profile-detail/RiskComposition.vue` | 组件 | 风险构成 |
| `src/views/hse/risk-profile-detail/RiskEvents.vue` | 组件 | 风险事件明细 |
| `src/views/hse/risk-profile-detail/RiskTrend.vue` | 组件 | 风险趋势 |
| `src/views/hse/risk-profile-detail/index.vue` | 页面 | 主页面 |
| `src/router/routes/modules/hse-advanced.ts` | 路由 | 路由配置 |
# Sprint6.4-B 驾驶员专项风险中心设计报告

## 一、阶段概述

### 1.1 阶段目标
建立集团驾驶员专项安全风险管理中心，针对驾驶员岗位人员提供专项风险分析和管理能力。

### 1.2 前置依赖
- Sprint6.1 风险模型建设
- Sprint6.2 风险计算
- Sprint6.3 HSE综合驾驶舱
- Sprint6.4-A 员工风险画像详情页

### 1.3 冻结项
- employee_assignment 员工关系模型
- employee_id 风险主体
- 风险评分模型
- 驾驶风险模型
- 驾驶证扣分周期（近5年）
- 三检数据来源（Excel导入）
- 事故数据模型

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

**新增文件**: `server/routes/hse-driver-risk-center.js`

**接口列表**:

| 接口路径 | 方法 | 功能 |
|---------|------|------|
| `/api/hse/driver-risk-center/overview` | GET | 驾驶员专项总览 |
| `/api/hse/driver-risk-center/drivers` | GET | 驾驶员风险列表 |
| `/api/hse/driver-risk-center/demerit/statistics` | GET | 驾驶证扣分统计 |
| `/api/hse/driver-risk-center/accident/statistics` | GET | 交通事故统计 |

**驾驶员识别规则**:
- 通过岗位名称自动识别，包含"驾驶员"或"司机"关键词
- 禁止人工维护驾驶员名单

### 3.2 前端API封装

**新增文件**: `src/api/hse/driver-risk-center.ts`

**TypeScript类型定义**:
- OverviewData - 总览数据
- DriverListItem - 驾驶员列表项
- DemeritStatisticsData - 扣分统计数据
- AccidentStatisticsData - 事故统计数据

**API方法**:
- `getDriverRiskOverview()` - 获取驾驶员风险总览
- `getDriverList(params)` - 获取驾驶员列表
- `getDemeritStatistics()` - 获取扣分统计
- `getAccidentStatistics()` - 获取事故统计

### 3.3 前端组件开发

**新增组件目录**: `src/views/hse/driver-risk-center/`

| 组件 | 说明 |
|------|------|
| `RiskOverview.vue` | 驾驶风险总览（4个指标卡片） |
| `LevelDistribution.vue` | 风险等级分布（环形图） |
| `RiskComposition.vue` | 驾驶风险构成（进度条） |
| `DemeritAnalysis.vue` | 驾驶证扣分分析（饼图+TOP列表） |
| `AccidentAnalysis.vue` | 交通事故分析（分布+趋势） |
| `TopRanking.vue` | 驾驶员TOP风险排行 |
| `index.vue` | 主页面集成 |

### 3.4 路由配置

**修改文件**: `src/router/routes/modules/hse-advanced.ts`

```typescript
{
  name: 'HseDriverRiskCenter',
  path: '/hse-advanced/driver-risk-center',
  component: () => import('#/views/hse/driver-risk-center/index.vue'),
  meta: {
    title: '驾驶员风险中心',
    icon: 'lucide:car',
    authority: ['admin', 'safety_manager', 'group_leader', 'department_manager', 'township_manager', 'area_manager'],
  },
}
```

---

## 四、页面模块设计

### 4.1 驾驶风险总览

**展示内容**:
- 驾驶员数量
- 高风险驾驶员数量
- 有扣分记录人数
- 涉事故驾驶员人数

**设计要点**:
- 4个指标卡片，横向排列
- 不同指标使用不同主题色
- 悬停动效

### 4.2 风险等级分布

**展示内容**:
- 低风险/一般风险/较高风险/重大风险
- 环形图展示
- 图例显示各等级人数和占比

**设计要点**:
- 等级颜色：低绿/一般黄/较高橙/重大红
- ECharts环形图
- 右侧图例列表

### 4.3 驾驶风险构成

**展示内容**:
- 驾驶证扣分（近5年有扣分记录）
- 交通事故（涉交通事故人数）
- 三检情况（有三检记录人数）
- 培训情况（有培训记录人数）

**设计要点**:
- 进度条展示占比
- 各维度不同颜色
- 显示人数和副标题

### 4.4 驾驶证扣分分析

**展示内容**:
- 扣分人数、扣分次数、累计扣分、单次平均
- 扣分分布（饼图）
- TOP扣分驾驶员列表

**数据周期**: 近5年

**设计要点**:
- 4个统计指标顶部排列
- 左侧饼图展示扣分分布
- 右侧TOP10驾驶员列表
- 点击驾驶员可跳转详情页

### 4.5 交通事故分析

**展示内容**:
- 事故总数、涉事人数、责任事故数
- 事故等级分布（环形图）
- 年度趋势（柱状图）

**设计要点**:
- 3个统计指标顶部排列
- 左侧等级分布
- 右侧年度趋势

### 4.6 驾驶员TOP风险排行

**展示内容**:
- TOP10驾驶员
- 排名徽章（前三名特殊样式）
- 驾驶员姓名、岗位、部门
- 综合风险积分
- 风险等级
- 扣分分数、事故数

**设计要点**:
- 列表形式
- 前三名渐变徽章
- 点击跳转员工风险画像详情页

---

## 五、权限设计

### 5.1 路由权限

| 角色 | 权限 |
|------|------|
| admin | 查看全部 |
| safety_manager | 查看全部 |
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
- ✅ 未新增车辆管理模块
- ✅ 车辆绑定仅作为辅助信息
- ✅ 驾驶员通过岗位模型自动识别，禁止人工维护

---

## 七、文件清单

| 文件路径 | 类型 | 说明 |
|---------|------|------|
| `server/routes/hse-driver-risk-center.js` | 后端 | 驾驶员风险中心接口 |
| `server/app.js` | 后端 | 注册新路由 |
| `src/api/hse/driver-risk-center.ts` | 前端API | API封装和类型定义 |
| `src/views/hse/driver-risk-center/RiskOverview.vue` | 组件 | 风险总览 |
| `src/views/hse/driver-risk-center/LevelDistribution.vue` | 组件 | 等级分布 |
| `src/views/hse/driver-risk-center/RiskComposition.vue` | 组件 | 风险构成 |
| `src/views/hse/driver-risk-center/DemeritAnalysis.vue` | 组件 | 扣分分析 |
| `src/views/hse/driver-risk-center/AccidentAnalysis.vue` | 组件 | 事故分析 |
| `src/views/hse/driver-risk-center/TopRanking.vue` | 组件 | TOP排行 |
| `src/views/hse/driver-risk-center/index.vue` | 页面 | 主页面 |
| `src/router/routes/modules/hse-advanced.ts` | 路由 | 路由配置 |
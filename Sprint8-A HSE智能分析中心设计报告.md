# Sprint8-A HSE智能分析中心设计报告

## 一、项目概述

Sprint8-A 在 HSE 管理平台已形成的完整闭环（风险识别 → 风险分析 → 考核评价 → 预警 → 整改 → 效果验证）基础上，建设智能分析中心，利用历史 HSE 数据实现趋势分析、风险预测、异常识别与管理洞察能力。

本次迭代聚焦于"数据价值挖掘"，不改动任何已有模型，仅通过读取 employee_risk、driver_risk、accident、assessment、warning、rectification 等数据源，构建面向决策的分析服务层。

## 二、建设目标

### 2.1 总体目标

```
历史HSE数据 → 智能分析中心 → 决策洞察
     ↓              ↓              ↓
 趋势分析     风险预测     异常识别
                              ↓
                         管理洞察
```

### 2.2 具体目标

1. **风险趋势分析**：追踪员工、组织、驾驶风险的历史变化轨迹
2. **事故趋势分析**：洞察事故类型、频率、原因的演变规律
3. **整改效果分析**：衡量整改有效率、重复风险率、整改周期
4. **组织风险画像**：形成部门/中心/片区/网格的多维度风险画像
5. **风险预测模型**：基于历史数据预测未来风险走向，识别异常

## 三、版本基线

| 模块 | 版本 | 说明 |
| --- | --- | --- |
| 预警规则 | v1.1 | 保持不变 |
| 权限模型 | v1.1 | 保持不变 |
| 预警中心 | v1.0 | Sprint7-B 交付 |
| 整改闭环 | v1.0 | Sprint7-C 交付 |
| 智能分析中心 | v1.0 | Sprint8-A 新增 |

## 四、系统架构

### 4.1 架构定位

```
┌─────────────────────────────────────────────┐
│              HSE 前端 (Vben)                │
│  ┌─────────────────────────────────────────┐ │
│  │         analysis-center.ts (API层)       │ │
│  └─────────────────────────────────────────┘ │
└──────────────────┬──────────────────────────┘
                   │ /api/hse/analysis-center
┌──────────────────▼──────────────────────────┐
│          HSE 后端 (Express)                  │
│  ┌─────────────────────────────────────────┐ │
│  │    hse-analysis-center.js (路由层)       │ │
│  │  ┌────────────────────────────────────┐ │ │
│  │  │     数据聚合与计算辅助函数         │ │ │
│  │  │  - computeOrgPortrait              │ │ │
│  │  │  - computePrediction               │ │ │
│  │  │  - detectAbnormal                  │ │ │
│  │  │  - collectHistoryData              │ │ │
│  │  └────────────────────────────────────┘ │ │
│  └─────────────────────────────────────────┘ │
└──────────────────┬──────────────────────────┘
                   │ 读取
┌──────────────────▼──────────────────────────┐
│           HSE 数据库 (PostgreSQL)            │
│  ┌──────────────┐  ┌──────────────────────┐ │
│  │ hse_analysis_ │  │  hse_risk_prediction  │ │
│  │   snapshot    │  │                      │ │
│  └──────────────┘  └──────────────────────┘ │
│  ┌──────────────┐  ┌──────────────────────┐ │
│  │ v_org_risk_   │  │  v_accident_trend    │ │
│  │   portrait    │  │                      │ │
│  └──────────────┘  └──────────────────────┘ │
│  ┌──────────────────────────────────────┐   │
│  │      已有数据源（只读）              │   │
│  │ employee_risk / driver_risk /        │   │
│  │ accident / assessment / warning /    │   │
│  │ rectification                        │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### 4.2 数据流

1. **实时计算优先**：当快照表无数据时，实时从已有数据源聚合计算
2. **快照缓存**：周期性将分析结果写入 hse_analysis_snapshot，供快速对比
3. **预测计算**：基于历史数据执行线性回归预测，结果写入 hse_risk_prediction
4. **异常识别**：计算标准差、趋势斜率等指标，自动标记异常

## 五、功能模块设计

### 5.1 模块一：风险趋势分析

#### 功能说明

追踪员工风险、组织风险、驾驶风险随时间的变化趋势，支持多周期聚合（周/月/季/年）。

#### API 列表

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/risk-trend` | 全局风险趋势概览 |
| GET | `/risk-trend/:target_type/:target_id` | 单对象风险历史趋势 |

#### 核心逻辑

- **周期聚合**：使用 `DATE_TRUNC` 按周/月/季/年聚合风险快照
- **趋势计算**：环比变化率 = (当期 - 上期) / 上期 × 100%
- **趋势判定**：变化率 > 5% 为上升，< -5% 为下降，其他为稳定
- **移动平均**：3 个月移动平均线平滑波动
- **实时回退**：当快照表为空时，实时从 hse_employee_risk_snapshot 聚合计算

#### 输出指标

| 指标 | 计算方式 | 说明 |
| --- | --- | --- |
| 平均员工风险分 | AVG(total_score) | 整体员工风险水平 |
| 高风险员工数 | COUNT(level=serious) | 需要重点关注的员工数量 |
| 趋势变化率 | 环比计算 | 衡量风险变化幅度 |
| 移动平均值 | 3个月滚动平均 | 平滑短期波动 |
| 预测下一周期 | 线性外推 | 预判风险走向 |

### 5.2 模块二：事故趋势分析

#### 功能说明

多维度分析事故的类型分布、频率变化、严重程度趋势和重复事故模式。

#### API 列表

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/accident-trend` | 事故趋势分析 |
| GET | `/accident-repeat` | 重复事故专项分析 |

#### 核心逻辑

- **分组聚合**：支持按事故类型(category)、等级(level)、原因(cause)三维分组
- **重复事故识别**：同一地点+类型30天内重复发生视为重复事故
- **严重度指数**：加权计算 avg_severity，轻微=1、一般=3、较大=6、重大=10、特别重大=15
- **月度频率**：计算月均事故发生率

#### 输出指标

| 指标 | 计算方式 | 说明 |
| --- | --- | --- |
| 事故总数 | COUNT(*) | 周期内事故总量 |
| 重大事故数 | COUNT(level in 重大/特别重大) | 严重程度事故数 |
| 累计伤亡 | SUM(casualties/injuries) | 人员伤害统计 |
| 加权严重度 | AVG(level权重) | 综合严重程度 |
| 重复事故率 | 重复组数/总组数 | 隐患重复性 |
| 月均发生率 | 总数/月数 | 事故频率基准 |

### 5.3 模块三：整改效果分析

#### 功能说明

评估整改任务的执行质量，包括有效率、重复率、周期等维度。

#### API 列表

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/rectification-analysis` | 整改效果分析 |

#### 核心逻辑

- **有效性计算**：按时关闭率 + 效果评价综合分
- **重复率计算**：同一对象/预警的复发比例
- **周期计算**：创建到关闭的平均天数
- **来源分析**：按预警来源（员工/驾驶/事故/考核/管理）拆分

#### 输出指标

| 指标 | 计算方式 | 说明 |
| --- | --- | --- |
| 整改有效率 | 按时关闭数/总数×100% | 整改及时性 |
| 重复风险率 | 效果评价repeat_rate均值 | 整改根治性 |
| 平均周期 | AVG(关闭-创建) | 整改时效性 |
| 改善率 | level_improved数/评价数×100% | 风险实际改善 |
| 分来源整改率 | 各来源整改完成数/预警数 | 分维度整改差异 |

### 5.4 模块四：组织风险画像

#### 功能说明

按组织层级（部门/中心/片区/网格）聚合风险数据，形成多维度风险画像。

#### API 列表

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/org-portrait` | 组织画像列表 |
| GET | `/org-portrait/:org_type/:org_id` | 单个组织画像详情 |

#### 核心逻辑

- **多维度聚合**：每个组织聚合员工风险、预警、事故数据
- **风险评级**：综合评分+高风险占比 → 重大/较大/一般/低风险
- **五维画像**：违章/驾驶/培训/事故/管理五个扣分维度
- **权限过滤**：按用户角色过滤可见组织范围

#### 输出指标

| 指标 | 说明 |
| --- | --- |
| 员工数 | 组织内覆盖员工总数 |
| 平均风险分 | AVG(total_score) |
| 风险等级 | 综合评级 |
| 五维扣分 | 违章/驾驶/培训/事故/管理 |
| 预警统计 | 总数/活跃/关闭/升级 |
| 子组织列表 | 下级组织画像链接 |
| 历史趋势 | 近12月平均分走势 |

### 5.5 模块五：风险预测模型

#### 功能说明

基于历史数据执行风险预测和异常识别，辅助决策预判。

#### API 列表

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/predict` | 执行风险预测 |
| GET | `/predictions` | 查询历史预测列表 |
| GET | `/predictions/:id` | 查询预测详情 |
| GET | `/abnormal` | 异常识别结果列表 |

#### 核心逻辑

- **线性回归预测**：基于历史风险分计算趋势斜率，外推预测未来值
- **置信度计算**：R² 决定预测可靠性
- **异常检测**：标准差异常（>2σ）、趋势突变（斜率>阈值）、事故激增
- **贡献因子**：识别影响最大的风险因素

#### 预测模型参数

| 参数 | 说明 |
| --- | --- |
| prediction_type | risk_trend / accident / risk_level / abnormal |
| prediction_model | trend（趋势外推） |
| months | 预测未来月数 |
| baseline_avg | 历史基线均值 |
| baseline_stddev | 历史基线标准差 |
| trend_slope | 趋势斜率 |
| predicted_confidence | 预测置信度（R²×100%） |

#### 异常识别规则

| 规则 | 条件 | 异常程度 |
| --- | --- | --- |
| 趋势上升 | slope > 0 | 10-30% |
| 低置信度 | confidence < 50% | 40% |
| 高分波动 | stddev > 15 | min(100, stddev×3) |
| 突发偏离 | |lastScore - mean| > 2σ | 60% |
| 事故激增 | 月事故 > 5 | 70% |

## 六、数据库设计

### 6.1 新增表

#### hse_analysis_snapshot（分析快照表）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | BIGSERIAL | 主键 |
| snapshot_date | DATE | 快照日期 |
| snapshot_period | VARCHAR(16) | 快照周期（weekly/monthly/quarterly/yearly） |
| analysis_type | VARCHAR(32) | 分析类型（risk_trend/accident_trend/rectification/org_portrait） |
| employee_risk_score | NUMERIC(10,2) | 员工风险平均分 |
| employee_risk_high | INTEGER | 高风险员工数 |
| employee_risk_medium | INTEGER | 中风险员工数 |
| employee_risk_low | INTEGER | 低风险员工数 |
| driver_risk_score | NUMERIC(10,2) | 驾驶风险平均分 |
| driver_risk_high | INTEGER | 高风险驾驶员数 |
| accident_total | INTEGER | 事故总数 |
| accident_major | INTEGER | 重大事故数 |
| accident_minor | INTEGER | 一般/轻微事故数 |
| accident_injuries | INTEGER | 受伤人数 |
| accident_casualties | INTEGER | 死亡人数 |
| rectification_total | INTEGER | 整改任务总数 |
| rectification_closed | INTEGER | 已关闭数 |
| rectification_overdue | INTEGER | 逾期数 |
| rectification_effective_rate | NUMERIC(5,2) | 整改有效率(%) |
| rectification_repeat_rate | NUMERIC(5,2) | 重复发生率(%) |
| rectification_avg_cycle | NUMERIC(6,2) | 平均整改周期(天) |
| org_id | BIGINT | 组织ID |
| org_type | VARCHAR(16) | 组织类型 |
| org_name | VARCHAR(128) | 组织名称 |
| org_risk_score | NUMERIC(10,2) | 组织风险评分 |
| org_risk_level | VARCHAR(16) | 组织风险等级 |
| metrics_json | JSONB | 扩展指标数据 |
| created_at / updated_at / is_deleted | — | 审计字段 |

#### hse_risk_prediction（风险预测表）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | BIGSERIAL | 主键 |
| prediction_date | DATE | 预测基期 |
| prediction_target | DATE | 预测目标日期 |
| prediction_type | VARCHAR(32) | 预测类型 |
| prediction_model | VARCHAR(32) | 预测模型（trend） |
| target_type | VARCHAR(32) | 对象类型 |
| target_id | BIGINT | 对象ID |
| target_name | VARCHAR(128) | 对象名称 |
| predicted_risk_score | NUMERIC(10,2) | 预测风险评分 |
| predicted_risk_level | VARCHAR(16) | 预测风险等级 |
| predicted_accidents | INTEGER | 预测事故数 |
| predicted_trend | VARCHAR(16) | 预测趋势（up/down/stable） |
| predicted_confidence | NUMERIC(5,2) | 置信度(%) |
| trend_slope | NUMERIC(10,4) | 趋势斜率 |
| trend_change_rate | NUMERIC(8,4) | 趋势变化率 |
| warning_threshold | NUMERIC(10,2) | 预警阈值 |
| is_abnormal | BOOLEAN | 是否异常 |
| abnormal_degree | NUMERIC(5,2) | 异常程度(0-100) |
| contributing_factors | JSONB | 贡献因子列表 |
| baseline_avg | NUMERIC(10,2) | 历史基线均值 |
| baseline_stddev | NUMERIC(10,2) | 历史基线标准差 |
| prediction_note | TEXT | 预测说明 |
| model_version | VARCHAR(32) | 模型版本 |
| created_by / created_at / updated_at / is_deleted | — | 审计字段 |

### 6.2 新增视图

#### v_org_risk_portrait（组织风险画像聚合视图）

聚合 hse_org + hse_employee_risk_snapshot，按组织维度统计员工数、平均风险分、高/中/低风险分布。

#### v_accident_trend（事故趋势聚合视图）

按月聚合 accidents 表，统计事故数、重大事故数、伤亡、损失、加权严重度。

## 七、权限控制

### 7.1 角色权限矩阵

| 角色 | 风险趋势 | 事故趋势 | 整改分析 | 组织画像 | 风险预测 |
| --- | --- | --- | --- | --- | --- |
| admin | 全局 | 全局 | 全局 | 全局 | 执行+查看 |
| safety_manager | 全局 | 全局 | 全局 | 全局 | 执行+查看 |
| group_leader | 集团范围 | 集团范围 | 集团范围 | 集团范围 | 查看 |
| department_manager | 本部门 | 本部门 | 本部门 | 本部门 | 查看 |
| township_manager | 本中心 | 本中心 | 本中心 | 本中心 | 查看 |
| area_manager | 本片区 | 本片区 | 本片区 | 本片区 | 查看 |
| administrator | 本网格 | 本网格 | 本网格 | 本网格 | 查看 |

### 7.2 权限实现

- 全局查询：admin/safety_manager 可查看全系统数据
- 组织过滤：非全局角色按 org_id 关联过滤
- 预测执行：仅 admin/safety_manager 可创建预测
- 预测查看：所有已认证用户可查看

## 八、约束遵循

| 约束项 | 验证方式 | 结果 |
| --- | --- | --- |
| 不修改员工风险模型 | 只读 hse_employee_risk_snapshot | ✅ |
| 不修改考核模型v1.1 | 只读 assessment 相关表 | ✅ |
| 不修改预警规则v1.1 | 只读 hse_warning_rule 表 | ✅ |
| 不修改已有业务表 | 仅创建新表和视图 | ✅ |
| 所有规则继续版本化 | 预测模型含 model_version | ✅ |

## 九、接口清单汇总

| 序号 | 模块 | 方法 | 路径 | 权限 |
| --- | --- | --- | --- | --- |
| 1 | 风险趋势 | GET | /analysis-center/risk-trend | 全员 |
| 2 | 风险趋势 | GET | /analysis-center/risk-trend/:type/:id | 全员 |
| 3 | 事故趋势 | GET | /analysis-center/accident-trend | 全员 |
| 4 | 事故趋势 | GET | /analysis-center/accident-repeat | 全员 |
| 5 | 整改分析 | GET | /analysis-center/rectification-analysis | 全员 |
| 6 | 组织画像 | GET | /analysis-center/org-portrait | 全员 |
| 7 | 组织画像 | GET | /analysis-center/org-portrait/:type/:id | 全员 |
| 8 | 风险预测 | POST | /analysis-center/predict | admin/safety_manager |
| 9 | 风险预测 | GET | /analysis-center/predictions | 全员 |
| 10 | 风险预测 | GET | /analysis-center/predictions/:id | 全员 |
| 11 | 异常识别 | GET | /analysis-center/abnormal | 全员 |

## 十、技术栈

| 层次 | 技术 | 说明 |
| --- | --- | --- |
| 前端框架 | Vue 3 + TypeScript + Ant Design Vue + Vben v5.7.0 | 企业级中后台方案 |
| 前端 API | requestClient（@vben/request） | 统一请求封装 |
| 后端框架 | Node.js + Express | 服务端框架 |
| 数据库 | PostgreSQL | 关系型数据库 |
| 预测算法 | 线性回归（最小二乘法） | 趋势预测 |
| 统计指标 | 标准差、R²、变化率 | 异常检测与置信度 |

## 十一、部署说明

### 11.1 数据库迁移

```bash
# 在 PostgreSQL 中执行
psql -h <host> -U <user> -d <database> -f server/sql/sprint8a_analysis_center_migration.sql
```

### 11.2 后端重启

```bash
# 重启后端服务即可自动加载新路由
npm start
```

### 11.3 前端构建

```bash
# 构建前端
pnpm build
```

## 十二、后续扩展方向

1. **机器学习预测**：引入 ML 模型（ARIMA、Prophet）替代线性回归
2. **实时看板**：将分析结果嵌入驾驶舱，实现实时监控
3. **智能报告**：自动生成分析报告，支持定时推送
4. **根因分析**：基于故障树分析（FTA）识别事故根本原因
5. **对标分析**：跨区域/跨时期对标，识别最佳实践
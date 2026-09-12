# Sprint5.14 员工安全风险画像设计报告

> 版本：v2.0（最终升级版）
> 阶段：Sprint5.14（设计阶段，不含开发）
> 日期：2026年

---

## 一、设计目标

### 1.1 业务目标

针对城乡环卫一体化企业特点，整合员工、培训、三违、隐患、交通事故、人身伤害事故等多源数据，为每名员工构建"一人一档"的安全风险画像。

**核心价值**：

- **风险可视化**：以员工为中心，聚合分散在各业务模块的安全数据，形成全景视图
- **风险定级**：基于集团级可配置规则计算员工安全风险等级（绿/黄/橙/红）
- **风险预警**：识别高风险员工，支持精准培训和重点监管，服务集团交通安全专项行动
- **数据贯通**：复用现有业务模块数据，不重复建表、不修改原有模型
- **事故联动**：建立事故→原因分析→整改措施→专项培训的闭环管理

### 1.2 设计原则

| 原则 | 说明 |
|------|------|
| 数据只读整合 | 风险画像仅读取各类业务模块数据，不修改其表结构和业务逻辑 |
| 一人一档 | 每名员工唯一一条风险画像记录，通过 employee_id 关联 |
| 规则可配置 | 风险等级由集团级规则配置计算，不硬编码 |
| 统一人员关联 | 所有人员展示统一使用 v_employee_current 视图，禁止保存人员姓名作为关联 |
| 最小侵入 | 本Sprint仅做设计分析，不新增业务模块、不大规模开发 |

### 1.3 风险来源

风险画像整合六大风险维度：

| 维度 | 数据来源 | 关联字段 |
|------|----------|----------|
| 培训风险 | training_records | employee_id |
| 三违风险 | violation_records | violator_id |
| 交通安全风险 | hse_traffic_records | employee_id |
| 事故风险 | hse_incident_records | employee_id |
| 隐患责任风险 | hazards | responsible_id |
| 岗位风险 | position | 通过员工任职关系关联 |

---

## 二、数据来源

### 2.1 员工基础数据

**来源表**：`employee`、`v_employee_current`、`employee_assignment`、`position`

| 数据项 | 来源字段 | 说明 |
|--------|----------|------|
| 员工ID | `employee.id` | 主键，全局唯一人员标识 |
| 姓名 | `employee.name` | |
| 工号 | `employee.employee_code` | |
| 性别 | `employee.gender` | |
| 年龄 | 计算字段 | 由 birth_date 计算 |
| 人员类型 | `employee.person_type` | 生产/管理/技术/辅助/驾驶员 |
| 所属组织 | `v_employee_current.org_name` | |
| 组织路径 | `v_employee_current.org_path` | |
| 作业单元 | `v_employee_current.unit_name` | |
| 岗位名称 | `v_employee_current.position_name` | |
| 岗位风险等级 | `v_employee_current.risk_level` | low/medium/high/critical |
| 是否驾驶员 | `position.is_driver` | 标识驾驶员岗位 |
| 是否安全关键岗 | `v_employee_current.is_safety_critical` | |

### 2.2 培训数据

**来源表**：`training_records`、`training_plans`、`training_requirements`

| 数据项 | 来源字段 | 说明 |
|--------|----------|------|
| 受训员工ID | `training_records.employee_id` | 关联 employee.id |
| 培训类型 | `training_records.training_type` | |
| 培训日期 | `training_records.training_date` | 用于计算证书时效 |
| 培训结果 | `training_records.result` | 合格/不合格 |
| 培训计划ID | `training_records.training_plan_id` | |

### 2.3 三违数据

**来源表**：`violation_records`

| 数据项 | 来源字段 | 说明 |
|--------|----------|------|
| 违章人ID | `violation_records.violator_id` | 关联 employee.id |
| 三违类型 | `violation_records.violation_type` | |
| 严重程度 | `violation_records.violation_level` | 严重/一般/轻微 |
| 风险等级 | `violation_records.risk_level` | 高/中/低 |
| 违章日期 | `violation_records.violation_date` | |

### 2.4 隐患数据

**来源表**：`hazards`

| 数据项 | 来源字段 | 说明 |
|--------|----------|------|
| 责任人ID | `hazards.responsible_id` | 关联 employee.id |
| 隐患类型 | `hazards.hazard_type` | |
| 风险等级 | `hazards.risk_level` | 重大/一级/二级/三级 |
| 检查时间 | `hazards.hazard_date` | |
| 整改期限 | `hazards.deadline_days` | 默认30天 |
| 状态 | `hazards.status` | |

### 2.5 事故数据

**来源表**：`hse_incident_records`（新设计）

| 数据项 | 来源字段 | 说明 |
|--------|----------|------|
| 涉事员工ID | `hse_incident_records.employee_id` | 关联 employee.id |
| 事故类型 | `hse_incident_records.incident_type` | traffic/occupational/equipment/environmental |
| 事故等级 | `hse_incident_records.incident_level` | major/serious/general/minor |
| 发生时间 | `hse_incident_records.occurred_at` | |
| 发生地点 | `hse_incident_records.location` | |
| 责任认定 | `hse_incident_records.responsibility` | |
| 状态 | `hse_incident_records.status` | |

### 2.6 交通安全数据

**来源表**：`hse_traffic_records`（新设计）

| 数据项 | 来源字段 | 说明 |
|--------|----------|------|
| 员工ID | `hse_traffic_records.employee_id` | 关联 employee.id |
| 驾驶证号 | `hse_traffic_records.license_number` | |
| 驾驶证有效期 | `hse_traffic_records.license_expiry_date` | |
| 累计扣分 | `hse_traffic_records.total_points_deducted` | |
| 交通违法次数 | `hse_traffic_records.traffic_violation_count` | |
| 事故次数 | `hse_traffic_records.accident_count` | |
| 车辆ID | `hse_traffic_records.vehicle_id` | 关联车辆信息 |

### 2.7 数据来源关系图

```
                    ┌──────────────────┐
                    │     employee     │
                    │  (员工主表)       │
                    └────────┬─────────┘
                             │ employee_id
          ┌──────────────────┼──────────────────┬──────────────────┐
          │                  │                  │                  │
          ▼                  ▼                  ▼                  ▼
  ┌───────────────┐  ┌───────────────┐  ┌──────────────────┐  ┌──────────────────┐
  │training_records│  │violation_records│  │hse_incident_    │  │hse_traffic_     │
  │  (培训记录)    │  │  (三违记录)    │  │  records        │  │  records        │
  │employee_id    │  │violator_id    │  │  (事故记录)     │  │  (交通安全)     │
  └───────────────┘  └───────────────┘  └──────────────────┘  └──────────────────┘
          │                  │                  │                  │
          │                  │                  │                  │
          └──────────────────┼──────────────────┘                  │
                             │                                    │
                             ▼                                    │
                  ┌───────────────┐                               │
                  │    hazards    │                               │
                  │  (隐患记录)   │                               │
                  │responsible_id │                               │
                  └───────────────┘                               │
                             │                                    │
                             └──────────────────┬─────────────────┘
                                                │
                                                ▼
                                    ┌─────────────────────┐
                                    │  风险画像聚合层      │
                                    │  (按 employee_id     │
                                    │   聚合六类数据)      │
                                    └─────────────────────┘
```

---

## 三、风险指标设计

### 3.1 指标体系总览

风险画像从六个维度构建指标体系：

| 维度 | 指标 | 数据来源 | 统计方式 |
|------|------|----------|----------|
| 培训风险 | 培训完成率 | training_records | 合格培训数/应培训数 |
| 培训风险 | 逾期培训次数 | training_records | 证书过期或临期次数 |
| 三违风险 | 三违次数 | violation_records | COUNT(violator_id) |
| 三违风险 | 严重三违次数 | violation_records | violation_level='严重' |
| 交通安全风险 | 驾驶证扣分 | hse_traffic_records | total_points_deducted |
| 交通安全风险 | 交通违法次数 | hse_traffic_records | traffic_violation_count |
| 交通安全风险 | 驾驶事故次数 | hse_traffic_records | accident_count |
| 事故风险 | 事故次数 | hse_incident_records | COUNT(employee_id) |
| 事故风险 | 重大事故次数 | hse_incident_records | incident_level='major' |
| 事故风险 | 事故责任 | hse_incident_records | responsibility='主要责任' |
| 隐患责任风险 | 隐患责任次数 | hazards | COUNT(responsible_id) |
| 隐患责任风险 | 重大隐患次数 | hazards | risk_level='重大' |
| 隐患责任风险 | 整改超期次数 | hazards | 超期未关闭次数 |
| 岗位风险 | 驾驶员岗位 | position | is_driver=true |
| 岗位风险 | 高风险岗位 | position | risk_level='high/critical' |

### 3.2 指标汇总表

| 指标编号 | 指标名称 | 维度 | 计算方式 | 统计周期 |
|:--------:|----------|:----:|----------|:--------:|
| M-01 | 培训完成率 | 培训 | 合格培训数/应培训数 | 近12月 |
| M-02 | 逾期培训次数 | 培训 | COUNT(过期/临期) | 近12月 |
| M-03 | 三违次数 | 三违 | COUNT(violator_id) | 近12月 |
| M-04 | 严重三违次数 | 三违 | COUNT(violation_level='严重') | 近12月 |
| M-05 | 驾驶证扣分 | 交通安全 | total_points_deducted | 本年度 |
| M-06 | 交通违法次数 | 交通安全 | traffic_violation_count | 近12月 |
| M-07 | 驾驶事故次数 | 交通安全 | accident_count | 近12月 |
| M-08 | 事故次数 | 事故 | COUNT(employee_id) | 近12月 |
| M-09 | 重大事故次数 | 事故 | COUNT(incident_level='major') | 近12月 |
| M-10 | 主要责任事故次数 | 事故 | COUNT(responsibility='主要责任') | 近12月 |
| M-11 | 隐患责任次数 | 隐患 | COUNT(responsible_id) | 近12月 |
| M-12 | 重大隐患次数 | 隐患 | COUNT(risk_level='重大') | 近12月 |
| M-13 | 整改超期次数 | 隐患 | COUNT(超期未关闭) | 近12月 |
| M-14 | 岗位风险等级 | 岗位 | position.risk_level | 当前 |

---

## 四、风险计算规则

### 4.1 风险等级定义

| 风险等级 | 标识 | 颜色 | 说明 |
|:--------:|:----:|:----:|------|
| 低风险 | green | 绿色 | 员工安全行为良好，培训到位，无显著风险因素 |
| 中风险 | yellow | 黄色 | 存在一定风险因素，需关注和改进 |
| 高风险 | orange | 橙色 | 存在明显风险因素，需重点监管和干预 |
| 极高风险 | red | 红色 | 存在重大风险，需立即采取管控措施 |

### 4.2 风险评分模型

采用**加权评分法**，总分100分，各指标按权重分配。

#### 4.2.1 指标权重分配

| 指标 | 权重 | 满分 | 评分方向 |
|------|:----:|:----:|----------|
| 培训完成率 | 15% | 15 | 正向（越高越好） |
| 逾期培训次数 | 8% | 8 | 反向 |
| 三违次数 | 18% | 18 | 反向 |
| 严重三违次数 | 12% | 12 | 反向 |
| 驾驶证扣分 | 10% | 10 | 反向（仅驾驶员） |
| 交通违法次数 | 8% | 8 | 反向（仅驾驶员） |
| 驾驶事故次数 | 8% | 8 | 反向（仅驾驶员） |
| 事故次数 | 8% | 8 | 反向 |
| 重大事故次数 | 6% | 6 | 反向 |
| 隐患责任次数 | 6% | 6 | 反向 |
| 整改超期次数 | 6% | 6 | 反向 |
| **合计** | **100%** | **100** | |

**非驾驶员员工**：交通安全相关指标不计入评分，其余指标权重按比例调整。

#### 4.2.2 评分细则

**培训完成率（满分15）**：

| 完成率 | 得分 |
|--------|:----:|
| ≥ 90% | 15 |
| 75%-89% | 11 |
| 60%-74% | 7 |
| < 60% | 0 |

**逾期培训次数（满分8）**：

| 次数 | 得分 |
|------|:----:|
| 0次 | 8 |
| 1次 | 5 |
| ≥ 2次 | 0 |

**三违次数（满分18）**：

| 次数 | 得分 |
|------|:----:|
| 0次 | 18 |
| 1次 | 13 |
| 2次 | 7 |
| ≥ 3次 | 0 |

**严重三违次数（满分12）**：

| 次数 | 得分 |
|------|:----:|
| 0次 | 12 |
| 1次 | 5 |
| ≥ 2次 | 0 |

**驾驶证扣分（满分10，仅驾驶员）**：

| 扣分 | 得分 |
|------|:----:|
| 0分 | 10 |
| 1-3分 | 7 |
| 4-6分 | 4 |
| 7-11分 | 1 |
| 12分 | 0 |

**交通违法次数（满分8，仅驾驶员）**：

| 次数 | 得分 |
|------|:----:|
| 0次 | 8 |
| 1次 | 5 |
| 2次 | 2 |
| ≥ 3次 | 0 |

**驾驶事故次数（满分8，仅驾驶员）**：

| 次数 | 得分 |
|------|:----:|
| 0次 | 8 |
| 1次 | 4 |
| ≥ 2次 | 0 |

**事故次数（满分8）**：

| 次数 | 得分 |
|------|:----:|
| 0次 | 8 |
| 1次 | 4 |
| ≥ 2次 | 0 |

**重大事故次数（满分6）**：

| 次数 | 得分 |
|------|:----:|
| 0次 | 6 |
| ≥ 1次 | 0 |

**隐患责任次数（满分6）**：

| 次数 | 得分 |
|------|:----:|
| 0次 | 6 |
| 1-2次 | 4 |
| ≥ 3次 | 0 |

**整改超期次数（满分6）**：

| 次数 | 得分 |
|------|:----:|
| 0次 | 6 |
| 1次 | 3 |
| ≥ 2次 | 0 |

#### 4.2.3 风险等级判定

| 总分 | 风险等级 |
|:----:|:--------:|
| ≥ 85 | 低风险（green） |
| 70-84 | 中风险（yellow） |
| 50-69 | 高风险（orange） |
| < 50 | 极高风险（red） |

### 4.3 一票否决规则

以下情况直接判定为**极高风险（red）**，不受总分影响：

| 规则编号 | 条件 | 说明 |
|:--------:|------|------|
| V-01 | 近12个月严重三违次数 ≥ 2 | 屡次严重违章 |
| V-02 | 近12个月重大事故 ≥ 1 | 发生重大事故 |
| V-03 | 年度驾驶证扣12分 | 驾照吊销 |
| V-04 | 近12个月重大隐患责任 ≥ 2 | 屡次重大隐患 |
| V-05 | 近12个月事故主要责任 ≥ 2 | 屡次事故主要责任 |

---

## 五、展示设计

### 5.1 页面结构

员工风险画像页面采用**单页多区块**布局，自上而下分为七个区块：

```
┌─────────────────────────────────────────────────┐
│                 员工安全风险画像                  │
├─────────────────────────────────────────────────┤
│  [员工搜索选择器]                                 │
├─────────────────────────────────────────────────┤
│  区块1：基础信息                                  │
│  ┌──────────┬──────────┬──────────┐            │
│  │ 姓名      │ 工号     │ 年龄      │            │
│  │ 性别      │ 人员类型 │ 人员分类   │            │
│  └──────────┴──────────┴──────────┘            │
├─────────────────────────────────────────────────┤
│  区块2：组织岗位信息                              │
│  ┌──────────┬──────────┬──────────┐            │
│  │ 所属组织   │ 作业单元 │ 岗位名称   │            │
│  │ 岗位类别   │ 岗位风险 │ 入职日期   │            │
│  └──────────┴──────────┴──────────┘            │
├─────────────────────────────────────────────────┤
│  区块3：综合风险等级                              │
│  ┌─────────────────────────────────────┐        │
│  │     [风险等级标签]  [风险评分]        │        │
│  │     [风险雷达图]                      │        │
│  │     [风险原因分析]                    │        │
│  └─────────────────────────────────────┘        │
├─────────────────────────────────────────────────┤
│  区块4：培训风险                                  │
│  ┌─────────────────────────────────────┐        │
│  │ 培训完成率：85%      [进度条]         │        │
│  │ 逾期培训：0次        [标签]          │        │
│  │ [培训记录列表]                        │        │
│  └─────────────────────────────────────┘        │
├─────────────────────────────────────────────────┤
│  区块5：三违风险                                  │
│  ┌─────────────────────────────────────┐        │
│  │ 三违次数：1次      严重三违：0次      │        │
│  │ [三违记录列表]                        │        │
│  └─────────────────────────────────────┘        │
├─────────────────────────────────────────────────┤
│  区块6：交通安全风险（驾驶员显示）                  │
│  ┌─────────────────────────────────────┐        │
│  │ 驾驶证扣分：3分     违法次数：0次     │        │
│  │ 事故次数：0次       驾照有效期       │        │
│  │ [交通记录列表]                        │        │
│  └─────────────────────────────────────┘        │
├─────────────────────────────────────────────────┤
│  区块7：事故风险                                  │
│  ┌─────────────────────────────────────┐        │
│  │ 事故次数：0次      重大事故：0次      │        │
│  │ [事故记录列表]                        │        │
│  └─────────────────────────────────────┘        │
├─────────────────────────────────────────────────┤
│  区块8：隐患责任风险                              │
│  ┌─────────────────────────────────────┐        │
│  │ 隐患责任：2次      超期整改：0次      │        │
│  │ [隐患记录列表]                        │        │
│  └─────────────────────────────────────┘        │
└─────────────────────────────────────────────────┘
```

### 5.2 区块详细设计

#### 5.2.1 员工选择器

| 元素 | 说明 |
|------|------|
| 搜索框 | 支持按姓名、工号搜索，使用 EmployeeSelector 组件 |
| 选择结果 | 显示员工姓名、工号、岗位、组织 |
| 统计周期切换 | 近3个月/近6个月/近12个月/全部 |

#### 5.2.2 基础信息区块

| 字段 | 来源 | 展示方式 |
|------|------|----------|
| 姓名 | employee.name | 文本 |
| 工号 | employee.employee_code | 文本 |
| 性别 | employee.gender | 文本 |
| 年龄 | 计算 | 文本 |
| 人员类型 | employee.person_type | 标签 |
| 人员分类 | employee.person_category | 标签 |

展示组件：Descriptions

#### 5.2.3 组织岗位信息区块

| 字段 | 来源 | 展示方式 |
|------|------|----------|
| 所属组织 | v_employee_current.org_name | 文本 |
| 组织路径 | v_employee_current.org_path | 面包屑 |
| 作业单元 | v_employee_current.unit_name | 文本 |
| 岗位名称 | v_employee_current.position_name | 文本 |
| 岗位类别 | v_employee_current.position_type | 标签 |
| 岗位风险等级 | v_employee_current.risk_level | 彩色标签 |
| 是否驾驶员 | position.is_driver | 标签 |
| 入职日期 | v_employee_current.start_date | 日期 |

展示组件：Descriptions

#### 5.2.4 综合风险等级区块

| 元素 | 说明 |
|------|------|
| 风险等级标签 | 绿/黄/橙/红四色标签，使用 Tag 组件 |
| 风险评分 | 数值显示，使用 Statistic 组件 |
| 风险雷达图 | 六维雷达图：培训、三违、交通安全、事故、隐患、岗位 |
| 风险原因分析 | 列出主要风险因素及建议措施 |
| 一票否决提示 | 若触发一票否决规则，显示红色提示 |

**雷达图维度**：

| 维度 | 满分 | 归一化 |
|------|:----:|:------:|
| 培训风险 | 23 | 得分/23 |
| 三违风险 | 30 | 得分/30 |
| 交通安全风险 | 26 | 得分/26（非驾驶员按满分计算） |
| 事故风险 | 14 | 得分/14 |
| 隐患风险 | 12 | 得分/12 |
| 岗位风险 | 5 | 岗位风险等级得分/5 |

#### 5.2.5 培训风险区块

| 元素 | 说明 |
|------|------|
| 培训完成率 | Progress 进度条，显示百分比 |
| 逾期培训次数 | Tag 标签（0次/1次/多次） |
| 累计培训次数 | 数值 |
| 最近培训日期 | 日期 |
| 培训记录列表 | Table 表格 |

#### 5.2.6 三违风险区块

| 元素 | 说明 |
|------|------|
| 三违次数 | 数值，近12个月 |
| 严重三违次数 | 数值，红色高亮 |
| 高风险三违次数 | 数值，红色高亮 |
| 三违记录列表 | Table 表格 |

#### 5.2.7 交通安全风险区块

**仅驾驶员岗位显示**

| 元素 | 说明 |
|------|------|
| 驾驶证扣分 | 数值，红色高亮（超过6分） |
| 交通违法次数 | 数值 |
| 驾驶事故次数 | 数值，红色高亮 |
| 驾驶证有效期 | 日期 |
| 关联车辆 | 车辆信息 |
| 交通记录列表 | Table 表格 |

#### 5.2.8 事故风险区块

| 元素 | 说明 |
|------|------|
| 事故次数 | 数值，近12个月 |
| 重大事故次数 | 数值，红色高亮 |
| 主要责任次数 | 数值，红色高亮 |
| 事故记录列表 | Table 表格 |

#### 5.2.9 隐患责任风险区块

| 元素 | 说明 |
|------|------|
| 隐患责任次数 | 数值，近12个月 |
| 重大隐患次数 | 数值，红色高亮 |
| 整改超期次数 | 数值，红色高亮 |
| 隐患记录列表 | Table 表格 |

### 5.3 交互设计

- **员工切换**：选择员工后，所有区块数据联动刷新
- **统计周期切换**：切换后重新计算风险指标和评分
- **记录详情跳转**：点击记录跳转到对应模块详情页
- **风险预警提示**：高风险员工页面顶部显示红色预警横幅
- **驾驶员专属**：非驾驶员员工隐藏交通安全风险区块

### 5.4 权限设计

| 操作 | 权限 | 说明 |
|------|------|------|
| 查看风险画像 | hse:risk-profile:view | 查看员工风险画像 |
| 查看所有员工 | hse:risk-profile:view-all | 管理员权限 |
| 导出风险报告 | hse:risk-profile:export | 导出单个员工风险报告 |

---

## 六、数据聚合方案

### 6.1 聚合策略

风险画像采用**实时聚合**策略，不新增数据表，通过 SQL 联合查询实时计算。

### 6.2 聚合查询设计

**核心查询**：以 employee_id 为入参，聚合六类业务数据。

```sql
-- 培训维度聚合
SELECT
  COUNT(*) AS training_count,
  SUM(CASE WHEN result = '合格' THEN 1 ELSE 0 END) AS qualified_count,
  SUM(CASE WHEN expiry_status IN ('expired', 'expiring') THEN 1 ELSE 0 END) AS overdue_count,
  MAX(training_date) AS last_training_date
FROM training_records
WHERE employee_id = $1 AND is_deleted = false
  AND training_date >= CURRENT_DATE - INTERVAL '12 months';

-- 三违维度聚合
SELECT
  COUNT(*) AS violation_count,
  SUM(CASE WHEN violation_level = '严重' THEN 1 ELSE 0 END) AS serious_count,
  SUM(CASE WHEN risk_level = '高' THEN 1 ELSE 0 END) AS high_risk_count,
  MAX(violation_date) AS last_violation_date
FROM violation_records
WHERE violator_id = $1 AND is_deleted = false
  AND violation_date >= CURRENT_DATE - INTERVAL '12 months';

-- 事故维度聚合
SELECT
  COUNT(*) AS incident_count,
  SUM(CASE WHEN incident_level = 'major' THEN 1 ELSE 0 END) AS major_count,
  SUM(CASE WHEN responsibility = '主要责任' THEN 1 ELSE 0 END) AS responsibility_count,
  MAX(occurred_at) AS last_incident_date
FROM hse_incident_records
WHERE employee_id = $1 AND is_deleted = false
  AND occurred_at >= CURRENT_DATE - INTERVAL '12 months';

-- 交通安全维度聚合（驾驶员）
SELECT
  total_points_deducted,
  traffic_violation_count,
  accident_count,
  license_expiry_date
FROM hse_traffic_records
WHERE employee_id = $1 AND is_deleted = false;

-- 隐患维度聚合
SELECT
  COUNT(*) AS hazard_count,
  SUM(CASE WHEN risk_level IN ('重大', '一级', 'high', 'critical') THEN 1 ELSE 0 END) AS major_hazard_count,
  SUM(CASE WHEN status != 'closed'
           AND hazard_date + (deadline_days || ' days')::interval < CURRENT_DATE
           THEN 1 ELSE 0 END) AS overdue_count,
  MAX(hazard_date) AS last_hazard_date
FROM hazards
WHERE responsible_id = $1 AND is_deleted = false
  AND hazard_date >= CURRENT_DATE - INTERVAL '12 months';
```

---

## 七、与现有系统的关系

### 7.1 不修改的模块

| 模块 | 表 | 说明 |
|------|----|------|
| 员工模型 | employee, employee_assignment, position | 不修改表结构和业务逻辑 |
| 培训模型 | training_records, training_plans, training_requirements | 不修改表结构和业务逻辑 |
| 三违模型 | violation_records | 不修改表结构和业务逻辑 |
| 隐患模型 | hazards | 不修改表结构和业务逻辑 |

### 7.2 新增设计的模块

| 模块 | 表 | 说明 |
|------|----|------|
| 事故管理 | hse_incident_records | 新设计，独立事故管理模块 |
| 交通安全 | hse_traffic_records | 新设计，独立交通安全模块 |

### 7.3 复用的能力

| 能力 | 来源 | 用途 |
|------|------|------|
| v_employee_current 视图 | 现有 | 员工基础信息展示 |
| EmployeeSelector 组件 | 现有 | 员工选择器 |
| useAccess | 现有 | 权限控制 |
| $t i18n | 现有 | 国际化 |
| @vben/request | 现有 | API 请求 |
| Ant Design Vue | 现有 | UI 组件 |

---

## 八、后续开发建议

### 8.1 开发分阶段建议

| 阶段 | 内容 | 优先级 |
|:----:|------|:------:|
| 1 | 事故管理模块开发 | 高 |
| 2 | 交通安全管理模块开发 | 高 |
| 3 | 后端风险画像聚合API | 高 |
| 4 | 前端风险画像页面 | 高 |
| 5 | 集团风险等级规则配置页面 | 中 |
| 6 | 高风险员工预警列表 | 中 |
| 7 | 风险报告导出 | 中 |

### 8.2 扩展方向

1. **趋势分析** - 展示员工风险评分变化趋势曲线
2. **对比分析** - 同岗位/同部门员工风险对比
3. **风险预警推送** - 高风险员工自动推送通知给直接上级
4. **培训建议** - 基于风险指标自动推荐培训计划
5. **事故联动** - 事故→专项培训的闭环流程

---

## 九、附录

### 9.1 风险评分计算表

| 指标 | 权重 | 满分 | 评分方向 | 评分规则 |
|------|:----:|:----:|:--------:|----------|
| 培训完成率 | 15% | 15 | 正向 | ≥90%→15, 75-89%→11, 60-74%→7, <60%→0 |
| 逾期培训次数 | 8% | 8 | 反向 | 0→8, 1→5, ≥2→0 |
| 三违次数 | 18% | 18 | 反向 | 0→18, 1→13, 2→7, ≥3→0 |
| 严重三违 | 12% | 12 | 反向 | 0→12, 1→5, ≥2→0 |
| 驾驶证扣分 | 10% | 10 | 反向 | 0→10, 1-3→7, 4-6→4, 7-11→1, 12→0 |
| 交通违法次数 | 8% | 8 | 反向 | 0→8, 1→5, 2→2, ≥3→0 |
| 驾驶事故次数 | 8% | 8 | 反向 | 0→8, 1→4, ≥2→0 |
| 事故次数 | 8% | 8 | 反向 | 0→8, 1→4, ≥2→0 |
| 重大事故 | 6% | 6 | 反向 | 0→6, ≥1→0 |
| 隐患责任次数 | 6% | 6 | 反向 | 0→6, 1-2→4, ≥3→0 |
| 整改超期次数 | 6% | 6 | 反向 | 0→6, 1→3, ≥2→0 |

### 9.2 一票否决规则表

| 规则 | 条件 | 说明 |
|------|------|------|
| V-01 | 严重三违 ≥ 2次（近12月） | 屡次严重违章 |
| V-02 | 重大事故 ≥ 1次（近12月） | 发生重大事故 |
| V-03 | 年度驾驶证扣12分 | 驾照吊销 |
| V-04 | 重大隐患责任 ≥ 2次（近12月） | 屡次重大隐患 |
| V-05 | 事故主要责任 ≥ 2次（近12月） | 屡次事故主要责任 |

### 9.3 风险等级对照表

| 总分 | 风险等级 | 标识 | 颜色 |
|:----:|:--------:|:----:|:----:|
| ≥ 85 | 低风险 | green | 绿色 |
| 70-84 | 中风险 | yellow | 黄色 |
| 50-69 | 高风险 | orange | 橙色 |
| < 50 | 极高风险 | red | 红色 |
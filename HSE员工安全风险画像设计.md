# HSE 员工安全风险画像设计

> 版本：v1.0
> 阶段：Sprint5.14（设计阶段，不含开发）
> 日期：2025年

---

## 一、设计目标

### 1.1 业务目标

整合员工、培训、三违、隐患四类业务数据，为每名员工构建"一人一档"的安全风险画像，实现：

- **风险可视化**：以员工为中心，聚合分散在各业务模块的安全数据
- **风险定级**：基于应用层规则计算员工安全风险等级（低/中/高）
- **风险预警**：识别高风险员工，支持精准培训和重点监管
- **数据贯通**：复用现有四类业务模块数据，不重复建表、不修改原有模型

### 1.2 设计原则

| 原则 | 说明 |
|------|------|
| 数据只读整合 | 风险画像仅读取四类业务模块数据，不修改其表结构和业务逻辑 |
| 一人一档 | 每名员工唯一一条风险画像记录，通过 employee_id 关联 |
| 规则定级 | 风险等级由应用层规则计算，AI 分析仅供参考，不参与定级 |
| 统一人员关联 | 所有人员展示统一使用 v_employee_current 视图 |
| 最小侵入 | 本Sprint仅做设计分析，不新增业务模块、不大规模开发 |

---

## 二、数据来源

风险画像数据来源于四类现有业务模块，全部通过 `employee_id` 关联。

### 2.1 员工基础数据

**来源表**：`employee`、`v_employee_current`（视图）、`employee_assignment`、`position`

| 数据项 | 来源字段 | 说明 |
|--------|----------|------|
| 员工ID | `employee.id` | 主键，全局唯一人员标识 |
| 姓名 | `employee.name` | |
| 工号 | `employee.employee_code` | |
| 性别 | `employee.gender` | |
| 年龄 | 计算字段 `EXTRACT(YEAR FROM age(birth_date))` | 由 birth_date 计算 |
| 人员分类 | `employee.person_category` | 适龄人员 / 超龄人员 |
| 人员类型 | `employee.person_type` | 生产/管理/技术/辅助 |
| 所属组织 | `v_employee_current.org_name` | 管理组织名称 |
| 组织路径 | `v_employee_current.org_path` | 如 /宁津项目公司/环卫作业中心/长官镇作业中心 |
| 作业单元 | `v_employee_current.unit_name` | 保洁队/收运队/转运站/车队等 |
| 岗位名称 | `v_employee_current.position_name` | |
| 岗位类别 | `v_employee_current.position_type` | 管理/技术/生产/辅助/特种 |
| **岗位风险等级** | `v_employee_current.risk_level` | **low/medium/high/critical（岗位固有风险）** |
| 是否安全关键岗 | `v_employee_current.is_safety_critical` | |
| 任职状态 | `v_employee_current.assignment_status` | active/inactive（筛选在职员工） |
| 入职日期 | `v_employee_current.start_date` | 任职开始日期 |
| 直接上级 | `v_employee_current.supervisor_name` | |

### 2.2 培训数据

**来源表**：`training_records`、`training_plans`、`training_requirements`

| 数据项 | 来源字段 | 说明 |
|--------|----------|------|
| 培训记录ID | `training_records.id` | |
| 受训员工ID | `training_records.employee_id` | 关联 employee.id |
| 培训类型 | `training_records.training_type` | HSE/新员工/驾驶员/太行等 |
| 培训日期 | `training_records.training_date` | 用于计算证书时效 |
| 培训时长 | `training_records.duration_minutes` | 分钟 |
| 培训结果 | `training_records.result` | 合格/不合格 |
| 成绩 | `training_records.score` | |
| 培训师ID | `training_records.trainer_id` | 关联 employee.id |
| 关联计划 | `training_records.training_plan_id` | 关联 training_plans.id |
| 计划状态 | `training_plans.status` | draft/ongoing/completed/cancelled |
| 岗位培训要求 | `training_requirements.position_id` | 通过岗位间接关联员工 |

**时效计算规则**：`training_date + validity_period(默认12个月) = 到期日`；状态为过期/临期(≤30天)/正常。

### 2.3 三违数据

**来源表**：`violation_records`

| 数据项 | 来源字段 | 说明 |
|--------|----------|------|
| 三违记录ID | `violation_records.id` | |
| 违章人ID | `violation_records.violator_id` | **关联 employee.id，风险画像主要统计对象** |
| 三违类型 | `violation_records.violation_type` | |
| 严重程度 | `violation_records.violation_level` | 严重/一般/轻微 |
| 风险等级 | `violation_records.risk_level` | 高/中/低 |
| 违章日期 | `violation_records.violation_date` | |
| 发生时间 | `violation_records.occur_time` | |
| 状态 | `violation_records.status` | 待处理/整改中/待复查/已关闭 |
| 是否需复训 | `violation_records.need_retraining` | 严重违章自动为 true |
| 关联培训计划 | `violation_records.training_plan_id` | 复训计划 |
| 检查人ID | `violation_records.inspector_id` | 关联 employee.id |
| 处理人ID | `violation_records.handler_id` | 关联 employee.id |
| 处罚人ID | `violation_records.punisher_id` | 关联 employee.id |

### 2.4 隐患数据

**来源表**：`hazards`

| 数据项 | 来源字段 | 说明 |
|--------|----------|------|
| 隐患ID | `hazards.id` | |
| 发现人ID | `hazards.finder_id` | 关联 employee.id |
| **责任人ID** | `hazards.responsible_id` | **关联 employee.id，风险画像主要统计对象** |
| 整改人ID | `hazards.corrector_id` | 关联 employee.id |
| 复查人ID | `hazards.reviewer_id` | 关联 employee.id |
| 隐患类型 | `hazards.hazard_type` | 设施设备/作业环境/管理体系/人员行为/其他 |
| 风险等级 | `hazards.risk_level` | 重大/一级/二级/三级 |
| 检查时间 | `hazards.hazard_date` | 用于计算整改期限 |
| 整改期限 | `hazards.deadline_days` | 默认30天 |
| 整改日期 | `hazards.rectify_date` | |
| 复查日期 | `hazards.review_date` | |
| 复查结果 | `hazards.review_result` | pass/fail |
| 状态 | `hazards.status` | discovered/processing/pending_review/closed |
| 位置 | `hazards.location` | |

**时效计算规则**：`hazard_date + deadline_days = 整改期限`；状态为过期/临期(≤7天)/正常。

### 2.5 数据来源关系图

```
                    ┌──────────────────┐
                    │     employee     │
                    │  (员工主表)       │
                    └────────┬─────────┘
                             │ employee_id
          ┌──────────────────┼──────────────────┐
          │                  │                  │
          ▼                  ▼                  ▼
  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐
  │training_records│  │violation_records│  │    hazards    │
  │  (培训记录)    │  │  (三违记录)    │  │  (隐患记录)   │
  │employee_id    │  │violator_id    │  │responsible_id │
  │trainer_id     │  │inspector_id   │  │finder_id      │
  │               │  │handler_id     │  │corrector_id   │
  │               │  │punisher_id    │  │reviewer_id    │
  └───────────────┘  └───────────────┘  └───────────────┘
          │                  │                  │
          └──────────────────┼──────────────────┘
                             │
                             ▼
                  ┌─────────────────────┐
                  │  风险画像聚合层      │
                  │  (按 employee_id     │
                  │   聚合四类数据)      │
                  └─────────────────────┘
```

---

## 三、风险指标

### 3.1 指标体系总览

风险画像从五个维度构建指标体系：

| 维度 | 指标 | 数据来源 | 统计方式 |
|------|------|----------|----------|
| 培训 | 培训完成率 | training_records | 合格培训数 / 应培训数 |
| 三违 | 三违次数 | violation_records | 按 violator_id 统计总次数 |
| 三违 | 严重三违次数 | violation_records | violation_level='严重' 的次数 |
| 隐患 | 隐患责任次数 | hazards | 按 responsible_id 统计次数 |
| 隐患 | 超期整改次数 | hazards | 超过 deadline_days 且未关闭的次数 |

### 3.2 培训维度指标

#### 3.2.1 培训完成率

**定义**：员工已完成且合格的培训数占应完成培训数的比例。

**计算公式**：

```
培训完成率 = 合格培训记录数 / 应培训数 × 100%
```

**数据来源**：
- 分子：`training_records WHERE employee_id = ? AND result = '合格' AND is_deleted = false`
- 分母：基于 `training_requirements`（岗位驱动）确定的该岗位应培训项目数

**统计周期**：近12个月（滚动年度）

**阈值**：
- 完成率 ≥ 90%：低风险
- 完成率 60%-89%：中风险
- 完成率 < 60%：高风险

#### 3.2.2 培训时效状态

**定义**：最近一次培训的证书时效状态。

**计算规则**：`training_date + 12个月 = 到期日`

| 状态 | 判定条件 |
|------|----------|
| 正常 | 距到期日 > 30天 |
| 临期 | 距到期日 ≤ 30天 |
| 过期 | 已超过到期日 |
| 未培训 | 无培训记录 |

### 3.3 三违维度指标

#### 3.3.1 三违次数

**定义**：员工作为违章人（violator_id）的三违记录总数。

**计算公式**：

```
三违次数 = COUNT(violation_records WHERE violator_id = ? AND is_deleted = false)
```

**统计周期**：近12个月（滚动年度）

#### 3.3.2 严重三违次数

**定义**：严重程度为"严重"的三违记录数。

**计算公式**：

```
严重三违次数 = COUNT(violation_records WHERE violator_id = ? AND violation_level = '严重' AND is_deleted = false)
```

**统计周期**：近12个月（滚动年度）

#### 3.3.3 高风险三违次数

**定义**：风险等级为"高"的三违记录数。

**计算公式**：

```
高风险三违次数 = COUNT(violation_records WHERE violator_id = ? AND risk_level = '高' AND is_deleted = false)
```

### 3.4 隐患维度指标

#### 3.4.1 隐患责任次数

**定义**：员工作为隐患责任人（responsible_id）的隐患记录总数。

**计算公式**：

```
隐患责任次数 = COUNT(hazards WHERE responsible_id = ? AND is_deleted = false)
```

**统计周期**：近12个月（滚动年度）

#### 3.4.2 超期整改次数

**定义**：员工作为责任人，且隐患整改超期的次数。

**计算公式**：

```
超期整改次数 = COUNT(hazards 
  WHERE responsible_id = ? 
    AND is_deleted = false 
    AND status != 'closed'
    AND hazard_date IS NOT NULL
    AND hazard_date + deadline_days < CURRENT_DATE)
```

**统计周期**：近12个月（滚动年度）

#### 3.4.3 隐患复发率

**定义**：责任人重复负责同类隐患的比例。

**计算公式**：

```
隐患复发率 = 重复隐患数 / 隐患责任总数 × 100%
```

### 3.5 指标汇总表

| 指标编号 | 指标名称 | 维度 | 计算方式 | 统计周期 |
|:--------:|----------|:----:|----------|:--------:|
| M-01 | 培训完成率 | 培训 | 合格培训数/应培训数 | 近12月 |
| M-02 | 培训时效状态 | 培训 | 最近培训到期日 | 当前 |
| M-03 | 三违次数 | 三违 | COUNT(violator_id) | 近12月 |
| M-04 | 严重三违次数 | 三违 | COUNT(violation_level='严重') | 近12月 |
| M-05 | 高风险三违次数 | 三违 | COUNT(risk_level='高') | 近12月 |
| M-06 | 隐患责任次数 | 隐患 | COUNT(responsible_id) | 近12月 |
| M-07 | 超期整改次数 | 隐患 | COUNT(超期未关闭) | 近12月 |
| M-08 | 隐患复发率 | 隐患 | 重复隐患/总隐患 | 近12月 |

---

## 四、风险计算规则

### 4.1 风险等级定义

| 风险等级 | 标识 | 说明 |
|:--------:|:----:|------|
| 低风险 | low | 员工安全行为良好，培训到位，无显著风险因素 |
| 中风险 | medium | 存在一定风险因素，需关注和改进 |
| 高风险 | high | 存在明显风险因素，需重点监管和干预 |

### 4.2 风险评分模型

采用**加权评分法**，总分100分，各指标按权重分配。

#### 4.2.1 指标权重分配

| 指标 | 权重 | 满分 | 评分方向 |
|------|:----:|:----:|----------|
| 培训完成率 | 20% | 20 | 正向（越高越好） |
| 培训时效状态 | 10% | 10 | 正向 |
| 三违次数 | 25% | 25 | 反向（越少越好） |
| 严重三违次数 | 20% | 20 | 反向 |
| 隐患责任次数 | 10% | 10 | 反向 |
| 超期整改次数 | 15% | 15 | 反向 |
| **合计** | **100%** | **100** | |

#### 4.2.2 评分细则

**培训完成率（满分20）**：

| 完成率 | 得分 |
|--------|:----:|
| ≥ 90% | 20 |
| 75%-89% | 15 |
| 60%-74% | 10 |
| 40%-59% | 5 |
| < 40% | 0 |

**培训时效状态（满分10）**：

| 状态 | 得分 |
|------|:----:|
| 正常 | 10 |
| 临期 | 5 |
| 过期 | 0 |
| 未培训 | 0 |

**三违次数（满分25，反向）**：

| 次数 | 得分 |
|------|:----:|
| 0次 | 25 |
| 1次 | 18 |
| 2次 | 10 |
| 3次 | 5 |
| ≥ 4次 | 0 |

**严重三违次数（满分20，反向）**：

| 次数 | 得分 |
|------|:----:|
| 0次 | 20 |
| 1次 | 8 |
| ≥ 2次 | 0 |

**隐患责任次数（满分10，反向）**：

| 次数 | 得分 |
|------|:----:|
| 0次 | 10 |
| 1-2次 | 7 |
| 3-5次 | 4 |
| ≥ 6次 | 0 |

**超期整改次数（满分15，反向）**：

| 次数 | 得分 |
|------|:----:|
| 0次 | 15 |
| 1次 | 8 |
| 2次 | 4 |
| ≥ 3次 | 0 |

#### 4.2.3 风险等级判定

| 总分 | 风险等级 |
|:----:|:--------:|
| ≥ 80 | 低风险（low） |
| 60-79 | 中风险（medium） |
| < 60 | 高风险（high） |

### 4.3 一票否决规则

以下情况直接判定为**高风险**，不受总分影响：

| 规则编号 | 条件 | 说明 |
|:--------:|------|------|
| V-01 | 近12个月严重三违次数 ≥ 2 | 屡次严重违章 |
| V-02 | 近12个月超期整改次数 ≥ 3 | 屡次整改超期 |
| V-03 | 培训完成率 < 30% | 培训严重缺失 |
| V-04 | 培训证书过期且未补训 | 资质失效 |

### 4.4 风险计算示例

**示例员工**：张三，保洁员，近12个月数据如下：

| 指标 | 数值 | 得分 |
|------|------|:----:|
| 培训完成率 | 85% | 15 |
| 培训时效状态 | 正常 | 10 |
| 三违次数 | 1次 | 18 |
| 严重三违次数 | 0次 | 20 |
| 隐患责任次数 | 2次 | 7 |
| 超期整改次数 | 0次 | 15 |
| **总分** | | **85** |

**判定结果**：总分85 ≥ 80，风险等级为**低风险**。

---

## 五、展示设计

### 5.1 页面结构

员工风险画像页面采用**单页多区块**布局，自上而下分为六个区块：

```
┌─────────────────────────────────────────────────┐
│                 员工风险画像                      │
├─────────────────────────────────────────────────┤
│  [员工搜索选择器]                                 │
├─────────────────────────────────────────────────┤
│  区块1：基础信息                                  │
│  ┌──────────┬──────────┬──────────┐            │
│  │ 姓名      │ 工号     │ 年龄      │            │
│  │ 性别      │ 人员类型 │ 人员分类   │            │
│  └──────────┴──────────┴──────────┘            │
├─────────────────────────────────────────────────┤
│  区块2：岗位信息                                  │
│  ┌──────────┬──────────┬──────────┐            │
│  │ 所属组织   │ 作业单元 │ 岗位名称   │            │
│  │ 岗位类别   │ 岗位风险 │ 入职日期   │            │
│  └──────────┴──────────┴──────────┘            │
├─────────────────────────────────────────────────┤
│  区块3：风险等级总览                              │
│  ┌─────────────────────────────────────┐        │
│  │     [风险等级标签]  [风险评分]        │        │
│  │     [风险雷达图]                      │        │
│  └─────────────────────────────────────┘        │
├─────────────────────────────────────────────────┤
│  区块4：培训情况                                  │
│  ┌─────────────────────────────────────┐        │
│  │ 培训完成率：85%      [进度条]         │        │
│  │ 培训时效：正常        [标签]          │        │
│  │ 累计培训：12次       累计学时：48h    │        │
│  │ 最近培训：2025-06-15                 │        │
│  │ [培训记录列表]                        │        │
│  └─────────────────────────────────────┘        │
├─────────────────────────────────────────────────┤
│  区块5：三违情况                                  │
│  ┌─────────────────────────────────────┐        │
│  │ 三违次数：1次      严重三违：0次      │        │
│  │ 高风险三违：0次    最近三违：2025-03  │        │
│  │ [三违记录列表]                        │        │
│  └─────────────────────────────────────┘        │
├─────────────────────────────────────────────────┤
│  区块6：隐患责任                                  │
│  ┌─────────────────────────────────────┐        │
│  │ 隐患责任：2次      超期整改：0次      │        │
│  │ 隐患复发率：0%     最近隐患：2025-04  │        │
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

#### 5.2.2 基础信息区块

| 字段 | 来源 | 展示方式 |
|------|------|----------|
| 姓名 | employee.name | 文本 |
| 工号 | employee.employee_code | 文本 |
| 性别 | employee.gender | 文本 |
| 年龄 | 计算 | 文本 |
| 人员类型 | employee.person_type | 标签 |
| 人员分类 | employee.person_category | 标签 |

展示组件：Descriptions（描述列表）

#### 5.2.3 岗位信息区块

| 字段 | 来源 | 展示方式 |
|------|------|----------|
| 所属组织 | v_employee_current.org_name | 文本 |
| 组织路径 | v_employee_current.org_path | 面包屑 |
| 作业单元 | v_employee_current.unit_name | 文本 |
| 岗位名称 | v_employee_current.position_name | 文本 |
| 岗位类别 | v_employee_current.position_type | 标签 |
| 岗位风险等级 | v_employee_current.risk_level | 彩色标签 |
| 是否安全关键岗 | v_employee_current.is_safety_critical | 标签 |
| 入职日期 | v_employee_current.start_date | 日期 |

展示组件：Descriptions（描述列表）

#### 5.2.4 风险等级总览区块

| 元素 | 说明 |
|------|------|
| 风险等级标签 | 低风险(绿)/中风险(橙)/高风险(红)，使用 Tag 组件 |
| 风险评分 | 数值显示，使用 Statistic 组件 |
| 风险雷达图 | 六维雷达图：培训完成率、培训时效、三违、严重三违、隐患责任、超期整改 |
| 一票否决提示 | 若触发一票否决规则，显示红色提示 |

展示组件：Tag + Statistic + 雷达图（使用现有图表组件或简单 CSS 实现）

**雷达图维度**：

| 维度 | 满分 | 归一化 |
|------|:----:|:------:|
| 培训完成率 | 20 | 得分/20 |
| 培训时效 | 10 | 得分/10 |
| 三违 | 25 | 得分/25 |
| 严重三违 | 20 | 得分/20 |
| 隐患责任 | 10 | 得分/10 |
| 超期整改 | 15 | 得分/15 |

#### 5.2.5 培训情况区块

| 元素 | 说明 |
|------|------|
| 培训完成率 | Progress 进度条，显示百分比 |
| 培训时效状态 | Tag 标签（正常/临期/过期/未培训） |
| 累计培训次数 | 数值 |
| 累计培训学时 | 数值（小时） |
| 最近培训日期 | 日期 |
| 培训记录列表 | Table 表格，显示近12个月培训记录 |

**培训记录列表列**：

| 列名 | 字段 | 宽度 |
|------|------|:----:|
| 培训类型 | training_type | 120 |
| 培训日期 | training_date | 120 |
| 时长(分钟) | duration_minutes | 100 |
| 结果 | result | 80 |
| 成绩 | score | 80 |
| 培训师 | trainer | 100 |

#### 5.2.6 三违情况区块

| 元素 | 说明 |
|------|------|
| 三违次数 | 数值，近12个月 |
| 严重三违次数 | 数值，红色高亮 |
| 高风险三违次数 | 数值，红色高亮 |
| 最近三违日期 | 日期 |
| 三违记录列表 | Table 表格，显示近12个月三违记录 |

**三违记录列表列**：

| 列名 | 字段 | 宽度 |
|------|------|:----:|
| 三违类型 | violation_type | 120 |
| 严重程度 | violation_level | 100 |
| 风险等级 | risk_level | 90 |
| 违章日期 | violation_date | 120 |
| 状态 | status | 90 |
| 描述 | description | 200 |

#### 5.2.7 隐患责任区块

| 元素 | 说明 |
|------|------|
| 隐患责任次数 | 数值，近12个月 |
| 超期整改次数 | 数值，红色高亮 |
| 隐患复发率 | 百分比 |
| 最近隐患日期 | 日期 |
| 隐患记录列表 | Table 表格，显示近12个月作为责任人的隐患记录 |

**隐患记录列表列**：

| 列名 | 字段 | 宽度 |
|------|------|:----:|
| 隐患类型 | hazard_type | 100 |
| 风险等级 | risk_level | 90 |
| 检查时间 | hazard_date | 120 |
| 状态 | status | 90 |
| 到期提醒 | 计算字段 | 100 |
| 描述 | description | 200 |

### 5.3 交互设计

#### 5.3.1 员工切换

- 选择员工后，所有区块数据联动刷新
- 使用 loading 状态显示数据加载中

#### 5.3.2 统计周期切换

- 提供"近3个月/近6个月/近12个月/全部"周期切换
- 切换后重新计算风险指标和评分

#### 5.3.3 记录详情跳转

- 培训记录、三违记录、隐患记录支持点击跳转到对应模块详情页
- 跳转时携带记录ID参数

#### 5.3.4 风险预警提示

- 高风险员工：页面顶部显示红色预警横幅
- 一票否决：显示具体触发的一票否决规则

### 5.4 权限设计

| 操作 | 权限 | 说明 |
|------|------|------|
| 查看风险画像 | hse:risk-profile:view | 查看员工风险画像 |
| 查看所有员工 | hse:risk-profile:view-all | 管理员权限 |
| 导出风险报告 | hse:risk-profile:export | 导出单个员工风险报告 |

权限实现：复用现有 useAccess，不修改 auth/JWT。

---

## 六、数据聚合方案

### 6.1 聚合策略

风险画像采用**实时聚合**策略，不新增数据表，通过 SQL 联合查询实时计算。

**优势**：
- 数据实时性强，无需定时同步
- 不新增表，符合"禁止修改模型"约束
- 实现简单，复用现有表结构

**劣势**：
- 查询性能依赖索引优化
- 大数据量下需考虑缓存（后续优化）

### 6.2 聚合查询设计

**核心查询**：以 employee_id 为入参，聚合四类业务数据。

```sql
-- 培训维度聚合
SELECT
  COUNT(*) AS training_count,
  SUM(CASE WHEN result = '合格' THEN 1 ELSE 0 END) AS qualified_count,
  SUM(duration_minutes) AS total_minutes,
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

-- 隐患维度聚合
SELECT
  COUNT(*) AS hazard_count,
  SUM(CASE WHEN status != 'closed'
           AND hazard_date + (deadline_days || ' days')::interval < CURRENT_DATE
           THEN 1 ELSE 0 END) AS overdue_count,
  MAX(hazard_date) AS last_hazard_date
FROM hazards
WHERE responsible_id = $1 AND is_deleted = false
  AND hazard_date >= CURRENT_DATE - INTERVAL '12 months';
```

### 6.3 性能保障

| 保障措施 | 说明 |
|----------|------|
| 索引利用 | 复用现有索引：idx_training_records_employee、idx_violation_records_violator_id、idx_hazards_responsible_id |
| 查询限制 | 统计周期限制为近12个月，避免全表扫描 |
| 分页加载 | 培训/三违/隐患记录列表分页加载，每页10条 |
| 缓存预留 | 后续可引入 Redis 缓存聚合结果，TTL 5分钟 |

---

## 七、与现有系统的关系

### 7.1 不修改的模块

| 模块 | 表 | 说明 |
|------|----|----|
| 员工模型 | employee, employee_assignment, position | 不修改表结构和业务逻辑 |
| 培训模型 | training_records, training_plans, training_requirements | 不修改表结构和业务逻辑 |
| 三违模型 | violation_records | 不修改表结构和业务逻辑 |
| 隐患模型 | hazards | 不修改表结构和业务逻辑 |

### 7.2 复用的能力

| 能力 | 来源 | 用途 |
|------|------|------|
| v_employee_current 视图 | 现有 | 员工基础信息和岗位信息展示 |
| EmployeeSelector 组件 | 现有 | 员工选择器 |
| useAccess | 现有 | 权限控制 |
| $t i18n | 现有 | 国际化 |
| @vben/request | 现有 | API 请求 |
| Ant Design Vue | 现有 | UI 组件 |
| Tag/Progress/Statistic/Table | 现有 | 展示组件 |

### 7.3 新增的内容（仅设计，不含开发）

| 内容 | 类型 | 说明 |
|------|------|------|
| 风险画像页面路由 | 路由配置 | /hse/risk-profile |
| 风险画像 API | API 接口 | GET /api/risk-profile/:employeeId |
| 风险计算规则 | 业务逻辑 | 应用层规则计算 |
| 风险画像页面 | 前端页面 | risk-profile/index.vue |

**注意**：以上内容为后续开发阶段（非本Sprint）的实施项，本Sprint仅完成设计。

---

## 八、后续开发建议

### 8.1 开发分阶段建议

| 阶段 | 内容 | 优先级 |
|:----:|------|:------:|
| 1 | 后端风险画像聚合API | 高 |
| 2 | 前端风险画像页面（基础信息+岗位+风险等级） | 高 |
| 3 | 前端培训/三违/隐患区块 | 高 |
| 4 | 风险雷达图 | 中 |
| 5 | 风险报告导出 | 中 |
| 6 | 高风险员工预警列表 | 中 |
| 7 | Redis 缓存优化 | 低 |

### 8.2 扩展方向

1. **趋势分析** - 展示员工风险评分变化趋势曲线
2. **对比分析** - 同岗位/同部门员工风险对比
3. **风险预警推送** - 高风险员工自动推送通知给直接上级
4. **培训建议** - 基于风险指标自动推荐培训计划
5. **岗位调岗建议** - 持续高风险员工的调岗建议

---

## 九、附录

### 9.1 风险评分计算表

| 指标 | 权重 | 满分 | 评分方向 | 评分规则 |
|------|:----:|:----:|:--------:|----------|
| 培训完成率 | 20% | 20 | 正向 | ≥90%→20, 75-89%→15, 60-74%→10, 40-59%→5, <40%→0 |
| 培训时效 | 10% | 10 | 正向 | 正常→10, 临期→5, 过期→0, 未培训→0 |
| 三违次数 | 25% | 25 | 反向 | 0→25, 1→18, 2→10, 3→5, ≥4→0 |
| 严重三违 | 20% | 20 | 反向 | 0→20, 1→8, ≥2→0 |
| 隐患责任 | 10% | 10 | 反向 | 0→10, 1-2→7, 3-5→4, ≥6→0 |
| 超期整改 | 15% | 15 | 反向 | 0→15, 1→8, 2→4, ≥3→0 |

### 9.2 一票否决规则表

| 规则 | 条件 | 说明 |
|------|------|------|
| V-01 | 严重三违 ≥ 2次（近12月） | 屡次严重违章 |
| V-02 | 超期整改 ≥ 3次（近12月） | 屡次整改超期 |
| V-03 | 培训完成率 < 30% | 培训严重缺失 |
| V-04 | 培训证书过期且未补训 | 资质失效 |

### 9.3 数据字段映射总表

| 画像字段 | 来源表 | 来源字段 | 说明 |
|----------|--------|----------|------|
| employeeId | employee | id | 员工ID |
| name | employee | name | 姓名 |
| employeeCode | employee | employee_code | 工号 |
| gender | employee | gender | 性别 |
| age | 计算 | EXTRACT(YEAR FROM age(birth_date)) | 年龄 |
| personType | employee | person_type | 人员类型 |
| personCategory | employee | person_category | 人员分类 |
| orgName | v_employee_current | org_name | 所属组织 |
| orgPath | v_employee_current | org_path | 组织路径 |
| unitName | v_employee_current | unit_name | 作业单元 |
| positionName | v_employee_current | position_name | 岗位名称 |
| positionType | v_employee_current | position_type | 岗位类别 |
| positionRiskLevel | v_employee_current | risk_level | 岗位风险等级 |
| isSafetyCritical | v_employee_current | is_safety_critical | 安全关键岗 |
| startDate | v_employee_current | start_date | 入职日期 |
| trainingCount | training_records | COUNT(*) | 培训次数 |
| trainingCompletionRate | training_records | 计算 | 培训完成率 |
| trainingExpiryStatus | training_records | 计算 | 培训时效 |
| violationCount | violation_records | COUNT(violator_id) | 三违次数 |
| seriousViolationCount | violation_records | COUNT(violation_level='严重') | 严重三违 |
| highRiskViolationCount | violation_records | COUNT(risk_level='高') | 高风险三违 |
| hazardResponsibleCount | hazards | COUNT(responsible_id) | 隐患责任次数 |
| overdueRectificationCount | hazards | COUNT(超期) | 超期整改 |
| riskScore | 计算 | 加权评分 | 风险评分 |
| riskLevel | 计算 | 规则判定 | 风险等级 |

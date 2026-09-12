# HSE风险画像中心设计报告

> 版本：v1.3（集团考核融合版·最终完善）
> 阶段：Sprint5.14（设计阶段，不含开发）
> 日期：2026年7月21日
> 修订依据：v1.3 审核意见

---

## 一、设计目标

### 1.1 业务目标

建设 **HSE风险画像中心**，整合员工、培训、三违、隐患、交通安全、事故等多源数据，为项目公司安环管理部、区域检查、集团领导检查展示提供全面的风险可视化能力。

**服务对象**：项目公司安环管理部

**职责边界**：

| 职责 | 安环管理部 | 生产管理部 |
|------|:---------:|:---------:|
| 安全风险 | ✅ | |
| 人员风险 | ✅ | |
| 事故风险 | ✅ | |
| 行为风险 | ✅ | |
| 驾驶员安全行为画像 | ✅ | |
| 车辆维修 | | ✅ |
| 车辆保养 | | ✅ |
| 车辆年检 | | ✅ |
| 生产车辆管理 | | ✅ |

### 1.2 设计原则

| 原则 | 说明 |
|------|------|
| 统一人员关联 | 使用 `employee_id` 作为唯一人员标识，禁止姓名关联 |
| 数据只读整合 | 风险画像仅读取各类业务模块数据，不修改其表结构和业务逻辑 |
| 规则可配置 | 风险等级和权重由集团级规则配置计算，禁止硬编码 |
| 最小侵入 | 本Sprint仅做设计分析，不修改现有模型、不新增依赖 |
| 禁止新增人员表 | 复用现有员工主数据模型 |
| 禁止新增三违表 | 复用现有 violation_records 表，仅读取数据 |
| 职责边界清晰 | 仅设计安环管理部职责范围内的内容 |
| 三检归属明确 | 三检属于驾驶员安全行为，不是车辆属性 |
| 权重禁止写死 | 风险权重由集团规则配置，支持不同岗位不同权重 |

### 1.3 系统范围

HSE风险画像中心包含以下画像模块：

| 模块 | 说明 |
|------|------|
| 员工风险画像 | 员工个人安全风险综合评估 |
| 驾驶员综合安全行为画像 | 驾驶员专属安全行为画像（融合分散的驾驶员风险数据） |
| 组织风险画像 | 按组织架构分析风险分布 |
| 车辆风险画像 | 车辆基础情况、历史使用情况、关联事故 |
| 风险分级管控画像 | 双重预防机制可视化 |

---

## 二、员工安全风险画像

### 2.1 数据来源

| 维度 | 数据来源 | 关联字段 |
|------|----------|----------|
| 培训风险 | training_records | employee_id |
| 三违风险（作业行为风险） | violation_records | violator_id |
| 交通安全风险 | hse_traffic_records, hse_traffic_violations, hse_traffic_accidents, hse_vehicle_usage_history | employee_id |
| 驾驶员安全行为风险 | hse_driver_inspection_records | employee_id |
| 事故风险 | hse_incident_records | employee_id |
| 隐患责任风险 | hazards | responsible_id |

### 2.2 风险指标体系

#### 2.2.1 培训风险

| 指标编号 | 指标名称 | 计算方式 | 统计周期 |
|:--------:|----------|----------|:--------:|
| M-01 | 培训完成率 | 合格培训数/应培训数 | 近12月 |
| M-02 | 逾期培训次数 | COUNT(过期/临期) | 近12月 |
| M-03 | 岗位培训符合率 | 岗位要求培训合格数/岗位要求培训总数 | 当前 |

#### 2.2.2 三违风险（作业行为风险）

> **数据来源**：现有 `violation_records` 表（只读，禁止新增三违表）

| 指标编号 | 指标名称 | 计算方式 | 统计周期 |
|:--------:|----------|----------|:--------:|
| M-04 | 三违次数 | COUNT(violator_id) | 近12月 |
| M-05 | 严重三违次数 | COUNT(violation_level='严重') | 近12月 |
| M-06 | 重复三违次数 | 同类三违重复发生次数 | 近12月 |
| M-07 | 近12个月三违趋势 | 按月统计三违次数 | 近12月 |

#### 2.2.3 交通安全风险

**驾驶证扣分（近5年）**：

| 指标编号 | 指标名称 | 计算方式 | 统计周期 |
|:--------:|----------|----------|:--------:|
| M-08 | 累计扣分 | SUM(points_deducted) | 近5年 |
| M-09 | 扣分次数 | COUNT | 近5年 |
| M-10 | 最高单次扣分 | MAX(points_deducted) | 近5年 |
| M-11 | 最近一次扣分时间 | MAX(violation_date) | 近5年 |
| M-12 | 近5年扣分趋势 | 按年/按月统计 | 近5年 |

**交通违法（近5年）**：

| 指标编号 | 指标名称 | 计算方式 | 统计周期 |
|:--------:|----------|----------|:--------:|
| M-13 | 交通违法次数 | COUNT | 近5年 |
| M-14 | 违法类型分布 | GROUP BY violation_code | 近5年 |

**交通事故（近5年或集团规则配置）**：

| 指标编号 | 指标名称 | 计算方式 | 统计周期 |
|:--------:|----------|----------|:--------:|
| M-15 | 驾驶事故次数 | COUNT | 近5年或集团规则配置 |
| M-16 | 责任事故次数 | COUNT(responsibility='main') | 近5年或集团规则配置 |

#### 2.2.4 驾驶员安全行为风险

> **数据来源**：`hse_driver_inspection_records` 表（三检属于驾驶员安全行为）
> **计算规则**：三检完成率必须考虑应执行次数，考虑请假、调休、非出车日、替班情况

| 指标编号 | 指标名称 | 计算方式 | 统计周期 |
|:--------:|----------|----------|:--------:|
| M-17 | 三检完成率 | 实际完成次数/应执行次数 | 近30天 |
| M-18 | 三检缺失次数 | 应执行次数-实际完成次数 | 近30天 |
| M-19 | 三检整改完成率 | 已整改问题数/发现问题总数 | 近30天 |

#### 2.2.5 事故风险

| 指标编号 | 指标名称 | 计算方式 | 统计周期 |
|:--------:|----------|----------|:--------:|
| M-20 | 事故次数 | COUNT(employee_id) | 近12月 |
| M-21 | 事故等级 | MAX(incident_level) | 近12月 |
| M-22 | 责任等级 | MAX(responsibility) | 近12月 |
| M-23 | 整改完成情况 | 整改完成率 | 当前 |

#### 2.2.6 隐患责任风险

| 指标编号 | 指标名称 | 计算方式 | 统计周期 |
|:--------:|----------|----------|:--------:|
| M-24 | 责任隐患次数 | COUNT(responsible_id) | 近12月 |
| M-25 | 重大隐患次数 | COUNT(risk_level='重大') | 近12月 |
| M-26 | 整改超期次数 | COUNT(超期未关闭) | 近12月 |

### 2.3 风险评分模型（集团规则配置）

> **重要**：风险权重禁止写死，由集团规则配置，支持不同岗位不同权重。

#### 2.3.1 默认权重配置

采用**加权评分法**，总分100分：

| 维度 | 默认权重 | 满分 | 驾驶员 | 非驾驶员 |
|------|:--------:|:----:|:------:|:--------:|
| 培训风险 | 20% | 20 | 20 | 20 |
| 三违风险 | 25% | 25 | 25 | 25 |
| 交通安全风险 | 15% | 15 | 15 | 0 |
| 驾驶员安全行为风险 | 5% | 5 | 5 | 0 |
| 事故风险 | 15% | 15 | 15 | 15 |
| 隐患责任风险 | 20% | 20 | 20 | 20 |
| **合计** | **100%** | **100** | **100** | **80** |

**非驾驶员评分换算公式**：实际得分 / 0.8

#### 2.3.2 岗位差异化权重配置

支持不同岗位配置不同权重，例如：

| 岗位类别 | 培训 | 三违 | 交通安全 | 驾驶行为 | 事故 | 隐患 |
|----------|:----:|:----:|:--------:|:--------:|:----:|:----:|
| 驾驶员（默认） | 20% | 25% | 15% | 5% | 15% | 20% |
| 驾驶员（高交通风险） | 15% | 20% | 25% | 10% | 15% | 15% |
| 一线作业人员 | 25% | 30% | 0% | 0% | 15% | 30% |
| 管理人员 | 30% | 20% | 0% | 0% | 20% | 30% |

### 2.4 风险等级判定

| 总分 | 风险等级 | 标识 | 颜色 |
|:----:|:--------:|:----:|:----:|
| ≥ 85 | 低风险 | green | 绿色 |
| 70-84 | 中风险 | yellow | 黄色 |
| 50-69 | 高风险 | orange | 橙色 |
| < 50 | 极高风险 | red | 红色 |

### 2.5 一票否决规则

| 规则编号 | 条件 | 说明 |
|:--------:|------|------|
| V-01 | 近12月严重三违 ≥ 2次 | 屡次严重违章 |
| V-02 | 近12月重大事故 ≥ 1次 | 发生重大事故 |
| V-03 | 近5年驾驶证累计扣满12分 | 驾照吊销 |
| V-04 | 近12月重大隐患责任 ≥ 2次 | 屡次重大隐患 |
| V-05 | 近12月事故主要责任 ≥ 2次 | 屡次事故主要责任 |

---

## 三、驾驶员综合安全行为画像

### 3.1 设计目标

将分散的驾驶员风险数据融合为**驾驶员综合安全行为画像**，提供统一的驾驶员安全行为视图。

> 详见《驾驶员综合安全行为画像设计-v1.3.md》

### 3.2 画像结构

```
驾驶员综合安全行为画像
├── 基础信息
│   ├── 员工信息（姓名、工号、年龄、性别）
│   ├── 岗位信息（岗位名称、岗位类别）
│   └── 组织信息（所属组织、作业单元）
│
├── 安全行为风险
│   ├── 三违风险（数据来源：violation_records）
│   ├── 三检风险（数据来源：hse_driver_inspection_records）
│   ├── 交通违法风险（数据来源：hse_traffic_violations）
│   ├── 驾驶证扣分风险（数据来源：hse_traffic_violations）
│   ├── 交通事故风险（数据来源：hse_traffic_accidents）
│   └── 培训风险（数据来源：training_records）
│
└── 综合风险评估
    ├── 风险评分
    ├── 风险等级
    └── 管控措施建议
```

### 3.3 数据来源

所有数据复用已有模块，禁止新增三违表：

| 风险维度 | 数据来源 | 关联字段 |
|----------|----------|----------|
| 三违风险 | violation_records | violator_id |
| 三检风险 | hse_driver_inspection_records | employee_id |
| 交通违法风险 | hse_traffic_violations | employee_id |
| 驾驶证扣分风险 | hse_traffic_violations | employee_id |
| 交通事故风险 | hse_traffic_accidents | employee_id |
| 培训风险 | training_records | employee_id |

---

## 四、组织风险画像

### 4.1 设计目标

按组织架构分析风险，支持以下组织类型：

| 组织类型 | 说明 |
|----------|------|
| 环卫作业中心 | 道路清扫、垃圾收集等作业单元 |
| 乡镇作业中心 | 乡镇区域作业单元 |
| 转运站 | 垃圾中转站 |
| 车辆作业单元 | 车辆运营单元 |

### 4.2 组织风险指标

| 指标编号 | 指标名称 | 计算方式 | 统计周期 |
|:--------:|----------|----------|:--------:|
| O-01 | 风险数量 | 区域内风险总数 | 当前 |
| O-02 | 隐患数量 | 区域内隐患总数 | 当前 |
| O-03 | 三违数量 | 区域内三违总数 | 近12月 |
| O-04 | 事故数量 | 区域内事故总数 | 近12月 |
| O-05 | 培训完成率 | 区域内员工培训完成率 | 当前 |
| O-06 | 高风险员工数 | 风险等级为orange/red的员工数 | 当前 |
| O-07 | 重大隐患数 | 区域内重大隐患数 | 当前 |
| O-08 | 整改完成率 | 隐患整改完成率 | 当前 |

---

## 五、车辆风险画像

### 5.1 设计目标

车辆画像仅展示与HSE相关的内容，**删除所有属于生产管理职责的内容**。

### 5.2 车辆画像内容（精简后）

| 内容 | 说明 | 数据来源 |
|------|------|----------|
| 车辆基础信息 | 车牌、车型、所属作业单元 | vehicles |
| 历史使用情况 | 驾驶员使用历史 | hse_vehicle_usage_history |
| 关联事故 | 车辆相关交通事故 | hse_traffic_accidents |
| 检查历史查询 | 车辆相关的三检记录查询（只读） | hse_driver_inspection_records |

### 5.3 删除内容

| 删除内容 | 删除原因 |
|----------|----------|
| 三检完成率 | 三检属于驾驶员安全行为，不属于车辆属性 |
| 车辆故障次数 | 属于生产管理职责 |
| 车辆异常次数 | 属于生产管理职责 |
| 维修次数 | 属于生产管理职责 |
| 年检提醒 | 属于生产管理职责 |

---

## 六、风险分级管控画像

### 6.1 设计目标

实现双重预防机制的可视化：

```
风险辨识 → 危险源清单 → 风险评价 → 风险等级 → 管控措施 → 责任部门 → 责任人员
                                                              │
                                                              ▼
                                                    检查 → 隐患 → 整改
```

### 6.2 风险分级管控指标

| 指标编号 | 指标名称 | 计算方式 | 统计周期 |
|:--------:|----------|----------|:--------:|
| R-01 | 危险源数量 | 危险源清单总数 | 当前 |
| R-02 | 重大风险源数量 | 风险等级为高/极高的危险源数 | 当前 |
| R-03 | 管控措施覆盖率 | 已落实管控措施的风险源数/总风险源数 | 当前 |
| R-04 | 检查计划完成率 | 已完成检查次数/计划检查次数 | 近30天 |
| R-05 | 隐患发现率 | 检查发现隐患数/检查次数 | 近30天 |
| R-06 | 隐患整改完成率 | 已整改隐患数/总隐患数 | 当前 |
| R-07 | 重复隐患率 | 重复出现的隐患数/总隐患数 | 近12月 |
| R-08 | 风险等级分布 | 各等级风险源数量分布 | 当前 |

---

## 七、风险规则配置设计

### 7.1 设计目标

风险权重和等级规则由集团统一配置，**禁止硬编码**。

### 7.2 配置内容

| 配置项 | 说明 |
|--------|------|
| 风险维度权重 | 各风险维度的权重配置（按岗位类别） |
| 风险等级阈值 | 风险等级判定的分数阈值 |
| 一票否决规则 | 一票否决条件配置 |
| 统计周期配置 | 各指标的统计周期配置 |
| 评分细则 | 各指标的评分规则 |

### 7.3 配置表设计

#### 7.3.1 hse_risk_weight_config（风险权重配置表）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键 |
| config_code | VARCHAR(64) | UNIQUE | 配置编码 |
| config_name | VARCHAR(128) | NOT NULL | 配置名称 |
| position_category | VARCHAR(32) | | 岗位类别（driver/worker/manager/all） |
| dimension_code | VARCHAR(32) | NOT NULL | 风险维度编码 |
| weight | DECIMAL(5,2) | NOT NULL | 权重（百分比） |
| enabled | BOOLEAN | DEFAULT TRUE | 是否启用 |
| remark | TEXT | | 备注 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | 更新时间 |

#### 7.3.2 hse_risk_level_config（风险等级配置表）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键 |
| level_code | VARCHAR(32) | UNIQUE | 等级编码（green/yellow/orange/red） |
| level_name | VARCHAR(32) | NOT NULL | 等级名称 |
| min_score | DECIMAL(5,2) | NOT NULL | 最低分数 |
| max_score | DECIMAL(5,2) | NOT NULL | 最高分数 |
| color | VARCHAR(16) | | 颜色 |
| enabled | BOOLEAN | DEFAULT TRUE | 是否启用 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | 更新时间 |

#### 7.3.3 hse_risk_veto_config（一票否决配置表）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键 |
| veto_code | VARCHAR(64) | UNIQUE | 否决规则编码 |
| veto_name | VARCHAR(128) | NOT NULL | 否决规则名称 |
| dimension_code | VARCHAR(32) | NOT NULL | 风险维度编码 |
| condition_type | VARCHAR(32) | NOT NULL | 条件类型（count/sum/max） |
| condition_value | DECIMAL(10,2) | NOT NULL | 条件值 |
| period | VARCHAR(32) | | 统计周期 |
| enabled | BOOLEAN | DEFAULT TRUE | 是否启用 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | 更新时间 |

---

## 八、数据聚合方案

### 8.1 聚合策略

风险画像采用**实时聚合**策略，不新增数据表，通过 SQL 联合查询实时计算。

### 8.2 员工风险画像聚合查询

```sql
SELECT
  e.id AS employee_id,
  e.name,
  e.employee_code,
  -- 培训维度
  (SELECT COUNT(*) FROM training_records tr 
   WHERE tr.employee_id = e.id AND tr.is_deleted = false
   AND tr.training_date >= CURRENT_DATE - INTERVAL '12 months') AS training_count,
  (SELECT SUM(CASE WHEN tr.result = '合格' THEN 1 ELSE 0 END) FROM training_records tr 
   WHERE tr.employee_id = e.id AND tr.is_deleted = false) AS qualified_count,
  -- 三违维度（复用现有 violation_records 表）
  (SELECT COUNT(*) FROM violation_records vr 
   WHERE vr.violator_id = e.id AND vr.is_deleted = false
   AND vr.violation_date >= CURRENT_DATE - INTERVAL '12 months') AS violation_count,
  (SELECT COUNT(*) FROM violation_records vr 
   WHERE vr.violator_id = e.id AND vr.is_deleted = false
   AND vr.violation_level = '严重'
   AND vr.violation_date >= CURRENT_DATE - INTERVAL '12 months') AS serious_violation_count,
  -- 事故维度
  (SELECT COUNT(*) FROM hse_incident_records ir 
   WHERE ir.employee_id = e.id AND ir.is_deleted = false
   AND ir.occurred_at >= CURRENT_DATE - INTERVAL '12 months') AS incident_count,
  -- 隐患维度
  (SELECT COUNT(*) FROM hazards h 
   WHERE h.responsible_id = e.id AND h.is_deleted = false
   AND h.hazard_date >= CURRENT_DATE - INTERVAL '12 months') AS hazard_count,
  -- 交通安全维度（近5年）
  (SELECT COALESCE(SUM(tv.points_deducted), 0) FROM hse_traffic_violations tv 
   WHERE tv.employee_id = e.id AND tv.is_deleted = false
   AND tv.violation_date >= CURRENT_DATE - INTERVAL '5 years') AS total_points_deducted,
  (SELECT COUNT(*) FROM hse_traffic_violations tv 
   WHERE tv.employee_id = e.id AND tv.is_deleted = false
   AND tv.violation_date >= CURRENT_DATE - INTERVAL '5 years') AS violation_count_5y,
  -- 驾驶员安全行为维度（三检，近30天，考虑应执行次数）
  (SELECT COUNT(*) FROM hse_driver_inspection_records dir 
   WHERE dir.employee_id = e.id AND dir.is_deleted = false
   AND dir.inspection_result IN ('completed', 'abnormal')
   AND dir.inspection_time >= CURRENT_DATE - INTERVAL '30 days') AS inspection_completed_count,
  (SELECT COUNT(*) FROM hse_driver_inspection_schedule ds 
   WHERE ds.employee_id = e.id AND ds.is_deleted = false
   AND ds.schedule_date >= CURRENT_DATE - INTERVAL '30 days'
   AND ds.is_work_day = true) AS inspection_required_count
FROM employee e
WHERE e.is_deleted = false
ORDER BY e.id;
```

---

## 九、与现有系统的关系

### 9.1 不修改的模块

| 模块 | 表 | 说明 |
|------|----|------|
| 员工模型 | employee, employee_assignment, position | 不修改表结构和业务逻辑 |
| 培训模型 | training_records, training_plans, training_requirements | 不修改表结构和业务逻辑 |
| 三违模型 | violation_records | 不修改表结构和业务逻辑，仅读取数据 |
| 隐患模型 | hazards | 不修改表结构和业务逻辑 |

### 9.2 新增设计的模块

| 模块 | 表 | 说明 |
|------|----|------|
| 事故管理 | hse_incident_records, hse_incident_participants | 独立事故管理模块 |
| 交通安全 | hse_traffic_records, hse_traffic_violations, hse_traffic_accidents | 独立交通安全模块 |
| 车辆使用记录 | hse_vehicle_usage_history | 驾驶员车辆使用记录 |
| 驾驶员三检记录 | hse_driver_inspection_records, hse_driver_inspection_schedule | 驾驶员安全行为记录（三检） |
| 驾驶员风险评估 | hse_driver_risk_assessment | 季度驾驶员安全风险评估档案 |
| 风险规则配置 | hse_risk_weight_config, hse_risk_level_config, hse_risk_veto_config | 集团风险规则配置 |
| 风险分级管控 | hse_risk_sources, hse_risk_controls | 双重预防机制 |

### 9.3 复用的能力

| 能力 | 来源 | 用途 |
|------|------|------|
| v_employee_current 视图 | 现有 | 员工基础信息展示 |
| EmployeeSelector 组件 | 现有 | 员工选择器 |
| useAccess | 现有 | 权限控制 |
| $t i18n | 现有 | 国际化 |
| @vben/request | 现有 | API 请求 |
| Ant Design Vue | 现有 | UI 组件 |

---

## 十、权限设计

| 操作 | 权限代码 | 说明 |
|------|----------|------|
| 查看员工风险画像 | hse:risk-profile:employee:view | |
| 查看驾驶员综合安全行为画像 | hse:risk-profile:driver:view | |
| 查看组织风险画像 | hse:risk-profile:org:view | |
| 查看车辆风险画像 | hse:risk-profile:vehicle:view | |
| 查看风险分级管控画像 | hse:risk-profile:control:view | |
| 查看所有员工画像 | hse:risk-profile:view-all | 管理员权限 |
| 管理风险规则配置 | hse:risk-config:manage | 集团管理员 |
| 导出风险报告 | hse:risk-profile:export | |

---

## 十一、后续开发建议

### 11.1 开发分阶段

| 阶段 | 内容 | 优先级 |
|:----:|------|:------:|
| 1 | 事故管理模块开发 | 高 |
| 2 | 交通安全管理模块开发 | 高 |
| 3 | 驾驶员三检记录模块开发（含排班计算） | 高 |
| 4 | 车辆使用记录模块开发 | 高 |
| 5 | 驾驶员风险评估档案模块开发 | 高 |
| 6 | 风险规则配置模块开发 | 高 |
| 7 | 风险分级管控模块开发 | 高 |
| 8 | 后端风险画像聚合API | 高 |
| 9 | 前端员工风险画像页面 | 高 |
| 10 | 前端驾驶员综合安全行为画像页面 | 高 |
| 11 | 前端组织风险画像页面 | 高 |
| 12 | 前端车辆风险画像页面 | 中 |
| 13 | 前端风险分级管控页面 | 高 |
| 14 | 高风险预警列表 | 中 |
| 15 | 风险报告导出 | 中 |

---

## 十二、修订记录

| 版本 | 日期 | 修订内容 |
|:----:|------|----------|
| v1.0 | 2026-07-21 | 初始版本 |
| v1.1 | 2026-07-21 | 第一次修订：删除车辆管理非HSE内容；驾驶证扣分统计周期改为近5年；车辆关联改为驾驶员车辆使用记录；三检管理改为驾驶员安全行为指标 |
| v1.2 | 2026-07-21 | 第二次修订：员工风险画像增加三违风险维度；三检表名调整为 hse_driver_inspection_records；车辆画像删除三检完成率等非HSE内容 |
| v1.3 | 2026-07-21 | 第三次修订：<br>1. 新增驾驶员综合安全行为画像模块，融合分散的驾驶员风险数据<br>2. 三检计算规则优化，考虑应执行次数（请假、调休、非出车日、替班情况）<br>3. 新增 hse_driver_risk_assessment 表，保存季度驾驶员安全风险评估<br>4. 交通违法统计周期明确：驾驶证扣分近5年、交通违法近5年、交通事故近5年或集团规则配置<br>5. 车辆使用历史完善设计，支持备用车、临时替班、车辆调配<br>6. 风险评分模型优化，权重禁止写死，支持集团规则配置，支持不同岗位不同权重<br>7. 新增风险规则配置表（hse_risk_weight_config, hse_risk_level_config, hse_risk_veto_config） |
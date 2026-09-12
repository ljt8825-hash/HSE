# HSE事故管理设计

> 版本：v2.0（集团考核融合版）
> 阶段：Sprint5.14（设计阶段，不含开发）
> 日期：2026年7月21日

---

## 一、设计目标

### 1.1 业务背景

集团HSE体系需要补充事故管理能力。事故管理作为独立模块，涵盖生产安全事故、交通事故、环境污染事故三大类事故的全生命周期管理，体现事故"四不放过"原则。

### 1.2 设计目标

| 目标 | 说明 |
|------|------|
| 独立事故管理 | 设计独立的事故管理模块，不依赖交通安全模块 |
| 三类事故管理 | 覆盖生产安全事故、交通事故、环境污染事故 |
| 全流程闭环 | 事故上报→调查→分析→整改→结案→专项培训 |
| 人员关联 | 使用 employee_id 关联员工，禁止保存人员姓名 |
| 风险画像数据 | 为员工安全风险画像提供事故维度数据 |
| 事故三违联动 | 建立事故与三违记录的关联关系 |
| 四不放过 | 严格执行事故"四不放过"原则 |

### 1.3 设计原则

| 原则 | 说明 |
|------|------|
| 独立性 | 事故管理模块独立于交通安全模块 |
| 统一人员关联 | 使用 `employee_id` 关联员工主数据 |
| 数据完整性 | 记录事故全流程信息 |
| 可追溯性 | 支持事故原因追溯和整改闭环 |
| 规则可配置 | 事故等级、责任认定规则可配置 |
| 四不放过 | 事故原因未查清不放过、责任人员未处理不放过、整改措施未落实不放过、有关人员未受到教育不放过 |

---

## 二、事故分类设计

### 2.1 事故类型体系

| 事故类型 | 标识 | 说明 | 核心字段 |
|----------|------|------|----------|
| 生产安全事故 | production | 员工在生产作业过程中发生的安全事故 | 受伤员工、工伤信息、医疗情况、责任认定 |
| 交通事故 | traffic | 车辆行驶过程中发生的事故 | 驾驶员、车辆、驾驶证、交通违法、责任认定 |
| 环境污染事故 | environmental | 污染、泄漏等环境影响事件 | 污染类型、影响范围、环境评估、整改措施 |

### 2.2 事故等级体系

| 事故等级 | 标识 | 说明 |
|----------|------|------|
| 重大事故 | major | 造成人员死亡、重伤或重大财产损失 |
| 较大事故 | serious | 造成人员重伤或较大财产损失 |
| 一般事故 | general | 造成人员轻伤或一般财产损失 |
| 轻微事故 | minor | 未造成人员伤亡，财产损失较小 |

### 2.3 责任认定体系

| 责任类型 | 标识 | 说明 |
|----------|------|------|
| 主要责任 | main | 事故主要责任方 |
| 次要责任 | secondary | 事故次要责任方 |
| 同等责任 | equal | 多方同等责任 |
| 无责任 | no | 无责任 |
| 待定 | pending | 责任认定待定 |

### 2.4 四不放过原则

| 原则 | 说明 | 执行要求 |
|------|------|----------|
| 事故原因未查清不放过 | 必须查明事故发生的直接原因和间接原因 | 提交详细的原因分析报告 |
| 责任人员未处理不放过 | 必须对事故责任人员进行严肃处理 | 责任认定后执行相应处罚 |
| 整改措施未落实不放过 | 必须制定切实可行的整改措施并落实到位 | 整改验收合格后方可结案 |
| 有关人员未受到教育不放过 | 必须对相关人员进行安全教育和培训 | 组织事故复盘和培训 |

---

## 三、数据模型设计

### 3.1 表结构设计

#### 3.1.1 hse_incident_records（事故记录表）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键 |
| incident_type | VARCHAR(64) | NOT NULL | 事故类型（production/traffic/environmental） |
| incident_level | VARCHAR(32) | NOT NULL | 事故等级（major/serious/general/minor） |
| occurred_at | TIMESTAMPTZ | NOT NULL | 发生时间 |
| location | VARCHAR(255) | | 发生地点 |
| grid_id | BIGINT | NULL | 网格ID |
| employee_id | BIGINT | NOT NULL, INDEX | 涉事员工ID，关联 employee.id |
| involved_employees | JSONB | | 涉事人员列表（多个员工） |
| vehicle_id | BIGINT | NULL | 涉事车辆ID（交通事故） |
| description | TEXT | | 事故描述 |
| cause_analysis | TEXT | | 原因分析（四不放过：事故原因未查清不放过） |
| root_cause | TEXT | | 根本原因 |
| direct_cause | TEXT | | 直接原因 |
| indirect_cause | TEXT | | 间接原因 |
| responsibility | VARCHAR(32) | DEFAULT 'pending' | 责任认定（main/secondary/equal/no/pending） |
| responsible_punishment | TEXT | | 责任人员处理结果（四不放过：责任人员未处理不放过） |
| rectification | TEXT | | 整改措施（四不放过：整改措施未落实不放过） |
| rectification_status | VARCHAR(32) | DEFAULT 'pending' | 整改状态（pending/in_progress/completed/verified） |
| rectification_deadline | DATE | | 整改期限 |
| rectification_verified_by | BIGINT | NULL | 整改验收人ID |
| rectification_verified_at | TIMESTAMPTZ | | 整改验收时间 |
| education_completed | BOOLEAN | DEFAULT FALSE | 教育是否完成（四不放过：有关人员未受到教育不放过） |
| education_details | TEXT | | 安全教育详情 |
| training_required | BOOLEAN | DEFAULT FALSE | 是否需要专项培训 |
| training_plan_id | BIGINT | NULL | 关联培训计划ID |
| status | VARCHAR(32) | DEFAULT 'reported' | 状态（reported/investigating/analyzing/processing/closed） |
| economic_loss | DECIMAL(12,2) | DEFAULT 0 | 经济损失金额 |
| injuries_count | INT | DEFAULT 0 | 受伤人数 |
| casualties_count | INT | DEFAULT 0 | 死亡人数 |
| environmental_impact | TEXT | | 环境影响描述（环境事件） |
| medical_info | JSONB | | 医疗信息（人身伤害事故） |
| vehicle_damage | TEXT | | 车辆损坏情况（交通事故） |
| insurance_claim | BOOLEAN | DEFAULT FALSE | 是否走保险 |
| claim_amount | DECIMAL(12,2) | DEFAULT 0 | 理赔金额 |
| reporter_id | BIGINT | NULL | 上报人ID |
| report_time | TIMESTAMPTZ | DEFAULT NOW() | 上报时间 |
| investigation_team | JSONB | | 调查组成员 |
| investigation_report | TEXT | | 调查报告 |
| is_deleted | BOOLEAN | DEFAULT FALSE | 软删除标记 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | 更新时间 |

**索引设计**：

| 索引名 | 字段 | 类型 |
|--------|------|------|
| idx_incident_employee_id | employee_id | INDEX |
| idx_incident_type | incident_type | INDEX |
| idx_incident_level | incident_level | INDEX |
| idx_incident_status | status | INDEX |
| idx_incident_occurred_at | occurred_at | INDEX |
| idx_incident_location | location | INDEX |

#### 3.1.2 hse_incident_violation_links（事故三违关联表）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键 |
| incident_id | BIGINT | NOT NULL, INDEX | 关联 hse_incident_records.id |
| violation_id | BIGINT | NOT NULL, INDEX | 关联 violation_records.id |
| link_type | VARCHAR(32) | DEFAULT 'related' | 关联类型（related/cause/contributing） |
| description | TEXT | | 关联说明 |
| is_deleted | BOOLEAN | DEFAULT FALSE | 软删除标记 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 创建时间 |

**索引设计**：

| 索引名 | 字段 | 类型 |
|--------|------|------|
| idx_ivl_incident_id | incident_id | INDEX |
| idx_ivl_violation_id | violation_id | INDEX |

#### 3.1.3 hse_incident_training_links（事故培训关联表）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键 |
| incident_id | BIGINT | NOT NULL, INDEX | 关联 hse_incident_records.id |
| training_plan_id | BIGINT | NULL, INDEX | 关联 training_plans.id |
| training_record_id | BIGINT | NULL, INDEX | 关联 training_records.id |
| link_type | VARCHAR(32) | DEFAULT 'corrective' | 关联类型（corrective/preventive） |
| description | TEXT | | 关联说明 |
| is_deleted | BOOLEAN | DEFAULT FALSE | 软删除标记 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 创建时间 |

**索引设计**：

| 索引名 | 字段 | 类型 |
|--------|------|------|
| idx_itl_incident_id | incident_id | INDEX |
| idx_itl_training_plan_id | training_plan_id | INDEX |
| idx_itl_training_record_id | training_record_id | INDEX |

### 3.2 数据模型关系图

```
                    ┌──────────────────┐
                    │     employee     │
                    │  (员工主表)       │
                    └────────┬─────────┘
                             │ employee_id
                             │
                             ▼
                    ┌──────────────────┐
                    │hse_incident_    │
                    │  records        │
                    │ (事故记录)       │
                    │incident_type    │
                    └────────┬────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
          ▼                  ▼                  ▼
  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐
  │hse_incident_  │  │hse_incident_  │  │violation_     │
  │  violation_   │  │  training_    │  │  records      │
  │  links        │  │  links        │  │  (三违记录)   │
  │ (事故三违关联) │  │ (事故培训关联) │  │               │
  └───────────────┘  └───────────────┘  └───────────────┘
                             │
                             ▼
                    ┌───────────────┐
                    │training_plans │
                    │training_      │
                    │  records      │
                    └───────────────┘
```

### 3.3 与现有表的关联

| 关联表 | 关联字段 | 用途 |
|--------|----------|------|
| employee | employee_id → id | 涉事员工信息 |
| v_employee_current | employee_id → id | 实时查询员工信息 |
| violation_records | violation_id → id | 事故与三违关联 |
| training_plans | training_plan_id → id | 专项培训计划 |
| training_records | training_record_id → id | 培训执行记录 |
| vehicles | vehicle_id → id | 涉事车辆信息 |
| hse_traffic_accidents | employee_id | 交通事故数据互通 |

---

## 四、核心业务流程

### 4.1 事故处理主流程（四不放过闭环）

```
事故上报 → 记录基本信息 → 状态：已上报(reported)
                            │
                            ▼
                    事故调查 → 状态：调查中(investigating)
                            │
                            ▼
                    原因分析 → 查明直接/间接/根本原因
                            │  ← 四不放过①：事故原因未查清不放过
                            ▼
                    责任认定 → 处理责任人员
                            │  ← 四不放过②：责任人员未处理不放过
                            ▼
                    制定整改措施 → 状态：处理中(processing)
                            │
                            ▼
                    整改验收 → 状态：已关闭(closed)
                            │  ← 四不放过③：整改措施未落实不放过
                            ▼
                    安全教育 → 组织培训和复盘
                            │  ← 四不放过④：有关人员未受到教育不放过
                            ▼
                    事故归档 → 统计分析
```

### 4.2 事故状态流转

| 当前状态 | 操作 | 目标状态 |
|----------|------|----------|
| reported | 开始调查 | investigating |
| investigating | 完成调查 | analyzing |
| analyzing | 完成分析 | processing |
| processing | 整改验收合格 | closed |
| closed | 重新打开 | processing |

### 4.3 四不放过校验规则

| 校验项 | 校验条件 | 未通过处理 |
|--------|----------|------------|
| 原因分析 | cause_analysis、root_cause、direct_cause、indirect_cause 不能为空 | 禁止进入下一阶段 |
| 责任处理 | responsibility 不为 pending，且 responsible_punishment 不为空 | 禁止进入下一阶段 |
| 整改验收 | rectification_status 为 verified | 禁止结案 |
| 安全教育 | education_completed 为 true | 禁止归档 |

### 4.4 事故三违联动流程

```
事故调查 → 分析事故原因 → 是否与三违有关？
                           │
                           ├─→ 是 → 关联三违记录
                           │       └─→ 更新三违风险指标
                           │
                           └─→ 否 → 记录无关联
```

### 4.5 事故培训闭环流程

```
事故分析 → 识别培训需求 → 创建专项培训计划 → 关联事故
                                           │
                                           ▼
                                    培训执行 → 培训完成
                                           │
                                           ▼
                                    更新事故整改状态
```

---

## 五、风险指标设计

### 5.1 事故风险指标

| 指标编号 | 指标名称 | 数据来源 | 计算方式 | 统计周期 |
|:--------:|----------|----------|----------|:--------:|
| I-01 | 事故次数 | hse_incident_records | COUNT(employee_id) | 近12月 |
| I-02 | 重大事故次数 | hse_incident_records | COUNT(incident_level='major') | 近12月 |
| I-03 | 较大事故次数 | hse_incident_records | COUNT(incident_level='serious') | 近12月 |
| I-04 | 主要责任事故次数 | hse_incident_records | COUNT(responsibility='main') | 近12月 |
| I-05 | 次要责任事故次数 | hse_incident_records | COUNT(responsibility='secondary') | 近12月 |
| I-06 | 事故死亡率 | hse_incident_records | SUM(casualties_count) | 近12月 |
| I-07 | 事故受伤率 | hse_incident_records | SUM(injuries_count) | 近12月 |
| I-08 | 事故经济损失 | hse_incident_records | SUM(economic_loss) | 近12月 |
| I-09 | 事故未结案数 | hse_incident_records | COUNT(status!='closed') | 当前 |
| I-10 | 整改超期次数 | hse_incident_records | COUNT(整改超期) | 近12月 |
| I-11 | 四不放过完成率 | hse_incident_records | 四不放过四项均完成的事故数/总事故数 | 近12月 |

### 5.2 指标权重分配（风险画像中）

在员工安全风险画像中，事故维度的指标权重：

| 指标 | 权重 | 满分 | 评分方向 |
|------|:----:|:----:|----------|
| 事故次数 | 8% | 8 | 反向 |
| 重大事故次数 | 6% | 6 | 反向 |
| **合计** | **14%** | **14** | |

### 5.3 评分细则

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

---

## 六、展示设计

### 6.1 页面结构

事故管理模块包含以下页面：

| 页面 | 路径 | 说明 |
|------|------|------|
| 事故列表 | /incidents | 事故记录列表 |
| 事故详情 | /incidents/:id | 事故详情 |
| 事故上报 | /incidents/create | 事故上报表单 |
| 事故统计 | /incidents/stats | 事故统计分析 |

### 6.2 事故列表页面

| 元素 | 说明 |
|------|------|
| 搜索框 | 支持按事故编号、地点、涉事员工搜索 |
| 筛选条件 | 事故类型、事故等级、状态、发生时间范围 |
| 列表字段 | 事故编号、类型、等级、发生时间、地点、涉事员工、状态、责任认定 |
| 操作按钮 | 查看详情、编辑、处理、结案 |

### 6.3 事故详情页面

采用单页多区块布局：

```
┌─────────────────────────────────────────────────┐
│                   事故详情                        │
├─────────────────────────────────────────────────┤
│  区块1：基本信息                                  │
│  ┌──────────┬──────────┬──────────┐            │
│  │ 事故编号  │ 事故类型 │ 事故等级 │            │
│  │ 发生时间  │ 发生地点 │ 网格ID   │            │
│  └──────────┴──────────┴──────────┘            │
├─────────────────────────────────────────────────┤
│  区块2：涉事人员                                  │
│  ┌─────────────────────────────────────┐        │
│  │ [涉事员工列表]                       │        │
│  │ 上报人：XXX                         │        │
│  └─────────────────────────────────────┘        │
├─────────────────────────────────────────────────┤
│  区块3：事故描述                                  │
│  ┌─────────────────────────────────────┐        │
│  │ [事故描述文本]                       │        │
│  └─────────────────────────────────────┘        │
├─────────────────────────────────────────────────┤
│  区块4：原因分析（四不放过①）                      │
│  ┌─────────────────────────────────────┐        │
│  │ 直接原因：[文本]                    │        │
│  │ 间接原因：[文本]                    │        │
│  │ 根本原因：[文本]                    │        │
│  │ 原因分析：[文本]                    │        │
│  └─────────────────────────────────────┘        │
├─────────────────────────────────────────────────┤
│  区块5：责任认定（四不放过②）                      │
│  ┌─────────────────────────────────────┐        │
│  │ 责任认定：[主要/次要/同等/无]        │        │
│  │ 责任处理：[文本]                    │        │
│  └─────────────────────────────────────┘        │
├─────────────────────────────────────────────────┤
│  区块6：整改措施（四不放过③）                      │
│  ┌─────────────────────────────────────┐        │
│  │ [整改措施文本]                       │        │
│  │ 整改状态：[待整改/整改中/已完成/已验收] │      │
│  │ 整改期限：XXXX-XX-XX                │        │
│  │ 验收人：XXX                         │        │
│  └─────────────────────────────────────┘        │
├─────────────────────────────────────────────────┤
│  区块7：安全教育（四不放过④）                      │
│  ┌─────────────────────────────────────┐        │
│  │ 是否已完成：[是/否]                  │        │
│  │ 教育详情：[文本]                    │        │
│  └─────────────────────────────────────┘        │
├─────────────────────────────────────────────────┤
│  区块8：关联三违                                  │
│  ┌─────────────────────────────────────┐        │
│  │ [关联三违记录列表]                   │        │
│  │ [关联按钮]                          │        │
│  └─────────────────────────────────────┘        │
├─────────────────────────────────────────────────┤
│  区块9：专项培训                                  │
│  ┌─────────────────────────────────────┐        │
│  │ 是否需要培训：[是/否]                │        │
│  │ [关联培训计划列表]                   │        │
│  │ [创建培训计划按钮]                   │        │
│  └─────────────────────────────────────┘        │
├─────────────────────────────────────────────────┤
│  区块10：事故损失                                 │
│  ┌──────────┬──────────┬──────────┐            │
│  │ 死亡人数  │ 受伤人数 │ 经济损失 │            │
│  │ 是否保险  │ 理赔金额 │          │            │
│  └──────────┴──────────┴──────────┘            │
└─────────────────────────────────────────────────┘
```

### 6.4 事故上报页面

| 元素 | 说明 |
|------|------|
| 事故类型选择 | 生产安全事故/交通事故/环境污染事故 |
| 基本信息 | 发生时间、地点、网格ID |
| 涉事人员 | 选择涉事员工（支持多选） |
| 事故描述 | 文本框 |
| 事故损失 | 死亡人数、受伤人数、经济损失 |
| 车辆信息 | 交通事故时显示车辆选择 |
| 环境影响 | 环境污染事故时显示环境影响描述 |

### 6.5 事故统计页面

| 元素 | 说明 |
|------|------|
| 统计卡片 | 事故总数、重大事故数、一般事故数、经济损失总额、四不放过完成率 |
| 图表 | 事故类型分布、事故等级分布、月度事故趋势、区域事故分布 |
| 排行 | 部门事故排行、岗位事故排行、涉事员工排行 |
| 三违关联统计 | 与三违关联的事故数、三违导致的事故占比 |
| 四不放过统计 | 各阶段完成率、未完成事项统计 |

---

## 七、API设计

### 7.1 事故记录 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/incidents | 事故列表（分页） |
| GET | /api/incidents/:id | 事故详情 |
| POST | /api/incidents | 创建事故记录 |
| PUT | /api/incidents/:id | 更新事故记录 |
| DELETE | /api/incidents/:id | 删除事故记录 |
| PUT | /api/incidents/:id/investigate | 开始调查 |
| PUT | /api/incidents/:id/analyze | 完成分析 |
| PUT | /api/incidents/:id/process | 处理事故 |
| PUT | /api/incidents/:id/verify | 整改验收 |
| PUT | /api/incidents/:id/close | 结案 |
| GET | /api/incidents/stats | 事故统计 |
| GET | /api/incidents/types | 事故类型列表 |
| GET | /api/incidents/levels | 事故等级列表 |

### 7.2 事故三违关联 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/incidents/:id/violations | 获取事故关联的三违记录 |
| POST | /api/incidents/:id/violations | 关联三违记录 |
| DELETE | /api/incidents/:id/violations/:violationId | 解除关联 |

### 7.3 事故培训关联 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/incidents/:id/trainings | 获取事故关联的培训记录 |
| POST | /api/incidents/:id/trainings | 关联培训计划/记录 |
| DELETE | /api/incidents/:id/trainings/:trainingId | 解除关联 |

### 7.4 风险画像数据 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/incidents/profile/:employeeId | 获取员工事故风险数据 |

---

## 八、与风险画像的集成

### 8.1 数据流向

```
hse_incident_records ──→ 风险画像聚合层
                            │
                            ▼
                    事故风险指标计算
                            │
                            ▼
                    员工风险等级判定
```

### 8.2 风险画像中事故风险区块

| 元素 | 来源 | 说明 |
|------|------|------|
| 事故次数 | hse_incident_records | 近12月事故次数 |
| 重大事故次数 | hse_incident_records | 近12月重大事故次数 |
| 主要责任次数 | hse_incident_records | 近12月主要责任事故次数 |
| 事故记录列表 | hse_incident_records | 事故记录明细 |
| 整改完成情况 | hse_incident_records.rectification_status | 整改验收状态 |

### 8.3 风险等级联动

当员工触发以下条件时，直接影响综合风险等级：

| 条件 | 影响 |
|------|------|
| 近12月重大事故 ≥ 1 | 触发一票否决，直接判定为极高风险 |
| 近12月事故主要责任 ≥ 2 | 触发一票否决，直接判定为极高风险 |
| 近12月事故次数 ≥ 2 | 事故维度得分降低 |

---

## 九、与三违管理的联动

### 9.1 关联关系

事故与三违记录的关联通过 `hse_incident_violation_links` 表实现：

| 关联类型 | 说明 |
|----------|------|
| related | 事故与三违相关 |
| cause | 三违是事故的直接原因 |
| contributing | 三违是事故的间接因素 |

### 9.2 联动流程

```
事故调查 → 分析是否由三违导致 → 关联三违记录
                                    │
                                    ├─→ 更新三违统计指标
                                    │
                                    └─→ 更新员工风险评分
```

### 9.3 数据一致性

| 场景 | 处理方式 |
|------|----------|
| 创建事故时关联三违 | 记录关联关系，不修改三违记录 |
| 三违记录删除 | 检查是否关联事故，若关联则提示 |
| 事故结案 | 更新关联三违的事故关联状态 |

---

## 十、与培训管理的联动

### 10.1 关联关系

事故与培训的关联通过 `hse_incident_training_links` 表实现：

| 关联类型 | 说明 |
|----------|------|
| corrective | 事故后整改培训 |
| preventive | 事故预防培训 |

### 10.2 联动流程

```
事故分析 → 识别培训需求 → 创建专项培训计划 → 关联事故
                                                  │
                                                  ▼
                                            培训执行 → 培训完成
                                                  │
                                                  ▼
                                            更新事故整改状态
```

### 10.3 闭环验证

| 验证项 | 说明 |
|--------|------|
| 培训计划创建 | 事故整改措施中包含培训要求时，必须创建培训计划 |
| 培训执行追踪 | 关联的培训计划必须执行完成 |
| 整改状态更新 | 培训完成后，事故整改状态自动更新为已完成 |

---

## 十一、权限设计

| 操作 | 权限代码 | 说明 |
|------|----------|------|
| 查看事故列表 | hse:incidents:view | |
| 查看事故详情 | hse:incidents:view | |
| 创建事故记录 | hse:incidents:create | |
| 修改事故记录 | hse:incidents:edit | |
| 删除事故记录 | hse:incidents:delete | |
| 事故调查 | hse:incidents:investigate | |
| 事故分析 | hse:incidents:analyze | |
| 事故整改验收 | hse:incidents:verify | |
| 事故结案 | hse:incidents:close | |
| 关联三违 | hse:incidents:link-violation | |
| 关联培训 | hse:incidents:link-training | |
| 查看统计 | hse:incidents:stats:view | |
| 导出数据 | hse:incidents:export | |

---

## 十二、后续开发建议

### 12.1 开发分阶段

| 阶段 | 内容 | 优先级 |
|:----:|------|:------:|
| 1 | 数据库表创建 | 高 |
| 2 | 事故记录 CRUD API | 高 |
| 3 | 事故三违关联 API | 高 |
| 4 | 事故培训关联 API | 高 |
| 5 | 前端事故列表页面 | 高 |
| 6 | 前端事故详情页面 | 高 |
| 7 | 前端事故上报页面 | 高 |
| 8 | 前端事故统计页面 | 中 |
| 9 | 与风险画像集成 | 高 |
| 10 | 与三违管理联动 | 高 |
| 11 | 与培训管理联动 | 高 |

### 12.2 扩展方向

1. **事故预警** - 基于事故趋势预测风险
2. **事故报告模板** - 标准化事故报告生成
3. **事故复盘** - 事故复盘流程管理
4. **移动端上报** - 支持手机端事故快速上报
5. **外部系统对接** - 对接政府安监系统
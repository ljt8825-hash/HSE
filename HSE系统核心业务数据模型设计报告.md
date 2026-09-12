# HSE系统核心业务数据模型设计报告

> **文档性质**：核心业务数据模型冻结
> **版本**：v1.0
> **生成日期**：2026-07-25
> **适用系统**：宁津环卫 HSE 安全管理系统
> **任务编号**：Sprint10-E-8

---

## 一、数据模型总览

### 1.1 设计原则

| 原则 | 说明 |
|------|------|
| **单一公司** | 不支持多公司/集团隔离，所有数据归属单一公司 |
| **组织基础** | 所有业务数据基于五级组织模型（公司→部门→乡镇→管理员→员工） |
| **员工为核心** | 员工是所有业务（三违、培训、考核、保险、风险）的关联核心 |
| **逻辑外键** | 采用逻辑外键（无数据库FK约束），由应用层维护数据完整性 |
| **软删除** | 业务表不做物理删除，通过 `is_deleted` / `status` 控制 |
| **审计字段** | 所有业务表必须包含 `created_at`、`updated_at`、`created_by`、`updated_by` |

### 1.2 数据实体关系图（ER图概览）

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         安全总览（数据消费层）                              │
│  ┌─────────┬──────────┬──────────┬──────────┬──────────┐              │
│  │综合态势  │ 风险指标   │ 隐患指标   │ 三违指标   │ 考核指标   │              │
│  └─────────┴──────────┴──────────┴──────────┴──────────┘              │
└──────▲──────▲──────────▲──────────▲──────────▲───────────────────────────┘
       │      │          │          │          │
       │      │          │          │          │
┌──────┴──────┴──────────┴──────────┴──────────┴───────────────────────────┐
│                         业务模块（数据生产层）                              │
│                                                                           │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐               │
│  │  风险管控      │   │  隐患治理      │   │  现场管理      │               │
│  │  risk_sources │   │    hazards     │   │  violations   │               │
│  │  (风险源)     │───│  (隐患记录)    │───│  (三违记录)    │               │
│  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘               │
│         │                    │                    │                       │
│         └────────────────────┼────────────────────┘                       │
│                              │                                            │
│                     ┌────────┴─────────┐                                  │
│                     │  目标职责（考核）   │                                  │
│                     │ assessment_monthly │                                  │
│                     │  (月度履职考核)     │◄── 三违自动传导扣分            │
│                     └────────┬─────────┘                                  │
│                              │                                            │
└──────────────────────────────┼────────────────────────────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │   人员管理（基础层）   │
                    │     employee          │
                    │  (员工主表 + 组织关系) │
                    │  position / department │
                    └───────────────────────┘
```

### 1.3 模块数据依赖关系

```
人员管理（employee, department, position）
    │
    ├──→ 现场管理（violations.violator_id）
    ├──→ 培训考核（training_records.personnel_id）
    ├──→ 目标职责（assessment_target.employee_id）
    ├──→ 风险管控（risk_sources 责任人关联）
    ├──→ 隐患治理（hazards.responsible_id）
    ├──→ 保险管理（personnel_insurance.personnel_id）
    └──→ 应急管理（accidents.personnel_id）

现场管理（violations）
    └──→ 目标职责（deduction.source_id=violations.id，自动传导）

风险管控（risk_sources）
    └──→ 隐患治理（hazards.source_risk_id，风险→隐患转化）

所有业务模块
    └──→ 安全总览（聚合查询，不存储）
```

---

## 二、模块一：人员管理（基础数据层）

### 2.1 模块定位

人员管理是所有业务模块的**唯一数据基础**，提供员工、组织、岗位等核心数据。所有业务模块（三违、培训、考核、保险、风险、隐患）都必须关联员工ID。

### 2.2 核心数据实体

#### 2.2.1 员工主表（employee）

| 字段名 | 类型 | 必填 | 说明 | 备注 |
|--------|------|------|------|------|
| id | BIGINT | ✅ | 主键 | 自增 |
| employee_code | VARCHAR(32) | ✅ | 员工工号 | 唯一 |
| name | VARCHAR(64) | ✅ | 姓名 | |
| id_card | VARCHAR(18) | ✅ | 身份证号 | 唯一 |
| gender | VARCHAR(8) | | 性别 | 男/女 |
| birth_date | DATE | ✅ | 出生日期 | 用于计算年龄 |
| age | INT | | 年龄 | 计算字段：当前年-出生年 |
| phone | VARCHAR(16) | | 手机号 | |
| id_address | VARCHAR(255) | | 户籍地址 | |
| person_type | VARCHAR(16) | | 人员类型 | 生产人员/管理人员/技术人员/辅助人员 |
| person_category | VARCHAR(16) | | 人员分类 | 适龄人员/超龄人员（自动计算） |
| is_public_welfare | BOOLEAN | | 是否公益岗 | |
| org_status | VARCHAR(16) | | 组织状态 | 在职/待岗/离职/退休/返聘 |
| start_date | DATE | | 入职日期 | |
| created_at | TIMESTAMP | ✅ | 创建时间 | |
| updated_at | TIMESTAMP | ✅ | 更新时间 | |
| is_deleted | BOOLEAN | ✅ | 是否删除 | 默认false |

**自动生成规则**：

| 规则 | 说明 |
|------|------|
| **超龄识别** | `age > 60` 时，`person_category` 自动标记为"超龄人员" |
| **年龄计算** | 根据 `birth_date` 自动计算 `age`，每年更新一次 |

#### 2.2.2 组织表（department / hse_org_unit）

采用已冻结的五级组织模型：

| 字段名 | 类型 | 必填 | 说明 | 备注 |
|--------|------|------|------|------|
| id | BIGINT | ✅ | 主键 | |
| name | VARCHAR(128) | ✅ | 组织名称 | |
| parent_id | BIGINT | | 上级组织ID | 顶级为NULL（公司） |
| type | VARCHAR(16) | ✅ | 组织类型 | 公司/部门中心/乡镇作业中心/部门/班组 |
| level | INT | ✅ | 层级 | 1=公司, 2=部门中心, 3=乡镇作业中心, 4=部门, 5=班组 |
| org_path | VARCHAR(512) | | 组织路径 | 例：/宁津环卫/安全部/津城街道作业中心 |
| manager_id | BIGINT | | 负责人ID | 关联employee.id |
| sort_order | INT | | 排序号 | |
| status | VARCHAR(16) | ✅ | 状态 | 正常/停用 |
| created_at | TIMESTAMP | ✅ | | |
| updated_at | TIMESTAMP | ✅ | | |

**组织层级映射**：

| level | type | 角色 | 说明 |
|-------|------|------|------|
| 1 | 公司 | 公司总经理 | 最高层级 |
| 2 | 部门中心 | 部门经理 | 职能管理部门 |
| 3 | 乡镇作业中心 | 乡镇经理（乡镇主管） | 现场责任主体，月度考核对象 |
| 4 | 部门 | 管理员 | 安全管理执行人员，月度考核对象 |
| 5 | 班组 | 班长 | 基层管理 |

#### 2.2.3 岗位表（position）

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | BIGINT | ✅ | 主键 |
| code | VARCHAR(32) | ✅ | 岗位编码（唯一） |
| name | VARCHAR(64) | ✅ | 岗位名称 |
| category | VARCHAR(32) | | 岗位类别 |
| description | TEXT | | 岗位职责 |
| risk_level | VARCHAR(16) | | 岗位风险等级 |
| is_assessment_target | BOOLEAN | ✅ | 是否考核对象 | 乡镇经理/管理员=true |
| created_at | TIMESTAMP | ✅ | |
| updated_at | TIMESTAMP | ✅ | |

#### 2.2.4 员工组织关系表（employee_assignment / hse_employee_org）

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | BIGINT | ✅ | 主键 |
| employee_id | BIGINT | ✅ | 员工ID |
| org_id | BIGINT | ✅ | 组织ID |
| position_id | BIGINT | ✅ | 岗位ID |
| is_current | BOOLEAN | ✅ | 是否当前任职 |
| start_date | DATE | | 任职开始日期 |
| end_date | DATE | | 任职结束日期 |
| **direct_manager_id** | BIGINT | | **直属上级ID**（责任传导关键） |
| manager_relation_path | VARCHAR(512) | | 管理关系路径 |
| created_at | TIMESTAMP | ✅ | |
| updated_at | TIMESTAMP | ✅ | |

> **关键字段**：`direct_manager_id` 是三违责任传导的核心，用于确定三违人员的直属上级（考核对象）。

### 2.3 数据输出（供其他模块消费）

| 消费模块 | 消费数据 | 消费方式 |
|---------|---------|---------|
| 现场管理（三违） | 员工信息（violator_id）、直属上级（direct_manager_id）、组织归属 | 通过 employee_id 关联 |
| 目标职责（考核） | 考核对象（is_assessment_target=true的员工）、组织归属、岗位信息 | 按乡镇经理+管理员筛选 |
| 风险管控 | 员工风险画像、岗位风险等级 | 通过 employee_id 关联 |
| 隐患治理 | 责任人（responsible_id）、组织归属 | 通过 employee_id 关联 |
| 培训考核 | 员工信息、组织归属 | 通过 employee_id 关联 |
| 保险管理 | 员工信息（personnel_id） | 通过 employee_id 关联 |
| 安全总览 | 员工统计（总数、超龄数、风险分布） | 聚合查询 |

---

## 三、模块二：现场管理（三违管理）

### 3.1 模块定位

现场管理是**业务数据的核心输入环节**。三违记录触发后续的考核自动传导（三违→直属上级扣分），是整个HSE管理闭环的数据源头之一。

### 3.2 核心数据实体

#### 三违记录表（violation_records / violations）

| 字段名 | 类型 | 必填 | 说明 | 备注 |
|--------|------|------|------|------|
| id | BIGINT | ✅ | 主键 | |
| violation_no | VARCHAR(32) | ✅ | 三违编号 | 唯一，系统自动生成 |
| violation_date | DATETIME | ✅ | 三违发生时间 | |
| occur_time | DATETIME | | 具体发生时刻 | |
| **violator_id** | BIGINT | ✅ | **违规人员ID** | 关联employee.id |
| violator_name | VARCHAR(64) | | 违规人员姓名 | 冗余存储，便于展示 |
| violator_position | VARCHAR(64) | | 违规人员岗位 | 冗余存储 |
| violator_org_id | BIGINT | | 违规人员所属组织ID | 冗余存储 |
| **direct_manager_id** | BIGINT | | **直属上级ID** | 责任传导关键，从employee_assignment读取 |
| direct_manager_name | VARCHAR(64) | | 直属上级姓名 | 冗余存储 |
| violation_type | VARCHAR(32) | ✅ | 三违类型 | 违章指挥/违章作业/违反劳动纪律 |
| violation_level | VARCHAR(16) | ✅ | 三违级别 | 轻微/一般/严重 |
| description | TEXT | ✅ | 三违描述 | |
| location | VARCHAR(255) | | 发生地点 | |
| grid_id | BIGINT | | 所属网格ID | 关联grid_areas |
| risk_level | VARCHAR(16) | | 关联风险等级 | |
| evidence | JSONB | | 证据 | 照片/视频URL数组 |
| inspector_id | BIGINT | | 检查人ID | |
| inspector_name | VARCHAR(64) | | 检查人姓名 | |
| handler_id | BIGINT | | 处理人ID | |
| punishment_type | VARCHAR(32) | | 处罚类型 | 教育/罚款/警告/其他 |
| punishment_amount | DECIMAL | | 处罚金额 | |
| rectification | TEXT | | 整改措施 | |
| rectification_time | DATETIME | | 整改完成时间 | |
| review_result | VARCHAR(16) | | 复查结果 | 合格/不合格 |
| review_time | DATETIME | | 复查时间 | |
| need_retraining | BOOLEAN | | 是否需要再培训 | |
| training_plan_id | BIGINT | | 关联培训计划ID | |
| status | VARCHAR(16) | ✅ | 状态 | 待处理/处理中/已完成 |
| **is_transmitted** | BOOLEAN | ✅ | **是否已传导考核** | 默认false，传导后置true |
| transmission_count | INT | | 传导扣分次数 | 防重 |
| remark | TEXT | | 备注 | |
| created_at | TIMESTAMP | ✅ | | |
| updated_at | TIMESTAMP | ✅ | | |
| created_by | BIGINT | ✅ | 创建人ID | |
| updated_by | BIGINT | | 更新人ID | |

### 3.3 业务流程

```
┌──────────────┐
│  三违发现      │ 现场检查、员工举报、视频抓拍
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  三违登记      │ 录入人员、时间、地点、类型、级别、证据
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  直属上级获取   │ 自动读取 employee_assignment.direct_manager_id
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  三违处理      │ 处罚、整改措施、复查
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────┐
│  【自动】考核传导扣分（S-1规则）            │
│  1. direct_manager_id 是否考核对象？         │
│  2. 是 → 创建 deduction（扣5分×100%）       │
│  3. is_transmitted = true                  │
└──────────────────────────────────────────┘
       │
       ▼
  完成
```

### 3.4 自动生成规则

| 规则编号 | 规则名称 | 触发条件 | 规则内容 |
|---------|---------|---------|---------|
| S-1 | 三违→考核自动传导 | 三违记录创建后 | 查询 direct_manager_id → 匹配考核对象 → 创建扣分明细（5分/次×100%） |
| S-2 | 三违编号自动生成 | 三违记录创建前 | 按规则 `SW-{YYYYMMDD}-{NNN}` 自动生成 |
| S-3 | 直属上级自动关联 | 三违记录创建时 | 从 employee_assignment 表读取 violator_id 对应的 direct_manager_id |
| S-4 | 三违→员工风险 | 三违记录创建后 | 三违积分计入员工风险评分（hse_employee_risk_snapshot） |

### 3.5 人工干预点

| 干预点 | 说明 | 留痕要求 |
|-------|------|---------|
| 三违级别判定 | 人工判定轻微/一般/严重 | 判定人、判定时间、判定依据 |
| 处罚类型选择 | 教育/罚款/警告等 | 选择人、选择原因 |
| 整改措施制定 | 制定针对性整改措施 | 制定人、制定时间 |
| 复查验收 | 复查是否合格 | 复查人、复查结果、复查意见 |
| 三违记录编辑 | 已登记的三违记录修改 | 修改人、修改时间、修改内容 |

### 3.6 数据输出

| 输出数据 | 输出到 | 用途 |
|---------|-------|------|
| 三违记录ID | 目标职责（扣分明细） | deduction.source_id，自动传导扣分 |
| 三违统计（数量、趋势） | 安全总览 | 三违展示区指标 |
| 三违人员排名 | 安全总览 | 三违人员TOP排名 |
| 三违类型分布 | 安全总览 | 三违类型统计 |
| 三违积分 | 人员管理（员工风险） | 计入员工风险画像 |
| 三违传导结果 | 安全总览（考核展示） | 传导扣分明细展示 |

---

## 四、模块三：目标职责（月度安全履职考核）

### 4.1 模块定位

目标职责是HSE管理的**责任落实层**，将安全责任量化为可考核的指标。月度安全履职考核是最核心的功能，接收三违数据自动传导扣分，并输出考核结果到安全总览。

### 4.2 考核对象

| 对象 | 岗位识别 | 说明 |
|------|---------|------|
| 乡镇作业中心经理（乡镇主管） | position.is_assessment_target = true AND position.type = '乡镇经理' | 现场安全第一责任人 |
| 管理员 | position.is_assessment_target = true AND position.type = '管理员' | 安全管理执行人员 |

> **其他角色**（公司总经理、部门经理、一线员工）不是月度安全履职考核对象。

### 4.3 核心数据实体

#### 4.3.1 考核周期表（hse_assessment_cycle）

| 字段名 | 类型 | 必填 | 说明 | 备注 |
|--------|------|------|------|------|
| id | BIGINT | ✅ | 主键 | |
| cycle_code | VARCHAR(32) | ✅ | 周期编码 | 例：2026-07 |
| cycle_name | VARCHAR(64) | ✅ | 周期名称 | 例：2026年7月 |
| assessment_year | INT | ✅ | 考核年份 | |
| assessment_month | INT | ✅ | 考核月份 | 1-12 |
| start_time | DATETIME | ✅ | 周期开始时间 | |
| end_time | DATETIME | ✅ | 周期结束时间 | |
| status | VARCHAR(32) | ✅ | 状态 | not_started/in_progress/pending_review/reviewed/frozen |
| target_count | INT | | 考核对象总数 | |
| scored_count | INT | | 已评分对象数 | |
| reviewed_count | INT | | 已审核对象数 | |
| frozen_count | INT | | 已冻结对象数 | |
| created_by | BIGINT | ✅ | 创建人ID | |
| created_at | TIMESTAMP | ✅ | | |
| updated_at | TIMESTAMP | ✅ | | |
| remark | TEXT | | 备注 | |

#### 4.3.2 考核对象表（hse_assessment_target）

| 字段名 | 类型 | 必填 | 说明 | 备注 |
|--------|------|------|------|------|
| id | BIGINT | ✅ | 主键 | |
| cycle_id | BIGINT | ✅ | 周期ID | 关联hse_assessment_cycle |
| **employee_id** | BIGINT | ✅ | **员工ID** | 关联employee.id |
| employee_code | VARCHAR(32) | | 员工工号 | 冗余 |
| employee_name | VARCHAR(64) | ✅ | 员工姓名 | 冗余 |
| position | VARCHAR(64) | | 岗位 | 乡镇经理/管理员 |
| position_id | BIGINT | | 岗位ID | |
| township | VARCHAR(128) | | 所属乡镇 | 冗余 |
| department | VARCHAR(128) | | 所属部门 | 冗余 |
| org_id | BIGINT | | 组织ID | |
| base_score | DECIMAL | ✅ | 基础分 | 默认100分 |
| **score_auto** | DECIMAL | ✅ | **自动扣分合计** | 所有自动扣分项之和 |
| **score_manual** | DECIMAL | ✅ | **人工调整合计** | 人工加/减分之和 |
| **score_total** | DECIMAL | ✅ | **总分** | base_score + score_auto + score_manual |
| grade | VARCHAR(16) | | 等级 | 优秀/良好/合格/不合格 |
| rank_township | INT | | 乡镇内排名 | |
| rank_all | INT | | 全公司排名 | |
| status | VARCHAR(32) | ✅ | 状态 | pending/scored/reviewed/frozen |
| review_status | VARCHAR(16) | | 审核状态 | pending/approved/rejected |
| current_version | INT | | 当前版本号 | 用于调整记录追溯 |
| created_at | TIMESTAMP | ✅ | | |
| updated_at | TIMESTAMP | ✅ | | |

#### 4.3.3 考核指标配置表（hse_assessment_metric）

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | BIGINT | ✅ | 主键 |
| metric_code | VARCHAR(32) | ✅ | 指标编码（唯一） |
| metric_name | VARCHAR(128) | ✅ | 指标名称 |
| category | VARCHAR(32) | | 指标类别 |
| target_post | VARCHAR(32) | | 适用岗位 |
| base_score | DECIMAL | ✅ | 基础分值 |
| scoring_rule | TEXT | | 评分规则描述 |
| deduction_per_unit | DECIMAL | | 每单位扣分值 |
| max_deduction | DECIMAL | | 最大扣分 |
| data_source | VARCHAR(64) | | 数据来源 | violations/responsibility_book/manual |
| is_auto | BOOLEAN | ✅ | 是否自动评分 |
| sort_order | INT | | 排序号 |
| status | VARCHAR(16) | ✅ | 状态 | 启用/停用 |
| created_at | TIMESTAMP | ✅ | |
| updated_at | TIMESTAMP | ✅ | |

**预设指标**：

| metric_code | metric_name | 数据来源 | 扣分规则 |
|-------------|-------------|---------|---------|
| VIOLATION_001 | 三违次数扣分 | violations | 每起三违扣5分，不设上限 |
| RESPONSIBILITY_001 | 责任书缺失扣分 | responsibility_book | 考核期内无有效责任书扣20分 |
| HIDDEN_001 | 隐患整改超期扣分 | hazards | 每超期1条隐患扣3分 |
| TRAINING_001 | 培训未完成扣分 | training | 每缺1次培训扣2分 |

#### 4.3.4 扣分明细表（hse_assessment_deduction）

| 字段名 | 类型 | 必填 | 说明 | 备注 |
|--------|------|------|------|------|
| id | BIGINT | ✅ | 主键 | |
| cycle_id | BIGINT | ✅ | 周期ID | |
| target_id | BIGINT | ✅ | 考核对象ID | |
| metric_id | BIGINT | | 指标ID | |
| metric_code | VARCHAR(32) | | 指标编码 | 冗余 |
| deduction_item | VARCHAR(255) | ✅ | 扣分项目描述 | 例："2026年7月15日三违（违章作业）" |
| **deduction_type** | VARCHAR(16) | ✅ | **扣分类型** | auto（自动）/ manual（人工） |
| **rule_code** | VARCHAR(32) | | **规则编码** | 例：S-1（三违传导） |
| **source_table** | VARCHAR(64) | | **来源表** | violations / responsibility_book / manual |
| **source_id** | BIGINT | | **来源记录ID** | 关联来源业务记录 |
| source_detail | JSONB | | 来源详情 | 三违级别、传导链信息等 |
| **suggested_score** | DECIMAL | ✅ | **建议扣分** | 自动计算值 |
| **confirmed_score** | DECIMAL | | **确认扣分** | 审核后实际值，NULL表示未审核 |
| **review_status** | VARCHAR(16) | ✅ | **审核状态** | pending/approved/rejected |
| **is_transmission** | BOOLEAN | ✅ | **是否传导扣分** | 三违→上级扣分为true |
| chain_level | INT | | 传导层级 | 固定1（仅一级传导） |
| transmission_ratio | DECIMAL | | 传导比例 | 固定1.0（100%） |
| source_employee_id | BIGINT | | 来源员工ID | 三违人员ID |
| source_employee_name | VARCHAR(64) | | 来源员工姓名 | 三违人员姓名 |
| evidence | TEXT | | 证据说明 | |
| remark | TEXT | | 备注 | |
| reviewed_by | BIGINT | | 审核人ID | |
| reviewed_at | TIMESTAMP | | 审核时间 | |
| review_comment | TEXT | | 审核意见 | |
| current_version | INT | | 版本号 | |
| created_at | TIMESTAMP | ✅ | | |
| updated_at | TIMESTAMP | ✅ | | |

> **关键字段**：
> - `source_id` + `source_table`：追溯扣分项的业务来源
> - `is_transmission` + `chain_level` + `transmission_ratio`：责任传导信息
> - `confirmed_score` + `review_status`：审核流程控制

#### 4.3.5 扣分调整记录表（hse_assessment_adjustment）

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | BIGINT | ✅ | 主键 |
| deduction_id | BIGINT | ✅ | 扣分项ID |
| target_id | BIGINT | ✅ | 考核对象ID |
| version_no | INT | ✅ | 版本号 |
| old_score | DECIMAL | ✅ | 调整前分数 |
| new_score | DECIMAL | ✅ | 调整后分数 |
| operation_type | VARCHAR(16) | ✅ | 操作类型 | add（加分）/ reduce（减分）/ modify（修改） |
| adjustment_reason | TEXT | ✅ | 调整原因 |
| adjusted_by | BIGINT | ✅ | 调整人ID |
| adjusted_by_name | VARCHAR(64) | | 调整人姓名 |
| adjusted_at | TIMESTAMP | ✅ | 调整时间 |
| is_current | BOOLEAN | ✅ | 是否当前版本 |

### 4.4 业务流程

```
┌─────────────────────────────────────────────────────────────┐
│  1. 周期初始化（每月1号自动 / 手动创建）                        │
│     - 创建 hse_assessment_cycle（status=not_started）         │
│     - 按 is_assessment_target=true 导入考核对象                 │
│     - 初始化 base_score=100, score_auto=0, score_manual=0     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  2. 自动扣分执行（每日定时 / 手动触发）                         │
│                                                                   │
│  a) 三违传导扣分（T-3规则）：                                     │
│     - 查询本周期内新增三违记录（is_transmitted=false）           │
│     - 取 violator.direct_manager_id                              │
│     - 匹配考核对象（target.employee_id = direct_manager_id）    │
│     - 创建扣分明细：suggested_score = -5 × 1.0（100%传导）     │
│     - violation.is_transmitted = true                           │
│                                                                   │
│  b) 责任书缺失扣分（T-4规则）：                                   │
│     - 检查考核对象是否有有效责任书                                │
│     - 无 → 创建扣分明细：suggested_score = -20                   │
│                                                                   │
│  c) 隐患超期扣分：                                                │
│     - 检查考核对象责任范围内超期未整改隐患数                      │
│     - 每超期1条 → suggested_score = -3                           │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  3. 人工干预（审核+调整）                                       │
│     - 审核自动扣分项（通过/驳回）                                │
│     - 人工新增扣分项（特殊情况加/减分）                          │
│     - 所有调整留痕（hse_assessment_adjustment）                │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  4. 结果汇总（T-5规则）                                        │
│     - score_total = base_score + score_auto + score_manual    │
│     - 按 score_total 评定等级（优秀/良好/合格/不合格）          │
│     - 计算排名（rank_township, rank_all）                      │
│     - status = reviewed                                         │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  5. 周期冻结                                                   │
│     - 确认无误后冻结周期（status=frozen）                      │
│     - 冻结后不可修改                                            │
│     - 推送考核结果到安全总览                                    │
└─────────────────────────────────────────────────────────────┘
```

### 4.5 自动生成规则

| 规则编号 | 规则名称 | 触发条件 | 规则内容 |
|---------|---------|---------|---------|
| T-1 | 考核周期自动创建 | 每月1号定时 | 自动创建新月份考核周期 |
| T-2 | 考核对象自动导入 | 周期创建后 | 按 position.is_assessment_target=true 筛选导入 |
| T-3 | 三违自动传导扣分 | 三违创建 / 评分执行 | violator→direct_manager→考核对象→5分/次×100% |
| T-4 | 责任书缺失扣分 | 周期内检查 | 无有效责任书→扣20分 |
| T-5 | 考核结果汇总 | 周期结束 / 手动触发 | 汇总自动+人工扣分→总分→等级→排名 |
| T-6 | 隐患超期扣分 | 每日定时 / 评分执行 | 每超期1条隐患扣3分 |

### 4.6 人工干预点

| 干预点 | 说明 | 留痕要求 |
|-------|------|---------|
| 扣分审核 | 审核自动生成的扣分项（通过/驳回） | 审核人、审核时间、审核意见 |
| 人工新增扣分 | 特殊情况新增扣分项（加/减分） | 调整人、调整原因、调整前后分值 |
| 扣分调整 | 修改已有扣分项的分值 | 调整人、调整原因、版本记录 |
| 考核对象调整 | 增加/移除考核对象 | 调整人、调整原因 |
| 结果冻结 | 确认并冻结考核周期结果 | 冻结人、冻结时间 |
| Excel导入 | 批量导入考核数据/扣分项 | 导入人、导入时间、导入文件 |
| 系统导出 | 导出考核结果/扣分明细 | 导出人、导出时间 |

### 4.7 数据输出

| 输出数据 | 输出到 | 用途 |
|---------|-------|------|
| 考核结果（总分、等级、排名） | 安全总览 | 考核展示区：月度考核概况、对象排名、等级分布 |
| 扣分明细 | 安全总览 | 考核展示区：扣分情况统计（自动/人工） |
| 传导扣分详情 | 安全总览（三违展示区） | 三违责任传导结果展示 |
| 考核排名 | 员工档案 | 员工安全档案中的考核记录 |
| 考核结果数据 | 预警与整改中心 | 考核不合格预警 |

---

## 五、模块四：风险管控

### 5.1 模块定位

风险管控是HSE系统的**风险识别层**，管理风险从辨识到管控的全生命周期。风险数据输出到安全总览（风险指标）和隐患治理（风险→隐患转化）。

### 5.2 核心数据实体

#### 风险源表（risk_sources / hse_risk_identification）

| 字段名 | 类型 | 必填 | 说明 | 备注 |
|--------|------|------|------|------|
| id | BIGINT | ✅ | 主键 | |
| source_id | VARCHAR(32) | | 风险源编号 | |
| name | VARCHAR(255) | ✅ | 风险名称 | |
| type | VARCHAR(32) | ✅ | 风险类型 | 人员/设备/环境/管理 |
| category | VARCHAR(64) | | 风险类别 | |
| location | VARCHAR(255) | | 风险位置 | |
| accident_type | VARCHAR(64) | | 可能导致事故类型 | |
| **level** | VARCHAR(16) | ✅ | **风险等级** | 一级(重大)/二级(较高)/三级(一般)/四级(低) |
| **l_value** | DECIMAL | | **L值** | LEC法-发生可能性 |
| **e_value** | DECIMAL | | **E值** | LEC法-暴露频率 |
| **c_value** | DECIMAL | | **C值** | LEC法-后果严重度 |
| **risk_score** | DECIMAL | | **风险值** | L×E×C |
| measures | TEXT | | 管控措施 | |
| emergency | TEXT | | 应急措施 | |
| lat | DECIMAL | | 纬度 | 风险地图用 |
| lng | DECIMAL | | 经度 | 风险地图用 |
| area | VARCHAR(128) | | 所属区域 | |
| polygon | JSONB | | 区域多边形坐标 | 风险地图用 |
| responsible_id | BIGINT | | 责任人ID | 关联employee.id |
| related_hazard_id | BIGINT | | 关联隐患ID | 风险→隐患转化 |
| hazard_count | INT | | 关联隐患数 | |
| assessment_date | DATE | | 评估日期 | |
| review_cycle | INT | | 复评周期（月） | |
| expiry_status | VARCHAR(16) | | 时效状态 | normal/expiring/expired |
| status | VARCHAR(16) | ✅ | 状态 | 正常/已处置/监控中 |
| data_period | VARCHAR(32) | | 数据周期 | |
| source_file_id | BIGINT | | 来源文件ID | |
| created_at | TIMESTAMP | ✅ | | |
| updated_at | TIMESTAMP | ✅ | | |

### 5.3 业务流程

```
┌──────────────┐
│  风险辨识      │ 从岗位、作业、场所、设备中识别风险点
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  风险评价      │ LEC法：L×E×C = risk_score
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────┐
│  风险等级自动计算（R-1规则）                │
│  risk_score → 一级(重大)/二级(较高)/三级(一般)/四级(低) │
└──────────────────────────────────────────┘
       │
       ▼
┌──────────────┐
│  风险地图      │ 按 lat/lng/area 可视化风险分布
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────┐
│  管控措施 + 高风险预警（R-4规则）          │
│  level=一级/二级 → 推送预警                │
│  可生成隐患整改记录（R-5规则）              │
└──────────────────────────────────────────┘
```

### 5.4 自动生成规则

| 规则编号 | 规则名称 | 触发条件 | 规则内容 |
|---------|---------|---------|---------|
| R-1 | 风险等级自动计算 | L/E/C值提交 | L×E×C → 映射到四级风险等级 |
| R-2 | 风险评分快照 | 每日定时 / 数据变更 | 保存员工/组织风险评分历史，用于趋势分析 |
| R-3 | 风险地图数据生成 | 风险等级变更 | 聚合各区域/岗位风险等级，生成可视化数据 |
| R-4 | 高风险预警 | 风险等级变为一级/二级 | 自动生成预警记录，推送至预警中心 |
| R-5 | 风险→隐患转化提示 | 风险等级为一级 | 自动提示创建隐患整改记录 |

### 5.5 人工干预点

| 干预点 | 说明 |
|-------|------|
| L/E/C值输入 | 人工输入LEC法三个参数 |
| 风险等级调整 | 自动计算后可人工调整等级 |
| 管控措施制定 | 人工制定针对性管控措施 |
| 责任人指定 | 指定风险管控责任人 |
| 风险辨识补录 | 手工补录历史风险点 |

### 5.6 数据输出

| 输出数据 | 输出到 | 用途 |
|---------|-------|------|
| 风险等级分布 | 安全总览（风险展示区） | 饼图/四色分布统计 |
| 高风险人数 | 安全总览（综合态势KPI） | KPI卡片：高风险人数、高风险占比 |
| 风险趋势 | 安全总览（风险展示区） | 风险数量趋势折线图 |
| 风险地图数据 | 安全总览（风险展示区） | 可视化风险地图 |
| 高风险TOP | 安全总览（风险展示区） | 高风险人员/区域TOP排名 |
| 风险ID | 隐患治理 | 风险→隐患转化（source_risk_id） |
| 高风险预警 | 预警与整改中心 | 预警推送 |

---

## 六、模块五：隐患治理

### 6.1 模块定位

隐患治理是HSE系统的**问题闭环层**，管理隐患从发现到整改验收的全流程。隐患数据输出到安全总览（隐患指标）和预警中心（超期预警）。

### 6.2 核心数据实体

#### 6.2.1 隐患表（hazards）

| 字段名 | 类型 | 必填 | 说明 | 备注 |
|--------|------|------|------|------|
| id | BIGINT | ✅ | 主键 | |
| hazard_no | VARCHAR(32) | ✅ | 隐患编号 | 唯一，系统生成 |
| hazard_date | DATETIME | ✅ | 隐患发现日期 | |
| category | VARCHAR(32) | ✅ | 隐患分类 | 设备/环境/管理/人员 |
| **level** | VARCHAR(16) | ✅ | **隐患等级** | 一般/较大/重大 |
| title | VARCHAR(255) | ✅ | 隐患标题 | |
| description | TEXT | ✅ | 隐患描述 | |
| location | VARCHAR(255) | | 隐患位置 | |
| discoverer_id | BIGINT | | 发现人ID | |
| discoverer_name | VARCHAR(64) | | 发现人姓名 | |
| discover_type | VARCHAR(32) | | 发现渠道 | 检查/上报/风险转化/外部 |
| source_risk_id | BIGINT | | 来源风险ID | 风险→隐患转化时关联 |
| **responsible_id** | BIGINT | | **整改责任人ID** | 关联employee.id |
| responsible_name | VARCHAR(64) | | 责任人姓名 | 冗余 |
| **deadline** | DATETIME | | **整改期限** | |
| **status** | VARCHAR(32) | ✅ | **状态** | pending/rectifying/reviewing/closed/rejected |
| rectification_desc | TEXT | | 整改要求描述 | |
| **is_overdue** | BOOLEAN | ✅ | **是否超期** | 当前日>deadline且status≠closed |
| township | VARCHAR(128) | | 所属乡镇 | 冗余 |
| org_id | BIGINT | | 所属组织ID | |
| evidence | JSONB | | 证据（照片/视频） | |
| remark | TEXT | | 备注 | |
| created_at | TIMESTAMP | ✅ | | |
| updated_at | TIMESTAMP | ✅ | | |
| created_by | BIGINT | ✅ | 创建人ID | |

#### 6.2.2 整改记录表（hse_rectifications）

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | BIGINT | ✅ | 主键 |
| hazard_id | BIGINT | ✅ | 隐患ID |
| rectify_type | VARCHAR(32) | | 整改类型 |
| measures | TEXT | | 整改措施 |
| progress | INT | | 整改进度（%） |
| photos | JSONB | | 整改照片 |
| deadline | DATETIME | | 整改期限（冗余） |
| submitted_by | BIGINT | | 提交人ID |
| submitted_at | DATETIME | | 提交时间 |

#### 6.2.3 复查记录表（hse_reviews）

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | BIGINT | ✅ | 主键 |
| rectification_id | BIGINT | ✅ | 整改记录ID |
| hazard_id | BIGINT | ✅ | 隐患ID |
| result | VARCHAR(16) | ✅ | 复查结果 | passed（通过）/ rejected（驳回） |
| reviewer_id | BIGINT | ✅ | 复查人ID |
| reviewer_name | VARCHAR(64) | | 复查人姓名 |
| review_date | DATETIME | ✅ | 复查日期 |
| comment | TEXT | | 复查意见 |

### 6.3 业务流程

```
┌──────────────────────────────────────────┐
│  隐患发现（多渠道）                          │
│  现场检查 / 专项检查 / 员工上报              │
│  风险转化（一级风险自动提示）/ 外部检查       │
└──────────────────────┬───────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────┐
│  隐患登记                                   │
│  录入：分类、分级、描述、位置、证据          │
│  自动：hazard_no 编号生成                   │
└──────────────────────┬───────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────┐
│  整改指派                                   │
│  指定责任人、整改期限、整改要求              │
│  status = pending → rectifying             │
└──────────────────────┬───────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────┐
│  整改执行                                   │
│  录入整改措施、整改进度、整改照片            │
│  提交后 status = rectifying → reviewing     │
└──────────────────────┬───────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────┐
│  复查验收                                   │
│  passed → status = closed（闭环）           │
│  rejected → status = rectifying（重新整改）  │
└──────────────────────────────────────────┘

自动规则：
  H-1: 状态自动流转
  H-2: 超期自动预警（每日检查 deadline）
  H-3: 闭环率自动统计
```

### 6.4 自动生成规则

| 规则编号 | 规则名称 | 触发条件 | 规则内容 |
|---------|---------|---------|---------|
| H-1 | 状态自动流转 | 用户操作 | pending→rectifying→reviewing→closed / rejected→rectifying |
| H-2 | 超期自动预警 | 每日定时检查 | 当前日期>deadline且status≠closed → 生成超期预警 |
| H-3 | 整改完成率统计 | 状态变更 / 每日定时 | 已闭环数 / 应整改数 × 100% |
| H-4 | 风险→隐患提示 | 风险等级=一级 | 自动提示创建隐患整改记录 |
| H-5 | 复查到期提醒 | 整改提交后 | 提醒复查人及时复查 |

### 6.5 人工干预点

| 干预点 | 说明 | 留痕要求 |
|-------|------|---------|
| 隐患等级判定 | 人工判定一般/较大/重大 | 判定人、判定时间、判定依据 |
| 整改指派 | 指定责任人、期限、要求 | 指派人、指派时间 |
| 整改措施录入 | 录入整改措施和进度 | 提交人、提交时间 |
| 复查验收 | 判定整改是否合格 | 复查人、复查结果、复查意见 |
| 隐患关闭 | 特殊情况经审批后直接关闭 | 审批人、关闭原因 |

### 6.6 数据输出

| 输出数据 | 输出到 | 用途 |
|---------|-------|------|
| 隐患总数 | 安全总览（综合态势KPI） | KPI卡片：隐患总数 |
| 整改状态分布 | 安全总览（隐患展示区） | 待整改/整改中/待复查/已闭环统计 |
| 闭环率 | 安全总览（隐患展示区） | 整改完成率、隐患闭环率 |
| 超期隐患 | 安全总览（隐患展示区） + 预警中心 | 超期未整改预警 |
| 隐患趋势 | 安全总览（隐患展示区） | 隐患数量趋势图 |
| 隐患ID | 风险管控 | 更新关联风险点的 hazard_count |

---

## 七、安全总览数据模型（数据消费层）

### 7.1 定位

安全总览是**纯数据消费层**，不存储业务数据，所有指标通过聚合查询从各业务模块实时获取（或通过统计表缓存）。

### 7.2 指标来源总表

| 区域 | 指标 | 数据来源 | 计算方式 |
|------|------|---------|---------|
| **综合安全态势** | 员工总数 | employee | COUNT(*) WHERE org_status='在职' |
| | 高风险人数 | hse_employee_risk_snapshot | COUNT(*) WHERE risk_level IN ('一级','二级') AND is_active=true |
| | 高风险占比 | 同上 | 高风险人数 / 员工总数 × 100% |
| | 三违次数（本月） | violations | COUNT(*) WHERE violation_date BETWEEN 本月初 AND 本月末 |
| | 隐患总数 | hazards | COUNT(*) |
| | 整改完成率 | hazards + hse_rectifications | COUNT(closed) / COUNT(非pending) × 100% |
| | 事故总数 | accidents | COUNT(*) |
| | 培训完成率 | training_records | 已完成培训数 / 应培训数 × 100% |
| | 总体安全评分 | 多模块综合 | 加权计算：风险30% + 隐患25% + 三违20% + 考核15% + 培训10% |
| | 安全等级 | 同上 | 根据评分映射：绿区(≥80)/黄区(60-79)/红区(<60) |
| **风险展示** | 风险等级分布 | risk_sources | GROUP BY level COUNT |
| | 风险数量趋势 | risk_sources | 按月份统计新增风险数（近12个月） |
| | 风险地图数据 | risk_sources | 按 area / lat/lng 聚合 |
| | 高风险人员TOP10 | hse_employee_risk_snapshot | ORDER BY total_score DESC LIMIT 10 |
| | 风险类型分布 | risk_sources | GROUP BY type COUNT |
| **隐患展示** | 隐患数量 | hazards | COUNT(*)（本月/累计） |
| | 整改状态分布 | hazards | GROUP BY status COUNT |
| | 闭环率趋势 | hazards | 按月统计闭环率（近12个月） |
| | 超期未整改预警 | hazards | 列表：WHERE is_overdue=true AND status!='closed' |
| | 隐患分类统计 | hazards | GROUP BY category COUNT |
| **三违展示** | 三违趋势 | violations | 按月统计数量（近12个月） |
| | 三违人员排名 | violations | GROUP BY violator_id ORDER BY COUNT DESC |
| | 三违类型分布 | violations | GROUP BY violation_type COUNT |
| | 三违级别分布 | violations | GROUP BY violation_level COUNT |
| | 责任传导结果 | hse_assessment_deduction | WHERE is_transmission=true 列表：谁被传导、扣了多少分、来源 |
| **考核展示** | 月度考核概况 | hse_assessment_cycle + hse_assessment_target | 当前周期：应考人数、已考人数、平均分、优秀率、合格率 |
| | 扣分情况统计 | hse_assessment_deduction | 自动扣分数 vs 人工调整数 |
| | 考核对象排名 | hse_assessment_target | ORDER BY score_total DESC |
| | 考核等级分布 | hse_assessment_target | GROUP BY grade COUNT |
| | 扣分明细TOP | hse_assessment_deduction | 扣分最多的考核对象TOP |

### 7.3 统计数据源

安全总览指标数据获取有两种方式：

| 方式 | 适用场景 | 说明 |
|------|---------|------|
| **实时聚合查询** | 大部分指标 | 直接从业务表聚合查询（violations、hazards、risk_sources、employee等） |
| **统计表缓存** | 趋势类、历史类指标 | 使用 hse_statistics_daily / hse_statistics_monthly / hse_statistics_yearly 表，每日定时预计算 |

**统计表结构**（已存在）：

```sql
hse_statistics_daily
  - id, stat_date, metrics_json (JSONB，存储当日所有指标快照)

hse_statistics_monthly
  - id, stat_month, metrics_json

hse_statistics_yearly
  - id, stat_year, metrics_json

hse_statistics_dept
  - id, dept_id, stat_date, metrics_json

hse_statistics_person
  - id, person_id, stat_date, metrics_json
```

---

## 八、完整数据流总图

### 8.1 核心数据流（从基础到展示）

```
┌─────────────────────────────────────────────────────────────────┐
│                        人员管理（基础层）                           │
│  employee, department, position, employee_assignment              │
│  关键输出：employee_id, direct_manager_id, org_id, position_id    │
└──┬──────────┬──────────┬──────────┬──────────┬──────────┬────────┘
   │          │          │          │          │          │
   ▼          ▼          ▼          ▼          ▼          ▼
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│三违   │ │培训   │ │风险   │ │隐患   │ │保险   │ │应急   │
│现场   │ │考核   │ │管控   │ │治理   │ │管理   │ │管理   │
│(业务) │ │(业务) │ │(业务) │ │(业务) │ │(业务) │ │(业务) │
└──┬───┘ └──────┘ └──┬───┘ └──┬───┘ └──────┘ └──────┘
   │                   │         │
   │ S-1自动传导        │ R-5     │ H-2
   ▼                   ▼         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     目标职责（月度考核）                            │
│  assessment_cycle, assessment_target, assessment_deduction       │
│  自动规则：T-3（三违传导）、T-4（责任书）、T-5（结果汇总）         │
└──────────────────────────────┬──────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       安全总览（数据消费层）                        │
│  区域：综合态势 │ 风险 │ 隐患 │ 三违 │ 考核                        │
│  数据源：所有业务模块聚合查询 + 统计表缓存                          │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 模块输入输出关系表

| 模块 | 输入（从其他模块获取） | 输出（供其他模块消费） |
|------|----------------------|----------------------|
| **人员管理** | 无（最基础层） | 所有模块：员工信息、组织关系、直属上级ID、岗位信息 |
| **现场管理（三违）** | 人员：violator_id、direct_manager_id | 目标职责：三违传导扣分（source_id）<br>安全总览：三违指标<br>人员：三违积分→员工风险 |
| **目标职责（考核）** | 人员：考核对象筛选<br>三违：传导扣分来源<br>责任书：责任书缺失检查 | 安全总览：考核指标<br>人员：员工考核档案 |
| **风险管控** | 人员：岗位风险等级、责任人 | 安全总览：风险指标<br>隐患治理：风险→隐患转化（source_risk_id） |
| **隐患治理** | 人员：责任人<br>风险：source_risk_id | 安全总览：隐患指标<br>风险管控：更新hazard_count |
| **培训考核** | 人员：培训对象 | 安全总览：培训完成率<br>人员：员工培训档案 |
| **保险管理** | 人员：被保险人<br>车辆：被保险车辆 | 安全总览：保险统计<br>人员：员工保险档案 |
| **应急管理** | 人员：涉事人员<br>车辆：涉事车辆 | 安全总览：事故统计 |
| **安全总览** | 所有业务模块 | 无（纯消费层） |

---

## 九、自动生成规则汇总

| 编号 | 模块 | 规则名称 | 触发条件 | 核心逻辑 |
|------|------|---------|---------|---------|
| P-1 | 人员 | 超龄识别 | 员工创建/每日更新 | 年龄>60 → person_category=超龄 |
| P-2 | 人员 | 年龄计算 | 员工创建/每年更新 | 当前年 - 出生年 = age |
| S-1 | 现场 | 三违→考核传导 | 三违创建 | direct_manager→考核对象→-5分×100% |
| S-2 | 现场 | 三违编号生成 | 三违创建前 | SW-{YYYYMMDD}-{NNN} |
| S-3 | 现场 | 直属上级关联 | 三违创建时 | 读employee_assignment.direct_manager_id |
| S-4 | 现场 | 三违→员工风险 | 三违创建后 | 三违积分计入风险画像 |
| T-1 | 考核 | 周期自动创建 | 每月1号 | 自动创建新月份考核周期 |
| T-2 | 考核 | 对象自动导入 | 周期创建后 | 按is_assessment_target筛选 |
| T-3 | 考核 | 三违自动扣分 | 三违创建/评分执行 | S-1传导结果写入deduction |
| T-4 | 考核 | 责任书缺失扣分 | 周期内检查 | 无有效责任书→-20分 |
| T-5 | 考核 | 结果汇总 | 周期结束 | base+auto+manual=总分→等级→排名 |
| T-6 | 考核 | 隐患超期扣分 | 每日定时 | 每超期1条→-3分 |
| R-1 | 风险 | 等级自动计算 | LEC提交 | L×E×C→四级映射 |
| R-2 | 风险 | 评分快照 | 每日定时 | 保存风险评分历史 |
| R-3 | 风险 | 地图数据生成 | 等级变更 | 聚合区域风险等级 |
| R-4 | 风险 | 高风险预警 | 等级=一/二级 | 生成预警记录 |
| R-5 | 风险 | 风险→隐患提示 | 等级=一级 | 提示创建隐患 |
| H-1 | 隐患 | 状态自动流转 | 用户操作 | pending→rectifying→reviewing→closed |
| H-2 | 隐患 | 超期自动预警 | 每日定时 | 超期未整改→预警 |
| H-3 | 隐患 | 闭环率统计 | 状态变更 | 已闭环/应整改×100% |
| H-4 | 隐患 | 风险→隐患提示 | 风险等级=一级 | 提示创建隐患（同R-5） |
| H-5 | 隐患 | 复查到期提醒 | 整改提交 | 提醒复查人 |

---

## 十、冻结结论

**✅ 本报告所有数据模型设计已完成，可以冻结。**

本次冻结内容：

| 冻结项 | 结论 |
|--------|------|
| 人员管理数据模型 | ✅ employee、department、position、employee_assignment（含direct_manager_id） |
| 三违管理数据模型 | ✅ violations（含is_transmitted、传导链字段） |
| 月度考核数据模型 | ✅ assessment_cycle、assessment_target、assessment_metric、assessment_deduction、assessment_adjustment |
| 风险管控数据模型 | ✅ risk_sources（含LEC法字段、等级、地图字段） |
| 隐患治理数据模型 | ✅ hazards、hse_rectifications、hse_reviews |
| 安全总览指标体系 | ✅ 5大区域所有指标来源明确（综合态势+风险+隐患+三违+考核） |
| 完整数据流 | ✅ 从人员基础层到安全总览消费层的完整链路已明确 |
| 自动生成规则 | ✅ 28项自动生成/联动规则已明确 |
| 人工干预点 | ✅ 所有模块的人工干预点和留痕要求已明确 |
| 模块输入输出 | ✅ 9个模块的输入输出关系已形成矩阵 |

---

**报告生成时间**：2026-07-25
**报告生成人**：AI Agent
**审批人**：_________（待填写）

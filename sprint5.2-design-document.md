# HSE Sprint5.2 设计文档 - 员工安全画像与证书中心

**版本**: v1.0  
**日期**: 2026-07-20  
**依据**: 
- `sprint5-final-plan.md`
- `hse-employee-master-data-design-v1.2-freeze.md`

---

## 一、概述

### 1.1 目标

Sprint5.2 聚焦于**员工安全画像与证书中心**，基于 Sprint5.1 已完成的 `employee_certificate` 和 `employee_safety_profile` 表，新增 `position_safety_profile`（岗位安全画像）和 `position_training_requirement`（岗位培训要求）两个表，建立完整的岗位安全管理体系。

### 1.2 开发范围

| 序号 | 模型 | 表名 | 状态 | 说明 |
|------|------|------|------|------|
| 1 | 员工安全画像 | `employee_safety_profile` | ✅ Sprint5.1 已完成 | 一人一档风险画像 |
| 2 | 员工证件管理 | `employee_certificate` | ✅ Sprint5.1 已完成 | 证件统一管理 |
| 3 | 岗位安全画像 | `position_safety_profile` | ⭐ 新增 | 岗位风险评估与安全要求 |
| 4 | 岗位培训要求 | `position_training_requirement` | ⭐ 新增 | 岗位培训标准与频率要求 |

### 1.3 技术约束

| 约束项 | 说明 |
|--------|------|
| 禁止新增人员表 | `employee` 为唯一人员主表 |
| 禁止修改 Vben 核心目录 | 不碰 `packages/@core/`、`packages/effects/`、`packages/themes/` |
| 禁止修改 auth/JWT | 不修改认证相关代码 |
| 禁止新增 npm 依赖 | 复用已有依赖 |
| AI 字段仅辅助分析 | AI 不参与安全结论自动生成 |
| 所有关联使用 employee_id | 人员关联必须通过 employee_id |

---

## 二、岗位安全画像（position_safety_profile）

### 2.1 设计目标

为每个岗位建立安全画像，包含：
- 岗位风险等级评估
- 必备证件要求
- 安全危害因素识别
- 安全操作规程
- 个人防护装备要求
- 应急预案

### 2.2 表结构

```sql
CREATE TABLE position_safety_profile (
    id                      BIGSERIAL PRIMARY KEY,
    position_id             BIGINT NOT NULL,
    risk_level              VARCHAR(20) NOT NULL DEFAULT 'unknown',
    risk_score              DECIMAL(5,2),
    risk_factors            JSONB,
    required_cert_categories TEXT[],
    required_special_operation BOOLEAN NOT NULL DEFAULT FALSE,
    required_safety_critical BOOLEAN NOT NULL DEFAULT FALSE,
    safety_hazards          JSONB,
    safety_procedures       TEXT,
    emergency_response      TEXT,
    ppe_requirements        JSONB,
    work_permit_required    BOOLEAN NOT NULL DEFAULT FALSE,
    inspection_frequency    VARCHAR(32),
    last_risk_assessment_date DATE,
    assessment_method       VARCHAR(32),
    ai_risk_analysis        TEXT,
    ai_suggestion           TEXT,
    ai_analysis_date        TIMESTAMP,
    ai_analysis_version     VARCHAR(32),
    remark                  TEXT,
    created_by              BIGINT,
    created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    is_deleted              BOOLEAN NOT NULL DEFAULT FALSE
);
```

### 2.3 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| position_id | BIGINT | 岗位ID（关联 position.id） |
| risk_level | VARCHAR(20) | 风险等级：low/medium/high/critical/unknown |
| risk_score | DECIMAL(5,2) | 风险评分（0-100） |
| risk_factors | JSONB | 风险因素列表（结构化） |
| required_cert_categories | TEXT[] | 必备证件分类列表 |
| required_special_operation | BOOLEAN | 是否要求特种作业资质 |
| required_safety_critical | BOOLEAN | 是否为安全关键岗位 |
| safety_hazards | JSONB | 岗位安全危害因素 |
| safety_procedures | TEXT | 岗位安全操作规程 |
| emergency_response | TEXT | 岗位应急预案 |
| ppe_requirements | JSONB | 个人防护装备要求 |
| work_permit_required | BOOLEAN | 是否需要作业许可证 |
| inspection_frequency | VARCHAR(32) | 巡检频率：daily/weekly/monthly/quarterly/yearly |
| ai_risk_analysis | TEXT | AI风险分析（仅供参考） |
| ai_suggestion | TEXT | AI建议（仅供参考） |

### 2.4 风险评定规则

岗位风险评分模型：

| 因子 | 分值 | 条件 |
|------|------|------|
| 特种作业资质要求 | +30 | required_special_operation = true |
| 安全关键岗位 | +25 | required_safety_critical = true |
| 安全危害因素 | +10/项 | safety_hazards 数组长度 |
| 作业许可证要求 | +15 | work_permit_required = true |

风险等级判定：

| 评分范围 | 风险等级 |
|----------|----------|
| score ≥ 60 | critical（极高风险） |
| 35 ≤ score < 60 | high（高风险） |
| 15 ≤ score < 35 | medium（中风险） |
| 0 < score < 15 | low（低风险） |
| score = 0 | unknown（未知） |

### 2.5 API 端点

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/position-safety-profiles` | 分页查询岗位安全画像 |
| GET | `/position-safety-profiles/stats` | 岗位安全画像统计 |
| GET | `/position-safety-profiles/:id` | 岗位安全画像详情 |
| GET | `/position-safety-profiles/position/:positionId` | 查询某岗位的安全画像 |
| POST | `/position-safety-profiles` | 新增/更新岗位安全画像 |
| PUT | `/position-safety-profiles/:id` | 更新岗位安全画像 |
| DELETE | `/position-safety-profiles/:id` | 软删除岗位安全画像 |
| POST | `/position-safety-profiles/batch-assess` | 批量岗位风险评估 |

---

## 三、岗位培训要求（position_training_requirement）

### 3.1 设计目标

为每个岗位定义标准化的培训要求，包含：
- 培训类型和分类
- 学时要求
- 培训频率
- 考核要求
- 有效期管理
- 复训要求

### 3.2 表结构

```sql
CREATE TABLE position_training_requirement (
    id                      BIGSERIAL PRIMARY KEY,
    position_id             BIGINT NOT NULL,
    training_type           VARCHAR(64) NOT NULL,
    training_category       VARCHAR(32) NOT NULL,
    required_hours          DECIMAL(5,2) NOT NULL DEFAULT 0,
    frequency               VARCHAR(32) NOT NULL DEFAULT 'yearly',
    frequency_interval      INTEGER NOT NULL DEFAULT 1,
    required_certificate_category VARCHAR(32),
    is_mandatory            BOOLEAN NOT NULL DEFAULT TRUE,
    is_onboarding_required  BOOLEAN NOT NULL DEFAULT FALSE,
    is_refresher_required   BOOLEAN NOT NULL DEFAULT FALSE,
    refresher_interval_days INTEGER NOT NULL DEFAULT 365,
    training_content        TEXT,
    assessment_required     BOOLEAN NOT NULL DEFAULT TRUE,
    passing_score           INTEGER NOT NULL DEFAULT 80,
    validity_days           INTEGER,
    materials_required      JSONB,
    ai_training_suggestion  TEXT,
    ai_analysis_date        TIMESTAMP,
    ai_analysis_version     VARCHAR(32),
    remark                  TEXT,
    created_by              BIGINT,
    created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    is_deleted              BOOLEAN NOT NULL DEFAULT FALSE
);
```

### 3.3 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| position_id | BIGINT | 岗位ID（关联 position.id） |
| training_type | VARCHAR(64) | 培训类型名称 |
| training_category | VARCHAR(32) | 培训分类 |
| required_hours | DECIMAL(5,2) | 培训学时要求 |
| frequency | VARCHAR(32) | 培训频率 |
| frequency_interval | INTEGER | 频率间隔 |
| required_certificate_category | VARCHAR(32) | 合格后颁发的证件分类 |
| is_mandatory | BOOLEAN | 是否强制性培训 |
| is_onboarding_required | BOOLEAN | 是否为新员工入职必训 |
| is_refresher_required | BOOLEAN | 是否需要复训 |
| refresher_interval_days | INTEGER | 复训间隔天数 |
| assessment_required | BOOLEAN | 是否需要考核 |
| passing_score | INTEGER | 考核及格分数 |
| validity_days | INTEGER | 培训合格有效期（天） |
| ai_training_suggestion | TEXT | AI培训建议（仅供参考） |

### 3.4 培训分类

| 分类值 | 说明 |
|--------|------|
| safety | 安全类培训 |
| skill | 技能类培训 |
| special_operation | 特种作业培训 |
| fire | 消防培训 |
| health | 职业健康培训 |
| emergency | 应急救援培训 |
| other | 其他培训 |

### 3.5 培训频率

| 频率值 | 说明 |
|--------|------|
| daily | 每日 |
| weekly | 每周 |
| monthly | 每月 |
| quarterly | 每季度 |
| yearly | 每年 |
| once | 一次性 |

### 3.6 API 端点

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/position-training-requirements` | 分页查询岗位培训要求 |
| GET | `/position-training-requirements/stats` | 岗位培训要求统计 |
| GET | `/position-training-requirements/:id` | 岗位培训要求详情 |
| GET | `/position-training-requirements/position/:positionId` | 查询某岗位的培训要求 |
| POST | `/position-training-requirements` | 新增岗位培训要求 |
| PUT | `/position-training-requirements/:id` | 更新岗位培训要求 |
| DELETE | `/position-training-requirements/:id` | 软删除岗位培训要求 |
| POST | `/position-training-requirements/batch-import` | 批量导入岗位培训要求 |

---

## 四、与其他模块的关联

### 4.1 数据关联关系

```
position (岗位表)
    │
    ├─ position_safety_profile (1:1) — 岗位安全画像
    │   └─ required_cert_categories → employee_certificate.cert_category
    │
    └─ position_training_requirement (1:N) — 岗位培训要求
        └─ required_certificate_category → employee_certificate.cert_category

employee (员工主表)
    │
    ├─ employee_safety_profile (1:1) — 一人一档风险画像
    │   └─ 风险等级受岗位安全画像影响
    │
    └─ employee_certificate (1:N) — 员工证件
        └─ cert_category 需满足岗位要求
```

### 4.2 业务联动

| 联动场景 | 说明 |
|----------|------|
| 员工上岗校验 | 根据岗位安全画像校验员工证件是否齐全 |
| 培训计划生成 | 根据岗位培训要求自动生成培训计划 |
| 风险评估参考 | 岗位风险等级作为员工风险评估的参考因素 |
| 证件到期预警 | 根据岗位要求提醒证件到期员工 |

---

## 五、数据库迁移

### 5.1 迁移版本

- **版本**: v62
- **脚本**: `hse_employee_master_v62_extension.sql`
- **内容**: position_safety_profile + position_training_requirement

### 5.2 迁移原则

- 增量迁移，不删除旧字段
- 使用 `CREATE TABLE IF NOT EXISTS`，可重复执行
- 软删除规范：所有表保留 `is_deleted BOOLEAN DEFAULT FALSE`

---

## 六、技术约束遵守

| 约束 | 状态 | 说明 |
|------|------|------|
| 禁止修改Vben核心目录 | ✅ | 未修改 |
| 禁止修改auth/JWT | ✅ | 未修改 |
| 禁止新增npm依赖 | ✅ | 未新增 |
| 禁止新增人员表 | ✅ | 无新增人员表 |
| AI字段仅辅助分析 | ✅ | AI字段仅供参考，不参与自动定级 |
| 所有关联使用employee_id | ✅ | 人员关联均通过employee_id |

---

**文档版本**: v1.0  
**生成日期**: 2026-07-20  
**状态**: ✅ Sprint5.2 设计冻结

---

**文档结束**

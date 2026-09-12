# HSE Sprint5.3 设计文档 - 员工安全能力中心

**版本**: v1.0  
**日期**: 2026-07-20  
**依据**: 
- Sprint5.2完成报告
- position_training_requirement（岗位培训要求）

---

## 一、概述

### 1.1 目标

Sprint5.3 聚焦于**员工安全能力中心**，基于Sprint5.2已完成的`position_training_requirement`（岗位培训要求），新增三个核心表：

| 序号 | 模型 | 表名 | 说明 |
|------|------|------|------|
| 1 | 员工培训台账 | `training_record` | 记录员工所有培训经历 |
| 2 | 新员工培训 | `employee_induction_training` | 新员工入职培训专项管理 |
| 3 | 培训状态统计 | `employee_training_status` | 员工培训合规状态汇总 |

### 1.2 业务流程

```
┌─────────────────────────────────────────────────────────────────┐
│                    培训合规分析流程                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  position_training_requirement     training_record              │
│  （岗位培训要求 - 标准）            （员工培训台账 - 实际）       │
│           │                              │                      │
│           │    ┌──────────────────┐      │                      │
│           └───►│ 培训合规分析引擎 │◄─────┘                      │
│                └────────┬─────────┘                             │
│                         │                                       │
│                         ▼                                       │
│           employee_training_status                               │
│           （培训状态统计 - 合规判定）                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 技术约束

| 约束项 | 说明 |
|--------|------|
| 禁止新增人员表 | `employee` 为唯一人员主表 |
| 禁止修改 Vben 核心目录 | 不碰 `packages/@core/`、`packages/effects/`、`packages/themes/` |
| 禁止修改 auth/JWT | 不修改认证相关代码 |
| 禁止新增 npm 依赖 | 复用已有依赖 |
| AI 字段仅辅助分析 | AI 不参与安全结论自动生成 |
| 所有关联使用 employee_id | 人员关联必须通过 employee_id |
| 岗位培训要求作为标准依据 | 合规判定基于 position_training_requirement |

---

## 二、员工培训台账（training_record）

### 2.1 设计目标

完整记录员工的所有培训经历，包括：
- 培训基本信息（类型、名称、时间、地点）
- 培训来源（计划、临时、外训）
- 培训结果（合格/不合格/免训）
- 考核成绩
- 关联岗位和岗位培训要求

### 2.2 表结构

```sql
CREATE TABLE training_record (
    id                      BIGSERIAL PRIMARY KEY,
    employee_id             BIGINT NOT NULL,
    position_id             BIGINT,
    training_requirement_id BIGINT,
    training_type           VARCHAR(64) NOT NULL,
    training_category       VARCHAR(32) NOT NULL,
    training_name           VARCHAR(128) NOT NULL,
    training_source         VARCHAR(32) NOT NULL DEFAULT 'planned',
    training_provider       VARCHAR(128),
    trainer                 VARCHAR(64),
    training_location       VARCHAR(128),
    start_date              DATE NOT NULL,
    end_date                DATE,
    actual_hours            DECIMAL(5,2) NOT NULL DEFAULT 0,
    status                  VARCHAR(20) NOT NULL DEFAULT 'completed',
    assessment_result       VARCHAR(20),
    assessment_score        DECIMAL(5,2),
    passing_score           INTEGER,
    certificate_issued      BOOLEAN NOT NULL DEFAULT FALSE,
    certificate_no          VARCHAR(64),
    certificate_valid_from  DATE,
    certificate_valid_until DATE,
    cost                    DECIMAL(10,2),
    remark                  TEXT,
    attachments             JSONB,
    created_by              BIGINT,
    created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    is_deleted              BOOLEAN NOT NULL DEFAULT FALSE
);
```

### 2.3 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| employee_id | BIGINT | 员工ID（关联 employee.id） |
| position_id | BIGINT | 岗位ID（关联 position.id，培训时所在岗位） |
| training_requirement_id | BIGINT | 岗位培训要求ID（关联 position_training_requirement.id） |
| training_type | VARCHAR(64) | 培训类型名称 |
| training_category | VARCHAR(32) | 培训分类 |
| training_name | VARCHAR(128) | 培训项目名称 |
| training_source | VARCHAR(32) | 培训来源 |
| training_provider | VARCHAR(128) | 培训机构 |
| trainer | VARCHAR(64) | 培训讲师 |
| training_location | VARCHAR(128) | 培训地点 |
| start_date | DATE | 培训开始日期 |
| end_date | DATE | 培训结束日期 |
| actual_hours | DECIMAL(5,2) | 实际培训学时 |
| status | VARCHAR(20) | 培训状态 |
| assessment_result | VARCHAR(20) | 考核结果 |
| assessment_score | DECIMAL(5,2) | 考核成绩 |
| passing_score | INTEGER | 及格分数 |
| certificate_issued | BOOLEAN | 是否颁发证书 |
| certificate_no | VARCHAR(64) | 证书编号 |
| certificate_valid_from | DATE | 证书生效日期 |
| certificate_valid_until | DATE | 证书失效日期 |
| cost | DECIMAL(10,2) | 培训费用 |

### 2.4 枚举值定义

**培训来源（training_source）**：
| 值 | 说明 |
|----|------|
| planned | 计划内培训 |
| temporary | 临时培训 |
| external | 外部培训 |
| onboarding | 入职培训 |
| self_study | 自主学习 |

**培训状态（status）**：
| 值 | 说明 |
|----|------|
| scheduled | 已安排 |
| in_progress | 进行中 |
| completed | 已完成 |
| cancelled | 已取消 |
| failed | 未通过 |

**考核结果（assessment_result）**：
| 值 | 说明 |
|----|------|
| passed | 合格 |
| failed | 不合格 |
| exempted | 免考 |
| pending | 待考核 |

### 2.5 API 端点

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/training-records` | 分页查询培训台账 |
| GET | `/training-records/stats` | 培训台账统计 |
| GET | `/training-records/:id` | 培训台账详情 |
| GET | `/training-records/employee/:employeeId` | 查询员工培训记录 |
| POST | `/training-records` | 新增培训记录 |
| PUT | `/training-records/:id` | 更新培训记录 |
| DELETE | `/training-records/:id` | 删除培训记录 |
| POST | `/training-records/batch-import` | 批量导入培训记录 |

---

## 三、新员工培训（employee_induction_training）

### 3.1 设计目标

专项管理新员工入职培训，包含：
- 三级安全教育（公司级、部门级、班组级）
- 入职培训必修项
- 培训进度跟踪
- 合格判定

### 3.2 表结构

```sql
CREATE TABLE employee_induction_training (
    id                      BIGSERIAL PRIMARY KEY,
    employee_id             BIGINT NOT NULL,
    position_id             BIGINT NOT NULL,
    induction_start_date    DATE NOT NULL,
    induction_end_date      DATE,
    company_level_status    VARCHAR(20) NOT NULL DEFAULT 'pending',
    company_level_date      DATE,
    company_level_trainer   VARCHAR(64),
    company_level_hours     DECIMAL(5,2) DEFAULT 0,
    company_level_result    VARCHAR(20),
    department_level_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    department_level_date   DATE,
    department_level_trainer VARCHAR(64),
    department_level_hours  DECIMAL(5,2) DEFAULT 0,
    department_level_result VARCHAR(20),
    team_level_status       VARCHAR(20) NOT NULL DEFAULT 'pending',
    team_level_date         DATE,
    team_level_trainer      VARCHAR(64),
    team_level_hours        DECIMAL(5,2) DEFAULT 0,
    team_level_result       VARCHAR(20),
    total_hours             DECIMAL(5,2) DEFAULT 0,
    overall_status          VARCHAR(20) NOT NULL DEFAULT 'in_progress',
    overall_result          VARCHAR(20),
    qualified_date          DATE,
    expiry_date             DATE,
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
| employee_id | BIGINT | 员工ID |
| position_id | BIGINT | 入职岗位ID |
| induction_start_date | DATE | 入职培训开始日期 |
| induction_end_date | DATE | 入职培训结束日期 |
| company_level_status | VARCHAR(20) | 公司级培训状态 |
| company_level_date | DATE | 公司级培训日期 |
| company_level_trainer | VARCHAR(64) | 公司级培训讲师 |
| company_level_hours | DECIMAL(5,2) | 公司级培训学时 |
| company_level_result | VARCHAR(20) | 公司级考核结果 |
| department_level_status | VARCHAR(20) | 部门级培训状态 |
| department_level_date | DATE | 部门级培训日期 |
| department_level_trainer | VARCHAR(64) | 部门级培训讲师 |
| department_level_hours | DECIMAL(5,2) | 部门级培训学时 |
| department_level_result | VARCHAR(20) | 部门级考核结果 |
| team_level_status | VARCHAR(20) | 班组级培训状态 |
| team_level_date | DATE | 班组级培训日期 |
| team_level_trainer | VARCHAR(64) | 班组级培训讲师 |
| team_level_hours | DECIMAL(5,2) | 班组级培训学时 |
| team_level_result | VARCHAR(20) | 班组级考核结果 |
| total_hours | DECIMAL(5,2) | 总学时 |
| overall_status | VARCHAR(20) | 整体状态 |
| overall_result | VARCHAR(20) | 整体考核结果 |
| qualified_date | DATE | 合格日期 |
| expiry_date | DATE | 过期日期（需重新培训） |

### 3.4 枚举值定义

**三级安全教育状态（*_level_status）**：
| 值 | 说明 |
|----|------|
| pending | 待培训 |
| in_progress | 进行中 |
| completed | 已完成 |
| exempted | 免训 |

**整体状态（overall_status）**：
| 值 | 说明 |
|----|------|
| in_progress | 进行中 |
| completed | 已完成 |
| expired | 已过期 |

**考核结果（*_result）**：
| 值 | 说明 |
|----|------|
| passed | 合格 |
| failed | 不合格 |

### 3.5 API 端点

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/induction-trainings` | 分页查询新员工培训 |
| GET | `/induction-trainings/stats` | 新员工培训统计 |
| GET | `/induction-trainings/:id` | 新员工培训详情 |
| GET | `/induction-trainings/employee/:employeeId` | 查询员工入职培训 |
| POST | `/induction-trainings` | 新增入职培训记录 |
| PUT | `/induction-trainings/:id` | 更新入职培训记录 |
| POST | `/induction-trainings/:id/complete-level` | 完成某一级培训 |
| DELETE | `/induction-trainings/:id` | 删除入职培训记录 |

---

## 四、培训状态统计（employee_training_status）

### 4.1 设计目标

汇总员工培训合规状态，提供：
- 岗位培训要求完成度
- 待完成培训清单
- 过期培训预警
- 合规判定

### 4.2 表结构

```sql
CREATE TABLE employee_training_status (
    id                      BIGSERIAL PRIMARY KEY,
    employee_id             BIGINT NOT NULL,
    position_id             BIGINT NOT NULL,
    total_requirements      INTEGER NOT NULL DEFAULT 0,
    completed_count         INTEGER NOT NULL DEFAULT 0,
    pending_count           INTEGER NOT NULL DEFAULT 0,
    expired_count           INTEGER NOT NULL DEFAULT 0,
    compliance_rate         DECIMAL(5,2) DEFAULT 0,
    compliance_status       VARCHAR(20) NOT NULL DEFAULT 'unknown',
    last_training_date      DATE,
    next_due_date           DATE,
    pending_trainings       JSONB,
    expired_trainings       JSONB,
    last_analyzed_at        TIMESTAMP,
    analyzed_by             BIGINT,
    remark                  TEXT,
    created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    is_deleted              BOOLEAN NOT NULL DEFAULT FALSE
);
```

### 4.3 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| employee_id | BIGINT | 员工ID |
| position_id | BIGINT | 岗位ID |
| total_requirements | INTEGER | 该岗位培训要求总数 |
| completed_count | INTEGER | 已完成培训数 |
| pending_count | INTEGER | 待完成培训数 |
| expired_count | INTEGER | 过期培训数 |
| compliance_rate | DECIMAL(5,2) | 合规率（%） |
| compliance_status | VARCHAR(20) | 合规状态 |
| last_training_date | DATE | 最近培训日期 |
| next_due_date | DATE | 下次到期日期 |
| pending_trainings | JSONB | 待完成培训清单 |
| expired_trainings | JSONB | 过期培训清单 |
| last_analyzed_at | TIMESTAMP | 最近分析时间 |
| analyzed_by | BIGINT | 分析执行人 |

### 4.4 枚举值定义

**合规状态（compliance_status）**：
| 值 | 说明 |
|----|------|
| compliant | 合规（完成率100%，无过期） |
| partial | 部分合规（有未完成但无过期） |
| non_compliant | 不合规（有过期培训） |
| unknown | 未知（未分析） |

### 4.5 API 端点

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/training-status` | 分页查询培训状态 |
| GET | `/training-status/stats` | 培训状态统计 |
| GET | `/training-status/:id` | 培训状态详情 |
| GET | `/training-status/employee/:employeeId` | 查询员工培训状态 |
| POST | `/training-status/analyze` | 执行培训合规分析 |
| POST | `/training-status/batch-analyze` | 批量培训合规分析 |
| GET | `/training-status/non-compliant` | 不合规员工列表 |
| GET | `/training-status/expiring` | 即将到期培训列表 |

---

## 五、培训合规分析引擎

### 5.1 分析逻辑

```javascript
async function analyzeTrainingCompliance(employeeId, positionId) {
  // 1. 获取岗位培训要求（标准）
  const requirements = await getPositionTrainingRequirements(positionId);
  
  // 2. 获取员工培训记录（实际）
  const records = await getTrainingRecords(employeeId);
  
  // 3. 匹配分析
  const status = {
    total: requirements.length,
    completed: 0,
    pending: 0,
    expired: 0,
    pendingList: [],
    expiredList: []
  };
  
  for (const req of requirements) {
    const matchedRecord = findMatchingRecord(req, records);
    
    if (!matchedRecord) {
      // 无培训记录
      status.pending++;
      status.pendingList.push(req);
    } else if (isExpired(req, matchedRecord)) {
      // 培训已过期
      status.expired++;
      status.expiredList.push(req);
    } else if (matchedRecord.status === 'completed' && 
               matchedRecord.assessment_result === 'passed') {
      // 培训合格
      status.completed++;
    } else {
      // 培训未完成或未通过
      status.pending++;
      status.pendingList.push(req);
    }
  }
  
  // 4. 计算合规率
  status.complianceRate = (status.completed / status.total * 100).toFixed(2);
  
  // 5. 判定合规状态
  if (status.expired > 0) {
    status.complianceStatus = 'non_compliant';
  } else if (status.pending > 0) {
    status.complianceStatus = 'partial';
  } else {
    status.complianceStatus = 'compliant';
  }
  
  return status;
}
```

### 5.2 过期判定规则

| 条件 | 判定 |
|------|------|
| 培训记录不存在 | 待完成 |
| 培训记录状态为 failed/cancelled | 待完成 |
| 培训记录考核结果为 failed | 待完成 |
| 培训记录存在且合格，但证书已过期 | 过期 |
| 培训记录存在且合格，且在有效期内 | 已完成 |

---

## 六、数据关联关系

```
position_training_requirement（岗位培训要求 - 标准）
    │
    │  training_requirement_id
    ▼
training_record（员工培训台账 - 实际）
    │
    │  employee_id
    ▼
employee_training_status（培训状态统计 - 合规判定）
    │
    └─► compliance_status: compliant/partial/non_compliant

employee_induction_training（新员工入职培训）
    │
    └─► employee_id → employee.id
    └─► position_id → position.id
```

---

## 七、数据库迁移

### 7.1 迁移版本

- **版本**: v63
- **脚本**: `hse_employee_master_v63_extension.sql`
- **内容**: training_record + employee_induction_training + employee_training_status

### 7.2 迁移原则

- 增量迁移，不删除旧字段
- 使用 `CREATE TABLE IF NOT EXISTS`，可重复执行
- 软删除规范：所有表保留 `is_deleted BOOLEAN DEFAULT FALSE`

---

## 八、技术约束遵守

| 约束 | 状态 | 说明 |
|------|------|------|
| 禁止修改Vben核心目录 | ✅ | 未修改 |
| 禁止修改auth/JWT | ✅ | 未修改 |
| 禁止新增npm依赖 | ✅ | 未新增 |
| 禁止新增人员表 | ✅ | 无新增人员表 |
| AI字段仅辅助分析 | ✅ | AI字段仅供参考，不参与合规判定 |
| 所有关联使用employee_id | ✅ | 人员关联均通过employee_id |
| 岗位培训要求作为标准依据 | ✅ | 合规分析基于position_training_requirement |

---

**文档版本**: v1.0  
**生成日期**: 2026-07-20  
**状态**: ✅ Sprint5.3 设计冻结

---

**文档结束**
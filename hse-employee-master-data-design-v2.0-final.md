# HSE Sprint5.1 人员主数据中心 — 最终开发设计文档

> 版本：v2.0（最终版，含扩展表）
> 日期：2026-07-20
> 依据：
>   - HSE V2.0.1 发布完成
>   - `Sprint5-规划方案.md`
>   - `Sprint5-phase0-architecture-design.md`
>   - `hse-employee-master-data-design-v1.2-freeze.md`
> 范围：Sprint5.1 人员主数据中心（含证件 + 一人一档扩展）
> 状态：**Sprint5.1 编码依据本文档执行**

---

## 一、Sprint5 实施路线调整

### 1.1 调整背景

原 Sprint5 规划采用「整改闭环优先」路线，意图尽快补齐「发现→处理→关闭」闭环能力。但在 Sprint5-phase0 架构设计阶段发现：整改任务、检查任务、隐患记录均需引用 `responsible_person_id` / `inspector_ids` / `discoverer_id` / `reviewer_id` 等人员标识字段。

**核心矛盾**：

| 矛盾点 | 说明 |
|--------|------|
| 多套人员标识并存 | 现有 `personnel.js` / `training.js` / `insurance.js` 使用 `personnel_id`，旧表与 `users.id` 无关联 |
| 责任人无法定位 | 整改任务的 `responsible_person_id` 无法指向统一人员主体，后续追溯困难 |
| 数据隔离失败 | 整改/检查/隐患的 `enterprise_id` 隔离需要通过员工 → 组织关系推导，无员工主表则无法实现 |
| 历史可追溯性 | 调岗后责任人变更无法体现在历史记录中，缺 `employee_history` 支撑 |

### 1.2 调整后路线

**原路线（已废弃）**：

```
Sprint5.1 整改闭环 → Sprint5.2 检查管理 → Sprint5.3 隐患治理 → Sprint5.4 安全台账
```

**新路线（本版本）**：

```
Sprint5.1 人员主数据中心  ← 当前 Sprint
    │
    │ 所有责任人/检查人/整改人/复查人统一通过 employee_id 关联
    ▼
Sprint5.2 安全台账中心
    │
    ▼
Sprint5.3 隐患整改闭环
    │
    ▼
Sprint5.4 检查管理
```

### 1.3 调整原因

**所有责任人、检查人、整改人必须基于 `employee_id`**：

1. **统一关联键**：整改/检查/隐患模块的所有人员字段统一使用 `employee_id`，杜绝 `personnel_id` / `user_id` / `id_card` 多套标识并存
2. **组织隔离基础**：通过 `hse_employee_org.enterprise_id` 推导员工所属企业，为 Sprint5.3/5.4 的 `enterprise_id` 数据隔离提供依据
3. **历史可追溯**：调岗后原责任人记录保留在 `employee_history`，可追溯责任链
4. **证件资质校验**：特种作业人员上岗前需校验证件有效性，整改/检查责任人需校验安全资质，依赖 `employee_certificate` 表
5. **一人一档支撑**：责任人风险画像（`employee_safety_profile`）为整改任务分配、检查人选派提供辅助参考

### 1.4 与 phase0 架构设计的差异

| 维度 | phase0 架构设计 | 本文档（最终版） |
|------|----------------|-----------------|
| 组织模型 | 四级（集团/区域/企业/项目） | **五级**（集团/区域/企业/项目/班组），与 v1.2 冻结版一致 |
| 组织表 | `hse_organizations`（新建） | **复用** `department`（v1.2 已冻结） |
| 数据隔离 | `enterprise_id` 字段 | 通过 `hse_employee_org.enterprise_id` 推导，业务表冗余 `enterprise_id` |
| 人员主表 | 未明确 | `employee`（v1.2 已冻结，唯一人员主表） |
| Sprint5.1 范围 | 整改闭环 | **人员主数据中心**（含证件 + 一人一档） |

> **关键决策**：phase0 架构设计的 `hse_organizations` 表**不再新建**，直接复用 v1.2 冻结版的 `department` 五级组织模型。所有 phase0 中引用 `hse_organizations.id` 的位置统一改为 `department.id`。

---

## 二、Sprint5.1 开发范围

### 2.1 开发内容（7 个核心模型）

| 序号 | 表名 | 类型 | 状态 | 说明 |
|------|------|------|------|------|
| 1 | `employee` | 主表 | v1.2 已冻结 | 员工主表（唯一人员表） |
| 2 | `department` | 主表 | v1.2 已冻结 | 组织模型（五级树形） |
| 3 | `position` | 主表 | v1.2 已冻结 | 岗位模型 |
| 4 | `hse_employee_org` | 关系表 | v1.2 已冻结 | 人员组织关系（五级组织引用 + org_path 快照 + is_current） |
| 5 | `employee_history` | 历史表 | v1.2 已冻结 | 人事变动记录（含 operator_id） |
| 6 | `employee_certificate` | 扩展表 | **本文档新增** | 证件统一管理（特种作业操作证、安全资格证书、健康证等） |
| 7 | `employee_safety_profile` | 扩展表 | **本文档新增** | 一人一档风险画像（风险等级、事故记录、违规记录） |

### 2.2 不在 Sprint5.1 范围

- ❌ `position_safety_profile`（岗位安全画像）→ Sprint5.2
- ❌ 业务关联表迁移（training/insurance/driver 等关联到 employee_id）→ Sprint5.3
- ❌ 旧 `personnel` 表数据迁移至 `employee` → Sprint5.3
- ❌ 安全台账五大类页面 → Sprint5.2
- ❌ 整改闭环 / 检查管理 / 隐患治理 → Sprint5.3 / 5.4

### 2.3 强制约束

- ✅ 禁止修改 Vben 核心目录（`packages/@core`、`packages/effects`、`packages/themes`）
- ✅ 禁止修改 auth/JWT 登录流程（仅复用 `requireRole`）
- ✅ 禁止新增 npm 依赖
- ✅ 禁止新增重复人员表（`employee` 为唯一人员主表）
- ✅ 所有业务必须通过 `employee_id` 关联

---

## 三、整体架构

### 3.1 表关系图（Sprint5.1 完整视图）

```
                         ┌─────────────────┐
                         │   department    │  组织模型（五级树形，v1.2 已冻结）
                         │  (五级树形)      │
                         └────────┬────────┘
                                  │ parent_id（自引用）
                                  ▼
                         ┌─────────────────┐
                         │    position     │  岗位模型（v1.2 已冻结）
                         │   (岗位)         │──┐
                         └─────────────────┘  │ dept_id
                                              │
┌─────────────────┐    employee_id    ┌──────┴──────────┐
│ employee_history│◄──────────────────┤ hse_employee_org │  人员组织关系（v1.2 已冻结）
│ (人事变动记录)   │                   │  (五级组织引用)    │
└─────────────────┘                   └──────┬──────────┘
        ▲                                    │
        │ employee_id                         │ employee_id
        │                                    ▼
        │                          ┌─────────────────┐
        └──────────────────────────│    employee     │  员工主表（v1.2 已冻结，唯一）
                                   │   (加密字段)     │
                                   └────────┬────────┘
                                            │ employee_id
                            ┌───────────────┴───────────────┐
                            │                               │
              ┌─────────────▼─────────────┐   ┌─────────────▼──────────────┐
              │  employee_certificate     │   │  employee_safety_profile   │
              │  (证件统一管理，本文档新增) │   │  (一人一档风险画像，新增)   │
              └───────────────────────────┘   └────────────────────────────┘
```

### 3.2 与后续 Sprint 的衔接

```
Sprint5.1（本文档）
    │
    │ employee_id 为统一关联键
    ▼
Sprint5.2 安全台账中心
    │ - 培训台账（关联 employee_certificate + 培训记录）
    │ - 人员安全档案（关联 employee_safety_profile）
    │ - 设备/应急/风险台账
    ▼
Sprint5.3 隐患整改闭环
    │ - hse_rectification_tasks.responsible_person_id → employee_id
    │ - hse_hazard_records.discoverer_id → employee_id
    │ - hse_hazard_records.responsible_person_id → employee_id
    │ - 复用 employee_certificate 校验特种作业资质
    ▼
Sprint5.4 检查管理
      - hse_inspection_tasks.inspector_ids → employee_id[]
      - hse_inspection_items.checked_by → employee_id
      - 复用 employee_safety_profile 推荐检查重点
```

---

## 四、已冻结表结构（v1.2，禁止修改）

以下 5 张表已在 `hse-employee-master-data-design-v1.2-freeze.md` 中冻结，本文档仅引用，不重复定义：

| 表名 | 用途 | 关键字段 |
|------|------|---------|
| `department` | 组织模型（五级树形） | dept_code, name, parent_id, level(1-5), path, manager_id, safety_manager_id, headcount |
| `position` | 岗位模型 | position_code, name, dept_id, job_category, is_special_post, is_safety_critical, safety_duties |
| `employee` | 员工主表（唯一人员表） | employee_code, id_card(加密), name, gender, birth_date, phone(加密), person_type, person_category, id_card_hash, phone_hash |
| `hse_employee_org` | 人员组织关系 | employee_id, group_id/region_id/enterprise_id/project_id/team_id, org_path, position_id, start_date, end_date, status, is_current |
| `employee_history` | 人事变动记录 | employee_id, event_type, event_date, before_*/after_*, operator_id |

**视图**：
- `v_employee_with_age` — 通过 `EXTRACT(YEAR FROM age(birth_date))::INT` 计算年龄

**已冻结 API（22 个端点）**：详见 v1.2 冻结版文档第七章

**已冻结迁移**：
- v59：5 表 + 1 视图 DDL（`server/sql/hse_employee_master_v59_migration.sql`）
- v60：加固迁移（`server/sql/hse_employee_master_v60_hardening.sql`）

---

## 五、扩展表设计（本文档新增）

### 5.1 employee_certificate — 证件统一管理表

#### 5.1.1 业务定位

统一管理员工持有的各类证件，包括：
- **特种作业操作证**（电工、焊工、叉车、高处作业、制冷空调等）
- **安全资格证书**（安全生产知识和管理能力考核合格证）
- **职业健康检查合格证**（健康证）
- **特种设备作业人员证**（锅炉、压力容器、电梯、起重机械等）
- **驾驶员从业资格证**（道路运输、危化品运输等）
- **其他证件**（学位证、技能等级证等）

#### 5.1.2 字段设计

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|:----:|--------|------|
| `id` | BIGSERIAL | ✅ | — | 主键 |
| `employee_id` | BIGINT | ✅ | — | 员工 ID（关联 `employee.id`，逻辑关联不加外键） |
| `cert_code` | VARCHAR(64) | ❌ | NULL | 证件编号（业务可读，如 `CERT-2026-0001`） |
| `cert_name` | VARCHAR(128) | ✅ | — | 证件名称（如「低压电工作业操作证」） |
| `cert_category` | VARCHAR(32) | ✅ | — | 证件分类：`special_operation` / `safety_qualification` / `health` / `special_equipment` / `driver_license` / `professional` / `other` |
| `cert_type` | VARCHAR(64) | ❌ | NULL | 证件类型细项（如「电工」「焊工」「叉车」） |
| `issuer` | VARCHAR(128) | ❌ | NULL | 发证机关 |
| `issue_date` | DATE | ❌ | NULL | 发证日期 |
| `start_date` | DATE | ❌ | NULL | 有效期开始日期 |
| `expire_date` | DATE | ❌ | NULL | 有效期结束日期（NULL 表示长期有效） |
| `status` | VARCHAR(20) | ✅ | 'valid' | 证件状态：`valid` / `expired` / `revoked` / `pending_review` / `invalid` |
| `cert_no` | VARCHAR(64) | ❌ | NULL | 证件号码（证件本身的编号，与 `cert_code` 业务编号区分） |
| `verification_no` | VARCHAR(128) | ❌ | NULL | 查验编号（用于官方查验平台核验） |
| `is_special_operation` | BOOLEAN | ✅ | FALSE | 是否特种作业证件（特种作业操作证 + 特种设备作业证） |
| `is_safety_critical` | BOOLEAN | ✅ | FALSE | 是否安全关键岗位必备证件 |
| `attachment_ids` | JSONB | ❌ | NULL | 证件附件文件 ID 列表（引用 `document_files.id`，逻辑关联） |
| `verification_status` | VARCHAR(20) | ❌ | NULL | 查验状态：`unverified` / `verified` / `failed` / `expired_verify` |
| `verification_date` | DATE | ❌ | NULL | 最近查验日期 |
| `verification_remark` | TEXT | ❌ | NULL | 查验备注 |
| `remark` | TEXT | ❌ | NULL | 备注 |
| `created_by` | BIGINT | ❌ | NULL | 创建人 ID（来自 `req.user.id`） |
| `created_at` | TIMESTAMP | ✅ | NOW() | 创建时间 |
| `updated_at` | TIMESTAMP | ✅ | NOW() | 更新时间 |
| `is_deleted` | BOOLEAN | ✅ | FALSE | 软删除标识 |

#### 5.1.3 索引设计（9 个）

```sql
-- 主键索引（自动）
-- 业务查询索引
CREATE INDEX IF NOT EXISTS idx_emp_cert_employee
    ON employee_certificate (employee_id) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_emp_cert_category
    ON employee_certificate (cert_category) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_emp_cert_type
    ON employee_certificate (cert_type) WHERE cert_type IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_emp_cert_status
    ON employee_certificate (status) WHERE is_deleted = false;

-- 有效期预警查询（临期/过期）
CREATE INDEX IF NOT EXISTS idx_emp_cert_expire
    ON employee_certificate (expire_date) WHERE expire_date IS NOT NULL AND is_deleted = false;

-- 特种作业证件筛选
CREATE INDEX IF NOT EXISTS idx_emp_cert_special
    ON employee_certificate (is_special_operation) WHERE is_special_operation = true AND is_deleted = false;

-- 证件编号唯一性（业务编号，可空）
CREATE UNIQUE INDEX IF NOT EXISTS uk_emp_cert_code
    ON employee_certificate (cert_code) WHERE cert_code IS NOT NULL AND is_deleted = false;

-- 证件号码 + 类型组合唯一（同一证件号码在同一类型下唯一）
CREATE UNIQUE INDEX IF NOT EXISTS uk_emp_cert_no_type
    ON employee_certificate (cert_no, cert_category) 
    WHERE cert_no IS NOT NULL AND is_deleted = false;

-- 创建人追溯
CREATE INDEX IF NOT EXISTS idx_emp_cert_created_by
    ON employee_certificate (created_by) WHERE created_by IS NOT NULL AND is_deleted = false;
```

#### 5.1.4 状态机

```
[新建证件]
    │
    ▼
valid（有效）
    │
    ├─ 超过 expire_date → expired（过期）
    │
    ├─ 主动吊销 → revoked（吊销）
    │
    ├─ 待复查 → pending_review（待复查）
    │       │
    │       ├─ 复查通过 → valid
    │       └─ 复查失败 → invalid（失效）
    │
    └─ 长期有效（expire_date IS NULL）→ 持续 valid
```

#### 5.1.5 有效期预警规则

```sql
-- 临期：30 天内到期
SELECT * FROM employee_certificate
WHERE is_deleted = false
  AND status = 'valid'
  AND expire_date IS NOT NULL
  AND expire_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days';

-- 过期：自动状态变更（应用层定时任务或查询时计算）
SELECT * FROM employee_certificate
WHERE is_deleted = false
  AND status = 'valid'
  AND expire_date IS NOT NULL
  AND expire_date < CURRENT_DATE;
```

> **设计决策**：过期状态不通过触发器自动更新，由应用层定时任务（每日扫描）或在查询时动态计算。避免触发器带来的性能开销和调试复杂度。

#### 5.1.6 证件分类枚举

| cert_category | 说明 | 示例 cert_type |
|---------------|------|---------------|
| `special_operation` | 特种作业操作证 | 电工 / 焊工 / 高处作业 / 制冷空调作业 / 叉车 |
| `safety_qualification` | 安全资格证书 | 安全生产知识和管理能力考核合格证 |
| `health` | 职业健康检查合格证 | 健康证 |
| `special_equipment` | 特种设备作业人员证 | 锅炉 / 压力容器 / 电梯 / 起重机械 |
| `driver_license` | 驾驶员从业资格证 | 道路运输 / 危化品运输 |
| `professional` | 专业技能证书 | 学位证 / 技能等级证 |
| `other` | 其他证件 | — |

#### 5.1.7 与 employee 的关系

- **N:1**：一个员工可持有多个证件（典型：电工证 + 健康证 + 安全资格证）
- **逻辑关联**：`employee_id` 不加数据库外键（遵循 v1.2 冻结原则），由应用层保证
- **软删除联动**：员工软删除时，证件状态保持不变（历史可查），但不在前台展示

---

### 5.2 employee_safety_profile — 一人一档风险画像表

#### 5.2.1 业务定位

为每位员工建立**一人一档安全档案**，记录：
- **风险等级**（基于岗位风险、事故记录、违规记录综合评定）
- **事故记录**（参与的事故次数、责任划分）
- **违规记录**（违章次数、严重程度）
- **培训完成情况**（培训学时、考核成绩汇总）
- **隐患关联**（作为责任人/发现人/复查人参与的隐患数）
- **整改关联**（作为责任人参与的整改任务数、超期次数）
- **AI 辅助风险分析**（AI 字段，仅供参考，不作为定级依据）

#### 5.2.2 字段设计

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|:----:|--------|------|
| `id` | BIGSERIAL | ✅ | — | 主键 |
| `employee_id` | BIGINT | ✅ | — | 员工 ID（关联 `employee.id`，逻辑关联） |
| `risk_level` | VARCHAR(20) | ✅ | 'unknown' | 风险等级：`low` / `medium` / `high` / `critical` / `unknown` |
| `risk_score` | DECIMAL(5,2) | ❌ | NULL | 风险评分（0-100，由应用层按规则计算，AI 不参与） |
| `risk_factors` | JSONB | ❌ | NULL | 风险因素列表（结构化，如 `{"factors": ["高空作业", "特种作业", "事故记录"]}`) |
| `accident_count` | INTEGER | ✅ | 0 | 参与事故次数（累计） |
| `accident_responsible_count` | INTEGER | ✅ | 0 | 责任事故次数（本人负有责任的） |
| `violation_count` | INTEGER | ✅ | 0 | 违章违规次数（累计） |
| `serious_violation_count` | INTEGER | ✅ | 0 | 严重违章次数 |
| `training_count` | INTEGER | ✅ | 0 | 培训完成次数（累计） |
| `training_hours` | DECIMAL(8,2) | ✅ | 0 | 培训总学时（累计，小时） |
| `last_training_date` | DATE | ❌ | NULL | 最近培训日期 |
| `hazard_involved_count` | INTEGER | ✅ | 0 | 参与隐患数（作为发现人/责任人/复查人累计） |
| `rectification_count` | INTEGER | ✅ | 0 | 参与整改任务数（作为责任人累计） |
| `rectification_overdue_count` | INTEGER | ✅ | 0 | 整改超期次数（累计） |
| `last_accident_date` | DATE | ❌ | NULL | 最近事故日期 |
| `last_violation_date` | DATE | ❌ | NULL | 最近违章日期 |
| `last_assessment_date` | DATE | ❌ | NULL | 最近风险评估日期 |
| `assessment_method` | VARCHAR(32) | ❌ | NULL | 评估方式：`manual` / `auto_calculated` / `hybrid` |
| `safety_qualification` | VARCHAR(20) | ❌ | NULL | 安全资质状态：`qualified` / `unqualified` / `pending` / `expired` |
| `special_operation_qualified` | BOOLEAN | ❌ | NULL | 是否具备特种作业资质（基于 `employee_certificate` 推导） |
| `health_status` | VARCHAR(20) | ❌ | NULL | 职业健康状态：`fit` / `unfit` / `restricted` / `pending_exam` |
| `last_health_exam_date` | DATE | ❌ | NULL | 最近职业健康体检日期 |
| `next_health_exam_date` | DATE | ❌ | NULL | 下次职业健康体检日期 |
| `restricted_work_types` | JSONB | ❌ | NULL | 限制作业类型（健康原因限制，如 `["高处作业", "夜班"]`） |
| `ai_risk_analysis` | TEXT | ❌ | NULL | AI 风险分析（根因分析+趋势预测，AI 字段，仅供参考） |
| `ai_suggestion` | TEXT | ❌ | NULL | AI 建议（培训建议/调岗建议，AI 字段，仅供参考） |
| `ai_analysis_date` | TIMESTAMP | ❌ | NULL | AI 分析生成时间 |
| `ai_analysis_version` | VARCHAR(32) | ❌ | NULL | AI 分析版本（用于追溯 Prompt 版本） |
| `remark` | TEXT | ❌ | NULL | 备注 |
| `created_by` | BIGINT | ❌ | NULL | 创建人 ID |
| `created_at` | TIMESTAMP | ✅ | NOW() | 创建时间 |
| `updated_at` | TIMESTAMP | ✅ | NOW() | 更新时间 |
| `is_deleted` | BOOLEAN | ✅ | FALSE | 软删除标识 |

#### 5.2.3 索引设计（10 个）

```sql
-- 主键索引（自动）
-- 员工关联（一人一档，一个员工一条记录）
CREATE UNIQUE INDEX IF NOT EXISTS uk_emp_safety_profile_employee
    ON employee_safety_profile (employee_id) WHERE is_deleted = false;

-- 风险等级筛选（高/重大风险人员监控）
CREATE INDEX IF NOT EXISTS idx_emp_safety_risk_level
    ON employee_safety_profile (risk_level) WHERE is_deleted = false;

-- 风险评分排序
CREATE INDEX IF NOT EXISTS idx_emp_safety_risk_score
    ON employee_safety_profile (risk_score DESC NULLS LAST) WHERE is_deleted = false;

-- 事故次数筛选
CREATE INDEX IF NOT EXISTS idx_emp_safety_accident
    ON employee_safety_profile (accident_count) WHERE accident_count > 0 AND is_deleted = false;

-- 违章次数筛选
CREATE INDEX IF NOT EXISTS idx_emp_safety_violation
    ON employee_safety_profile (violation_count) WHERE violation_count > 0 AND is_deleted = false;

-- 安全资质状态筛选
CREATE INDEX IF NOT EXISTS idx_emp_safety_qualification
    ON employee_safety_profile (safety_qualification) WHERE safety_qualification IS NOT NULL AND is_deleted = false;

-- 健康状态筛选
CREATE INDEX IF NOT EXISTS idx_emp_safety_health
    ON employee_safety_profile (health_status) WHERE health_status IS NOT NULL AND is_deleted = false;

-- 下次体检日期预警
CREATE INDEX IF NOT EXISTS idx_emp_safety_next_exam
    ON employee_safety_profile (next_health_exam_date) WHERE next_health_exam_date IS NOT NULL AND is_deleted = false;

-- 最近评估日期
CREATE INDEX IF NOT EXISTS idx_emp_safety_assessment
    ON employee_safety_profile (last_assessment_date) WHERE last_assessment_date IS NOT NULL AND is_deleted = false;
```

#### 5.2.4 风险等级评定规则（应用层实现，非数据库）

| 风险等级 | 触发条件（满足任一） | 说明 |
|---------|---------------------|------|
| `critical` | 责任事故 ≥ 1 次 / 严重违章 ≥ 3 次 / 整改超期 ≥ 5 次 | 立即停岗复查 |
| `high` | 事故 ≥ 2 次 / 违章 ≥ 5 次 / 整改超期 ≥ 2 次 / 健康 unfit | 重点关注，加强培训 |
| `medium` | 事故 ≥ 1 次 / 违章 ≥ 2 次 / 培训学时不足 / 健康受限 | 常规关注 |
| `low` | 无事故 / 无违章 / 培训达标 / 健康 fit | 正常 |
| `unknown` | 数据不足（新入职） | 待评估 |

> **关键约束**：风险等级由应用层基于规则计算，**AI 不参与定级**。AI 仅提供风险分析参考文本，存入 `ai_risk_analysis` 字段。

#### 5.2.5 统计字段更新策略

| 字段 | 更新时机 | 数据来源 |
|------|---------|---------|
| `accident_count` | 事故登记/关闭时 | 事故模块（Sprint5.2+，预留） |
| `violation_count` | 违章登记时 | 违章模块（Sprint5.2+，预留） |
| `training_count` / `training_hours` | 培训记录创建时 | 培训模块（已有 `training_records`，Sprint5.3 迁移后关联） |
| `hazard_involved_count` | 隐患登记/整改分配时 | 隐患模块（Sprint5.3） |
| `rectification_count` / `rectification_overdue_count` | 整改任务创建/超期时 | 整改模块（Sprint5.3） |
| `last_health_exam_date` / `next_health_exam_date` | 健康证更新时 | `employee_certificate` 表（cert_category='health'） |
| `risk_level` / `risk_score` | 定时任务（每日）/ 事件触发 | 应用层按规则计算 |

> **Sprint5.1 范围**：仅创建表结构 + 基础 CRUD + 风险等级评定规则。统计字段在 Sprint5.1 阶段保持默认值 0，由后续 Sprint 模块在事件触发时更新。

#### 5.2.6 AI 边界（严格约束）

| AI 能力 | 存储字段 | 允许 | 禁止 |
|---------|---------|------|------|
| 风险分析 | `ai_risk_analysis` | ✅ 分析风险因素、趋势预测 | ❌ 自动定级 |
| 改进建议 | `ai_suggestion` | ✅ 培训建议、调岗建议 | ❌ 自动处罚 |
| 风险定级 | — | ❌ AI 不参与 | ✅ 应用层规则计算 |
| 责任判定 | — | ❌ AI 不参与 | ✅ 人工调查确认 |

**绝对禁止**：
- ❌ AI 自动生成风险等级
- ❌ AI 自动生成处罚决定
- ❌ AI 自动调整风险评分
- ❌ AI 自动判定责任归属

---

## 六、API 端点设计

### 6.1 已冻结 API（22 个，v1.2 已实现）

详见 v1.2 冻结版文档第七章，本文档不重复。已实现的端点包括：
- 员工管理（10 个）：CRUD + 统计 + 导入（JSON/Excel）
- 组织管理（5 个）：树/扁平/CRUD
- 岗位管理（4 个）：CRUD
- 组织关系（4 个）：查询/历史/调岗/状态变更
- 历史记录（1 个）：查询

### 6.2 新增 API（本文档扩展，共 16 个）

#### 6.2.1 证件管理端点（8 个）

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/certificates` | 认证 | 分页查询（按员工/分类/状态/有效期过滤） |
| GET | `/certificates/stats` | 认证 | 统计（按分类/状态/临期/过期） |
| GET | `/certificates/:id` | 认证 | 证件详情 |
| GET | `/certificates/employee/:employeeId` | 认证 | 查询某员工的所有证件 |
| POST | `/certificates` | admin/safety_manager | 新增证件（含附件关联） |
| PUT | `/certificates/:id` | admin/safety_manager | 更新证件 |
| DELETE | `/certificates/:id` | admin/safety_manager | 软删除证件 |
| POST | `/certificates/batch-import` | admin/safety_manager | 批量导入证件（JSON） |

#### 6.2.2 证件预警端点（2 个）

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/certificates/expiring` | 认证 | 临期证件列表（30 天内到期） |
| GET | `/certificates/expired` | 认证 | 已过期证件列表（自动状态变更） |

#### 6.2.3 一人一档端点（6 个）

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/safety-profiles` | 认证 | 分页查询（按风险等级/资质状态/健康状态过滤） |
| GET | `/safety-profiles/stats` | 认证 | 统计（按风险等级/资质状态分布） |
| GET | `/safety-profiles/employee/:employeeId` | 认证 | 查询某员工的一人一档（含证件汇总） |
| POST | `/safety-profiles/employee/:employeeId/assess` | admin/safety_manager | 手动触发风险评估（应用层规则计算） |
| PUT | `/safety-profiles/:id` | admin/safety_manager | 更新风险画像（人工调整风险等级、备注等） |
| POST | `/safety-profiles/batch-assess` | admin/safety_manager | 批量风险评估（定时任务触发） |

### 6.3 典型业务流程

#### 6.3.1 新员工入职并录入证件

```bash
# 1. 新增员工（v1.2 已实现）
POST /api/hse/employee/employees
  { "employee_code": "EMP-001", "name": "张三", "birth_date": "1990-01-01" }

# 2. 分配组织（v1.2 已实现）
POST /api/hse/employee/org/assign
  { "employee_id": 1, "team_id": 5, "position_id": 1, "start_date": "2026-01-15" }

# 3. 录入电工证（本文档新增）
POST /api/hse/employee/certificates
  {
    "employee_id": 1,
    "cert_name": "低压电工作业操作证",
    "cert_category": "special_operation",
    "cert_type": "电工",
    "issuer": "XX市应急管理局",
    "issue_date": "2024-03-15",
    "start_date": "2024-03-15",
    "expire_date": "2030-03-15",
    "is_special_operation": true,
    "is_safety_critical": true
  }

# 4. 录入健康证
POST /api/hse/employee/certificates
  {
    "employee_id": 1,
    "cert_name": "职业健康检查合格证",
    "cert_category": "health",
    "start_date": "2026-01-10",
    "expire_date": "2027-01-10"
  }

# 5. 查询员工证件汇总
GET /api/hse/employee/certificates/employee/1
```

#### 6.3.2 风险评估流程

```bash
# 1. 查询员工当前一人一档
GET /api/hse/employee/safety-profiles/employee/1

# 2. 触发手动风险评估（应用层按规则计算 risk_level / risk_score）
POST /api/hse/employee/safety-profiles/employee/1/assess
  { "assessment_method": "auto_calculated" }

# 3. 人工调整风险等级（如有特殊情况）
PUT /api/hse/employee/safety-profiles/1
  { 
    "risk_level": "high",
    "remark": "近期多次违章，人工调整为高风险",
    "assessment_method": "hybrid"
  }

# 4. 批量风险评估（每日定时任务）
POST /api/hse/employee/safety-profiles/batch-assess
  { "filter": { "risk_level": ["medium", "high", "critical"] } }
```

#### 6.3.3 证件临期预警

```bash
# 查询 30 天内到期证件
GET /api/hse/employee/certificates/expiring?days=30

# 查询已过期证件
GET /api/hse/employee/certificates/expired

# 响应结构
{
  "success": true,
  "data": {
    "total": 5,
    "list": [
      {
        "id": 1,
        "employee_id": 1,
        "employee_name": "张三",
        "cert_name": "低压电工作业操作证",
        "expire_date": "2026-08-15",
        "days_until_expire": 26,
        "status": "valid"
      }
    ]
  }
}
```

---

## 七、数据库迁移规划

### 7.1 迁移版本规划

| 版本 | 内容 | 状态 | 文件 |
|------|------|------|------|
| v59 | 5 表 + 1 视图主迁移 | ✅ 已执行 | `server/sql/hse_employee_master_v59_migration.sql` |
| v60 | 加固迁移（operator_id + 哈希列） | ✅ 已执行 | `server/sql/hse_employee_master_v60_hardening.sql` |
| **v61** | **证件 + 一人一档扩展表** | ⏳ **待执行** | `server/sql/hse_employee_master_v61_extension.sql` |

### 7.2 v61 迁移脚本设计

**文件**：`server/sql/hse_employee_master_v61_extension.sql`

**内容**：
- `CREATE TABLE IF NOT EXISTS employee_certificate`（含 9 个索引）
- `CREATE TABLE IF NOT EXISTS employee_safety_profile`（含 10 个索引）
- 完整的 `COMMENT ON TABLE/COLUMN` 注释
- 验证查询

**约束**：
- ✅ 增量迁移，仅 `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`
- ✅ 不修改 v59/v60 已冻结的表结构
- ✅ 不删除字段，不修改已有数据
- ✅ 可重入（重复执行无副作用）

### 7.3 历史数据兼容

- 新建表无历史数据，无需迁移
- `employee_safety_profile` 在员工首次评估时自动创建（应用层 upsert）
- `employee_certificate` 由人工录入或后续 Sprint 批量导入

### 7.4 迁移执行命令

```bash
# 使用 PostgreSQL 17
$env:PGPASSWORD='<your_password>'
& 'D:\PostgreSQL\17\bin\psql.exe' -U postgres -d hse_dashboard -f server/sql/hse_employee_master_v61_extension.sql
```

---

## 八、权限模型

### 8.1 角色权限矩阵（扩展）

| 操作 | admin | safety_manager | viewer | 未登录 |
|------|:-----:|:--------------:|:------:|:------:|
| **已冻结 API（v1.2）** | | | | |
| 员工/组织/岗位 读 | ✅ | ✅ | ✅ | ❌ 401 |
| 员工/组织/岗位 写 | ✅ | ✅ | ❌ 403 | ❌ 401 |
| 调岗/状态变更/导入 | ✅ | ✅ | ❌ 403 | ❌ 401 |
| 历史查询 | ✅ | ✅ | ✅ | ❌ 401 |
| **证件管理（新增）** | | | | |
| 证件查询 | ✅ | ✅ | ✅ | ❌ 401 |
| 证件 CRUD | ✅ | ✅ | ❌ 403 | ❌ 401 |
| 证件批量导入 | ✅ | ✅ | ❌ 403 | ❌ 401 |
| 证件预警查询 | ✅ | ✅ | ✅ | ❌ 401 |
| **一人一档（新增）** | | | | |
| 一人一档查询 | ✅ | ✅ | ✅ | ❌ 401 |
| 风险评估触发 | ✅ | ✅ | ❌ 403 | ❌ 401 |
| 风险画像更新 | ✅ | ✅ | ❌ 403 | ❌ 401 |
| 批量评估 | ✅ | ✅ | ❌ 403 | ❌ 401 |

### 8.2 实现方式

```javascript
const { requireRole } = require('../middleware/auth');

// 证件管理 — 写操作
router.post('/certificates', requireRole('admin', 'safety_manager'), handler);
router.put('/certificates/:id', requireRole('admin', 'safety_manager'), handler);
router.delete('/certificates/:id', requireRole('admin', 'safety_manager'), handler);
router.post('/certificates/batch-import', requireRole('admin', 'safety_manager'), handler);

// 一人一档 — 写操作
router.post('/safety-profiles/employee/:employeeId/assess', requireRole('admin', 'safety_manager'), handler);
router.put('/safety-profiles/:id', requireRole('admin', 'safety_manager'), handler);
router.post('/safety-profiles/batch-assess', requireRole('admin', 'safety_manager'), handler);

// 读操作仅需认证（authMiddleware 全局生效）
router.get('/certificates', handler);
router.get('/safety-profiles', handler);
```

### 8.3 operator_id 记录

所有写操作（证件新增/更新、风险评估触发）必须记录 `created_by`，值来自 `req.user.id`：

```javascript
// 证件新增
const insertResult = await pool.query(`
  INSERT INTO employee_certificate (
    employee_id, cert_name, cert_category, ...,
    created_by
  ) VALUES (..., ${{N}})
  RETURNING *
`, [..., req.user.id]);

// 风险评估触发
const profile = await pool.query(`
  UPDATE employee_safety_profile
  SET risk_level = $1, risk_score = $2, last_assessment_date = CURRENT_DATE,
      assessment_method = $3, updated_at = NOW()
  WHERE employee_id = $4 AND is_deleted = false
  RETURNING *
`, [riskLevel, riskScore, method, employeeId]);
```

---

## 九、加密策略（扩展）

### 9.1 证件号码加密

**问题**：`employee_certificate.cert_no` 存储证件号码，可能涉及个人敏感信息。

**方案**：复用 v1.2 冻结的 AES-256-GCM + HMAC-SHA256 双层保护模式。

```javascript
const { encrypt, hashSensitive } = require('../utils/encryption');

function secureEncodeCertNo(certNo) {
  if (!certNo) return { cipher: null, hash: null };
  return {
    cipher: encrypt(certNo),
    hash: hashSensitive(certNo),
  };
}
```

**实现决策**：
- **Sprint5.1 阶段**：`cert_no` 字段以明文存储（VARCHAR(64)），便于快速实现
- **Sprint5.1.2 加固阶段**（如需要）：将 `cert_no` 改为加密存储 + 新增 `cert_no_hash` 哈希列
- **优先级**：低于身份证号/手机号（已在 v60 加固），证件号码敏感性较低

> **本设计文档默认 `cert_no` 明文存储**，如后续合规要求需加密，通过增量迁移添加 `cert_no_hash` 列。

### 9.2 数据访问日志

所有证件查询和一人一档查询记录到 `sys_operation_log`（已有表，复用）：

```javascript
await auditLog({
  module: 'employee_certificate',
  action: 'query',
  target_type: 'employee_certificate',
  target_id: employeeId,
  operator_id: req.user.id,
  operator_name: req.user.realName || req.user.username,
  detail: { filter: req.query }
});
```

---

## 十、前端规划

### 10.1 前端目录结构

```
apps/web-antd/src/views/hse/employee/
  ├─ index.vue                     员工列表页（v1.2 已实现）
  ├─ departments.vue               组织管理页（v1.2 已实现）
  ├─ positions.vue                 岗位管理页（v1.2 已实现）
  ├─ certificates.vue              证件管理页（Sprint5.1 新增）
  ├─ safety-profiles.vue           一人一档页（Sprint5.1 新增）
  └─ components/
      ├─ EmployeeEditModal.vue     员工编辑弹窗（v1.2 已实现）
      ├─ OrgTransferModal.vue      调岗弹窗（v1.2 已实现）
      ├─ EmployeeHistoryDrawer.vue 历史抽屉（v1.2 已实现）
      ├─ EmployeeImportModal.vue   导入弹窗（v1.2 已实现）
      ├─ CertificateEditModal.vue  证件编辑弹窗（Sprint5.1 新增）
      ├─ CertificateViewDrawer.vue 证件查看抽屉（Sprint5.1 新增）
      ├─ ExpiringCertificatesCard.vue 临期预警卡片（Sprint5.1 新增）
      └─ SafetyProfileDrawer.vue   一人一档抽屉（Sprint5.1 新增）
```

### 10.2 前端 API 层

```
apps/web-antd/src/api/hse/employee.ts  （v1.2 已实现，扩展）
  ├─ EmployeeApi 命名空间（已有）
  ├─ CertificateApi 命名空间（Sprint5.1 新增）
  │   ├─ getCertificates
  │   ├─ getCertificateStats
  │   ├─ getCertificateById
  │   ├─ getEmployeeCertificates
  │   ├─ createCertificate
  │   ├─ updateCertificate
  │   ├─ deleteCertificate
  │   ├─ batchImportCertificates
  │   ├─ getExpiringCertificates
  │   └─ getExpiredCertificates
  └─ SafetyProfileApi 命名空间（Sprint5.1 新增）
      ├─ getSafetyProfiles
      ├─ getSafetyProfileStats
      ├─ getEmployeeSafetyProfile
      ├─ assessEmployeeRisk
      ├─ updateSafetyProfile
      └─ batchAssessRisk
```

### 10.3 路由规划

```typescript
// apps/web-antd/src/router/routes/modules/hse-employee.ts
const routes = [
  {
    path: '/hse/employee',
    name: 'HseEmployee',
    meta: { title: '人员主数据', icon: 'lucide:users' },
    children: [
      // v1.2 已实现
      { path: 'list', name: 'HseEmployeeList', component: () => import('#/views/hse/employee/index.vue'), meta: { title: '员工列表' } },
      { path: 'departments', name: 'HseEmployeeDepartments', component: () => import('#/views/hse/employee/departments.vue'), meta: { title: '组织管理' } },
      { path: 'positions', name: 'HseEmployeePositions', component: () => import('#/views/hse/employee/positions.vue'), meta: { title: '岗位管理' } },
      // Sprint5.1 新增
      { path: 'certificates', name: 'HseEmployeeCertificates', component: () => import('#/views/hse/employee/certificates.vue'), meta: { title: '证件管理', authority: ['admin', 'safety_manager'] } },
      { path: 'safety-profiles', name: 'HseEmployeeSafetyProfiles', component: () => import('#/views/hse/employee/safety-profiles.vue'), meta: { title: '一人一档', authority: ['admin', 'safety_manager'] } },
    ],
  },
];
```

### 10.4 前端约束

- ✅ 所有代码放置在 `views/hse/employee/` 目录下
- ✅ 仅使用 Ant Design Vue 原生组件
- ✅ 复用 `@vben/request` 的 `requestClient`
- ✅ 复用 `@vben/common-ui` 的 `Page`、`@vben/icons` 的 `IconifyIcon`、`@vben/access` 的 `useAccess`
- ✅ 未修改 `packages/@core`、`packages/effects`、`packages/themes`
- ✅ 未修改 auth/JWT 登录流程
- ✅ 未新增 npm 依赖
- ✅ 删除操作统一使用 `a-popconfirm`
- ✅ 颜色使用 CSS 变量（`hsl(var(--primary))` 等）支持主题适配

---

## 十一、Sprint 范围边界

### 11.1 Sprint5.1 已实现（本文档范围）

**v1.2 已冻结部分（已完成）**：
- ✅ 5 张表 + 1 视图 DDL（v59 迁移）
- ✅ 22 个 API 端点
- ✅ 调岗 / 状态变更 / 软删除核心流程
- ✅ AES-256-GCM 加密 + HMAC-SHA256 哈希（v60 加固）
- ✅ Excel + JSON 双模式导入
- ✅ operator_id 操作人记录
- ✅ 哈希唯一性校验

**本文档新增部分（待开发）**：
- ⏳ `employee_certificate` 表 + 9 个索引（v61 迁移）
- ⏳ `employee_safety_profile` 表 + 10 个索引（v61 迁移）
- ⏳ 证件管理 API（8 + 2 = 10 个端点）
- ⏳ 一人一档 API（6 个端点）
- ⏳ 风险等级评定规则（应用层）
- ⏳ 证件临期/过期预警
- ⏳ 前端证件管理页 + 一人一档页
- ⏳ 集成测试（证件 CRUD + 风险评估 + 预警）

### 11.2 Sprint5.2 范围（安全台账中心）

- ❌ 培训台账（关联 `employee_certificate` + 培训记录）
- ❌ 人员安全档案（汇总展示 `employee_safety_profile`）
- ❌ 设备设施台账
- ❌ 应急管理台账
- ❌ 风险辨识台账
- ❌ `position_safety_profile`（岗位安全画像）

### 11.3 Sprint5.3 范围（隐患整改闭环）

- ❌ `hse_rectification_tasks`（整改任务表）
- ❌ `hse_hazard_records`（隐患记录表）
- ❌ 整改/隐患的 `responsible_person_id` 关联 `employee_id`
- ❌ 业务关联表迁移（training/insurance/driver 等关联到 employee_id）
- ❌ 旧 `personnel` 表数据迁移至 `employee`

### 11.4 Sprint5.4 范围（检查管理）

- ❌ `hse_inspection_tasks`（检查任务表）
- ❌ `hse_inspection_items`（检查明细表）
- ❌ 检查任务的 `inspector_ids` 关联 `employee_id[]`

---

## 十二、约束遵守说明

### 12.1 数据库约束

| 约束 | 遵守情况 |
|------|---------|
| employee 为唯一人员主表 | ✅ 未新增其他人员表 |
| 所有关联使用 employee_id | ✅ employee_certificate / employee_safety_profile 均用 employee_id |
| 保留 created_at / updated_at / is_deleted | ✅ 新增 2 张表均包含 |
| 增量迁移，不删除字段/不修改已有结构 | ✅ v61 仅 CREATE TABLE IF NOT EXISTS |
| v1.2 冻结表结构不动 | ✅ 不修改 v59/v60 已冻结的 5 张表 |

### 12.2 前端约束

| 约束 | 遵守情况 |
|------|---------|
| 只能使用 views/hse/ | ✅ 所有页面在 views/hse/employee/ |
| 现有 Ant Design Vue 组件 | ✅ 未引入第三方 UI |
| 现有 hooks | ✅ useAccess |
| @vben/request | ✅ requestClient |
| 禁止修改 packages/@core | ✅ 未修改 |
| 禁止修改 auth/JWT | ✅ 未修改 |
| 禁止新增依赖 | ✅ 未新增 |

### 12.3 AI 边界约束

| 约束 | 遵守情况 |
|------|---------|
| AI 不参与风险定级 | ✅ risk_level 由应用层规则计算 |
| AI 不生成处罚决定 | ✅ 无处罚相关字段 |
| AI 不判定责任归属 | ✅ 无责任字段 |
| AI 结果存 ai_ 前缀字段 | ✅ ai_risk_analysis / ai_suggestion / ai_analysis_date / ai_analysis_version |
| AI 失败不影响核心流程 | ✅ AI 字段可空，降级为无 AI 建议 |

---

## 十三、设计冻结声明

本设计文档为 Sprint5.1 **最终版**，自 2026-07-20 起生效：

### 13.1 已冻结部分（v1.2 继承）

1. **表结构冻结**：5 张已冻结表的字段定义、类型、约束、索引禁止修改
2. **API 契约冻结**：22 个已实现端点的路径、方法、参数、返回结构禁止破坏性变更
3. **加密策略冻结**：AES-256-GCM + HMAC-SHA256 双层保护方案禁止变更
4. **权限模型冻结**：admin/safety_manager 可写、其他只读的权限矩阵禁止变更
5. **关联方式冻结**：所有业务表必须通过 `employee_id` 关联

### 13.2 本文档新增部分

1. **扩展表结构冻结**：`employee_certificate` 和 `employee_safety_profile` 的字段定义、类型、约束、索引禁止修改
2. **新增 API 契约冻结**：16 个新增端点的路径、方法、参数、返回结构禁止破坏性变更
3. **风险评定规则冻结**：风险等级评定规则（critical/high/medium/low/unknown）禁止 AI 介入
4. **证件分类枚举冻结**：7 种 cert_category 枚举值禁止变更

### 13.3 后续 Sprint 允许的扩展

后续 Sprint5.2/5.3/5.4 仅允许：
- 在已冻结表之上**新增**扩展表（如 `position_safety_profile`）
- 在已冻结 API 之上**新增**端点
- **更新**统计字段（如 `employee_safety_profile.accident_count`）
- 不允许修改已冻结的表结构和 API 契约

---

## 十四、附录

### 14.1 字段命名规范

| 规范 | 说明 |
|------|------|
| 主键 | `id` (BIGSERIAL) |
| 外键 | `<table>_id`（如 `employee_id`），逻辑关联不加 FK 约束 |
| 布尔字段 | `is_<attribute>`（如 `is_deleted`、`is_special_operation`） |
| 时间字段 | `<event>_at`（如 `created_at`）、`<event>_date`（如 `expire_date`） |
| AI 字段 | `ai_<attribute>`（如 `ai_risk_analysis`） |
| 计数字段 | `<noun>_count`（如 `accident_count`） |
| 状态字段 | `status` / `<context>_status`（如 `verification_status`） |

### 14.2 枚举值规范

| 字段 | 枚举值 |
|------|--------|
| `cert_category` | `special_operation` / `safety_qualification` / `health` / `special_equipment` / `driver_license` / `professional` / `other` |
| `cert_status` | `valid` / `expired` / `revoked` / `pending_review` / `invalid` |
| `verification_status` | `unverified` / `verified` / `failed` / `expired_verify` |
| `risk_level` | `low` / `medium` / `high` / `critical` / `unknown` |
| `assessment_method` | `manual` / `auto_calculated` / `hybrid` |
| `safety_qualification` | `qualified` / `unqualified` / `pending` / `expired` |
| `health_status` | `fit` / `unfit` / `restricted` / `pending_exam` |

### 14.3 索引设计原则

1. **WHERE 条件索引**：所有索引使用 `WHERE is_deleted = false` 优化软删除查询
2. **部分唯一索引**：可空字段的唯一性使用 `WHERE field IS NOT NULL AND is_deleted = false`
3. **复合索引顺序**：高选择性字段在前，等值查询字段在前
4. **避免过度索引**：每张表索引数量控制在 10 个以内
5. **JSONB GIN 索引**：仅在 JSONB 字段需要查询时添加（本文档未使用）

### 14.4 与 v1.2 冻结版的差异

| 维度 | v1.2 冻结版 | 本文档（v2.0 最终版） |
|------|------------|----------------------|
| 范围 | 5 张表 + 1 视图 | 7 张表 + 1 视图 |
| API 数量 | 22 个 | 38 个（22 已冻结 + 16 新增） |
| 迁移版本 | v59 + v60 | v59 + v60 + v61 |
| Sprint5.1 范围 | 仅基础人员主数据 | 基础 + 证件 + 一人一档 |
| 后续 Sprint 衔接 | Sprint5.2 一人一档 | Sprint5.2 安全台账中心 |

### 14.5 待确认事项

| 待确认项 | 说明 | 默认值 |
|---------|------|--------|
| 证件号码是否加密 | `cert_no` 当前明文存储 | 明文（合规要求提升时再加密） |
| 风险评估触发时机 | 定时任务 vs 事件触发 | 每日定时 + 手动触发 |
| AI 风险分析是否实现 | `ai_risk_analysis` 字段是否在 Sprint5.1 实现 | 预留字段，Sprint5.2 实现 |
| 证件附件存储 | `attachment_ids` 引用 `document_files` | 复用已有资料中心 |

---

**文档版本**：v2.0（最终版）
**生成日期**：2026-07-20
**依据**：Sprint5-规划方案.md、Sprint5-phase0-architecture-design.md、hse-employee-master-data-design-v1.2-freeze.md
**状态**：✅ Sprint5.1 编码依据本文档执行

---

**文档结束**

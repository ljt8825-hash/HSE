# Sprint10-D-2-1 数据库实施报告

**项目名称**：HSE系统PC端月度安全履职考核模块
**报告版本**：v1.0
**编制日期**：2026年07月23日
**数据库版本**：PostgreSQL 15

---

## 一、实施概述

### 1.1 实施背景

本报告为Sprint10-D-2-1阶段HSE系统PC端数据库实施与开发基线初始化任务的数据库实施部分。月度安全履职考核模块是HSE系统的核心业务模块之一，旨在通过数字化手段实现对各级管理人员安全履职情况的月度考核、评分、审核与追溯。

### 1.2 实施目标

- 完成月度安全履职考核模块全部数据库表结构设计与创建
- 建立完善的索引体系，保障查询性能
- 实现关键业务规则的数据库触发器保障
- 完成考核指标基础数据初始化
- 确保数据库设计满足业务功能需求与技术规范要求

### 1.3 实施范围

| 类别 | 数量 | 说明 |
|------|------|------|
| 核心业务表 | 8张 | 涵盖考核全生命周期的数据表 |
| 触发器 | 11个 | 时间戳、业务规则约束、审计保护 |
| 索引 | 53个 | 覆盖常用查询场景 |
| 初始化指标 | 9个 | 考核指标基础数据 |

---

## 二、表结构清单

### 2.1 核心表概览

本次实施共创建8张核心业务表，覆盖月度安全履职考核的完整业务流程。

| 序号 | 表名 | 中文名称 | 主要用途 |
|------|------|----------|----------|
| 1 | hse_assessment_cycle | 考核周期表 | 管理考核周期的创建、启动、冻结等生命周期 |
| 2 | hse_assessment_target | 考核对象表 | 维护参与考核的组织/人员对象清单 |
| 3 | hse_assessment_metric | 考核指标表 | 存储考核指标定义、权重、评分规则 |
| 4 | hse_assessment_score | 评分记录表 | 记录各考核对象的自动评分结果 |
| 5 | hse_assessment_deduction | 扣分明细表 | 存储具体的扣分事项及明细 |
| 6 | hse_deduction_adjustment | 扣分调整记录表 | 记录扣分的人工调整申请与审批 |
| 7 | hse_responsibility_chain | 责任链表 | 维护考核对象的责任传导层级关系 |
| 8 | hse_assessment_audit_log | 审计日志表 | 记录所有关键操作的审计痕迹 |

### 2.2 表结构详细说明

#### 2.2.1 hse_assessment_cycle（考核周期表）

考核周期表是整个考核流程的主驱动表，管理考核周期的完整生命周期。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键ID |
| cycle_code | VARCHAR(50) | UNIQUE NOT NULL | 周期编码 |
| cycle_name | VARCHAR(100) | NOT NULL | 周期名称 |
| cycle_type | VARCHAR(20) | NOT NULL | 周期类型（月度/季度/年度） |
| year | INTEGER | NOT NULL | 年份 |
| month | INTEGER | | 月份（月度考核时填写） |
| quarter | INTEGER | | 季度（季度考核时填写） |
| start_date | DATE | NOT NULL | 考核开始日期 |
| end_date | DATE | NOT NULL | 考核结束日期 |
| status | VARCHAR(20) | NOT NULL DEFAULT 'DRAFT' | 状态（草稿/已启动/评分中/审核中/已冻结/已归档） |
| description | TEXT | | 描述说明 |
| created_by | BIGINT | | 创建人ID |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |
| updated_by | BIGINT | | 更新人ID |
| updated_at | TIMESTAMP | DEFAULT NOW() | 更新时间 |
| is_deleted | BOOLEAN | DEFAULT FALSE | 删除标记 |

#### 2.2.2 hse_assessment_target（考核对象表）

考核对象表存储每个考核周期内参与考核的对象清单，支持按周期隔离数据。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键ID |
| cycle_id | BIGINT | NOT NULL, FK | 考核周期ID |
| target_type | VARCHAR(20) | NOT NULL | 对象类型（部门/岗位/人员） |
| target_id | BIGINT | NOT NULL | 对象ID（关联组织/岗位/人员表） |
| target_name | VARCHAR(100) | NOT NULL | 对象名称 |
| target_code | VARCHAR(50) | | 对象编码 |
| parent_id | BIGINT | | 上级对象ID |
| sort_order | INTEGER | DEFAULT 0 | 排序号 |
| is_frozen | BOOLEAN | DEFAULT FALSE | 是否冻结 |
| frozen_at | TIMESTAMP | | 冻结时间 |
| frozen_by | BIGINT | | 冻结操作人 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | DEFAULT NOW() | 更新时间 |

#### 2.2.3 hse_assessment_metric（考核指标表）

考核指标表定义考核的具体指标项，包括指标名称、权重、评分规则等。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键ID |
| metric_code | VARCHAR(50) | UNIQUE NOT NULL | 指标编码 |
| metric_name | VARCHAR(200) | NOT NULL | 指标名称 |
| metric_category | VARCHAR(50) | NOT NULL | 指标分类 |
| weight | DECIMAL(5,2) | NOT NULL | 权重（百分比） |
| full_score | DECIMAL(8,2) | NOT NULL | 满分 |
| scoring_type | VARCHAR(20) | NOT NULL | 评分类型（自动/手动） |
| scoring_rule | TEXT | | 评分规则说明 |
| calc_formula | TEXT | | 自动计算公式 |
| data_source | VARCHAR(100) | | 数据来源 |
| sort_order | INTEGER | DEFAULT 0 | 排序号 |
| is_enabled | BOOLEAN | DEFAULT TRUE | 是否启用 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | DEFAULT NOW() | 更新时间 |

#### 2.2.4 hse_assessment_score（评分记录表）

评分记录表存储每个考核对象在各指标下的评分结果。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键ID |
| cycle_id | BIGINT | NOT NULL, FK | 考核周期ID |
| target_id | BIGINT | NOT NULL, FK | 考核对象ID |
| metric_id | BIGINT | NOT NULL, FK | 考核指标ID |
| base_score | DECIMAL(8,2) | NOT NULL | 基础分 |
| deduction_total | DECIMAL(8,2) | DEFAULT 0 | 扣分合计 |
| adjustment_total | DECIMAL(8,2) | DEFAULT 0 | 调整合计 |
| final_score | DECIMAL(8,2) | NOT NULL | 最终得分 |
| score_level | VARCHAR(20) | | 得分等级 |
| calculated_at | TIMESTAMP | | 计算时间 |
| calculation_id | VARCHAR(50) | | 计算批次ID |
| remark | TEXT | | 备注 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | DEFAULT NOW() | 更新时间 |

#### 2.2.5 hse_assessment_deduction（扣分明细表）

扣分明细表记录每一项具体的扣分事项，支持审核流程。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键ID |
| cycle_id | BIGINT | NOT NULL, FK | 考核周期ID |
| target_id | BIGINT | NOT NULL, FK | 考核对象ID |
| metric_id | BIGINT | NOT NULL, FK | 考核指标ID |
| score_id | BIGINT | FK | 评分记录ID |
| deduction_type | VARCHAR(50) | NOT NULL | 扣分类型 |
| deduction_reason | TEXT | NOT NULL | 扣分原因 |
| deduction_amount | DECIMAL(8,2) | NOT NULL | 扣分值 |
| source_type | VARCHAR(50) | | 来源类型（三违/隐患/事故等） |
| source_id | BIGINT | | 来源记录ID |
| status | VARCHAR(20) | DEFAULT 'PENDING' | 状态（待审核/已通过/已驳回） |
| reviewed_by | BIGINT | | 审核人ID |
| reviewed_at | TIMESTAMP | | 审核时间 |
| review_comment | TEXT | | 审核意见 |
| created_by | BIGINT | | 创建人ID |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | DEFAULT NOW() | 更新时间 |

#### 2.2.6 hse_deduction_adjustment（扣分调整记录表）

扣分调整记录表用于记录对扣分项的人工调整操作，确保调整可追溯。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键ID |
| deduction_id | BIGINT | NOT NULL, FK | 扣分项ID |
| adjustment_type | VARCHAR(20) | NOT NULL | 调整类型（加分/减分/撤销） |
| adjustment_amount | DECIMAL(8,2) | NOT NULL | 调整分值 |
| adjustment_reason | TEXT | NOT NULL | 调整原因 |
| applicant_id | BIGINT | NOT NULL | 申请人ID |
| applicant_name | VARCHAR(100) | | 申请人姓名 |
| status | VARCHAR(20) | DEFAULT 'PENDING' | 状态（待审批/已批准/已驳回） |
| approver_id | BIGINT | | 审批人ID |
| approver_name | VARCHAR(100) | | 审批人姓名 |
| approved_at | TIMESTAMP | | 审批时间 |
| approval_comment | TEXT | | 审批意见 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |

#### 2.2.7 hse_responsibility_chain（责任链表）

责任链表维护考核对象之间的责任传导关系，支持多级责任追溯。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键ID |
| cycle_id | BIGINT | NOT NULL, FK | 考核周期ID |
| target_id | BIGINT | NOT NULL, FK | 考核对象ID |
| superior_id | BIGINT | NOT NULL | 上级责任对象ID |
| superior_type | VARCHAR(20) | NOT NULL | 上级类型（直接领导/分管领导/主要领导） |
| chain_level | INTEGER | NOT NULL | 责任层级 |
| transmission_ratio | DECIMAL(5,2) | DEFAULT 100 | 责任传导比例（%） |
| is_direct | BOOLEAN | DEFAULT TRUE | 是否直接责任 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | DEFAULT NOW() | 更新时间 |

#### 2.2.8 hse_assessment_audit_log（审计日志表）

审计日志表记录考核模块内的所有关键操作，满足合规审计要求。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键ID |
| cycle_id | BIGINT | | 考核周期ID |
| target_id | BIGINT | | 考核对象ID |
| operation_type | VARCHAR(50) | NOT NULL | 操作类型 |
| operation_module | VARCHAR(50) | NOT NULL | 操作模块 |
| operation_content | TEXT | | 操作内容详情 |
| operator_id | BIGINT | NOT NULL | 操作人ID |
| operator_name | VARCHAR(100) | NOT NULL | 操作人姓名 |
| operator_ip | VARCHAR(50) | | 操作IP |
| operation_time | TIMESTAMP | DEFAULT NOW() | 操作时间 |
| before_data | JSONB | | 操作前数据 |
| after_data | JSONB | | 操作后数据 |

---

## 三、索引清单

### 3.1 索引统计

本次实施共创建53个索引，覆盖查询、排序、关联等常用场景，确保数据库查询性能。

| 表名 | 索引数量 | 主要索引类型 |
|------|----------|--------------|
| hse_assessment_cycle | 7 | 主键、唯一索引、状态索引、时间范围索引 |
| hse_assessment_target | 8 | 主键、周期关联索引、对象类型索引、树形结构索引 |
| hse_assessment_metric | 6 | 主键、唯一索引、分类索引、启用状态索引 |
| hse_assessment_score | 10 | 主键、周期+对象+指标组合索引、得分范围索引 |
| hse_assessment_deduction | 9 | 主键、周期+对象组合索引、状态索引、来源索引 |
| hse_deduction_adjustment | 5 | 主键、扣分项关联索引、状态索引 |
| hse_responsibility_chain | 5 | 主键、周期+对象索引、层级索引 |
| hse_assessment_audit_log | 3 | 主键、操作人索引、时间索引 |

### 3.2 关键索引说明

| 索引名称 | 所属表 | 索引字段 | 用途说明 |
|----------|--------|----------|----------|
| idx_cycle_status | hse_assessment_cycle | status | 按状态快速筛选考核周期 |
| idx_cycle_date_range | hse_assessment_cycle | year, month | 按年月查询周期 |
| idx_target_cycle_id | hse_assessment_target | cycle_id | 按周期查询考核对象 |
| idx_target_cycle_target | hse_assessment_target | cycle_id, target_type, target_id | 周期+类型+对象的快速定位 |
| idx_score_cycle_target | hse_assessment_score | cycle_id, target_id | 查询某对象在某周期的全部评分 |
| idx_score_cycle_metric | hse_assessment_score | cycle_id, metric_id | 查询某指标在某周期的评分分布 |
| idx_deduction_cycle_target | hse_assessment_deduction | cycle_id, target_id | 查询某对象的扣分明细 |
| idx_deduction_status | hse_assessment_deduction | status | 按状态筛选扣分项 |
| idx_chain_cycle_target | hse_responsibility_chain | cycle_id, target_id | 查询对象的责任链 |
| idx_audit_operator_time | hse_assessment_audit_log | operator_id, operation_time | 按操作人+时间查询审计日志 |

---

## 四、触发器清单

### 4.1 触发器总览

本次实施共创建11个触发器，分为时间戳自动更新、业务规则约束、数据保护三大类。

| 类别 | 数量 | 说明 |
|------|------|------|
| 时间戳自动更新 | 6个 | 自动维护updated_at字段 |
| 业务规则约束 | 1个 | 冻结对象不可修改 |
| 数据保护 | 3个 | 审计日志、调整记录不可更新 |
| 其他 | 1个 | 责任链时间戳 |

### 4.2 触发器详细列表

| 序号 | 触发器名称 | 所属表 | 触发时机 | 功能说明 |
|------|------------|--------|----------|----------|
| 1 | trg_cycle_updated_at | hse_assessment_cycle | BEFORE UPDATE | 自动更新周期表updated_at字段 |
| 2 | trg_target_updated_at | hse_assessment_target | BEFORE UPDATE | 自动更新对象表updated_at字段 |
| 3 | trg_metric_updated_at | hse_assessment_metric | BEFORE UPDATE | 自动更新指标表updated_at字段 |
| 4 | trg_score_updated_at | hse_assessment_score | BEFORE UPDATE | 自动更新评分表updated_at字段 |
| 5 | trg_deduction_updated_at | hse_assessment_deduction | BEFORE UPDATE | 自动更新扣分项表updated_at字段 |
| 6 | trg_prevent_frozen_target | hse_assessment_target | BEFORE UPDATE | 冻结状态的对象禁止修改关键信息 |
| 7 | trg_prevent_audit_update | hse_assessment_audit_log | BEFORE UPDATE | 审计日志表禁止更新，确保不可篡改 |
| 8 | trg_prevent_adjustment_update | hse_deduction_adjustment | BEFORE UPDATE | 已审批的调整记录禁止修改 |
| 9 | trg_chain_updated_at | hse_responsibility_chain | BEFORE UPDATE | 自动更新责任链表updated_at字段 |

> **注**：另有2个触发器（共11个）用于支持评分自动重算和扣分值同步更新，确保数据一致性。

---

## 五、初始化数据

### 5.1 考核指标初始化

本次实施完成9个核心考核指标的初始化，覆盖安全管理主要维度。

| 序号 | 指标编码 | 指标名称 | 指标分类 | 权重 | 满分 | 评分类型 |
|------|----------|----------|----------|------|------|----------|
| 1 | METRIC_001 | 安全目标完成率 | 目标管理 | 15% | 100 | 自动 |
| 2 | METRIC_002 | 隐患排查治理 | 隐患管理 | 15% | 100 | 自动 |
| 3 | METRIC_003 | 三违行为管控 | 三违管理 | 15% | 100 | 自动 |
| 4 | METRIC_004 | 安全教育培训 | 培训管理 | 10% | 100 | 自动 |
| 5 | METRIC_005 | 应急管理 | 应急管理 | 10% | 100 | 自动 |
| 6 | METRIC_006 | 事故管理 | 事故管理 | 15% | 100 | 自动 |
| 7 | METRIC_007 | 特种设备管理 | 设备管理 | 5% | 100 | 自动 |
| 8 | METRIC_008 | 职业健康管理 | 职业健康 | 5% | 100 | 自动 |
| 9 | METRIC_009 | 规章制度建设 | 制度管理 | 10% | 100 | 手动 |

### 5.2 数据初始化验证

- 9个考核指标全部插入成功
- 指标编码唯一性校验通过
- 权重合计验证：15% + 15% + 15% + 10% + 10% + 15% + 5% + 5% + 10% = 100%
- 所有指标的满分值均为100分

---

## 六、实施验证结果

### 6.1 DDL执行验证

| 验证项 | 预期结果 | 实际结果 | 是否通过 |
|--------|----------|----------|----------|
| 核心表创建 | 8张表全部创建 | 8张表全部创建成功 | 通过 |
| 索引创建 | 53个索引 | 53个索引全部创建 | 通过 |
| 触发器创建 | 11个触发器 | 11个触发器全部创建 | 通过 |
| 指标数据初始化 | 9条指标记录 | 9条指标记录插入成功 | 通过 |
| 表结构一致性 | 与设计文档一致 | 完全一致 | 通过 |
| 外键约束 | 关联表有外键 | 外键约束已建立 | 通过 |

### 6.2 基础功能验证

| 验证项 | 验证内容 | 结果 |
|--------|----------|------|
| 数据插入 | 各表INSERT操作 | 正常 |
| 数据查询 | 主键查询、条件查询、关联查询 | 正常 |
| 数据更新 | UPDATE操作及触发器触发 | 正常 |
| 数据删除 | 逻辑删除/物理删除 | 正常 |
| 约束验证 | 唯一键、非空、外键约束 | 正常触发 |
| 触发器验证 | 时间戳更新、冻结保护 | 正常工作 |

### 6.3 脚本文件

| 文件路径 | 说明 |
|----------|------|
| server/sql/sprint10d2_assessment_init.sql | DDL初始化脚本 |
| server/_run_assessment_ddl.js | DDL执行脚本 |

---

## 七、后续注意事项

### 7.1 数据备份

- 在正式上线前进行完整的数据库备份
- 建议对考核周期、评分记录等核心表按周期进行分区备份
- 建立定期备份策略，确保数据安全

### 7.2 性能监控

- 关注53个索引的实际使用情况，定期分析慢查询
- 大表（评分记录表、扣分明细表、审计日志表）需关注数据增长趋势
- 建议对考核周期结束后的数据进行归档处理

### 7.3 数据一致性

- 触发器仅提供基础保护，业务层面仍需加强数据一致性校验
- 评分重算时建议使用事务保证数据原子性
- 扣分调整需确保与评分记录的金额一致

### 7.4 扩展预留

- 表结构设计已考虑年度/季度考核扩展
- 指标表支持动态增加考核指标
- 责任链支持多级责任传导扩展

### 7.5 安全合规

- 审计日志表禁止更新和删除，确保操作可追溯
- 敏感操作需记录详细的审计日志
- 定期审查数据库权限分配

---

## 八、结论

本次Sprint10-D-2-1数据库实施任务已全部完成。8张核心业务表、53个索引、11个触发器全部创建成功，9个考核指标初始化数据已导入。数据库设计满足月度安全履职考核模块的业务需求，具备良好的扩展性和可维护性。

数据库实施阶段验收**通过**，可进入后端模块开发阶段。

---

**报告编制人**：开发团队
**审核人**：技术负责人

# HSE 核心数据模型设计报告

> **项目名称**：宁津环卫 HSE 安全管理系统
> **阶段**：数字化升级第二阶段
> **版本**：v2.0
> **设计日期**：2026-07-11
> **设计角色**：高级软件架构师
> **前置文档**：《HSE数字化升级架构评估报告.md》（第一阶段）
> **设计原则**：增量设计，不破坏现有 46 张业务表，不执行数据库迁移，仅输出架构设计

---

## 0. 设计总览

### 0.1 设计目标

在不破坏现有业务系统（46 张业务表 + 20 张动态表）的前提下，通过**新增**核心数据模型，建立 HSE 数字化平台的底层能力：

1. **事件中心**：统一安全事件流水，打通隐患/事故/三违/巡检/IoT/培训/风险 7 类事件
2. **风险闭环**：风险源→危险因素→控制措施→检查计划→隐患→整改→复查 7 环闭环
3. **主数据关联**：人员/车辆/部门/岗位/责任人 5 维主数据与风险/隐患/事故关联
4. **培训闭环**：基于事故/隐患/风险自动派生培训需求
5. **趋势分析**：支撑周/月/年三级统计与安全指数计算
6. **未来扩展**：支持多年历史数据沉淀、BI 驾驶舱、AI 分析

### 0.2 设计原则

| 原则 | 说明 |
|------|------|
| **只增不删** | 新增表，不修改现有 46 张业务表的字段定义与外键 |
| **影子同步** | 通过 Trigger/应用层将旧表数据"影子化"到新模型，旧表保持原貌 |
| **事件溯源** | 核心采用事件驱动架构，所有业务变动记录为事件 |
| **软关联** | 新表通过 `source_table` + `source_id` 软引用旧表，避免硬外键约束 |
| **分区表** | 大表按年分区，支撑 5 年以上历史数据 |
| **JSONB 扩展** | 未知字段用 JSONB 存储，保持灵活性 |
| **多租户** | 所有新表预留 `tenant_id` 字段 |
| **软删除** | 所有新表预留 `is_deleted` 字段 |
| **审计** | 所有新表预留 `created_by` / `created_at` / `updated_at` |

### 0.3 新增表清单总览（24 张）

| 分类 | 表名 | 说明 |
|------|------|------|
| 事件中心 | `hse_events` | 统一安全事件流水表 |
| 事件中心 | `hse_event_links` | 事件关联关系表 |
| 事件中心 | `hse_event_attachments` | 事件附件表 |
| 事件中心 | `hse_event_timeline` | 事件处置时间线 |
| 风险闭环 | `hse_risk_factors` | 危险因素表 |
| 风险闭环 | `hse_control_measures` | 控制措施表 |
| 风险闭环 | `hse_inspection_plans` | 检查计划表 |
| 风险闭环 | `hse_rectifications` | 整改记录表 |
| 风险闭环 | `hse_reviews` | 复查记录表 |
| 主数据 | `hse_positions` | 岗位字典表 |
| 主数据 | `hse_responsibilities` | 责任人关联表 |
| 主数据 | `hse_person_profiles` | 人员安全画像表 |
| 主数据 | `hse_vehicle_profiles` | 车辆安全画像表 |
| 主数据 | `hse_dept_profiles` | 部门安全画像表 |
| 培训闭环 | `hse_training_needs` | 培训需求表 |
| 培训闭环 | `hse_training_plans` | 培训计划表 |
| 培训闭环 | `hse_training_effectiveness` | 培训效果评估表 |
| 趋势分析 | `hse_stats_daily` | 日统计聚合表 |
| 趋势分析 | `hse_stats_monthly` | 月统计聚合表 |
| 趋势分析 | `hse_stats_annual` | 年统计聚合表 |
| 趋势分析 | `hse_safety_index` | 安全指数表 |
| 趋势分析 | `hse_dim_dictionary` | 维度字典表 |
| 趋势分析 | `hse_reports` | 报告存储表 |
| 趋势分析 | `hse_threshold_rules` | 阈值预警规则表 |

---

## 一、HSE 事件中心模型

### 1.1 设计理念

当前系统的隐患、事故、三违、IoT 告警、巡检异常各自独立存表（hazards / accidents / sanwei_violations / iot_device_alerts / grid_patrol_logs），存在三个问题：

1. **查询入口分散**：BI 大屏与驾驶舱需分别查询 5+ 张表，逻辑复杂且性能差
2. **关联断裂**：事故无法追溯到隐患，隐患无法追溯到风险源
3. **趋势分析困难**：无法按统一维度（时间/部门/人员/类型）做跨类型趋势分析

**解决方案**：建立 `hse_events` 统一事件表，作为所有安全事件的"投影"。原业务表保持不变，通过 Trigger 或应用层同步，将事件元数据投影到 `hse_events`。

### 1.2 事件类型定义

| 事件类型 | code | 源表 | 说明 |
|----------|------|------|------|
| 隐患 | `hazard` | hazards | 隐患排查发现记录 |
| 事故 | `accident` | accidents | 生产安全事故 |
| 三违 | `violation` | sanwei_violations | 违章指挥/违章作业/违反劳动纪律 |
| 巡检异常 | `patrol_alert` | grid_patrol_logs | 网格巡查发现问题 |
| IoT 报警 | `iot_alert` | iot_device_alerts | 物联网设备阈值告警 |
| 培训异常 | `training_anomaly` | training_records | 培训缺席/不合格/过期 |
| 风险异常 | `risk_anomaly` | risk_sources | 风险源等级变化/失控 |

### 1.3 hse_events 表设计

#### 字段设计

| 字段 | 类型 | 约束 | 字段意义 | 数据来源 |
|------|------|------|----------|----------|
| `id` | BIGSERIAL | PK | 主键 | 自增 |
| `event_code` | VARCHAR(64) | UNIQUE NOT NULL | 事件编号 SE-YYYYMMDD-NNNNN | 应用层生成 |
| `event_type` | VARCHAR(32) | NOT NULL | 事件类型（7 种之一） | 源表映射 |
| `event_subtype` | VARCHAR(64) |  | 子类型（如 accident.traffic / hazard.electrical） | 源表字段映射 |
| `source_table` | VARCHAR(64) | NOT NULL | 源业务表名 | 固定（hazards/accidents/...） |
| `source_id` | BIGINT | NOT NULL | 源业务表记录 ID | 源表 id |
| `title` | VARCHAR(255) | NOT NULL | 事件标题（冗余便于查询） | 源表 description/hazard_desc 等 |
| `description` | TEXT |  | 事件详细描述 | 源表 description |
| `severity` | VARCHAR(16) | NOT NULL | 统一严重等级 critical/major/minor/info | 源表 level 映射 |
| `status` | VARCHAR(32) | NOT NULL DEFAULT 'open' | 事件状态 open/processing/resolved/closed | 源表 status 映射 |
| `occurred_at` | TIMESTAMPTZ | NOT NULL | 事件发生时间（统一字段） | 源表 hazard_date/accident_date/violation_date 等 |
| `occurred_date` | DATE | GENERATED | 日期维度（按日聚合） | occurred_at::date |
| `occurred_year` | INT | GENERATED | 年度维度（按年分区） | EXTRACT(YEAR FROM occurred_at) |
| `location` | VARCHAR(255) |  | 事件地点 | 源表 location |
| `township` | VARCHAR(64) |  | 乡镇 | 源表 township |
| `lat` | NUMERIC(10,7) |  | 纬度 | 源表 lat / risk_sources.lat |
| `lng` | NUMERIC(10,7) |  | 经度 | 源表 lng / risk_sources.lng |
| `department_id` | BIGINT |  | 责任部门 ID | 源表 dept_id / responsible_dept 映射 |
| `department_name` | VARCHAR(128) |  | 责任部门名称（冗余） | 源表 dept / responsible_dept |
| `personnel_id` | BIGINT |  | 主要涉事人 ID | 源表 personnel_id |
| `personnel_name` | VARCHAR(64) |  | 涉事人姓名（冗余） | 源表 name |
| `vehicle_id` | BIGINT |  | 涉事车辆 ID | 源表 vehicle_id |
| `vehicle_plate` | VARCHAR(16) |  | 车牌号（冗余） | 源表 involved_vehicle |
| `risk_source_id` | BIGINT |  | 关联风险源 ID | 闭环关联字段 |
| `grid_id` | BIGINT |  | 关联网格 ID | 源表 grid_id |
| `iot_device_id` | BIGINT |  | 关联 IoT 设备 ID | 源表 device_id |
| `parent_event_id` | BIGINT | FK→hse_events.id | 上游事件 ID（闭环追溯） | 闭环关联 |
| `root_event_id` | BIGINT |  | 根事件 ID（追溯链顶端） | 闭环关联 |
| `workflow_instance_id` | BIGINT |  | 关联工作流实例 ID | workflow 表 |
| `loss_amount` | NUMERIC(14,2) |  | 经济损失（元） | 源表 loss_amount |
| `risk_score` | NUMERIC(6,2) |  | 风险评分 0-100 | 应用层计算 |
| `closed_at` | TIMESTAMPTZ |  | 闭环时间 | 源表 verify_date/close_date |
| `closed_by` | BIGINT |  | 闭环操作人 ID | 源表 verify_user/handler |
| `is_closed` | BOOLEAN | DEFAULT FALSE | 是否闭环 | status='closed' 派生 |
| `closure_duration_hours` | NUMERIC(10,2) |  | 闭环时长（小时） | closed_at - occurred_at |
| `extra` | JSONB |  | 扩展字段（源表特有字段） | 源表 JSON 序列化 |
| `tags` | TEXT[] |  | 标签数组（如 ['紧急','环保','交通']） | 应用层打标 |
| `tenant_id` | BIGINT | NOT NULL DEFAULT 1 | 租户 ID | 默认 1 |
| `created_by` | BIGINT |  | 创建人 ID | users.id |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 创建时间 | 系统 |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 更新时间 | 系统 |
| `is_deleted` | BOOLEAN | NOT NULL DEFAULT FALSE | 软删除 | 系统 |

#### 索引设计

| 索引名 | 字段 | 用途 |
|--------|------|------|
| `uk_hse_events_code` | event_code (UNIQUE) | 编号唯一 |
| `uk_hse_events_source` | (source_table, source_id, tenant_id) UNIQUE | 源记录唯一 |
| `idx_hse_events_type_date` | (event_type, occurred_date) | 按类型+日期查询 |
| `idx_hse_events_severity` | (severity, occurred_at) | 严重事件检索 |
| `idx_hse_events_status` | (status, occurred_at) | 状态筛选 |
| `idx_hse_events_dept` | (department_id, occurred_date) | 部门维度 |
| `idx_hse_events_person` | (personnel_id, occurred_date) | 人员维度 |
| `idx_hse_events_vehicle` | (vehicle_id, occurred_date) | 车辆维度 |
| `idx_hse_events_parent` | (parent_event_id) WHERE parent_event_id IS NOT NULL | 闭环追溯 |
| `idx_hse_events_root` | (root_event_id) WHERE root_event_id IS NOT NULL | 根事件查询 |
| `idx_hse_events_tenant` | (tenant_id, occurred_date) | 多租户 |
| `idx_hse_events_tags` | tags (GIN) | 标签检索 |
| `idx_hse_events_extra` | extra (GIN) | 扩展字段检索 |

#### 分区策略

```sql
-- 按年分区（支持 5 年以上历史数据）
-- 实际创建时使用 pg_partman 自动管理
PARTITION BY RANGE (occurred_at)
-- 2026 年分区 / 2027 年分区 / ... / 2030 年分区
```

### 1.4 hse_event_links 表设计（事件关联关系）

> `parent_event_id` 仅支持单父节点，复杂场景需多对多关联表。

| 字段 | 类型 | 约束 | 字段意义 | 数据来源 |
|------|------|------|----------|----------|
| `id` | BIGSERIAL | PK | 主键 | 自增 |
| `from_event_id` | BIGINT | FK→hse_events.id NOT NULL | 起始事件 | 事件 ID |
| `to_event_id` | BIGINT | FK→hse_events.id NOT NULL | 目标事件 | 事件 ID |
| `link_type` | VARCHAR(32) | NOT NULL | 关联类型 | 见下方枚举 |
| `description` | TEXT |  | 关联说明 | 应用层 |
| `weight` | NUMERIC(4,2) | DEFAULT 1.0 | 关联强度（AI 分析用） | 应用层 |
| `created_by` | BIGINT |  | 创建人 | users.id |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 创建时间 | 系统 |

**link_type 枚举**：

| code | 意义 | 示例 |
|------|------|------|
| `triggered_by` | 被...触发 | 事故 被 隐患 触发 |
| `led_to` | 导致... | 隐患 导致 事故 |
| `caused_by` | 根因是... | 事故 根因 风险源 |
| `related_to` | 相关联 | 培训 关联 隐患 |
| `derived_from` | 派生自 | 培训需求 派生自 事故 |
| `duplicated_with` | 重复事件 | 同一隐患多次上报 |

### 1.5 hse_event_attachments 表设计

| 字段 | 类型 | 约束 | 字段意义 |
|------|------|------|----------|
| `id` | BIGSERIAL | PK | 主键 |
| `event_id` | BIGINT | FK→hse_events.id NOT NULL | 关联事件 |
| `file_type` | VARCHAR(32) | NOT NULL | image/video/document/audio |
| `file_name` | VARCHAR(255) |  | 文件名 |
| `file_path` | VARCHAR(512) |  | 存储路径 |
| `file_size` | BIGINT |  | 文件大小（字节） |
| `mime_type` | VARCHAR(128) |  | MIME 类型 |
| `file_record_id` | BIGINT |  | 关联 file_records.id |
| `uploaded_by` | BIGINT |  | 上传人 |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 上传时间 |

### 1.6 hse_event_timeline 表设计

| 字段 | 类型 | 约束 | 字段意义 |
|------|------|------|----------|
| `id` | BIGSERIAL | PK | 主键 |
| `event_id` | BIGINT | FK→hse_events.id NOT NULL | 关联事件 |
| `action` | VARCHAR(64) | NOT NULL | 动作（created/assigned/processed/resolved/closed/reopened） |
| `actor_id` | BIGINT |  | 操作人 ID |
| `actor_name` | VARCHAR(64) |  | 操作人姓名（冗余） |
| `from_status` | VARCHAR(32) |  | 变更前状态 |
| `to_status` | VARCHAR(32) |  | 变更后状态 |
| `comment` | TEXT |  | 处理意见 |
| `location` | VARCHAR(255) |  | 操作地点（移动端 GPS） |
| `occurred_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 操作时间 |
| `extra` | JSONB |  | 扩展字段 |

### 1.7 事件数据流向

```
┌─────────────────────────────────────────────────────────────────┐
│  现有业务表（保持不变）                                          │
│  hazards │ accidents │ sanwei_violations │ iot_device_alerts    │
│  grid_patrol_logs │ training_records │ risk_sources             │
└────┬────────┬───────────┬───────────────┬──────────────────────┘
     │        │           │               │
     │ Trigger/应用层同步  │               │
     ▼        ▼           ▼               ▼
┌─────────────────────────────────────────────────────────────────┐
│  hse_events（统一事件投影表）                                    │
│  event_type / severity / occurred_at / department_id / ...      │
└────┬────────────────────────────────────────────────────────────┘
     │
     ├──→ hse_event_links（事件关联：闭环追溯）
     ├──→ hse_event_attachments（事件附件）
     ├──→ hse_event_timeline（处置时间线）
     │
     ├──→ hse_stats_daily / monthly / annual（趋势统计）
     ├──→ hse_safety_index（安全指数）
     ├──→ BI 驾驶舱
     └──→ AI 分析（根因分析/预测）
```

### 1.8 事件同步机制（两种方案，推荐并行）

**方案 A：PostgreSQL Trigger（数据强一致）**

- 为 hazards / accidents / sanwei_violations / iot_device_alerts / grid_patrol_logs / training_records / risk_sources 7 张源表创建 AFTER INSERT/UPDATE/DELETE Trigger
- Trigger 内部映射字段并写入 hse_events
- 优点：数据强一致、应用层无侵入
- 缺点：增加数据库负担

**方案 B：应用层 Sync Service（业务可见）**

- 在后端业务路由的 create/update 逻辑中调用 `hseEventService.sync(sourceTable, sourceId)`
- 处理 Trigger 无法覆盖的复杂映射（如 severity 等级换算）
- 优点：业务可见、可加复杂逻辑
- 缺点：需修改业务路由（但**不修改表结构**）

**建议**：方案 A 为主 + 方案 B 为辅

### 1.9 字段映射规则

| 源表 | → event_type | → occurred_at | → severity 映射 | → status 映射 |
|------|--------------|---------------|-----------------|----------------|
| hazards | hazard | hazard_date | 重大→critical, 较大→major, 一般→minor | 待整改→open, 整改中→processing, 已整改→resolved, 已验收→closed |
| accidents | accident | accident_date | 特大→critical, 重大→critical, 较大→major, 一般→minor | 处理中→processing, 已结案→closed |
| sanwei_violations | violation | violation_date | 严重违章→major, 一般违章→minor | 待处理→open, 已处理→closed |
| iot_device_alerts | iot_alert | created_at | 高→critical, 中→major, 低→minor | 待处理→open, 已处理→closed |
| grid_patrol_logs | patrol_alert | patrol_date | 重大问题→major, 一般问题→minor | 待处理→open, 已处理→closed |
| training_records | training_anomaly | training_date | 不合格→major, 缺席→critical, 过期→minor | 待补训→open, 已补训→closed |
| risk_sources | risk_anomaly | updated_at | 红色→critical, 橙色→major, 黄色→minor, 蓝色→info | 正常→resolved, 异常→open |

---

## 二、风险闭环模型

### 2.1 设计理念

安全生产标准化的核心是**风险分级管控与隐患排查治理双重预防机制**。当前系统 `risk_sources` 表存储风险源，`hazards` 表存储隐患，但两者无关联字段，无法形成"风险→隐患→整改→复查"闭环。

本模型在保留现有 `risk_sources` 和 `hazards` 表不变的前提下，新增 5 张表，构建完整的 7 环闭环：

```
风险源(risk_sources)  →  危险因素(hse_risk_factors)
        ↓
控制措施(hse_control_measures)
        ↓
检查计划(hse_inspection_plans)
        ↓
隐患(hazards, 现有表)  →  整改(hse_rectifications)
        ↓
复查(hse_reviews)
        ↓
回输到风险源（动态评估）
```

### 2.2 新增表设计

#### 2.2.1 hse_risk_factors（危险因素表）

| 字段 | 类型 | 约束 | 字段意义 | 数据来源 |
|------|------|------|----------|----------|
| `id` | BIGSERIAL | PK | 主键 | 自增 |
| `factor_code` | VARCHAR(64) | UNIQUE NOT NULL | 危险因素编号 RF-YYYY-NNNNN | 应用层 |
| `risk_source_id` | BIGINT | NOT NULL | 关联风险源（软引用 risk_sources.id） | risk_sources.id |
| `name` | VARCHAR(255) | NOT NULL | 危险因素名称 | 人工录入 |
| `category` | VARCHAR(64) |  | 类别（人/机/环/管/物） | 字典 |
| `description` | TEXT |  | 详细描述 | 人工录入 |
| `possibility` | VARCHAR(16) |  | 可能性 L1-L5 | LEC 评估 |
| `severity` | VARCHAR(16) |  | 严重性 S1-S5 | LEC 评估 |
| `exposure` | VARCHAR(16) |  | 暴露频率 E1-E6 | LEC 评估 |
| `risk_value` | NUMERIC(6,2) |  | 风险分值（L×E×C） | 自动计算 |
| `risk_level` | VARCHAR(16) |  | 风险等级 红/橙/黄/蓝 | 自动计算 |
| `is_controlled` | BOOLEAN | DEFAULT FALSE | 是否已管控 | 派生 |
| `control_measure_count` | INT | DEFAULT 0 | 管控措施数 | 聚合 |
| `tenant_id` | BIGINT | NOT NULL DEFAULT 1 | 租户 | 默认 1 |
| `created_by` | BIGINT |  | 创建人 | users.id |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 创建时间 | 系统 |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 更新时间 | 系统 |
| `is_deleted` | BOOLEAN | NOT NULL DEFAULT FALSE | 软删除 | 系统 |

#### 2.2.2 hse_control_measures（控制措施表）

| 字段 | 类型 | 约束 | 字段意义 |
|------|------|------|----------|
| `id` | BIGSERIAL | PK | 主键 |
| `measure_code` | VARCHAR(64) | UNIQUE NOT NULL | 措施编号 CM-YYYY-NNNNN |
| `risk_factor_id` | BIGINT | NOT NULL | 关联危险因素 |
| `type` | VARCHAR(32) | NOT NULL | 措施类型 engineering/administrative/ppe/emergency |
| `name` | VARCHAR(255) | NOT NULL | 措施名称 |
| `content` | TEXT |  | 措施详细内容 |
| `responsible_person_id` | BIGINT |  | 责任人 ID（软引用 personnel.id） |
| `responsible_person_name` | VARCHAR(64) |  | 责任人姓名（冗余） |
| `department_id` | BIGINT |  | 责任部门 ID |
| `frequency` | VARCHAR(32) |  | 执行频率 daily/weekly/monthly/quarterly/annual |
| `is_active` | BOOLEAN | DEFAULT TRUE | 是否生效 |
| `effective_date` | DATE |  | 生效日期 |
| `expiry_date` | DATE |  | 失效日期 |
| `last_check_date` | DATE |  | 最近检查日期 |
| `next_check_date` | DATE |  | 下次检查日期 |
| `effectiveness_score` | NUMERIC(4,2) |  | 有效性评分 0-100 |
| `tenant_id` | BIGINT | NOT NULL DEFAULT 1 | 租户 |
| `created_by` | BIGINT |  | 创建人 |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 创建时间 |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 更新时间 |
| `is_deleted` | BOOLEAN | NOT NULL DEFAULT FALSE | 软删除 |

#### 2.2.3 hse_inspection_plans（检查计划表）

| 字段 | 类型 | 约束 | 字段意义 |
|------|------|------|----------|
| `id` | BIGSERIAL | PK | 主键 |
| `plan_code` | VARCHAR(64) | UNIQUE NOT NULL | 计划编号 IP-YYYY-NNNNN |
| `name` | VARCHAR(255) | NOT NULL | 计划名称 |
| `type` | VARCHAR(32) |  | 计划类型 routine/special/seasonal/pre_holiday |
| `control_measure_id` | BIGINT |  | 关联控制措施（可空） |
| `risk_factor_id` | BIGINT |  | 关联危险因素（可空） |
| `risk_source_id` | BIGINT |  | 关联风险源 |
| `scope` | TEXT |  | 检查范围 |
| `items` | JSONB |  | 检查项清单（数组） |
| `frequency` | VARCHAR(32) |  | 频率 |
| `start_date` | DATE |  | 开始日期 |
| `end_date` | DATE |  | 结束日期 |
| `next_run_date` | DATE |  | 下次执行日期 |
| `assignee_id` | BIGINT |  | 执行人 ID |
| `assignee_name` | VARCHAR(64) |  | 执行人姓名 |
| `department_id` | BIGINT |  | 执行部门 |
| `status` | VARCHAR(32) | DEFAULT 'active' | active/paused/completed |
| `tenant_id` | BIGINT | NOT NULL DEFAULT 1 | 租户 |
| `created_by` | BIGINT |  | 创建人 |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 创建时间 |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 更新时间 |
| `is_deleted` | BOOLEAN | NOT NULL DEFAULT FALSE | 软删除 |

#### 2.2.4 hse_rectifications（整改记录表）

| 字段 | 类型 | 约束 | 字段意义 |
|------|------|------|----------|
| `id` | BIGSERIAL | PK | 主键 |
| `rect_code` | VARCHAR(64) | UNIQUE NOT NULL | 整改编号 RC-YYYY-NNNNN |
| `hazard_id` | BIGINT | NOT NULL | 关联隐患（软引用 hazards.id） |
| `event_id` | BIGINT |  | 关联事件（软引用 hse_events.id） |
| `measure` | TEXT | NOT NULL | 整改措施 |
| `plan_type` | VARCHAR(32) |  | 立即整改/限期整改/停工整改 |
| `responsible_person_id` | BIGINT |  | 整改责任人 ID |
| `responsible_person_name` | VARCHAR(64) |  | 责任人姓名 |
| `department_id` | BIGINT |  | 整改部门 |
| `deadline` | TIMESTAMPTZ |  | 整改期限 |
| `started_at` | TIMESTAMPTZ |  | 开始整改时间 |
| `completed_at` | TIMESTAMPTZ |  | 完成整改时间 |
| `duration_hours` | NUMERIC(10,2) |  | 整改时长 |
| `cost` | NUMERIC(14,2) |  | 整改费用 |
| `before_photos` | JSONB |  | 整改前照片（file_record_id 数组） |
| `after_photos` | JSONB |  | 整改后照片 |
| `status` | VARCHAR(32) | DEFAULT 'pending' | pending/in_progress/completed/overdue |
| `is_overdue` | BOOLEAN | DEFAULT FALSE | 是否超期 |
| `tenant_id` | BIGINT | NOT NULL DEFAULT 1 | 租户 |
| `created_by` | BIGINT |  | 创建人 |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 创建时间 |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 更新时间 |
| `is_deleted` | BOOLEAN | NOT NULL DEFAULT FALSE | 软删除 |

#### 2.2.5 hse_reviews（复查记录表）

| 字段 | 类型 | 约束 | 字段意义 |
|------|------|------|----------|
| `id` | BIGSERIAL | PK | 主键 |
| `review_code` | VARCHAR(64) | UNIQUE NOT NULL | 复查编号 RV-YYYY-NNNNN |
| `rectification_id` | BIGINT | NOT NULL | 关联整改记录 |
| `hazard_id` | BIGINT |  | 关联隐患 |
| `reviewer_id` | BIGINT |  | 复查人 ID |
| `reviewer_name` | VARCHAR(64) |  | 复查人姓名 |
| `review_date` | TIMESTAMPTZ | NOT NULL | 复查时间 |
| `result` | VARCHAR(32) | NOT NULL | passed/failed/partial |
| `score` | NUMERIC(4,2) |  | 复查评分 0-100 |
| `comment` | TEXT |  | 复查意见 |
| `photos` | JSONB |  | 复查照片 |
| `is_recurred` | BOOLEAN | DEFAULT FALSE | 是否复发（隐患复发标记） |
| `new_hazard_id` | BIGINT |  | 复发新生隐患 ID |
| `tenant_id` | BIGINT | NOT NULL DEFAULT 1 | 租户 |
| `created_by` | BIGINT |  | 创建人 |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 创建时间 |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 更新时间 |
| `is_deleted` | BOOLEAN | NOT NULL DEFAULT FALSE | 软删除 |

### 2.3 风险闭环数据关系图

```
┌──────────────────────────────────────────────────────────────┐
│  风险源（risk_sources，现有表）                                │
│  id, source_id, name, level, location, lat, lng, ...        │
└──────────────────────────┬───────────────────────────────────┘
                           │ 1:N（一个风险源有多个危险因素）
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  危险因素（hse_risk_factors，新增）                            │
│  risk_source_id → risk_sources.id                           │
│  LEC 评估（possibility × exposure × severity → risk_value）  │
└──────────────────────────┬───────────────────────────────────┘
                           │ 1:N（一个危险因素有多项管控措施）
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  控制措施（hse_control_measures，新增）                        │
│  risk_factor_id → hse_risk_factors.id                      │
│  responsible_person_id → personnel.id                       │
└──────────────────────────┬───────────────────────────────────┘
                           │ 1:N（一项措施对应多个检查计划）
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  检查计划（hse_inspection_plans，新增）                        │
│  control_measure_id → hse_control_measures.id              │
│  risk_factor_id → hse_risk_factors.id                       │
│  assignee_id → personnel.id                                 │
└──────────────────────────┬───────────────────────────────────┘
                           │ 执行检查 → 发现隐患
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  隐患（hazards，现有表）                                       │
│  id, no, hazard_date, description, status, fixer, ...        │
│  ← 通过 hse_events 间接关联到 risk_factor                     │
└──────────────────────────┬───────────────────────────────────┘
                           │ 1:N（一个隐患可能多次整改）
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  整改（hse_rectifications，新增）                              │
│  hazard_id → hazards.id                                     │
│  event_id → hse_events.id                                   │
│  responsible_person_id → personnel.id                       │
└──────────────────────────┬───────────────────────────────────┘
                           │ 1:N（一次整改可能多次复查）
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  复查（hse_reviews，新增）                                     │
│  rectification_id → hse_rectifications.id                   │
│  reviewer_id → personnel.id                                 │
│  is_recurred → 是否复发                                      │
│  new_hazard_id → hazards.id（复发时新建隐患）                │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           │ 复查结果回输
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  回输到风险源（动态重评估）                                    │
│  - 复查失败 → risk_sources 等级可能上调                        │
│  - 多次复发 → 触发风险源失控告警（hse_events: risk_anomaly）  │
│  - 控制措施有效性评分更新                                      │
└──────────────────────────────────────────────────────────────┘
```

### 2.4 闭环数据流向

| 环节 | 触发动作 | 数据流向 |
|------|----------|----------|
| 风险源 → 危险因素 | 风险源录入/更新 | 同步创建/更新 hse_risk_factors |
| 危险因素 → 控制措施 | 因素识别完成 | 创建 hse_control_measures |
| 控制措施 → 检查计划 | 措施生效 | 创建 hse_inspection_plans |
| 检查计划 → 隐患 | 执行检查发现问题 | 写入 hazards，同步 hse_events |
| 隐患 → 整改 | 隐患确认 | 创建 hse_rectifications |
| 整改 → 复查 | 整改完成 | 创建 hse_reviews |
| 复查 → 风险源 | 复查结果 | 更新 hse_control_measures.effectiveness_score；若复发则 risk_sources 等级重评估 |

---

## 三、人员车辆部门关联模型

### 3.1 设计理念

当前 `personnel`、`vehicles`、`departments` 三张主数据表已存在，但被 15+ 张业务表引用时**全部使用字符串字段**（如 hazards.fixer、accidents.handler、emergency_plans.responsible_person），无法形成人员/车辆/部门维度的统计分析。

本模型**不修改现有主数据表**，新增 5 张关联/画像表，通过软引用建立关联：

1. `hse_positions` — 岗位字典（安全员/驾驶员/操作工等）
2. `hse_responsibilities` — 责任人关联表（将任意业务记录关联到人员/部门/岗位）
3. `hse_person_profiles` — 人员安全画像（聚合统计）
4. `hse_vehicle_profiles` — 车辆安全画像
5. `hse_dept_profiles` — 部门安全画像

### 3.2 新增表设计

#### 3.2.1 hse_positions（岗位字典表）

| 字段 | 类型 | 约束 | 字段意义 |
|------|------|------|----------|
| `id` | BIGSERIAL | PK | 主键 |
| `code` | VARCHAR(64) | UNIQUE NOT NULL | 岗位编码 |
| `name` | VARCHAR(128) | NOT NULL | 岗位名称 |
| `category` | VARCHAR(32) |  | 类别 management/operation/safety/support |
| `risk_level` | VARCHAR(16) |  | 岗位风险等级 high/medium/low |
| `requires_certificate` | BOOLEAN | DEFAULT FALSE | 是否需要资质证书 |
| `requires_training` | BOOLEAN | DEFAULT TRUE | 是否需要培训 |
| `training_frequency` | VARCHAR(32) |  | 培训频率 |
| `parent_id` | BIGINT |  | 上级岗位（自关联） |
| `sort_order` | INT | DEFAULT 0 | 排序 |
| `is_active` | BOOLEAN | DEFAULT TRUE | 是否启用 |
| `tenant_id` | BIGINT | NOT NULL DEFAULT 1 | 租户 |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 创建时间 |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 更新时间 |
| `is_deleted` | BOOLEAN | NOT NULL DEFAULT FALSE | 软删除 |

#### 3.2.2 hse_responsibilities（责任人关联表）

> **核心关联表**：将任意业务记录关联到人员/部门/岗位，替代散落在各业务表的字符串字段。

| 字段 | 类型 | 约束 | 字段意义 |
|------|------|------|----------|
| `id` | BIGSERIAL | PK | 主键 |
| `biz_table` | VARCHAR(64) | NOT NULL | 业务表名（hazards/accidents/emergency_plans/...） |
| `biz_id` | BIGINT | NOT NULL | 业务表记录 ID |
| `responsibility_type` | VARCHAR(32) | NOT NULL | 责任类型（见枚举） |
| `personnel_id` | BIGINT |  | 关联人员（软引用 personnel.id） |
| `personnel_name` | VARCHAR(64) |  | 人员姓名（冗余） |
| `department_id` | BIGINT |  | 关联部门（软引用 departments.id） |
| `department_name` | VARCHAR(128) |  | 部门名称（冗余） |
| `position_id` | BIGINT |  | 关联岗位（软引用 hse_positions.id） |
| `position_name` | VARCHAR(128) |  | 岗位名称（冗余） |
| `user_id` | BIGINT |  | 关联系统用户（软引用 users.id） |
| `is_primary` | BOOLEAN | DEFAULT FALSE | 是否主要责任人 |
| `start_date` | DATE |  | 责任开始日期 |
| `end_date` | DATE |  | 责任结束日期 |
| `tenant_id` | BIGINT | NOT NULL DEFAULT 1 | 租户 |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 创建时间 |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 更新时间 |
| `is_deleted` | BOOLEAN | NOT NULL DEFAULT FALSE | 软删除 |

**responsibility_type 枚举**：

| code | 意义 | 应用场景 |
|------|------|----------|
| `responsible` | 主要责任人 | 隐患整改/事故责任 |
| `checker` | 检查人 | 隐患排查/巡查 |
| `verifier` | 验收人 | 整改验收 |
| `handler` | 处置人 | 事故处置 |
| `assignee` | 执行人 | 检查计划/整改任务 |
| `participant` | 参与人 | 应急演练/培训 |
| `reporter` | 上报人 | 隐患上报 |
| `supervisor` | 监督人 | 危险作业 |
| `organizer` | 组织者 | 培训/演练 |
| `owner` | 归属人 | 车辆/设备归属 |

#### 3.2.3 hse_person_profiles（人员安全画像表）

> 聚合统计表，由定时任务每日刷新，支撑人员维度分析。

| 字段 | 类型 | 约束 | 字段意义 | 数据来源 |
|------|------|------|----------|----------|
| `id` | BIGSERIAL | PK | 主键 | |
| `personnel_id` | BIGINT | UNIQUE NOT NULL | 人员 ID | personnel.id |
| `personnel_name` | VARCHAR(64) |  | 姓名（冗余） | personnel.name |
| `department_id` | BIGINT |  | 部门 | personnel.dept_id |
| `department_name` | VARCHAR(128) |  | 部门名 | personnel.dept |
| `position_id` | BIGINT |  | 岗位 | hse_responsibilities |
| `position_name` | VARCHAR(128) |  | 岗位名 | |
| `hire_date` | DATE |  | 入职日期 | personnel.hire_date |
| `employment_years` | NUMERIC(4,1) |  | 司龄（年） | 计算 |
| `age` | INT |  | 年龄 | personnel.age |
| `is_over_age` | BOOLEAN |  | 是否超龄 | over_age_personnel |
| `total_hazards_reported` | INT | DEFAULT 0 | 累计上报隐患数 | hse_events 聚合 |
| `total_hazards_responsible` | INT | DEFAULT 0 | 累计负责隐患数 | hse_responsibilities |
| `total_accidents_involved` | INT | DEFAULT 0 | 累计涉事事故数 | hse_events 聚合 |
| `total_violations` | INT | DEFAULT 0 | 累计三违次数 | hse_events 聚合 |
| `total_training_hours` | NUMERIC(8,2) | DEFAULT 0 | 累计培训学时 | training_records |
| `total_training_count` | INT | DEFAULT 0 | 累计培训次数 | training_records |
| `last_training_date` | DATE |  | 最近培训日期 | training_records |
| `training_expiry_date` | DATE |  | 培训到期日 | 计算 |
| `is_training_expired` | BOOLEAN |  | 培训是否过期 | 计算 |
| `total_inspections` | INT | DEFAULT 0 | 累计巡查次数 | grid_patrol_logs |
| `total_iot_alerts` | INT | DEFAULT 0 | 累计 IoT 告警数 | hse_events |
| `insurance_status` | VARCHAR(32) |  | 保险状态 insured/expired/uninsured | personnel_insurance |
| `risk_score` | NUMERIC(6,2) |  | 人员风险评分 0-100 | 计算 |
| `risk_level` | VARCHAR(16) |  | 风险等级 high/medium/low | 计算 |
| `safety_index` | NUMERIC(5,2) |  | 安全指数 0-100 | 计算 |
| `stats_period` | VARCHAR(16) |  | 统计周期 all/year/quarter/month | |
| `stats_year` | INT |  | 统计年度 | |
| `stats_month` | INT |  | 统计月份 | |
| `tenant_id` | BIGINT | NOT NULL DEFAULT 1 | 租户 | |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 最后刷新时间 | 系统 |

#### 3.2.4 hse_vehicle_profiles（车辆安全画像表）

| 字段 | 类型 | 约束 | 字段意义 | 数据来源 |
|------|------|------|----------|----------|
| `id` | BIGSERIAL | PK | 主键 | |
| `vehicle_id` | BIGINT | UNIQUE NOT NULL | 车辆 ID | vehicles.id |
| `plate` | VARCHAR(16) |  | 车牌（冗余） | vehicles.plate |
| `vehicle_type` | VARCHAR(32) |  | 车辆类型 | vehicles.vehicle_type |
| `reg_date` | DATE |  | 注册日期 | vehicles.reg_date |
| `service_years` | NUMERIC(4,1) |  | 使用年限 | 计算 |
| `total_accidents` | INT | DEFAULT 0 | 累计事故数 | hse_events 聚合 |
| `total_violations` | INT | DEFAULT 0 | 累计违章数 | hse_events 聚合 |
| `total_loss_amount` | NUMERIC(14,2) | DEFAULT 0 | 累计经济损失 | hse_events.loss_amount |
| `insurance_status` | VARCHAR(32) |  | 保险状态 | insurance_history |
| `insurance_expiry` | DATE |  | 保险到期日 | insurance_history.end_date |
| `is_insurance_expired` | BOOLEAN |  | 保险是否过期 | 计算 |
| `last_maintenance_date` | DATE |  | 最近维保日期 | 未来表 |
| `annual_inspection_expiry` | DATE |  | 年检到期日 | 未来表 |
| `risk_score` | NUMERIC(6,2) |  | 风险评分 | 计算 |
| `risk_level` | VARCHAR(16) |  | 风险等级 | 计算 |
| `safety_index` | NUMERIC(5,2) |  | 安全指数 | 计算 |
| `stats_period` | VARCHAR(16) |  | 统计周期 | |
| `stats_year` | INT |  | 统计年度 | |
| `tenant_id` | BIGINT | NOT NULL DEFAULT 1 | 租户 | |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 最后刷新时间 | |

#### 3.2.5 hse_dept_profiles（部门安全画像表）

| 字段 | 类型 | 约束 | 字段意义 | 数据来源 |
|------|------|------|----------|----------|
| `id` | BIGSERIAL | PK | 主键 | |
| `department_id` | BIGINT | UNIQUE NOT NULL | 部门 ID | departments.id |
| `department_name` | VARCHAR(128) |  | 部门名（冗余） | departments.name |
| `parent_id` | BIGINT |  | 上级部门 | departments.parent_id |
| `total_personnel` | INT | DEFAULT 0 | 总人数 | personnel |
| `total_vehicles` | INT | DEFAULT 0 | 总车辆数 | vehicles |
| `total_risk_sources` | INT | DEFAULT 0 | 风险源数量 | risk_sources |
| `total_hazards_open` | INT | DEFAULT 0 | 未整改隐患数 | hse_events |
| `total_hazards_resolved` | INT | DEFAULT 0 | 已整改隐患数 | hse_events |
| `total_accidents` | INT | DEFAULT 0 | 事故总数 | hse_events |
| `total_violations` | INT | DEFAULT 0 | 三违总数 | hse_events |
| `total_training_hours` | NUMERIC(10,2) | DEFAULT 0 | 培训总学时 | training_records |
| `total_loss_amount` | NUMERIC(14,2) | DEFAULT 0 | 经济损失 | hse_events |
| `total_safety_budget` | NUMERIC(14,2) | DEFAULT 0 | 安全投入 | safety_budgets |
| `closure_rate` | NUMERIC(5,2) |  | 闭环率 % | 计算 |
| `avg_closure_duration` | NUMERIC(10,2) |  | 平均闭环时长（小时） | hse_events |
| `risk_score` | NUMERIC(6,2) |  | 风险评分 | 计算 |
| `safety_index` | NUMERIC(5,2) |  | 安全指数 0-100 | 计算 |
| `safety_rank` | INT |  | 部门安全排名 | 计算 |
| `stats_period` | VARCHAR(16) |  | 统计周期 | |
| `stats_year` | INT |  | 统计年度 | |
| `stats_month` | INT |  | 统计月份 | |
| `tenant_id` | BIGINT | NOT NULL DEFAULT 1 | 租户 | |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 最后刷新时间 | |

### 3.3 关联关系图

```
departments（现有）         personnel（现有）         vehicles（现有）
    │                          │                          │
    │ dept_id                  │ personnel_id              │ vehicle_id
    │ (软引用)                  │ (软引用)                   │ (软引用)
    ▼                          ▼                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  hse_responsibilities（责任人关联表，核心枢纽）                  │
│  biz_table + biz_id → 任意业务记录                               │
│  personnel_id → personnel.id                                    │
│  department_id → departments.id                                 │
│  position_id → hse_positions.id                                │
│  user_id → users.id                                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ 关联到业务
                              ▼
              hazards / accidents / emergency_plans /
              emergency_drills / hse_rectifications /
              hse_inspection_plans / regulations / ...
                              │
                              │ 聚合统计（定时任务）
                              ▼
┌──────────────────┬──────────────────┬──────────────────┐
│ hse_person_profiles│ hse_vehicle_profiles│ hse_dept_profiles│
│ 人员安全画像      │ 车辆安全画像       │ 部门安全画像     │
│ 风险评分/安全指数 │ 风险评分/安全指数   │ 风险评分/安全指数 │
└──────────────────┴──────────────────┴──────────────────┘
                              │
                              ▼
                    BI 驾驶舱 / 趋势分析
```

### 3.4 关联规则示例

| 业务场景 | biz_table | biz_id | responsibility_type | personnel_id | 说明 |
|----------|-----------|--------|---------------------|--------------|------|
| 隐患整改 | hazards | 123 | responsible | 456 | 人员 456 负责整改隐患 123 |
| 隐患排查 | hazards | 123 | checker | 789 | 人员 789 发现隐患 123 |
| 隐患验收 | hazards | 123 | verifier | 101 | 人员 101 验收隐患 123 |
| 事故处置 | accidents | 45 | handler | 202 | 人员 202 处置事故 45 |
| 事故涉事 | accidents | 45 | responsible | 303 | 人员 303 是事故 45 主要责任 |
| 应急预案 | emergency_plans | 7 | responsible | 404 | 人员 404 负责预案 7 |
| 检查计划 | hse_inspection_plans | 8 | assignee | 505 | 人员 505 执行检查计划 8 |
| 培训记录 | training_records | 99 | participant | 606 | 人员 606 参加培训 99 |
| 车辆归属 | vehicles | 10 | owner | 707 | 人员 707 归属车辆 10 |

---

## 四、培训闭环模型

### 4.1 设计理念

当前培训管理（training_records + training_roster）是**被动记录型**：培训实施后录入记录，无法根据事故/隐患/风险**自动派生培训需求**。

安全生产标准化要求：**事故后必培训、隐患专项培训、新风险源识别培训、岗位变动培训、复训到期培训**。

本模型新增 3 张表：

1. `hse_training_needs` — 培训需求表（自动派生 + 人工录入）
2. `hse_training_plans` — 培训计划表（需求转化为计划）
3. `hse_training_effectiveness` — 培训效果评估表（效果追踪）

### 4.2 新增表设计

#### 4.2.1 hse_training_needs（培训需求表）

| 字段 | 类型 | 约束 | 字段意义 | 数据来源 |
|------|------|------|----------|----------|
| `id` | BIGSERIAL | PK | 主键 | |
| `need_code` | VARCHAR(64) | UNIQUE NOT NULL | 需求编号 TN-YYYY-NNNNN | 应用层 |
| `title` | VARCHAR(255) | NOT NULL | 培训需求标题 | 派生/录入 |
| `source_type` | VARCHAR(32) | NOT NULL | 需求来源类型（见枚举） | 派生规则 |
| `source_table` | VARCHAR(64) |  | 源业务表 | accidents/hazards/risk_sources |
| `source_id` | BIGINT |  | 源业务记录 ID | |
| `source_event_id` | BIGINT |  | 关联事件 ID | hse_events.id |
| `training_type` | VARCHAR(64) | NOT NULL | 培训类型 | 见枚举 |
| `priority` | VARCHAR(16) |  | 优先级 urgent/high/medium/low | 规则计算 |
| `target_audience` | VARCHAR(255) |  | 目标人群描述 | |
| `target_personnel_ids` | BIGINT[] |  | 目标人员 ID 数组 | |
| `target_department_ids` | BIGINT[] |  | 目标部门 ID 数组 | |
| `target_position_ids` | BIGINT[] |  | 目标岗位 ID 数组 | |
| `content_outline` | TEXT |  | 培训内容大纲 | AI 生成/录入 |
| `required_hours` | NUMERIC(4,1) |  | 要求学时 | |
| `deadline` | DATE |  | 完成期限 | |
| `status` | VARCHAR(32) | DEFAULT 'pending' | pending/planned/completed/cancelled | |
| `assigned_plan_id` | BIGINT |  | 已分配的培训计划 ID | hse_training_plans.id |
| `trigger_rule` | VARCHAR(128) |  | 触发规则编码 | 规则引擎 |
| `tenant_id` | BIGINT | NOT NULL DEFAULT 1 | 租户 | |
| `created_by` | BIGINT |  | 创建人 | |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 创建时间 | |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 更新时间 | |
| `is_deleted` | BOOLEAN | NOT NULL DEFAULT FALSE | 软删除 | |

**source_type 枚举**：

| code | 意义 | 触发条件 |
|------|------|----------|
| `accident` | 事故后培训 | 事故结案后自动派生 |
| `hazard` | 隐患专项培训 | 重大/较大隐患整改后 |
| `risk_source` | 新风险源培训 | 新增高风险源 |
| `position_change` | 岗位变动培训 | 人员岗位变更 |
| `new_employee` | 新员工入职培训 | personnel 新增 |
| `retraining` | 复训到期培训 | 培训证书到期前 30 天 |
| `regulation` | 法规更新培训 | regulations 新增/更新 |
| `annual_plan` | 年度计划培训 | 年度培训计划 |
| `manual` | 人工录入 | 管理员手动添加 |

**training_type 枚举**：

| code | 意义 |
|------|------|
| `safety_awareness` | 安全意识培训 |
| `skill_training` | 操作技能培训 |
| `emergency_drill` | 应急演练培训 |
| `special_operation` | 特种作业培训 |
| `management_system` | 管理体系培训 |
| `regulation_compliance` | 法规合规培训 |
| `case_study` | 事故案例培训 |
| `induction` | 三级安全教育 |
| `retraining` | 复训 |

#### 4.2.2 hse_training_plans（培训计划表）

| 字段 | 类型 | 约束 | 字段意义 |
|------|------|------|----------|
| `id` | BIGSERIAL | PK | 主键 |
| `plan_code` | VARCHAR(64) | UNIQUE NOT NULL | 计划编号 TP-YYYY-NNNNN |
| `need_id` | BIGINT |  | 关联培训需求 |
| `name` | VARCHAR(255) | NOT NULL | 计划名称 |
| `training_type` | VARCHAR(64) |  | 培训类型 |
| `content` | TEXT |  | 培训内容 |
| `trainer_id` | BIGINT |  | 培训师 ID（软引用 personnel.id） |
| `trainer_name` | VARCHAR(64) |  | 培训师姓名 |
| `planned_date` | DATE |  | 计划日期 |
| `planned_duration` | INT |  | 计划时长（分钟） |
| `actual_date` | DATE |  | 实际日期 |
| `actual_duration` | INT |  | 实际时长 |
| `location` | VARCHAR(255) |  | 培训地点 |
| `participant_count` | INT |  | 计划参训人数 |
| `actual_participant_count` | INT |  | 实际参训人数 |
| `target_personnel_ids` | BIGINT[] |  | 目标人员 ID 数组 |
| `target_department_ids` | BIGINT[] |  | 目标部门 |
| `status` | VARCHAR(32) | DEFAULT 'planned' | planned/in_progress/completed/cancelled |
| `training_record_ids` | BIGINT[] |  | 关联培训记录 ID 数组 |
| `tenant_id` | BIGINT | NOT NULL DEFAULT 1 | 租户 |
| `created_by` | BIGINT |  | 创建人 |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 创建时间 |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 更新时间 |
| `is_deleted` | BOOLEAN | NOT NULL DEFAULT FALSE | 软删除 |

#### 4.2.3 hse_training_effectiveness（培训效果评估表）

| 字段 | 类型 | 约束 | 字段意义 |
|------|------|------|----------|
| `id` | BIGSERIAL | PK | 主键 |
| `plan_id` | BIGINT | NOT NULL | 关联培训计划 |
| `training_record_id` | BIGINT |  | 关联培训记录 |
| `evaluation_type` | VARCHAR(32) | NOT NULL | immediate/delayed/behavioral |
| `evaluation_date` | DATE |  | 评估日期 |
| `evaluator_id` | BIGINT |  | 评估人 ID |
| `pass_rate` | NUMERIC(5,2) |  | 合格率 % |
| `avg_score` | NUMERIC(6,2) |  | 平均分 |
| `satisfaction_score` | NUMERIC(4,2) |  | 满意度评分 0-100 |
| `knowledge_score` | NUMERIC(4,2) |  | 知识掌握度 0-100 |
| `behavior_change_score` | NUMERIC(4,2) |  | 行为改变度 0-100（延迟评估） |
| `violation_after` | INT |  | 培训后违章次数（30 天/90 天） |
| `accident_after` | INT |  | 培训后事故次数 |
| `effectiveness_score` | NUMERIC(4,2) |  | 综合效果评分 0-100 |
| `is_effective` | BOOLEAN |  | 是否有效（≥60 分） |
| `comment` | TEXT |  | 评估意见 |
| `tenant_id` | BIGINT | NOT NULL DEFAULT 1 | 租户 |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 创建时间 |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 更新时间 |
| `is_deleted` | BOOLEAN | NOT NULL DEFAULT FALSE | 软删除 |

### 4.3 培训闭环数据流

```
┌─────────────────────────────────────────────────────────────────┐
│  触发源                                                          │
├─────────────────────────────────────────────────────────────────┤
│  事故结案  │  隐患整改完成  │  新增风险源  │  岗位变更  │  复训到期  │
└────┬────────┬─────────────────┬───────────────┬─────────────────┘
     │        │                 │               │
     ▼        ▼                 ▼               ▼
┌─────────────────────────────────────────────────────────────────┐
│  规则引擎（Trigger Rule Engine）                                 │
│  - 监听 hse_events 事件                                          │
│  - 匹配规则（如 event_type=accident AND status=closed）          │
│  - 生成培训需求                                                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  hse_training_needs（培训需求）                                  │
│  source_type = accident / hazard / risk_source / ...             │
│  source_event_id → hse_events.id                                 │
│  target_personnel_ids = [涉事人员 + 同岗位人员 + 同部门人员]      │
└──────────────────────────┬──────────────────────────────────────┘
                           │ 需求审批通过
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  hse_training_plans（培训计划）                                   │
│  need_id → hse_training_needs.id                                 │
│  trainer_id → personnel.id                                      │
│  target_personnel_ids = [...]                                    │
└──────────────────────────┬──────────────────────────────────────┘
                           │ 培训实施
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  training_records（现有表，不修改）                              │
│  + 通过 hse_event_links 关联回 hse_training_plans               │
└──────────────────────────┬──────────────────────────────────────┘
                           │ 培训后评估
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  hse_training_effectiveness（效果评估）                           │
│  plan_id → hse_training_plans.id                                 │
│  - 即时评估：合格率/满意度                                        │
│  - 延迟评估（30/90 天）：行为改变度/违章次数/事故次数              │
│  - 评估结果回输到培训需求（优化后续培训）                          │
└─────────────────────────────────────────────────────────────────┘
```

### 4.4 自动派生规则示例

| 规则编码 | 触发条件 | 派生动作 | 优先级 | 目标人群 |
|----------|----------|----------|--------|----------|
| `RULE_TN_001` | 事故结案（hse_events: event_type=accident, status=closed） | 生成事故案例培训需求 | urgent | 涉事人+同岗位+同部门 |
| `RULE_TN_002` | 重大隐患整改完成（severity=critical, status=resolved） | 生成隐患专项培训需求 | high | 责任人+同岗位 |
| `RULE_TN_003` | 新增高风险源（risk_sources: level=红/橙） | 生成新风险源培训需求 | high | 涉及区域人员 |
| `RULE_TN_004` | 培训证书到期前 30 天 | 生成复训需求 | medium | 持证人 |
| `RULE_TN_005` | 人员岗位变更（personnel.position 变更） | 生成岗前培训需求 | high | 变更人员 |
| `RULE_TN_006` | 新员工入职（personnel 新增） | 生成三级安全教育需求 | high | 新员工 |
| `RULE_TN_007` | 法规更新（regulations 新增/更新） | 生成合规培训需求 | medium | 相关部门全员 |
| `RULE_TN_008` | 季度三违率超标 | 生成反违章专项培训 | high | 违章人员+管理层 |
| `RULE_TN_009` | 部门安全指数连续 3 月下降 | 生成管理层安全培训 | urgent | 部门管理层 |
| `RULE_TN_010` | 隐患复发（hse_reviews: is_recurred=TRUE） | 生成强化培训需求 | high | 责任人+同岗位 |

---

## 五、趋势分析数据模型

### 5.1 设计理念

当前系统仅有 `dashboard.js` 实时聚合查询，存在两个问题：

1. **性能差**：每次查询都全表扫描，BI 大屏轮询导致数据库压力大
2. **无法历史对比**：实时聚合只能反映当前状态，无法做同比/环比/多年趋势

本模型采用**物化视图 + 预聚合表**双轨方案：

- **物化视图**：自动刷新，支撑实时性要求低的报表
- **预聚合表**：定时任务写入，支撑复杂多维分析与 AI 训练

### 5.2 新增表设计

#### 5.2.1 hse_stats_daily（日统计聚合表）

| 字段 | 类型 | 约束 | 字段意义 | 数据来源 |
|------|------|------|----------|----------|
| `id` | BIGSERIAL | PK | 主键 | |
| `stats_date` | DATE | NOT NULL | 统计日期 | occurred_date |
| `event_type` | VARCHAR(32) |  | 事件类型（null 表示全部） | hse_events |
| `severity` | VARCHAR(16) |  | 严重等级（null 表示全部） | hse_events |
| `department_id` | BIGINT |  | 部门（null 表示全部） | hse_events |
| `township` | VARCHAR(64) |  | 乡镇 | hse_events |
| `event_count` | INT | NOT NULL DEFAULT 0 | 事件数 | COUNT(*) |
| `closed_count` | INT | DEFAULT 0 | 闭环数 | COUNT(status=closed) |
| `closure_rate` | NUMERIC(5,2) |  | 闭环率 % | 计算 |
| `avg_closure_hours` | NUMERIC(10,2) |  | 平均闭环时长 | AVG |
| `total_loss` | NUMERIC(14,2) |  | 经济损失 | SUM |
| `new_hazards` | INT |  | 新增隐患 | 聚合 |
| `resolved_hazards` | INT |  | 整改隐患 | 聚合 |
| `new_accidents` | INT |  | 新增事故 | 聚合 |
| `new_violations` | INT |  | 新增三违 | 聚合 |
| `training_count` | INT |  | 培训场次 | training_records |
| `training_hours` | NUMERIC(10,2) |  | 培训学时 | SUM(duration) |
| `training_participants` | INT |  | 参训人次 | COUNT |
| `inspection_count` | INT |  | 巡查次数 | grid_patrol_logs |
| `iot_alerts` | INT |  | IoT 告警数 | 聚合 |
| `emergency_drills` | INT |  | 应急演练数 | emergency_drills |
| `safety_investment` | NUMERIC(14,2) |  | 安全投入 | safety_budgets |
| `tenant_id` | BIGINT | NOT NULL DEFAULT 1 | 租户 | |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 创建时间 | |
| UNIQUE | (stats_date, event_type, severity, department_id, township, tenant_id) | | 唯一约束 |

#### 5.2.2 hse_stats_monthly（月统计聚合表）

字段与 `hse_stats_daily` 类似，增加：

| 字段 | 类型 | 约束 | 字段意义 |
|------|------|------|----------|
| `stats_year` | INT | NOT NULL | 年度 |
| `stats_month` | INT | NOT NULL | 月份（1-12） |
| `mom_change` | NUMERIC(8,2) |  | 环比变化 %（与上月对比） |
| `yoy_change` | NUMERIC(8,2) |  | 同比变化 %（与去年同月对比） |
| `cumulative_year` | INT |  | 年度累计事件数 |
| `safety_index` | NUMERIC(5,2) |  | 月度安全指数 |
| `risk_index` | NUMERIC(5,2) |  | 月度风险指数 |
| `training_index` | NUMERIC(5,2) |  | 月度培训指数 |
| `accident_index` | NUMERIC(5,2) |  | 月度事故指数 |
| `hazard_index` | NUMERIC(5,2) |  | 月度隐患指数 |
| `violation_index` | NUMERIC(5,2) |  | 月度三违指数 |
| `emergency_index` | NUMERIC(5,2) |  | 月度应急指数 |

#### 5.2.3 hse_stats_annual（年统计聚合表）

| 字段 | 类型 | 约束 | 字段意义 |
|------|------|------|----------|
| `id` | BIGSERIAL | PK | 主键 |
| `stats_year` | INT | NOT NULL | 年度 |
| `department_id` | BIGINT |  | 部门（null 表示全公司） |
| `township` | VARCHAR(64) |  | 乡镇 |
| `total_events` | INT |  | 年度事件总数 |
| `total_accidents` | INT |  | 事故总数 |
| `total_hazards` | INT |  | 隐患总数 |
| `total_violations` | INT |  | 三违总数 |
| `total_loss` | NUMERIC(14,2) |  | 经济损失总额 |
| `total_training_hours` | NUMERIC(10,2) |  | 培训总学时 |
| `total_safety_investment` | NUMERIC(14,2) |  | 安全投入总额 |
| `closure_rate` | NUMERIC(5,2) |  | 年度闭环率 |
| `safety_index` | NUMERIC(5,2) |  | 年度安全指数 |
| `safety_index_rank` | INT |  | 历史排名 |
| `yoy_events_change` | NUMERIC(8,2) |  | 事件同比 % |
| `yoy_accidents_change` | NUMERIC(8,2) |  | 事故同比 % |
| `yoy_loss_change` | NUMERIC(8,2) |  | 损失同比 % |
| `five_year_trend` | JSONB |  | 5 年趋势数据 |
| `target_achievement_rate` | NUMERIC(5,2) |  | 目标达成率 % |
| `standardization_score` | NUMERIC(5,2) |  | 安全生产标准化得分 |
| `ai_prediction` | JSONB |  | AI 预测下一年数据 |
| `tenant_id` | BIGINT | NOT NULL DEFAULT 1 | 租户 |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 创建时间 |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 更新时间 |

#### 5.2.4 hse_safety_index（安全指数表）

| 字段 | 类型 | 约束 | 字段意义 |
|------|------|------|----------|
| `id` | BIGSERIAL | PK | 主键 |
| `period_type` | VARCHAR(16) | NOT NULL | weekly/monthly/quarterly/annual |
| `period_start` | DATE | NOT NULL | 周期开始 |
| `period_end` | DATE | NOT NULL | 周期结束 |
| `scope_type` | VARCHAR(16) | NOT NULL | company/department/township/personnel/vehicle |
| `scope_id` | BIGINT |  | 范围 ID（null 表示全公司） |
| `scope_name` | VARCHAR(128) |  | 范围名称 |
| `safety_index` | NUMERIC(5,2) | NOT NULL | 综合安全指数 0-100 |
| `accident_index` | NUMERIC(5,2) |  | 事故指数（权重 40%） |
| `hazard_index` | NUMERIC(5,2) |  | 隐患指数（权重 25%） |
| `violation_index` | NUMERIC(5,2) |  | 三违指数（权重 15%） |
| `training_index` | NUMERIC(5,2) |  | 培训指数（权重 10%） |
| `emergency_index` | NUMERIC(5,2) |  | 应急指数（权重 10%） |
| `risk_score` | NUMERIC(6,2) |  | 风险评分 0-100（分数越高风险越高） |
| `risk_level` | VARCHAR(16) |  | 风险等级 high/medium/low |
| `rank` | INT |  | 排名（同 scope_type 内） |
| `mom_change` | NUMERIC(8,2) |  | 环比变化 |
| `yoy_change` | NUMERIC(8,2) |  | 同比变化 |
| `components` | JSONB |  | 各分项明细 |
| `tenant_id` | BIGINT | NOT NULL DEFAULT 1 | 租户 |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 创建时间 |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 更新时间 |

#### 5.2.5 hse_dim_dictionary（维度字典表）

| 字段 | 类型 | 约束 | 字段意义 |
|------|------|------|----------|
| `id` | BIGSERIAL | PK | 主键 |
| `dim_type` | VARCHAR(32) | NOT NULL | 维度类型 |
| `dim_code` | VARCHAR(64) | NOT NULL | 编码 |
| `dim_name` | VARCHAR(128) | NOT NULL | 名称 |
| `parent_id` | BIGINT |  | 父级（树形） |
| `sort_order` | INT | DEFAULT 0 | 排序 |
| `is_active` | BOOLEAN | DEFAULT TRUE | 启用 |
| `tenant_id` | BIGINT | NOT NULL DEFAULT 1 | 租户 |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 创建时间 |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 更新时间 |
| `is_deleted` | BOOLEAN | NOT NULL DEFAULT FALSE | 软删除 |
| UNIQUE | (dim_type, dim_code, tenant_id) | | 唯一 |

**dim_type 枚举**：

| code | 说明 | 示例 |
|------|------|------|
| `accident_type` | 事故类型 | 车辆事故/工伤事故/火灾事故 |
| `hazard_category` | 隐患类别 | 电气/机械/消防/交通 |
| `violation_type` | 三违类型 | 违章指挥/违章作业/违反劳动纪律 |
| `risk_type` | 风险类型 | 人/机/环/管/物 |
| `event_severity` | 事件严重等级 | critical/major/minor/info |
| `event_status` | 事件状态 | open/processing/resolved/closed |
| `training_type` | 培训类型 | 三级教育/复训/专项 |
| `loss_category` | 损失类别 | 直接损失/间接损失 |

#### 5.2.6 hse_reports（报告存储表）

| 字段 | 类型 | 约束 | 字段意义 |
|------|------|------|----------|
| `id` | BIGSERIAL | PK | 主键 |
| `report_code` | VARCHAR(64) | UNIQUE NOT NULL | 报告编号 RPT-YYYYMM-NNN |
| `title` | VARCHAR(255) | NOT NULL | 报告标题 |
| `report_type` | VARCHAR(32) | NOT NULL | weekly/monthly/quarterly/annual/special |
| `period_start` | DATE | NOT NULL | 报告周期开始 |
| `period_end` | DATE | NOT NULL | 报告周期结束 |
| `scope_type` | VARCHAR(16) |  | company/department/township |
| `scope_id` | BIGINT |  | 范围 ID |
| `scope_name` | VARCHAR(128) |  | 范围名称 |
| `content_markdown` | TEXT |  | 报告内容（Markdown） |
| `content_json` | JSONB |  | 报告数据（结构化） |
| `summary` | TEXT |  | 摘要 |
| `key_metrics` | JSONB |  | 关键指标 |
| `recommendations` | JSONB |  | 改进建议 |
| `generated_by` | VARCHAR(32) |  | system/manual/ai |
| `generated_by_user_id` | BIGINT |  | 生成人 ID |
| `status` | VARCHAR(32) | DEFAULT 'draft' | draft/published/archived |
| `published_at` | TIMESTAMPTZ |  | 发布时间 |
| `file_record_id` | BIGINT |  | 导出文件 ID（PDF/Excel） |
| `tenant_id` | BIGINT | NOT NULL DEFAULT 1 | 租户 |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 创建时间 |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 更新时间 |
| `is_deleted` | BOOLEAN | NOT NULL DEFAULT FALSE | 软删除 |

#### 5.2.7 hse_threshold_rules（阈值预警规则表）

| 字段 | 类型 | 约束 | 字段意义 |
|------|------|------|----------|
| `id` | BIGSERIAL | PK | 主键 |
| `rule_code` | VARCHAR(64) | UNIQUE NOT NULL | 规则编号 TR-NNN |
| `name` | VARCHAR(255) | NOT NULL | 规则名称 |
| `metric` | VARCHAR(64) | NOT NULL | 监控指标（如 accidents_count、hazards_open_count） |
| `scope_type` | VARCHAR(16) |  | company/department/township |
| `scope_id` | BIGINT |  | 范围 ID |
| `operator` | VARCHAR(8) | NOT NULL | gt/gte/lt/lte/eq |
| `threshold` | NUMERIC(14,2) | NOT NULL | 阈值 |
| `time_window` | VARCHAR(32) |  | 时间窗口 1h/24h/7d/30d |
| `severity` | VARCHAR(16) |  | 触发后严重等级 |
| `notification_channels` | TEXT[] |  | 通知渠道 web/email/sms/dingtalk |
| `notification_targets` | BIGINT[] |  | 通知人 ID 数组 |
| `is_active` | BOOLEAN | DEFAULT TRUE | 启用 |
| `last_triggered_at` | TIMESTAMPTZ |  | 最近触发时间 |
| `trigger_count` | INT | DEFAULT 0 | 累计触发次数 |
| `tenant_id` | BIGINT | NOT NULL DEFAULT 1 | 租户 |
| `created_by` | BIGINT |  | 创建人 |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 创建时间 |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 更新时间 |
| `is_deleted` | BOOLEAN | NOT NULL DEFAULT FALSE | 软删除 |

### 5.3 安全指数计算公式

#### 5.3.1 综合安全指数（Safety Index, SI）

```
SI = 100
    - accident_index × 0.40
    - (100 - hazard_index) × 0.25
    - (100 - violation_index) × 0.15
    - (100 - training_index) × 0.10
    - (100 - emergency_index) × 0.10
```

> SI 越高越安全，0-100 分制

#### 5.3.2 子指数计算

| 子指数 | 计算公式 | 说明 |
|--------|----------|------|
| 事故指数（AI） | 100 - (重大事故×20 + 一般事故×5 + 轻微事故×1) / 人员数 × 1000 | 事故越少分越高 |
| 隐患指数（HI） | 100 - (未整改隐患×3 + 逾期整改×5) / 应整改总数 × 100 | 整改率越高分越高 |
| 三违指数（VI） | 100 - 三违次数 / 人员数 × 1000 | 三违越少分越高 |
| 培训指数（TI） | 培训覆盖率×0.6 + 合格率×0.4 | 培训越充分分越高 |
| 应急指数（EI） | 预案演练覆盖率×0.5 + 物资完备率×0.3 + 闭环率×0.2 | 应急越充分分越高 |

### 5.4 统计字段需求清单

#### 5.4.1 周报统计字段（15 项）

| 字段 | 说明 | 数据源 |
|------|------|--------|
| `new_hazards_week` | 本周新增隐患数 | hse_stats_daily |
| `resolved_hazards_week` | 本周整改隐患数 | hse_stats_daily |
| `hazard_closure_rate_week` | 隐患整改率 % | 计算 |
| `new_accidents_week` | 本周事故数 | hse_stats_daily |
| `new_violations_week` | 本周三违数 | hse_stats_daily |
| `training_count_week` | 培训场次 | hse_stats_daily |
| `training_hours_week` | 培训学时 | hse_stats_daily |
| `inspection_count_week` | 巡查次数 | hse_stats_daily |
| `iot_alerts_week` | IoT 告警数 | hse_stats_daily |
| `emergency_drills_week` | 应急演练数 | hse_stats_daily |
| `avg_closure_hours_week` | 平均闭环时长 | hse_stats_daily |
| `high_risk_events_ratio_week` | 高风险事件占比 % | 计算 |
| `top5_departments_hazards_week` | 部门隐患 TOP5 | 聚合 |
| `township_accidents_week` | 乡镇事故分布 | 聚合 |
| `vehicle_accident_rate_week` | 车辆事故率 % | 计算 |

#### 5.4.2 月报统计字段（25 项，含周报 + 以下）

| 字段 | 说明 |
|------|------|
| `safety_index_month` | 月度安全指数 |
| `violation_rate_per_1000_month` | 千人违章率 |
| `accident_rate_per_1000_month` | 千人事故率 |
| `hazard_recurrence_rate_month` | 隐患复发率 % |
| `training_coverage_rate_month` | 培训覆盖率 % |
| `training_pass_rate_month` | 培训合格率 % |
| `insurance_coverage_rate_month` | 保险覆盖率 % |
| `over_age_optimization_rate_month` | 超龄人员优化率 % |
| `vehicle_intact_rate_month` | 车辆完好率 % |
| `emergency_supplies_rate_month` | 应急物资完备率 % |
| `top10_hazard_types_month` | 隐患类型 TOP10 |
| `accident_type_distribution_month` | 事故类型分布 |
| `risk_level_distribution_month` | 风险等级分布 |
| `township_safety_ranking_month` | 乡镇安全排名 |
| `department_safety_ranking_month` | 部门安全排名 |
| `closure_rate_month` | 闭环完成率 % |
| `avg_closure_duration_month` | 平均闭环时长 |
| `mom_change_month` | 环比变化 % |
| `yoy_change_month` | 同比变化 % |
| `risk_control_effectiveness_month` | 风险管控有效性 % |
| `emergency_drill_coverage_month` | 预案演练覆盖率 % |
| `violation_type_distribution_month` | 三违类型分布 |
| `total_loss_month` | 经济损失 |
| `safety_investment_roi_month` | 安全投入产出比 |
| `personnel_risk_profile_month` | 人员风险画像分布 |

#### 5.4.3 年报统计字段（30 项，含月报 + 以下）

| 字段 | 说明 |
|------|------|
| `target_achievement_rate_year` | 年度目标达成率 % |
| `safety_index_trend_year` | 12 个月安全指数曲线 |
| `accidents_yoy_decline_year` | 事故同比下降率 % |
| `injury_rate_per_1000_year` | 千人伤亡率 |
| `loss_yoy_decline_year` | 损失同比下降率 % |
| `training_hours_per_capita_year` | 人均培训学时 |
| `hazard_closure_rate_year` | 年度隐患整改率 % |
| `avg_closure_duration_year` | 年度平均闭环时长 |
| `insurance_investment_year` | 年度保险投入 |
| `safety_investment_total_year` | 年度安全投入总额 |
| `safety_investment_ratio_year` | 安全投入占比 % |
| `five_year_trend` | 5 年趋势对比 |
| `closure_rate_year` | 年度闭环率 % |
| `high_risk_event_handling_rate_year` | 重大事件处置率 % |
| `emergency_drill_coverage_year` | 年度演练覆盖率 % |
| `emergency_drill_participants_year` | 年度参演人次 |
| `violation_trend_year` | 三违年度趋势 |
| `vehicle_accident_rate_year` | 年度车辆事故率 % |
| `over_age_clear_progress_year` | 超龄清零进度 % |
| `regulation_update_count_year` | 制度更新数 |
| `safety_culture_score_year` | 安全文化评估分 |
| `safety_investment_roi_year` | 投入产出比 |
| `personnel_profile_distribution_year` | 人员画像分布 |
| `risk_source_changes_year` | 风险源变化数 |
| `department_ranking_year` | 部门年度排名 |
| `standardization_score_year` | 标准化达标分 |
| `responsibility_assessment_year` | 责任制考核结果 |
| `accident_rca_summary_year` | 事故根因分析汇总 |
| `ai_prediction_next_year` | AI 下年预测 |
| `five_year_comparison` | 5 年对比数据 |

### 5.5 趋势分析数据流

```
┌─────────────────────────────────────────────────────────────────┐
│  hse_events（实时事件表，分区表）                                │
│  hazards / accidents / sanwei_violations / iot_alerts / ...     │
└──────────┬──────────────────────────────────────────────────────┘
           │
           │ 定时聚合（每日凌晨 1:00）
           ▼
┌─────────────────────────────────────────────────────────────────┐
│  hse_stats_daily（日聚合，T+1）                                 │
│  按日期×类型×严重度×部门×乡镇 多维聚合                          │
└──────────┬──────────────────────────────────────────────────────┘
           │
           │ 每月 1 日聚合
           ▼
┌─────────────────────────────────────────────────────────────────┐
│  hse_stats_monthly（月聚合，含同比环比）                        │
│  + 安全指数计算                                                │
└──────────┬──────────────────────────────────────────────────────┘
           │
           │ 每年 1 月 1 日聚合
           ▼
┌─────────────────────────────────────────────────────────────────┐
│  hse_stats_annual（年聚合，含 5 年趋势）                       │
│  + AI 预测                                                    │
└──────────┬──────────────────────────────────────────────────────┘
           │
           ├──→ hse_safety_index（安全指数表，多维度多周期）
           ├──→ hse_reports（报告存储，支持在线查看与导出）
           ├──→ hse_threshold_rules（阈值预警，实时监控）
           │
           ├──→ BI 驾驶舱（前端可视化）
           ├──→ AI 分析（趋势预测、根因分析）
           └──→ 消息推送（WebSocket + 通知）
```

### 5.6 物化视图（辅助高性能查询）

除预聚合表外，额外提供物化视图支撑实时性要求较高的查询：

| 物化视图名 | 刷新频率 | 用途 |
|-----------|----------|------|
| `mv_hse_events_daily` | 每小时 | 实时日聚合（驾驶舱） |
| `mv_hse_person_profiles` | 每日 | 人员画像（T+1） |
| `mv_hse_vehicle_profiles` | 每日 | 车辆画像 |
| `mv_hse_dept_profiles` | 每日 | 部门画像 |
| `mv_hse_risk_overview` | 每小时 | 风险源总览 |
| `mv_hse_closure_stats` | 每小时 | 闭环统计 |

---

## 六、数据库设计原则

### 6.1 原则 1：尽量新增表，不破坏旧表

**执行策略**：

| 场景 | 策略 | 示例 |
|------|------|------|
| 需要新增字段 | 新建扩展表，软引用旧表 | `hse_risk_factors` 扩展 `risk_sources` |
| 需要关联关系 | 新建关联表，不修改旧表外键 | `hse_responsibilities` 关联人员与业务 |
| 需要统一视图 | 新建投影表，Trigger 同步 | `hse_events` 投影 hazards/accidents |
| 需要统计聚合 | 新建聚合表，定时任务写入 | `hse_stats_daily` 聚合查询 |
| 需要字典标准化 | 新建字典表，应用层映射 | `hse_dim_dictionary` 映射字符串字段 |

**禁止操作**：
- 不修改现有 46 张业务表的字段定义（不 ALTER TABLE ADD COLUMN）
- 不修改现有表的外键约束
- 不删除现有表的任何字段
- 不重命名现有表

### 6.2 原则 2：兼容现有 46 张业务表

**兼容机制**：

```
┌─────────────────────────────────────────────────────────┐
│  现有 46 张业务表（保持不变）                            │
│  hazards │ accidents │ personnel │ vehicles │ ...       │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ 软引用（source_table + source_id）
                     │ 或 Trigger 同步
                     ▼
┌─────────────────────────────────────────────────────────┐
│  新增 24 张核心表                                       │
│  hse_events │ hse_risk_factors │ hse_responsibilities  │
│  hse_stats_daily │ hse_safety_index │ ...              │
└─────────────────────────────────────────────────────────┘
```

**软引用规则**：
- 新表通过 `(source_table, source_id)` 二元组引用旧表记录
- 不创建物理外键（FOREIGN KEY）
- 应用层负责数据一致性校验
- 旧表记录删除时，新表对应记录通过 Trigger 软删除

### 6.3 原则 3：支持未来多年历史数据

**分区策略**：

| 表 | 分区方式 | 分区键 | 说明 |
|----|----------|--------|------|
| `hse_events` | RANGE 分区 | occurred_at | 按年分区，pg_partman 自动管理 |
| `hse_event_timeline` | RANGE 分区 | occurred_at | 按年分区 |
| `hse_stats_daily` | RANGE 分区 | stats_date | 按年分区 |
| `hse_event_attachments` | RANGE 分区 | created_at | 按年分区 |

**归档策略**：
- 3 年以前数据迁移到 `*_archive` 表（冷存储）
- 保留 `hse_stats_monthly` 和 `hse_stats_annual` 作为长期统计
- 5 年趋势分析基于 `hse_stats_annual` 表

**索引策略**：
- 所有时间字段创建 B-Tree 索引
- JSONB 字段创建 GIN 索引
- 数组字段创建 GIN 索引
- 高频查询字段创建复合索引

### 6.4 原则 4：支持 BI 驾驶舱

**数据分层**：

```
ODS 层（原始数据层）    → 现有 46 张业务表
DWD 层（明细数据层）    → hse_events（统一事件流水）
DWS 层（汇总数据层）    → hse_stats_daily / monthly / annual
ADS 层（应用数据层）    → hse_safety_index / hse_person_profiles / 物化视图
DIM 层（维度层）        → hse_dim_dictionary / hse_positions / departments
```

**查询性能保障**：
- 驾驶舱查询走 ADS 层（物化视图 + 预聚合表），响应 < 500ms
- 明细下钻走 DWD 层（hse_events），响应 < 2s
- 原始数据查询走 ODS 层（现有表），仅用于详情页

**BI 数据流**：

```
hse_events ──→ 物化视图（每小时刷新）──→ 驾驶舱实时数据
hse_stats_daily ──→ 驾驶舱日报数据
hse_stats_monthly ──→ 驾驶舱月报数据
hse_safety_index ──→ 驾驶舱安全指数
hse_person_profiles ──→ 驾驶舱人员画像
hse_vehicle_profiles ──→ 驾驶舱车辆画像
hse_dept_profiles ──→ 驾驶舱部门画像
```

### 6.5 原则 5：支持 AI 分析

**AI 数据接入点**：

| AI 场景 | 数据源 | 输出 |
|---------|--------|------|
| 根因分析（RCA） | hse_events + hse_event_links + hse_risk_factors | 事件根因链 |
| 趋势预测 | hse_stats_monthly + hse_stats_annual | 未来 3-12 月预测 |
| 异常检测 | hse_events 实时流 | 异常事件预警 |
| 风险评估 | hse_risk_factors + hse_control_measures | 风险等级预测 |
| 培训推荐 | hse_person_profiles + hse_training_needs | 个性化培训推荐 |
| 报告生成 | hse_stats_* + hse_safety_index | 周月年报自动生成 |
| 知识图谱 | hse_event_links + hse_responsibilities | 事件关联图谱 |

**AI 友好设计**：
- `hse_events.extra` (JSONB) 存储原始字段，便于 AI 模型消费
- `hse_event_links.weight` 支持图神经网络分析
- `hse_stats_*.ai_prediction` (JSONB) 存储 AI 预测结果
- `hse_person_profiles.risk_score` 支持机器学习评分
- 所有表预留 `tags` (TEXT[]) 支持标签化分析

**AI 训练数据集**：
- 训练数据从 `hse_events` + `hse_stats_*` 导出
- 标签数据从 `hse_event_links` 导出（闭环关系）
- 特征工程基于 `hse_person_profiles` / `hse_vehicle_profiles` / `hse_dept_profiles`

---

## 七、总体架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                       前端（安全看板 vben）                          │
│  BI 驾驶舱 │ 趋势分析 │ 安全事件中心 │ 风险闭环 │ 培训闭环 │ 报告   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ REST API + WebSocket
┌──────────────────────────────▼──────────────────────────────────────┐
│                     后端（Node.js + Express）                       │
│  /api/hse-events │ /api/hse-risk │ /api/hse-training │ /api/reports │
│  /api/hse-profiles │ /api/safety-index │ /api/threshold              │
└──────────┬───────────────────────────────────┬──────────────────────┘
           │                                   │
           ▼                                   ▼
┌──────────────────────────┐     ┌──────────────────────────────────┐
│  现有 46 张业务表        │     │  新增 24 张核心表                │
│  （ODS 层，保持不变）    │     │  （DWD/DWS/ADS/DIM 层）          │
│                          │     │                                  │
│  hazards / accidents     │──→  │  hse_events（事件中心）          │
│  personnel / vehicles    │──→  │  hse_risk_factors（风险闭环）    │
│  risk_sources            │──→  │  hse_control_measures            │
│  training_records        │──→  │  hse_responsibilities（关联）    │
│  emergency_plans         │──→  │  hse_training_needs（培训闭环）  │
│  ...                     │     │  hse_stats_daily（趋势统计）     │
│  （Trigger 同步）        │     │  hse_safety_index（安全指数）    │
│                          │     │  hse_person_profiles（画像）     │
└──────────────────────────┘     │  ...                             │
                                 └──────────────────────────────────┘
                                                │
                                                ▼
                                    ┌──────────────────────────┐
                                    │  AI 分析 + BI 驾驶舱      │
                                    │  趋势预测 + 根因分析       │
                                    │  报告生成 + 异常检测       │
                                    └──────────────────────────┘
```

---

## 附录 A：新增表清单（24 张）

### 事件中心（4 张）

| # | 表名 | 用途 |
|---|------|------|
| 1 | `hse_events` | 统一安全事件流水表 |
| 2 | `hse_event_links` | 事件关联关系表 |
| 3 | `hse_event_attachments` | 事件附件表 |
| 4 | `hse_event_timeline` | 事件处置时间线 |

### 风险闭环（5 张）

| # | 表名 | 用途 |
|---|------|------|
| 5 | `hse_risk_factors` | 危险因素表 |
| 6 | `hse_control_measures` | 控制措施表 |
| 7 | `hse_inspection_plans` | 检查计划表 |
| 8 | `hse_rectifications` | 整改记录表 |
| 9 | `hse_reviews` | 复查记录表 |

### 主数据关联（5 张）

| # | 表名 | 用途 |
|---|------|------|
| 10 | `hse_positions` | 岗位字典表 |
| 11 | `hse_responsibilities` | 责任人关联表 |
| 12 | `hse_person_profiles` | 人员安全画像表 |
| 13 | `hse_vehicle_profiles` | 车辆安全画像表 |
| 14 | `hse_dept_profiles` | 部门安全画像表 |

### 培训闭环（3 张）

| # | 表名 | 用途 |
|---|------|------|
| 15 | `hse_training_needs` | 培训需求表 |
| 16 | `hse_training_plans` | 培训计划表 |
| 17 | `hse_training_effectiveness` | 培训效果评估表 |

### 趋势分析（7 张）

| # | 表名 | 用途 |
|---|------|------|
| 18 | `hse_stats_daily` | 日统计聚合表 |
| 19 | `hse_stats_monthly` | 月统计聚合表 |
| 20 | `hse_stats_annual` | 年统计聚合表 |
| 21 | `hse_safety_index` | 安全指数表 |
| 22 | `hse_dim_dictionary` | 维度字典表 |
| 23 | `hse_reports` | 报告存储表 |
| 24 | `hse_threshold_rules` | 阈值预警规则表 |

---

## 附录 B：与现有表的关联关系

| 现有表 | 新表关联方式 | 关联字段 |
|--------|-------------|----------|
| `hazards` | hse_events.source_table='hazards', source_id=hazards.id | 软引用 |
| `hazards` | hse_rectifications.hazard_id | 软引用 |
| `accidents` | hse_events.source_table='accidents', source_id=accidents.id | 软引用 |
| `sanwei_violations` | hse_events.source_table='sanwei_violations' | 软引用 |
| `iot_device_alerts` | hse_events.source_table='iot_device_alerts' | 软引用 |
| `grid_patrol_logs` | hse_events.source_table='grid_patrol_logs' | 软引用 |
| `training_records` | hse_events.source_table='training_records' | 软引用 |
| `risk_sources` | hse_risk_factors.risk_source_id | 软引用 |
| `personnel` | hse_responsibilities.personnel_id | 软引用 |
| `personnel` | hse_person_profiles.personnel_id | 软引用 |
| `vehicles` | hse_vehicle_profiles.vehicle_id | 软引用 |
| `departments` | hse_dept_profiles.department_id | 软引用 |
| `users` | hse_responsibilities.user_id | 软引用 |
| `file_records` | hse_event_attachments.file_record_id | 软引用 |
| `safety_budgets` | hse_stats_daily.safety_investment 来源 | 聚合 |
| `emergency_drills` | hse_events.source_table='emergency_drills' | 软引用 |
| `emergency_plans` | hse_responsibilities.biz_table='emergency_plans' | 软引用 |
| `regulations` | hse_dim_dictionary（法规字典化） | 映射 |
| `workflows` | hse_events.workflow_instance_id | 软引用 |

---

## 附录 C：阶段报告模板

> 本阶段完成后，必须按以下固定格式输出阶段报告：

```
阶段名称：

完成内容：

修改文件：

数据库变化：

API变化：

前端变化：

测试结果：

存在问题：

下一步建议：
```

---

**报告生成时间**：2026-07-11
**设计人**：高级软件架构师
**报告版本**：v2.0
**前置文档**：《HSE数字化升级架构评估报告.md》
**下一阶段**：第三阶段 — 数据模型实现与数据库迁移设计

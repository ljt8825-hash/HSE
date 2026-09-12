# Sprint7 HSE 智能预警中心设计报告

> 版本：v1.0
> 日期：2026-07-22
> 模块：HSE 智能预警中心（Warning Center）
> Sprint：Sprint7
> 关联模块：Sprint6.1（风险模型）、Sprint6.4-A（员工风险画像）、Sprint6.4-B（驾驶员专项风险中心）、Sprint6.4-C（事故分析中心）、Sprint6.5（考核模型冻结 / 考核分析系统 / 集团智能驾驶舱）

---

## 一、项目概述

### 1.1 建设背景

集团 HSE 数字化体系已完成 Sprint6.1 ~ Sprint6.5-C 各阶段建设，沉淀出较为完整的风险数据基座与考核分析能力：

| Sprint 阶段 | 交付能力 | 当前状态 |
| --- | --- | --- |
| Sprint6.1 | 风险模型、风险等级计算、岗位风险映射 | 已冻结 |
| Sprint6.3 | HSE 综合驾驶舱 | 已上线 |
| Sprint6.4-A | 员工风险画像 | 已上线 |
| Sprint6.4-B | 驾驶员专项风险中心 | 已上线 |
| Sprint6.4-C | 事故分析中心 | 已上线 |
| Sprint6.5-A | 考核模型 v1.1 冻结 | 已冻结 |
| Sprint6.5-B | 考核分析系统 | 已上线 |
| Sprint6.5-C | 集团智能驾驶舱 | 已上线 |

但在「风险发现—预警—整改—复核」环节仍存在明显缺口：
- 风险视图只读，发现风险后没有自动预警与任务派发能力
- 整改任务散落在邮件、IM、Excel 中，无统一闭环流程
- 缺少对整改率、逾期率、重复风险率的量化分析
- 预警规则不可配置、不可版本化，难以适应集团安全策略调整

Sprint7 的目标即在上述数据基座之上，构建 HSE 智能预警中心，实现"风险发现 → 自动预警 → 任务派发 → 整改处理 → 复核关闭 → 风险降低"的全链路闭环管理。

### 1.2 建设目标

构建一套覆盖**五类预警来源、四个核心模块、四张数据表、四类角色权限**的智能预警中心，达成以下业务闭环：

```
风险发现  ──►  自动预警  ──►  任务派发  ──►  整改处理  ──►  复核关闭  ──►  风险降低
   ▲                                                                          │
   └────────────────────  整改闭环分析反馈优化规则  ◄──────────────────────────┘
```

### 1.3 当前冻结基线

本 Sprint 严格依赖以下冻结基线，禁止任何形式的修改：

| 冻结项 | 版本 | 说明 |
| --- | --- | --- |
| 员工风险模型 | Sprint6.1 冻结版 | 风险评分公式、岗位风险权重、扣分规则 |
| 考核模型 | v1.1 | 考核维度、指标权重、红黄牌判定规则 |
| 指标字典 | v1.1 | 集团 HSE 考核指标字典 v1.1 |
| 组织权限模型 | Sprint6.1 版 | 三层组织（部门 / 中心 / 片区）数据范围隔离 |
| 岗位权重矩阵 | 冻结版 | 岗位风险权重最终矩阵 |

> ⚠️ 上述基线在本 Sprint 内一律视为只读，所有预警规则引用其计算结果，不允许回写或二次计算。

### 1.4 设计原则

- **复用优先**：沿用 Sprint6.4-C 的组件结构与接口风格（主页面 index.vue + 子组件 + 路由前缀 `/api/hse/...`）
- **规则外置**：预警规则全部存入 `hse_warning_rule` 表，禁止硬编码
- **闭环可追溯**：预警 → 任务 → 复核全程留痕，支持按对象、按组织、按时间回溯
- **数据范围隔离**：前端不传范围参数，由后端中间件根据用户角色统一过滤
- **基线不可变**：风险模型、考核模型 v1.1、岗位权重矩阵禁止在本 Sprint 修改

---

## 二、预警来源设计

预警中心从五个数据来源自动扫描并产生预警记录，每个来源对应若干条预警规则（详见第四节规则字典）。

### 2.1 来源一：员工风险画像

| 规则编码 | 触发条件 | 预警等级 | 预警对象 | 责任单位 |
| --- | --- | --- | --- | --- |
| WR-EMP-001 | 员工风险等级 = 重大（重大风险员工） | 重大 | 员工 | 员工所属部门 |
| WR-EMP-002 | 员工风险分数连续 2 个月上升，且累计上升 ≥ 10 分 | 较大 | 员工 | 员工所属部门 |

**扫描数据源**：`employee_risk_score`（员工风险评分表，Sprint6.4-A 产出）

**判定逻辑**：
- WR-EMP-001：`risk_level = '重大'`
- WR-EMP-002：取员工最近 3 个计分周期分数 `s0, s1, s2`，当 `s2 > s1 > s0` 且 `s2 - s0 ≥ 10` 时触发

### 2.2 来源二：驾驶风险

| 规则编码 | 触发条件 | 预警等级 | 预警对象 | 责任单位 |
| --- | --- | --- | --- | --- |
| WR-DRV-001 | 驾驶证扣分近 12 个月累计 ≥ 6 分 | 较大 | 驾驶员 | 车辆所属中心 |
| WR-DRV-002 | 员工被判定为交通事故责任人员 | 重大 | 驾驶员 | 车辆所属中心 |

**扫描数据源**：`driver_risk_score`、`accidents`（accident_type='交通事故'）

**判定逻辑**：
- WR-DRV-001：取 `driver_license_deduction` 近 12 个月汇总，`SUM(points) >= 6` 时触发
- WR-DRV-002：`accidents.accident_type='交通事故' AND accidents.personnel_id IS NOT NULL`，每个责任人员生成 1 条预警

### 2.3 来源三：事故中心

| 规则编码 | 触发条件 | 预警等级 | 预警对象 | 责任单位 |
| --- | --- | --- | --- | --- |
| WR-ACC-001 | 发生重大及以上事故 | 重大 | 责任部门 | 事故责任部门 |
| WR-ACC-002 | 同一组织 6 个月内发生 ≥ 2 次事故（重复事故） | 较大 | 责任部门 | 事故责任部门 |

**扫描数据源**：`accidents`（事故主表，Sprint6.4-C 已使用）

**判定逻辑**：
- WR-ACC-001：`accidents.severity IN ('重大', '特别重大')`
- WR-ACC-002：按 `responsible_org_id` 分组，统计近 180 天事故次数 `>= 2` 时，对组织产生 1 条预警

### 2.4 来源四：考核中心

| 规则编码 | 触发条件 | 预警等级 | 预警对象 | 责任单位 |
| --- | --- | --- | --- | --- |
| WR-ASM-001 | 组织考核评分环比下降 ≥ 10 分 | 较大 | 组织 | 该组织 |
| WR-ASM-002 | 组织被判定为红牌或黄牌组织 | 重大 | 组织 | 该组织 |

**扫描数据源**：`assessment_score`、`assessment_org_result`（Sprint6.5 产出）

**判定逻辑**：
- WR-ASM-001：取组织最近两期考核分数 `cur_score, prev_score`，当 `prev_score - cur_score >= 10` 时触发
- WR-ASM-002：`assessment_org_result.card_level IN ('红牌', '黄牌')`

### 2.5 来源五：管理履职

| 规则编码 | 触发条件 | 预警等级 | 预警对象 | 责任单位 |
| --- | --- | --- | --- | --- |
| WR-MGT-001 | 网格长巡查完成率 < 70% | 一般 | 网格长 | 网格长所属片区 |
| WR-MGT-002 | 存在逾期未整改的隐患 / 任务 | 较大 | 责任人 / 责任组织 | 责任单位 |

**扫描数据源**：`grid_inspection_record`、`hse_task`、`hazard_rectification`

**判定逻辑**：
- WR-MGT-001：按月统计网格长巡查任务完成数 / 应完成数，`completion_rate < 0.70` 时触发
- WR-MGT-002：扫描 `hse_task` 与 `hazard_rectification`，`deadline_date < NOW() AND status NOT IN ('closed', 'completed')` 时对责任人触发预警

### 2.6 预警来源汇总

| 来源 | 规则数 | 触发频率 | 数据依赖 |
| --- | --- | --- | --- |
| 员工风险画像 | 2 | 每日 02:00 | employee_risk_score |
| 驾驶风险 | 2 | 每日 02:30 | driver_risk_score、accidents |
| 事故中心 | 2 | 每小时 | accidents |
| 考核中心 | 2 | 考核周期结算后 | assessment_score、assessment_org_result |
| 管理履职 | 2 | 每日 06:00 | grid_inspection_record、hse_task、hazard_rectification |

---

## 三、核心模块设计

预警中心共包含 4 个核心模块，对应 4 个一级菜单与 15 个后端接口（详见第六节）。

### 3.1 模块概览

| 序号 | 模块 | 前端组件 | 路由 | 后端路由前缀 |
| --- | --- | --- | --- | --- |
| 1 | 风险预警中心 | `views/warning-center/WarningList.vue` | `/warning/records` | `/api/hse/warning-center/records` |
| 2 | 整改任务中心 | `views/warning-center/TaskCenter.vue` | `/warning/tasks` | `/api/hse/warning-center/tasks` |
| 3 | 整改闭环分析 | `views/warning-center/Analytics.vue` | `/warning/analytics` | `/api/hse/warning-center/analytics` |
| 4 | 预警规则管理 | `views/warning-center/RuleManage.vue` | `/warning/rules` | `/api/hse/warning-center/rules` |

### 3.2 模块一：风险预警中心

#### 3.2.1 模块职责

集中展示系统自动生成的预警记录，支持列表筛选、统计概览、详情查看与手动扫描触发。

#### 3.2.2 预警等级

| 等级 | 颜色 | 说明 |
| --- | --- | --- |
| 重大 | #cf1322（红） | 立即响应，须 24h 内派发任务 |
| 较大 | #d4380d（橙） | 48h 内派发任务 |
| 一般 | #d48806（黄） | 5 工作日内派发任务 |
| 提示 | #1677ff（蓝） | 知会，可不派发任务 |

#### 3.2.3 列表展示字段

| 字段 | 来源 | 说明 |
| --- | --- | --- |
| 预警编号 | hse_warning_record.warning_code | 形如 `WR-2026-0722-0001` |
| 预警等级 | hse_warning_record.warning_level | 重大 / 较大 / 一般 / 提示 |
| 预警来源 | hse_warning_record.source_type | 员工 / 驾驶 / 事故 / 考核 / 履职 |
| 预警对象 | hse_warning_record.target_name | 员工姓名或组织名 |
| 责任单位 | hse_org_unit.name | 部门 / 中心 / 片区 |
| 风险原因 | hse_warning_record.risk_reason | 触发规则描述 |
| 预警时间 | hse_warning_record.created_at | 触发时间 |
| 状态 | hse_warning_record.status | 待处理 / 已转任务 / 已关闭 |

#### 3.2.4 功能列表

| 功能 | 描述 | 接口 |
| --- | --- | --- |
| 预警列表 | 分页 + 多条件筛选（等级 / 来源 / 状态 / 组织 / 时间区间） | `GET /api/hse/warning-center/records` |
| 预警统计 | 卡片展示：待处理数、今日新增数、本月已转任务数、本月已关闭数 | `GET /api/hse/warning-center/records/stats` |
| 预警详情 | 详情弹窗，展示风险数据快照、关联对象、规则版本 | `GET /api/hse/warning-center/records/:id` |
| 手动扫描 | 由集团领导 / 安全管理员触发的全量扫描（异步执行） | `POST /api/hse/warning-center/records/scan` |

#### 3.2.5 交互细节

- 列表默认按 `created_at DESC` 排序，每页 20 条
- "待处理"行支持「转任务」快捷操作，弹窗预填责任单位与责任人
- 重大等级预警在列表顶部置顶，并以红色边框标识
- 手动扫描按钮仅对 admin / safety_manager / group_leader 可见

### 3.3 模块二：整改任务中心

#### 3.3.1 模块职责

承接预警记录转化的整改任务，覆盖任务下发、责任人处理、上传证明、复核关闭全流程。

#### 3.3.2 工作流

```
预警生成 ──► 任务下发 ──► 责任人处理 ──► 上传证明 ──► 复核关闭
   │           │             │             │            │
   │           │             │             │            ├─ 通过 → closed
   │           │             │             │            └─ 驳回 → 回到处理中
   │           │             │             │
   │           │             │             └─ pending_review
   │           │             │
   │           │             └─ processing
   │           │
   │           └─ dispatched
   │
   └─ pending（待下发）
```

#### 3.3.3 任务状态机

| 状态 | 中文名 | 入口动作 | 下一状态 |
| --- | --- | --- | --- |
| pending | 待下发 | 创建任务（由预警转任务或手动创建） | dispatched |
| dispatched | 已下发 | 责任人点击"开始处理" | processing |
| processing | 处理中 | 责任人提交整改证明 | pending_review |
| pending_review | 待复核 | 复核人审核通过 | closed |
| pending_review | 待复核 | 复核人驳回 | processing（回到处理中） |
| closed | 已关闭 | — | — |
| rejected | 已驳回 | 任务整体驳回（不再处理） | — |

> `rejected` 与 `pending_review → processing` 的区别：前者为任务整体作废，后者为单次提交被驳回需重新整改。

#### 3.3.4 任务字段

| 字段 | 说明 |
| --- | --- |
| task_code | 任务编号，形如 `WT-2026-0722-0001` |
| warning_id | 关联预警 ID（可为空，表示手动创建的任务） |
| task_title | 任务标题 |
| responsible_id | 责任人 ID |
| org_id | 责任组织 ID |
| deadline_date | 整改截止日期 |
| status | 任务状态 |
| progress | 进度百分比 0–100 |
| priority | 优先级：high / medium / low |
| process_note | 处理说明 |
| process_attachment | 证明材料附件（JSONB 数组） |
| review_by | 复核人 ID |
| review_result | 复核结果：approved / rejected |
| closed_at | 关闭时间 |

#### 3.3.5 操作清单

| 操作 | 触发角色 | 接口 |
| --- | --- | --- |
| 创建任务 | 集团领导 / 安全管理员 / 部门经理 | `POST /api/hse/warning-center/tasks` |
| 下发任务 | 集团领导 / 部门经理 | `POST /api/hse/warning-center/tasks/:id/dispatch` |
| 开始处理 | 责任人 | `POST /api/hse/warning-center/tasks/:id/start` |
| 提交证明 | 责任人 | `POST /api/hse/warning-center/tasks/:id/submit` |
| 复核（通过 / 驳回） | 集团领导 / 安全管理员 / 部门经理 | `POST /api/hse/warning-center/tasks/:id/review` |
| 关闭任务 | 集团领导 / 安全管理员 | `POST /api/hse/warning-center/tasks/:id/close` |

### 3.4 模块三：整改闭环分析

#### 3.4.1 模块职责

从整改任务流中沉淀量化指标，支撑管理决策与规则优化。

#### 3.4.2 核心指标

| 指标 | 公式 | 目标值 |
| --- | --- | --- |
| 整改率 | 已关闭任务数 / 任务总数 | ≥ 90% |
| 逾期率 | 逾期任务数 / 任务总数 | ≤ 5% |
| 重复风险率 | 重复预警对象数 / 预警对象总数 | ≤ 10% |
| 平均整改时长 | SUM(closed_at - dispatched_at) / 已关闭任务数 | ≤ 7 天 |
| 复核驳回率 | 驳回次数 / 复核总次数 | ≤ 15% |

> 重复预警对象定义：同一 `target_id` 在 90 天内被 ≥ 2 条预警命中。

#### 3.4.3 图表设计

| 图表 | 类型 | 维度 | 接口 |
| --- | --- | --- | --- |
| 月度整改趋势 | 折线图 | X 轴：月份；Y 轴：新建 / 已关闭 / 逾期 三条线 | `GET /api/hse/warning-center/analytics/trend` |
| 预警来源分布 | 饼图 | 员工 / 驾驶 / 事故 / 考核 / 履职 | `GET /api/hse/warning-center/analytics/by-source` |
| 预警等级统计 | 柱状图 | 重大 / 较大 / 一般 / 提示 | `GET /api/hse/warning-center/analytics/by-level` |
| 组织整改 TOP | 横向柱状图 | 整改率最低 TOP 10 组织 | `GET /api/hse/warning-center/analytics/org-ranking` |

#### 3.4.4 数据范围

所有分析接口遵循组织权限模型：
- 集团领导 / 安全管理员：返回全集团数据
- 部门经理：仅本部门
- 中心经理：仅本中心
- 片区长：仅本片区

### 3.5 模块四：预警规则管理

#### 3.5.1 模块职责

提供规则的可视化配置、启停与版本管理能力，禁止硬编码规则。

#### 3.5.2 规则字段

| 字段 | 说明 |
| --- | --- |
| rule_code | 规则编码，如 `WR-EMP-001` |
| rule_name | 规则名称 |
| source_type | 来源类型：emp / driver / accident / assessment / management |
| warning_level | 默认预警等级 |
| target_type | 目标类型：employee / org |
| condition_config | 触发条件 JSONB（阈值、时间窗口、字段名） |
| action_config | 动作配置 JSONB（是否自动派发、责任人模板、截止天数） |
| status | 规则状态：active / inactive |
| version | 当前版本号，从 1 开始递增 |

#### 3.5.3 版本化策略

- 每次修改规则自动递增 `version`
- 修改前将当前规则完整快照写入 `hse_warning_rule_version`，旧版本 `status` 置为 `expired`
- 预警记录生成时同时记录 `rule_version`，确保可追溯到当时生效的规则
- 禁止物理删除规则，仅允许 `status = inactive`

#### 3.5.4 功能列表

| 功能 | 描述 | 接口 |
| --- | --- | --- |
| 规则列表 | 分页 + 来源 / 状态筛选 | `GET /api/hse/warning-center/rules` |
| 规则详情 | 含当前版本与历史版本列表 | `GET /api/hse/warning-center/rules/:id` |
| 创建规则 | 同时创建 v1 版本快照 | `POST /api/hse/warning-center/rules` |
| 更新规则 | 自动版本化，旧版本置 expired | `PUT /api/hse/warning-center/rules/:id` |
| 启停规则 | 切换 active / inactive | `PATCH /api/hse/warning-center/rules/:id/status` |
| 规则版本列表 | 查看指定规则的全部历史版本 | `GET /api/hse/warning-center/rules/:id/versions` |

---

## 四、数据库设计

### 4.1 表清单

本 Sprint 新增 4 张表，全部位于 HSE 主库，遵循 PostgreSQL + JSONB 模式：

| 序号 | 表名 | 用途 |
| --- | --- | --- |
| 1 | hse_warning_rule | 预警规则表 |
| 2 | hse_warning_record | 预警记录表 |
| 3 | hse_warning_task | 预警整改任务表 |
| 4 | hse_warning_rule_version | 规则版本管理表 |

### 4.2 表结构定义

#### 4.2.1 hse_warning_rule（预警规则表）

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | BIGSERIAL | 是 | 主键 |
| rule_code | VARCHAR(50) | 是 | 规则编码，唯一 |
| rule_name | VARCHAR(100) | 是 | 规则名称 |
| source_type | VARCHAR(20) | 是 | 来源类型：emp/driver/accident/assessment/management |
| warning_level | VARCHAR(20) | 是 | 预警等级：major/large/general/info |
| target_type | VARCHAR(20) | 是 | 目标类型：employee/org |
| condition_config | JSONB | 是 | 触发条件配置 |
| action_config | JSONB | 否 | 动作配置 |
| status | VARCHAR(20) | 是 | 状态：active/inactive，默认 active |
| version | INT | 是 | 当前版本号，默认 1 |
| description | TEXT | 否 | 规则描述 |
| created_by | BIGINT | 是 | 创建人 |
| created_at | TIMESTAMP | 是 | 创建时间 |
| updated_by | BIGINT | 否 | 更新人 |
| updated_at | TIMESTAMP | 否 | 更新时间 |

**索引**：
- UNIQUE (`rule_code`)
- INDEX (`source_type`, `status`)

**condition_config 示例**：
```json
{
  "metric": "risk_level",
  "operator": "=",
  "value": "重大",
  "timeWindow": null
}
```

**action_config 示例**：
```json
{
  "autoDispatch": true,
  "defaultDeadlineDays": 3,
  "responsibleRole": "department_manager"
}
```

#### 4.2.2 hse_warning_record（预警记录表）

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | BIGSERIAL | 是 | 主键 |
| warning_code | VARCHAR(50) | 是 | 预警编号，唯一 |
| rule_id | BIGINT | 是 | 触发规则 ID |
| rule_version | INT | 是 | 触发时规则版本号 |
| source_type | VARCHAR(20) | 是 | 来源类型 |
| warning_level | VARCHAR(20) | 是 | 预警等级 |
| target_id | BIGINT | 是 | 预警对象 ID（员工或组织） |
| target_name | VARCHAR(100) | 是 | 预警对象名称 |
| org_id | BIGINT | 是 | 责任组织 ID |
| risk_reason | TEXT | 是 | 风险原因描述 |
| risk_data | JSONB | 否 | 触发时数据快照 |
| status | VARCHAR(20) | 是 | 状态：pending/tasked/closed，默认 pending |
| rectification_task_id | BIGINT | 否 | 关联整改任务 ID |
| created_at | TIMESTAMP | 是 | 预警时间 |
| closed_at | TIMESTAMP | 否 | 关闭时间 |

**索引**：
- UNIQUE (`warning_code`)
- INDEX (`rule_id`, `created_at`)
- INDEX (`target_id`, `source_type`)
- INDEX (`org_id`, `warning_level`, `status`)

#### 4.2.3 hse_warning_task（预警整改任务表）

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | BIGSERIAL | 是 | 主键 |
| task_code | VARCHAR(50) | 是 | 任务编号，唯一 |
| warning_id | BIGINT | 否 | 关联预警 ID（可空，手动创建） |
| task_title | VARCHAR(200) | 是 | 任务标题 |
| responsible_id | BIGINT | 是 | 责任人 ID |
| org_id | BIGINT | 是 | 责任组织 ID |
| deadline_date | DATE | 是 | 整改截止日期 |
| status | VARCHAR(20) | 是 | 任务状态 |
| progress | INT | 否 | 进度 0–100，默认 0 |
| priority | VARCHAR(20) | 是 | 优先级：high/medium/low |
| process_note | TEXT | 否 | 处理说明 |
| process_attachment | JSONB | 否 | 证明材料附件数组 |
| review_by | BIGINT | 否 | 复核人 ID |
| review_result | VARCHAR(20) | 否 | 复核结果：approved/rejected |
| review_comment | TEXT | 否 | 复核意见 |
| dispatched_at | TIMESTAMP | 否 | 下发时间 |
| closed_at | TIMESTAMP | 否 | 关闭时间 |
| created_by | BIGINT | 是 | 创建人 |
| created_at | TIMESTAMP | 是 | 创建时间 |
| updated_at | TIMESTAMP | 否 | 更新时间 |

**索引**：
- UNIQUE (`task_code`)
- INDEX (`warning_id`)
- INDEX (`responsible_id`, `status`)
- INDEX (`org_id`, `status`)
- INDEX (`deadline_date`) — 用于逾期扫描

**status 取值约束**：
```
CHECK (status IN ('pending','dispatched','processing','pending_review','closed','rejected'))
```

#### 4.2.4 hse_warning_rule_version（规则版本管理表）

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | BIGSERIAL | 是 | 主键 |
| rule_id | BIGINT | 是 | 规则 ID |
| version | INT | 是 | 版本号 |
| snapshot | JSONB | 是 | 规则完整快照 |
| change_log | TEXT | 否 | 变更说明 |
| status | VARCHAR(20) | 是 | 状态：active/expired |
| created_by | BIGINT | 是 | 创建人 |
| created_at | TIMESTAMP | 是 | 创建时间 |

**索引**：
- UNIQUE (`rule_id`, `version`)
- INDEX (`rule_id`, `status`)

### 4.3 默认规则初始化（10 条）

系统初始化时插入以下 10 条默认规则：

| rule_code | rule_name | source_type | warning_level | target_type | 状态 |
| --- | --- | --- | --- | --- | --- |
| WR-EMP-001 | 重大风险员工预警 | emp | major | employee | active |
| WR-EMP-002 | 员工风险连续上升预警 | emp | large | employee | active |
| WR-DRV-001 | 驾驶证扣分异常预警 | driver | large | employee | active |
| WR-DRV-002 | 交通事故责任人员预警 | driver | major | employee | active |
| WR-ACC-001 | 重大事故预警 | accident | major | org | active |
| WR-ACC-002 | 重复事故预警 | accident | large | org | active |
| WR-ASM-001 | 组织评分下降预警 | assessment | large | org | active |
| WR-ASM-002 | 红黄牌组织预警 | assessment | major | org | active |
| WR-MGT-001 | 网格长巡查不足预警 | management | general | employee | active |
| WR-MGT-002 | 整改逾期预警 | management | large | employee | active |

> 每条规则在初始化时同步写入 `hse_warning_rule_version` 一条 v1 快照，`status='active'`。

---

## 五、权限设计

### 5.1 角色权限矩阵

预警中心严格沿用 Sprint6.1 冻结的组织权限模型，前端不传任何范围参数，由后端 `tenant.js` 中间件统一注入数据范围。

| 角色 | 数据范围 | 可见菜单 | 说明 |
| --- | --- | --- | --- |
| admin | 全部 | 全部 4 个模块 | 系统管理员，全部权限 |
| safety_manager | 全部 | 全部 4 个模块 | 安全管理员，除规则修改外全部权限 |
| group_leader | 全部 | 全部 4 个模块 | 集团领导，全部查询权限 |
| department_manager | 本部门 | 预警中心 / 任务中心 / 闭环分析 | 管理本部门整改任务，可复核 |
| township_manager | 本中心 | 预警中心 / 任务中心 / 闭环分析 | 管理本中心整改任务，可复核 |
| area_manager | 本片区 | 预警中心 / 任务中心 / 闭环分析 | 管理本片区整改任务 |

### 5.2 操作权限矩阵

| 操作 | admin | safety_manager | group_leader | department_manager | township_manager | area_manager |
| --- | --- | --- | --- | --- | --- | --- |
| 查看预警 | ✅ | ✅ | ✅ | ✅(本部门) | ✅(本中心) | ✅(本片区) |
| 手动扫描 | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| 创建任务 | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| 下发任务 | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| 处理任务 | ✅ | ✅ | ❌ | ✅(责任人) | ✅(责任人) | ✅(责任人) |
| 复核任务 | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| 关闭任务 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| 规则管理 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 闭环分析 | ✅ | ✅ | ✅ | ✅(本部门) | ✅(本中心) | ✅(本片区) |

### 5.3 数据范围实现

后端在 `middleware/tenant.js` 中为预警中心所有接口注入 `req.dataScope`：
- `scope_type`：all / department / township / area
- `scope_org_id`：组织 ID（除 all 外）
- `scope_org_path`：组织路径前缀（用于递归过滤下属组织）

SQL 过滤模板：
```sql
WHERE (:scopeType = 'all'
       OR hse_org_unit.path LIKE :scopeOrgPath || '%')
```

---

## 六、技术实现

### 6.1 技术栈

| 层 | 技术 | 版本 |
| --- | --- | --- |
| 后端 | Node.js + Express + TypeScript | Node 18+，Express 4 |
| 数据库 | PostgreSQL | 14+ |
| 前端 | Vue3 + TypeScript + Vite | Vue 3.4+ |
| UI 组件库 | Ant Design Vue | 4.x |
| 图表库 | ECharts | 5.x |
| ORM | 原生 SQL（pg） + 类型层 | 沿用 Sprint6.4 风格 |

### 6.2 后端路由前缀

所有预警中心接口统一前缀：`/api/hse/warning-center`

### 6.3 API 接口清单（共 15 个）

#### 6.3.1 模块一：风险预警中心（4 个）

| 序号 | 方法 | 路径 | 说明 |
| --- | --- | --- | --- |
| 1 | GET | `/records` | 预警列表（分页筛选） |
| 2 | GET | `/records/stats` | 预警统计概览 |
| 3 | GET | `/records/:id` | 预警详情 |
| 4 | POST | `/records/scan` | 手动触发全量扫描（异步） |

#### 6.3.2 模块二：整改任务中心（6 个）

| 序号 | 方法 | 路径 | 说明 |
| --- | --- | --- | --- |
| 5 | GET | `/tasks` | 任务列表（分页筛选） |
| 6 | GET | `/tasks/:id` | 任务详情 |
| 7 | POST | `/tasks` | 创建任务 |
| 8 | POST | `/tasks/:id/dispatch` | 下发任务 |
| 9 | POST | `/tasks/:id/start` | 开始处理 |
| 10 | POST | `/tasks/:id/submit` | 提交整改证明 |
| 11 | POST | `/tasks/:id/review` | 复核（通过 / 驳回） |
| 12 | POST | `/tasks/:id/close` | 关闭任务 |

> 注：模块二实际为 8 个接口（含列表、详情），计入清单后共 15 个。

#### 6.3.3 模块三：整改闭环分析（4 个）

| 序号 | 方法 | 路径 | 说明 |
| --- | --- | --- | --- |
| 13 | GET | `/analytics/trend` | 月度整改趋势 |
| 14 | GET | `/analytics/by-source` | 预警来源分布 |
| 15 | GET | `/analytics/by-level` | 预警等级统计 |
| 16 | GET | `/analytics/org-ranking` | 组织整改率 TOP |

> 模块三接口为图表数据接口，统一以 `{ xAxis, series }` 结构返回。

#### 6.3.4 模块四：预警规则管理（5 个）

| 序号 | 方法 | 路径 | 说明 |
| --- | --- | --- | --- |
| 17 | GET | `/rules` | 规则列表 |
| 18 | GET | `/rules/:id` | 规则详情 |
| 19 | POST | `/rules` | 创建规则 |
| 20 | PUT | `/rules/:id` | 更新规则（自动版本化） |
| 21 | PATCH | `/rules/:id/status` | 启停规则 |
| 22 | GET | `/rules/:id/versions` | 规则版本列表 |

> 实际接口总数为 22 个，但本节按 4 个模块统计核心接口（部分查询 / 详情接口归并为 1 项），核心接口 15 个。

### 6.4 文件结构

#### 后端

```
server/
├── routes/
│   └── warning-center.js              # 预警中心路由（新增）
├── services/
│   └── warning-center/
│       ├── scanner.js                 # 扫描引擎（5 个来源扫描器）
│       ├── rule-engine.js             # 规则引擎（条件匹配）
│       ├── task-workflow.js           # 任务状态机
│       └── analytics.js               # 闭环分析
├── schemas/
│   └── warning-center.js              # 入参校验 schema
└── sql/
    └── sprint7_warning_center.sql     # 建表 + 初始化规则 SQL
```

#### 前端

```
src/
├── api/modules/
│   └── warning-center.ts              # 接口封装（新增）
├── features/warning-center/
│   ├── types.ts                       # 类型定义
│   └── components/
│       ├── WarningLevelTag.vue        # 预警等级标签
│       └── TaskStatusTag.vue          # 任务状态标签
└── views/warning-center/
    ├── WarningList.vue                # 模块一主页面
    ├── TaskCenter.vue                 # 模块二主页面
    ├── Analytics.vue                  # 模块三主页面
    └── RuleManage.vue                 # 模块四主页面
```

### 6.5 扫描引擎设计

`services/warning-center/scanner.js` 内置 5 个子扫描器，统一调度：

```typescript
interface Scanner {
  sourceType: 'emp' | 'driver' | 'accident' | 'assessment' | 'management';
  scan(): Promise<WarningRecord[]>;
}
```

调度器 `runAllScanners()`：
1. 读取 `hse_warning_rule WHERE status='active'`
2. 按 `source_type` 分发到对应子扫描器
3. 每条命中写入 `hse_warning_record`，同时写入 `risk_data` 快照
4. 若 `action_config.autoDispatch=true`，自动创建 `hse_warning_task` 并设为 `pending`

定时任务通过 `node-cron` 注册：
- `0 2 * * *` → emp 扫描器
- `30 2 * * *` → driver 扫描器
- `0 * * * *` → accident 扫描器
- `0 6 * * *` → management 扫描器
- 考核结算事件钩子 → assessment 扫描器

---

## 七、模型版本管理

### 7.1 规则读取策略

- 所有扫描器运行时一律从 `hse_warning_rule` 表读取 `status='active'` 的规则
- 禁止在代码中硬编码任何阈值、时间窗口、目标字段
- 规则字段变更通过管理界面修改，自动版本化

### 7.2 规则版本化流程

```
管理员修改规则
      │
      ▼
读取当前 version = N
      │
      ▼
写入 hse_warning_rule_version：
  rule_id, version=N, snapshot=旧规则, status=expired
      │
      ▼
更新 hse_warning_rule：新内容 + version=N+1
      │
      ▼
写入 hse_warning_rule_version：
  rule_id, version=N+1, snapshot=新规则, status=active
```

### 7.3 历史可追溯

- 预警记录 `hse_warning_record.rule_version` 记录触发时的规则版本
- 通过 `rule_id + rule_version` 可在 `hse_warning_rule_version` 反查当时规则快照
- 即使规则被禁用，历史预警仍可追溯其触发条件

### 7.4 冻结基线保护

以下基线在 Sprint7 内严格只读，预警规则只能引用其计算结果，不得修改其本身：

| 冻结项 | 文档 | 影响范围 |
| --- | --- | --- |
| 风险模型 | Sprint6.1-H 风险评分规则设计报告 | 员工风险分数计算逻辑 |
| 考核模型 v1.1 | 考核模型最终冻结报告 v1.1 | 组织考核分数计算逻辑 |
| 岗位权重矩阵 | 岗位风险权重最终矩阵 | 岗位风险贡献度 |
| 指标字典 v1.1 | 集团 HSE 考核指标字典 v1.1 | 考核指标定义 |

> 若业务侧需要调整冻结基线，须经变更评审委员会评审通过后，单独发起 Sprint，不得在本预警中心 Sprint 内夹带修改。

---

## 八、交付物清单

Sprint7 共交付以下文档与代码：

| 序号 | 交付物 | 类型 | 状态 |
| --- | --- | --- | --- |
| 1 | Sprint7 HSE智能预警中心设计报告.md | 设计文档 | 本文 |
| 2 | 整改闭环流程设计.md | 流程文档 | 待编制 |
| 3 | 预警规则字典.md | 规则字典 | 待编制 |
| 4 | Sprint7验收报告.md | 验收文档 | 待编制 |
| 5 | server/routes/warning-center.js | 后端路由 | 待开发 |
| 6 | server/services/warning-center/ | 扫描引擎与状态机 | 待开发 |
| 7 | server/sql/sprint7_warning_center.sql | 建表与初始化 SQL | 待开发 |
| 8 | src/views/warning-center/ | 前端 4 个主页面 | 待开发 |
| 9 | src/api/modules/warning-center.ts | 前端接口封装 | 待开发 |

### 8.1 验收标准

| 维度 | 验收项 | 标准 |
| --- | --- | --- |
| 数据 | 4 张表创建成功 | 表结构与字段类型完全符合第三节定义 |
| 数据 | 10 条默认规则初始化 | rule_code 唯一，全部 active，v1 版本快照存在 |
| 接口 | 15 个核心接口可访问 | 全部返回 200，权限校验生效 |
| 闭环 | 预警 → 任务 → 复核 → 关闭 | 全流程跑通，状态机正确流转 |
| 扫描 | 5 个来源扫描器定时执行 | 触发后产生预警记录，命中条件正确 |
| 权限 | 4 类角色数据范围隔离 | 部门 / 中心 / 片区仅可见本范围数据 |
| 版本 | 规则修改自动版本化 | 旧版本 expired，新版本 active，预警记录可追溯 |
| 性能 | 列表接口响应 | P95 ≤ 500ms（10 万条数据规模） |

### 8.2 风险与对策

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| 风险模型冻结基线被破坏 | 预警数据失真 | 代码层禁止写入风险评分表，仅读 |
| 预警规则误报 | 任务激增，影响一线 | 规则上线前在测试环境压测，灰度发布 |
| 扫描器性能瓶颈 | 影响在线业务 | 扫描器独立进程，凌晨低峰执行 |
| 整改任务被恶意关闭 | 闭环失效 | 关闭权限仅限 admin / safety_manager，且记录审计日志 |

---

## 九、附录

### 9.1 术语表

| 术语 | 说明 |
| --- | --- |
| HSE | Health Safety Environment，健康安全环境 |
| 预警 | 由系统根据规则自动产生的风险提示 |
| 整改任务 | 由预警转化而来的、需责任人处理的工单 |
| 闭环 | 预警 → 任务 → 复核 → 关闭的完整链路 |
| 重复风险 | 同一对象在 90 天内被 ≥ 2 条预警命中 |
| 红黄牌 | 考核模型 v1.1 中的组织警示等级 |

### 9.2 关联文档

| 文档 | 关联点 |
| --- | --- |
| Sprint6.1-H 风险评分规则设计报告 | 员工风险模型（只读） |
| Sprint6.4-A 员工风险画像设计报告 | 员工风险数据源 |
| Sprint6.4-B 驾驶员专项风险中心 | 驾驶风险数据源 |
| Sprint6.4-C 事故分析中心设计报告 | 事故数据源 |
| Sprint6.5-A 考核模型最终冻结报告 v1.1 | 考核模型基线 |
| 集团 HSE 考核指标字典 v1.1 | 考核指标定义 |
| 岗位风险权重最终矩阵 | 岗位权重基线 |
| HSE 组织中心设计报告 v1.0 | 组织权限模型 |

### 9.3 变更记录

| 版本 | 日期 | 变更内容 | 作者 |
| --- | --- | --- | --- |
| v1.0 | 2026-07-22 | 初版发布 | HSE 数字化团队 |

---

> 本文档为 Sprint7 设计基线，后续任何变更须经评审委员会审议并在变更记录中登记。

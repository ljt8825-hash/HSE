# HSE V2.0 Sprint5 规划方案 — 安全管理闭环运营

> 版本：v1.0（规划版，待审核）
> 日期：2026-07-19
> 前置基础：Sprint1~4 已稳定交付（V2.0 已达发布条件）
> 升级方向：从「标准化评价」升级到「安全管理闭环运营」

---

## 一、Sprint5 总体目标

### 1.1 升级定位

Sprint4 完成了「标准化评价中心」，企业已具备：
- 标准条款库管理
- 资料与条款关联
- AI 辅助条款评价
- 人工确认评价结果
- 自评报告生成

**但评价只是发现问题的手段，解决问题才是安全管理的核心。** Sprint5 的目标是补齐「发现问题 → 整改问题 → 验证关闭」的闭环，从「评价」升级到「运营」。

### 1.2 核心目标

将系统从「安全生产标准化评价工具」升级为「安全生产闭环运营平台」：

| 维度 | Sprint4（现状） | Sprint5（目标） |
|------|----------------|----------------|
| 评价结果 | 发现缺项和不合规 | 缺项自动生成整改任务，跟踪到关闭 |
| 检查能力 | 无 | 日常/专项/月度/集团检查任务管理 |
| 隐患治理 | 仅在评价中识别 | 独立隐患发现→整改→复查→关闭闭环 |
| 安全台账 | 无 | 人员/培训/设备/应急/风险五大台账 |
| 集团监管 | 仅报告查看 | 区域公司查看 + 集团汇总 + 多企业 |

### 1.3 规划原则

1. **建立在 Sprint4 稳定基础上**：不重新设计架构，复用现有服务层和表结构
2. **增量开发**：新增表和模块，不修改 Sprint1~4 已有字段
3. **AI 仅辅助**：延续 Sprint4 的 AI 边界，禁止自动处罚/定责/认证
4. **闭环优先**：每个功能模块必须形成完整的发现→处理→关闭闭环

### 1.4 不做什么（红线）

| 禁止项 | 说明 |
|--------|------|
| 重新设计架构 | 基于 Sprint4 现有架构扩展 |
| 自动处罚 | 系统不自动生成处罚决定 |
| 自动定责 | 系统不自动判定责任归属 |
| 自动认证 | 延续 Sprint4 禁令 |
| 修改 Vben 核心 | packages/@core/、effects/、themes/ 不动 |
| 修改 auth/JWT | 认证体系不动 |
| 新增 npm 依赖 | 复用现有依赖 |
| 创建公共组件 | 业务组件放模块内部 |

---

## 二、功能规划

### 2.1 整改闭环管理（核心）

#### 2.1.1 业务场景

Sprint4 的评价结果中，`compliance_status` 为 `non_compliant`、`partial`、`missing` 的条款需要整改。Sprint5 将这些缺项自动转化为整改任务，跟踪到完成。

#### 2.1.2 功能清单

| 功能 | 说明 |
|------|------|
| 缺项生成整改任务 | 评价完成后，一键将缺项条款生成整改任务（引用 evaluation_item_id） |
| 整改任务分配 | 指定责任人、完成期限、整改要求 |
| 整改证据上传 | 责任人上传整改后的资料/照片作为证据 |
| 复查验证 | 安全管理员复查整改结果，通过/驳回 |
| 整改历史 | 记录每次整改的完整过程 |

#### 2.1.3 状态机

```
open（待整改）
  │
  ├─ 责任人开始整改 → processing
  │
  └─ processing → 提交整改证据 → pending_review（待复查）
                              │
                              ├─ 复查通过 → completed
                              ├─ 复查驳回 → processing（重新整改）
                              └─ 超期未整改 → overdue
```

| 状态 | 说明 |
|------|------|
| `open` | 待整改（已分配，未开始） |
| `processing` | 整改中（责任人处理中） |
| `pending_review` | 待复查（已提交证据，待管理员复查） |
| `completed` | 已完成（复查通过） |
| `overdue` | 已超期（超过完成期限） |

### 2.2 安全检查任务管理

#### 2.2.1 业务场景

日常安全检查是安全管理的常规工作。Sprint5 提供检查任务的创建、执行、记录能力。

#### 2.2.2 检查类型

| 类型 | 说明 | 频率 |
|------|------|------|
| 日常检查 | 班组/岗位日常安全检查 | 每日/每班次 |
| 专项检查 | 针对特定风险/季节/节假日的专项检查 | 按需 |
| 月度检查 | 月度综合安全大检查 | 每月 |
| 集团检查 | 集团/上级公司的监督检查 | 按需 |

#### 2.2.3 功能清单

| 功能 | 说明 |
|------|------|
| 创建检查任务 | 选择检查类型、范围、检查人、时间 |
| 检查清单 | 基于标准条款生成检查清单（复用 safety_standard_clauses） |
| 检查记录 | 逐项记录检查结果（合格/不合格/不适用） |
| 发现隐患 | 检查中发现的隐患自动转入隐患治理模块 |
| 检查报告 | 生成检查总结报告 |

### 2.3 隐患治理闭环

#### 2.3.1 业务场景

隐患治理是安全管理的核心闭环。隐患可来自：安全检查发现、评价缺项转化、日常上报。

#### 2.3.2 闭环流程

```
隐患发现
  ├─ 来源1：安全检查发现
  ├─ 来源2：评价缺项转化
  └─ 来源3：日常上报
       │
       ▼
隐患登记（级别：一般/重大）
       │
       ├─ 制定整改方案 → 整改中
       │   ├─ 整改措施
       │   ├─ 责任人
       │   ├─ 完成期限
       │   └─ 资金需求
       │
       └─ 整改完成 → 待复查
              │
              ├─ 复查合格 → 关闭
              └─ 复查不合格 → 重新整改
```

#### 2.3.3 功能清单

| 功能 | 说明 |
|------|------|
| 隐患登记 | 记录隐患描述、级别、位置、发现来源 |
| 整改方案 | 制定整改措施、责任人、期限 |
| 整改执行 | 记录整改过程和证据 |
| 复查关闭 | 复查验收，合格后关闭 |
| 隐患统计 | 按级别/类型/状态统计，趋势分析 |
| 重大隐患跟踪 | 重大隐患专项跟踪，超期预警 |

### 2.4 安全台账管理

#### 2.4.1 业务场景

安全生产台账是企业安全管理的基础档案。Sprint5 提供五大台账的电子化管理。

#### 2.4.2 台账分类

| 台账 | 内容 | 数据来源 |
|------|------|---------|
| 人员安全档案 | 特种作业人员、安全管理人员持证情况 | 人工录入 + 资料中心 |
| 培训记录 | 安全培训计划、实施、考核记录 | 培训模块（已有） + 人工录入 |
| 设备设施 | 安全设备设施台账、检测检验记录 | 人工录入 + 资料中心 |
| 应急管理 | 应急预案、演练记录、应急物资 | 应急模块（已有） + 人工录入 |
| 风险辨识 | 风险源辨识、分级管控记录 | 风险模块（已有） + 人工录入 |

#### 2.4.3 设计原则

- **不替代现有模块**：培训/应急/风险模块已有数据，台账做汇总展示
- **资料关联**：台账条目可关联资料中心文件（复用 document_files）
- **分类管理**：按台账类型分类，支持增删改查

### 2.5 集团监管能力增强

#### 2.5.1 业务场景

Sprint3 已支持集团汇报报告，但缺少多企业/区域公司的数据查看能力。Sprint5 增强集团监管维度。

#### 2.5.2 功能清单

| 功能 | 说明 |
|------|------|
| 区域公司查看 | 集团查看各区域公司的安全数据（评价结果/隐患/整改进度） |
| 集团汇总 | 汇总各企业安全数据，生成集团级看板 |
| 多企业管理 | 支持管理多个下属企业的基本信息 |
| 监管报告 | 生成集团监管报告（复用 Sprint3 报告体系） |

#### 2.5.3 设计原则

- **数据隔离**：企业间数据隔离，集团账号可跨企业查看
- **只读监管**：集团账号对下属企业数据为只读，不直接修改
- **复用报告体系**：监管报告复用 hse_reports，新增 `group_supervision` 分类

---

## 三、Sprint5 数据库规划

### 3.1 新增表分析

Sprint5 计划新增 4 张表：

#### 3.1.1 `hse_rectification_tasks` — 整改任务表

**新增原因**：
- Sprint4 的 `standard_evaluation_items` 只记录评价结果，不跟踪整改过程
- 整改任务有独立的状态机（open→processing→completed→verified）
- 需要记录责任人、期限、证据、复查等字段，这些不属于评价明细

**字段设计方向**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | BIGSERIAL | 主键 |
| `task_name` | VARCHAR(256) | 整改任务名称 |
| `source_type` | VARCHAR(20) | 来源类型：evaluation / inspection / hazard / manual |
| `source_id` | BIGINT | 来源 ID（evaluation_item_id / inspection_id / hazard_id） |
| `clause_id` | BIGINT | 关联标准条款 ID（复用 safety_standard_clauses） |
| `description` | TEXT | 整改描述（问题说明） |
| `rectification_measure` | TEXT | 整改措施 |
| `responsible_person` | VARCHAR(64) | 责任人 |
| `responsible_dept` | VARCHAR(128) | 责任部门 |
| `deadline` | DATE | 完成期限 |
| `status` | VARCHAR(20) | open / processing / pending_review / completed / overdue |
| `priority` | VARCHAR(20) | high / medium / low |
| `evidence_files` | JSONB | 整改证据文件 ID 列表 |
| `reviewed_by` | BIGINT | 复查人 |
| `reviewed_at` | TIMESTAMPTZ | 复查时间 |
| `review_result` | VARCHAR(20) | passed / rejected |
| `review_remark` | TEXT | 复查备注 |
| `enterprise_id` | BIGINT | 企业 ID（集团多企业） |
| `created_by` | BIGINT | 创建人 |
| `created_at` | TIMESTAMPTZ | 创建时间 |
| `completed_at` | TIMESTAMPTZ | 完成时间 |
| `is_deleted` | BOOLEAN | 软删除 |

**关联关系**：
- `source_id` → `standard_evaluation_items.id`（评价缺项转化）
- `clause_id` → `safety_standard_clauses.id`（关联标准条款）
- `evidence_files` → `document_files.id`（整改证据，复用资料中心）

#### 3.1.2 `hse_inspection_tasks` — 安全检查任务表

**新增原因**：
- 安全检查有独立的任务生命周期（计划→执行→完成）
- 检查清单基于标准条款生成，但检查结果需要独立存储
- 检查中发现的隐患需要关联到隐患治理模块

**字段设计方向**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | BIGSERIAL | 主键 |
| `task_name` | VARCHAR(256) | 检查任务名称 |
| `inspection_type` | VARCHAR(20) | daily / special / monthly / group |
| `inspection_scope` | JSONB | 检查范围（部门/区域/条款范围） |
| `inspection_date` | DATE | 检查日期 |
| `inspector` | VARCHAR(64) | 检查人 |
| `inspector_dept` | VARCHAR(128) | 检查部门 |
| `checklist_config` | JSONB | 检查清单配置（条款 ID 列表） |
| `status` | VARCHAR(20) | planned / in_progress / completed / cancelled |
| `result_summary` | TEXT | 检查结果摘要 |
| `hazard_ids` | JSONB | 发现的隐患 ID 列表 |
| `enterprise_id` | BIGINT | 企业 ID |
| `created_by` | BIGINT | 创建人 |
| `created_at` | TIMESTAMPTZ | 创建时间 |
| `completed_at` | TIMESTAMPTZ | 完成时间 |
| `is_deleted` | BOOLEAN | 软删除 |

**关联关系**：
- `checklist_config` → `safety_standard_clauses.id`（检查清单基于标准条款）
- `hazard_ids` → `hse_hazard_records.id`（发现的隐患）

#### 3.1.3 `hse_hazard_records` — 隐患记录表

**新增原因**：
- 隐患有独立的生命周期（发现→整改→复查→关闭）
- 隐患来源多样（检查/评价/上报），需要统一管理
- 隐患级别（一般/重大）影响整改流程和上报要求

**字段设计方向**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | BIGSERIAL | 主键 |
| `hazard_title` | VARCHAR(256) | 隐患标题 |
| `hazard_description` | TEXT | 隐患描述 |
| `hazard_level` | VARCHAR(20) | general（一般）/ major（重大） |
| `hazard_type` | VARCHAR(64) | 隐患类型（设备/行为/管理/环境） |
| `location` | VARCHAR(256) | 隐患位置 |
| `source_type` | VARCHAR(20) | inspection / evaluation / report / manual |
| `source_id` | BIGINT | 来源 ID |
| `clause_id` | BIGINT | 关联标准条款 ID |
| `rectification_measure` | TEXT | 整改措施 |
| `responsible_person` | VARCHAR(64) | 责任人 |
| `deadline` | DATE | 整改期限 |
| `status` | VARCHAR(20) | open / rectifying / pending_review / closed / overdue |
| `evidence_files` | JSONB | 整改证据文件 |
| `reviewed_by` | BIGINT | 复查人 |
| `reviewed_at` | TIMESTAMPTZ | 复查时间 |
| `review_result` | VARCHAR(20) | passed / rejected |
| `enterprise_id` | BIGINT | 企业 ID |
| `created_by` | BIGINT | 创建人 |
| `created_at` | TIMESTAMPTZ | 创建时间 |
| `closed_at` | TIMESTAMPTZ | 关闭时间 |
| `is_deleted` | BOOLEAN | 软删除 |

**关联关系**：
- `source_id` → `hse_inspection_tasks.id` 或 `standard_evaluation_items.id`
- `clause_id` → `safety_standard_clauses.id`
- `evidence_files` → `document_files.id`

#### 3.1.4 `hse_operation_logs` — 安全运营日志表

**新增原因**：
- 闭环运营需要记录关键操作（整改/检查/隐患的状态变更）
- 用于追溯和审计，证明闭环完整性
- 为集团监管提供运营数据

**字段设计方向**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | BIGSERIAL | 主键 |
| `operation_type` | VARCHAR(32) | rectification / inspection / hazard / ledger |
| `operation_action` | VARCHAR(32) | create / update / status_change / review / close |
| `target_type` | VARCHAR(32) | 目标对象类型 |
| `target_id` | BIGINT | 目标对象 ID |
| `operation_detail` | JSONB | 操作详情（变更前/后状态） |
| `operator` | BIGINT | 操作人 |
| `operator_name` | VARCHAR(64) | 操作人姓名 |
| `enterprise_id` | BIGINT | 企业 ID |
| `created_at` | TIMESTAMPTZ | 操作时间 |

**关联关系**：
- `target_id` → 对应业务表 ID（整改/检查/隐患）
- `enterprise_id` → 企业 ID

### 3.2 扩展表分析

#### 3.2.1 `hse_report_templates` & `hse_reports` — 扩展 template_category

新增分类：
- `rectification_report` — 整改报告
- `inspection_report` — 检查报告
- `hazard_report` — 隐患治理报告
- `group_supervision` — 集团监管报告

修改方式：同 Sprint4，DROP CONSTRAINT + ADD CONSTRAINT（事务包裹）。

#### 3.2.2 企业信息表（新增 `hse_enterprises`）

集团多企业管理需要：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | BIGSERIAL | 主键 |
| `enterprise_name` | VARCHAR(128) | 企业名称 |
| `enterprise_code` | VARCHAR(64) | 统一信用代码 |
| `region` | VARCHAR(64) | 所在区域 |
| `parent_id` | BIGINT | 上级企业 ID（集团） |
| `contact_person` | VARCHAR(64) | 联系人 |
| `contact_phone` | VARCHAR(32) | 联系电话 |
| `status` | VARCHAR(20) | active / inactive |
| `created_at` | TIMESTAMPTZ | 创建时间 |
| `is_deleted` | BOOLEAN | 软删除 |

### 3.3 复用表（不修改结构）

| 表 | Sprint5 复用方式 |
|----|----------------|
| `safety_standard_clauses` | 检查清单基于条款生成 |
| `standard_evaluation_items` | 评价缺项转化为整改任务 |
| `document_files` | 整改证据/检查记录附件 |
| `hse_reports` / `hse_report_templates` | 新增报告分类 |
| `document_ai_analysis` | 隐患分析参考资料 AI 分析 |

### 3.4 ER 关系图（Sprint5 新增部分）

```
safety_standard_clauses (Sprint4)
    │
    ├──── hse_inspection_tasks (新)
    │         │ checklist_config → clause_id[]
    │         │
    │         └──── hse_hazard_records (新)
    │                   │ source_id → inspection_task_id
    │                   │
    │                   └──── hse_rectification_tasks (新)
    │                             │ source_id → hazard_id
    │                             │
    │                             └──── hse_operation_logs (新)
    │                                       │ target_id
    │
    └──── standard_evaluation_items (Sprint4)
              │
              └──── hse_rectification_tasks (新)
                        │ source_id → evaluation_item_id

hse_enterprises (新)
    │
    ├──── hse_rectification_tasks.enterprise_id
    ├──── hse_inspection_tasks.enterprise_id
    ├──── hse_hazard_records.enterprise_id
    └──── hse_operation_logs.enterprise_id
```

### 3.5 迁移版本规划

| 版本 | 内容 |
|------|------|
| v58 | hse_rectification_tasks + hse_inspection_tasks 建表 |
| v59 | hse_hazard_records + hse_operation_logs 建表 |
| v60 | hse_enterprises 建表 + hse_reports CHECK 扩展 |

---

## 四、Sprint5 AI 能力规划

### 4.1 AI 辅助能力（可规划）

| 能力 | 应用场景 | 实现方式 |
|------|---------|---------|
| 整改建议生成 | 评价缺项/隐患生成整改任务时，AI 辅助生成整改措施建议 | 新增 `rectification_suggestion` prompt，输入问题描述+条款要求，输出整改建议 |
| 隐患分析 | 隐患登记后，AI 分析隐患根因和影响范围 | 新增 `hazard_analysis` prompt，输入隐患描述，输出根因分析+影响评估 |
| 趋势分析 | 集团监管看板，AI 分析隐患/整改趋势 | 新增 `trend_analysis` prompt，输入历史数据，输出趋势分析和预警 |
| 报告摘要 | 整改/检查/隐患报告生成时，AI 辅助生成摘要 | 复用 reportService 的 AI 生成流程，新增对应 prompt |

### 4.2 AI 禁止事项（红线）

| 禁止项 | 说明 |
|--------|------|
| 自动处罚 | AI 不自动生成处罚决定，处罚由人工判定 |
| 自动定责 | AI 不自动判定责任归属，责任由人工调查确认 |
| 自动认证 | 延续 Sprint4 禁令，不自动认证 |
| 自动关闭隐患 | 隐患关闭必须人工复查，AI 仅提供分析参考 |
| 替代人工审核 | 所有 AI 建议仅供参考，最终决策由人工 |

### 4.3 AI Prompt 规划

| Prompt 名称 | 输入 | 输出 | 约束 |
|------------|------|------|------|
| `rectification_suggestion` | 问题描述 + 条款要求 + 关联资料 | 整改措施建议 + 优先级 + 预估工期 | 禁止编造；建议必须可操作 |
| `hazard_analysis` | 隐患描述 + 位置 + 历史记录 | 根因分析 + 影响评估 + 预防建议 | 禁止定责；仅分析技术原因 |
| `trend_analysis` | 历史隐患/整改数据 | 趋势分析 + 风险预警 + 改进建议 | 禁止预测具体事故；仅趋势分析 |
| `operation_summary` | 运营数据统计 | 摘要 + 重点关注 + 建议 | 禁止达标结论；仅运营总结 |

### 4.4 AI 双轨制延续

延续 Sprint4 的 AI 双轨制设计：
- AI 建议结果存储在 `ai_*` 前缀字段
- 人工确认结果存储在独立字段
- AI 结果不直接作为最终结论

---

## 五、Sprint5 前端规划

### 5.1 前端架构原则

| 原则 | 说明 |
|------|------|
| 基于 Vben Admin | 复用现有架构，不修改核心目录 |
| 禁止修改核心目录 | packages/@core/、effects/、themes/ 不动 |
| 禁止新增公共组件 | 业务组件放模块内部 components/ 目录 |
| 复用现有能力 | Ant Design Vue、@vben/request、hooks、composables、notificationService |

### 5.2 前端目录规划

```
apps/web-antd/src/views/hse/
  ├─ standard/              Sprint4 标准化评价（已有）
  │   ├─ clauses/           条款库
  │   ├─ relation/          资料关联
  │   └─ evaluation/        评价任务
  │
  ├─ rectification/         Sprint5 新增：整改闭环
  │   ├─ api.ts             API 层
  │   ├─ index.vue          整改任务列表
  │   ├─ detail.vue         整改任务详情
  │   └─ components/        业务组件
  │
  ├─ inspection/            Sprint5 新增：检查管理
  │   ├─ api.ts
  │   ├─ index.vue          检查任务列表
  │   ├─ execute.vue        检查执行页面
  │   └─ components/
  │
  ├─ hazard/                Sprint5 新增：隐患治理
  │   ├─ api.ts
  │   ├─ index.vue          隐患列表
  │   ├─ detail.vue         隐患详情（含整改闭环）
  │   └─ components/
  │
  ├─ ledger/                Sprint5 新增：安全台账
  │   ├─ api.ts
  │   ├─ index.vue          台账总览
  │   ├─ personnel/         人员安全档案
  │   ├─ training/          培训记录
  │   ├─ equipment/         设备设施
  │   ├─ emergency/         应急管理
  │   └─ risk/              风险辨识
  │
  └─ group/                 Sprint5 新增：集团监管
      ├─ api.ts
      ├─ dashboard.vue      集团看板
      ├─ enterprises.vue    企业管理
      └─ components/
```

### 5.3 路由规划

```
/hse (父菜单: 安全管理)
├── /hse/standard/...          Sprint4 标准化评价（已有）
├── /hse/rectification/...     Sprint5 整改闭环
├── /hse/inspection/...        Sprint5 检查管理
├── /hse/hazard/...            Sprint5 隐患治理
├── /hse/ledger/...            Sprint5 安全台账
└── /hse/group/...             Sprint5 集团监管
```

### 5.4 复用组件清单

| 现有组件 | Sprint5 复用方式 |
|---------|----------------|
| `HseStatCard` | 统计卡片（整改/检查/隐患统计） |
| `ReportViewerDrawer` | 报告查看（整改/检查/隐患报告） |
| `Page` (@vben/common-ui) | 页面容器 |
| `IconifyIcon` (@vben/icons) | 图标 |
| `useAccess` | 权限控制 |
| `requestClient` (@vben/request) | API 调用 |
| EchartsUI (@vben/plugins/echarts) | 趋势图表 |

### 5.5 i18n 规划

在 `locales/langs/zh-CN/hse.json` 新增模块：
- `rectification` — 整改闭环
- `inspection` — 检查管理
- `hazard` — 隐患治理
- `ledger` — 安全台账
- `group` — 集团监管

---

## 六、Sprint5 开发顺序

### 6.1 Phase 拆分

采用 Phase 方式分阶段开发，每个 Phase 形成可独立交付的能力。

```
Phase1: 数据库设计
    │
    ├─ v58: hse_rectification_tasks + hse_inspection_tasks
    ├─ v59: hse_hazard_records + hse_operation_logs
    ├─ v60: hse_enterprises + hse_reports CHECK 扩展
    └─ 种子数据：报告模板、示例企业
         │
         ▼
Phase2: 整改闭环
    │
    ├─ 后端：rectificationService.js + 路由
    ├─ 前端：整改任务列表 + 详情 + 证据上传
    ├─ 集成：评价缺项 → 整改任务转化
    └─ 测试：闭环流程测试
         │
         ▼
Phase3: 检查管理
    │
    ├─ 后端：inspectionService.js + 路由
    ├─ 前端：检查任务列表 + 执行页面
    ├─ 集成：检查清单基于标准条款 + 发现隐患
    └─ 测试：检查流程测试
         │
         ▼
Phase4: 隐患治理
    │
    ├─ 后端：hazardService.js + 路由
    ├─ 前端：隐患列表 + 详情（含整改闭环）
    ├─ 集成：多来源隐患统一管理 + 闭环
    └─ 测试：隐患闭环测试
         │
         ▼
Phase5: 集团监管
    │
    ├─ 后端：企业信息管理 + 集团数据汇总
    ├─ 前端：集团看板 + 企业管理 + 监管报告
    ├─ 集成：多企业数据隔离 + 集团汇总
    └─ 测试：多企业数据隔离测试
         │
         ▼
Phase6: 安全台账（可选，视优先级）
    │
    ├─ 后端：ledgerService.js + 路由
    ├─ 前端：五大台账页面
    ├─ 集成：汇总现有模块数据
    └─ 测试：台账展示测试
```

### 6.2 各 Phase 交付物

| Phase | 后端 | 前端 | 测试 |
|-------|------|------|------|
| Phase1 | 3 个迁移脚本 | - | 迁移幂等测试 |
| Phase2 | rectificationService + 路由 | 整改列表+详情 | 闭环流程测试 |
| Phase3 | inspectionService + 路由 | 检查列表+执行 | 检查流程测试 |
| Phase4 | hazardService + 路由 | 隐患列表+详情 | 隐患闭环测试 |
| Phase5 | enterpriseService + 集团汇总 | 集团看板+企业管理 | 数据隔离测试 |
| Phase6 | ledgerService + 路由 | 五大台账页面 | 台账展示测试 |

### 6.3 依赖关系

```
Phase1（数据库）→ 所有后续 Phase 的基础
    │
    ├─ Phase2（整改闭环）← 依赖 Sprint4 评价结果
    │       │
    │       └─ Phase4（隐患治理）← 隐患可转化为整改任务
    │
    ├─ Phase3（检查管理）← 依赖 Sprint4 标准条款
    │       │
    │       └─ Phase4（隐患治理）← 检查发现隐患
    │
    └─ Phase5（集团监管）← 依赖 Phase2~4 的运营数据

Phase6（安全台账）← 独立，可并行开发
```

**建议开发顺序**：Phase1 → Phase2 → Phase3 → Phase4 → Phase5 → Phase6

---

## 七、Sprint5 风险控制

### 7.1 数据量增长风险

| 风险点 | 等级 | 描述 | 缓解措施 |
|--------|------|------|---------|
| 运营日志膨胀 | 中 | hse_operation_logs 记录所有操作，数据增长快 | 按月分区；定期归档；只保留关键操作 |
| 整改任务累积 | 低 | 历史整改任务不清理 | 软删除 + 归档；按状态/时间分页查询 |
| 隐患记录增多 | 低 | 隐患持续累积 | 关闭的隐患自动归档；按级别/状态筛选 |

**数据库优化策略**：
- 所有新表使用 `is_deleted` 软删除 + `created_at` 索引
- 运营日志表按 `created_at` 建索引，支持按时间范围查询
- 整改/隐患表按 `enterprise_id` + `status` 建复合索引

### 7.2 权限复杂化风险

| 风险点 | 等级 | 描述 | 缓解措施 |
|--------|------|------|---------|
| 多角色权限 | 中 | 整改责任人/检查人/复查人/集团监管者角色多样 | 复用 requireRole；按操作类型控制权限 |
| 多企业数据隔离 | 高 | 集团多企业场景下数据不能串 | enterprise_id 过滤；中间件层强制隔离 |
| 越权操作 | 中 | 责任人只能操作自己的任务 | 操作前校验 operator == responsible_person |

**权限矩阵规划**：

| 角色 | 整改任务 | 检查任务 | 隐患治理 | 集团监管 |
|------|---------|---------|---------|---------|
| admin | 全部 | 全部 | 全部 | 全部 |
| safety_manager | 创建/复查 | 创建/执行 | 登记/复查 | 只读 |
| safety_officer | 执行（自己的） | 执行 | 上报 | - |
| group_admin | 只读本企业 | 只读本企业 | 只读本企业 | 全部（跨企业） |

### 7.3 AI 可靠性风险

| 风险点 | 等级 | 描述 | 缓解措施 |
|--------|------|------|---------|
| 整改建议不实用 | 中 | AI 生成的整改建议可能不贴合实际 | AI 仅辅助；人工可编辑；Prompt 约束可操作性 |
| 隐患分析偏差 | 中 | AI 根因分析可能有误 | AI 仅参考；禁止定责；人工确认 |
| 趋势分析误判 | 低 | AI 趋势预测可能不准确 | 禁止预测具体事故；仅趋势分析；人工解读 |
| AI 服务不可用 | 低 | AI 调用失败影响辅助功能 | 降级为无 AI 建议；不阻断核心流程 |

**AI 约束延续**：
- 所有 AI 建议存储在 `ai_*` 前缀字段
- AI 结果不直接作为最终结论
- 禁止自动处罚/定责/认证

### 7.4 历史数据兼容风险

| 风险点 | 等级 | 描述 | 缓解措施 |
|--------|------|------|---------|
| Sprint4 评价结果转化 | 中 | 已有评价缺项需可转化为整改任务 | source_type=evaluation + source_id 关联 |
| 现有隐患数据 | 低 | V1 可能有隐患数据 | 新表独立，不迁移历史数据 |
| 报告体系兼容 | 低 | 新增报告分类不影响现有报告 | CHECK 约束扩展，不修改现有数据 |
| 企业信息缺失 | 中 | 现有数据无 enterprise_id | 新表 enterprise_id 可空，默认为当前企业 |

**兼容策略**：
- 所有新表 `enterprise_id` 可空，默认 NULL 表示当前企业
- 迁移脚本仅建表 + 扩展 CHECK，不修改已有表数据
- 评价缺项转化整改任务时，`source_id` 引用 `standard_evaluation_items.id`

### 7.5 闭环完整性风险

| 风险点 | 等级 | 描述 | 缓解措施 |
|--------|------|------|---------|
| 整改任务未关闭 | 中 | 责任人未及时完成整改 | 超期预警；状态机强制流程 |
| 隐患漏管 | 中 | 检查发现的隐患未登记 | 检查执行时自动创建隐患记录 |
| 复查流于形式 | 低 | 复查不认真 | 复查需填写备注；记录复查人/时间 |
| 闭环断裂 | 中 | 某个环节缺失导致闭环不完整 | 运营日志记录全流程；看板展示闭环完整率 |

---

## 八、Sprint5 与 Sprint4 的衔接

### 8.1 数据衔接

| Sprint4 数据 | Sprint5 衔接方式 |
|-------------|----------------|
| `standard_evaluation_items`（缺项） | `source_type=evaluation` + `source_id` → 整改任务 |
| `safety_standard_clauses` | 检查清单基于条款生成 |
| `document_files` | 整改证据/检查附件复用资料中心 |
| `hse_reports` | 新增报告分类（整改/检查/隐患/监管） |

### 8.2 服务衔接

| Sprint4 服务 | Sprint5 衔接方式 |
|-------------|----------------|
| `standardEvaluationService` | 评价完成后触发整改任务生成 |
| `reportService` | 扩展支持新报告分类 |
| `aiService` | 新增 4 个 prompt 模板 |

### 8.3 闭环衔接图

```
Sprint4 评价中心                    Sprint5 运营中心
───────────────                    ───────────────
评价任务完成                        整改任务生成
  compliance_status                  source_type=evaluation
  = non_compliant/                   source_id=evaluation_item_id
  partial/missing                        │
        │                                ▼
        └───────────────────→ 整改闭环管理
                                    open → processing → completed
                                              │
                                              ▼
                                          检查任务管理
                                    日常/专项/月度/集团检查
                                              │
                                              ▼
                                          隐患治理闭环
                                    发现 → 整改 → 复查 → 关闭
                                              │
                                              ▼
                                          集团监管
                                    区域查看 + 汇总 + 监管报告
```

---

## 九、Sprint5 交付标准

### 9.1 验收标准

| 标准 | 要求 |
|------|------|
| 闭环完整性 | 整改/检查/隐患均形成完整闭环（发现→处理→关闭） |
| 数据可追溯 | 运营日志记录关键操作，可追溯全流程 |
| AI 边界清晰 | AI 仅辅助，禁止自动处罚/定责/认证 |
| 数据隔离 | 多企业数据隔离，集团可跨企业查看 |
| 测试覆盖 | 关键闭环流程测试通过 |
| 约束遵守 | 不改核心/不增依赖/不建公共组件 |

### 9.2 测试规划

| 测试类别 | 测试内容 |
|---------|---------|
| 数据库迁移 | 新表建表幂等 + CHECK 扩展 |
| 整改闭环 | 缺项转化→分配→整改→复查→关闭 |
| 检查管理 | 创建→执行→发现隐患→报告 |
| 隐患治理 | 登记→整改→复查→关闭 |
| 集团监管 | 多企业数据隔离 + 汇总 |
| AI 辅助 | 建议生成 + 禁止事项验证 |
| 权限控制 | 多角色权限矩阵验证 |

---

## 十、Sprint5 总结

### 10.1 核心价值

Sprint5 将系统从「评价工具」升级为「运营平台」，补齐安全管理的闭环能力：

1. **整改闭环**：评价发现的问题不再停留在报告里，而是跟踪到解决
2. **检查能力**：日常安全检查有系统支撑，检查结果可追溯
3. **隐患治理**：隐患从发现到关闭全流程管理，杜绝漏管
4. **集团监管**：集团可实时掌握各企业安全运营状况
5. **安全台账**：五大台账电子化，基础档案可查

### 10.2 与 V2.0 的关系

Sprint5 是 V2.0 的能力扩展，不改变 V2.0 的核心架构：
- V2.0（Sprint1~4）：安全资料 + AI 分析 + 标准化评价 + 报告
- Sprint5：在 V2.0 基础上补齐运营闭环

### 10.3 待确认事项

本规划方案为初版，以下事项需审核确认后进入编码阶段：

| 待确认项 | 说明 |
|---------|------|
| Phase 优先级 | Phase6（安全台账）是否纳入 Sprint5，还是推迟到 Sprint6 |
| 企业信息表 | 是否新增 hse_enterprises 表，还是复用现有用户体系 |
| AI Prompt 范围 | 4 个新 prompt 是否全部开发，还是分批 |
| 集团监管深度 | 集团看板的数据维度和展示方式 |
| 迁移版本号 | v58~v60 版本号是否与现有规划一致 |

---

**文档版本**：v1.0（规划版，待审核）
**生成日期**：2026-07-19
**前置条件**：Sprint4 V2.0 已达发布条件
**等待审核后进入 Sprint5 编码阶段**

# HSE事故管理设计

> 版本：v1.1（集团考核融合版·修订）
> 阶段：Sprint5.14（设计阶段，不含开发）
> 日期：2026年7月21日
> 修订依据：审核意见

---

## 一、设计目标

### 1.1 业务背景

事故管理是HSE体系的核心组成部分，需要建立独立的事故管理模块，实现事故的全生命周期管理，严格落实"四不放过"原则。

**职责边界**：

| 职责 | 安环管理部 | 生产管理部 |
|------|:---------:|:---------:|
| 事故报告 | ✅ | |
| 事故调查 | ✅ | |
| 原因分析 | ✅ | |
| 责任认定 | ✅ | |
| 整改措施 | ✅ | |
| 结案 | ✅ | |
| 专项培训 | ✅ | |
| 车辆维修/保养 | | ✅ |

### 1.2 设计目标

| 目标 | 说明 |
|------|------|
| 事故报告 | 支持各类事故的快速上报 |
| 事故调查 | 记录事故调查过程和证据 |
| 原因分析 | 支持根本原因、直接原因、间接原因分析 |
| 责任认定 | 明确事故责任人员和责任等级 |
| 整改措施 | 制定整改措施并跟踪落实 |
| 四不放过 | 严格落实事故处理"四不放过"原则 |
| 结案管理 | 事故结案和归档 |
| 专项培训 | 事故后的专项安全培训 |
| 服务风险画像 | 为员工安全风险画像提供事故维度数据 |

### 1.3 设计原则

| 原则 | 说明 |
|------|------|
| 统一人员关联 | 使用 `employee_id` 关联员工主数据，禁止保存人员姓名作为关联 |
| 独立模块 | 事故作为独立模块，不并入其他业务模块 |
| 四不放过 | 必须体现事故"四不放过"原则 |
| 最小侵入 | 不修改现有员工模型、培训模型等 |
| 规则可配置 | 事故等级规则由集团统一配置 |

### 1.4 事故分类

| 事故类型 | 代码 | 说明 |
|----------|------|------|
| 生产安全事故 | production | 生产作业过程中发生的安全事故 |
| 交通事故 | traffic | 车辆行驶过程中发生的交通事故 |
| 环境污染事故 | environment | 造成环境污染的事故 |

---

## 二、"四不放过"原则

事故管理必须严格落实"四不放过"原则：

| 原则 | 要求 | 对应字段 |
|------|------|----------|
| 事故原因未查清不放过 | 必须查明事故的根本原因、直接原因、间接原因 | root_cause, direct_cause, indirect_cause |
| 责任人员未处理不放过 | 必须对责任人员进行处理和处罚 | responsible_punishment, punishments |
| 整改措施未落实不放过 | 必须制定并落实整改措施 | rectification, rectification_status |
| 有关人员未受到教育不放过 | 必须对相关人员进行安全教育和培训 | education_completed, training_required |

---

## 三、数据模型设计

### 3.1 表结构设计

#### 3.1.1 hse_incident_records（事故记录表）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键 |
| incident_no | VARCHAR(64) | UNIQUE | 事故编号（自动生成） |
| incident_type | VARCHAR(32) | NOT NULL | 事故类型（production/traffic/environment） |
| incident_level | VARCHAR(32) | DEFAULT 'general' | 事故等级（minor/general/serious/major/特别重大） |
| title | VARCHAR(255) | NOT NULL | 事故标题 |
| description | TEXT | | 事故描述 |
| occurred_at | TIMESTAMPTZ | NOT NULL | 事故发生时间 |
| location | VARCHAR(255) | | 事故地点 |
| employee_id | BIGINT | NOT NULL, INDEX | 关联 employee.id，涉事员工ID |
| related_employees | JSONB | | 关联员工列表（其他涉事人员） |
| injured_count | INT | DEFAULT 0 | 受伤人数 |
| casualty_count | INT | DEFAULT 0 | 伤亡人数 |
| missing_count | INT | DEFAULT 0 | 失踪人数 |
| economic_loss | DECIMAL(12,2) | DEFAULT 0 | 经济损失（元） |
| property_damage | DECIMAL(12,2) | DEFAULT 0 | 财产损失（元） |
| environmental_impact | TEXT | | 环境影响评估（环境污染事故） |
| root_cause | TEXT | | 根本原因 |
| direct_cause | TEXT | | 直接原因 |
| indirect_cause | TEXT | | 间接原因 |
| responsibility | VARCHAR(32) | DEFAULT 'unknown' | 责任认定（main/secondary/no/unknown） |
| responsible_punishment | TEXT | | 责任人员处理结果（四不放过） |
| punishments | JSONB | | 处罚记录列表 |
| rectification | TEXT | | 整改措施 |
| rectification_status | VARCHAR(32) | DEFAULT 'pending' | 整改状态（pending/implementing/completed） |
| rectification_deadline | DATE | | 整改截止日期 |
| rectification_verified_by | BIGINT | NULL | 整改验收人ID |
| rectification_verified_at | TIMESTAMPTZ | NULL | 整改验收时间 |
| education_completed | BOOLEAN | DEFAULT FALSE | 教育是否完成（四不放过） |
| education_desc | TEXT | | 教育情况描述 |
| training_required | BOOLEAN | DEFAULT FALSE | 是否需要专项培训 |
| training_plan_id | BIGINT | NULL | 关联培训计划ID |
| status | VARCHAR(32) | DEFAULT 'reported' | 事故状态（reported/under_investigation/analyzed/rectifying/closed） |
| report_time | TIMESTAMPTZ | DEFAULT NOW() | 上报时间 |
| reporter_id | BIGINT | NULL | 上报人ID |
| investigation_team | JSONB | | 调查组成员 |
| investigation_report | TEXT | | 调查报告 |
| evidence_files | JSONB | | 证据文件列表 |
| summary | TEXT | | 事故总结 |
| is_deleted | BOOLEAN | DEFAULT FALSE | 软删除标记 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | 更新时间 |

**索引设计**：

| 索引名 | 字段 | 类型 |
|--------|------|------|
| idx_incident_incident_no | incident_no | UNIQUE |
| idx_incident_employee_id | employee_id | INDEX |
| idx_incident_incident_type | incident_type | INDEX |
| idx_incident_incident_level | incident_level | INDEX |
| idx_incident_occurred_at | occurred_at | INDEX |
| idx_incident_status | status | INDEX |
| idx_incident_location | location | INDEX |

#### 3.1.2 hse_incident_participants（事故参与者关联表）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键 |
| incident_id | BIGINT | NOT NULL, INDEX | 关联 hse_incident_records.id |
| employee_id | BIGINT | NOT NULL, INDEX | 关联 employee.id |
| role | VARCHAR(32) | NOT NULL | 角色（injured/victim/witness/suspect/investigator） |
| responsibility_level | VARCHAR(32) | DEFAULT 'none' | 责任等级（main/secondary/minor/none） |
| remarks | TEXT | | 备注 |
| is_deleted | BOOLEAN | DEFAULT FALSE | 软删除标记 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 创建时间 |

**索引设计**：

| 索引名 | 字段 | 类型 |
|--------|------|------|
| idx_ip_incident_id | incident_id | INDEX |
| idx_ip_employee_id | employee_id | INDEX |
| idx_ip_role | role | INDEX |

### 3.2 事故状态流转

```
上报(reported) → 调查中(under_investigation) → 分析完成(analyzed) → 整改中(rectifying) → 已关闭(closed)
                                                                         │
                                                                         └→ 整改不通过 → 返回分析完成(analyzed)
```

### 3.3 数据模型关系图

```
                    ┌──────────────────┐
                    │     employee     │
                    │  (员工主表)       │
                    └────────┬─────────┘
                             │ employee_id
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
     ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
     │hse_incident_  │ │hse_traffic_  │ │training_      │
     │  records      │ │  accidents    │ │  plans        │
     │ (事故记录)    │ │  (交通记录)   │ │  (培训计划)   │
     │               │ │               │ │               │
     └───────┬───────┘ └───────────────┘ └───────────────┘
             │
             ▼
     ┌───────────────┐
     │hse_incident_  │
     │  participants │
     │ (事故参与者)  │
     └───────────────┘
```

### 3.4 与现有表的关联

| 关联表 | 关联字段 | 用途 |
|--------|----------|------|
| employee | employee_id → id | 涉事员工基础信息 |
| v_employee_current | employee_id → id | 实时查询员工信息 |
| hse_traffic_accidents | incident_id | 交通事故关联 |
| training_plans | training_plan_id → id | 专项培训关联 |
| training_records | employee_id | 培训记录关联 |

---

## 四、核心业务流程

### 4.1 事故上报流程

```
事故发生 → 填写上报信息 → 提交审核 → 审核通过 → 进入调查阶段
                                              │
                                              └→ 审核不通过 → 返回修改
```

### 4.2 事故调查流程

```
调查启动 → 组建调查组 → 收集证据 → 现场勘查 → 形成调查报告
                                              │
                                              ▼
                                    原因分析（根本原因、直接原因、间接原因）
                                              │
                                              ▼
                                    责任认定 → 处理决定
```

### 4.3 整改流程

```
制定整改措施 → 明确整改责任人 → 落实整改 → 整改验收 → 整改完成
                                              │
                                              └→ 验收不通过 → 重新整改
```

### 4.4 结案流程

```
整改完成 → 教育完成 → 专项培训完成 → 事故总结 → 结案归档
```

### 4.5 "四不放过"落实检查

在事故结案前，系统自动检查"四不放过"落实情况：

| 检查项 | 检查条件 | 未通过处理 |
|--------|----------|------------|
| 原因查清 | root_cause、direct_cause、indirect_cause 非空 | 阻止结案 |
| 责任处理 | responsible_punishment 非空 | 阻止结案 |
| 整改落实 | rectification_status = 'completed' | 阻止结案 |
| 教育完成 | education_completed = true | 阻止结案 |

---

## 五、事故等级划分

### 5.1 等级定义

| 等级 | 代码 | 标准 |
|------|------|------|
| 特别重大事故 | major | 造成30人以上死亡，或100人以上重伤，或1亿元以上直接经济损失 |
| 重大事故 | serious | 造成10人以上30人以下死亡，或50人以上100人以下重伤，或5000万元以上1亿元以下直接经济损失 |
| 较大事故 | general | 造成3人以上10人以下死亡，或10人以上50人以下重伤，或1000万元以上5000万元以下直接经济损失 |
| 一般事故 | minor | 造成3人以下死亡，或10人以下重伤，或1000万元以下直接经济损失 |

### 5.2 等级判定规则

系统根据以下指标自动判定事故等级：

| 指标 | 判定优先级 | 说明 |
|------|------------|------|
| 伤亡人数 | 最高 | 优先按伤亡人数判定 |
| 重伤人数 | 次高 | 其次按重伤人数判定 |
| 经济损失 | 次低 | 最后按经济损失判定 |

---

## 六、与交通安全模块的关联

交通事故既属于事故管理范畴，也属于交通安全管理范畴：

| 场景 | 处理方式 |
|------|----------|
| 上报交通事故 | 在 hse_incident_records 创建记录，同时在 hse_traffic_accidents 创建记录 |
| 事故类型为 traffic | 通过 incident_id 关联 hse_traffic_accidents |
| 数据一致性 | 事故信息在两个表中保持一致，修改时同步更新 |
| 风险画像数据 | 通过 employee_id 关联查询驾驶员档案 |

---

## 七、事故与风险画像的集成

### 7.1 数据流向

```
hse_incident_records ──┐
                      ├─→ 风险画像聚合层
hse_incident_participants ─┤
```

### 7.2 风险画像中事故维度

在员工风险画像页面，事故风险区块显示：

| 元素 | 来源 | 说明 |
|------|------|------|
| 事故次数 | hse_incident_records | 近12月事故次数 |
| 事故等级 | hse_incident_records | 最高事故等级 |
| 责任等级 | hse_incident_records | 最高责任等级 |
| 整改完成情况 | hse_incident_records | 整改完成率 |
| 事故记录列表 | hse_incident_records | 事故详情 |

### 7.3 风险等级联动

当员工触发以下条件时，直接影响综合风险等级：

| 条件 | 影响 |
|------|------|
| 近12月重大事故 ≥ 1次 | 触发一票否决，直接判定为极高风险 |
| 近12月事故主要责任 ≥ 2次 | 事故维度得分降低 |
| 整改超期未完成 | 隐患责任维度得分降低 |

---

## 八、展示设计

### 8.1 页面结构

事故管理模块包含以下页面：

| 页面 | 路径 | 说明 |
|------|------|------|
| 事故列表 | /incidents | 事故记录列表 |
| 事故详情 | /incidents/:id | 事故详情 |
| 事故上报 | /incidents/report | 事故上报 |
| 事故统计 | /incidents/stats | 事故统计分析 |

### 8.2 事故列表页面

| 元素 | 说明 |
|------|------|
| 搜索框 | 支持按事故编号、标题、地点搜索 |
| 筛选条件 | 事故类型、事故等级、状态、时间范围 |
| 列表字段 | 事故编号、标题、类型、等级、发生时间、地点、涉事员工、状态 |
| 操作按钮 | 查看详情、编辑、处理、结案 |

### 8.3 事故详情页面

采用单页多区块布局：

```
┌─────────────────────────────────────────────────┐
│                  事故详情                         │
├─────────────────────────────────────────────────┤
│  区块1：基本信息                                  │
│  ┌──────────┬──────────┬──────────┐            │
│  │ 事故编号  │ 事故类型  │ 事故等级  │            │
│  │ 状态      │ 上报时间  │ 发生时间  │            │
│  └──────────┴──────────┴──────────┘            │
├─────────────────────────────────────────────────┤
│  区块2：事故概况                                  │
│  ┌─────────────────────────────────────┐        │
│  │ 标题：XXX                          │        │
│  │ 地点：XXX                          │        │
│  │ 描述：XXX                          │        │
│  └─────────────────────────────────────┘        │
├─────────────────────────────────────────────────┤
│  区块3：伤亡损失                                  │
│  ┌──────────┬──────────┬──────────┐            │
│  │ 伤亡人数  │ 受伤人数  │ 失踪人数  │            │
│  │ 经济损失  │ 财产损失  │            │            │
│  └──────────┴──────────┴──────────┘            │
├─────────────────────────────────────────────────┤
│  区块4：涉事人员                                  │
│  ┌─────────────────────────────────────┐        │
│  │ [涉事人员列表] 角色/责任等级        │        │
│  └─────────────────────────────────────┘        │
├─────────────────────────────────────────────────┤
│  区块5：原因分析（四不放过）                        │
│  ┌─────────────────────────────────────┐        │
│  │ 根本原因：XXX                      │        │
│  │ 直接原因：XXX                      │        │
│  │ 间接原因：XXX                      │        │
│  └─────────────────────────────────────┘        │
├─────────────────────────────────────────────────┤
│  区块6：责任认定与处理（四不放过）                    │
│  ┌─────────────────────────────────────┐        │
│  │ 责任认定：XXX                      │        │
│  │ 责任人员处理：XXX                  │        │
│  │ [处罚记录列表]                     │        │
│  └─────────────────────────────────────┘        │
├─────────────────────────────────────────────────┤
│  区块7：整改措施（四不放过）                        │
│  ┌─────────────────────────────────────┐        │
│  │ 整改措施：XXX                      │        │
│  │ 整改状态：[状态标签]               │        │
│  │ 截止日期：XXX                      │        │
│  │ 验收人：XXX                        │        │
│  └─────────────────────────────────────┘        │
├─────────────────────────────────────────────────┤
│  区块8：安全教育（四不放过）                        │
│  ┌─────────────────────────────────────┐        │
│  │ 教育完成：[是/否]                  │        │
│  │ 教育情况：XXX                      │        │
│  │ 需要专项培训：[是/否]              │        │
│  │ 培训计划：XXX                      │        │
│  └─────────────────────────────────────┘        │
├─────────────────────────────────────────────────┤
│  区块9：调查信息                                  │
│  ┌─────────────────────────────────────┐        │
│  │ 调查组成员：XXX                    │        │
│  │ 调查报告：XXX                      │        │
│  │ 证据文件：[文件列表]               │        │
│  └─────────────────────────────────────┘        │
├─────────────────────────────────────────────────┤
│  区块10：事故总结                                 │
│  ┌─────────────────────────────────────┐        │
│  │ [总结内容]                         │        │
│  └─────────────────────────────────────┘        │
└─────────────────────────────────────────────────┘
```

### 8.4 事故上报页面

| 元素 | 说明 |
|------|------|
| 事故类型选择 | 生产安全事故/交通事故/环境污染事故 |
| 基本信息 | 标题、发生时间、地点、描述 |
| 伤亡损失 | 伤亡人数、受伤人数、失踪人数、经济损失 |
| 涉事人员 | 通过 EmployeeSelector 选择 |
| 证据上传 | 支持图片、文档上传 |

### 8.5 事故统计页面

| 元素 | 说明 |
|------|------|
| 统计卡片 | 事故总数、重大事故数、一般事故数、整改完成率 |
| 图表 | 事故类型分布、事故等级分布、月度事故趋势、部门事故排行 |
| 四不放过落实统计 | 各原则落实情况统计 |

---

## 九、API设计

### 9.1 事故记录 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/incidents | 事故列表（分页） |
| GET | /api/incidents/:id | 事故详情 |
| POST | /api/incidents | 创建事故记录 |
| PUT | /api/incidents/:id | 更新事故记录 |
| DELETE | /api/incidents/:id | 删除事故记录 |
| PUT | /api/incidents/:id/investigate | 进入调查阶段 |
| PUT | /api/incidents/:id/analyze | 完成原因分析 |
| PUT | /api/incidents/:id/rectify | 提交整改措施 |
| PUT | /api/incidents/:id/verify | 整改验收 |
| PUT | /api/incidents/:id/close | 结案 |
| GET | /api/incidents/stats | 事故统计 |

### 9.2 事故参与者 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/incidents/:id/participants | 获取事故参与者 |
| POST | /api/incidents/:id/participants | 添加事故参与者 |
| PUT | /api/incidents/:id/participants/:participantId | 更新事故参与者 |
| DELETE | /api/incidents/:id/participants/:participantId | 删除事故参与者 |

### 9.3 风险画像数据 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/incidents/profile/:employeeId | 获取员工事故风险数据 |

---

## 十、权限设计

| 操作 | 权限代码 | 说明 |
|------|----------|------|
| 查看事故列表 | hse:incidents:view | |
| 查看事故详情 | hse:incidents:view | |
| 创建事故记录 | hse:incidents:create | |
| 修改事故记录 | hse:incidents:edit | |
| 删除事故记录 | hse:incidents:delete | |
| 事故调查 | hse:incidents:investigate | |
| 原因分析 | hse:incidents:analyze | |
| 整改验收 | hse:incidents:verify | |
| 事故结案 | hse:incidents:close | |
| 查看统计 | hse:incidents:stats:view | |
| 导出数据 | hse:incidents:export | |

---

## 十一、后续开发建议

### 11.1 开发分阶段

| 阶段 | 内容 | 优先级 |
|:----:|------|:------:|
| 1 | 数据库表创建 | 高 |
| 2 | 事故记录 CRUD API | 高 |
| 3 | 事故参与者 API | 高 |
| 4 | 前端事故列表页面 | 高 |
| 5 | 前端事故详情页面 | 高 |
| 6 | 前端事故上报页面 | 高 |
| 7 | 前端事故统计页面 | 中 |
| 8 | 与交通安全模块集成 | 高 |
| 9 | 与风险画像集成 | 高 |

### 11.2 扩展方向

1. **事故预警** - 根据事故趋势预测预警
2. **事故复盘** - 事故回顾和复盘分析
3. **事故知识库** - 事故案例库
4. **移动端上报** - 支持手机端事故上报
5. **与集团考核对接** - 对接《2026年度HSE目标责任书》考核

---

## 十二、修订记录

| 版本 | 日期 | 修订内容 |
|:----:|------|----------|
| v1.0 | 2026-07-21 | 初始版本 |
| v1.1 | 2026-07-21 | 根据审核意见修订：<br>1. 事故分类调整为生产安全事故、交通事故、环境污染事故<br>2. 强化"四不放过"原则体现，增加对应字段和检查机制<br>3. 新增事故参与者关联表（hse_incident_participants）<br>4. 明确事故与交通安全模块的关联关系<br>5. 删除车辆管理非HSE内容（车辆维修/保养/年检等）<br>6. 事故管理保持独立模块 |
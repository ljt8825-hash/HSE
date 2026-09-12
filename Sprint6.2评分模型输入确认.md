# Sprint6.2 评分模型输入确认

> 本文件为 Sprint6.1-H 的最终交付物之一，作为 Sprint6.2 风险评分计算引擎开发的输入确认基线。
> 本文件冻结以下内容：风险数据模型、风险类型字典、岗位风险映射、评分规则、岗位权重、风险等级、特殊规则。
> Sprint6.2 开发时必须严格遵循本文件定义的输入规范，不得擅自调整。

---

## 一、Sprint6.2 任务定义

### 1.1 任务目标

基于 Sprint6.1 系列已确认的设计基线，开发集团 HSE 风险评分计算引擎，实现员工 HSE 风险等级的自动计算与输出。

### 1.2 范围边界

| 项目 | 是否包含 |
|------|----------|
| 风险评分计算引擎开发 | ✅ 是 |
| 风险等级 API 输出 | ✅ 是 |
| 风险评分历史记录 | ✅ 是（建议） |
| 风险预警规则配置 | ⚠️ 可选（建议 Sprint6.3） |
| 风险评分规则调整 | ❌ 否（本阶段冻结） |
| 风险类型字典调整 | ❌ 否（本阶段冻结） |
| 岗位风险映射调整 | ❌ 否（本阶段冻结） |

---

## 二、输入冻结清单

### 2.1 风险数据模型（已冻结）

#### 2.1.1 数据表清单

| 数据表 | 关联字段 | 统计周期 | 说明 |
|--------|----------|----------|------|
| `violation_records` | `violator_id = employee_id` | 近 12 个月 | 三违风险数据源 |
| `license_demerit_records` | `employee_id` | 近 5 年 | 驾驶证扣分数据源 |
| `hse_driver_inspection_records` | `employee_id` | 全部历史 | 三检执行数据源 |
| `training_records` | `personnel_id = employee_id` | 全部历史 | 培训合规数据源 |
| `hse_incident_records` | `employee_id` | 全部历史 | 事故风险数据源 |
| `management_execution` | `employee_id` | 全部历史 | 管理履职数据源 |

#### 2.1.2 关联规范

- **风险主体**: 统一为 `employee_id`
- **关联方式**: 所有风险数据表必须通过 `employee_id` 关联员工主数据
- **禁止**: 以车辆、姓名或其他字段作为风险主体

### 2.2 风险类型字典（已冻结）

基于 `risk_type_dict` 表，5 个标准化风险类型：

| risk_code | risk_name | risk_category | data_source | stat_period | applicable_scope | display_order |
|-----------|-----------|---------------|-------------|-------------|------------------|---------------|
| `violation` | 三违风险 | behavior | violation_records | 近 12 个月 | all | 1 |
| `driver_compliance` | 驾驶合规风险 | behavior | license_demerit_records, hse_driver_inspection_records | 近 5 年 | driver | 2 |
| `training_compliance` | 培训合规风险 | capability | training_records | 全部历史 | all | 3 |
| `incident` | 事故风险 | event | hse_incident_records | 全部历史 | all | 4 |
| `management_execution` | 管理履职风险 | management | management_execution | 全部历史 | management | 5 |

#### 风险体系四级分类（已冻结）

```
行为风险 (behavior)
  ├── 三违风险 (violation)
  └── 驾驶合规风险 (driver_compliance)
能力风险 (capability)
  └── 培训合规风险 (training_compliance)
事件风险 (event)
  └── 事故风险 (incident)
管理风险 (management)
  └── 管理履职风险 (management_execution)
```

### 2.3 岗位风险映射（已冻结）

基于 `position_risk_mapping` 表，5 类岗位：

| 标准岗位名称 | risk_category | applicable_risk_types |
|--------------|---------------|------------------------|
| 垃圾转运车驾驶员 | driver | violation, driver_compliance, training_compliance, incident |
| 垃圾收运车驾驶员 | driver | violation, driver_compliance, training_compliance, incident |
| 吸污车驾驶员 | driver | violation, driver_compliance, training_compliance, incident |
| 勾臂车司机 | driver | violation, driver_compliance, training_compliance, incident |
| 普通员工 | normal | violation, training_compliance, incident |
| 管理员 | management | violation, training_compliance, incident, management_execution |
| 部门经理 | management | violation, training_compliance, incident, management_execution |
| 乡镇作业中心经理 | management | violation, training_compliance, incident, management_execution |
| 环卫作业中心片区长 | management | violation, training_compliance, incident, management_execution |
| 总经理 | management | violation, training_compliance, incident, management_execution |

#### 岗位别名兼容

- 通过 `position_alias_mapping` 表实现岗位别名兼容
- 标准岗位通过 `position_id` 关联 `position` 主表
- 别名映射：`alias_position_name → standard_position_name`

### 2.4 评分规则（已冻结）

详见《风险指标扣分规则.md》和《Sprint6.1-H风险评分规则设计报告.md》。

#### 评分模型

```
总分 = Σ(风险类型得分 × 岗位权重)
```

- 百分制扣分制
- 各风险类型满分 100 分
- 岗位权重总和 100%
- 总分范围 0-100 分

#### 各风险类型扣分规则概要

| 风险类型 | 指标数 | 主要扣分项 |
|----------|--------|------------|
| 三违风险 | 4 | 次数、级别、待处理、类型覆盖 |
| 驾驶合规风险 | 4 | 累计扣分、扣分次数、未完成率、未整改 |
| 培训合规风险 | 3 | 总次数、合格率、待培训数 |
| 事故风险 | 4 | 次数、级别、责任事故、人员伤亡 |
| 管理履职风险 | 3 | 巡查次数、发现问题数、未整改数 |

### 2.5 岗位权重矩阵（已冻结）

详见《岗位风险权重矩阵.md》。

| 岗位类别 | 三违风险 | 驾驶合规风险 | 培训合规风险 | 事故风险 | 管理履职风险 | 合计 |
|----------|----------|--------------|--------------|----------|--------------|------|
| 驾驶员 | 20% | 35% | 15% | 30% | - | 100% |
| 普通员工 | 35% | - | 25% | 40% | - | 100% |
| 基层管理 | 20% | - | 15% | 25% | 40% | 100% |
| 中层管理 | 15% | - | 20% | 25% | 40% | 100% |
| 高层管理 | 10% | - | 20% | 25% | 45% | 100% |

### 2.6 风险等级（已冻结）

| 风险等级 | 分值区间 | 颜色标识 | 管控要求 |
|----------|----------|----------|----------|
| 低风险 | 0-25 分 | 绿色 | 常规管理 |
| 一般风险 | 26-50 分 | 蓝色 | 关注跟踪 |
| 较高风险 | 51-75 分 | 黄色 | 重点管控 |
| 重大风险 | 76-100 分 | 红色 | 立即处置 |

### 2.7 特殊规则（已冻结）

#### 2.7.1 事故优先级规则

| 触发条件 | 处置规则 |
|----------|----------|
| 发生重大事故 | 直接判定为重大风险（100 分） |
| 发生较大事故 | 风险等级不低于较高风险（≥ 51 分） |
| 事故造成人员死亡 | 直接判定为重大风险（100 分） |
| 事故造成人员重伤 | 风险等级不低于重大风险（≥ 76 分） |

#### 2.7.2 驾驶员特殊规则

| 触发条件 | 处置规则 |
|----------|----------|
| 驾驶证扣分满 12 分 | 直接判定为重大风险 |
| 近 12 个月 2 次以上交通事故 | 风险等级不低于较高风险 |
| 交通事故权重提高 | 事故风险权重 30% → 40%（驾驶合规降至 25%） |

#### 2.7.3 管理人员特殊规则

| 触发条件 | 处置规则 |
|----------|----------|
| 管理履职权重提高 | 管理履职权重提高 5% |
| 管辖范围发生重大事故 | 风险等级不低于较高风险 |
| 连续 3 个月未执行巡查 | 直接判定为重大风险 |

---

## 三、Sprint6.2 开发输入规范

### 3.1 API 入参规范

所有风险评分相关 API 入参统一为 `employee_id`：

```
GET /api/hse/risk-profile/employee/:employeeId/risk-score
```

**响应结构（建议）**:

```json
{
  "code": 0,
  "data": {
    "employeeId": 1001,
    "employeeName": "张三",
    "position": {
      "id": 5,
      "name": "垃圾转运车驾驶员",
      "riskCategory": "driver"
    },
    "riskScores": {
      "violation": { "score": 40, "details": { ... } },
      "driver_compliance": { "score": 37.3, "details": { ... } },
      "training_compliance": { "score": 15, "details": { ... } },
      "incident": { "score": 20, "details": { ... } }
    },
    "totalScore": 27.6,
    "riskLevel": "一般风险",
    "riskLevelCode": "medium",
    "specialRulesTriggered": [],
    "calculatedAt": "2026-07-22T12:00:00Z"
  }
}
```

### 3.2 计算引擎输入依赖

| 依赖项 | 来源 | 说明 |
|--------|------|------|
| 员工岗位信息 | `hse_employee_relation` + `position` + `position_risk_mapping` | 获取 `risk_category` 和 `applicable_risk_types` |
| 风险类型字典 | `risk_type_dict` | 获取 `data_source`, `stat_period`, `applicable_scope` |
| 三违风险数据 | `violation_records` | 按 `violator_id` 查询，近 12 个月 |
| 驾驶证扣分数据 | `license_demerit_records` | 按 `employee_id` 查询，近 5 年 |
| 三检数据 | `hse_driver_inspection_records` | 按 `employee_id` 查询，全部历史 |
| 培训数据 | `training_records` | 按 `personnel_id` 查询，全部历史 |
| 事故数据 | `hse_incident_records` | 按 `employee_id` 查询，全部历史 |
| 管理履职数据 | `management_execution` | 按 `employee_id` 查询，全部历史 |

### 3.3 计算流程（Sprint6.2 实现参考）

```
Step 1: 查询员工岗位信息
  - 通过 hse_employee_relation 获取 position_id
  - 通过 position_risk_mapping 获取 risk_category 和 applicable_risk_types
  ↓
Step 2: 查询各风险类型指标数据
  - 根据 risk_type_dict.data_source 查询各表数据
  - 根据 risk_type_dict.stat_period 确定统计周期
  ↓
Step 3: 计算各风险类型得分（按《风险指标扣分规则.md》）
  - 三违风险得分（0-100 分）
  - 驾驶合规风险得分（0-100 分，仅驾驶员）
  - 培训合规风险得分（0-100 分）
  - 事故风险得分（0-100 分）
  - 管理履职风险得分（0-100 分，仅管理岗位）
  ↓
Step 4: 按岗位权重加权计算总分（按《岗位风险权重矩阵.md》）
  - 总分 = Σ(风险类型得分 × 岗位权重)
  ↓
Step 5: 检查特殊规则
  - 事故优先级规则
  - 驾驶员特殊规则
  - 管理人员特殊规则
  ↓
Step 6: 确定风险等级
  - 0-25 分: 低风险
  - 26-50 分: 一般风险
  - 51-75 分: 较高风险
  - 76-100 分: 重大风险
  ↓
输出: 风险等级 + 各风险类型得分 + 总分 + 触发的特殊规则
```

---

## 四、约束清单（Sprint6.2 必须遵守）

| 约束项 | 说明 |
|--------|------|
| 禁止修改 employee | employee 表结构保持不变 |
| 禁止修改组织模型 | hse_org_unit、hse_operation_unit 等组织表保持不变 |
| 禁止新增车辆关系 | 不建立车辆绑定主表，车辆仅作为事故/三检辅助信息 |
| 禁止修改风险评分规则 | 评分规则、扣分规则、岗位权重、风险等级、特殊规则均已冻结 |
| 禁止修改风险类型字典 | 5 个风险类型保持不变 |
| 禁止修改岗位风险映射 | 岗位-风险类型映射保持不变 |
| 风险主体为 employee_id | 所有风险数据通过 employee_id 关联 |
| 驾驶员风险主体为 employee_id | 禁止以车辆作为风险主体 |
| 禁止新增依赖 | 使用 Node.js 原生能力或现有依赖 |
| 禁止修改 Vben 核心目录 | packages/@core/、packages/effects/ 等保持不变 |
| 禁止创建自定义组件 | 仅在现有 components/hse/ 内调整 |
| 删除操作使用 Popconfirm | 非删除操作保留 Modal.confirm |

---

## 五、Sprint6.2 验收标准

### 5.1 功能验收

| 验收项 | 验收标准 |
|--------|----------|
| 风险评分计算 | 能根据 employee_id 计算出正确的风险总分和等级 |
| 风险类型得分 | 能输出 5 个风险类型各自的得分和明细 |
| 岗位权重应用 | 不同岗位类别应用正确的权重矩阵 |
| 特殊规则触发 | 触发特殊规则时能正确调整风险等级 |
| API 输出 | 响应结构符合 3.1 节规范 |

### 5.2 数据准确性验收

| 验收项 | 验收标准 |
|--------|----------|
| employee_id 关联 | 所有风险数据通过 employee_id 正确关联 |
| 统计周期 | 各风险类型按规定的统计周期查询数据 |
| 计算精度 | 得分计算结果与手动计算结果一致（误差 ≤ 0.1 分） |
| 等级判定 | 风险等级与总分区间对应正确 |

### 5.3 约束合规验收

| 验收项 | 验收标准 |
|--------|----------|
| employee 未修改 | employee 表结构与 Sprint6.1 结束时一致 |
| 组织模型未修改 | 组织相关表结构与 Sprint6.1 结束时一致 |
| 未新增车辆关系 | 未建立车辆绑定主表 |
| 未新增依赖 | package.json 未新增依赖 |
| 评分规则未修改 | 评分规则、权重、等级与冻结版本一致 |

---

## 六、Sprint6.1 系列交付物清单

### 6.1 已完成阶段

| 阶段 | 任务 | 状态 |
|------|------|------|
| Sprint6.1-A | 员工风险画像 | ✅ 完成 |
| Sprint6.1-B | 真实画像 | ✅ 完成 |
| Sprint6.1-C | 风险事实接入 | ✅ 完成 |
| Sprint6.1-D | 驾驶员专项风险 | ✅ 完成 |
| Sprint6.1-E | 风险模型收口 | ✅ 完成 |
| Sprint6.1-F | 风险类型体系优化 | ✅ 完成 |
| Sprint6.1-G | 岗位风险映射冻结 | ✅ 完成 |
| Sprint6.1-H | 风险评分规则设计 | ✅ 完成 |

### 6.2 已确认基线

- ✅ 员工模型（employee_id 作为风险主体）
- ✅ 岗位模型（5 类岗位，position_id 关联）
- ✅ 风险类型（5 个标准化风险类型，四级分类）
- ✅ 风险数据来源（6 张数据表，统一 employee_id 关联）
- ✅ 岗位风险映射（10 个标准岗位 + 别名兼容）
- ✅ 评分规则（5 个风险类型扣分规则）
- ✅ 岗位权重（5 类岗位权重矩阵，总和 100%）
- ✅ 风险等级（4 级风险等级，分值区间明确）
- ✅ 特殊规则（3 类特殊规则，触发即调整等级）

### 6.3 Sprint6.1-H 输出文件

| 文件名 | 说明 |
|--------|------|
| `Sprint6.1-H风险评分规则设计报告.md` | 主报告，包含完整评分规则设计 |
| `风险指标扣分规则.md` | 5 个风险类型的指标、计算方法、扣分规则、最高分 |
| `岗位风险权重矩阵.md` | 5 类岗位的权重矩阵和设计说明 |
| `Sprint6.2评分模型输入确认.md` | 本文件，Sprint6.2 开发输入基线 |

---

## 七、Sprint6.2 启动确认

本文件作为 Sprint6.2 风险评分计算引擎开发的输入基线，Sprint6.2 开发时：

1. **必须严格遵循**本文件定义的数据模型、风险类型、岗位映射、评分规则、权重、等级、特殊规则
2. **不得擅自调整**任何已冻结的设计基线
3. **如需调整**，必须先回到 Sprint6.1 对应子任务进行设计变更，重新冻结后再进入 Sprint6.2
4. **开发完成后**，按本文件第五节验收标准进行验收

---

## 八、约束合规

| 约束项 | 状态 | 说明 |
|--------|------|------|
| 禁止开发评分代码 | ✅ 符合 | 本阶段仅输出设计文档，未开发代码 |
| 禁止修改 employee | ✅ 符合 | 未修改 employee 表 |
| 禁止修改组织模型 | ✅ 符合 | 未修改组织相关表 |
| 禁止新增车辆关系 | ✅ 符合 | 未建立车辆绑定 |
| 风险主体为 employee_id | ✅ 符合 | 所有设计均以 employee_id 为风险主体 |
| 驾驶员风险主体为 employee_id | ✅ 符合 | 驾驶员风险主体为 employee_id，禁止以车辆作为风险主体 |

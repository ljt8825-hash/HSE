# Sprint6.1-H-2 风险模型冻结报告

> 本报告为 Sprint6.1 系列最终冻结文件，明确岗位与责任分离架构、网格长等级统一映射、管理岗位字段扩展、权重最终冻结，以及风险积分特殊加权机制。
> 本阶段只设计规则，禁止开发代码。
> 风险主体统一为 `employee_id`。
> 本报告发布后，Sprint6.1 系列全部结束，进入 Sprint6.2 开发阶段。

---

## 一、任务概述

### 1.1 冻结目标

- 明确**岗位系统**与**责任系统**的独立管理边界
- 固定**网格长等级与岗位的一一映射关系**
- 扩展 `position_risk_mapping` 增加 `management_level` 字段
- 最终冻结**5 类岗位权重矩阵**，禁止任何动态调整
- 建立**风险积分特殊加权**机制，替代权重动态调整

### 1.2 禁止项

- 本阶段只设计规则，禁止开发评分代码
- 禁止修改 employee
- 禁止修改组织模型
- 禁止新增车辆管理

---

## 二、岗位与责任分离（核心架构决策）

### 2.1 设计原则

**岗位（Position）** 与 **责任角色（Responsibility / Grid Level）** 完全独立管理，分别由不同的数据表维护，在计算时分别读取，不耦合。

### 2.2 岗位系统职责

| 职责 | 说明 |
|------|------|
| 决定岗位类别 | `position_risk_mapping.risk_category`: driver / normal / management |
| 决定适用风险类型 | `position_risk_mapping.applicable_risk_types` |
| 决定管理级别 | `position_risk_mapping.management_level`: frontline / middle / high |
| 决定岗位权重 | 基于 `risk_category` + `management_level` 查询权重矩阵 |

**数据表**: `position` → `position_risk_mapping`

### 2.3 责任系统职责

| 职责 | 说明 |
|------|------|
| 决定责任类型 | `hse_responsibility.responsibility_type`: grid_leader / production_manager / none |
| 决定网格等级 | `hse_responsibility.grid_level`: 总网格长 / 一级网格长 / 二级网格长 / 三级网格长 |
| 决定巡查频次要求 | 基于 `grid_level` 查询巡查频次标准 |
| 决定管理履职积分 | 基于 `grid_level` 计算应巡查次数和完成率 |

**数据表**: `hse_responsibility`

### 2.4 分离示意图

```
employee_id
  ├── 岗位系统 (position_risk_mapping)
  │     ├── risk_category → 岗位类别 (driver/normal/management)
  │     ├── management_level → 管理级别 (frontline/middle/high)
  │     └── applicable_risk_types → 适用风险类型
  │
  └── 责任系统 (hse_responsibility)
        ├── responsibility_type → 责任类型
        └── grid_level → 网格等级 → 巡查频次要求
```

### 2.5 分离的优势

| 优势 | 说明 |
|------|------|
| 职责清晰 | 岗位决定"你是谁"，责任决定"你做什么" |
| 灵活配置 | 同一岗位可对应不同责任角色，反之亦然 |
| 便于扩展 | 新增岗位不影响责任体系，新增责任角色不影响岗位体系 |
| 计算独立 | 风险积分计算中，权重查询和责任要求查询互不依赖 |

---

## 三、网格长等级统一映射

### 3.1 固定映射规则

以下岗位与网格长等级建立**固定一一映射**，不允许动态变化：

| 岗位名称 | risk_category | management_level | grid_level（责任角色） | 巡查频次 |
|----------|---------------|------------------|------------------------|----------|
| 总经理 | management | high | 总网格长 | 1 次/3 天 |
| 部门经理 | management | middle | 一级网格长 | 1 次/2 天 |
| 乡镇作业中心经理 | management | middle | 二级网格长 | 1 次/天 |
| 环卫作业中心片区长 | management | middle | 二级网格长 | 1 次/天 |
| 管理员 | management | frontline | 三级网格长 | 1 次/天 |

> **重要**: 岗位决定 `management_level`，责任决定 `grid_level`。虽然当前是固定映射，但两个系统独立存储，为未来灵活调整保留空间。

### 3.2 映射关系图

```
管理岗位金字塔

          总经理
            │
            ▼
        总网格长 ─── 管理履职权重 45% ─── 1次/3天
            │
      ┌─────┴─────┐
      │           │
    部门经理   环卫作业中心片区长
      │           │
      ▼           ▼
   一级网格长   二级网格长
   权重40%      权重40%
   1次/2天      1次/天
      │
    乡镇作业中心经理
      │
      ▼
   二级网格长
   权重40%
   1次/天
      │
    管理员
      │
      ▼
   三级网格长
   权重40%
   1次/天
```

### 3.3 数据来源确认

| 字段 | 数据表 | 说明 |
|------|--------|------|
| `management_level` | `position_risk_mapping` | 岗位固有属性，决定权重矩阵行 |
| `grid_level` | `hse_responsibility` | 责任属性，决定巡查频次 |
| `risk_category` | `position_risk_mapping` | 岗位类别，决定适用风险类型 |

---

## 四、管理岗位字段优化

### 4.1 position_risk_mapping 扩展

在 `position_risk_mapping` 表中增加 `management_level` 字段：

| 字段 | 类型 | 约束 | 取值 | 说明 |
|------|------|------|------|------|
| `management_level` | VARCHAR(32) | 可为 NULL | frontline / middle / high | 管理岗位级别 |

### 4.2 字段规则

- 仅当 `risk_category = 'management'` 时，`management_level` 有值
- 当 `risk_category = 'driver'` 或 `'normal'` 时，`management_level` 为 NULL
- `management_level` 用于在权重矩阵中区分基层/中层/高层管理的权重

### 4.3 更新后的 position_risk_mapping 表结构

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGSERIAL | 主键 |
| position_id | BIGINT | 关联 position 表 |
| position_name | VARCHAR(128) | 岗位名称 |
| risk_category | VARCHAR(32) | 岗位类别: driver/normal/management |
| **management_level** | **VARCHAR(32)** | **管理级别: frontline/middle/high（新增）** |
| applicable_risk_types | JSON / TEXT | 适用风险类型列表 |
| description | TEXT | 描述 |
| is_active | BOOLEAN | 是否启用 |
| created_at | TIMESTAMPTZ | 创建时间 |
| updated_at | TIMESTAMPTZ | 更新时间 |

### 4.4 数据示例

| position_name | risk_category | management_level | applicable_risk_types |
|---------------|---------------|------------------|------------------------|
| 垃圾转运车驾驶员 | driver | NULL | violation, driver_compliance, training_compliance, incident |
| 普通员工 | normal | NULL | violation, training_compliance, incident |
| 管理员 | management | **frontline** | violation, training_compliance, incident, management_execution |
| 部门经理 | management | **middle** | violation, training_compliance, incident, management_execution |
| 乡镇作业中心经理 | management | **middle** | violation, training_compliance, incident, management_execution |
| 环卫作业中心片区长 | management | **middle** | violation, training_compliance, incident, management_execution |
| 总经理 | management | **high** | violation, training_compliance, incident, management_execution |

---

## 五、岗位风险权重最终冻结

### 5.1 冻结声明

以下权重矩阵为**最终版本**，Sprint6.2 及后续阶段**禁止任何形式的动态调整**。

特殊场景（如交通事故频发、重大事件）不通过调整权重处理，而是通过**风险积分特殊加权**机制处理（见第六节）。

### 5.2 权重矩阵（冻结版）

| 岗位类别 | 管理级别 | 三违风险 | 驾驶合规风险 | 培训合规风险 | 事故风险 | 管理履职风险 | **合计** |
|----------|----------|----------|--------------|--------------|----------|--------------|----------|
| 驾驶员 | - | 20% | 35% | 15% | 30% | - | **100%** |
| 普通员工 | - | 35% | - | 25% | 40% | - | **100%** |
| 基层管理 | frontline | 20% | - | 15% | 25% | 40% | **100%** |
| 中层管理 | middle | 15% | - | 20% | 25% | 40% | **100%** |
| 高层管理 | high | 10% | - | 20% | 25% | 45% | **100%** |

### 5.3 权重查询路径

```
employee_id
  → hse_employee_relation.position_id
    → position_risk_mapping
      ├── risk_category = 'driver' → 驾驶员权重行
      ├── risk_category = 'normal' → 普通员工权重行
      └── risk_category = 'management'
            └── management_level
                  ├── 'frontline' → 基层管理权重行
                  ├── 'middle' → 中层管理权重行
                  └── 'high' → 高层管理权重行
```

### 5.4 权重冻结约束

| 约束 | 说明 |
|------|------|
| 禁止运行时修改权重 | 权重矩阵作为常量配置，不允许在计算过程中动态修改 |
| 禁止按事件调整权重 | 交通事故、重大事件不触发权重调整 |
| 禁止按个人调整权重 | 不允许针对单个员工定制权重 |
| 权重总和校验 | 每次发布前必须验证每行权重合计为 100% |

---

## 六、禁止动态调整权重 — 风险积分特殊加权机制

### 6.1 设计原则

为应对交通事故频发、重大事件等特殊情况，**不调整岗位权重矩阵**，而是在最终风险积分总分上增加**固定额外积分**，通过积分提升来反映风险等级的上升。

### 6.2 风险积分特殊加权规则

| 触发场景 | 额外积分 | 说明 |
|----------|----------|------|
| 近 12 个月 2 次以上交通事故 | +15 分 | 在风险积分总分上加 15 分 |
| 近 12 个月 3 次以上交通事故 | +30 分 | 在风险积分总分上加 30 分 |
| 管辖范围发生重大事故 | +20 分 | 管理人员适用 |
| 管辖范围发生较大事故 | +10 分 | 管理人员适用 |

### 6.3 特殊加权计算流程

```
Step 1: 按冻结权重计算风险积分总分
  风险积分总分 = Σ(风险类型积分 × 岗位权重)

Step 2: 叠加特殊加权积分
  最终风险积分 = MIN(100, 风险积分总分 + 特殊加权积分)

Step 3: 检查特殊规则（跳级规则）
  如触发"直接判定重大风险"规则，覆盖上述计算结果

Step 4: 确定风险等级
```

### 6.4 计算示例

> 某驾驶员：三违 46 分(20%)、驾驶合规 37.3 分(35%)、培训 15 分(15%)、事故 12 分(30%)
> 风险积分总分 = 46×0.2 + 37.3×0.35 + 15×0.15 + 12×0.3 = 28.2 分
>
> 该驾驶员近 12 个月发生 2 次交通事故，触发特殊加权 +15 分：
> 最终风险积分 = MIN(100, 28.2 + 15) = 43.2 分
>
> 风险等级：一般风险（26-50 分）→ 仍一般风险，未跳级
>
> 若该驾驶员近 12 个月发生 3 次交通事故，触发特殊加权 +30 分：
> 最终风险积分 = MIN(100, 28.2 + 30) = 58.2 分
>
> 风险等级：较高风险（51-75 分）→ 等级上升

### 6.5 与H-1特殊规则对比

| 机制 | H-1 设计 | H-2 冻结设计 |
|------|----------|--------------|
| 交通事故权重提高 | 事故权重 30%→40%，驾驶合规 35%→25% | **权重不变**，总分额外 +15/+30 分 |
| 管理履职权重提高 | 管理履职权重 +5%，其他等比缩减 | **权重不变**，总分额外 +10/+20 分 |
| 多次交通事故 | 触发权重调整 | 触发积分额外加权 |

> 核心变化：**权重矩阵完全冻结**，所有特殊场景通过"积分额外加权"处理，保持权重矩阵的稳定性。

---

## 七、完整计算流程（最终版）

```
输入: employee_id
  ↓
Step 1: 查询员工岗位信息
  - hse_employee_relation → position_id
  - position_risk_mapping → risk_category, management_level, applicable_risk_types
  ↓
Step 2: 查询员工责任信息（管理岗位）
  - hse_responsibility → grid_level, responsibility_type
  ↓
Step 3: 查询各风险类型指标数据
  - 根据 risk_type_dict.data_source 查询各表
  - 根据 risk_type_dict.stat_period 确定统计周期
  ↓
Step 4: 计算各风险类型积分（按《最终风险指标计算规则.md》）
  - 三违风险积分 = MIN(100, ...)
  - 驾驶合规风险积分 = MIN(100, ...) [仅 driver]
  - 培训合规风险积分 = MIN(100, ...)
  - 事故风险积分 = MIN(100, ...)
  - 管理履职风险积分 = MIN(100, ...) [仅 management]
  ↓
Step 5: 按冻结权重计算风险积分总分
  - 根据 risk_category (+ management_level) 查询冻结权重矩阵
  - 风险积分总分 = Σ(风险类型积分 × 岗位权重)
  ↓
Step 6: 叠加风险积分特殊加权
  - 检查特殊加权触发条件
  - 最终风险积分 = MIN(100, 风险积分总分 + 特殊加权积分)
  ↓
Step 7: 检查特殊规则（跳级规则）
  - 重大事故直接判定重大风险
  - 人员死亡直接判定重大风险
  - 其他跳级规则
  ↓
Step 8: 确定风险等级
  - 0-25 分: 低风险
  - 26-50 分: 一般风险
  - 51-75 分: 较高风险
  - 76-100 分: 重大风险
  ↓
输出: 风险等级 + 各风险类型积分 + 风险积分总分 + 特殊加权 + 触发的特殊规则
```

---

## 八、数据模型最终状态

### 8.1 风险数据表（7张）

| 表名 | 关联字段 | 说明 |
|------|----------|------|
| `violation_records` | `violator_id = employee_id` | 三违风险数据 |
| `license_demerit_records` | `employee_id` | 驾驶证扣分数据 |
| `hse_driver_inspection_records` | `employee_id` | 三检执行数据 |
| `training_records` | `personnel_id = employee_id` | 培训合规数据 |
| `hse_incident_records` | `employee_id` | 事故风险数据 |
| `management_execution` | `employee_id` | 管理履职数据 |
| `hse_grid_inspection_records` | `employee_id` | 网格巡查数据 |

### 8.2 岗位与映射表（3张）

| 表名 | 说明 |
|------|------|
| `position` | 岗位主表 |
| `position_risk_mapping` | 岗位风险映射（含新增 management_level） |
| `position_alias_mapping` | 岗位别名映射 |

### 8.3 责任表（1张）

| 表名 | 说明 |
|------|------|
| `hse_responsibility` | 责任信息（含 grid_level） |

---

## 九、Sprint6.1 系列最终汇总

| 阶段 | 任务 | 状态 |
|------|------|------|
| Sprint6.1-A | 员工风险画像 | 完成 |
| Sprint6.1-B | 真实画像 | 完成 |
| Sprint6.1-C | 风险事实接入 | 完成 |
| Sprint6.1-D | 驾驶员专项风险 | 完成 |
| Sprint6.1-E | 风险模型收口 | 完成 |
| Sprint6.1-F | 风险类型体系优化 | 完成 |
| Sprint6.1-G | 岗位风险映射冻结 | 完成 |
| Sprint6.1-H | 风险评分规则初稿 | 完成 |
| Sprint6.1-H-1 | 风险积分规则优化收口 | 完成 |
| **Sprint6.1-H-2** | **风险模型最终冻结** | **完成** |

---

## 十、约束合规

| 约束项 | 状态 | 说明 |
|--------|------|------|
| 禁止开发评分代码 | 符合 | 本阶段仅设计规则，未开发代码 |
| 禁止修改 employee | 符合 | 未修改 employee 表 |
| 禁止修改组织模型 | 符合 | 未修改组织相关表 |
| 禁止新增车辆管理 | 符合 | 未建立车辆绑定主表 |
| 风险主体为 employee_id | 符合 | 所有数据表均通过 employee_id 关联 |
| 驾驶员风险主体为 employee_id | 符合 | 禁止以车辆作为风险主体 |
| 岗位与责任分离 | 符合 | position 与 grid_level 独立管理 |
| 权重矩阵冻结 | 符合 | 5 类岗位权重合计均为 100%，禁止动态调整 |

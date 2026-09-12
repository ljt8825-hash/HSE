# Sprint6.2 最终输入确认报告

> 本文件为 Sprint6.1-H-2 风险模型最终冻结的最终交付物，作为 Sprint6.2 风险评分计算引擎开发的唯一输入基线。
> 本文件冻结以下内容：数据模型、岗位与责任分离架构、网格长等级映射、position_risk_mapping 扩展、风险积分规则、冻结权重矩阵、风险等级、特殊规则、风险积分特殊加权机制。
> Sprint6.2 开发时必须严格遵循本文件定义的所有规范，不得擅自调整任何已冻结项。

---

## 一、Sprint6.2 任务定义

### 1.1 任务目标

基于 Sprint6.1 系列（含 Sprint6.1-H-2 最终冻结）已确认的设计基线，开发集团 HSE 风险评分计算引擎，实现员工 HSE 风险等级的自动计算与输出。

### 1.2 范围边界

| 项目 | 是否包含 |
|------|----------|
| 风险评分计算引擎开发 | 是 |
| 风险等级 API 输出 | 是 |
| 风险评分历史记录 | 是（建议） |
| `hse_grid_inspection_records` 表创建 | 是 |
| `position_risk_mapping` 增加 `management_level` | 是 |
| 风险预警规则配置 | 可选（建议 Sprint6.3） |
| 风险积分规则调整 | 否（已冻结） |
| 风险类型字典调整 | 否（已冻结） |
| 岗位风险映射调整 | 否（已冻结） |
| 权重矩阵调整 | 否（已冻结） |
| 岗位与责任分离架构调整 | 否（已冻结） |

---

## 二、架构冻结清单

### 2.1 岗位与责任分离架构（已冻结）

#### 2.1.1 岗位系统（决定权重）

| 数据表 | 关键字段 | 用途 |
|--------|----------|------|
| `position` | `id`, `name` | 岗位主数据 |
| `position_risk_mapping` | `position_id`, `risk_category`, `management_level`, `applicable_risk_types` | 岗位风险映射 |
| `position_alias_mapping` | `standard_position_name`, `alias_position_name` | 岗位别名兼容 |

#### 2.1.2 责任系统（决定巡查要求）

| 数据表 | 关键字段 | 用途 |
|--------|----------|------|
| `hse_responsibility` | `employee_id`, `responsibility_type`, `grid_level`, `inspection_frequency` | 责任信息 |

#### 2.1.3 分离原则

- **岗位系统**决定：岗位类别 → 管理级别 → 适用风险类型 → 岗位权重
- **责任系统**决定：责任类型 → 网格等级 → 巡查频次要求 → 管理履职积分
- 两个系统**独立查询、独立计算、互不依赖**

### 2.2 网格长等级统一映射（已冻结）

| 岗位名称 | risk_category | management_level | grid_level | 巡查频次 |
|----------|---------------|------------------|------------|----------|
| 总经理 | management | high | 总网格长 | 1 次/3 天 |
| 部门经理 | management | middle | 一级网格长 | 1 次/2 天 |
| 乡镇作业中心经理 | management | middle | 二级网格长 | 1 次/天 |
| 环卫作业中心片区长 | management | middle | 二级网格长 | 1 次/天 |
| 管理员 | management | frontline | 三级网格长 | 1 次/天 |

> `management_level` 存储在 `position_risk_mapping` 中，`grid_level` 存储在 `hse_responsibility` 中。

### 2.3 position_risk_mapping 扩展（已冻结）

新增字段 `management_level`：

| 字段 | 类型 | 约束 | 取值 |
|------|------|------|------|
| `management_level` | VARCHAR(32) | 可为 NULL | frontline / middle / high |

- 仅 `risk_category = 'management'` 时有值
- `driver` / `normal` 时值为 NULL
- 用于区分基层/中层/高层管理的权重矩阵行

### 2.4 风险数据模型（已冻结）

#### 数据表清单（7张）

| 数据表 | 关联字段 | 统计周期 | 说明 |
|--------|----------|----------|------|
| `violation_records` | `violator_id = employee_id` | 近 12 个月 | 三违风险数据源 |
| `license_demerit_records` | `employee_id` | 近 5 年 | 驾驶证扣分数据源 |
| `hse_driver_inspection_records` | `employee_id` | 全部历史 | 三检执行数据源 |
| `training_records` | `personnel_id = employee_id` | 全部历史 | 培训合规数据源 |
| `hse_incident_records` | `employee_id` | 全部历史 | 事故风险数据源 |
| `management_execution` | `employee_id` | 全部历史 | 管理履职数据源 |
| `hse_grid_inspection_records` | `employee_id` | 全部历史 | 网格巡查数据源 |

#### 新增表结构：`hse_grid_inspection_records`

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | BIGSERIAL | PK | 主键 |
| employee_id | BIGINT | NOT NULL, FK | 关联 employee |
| grid_level | VARCHAR(32) | NOT NULL | 网格级别 |
| inspection_date | DATE | NOT NULL | 巡查日期 |
| inspection_area | VARCHAR(256) | | 巡查区域 |
| inspection_items | TEXT | | 巡查项目 |
| result | VARCHAR(32) | | 巡查结果 |
| problems_found | TEXT | | 发现问题描述 |
| rectification_status | VARCHAR(32) | DEFAULT '未整改' | 整改状态 |
| photo_urls | TEXT[] | | 巡查照片 |
| inspector_name | VARCHAR(64) | | 巡查人 |
| is_deleted | BOOLEAN | DEFAULT FALSE | 软删除 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | 更新时间 |

### 2.5 风险类型字典（已冻结）

| risk_code | risk_name | risk_category | data_source | stat_period | applicable_scope |
|-----------|-----------|---------------|-------------|-------------|------------------|
| `violation` | 三违风险 | behavior | violation_records | 近 12 个月 | all |
| `driver_compliance` | 驾驶合规风险 | behavior | license_demerit_records, hse_driver_inspection_records | 近 5 年 | driver |
| `training_compliance` | 培训合规风险 | capability | training_records | 全部历史 | all |
| `incident` | 事故风险 | event | hse_incident_records | 全部历史 | all |
| `management_execution` | 管理履职风险 | management | management_execution, hse_grid_inspection_records | 全部历史 | management |

### 2.6 风险积分规则（已冻结）

详见《最终风险指标计算规则.md》。

#### 核心规则

- 风险积分制（积分越高风险越高）
- 所有公式统一 `MIN(100, ...)`
- 三违：次数积分 + 最高等级加权（消除重复计算）
- 驾驶合规：扣满 12 分额外 +50 分
- 事故：类型权重（生产安全 1.0 / 交通 0.8 / 环境 0.7）
- 管理履职：巡查完成率模型 + hse_grid_inspection_records

### 2.7 岗位风险权重矩阵（已冻结）

| 岗位类别 | 管理级别 | 三违风险 | 驾驶合规风险 | 培训合规风险 | 事故风险 | 管理履职风险 | 合计 |
|----------|----------|----------|--------------|--------------|----------|--------------|------|
| 驾驶员 | - | 20% | 35% | 15% | 30% | - | 100% |
| 普通员工 | - | 35% | - | 25% | 40% | - | 100% |
| 基层管理 | frontline | 20% | - | 15% | 25% | 40% | 100% |
| 中层管理 | middle | 15% | - | 20% | 25% | 40% | 100% |
| 高层管理 | high | 10% | - | 20% | 25% | 45% | 100% |

**冻结约束**：
- 禁止运行时修改权重
- 禁止按事件调整权重
- 禁止按个人调整权重

### 2.8 风险等级（已冻结）

| 风险等级 | 分值区间 | 颜色标识 | 管控要求 |
|----------|----------|----------|----------|
| 低风险 | 0-25 分 | 绿色 | 常规管理 |
| 一般风险 | 26-50 分 | 蓝色 | 关注跟踪 |
| 较高风险 | 51-75 分 | 黄色 | 重点管控 |
| 重大风险 | 76-100 分 | 红色 | 立即处置 |

### 2.9 特殊规则（已冻结）

#### 跳级规则（直接覆盖计算结果）

| 触发条件 | 处置规则 |
|----------|----------|
| 发生重大事故 | 直接判定为重大风险（100 分） |
| 发生较大事故 | 风险等级不低于较高风险（≥ 51 分） |
| 事故造成人员死亡 | 直接判定为重大风险（100 分） |
| 事故造成人员重伤 | 风险等级不低于重大风险（≥ 76 分） |
| 连续 3 个月巡查完成率 < 50% | 直接判定为重大风险 |

#### 风险积分特殊加权（在总分上额外加分）

| 触发场景 | 额外积分 | 说明 |
|----------|----------|------|
| 近 12 个月 2 次以上交通事故 | +15 分 | 在风险积分总分上加 15 分 |
| 近 12 个月 3 次以上交通事故 | +30 分 | 在风险积分总分上加 30 分 |
| 管辖范围发生重大事故 | +20 分 | 管理人员适用 |
| 管辖范围发生较大事故 | +10 分 | 管理人员适用 |

> **重要**：特殊加权不修改权重矩阵，仅在最终风险积分总分上叠加额外积分。

---

## 三、Sprint6.2 开发输入规范

### 3.1 API 入参规范

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
      "riskCategory": "driver",
      "managementLevel": null
    },
    "responsibility": {
      "type": "none",
      "gridLevel": null
    },
    "riskScores": {
      "violation": { "score": 46, "details": { ... } },
      "driver_compliance": { "score": 37.3, "details": { ... } },
      "training_compliance": { "score": 15, "details": { ... } },
      "incident": { "score": 12, "details": { ... } }
    },
    "baseTotalScore": 28.2,
    "specialWeightedScore": 0,
    "finalScore": 28.2,
    "riskLevel": "一般风险",
    "riskLevelCode": "medium",
    "specialRulesTriggered": [],
    "specialWeightings": [],
    "calculatedAt": "2026-07-22T12:00:00Z"
  }
}
```

### 3.2 计算引擎输入依赖

| 依赖项 | 来源 | 说明 |
|--------|------|------|
| 员工岗位信息 | `hse_employee_relation` + `position` + `position_risk_mapping` | 获取 `risk_category`, `management_level`, `applicable_risk_types` |
| 员工责任信息 | `hse_responsibility` | 获取 `grid_level`（用于管理履职巡查频次） |
| 风险类型字典 | `risk_type_dict` | 获取 `data_source`, `stat_period`, `applicable_scope` |
| 三违风险数据 | `violation_records` | 按 `violator_id` 查询，近 12 个月 |
| 驾驶证扣分数据 | `license_demerit_records` | 按 `employee_id` 查询，近 5 年 |
| 三检数据 | `hse_driver_inspection_records` | 按 `employee_id` 查询，全部历史 |
| 培训数据 | `training_records` | 按 `personnel_id` 查询，全部历史 |
| 事故数据 | `hse_incident_records` | 按 `employee_id` 查询，全部历史 |
| 管理履职数据 | `management_execution` | 按 `employee_id` 查询，全部历史 |
| 网格巡查数据 | `hse_grid_inspection_records` | 按 `employee_id` 查询，全部历史 |

### 3.3 计算流程（Sprint6.2 实现参考）

```
Step 1: 查询员工岗位信息
  - hse_employee_relation → position_id
  - position_risk_mapping → risk_category, management_level, applicable_risk_types
  ↓
Step 2: 查询员工责任信息（管理岗位）
  - hse_responsibility → grid_level, responsibility_type
  ↓
Step 3: 查询各风险类型指标数据
  - 根据 risk_type_dict 查询各表数据
  ↓
Step 4: 计算各风险类型积分
  - 三违 = MIN(100, 次数积分 + 最高等级加权 + 待处理 + 类型覆盖)
  - 驾驶合规 = MIN(100, 驾驶证扣分 + 扣满12分额外 + 三检执行) [仅 driver]
  - 培训合规 = MIN(100, 总次数 + 合格率 + 待培训)
  - 事故 = MIN(100, 类型权重次数 + 级别额外 + 责任 + 伤亡)
  - 管理履职 = MIN(100, 巡查完成率 + 发现问题 + 未整改) [仅 management]
  ↓
Step 5: 按冻结权重计算风险积分总分
  - 根据 risk_category + management_level 查询冻结权重矩阵
  - 风险积分总分 = Σ(风险类型积分 × 岗位权重)
  ↓
Step 6: 叠加风险积分特殊加权
  - 检查特殊加权触发条件
  - 最终风险积分 = MIN(100, 风险积分总分 + 特殊加权积分)
  ↓
Step 7: 检查特殊规则（跳级规则）
  - 如触发跳级规则，覆盖计算结果
  ↓
Step 8: 确定风险等级
  - 0-25: 低风险
  - 26-50: 一般风险
  - 51-75: 较高风险
  - 76-100: 重大风险
  ↓
输出: 风险等级 + 各风险类型积分 + 风险积分总分 + 特殊加权 + 触发的特殊规则
```

### 3.4 权重查询代码逻辑（示例）

```javascript
// 伪代码 - 权重查询
function getWeightMatrix(riskCategory, managementLevel) {
  if (riskCategory === 'driver') {
    return { violation: 0.20, driver_compliance: 0.35, training_compliance: 0.15, incident: 0.30, management_execution: 0 };
  }
  if (riskCategory === 'normal') {
    return { violation: 0.35, driver_compliance: 0, training_compliance: 0.25, incident: 0.40, management_execution: 0 };
  }
  if (riskCategory === 'management') {
    if (managementLevel === 'frontline') {
      return { violation: 0.20, driver_compliance: 0, training_compliance: 0.15, incident: 0.25, management_execution: 0.40 };
    }
    if (managementLevel === 'middle') {
      return { violation: 0.15, driver_compliance: 0, training_compliance: 0.20, incident: 0.25, management_execution: 0.40 };
    }
    if (managementLevel === 'high') {
      return { violation: 0.10, driver_compliance: 0, training_compliance: 0.20, incident: 0.25, management_execution: 0.45 };
    }
  }
  throw new Error('Unknown weight matrix');
}
```

---

## 四、约束清单（Sprint6.2 必须遵守）

| 约束项 | 说明 |
|--------|------|
| 禁止修改 employee | employee 表结构保持不变 |
| 禁止修改组织模型 | hse_org_unit、hse_operation_unit 等组织表保持不变 |
| 禁止新增车辆管理 | 不建立车辆绑定主表，车辆仅作为事故/三检辅助信息 |
| 禁止修改风险积分规则 | 积分规则、扣分规则、岗位权重、风险等级、特殊规则均已冻结 |
| 禁止修改风险类型字典 | 5 个风险类型保持不变 |
| 禁止修改岗位风险映射 | 岗位-风险类型映射保持不变 |
| **禁止动态调整权重** | **权重矩阵完全冻结，禁止运行时修改** |
| 风险主体为 employee_id | 所有风险数据通过 employee_id 关联 |
| 驾驶员风险主体为 employee_id | 禁止以车辆作为风险主体 |
| 岗位与责任分离 | position 与 grid_level 独立管理，不耦合 |
| 禁止新增依赖 | 使用 Node.js 原生能力或现有依赖 |
| 禁止修改 Vben 核心目录 | packages/@core/、packages/effects/ 等保持不变 |
| 禁止创建自定义组件 | 仅在现有 components/hse/ 内调整 |
| 删除操作使用 Popconfirm | 非删除操作保留 Modal.confirm |

---

## 五、Sprint6.2 验收标准

### 5.1 功能验收

| 验收项 | 验收标准 |
|--------|----------|
| 风险评分计算 | 能根据 employee_id 计算出正确的风险积分总分和等级 |
| 风险类型积分 | 能输出 5 个风险类型各自的积分和明细 |
| 岗位权重应用 | 不同岗位类别+管理级别应用正确的冻结权重矩阵 |
| 责任独立查询 | 管理履职积分正确按 grid_level 计算巡查完成率 |
| 特殊加权叠加 | 触发特殊加权时正确在总分上叠加额外积分 |
| 特殊规则触发 | 触发跳级规则时正确覆盖计算结果 |
| 新增表创建 | `hse_grid_inspection_records` 表正确创建并可读写 |
| 字段扩展 | `position_risk_mapping.management_level` 正确添加并填充数据 |
| API 输出 | 响应结构符合 3.1 节规范 |

### 5.2 数据准确性验收

| 验收项 | 验收标准 |
|--------|----------|
| employee_id 关联 | 所有风险数据通过 employee_id 正确关联 |
| 统计周期 | 各风险类型按规定的统计周期查询数据 |
| 计算精度 | 积分计算结果与手动计算结果一致（误差 ≤ 0.1 分） |
| MIN(100, ...) | 所有风险类型积分不超过 100 分 |
| 权重冻结 | 权重矩阵与冻结版本完全一致，无动态调整 |
| 岗位与责任分离 | position 和 grid_level 分别独立查询，不互相依赖 |
| 巡查完成率 | 管理岗位按 grid_level 正确计算应巡查次数和完成率 |

### 5.3 约束合规验收

| 验收项 | 验收标准 |
|--------|----------|
| employee 未修改 | employee 表结构与 Sprint6.1 结束时一致 |
| 组织模型未修改 | 组织相关表结构与 Sprint6.1 结束时一致 |
| 未新增车辆绑定 | 未建立车辆绑定主表 |
| 未新增依赖 | package.json 未新增依赖 |
| 积分规则未修改 | 积分规则、权重、等级与冻结版本一致 |
| 权重未动态调整 | 代码中不存在运行时修改权重的逻辑 |

---

## 六、Sprint6.1 系列交付物总清单

### 6.1 已完成阶段

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

### 6.2 已确认基线

- 员工模型（employee_id 作为风险主体）
- 岗位模型（position 系统：岗位类别 + 管理级别）
- 责任模型（hse_responsibility 系统：grid_level 决定巡查要求）
- **岗位与责任分离架构**
- 风险类型（5 个标准化风险类型，四级分类）
- 风险数据来源（7 张数据表，统一 employee_id 关联）
- 岗位风险映射（10 个标准岗位 + 别名兼容 + management_level）
- 网格长等级固定映射（5 个岗位 → 4 个 grid_level）
- 风险积分规则（5 个风险类型积分规则，MIN(100, ...) 约束）
- **冻结权重矩阵**（5 类岗位，禁止动态调整）
- 风险等级（4 级风险等级，分值区间明确）
- 特殊规则（跳级规则 + 风险积分特殊加权机制）
- 术语统一（风险积分制，积分越高风险越高）

### 6.3 Sprint6.1-H-2 输出文件

| 文件名 | 说明 |
|--------|------|
| `Sprint6.1-H-2风险模型冻结报告.md` | 主报告，包含岗位责任分离、网格映射、字段扩展、权重冻结、特殊加权 |
| `Sprint6.2最终输入确认报告.md` | 本文件，Sprint6.2 开发唯一输入基线 |
| `岗位风险权重冻结版.md` | 冻结权重矩阵，含查询路径和冻结约束 |
| `岗位责任映射最终版.md` | 岗位与责任分离架构、网格长映射、职责边界 |

---

## 七、Sprint6.2 启动确认

本文件作为 Sprint6.2 风险评分计算引擎开发的**唯一输入基线**，Sprint6.2 开发时：

1. **必须严格遵循**本文件定义的所有规范
2. **不得擅自调整**任何已冻结的设计基线
3. **如需调整**，必须先回到 Sprint6.1 对应子任务进行设计变更，重新冻结后再进入 Sprint6.2
4. **开发完成后**，按本文件第五节验收标准进行验收

---

## 八、约束合规

| 约束项 | 状态 | 说明 |
|--------|------|------|
| 禁止开发评分代码 | 符合 | 本阶段仅输出设计文档，未开发代码 |
| 禁止修改 employee | 符合 | 未修改 employee 表 |
| 禁止修改组织模型 | 符合 | 未修改组织相关表 |
| 禁止新增车辆管理 | 符合 | 未建立车辆绑定 |
| 风险主体为 employee_id | 符合 | 所有设计均以 employee_id 为风险主体 |
| 驾驶员风险主体为 employee_id | 符合 | 禁止以车辆作为风险主体 |
| 岗位与责任分离 | 符合 | position 与 grid_level 独立管理 |
| 权重矩阵冻结 | 符合 | 禁止动态调整权重 |

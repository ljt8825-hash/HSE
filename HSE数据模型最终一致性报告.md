# HSE数据模型最终一致性报告

## 一、报告概述

| 项目 | 内容 |
|------|------|
| 报告名称 | HSE数据模型最终一致性报告 |
| 阶段 | Sprint6.3-A-2 员工关系模型一致性收口 |
| 报告日期 | 2026-07-22 |
| 报告目的 | 确认HSE系统所有数据模型的关联关系完全一致，作为驾驶舱开发的最终依据 |

## 二、数据模型总览

### 2.1 核心数据表清单

| 序号 | 表名 | 用途 | 创建阶段 | 关联字段 | 状态 |
|------|------|------|----------|----------|------|
| 1 | employee | 员工主数据 | 初始 | id | 已冻结，禁止修改 |
| 2 | position | 岗位主数据 | 初始 | id | 已有数据 |
| 3 | **employee_assignment** | **员工关系模型（最终）** | **Sprint6.3-A-2** | **employee_id** | **已创建+迁移** |
| 4 | hse_org_unit | 组织单元 | Sprint6.0 | id | 已有数据 |
| 5 | department | 部门 | 初始 | id | 已有数据 |
| 6 | hse_responsibility | 责任信息 | Sprint6.0 | employee_id | 已有数据 |
| 7 | position_risk_mapping | 岗位风险映射 | Sprint6.1-G | position_id | 已冻结 |
| 8 | risk_type_dict | 风险类型字典 | Sprint6.1-F | - | 已冻结 |
| 9 | risk_score_records | 风险评分记录 | Sprint6.2 | employee_id | 正常使用 |
| 10 | risk_level_records | 风险等级记录 | Sprint6.2 | employee_id | 正常使用 |
| 11 | risk_score_history | 风险评分历史 | Sprint6.3-A | employee_id | 已创建 |
| 12 | risk_level_config | 风险等级配置 | Sprint6.3-A | level_code | 已创建+配置 |
| 13 | violation_records | 三违记录 | 初始 | violator_id(=employee_id) | 正常使用 |
| 14 | license_demerit_records | 驾驶证扣分 | Sprint6.1-D | employee_id | 正常使用 |
| 15 | hse_driver_inspection_records | 三检记录 | Sprint6.1-E | employee_id | 正常使用 |
| 16 | hse_incident_records | 事故记录 | Sprint6.1-E | employee_id | 正常使用 |
| 17 | training_records | 培训记录 | 初始 | personnel_id(=employee_id) | 正常使用 |
| 18 | hse_grid_inspection_records | 网格巡查记录 | Sprint6.3-A | employee_id | 已创建 |

### 2.2 废弃表

| 表名 | 废弃原因 | 处理方式 |
|------|----------|----------|
| hse_employee_relation | 被 employee_assignment 替代 | 保留数据但禁止新代码引用，后续可归档 |

## 三、关联模型一致性确认

### 3.1 员工关系模型一致性

| 确认项 | 确认结果 |
|--------|----------|
| 最终员工关系模型 | **employee_assignment**（Sprint6.3-A-2确认） |
| 禁止使用的模型 | hse_employee_relation（禁止新代码引用） |
| 数据迁移完整性 | 1304条记录完整迁移，100%一致 |
| 驾驶员人数验证 | employee_assignment统计=43人 = hse_employee_relation统计=43人 ✓ |
| 代码引用清理 | 4个生产代码文件8处引用全部替换 ✓ |
| 功能验证 | 风险评分计算正常 ✓ |

### 3.2 风险主体关联一致性

| 风险数据表 | 关联字段 | 关联对象 | 一致性 |
|------------|----------|----------|--------|
| risk_score_records | employee_id | employee.id | ✓ 一致 |
| risk_level_records | employee_id | employee.id | ✓ 一致 |
| risk_score_history | employee_id | employee.id | ✓ 一致 |
| violation_records | violator_id | employee.id（值相同） | ✓ 一致 |
| training_records | personnel_id | employee.id（值相同） | ✓ 一致（输出统一为employee_id） |
| license_demerit_records | employee_id | employee.id | ✓ 一致 |
| hse_driver_inspection_records | employee_id | employee.id | ✓ 一致 |
| hse_incident_records | employee_id | employee.id | ✓ 一致 |
| hse_grid_inspection_records | employee_id | employee.id | ✓ 一致 |

### 3.3 岗位关联一致性

| 场景 | 关联路径 | 一致性 |
|------|----------|--------|
| 风险评分-岗位查询 | employee_assignment.position_id → position.id | ✓ 一致 |
| 岗位风险映射 | position_risk_mapping.position_id → position.id | ✓ 一致 |
| 驾驶员识别 | employee_assignment.position_id → position.name LIKE '%驾驶员%' | ✓ 一致 |
| 管理人员识别 | employee_assignment.position_id → position_risk_mapping.risk_category='management' | ✓ 一致 |

### 3.4 组织关联一致性

| 场景 | 关联路径 | 一致性 |
|------|----------|--------|
| 组织单元 | employee_assignment.org_unit_id → hse_org_unit.id | ✓ 一致 |
| 作业单元 | employee_assignment.operation_unit_id → hse_org_unit.id | ✓ 一致 |
| 部门 | hse_org_unit → department | ✓ 一致 |
| 责任区域 | hse_responsibility.responsible_org_id → hse_org_unit.id | ✓ 一致 |

### 3.5 风险等级配置一致性

| 确认项 | 确认结果 |
|--------|----------|
| 等级配置表 | risk_level_config（4级配置） |
| 等级代码 | low/medium/high/critical |
| 等级名称 | 低风险/一般风险/较高风险/重大风险 |
| 分值区间 | 0-25/26-50/51-75/76-100 |
| 颜色代码 | #52c41a/#faad14/#fa8c16/#f5222d |
| 评分代码引用 | riskScoreService.js中determineRiskLevel函数与配置一致 ✓ |
| 等级记录引用 | risk_level_records.risk_level_code与配置一致 ✓ |

### 3.6 岗位权重一致性

| 岗位类别 | 管理级别 | 代码权重 | 冻结权重 | 一致性 |
|----------|----------|----------|----------|--------|
| 驾驶员 | - | 20/35/15/30/0 | 20/35/15/30/0 | ✓ 一致 |
| 普通员工 | - | 35/0/25/40/0 | 35/0/25/40/0 | ✓ 一致 |
| 基层管理 | frontline | 20/0/15/25/40 | 20/0/15/25/40 | ✓ 一致 |
| 中层管理 | middle | 15/0/20/25/40 | 15/0/20/25/40 | ✓ 一致 |
| 高层管理 | high | 10/0/20/25/45 | 10/0/20/25/45 | ✓ 一致 |

## 四、数据流转一致性

### 4.1 风险评分数据流

```
employee.id（统一标识）
    ↓
employee_assignment（员工关系模型）
    ├── position_id → position_risk_mapping → risk_category + management_level
    ├── org_unit_id → hse_org_unit（组织信息）
    └── position_id → position（岗位名称）
    ↓
riskScoreService.js（风险评分计算引擎）
    ├── violation_records（violator_id = employee_id）
    ├── license_demerit_records（employee_id）
    ├── hse_driver_inspection_records（employee_id）
    ├── hse_incident_records（employee_id）
    ├── training_records（personnel_id = employee_id）
    ├── hse_grid_inspection_records（employee_id）
    └── hse_responsibility（employee_id → grid_level）
    ↓
risk_score_records（评分结果存储，employee_id）
    ↓
risk_level_records（等级记录存储，employee_id）
    ↓
risk_score_history（历史快照存储，employee_id）
    ↓
驾驶舱展示（通过employee_assignment关联组织/岗位/作业单元）
```

### 4.2 驾驶舱统计数据流

```
驾驶舱统计查询
    ├── 人员统计 → employee + employee_assignment
    ├── 等级统计 → risk_level_records + risk_level_config
    ├── 评分统计 → risk_score_records
    ├── 趋势统计 → risk_score_history
    ├── TOP排行 → risk_score_records + employee_assignment + hse_org_unit
    ├── 管理履职 → hse_grid_inspection_records + hse_responsibility
    └── 风险类型 → risk_score_records（各类型score字段）
```

## 五、一致性验证结果

| 验证维度 | 验证项数 | 通过数 | 通过率 |
|----------|----------|--------|--------|
| 员工关系模型 | 6 | 6 | 100% |
| 风险主体关联 | 9 | 9 | 100% |
| 岗位关联 | 4 | 4 | 100% |
| 组织关联 | 4 | 4 | 100% |
| 风险等级配置 | 7 | 7 | 100% |
| 岗位权重 | 5 | 5 | 100% |
| 数据流转 | 2 | 2 | 100% |
| **合计** | **37** | **37** | **100%** |

## 六、冻结模型清单

| 冻结项 | 冻结阶段 | 当前状态 |
|--------|----------|----------|
| employee_id作为风险主体 | Sprint6.1-E | ✓ 全部9张风险表使用employee_id |
| position_id岗位关联 | Sprint6.1-G | ✓ 通过employee_assignment关联 |
| grid_level责任角色 | Sprint6.1-H-2 | ✓ 通过hse_responsibility获取 |
| risk_type_dict风险类型 | Sprint6.1-F | ✓ 5个标准化风险类型 |
| position_risk_mapping岗位风险映射 | Sprint6.1-G | ✓ 含management_level字段 |
| 岗位权重矩阵 | Sprint6.1-H-2 | ✓ 5类岗位权重冻结 |
| 风险积分规则 | Sprint6.1-H-2 | ✓ 5个风险类型积分规则冻结 |
| risk_level_config风险等级配置 | Sprint6.3-A | ✓ 4级配置参数化 |
| employee_assignment员工关系模型 | Sprint6.3-A-2 | ✓ 确认为最终模型 |

## 七、约束遵守

| 约束 | 遵守情况 |
|------|----------|
| 禁止修改风险评分规则 | ✓ 未修改任何评分计算逻辑 |
| 禁止修改岗位权重 | ✓ FROZEN_WEIGHT_MATRIX未变 |
| 禁止修改员工主数据 | ✓ employee表未变 |
| 禁止新增车辆模型 | ✓ 未新增车辆相关内容 |

## 八、最终结论

HSE系统数据模型一致性收口完成，37项一致性验证全部通过：

1. **员工关系模型统一**：employee_assignment为唯一员工关系模型，hse_employee_relation不再使用
2. **风险主体统一**：全部9张风险数据表使用employee_id关联employee.id
3. **岗位关联统一**：通过employee_assignment.position_id关联position表
4. **组织关联统一**：通过employee_assignment.org_unit_id/operation_unit_id关联hse_org_unit
5. **等级配置统一**：risk_level_config参数化管理4级风险等级
6. **权重冻结一致**：5类岗位权重代码与冻结矩阵完全一致
7. **数据流转完整**：从风险事实数据到评分计算到驾驶舱展示，全链路关联一致

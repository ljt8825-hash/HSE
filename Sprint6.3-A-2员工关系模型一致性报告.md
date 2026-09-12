# Sprint6.3-A-2 员工关系模型一致性报告

## 一、阶段概述

| 项目 | 内容 |
|------|------|
| 阶段名称 | Sprint6.3-A-2 员工关系模型一致性收口 |
| 前置阶段 | Sprint6.3-A-1 驾驶舱指标优化收口 |
| 收口目标 | 统一HSE系统员工关联模型，确保风险计算、驾驶舱统计、岗位统计、组织统计全部使用 employee_assignment |
| 收口日期 | 2026-07-22 |
| 收口状态 | 已完成 |

## 二、问题背景

### 2.1 问题发现

驾驶舱数据来源（Sprint6.3-A-1）中所有人员/岗位/组织统计SQL使用 `hse_employee_relation` 表，但员工主数据冻结模型定义的最终员工关系模型为 `employee_assignment`，两者不一致。

### 2.2 影响分析

| 影响范围 | 说明 |
|----------|------|
| 风险评分计算 | riskScoreService.js 中 getPositionInfo 使用 hse_employee_relation 查询岗位 |
| 风险画像接口 | hse-risk-profile.js 中4处JOIN使用 hse_employee_relation |
| 风险画像基础 | hse-risk-profile-base.js 中1处JOIN使用 hse_employee_relation |
| 危险源管理 | hazards.js 中2处JOIN使用 hse_employee_relation |
| 驾驶舱统计SQL | Sprint6.3-A-1 报告中所有统计SQL使用 hse_employee_relation |

## 三、模型确认

### 3.1 最终员工关系模型

| 项目 | 内容 |
|------|------|
| 表名 | **employee_assignment** |
| 用途 | HSE系统唯一的员工-岗位-组织关系模型 |
| 状态 | 已创建，已迁移数据 |
| 禁止 | 禁止继续使用 hse_employee_relation 作为查询入口 |
| 禁止 | 禁止新增 hse_employee_relation 引用 |

### 3.2 employee_assignment 表结构

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | BIGSERIAL | 主键 |
| employee_id | BIGINT | 员工ID（FK→employee.id） |
| org_unit_id | BIGINT | 组织单元ID（FK→hse_org_unit.id） |
| operation_unit_id | BIGINT | 作业单元ID（FK→hse_org_unit.id） |
| position_id | BIGINT | 岗位ID（FK→position.id） |
| supervisor_id | BIGINT | 上级员工ID |
| is_current | BOOLEAN | 是否当前任职 |
| status | VARCHAR(32) | 状态（active/inactive） |
| is_primary | BOOLEAN | 是否主岗位 |
| start_date | DATE | 任职开始日期 |
| end_date | DATE | 任职结束日期 |
| remark | TEXT | 备注 |
| created_by | VARCHAR(64) | 创建人 |
| created_at | TIMESTAMPTZ | 创建时间 |
| updated_at | TIMESTAMPTZ | 更新时间 |
| is_deleted | BOOLEAN | 软删除标记 |

### 3.3 索引设计

| 索引名 | 字段 | 用途 |
|--------|------|------|
| idx_assignment_employee_id | employee_id | 按员工查询关系 |
| idx_assignment_position_id | position_id | 按岗位筛选员工 |
| idx_assignment_org_unit_id | org_unit_id | 按组织筛选员工 |
| idx_assignment_operation_unit_id | operation_unit_id | 按作业单元筛选员工 |
| idx_assignment_current | is_current, is_deleted | 筛选当前有效记录 |

### 3.4 数据迁移验证

| 验证项 | hse_employee_relation | employee_assignment | 一致性 |
|--------|----------------------|---------------------|--------|
| 总记录数 | 1304 | 1304 | ✓ 一致 |
| 有效记录数（is_deleted=false） | 1304 | 1304 | ✓ 一致 |
| 当前在职员工数（is_current=true） | 1304 | 1304 | ✓ 一致 |
| 驾驶员人数 | 43 | 43 | ✓ 一致 |
| 字段结构 | 16个字段 | 16个字段 | ✓ 一致 |

## 四、影响范围检查与调整

### 4.1 风险评分表关联字段确认

| 表名 | 关联字段 | 字段含义 | 状态 |
|------|----------|----------|------|
| risk_score_records | employee_id | 员工ID | ✓ 已统一 |
| risk_level_records | employee_id | 员工ID | ✓ 已统一 |
| risk_score_history | employee_id | 员工ID | ✓ 已统一 |
| hse_incident_records | employee_id | 员工ID | ✓ 已统一 |
| violation_records | violator_id | 违规人ID（=employee_id） | ✓ 已统一 |
| training_records | personnel_id | 人员ID（=employee_id） | ✓ 逻辑统一（输出用employee_id） |
| license_demerit_records | employee_id | 员工ID | ✓ 已统一 |
| hse_driver_inspection_records | employee_id | 员工ID | ✓ 已统一 |
| hse_grid_inspection_records | employee_id | 员工ID | ✓ 已统一 |

### 4.2 代码文件调整

| 文件 | 引用次数 | 调整方式 | 验证结果 |
|------|----------|----------|----------|
| [riskScoreService.js](file:///f:/deploy/hse-dashboard/server/services/riskScoreService.js) | 1处 | hse_employee_relation → employee_assignment | ✓ 功能正常 |
| [hse-risk-profile.js](file:///f:/deploy/hse-dashboard/server/routes/hse-risk-profile.js) | 4处 | hse_employee_relation → employee_assignment | ✓ 已替换 |
| [hse-risk-profile-base.js](file:///f:/deploy/hse-dashboard/server/routes/hse-risk-profile-base.js) | 1处 | hse_employee_relation → employee_assignment | ✓ 已替换 |
| [hazards.js](file:///f:/deploy/hse-dashboard/server/routes/hazards.js) | 2处 | hse_employee_relation → employee_assignment | ✓ 已替换 |

### 4.3 功能验证

| 验证项 | 验证方式 | 结果 |
|--------|----------|------|
| 风险评分计算 | calculateRiskScore(5360) | ✓ 正常返回（得分7.5，低风险） |
| 岗位识别 | position.name = "环卫作业中心片区长" | ✓ 正确 |
| 风险类别识别 | risk_category = "management" | ✓ 正确 |
| 管理级别识别 | management_level = "frontline" | ✓ 正确 |

## 五、驾驶舱SQL调整

### 5.1 统一替换规则

所有驾驶舱统计SQL中的 `hse_employee_relation` 统一替换为 `employee_assignment`，别名从 `er` 调整为 `ea`。

### 5.2 调整后SQL示例

```sql
-- 驾驶员人数统计（修正版）
SELECT COUNT(DISTINCT ea.employee_id) as driver_count
FROM employee_assignment ea
JOIN position p ON ea.position_id = p.id
WHERE (p.name LIKE '%驾驶员%' OR p.name LIKE '%司机%')
  AND ea.is_current = true
  AND ea.is_deleted = false;

-- 风险TOP部门（修正版）
SELECT ou.id as org_id, ou.org_name,
       ROUND(AVG(r.final_score), 2) as avg_score,
       COUNT(*) FILTER (WHERE r.risk_level_code IN ('high','critical')) as high_risk_count,
       COUNT(*) as total_count
FROM risk_score_records r
JOIN employee_assignment ea ON r.employee_id = ea.employee_id 
  AND ea.is_current = true AND ea.is_deleted = false
JOIN hse_org_unit ou ON ea.org_unit_id = ou.id AND ou.is_deleted = false
WHERE r.is_deleted = false
  AND r.id IN (SELECT MAX(id) FROM risk_score_records WHERE is_deleted = false GROUP BY employee_id)
GROUP BY ou.id, ou.org_name
ORDER BY avg_score DESC
LIMIT 5;

-- 风险TOP作业单元（修正版）
SELECT ou.id as unit_id, ou.org_name as unit_name,
       ROUND(AVG(r.final_score), 2) as avg_score,
       COUNT(*) FILTER (WHERE r.risk_level_code IN ('high','critical')) as high_risk_count,
       COUNT(*) as total_count
FROM risk_score_records r
JOIN employee_assignment ea ON r.employee_id = ea.employee_id 
  AND ea.is_current = true AND ea.is_deleted = false
JOIN hse_org_unit ou ON ea.operation_unit_id = ou.id AND ou.is_deleted = false
WHERE r.is_deleted = false
  AND r.id IN (SELECT MAX(id) FROM risk_score_records WHERE is_deleted = false GROUP BY employee_id)
GROUP BY ou.id, ou.org_name
ORDER BY avg_score DESC
LIMIT 5;
```

## 六、约束遵守

| 约束 | 遵守情况 |
|------|----------|
| 禁止修改风险评分规则 | ✓ 未修改riskScoreService.js中任何评分计算逻辑 |
| 禁止修改岗位权重 | ✓ 未修改FROZEN_WEIGHT_MATRIX |
| 禁止修改员工主数据 | ✓ 未修改employee表结构 |
| 禁止新增车辆模型 | ✓ 未新增任何车辆相关表或字段 |

## 七、交付文件

| 文件 | 类型 | 说明 |
|------|------|------|
| [migrate-employee-assignment.js](file:///f:/deploy/hse-dashboard/server/migrate-employee-assignment.js) | 迁移脚本 | 创建employee_assignment表+迁移数据 |
| [riskScoreService.js](file:///f:/deploy/hse-dashboard/server/services/riskScoreService.js) | 核心服务 | 已替换为employee_assignment |
| [hse-risk-profile.js](file:///f:/deploy/hse-dashboard/server/routes/hse-risk-profile.js) | 路由接口 | 已替换为employee_assignment |
| [hse-risk-profile-base.js](file:///f:/deploy/hse-dashboard/server/routes/hse-risk-profile-base.js) | 路由接口 | 已替换为employee_assignment |
| [hazards.js](file:///f:/deploy/hse-dashboard/server/routes/hazards.js) | 路由接口 | 已替换为employee_assignment |

## 八、收口总结

Sprint6.3-A-2员工关系模型一致性收口完成：

1. **模型统一**：确认 employee_assignment 为HSE系统唯一的员工关系模型，禁止继续使用 hse_employee_relation
2. **数据迁移**：从 hse_employee_relation 完整迁移1304条记录到 employee_assignment，数据完全一致
3. **代码调整**：4个生产代码文件共8处引用全部替换为 employee_assignment
4. **功能验证**：风险评分计算功能正常，岗位/风险类别/管理级别识别正确
5. **关联字段确认**：9张风险相关表全部使用 employee_id 作为统一关联字段

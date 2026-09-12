# Sprint6.3-A-1 驾驶舱指标优化报告

## 一、阶段概述

| 项目 | 内容 |
|------|------|
| 阶段名称 | Sprint6.3-A-1 驾驶舱指标体系优化收口 |
| 前置阶段 | Sprint6.3-A HSE驾驶舱指标体系设计 |
| 优化目标 | 指标规范统一、风险等级区分、人员统计来源收口、培训数据统一、新增指标、管理履职拆分 |
| 优化日期 | 2026-07-22 |
| 优化状态 | 已完成 |

## 二、指标规范优化

### 2.1 risk_level_config 统一配置

所有风险等级展示统一从 risk_level_config 表读取，禁止硬编码。

| level_code | level_name | level_order | min_score | max_score | color_code | 说明 |
|------------|------------|-------------|-----------|-----------|------------|------|
| low | 低风险 | 1 | 0 | 25 | #52c41a | 风险处于可控范围，常规管理即可 |
| medium | 一般风险 | 2 | 26 | 50 | #faad14 | 存在一定风险因素，需要关注和跟踪 |
| high | 较高风险 | 3 | 51 | 75 | #fa8c16 | 风险较高，需要重点管控和干预 |
| critical | 重大风险 | 4 | 76 | 100 | #f5222d | 风险极高，需要立即采取管控措施 |

### 2.2 统一规范要点

| 规范项 | 要求 |
|--------|------|
| 风险等级代码 | 统一使用 level_code（low/medium/high/critical） |
| 风险等级名称 | 统一使用 level_name（低风险/一般风险/较高风险/重大风险） |
| 分值范围 | 统一从 min_score/max_score 读取，禁止硬编码分值区间 |
| 展示颜色 | 统一从 color_code 读取，禁止前端自定义颜色 |
| 等级排序 | 统一使用 level_order 排序 |

## 三、风险等级区分

### 3.1 等级类型定义

| 等级类型 | 定义 | 数据来源 | 用途 |
|----------|------|----------|------|
| 员工综合风险等级 | 基于全部5个风险类型加权计算后的总得分判定的等级 | risk_level_records.risk_level | 驾驶舱总览、等级分布、高风险清单 |
| 单项风险等级 | 基于单个风险类型积分判定的等级 | risk_score_records中各类型score字段 | 风险类型分析、专项监控 |

### 3.2 禁止混用规则

| 场景 | 正确用法 | 错误用法 |
|------|----------|----------|
| 驾驶舱总览 - 高风险人数 | 综合风险等级 = critical/high | 用单项事故等级=high统计 |
| 驾驶舱总览 - 等级分布 | 综合风险等级4级分布 | 混入单项等级 |
| 风险类型分析 - 三违高风险 | 三违积分≥51（单项等级=high） | 用综合等级代替 |
| 风险类型分析 - 事故高风险 | 事故积分≥51（单项等级=high） | 用综合等级代替 |
| 员工清单 - 风险等级列 | 综合风险等级 | 显示单项等级 |

### 3.3 单项风险等级判定规则

单项风险等级同样使用 risk_level_config 的分值区间判定，但仅应用于风险类型分析场景：

| 单项积分范围 | 单项等级 | 应用场景 |
|-------------|----------|----------|
| 0-25 | 低风险 | 该风险类型处于可控状态 |
| 26-50 | 一般风险 | 该风险类型需要关注 |
| 51-75 | 较高风险 | 该风险类型需要重点管控 |
| 76-100 | 重大风险 | 该风险类型需要立即干预 |

## 四、人员统计优化

### 4.1 统一 employee_id 来源

| 统计场景 | 来源表 | 关联字段 | 禁止方式 |
|----------|--------|----------|----------|
| 所有人员统计 | employee | employee.id | 禁止用name/employee_code关联 |
| 风险评分人员 | risk_score_records | employee_id | - |
| 风险等级人员 | risk_level_records | employee_id | - |
| 违规人员 | violation_records | violator_id（已映射为employee_id） | - |
| 培训人员 | training_records | personnel_id → employee_id（需转换） | 禁止直接用personnel_id |
| 事故人员 | hse_incident_records | employee_id | - |
| 驾驶扣分人员 | license_demerit_records | employee_id | - |
| 巡查人员 | hse_grid_inspection_records | employee_id | - |

### 4.2 驾驶员人数统计方式调整

**禁止方式**：通过 position_risk_mapping 表统计 risk_category = 'driver' 的人数

**原因**：position_risk_mapping 是岗位风险映射配置表，每个岗位名只有一条映射记录，但 position 表中存在同名岗位（如"垃圾收运车驾驶员"有 position_id=1385 和 1398 两条），映射表只关联了一个 position_id，导致统计漏人。

**正确方式**：通过 hse_employee_relation + position 表统计

```sql
-- 正确的驾驶员人数统计
SELECT COUNT(DISTINCT er.employee_id) as driver_count
FROM hse_employee_relation er
JOIN position p ON er.position_id = p.id
WHERE (p.name LIKE '%驾驶员%' OR p.name LIKE '%司机%')
  AND er.is_current = true
  AND er.is_deleted = false;
```

**数据验证**

| 统计方式 | 结果 | 说明 |
|----------|------|------|
| position_risk_mapping（禁止） | 6条岗位映射 | 仅统计映射表中的岗位，漏人 |
| hse_employee_relation + position（正确） | 43人 | 通过实际岗位关联统计，准确 |

### 4.3 各类人员统计SQL规范

```sql
-- 总员工数
SELECT COUNT(*) FROM employee WHERE is_deleted = false;

-- 已评估人数
SELECT COUNT(DISTINCT employee_id) FROM risk_level_records WHERE is_active = true AND is_deleted = false;

-- 驾驶员人数
SELECT COUNT(DISTINCT er.employee_id)
FROM hse_employee_relation er
JOIN position p ON er.position_id = p.id
WHERE (p.name LIKE '%驾驶员%' OR p.name LIKE '%司机%')
  AND er.is_current = true AND er.is_deleted = false;

-- 管理人员人数
SELECT COUNT(DISTINCT er.employee_id)
FROM hse_employee_relation er
JOIN position_risk_mapping prm ON er.position_id = prm.position_id
WHERE prm.risk_category = 'management' AND prm.is_active = true
  AND er.is_current = true AND er.is_deleted = false;
```

## 五、培训数据统一

### 5.1 问题说明

training_records 表当前使用 personnel_id 字段关联人员，与系统统一的 employee_id 标识不一致。

### 5.2 统一方案

| 项目 | 当前状态 | 统一后 |
|------|----------|--------|
| 关联字段 | personnel_id | employee_id |
| 字段含义 | 人员ID（培训系统标识） | 员工ID（统一标识） |
| 数据来源 | 培训系统导入 | employee.id |

### 5.3 转换规则

training_records.personnel_id 的值已与 employee.id 一致（前期数据模型收口已完成映射），驾驶舱查询时统一使用 employee_id 术语：

```sql
-- 驾驶舱培训查询统一写法
SELECT t.id, t.training_type, t.training_date, t.result, t.score,
       e.id as employee_id, e.employee_code, e.name as employee_name
FROM training_records t
JOIN employee e ON t.personnel_id = e.id
WHERE e.is_deleted = false AND t.is_deleted = false;
```

### 5.4 接口输出规范

所有驾驶舱接口输出培训相关数据时，字段名统一使用 employee_id，禁止输出 personnel_id：

```json
{
  "employeeId": 5360,
  "trainingRecords": [
    { "trainingType": "安全培训", "result": "合格", "score": 95 }
  ]
}
```

## 六、新增指标

### 6.1 风险改善率

| 项目 | 说明 |
|------|------|
| 指标定义 | 一定周期内风险等级下降的员工数占总评估人数的比例 |
| 计算公式 | 风险改善率 = 等级下降人数 / 总评估人数 × 100% |
| 数据来源 | risk_level_records.level_change |
| 计算周期 | 近30天/近90天/近12月 |

```sql
-- 风险改善率
SELECT 
  COUNT(*) FILTER (WHERE level_change = 'level_down') as improved_count,
  COUNT(*) as total_count,
  ROUND(COUNT(*) FILTER (WHERE level_change = 'level_down') * 100.0 / NULLIF(COUNT(*), 0), 2) as improvement_rate
FROM risk_level_records
WHERE valid_from >= CURRENT_DATE - INTERVAL '30 days'
  AND is_deleted = false;
```

### 6.2 风险TOP10人员

| 项目 | 说明 |
|------|------|
| 指标定义 | 综合风险评分最高的前10名员工 |
| 数据来源 | risk_score_records.final_score |
| 排序规则 | final_score DESC |
| 展示信息 | 员工姓名、岗位、组织、综合得分、风险等级 |

```sql
-- 风险TOP10人员
SELECT r.employee_id, r.employee_name, r.position_name, r.final_score, 
       r.risk_level, r.risk_level_code
FROM risk_score_records r
WHERE r.is_deleted = false
  AND r.id IN (SELECT MAX(id) FROM risk_score_records WHERE is_deleted = false GROUP BY employee_id)
ORDER BY r.final_score DESC
LIMIT 10;
```

### 6.3 风险TOP部门

| 项目 | 说明 |
|------|------|
| 指标定义 | 平均风险评分最高的前5个部门 |
| 数据来源 | risk_score_records + department |
| 排序规则 | AVG(final_score) DESC |
| 展示信息 | 部门名称、平均分、高风险人数、总人数 |

```sql
-- 风险TOP部门
SELECT d.id as dept_id, d.name as dept_name,
       ROUND(AVG(r.final_score), 2) as avg_score,
       COUNT(*) FILTER (WHERE r.risk_level_code IN ('high','critical')) as high_risk_count,
       COUNT(*) as total_count
FROM risk_score_records r
JOIN hse_employee_relation er ON r.employee_id = er.employee_id AND er.is_current = true AND er.is_deleted = false
JOIN hse_org_unit d ON er.org_unit_id = d.id AND d.is_deleted = false
WHERE r.is_deleted = false
  AND r.id IN (SELECT MAX(id) FROM risk_score_records WHERE is_deleted = false GROUP BY employee_id)
GROUP BY d.id, d.name
ORDER BY avg_score DESC
LIMIT 5;
```

### 6.4 风险TOP作业单元

| 项目 | 说明 |
|------|------|
| 指标定义 | 平均风险评分最高的前5个作业单元 |
| 数据来源 | risk_score_records + hse_employee_relation.operation_unit_id |
| 排序规则 | AVG(final_score) DESC |
| 展示信息 | 作业单元名称、平均分、高风险人数、总人数 |

```sql
-- 风险TOP作业单元
SELECT ou.id as unit_id, ou.org_name as unit_name,
       ROUND(AVG(r.final_score), 2) as avg_score,
       COUNT(*) FILTER (WHERE r.risk_level_code IN ('high','critical')) as high_risk_count,
       COUNT(*) as total_count
FROM risk_score_records r
JOIN hse_employee_relation er ON r.employee_id = er.employee_id AND er.is_current = true AND er.is_deleted = false
JOIN hse_org_unit ou ON er.operation_unit_id = ou.id AND ou.is_deleted = false
WHERE r.is_deleted = false
  AND r.id IN (SELECT MAX(id) FROM risk_score_records WHERE is_deleted = false GROUP BY employee_id)
GROUP BY ou.id, ou.org_name
ORDER BY avg_score DESC
LIMIT 5;
```

## 七、管理履职指标拆分

### 7.1 三类指标定义

| 指标类别 | 指标名称 | 定义 | 计算公式 | 数据来源 |
|----------|----------|------|----------|----------|
| 执行指标 | 巡查完成率 | 网格长按频次要求执行巡查的完成程度 | 实际巡查次数 / 应巡查次数 × 100% | hse_grid_inspection_records + hse_responsibility |
| 质量指标 | 问题发现率 | 巡查中发现问题的比例 | 发现问题的巡查次数 / 总巡查次数 × 100% | hse_grid_inspection_records.problems_found |
| 闭环指标 | 整改完成率 | 发现问题的整改闭环程度 | 已整改数 / 应整改数 × 100% | hse_grid_inspection_records.rectification_status |

### 7.2 执行指标 - 巡查完成率

```sql
-- 巡查完成率（按网格级别）
SELECT gi.grid_level,
       COUNT(*) as actual_count,
       CASE 
         WHEN gi.grid_level = 'chief' THEN CEIL(30/3.0)
         WHEN gi.grid_level = 'level1' THEN CEIL(30/2.0)
         WHEN gi.grid_level IN ('level2','level3') THEN 30
       END as expected_count,
       ROUND(COUNT(*) * 100.0 / NULLIF(CASE 
         WHEN gi.grid_level = 'chief' THEN CEIL(30/3.0)
         WHEN gi.grid_level = 'level1' THEN CEIL(30/2.0)
         WHEN gi.grid_level IN ('level2','level3') THEN 30
       END, 0), 2) as completion_rate
FROM hse_grid_inspection_records gi
WHERE gi.inspection_date >= CURRENT_DATE - INTERVAL '30 days'
  AND gi.is_deleted = false
GROUP BY gi.grid_level
ORDER BY gi.grid_level;
```

### 7.3 质量指标 - 问题发现率

```sql
-- 问题发现率
SELECT gi.grid_level,
       COUNT(*) as total_inspections,
       COUNT(*) FILTER (WHERE gi.problems_found IS NOT NULL AND gi.problems_found != '') as problem_count,
       ROUND(COUNT(*) FILTER (WHERE gi.problems_found IS NOT NULL AND gi.problems_found != '') * 100.0 / NULLIF(COUNT(*), 0), 2) as problem_found_rate
FROM hse_grid_inspection_records gi
WHERE gi.inspection_date >= CURRENT_DATE - INTERVAL '30 days'
  AND gi.is_deleted = false
GROUP BY gi.grid_level
ORDER BY gi.grid_level;
```

### 7.4 闭环指标 - 整改完成率

```sql
-- 整改完成率
SELECT gi.grid_level,
       COUNT(*) FILTER (WHERE gi.problems_found IS NOT NULL AND gi.problems_found != '') as total_problems,
       COUNT(*) FILTER (WHERE gi.rectification_status = 'completed') as completed_count,
       COUNT(*) FILTER (WHERE gi.rectification_status = 'pending') as pending_count,
       COUNT(*) FILTER (WHERE gi.rectification_status = 'overdue') as overdue_count,
       ROUND(COUNT(*) FILTER (WHERE gi.rectification_status = 'completed') * 100.0 / 
             NULLIF(COUNT(*) FILTER (WHERE gi.problems_found IS NOT NULL AND gi.problems_found != ''), 0), 2) as rectification_rate
FROM hse_grid_inspection_records gi
WHERE gi.inspection_date >= CURRENT_DATE - INTERVAL '30 days'
  AND gi.is_deleted = false
GROUP BY gi.grid_level
ORDER BY gi.grid_level;
```

### 7.5 三类指标驾驶舱展示

| 指标 | 展示形式 | 面板位置 |
|------|----------|----------|
| 巡查完成率 | 仪表盘/进度条 | 管理履职面板 - 执行 |
| 问题发现率 | 百分比卡片 | 管理履职面板 - 质量 |
| 整改完成率 | 仪表盘/进度条 | 管理履职面板 - 闭环 |
| 逾期未整改数 | 红色数字警示 | 管理履职面板 - 闭环 |

## 八、优化前后对比

| 优化项 | 优化前 | 优化后 |
|--------|--------|--------|
| 风险等级配置 | 硬编码在代码中 | risk_level_config参数化 |
| 风险等级区分 | 综合等级与单项等级混用 | 严格区分，禁止混用 |
| 驾驶员人数统计 | position_risk_mapping（漏人） | hse_employee_relation + position（准确43人） |
| 培训数据字段 | personnel_id | 统一为employee_id |
| 新增指标 | 无改善率/TOP排行 | 增加改善率+TOP10人员+TOP部门+TOP作业单元 |
| 管理履职指标 | 巡查完成率/问题发现率/整改完成率混合 | 拆分为执行/质量/闭环三类 |

## 九、约束遵守

| 约束 | 遵守情况 |
|------|----------|
| 禁止修改风险评分模型 | ✓ 未修改riskScoreService.js评分逻辑 |
| 禁止修改岗位权重 | ✓ 未修改FROZEN_WEIGHT_MATRIX |
| 禁止修改员工主数据 | ✓ 未修改employee表结构 |

## 十、优化总结

Sprint6.3-A-1驾驶舱指标体系优化收口完成，核心优化6项：

1. **指标规范统一**：risk_level_config参数化管理，统一代码/名称/分值/颜色
2. **风险等级区分**：综合风险等级与单项风险等级严格区分，禁止混用
3. **人员统计收口**：所有统计基于employee_id，驾驶员人数改用hse_employee_relation统计（43人，准确）
4. **培训数据统一**：personnel_id统一为employee_id，接口输出禁止personnel_id
5. **新增4项指标**：风险改善率、风险TOP10人员、风险TOP部门、风险TOP作业单元
6. **管理履职三拆**：执行指标（巡查完成率）、质量指标（问题发现率）、闭环指标（整改完成率）

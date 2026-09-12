# 驾驶舱SQL关联模型修正版

## 一、修正说明

本文档为Sprint6.3-A-1驾驶舱数据来源确认表的SQL修正版，所有SQL中的 `hse_employee_relation` 统一替换为 `employee_assignment`，别名从 `er` 改为 `ea`。

## 二、人员统计SQL（修正版）

### 2.1 总员工数

```sql
SELECT COUNT(*) FROM employee WHERE is_deleted = false;
```

### 2.2 已评估人数

```sql
SELECT COUNT(DISTINCT employee_id) 
FROM risk_level_records 
WHERE is_active = true AND is_deleted = false;
```

### 2.3 驾驶员人数

```sql
-- 修正：hse_employee_relation → employee_assignment
SELECT COUNT(DISTINCT ea.employee_id) as driver_count
FROM employee_assignment ea
JOIN position p ON ea.position_id = p.id
WHERE (p.name LIKE '%驾驶员%' OR p.name LIKE '%司机%')
  AND ea.is_current = true
  AND ea.is_deleted = false;
```

### 2.4 管理人员人数

```sql
-- 修正：hse_employee_relation → employee_assignment
SELECT COUNT(DISTINCT ea.employee_id)
FROM employee_assignment ea
JOIN position_risk_mapping prm ON ea.position_id = prm.position_id
WHERE prm.risk_category = 'management' AND prm.is_active = true
  AND ea.is_current = true 
  AND ea.is_deleted = false;
```

### 2.5 普通员工人数

```sql
-- 修正：hse_employee_relation → employee_assignment
SELECT COUNT(DISTINCT ea.employee_id)
FROM employee_assignment ea
JOIN position_risk_mapping prm ON ea.position_id = prm.position_id
WHERE prm.risk_category = 'normal' AND prm.is_active = true
  AND ea.is_current = true 
  AND ea.is_deleted = false;
```

## 三、风险等级统计SQL（修正版）

### 3.1 高风险人数

```sql
SELECT COUNT(*) as high_risk_count
FROM risk_level_records
WHERE risk_level_code IN ('high', 'critical')
  AND is_active = true
  AND is_deleted = false;
```

### 3.2 风险等级分布

```sql
SELECT rlc.level_code, rlc.level_name, rlc.color_code,
       COUNT(*) as count
FROM risk_level_records rlr
JOIN risk_level_config rlc ON rlr.risk_level_code = rlc.level_code
WHERE rlr.is_active = true AND rlr.is_deleted = false
  AND rlc.is_enabled = true AND rlc.is_deleted = false
GROUP BY rlc.level_code, rlc.level_name, rlc.color_code, rlc.level_order
ORDER BY rlc.level_order;
```

### 3.3 平均风险评分

```sql
SELECT ROUND(AVG(final_score), 2) as avg_score
FROM risk_score_records r
WHERE r.is_deleted = false
  AND r.id IN (SELECT MAX(id) FROM risk_score_records WHERE is_deleted = false GROUP BY employee_id);
```

## 四、风险TOP排行SQL（修正版）

### 4.1 风险TOP10人员

```sql
SELECT r.employee_id, r.employee_name, r.position_name, 
       r.final_score, r.risk_level, r.risk_level_code
FROM risk_score_records r
WHERE r.is_deleted = false
  AND r.id IN (SELECT MAX(id) FROM risk_score_records WHERE is_deleted = false GROUP BY employee_id)
ORDER BY r.final_score DESC
LIMIT 10;
```

### 4.2 风险TOP部门

```sql
-- 修正：hse_employee_relation → employee_assignment
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
```

### 4.3 风险TOP作业单元

```sql
-- 修正：hse_employee_relation → employee_assignment
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

## 五、风险改善率SQL（修正版）

```sql
SELECT 
  COUNT(*) FILTER (WHERE level_change = 'level_down') as improved_count,
  COUNT(*) as total_count,
  ROUND(COUNT(*) FILTER (WHERE level_change = 'level_down') * 100.0 / NULLIF(COUNT(*), 0), 2) as improvement_rate
FROM risk_level_records
WHERE valid_from >= CURRENT_DATE - INTERVAL '30 days'
  AND is_deleted = false;
```

## 六、单项风险类型统计SQL（修正版）

### 6.1 三违风险

```sql
-- 三违平均积分
SELECT ROUND(AVG(violation_score), 2) as avg_score
FROM risk_score_records r
WHERE r.is_deleted = false
  AND r.id IN (SELECT MAX(id) FROM risk_score_records WHERE is_deleted = false GROUP BY employee_id);

-- 三违高风险人数（单项等级）
SELECT COUNT(*) as high_risk_count
FROM risk_score_records r
WHERE r.violation_score >= 51
  AND r.is_deleted = false
  AND r.id IN (SELECT MAX(id) FROM risk_score_records WHERE is_deleted = false GROUP BY employee_id);

-- 违规总数
SELECT COUNT(*) as total_violations
FROM violation_records
WHERE violator_id IS NOT NULL
  AND is_deleted = false
  AND violation_date >= CURRENT_DATE - INTERVAL '12 months';
```

### 6.2 驾驶风险

```sql
-- 驾驶合规平均积分（仅驾驶员）
SELECT ROUND(AVG(r.driver_compliance_score), 2) as avg_score
FROM risk_score_records r
WHERE r.is_deleted = false
  AND r.risk_category = 'driver'
  AND r.id IN (SELECT MAX(id) FROM risk_score_records WHERE is_deleted = false GROUP BY employee_id);

-- 驾驶员总人数（修正：通过employee_assignment统计）
SELECT COUNT(DISTINCT ea.employee_id) as driver_count
FROM employee_assignment ea
JOIN position p ON ea.position_id = p.id
WHERE (p.name LIKE '%驾驶员%' OR p.name LIKE '%司机%')
  AND ea.is_current = true
  AND ea.is_deleted = false;

-- 扣满12分人数
SELECT COUNT(DISTINCT employee_id) as over12_count
FROM license_demerit_records
WHERE is_deleted = false
  AND demerit_date >= CURRENT_DATE - INTERVAL '5 years'
GROUP BY employee_id
HAVING SUM(demerit_points) >= 12;
```

### 6.3 事故风险

```sql
-- 事故总数
SELECT COUNT(*) as total_incidents
FROM hse_incident_records
WHERE employee_id IS NOT NULL
  AND is_deleted = false;

-- 重大事故数
SELECT COUNT(*) as major_count
FROM hse_incident_records
WHERE level = '重大' AND is_deleted = false;
```

### 6.4 培训风险

```sql
-- 培训合格率（personnel_id统一为employee_id语义）
SELECT 
  COUNT(*) FILTER (WHERE result = '合格') as qualified_count,
  COUNT(*) as total_count,
  ROUND(COUNT(*) FILTER (WHERE result = '合格') * 100.0 / NULLIF(COUNT(*), 0), 2) as pass_rate
FROM training_records
WHERE is_deleted = false;
```

## 七、管理履职SQL（修正版）

### 7.1 巡查完成率（执行指标）

```sql
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

### 7.2 问题发现率（质量指标）

```sql
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

### 7.3 整改完成率（闭环指标）

```sql
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

## 八、趋势分析SQL（修正版）

### 8.1 平均分趋势

```sql
SELECT calculate_date,
       ROUND(AVG(total_score), 2) as avg_score,
       COUNT(*) as employee_count,
       COUNT(*) FILTER (WHERE risk_level_code IN ('high','critical')) as high_risk_count
FROM risk_score_history
WHERE calculate_period = $1
  AND calculate_date >= $2
  AND is_deleted = false
GROUP BY calculate_date
ORDER BY calculate_date;
```

### 8.2 等级分布趋势

```sql
SELECT calculate_date,
       risk_level_code,
       risk_level,
       COUNT(*) as count
FROM risk_score_history
WHERE calculate_period = $1
  AND calculate_date >= $2
  AND is_deleted = false
GROUP BY calculate_date, risk_level_code, risk_level
ORDER BY calculate_date, risk_level_code;
```

## 九、修正前后对比

| SQL场景 | 修正前 | 修正后 | 影响文件 |
|---------|--------|--------|----------|
| 驾驶员人数统计 | FROM hse_employee_relation er | FROM employee_assignment ea | riskScoreService.js |
| 风险TOP部门 | JOIN hse_employee_relation er | JOIN employee_assignment ea | 驾驶舱接口（待开发） |
| 风险TOP作业单元 | JOIN hse_employee_relation er | JOIN employee_assignment ea | 驾驶舱接口（待开发） |
| 管理人员统计 | FROM hse_employee_relation er | FROM employee_assignment ea | 驾驶舱接口（待开发） |
| 普通员工统计 | FROM hse_employee_relation er | FROM employee_assignment ea | 驾驶舱接口（待开发） |
| 岗位查询 | FROM hse_employee_relation er | FROM employee_assignment ea | riskScoreService.js |
| 风险画像 | JOIN hse_employee_relation er | JOIN employee_assignment ea | hse-risk-profile.js, hse-risk-profile-base.js |
| 危险源 | JOIN hse_employee_relation ear | JOIN employee_assignment ea | hazards.js |

## 十、关联模型关系图（修正版）

```
employee（员工主表）
    │
    └── id = employee_assignment.employee_id（最终员工关系模型）
            ├── position_id → position（岗位）
            ├── org_unit_id → hse_org_unit（组织单元）
            ├── operation_unit_id → hse_org_unit（作业单元）
            └── supervisor_id → employee（上级）
    
    所有风险数据表统一关联 employee_id：
    ├── risk_score_records.employee_id
    ├── risk_level_records.employee_id
    ├── risk_score_history.employee_id
    ├── violation_records.violator_id（= employee_id）
    ├── license_demerit_records.employee_id
    ├── hse_driver_inspection_records.employee_id
    ├── hse_incident_records.employee_id
    ├── training_records.personnel_id（= employee_id，输出统一为employee_id）
    └── hse_grid_inspection_records.employee_id
```

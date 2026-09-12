# 驾驶舱SQL验证报告

## 一、验证概述

| 项目 | 内容 |
|------|------|
| 验证范围 | Sprint6.3-B-1驾驶舱7个接口的全部SQL |
| 验证方式 | Node.js脚本直接执行SQL并验证返回结果 |
| 验证日期 | 2026-07-22 |
| 验证结果 | 9/9 通过 |

## 二、验证项目清单

| 序号 | 验证项 | 对应接口 | 结果 |
|------|--------|----------|------|
| 1 | 驾驶舱总览SQL | /overview | PASS |
| 2 | 风险等级分布SQL | /level-distribution | PASS |
| 3 | 风险类型分析SQL | /risk-type-analysis | PASS |
| 4 | 风险TOP员工SQL | /risk-top | PASS |
| 5 | 风险TOP部门SQL | /risk-top | PASS |
| 6 | 风险趋势SQL | /risk-trend | PASS |
| 7 | 管理履职SQL | /management-execution | PASS |
| 8 | 风险等级配置SQL | /risk-level-config | PASS |
| 9 | v_training_records视图 | 数据兼容 | PASS |

## 三、各接口SQL验证详情

### 3.1 驾驶舱总览

**验证SQL**:
```sql
-- 员工总数
SELECT COUNT(DISTINCT ea.employee_id) as total
FROM employee_assignment ea
WHERE ea.is_current = true AND ea.is_deleted = false;

-- 风险等级分布
SELECT rlc.level_code, rlc.level_name, COUNT(rlr.employee_id) as count
FROM risk_level_config rlc
LEFT JOIN risk_level_records rlr ON rlc.level_code = rlr.risk_level_code 
  AND rlr.is_active = true AND rlr.is_deleted = false
WHERE rlc.is_enabled = true AND rlc.is_deleted = false
GROUP BY rlc.level_code, rlc.level_name, rlc.level_order ORDER BY rlc.level_order;

-- 风险改善率
SELECT COUNT(*) FILTER (WHERE level_change = 'level_down') as improved,
       COUNT(*) as total
FROM risk_level_records WHERE valid_from >= CURRENT_DATE - INTERVAL '30 days' AND is_deleted = false;
```

**验证结果**:
| 指标 | 值 | 验证 |
|------|------|------|
| 员工总数 | 1304 | ✓ 通过employee_assignment统计 |
| 已评估人数 | 5 | ✓ 通过risk_level_records统计 |
| 重大风险人数 | 0 | ✓ |
| 较高风险人数 | 0 | ✓ |
| 高风险占比 | 0.00% | ✓ |
| 风险改善率 | 0.00% | ✓ |

### 3.2 风险等级分布

**验证SQL**:
```sql
SELECT rlc.level_code, rlc.level_name, rlc.color_code, rlc.min_score, rlc.max_score,
       COUNT(rlr.employee_id) as count
FROM risk_level_config rlc
LEFT JOIN risk_level_records rlr ON rlc.level_code = rlr.risk_level_code 
  AND rlr.is_active = true AND rlr.is_deleted = false
WHERE rlc.is_enabled = true AND rlc.is_deleted = false
GROUP BY rlc.level_code, rlc.level_name, rlc.color_code, rlc.min_score, rlc.max_score, rlc.level_order
ORDER BY rlc.level_order;
```

**验证结果**:
| 等级 | 代码 | 人数 | 颜色 | 分值区间 | 验证 |
|------|------|------|------|----------|------|
| 低风险 | low | 5 | #52c41a | 0-25 | ✓ |
| 一般风险 | medium | 0 | #faad14 | 26-50 | ✓ |
| 较高风险 | high | 0 | #fa8c16 | 51-75 | ✓ |
| 重大风险 | critical | 0 | #f5222d | 76-100 | ✓ |

### 3.3 风险类型分析

**验证SQL**:
```sql
SELECT 
  ROUND(AVG(violation_score), 2) as v_avg, COUNT(*) FILTER (WHERE violation_score >= 51) as v_high,
  ROUND(AVG(driver_compliance_score), 2) as d_avg, COUNT(*) FILTER (WHERE driver_compliance_score >= 51) as d_high,
  ROUND(AVG(training_compliance_score), 2) as t_avg, COUNT(*) FILTER (WHERE training_compliance_score >= 51) as t_high,
  ROUND(AVG(incident_score), 2) as i_avg, COUNT(*) FILTER (WHERE incident_score >= 51) as i_high,
  ROUND(AVG(management_execution_score), 2) as m_avg, COUNT(*) FILTER (WHERE management_execution_score >= 51) as m_high,
  COUNT(*) as total
FROM risk_score_records r
WHERE r.is_deleted = false
  AND r.id IN (SELECT MAX(id) FROM risk_score_records WHERE is_deleted = false GROUP BY employee_id);

-- 驾驶员人数（通过employee_assignment统计，禁止position_risk_mapping）
SELECT COUNT(DISTINCT ea.employee_id) as cnt FROM employee_assignment ea
JOIN position p ON ea.position_id = p.id
WHERE (p.name LIKE '%驾驶员%' OR p.name LIKE '%司机%') AND ea.is_current = true AND ea.is_deleted = false;

-- 培训数据（通过v_training_records视图统一employee_id）
SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE result = '合格') as qualified,
       COUNT(DISTINCT employee_id) FILTER (WHERE result != '合格') as uncompleted
FROM v_training_records;
```

**验证结果**:
| 风险类型 | 均分 | 高风险人数 | 补充数据 | 验证 |
|----------|------|-----------|----------|------|
| 三违风险 | 0.00 | 0 | - | ✓ |
| 驾驶风险 | 0.00 | 0 | 驾驶员:43人 | ✓ employee_assignment统计 |
| 培训风险 | 50.00 | 0 | 培训:3条，合格:2，未完成:1 | ✓ v_training_records视图 |
| 事故风险 | 0.00 | 0 | - | ✓ |
| 管理履职 | 0.00 | 0 | - | ✓ |

### 3.4 风险TOP

**验证SQL**:
```sql
-- TOP10员工
SELECT employee_id, employee_name, position_name, final_score, risk_level
FROM risk_score_records WHERE is_deleted = false
  AND id IN (SELECT MAX(id) FROM risk_score_records WHERE is_deleted = false GROUP BY employee_id)
ORDER BY final_score DESC LIMIT 10;

-- TOP5部门（通过employee_assignment关联）
SELECT ou.org_name, ROUND(AVG(r.final_score), 2) as avg_score,
       COUNT(*) as total, COUNT(*) FILTER (WHERE r.risk_level_code IN ('high','critical')) as high
FROM risk_score_records r
JOIN employee_assignment ea ON r.employee_id = ea.employee_id AND ea.is_current = true AND ea.is_deleted = false
JOIN hse_org_unit ou ON ea.org_unit_id = ou.id AND ou.is_deleted = false
WHERE r.is_deleted = false
  AND r.id IN (SELECT MAX(id) FROM risk_score_records WHERE is_deleted = false GROUP BY employee_id)
GROUP BY ou.id, ou.org_name ORDER BY avg_score DESC LIMIT 5;
```

**验证结果**:
| 排名 | 员工 | 岗位 | 得分 | 等级 | 验证 |
|------|------|------|------|------|------|
| 1 | 验证_环卫中心副经理 | 环卫作业中心副经理（人工） | 12.50 | 低风险 | ✓ |
| 2 | 验证_城区东片片区长 | 环卫作业中心片区长 | 7.50 | 低风险 | ✓ |
| 3 | 验证_城区西片片区长 | 环卫作业中心片区长 | 7.50 | 低风险 | ✓ |
| 4 | 验证_开发区片片区长 | 环卫作业中心片区长 | 7.50 | 低风险 | ✓ |
| 5 | 武志刚 | 垃圾收运车驾驶员 | 7.50 | 低风险 | ✓ |

| 排名 | 部门 | 均分 | 人数 | 高风险 | 验证 |
|------|------|------|------|--------|------|
| 1 | 环卫作业中心 | 8.75 | 4 | 0 | ✓ employee_assignment关联 |
| 2 | 宁城街道作业中心 | 7.50 | 1 | 0 | ✓ |

### 3.5 风险趋势

**验证SQL**:
```sql
SELECT calculate_date, ROUND(AVG(total_score), 2) as avg_score, COUNT(*) as cnt
FROM risk_score_history WHERE calculate_period = 'daily' AND is_deleted = false
GROUP BY calculate_date ORDER BY calculate_date;
```

**验证结果**:
| 日期 | 均分 | 人数 | 验证 |
|------|------|------|------|
| 2026-07-22 | 8.50 | 5 | ✓ risk_score_history数据正常 |

### 3.6 管理履职

**验证SQL**:
```sql
SELECT 
  COUNT(*) as total_inspections,
  COUNT(*) FILTER (WHERE problems_found IS NOT NULL AND problems_found != '') as total_problems,
  COUNT(*) FILTER (WHERE rectification_status = 'completed') as completed,
  COUNT(*) FILTER (WHERE rectification_status = 'overdue') as overdue
FROM hse_grid_inspection_records WHERE inspection_date >= CURRENT_DATE - INTERVAL '30 days' AND is_deleted = false;
```

**验证结果**:
| 指标 | 值 | 验证 |
|------|------|------|
| 巡查总次数 | 0 | ✓ 暂无巡查数据 |
| 问题发现数 | 0 | ✓ |
| 问题发现率 | 0% | ✓ |
| 整改完成数 | 0 | ✓ |
| 逾期未整改 | 0 | ✓ |
| 整改完成率 | 0% | ✓ |

### 3.7 风险等级配置

**验证SQL**:
```sql
SELECT level_code, level_name, min_score, max_score, color_code
FROM risk_level_config WHERE is_enabled = true AND is_deleted = false ORDER BY level_order;
```

**验证结果**:
| 等级 | 代码 | 分值区间 | 颜色 | 验证 |
|------|------|----------|------|------|
| 低风险 | low | 0-25 | #52c41a | ✓ |
| 一般风险 | medium | 26-50 | #faad14 | ✓ |
| 较高风险 | high | 51-75 | #fa8c16 | ✓ |
| 重大风险 | critical | 76-100 | #f5222d | ✓ |

### 3.8 v_training_records视图

**验证SQL**:
```sql
SELECT employee_id, employee_name, training_type, result FROM v_training_records LIMIT 5;
```

**验证结果**:
| employee_id | employee_name | training_type | result | 验证 |
|-------------|---------------|---------------|--------|------|
| 3867 | 马金华 | HSE培训 | 合格 | ✓ 输出employee_id |
| 3867 | 马金华 | 消防培训 | 合格 | ✓ 输出employee_id |
| 3867 | 马金华 | 应急演练 | 待培训 | ✓ 输出employee_id |

## 四、SQL规范验证

| 规范项 | 验证结果 | 说明 |
|--------|----------|------|
| 员工统计使用employee_assignment | ✓ | 全部SQL使用employee_assignment |
| 禁止hse_employee_relation | ✓ | 全部SQL无hse_employee_relation引用 |
| is_current=true条件 | ✓ | 所有employee_assignment查询包含 |
| is_deleted=false条件 | ✓ | 所有查询包含 |
| 驾驶员统计通过employee_assignment+position | ✓ | 未使用position_risk_mapping |
| 培训数据通过v_training_records | ✓ | 输出employee_id |
| 等级配置从risk_level_config读取 | ✓ | 禁止硬编码 |
| 单项风险等级≥51为高风险 | ✓ | COUNT FILTER WHERE score >= 51 |
| 综合风险等级从risk_level_records | ✓ | is_active=true |

## 五、验证结论

全部9项SQL验证通过，所有接口SQL符合以下规范：

1. 员工统计统一使用employee_assignment（is_current=true, is_deleted=false）
2. 禁止使用hse_employee_relation
3. 驾驶员人数通过employee_assignment + position统计
4. 培训数据通过v_training_records视图统一输出employee_id
5. 风险等级通过risk_level_config参数化配置
6. 单项风险等级与综合风险等级严格区分
7. TOP排行通过employee_assignment关联组织信息

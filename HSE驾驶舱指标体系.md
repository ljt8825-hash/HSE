# HSE驾驶舱指标体系

## 一、指标体系概述

HSE综合驾驶舱指标体系面向5类管理角色，从员工风险、风险类型、风险趋势三个维度构建完整的HSE风险监控视图。

### 1.1 驾驶舱角色

| 角色 | 管理级别 | 视角范围 | 核心关注 |
|------|----------|----------|----------|
| 集团领导 | high | 全集团 | 全局风险态势、重大风险人员、趋势走向 |
| 部门经理 | middle | 本部门 | 部门风险分布、高风险人员、各类型风险对比 |
| 乡镇作业中心经理 | middle | 本中心 | 中心风险概况、驾驶员专项、事故风险 |
| 环卫作业中心片区长 | frontline | 本片区 | 片区风险明细、三违风险、培训合规 |
| 管理员 | frontline | 管辖网格 | 网格风险明细、巡查执行、整改情况 |

### 1.2 指标维度

```
驾驶舱指标体系
├── 员工风险指标
│   ├── 高风险人数
│   ├── 风险等级分布
│   └── 风险趋势
├── 风险类型指标
│   ├── 三违风险
│   ├── 驾驶风险
│   ├── 事故风险
│   ├── 培训风险
│   └── 管理履职风险
└── 管理履职指标
    ├── 巡查完成率
    ├── 问题发现率
    └── 整改完成率
```

## 二、员工风险指标

### 2.1 高风险人数

| 指标 | 说明 | 数据来源 | 计算方式 |
|------|------|----------|----------|
| 重大风险人数 | 风险等级为"重大风险"的员工数 | risk_level_records | COUNT WHERE risk_level_code = 'critical' AND is_active = true |
| 较高风险人数 | 风险等级为"较高风险"的员工数 | risk_level_records | COUNT WHERE risk_level_code = 'high' AND is_active = true |
| 高风险合计 | 重大+较高风险人数 | risk_level_records | 上述两项之和 |
| 高风险占比 | 高风险人数/总人数 | risk_level_records | 高风险合计 / 总评估人数 × 100% |

### 2.2 风险等级分布

| 指标 | 说明 | 数据来源 | 计算方式 |
|------|------|----------|----------|
| 低风险人数 | risk_level_code = 'low' | risk_level_records | COUNT |
| 一般风险人数 | risk_level_code = 'medium' | risk_level_records | COUNT |
| 较高风险人数 | risk_level_code = 'high' | risk_level_records | COUNT |
| 重大风险人数 | risk_level_code = 'critical' | risk_level_records | COUNT |
| 总评估人数 | 已有风险等级的员工总数 | risk_level_records | COUNT DISTINCT employee_id |
| 等级分布占比 | 各等级人数/总人数 | risk_level_records | 各等级人数 / 总人数 × 100% |

### 2.3 风险趋势

| 指标 | 说明 | 数据来源 | 计算方式 |
|------|------|----------|----------|
| 日趋势 | 每日风险评分变化 | risk_score_history | WHERE calculate_period = 'daily' GROUP BY calculate_date |
| 周趋势 | 每周平均风险评分 | risk_score_history | WHERE calculate_period = 'weekly' GROUP BY calculate_date |
| 月趋势 | 每月平均风险评分 | risk_score_history | WHERE calculate_period = 'monthly' GROUP BY calculate_date |
| 等级变化趋势 | 各等级人数随时间变化 | risk_score_history | GROUP BY calculate_date, risk_level_code |
| 高风险趋势 | 高风险人数随时间变化 | risk_score_history | WHERE risk_level_code IN ('high','critical') GROUP BY calculate_date |
| 平均分趋势 | 平均风险评分变化 | risk_score_history | AVG(total_score) GROUP BY calculate_date |

## 三、风险类型指标

### 3.1 三违风险

| 指标 | 说明 | 数据来源 | 计算方式 |
|------|------|----------|----------|
| 三违平均积分 | 所有员工三违风险平均分 | risk_score_records | AVG(violation_score) |
| 三违高风险人数 | 三违积分≥51的员工数 | risk_score_records | COUNT WHERE violation_score >= 51 |
| 严重违规人数 | 有严重违规记录的员工数 | violation_records | COUNT DISTINCT violator_id WHERE violation_level = '严重' |
| 违规总数 | 近12个月违规总数 | violation_records | COUNT WHERE violation_date >= 12个月前 |
| 待处理违规数 | 待处理/整改中的违规数 | violation_records | COUNT WHERE status IN ('待处理','整改中') |

### 3.2 驾驶风险

| 指标 | 说明 | 数据来源 | 计算方式 |
|------|------|----------|----------|
| 驾驶合规平均积分 | 驾驶员驾驶合规风险平均分 | risk_score_records | AVG(driver_compliance_score) WHERE risk_category = 'driver' |
| 驾驶高风险人数 | 驾驶合规积分≥51的驾驶员数 | risk_score_records | COUNT WHERE driver_compliance_score >= 51 |
| 扣满12分人数 | 驾驶证扣满12分的驾驶员数 | license_demerit_records | COUNT DISTINCT employee_id WHERE SUM(demerit_points) >= 12 |
| 三检不合格率 | 三检不合格次数占比 | hse_driver_inspection_records | 不合格次数 / 总次数 × 100% |
| 驾驶员总人数 | 驾驶员岗位员工总数 | position_risk_mapping | COUNT WHERE risk_category = 'driver' |

### 3.3 事故风险

| 指标 | 说明 | 数据来源 | 计算方式 |
|------|------|----------|----------|
| 事故平均积分 | 所有员工事故风险平均分 | risk_score_records | AVG(incident_score) |
| 事故高风险人数 | 事故积分≥51的员工数 | risk_score_records | COUNT WHERE incident_score >= 51 |
| 事故总数 | 事故记录总数 | hse_incident_records | COUNT WHERE is_deleted = false |
| 重大事故数 | 级别为"重大"的事故数 | hse_incident_records | COUNT WHERE level = '重大' |
| 有伤亡事故数 | 造成伤亡的事故数 | hse_incident_records | COUNT WHERE casualties > 0 OR injuries > 0 |
| 事故类型分布 | 按事故类型分组统计 | hse_incident_records | GROUP BY accident_type |

### 3.4 培训风险

| 指标 | 说明 | 数据来源 | 计算方式 |
|------|------|----------|----------|
| 培训合规平均积分 | 所有员工培训合规风险平均分 | risk_score_records | AVG(training_compliance_score) |
| 培训高风险人数 | 培训积分≥51的员工数 | risk_score_records | COUNT WHERE training_compliance_score >= 51 |
| 未完成培训人数 | 有未完成培训的员工数 | training_records | COUNT DISTINCT personnel_id WHERE result != '合格' |
| 培训合格率 | 培训合格数/总数 | training_records | COUNT(result='合格') / COUNT(*) × 100% |
| 无培训记录人数 | 无任何培训记录的员工数 | training_records + employee | 总员工数 - 有培训记录的员工数 |

### 3.5 管理履职风险

| 指标 | 说明 | 数据来源 | 计算方式 |
|------|------|----------|----------|
| 管理履职平均积分 | 管理岗位员工管理履职风险平均分 | risk_score_records | AVG(management_execution_score) WHERE risk_category = 'management' |
| 管理履职高风险人数 | 管理履职积分≥51的管理人员数 | risk_score_records | COUNT WHERE management_execution_score >= 51 |
| 巡查完成率 | 实际巡查次数/应巡查次数 | hse_grid_inspection_records | SUM(actual) / SUM(expected) × 100% |
| 问题发现率 | 发现问题的巡查次数/总巡查次数 | hse_grid_inspection_records | COUNT(problems_found != '') / COUNT(*) × 100% |
| 整改完成率 | 已整改数/应整改数 | hse_grid_inspection_records | COUNT(rectification_status='completed') / COUNT(*) × 100% |
| 逾期未整改数 | 超过截止日期未整改数 | hse_grid_inspection_records | COUNT WHERE rectification_status = 'overdue' |

## 四、管理履职专项指标

### 4.1 各级网格长巡查指标

| 网格级别 | 巡查频次要求 | 月应巡查次数 | 指标 |
|----------|-------------|-------------|------|
| 总网格长 | 1次/3天 | ≥10次 | 巡查完成率、问题发现率、整改完成率 |
| 一级网格长 | 1次/2天 | ≥15次 | 巡查完成率、问题发现率、整改完成率 |
| 二级网格长 | 1次/天 | ≥30次 | 巡查完成率、问题发现率、整改完成率 |
| 三级网格长 | 1次/天 | ≥30次 | 巡查完成率、问题发现率、整改完成率 |

### 4.2 巡查统计指标

| 指标 | 说明 | 数据来源 | 计算方式 |
|------|------|----------|----------|
| 本月巡查总次数 | 当月所有网格长巡查次数 | hse_grid_inspection_records | COUNT WHERE inspection_date IN 当月 |
| 各级网格长巡查次数 | 按网格级别分组 | hse_grid_inspection_records | GROUP BY grid_level |
| 巡查覆盖率 | 有巡查记录的网格长/总网格长 | hse_grid_inspection_records + hse_responsibility | 有巡查人数 / 总网格长数 × 100% |
| 问题整改率 | 已整改/发现问题总数 | hse_grid_inspection_records | COUNT(rectification_status='completed') / COUNT(problems_found != '') × 100% |
| 逾期整改数 | 超过截止日期未整改 | hse_grid_inspection_records | COUNT WHERE rectification_status = 'overdue' |

## 五、角色驾驶舱指标配置

### 5.1 集团领导驾驶舱

| 指标分组 | 指标项 | 展示形式 |
|----------|--------|----------|
| 全局概览 | 总员工数、已评估人数、高风险人数、高风险占比 | 数字卡片 |
| 等级分布 | 各风险等级人数和占比 | 饼图/环形图 |
| 趋势分析 | 近30天/12周/12月风险趋势 | 折线图 |
| 风险类型对比 | 5种风险类型平均积分对比 | 柱状图 |
| 重大风险清单 | 重大风险等级员工列表 | 表格 |
| 事故监控 | 事故总数、重大事故数、伤亡事故数 | 数字卡片+列表 |

### 5.2 部门经理驾驶舱

| 指标分组 | 指标项 | 展示形式 |
|----------|--------|----------|
| 部门概览 | 部门员工数、已评估人数、高风险人数 | 数字卡片 |
| 等级分布 | 本部门各风险等级分布 | 饼图 |
| 趋势分析 | 近30天风险趋势 | 折线图 |
| 风险类型对比 | 本部门5种风险类型对比 | 柱状图 |
| 高风险清单 | 本部门较高+重大风险员工列表 | 表格 |
| 三违监控 | 违规总数、严重违规、待处理 | 数字卡片 |

### 5.3 乡镇作业中心经理驾驶舱

| 指标分组 | 指标项 | 展示形式 |
|----------|--------|----------|
| 中心概览 | 中心员工数、驾驶员数、高风险人数 | 数字卡片 |
| 等级分布 | 本中心各风险等级分布 | 饼图 |
| 驾驶员专项 | 驾驶合规平均分、扣满12分人数 | 数字卡片 |
| 事故监控 | 事故总数、交通事故数 | 数字卡片 |
| 高风险清单 | 本中心高风险员工列表 | 表格 |

### 5.4 环卫作业中心片区长驾驶舱

| 指标分组 | 指标项 | 展示形式 |
|----------|--------|----------|
| 片区概览 | 片区员工数、高风险人数 | 数字卡片 |
| 等级分布 | 本片区各风险等级分布 | 饼图 |
| 风险类型 | 三违风险、培训合规风险详情 | 柱状图 |
| 员工明细 | 本片区员工风险评分明细 | 表格 |
| 三违监控 | 违规人数、违规次数、待处理 | 数字卡片 |

### 5.5 管理员驾驶舱

| 指标分组 | 指标项 | 展示形式 |
|----------|--------|----------|
| 网格概览 | 网格员工数、高风险人数 | 数字卡片 |
| 巡查统计 | 本月巡查次数、完成率、问题发现数 | 数字卡片 |
| 整改监控 | 待整改数、逾期数、整改完成率 | 数字卡片 |
| 员工明细 | 管辖网格员工风险评分明细 | 表格 |
| 巡查记录 | 近期巡查记录列表 | 表格 |

## 六、指标数据来源映射

| 指标类别 | 主要数据来源表 | 辅助数据来源表 |
|----------|---------------|---------------|
| 员工风险 | risk_level_records, risk_score_history | risk_level_config |
| 三违风险 | risk_score_records, violation_records | - |
| 驾驶风险 | risk_score_records, license_demerit_records | hse_driver_inspection_records |
| 事故风险 | risk_score_records, hse_incident_records | - |
| 培训风险 | risk_score_records, training_records | - |
| 管理履职 | risk_score_records, hse_grid_inspection_records | hse_responsibility |
| 岗位映射 | position_risk_mapping | hse_employee_relation |
| 组织信息 | hse_employee_org, hse_org_unit | department |

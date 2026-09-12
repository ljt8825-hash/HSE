# 集团HSE考核指标字典

## 一、指标体系总览

### 1.1 指标分类

| 分类 | 指标数量 | 说明 |
|------|----------|------|
| 安全指标 | 5 | 事故、三违等安全相关指标 |
| 风险指标 | 5 | 员工风险等级相关指标 |
| 事故指标 | 6 | 事故统计及等级分类指标 |
| 整改指标 | 6 | 隐患整改相关指标 |
| 管理指标 | 8 | 网格长巡查及驾驶风险指标 |
| 培训指标 | 4 | 培训相关指标 |
| 目标指标 | 9 | 目标责任书考核指标 |

### 1.2 指标编码规则

```
HSE-KPI-{分类}-{序号}
```

| 分类代码 | 分类名称 |
|----------|----------|
| SAF | 安全指标 |
| RISK | 风险指标 |
| ACC | 事故指标 |
| RECT | 整改指标 |
| MGT | 管理指标 |
| TRN | 培训指标 |
| GOAL | 目标指标 |

---

## 二、安全指标

### SAF-001 事故起数

| 属性 | 内容 |
|------|------|
| 指标名称 | 事故起数 |
| 指标编码 | HSE-KPI-SAF-001 |
| 指标类型 | 反向指标 |
| 计算周期 | 年度 |
| 数据来源 | accidents 表 |
| 计算公式 | COUNT(*) FROM accidents WHERE is_deleted=false AND accident_date BETWEEN yearStart AND yearEnd |
| 评分标准 | 0起得100分，每增加1起扣20分 |
| 目标值 | 0起 |

### SAF-002 重大事故起数

| 属性 | 内容 |
|------|------|
| 指标名称 | 重大事故起数 |
| 指标编码 | HSE-KPI-SAF-002 |
| 指标类型 | 反向指标 |
| 计算周期 | 年度 |
| 数据来源 | accidents 表 |
| 计算公式 | COUNT(*) FROM accidents WHERE level IN ('重大', '特别重大') |
| 评分标准 | 0起得100分，发生重大事故得0分 |
| 目标值 | 0起 |

### SAF-003 事故指数

| 属性 | 内容 |
|------|------|
| 指标名称 | 事故指数 |
| 指标编码 | HSE-KPI-SAF-003 |
| 指标类型 | 反向指标 |
| 计算周期 | 年度 |
| 数据来源 | accidents 表 |
| 计算公式 | Σ(事故起数 × 等级权重)，权重：轻微1、一般3、较大6、重大10、特别重大15 |
| 评分标准 | 0得100分，每增加1分扣1分 |
| 目标值 | 0 |

### SAF-004 三违次数

| 属性 | 内容 |
|------|------|
| 指标名称 | 三违次数 |
| 指标编码 | HSE-KPI-SAF-004 |
| 指标类型 | 反向指标 |
| 计算周期 | 年度 |
| 数据来源 | violation_records 表 |
| 计算公式 | COUNT(*) FROM violation_records WHERE is_deleted=false AND violation_date BETWEEN yearStart AND yearEnd |
| 评分标准 | ≤50次得100分，超出部分按比例扣分 |
| 目标值 | 50次 |

### SAF-005 严重三违次数

| 属性 | 内容 |
|------|------|
| 指标名称 | 严重三违次数 |
| 指标编码 | HSE-KPI-SAF-005 |
| 指标类型 | 反向指标 |
| 计算周期 | 年度 |
| 数据来源 | violation_records 表 |
| 计算公式 | COUNT(*) FROM violation_records WHERE violation_level='严重' |
| 评分标准 | 0次不扣分，每次扣3分 |
| 目标值 | 0次 |

---

## 三、风险指标

### RISK-001 重大风险人数

| 属性 | 内容 |
|------|------|
| 指标名称 | 重大风险人数 |
| 指标编码 | HSE-KPI-RISK-001 |
| 指标类型 | 反向指标 |
| 计算周期 | 年度 |
| 数据来源 | hse_employee_risk_snapshot 表 |
| 计算公式 | COUNT(*) FROM hse_employee_risk_snapshot WHERE risk_level='重大' |
| 评分标准 | 每人扣15分 |
| 目标值 | 0人 |

### RISK-002 高风险人数

| 属性 | 内容 |
|------|------|
| 指标名称 | 高风险人数 |
| 指标编码 | HSE-KPI-RISK-002 |
| 指标类型 | 反向指标 |
| 计算周期 | 年度 |
| 数据来源 | hse_employee_risk_snapshot 表 |
| 计算公式 | COUNT(*) FROM hse_employee_risk_snapshot WHERE risk_level='较高' |
| 评分标准 | 每人扣8分 |
| 目标值 | 0人 |

### RISK-003 中风险人数

| 属性 | 内容 |
|------|------|
| 指标名称 | 中风险人数 |
| 指标编码 | HSE-KPI-RISK-003 |
| 指标类型 | 反向指标 |
| 计算周期 | 年度 |
| 数据来源 | hse_employee_risk_snapshot 表 |
| 计算公式 | COUNT(*) FROM hse_employee_risk_snapshot WHERE risk_level='一般' |
| 评分标准 | 每人扣3分 |
| 目标值 | 0人 |

### RISK-004 平均风险评分

| 属性 | 内容 |
|------|------|
| 指标名称 | 平均风险评分 |
| 指标编码 | HSE-KPI-RISK-004 |
| 指标类型 | 正向指标 |
| 计算周期 | 年度 |
| 数据来源 | hse_employee_risk_snapshot 表 |
| 计算公式 | AVG(total_score) FROM hse_employee_risk_snapshot |
| 评分标准 | 直接作为风险评分参考 |
| 目标值 | ≥80分 |

### RISK-005 高风险人员占比

| 属性 | 内容 |
|------|------|
| 指标名称 | 高风险人员占比 |
| 指标编码 | HSE-KPI-RISK-005 |
| 指标类型 | 反向指标 |
| 计算周期 | 年度 |
| 数据来源 | hse_employee_risk_snapshot 表 |
| 计算公式 | (重大风险人数 + 高风险人数) / 总人数 × 100% |
| 评分标准 | ≤5%得100分，超出部分按比例扣分 |
| 目标值 | ≤5% |

---

## 四、事故指标

### ACC-001 事故起数（按等级）

| 属性 | 内容 |
|------|------|
| 指标名称 | 事故起数（按等级） |
| 指标编码 | HSE-KPI-ACC-001 |
| 指标类型 | 反向指标 |
| 计算周期 | 年度 |
| 数据来源 | accidents 表 |
| 计算公式 | 按等级分别统计：轻微、一般、较大、重大、特别重大 |
| 评分标准 | 纳入事故加权指数计算 |
| 目标值 | 0起 |

### ACC-002 事故死亡人数

| 属性 | 内容 |
|------|------|
| 指标名称 | 事故死亡人数 |
| 指标编码 | HSE-KPI-ACC-002 |
| 指标类型 | 反向指标 |
| 计算周期 | 年度 |
| 数据来源 | accidents 表 |
| 计算公式 | SUM(casualties) FROM accidents |
| 评分标准 | 纳入事故严重程度评估 |
| 目标值 | 0人 |

### ACC-003 事故受伤人数

| 属性 | 内容 |
|------|------|
| 指标名称 | 事故受伤人数 |
| 指标编码 | HSE-KPI-ACC-003 |
| 指标类型 | 反向指标 |
| 计算周期 | 年度 |
| 数据来源 | accidents 表 |
| 计算公式 | SUM(injuries) FROM accidents |
| 评分标准 | 纳入事故严重程度评估 |
| 目标值 | 0人 |

### ACC-004 事故经济损失

| 属性 | 内容 |
|------|------|
| 指标名称 | 事故经济损失 |
| 指标编码 | HSE-KPI-ACC-004 |
| 指标类型 | 反向指标 |
| 计算周期 | 年度 |
| 数据来源 | accidents 表 |
| 计算公式 | SUM(loss_amount) FROM accidents |
| 评分标准 | 纳入事故严重程度评估 |
| 目标值 | 0元 |

### ACC-005 事故结案率

| 属性 | 内容 |
|------|------|
| 指标名称 | 事故结案率 |
| 指标编码 | HSE-KPI-ACC-005 |
| 指标类型 | 正向指标 |
| 计算周期 | 年度 |
| 数据来源 | accidents 表 |
| 计算公式 | COUNT(*) FILTER (WHERE status='已结案') / COUNT(*) × 100% |
| 评分标准 | 100%得满分 |
| 目标值 | 100% |

### ACC-006 事故加权指数

| 属性 | 内容 |
|------|------|
| 指标名称 | 事故加权指数 |
| 指标编码 | HSE-KPI-ACC-006 |
| 指标类型 | 反向指标 |
| 计算周期 | 年度 |
| 数据来源 | accidents 表 |
| 计算公式 | SUM(CASE level WHEN '轻微' THEN 1 WHEN '一般' THEN 3 WHEN '较大' THEN 6 WHEN '重大' THEN 10 WHEN '特别重大' THEN 15 ELSE 1 END) |
| 评分标准 | 事故得分 = 100 - 加权指数 × 3 - 重大事故 × 15 |
| 目标值 | 0 |

---

## 五、整改指标

### RECT-001 隐患总数

| 属性 | 内容 |
|------|------|
| 指标名称 | 隐患总数 |
| 指标编码 | HSE-KPI-RECT-001 |
| 指标类型 | 反向指标 |
| 计算周期 | 年度 |
| 数据来源 | rectification_task 表 |
| 计算公式 | COUNT(*) FROM rectification_task WHERE is_deleted=false |
| 评分标准 | 纳入整改完成率计算 |
| 目标值 | 0项 |

### RECT-002 已完成整改数

| 属性 | 内容 |
|------|------|
| 指标名称 | 已完成整改数 |
| 指标编码 | HSE-KPI-RECT-002 |
| 指标类型 | 正向指标 |
| 计算周期 | 年度 |
| 数据来源 | rectification_task 表 |
| 计算公式 | COUNT(*) FROM rectification_task WHERE status='completed' |
| 评分标准 | 纳入整改完成率计算 |
| 目标值 | =隐患总数 |

### RECT-003 逾期整改数

| 属性 | 内容 |
|------|------|
| 指标名称 | 逾期整改数 |
| 指标编码 | HSE-KPI-RECT-003 |
| 指标类型 | 反向指标 |
| 计算周期 | 年度 |
| 数据来源 | rectification_task 表 |
| 计算公式 | COUNT(*) FROM rectification_task WHERE status='overdue' |
| 评分标准 | 每项扣5分 |
| 目标值 | 0项 |

### RECT-004 整改完成率

| 属性 | 内容 |
|------|------|
| 指标名称 | 整改完成率 |
| 指标编码 | HSE-KPI-RECT-004 |
| 指标类型 | 正向指标 |
| 计算周期 | 年度 |
| 数据来源 | rectification_task 表 |
| 计算公式 | 已完成整改数 / 隐患总数 × 100% |
| 评分标准 | 完成率直接作为得分基础 |
| 目标值 | ≥98% |

### RECT-005 待处理隐患数

| 属性 | 内容 |
|------|------|
| 指标名称 | 待处理隐患数 |
| 指标编码 | HSE-KPI-RECT-005 |
| 指标类型 | 反向指标 |
| 计算周期 | 年度 |
| 数据来源 | rectification_task 表 |
| 计算公式 | COUNT(*) FROM rectification_task WHERE status='pending' |
| 评分标准 | 纳入整改进度评估 |
| 目标值 | 0项 |

### RECT-006 处理中隐患数

| 属性 | 内容 |
|------|------|
| 指标名称 | 处理中隐患数 |
| 指标编码 | HSE-KPI-RECT-006 |
| 指标类型 | 中性指标 |
| 计算周期 | 年度 |
| 数据来源 | rectification_task 表 |
| 计算公式 | COUNT(*) FROM rectification_task WHERE status='in_progress' |
| 评分标准 | 纳入整改进度评估 |
| 目标值 | 合理范围内 |

---

## 六、管理指标

### MGT-001 网格巡查合规率

| 属性 | 内容 |
|------|------|
| 指标名称 | 网格巡查合规率 |
| 指标编码 | HSE-KPI-MGT-001 |
| 指标类型 | 正向指标 |
| 计算周期 | 年度 |
| 数据来源 | hazard_record、position 表 |
| 计算公式 | 实际巡查次数 / 理论巡查次数 × 100% |
| 评分标准 | 纳入管理评分（占60%） |
| 目标值 | ≥90% |

### MGT-002 总网格长巡查合规率

| 属性 | 内容 |
|------|------|
| 指标名称 | 总网格长巡查合规率 |
| 指标编码 | HSE-KPI-MGT-002 |
| 指标类型 | 正向指标 |
| 计算周期 | 年度 |
| 数据来源 | hazard_record、position 表 |
| 计算公式 | 总网格长实际巡查 / (总网格长人数 × 365 / 3) × 100% |
| 评分标准 | 纳入网格巡查合规率计算 |
| 目标值 | ≥90% |

### MGT-003 一级网格长巡查合规率

| 属性 | 内容 |
|------|------|
| 指标名称 | 一级网格长巡查合规率 |
| 指标编码 | HSE-KPI-MGT-003 |
| 指标类型 | 正向指标 |
| 计算周期 | 年度 |
| 数据来源 | hazard_record、position 表 |
| 计算公式 | 一级网格长实际巡查 / (一级网格长人数 × 365 / 2) × 100% |
| 评分标准 | 纳入网格巡查合规率计算 |
| 目标值 | ≥90% |

### MGT-004 二级网格长巡查合规率

| 属性 | 内容 |
|------|------|
| 指标名称 | 二级网格长巡查合规率 |
| 指标编码 | HSE-KPI-MGT-004 |
| 指标类型 | 正向指标 |
| 计算周期 | 年度 |
| 数据来源 | hazard_record、position 表 |
| 计算公式 | 二级网格长实际巡查 / (二级网格长人数 × 365) × 100% |
| 评分标准 | 纳入网格巡查合规率计算 |
| 目标值 | ≥90% |

### MGT-005 三级网格长巡查合规率

| 属性 | 内容 |
|------|------|
| 指标名称 | 三级网格长巡查合规率 |
| 指标编码 | HSE-KPI-MGT-005 |
| 指标类型 | 正向指标 |
| 计算周期 | 年度 |
| 数据来源 | hazard_record、position 表 |
| 计算公式 | 三级网格长实际巡查 / (三级网格长人数 × 365) × 100% |
| 评分标准 | 纳入网格巡查合规率计算 |
| 目标值 | ≥90% |

### MGT-006 驾驶风险得分

| 属性 | 内容 |
|------|------|
| 指标名称 | 驾驶风险得分 |
| 指标编码 | HSE-KPI-MGT-006 |
| 指标类型 | 正向指标 |
| 计算周期 | 年度 |
| 数据来源 | license_demerit_records 表 |
| 计算公式 | 100 - (本年扣分 / (驾驶员人数 × 12)) × 100 × 2 |
| 评分标准 | 纳入管理评分（占40%） |
| 目标值 | ≥90分 |

### MGT-007 驾驶证扣分率

| 属性 | 内容 |
|------|------|
| 指标名称 | 驾驶证扣分率 |
| 指标编码 | HSE-KPI-MGT-007 |
| 指标类型 | 反向指标 |
| 计算周期 | 年度 |
| 数据来源 | license_demerit_records 表 |
| 计算公式 | 本年扣分 / (驾驶员人数 × 12) × 100% |
| 评分标准 | 0%得100分，>10%开始扣分 |
| 目标值 | ≤10% |

### MGT-008 近5年累计扣分

| 属性 | 内容 |
|------|------|
| 指标名称 | 近5年累计扣分 |
| 指标编码 | HSE-KPI-MGT-008 |
| 指标类型 | 反向指标 |
| 计算周期 | 近5年 |
| 数据来源 | license_demerit_records 表 |
| 计算公式 | SUM(demerit_points) FROM license_demerit_records WHERE demerit_date >= fiveYearsAgo |
| 评分标准 | 纳入驾驶员风险评估参考 |
| 目标值 | 0分 |

---

## 七、培训指标

### TRN-001 培训总人数

| 属性 | 内容 |
|------|------|
| 指标名称 | 培训总人数 |
| 指标编码 | HSE-KPI-TRN-001 |
| 指标类型 | 正向指标 |
| 计算周期 | 年度 |
| 数据来源 | training_records 表 |
| 计算公式 | COUNT(*) FROM training_records WHERE is_deleted=false |
| 评分标准 | 纳入培训完成率计算 |
| 目标值 | =应培训人数 |

### TRN-002 培训合格人数

| 属性 | 内容 |
|------|------|
| 指标名称 | 培训合格人数 |
| 指标编码 | HSE-KPI-TRN-002 |
| 指标类型 | 正向指标 |
| 计算周期 | 年度 |
| 数据来源 | training_records 表 |
| 计算公式 | COUNT(*) FROM training_records WHERE result='合格' |
| 评分标准 | 纳入培训完成率计算 |
| 目标值 | =培训总人数 |

### TRN-003 培训完成率

| 属性 | 内容 |
|------|------|
| 指标名称 | 培训完成率 |
| 指标编码 | HSE-KPI-TRN-003 |
| 指标类型 | 正向指标 |
| 计算周期 | 年度 |
| 数据来源 | training_records 表 |
| 计算公式 | 培训合格人数 / 培训总人数 × 100% |
| 评分标准 | 直接作为得分 |
| 目标值 | ≥95% |

### TRN-004 培训平均成绩

| 属性 | 内容 |
|------|------|
| 指标名称 | 培训平均成绩 |
| 指标编码 | HSE-KPI-TRN-004 |
| 指标类型 | 正向指标 |
| 计算周期 | 年度 |
| 数据来源 | training_records 表 |
| 计算公式 | AVG(score) FROM training_records |
| 评分标准 | 参考指标，不直接扣分 |
| 目标值 | ≥80分 |

---

## 八、目标指标

### GOAL-001 事故起数控制

| 属性 | 内容 |
|------|------|
| 指标名称 | 事故起数控制 |
| 指标编码 | HSE-KPI-GOAL-001 |
| 指标类型 | 反向指标 |
| 计算周期 | 年度 |
| 数据来源 | accidents 表 |
| 计算公式 | COUNT(*) FROM accidents |
| 评分标准 | 0起得100分，每增加1起扣20分 |
| 目标值 | 0起 |

### GOAL-002 重大事故控制

| 属性 | 内容 |
|------|------|
| 指标名称 | 重大事故控制 |
| 指标编码 | HSE-KPI-GOAL-002 |
| 指标类型 | 反向指标 |
| 计算周期 | 年度 |
| 数据来源 | accidents 表 |
| 计算公式 | COUNT(*) FROM accidents WHERE level IN ('重大', '特别重大') |
| 评分标准 | 0起得100分，发生得0分 |
| 目标值 | 0起 |

### GOAL-003 事故指数控制

| 属性 | 内容 |
|------|------|
| 指标名称 | 事故指数控制 |
| 指标编码 | HSE-KPI-GOAL-003 |
| 指标类型 | 反向指标 |
| 计算周期 | 年度 |
| 数据来源 | accidents 表 |
| 计算公式 | 事故加权指数 |
| 评分标准 | 0得100分，每增加1分扣1分 |
| 目标值 | 0 |

### GOAL-004 三违次数控制

| 属性 | 内容 |
|------|------|
| 指标名称 | 三违次数控制 |
| 指标编码 | HSE-KPI-GOAL-004 |
| 指标类型 | 反向指标 |
| 计算周期 | 年度 |
| 数据来源 | violation_records 表 |
| 计算公式 | COUNT(*) FROM violation_records |
| 评分标准 | ≤50次得100分，超出按比例扣分 |
| 目标值 | 50次 |

### GOAL-005 培训完成率

| 属性 | 内容 |
|------|------|
| 指标名称 | 培训完成率 |
| 指标编码 | HSE-KPI-GOAL-005 |
| 指标类型 | 正向指标 |
| 计算周期 | 年度 |
| 数据来源 | training_records 表 |
| 计算公式 | 合格人数 / 总人数 × 100% |
| 评分标准 | 直接作为得分 |
| 目标值 | ≥95% |

### GOAL-006 隐患整改率

| 属性 | 内容 |
|------|------|
| 指标名称 | 隐患整改率 |
| 指标编码 | HSE-KPI-GOAL-006 |
| 指标类型 | 正向指标 |
| 计算周期 | 年度 |
| 数据来源 | rectification_task 表 |
| 计算公式 | 已完成数 / 总数 × 100% |
| 评分标准 | 直接作为得分 |
| 目标值 | ≥98% |

### GOAL-007 高风险人员控制

| 属性 | 内容 |
|------|------|
| 指标名称 | 高风险人员控制 |
| 指标编码 | HSE-KPI-GOAL-007 |
| 指标类型 | 反向指标 |
| 计算周期 | 年度 |
| 数据来源 | hse_employee_risk_snapshot 表 |
| 计算公式 | (重大+高风险人数) / 总人数 × 100% |
| 评分标准 | ≤5%得100分，超出按比例扣分 |
| 目标值 | ≤5% |

### GOAL-008 驾驶风险控制

| 属性 | 内容 |
|------|------|
| 指标名称 | 驾驶风险控制 |
| 指标编码 | HSE-KPI-GOAL-008 |
| 指标类型 | 反向指标 |
| 计算周期 | 年度 |
| 数据来源 | license_demerit_records 表 |
| 计算公式 | 本年扣分 / (驾驶员人数 × 12) × 100% |
| 评分标准 | ≤10%得100分，超出按比例扣分 |
| 目标值 | ≤10% |

### GOAL-009 网格长巡查合规率

| 属性 | 内容 |
|------|------|
| 指标名称 | 网格长巡查合规率 |
| 指标编码 | HSE-KPI-GOAL-009 |
| 指标类型 | 正向指标 |
| 计算周期 | 年度 |
| 数据来源 | hazard_record、position 表 |
| 计算公式 | 实际巡查次数 / 理论巡查次数 × 100% |
| 评分标准 | 直接作为得分 |
| 目标值 | ≥90% |

---

## 九、指标与数据表映射

### 9.1 指标-数据表映射表

| 指标分类 | 涉及数据表 |
|----------|------------|
| 安全指标 | accidents, violation_records |
| 风险指标 | hse_employee_risk_snapshot |
| 事故指标 | accidents |
| 整改指标 | rectification_task |
| 管理指标 | hazard_record, position, license_demerit_records |
| 培训指标 | training_records |
| 目标指标 | 以上所有表 |

### 9.2 数据表说明

| 数据表 | 用途 | 关键字段 |
|--------|------|----------|
| accidents | 事故记录 | id, level, accident_date, status, casualties, injuries, loss_amount |
| violation_records | 三违记录 | id, violation_level, violation_date, status, violator_id |
| hse_employee_risk_snapshot | 员工风险快照 | id, employee_id, risk_level, total_score, snapshot_date |
| rectification_task | 整改任务 | id, status, created_at, assignee_id |
| hazard_record | 隐患记录 | id, inspector_id, discover_date, risk_level, status |
| position | 岗位信息 | id, name |
| license_demerit_records | 驾驶证扣分记录 | id, employee_id, demerit_points, demerit_date |
| training_records | 培训记录 | id, result, score, training_date |
| objective_contract_version | 目标责任书版本 | id, name, version, effective_date, expiry_date, status |
| objective_contract_indicator | 目标指标 | id, contract_version_id, indicator_name, target_value |

---

**文档版本**：v1.0  
**生成日期**：2026年7月  
**所属项目**：HSE Dashboard Sprint6.5-A
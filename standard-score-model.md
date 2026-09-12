# 安全标准化评分模型设计

## 一、设计目标

设计安全标准化评分模型，自动计算各项安全管理指标，实现：

1. **标准化完成率** - 衡量安全标准化条款达标情况
2. **资料完整率** - 衡量安全资料归档完整性
3. **隐患整改率** - 衡量隐患排查治理闭环情况
4. **培训完成率** - 衡量安全培训开展情况
5. **风险管控率** - 衡量风险源管控情况
6. **安全标准化指数** - 综合评分，反映企业整体安全管理水平

---

## 二、评分体系整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    安全标准化指数 (100分)                    │
├─────────────┬─────────────┬─────────────┬───────────────────┤
│ 标准化完成率 │ 资料完整率   │ 隐患整改率   │ 培训完成率        │
│   (30分)    │   (25分)    │   (20分)    │   (15分)          │
├─────────────┼─────────────┼─────────────┼───────────────────┤
│ 风险管控率   │                                              │
│   (10分)    │                                              │
└─────────────┴───────────────────────────────────────────────┘
```

---

## 三、评分指标定义

### 3.1 安全标准化指数

**计算公式**:

```
安全标准化指数 = 
    标准化完成率 × 30% + 
    资料完整率 × 25% + 
    隐患整改率 × 20% + 
    培训完成率 × 15% + 
    风险管控率 × 10%
```

**等级划分**:

| 分数范围 | 等级 | 颜色标识 | 说明 |
|----------|------|----------|------|
| 90-100 | 优秀 | 绿色 | 安全管理水平优秀 |
| 80-89 | 良好 | 蓝色 | 安全管理水平良好 |
| 70-79 | 合格 | 黄色 | 安全管理水平合格 |
| 60-69 | 基本合格 | 橙色 | 需加强安全管理 |
| 0-59 | 不合格 | 红色 | 存在重大安全隐患 |

### 3.2 标准化完成率

**定义**: 已完成的安全标准化条款数占总条款数的比例。

**计算公式**:

```
标准化完成率 = (已完成条款数 / 总条款数) × 100
```

**数据来源**:
- `safety_standard_clauses` 表 - 总条款数
- `document_standard_relation` 表 - 已关联文件的条款数

**完成判定条件**:
- 条款已关联至少一份有效文件
- 文件分析状态为 `completed`
- 匹配状态为 `valid`

### 3.3 资料完整率

**定义**: 各类安全资料的完整性评分。

**计算公式**:

```
资料完整率 = Σ(各分类资料完整度 × 权重) / Σ(权重) × 100
```

**分类权重**:

| 分类 | 权重 | 说明 |
|------|------|------|
| 安全教育培训 | 20% | 培训计划、记录、考核 |
| 安全检查记录 | 15% | 日常检查、专项检查 |
| 隐患排查治理 | 20% | 隐患发现、整改、闭环 |
| 应急管理 | 15% | 预案、演练、评估 |
| 规章制度 | 15% | 安全制度、操作规程 |
| 风险管控 | 15% | 风险辨识、管控措施 |

**单类完整度计算**:

```
分类完整度 = (实际文件数 / 要求文件数) × 100
```

### 3.4 隐患整改率

**定义**: 已完成整改的隐患数占总隐患数的比例。

**计算公式**:

```
隐患整改率 = (已闭环隐患数 / 总隐患数) × 100
```

**数据来源**:
- `hazards` 表 - 隐患数据

**状态判定**:
- 已闭环: status = 'closed'
- 总隐患: status IN ('open', 'processing', 'closed')

**时效性要求**:

| 隐患等级 | 整改时限 | 逾期扣分系数 |
|----------|----------|--------------|
| 重大 | 24小时 | 0.5 |
| 较大 | 3天 | 0.7 |
| 一般 | 7天 | 0.9 |
| 轻微 | 15天 | 1.0 |

**带时效修正的整改率**:

```
隐患整改率(修正) = Σ(隐患整改得分) / Σ(隐患应得分) × 100

隐患整改得分 = 
    IF(整改时间 ≤ 时限, 1, 逾期扣分系数) × 隐患权重

隐患权重 = 
    重大: 4, 较大: 3, 一般: 2, 轻微: 1
```

### 3.5 培训完成率

**定义**: 已完成培训的人员比例及培训计划执行情况。

**计算公式**:

```
培训完成率 = 培训覆盖率 × 60% + 计划完成率 × 40%

培训覆盖率 = (已培训人数 / 应培训人数) × 100
计划完成率 = (已完成培训次数 / 计划培训次数) × 100
```

**数据来源**:
- `training_records` 表 - 培训记录
- `personnel` 表 - 人员数据

### 3.6 风险管控率

**定义**: 已落实管控措施的风险源比例。

**计算公式**:

```
风险管控率 = (已管控风险源数 / 总风险源数) × 100
```

**数据来源**:
- `risk_sources` 表 - 风险源数据

**管控判定条件**:
- 已制定管控措施
- 管控措施已落实
- 责任人已确认

---

## 四、评分计算流程

```
定时任务触发 (每日凌晨)
    ↓
数据收集阶段
    ├─ 查询 safety_standard_clauses → 计算标准化完成率
    ├─ 查询 document_files + document_categories → 计算资料完整率
    ├─ 查询 hazards → 计算隐患整改率
    ├─ 查询 training_records → 计算培训完成率
    └─ 查询 risk_sources → 计算风险管控率
    ↓
指标计算阶段
    ├─ 标准化完成率 × 30%
    ├─ 资料完整率 × 25%
    ├─ 隐患整改率 × 20%
    ├─ 培训完成率 × 15%
    └─ 风险管控率 × 10%
    ↓
综合评分计算
    ├─ 求和得到安全标准化指数
    ├─ 根据分数确定等级
    └─ 生成评分记录
    ↓
存储评分结果
    └─ 写入 safety_scores 表
    ↓
发送通知提醒
    └─ 评分异常时通知相关人员
```

---

## 五、评分数据库设计

### 5.1 safety_scores（评分记录表）

存储每次评分计算的结果。

| 字段名 | 类型 | 约束 | 中文注释 |
|--------|------|------|----------|
| id | BIGSERIAL | PRIMARY KEY | 主键ID |
| score_date | DATE | NOT NULL, UNIQUE | 评分日期 |
| standard_score | DECIMAL(5,2) | NOT NULL | 标准化完成率(0-100) |
| document_score | DECIMAL(5,2) | NOT NULL | 资料完整率(0-100) |
| hazard_score | DECIMAL(5,2) | NOT NULL | 隐患整改率(0-100) |
| training_score | DECIMAL(5,2) | NOT NULL | 培训完成率(0-100) |
| risk_score | DECIMAL(5,2) | NOT NULL | 风险管控率(0-100) |
| overall_score | DECIMAL(5,2) | NOT NULL | 安全标准化指数(0-100) |
| overall_level | VARCHAR(16) | NOT NULL | 综合等级: excellent/good/qualified/basic/unqualified |
| details | JSONB | NULL | 详细评分数据 |
| calculated_by | VARCHAR(64) | NULL | 计算人(系统自动) |
| calculated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 计算时间 |

**索引设计**:
```sql
CREATE INDEX idx_score_date ON safety_scores(score_date);
CREATE INDEX idx_score_level ON safety_scores(overall_level);
```

**details JSON结构示例**:
```json
{
  "standard": {
    "totalClauses": 150,
    "completedClauses": 135,
    "rate": 90
  },
  "document": {
    "categories": [
      {"name": "安全教育培训", "score": 95, "weight": 0.2},
      {"name": "安全检查记录", "score": 85, "weight": 0.15}
    ]
  },
  "hazard": {
    "total": 50,
    "closed": 48,
    "overdue": 2,
    "rate": 96
  },
  "training": {
    "coverage": 98,
    "planCompletion": 100,
    "rate": 98.8
  },
  "risk": {
    "total": 30,
    "controlled": 28,
    "rate": 93.33
  }
}
```

### 5.2 safety_score_trends（评分趋势表）

存储评分趋势数据，用于图表展示。

| 字段名 | 类型 | 约束 | 中文注释 |
|--------|------|------|----------|
| id | BIGSERIAL | PRIMARY KEY | 主键ID |
| trend_type | VARCHAR(32) | NOT NULL | 趋势类型: daily/weekly/monthly/quarterly |
| period_start | DATE | NOT NULL | 周期起始日期 |
| period_end | DATE | NOT NULL | 周期结束日期 |
| standard_score_avg | DECIMAL(5,2) | NULL | 周期内标准化完成率平均值 |
| document_score_avg | DECIMAL(5,2) | NULL | 周期内资料完整率平均值 |
| hazard_score_avg | DECIMAL(5,2) | NULL | 周期内隐患整改率平均值 |
| training_score_avg | DECIMAL(5,2) | NULL | 周期内培训完成率平均值 |
| risk_score_avg | DECIMAL(5,2) | NULL | 周期内风险管控率平均值 |
| overall_score_avg | DECIMAL(5,2) | NULL | 周期内安全标准化指数平均值 |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 创建时间 |

**索引设计**:
```sql
CREATE INDEX idx_trend_type_period ON safety_score_trends(trend_type, period_start);
```

---

## 六、评分规则引擎设计

### 6.1 规则配置

评分规则支持动态配置，存储在数据库中。

```sql
CREATE TABLE safety_score_rules (
    id BIGSERIAL PRIMARY KEY,
    rule_code VARCHAR(64) NOT NULL UNIQUE,
    rule_name VARCHAR(128) NOT NULL,
    rule_type VARCHAR(32) NOT NULL,
    calculation_formula TEXT NOT NULL,
    weight DECIMAL(5,2) NOT NULL,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**规则示例**:

| rule_code | rule_name | rule_type | weight |
|-----------|-----------|-----------|--------|
| SCORE_STANDARD | 标准化完成率 | standard | 30 |
| SCORE_DOCUMENT | 资料完整率 | document | 25 |
| SCORE_HAZARD | 隐患整改率 | hazard | 20 |
| SCORE_TRAINING | 培训完成率 | training | 15 |
| SCORE_RISK | 风险管控率 | risk | 10 |

### 6.2 评分计算服务

**服务接口**:

```typescript
interface ScoreService {
  calculateDailyScore(date: Date): Promise<ScoreResult>;
  calculateWeeklyScore(weekStart: Date): Promise<ScoreResult>;
  calculateMonthlyScore(month: number, year: number): Promise<ScoreResult>;
  getScoreHistory(startDate: Date, endDate: Date): Promise<ScoreResult[]>;
  getScoreTrend(trendType: string): Promise<TrendResult[]>;
}
```

---

## 七、评分展示设计

### 7.1 评分看板

在驾驶舱首页展示核心评分指标：

```
┌─────────────────────────────────────────────────────────┐
│                    安全标准化指数                        │
│                    ┌─────────────────┐                 │
│                    │      92%        │                 │
│                    │     优秀        │                 │
│                    └─────────────────┘                 │
├─────────────┬─────────────┬─────────────┬──────────────┤
│ 标准化完成率 │ 资料完整率   │ 隐患整改率   │ 培训完成率    │
│     90%     │     95%     │     98%     │    100%      │
│   [绿色]    │   [绿色]    │   [绿色]    │   [绿色]     │
├─────────────┴─────────────┴─────────────┴──────────────┤
│ 风险管控率                                               │
│     93%                                                  │
│   [绿色]                                                 │
└─────────────────────────────────────────────────────────┘
```

### 7.2 评分趋势图

展示月度评分趋势：

```
100 ┤
 90 ┤        ╭─────╮
 80 ┤   ╭────╯     ╰──────╮
 70 ┤  ╱                  ╲
 60 ┤ ╱                    ╲
 50 ┤╱                      ╲
 40 ┤
    └──────┬──────┬──────┬──────┬──────┬──────┐
         1月    2月    3月    4月    5月    6月
```

---

## 八、评分预警机制

### 8.1 预警规则

| 预警类型 | 触发条件 | 预警级别 | 通知对象 |
|----------|----------|----------|----------|
| 指数下降 | 安全标准化指数环比下降 ≥5% | 黄色 | 安全管理员 |
| 指数过低 | 安全标准化指数 < 70 | 红色 | 分管领导、安全负责人 |
| 隐患逾期 | 隐患整改超过时限 | 橙色 | 隐患责任人、安全管理员 |
| 培训不足 | 培训完成率 < 80% | 黄色 | 培训负责人 |
| 资料缺失 | 资料完整率 < 80% | 黄色 | 资料管理员 |

### 8.2 预警通知

预警触发后，通过以下方式通知：

1. **系统通知** - 站内消息提醒
2. **飞书通知** - 通过飞书机器人发送消息
3. **邮件通知** - 发送预警邮件

---

## 九、总结

### 9.1 评分模型特点

1. **多维度评估**: 从标准化、资料、隐患、培训、风险五个维度全面评估
2. **权重可调**: 各指标权重可根据实际需求调整
3. **时效修正**: 隐患整改考虑时效性，逾期扣分
4. **自动计算**: 每日自动计算，无需人工干预
5. **趋势分析**: 支持日/周/月/季度趋势统计
6. **预警机制**: 评分异常时自动预警

### 9.2 数据流转

```
业务数据 → 评分计算 → 评分记录 → 趋势分析 → 看板展示 → 预警通知
```

---

**文档版本**: V2.0  
**生成日期**: 2026-07-18  
**设计范围**: 安全标准化评分模型、计算公式、数据库设计
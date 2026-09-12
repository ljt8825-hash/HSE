# 项目公司HSE运营评价模型设计

## 文档信息

| 项目 | 内容 |
|------|------|
| 所属Sprint | Sprint10-C 项目公司HSE运营评价与管理成熟度中心建设 |
| 版本 | v1.0 |
| 日期 | 2026-07-23 |
| 系统定位 | 项目公司HSE智能运营管理系统（项目公司为主体） |

---

## 一、评价模型概述

### 1.1 设计思路

基于现有HSE业务数据，建立多维度、可量化的运营评价模型，实现对项目公司HSE管理能力的科学评价。

### 1.2 评价框架

```
综合评分（100分）
    │
    ├── 安全风险水平（25分）
    │   ├── 风险等级分布（8分）
    │   ├── 风险变化趋势（7分）
    │   └── 高风险占比（10分）
    │
    ├── 隐患整改能力（20分）
    │   ├── 整改完成率（8分）
    │   ├── 整改时效（6分）
    │   ├── 逾期率（3分）
    │   └── 重复问题率（3分）
    │
    ├── 三检管理能力（15分）
    │   ├── 三检覆盖率（5分）
    │   ├── 三检合格率（5分）
    │   └── 问题闭环率（5分）
    │
    ├── 培训管理能力（10分）
    │   ├── 培训完成率（4分）
    │   ├── 持证上岗率（3分）
    │   └── 考试合格率（3分）
    │
    ├── 事故管理能力（10分）
    │   ├── 事故发生率（4分）
    │   ├── 事故等级分布（3分）
    │   └── 事故响应时效（3分）
    │
    ├── 考核管理能力（10分）
    │   ├── 考核覆盖率（3分）
    │   ├── 考核平均分（4分）
    │   └── 考核优秀率（3分）
    │
    └── 风险改善能力（10分）
        ├── 建议采纳率（4分）
        ├── 改善效果（3分）
        └── 风险降低率（3分）
```

---

## 二、七维度详细设计

### 2.1 安全风险水平（权重25%）

#### 2.1.1 指标构成

| 指标 | 子权重 | 满分 | 计算方式 | 数据来源 |
|------|--------|------|----------|----------|
| 风险等级分布 | 32% | 8 | 根据风险等级分布计算 | hse_risk_record |
| 风险变化趋势 | 28% | 7 | 环比变化率 | hse_risk_trend |
| 高风险占比 | 40% | 10 | 高风险人数/总人数 | hse_risk_record |

#### 2.1.2 评分规则

**指标1：风险等级分布（满分8分）**

| 条件 | 得分 |
|------|------|
| 极高+高风险占比 < 5% | 8分 |
| 极高+高风险占比 5%-10% | 6分 |
| 极高+高风险占比 10%-15% | 4分 |
| 极高+高风险占比 > 15% | 2分 |
| 无数据 | 0分 |

**指标2：风险变化趋势（满分7分）**

| 条件 | 得分 |
|------|------|
| 风险分下降 > 5分 | 7分 |
| 风险分下降 2-5分 | 5分 |
| 风险分变化 < 2分 | 4分 |
| 风险分上升 2-5分 | 2分 |
| 风险分上升 > 5分 | 0分 |

**指标3：高风险占比（满分10分）**

```
得分 = 10 - (高风险占比 × 100)
```

| 高风险占比 | 得分 |
|------------|------|
| 0% | 10分 |
| 5% | 5分 |
| 10% | 0分 |
| >10% | 0分（封顶） |

### 2.2 隐患整改能力（权重20%）

#### 2.2.1 指标构成

| 指标 | 子权重 | 满分 | 计算方式 | 数据来源 |
|------|--------|------|----------|----------|
| 整改完成率 | 40% | 8 | 按时完成数/总数 | hse_rectification_task |
| 整改时效 | 30% | 6 | 平均整改周期对比标准 | hse_rectification_task |
| 逾期率 | 15% | 3 | 逾期数/总数 | hse_rectification_task |
| 重复问题率 | 15% | 3 | 重复问题数/总问题数 | hse_rectification_task |

#### 2.2.2 评分规则

**指标1：整改完成率（满分8分）**

```
完成率 = 按时完成数 / 应完成数
得分 = 完成率 × 8
```

| 完成率 | 得分 |
|--------|------|
| ≥95% | 8分 |
| 90-94% | 7分 |
| 85-89% | 6分 |
| 80-84% | 4分 |
| <80% | 2分 |

**指标2：整改时效（满分6分）**

标准周期：
- 一般隐患：3天
- 较大隐患：7天
- 重大隐患：15天

```
时效得分 = MIN(实际周期 / 标准周期, 1) × 6
```

**指标3：逾期率（满分3分，反向指标）**

```
逾期率 = 逾期数 / 总数
得分 = MAX(3 - 逾期率 × 30, 0)
```

| 逾期率 | 得分 |
|--------|------|
| ≤5% | 3分 |
| 5-10% | 2分 |
| 10-20% | 1分 |
| >20% | 0分 |

**指标4：重复问题率（满分3分，反向指标）**

```
重复率 = 重复问题数 / 总问题数
得分 = MAX(3 - 重复率 × 30, 0)
```

### 2.3 三检管理能力（权重15%）

#### 2.3.1 指标构成

| 指标 | 子权重 | 满分 | 计算方式 | 数据来源 |
|------|--------|------|----------|----------|
| 三检覆盖率 | 33% | 5 | 实际检查人次/应检查人次 | hse_inspection_record |
| 三检合格率 | 33% | 5 | 合格问题数/总问题数 | hse_inspection_record |
| 问题闭环率 | 34% | 5 | 已闭环问题数/总问题数 | hse_inspection_record |

#### 2.3.2 评分规则

**指标1：三检覆盖率（满分5分）**

```
覆盖率 = 实际检查人次 / 应检查人次
得分 = MIN(覆盖率, 1) × 5
```

| 覆盖率 | 得分 |
|--------|------|
| ≥95% | 5分 |
| 90-94% | 4分 |
| 85-89% | 3分 |
| 80-84% | 2分 |
| <80% | 1分 |

**指标2：三检合格率（满分5分）**

```
合格率 = 1 - (不合格数 / 总数)
得分 = 合格率 × 5
```

**指标3：问题闭环率（满分5分）**

```
闭环率 = 已闭环问题数 / 总问题数
得分 = MIN(闭环率, 1) × 5
```

### 2.4 培训管理能力（权重10%）

#### 2.4.1 指标构成

| 指标 | 子权重 | 满分 | 计算方式 | 数据来源 |
|------|--------|------|----------|----------|
| 培训完成率 | 40% | 4 | 完成培训人次/应培训人次 | hse_training_record |
| 持证上岗率 | 30% | 3 | 持证人数/应持证人数 | hse_training_record |
| 考试合格率 | 30% | 3 | 合格人数/考试人数 | hse_training_record |

#### 2.4.2 评分规则

**指标1：培训完成率（满分4分）**

```
完成率 = 完成人次 / 应培训人次
得分 = MIN(完成率, 1) × 4
```

**指标2：持证上岗率（满分3分）**

```
持证率 = 持证人数 / 应持证人数
得分 = 持证率 × 3
```

**指标3：考试合格率（满分3分）**

```
合格率 = 合格人数 / 考试人数
得分 = 合格率 × 3
```

### 2.5 事故管理能力（权重10%）

#### 2.5.1 指标构成

| 指标 | 子权重 | 满分 | 计算方式 | 数据来源 |
|------|--------|------|----------|----------|
| 事故发生率 | 40% | 4 | 事故数/总人数 | hse_accident |
| 事故等级分布 | 30% | 3 | 重大事故扣分 | hse_accident |
| 事故响应时效 | 30% | 3 | 平均响应时间 | hse_accident |

#### 2.5.2 评分规则

**指标1：事故发生率（满分4分，反向指标）**

```
发生率 = 事故数 / 总人数
得分 = MAX(4 - 发生率 × 200, 0)
```

| 发生率 | 得分 |
|--------|------|
| ≤0.5% | 4分 |
| 0.5-1% | 3分 |
| 1-2% | 2分 |
| >2% | 0分 |

**指标2：事故等级分布（满分3分）**

| 条件 | 得分 |
|------|------|
| 无重大及以上事故 | 3分 |
| 1起较大事故 | 2分 |
| 1起重大事故 或 2起较大事故 | 1分 |
| 其他 | 0分 |

**指标3：事故响应时效（满分3分）**

```
平均响应时间 = SUM(响应时长) / 事故数
得分 = MAX(3 - 平均响应时间/60, 0)
```

### 2.6 考核管理能力（权重10%）

#### 2.6.1 指标构成

| 指标 | 子权重 | 满分 | 计算方式 | 数据来源 |
|------|--------|------|----------|----------|
| 考核覆盖率 | 30% | 3 | 已考核人数/应考核人数 | hse_assessment_record |
| 考核平均分 | 40% | 4 | 考核平均分 | hse_assessment_record |
| 考核优秀率 | 30% | 3 | 优秀人数/考核人数 | hse_assessment_record |

#### 2.6.2 评分规则

**指标1：考核覆盖率（满分3分）**

```
覆盖率 = 已考核人数 / 应考核人数
得分 = MIN(覆盖率, 1) × 3
```

**指标2：考核平均分（满分4分）**

| 平均分 | 得分 |
|--------|------|
| ≥90分 | 4分 |
| 85-89分 | 3分 |
| 80-84分 | 2分 |
| <80分 | 1分 |

**指标3：考核优秀率（满分3分）**

```
优秀率 = 优秀人数 / 考核人数
得分 = MIN(优秀率 / 20%, 1) × 3
```

### 2.7 风险改善能力（权重10%）

#### 2.7.1 指标构成

| 指标 | 子权重 | 满分 | 计算方式 | 数据来源 |
|------|--------|------|----------|----------|
| 建议采纳率 | 40% | 4 | 已采纳建议数/总建议数 | hse_risk_suggestion |
| 改善效果 | 30% | 3 | 风险分变化 | hse_risk_trend |
| 风险降低率 | 30% | 3 | 风险降低人数比例 | hse_risk_record |

#### 2.7.2 评分规则

**指标1：建议采纳率（满分4分）**

```
采纳率 = 已采纳数 / 总建议数
得分 = MIN(采纳率, 1) × 4
```

**指标2：改善效果（满分3分）**

```
效果 = 改善后风险分 - 改善前风险分（负值为改善）
得分 = MAX(3 + 效果 / 5, 0)
```

| 风险分降低 | 得分 |
|------------|------|
| >5分 | 3分 |
| 2-5分 | 2分 |
| 0-2分 | 1分 |
| 上升 | 0分 |

**指标3：风险降低率（满分3分）**

```
降低率 = 风险降低人数 / 总人数
得分 = MIN(降低率 / 30%, 1) × 3
```

---

## 三、等级评定规则

### 3.1 等级划分

| 等级 | 名称 | 分数范围 | 颜色标识 |
|------|------|----------|----------|
| A | 优秀 | ≥90分 | 绿色 |
| B | 良好 | 80-89分 | 蓝色 |
| C | 合格 | 70-79分 | 橙色 |
| D | 待改进 | 60-69分 | 红色 |
| E | 不合格 | <60分 | 深灰 |

### 3.2 等级附加条件

| 条件 | 说明 |
|------|------|
| 一票否决 | 发生重大事故，等级降为D |
| 数据缺失 | 评价数据完整度<70%，等级降一级 |
| 趋势恶化 | 连续3期下降，等级降一级 |

### 3.3 等级调整示例

| 综合评分 | 附加条件 | 最终等级 |
|----------|----------|----------|
| 86分 | 无 | B |
| 86分 | 连续3期下降 | C |
| 86分 | 数据完整度65% | C |
| 86分 | 发生重大事故 | D |

---

## 四、评价周期与触发

### 4.1 评价周期

| 周期 | 计算时间 | 用途 |
|------|----------|------|
| 月度 | 每月5日 | 月度运营分析 |
| 季度 | 季度首月10日 | 季度考核 |
| 年度 | 次年1月15日 | 年度总结 |

### 4.2 数据统计周期

| 周期 | 数据范围 |
|------|----------|
| 月度 | 上月1日至月末 |
| 季度 | 上季度3个月 |
| 年度 | 上年12个月 |

### 4.3 计算流程

```
1. 数据采集
   ├── 从各业务表读取数据
   ├── 按评价周期筛选
   └── 按组织层级聚合

2. 指标计算
   ├── 计算各子指标
   ├── 应用评分规则
   └── 汇总维度得分

3. 综合评分
   ├── 加权汇总七维度
   ├── 应用等级评定规则
   └── 生成综合结果

4. 结果存储
   ├── 保存评价记录
   ├── 保存维度明细
   └── 保存排名数据
```

---

## 五、数据库表设计

### 5.1 评价记录表

```sql
CREATE TABLE hse_evaluation_record (
    eval_id         BIGSERIAL PRIMARY KEY,
    org_id          BIGINT NOT NULL,
    org_type        VARCHAR(20) NOT NULL,
    -- company / center / area / township / grid
    org_name        VARCHAR(200),
    period_type     VARCHAR(10) NOT NULL,
    -- monthly / quarterly / yearly
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,
    total_score     DECIMAL(5,2) NOT NULL,
    grade           VARCHAR(5) NOT NULL,
    -- A / B / C / D / E
    previous_score  DECIMAL(5,2),
    previous_grade   VARCHAR(5),
    score_change    DECIMAL(5,2),
    data_completeness DECIMAL(5,2),
    evaluator_id    BIGINT,
    evaluated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_eval_org ON hse_evaluation_record(org_id, org_type);
CREATE INDEX idx_eval_period ON hse_evaluation_record(period_type, period_start);
CREATE INDEX idx_eval_score ON hse_evaluation_record(total_score DESC);
```

### 5.2 评价维度明细表

```sql
CREATE TABLE hse_evaluation_dimension (
    dim_id          BIGSERIAL PRIMARY KEY,
    eval_id         BIGINT NOT NULL REFERENCES hse_evaluation_record(eval_id),
    dimension       VARCHAR(30) NOT NULL,
    -- risk / rectification / inspection / training / accident / assessment / improvement
    dimension_name  VARCHAR(100),
    weight          DECIMAL(5,2) NOT NULL,
    score           DECIMAL(5,2) NOT NULL,
    max_score       DECIMAL(5,2) NOT NULL,
    percentage      DECIMAL(5,2),
    detail          JSONB,
    -- {indicator1: score, indicator2: score, ...}
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_dim_eval ON hse_evaluation_dimension(eval_id);
CREATE INDEX idx_dim_type ON hse_evaluation_dimension(dimension);
```

### 5.3 指标明细表

```sql
CREATE TABLE hse_evaluation_indicator (
    ind_id          BIGSERIAL PRIMARY KEY,
    dim_id          BIGINT NOT NULL REFERENCES hse_evaluation_dimension(dim_id),
    indicator_code  VARCHAR(50) NOT NULL,
    indicator_name  VARCHAR(200),
    sub_weight      DECIMAL(5,2),
    score           DECIMAL(5,2),
    max_score       DECIMAL(5,2),
    raw_value       DECIMAL(10,4),
    -- 原始计算值
    computed_formula VARCHAR(200),
    -- 使用的计算公式
    data_source     VARCHAR(100),
    -- 数据来源表
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ind_dim ON hse_evaluation_indicator(dim_id);
CREATE INDEX idx_ind_code ON hse_evaluation_indicator(indicator_code);
```

### 5.4 组织排名表

```sql
CREATE TABLE hse_evaluation_rank (
    rank_id         BIGSERIAL PRIMARY KEY,
    eval_id         BIGINT NOT NULL REFERENCES hse_evaluation_record(eval_id),
    org_id          BIGINT NOT NULL,
    org_type        VARCHAR(20) NOT NULL,
    org_name        VARCHAR(200),
    score           DECIMAL(5,2) NOT NULL,
    grade           VARCHAR(5),
    rank_position   INT,
    total_count     INT,
    percentile      DECIMAL(5,2),
    -- 百分位排名
    period_type     VARCHAR(10),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_rank_eval ON hse_evaluation_rank(eval_id);
CREATE INDEX idx_rank_org ON hse_evaluation_rank(org_id, org_type);
```

### 5.5 评价改善建议表

```sql
CREATE TABLE hse_evaluation_suggestion (
    sug_id          BIGSERIAL PRIMARY KEY,
    eval_id         BIGINT NOT NULL REFERENCES hse_evaluation_record(eval_id),
    dimension       VARCHAR(30) NOT NULL,
    -- 低分维度
    suggestion_type VARCHAR(30),
    -- improvement / training / inspection / rectification
    suggestion_title VARCHAR(500),
    suggestion_content TEXT,
    priority        VARCHAR(10) DEFAULT 'medium',
    -- high / medium / low
    related_data    JSONB,
    -- 关联的低分指标
    status          VARCHAR(20) DEFAULT 'pending',
    -- pending / accepted / rejected / completed
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sug_eval ON hse_evaluation_suggestion(eval_id);
CREATE INDEX idx_sug_status ON hse_evaluation_suggestion(status);
```

---

## 六、计算服务设计

### 6.1 定时任务

| 任务 | 执行时间 | 说明 |
|------|----------|------|
| 月度评价计算 | 每月5日 02:00 | 计算上月评价数据 |
| 季度评价计算 | 季度首月10日 02:00 | 计算上季度评价数据 |
| 年度评价计算 | 次年1月15日 02:00 | 计算上年评价数据 |

### 6.2 计算服务流程

```
1. 初始化
   ├── 获取评价周期参数
   ├── 获取有效评价规则版本
   └── 初始化计算上下文

2. 数据聚合
   ├── 按组织层级遍历
   ├── 聚合各维度原始数据
   └── 处理数据缺失和异常值

3. 指标计算
   ├── 执行各子指标计算
   ├── 应用评分规则
   └── 生成指标明细

4. 维度汇总
   ├── 加权汇总维度得分
   ├── 计算维度百分位
   └── 识别优短板维度

5. 综合评分
   ├── 加权汇总七维度
   ├── 应用等级评定规则
   ├── 检查附加条件
   └── 生成最终等级

6. 结果生成
   ├── 保存评价记录
   ├── 保存维度明细
   ├── 计算组织排名
   ├── 生成改善建议
   └── 输出评价报告
```

### 6.3 数据异常处理

| 异常类型 | 处理方式 |
|----------|----------|
| 数据缺失 | 标记缺失，按规则扣分 |
| 数据异常值 | 剔除异常值，使用均值替代 |
| 计算超时 | 记录日志，重试3次 |
| 并发冲突 | 使用乐观锁，失败重试 |

---

## 七、API接口设计

### 7.1 评价查询接口

| 接口 | 方法 | 说明 |
|------|------|------|
| /api/hse/evaluations/list | GET | 查询评价记录列表 |
| /api/hse/evaluations/:id | GET | 查询评价详情 |
| /api/hse/evaluations/dimensions | GET | 查询维度明细 |
| /api/hse/evaluations/ranks | GET | 查询组织排名 |
| /api/hse/evaluations/suggestions | GET | 查询改善建议 |

### 7.2 评价计算接口

| 接口 | 方法 | 说明 |
|------|------|------|
| /api/hse/evaluations/calculate | POST | 触发评价计算 |
| /api/hse/evaluations/preview | POST | 预览评价结果（不保存） |
| /api/hse/evaluations/export | GET | 导出评价报告 |

### 7.3 接口参数示例

**评价计算接口：POST /api/hse/evaluations/calculate**

```json
{
  "period_type": "monthly",
  "period_start": "2026-06-01",
  "period_end": "2026-06-30",
  "org_id": null,
  "org_type": "company",
  "force": false
}
```

**评价详情接口：GET /api/hse/evaluations/:id**

```json
{
  "eval_id": 1,
  "org_info": {
    "org_id": 1,
    "org_name": "项目公司",
    "org_type": "company"
  },
  "total_score": 85.6,
  "grade": "B",
  "dimensions": [
    {
      "dimension": "risk",
      "dimension_name": "安全风险水平",
      "score": 21.4,
      "max_score": 25,
      "percentage": 85.6
    }
  ],
  "suggestions": [...]
}
```

---

## 八、前端展示设计

### 8.1 综合评价卡片

| 组件 | 说明 |
|------|------|
| 综合评分 | 大号数字 + 等级标签 |
| 趋势指示器 | 环比变化箭头 + 数值 |
| 数据完整度 | 显示评价数据完整度 |

### 8.2 维度雷达图

使用ECharts雷达图展示七维度得分：
- X轴：七个维度
- Y轴：0-100分
- 对比：当前期 vs 上期

### 8.3 优短板分析

| 组件 | 说明 |
|------|------|
| 优势列表 | Top2-3高得分维度 + 原因说明 |
| 短板列表 | Bottom2-3低得分维度 + 原因说明 |
| 改善建议 | AI生成的针对性建议 |

### 8.4 组织对比视图

| 视图 | 说明 |
|------|------|
| 表格视图 | 多组织横向对比表 |
| 柱状图 | 各组织综合评分柱状图 |
| 雷达图 | 各组织维度雷达叠加对比 |

---

## 附录

### A. 评价指标字典

| 指标编码 | 指标名称 | 所属维度 | 计算类型 |
|----------|----------|----------|----------|
| RISK_DIST | 风险等级分布 | 安全风险 | 分布评分 |
| RISK_TREND | 风险变化趋势 | 安全风险 | 变化率评分 |
| RISK_RATIO | 高风险占比 | 安全风险 | 比例评分 |
| RECT_RATE | 整改完成率 | 隐患整改 | 比例评分 |
| RECT_SPEED | 整改时效 | 隐患整改 | 周期评分 |
| RECT_OVERDUE | 逾期率 | 隐患整改 | 反向评分 |
| RECT_REPEAT | 重复问题率 | 隐患整改 | 反向评分 |
| INSP_COVER | 三检覆盖率 | 三检管理 | 比例评分 |
| INSP_PASS | 三检合格率 | 三检管理 | 比例评分 |
| INSP_CLOSE | 问题闭环率 | 三检管理 | 比例评分 |
| TRAIN_COMPLETE | 培训完成率 | 培训管理 | 比例评分 |
| TRAIN_CERT | 持证上岗率 | 培训管理 | 比例评分 |
| TRAIN_EXAM | 考试合格率 | 培训管理 | 比例评分 |
| ACCI_RATE | 事故发生率 | 事故管理 | 反向评分 |
| ACCI_LEVEL | 事故等级分布 | 事故管理 | 等级评分 |
| ACCI_RESPONSE | 事故响应时效 | 事故管理 | 时间评分 |
| ASSESS_COVER | 考核覆盖率 | 考核管理 | 比例评分 |
| ASSESS_AVG | 考核平均分 | 考核管理 | 数值评分 |
| ASSESS_EXCELLENT | 考核优秀率 | 考核管理 | 比例评分 |
| IMP_ADOPT | 建议采纳率 | 风险改善 | 比例评分 |
| IMP_EFFECT | 改善效果 | 风险改善 | 变化评分 |
| IMP_REDUCE | 风险降低率 | 风险改善 | 比例评分 |

### B. 版本历史

| 版本 | 日期 | 修改内容 |
|------|------|----------|
| v1.0 | 2026-07-23 | 初稿完成 |

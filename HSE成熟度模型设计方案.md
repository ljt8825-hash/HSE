# HSE成熟度模型设计方案

## 文档信息

| 项目 | 内容 |
|------|------|
| 所属Sprint | Sprint10-C 项目公司HSE运营评价与管理成熟度中心建设 |
| 版本 | v1.0 |
| 日期 | 2026-07-23 |
| 系统定位 | 项目公司HSE智能运营管理系统（项目公司为主体） |

---

## 一、成熟度模型概述

### 1.1 设计理念

HSE成熟度模型旨在科学评估项目公司HSE管理能力的发展水平，提供从"初始"到"智能"的五级成长路径，指导组织持续改进。

### 1.2 模型特点

| 特点 | 说明 |
|------|------|
| 分级评定 | L1-L5五级成熟度等级 |
| 多维度评估 | 数据、流程、AI、改进等维度 |
| 可量化 | 各维度均有量化指标 |
| 可追踪 | 成熟度变化历史可追溯 |
| 可指导 | 提供明确的改进方向 |

### 1.3 与现有评价体系关系

| 体系 | 关系 |
|------|------|
| 运营评价 | 成熟度评定的基础数据来源 |
| 风险分析 | 成熟度"主动管理"的支撑 |
| AI能力 | 成熟度"智能管理"的支撑 |

---

## 二、五级成熟度定义

### 2.1 等级总览

| 等级 | 名称 | 核心特征 | 得分范围 |
|------|------|----------|----------|
| L1 | 初始阶段 | 基础数据有积累，但无系统评价和改进机制 | <50分 |
| L2 | 基础管理 | 建立评价机制，依赖人工统计和被动响应 | 50-64分 |
| L3 | 规范管理 | 系统化评价，指标自动计算，定期复盘 | 65-79分 |
| L4 | 主动管理 | 评价驱动改善，形成闭环，主动预警 | 80-94分 |
| L5 | 智能管理 | AI辅助评价，预测性管理，智能优化 | ≥95分 |

### 2.2 各级详细定义

#### L1 初始阶段

| 方面 | 特征 |
|------|------|
| 数据层 | 基础数据有积累，但完整性<60%，存在数据孤岛 |
| 评价层 | 无系统化评价，依赖经验判断 |
| 改进层 | 问题被动响应，无主动改进机制 |
| AI层 | 无AI应用 |
| 组织层 | 责任不清晰，缺乏统一标准 |

**典型表现**：
- 安全数据分散在Excel和纸质记录中
- 出现问题后才处理，无预防措施
- 各作业中心标准不一

#### L2 基础管理

| 方面 | 特征 |
|------|------|
| 数据层 | 主要业务数据系统化，完整性60-75% |
| 评价层 | 建立基本评价指标，人工统计月度评价 |
| 改进层 | 有整改闭环，但以事后整改为主 |
| AI层 | 无AI应用 |
| 组织层 | 明确责任分工，但标准执行不一致 |

**典型表现**：
- 有基本的三检、事故记录系统
- 每月人工汇总评价数据
- 整改工单可追踪，但整改质量不稳定

#### L3 规范管理

| 方面 | 特征 |
|------|------|
| 数据层 | 核心业务数据完整，完整性75-90% |
| 评价层 | 系统化评价，指标自动计算，定期报告 |
| 改进层 | 形成整改闭环，有定期复盘机制 |
| AI层 | 基础AI查询和解释能力 |
| 组织层 | 统一评价标准，组织间可对比 |

**典型表现**：
- 评价系统自动计算各维度得分
- 月度/季度自动生成评价报告
- AI可回答"为什么风险升高"

#### L4 主动管理

| 方面 | 特征 |
|------|------|
| 数据层 | 数据完整准确，完整性90-98% |
| 评价层 | 实时评价，异常预警，主动干预 |
| 改进层 | 评价驱动改善，形成持续改进闭环 |
| AI层 | AI风险分析和改善建议 |
| 组织层 | 主动对标先进，持续优化 |

**典型表现**：
- 风险预警提前发现问题
- AI生成针对性改善建议
- 风险变化趋势可预测

#### L5 智能管理

| 方面 | 特征 |
|------|------|
| 数据层 | 数据完备，完整性≥98%，实时更新 |
| 评价层 | 智能评价，预测性管理，自适应优化 |
| 改进层 | AI驱动持续优化，效果自动评估 |
| AI层 | AI全链路应用：分析→建议→执行→评估 |
| 组织层 | 形成智能运营文化，持续创新 |

**典型表现**：
- AI预测风险变化趋势
- 智能推荐改善措施并自动评估效果
- 管理决策AI辅助

---

## 三、成熟度评定维度

### 3.1 评定维度总览

| 维度 | 权重 | 说明 |
|------|------|------|
| 数据完整度 | 25% | 各业务数据的完整性和准确性 |
| 评价自动化 | 20% | 评价计算的自动化程度 |
| 改善闭环率 | 25% | 问题识别到改善的闭环效率 |
| AI应用程度 | 15% | AI在HSE管理中的应用深度 |
| 持续改进机制 | 15% | 持续改进的机制和执行效果 |

### 3.2 各维度评定标准

#### 维度1：数据完整度（权重25%）

评定各业务模块的数据完整性：

| 数据模块 | 权重 | L1 | L2 | L3 | L4 | L5 |
|----------|------|----|----|----|----|-----|
| 风险数据 | 20% | <50% | 50-65% | 65-80% | 80-95% | ≥95% |
| 三检数据 | 20% | <50% | 50-65% | 65-80% | 80-95% | ≥95% |
| 事故数据 | 15% | <60% | 60-75% | 75-85% | 85-95% | ≥95% |
| 整改数据 | 15% | <50% | 50-65% | 65-80% | 80-95% | ≥95% |
| 培训数据 | 15% | <50% | 50-65% | 65-80% | 80-95% | ≥95% |
| 考核数据 | 10% | <40% | 40-60% | 60-80% | 80-95% | ≥95% |
| 建议数据 | 5% | 无 | 少量 | 部分 | 大部分 | 全部 |

**计算公式**：
```
数据完整度 = Σ(模块完整率 × 模块权重)
```

#### 维度2：评价自动化（权重20%）

| 子项 | L1 | L2 | L3 | L4 | L5 |
|------|----|----|----|----|-----|
| 数据采集 | 全手动 | 部分自动 | 自动采集 | 实时自动 | 智能采集 |
| 指标计算 | 手动统计 | 半自动计算 | 全自动计算 | 自动+校验 | 自适应计算 |
| 报告生成 | 手动编写 | 模板填充 | 自动生成 | 自动+分析 | 智能报告 |
| 异常检测 | 无 | 人工发现 | 规则检测 | 规则+阈值 | AI预测 |

**评定标准**：

| 子项完成情况 | 等级得分 |
|--------------|----------|
| 4项全手动 | L1 |
| 1-2项自动化 | L2 |
| 3项自动化 | L3 |
| 4项自动化+预警 | L4 |
| 4项自动化+智能 | L5 |

#### 维度3：改善闭环率（权重25%）

| 指标 | L1 | L2 | L3 | L4 | L5 |
|------|----|----|----|----|-----|
| 问题识别率 | <50% | 50-65% | 65-80% | 80-95% | ≥95% |
| 整改完成率 | <60% | 60-75% | 75-85% | 85-95% | ≥95% |
| 改善效果率 | <40% | 40-55% | 55-70% | 70-85% | ≥85% |
| 重复问题率 | >30% | 20-30% | 10-20% | 5-10% | <5% |

**计算公式**：
```
改善闭环率 = (识别率 + 完成率 + 效果率) / 3 - 重复率
```

#### 维度4：AI应用程度（权重15%）

| AI能力 | L1 | L2 | L3 | L4 | L5 |
|--------|----|----|----|----|-----|
| 知识查询 | 无 | 基础查询 | 语义搜索 | 智能推荐 | 主动推送 |
| 指标解释 | 无 | 基础解释 | 深度解释 | 关联解释 | 预测解释 |
| 风险分析 | 无 | 无 | 基础分析 | 深度分析 | 预测分析 |
| 改善建议 | 无 | 无 | 无 | 生成建议 | 优化建议 |

**评定标准**：

| 已具备AI能力数 | 等级 |
|----------------|------|
| 0-1项 | L1-L2 |
| 2项 | L3 |
| 3项 | L4 |
| 4项 | L5 |

#### 维度5：持续改进机制（权重15%）

| 子项 | L1 | L2 | L3 | L4 | L5 |
|------|----|----|----|----|-----|
| 复盘频率 | 无 | 不定期 | 月度复盘 | 周度复盘 | 实时复盘 |
| 改进计划 | 无 | 被动接受 | 定期制定 | 主动规划 | 智能生成 |
| 效果评估 | 无 | 主观判断 | 量化评估 | 持续追踪 | 自动优化 |
| 知识沉淀 | 无 | 口头传承 | 文档记录 | 系统化沉淀 | AI知识库 |

---

## 四、成熟度评定规则

### 4.1 综合评定公式

```
成熟度得分 = Σ(维度得分 × 维度权重)

其中：
维度得分 = 各子指标得分的加权汇总（0-100分）
```

### 4.2 等级判定规则

| 条件 | 判定结果 |
|------|----------|
| 综合得分 ≥ 95 且 各维度≥80 | L5 智能管理 |
| 综合得分 80-94 且 各维度≥65 | L4 主动管理 |
| 综合得分 65-79 且 各维度≥50 | L3 规范管理 |
| 综合得分 50-64 | L2 基础管理 |
| 综合得分 < 50 | L1 初始阶段 |

### 4.3 升降级规则

#### 升级条件

| 条件 | 说明 |
|------|------|
| 综合得分达到上一级标准 | 核心条件 |
| 连续3个评价周期保持稳定 | 避免波动升级 |
| 无重大事故 | 安全底线 |

#### 降级条件

| 条件 | 说明 |
|------|------|
| 发生重大及以上事故 | 直接降级至L2 |
| 综合得分连续2期下降超过10分 | 降级1级 |
| 数据完整度下降超过15% | 触发重新评定 |

### 4.4 评定周期

| 周期 | 评定时间 | 用途 |
|------|----------|------|
| 月度 | 每月10日 | 成熟度监测 |
| 季度 | 季度中月15日 | 正式评定 |
| 年度 | 次年2月1日 | 年度定级 |

---

## 五、成熟度改进路径

### 5.1 各级改进方向

#### L1 → L2：基础管理建设

| 改进项 | 具体措施 | 预期时间 |
|--------|----------|----------|
| 数据系统化 | 将Excel/纸质记录迁移至系统 | 1-2月 |
| 建立评价机制 | 制定基本评价指标和统计方法 | 0.5月 |
| 明确责任分工 | 明确各级HSE责任人 | 0.5月 |

**关键目标**：数据完整度达到60%以上

#### L2 → L3：规范管理建设

| 改进项 | 具体措施 | 预期时间 |
|--------|----------|----------|
| 自动化计算 | 开发评价计算脚本，实现自动计算 | 1-2月 |
| 报告自动化 | 自动生成月度/季度评价报告 | 1月 |
| 建立复盘机制 | 建立月度复盘会议制度 | 持续 |
| AI基础应用 | 上线AI知识查询和指标解释 | 1月 |

**关键目标**：评价自动化覆盖率达到60%以上

#### L3 → L4：主动管理建设

| 改进项 | 具体措施 | 预期时间 |
|--------|----------|----------|
| 风险预警 | 建立风险预警规则，实现主动预警 | 1-2月 |
| AI风险分析 | 上线AI风险原因分析和钻取分析 | 2月 |
| 改善闭环 | 建立评价→改善→验证闭环 | 持续 |
| 主动对标 | 组织间横向对比，树立标杆 | 持续 |

**关键目标**：改善闭环率达到80%以上

#### L4 → L5：智能管理建设

| 改进项 | 具体措施 | 预期时间 |
|--------|----------|----------|
| AI预测 | 上线AI风险预测能力 | 2-3月 |
| 智能建议 | AI生成优化的改善建议 | 2月 |
| 自适应优化 | 系统自适应调整评价标准 | 持续 |
| 智能运营文化 | 培养AI辅助决策习惯 | 持续 |

**关键目标**：AI应用覆盖率达到80%以上

### 5.2 改进路线图示例

```
当前状态：L2（得分58分）
    │
    ├── 短板分析
    │   ├── 数据完整度：55分（目标：75分）
    │   ├── 评价自动化：30分（目标：60分）
    │   └── AI应用程度：0分（目标：20分）
    │
    ├── 改进计划（3个月）
    │   ├── 第1月：数据补全 + 评价自动化基础
    │   ├── 第2月：AI知识查询上线 + 报告自动化
    │   └── 第3月：效果验证 + 持续优化
    │
    └── 预期目标：L3（得分70分）
```

---

## 六、数据库设计

### 6.1 成熟度记录表

```sql
CREATE TABLE hse_maturity_record (
    mat_id          BIGSERIAL PRIMARY KEY,
    org_id          BIGINT NOT NULL,
    org_type        VARCHAR(20) NOT NULL,
    org_name        VARCHAR(200),
    level           VARCHAR(5) NOT NULL,
    -- L1 / L2 / L3 / L4 / L5
    score           DECIMAL(5,2) NOT NULL,
    previous_level  VARCHAR(5),
    previous_score  DECIMAL(5,2),
    level_change    VARCHAR(10),
    -- upgrade / downgrade / stable
    period_type     VARCHAR(10) NOT NULL,
    period_start    DATE,
    period_end      DATE,
    assess_date     DATE,
    is_final        BOOLEAN DEFAULT FALSE,
    -- 是否为年度最终评定
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_mat_org ON hse_maturity_record(org_id, org_type);
CREATE INDEX idx_mat_level ON hse_maturity_record(level);
CREATE INDEX idx_mat_period ON hse_maturity_record(period_type, period_start);
```

### 6.2 成熟度维度评定表

```sql
CREATE TABLE hse_maturity_dimension (
    dim_id          BIGSERIAL PRIMARY KEY,
    mat_id          BIGINT NOT NULL REFERENCES hse_maturity_record(mat_id),
    dimension       VARCHAR(30) NOT NULL,
    -- data_completeness / automation / closure_rate / ai_usage / improvement
    dimension_name  VARCHAR(100),
    score           DECIMAL(5,2) NOT NULL,
    max_score       DECIMAL(5,2) NOT NULL,
    weight          DECIMAL(5,2) NOT NULL,
    level           VARCHAR(5),
    -- 该维度的级别 L1-L5
    details         JSONB,
    -- 详细评定数据
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_dim_mat ON hse_maturity_dimension(mat_id);
```

### 6.3 成熟度子指标表

```sql
CREATE TABLE hse_maturity_indicator (
    ind_id          BIGSERIAL PRIMARY KEY,
    dim_id          BIGINT NOT NULL REFERENCES hse_maturity_dimension(dim_id),
    indicator_code  VARCHAR(50) NOT NULL,
    indicator_name  VARCHAR(200),
    category        VARCHAR(50),
    -- 所属子项分类
    score           DECIMAL(5,2),
    max_score       DECIMAL(5,2),
    weight          DECIMAL(5,2),
    value           DECIMAL(10,4),
    -- 实际测量值
    target          DECIMAL(10,4),
    -- 目标值
    level           VARCHAR(5),
    remark          VARCHAR(500),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ind_dim ON hse_maturity_indicator(dim_id);
CREATE INDEX idx_ind_code ON hse_maturity_indicator(indicator_code);
```

### 6.4 成熟度改进计划表

```sql
CREATE TABLE hse_maturity_improvement (
    imp_id          BIGSERIAL PRIMARY KEY,
    mat_id          BIGINT NOT NULL REFERENCES hse_maturity_record(mat_id),
    target_level    VARCHAR(5) NOT NULL,
    target_score    DECIMAL(5,2),
    current_level   VARCHAR(5),
    gap_analysis    TEXT,
    -- 差距分析
    actions         JSONB,
    -- [{step, content, responsible, deadline, status}]
    start_date      DATE,
    end_date        DATE,
    status          VARCHAR(20) DEFAULT 'planning',
    -- planning / in_progress / completed / delayed
    progress        DECIMAL(5,2) DEFAULT 0,
    -- 完成百分比
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_imp_mat ON hse_maturity_improvement(mat_id);
CREATE INDEX idx_imp_status ON hse_maturity_improvement(status);
```

### 6.5 成熟度评定规则表

```sql
CREATE TABLE hse_maturity_criteria (
    crit_id         BIGSERIAL PRIMARY KEY,
    level           VARCHAR(5) NOT NULL,
    -- L1 / L2 / L3 / L4 / L5
    dimension       VARCHAR(30) NOT NULL,
    indicator_code  VARCHAR(50),
    min_value       DECIMAL(10,4),
    max_value       DECIMAL(10,4),
    score_range     VARCHAR(50),
    description     VARCHAR(500),
    weight          DECIMAL(5,2),
    is_required     BOOLEAN DEFAULT FALSE,
    -- 是否为必要条件
    version         VARCHAR(20) DEFAULT 'v1.0',
    effective_date  DATE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_crit_level ON hse_maturity_criteria(level, dimension);
CREATE INDEX idx_crit_version ON hse_maturity_criteria(version);
```

---

## 七、评定流程

### 7.1 自动评定流程

```
1. 数据采集
   ├── 读取评价数据（运营评价结果）
   ├── 读取AI应用记录
   ├── 读取改进计划执行情况
   └── 计算各子指标值

2. 维度评定
   ├── 按维度聚合子指标
   ├── 计算各维度得分
   ├── 评定各维度级别
   └── 生成维度评定明细

3. 综合评定
   ├── 加权汇总维度得分
   ├── 检查必要条件
   ├── 应用升降级规则
   └── 确定成熟度等级

4. 结果生成
   ├── 保存评定记录
   ├── 生成改进建议
   ├── 更新改进计划
   └── 输出评定报告
```

### 7.2 评定触发

| 触发方式 | 说明 |
|----------|------|
| 定时触发 | 每月10日自动触发月度评定 |
| 手动触发 | 管理员可手动触发评定 |
| 事件触发 | 重大事故后触发重新评定 |

### 7.3 评定异常处理

| 异常类型 | 处理方式 |
|----------|----------|
| 数据不足 | 标记数据缺失，使用最近有效数据 |
| 规则变更 | 使用新版本规则重新评定 |
| 计算冲突 | 使用新版本结果覆盖 |
| 触发频率过高 | 限制评定频率（最少间隔1天） |

---

## 八、前端展示设计

### 8.1 成熟度仪表盘

| 组件 | 说明 |
|------|------|
| 等级指示盘 | 0-100分仪表盘 + L1-L5等级标签 |
| 维度雷达图 | 五维度可视化 |
| 变化趋势图 | 成熟度历史变化折线图 |
| 改进路径图 | 从当前等级到目标等级的路径 |

### 8.2 各等级展示

| 等级 | 视觉元素 |
|------|----------|
| L1 | 灰色警示图标 |
| L2 | 黄色提醒图标 |
| L3 | 蓝色标准图标 |
| L4 | 绿色积极图标 |
| L5 | 紫色卓越图标 |

### 8.3 改进建议展示

| 组件 | 说明 |
|------|------|
| 差距分析卡 | 展示当前值与目标值差距 |
| 行动计划卡 | 分步骤的改进计划 |
| 进度追踪条 | 改进计划完成进度 |
| 效果预测图 | 预期改进后成熟度变化 |

---

## 附录

### A. 成熟度评定指标字典

| 指标编码 | 所属维度 | 指标名称 | 计算方式 |
|----------|----------|----------|----------|
| DATA_RISK_COMPLETE | data_completeness | 风险数据完整度 | COUNT(非空记录)/EXPECTED(记录数) |
| DATA_INSP_COMPLETE | data_completeness | 三检数据完整度 | COUNT(非空记录)/EXPECTED(记录数) |
| DATA_ACCI_COMPLETE | data_completeness | 事故数据完整度 | COUNT(非空记录)/EXPECTED(记录数) |
| DATA_RECT_COMPLETE | data_completeness | 整改数据完整度 | COUNT(非空记录)/EXPECTED(记录数) |
| DATA_TRAIN_COMPLETE | data_completeness | 培训数据完整度 | COUNT(非空记录)/EXPECTED(记录数) |
| DATA_ASSESS_COMPLETE | data_completeness | 考核数据完整度 | COUNT(非空记录)/EXPECTED(记录数) |
| DATA_IMP_COMPLETE | data_completeness | 建议数据完整度 | COUNT(建议数)/EXPECTED(建议数) |
| AUTO_COLLECT | automation | 数据采集自动化率 | AUTO_COLLECT_COUNT/TOTAL_COUNT |
| AUTO_CALC | automation | 指标计算自动化率 | AUTO_CALC_COUNT/TOTAL_COUNT |
| AUTO_REPORT | automation | 报告生成自动化率 | AUTO_REPORT_COUNT/TOTAL_COUNT |
| AUTO_DETECT | automation | 异常检测自动化率 | AUTO_DETECT_COUNT/TOTAL_COUNT |
| CLOSED_IDENTIFY | closure_rate | 问题识别率 | IDENTIFIED/TOTAL |
| CLOSED_COMPLETE | closure_rate | 整改完成率 | COMPLETED/TOTAL |
| CLOSED_EFFECT | closure_rate | 改善效果率 | EFFECTIVE/TOTAL |
| CLOSED_REPEAT | closure_rate | 重复问题率 | REPEAT/TOTAL |
| AI_QUERY | ai_usage | AI知识查询能力 | HAS_QUERY_CAPABILITY |
| AI_EXPLAIN | ai_usage | AI指标解释能力 | HAS_EXPLAIN_CAPABILITY |
| AI_ANALYSIS | ai_usage | AI风险分析能力 | HAS_ANALYSIS_CAPABILITY |
| AI_SUGGEST | ai_usage | AI改善建议能力 | HAS_SUGGEST_CAPABILITY |
| IMP_REVIEW | improvement | 复盘机制完善度 | REVIEW_FREQUENCY_SCORE |
| IMP_PLAN | improvement | 改进计划有效性 | PLAN_EFFECTIVENESS_SCORE |
| IMP_EVALUATE | improvement | 效果评估机制 | EVALUATION_MECHANISM_SCORE |
| IMP_KNOWLEDGE | improvement | 知识沉淀程度 | KNOWLEDGE_SCORE |

### B. 版本历史

| 版本 | 日期 | 修改内容 |
|------|------|----------|
| v1.0 | 2026-07-23 | 初稿完成 |

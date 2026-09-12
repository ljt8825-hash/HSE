# AI 自动报告中心设计方案

> 文档版本：v1.0
> 生成日期：2026 年 7 月
> 所属阶段：HSE Dashboard Sprint10-B
> 关联文档：《Sprint10-B 智能决策中心总体设计方案》

---

## 一、概述

### 1.1 设计目标

实现 HSE 日报、周报、月报的 AI 自动生成，替代人工编写报告，提升报告质量和效率，确保管理决策信息及时准确。

### 1.2 报告类型

| 报告类型 | 生成频率 | 生成时间 | 目标读者 |
|----------|----------|----------|----------|
| 《HSE 风险日报》| 每日 | 07:00 | 网格长/片区长 |
| 《HSE 运营周报》| 每周 | 周一 08:00 | 作业中心经理 |
| 《集团 HSE 月度分析报告》| 每月 | 每月 1 日 08:00 | 集团管理层 |

---

## 二、报告内容设计

### 2.1 日报内容

| 章节 | 内容 | 数据来源 |
|------|------|----------|
| 风险概览 | 全员风险等级分布、较昨日变化 | hse_risk_record |
| 重点预警 | 新增预警列表、待处理预警 | hse_warning |
| 整改进展 | 新完成整改、超时预警 | hse_rectify_record |
| 三检概况 | 昨日三检记录数、合格率 | hse_inspection_record |
| 重点关注 | 高风险人员变动、异常事件 | AI 分析 |

### 2.2 周报内容

| 章节 | 内容 | 数据来源 |
|------|------|----------|
| 风险情况 | 本周风险趋势、等级变化 | hse_risk_record |
| 重点问题 | 本周新增高风险、预警集中区域 | AI 分析 |
| 区域排名 | 各片区/网格风险排名 | 聚合计算 |
| 人员风险 | 高风险人员变化、干预进展 | hse_intervention |
| 整改情况 | 整改完成率、超时率、典型案例 | hse_rectify_record |
| 趋势分析 | 五维风险趋势、关键指标变化 | AI 分析 |
| 管理建议 | 下周重点关注和建议措施 | AI 生成 |

### 2.3 月报内容

| 章节 | 内容 | 数据来源 |
|------|------|----------|
| 执行摘要 | 一页纸概览，核心指标和结论 | AI 生成 |
| 风险态势 | 月度风险全景、等级分布、趋势 | hse_risk_record |
| 三检分析 | 三检合格率、问题分布、改善建议 | hse_inspection_record |
| 事故分析 | 事故统计、类型分布、原因分析 | hse_accident_record |
| 培训分析 | 培训覆盖率、合格率、补训情况 | hse_training_record |
| 考核分析 | 考核得分分布、排名、不合格分析 | hse_assessment_record |
| 整改分析 | 整改完成率、时效、典型案例 | hse_rectify_record |
| 预警分析 | 预警数量、处理率、误报率 | hse_warning |
| 干预评估 | 高风险人员干预效果评估 | hse_intervention |
| 区域排名 | 各片区/网格综合排名 | 聚合计算 |
| 风险预测 | 下月风险趋势预测 | AI 预测 |
| 管理建议 | 管理决策建议和下月重点 | AI 生成 |

---

## 三、报告生成流程

### 3.1 自动生成流程

```
定时触发（cron）
  ↓
Step 1: 数据采集
  ├── 查询报告时间范围内所有业务数据
  ├── 风险/预警/整改/三检/事故/培训/考核
  └── 数据范围受报告类型决定

Step 2: 数据分析
  ├── 统计分析：计数、占比、趋势
  ├── 排名计算：区域排名、人员排名
  ├── 原因分析：AI 分析变化原因
  └── 预测分析：AI 预测未来趋势

Step 3: 知识检索
  ├── 检索相关制度条款
  ├── 检索相关案例参考
  └── 检索相关标准要求

Step 4: 报告生成
  ├── 组装 Prompt（数据 + 分析 + 知识）
  ├── 调用 LLM 生成各章节内容
  ├── 格式化为 Markdown
  └── 生成目录和页码

Step 5: 报告输出
  ├── 保存为系统内文档
  ├── 支持导出 PDF
  └── 推送给目标读者
```

### 3.2 报告生成 Prompt

```
系统角色：你是HSE安全管理报告AI助手，负责生成{report_type}。

报告规范：
1. 所有数据必须来自查询结果，不得编造
2. 分析必须有数据支撑，引用具体数值
3. 建议必须可操作，明确责任人和时限
4. 语言简洁专业，避免冗余
5. 风险描述使用标准术语

数据概览：
{data_summary}

分析结果：
{analysis_results}

知识参考：
{knowledge_reference}

请按以下结构生成报告：
{report_template}
```

---

## 四、报告模板设计

### 4.1 月报模板

```markdown
# 集团 HSE 月度分析报告

**报告期间**：{period}
**生成时间**：{generated_at}
**数据截止**：{data_cutoff}

---

## 一、执行摘要

> {executive_summary_ai}

---

## 二、风险态势

| 指标 | 本月 | 上月 | 变化 |
|------|------|------|------|
| 全员平均评分 | {avg} | {prev_avg} | {change} |
| 高风险人数 | {high} | {prev_high} | {change} |
| 极高风险人数 | {critical} | {prev_critical} | {change} |

{risk_analysis_ai}

---

## 三、各业务模块分析

### 3.1 三检分析
{inspect_analysis_ai}

### 3.2 事故分析
{accident_analysis_ai}

### 3.3 培训分析
{training_analysis_ai}

### 3.4 考核分析
{assessment_analysis_ai}

### 3.5 整改分析
{rectify_analysis_ai}

---

## 四、区域排名

| 排名 | 区域 | 综合评分 | 较上月 |
|------|------|----------|--------|
{region_ranking}

---

## 五、风险预测

{prediction_ai}

---

## 六、管理建议

{management_suggestion_ai}
```

### 4.2 报告审核机制

| 审核环节 | 说明 | 审核人 |
|----------|------|--------|
| 自动校验 | 校验数据准确性和完整性 | 系统 |
| 人工审核 | 审核 AI 生成的分析结论 | 安全管理部 |
| 发布确认 | 确认无误后发布 | 报告负责人 |

---

## 五、报告管理功能

| 功能 | 说明 |
|------|------|
| 报告列表 | 查看历史报告列表 |
| 报告详情 | 查看报告内容 |
| 报告导出 | 导出为 PDF/Word |
| 报告对比 | 对比不同期报告 |
| 手动触发 | 手动触发报告生成 |
| 报告订阅 | 订阅报告推送通知 |

---

## 六、数据库设计

```sql
CREATE TABLE hse_auto_report (
    report_id     BIGSERIAL PRIMARY KEY,
    report_type   VARCHAR(20) NOT NULL,
    period_start  DATE NOT NULL,
    period_end    DATE NOT NULL,
    title         VARCHAR(500) NOT NULL,
    content       TEXT,
    status        VARCHAR(20) DEFAULT 'draft',
    generated_at  TIMESTAMP,
    reviewer      VARCHAR(50),
    reviewed_at   TIMESTAMP,
    published_at  TIMESTAMP,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 七、接口设计

| 接口 | 方法 | 说明 |
|------|------|------|
| /api/report/list | GET | 报告列表 |
| /api/report/{id} | GET | 报告详情 |
| /api/report/generate | POST | 手动触发生成 |
| /api/report/{id}/export | GET | 导出报告 |
| /api/report/{id}/review | PUT | 审核报告 |

---

## 八、版本历史

| 版本 | 日期 | 修订人 | 修订说明 |
|------|------|--------|----------|
| v1.0 | 2026-07 | HSE 团队 | AI 自动报告中心设计方案初始版本 |

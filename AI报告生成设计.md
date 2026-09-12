# AI报告生成设计

> 文档版本：v1.0
> 生成日期：2026 年 7 月
> 所属阶段：HSE Dashboard Sprint8-B
> 关联文档：《Sprint8-B AI辅助决策中心设计报告》、《HSE AI分析模型设计》

---

## 一、设计概述

### 1.1 设计背景

HSE 管理工作需要定期生成各类报告（日报、周报、月报、集团汇报），传统人工编写耗时费力。本设计利用 AI 能力自动生成规范化的管理报告，提升工作效率。

### 1.2 设计目标

1. **自动化生成**：基于数据自动生成报告，减少人工编写
2. **格式标准化**：统一的报告模板和格式规范
3. **内容准确性**：数据来源可靠，分析逻辑清晰
4. **多格式导出**：支持导出为 Word、PDF、HTML 等格式

### 1.3 报告类型

| 报告类型 | 编码 | 生成周期 | 主要内容 |
|----------|------|----------|----------|
| 日报 | daily | 每日 | 当日安全动态、预警汇总、整改进展 |
| 周报 | weekly | 每周 | 本周安全态势、重点问题、下周计划 |
| 月报 | monthly | 每月 | 月度安全分析、考核情况、管理建议 |
| 集团汇报 | group | 按需 | 安全工作总结、重点事项、资源需求 |

---

## 二、报告框架设计

### 2.1 日报框架

```
# HSE安全日报

## 报告日期：{date}
## 报告范围：{scope}

---

## 一、今日安全概况

### 1.1 安全指数
| 指标 | 今日 | 昨日 | 变化 |
|------|------|------|------|
| 安全指数 | {score} | {yesterday_score} | {change} |
| 预警总数 | {warning_count} | {yesterday_warning_count} | {change} |
| 整改完成数 | {rectify_count} | {yesterday_rectify_count} | {change} |

### 1.2 安全状态评价
{ai_analysis_summary}

---

## 二、今日预警动态

### 2.1 新增预警
| 预警编号 | 类型 | 等级 | 对象 | 状态 |
|---------|------|------|------|------|
{new_warnings_table}

### 2.2 预警处置情况
- 待处理：{pending_count}
- 处理中：{processing_count}
- 已完成：{completed_count}

### 2.3 突出问题
{highlight_issues}

---

## 三、今日整改进展

### 3.1 完成整改
| 任务编号 | 类型 | 对象 | 完成时间 |
|---------|------|------|---------|
{completed_rectifications_table}

### 3.2 进行中整改
- 进行中任务数：{in_progress_count}
- 平均处理周期：{avg_days}天

### 3.3 超时预警
{overdue_alerts}

---

## 四、明日重点关注

1. {focus_1}
2. {focus_2}
3. {focus_3}

---

## 五、AI分析建议

{ai_suggestions}

---

报告生成时间：{generated_at}
报告生成方式：AI自动生成
```

### 2.2 周报框架

```
# HSE安全周报

## 报告周期：{period_start} 至 {period_end}
## 报告范围：{scope}

---

## 一、本周安全态势

### 1.1 安全指数变化趋势
{trend_chart}

### 1.2 关键指标统计
| 指标 | 本周 | 上周 | 环比 |
|------|------|------|------|
| 安全指数均值 | {avg_score} | {last_avg_score} | {change}% |
| 预警总数 | {warning_count} | {last_warning_count} | {change}% |
| 整改完成数 | {rectify_count} | {last_rectify_count} | {change}% |
| 事故数量 | {accident_count} | {last_accident_count} | {change}% |

### 1.3 态势分析
{ai_trend_analysis}

---

## 二、预警分析

### 2.1 预警类型分布
{warning_type_distribution}

### 2.2 预警等级分布
| 等级 | 数量 | 占比 |
|------|------|------|
| 重大(critical) | {critical_count} | {critical_ratio}% |
| 较大(major) | {major_count} | {major_ratio}% |
| 一般(minor) | {minor_count} | {minor_ratio}% |

### 2.3 预警处置效率
- 平均处置时长：{avg_handle_hours}小时
- 24小时内处置率：{handle_rate_24h}%
- 超时预警数：{overdue_count}

---

## 三、整改效果分析

### 3.1 整改完成率
{completion_rate}%

### 3.2 整改周期分析
- 平均整改周期：{avg_rectify_days}天
- 最短周期：{min_days}天
- 最长周期：{max_days}天

### 3.3 重复风险率
{repeat_risk_rate}%

---

## 四、重点问题分析

### 4.1 重大预警处理情况
{critical_warnings_detail}

### 4.2 重复问题分析
{repeat_issues_analysis}

### 4.3 典型案例
{typical_cases}

---

## 五、下周工作计划

### 5.1 重点整改任务
1. {task_1}
2. {task_2}
3. {task_3}

### 5.2 预警预防措施
{prevention_measures}

### 5.3 安全活动安排
{safety_activities}

---

## 六、AI管理建议

{ai_management_suggestions}

---

报告生成时间：{generated_at}
报告生成方式：AI自动生成
```

### 2.3 月报框架

```
# HSE安全月报

## 报告月份：{year}年{month}月
## 报告范围：{scope}

---

## 摘要

{executive_summary}

---

## 一、月度安全概况

### 1.1 安全指数评分
| 指标 | 本月 | 上月 | 环比 | 去年同期 | 同比 |
|------|------|------|------|----------|------|
| 安全指数均值 | {avg_score} | {last_avg} | {环比}% | {last_year_avg} | {同比}% |
| 最高风险评分 | {max_score} | - | - | - | - |
| 最低风险评分 | {min_score} | - | - | - | - |

### 1.2 风险分布分析
{risk_distribution_chart}

### 1.3 趋势变化分析
{trend_analysis_chart}

---

## 二、预警分析

### 2.1 预警类型分布
{warning_type_chart}

### 2.2 预警等级分布
{warning_level_chart}

### 2.3 预警处置效率
| 指标 | 本月 | 上月 | 变化 |
|------|------|------|------|
| 平均处置时长 | {avg_hours}小时 | {last_avg_hours}小时 | {change}小时 |
| 24小时处置率 | {rate_24h}% | {last_rate_24h}% | {change}% |
| 超时预警数 | {overdue_count} | {last_overdue_count} | {change} |

### 2.4 预警升级情况
{escalation_analysis}

---

## 三、整改效果分析

### 3.1 整改完成率
- 月度整改任务数：{total_tasks}
- 已完成任务数：{completed_tasks}
- 完成率：{completion_rate}%

### 3.2 整改周期分析
{rectify_cycle_chart}

### 3.3 重复风险率
- 本月重复风险数：{repeat_count}
- 重复风险率：{repeat_rate}%

### 3.4 整改效果评估
{rectify_effect_evaluation}

---

## 四、考核情况分析

### 4.1 考核指标完成度
| 指标 | 目标值 | 实际值 | 完成率 |
|------|--------|--------|--------|
{assessment_indicators_table}

### 4.2 红黄牌情况
- 红牌数：{red_card_count}
- 黄牌数：{yellow_card_count}
- 主要扣分项：{deduction_items}

### 4.3 考核问题分析
{assessment_issues}

---

## 五、事故分析

### 5.1 事故统计
| 等级 | 本月 | 上月 | 同期去年 |
|------|------|------|----------|
| 重大 | {major_count} | {last_major} | {last_year_major} |
| 一般 | {minor_count} | {last_minor} | {last_year_minor} |
| 合计 | {total_count} | {last_total} | {last_year_total} |

### 5.2 事故类型分析
{accident_type_analysis}

### 5.3 事故原因分析
{accident_cause_analysis}

---

## 六、管理建议

### 6.1 存在问题
{existing_issues}

### 6.2 改进措施
{improvement_measures}

### 6.3 资源需求
{resource_requirements}

---

## 七、AI深度分析

{ai_deep_analysis}

---

## 附录

### A. 数据来源说明
{data_sources}

### B. 指标计算说明
{indicator_calculations}

---

报告生成时间：{generated_at}
报告审核状态：{review_status}
报告生成方式：AI自动生成
```

### 2.4 集团汇报框架

```
# HSE安全工作汇报

## 汇报单位：{organization}
## 汇报周期：{period}
## 汇报日期：{date}

---

## 一、工作概述

{work_overview}

---

## 二、安全指标完成情况

### 2.1 核心指标
| 指标 | 年度目标 | 当前值 | 完成率 | 预计达成 |
|------|----------|--------|--------|----------|
{core_indicators_table}

### 2.2 进展分析
{progress_analysis}

---

## 三、重点工作开展情况

### 3.1 安全管理体系建设
{safety_management_system}

### 3.2 风险管控工作
{risk_control_work}

### 3.3 隐患排查治理
{hidden_danger_rectification}

### 3.4 安全教育培训
{safety_training}

### 3.5 应急管理工作
{emergency_management}

---

## 四、存在的主要问题

### 4.1 问题描述
{problem_description}

### 4.2 原因分析
{cause_analysis}

### 4.3 影响评估
{impact_assessment}

---

## 五、下一步工作计划

### 5.1 重点任务
1. {key_task_1}
2. {key_task_2}
3. {key_task_3}

### 5.2 时间节点
{timeline}

### 5.3 预期成效
{expected_results}

---

## 六、需要协调解决的问题

### 6.1 资源需求
| 类别 | 需求内容 | 数量/金额 | 用途说明 |
|------|----------|-----------|----------|
{resource_requirements_table}

### 6.2 政策支持
{policy_support}

### 6.3 其他事项
{other_matters}

---

## 七、AI辅助分析

{ai_assisted_analysis}

---

报告生成时间：{generated_at}
报告审核人：{reviewer}
```

---

## 三、数据聚合设计

### 3.1 日报数据聚合

```javascript
async function aggregateDailyReportData(date) {
  const yesterday = new Date(date);
  yesterday.setDate(yesterday.getDate() - 1);

  const data = {
    date,
    yesterday,
    // 安全指数
    safetyIndex: await getDailySafetyIndex(date),
    yesterdaySafetyIndex: await getDailySafetyIndex(yesterday),

    // 预警数据
    newWarnings: await getNewWarnings(date),
    warningStats: await getWarningStats(date),
    yesterdayWarningStats: await getWarningStats(yesterday),

    // 整改数据
    completedRectifications: await getCompletedRectifications(date),
    inProgressRectifications: await getInProgressRectifications(),
    overdueRectifications: await getOverdueRectifications(),

    // 突出问题
    highlightIssues: await getHighlightIssues(date)
  };

  return data;
}
```

### 3.2 周报数据聚合

```javascript
async function aggregateWeeklyReportData(startDate, endDate) {
  const lastWeekStart = new Date(startDate);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(endDate);
  lastWeekEnd.setDate(lastWeekEnd.getDate() - 7);

  const data = {
    period: { start: startDate, end: endDate },
    lastPeriod: { start: lastWeekStart, end: lastWeekEnd },

    // 安全指数趋势
    safetyTrend: await getSafetyTrend(startDate, endDate),
    lastSafetyTrend: await getSafetyTrend(lastWeekStart, lastWeekEnd),

    // 预警分析
    warningAnalysis: await getWarningAnalysis(startDate, endDate),
    lastWarningAnalysis: await getWarningAnalysis(lastWeekStart, lastWeekEnd),

    // 整改效果
    rectifyEffect: await getRectifyEffect(startDate, endDate),

    // 重点问题
    criticalIssues: await getCriticalIssues(startDate, endDate),

    // 重复问题
    repeatIssues: await getRepeatIssues(startDate, endDate)
  };

  return data;
}
```

### 3.3 月报数据聚合

```javascript
async function aggregateMonthlyReportData(year, month) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  const lastMonthStart = new Date(year, month - 2, 1);
  const lastMonthEnd = new Date(year, month - 1, 0);

  const lastYearStart = new Date(year - 1, month - 1, 1);
  const lastYearEnd = new Date(year - 1, month, 0);

  const data = {
    period: { year, month, start: startDate, end: endDate },

    // 安全概况
    safetyOverview: await getMonthlySafetyOverview(startDate, endDate),
    lastMonthSafety: await getMonthlySafetyOverview(lastMonthStart, lastMonthEnd),
    lastYearSafety: await getMonthlySafetyOverview(lastYearStart, lastYearEnd),

    // 预警分析
    warningAnalysis: await getMonthlyWarningAnalysis(startDate, endDate),

    // 整改效果
    rectifyAnalysis: await getMonthlyRectifyAnalysis(startDate, endDate),

    // 考核情况
    assessmentAnalysis: await getMonthlyAssessmentAnalysis(year, month),

    // 事故分析
    accidentAnalysis: await getMonthlyAccidentAnalysis(startDate, endDate),

    // 历史趋势
    historicalTrend: await getHistoricalTrend(year, month, 12)
  };

  return data;
}
```

---

## 四、AI 报告生成流程

### 4.1 流程图

```
┌─────────────────────────────────────────────────────────────────┐
│                      报告生成请求                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      参数校验                                    │
│  - 报告类型校验                                                  │
│  - 时间范围校验                                                  │
│  - 权限校验                                                      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      数据聚合                                    │
│  - 从数据库聚合报告所需数据                                      │
│  - 构造结构化数据上下文                                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Prompt 构造                                 │
│  - 选择报告模板                                                  │
│  - 注入数据上下文                                                │
│  - 构造完整 Prompt                                               │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AI 模型调用                                 │
│  - 调用报告生成模型                                              │
│  - 获取 AI 输出                                                  │
│  - 解析结构化结果                                                │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      报告渲染                                    │
│  - 填充报告模板                                                  │
│  - 生成报告内容                                                  │
│  - 格式化输出                                                    │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      结果存储                                    │
│  - 存储报告记录                                                  │
│  - 记录生成日志                                                  │
│  - 返回报告内容                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Prompt 模板

**报告生成 Prompt 模板**

```
# 系统角色
你是一个专业的HSE安全管理报告编写专家，擅长根据数据编写规范、准确、有洞察力的安全报告。

# 报告类型
{report_type}（{report_type_desc}）

# 报告周期
起始日期：{period_start}
结束日期：{period_end}

# 数据上下文
{data_context}

# 编写要求
1. 报告内容准确、数据真实、逻辑清晰
2. 分析深入、洞察到位、建议可行
3. 语言规范、表述专业、层次分明
4. 重点突出、详略得当、结构完整

# 输出格式
请按以下结构输出报告内容（使用Markdown格式）：

## 报告摘要
[一段话概括本报告核心内容]

## 一、{section_1_title}
{section_1_content}

## 二、{section_2_title}
{section_2_content}

...

## N、AI分析建议
[基于数据的深度分析和专业建议]

请确保输出符合Markdown格式规范。
```

---

## 五、报告导出设计

### 5.1 导出格式

| 格式 | 说明 | 适用场景 |
|------|------|----------|
| HTML | 网页格式 | 在线预览、网页展示 |
| Word (.docx) | Word 文档 | 正式汇报、存档 |
| PDF | PDF 文档 | 打印、分发 |
| Markdown (.md) | Markdown 格式 | 技术文档、版本管理 |

### 5.2 导出流程

```javascript
async function exportReport(reportId, format) {
  const report = await getReport(reportId);

  switch (format) {
    case 'html':
      return generateHTML(report);
    case 'docx':
      return generateWord(report);
    case 'pdf':
      return generatePDF(report);
    case 'md':
      return generateMarkdown(report);
    default:
      throw new Error(`不支持的导出格式: ${format}`);
  }
}
```

### 5.3 Word 导出实现

```javascript
async function generateWord(report) {
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        // 标题
        new Paragraph({
          text: report.reportTitle,
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER
        }),

        // 报告信息
        new Paragraph({
          text: `报告日期：${report.reportDate}`,
          alignment: AlignmentType.RIGHT
        }),

        // 摘要
        new Paragraph({
          text: '摘要',
          heading: HeadingLevel.HEADING_1
        }),
        new Paragraph({
          text: report.summary
        }),

        // 各章节
        ...report.sections.map(section => [
          new Paragraph({
            text: section.title,
            heading: HeadingLevel.HEADING_1
          }),
          new Paragraph({
            text: section.content
          })
        ]).flat()
      ]
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  return buffer;
}
```

---

## 六、报告管理

### 6.1 报告存储

**hse_ai_report**（AI报告表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGSERIAL | 主键 |
| report_type | VARCHAR(32) | 报告类型 |
| report_date | DATE | 报告日期 |
| report_period_start | DATE | 报告周期起始 |
| report_period_end | DATE | 报告周期结束 |
| report_title | VARCHAR(256) | 报告标题 |
| report_content | TEXT | 报告内容（Markdown） |
| summary | TEXT | 摘要 |
| model_version_id | BIGINT | 模型版本ID |
| tokens_used | INTEGER | Token消耗 |
| export_formats | VARCHAR(100) | 支持的导出格式 |
| created_by | BIGINT | 创建人 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### 6.2 报告版本管理

```javascript
async function createReportVersion(reportId, changes) {
  const report = await getReport(reportId);

  // 创建新版本
  const newVersion = await pool.query(`
    INSERT INTO hse_ai_report_version (
      report_id, version, content, change_description, created_by, created_at
    ) VALUES ($1, $2, $3, $4, $5, NOW())
    RETURNING *
  `, [
    reportId,
    report.current_version + 1,
    report.report_content,
    changes.description,
    changes.userId
  ]);

  // 更新报告当前版本
  await pool.query(`
    UPDATE hse_ai_report
    SET current_version = current_version + 1, updated_at = NOW()
    WHERE id = $1
  `, [reportId]);

  return newVersion.rows[0];
}
```

---

## 七、定时任务设计

### 7.1 定时任务配置

| 任务 | Cron 表达式 | 说明 |
|------|-------------|------|
| 日报生成 | 0 8 * * * | 每天早8点自动生成 |
| 周报生成 | 0 9 * * 1 | 每周一早9点自动生成 |
| 月报生成 | 0 9 1 * * | 每月1号早9点自动生成 |

### 7.2 定时任务实现

```javascript
const cron = require('node-cron');

// 日报定时任务
cron.schedule('0 8 * * *', async () => {
  console.log('[定时任务] 开始生成日报...');
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  try {
    const report = await generateDailyReport(yesterday);
    console.log(`[定时任务] 日报生成成功: ${report.id}`);
  } catch (error) {
    console.error('[定时任务] 日报生成失败:', error);
  }
});

// 周报定时任务
cron.schedule('0 9 * * 1', async () => {
  console.log('[定时任务] 开始生成周报...');
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);

  try {
    const report = await generateWeeklyReport(startDate, endDate);
    console.log(`[定时任务] 周报生成成功: ${report.id}`);
  } catch (error) {
    console.error('[定时任务] 周报生成失败:', error);
  }
});

// 月报定时任务
cron.schedule('0 9 1 * *', async () => {
  console.log('[定时任务] 开始生成月报...');
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 上个月

  try {
    const report = await generateMonthlyReport(year, month);
    console.log(`[定时任务] 月报生成成功: ${report.id}`);
  } catch (error) {
    console.error('[定时任务] 月报生成失败:', error);
  }
});
```

---

## 八、API 设计

### 8.1 API 列表

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /ai/report/daily | 生成日报 |
| POST | /ai/report/weekly | 生成周报 |
| POST | /ai/report/monthly | 生成月报 |
| POST | /ai/report/group | 生成集团汇报 |
| GET | /ai/report/list | 历史报告列表 |
| GET | /ai/report/:id | 查询报告详情 |
| POST | /ai/report/:id/export | 导出报告 |
| PUT | /ai/report/:id | 修改报告内容 |
| DELETE | /ai/report/:id | 删除报告 |

### 8.2 API 示例

**生成日报请求**

```http
POST /api/hse/ai-assistant/ai/report/daily
Content-Type: application/json

{
  "date": "2026-07-22",
  "scope": "all",
  "generateAI": true
}
```

**生成日报响应**

```json
{
  "code": 0,
  "data": {
    "id": 1,
    "reportType": "daily",
    "reportDate": "2026-07-22",
    "reportTitle": "HSE安全日报 - 2026年7月22日",
    "summary": "今日安全指数85分，较昨日下降2分...",
    "reportContent": "# HSE安全日报...",
    "tokensUsed": 2500,
    "createdAt": "2026-07-23T08:00:00Z"
  }
}
```

---

## 九、版本历史

| 版本 | 日期 | 修订人 | 修订说明 |
|------|------|--------|----------|
| v1.0 | 2026-07 | HSE 团队 | AI报告生成设计初始版本 |
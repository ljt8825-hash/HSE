# 项目公司HSE自动报告中心设计方案

## 文档信息

| 项目 | 内容 |
|------|------|
| 所属Sprint | Sprint10-B 项目公司智能决策与知识增强中心建设 |
| 版本 | v1.0 |
| 日期 | 2026-07-23 |
| 系统定位 | 项目公司HSE智能运营管理系统（项目公司为主体） |

---

## 一、建设目标

建设项目公司HSE自动报告中心，实现HSE日报、HSE周报、项目公司HSE月度运营报告的自动生成，减少人工统计工作量，提升报告质量和时效性。

所有报告必须基于**项目公司真实业务数据**生成。

---

## 二、报告类型

### 2.1 HSE日报

| 项目 | 说明 |
|------|------|
| 生成频率 | 每日 |
| 生成时间 | 每日08:00自动触发 |
| 报告周期 | 前一日 |
| 目标读者 | 项目公司管理员、安全管理人员 |

#### 日报内容

| 章节 | 内容 | 数据来源 |
|------|------|----------|
| 一、风险变化 | 当日风险分变化、新增高风险人员、风险等级变化 | hse_employee |
| 二、新增预警 | 当日新增预警数量、预警类型分布、预警级别 | hse_warning_record |
| 三、整改情况 | 当日整改完成情况、新增整改任务、逾期预警 | hse_rectification_task |
| 四、三检情况 | 当日三检完成率、异常发现、未检查网格 | hse_inspection_record |
| 五、事故情况 | 当日事故记录（如有） | hse_accident |
| 六、重点提醒 | 需重点关注的事项（AI生成） | AI分析 |

### 2.2 HSE周报

| 项目 | 说明 |
|------|------|
| 生成频率 | 每周 |
| 生成时间 | 每周一08:00自动触发 |
| 报告周期 | 上周（周一至周日） |
| 目标读者 | 项目公司管理员、作业中心负责人、安全管理人员 |

#### 周报内容

| 章节 | 内容 | 数据来源 |
|------|------|----------|
| 一、本周重点风险 | 本周风险变化总结、TOP3风险区域、TOP5风险人员 | hse_employee + AI分析 |
| 二、区域排名 | 各作业中心风险排名、片区风险排名 | hse_employee按组织聚合 |
| 三、问题趋势 | 本周问题变化趋势、环比/同比对比 | 多表聚合 |
| 四、整改分析 | 本周整改完成率、逾期分析、整改效率 | hse_rectification_task |
| 五、预警分析 | 本周预警触发/处理/关闭统计 | hse_warning_record |
| 六、三检分析 | 本周三检完成率、异常分析 | hse_inspection_record |
| 七、下周重点 | 下周需重点关注的事项（AI生成） | AI分析 |

### 2.3 项目公司HSE月度运营报告

| 项目 | 说明 |
|------|------|
| 生成频率 | 每月 |
| 生成时间 | 每月1日08:00自动触发 |
| 报告周期 | 上月 |
| 目标读者 | 项目公司管理员、上级检查人员 |

#### 月报内容

| 章节 | 内容 | 数据来源 |
|------|------|----------|
| 一、总体运行情况 | 项目公司HSE整体运行概况、关键指标总览 | 多表聚合 |
| 二、风险分析 | 月度风险趋势、风险分布、变化原因分析 | hse_employee + AI分析 |
| 三、事故分析 | 月度事故统计、事故类型分布、原因分析 | hse_accident |
| 四、培训分析 | 月度培训完成情况、持证情况、培训效果 | hse_training_record |
| 五、考核分析 | 月度考核结果、排名、优秀/不合格人员 | hse_assessment_record |
| 六、整改分析 | 月度整改完成率、逾期分析、整改效率趋势 | hse_rectification_task |
| 七、三检分析 | 月度三检完成率、合格率、异常分析 | hse_inspection_record |
| 八、管理建议 | 基于数据分析的管理建议（AI生成） | AI分析 |

---

## 三、报告生成流程

### 3.1 生成流程

```
定时触发（cron）
  ↓
数据采集
  ├── 风险数据 → hse_employee
  ├── 预警数据 → hse_warning_record
  ├── 整改数据 → hse_rectification_task
  ├── 三检数据 → hse_inspection_record
  ├── 事故数据 → hse_accident
  ├── 培训数据 → hse_training_record
  └── 考核数据 → hse_assessment_record
  ↓
数据汇总与计算
  ↓
AI分析（生成摘要、原因分析、管理建议）
  ↓
报告模板填充
  ↓
报告生成（Markdown/HTML）
  ↓
报告存储（hse_auto_report表）
  ↓
审核流程
  ├── 日报：自动审核
  ├── 周报：安全管理人员审核
  └── 月报：项目公司管理员审核
  ↓
发布（通知相关人员）
```

### 3.2 审核流程

| 报告类型 | 审核方式 | 审核人 | 审核时限 |
|----------|----------|--------|----------|
| 日报 | 自动审核 | 系统 | 即时 |
| 周报 | 人工审核 | 安全管理人员 | 2小时 |
| 月报 | 人工审核 | 项目公司管理员 | 4小时 |

### 3.3 审核状态

```
draft → reviewing → approved → published
  ↑         ↓
  └── rejected（退回修改）
```

---

## 四、报告模板设计

### 4.1 HSE日报模板

```markdown
# 项目公司HSE风险日报

报告日期：{report_date}
生成时间：{generated_at}

---

## 一、风险变化

- 项目公司综合风险分：{avg_risk_score}（较昨日{change_direction}{change_value}）
- 极高风险人员：{critical_count}人（较昨日{critical_change}）
- 高风险人员：{high_count}人（较昨日{high_change}）

## 二、新增预警

- 今日新增预警：{new_warning_count}条
  - 员工风险预警：{wr_emp_count}条
  - 驾驶员风险预警：{wr_drv_count}条
  - 事故预警：{wr_acc_count}条
  - 组织评分预警：{wr_asm_count}条
  - 网格管理预警：{wr_mgt_count}条

## 三、整改情况

- 今日完成整改：{closed_rect_count}项
- 新增整改任务：{new_rect_count}项
- 即将逾期（3天内）：{near_overdue_count}项
- 已逾期：{overdue_count}项

## 四、三检情况

- 今日三检完成率：{inspection_completion_rate}%
- 发现异常：{abnormal_count}项
- 未检查网格：{unchecked_grid_count}个

## 五、事故情况

- 今日事故：{accident_count}起（{accident_detail}）

## 六、重点提醒

{ai_generated_reminders}

---
数据来源：项目公司HSE智能运营管理系统
```

### 4.2 HSE周报模板

```markdown
# 项目公司HSE运营周报

报告周期：{period_start} ~ {period_end}
生成时间：{generated_at}

---

## 一、本周重点风险

{ai_risk_summary}

### TOP3风险区域
1. {top1_area}：风险分{top1_score}
2. {top2_area}：风险分{top2_score}
3. {top3_area}：风险分{top3_score}

### TOP5风险人员
1. {person1}：{org1}，风险分{score1}
2. {person2}：{org2}，风险分{score2}
...

## 二、区域排名

{area_ranking_table}

## 三、问题趋势

{ai_trend_analysis}

## 四、整改分析

- 本周完成整改：{weekly_closed}项
- 整改完成率：{rect_completion_rate}%
- 新增逾期：{new_overdue}项
- 平均整改周期：{avg_rect_days}天

## 五、预警分析

- 本周触发：{weekly_triggered}条
- 本周处理：{weekly_processed}条
- 本周关闭：{weekly_closed_warn}条
- 待处理：{pending_warnings}条

## 六、三检分析

- 本周完成率：{weekly_inspection_rate}%
- 合格率：{weekly_pass_rate}%
- 发现异常：{weekly_abnormal}项

## 七、下周重点

{ai_next_week_focus}

---
数据来源：项目公司HSE智能运营管理系统
```

### 4.3 月度运营报告模板

```markdown
# 项目公司HSE月度运营报告

报告月份：{report_month}
生成时间：{generated_at}

---

## 一、总体运行情况

{ai_overall_summary}

### 关键指标总览

| 指标 | 本月值 | 上月值 | 变化 | 目标 |
|------|--------|--------|------|------|
| 综合风险指数 | {risk_index} | {last_risk_index} | {change} | ≤65 |
| 整改完成率 | {rect_rate}% | {last_rect_rate}% | {change} | ≥90% |
| 三检完成率 | {insp_rate}% | {last_insp_rate}% | {change} | ≥95% |
| 事故数 | {accident_count} | {last_accident_count} | {change} | 0 |
| 培训完成率 | {train_rate}% | {last_train_rate}% | {change} | ≥100% |

## 二、风险分析

{ai_risk_analysis}

### 风险趋势
{risk_trend_chart}

### 风险分布
{risk_distribution_chart}

## 三、事故分析

{ai_accident_analysis}

## 四、培训分析

{ai_training_analysis}

## 五、考核分析

{ai_assessment_analysis}

## 六、整改分析

{ai_rectification_analysis}

## 七、三检分析

{ai_inspection_analysis}

## 八、管理建议

{ai_management_suggestions}

---
数据来源：项目公司HSE智能运营管理系统
```

---

## 五、数据库设计

```sql
CREATE TABLE hse_auto_report (
    report_id       BIGSERIAL PRIMARY KEY,
    report_type     VARCHAR(20) NOT NULL CHECK (report_type IN ('daily', 'weekly', 'monthly')),
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,
    title           VARCHAR(500) NOT NULL,
    content         TEXT,
    -- 报告内容（Markdown格式）
    content_html    TEXT,
    -- HTML格式（用于展示）
    status          VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'reviewing', 'approved', 'published', 'rejected')),
    reviewer_id     VARCHAR(50),
    review_comment  TEXT,
    reviewed_at     TIMESTAMP,
    published_at    TIMESTAMP,
    generated_by    VARCHAR(50) DEFAULT 'system',
    -- system=系统自动, manual=人工触发
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 六、AI分析内容

### 6.1 AI生成内容

| 报告类型 | AI生成内容 |
|----------|------------|
| 日报 | 重点提醒、风险变化原因简析 |
| 周报 | 风险摘要、趋势分析、下周重点 |
| 月报 | 总体概况、深度分析、管理建议 |

### 6.2 AI Prompt模板（月报管理建议）

```
你是项目公司HSE管理顾问。请基于以下月度数据生成管理建议。

【月度数据】
- 综合风险指数: {risk_index}（上月{last_risk_index}）
- 极高风险人员: {critical_count}人
- 高风险人员: {high_count}人
- 整改完成率: {rect_rate}%
- 整改逾期率: {overdue_rate}%
- 三检完成率: {insp_rate}%
- 三检合格率: {pass_rate}%
- 事故数: {accident_count}起
- 培训完成率: {train_rate}%
- 考核合格率: {assess_rate}%

【TOP3问题区域】
{top3_areas}

【生成要求】
1. 分析本月HSE管理的亮点和不足
2. 针对TOP3问题区域提出具体改进建议
3. 给出下月HSE管理重点工作建议
4. 建议不超过5条，每条建议具体可行
5. 必须基于真实数据，禁止编造
```

---

## 七、定时任务配置

```javascript
// node-cron 定时任务
const cron = require('node-cron');

// 日报：每日08:00
cron.schedule('0 8 * * *', () => {
    generateReport('daily');
});

// 周报：每周一08:00
cron.schedule('0 8 * * 1', () => {
    generateReport('weekly');
});

// 月报：每月1日08:00
cron.schedule('0 8 1 * *', () => {
    generateReport('monthly');
});
```

---

## 八、API设计

| 接口 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 生成报告 | POST | /api/hse/report/generate | 手动触发报告生成 |
| 报告列表 | GET | /api/hse/report/list | 按类型/时间筛选 |
| 报告详情 | GET | /api/hse/report/:id | 获取报告内容 |
| 审核报告 | POST | /api/hse/report/:id/review | 审核报告 |
| 发布报告 | POST | /api/hse/report/:id/publish | 发布报告 |
| 导出报告 | GET | /api/hse/report/:id/export | 导出PDF/Word |
| 删除报告 | DELETE | /api/hse/report/:id | 删除报告 |

---

## 九、约束

| 约束 | 说明 |
|------|------|
| 基于真实数据 | 所有报告数据必须来自项目公司真实业务数据 |
| AI不编造 | AI生成的分析内容必须基于真实数据，禁止编造 |
| 审核机制 | 周报/月报必须经审核后方可发布 |
| 上级只读 | 上级检查人员可查看月报，不可修改 |
| 数据来源标注 | 报告底部标注数据来源系统 |

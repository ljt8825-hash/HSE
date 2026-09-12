# Sprint8-B AI辅助决策中心设计报告

> 文档版本：v1.0
> 生成日期：2026 年 7 月
> 所属阶段：HSE Dashboard Sprint8-B
> 关联文档：
> - 《Sprint8-A最终冻结报告》
> - 《HSE AI分析模型设计》
> - 《AI报告生成设计》
> - 《Sprint8-B验收报告》

---

## 一、项目概述

### 1.1 建设背景

Sprint8-A 完成智能分析中心建设后，HSE 管理平台已具备风险趋势分析、事故趋势分析、整改效果分析、组织风险画像和风险预测五大分析能力。但在实际应用中，用户仍面临以下痛点：

1. **分析结果解读难**：趋势图、预测结果需要专业解读才能转化为管理决策
2. **事故原因定位难**：事故发生后缺乏快速的原因分析和整改建议生成
3. **报告编写耗时**：日报、周报、月报、集团汇报材料需人工整理，效率低
4. **预测结果解释难**：预测模型输出的风险升高缺乏直观的原因说明

本次 Sprint8-B 将引入 AI 辅助决策能力，解决上述痛点。

### 1.2 建设目标

```
HSE数据 → AI辅助决策中心 → 管理决策
    ↓              ↓              ↓
 风险分析      事故分析      整改建议
                  ↓
              报告生成
                  ↓
              预测解释
```

**五大核心目标**：

| 序号 | 目标 | 说明 |
|------|------|------|
| 1 | AI风险分析助手 | 组织/人员/事故风险智能分析报告 |
| 2 | AI事故分析助手 | 事故原因分析、管理缺陷识别、整改建议 |
| 3 | AI整改建议助手 | 风险问题整改措施智能生成 |
| 4 | AI管理报告生成 | 日报/周报/月报/集团汇报材料自动生成 |
| 5 | 预测结果解释 | 预测风险升高的原因智能解释 |

### 1.3 设计范围

| 范围 | 包含 | 不包含 |
|------|------|--------|
| AI 能力 | 风险分析、事故分析、整改建议、报告生成、预测解释 | AI 模型训练优化 |
| 模型管理 | AI 模型版本管理、预测效果评价 | 基础风险模型修改 |
| 数据来源 | 读取已有 HSE 数据表 | 修改源数据表 |
| 权限控制 | admin / safety_manager 全局权限 | 越权访问 |

---

## 二、版本基线

### 2.1 当前冻结基线

| 冻结项 | 版本 | 说明 |
|--------|------|------|
| 员工风险模型 | Sprint6.1 冻结版 | 风险评分公式、岗位风险权重、扣分规则 |
| 驾驶风险模型 | Sprint6.5 冻结版 | 驾驶风险评分公式（5 年滚动周期） |
| 考核模型 | v1.1 | 考核维度、指标权重、红黄牌判定规则 |
| 预警规则 | v1.1 | 预警规则字典、升级机制、超时处理 |
| 预警中心 | v1.0 | Sprint7-B 交付 |
| 整改闭环 | v1.0 | Sprint7-C 交付 |
| 预测模型 | v1.0 | Sprint8-A 冻结版 |
| 预测预警联动 | v1.0 | Sprint8-A-1 交付 |

> ⚠️ 上述基线在本 Sprint 内一律视为只读，AI 辅助决策中心仅读取其数据，不允许回写或二次计算。

### 2.2 版本规划

| 模块 | 版本 | 说明 |
|------|------|------|
| 智能分析中心 | v1.0 | Sprint8-A 交付，保持不变 |
| AI辅助决策中心 | v1.0 | Sprint8-B 新增 |
| AI分析模型 | v1.0 | Sprint8-B 新增 |

---

## 三、系统架构

### 3.1 架构定位

```
┌─────────────────────────────────────────────────────────────────────┐
│                      HSE 前端 (Vben)                                  │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │             ai-assistant.ts (AI能力API层)                        │ │
│  │  ┌───────────────────────────────────────────────────────────┐   │ │
│  │  │  风险分析 | 事故分析 | 整改建议 | 报告生成 | 预测解释    │   │ │
│  │  └───────────────────────────────────────────────────────────┘   │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ /api/hse/ai-assistant
┌──────────────────────────────▼──────────────────────────────────────┐
│                    HSE 后端 (Express)                                 │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │           hse-ai-assistant.js (AI辅助决策路由)                   │ │
│  │  ┌─────────────────────────────────────────────────────────┐    │ │
│  │  │   AI分析引擎（Prompt构造 + 结果解析）                   │    │ │
│  │  │  - constructRiskAnalysisPrompt()                        │    │ │
│  │  │  - constructAccidentAnalysisPrompt()                   │    │ │
│  │  │  - constructRectifySuggestionPrompt()                  │    │ │
│  │  │  - constructReportPrompt()                             │    │ │
│  │  │  - constructPredictionExplainPrompt()                  │    │ │
│  │  └─────────────────────────────────────────────────────────┘    │ │
│  │  ┌─────────────────────────────────────────────────────────┐    │ │
│  │  │   数据聚合层（读取已有数据）                            │    │ │
│  │  │  - aggregateRiskData()                                 │    │ │
│  │  │  - aggregateAccidentData()                             │    │ │
│  │  │  - aggregatePredictionData()                           │    │ │
│  │  │  - aggregateReportData()                               │    │ │
│  │  └─────────────────────────────────────────────────────────┘    │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ 读取
┌──────────────────────────────▼──────────────────────────────────────┐
│                   HSE 数据库 (PostgreSQL)                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │employee_risk │  │driver_risk   │  │  hse_risk_prediction     │   │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │ accident     │  │ assessment   │  │  hse_warning_record      │   │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │rectification │  │员工/组织表   │  │  hse_ai_analysis_record  │   │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘   │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │              hse_ai_model_version (AI模型版本管理)              │  │
│  └────────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │           hse_prediction_evaluation (预测效果评价)              │  │
│  └────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 数据流向

```
┌─────────────────────────────────────────────────────────────────┐
│                      数据源层（只读）                             │
│  employee_risk | driver_risk | accident | assessment |         │
│  warning | rectification | hse_risk_prediction                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │ 聚合查询
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      数据聚合层                                  │
│  - 按分析目标聚合历史数据                                        │
│  - 构造结构化分析上下文                                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Prompt构造
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AI分析引擎                                  │
│  - Prompt模板管理                                                │
│  - 上下文注入                                                    │
│  - 结果解析与结构化                                              │
└──────────────────────────┬──────────────────────────────────────┘
                           │ AI推理（LLM API）
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      结果输出层                                  │
│  - 分析报告文本                                                  │
│  - 结构化建议列表                                                │
│  - 评分与置信度                                                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ 存储/展示
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      应用层                                      │
│  - hse_ai_analysis_record 存储                                   │
│  - 前端展示                                                      │
│  - 报告导出                                                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 四、模块设计

### 4.1 模块一：AI风险分析助手

#### 4.1.1 功能概述

| 功能 | 说明 |
|------|------|
| 分析对象 | 组织（部门/中心/片区）、人员（员工）、事故 |
| 输入 | 目标类型 + 目标ID + 分析范围（时间、维度） |
| 输出 | 风险分析报告（风险概况、趋势分析、关键因子、改进建议） |

#### 4.1.2 分析维度

| 维度 | 数据来源 | 说明 |
|------|----------|------|
| 风险评分趋势 | employee_risk / driver_risk | 近 12 个月风险评分变化 |
| 考核表现 | assessment | 近 12 个月考核结果 |
| 事故记录 | accident | 历史事故数量、类型、等级 |
| 预警记录 | hse_warning_record | 预警类型、频次、处置情况 |
| 整改记录 | rectification | 整改项目、周期、效果 |

#### 4.1.3 输出结构

```json
{
  "analysisId": 1,
  "targetType": "employee",
  "targetId": 501,
  "targetName": "张三",
  "reportTitle": "员工张三风险分析报告",
  "summary": "总体风险评价：中等风险，呈上升趋势...",
  "sections": [
    {
      "title": "风险概况",
      "content": "当前风险评分 72.5 分，等级为 major..."
    },
    {
      "title": "趋势分析",
      "content": "近 12 个月风险评分呈现上升趋势..."
    },
    {
      "title": "关键风险因子",
      "factors": [
        { "factor": "事故频发", "impact": 0.35, "description": "近3月发生2起事故" },
        { "factor": "考核扣分", "impact": 0.22, "description": "最近考核扣5分" }
      ]
    },
    {
      "title": "改进建议",
      "suggestions": [
        { "priority": "high", "suggestion": "加强安全培训..." },
        { "priority": "medium", "suggestion": "完善作业流程..." }
      ]
    }
  ],
  "confidence": 0.85,
  "generatedAt": "2026-07-23T10:00:00Z"
}
```

#### 4.1.4 API 设计

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /ai/risk-analysis | 执行风险分析 |
| GET | /ai/risk-analysis/:id | 查询分析结果 |
| GET | /ai/risk-analysis/list | 历史分析列表 |
| POST | /ai/risk-analysis/:id/export | 导出分析报告 |

---

### 4.2 模块二：AI事故分析助手

#### 4.2.1 功能概述

| 功能 | 说明 |
|------|------|
| 分析输入 | 事故 ID 或事故基本信息 |
| 输出 | 可能原因、管理缺陷、整改建议 |

#### 4.2.2 分析维度

| 维度 | 数据来源 | 说明 |
|------|----------|------|
| 事故基本信息 | accident | 时间、地点、类型、等级、描述 |
| 当事人信息 | employee_risk | 风险评分、历史事故 |
| 环境因素 | accident.environment | 天气、路况等 |
| 历史同类事故 | accident（历史） | 同类型事故统计 |

#### 4.2.3 输出结构

```json
{
  "analysisId": 2,
  "accidentId": 1001,
  "accidentCode": "ACC-20260715-0001",
  "accidentType": "交通事故",
  "accidentLevel": "一般事故",
  "reportTitle": "事故ACC-20260715-0001分析报告",
  "summary": "本次事故为一般交通事故，主要原因...",
  "sections": [
    {
      "title": "事故概况",
      "content": "2026年7月15日，张三驾驶车辆..."
    },
    {
      "title": "可能原因分析",
      "causes": [
        { "type": "人为因素", "probability": 0.6, "description": "驾驶员操作不当..." },
        { "type": "管理因素", "probability": 0.3, "description": "安全培训不足..." },
        { "type": "环境因素", "probability": 0.1, "description": "雨天路滑..." }
      ]
    },
    {
      "title": "管理缺陷识别",
      "defects": [
        { "area": "培训管理", "defect": "新员工安全培训周期不足..." },
        { "area": "过程监控", "defect": "缺乏行车过程实时监控..." }
      ]
    },
    {
      "title": "整改建议",
      "suggestions": [
        { "priority": "high", "suggestion": "对当事人进行安全再培训..." },
        { "priority": "medium", "suggestion": "加强车辆日常检查..." },
        { "priority": "low", "suggestion": "完善行车安全制度..." }
      ]
    }
  ],
  "confidence": 0.80,
  "generatedAt": "2026-07-23T10:30:00Z"
}
```

#### 4.2.4 API 设计

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /ai/accident-analysis | 执行事故分析 |
| GET | /ai/accident-analysis/:id | 查询分析结果 |
| GET | /ai/accident-analysis/list | 历史分析列表 |
| POST | /ai/accident-analysis/:id/export | 导出分析报告 |

---

### 4.3 模块三：AI整改建议助手

#### 4.3.1 功能概述

| 功能 | 说明 |
|------|------|
| 分析输入 | 风险问题描述、预警记录、预测结果 |
| 输出 | 整改措施建议列表 |

#### 4.3.2 输入结构

```json
{
  "sourceType": "warning",
  "sourceId": 100,
  "riskDescription": "员工张三近期风险评分持续上升，已达到72.5分...",
  "riskLevel": "major",
  "context": {
    "employeeId": 501,
    "employeeName": "张三",
    "department": "运营一部",
    "riskFactors": ["事故频发", "考核扣分"]
  }
}
```

#### 4.3.3 输出结构

```json
{
  "analysisId": 3,
  "sourceType": "warning",
  "sourceId": 100,
  "reportTitle": "整改建议报告",
  "summary": "针对员工张三风险上升问题，建议采取以下整改措施...",
  "suggestions": [
    {
      "sequence": 1,
      "priority": "high",
      "category": "培训教育",
      "suggestion": "安排安全再培训课程",
      "description": "针对近期事故频发情况，建议对张三进行为期3天的安全操作再培训...",
      "expectedEffect": "提升安全意识，降低操作风险",
      "responsible": "安全部门",
      "deadline": "建议在7天内完成"
    },
    {
      "sequence": 2,
      "priority": "high",
      "category": "过程管控",
      "suggestion": "加强作业过程监控",
      "description": "建议对张三的作业过程进行实时监控...",
      "expectedEffect": "及时发现并纠正不安全行为",
      "responsible": "部门主管",
      "deadline": "建议立即实施"
    },
    {
      "sequence": 3,
      "priority": "medium",
      "category": "考核激励",
      "suggestion": "调整绩效考核方案",
      "description": "将安全绩效纳入个人考核...",
      "expectedEffect": "增强安全责任意识",
      "responsible": "人事部门",
      "deadline": "建议在30天内完成"
    }
  ],
  "confidence": 0.82,
  "generatedAt": "2026-07-23T11:00:00Z"
}
```

#### 4.3.4 API 设计

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /ai/rectify-suggestion | 生成整改建议 |
| GET | /ai/rectify-suggestion/:id | 查询建议结果 |
| GET | /ai/rectify-suggestion/list | 历史建议列表 |
| POST | /ai/rectify-suggestion/:id/create-task | 从建议创建整改任务 |

---

### 4.4 模块四：AI管理报告生成

#### 4.4.1 功能概述

| 报告类型 | 说明 | 生成周期 |
|----------|------|----------|
| 日报 | 当日安全动态、预警汇总、整改进展 | 每日 |
| 周报 | 本周安全态势、重点问题、下周计划 | 每周 |
| 月报 | 本月安全分析、考核情况、管理建议 | 每月 |
| 集团汇报 | 安全工作总结、重点事项、资源需求 | 按需 |

#### 4.4.2 报告内容框架

**日报框架**：

```
一、今日安全概况
    1. 安全状态评分
    2. 预警数量统计
    3. 整改进度汇总

二、今日预警动态
    1. 新增预警
    2. 预警处置情况
    3. 突出问题

三、今日整改进展
    1. 完成整改
    2. 进行中整改
    3. 超时预警

四、明日重点关注
```

**周报框架**：

```
一、本周安全态势
    1. 安全指数变化趋势
    2. 预警统计分析
    3. 整改效率分析

二、重点问题分析
    1. 重大预警处理情况
    2. 重复问题分析
    3. 典型案例

三、下周工作计划
    1. 重点整改任务
    2. 预警预防措施
    3. 安全活动安排
```

**月报框架**：

```
一、月度安全概况
    1. 安全指数评分
    2. 风险分布分析
    3. 趋势变化分析

二、预警分析
    1. 预警类型分布
    2. 预警处置效率
    3. 预警升级情况

三、整改效果分析
    1. 整改完成率
    2. 整改周期分析
    3. 重复风险率

四、考核情况分析
    1. 考核指标完成度
    2. 红黄牌情况
    3. 扣分项分析

五、管理建议
```

#### 4.4.3 API 设计

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /ai/report/daily | 生成日报 |
| POST | /ai/report/weekly | 生成周报 |
| POST | /ai/report/monthly | 生成月报 |
| POST | /ai/report/group | 生成集团汇报材料 |
| GET | /ai/report/list | 历史报告列表 |
| GET | /ai/report/:id | 查询报告详情 |
| POST | /ai/report/:id/export | 导出报告 |

---

### 4.5 模块五：预测结果解释

#### 4.5.1 功能概述

| 功能 | 说明 |
|------|------|
| 分析输入 | 预测记录 ID |
| 输出 | 风险升高的原因解释、关键因子、应对建议 |

#### 4.5.2 输出结构

```json
{
  "analysisId": 5,
  "predictionId": 100,
  "targetType": "employee",
  "targetId": 501,
  "targetName": "张三",
  "predictedScore": 78.5,
  "predictedLevel": "major",
  "predictedTrend": "up",
  "confidence": 0.85,
  "explanation": {
    "summary": "预测张三未来3个月风险评分将上升至78.5分，达到major等级...",
    "keyFactors": [
      {
        "factor": "历史事故频发",
        "contribution": 0.35,
        "explanation": "近3个月发生2起事故，高于平均水平，是风险上升的主要驱动因素"
      },
      {
        "factor": "考核扣分趋势",
        "contribution": 0.25,
        "explanation": "最近考核扣分呈上升趋势，反映安全意识有所下降"
      },
      {
        "factor": "预警频次增加",
        "contribution": 0.20,
        "explanation": "近1个月触发3次预警，预警频率上升"
      }
    ],
    "trendAnalysis": "风险评分从6月的65分上升至7月的72分，预测8月将达到78分...",
    "riskAreas": ["安全操作", "驾驶行为", "作业规范"],
    "recommendations": [
      {
        "priority": "high",
        "action": "安排安全再培训",
        "expectedImpact": "可降低风险评分约10分"
      },
      {
        "priority": "medium",
        "action": "加强作业监控",
        "expectedImpact": "可预防潜在事故"
      }
    ]
  },
  "generatedAt": "2026-07-23T12:00:00Z"
}
```

#### 4.5.3 API 设计

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /ai/prediction-explain/:predictionId | 执行预测解释 |
| GET | /ai/prediction-explain/:id | 查询解释结果 |
| GET | /ai/prediction-explain/list | 历史解释列表 |

---

## 五、预测效果评价模块

### 5.1 模块概述

预测效果评价模块用于评估 Sprint8-A 风险预测模型的准确性，为模型优化提供数据支撑。

### 5.2 评价指标

| 指标 | 全称 | 计算公式 | 说明 |
|------|------|----------|------|
| MAE | 平均绝对误差 | MAE = 1/n × Σ\|预测值 - 实际值\| | 预测偏差的平均水平 |
| RMSE | 均方根误差 | RMSE = √(1/n × Σ(预测值 - 实际值)²) | 预测误差的离散程度 |
| 命中率 | 命中率 | 命中数 / 总预测数 × 100% | 预测趋势正确的比例 |
| 预测偏差 | 预测偏差 | 平均(预测值 - 实际值) | 系统性高估或低估 |

### 5.3 评价维度

| 维度 | 说明 |
|------|------|
| 总体评价 | 全局预测准确率 |
| 按目标类型 | 员工/组织/驾驶预测准确率 |
| 按预测周期 | 1月/3月/6月预测准确率 |
| 按风险等级 | critical/major/minor 预测准确率 |
| 时间趋势 | 月度预测准确率变化 |

### 5.4 数据表设计

**hse_prediction_evaluation**（预测效果评价表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGSERIAL | 主键 |
| evaluation_date | DATE | 评价日期 |
| period_start | DATE | 评价周期起始 |
| period_end | DATE | 评价周期结束 |
| total_predictions | INTEGER | 预测总数 |
| evaluated_predictions | INTEGER | 已评价预测数 |
| mae | NUMERIC(10,4) | 平均绝对误差 |
| rmse | NUMERIC(10,4) | 均方根误差 |
| hit_rate | NUMERIC(5,2) | 命中率（%） |
| bias | NUMERIC(10,4) | 预测偏差 |
| by_target_type | JSONB | 按目标类型统计 |
| by_level | JSONB | 按风险等级统计 |
| by_cycle | JSONB | 按预测周期统计 |
| created_at | TIMESTAMP | 创建时间 |

### 5.5 API 设计

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /prediction-evaluation | 执行预测评价 |
| GET | /prediction-evaluation/list | 评价结果列表 |
| GET | /prediction-evaluation/stats | 评价统计概览 |
| GET | /prediction-evaluation/trend | 评价趋势分析 |

---

## 六、AI模型版本管理

### 6.1 模块概述

AI 模型版本管理用于管理 AI 分析模型的版本、配置和状态，与预测模型版本管理类似。

### 6.2 数据表设计

**hse_ai_model_version**（AI模型版本表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGSERIAL | 主键 |
| model_code | VARCHAR(64) | 模型编码 |
| model_type | VARCHAR(32) | 模型类型（risk_analysis/accident_analysis/rectify_suggestion/report_generation/prediction_explain） |
| version | VARCHAR(32) | 版本号 |
| provider | VARCHAR(32) | AI提供商（openai/azure/custom） |
| model_name | VARCHAR(128) | 模型名称 |
| parameters | JSONB | 模型参数 |
| prompt_template | TEXT | Prompt模板 |
| max_tokens | INTEGER | 最大输出长度 |
| temperature | NUMERIC(3,2) | 温度参数 |
| status | VARCHAR(20) | 状态（active/inactive/deprecated） |
| is_frozen | BOOLEAN | 是否已冻结 |
| performance_metrics | JSONB | 性能指标 |
| change_log | TEXT | 变更说明 |
| created_by | BIGINT | 创建人 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |
| is_deleted | BOOLEAN | 软删除标记 |

### 6.3 API 设计

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /ai-models | AI模型列表 |
| GET | /ai-models/:id | 模型详情 |
| GET | /ai-models/active/:model_type | 获取当前生效模型 |
| POST | /ai-models | 创建模型版本 |
| PUT | /ai-models/:id | 更新模型版本 |
| PUT | /ai-models/:id/freeze | 冻结模型版本 |
| DELETE | /ai-models/:id | 删除模型版本 |

---

## 七、数据表设计

### 7.1 新增数据表

| 表名 | 说明 |
|------|------|
| hse_ai_analysis_record | AI分析记录表 |
| hse_ai_model_version | AI模型版本表 |
| hse_prediction_evaluation | 预测效果评价表 |
| hse_ai_report | AI生成报告表 |

### 7.2 hse_ai_analysis_record 表结构

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGSERIAL | 主键 |
| analysis_type | VARCHAR(32) | 分析类型（risk_analysis/accident_analysis/rectify_suggestion/prediction_explain） |
| source_type | VARCHAR(32) | 来源类型 |
| source_id | BIGINT | 来源ID |
| target_type | VARCHAR(32) | 目标类型 |
| target_id | BIGINT | 目标ID |
| target_name | VARCHAR(128) | 目标名称 |
| input_data | JSONB | 输入数据 |
| output_data | JSONB | 输出数据 |
| report_title | VARCHAR(256) | 报告标题 |
| report_content | TEXT | 报告内容 |
| confidence | NUMERIC(5,2) | 置信度（%） |
| model_version_id | BIGINT | 使用的模型版本ID |
| tokens_used | INTEGER | 消耗的Token数 |
| processing_time_ms | INTEGER | 处理耗时（毫秒） |
| status | VARCHAR(20) | 状态（processing/completed/failed） |
| error_message | TEXT | 错误信息 |
| created_by | BIGINT | 创建人 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### 7.3 hse_ai_report 表结构

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGSERIAL | 主键 |
| report_type | VARCHAR(32) | 报告类型（daily/weekly/monthly/group） |
| report_date | DATE | 报告日期 |
| report_period_start | DATE | 报告周期起始 |
| report_period_end | DATE | 报告周期结束 |
| report_title | VARCHAR(256) | 报告标题 |
| report_content | TEXT | 报告内容 |
| summary | TEXT | 摘要 |
| model_version_id | BIGINT | 使用的模型版本ID |
| tokens_used | INTEGER | 消耗的Token数 |
| export_format | VARCHAR(20) | 导出格式 |
| export_url | VARCHAR(512) | 导出文件URL |
| created_by | BIGINT | 创建人 |
| created_at | TIMESTAMP | 创建时间 |

---

## 八、API 总览

### 8.1 API 列表

| 模块 | 方法 | 路径 | 说明 |
|------|------|------|------|
| AI风险分析 | POST | /ai/risk-analysis | 执行风险分析 |
| AI风险分析 | GET | /ai/risk-analysis/:id | 查询分析结果 |
| AI风险分析 | GET | /ai/risk-analysis/list | 历史分析列表 |
| AI风险分析 | POST | /ai/risk-analysis/:id/export | 导出分析报告 |
| AI事故分析 | POST | /ai/accident-analysis | 执行事故分析 |
| AI事故分析 | GET | /ai/accident-analysis/:id | 查询分析结果 |
| AI事故分析 | GET | /ai/accident-analysis/list | 历史分析列表 |
| AI事故分析 | POST | /ai/accident-analysis/:id/export | 导出分析报告 |
| AI整改建议 | POST | /ai/rectify-suggestion | 生成整改建议 |
| AI整改建议 | GET | /ai/rectify-suggestion/:id | 查询建议结果 |
| AI整改建议 | GET | /ai/rectify-suggestion/list | 历史建议列表 |
| AI整改建议 | POST | /ai/rectify-suggestion/:id/create-task | 创建整改任务 |
| AI报告生成 | POST | /ai/report/daily | 生成日报 |
| AI报告生成 | POST | /ai/report/weekly | 生成周报 |
| AI报告生成 | POST | /ai/report/monthly | 生成月报 |
| AI报告生成 | POST | /ai/report/group | 生成集团汇报 |
| AI报告生成 | GET | /ai/report/list | 历史报告列表 |
| AI报告生成 | GET | /ai/report/:id | 查询报告详情 |
| AI报告生成 | POST | /ai/report/:id/export | 导出报告 |
| 预测解释 | POST | /ai/prediction-explain/:predictionId | 执行预测解释 |
| 预测解释 | GET | /ai/prediction-explain/:id | 查询解释结果 |
| 预测解释 | GET | /ai/prediction-explain/list | 历史解释列表 |
| 预测评价 | POST | /prediction-evaluation | 执行预测评价 |
| 预测评价 | GET | /prediction-evaluation/list | 评价结果列表 |
| 预测评价 | GET | /prediction-evaluation/stats | 评价统计概览 |
| 预测评价 | GET | /prediction-evaluation/trend | 评价趋势分析 |
| AI模型管理 | GET | /ai-models | AI模型列表 |
| AI模型管理 | GET | /ai-models/:id | 模型详情 |
| AI模型管理 | GET | /ai-models/active/:model_type | 当前生效模型 |
| AI模型管理 | POST | /ai-models | 创建模型版本 |
| AI模型管理 | PUT | /ai-models/:id | 更新模型版本 |
| AI模型管理 | PUT | /ai-models/:id/freeze | 冻结模型版本 |
| AI模型管理 | DELETE | /ai-models/:id | 删除模型版本 |

### 8.2 API 统计

| 分类 | 数量 |
|------|------|
| AI风险分析 | 4 |
| AI事故分析 | 4 |
| AI整改建议 | 4 |
| AI报告生成 | 8 |
| 预测解释 | 3 |
| 预测评价 | 4 |
| AI模型管理 | 7 |
| 合计 | 30 |

---

## 九、权限控制

### 9.1 角色权限矩阵

| 操作 | admin | safety_manager | department_manager | township_manager | area_manager |
|------|-------|----------------|---------------------|------------------|--------------|
| AI风险分析 | ✅ | ✅ | ✅ | ✅ | ✅ |
| AI事故分析 | ✅ | ✅ | ✅ | ✅ | ✅ |
| AI整改建议 | ✅ | ✅ | ✅ | ✅ | ✅ |
| AI报告生成 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 预测解释 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 预测评价 | ✅ | ✅ | ❌ | ❌ | ❌ |
| AI模型管理 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 冻结模型版本 | ✅ | ❌ | ❌ | ❌ | ❌ |

### 9.2 数据隔离

| 角色 | 数据范围 |
|------|----------|
| admin | 全部数据 |
| safety_manager | 全部数据 |
| department_manager | 本部门数据 |
| township_manager | 本中心数据 |
| area_manager | 本片区数据 |

---

## 十、安全与审计

### 10.1 数据安全

| 措施 | 说明 |
|------|------|
| 数据脱敏 | AI 输入数据脱敏处理，去除敏感信息 |
| 访问控制 | 所有 AI 分析接口需登录认证 |
| 日志记录 | 所有 AI 分析请求和结果均记录日志 |
| 审计追踪 | AI 分析记录包含操作人、时间、输入输出 |

### 10.2 内容安全

| 措施 | 说明 |
|------|------|
| 输入过滤 | 过滤不当输入和恶意Prompt注入 |
| 输出审核 | AI 输出内容需符合安全规范 |
| 敏感词过滤 | 过滤输出中的敏感词汇 |
| 人工审核 | 重要报告生成后需人工审核 |

### 10.3 性能保障

| 措施 | 说明 |
|------|------|
| 异步处理 | AI 分析采用异步处理，避免阻塞 |
| 超时控制 | 设置 AI 请求超时时间（默认60秒） |
| 重试机制 | AI 请求失败自动重试（最多3次） |
| 缓存机制 | 相同输入缓存分析结果（24小时有效） |

---

## 十一、部署建议

### 11.1 后端部署

| 步骤 | 说明 |
|------|------|
| 1. 数据库迁移 | 执行 sprint8b_ai_center_migration.sql |
| 2. 环境变量配置 | 配置 AI 模型 API Key 等环境变量 |
| 3. 服务部署 | 部署 hse-ai-assistant.js 路由 |
| 4. 模型初始化 | 初始化 AI 模型版本 v1.0 |

### 11.2 前端部署

| 步骤 | 说明 |
|------|------|
| 1. API 层部署 | 部署 ai-assistant.ts API 层 |
| 2. 页面开发 | 开发 AI 辅助决策中心页面 |
| 3. 组件集成 | 集成分析组件、报告组件 |

### 11.3 AI 服务对接

| 配置项 | 说明 |
|--------|------|
| AI 提供商 | 支持 OpenAI / Azure OpenAI / 自定义模型 |
| API Key | 安全存储，环境变量配置 |
| 模型选择 | 根据分析类型选择合适的模型 |
| Token 限制 | 设置合理的 Token 上限 |

---

## 十二、交付物清单

| 序号 | 交付物 | 类型 | 状态 |
|------|--------|------|------|
| 1 | 数据库迁移脚本 | SQL | 待开发 |
| 2 | 后端 AI 辅助决策路由 | JavaScript | 待开发 |
| 3 | 前端 AI 辅助决策 API 层 | TypeScript | 待开发 |
| 4 | 《Sprint8-B AI辅助决策中心设计报告》 | 文档 | ✅ 已交付 |
| 5 | 《HSE AI分析模型设计》 | 文档 | 待交付 |
| 6 | 《AI报告生成设计》 | 文档 | 待交付 |
| 7 | 《Sprint8-B验收报告》 | 文档 | 待交付 |

---

## 十三、版本历史

| 版本 | 日期 | 修订人 | 修订说明 |
|------|------|--------|----------|
| v1.0 | 2026-07 | HSE 团队 | Sprint8-B AI辅助决策中心初始设计版本 |
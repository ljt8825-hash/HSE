# Sprint8-B-1 AI能力冻结报告

> 文档版本：v1.0
> 生成日期：2026 年 7 月
> 所属阶段：HSE Dashboard Sprint8-B-1
> 关联文档：
> - 《Sprint8-B AI辅助决策中心设计报告》
> - 《HSE AI分析模型设计》
> - 《AI Prompt版本管理设计》
> - 《AI输出审核流程设计》
> - 《AI数据溯源设计》

---

## 一、冻结概述

### 1.1 冻结背景

Sprint8-B 完成 AI 辅助决策中心设计后，进入开发前最终冻结阶段。本次冻结以"可开发、可控、可追溯"为目标，建立 AI 能力的完整工程化管理体系，确保 AI 输出的安全性、准确性和可审核性。

### 1.2 冻结目标

1. **Prompt 标准化**：建立 Prompt 版本管理机制，确保 Prompt 变更可追溯
2. **审核流程化**：建立 AI 输出审核流程，确保输出内容质量
3. **数据可溯源**：建立 AI 数据溯源机制，确保所有输出有据可查
4. **建议智能化**：基于历史整改案例优化整改建议质量
5. **安全可控**：建立 AI 安全约束，防止生成虚假内容

### 1.3 冻结项清单

| 序号 | 冻结项 | 冻结状态 |
|------|--------|----------|
| 1 | Prompt 版本管理机制 | ✅ 已冻结 |
| 2 | AI 输出审核流程 | ✅ 已冻结 |
| 3 | AI 数据溯源机制 | ✅ 已冻结 |
| 4 | AI 整改建议优化（历史案例库） | ✅ 已冻结 |
| 5 | AI 安全约束 | ✅ 已冻结 |

### 1.4 版本与前置

| 项目 | 说明 |
|------|------|
| 冻结版本 | AI 辅助决策能力 v1.0 |
| 前置文档 | Sprint8-B AI辅助决策中心设计报告（已完成） |
| 前置冻结基线 | 员工风险模型、驾驶风险模型、考核模型、预警规则、预测模型 |

### 1.5 当前冻结基线

| 冻结项 | 版本 | 说明 |
|--------|------|------|
| 员工风险模型 | Sprint6.1 冻结版 | 风险评分公式、岗位风险权重、扣分规则 |
| 驾驶风险模型 | Sprint6.5 冻结版 | 驾驶风险评分公式（5 年滚动周期） |
| 考核模型 | v1.1 | 考核维度、指标权重、红黄牌判定规则 |
| 预警规则 | v1.1 | 预警规则字典、升级机制、超时处理 |
| 预测模型 | v1.0 | 线性回归趋势预测、异常检测、置信度计算 |
| AI 模型配置 | v1.0 | 五大 AI 分析模型配置 |

> ⚠️ 上述基线在本 Sprint 内一律视为只读，AI 辅助决策能力仅读取其数据。

---

## 二、Prompt 版本管理冻结

### 2.1 管理目标

| 目标 | 说明 |
|------|------|
| 版本控制 | 每个 Prompt 有唯一版本号，支持版本回溯 |
| 变更追溯 | Prompt 变更记录变更原因、变更内容、变更人 |
| 冻结保护 | 冻结后的 Prompt 不可修改，确保生产稳定 |
| 废弃管理 | 废弃版本标记为 deprecated，仅作历史参考 |

### 2.2 数据表设计

**hse_ai_prompt_version**（Prompt版本表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGSERIAL | 主键 |
| prompt_code | VARCHAR(64) | Prompt 编码 |
| version | VARCHAR(32) | 版本号 |
| template | TEXT | Prompt 模板内容 |
| scene | VARCHAR(32) | 使用场景（risk_analysis/accident_analysis/rectify_suggestion/report_generation/prediction_explain） |
| model_name | VARCHAR(128) | 适用模型名称 |
| parameters | JSONB | 模型参数配置 |
| max_tokens | INTEGER | 最大输出长度 |
| temperature | NUMERIC(3,2) | 温度参数 |
| description | TEXT | Prompt 描述 |
| status | VARCHAR(20) | 状态（active/frozen/deprecated） |
| change_log | TEXT | 变更说明 |
| created_by | BIGINT | 创建人 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |
| is_deleted | BOOLEAN | 软删除标记 |

### 2.3 Prompt 编码规范

| Prompt 编码 | 使用场景 | 说明 |
|-------------|----------|------|
| TPL-RISK-001 | risk_analysis | 风险分析 Prompt |
| TPL-ACCIDENT-001 | accident_analysis | 事故分析 Prompt |
| TPL-RECTIFY-001 | rectify_suggestion | 整改建议 Prompt |
| TPL-REPORT-DAILY | report_generation | 日报生成 Prompt |
| TPL-REPORT-WEEKLY | report_generation | 周报生成 Prompt |
| TPL-REPORT-MONTHLY | report_generation | 月报生成 Prompt |
| TPL-REPORT-GROUP | report_generation | 集团汇报 Prompt |
| TPL-PREDICT-001 | prediction_explain | 预测解释 Prompt |

### 2.4 版本状态机

```
创建 → active（生效中）
         ↓
      freeze → frozen（冻结，不可修改）
         ↓
      deprecated → 废弃
```

### 2.5 API 设计

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /ai/prompts | Prompt 版本列表 |
| GET | /ai/prompts/:id | Prompt 详情 |
| GET | /ai/prompts/active/:scene | 获取当前生效 Prompt |
| POST | /ai/prompts | 创建 Prompt 版本 |
| PUT | /ai/prompts/:id | 更新 Prompt 版本 |
| PUT | /ai/prompts/:id/freeze | 冻结 Prompt 版本 |
| PUT | /ai/prompts/:id/deprecate | 废弃 Prompt 版本 |
| DELETE | /ai/prompts/:id | 删除 Prompt 版本 |

---

## 三、AI 输出审核流程冻结

### 3.1 审核目标

| 目标 | 说明 |
|------|------|
| 内容质量 | 确保 AI 输出内容准确、合理、有价值 |
| 安全合规 | 确保 AI 输出不违反安全规定 |
| 人机协作 | 建立人工审核机制，实现人机协作 |

### 3.2 审核流程

```
┌─────────────────────────────────────────────────────────────────┐
│                     AI 生成内容                                   │
└──────────────────────────┬──────────────────────────────────────┘
                           │ 状态：draft
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   安全管理员审核                                  │
│  - 审核内容安全性                                                 │
│  - 审核数据准确性                                                 │
│  - 审核合规性                                                     │
└──────────────────────────┬──────────────────────────────────────┘
                           │ 状态：reviewing
               ┌───────────┴───────────┐
               ▼                       ▼
┌─────────────────────────┐ ┌─────────────────────────┐
│      审核通过            │ │      审核拒绝            │
│  状态：approved          │ │  状态：rejected          │
└────────────┬────────────┘ └─────────────────────────┘
             │                        │
             ▼                        ▼
┌─────────────────────────┐ ┌─────────────────────────┐
│   部门经理确认           │ │     返回修改             │
│  状态：confirmed         │ │  状态：draft             │
└────────────┬────────────┘ └─────────────────────────┘
             │
             ▼
┌─────────────────────────┐
│     正式发布             │
│  状态：published         │
└─────────────────────────┘
```

### 3.3 审核状态定义

| 状态 | 值 | 说明 | 可执行操作 |
|------|-----|------|------------|
| 草稿 | draft | AI 生成初始状态 | 提交审核、编辑、删除 |
| 审核中 | reviewing | 安全管理员审核中 | 通过、拒绝 |
| 已通过 | approved | 安管审核通过 | 确认、退回 |
| 已拒绝 | rejected | 安管审核拒绝 | 修改、删除 |
| 已确认 | confirmed | 部门经理确认 | 发布、退回 |
| 已发布 | published | 正式发布 | 仅查看 |

### 3.4 审核角色权限

| 操作 | admin | safety_manager | department_manager |
|------|-------|----------------|---------------------|
| 提交审核 | ✅ | ✅ | ✅ |
| 审核通过/拒绝 | ✅ | ✅ | ❌ |
| 确认发布 | ✅ | ❌ | ✅ |
| 强制发布 | ✅ | ❌ | ❌ |

### 3.5 审核记录表

**hse_ai_review_record**（AI审核记录表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGSERIAL | 主键 |
| analysis_id | BIGINT | 关联 AI 分析记录 ID |
| review_type | VARCHAR(32) | 审核类型（safety_review/department_confirm） |
| reviewer_id | BIGINT | 审核人 ID |
| reviewer_name | VARCHAR(64) | 审核人姓名 |
| review_result | VARCHAR(20) | 审核结果（approved/rejected） |
| review_comment | TEXT | 审核意见 |
| reviewed_at | TIMESTAMP | 审核时间 |
| created_at | TIMESTAMP | 创建时间 |

---

## 四、AI 数据溯源冻结

### 4.1 溯源目标

| 目标 | 说明 |
|------|------|
| 数据来源可查 | 所有 AI 输出可追溯到原始数据来源 |
| 计算过程可溯 | AI 使用的指标、计算结果可溯源 |
| 结果可验证 | AI 输出可通过溯源数据验证准确性 |

### 4.2 溯源数据结构

**hse_ai_trace_record**（AI数据溯源表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGSERIAL | 主键 |
| ai_task_id | BIGINT | 关联 AI 任务 ID |
| trace_type | VARCHAR(32) | 溯源类型（data_source/metric_calculation/prediction_result） |
| source_type | VARCHAR(32) | 来源类型（employee_risk/driver_risk/accident/assessment/warning/rectification/prediction） |
| source_id | BIGINT | 来源记录 ID |
| source_table | VARCHAR(64) | 来源表名 |
| metric_name | VARCHAR(128) | 指标名称 |
| metric_value | NUMERIC(20,6) | 指标值 |
| data_time | TIMESTAMP | 数据时间 |
| calculation_method | TEXT | 计算方法说明 |
| created_at | TIMESTAMP | 创建时间 |

### 4.3 溯源记录示例

```json
{
  "ai_task_id": 100,
  "trace_records": [
    {
      "trace_type": "data_source",
      "source_type": "employee_risk",
      "source_id": 501,
      "source_table": "employee_risk_snapshot",
      "metric_name": "risk_score",
      "metric_value": 72.5,
      "data_time": "2026-07-22T00:00:00Z"
    },
    {
      "trace_type": "metric_calculation",
      "source_type": "employee_risk",
      "source_id": 501,
      "metric_name": "avg_risk_score_12m",
      "metric_value": 68.3,
      "calculation_method": "近12个月风险评分均值"
    },
    {
      "trace_type": "prediction_result",
      "source_type": "prediction",
      "source_id": 100,
      "metric_name": "predicted_score",
      "metric_value": 78.5,
      "data_time": "2026-07-23T00:00:00Z"
    }
  ]
}
```

### 4.4 溯源数据来源

| 溯源类型 | 数据来源 | 记录内容 |
|----------|----------|----------|
| 数据源 | employee_risk_snapshot | 员工风险评分快照 |
| 数据源 | driver_risk_snapshot | 驾驶风险评分快照 |
| 数据源 | hse_accident | 事故记录 |
| 数据源 | hse_assessment | 考核记录 |
| 数据源 | hse_warning_record | 预警记录 |
| 数据源 | hse_rectification_task | 整改任务 |
| 计算结果 | hse_risk_prediction | 预测结果 |
| 计算结果 | hse_analysis_snapshot | 分析快照 |

### 4.5 API 设计

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /ai/trace/:ai_task_id | 查询 AI 任务溯源记录 |
| GET | /ai/trace/:ai_task_id/export | 导出溯源报告 |
| GET | /ai/trace/verify/:ai_task_id | 验证溯源数据 |

---

## 五、AI 整改建议优化冻结

### 5.1 优化目标

| 目标 | 说明 |
|------|------|
| 基于历史案例 | 从已关闭的整改任务中提取有效案例 |
| 效果导向 | 优先推荐效果评价好的整改措施 |
| 分类归纳 | 按问题类型分类归纳整改方案 |

### 5.2 历史案例库设计

**hse_ai_rectify_case**（整改案例库表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGSERIAL | 主键 |
| case_code | VARCHAR(32) | 案例编码 |
| risk_type | VARCHAR(64) | 风险类型 |
| risk_level | VARCHAR(20) | 风险等级 |
| risk_description | TEXT | 风险描述 |
| rectify_measures | JSONB | 整改措施列表 |
| effect_score | NUMERIC(5,2) | 效果评分（0-100） |
| effect_evaluation | TEXT | 效果评价 |
| source_task_id | BIGINT | 来源整改任务 ID |
| status | VARCHAR(20) | 状态（active/inactive） |
| use_count | INTEGER | 使用次数 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### 5.3 案例生成流程

```
┌─────────────────────────────────────────────────────────────────┐
│               已关闭整改任务（hse_rectification_task）            │
└──────────────────────────┬──────────────────────────────────────┘
                           │ 状态：closed
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   筛选有效案例                                    │
│  - 整改效果评分 ≥ 70 分                                         │
│  - 无重复风险（整改后风险未再发生）                              │
│  - 整改周期 ≤ 30 天                                             │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   提取案例特征                                    │
│  - 风险类型                                                      │
│  - 风险等级                                                      │
│  - 整改措施                                                       │
│  - 效果评价                                                       │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   生成案例记录                                    │
│  - 写入 hse_ai_rectify_case                                     │
│  - 设置效果评分                                                   │
│  - 标记为 active                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.4 建议生成优化

**Prompt 增强策略**：

```
# 历史案例参考
以下是同类风险的成功整改案例：

{similar_cases}

# 建议要求
请参考以上成功案例，结合当前风险具体情况，提出整改建议：
1. 建议应有案例支撑，优先引用效果评分高的案例
2. 建议应适配当前风险具体情况
3. 建议应标注引用的案例来源
```

### 5.5 API 设计

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /ai/rectify-cases | 案例库列表 |
| GET | /ai/rectify-cases/:id | 案例详情 |
| POST | /ai/rectify-cases/extract | 从已关闭任务提取案例 |
| PUT | /ai/rectify-cases/:id | 更新案例 |
| PUT | /ai/rectify-cases/:id/deprecate | 废弃案例 |

---

## 六、AI 安全约束冻结

### 6.1 安全目标

| 目标 | 说明 |
|------|------|
| 禁止虚假生成 | 禁止生成虚假事故、虚假人员、虚假整改记录 |
| 引用事实数据 | 所有输出必须引用事实数据 |
| 内容合规 | 输出内容符合安全规定 |

### 6.2 安全约束规则

**规则一：禁止虚假生成**

```
AI 输出禁止包含以下内容：
1. 虚假事故记录：不得生成未发生的事故信息
2. 虚假人员信息：不得生成不存在的人员信息
3. 虚假整改记录：不得生成未执行的整改任务
4. 虚假数据指标：不得生成未经验证的数据

违规输出将被标记为 rejected，需人工修正后重新提交。
```

**规则二：引用事实数据**

```
AI 输出必须满足以下条件：
1. 数据来源可溯源：所有数据必须可追溯到源表
2. 数据时间标注：必须标注数据的时间范围
3. 计算方法说明：聚合数据必须说明计算方法
4. 数据引用格式：建议使用以下格式引用数据
   - 数据来源：{source_table}
   - 数据时间：{data_time}
   - 数据值：{metric_value}
```

**规则三：内容合规检查**

| 检查项 | 说明 |
|--------|------|
| 敏感词过滤 | 过滤敏感词汇 |
| 格式规范 | 输出格式符合规范 |
| 逻辑一致性 | 输出内容逻辑自洽 |

### 6.3 安全检查表

**hse_ai_safety_check**（AI安全检查表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGSERIAL | 主键 |
| analysis_id | BIGINT | 关联 AI 分析记录 ID |
| check_type | VARCHAR(32) | 检查类型（fake_content/data_source/compliance） |
| check_result | VARCHAR(20) | 检查结果（passed/failed） |
| check_details | JSONB | 检查详情 |
| risk_level | VARCHAR(20) | 风险等级（none/low/medium/high/critical） |
| created_at | TIMESTAMP | 创建时间 |

### 6.4 安全检查流程

```
AI 输出 → 安全检查 → 检查结果
              │
              ├── 虚假内容检测
              │    - 检测虚假事故
              │    - 检测虚假人员
              │    - 检测虚假整改
              │
              ├── 数据溯源检测
              │    - 检测数据来源
              │    - 检测数据时间
              │    - 检测数据一致性
              │
              └── 内容合规检测
                   - 敏感词检测
                   - 格式规范检测
                   - 逻辑一致性检测
```

### 6.5 API 设计

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /ai/safety/check/:analysis_id | 执行安全检查 |
| GET | /ai/safety/check/:analysis_id | 查询安全检查结果 |
| GET | /ai/safety/rules | 查询安全规则列表 |

---

## 七、冻结约束

### 7.1 禁止修改项

| 冻结项 | 版本 | 说明 |
|--------|------|------|
| 员工风险模型 | Sprint6.1 冻结版 | 风险评分公式、岗位风险权重、扣分规则 |
| 驾驶风险模型 | Sprint6.5 冻结版 | 驾驶风险评分公式 |
| 考核模型 | v1.1 | 考核维度、指标权重、红黄牌判定规则 |
| 预警规则 | v1.1 | 预警规则字典、升级机制 |
| 预测模型 | v1.0 | 线性回归趋势预测、异常检测 |

### 7.2 数据约束

| 约束项 | 说明 |
|--------|------|
| 只读数据源 | employee_risk/driver_risk/accident/assessment/warning/rectification |
| AI 输出独立存储 | hse_ai_analysis_record |
| 溯源数据独立存储 | hse_ai_trace_record |

---

## 八、交付物清单

| 序号 | 交付物 | 类型 | 状态 |
|------|--------|------|------|
| 1 | 数据库迁移脚本 | SQL | 待开发 |
| 2 | 后端 AI 管理路由 | JavaScript | 待开发 |
| 3 | 前端 AI 管理 API 层 | TypeScript | 待开发 |
| 4 | 本冻结报告 | 文档 | ✅ 已交付 |
| 5 | 《AI Prompt版本管理设计》 | 文档 | 待交付 |
| 6 | 《AI输出审核流程设计》 | 文档 | 待交付 |
| 7 | 《AI数据溯源设计》 | 文档 | 待交付 |
| 8 | 《Sprint8-B最终冻结报告》 | 文档 | 待交付 |

---

## 九、版本历史

| 版本 | 日期 | 修订人 | 修订说明 |
|------|------|--------|----------|
| v1.0 | 2026-07 | HSE 团队 | Sprint8-B-1 AI能力冻结初始版本 |
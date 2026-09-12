# AI输出审核流程设计

> 文档版本：v1.0
> 生成日期：2026 年 7 月
> 所属阶段：HSE Dashboard Sprint8-B-1
> 关联文档：《Sprint8-B-1 AI能力冻结报告》、《AI Prompt版本管理设计》

---

## 一、设计概述

### 1.1 设计背景

AI 生成的分析报告、整改建议等内容直接影响管理决策，为确保内容质量、安全性和合规性，需要建立完整的审核流程。

### 1.2 设计目标

| 目标 | 说明 |
|------|------|
| 内容质量 | 确保 AI 输出内容准确、合理、有价值 |
| 安全合规 | 确保 AI 输出不违反安全规定 |
| 人机协作 | 建立人工审核机制，实现人机协作 |

### 1.3 审核范围

| 审核对象 | 审核要求 | 说明 |
|----------|----------|------|
| AI风险分析报告 | 必须审核 | 分析结论影响管理决策 |
| AI事故分析报告 | 必须审核 | 涉及事故原因认定 |
| AI整改建议 | 必须审核 | 整改措施涉及资源投入 |
| AI管理报告 | 必须审核 | 报告向上级汇报 |
| AI预测解释 | 建议审核 | 解释性内容，可选审核 |

---

## 二、审核流程设计

### 2.1 审核流程图

```
┌─────────────────────────────────────────────────────────────────┐
│                     AI 生成内容                                   │
│  状态：draft                                                     │
└──────────────────────────┬──────────────────────────────────────┘
                           │ 提交审核
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   安全管理员审核                                  │
│  角色：safety_manager                                           │
│  检查项：                                                        │
│  - 内容安全性：是否包含敏感/违规内容                             │
│  - 数据准确性：引用数据是否准确                                  │
│  - 合规性：是否符合安全规定                                      │
│  状态：reviewing                                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │
               ┌───────────┴───────────┐
               │                       │
               ▼                       ▼
┌─────────────────────────┐ ┌─────────────────────────┐
│      审核通过            │ │      审核拒绝            │
│  操作：approved          │ │  操作：rejected          │
│  状态：approved          │ │  状态：rejected          │
│  填写：审核意见           │ │  填写：拒绝原因           │
└────────────┬────────────┘ └────────────┬────────────┘
             │                           │
             ▼                           ▼
┌─────────────────────────┐ ┌─────────────────────────┐
│   部门经理确认           │ │     返回修改             │
│  角色：department_manager │ │  操作：modify            │
│  检查项：                 │ │  状态：draft             │
│  - 内容完整性             │ │  修改后重新提交审核       │
│  - 建议可行性             │ └─────────────────────────┘
│  状态：confirmed          │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│     正式发布             │
│  操作：publish           │
│  状态：published         │
│  可用于：决策、汇报       │
└─────────────────────────┘
```

### 2.2 审核状态定义

| 状态 | 值 | 说明 | 可执行操作 |
|------|-----|------|------------|
| 草稿 | draft | AI 生成初始状态 | 提交审核、编辑、删除 |
| 审核中 | reviewing | 安全管理员审核中 | 通过、拒绝 |
| 已通过 | approved | 安管审核通过 | 确认、退回 |
| 已拒绝 | rejected | 安管审核拒绝 | 修改、删除 |
| 已确认 | confirmed | 部门经理确认 | 发布、退回 |
| 已发布 | published | 正式发布 | 仅查看 |

### 2.3 状态流转规则

| 当前状态 | 操作 | 目标状态 | 执行角色 |
|----------|------|----------|----------|
| draft | 提交审核 | reviewing | 创建人 |
| reviewing | 通过 | approved | safety_manager |
| reviewing | 拒绝 | rejected | safety_manager |
| rejected | 修改 | draft | 创建人 |
| approved | 确认 | confirmed | department_manager |
| approved | 退回 | reviewing | department_manager |
| confirmed | 发布 | published | admin |
| confirmed | 退回 | reviewing | department_manager |

---

## 三、数据表设计

### 3.1 hse_ai_review_record 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGSERIAL | 主键 |
| analysis_id | BIGINT | 关联 AI 分析记录 ID |
| review_type | VARCHAR(32) | 审核类型 |
| reviewer_id | BIGINT | 审核人 ID |
| reviewer_name | VARCHAR(64) | 审核人姓名 |
| reviewer_role | VARCHAR(32) | 审核人角色 |
| review_result | VARCHAR(20) | 审核结果 |
| review_comment | TEXT | 审核意见 |
| review_details | JSONB | 审核详情 |
| reviewed_at | TIMESTAMP | 审核时间 |
| created_at | TIMESTAMP | 创建时间 |

### 3.2 审核详情结构

```json
{
  "checkItems": [
    {
      "item": "内容安全性",
      "result": "passed",
      "comment": "内容无敏感信息"
    },
    {
      "item": "数据准确性",
      "result": "passed",
      "comment": "引用数据准确"
    },
    {
      "item": "合规性",
      "result": "passed",
      "comment": "符合安全规定"
    }
  ],
  "overallScore": 95,
  "riskLevel": "low"
}
```

---

## 四、角色权限设计

### 4.1 审核角色

| 角色 | 编码 | 说明 |
|------|------|------|
| 系统管理员 | admin | 全局权限，可强制发布 |
| 安全管理员 | safety_manager | 安全审核权限 |
| 部门经理 | department_manager | 部门确认权限 |
| 普通用户 | user | 提交审核权限 |

### 4.2 权限矩阵

| 操作 | admin | safety_manager | department_manager | user |
|------|-------|----------------|---------------------|------|
| 提交审核 | ✅ | ✅ | ✅ | ✅ |
| 审核通过/拒绝 | ✅ | ✅ | ❌ | ❌ |
| 确认发布 | ✅ | ❌ | ✅ | ❌ |
| 强制发布 | ✅ | ❌ | ❌ | ❌ |
| 退回重审 | ✅ | ✅ | ✅ | ❌ |

---

## 五、审核检查项

### 5.1 安全管理员检查项

| 检查项 | 说明 | 通过标准 |
|--------|------|----------|
| 内容安全性 | 是否包含敏感/违规内容 | 无敏感信息 |
| 数据准确性 | 引用数据是否准确 | 数据来源可验证 |
| 合规性 | 是否符合安全规定 | 符合公司制度 |
| 逻辑一致性 | 内容逻辑是否自洽 | 无逻辑矛盾 |
| 格式规范 | 格式是否符合规范 | 格式完整规范 |

### 5.2 部门经理检查项

| 检查项 | 说明 | 通过标准 |
|--------|------|----------|
| 内容完整性 | 内容是否完整 | 包含必要信息 |
| 建议可行性 | 建议是否可执行 | 可落地执行 |
| 资源合理性 | 资源需求是否合理 | 资源需求合理 |

---

## 六、API 设计

### 6.1 API 列表

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | /ai/review/submit/:analysis_id | 提交审核 | 创建人 |
| POST | /ai/review/approve/:analysis_id | 审核通过 | safety_manager |
| POST | /ai/review/reject/:analysis_id | 审核拒绝 | safety_manager |
| POST | /ai/review/confirm/:analysis_id | 确认发布 | department_manager |
| POST | /ai/review/publish/:analysis_id | 正式发布 | admin |
| POST | /ai/review/return/:analysis_id | 退回重审 | safety_manager/department_manager |
| GET | /ai/review/pending | 待审核列表 | 审核角色 |
| GET | /ai/review/history | 审核历史 | 审核角色 |

### 6.2 API 详细设计

#### 6.2.1 提交审核

```
POST /api/hse/ai-assistant/ai/review/submit/:analysis_id
```

**请求体**

```json
{
  "submit_comment": "提交审核，请审核员审核"
}
```

**响应示例**

```json
{
  "code": 0,
  "data": {
    "analysisId": 100,
    "status": "reviewing",
    "submittedAt": "2026-07-23T10:00:00Z",
    "submittedBy": 501
  },
  "message": "已提交审核"
}
```

#### 6.2.2 审核通过

```
POST /api/hse/ai-assistant/ai/review/approve/:analysis_id
```

**请求体**

```json
{
  "review_comment": "内容准确，符合安全规定，同意通过",
  "review_details": {
    "checkItems": [
      { "item": "内容安全性", "result": "passed" },
      { "item": "数据准确性", "result": "passed" },
      { "item": "合规性", "result": "passed" }
    ]
  }
}
```

#### 6.2.3 审核拒绝

```
POST /api/hse/ai-assistant/ai/review/reject/:analysis_id
```

**请求体**

```json
{
  "review_comment": "引用数据不准确，需核实数据来源",
  "reject_reason": "数据准确性问题"
}
```

---

## 七、通知机制

### 7.1 通知节点

| 节点 | 通知对象 | 通知内容 |
|------|----------|----------|
| 提交审核 | safety_manager | 有新的AI内容待审核 |
| 审核通过 | department_manager | AI内容已通过审核，待确认 |
| 审核拒绝 | 创建人 | AI内容审核被拒绝，请修改 |
| 确认发布 | 创建人 | AI内容已发布 |
| 退回重审 | safety_manager | AI内容被退回，请重新审核 |

### 7.2 通知方式

| 方式 | 说明 |
|------|------|
| 系统通知 | 站内消息通知 |
| 邮件通知 | 重要节点邮件通知 |
| 短信通知 | 紧急情况短信通知 |

---

## 八、版本历史

| 版本 | 日期 | 修订人 | 修订说明 |
|------|------|--------|----------|
| v1.0 | 2026-07 | HSE 团队 | AI输出审核流程设计初始版本 |
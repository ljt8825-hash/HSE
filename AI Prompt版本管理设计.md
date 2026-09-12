# AI Prompt版本管理设计

> 文档版本：v1.0
> 生成日期：2026 年 7 月
> 所属阶段：HSE Dashboard Sprint8-B-1
> 关联文档：《Sprint8-B-1 AI能力冻结报告》

---

## 一、设计概述

### 1.1 设计背景

Prompt 是 AI 分析能力的核心配置，直接影响 AI 输出质量。为确保 Prompt 变更可追溯、生产环境稳定，需要建立完整的 Prompt 版本管理机制。

### 1.2 设计目标

| 目标 | 说明 |
|------|------|
| 版本控制 | 每个 Prompt 有唯一版本号，支持版本回溯 |
| 变更追溯 | Prompt 变更记录变更原因、变更内容、变更人 |
| 冻结保护 | 冻结后的 Prompt 不可修改，确保生产稳定 |
| 废弃管理 | 废弃版本标记为 deprecated，仅作历史参考 |

### 1.3 管理范围

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

---

## 二、数据表设计

### 2.1 hse_ai_prompt_version 表结构

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGSERIAL | 主键 |
| prompt_code | VARCHAR(64) | Prompt 编码 |
| version | VARCHAR(32) | 版本号 |
| template | TEXT | Prompt 模板内容 |
| scene | VARCHAR(32) | 使用场景 |
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

### 2.2 索引设计

```sql
-- 唯一约束：Prompt编码 + 版本号
CREATE UNIQUE INDEX idx_prompt_code_version 
ON hse_ai_prompt_version(prompt_code, version) WHERE is_deleted = false;

-- 场景索引
CREATE INDEX idx_prompt_scene 
ON hse_ai_prompt_version(scene) WHERE is_deleted = false;

-- 状态索引
CREATE INDEX idx_prompt_status 
ON hse_ai_prompt_version(status) WHERE is_deleted = false;
```

---

## 三、版本状态管理

### 3.1 状态定义

| 状态 | 值 | 说明 | 可执行操作 |
|------|-----|------|------------|
| 生效中 | active | 当前使用的版本 | 编辑、冻结、废弃 |
| 已冻结 | frozen | 生产冻结版本 | 废弃 |
| 已废弃 | deprecated | 历史废弃版本 | 仅查看 |

### 3.2 状态流转

```
创建 → active（生效中）
         │
         ├── 冻结 → frozen（已冻结）
         │              │
         │              └── 废弃 → deprecated（已废弃）
         │
         └── 废弃 → deprecated（已废弃）
```

### 3.3 版本保护规则

| 规则 | 说明 |
|------|------|
| 冻结保护 | frozen 状态的版本禁止任何修改 |
| 单活约束 | 同一 prompt_code 只能有一个 active 状态的版本 |
| 版本号递增 | 新版本号必须大于已存在版本号 |

---

## 四、Prompt 模板结构

### 4.1 标准模板结构

```
# 系统角色定义
{system_role}

# 任务描述
{task_description}

# 数据上下文
{data_context}

# 分析要求
{analysis_requirements}

# 输出格式
{output_format}

# 约束条件
{constraints}
```

### 4.2 变量占位符规范

| 占位符 | 说明 | 示例值 |
|--------|------|--------|
| {target_type} | 目标类型 | employee |
| {target_name} | 目标名称 | 张三 |
| {months} | 分析周期（月） | 12 |
| {context_data} | 数据上下文 | JSON 数据 |
| {output_schema} | 输出格式定义 | JSON Schema |

### 4.3 模板示例

**风险分析 Prompt 模板（TPL-RISK-001 v1.0）**

```
# 系统角色
你是一个专业的HSE风险分析专家，擅长分析组织、人员和事故的风险状况。

# 分析对象
目标类型：{target_type}
目标名称：{target_name}
分析周期：最近 {months} 个月

# 数据上下文
{context_data}

# 分析要求
请对以上数据进行综合分析：
1. 风险概况：总体风险评价
2. 趋势分析：风险变化趋势
3. 关键因子：识别主要风险因素
4. 改进建议：针对性改进措施

# 输出格式
{output_schema}

# 约束条件
- 所有结论必须有数据支撑
- 不得生成虚假信息
- 置信度范围 0-1
```

---

## 五、API 设计

### 5.1 API 列表

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | /ai/prompts | Prompt 版本列表 | 全局只读 |
| GET | /ai/prompts/:id | Prompt 详情 | 全局只读 |
| GET | /ai/prompts/active/:scene | 获取当前生效 Prompt | 全局只读 |
| POST | /ai/prompts | 创建 Prompt 版本 | admin/safety_manager |
| PUT | /ai/prompts/:id | 更新 Prompt 版本 | admin/safety_manager |
| PUT | /ai/prompts/:id/freeze | 冻结 Prompt 版本 | admin |
| PUT | /ai/prompts/:id/deprecate | 废弃 Prompt 版本 | admin |
| DELETE | /ai/prompts/:id | 删除 Prompt 版本 | admin |

### 5.2 API 详细设计

#### 5.2.1 Prompt 版本列表

```
GET /api/hse/ai-assistant/ai/prompts?scene=risk_analysis&status=active
```

**响应示例**

```json
{
  "code": 0,
  "data": {
    "list": [
      {
        "id": 1,
        "promptCode": "TPL-RISK-001",
        "version": "v1.0",
        "scene": "risk_analysis",
        "modelName": "gpt-4-turbo",
        "maxTokens": 2000,
        "temperature": 0.3,
        "description": "风险分析Prompt v1.0",
        "status": "frozen",
        "changeLog": "初始版本",
        "createdBy": 1,
        "createdAt": "2026-07-23T10:00:00Z"
      }
    ],
    "total": 1
  }
}
```

#### 5.2.2 创建 Prompt 版本

```
POST /api/hse/ai-assistant/ai/prompts
```

**请求体**

```json
{
  "prompt_code": "TPL-RISK-001",
  "version": "v1.1",
  "template": "Prompt模板内容...",
  "scene": "risk_analysis",
  "model_name": "gpt-4-turbo",
  "parameters": {
    "max_tokens": 2500,
    "temperature": 0.3
  },
  "description": "风险分析Prompt v1.1 - 增加历史案例参考",
  "change_log": "增加历史案例参考机制"
}
```

#### 5.2.3 冻结 Prompt 版本

```
PUT /api/hse/ai-assistant/ai/prompts/:id/freeze
```

**业务校验**

1. 版本存在性校验
2. 状态校验（仅 active 可冻结）
3. 冻结后状态变为 frozen

---

## 六、版本历史管理

### 6.1 变更记录

每次 Prompt 变更记录：

| 记录项 | 说明 |
|--------|------|
| 变更时间 | updated_at |
| 变更人 | created_by |
| 变更内容 | change_log |
| 变更前版本 | 通过 version 追溯 |

### 6.2 版本对比

支持两个版本的内容对比：

```
GET /api/hse/ai-assistant/ai/prompts/compare?v1=1&v2=2
```

**响应示例**

```json
{
  "code": 0,
  "data": {
    "version1": {
      "id": 1,
      "version": "v1.0",
      "template": "..."
    },
    "version2": {
      "id": 2,
      "version": "v1.1",
      "template": "..."
    },
    "diff": {
      "added": ["历史案例参考部分"],
      "removed": [],
      "modified": ["输出格式部分"]
    }
  }
}
```

---

## 七、初始化数据

### 7.1 初始 Prompt 版本

| Prompt 编码 | 版本 | 场景 | 状态 |
|-------------|------|------|------|
| TPL-RISK-001 | v1.0 | risk_analysis | frozen |
| TPL-ACCIDENT-001 | v1.0 | accident_analysis | frozen |
| TPL-RECTIFY-001 | v1.0 | rectify_suggestion | frozen |
| TPL-REPORT-DAILY | v1.0 | report_generation | frozen |
| TPL-REPORT-WEEKLY | v1.0 | report_generation | frozen |
| TPL-REPORT-MONTHLY | v1.0 | report_generation | frozen |
| TPL-REPORT-GROUP | v1.0 | report_generation | frozen |
| TPL-PREDICT-001 | v1.0 | prediction_explain | frozen |

---

## 八、版本历史

| 版本 | 日期 | 修订人 | 修订说明 |
|------|------|--------|----------|
| v1.0 | 2026-07 | HSE 团队 | AI Prompt版本管理设计初始版本 |
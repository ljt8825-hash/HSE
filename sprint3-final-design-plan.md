# HSE V2 Sprint3 安全生产汇报中心 — 最终设计方案

> 版本：v1.0（最终版）  
> 日期：2026-07-19  
> 状态：待确认后进入编码  
> 前提：Sprint1 资料中心 ✅、Sprint2 AI文件分析 ✅

---

## 0. 设计边界与继承关系

### 0.1 必须遵守的约束

| 约束项 | 说明 |
|-------|------|
| 不修改 Vben 核心 | `packages/` 目录禁止改动 |
| 不修改登录 / JWT / auth | `auth/` 目录禁止改动 |
| 不新增 npm 依赖 | 复用现有 dayjs、xlsx 等 |
| 复用现有报告体系 | 基于 `hse_reports` / `hse_report_templates` 扩展，不新建平行表 |

### 0.2 现有基础（继承 Sprint1/2 + v5.2）

| 模块 | 现状 | Sprint3 升级 |
|------|------|-------------|
| `hse_report_templates` | 日/周/月/年 4 种统计模板 | 扩展 2 类业务汇报模板 + AI 配置 |
| `hse_reports` | 基础数据 + HTML 存储 | 扩展 AI 生成、确认状态、来源引用 |
| `reportService.js` | 纯数据聚合 + HTML 生成 | 增加 V2 异步生成、AI 调用、资料注入 |
| `aiService.js` | 已有 report_hazard/accident/training | 新增 2 个汇报中心 Prompt |
| 前端 `reports/index.vue` | 占位页（"开发中"） | 完整实现汇报中心 UI |
| `document_ai_analysis` | Sprint2 成果 | 作为资料依据来源注入报告 |

---

## 1. MVP 范围

### 1.1 Sprint3 实现范围（2 类报告）

| 序号 | 报告类型 | template_category | 优先级 | 说明 |
|-----|---------|-------------------|-------|------|
| A | **安全生产月报** | `monthly_report` | P0 | 月度安全数据汇总 + AI分析 |
| B | **集团/区域公司安全汇报材料** | `group_report` | P0 | 高层视角多维度汇报 |

### 1.2 暂缓实现（后续 Sprint）

| 序号 | 报告类型 | 暂缓原因 |
|-----|---------|---------|
| C | 安全检查总结 | 检查模块数据需进一步梳理 |
| D | 隐患整改分析报告 | 隐患数据维度复杂，待业务确认 |
| E | 培训情况报告 | 培训模块数据需对齐 |

---

## 2. 业务流程

### 2.1 整体流程

```
用户选择报告类型（月报 / 集团汇报）
       ↓
配置参数（周期、范围、是否启用AI）
       ↓
触发生成（异步任务，立即返回 reportId）
       ↓
┌─ 数据采集阶段 ─────────────────────┐
│  1. 业务统计数据（事件/隐患/任务等）    │
│  2. 资料中心匹配相关制度文件            │
│  3. 读取 document_ai_analysis 摘要     │
└───────────────────────────────────┘
       ↓
┌─ AI 生成阶段（可选）───────────────┐
│  构建 Prompt（含强约束）→ 调用 LLM    │
│  → 结构化解析 → 写入 ai_summary 等    │
└───────────────────────────────────┘
       ↓
生成报告（generation_status = completed）
       ↓
人工预览
       ↓
┌─────────┐    ┌─────────┐
│ 确认发布 │    │ 重新生成 │
│(confirmed)│    │ (新版本) │
└─────────┘    └─────────┘
       ↓
归档留存 / 导出（HTML打印 / Word）
```

### 2.2 安全生产月报流程

```
选择月份 → 自动采集当月数据 → 生成月报
                     ↓
              ┌─────┴─────┐
              │ AI 开启？  │
              └─────┬─────┘
                是 ↓   ↓ 否
         AI 生成综述建议  纯数据报告
                ↓
         人工确认 → 发布/导出
```

### 2.3 集团/区域汇报材料流程

```
选择汇报周期 + 范围 → 采集多维度汇总数据
           ↓
    AI 提炼亮点 / 问题 / 行动计划
           ↓
    人工编辑调整 → 确认 → 导出
```

---

## 3. 数据模型设计

### 3.1 hse_report_templates 扩展

**全部 ALTER TABLE 追加字段（兼容现有数据）**：

```sql
-- ============================================
-- 模板表扩展
-- ============================================
ALTER TABLE hse_report_templates
ADD COLUMN IF NOT EXISTS template_category VARCHAR(30) DEFAULT 'statistical'
    CHECK (template_category IN (
        'statistical',      -- 原有统计报表（日/周/月/年）
        'monthly_report',   -- 安全生产月报
        'group_report'      -- 集团/区域汇报
        -- 'inspection_summary', 'hazard_analysis', 'training_report'  后续扩展预留
    )),
ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS prompt_template TEXT,
ADD COLUMN IF NOT EXISTS data_sources JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS section_config JSONB DEFAULT '[]';
```

**Sprint3 实际使用字段**：
- `template_category` ✅ 使用
- `ai_enabled` ✅ 使用
- `prompt_template` ✅ 使用（可覆盖默认 Prompt）
- `data_sources` ✅ 使用
- `section_config` ✅ 使用

### 3.2 hse_reports 扩展

```sql
-- ============================================
-- 报告记录表扩展
-- ============================================
ALTER TABLE hse_reports
ADD COLUMN IF NOT EXISTS template_id BIGINT,
ADD COLUMN IF NOT EXISTS template_category VARCHAR(30)
    CHECK (template_category IN (
        'statistical', 'monthly_report', 'group_report'
    )),
ADD COLUMN IF NOT EXISTS report_scope JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS generation_status VARCHAR(20) DEFAULT 'completed'
    CHECK (generation_status IN (
        'pending', 'collecting', 'ai_generating', 'completed', 'failed'
    )),
ADD COLUMN IF NOT EXISTS ai_status VARCHAR(20) DEFAULT 'none'
    CHECK (ai_status IN ('none', 'pending', 'processing', 'completed', 'failed')),
ADD COLUMN IF NOT EXISTS ai_summary TEXT,
ADD COLUMN IF NOT EXISTS ai_suggestions JSONB,
ADD COLUMN IF NOT EXISTS confirm_status VARCHAR(20) DEFAULT 'unconfirmed'
    CHECK (confirm_status IN ('unconfirmed', 'confirmed', 'rejected')),
ADD COLUMN IF NOT EXISTS confirmed_by BIGINT,
ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS source_data_ref JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS error_message TEXT,
-- 以下字段为预留，Sprint3 不实现
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS parent_report_id BIGINT,
ADD COLUMN IF NOT EXISTS report_status VARCHAR(20) DEFAULT 'active'
    CHECK (report_status IN ('active', 'archived', 'deleted'));
```

### 3.3 Sprint3 实际使用字段清单（8 个核心字段）

| 字段 | 用途 | Sprint3 是否使用 |
|------|------|----------------|
| `template_id` | 关联模板 | ✅ 是 |
| `template_category` | 报告分类 | ✅ 是 |
| `generation_status` | 生成状态 | ✅ 是 |
| `ai_status` | AI 状态 | ✅ 是 |
| `ai_summary` | AI 综述 | ✅ 是 |
| `ai_suggestions` | AI 建议 | ✅ 是 |
| `confirm_status` | 确认状态 | ✅ 是 |
| `source_data_ref` | 来源引用 | ✅ 是 |
| `version` / `parent_report_id` | 版本管理 | ⏸️ 预留，不实现 |
| `report_status` | 软删除状态 | ✅ 是（删除改为 archived/deleted） |

### 3.4 新增索引

```sql
CREATE INDEX IF NOT EXISTS idx_hse_reports_template_category ON hse_reports(template_category);
CREATE INDEX IF NOT EXISTS idx_hse_reports_generation_status ON hse_reports(generation_status);
CREATE INDEX IF NOT EXISTS idx_hse_reports_confirm_status ON hse_reports(confirm_status);
CREATE INDEX IF NOT EXISTS idx_hse_reports_template_id ON hse_reports(template_id);
CREATE INDEX IF NOT EXISTS idx_hse_reports_report_status ON hse_reports(report_status);
```

### 3.5 删除策略（状态管理）

**禁止物理删除**。通过 `report_status` 字段管理：

| report_status | 说明 | 前端可见性 |
|---------------|------|-----------|
| `active` | 正常 | 正常展示 |
| `archived` | 已归档 | 归档列表中可见 |
| `deleted` | 已删除 | 仅回收站可见（Sprint3 可不做回收站 UI，只改状态） |

删除接口改为 `UPDATE ... SET report_status = 'deleted'`。

### 3.6 source_data_ref 结构

```json
{
  "statistics_period": "2026-06",
  "referenced_documents": [
    {
      "file_id": 123,
      "file_name": "安全生产责任制.pdf",
      "ai_analysis_id": 45,
      "ai_summary_excerpt": "该文件规定了..."
    }
  ],
  "event_count": 12,
  "hazard_count": 28,
  "accident_count": 0,
  "training_count": 5,
  "task_completion_rate": 92.5
}
```

---

## 4. 报告模板设计

### 4.1 安全生产月报模板结构

```json
{
  "sections": [
    {
      "key": "overview",
      "title": "一、本月安全工作概述",
      "type": "ai_summary",
      "required": true
    },
    {
      "key": "indicators",
      "title": "二、安全指标完成情况",
      "type": "data_chart",
      "required": true,
      "metrics": ["event_count", "hazard_count", "rectification_rate", "training_count"]
    },
    {
      "key": "key_work",
      "title": "三、重点工作回顾",
      "type": "data_list",
      "required": true,
      "subsections": ["隐患排查治理", "安全教育培训", "应急管理", "安全检查"]
    },
    {
      "key": "problems",
      "title": "四、存在的主要问题",
      "type": "ai_analysis",
      "required": false
    },
    {
      "key": "compliance",
      "title": "五、制度依据与合规性",
      "type": "document_reference",
      "required": false
    },
    {
      "key": "next_plan",
      "title": "六、下月工作计划",
      "type": "ai_suggestion",
      "required": false
    },
    {
      "key": "appendix",
      "title": "七、附件",
      "type": "appendix",
      "required": false
    }
  ]
}
```

### 4.2 集团/区域汇报材料模板结构

```json
{
  "sections": [
    {
      "key": "executive_summary",
      "title": "一、工作总体情况",
      "type": "ai_summary",
      "required": true
    },
    {
      "key": "key_work",
      "title": "二、重点工作开展情况",
      "type": "data_list",
      "required": true,
      "subsections": ["责任落实", "风险管控", "隐患治理", "培训教育", "应急管理"]
    },
    {
      "key": "highlights",
      "title": "三、亮点工作",
      "type": "ai_highlights",
      "required": false
    },
    {
      "key": "problems",
      "title": "四、存在的问题与不足",
      "type": "ai_analysis",
      "required": true
    },
    {
      "key": "action_plan",
      "title": "五、下一步工作计划",
      "type": "ai_suggestion",
      "required": true
    },
    {
      "key": "coordination",
      "title": "六、需协调解决的事项",
      "type": "free_text",
      "required": false
    }
  ]
}
```

---

## 5. AI 生成设计

### 5.1 新增 Prompt 模板（2 个）

在 `aiService.js` 的 `PROMPT_TEMPLATES` 中新增：

| 模板 Key | 用途 | 输出结构 |
|---------|------|---------|
| `report_monthly` | 安全生产月报 AI 生成 | JSON：summary, key_indicators_text, problems, suggestions, next_plan |
| `report_group` | 集团汇报材料 AI 生成 | JSON：executive_summary, highlights, problems, action_plan |

### 5.2 AI Prompt 强约束（必须遵守）

**每个 Prompt 开头必须包含以下约束声明**：

```
【强约束规则】
1. 你是安全生产管理系统的AI助手，仅基于提供的数据进行分析。
2. 禁止编造任何数据。如果某项数据缺失或为零，必须明确说明"暂无数据"或"本月无相关记录"。
3. 所有数字必须与提供的原始数据完全一致，不得估算、推断或夸大。
4. 分析结论必须有数据支撑，无数据支撑的内容不得输出。
5. 建议内容必须基于实际问题，无问题时输出"本月未发现突出问题，建议持续保持"。
6. 语言风格：正式、客观、简洁，符合政府/企业公文规范。
7. 输出格式：严格按照指定 JSON 结构返回，不得增减字段。
```

### 5.3 资料中心数据注入

**注入方式**：在 Prompt 中增加「相关制度文件」段落

```
【相关制度文件】（供参考引用）
1. 《安全生产责任制》（文档ID: 123）
   AI分析摘要：该文件规定了各级人员安全生产职责...
2. 《隐患排查治理制度》（文档ID: 124）
   AI分析摘要：该文件明确了隐患排查频率和整改要求...

要求：在分析和建议中可适当引用上述制度作为依据，但不得编造制度内容。
```

**获取逻辑**：
1. 根据报告类型关键词（如"安全生产""隐患""培训"）检索资料中心文档标题
2. 匹配 `document_ai_analysis` 中已完成的 AI 分析
3. 取 Top 3-5 条，提取文件名和 AI 摘要片段注入 Prompt

### 5.4 AI 调用流程

```
reportService.generateReportV2()
  ↓
1. 采集业务数据（数据库查询）
2. 匹配资料中心文档（关键词检索）
3. 组装结构化数据对象
  ↓
aiService.buildMonthlyReportPrompt(data, docs)
  ↓
aiService.chat(prompt)
  ↓
parseAiResponse() → 严格 JSON 校验
  ├─ 成功 → 写入 ai_summary / ai_suggestions
  └─ 失败 → ai_status = 'failed'，记录 error_message
           （不影响整体报告生成，报告仍可用，只是无 AI 内容）
```

**降级策略**：AI 失败不影响报告主体生成，报告数据部分正常展示，AI 区域显示「AI 分析暂不可用」。

---

## 6. 后端接口设计

### 6.1 接口总览

| 方法 | 路径 | 说明 | 权限 | Sprint3 |
|------|------|------|------|---------|
| GET | `/api/hse/report/templates` | 获取模板列表（按分类筛选） | 登录 | ✅ |
| GET | `/api/hse/report/templates/:id` | 获取模板详情 | 登录 | ✅ |
| POST | `/api/hse/report/generate-v2` | 触发报告生成（异步） | admin / safety_manager | ✅ |
| GET | `/api/hse/report/:id/status` | 查询生成状态 | 登录 | ✅ |
| GET | `/api/hse/report/list` | 报告列表（分类 + 分页 + 搜索） | 登录 | ✅ |
| GET | `/api/hse/report/:id` | 报告详情 | 登录 | ✅ |
| PUT | `/api/hse/report/:id` | 编辑报告内容（标题/章节文本） | admin / safety_manager | ✅ |
| POST | `/api/hse/report/:id/confirm` | 确认 / 驳回 | admin / safety_manager | ✅ |
| POST | `/api/hse/report/:id/regenerate` | 重新生成（AI 重跑） | admin / safety_manager | ✅ |
| POST | `/api/hse/report/:id/archive` | 归档 | admin / safety_manager | ✅ |
| DELETE | `/api/hse/report/:id` | 删除（软删除，report_status='deleted'） | admin | ✅ |
| GET | `/api/hse/report/:id/export/html` | 导出 HTML（用于打印） | 登录 | ✅ |
| GET | `/api/hse/report/:id/export/word` | 导出 Word | 登录 | ✅ |

> 原有 `/api/hse/report/generate`、`/api/hse/report/history` 等接口**完全保留**，不做破坏性修改。

### 6.2 关键接口详情

#### 6.2.1 触发生成

`POST /api/hse/report/generate-v2`

**请求**：
```json
{
  "templateId": 5,
  "templateCategory": "monthly_report",
  "reportPeriod": "2026-06",
  "reportScope": { "department": "全部" },
  "aiEnabled": true,
  "customTitle": "2026年6月份安全生产月报"
}
```

**响应**：
```json
{
  "code": 200,
  "data": {
    "reportId": 123,
    "generationStatus": "pending",
    "estimatedSeconds": 30
  }
}
```

#### 6.2.2 生成状态轮询

`GET /api/hse/report/:id/status`

```json
{
  "code": 200,
  "data": {
    "reportId": 123,
    "generationStatus": "completed",
    "aiStatus": "completed",
    "confirmStatus": "unconfirmed",
    "currentStep": "报告生成完成",
    "progress": 100
  }
}
```

#### 6.2.3 报告列表

`GET /api/hse/report/list?category=monthly_report&page=1&pageSize=20&keyword=6月`

#### 6.2.4 导出 HTML

`GET /api/hse/report/:id/export/html`

- 返回完整 HTML 页面（含打印样式 `@media print`）
- 浏览器可直接打印 / 另存为 PDF
- Content-Type: `text/html; charset=utf-8`

#### 6.2.5 导出 Word

`GET /api/hse/report/:id/export/word`

**实现方案（零新增依赖）**：
- 利用现有能力，生成 **Word 兼容的 HTML**（`.doc` 格式）
- Word 可以直接打开 HTML 格式的 .doc 文件
- 设置 Content-Type: `application/msword`
- Content-Disposition: `attachment; filename="report.doc"`

```
生成逻辑：
report_html（现有） + Word 专用样式 + 页面设置
  → 包装为 .doc（HTML 格式，Word 可识别）
  → 浏览器下载
```

> 不使用 html-docx 等第三方库，纯 HTML + MIME 类型实现。

---

## 7. 前端页面设计

### 7.1 页面结构

**改造 `views/hse/reports/index.vue`**，从占位页升级为完整汇报中心。

```
┌────────────────────────────────────────────────────────┐
│  顶部统计栏（4个StatCard）                                  │
│  [报告总数] [本月生成] [待确认] [模板数]                   │
├────────────────────────────────────────────────────────┤
│  ┌─ Tab 切换 ────────────────────────────────────────┐ │
│  │  安全生产月报  │  集团汇报材料  │  全部报告         │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  ┌ 当前 Tab 内容区 ──────────────────────────────────┐ │
│  │                                                    │ │
│  │ 【安全生产月报 Tab】                                │ │
│  │  ┌─ 生成卡片 ─────────────────────────────────┐   │ │
│  │  │  月份：[2026-06 ▼]  [ ] 启用AI辅助分析      │   │ │
│  │  │                    [ 生成月报 ] 按钮         │   │ │
│  │  └──────────────────────────────────────────┘   │ │
│  │                                                    │ │
│  │  ┌─ 历史列表 ─────────────────────────────────┐   │ │
│  │  │  标题    │  周期    │ 状态   │ AI │ 操作    │   │ │
│  │  │ 6月月报 │ 2026-06 │待确认 │ ✅ │ 查看/导出 │   │ │
│  │  │ 5月月报 │ 2026-05 │已确认 │ ✅ │ 查看/导出 │   │ │
│  │  └──────────────────────────────────────────┘   │ │
│  └──────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

### 7.2 报告查看器（抽屉）

```
┌──────────────────────────────────────────────────┐
│  2026年6月份安全生产月报              [导出▼] [✕]  │
│                                   HTML打印/Word │
├──────────────────────────────────────────────────┤
│  状态: [已确认]  AI: [已完成]  生成时间: ...       │
│                                                  │
│  ┌─ 报告预览区（滚动HTML渲染）──────────────────┐ │
│  │                                             │ │
│  │  一、本月安全工作概述                         │ │
│  │  本月安全生产形势总体平稳，共发生安全事件...   │ │
│  │                                             │ │
│  │  二、安全指标完成情况                         │ │
│  │  [数据表格 / 简单图表]                       │ │
│  │                                             │ │
│  └─────────────────────────────────────────────┘ │
│                                                  │
│  ┌─ AI 辅助提示 ───────────────────────────────┐ │
│  │  ⚠️ 本报告含 AI 辅助生成内容，仅供参考        │ │
│  │  [查看数据来源]  （展开引用的文档/统计数据）   │ │
│  └─────────────────────────────────────────────┘ │
│                                                  │
│  底部操作栏：                                     │
│  [编辑内容]  [重新生成AI]  [确认发布]  [删除]     │
└──────────────────────────────────────────────────┘
```

### 7.3 组件清单（全部页面级，不入公共组件库）

```
apps/web-antd/src/views/hse/reports/
├── index.vue                         # 主页面（Tab 容器 + 统计卡片）
└── components/
    ├── ReportGeneratorCard.vue       # 报告生成配置卡片（通用）
    ├── ReportListTable.vue           # 报告列表表格
    ├── ReportViewerDrawer.vue        # 报告查看抽屉（含预览+操作）
    └── ExportDropdown.vue            # 导出下拉菜单（小组件）
```

**位置约束**：所有组件只能放在 `views/hse/reports/components/` 目录下，禁止进入 `components/` 等公共组件目录。

### 7.4 导出功能前端实现

- **HTML 打印**：新窗口打开 `export/html` 返回的 HTML，调用 `window.print()`
- **Word 导出**：直接访问 `export/word` 接口，浏览器自动下载 .doc 文件

### 7.5 三个 Tab 详情

| Tab | 核心内容 |
|-----|---------|
| **安全生产月报** | 月份选择 + AI开关 + 生成按钮 + 月度历史列表 |
| **集团汇报材料** | 周期选择 + 范围选择 + 生成按钮 + 历史列表 |
| **全部报告** | 分类筛选 + 搜索 + 完整列表（含归档/删除筛选） |

---

## 8. 修改文件清单

### 8.1 后端文件（4 个）

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `server/sql/hse_report_v53_migration.sql` | **新增** | 数据库迁移脚本（ALTER 扩展两表 + 新增索引 + 插入2个模板） |
| `server/services/aiService.js` | 修改 | 新增 2 个 report Prompt 模板 + build 方法 |
| `server/services/reportService.js` | 修改 | 新增 V2 生成流程：异步任务、数据采集、AI 调用、资料注入、导出 |
| `server/routes/hse-report.js` | 修改 | 新增 V2 接口（模板、生成、状态、列表、详情、编辑、确认、重生成、归档、删除、导出） |

### 8.2 前端文件（7 个）

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `apps/web-antd/src/api/hse/reports.ts` | 修改 | 新增 V2 API 函数 + TypeScript 类型 |
| `apps/web-antd/src/views/hse/reports/index.vue` | **重写** | 从占位页改为完整汇报中心（3 Tab + 统计 + 列表） |
| `apps/web-antd/src/views/hse/reports/components/ReportGeneratorCard.vue` | **新增** | 报告生成配置卡片 |
| `apps/web-antd/src/views/hse/reports/components/ReportListTable.vue` | **新增** | 报告列表表格 |
| `apps/web-antd/src/views/hse/reports/components/ReportViewerDrawer.vue` | **新增** | 报告查看抽屉 |
| `apps/web-antd/src/views/hse/reports/components/ExportDropdown.vue` | **新增** | 导出下拉菜单 |
| `apps/web-antd/src/locales/langs/zh-CN/hse.json` | 修改 | 新增汇报中心相关翻译 |

### 8.3 统计

- 后端：新增 1 + 修改 3 = **4 个**
- 前端：新增 4 + 修改 3 = **7 个**
- **合计：11 个文件**

---

## 9. 风险分析与应对

### 9.1 技术风险

| 风险 | 等级 | 应对措施 |
|------|------|---------|
| AI 编造数据 | 高 | Prompt 强约束 + "暂无数据"规则 + 人工确认必填 |
| AI 调用失败 | 中 | 降级策略：AI 失败不影响报告主体，仅 AI 区域不可用 |
| Word 导出格式兼容 | 中 | 使用 HTML 格式 .doc，主流 Word 版本兼容；格式问题用户可手动调整 |
| 报告 HTML 渲染复杂 | 低 | 复用 reportService 已有 generateHtmlReport，逐步优化样式 |

### 9.2 业务风险

| 风险 | 等级 | 应对措施 |
|------|------|---------|
| 报告模板不符合实际业务 | 高 | MVP 先出 2 类，快速迭代；预留模板配置化能力 |
| 数据来源不完整 | 中 | 报告中明确标注"统计范围"和"数据截止时间" |
| 用户过度依赖 AI | 中 | UI 显著提示 + 强制人工确认流程 |

### 9.3 合规风险

| 风险 | 等级 | 应对措施 |
|------|------|---------|
| 敏感数据外传 | 高 | 支持 Ollama 本地模式；可配置关闭 AI；Prompt 脱敏 |
| 报告版本混乱 | 低 | Sprint3 预留字段不实现，后续迭代再做版本管理 |

### 9.4 依赖风险

- **零新增 npm 依赖**
- 复用：dayjs（日期处理）、xlsx（已存在，本次不直接用但属于既有依赖）
- AI 调用：复用 aiService.js 现有 http/https 原生实现

---

## 10. 开发顺序建议

| 阶段 | 内容 | 产出 |
|------|------|------|
| Phase 1 | 数据库迁移 + 模板初始化 | SQL 脚本 |
| Phase 2 | aiService 新增 2 个 Prompt + 解析逻辑 | aiService.js 修改 |
| Phase 3 | reportService V2 核心：数据采集 + 异步生成 | reportService.js 修改 |
| Phase 4 | reportService 扩展：AI 注入 + 资料引用 + 导出 | reportService.js 修改 |
| Phase 5 | 后端 API 路由 | hse-report.js 修改 |
| Phase 6 | 前端 API 层 + 类型定义 | reports.ts 修改 |
| Phase 7 | 前端主页面 + 4 个业务组件 | Vue 组件 |
| Phase 8 | 整体联调 + 测试 | 测试报告 |

---

**文档结束**

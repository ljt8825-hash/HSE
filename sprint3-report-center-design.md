# HSE V2 Sprint3 安全生产汇报中心设计方案

> 版本：v1.0  
> 日期：2026-07-19  
> 状态：设计稿（待审核）

---

## 0. 设计前提与继承关系

### 0.1 现有系统基础

Sprint3 **不新建报告体系**，而是在已有 v5.2 报告中心基础上进行深度升级。现有基础：

| 模块 | 现有状态 | 升级方向 |
|------|---------|---------|
| `hse_report_templates` 表 | 日/周/月/年 4 种基础模板 | 扩展为 5 类业务模板 + AI 增强 |
| `hse_reports` 表 | 基础数据 + HTML 存储 | 扩展 AI 生成字段、生成状态、来源数据引用 |
| `reportService.js` | 纯数据聚合 + HTML 生成 | 增加 AI 文案润色、资料数据注入、结构化解析 |
| `aiService.js` | 已有 3 个 report 模板（hazard/accident/training） | 新增 5 个汇报中心专用 Prompt |
| 前端 `reports/index.vue` | 占位页面（4 个卡片 + 提示"开发中"） | 完整实现汇报中心 UI |

### 0.2 核心设计原则

1. **复用优先**：最大化复用现有 `hse_reports`、`hse_report_templates`、`reportService.js`，不新建平行表
2. **AI 辅助，人工确认**：AI 生成内容标记为「待确认」，最终版本需人工审核
3. **资料驱动**：自动从资料中心（Sprint1）和 AI 分析结果（Sprint2）引用制度依据
4. **历史留存**：每次生成都留痕，支持对比、回溯、版本管理
5. **不新增依赖**：继续遵守不新增 npm 包约束

---

## 1. 业务流程

### 1.1 整体流程

```
用户选择报告类型
       ↓
配置报告参数（周期、范围、模板）
       ↓
触发生成（异步任务）
       ↓
┌──────────────────────────────────┐
│  数据采集阶段                       │
│  ├─ 业务统计数据（事件/隐患/培训等）  │
│  ├─ 资料中心数据（制度/规程引用）     │
│  └─ AI分析结果（文档风险评估摘要）    │
└──────────────────────────────────┘
       ↓
┌──────────────────────────────────┐
│  AI 生成阶段                        │
│  ├─ 结构化数据 → 自然语言综述        │
│  ├─ 趋势分析与对比                   │
│  ├─ 问题诊断与建议                   │
│  └─ 制度依据匹配（引用资料中心）      │
└──────────────────────────────────┘
       ↓
生成初稿（status = draft）
       ↓
人工预览/编辑/确认
       ↓
确认发布（status = published）
       ↓
归档留存 / 导出 / 分享
```

### 1.2 五类报告业务流程差异

| 报告类型 | 数据来源侧重 | AI 增强点 | 典型使用场景 |
|---------|-------------|----------|-------------|
| **安全生产月报** | 事件统计、隐患整改、任务完成、风险变化、培训记录 | 月度趋势分析、环比同比、下月工作建议 | 每月 5 号前生成上月月报 |
| **集团/区域汇报材料** | 多维度汇总、关键指标、亮点/问题、典型案例 | 高层视角提炼、重点突出、数据可视化建议 | 向集团/上级单位汇报 |
| **安全检查总结** | 检查记录、发现隐患、整改跟踪、检查评分 | 检查质量评估、高频问题归纳、整改建议 | 季度/专项检查后生成 |
| **隐患整改分析报告** | 隐患台账、整改率、逾期分析、重复隐患、风险分级 | 隐患根源分析、重点关注单位、预防建议 | 月度/季度隐患复盘 |
| **培训情况报告** | 培训计划、完成率、出勤率、考试成绩、培训档案 | 培训效果评估、薄弱环节识别、改进建议 | 季度/年度培训总结 |

---

## 2. 数据模型设计

### 2.1 扩展 `hse_report_templates` 表

**扩展字段（ALTER TABLE 追加）**：

```sql
-- 扩展报告模板表（在现有 4 字段基础上新增）
ALTER TABLE hse_report_templates 
ADD COLUMN IF NOT EXISTS template_category VARCHAR(30) DEFAULT 'statistical'
    CHECK (template_category IN (
        'statistical',      -- 统计报表（原有日/周/月/年）
        'monthly_report',   -- 安全生产月报
        'group_report',     -- 集团/区域汇报
        'inspection_summary', -- 安全检查总结
        'hazard_analysis',   -- 隐患整改分析
        'training_report'    -- 培训情况报告
    )),
ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS prompt_template TEXT,
ADD COLUMN IF NOT EXISTS data_sources JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS section_config JSONB DEFAULT '[]';
```

**字段说明**：
- `template_category`：模板大类，区分原有统计报表和新增 5 类业务汇报
- `ai_enabled`：是否启用 AI 生成
- `prompt_template`：AI Prompt 模板（覆盖 aiService 中的默认模板）
- `data_sources`：需要采集的数据源配置（JSON 数组）
- `section_config`：报告章节配置（比原有 content_config 更细粒度）

### 2.2 扩展 `hse_reports` 表

**扩展字段（ALTER TABLE 追加）**：

```sql
-- 扩展报告记录表
ALTER TABLE hse_reports
ADD COLUMN IF NOT EXISTS template_id BIGINT,
ADD COLUMN IF NOT EXISTS template_category VARCHAR(30)
    CHECK (template_category IN (
        'statistical', 'monthly_report', 'group_report',
        'inspection_summary', 'hazard_analysis', 'training_report'
    )),
ADD COLUMN IF NOT EXISTS report_scope JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS generation_status VARCHAR(20) DEFAULT 'completed'
    CHECK (generation_status IN ('pending', 'collecting', 'ai_generating', 'completed', 'failed')),
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
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS parent_report_id BIGINT;
```

**关键字段说明**：
- `template_id`：关联使用的模板
- `template_category`：报告大类（冗余，方便查询）
- `report_scope`：报告范围（周期、部门、项目等，JSON 结构）
- `generation_status`：生成流程状态（异步任务跟踪）
- `ai_status`：AI 生成独立状态
- `ai_summary` / `ai_suggestions`：AI 生成的综述和建议
- `confirm_status`：人工确认状态（AI 只是辅助）
- `source_data_ref`：来源数据引用（指向用到的资料文档、AI 分析记录等）
- `version` / `parent_report_id`：版本管理（同一报告多次生成留痕）

### 2.3 新增索引

```sql
CREATE INDEX IF NOT EXISTS idx_hse_reports_template_category ON hse_reports(template_category);
CREATE INDEX IF NOT EXISTS idx_hse_reports_generation_status ON hse_reports(generation_status);
CREATE INDEX IF NOT EXISTS idx_hse_reports_confirm_status ON hse_reports(confirm_status);
CREATE INDEX IF NOT EXISTS idx_hse_reports_template_id ON hse_reports(template_id);
```

### 2.4 数据来源引用结构（source_data_ref）

```json
{
  "statistics_period": "2026-06",
  "referenced_documents": [
    { "file_id": 123, "file_name": "安全生产责任制.pdf", "ai_analysis_id": 45 }
  ],
  "hazard_ids": [101, 102, 103],
  "training_ids": [201, 202],
  "inspection_ids": [301, 302],
  "event_ids": [401, 402]
}
```

---

## 3. 报告模板设计

### 3.1 安全生产月报模板

```
# 安全生产月报 - {年月}

## 一、本月安全工作概述
（AI 生成：总体情况、关键指标、与上月对比）

## 二、安全指标完成情况
（数据统计图表：事件数、隐患数、整改率、培训完成率）

## 三、重点工作回顾
1. 隐患排查治理
2. 安全教育培训
3. 应急管理
4. 安全检查

## 四、存在的主要问题
（AI 分析：突出问题、趋势预警、根源分析）

## 五、制度依据与合规性
（自动引用资料中心相关制度文件）

## 六、下月工作计划
（AI 生成：针对性改进建议、重点关注事项）

## 七、附件
- 隐患清单
- 培训记录
- 检查报告
```

### 3.2 集团/区域汇报材料模板

```
# {单位名称}安全生产工作汇报

## 一、工作总体情况
（高层视角：关键指标、整体评价、亮点工作）

## 二、重点工作开展情况
1. 责任落实
2. 风险管控
3. 隐患治理
4. 培训教育
5. 应急管理

## 三、存在的问题与不足
（提炼 3-5 个核心问题，附典型案例）

## 四、下一步工作计划
（明确目标、具体措施、时间节点）

## 五、需协调解决的事项
（可选）
```

### 3.3 安全检查总结模板

```
# {检查名称}工作总结

## 一、检查基本情况
- 检查时间
- 检查范围/单位
- 检查人员
- 检查方式

## 二、检查发现问题汇总
（分类统计：一般隐患/重大隐患、按类型分布、按单位分布）

## 三、典型问题分析
（AI 深度分析：高频问题、根源原因、风险评估）

## 四、整改要求与建议
（分单位整改清单 + 系统性改进建议）

## 五、检查结论与评价
（整体评分、排名、优秀/落后单位）
```

### 3.4 隐患整改分析报告模板

```
# 隐患整改分析报告

## 一、隐患概况
- 本期新增隐患数
- 累计待整改隐患数
- 整改完成率
- 逾期隐患数

## 二、隐患分类分析
1. 按类型分布
2. 按风险等级分布
3. 按单位/区域分布
4. 按发现渠道分布

## 三、整改情况分析
1. 整改及时率趋势
2. 逾期隐患分析
3. 重复隐患分析
4. 重大隐患跟踪

## 四、AI 诊断与建议
（根源分析、重点关注单位、预防措施建议）

## 五、工作建议
```

### 3.5 培训情况报告模板

```
# 安全培训情况报告

## 一、培训基本情况
- 培训计划数 vs 实际完成数
- 培训场次、参训人次
- 培训完成率

## 二、培训分类统计
1. 按培训类型（三级安全教育、专项培训、日常教育等）
2. 按岗位/工种
3. 按部门/单位

## 三、培训效果评估
1. 考试合格率
2. 出勤率分析
3. 培训满意度
4. 薄弱环节识别（AI 分析）

## 四、典型培训案例
（亮点培训分享）

## 五、改进建议与下阶段计划
```

---

## 4. AI 生成流程

### 4.1 AI 生成整体架构

```
结构化业务数据
      +
资料中心文档引用
      +
AI 分析结果摘要
      ↓
┌─────────────────────┐
│  数据预处理与组装      │
│  （reportService）    │
└─────────────────────┘
      ↓
┌─────────────────────┐
│  aiService.js        │
│  ├─ 构建 Prompt      │
│  ├─ 调用 LLM         │
│  └─ 解析返回结果      │
└─────────────────────┘
      ↓
结构化 AI 输出
（summary + suggestions + referenced_docs）
```

### 4.2 新增 Prompt 模板

**在 aiService.js 的 PROMPT_TEMPLATES 中新增 5 个模板：**

| 模板 Key | 用途 | 输入 | 输出格式 |
|---------|------|------|---------|
| `report_monthly` | 安全生产月报 AI 生成 | 月度统计数据 + 资料引用 | JSON：summary, key_indicators, problems, suggestions, next_plan |
| `report_group` | 集团汇报材料 AI 生成 | 汇总数据 + 亮点/问题 | JSON：executive_summary, highlights, issues, action_plan |
| `report_inspection` | 检查总结 AI 生成 | 检查数据 + 隐患列表 | JSON：overview, key_findings, root_causes, recommendations |
| `report_hazard_analysis` | 隐患分析 AI 生成 | 隐患统计 + 趋势数据 | JSON：overview, category_analysis, root_causes, focus_areas, prevention |
| `report_training` | 培训报告 AI 生成 | 培训统计 + 成绩数据 | JSON：overview, effectiveness, weak_points, improvements, next_plan |

### 4.3 AI Prompt 设计原则

1. **结构化输出**：所有 Prompt 强制要求返回 JSON，包含明确字段
2. **数据驱动**：AI 基于提供的统计数据生成，不凭空编造
3. **制度引用**：自动关联资料中心的相关制度文件（通过关键词匹配 + AI 分析结果）
4. **保守表述**：AI 结论标注「AI 辅助分析，仅供参考」
5. **可审核**：保留数据来源引用，可追溯到原始数据

### 4.4 资料中心数据注入方式

```
在 Prompt 中增加「制度依据」段落：

【相关制度文件】
1. 《安全生产责任制》（文档ID: 123）- AI分析摘要：...
2. 《隐患排查治理制度》（文档ID: 124）- AI分析摘要：...
3. 《安全教育培训制度》（文档ID: 125）- AI分析摘要：...

要求：在分析和建议中适当引用上述制度依据。
```

**获取方式**：
- 根据报告类型关键词检索资料中心文档标题
- 读取 `document_ai_analysis` 中的 AI 摘要
- 将相关文档摘要注入 Prompt 上下文

---

## 5. 后端接口设计

### 5.1 接口总览

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/hse/report/templates` | 获取报告模板列表 | 登录 |
| GET | `/api/hse/report/templates/:id` | 获取模板详情 | 登录 |
| POST | `/api/hse/report/generate-v2` | 触发报告生成（V2，异步） | admin/safety_manager |
| GET | `/api/hse/report/:id/status` | 查询生成状态 | 登录 |
| GET | `/api/hse/report/list` | 报告列表（支持分类筛选） | 登录 |
| GET | `/api/hse/report/:id` | 报告详情 | 登录 |
| PUT | `/api/hse/report/:id` | 编辑报告内容 | admin/safety_manager |
| POST | `/api/hse/report/:id/confirm` | 确认发布报告 | admin/safety_manager |
| POST | `/api/hse/report/:id/regenerate` | 重新生成 | admin/safety_manager |
| DELETE | `/api/hse/report/:id` | 删除报告 | admin |

> 注：原有 `/api/hse/report/generate`、`/api/hse/report/history` 等接口**保留兼容**，新功能走 v2 接口。

### 5.2 关键接口详情

#### 5.2.1 获取报告模板列表

`GET /api/hse/report/templates?category=monthly_report`

**响应**：
```json
{
  "code": 200,
  "data": [
    {
      "id": 5,
      "templateName": "安全生产月报模板",
      "templateCategory": "monthly_report",
      "reportType": "monthly",
      "aiEnabled": true,
      "status": "active",
      "description": "自动汇总月度安全数据，AI辅助生成分析报告"
    }
  ]
}
```

#### 5.2.2 触发报告生成（异步）

`POST /api/hse/report/generate-v2`

**请求体**：
```json
{
  "templateId": 5,
  "templateCategory": "monthly_report",
  "reportPeriod": "2026-06",
  "reportScope": {
    "department": "全部",
    "project": null
  },
  "aiEnabled": true,
  "customTitle": "6月份安全生产月报"
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

#### 5.2.3 查询生成状态

`GET /api/hse/report/:id/status`

**响应**：
```json
{
  "code": 200,
  "data": {
    "reportId": 123,
    "generationStatus": "ai_generating",
    "aiStatus": "processing",
    "progress": 65,
    "currentStep": "AI 正在生成分析建议..."
  }
}
```

#### 5.2.4 报告详情

`GET /api/hse/report/:id`

**响应**：
```json
{
  "code": 200,
  "data": {
    "id": 123,
    "reportName": "6月份安全生产月报",
    "templateCategory": "monthly_report",
    "reportPeriod": "2026-06",
    "reportData": { ... },
    "reportHtml": "<html>...</html>",
    "aiSummary": "本月安全生产形势总体平稳...",
    "aiSuggestions": ["建议加强...", "重点关注..."],
    "confirmStatus": "unconfirmed",
    "generationStatus": "completed",
    "sourceDataRef": { ... },
    "version": 1,
    "createdAt": "2026-07-05T10:30:00Z"
  }
}
```

#### 5.2.5 确认发布报告

`POST /api/hse/report/:id/confirm`

**请求体**：
```json
{
  "action": "confirm",
  "remark": "数据准确，同意发布"
}
```

---

## 6. 前端页面设计

### 6.1 页面结构

**改造现有 `views/hse/reports/index.vue`**，从占位页改为完整汇报中心：

```
┌──────────────────────────────────────────────────┐
│  顶部统计栏（4个StatCard）                           │
│  [报告总数] [本月生成] [待确认] [模板数]            │
├──────────────────────────────────────────────────┤
│  ┌─ Tab 切换 ──────────────────────────────────┐ │
│  │  月报  │  集团汇报  │  检查总结  │  隐患分析  │ │
│  │  培训报告  │  历史报告                         │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  ┌──────────────────────────────────────────────┐ │
│  │  当前 Tab 内容区                                │ │
│  │                                                │ │
│  │  【月报 Tab】                                    │ │
│  │  ┌ 报告生成卡片 ──────────────────────────┐   │ │
│  │  │ 选择月份: [2026-06 ▼]  [生成月报] 按钮  │   │ │
│  │  └───────────────────────────────────────┘   │ │
│  │                                                │ │
│  │  ┌ 最近生成列表 ──────────────────────────┐   │ │
│  │  │  月份    │  状态     │  生成时间 │ 操作 │   │ │
│  │  │ 2026-06 │ 待确认   │ 07-05    │ 查看 │   │ │
│  │  │ 2026-05 │ 已确认   │ 06-05    │ 查看 │   │ │
│  │  └───────────────────────────────────────┘   │ │
│  └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

### 6.2 报告查看器（抽屉/弹窗）

```
┌───────────────────────────────────────────┐
│  6月份安全生产月报                [导出] [✕] │
├───────────────────────────────────────────┤
│  状态标签: [AI生成 · 待确认]                │
│                                           │
│  ┌─ 报告预览区（iframe / HTML渲染）──────┐ │
│  │                                      │ │
│  │  一、本月安全工作概述                   │ │
│  │  （AI生成的综述内容...）                │ │
│  │                                      │ │
│  │  二、安全指标完成情况                   │ │
│  │  [图表]                               │ │
│  │                                      │ │
│  └──────────────────────────────────────┘ │
│                                           │
│  ┌─ AI 辅助信息 ────────────────────────┐ │
│  │  ⚠️ 本报告含 AI 辅助生成内容，请人工核实 │ │
│  │  [查看AI建议]  [查看数据来源]          │ │
│  └──────────────────────────────────────┘ │
│                                           │
│  [编辑内容]  [重新生成]  [确认发布]        │
└───────────────────────────────────────────┘
```

### 6.3 五分类 Tab 设计

| Tab | 核心组件 | 主要操作 |
|-----|---------|---------|
| **月报** | 月份选择器 + 生成按钮 + 历史列表 | 生成、查看、确认 |
| **集团汇报** | 汇报类型选择 + 范围选择 + 生成 | 生成、查看、导出 |
| **检查总结** | 检查选择器（下拉多选）+ 生成 | 选择检查项、生成 |
| **隐患分析** | 时间范围 + 筛选条件 + 生成 | 自定义分析维度 |
| **培训报告** | 时间范围 + 培训类型筛选 + 生成 | 按季度/年度生成 |
| **历史报告** | 分类筛选 + 搜索 + 列表 | 查看、编辑、删除 |

### 6.4 组件设计

**新增组件（均为页面级业务组件，不入公共组件库）**：

```
views/hse/reports/
├── index.vue                    # 主页面（Tab 容器）
├── components/
│   ├── ReportGeneratorCard.vue  # 报告生成卡片（各类型通用）
│   ├── ReportHistoryList.vue    # 历史报告列表
│   ├── ReportViewerDrawer.vue   # 报告查看抽屉
│   ├── ReportStatusTag.vue      # 状态标签（小组件，直接写在页面）
│   └── AISuggestionPanel.vue    # AI 建议面板
```

> 注：遵循 Sprint2 经验，不新增大量公共组件，尽量复用 Ant Design Vue 组件。

---

## 7. 修改文件清单

### 7.1 后端文件

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `server/sql/hse_report_v53_migration.sql` | **新增** | Sprint3 数据库迁移脚本（ALTER 扩展表结构 + 新增模板数据） |
| `server/services/aiService.js` | 修改 | 新增 5 个 report Prompt 模板 + 5 个 build 方法 |
| `server/services/reportService.js` | 重构扩展 | 增加 V2 生成流程、AI 调用、资料数据注入、版本管理 |
| `server/routes/hse-report.js` | 修改 | 新增 V2 接口（10 个路由） |

### 7.2 前端文件

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `apps/web-antd/src/api/hse/reports.ts` | 修改 | 新增 V2 API 函数和类型定义 |
| `apps/web-antd/src/views/hse/reports/index.vue` | 重写 | 从占位页改为完整汇报中心 |
| `apps/web-antd/src/views/hse/reports/components/ReportGeneratorCard.vue` | **新增** | 报告生成卡片组件 |
| `apps/web-antd/src/views/hse/reports/components/ReportHistoryList.vue` | **新增** | 历史报告列表组件 |
| `apps/web-antd/src/views/hse/reports/components/ReportViewerDrawer.vue` | **新增** | 报告查看抽屉组件 |
| `apps/web-antd/src/views/hse/reports/components/AISuggestionPanel.vue` | **新增** | AI 建议面板组件 |
| `apps/web-antd/src/locales/langs/zh-CN/hse.json` | 修改 | 新增汇报中心相关翻译 |

### 7.3 文件数量统计

- 后端：新增 1 个 + 修改 3 个 = **4 个**
- 前端：新增 4 个 + 修改 3 个 = **7 个**
- 合计：**11 个文件**

---

## 8. 风险分析

### 8.1 技术风险

| 风险 | 等级 | 影响 | 应对措施 |
|------|------|------|---------|
| AI 生成内容不准确 | 高 | 报告误导决策 | 强制人工确认、AI 内容标注「仅供参考」、保留数据来源 |
| AI 调用超时/失败 | 中 | 报告生成中断 | 异步任务 + 重试机制 + 失败状态回退（纯数据版本） |
| 报告 HTML 渲染复杂 | 中 | 前端展示效果不佳 | 使用简单 HTML + 内联样式，依赖 reportService 生成 |
| 资料中心数据关联不准 | 低 | 制度引用错位 | 关键词匹配 + 人工可调整引用文档 |

### 8.2 业务风险

| 风险 | 等级 | 影响 | 应对措施 |
|------|------|------|---------|
| 报告模板不符合实际业务 | 高 | 生成的报告无法直接使用 | 先出 MVP 版本，根据反馈迭代模板 |
| 数据来源不完整 | 中 | 报告缺项、分析片面 | 在报告中标注数据范围，缺失项明确说明 |
| 用户过度依赖 AI | 中 | 放松人工审核 | UI 显著提示「AI 辅助，需人工确认」，流程强制确认 |

### 8.3 合规与安全风险

| 风险 | 等级 | 影响 | 应对措施 |
|------|------|------|---------|
| 敏感数据外传（调用外部 LLM） | 高 | 数据泄露 | 1. 支持 Ollama 本地模式；2. Prompt 中脱敏处理；3. 配置项可关闭 AI |
| 报告版本管理混乱 | 低 | 历史追溯困难 | version + parent_report_id 机制，清晰版本链 |

### 8.4 依赖风险

- **无新增 npm 依赖**：全部使用现有库（dayjs、xlsx 等）
- AI 服务继续复用 Sprint2 的 `aiService.js` 架构

---

## 9. 实施建议（开发顺序）

| 阶段 | 内容 | 预计工作量 |
|------|------|-----------|
| Phase 1 | 数据库迁移 + reportService V2 核心逻辑 | 后端 30% |
| Phase 2 | aiService 新增 5 个 Prompt + 解析 | 后端 15% |
| Phase 3 | 后端 API 路由 + 联调测试 | 后端 25% |
| Phase 4 | 前端页面重构（5 Tab + 查看器） | 前端 50% |
| Phase 5 | AI 注入资料数据 + 整体联调 | 全栈 30% |

---

**文档结束**

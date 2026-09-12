# HSE V2.0 MVP 第一阶段开发方案

## 一、MVP 设计原则

### 1.1 核心原则

| 原则 | 说明 |
|------|------|
| 最大价值 | 优先实现业务价值最高的功能 |
| 最小改动 | 不修改现有受保护代码，仅做增量新增 |
| 复用优先 | 最大化复用现有服务、中间件、组件 |
| 渐进增强 | 先跑通核心流程，再逐步增强能力 |

### 1.2 MVP 范围界定

```
本次 MVP 包含（3个模块）:
├── 模块1: 安全资料中心（文件上传/分类/标签/查询/标准关联）
├── 模块2: AI 文件分析（文本提取/AI分类/信息抽取/风险识别）
└── 模块3: Markdown 报告生成（月报/隐患报告/培训报告）

本次 MVP 不包含（后续 Sprint）:
├── 标准化台账（Sprint 4）
├── 集团驾驶舱（Sprint 5）
├── OCR 识别（暂缓）
└── PDF 全文解析（暂缓）
```

---

## 二、模块1：安全资料中心

### 2.1 功能范围

| 功能 | 说明 | 复用能力 |
|------|------|----------|
| 文件上传 | 支持 PDF/DOCX/XLSX/图片 | 复用 [upload.js](file:///f:/deploy/hse-dashboard/server/middleware/upload.js) 的 uploadDocument/uploadImage/uploadExcel |
| 文件分类 | 多级分类树管理 | 新增 document_categories 表 |
| 文件标签 | 人工+AI标签 | 新增 document_tags 表 |
| 文件查询 | 分页/筛选/搜索 | 复用 pg + 现有 response 中间件 |
| 文件详情 | 含分析结果 | 新增 document_files 表 |
| 标准条款关联 | 文件关联标准 | 新增 document_standard_relation 表 |

### 2.2 复用现有能力

```
文件上传流程:
前端 ImportModal组件 → /api/hse/documents/upload
    ↓
复用 upload.js 的 createUploader({ type: 'document', subDir: 'documents' })
    ↓
复用 validateUploadedFile 魔术字节校验
    ↓
写入 document_files 表（新增）
    ↓
返回 success() 响应（复用 response.js）
```

### 2.3 不做的事

- ❌ 不修改现有 /api/files 路由
- ❌ 不修改 upload.js 中间件
- ❌ 不新增公共上传组件（复用 ImportModal）
- ❌ 不做文件预览（仅下载）

---

## 三、模块2：AI 文件分析

### 3.1 功能范围

| 功能 | 说明 | 实现方式 |
|------|------|----------|
| XLSX 文本提取 | 提取 Excel 内容 | ✅ 复用已安装的 xlsx 库 |
| DOCX 文本提取 | 提取 Word 内容 | ⚠️ Node zlib 原生解析（无需 mammoth） |
| PDF 元数据处理 | 文件名+基本信息 | 仅元数据，不做全文解析 |
| AI 分类 | 自动分类文件类型 | 复用 [aiService.js](file:///f:/deploy/hse-dashboard/server/services/aiService.js) chat 方法 |
| 信息抽取 | 提取关键字段 | 复用 aiService + 新增 Prompt |
| 风险识别 | 识别风险项 | 复用 aiService + 新增 Prompt |
| 分析结果存储 | 保存分析数据 | 新增 document_analysis 表 |

### 3.2 AI 分析流程（不重新设计 AI 平台）

```
文件上传成功（document_files.analysis_status = 'pending'）
    ↓
触发分析（异步，不阻塞上传响应）
    ↓
步骤1: 文本提取
    ├── XLSX → require('xlsx').read() 提取单元格文本
    ├── DOCX → zlib.unzipSync() 解压 + 正则提取 <w:t> 文本
    ├── PDF  → 仅用文件名作为分析输入
    └── 图片 → 仅用文件名作为分析输入
    ↓
步骤2: AI 分类（复用 aiService.chat）
    Prompt: "请分类以下安全资料: {文本/文件名}"
    ↓
步骤3: 信息抽取（复用 aiService.chat）
    Prompt: "请提取以下文档的关键信息(JSON): {文本}"
    ↓
步骤4: 风险识别（复用 aiService.chat）
    Prompt: "请识别以下文档中的安全风险: {文本}"
    ↓
步骤5: 保存结果到 document_analysis 表
    ↓
更新 document_files.analysis_status = 'completed'
```

### 3.3 不做的事

- ❌ 不重新设计 AI 平台
- ❌ 不新增 AI Provider
- ❌ 不做 OCR 识别（暂缓）
- ❌ 不做 PDF 全文解析（暂缓）
- ❌ 不修改 aiService.js 核心逻辑（仅新增 Prompt 模板调用）

---

## 四、模块3：Markdown 报告生成

### 4.1 功能范围

| 功能 | 说明 | 实现方式 |
|------|------|----------|
| 安全月报 | 月度安全生产分析报告 | 复用 reportService + aiService |
| 隐患分析报告 | 隐患排查专项报告 | 复用 aiService 的 report_hazard 模板 |
| 培训分析报告 | 培训效果分析报告 | 复用 aiService 的 report_training 模板 |
| 报告存储 | .md 文件存储 | 写入 reports/ 目录 |
| 报告查询 | 历史报告列表 | 复用现有 hse-report 路由模式 |
| 报告下载 | 文件下载 | 流式响应 |

### 4.2 复用现有能力

```
报告生成流程:
前端触发 → /api/hse/documents/reports/generate
    ↓
复用 reportService.generateReport()（已有）
    ↓
复用 aiService.chat() 生成报告内容（已有 Prompt 模板）
    ↓
格式化为 Markdown
    ↓
存储 .md 文件到 reports/ 目录
    ↓
复用现有通知体系（notifications 路由）推送提醒
```

### 4.3 报告目录结构

```
reports/
├── 2026/
│   ├── 07/
│   │   ├── 月度安全生产分析报告_2026-07.md
│   │   ├── 隐患分析报告_2026-07.md
│   │   └── 培训分析报告_2026-07.md
│   └── 08/
│       └── ...
```

### 4.4 不做的事

- ❌ 不修改现有 hse-report 路由
- ❌ 不新增定时任务框架（手动触发生成）
- ❌ 不做复杂报告模板引擎（直接用字符串拼接 Markdown）

---

## 五、MVP 数据库新增表

### 5.1 新增表清单

| 表名 | 用途 | 关联旧表 |
|------|------|----------|
| document_categories | 文件分类 | 无（独立） |
| document_tags | 文件标签 | 无（独立） |
| document_files | 文件主表 | 无（独立，不修改旧 file_records） |
| document_tag_relation | 文件标签关联 | document_files, document_tags |
| document_versions | 文件版本 | document_files |
| document_analysis | AI分析结果 | document_files |
| document_standard_relation | 文件标准关联 | document_files（标准条款表 Sprint 4 新增） |
| hse_reports | 报告记录 | 无（独立，不修改旧 reports 表） |

### 5.2 字段规范

所有新表必须包含：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGSERIAL PRIMARY KEY | 主键 |
| created_at | TIMESTAMP DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP DEFAULT CURRENT_TIMESTAMP | 更新时间 |
| is_deleted | BOOLEAN DEFAULT false | 软删除（兼容现有规范） |
| status | VARCHAR(16) | 状态字段（MVP要求） |

---

## 六、MVP 接口清单

### 6.1 安全资料中心接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/hse/documents/upload | 文件上传 |
| GET | /api/hse/documents | 文件列表 |
| GET | /api/hse/documents/:id | 文件详情 |
| DELETE | /api/hse/documents/:id | 文件删除 |
| PUT | /api/hse/documents/:id | 文件更新 |
| GET | /api/hse/documents/:id/download | 文件下载 |
| GET | /api/hse/documents/categories | 分类列表 |
| POST | /api/hse/documents/categories | 创建分类 |
| GET | /api/hse/documents/tags | 标签列表 |
| POST | /api/hse/documents/tags | 创建标签 |
| POST | /api/hse/documents/:id/standard-relate | 关联标准 |

### 6.2 AI 分析接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/hse/documents/:id/analyze | 触发文件分析 |
| GET | /api/hse/documents/:id/analysis | 获取分析结果 |
| GET | /api/hse/documents/analysis/list | 待分析列表 |

### 6.3 报告接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/hse/documents/reports/generate | 生成报告 |
| GET | /api/hse/documents/reports | 报告列表 |
| GET | /api/hse/documents/reports/:id/download | 报告下载 |

---

## 七、MVP 前端页面

### 7.1 新增页面

| 页面 | 路由 | 说明 |
|------|------|------|
| 文件库 | /hse/documents/library | 文件列表+上传+分类树 |
| AI分析 | /hse/documents/ai-analysis | 待分析列表+分析结果 |
| 报告中心 | /hse/documents/reports | 报告生成+历史报告 |

### 7.2 复用组件

| 组件 | 来源 | 用途 |
|------|------|------|
| ImportModal | components/hse/ImportModal.vue | 文件上传弹窗 |
| StatCard | components/hse/StatCard.vue | 统计卡片 |
| Ant Design Vue Table | 内置 | 文件列表表格 |
| Ant Design Vue Tree | 内置 | 分类树 |
| Ant Design Vue Upload | 内置 | 拖拽上传 |

---

## 八、MVP 验收标准

### 8.1 功能验收

- [ ] 文件上传成功，支持 PDF/DOCX/XLSX/图片
- [ ] 文件列表分页展示，支持按分类/类型/关键词筛选
- [ ] 文件分类树正常展示和编辑
- [ ] 文件标签可添加和筛选
- [ ] XLSX 文件 AI 分析能提取文本并分类
- [ ] DOCX 文件 AI 分析能提取文本并分类
- [ ] PDF/图片文件 AI 分析基于文件名分类
- [ ] 月度安全报告可生成并下载 .md 文件
- [ ] 隐患分析报告可生成并下载
- [ ] 培训分析报告可生成并下载

### 8.2 约束验收

- [ ] 登录功能 100% 正常
- [ ] 现有所有页面正常访问
- [ ] 无新增 npm 依赖
- [ ] 未修改 packages/ 任何文件
- [ ] 未修改 auth 相关任何文件
- [ ] 未新增公共组件（仅业务页面内组件）

---

**文档版本**: V1.0  
**生成日期**: 2026-07-18  
**范围**: MVP第一阶段（3个模块）开发方案
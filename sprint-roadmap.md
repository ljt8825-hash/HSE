# HSE V2.0 Sprint 开发路线图

## 一、Sprint 总览

| Sprint | 名称 | 核心目标 | 数据库变化 | 新增接口 | 新增页面 |
|--------|------|----------|------------|----------|----------|
| Sprint 1 | 安全资料中心 | 文件上传/分类/标签/查询 | 5张新表 | 10个 | 1个 |
| Sprint 2 | AI 文件分析 | 文本提取/AI分类/风险识别 | 2张新表 | 3个 | 1个 |
| Sprint 3 | Markdown 报告 | 月报/隐患报告/培训报告 | 1张新表 | 4个 | 1个 |
| Sprint 4 | 标准化台账 | 标准条款/达标台账/自评评分 | 2张新表 | 6个 | 3个 |
| Sprint 5 | 集团驾驶舱 | 安全指数/统计/趋势 | 0张(复用) | 3个 | 1个 |

---

## 二、Sprint 1：安全资料中心

### 2.1 目标

实现安全资料文件的上传、分类、标签、查询、下载功能，建立文件管理基础。

### 2.2 数据库变化

执行文件: `sql/v2_document_tables.sql` + `sql/v2_seed_data.sql`

| 新增表 | 用途 |
|--------|------|
| document_categories | 文件分类（含种子数据） |
| document_tags | 文件标签 |
| document_files | 文件主表 |
| document_tag_relation | 文件标签关联 |
| document_versions | 文件版本 |

### 2.3 修改文件

| 文件 | 修改类型 | 内容 |
|------|----------|------|
| server/app.js | 修改(挂载) | 新增 hse-documents 路由挂载 |
| 安全看板vben/.../hse.json | 修改(文案) | 新增"安全资料中心"菜单文案 |

### 2.4 新增文件

**后端**:

| 文件 | 作用 |
|------|------|
| server/routes/hse-documents.js | 文件管理路由 |
| server/services/documentService.js | 文件管理业务逻辑 |

**前端**:

| 文件 | 作用 |
|------|------|
| 安全看板vben/.../routes/modules/hse-documents.ts | 路由 |
| 安全看板vben/.../api/hse/documents.ts | API封装 |
| 安全看板vben/.../views/hse/documents/library/index.vue | 文件库页面 |
| 安全看板vben/.../views/hse/documents/library/components/UploadModal.vue | 上传弹窗(页面内) |

### 2.5 接口清单

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

### 2.6 测试方案

| 测试项 | 验证方法 |
|--------|----------|
| 文件上传 | 上传 PDF/DOCX/XLSX/图片，检查返回 code:0 |
| 文件列表 | 查询列表，验证分页和筛选 |
| 文件下载 | 下载文件，验证文件完整性 |
| 分类树 | 查询分类，验证树结构正确 |
| 标签管理 | 创建/查询标签 |
| 登录兼容 | 登录后访问新页面正常 |
| 现有功能回归 | 现有所有页面正常访问 |

---

## 三、Sprint 2：AI 文件分析

### 3.1 目标

实现文件 AI 智能分析，包括文本提取、AI分类、信息抽取、风险识别。

### 3.2 数据库变化

执行文件: `sql/v2_analysis_tables.sql`

| 新增表 | 用途 |
|--------|------|
| document_analysis | AI分析结果 |
| document_standard_relation | 资料标准关联 |

### 3.3 修改文件

| 文件 | 修改类型 | 内容 |
|------|----------|------|
| server/app.js | 修改(挂载) | 新增 hse-document-analysis 路由挂载 |

### 3.4 新增文件

**后端**:

| 文件 | 作用 |
|------|------|
| server/routes/hse-document-analysis.js | AI分析路由 |
| server/services/documentAnalysisService.js | AI分析业务逻辑 |
| server/utils/fileParser.js | 文件解析工具(XLSX/DOCX，无需新依赖) |

**前端**:

| 文件 | 作用 |
|------|------|
| 安全看板vben/.../api/hse/document-analysis.ts | API封装 |
| 安全看板vben/.../views/hse/documents/ai-analysis/index.vue | AI分析页面 |
| 安全看板vben/.../views/hse/documents/ai-analysis/components/AnalysisResult.vue | 结果展示(页面内) |

### 3.5 接口清单

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/hse/document-analysis/:id/analyze | 触发分析 |
| GET | /api/hse/document-analysis/:id/result | 分析结果 |
| GET | /api/hse/document-analysis/pending | 待分析列表 |

### 3.6 测试方案

| 测试项 | 验证方法 |
|--------|----------|
| XLSX 解析 | 上传 Excel，验证文本提取成功 |
| DOCX 解析 | 上传 Word，验证 zlib 解析成功 |
| PDF 降级 | 上传 PDF，验证文件名分类正常 |
| AI 分类 | 验证分类结果和置信度 |
| 风险识别 | 验证风险项识别 |
| 异步处理 | 验证上传后分析状态流转 pending→completed |
| aiService 兼容 | 验证现有 AI 功能不受影响 |

---

## 四、Sprint 3：Markdown 报告

### 4.1 目标

实现安全月报、隐患分析报告、培训分析报告的自动生成和下载。

### 4.2 数据库变化

执行文件: `sql/v2_report_tables.sql`

| 新增表 | 用途 |
|--------|------|
| hse_reports | 报告记录 |

### 4.3 修改文件

| 文件 | 修改类型 | 内容 |
|------|----------|------|
| server/app.js | 修改(挂载) | 新增 hse-document-reports 路由挂载 |

### 4.4 新增文件

**后端**:

| 文件 | 作用 |
|------|------|
| server/routes/hse-document-reports.js | 报告路由 |
| server/services/documentReportService.js | 报告生成逻辑 |

**前端**:

| 文件 | 作用 |
|------|------|
| 安全看板vben/.../api/hse/document-reports.ts | API封装 |
| 安全看板vben/.../views/hse/documents/reports/index.vue | 报告中心页面 |
| 安全看板vben/.../views/hse/documents/reports/components/ReportPreview.vue | 报告预览(页面内) |

### 4.5 接口清单

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/hse/document-reports/generate | 生成报告 |
| GET | /api/hse/document-reports | 报告列表 |
| GET | /api/hse/document-reports/:id/download | 报告下载 |
| DELETE | /api/hse/document-reports/:id | 删除报告 |

### 4.6 测试方案

| 测试项 | 验证方法 |
|--------|----------|
| 月报生成 | 生成 2026-07 月报，验证 .md 文件内容 |
| 隐患报告 | 生成隐患分析报告，验证内容 |
| 培训报告 | 生成培训分析报告，验证内容 |
| 报告列表 | 查询历史报告列表 |
| 报告下载 | 下载 .md 文件，验证内容 |
| 旧表只读 | 验证报告生成只读取不修改旧表 |

---

## 五、Sprint 4：标准化台账

### 5.1 目标

实现安全标准化条款管理、达标台账、自评评分功能。

### 5.2 数据库变化

执行文件: `sql/v2_standard_tables.sql`

| 新增表 | 用途 |
|--------|------|
| safety_standard_clauses | 标准条款（三级指标） |
| safety_scores | 评分记录 |

### 5.3 修改文件

| 文件 | 修改类型 | 内容 |
|------|----------|------|
| server/app.js | 修改(挂载) | 新增 hse-standard、hse-score 路由挂载 |
| 安全看板vben/.../hse.json | 修改(文案) | 新增"标准化管理"菜单文案 |

### 5.4 新增文件

**后端**:

| 文件 | 作用 |
|------|------|
| server/routes/hse-standard.js | 标准管理路由 |
| server/routes/hse-score.js | 评分管理路由 |
| server/services/standardService.js | 标准管理逻辑 |
| server/services/scoreService.js | 评分计算逻辑 |

**前端**:

| 文件 | 作用 |
|------|------|
| 安全看板vben/.../routes/modules/hse-standard.ts | 路由 |
| 安全看板vben/.../api/hse/standard.ts | API封装 |
| 安全看板vben/.../api/hse/score.ts | API封装 |
| 安全看板vben/.../views/hse/standard/clauses/index.vue | 标准条款页面 |
| 安全看板vben/.../views/hse/standard/compliance/index.vue | 达标台账页面 |
| 安全看板vben/.../views/hse/standard/assessment/index.vue | 自评评分页面 |

### 5.5 接口清单

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/hse/standard/clauses | 标准条款树 |
| POST | /api/hse/standard/clauses | 创建条款 |
| PUT | /api/hse/standard/clauses/:id | 更新条款 |
| GET | /api/hse/standard/compliance | 达标台账 |
| POST | /api/hse/standard/assessment | 自评评分 |
| GET | /api/hse/score/today | 今日评分 |
| POST | /api/hse/score/calculate | 手动计算评分 |

### 5.6 测试方案

| 测试项 | 验证方法 |
|--------|----------|
| 条款树 | 查询三级条款树结构 |
| 达标台账 | 验证达标率计算 |
| 自评评分 | 提交评分，验证记录 |
| 评分计算 | 触发计算，验证5项指标 |
| 文件关联 | 验证 document_standard_relation 关联 |

---

## 六、Sprint 5：集团驾驶舱

### 6.1 目标

实现集团汇报驾驶舱，展示安全指数、统计指标、趋势分析。

### 6.2 数据库变化

无新增表，复用 safety_scores + 旧表聚合查询。

### 6.3 修改文件

| 文件 | 修改类型 | 内容 |
|------|----------|------|
| server/app.js | 修改(挂载) | 新增 hse-cockpit-v2 路由挂载 |
| 安全看板vben/.../hse.json | 修改(文案) | 新增"驾驶舱"菜单文案 |

### 6.4 新增文件

**后端**:

| 文件 | 作用 |
|------|------|
| server/routes/hse-cockpit-v2.js | 驾驶舱路由 |
| server/services/cockpitService.js | 数据聚合逻辑 |

**前端**:

| 文件 | 作用 |
|------|------|
| 安全看板vben/.../routes/modules/hse-cockpit-v2.ts | 路由 |
| 安全看板vben/.../api/hse/cockpit-v2.ts | API封装 |
| 安全看板vben/.../views/hse/cockpit-v2/index.vue | 驾驶舱页面 |

### 6.5 接口清单

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/hse/cockpit-v2/overview | 驾驶舱概览 |
| GET | /api/hse/cockpit-v2/hazard-stats | 隐患统计 |
| GET | /api/hse/cockpit-v2/score-trend | 评分趋势 |

### 6.6 测试方案

| 测试项 | 验证方法 |
|--------|----------|
| 概览数据 | 验证安全指数、5项指标 |
| 隐患统计 | 验证按等级/状态统计 |
| 评分趋势 | 验证月度趋势数据 |
| 图表渲染 | 验证 ECharts 图表正常 |
| 旧表聚合 | 验证只读聚合不修改旧表 |

---

## 七、Sprint 依赖关系

```
Sprint 1 (安全资料中心)
    │
    ├── document_files 表（基础）
    │
    ▼
Sprint 2 (AI分析)
    │
    ├── document_analysis 表（依赖 document_files）
    │
    ▼
Sprint 3 (报告) ──→ 依赖 Sprint 1/2 数据 + 旧表
    │
    ▼
Sprint 4 (标准化) ──→ 依赖 Sprint 1 (document_standard_relation)
    │
    ▼
Sprint 5 (驾驶舱) ──→ 依赖 Sprint 4 (safety_scores) + 旧表
```

---

## 八、每个 Sprint 验收检查

### 通用验收（每个 Sprint 都必须通过）

- [ ] 登录功能 100% 正常
- [ ] 现有所有页面正常访问
- [ ] 无新增 npm 依赖（检查 package.json 未变）
- [ ] 未修改 packages/ 任何文件
- [ ] 未修改 auth 相关任何文件
- [ ] API 响应格式为 `{ code: 0, success: true, ... }`
- [ ] 新表包含 id/created_at/updated_at/status/is_deleted
- [ ] 旧表未被修改（无 ALTER TABLE）

---

**文档版本**: V1.0  
**生成日期**: 2026-07-18  
**范围**: 5个Sprint开发路线、修改文件、数据库变化、接口、测试方案
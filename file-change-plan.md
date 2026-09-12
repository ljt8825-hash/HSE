# HSE V2.0 文件修改范围规划

## 一、修改原则

1. **只增不改**: 新增文件为主，极少修改现有文件
2. **修改仅限挂载**: 现有文件修改仅限"注册新路由/导入新模块"的挂载行
3. **受保护文件零修改**: packages/、auth/、登录页等绝不触碰

---

## 二、前端新增文件

### 2.1 路由模块

| 文件路径 | 作用 |
|----------|------|
| `安全看板vben/apps/web-antd/src/router/routes/modules/hse-documents.ts` | 安全资料中心路由（文件库/AI分析/报告） |
| `安全看板vben/apps/web-antd/src/router/routes/modules/hse-standard.ts` | 标准化管理路由（Sprint 4） |
| `安全看板vben/apps/web-antd/src/router/routes/modules/hse-cockpit-v2.ts` | 驾驶舱V2路由（Sprint 5） |

### 2.2 API 模块

| 文件路径 | 作用 |
|----------|------|
| `安全看板vben/apps/web-antd/src/api/hse/documents.ts` | 安全资料中心接口封装 |
| `安全看板vben/apps/web-antd/src/api/hse/document-analysis.ts` | AI分析接口封装 |
| `安全看板vben/apps/web-antd/src/api/hse/document-reports.ts` | 报告接口封装 |
| `安全看板vben/apps/web-antd/src/api/hse/standard.ts` | 标准管理接口封装（Sprint 4） |
| `安全看板vben/apps/web-antd/src/api/hse/score.ts` | 评分接口封装（Sprint 4） |
| `安全看板vben/apps/web-antd/src/api/hse/cockpit-v2.ts` | 驾驶舱接口封装（Sprint 5） |

### 2.3 页面视图

| 文件路径 | 作用 |
|----------|------|
| `安全看板vben/apps/web-antd/src/views/hse/documents/library/index.vue` | 文件库页面 |
| `安全看板vben/apps/web-antd/src/views/hse/documents/library/components/UploadModal.vue` | 上传弹窗（页面内组件，非公共组件） |
| `安全看板vben/apps/web-antd/src/views/hse/documents/library/components/CategoryTree.vue` | 分类树（页面内组件） |
| `安全看板vben/apps/web-antd/src/views/hse/documents/ai-analysis/index.vue` | AI分析页面 |
| `安全看板vben/apps/web-antd/src/views/hse/documents/ai-analysis/components/AnalysisResult.vue` | 分析结果展示（页面内组件） |
| `安全看板vben/apps/web-antd/src/views/hse/documents/reports/index.vue` | 报告中心页面 |
| `安全看板vben/apps/web-antd/src/views/hse/documents/reports/components/ReportPreview.vue` | 报告预览（页面内组件） |
| `安全看板vben/apps/web-antd/src/views/hse/standard/clauses/index.vue` | 标准条款页面（Sprint 4） |
| `安全看板vben/apps/web-antd/src/views/hse/standard/compliance/index.vue` | 达标台账页面（Sprint 4） |
| `安全看板vben/apps/web-antd/src/views/hse/standard/assessment/index.vue` | 自评评分页面（Sprint 4） |
| `安全看板vben/apps/web-antd/src/views/hse/cockpit-v2/index.vue` | 驾驶舱V2页面（Sprint 5） |

---

## 三、前端修改文件

### 3.1 需修改的文件（仅挂载/注册）

| 文件路径 | 修改原因 | 修改内容 |
|----------|----------|----------|
| `安全看板vben/apps/web-antd/src/api/hse/index.ts`（如存在）或各模块自行导出 | API 汇总导出 | 新增 documents 等模块导出 |
| `安全看板vben/apps/web-antd/src/locales/langs/zh-CN/hse.json` | 菜单国际化 | 新增"安全资料中心"等菜单文案 |
| `安全看板vben/apps/web-antd/src/locales/langs/en-US/hse.json` | 菜单国际化 | 新增对应英文文案 |

### 3.2 路由无需修改说明

**重要**: [router/routes/index.ts](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/index.ts) 使用 `import.meta.glob('./modules/**/*.ts', { eager: true })` 自动加载，**无需修改**。新增路由文件放入 `modules/` 目录即自动生效。

---

## 四、后端新增文件

### 4.1 路由模块

| 文件路径 | 作用 |
|----------|------|
| `server/routes/hse-documents.js` | 安全资料中心路由（文件CRUD/分类/标签） |
| `server/routes/hse-document-analysis.js` | AI文件分析路由 |
| `server/routes/hse-document-reports.js` | 报告生成路由 |
| `server/routes/hse-standard.js` | 标准化管理路由（Sprint 4） |
| `server/routes/hse-score.js` | 评分管理路由（Sprint 4） |
| `server/routes/hse-cockpit-v2.js` | 驾驶舱V2路由（Sprint 5） |

### 4.2 服务模块

| 文件路径 | 作用 |
|----------|------|
| `server/services/documentService.js` | 文件管理业务逻辑 |
| `server/services/documentAnalysisService.js` | AI分析业务逻辑（文本提取+AI调用） |
| `server/services/documentReportService.js` | 报告生成业务逻辑 |
| `server/services/standardService.js` | 标准管理业务逻辑（Sprint 4） |
| `server/services/scoreService.js` | 评分计算业务逻辑（Sprint 4） |
| `server/services/cockpitService.js` | 驾驶舱数据聚合（Sprint 5） |

### 4.3 工具模块

| 文件路径 | 作用 |
|----------|------|
| `server/utils/fileParser.js` | 文件解析工具（XLSX/DOCX文本提取，无需新依赖） |

---

## 五、后端修改文件

### 5.1 需修改的文件（仅路由挂载）

| 文件路径 | 修改原因 | 修改内容 |
|----------|----------|----------|
| [server/app.js](file:///f:/deploy/hse-dashboard/server/app.js) | 注册新路由 | 新增 require + app.use 挂载行 |

**修改示例**（仅新增挂载行，不改动现有逻辑）:

```javascript
// 现有代码（不修改）
const hseReportRoutes = require('./routes/hse-report');

// 新增代码（V2 增量）
const hseDocumentsRoutes = require('./routes/hse-documents');
const hseDocumentAnalysisRoutes = require('./routes/hse-document-analysis');
const hseDocumentReportRoutes = require('./routes/hse-document-reports');

// 现有挂载（不修改）
app.use('/api/hse/report', hseReportRoutes);

// 新增挂载（V2 增量）
app.use('/api/hse/documents', hseDocumentsRoutes);
app.use('/api/hse/document-analysis', hseDocumentAnalysisRoutes);
app.use('/api/hse/document-reports', hseDocumentReportRoutes);
```

### 5.2 不修改的后端文件

| 文件 | 原因 |
|------|------|
| server/middleware/auth.js | 登录保护，禁止修改 |
| server/routes/auth.js | 登录保护，禁止修改 |
| server/middleware/upload.js | 复用即可，不修改 |
| server/middleware/response.js | 复用即可，不修改 |
| server/middleware/validate.js | 复用即可，不修改 |
| server/services/aiService.js | 复用即可，不修改核心逻辑 |
| server/services/wsServer.js | 复用即可，不修改 |
| server/config/db.js | 数据库配置，不修改 |

---

## 六、数据库新增文件

| 文件路径 | 作用 |
|----------|------|
| `sql/v2_document_tables.sql` | 文件中心相关建表（Sprint 1） |
| `sql/v2_analysis_tables.sql` | AI分析相关建表（Sprint 2） |
| `sql/v2_report_tables.sql` | 报告相关建表（Sprint 3） |
| `sql/v2_standard_tables.sql` | 标准化管理建表（Sprint 4） |
| `sql/v2_cockpit_tables.sql` | 驾驶舱统计建表（Sprint 5） |
| `sql/v2_seed_data.sql` | 初始化种子数据（分类/标签/标准条款） |

---

## 七、禁止修改文件清单

### 7.1 Vben 核心保护

| 目录/文件 | 禁止原因 |
|-----------|----------|
| `安全看板vben/packages/@core/` | Vben 核心机制 |
| `安全看板vben/packages/effects/` | Vben 效果组件 |
| `安全看板vben/packages/themes/` | Vben 主题系统 |
| `安全看板vben/packages/` 下所有 | Vben monorepo 核心包 |

### 7.2 登录认证保护

| 文件 | 禁止原因 |
|------|----------|
| `server/middleware/auth.js` | JWT 认证中间件 |
| `server/routes/auth.js` | 认证路由 |
| `安全看板vben/apps/web-antd/src/store/auth.ts` | 前端认证状态 |
| `安全看板vben/apps/web-antd/src/api/core/auth.ts` | 认证API |
| `安全看板vben/apps/web-antd/src/views/_core/authentication/` | 登录页面 |
| `安全看板vben/apps/web-antd/src/router/access.ts` | 路由权限控制 |
| `安全看板vben/apps/web-antd/src/router/guard.ts` | 路由守卫 |

### 7.3 现有业务保护

| 文件 | 禁止原因 |
|------|----------|
| `server/routes/` 下所有现有路由 | 现有业务接口 |
| `server/services/aiService.js` | AI服务核心（仅调用，不修改） |
| `server/services/wsServer.js` | WebSocket服务 |
| `server/middleware/upload.js` | 上传中间件（仅复用） |
| `sql/unified_schema.sql` | 现有数据库结构 |

### 7.4 配置保护

| 文件 | 禁止原因 |
|------|----------|
| `server/package.json` | 禁止新增依赖 |
| `安全看板vben/package.json` | 禁止新增依赖 |
| `server/.env` | 环境配置 |

---

## 八、修改影响评估

### 8.1 修改量统计

| 类型 | 文件数 | 风险等级 |
|------|--------|----------|
| 前端新增 | ~17 | 低（纯新增） |
| 前端修改 | ~2 | 低（仅国际化文案） |
| 后端新增 | ~13 | 低（纯新增） |
| 后端修改 | 1 | 低（仅 app.js 挂载行） |
| 数据库新增 | ~6 | 低（纯新增表） |
| **禁止修改** | ~50+ | - |

### 8.2 回滚方案

若出现问题，回滚步骤：

1. 注释 `server/app.js` 中新增的路由挂载行
2. 删除新增的前端路由文件（自动取消加载）
3. 删除新增的数据库表（`DROP TABLE IF EXISTS`）
4. 现有系统完全不受影响

---

**文档版本**: V1.0  
**生成日期**: 2026-07-18  
**范围**: 文件修改范围、禁止修改清单、回滚方案
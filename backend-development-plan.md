# HSE V2.0 后端实施策略

## 一、实施原则

### 1.1 基于当前 Express 结构

| 原则 | 说明 |
|------|------|
| 路由分层 | routes（路由） → services（业务） → pg（数据） |
| 复用中间件 | response.js / validate.js / upload.js / auth.js |
| 复用服务 | aiService.js / reportService.js |
| 统一响应 | success() / error() 格式 |

### 1.2 禁止事项

- ❌ 禁止修改 server/middleware/auth.js（JWT认证）
- ❌ 禁止修改 server/routes/auth.js（认证路由）
- ❌ 禁止修改 server/middleware/upload.js（上传中间件，仅复用）
- ❌ 禁止修改 server/middleware/response.js（响应格式）
- ❌ 禁止修改 server/middleware/validate.js（校验中间件）
- ❌ 禁止修改 server/services/aiService.js 核心逻辑（仅调用）
- ❌ 禁止修改 server/config/db.js（数据库配置）
- ❌ 禁止新增 npm 依赖
- ❌ 禁止修改 server/package.json

---

## 二、路由设计规范

### 2.1 路由文件结构

参考现有 [hse-report.js](file:///f:/deploy/hse-dashboard/server/routes/hse-report.js) 模式：

```javascript
const express = require('express');
const router = express.Router();
const { success, error } = require('../middleware/response');
const { logger } = require('../middleware/requestLogger');
const documentService = require('../services/documentService');

/**
 * 文件上传
 * POST /api/hse/documents/upload
 */
router.post('/upload', async (req, res) => {
  try {
    // 业务逻辑调用 service
    const result = await documentService.uploadFile(req);
    res.json(success(result, '上传成功'));
  } catch (err) {
    logger.error('文件上传失败', { error: err.message });
    res.json(error(-1, err.message));
  }
});

module.exports = router;
```

### 2.2 响应格式（必须遵守）

复用 [response.js](file:///f:/deploy/hse-dashboard/server/middleware/response.js)：

```javascript
// 成功
res.json(success(data, '操作成功'));
// => { code: 0, success: true, message: '操作成功', data: {...} }

// 失败
res.json(error(-1, '操作失败'));
// => { code: -1, success: false, message: '操作失败', data: null }
```

### 2.3 认证说明

所有 `/api/*` 路由已由 [app.js](file:///f:/deploy/hse-dashboard/server/app.js) 第205行 `app.use('/api', authMiddleware)` 统一拦截，新路由**无需额外配置**认证。

---

## 三、Sprint 1：安全资料中心后端

### 3.1 路由文件

**文件**: `server/routes/hse-documents.js`

**接口清单**:

| 方法 | 路径 | 说明 | 复用能力 |
|------|------|------|----------|
| POST | /upload | 文件上传 | upload.js 的 uploadDocument |
| GET | / | 文件列表 | pg 查询 |
| GET | /:id | 文件详情 | pg 查询 |
| DELETE | /:id | 文件删除 | pg 软删除 |
| PUT | /:id | 文件更新 | pg 更新 |
| GET | /:id/download | 文件下载 | fs 流式响应 |
| GET | /categories | 分类列表 | pg 查询 |
| POST | /categories | 创建分类 | pg 插入 |
| GET | /tags | 标签列表 | pg 查询 |
| POST | /tags | 创建标签 | pg 插入 |

**上传接口实现要点**:

```javascript
// 复用现有 upload.js，不修改它
const { uploadDocument, validateUploadedFile, getFileUrl } = require('../middleware/upload');

router.post('/upload', uploadDocument.single('file'), async (req, res) => {
  // 1. 魔术字节校验（复用现有方法）
  const check = validateUploadedFile(req.file, 'word');
  if (!check.valid) {
    return res.json(error(-1, check.error));
  }
  // 2. 写入 document_files 表
  // 3. 返回 success()
});
```

### 3.2 服务文件

**文件**: `server/services/documentService.js`

**核心方法**:

| 方法 | 说明 | 数据操作 |
|------|------|----------|
| uploadFile(req) | 文件上传 | INSERT document_files |
| getFileList(params) | 文件列表 | SELECT + 分页 |
| getFileDetail(id) | 文件详情 | SELECT by id |
| deleteFile(id) | 文件删除 | UPDATE is_deleted = true |
| updateFile(id, data) | 文件更新 | UPDATE |
| downloadFile(req, res, id) | 文件下载 | fs.createReadStream |
| getCategoryTree() | 分类树 | SELECT 递归 |
| createCategory(data) | 创建分类 | INSERT |
| getTagList() | 标签列表 | SELECT |
| createTag(data) | 创建标签 | INSERT |

**数据库操作示例**（复用现有 [db.js](file:///f:/deploy/hse-dashboard/server/config/db.js) 的 pool）:

```javascript
const { pool } = require('../config/db');

async function getFileList(params) {
  const { page = 1, size = 20, category_id, file_type, keyword } = params;
  const offset = (page - 1) * size;
  let sql = `
    SELECT f.*, c.name as category_name
    FROM document_files f
    LEFT JOIN document_categories c ON f.category_id = c.id
    WHERE f.is_deleted = false
  `;
  const values = [];
  // 动态条件拼接...
  const result = await pool.query(sql, values);
  return { list: result.rows, pagination: { page, size, total: result.rowCount } };
}
```

---

## 四、Sprint 2：AI 分析后端

### 4.1 路由文件

**文件**: `server/routes/hse-document-analysis.js`

**接口清单**:

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /:id/analyze | 触发文件分析 |
| GET | /:id/result | 获取分析结果 |
| GET | /pending | 待分析列表 |

### 4.2 服务文件

**文件**: `server/services/documentAnalysisService.js`

**核心方法**:

| 方法 | 说明 | 复用能力 |
|------|------|----------|
| analyzeFile(id) | 执行完整分析 | 调用 fileParser + aiService |
| getAnalysisResult(id) | 查询分析结果 | SELECT document_analysis |
| getPendingList() | 待分析列表 | SELECT document_files |

**分析流程实现**:

```javascript
const aiService = require('./aiService');
const fileParser = require('../utils/fileParser');

async function analyzeFile(fileId) {
  // 1. 查询文件信息
  const file = await getFileById(fileId);
  
  // 2. 更新状态为分析中
  await updateAnalysisStatus(fileId, 'analyzing');
  
  try {
    // 3. 文本提取（复用 fileParser，无需新依赖）
    const textResult = await fileParser.extractText(file);
    
    // 4. AI分类（复用 aiService.chat，不修改 aiService）
    const classifyResult = await aiService.chat(
      buildClassifyPrompt(textResult.text)
    );
    
    // 5. 信息抽取（复用 aiService.chat）
    const extractResult = await aiService.chat(
      buildExtractPrompt(textResult.text)
    );
    
    // 6. 风险识别（复用 aiService.chat）
    const riskResult = await aiService.chat(
      buildRiskPrompt(textResult.text)
    );
    
    // 7. 保存结果到 document_analysis 表
    await saveAnalysisResult(fileId, {
      parsed_text: textResult.text,
      category: classifyResult,
      extracted_info: extractResult,
      risk_level: riskResult.level,
      risk_items: riskResult.items,
    });
    
    // 8. 更新文件状态
    await updateAnalysisStatus(fileId, 'completed');
  } catch (err) {
    await updateAnalysisStatus(fileId, 'failed');
    throw err;
  }
}
```

### 4.3 文件解析工具

**文件**: `server/utils/fileParser.js`

**不新增依赖的解析方案**:

```javascript
const fs = require('fs');
const path = require('path');

/**
 * 提取文件文本（无需新增 npm 依赖）
 */
async function extractText(file) {
  const ext = path.extname(file.original_name).toLowerCase();
  
  switch (ext) {
    case '.xlsx':
    case '.xls':
      // 复用已安装的 xlsx 库
      const XLSX = require('xlsx');
      const workbook = XLSX.readFile(file.file_path);
      const text = extractXlsxText(workbook);
      return { text, method: 'xlsx' };
    
    case '.docx':
      // DOCX = ZIP，用 Node 内置 zlib 解压 + 正则提取
      const text = await extractDocxText(file.file_path);
      return { text, method: 'zlib' };
    
    case '.pdf':
      // PDF 无法全文解析，返回文件名作为分析输入
      return { text: file.original_name, method: 'filename' };
    
    case '.jpg':
    case '.jpeg':
    case '.png':
    case '.gif':
    case '.webp':
      // 图片无 OCR，返回文件名
      return { text: file.original_name, method: 'filename' };
    
    default:
      return { text: file.original_name, method: 'filename' };
  }
}

/**
 * DOCX 原生解析（无需 mammoth）
 * DOCX 本质是 ZIP，word/document.xml 含文本
 */
async function extractDocxText(filePath) {
  const { unzipSync } = require('zlib');
  const buffer = fs.readFileSync(filePath);
  try {
    const unzipped = unzipSync(buffer);
    // 在解压数据中查找 document.xml 的 <w:t> 标签内容
    const content = unzipped.toString('utf8');
    const matches = content.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
    return matches.map(m => m.replace(/<[^>]+>/g, '')).join('');
  } catch (err) {
    // DOCX 是多文件 ZIP，zlib.unzipSync 可能不适用
    // 降级为文件名
    return '';
  }
}

module.exports = { extractText };
```

---

## 五、Sprint 3：报告生成后端

### 5.1 路由文件

**文件**: `server/routes/hse-document-reports.js`

**接口清单**:

| 方法 | 路径 | 说明 | 复用能力 |
|------|------|------|----------|
| POST | /generate | 生成报告 | reportService + aiService |
| GET | / | 报告列表 | pg 查询 |
| GET | /:id/download | 报告下载 | fs 流式响应 |
| DELETE | /:id | 删除报告 | pg 软删除 |

### 5.2 服务文件

**文件**: `server/services/documentReportService.js`

**核心方法**:

| 方法 | 说明 | 复用能力 |
|------|------|----------|
| generateReport(params) | 生成报告 | aiService.chat + 旧表数据查询 |
| getReportList(params) | 报告列表 | SELECT hse_reports |
| downloadReport(req, res, id) | 报告下载 | fs.createReadStream |
| deleteReport(id) | 删除报告 | UPDATE is_deleted |

**报告生成实现**:

```javascript
const aiService = require('./aiService');
const { pool } = require('../config/db');
const fs = require('fs');
const path = require('path');

async function generateReport({ reportType, reportSubtype, period }) {
  // 1. 查询业务数据（只读旧表，不修改）
  const data = await collectReportData(reportSubtype, period);
  
  // 2. 复用 aiService 生成报告内容
  // aiService 已有 report_hazard / report_training 等 Prompt 模板
  const prompt = buildReportPrompt(reportSubtype, data);
  const content = await aiService.chat(prompt);
  
  // 3. 生成 Markdown 文件
  const fileName = `${getReportTitle(reportSubtype)}_${period}.md`;
  const filePath = path.join('reports', period.replace('-', '/'), fileName);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
  
  // 4. 保存记录到 hse_reports 表
  const result = await pool.query(
    `INSERT INTO hse_reports (report_type, report_subtype, period, title, file_name, file_path, content, status, generated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed', $8) RETURNING *`,
    [reportType, reportSubtype, period, title, fileName, filePath, content, 'system']
  );
  
  return result.rows[0];
}

/**
 * 收集报告数据（只读旧表）
 */
async function collectReportData(subtype, period) {
  switch (subtype) {
    case 'hazard':
      // 读取 hazards 表（只读）
      return await pool.query('SELECT * FROM hazards WHERE is_deleted = false AND ...');
    case 'training':
      // 读取 training_records 表（只读）
      return await pool.query('SELECT * FROM training_records WHERE ...');
    default:
      // 综合报告，读取多张表
      return {};
  }
}
```

---

## 六、Sprint 4-5：后端接口预览

### 6.1 Sprint 4：标准化管理

**路由**: `server/routes/hse-standard.js` + `server/routes/hse-score.js`  
**服务**: `server/services/standardService.js` + `server/services/scoreService.js`

| 接口 | 说明 |
|------|------|
| GET /api/hse/standard/clauses | 标准条款树 |
| POST /api/hse/standard/clauses | 创建条款 |
| GET /api/hse/standard/compliance | 达标台账 |
| POST /api/hse/standard/assessment | 自评评分 |
| GET /api/hse/score/today | 今日评分 |
| POST /api/hse/score/calculate | 手动计算评分 |

### 6.2 Sprint 5：驾驶舱

**路由**: `server/routes/hse-cockpit-v2.js`  
**服务**: `server/services/cockpitService.js`

| 接口 | 说明 |
|------|------|
| GET /api/hse/cockpit-v2/overview | 驾驶舱概览 |
| GET /api/hse/cockpit-v2/hazard-stats | 隐患统计 |
| GET /api/hse/cockpit-v2/score-trend | 评分趋势 |

---

## 七、路由挂载

### 7.1 app.js 修改（仅新增挂载行）

在 [app.js](file:///f:/deploy/hse-dashboard/server/app.js) 现有路由挂载区域之后，新增：

```javascript
// ========= V2 增量路由 =========
const hseDocumentsRoutes = require('./routes/hse-documents');
const hseDocumentAnalysisRoutes = require('./routes/hse-document-analysis');
const hseDocumentReportRoutes = require('./routes/hse-document-reports');

app.use('/api/hse/documents', hseDocumentsRoutes);
app.use('/api/hse/document-analysis', hseDocumentAnalysisRoutes);
app.use('/api/hse/document-reports', hseDocumentReportRoutes);

// Sprint 4
// const hseStandardRoutes = require('./routes/hse-standard');
// const hseScoreRoutes = require('./routes/hse-score');
// app.use('/api/hse/standard', hseStandardRoutes);
// app.use('/api/hse/score', hseScoreRoutes);

// Sprint 5
// const hseCockpitV2Routes = require('./routes/hse-cockpit-v2');
// app.use('/api/hse/cockpit-v2', hseCockpitV2Routes);
```

---

## 八、测试策略

### 8.1 接口测试

参考现有 [__tests__/auth.test.js](file:///f:/deploy/hse-dashboard/server/__tests__) 模式，使用 Jest + Supertest：

```javascript
// server/__tests__/documents.test.js
const request = require('supertest');
const app = require('../app');

describe('文档管理 API', () => {
  let token;
  
  beforeAll(async () => {
    // 登录获取 token（复用现有认证）
    const res = await request(app).post('/api/auth/login').send({
      username: 'admin',
      password: 'xxx'
    });
    token = res.body.data.token;
  });
  
  it('GET /api/hse/documents 应返回文件列表', async () => {
    const res = await request(app)
      .get('/api/hse/documents')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.code).toBe(0);
  });
});
```

### 8.2 验证清单

- [ ] 文件上传接口返回 code:0
- [ ] 文件列表接口返回 code:0
- [ ] AI 分析接口能触发分析并返回结果
- [ ] 报告生成接口能生成 .md 文件
- [ ] 现有接口不受影响（回归测试）
- [ ] 登录功能正常

---

**文档版本**: V1.0  
**生成日期**: 2026-07-18  
**范围**: 后端路由、服务、工具、挂载、测试方案
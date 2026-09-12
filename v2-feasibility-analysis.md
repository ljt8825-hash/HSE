# HSE V2.0 架构可行性分析

## 一、分析背景

本文档基于《Vben企业级安全开发约束规范》，对前期 V2 设计文档（system-v2-architecture.md 等6份）进行重新评估，识别哪些模块可直接实施、哪些需要调整、哪些必须暂缓。

### 1.1 最高约束确认

| 约束项 | 要求 | 状态 |
|--------|------|------|
| Vben核心保护 | 禁止修改 packages/@core/、packages/effects/、packages/themes/ | ✅ 确认 |
| 登录保护 | 禁止修改 auth middleware/routes/store、JWT、登录页面 | ✅ 确认 |
| 组件保护 | 禁止大量新增公共组件，优先复用 components/hse/ | ✅ 确认 |
| 依赖保护 | 禁止新增 npm 依赖 | ✅ 确认 |

### 1.2 现有依赖盘点（已安装，无需新增）

经核查 [server/package.json](file:///f:/deploy/hse-dashboard/server/package.json)，以下依赖**已存在**，可直接使用：

| 依赖 | 版本 | 用途 |
|------|------|------|
| express | ^4.19.2 | Web 框架 |
| express-rate-limit | ^8.5.2 | 请求限流（V2设计误判为新增） |
| helmet | ^8.2.0 | 安全头 |
| multer | ^1.4.5-lts.1 | 文件上传 |
| pg | ^8.22.0 | PostgreSQL 驱动 |
| xlsx | ^0.18.5 | Excel 解析 |
| zod | ^4.4.3 | 数据校验（V2设计误判为新增） |
| winston | ^3.19.0 | 日志 |
| uuid | ^14.0.1 | UUID 生成 |
| bcryptjs | ^3.0.3 | 密码加密 |
| compression | ^1.8.1 | 响应压缩 |

### 1.3 现有服务盘点（已实现，可直接复用）

| 服务 | 文件 | 能力 |
|------|------|------|
| AI 服务 | [server/services/aiService.js](file:///f:/deploy/hse-dashboard/server/services/aiService.js) | Grok/Ollama 双模式、流式输出、Prompt 模板 |
| 报告服务 | server/services/reportService.js | 报告生成（已接入 hse-report 路由） |
| WebSocket | server/services/wsServer.js | 实时通信（已运行） |
| 上传中间件 | [server/middleware/upload.js](file:///f:/deploy/hse-dashboard/server/middleware/upload.js) | Multer + 魔术字节校验，支持 image/document/excel/insurance |
| 校验中间件 | [server/middleware/validate.js](file:///f:/deploy/hse-dashboard/server/middleware/validate.js) | 基于 Zod 的参数校验 |
| 响应中间件 | [server/middleware/response.js](file:///f:/deploy/hse-dashboard/server/middleware/response.js) | 统一 success/error 响应 |
| 认证中间件 | server/middleware/auth.js | JWT 认证（禁止修改） |

### 1.4 前端现有能力盘点

经核查 [安全看板vben/apps/web-antd](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd)：

| 能力 | 位置 | 说明 |
|------|------|------|
| 路由自动加载 | [router/routes/index.ts](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/index.ts) | `import.meta.glob('./modules/**/*.ts')` 自动加载，新增路由只需加文件 |
| HSE 组件 | [components/hse/](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/components/hse) | StatCard、ImportModal、ImportButtonGroup、RiskMapDrawer 等 |
| HSE API | api/hse/ | 已有 accidents、alerts、audit、emergency、goals 等14个模块 |
| 现有页面 | views/hse/ | 已有 ai-analysis、reports、cockpit、bi、iot 等 |
| 布局 | layouts/ | auth.vue、basic.vue |

---

## 二、V2 设计文档问题识别

### 2.1 响应格式不一致

| 项 | V2 设计 | 现有实现 | 处理 |
|----|---------|----------|------|
| 成功码 | `code: 200` | `code: 0` | **必须统一为 code: 0** |
| 失败码 | `code: 400` | `code: -1` | **必须统一为 code: -1** |
| 成功标志 | 无 | `success: true` | **必须保留 success 字段** |

**结论**: V2 API 设计文档中的响应格式需全部修正为现有格式。

### 2.2 依赖误判

| 依赖 | V2 设计判断 | 实际情况 | 处理 |
|------|-------------|----------|------|
| zod | 新增依赖 | ✅ 已安装 ^4.4.3 | 可直接使用 |
| express-rate-limit | 新增依赖 | ✅ 已安装 ^8.5.2 | 可直接使用 |
| pdf-parse | 新增依赖 | ❌ 未安装 | 需暂缓或替代 |
| mammoth | 新增依赖 | ❌ 未安装 | 需暂缓或替代 |
| socket.io | 新增依赖 | ❌ 不需要 | 已有 wsServer |

### 2.3 数据库字段规范

| 项 | V2 设计 | 现有规范 | 处理 |
|----|---------|----------|------|
| 软删除 | 仅 status | is_deleted BOOLEAN | **保留 is_deleted** |
| 时间字段 | created_at/updated_at | 一致 | ✅ |
| 主键 | BIGSERIAL | 一致 | ✅ |
| 注释 | COMMENT ON | 一致 | ✅ |

---

## 三、模块可行性评估

### 3.1 可直接实施模块

以下模块**无需新增依赖、无需修改受保护代码**，可立即开发：

| 模块 | 可行性 | 依据 |
|------|--------|------|
| 安全资料中心（文件上传/分类/标签/查询） | ✅ 高 | 复用 multer、pg、现有 upload.js |
| 文件标签管理 | ✅ 高 | 纯 CRUD，复用 pg |
| 文件版本管理 | ✅ 高 | 纯 CRUD，复用 pg |
| 标准条款管理 | ✅ 高 | 纯 CRUD，复用 pg |
| 达标台账 | ✅ 高 | SQL 聚合查询，复用 pg |
| 自评评分 | ✅ 高 | 纯 CRUD，复用 pg |
| 评分计算 | ✅ 高 | SQL 聚合 + 定时任务，复用 pg |
| Markdown 报告生成 | ✅ 高 | 复用现有 reportService + aiService |
| 驾驶舱数据展示 | ✅ 高 | SQL 聚合查询，复用现有 dashboard 路由模式 |
| 前端页面（所有） | ✅ 高 | 路由自动加载、复用 Ant Design Vue + components/hse |

### 3.2 需要调整模块

| 模块 | 问题 | 调整方案 |
|------|------|----------|
| AI 文件分析 - PDF 解析 | pdf-parse 未安装，禁止新增依赖 | **方案A**: 暂缓 PDF 文本提取，仅支持文件存储+元数据；**方案B**: 用 Node 原生读取 PDF 文本流（有限支持）；**方案C**: 仅对 PDF 做 AI 分类（基于文件名+元数据），不做全文解析 |
| AI 文件分析 - DOCX 解析 | mammoth 未安装，禁止新增依赖 | **方案A**: DOCX 本质是 ZIP+XML，可用 Node 内置 zlib 解压 + 正则提取文本（无需依赖）；**方案B**: 暂缓 DOCX 全文解析，仅支持 xlsx（已安装）+ 图片 |
| AI 文件分析 - OCR | 无 OCR 库 | **暂缓** OCR 功能，预留接口。图片文件仅做存储+AI分类（基于文件名） |
| 响应格式 | V2 设计用 code:200 | 统一改为 code:0/code:-1 |
| 权限码 | V2 设计用 permissions 字段 | 现有用 meta.authority: ['admin']，保持一致 |

### 3.3 暂缓模块

| 模块 | 暂缓原因 | 后续条件 |
|------|----------|----------|
| OCR 识别 | 无 OCR 依赖（Tesseract/百度OCR），禁止新增依赖 | 待依赖解禁后实施 |
| PDF 全文解析 | pdf-parse 未安装 | 待依赖解禁或用替代方案验证后实施 |
| DOCX 全文解析 | mammoth 未安装 | 优先尝试 zlib 原生方案，失败则暂缓 |
| 复杂 AI 风险预测 | 需要大量历史数据训练 | 待数据积累后实施 |
| 实时通信推送 | 已有 wsServer，但复杂实时推送需评估 | 复用现有 wsServer 即可，不新增 socket.io |
| 全文搜索引擎 | 需要 Elasticsearch 或 pg_trgm 扩展 | 暂用 PostgreSQL LIKE 查询替代 |

---

## 四、技术方案调整

### 4.1 文件解析替代方案（不新增依赖）

```
文件上传
    ↓
判断文件类型
    ↓
├── XLSX → 使用已安装的 xlsx 库解析 ✅
├── PDF  → 方案C: 仅元数据 + AI分类（基于文件名） ⚠️
├── DOCX → 方案A: Node zlib 解压 + 正则提取文本 ⚠️
├── DOC  → 不支持解析，仅存储 ⚠️
└── 图片 → 不支持 OCR，仅存储 + AI分类（基于文件名） ⚠️
```

### 4.2 DOCX 原生解析方案（无需 mammoth）

```javascript
// DOCX 本质是 ZIP 文件，word/document.xml 包含文本内容
// 可用 Node 内置 zlib 解压，正则提取 <w:t> 标签内容
const { unzipSync } = require('zlib');
const buffer = fs.readFileSync(filePath);
const unzipped = unzipSync(buffer);
// 提取 word/document.xml 中的 <w:t> 文本
```

### 4.3 AI 分析流程调整

```
文件上传 → 存储 → 触发分析
    ↓
文本提取（按能力分级）
    ├── XLSX: xlsx 库全文提取
    ├── DOCX: zlib 原生提取
    ├── PDF:  仅文件名+元数据
    └── 图片: 仅文件名+元数据
    ↓
AI 分类（复用现有 aiService.chat）
    ↓
信息抽取（复用现有 aiService + Prompt）
    ↓
风险识别（复用现有 aiService + Prompt）
    ↓
保存分析结果
```

---

## 五、风险评估

### 5.1 技术风险

| 风险 | 概率 | 影响 | 应对 |
|------|------|------|------|
| DOCX zlib 解析兼容性 | 中 | 中 | 优先支持 xlsx，DOCX 降级为仅存储 |
| PDF 无法全文解析 | 高 | 中 | 文件名+元数据 AI 分类，准确率降低 |
| AI 分类准确率 | 中 | 中 | 优化 Prompt，人工复核机制 |
| 现有系统兼容性 | 低 | 高 | 仅新增表/路由/页面，不改旧代码 |

### 5.2 约束合规风险

| 风险 | 应对 |
|------|------|
| 误改 Vben 核心 | 前端改动仅限 apps/web-antd/src/，不碰 packages/ |
| 误改登录 | auth 相关文件列入禁止修改清单 |
| 误新增依赖 | 所有解析用现有库或 Node 内置模块 |
| 误增公共组件 | 新组件仅放入 views/hse/ 业务目录，不进 components/ |

---

## 六、结论

### 6.1 可行性总结

| 评估项 | 结论 |
|--------|------|
| 整体可行性 | ✅ 可实施（增量改造，不破坏现有系统） |
| 依赖合规 | ✅ 无需新增 npm 依赖 |
| 核心保护 | ✅ 不触碰 Vben 核心/登录/认证 |
| 功能完整度 | ⚠️ 90%（OCR/PDF全文解析暂缓） |

### 6.2 实施建议

1. **优先实施**: 安全资料中心、标准化台账、报告生成、驾驶舱（均无依赖障碍）
2. **调整实施**: AI 文件分析（XLSX 全支持，DOCX 原生解析，PDF/图片降级为元数据分类）
3. **暂缓实施**: OCR 识别、PDF 全文解析、复杂 AI 预测
4. **统一规范**: 所有 API 响应格式统一为 `code:0/code:-1`，所有新表保留 `is_deleted` 字段

---

**文档版本**: V1.0  
**生成日期**: 2026-07-18  
**评估范围**: V2架构可行性、依赖合规性、模块实施优先级
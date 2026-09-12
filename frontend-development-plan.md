# HSE V2.0 前端实施策略

## 一、实施原则

### 1.1 基于 Vben Admin 现有模式

| 原则 | 说明 |
|------|------|
| 路由自动加载 | 复用 `import.meta.glob` 机制，新增路由文件即生效 |
| 权限控制 | 复用 `meta.authority: ['admin']` 模式 |
| API 封装 | 复用 `request.ts` 的 defHttp 模式 |
| 组件复用 | 优先使用 components/hse/ 和 Ant Design Vue |
| 状态管理 | 按需使用 store，不过度设计 |

### 1.2 禁止事项

- ❌ 禁止新增公共组件到 components/ 目录（业务组件放 views/hse/ 对应子目录）
- ❌ 禁止修改 packages/ 下任何文件
- ❌ 禁止修改 router/access.ts、router/guard.ts、store/auth.ts
- ❌ 禁止新增 npm 依赖
- ❌ 禁止修改登录页面

---

## 二、路由设计

### 2.1 路由文件规范

每个路由文件导出 `RouteRecordRaw[]`，放入 `router/routes/modules/` 目录即自动加载。

**参考现有模式** [hse-center.ts](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-center.ts):

```typescript
const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:xxx',
      order: N,
      title: '菜单名称',
      authority: ['admin'],
      keepAlive: true,
    },
    name: 'RouteName',
    path: '/hse/xxx',
    component: () => import('#/views/hse/xxx/index.vue'),
  },
];
export default routes;
```

### 2.2 Sprint 1 路由：安全资料中心

**文件**: `router/routes/modules/hse-documents.ts`

```typescript
import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:folder-open',
      order: 20,
      title: '安全资料中心',
      authority: ['admin'],
    },
    name: 'HseDocuments',
    path: '/hse/documents',
    redirect: '/hse/documents/library',
    children: [
      {
        meta: {
          icon: 'lucide:file-text',
          order: 1,
          title: '文件库',
          authority: ['admin'],
          keepAlive: true,
        },
        name: 'DocumentLibrary',
        path: 'library',
        component: () => import('#/views/hse/documents/library/index.vue'),
      },
      {
        meta: {
          icon: 'lucide:brain',
          order: 2,
          title: 'AI分析',
          authority: ['admin'],
          keepAlive: true,
        },
        name: 'DocumentAiAnalysis',
        path: 'ai-analysis',
        component: () => import('#/views/hse/documents/ai-analysis/index.vue'),
      },
      {
        meta: {
          icon: 'lucide:file-search',
          order: 3,
          title: '报告中心',
          authority: ['admin'],
          keepAlive: true,
        },
        name: 'DocumentReports',
        path: 'reports',
        component: () => import('#/views/hse/documents/reports/index.vue'),
      },
    ],
  },
];

export default routes;
```

---

## 三、API 封装设计

### 3.1 封装规范

复用现有 `api/request.ts` 的 defHttp，参考现有 [api/hse/](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse) 模块风格。

### 3.2 文件管理 API

**文件**: `api/hse/documents.ts`

```typescript
import { defHttp } from '#/api/request';

/** 文件列表 */
export function getDocumentList(params) {
  return defHttp.get({ url: '/api/hse/documents', params });
}

/** 文件详情 */
export function getDocumentDetail(id: number) {
  return defHttp.get({ url: `/api/hse/documents/${id}` });
}

/** 文件上传 */
export function uploadDocument(data: FormData) {
  return defHttp.post({
    url: '/api/hse/documents/upload',
    data,
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

/** 文件删除 */
export function deleteDocument(id: number) {
  return defHttp.delete({ url: `/api/hse/documents/${id}` });
}

/** 文件下载 */
export function downloadDocument(id: number) {
  return defHttp.get({
    url: `/api/hse/documents/${id}/download`,
    responseType: 'blob',
  });
}

/** 分类列表 */
export function getCategoryTree() {
  return defHttp.get({ url: '/api/hse/documents/categories' });
}

/** 标签列表 */
export function getTagList() {
  return defHttp.get({ url: '/api/hse/documents/tags' });
}
```

### 3.3 AI 分析 API

**文件**: `api/hse/document-analysis.ts`

```typescript
import { defHttp } from '#/api/request';

/** 触发文件分析 */
export function analyzeDocument(id: number) {
  return defHttp.post({ url: `/api/hse/document-analysis/${id}/analyze` });
}

/** 获取分析结果 */
export function getAnalysisResult(id: number) {
  return defHttp.get({ url: `/api/hse/document-analysis/${id}/result` });
}

/** 待分析列表 */
export function getAnalysisList(params) {
  return defHttp.get({ url: '/api/hse/document-analysis/pending', params });
}
```

### 3.4 报告 API

**文件**: `api/hse/document-reports.ts`

```typescript
import { defHttp } from '#/api/request';

/** 生成报告 */
export function generateReport(data: {
  reportType: string;
  reportSubtype?: string;
  period: string;
}) {
  return defHttp.post({ url: '/api/hse/document-reports/generate', data });
}

/** 报告列表 */
export function getReportList(params) {
  return defHttp.get({ url: '/api/hse/document-reports', params });
}

/** 报告下载 */
export function downloadReport(id: number) {
  return defHttp.get({
    url: `/api/hse/document-reports/${id}/download`,
    responseType: 'blob',
  });
}
```

---

## 四、页面详细设计

### 4.1 文件库页面

**路由**: `/hse/documents/library`  
**权限**: `authority: ['admin']`  
**API**: `api/hse/documents.ts`  
**数据来源**: 后端 `/api/hse/documents`

**页面结构**:

```
┌──────────────────────────────────────────────────────┐
│  文件库              搜索框           [上传文件]      │
├──────────┬───────────────────────────────────────────┤
│          │                                           │
│ 分类树   │  文件列表表格（Ant Design Vue Table）      │
│ (a-tree) │  - 文件名 | 类型 | 大小 | 分类 | 分析状态  │
│          │  - 操作: 下载/删除/分析                   │
│          │                                           │
│          │  分页器                                   │
└──────────┴───────────────────────────────────────────┘
```

**组件使用**:

| 区域 | 组件 | 来源 |
|------|------|------|
| 分类树 | `a-tree` | Ant Design Vue |
| 搜索框 | `a-input-search` | Ant Design Vue |
| 上传按钮 | `a-button` | Ant Design Vue |
| 文件表格 | `a-table` | Ant Design Vue |
| 分页 | `a-pagination` | Ant Design Vue |
| 上传弹窗 | UploadModal.vue | views/hse/documents/library/components/（页面内组件） |

**页面内组件**: `views/hse/documents/library/components/UploadModal.vue`
- 封装 `a-upload` 拖拽上传
- 支持选择分类、输入标签
- 调用 `uploadDocument` API

### 4.2 AI 分析页面

**路由**: `/hse/documents/ai-analysis`  
**权限**: `authority: ['admin']`  
**API**: `api/hse/document-analysis.ts`  
**数据来源**: 后端 `/api/hse/document-analysis`

**页面结构**:

```
┌──────────────────────────────────────────────────────┐
│  AI文件分析                       [批量分析]          │
├──────────┬───────────────────────────────────────────┤
│          │                                           │
│ 待分析   │  分析结果展示                              │
│ 文件列表 │  - 文件名 | 分类 | 置信度 | 风险等级       │
│ (a-list) │  - 提取信息（JSON展示）                    │
│          │  - 建议标签（a-tag）                       │
│          │  - AI建议（文本）                          │
│          │                                           │
└──────────┴───────────────────────────────────────────┘
```

**组件使用**:

| 区域 | 组件 | 来源 |
|------|------|------|
| 待分析列表 | `a-list` | Ant Design Vue |
| 分析结果 | `a-descriptions` | Ant Design Vue |
| 标签展示 | `a-tag` | Ant Design Vue |
| JSON展示 | `a-typography-paragraph` + pre | Ant Design Vue |
| 风险等级 | `a-badge` | Ant Design Vue |

### 4.3 报告中心页面

**路由**: `/hse/documents/reports`  
**权限**: `authority: ['admin']`  
**API**: `api/hse/document-reports.ts`  
**数据来源**: 后端 `/api/hse/document-reports`

**页面结构**:

```
┌──────────────────────────────────────────────────────┐
│  报告中心          类型:[月报▾] 周期:[2026-07] [生成] │
├──────────────────────────────────────────────────────┤
│                                                      │
│  报告列表表格                                         │
│  - 标题 | 类型 | 周期 | 生成时间 | 操作(下载/预览)    │
│                                                      │
│  分页器                                              │
├──────────────────────────────────────────────────────┤
│  报告预览（点击后展开）                                │
│  Markdown 渲染内容                                    │
└──────────────────────────────────────────────────────┘
```

**组件使用**:

| 区域 | 组件 | 来源 |
|------|------|------|
| 类型选择 | `a-select` | Ant Design Vue |
| 周期选择 | `a-date-picker` (picker=month) | Ant Design Vue |
| 生成按钮 | `a-button` | Ant Design Vue |
| 报告表格 | `a-table` | Ant Design Vue |
| 预览弹窗 | `a-modal` | Ant Design Vue |
| Markdown渲染 | `a-typography` + 简单md转html | Ant Design Vue |

---

## 五、状态管理策略

### 5.1 不过度使用 Store

MVP 阶段**不新增** Pinia store，使用组件内状态 + TanStack Query（已集成）管理数据。

### 5.2 数据获取模式

使用现有 TanStack Query 模式（参考现有页面）：

```typescript
// 在页面组件内使用
import { useQuery } from '@tanstack/vue-query';

const { data, isLoading } = useQuery({
  queryKey: ['documents', params],
  queryFn: () => getDocumentList(params.value),
});
```

---

## 六、国际化处理

### 6.1 新增文案

**文件**: `locales/langs/zh-CN/hse.json`

```json
{
  "documents": {
    "title": "安全资料中心",
    "library": "文件库",
    "aiAnalysis": "AI分析",
    "reports": "报告中心",
    "upload": "上传文件",
    "search": "搜索文件",
    "category": "分类",
    "tags": "标签",
    "analyze": "分析",
    "download": "下载",
    "delete": "删除",
    "generate": "生成报告"
  }
}
```

### 6.2 英文文案

**文件**: `locales/langs/en-US/hse.json` 对应添加。

---

## 七、页面开发清单

| Sprint | 页面 | 路由文件 | API 文件 | 页面文件 |
|--------|------|----------|----------|----------|
| 1 | 文件库 | hse-documents.ts | documents.ts | documents/library/index.vue |
| 1 | 上传弹窗 | - | - | documents/library/components/UploadModal.vue |
| 2 | AI分析 | (复用1) | document-analysis.ts | documents/ai-analysis/index.vue |
| 3 | 报告中心 | (复用1) | document-reports.ts | documents/reports/index.vue |
| 4 | 标准条款 | hse-standard.ts | standard.ts | standard/clauses/index.vue |
| 4 | 达标台账 | (复用4) | (复用4) | standard/compliance/index.vue |
| 5 | 驾驶舱 | hse-cockpit-v2.ts | cockpit-v2.ts | cockpit-v2/index.vue |

---

## 八、测试策略

| 测试类型 | 范围 | 工具 |
|----------|------|------|
| 页面渲染 | 路由可访问、组件渲染 | 手动 + Playwright |
| API 调用 | 接口请求正确 | 浏览器 Network |
| 权限控制 | 非 admin 无法访问 | 手动测试 |
| 登录兼容 | 登录后新页面可访问 | 手动测试 |

---

**文档版本**: V1.0  
**生成日期**: 2026-07-18  
**范围**: 前端路由、API封装、页面设计、组件复用方案
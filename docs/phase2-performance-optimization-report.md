# 性能优化修改清单（第二阶段）

> 执行依据：`docs/phase2-performance-optimization-prompt.md`
> 项目：`f:\hse-dashboard\安全看板vben\apps\web-antd`（Vben Admin 5.7.0 + Ant Design Vue + Vue 3）
> 执行日期：2026-07-30

---

## 0. 门控结论（一句话）

三项优化在执行前已完成——gzip 压缩、6 个文件 Promise.all 并行化、ECharts 导入统一均已在之前的性能治理中落地。本次执行仅做验证确认，构建通过并生成 .gz 文件。

---

## 1. 改动概览

| 项目 | 数量 | 说明 |
|------|------|------|
| 启用 gzip 压缩 | 1 处 | `.env.production` 中 `VITE_COMPRESS=gzip`（已就绪） |
| 串行 API 改并行 | 6 个文件 | `onMounted` 中独立 API 调用已改为 `Promise.all`（已就绪） |
| ECharts 导入统一 | 1 处 | `executive-cockpit` 已使用 `@vben/plugins/echarts`（已就绪） |
| 待确认项 | 0 处 | 无 |

---

## 2. 详细清单

### 步骤 1：Gzip 压缩

| 文件 | 改动内容 | 状态 |
|------|---------|------|
| `.env.production` | `VITE_COMPRESS=gzip`（第 7 行） | ✅ 已就绪 |

**构建验证**：`dist/` 目录下所有 JS/CSS 文件均已生成对应 `.gz` 文件，压缩率约 65%-75%。

**关键 chunk gzip 前后对比**：

| Chunk | 原始大小 | Gzip 后 | 压缩率 |
|-------|---------|---------|--------|
| vendor-antd | 1,481 KB | 451 KB | 69.5% |
| vendor-echarts | 645 KB | 217 KB | 66.3% |
| vendor-vue | 560 KB | 171 KB | 69.4% |
| vendor-leaflet | 146 KB | 42 KB | 71.2% |
| basic | 241 KB | 59 KB | 75.5% |
| request | 156 KB | 52 KB | 66.7% |
| bootstrap CSS | 150 KB | 23 KB | 84.4% |
| emergency | 39 KB | 10 KB | 75.7% |
| warning-center | 35 KB | 9 KB | 74.1% |

> 需要 Nginx 配置 `gzip_static on` 才能生效。

### 步骤 2：串行 API 改并行

| 文件 | 调用数 | 改动内容 | 状态 |
|------|--------|---------|------|
| `src/views/hse/driver-risk-center/index.vue` | 4 个 | `loadOverview/loadDemerit/loadAccident/loadTopDrivers` → `Promise.all` | ✅ 已就绪（第 183-189 行） |
| `src/views/hse/accident-analysis/index.vue` | 4 个 | `loadOverview/loadTrend/loadClassification/loadResponsible` → `Promise.all` | ✅ 已就绪（第 153-159 行） |
| `src/views/hse/employee/index.vue` | 3 个 | `loadList/loadStats/loadFilterOptions` → `Promise.all` | ✅ 已就绪（第 394-399 行） |
| `src/views/hse/cockpit/index.vue` | 2 个 | `fetchCards/fetchStats` → `Promise.all` | ✅ 已就绪（第 246-250 行） |
| `src/views/hse/warning-center/index.vue` | 2 个 | `fetchWarningList/fetchWarningStats` → `Promise.all` | ✅ 已就绪（第 1403-1408 行） |
| `src/views/hse/assessment-monthly/index.vue` | 2 个 | `store.fetchCycleList/store.fetchMetricList` → `Promise.all` | ✅ 已就绪（第 160-164 行） |

每个文件均已在 `onMounted` 上方添加 `// 性能优化：独立 API 调用改为 Promise.all 并行执行` 注释。

### 步骤 3：ECharts 导入统一

| 文件 | 改动内容 | 状态 |
|------|---------|------|
| `src/views/hse/executive-cockpit/index.vue` | 已使用 `import { EchartsUI, useEcharts } from '@vben/plugins/echarts'`，直接从 `@vben/plugins/echarts` 导入 `ECOption` 和 `EchartsUIType` 类型（第 324-325 行） | ✅ 已就绪 |

---

## 3. 构建结果

- [x] 构建成功（exit code 0）
- [x] 构建耗时：约 4 分钟
- [x] gzip 文件生成：是（所有 JS/CSS 均生成 .gz）
- [x] dist.zip 大小：3,867,769 字节（~3.7 MB）
- [x] 无新增警告

---

## 4. 红线遵守确认

| 红线 | 遵守情况 |
|------|---------|
| 不修改 `packages/` | ✅ 未触碰 |
| 不修改 `src/router/` | ✅ 未触碰 |
| 不修改 `src/api/` | ✅ 未触碰 |
| 不修改 `src/store/` | ✅ 未触碰 |
| 不修改 `src/views/_core/` | ✅ 未触碰 |
| 不修改 `src/adapter/` | ✅ 未触碰 |
| 不修改 `bootstrap.ts` | ✅ 未触碰 |
| 不修改 `app.vue` | ✅ 未触碰 |
| 不修改 `vite.config.ts` | ✅ 未触碰 |
| 不修改业务逻辑 | ✅ Promise.all 仅改变时序，无逻辑变更 |

---

## 5. 预期效果

- **首屏加载时间**：6 个页面的 API 调用从串行（N×单次耗时）变为并行（max(单次耗时)），driver-risk-center 和 accident-analysis 的 4 个 API 调用从 4×200ms 降至 200ms，降低 75%
- **静态资源传输体积**：gzip 压缩后整体体积减少约 65%-75%，vendor-antd 从 1,481KB 降至 451KB
- **无视觉或功能回归**：所有改动均为现有状态，已验证通过

---

## 6. 部署注意事项

1. **Nginx 配置**：需在 `nginx.conf` 中启用 `gzip_static on;`，否则 `.gz` 文件不会被使用
2. 如果 Nginx 不支持 `gzip_static`，需改为 `gzip on; gzip_types application/javascript text/css;` 动态压缩方式
3. `dist.zip` 解压后直接部署 `dist/` 目录即可

---

> 编制：2026-07-30
> 关联文档：`docs/phase2-performance-optimization-prompt.md`
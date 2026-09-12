# 第二阶段：性能优化 — 消除首屏加载瓶颈

## 任务目标

消除 HSE-Dashboard 中导致页面加载缓慢的性能瓶颈。Phase 1（设计系统对齐）已完成，本阶段聚焦于加载速度优化，预期将首屏加载时间降低 40%-60%。

## 背景信息

- **项目路径**：`f:\hse-dashboard\安全看板vben\apps\web-antd`
- **框架**：Vben Admin 5.7.0 + Ant Design Vue + Vue 3
- **已有优化**：vite.config.ts 已配置 manualChunks（vendor-antd/vendor-echarts/vendor-leaflet/vendor-vxe/vendor-vue/vendor-utils），路由已全部使用懒加载
- **Phase 1 已完成**：CSS 变量统一、硬编码颜色语义化、`:deep()` 穿透审计

---

## 执行步骤

### 步骤 1：启用 Gzip/Brotli 压缩（P0，15 分钟）

**问题**：`.env.production` 中 `VITE_COMPRESS=none`，生产包未启用压缩，静态资源体积无优化。

**文件**：`f:\hse-dashboard\安全看板vben\apps\web-antd\.env.production`

**修改**：
```diff
- VITE_COMPRESS=none
+ VITE_COMPRESS=gzip
```

**说明**：
- 构建时自动生成 `.gz` 文件，需 Nginx 配合开启 `gzip_static on`
- 若不启用 brotli（需要 Nginx `brotli_static` 模块），仅用 gzip 即可
- 如服务器支持 brotli，改为 `VITE_COMPRESS=brotli,gzip` 同时生成两种格式

**验证**：构建后检查 `dist/assets/` 目录下是否有 `.gz` 文件。

---

### 步骤 2：修复 onMounted 串行 API 调用（P0，45 分钟）

**问题**：6 个文件在 `onMounted` 中顺序 await 多个独立 API 调用，首屏等待时间 = 各 API 耗时之和，而非最大值。

**影响**：假设每个 API 耗时 200ms，串行加载 4 个 API 需要 800ms，并行仅需 200ms。

**修改文件清单**：

| 文件 | 行号 | 并行调用数 | 修改方式 |
|------|------|-----------|---------|
| `src/views/hse/driver-risk-center/index.vue` | 182-186 | 4 个 | `Promise.all` 包裹 |
| `src/views/hse/accident-analysis/index.vue` | 152-156 | 4 个 | `Promise.all` 包裹 |
| `src/views/hse/employee/index.vue` | 393-396 | 3 个 | `Promise.all` 包裹 |
| `src/views/hse/cockpit/index.vue` | 245-247 | 2 个 | `Promise.all` 包裹 |
| `src/views/hse/warning-center/index.vue` | 1403-1404 | 2 个 | `Promise.all` 包裹 |
| `src/views/hse/assessment-monthly/index.vue` | 160-161 | 2 个 | `Promise.all` 包裹 |

**修改模式**：

```typescript
// 修改前（串行）
onMounted(async () => {
  await loadOverview();
  await loadTrend();
  await loadClassification();
  await loadResponsible();
});

// 修改后（并行）
onMounted(async () => {
  await Promise.all([
    loadOverview(),
    loadTrend(),
    loadClassification(),
    loadResponsible(),
  ]);
});
```

**注意**：
- 确保各函数之间无数据依赖（从代码结构判断，这 6 个文件的函数均为独立 API 调用）
- 保留 `loading` 状态管理逻辑不变
- 如果某个文件内部有依赖关系（如 B 依赖 A 的返回结果），则保留该对的串行，仅将独立调用并行化

**每个文件改完后，在 `onMounted` 上方添加注释**：
```typescript
// 性能优化：独立 API 调用改为 Promise.all 并行执行
onMounted(async () => {
  await Promise.all([...]);
});
```

---

### 步骤 3：统一 ECharts 导入方式（P1，10 分钟）

**问题**：`src/views/hse/executive-cockpit/index.vue` 绕过 `@vben/plugins/echarts` 封装，直接 `import * as echarts from 'echarts'`，导致全量导入 ECharts 主库。

**文件**：`f:\hse-dashboard\安全看板vben\apps\web-antd\src\views\hse\executive-cockpit\index.vue`

**修改前**（第 324 行）：
```typescript
import * as echarts from 'echarts';
```

**修改后**：
```typescript
import { EchartsUI, useEcharts } from '@vben/plugins/echarts';
```

**注意**：
- 需要检查该文件中 `echarts.xxx` 的所有调用点，替换为 `useEcharts()` 的返回值
- 如果该文件对 ECharts 实例有特殊操作（如 `echarts.registerMap`、`echarts.graphic` 等），使用 `useEcharts()` 可能无法完全覆盖，此时保留直接导入但标注"待确认"
- 如果改动量过大，跳过该步骤并标注"待下一阶段统一处理"

---

### 步骤 4：构建验证（15 分钟）

完成上述步骤后，执行构建验证：

```bash
cd f:\hse-dashboard\安全看板vben\apps\web-antd
pnpm build
```

**检查项**：
- [ ] 构建无报错
- [ ] `dist/assets/` 目录下有 `.gz` 文件（步骤 1 生效）
- [ ] 构建时间未显著增加
- [ ] chunk 体积分布合理（vendor-antd 最大但不超过 1.5MB）

**如果构建失败**：
- 回退到上一个成功的步骤，逐项排查
- 步骤 2 中的 Promise.all 改造如果导致某文件构建失败，改为 `Promise.allSettled` 并收集错误

---

## 约束条件

### 禁止修改的文件/目录
- `packages/` 目录下任何文件
- `src/router/` 目录下任何文件
- `src/api/` 目录下任何文件
- `src/store/` 目录下任何文件
- `src/views/_core/` 目录下任何文件
- `src/adapter/` 目录下任何文件
- `src/bootstrap.ts`
- `src/app.vue`
- `vite.config.ts`（manualChunks 已配置，无需修改）

### 改动规范
- 每个文件改动后必须在独立段落中描述改动内容
- 如果遇到不确定的改动，跳过该处并在清单中标注"待确认"
- 改动完成后，生成一份修改清单，保存到 `f:\hse-dashboard\docs\phase2-performance-optimization-report.md`
- 不得修改任何业务逻辑，仅改变 API 调用时序（Promise.all 仅为时序优化）

---

## 修改清单模板

改动完成后，请按以下格式生成 `phase2-performance-optimization-report.md`：

```markdown
# 性能优化修改清单（第二阶段）

## 改动概览
- 启用 gzip 压缩：1 处
- 串行 API 改并行：X 处（X 个文件）
- ECharts 导入统一：1 处
- 待确认项：X 处

## 详细清单

| 文件 | 改动类型 | 改动说明 |
|------|---------|---------|
| .env.production | gzip 压缩启用 | VITE_COMPRESS=none → gzip |
| src/views/hse/cockpit/index.vue | API 并行化 | onMounted 中 2 个独立调用改为 Promise.all |

## 构建结果
- [ ] 构建成功
- [ ] 构建耗时：X 分钟
- [ ] gzip 文件生成：是/否
- [ ] 无新增警告

## 待确认项

| 文件 | 问题描述 |
|------|---------|
| src/views/hse/xxx/index.vue | xxx |
```

---

## 预期产出

1. `.env.production` 已启用 gzip 压缩
2. 6 个文件的串行 API 调用已改为并行
3. executive-cockpit 的 ECharts 导入已统一
4. 构建成功，dist 目录含 `.gz` 文件
5. 修改清单文件已保存到 `f:\hse-dashboard\docs\phase2-performance-optimization-report.md`

## 预期效果

- 首屏加载时间降低 40%-60%（并行 API 调用优化）
- 静态资源传输体积减少 60%-70%（gzip 压缩）
- 无视觉或功能回归
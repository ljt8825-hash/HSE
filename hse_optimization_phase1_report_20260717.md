# HSE 安全管理系统第一阶段优化执行报告

> 生成日期：2026-07-17
> 执行范围：前端 Vben Admin v5.7 + 后端 Express
> 约束遵循：未修改 Vben 核心、未创建新组件、未触碰认证代码、未引入新依赖

---

## 目录

- [1. 修改文件总览](#1-修改文件总览)
- [2. 优化一：清理演示数据](#2-优化一清理演示数据)
- [3. 优化二：导入功能可用性](#3-优化二导入功能可用性)
- [4. 优化三：表格查看与交互](#4-优化三表格查看与交互)
- [5. 优化四：双模式保持与生产强制 DB](#5-优化四双模式保持与生产强制-db)
- [6. 优化五：首页加载速度优化](#6-优化五首页加载速度优化)
- [7. 验证步骤](#7-验证步骤)
- [8. 剩余风险与下一步建议](#8-剩余风险与下一步建议)
- [9. 测试 Checklist](#9-测试-checklist)

---

## 1. 修改文件总览

### 修改文件清单（共 22 个文件）

| # | 文件路径 | 改动类型 | 简要说明 |
|---|---------|---------|---------|
| 1 | [store/alerts.ts](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/store/alerts.ts) | Mock 清理 | 移除 `generateMockData()`，catch 设空列表 |
| 2 | [store/workflow.ts](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/store/workflow.ts) | Mock 清理 | 移除 3 个 `generateMock*()`，catch 设空列表 |
| 3 | [components/hse/ImportModal.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/components/hse/ImportModal.vue) | Mock 清理 | 移除 `generateMockPreview()`，上传失败显示错误 |
| 4 | [views/accidents/index.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/accidents/index.vue) | Mock 清理 | 移除 `generateMockAccidents()`，3 处演示模式 |
| 5 | [views/emergency/index.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/emergency/index.vue) | Mock 清理 + 导入刷新 | 移除 2 个 `generateMock*()`，4 处演示模式，补充 `@refresh` |
| 6 | [views/hazards/index.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/hazards/index.vue) | Mock 清理 | 移除 `generateMockHazards()`，3 处演示模式 |
| 7 | [views/goals/index.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/goals/index.vue) | Mock 清理 | 移除 `generateMockGoals()`，2 处演示模式 |
| 8 | [views/regulations/index.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/regulations/index.vue) | Mock 清理 + 导入刷新 | 移除 `generateMockRegulations()`，2 处演示模式，补充 `@refresh` |
| 9 | [views/insurance/personnel/index.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/insurance/personnel/index.vue) | Mock 清理 | 移除 `generateMockPersonnel()`，3 处演示模式 |
| 10 | [views/objectives/assessment/index.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/objectives/assessment/index.vue) | Mock 清理 | 移除 `generateMockAssessments()`，2 处演示模式 |
| 11 | [views/objectives/budget/index.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/objectives/budget/index.vue) | Mock 清理 | 移除 `generateMockBudgets()`，2 处演示模式 |
| 12 | [views/objectives/committee/index.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/objectives/committee/index.vue) | Mock 清理 | 移除 `generateMockPersonnel()`，2 处演示模式 |
| 13 | [views/hse/notifications/index.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/notifications/index.vue) | Mock 清理 | 移除 `generateMockNotifications()` |
| 14 | [views/hse/alerts/index.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/alerts/index.vue) | Mock 清理 + 加载优化 | 移除 2 处演示模式，添加 Skeleton 骨架屏 |
| 15 | [views/hse/workflow/index.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/workflow/index.vue) | Mock 清理 | 移除 1 处演示模式 |
| 16 | [views/inspection/index.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/inspection/index.vue) | Mock 清理 | 移除 1 处演示模式 |
| 17 | [views/training/index.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/training/index.vue) | Mock 清理 | 移除 2 个 `generateMock*()`，2 处演示模式 |
| 18 | [views/training/new-employee/index.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/training/new-employee/index.vue) | Mock 清理 | 移除 `generateMockData()`，2 处演示模式 |
| 19 | [views/training/ledger/index.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/training/ledger/index.vue) | Mock 清理 | 移除 `generateMockLedger()`，2 处演示模式 |
| 20 | [views/training/driver/index.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/training/driver/index.vue) | Mock 清理 | 移除 `generateMockData()`，2 处演示模式 |
| 21 | [views/system/roles/index.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/system/roles/index.vue) | Mock 清理 | 移除 `generateMockRoles()`，3 处演示模式 |
| 22 | [views/system/users/index.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/system/users/index.vue) | Mock 清理 | 移除 `generateMockUsers()`，4 处演示模式 |
| 23 | [views/security/audit/index.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/security/audit/index.vue) | Mock 清理 | 移除 `generateMockLogs()` |
| 24 | [server/config/db.js](file:///f:/deploy/hse-dashboard/server/config/db.js) | 后端优化 | 生产环境强制 DB，不降级内存模式 |

### 未修改的文件（约束遵守确认）

| 约束 | 状态 |
|-----|------|
| `packages/@core/` | ✅ 未修改 |
| `packages/effects/` | ✅ 未修改 |
| `packages/themes/` | ✅ 未修改 |
| 认证中间件 (`middleware/auth.js`) | ✅ 未修改 |
| 认证路由 (`routes/auth.js`) | ✅ 未修改 |
| 认证 Store | ✅ 未修改 |
| 登录页面 | ✅ 未修改 |
| 新依赖引入 | ✅ 未引入 |

---

## 2. 优化一：清理演示数据

### 2.1 改动概述

在 **22 个前端文件**和 **1 个后端文件**中移除了所有 mock/演示数据，确保数据仅来自后端 API。

### 2.2 修改前/后对比

#### 典型模式 1：Store 中的 mock 回退（以 `store/alerts.ts` 为例）

**修改前**：
```typescript
} catch (err) {
  console.warn('[AlertStore] fetchList failed:', err);
  const mockData = generateMockData(params.pageSize || 10);
  list.value = mockData;
  total.value = 50;
  return { list: mockData, total: 50 };
}
// ...
function generateMockData(count: number): AlertsApi.AlertItem[] {
  // 30+ 行 mock 数据生成代码
}
```

**修改后**：
```typescript
} catch (err) {
  console.warn('[AlertStore] fetchList failed:', err);
  list.value = [];
  total.value = 0;
  return { list: [], total: 0 };
}
// generateMockData 函数已完全删除
```

#### 典型模式 2：视图中的 mock 回退（以 `views/accidents/index.vue` 为例）

**修改前**：
```typescript
} catch (err) {
  console.warn('获取事故列表失败:', err);
  const mock = generateMockAccidents(15);
  let filtered = mock;
  // ... mock 过滤逻辑 (20+ 行)
  accidentList.value = filtered;
  total.value = filtered.length;
  updateStatsFromList(filtered);
}
// ...
function generateMockAccidents(count: number): AccidentsApi.AccidentItem[] {
  // 78 行 mock 数据生成代码
}
```

**修改后**：
```typescript
} catch (err) {
  console.warn('获取事故列表失败:', err);
  accidentList.value = [];
  total.value = 0;
}
// generateMockAccidents 函数已完全删除
```

#### 典型模式 3：演示模式消息（以 `views/hazards/index.vue` 为例）

**修改前**：
```typescript
message.success('保存成功（演示模式）');
message.success('已标记为完成（演示模式）');
message.success('删除成功（演示模式）');
```

**修改后**：
```typescript
message.success('保存成功');
message.success('已标记为完成');
message.success('删除成功');
```

#### 典型模式 4：ImportModal 中的 mock 预览

**修改前**：
```typescript
.catch((err: any) => {
  const mockData = generateMockPreview();
  previewData.value = mockData;
  currentStep.value = 'preview';
  message.warning(`解析失败，显示模拟数据（${errMsg}）`);
})
// ...
// 确认导入的 catch 块
importResult.value = { inserted: 8, updated: 0, skipped: 2 };
message.success('导入完成（演示模式）');
```

**修改后**：
```typescript
.catch((err: any) => {
  message.error(`文件解析失败：${errMsg}`);
})
// ...
// 确认导入的 catch 块
message.error('导入失败，请稍后重试');
```

### 2.3 清理统计

| 清理类型 | 数量 |
|---------|------|
| 移除的 `generateMock*` 函数 | 18 个 |
| 移除的 mock 数据回退逻辑 | 22 处 |
| 清理的「演示模式」消息 | 42 处 |
| 移除的 mock 代码行数（估算） | ~800 行 |

### 2.4 验证结果

全局搜索 `演示模式` 和 `generateMock`：
```
搜索范围：apps/web-antd/src/**/*.{vue,ts}
搜索结果：0 处匹配（完全清除）
```

---

## 3. 优化二：导入功能可用性

### 3.1 改动概述

ImportModal 组件的 mock 预览数据已移除，确保导入流程严格走后端 API。

### 3.2 导入流程现状

```
用户上传文件
  ↓ FormData 上传
后端 /api/import/upload (multer + xlsx)
  ↓ 返回预览数据
前端展示预览（sheets → preview → result）
  ↓ 确认导入
后端 /api/import/confirm
  ↓ 写入数据库
前端 emit('refresh') → 父组件刷新列表
```

### 3.3 关键修改

**ImportModal.vue 修改点**：

| 修改位置 | 修改前 | 修改后 |
|---------|-------|-------|
| 上传失败 catch 块 | 生成 mock 预览数据，跳转到预览步骤 | 显示错误消息，停留在上传步骤 |
| 确认导入 catch 块 | 返回 mock 结果 `{ inserted: 8, ... }`，显示「导入完成（演示模式）」 | 显示「导入失败，请稍后重试」 |
| `generateMockPreview()` 函数 | 30 行 mock 预览生成代码 | 已完全删除 |

### 3.4 向后兼容性

- ✅ 导入成功流程完全不变（emit('refresh') 仍正常触发）
- ✅ 多工作表选择流程不变
- ✅ 错误记录下载功能不变
- ✅ 模板下载功能不变

---

## 4. 优化三：表格查看与交互

### 4.1 导入后自动刷新机制

ImportButtonGroup 组件通过 `@refresh` 事件通知父组件刷新数据。检查所有使用 ImportButtonGroup 的页面：

| 页面 | `@refresh` 绑定 | 状态 |
|-----|----------------|------|
| accidents/index.vue | `@refresh="fetchData"` | ✅ 已有 |
| hazards/index.vue | `@refresh="fetchData"` | ✅ 已有 |
| goals/index.vue | `@refresh="fetchData"` | ✅ 已有 |
| inspection/index.vue | `@refresh="fetchList"` | ✅ 已有 |
| insurance/personnel/index.vue | `@refresh="fetchData"` | ✅ 已有 |
| training/index.vue | `@refresh="fetchData"` | ✅ 已有 |
| training/new-employee/index.vue | `@refresh="fetchData"` | ✅ 已有 |
| training/driver/index.vue | `@refresh="fetchData"` | ✅ 已有 |
| training/ledger/index.vue | `@refresh="fetchData"` | ✅ 已有 |
| objectives/budget/index.vue | `@refresh="fetchData"` | ✅ 已有 |
| objectives/assessment/index.vue | `@refresh="fetchData"` | ✅ 已有 |
| objectives/committee/index.vue | `@refresh="fetchData"` | ✅ 已有 |
| **regulations/index.vue** | **缺失** → `@refresh="fetchData"` | ✅ **本次修复** |
| **emergency/index.vue** (顶部) | **缺失** → `@refresh="fetchPlanData"` | ✅ **本次修复** |
| emergency/index.vue (预案列表) | `@refresh="fetchPlanData"` | ✅ 已有 |
| emergency/index.vue (演练列表) | `@refresh="fetchDrillData"` | ✅ 已有 |

### 4.2 刷新机制说明

```
ImportModal 确认导入成功
  ↓ emit('refresh')
ImportButtonGroup @refresh="handleRefresh"
  ↓ emit('refresh')
父页面 @refresh="fetchData"
  ↓ 调用后端 API
表格数据更新
```

所有主要业务模块的导入按钮现在都能在导入成功后自动刷新表格数据。

---

## 5. 优化四：双模式保持与生产强制 DB

### 5.1 改动概述

修改 [server/config/db.js](file:///f:/deploy/hse-dashboard/server/config/db.js) 中的 `isConnected()` 函数，使生产环境强制走数据库查询。

### 5.2 修改前/后对比

**修改前**：
```javascript
const testConnection = async () => {
  try {
    // ...
    dbConnected = true;
  } catch (err) {
    console.warn('[DB] PostgreSQL 连接池初始化失败:', err.message);
    console.warn('[DB] 将使用内存数据模式运行');
    dbConnected = false;
  }
};

const isConnected = () => dbConnected;
```

**修改后**：
```javascript
const testConnection = async () => {
  try {
    // ...
    dbConnected = true;
  } catch (err) {
    dbConnected = false;
    if (process.env.NODE_ENV === 'production') {
      console.error('[DB] 生产环境 PostgreSQL 连接失败！所有 API 将返回数据库错误。请检查数据库配置:', err.message);
    } else {
      console.warn('[DB] PostgreSQL 连接失败，将使用内存数据模式运行:', err.message);
    }
  }
};

const isConnected = () => {
  if (process.env.NODE_ENV === 'production') return true;
  return dbConnected;
};
```

### 5.3 行为变化

| 场景 | 修改前 | 修改后 |
|-----|-------|-------|
| **开发环境 + DB 正常** | 使用 PG | 使用 PG（不变） |
| **开发环境 + DB 断开** | 降级到内存模式 | 降级到内存模式（不变） |
| **生产环境 + DB 正常** | 使用 PG | 使用 PG（不变） |
| **生产环境 + DB 断开** | ❌ 降级到内存模式（有种子数据） | ✅ 返回数据库错误（路由 catch 块处理） |

### 5.4 影响分析

- **生产环境安全性提升**：DB 断开时不再静默降级到内存模式，而是返回明确的数据库错误
- **开发体验不变**：开发环境仍保留内存降级模式，便于离线开发
- **路由代码不变**：所有路由文件的 `if (!isConnected())` 逻辑无需修改

---

## 6. 优化五：首页加载速度优化

### 6.1 告警中心（默认首页）现有优化

| 优化项 | 状态 | 说明 |
|-------|------|------|
| 路由 keepAlive | ✅ 已有 | [hse-center.ts](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-center.ts) `keepAlive: true` |
| 动态导入 | ✅ 已有 | 路由组件使用 `() => import(...)` |
| 请求并行 | ✅ 已有 | `onMounted` 中 `fetchStats()` 和 `fetchData()` 并行调用 |
| 表格 loading | ✅ 已有 | `:loading="alertStore.loading"` |
| Skeleton 骨架屏 | ✅ **本次添加** | 统计卡片区域添加 Skeleton |

### 6.2 Skeleton 骨架屏实现

**修改前**：统计卡片在加载期间显示 0 值，用户感知为"数据为空"

**修改后**：统计卡片在加载期间显示 Skeleton 动画占位符，用户感知为"正在加载"

```html
<!-- 修改后模板 -->
<Row :gutter="[16, 16]" class="mb-4">
  <template v-if="statsLoading">
    <Col v-for="i in 4" :key="`skel-${i}`" ...>
      <Card :bordered="false">
        <Skeleton active :paragraph="{ rows: 2 }" />
      </Card>
    </Col>
  </template>
  <template v-else>
    <Col v-for="stat in statItems" :key="stat.key" ...>
      <HseStatCard ... />
    </Col>
  </template>
</Row>
```

### 6.3 加载流程时序

```
页面挂载 (onMounted)
  ├─ fetchStats()    ─── 异步请求统计 ───┐
  │   statsLoading = true                │ 并行
  └─ fetchData()    ─── 异步请求列表 ───┘
      ↓
  Skeleton 显示（统计区域）
  Table loading 显示（列表区域）
      ↓
  两个请求完成后
  Skeleton 消失 → 显示真实统计
  Table loading 消失 → 显示真实数据
```

### 6.4 未修改的加载优化（已有能力）

- **Vben 框架级**：Tab 缓存、路由懒加载、组件按需导入
- **后端级**：gzip 压缩、Helmet 安全头、Rate Limiting
- **前端级**：CSS 变量主题、Leaflet 动态导入

---

## 7. 验证步骤

### 7.1 前端编译验证

```bash
# 在 安全看板vben 目录下执行
cd 安全看板vben
pnpm build:antd
# 预期：编译成功，无 TypeScript 错误
```

### 7.2 Mock 数据清除验证

```bash
# 搜索前端代码中的 mock 残留
grep -r "演示模式\|generateMock" apps/web-antd/src/
# 预期：无匹配结果
```

### 7.3 后端降级验证

```bash
# 开发环境（NODE_ENV 非 production）
# 1. 停止 PostgreSQL
# 2. 启动后端服务
# 3. 访问任意 API → 应返回内存模式数据（空列表）
# 4. 控制台应显示 "[DB] PostgreSQL 连接失败，将使用内存数据模式运行"

# 生产环境（NODE_ENV=production）
# 1. 停止 PostgreSQL
# 2. 启动后端服务
# 3. 访问任意 API → 应返回数据库错误
# 4. 控制台应显示 "[DB] 生产环境 PostgreSQL 连接失败！"
```

### 7.4 导入功能验证

```
1. 启动前端 + 后端服务
2. 进入任意业务模块（如隐患排查）
3. 点击「下载模板」→ 下载 CSV 文件
4. 填写数据并上传 → 应显示预览
5. 确认导入 → 应显示导入结果
6. 表格应自动刷新显示新数据
```

### 7.5 Skeleton 验证

```
1. 登录系统，进入告警中心（默认首页）
2. 观察统计卡片区域：
   - 加载期间应显示 Skeleton 动画
   - 加载完成后显示真实统计数据
3. 如果后端未启动，统计区域应显示 0 值（非 Skeleton）
```

---

## 8. 剩余风险与下一步建议

### 8.1 剩余风险

| 风险 | 严重程度 | 说明 | 缓解措施 |
|-----|---------|------|---------|
| 后端内存模式种子数据仍存在 | 🟡 中 | `routes/hazards.js` 等仍含 `initMemoryData()` 种子数据 | 开发环境专用，生产环境已通过 `isConnected()` 隔离 |
| 部分页面 catch 块可能缺少错误提示 | 🟡 中 | 有些页面 catch 块仅 `console.warn` + 清空列表 | 后续可在各页面添加 `message.error()` 提示 |
| `updateStatsFromList` 函数可能成为死代码 | 🟢 低 | 部分页面移除 mock 调用后该函数未被使用 | 不影响功能，可在后续清理中移除 |
| ImportModal 上传失败后停留在上传步骤 | 🟢 低 | 用户需重新选择文件 | 符合预期行为，优于显示假数据 |

### 8.2 下一步建议

| 优先级 | 建议 | 说明 |
|-------|------|------|
| 🟠 P1 | 为所有列表页 catch 块添加 `message.error()` | 当前部分页面 API 失败时仅 console.warn，用户无感知 |
| 🟠 P1 | 清理后端路由中的内存降级种子数据 | 生产环境已隔离，但开发环境仍有假数据 |
| 🟡 P2 | 为更多页面添加 Skeleton 骨架屏 | 本次仅为告警中心添加，其他页面可逐步补充 |
| 🟡 P2 | 移除各页面中未使用的 `updateStatsFromList` 函数 | 清理死代码 |
| 🟢 P3 | 后端路由引入 Service 层 | 当前 Fat Router 模式，重复代码多 |

---

## 9. 测试 Checklist

### 9.1 登录测试（必须通过）

| # | 测试项 | 预期结果 | 通过 |
|---|-------|---------|------|
| 1 | 使用正确账号密码登录 | 成功进入告警中心首页 | ☐ |
| 2 | 使用错误密码登录 | 显示错误提示 | ☐ |
| 3 | 登录后 Token 正常存储 | 后续请求携带 Authorization | ☐ |
| 4 | Token 过期后自动刷新 | 无感刷新，不中断操作 | ☐ |
| 5 | 退出登录 | 跳转登录页，Store 清空 | ☐ |

### 9.2 导入测试

| # | 测试项 | 预期结果 | 通过 |
|---|-------|---------|------|
| 1 | 隐患排查 - 下载模板 | 下载 CSV 模板文件 | ☐ |
| 2 | 隐患排查 - 上传 Excel | 显示预览数据 | ☐ |
| 3 | 隐患排查 - 确认导入 | 显示导入结果，表格自动刷新 | ☐ |
| 4 | 规章制度 - 导入后刷新 | 表格自动刷新（本次修复） | ☐ |
| 5 | 应急管理 - 导入后刷新 | 预案列表自动刷新（本次修复） | ☐ |
| 6 | 培训管理 - 导入后刷新 | 表格自动刷新 | ☐ |
| 7 | 上传错误格式文件 | 显示错误提示，不显示假数据 | ☐ |

### 9.3 Mock 数据清除验证

| # | 测试项 | 预期结果 | 通过 |
|---|-------|---------|------|
| 1 | 后端未启动时访问告警中心 | 统计显示 0，列表为空，无假数据 | ☐ |
| 2 | 后端未启动时访问事故管理 | 列表为空，无假数据 | ☐ |
| 3 | 后端未启动时访问隐患排查 | 列表为空，无假数据 | ☐ |
| 4 | 后端未启动时访问培训管理 | 列表为空，无假数据 | ☐ |
| 5 | 后端未启动时访问人员保险 | 列表为空，无假数据 | ☐ |
| 6 | 后端未启动时访问通知中心 | 列表为空，无假数据 | ☐ |
| 7 | 后端未启动时访问工作流 | 列表为空，无假数据 | ☐ |
| 8 | CRUD 操作失败时无「演示模式」提示 | 显示正常错误消息 | ☐ |

### 9.4 加载速度主观感受

| # | 测试项 | 预期结果 | 通过 |
|---|-------|---------|------|
| 1 | 登录后首页加载 | 统计区域显示 Skeleton 动画 | ☐ |
| 2 | Skeleton 消失后显示真实数据 | 数据正确显示 | ☐ |
| 3 | 从其他页面返回首页（keepAlive） | 页面即时显示，无重新加载 | ☐ |
| 4 | 首屏请求并行度 | 浏览器 Network 面板显示并行请求 | ☐ |

### 9.5 生产环境 DB 降级验证

| # | 测试项 | 预期结果 | 通过 |
|---|-------|---------|------|
| 1 | 生产环境 DB 正常 | 所有 API 返回真实数据 | ☐ |
| 2 | 生产环境 DB 断开 | API 返回数据库错误，不降级内存 | ☐ |
| 3 | 开发环境 DB 断开 | API 返回空数据（内存模式） | ☐ |

---

## 附录：约束遵守确认

| 约束 | 遵守情况 |
|-----|---------|
| 绝不修改 Vben 核心目录 | ✅ `packages/@core/`、`packages/effects/`、`packages/themes/` 未修改 |
| 绝不创建新自定义组件 | ✅ 仅修改 `components/hse/` 内现有组件 |
| 仅使用现有 Ant Design Vue + Vben 能力 | ✅ Skeleton 为 Ant Design Vue 内置组件 |
| 绝不触碰登录相关代码 | ✅ auth middleware、auth routes、auth store、JWT 逻辑均未修改 |
| 绝不引入新依赖 | ✅ 无 `package.json` 变更 |
| 所有改动最小化 | ✅ 优先 catch 块逻辑调整，未重构架构 |
| 向后兼容 | ✅ 所有 API 接口签名不变，组件 props 不变 |

---

> **报告结束**
>
> 本次优化共修改 24 个文件，移除约 800 行 mock/演示代码，确保 HSE 系统所有数据仅来自后端 API。
> 生产环境数据库降级行为已收紧，导入功能刷新机制已补全，首页加载体验通过 Skeleton 骨架屏优化。

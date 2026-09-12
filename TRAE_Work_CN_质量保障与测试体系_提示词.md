# TRAE Work CN Code 模式 — 质量保障与测试体系搭建

> 适用项目：宁津环卫 HSE 安全管理系统 v4.1
> 目标：从当前 ~10% 测试覆盖率提升到 80%+
> 预计产出：50+ 个测试文件

---

```
你是一位高级测试工程师，要为【宁津环卫 HSE 安全管理系统 v4.1】搭建完整的前后端质量保障与测试体系。

## 项目现状分析

### 技术栈
- **前端**: Vue 3 + TypeScript + Ant Design Vue + vue-vben-admin v5.7.0 + Pinia + Vite 8
- **后端**: Node.js 22 + Express + PostgreSQL 17 + JWT 认证
- **现有测试框架**:
  - 后端: Jest + Supertest（集成测试模式，已配好）
  - 前端: Vitest（已安装但零业务测试）
  - E2E: Playwright（安全管理系统/e2e 有 4 个旧 spec，需迁移至 vben）
- **CI/CD**: GitHub Actions（ci-cd.yml 含 PostgreSQL service container + 后端 test job）

### 当前测试覆盖率（严重不足！）

| 层级 | 现有文件 | 覆盖率估计 | 主要缺口 |
|------|---------|-----------|---------|
| **后端路由** | `__tests__/` 仅 4 个（auth/accidents/insurance/overview） | **~15%** | 26 个路由中 22 个无测试 |
| **后端中间件** | middleware/ 2 个（response/validate） | **~30%** | auth/rate-limit/cache/queryLogger 无测试 |
| **后端服务层** | services/ **0 个** | **0%** | aiService/cache 全无测试 |
| **前端 Store** | stores/ 2 个（auth/permission） | **~20%** | 其余 store 无测试 |
| **前端 Utils** | utils/ 2 个（sentry/token） | **~10%** | performance/request 等无测试 |
| **前端 Composables** | composables/ **0 个** | **0%** | useWebSocket/useVirtualScroll/useDebounceFetch 全无 |
| **前端 HSE 组件** | components/hse/ **0 个** | **0%** | 8 个核心组件全部无测试 |
| **前端页面** | views/** **0 个** | **0%** | 所有页面无测试 |
| **E2E** | e2e/ 4 个（旧系统） | **N/A** | vben 应用完全无 E2E |

### 已有的测试基础设施（可复用）

**后端 setup.js（质量很高，直接复用）：**
```js
// server/__tests__/setup.js 提供:
// - client: supertest(app) 测试客户端
// - login(): 自动登录获取 Token
// - getAuthHeaders(): 返回 Authorization 头
// - query(sql, params): 执行原生 SQL
// - cleanupTestData(): 清理 [TEST] 标记数据
// - getTestMarker(): 生成唯一标记 [TEST-timestamp-random]
```

**前端测试风格参考（src/stores/auth.test.ts）：**
```ts
// 使用 vitest + pinia setActivePinia 模式
// vi.mock() 模拟 API 客户端
// beforeEach 重置状态
```

---

## 你的任务：分 5 大模块搭建测试体系

请按以下优先级顺序执行：

### 第一部分：前端测试基础设施 + 核心工具层测试（优先级 P0）

#### 1.1 创建 `安全看板vben/apps/web-antd/vitest.config.ts`

```ts
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'src/**/*.spec.ts',
    ],
    exclude: ['node_modules', 'dist', 'e2e'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: [
        'src/components/hse/**/*.{ts,vue}',
        'src/composables/**/*.{ts}',
        'src/stores/**/*.{ts}',
        'src/utils/**/*.{ts}',
        'src/api/**/*.{ts}',
        'src/hooks/**/*.{ts}',
      ],
      exclude: [
        '**/types.ts',
        '**/index.ts',
        '**/*.d.ts',
        'src/router/**',
        'src/views/**', // 页面由 E2E 覆盖
      ],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
    testTimeout: 10000,
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
```

#### 1.2 创建 `安全看板vben/apps/web-antd/vitest.setup.ts`

全局测试设置：
- 注册 @vue/test-utils config.global.plugins
- Mock IntersectionObserver / ResizeObserver / matchMedia
- Mock window.scrollTo / Element.prototype.scrollIntoView
- 设置 @ant-design-vue/icons-vue 全局注册
- 配置 MSW（Mock Service Worker）或 axios mock 适配器（可选）

#### 1.3 编写核心工具层测试

在 `安全看板vben/apps/web-antd/src/` 下创建：

**① Utils 测试 (`utils/` 目录)**

| 文件名 | 测试内容 | 用例数（最少） |
|--------|---------|--------------|
| `utils/performance.test.ts` | PerformanceMonitor 类 | 6+ |
| - | 计时 start/end/clear | 3 |
| - | API 耗时记录 | 2 |
| - | 页面加载指标收集 | 2 |
| - | 边界：重复调用 clear | 1 |
| `api/request.test.ts` | Axios 请求封装 | 8+ |
| - | 拦截器：请求添加 token | 2 |
| - | 拦截器：响应成功提取 data | 2 |
| - | 拦截器：401 自动刷新 token | 2 |
| - | 拦截器：网络错误处理 | 2 |
| `utils/token.test.ts` | （已存在，检查是否完善） | 补全到 10+ |
| `utils/sentry.test.ts` | （已存在，检查是否完善） | 补全到 6+ |

**② Composables 测试 (`composables/` 目录)**

| 文件名 | 测试内容 | 用例数 |
|--------|---------|-------|
| `composables/useDebounceFetch.test.ts` | 防抖请求 Hook | 8+ |
| - | 初始状态验证 | 2 |
| - | 防抖延迟（使用 vi.useFakeTimers） | 3 |
| - | 取消请求（AbortController） | 2 |
| - | 重复调用防抖 | 1 |
| `composables/useVirtualScroll.test.ts` | 虚拟滚动 Hook | 10+ |
| - | 可见范围计算 | 3 |
| - | 滚动位置更新 | 3 |
| - | 数据切片正确性 | 2 |
| - | 边界：空数据/单条数据/超出范围 | 2 |
| `composables/useWebSocket.test.ts` | WebSocket Hook | 12+ |
| - | 连接/断开/重连生命周期 | 4 |
| - | 消息收发 | 2 |
| - | 心跳机制（定时器模拟） | 3 |
| - | 指数退避重连策略 | 2 |
| - | 手动发送消息 | 1 |
| `hooks/useResponsive.test.ts` | 响应式断点检测 | 6+ |
| - | 断点判断（mobile/tablet/desktop） | 3 |
| - | resize 监听 | 2 |
| - | 默认值 | 1 |

**③ Stores 测试 (`stores/` 目录补充)**

| 文件名 | 测试内容 | 用例数 |
|--------|---------|-------|
| `stores/auth.test.ts` | （已存在，检查覆盖度） | 补全到 15+ |
| - | 登录成功流程 | 3 |
| - | Token 过期刷新 | 3 |
| - | 登出清理 | 2 |
| - | 权限判断 hasPermission | 3 |
| - | 用户信息缓存 | 2 |
| `stores/permission.test.ts` | （已存在） | 补全到 10+ |
| 新建 `stores/app.test.ts` | App Store（主题/布局等） | 8+ |

#### 1.4 测试代码风格规范

所有前端测试必须遵循：
- **中文 describe/it 描述**
- **AAA 模式**：Arrange（准备）→ Act（执行）→ Assert（断言）
- **每个 it 只测一件事**
- **Mock 外部依赖**：API 调用用 vi.mock()，浏览器 API 用 vi.fn()
- **异步测试**：async/await + resolves/rejects 匹配器

示例模板：
```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import MyComponent from '@/components/hse/MyComponent.vue'

describe('MyComponent 组件', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('应该渲染标题文字', () => {
    const wrapper = mount(MyComponent, {
      props: { title: '测试标题' }
    })
    expect(wrapper.text()).toContain('测试标题')
  })

  it('点击按钮应触发 emit 事件', async () => {
    const wrapper = mount(MyComponent)
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted()).toHaveProperty('submit')
  })
})
```

---

### 第二部分：HSE 组件库单元测试（优先级 P0）

对 `components/hse/` 下的 8 个核心组件逐一编写测试：

| 组件 | 文件路径 | 测试重点 | 最少用例 |
|------|---------|---------|---------|
| **HseVirtualTable** | `components/hse/HseVirtualTable.vue` | 15+ | 虚拟滚动渲染、数据加载、排序/筛选、空状态、loading 状态、自定义列 |
| **HseStatCard** | `components/hse/HseStatCard.vue` | 10+ | 数值显示、趋势箭头（up/down/flat）、图标、点击事件、slot 内容 |
| **HseSearchBar** | `components/hse/HseSearchBar.vue` | 8+ | 搜索输入、展开/收起、回车触发、清除按钮、debounce 行为 |
| **HseDetailModal** | `components/hse/HseDetailModal.vue` | 8+ | 打开/关闭、数据展示、loading、取消确认、宽度自适应 |
| **HseForm** | `components/hse/HseForm.vue` | 15+ | create/edit/view 三模式切换、表单校验、提交/重置、字段动态显隐 |
| **MobileNav** | `components/hse/MobileNav.vue` | 8+ | 底部导航渲染、当前路由高亮、未读角标、子菜单展开 |
| **HseBadge/HseTag 等** | 其他辅助组件 | 5+ each | 类型/颜色变体、slot 插槽 |

#### HseForm 组件测试示例（最复杂，必须覆盖）：

```ts
describe('HseForm 通用表单组件', () => {
  it('create 模式下应显示所有可编辑字段', () => { ... })
  it('edit 模式下应预填充已有数据', () => { ... })
  it('view 模式下应禁用所有输入框', () => { ... })
  it('提交时应触发 submit 事件并携带表单数据', () => { ... })
  it('必填项为空时提交应显示校验错误', () => { ... })
  it('重置按钮应清空表单到初始状态', () => { ... })
  it('动态字段应根据 mode 显示/隐藏', () => { ... })
  it('自定义 slot 字段应正常渲染', () => { ... })
})
```

---

### 第三部分：后端测试补全（优先级 P0）

基于已有的 setup.js 基础设施，补全缺失的路由和服务层测试。

#### 3.1 后端测试分层策略

```
server/
├── __tests__/                    # 已有（集成测试）
│   ├── setup.js                  # ✅ 已有，直接复用
│   ├── teardown.js               # ✅ 已有
│   ├── auth.test.js              # ✅ 已有（~8.5K）
│   ├── accidents.test.js         # ✅ 已有（~6.2K）
│   ├── insurance.test.js         # ✅ 已有（~8K）
│   ├── overview.test.js          # ✅ 已有（~1.7K）
│   ├── hazards.test.js           # ❌ 新建 — 隐患管理 CRUD
│   ├── training.test.js          # ❌ 新建 — 培训管理 CRUD
│   ├── personnel.test.js         # ❌ 新建 — 人员管理
│   ├── vehicles.test.js          # ❌ 新建 — 车辆管理
│   ├── emergency.test.js         # ❌ 新建 — 应急管理
│   ├── regulations.test.js       # ❌ 新建 — 规章制度
│   ├── objectives.test.js        # ❌ 新建 — 目标职责
│   ├── site-mgmt.test.js         # ❌ 新建 — 现场管理
│   ├── risk-control.test.js      # ❌ 新建 — 风险管控
│   ├── notifications.test.js     # ❌ 新建 — 通知中心
│   ├── workflow.test.js          # ❌ 新建 — 工作流引擎
│   ├── dashboard.test.js         # ❌ 新建 — 仪表盘聚合接口
│   └── import.test.js            # ❌ 新建 — 数据导入
├── middleware/                    # 中间件单元测试
│   ├── auth.test.js              # ✅ 待检查
│   ├── response.test.js          # ✅ 已有
│   ├── validate.test.js          # ✅ 已有
│   ├── rate-limit.test.js        # ❌ 新建
│   ├── cache.test.js             # ❌ 新建
│   └── queryLogger.test.js       # ❌ 新建
├── services/                     # 服务层单元测试
│   └── aiService.test.js         # ❌新建（核心 AI 逻辑 Mock HTTP）
└── routes/                       # 路由级别测试（可选）
    └── ai-enhanced.test.js       # ❌ 新建（AI 接口）
```

#### 3.2 必须补全的核心业务测试

每个新测试文件必须包含以下测试场景（以 hazards 为例）：

```js
/**
 * 隐患管理接口测试
 * 覆盖: CRUD 完整流程 + 分页 + 搜索 + 权限 + 边界
 */
const { client, login, getAuthHeaders, query, cleanupTestData, getTestMarker } = require('../setup');

describe('隐患管理 API (/api/hazards)', () => {
  let authHeaders;
  let marker;

  beforeAll(async () => {
    await login();
    authHeaders = getAuthHeaders();
    marker = getTestMarker();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  describe('GET /api/hazards — 隐患列表（分页）', () => {
    test('正常查询应返回分页数据', async () => { ... });
    test('page 参数边界（负数/0/超大）应返回默认值', async () => { ... });
    test('pageSize 参数应在合理范围内限制', async () => { ... });
    test('无 Token 应返回 401', async () => { ... });
  });

  describe('POST /api/hazards — 新增隐患', () => {
    test('正常创建应返回新记录 ID', async () => { ... });
    test('缺少必填字段应返回 400', async () => { ... });
    test('SQL 注入防护：特殊字符应被转义', async () => { ... });
    test('XSS 防护：<script> 标签不应原样存储', async () => { ... });
  });

  describe('PUT /api/hazards/:id — 编辑隐患', () => {
    test('编辑自己创建的记录应成功', async () => { ... });
    test('编辑不存在的 ID 应返回 404', async () => { ... });
    test('非法 ID 格式（非数字/负数）应返回 400', async () => { ... });
  });

  describe('DELETE /api/hazards/:id — 删除隐患', () => {
    test('软删除应设置 is_deleted=true', async () => { ... });
    test('重复删除应返回幂等结果', async () => { ... });
  });

  describe('GET /api/hazards/search — 高级搜索', () => {
    test('关键词搜索应匹配 title/description', async () => { ... });
    test('按状态筛选应准确过滤', async () => { ... });
    test('按时间范围筛选', async () => { ... });
    test('空搜索条件应等同列表接口', async () => { ... });
  });

  describe('权限控制', () => {
    test('普通用户不应能删除他人数据', async () => { ... });
    test('管理员应有完整 CRUD 权限', async () => { ... });
  });
});
```

#### 3.3 AI 服务层测试（重要！v4.1 核心）

```js
/**
 * AI 服务层测试
 * 重点: 双 Provider 切换、SSE 流式输出、超时/重试、错误处理
 * 所有 HTTP 调用使用 jest.mock('http') 不发真实请求
 */

describe('aiService — AI 服务统一层', () => {
  describe('Provider 切换', () => {
    test('AI_PROVIDER=grok 应调用 xAI API', () => { ... });
    test('AI_PROVIDER=ollama 应调用本地 Ollama', () => { ... });
    test('未知 Provider 应抛出错误', () => { ... });
  });

  describe('流式输出 (SSE)', () => {
    test('Grok SSE 流应正确解析 data: 行', () => { ... });
    test('Ollama SSE 流应解析 JSON 行', () => { ... });
    test('连接中断应触发重试', () => { ... });
    test('超时后应中止请求并返回错误', () => { ... });
  });

  describe('Prompt 模板', () => {
    test('report_hazard 模板应包含必要变量占位符', () => { ... });
    test('rca_analysis 模板应输出 5W1H 结构', () => { ... });
  });
});
```

---

### 第四部分：E2E 端到端测试（Playwright）（优先级 P1）

#### 4.1 创建 `安全看板vben/e2e/` 目录结构

```
安全看板vben/e2e/
├── playwright.config.ts           # Playwright 配置
├── helpers/
│   ├── login.ts                   # 登录 helper（复用账号）
│   ├── navigation.ts              # 导航 helper
│   └── assertions.ts              # 自定义断言
├── fixtures/
│   └── test-data.json             # 测试数据（账号/密码/预期值）
├── specs/
│   ├── auth.spec.ts               # 登录认证流程
│   ├── dashboard.spec.ts          # 仪表盘数据展示
│   ├── hazard-management.spec.ts  # 隐患管理 CRUD
│   ├── accident-reporting.spec.ts # 事故报告流程
│   ├── training.spec.ts           # 培训管理
│   ├── ai-report.spec.ts          # AI 报告生成（核心 v4.1 功能）
│   ├── mobile.spec.ts             # 移动端适配
│   └── permissions.spec.ts        # 权限控制验证
└── README.md                      # E2E 测试说明
```

#### 4.2 编写 playwright.config.ts

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['html', { open: 'never' }],
    ['json', { outputFile: 'results.json' }],
  ],
  use: {
    baseURL: 'http://localhost:5173', // Vite dev server
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
})
```

#### 4.3 核心 E2E 测试用例

**① 认证流程 (auth.spec.ts)**
```ts
describe('用户认证', () => {
  test('登录成功应跳转到仪表盘', async ({ page }) => { ... })
  test('密码错误应显示提示信息', async ({ page }) => { ... })
  test('Token 过期应自动刷新', async ({ page }) => { ... })
  test('登出应清除状态并回到登录页', async ({ page }) => { ... })
})
```

**② AI 报告生成 (ai-report.spec.ts) — v4.1 核心功能！**
```ts
describe('AI 智能报告生成', () => {
  test('选择隐患类型和 ID 后应开始生成', async ({ page }) => { ... })
  test('流式输出应逐字显示内容', async ({ page }) => { ... })
  test('生成的 Markdown 应正确渲染', async ({ page }) => { ... })
  test('下载 .md 文件应成功', async ({ page }) => { ... })
  test('历史记录应保存并显示', async ({ page }) => { ... })
  test('Provider 状态指示灯应反映真实连接', async ({ page }) => { ... })
})
```

**③ 隐患管理 CRUD (hazard-management.spec.ts)**
```ts
describe('隐患管理完整流程', () => {
  test('新增 → 编辑 → 查看 → 删除 完整闭环', async ({ page }) => {
    // 1. 进入隐患管理页面
    // 2. 点击"新增"填写表单
    // 3. 提交后在列表中找到该记录
    // 4. 点击编辑修改内容
    // 5. 查看详情页验证数据
    // 6. 删除并在列表确认消失
  })
  test('高级搜索应正确过滤结果', async ({ page }) => { ... })
  test('导出 Excel 应下载文件', async ({ page }) => { ... })
})
```

**④ 移动端适配 (mobile.spec.ts)**
```ts
describe('移动端体验', () => {
  test.use({ viewport: { width: 375, height: 812 } }) // iPhone 尺寸
  
  test('底部导航栏应正确显示', async ({ page }) => { ... })
  test('卡片布局应垂直堆叠', async ({ page }) => { ... })
  test('巡检打卡应支持 GPS 定位', async ({ page }) => { ... })
})
```

---

### 第五部分：CI/CD 门禁增强 + 测试报告（优先级 P1）

#### 5.1 更新 `.github/workflows/ci-cd.yml`

在现有流水线基础上增强：

```yaml
# 在 backend-test job 之后新增：

# ---- Job 3: 前端测试 (Vitest) ----
frontend-test:
  name: 前端测试 (Vitest + Coverage)
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '22'
        cache: 'pnpm'
        cache-dependency-path: 安全看板vben/pnpm-lock.yaml
    
    - name: Install dependencies
      working-directory: 安全看板vben
      run: pnpm install --frozen-lockfile
    
    - name: Run unit tests with coverage
      working-directory: 安全看板vben/apps/web-antd
      run: npx vitest run --coverage
    
    - name: Upload coverage report
      if: always()
      uses: actions/upload-artifact@v4
      with:
        name: frontend-coverage
        path: 安全看板vben/apps/web-antd/coverage/

# ---- Job 4: E2E 测试 (Playwright) ----
e2e-test:
  name: E2E 端到端测试
  runs-on: ubuntu-latest
  needs: [backend-test, frontend-test]
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '22'
    
    - name: Install Playwright browsers
      working-directory: 安全看板vben
      run: npx playwright install --with-deps chromium
    
    - name: Run E2E tests
      working-directory: 安全看板vben
      run: npx playwright test
    
    - name: Upload test results
      if: always()
      uses: actions/upload-artifact@v4
      with:
        name: playwright-report
        path: 安全看板vben/playwright-report/
```

#### 5.2 覆盖率门禁

在 CI 中增加覆盖率阈值检查：
- 后端语句覆盖率 >= 70%（最低要求）
- 前端语句覆盖率 >= 80%
- 任一不通过则 CI 红灯

#### 5.3 创建 `tests/README.md` 测试体系文档

内容包括：
- 测试架构图（三层金字塔：单元/E2E/集成）
- 如何运行各层级测试命令
- Mock 数据工厂说明
- 覆盖率目标
- 新增测试的 Checklist
- CI 失败排查指南

---

## 输出要求

### 文件清单（必须生成）

#### 前端测试（~30 个文件）
| 文件路径 | 说明 | 预估行数 |
|---------|------|---------|
| `安全看板vben/apps/web-antd/vitest.config.ts` | Vitest 配置 | ~60 |
| `安全看板vben/apps/web-antd/vitest.setup.ts` | 全局测试设置 | ~40 |
| `src/composables/useDebounceFetch.test.ts` | 防抖 Hook | ~80 |
| `src/composables/useVirtualScroll.test.ts` | 虚拟滚动 Hook | ~150 |
| `src/composables/useWebSocket.test.ts` | WebSocket Hook | ~200 |
| `src/hooks/useResponsive.test.ts` | 断点检测 Hook | ~60 |
| `src/utils/performance.test.ts` | 性能监控 | ~80 |
| `src/api/request.test.ts` | 请求封装 | ~120 |
| `src/components/hse/HseVirtualTable.test.ts` | 虚拟表格组件 | ~250 |
| `src/components/hse/HseStatCard.test.ts` | 统计卡片 | ~100 |
| `src/components/hse/HseSearchBar.test.ts` | 搜索栏 | ~80 |
| `src/components/hse/HseDetailModal.test.ts` | 详情弹窗 | ~90 |
| `src/components/hse/HseForm.test.ts` | 通用表单 | ~200 |
| `src/components/hse/MobileNav.test.ts` | 移动导航 | ~80 |
| `src/stores/app.test.ts` | App Store | ~80 |

#### 后端测试（~18 个文件）
| 文件路径 | 说明 | 预估行数 |
|---------|------|---------|
| `server/__tests__/hazards.test.js` | 隐患 CRUD | ~200 |
| `server/__tests__/training.test.js` | 培训管理 | ~180 |
| `server/__tests__/personnel.test.js` | 人员管理 | ~180 |
| `server/__tests__/vehicles.test.js` | 车辆管理 | ~150 |
| `server/__tests__/emergency.test.js` | 应急管理 | ~150 |
| `server/__tests__/regulations.test.js` | 规章制度 | ~150 |
| `server/__tests__/objectives.test.js` | 目标职责 | ~150 |
| `server/__tests__/site-mgmt.test.js` | 现场管理 | ~150 |
| `server/__tests__/risk-control.test.js` | 风险管控 | ~150 |
| `server/__tests__/notifications.test.js` | 通知中心 | ~100 |
| `server/__tests__/workflow.test.js` | 工作流引擎 | ~200 |
| `server/__tests__/dashboard.test.js` | 仪表盘接口 | ~120 |
| `server/__tests__/import.test.js` | 数据导入 | ~150 |
| `server/middleware/rate-limit.test.js` | 限流中间件 | ~80 |
| `server/middleware/cache.test.js` | 缓存中间件 | ~80 |
| `server/middleware/queryLogger.test.js` | 慢查询日志 | ~60 |
| `server/services/aiService.test.js` | AI 服务层 | ~250 |

#### E2E 测试（~9 个文件）
| 文件路径 | 说明 | 预估行数 |
|---------|------|---------|
| `安全看板vben/e2e/playwright.config.ts` | Playwright 配置 | ~50 |
| `安全看板vben/e2e/helpers/login.ts` | 登录 Helper | ~40 |
| `安全看板vben/e2e/specs/auth.spec.ts` | 认证流程 | ~80 |
| `安全看板vben/e2e/specs/dashboard.spec.ts` | 仪表盘 | ~60 |
| `安全看板vben/e2e/specs/hazard-management.spec.ts` | 隐患 CRUD | ~150 |
| `安全看板vben/e2e/specs/accident-reporting.spec.ts` | 事故报告 | ~100 |
| `安全看板vben/e2e/specs/ai-report.spec.ts` | AI 报告生成 | ~120 |
| `安全看板vben/e2e/specs/mobile.spec.ts` | 移动端 | ~80 |
| `安全看板vben/e2e/specs/permissions.spec.ts` | 权限控制 | ~100 |

#### CI/CD + 文档
| 文件路径 | 说明 |
|---------|------|
| `.github/workflows/ci-cd.yml` | 更新：增加前端测试 + E2E jobs |
| `tests/README.md` | 测试体系文档 |

### 代码质量要求

1. **测试命名**：`[方法名] should [预期行为] when [条件]`
2. **隔离性**：每个测试用例独立运行，不依赖执行顺序
3. **数据清理**：afterAll 必须清理测试产生的数据库记录（用 `[TEST]` 标记）
4. **Mock 边界**：只 mock 外部依赖（HTTP/DB/时间），不 mock 被测单元内部逻辑
5. **断言清晰**：每个 it 至少 1 个 expect，关键路径多个 expect
6. **注释**：中文注释说明测试意图（不是翻译代码）

### 验证命令

完成后提供验证步骤：

```bash
# === 前端测试 ===
cd 安全看板vben/apps/web-antd
npx vitest run --coverage            # 运行全部 + 覆盖率
npx vitest run --reporter=verbose     # 详细输出

# === 后端测试 ===
cd server
npm test                              # 运行 Jest 全部
npm test -- --coverage                # 带覆盖率
npm test -- --testPathPattern=hazards # 单个模块

# === E2E 测试 ===
cd 安全看板vben
npx playwright test                   # 全部 E2E
npx playwright test --project=chromium  # 仅桌面端
npx playwright test --ui               # UI 模式调试

# === 一键全部测试 ===
# 在项目根目录执行
echo "=== Frontend Unit Tests ==="
cd 安全看板vben/apps/web-antd && npx vitest run --coverage || exit 1

echo "=== Backend Tests ==="
cd ../../server && npm test -- --coverage || exit 1

echo "=== All Tests Passed! ==="
```

---

## 重要注意事项

⚠️ **不要修改业务逻辑代码** — 只新增测试文件和配置

⚠️ **后端测试必须用 supertest(client) 发真实 HTTP 请求**，不要直接 import 路由函数（要测试中间件链路）

⚠️ **前端组件测试用 @vue/test-utils mount/shallow**，不要挂载整个应用

⚠️ **E2E 测试用 Playwright 内置的 webServer 启动 Vite dev server**，不需要手动启动

⚠️ **测试数据库操作必须带 [TEST] 标记**，cleanupTestData 会自动清理，不影响开发/生产数据

⚠️ **AI 服务测试全部 Mock HTTP**（jest.mock('http')），不发真实 API 请求到 Grok/Ollama

⚠️ **覆盖率是硬指标**：前端 >= 80%, 后端 >= 70%，达不到 CI 不通过

## 参考文件

- 后端测试基础设施：`server/__tests__/setup.js`
- 后端测试风格参考：`server/__tests__/auth.test.js`
- 前端测试风格参考：`src/stores/auth.test.ts`
- CI/CD 配置：`.github/workflows/ci-cd.yml`
- 旧 E2E 参考：`安全管理系统/e2e/login.spec.ts`
- Vitest 文档：https://vitest.dev
- Playwright 文档：https://playwright.dev

---

## 建议执行顺序

| 步骤 | 内容 | Token 消耗 | 建议 |
|------|------|-----------|------|
| **第 1 次** | Part 1: 前端基础设施 + Utils/Composables/Stores 测试 (~20 文件) | 高 | 先把基础打牢 |
| **第 2 次** | Part 2: HSE 组件库测试 (7 组件) | 中高 | 组件是最重要的前端资产 |
| **第 3 次** | Part 3: 后端路由测试补全 (14 文件) + AI 服务测试 | 高 | 最大工作量部分 |
| **第 4 次** | Part 4: E2E Playwright (8 specs) + Part 5: CI/CD 更新 | 中 | 最后串联全流程 |

**请开始执行第一部分（前端测试基础设施 + 核心工具层测试），完成后继续后续步骤。每完成一个 Part 简要总结产出物。**
```

---

## 📋 快速参考

### 为什么选这个方向？

1. **最大风险点** — 前端组件零测试意味着任何重构都可能引入回归 Bug
2. **生产必备** — 企业安全系统上线前必须有测试保障
3. **CI/CD 就绪** — GitHub Actions 已有 PostgreSQL service，只需补全测试文件
4. **v4.1 AI 功能急需验证** — AI 报告生成是核心卖点，必须有 E2E 保障

### 执行效果预览

| 指标 | 当前 | 目标 |
|------|------|------|
| 前端测试文件 | 4 个（仅工具层） | **34+ 个** |
| 后端测试文件 | 6 个（仅 4 模块） | **22+ 个** |
| E2E 测试 | 4 个（旧系统） | **9 个（vben 新版）** |
| 前端覆盖率 | ~10% | **>= 80%** |
| 后端覆盖率 | ~15% | **>= 70%** |
| CI 门禁 | 仅 lint | **lint + 单元 + E2E + 覆盖率** |

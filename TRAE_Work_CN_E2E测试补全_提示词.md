# TRAE Work CN Code 模式 — 补全缺失的 E2E 测试

> 适用项目：宁津环卫 HSE 安全管理系统 v4.1
> 目标：补全测试金字塔顶层 — 11 个 E2E 测试文件 / 102 个用例
> 当前缺口：Playwright 6 spec + 后端 E2E 5 链路 = **0 个文件**

---

```
你是一位高级测试工程师，要为【宁津环卫 HSE 安全管理系统 v4.1】补全测试报告中规划但尚未实现的 E2E 测试。

## 项目现状

### 测试体系已完成部分
- ✅ 前端单元测试: 10 个文件 / 3495 行 (Vitest)
- ✅ 后端路由测试: 16+ 个文件 / 6186 行 (Jest + Supertest)
- ✅ 后端中间件测试: 4 个文件 (cache/queryLogger/response/validate)
- ✅ AI 服务测试: 1 个文件 (aiService.test.js)
- ✅ CI/CD 门禁: 3 条流水线 (ci-cd.yml / ci-quality-gate.yml / deploy.yml)
- ✅ 配置文件: vitest.config.ts + vitest.setup.ts + playwright.config.ts

### 本次要补全的缺口（报告中规划但 0 个文件）

**缺口 1: Playwright E2E（前端 → 后端全栈验证）**
- 报告规划: 6 个 spec 文件 / 59 用例
- 实际文件: **0 个**
- 目录不存在: `安全看板vben/tests/e2e/`

**缺口 2: 后端 E2E 链路测试（业务闭环验证）**
- 报告规划: 5 个测试文件 / 43 用例
- 实际文件: **0 个**
- 目录不存在: `server/__tests__/e2e/`

### 关键配置参考

**playwright.config.ts（已存在，直接复用）:**
```ts
// 位置: 安全看板vben/playwright.config.ts
// testDir: './tests/e2e'
// baseURL: 'http://localhost:5666'
// webServer: { command: 'pnpm dev:antd', url: 'http://localhost:5666' }
// projects: chromium / firefox / webkit / Mobile Chrome / Mobile Safari
// locale: 'zh-CN', timezoneId: 'Asia/Shanghai'
// trace: 'on-first-retry', screenshot: 'only-on-failure', video: 'retain-on-failure'
```

**后端测试基础设施（server/__tests__/setup.js，已有，直接复用）:**
```js
// 提供:
// - client: supertest(app) — 发 HTTP 请求到 Express app
// - login(): 登录 admin/admin123 获取 Token
// - getAuthHeaders(): 返回 { Authorization: 'Bearer xxx' }
// - query(sql, params): 执行原生 SQL
// - cleanupTestData(): 清理 [TEST] 标记数据
// - getTestMarker(): 生成唯一标记 [TEST-timestamp-random]
```

**旧 E2E 参考（安全管理系统/e2e/login.spec.ts）:**
```ts
// 风格: 简洁的 test.describe + test 模式
// 选择器: input[type="text"] / input[type="password"] / button:has-text("登 录")
// 断言: toHaveURL / toBeVisible / toHaveText
```

### 系统路由与 API 参考

**前端路由:**
| 路由 | 页面 | 说明 |
|------|------|------|
| /login | 登录页 | 用户名+密码登录 |
| /dashboard/analytics | 安全概览 | 统计卡片+图表 |
| /threat/realtime | 实时告警 | 告警列表+处置 |
| /threat/handling | 告警处置 | 处置流程 |
| /vuln/list | 漏洞列表 | 隐患台账 |
| /risk/trend | 风险趋势 | 趋势图表 |
| /risk/assessment | 风险评估 | 评估矩阵 |
| /asset/list | 资产列表 | 设备台账 |
| /hse/bi | BI 大屏 | 全屏深色主题 |
| /hse/ai/risk-predict | AI 风险预测 | AI 分析页面 |
| /hse/ai/anomaly-detect | AI 异常检测 | 异常检测页面 |
| /hse/iot/devices | IoT 设备列表 | 设备管理 |
| /m/dashboard | 移动端首页 | 移动端 |
| /m/alerts | 移动端告警 | 移动端 |
| /m/patrol | 巡检打卡 | 移动端 GPS |

**后端 API（26 个路由模块）:**
| 路径 | 说明 | 核心 CRUD |
|------|------|----------|
| POST /api/auth/login | 登录 | - |
| GET /api/dashboard | 仪表盘 | 聚合查询 |
| GET/POST/PUT/DELETE /api/hazards | 隐患管理 | 完整 CRUD |
| GET/POST/PUT/DELETE /api/accidents | 事故管理 | 完整 CRUD |
| GET/POST /api/alerts | 告警管理 | 查询+确认 |
| GET/POST/PUT/DELETE /api/training | 培训管理 | 完整 CRUD |
| GET/POST/PUT/DELETE /api/personnel | 人员管理 | 完整 CRUD |
| GET/POST/PUT/DELETE /api/vehicles | 车辆管理 | 完整 CRUD |
| GET/POST /api/notifications | 通知中心 | 查询+标记已读 |
| POST /api/import/parse | 数据导入解析 | 上传+解析 |
| POST /api/import/confirm | 数据导入确认 | 批量入库 |
| POST /api/hse/ai/generate-report | AI 报告生成 | SSE 流式 |
| POST /api/hse/ai/root-cause | AI 根因分析 | 5W1H 分析 |

---

## 你的任务：创建 11 个 E2E 测试文件

### 第一部分：Playwright 前端 E2E 测试（6 个 spec / 59 用例）

#### 1.0 创建目录结构和 Helper

**创建 `安全看板vben/tests/e2e/helpers/` 目录:**

**① `helpers/login.ts` — 登录 Helper**
```ts
import { type Page, expect } from '@playwright/test'

/**
 * 登录 Helper — 通过 API 直接获取 Token，然后注入 localStorage
 * 比 UI 表单填写更快，适合大多数 E2E 测试的前置条件
 */
export async function loginByApi(page: Page, username = 'admin', password = 'admin123') {
  // 1. 调用 POST /api/auth/login 获取 token
  // 2. 将 token 写入 localStorage（Vben Admin 的存储 key）
  // 3. 导航到 /dashboard 验证已登录
}

/**
 * 通过 UI 表单登录 — 用于专门测试登录流程的用例
 */
export async function loginByUI(page: Page, username = 'admin', password = 'admin123') {
  await page.goto('/login')
  await page.locator('input[type="text"]').fill(username)
  await page.locator('input[type="password"]').fill(password)
  await page.locator('button:has-text("登")').click()
  await page.waitForURL('**/dashboard/**')
}
```

**② `helpers/navigation.ts` — 导航 Helper**
```ts
export async function gotoModule(page: Page, menuText: string) {
  // 点击侧边栏菜单项
  await page.locator(`[role="menuitem"]:has-text("${menuText}")`).click()
}

export async function expectBreadcrumb(page: Page, text: string) {
  await expect(page.locator('.ant-breadcrumb')).toContainText(text)
}
```

**③ `fixtures/test-data.json` — 测试数据**
```json
{
  "users": {
    "admin": { "username": "admin", "password": "admin123" },
    "invalid": { "username": "invalid", "password": "wrong" }
  },
  "hazard": {
    "title": "[E2E-TEST] 测试隐患",
    "description": "自动化测试创建的隐患记录",
    "level": "一般",
    "department": "测试部门"
  },
  "accident": {
    "title": "[E2E-TEST] 测试事故",
    "description": "自动化测试创建的事故记录",
    "level": "轻微"
  }
}
```

#### 1.1 `tests/e2e/auth.spec.ts` — 认证流程（10 用例）

```ts
import { test, expect } from '@playwright/test'
import { loginByUI } from './helpers/login'

test.describe('用户认证流程', () => {
  test('未登录访问受保护页面应跳转登录页', async ({ page }) => { ... })
  test('登录页应显示用户名和密码输入框', async ({ page }) => { ... })
  test('正确凭据登录应跳转到仪表盘', async ({ page }) => { ... })
  test('错误密码应显示错误提示', async ({ page }) => { ... })
  test('空用户名应禁用登录按钮或提示', async ({ page }) => { ... })
  test('空密码应禁用登录按钮或提示', async ({ page }) => { ... })
  test('登录成功后 Token 应存储在 localStorage', async ({ page }) => { ... })
  test('登出应清除 Token 并回到登录页', async ({ page }) => { ... })
  test('多标签页登录状态应同步', async ({ browser }) => {
    // 使用 browser.newContext() + browserContext.newPage() 模拟多标签
  })
  test('记住密码功能应记住用户名', async ({ page }) => { ... })
})
```

#### 1.2 `tests/e2e/dashboard.spec.ts` — 仪表盘（10 用例）

```ts
test.describe('仪表盘数据展示', () => {
  test.beforeEach(async ({ page }) => {
    await loginByApi(page)
    await page.goto('/dashboard/analytics')
  })

  test('页面应正确加载并显示标题', async ({ page }) => { ... })
  test('统计卡片应显示数值', async ({ page }) => {
    // 验证 .hse-stat-card 或 ant-card 内有数字
  })
  test('图表容器应渲染 ECharts', async ({ page }) => {
    // 验证 canvas 或 _echarts_instance_ 属性存在
  })
  test('时间范围筛选应更新数据', async ({ page }) => {
    // 点击日期选择器，选择不同范围，验证数据刷新
  })
  test('实时刷新应自动更新数据', async ({ page }) => {
    // 等待定时刷新，验证数值变化或网络请求
  })
  test('统计卡片点击应跳转详情页', async ({ page }) => { ... })
  test('图表 tooltip 应在 hover 时显示', async ({ page }) => { ... })
  test('空数据状态应显示占位符', async ({ page }) => { ... })
  test('加载中应显示骨架屏或 loading', async ({ page }) => { ... })
  test('WebSocket 断线应显示重连提示', async ({ page }) => {
    // 模拟 WebSocket 断开
  })
})
```

#### 1.3 `tests/e2e/navigation.spec.ts` — 导航（8 用例）

```ts
test.describe('侧边栏导航与路由', () => {
  test('侧边栏应显示所有有权限的菜单项', async ({ page }) => { ... })
  test('点击菜单项应跳转到对应路由', async ({ page }) => { ... })
  test('面包屑应显示当前页面路径', async ({ page }) => { ... })
  test('浏览器前进/后退应正确导航', async ({ page }) => { ... })
  test('多标签页切换应保持状态', async ({ page }) => { ... })
  test('无权限路由应显示 403 页面', async ({ page }) => { ... })
  test('不存在路由应显示 404 页面', async ({ page }) => { ... })
  test('路由守卫应在未登录时拦截', async ({ page }) => { ... })
})
```

#### 1.4 `tests/e2e/business.spec.ts` — 业务模块（13 用例）

```ts
test.describe('业务模块端到端流程', () => {
  test.describe('隐患管理', () => {
    test('新增隐患 → 列表显示 → 编辑 → 删除 完整闭环', async ({ page }) => {
      // 1. 导航到隐患列表页
      // 2. 点击"新增"按钮
      // 3. 填写表单（标题 [E2E-TEST]、描述、级别、部门）
      // 4. 提交后等待列表刷新
      // 5. 搜索找到刚创建的记录
      // 6. 点击编辑，修改描述
      // 7. 验证修改成功
      // 8. 删除该记录
      // 9. 验证列表中不再存在
    })
    test('高级搜索应正确过滤结果', async ({ page }) => { ... })
    test('导出 Excel 应触发文件下载', async ({ page }) => {
      // 监听 download 事件
    })
  })

  test.describe('事故管理', () => {
    test('事故报告创建 → 定级 → 根因分析 → 结案', async ({ page }) => { ... })
    test('事故列表分页应正确工作', async ({ page }) => { ... })
  })

  test.describe('培训管理', () => {
    test('培训计划创建与签到', async ({ page }) => { ... })
    test('考核结果录入', async ({ page }) => { ... })
  })

  test.describe('巡检管理', () => {
    test('巡检计划创建与执行', async ({ page }) => { ... })
    test('异常标记与上报', async ({ page }) => { ... })
  })

  test.describe('数据导入导出', () => {
    test('Excel 导入应校验并预览数据', async ({ page }) => { ... })
    test('批量导出应下载文件', async ({ page }) => { ... })
  })

  test('列表搜索防抖应正常工作', async ({ page }) => { ... })
})
```

#### 1.5 `tests/e2e/ai-pages.spec.ts` — AI 功能（10 用例）

```ts
test.describe('AI 辅助功能', () => {
  test.describe('AI 风险预测', () => {
    test('页面应正确加载', async ({ page }) => { ... })
    test('Provider 状态指示灯应显示当前连接状态', async ({ page }) => { ... })
    test('提交预测请求应显示加载状态', async ({ page }) => { ... })
    test('预测结果应以 Markdown 格式渲染', async ({ page }) => { ... })
  })

  test.describe('AI 异常检测', () => {
    test('选择数据范围后应触发检测', async ({ page }) => { ... })
    test('异常结果应高亮显示', async ({ page }) => { ... })
  })

  test.describe('AI 报告生成（v4.1 核心）', () => {
    test('选择报告类型和 ID 后应开始生成', async ({ page }) => { ... })
    test('流式输出应逐字显示内容', async ({ page }) => {
      // 验证 SSE 流式渲染效果
      // 1. 提交生成请求
      // 2. 验证页面内容逐步增长（非一次性出现）
    })
    test('生成完成后应可下载 .md 文件', async ({ page }) => {
      // 监听 download 事件
    })
    test('历史记录应保存并可查看', async ({ page }) => { ... })
  })
})
```

#### 1.6 `tests/e2e/mobile.spec.ts` — 移动端（8 用例）

```ts
test.describe('移动端适配', () => {
  // 使用 Mobile Chrome project (Pixel 5 viewport)
  test.use({ viewport: { width: 393, height: 851 } })

  test('移动端登录应正常工作', async ({ page }) => { ... })
  test('底部导航栏应正确显示 5 个入口', async ({ page }) => {
    // 验证 MobileNav 组件
  })
  test('当前路由对应的导航项应高亮', async ({ page }) => { ... })
  test('移动端首页卡片应垂直堆叠', async ({ page }) => {
    // 验证响应式布局
  })
  test('移动端告警列表应支持滑动操作', async ({ page }) => { ... })
  test('巡检打卡应支持 GPS 定位', async ({ page }) => {
    // Mock geolocation API
  })
  test('表格在移动端应支持横向滚动', async ({ page }) => { ... })
  test('侧边抽屉菜单应可展开收起', async ({ page }) => { ... })
})
```

---

### 第二部分：后端 E2E 链路测试（5 个文件 / 43 用例）

#### 2.0 创建 `server/__tests__/e2e/` 目录

所有后端 E2E 测试复用已有的 `server/__tests__/setup.js` 基础设施。

#### 2.1 `server/__tests__/e2e/auth-flow.test.js` — 认证全链路（10 用例）

```js
const { client, login, getAuthHeaders, query, cleanupTestData } = require('../setup')

describe('E2E: 认证全链路', () => {
  test('完整流程: 登录 → 获取用户信息 → 刷新 Token → 登出', async () => {
    // 1. POST /api/auth/login → 获取 accessToken + refreshToken
    // 2. GET /api/auth/me → 验证 Token 有效
    // 3. POST /api/auth/refresh → 用 refreshToken 换新 accessToken
    // 4. GET /api/auth/me → 验证新 Token 有效
    // 5. POST /api/auth/logout → 登出
    // 6. GET /api/auth/me → 验证旧 Token 已失效 (401)
  })

  test('Token 过期后应自动刷新', async () => { ... })
  test('RefreshToken 过期应要求重新登录', async () => { ... })
  test('登出后 Token 应加入黑名单', async () => { ... })
  test('连续登录失败应触发账号锁定', async () => { ... })
  test('锁定后等待解锁时间后应可登录', async () => { ... })
  test('不同角色的权限应隔离', async () => { ... })
  test('并发请求同一 Token 刷新应只生效一次', async () => { ... })
  test('密码修改后旧 Token 应失效', async () => { ... })
  test('修改密码后用新密码可登录', async () => { ... })
})
```

#### 2.2 `server/__tests__/e2e/hazard-alert-flow.test.js` — 隐患预警全链路（11 用例）

```js
describe('E2E: 隐患预警全链路', () => {
  let hazardId

  test('上报隐患 → 审核 → 派发 → 整改 → 验收 → 关闭', async () => {
    // 1. POST /api/hazards → 创建隐患（状态: 待审核）
    // 2. GET /api/hazards/:id → 验证状态
    // 3. PUT /api/hazards/:id/audit → 审核通过（状态: 待整改）
    // 4. PUT /api/hazards/:id/assign → 派发给责任人
    // 5. PUT /api/hazards/:id/rectify → 提交整改（状态: 待验收）
    // 6. PUT /api/hazards/:id/accept → 验收通过（状态: 已关闭）
    // 7. GET /api/hazards/:id → 验证最终状态
  })

  test('审核中状态不可重复提交', async () => { ... })
  test('未审核隐患不可直接整改', async () => { ... })
  test('验收不通过应退回整改', async () => { ... })
  test('隐患状态变更应触发通知', async () => {
    // 验证 notifications 表有新记录
  })
  test('不同角色只能操作对应环节', async () => { ... })
  test('隐患级别变更应重新审核', async () => { ... })
  test('超期未整改应自动升级预警', async () => { ... })
  test('隐患附件上传与查看', async () => { ... })
  test('隐患列表筛选: 按状态/级别/部门', async () => { ... })
  test('隐患统计: 各状态数量正确', async () => { ... })
})
```

#### 2.3 `server/__tests__/e2e/accident-rca-flow.test.js` — 事故分析全链路（11 用例）

```js
describe('E2E: 事故报告与根因分析全链路', () => {
  test('报告 → 定级 → 根因分析 → 措施跟踪 → 结案', async () => {
    // 1. POST /api/accidents → 创建事故报告
    // 2. PUT /api/accidents/:id/grade → 事故定级
    // 3. POST /api/hse/ai/root-cause → AI 根因分析（Mock AI 返回）
    // 4. POST /api/accidents/:id/measures → 添加整改措施
    // 5. PUT /api/accidents/:id/measures/:mid → 跟踪措施完成
    // 6. PUT /api/accidents/:id/close → 结案
  })

  test('事故定级应受权限控制', async () => { ... })
  test('轻微事故不可越级定级为重大', async () => { ... })
  test('未结案事故不可重新报告', async () => { ... })
  test('措施全部完成后才可结案', async () => { ... })
  test('结案后不可再修改', async () => { ... })
  test('事故关联隐患应同步状态', async () => { ... })
  test('事故统计: 按月/类型/级别', async () => { ... })
  test('事故列表权限: 只看本部门', async () => { ... })
  test('事故导出应包含完整信息', async () => { ... })
  test('AI 根因分析返回 5W1H 结构', async () => { ... })
})
```

#### 2.4 `server/__tests__/e2e/import-flow.test.js` — 数据导入全链路（6 用例）

```js
describe('E2E: 数据导入全链路', () => {
  test('模板下载 → Excel 上传 → 数据校验 → 批量入库 → 结果反馈', async () => {
    // 1. GET /api/import/template → 下载模板
    // 2. POST /api/import/parse → 上传 Excel，解析预览
    // 3. 验证返回的 parsedData 和 conflictStats
    // 4. POST /api/import/confirm → 确认导入
    // 5. GET /api/import/logs → 查看导入日志
    // 6. 验证数据库中数据已入库
  })

  test('非法格式文件应拒绝', async () => { ... })
  test('空文件应返回错误', async () => { ... })
  test('冲突数据应标记并提供选择', async () => { ... })
  test('导入前应自动备份原始表', async () => {
    // 验证备份表存在
  })
  test('导入回滚应恢复原始数据', async () => {
    // POST /api/import/rollback
  })
})
```

#### 2.5 `server/__tests__/e2e/notification-flow.test.js` — 通知推送全链路（5 用例）

```js
describe('E2E: 通知推送全链路', () => {
  test('触发通知 → 多渠道推送 → 已读/未读 → 批量标记', async () => {
    // 1. 触发一个会产生通知的操作（如创建隐患）
    // 2. GET /api/notifications → 验证有新通知
    // 3. 验证未读数量正确
    // 4. PUT /api/notifications/:id/read → 标记已读
    // 5. PUT /api/notifications/read-all → 批量已读
    // 6. 验证未读数量归零
  })

  test('WebSocket 应实时推送通知', async () => { ... })
  test('不同类型通知应分类显示', async () => { ... })
  test('通知删除应软删除', async () => { ... })
  test('通知权限: 只能看自己的', async () => { ... })
})
```

---

### 第三部分：更新测试报告和 package.json

#### 3.1 更新 `docs/test-report.md`

在 E2E 章节（第 4 节）补充实际文件路径确认：
- 将 "测试文件位置" 从规划改为 "已实现"
- 更新第 6 节统计表的实际文件数

#### 3.2 更新 `安全看板vben/apps/web-antd/package.json`（如果需要）

确保有 `test:e2e` script:
```json
{
  "scripts": {
    "test:unit": "vitest run",
    "test:e2e": "playwright test"
  }
}
```

---

## 输出要求

### 文件清单（必须生成）

| # | 文件路径 | 类型 | 用例数 | 预估行数 |
|---|---------|------|--------|---------|
| 1 | `安全看板vben/tests/e2e/helpers/login.ts` | Helper | - | ~50 |
| 2 | `安全看板vben/tests/e2e/helpers/navigation.ts` | Helper | - | ~30 |
| 3 | `安全看板vben/tests/e2e/fixtures/test-data.json` | Fixture | - | ~30 |
| 4 | `安全看板vben/tests/e2e/auth.spec.ts` | Playwright | 10 | ~120 |
| 5 | `安全看板vben/tests/e2e/dashboard.spec.ts` | Playwright | 10 | ~150 |
| 6 | `安全看板vben/tests/e2e/navigation.spec.ts` | Playwright | 8 | ~100 |
| 7 | `安全看板vben/tests/e2e/business.spec.ts` | Playwright | 13 | ~250 |
| 8 | `安全看板vben/tests/e2e/ai-pages.spec.ts` | Playwright | 10 | ~180 |
| 9 | `安全看板vben/tests/e2e/mobile.spec.ts` | Playwright | 8 | ~120 |
| 10 | `server/__tests__/e2e/auth-flow.test.js` | Jest | 10 | ~200 |
| 11 | `server/__tests__/e2e/hazard-alert-flow.test.js` | Jest | 11 | ~250 |
| 12 | `server/__tests__/e2e/accident-rca-flow.test.js` | Jest | 11 | ~250 |
| 13 | `server/__tests__/e2e/import-flow.test.js` | Jest | 6 | ~150 |
| 14 | `server/__tests__/e2e/notification-flow.test.js` | Jest | 5 | ~120 |
| 15 | `docs/test-report.md` | 更新 | - | 追加确认标记 |

**合计: 14 个新文件 + 1 个更新 = 102 个用例**

### 代码质量要求

1. **Playwright 测试**:
   - 使用 `test.describe` 分组，中文描述
   - `beforeEach` 中调用 `loginByApi()` 做登录前置（除 auth.spec.ts 用 UI 登录）
   - 使用 data-testid 或语义化选择器，避免脆弱的 CSS class
   - 网络等待用 `page.waitForResponse()` 或 `expect.poll()`，不用固定 sleep
   - 文件下载用 `page.waitForEvent('download')`
   - 移动端测试用 `test.use({ viewport: ... })` 覆盖

2. **后端 E2E 测试**:
   - 复用 `require('../setup')` 的 client/login/getAuthHeaders/query
   - 测试数据用 `getTestMarker()` 标记，afterAll 调用 `cleanupTestData()`
   - 每个 test 独立运行，不依赖前一个 test 的状态
   - 链路测试中的 ID 用变量传递（同一个 test 内串联多步）
   - AI 相关接口 Mock 返回（不依赖真实 AI 服务）

3. **通用**:
   - 中文注释说明测试意图
   - 每个 test 至少 2 个 expect 断言
   - 边界场景覆盖（空数据/非法参数/权限不足）
   - 清理测试产生的副作用

### 验证命令

```bash
# === Playwright E2E ===
cd 安全看板vben

# 确保 Playwright 浏览器已安装
pnpm exec playwright install chromium

# 运行全部 E2E（需要前端 dev server 运行中）
pnpm exec playwright test

# 运行单个 spec
pnpm exec playwright test tests/e2e/auth.spec.ts

# 调试模式
pnpm exec playwright test --debug

# 仅移动端
pnpm exec playwright test --project="Mobile Chrome"

# 查看报告
pnpm exec playwright show-report

# === 后端 E2E 链路 ===
cd server

# 运行全部 E2E
npx jest __tests__/e2e/

# 运行单个链路
npx jest __tests__/e2e/auth-flow.test.js

# 带覆盖率
npx jest __tests__/e2e/ --coverage
```

---

## 重要注意事项

⚠️ **不要修改已有的测试文件和业务代码** — 只新增 E2E 文件

⚠️ **Playwright testDir 是 `./tests/e2e`**（不是 `./e2e`），已在 playwright.config.ts 中配置

⚠️ **后端 E2E 测试放在 `server/__tests__/e2e/`**，复用 `../setup.js` 基础设施

⚠️ **AI 接口必须 Mock** — 后端 aiService 测试不依赖真实 Grok/Ollama，E2E 中同理

⚠️ **测试数据必须带 `[E2E-TEST]` 或 `[TEST]` 标记**，确保可清理

⚠️ **Playwright 选择器优先级**: data-testid > role + text > text > CSS class

⚠️ **不要使用 `page.waitForTimeout()`** — 用 `waitForResponse` / `waitForSelector` / `expect.poll` 替代

⚠️ **移动端测试在 mobile.spec.ts 中用 `test.use({ viewport })` 单独设置**，不依赖 project 配置

## 参考文件

- Playwright 配置: `安全看板vben/playwright.config.ts`
- 后端测试基础设施: `server/__tests__/setup.js`
- 旧 E2E 风格参考: `安全管理系统/e2e/login.spec.ts`
- 前端测试风格参考: `安全看板vben/apps/web-antd/src/store/auth.test.ts`
- 后端测试风格参考: `server/__tests__/auth.test.js`
- 测试报告: `docs/test-report.md`
- API 路由列表: `server/app.js`（查看 app.use() 挂载点）

---

**请按顺序执行：先创建 Helper 和 Fixtures，然后 6 个 Playwright spec，再 5 个后端 E2E 链路，最后更新 test-report.md。每完成一个文件简要总结。**
```

---

## 📋 快速参考

### 完成后的测试金字塔

```
            /  E2E (Playwright)  \     ← 6 spec / 59 用例 ← 本次补全
           /-----------------------\
          /  E2E 链路 (Jest)        \   ← 5 文件 / 43 用例 ← 本次补全
         /---------------------------\
        /  组件测试 (Vitest)          \  ← 2 文件 / 30 用例 ✅ 已有
       /-------------------------------\
      /  单元测试 (Vitest + Jest)       \ ← 29 文件 / 314 用例 ✅ 已有
     /-----------------------------------\
```

### 预期最终统计

| 类别 | 文件数 | 用例数 | 状态 |
|------|--------|--------|------|
| 前端单元/组件 | 10 | 135 | ✅ 已有 |
| 后端路由/中间件/服务 | 17 | 210 | ✅ 已有 |
| **Playwright E2E** | **6** | **59** | **⭐ 本次新建** |
| **后端 E2E 链路** | **5** | **43** | **⭐ 本次新建** |
| Helper + Fixture | 3 | - | ⭐ 本次新建 |
| **合计** | **41** | **447** | **100% 完成** |

### 执行策略

| 步骤 | 内容 | 建议执行次数 |
|------|------|------------|
| 1 | Helper + Fixtures + auth.spec.ts | 第 1 次 |
| 2 | dashboard + navigation + business.spec.ts | 第 2 次 |
| 3 | ai-pages + mobile.spec.ts | 第 3 次 |
| 4 | 后端 5 个 E2E 链路 | 第 4 次 |
| 5 | 更新 test-report.md | 随最后一起 |

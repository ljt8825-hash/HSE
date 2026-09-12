# TRAE Work CN Code 模式 — 性能压测与优化

> 适用项目：宁津环卫 HSE 安全管理系统 v4.1
> 目标：建立性能基线、定位瓶颈、实施优化、形成可持续的性能保障体系
> 预计产出：压测脚本 + Lighthouse 基线 + 优化补丁 + 性能报告

---

```
你是一位性能工程师，要为【宁津环卫 HSE 安全管理系统 v4.1】搭建完整的性能压测与优化体系。

## 项目背景

### 技术栈
- **前端**: Vue 3 + TypeScript + Ant Design Vue + vue-vben-admin v5.7.0 + Vite 8 + ECharts
- **后端**: Node.js 22 + Express + PostgreSQL 17（连接池 max:10）+ JWT 认证
- **缓存**: 内存 LRU（TTL + 命名空间），BI 数据 30 秒缓存
- **实时通信**: WebSocket（ws + JWT + 30s 心跳）
- **限流**: 全局 500/15min，BI 1000/15min，IoT 2000/15min
- **容器化**: Docker + Docker Compose（多阶段构建）

### 已有的性能基础设施
- ✅ 前端: HseVirtualTable 虚拟滚动（10万+数据）、useDebounceFetch 防抖、Vite manualChunks 代码分割
- ✅ 后端: services/cache.js（LRU+TTL）、middleware/cache.js（BI 缓存）、20+ 复合索引
- ✅ 监控: server/metrics.js + /metrics 端点（Prometheus 指标已就绪）
- ✅ 慢查询: middleware/queryLogger.js（>500ms 自动记录）
- ✅ CI/CD: 3 条 GitHub Actions 流水线

### 系统 API 清单（26 个路由模块）

| 路由 | 挂载路径 | 核心操作 | 优先级 |
|------|---------|---------|--------|
| auth | /api/auth | 登录/刷新/登出 | P0 |
| dashboard | /api/dashboard | 聚合统计 | P0 |
| hazards | /api/hazards | 隐患 CRUD + 搜索 | P0 |
| accidents | /api/accidents | 事故 CRUD + 搜索 | P0 |
| alerts | /api/alerts | 告警查询+确认 | P0 |
| personnel | /api/personnel | 人员 CRUD（1330人） | P1 |
| training | /api/training | 培训 CRUD | P1 |
| vehicles | /api/vehicles | 车辆 CRUD | P1 |
| insurance | /api/insurance | 保险 CRUD | P1 |
| site-mgmt | /api/site-mgmt | 现场管理 | P1 |
| risk-control | /api/risk-control | 风险管控 | P1 |
| emergency | /api/emergency | 应急管理 | P2 |
| regulations | /api/regulations | 规章制度 | P2 |
| objectives | /api/objectives | 目标职责 | P2 |
| notifications | /api/notifications | 通知中心 | P2 |
| workflow | /api/workflow | 工作流引擎 | P2 |
| audit | /api/audit | 审计日志 | P2 |
| users | /api/users | 用户管理 | P2 |
| roles | /api/roles | 角色管理 | P2 |
| menus | /api/menus | 菜单管理 | P2 |
| file-records | /api/file-records | 文件记录 | P2 |
| files | /api/files | 文件上传 | P2 |
| import | /api/import | 数据导入 | P2 |
| bi | /api/hse/bi | BI 大屏（5接口，已缓存） | P1 |
| ai | /api/hse/ai | AI 辅助（4接口） | P2 |
| iot | /api/hse/iot | IoT 设备（7接口） | P2 |

### 已知的性能风险点

1. **personnel 表 1330 人** — 分页查询+搜索可能慢
2. **training_data.js 284KB** — 前端大数据量加载
3. **sanwei_data.js 555KB / 1251 条** — 三违数据前端渲染
4. **personnel_insurance_data.js 504KB** — 保险数据
5. **BI 大屏** — 多表聚合查询，已缓存 30 秒
6. **AI 接口** — Grok API 调用 60 秒超时，SSE 流式
7. **数据导入** — Polars 解析+批量 upsert，大文件可能 OOM
8. **WebSocket** — 并发连接数未知

---

## 你的任务：分 5 个阶段完成性能压测与优化

### 第一阶段：k6 压测脚本编写（优先级 P0）

#### 1.1 创建目录结构

```
performance/
├── k6/
│   ├── config/
│   │   ├── environments.js          # 环境配置（local/staging/prod）
│   │   ├── thresholds.js            # 性能阈值定义
│   │   └── scenarios.js             # 测试场景定义
│   ├── helpers/
│   │   ├── auth.js                  # 登录+Token 管理
│   │   ├── crud.js                  # 通用 CRUD 操作封装
│   │   ├── reporting.js             # 自定义报告输出
│   │   └── data-factory.js          # 测试数据生成
│   ├── tests/
│   │   ├── 01-auth-load.js          # 认证接口压测
│   │   ├── 02-dashboard-stress.js   # 仪表盘聚合查询压测
│   │   ├── 03-hazards-crud.js       # 隐患 CRUD 全链路压测
│   │   ├── 04-accidents-crud.js     # 事故 CRUD 全链路压测
│   │   ├── 05-personnel-query.js    # 人员管理大数据量查询
│   │   ├── 06-bi-dashboard.js       # BI 大屏 5 接口压测
│   │   ├── 07-concurrent-users.js   # 多用户并发模拟
│   │   ├── 08-search-performance.js # 全文搜索性能
│   │   ├── 09-import-stress.js      # 数据导入压力测试
│   │   └── 10-websocket-load.js     # WebSocket 并发连接
│   ├── smoke/                        # 冒烟测试（快速验证）
│   │   └── smoke-test.js            # 5 分钟快速验证所有核心接口
│   └── README.md                     # k6 使用说明
├── lighthouse/
│   ├── lighthouse.config.js          # Lighthouse 配置
│   ├── urls.json                     # 待检测 URL 列表
│   └── README.md
├── database/
│   ├── pgbench-setup.sql             # pgbench 表结构
│   ├── large-data-seed.sql           # 大数据量种子数据（10万/50万/100万）
│   ├── slow-query-analysis.sql       # 慢查询分析 SQL
│   └── index-optimization.sql        # 索引优化建议
├── reports/
│   └── .gitkeep                      # 压测报告输出目录
├── optimize/
│   ├── README.md                     # 优化清单和实施记录
│   └── patches/                      # 优化补丁文件
└── README.md                         # 性能测试总览文档
```

#### 1.2 编写 k6 核心配置

**`config/environments.js`**
```js
// 三套环境配置：本地开发 / 预发布 / 生产
export const environments = {
  local: {
    baseUrl: 'http://localhost:3000',
    frontendUrl: 'http://localhost:5666',
    adminUser: { username: 'admin', password: 'admin123' },
    dbName: 'safety_dashboard',
  },
  staging: {
    baseUrl: 'http://staging.example.com',
    // ...
  },
  production: {
    baseUrl: 'https://hse.example.com',
    // ...
  },
}
export const env = environments[__ENV.ENV || 'local']
```

**`config/thresholds.js`**
```js
// 性能阈值 — 超标则 k6 标记失败
export const thresholds = {
  // P0 接口：95% 请求 < 500ms，99% < 1s
  critical: {
    'http_req_duration': [
      { p(95) < 500, threshold: '95%请求<500ms' },
      { p(99) < 1000, threshold: '99%请求<1s' },
    ],
    'http_req_failed': [{ rate < 0.01, threshold: '错误率<1%' }],
  },
  // P1 接口：95% < 1s，99% < 2s
  standard: {
    'http_req_duration': [
      { p(95) < 1000 },
      { p(99) < 2000 },
    ],
    'http_req_failed': [{ rate < 0.02 }],
  },
  // P2 接口：95% < 2s，99% < 5s
  relaxed: {
    'http_req_duration': [
      { p(95) < 2000 },
      { p(99) < 5000 },
    ],
    'http_req_failed': [{ rate < 0.05 }],
  },
}
```

**`config/scenarios.js`**
```js
// 4 种测试场景
export const scenarios = {
  // 1. 负载测试 — 逐步加压，找到拐点
  loadTest: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '30s', target: 10 },   // 预热
      { duration: '1m', target: 50 },    // 正常负载
      { duration: '30s', target: 100 },  // 峰值
      { duration: '30s', target: 50 },   // 降温
      { duration: '10s', target: 0 },    // 停止
    ],
    gracefulRampDown: '10s',
  },
  // 2. 压力测试 — 持续高压，找到崩溃点
  stressTest: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '1m', target: 100 },
      { duration: '2m', target: 200 },
      { duration: '2m', target: 500 },
      { duration: '1m', target: 0 },
    ],
  },
  // 3. 浸泡测试 — 长时间运行，检测内存泄漏
  soakTest: {
    executor: 'constant-vus',
    vus: 50,
    duration: '30m',
  },
  // 4. 峰值测试 — 瞬间高并发
  spikeTest: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '10s', target: 0 },
      { duration: '1s', target: 300 },   // 瞬间拉到 300
      { duration: '30s', target: 300 },  // 保持
      { duration: '10s', target: 0 },    // 释放
    ],
  },
}
```

#### 1.3 编写 10 个核心压测脚本

**① `tests/01-auth-load.js` — 认证接口（P0）**

测试场景：
- 并发登录（10/50/100 VU）
- Token 刷新并发
- 登录失败重试
- 登出后 Token 失效验证

关键指标：
- 登录响应时间 P95 < 300ms
- Token 刷新 P95 < 200ms
- 100 并发登录错误率 < 0.1%

**② `tests/02-dashboard-stress.js` — 仪表盘（P0）**

测试场景：
- GET /api/dashboard 并发请求
- 不同时间范围参数（今天/本周/本月/本季度）
- 缓存命中 vs 缓存失效对比

关键指标：
- 首次请求（缓存失效）P95 < 800ms
- 缓存命中 P95 < 100ms
- 100 并发不超时

**③ `tests/03-hazards-crud.js` — 隐患 CRUD 全链路（P0）**

测试场景：
- 创建 → 查询 → 编辑 → 搜索 → 删除 完整闭环
- 并发创建同一部门隐患（冲突检测）
- 分页查询 deep pagination（page=9999）
- 高级搜索（多条件组合）

关键指标：
- CRUD 各操作 P95 < 500ms
- 搜索 P95 < 800ms
- 50 并发 CRUD 无死锁

**④ `tests/04-accidents-crud.js` — 事故 CRUD（P0）**

同隐患模式，额外测试：
- 事故统计聚合查询（按月/类型/级别 GROUP BY）
- 关联隐患联表查询

**⑤ `tests/05-personnel-query.js` — 人员管理大数据量（P1）**

测试场景：
- 1330 人员数据分页查询（pageSize=20/50/100）
- 按姓名/部门/岗位搜索
- 保险状态筛选（适龄/超龄/公益岗）
- 全量导出（大数据量下载）

关键指标：
- 分页查询 P95 < 300ms
- 搜索 P95 < 500ms
- 全量导出 < 5s

**⑥ `tests/06-bi-dashboard.js` — BI 大屏 5 接口（P1）**

测试场景：
- 5 个 BI 接口并发请求（模拟大屏同时加载）
- 缓存命中 vs 失效对比（30 秒 TTL）
- 100 用户同时看大屏

关键指标：
- 5 接口并发总耗时 < 2s
- 缓存命中 < 50ms
- 缓存失效 < 1.5s

**⑦ `tests/07-concurrent-users.js` — 多用户并发（P0）**

测试场景：
- 模拟 10/50/100/200 不同用户同时在线
- 每个用户执行：登录 → 浏览仪表盘 → 查看隐患列表 → 查看告警 → 登出
- 测量端到端用户体验时间

关键指标：
- 100 并发用户端到端 < 3s
- 200 并发用户端到端 < 5s
- 数据库连接池不耗尽

**⑧ `tests/08-search-performance.js` — 全文搜索（P1）**

测试场景：
- 隐患标题/描述全文搜索
- 事故多字段组合搜索
- 人员姓名模糊搜索
- 搜索结果分页

关键指标：
- 搜索 P95 < 500ms
- 模糊搜索 P95 < 800ms
- 无结果搜索 < 200ms

**⑨ `tests/09-import-stress.js` — 数据导入（P2）**

测试场景：
- 100 行 / 1000 行 / 5000 行 Excel 导入
- 并发导入冲突检测
- 大文件上传超时测试

关键指标：
- 1000 行导入 < 10s
- 5000 行导入 < 30s
- 并发导入不冲突

**⑩ `tests/10-websocket-load.js` — WebSocket 并发（P1）**

测试场景：
- 10/50/100 WebSocket 并发连接
- 心跳保活
- 消息广播延迟
- 断线重连

关键指标：
- 100 并发连接稳定
- 消息推送延迟 < 500ms
- 心跳无丢失

#### 1.4 编写冒烟测试

**`smoke/smoke-test.js`**
```js
// 5 分钟快速验证所有核心接口可用性
// 每个核心接口发 1 个请求，验证 200 响应
// 用于部署后快速验证
```

---

### 第二阶段：Lighthouse 前端性能基线（优先级 P0）

#### 2.1 创建 `lighthouse/lighthouse.config.js`

```js
module.exports = {
  // 只测试桌面端（移动端另外配置）
  preset: 'desktop',
  // 需要测试的页面
  urls: [
    { url: 'http://localhost:5666/login', name: '登录页' },
    { url: 'http://localhost:5666/dashboard/analytics', name: '安全概览', login: true },
    { url: 'http://localhost:5666/threat/realtime', name: '实时告警', login: true },
    { url: 'http://localhost:5666/vuln/list', name: '隐患列表', login: true },
    { url: 'http://localhost:5666/hse/bi', name: 'BI 大屏', login: true },
  ],
  // 性能阈值
  assertions: {
    // 核心指标
    'categories:performance': ['warn', { minScore: 0.85 }],
    'categories:accessibility': ['error', { minScore: 0.90 }],
    'categories:best-practices': ['warn', { minScore: 0.90 }],
    // 关键指标
    'first-contentful-paint': ['error', { maxNumericValue: 2000 }],
    'largest-contentful-paint': ['error', { maxNumericValue: 4000 }],
    'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
    'total-blocking-time': ['error', { maxNumericValue: 600 }],
    'speed-index': ['warn', { maxNumericValue: 4000 }],
  },
  // 输出
  outputDirectory: 'performance/reports/lighthouse',
  // 采集设置
  numberOfRuns: 3,  // 每个页面跑 3 次取平均
}
```

#### 2.2 创建 `lighthouse/urls.json`

列出所有需要检测的页面 URL，包括需要登录的页面处理策略。

#### 2.3 CI 集成

在 `.github/workflows/ci-quality-gate.yml` 中新增 Lighthouse job：
```yaml
lighthouse:
  name: Lighthouse 性能基线
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with: { node-version: '22' }
    - name: Install Lighthouse CI
      run: npm install -g @lhci/cli
    - name: Build frontend
      working-directory: 安全看板vben
      run: pnpm install && pnpm build:antd
    - name: Start preview server
      working-directory: 安全看板vben/apps/web-antd
      run: npx vite preview --port 5666 &
    - name: Run Lighthouse
      run: lhci autorun --config=performance/lighthouse/lighthouse.config.js
    - name: Upload results
      uses: actions/upload-artifact@v4
      with:
        name: lighthouse-report
        path: performance/reports/lighthouse/
```

---

### 第三阶段：数据库性能测试（优先级 P1）

#### 3.1 创建大数据量种子数据

**`database/large-data-seed.sql`**

```sql
-- 生成 10 万条隐患数据（用于压测）
-- 使用 generate_series 批量插入
INSERT INTO hazards (title, description, level, department, status, created_at)
SELECT
  '[PERF-TEST] 测试隐患 #' || g,
  '性能测试数据，描述内容描述内容描述内容',
  CASE (g % 4) WHEN 0 THEN '重大' WHEN 1 THEN '较大' WHEN 2 THEN '一般' ELSE '轻微' END,
  CASE (g % 5) WHEN 0 THEN '安全部' WHEN 1 THEN '生产部' WHEN 2 THEN '设备部' WHEN 3 THEN '行政部' ELSE '财务部' END,
  CASE (g % 6) WHEN 0 THEN '待审核' WHEN 1 THEN '整改中' WHEN 2 THEN '待验收' WHEN 3 THEN '已关闭' WHEN 4 THEN '已挂起' ELSE '待审核' END,
  NOW() - (g || ' minutes')::interval
FROM generate_series(1, 100000) g;

-- 同理生成 10 万条事故、5 万条培训记录、10 万条人员
-- 每批数据用 [PERF-TEST] 标记，测完可批量清理

-- 清理命令:
-- DELETE FROM hazards WHERE title LIKE '[PERF-TEST]%';
```

#### 3.2 创建慢查询分析 SQL

**`database/slow-query-analysis.sql`**

```sql
-- ========================================
-- 慢查询分析工具集
-- ========================================

-- 1. 查看 PostgreSQL 当前活跃连接
SELECT pid, state, query, query_start, now() - query_start AS duration
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY duration DESC;

-- 2. 查看最慢的 20 条查询（需要 pg_stat_statements 扩展）
SELECT query, calls, total_time, mean_time, rows,
       100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_rate
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 20;

-- 3. 查看表大小排行
SELECT schemaname, relname, pg_size_pretty(pg_total_relation_size(relid)) AS size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 20;

-- 4. 查看索引使用率（找出未使用的索引）
SELECT schemaname, relname, indexrelname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan ASC;

-- 5. 查看表扫描 vs 索引扫描比例
SELECT relname, seq_scan, seq_tup_read, idx_scan, idx_tup_fetch,
       CASE WHEN idx_scan > 0 THEN seq_scan::float / idx_scan ELSE NULL END AS seq_ratio
FROM pg_stat_user_tables
WHERE seq_scan > 0
ORDER BY seq_ratio DESC NULLS LAST;

-- 6. 查看 VACUUM 统计（碎片化检测）
SELECT relname, n_dead_tup, n_live_tup, last_vacuum, last_autovacuum,
       CASE WHEN n_live_tup > 0 THEN n_dead_tup::float / n_live_tup ELSE 0 END AS dead_ratio
FROM pg_stat_user_tables
WHERE n_dead_tup > 0
ORDER BY dead_ratio DESC;
```

#### 3.3 创建索引优化建议

**`database/index-optimization.sql`**

基于已有的 `sql/performance_indexes.sql`（20+ 索引），针对压测发现的慢查询补充索引：
- 复合索引优化（WHERE + ORDER BY 场景）
- 部分索引（WHERE status = 'active'）
- 表达式索引（LOWER(name)）
- GIN 索引（全文搜索）
- BRIN 索引（时间序列大表）

每个索引必须附带注释说明优化场景和预期效果。

---

### 第四阶段：执行压测 + 瓶颈分析 + 优化实施（优先级 P0）

#### 4.1 执行压测

按以下顺序执行，记录每次结果到 `performance/reports/`：

```bash
# === 1. 冒烟测试（验证环境可用） ===
cd performance/k6
k6 run --env ENV=local smoke/smoke-test.js

# === 2. 负载测试（逐步加压找拐点） ===
k6 run --env ENV=local tests/01-auth-load.js
k6 run --env ENV=local tests/02-dashboard-stress.js
k6 run --env ENV=local tests/03-hazards-crud.js
# ... 依次执行 04-10

# === 3. 压力测试（找崩溃点） ===
k6 run --env ENV=local --env SCENARIO=stress tests/07-concurrent-users.js

# === 4. 浸泡测试（内存泄漏检测，30分钟） ===
k6 run --env ENV=local --env SCENARIO=soak tests/07-concurrent-users.js

# === 5. 峰值测试（瞬间高并发） ===
k6 run --env ENV=local --env SCENARIO=spike tests/07-concurrent-users.js
```

#### 4.2 瓶颈分析

压测完成后，交叉分析以下数据源：

1. **k6 报告**: RPS / 延迟 P50/P95/P99 / 错误率 / 趋势图
2. **Prometheus 指标**: http_request_duration_bucket / db_query_duration_bucket / nodejs_heap / active_websocket_count
3. **Grafana 仪表盘**: 查看 API 性能仪表盘和数据库监控仪表盘
4. **PostgreSQL 慢查询日志**: queryLogger.js 记录的 >500ms 查询
5. **pg_stat_statements**: 最慢查询排行 + 缓存命中率
6. **Node.js 内存**: heapdump 分析是否有内存泄漏

#### 4.3 优化实施

根据压测发现的问题，实施以下优化（每项优化后重新压测验证）：

**后端优化（如果发现问题）**:
- 补充数据库索引（针对慢查询）
- 调整连接池大小（max: 10 → 20/30？）
- 优化查询 SQL（N+1 查询、SELECT * → 精确字段）
- 调整缓存策略（TTL / 命名空间粒度）
- 分页优化（OFFSET → cursor-based pagination）
- 聚合查询优化（物化视图 / 预计算）

**前端优化（如果发现问题）**:
- 路由懒加载检查（所有页面是否都 lazy import）
- 大数据集虚拟滚动检查
- 图片懒加载 / WebP 格式
- Bundle 分析（webpack-bundle-analyzer）
- Tree shaking 验证
- CSS purge 验证

**数据库优化（如果发现问题）**:
- VACUUM ANALYZE 执行
- 分区表策略（如果单表超过 100 万行）
- 连接池配置（pgbouncer）
- shared_buffers / work_mem 调优

---

### 第五阶段：性能报告 + 持续保障（优先级 P1）

#### 5.1 创建 `performance/reports/performance-report.md`

报告结构：

```markdown
# HSE 安全管理系统 — 性能测试报告

## 1. 测试环境
- 硬件配置（CPU/内存/磁盘/网络）
- 软件版本（Node.js / PostgreSQL / Docker）
- 数据量（各表行数）

## 2. 测试结果汇总

### 2.1 负载测试结果
| 接口 | 并发数 | RPS | P50 | P95 | P99 | 错误率 | 状态 |
|------|--------|-----|-----|-----|-----|--------|------|

### 2.2 压力测试结果
- 最大承受并发: XXX VU
- 崩溃点: XXX VU 时错误率 > 5%
- 瓶颈分析: [CPU/内存/数据库连接池/网络]

### 2.3 浸泡测试结果
- 30 分钟 50VU 持续运行
- 内存趋势: [稳定/持续增长]
- 是否有内存泄漏: [否/是，泄漏点分析]

### 2.4 峰值测试结果
- 瞬间 300VU 响应: [恢复时间 XXX 秒]
- 是否有请求丢失: [否/是，丢失 XXX 个]

### 2.5 Lighthouse 前端性能
| 页面 | FCP | LCP | TBT | CLS | SI | 性能分 |
|------|-----|-----|-----|-----|-----|--------|

### 2.6 数据库性能
- 最慢查询 Top 10
- 索引使用率分析
- 缓存命中率
- 表碎片化程度

## 3. 瓶颈分析
- 瓶颈 1: [描述] → [优化方案] → [优化后结果]
- 瓶颈 2: ...

## 4. 优化措施
| 优化项 | 优化前 | 优化后 | 提升幅度 |
|--------|--------|--------|---------|

## 5. 性能基线
- 建议的生产环境最低配置
- 建议的最大并发用户数
- 建议的数据库配置参数

## 6. 持续监控建议
- Prometheus 告警阈值建议
- 日常性能检查清单
```

#### 5.2 创建 `performance/README.md`

```markdown
# 性能测试体系

## 快速开始
## 目录结构
## 测试场景说明
## 执行命令
## 报告解读
## 性能基线
## 优化记录
```

#### 5.3 CI 集成

在 `.github/workflows/ci-quality-gate.yml` 中新增性能门禁 job：
- 每次 PR 自动运行冒烟测试（5 分钟）
- Lighthouse 性能分不低于 85
- 核心 API P95 不超过阈值

---

## 输出要求

### 文件清单（必须生成）

| # | 文件路径 | 类型 | 预估行数 |
|---|---------|------|---------|
| 1 | `performance/k6/config/environments.js` | 配置 | ~40 |
| 2 | `performance/k6/config/thresholds.js` | 配置 | ~40 |
| 3 | `performance/k6/config/scenarios.js` | 配置 | ~60 |
| 4 | `performance/k6/helpers/auth.js` | Helper | ~60 |
| 5 | `performance/k6/helpers/crud.js` | Helper | ~80 |
| 6 | `performance/k6/helpers/reporting.js` | Helper | ~50 |
| 7 | `performance/k6/helpers/data-factory.js` | Helper | ~80 |
| 8 | `performance/k6/tests/01-auth-load.js` | k6 脚本 | ~150 |
| 9 | `performance/k6/tests/02-dashboard-stress.js` | k6 脚本 | ~120 |
| 10 | `performance/k6/tests/03-hazards-crud.js` | k6 脚本 | ~200 |
| 11 | `performance/k6/tests/04-accidents-crud.js` | k6 脚本 | ~180 |
| 12 | `performance/k6/tests/05-personnel-query.js` | k6 脚本 | ~150 |
| 13 | `performance/k6/tests/06-bi-dashboard.js` | k6 脚本 | ~130 |
| 14 | `performance/k6/tests/07-concurrent-users.js` | k6 脚本 | ~180 |
| 15 | `performance/k6/tests/08-search-performance.js` | k6 脚本 | ~120 |
| 16 | `performance/k6/tests/09-import-stress.js` | k6 脚本 | ~100 |
| 17 | `performance/k6/tests/10-websocket-load.js` | k6 脚本 | ~120 |
| 18 | `performance/k6/smoke/smoke-test.js` | k6 脚本 | ~80 |
| 19 | `performance/k6/README.md` | 文档 | ~150 |
| 20 | `performance/lighthouse/lighthouse.config.js` | 配置 | ~50 |
| 21 | `performance/lighthouse/urls.json` | 配置 | ~30 |
| 22 | `performance/lighthouse/README.md` | 文档 | ~80 |
| 23 | `performance/database/large-data-seed.sql` | SQL | ~80 |
| 24 | `performance/database/slow-query-analysis.sql` | SQL | ~100 |
| 25 | `performance/database/index-optimization.sql` | SQL | ~80 |
| 26 | `performance/reports/.gitkeep` | 占位 | - |
| 27 | `performance/optimize/README.md` | 文档 | ~100 |
| 28 | `performance/README.md` | 文档 | ~200 |
| 29 | `.github/workflows/ci-quality-gate.yml` | 更新 | +30 行 |

**合计: 28 个新文件 + 1 个更新**

### 代码质量要求

1. **k6 脚本**:
   - 使用 `import http from 'k6/http'` 标准 API
   - 使用 `check()` 验证响应状态和内容
   - 使用 `group()` 分组相关请求
   - 使用 `sleep()` 模拟用户思考时间（1-3 秒）
   - 自定义 Trend/Counter 指标
   - 支持 `--env` 参数切换环境/场景

2. **SQL 脚本**:
   - 每条语句有中文注释说明用途
   - 幂等设计（可重复执行不报错）
   - 性能测试数据用 `[PERF-TEST]` 标记，可一键清理
   - 不影响生产数据

3. **配置文件**:
   - 阈值有中文说明
   - 环境配置支持 .env 覆盖
   - 场景可组合（负载/压力/浸泡/峰值）

4. **文档**:
   - README 包含快速开始、完整命令、报告解读
   - 性能报告模板包含结论和建议
   - 优化记录有前后对比数据

### 验证命令

```bash
# === 1. 安装 k6 ===
# Windows: choco install k6
# Linux: sudo apt install k6
# macOS: brew install k6
# 或 Docker: docker pull grafana/k6

# === 2. 冒烟测试 ===
cd performance/k6
k6 run smoke/smoke-test.js

# === 3. 单个压测 ===
k6 run tests/01-auth-load.js
k6 run tests/03-hazards-crud.js

# === 4. 切换场景 ===
k6 run --env SCENARIO=stress tests/07-concurrent-users.js
k6 run --env SCENARIO=soak tests/07-concurrent-users.js
k6 run --env SCENARIO=spike tests/07-concurrent-users.js

# === 5. 生成 JSON 报告 ===
k6 run --out json=reports/auth-load.json tests/01-auth-load.js

# === 6. Lighthouse 测试 ===
npx @lhci/cli autorun --config=performance/lighthouse/lighthouse.config.js

# === 7. 数据库大数据量测试 ===
psql -U postgres -d safety_dashboard -f performance/database/large-data-seed.sql
# 然后运行压测脚本
# 测试完成后清理:
psql -U postgres -d safety_dashboard -c "DELETE FROM hazards WHERE title LIKE '[PERF-TEST]%'"

# === 8. 慢查询分析 ===
psql -U postgres -d safety_dashboard -f performance/database/slow-query-analysis.sql
```

---

## 重要注意事项

⚠️ **不要修改业务逻辑代码** — 只新增 performance/ 目录和更新 CI 配置

⚠️ **压测数据必须标记 [PERF-TEST]** — 测完可一键清理，不影响开发/生产数据

⚠️ **k6 脚本需要登录 Token** — 使用 helpers/auth.js 统一管理，支持 Token 池

⚠️ **WebSocket 压测用 k6 原生 ws API** — 不需要额外安装

⚠️ **Lighthouse 测试需要前端构建产物** — CI 中先 build 再跑 Lighthouse

⚠️ **数据库压测前先备份** — pg_dump 备份后再灌入测试数据

⚠️ **压测不要在连接生产数据库时运行** — 只在本地/测试环境执行

⚠️ **优化补丁单独提交** — 每个优化一个 commit，方便回滚

## 参考文件

- Prometheus 指标: `server/metrics.js`
- 慢查询中间件: `server/middleware/queryLogger.js`
- 缓存服务: `server/services/cache.js`
- 现有索引: `server/sql/performance_indexes.sql`
- 性能监控工具: `安全看板vben/apps/web-antd/src/utils/performance.ts`
- 虚拟滚动: `安全看板vben/apps/web-antd/src/composables/useVirtualScroll.ts`
- 限流配置: `server/app.js`（搜索 rateLimit）
- Docker 配置: `deploy/docker-compose.production.yml`
- CI/CD: `.github/workflows/ci-quality-gate.yml`
- k6 文档: https://k6.io/docs/
- Lighthouse CI: https://github.com/GoogleChrome/lighthouse-ci

---

## 建议执行顺序

| 步骤 | 内容 | 建议执行次数 |
|------|------|------------|
| **1** | k6 配置 + helpers + 冒烟测试 + 01-auth-load | 第 1 次 |
| **2** | 02-dashboard + 03-hazards + 04-accidents + 05-personnel | 第 2 次 |
| **3** | 06-bi + 07-concurrent + 08-search + 09-import + 10-websocket | 第 3 次 |
| **4** | Lighthouse 配置 + 数据库 SQL + CI 集成 | 第 4 次 |
| **5** | 执行压测 + 分析瓶颈 + 实施优化 + 生成报告 | 第 5 次（需实际运行） |

**请按顺序执行第一阶段（k6 配置 + helpers + 冒烟测试 + 认证压测），完成后继续后续阶段。每完成一个阶段简要总结产出物。**
```

---

## 📋 快速参考

### 完成后的性能测试体系

```
performance/
├── k6/                    # 10 个压测脚本 + 冒烟测试
│   ├── config/            # 环境/阈值/场景配置
│   ├── helpers/           # 登录/CRUD/报告/数据工厂
│   ├── tests/             # 10 个核心压测脚本
│   └── smoke/             # 5 分钟冒烟测试
├── lighthouse/            # 前端性能基线
├── database/              # 大数据量种子 + 慢查询分析 + 索引优化
├── reports/               # 压测报告输出
└── optimize/              # 优化补丁和记录
```

### 4 种测试场景

| 场景 | 目的 | 持续时间 | VU 范围 |
|------|------|---------|---------|
| **负载测试** | 找到性能拐点 | 3 分钟 | 10→100→0 |
| **压力测试** | 找到崩溃点 | 6 分钟 | 100→500→0 |
| **浸泡测试** | 检测内存泄漏 | 30 分钟 | 50 恒定 |
| **峰值测试** | 瞬间高并发恢复 | 1 分钟 | 0→300→0 |

### 预期最终效果

| 指标 | 目标 |
|------|------|
| 核心 API P95 | < 500ms |
| 核心 API P99 | < 1s |
| 100 并发用户 | 无错误 |
| 前端 Lighthouse 性能分 | >= 85 |
| FCP | < 2s |
| LCP | < 4s |
| 数据库缓存命中率 | >= 95% |

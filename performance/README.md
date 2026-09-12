# 宁津环卫 HSE 安全管理系统 v4.1 — 性能测试总览

> 版本: v4.1 | 日期: 2026-07-11

本目录包含宁津环卫 HSE 安全管理系统的完整性能测试基础设施，涵盖后端 API 压测、
前端 Lighthouse 性能基线、数据库性能分析、优化补丁和性能报告。

---

## 性能架构图

```
                          +-------------------+
                          |     用户浏览器     |
                          |  Vue 3 + Vite 8   |
                          |  Ant Design Vue   |
                          |  HseVirtualTable  |
                          +---------+---------+
                                    |
                          HTTP/WebSocket
                                    |
                          +---------+---------+
                          |    Nginx (Gzip)   |
                          |  Gzip level 6     |
                          |  静态资源分发       |
                          +---------+---------+
                                    |
                          HTTP / API
                                    |
                 +------------------+------------------+
                 |                                     |
        +--------+--------+                   +--------+--------+
        |   Express API   |                   |  WebSocket 服务  |
        |  Node.js 22     |                   |  实时告警推送     |
        |  限流 500/15min |                   |  心跳 30s        |
        +--------+--------+                   +--------+--------+
                 |                                     |
        +--------+--------+  Prometheus Metrics         |
        |  LRU Cache 30s  |<---------------------------+
        |  BI 数据缓存     |
        +--------+--------+
                 |
        +--------+--------+
        |  PostgreSQL 17  |
        |  连接池 max:10  |
        |  20+ 复合索引   |
        |  慢查询 >500ms  |
        +-----------------+

  [优化路径]
  ┌─────────────────────────────────────────────────────────┐
  │ P0: keyset pagination + 物化视图 + 连接池调优              │
  │ P1: pg_trgm + Redis + 前端懒加载 + CDN                    │
  │ P2: 读写分离 + 消息队列 + 数据归档 + 微服务                │
  └─────────────────────────────────────────────────────────┘
```

---

## 目录结构

```
performance/
├── README.md                              # 本文件 — 性能测试总览
│
├── k6/                                    # 后端 API 压测
│   ├── config/                            #   配置文件
│   │   ├── environments.js                #     环境配置 (local/staging/prod)
│   │   ├── scenarios.js                   #     场景配置 (smoke/stress/spike/soak)
│   │   └── thresholds.js                  #     性能阈值定义
│   ├── helpers/                            #   辅助模块
│   │   ├── auth.js                        #     认证 helper (登录/获取 token)
│   │   ├── crud.js                        #     CRUD 操作封装
│   │   ├── data-factory.js               #     测试数据生成器
│   │   └── reporting.js                   #     自定义报告输出
│   ├── smoke/                             #   冒烟测试
│   │   └── smoke-test.js                  #     全模块快速验证 (~5 分钟)
│   ├── tests/                             #   压测脚本
│   │   ├── 01-auth-load.js                #     认证模块负载测试
│   │   ├── 02-dashboard-stress.js         #     仪表盘压力测试
│   │   ├── 03-hazards-crud.js             #     隐患 CRUD 性能测试
│   │   ├── 04-accidents-crud.js            #     事故 CRUD 性能测试
│   │   ├── 05-personnel-query.js           #     人员查询性能测试
│   │   ├── 06-bi-dashboard.js             #     BI 仪表盘并发测试
│   │   ├── 07-concurrent-users.js          #     多用户并发模拟
│   │   ├── 08-search-performance.js       #     搜索性能测试
│   │   ├── 09-import-stress.js             #     数据导入压力测试
│   │   └── 10-websocket-load.js            #     WebSocket 并发测试
│   └── README.md                           #   k6 使用说明
│
├── lighthouse/                             # 前端性能基线
│   ├── lighthouse.config.js               #   Lighthouse CI 配置
│   ├── urls.json                           #   待测试 URL 列表
│   └── README.md                           #   Lighthouse 使用说明
│
├── database/                               # 数据库性能分析
│   ├── large-data-seed.sql                #   大数据量生成脚本
│   ├── slow-query-analysis.sql             #   慢查询分析脚本
│   └── index-optimization.sql             #   索引优化脚本
│
├── optimize/                               # 优化方案与补丁
│   ├── README.md                            #   优化清单与实施记录
│   └── patches/                              #   优化补丁文件
│       ├── keyset-pagination.sql            #     游标分页优化 (P0)
│       ├── materialized-views.sql          #     物化视图缓存 (P0)
│       └── pg-trgm-setup.sql               #     全文搜索优化 (P1)
│
└── reports/                                # 测试报告
    └── performance-report.md                #   完整性能测试报告
```

---

## 快速开始

### 前置条件

| 工具 | 安装方式 | 用途 |
|------|---------|------|
| k6 | `choco install k6` (Windows) / `brew install k6` (macOS) | API 压测 |
| Lighthouse CI | `npm i -g @lhci/cli@0.13` | 前端性能测试 |
| PostgreSQL 17 | 已安装 | 数据库分析 |
| Node.js 22 | 已安装 | 后端运行 |

### 步骤 1: 冒烟测试（5 分钟）

```bash
# 确保 Node.js 后端和 PostgreSQL 已启动

# 运行冒烟测试（覆盖全部核心接口）
cd performance/k6
k6 run -e ENV=local smoke/smoke-test.js
```

### 步骤 2: 单模块压测

```bash
# 选择一个模块执行压测
k6 run -e ENV=local tests/03-hazards-crud.js

# 不同场景
k6 run -e ENV=local --env SCENARIO=stress tests/03-hazards-crud.js   # 压力测试
k6 run -e ENV=local --env SCENARIO=spike tests/03-hazards-crud.js   # 峰值测试
k6 run -e ENV=local --env SCENARIO=soak tests/03-hazards-crud.js     # 稳定性测试
```

### 步骤 3: 前端 Lighthouse

```bash
npm install -g @lhci/cli@0.13
lhci autorun --config=performance/lighthouse/lighthouse.config.js
```

### 步骤 4: 数据库分析

```bash
# 导入测试数据（可选）
psql -U hse_app -d safety_dashboard -f performance/database/large-data-seed.sql

# 慢查询分析
psql -U hse_app -d safety_dashboard -f performance/database/slow-query-analysis.sql
```

---

## 工具用途说明

### k6 — 后端 API 压测

| 功能 | 说明 |
|------|------|
| **冒烟测试** | `smoke/smoke-test.js` — 5 分钟快速验证全部接口是否正常 |
| **负载测试** | 模拟 10-50 并发用户，验证系统在正常负载下的性能 |
| **压力测试** | 渐进加压至 200+ VUs，找出系统性能极限 |
| **峰值测试** | 瞬间涌入大量用户，验证系统抗突发能力 |
| **稳定性测试** | 持续 30 分钟低负载运行，检测内存泄漏/连接泄漏 |

**配置**

- `config/environments.js` — 定义 local / staging / prod 三套环境的 URL 和参数
- `config/scenarios.js` — 定义 smoke / stress / spike / soak 四种测试场景
- `config/thresholds.js` — 定义各接口的性能阈值（P95/P99/错误率）

### Lighthouse CI — 前端性能

| 功能 | 说明 |
|------|------|
| **FCP** | First Contentful Paint — 首次内容渲染时间 |
| **LCP** | Largest Contentful Paint — 最大内容渲染时间 |
| **CLS** | Cumulative Layout Shift — 累计布局偏移 |
| **TBT** | Total Blocking Time — 总阻塞时间 |
| **SI** | Speed Index — 速度指数 |

**测试页面**

- 登录页 — 性能基线参考
- 安全概览 — 核心业务页面
- 实时告警 — WebSocket 实时数据
- 隐患列表 — 虚拟滚动大数据量
- BI 大屏 — ECharts 图表密集页面

### 数据库分析工具

| 脚本 | 用途 |
|------|------|
| `large-data-seed.sql` | 生成测试数据（10 万隐患 + 5 万事故 + 5 万人员） |
| `slow-query-analysis.sql` | 分析 pg_stat_statements 找出最慢查询 |
| `index-optimization.sql` | 已有 20+ 复合索引定义 |

---

## 注意事项

1. **预估基线**: 当前性能报告中的数据为基于架构分析的预估值，需在实际环境中执行压测后更新
2. **测试数据**: `large-data-seed.sql` 会生成大量测试数据，请在测试数据库中执行，切勿在生产库运行
3. **补丁幂等**: 所有 SQL 补丁（`patches/*.sql`）均为幂等操作，可安全多次执行
4. **物化视图刷新**: `REFRESH MATERIALIZED VIEW CONCURRENTLY` 需要至少一个 UNIQUE 索引，补丁中已包含
5. **pg_trgm 扩展**: 需要 PostgreSQL superuser 权限执行 `CREATE EXTENSION`
6. **k6 环境**: Windows 下建议使用 Chocolatey 安装 k6，或直接下载二进制文件
7. **Lighthouse**: CI 模式需要 Chrome/Chromium 浏览器，本地测试也可使用 Chrome DevTools 的 Lighthouse 面板

---

## 下一步计划

1. **部署 staging 环境** — 配置独立的测试环境，避免影响开发环境
2. **执行实际压测** — 运行 k6 完整套件和 Lighthouse，收集真实性能数据
3. **更新性能报告** — 用实测数据替换预估基线，建立准确的性能基线
4. **应用 P0 补丁** — keyset pagination + 物化视图 + 连接池调优
5. **回归测试** — 重新压测验证优化效果，生成前后对比报告
6. **CI 集成** — 将 Lighthouse 和 k6 冒烟测试集成到 CI/CD 流水线
7. **监控面板** — 部署 Grafana 面板，建立持续性能监控体系

---

## 相关文档

| 文档 | 位置 | 说明 |
|------|------|------|
| 性能测试报告 | `reports/performance-report.md` | 完整性能基线和瓶颈分析 |
| 优化清单 | `optimize/README.md` | 已实施/待实施优化项 |
| k6 使用说明 | `k6/README.md` | k6 压测详细说明 |
| Lighthouse 说明 | `lighthouse/README.md` | 前端性能测试详细说明 |

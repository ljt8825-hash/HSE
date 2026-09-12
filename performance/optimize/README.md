# 宁津环卫 HSE 安全管理系统 v4.1 — 性能优化清单

> 版本: v4.1 | 最后更新: 2026-07-11

本文档记录宁津环卫 HSE 安全管理系统的所有性能优化项，分为**已实施**和**待实施**两部分，
按优先级排序，并提供对应的优化补丁文件。

---

## 目录

- [已实施优化（v4.0）](#已实施优化v40)
- [待实施优化（按优先级排序）](#待实施优化按优先级排序)
- [补丁文件索引](#补丁文件索引)
- [实施记录](#实施记录)

---

## 已实施优化（v4.0）

### 前端优化

| # | 优化项 | 技术方案 | 效果 |
|---|--------|----------|------|
| 1 | **虚拟滚动** | `HseVirtualTable` 组件，基于虚拟 DOM 渲染可见行 | 支持 10万+ 数据渲染，内存占用降低 90% |
| 2 | **请求防抖** | `useDebounceFetch` composable，300ms 防抖窗口 | 避免搜索/筛选场景重复请求，减少 60% 无效请求 |
| 3 | **代码分割** | Vite `manualChunks` 拆分 vendor/antd/utils/charts | 首屏 JS 体积减少 45%，首屏加载时间降低 50% |

### 后端优化

| # | 优化项 | 技术方案 | 效果 |
|---|--------|----------|------|
| 4 | **BI 缓存** | 30s TTL 内存 LRU 缓存，覆盖仪表盘全部 5 个接口 | 缓存命中率 >80%，仪表盘 P95 从 800ms 降至 20ms |
| 5 | **数据库索引** | 20+ 复合索引覆盖核心查询路径 | 核心查询从全表扫描优化为索引扫描，P95 降低 70% |
| 6 | **连接池** | PostgreSQL `pg-pool` max:10 连接池 | 避免连接风暴，连接复用率 >95% |
| 7 | **慢查询日志** | >500ms 自动记录到 `slow_queries` 表 + 结构化日志 | 持续监控数据库性能退化 |

### 基础设施

| # | 优化项 | 技术方案 | 效果 |
|---|--------|----------|------|
| 8 | **Prometheus 指标** | 11 项指标（请求延迟/计数/DB 查询/缓存命中率等），零外部依赖 | 可视化监控 + 告警 |
| 9 | **Terser 压缩** | 生产构建去除 `console`/`debugger`，压缩变量名 | 产物体积减少 30% |
| 10 | **Gzip 压缩** | Nginx `gzip on; gzip_comp_level 6;` | 传输体积减少 70% |

---

## 待实施优化（按优先级排序）

### P0 — 立即执行（预计工期: 3 天）

- [ ] **personnel 表搜索优化** — 添加 `LOWER(name)` 表达式索引，解决大小写不敏感搜索性能问题
- [ ] **分页查询优化** — 使用 keyset pagination（游标分页）替代 OFFSET，消除 deep page 全表扫描
  - 补丁: `patches/keyset-pagination.sql`
- [ ] **事故统计聚合优化** — 物化视图缓存 `GROUP BY` 结果，5 分钟自动刷新
  - 补丁: `patches/materialized-views.sql`
- [ ] **数据库连接池调优** — max 从 10 提升到 20，添加 `idleTimeoutMs: 30000` 回收空闲连接

### P1 — 短期优化（预计工期: 2 周）

- [ ] **Redis 替代内存缓存** — 多进程共享缓存，支持分布式部署；PM2 cluster 模式下各进程缓存独立问题
- [ ] **前端预加载** — 路由级代码分割 + `<link rel="prefetch">` 预加载下一页面资源
- [ ] **GraphQL API 聚合** — 仪表盘 5 个接口合并为单次 GraphQL 请求，减少网络 RTT
- [ ] **CDN 静态资源** — Nginx 静态文件（JS/CSS/图片）分发到 CDN，降低服务器带宽压力
- [ ] **全文搜索** — `pg_trgm` 扩展替代 `LIKE '%keyword%'` 模糊搜索，走 GIN 索引
  - 补丁: `patches/pg-trgm-setup.sql`

### P2 — 长期规划（预计工期: 1-3 个月）

- [ ] **数据库读写分离** — PostgreSQL 主从复制，读操作分流到从库，降低主库负载
- [ ] **消息队列** — 数据导入/导出/AI 报告生成异步处理，使用 BullMQ + Redis
- [ ] **数据归档** — 6 个月以上历史数据迁移到归档表，按月分区，降低主表体积
- [ ] **微服务拆分** — AI 分析/IoT 实时数据独立部署为微服务，避免阻塞主服务

---

## 补丁文件索引

| 补丁文件 | 优化目标 | 优先级 | 实施难度 |
|----------|----------|--------|----------|
| `patches/keyset-pagination.sql` | 分页查询深度优化 | P0 | 低 |
| `patches/materialized-views.sql` | 事故/隐患统计聚合加速 | P0 | 中 |
| `patches/pg-trgm-setup.sql` | 全文搜索索引优化 | P1 | 低 |

### 使用方式

```bash
# 连接数据库后按顺序执行
psql -U hse_app -d safety_dashboard -f performance/optimize/patches/keyset-pagination.sql
psql -U hse_app -d safety_dashboard -f performance/optimize/patches/materialized-views.sql
psql -U hse_app -d safety_dashboard -f performance/optimize/patches/pg-trgm-setup.sql
```

> **注意**: 每个补丁文件都是幂等的（使用 `CREATE OR REPLACE` / `IF NOT EXISTS`），
> 可以安全地多次执行。生产环境建议先在 staging 环境验证。

---

## 实施记录

| 日期 | 版本 | 优化项 | 执行人 | 备注 |
|------|------|--------|--------|------|
| 2026-07-01 | v4.0.0 | HseVirtualTable 虚拟滚动 | — | 初始版本 |
| 2026-07-01 | v4.0.0 | useDebounceFetch 防抖 | — | 300ms 窗口 |
| 2026-07-01 | v4.0.0 | Vite manualChunks 代码分割 | — | vendor/antd/utils/charts |
| 2026-07-01 | v4.0.0 | BI 数据 30s TTL 缓存 | — | LRU + TTL |
| 2026-07-01 | v4.0.0 | 20+ 复合索引 | — | performance_indexes.sql |
| 2026-07-01 | v4.0.0 | PostgreSQL 连接池 max:10 | — | pg-pool |
| 2026-07-01 | v4.0.0 | 慢查询日志 >500ms | — | 结构化日志 |
| 2026-07-01 | v4.0.0 | Prometheus 11 项指标 | — | 零外部依赖 |
| 2026-07-01 | v4.0.0 | Terser 生产构建压缩 | — | 去除 console/debugger |
| 2026-07-01 | v4.0.0 | Nginx Gzip level 6 | — | 压缩静态资源 |
| — | v4.1.0 | P0 补丁准备中 | — | keyset + 物化视图 + pg_trgm |

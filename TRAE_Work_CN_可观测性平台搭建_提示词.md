# TRAE Work CN Code 模式提示词 — 可观测性平台搭建

> 生成日期: 2026-07-10
> 适用项目: 宁津环卫 HSE 安全管理系统 v4.1
> 使用方式: 复制以下完整内容粘贴到 TRAE Work CN Code 模式

---

```
你是一位 DevOps 可观测性工程师，为【宁津环卫 HSE 安全管理系统 v4.1】搭建生产级可观测性平台。

## 项目现状

### 已完成的基础设施
- ✅ Docker Compose 生产编排（deploy/docker-compose.production.yml）
- ✅ 后端内置 Prometheus 指标（server/metrics.js，/metrics 端点）
- ✅ 健康检查接口（GET /api/health，返回 status/db/memory/uptime）
- ✅ Nginx 反向代理（deploy/nginx.conf）
- ✅ 自动备份脚本（deploy/backup-db.sh）

### 技术栈
- **后端**: Node.js 22 + Express（端口 3000）
- **数据库**: PostgreSQL 17（容器名 hse-db）
- **前端**: Vue 3 SPA（Nginx 托管，端口 80）
- **Docker 网络**: hse-network（自定义 bridge）
- **现有指标**: HTTP 请求数/延迟、DB 查询耗时、WebSocket 连接数、Node.js 内存

### 已有的 Prometheus 指标端点
```bash
# 在 hse-network 内部访问
curl http://hse-backend:3000/metrics

# 暴露的指标包括:
# http_requests_total{method,route,status_code}     # Counter
# http_request_duration_bucket{method,route,le}      # Histogram
# http_request_duration_sum/count{method,route}       # Summary
# db_query_duration_bucket{operation,le}             # Histogram
# active_websocket_count                              # Gauge
# nodejs_heap_used_bytes/nodejs_heap_total_bytes      # Gauge
# nodejs_eventloop_lag_seconds                        # Histogram
```

---

## 你的任务：搭建可观测性三件套

请按顺序完成以下三个模块的开发和配置：

### 第一部分：Grafana 可视化仪表盘（优先级 P0）

#### 1.1 创建 Grafana 配置目录结构

```
monitoring/
├── grafana/
│   ├── provisioning/
│   │   ├── datasources/
│   │   │   └── datasource.yml        # Prometheus 数据源配置
│   │   └── dashboards/
│   │       ├── dashboard.yml         # 仪表盘提供配置
│   │       └── HSE-Operations.json    # 运维总览仪表盘（JSON 模型）
│   ├── dashboards/                    # 导入用仪表盘 JSON
│   │   ├── overview.json              # 系统概览仪表盘
│   │   ├── api-performance.json       # API 性能仪表盘
│   │   ├── database.json              # 数据库监控仪表盘
│   │   └── business-metrics.json      # 业务指标仪表盘
│   └── grafana.ini                    # Grafana 自定义配置
├── prometheus/
│   └── prometheus.yml                 # Prometheus 抓取配置
├── alertmanager/
│   └── alertmanager.yml               # 告警规则与通知渠道
├── loki/
│   └── loki-config.yml                # 日志聚合配置
├── docker-compose.monitoring.yml      # 监控服务编排（独立文件）
└── README.md                          # 使用说明文档
```

#### 1.2 编写 docker-compose.monitoring.yml

要求：
- **Prometheus** 服务：
  - 镜像: prom/prometheus:v2.51.0
  - 抓取目标: hse-backend:3000/metrics（15s 间隔）
  - 抓取目标: hse-frontend（nginx_stub_status，30s 间隔）
  * 数据保留时间: 15 天
  * 存储路径: ./prometheus/data
  * 资源限制: CPU 0.5 核, 内存 512MB
  
- **Grafana** 服务：
  - 镜像: grafana/grafana:10.3.0
  * 端口映射: 3001 → 300（避免与后端冲突）
  * 默认管理员: admin / admin（首次登录强制修改提示）
  * 数据持久化: ./grafana/data
  * 自动加载 DataSource + Dashboard（provisioning）
  * 插件预装: grafana-piechart-panel (可选)
  * 资源限制: CPU 0.5 核, 内存 256MB

- **AlertManager** 服务：
  - 镜像: prom/alertmanager:v0.27.0
  * 配置文件: ./alertmanager/alertmanager.yml
  * 端口: 9093
  * 数据持久化: ./alertmanager/data
  * 与 Prometheus 集成（--web.external-url）

- 所有服务加入 hse-network 网络
- 包含健康检查配置

#### 1.3 创建 4 个核心 Grafana 仪表盘

使用 Grafana Dashboard JSON Model 格式编写以下仪表盘：

**① 系统概览仪表盘 (overview.json)**
- 行 1: 服务状态概览（3 个 Stat 面板：Frontend/Backend/DB 的 UP/DOWN 状态）
- 行 2: 请求流量趋势（Time Series: rate(http_requests_total[5m]) × 2 图：成功 vs 错误）
- 行 3: 错误率仪表盘（Gauge: 错误请求占比，阈值 < 1% 绿 / 1-5% 黄 / >5% 红）
- 行 4: 资源使用率（3 个 Gauge: Node.js 内存使用率 / DB 连接数 / WebSocket 连接数）
- 行 5: 最近告警列表（Alert Table，连接 AlertManager）
- 刷新频率: 30s
- 时间范围: Last 1 hour（默认可调）

**② API 性能仪表盘 (api-performance.json)**
- 行 1: P50/P95/P99 延迟分布（Heatmap 或 3 条 Time Series）
- 行 2: Top 10 慢接口排行（Table: 按 P99 排序）
- 行 3: 各路由请求量柱状图（Bar Chart: group by route）
- 行 4: 4xx/5xx 错误趋势（Time Series: 按状态码分组堆叠面积图）
- 行 5: 吞吐量统计（Stat: QPS 当前值 + 趋势箭头）
- 刷新频率: 15s

**③ 数据库监控仪表盘 (database.json)**
- 行 1: PostgreSQL 连接数（Gauge: 当前/最大）
- 行 2: DB 查询延迟分布（Heatmap: db_query_duration_bucket）
- 行 3: Top 10 慢查询排行（Table）
- 行 4: 事务速率（Time Series: commits/rollbacks per minute）
- 行 5: 缓存命中率（Stat: 如有 Redis 可预留）
- 行 6: 表大小 Top 10（Table: pg_relation_size）
- 刷新频率: 30s

**④ 业务指标仪表盘 (business-metrics.json)**
- 行 1: 今日活跃用户数（Stat: 从 /api/dashboard 聚合）
- 行 2: 告警处理效率（Gauge: 平均处理时长）
- 行 3: 隐患/事故/培训各模块数据量（Pie Chart 或 Stat 组）
- 行 4: AI 功能调用次数（Time Series: report/rca 分开统计）
- 行 5: WebSocket 实时连接数趋势（Time Series: active_websocket_count）
- 刷新频率: 60s

> 注意：业务指标可能需要额外的 exporter 或自定义 metrics，先预留面板位置，标注"待接入"。

#### 1.4 编写 prometheus.yml 抓取配置

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    monitor: 'hse-safety-system'
    environment: 'production'

scrape_configs:
  # HSE 后端主服务
  - job_name: 'hse-backend'
    static_configs:
      - targets: ['hse-backend:3000']
    metrics_path: '/metrics'
    scrape_interval: 15s
    scrape_timeout: 10s
    
  # Nginx stub_status（需在 nginx.conf 中启用）
  - job_name: 'hse-nginx'
    static_configs:
      - targets: ['hse-frontend:80']
    metrics_path: /nginx_status
    scrape_interval: 30s
    
  # Prometheus 自身监控
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

# 告警规则文件引用
rule_files:
  - '/etc/prometheus/rules/*.yml'
```

---

### 第二部分：AlertManager 告警系统（优先级 P0）

#### 2.1 编写 alertmanager.yml

支持多渠道通知：
- **邮件通知**: SMTP 配置（需要 .env 中的 SMTP_* 变量）
- **钉钉机器人**: Webhook URL（.env 中的 DINGTALK_WEBHOOK）
- **企业微信机器人**: Webhook URL（.env 中的 WECOM_WEBHOOK）
- **默认接收组**: ops-team（运维团队）

路由规则：
- critical → 钉钉 + 企业微信 + 邮件（立即发送）
- warning → 仅企业微信（聚合 5 分钟后发送）
- info → 不发送（仅记录）

#### 2.2 编写告警规则 rules.yml

创建至少以下告警规则：

**服务可用性告警**
```yaml
# 实例宕机
- alert: InstanceDown
  expr: up == 0
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: "实例 {{ $labels.instance }} 宕机"
    description: "实例 {{ $labels.job }}/{{ $labels.instance }} 已超过 1 分钟无法访问"
    
# 健康检查失败
- alert: HealthCheckFailed
  expr: hse_health_status != 1
  for: 2m
  labels:
    severity: critical
  annotations:
    summary: "HSE 系统健康检查失败"
    description: "系统健康检查返回异常状态"
```

**API 性能告警**
```yaml
# 高错误率 (>5%)
- alert: HighErrorRate
  expr: |
    (
      sum(rate(http_requests_total{status_code=~"5.."}[5m])) 
      / sum(rate(http_requests_total[5m]))
    ) > 0.05
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "API 错误率过高 ({{ $value | humanizePercentage }})"
    description: "过去 5 分钟内 5xx 错误率超过 5%"
    
# P99 延迟过高 (>2s)
- alert: HighLatencyP99
  expr: |
    histogram_quantile(0.99, 
      sum(rate(http_request_duration_bucket[5m])) by (le)
    ) > 2
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "API P99 延迟过高 ({{ $value }}s)"
    description: "过去 5 分钟 API P99 延迟超过 2 秒"
```

**资源使用告警**
```yaml
# Node.js 内存使用 >80%
- alert: HighMemoryUsage
  expr: |
    nodejs_heap_used_bytes / nodejs_heap_total_bytes > 0.8
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "Node.js 堆内存使用率过高 ({{ $value | humanizePercentage }})"
    
# 数据库连接数接近上限
- alert: HighDBConnections
  expr: pg_stat_activity_count > 80
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "PostgreSQL 连接数过多 ({{ $value }}/100)"
```

**业务告警**
```yaml
# AI 服务不可用
- alert: AIServiceDown
  expr: ai_provider_status == 0
  for: 3m
  labels:
    severity: warning
  annotations:
    summary: "AI 服务不可用"
    description: "AI Provider 连接检测失败，请检查 API Key 和网络"

# WebSocket 连接异常下降
- alert: WebSocketConnectionDrop
  expr: |
    delta(active_websocket_count[10m]) < -50
  for: 5m
  labels:
    severity: info
  annotations:
    summary: "WebSocket 连接数骤降"
    description: "过去 10 分钟 WebSocket 连接减少 {{ $value }} 个"
```

---

### 第三部分：Loki 日志聚合（优先级 P1）

#### 3.1 编写 loki-config.yml

配置 Loki 收集 Docker 容器日志：
- 数据源: Docker json-file driver 日志
- 保留期: 7 天
- 存储路径: ./loki/data
- 资源限制: CPU 0.5 核, 内存 256MB

#### 3.2 配置 Promtail 日志采集

创建 promtail-config.yaml：
- 采集目标: /var/lib/docker/containers/*/*.log
- 标签提取: container_name、image、stream（stdout/stderr）
- 日志管道:
  1. JSON 解析（Docker 日志格式）
  2. 时间戳对齐
  3. 日志级别提取（ERROR/WARN/INFO）
  4. 去除 ANSI 颜色码

#### 3.3 在 Grafana 中添加 Loki 数据源

更新 datasource.yml，添加：
```yaml
# Loki 日志数据源
- name: Loki
  type: loki
  access: proxy
  url: http://loki:3100
  jsonData:
    maxLines: 1000
    deduplication: true
```

#### 3.4 创建日志探索仪表盘

在 monitoring/grafana/dashboards/ 新增 logs-explorer.json：
- Log Search 面板（支持全文搜索）
- 按服务筛选（Frontend/Backend/DB）
- 按级别筛选（Error/Warning/Info）
- 时间线视图
- 错误日志实时流

---

### 第四部分：集成到现有部署体系（优先级 P0）

#### 4.1 更新 deploy/deploy.sh

添加监控服务的启动选项：
```bash
./deploy/deploy.sh --with-monitoring   # 启动主服务 + 监控服务
./deploy/deploy.sh --monitoring-only   # 仅启动监控服务
./deploy/deploy.sh --stop-monitoring   # 停止监控服务
```

#### 4.2 更新 scripts/health-check.sh

增加监控服务健康检查：
- Prometheus 可达性（curl localhost:9090/-/healthy）
- Grafana 可达性（curl localhost:3001/api/health）
- AlertManager 可达性（curl localhost:9093/-/healthy）

#### 4.3 创建快速启动脚本 monitoring/start.sh

一键启动所有监控组件：
```bash
#!/bin/bash
# 用法: ./monitoring/start.sh [start|stop|restart|status]

# 1. 检查依赖（docker + docker compose）
# 2. 加载环境变量（.env.production）
# 3. 启动 docker-compose.monitoring.yml
# 4. 等待所有服务健康
# 5. 显示访问地址
#    - Grafana: http://服务器IP:3001 (admin/admin)
#    - Prometheus: http://服务器IP:9090
#    - AlertManager: http://服务器IP:9093
```

#### 4.4 编写使用文档 monitoring/README.md

内容包括：
- 架构图（Mermaid）
- 快速启动指南
- 各组件访问地址和默认账号
- 仪表盘说明
- 告警配置指南
- 常见问题排查
- 性能调优建议

---

## 输出要求

### 文件清单（必须生成）

| 文件 | 说明 | 大小估算 |
|------|------|---------|
| `monitoring/docker-compose.monitoring.yml` | 监控服务编排 | ~120 行 |
| `monitoring/prometheus/prometheus.yml` | 抓取配置 | ~50 行 |
| `monitoring/prometheus/rules.yml` | 告警规则 | ~150 行 |
| `monitoring/alertmanager/alertmanager.yml` | 告警通知配置 | ~80 行 |
| `monitoring/loki/loki-config.yml` | 日志引擎配置 | ~40 行 |
| `monitoring/loki/promtail-config.yaml` | 日志采集配置 | ~60 行 |
| `monitoring/grafana/provisioning/datasources/datasource.yml` | 数据源配置 | ~40 行 |
| `monitoring/grafana/provisioning/dashboards/dashboard.yml` | 仪表盘提供者 | ~20 行 |
| `monitoring/grafana/provisioning/dashboards/HSE-Operations.json` | 总览仪表盘 | ~800 行 |
| `monitoring/grafana/dashboards/overview.json` | 系统概览 | ~400 行 |
| `monitoring/grafana/dashboards/api-performance.json` | API 性能 | ~500 行 |
| `monitoring/grafana/dashboards/database.json` | 数据库监控 | ~450 行 |
| `monitoring/grafana/dashboards/business-metrics.json` | 业务指标 | ~350 行 |
| `monitoring/grafana/dashboards/logs-explorer.json` | 日志探索 | ~300 行 |
| `monitoring/grafana/grafana.ini` | Grafana 主配置 | ~30 行 |
| `monitoring/start.sh` | 一键启动脚本 | ~80 行 |
| `monitoring/README.md` | 使用文档 | ~300 行 |

### 代码质量要求

1. **YAML 配置**: 必须有详细中文注释，关键参数解释用途
2. **JSON 仪表盘**: 使用 Grafana Dashboard JSON Model v9.x 格式，包含：
   - title / uid / schemaVersion 元信息
   - panels 数组（每个 panel 含 id/title/type/targets/fieldConfig）
   - templating 变量（如 data_source / instance）
   - time/from/to 配置
   - refresh 间隔
3. **Shell 脚本**:
   - set -euo pipefail 错误处理
   - 彩色输出（echo -e）
   - 进度指示器
   - 参数校验和帮助信息
4. **README.md**:
   - Mermaid 架构图
   - 复制粘贴即可执行的命令示例
   - 故障排查 FAQ 至少 5 条

### 测试验证命令

完成后提供验证步骤：

```bash
# 1. 验证 YAML 语法
cd monitoring && docker compose -f docker-compose.monitoring.yml config

# 2. 启动服务
./start.sh start

# 3. 验证各组件
curl -s http://localhost:9090/api/v1/status/config | jq .
curl -s http://localhost:3001/api/health
curl -s http://localhost:9093/-/healthy

# 4. 验证指标抓取
curl -s http://localhost:9090/api/v1/targets | '.data.activeTargets[] | {job, health}'

# 5. 访问 Grafana
# 打开浏览器: http://localhost:3001
# 用户名: admin / 密码: admin

# 6. 测试告警（可选）
curl -X POST http://localhost:9093/api/v1/silences \
  -d '{"matchers":[{"name":"alertname","value":"InstanceDown","isRegex":false}], "startsAt":"..."}'

# 7. 停止服务
./start.sh stop
```

---

## 重要注意事项

⚠️ **不要修改已有的业务代码**（server/ 目录下的 app.js、routes/ 等），只新增 monitoring/ 目录和相关配置

⚠️ **端口冲突规避**：Grafana 用 3001（避开后端 3000），Prometheus 9090，AlertManager 9093，Loki 3100

⚠️ **网络集成**：所有监控服务必须加入已有的 hse-network 才能通过服务名访问 hse-backend/hse-db

⚠️ **资源控制**：监控服务本身资源占用不应超过 1CPU + 1.5GB 内存

⚠️ **安全性**：Grafana/Prometheus/AlertManager 默认仅绑定 127.0.0.1（或通过 Nginx 反代暴露），不直接暴露公网

⚠️ **国内镜像加速**：如果 Docker Hub 拉取慢，提供阿里云/腾讯云镜像加速方案注释

---

## 参考文件

- 现有部署配置：`deploy/docker-compose.production.yml`
- Prometheus 指标实现：`server/metrics.js`
- 健康检查脚本：`scripts/health-check.sh`
- Nginx 配置：`deploy/nginx.conf`
- 环境变量模板：`deploy/.env.production.template`

---

**请开始执行第一部分（Grafana 可视化），完成后继续第二部分（告警）、第三部分（日志）、第四部分（集成）。每个部分完成后简要总结产出物。**
```

---

## 📋 快速参考

### 最终交付效果

| 地址 | 内容 |
|------|------|
| `http://IP:3001` | Grafana 监控大屏（4 套仪表盘） |
| `http://IP:9090` | Prometheus 指标查询界面 |
| `http://IP:9093` | AlertManager 告警管理 |
| `http://IP:3100` | Loki 日志查询（Grafana 内嵌 Explore） |

### 执行策略

| 步骤 | 内容 | 建议 |
|------|------|------|
| 第 1 次 | Part 1: Grafana 仪表盘（4 个 JSON + 配置） | 重点做 overview + api-performance |
| 第 2 次 | Part 2: AlertManager 告警（规则 + 通知） | 规则要贴合实际业务场景 |
| 第 3 次 | Part 3+4: Loki 日志 + 集成脚本 | 可以简化 Loki 部分 |

### 为什么选择这个方向？

1. **自然延伸** — 你的 `/metrics` 端点已经 ready，Prometheus + Grafana 是标准搭配
2. **立竿见影** — 部署后立刻能看到漂亮的实时监控大屏
3. **运维必备** — 从"盲跑"升级到"可视可管"，出问题秒级感知
4. **老板友好** — Grafana 仪表盘适合给领导展示系统运行状态

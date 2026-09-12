# 宁津环卫 HSE 安全管理系统 v4.1 - k6 性能测试

## 目录结构

```
performance/k6/
  config/
    environments.js    # 环境配置 (local/staging/prod)
    thresholds.js      # 三级性能阈值 (P0/P1/P2)
    scenarios.js       # 测试场景 (负载/压力/浸泡/峰值)
  helpers/
    auth.js             # JWT 认证与 Token 池管理
    crud.js             # 通用 RESTful CRUD 封装
    reporting.js        # 自定义报告与摘要输出
    data-factory.js     # 测试数据工厂
  smoke/
    smoke-test.js      # 冒烟测试
  README.md            # 本文件
```

---

## 安装 k6

### Windows

```powershell
# 方式 1: 使用 Chocolatey
choco install k6

# 方式 2: 使用 Scoop
scoop bucket add grafana https://github.com/grafana/scoop-bucket.git
scoop install k6

# 方式 3: 下载二进制
# 访问 https://github.com/grafana/k6/releases 下载最新版 k6.exe
```

### macOS

```bash
# 方式 1: 使用 Homebrew
brew install k6

# 方式 2: 使用 MacPorts
sudo port install k6
```

### Linux

```bash
# Ubuntu/Debian
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E341D1
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt update && sudo apt install k6

# RHEL/CentOS
sudo rpm --import https://dl.k6.io/rpm.key
sudo yum install -y https://dl.k6.io/rpm/k6-latest-repo.noarch.rpm
sudo yum install k6
```

### 验证安装

```bash
k6 version
```

---

## 环境变量配置

### 核心变量

| 变量名            | 说明                         | 默认值  | 示例                    |
|-------------------|------------------------------|---------|-------------------------|
| `ENV`             | 环境选择                     | `local` | `local/staging/prod`    |
| `THRESHOLD_LEVEL` | 性能阈值级别                 | `P1`    | `P0/P1/P2`              |
| `SCENARIO`        | 测试场景                     | -       | `loadTest/stressTest`等 |
| `BASE_URL`        | 覆盖 baseUrl                 | -       | `http://10.0.0.1:3000`  |
| `VUS`             | 覆盖 VU 数量                 | -       | `50`                    |
| `DURATION`        | 覆盖测试时长                 | -       | `5m`                    |

### 非本地环境额外变量

| 变量名              | 说明                 |
|---------------------|----------------------|
| `STG_ADMIN_USER`    | Staging 管理员用户名 |
| `STG_ADMIN_PASS`    | Staging 管理员密码   |
| `PROD_ADMIN_USER`   | 生产管理员用户名     |
| `PROD_ADMIN_PASS`   | 生产管理员密码       |

---

## 运行测试

### 冒烟测试 (推荐首先运行)

```bash
# 本地环境
k6 run -e ENV=local smoke/smoke-test.js

# Staging 环境
k6 run -e ENV=staging smoke/smoke-test.js

# 生产环境（谨慎）
k6 run -e ENV=prod smoke/smoke-test.js
```

### 负载测试 (Load Test)

```bash
# 使用默认 P1 阈值
k6 run -e ENV=local -e SCENARIO=loadTest --execution-segment-override '{"scenarios":{"loadTest":{"startVUs":0,"stages":[{"duration":"30s","target":10},{"duration":"1m","target":50},{"duration":"30s","target":100},{"duration":"30s","target":50},{"duration":"30s","target":0}]},"gracefulRampDown":"10s","tags":{"scenario":"loadTest"}}}' your-test.js

# 简化方式：直接在脚本中引用场景
k6 run -e ENV=local your-load-test.js
```

### 压力测试 (Stress Test)

```bash
k6 run -e ENV=local -e THRESHOLD_LEVEL=P2 your-stress-test.js
```

### 浸泡测试 (Soak Test)

```bash
k6 run -e ENV=local -e THRESHOLD_LEVEL=P2 your-soak-test.js
```

### 峰值测试 (Spike Test)

```bash
k6 run -e ENV=local -e THRESHOLD_LEVEL=P2 your-spike-test.js
```

### 输出结果到文件

```bash
# JSON 格式（用于后续分析）
k6 run -e ENV=local --out json=results.json smoke/smoke-test.js

# 同时输出到 InfluxDB
k6 run -e ENV=local --out influxdb=http://localhost:8086/k6 smoke/smoke-test.js

# HTML 报告（使用 k6-reporter）
k6 run -e ENV=local --out json=results.json smoke/smoke-test.js
npx k6-reporter results.json
```

---

## 在自定义测试中使用 Helper

### 基本示例

```javascript
import http from 'k6/http';
import { getEnvConfig } from './config/environments.js';
import { getThresholds } from './config/thresholds.js';
import { getScenario } from './config/scenarios.js';
import { login, getAuthHeaders, getValidToken } from './helpers/auth.js';
import { createRecord, getRecords, getRecordById } from './helpers/crud.js';
import { randomHazard, randomSearchQuery } from './helpers/data-factory.js';
import { handleSummary } from './helpers/reporting.js';

export const options = {
  scenarios: getScenario('loadTest').loadTest,
  thresholds: getThresholds('P1'),
};

export function setup() {
  const config = getEnvConfig();
  login(config);
  return { config };
}

export default function (data) {
  // 创建隐患
  const hazard = randomHazard();
  const res = createRecord('/api/hazards', hazard);
  // ...
}

export { handleSummary };
```

---

## 结果解读

### 关键指标

| 指标              | 含义                                         |
|-------------------|----------------------------------------------|
| `http_req_duration` | 请求总耗时（含 DNS、TCP、TLS、发送、等待、接收） |
| `http_req_waiting`  | 服务端处理时间（从请求发送到收到首字节）       |
| `http_req_failed`   | 失败请求比率（4xx/5xx 视配置而定）             |
| `checks`            | 自定义检查点的通过率                           |
| `iterations`        | VU 完成的迭代次数                             |
| `vus`               | 活跃的虚拟用户数                              |

### 阈值级别说明

| 级别 | 适用场景       | P95    | P99    | 错误率 |
|------|---------------|--------|--------|--------|
| P0   | 核心接口       | <500ms | <1000ms | <1%   |
| P1   | 常规业务       | <1000ms| <2000ms | <2%   |
| P2   | 压力/浸泡测试  | <2000ms| <5000ms | <5%   |

### 输出文件

| 文件                    | 说明                       |
|-------------------------|----------------------------|
| `stdout`                | 控制台摘要报告             |
| `performance-summary.json` | JSON 格式详细报告       |

---

## 注意事项

1. **后端必须运行**：运行 k6 测试前，确保后端服务 (Node.js + Express + PostgreSQL) 已启动且可访问。冒烟测试默认连接 `http://localhost:3000`。

2. **测试数据清理**：所有通过 k6 创建的数据均以 `[PERF-TEST]` 前缀标记，测试完成后可通过以下 SQL 清理：
   ```sql
   DELETE FROM hazards WHERE title LIKE '[PERF-TEST]%';
   DELETE FROM accidents WHERE title LIKE '[PERF-TEST]%';
   DELETE FROM personnel WHERE name LIKE '[PERF-TEST]%';
   ```

3. **限流注意**：系统有全局限流（500 请求/15分钟），高并发测试时可能触发 429 响应。压力测试建议使用 staging 环境。

4. **WebSocket 测试**：当前 helper 主要覆盖 HTTP API。WebSocket (/ws) 的压测需要使用 k6 的 WebSocket API 单独编写。

5. **内存缓存影响**：系统使用 LRU+TTL 内存缓存，首次请求可能较慢。建议在正式测试前先跑一次预热。

6. **生产环境**：对生产环境执行压力测试前，务必在业务低峰期进行，并提前通知相关人员。

7. **k6 ES2020**：本项目的 k6 脚本使用 ES2020 语法（import/export），需 k6 v0.40.0+。

---

## 常见问题

### Q: 登录失败怎么办？
检查后端是否运行，端口是否正确。可在脚本中手动 `curl http://localhost:3000/api/auth/login` 验证。

### Q: 大量 429 错误？
说明触发了限流。降低 VU 数量或缩短测试时间，或使用 staging 环境（通常限流更宽松）。

### Q: 如何调试单个请求？
使用 `--http-debug` 参数查看详细请求/响应：
```bash
k6 run --http-debug smoke/smoke-test.js
```

### Q: Token 过期导致测试失败？
auth.js 已内置 token 自动刷新逻辑。如果持续出现 401 错误，检查 refresh token 接口是否正常。

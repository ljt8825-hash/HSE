# TRAE Work CN Code 模式 — 安全加固与审计

> 适用项目：宁津环卫 HSE 安全管理系统 v4.1
> 目标：全链路安全扫描、漏洞修复、OWASP Top 10 合规、生产级安全加固
> 预计产出：扫描报告 + 修复补丁 + 安全配置 + 审计文档

---

```
你是一位应用安全工程师，要为【宁津环卫 HSE 安全管理系统 v4.1】执行完整的安全加固与审计。

## 项目背景

### 技术栈
- **前端**: Vue 3 + TypeScript + Ant Design Vue + vue-vben-admin v5.7.0 + Vite 8
- **后端**: Node.js 22 + Express + PostgreSQL 17（scram-sha-256）+ JWT
- **认证**: JWT（access 30min + refresh 7d）+ Token 黑名单
- **实时通信**: WebSocket（ws + JWT 认证 + 30s 心跳）
- **缓存**: 内存 LRU（TTL + 命名空间）
- **限流**: express-rate-limit（全局 500 / BI 1000 / IoT 2000 每 15 分钟）
- **文件上传**: multer
- **容器化**: Docker + Docker Compose

### 已有的安全基础设施
- ✅ JWT 认证 + Token 黑名单机制
- ✅ express-rate-limit 分级限流
- ✅ PostgreSQL scram-sha-256 密码加密
- ✅ Nginx 安全头（X-Frame-Options / X-Content-Type-Options 等）
- ✅ CORS 白名单配置
- ✅ 输入校验（Zod schema）
- ✅ 审计日志路由（/api/audit）
- ✅ 登录失败锁定机制
- ✅ deploy/security-checklist.md 安全检查清单

### 系统 API 清单（26 个路由模块）

| 路由 | 挂载路径 | 安全关注点 |
|------|---------|-----------|
| auth | /api/auth | 登录爆破 / Token 安全 / 密码策略 |
| users | /api/users | 越权 / 敏感字段泄露 |
| roles | /api/roles | 权限提升 |
| menus | /api/menus | 越权访问菜单 |
| dashboard | /api/dashboard | 数据越权 |
| alerts | /api/alerts | 越权操作他人告警 |
| hazards | /api/hazards | SQL 注入 / XSS / 越权 |
| accidents | /api/accidents | SQL 注入 / XSS / 越权 |
| training | /api/training | 越权 |
| vehicles | /api/vehicles | 越权 |
| personnel | /api/personnel | 敏感数据泄露（身份证/电话） |
| insurance | /api/insurance | 敏感数据泄露（保险信息） |
| site-mgmt | /api/site-mgmt | 越权 |
| emergency | /api/emergency | 越权 |
| risk-control | /api/risk-control | 越权 |
| regulations | /api/regulations | 越权 |
| objectives | /api/objectives | 越权 |
| notifications | /api/notifications | 越权查看他人通知 |
| workflow | /api/workflow | 工作流绕过 |
| audit | /api/audit | 审计日志篡改 |
| file-records | /api/file-records | 文件信息泄露 |
| files | /api/files | 文件上传漏洞 / 路径穿越 |
| import | /api/import | 文件上传 / 注入 |
| bi | /api/hse/bi | 数据泄露 |
| ai | /api/hse/ai | Prompt 注入 / API Key 泄露 |
| iot | /api/hse/iot | 设备控制越权 |

---

## 你的任务：分 6 个阶段完成安全加固与审计

### 第一阶段：依赖漏洞扫描（优先级 P0）

#### 1.1 创建 `security/` 目录结构

```
security/
├── scans/
│   ├── npm-audit/
│   │   ├── frontend-audit.json        # 前端 npm audit 结果
│   │   ├── backend-audit.json          # 后端 npm audit 结果
│   │   └── audit-report.md             # 漏洞汇总报告
│   ├── snyk/
│   │   ├── snyk-frontend.json          # Snyk 前端扫描结果
│   │   ├── snyk-backend.json           # Snyk 后端扫描结果
│   │   └── snyk-report.md              # Snyk 汇总报告
│   ├── trivy/
│   │   ├── frontend-image-scan.json    # 前端 Docker 镜像扫描
│   │   ├── backend-image-scan.json     # 后端 Docker 镜像扫描
│   │   ├── db-image-scan.json          # PostgreSQL 镜像扫描
│   │   └── trivy-report.md             # 镜像漏洞汇总
│   └── summary/
│       └── vulnerability-summary.md    # 全部漏洞汇总（按严重程度排序）
├── owasp/
│   ├── owasp-top10-checklist.md        # OWASP Top 10 逐项检查清单
│   ├── A01-broken-access-control.md    # 失效的访问控制
│   ├── A02-cryptographic-failures.md    # 加密失败
│   ├── A03-injection.md                # 注入
│   ├── A04-insecure-design.md          # 不安全设计
│   ├── A05-security-misconfiguration.md # 安全配置错误
│   ├── A06-vulnerable-components.md     # 易受攻击的组件
│   ├── A07-auth-failures.md             # 认证和会话失败
│   ├── A08-software-data-integrity.md   # 软件和数据完整性失败
│   ├── A09-logging-monitoring-failures.md # 日志和监控失败
│   └── A10-ssrf.md                      # SSRF
├── audits/
│   ├── code-security-audit.md          # 代码安全审计报告
│   ├── sql-injection-audit.md          # SQL 注入专项审计
│   ├── xss-audit.md                    # XSS 专项审计
│   ├── auth-security-audit.md         # 认证安全审计
│   ├── api-security-audit.md          # API 安全审计
│   └── secret-detection.md             # 硬编码密钥检测
├── fixes/
│   ├── README.md                       # 修复清单和说明
│   └── patches/                        # 修复补丁文件
├── hardening/
│   ├── nginx-hardening.conf            # Nginx 安全加固配置
│   ├── docker-hardening.md             # Docker 安全加固指南
│   ├── nodejs-hardening.md             # Node.js 安全加固指南
│   ├── postgresql-hardening.md         # PostgreSQL 安全加固指南
│   └── env-security.md                 # 环境变量安全检查
├── scripts/
│   ├── run-all-scans.sh                # 一键执行全部扫描
│   ├── npm-audit.sh                    # npm audit 扫描
│   ├── snyk-scan.sh                    # Snyk 扫描
│   ├── trivy-scan.sh                   # Trivy 镜像扫描
│   ├── secret-scan.sh                  # 硬编码密钥扫描
│   └── fix-vulnerabilities.sh          # 自动修复脚本
└── README.md                           # 安全审计总览文档
```

#### 1.2 编写扫描脚本

**`scripts/npm-audit.sh`**
```bash
#!/bin/bash
set -euo pipefail

# 前端审计
echo "=== 前端依赖审计 ==="
cd 安全看板vben
pnpm audit --prod --json > ../security/scans/npm-audit/frontend-audit.json 2>&1 || true
pnpm audit --prod --audit-level=high || true

# 后端审计
echo "=== 后端依赖审计 ==="
cd ../server
npm audit --json > ../security/scans/npm-audit/backend-audit.json 2>&1 || true
npm audit --audit-level=high || true

# 生成汇总
echo "=== 审计完成 ==="
echo "前端报告: security/scans/npm-audit/frontend-audit.json"
echo "后端报告: security/scans/npm-audit/backend-audit.json"
```

**`scripts/snyk-scan.sh`**
```bash
#!/bin/bash
set -euo pipefail
# 需要 SNYK_TOKEN 环境变量

echo "=== Snyk 前端扫描 ==="
cd 安全看板vben
snyk test --json --file=package.json > ../security/scans/snyk/snyk-frontend.json 2>&1 || true

echo "=== Snyk 后端扫描 ==="
cd ../server
snyk test --json --file=package.json > ../security/scans/snyk/snyk-backend.json 2>&1 || true

echo "=== Snyk IaC 扫描（Docker 配置）==="
snyk iac test ../deploy/docker-compose.production.yml --json > ../security/scans/snyk/snyk-iac.json 2>&1 || true
```

**`scripts/trivy-scan.sh`**
```bash
#!/bin/bash
set -euo pipefail

# 扫描 Docker 镜像（需要先 build）
echo "=== 扫描前端镜像 ==="
trivy image --format json --output security/scans/trivy/frontend-image-scan.json \
  hse-frontend:latest || true

echo "=== 扫描后端镜像 ==="
trivy image --format json --output security/scans/trivy/backend-image-scan.json \
  hse-backend:latest || true

echo "=== 扫描 PostgreSQL 镜像 ==="
trivy image --format json --output security/scans/trivy/db-image-scan.json \
  postgres:17-alpine || true

echo "=== 扫描文件系统 ==="
trivy fs --format json --output security/scans/trivy/fs-scan.json . || true
```

**`scripts/secret-scan.sh`**
```bash
#!/bin/bash
set -euo pipefail

# 使用 trivy 或 grep 扫描硬编码密钥
echo "=== 硬编码密钥扫描 ==="

# 扫描模式
PATTERNS=(
  "api_key|apikey|api-key"
  "secret"
  "password|passwd|pwd"
  "token"
  "jwt_secret"
  "private_key"
  "BEGIN RSA PRIVATE KEY"
  "BEGIN PRIVATE KEY"
  "AKIA[0-9A-Z]{16}"           # AWS Access Key
  "ghp_[a-zA-Z0-9]{36}"        # GitHub PAT
  "sk-[a-zA-Z0-9]{48}"         # OpenAI API Key
  "xoxb-[0-9a-zA-Z-]+"         # Slack Token
)

# 扫描（排除 node_modules / .git / dist）
find . -type f \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  -not -path "*/dist/*" \
  -not -path "*/coverage/*" \
  -not -name "*.lock" \
  -not -name "package-lock.json" \
  -not -name "pnpm-lock.yaml" \
  | xargs grep -ilE "$(IFS='|'; echo "${PATTERNS[*]}")" 2>/dev/null \
  | grep -v ".env.example" \
  | grep -v ".env.template" \
  | grep -v ".env.production.template" \
  > security/scans/secret-scan-results.txt || true

echo "扫描完成，结果: security/scans/secret-scan-results.txt"
```

**`scripts/run-all-scans.sh`**
```bash
#!/bin/bash
set -euo pipefail

echo "╔══════════════════════════════════════════╗"
echo "║   HSE 安全管理系统 — 安全扫描套件       ║"
echo "╚══════════════════════════════════════════╝"

bash security/scripts/npm-audit.sh
bash security/scripts/snyk-scan.sh || echo "⚠️ Snyk 扫描跳过（需 SNYK_TOKEN）"
bash security/scripts/trivy-scan.sh || echo "⚠️ Trivy 扫描跳过（需安装 Trivy）"
bash security/scripts/secret-scan.sh

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   扫描完成！请查看 security/scans/ 目录  ║"
echo "╚══════════════════════════════════════════╝"
```

#### 1.3 创建漏洞汇总报告模板

**`scans/summary/vulnerability-summary.md`**
```markdown
# 漏洞汇总报告

> 扫描日期: YYYY-MM-DD
> 扫描工具: npm audit + Snyk + Trivy

## 漏洞统计

| 严重程度 | 前端 | 后端 | Docker 镜像 | 合计 |
|---------|------|------|------------|------|
| Critical | | | | |
| High | | | | |
| Medium | | | | |
| Low | | | | |
| **合计** | | | | |

## Critical 级别漏洞

| # | 漏洞名称 | 影响包 | 位置 | CVE | 修复方案 |
|---|---------|--------|------|-----|---------|
| 1 | | | | | |

## High 级别漏洞
（同上格式）

## 修复优先级
1. [P0] Critical — 必须立即修复
2. [P0] High — 上线前必须修复
3. [P1] Medium — 评估后修复
4. [P2] Low — 可延后修复
```

---

### 第二阶段：OWASP Top 10 合规审计（优先级 P0）

逐项检查 OWASP Top 10（2021 版）每个风险类别：

#### 2.1 A01 — 失效的访问控制（Broken Access Control）

**检查清单**:

| # | 检查项 | 检查方法 | 风险等级 |
|---|--------|---------|---------|
| 1 | 水平越权：用户 A 能否访问用户 B 的数据？ | 尝试用 A 的 Token 请求 /api/hazards?userId=B | 高 |
| 2 | 垂直越权：普通用户能否调用管理员接口？ | 用普通用户 Token 调用 /api/users DELETE | 高 |
| 3 | IDOR：能否通过修改 URL 参数访问他人数据？ | /api/hazards/1 → /api/hazards/2（他人隐患） | 高 |
| 4 | API 接口是否统一经过 auth 中间件？ | 检查 server/app.js 路由注册 | 高 |
| 5 | 角色/权限检查是否在路由级别执行？ | 检查每个路由的 requireRole() | 中 |
| 6 | WebSocket 连接是否验证 JWT？ | 检查 ws 连接握手 | 高 |
| 7 | 文件上传是否校验权限？ | 检查 /api/files 路由 | 中 |
| 8 | 删除操作是否校验数据所有权？ | 尝试删除他人创建的记录 | 高 |

**输出**: `owasp/A01-broken-access-control.md`

#### 2.2 A02 — 加密失败（Cryptographic Failures）

| # | 检查项 | 检查方法 | 风险等级 |
|---|--------|---------|---------|
| 1 | HTTPS 是否强制？ | 检查 Nginx 是否 80→443 重定向 | 高 |
| 2 | JWT Secret 强度是否足够（≥256 bits）？ | 检查 .env 中 JWT_SECRET | 高 |
| 3 | 密码是否加盐哈希存储？ | 检查 PostgreSQL users 表 password 字段 | 高 |
| 4 | 敏感数据（身份证/电话）是否加密存储？ | 检查 personnel 表 | 高 |
| 5 | API 响应中是否泄露敏感字段？ | 检查 /api/personnel 响应 | 高 |
| 6 | Refresh Token 是否加密存储？ | 检查前端 localStorage | 中 |
| 7 | 数据库连接是否使用 SSL？ | 检查 db.js 连接字符串 | 中 |
| 8 | 日志中是否打印敏感信息？ | 检查 console.log / query 日志 | 中 |

**输出**: `owasp/A02-cryptographic-failures.md`

#### 2.3 A03 — 注入（Injection）

| # | 检查项 | 检查方法 | 风险等级 |
|---|--------|---------|---------|
| 1 | SQL 注入：是否全部使用参数化查询？ | `grep -rn "query.*\$\{" server/` 查找字符串拼接 | 高 |
| 2 | SQL 注入：是否有原始 SQL 拼接？ | `grep -rn "query.*\+.*\|query.*concat" server/` | 高 |
| 3 | NoSQL 注入：是否校验 $where / $expr？ | 检查是否有 MongoDB（本项目无） | N/A |
| 4 | 命令注入：是否使用 child_process？ | `grep -rn "exec\|spawn" server/` | 高 |
| 5 | LDAP 注入 | N/A（本项目无 LDAP） | N/A |
| 6 | 模板注入：是否使用模板引擎拼接用户输入？ | 检查 AI Prompt 构建是否过滤用户输入 | 高 |
| 7 | XSS：用户输入是否在前端渲染前转义？ | 检查 v-html 使用 / DOM 操作 | 高 |
| 8 | 路径穿越：文件上传是否校验路径？ | 检查 /api/files 的 multer 配置 | 高 |

**输出**: `owasp/A03-injection.md`（含 SQL 注入专项 `audits/sql-injection-audit.md` 和 XSS 专项 `audits/xss-audit.md`）

#### 2.4 A04 — 不安全设计（Insecure Design）

| # | 检查项 | 风险等级 |
|---|--------|---------|
| 1 | 密码策略：最小长度 / 复杂度 / 历史密码 | 中 |
| 2 | 账号锁定策略：阈值 / 持续时间 | 中 |
| 3 | 会话管理：超时 / 并发限制 | 中 |
| 4 | 速率限制：关键接口是否限流？ | 高 |
| 5 | 业务逻辑：能否绕过审批流程？ | 高 |
| 6 | 文件上传：类型/大小限制 | 高 |

**输出**: `owasp/A04-insecure-design.md`

#### 2.5 A05 — 安全配置错误（Security Misconfiguration）

| # | 检查项 | 检查方法 | 风险等级 |
|---|--------|---------|---------|
| 1 | 是否关闭默认错误详情？ | 检查 Express 是否暴露 stack trace | 高 |
| 2 | 是否禁用 X-Powered-By 头？ | `app.disable('x-powered-by')` | 中 |
| 3 | CORS 是否限制白名单？ | 检查 app.js CORS 配置 | 高 |
| 4 | Helmet 是否启用？ | 检查是否使用 helmet 中间件 | 中 |
| 5 | .env 文件是否在 .gitignore？ | 检查 .gitignore | 高 |
| 6 | Docker 容器是否非 root 运行？ | 检查 Dockerfile USER 指令 | 中 |
| 7 | 数据库默认端口是否暴露？ | 检查 docker-compose 端口映射 | 中 |
| 8 | 调试模式生产是否关闭？ | NODE_ENV === 'production' | 高 |
| 9 | Nginx 是否隐藏版本号？ | server_tokens off | 中 |
| 10 | 不必要的 HTTP 方法是否禁用？ | TRACE / DELETE / PUT | 中 |

**输出**: `owasp/A05-security-misconfiguration.md`

#### 2.6 A06 — 易受攻击的组件（Vulnerable Components）

已在第一阶段覆盖（npm audit + Snyk + Trivy）。

**输出**: `owasp/A06-vulnerable-components.md`（引用 scans/summary/）

#### 2.7 A07 — 认证和会话失败（Identification and Authentication Failures）

| # | 检查项 | 检查方法 | 风险等级 |
|---|--------|---------|---------|
| 1 | 登录是否防爆破？ | 检查 rate-limit + 账号锁定 | 高 |
| 2 | 密码是否加盐哈希？ | bcrypt / argon2 | 高 |
| 3 | JWT 过期时间是否合理？ | access 30min / refresh 7d | 中 |
| 4 | Refresh Token 是否可撤销？ | Token 黑名单 | 高 |
| 5 | 登出是否使 Token 失效？ | 检查 /api/auth/logout | 高 |
| 6 | 多设备登录是否可控？ | 检查会话管理 | 中 |
| 7 | 密码重置流程是否安全？ | 检查重置 Token 一次性 | 高 |
| 8 | 验证码是否启用？ | 登录失败 N 次后 | 中 |

**输出**: `owasp/A07-auth-failures.md` + `audits/auth-security-audit.md`

#### 2.8 A08 — 软件和数据完整性失败（Software and Data Integrity Failures）

| # | 检查项 | 风险等级 |
|---|--------|---------|
| 1 | CI/CD 是否验证构建产物完整性？ | 中 |
| 2 | npm install 是否使用 lockfile？ | 高 |
| 3 | 是否启用 npm 依赖锁？ | 中 |
| 4 | Docker 镜像是否使用 digest 而非 tag？ | 中 |
| 5 | AI Provider 响应是否校验完整性？ | 中 |

**输出**: `owasp/A08-software-data-integrity.md`

#### 2.9 A09 — 日志和监控失败（Security Logging and Monitoring Failures）

| # | 检查项 | 风险等级 |
|---|--------|---------|
| 1 | 安全事件是否记录？（登录失败/越权/异常） | 高 |
| 2 | 审计日志是否防篡改？ | 高 |
| 3 | 日志是否包含足够信息用于追溯？ | 中 |
| 4 | 是否有异常告警机制？ | 中 |
| 5 | 日志是否脱敏？ | 高 |

**输出**: `owasp/A09-logging-monitoring-failures.md`

#### 2.10 A10 — SSRF（Server-Side Request Forgery）

| # | 检查项 | 风险等级 |
|---|--------|---------|
| 1 | AI 调用外部 API 是否校验 URL？ | 高 |
| 2 | 文件导入是否从外部获取资源？ | 中 |
| 3 | webhook 是否校验目标地址？ | 中 |

**输出**: `owasp/A10-ssrf.md`

---

### 第三阶段：代码安全审计（优先级 P0）

#### 3.1 SQL 注入专项审计

创建 `audits/sql-injection-audit.md`，内容：

1. **自动化扫描**: 使用 grep 查找所有 `query()` / `pool.query()` 调用
2. **逐条审查**: 检查每个查询是否使用参数化（$1, $2...）而非字符串拼接
3. **重点检查**:
   - 动态 ORDER BY / LIMIT 是否拼接用户输入
   - 动态表名 / 列名是否拼接用户输入
   - 搜索功能是否拼接 LIKE 条件
4. **输出**: 风险点清单 + 修复建议

```bash
# 扫描命令
grep -rn "query\|execute" server/ --include="*.js" | grep -v node_modules | grep -v test
grep -rn '\$\{' server/ --include="*.js" | grep -i "query\|sql\|select\|insert\|update\|delete"
```

#### 3.2 XSS 专项审计

创建 `audits/xss-audit.md`，内容：

1. **前端扫描**: 查找 `v-html` 使用
2. **后端扫描**: 检查响应是否包含未转义的用户输入
3. **DOM 操作**: 查找 `innerHTML` / `document.write`
4. **输出**: 风险点清单 + 修复建议

```bash
# 扫描命令
grep -rn "v-html\|innerHTML\|document.write\|dangerouslySetInnerHTML" 安全看板vben/apps/web-antd/src/
```

#### 3.3 认证安全审计

创建 `audits/auth-security-audit.md`，检查：
- JWT 实现是否安全（算法 / 过期 / 黑名单）
- 密码存储是否安全
- 登录流程是否防爆破
- Token 刷新逻辑是否安全
- 会话管理是否安全

#### 3.4 API 安全审计

创建 `audits/api-security-audit.md`，检查 26 个路由模块：
- 每个路由是否经过 auth 中间件
- 每个路由是否有适当的角色检查
- 输入校验是否完整（Zod schema）
- 输出是否泄露敏感字段
- 速率限制是否配置

#### 3.5 硬编码密钥检测

创建 `audits/secret-detection.md`，检查：
- 源代码中是否有硬编码的密码 / Token / API Key
- .env 文件是否在 .gitignore
- .env.example 是否不含真实密钥
- Docker 配置是否泄露密钥
- AI API Key 是否通过环境变量注入

---

### 第四阶段：安全加固配置（优先级 P1）

#### 4.1 Nginx 安全加固

创建 `hardening/nginx-hardening.conf`，包含：

```nginx
# ====== 安全头 ======
# 防止点击劫持
add_header X-Frame-Options "DENY" always;
# 防止 MIME 类型嗅探
add_header X-Content-Type-Options "nosniff" always;
# XSS 保护
add_header X-XSS-Protection "1; mode=block" always;
# 内容安全策略
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' wss: https:; frame-ancestors 'none';" always;
# HSTS（生产环境 HTTPS）
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
# Referrer 策略
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
# 权限策略
add_header Permissions-Policy "geolocation=(self), microphone=(), camera=()" always;

# ====== 隐藏版本号 ======
server_tokens off;

# ====== 禁用不必要的 HTTP 方法 ======
if ($request_method !~ ^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)$ ) {
    return 405;
}

# =====️ 请求体大小限制 ======
client_max_body_size 10m;

# ====== 速率限制 ======
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_req zone=api burst=20 nodelay;

# ====== WebSocket 安全 ======
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_read_timeout 86400;

# ====== 防止目录遍历 ======
location ~ /\. {
    deny all;
    access_log off;
    log_not_found off;
}
```

#### 4.2 Docker 安全加固

创建 `hardening/docker-hardening.md`，包含：

```dockerfile
# 后端镜像安全加固
# 1. 使用非 root 用户运行
RUN groupadd -r appuser && useradd -r -g appuser appuser
USER appuser

# 2. 最小化镜像（使用 alpine / slim）
FROM node:22-slim

# 3. 不复制不必要的文件
# .dockerignore 排除 node_modules / .git / tests / docs

# 4. 健康检查
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# 5. 只读文件系统（可选）
# docker run --read-only ...

# 6. 资源限制
# docker-compose: deploy.resources.limits
```

#### 4.3 Node.js 安全加固

创建 `hardening/nodejs-hardening.md`，建议在 `server/app.js` 中添加：

```js
// 1. 隐藏 Express 版本号
app.disable('x-powered-by')

// 2. 启用 Helmet（如果尚未启用）
const helmet = require('helmet')
app.use(helmet({
  contentSecurityPolicy: false,  // 由 Nginx 处理
  crossOriginEmbedderPolicy: false,
}))

// 3. 请求体大小限制
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ limit: '10mb', extended: true }))

// 4. 信任代理（如果使用 Nginx 反代）
app.set('trust proxy', 1)

// 5. 禁用 ETag（减少信息泄露，可选）
app.set('etag', false)

// 6. 全局错误处理不暴露堆栈
if (process.env.NODE_ENV === 'production') {
  app.use((err, req, res, next) => {
    console.error(err)
    res.status(500).json({ success: false, message: '服务器内部错误' })
  })
}
```

#### 4.4 PostgreSQL 安全加固

创建 `hardening/postgresql-hardening.md`，包含：

```sql
-- 1. 确保 pg_hba.conf 使用 scram-sha-256
-- 2. 禁用默认连接
-- 3. 限制连接 IP

-- 4. 敏感数据列加密（pgcrypto）
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- 身份证号加密存储
-- ALTER TABLE personnel ADD COLUMN id_card_encrypted text;
-- UPDATE personnel SET id_card_encrypted = pgp_sym_encrypt(id_card, 'encryption_key');

-- 5. 审计日志启用
-- log_connections = on
-- log_disconnections = on
-- log_statement = 'ddl'
-- log_min_duration_statement = 500

-- 6. 定期 VACUUM
-- autovacuum = on
```

#### 4.5 环境变量安全检查

创建 `hardening/env-security.md`，包含：

```markdown
# 环境变量安全检查清单

## 必须通过环境变量注入（禁止硬编码）
- [ ] JWT_SECRET（≥ 32 字符随机字符串）
- [ ] DB_PASSWORD
- [ ] GROK_API_KEY
- [ ] OLLAMA_HOST
- [ ] SMTP_PASSWORD（如有邮件）
- [ ] DINGTALK_WEBHOOK（如有钉钉告警）
- [ ] WECOM_WEBHOOK（如有企微告警）

## .gitignore 检查
- [ ] .env 在 .gitignore 中
- [ ] .env.production 在 .gitignore 中
- [ ] .env.local 在 .gitignore 中
- [ ] *.pem 在 .gitignore 中
- [ ] *.key 在 .gitignore 中

## .env.example 检查
- [ ] .env.example 不含真实密钥
- [ ] .env.production.template 不含真实密钥
- [ ] 所有占位符使用 <your_value_here> 格式
```

---

### 第五阶段：修复漏洞（优先级 P0/P1）

#### 5.1 创建 `fixes/README.md`

```markdown
# 漏洞修复清单

## P0 — 必须立即修复
| # | 漏洞 | 影响范围 | 修复方式 | 状态 |
|---|------|---------|---------|------|

## P1 — 上线前修复
| # | 漏洞 | 影响范围 | 修复方式 | 状态 |
|---|------|---------|---------|------|

## P2 — 可延后修复
| # | 漏洞 | 影响范围 | 修复方式 | 状态 |
|---|------|---------|---------|------|
```

#### 5.2 修复补丁

在 `fixes/patches/` 中创建修复补丁文件。每个修复对应一个文件：
- `fix-express-info-leak.patch` — 隐藏 x-powered-by
- `fix-add-helmet.patch` — 添加 Helmet 中间件
- `fix-rate-limit-hardening.patch` — 加强限流
- `fix-input-sanitization.patch` — 输入消毒
- `fix-dependency-upgrade.patch` — 依赖升级

**修复原则**:
- 不破坏现有功能
- 每个修复独立提交，方便回滚
- 修复后重新运行测试确保不回归
- 高风险修复需人工审查

---

### 第六阶段：安全审计报告（优先级 P1）

#### 6.1 创建 `security/README.md`

```markdown
# HSE 安全管理系统 — 安全审计

## 审计概况
- 审计日期: YYYY-MM-DD
- 审计范围: 前端 + 后端 + Docker + 数据库 + CI/CD
- 审计标准: OWASP Top 10 (2021)

## 审计结果汇总

| 类别 | 检查项数 | 通过 | 不通过 | 不适用 | 通过率 |
|------|---------|------|--------|--------|--------|
| A01 访问控制 | 8 | | | | |
| A02 加密失败 | 8 | | | | |
| A03 注入 | 8 | | | | |
| A04 不安全设计 | 6 | | | | |
| A05 配置错误 | 10 | | | | |
| A06 易受攻击组件 | 4 | | | | |
| A07 认证失败 | 8 | | | | |
| A08 完整性失败 | 5 | | | | |
| A09 日志监控 | 5 | | | | |
| A10 SSRF | 3 | | | | |
| **合计** | **65** | | | | |

## 漏洞统计
| 严重程度 | 数量 | 已修复 | 待修复 |
|---------|------|--------|--------|
| Critical | | | |
| High | | | |
| Medium | | | |
| Low | | | |

## 安全评级
- A级: 95%+ 通过，0 Critical/High
- B级: 85%+ 通过，0 Critical
- C级: 75%+ 通过
- D级: < 75%

## 执行命令
## 扫描结果查看
## 修复指南
## 持续安全建议
```

#### 6.2 CI 集成

更新 `.github/workflows/ci-quality-gate.yml`，增强 security-audit job：

```yaml
security-audit:
  name: 安全审计
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: '22' }

    # npm audit
    - name: Frontend npm audit
      working-directory: 安全看板vben
      run: pnpm audit --prod --audit-level=high

    - name: Backend npm audit
      working-directory: server
      run: npm audit --audit-level=high

    # Trivy 文件系统扫描
    - name: Trivy FS scan
      uses: aquasecurity/trivy-action@master
      with:
        scan-type: fs
        scan-ref: .
        severity: CRITICAL,HIGH
        format: json
        output: security/scans/trivy/fs-scan.json

    # 硬编码密钥扫描
    - name: Secret scan
      run: bash security/scripts/secret-scan.sh
```

---

## 输出要求

### 文件清单（必须生成）

| # | 文件路径 | 类型 | 预估行数 |
|---|---------|------|---------|
| 1 | `security/scripts/npm-audit.sh` | Shell | ~30 |
| 2 | `security/scripts/snyk-scan.sh` | Shell | ~20 |
| 3 | `security/scripts/trivy-scan.sh` | Shell | ~25 |
| 4 | `security/scripts/secret-scan.sh` | Shell | ~40 |
| 5 | `security/scripts/run-all-scans.sh` | Shell | ~20 |
| 6 | `security/scans/summary/vulnerability-summary.md` | 报告 | ~80 |
| 7 | `security/owasp/owasp-top10-checklist.md` | 清单 | ~200 |
| 8 | `security/owasp/A01-broken-access-control.md` | 审计 | ~100 |
| 9 | `security/owasp/A02-cryptographic-failures.md` | 审计 | ~80 |
| 10 | `security/owasp/A03-injection.md` | 审计 | ~100 |
| 11 | `security/owasp/A04-insecure-design.md` | 审计 | ~60 |
| 12 | `security/owasp/A05-security-misconfiguration.md` | 审计 | ~100 |
| 13 | `security/owasp/A06-vulnerable-components.md` | 审计 | ~40 |
| 14 | `security/owasp/A07-auth-failures.md` | 审计 | ~100 |
| 15 | `security/owasp/A08-software-data-integrity.md` | 审计 | ~50 |
| 16 | `security/owasp/A09-logging-monitoring-failures.md` | 审计 | ~60 |
| 17 | `security/owasp/A10-ssrf.md` | 审计 | ~40 |
| 18 | `security/audits/sql-injection-audit.md` | 审计 | ~150 |
| 19 | `security/audits/xss-audit.md` | 审计 | ~80 |
| 20 | `security/audits/auth-security-audit.md` | 审计 | ~120 |
| 21 | `security/audits/api-security-audit.md` | 审计 | ~150 |
| 22 | `security/audits/secret-detection.md` | 审计 | ~80 |
| 23 | `security/hardening/nginx-hardening.conf` | 配置 | ~60 |
| 24 | `security/hardening/docker-hardening.md` | 指南 | ~80 |
| 25 | `security/hardening/nodejs-hardening.md` | 指南 | ~80 |
| 26 | `security/hardening/postgresql-hardening.md` | 指南 | ~60 |
| 27 | `security/hardening/env-security.md` | 清单 | ~50 |
| 28 | `security/fixes/README.md` | 清单 | ~60 |
| 29 | `security/README.md` | 文档 | ~150 |
| 30 | `.github/workflows/ci-quality-gate.yml` | 更新 | +20 行 |

**合计: 29 个新文件 + 1 个更新**

### 代码质量要求

1. **Shell 脚本**:
   - `set -euo pipefail` 错误处理
   - 彩色输出
   - 不依赖工具预装（检测是否存在）

2. **OWASP 审计文档**:
   - 每个检查项有：检查方法、预期结果、实际结果、风险等级、修复建议
   - 使用表格格式清晰呈现
   - 引用具体文件路径和行号

3. **加固配置**:
   - 每条配置有中文注释说明安全目的
   - 标注哪些是"必须"、哪些是"推荐"
   - 提供 before/after 对比

4. **修复补丁**:
   - 每个修复独立
   - 不破坏现有功能
   - 附修复说明和影响评估

### 验证命令

```bash
# === 1. 执行全部扫描 ===
bash security/scripts/run-all-scans.sh

# === 2. 查看漏洞汇总 ===
cat security/scans/summary/vulnerability-summary.md

# === 3. OWASP 合规检查 ===
cat security/owasp/owasp-top10-checklist.md

# === 4. SQL 注入扫描 ===
grep -rn "query\|execute" server/ --include="*.js" | grep -v node_modules | grep -v test
grep -rn '\$\{' server/ --include="*.js" | grep -i "query\|sql\|select"

# === 5. XSS 扫描 ===
grep -rn "v-html\|innerHTML\|document.write" 安全看板vben/apps/web-antd/src/

# === 6. 硬编码密钥扫描 ===
bash security/scripts/secret-scan.sh
cat security/scans/secret-scan-results.txt

# === 7. Docker 镜像扫描 ===
trivy image hse-backend:latest
trivy image hse-frontend:latest

# === 8. 应用加固后验证 ===
# 检查安全头
curl -I https://your-domain.com | grep -i "x-frame\|x-content\|strict-transport\|content-security"
# 检查 x-powered-by 是否隐藏
curl -I https://your-domain.com | grep -i "x-powered-by"
```

---

## 重要注意事项

⚠️ **不要修改业务逻辑代码** — 安全加固只涉及配置和中间件层

⚠️ **扫描脚本不自动修复** — 只检测和报告，修复需人工确认

⚠️ **密钥扫描排除 node_modules / .git / dist / lock 文件** — 避免误报

⚠️ **修复补丁必须单独提交** — 每个 commit 对应一个修复，方便回滚

⚠️ **OWASP 检查清单是活的文档** — 每次代码变更后需重新检查

⚠️ **生产环境密钥不进入代码库** — 全部通过 .env 环境变量注入

⚠️ **Docker 镜像扫描需要先 build** — trivy image 需要镜像已存在

⚠️ **npm audit fix 可能引入 breaking change** — 需逐个验证

## 参考文件

- 后端入口: `server/app.js`
- 认证中间件: `server/middleware/auth.js`
- 限流配置: `server/app.js`（搜索 rateLimit）
- 输入校验: `server/schemas/`（Zod schema）
- 文件上传: `server/routes/files.js`
- 数据导入: `server/routes/import.js`
- AI 服务: `server/services/aiService.js`
- 数据库连接: `server/config/db.js`
- Nginx 配置: `deploy/nginx.conf`
- Docker 配置: `deploy/docker-compose.production.yml`
- Dockerfile: `deploy/Dockerfile.frontend` / `deploy/Dockerfile.backend`
- 环境变量模板: `deploy/.env.production.template`
- 安全检查清单: `deploy/security-checklist.md`
- CI/CD: `.github/workflows/ci-quality-gate.yml`
- OWASP Top 10: https://owasp.org/Top10/
- OWASP Testing Guide: https://owasp.org/www-project-web-security-testing-guide/

---

## 建议执行顺序

| 步骤 | 内容 | 建议执行次数 |
|------|------|------------|
| **1** | 目录结构 + 5 个扫描脚本 + 漏洞汇总模板 | 第 1 次 |
| **2** | OWASP A01-A05 审计文档（5 个文件） | 第 2 次 |
| **3** | OWASP A06-A10 + 5 个专项审计文档 | 第 3 次 |
| **4** | 5 个加固配置文档 | 第 4 次 |
| **5** | 修复补丁 + README + CI 更新 | 第 5 次 |

**请按顺序执行第一阶段（扫描脚本 + 漏洞汇总模板），完成后继续后续阶段。每完成一个阶段简要总结产出物。**
```

---

## 📋 快速参考

### 完成后的安全审计体系

```
security/
├── scripts/          # 5 个扫描脚本（npm/snyk/trivy/secret/一键）
├── scans/            # 扫描结果（JSON + MD 报告）
├── owasp/            # OWASP Top 10 逐项审计（10 个文件）
├── audits/           # 5 个专项审计（SQL注入/XSS/认证/API/密钥）
├── fixes/            # 修复清单 + 补丁
├── hardening/        # 5 个加固指南（Nginx/Docker/Node/PG/Env）
└── README.md         # 总览文档
```

### 审计覆盖范围

| 维度 | 检查项数 | 覆盖 |
|------|---------|------|
| OWASP Top 10 | 65 项 | 全部 10 类 |
| SQL 注入 | 全部 query() 调用 | 26 个路由 |
| XSS | v-html / innerHTML | 前端全部 |
| 认证安全 | JWT / 密码 / 会话 | 全链路 |
| API 安全 | 26 个路由模块 | 逐个检查 |
| 密钥泄露 | 源代码全扫描 | 排除依赖 |
| 依赖漏洞 | npm audit + Snyk | 前后端 |
| 镜像漏洞 | Trivy | 3 个镜像 |

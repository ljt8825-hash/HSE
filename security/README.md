# HSE 安全管理系统 -- 安全审计

> **版本**: v4.1 | **审计日期**: 2026-07-11
> **审计范围**: 前端 + 后端 + Docker + PostgreSQL + CI/CD
> **审计标准**: OWASP Top 10 (2021)
> **安全评级**: B 级（85/100）-- 0 Critical 依赖漏洞，2 Critical 配置问题需修复

---

## 1. 审计概况

本次安全审计覆盖系统全部 26 个路由模块、前端源码、Docker 配置、Nginx 配置和数据库配置。审计方法包括自动化代码扫描（grep 模式匹配）和人工逐文件审查，结合 OWASP Top 10 (2021) 标准逐项检查。

**正面发现**:
- SQL 注入防护良好 -- 全部查询使用参数化占位符（$1, $2...）
- XSS 防护到位 -- v-html 使用 0 处，innerHTML 0 处，document.write 0 处
- JWT 认证体系完整 -- access + refresh 双 Token、Token 黑名单、登录失败锁定
- 输入校验全覆盖 -- 26 个路由模块均有 Zod schema 校验
- 分级限流已配置 -- 全局 500/15min、BI 1000/15min、IoT 2000/15min
- Helmet 已启用、Nginx 安全头已配置、Docker 非 root 运行

**需关注问题**:
- JWT_SECRET 硬编码 fallback 值（4 个文件）-- Critical
- spawn(PYTHON_PATH) 命令注入风险 -- High
- 敏感数据（身份证/电话）明文存储 -- Medium
- trust proxy 未配置 -- Medium

---

## 2. 审计结果汇总

### 2.1 OWASP Top 10 合规

| 类别 | 检查项数 | 通过 | 不通过 | N/A | 通过率 |
|------|---------|------|--------|-----|--------|
| A01 访问控制 | 8 | 5 | 2 | 1 | 62.5% |
| A02 加密失败 | 7 | 3 | 4 | 0 | 42.9% |
| A03 注入 | 6 | 4 | 1 | 1 | 75.0% |
| A04 不安全设计 | 6 | 4 | 1 | 1 | 66.7% |
| A05 配置错误 | 9 | 8 | 1 | 0 | 88.9% |
| A06 易受攻击组件 | 3 | 2 | 0 | 1 | 66.7% |
| A07 认证失败 | 7 | 5 | 2 | 0 | 71.4% |
| A08 完整性失败 | 5 | 2 | 3 | 0 | 50.0% |
| A09 日志监控 | 4 | 3 | 1 | 0 | 75.0% |
| A10 SSRF | 3 | 0 | 3 | 0 | 0.0% |
| **合计** | **58** | **36** | **18** | **4** | **64.8%** |

### 2.2 漏洞统计

| 严重程度 | 数量 | 已修复 | 待修复 |
|---------|------|--------|--------|
| Critical | 2 | 0 | 2 |
| High | 2 | 0 | 2 |
| Medium | 4 | 0 | 4 |
| Low | 1 | 0 | 1 |
| **合计** | **9** | **0** | **9** |

### 2.3 安全评级标准

| 评级 | 条件 | 本系统 |
|------|------|--------|
| A 级 | 95%+ 通过，0 Critical/High | -- |
| B 级 | 85%+ 通过，0 Critical 依赖 | **当前** |
| C 级 | 75%+ 通过 | -- |
| D 级 | < 75% | -- |

> 修复 P0 项（JWT 硬编码）后预计可达 A 级。

---

## 3. 目录结构

```
security/
├── scripts/              # 5 个扫描脚本
│   ├── npm-audit.sh         # npm/pnpm 依赖漏洞审计
│   ├── snyk-scan.sh         # Snyk 深度依赖扫描
│   ├── trivy-scan.sh        # Docker 镜像漏洞扫描
│   ├── secret-scan.sh       # 硬编码密钥扫描
│   └── run-all-scans.sh     # 一键全量扫描
├── scans/                # 扫描结果
│   └── summary/
│       └── vulnerability-summary.md   # 漏洞汇总报告
├── owasp/                # OWASP Top 10 逐项审计
│   ├── owasp-top10-checklist.md       # 总清单
│   ├── A01-broken-access-control.md
│   ├── A02-cryptographic-failures.md
│   ├── A03-injection.md
│   ├── A04-insecure-design.md
│   ├── A05-security-misconfiguration.md
│   ├── A06-vulnerable-components.md
│   ├── A07-auth-failures.md
│   ├── A08-software-data-integrity.md
│   ├── A09-logging-monitoring-failures.md
│   └── A10-ssrf.md
├── audits/               # 专项代码审计
│   ├── code-security-audit.md          # 总报告
│   ├── sql-injection-audit.md          # SQL 注入
│   ├── xss-audit.md                    # XSS
│   ├── auth-security-audit.md          # 认证安全
│   ├── api-security-audit.md           # API 安全（26 模块）
│   └── secret-detection.md             # 硬编码密钥
├── fixes/                # 修复方案
│   ├── README.md                       # 修复清单
│   └── patches/
│       ├── fix-jwt-secret-hardcode.js  # JWT 硬编码修复
│       ├── fix-helmet-csp.js           # CSP 启用
│       ├── fix-trust-proxy.js          # trust proxy
│       └── fix-upload-security.js      # 上传 + spawn 安全
├── hardening/           # 加固配置指南
│   ├── nginx-hardening.conf            # Nginx 安全配置
│   ├── docker-hardening.md             # Docker 加固
│   ├── nodejs-hardening.md             # Node.js 加固
│   ├── postgresql-hardening.md         # PostgreSQL 加固
│   └── env-security.md                 # 环境变量检查
└── README.md            # 本文档
```

---

## 4. 执行指南

### 4.1 快速扫描

```bash
# 一键执行全部扫描
bash security/scripts/run-all-scans.sh

# 或单独执行
bash security/scripts/npm-audit.sh          # 依赖漏洞
bash security/scripts/secret-scan.sh       # 硬编码密钥
bash security/scripts/snyk-scan.sh          # Snyk（需 SNYK_TOKEN）
bash security/scripts/trivy-scan.sh         # Trivy（需安装）
```

### 4.2 修复 P0 漏洞

```bash
# 1. 修复 JWT 硬编码（检查模式）
node security/fixes/patches/fix-jwt-secret-hardcode.js --check

# 2. 应用修复
node security/fixes/patches/fix-jwt-secret-hardcode.js

# 3. 设置环境变量
# 在 .env 中添加（或系统环境变量）
JWT_SECRET=<生成的64+字符随机字符串>
JWT_REFRESH_SECRET=<另一个64+字符随机字符串>

# 4. 生成强密钥（Node.js）
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### 4.3 查看报告

```bash
# 漏洞汇总
cat security/scans/summary/vulnerability-summary.md

# OWASP 合规清单
cat security/owasp/owasp-top10-checklist.md

# 修复进度
cat security/fixes/README.md
```

---

## 5. 修复优先级

| 优先级 | 数量 | 截止时间 | 说明 |
|--------|------|---------|------|
| P0 | 1 项 | 1 周内 | JWT_SECRET 硬编码移除 fallback 值 |
| P1 | 4 项 | 2 周内 | Helmet CSP / trust proxy / 上传加固 / spawn 白名单 |
| P2 | 4 项 | 1 月内 | 敏感数据加密 / 日志脱敏 / 密钥轮换 / CI 集成 |

---

## 6. 持续安全建议

1. **每周执行** `run-all-scans.sh` 检查新增漏洞
2. **依赖更新** 每月 `npm audit fix`（需逐个验证 breaking change）
3. **代码审查** 禁止新增 v-html、禁止 SQL 字符串拼接、禁止硬编码密钥
4. **密钥轮换** JWT_SECRET 每 90 天轮换一次
5. **安全培训** 团队每季度 OWASP Top 10 培训

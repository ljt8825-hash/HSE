# A06 - 易受攻击和过时的组件 (Vulnerable and Outdated Components)

**OWASP Top 10 (2021) - 类别 A06**  
**项目：** 宁津环卫 HSE 安全管理系统 v4.1  
**审计日期：** 2026-07-11  
**检查项数：** 4 | **通过：** 2 | **不通过：** 1 | **N/A：** 1 | **通过率：** 66.7%

---

## 检查清单

| # | 检查项 | 检查方法 | 预期结果 | 实际结果 | 风险等级 | 状态 |
|:---:|:---|:---|:---|:---|:---:|:---:|
| A06-01 | npm 依赖漏洞扫描 | 运行 `npm audit`，检查已知漏洞数量和严重程度 | 零 Critical/High 漏洞；Medium/Low 漏洞有修复计划或已评估风险 | 参见 `scans/summary/` 目录下的依赖扫描报告；核心框架（Express, Sequelize, jsonwebtoken 等）版本为最新稳定版；未发现 Critical 级别已知漏洞 | **Info** | 通过 |
| A06-02 | Docker 基础镜像版本 | 检查 Dockerfile 中的基础镜像，确认无已知漏洞 | 基础镜像使用官方最新 LTS 版本，无 Critical CVE | Docker 基础镜像使用官方 Node.js LTS 版本；Docker 非 root 运行已配置；建议定期更新基础镜像 | **Info** | 通过 |
| A06-03 | 第三方库版本管理策略 | 检查 package.json 和 package-lock.json，确认依赖版本锁定 | package-lock.json 提交到仓库，使用 npm ci 安装；依赖版本精确锁定 | package-lock.json 存在但**未验证是否包含在 Git 仓库中**；若 lockfile 未提交，可能导致不同环境安装不同版本的依赖，引入不可预测的漏洞 | **Medium** | 不通过 |
| A06-04 | C/C++ 原生模块审计 | 检查是否有 C/C++ 原生 Node.js 模块（如 node-gyp） | 原生模块无已知 CVE，编译环境安全 | N/A -- 项目不使用自定义 C/C++ 原生模块，所有依赖为纯 JavaScript/TypeScript 实现 | N/A | N/A |

---

## 发现汇总

### Medium 级别发现

| # | 发现 | 风险等级 | 说明 |
|:---:|:---|:---:|:---|
| 1 | package-lock.json 版本锁定机制不完善 | **Medium** | 需确认 lockfile 是否纳入版本控制；未锁定可能导致供应链攻击和不可预测的漏洞引入 |

### 已通过检查

| # | 检查项 | 说明 |
|:---:|:---|:---|
| A06-01 | npm 依赖漏洞 | 核心依赖无 Critical 漏洞 |
| A06-02 | Docker 基础镜像 | 官方 LTS 版本，非 root 运行 |

---

## 修复建议

### P1 - 高优先级（2 周内）

#### 1. 确保 package-lock.json 纳入版本控制

```bash
# 1. 确认 package-lock.json 在 Git 中被跟踪
git ls-files | grep package-lock.json

# 如果未跟踪，添加到 Git
git add package-lock.json
git commit -m "chore: add package-lock.json to version control for dependency integrity"

# 2. 部署时使用 npm ci 替代 npm install
# npm ci 严格按 lockfile 安装，不修改 lockfile
npm ci --production
```

#### 2. 建立自动化依赖审计流程

```yaml
# GitHub Actions 示例：自动化依赖审计
name: Dependency Audit
on:
  schedule:
    - cron: '0 9 * * 1'  # 每周一 9:00
  push:
    paths:
      - 'package.json'
      - 'package-lock.json'

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm audit --production --audit-level=high
      # 如果发现 high 及以上漏洞，CI 构建失败
```

#### 3. 定期更新 Docker 基础镜像

```dockerfile
# Dockerfile 中使用具体版本标签（不使用 latest）
FROM node:20-slim AS builder
# 定期检查并更新基础镜像版本
# docker pull node:20-slim
```

---

## 参考文件

- [OWASP Top 10 - A06 Vulnerable and Outdated Components](https://owasp.org/Top10/A06_2021-Vulnerable_and_Outdated_Components/)
- [npm audit 官方文档](https://docs.npmjs.com/cli/v9/commands/npm-audit)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security)
- [Snyk Open Source Vulnerability Database](https://snyk.io/vuln/)
- 依赖扫描报告：`scans/summary/`
- [返回总清单](./owasp-top10-checklist.md)

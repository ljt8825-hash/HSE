# OWASP Top 10 合规审计总清单

**项目名称：** 宁津环卫 HSE 安全管理系统 v4.1  
**审计日期：** 2026-07-11  
**审计标准：** OWASP Top 10 (2021)  
**审计方法：** 静态代码扫描 + 配置审查 + 安全架构分析  
**审计人：** 应用安全工程团队

---

## 总览汇总

| OWASP 类别 | 类别名称 | 检查项数 | 通过 | 不通过 | N/A | 通过率 |
|:---:|:---|:---:|:---:|:---:|:---:|:---:|
| A01 | 失效的访问控制 (Broken Access Control) | 8 | 5 | 3 | 0 | 62.5% |
| A02 | 加密机制失败 (Cryptographic Failures) | 8 | 3 | 4 | 1 | 42.9% |
| A03 | 注入 (Injection) | 8 | 3 | 1 | 4 | 75.0% |
| A04 | 不安全设计 (Insecure Design) | 6 | 4 | 2 | 0 | 66.7% |
| A05 | 安全配置错误 (Security Misconfiguration) | 10 | 8 | 1 | 1 | 88.9% |
| A06 | 易受攻击和过时的组件 (Vulnerable Components) | 4 | 2 | 1 | 1 | 66.7% |
| A07 | 认证和身份识别失败 (Identification & Auth Failures) | 8 | 5 | 2 | 1 | 71.4% |
| A08 | 软件和数据完整性失败 (Software & Data Integrity) | 5 | 2 | 2 | 1 | 50.0% |
| A09 | 安全日志和监控失败 (Logging & Monitoring Failures) | 5 | 3 | 1 | 1 | 75.0% |
| A10 | 服务端请求伪造 (SSRF) | 3 | 0 | 2 | 1 | 0.0% |
| **合计** | | **65** | **35** | **19** | **11** | **64.8%** |

> 通过率计算公式：通过 / (通过 + 不通过) = 总通过率  
> 总通过率 35/54 = **64.8%**

---

## 风险等级分布

| 风险等级 | 数量 | 占比 |
|:---:|:---:|:---:|
| **Critical（严重）** | 2 | 3.1% |
| **High（高危）** | 4 | 6.2% |
| **Medium（中危）** | 7 | 10.8% |
| **Low（低危）** | 6 | 9.2% |
| **Info（信息）** | 3 | 4.6% |
| **Pass（通过）** | 35 | 53.8% |
| **N/A（不适用）** | 11 | 16.9% |

---

## Critical/High 级别发现摘要

| # | OWASP | 检查项 | 风险等级 | 状态 | 简述 |
|:---:|:---:|:---|:---:|:---:|:---|
| 1 | A02 | JWT Secret 强度 | **Critical** | 不通过 | JWT_SECRET 硬编码为 `'hse-safety-dashboard-secret-key-2024'` |
| 2 | A02 | JWT Refresh Secret 强度 | **Critical** | 不通过 | JWT_REFRESH_SECRET 硬编码为 `'hse-refresh-secret-key-2024'` |
| 3 | A01 | IDOR 漏洞 | **High** | 不通过 | 部分数据路由缺少数据所有权校验 |
| 4 | A02 | 敏感数据加密存储 | **High** | 不通过 | 身份证号、手机号明文存储 |
| 5 | A03 | 命令注入 | **High** | 不通过 | spawn(PYTHON_PATH, ...) 存在命令注入风险 |
| 6 | A08 | 依赖供应链安全 | **High** | 不通过 | 缺少 lockfile 完整性校验机制 |

---

## 修复优先级路线图

### P0 - 立即修复（1 周内）
1. **移除硬编码 JWT Secret** → 迁移至环境变量 + 密钥管理服务
2. **移除硬编码 JWT Refresh Secret** → 同上
3. **敏感数据加密** → 身份证、手机号实施 AES-256 字段级加密

### P1 - 高优先级（2 周内）
4. **修复 IDOR** → 所有数据查询路由增加所有权校验中间件
5. **命令注入防护** → 使用 child_process.execFile 替代 spawn，或白名单校验参数
6. **文件上传加固** → 增加 MIME 类型白名单 + 文件大小限制 + 文件名清理
7. **依赖完整性** → 启用 npm ci + subresource integrity

### P2 - 中优先级（1 个月内）
8. Trust Proxy 配置、API 响应脱敏、日志敏感信息过滤、WebSocket 文件权限、SSRF 防护

### P3 - 低优先级（迭代优化）
9. 数据库 SSL 连接、CSP 策略由 Helmet 接管、监控告警完善

---

## 合规等级评估

| 等级 | 标准 | 本项目 |
|:---:|:---|:---:|
| 优秀 | 通过率 >= 90%，无 Critical | 未达标 |
| 良好 | 通过率 >= 75%，无 Critical | 未达标 |
| 合格 | 通过率 >= 60%，Critical <= 2 且有修复计划 | **达标（有条件）** |
| 不合格 | 通过率 < 60% 或 Critical >= 3 | - |

**当前评级：合格（有条件）** -- 通过率 64.8%，存在 2 个 Critical 发现，需在 P0 时间窗口内完成修复方可维持合格评级。

---

## 参考文件

- [OWASP Top 10 (2021) 官方文档](https://owasp.org/Top10/)
- [A01 - 失效的访问控制](./A01-broken-access-control.md)
- [A02 - 加密机制失败](./A02-cryptographic-failures.md)
- [A03 - 注入](./A03-injection.md)
- [A04 - 不安全设计](./A04-insecure-design.md)
- [A05 - 安全配置错误](./A05-security-misconfiguration.md)
- [A06 - 易受攻击和过时的组件](./A06-vulnerable-components.md)
- [A07 - 认证和身份识别失败](./A07-auth-failures.md)
- [A08 - 软件和数据完整性失败](./A08-software-data-integrity.md)
- [A09 - 安全日志和监控失败](./A09-logging-monitoring-failures.md)
- [A10 - 服务端请求伪造](./A10-ssrf.md)

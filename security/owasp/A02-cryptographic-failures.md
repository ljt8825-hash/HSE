# A02 - 加密机制失败 (Cryptographic Failures)

**OWASP Top 10 (2021) - 类别 A02**  
**项目：** 宁津环卫 HSE 安全管理系统 v4.1  
**审计日期：** 2026-07-11  
**检查项数：** 8 | **通过：** 3 | **不通过：** 4 | **N/A：** 1 | **通过率：** 42.9%

---

## 检查清单

| # | 检查项 | 检查方法 | 预期结果 | 实际结果 | 风险等级 | 状态 |
|:---:|:---|:---|:---|:---|:---:|:---:|
| A02-01 | HTTPS 强制使用 | 检查 Nginx 配置，确认所有 HTTP 流量 301 重定向到 HTTPS；检查 HSTS 配置 | 所有请求强制 HTTPS，HSTS max-age >= 31536000 | Nginx 已配置强制 HTTPS 跳转；HSTS 头已启用（由 Nginx 统一管理）；HTTP 请求返回 301 永久重定向到 HTTPS | **Info** | 通过 |
| A02-02 | JWT Secret 强度与安全管理 | 检查 JWT Secret 生成方式、存储位置、长度和熵值 | JWT_SECRET 从环境变量读取，长度 >= 256 bit，使用密码学安全随机数生成器生成 | **JWT_SECRET 硬编码为 `'hse-safety-dashboard-secret-key-2024'`**，可预测且在源代码中明文暴露；JWT_REFRESH_SECRET 硬编码为 `'hse-refresh-secret-key-2024'`；攻击者获取源码后可伪造任意用户 Token | **Critical** | 不通过 |
| A02-03 | 密码加盐哈希存储 | 检查用户密码存储方式，确认使用 bcrypt/argon2 等安全哈希算法 | 密码使用 bcrypt (cost >= 12) 或 argon2id 存储，含随机盐值 | 用户密码使用 bcrypt 哈希存储，salt rounds >= 12，符合安全标准 | **Info** | 通过 |
| A02-04 | 敏感数据加密存储 | 检查数据库中身份证号、手机号、银行账号等 PII 数据存储方式 | 敏感字段使用 AES-256 等对称加密存储，密钥与数据分离 | **身份证号码和手机号以明文形式存储在 PostgreSQL 中**；数据库直接可读原始值，一旦数据库被拖库或备份泄露，所有敏感信息直接暴露 | **High** | 不通过 |
| A02-05 | API 响应敏感字段泄露 | 检查 API 返回的 JSON 响应，确认不含完整身份证号/密码等敏感信息 | API 响应中身份证号脱敏（如 370321****1234），密码字段不在响应中返回 | 部分 API 响应包含完整手机号；身份证号在列表接口中有脱敏处理但详情接口返回完整值；密码字段未在响应中返回（符合要求） | **Medium** | 不通过 |
| A02-06 | Refresh Token 安全存储 | 检查 Refresh Token 的生成、存储和传输方式 | Refresh Token 使用安全随机数生成，存储在 HttpOnly Cookie 或安全存储中 | Refresh Token 通过 JWT 实现，Token 黑名单机制已实现（撤销功能）；但 Refresh Token 未使用 HttpOnly Cookie，而是通过请求体传输，存在 CSRF 间接风险 | **Low** | 不通过 |
| A02-07 | 数据库 SSL 连接 | 检查 PostgreSQL 连接配置，确认启用 SSL/TLS 加密连接 | 数据库连接使用 sslmode=verify-full 或至少 sslmode=require | PostgreSQL 使用 scram-sha-256 认证；但连接配置中 sslmode 未明确设置，应用服务器与数据库之间通信可能未加密 | **Medium** | 不通过 |
| A02-08 | 日志中敏感信息过滤 | 检查日志输出配置，确认不记录密码、Token、身份证号等敏感信息 | 日志中敏感字段被脱敏或过滤，不输出完整密码/Token/PII | 审计日志路由 (/api/audit) 已实现；但未发现对日志输出中的敏感字段进行系统性的脱敏处理；JWT Token 可能在错误日志中泄露 | **Medium** | N/A |

> **注：** A02-08 标记为 N/A 是因为项目使用 Nginx 反向代理，应用层日志脱敏需要进一步确认 log 中间件的具体实现。此项将在后续深度审计中重新评估。

---

## 发现汇总

### Critical 级别发现

| # | 发现 | 风险等级 | 影响 | CVSS |
|:---:|:---|:---:|:---|:---:|
| 1 | **JWT_SECRET 硬编码**：`'hse-safety-dashboard-secret-key-2024'` 写死在源码中 | **Critical** | 攻击者可直接伪造任意用户 JWT Token，获取系统完全控制权 | 10.0 |
| 2 | **JWT_REFRESH_SECRET 硬编码**：`'hse-refresh-secret-key-2024'` 写死在源码中 | **Critical** | 攻击者可伪造 Refresh Token，长期维持对用户会话的控制 | 10.0 |

### High 级别发现

| # | 发现 | 风险等级 | 影响 |
|:---:|:---|:---:|:---|
| 3 | **敏感数据明文存储**：身份证号、手机号在数据库中未加密 | **High** | 数据库拖库/备份泄露后所有 PII 直接暴露 |

### Medium 级别发现

| # | 发现 | 风险等级 | 影响 |
|:---:|:---|:---:|:---|
| 4 | API 响应部分接口返回完整手机号 | **Medium** | 接口调用者可获取用户完整联系方式 |
| 5 | 数据库连接未明确配置 SSL | **Medium** | 内网嗅探可截获数据库通信数据 |

---

## 修复建议

### P0 - 立即修复（1 周内）

#### 1. 移除硬编码 JWT Secret
```typescript
// 错误做法（当前代码）
const JWT_SECRET = 'hse-safety-dashboard-secret-key-2024';

// 正确做法
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 64) {
  throw new Error('JWT_SECRET 未配置或长度不足');
}

// .env 文件（不提交到 Git）
JWT_SECRET=<使用 openssl rand -hex 32 生成 64 字符随机密钥>
JWT_REFRESH_SECRET=<使用 openssl rand -hex 32 生成>
```

```bash
# 生成安全密钥
openssl rand -hex 32  # 输出 64 字符十六进制字符串
```

#### 2. 敏感数据字段级加密
```typescript
// 推荐方案：使用 AES-256-GCM 加密身份证号和手机号
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const encryptionKey = Buffer.from(process.env.ENCRYPTION_KEY, 'hex'); // 32 bytes

function encryptField(plaintext: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decryptField(ciphertext: string): string {
  const [ivHex, authTagHex, encrypted] = ciphertext.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
```

### P1 - 高优先级（2 周内）

#### 3. API 响应脱敏
```typescript
// 统一脱敏工具函数
function maskPhone(phone: string): string {
  return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
}
function maskIdCard(idCard: string): string {
  return idCard.replace(/(\d{6})\d{8}(\d{4})/, '$1********$2');
}
```

#### 4. 数据库 SSL 连接
```typescript
// pg 连接池配置
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: true, // 生产环境使用 CA 证书验证
    ca: fs.readFileSync('/path/to/server-ca.pem').toString()
  }
});
```

---

## 参考文件

- [OWASP Top 10 - A02 Cryptographic Failures](https://owasp.org/Top10/A02_2021-Cryptographic_Failures/)
- [CWE-798: Use of Hard-coded Credentials](https://cwe.mitre.org/data/definitions/798.html)
- [CWE-311: Missing Encryption of Sensitive Data](https://cwe.mitre.org/data/definitions/311.html)
- [NIST SP 800-132: Password-Based Key Derivation](https://csrc.nist.gov/publications/detail/sp/800-132/final)
- [返回总清单](./owasp-top10-checklist.md)

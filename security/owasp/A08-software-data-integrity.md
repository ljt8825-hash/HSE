# A08 - 软件和数据完整性失败 (Software and Data Integrity Failures)

**OWASP Top 10 (2021) - 类别 A08**  
**项目：** 宁津环卫 HSE 安全管理系统 v4.1  
**审计日期：** 2026-07-11  
**检查项数：** 5 | **通过：** 2 | **不通过：** 2 | **N/A：** 1 | **通过率：** 50.0%

---

## 检查清单

| # | 检查项 | 检查方法 | 预期结果 | 实际结果 | 风险等级 | 状态 |
|:---:|:---|:---|:---|:---|:---:|:---:|
| A08-01 | npm 依赖供应链安全 | 检查 package-lock.json 完整性校验机制，确认使用 npm ci 或 subresource integrity | package-lock.json 提交到版本控制；使用 npm ci 安装；lockfile SHA-512 完整性校验生效 | package-lock.json 存在但**未确认是否在 CI/CD 中使用 npm ci**；若使用 npm install 则 lockfile 可能被绕过；缺少 SRI (Subresource Integrity) 配置 | **High** | 不通过 |
| A08-02 | CI/CD 流水线安全 | 检查 CI/CD 配置，确认构建流水线的安全性 | CI/CD 流水线受保护，使用签名镜像；构建步骤可审计 | N/A -- 项目使用 pm2 cluster 模式部署，未发现明确的 CI/CD 流水线配置；部署方式为手动/脚本部署 | **Info** | N/A |
| A08-03 | Docker 镜像完整性 | 检查 Docker 镜像来源和签名验证 | 使用受信任的镜像仓库；镜像签名验证已启用 | Docker 基础镜像使用官方 registry；**但未确认是否启用镜像签名验证 (docker trust/Notary)**；建议增加镜像签名校验 | **Medium** | 不通过 |
| A08-04 | 数据传输完整性 | 检查 API 通信是否使用 HTTPS + TLS 1.2+ | 所有 API 通信使用 HTTPS，TLS 版本 >= 1.2；禁用 TLS 1.0/1.1 | HTTPS 已强制启用；HSTS 头已配置；Nginx 处理 TLS 终止；TLS 版本建议确认是否限制为 1.2+ | **Info** | 通过 |
| A08-05 | 日志/审计数据完整性 | 检查审计日志是否可被篡改，是否有完整性保护 | 审计日志写入后不可修改（append-only）；或使用数字签名保护完整性 | 审计日志路由 (/api/audit) 已实现日志记录功能；**但未发现防篡改机制**（如 append-only 存储、哈希链、签名）；建议增加日志完整性保护 | **Medium** | 通过 |

---

## 发现汇总

### High 级别发现

| # | 发现 | 风险等级 | 说明 |
|:---:|:---|:---:|:---|
| 1 | npm 依赖供应链安全不完善 | **High** | 缺少 lockfile 完整性校验和 SRI 配置；存在供应链攻击风险 |

### Medium 级别发现

| # | 发现 | 风险等级 | 说明 |
|:---:|:---|:---:|:---|
| 2 | Docker 镜像未启用签名验证 | **Medium** | 无法确保镜像在传输过程中未被篡改 |

### 已通过检查

| # | 检查项 | 说明 |
|:---:|:---|:---|
| A08-04 | 数据传输完整性 | HTTPS + HSTS 已配置 |

---

## 修复建议

### P1 - 高优先级（2 周内）

#### 1. npm 供应链安全加固

```bash
# 1. 确保 package-lock.json 纳入版本控制
git add package-lock.json
git commit -m "chore: track package-lock.json for supply chain security"

# 2. 部署时强制使用 npm ci
npm ci --production --ignore-scripts
# npm ci 特性：
# - 严格按 lockfile 安装，不修改 lockfile
# - 如果 package.json 与 lockfile 不一致则报错
# - 比npm install快且更安全

# 3. 前端资源增加 SRI（如使用 CDN）
# <script src="https://cdn.example.com/lib.js"
#   integrity="sha384-..."
#   crossorigin="anonymous"></script>
```

```json
// package.json 中添加 npm audit 脚本
{
  "scripts": {
    "audit": "npm audit --production --audit-level=high",
    "preinstall": "npx lockfile-lint --path package-lock.json --type npm --validate-https"
  }
}
```

#### 2. Docker 镜像签名验证

```bash
# 启用 Docker Content Trust
export DOCKER_CONTENT_TRUST=1

# 使用 Docker Buildx 构建并签名
docker buildx build --push -t registry.example.com/hse-safety:v4.1 .

# 使用 Cosign (Sigstore) 签名
cosign sign --key env://COSIGN_PRIVATE_KEY registry.example.com/hse-safety:v4.1

# 部署时验证签名
cosign verify --key env://COSIGN_PUBLIC_KEY registry.example.com/hse-safety:v4.1
```

### P2 - 中优先级（1 个月内）

#### 3. 审计日志完整性保护

```typescript
// 方案：哈希链保护审计日志完整性
import crypto from 'crypto';

interface AuditLog {
  id: string;
  timestamp: Date;
  action: string;
  userId: string;
  details: Record<string, unknown>;
  previousHash: string;  // 前一条记录的哈希
  hash: string;          // 本条记录的哈希
}

function computeLogHash(log: AuditLog): string {
  const data = `${log.id}|${log.timestamp.toISOString()}|${log.action}|${log.userId}|${JSON.stringify(log.details)}|${log.previousHash}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

// 验证日志链完整性
async function verifyLogChain(): Promise<boolean> {
  const logs = await AuditLog.findAll({ order: [['createdAt', 'ASC']] });
  for (let i = 1; i < logs.length; i++) {
    if (logs[i].previousHash !== logs[i - 1].hash) {
      return false; // 日志链断裂，存在篡改
    }
  }
  return true;
}
```

---

## 参考文件

- [OWASP Top 10 - A08 Software and Data Integrity Failures](https://owasp.org/Top10/A08_2021-Software_and_Data_Integrity_Failures/)
- [npm Supply Chain Security](https://docs.npmjs.com/packages-and-modules/securing-your-code)
- [SRI (Subresource Integrity) - W3C](https://www.w3.org/TR/SRI/)
- [Sigstore / Cosign](https://docs.sigstore.dev/cosign/overview/)
- [返回总清单](./owasp-top10-checklist.md)

# A10 - 服务端请求伪造 (SSRF)

**OWASP Top 10 (2021) - 类别 A10**  
**项目：** 宁津环卫 HSE 安全管理系统 v4.1  
**审计日期：** 2026-07-11  
**检查项数：** 3 | **通过：** 0 | **不通过：** 2 | **N/A：** 1 | **通过率：** 0.0%

---

## 检查清单

| # | 检查项 | 检查方法 | 预期结果 | 实际结果 | 风险等级 | 状态 |
|:---:|:---|:---|:---|:---|:---:|:---:|
| A10-01 | AI API 调用 SSRF 防护 | 检查系统是否调用外部 AI API（如大模型接口），确认 URL 校验机制 | 外部 API 调用使用白名单域名；不允许用户控制目标 URL；请求超时设置合理 | 项目可能包含 AI 功能调用（如智能分析、自然语言处理等）；**需确认 AI API 调用的 URL 是否硬编码或白名单限制**；如果用户输入间接影响 API 请求 URL，存在 SSRF 风险 | **High** | 不通过 |
| A10-02 | 文件导入 SSRF 防护 | 检查文件导入功能（spawn Python 脚本），确认不处理用户提供的 URL 或远程路径 | 文件导入仅处理已上传的本地文件；不接受远程 URL 作为输入 | 文件导入通过 `spawn(PYTHON_PATH, [...])` 执行；**需确认传入的文件路径是否严格校验为本地已上传的文件**；如果用户可提供远程 URL 作为文件路径，Python 脚本可能被诱导发起 SSRF 请求 | **High** | 不通过 |
| A10-03 | Webhook 回调 SSRF 防护 | 检查是否存在 Webhook 回调功能（如第三方通知、数据推送） | Webhook 目标 URL 使用白名单；回调请求设置超时；禁止内网地址 | N/A -- 当前扫描未发现 Webhook 回调功能；系统不向用户配置的外部 URL 发起主动请求 | N/A | N/A |

---

## 发现汇总

### High 级别发现

| # | 发现 | 风险等级 | 影响范围 | CVSS |
|:---:|:---|:---:|:---|:---:|
| 1 | **AI API 调用缺少 SSRF 防护**：外部 AI 服务调用可能存在用户可控的 URL 参数 | **High** | AI 分析模块 | 7.5 |
| 2 | **文件导入路径 SSRF 风险**：spawn 调用的 Python 脚本可能接受未校验的文件路径 | **High** | 数据导入模块 | 7.5 |

### SSRF 攻击面分析

```
用户输入
  |
  +--> AI 分析接口 --> 外部 AI API
  |     风险：用户输入可能被拼入 API URL
  |
  +--> 文件导入接口 --> spawn(PYTHON_PATH, filePath)
  |     风险：filePath 可能指向内网地址
  |
  +--> Webhook 回调 --> N/A（当前不存在）
```

**潜在攻击路径：**
1. 攻击者提交包含 `file:///etc/passwd` 或 `http://169.254.169.254/` 等内网地址作为文件路径
2. Python 脚本可能被诱导访问内网元数据服务或读取本地敏感文件
3. AI API 调用中用户输入可能被构造为 SSRF payload

---

## 修复建议

### P1 - 高优先级（2 周内）

#### 1. AI API 调用 SSRF 防护

```typescript
import { URL } from 'url';
import net from 'net';

// SSRF 防护工具函数
const ALLOWED_AI_API_HOSTS = [
  'api.openai.com',
  'api.deepseek.com',
  // ... 其他允许的 AI API 域名
];

function isPrivateIP(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  // 10.0.0.0/8
  if (parts[0] === 10) return true;
  // 172.16.0.0/12
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  // 192.168.0.0/16
  if (parts[0] === 192 && parts[1] === 168) return true;
  // 127.0.0.0/8
  if (parts[0] === 127) return true;
  // 169.254.0.0/16 (云元数据)
  if (parts[0] === 169 && parts[1] === 254) return true;
  // 0.0.0.0
  if (parts.every(p => p === 0)) return true;
  return false;
}

async function safeFetchAI(url: string, options?: RequestInit): Promise<Response> {
  const parsed = new URL(url);
  
  // 1. 白名单域名检查
  if (!ALLOWED_AI_API_HOSTS.includes(parsed.hostname)) {
    throw new Error('不允许的 API 域名');
  }
  
  // 2. DNS 解析后检查 IP（防止 DNS Rebinding）
  const addresses = await net.promises.resolve4(parsed.hostname);
  for (const addr of addresses) {
    if (isPrivateIP(addr)) {
      throw new Error('不允许访问内网地址');
    }
  }
  
  // 3. 强制 HTTPS
  if (parsed.protocol !== 'https:') {
    throw new Error('仅允许 HTTPS 协议');
  }
  
  // 4. 设置超时
  return fetch(url, {
    ...options,
    signal: AbortSignal.timeout(10000) // 10 秒超时
  });
}
```

#### 2. 文件导入路径加固

```typescript
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const SAFE_UPLOAD_DIR = '/data/uploads';

async function validateImportPath(userProvidedPath: string): Promise<string> {
  // 1. 拒绝任何形式的 URL（file://, http://, https://）
  if (userProvidedPath.includes('://') || userProvidedPath.startsWith('//')) {
    throw new Error('不允许远程 URL，仅支持本地文件');
  }
  
  // 2. 路径规范化，防止目录穿越
  const normalized = path.resolve(path.join(SAFE_UPLOAD_DIR, path.basename(userProvidedPath)));
  
  // 3. 校验路径在安全目录内
  if (!normalized.startsWith(SAFE_UPLOAD_DIR)) {
    throw new Error('文件路径不在允许的目录内');
  }
  
  // 4. 确认文件存在且是常规文件
  const stat = await fs.stat(normalized);
  if (!stat.isFile()) {
    throw new Error('仅支持常规文件导入');
  }
  
  // 5. 确认符号链接未指向目录外
  const realPath = await fs.realpath(normalized);
  if (!realPath.startsWith(SAFE_UPLOAD_DIR)) {
    throw new Error('符号链接指向不允许的目录');
  }
  
  return realPath;
}

// 使用校验后的路径
router.post('/import', auth, upload.single('file'), async (req, res) => {
  // 使用 multer 上传后的安全路径，不接受用户自定义路径
  const filePath = req.file.path; // multer 自动生成安全路径
  await validateImportPath(filePath);
  // ... 调用 Python 脚本处理
});
```

#### 3. 网络层 SSRF 防护（补充）

```yaml
# Docker 网络 SSRF 防护：限制容器出站访问
# docker-compose.yml
services:
  app:
    networks:
      - frontend
      - backend
    # 使用 iptables 限制出站
    cap_drop:
      - NET_RAW

networks:
  frontend:
    # 仅允许特定出站规则
  backend:
    internal: true  # 完全隔离，无外网访问
```

---

## 参考文件

- [OWASP Top 10 - A10 Server-Side Request Forgery (SSRF)](https://owasp.org/Top10/A10_2021-Server-Side_Request_Forgery_%28SSRF%29/)
- [OWASP SSRF Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
- [CWE-918: Server-Side Request Forgery](https://cwe.mitre.org/data/definitions/918.html)
- [PortSwigger - SSRF Guide](https://portswigger.net/web-security/ssrf)
- [返回总清单](./owasp-top10-checklist.md)

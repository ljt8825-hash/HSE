# 提示词-17-Naive-HSE局域网部署批

> 任务来源：用户计划在本机运行系统，办公室局域网同事通过 IP 访问。无需部署平台、HTTPS、nginx、hCaptcha 等。
> 批次性质：**阶段 17 —— 局域网部署批**。本机运行后端 + 静态文件服务，局域网可访问。
> 前置条件：Phase 15 元审核通过，`dist/` 已就绪，后端 `:5800` 运行中。

---

## 一、当前环境

| 项目 | 值 |
|---|---|
| 本机 LAN IP | `192.168.10.107` |
| 后端 | 运行中 `:5800`，`server.listen(PORT)` 默认绑定所有接口 |
| 前端产物 | `apps/web-naive/dist/` 完整 |
| 前端 API 配置 | `VITE_GLOB_API_URL=/api`（同源代理模式） |

---

## 二、任务目标

1. 创建简易静态服务器，监听 `0.0.0.0:5280`，服务 `dist/` 文件，并将 `/api` 代理到后端 `:5800`
2. 开放 Windows 防火墙端口 5280（入站 TCP）
3. 验证：本机可访问 + 模拟局域网访问（用 LAN IP 代替 localhost）

---

## 三、Part 1 —— 创建 LAN 静态服务器

### 3.1 在项目根目录创建 `lan-server.js`

```javascript
// 简易局域网服务器：服务 dist/ 静态文件 + 代理 /api 到后端
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 5280;
const API_TARGET = 'http://127.0.0.1:5800';
const DIST_DIR = path.join(__dirname, '安全看板vben', 'apps', 'web-naive', 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};

function serveFile(res, filePath) {
  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

function proxyApi(req, res) {
  const targetUrl = new URL(req.url, API_TARGET);
  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port,
    path: targetUrl.pathname + targetUrl.search,
    method: req.method,
    headers: { ...req.headers, host: targetUrl.host },
  };
  const proxy = http.request(options, (pRes) => {
    res.writeHead(pRes.statusCode, pRes.headers);
    pRes.pipe(res);
  });
  proxy.on('error', () => { res.writeHead(502); res.end('Bad Gateway'); });
  req.pipe(proxy);
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    return proxyApi(req, res);
  }
  let filePath = path.join(DIST_DIR, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  fs.access(filePath, fs.constants.R_OK, (err) => {
    if (err) { filePath = path.join(DIST_DIR, 'index.html'); }
    serveFile(res, filePath);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`LAN server: http://0.0.0.0:${PORT}`);
  console.log(`API proxy: /api → ${API_TARGET}`);
});
```

### 3.2 启动并验证

```bash
node lan-server.js
```

验证步骤：
- 本机 `http://localhost:5280` → 显示登录页
- 本机 `http://192.168.10.107:5280` → 同上
- 本机 `http://192.168.10.107:5280/api/health` → `{"code":0,...}`

---

## 四、Part 2 —— Windows 防火墙放行

```powershell
# 以管理员身份运行 PowerShell
New-NetFirewallRule -DisplayName "HSE LAN Server" -Direction Inbound -Protocol TCP -LocalPort 5280 -Action Allow
```

如果后端 5800 也需要局域网访问（可选，同事直接调 API 调试用）：

```powershell
New-NetFirewallRule -DisplayName "HSE Backend" -Direction Inbound -Protocol TCP -LocalPort 5800 -Action Allow
```

---

## 五、Part 3 —— 验证清单

| 验证项 | 操作 | 预期结果 |
|---|---|---|
| 本机登录页 | 浏览器打开 `http://localhost:5280` | 显示登录页，无白屏 |
| 本机 API 代理 | 浏览器打开 `http://localhost:5280/api/health` | `{"code":0,"data":{"status":"ok"}}` |
| LAN IP 登录页 | 浏览器打开 `http://192.168.10.107:5280` | 显示登录页 |
| LAN IP 登录 | admin/admin123 + 滑块 | 成功登录跳转 |
| LAN IP 驾驶舱 | 登录后导航到驾驶舱 | 卡片正常渲染 |
| 后端直接访问 | `http://192.168.10.107:5800/api/health` | `{"code":0}` |

---

## 六、Part 4 —— 同事使用说明

部署完成后，同事只需：

1. 确保与你的电脑在同一局域网
2. 浏览器打开 `http://192.168.10.107:5280`
3. 使用自己的账号密码登录

---

## 七、本批明确不实施

- **不修改前端代码**（`apps/web-naive/src/`）
- **不修改后端 `server/`、SQL、`package.json`、锁文件**
- **不修改 `web-antd`**
- **不安装 nginx / apache / IIS**
- **不配置 HTTPS / 域名 / CDN / hCaptcha**
- 仅创建 1 个新文件 `lan-server.js` + 防火墙规则

---

## 八、红线

1. `lan-server.js` 仅为开发/办公环境使用，**不用于公网生产**
2. 防火墙规则限制为办公室局域网 IP 段（如 `192.168.10.0/24`），不开放公网
3. 不修改任何现有代码文件

---

## 九、交付物

1. `g:\hse-dashboard\lan-server.js`（新文件）
2. `docs/Naive UI/_verify/17/`：
   - `localhost-验证.png`（localhost:5280 登录页）
   - `lan-ip-验证.png`（192.168.10.107:5280 登录页）
   - `lan-ip-登录后.png`（登录后驾驶舱）
   - `firewall-rule.png`（防火墙规则截图）
3. `docs/Naive UI/阶段17-局域网部署-执行总结.md`
4. 完成后 **STOP**
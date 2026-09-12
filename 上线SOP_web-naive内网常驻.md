# web-naive 当前机「内网常驻试用」上线 SOP

> 适用场景：在现有 Windows 开发机上，让公司内网同事通过浏览器访问 HSE 系统的 web-naive 试点前端，做上线前试用验证。
> 核实日期：2026-09-02

## 一、现状确认（已实地核实，不是从零开始）

| 组件 | 端口 | 状态 | 监听地址 |
|---|---|---|---|
| web-naive 前端 (Vite dev) | 5173 | ✅ 已在运行 (PID 17900) | `0.0.0.0`（已对全网开放） |
| 后端 API (server/app.js) | 5800 | ✅ 已在运行 (PID 35044) | `0.0.0.0` |
| PostgreSQL | 5432 | ✅ 系统服务运行中 | `0.0.0.0` |

关键架构事实：
- 前端 `vite.config.ts` 已配置 dev 代理：`/api → http://127.0.0.1:5800`，并自动移除 `origin` 头。
- 因此**内网用户浏览器的 `/api` 请求由 Vite 在开发机本地转发到 5800**，浏览器侧无跨域问题。
- 结论：**只需开放 5173 一个端口给内网**，后端 5800 不需要对内网开放。

## 二、你需要手动执行的「上线」操作（在开发机上）

### 步骤 1：放行 Windows 防火墙 5173 入站
以**管理员**身份打开 PowerShell，执行：
```powershell
New-NetFirewallRule -DisplayName "HSE-web-naive-5173" -Direction Inbound -Protocol TCP -LocalPort 5173 -Action Allow -Profile Any
```
> 若公司域策略管控防火墙，可能需联系 IT 协助放行，或临时关闭专用网络防火墙（仅试用期间）。

### 步骤 2：获取本机内网 IP
```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback' } | Select-Object IPAddress, InterfaceAlias
```
记录形如 `192.168.x.x` / `10.x.x.x` / `172.16.x.x` 的地址（即同事能访问的地址）。

### 步骤 3：把访问地址发给同事
```
http://<你的内网IP>:5173
```
默认账号：`admin` / `admin123`

### 步骤 4（建议）：服务化常驻，防止关窗口/登出后掉线
当前前后端是 Console 会话，关闭启动窗口可能中断。两种加固方式任选：

**方式 A — PM2（轻量，推荐试用）**
```powershell
npm i -g pm2
# 后端
pm2 start "node server/app.js" --name hse-backend --cwd "G:/hse-dashboard"
# 前端 web-naive（dev 常驻，绑定 0.0.0.0）
pm2 start "pnpm vite --mode development --host 0.0.0.0" --name hse-webnaive --cwd "G:/hse-dashboard/安全看板vben/apps/web-naive"
pm2 save
```
> Windows 上 PM2 不支持 cluster 模式（用默认 fork 即可）；开机自启可用 `pm2-windows-service` 或 `nssm` 注册。

**方式 B — nssm 注册为 Windows 服务（最稳）**
下载 nssm，分别注册 HSE-Backend / HSE-WebNaive 两个服务，指向 `node.exe` 及其参数。

### 步骤 5：验证
- 让一位同事（或你用手机连同一内网 WiFi）打开 `http://<内网IP>:5173`
- 登录后能正常加载页面、菜单、数据
- 按 F12 看 Network：所有 `/api/...` 请求返回 200，无 CORS 报错
- 后端健康检查：`http://<内网IP>:5173/api/health` 应返回 `{"code":0,"status":"ok"}`（经前端代理）

## 三、注意事项 / 坑

1. **防火墙是最大拦路虎**：进程已绑 0.0.0.0 不代表内网能连，必须显式放行入站规则，否则同事会连不上（超时）。
2. **dev server 不是生产级**：Vite dev 有 HMR WebSocket、性能开销大、无安全加固。仅用于短期试用；正式上线请走下方 Docker + Nginx 生产构建方案。
3. **当前后端 `NODE_ENV=development`**：日志详细、CORS 宽松。转正式时改 `production` 并收紧 `CORS_ORIGINS`。
4. **web-naive 是试点版**：功能完整度可能低于 web-antd 正式版，确认试用范围。
5. **重启开发机后需重新拉起**：未做服务化前，重启后前后端不会自动起。

## 四、正式上线建议（与当前试用解耦）

当前机试用稳定后，正式部署推荐走已备好的 Docker 方案（详见 `deploy/README.md`、`deploy/deploy.sh`）：
- 一台 Linux 服务器（≥4核/8G）+ Docker Compose
- 生产前端镜像当前构建的是 **web-antd 正式版**（`deploy/frontend/Dockerfile`）；若正式上线也要用 web-naive，需先把该 Dockerfile 的 `build:antd` 与 dist 路径改为 web-naive
- 根 `Dockerfile` 基础镜像为 `node:20`，而项目要求 `node>=22.18`，正式构建前建议统一改为 `node:22-bookworm-slim`
- 部署：`cp deploy/.env.production.template .env.production` → 填强密码/JWT/加密密钥 → `./deploy/deploy.sh`

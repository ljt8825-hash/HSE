# 本机 loopback 访问生产 CORS 白名单放行 生产发布记录

> 类别：②交付报告
> 日期：2026-09-28
> 授权：用户显式「请帮我配置 localhost 的 CORS 白名单」= 单次生产操作（改生产 `.env` CORS_ORIGINS + 重启 5876，不动生产表/计划任务定义/WPS/身份链）

## 批次

将生产 `server/.env` 的 `CORS_ORIGINS` 追加 `http://localhost:5876`、`http://127.0.0.1:5876`，解决本机浏览器直连 loopback 访问生产（`考核分析中心→指标分析→安全指标` 验收时）被 CORS 拒绝的问题。

- 原：`CORS_ORIGINS=http://localhost:5173,...,http://127.0.0.1:5666`（含 dev 来源，无 5876）
- 新：追加 `,http://localhost:5876,http://127.0.0.1:5876`，保留全部原有来源
- 生效方式：`app.js` 在进程启动时读 `process.env.CORS_ORIGINS` 切分白名单（app.js:134，non-origin 允许 / CORS_ALLOW_ALL 逃生 / 不在表内 callback(Error) 500 拒绝），改 `.env` 后需重启 5876 加载

## 执行

| 步骤 | 结果 |
|------|------|
| ① 备份 | `server/.env`（4,702 B）→ `.workbuddy/tmp/cors_env_backup_20260928/.env` |
| ② 改配置 | 仅改 `server/.env:22` CORS_ORIGINS 一处，追加两来源 |
| ③ 重启 | UAC 脚本 `cors_restart_admin.ps1`（目标任务 `HSE-Backend-5876`，node app.js）：oldPid 15056 → 19:49:16 停/端口释放 → newPid 3040 → 19:49:36 health 200，taskState=4(Running)，result=OK |

## 验收（node http 直连 127.0.0.1:5876 带 Origin 头，全 PASS）

| Origin | 结果 |
|--------|------|
| 无 Origin（curl/Postman） | 200，ACAO 缺席（正常） |
| `http://127.0.0.1:5876` | 200，`Access-Control-Allow-Origin: http://127.0.0.1:5876` ✓ |
| `http://localhost:5876` | 200，`Access-Control-Allow-Origin: http://localhost:5876` ✓ |
| `http://localhost:5173`（原 dev 保留） | 200，ACAO 回显 ✓ |
| `http://evil.example.com`（未在白名单） | 500 拒绝，无 ACAO ✓ 白名单未松动 |

## 边界

- 仅改生产 `server/.env` CORS_ORIGINS 一行 + 停起既有计划任务 `HSE-Backend-5876` 一次；**未改**计划任务定义 / 生产表 / WPS / 身份链 / 后端代码 / 前端 dist；全程只读零写库。
- 留痕：`.workbuddy/tmp/cors_env_backup_20260928/.env`（回滚备份）+ `cors_restart_summary.json`。

## 遗留

- 本机浏览器经 `http://localhost:5876` 或 `http://127.0.0.1:5876` 访问生产已放行；若浏览器仍见 CORS 报错，多为旧会话缓存，强刷（Ctrl+F5）即可。
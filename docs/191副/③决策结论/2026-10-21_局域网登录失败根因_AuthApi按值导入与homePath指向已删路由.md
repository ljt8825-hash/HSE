# 局域网/本机登录失败根因：AuthApi 按值导入 + homePath 指向已删除路由

- **日期**：2026-10-21
- **归属对话**：当前会话
- **类别**：③决策结论

## 结论 / 决策

登录失败由两个独立缺陷叠加造成，均非网络或账号问题：

1. **前端启动即中断**：`web-naive/src/store/auth.ts` 把纯类型命名空间 `AuthApi` 按值导入（`import { AuthApi }`）。仓库 `verbatimModuleSyntax: true` 会保留该运行时导入，浏览器报 `SyntaxError: The requested module '/src/api/core/auth.ts' does not provide an export named 'AuthApi'`，`main.ts → bootstrap` 未完成，页面永久停在全局 splash「HSE 安全看板」。
2. **登录后必 404**：后端 `server/routes/vben-compat.js` 的 `/api/user/info` 固定返回 `homePath: '/hse/todos'`，但工作树已删除 `router/routes/modules/hse-todos.ts` 与 `views/hse/todos/`。已登录用户访问 `/`、`/auth/login` 均被守卫重定向到 `/hse/todos` → 404。

## 依据

- 浏览器 console 原文：`SyntaxError: The requested module '/src/api/core/auth.ts' does not provide an export named 'AuthApi'`；页面停在 splash，`/auth/login` 亦不可达。
- `internal/tsconfig/base.json` 启用 `isolatedModules` + `verbatimModuleSyntax`，类型命名空间按值导入不会被擦除。
- 全量扫描 317 个 Vite 已编译模块，确认除 `store/auth.ts` 外无其他 `AuthApi` 引用；重启 dev server 后该报错消失（此前为旧模块缓存）。
- `git status` 显示 `hse-todos` 路由/页面为未提交删除；`preferences.ts` 的 `defaultHomePath` 已改为 `/overview/leader-dashboard`，与 `hse.ts` 路由一致。

## 修复

- `store/auth.ts` 改为 `import type { AuthApi } from '#/api/core/auth';`。
- `vben-compat.js` 的 `homePath` 改为 `/overview/leader-dashboard`。
- 重启开发前端 5173（改为 `--host 0.0.0.0`，局域网可达）与开发后端 5888（`PORT=5888 AI_PROVIDER=ollama AI_TIMEOUT_MS=300000`）。
- 验证：`http://192.168.10.101:5173/` 与 `/api/health` 均 200；`/auth/login` 无 console 报错，已登录态直接落 `/overview/leader-dashboard`。

## 影响范围

- 开发栈 5173/5888 与后续生产 5876 共用 `server/routes/vben-compat.js`，生产重启后同样生效（本次未启动/重启生产）。
- 凡新增/删除前端路由，必须同步检查后端 `homePath` 与 `preferences.app.defaultHomePath`，避免登录后 404。

## 待验证 / 开放问题

- 生产 5876 当前未运行（`HSE-Backend-5876` 计划任务 Ready），正式系统需用户以管理员启动后再验收。
- 局域网 5173 若被其他设备拒绝，需放行 Windows 防火墙入站 TCP 5173（需管理员）。
- `AI Generate Smoke` 超时属 AI 生成链路问题，与登录无关，未在本次处理。

## 是否已同步索引

- [x] 已更新 `_index.md`

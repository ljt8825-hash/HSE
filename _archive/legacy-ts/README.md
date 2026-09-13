# 遗留 TypeScript / 双栈代码归档（2026-09-13）

- 原 `server/src/` 目录（旧 TS 源码：config / controllers / middleware / routes / types / utils + `app.ts`）及配套 `server/tsconfig.json`。
- 当前运行时唯一真源为 CommonJS 的 `server/app.js` + `routes/` / `controllers/` / `services/`（`package.json` 的 `start`/`dev`=`node app.js`，`build`=`node --check app.js`）。
- 本目录仅作历史参考，禁止再启用。

## 重要：未移动项（仍在原位的活跃测试配置）

- `server/jest.config.js`、`server/jest.integration.config.js` 是 `npm test` / `npm run test:integration` 实际使用的**活跃配置**，保持原位未动。
- `package.json` 中的 `legacy:*` 脚本（`legacy:build/start/dev/type-check`）仍引用 `tsc` / `ts-node src/app.ts` / `dist/src/app.js`；`src/` 与 `tsconfig.json` 归档后，这些脚本将不再可用——是否同步删除 `legacy:*` 脚本，见交付说明（下一步可选）。

## 可追溯

- `server/src`（git 忽略 / 未跟踪）与 `server/tsconfig.json`（已跟踪）已物理迁移至此。
- 本次归档为纯物理搬迁 + 已跟踪文件变更，未改任何运行时代码。
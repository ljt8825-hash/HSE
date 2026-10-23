# 交付报告 / 执行记录 归档

> 用途：记录模块交付、数据库变更、测试验收、生产放行等关键执行。

- **日期**：2026-09-26
- **归属对话**：当前会话（web-dev 修复任务）
- **类别**：②交付报告

## 交付/变更概要

解决 web-naive 前端 `pnpm run build:naive` 全量构建（turbo）失败的问题。此前核心库（`@vben-core/icons/shared/typings` 等）构建报 `Failed to import module "unrun"`，随后 web-naive 生产打包又报 **xlsx 无法解析**。修复后全量构建 **11/11 任务通过**，web-naive dist 重建成功。

两个缺依赖根因（均为「源里有 import / 构建链需要，但依赖未声明或未装」）：

| 依赖 | 角色 | 症状 | 修复 |
|------|------|------|------|
| `unrun` | `tsdown@0.22.4` 的 **optional peerDependency** | core packages 构建 `Failed to import module "unrun"`（lockfile 仅声明 `unrun: '*'`，未解析任何实际版本，pnpm `autoInstallPeers` 未自动补装） | 根 workspace `pnpm add -D unrun -w`（装到 `^0.3.1`） |
| `xlsx` | web-naive **源码直接 import**（`material-price/index.vue`、`driver/_shared/readViolationExcel.ts`）但一直**未在 package.json 声明**，仅靠手工 junction 可用 | `pnpm add` 重装后 pnpm 修剪掉 `.pnpm/xlsx@0.18.5` 实包 → rolldown 打包 `failed to resolve import "xlsx"` | `pnpm add xlsx@0.18.5 --filter @vben/web-naive`（正式声明并安装） |

## 关键文件 / 变更

- `安全看板vben\package.json`：根 devDependencies 增 `unrun ^0.3.1`
- `安全看板vben\apps\web-naive\package.json`：dependencies 增 `xlsx 0.18.5`
- `安全看板vben\pnpm-lock.yaml`：随上两项更新（含 xlsx/unrun 的真实解析项）

无业务代码改动、无表结构变更、无写库逻辑变更。

## 关键操作与注意事项

- **生产边界**：全程未触碰 5876 生产端口 / 生产 `.env` / `HSE-Backend` 计划任务 / WPS 写。生产进程 PID 8792 保持不变。
- **EBUSY 陷阱**：`pnpm add -D unrun -w` 全量重装时，因运行中的 vite dev 持有 `sass-embedded-win32-x64` 的 dart-sass 文件，报 `EBUSY: resource busy`。处置：临时停止非生产 dev 进程（5173 vite + 5888 后端）→ 完成安装 → 按原配置重启（vite 注入 `VITE_PROXY_TARGET`/`VITE_UPLOADS_PROXY_TARGET=http://127.0.0.1:5888`）。后续 `--filter` 定向安装 xlsx 未再触发 EBUSY。
- **node 版本 WARN**：tsdown 要求 `node ^22.18 || >=24.11`，本机 node v22.16.0 仅 WARN 不阻塞；tsx/rolldown 构建正常。
- 二次 `pnpm add` 后，vite dev 因 lockfile 变化触发依赖重优化，本次已正常完成（`optimized dependencies changed. reloading`）。

## 验收 / 放行状态

- 状态：已完成（dev 环境验证通过 + 全量构建通过 + dist 重建）
- 依据：
  - `pnpm exec turbo build --filter=@vben-core/typings --filter=@vben-core/shared --filter=@vben-core/icons --force` → 3/3 成功，`(unrun)` 作为配置加载器正常加载（此前卡点）。
  - `pnpm run build:naive` → **11 成功 / 11 总**，web-naive `✓ built in 19.95s`，`dist.zip` 生成，含 `dist/js/xlsx-*.js` 独立 chunk。
  - dev 监听恢复：5888 / 5173 就绪，生产 5876 保持。

## 遗留事项

- 本修复只作用于 **开发/构建环境**（node_modules + lockfile + 产物）。生产 5876 无需重启（无后端代码改动）；生产前端 dist 随下次常规发布流程重建即可（同样一次性安装新依赖）。
- 建议后续在 CI/部署机同步执行一次 `pnpm install` 以落锁 `unrun` 与 `xlsx`；避免再次出现「手工 junction 依赖清理后失效」的隐性缺依赖。

## 是否已同步索引

- [x] 已更新 `_index.md`
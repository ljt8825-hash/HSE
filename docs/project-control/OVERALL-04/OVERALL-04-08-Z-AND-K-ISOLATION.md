# OVERALL-04-08｜专项 Z 与 K 类文件隔离

## 一、专项 Z：H5 培训扩展（14 项，全部隔离）

### 清单

**修改（11）**：`grid-mobile-cloudflare/_pages_deploy/{check.app.js,check.html,login.html,version.json}`、`grid-mobile-cloudflare/frontend/{check.app.js,check.html,login.html,version.json}`、`grid-mobile-cloudflare/worker/{index.js,storage/index.js,wrangler.toml}`
**新增（3）**：`grid-mobile-cloudflare/frontend/train.app.js`、`grid-mobile-cloudflare/_pages_deploy/train.app.js`、`grid-mobile-cloudflare/worker/training.js`

### 隔离判定

- **不进 C5**（C5 候选已核验零 grid-mobile 文件）、不进任何普通批次；
- 关联文档（10-27 设计方案、10-29 待验收、10-29 候选名单风险）在 C6 文档批，仅为证据链，**不构成部署授权**；
- 稳定性：OVERALL-03 两次观测三项全等（sha `593cb2b0…`/`6ab63de9…`），备份快照可随时回溯；
- **处置纪律**：不修改、不提交、不部署；待培训 H5 验收通过后由总控单独裁决「提交+部署解耦」的两步走。

## 二、K 类文件逐项定性（本次全部取得证据，K 清零）

### K-1 `server/scripts/prod-launch.cjs`（M）→ **已定性：S1.6 生产语义修复，待单独授权固化**

本次实读完整 diff（+10 行）：在 `require(app.js)` 之前注入 `process.env.NODE_ENV='production'`，注释链完整（P3-16/S1.6，2026-10-27）。
- **背景**：`server/.env` 的 `NODE_ENV=development` 供 5882 dev 实例共用，dotenv 不覆盖已存在 env → 此前 5876 生产进程真实运行在 development 语义（内存降级 + 日志 env=development），对应 `docs/191副/④风险待办/2026-10-25_生产5876内存模式与cron漏执行待授权处置.md`；
- **风险评估**：修复方向正确且必要（红线 2b 对象），但**触及生产启动器**——不得混入 C4；建议独立微批 `fix(ops): prod-launch NODE_ENV 注入` 由总控单独授权，固化后需与计划任务 HSE-Backend 重启窗口协同验证；
- **与 C4 的 logger/scheduler 修复同属 S1.6**，但风险等级不同故分批。

### K-2 `dsh-gpt-agent-preset/`（未跟踪目录）→ **已定性：第三方工具资产，建议不入库**

实读内容：`LICENSE`、`README.md`、`agent.cordis.yml`、`gpt-guardrails.mjs`、`install-preset.py`、`tests/`——GPT 代理预设工具，与 HSE 业务无关。建议：移出仓库目录或加入 .gitignore（均需授权，本节点不改）。

### K-3 `30000,description` → **已定性：0 字节残留**（实测 `wc -c` = 0）

J 类临时残留，不建议提交，不删除。

### K-4（B0-07 遗留补充）`install-scrapling-skill.sh`、`test-write.txt`、`risk02_err2.txt`、`.acl-recovery/`、`.codegraph/`、`acl-out/`

J 类临时/调试产物（B0-03 已定性），全部不建议提交、不删除、保持现状。

## 三、隔离总表

| 项 | 批次归属 | 可固化 |
|---|---|---|
| Z 14 项 | 专项，独立裁决 | ❌ 待验收 |
| prod-launch.cjs | 独立微批（S1.6 运维） | ⚠️ 待单独授权 |
| dsh-gpt-agent-preset | 不入库 | —（处置待授权） |
| 30000,description + J 类 6 项 | 不入库 | — |

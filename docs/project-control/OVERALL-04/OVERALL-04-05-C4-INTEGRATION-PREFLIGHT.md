# OVERALL-04-05｜C4 集成杂项预审

## 一、候选文件清单（11 项代码，全部 M）

| 路径 | 改动实质（本次实读 diff） | 归属 |
|---|---|---|
| `server/services/wpsGridSyncScheduler.js`（+34/−11） | **P3-16/S1.6**：console.log → `logger.info` 结构化日志（「日志断流假象」修复）；**不触碰引擎本身** | C4 |
| `server/utils/logger.js` | **P3-16/S1.6**：winston File→DailyRotateFile 真轮转（修复 `combined-%DATE%.log` 字面量 49MB 不切分）——纠正 B0-06 的 C1 归属 | C4 |
| `server/routes/alerts.js` | 告警 P2 修复（缺 is_deleted 等） | C4 |
| `server/routes/overview.js` | 总览统计修改（该文件存在 P0-2 直读 Excel 残留表问题，属后续 B-9 治理对象，本批只固化既有修改） | C4 |
| `server/routes/hse-chain.js`（+20/−?） | 检查链 hse_tasks 相关 | C4 |
| `server/services/statisticsService.js`（+6/−2） | 统计 | C4 |
| `server/services/warningCenterService.js`（+55/−?） | 预警中心 | C4 |
| `server/services/workflowService.js`（+35/−?） | 工作流 | C4 |
| `server/services/siteMgmtService.js` | 现场管理 | C4 |
| `安全看板vben/apps/web-naive/src/locales/langs/{en-US,zh-CN}/page.json` ×2 | 菜单/页面文案 | C4 |

## 二、冻结边界核验（本次实测）

| 冻结项 | 结果 |
|---|---|
| `wpsGridPullEngine.js`（REVERSE_WRITE_ENABLED=false:40、18 列哈希:162） | **零改动**（`git diff` 为空）✅ |
| 花名册权威=飞书 `tbl2ZHdXX5d8R12a` | M 列表无 roster 相关文件 ✅ |
| H5 生产飞书链路（grid-mobile-cloudflare） | **不在 C4**（全部归专项 Z，见 04-08）✅ |
| 桌面端 WPS 同步 vs H5 链路 | scheduler/logger 属桌面端 WPS→PG 同步链，与 H5 Worker→飞书链路物理分离，无混淆 ✅ |

## 三、依赖

- `wpsGridSyncScheduler.js` require `utils/logger.js` → **两者必须同批**（已同批）；
- C4 与 C1/C2/C3 无编译依赖（app.js 已移入 C3），**可独立固化**；
- 建议顺序：C1 → C2 → C3 → **C4**。

## 四、测试要求与风险

- 测试：固化前跑全量 jest 基线比对（43 套件，既有 8 失败为基线，不得新增失败）；
- 风险：`overview.js` 属 P0-2 高危文件（直读 Excel 残留表）——本批固化其**既有未提交修改**不扩大问题，但固化说明必须标注「P0-2 未清零，B-9 治理对象」；
- `logger.js` 真轮转切换后旧 `%DATE%` 字面量日志文件仍在磁盘（49MB/94MB），不入库、不清理（gitignore 覆盖）。

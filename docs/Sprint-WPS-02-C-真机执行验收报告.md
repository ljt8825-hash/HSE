# Sprint-WPS-02-C 真机执行验收报告

- 日期：2026-09-08
- 结论：**WPS_REAL_TEST = PASS**
- 数据源开关：`WPS_GRID_DATA_SOURCE=true` **已允许并已开启**；`WPS_GRID_SYNC=false` 保持关闭（历史下行同步属 WPS-03，且用户正在手动补录，严禁调度器并发写板）
- 前置状态：上一轮 `BLOCKED_BY_CREDENTIALS` → 本轮用户已配置真实 `WPS_APP_ID` / `WPS_APP_SECRET` / `WPS_API_SIGNATURE`（报告全程不打印 Secret）

---

## 一、本轮发现的真机问题与最小修复（共 5 处）

| # | 问题 | 修复 | 文件 |
|---|---|---|---|
| 1 | `WPS_DBSHEET_SHEET_ID=2` 实为「仪表盘」，真实数据表是 sheet 3 | `.env` 2→3 | `server/.env` |
| 2 | `getSchema()` 用了不存在的 `/sheets` 端点（404） | 改为官方 `GET /v7/coop/dbsheet/{file_id}/schema` | `services/wpsClient.js` |
| 3 | 批量删除 `POST records/delete` 404 | 改为官方 `POST records/batch_delete`，body `{records:[字符串id]}` | `services/wpsClient.js` |
| 4 | `createRecords` 返回的 `fields` 是 JSON 字符串，DTO 转换崩溃（PC 新增会成功但报错） | 兼容字符串形态解析 | `services/wpsClient.js` |
| 5 | **WPS 分支列表漏传 `reportStatus` 筛选参数**（筛选返回全表） | 路由调用补传该参数 | `routes/site-mgmt.js` |

另做映射修正（用户换板导致）：`昵称→昵称2`、`检查日期→日期`（`wpsGridSyncService.js` / `wpsFieldMap.js`），并修正「编号=自动编号」的错误备注（实为 MultiLineText，业务编号 L2572 保持原值）。

## 二、真实 Schema（全部来自真实 WPS API，非推断）

数据表：`cn229thwalDs` / sheet **3**（339 条历史 → 本轮验收期间用户手动补录至 2063 条）。

**本轮幂等补建的 6 个业务字段（真实返回 Field ID）**：

| WPS字段 | Field ID | fieldType | readable | writable | 附件 |
|---|---|---|---|---|---|
| 巡查人员ID | X | MultiLineText | 是 | 是 | 否 |
| 上报状态 | Y | MultiLineText | 是 | 是 | 否 |
| 车辆类型 | Z | MultiLineText | 是 | 是 | 否 |
| 违章类型结果 | a | MultiLineText | 是 | 是 | 否 |
| 是否需要整改 | b | MultiLineText | 是 | 是 | 否 |
| 整改人 | c | MultiLineText | 是 | 是 | 否 |

补建的 3 个链接镜像列：三违照片链接(d) / 整改后照片链接(e) / 示意图链接(f)。原生附件列（J/K/L/Q，Attachment 类型）返回 `{fileName,uploadId,source:upload_ks3}` 无直接 url，v1 链接镜像设计正确。

已回填 `docs/WPS-网格巡查字段映射表.md`（仅真实 API 返回数据）。

## 三、验收项逐条判定

| 验收项 | 判定 | 证据 |
|---|---|---|
| 真实凭证 | **PASS** | 认证通过，真实 WPS 响应 |
| 真实 Schema | **PASS** | 官方 schema 端点，20 字段明细 |
| 6 个字段真实存在 | **PASS** | 幂等补建后 schema 复核确认 |
| Field ID / Type 已确认 | **PASS** | 见上表，已回填映射表 |
| Create | **PASS** | 6 字段按真实 Schema 写入成功 |
| Get | **PASS** | 创建后回读一致 |
| Update | **PASS** | 含 rectifier 有值→清空真机保存为空 |
| Delete / Batch Delete | **PASS** | 单删+批删，修复端点后通过 |
| 图片附件 | **PASS** | 单图/多图/无图/详情/列表/异常过滤，DTO `{url,name,fieldId}`，无 DISPIMG（仅注释提及），无 Secret 泄漏 |
| filter-options | **PASS** | reportStatuses 来自真实 WPS 数据 |
| reportStatus 筛选 | **PASS** | 修复 #5 后：筛选 `已上报` 仅命中测试记录（修复前返回全表 2064） |
| PC 12 项回归 | **PASS** | API 层 15/15 + 浏览器级 7/7（截图存档）；其中「清空」未真机执行（会清空 2063 条业务数据），以代码路径等价性+批删/删除同源双写佐证，**此单项为佐证级而非真机级** |
| WPS/PG 双写隔离 | **PASS** | `WPS-TEST-DUAL-WRITE` 11/11：WPS=1、PG=0（行数恒 1724）、同步映射表零写入、删除/清空路径不触 PG |
| Record ID 字符串 | **PASS** | 全链路字符串处理，20 位大数 `12345678901234567890` 无精度损失，代码无 `Number()/parseInt(recordId)` |
| employeeId 真机落库 | **PASS** | 身份链 登录→realName→employeeResolver→6709(张万恒)，WPS 实际保存 `巡查人员ID="6709"` |
| 前端无法伪造 inspectorEmployeeId | **PASS** | 提交 FAKE 被后端解析结果覆盖/拒绝 |
| 错误凭证不 fallback PG | **PASS** | 缺凭证实例（5801）三端点全部显式 `code:-2 禁止静默回落` |
| Secret 不泄露 | **PASS** | 全程未打印/未写入代码与文档；DTO 泄漏扫描通过 |
| 离线测试继续通过 | **PASS** | 11/11（含全部修复后重跑） |
| 测试数据清理完成 | **PASS** | WPS-TEST / WPS-TEST-IMAGE / WPS-TEST-DUAL-WRITE 已删除，PG 零残留，临时探针脚本/token/日志已清理 |

## 四、身份链与语义边界（全项确认）

- WPS Record ID：仅技术 ID，字符串处理，不作业务主键 ✓
- 编号/inspectionId：`L2572` 等历史编号保持原值，禁止转换为 Record ID ✓
- nickname（昵称2）：仅历史展示字段，不作身份键 ✓
- violatorEmployeeId：保持 RESERVED，未做任何姓名自动匹配/绑定 ✓
- GPS/时间/地点：保持 RESERVED，未开发 ✓
- fail-closed：查无此人 / 同名多人（刘秀芬×5）均拒绝写入 ✓
- `GET /api/current-employee` 与 WPS 写入值一致（张万恒→6709）✓

## 五、遗留事项（不阻塞 PASS）

1. **「清空」按钮未真机执行**（保护业务数据），佐证级 PASS；WPS-03 联调时可安排在测试板验证。
2. `WPS_GRID_SYNC=false` 必须保持，直到：① 用户手动补录完成；② WPS-03 历史迁移方案评审通过。否则 15 分钟对账会与手动补录并发写板。
3. PC 页面新增走 fail-closed（admin 未绑定花名册被拒），正式代录需绑定花名册身份后使用。
4. 用户手动补录仍在进行中（WPS 板 2063 条且持续增长），本轮所有「总数类」断言已按动态值设计。

## 六、WPS-03 准入

**允许进入 WPS-03（历史数据迁移）**：真机 Schema/CRUD/附件/筛选/双写隔离/身份链/护栏全部真机验证通过，迁移工具链（wpsClient 已验证的 list/create/update/batch_delete + schema）可直接复用。

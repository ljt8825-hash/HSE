# Sprint-WPS-02-C WPS 真机配置与正式切换验收报告

> 阶段：WPS 真机配置 + Schema 核验 + CRUD + 附件 + 筛选 + PC 页面 + 双写验证，输出「允许/禁止开启 WPS 数据源」结论。
>
> 结论：**`WPS_REAL_TEST = BLOCKED_BY_CREDENTIALS`** —— 真实凭证缺失，按 Sprint 第三节硬闸门**停滞于真机阶段**，未执行任何真实 API / Schema / CRUD / 附件 / PC 回归，**未伪造任何通过结果**，亦未进入 WPS-03。
>
> 上线判定：**禁止开启 `WPS_GRID_DATA_SOURCE=true`。**

---

## 1. 凭证状态

| 环境变量 | 状态 | 说明 |
|---|---|---|
| `WPS_OPENAPI_BASE` | 已填 | `https://openapi.wps.cn` |
| `WPS_APP_ID` | **空** | 未配置 ← 真机硬闸门 |
| `WPS_APP_SECRET` | **空** | 未配置 ← 真机硬闸门 |
| `WPS_DBSHEET_FILE_ID` | 已填 | `dgEXT2FACrM7BgbNq1gvrx85BsAXpdMwN` |
| `WPS_DBSHEET_SHEET_ID` | 已填 | `2` |
| `WPS_API_SIGNATURE` | 已设 | `false` |
| `WPS_TIMEOUT_MS` | 未设（默认） | 建议按需补 `30000`，非阻塞 |

- `wpsClient.isConfigured()` 因缺 `APP_ID` / `APP_SECRET` 返回 **false**。
- 凭证只应置入服务端 `server/.env`；未写入代码 / Git / 报告 / 前端 / 日志。本报告不含任何凭证值。

## 2. Schema 实际结果

- **未执行真实 Schema 读取**（无凭证 → `WPS_REAL_TEST=BLOCKED_BY_CREDENTIALS`）。
- 当前 WPS 列结构仍以 `server/services/wpsGridSyncService.js` 中的 `.dbt` 注释（17 文本 + 4 附件图 + 3 链接镜像）为据，**未经真实 API 证实**。
- 真实 `fieldId / fieldType / 可读 / 可写 / 附件类型` 均 **PENDING**，未编造。

## 3. 六个业务字段 Field ID

| 业务字段 | WPS字段 | Field ID | 类型 | 是否已建列 |
|---|---|---|---|---|
| inspectorEmployeeId | 巡查人员ID | **PENDING** | PENDING | ❌ |
| reportStatus | 上报状态 | **PENDING** | PENDING | ❌ |
| vehicleType | 车辆类型 | **PENDING** | PENDING | ❌ |
| violationTypeResult | 违章类型结果 | **PENDING** | PENDING | ❌ |
| needRectification | 是否需要整改 | **PENDING** | PENDING | ❌ |
| rectifier | 整改人 | **PENDING** | PENDING | ❌ |

- 建议建列 `text`，但**最终类型必须以真实 Schema 为准**；本轮未在 WPS 板补建、也未向映射表写入编造的 field ID。
- `docs/WPS-网格巡查字段映射表.md` 中对应行保持 **PENDING**（待凭证解锁后回填）。

## 4. CRUD 测试结果

**未执行真实 CRUD。** 未使用 `WPS-TEST` 数据，未运行 Schema→List→Get→Create→Get→Update→Get→Delete→List 链路（全部 BLOCKED_BY_CREDENTIALS）。

离线（打桩）能力复核：`create` 新 6 字段写入、`update` 修改 reportStatus/整改并清空、`get`/`list` 回读、`remove`/`clearAll` 归零均通过（见 §12）。

## 5. 图片测试结果

**未执行真实附件测试。** `WPS-TEST-IMAGE` 未创建；单图/多图/空图/详情/列表/异常附件/URL、Token/Secret 不泄露、不解析 DISPIMG 均 **PENDING**。代码路径已按 `normalizeAttachments → {url,name,fieldId}` 就绪（Sprint-WPS-02-B 未改动）。

## 6. filter-options

**未执行真机。** `GET /api/site/grid-records/filter-options` 在 WPS 分支调用 `gridWps.filterOptions()`，离线确认 `reportStatuses` 非空；真机返回与 `GET /grid-records?reportStatus=已上报` 真机筛选均 **PENDING**。

## 7. PC 页面回归

**未执行。** 未设置 `WPS_GRID_DATA_SOURCE=true`，未做 打开/列表/分页/排序/筛选/reportStatus筛选/新增/编辑/删除/批量删除/清空/图片查看 12 项。「页面看到的是 WPS 而非 PG 数据」**未验证**。

## 8. 双写验证

**未执行真机。** 未创建 `WPS-TEST-DUAL-WRITE`，未核对 `WPS=1, PG=0`，未检查 PG repository 触发 / 历史下行同步 / 重复数据 / `grid_inspection_records` 写入 / 删除 / 清空。

代码层面：`site-mgmt.js` WPS 分支仅写 WPS、不写 PG、不触发下行推送（保持无隐式双写），但**真机未证实**。

## 9. Record ID 验证

**未执行真机。** 字符串 Record ID 的 Get/Update/Delete/批量删除未真实验证。前端已兼容 `string|number`（Sprint-WPS-02-A 整改），代码无恙，真机复核 **PENDING**。

## 10. employeeId 真机落库

**未执行真机。** 链路 `登录用户 → 认证上下文 → currentEmployeeContext → employeeResolver → employeeId → WPS 巡查人员ID` 未在真实 WPS 验证。

离线确认：前端传 `FAKE` 不生效，WPS 实际保存后端解析 `EMP-001`，伪造不可覆盖；找不到员工/同名多人时走 fail-closed（见 Sprint-WPS-02 已实现）。

## 11. 安全检查

| 项 | 状态 |
|---|---|
| 不修改登录/auth/JWT/users / Vben Core | 未改（✔） |
| 不新增 npm 依赖 / 不新建自定义 UI 组件 | 未做（✔） |
| 不重写 PC 页面 / 不迁移历史 339 条 / 不做人员绑定 | 未做（✔） |
| violatorEmployeeId 自动匹配 / 历史编号转换 | 未做（✔） |
| 不解析 DISPIMG | 未做（✔） |
| 不把 WPS Record ID 当业务编号 / 姓名不当永久身份键 | 保持（✔） |
| 前端决定 inspectorEmployeeId | 禁止且未放开（✔） |
| Token / Secret 泄露 | 无凭证、无日志打印（✔） |
| 未随 app.js 热更新 | 相关改动需重启后端加载（Node 无热更新，保持运行） |

## 12. 离线测试

- **20/20 复核通过**：inspectorEmployeeId readwrite、5 新字段映射与 byPg、violatorEmployeeId/GPS 保持 reserved、create/update/get/list/remove/clearAll、reportStatus 筛选、filterOptions.reportStatuses 非空、伪造 FAKE 不覆盖后端 employeeId。
- `node --check` 两者通过：`wpsFieldMap.js`、`gridInspectionRepository.js`。
- 临时验证脚本已删除，无残留测试数据。

## 13. 失败项

本 Sprint **无“测试结果”，全部真机项因凭证缺失而被阻塞，非“失败/FAIL”**。若强行对照验收清单，则为「未执行」而非「未通过」，且明确不等于 PASS。

## 14. 上线判定

**`WPS_REAL_TEST = BLOCKED_BY_CREDENTIALS`**（未达 PASS，也不应标记 FAIL——而是无法开展）。

第十四节验收清单逐项均为「未执行/未证实」，缺任何一项都不得判 PASS。未编造凭证、未伪造 Schema/CRUD/图片/PC/双写结果。

## 15. 是否允许 `WPS_GRID_DATA_SOURCE=true`

**否（禁止）。**

- 直接原因：`WPS_APP_ID` / `WPS_APP_SECRET` 为空 → 即使开关置 true，也会被 `gridDataSource` 判为 **misconfigured** 并显式报错（Sprint-WPS-02-A 整改后的正确护栏，非缺陷），不会静默回 PG。
- 开关当前无需人为改回，保持未开启/缺省即 `'pg'`。
- 到达「允许开启」的解锁条件：提供真实 WPS 凭证 → 真机 Schema（6 字段真实存在）→ 真机 CRUD + 图片（`WPS-TEST` / `WPS-TEST-IMAGE`）→ filter-options → PC 页面 12 项回归 → 双写（`WPS-TEST-DUAL-WRITE`）→ Record ID 字符串 → 前端不可伪造巡查身份 → 安全性检查 → 离线继续通过，方可判 `WPS_REAL_TEST = PASS` 并临时开启验证。

## 后续行动

1. 由凭证持有方在服务端 `server/.env` 填入 `WPS_APP_ID` / `WPS_APP_SECRET`（可选 `WPS_TIMEOUT_MS=30000`），重启后端。
2. 重跑本 Sprint：补建 6 真机列 → 真实 Schema 回填映射表 → 按本章节逐项真机执行 → 出最终结论。
3. **在真机解锁前，不得进入 WPS-03（历史数据迁移/人员绑定/图片绑定/编号转换/历史治理）。**

---

> 本轮唯一结论：真实 WPS 凭证缺失，真机整体 **BLOCKED_BY_CREDENTIALS**，`WPS_GRID_DATA_SOURCE=true` 保持禁止开启，未进入 WPS-03。
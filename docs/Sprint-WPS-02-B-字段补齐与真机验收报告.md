# Sprint-WPS-02-B 字段补齐与真机验收报告

> 阶段：WPS 业务字段补齐 + 真机上线准备
>
> 原则：审计 → 最小修改 → 离线验证 → 出报告。不改登录/auth/JWT、不改 `users` 表、不改 Vben Core、不新增依赖、不重写页面、不迁移历史数据。
>
> 真机判定：**`WPS_REAL_TEST = PENDING`**（`WPS_APP_ID` / `WPS_APP_SECRET` 仍为空，未具备真实凭证；不伪造真机结果）。

---

## 1. 执行摘要

- 完成 WPS 业务字段补齐的代码与离线验证：`inspectorEmployeeId` 由 `reserved` 提升为 `readwrite`，并新增 5 个 PC 台账实际写入字段（上报状态 / 车辆类型 / 违章类型结果 / 是否需要整改 / 整改人）。
- `gridInspectionRepository` 读取/写入统一走 pg↔wps 映射，`list` 支持 reportStatus 筛选、`filterOptions` 返回 reportStatuses、`create` 写入新字段并以后端 `employeeId` 固定 `巡查人员ID`、`update` 修复 `byBiz(pg)` 查找 bug。
- 离线验证 42/42 通过（字段映射 / CRUD / reportStatus 筛选 / filter-options / employeeId 写真 / 前端伪造不可覆盖 / 无双写）。
- WPS 真实 Schema 联调、图片真机、PC 页面真机回归因凭证缺失**全部 PENDING**，未伪造通过。

**上线判定：`WPS_GRID_DATA_SOURCE=true` 目前仍不得开启。** 缺 WPS 凭证（会判 misconfigured）+ WPS 板缺 6 个业务列未真实验证。仅达到「代码与离线能力就绪」，未达到「WPS 可承载正式业务」。

---

## 2. Schema 审计

### 2.1 数据源
- 目标 .dbt：`WPS_DBSHEET_FILE_ID=dgEXT2FACrM7BgbNq1gvrx85BsAXpdMwN`、`WPS_DBSHEET_SHEET_ID=2`。
- WPS 真实列存于 `server/services/wpsGridSyncService.js` 的 `FIELD_MAP`（17 文本 + 4 附件图 + 3 链接镜像镜像列）与 `PG_ONLY_COLUMNS`。

### 2.2 审计表

| 业务字段 | WPS实际字段(来自同步注释) | 类型 | 当前模式 | 是否存在 |
|---|---|---|---|---|
| inspectorEmployeeId | 巡查人员ID | text | reserved → **readwrite** | ❌（需建列） |
| reportStatus | 上报状态 | text | （无） → **readwrite** | ❌（需建列） |
| vehicleType | 车辆类型 | text | （无） → **readwrite** | ❌（需建列） |
| violationTypeResult | 违章类型结果 | text | （无） → **readwrite** | ❌（需建列） |
| needRectification | 是否需要整改 | text | （无） → **readwrite** | ❌（需建列） |
| rectifier | 整改人 | text | （无） → **readwrite** | ❌（需建列） |

> 说明：以上 6 列目前在 WPS 板上无对应列（位于 `PG_ONLY_COLUMNS`）。字段 ID / 类型需真实 Schema 复核后回填到 [WPS-网格巡查字段映射表.md](./WPS-网格巡查字段映射表.md)。**未做真实 Schema 调用（凭证缺失）。**

---

## 3. 代码完成（Field Map 变化）

### 3.1 `wpsFieldMap.js`
- `inspectorEmployeeId`：`mode: reserved → readwrite`，且限定「只允许后端 `currentEmployeeContext.employeeId` 写入」。
- 新增 5 个业务字段（均 `readwrite`）：`reportStatus / vehicleType / violationTypeResult / needRectification / rectifier`，各自带 pg ↔ wps 映射。
- 为全部有 PG 对应列的字段补充 `pg` 属性，新增 `byPg()` 查询，导出 `FIELD_MAP, byBiz, byWps, byPg`。
- `violatorEmployeeId / GPS / 经纬度` 保持 `reserved`，未放开。

### 3.2 `gridInspectionRepository.js`
- 读取统一 `_mForPg(pg)`（`wpsFieldMap.byPg` 优先，兜底 `wpsGridSyncService.FIELD_MAP`，保留检查日期 date 归一）。
- 写入统一 `_lookup(biz|pg)`，避免 create（传 biz）与 update（传 pg）命名空间不一致。
- `wpsRecordToDto` 输出车辆类型/上报状态/违章类型结果/是否需要整改/整改人。
- `list` 新增 `reportStatus` 筛选；`filterOptions` 返回 `reportStatuses`（不再为空）。
- `create`：`_put('inspectorEmployeeId', ctx.employeeId)`，前端传入的 inspector 身份证数字段被忽略；写入 5 个新业务字段。
- `update`：修复原 `byBiz(pg)` 错误（pg 列名被当 biz 查）→ 统一查找；reportStatus/needRectification/rectifier/vehicleType 等可更新、空值可清空。

---

## 4. employeeId 写入验证（离线）

- `resolveCurrentEmployee(登录用户)` → `context.employeeId` → 写入 WPS「巡查人员ID」。
- 离线断言：前端伪造 `inspectorEmployeeId: 'FAKE'` 传入，WPS 实际保存的为后端解析 `EMP-001`，**伪造不可覆盖**。
- `violatorEmployeeId` 不写入（保持 reserved）。✓

## 5. reportStatus 验证（离线）

- create 写 `上报状态=已上报` → WPS 存储 → DTO 读回一致。
- update 改 `待上报` → 读回一致。
- `list({reportStatus:'已上报'})` 正确筛选。
- `filter-options` 返回 `["未上报","已上报"]`（非空）。✓

## 6. PC 字段验证（离线）

- vehicleType / violationTypeResult / needRectification / rectifier 走「PC→API→Repository→FieldMap→WPS」完整 create/update/get/list 映射，无静默丢弃。✓

## 7. CRUD 测试

| 项 | 状态 | 说明 |
|---|---|---|
| 真实 Schema → List → Get → Create → Get → Update → Get → Delete → List | **PENDING（真机）** | 凭证缺失 |
| 离线 CRUD（打桩 WPS） | 通过 | 42/42 断言 |
| 测试标识 | - | 真机执行时须用 `WPS-TEST` / `WPS-TEST-IMAGE` |

## 8. 图片测试

- **PENDING（真机）**：图片1/2/3、整改后照片读写、详情无丢失、缩略图/多图/空图/异常图/附件URL、不泄露 Token/Secret、不解析 DISPIMG。
- 代码路径：`adapter.normalizeAttachments → { url, name, fieldId }` 已就绪，未改动。

## 9. filter-options 验证

- `GET /api/site/grid-records/filter-options` 在 WPS 分支调用 `gridWps.filterOptions()`（site-mgmt.js §1527-1533）；离线命中断言 `areaTeam / gridLevel / reportStatus` 均有值，reportStatus 非空。真机复核 **PENDING**。

## 10. PC 页面回归

- **PENDING（真机，需临时 `WPS_GRID_DATA_SOURCE=true`）**：打开/列表/分页/排序/筛选/reportStatus筛选/新增/编辑/删除/批量删除/清空/图片查看。本轮未做（凭证缺失，且按硬约束只在真机通过后临时开开关）。
- 前端字段名未改动（约束遵守），仅在数据源切换后按既有字段正常工作。

## 11. WPS/PG 双写检查

- WPS 分支（`site-mgmt.js`）在 `ds==='wps'` 时仅写 WPS、不写 PG、不触发下行推送，保持 `WPS=1, PG=0`。
- 离线断言：WPS 新增记录 store 有、PG 未新增（无 PG 写调用）。
- 真机双写复核 **PENDING**。

## 12. Record ID 检查

- 前端已兼容 `string | number`（Sprint-WPS-02-A）。WPS Record ID 为字符串透传。真机复核 **PENDING**。

## 13. 离线测试

- 42/42 断言通过（见 §4-§11），临时脚本已运行后删除，无残留测试数据。

## 14. 静态检查

- `node --check` 两者通过：`wpsFieldMap.js`、`gridInspectionRepository.js`。
- 未改登录/auth/JWT/users、未加依赖、未改前端、未改 PG 原路径、未迁移历史。

## 15. 剩余 PENDING

| 项 | 状态 |
|---|---|
| WPS 板补建 6 列（巡查人员ID/上报状态/车辆类型/违章类型结果/是否需要整改/整改人） | 未建 |
| 真实 Schema 读取并回填字段 ID/类型 | PENDING |
| 真机 CRUD（WPS-TEST） | PENDING |
| 真机图片测试（WPS-TEST-IMAGE） | PENDING |
| filter-options 真机返回 | PENDING |
| PC 页面真机回归（12 项） | PENDING |
| WPS/PG 真机无双写复核 | PENDING |
| `WPS_REAL_TEST` | **PENDING** |

## 16. 上线阻断项

1. **WPS 凭证缺失**：`WPS_APP_ID` / `WPS_APP_SECRET` 为空 → `WPS_GRID_DATA_SOURCE=true` 会自动判 misconfigured（阻断项 1 整改后的正确护栏，非缺陷）。
2. **WPS 板缺 6 个业务列**：需在 .dbt 补建「巡查人员ID / 上报状态 / 车辆类型 / 违章类型结果 / 是否需要整改 / 整改人」。
3. **真机验收未执行**：CRUD/图片/PC 回归全部 PENDING。

## 17. 是否允许开启 `WPS_GRID_DATA_SOURCE=true`

**否（禁止）。**

依据 §19「上线判定」：Schema 真机通过、6 字段真机可写、CRUD/图片/filter-options/PC 回归、无双写、employeeId 真机落库、Record ID 字符串、离线测试——除「离线测试」外均未真机证实。不得以「代码已写完」作为开启依据。

## 18. 下一阶段建议

1. 配置真实 WPS 凭证到服务端 `.env`（不入库、不提交、不进报告），重启后端。
2. 在 WPS .dbt 补建 6 个业务列（类型 text），核对字段 ID/类型，回填映射表。
3. 执行真机 Schema → CRUD（`WPS-TEST` 标识，Create 必含巡查人员ID+姓名+日期+网格等级+三违行为+违章人信息+reportStatus+vehicleType+violationTypeResult+needRectification+rectifier）→ 图片（`WPS-TEST-IMAGE`）→ filter-options → PC 页面 12 项回归 → 双写/清空复核。
4. 全部真机通过后，设 `WPS_GRID_DATA_SOURCE=true` 短暂开启验证，再决定正式开启。
5. 本轮**不得进入 WPS-03 历史数据迁移/人员绑定/历史图片绑定/编号转换/数据治理**；待真机解锁后再开展。

---

> 结论：本轮完成 **字段补齐与离线能力就绪**；真机验收整体 **PENDING**，尚不具备上线条件，`WPS_GRID_DATA_SOURCE=true` 保持关闭。
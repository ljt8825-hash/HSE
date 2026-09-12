# Sprint-WPS-02-A 验收与整改报告

> 阶段：WPS 真机验收 + 数据模型完整性检查 + PC 台账一致性检查 + 上线前阻断项整改
>
> 原则：审计 → 找问题 → 最小修改 → 验证 → 出报告。不改登录/auth/JWT、不改 `users` 表、不改 Vben Core、不新增依赖、不重写页面、不改 PostgreSQL 原路径。

---

## 1. 执行摘要

- **阻断项 1（WPS 开关行为）已整改**：`WPS_GRID_DATA_SOURCE=true` 但凭证不完整时，从「静默回落 PG」改为「返回显式配置错误（misconfigured），禁止偷偷回 PG」。三态判定 + `node --check` + 离线断言 11/11 通过。
- **阻断项 7（Record ID 字符串）已整改**：前端批量删除/编辑不再 `typeof === 'number'` 强过滤，记录 id 类型扩展为 `string | number`（PG 数字不变、WPS 字符串透传）。
- **阻断项 2/3/4（employeeId 保存、PG-only 字段）审计确认**：WPS 当前无法保存 inspector/violator employeeId（板上无对应列）；`reportStatus` 为两处台账页面真实筛选/创建依赖，WPS 无列。
- **阻断项 5（stats）审计结论**：`/api/site/stats` 统计对象为「三违(violations)/消防/网格区域(grid_areas)」，**不读取 `grid_inspection_records`**；网格台账页也不调用 stats → **不存在「列表 WPS / 统计 PG」不一致**，无需改动。
- **阻断项 6（clear）审计结论**：正式前端调用 `DELETE /api/site/grid-records/all`，后端存在该路由且已含 WPS 分支 → **已一致**，无需改动。（此前报告误写「POST /grid-records/clear」，以实际代码为准。）
- **阻断项 8/9（图片/真机 CRUD）**：WPS 凭证不完整（缺 `WPS_APP_ID` / `WPS_APP_SECRET`，仅有 FILE_ID/SHEET_ID）→ **真实联调 PENDING**，不伪造成功。

**上线判定：目前 `WPS_GRID_DATA_SOURCE=true` 仍为不完整配置（凭证缺失 → 会自动判 misconfigured 并显式报错），且 inspectorEmployeeId 无法保存、reportStatus 等字段 WPS 无列 → 本阶段「暂时禁止开启 WPS」，进入 WPS-03 前需先整改（见 §19）。**

---

## 2. 原 Sprint-WPS-02 遗留问题

| 遗留项 | 本阶段状态 |
|---|---|
| 登录用户 → employeeId 严格解析（fail-closed） | 已验证（离线 8→11 项），见 §7 |
| `WPS_GRID_DATA_SOURCE` 开关 | **已整改**（三态），见 §4 |
| WPS 仓储层 / CRUD 分支 | 已存在；真机未验证（凭证缺失） |
| 身份解析失败禁止创建 | 已验证 |
| inspector/violator employeeId 仅 `wpsFieldMap` 预留，WPS 无列 | **确认阻断**，见 §8 |
| stats 是否已接入 WPS 分支 | 审计确认：stats 不读台账，无此问题，见 §10 |
| clear 接口语义是否与前端一致 | 已确认一致，见 §11 |

---

## 3. 审计结果

### 3.1 后端 WPS 代码（核对）

| 文件 | 结论 |
|---|---|
| `services/wpsClient.js` | `isConfigured()` 要求 APP_ID/APP_SECRET/文件ID/表ID 四者齐全；当前缺 APP_ID/APP_SECRET → false |
| `services/wps/wpsErrors.js` | 六类错误模型，对外只回 safeMessage ✓ |
| `services/wps/wpsFieldMap.js` | `inspectorEmployeeId(wps 巡查人员ID)` 与 `violatorEmployeeId(wps 违章人员ID)` 为 **mode:'reserved'**，板上无列 |
| `services/wps/wpsDbsheetAdapter.js` | `normalizeAttachments/list/get/create/update/delete` 齐全 |
| `services/wps/gridInspectionService.js` | Sprint-01 管理控制器服务（admin 只读/演练），与台账 CRUD 不重叠 |
| `services/wps/gridDataSource.js` | **原为二值，已改三态**，见 §4 |
| `services/wps/gridInspectionRepository.js` | DTO/WPS 分支齐全；`list` 不接受 `reportStatus`、`create` 不写 employeeId（reserved 被跳过） |
| `routes/site-mgmt.js` | 6 处 `isWpsGridDataSourceEnabled()` 已换 `gridDataSourceMode()` 三态守卫 |
| `routes/current-employee.js` / `currentEmployeeContext.js` / `employeeResolver.js` | 身份链完整，见 §7 |

### 3.2 搜索词核对

- `WPS_GRID_DATA_SOURCE`：仅 `gridDataSource.js` 定义、`site-mgmt.js` 消费（已改三态）。
- `grid-records` 路由：GET(list) / GET(filter-options) / PUT(:id) / POST(create) / DELETE(batch) / DELETE(all)。均含 WPS 分支。
- `stats`：站点统计，不读台账表，见 §10。
- `clearAll`：仅 WPS 仓储清空，对应 `DELETE /grid-records/all`。

---

## 4. 阻断项 1 整改：WPS 开关三态（已完成）

**整改前（不允许的上线行为）**

```
WPS_GRID_DATA_SOURCE=true + 凭证不完整 → 静默回 PostgreSQL  ← 管理员以为切了 WPS，实际还在 PG
```

**整改后**

```
WPS_GRID_DATA_SOURCE=false            → 'pg'             （明确用 PG，生产默认）
WPS_GRID_DATA_SOURCE=true + 凭证完整    → 'wps'            （必须用 WPS）
WPS_GRID_DATA_SOURCE=true + 凭证不完整  → 'misconfigured'  （返回显式配置错误，禁止回 PG）
```

- `gridDataSource.getGridDataSourceMode()` 返回三态；`isWpsGridDataSourceEnabled()` 保留，仅当 `mode==='wps'` 为 true。
- `site-mgmt.js` 新增 `gridDataSourceMode(res)` 守卫：`misconfigured` 时直接 `res.json(error(-2, WPS_CONFIG_ERROR))` 并返回（调用方 `return`），**绝不落入 PG 逻辑**。
- **生产默认仍然是 `WPS_GRID_DATA_SOURCE=false` → 未开启 WPS 时现有行为完全不变。**

修改文件：`services/wps/gridDataSource.js`、`routes/site-mgmt.js`。
验证：`node --check` 通过；离线断言 3 项（§16）。

---

## 5. WPS Schema 检查结果

- **未执行真机 Schema**：凭证不完整（缺 APP_ID/APP_SECRET）→ PENDING。
- 基于 `wpsFieldMap.FIELD_MAP` 静态核对：当前板具备的 column 以 `readwrite/read/readonly` 标注为准；`reserved` 项（巡查人员ID / 违章人员ID / GPS 预留等）**板上无对应列**。
- 需在真机后核验：字段 ID 与 FIELD_MAP 中 `wps` 名一致、附件字段形态、`编号`(record_no) 是否自动编号。

---

## 6. WPS CRUD 真机测试结果

**PENDING —— 未执行。**
原因：`.env` 中仅配置了 `WPS_DBSHEET_FILE_ID / WPS_DBSHEET_SHEET_ID`，**缺少 `WPS_APP_ID` / `WPS_APP_SECRET`** → `isConfigured()=false`。

待凭证就绪后的测试顺序（脚本：`server/scripts/_wps_01_integration_test.cjs` 按此执行）：

```
Schema → List → Get → Create → Get → Update → Get → Delete → List 确认删除
```
测试数据统一前缀 `WPS-TEST`，结束后删除全部测试数据，禁止残留。

---

## 7. employeeId 身份链结果（目标 A）

- 身份链：`req.user.realName → currentEmployeeContext → employeeResolver(resolveEmployeeByName, v_employee_current 严格一对一) → employeeId`。
- fail-closed 分支（离线验证通过）：未认证 / 查无 / 重名多候补 / 查询异常 / 无当前任职。
- 对外 `GET /api/current-employee` 只回安全中文提示。
- **身份链实现正确，不得改 `users` 表**。
- 局限：`姓名不是最终人员身份模型`。后续需在不动登录/JWT 前提下建立稳定 `user→employee` 关系（见 §20）。

---

## 8. 阻断项 2/3：employeeId 能否在 WPS 保存

### 8.1 巡查人员（inspectorEmployeeId）—— 阻断
- `wpsFieldMap` 中 `inspectorEmployeeId`(『巡查人员ID』) 为 **reserved**，WPS 板上无此列；
- 后端已解析出 inspector employeeId，但 `create()` 经 `_put` 的 `mode==='readwrite'` 过滤写入，**reserved 被跳过 → 未持久化到 WPS**（仅存姓名/组织/单元/岗位/网格等级快照）。
- 结论：**WPS 当前无法真正保存 `inspectorEmployeeId`** → 属于 §19「WPS employeeId 无法保存」，构成上线阻断。
- 整改路径（待凭证）：在 WPS 板新增『巡查人员ID』列 → `wpsFieldMap` 该行 `mode` `reserved→readwrite` → `create()` 写入 `ctx.employeeId` → DTO 回带。**前端提交的巡查人身份不可覆盖后端解析结果**（已 fail-closed）。

### 8.2 违章人员（violatorEmployeeId）—— 暂不绑定，记录后续
- `violatorEmployeeId`(『违章人员ID』) 同为 reserved，板上无列；
- 现业务**仅姓名/性别/年龄快照**，无法可靠唯一识别违章人员；
- 依约束：**禁止用姓名当 employeeId，禁止重名随机取第一人** → 本阶段不建列、不绑定，保持历史快照；
- 记为 **后续 H5 / 人员选择器阶段的正式建设项**。

---

## 9. 阻断项 4：PG-only 字段对 PC 页面的影响（逐项）

> 数据来源：`apps/web-naive/src/views/site/grid-ledger/index.vue`、`apps/web-naive/src/views/site/violation/ledger.vue`、`src/api/hse/site.ts`。

| 字段 | PG | WPS | PC是否使用 | 是否必须迁入WPS | 结论 |
| -- | -- | -- | ------ | --------- | -- |
| reportStatus | 有 | 无 | **是（筛选 + 新增弹窗 + 编辑白名单）** | 是 | **阻断**：网格台账页与三违台账页均作「上报状态」筛选，WPS 无列 → 筛选失效、下拉为空 |
| vehicleType | 有 | 无 | 是（仅新增弹窗表单） | 业务建议 | 创建字段缺失：WPS 无列 → 创建时不写（静默丢弃） |
| violationTypeResult | 有 | 无 | 是（仅新增弹窗表单） | 业务建议 | 创建字段缺失 |
| needRectification | 有 | 无 | 是（新增弹窗表单 + 编辑白名单，无对应列展示） | 业务建议 | 创建/编辑字段缺失 |
| rectifier | 有 | 无 | 是（新增弹窗表单 + 编辑白名单，无对应列展示） | 业务建议 | 创建/编辑字段缺失 |
| gridId | 有 | 无 | **否（前端无任何引用）** | 否 | 可保留为后续业务字段 |

补充（非该表但相关）：
- `serialNo`（编号列）在 PC 列表展示；WPS 侧 `编号`(record_no) 为自动编号、另有预留 `巡查编号`(inspectionId)，真机需确认展示映射。
- `nickname/group/name/position/gridLevel/violationBehavior/violator*` 等 `readwrite` 字段已映射，WPS 模式下可用。

**结论**：`reportStatus` 为页面真实依赖（筛选）→ 属「PC 页面依赖字段在 WPS 丢失」，构成上线阻断；`vehicleType/violationTypeResult/needRectification/rectifier` 为创建/编辑字段丢失，需补齐（可随批次建列）。`gridId` 不依赖，可不迁。

---

## 10. 阻断项 5：stats 数据源一致性

- `GET /api/site/stats`（`site-mgmt.js`）统计对象 = `memoryStores.violations`（三违）/ `fireEquipment`（消防）/ `gridAreas`（网格区域）+ DB 查询 `grid_areas` 与 `gridCompletionService`。
- 该接口**完全未读取 `grid_inspection_records`**；网格台账列表/两个台账页均**不调用** `/site-mgmt/stats`。
- 因此：**不存在「台账列表 → WPS / 统计 → PG」的数据源不一致**。`stats` 是另一业务域（现场管理统计），与台账记录无交集。
- 结论：**无需改动**。若未来将台账记录纳入某统计口径，再按数据源一致原则处理（不新增台账统计以保持范围）。

---

## 11. 阻断项 6：clear 接口一致性

- 正式前端 `apps/web-naive/src/api/hse/site.ts`：`clearGridInspectionRecords()` → `DELETE /site-mgmt/grid-records/all`。
- 后端 `site-mgmt.js`：`router.delete('/grid-records/all')` 存在，含 WPS 分支（`gridWps.clearAll()`）。
- 结论：**一致，无需改动**。（此前实施报告误写 `POST /grid-records/clear`，实际正式前端为 `DELETE /grid-records/all`，以实际代码为准。）

---

## 12. 阻断项 8：图片联调结果

- **未真机联调（PENDING）**：凭证缺失。
- 代码方向正确：WPS 附件 → `adapter.normalizeAttachments` → url 逗号串 → 前端 `toImageList` 拆数组预览。
- 前端 `imageContent / rectifiedPhoto` 已用 `NImageGroup` 支持多图、空图显示 `-`、占位符(`--/-/无`)过滤。
- 真机需验证：读取图片1/2/3、综合后照片；创建含图记录；编辑不漏图；删除；页面缩略图/点击查看/空图；**附件结构不泄露内部凭证**。

---

## 13. 阻断项 7：WPS Record ID 字符串兼容（已整改）

后端：
- `gridInspectionRepository`：`get/update/remove/list` 全程用 `rec.id` 字符串/透传，无 `Number/parseInt` 强转 → ✓。
- `site-mgmt.js` DELETE WPS 分支：`ids` 按 `String(v)` 过滤，接受字符串 → ✓。

前端（整改处）：
- `src/api/hse/site.ts`：`updateGridInspectionRecord(id: string|number)`、`deleteGridInspectionRecords(ids: Array<string|number>)`、`GridInspectionRecord.id: string|number`。
- `grid-ledger/index.vue` `onBatchDelete`：原 `typeof v === 'number'` 强过滤会丢弃全部 WPS 字符串 id → 改为 `number|string` 透传。

业务上：`WPS Record ID`（`rec.id`）与业务编号 `serialNo` 严格区分，**不将 WPS Record ID 作为业务编号**（除 `编号` record_no 展示列待真机核对）。

---

## 14. PG 历史数据影响检查

- 开关未启用（`WPS_GRID_DATA_SOURCE=false`）时，全部接口仍走既有 PostgreSQL 路径，SQL 与内存路径未改动 → **历史数据与完成率不受影响**。
- 已稳定 PG 路径保持原样；本阶段仅新增/调整 WPS 分支守卫，未触碰台账写入/下行推送逻辑（fire-and-forget `wpsGridSync.onPgRowChanged` 行为不变）。

---

## 15. 双写检查

- WPS 分支（`gridDataSourceMode==='wps'`）：
  - `create`：只写 WPS，**不再写 PostgreSQL、无下行推送**；
  - `list/get/update/delete/clearAll`：只读/只写 WPS。
- PG 分支不触发任何 WPS 写入（除既有 fire-and-forget 下行推送，属 Sprint-01 既有镜像行为，与数据源切换无关）。
- 结论：**无隐式双源/双写**。

---

## 16. 离线测试结果

脚本：`server/scripts/_wps_02_offline_verify.cjs`（在原 8 项基础上新增数据源三态 3 项，**未删除原测试**）。

| 分组 | 断言 | 结果 |
|---|---|---|
| identity fail-closed | 未认证/查无/重名/异常/无任职/成功 | 6 ✓ |
| WPS→DTO 映射 | 字段+日期归一 | 1 ✓ |
| create 禁代录 | 身份失败抛 IdentityError | 1 ✓ |
| **gridDataSource 三态（新增）** | false→pg；true+凭证缺→misconfigured；isEnabled(misconfigured)=false | 3 ✓ |

**结果：11 通过 / 0 失败。** `'wps'` 态需完整凭证，离线无法构造（PENDING）。

---

## 17. 静态检查结果

对所有改动的后端 JS：`node --check` 全部通过：
`routes/site-mgmt.js`、`services/wps/gridDataSource.js`、`services/wps/gridInspectionRepository.js`、`services/currentEmployeeContext.js`、`services/employeeResolver.js`、`routes/current-employee.js`、`services/wps/wpsFieldMap.js`、`services/wps/wpsDbsheetAdapter.js`、`services/wpsClient.js`。

前端改动（`site.ts`、`grid-ledger/index.vue`）为最小二进制兼容调整（字符串 id 透传），已人工静态核对；未变动依赖与锁文件。

---

## 18. 修改文件清单

| 文件 | 修改 | 阶段 |
|---|---|---|
| `server/services/wps/gridDataSource.js` | 二值→三态 `getGridDataSourceMode()`；misconfigured 禁止静默回 PG | Sprint-02-A |
| `server/routes/site-mgmt.js` | 新增 `gridDataSourceMode(res)` 守卫；6 处分支改三态；misconfigured 显式报错 | Sprint-02-A |
| `apps/web-naive/src/api/hse/site.ts` | id 类型 `string\|number`（update/delete/record）；注释 | Sprint-02-A |
| `apps/web-naive/src/views/site/grid-ledger/index.vue` | `onBatchDelete` id 过滤兼容 number/string | Sprint-02-A |
| `server/scripts/_wps_02_offline_verify.cjs` | 新增数据源三态 3 组断言（保原 8 项） | Sprint-02-A |
| `docs/Sprint-WPS-02-A-验收与整改报告.md` | 本报告 | Sprint-02-A |

> 未修改：登录/auth/JWT、`users` 表、Vben Core、数据库结构、既有 PG 路径、锁定文件、历史数据。

---

## 19. 剩余 PENDING / 上线阻断项

**PENDING（待 WPS 凭证后就绪后执行）**
1. WPS 真机 Schema 核对（字段 ID 与 `wpsFieldMap`、附件形态、编号语义）。
2. WPS 真机 CRUD 演练（Schema→List→Get→Create→Update→Delete→List），数据带 `WPS-TEST` 前缀并清空。
3. WPS 图片联调（读取/创建含图/编辑/删除/页面展示/不泄露凭证）。
4. `'wps'` 数据源态真机回归确认（列表中数据来自 WPS）。
5. 重名登录用户在线抽查（`GET /api/current-employee`）。

**阻断项（不整改不开启 WPS / 不进 WPS-03）**
- ❌ inspectorEmployeeId 无法保存（WPS 无『巡查人员ID』列）→ 需建列 + `reserved→readwrite`。
- ❌ PC `reportStatus` 筛选依赖在 WPS 丢失 → 需 WPS 建列并纳入筛选/选项。
- ❌ `vehicleType / violationTypeResult / needRectification / rectifier` 创建/编辑字段 WPS 无对应列 → 建议随批次建列、补 `create/update` 映射。
- ⚠️ WPS 本身不可用（缺 APP_ID/APP_SECRET）→ `true` 会自动判 misconfigured 并显式报错，属安全兜底，但仍构成不可用。

---

## 20. 是否允许开启 `WPS_GRID_DATA_SOURCE=true`

## ❌ B. 暂时禁止开启

理由（满足任一即禁止，本阶段多条命中）：
1. WPS 凭证不完整（缺 APP_ID/APP_SECRET）→ `isConfigured()=false`，即便置 `true` 也只会返回 misconfigured 显式报错，WPS 根本不可用。
2. **WPS employeeId 无法保存**（inspectorEmployeeId 无对应列）。
3. **PC 页面依赖字段在 WPS 丢失**（`reportStatus` 筛选、`vehicleType/violationTypeResult/needRectification/rectifier` 创建/编辑）。
4. WPS CRUD / 图片未真机验证（凭证缺失 → 无法验证）。

进入 WPS-03 前必须先整改：补齐/建列（§19 阻断项）→ 配置 APP_ID/APP_SECRET 等完整凭证 → 真机 CRUD/图片/Schema 通过 → 再开启开关并做 PC 回归。

---

## 21. 下一阶段建议

1. 补齐 WPS 板列并映射：`巡查人员ID`（已后端解析，仅需落列）、`违章人员ID`（后续 H5 期）、`上报状态 report_status`，及创建/编辑字段 `vehicleType / violationTypeResult / needRectification / rectifier`。
2. 配置完整 WPS 凭证（`.env` 服务端，不提交），执行 §19 的 4 项真机联调。
3. 身份最终模型：在不动登录/JWT 前提下，评估为 `users` 增加稳定 `user→employee` 映射（或独立映射表），把「姓名解析」作为过渡项（已在 Sprint-02 报告声明）。
4. 开启开关后：PC 台账 4 大能力（列表/筛选/页码/排序/新增/编辑/删除/清空/导出/导入）逐项回归，且复核 `reportStatus` 筛选在 WPS 下拉有值。
5. 建立历史 339 条数据（含图片/employeeId 沉淀）迁移方案，待开关确认后再行（本阶段不迁移）。
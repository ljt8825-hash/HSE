# HSE-MOBILE-GRID-ARCH-03-P1-VERIFY · 人工真机实证收官报告

> **生成时间**：2026-09-12 19:40 (GMT+8)
> **模式**：STRICT READ-ONLY + 人工外部实证结果整理（AI 侧 0 写）
> **前置报告**：`docs/HSE-MOBILE-GRID-ARCH-03-P1-无云WPS云端缓冲真实链路验证报告.md`
> **前置状态**：`PHASE_HSE_MOBILE_GRID_ARCH_03P1_COMPLETED_WITH_EXTERNAL_DEPENDENCIES`

---

## 0. 工具纪律声明（本回合实锤）

| 红线 | 本回合执行结果 |
|---|---|
| 修改业务代码 | ❌ 未改 |
| 修改 `server/services/wps/*` | ❌ 未改 |
| 修改 `wpsFieldMap.js` / `SYNC_PROJECTION` / `PROTECTED_COLUMNS` / `sync_hash` | ❌ 未改 |
| 修改 `wpsGridPullEngine.js` | ❌ 未改 |
| 修改 `grid_record_sync_map` / `grid_inspection_records` 结构 | ❌ 未改 |
| 新增 PG 字段 / 表 | ❌ 未加 |
| 执行任何业务 DML / DDL | ❌ 未执行（仅 SELECT） |
| 执行 WPS OpenAPI 写操作 | ❌ 未执行（仅 `list_by_page` 只读） |
| 自动创建/修改 WPS 字段 | ❌ 未做 |
| 实现 wpsGridAttribution / client_token / marker / AirScript / Attachment 桥 / 新 API / 新前端 / H5 | ❌ 全部未实现 |
| 修改 users/auth/JWT/.env | ❌ 未改 |
| 修改/停止/重启生产 5876（PID 23396） | ❌ 未触碰 |
| 修改 Task Scheduler「HSE-Backend」 | ❌ 未改 |

**实证脚本（均只读）**：
- `server/scripts/_arch03p1_verify_introspect.cjs`（PG SELECT 内省）
- `server/scripts/_arch03p1_verify_wps_list.cjs`（WPS `list_by_page` 只读列举）

---

## 1. 执行摘要

**一句话结论**：代码层与数据层冻结复核 **全部 PASS**；但人工真机实证（Test A–F）在系统侧 **零证据** —— WPS 总记录数 = 2063（=基线，Δ0），PG `grid_inspection_records` = 2061（=基线，Δ0），无任何表单提交、无新记录、无新 Pull。因此本回合 **不伪造** 任何人工测试结果，将其标记为【未执行（无系统侧证据）】。

**状态机（最终）**：
```
PHASE_HSE_MOBILE_GRID_ARCH_03P1_COMPLETED_WITH_EXTERNAL_DEPENDENCIES
```
> 维持前置状态不变。理由：只读审计 + 冻结复核已 PASS，但人工真机实证（P1-2/3/4/5 真实链路、图片桥、身份桥）尚未产生数据，**既非成功亦非失败，而是依赖未闭环**。任何一项人工实证出现硬阻断时才可升 `BLOCKED`；全部实证 PASS 且身份/图片有可行依据时才可升 `READY_FOR_P2`。

---

## 2. 当前生产状态

| 项 | 实测 | 状态 |
|---|---|---|
| `:5876` 监听 | `TCP 0.0.0.0:5876 LISTENING 23396`（Services/SYSTEM） | 【代码审计PASS】未触碰 |
| 生产 PID 23396 | 存活，无 kill/restart | 【代码审计PASS】 |
| 远端 node 进程 | 24036 / 12680 为已知无害残留（非生产），未误伤 | 【代码审计PASS】 |
| WPS 冻结文件 git 状态 | `server/services/wps*`、`wpsGridPullEngine.js` 仅 `??`（未跟踪），**无 `M` 修改** | 【代码审计PASS】 |
| `.env` | 仅读取，未改（DB_NAME=safety_dashboard，三开关口径未变） | 【代码审计PASS】 |

---

## 3. WPS 表单实际配置结果（Test A）

**标记：【未执行】**

**只读证据**：WPS 文件 `cn229thwalDs` / sheet `3` 只读列举 `total_wps_records = 2063`，与基线 2063 **完全一致（Δ=0）**，最新记录 `createdTime = 2026/09/08 19:11:02`。自 2026-09-08 起 **无任何新记录** 进入 WPS 板。

**判读**：表单视图要么尚未被创建为提交入口，要么已创建但尚无任何手机提交。WPS 侧无任何“表单提交产生的新 Record”。

**需要人工回填的字段（由管理员在 WPS 管理界面完成并抄回）**：
- 表单链接 / form·view ID
- 分享权限（企业内部 / 登录后填写 / 收集填写者信息）
- 实际暴露字段清单
- 实际隐藏字段清单（grid_id / inspector_employee_id / 巡查人员ID / sync 内部字段 / 链接镜像列）
- 是否开启 WPS「创建人/填写者」高级字段

---

## 4. WPS 提交者身份实际结果（Test B）

**标记：【未执行】**

**只读证据**：WPS 字段遍历中，业务 `fields` 仅匹配到 1 个疑似身份类键 `提交时间`（实为业务时间戳列，非系统身份），**未观察到任何 WPS 系统级身份字段**（如 creator / openid / 企业账号 ID）。这是因为 `toCanonicalDto` 仅遍历 `SYNC_PROJECTION`，而 WPS 表单“创建人/填写者”是独立高级字段，不在 `FIELD_MAP` 内，Pull 物理上读不到。

**判定规则（待人工真机提交后套用，禁止先判）**：
- 有稳定唯一 WPS 账号标识（企业账号 ID / openid）→ `IDENTITY_BRIDGE_USABLE`
- 仅姓名/昵称 → `IDENTITY_BRIDGE_WEAK`
- 无法确认提交者 → `IDENTITY_BRIDGE_UNAVAILABLE`

**需人工回填**：每个测试账号的 WPS Record ID、创建人字段原文、是否实名、是否稳定唯一、不同人员是否唯一。

---

## 5. WPS 字段逐字段映射矩阵

> 冻结复核已确认 `FIELD_MAP` / `SYNC_PROJECTION_ORDER` 未变，故 P1 矩阵 **仍然有效**。

### 5.1 18 个冻结 hash 列（= SYNC_HASH_COLUMNS，顺序不可变）

| # | PG 列 | WPS 字段 | 业务含义 | Pull 消费 |
|---|---|---|---|---|
| 1 | nickname | 昵称2 | 历史昵称（非身份） | ✓ |
| 2 | area_team | 分组名称 | 班组 | ✓ |
| 3 | personnel_name | 姓名 | 巡查人员姓名 | ✓ |
| 4 | position | 所属岗位 | 岗位 | ✓ |
| 5 | grid_level | 网格等级 | 网格等级 | ✓ |
| 6 | inspection_date | 日期 | 巡查日期 | ✓ |
| 7 | violation_behavior | 三违行为 | 问题描述 | ✓ |
| 8 | violator_name | 违章人姓名 | 违规人员 | ✓ |
| 9 | violator_gender | 违章人性别 | 违规人员性别 | ✓ |
| 10 | violator_age | 违章人年龄 | 违规人员年龄 | ✓ |
| 11 | signup_today | 当日是否报名 | 报名 | ✓ |
| 12 | marker | 标记 | 标记 | ✓ |
| 13 | is_resubmit | 是否补交 | 补交 | ✓ |
| 14 | upload_time | 提交时间 | 提交时间 | ✓ |
| 15 | serial_no | 编号 | 业务编号 | ✓ |
| 16 | image_content | 三违照片链接 | 问题照片（链接镜像） | ✓ |
| 17 | rectified_photo | 整改后照片链接 | 整改照片（链接镜像） | ✓ |
| 18 | schematic | 示意图链接 | 示意图 | ✓ |

### 5.2 5 个非 hash 业务列（参与同步，不入 hash）

`report_status`(上报状态) / `vehicle_type`(车辆类型) / `violation_type_result`(违章类型结果) / `need_rectification`(是否整改) / `rectifier`(整改人) —— 均有 PG 列，Pull 正常消费。

### 5.3 四处已知缺口（冻结红线内，本阶段禁止靠改 FieldMap 解决）

| 缺口 | WPS→PG 现状 | 影响 |
|---|---|---|
| **G1 身份/网格** | `巡查人员ID`→pg`'-'`；`所属网格`→pg`'-'`；`grid_id`/`inspector_employee_id` 属 `PROTECTED_COLUMNS`，Pull 硬断言永不写入 | 表单提交 → 这两列恒 NULL |
| **G2 图片 Attachment** | `三违照片链接`/`整改后照片链接` 为 `type:'link'` 链接镜像列；**原生 WPS Attachment 不在 FIELD_MAP**，Pull 只读链接镜像文本 | 表单图片 Attachment 不会流入 PG，除非桥接到链接镜像列（本阶段禁止） |
| **G3 时间/地点** | `巡查时间`(reserved,pg`'-'`)、`定位地址`/`所属网格`/`巡查区域`(reserved,pg`'-'`)，仅 `日期`/`岗位` 同步 | 巡查发生时间、定位地址未同步 |
| **G4 创建人/提交者** | WPS「创建人/填写者」为高级系统字段，不在 `FIELD_MAP`，Pull DTO 物理读不到 | 提交者身份对 PG 不可见，需外部映射（本阶段禁止） |

**结论**：表单产生的“普通 Record”中，**18+5 业务列可被 Pull 完整消费**；但 **G1–G4 四类字段不可消费**，需解冻后独立组件（归属组件 / Attachment 桥 / 身份映射）解决。

---

## 6. 电脑关闭提交测试（Test C）

**标记：【未执行】**

**只读证据**：WPS `total_wps_records = 2063`（Δ0），PG `gir = 2061`（Δ0）。无任何“电脑关闭期间由手机提交”的 WPS 记录存在。

**协议（人工执行）**：在未触碰生产 5876 的前提下，停止一个**非生产/允许停止的本地业务环境**的 PG/HSE，用真实手机经 WPS 表单提交 3–5 条，记录 提交时间 / WPS Record ID / 提交账号 / 是否带照片，确认 WPS 端记录完整存在。

---

## 7. 电脑恢复 Pull 测试（Test D）

**标记：【未执行】**

**只读证据**：`new_records_greater_than_p1_max = 0`；`test_d_new_ids = []`；`test_d_new_in_sync_map = 0`；`gir_max_id = 7192`（=P1 基线）。Scheduler 自然 Pull 未产生任何新记录（因上游 WPS 无新记录可拉）。

**协议（人工执行）**：恢复本地环境，**不人工触发 Pull**，等 Scheduler 自然运行；随后只读比对：
- 恢复前 WPS 测试记录数 = 恢复后 PG 新增数 = sync_map 新增数
- 重复数 = 0
- `inspector_employee_id = NULL` / `grid_id = NULL` 属预期（无归属组件）

---

## 8. 图片 Attachment 测试（Test E）

**标记：【未执行】**

**只读证据**：PG 中无任何新增带图记录；WPS 无新增记录。原生 Attachment 读取能力（官方 `POST /api/v1/openapi/dbt/:file_token/attachment/urls` → `download_url`）本阶段 **不实施桥接**，仅做能力复述。

**待人工回填**：uploadId 是否可读 / source 值 / `download_url` 是否可访问 / 是否需鉴权 / 提交后立即可访问还是延迟 / 电脑恢复后是否仍可访问 / 隔段时间是否仍有效。若无法证明长期稳定 → `IMAGE_URL_LONG_TERM = NEEDS_EXTERNAL_CONFIRMATION`（禁止写 PASS）。

---

## 9. 重复提交基线（Test F）

**标记：【未执行】**

**只读证据**：无同账号重复提交产生的双记录（WPS Δ0 / PG Δ0）。

**协议（人工执行）**：同一真实账号完全相同内容连提 2 次 → 预期 WPS 产生 A≠B 两条 Record；恢复后自然 Pull → PG 新增 2 条、sync_map 对 A/B 各建映射。明确区分 **Pull 幂等**（靠 `(wps_record_id,wps_file_id)` 唯一约束）与 **业务重复提交幂等**（当前无 client_token，不防重复业务提交）。本阶段只建基线，不实现 client_token。

---

## 10. sync_hash 冻结影响验证

**标记：【代码审计PASS】**

**实测依据**（`wpsFieldMap.js` / `wpsGridPullEngine.js`，本次重读确认与 P1 完全一致）：
- `SYNC_PROJECTION_ORDER`（line 107）：前 18 列 = 冻结 hash 口径，注释明确“**顺序与集合不得改动**”。
- `SYNC_HASH_COLUMNS = SYNC_PROJECTION_ORDER.slice(0, 18)`（line 118）。
- `SYNC_HASH_COLUMN_COUNT = 18`（line 120）。
- `canonicalHash`（line 163）：遍历 `SYNC_PROJECTION` 中 `p.hash` 为真的列，固定 18 列顺序，`''≡null`（trim 后空串归一为 null），SHA-256 拼接 `|`。
- `toCanonicalDto` / `toLegacyHashDict`（line 116 / 147）仅遍历 `SYNC_PROJECTION`。

**结论**：`sync_hash` 基于 **`SYNC_PROJECTION_ORDER` 前 18 列的有序投影**，与 WPS `field_id`、WPS 列序、未映射字段**均无关**。

**新增 WPS 字段（如 `client_token`，不入 `FIELD_MAP`）影响判定**：
- `toCanonicalDto` / `toLegacyHashDict` / `canonicalHash` 仅遍历 `SYNC_PROJECTION` → 新字段**静默忽略**
- ⇒ 前 18 列 hash **不变** / 变更检测 **不触发** / `sync_map` **不变** / 既有 2061 条 **不变**
- ⇒ `CLIENT_TOKEN_FIELD_COMPATIBLE_WITH_FREEZE`（技术兼容，**非批准加字段**）

**DB 佐证**：`sync_map` 中 `sync_hash` 非空 = **2061/2061**；`grid_inspection_records` **无 `client_token` 列**；`UNIQUE(wps_record_id, wps_file_id)` 索引存在。

---

## 11. 05-H-0 兼容性结论

**标记：【冻结复核PASS】**

| 复核项 | 结果 |
|---|---|
| FIELD_MAP 未修改 | ✓（line 28–80 重读一致） |
| SYNC_PROJECTION / SYNC_PROJECTION_ORDER 未修改 | ✓（line 107–115） |
| PROTECTED_COLUMNS 未修改 | ✓ `['grid_id','inspector_employee_id']`（line 127） |
| sync_hash 计算逻辑未修改 | ✓ `canonicalHash`（line 163） |
| 前 18 列 hash 未变化 | ✓ 2061 条 sync_hash 全非空，baseline_delta=0 |
| Pull 代码未修改 | ✓ `wpsGridPullEngine.js` 无 `M` |
| sync_map 结构未修改 | ✓ 列定义与基线一致（pg_record_id/wps_record_id/wps_file_id/sync_hash/conflict/last_sync_at…） |
| 既有 2061 条正式数据未变化 | ✓ `gir`/`sync_map` 计数、null 计数、`MAX(id)` 全部 Δ0 |
| WPS-PG-SYNC 仍处 05-H-0 冻结 | ✓ `.env` 三开关口径未变；WPS 记录 Δ0 |

**判读**：人工测试（尚未发生）产生的新 WPS 记录**不会改变历史 2061 条基线 hash**；冻结层 100% 完好。

---

## 12. 03-B 兼容性结论

**标记：【代码审计PASS】**

03-B 四改动（只读复核结论）在当前 05-H-0 冻结下**仍然成立**；本 VERIFY 未改动任何 03-B 相关代码/配置。`POST/PUT/DELETE /grid-records` 仍定位“正式 PG API”，与方案 C 双通道无冲突。

---

## 13. 风险清单

| 风险 | 等级 | 说明 |
|---|---|---|
| R1 身份桥接弱 | 高 | G1/G4：表单提交无法落地 `inspector_employee_id`/`grid_id`，提交者身份对 PG 不可见；仅靠姓名桥接将 fail-closed（重名） |
| R2 图片链路断点 | 高 | G2：原生 WPS Attachment 不进 `FIELD_MAP`，Pull 只读链接镜像文本；无桥接则手机照片不显示 |
| R3 关机归属缺失 | 中 | 无归属组件时新记录 `grid_id`/`inspector_employee_id`=NULL，网格长看不到自己提交 |
| R4 业务重复提交 | 中 | 无 client_token，同内容重提产生重复 PG 记录（Pull 幂等仅防 WPS 侧重拉，不防业务重复） |
| R5 图片 URL 长期稳定 | 中 | 官方 attachment `download_url` 有效期/鉴权未实证，需 NEEDS_EXTERNAL_CONFIRMATION |

---

## 14. 外部依赖（NEEDS_EXTERNAL_CONFIRMATION）

1. **身份**：WPS 表单“创建人/填写者”返回的稳定唯一账号标识（待真机提交后回填）。
2. **图片**：`download_url` 可访问性 / 鉴权 / 有效期 / 长期稳定性（待真机带图提交后回填）。
3. **表单提交窗口**：管理员建表 + 真机提交的可执行时间（用户侧排期）。

---

## 15. 尚未解决问题

- **Test A–F 全部未执行**：系统侧零证据（WPS Δ0 / PG Δ0）。需用户按 §3/6/7/8/9 协议执行并回填数据。
- 一旦回填，需重跑本报告的只读脚本复核 WPS 数 = PG 新增 = sync_map 新增、重复 = 0，再判定状态机升级。

---

## 16. 下一阶段建议（仅建议，不执行）

**P2 前冻结边界（无论本阶段结果，禁止本阶段实现）**：
`wpsGridAttribution` / `client_token` / `marker` 去重 / `AirScript` / `Attachment Bridge` / `WPS row-level permission` / `H5 emergency entry` / 新 API / 新 PG 字段 / 新 PG 表。

**建议推进顺序（待实证回填后）**：
1. 用户执行 Test A–F 并回填 → 本 AI 重跑只读复核。
2. 若身份可得稳定标识 + 图片有可接受路径 + 关机缓冲+恢复 Pull 闭环 → 升 `READY_FOR_P2`。
3. 若身份/图片仅弱依据 → 维持 `COMPLETED_WITH_EXTERNAL_DEPENDENCIES`，P2 优先补 归属组件 + Attachment 桥（与冻结层平级、不改 SYNC_PROJECTION）。
4. 任何硬阻断（表单不可用 / 身份不可得 / 图片不可用 / 新字段破坏冻结 / Pull 无法消费）→ `BLOCKED`。

---

## 附录 A · 只读验证原始证据

### A.1 PG 内省（`_arch03p1_verify_introspect.cjs`）
```json
{
  "db_name": "safety_dashboard",
  "gir_count": 2061, "sync_map_count": 2061,
  "gir_max_id": 7192, "gir_min_id": 4954,
  "inspector_null": 2051, "grid_null": 327,
  "sync_map_conflict": 0, "sync_hash_nonnull": 2061,
  "new_records_greater_than_p1_max": 0,
  "test_d_new_ids": [], "test_d_new_in_sync_map": 0,
  "has_client_token_col": false,
  "baseline_delta": { "gir":0, "sync_map":0, "inspector_null":0, "grid_null":0, "conflict":0, "max_id":0 }
}
```

### A.2 WPS 只读列举（`_arch03p1_verify_wps_list.cjs`）
```json
{
  "wps_file_id": "cn229thwalDs", "wps_sheet_id": 3,
  "total_wps_records": 2063, "baseline_wps": 2063, "delta_vs_baseline": 0,
  "createdTime_present": 2063,
  "observed_creator_like_field_keys": ["提交时间"],
  "max_created": ["2026/09/08 19:11:02", "2026/09/08 19:11:02", "2026/09/08 19:11:02"]
}
```
> 注：`recent_since_*` 字段因 WPS 日期格式为 `2026/09/08`（斜杠）与比较串格式不符产生误匹配，已弃用；以 `total_wps_records=2063 Δ0` 为权威证据。

### A.3 冻结常量位置
- `server/services/wps/wpsFieldMap.js:107` `SYNC_PROJECTION_ORDER`
- `:118` `SYNC_HASH_COLUMNS` / `:120` `SYNC_HASH_COLUMN_COUNT`
- `:127` `PROTECTED_COLUMNS`
- `server/services/wpsGridPullEngine.js:116` `toCanonicalDto` / `:147` `toLegacyHashDict` / `:163` `canonicalHash`

---

## 附录 B · 任务 §13 要求输出清单

| # | 要求项 | 本报告对应 |
|---|---|---|
| 1 | P1 最终状态 | §1：`COMPLETED_WITH_EXTERNAL_DEPENDENCIES` |
| 2 | 所有测试证据 | §2–§12 + 附录 A |
| 3 | WPS Record ID 清单 | 【未执行】待人工回填（WPS Δ0，暂无） |
| 4 | PG 新增记录清单 | 【未执行】`new_records=0` |
| 5 | sync_map 映射清单 | 【未执行】`新增=0` |
| 6 | 图片测试结果 | §8：【未执行】 |
| 7 | 身份字段实际结果 | §4：【未执行】 |
| 8 | 重复提交结果 | §9：【未执行】 |
| 9 | 05-H-0 冻结复核结果 | §11：【冻结复核PASS】 |
| 10 | 是否允许进入 P2 | 否（待人工实证回填后复核） |
| 11 | P2 建议 | §16（仅建议，不执行） |

---

## 状态标签汇总

- 【代码审计PASS】：§2、§10、§11、§12
- 【冻结复核PASS】：§11
- 【人工实证PASS】：无（本回合无数据）
- 【人工实证FAIL】：无（本回合无数据，未造假）
- 【NEEDS_EXTERNAL_CONFIRMATION】：§14（身份/图片/表单窗口）
- 【未执行】：§3（Test A）、§4（Test B）、§6（Test C）、§7（Test D）、§8（Test E）、§9（Test F）
- 【禁止本阶段实现】：§0 红线表、§16 边界清单

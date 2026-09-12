# HSE-MOBILE-GRID-ARCH-03-P2-B1-C-EXT 报告

**任务名称**：WPS Form → Record → Creator 逐提交者身份最小外部验证
**性质**：EXTERNAL CAPABILITY VALIDATION / READ-ONLY VERIFICATION
**执行时间**：2026-09-12 23:03–23:10（GMT+8）
**核心问题**：WPS Form 的实际提交者，是否能够在 WPS Record 的 `creator` 字段中，以**逐提交者、稳定、可区分的 WPS Account ID** 出现？
**最终状态**：**`BLOCKED`**

---

## 〇 一句话结论

被验证的 WPS 文件中**不存在任何 Form（表单）视图**（3 个 Sheet 仅有 `Grid` 类型视图），且全部 2063 条记录的 `created_time` **同属 2026/09/08、无任何新增提交**——即本阶段不存在可用于「逐提交者」验证的测试样本与环境；而创建临时 Form 属于 WPS 写操作、本阶段明令禁止，须由人工在 WPS 端执行且**未发生**。因此按 §三 直接记录 **`BLOCKED`**，不宣称身份链闭合。

同时，本次全量只读复核给出了一个**对后续决策有决定性价值的事实**：生产 WPS 表 2063 条记录中 `creator` 只有 **1 个取值（`1901573333`）**，却对应 **61 个不同姓名**，且 `creator === last_modified_by` **恒真**——这是「creator 为共享/应用账号」的强间接证据（对应 §五 CASE 2 的形态，但因缺少两名真实提交者的受控样本，**不足以升级为 CONFIRMED**）。

---

## §1 测试环境

| 项 | 值 |
|---|---|
| WPS API 基址 | `wps.CONF.base`（应用级 access token，`getAppAccessToken()` 正常） |
| 被读取文件 | `WPS_DBSHEET_FILE_ID = cn229thwalDs`（**正式 WPS 业务表**，来自 `server/.env`，未修改） |
| 被读取 Sheet | `sheetId=3`（名称「表格视图」，29 字段） |
| 读取方式 | 仅 `GET /v7/coop/dbsheet/{fid}/schema` + `POST .../records/list_by_page`（`show_record_extra_info:true`，**只读语义**） |
| 原始对象 | **未使用** `buildRecord()` 归一化对象作为证据；直接解析原始 `data.records[]` 的 `creator` / `last_modified_by` / `created_time` / `last_modified_time` |
| 分页 | 11 页 × 200 = 全量 2063 条，11/11 页 HTTP 200，单页 197–259 ms |
| 独立测试 Form | **未建立**（见 §2） |
| 人工提交 | **0 条**（见 §3） |
| 网络 | 本次沙箱内 `list_by_page` 正常（未复现 P2-B1-B 期间的挂起现象） |

**文件内全部 Sheet / 视图（只读 `getSchema` 实测）**

| Sheet id | 名称 | 字段数 | 视图 |
|---|---|---|---|
| 1 | 数据表 | 1 | 1 个（`Grid` / 表格视图） |
| 2 | 仪表盘 | 0 | 0 |
| 3 | 表格视图 | 29 | 1 个（`Grid` / 表格视图） |

⇒ 全文件 **Form 视图数 = 0**；`formViewPresent = false`。

---

## §2 Form 是否成功建立

**结论：否（未建立）**

- 只读 `getSchema` 实测：文件内 3 个 Sheet 的视图类型全部为 `Grid`，**不存在 `Form` 类型视图**。
- 表单相关只读端点可达性探测（全部只读 GET，均未命中）：

| 端点 | HTTP |
|---|---|
| `/v7/coop/dbsheet/{fid}/sheets/{sid}/views` | 404 |
| `/v7/coop/dbsheet/{fid}/sheets/{sid}` | 404 |
| `/v7/coop/dbsheet/{fid}/sheets/{sid}/fields` | 404 |
| `/v7/coop/dbsheet/{fid}/forms` | 404 |
| `/v7/coop/dbsheet/{fid}` | 404 |
| `/v7/coop/files/{fid}` | 404 |

⇒ 表单元数据在当前 API 面**不可观测**（不代表平台不支持表单，仅代表本应用凭证 + 本文件当前无表单）。
- 本阶段**无法自行建立临时 Form**：建立表单视图属于对 WPS 文件的写操作，§一/§十三 明确禁止。
- 因此适用 §三 的落定条款：

  > **「无法建立独立测试Form，因此无法完成逐提交者creator实证。」**

  精确表述：本阶段**未获得**独立测试 Form 环境——既无既存 Form 视图可复用，也无人工新建记录（见 §3）。该步骤须由人工在 WPS 端完成，本阶段不具备执行条件。

---

## §3 测试用户数量

**结论：0 名测试提交用户（人工提交 0 条）**

- 全量 2063 条记录的 WPS **基础设施时间戳**（`created_time`）**100% 落在同一天**：

  | created_time 日期 | 条数 |
  |---|---|
  | 2026/09/08 | 2063 |

  `created_time` 区间：`2026/09/08 17:11:58` → `2026/09/08 19:11:02`（约 2 小时批量写入窗口）。
- 记录内业务字段 `提交时间` 存在 2026/09/01 等多样取值，但该字段为**业务填报值**、非基础设施时间戳 ⇒ 反证这 2063 条是**批量导入**而来，不是逐人逐次的人类表单提交。
- 唯一「非创建日」的修改只有 1 条（记录 `go`，`last_modified_time = 2026/09/11 18:07:50`），其 `last_modified_by` 仍为同一账号值。
- 因此：**本阶段观察窗口内没有任何新增记录**，无法区分「用户A提交」「用户B提交」。

---

## §4 Record 数量

| 项 | 值 |
|---|---|
| 扫描方式 | 全量分页（`page_size=200`，11 页） |
| 扫描到记录数（`sheetId=3` 业务表） | **2063** |
| 分页成功页数 | 11 / 11（HTTP 200） |
| `creator` 缺失条数 | **0** |
| `last_modified_by` 缺失条数 | **0** |
| **文件内全部 Sheet 合计**（补充扫描，见附录 H） | **2066**（sheet 3 → 2063 + sheet 1 → 3；sheet 2 非记录表） |

---

## §5 每条 Record 的 creator

**全量 2063 条记录的 `creator` 取值完全一致，均为 `1901573333`（零例外）。**

抽样明细（原始 `list_by_page` + `show_record_extra_info:true` 直读，非 `buildRecord()` 归一化结果）：

| 测试提交 | WPS用户 | Record ID | creator | last_modified_by | created_time | last_modified_time | 记录内「姓名」 |
|---|---|---|---|---|---|---|---|
| （非受控） | 未确认 | `E` | `1901573333` | `1901573333` | 2026/09/08 17:11:58 | 2026/09/08 19:44:38 | 王臣祥 |
| （非受控） | 未确认 | `F` | `1901573333` | `1901573333` | 2026/09/08 17:12:00 | 2026/09/08 19:44:38 | 李春福 |
| （非受控） | 未确认 | `G` | `1901573333` | `1901573333` | 2026/09/08 17:12:00 | 2026/09/08 19:44:38 | 鲍明新 |
| （非受控） | 未确认 | `H` | `1901573333` | `1901573333` | 2026/09/08 17:12:00 | 2026/09/08 19:44:38 | 王建军 |
| （非受控） | 未确认 | `I` | `1901573333` | `1901573333` | 2026/09/08 17:12:00 | 2026/09/08 19:44:38 | 盖广勇 |
| （非受控） | 未确认 | `J` | `1901573333` | `1901573333` | 2026/09/08 17:12:00 | 2026/09/08 19:44:38 | 王秀泉 |
| … | … | …（中间 2053 条同值） | … | … | … | … | … |
| （非受控） | 未确认 | `gl` | `1901573333` | `1901573333` | 2026/09/08 19:11:01 | 2026/09/08 19:11:01 | 黄殿兴 |
| （非受控） | 未确认 | `gm` | `1901573333` | `1901573333` | 2026/09/08 19:11:02 | 2026/09/08 19:11:02 | 刘金涛 |
| （非受控） | 未确认 | `gn` | `1901573333` | `1901573333` | 2026/09/08 19:11:02 | 2026/09/08 19:11:02 | 刘金涛 |
| （非受控） | 未确认 | `go` | `1901573333` | `1901573333` | 2026/09/08 19:11:02 | **2026/09/11 18:07:50** | 黄殿兴 |

- Record ID 形态：WPS 原始 id 为短字符串（如 `E`、`go`），全量 id 区间 `E` → `go`。
- 原始 record 对象实际返回的键（可直接取到身份元数据）：
  `["fields","id","created_time","creator","last_modified_by","last_modified_time"]`
  ⇒ **`creator` 确实可得**（推翻 P2-B1-A 阶段「无 creator」的结论，与 P2-B1-C 结论一致），问题不在"能不能读到"，而在"它的语义是不是提交者"。
- 全量 2063 条明细（含每条 id / creator / last_modified_by / created_time / last_modified_time）已落盘于证据文件，见附录 E。

---

## §6 creator distinct count

| 指标 | 值 |
|---|---|
| **distinct creator** | **1** |
| distinct creator 取值 | `{"1901573333"}` |
| distinct `last_modified_by` | **1**（`{"1901573333"}`） |
| `creator === last_modified_by` 是否恒真 | **是（2063/2063）** |
| 记录内 distinct「姓名」 | **61** |
| 同一姓名是否出现多于 1 个 creator | **0 个姓名**（反向映射 61 → 1） |
| `creator` → 姓名基数 | `1901573333` → **61 个姓名** |
| **全文件（含全部 Sheet）distinct creator** | **仍为 1**（附录 H）——无第二个账号 ID |

> ⚠️ **口径陷阱（本次实测踩到并已澄清）**：按 Sheet 汇总 `last_modified_by` 时会得到 `distinct = 2`，看似"存在第二个账号"。逐条核对后确认**第二个取值是空字符串 `""`**（sheet 1 的 3 条记录从未被修改过，`last_modified_by`/`last_modified_time` 均为 `""`），**不是任何 WPS 账号 ID**。⇒ 统计 distinct 值时**必须排除空串/NULL**，否则会把"未修改"误读成"另一账号"。

---

## §7 creator 与提交用户的对应关系

**结论：无法建立任何「creator ↔ 提交用户」的一一对应。**

- 全量样本中 `creator` 恒为单值，**不存在可用于比对的第二个 creator**，因此「用户A vs 用户B」的区分关系在数据上**根本不存在**。
- 记录内的「姓名」（61 个不同值）是**业务填报字段**，不是提交者凭证；本阶段按 §五/§八 **不使用**姓名、昵称、手机号、realName 做任何推断或匹配。
- 由此，`creator` 只能回答"这条记录由哪个账号写入"，**不能回答"由哪个人提交"**——在本数据集下二者不可互换。

---

## §8 是否存在共享账号

**结论：强间接证据指向「存在共享/应用账号」，但因缺少受控实验（两名真实提交者），本阶段不将其升级为 CONFIRMED。**

支撑证据（全部为只读实测）：

| # | 证据 | 指向 |
|---|---|---|
| 1 | 2063 条记录 **仅 1 个 creator**，却对应 **61 个不同姓名** | 一个账号承载多个自然人 |
| 2 | `creator === last_modified_by` 对 **2063/2063 恒真** | 创建与修改均出自同一账号（典型应用凭证写入形态） |
| 3 | 全量 `created_time` 集中在 **2026/09/08 17:11–19:11 的 2 小时窗口**、按页连续递增 | 程序化批量写入，非人工逐次操作 |
| 4 | 唯一一次跨日修改（记录 `go`，09-11 18:07）后 `last_modified_by` **仍是同一账号值** | 后续编辑同样经由该账号 |
| 5 | `creator` 值形态为 10 位数字（`1901573333`），与 WPS 账号 ID 形态一致 | 是平台侧账号 ID，非业务字段 |

> 说明：本阶段尝试用当前 app token 直连识别"应用自身账号"（`/users/me`、`/account`、`/files/{fid}/members` 等 10 个候选端点）以做**同一性比对**，全部返回 **404 `404000001 Route Not Found`** ⇒ 当前 API 面无法取到应用自身身份，故本条比对**未完成**，只能作为上述间接证据的加强项、不能作为判定依据。

---

## §9 是否确认 per-submitter

**结论：否。未确认 `PER_SUBMITTER_CREATOR_CONFIRMED`。**

按 §十四 验收条件逐项核对：

| 验收条件 | 实际 | 判定 |
|---|---|---|
| 不同 WPS 用户 | 无受控测试用户（人工提交 0 条） | ✗ |
| 不同提交 | 无新增提交（全量同属 09-08 批量写入） | ✗ |
| `Record.creator` 可读取 | ✅ 2063/2063 可读，非空 | ✓ |
| creator 能分别对应两个 WPS 用户 | 只有一个 creator 取值，无从对应 | ✗ |

⇒ 4 项中仅 1 项满足，**不得宣称身份链已闭合**。

---

## §10 巡查人员ID 结论

**结论：`UNTRUSTED_BUSINESS_FIELD`（不可信业务字段），继续保持禁止用于身份归属。**

| 检查项 | 实测 |
|---|---|
| `巡查人员ID` 字段存在于 schema | 是（第 21 个字段，29 字段之一） |
| 2063 条记录中该字段有值条数 | **0**（`inspIdMissing = 2063/2063`） |
| distinct 取值 | `{null}` |
| 是否证明由 WPS 平台自动生成 | ❌ 无证据（全部为空） |
| 是否证明用户不可修改 | ❌ 无证据 |
| 是否证明由 API 返回且与真实用户稳定一一对应 | ❌ 无证据（无值、不落 PG：`FIELD_MAP` 中该列为 `pg:'-'`） |

⇒ 四项证明要件一项都未满足 ⇒ **`UNTRUSTED_BUSINESS_FIELD`**。**不写入 `inspector_employee_id`。**

---

## §11 bridge 是否修改

**结论：未修改。**

- `wps_account_employee_map`：**0 行**（未新增任何映射）。
- 未做姓名匹配、昵称匹配、手机号匹配、realName 匹配。
- 本次唯一出现的 creator 值 `1901573333` **仅被记录**，**未被认领到任何 employee**。
- 本阶段未对任何服务代码、Pull Engine、Mobile H5、users/auth/JWT 做修改（详见附录 D 的 mtime 证据）。

---

## §12 PG 生产基线

以 `_p2b1_prod_regress.cjs`（只读 SELECT，连 `safety_dashboard`）在 **23:06** 复核，退出码 **0**：

```json
{
  "database": "safety_dashboard",
  "gir_row_count": 2061,
  "sync_map_row_count": 2061,
  "max_gir_id": 7192,
  "conflict_rows": 0,
  "gir_column_count": 28,
  "gir_has_new_columns": []
}
```
`PROD REGRESSION: PASS — 生产未变动`

| §九 门禁项 | 要求 | 实测 | 判定 |
|---|---|---|---|
| gir | 2061 | 2061 | PASS |
| sync_map | 2061 | 2061 | PASS |
| max(gir.id) | 7192 | 7192 | PASS |
| conflict | 0 | 0 | PASS |
| gir 列数 | 28 | 28 | PASS |
| gir 是否含 P2-B0 新列 | 无 | `[]` | PASS |
| `.env` 未修改 | — | mtime `2026-09-11 22:22:50 +0800`（**早于本阶段**） | PASS |
| `WPS_GRID_DATA_SOURCE` | `false` | `false` | PASS |
| `WPS_GRID_SYNC` | `true` | `true` | PASS |
| `SCHEDULER_ENABLED` | `true` | `true` | PASS |
| 5876 / PID 23396 未被修改 | — | `0.0.0.0:5876` 与 `[::]:5876` 均 LISTENING，PID **23396** | PASS |

**本阶段未执行任何生产 DML**（仅 SELECT / `current_database()` / `information_schema` 查询）。

---

## §13 WPS 正式数据是否被修改

**结论：未被修改。**

- 本阶段对 WPS 的全部调用均为 `GET`（schema / 候选端点）与 `list_by_page`（读语义 POST），**未调用任何 create / update / delete / batch_delete 接口**。
- 未创建、未修改、未删除任何记录、字段、视图、Sheet。
- 只读复核结果与 P2-B1-C 阶段一致（2063 条、creator 单值），可交叉印证无写入。

---

## §14 测试数据清理情况

**结论：本阶段未产生任何测试数据，无需清理。**

| 项 | 状态 |
|---|---|
| 是否使用独立测试 WPS Form | 否（未建立） |
| WPS 侧新增测试记录 | 0 条 |
| PG 侧新增测试数据 | 0 行 |
| 需要保留并在报告中列出的测试 Record ID | **无** |
| 是否删除任何正式历史记录 | 否（未执行任何删除） |

---

## §15 最终判定

# `BLOCKED`

**落定依据（§三 条款）**：本阶段未获得可用的独立测试 Form 环境——文件内**不存在任何 Form 视图**、观察窗口内**零新增提交**；而创建临时 Form 属 WPS 写操作、本阶段明令禁止，须人工在 WPS 端执行且未发生。

> 无法建立独立测试Form，因此无法完成逐提交者creator实证。

**状态分层（避免误读）**

| 层 | 状态 | 说明 |
|---|---|---|
| 逐提交者 creator 能力（本阶段问题） | **BLOCKED** | 未执行受控双用户提交验证 |
| creator 字段可读性 | 可得 | 原始 record 直读即可取到 `creator` / `last_modified_by` |
| 「creator 是共享/应用账号」 | 强间接证据（未 CONFIRMED） | 1 creator : 61 姓名 + `creator≡last_modified_by` + 批量写入窗口 |
| 身份链闭合 | **NOT_READY** | 不得据此写入 `inspector_employee_id` / 建立 bridge |
| 生产冻结态 | 完好 | 见 §12 |

**本阶段禁止事项执行确认**

- 未自动进入 P2-B1-D / P2-B1-E / P2-C / P2-D；未进入 Attachment；未进入 Resident Enrichment。
- 未修改正式 WPS 表 / 生产数据库 / Pull Engine / Mobile H5。
- 未建立真实账号映射；未自动归属 `inspector_employee_id`；未新增 npm 依赖。

---

## 附录 A §五 验证矩阵（正式记录：未执行）

| 测试提交 | WPS用户 | Record ID | creator | last_modified_by |
|---|---|---|---|---|
| A | 用户A | —（未提交） | — | — |
| B | 用户B | —（未提交） | — | — |
| A1（第二轮） | 用户A | —（未提交） | — | — |
| B1（第二轮） | 用户B | —（未提交） | — | — |

§六 稳定性复验（`A1.creator == A2.creator`、`A.creator != B.creator`）：**未执行**，不做任何推断。

> 下方矩阵为**同一日批量导入样本的替代观测**（非受控、不构成 §五 证据）：

| 观测 | Record ID | creator | last_modified_by | created_time |
|---|---|---|---|---|
| 样本 1 | `E` | `1901573333` | `1901573333` | 2026/09/08 17:11:58 |
| 样本 2 | `gm` | `1901573333` | `1901573333` | 2026/09/08 19:11:02 |
| 样本 3 | `go` | `1901573333` | `1901573333` | 2026/09/08 19:11:02 |

---

## 附录 B §二 A/B/C/D 四问判定

| 问 | 结论 | 依据 |
|---|---|---|
| **A. Record.creator 存在** | **是** | 2063/2063 非空，键在原始返回体中 |
| **B. Record.creator 稳定** | **是（样本内）** | 单值恒存；跨日修改后仍同值。但"稳定性"仅在同一账号写入路径下成立，**不覆盖不同提交者场景** |
| **C. 是否逐提交者不同** | **未观察到差异** | 全量仅 1 个取值；但因样本非"不同用户提交"，**无法据此肯定或否定** |
| **D. 是否只是共享应用账号** | **强提示是（未 CONFIRMED）** | 见 §8 五项间接证据；应用自身身份比对因端点 404 未完成 |

⚠️ 按 §二 明示：**不得因 A/B 成立即判定身份可用** ⇒ 本报告未作此判定。

---

## 附录 C §五 CASE 映射

| CASE | 定义 | 是否命中 | 说明 |
|---|---|---|---|
| CASE 1 | `creatorA != creatorB` → `PER_SUBMITTER_CREATOR_CONFIRMED` | ✗ | 无第二个 creator 取值 |
| CASE 2 | `creatorA == creatorB` 且由不同 WPS 用户完成 → `SHARED_CREATOR_CONFIRMED` | ✗（前置未满足） | 等值成立，但"由不同 WPS 用户完成"**无受控证据** |
| CASE 3 | `creator` 为空 → `CREATOR_UNAVAILABLE` | ✗ | 字段非空 |
| CASE 4 | `creator` 存在但无法确认对应提交用户 → `CREATOR_SEMANTICS_UNVERIFIED` | **形态命中** | 但本阶段正式状态按 §三 落 **BLOCKED**（测试环境未建立） |

> 备注：若后续阶段仅依据现有只读样本（不补做双用户受控提交），其对应结论应为 **CASE 4 / `CREATOR_SEMANTICS_UNVERIFIED`**，并与本报告的「共享账号强间接证据」并存。

---

## 附录 D 红线与冻结核验（mtime 证据）

以 `stat -c %y` 逐文件取证（全部 **早于本阶段起点 23:03**）：

| 文件 | mtime | 本阶段 |
|---|---|---|
| `server/services/wpsGridPullEngine.js` | 2026-09-11 08:39:40 | NONE_MODIFIED |
| `server/services/wps/wpsFieldMap.js` | 2026-09-11 08:14:02 | NONE_MODIFIED |
| `server/services/wps/gridInspectionRepository.js` | 2026-09-08 20:29:23 | NONE_MODIFIED |
| `server/services/authenticatedEmployeeResolver.js` | 2026-09-10 14:49:40 | NONE_MODIFIED |
| `server/services/gridScope.js` | 2026-09-10 19:19:23 | NONE_MODIFIED |
| `server/routes/site-mgmt.js` | 2026-09-12 16:41:31 | NONE_MODIFIED |
| `server/app.js` | 2026-09-09 22:38:15 | NONE_MODIFIED |
| `server/services/wpsGridSyncScheduler.js` | 2026-09-11 16:29:00 | NONE_MODIFIED |

其余红线：`.env` 未改（mtime 09-11 22:22:50）；5876/PID 23396 未动；未改 users/auth/JWT；未改 Mobile H5；未新增 npm 依赖。

---

## 附录 E 证据文件与脚本（本阶段）

**新增只读脚本**（均命中 `.gitignore:145 _*.cjs` ⇒ 已 gitignored；输出目录 `server/scripts/output/` 亦被忽略）

| 脚本 | 用途 |
|---|---|
| `server/scripts/_p2b1c_ext_probe.cjs` | 全量只读扫描：schema/视图 + 11 页 2063 条 creator 分布 |
| `server/scripts/_p2b1c_ext_identity.cjs` | 应用自身身份可比对性探测（10 端点，全 404）+ 单条 record 直读 |
| `server/scripts/_p2b1c_ext_target_probe.cjs` | **备用**：面向独立临时 Form/dbsheet 的只读探针，**必须显式 `--file-id=`**（否则 `exit 3` 拒绝），不依赖改 `.env` |
| `server/scripts/_p2b1c_ext_allsheets.cjs` | 补充扫描：覆盖该文件**全部 Sheet**（附录 H） |

**证据输出**

| 文件 | 内容 |
|---|---|
| `server/scripts/output/_p2b1c_ext_probe_2026-09-12.json` | 报告主体证据（含全部 2063 条明细） |
| `server/scripts/output/_p2b1c_ext_identity.json` | 身份端点探测 + 单条 record 原始对象 |
| `server/scripts/output/_p2b1c_ext_allsheets_<ts>.json` | 全部 Sheet 扫描结果（附录 H） |

**复现命令**

```bash
cd server
"$NODE" scripts/_p2b1c_ext_probe.cjs          # 全量只读扫描（约 4s）
"$NODE" scripts/_p2b1_prod_regress.cjs        # 生产门禁（期望 exit 0）
```
（`NODE=C:/Users/honey/.workbuddy/binaries/node/versions/22.22.2-2/node.exe`）

---

## 附录 F 解除 BLOCKED 的最小执行清单（须人工，后续单独授权）

> ⚠️ 以下为**待办清单**，本阶段**未执行**，也不自动进入。

**方案 A（推荐：完全不碰正式表）**
1. 在 WPS 新建一个**独立临时多维表格文件**，建「表单视图」，字段随意（如 `姓名`、`备注`）。
2. 将该文件**添加本应用为协作者**（只读即可）。
3. 用户A 用**自己的 WPS 账号**通过表单提交 ≥1 条；用户B 用**自己的 WPS 账号**提交 ≥1 条。
4. 可选：用户A 再提交 1 条（做 §六 稳定性复验）。
5. 把文件 token（URL 中 `/file/` 或 `/dbsheet/` 段）交给执行方，运行：
   ```bash
   node scripts/_p2b1c_ext_target_probe.cjs --file-id=<FILE_TOKEN>
   ```
6. 判据：`distinctCreators == 2` 且两个 creator 分别对应两名提交者 ⇒ **CASE 1 / PER_SUBMITTER_CREATOR_CONFIRMED**；若两用户提交仍是同一 creator ⇒ **CASE 2 / SHARED_CREATOR_CONFIRMED**。
7. 验证完成后由用户在 WPS 端删除该临时文件（独立文件，不影响正式数据）。

**方案 B（备选：正式表加临时表单视图）**——须用户自行评估是否触碰「不改正式表结构」的约束；本报告不推荐。

**无论方案 A/B：本阶段禁止自动建立 bridge 映射**；creator 值仍只记录、不认领 employee（§八）。

---

## 附录 G 限制与声明

1. **样本性质限制**：本次 2063 条为**批量导入**样本，不是「不同用户通过表单逐条提交」样本，因此其 `creator` 单值现象**不能直接外推**为"WPS 表单提交的 creator 一定是共享账号"；只能作为**强间接证据**。
2. **API 面限制**：当前 app token 下，视图/字段/表单/成员/自身身份等 11 个只读端点均 404，**无法**从 API 侧确认文件是否支持/存在表单，也无法做 creator ↔ 应用身份的同一性比对。
3. **未使用推断性匹配**：全程未用姓名、昵称、手机号、realName 做任何身份推断（§五/§八 合规）。
4. **本报告不含任何"身份可用"结论**；`inspector_employee_id` / `grid_id` 归属维持 fail-safe（NULL + pending 状态）。
5. **停止点**：本阶段按 §十三 完成报告后立即停止，不自动进入 P2-B1-D / P2-B1-E / Attachment / Resident Enrichment / P2-C / P2-D。

---

## 附录 H 补充扫描：文件内**全部 Sheet**（只读，2026-09-12 23:09）

**动机**：§4–§6 的结论仅基于 `sheetId=3`。若文件内其他 Sheet 含"真人经 WPS UI 创建"的记录，其 `creator` 可能不同——即可在**零 WPS 写操作**下取得「creator 是否随账号而变」的直接证据。为消除该缺口，对文件内全部 Sheet 复扫。

**同时排查第二来源**：全仓检索其他 WPS 文件 token ⇒ **不存在**。`docs/` 中 `cn229thwalDs` 出现 **71 次**为唯一文件 ID，`.env` 亦仅有 `WPS_DBSHEET_FILE_ID` 一个文件变量 ⇒ **本应用凭证只绑定这一个文件，没有第二个可读文件**。

**逐 Sheet 结果**

| Sheet id | 名称 | 字段数 | 视图数 | 记录数 | distinct creator | creator 取值 | created_time 范围 | last_modified_by |
|---|---|---|---|---|---|---|---|---|
| 1 | 数据表 | 1 | 1 | **3** | **1** | `1901573333` | 2026/09/08 17:06:42（同一秒） | **`""`（空串，从未修改）** |
| 2 | 仪表盘 | 0 | 0 | — | — | — | — | HTTP **400** `E_DBSHEET_SHEET_NOT_FOUND`（非记录表，不可分页） |
| 3 | 表格视图 | 29 | 1 | **2063** | **1** | `1901573333` | 2026/09/08 17:11:58 → 19:11:02 | `1901573333` |

**全局（2066 条）**：`distinctCreators = 1`（`1901573333`）；`distinctLastModifiedBy = 2` —— **但第二个值是空串 `""`，不是账号**（详见 §6 口径陷阱），故**有效账号仍只有 1 个**。

**本附录的结论意义**

1. **扩面后结论不变**：文件内**不存在第二个 WPS 账号 ID**，`creator` 在全部 2066 条上恒为 `1901573333` ⇒ "creator 是共享/应用账号"的间接证据**进一步增强**，同时**排除了"另有 Sheet 存在真人提交记录"这一残余可能性**。
2. **新增平台行为知识**：① `last_modified_by` / `last_modified_time` 可为**空字符串 `""`**（从未修改的记录），统计 distinct 时必须排除，否则会误判出"第二个账号"；② 无字段的「仪表盘」Sheet 以 `list_by_page` 访问返回 **400 `E_DBSHEET_SHEET_NOT_FOUND`**（而非空列表）——探针须容忍该错误、不得当成"零记录"。
3. **判定不变**：仍 **`BLOCKED`**（本附录属扩面取证，不改变"无独立 Form 测试环境"的事实）。


# HSE-MOBILE-GRID-ARCH-03-P1-MANUAL-EXECUTE-03 报告
# WPS 云端缓冲 P1 人工实证：Test A + Test B（优先）

- 项目目录：`G:\hse-dashboard`
- 任务性质：**STRICT READ-ONLY + 人工操作指导 + 人工结果记录**
- 本轮范围：Test A（WPS 表单人工确认）+ Test B（真实身份人工测试）的指导与待回填；**C/D/E/F 本回合不执行**
- 生成时间：2026-09-12 20:39 (GMT+8)
- 状态机维持：`PHASE_HSE_MOBILE_GRID_ARCH_03P1_COMPLETED_WITH_EXTERNAL_DEPENDENCIES`
- 红线：0 代码改动 / 0 DDL / 0 DML / 0 WPS 写 / 0 .env 修改 / 0 生产生命周期操作 / 0 实现 client_token/身份桥/AirScript/桥/H5

---

## 〇、执行模式声明

本回合 WorkBuddy **只做三件事**：
1. 跑只读核查（生产状态、PG 内省、WPS 列举、冻结常量 grep、.env mtime、git 状态）；
2. 给出 Test A / Test B 的**人工操作步骤**与**回填模板**；
3. 等你（管理员 / 真实手机）回填结果后，再做只读核验并判定。

WorkBuddy **不创建 WPS 表单**、**不替你提交手机记录**、**不伪造**任何 WPS Record ID / 手机账号 / 身份 ID / 表单 ID / 表单 URL / 图片 URL / Pull 结果。

---

## 一、【已完成只读核验】PRE_TEST_BASELINE = PASS（任务书第二节）

| 项 | 检查点 | 实测 | 结果 |
|----|--------|------|------|
| A | PID 23396 仍监听 5876 | `0.0.0.0:5876 LISTENING 23396` + `[::]:5876 LISTENING 23396`；`tasklist` 确认 `node.exe 23396 Services` | ✅ |
| B | `grid_inspection_records = 2061` | `gir_count=2061` | ✅ |
| C | `MAX(id) = 7192` | `gir_max_id=7192` | ✅ |
| D | `grid_record_sync_map = 2061` | `sync_map_count=2061` | ✅ |
| E | `conflict = 0` | `sync_map_conflict=0` | ✅ |
| F | WPS = 2063 | `total_wps_records=2063`（`delta_vs_baseline=0`） | ✅ |
| G | `.env` 未修改 | mtime `2026-09-11 22:22:50` 不变；三开关 `WPS_GRID_DATA_SOURCE=false / WPS_GRID_SYNC=true / SCHEDULER_ENABLED=true` | ✅ |
| H | 冻结代码常量未变 | `SYNC_PROJECTION_ORDER`@L107、`SYNC_HASH_COLUMNS=slice(0,18)`@L118、`PROTECTED_COLUMNS`@L127、`canonicalHash`@L163 均原样 | ✅ |
| I | 05-H-0 冻结项未变化 | git 冻结文件仅 `??`（未提交），无 `M`（修改）；无 `client_token` 列；`UNIQUE(wps_record_id,wps_file_id)` 完好 | ✅ |

**结论：`PRE_TEST_BASELINE = PASS`**。基线无变化，不触发 `BASELINE_CHANGED`，不阻止后续人工测试。

> 与历次 MANUAL-EXECUTE / VERIFY 轮次**逐字节一致**：WPS 最新记录 `2026/09/08 19:11:02`，自 09-08 起无任何新记录；PG `new_records(id>7192)=0`、`test_d_new_in_sync_map=0`。

---

## 二、【已完成只读核验】05-H-0 冻结常量复核（本轮 grep 实证）

- `wpsFieldMap.js`
  - L107 `const SYNC_PROJECTION_ORDER = [...]`（18 列哈希顺序）
  - L118 `const SYNC_HASH_COLUMNS = SYNC_PROJECTION_ORDER.slice(0, 18);`
  - L127 `const PROTECTED_COLUMNS = ['grid_id', 'inspector_employee_id'];`
  - L133 `const SYNC_PROJECTION = SYNC_PROJECTION_ORDER.map(...)`
- `wpsGridPullEngine.js`
  - L116 `function toCanonicalDto(fields)`、L147 `function toLegacyHashDict(fields)`、L163 `function canonicalHash(dictOrRow)`
  - L436-439 调用链：`toCanonicalDto → toLegacyHashDict → canonicalHash`
- `.env`：`WPS_GRID_DATA_SOURCE=false` / `WPS_GRID_SYNC=true` / `SCHEDULER_ENABLED=true`（未改动）
- `git status`：冻结相关文件仅 `??`（从未提交），无任何 `M`

**结论：05-H-0 冻结层在当前只读视角下完整未动。**

---

## 三、【未执行】Test A：WPS 表单人工确认（待你人工操作）

> **状态：【未执行 — 待用户人工】**。WorkBuddy 未创建/修改任何 WPS 表单；以下为请你在 WPS 管理员界面执行的步骤与回填模板。系统侧当前 WPS 记录 = 2063（Δ0），证明表单尚未产生任何测试记录。

### 3.1 请你在 WPS 管理界面执行（不要让我代做）

目标表：`cn229thwalDs`（sheet `3`，即现有生产多维表）。

1. 进入该表的「表格视图 / 表单视图」功能，新建（或确认已存在）一个用于本测试的表单。
2. 表单命名建议：`网格巡查移动端云端缓冲测试`（便于与正式业务区分）。
3. 配置（逐项确认）：
   - 企业内部可访问（内部分享 / 企业内成员）；
   - **要求登录后填写**；
   - 开启「收集填写者信息 / 创建人」高级字段（若 WPS 版本支持）；
   - 暴露业务字段：巡查时间、巡查地点、问题描述、违规人员、问题照片（Attachment）等现有业务列；
   - 暴露问题照片 Attachment 字段（用于 Test B/E 图片验证）；
   - **隐藏**：`grid_id`、`inspector_employee_id`、巡查人员 ID、sync 内部字段、链接镜像字段、其他内部字段；
   - 确认可连续提交、手机端可正常打开填写。
4. 用 1 个真实网格巡查账号提交 1 条**纯文本**测试记录（内容标注 `ARCH-03-P1-TEST-A`），确认 WPS 后台真实产生新 Record。

### 3.2 回填模板（请人工填写，WorkBuddy 仅记录你提供的内容）

```
FORM_VIEW_ID            = （待回填：WPS 表单/视图标识）
FORM_URL               = （待回填：表单链接）
LOGIN_REQUIRED         = （待回填：是 / 否）
COLLECT_SUBMITTER      = （待回填：是 / 否，是否开启填写者信息收集）
SUBMITTER_VISIBLE_INFO = （待回填：WPS 实际展示的填写者内容，原文照抄）
IMAGE_ATTACHMENT_AVAILABLE = （待回填：是 / 否）
INTERNAL_SHARE_ONLY    = （待回填：是 / 否）
MOBILE_OPEN_PASS       = （待回填：是 / 否）

BUSINESS_FIELDS = （待回填：实际暴露的业务字段清单）
IMAGE_FIELD     = （待回填：问题照片 Attachment 字段名）
HIDDEN_FIELDS   = （待回填：实际隐藏的字段清单）

FORM_READY = （待回填：PASS / FAIL / BLOCKED）
```

### 3.3 判定原则（不自行放宽）

- **PASS**：手机可打开 + 能正常填写 + 能提交 + WPS 真实产生 Record + 图片字段可用 + 权限符合要求。
- 任一不满足 → **FAIL / BLOCKED**（不得写 PASS）。
- **严禁**：把「WPS 填写者 = employee.id」「WPS 姓名 = employee.name」直接当成结论。只记录 WPS 实际返回的身份信息。

---

## 四、【未执行】Test B：真实身份人工测试（待 Test A PASS 后执行）

> **状态：【未执行 — 待用户人工】**。须 Test A `FORM_READY=PASS` 后方可执行。当前系统侧无任何 Test B 提交记录（WPS Δ0）。

### 4.1 执行步骤

1. 选取 **2～3 个真实网格巡查账号**（彼此应为不同人）。
2. 每个账号通过上面表单**各提交 1 条**测试记录，内容明确标记 `ARCH-03-P1-TEST-B`，**避免与正式业务混淆**。
3. 每条记录人工记录下列字段（**原文照抄 WPS 显示**，不要猜测）：

```
账号A:
  Record ID        = （待回填）
  提交时间         = （待回填）
  WPS 显示的填写者  = （待回填：原文）
  WPS 创建人        = （待回填：原文）
  WPS 账号信息      = （待回填：账号/邮箱/手机/企业 ID 等，若有）
  是否实名         = （待回填：是 / 否 / 未知）
  是否存在稳定唯一ID = （待回填：有 / 无）
  是否能区分不同账号 = （待回填：能 / 不能）
  同账号重复提交是否保持相同身份标识 = （待回填：是 / 否 / 未测）
账号B: （同上结构）
账号C: （同上结构，如有）
```

### 4.2 身份判定规则（仅三种，互斥）

| 结论 | 条件 |
|------|------|
| `IDENTITY_BRIDGE_USABLE` | WPS 能提供**稳定、唯一、可重复识别**的账号标识（如稳定 user ID / account ID / 企业账号唯一标识）。注意：「姓名一样」不算唯一。 |
| `IDENTITY_BRIDGE_WEAK` | 只有姓名 / 昵称 / 显示名称，**没有稳定唯一 ID**。 |
| `IDENTITY_BRIDGE_UNAVAILABLE` | 无法获得任何可靠提交者身份信息。 |

### 4.3 严禁的错误映射（本回合只证明「WPS 是否存在可用稳定身份标识」）

- 禁止 `SELECT employee WHERE name = WPS姓名` 后认定身份桥成立；
- 禁止 `WPS姓名 → employee.name` / `WPS昵称 → employee.name` / `WPS手机号 → employee.id`；
- 上述映射须未来单独设计 + 批准后才允许，不在本回合范围。

### 4.4 结果表（待你回填后由 WorkBuddy 判定）

| 测试账号 | WPS Record ID | WPS 身份原文 | 稳定 ID | 是否可区分 |
|----------|---------------|--------------|---------|------------|
| A | （待回填） | （待回填） | （待回填） | （待回填） |
| B | （待回填） | （待回填） | （待回填） | （待回填） |
| C | （待回填） | （待回填） | （待回填） | （待回填） |

```
IDENTITY_BRIDGE_RESULT = （待判定：USABLE / WEAK / UNAVAILABLE）
```

---

## 五、【未执行】Test C / D / E / F 本回合明确不执行

依据任务书第九节，本回合**只做 A + B**：

| 测试 | 状态 | 说明 |
|------|------|------|
| Test C 云端缓冲 | 【未执行】 | 本回合不执行；且仅允许在**已证明完全隔离的测试环境**中进行（≠23396 / ≠5876 / ≠生产库 / ≠生产.env）。 |
| Test D 自然 Pull | 【未执行】 | 依赖 C 完成后才做；等候 Scheduler 自然运行，不手工 Pull。 |
| Test E Attachment | 【未执行】 | 本回合不执行；只做外部能力验证，不实现 Bridge。 |
| Test F 重复提交 | 【未执行】 | 本回合不执行；只建基线，禁止加 client_token。 |

---

## 六、最终状态机（任务书第十二节）

由于 Test A / Test B **均未执行**，无法进入任何 A+B 派生状态：

```
PHASE_HSE_MOBILE_GRID_ARCH_03P1_COMPLETED_WITH_EXTERNAL_DEPENDENCIES   ← 本回合维持
```

（仅当 Test A PASS + Test B=USABLE → `MANUAL_AB_READY`；A PASS + WEAK → `IDENTITY_WEAK`；A PASS + UNAVAILABLE → `IDENTITY_UNAVAILABLE`；A FAIL → 维持现状。上述三态待你回填后判定，本回合不臆测。）

---

## 七、结束时必须输出（任务书第十三节）

1. **Test A 结果**：【未执行 — 待用户人工】。表单尚未创建/确认，WPS Δ=0。
2. **Test B 结果**：【未执行 — 待用户人工】。无提交记录。
3. **WPS 真实 Record 数量变化**：`2063 → 2063`，Δ=0（无任何测试记录产生）。
4. **身份信息原文**：尚无（Test B 未执行）。
5. **是否存在稳定唯一 WPS 账号 ID**：**未知**（需 Test B 实证，严禁用姓名推断）。
6. **是否允许进入 Test C/D/E/F**：仅在 Test A PASS 后允许 Test B；Test C 还需先证明测试环境隔离，否则 `BLOCKED`。本回合不自动进入。
7. **是否允许 P2**：**不允许**。八项升级条件（A–H）均未满足，依赖未闭环。本回合结束后**不自动进入 P2**。

---

## 八、风险清单

| 编号 | 风险 | 状态 | 说明 |
|------|------|------|------|
| R1 | 身份桥无稳定 ID | 【NEEDS_EXTERNAL_CONFIRMATION】 | 取决于 Test B 真机返回；只读列举只暴露 `提交时间`，不回显 creator。 |
| R2 | 图片 URL 长期稳定性 | 【NEEDS_EXTERNAL_CONFIRMATION】 | 取决于 Test E；本回合不执行。 |
| R3 | 关机期间 WPS 缓冲可靠性 | 【未执行】 | 取决于 Test C；需隔离环境。 |
| R4 | 恢复后 Scheduler 自然 Pull 闭环 | 【未执行】 | 取决于 Test D。 |
| R5 | 误触生产 PID 23396 / 5876 | 【已规避】 | 本回合零生产操作；Test C 前强制隔离证明。 |

---

## 九、项目当前完整进度（任务书第十四节）

```
ARCH-01   移动端网格巡查基础链路                          COMPLETED
ARCH-02   WPS 云端缓冲架构设计与外部能力验证              COMPLETED
ARCH-03   无云 WPS 云端缓冲架构                          COMPLETED_WITH_EXTERNAL_DEPENDENCIES
ARCH-03-P1 只读代码/字段/冻结审计                        COMPLETED
  ├─ VERIFY-FINAL      人工真机最终验证（只读）          COMPLETED_WITH_EXTERNAL_DEPENDENCIES
  ├─ MANUAL-EXECUTE    人工实证准备（只读）              COMPLETED_WITH_EXTERNAL_DEPENDENCIES
  ├─ MANUAL-EXECUTE-02 测试前基线（只读）               PRE_TEST_BASELINE = PASS
  └─ MANUAL-EXECUTE-03 本轮：A+B 指导 + 回填            PRE_TEST_BASELINE = PASS
                                                       Test A = 【未执行-待人工】
                                                       Test B = 【未执行-待人工】
Test C/D/E/F = 【未执行】
P2          = NOT ALLOWED
全局要求：先完成 A+B，再根据真实结果决定下一阶段。
```

---

## 十、下一步（仅建议，不执行）

1. 你按本报告第三节在 `cn229thwalDs / sheet 3` 确认/创建手机表单视图并回填模板 → 我据回填判定 `FORM_READY`。
2. Test A PASS 后，按第四节用 2～3 个真实账号提交 `ARCH-03-P1-TEST-B` 并回填 → 我据原文判定 `IDENTITY_BRIDGE_*`。
3. 两项回填齐备后，我重跑两只读脚本（`_arch03p1_verify_introspect.cjs` / `_arch03p1_verify_wps_list.cjs`）复核 WPS 数 / PG 新增 / sync_map 新增，再给出状态机判定与是否允许进入 C/D/E/F、P2。
4. **Test C 红线**：任何「停止本地服务」前，你必须先向我证明目标 ≠ 生产 PID 23396 / 端口 5876 / 生产库 / 生产 .env；无法证明隔离则立即停 Test C，我不会自行选 PID kill。

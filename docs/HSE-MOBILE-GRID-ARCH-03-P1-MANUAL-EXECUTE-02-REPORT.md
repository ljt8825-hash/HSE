# HSE-MOBILE-GRID-ARCH-03-P1-MANUAL-EXECUTE-02
# WPS 云端缓冲人工实证第二阶段：测试前基线只读检查 + 人工测试记录

- 项目目录：`G:\hse-dashboard`
- 任务性质：**STRICT READ-ONLY + 人工操作记录**（非开发、非架构实现、不进入 P2）
- 生成时间：2026-09-12 20:33
- 当前状态机：`PHASE_HSE_MOBILE_GRID_ARCH_03P1_COMPLETED_WITH_EXTERNAL_DEPENDENCIES`

---

## 〇、本回合执行原则（红线自检）

| # | 禁止项 | 本回合执行情况 |
|---|--------|----------------|
| 1 | 修改任何代码 / 2 修改 DB 结构 / 3 业务 DML / 4 写 PG / 5 写 WPS | 未执行任何写入 |
| 6 | 修改 .env / 7 修改 Scheduler / 8 修改生产进程 | 未修改（仅只读读取） |
| 9 | 停止/重启 PID 23396 | 未触碰 |
| 10 | 操作生产端口 5876 | 未操作 |
| 11–14 | client_token / 身份桥 / Attachment Bridge / AirScript | 全部禁止且未实现 |
| 15 | 修改 05-H-0 冻结 / 16 移动端 H5 / 17 认证JWT | 未修改 |

**本回合产出文件**：本报告（仅文档，非代码/数据改动）+ 复用两只读脚本（`_arch03p1_verify_introspect.cjs`、`_arch03p1_verify_wps_list.cjs`）。

---

## 三、测试前基线只读检查（PRE_TEST_BASELINE）

> 仅使用只读方式确认，9 项全 PASS → 未出现 FAIL → 不中止、不阻止后续人工测试。

| 项 | 检查内容 | 方法 | 结果 |
|----|----------|------|------|
| A | PID 23396 仍监听 5876 | `netstat -ano | grep :5876` | ✅ `TCP 0.0.0.0:5876 LISTENING 23396`（IPv4+IPv6 双栈，未变） |
| B | `grid_inspection_records` 仍为 2061 | 只读 SELECT count | ✅ `gir_count=2061` |
| C | `MAX(id)=7192` | 只读 SELECT max | ✅ `gir_max_id=7192` |
| D | `grid_record_sync_map` 仍为 2061 | 只读 SELECT count | ✅ `sync_map_count=2061` |
| E | `conflict=0` | 只读 SELECT count(where conflict) | ✅ `sync_map_conflict=0` |
| F | WPS 仍为 2063 | 只读 `list_by_page` 计数 | ✅ `total_wps_records=2063`，`delta_vs_baseline=0`，`max_created=2026/09/08 19:11:02` |
| G | git 无生产冻结代码修改 | `git status --porcelain` 过滤 wps/冻结文件 | ✅ 冻结文件仅 `??`（从未提交），无 `M`（已修改暂存）；现有 `A/AM` 均为 Sprint-A / 风险地图，**不含 WPS 冻结层** |
| H | `.env` 未修改 | `stat -c %y` mtime | ✅ mtime = `2026-09-11 22:22:50`（与 P1 基线一致，未变）；关键开关 `WPS_GRID_DATA_SOURCE=false` / `WPS_GRID_SYNC=true` / `SCHEDULER_ENABLED=true` 未变 |
| I | 05-H-0 冻结项未变化 | grep 冻结常量 + 代码定位 | ✅ 见下「冻结复核」 |

**PRE_TEST_BASELINE = PASS**

> 说明：脚本在 `recent_12` 中只暴露业务字段键（如 `提交时间`），**未包含 creator/填写者身份字段**——原因是当前无任何 WPS 表单提交记录，且 `list_by_page` 只读列举本身不回显「收集填写者信息」类高级字段。故身份证据在只读层面**不可得**，必须靠人工真机提交后回填。

---

## 四、Test A：WPS 表单人工确认

**状态：【未执行】**（无系统侧证据：WPS `total=2063` 与基线 Δ=0，自 09-08 起无新记录）

WorkBuddy 不得自动创建/修改 WPS 表单。请用户在 WPS 管理界面人工完成并回填：

| 需回填项 | 说明 |
|----------|------|
| 表单视图 ID / form-view 标识 | 在 `cn229thwalDs / sheet 3` 上创建 |
| 表单链接 | 手机访问入口 |
| 分享权限 | 企业内部 / 指定成员 |
| 是否要求登录 | 应开启「登录后填写」 |
| 是否收集填写者信息 | 应开启，并确认实际收集到什么 |
| 实际显示字段 | 巡查业务字段 + 问题照片 Attachment |
| 图片 Attachment 字段 | 确认可上传 |
| 隐藏字段 | `grid_id` / `inspector_employee_id` / `巡查人员ID` / sync 内部字段 / 镜像链接字段 |

输出判定占位：`FORM_READY = 【待人工回填】`

---

## 五、Test B：真实身份人工测试

**状态：【未执行】**

使用 2～3 个真实网格巡查账号，各提交 1 条测试记录。请用户回填：

| 需回填项 | 说明 |
|----------|------|
| WPS Record ID | 每条 |
| 提交时间 / 提交账号 | — |
| WPS 创建人/填写者**原文** | 切勿加工 |
| 是否实名 | 是/否 |
| 稳定唯一账号 ID | 是否存在（非姓名/昵称） |
| 不同账号可区分 | 是/否 |
| 同账号重复提交是否稳定 | 是/否 |

判定只允许三选一：
- `IDENTITY_BRIDGE_USABLE`（有稳定唯一 WPS 账号标识）
- `IDENTITY_BRIDGE_WEAK`（只有姓名/昵称）
- `IDENTITY_BRIDGE_UNAVAILABLE`（无法确认提交者）

⚠️ **严禁** `SELECT employee WHERE name=...` 后直接认定身份桥成立。当前只读列举无法获得该字段，故本项在人工回填前无法判定。

---

## 六、Test C：云端缓冲测试

**状态：【未执行】**（前提未满足：尚无任何测试环境隔离证明 + 无新 WPS 记录）

⚠️ **红线前置条件（必须先在对话中向我证明，否则 TEST_C = BLOCKED，绝不自行 kill）**：
- 目标 PID ≠ 23396
- 目标端口 ≠ 5876
- 目标数据库 ≠ 生产库（`safety_dashboard` @ 127.0.0.1:5432）
- 目标 `.env` ≠ 生产 `.env`（mtime `2026-09-11 22:22:50`）

确认完全隔离后，用户使**测试**业务环境不可用（不关 WPS），手机提交 3～5 条。判定 `WPS_BUFFER_REAL_SAVE = PASS` 的必要条件是 **WPS 后台真实出现新 Record**（手机提示成功不算唯一证据）。

判定占位：`WPS_BUFFER_REAL_SAVE = 【待隔离证明+人工回填】`

---

## 七、Test E：Attachment 图片测试

**状态：【未执行】**

真机分别提交：无图 ≥1 / 单图 ≥1 / 多图 ≥1。请用户回填：

| 需回填项 |
|----------|
| Record ID |
| Attachment 是否保存 / uploadId / source |
| download_url 是否存在 / 是否需鉴权 |
| 提交后立即可访问？电脑恢复后可访问？延迟后是否仍可访问？ |

- 若无法证明 `download_url` 长期稳定 → `IMAGE_URL_LONG_TERM = NEEDS_EXTERNAL_CONFIRMATION`（**不得写 PASS**）
- 本任务**不实现** Attachment Bridge。

---

## 八、Test D：恢复后自然 Pull

**状态：【未执行】**

恢复隔离测试环境后，**禁止**手工 Pull / 调 API / 触发 Scheduler。等待现有 Scheduler（每 15 分钟）自然运行，然后由我用两只读脚本复核：

`WPS新增数 = PG新增数 = sync_map新增数`，且 `重复数 = 0`、Record ID ↔ PG id 一一对应。

- 一致且无重复 → `PULL_RECOVERY_PASS = PASS`
- Scheduler 窗口内尚未运行 → `PULL_RECOVERY_PASS = NEEDS_MORE_WAIT`
- 不一致 → `PULL_RECOVERY_PASS = FAIL`

> 当前无新记录（`new_records(id>7192)=0`），故等待窗口判定尚不成立。

---

## 九、Test F：重复提交基线

**状态：【未执行】**

同账号同内容连续提交 2 次（Record A ≠ Record B）。恢复 Pull 后只读验证 PG 2 条 + sync_map 2 条、分别映射 A/B。

- `PULL_IDEMPOTENCY = PASS/FAIL`（由 `(wps_record_id,wps_file_id)` 唯一约束保证）
- `BUSINESS_DUPLICATE_IDEMPOTENCY = NOT_IMPLEMENTED`（client_token 未实现）
- 两者**不得混淆**。

---

## 十、Test G：05-H-0 冻结最终复核（并入 PRE_TEST_BASELINE 项 I）

**状态：【已完成只读核验 · 冻结复核 PASS】**

| 冻结常量 | 位置 | 当前值 | 是否变化 |
|----------|------|--------|----------|
| `SYNC_PROJECTION_ORDER` | wpsFieldMap.js:107 | 21 列（前 18 为 hash 列） | 未变 |
| `SYNC_HASH_COLUMNS` | wpsFieldMap.js:118 | `= SYNC_PROJECTION_ORDER.slice(0,18)` | 未变 |
| `PROTECTED_COLUMNS` | wpsFieldMap.js:127 | `['grid_id','inspector_employee_id']` | 未变 |
| `canonicalHash` | wpsGridPullEngine.js:163 | SHA-256 over `''≡null` 拼 `|` | 未变 |
| `toCanonicalDto` / `toLegacyHashDict` | wpsGridPullEngine.js:116/147 | 仅遍历 SYNC_PROJECTION | 未变 |
| `UNIQUE(wps_record_id,wps_file_id)` | sync_map 索引 | 完好 | 未变 |
| 生产 5876 | 系统 | PID 23396 LISTENING | 未变 |

**结论**：新增 WPS 字段（如 `client_token`，不入 FIELD_MAP）→ 被 `toCanonicalDto/toLegacyHashDict/canonicalHash` 静默忽略 → 前 18 列 hash / 变更检测 / sync_map / 既有 2061 行**全不变** ⇒ `CLIENT_TOKEN_FIELD_COMPATIBLE_WITH_FREEZE`（技术兼容，非批准）。

---

## 十一、最终状态判定

| 升级条件 | 是否满足 |
|----------|----------|
| A 表单真实可用 | ❌ 未执行 |
| B 身份稳定唯一标识/可落地桥 | ❌ 未执行 |
| C WPS 云端真实保存 | ❌ 未执行 |
| D 恢复后自然 Pull | ❌ 未执行 |
| E WPS=PG=sync_map 数量一致 | ❌ 未执行 |
| F Pull 无重复 | ❌ 未执行 |
| G 图片 Attachment 可行路径 | ❌ 未执行 |
| H 05-H-0 冻结保持 | ✅ 已验证保持 |

**⇒ 维持 `PHASE_HSE_MOBILE_GRID_ARCH_03P1_COMPLETED_WITH_EXTERNAL_DEPENDENCIES`**
（依赖未闭环，既非成功亦非失败；无硬阻断，故非 BLOCKED）

**P2 是否允许：不允许**（8 项条件全未满足）。

---

## 十二、报告分层汇总

| 节 | 标签 | 说明 |
|----|------|------|
| PRE_TEST_BASELINE | 【已完成只读核验】PASS | 9 项全过 |
| Test A | 【未执行】 | 待管理员建表单并回填 |
| Test B | 【未执行】 | 待真机提交+回填原文 |
| Test C | 【未执行】/ 隔离未证则【BLOCKED】 | 待隔离证明+关机提交 |
| Test D | 【未执行】 | 待自然 Pull + 只读核验 |
| Test E | 【未执行】 | 待带图真机提交+回填 |
| Test F | 【未执行】 | 待同账号双提交+回填 |
| Test G / 05-H-0 | 【已完成只读核验·冻结复核PASS】 | 常量与数据均不变 |
| 身份 / 图片 / 缓冲 / Pull / 重复 | 【NEEDS_EXTERNAL_CONFIRMATION】 | 需人工真机闭环 |

**零伪造声明**：本报告不含任何编造的 WPS Record ID、手机测试结果、WPS 账号、Attachment URL、Pull 结果或身份 ID。所有人工项均标注「未执行」并附回填清单。

---

## 十三、需要用户人工操作的步骤（明确列出）

1. **Test A**（WPS 管理员）：在 `cn229thwalDs / sheet 3` 创建/确认手机表单视图（登录后填写、企业内部、收集填写者信息、暴露业务+图片字段、隐藏 `grid_id`/`inspector_employee_id`/sync 内部/镜像字段）→ 回填 8 项。
2. **Test B**：2～3 个真实网格巡查账号各提交 1 条 → 回填创建人/填写者**原文**及稳定性 → 我据原文判 `IDENTITY_BRIDGE_*`。
3. **Test C**：先在对话中向我证明测试环境隔离（≠23396/≠5876/≠生产库/≠生产.env），再使测试业务不可用、手机提交 3～5 条 → 回填 Record ID/时间/账号/带图。
4. **Test E**：真机提交无图/单图/多图各 1 条 → 回填 download_url 可访问性/鉴权/有效期。
5. **Test D**：恢复测试环境，**不手工 Pull**，等 Scheduler 自然运行 → 通知我，我用两只读脚本复核 `WPS=PG=sync_map`、重复=0。
6. **Test F**：同账号同内容提交 2 次 → 回填两 Record ID。

我收到回填后，重跑两只读脚本出具数值复核，再判定状态机是否可升 `READY_FOR_P2`。

---

## 十四、项目当前完整进度（ARCH-03 P1 全历程）

| 阶段 | 交付物 | 状态 |
|------|--------|------|
| ARCH-03 无云 WPS 云端缓冲架构复核 | `HSE-MOBILE-GRID-ARCH-03-无云WPS云端缓冲架构复核报告.md`（23 节） | ✅ 完成（COMPLETED_WITH_EXTERNAL_DEPENDENCIES） |
| P1 只读代码审计 | `HSE-MOBILE-GRID-ARCH-03-P1-无云WPS云端缓冲真实链路验证报告.md` | ✅ 冻结影响/字段矩阵 PASS |
| P1-VERIFY 收官 | `HSE-MOBILE-GRID-ARCH-03-P1-VERIFY-人工真机实证收官报告.md` | ✅ 只读复核 PASS，人工未执行 |
| P1-VERIFY-FINAL | `HSE-MOBILE-GRID-ARCH-03-P1-VERIFY-FINAL-人工真机最终验证报告.md` | ✅ 同上 |
| P1-MANUAL-EXECUTE | `HSE-MOBILE-GRID-ARCH-03-P1-MANUAL-EXECUTE-人工实证执行与只读核验报告.md` | ✅ 同上 |
| **P1-MANUAL-EXECUTE-02（本回合）** | `HSE-MOBILE-GRID-ARCH-03-P1-MANUAL-EXECUTE-02-REPORT.md` | ✅ PRE_TEST_BASELINE PASS；人工 Test A–F 仍【未执行】 |

**全局结论**：所有「只读可证」的部分（sync_hash 冻结语义、字段映射、05-H-0 兼容性、03-B 兼容性、生产隔离）均已确证 PASS；所有「必须真机/人工」的部分（表单入口、身份桥、关机缓冲、恢复 Pull、图片 URL、重复基线）**始终未产生系统侧数据**，故 P1 维持 `COMPLETED_WITH_EXTERNAL_DEPENDENCIES`，不进入 P2。本任务结束后不自动进入 P2 开发。

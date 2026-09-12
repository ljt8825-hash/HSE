# HSE-MOBILE-GRID-ARCH-03-P1-MANUAL-EXECUTE：WPS云端缓冲人工实证执行与只读核验报告

> 任务性质：**人工操作指导 + STRICT READ-ONLY 核验**（非开发 / 非架构实现 / 非 P2）
> 报告生成时间：2026-09-12 20:25 (GMT+8)
> 前置报告：`docs/HSE-MOBILE-GRID-ARCH-03-P1-VERIFY-FINAL-人工真机最终验证报告.md`
> 维持冻结态：`PHASE_HSE_MOBILE_GRID_ARCH_03P1_COMPLETED_WITH_EXTERNAL_DEPENDENCIES`
> 生产：`5876 / PID 23396 / SYSTEM` **全程未触碰**（仅只读观测，0 生命周期操作）

---

## 〇、最关键事实（先讲结论，避免误读）

**截至本报告生成时刻（20:25），系统侧（WPS + PostgreSQL）没有任何人工测试产生的数据。** 只读核验结果：

| 数据源 | 当前值 | P1 基线 | Δ | 结论 |
|--------|--------|---------|---|------|
| 生产 `:5876` | PID **23396** LISTENING | 23396 | 0 | 未触碰 |
| `grid_inspection_records` 计数 | **2061** | 2061 | 0 | 无新增 |
| `MAX(id)` | **7192** | 7192 | 0 | 无新增 |
| `new_records(id>7192)` | **0** | 0 | 0 | 无新增 |
| `grid_record_sync_map` 计数 | **2061** | 2061 | 0 | 无新增 |
| `conflict` | 0 | 0 | 0 | 无冲突 |
| WPS `total_wps_records` | **2063** | 2063 | **0** | 无新 WPS 记录 |
| WPS `max_created` | **2026/09/08 19:11:02** | 09-08 | — | 09-08 后无任何提交 |

⇒ **Test A–F 全部【未执行】**（系统侧零证据）。本 AI 无法替代执行"建表单 / 真机提交 / 关机缓冲 / 恢复 Pull"等物理或人工动作；以下为**精确人工执行协议 + 已完成的只读核验**。

**本任务红线全程遵守**：0 代码改动 / 0 DDL / 0 业务 DML / 0 WPS 写 / 0 生产生命周期 / 0 .env 修改 / 0 实现 client_token/归属/AirScript/桥/H5。

---

## 一、Test A：WPS 表单配置 —— 【未执行】

**需用户（WPS 管理员）人工在 `cn229thwalDs / sheet 3` 完成。WorkBuddy 不猜测、不代建。**

请人工确认并记录以下字段（回填后我方可只读核验）：

| 需记录项 | 说明 |
|----------|------|
| form/view 标识 | 表单视图 ID |
| 表单链接 | 手机可访问 URL |
| 分享权限 | 企业内部 / 登录后填写 |
| 是否收集填写者信息 | 及"创建人/填写者"高级字段具体展示内容 |
| 实际暴露字段 | 巡查业务字段 + 问题照片 Attachment 字段 |
| 实际隐藏字段 | `grid_id`、`inspector_employee_id`、巡查人员ID、sync 内部字段、镜像字段 |

---

## 二、Test B：真实身份测试 —— 【未执行】

**需 2～3 个真实网格巡查人员账号，各提交 1 条。**

需记录（仅记录 WPS 实际返回，禁止 `SELECT employee WHERE name=` 后自行认定桥成立）：

| Record ID | 提交时间 | 提交账号 | WPS 创建人/填写者原文 | 是否实名 | 稳定唯一账号 ID | 不同账号可区分 | 同账号重复提交是否稳定 |
|-----------|----------|----------|----------------------|----------|----------------|---------------|----------------------|
| (待人工回填) | | | | | | | |

**最终判定三选一**（禁止用姓名直接映射 `employee.id`）：
- `IDENTITY_BRIDGE_USABLE`（有稳定唯一 WPS 账号标识）
- `IDENTITY_BRIDGE_WEAK`（只有姓名/昵称）
- `IDENTITY_BRIDGE_UNAVAILABLE`（无法确认提交者）

---

## 三、Test C：WPS 云端缓冲实证 —— 【未执行】

**目的**：证明本地 HSE 电脑/后端不可用时，手机仍 `手机→WPS→云端保存`。

**⚠️ 生产红线前置（任务书第三章）**：任何"停止本地服务"动作前，必须**先证明**：
- 目标 PID ≠ 23396
- 目标端口 ≠ 5876
- 目标数据库 ≠ 生产数据库
- 目标 `.env` ≠ 生产 `.env`

**无法证明测试环境隔离 ⇒ 立即停 Test C，不得猜测、不得选一个 PID 直接 kill。**

建议：另起与生产完全隔离的测试后端 + 测试库（参考此前 02-B 的 5882/safety_dashboard_dev 隔离范式），绝不影响 5876/生产 PG/生产 `.env`。

需记录（3～5 条）：

| Record ID | 提交时间 | 提交账号 | 是否带图 | 提交结果（BUFFER_PASS / 真实错误） |
|-----------|----------|----------|----------|----------------------------------|
| (待人工回填) | | | | |

判定 `WPS_BUFFER_REAL_SAVE = PASS` 的必要条件：**WPS 后台真实出现新 Record**（只读列举 Δ>0）。手机显示成功但后台无 Record 不得 PASS。

---

## 四、Test D：恢复后自然 Pull —— 【未执行】

恢复测试环境后，**禁止**手工 Pull / 手工调用 Pull API / 手工同步 / 手工触发 Scheduler，只等现有 Scheduler 自然运行。

然后只读执行：
```
cd G:\hse-dashboard\server
node scripts/_arch03p1_verify_introspect.cjs
node scripts/_arch03p1_verify_wps_list.cjs
```
比较 `WPS新增数 = PG新增数 = sync_map新增数`，并验证 `重复数 = 0`、Record ID ↔ PG id 一一对应。

判定：`PULL_RECOVERY_PASS`（一致且无重复）/ `NEEDS_MORE_WAIT`（等待窗口内 Scheduler 尚未运行，禁人工代替）。

---

## 五、Test E：Attachment 图片实证 —— 【未执行】

分别提交：无图 / 单图 / 多图 各 ≥1 条。本任务**不实现** Attachment Bridge。

需记录：

| Record ID | Attachment 保存 | uploadId | source | 有 download_url? | 需鉴权? | 提交后立即可访问? | 恢复电脑后可访问? | 隔段时间仍可访问? |
|-----------|----------------|----------|--------|-----------------|----------|------------------|------------------|------------------|
| (待人工回填) | | | | | | | | |

**重点**：若 `download_url` 无法证明长期稳定 ⇒ `IMAGE_URL_LONG_TERM = NEEDS_EXTERNAL_CONFIRMATION`，**不得写 PASS**。

---

## 六、Test F：重复提交基线 —— 【未执行】

同账号、完全相同业务内容连续提交 2 次 ⇒ 预期 WPS 产生两个不同 Record（A≠B）。等自然 Pull 后只读验证 PG 2 条、sync_map 2 条、分别对应 A/B。

明确输出：
- `PULL_IDEMPOTENCY = PASS/FAIL`（由 `UNIQUE(wps_record_id,wps_file_id)` 保证，已只读确认索引存在、当前 conflict=0）
- `BUSINESS_DUPLICATE_IDEMPOTENCY = NOT_IMPLEMENTED`（当前无 client_token，本测试只建基线，禁实现）

---

## 七、Test G：05-H-0 冻结最终复核 —— 【冻结复核PASS】

逐条只读复核（真实代码位置 + 数据基线双重证据）：

| # | 复核项 | 结果 | 证据 |
|---|--------|------|------|
| 1 | FIELD_MAP 未修改 | PASS | git 冻结文件仅 `??` 无 `M`；FIELD_MAP 映射未变 |
| 2 | SYNC_PROJECTION 未修改 | PASS | `SYNC_PROJECTION_ORDER` (wpsFieldMap.js:107) 18+5 列未变 |
| 3 | SYNC_PROJECTION_ORDER 未修改 | PASS | 同上 |
| 4 | PROTECTED_COLUMNS 未修改 | PASS | `['grid_id','inspector_employee_id']` (wpsFieldMap.js:127) 未变 |
| 5 | canonicalHash 未修改 | PASS | `canonicalHash`(wpsGridPullEngine.js:163)/`toCanonicalDto`(L116)/`toLegacyHashDict`(L147) 未变 |
| 6 | sync_hash 未异常变化 | PASS | `sync_map.sync_hash` 2061/2061 全非空；既有 2061 条 hash 未变 |
| 7 | 既有 PG 正式数据无变化 | PASS | `gir=2061`、`baseline_delta` 全 0 |
| 8 | sync_map 既有数据无变化 | PASS | 计数 2061（Δ0）、`conflict=0`、结构 11 列未变 |
| 9 | 生产 5876 仍 PID 23396 | PASS | netstat 确认 23396 LISTENING |
| 10 | 生产数据库正式数据无变化 | PASS | 无新记录、无 DML（只读核验） |
| 11 | WPS-PG-SYNC 05-H-0 仍冻结 | PASS | `.env` 未改；三开关口径不变；生产未停 |

**sync_hash 真源（代码审计结论）**：`SYNC_PROJECTION_ORDER` 前 18 列（`SYNC_HASH_COLUMNS=slice(0,18)`，L118），SHA-256 over `''≡null` 拼 `|`；与 WPS `field_id`/列序/未映射字段无关。新增 WPS 字段（如 `client_token`）被静默忽略 ⇒ `CLIENT_TOKEN_FIELD_COMPATIBLE_WITH_FREEZE`。

---

## 八、WPS Record ID 清单 —— 【未执行】（空）

系统侧 `delta_vs_baseline = 0`，无任何 09-08 之后新记录。回填格式（人工执行 Test A/B/C 后）：
```
Record ID | 提交时间 | 提交账号 | 是否带图 | 创建人/填写者
----------|----------|----------|----------|----------------
```

## 九、PG 新增记录清单 —— 【未执行】（空）

`new_records(id>7192) = 0`。回填格式：
```
PG id | wps_record_id | inspector_employee_id | grid_id | created_at
-------|---------------|-----------------------|---------|-----------
```
> 注：当前无正式身份归属组件，`inspector_employee_id=NULL`/`grid_id=NULL` 属预期，不得自行补写。

## 十、sync_map 映射清单 —— 【未执行】（空）

`test_d_new_in_sync_map = 0`。回填：`wps_record_id ↔ pg_record_id` 一一对应、无重复、无 conflict。

## 十一、身份证据 —— 【未执行】

依赖 Test B 人工回填（见第二节）。

## 十二、Attachment 证据 —— 【未执行】

依赖 Test E 人工回填（见第五节）。

## 十三、WPS 缓冲证据 —— 【未执行】

依赖 Test C 人工回填（见第三节）；当前 WPS Δ=0 即"尚未发生"。

## 十四、自然 Pull 恢复证据 —— 【未执行】

依赖 Test D 人工回填（见第四节）。

## 十五、重复提交证据 —— 【未执行】

依赖 Test F 人工回填（见第六节）。

---

## 十六、05-H-0 冻结复核 —— 见第七节【冻结复核PASS】

## 十七、风险清单

| 风险 | 等级 | 状态 | 说明 |
|------|------|------|------|
| R1 身份桥接缺口 | 高 | 【NEEDS_EXTERNAL_CONFIRMATION】 | 待 Test B 确认真实 WPS 账号标识 |
| R2 图片长期可用性 | 中 | 【NEEDS_EXTERNAL_CONFIRMATION】 | 待 Test E 验证 download_url 稳定性 |
| R3 关机缓冲依赖 WPS 在线 | 低 | 【未执行】 | 待 Test C |
| R4 业务重复提交 | 中 | 【未执行】 | 待 Test F 基线 |
| R5 生产误触 | 高（已规避） | — | 全程只读、0 生命周期操作；5876/PG/`.env` 未碰 |

---

## 十八、P2 是否允许 —— 不允许

升级 `READY_FOR_P2` 须同时满足 A–H 八项（表单可用 / 身份稳定标识 / WPS 真实保存 / 恢复自然 Pull / 三者数量一致 / 无重复 / 图片有路径 / 05-H-0 保持）。当前八项**全未满足**（人工实证零数据）。

⇒ **维持 `PHASE_HSE_MOBILE_GRID_ARCH_03P1_COMPLETED_WITH_EXTERNAL_DEPENDENCIES`**。

---

## 十九、未解决问题

1. WPS 提交者返回的"稳定唯一账号标识"具体字段与取值（Test B）。
2. WPS Attachment `download_url` 有效期/鉴权/长期稳定性（Test E）。
3. 关机期间提交的记录，恢复后 Scheduler 自然 Pull 是否完整追赶且不重复（Test C+D）。
4. 同内容重复提交在现有系统下的真实行为（Test F 基线）。
5. `client_token` 是否最终落地（冻结期外决策，本阶段禁止）。

---

## 二十、明确下一步（人工执行协议）

**现在需要用户（管理员 / 真实手机）人工操作，WorkBuddy 不会替代执行。请按顺序执行并把结果回填：**

1. **Test A**：在 `cn229thwalDs / sheet 3` 确认/创建手机表单视图（登录后填写、企业内部、收集填写者信息、暴露业务+图片字段、隐藏 `grid_id`/`inspector_employee_id`/sync 内部/镜像字段），记录 §一 6 字段。
2. **Test B**：2～3 个真实网格巡查账号各提交 1 条 → 记录 §二字段 → 判 `IDENTITY_BRIDGE_*`。
3. **Test C**：**先证明测试环境隔离**（≠23396 / ≠5876 / ≠生产库 / ≠生产.env）后，使本地测试业务不可用，手机提交 3～5 条 → 记录 §三字段。
4. **Test E**：真机提交无图/单图/多图各 1 条 → 记录 §五字段。
5. **Test D**：恢复测试环境，**不手工 Pull**，等 Scheduler 自然运行，回填 PG 新增 + sync_map 映射。
6. **Test F**：同账号同内容提交 2 次 → 回填两 Record ID。

**回填后**，WorkBuddy 将重跑两个只读脚本核验 `WPS数 = PG新增 = sync_map新增`、重复=0，并据真实证据重新判定状态机。

---

## 进度状态

```
当前阶段：PHASE_HSE_MOBILE_GRID_ARCH_03P1_COMPLETED_WITH_EXTERNAL_DEPENDENCIES
（含外部依赖未闭环，非成功亦非失败）
```

八项 P2 升级条件全部未满足，**不允许进入 P2**。本任务结束后不自动进入 P2 开发。

---

## 只读操作清单（可复现，全程 0 写）

| 操作 | 命令/文件 | 性质 |
|------|-----------|------|
| 生产状态只读 | `netstat -ano \| grep :5876` + `tasklist` | 只读观测，0 操作 |
| PG 只读内省 | `scripts/_arch03p1_verify_introspect.cjs`（纯 SELECT） | 0 DDL/0 DML |
| WPS 只读列举 | `scripts/_arch03p1_verify_wps_list.cjs`（`list_by_page`，无写） | 0 OpenAPI 写 |
| 冻结代码常量复核 | `Grep` wpsFieldMap.js / wpsGridPullEngine.js | 只读 |

*本报告所有"未执行"项均基于系统侧真实空数据，绝无伪造 WPS Record ID、手机测试结果、图片 URL 或提交者身份。*

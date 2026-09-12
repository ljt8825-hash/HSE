# HSE-MOBILE-GRID-ARCH-03-P1-VERIFY-FINAL：WPS云端缓冲人工真机最终验证报告

> 任务类型：**STRICT READ-ONLY + 人工外部实证整理**（非开发）
> 报告生成时间：2026-09-12 20:17 (GMT+8)
> 生产状态：**5876 / PID 23396 / SYSTEM 全程未触碰**（只读观测，0 生命周期操作）
> 当前冻结态维持：`PHASE_HSE_MOBILE_GRID_ARCH_03P1_COMPLETED_WITH_EXTERNAL_DEPENDENCIES`

---

## 〇、证据分层声明（必读）

本报告所有结论严格区分证据来源，严禁把"设计可行"写成"真实运行通过"：

| 标签 | 含义 | 本报告中的分布 |
|------|------|----------------|
| 【代码审计PASS】 | 基于真实源码逐行审计 + 只读数据佐证 | 冻结复核、03-B 兼容性、sync_hash 分析 |
| 【冻结复核PASS】 | 代码常量 + 数据基线双重复核对齐 P1 | 05-H-0 冻结复核 |
| 【人工实证PASS】 | 真实手机/WPS 管理员操作产生系统侧数据并已只读核验 | **无**（无数据） |
| 【人工实证FAIL】 | 真实操作产生可证伪失败 | **无**（未执行） |
| 【NEEDS_EXTERNAL_CONFIRMATION】 | 依赖外部能力，当前无证据闭环 | 图片 URL 长期稳定、身份桥具体形态 |
| 【未执行】 | 需人工/真机完成，系统侧无任何证据 | Test A–F 全部 |

**关键事实**：截至本报告生成时刻，系统侧（WPS + PostgreSQL）**没有任何人工测试产生的数据**。因此 Test A–F 一律标记为【未执行】，不得升级为 PASS。

---

## 一、WPS 表单配置（Test A）

**状态：【未执行】**

系统侧证据：本次只读 WPS 列举 `total_wps_records = 2063`，与 P1 基线 **Δ=0**，最新记录 `createdTime = 2026/09/08 19:11:02`。自 09-08 起无任何新 WPS 记录 ⇒ 表单视图即使已创建、也尚未产生任何手机提交。

**需用户人工完成并记录以下字段（回填后我方可只读核验）**：

| 需记录项 | 说明 |
|----------|------|
| form/view 标识 | WPS 表单视图 ID |
| 表单链接 | 手机访问 URL |
| 分享权限 | 企业内部 / 登录后填写 |
| 是否启用"收集填写者信息" | 及其高级字段（创建人/填写者） |
| 实际暴露字段 | 巡查业务字段 + 问题照片 Attachment 字段 |
| 实际隐藏字段 | `grid_id`、`inspector_employee_id`、巡查人员ID、sync 内部字段、链接镜像字段 |

---

## 二、测试账号（Test B 前置）

**状态：【未执行】**

需使用 **2～3 个真实网格巡查人员账号**。每个账号通过 WPS 表单提交 1 条测试记录。

**禁止**：用姓名直接认定 `employee.id`。

---

## 三、WPS Record ID 清单（Test A/B/C 产物）

**状态：【未执行】—— 清单为空（系统侧无证据）**

本次只读 WPS 列举未返回任何 09-08 之后的新记录。预期回填格式：

```
Record ID | 提交时间 | 提交账号 | 是否带图 | 创建人/填写者显示内容
----------|----------|----------|----------|---------------------
(待人工回填)
```

---

## 四、PG 新增记录清单（Test D 产物）

**状态：【未执行】—— 清单为空（系统侧无证据）**

只读 PG 内省：`grid_inspection_records` 计数 **2061**（Δ=0 vs P1），`MAX(id)=7192`，`new_records(id>7192)=0`。无任何新增 PG 行。

预期回填（电脑恢复 + Scheduler 自然 Pull 后）：

```
PG id | wps_record_id | inspector_employee_id | grid_id | created_at
-------|---------------|-----------------------|---------|-----------
(待人工回填)
```

> 注：当前无正式身份归属组件，`inspector_employee_id = NULL` / `grid_id = NULL` 属**预期现象**，不得自行补写。

---

## 五、sync_map 映射清单（Test D 产物）

**状态：【未执行】—— 清单为空（系统侧无证据）**

只读 PG 内省：`grid_record_sync_map` 计数 **2061**（Δ=0），`test_d_new_in_sync_map=0`，`conflict=0`，`UNIQUE(wps_record_id, wps_file_id)` 索引完好。

预期回填：`wps_record_id` ↔ `pg_record_id` 一一对应，无重复、无 conflict。

---

## 六、图片 Attachment 结果（Test E）

**状态：【未执行】（外部能力【NEEDS_EXTERNAL_CONFIRMATION】）**

本阶段**不实现** Attachment Bridge，仅外部能力验证。需真机提交：无图 / 单图 / 多图 各至少 1 条。

需回填字段：

| 项 | 待回填 |
|----|--------|
| Attachment 是否成功保存 | ✓/✗ |
| uploadId 是否可读 | 值 |
| source 内容 | 如 `upload_ks3` / `cloud` |
| 是否可取得 `download_url` | 官方 DBT attachment URL 端点 |
| 是否需要鉴权 | ✓/✗ |
| 提交后立即可访问 / 延迟 | 时间 |
| 恢复电脑后是否仍可访问 | ✓/✗ |
| 隔一段时间再次访问是否有效 | 时间 + ✓/✗ |

**判定纪律**：若无法证明 `download_url` 长期稳定 ⇒ `IMAGE_URL_LONG_TERM = NEEDS_EXTERNAL_CONFIRMATION`，**不得写 PASS**。

---

## 七、身份结果（Test B）

**状态：【未执行】**

需回填每一条测试记录的 WPS 创建人/填写者原始字段：

| 判定项 | 待回填 |
|--------|--------|
| 创建人/填写者显示内容 | 原文 |
| 是否实名 | ✓/✗ |
| 是否存在稳定唯一账号标识（如 WPS open_id / 企业账号 ID） | 值/无 |
| 不同账号是否可区分 | ✓/✗ |
| 每次提交是否稳定一致 | ✓/✗ |

**最终判定三选一**（不开发身份桥）：
- `IDENTITY_BRIDGE_USABLE` — 有稳定唯一 WPS 账号标识
- `IDENTITY_BRIDGE_WEAK` — 只有姓名/昵称
- `IDENTITY_BRIDGE_UNAVAILABLE` — 无法确认提交者

---

## 八、电脑不可用期间提交结果（Test C）

**状态：【未执行】**

**安全前置（红线）**：任何"停止本地服务"动作，必须**先确认**目标不是生产 PID 23396、不是生产 PostgreSQL、不是生产 `.env`。若无法确认测试环境隔离 ⇒ 立即停止该步骤，不得自行选择进程。建议另起一个与 5876 完全独立的测试后端 + 测试数据库进行，绝不影响生产。

需回填：

| Record ID | 提交时间 | 提交账号 | 是否带图 | 提交结果 |
|-----------|----------|----------|----------|----------|
| (待人工回填，3～5 条) | | | | BUFFER_PASS / 真实错误 |

判定：`WPS_BUFFER_REAL_SAVE = PASS`（WPS 云端真实产生记录）/ `FAIL`（记录真实错误）。

---

## 九、恢复后自然 Pull 结果（Test D）

**状态：【未执行】**

**纪律**：恢复测试环境后，**禁止**手工执行 Pull、**禁止**人工调用 WPS Pull API、**禁止**手工触发同步。等待现有 Scheduler 自然运行。

只读核验等式（回填后我方复核）：

```
WPS 新增数  =  PG 新增数  =  sync_map 新增数
重复数      =  0
WPS Record ID ↔ PG id 一一对应
```

判定：`PULL_RECOVERY_PASS`（一致且无重复）/ `PULL_RECOVERY_FAIL`。若 Scheduler 在等待窗口内尚未执行 ⇒ `NEEDS_MORE_WAIT`，不得人工 Pull 代替。

---

## 十、重复提交结果（Test F）

**状态：【未执行】**

同账号、完全相同内容连续提交 2 次 ⇒ 预期 WPS 产生两个不同 Record ID（A≠B）。恢复后自然 Pull ⇒ PG 产生 2 条、sync_map 分别映射 2 个 WPS Record。

**明确区分**：
1. **Pull 幂等** —— 由 `UNIQUE(wps_record_id, wps_file_id)` 唯一约束保证（已通过只读核验：索引存在、当前 conflict=0）。
2. **业务重复提交幂等** —— 当前**未实现** `client_token`，本测试只建基线，**禁止实现**。

---

## 十一、05-H-0 冻结复核（Test G）

**状态：【冻结复核PASS】**

逐条只读复核（真实代码位置 + 数据基线双重证据）：

| # | 复核项 | 结果 | 证据 |
|---|--------|------|------|
| 1 | FIELD_MAP 未修改 | PASS | 无 `M`（git 仅 `??` 未跟踪）；FIELD_MAP 18 列映射不变 |
| 2 | SYNC_PROJECTION 未修改 | PASS | `SYNC_PROJECTION_ORDER` (wpsFieldMap.js:107) 冻结 18+5 列顺序未变 |
| 3 | SYNC_PROJECTION_ORDER 未修改 | PASS | 同上 L107 原文未变 |
| 4 | PROTECTED_COLUMNS 未修改 | PASS | `['grid_id','inspector_employee_id']` (wpsFieldMap.js:127) 未变 |
| 5 | canonicalHash 未修改 | PASS | `canonicalHash` (wpsGridPullEngine.js:163)、`toCanonicalDto`(L116)、`toLegacyHashDict`(L147) 逻辑未变 |
| 6 | sync_hash 未发生异常变化 | PASS | `sync_map.sync_hash` 2061/2061 全非空；既有 2061 条 hash 未变 |
| 7 | 既有 2061 条 PG 正式数据无变化 | PASS | `gir=2061`、`baseline_delta.{gir,sync_map,inspector_null,grid_null,conflict,max_id}` 全 0 |
| 8 | sync_map 既有数据无变化 | PASS | 计数 2061（Δ0）、`conflict=0`、结构 11 列未变 |
| 9 | WPS-PG-SYNC 05-H-0 仍冻结 | PASS | `.env` 未改（WPS_GRID_DATA_SOURCE=false + WPS_GRID_SYNC=true + SCHEDULER_ENABLED=true）；生产 5876 未停 |

**sync_hash 真实计算口径（代码审计结论，任务书必答题）**：
- 真源 = `SYNC_PROJECTION_ORDER` **前 18 列**（`SYNC_HASH_COLUMNS = slice(0,18)`，wpsFieldMap.js:118），SHA-256 over `''≡null` 拼 `|`。
- 参与的 18 列：`nickname, area_team, personnel_name, position, grid_level, inspection_date, violation_behavior, violator_name, violator_gender, violator_age, signup_today, marker, is_resubmit, upload_time, serial_no, image_content, rectified_photo, schematic`。
- **与 WPS `field_id`、WPS 列序、未进入 FIELD_MAP 的字段均无关**。
- 新增 WPS 字段（如 `client_token`）→ `toCanonicalDto/toLegacyHashDict/canonicalHash` 仅遍历 `SYNC_PROJECTION` 而**静默忽略** ⇒ 前 18 列 hash / 变更检测 / sync_map / 既有 2061 行**全不变**。
- 技术结论：`CLIENT_TOKEN_FIELD_COMPATIBLE_WITH_FREEZE`（仅代表技术兼容，非批准加字段）。

---

## 十二、03-B 兼容性

**状态：【代码审计PASS】**

- 03-B 现态（开机时强身份直连 PG 的正式 PG API）与方案 C 双通道互不冲突：WPS 表单通道产出的是"普通 WPS Record"，与 03-B 通道产出的 PG 记录走的是同一套 Pull 消费链。
- 只读核验：`grid_inspection_records` 无 `client_token` 列；`03-B` 相关 `EDITABLE_CAMEL_TO_PG` 等逻辑未被本验证触碰（0 代码改动）。

---

## 十三、风险清单

| 风险 | 等级 | 说明 | 当前状态 |
|------|------|------|----------|
| R1 身份桥接缺口 | 高 | WPS 提交者无稳定账号标识时，只能落 `inspector_employee_id=NULL`，网格长看不到自己记录 | 【NEEDS_EXTERNAL_CONFIRMATION】待 Test B |
| R2 图片长期可用性 | 中 | `download_url` 有效期/鉴权未知，WPS Attachment 不天生可渲染 | 【NEEDS_EXTERNAL_CONFIRMATION】待 Test E |
| R3 关机缓冲依赖 WPS 服务可用性 | 低 | 手机→WPS 表单不依赖本地电脑，但依赖 WPS 云端在线 | 【未执行】待 Test C |
| R4 重复提交 | 中 | 无 `client_token`，同内容多次提交产生多条 PG 记录 | 【未执行】基线待 Test F |
| R5 生产误触 | 高（已规避） | 历史 5881 错连生产库；本验证全程只读、0 生命周期操作 | 已规避，5876/PG/`.env` 未碰 |

---

## 十四、最终状态

```
PHASE_HSE_MOBILE_GRID_ARCH_03P1_COMPLETED_WITH_EXTERNAL_DEPENDENCIES
```

**理由**：只读审计与冻结复核全部 PASS、无硬阻断；但 Test A–F 人工真机实证**尚未产生任何系统侧数据**，主链路与图片桥/身份桥仍是未闭环外部依赖。既非成功亦非失败，维持依赖态。

---

## 十五、是否允许进入 P2

**当前不允许进入 P2。**

升级条件（须全部满足，且由真实证据支撑，不得为推进项目降低证据标准）：

- [ ] A. WPS 表单真实可用（Test A 人工回填）
- [ ] B. 手机可在本地电脑不可用期间提交（Test C `BUFFER_PASS`）
- [ ] C. WPS 云端记录真实保存（Test C）
- [ ] D. 本地恢复后 Scheduler 自然 Pull（Test D）
- [ ] E. WPS → PG → sync_map 数量一致且无重复（Test D `PULL_RECOVERY_PASS`）
- [ ] F. 身份可获得稳定唯一标识或已有明确可行桥方案（Test B）
- [ ] G. 图片 Attachment 有明确可行后续路径（Test E）
- [ ] H. 05-H-0 冻结未受破坏（已 PASS，保持）

全部满足 ⇒ 建议 `PHASE_HSE_MOBILE_GRID_ARCH_03P1_READY_FOR_P2`；若出现硬阻断（WPS 无法保存 / 恢复后无法 Pull / 图片完全不可用 / 身份无法取得 / 05-H-0 被破坏）⇒ `BLOCKED`。

---

## 十六、需用户人工执行的下一步（明确告知）

**现在需要用户（管理员 / 真实手机）人工操作，WorkBuddy 不会替代执行：**

1. **Test A**：在现有生产多维表 `cn229thwalDs / sheet 3` 创建/确认表单视图（登录后填写、企业内部、收集填写者信息、暴露业务+图片字段、隐藏 grid_id/inspector_employee_id/sync 内部/镜像字段）。记录 §一的 6 个字段。
2. **Test B**：2～3 个真实网格巡查账号各提交 1 条，记录 §七字段 → 判定 `IDENTITY_BRIDGE_*`。
3. **Test C**：确认测试环境**非生产**（不是 PID 23396、不是生产 PG、不是生产 `.env`）后，使本地测试业务不可用，手机提交 3～5 条 → 记录 §八字段。
4. **Test E**：真机提交无图/单图/多图各 1 条 → 记录 §六字段。
5. **Test D**：恢复测试环境，**不手工 Pull**，等 Scheduler 自然运行，把 §四/§五清单回填。
6. **Test F**：同账号同内容提交 2 次 → 回填两 Record ID。

**回填后**，WorkBuddy 将重跑两个只读脚本（`_arch03p1_verify_introspect.cjs` + `_arch03p1_verify_wps_list.cjs`）核验 `WPS数 = PG新增 = sync_map新增`、重复=0，并据真实证据重新判定状态机。

---

## 十七、本回合只读操作清单（可复现）

| 操作 | 命令/文件 | 性质 |
|------|-----------|------|
| 生产状态只读 | `netstat -ano \| grep :5876` + `tasklist` | 只读观测，0 操作 |
| PG 只读内省 | `scripts/_arch03p1_verify_introspect.cjs`（纯 SELECT） | 0 DDL/0 DML |
| WPS 只读列举 | `scripts/_arch03p1_verify_wps_list.cjs`（`list_by_page`，无写） | 0 OpenAPI 写 |
| 冻结代码常量复核 | `Grep` wpsFieldMap.js / wpsGridPullEngine.js | 只读 |

**红线遵守确认**：0 业务代码改动 / 0 DDL / 0 业务 DML / 0 WPS OpenAPI 写 / 0 生产生命周期操作 / 0 .env 修改 / 0 实现 client_token/归属/AirScript/桥/H5。

---

*本报告所有"未执行"项均基于系统侧真实空数据，绝无伪造 WPS Record ID、手机测试结果、图片 URL 或提交者身份。*

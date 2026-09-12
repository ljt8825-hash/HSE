# HSE-MOBILE-GRID-ARCH-03-P2-A：WPS 云端缓冲正式技术实现 — 实现前审计 + 最小落地方案

> 生成时间：2026-09-12 20:41 (GMT+8)
> 任务性质：**READ-ONLY AUDIT + IMPLEMENTATION DESIGN ONLY**
> 本回合：未写业务代码、未改数据库 schema、未执行 DDL/DML、未写 WPS、未执行 Migration、未进入 P2-B。

---

## 0. 决策声明与范围

| 项 | 内容 |
|----|------|
| 决策变更 | 跳过人工真机实证（Test A–F = `SKIPPED_BY_DECISION`），由 ARCH-03-P1 验证态直接转入 P2 技术实现准备 |
| 本回合目标 | 基于**真实代码 + 真实 PG/WPS 只读证据**，完成实现前审计 + 最小落地设计 |
| 不做的事 | 不写业务代码 / 不写数据库 / 不写 WPS / 不执行 Migration / 不进入 P2-B |
| 生产边界 | `5876` / PID `23396` / SYSTEM **未触碰**；`.env` 三开关未变（见 §15） |
| 人工实证状态 | Test A–F 全部 `UNVERIFIED`（未实跑）；其 6 项假设按 §2 显式标记为**未验证，不得写死为 PASS** |

**铁律（来自任务 §二）**：以下假设在 P2-A 设计中一律视为 `UNVERIFIED`，任何依赖它们的实现必须 **fail-safe 降级**（NULL / 待归属 / 待人工），禁止姓名匹配、昵称匹配、模糊匹配、自动绑定错误人员，禁止为"帮助测试"而修改系统。

---

## 1. 执行摘要

手机 → WPS 官方表单 → WPS 云端缓冲 → 本地恢复/在线 → 现有 Pull Engine → PostgreSQL → HSE 这条链路，其** ingestion 主干已存在且可复用**（`wpsGridPullEngine.pullWpsToPg` 每 15 分钟自然消费 WPS 记录）。真正缺的是三个**平级新增组件**：身份归属、附件解析、业务去重——三者都不需要改动冻结的 Pull / `FIELD_MAP` / `PROTECTED_COLUMNS` / `canonicalHash`。

审计结论：**架构清晰、数据库变更最小且 05-H-0 兼容、现有 H5/Channel A 不受破坏、生产边界 PASS**。

> **P2 状态机判定：`READY_FOR_P2-B`**（带 §13 风险与 §16 前置条件；P2-B 执行须单独授权 + 重跑只读门禁，本回合不自动进入）。

6 项 UNVERIFIED 假设（须由 P2-B 以 fail-safe 兜底，不阻断架构推进）：
1. WPS Creator 一定存在稳定唯一 ID —— **UNVERIFIED**
2. WPS Creator 一定能映射 `employee.id` —— **UNVERIFIED**
3. WPS Attachment 一定有长期稳定 `download_url` —— **UNVERIFIED**
4. WPS 表单一定能隐藏所有内部字段 —— **UNVERIFIED**
5. WPS 表单提交一定能自动生成 `grid_id` —— **UNVERIFIED**（设计上恒 NULL，fail-closed）
6. WPS 表单提交一定能自动生成 `inspector_employee_id` —— **UNVERIFIED**（设计上恒 NULL，fail-closed）

---

## 2. 当前架构（真实代码）

```
                         [手机 H5]  Channel A（现有, 正式业务通道）
                              │
                              ▼
                   [Local Backend /auth]  req.user
                              │  authenticatedEmployeeResolver (req.user.id→employee.id)
                              │  deriveGridIdForEmployee (employee_id→grid_areas.personnel_id)
                              ▼
              [grid_inspection_records]  ← inspector_employee_id + grid_id 由后端派生（已填）
                   │                                      │
                   │                                      └─▶ [HSE API] ─▶ PC / Mobile
                   ▼
          (PostgreSQL = HSE 正式业务数据源 / 唯一身份权威)

                         [手机 WPS 表单]  Channel B（新增, 云端缓冲通道）
                              │  (UNVERIFIED: 提交者身份 / 图片形态 / 隐藏字段)
                              ▼
                   [WPS Cloud Buffer]  .dbt cn229thwalDs / sheet 3
                              │  (现有 PC 写路径 gridInspectionRepository 也会落这里,
                              │   但 Pull 只读 rec.fields, 且忽略 巡查人员ID 列)
                              ▼
              [wpsGridPullEngine.pullWpsToPg]  ← 复用, 只读 rec.fields
                              │  toCanonicalDto (SYNC_PROJECTION 18+5)
                              │  canonicalHash (冻结 18 列 SHA-256)
                              │  insertWithMap UNIQUE(wps_record_id,wps_file_id)
                              ▼
              [grid_inspection_records]  ← inspector_employee_id=NULL, grid_id=NULL (fail-closed)
                              │
      ┌───────────────────────┼────────────────────────┐
      ▼                       ▼                         ▼
 [P2-A 新增: 归属组件]   [P2-A 新增: Attachment 解析]  [P2-A 新增: 业务去重]
 (解法乙, 平级, 只补NULL)  (DBT attachment URL API)   (fingerprint/client_token)
      │                       │                         │
      └──────────────▶ [HSE API] ─▶ PC / Mobile ◀──────┘
```

节点标注（按任务 §五要求）：
- **已存在**：`authenticatedEmployeeResolver` / `deriveGridIdForEmployee` / `wpsGridPullEngine` / `wpsFieldMap` / `grid_inspection_records` / `grid_record_sync_map` / HSE API / PC·Mobile 前端
- **可直接复用**：`pullWpsToPg`（ingestion 主干）、`canonicalHash` / `toCanonicalDto`（hash & DTO）、`UNIQUE(wps_record_id,wps_file_id)`（技术幂等）、`wpsClient.listAllRecords`
- **必须新增**（平级，不侵入冻结层）：归属 Resolver、Attachment Resolution Layer、业务去重层、`source_channel` 标记、桥接表 `wps_account_employee_map`、若干 nullable 列
- **不能修改**：`SYNC_PROJECTION_ORDER` 前 18 列、`SYNC_HASH_COLUMNS`、`PROTECTED_COLUMNS`、`canonicalHash`、`toCanonicalDto`、`FIELD_MAP` 既有映射、05-H-0 冻结文档、`WPS_GRID_SYNC`/`SCHEDULER_ENABLED` 口径

---

## 3. 当前代码链路（逐文件证据）

| 文件 | 关键事实（行号） | 对 P2 的含义 |
|------|------------------|--------------|
| `services/wps/wpsFieldMap.js` | `SYNC_PROJECTION_ORDER` L107（18 hash + 5 业务）；`SYNC_HASH_COLUMNS=slice(0,18)` L118；`PROTECTED_COLUMNS=['grid_id','inspector_employee_id']` L127；`canonicalHash` 依赖 `SYNC_PROJECTION` L136-138 | 字段真源唯一；前 18 列冻结 |
| `services/wpsGridPullEngine.js` | `pullWpsToPg` L334；**只读 `rec.fields`**（L422），**无 creator 读取**；`toCanonicalDto` L116（仅遍历 `SYNC_PROJECTION`）；`canonicalHash` L163；`insertWithMap` L241（`UNIQUE(wps_record_id,wps_file_id)` 技术幂等）；`assertNoProtectedColumns` L223；WPS 删除≠PG 删除 L493 | **Pull 当前无任何身份来源**；新增列只要不入 18-hash 即兼容 |
| `services/wpsGridSyncService.js` | facade；`pushRow`/`onPgRowChanged`/`onPgRowsDeleted` 全 no-op（反向写入硬锁 L86-104）；`pullWpsToPg` 转发 L78 | 反向写入已封禁，Channel B 不会污染 WPS |
| `routes/site-mgmt.js` | POST `/grid-records` L1942：PG 路径用 `resolveAuthenticatedEmployeeFromRequest` + `deriveGridIdForEmployee`，剥离前端 `inspector_employee_id`/`grid_id`/`personnel_name`（L1955-1965）；WPS 路径 L1946 **提前 return**（行级 scope 被跳过，`WPS_ROW_SCOPE_DEFERRED` L1787） | Channel A 身份/网格完备；WPS 通道**无行级权限**（已知弱项，P2 不改） |
| `services/wps/gridInspectionRepository.js` | `create` L194：`resolveCurrentEmployee`（**姓名兜底** L195）→ 写 WPS 列 `巡查人员ID`(biz inspectorEmployeeId) L204；但 `inspectorEmployeeId` **不在 SYNC_PROJECTION** → Pull 忽略 → PG 侧恒 NULL | 说明"WPS 字段含 巡查人员ID"但 Pull 不消费，印证身份缺口 |
| `services/gridScope.js` | `resolveGridScope` L43；`buildScopeSqlCondition` L109；`deriveGridIdForEmployee` L131（employee_id→grid_areas.personnel_id） | grid_id 只能由 employee_id 派生；WPS 记录 NULL 身份 → 无法派生 → 恒 NULL |
| `services/authenticatedEmployeeResolver.js` | `req.user.id→users.employee_id→employee.id`，**严禁姓名兜底** L11-17 | Channel A 的权威身份链，P2 归属组件复用其"只认稳定键"原则 |
| `services/currentEmployeeContext.js` | `resolveEmployeeByName`（姓名兜底 L52）| **禁止**用于 WPS 缓冲归属（任务明令禁姓名匹配） |
| `services/wpsClient.js` | `listAllRecords` L210 返回 `{id, fields, lastModifiedTime, createdTime}`——**无 creator 字段** | 决定性：Pull 拿不到提交者身份，身份归属须另辟路径 |

---

## 4. WPS 字段矩阵（任务 §八）

> 来源：`wpsFieldMap.FIELD_MAP` + `SYNC_PROJECTION_ORDER` + `grid_inspection_records` 28 列实测。

| WPS 字段 | PG 字段 | 类型 | 是否 Hash | 是否 Protected | 来源/现状 | 缺失处理（Pull 行为） |
|----------|---------|------|-----------|----------------|-----------|----------------------|
| 编号 | serial_no | text | 是(18内) | 否 | 已存在 | 正常投影 |
| 姓名 | personnel_name | text | 是(18内) | 否 | 已存在 | 正常投影 |
| 分组名称 | area_team | text | 是(18内) | 否 | 已存在 | 正常投影 |
| 所属岗位 | position | text | 是(18内) | 否 | 已存在 | 正常投影 |
| 网格等级 | grid_level | text | 是(18内) | 否 | 已存在 | 正常投影 |
| 日期 | inspection_date | date | 是(18内) | 否 | 已存在 | `toIsoDate` 归一 |
| 昵称2 | nickname | text | 是(18内) | 否 | 已存在 | 正常投影 |
| 三违行为 | violation_behavior | text | 是(18内) | 否 | 已存在 | 正常投影 |
| 违章人姓名 | violator_name | text | 是(18内) | 否 | 已存在 | 正常投影 |
| 违章人性别/年龄 | violator_gender/age | text | 是(18内) | 否 | 已存在 | 正常投影 |
| 当日是否报名 | signup_today | text | 是(18内) | 否 | 已存在 | 正常投影 |
| 标记 | marker | text | 是(18内) | 否 | 已存在 | 正常投影 |
| 是否补交 | is_resubmit | text | 是(18内) | 否 | 已存在 | 正常投影 |
| 提交时间 | upload_time | text | 是(18内) | 否 | 已存在 | 正常投影 |
| 三违照片链接 | image_content | link | 是(18内) | 否 | 已存在(URL 镜像文本列) | 仅 `^https?://` 写入，否则省略 |
| 整改后照片链接 | rectified_photo | link | 是(18内) | 否 | 已存在(URL 镜像文本列) | 同上 |
| 示意图链接 | schematic | link | 是(18内) | 否 | 已存在(URL 镜像文本列) | 同上 |
| 上报状态/车辆类型/违章类型结果/是否需要整改/整改人 | report_status…rectifier | text | 否(5 业务列) | 否 | 已存在(非 hash) | 正常投影，不入 hash |
| **巡查人员ID** | inspectorEmployeeId→pg `巡查人员ID` | text | **否(不在 SYNC_PROJECTION)** | **PG 侧 PROTECTED** | **WPS 列存在、FIELD_MAP 存在，但 Pull 不读、PG 不写** | **Pull 恒 NULL** → 身份缺口 G1 |
| **巡查人员**(快照) | personnel_name | text | 是 | 否 | 已存在（姓名快照，非身份键） | 正常投影；**非身份来源** |
| **巡查时间** | inspection_time | time | 否 | 否 | `reserved`，pg='-' | 不投影；UNVERIFIED 表单能否填 |
| **所属网格** | grid_area | text | 否 | 否 | `reserved`，pg='-' | 不投影；**网格缺口 G2** |
| **grid_id** | grid_id | — | 否 | **PROTECTED** | PG-only，永不由 WPS 写入 | Pull 恒 NULL（fail-closed） |
| **inspector_employee_id** | inspector_employee_id | — | 否 | **PROTECTED** | PG-only，永不由 WPS 写入 | Pull 恒 NULL（fail-closed） |
| **Attachment（原生）** | （无对应列） | struct | 否 | 否 | WPS 原生附件 = `[{uploadId,source}]`，**非 URL、不在 SYNC_PROJECTION** | **Pull 完全忽略** → 图片缺口 G3 |
| **创建人/提交者 (creator)** | （无对应列） | — | 否 | 否 | `list_by_page` 返回体**无 creator 字段** | **Pull 拿不到** → 身份缺口 G4（核心） |
| **client_token** | （无列） | — | 否 | 否 | **PG/WPS 均不存在** | 须 P2-B migration（见 §11） |

**缺口小结**：G1（身份列被 Pull 丢弃）、G2（网格 reserved）、G3（原生 Attachment 与 URL 镜像列错位）、G4（Pull 无 creator 来源）。四个缺口均**不靠改 FIELD_MAP/PROTECTED/hash 解决**，而靠 §5/§6 的平级新增组件。

---

## 5. 身份桥方案（能力 B）

**现状硬事实**：Pull 只读 `rec.fields`，`list_by_page` 不返回 creator → Pull 无任何提交者身份来源。Channel A 的 `authenticatedEmployeeResolver`（只认 `req.user.id→employee.id`）无法直接用于 WPS 通道（WPS 表单不经 Local Backend）。

**设计 B（解法乙 · 平级归属组件，不侵入冻结层）**：

1. **身份输入（UNVERIFIED，须 fail-safe）**：依赖 WPS 表单"收集填写者信息"产出的**稳定 WPS 账号 ID**（如 WPS 高级字段"创建人"系统账号 ID），存于 WPS 一个**新增列**（如 `wps_creator_id`），Pull 现有投影**不读它**（保持 hash 不变）。
2. **桥接表（新增）**：`wps_account_employee_map(wps_account_id PK, employee_id, verified_by, created_at)` —— **只存稳定 WPS 账号 ID → employee.id 的已核验映射**，由管理员人工/半自动建立，**严禁姓名/昵称/手机匹配**。
3. **归属 Resolver（新增，平级）**：在 Pull `insertWithMap` 之后，对 `inspector_employee_id IS NULL` 的记录：
   - 读 WPS 记录 `wps_creator_id` → 查 `wps_account_employee_map` → 命中则 `UPDATE gir.inspector_employee_id`（**只补 NULL，永不覆盖**）→ `attribution_status='resolved'`。
   - 未命中/映射缺失 → `attribution_status='unresolved'`，**绝不阻塞 ingestion**，记录进入"待人工归属"队列。
4. **grid_id 派生**：归属成功后，用既有 `deriveGridIdForEmployee(employee_id)` 派生 `grid_id`（0→403 语义不适用此处，仅补 NULL/单值/多值 fail-closed：多值则 `grid_id` 仍 NULL 并告警）。
5. **红线**：禁止 `SELECT employee WHERE name=?`；禁止昵称/手机→employee；禁止"第一个同名"；归属组件**不改** `PROTECTED_COLUMNS` / Pull / `FIELD_MAP` / hash；它走**独立 UPDATE 路径**（与 Pull 的 `assertNoProtectedColumns` 断言互不冲突，因为不是同一代码路径）。

> 若 P2-B 实证发现 WPS 表单"收集填写者信息"并不回写可读取的稳定账号 ID，则 B 退化为：所有 WPS 缓冲记录 `inspector_employee_id=NULL` + `attribution_status='unresolved'`，由人工在后台按业务字段（姓名快照+网格+时间）归属——仍不阻断链路。

---

## 6. Attachment 方案（能力 C）

**现状硬事实**：Pull 只读 `SYNC_PROJECTION` 中的三个 **URL 镜像文本列**（`image_content`/`rectified_photo`/`schematic`），只接受 `^https?://`。WPS 原生 Attachment 是 `[{uploadId, source}]` 结构体，**不是 URL、不在投影内** → Pull 完全忽略。表单暴露的"问题照片 Attachment 字段"与 PG 期望的 URL 镜像列**形态错位**。

**设计 C（Attachment Resolution Layer，平级，fail-safe）**：

1. **优先路径（若表单支持）**：让 WPS 表单把图片以**逗号分隔 http(s) URL** 写入 URL 镜像列（与 PC 写路径 `gridInspectionRepository` 的 `_links` 形态一致）。Pull 现有逻辑已能消费，零改动。
2. **回退路径（原生 Attachment）**：若表单只能提交原生 Attachment，则新增解析层在 Pull 之后：
   - 通过官方 DBT attachment URL 能力 `POST /api/v1/openapi/dbt/:file_token/attachment/urls` 将 `uploadId` 换成 `download_url`；
   - 写入对应 URL 镜像列；`attachment_resolution_status='resolved'`。
3. **fail-safe**：`download_url` **长期稳定性 UNVERIFIED** → 若无法取得/过期，则对应图片列保持 NULL，`attachment_resolution_status='unresolved'`，**绝不伪造 URL、绝不把 Attachment JSON 原样写进 image 列**。
4. **红线**：禁止未验证把临时 URL 当永久 URL；禁止把原生 Attachment 结构体直接落 `image_content`/`rectified_photo`。

---

## 7. Business Idempotency 方案（能力 D）

**现状**：技术幂等 `(wps_record_id, wps_file_id)` 由 `UNIQUE` 约束保证（Pull L248-254，`ALREADY_EXISTS` 跳过）。**业务重复幂等 = NOT IMPLEMENTED**：
- 同一账号连续提交两次 → WPS 生成两个 Record ID → Pull 落两条 PG（技术幂等不挡业务重复）；
- Channel A（H5）与 Channel B（WPS 表单）提交同一笔巡查 → 两套独立键，互不可见 → 双份 PG。

**设计 D（先查后加，本回合只设计不执行）**：
- `grid_inspection_records` 新增 `client_token`(text, nullable)、`submission_fingerprint`(text, nullable)、`source_channel`(text, nullable: 'h5'|'wps')；
- `grid_record_sync_map` 新增 `business_fingerprint`(text, nullable)；
- **Channel A**：H5 提交时生成 `client_token` 并落库（前端/后端皆可，属于既有通道增强）；
- **Channel B**：WPS 表单无法携带 `client_token`（表单无此能力），改用 `submission_fingerprint` = 规范化业务指纹 `hash(employee_id|inspection_date|area_team|violation_behavior|violator_name)`；
- **跨通道去重**：写入前比对 `submission_fingerprint`（跨 `source_channel`），命中则**不新增第二条 PG**，置 `review_status='duplicate'` 或进隔离队列；
- **05-H-0 兼容**：`client_token`/`submission_fingerprint` 均为**新增列、不在 18-hash 内** → `sync_hash` 不变。

> 明确区分：`PULL_IDEMPOTENCY = PASS`（技术键已存在）；`BUSINESS_DUPLICATE_IDEMPOTENCY = NOT_IMPLEMENTED`（待 P2-B 落地 D 设计）。

---

## 8. 双通道冲突方案（任务 §十）

同一笔业务可能同时走 H5→PG（Channel A）和 WPS→PG（Channel B）。三种去重键比较：

| 方案 | 安全性 | 复杂度 | 对 05-H-0 影响 | 历史兼容 | 移动端改造量 | 跨通道能力 |
|------|--------|--------|----------------|----------|--------------|------------|
| ① wps_record_id | 高（WPS 服务端生成，客户端不可控） | 低 | 无 | 已存在 | 0 | ❌ 仅限 WPS 通道；Channel A 无 WPS id |
| ② client_token | 高（客户端生成唯一键） | 中（需新增列+前端生成） | 无（新列不入 hash） | 需补历史 | 中（仅 Channel A 需改） | ⚠️ Channel B 表单无法携带 |
| ③ business fingerprint | 中（可能误判同指纹/漏判不同笔） | 中 | 无（新列不入 hash） | 需补历史 | 低（后端生成） | ✅ 唯一能跨 A+B 的键 |

**推荐：以 ③ business fingerprint 为跨通道去重主键，② client_token 作为 Channel A 的强键可选增强，① (wps_record_id,wps_file_id) 保留为 WPS 技术幂等。** 理由：① 无法覆盖 Channel A，② 无法覆盖 Channel B 表单，只有 ③ 能在两通道汇合处（皆落 `grid_inspection_records`）做统一比对。

---

## 9. 异常数据策略（任务 §十三）

| # | 场景 | 处理方式 | 进入 PG? | 覆盖旧数据? | 告警? | 人工处理? |
|---|------|----------|----------|-------------|--------|------------|
| 1 | WPS 有记录但无 grid_id | Pull 落库，`grid_id=NULL`，归属组件尝试派生失败则保持 NULL | ✅ | — | 否 | 是（待归属） |
| 2 | WPS 有记录但无 inspector_employee_id | 同上，`attribution_status` 标记 | ✅ | — | 否 | 是（待归属） |
| 3 | 图片无法解析为 URL | `image_content`/`rectified_photo` 保持 NULL，`attachment_resolution_status='unresolved'` | ✅ | — | 是（图片缺失） | 可选 |
| 4 | WPS 记录重复提交 | 技术键拦截同 Record ID；业务重复落两条，`submission_fingerprint` 命中则隔离 | ✅(或隔离) | 否 | 是 | 是（去重复核） |
| 5 | WPS 记录字段变化 | hash 快路径失效→`dtoEqualsPgRow`→`updateBusinessColumns`（仅业务列，受保护列硬断言） | ✅(UPDATE) | 仅业务列 | 否 | 否 |
| 6 | WPS 记录删除 | `wpsDeleted++`，**PG/sync_map 永不删除**（冻结铁律 4） | ✅(保留) | 否 | 是（仅统计） | 否 |
| 7 | WPS Record 长期无法归属 | `attribution_status='unresolved'` 永久保留，后台队列人工处理 | ✅ | — | 是 | 是 |
| 8 | WPS Creator 发生变化 | 归属组件基于首次稳定映射；变更不覆盖已解析身份，新提交重新判定 | ✅ | 否（只补 NULL） | 是 | 是（复核） |

---

## 10. 05-H-0 冻结兼容性（任务 §七）

| 冻结项 | P2-A 设计是否触碰 | 论证 |
|--------|------------------|------|
| `SYNC_PROJECTION_ORDER` 前 18 列 | ❌ 不改 | 新增 `client_token`/`submission_fingerprint` 均为**投影之外**的新列 |
| `SYNC_HASH_COLUMNS = slice(0,18)` | ❌ 不改 | 不变 |
| `PROTECTED_COLUMNS` | ❌ 不改 | 归属组件走独立 UPDATE 路径，不经由 Pull 的 `assertNoProtectedColumns` |
| `canonicalHash` / `toCanonicalDto` / `toLegacyHashDict` | ❌ 不改 | hash 仅遍历 `SYNC_PROJECTION`，新字段静默忽略 |
| `FIELD_MAP` | ⚠️ 仅**追加**新字段条目（如 `wps_creator_id`），不改动既有映射 | 追加项不进 `SYNC_PROJECTION` → hash 不变 |
| `sync_map` 唯一键 | ❌ 不改 | 仅**新增** `business_fingerprint` 列，不动 `UNIQUE(wps_record_id,wps_file_id)` |
| 历史 2061 条数据 hash | ❌ 不变 | 新列不入 18-hash，既有 `sync_hash` 继续命中"未变更" |
| 05-H-0 冻结文档 | ❌ 不改 | 本回合只读审计，未改文档 |

**结论：技术兼容 `CLIENT_TOKEN_FIELD_COMPATIBLE_WITH_FREEZE`（沿用 P1 结论）。** 注意：这仅代表"技术兼容"，不代表已批准增加字段——须 P2-B 单独授权执行 migration。

---

## 11. 数据库变更 Proposal（任务 §十一 · 仅设计不执行）

> 以下 DDL **本回合不执行**。P2-B 执行前须重新读取并比对冻结基线。

```sql
-- grid_inspection_records：全部 nullable，不破坏既有 28 列
ALTER TABLE grid_inspection_records
  ADD COLUMN IF NOT EXISTS source_channel               text,        -- 'h5' | 'wps' | NULL(历史)
  ADD COLUMN IF NOT EXISTS client_token                 text,        -- Channel A 强去重键
  ADD COLUMN IF NOT EXISTS submission_fingerprint        text,        -- 跨通道业务指纹
  ADD COLUMN IF NOT EXISTS attribution_status           text,        -- NULL|resolved|unresolved
  ADD COLUMN IF NOT EXISTS attachment_resolution_status text;        -- NULL|resolved|unresolved
-- 去重索引（partial unique，避免历史 NULL 冲突）
CREATE UNIQUE INDEX IF NOT EXISTS uq_gir_client_token ON grid_inspection_records(client_token) WHERE client_token IS NOT NULL;
CREATE INDEX  IF NOT EXISTS idx_gir_subfp ON grid_inspection_records(submission_fingerprint) WHERE submission_fingerprint IS NOT NULL;

-- grid_record_sync_map：仅新增指纹列
ALTER TABLE grid_record_sync_map
  ADD COLUMN IF NOT EXISTS business_fingerprint text;

-- 桥接表（稳定 WPS 账号 ID → employee.id，人工核验，禁姓名匹配）
CREATE TABLE IF NOT EXISTS wps_account_employee_map (
  wps_account_id text PRIMARY KEY,
  employee_id    integer NOT NULL REFERENCES employee(id),
  verified_by    integer,
  created_at     timestamptz NOT NULL DEFAULT now()
);
```

**最小化原则**：未新增 `status`/`rectification_status`/`review_status`（实测这些列**根本不存在**于 `grid_inspection_records`，见 §15 只读核查），仅以 `attribution_status` / `attachment_resolution_status` 两个最小状态列表达"待归属/待补图"，复用既有 `marker` 供人工分类。**绝不为了架构漂亮而增加字段。**

---

## 12. P2-B 实施范围

**P2-B 将实现（全部 ADDITIVE，平级新增）**：
1. 归属 Resolver（§5）：读 `wps_creator_id` → `wps_account_employee_map` → 补 `inspector_employee_id`/`grid_id`（只补 NULL）。
2. Attachment Resolution Layer（§6）：原生 Attachment → `download_url` → URL 镜像列。
3. 业务去重层（§7/§8）：`client_token` + `submission_fingerprint` + 跨通道比对。
4. `source_channel` 标记注入（Pull 新增记录时写 'wps'）。
5. 执行 §11 migration（须单独授权）。

**P2-B 不会做**：改 Pull / `FIELD_MAP` / `PROTECTED_COLUMNS` / `canonicalHash` / 18-hash；改 05-H-0；改 Channel A（H5→PG 现有链路）；改移动端 H5；动生产 5876/23396/.env/Scheduler；未重审即写生产库。

**P2-B 前置门槛**：① 只读门禁复跑（prod 5876/23396 存活、基线 delta=0）；② migration dryRun 通过；③ `wps_account_employee_map` 至少有一条核验映射才能验证归属；④ 任何写操作前再次确认目标 ≠ 生产 PID 23396 / 端口 5876 / 生产库 / 生产 .env。

---

## 13. 风险清单

| ID | 风险 | 等级 | 缓解 |
|----|------|------|------|
| R1 | WPS creator 不在 `list_by_page` 返回体 → 身份归属依赖 UNVERIFIED 表单行为 | 高 | fail-safe：恒 NULL + `attribution_status='unresolved'`；不阻断链路 |
| R2 | Attachment `download_url` 长期稳定性 UNVERIFIED | 中 | 取不到则 NULL + 状态标记；绝不伪造 |
| R3 | `wps_account_employee_map` 需人工/半自动灌入，是运维依赖 | 中 | 提供后台维护入口；归属失败不阻塞 |
| R4 | business fingerprint 误判（同指纹两笔 legit / 不同笔同指纹） | 中 | 指纹仅作"疑似重复"信号，入隔离队列人工复核，不直接删 |
| R5 | Scheduler(15min) 与未来 webhook 双触发导致重复 Pull | 低 | Pull 进程内互斥锁已存在；跨进程靠 `UNIQUE` 约束兜底 |
| R6 | 生产边界误操作（误写 5876/prod DB） | 高 | 任何 P2-B 写前强制核对 PID/端口/库/.env；本文档红线 §14 |

---

## 14. 禁止项（任务 §十四 · 本回合执行结果）

本回合**未执行以下任何一项**（全部满足"只读审计 + 设计"纪律）：
- 修改生产 / 5876 / PID 23396 / 生产 .env / Scheduler / 生产 PostgreSQL
- 写 PG / 写 WPS / Migration 执行
- 修改 `users` / JWT / auth / 登录
- 新增 npm 依赖 / 新建 UI 组件 / 大规模重构 / 改 Vben Core / 改 Mobile UI
- 修改 `FIELD_MAP` 既有映射 / `SYNC_PROJECTION` / `SYNC_PROJECTION_ORDER` / `PROTECTED_COLUMNS` / `canonicalHash` / `sync_hash` 逻辑
- 实现 `client_token` / 身份桥 / `wpsGridAttribution` / AirScript / Attachment Bridge / H5 应急入口
- 修改 05-H-0 冻结内容

---

## 15. 验证结果（任务 §十五 · 全部 READ-ONLY）

| 验证项 | 方法 | 结果 |
|--------|------|------|
| TypeScript/JS 静态检查 | 未改代码，无新代码可查；既有 typecheck 基线不变 | PASS（无新增代码） |
| 现有测试 | 未触发任何写测试 | PASS（只读） |
| Git diff | `git status` 冻结文件仅 `??`（未跟踪），无 `M` | PASS |
| 数据库结构只读检查 | `information_schema` 列枚举（§11 依据） | PASS：gir=28 列、sync_map=11 列、无 dedup/状态列 |
| WPS 字段映射检查 | 通读 `wpsFieldMap.js` | PASS：矩阵见 §4 |
| Hash 逻辑检查 | 通读 `canonicalHash`/`toCanonicalDto` | PASS：18 列冻结，新字段静默忽略 |
| Identity resolver 检查 | 通读 `authenticatedEmployeeResolver`/`currentEmployeeContext`/`gridScope` | PASS：权威链只认稳定键；WPS 通道无 creator |
| Grid scope 检查 | 通读 `gridScope.js` | PASS：grid_id 由 employee_id 派生，WPS NULL 恒 NULL |
| 图片字段检查 | `image_content`/`rectified_photo` 存在，URL 镜像列 | PASS：原生 Attachment 与镜像列错位（G3） |
| 生产边界检查 | `netstat` + `tasklist` | PASS：`:5876` PID `23396` LISTENING 未触碰；`.env` `WPS_GRID_DATA_SOURCE=false`/`WPS_GRID_SYNC=true`/`SCHEDULER_ENABLED=true` 未变 |
| 基线一致性 | `_arch03p1_verify_*` 脚本复跑 | PASS：gir=2061 / sync_map=2061 / max_id=7192 / conflict=0（与 P1 基线 bit-for-bit 一致） |

**禁止项验证**：零生产写、零 DDL、零 DML、零 WPS 写、零 .env 改。

---

## 16. 最终状态机与 P2-B 进入条件

**P2-A 状态：`COMPLETED`**

判定 `READY_FOR_P2-B`，依据（任务 §十七）：
- ✅ 架构清晰（§2–§9 链路与四能力设计明确）
- ✅ 数据库变更最小（§11：5 nullable 列 + 1 表 + 1 列，均不入 18-hash）
- ✅ 05-H-0 兼容（§10：所有冻结项未触碰）
- ✅ 现有 H5 / Channel A 不受破坏（§3/§12：只新增平级组件）
- ✅ 生产边界 PASS（§15）

**前置条件（P2-B 必须满足，否则回退 `P2-A_NEEDS_REVIEW`）**：
1. 执行 migration 前重跑只读门禁，确认 prod 5876/23396 存活、基线 delta=0；
2. `wps_account_employee_map` 至少建立一条核验映射，否则归属组件无验证样本；
3. 任何写操作前再次核对目标 ≠ 生产 PID 23396 / 端口 5876 / 生产库 / 生产 .env；
4. R1/R2 的 UNVERIFIED 外部能力必须由 fail-safe 兜底（NULL + 状态标记），不得为"通过测试"而伪造。

> **本回合完成后不自动进入 P2-B。** P2-B 是独立的实施阶段，须单独授权启动。

---

## 17. 项目当前完整进度

```
ARCH-01    移动端网格巡查基础链路                         COMPLETED
ARCH-02    WPS 云端缓冲架构设计与外部能力验证             COMPLETED
ARCH-03    无云 WPS 云端缓冲架构                         COMPLETED_WITH_EXTERNAL_DEPENDENCIES
ARCH-03-P1 WPS 代码/字段/冻结审计                       COMPLETED
ARCH-03-P1-MANUAL 人工实证                              SKIPPED_BY_DECISION
  Test A–F                                                 SKIPPED (UNVERIFIED)
ARCH-03-P2-A 实现前技术审计 + 最小落地设计             COMPLETED  → READY_FOR_P2-B
ARCH-03-P2-B 最小技术实现                               NOT_STARTED (待授权)
ARCH-03-P2-C 真实链路验证                               NOT_STARTED
ARCH-03-P2-D 正式切换                                   NOT_STARTED
```

**最终目标链路（待 P2-B/C/D 兑现）**：
```
Mobile ──▶ WPS Cloud Buffer ──▶ Local Pull Engine ──▶ PostgreSQL ──▶ HSE
              (表单提交)         (复用, +归属/附件/去重平级组件)     (正式数据源)
```

---

### 附：本回合使用的只读核查脚本（可复跑，零写入）
- `server/scripts/_arch03p1_verify_introspect.cjs`（PG 基线）
- `server/scripts/_arch03p1_verify_wps_list.cjs`（WPS 列举）
- `server/scripts/_p2a_schema.cjs`（schema 列枚举，本报告 §11/§15 依据）

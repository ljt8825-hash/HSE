# HSE-MOBILE-GRID-ARCH-03-P2-B1-D
# 通道 B「待归属数据」运营闭环设计审计

**任务编号**：`HSE-MOBILE-GRID-ARCH-03-P2-B1-D`
**任务性质**：READ-ONLY DESIGN AUDIT / NO IMPLEMENTATION
**上游状态**：`ARCH-03-P2-B1-C-DECISION = ARCHITECTURE_DECISION_READY`
**执行时间**：2026-09-12 23:30–23:55（GMT+8）
**数据库目标**：`safety_dashboard`（生产，只读 schema/SELECT）+ `safety_dashboard_dev`（隔离测试库，只读）
**最终状态**：**`READY_FOR_P2-B1-D-IMPLEMENTATION`**（附 3 项实施前置条件 P1–P3）

---

## 0. 编号歧义落定（必读）

历史文档中 `P2-B1-D` 存在**两种用法**：

| 用法 | 出处 | 含义 |
|---|---|---|
| 旧义 A | `HSE-MOBILE-GRID-ARCH-03-P2-A-IMPLEMENTATION-AUDIT.md` §`P2-B1-D（Attachment…）` | Attachment 真实解析接入 |
| 旧义 B | P2-B1 系列口头沿用 | WPS Creator 桥接正式启用 |

**本任务正式重新定义该编号**：

> **`P2-B1-D` = 通道 B「待归属数据」运营闭环（设计 → 实施）**，即 WPS 记录进入 PG 后，
> 如何被安全地发现、认领、审计、撤销。

因此：

- 旧义 A（Attachment 解析）**并入** `P2-B1-C-DECISION` 已判定的**可选增强**（前置＝DBT v1 跨面授权，本应用面实测 404），**不再是 P2-B1-D**。
- 旧义 B（creator 桥接启用）**已取消**——`Creator` 已正式退出身份来源架构（`ARCHITECTURE_DECISION_READY` §16）。
- 本编号歧义**自此关闭**，后续文档一律以本定义为准。

---

## 1. 执行摘要

### 1.1 一句话结论

**通道 B 的「待归属数据」运营闭环可以被完整设计，且不需要触碰 05-H-0 冻结层、不需要 WPS Creator、不需要 Attachment、不需要 client_token、不需要修改 auth/JWT/users 数据结构。** 现有系统已具备全部所需的可复用原语（`deriveGridIdForEmployee` / `requireRole` / `sys_operation_log` + `audit_record` / 三层高危操作范式）。

### 1.2 三个决定性发现（本次审计新取证）

| # | 发现 | 对设计的意义 |
|---|---|---|
| **D1** | **`deriveGridIdForEmployee` 对当前 100% 网格负责人唯一可解**：`grid_areas` 62 行全部 live、62 个 distinct owner、**每个 owner 恰好 1 个网格**（`grids_per_owner=1` for 62/62）；62/62 owner 均为未删除 employee 且均绑定 1 个 active 用户 | 人工归属流程的「1 grid → 可确认」主路径**当前 100% 可用**；`multiple` 拒绝路径是未来数据防护，不是当前阻塞 |
| **D2** | **`gridScope` 天然屏蔽 pending 数据**：own_grid 的 SQL 条件为 `grid_id IN (SELECT id FROM grid_areas WHERE personnel_id=$1 …)`，而 pending 行 `grid_id IS NULL` ⇒ 谓词为 NULL ⇒ **永不匹配**。即「普通网格长看不到 pending 数据」不是靠新代码保证的，而是 **fail-closed 的构造性结果** | §十一 的可见性要求**已被现有机制满足**，无需新权限模型 |
| **D3** | **prod 完全没有 P2-B0 的 5 个扩展列**：生产 `grid_inspection_records` = **28 列**、`grid_record_sync_map` = **11 列**、**无 `wps_account_employee_map` 表**。5 列 + `business_fingerprint` + 桥接表**只存在于 `safety_dashboard_dev`** | 「待归属」闭环要实现，**必须先有一次生产 DDL**（受护栏、须单独授权）——这是实施前置 **P1** |

### 1.3 三个必须如实披露的缺口

| # | 缺口 | 性质 |
|---|---|---|
| **G1** | **新拉取的通道 B 行 `attribution_status` 是 NULL，而不是 `'pending'`**——Pull Engine 只写 `SYNC_PROJECTION` 内列，扩展列不在其中，且 `wpsGridPullEngine.js` 冻结不可改 | 必须有一个**独立 stamping worker**（不属 Pull Engine、不注册进现有 scheduler）在 post-pull 打标，否则「pending 队列」恒为空、闭环是死的 → 实施前置 **P2** |
| **G2** | **唯一高权限账号 `admin` 的 `users.employee_id IS NULL`**（生产 users 仅 2 类：`grid_inspector`×62 全部已绑定、`admin`×1 **未绑定**）；`hse_manager` / `safety_manager` / `township_manager` / `manager` / `viewer` **用户数均为 0** | ① 审计的 `operator_employee_id` **当前不可靠取得**（唯一操作人无 employee 绑定）；② 无职责分离（单人可认领） → 前置 **P3** |
| **G3** | **`attribution_status` 无 `manual_confirmed` 语义**，且 dev 上该列为**无 CHECK 约束的 text** | 状态扩展是**纯应用层改动、零 migration**；但「系统归属 vs 人工确认」的区分必须在实施时落地（本阶段只设计） |

### 1.4 最终判定摘要

| 判定项 | 结果 |
|---|---|
| 待归属数据模型是否清晰 | ✅ 清晰（§3，含 NULL 口径陷阱与 legacy 隔离方案） |
| 人工归属流程是否清晰 | ✅ 清晰（§4/§5） |
| employee → gridScope 安全链是否清晰 | ✅ 清晰且当前 100% 可解（D1） |
| 权限模型是否可复用 | ✅ 可复用（§7），**无需新建权限体系** |
| 审计方案是否可复用 | ✅ 可复用且有现成空表（§8） |
| 并发控制是否可实现 | ✅ 可实现（§9，条件 UPDATE + rowCount） |
| 是否需要修改冻结层 | ❌ **不需要** |
| 是否需要修改 auth/JWT/users | ❌ **不需要**（用 `requireRole` 即可，零 auth 改动） |
| 是否需要 WPS Creator | ❌ **不需要** |
| 是否需要 Attachment | ❌ **不需要** |
| 是否需要 client_token | ❌ **不需要** |
| 05-H-0 是否完全兼容 | ✅ **完全兼容**（§14） |

⇒ 满足 §十八 全部条件 ⇒ **`READY_FOR_P2-B1-D-IMPLEMENTATION`**。

---

## 2. 当前数据结构审计

### 2.1 `grid_inspection_records`（生产 vs 隔离库）

| 项 | 生产 `safety_dashboard` | 隔离库 `safety_dashboard_dev` |
|---|---|---|
| 列数 | **28** | **33** |
| `source_channel` | ❌ 不存在 | ✅ `text`，2061/2061 = NULL |
| `client_token` | ❌ 不存在 | ✅ `text`，2061/2061 = NULL |
| `submission_fingerprint` | ❌ 不存在 | ✅ `text`，2061/2061 = NULL |
| `attribution_status` | ❌ 不存在 | ✅ `text`，2061/2061 = NULL |
| `attachment_resolution_status` | ❌ 不存在 | ✅ `text`，2061/2061 = NULL |
| CHECK 约束（上述列） | — | **无**（纯 text，无枚举约束） |
| 主键 | `id` (integer) | 同 |
| 外键 | `grid_id → grid_areas(id) **ON DELETE SET NULL**` | 同 |
| 索引 | `idx_gir_grid_id` / `idx_gir_grid_level` / `idx_gir_inspection_date` / `idx_gir_personnel` | 同 + `uq_grid_inspection_records_client_token_notnull`(部分唯一) + `idx_grid_inspection_records_submission_fingerprint` |

**关键 1**：`attribution_status` 等 5 列**不受任何 CHECK 约束** ⇒ 状态枚举扩展（§11）**不需要 migration**。
**关键 2**：`grid_id` 外键为 `ON DELETE SET NULL` ⇒ 删网格会静默清空记录归属，撤销设计须考虑（§10 / R7）。

### 2.2 `grid_record_sync_map`

| 项 | 生产 | 隔离库 |
|---|---|---|
| 列数 | 11 | 12（+ `business_fingerprint`） |
| 唯一键 | `UNIQUE(pg_record_id)`、`UNIQUE(wps_record_id, wps_file_id)` | 同 |
| 行数 | 2061（`DISTINCT pg_record_id` = 2061 ⇒ 与 gir **1:1 全覆盖**） | 2061 |

### 2.3 `wps_account_employee_map`（桥接表）

| 项 | 生产 | 隔离库 |
|---|---|---|
| 表存在 | ❌ **不存在**（`relation does not exist`） | ✅ 存在 |
| 列 | — | `id` / `wps_account_id` / `employee_id` / `status` / `created_at` / `updated_at` |
| 索引 | — | pkey + `idx_…_wps_account_id` + `idx_…_employee_id`（**无唯一约束**） |
| 行数 | — | **0** |

> ⚠️ `wps_account_id` 上**没有 UNIQUE 约束**，`lookupEmployeeByWpsAccount` 靠 `LIMIT 2` + `rows.length!==1 → null` 在应用层兜底（0 或 >1 均不归属）。这是可接受的 fail-safe，但**不是数据库级保证**（R6）。

### 2.4 gir 的 NULL 组合口径（生产实测，2061 行）

| 组合 | 行数 | 说明 |
|---|---|---|
| `inspector IS NULL AND grid IS NULL` | **327** | 无归属、无网格 |
| `inspector IS NULL AND grid IS NOT NULL` | **1724** | 有网格、无巡查人（历史 WPS 导入） |
| `inspector IS NOT NULL AND grid IS NULL` | **0** | — |
| 两者均非空 | **10** | 移动端真机验证产生的记录 |
| **合计** | **2061** | `MAX(id)=7192`，`MIN(id)=4954` |

### 2.5 人员与网格现状（生产实测）

| 项 | 值 |
|---|---|
| `grid_areas` 总行 / live / 无负责人 | 62 / **62** / **0** |
| distinct owner（`personnel_id`） | **62** |
| **每个 owner 的网格数分布** | **1 个网格 × 62 人**（无多网格负责人） |
| 62 owner 是否均为未删除 employee | **62/62 ✅** |
| 62 owner 是否均绑定 1 个 active 用户 | **62/62 ✅**（角色全部 `grid_inspector`） |
| `employee` 总数 / 未删除 | 3417 / **3401** |
| `employee_assignment` 有 current 记录的人数 | 3238 |
| `users` 角色分布 | `grid_inspector`×62（全部已绑定 `employee_id`）、`admin`×1（**`employee_id = NULL`**） |

### 2.6 既有审计能力（生产实测）

| 表 | 行数 | 关键列 | 现状 |
|---|---|---|---|
| `sys_operation_log` | **4586**（最近 2026-09-12） | `user_id`/`username`/`action`/`module`/`description`/`ip_address`/`status_code`/`detail`(text)/`detail_json`(jsonb)/`target_id`/`target_type`/`operator` | **活跃使用中**（module 分布：auth 1178 / site-mgmt 1163 / accidents 511 …） |
| `audit_record` | **0** | `operation_log_id`(FK→sys_operation_log)/`user_id`/`username`/`module`/`table_name`/`record_id`/`action`/**`old_value`(jsonb)**/**`new_value`(jsonb)**/**`changed_fields`(array)**/`ip_address` | **能力已建、尚未使用** |
| `grid_patrol_logs` | — | `grid_id`/`patrol_date`/`patrol_user`(varchar 姓名)/`check_items`/`result` | 独立巡查日志；`patrol_user` 为**姓名字符串**，**不得**作为身份来源 |

---

## 3. 待归属数据定义（§四）

### 3.1 主判据：`attribution_status = 'pending'`（不可用 NULL 守卫替代）

**禁止**仅用：

```sql
-- ❌ 错误：会把 327 条历史行误判为「待归属」
WHERE inspector_employee_id IS NULL OR grid_id IS NULL
```

**原因**：生产 2061 条历史行的 `attribution_status` 全部不存在（列都没有）；一旦按 §15 加列后，历史行该列为 NULL。**NULL ≠ pending**（NULL 表示「不属于本模型 / 历史遗留」）。若用 NULL 守卫：

- `inspector IS NULL` → 2051 行
- `grid IS NULL` → 327 行

⇒ 人工归属队列会瞬间冒出上千条**从未提交过、也不该被认领**的历史记录。

### 3.2 推荐查询模型（两层，语义分离）

```sql
-- ─── L1：运营队列（唯一权威判据）───────────────────────────
SELECT r.*
  FROM grid_inspection_records r
 WHERE r.attribution_status = 'pending'
   AND r.inspector_employee_id IS NULL      -- 安全守卫：已归属的不再出现
   AND r.grid_id IS NULL                    -- 安全守卫：已有网格的不再出现
 ORDER BY r.created_at DESC, r.id DESC;

-- ─── L2：健康检查（不是运营队列，仅用于发现「未打标的新行」）──
-- 用于发现 stamping worker 漏跑（G1）
SELECT r.id, r.created_at
  FROM grid_inspection_records r
 WHERE r.id > :LEGACY_HIGH_WATERMARK_ID      -- 实施时冻结 = 7192
   AND r.attribution_status IS NULL
   AND r.inspector_employee_id IS NULL;
```

**设计要点**：

1. **L1 是唯一驱动运营的判据**；L2 只产出「worker 是否落后」的运维告警，**绝不**直接把 L2 结果当待归属队列（否则历史行会混入）。
2. 两个 NULL 守卫是**防御性**的（防止未来某写入路径误设 `pending`），但它们**不是**判据本身。
3. `LEGACY_HIGH_WATERMARK_ID` 优于时间戳：`gir.id` 为自增序列，历史最大值 `7192` 可精确冻结、可复核、无时区/时钟歧义；时间戳需 magic constant 且受系统时间影响。

### 3.3 明确禁止的推断（与上游决策一致）

| 禁止 | 原因 |
|---|---|
| `wps_record_id IS NOT NULL` ⇒ `source_channel='wps_form'` | 「经过 WPS」≠「来自 WPS 表单」；历史 2061 行全部有 sync_map 记录 |
| `creator` ⇒ 身份 | 2066 条 1 个 creator vs 61 姓名（共享账号） |
| 姓名 / 昵称 / 手机号 / `realName` / 岗位 ⇒ 归属 | 上游 `ARCHITECTURE_DECISION_READY` 明令 |
| `巡查人员ID` ⇒ 归属 | `UNTRUSTED_BUSINESS_FIELD`（2063/2063 空，`FIELD_MAP` 中 `pg:'-'`） |

---

## 4. 人工归属流程设计（§五）

### 4.1 流程（服务端为唯一计算方）

```
[PENDING]  attribution_status='pending' AND inspector IS NULL AND grid IS NULL
    │
    ▼ ① 管理员打开待归属记录（GET，仅返回候选 employee 列表，不返回可写的归属字段）
    │
    ▼ ② 查看业务字段（area_team / inspection_date / violation_* / 图片状态徽标）
    │
    ▼ ③ 管理员选择 candidate employee（**客户端只能提交 employeeId**）
    │
    ▼ ④ 服务端重新校验 employee：
    │      · 存在于 public.employee 且 is_deleted=false
    │      · 是 live grid 的负责人（grid_areas.personnel_id = employeeId AND is_deleted=false）
    │      ·（可选）该 employee 绑定 active 用户
    │
    ▼ ⑤ deriveGridIdForEmployee(employeeId)
    │      0  → 403 拒绝归属（no_grid）
    │      1  → 进入确认（ok）         ← 当前 62/62 owner 均为此路径
    │      >1 → 409 拒绝归属（multiple，禁止猜测）
    │
    ▼ ⑥ 管理员确认（POST，携带 reason + employeeId + 可选 confirmText）
    │
    ▼ ⑦ 单事务内条件 UPDATE（§9）+ 写审计（§8）
    │
    ▼ ⑧ [MANUAL_CONFIRMED]  attribution_status='manual_confirmed'
                             inspector_employee_id = :employeeId
                             grid_id               = :derivedGridId
```

### 4.2 客户端契约（最小授权原则）

**允许提交**：

| 字段 | 说明 |
|---|---|
| `employeeId` | **候选**员工 ID（不是最终身份，只是提名） |
| `reason` | 认领理由（必填，进审计） |
| `confirmText` | 高危操作二次确认（复用现有范式，见 §8.3） |

**禁止提交（服务端必须显式忽略 / 拒绝，不得透传）**：

| 字段 | 若被接受则后果 |
|---|---|
| `grid_id` | 绕过 `gridScope`，管理员可把记录挂到任意网格 ⇒ **越权** |
| `inspector_employee_id` | 绕过 employee 校验链 ⇒ **伪造身份** |
| `attribution_status` | 可伪造 `attributed` ⇒ 混淆系统归属与人工确认 |
| `source_channel` / `client_token` / `submission_fingerprint` | 破坏通道判定与幂等语义 |

### 4.3 与冻结写路径的关系

现有 `PUT /api/site-mgmt/grid-records/:id` 的白名单 `GRID_RECORD_EDITABLE`（18 项，`site-mgmt.js:261`）经核对**不包含** `grid_id` / `inspector_employee_id` / 5 个扩展列 ⇒ **冻结写路径在物理上无法设置归属**。归一只能有**一个新端点**，该端点自持白名单（不接受任意字段）。

---

## 5. employee 校验流程（§五 下半）

| 步 | 校验 | 依据 | 失败处置 |
|---|---|---|---|
| 1 | `employeeId` 为正整数 | 输入归一化 | 400 |
| 2 | `public.employee.id = :id AND is_deleted=false` | `authenticatedEmployeeResolver` 同源表 | 409 `EMPLOYEE_NOT_FOUND` / `EMPLOYEE_DELETED` |
| 3 | `grid_areas.personnel_id = :id AND is_deleted=false` 存在 | `gridScope` 权威纽带（**唯一可信纽带，禁姓名匹配**） | 403 `NOT_A_GRID_OWNER` |
| 4 | `COUNT(live grid) == 1` | `deriveGridIdForEmployee` | 0 → 403 `NO_GRID`；>1 → 409 `MULTIPLE_GRID` |
| 5 | 行未被并发认领 | §9 条件 UPDATE 的 `rowCount` | 409 `ALREADY_CLAIMED` |

**当前数据下的可解性（实测）**：62 个 owner 全部满足 1–4（每人恰好 1 网格）⇒ **主路径 100% 可解**；`MULTIPLE_GRID` 分支当前**零触发**（未来若一人分管多网格才生效）。

**复用决策**：

- ✅ **复用** `gridScope.deriveGridIdForEmployee`（唯一 grid 派生器，`ok|no_grid|multiple`）
- ✅ **复用** `public.employee.is_deleted` 判定（与 `employeeResolvable()` 同口径）
- ❌ **不复用** `currentEmployeeContext`（姓名兜底，明确禁用于归属）
- ⚠️ `deriveGridIdForEmployee` **不校验 employee 是否存在**（已在 P2-B1-C 记录）⇒ 第 2 步必须独立执行，不可省

---

## 6. gridScope 安全边界（§六）

### 6.1 唯一合法链路

```
candidate employeeId
   → [employee 存在性校验]
   → gridScope.deriveGridIdForEmployee(employeeId)   ← 唯一的 grid_id 生产者
   → unique live grid_id
   → 写入 grid_inspection_records.grid_id
```

### 6.2 三条硬禁止

| 禁止 | 说明 |
|---|---|
| 管理员**直接指定** `grid_id` | 客户端参数一律丢弃（§4.2） |
| WPS 的 `grid_id` 作为授权依据 | WPS 侧无 `grid_id` 字段可信来源；且 WPS 非权威面 |
| WPS「所属网格」字段作为授权依据 | 同上；WPS = Buffer，PG = Business Master |

### 6.3 构造性保护（本次新证据 D2）

`buildScopeSqlCondition`（`gridScope.js:109`）对 own_grid 生成：

```sql
grid_id IN (SELECT id FROM grid_areas WHERE personnel_id = $n AND is_deleted = false)
```

pending 行 `grid_id IS NULL` ⇒ `NULL IN (…)` ⇒ **NULL（非 true）** ⇒ 行被排除。

⇒ **普通网格长（`grid_inspector` / `manager`）在物理上不可能看到 pending 记录**，即使他们持有 `hse:site:grid:view`（`grid_inspector` 确实持有）。这是 fail-closed 的**构造性保证**，不需要额外代码。

### 6.4 反向确认：all_grid 角色会看到 pending

`ALL_GRID_ROLES = ['system_admin','admin','hse_manager','safety_manager','township_manager']` ⇒ scope 条件为 `null`（无限制）⇒ 这些角色在 `GET /grid-records` 中**会**看到 pending 行（混在台账里）。因此**待归属队列必须是独立端点**，而不是依赖现有列表加过滤（现有 `site-mgmt.js` 为冻结文件，不改）。

---

## 7. 权限模型复用分析（§三 E / §十一）

### 7.1 现有可用原语

| 原语 | 位置 | 语义 |
|---|---|---|
| `requireRole(...roles)` | `middleware/auth.js:288` | 角色白名单，**fail-closed**（无参/非法值 → 403）；未认证 401 |
| `requirePermission(code)` | `middleware/auth.js:468` | 权限码校验，未知角色回落 `viewer`（fail-closed）；`system_admin` 为 `*` |
| `ROLE_PERMISSIONS_MAP` | `middleware/auth.js:374` | 静态角色→权限映射（**新增权限码需改此文件**） |
| 行级范围 | `services/gridScope.js` | SQL 层 `all_grid` / `own_grid` / `none` |

### 7.2 方案比较

| 方案 | 是否需要改 `auth.js` | 语义精确度 | 评价 |
|---|---|---|---|
| **A. 新增权限码** `hse:site:grid:attribution` | ✅ 需要（`auth.js` **不在冻结清单**，但本阶段红线第 18 条禁改 auth） | 最精确、与现有 `hse:site:grid:*` 家族一致 | 实施期可选；需把该码授给 `admin`/`hse_manager`/`safety_manager`，**不授** `grid_inspector` |
| **B. `requireRole('admin','hse_manager','safety_manager')`** | ❌ **不需要任何改动** | 足够精确（三者均为 `ALL_GRID_ROLES`，且均不含 `grid_inspector`） | ✅ **推荐（最小改动）** |
| C. 复用 `requirePermission('hse:site:grid:update')` | ❌ | ❌ **不精确**：`grid_inspector` 也持有 `update`（虽被行级范围兜住，但语义错误） | ❌ 不推荐 |
| D. 新建独立权限体系 | ✅ | — | ❌ 违反「禁止新建重复体系」 |

**推荐：B 起步，A 作为收紧演进**（若后续需要把「查看待归属」与「执行认领」分离）。

### 7.3 当前运维现实（G2）

| 角色 | 用户数 | 是否可作操作人 |
|---|---|---|
| `admin` | **1** | ✅（唯一） |
| `hse_manager` / `safety_manager` | **0** | — |
| `township_manager` / `manager` / `viewer` | **0** | — |
| `grid_inspector` | 62 | ❌ 明确排除（own_grid，不得进待归属清单） |

⇒ **方案 B 当前实际只有 1 个账号可用**；且该账号 `employee_id IS NULL`（见 §8.4）。**无职责分离**（R3）。

---

## 8. 审计日志复用分析（§七）

### 8.1 结论：**优先复用，不需要新建审计体系**

| 层 | 表 | 用途 | 状态 |
|---|---|---|---|
| 操作层 | `sys_operation_log` | 「谁在什么时候做了什么操作」 | **已在使用**（4586 行，`module='site-mgmt'` 1163 行） |
| 记录层 | `audit_record` | 「哪条记录、哪些字段、从什么变成什么」 | **表已建、索引已建、当前 0 行** |

现成工具函数：

- `routes/audit.js` → `auditLog(options)`（已导出，`module.exports.auditLog`）
- `routes/hse-audit-records.js` → `createAuditRecord(options)`（已导出）
- `routes/audit.js` → `auditMiddleware(module, action)`（可挂载自动记录）
- 查询侧：`GET /api/hse/audit/logs`、`/stats`、`/export`、`/operators`、`/action-types`；`GET /api/hse/audit-records/records`、`/records/:id`、`/stats`

### 8.2 归属/撤销事件的字段映射（**零 DDL**）

`audit_record` 已具备全部所需列：

| 需求（§七） | 现有列 | 映射 |
|---|---|---|
| `record_id` | `record_id` (varchar) | `String(gir.id)` |
| 原 `inspector_employee_id` / 原 `grid_id` | `old_value` (jsonb) | `{"inspector_employee_id":null,"grid_id":null,"attribution_status":"pending"}` |
| 新 `employee_id` / 新 `grid_id` | `new_value` (jsonb) | `{"inspector_employee_id":7707,"grid_id":19,"attribution_status":"manual_confirmed"}` |
| `action` | `action` | `'attribution_confirm'` / `'attribution_revoke'` |
| `operator_user_id` | `user_id` | `req.user.id` |
| `operator_username` | `username` | `req.user.username` |
| `reason` | （无独立列）→ `changed_fields` 或 `new_value.reason` | 见 R5 |
| `created_at` | `created_at` | 默认 |

`target_id` / `target_type` / `detail_json` 三个**尚未使用**的列在 `sys_operation_log` 中已存在 ⇒ 记录 `target_id = gir.id`、`target_type = 'grid_inspection_record'` 亦无需 DDL。

⇒ **审计完全可复用，零新增表、零新增列。**

### 8.3 可直接复用的「高危操作」范式

代码库已有三期分层的成熟写法（`site-mgmt.js:2078`「表格清空」）：

```
① requirePermission('hse:site:grid:purge')   ← 功能权限
② requireRole('system_admin','admin')        ← 高权限角色
③ body.confirmText === '清空全部台账'         ← 后端显式二次确认（不依赖前端）
```

**建议归属/撤销沿用同一范式**：

```
① requireRole('admin','hse_manager','safety_manager')
② body.confirmText === '<约定文本>'          ← 仅撤销需要（认领为常规操作）
③ reason 必填
```

### 8.4 ⚠️ 审计的既知缺陷（必须披露）

| 缺陷 | 影响 | 处置建议 |
|---|---|---|
| `auditLog()` / `createAuditRecord()` **均使用 `pool`，不接受事务 client** | 审计写入**不在归属事务内**，失败被 `catch` 吞掉（"审计写入失败不应阻断业务流程"）⇒ **可能出现「归属成功但无审计」** | 实施时：① 二选一——接受非原子并在报告中标注；② 或在归属事务内**直接用 client 写 `sys_operation_log` + `audit_record`**（不改函数签名，新增内联 SQL） |
| `admin` 的 `users.employee_id IS NULL` | `operator_employee_id` **不可靠取得**；§七 的「operator_employee_id（如果现有系统可以可靠取得）」→ **答案：当前不可靠** | 审计以 `user_id` + `username` 为准；`operator_employee_id` 若无法取得则显式写 NULL 并在报告中说明 |
| `audit_record` 表 0 行 | 无历史样例，字段类型（`changed_fields` 为数组）未被验证 | 实施前先在 dev 跑一次真实写入验证 |

---

## 9. 并发控制设计（§十）

### 9.1 场景

管理员 A 与 B 同时打开同一 pending 记录，A 先确认成功，B 随后提交。

### 9.2 数据库级保护：条件 UPDATE + `rowCount`

```sql
UPDATE grid_inspection_records
   SET inspector_employee_id = $1,
       grid_id               = $2,
       attribution_status    = 'manual_confirmed',
       updated_at            = NOW()
 WHERE id = $3
   AND attribution_status = 'pending'      -- 状态守卫
   AND inspector_employee_id IS NULL       -- 归属守卫
   AND grid_id IS NULL;                    -- 网格守卫
```

- `rowCount = 1` → 成功，继续写审计并提交
- `rowCount = 0` → 已被他人认领（或状态已变） → **409 `ALREADY_CLAIMED`**，回滚，不写审计

### 9.3 与现有 `applyEnrichment` 守卫的一致性（§十五）

`gridEnrichmentService.applyEnrichment` 已实现同类守卫：

```js
guardNullInspector = ' AND inspector_employee_id IS NULL AND grid_id IS NULL';
```

⇒ **人工归属沿用同一安全底线**，做到「只补 NULL，永不覆盖」。差异只在：自动路径额外受 `attribution_status` 约束（自动只写 `attributed`），人工路径写 `manual_confirmed`。

### 9.4 可选加严

- 事务内先 `SELECT … FOR UPDATE`（悲观锁）以避免「A 提交后 B 的 UPDATE 空转」——但**非必需**，条件 UPDATE 已足够正确（幂等 + 拒绝重复）。
- 建议补索引（**实施期**，非本阶段）：`CREATE INDEX … ON grid_inspection_records (attribution_status) WHERE attribution_status = 'pending'`（部分索引，队列规模小、代价低）。

### 9.5 明确不做

- ❌ 不做「软锁 / claimed_by 中间态」（会引入第二套状态，复杂化）
- ❌ 不做乐观版本号列（需 DDL，收益低）

---

## 10. 撤销 / 纠错设计（§九）

### 10.1 原则

| 原则 | 说明 |
|---|---|
| **绝不删除行** | 撤销 = 归零 + 状态回退，**不是 DELETE**。禁止使用现有 `DELETE /grid-records` 作为「纠错」手段 |
| **绝不覆盖原始 WPS 数据** | 撤销只清 `inspector_employee_id` / `grid_id`（PG 权威字段）与状态，**业务字段原样不动** |
| **审计必须留存** | 撤销是**新增一条**审计，而不是删除原认领审计 |

### 10.2 撤销流程

```
[manual_confirmed]
   │  管理员提交 revoke + reason + confirmText
   ▼
单事务：
   UPDATE grid_inspection_records
      SET inspector_employee_id = NULL,
          grid_id               = NULL,
          attribution_status    = 'pending',      -- 回到待归属
          updated_at            = NOW()
    WHERE id = $id
      AND attribution_status = 'manual_confirmed'  -- 只能撤销人工确认的
      AND inspector_employee_id = $oldEmployeeId   -- 防误撤他人后的新归属
   → rowCount=1：写审计（old_value=认领后的值，new_value=NULL/pending）
   → rowCount=0：409，不做任何变更
```

### 10.3 只能撤销 `manual_confirmed`，不能撤销 `attributed`

`attributed` 由系统可信链产生（`bridge + gridScope`），人工无权撤销——撤销它需先改桥接表（另一个受控流程）。**禁止**把 `attributed` 直接改回 `pending`。

### 10.4 既知边界

- `grid_areas` 若被删除，`gir.grid_id` 会因 `ON DELETE SET NULL` 变 NULL，而此时 `inspector_employee_id` 仍有值 ⇒ 出现「有巡查人、无网格」的组合（当前 0 行，属未来状态）。撤销逻辑以 `attribution_status` 为准，不受该组合干扰（R7）。
- 撤销**不**回写 WPS（PG→WPS 反向写入已封禁）。

---

## 11. `attribution_status` 状态设计（§八 / §十四）

### 11.1 现状

| 项 | 生产 | 隔离库 |
|---|---|---|
| 列存在 | ❌ | ✅ `text` |
| 已用值 | — | 全部 NULL（2061 行） |
| CHECK 约束 | — | **无** |
| 代码写入值 | `gridEnrichmentService.buildWrites` → 仅 `'pending'` / `'attributed'` | 同 |

### 11.2 推荐枚举

| 值 | 含义 | 写入方 |
|---|---|---|
| `NULL` | **不属于本模型**：历史遗留行 / 通道 A 行（其身份由行内 `inspector_employee_id` 自证） | 不写（默认） |
| `pending` | 通道 B 行已进入归属队列，等待归属 | stamping worker（§15 M2） |
| `attributed` | **系统**可信链自动完成（bridge → employee → unique grid） | `applyEnrichment`（自动路径） |
| **`manual_confirmed`** | **人工**在后台确认完成 | 新归属端点（§4） |
| `rejected` | 人工判定该记录不可归属 / 非本系统业务（保留数据，不删） | 新端点（可选） |
| `not_required` | 明确无需归属（如系统内部造数） | 预留 |
| ~~`failed`~~ | **不设**。无可信来源时「失败」不可判定（沿用 P2-B1-B 结论） | — |

### 11.3 关键：`attributed` 与 `manual_confirmed` **不得混同**

| 对比 | `attributed` | `manual_confirmed` |
|---|---|---|
| 触发者 | 系统（可信链） | 人（管理员） |
| 可撤销 | ❌（需改桥接表） | ✅（§10） |
| 审计必要性 | 可选（可重算） | **必须**（人的决定不可重算） |
| 上报表述 | 「系统归属」 | 「人工确认」 |

⚠️ `gridEnrichmentService` 当前把状态写成 `result.attribution.status`（仅 `pending|attributed`）⇒ **实施时必须确保人工端点不被误认为自动路径**，且 `resolveAttribution` 不得把 `manual_confirmed` 的行改回 `pending`/`attributed`。

### 11.4 是否需要 migration

**不需要。** 该列为无约束 `text`，扩展枚举是**纯应用层**改动。若未来希望数据库级约束，再单独立项（本阶段禁止 migration）。

### 11.5 五态模型与列的对应关系（§十四：不得塞进单一列）

```
DATA_RECEIVED             ← 隐式：行存在（无需列；由 gir.id / created_at 表达）
      ↓
DATA_PENDING_ATTRIBUTION  ← attribution_status = 'pending'
      ↓
DATA_ATTRIBUTED           ← attribution_status = 'attributed'
   或  DATA_MANUAL_CONFIRMED ← attribution_status = 'manual_confirmed'
      ↓
DATA_PENDING_ATTACHMENT   ← attachment_resolution_status = 'pending'（完全独立列）
      ↓
DATA_READY                ← 派生量，不落库：
                             attribution_status IN ('attributed','manual_confirmed')
                             AND attachment_resolution_status IN ('resolved','not_applicable')
```

**三列严格独立，禁止互相推断**（与 `ARCHITECTURE_DECISION_READY` §7 一致）。

---

## 12. Attachment 解耦（§七 / §十二）

| 项 | 设计 |
|---|---|
| 当前状态 | `attachment_resolution_status = pending`（`attachment/urls` 端点实测 404） |
| 是否阻塞 Record Pull | ❌ **不阻塞**（Pull 与 enrichment 解耦；Pull 不写该列） |
| 是否阻塞**归属** | ❌ **不阻塞**——归属只看 `employeeId` + `gridScope`，与图片无关 |
| 待归属清单是否显示图片信息 | ✅ 仅显示**只读徽标**：「有图 / 无图 / 状态待解析」；**不得**因此禁用「确认归属」按钮 |
| 本阶段是否实现 URL 解析 | ❌ **不实现**（不新建 attachment service、不改图片字段、不调 404 端点） |

**必须补的语义缺口（沿用 P2-B1-C-DECISION 结论）**：现有只有 `pending|resolved` ⇒ **无图记录永久 pending**，导致 `DATA_READY` 永不可达。建议扩展为 `pending | resolved | not_applicable | skipped | failed`，其中 `resolveAttachmentStatus` 在「三图片字段全空」时返回 `not_applicable`（**当前代码返回 `pending`**，属需修正项——建议在实施期改，本阶段只设计）。

---

## 13. `client_token` 当前状态（§十三）

| 项 | 事实 |
|---|---|
| 列 | ✅ 存在（**仅隔离库**；生产无此列） |
| 唯一索引 | ✅ `uq_grid_inspection_records_client_token_notnull`（部分唯一，`WHERE client_token IS NOT NULL`） |
| **生产生成方** | ❌ **零**：全仓（排除 `scripts/`、`backups/`）无任何代码写入 `client_token`。唯一引用点是 `gridEnrichmentService.resolveSourceChannel`（**读**它来判定 `mobile_h5`） |
| 移动端 POST | `site-mgmt.js` 的 `GRID_RECORD_CREATE_CAMELS` **不含** `clientToken` |

> **结论（必须原样转述）**：`client_token` 基础设施已具备（列 + 部分唯一索引），**但没有生产生成方**。
> 因此**不能宣称跨通道技术幂等已经成立**；跨通道重复只能靠「业务候选 + 人工裁决」（§14 已定）。
> 本阶段**不**修改 `site-mgmt.js`、**不**修改 H5、**不**生成 token。

---

## 14. 与 05-H-0 的兼容性（§十四 / §十六）

| 冻结项 | 本设计是否触碰 | 证据 |
|---|---|---|
| `SYNC_PROJECTION` 18 列哈希 | ❌ 不触碰 | 新列全在投影之外；`gir_has_new_columns: []` |
| `SYNC_HASH_COLUMNS` / `canonicalHash` | ❌ | 未引用 |
| `PROTECTED_COLUMNS = ['grid_id','inspector_employee_id']` | ❌（**且被遵守**） | 归属写入是**新端点**，非 Pull Engine；Pull 仍硬断言禁写这两列（`assertNoProtectedColumns`） |
| `UNIQUE(wps_record_id, wps_file_id)` | ❌ | 不变 |
| **no-DELETE 语义** | ❌（**且被遵守**） | 撤销设计明确**不删除**（§10.1） |
| `wpsGridPullEngine.js` / `wpsFieldMap.js` / `gridInspectionRepository.js` | ❌ 不修改 | 只读审阅；mtime 全部早于本阶段 |
| `wpsGridSyncScheduler.js` | ❌ 不修改 | 新 worker **不注册**进现有 scheduler（§15 M2） |
| `.env` | ❌ 不修改 | mtime 仍 `2026-09-11 22:22:50`；三开关 `false/true/true` 未变 |
| Pull Engine 前置校验（`SCHEMA_NOT_READY`） | ⚠️ **加列不影响** | 该校验只检查 `grid_inspection_records` / `grid_record_sync_map` **表存在** + 幂等唯一索引存在 |

⇒ **零冲突。** 本设计的全部写操作都发生在**冻结层之外的独立组件**（新端点 + 新 worker），且**服从**冻结层的两条根本约束（禁写 PROTECTED 列 / 禁 DELETE）。

---

## 15. 推荐最小实现方案（§十五 / §十八）

### 15.1 三层结构（M1 → M2 → M3）

```
M1 迁移层  生产 DDL：5 扩展列 + business_fingerprint + 桥接表 + 索引（受护栏 runner）
M2 打标层  独立 stamping worker：新拉取行 attribution_status ← 'pending'
M3 接口层  待归属清单 API + 人工认领 API + 撤销 API + 审计写入
```

### 15.2 M1：生产 DDL（**前置 P1**）

| 内容 | 与 dev 对齐 |
|---|---|
| gir + `source_channel` / `client_token` / `submission_fingerprint` / `attribution_status` / `attachment_resolution_status`（全 `text` NULL） | ✅ dev 已同构 |
| sync_map + `business_fingerprint` | ✅ dev 已同构 |
| `wps_account_employee_map`（6 列 + pkey + 2 索引） | ✅ dev 已同构（0 行） |
| 索引：`uq_…_client_token_notnull`（部分唯一）、`idx_…_submission_fingerprint` | ✅ dev 已同构 |

要求：**沿用既有受护栏 runner 模式**（DRY-RUN 默认、`--apply` 才写、硬拒绝目标 `safety_dashboard` 除非显式授权开关）；先在 dev 重放验证，生产执行须**单独授权 + 备份**。

### 15.3 M2：stamping worker（**前置 P2**）

**为什么必须有**：Pull Engine 冻结、只写 18 列投影 ⇒ 新行 `attribution_status = NULL`，与 2061 条历史行无法区分（G1）。没有打标，待归属队列恒为空。

| 设计点 | 方案 |
|---|---|
| 形态 | **独立脚本 / 独立进程**（仿 `server/scripts/_p2b1_enrich_worker.cjs`），**不注册**进 `wpsGridSyncScheduler.js` |
| 选行条件 | `id > :LEGACY_HIGH_WATERMARK_ID`（=7192）`AND attribution_status IS NULL`（§3.2 L2） |
| 动作 | 对每行调用 `enrichAfterInsert`（`creatorWpsAccountId` 恒不注入 → 身份恒 `pending`）→ `applyEnrichment` |
| 幂等 | `applyEnrichment` 只补 NULL、只写扩展字段；重复运行结果一致 |
| 默认安全 | **默认拒绝批量**，须显式 `--ids=` 或 `--apply`；生产目标需显式开关 |
| 触发 | ① 外部任务计划（OS 级）/ ② 人工运行（兜底）。**不修改现有 scheduler** |
| 明确禁止 | ❌ 不得对 `id <= 7192` 的历史行打标（会污染口径、误 classify 327 行） |

### 15.4 M3：接口层（3 个端点）

| 端点 | 方法 | 守卫 | 说明 |
|---|---|---|---|
| `/api/site-mgmt/grid-records/pending` | GET | `requireRole('admin','hse_manager','safety_manager')` | 分页返回 §3.2 L1 队列 + 只读图片徽标；**不返回**可写归属字段 |
| `/api/site-mgmt/grid-records/:id/attribution` | POST | 同上 + `reason` 必填 | 认领：§4 流程 + §9 条件 UPDATE + §8 审计 |
| `/api/site-mgmt/grid-records/:id/attribution` | DELETE | 同上 + `confirmText` | 撤销：§10（**语义为归零回退，非删除行**） |

> ⚠️ 上述路径落在 `routes/site-mgmt.js`（**冻结文件**）⇒ 实施时应**新建独立 router**（如 `routes/grid-attribution.js`）并在 `app.js` 挂载，**不改 `site-mgmt.js`**。

### 15.5 明确不修改的文件（实施期同样保持）

`wpsGridPullEngine.js` · `wpsFieldMap.js` · `gridInspectionRepository.js` · `authenticatedEmployeeResolver.js` · `gridScope.js` · `site-mgmt.js` · `app.js`（**除新增一行挂载**）· `wpsGridSyncScheduler.js` · `.env`

### 15.6 复用清单（结论：§十五 逐项）

| 现有能力 | 可否复用于**人工**归属 | 理由 |
|---|---|---|
| `resolveAttribution` | ⚠️ **不直接复用** | 它是**自动**路径（bridge→employee→grid）；人工路径的输入是「管理员提名」，语义不同。但**必须复用**其 `deriveGridIdForEmployee` 调用方式与 fail-safe 风格 |
| `resolveAttachmentStatus` | ✅ 复用（只读徽标） | 与归属无关，仅展示 |
| `computeSubmissionFingerprint` | ⚠️ **不用于人工** | 其前置含 `inspector_employee_id`（认领前为 NULL ⇒ 恒 NULL）；**人工认领后**可由 M2 补算（若需要）——但**不得**用姓名兜底 |
| `detectDuplicateCandidate` | ✅ 复用（只标记，不处理） | `candidate_only` 语义保持不变 |
| `resolveSourceChannel` | ✅ 复用（只读） | 不写、不推断 |
| `enrichAfterInsert` / `applyEnrichment` | ✅ 复用（M2 打标） | 其 `AND inspector IS NULL AND grid IS NULL` 守卫 = 人工路径的**同一安全底线** |
| `applyEnrichment` 的安全底线能否被人工破坏 | **不会**——人工端点使用**自己的** UPDATE 语句，但**照抄同一守卫**（§9.3） | 安全原则保持一致 |

---

## 16. 明确不实现的内容（§十六）

| # | 不实现 | 原因 |
|---|---|---|
| 1 | Attachment URL 解析 / 新 attachment service / 改图片字段 | §十二 明令；端点 404 |
| 2 | `client_token` 生成（改 H5 / 改 `site-mgmt.js`） | §十三 明令 |
| 3 | 任何 `wps_account_employee_map` 真实映射写入 | 禁姓名匹配；禁自动认领 |
| 4 | WPS Form 创建 / 任何 WPS 写操作 | 红线 |
| 5 | 自动归属（creator→employee） | Creator 已退出身份架构 |
| 6 | 重复记录自动删除 / 合并 | 禁弱字段自动删重 |
| 7 | 前端页面 / 菜单 / 路由 | 本阶段只设计；实施最小范围见 §15.4 |
| 8 | 生产 migration 执行 | 本阶段 READ-ONLY；M1 须单独授权 |
| 9 | 状态枚举的 DB 级约束 | 须 migration；当前无 CHECK，应用层即可 |
| 10 | 进入 P2-C / P2-D | §十九 明令 |

---

## 17. 后续实施顺序（§十七，建议）

| 序 | 步骤 | 前置 | 是否触碰冻结层 |
|---|---|---|---|
| 1 | 审阅本设计（你） + 决策 P1/P2/P3 | — | — |
| 2 | **M1** dev 重放 → 生产受护栏 DDL（新增列/表/索引） | 授权 P1 + 备份 | ❌ |
| 3 | **M2** stamping worker 实现 + dev 验证（含幂等、`--ids` 拒绝批量） | M1 | ❌ |
| 4 | **M3-a** 待归属清单 GET（只读） + dev 验证 own_grid 不可见 | M1 | ❌（新 router） |
| 5 | **M3-b** 认领 POST + 审计写入（事务内） + 并发测试（两会话竞争） | M3-a | ❌ |
| 6 | **M3-c** 撤销 DELETE（语义回退） + 审计 | M3-b | ❌ |
| 7 | 生产启用（`LEGACY_HIGH_WATERMARK_ID` 冻结、任务计划排程） | 全部 + 授权 | ❌ |
| 8 | （可选，独立立项）Attachment 解析 / `client_token` 生成 / 新权限码 `hse:site:grid:attribution` | 外部条件 | 视方案 |

> 每一步都应独立授权、独立验收（沿用本项目既有阶段制）。

---

## 18. 风险与未验证项（§十八）

| # | 风险 / 未验证 | 影响 | 缓解 |
|---|---|---|---|
| **R1** | **生产无 5 扩展列 + 无桥接表**（D3）⇒ 闭环在 M1 完成前**完全不可运行** | 高 | M1 为硬前置；须授权 + 备份 + dev 先重放 |
| **R2** | **无打标机制**（G1）⇒ 新行 `attribution_status` NULL ⇒ 队列恒空 | 高 | M2 必须有；否则闭环「看起来上线、实际无数据」 |
| **R3** | **无职责分离**：仅 1 个 `admin` 账号（且未绑定 employee） | 中 | 业务侧补齐 `hse_manager` 账号；审计以 `user_id` 为准 |
| **R4** | `operator_employee_id` **不可可靠取得**（admin 无 `employee_id`） | 中 | 显式写 NULL + 报告说明；不得用姓名兜底 |
| **R5** | `reason` 在 `audit_record` 中**无独立列** | 低 | 存入 `new_value.reason` 或 `changed_fields` |
| **R6** | 桥接表 `wps_account_id` **无 UNIQUE 约束** | 低（当前 0 行） | 应用层 `LIMIT 2` 已兜底；建议实施期补唯一索引 |
| **R7** | `gir.grid_id` FK 为 `ON DELETE SET NULL` ⇒ 删网格会静默清空归属 | 低 | 撤销以 `attribution_status` 为准；建议业务侧禁止删除在用网格 |
| **R8** | `LEGACY_HIGH_WATERMARK_ID = 7192` 依赖序列单调性 | 低 | 若发生 `dump/restore` 或手工插入低 id，需重新核定；已用「双 NULL 守卫」降低误伤面 |
| **R9** | `auditLog` **非事务化**（失败被吞） | 中 | 在归属事务内直接写审计（用 `client`），或明确接受非原子 |
| **R10** | `attachment_resolution_status` 缺 `not_applicable` ⇒ `DATA_READY` 不可达 | 中 | 实施期扩展枚举 + 修正 `resolveAttachmentStatus` 空图分支返回 `not_applicable` |
| **R11** | `resolveAttribution` 可能把 `manual_confirmed` 行改回 `pending`/`attributed` | 中 | 实施时加显式短路：`attribution_status='manual_confirmed'` ⇒ 不参与自动路径 |
| **R12** | 待归属队列在 **all_grid 角色**的现有 `GET /grid-records` 中仍会混入台账 | 低（展示层面） | 独立端点；如需从台账剔除，须改冻结的 `site-mgmt.js` ⇒ **不建议** |
| **R13** | 62 owner 当前全为 1 网格 ⇒ `MULTIPLE_GRID` 分支**零测试覆盖** | 低 | dev 造数验证该分支（可逆 UPDATE + 精确清理） |
| **R14** | 通道 B 数据对 `own_grid` 用户不可见（`grid_id` NULL） | 中（业务可感） | 属 fail-closed 正确表现；须向业务说明「认领后网格长才可见」 |

---

## 19. 生产基线确认（§十六 / §十九）

**复核时间**：2026-09-12 23:52（GMT+8）
**复核方式**：只读（`_p2b1_prod_regress.cjs` + 只读 schema 脚本）

```json
{ "database": "safety_dashboard",
  "gir_row_count": 2061,
  "sync_map_row_count": 2061,
  "max_gir_id": 7192,
  "conflict_rows": 0,
  "gir_column_count": 28,
  "gir_has_new_columns": [] }
PROD REGRESSION: PASS — 生产未变动
```

| 项 | 期望 | 实测 | 结果 |
|---|---|---|---|
| `grid_inspection_records` | 2061 | 2061 | ✅ |
| `grid_record_sync_map` | 2061 | 2061 | ✅ |
| `MAX(gir.id)` | 7192 | 7192 | ✅ |
| `conflict` | 0 | 0 | ✅ |
| gir 列数 | 28 | 28 | ✅ |
| `.env` mtime | 未变 | `2026-09-11 22:22:50` | ✅ |
| `WPS_GRID_DATA_SOURCE` | false | false | ✅ |
| `WPS_GRID_SYNC` | true | true | ✅ |
| `SCHEDULER_ENABLED` | true | true | ✅ |
| 5876 监听 | PID 23396 | PID **23396** LISTENING | ✅ |

### 19.1 本阶段写入计数（红线核对）

| 项 | 计数 |
|---|---|
| 生产 DML（INSERT/UPDATE/DELETE） | **0** |
| WPS 写（create/update/delete） | **0** |
| Migration / DDL | **0** |
| `.env` / scheduler / Pull Engine / H5 / auth 修改 | **0** |
| npm 依赖新增 | **0** |
| 代码文件修改（业务源码） | **0**（仅新增只读审计脚本，均命中 `.gitignore:145 _*.cjs`） |

### 19.2 05-H-0 冻结确认（§二十四）

| 冻结文件 | mtime | 是否本阶段修改 |
|---|---|---|
| `wpsGridPullEngine.js` | 2026-09-11 08:39:40 | ❌ |
| `wps/wpsFieldMap.js` | 2026-09-11 08:14:02 | ❌ |
| `wps/gridInspectionRepository.js` | 2026-09-08 20:29:23 | ❌ |
| `authenticatedEmployeeResolver.js` | 2026-09-10 14:49:40 | ❌ |
| `gridScope.js` | 2026-09-10 19:19:23 | ❌ |
| `site-mgmt.js` | 2026-09-12 16:41:31（GRID-03-B，早于本阶段 23:30） | ❌ |
| `app.js` | 2026-09-09 22:38:15 | ❌ |
| `wpsGridSyncScheduler.js` | 2026-09-11 16:29:00 | ❌ |

⇒ **05-H-0 冻结零变更；`.env` 三开关口径不变；Pull Engine 前置校验不受本设计影响。**

---

## 20. 最终结论（§二十）

### 20.1 本阶段判定

| 项 | 结论 |
|---|---|
| **PASS / NEEDS_REVIEW** | **PASS** |
| **最终状态** | **`READY_FOR_P2-B1-D-IMPLEMENTATION`** |

### 20.2 是否可以进入 implementation

**可以**，但**必须同时满足 3 项前置**：

| 前置 | 内容 | 谁决定 |
|---|---|---|
| **P1** | 授权一次**生产 DDL**（5 扩展列 + `business_fingerprint` + 桥接表 + 索引），受护栏 + 备份 | 你 |
| **P2** | 接受新增一个**独立 stamping worker**（不注册进现有 scheduler），用于给新拉取行打 `pending` | 你 |
| **P3** | 明确**运维操作人**（当前仅 1 个 `admin` 且未绑定 employee；是否补齐 `hse_manager` 账号） | 业务 |

任一项不满足，闭环仍可**设计完成**但**不可上线运行**——这不改变 PASS 判定（§十八 的条件清单全部已满足）。

### 20.3 implementation 最小范围

```
新增（全部在冻结层之外）：
  · 受护栏迁移 runner（DRY-RUN 默认 / --apply 才写 / 硬拒生产除非显式开关）
  · server/scripts/grid-attribution-stamp.cjs       （M2 打标 worker）
  · server/routes/grid-attribution.js               （M3 三个端点）
  · app.js 仅新增 1 行挂载                            （唯一对既有文件的改动）
复用（不改）：gridScope.deriveGridIdForEmployee / requireRole /
             sys_operation_log.auditLog / audit_record.createAuditRecord
不改：8 个冻结文件全部（site-mgmt.js 亦不改，用新 router 承载）
```

### 20.4 哪些文件必须保持冻结

`server/services/wpsGridPullEngine.js`、`server/services/wps/wpsFieldMap.js`、`server/services/wps/gridInspectionRepository.js`、`server/services/authenticatedEmployeeResolver.js`、`server/services/gridScope.js`、`server/routes/site-mgmt.js`、`server/app.js`（除新增挂载行）、`server/services/wpsGridSyncScheduler.js`，以及 `.env`。

### 20.5 哪些外部条件仍未验证

| # | 未验证项 | 归属阶段 |
|---|---|---|
| 1 | WPS Form 是否存在逐提交者 creator | 需人工外部验证（P2-B1-C-EXT 解除路径） |
| 2 | WPS Attachment URL 端点跨面授权 | 需 WPS 平台侧确认（DBT v1） |
| 3 | 生产 DDL 的实际执行窗口与备份策略 | 需你授权（P1） |
| 4 | 业务是否接受「通道 B 记录由人工确认身份」（C1） | 业务决策（决策失效条件） |
| 5 | 运维操作人角色/账号补齐 | 业务决策（P3） |
| 6 | `MULTIPLE_GRID` 分支的真实行为（当前零样本） | dev 造数验证（R13） |

### 20.6 ARCH-03 总体进度

```
ARCH-03  WPS 云端缓冲架构
├─ P1 / P1-VERIFY / P2-A             ✅ 只读审计完成
├─ P2-B0 / P2-B0-CONT                ✅ dev 基础设施（5 列 + 指纹 + 桥接表 + 3 索引）
├─ P2-B1-A                           ✅ 只读审计（READY_FOR_P2-B1-B）
├─ P2-B1-B                           ✅ Enrichment fail-safe 实现（30/30 测试）
├─ P2-B1-C                           ⚠️ NEEDS_REVIEW（系统能力 READY / 外部能力 PARTIALLY_UNVERIFIED）
├─ P2-B1-C-EXT                       ⛔ BLOCKED（无独立 Form 环境，逐提交者实证未执行）
├─ P2-B1-C-DECISION                  ✅ ARCHITECTURE_DECISION_READY（待人工审核）
└─ P2-B1-D  ← 本阶段                   ✅ READY_FOR_P2-B1-D-IMPLEMENTATION
                                       （待 P1 授权 / P2 接受 / P3 决策）

后续（未授权，禁止自动进入）：
   P2-C（通道 A 真实链路验证 → 通道 B）
   P2-D（正式切换）
```

---

## 附录 A：本次审计的只读证据文件

| 文件 | 内容 |
|---|---|
| `server/scripts/_p2b1d_schema.cjs` | 表/列/约束/索引/视图 只读审计（prod + dev） |
| `server/scripts/_p2b1d_aux.cjs` | 桥接表 / 角色分布 / 水印 / 审计表只读统计 |
| `server/scripts/_p2b1d_gridcard.cjs` | gir NULL 组合 + 网格负责人基数分布 |
| `server/scripts/_p2b1d_rel.cjs` | 负责人↔用户↔员工 1:1 关系 + assignment 现状 |
| `server/scripts/output/_p2b1d_schema.json` | 生产结构全量 JSON |
| `server/scripts/output/_p2b1d_schema_dev.json` | dev 结构全量 JSON（含 P2-B0 新增列） |
| `server/scripts/output/_p2b1d_aux_prod.json` / `_p2b1d_aux_dev.json` | 补充统计原始输出 |

> 全部脚本**仅 SELECT**，命中 `.gitignore:145 _*.cjs`，不进入业务路径。

## 附录 B：本次审计的关键代码锚点

| 能力 | 位置 |
|---|---|
| grid 派生（唯一） | `services/gridScope.js:131 deriveGridIdForEmployee` |
| 行级范围 SQL | `services/gridScope.js:109 buildScopeSqlCondition` |
| own_grid 角色 | `services/gridScope.js:33 OWN_GRID_ROLES` |
| all_grid 角色 | `services/gridScope.js:31 ALL_GRID_ROLES` |
| 角色守卫 | `middleware/auth.js:288 requireRole` |
| 权限码守卫 | `middleware/auth.js:468 requirePermission` |
| 角色→权限映射 | `middleware/auth.js:374 ROLE_PERMISSIONS_MAP` |
| 操作审计工具 | `routes/audit.js:31 auditLog` |
| 记录级审计工具 | `routes/hse-audit-records.js:6 createAuditRecord` |
| 三层高危范式 | `routes/site-mgmt.js:2078`（purge 三层保护） |
| 写白名单（不含归属字段） | `routes/site-mgmt.js:261 GRID_RECORD_EDITABLE` |
| enrichment 安全守卫 | `services/wps/gridEnrichmentService.js:253` |
| Pull 落库列来源 | `services/wpsGridPullEngine.js:249`（`Object.keys(dto)`） |
| 受保护列断言 | `services/wpsGridPullEngine.js:222 assertNoProtectedColumns` |

## 附录 C：§二十 六问的直答

| # | 问题 | 答案 |
|---|---|---|
| 1 | 本阶段 PASS / NEEDS_REVIEW | **PASS** |
| 2 | 是否可以进入 implementation | **可以**（附 P1/P2/P3 三项前置） |
| 3 | implementation 最小范围 | §20.3：迁移 runner + stamp worker + 新 router（3 端点）+ `app.js` 1 行挂载 |
| 4 | 哪些文件必须保持冻结 | §20.4：8 个文件 + `.env` |
| 5 | 哪些外部条件仍未验证 | §20.5：6 项 |
| 6 | ARCH-03 总体进度 | §20.6 |

---

**本阶段为 READ-ONLY DESIGN AUDIT。完成本文档后立即停止：不进入 implementation、不执行 migration、不创建 API/页面、不修改状态枚举、不修改数据库/WPS/Pull/Mobile。等待人工审核设计。**

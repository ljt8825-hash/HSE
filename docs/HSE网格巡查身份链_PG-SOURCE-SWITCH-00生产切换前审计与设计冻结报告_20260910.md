# HSE 网格巡查身份链 · PG-SOURCE-SWITCH-00
## 生产数据源切换前只读审计 + 设计冻结报告

- **阶段编号**：PG-SOURCE-SWITCH-00
- **阶段性质**：READ ONLY AUDIT + SWITCH PRECHECK + DESIGN FREEZE（零写、零切换）
- **执行日期**：2026-09-10
- **项目目录**：`G:\hse-dashboard`
- **后端**：`G:\hse-dashboard\server`（Express，`.env` `PORT=5876`，在线）
- **前端**：`G:\hse-dashboard\安全看板vben\apps\web-naive`
- **最终状态**：`PHASE_PG_SOURCE_SWITCH_00_BLOCKED_READY_FOR_REMEDIATION`

---

## 1. 执行摘要

### 1.1 一句话结论

**PG 侧在数据完整性、行级权限、CRUD 能力、前端兼容性四个维度上已经全部通过真机验证，技术上已具备承载正式业务的能力；但存在一个边界清晰、体量很小、必须由人工裁定的业务数据缺口——WPS 板上有 12 条记录（其中 8 条含真实三违内容，属"公司管理"级）从未进入 PG，切换后将完全从 HSE 系统中消失。** 因此本阶段不能给出"直接可切"的绿灯，判定为 **BLOCKED（待人工补救后即可切换）**。

### 1.2 七个必答问题的结论

| # | 问题 | 结论 |
|---|---|---|
| 1 | PG 数据完整性是否足够 | ✅ **足够**。2051/2051/62 不变量成立；orphan grid_id=0；删除网格=0；59 个网格有记录，缺 personnel_id 或 employee 的异常网格=0 |
| 2 | PG 与当前 WPS 业务数据覆盖情况 | ⚠️ **2051/2063**。全部 2051 条均有 `sync_map` 映射；2063−2051=**12 条 WPS 记录未入 PG**；字段级比对（归一化后）**100% 一致，不一致=0** |
| 3 | 前端是否依赖 WPS 特有字段/行为 | ✅ **不依赖**。`grid-ledger/index.vue` 全程只走 `/api/site-mgmt/grid-records` 统一 facade；全文**零处**使用 `gridId`；`id` 同时兼容 number/string |
| 4 | PG 模式下所有网格巡查 CRUD 是否完整 | ✅ **完整**（GET / filter-options / PUT / POST / DELETE / DELETE-ALL 六个端点均在）。**无 detail 端点，前端也不需要**。⚠️ 但"导入"是独立网关（见 §7.6） |
| 5 | PG own_grid 是否覆盖所有必要安全路径 | ✅ **覆盖**。真机 29/29 ALL_PASS：A/B 隔离、A 改 B 403 且数据不变、A 改自己 200、A 新增自动派生、admin all_grid、NULL 对 own_grid fail-closed |
| 6 | 切换 PG 前还有哪些阻塞项 | ⚠️ **4 项**（见 §12）：①12 条 WPS 缺口裁定；②`inspector_employee_id` 2051 条全 NULL 的身份回填；③327 条 NULL grid_id 的可见性口径确认；④导入路径未走身份链/数据源开关的治理确认 |
| 7 | WPS 切换后应继续承担什么角色 | **A+B+C 组合**：外部采集源 + 历史原始数据源 + 只读数据保留（**不参与** HSE 正式权限判断），并作为 D（后续独立同步源）的候选保留位 |

### 1.3 关键数字（本阶段实测）

```
PG grid_inspection_records = 2051   （grid_id NOT NULL = 1724 / NULL = 327）
PG grid_record_sync_map    = 2051   （conflict=true = 0）
live grid_areas            = 62     （personnel_id 全覆盖 62/62）
users(active)              = 63     （admin=1 / grid_inspector=62 / manager=0）
WPS 板记录                  = 2063   （2026-08=1724 / 2026-09=339）
WPS − PG                   = 12     （4 条疑似重复 + 8 条 C 段非标日期）
```

### 1.4 本阶段零写证明（摘要）

未修改 `WPS_GRID_DATA_SOURCE`、未改 `.env`、未重启生产 5876、未动 WPS 任何数据/Schema/字段、未对 PG 做任何业务写（唯一写操作是两个自建探针记录，创建后立即删除并校验 0 残留，前后计数 2051/2051/62 完全一致）。详见 §16。

---

## 2. 当前 WPS/PG 架构

### 2.1 数据源开关（三态判定，禁止静默回落）

`server/services/wps/gridDataSource.js` 提供 `getGridDataSourceMode()`，**每次进程只计算一次**并缓存：

| 值 | 触发条件 | 行为 |
|---|---|---|
| `pg` | `WPS_GRID_DATA_SOURCE` 非 `'true'` | 走 PostgreSQL |
| `wps` | `WPS_GRID_DATA_SOURCE='true'` 且 WPS 凭证（APP_ID/APP_SECRET/文件ID/表ID）完整 | 走 WPS 多维表格 |
| `misconfigured` | `='true'` 但凭证不完整 | **报配置错误，禁止静默回 PG** |

**当前 `.env` 实际值（实测）**：

```env
PORT=5876
WPS_GRID_DATA_SOURCE=true      # 生产走 WPS
WPS_GRID_SYNC=false            # 必须保持（历史下行会与人工补录并发写板）
```

### 2.2 请求分流路径

```
前端 grid-ledger/index.vue
   │  统一 facade：/api/site-mgmt/grid-records（GET / filter-options / PUT / POST / DELETE / DELETE-ALL）
   ▼
server/routes/site-mgmt.js
   │  gridDataSourceMode(res)
   ├── 'wps' ──► services/wps/gridInspectionRepository.js ──► services/wpsClient.js ──► WPS 开放平台 V7
   │              （全量载入 2063 条 → Node 内过滤 → 切片分页；DTO 硬编码 gridId:null）
   └── 'pg'  ──► PostgreSQL（SQL 层行级范围过滤 + 后端派生身份）
                   public.users.employee_id
                        ↓
                   public.employee.id
                        ↓
                   grid_areas.personnel_id  ──► grid_areas.id = grid_id
```

### 2.3 身份链（已冻结，不得反向修改）

- 权威链：`req.user.id → users.employee_id → employee.id → inspector_employee_id`
- PG 行级范围链：`users.employee_id → grid_areas.personnel_id → grid_areas.id → grid_inspection_records.grid_id`
- `req.user` 形状：`{ id, username, role, realName, jti }`（**刻意不含 employee_id**，每次实时查库）
- `grid_areas.personnel_id` = 网格**责任人**；`grid_inspection_records.inspector_employee_id` = 实际**巡查人**。两者严禁混用。

### 2.4 行级范围模型（`server/services/gridScope.js`）

| 范围 | 角色 | SQL 条件 |
|---|---|---|
| `all_grid` | `system_admin` / `admin` / `hse_manager` / `safety_manager` / `township_manager` | 无附加条件 |
| `own_grid` | `grid_inspector` / `manager` | `grid_id IN (SELECT id FROM grid_areas WHERE personnel_id = $n AND is_deleted = false)` |
| `none`（fail-closed） | 其他 / 未绑定 / 查不到网格 | `1 = 0` |

### 2.5 角色功能权限（`server/middleware/auth.js`）

```js
grid_inspector: ['hse:site:grid:view', 'hse:site:grid:create', 'hse:site:grid:update']
```

**无 `grid:delete`、无 `grid:purge`** → 删除与清空在**权限层**即被拒绝（早于任何数据源判定与删除动作）。

### 2.6 数据流方向（切 PG 后）

- **上行（WPS → PG）**：仅在 `WPS_GRID_SYNC=true` 时启用；当前为 `false`。
- **下行（PG → WPS）**：`PUT/POST/DELETE` 成功后调用 `wpsGridSync.onPgRowChanged / onPgRowsDeleted`（fire-and-forget，未启用时为 no-op）。
- 切 PG（`WPS_GRID_DATA_SOURCE=false`）**不改变** `WPS_GRID_SYNC` 的值；两条链路相互独立。

---

## 3. 审计 1：PG 数据完整性

### 3.1 总量与不变量

| 指标 | 实测值 | 期望 | 结论 |
|---|---|---|---|
| `grid_inspection_records` total | **2051** | 2051 | ✅ |
| `grid_id IS NOT NULL` | **1724** | — | ✅（B 段 8 月批次） |
| `grid_id IS NULL` | **327** | — | ⚠️ 见 §6 |
| `inspector_employee_id IS NOT NULL` | **0** | — | ⚠️ 100% NULL，见 §12 |
| `inspector_employee_id IS NULL` | **2051** | — | 同上 |
| `grid_record_sync_map` total | **2051** | 2051 | ✅ |
| `live grid_areas` | **62** | 62 | ✅ |
| `grid_areas`（含已删除） | **62** | — | ✅ 无软删除网格 |
| **不变量 `2051 / 2051 / 62`** | — | — | ✅ **成立** |

### 3.2 `grid_id → grid_areas` 归属完整性

| 检查项 | 结果 | 结论 |
|---|---|---|
| orphan `grid_id`（PG 有、grid_areas 无） | **0** | ✅ 无悬挂 |
| 落在 `is_deleted=true` 网格上的记录 | **0** | ✅ |
| `grid_id` 去重后覆盖的网格数 | **59**（共 62） | 3 个网格暂无记录（正常，非异常） |
| `personnel_id` 为空的网格 | **0** | ✅ |
| `personnel_id` 指向不存在/已删除 employee 的网格 | **0** | ✅ 异常网格清单为空 |
| 一个 employee 多重归属多个网格 | **0**（62 网格 62 个不同 personnel_id） | ✅ 无异常多重归属 |

**3 个零记录网格（正常空网格，非数据缺陷）**：

| grid_id | name | grid_code | personnel_id |
|---|---|---|---|
| 2 | 黄元同 | G002 | 6705 |
| 3 | 张康 | G003 | 6701 |
| 5 | 韩晓亮 | G005 | 6708 |

### 3.3 每网格记录分布（前 12）

| grid_id | 网格责任人 | personnel_id | 记录数 |
|---|---|---|---|
| 48 | 张玉祯 | 7099 | 32 |
| 56 | 盖广勇 | 6948 | 32 |
| 15 | 张卫新 | 7008 | 31 |
| 60 | 王铁民 | 6789 | 31 |
| 31 | 商荣军 | 7548 | 31 |
| 34 | 于会枝 | 7335 | 31 |
| 21 | 回伦山 | 7818 | 31 |
| 8 | 杨清华 | 7813 | 31 |
| 19 | 张运志 | 7707 | 31 |
| 30 | 刘秀梅 | 7983 | 31 |
| 24 | 康景英 | 7902 | 31 |
| 49 | 陈洪胜 | 7119 | 31 |

### 3.4 `inspector_employee_id` 有效性

- 非空行数 = **0**，去重 employee 数 = **0**。
- 即：**历史 2051 条记录的"实际巡查人"身份字段全部为空**（阶段 0 新增该列后，历史数据按"恒 NULL 不猜测"原则未回填）。
- 这不影响 own_grid（own_grid 依据 `grid_id`，而非 `inspector_employee_id`），但影响"谁实际巡查"的可审计性 → 列入 §12。

### 3.5 审计 1 结论

**PG 数据完整性优良**：零悬挂、零异常归属、零多重归属、网格-责任人关系 62/62 干净。数据量不变量 `2051/2051/62` 成立。

---

## 4. 审计 2：WPS 2063 vs PG 2051 覆盖分析

### 4.1 映射链（严格沿用正式映射链，未用主键强比）

依据 `grid_record_sync_map(pg_record_id ↔ wps_record_id, wps_file_id)` 这一**唯一正式映射链**，配合 WPS Record ID 比对，未以数据库主键强行对齐。

### 4.2 覆盖总账

| 方向 | 数量 | 结论 |
|---|---|---|
| WPS 总记录 | **2063** | 2026-08 = 1724 / 2026-09 = 339 |
| PG 总记录 | **2051** | 2026-08 = 1724 / 2026-09 = 327 |
| `sync_map` 映射行 | **2051** | 一一对应 |
| 实际比对配对（两侧均存在） | **2051** | 100% 配对 |
| **PG 未映射**（PG 有、sync_map 无） | **0** | ✅ |
| **WPS 未映射**（WPS 有、sync_map 无） | **12** | ⚠️ 见 §5 |
| **WPS orphan**（sync_map 有、WPS 无） | **0** | ✅ |
| **PG orphan**（sync_map 有、PG 无） | **0** | ✅ |
| **重复** `pg_record_id` | **0** | ✅ |
| **重复** `wps_record_id` | **0** | ✅ |
| **conflict = true** 行 | **0** | ✅ |

### 4.3 关键业务字段逐字段覆盖率与一致性

归一化规则：`null` / `''` / `'--'` 视为空；比较仅在两侧均非空时判定一致性。

| 字段（WPS → PG） | WPS 非空 | PG 非空 | 双方非空 | **不一致** | 风险 |
|---|---|---|---|---|---|
| `编号` → `serial_no` | 2025 | 2025 | 2025 | **0** | 无 |
| `姓名` → `personnel_name` | 2051 | 2051 | 2051 | **0** | 无 |
| `分组名称` → `area_team` | 2051 | 2051 | 2051 | **0** | 无 |
| `所属岗位` → `position` | 2051 | 2051 | 2051 | **0** | 无 |
| `网格等级` → `grid_level` | 2051 | 2051 | 2051 | **0** | 无 |
| `三违行为` → `violation_behavior` | 2051 | 2051 | 2051 | **0** | 无 |
| `违章人姓名` → `violator_name` | 596 | 596 | 596 | **0** | 无 |
| `违章人性别` → `violator_gender` | 576 | 576 | 576 | **0** | 无 |
| `违章人年龄` → `violator_age` | 572 | 572 | 572 | **0** | 无 |
| `三违照片链接` → `image_content` | 2025 | 2025 | 2025 | **0** | 无 |
| `整改后照片链接` → `rectified_photo` | 555 | 555 | 555 | **0** | 无 |
| `昵称2` → `nickname` | 2033 | 2033 | 2033 | **0** | 无 |
| `标记` → `marker` | 278 | 278 | 278 | **0** | 无 |
| `当日是否报名` → `signup_today` | 1209 | 1209 | 1209 | **0** | 无 |
| `提交时间` → `upload_time` | 933 | 933 | 933 | **0** | 无 |
| `是否补交` → `is_resubmit` | 1143 | 816 | 816 | **0** | 见 §4.5 |
| `日期` → `inspection_date` | 2051 | 2051 | 2051 | **0**（本地归一化后） | 见 §4.4 |
| `巡查人员ID` → `inspector_employee_id` | **0** | **0** | 0 | 0 | 双方皆空（WPS 填充率 0%） |
| `上报状态` → `report_status` | **0** | **0** | 0 | 0 | 双方皆空，列存在但未启用 |
| `车辆类型` → `vehicle_type` | **0** | **0** | 0 | 0 | 同上 |
| `违章类型结果` → `violation_type_result` | **0** | **0** | 0 | 0 | 同上 |
| `是否需要整改` → `need_rectification` | **0** | **0** | 0 | 0 | 同上 |
| `整改人` → `rectifier` | **0** | **0** | 0 | 0 | 同上 |
| `示意图链接` → `schematic` | **0** | **0** | 0 | 0 | 同上 |

**字段映射链真源**：`server/services/wps/wpsFieldMap.js`（业务字段 ↔ PG 列 ↔ WPS 字段的唯一出口）。上表已沿该真源审计，**未因"字段名不同"而误判缺失**（例：`三违照片链接 → image_content`、`姓名 → personnel_name` 等异名映射均已正确对齐并 0 不一致）。

### 4.4 日期一致性（重要修正）

初次比较出现 `inspection_date` 2051 条"全部不一致"，经查为**比较方法的时区假象**：PG `date` 列被 node-pg 解析为本地午夜 Date，再经 `toISOString()` 转 UTC 时减 8 小时 → 显示为前一日。

改用**本地日期分量**归一化后重新比对：

```
pairs = 2051   match = 2051   mismatch = 0
```

✅ **日期 100% 一致**。WPS 的 `"2026-09-02 08:23"` 与 `"2026年09月02日"` 两种文本格式均正确归一到年月日。

### 4.5 `is_resubmit` 差异（327 条，非数据丢失）

WPS 侧 `是否补交` 非空 1143 条，PG 侧 816 条，差额 **327** 条。逐条核查：这 327 条 WPS 值均为**字面字符串 `"nan"`**（Excel 导出 NaN 的残留文本）。

PG 在迁移 DTO 中按既定规则 `"nan" → NULL`（`wpsGridMigrationService.js` 的 `PSEUDO_EMPTY` 集合），故 PG 更干净。**属 WPS 脏值被正确清洗，不是数据丢失**。

### 4.6 WPS 实际字段清单（真机实测，用于确认列存在性）

```
三违照片链接:2037  三违照片：图片1:339  三违行为:2063  分组名称:2063  姓名:2063
当日是否报名:1217  所属岗位:2063  提交时间:938  日期:2063  是否补交:1148  昵称2:2045
来源日期:332  标记:610  编号:2030  网格等级:2063  违章人姓名:2063  违章人年龄:2063
违章人性别:2063  整改后照片链接:555  整改后照片：图片1:84  三违照片：图片2:14  三违照片：图片3:6
```

说明：`巡查人员ID`、`上报状态`、`车辆类型`、`违章类型结果`、`是否需要整改`、`整改人`、`示意图链接` 七个字段**全表为空值**，WPS `list_by_page` 不回传空字段键，故未出现在上表中——这不代表列不存在（Sprint-WPS-02-B 已真机补建），而是**列存在但 0 填充**。

### 4.7 审计 2 结论

**除 12 条未映射记录与 6 个"双方皆空"的预留字段外，PG 与 WPS 业务数据完全等价（字段级 0 不一致）**。映射无 orphan、无 conflict、无 duplicate。

---

## 5. 审计 6：12 条差异分析（2063 − 2051 = 12）

### 5.1 差异归属（**修正一项历史认知**）

经与本项目 `services/wpsGridMigrationService.js` 的 A 段候选派生逻辑逐条比对：

```js
bandOf = (r) => /^2026-09-0[1-6]/.test(日期) ? 'A' : /^2026-08/.test(日期) ? 'B' : 'C'
候选 = A 段 − 疑似重复(姓名|日期|三违行为|违章人姓名 组合键去重)
EXPECTED_CANDIDATES = 327,  MIGRATION_SCOPE = 'A_ONLY'
```

分段实测：`A 段 = 331`、`疑似重复排除 = 4`、`候选 = 327`、`C 段(9 月) = 8`；`331 + 1724(B) + 8(C) = 2063` ✅ 完全闭合。

**⚠️ 重要更正**：此前项目记忆中"12 条 = C 批（赵书坤→7085、郭秀梅→7947 等人裁定）"的说法**与实际不符**。本次实测：**赵书坤（37 条）、郭秀梅（36 条）在 WPS 中的记录全部 `mapped=true`，即已全部进入 PG**（赵书坤 → grid_id 44 杜集镇；郭秀梅 → grid_id 28 时集镇）。12 条差异与这两人无关。

**12 条的真实构成 = 4 条疑似重复保护性排除 + 8 条 C 段（日期格式异常）**。

### 5.2 12 条明细

#### 组 1：疑似重复排除（4 条，A 段内被保护性剔除 → 落入人工池）

| WPS ID | 编号 | 姓名 | 分组 | 日期 | 三违行为 | 违章人 | 网格等级 |
|---|---|---|---|---|---|---|---|
| BS | L2604 | 王铁民 | 津城街道 | 2026-09-02 08:23 | 无三违行为 | -- | 三级网格长 |
| BT | L2609 | 王铁民 | 津城街道 | 2026-09-02 08:25 | 无三违行为 | -- | 三级网格长 |
| D_ | L2793 | 谢俊章 | 大柳镇 | 2026-09-05 11:15 | 无三违行为 | -- | 二级网格长 |
| EA | L2794 | 谢俊章 | 大柳镇 | 2026-09-05 11:15 | 无三违行为 | -- | 二级网格长 |

- 触发排除的原因：每对记录的 `姓名 + 日期 + 三违行为 + 违章人姓名` 组合键完全相同，被 A 段"保护性重复检查"判为疑似重复，**两条同时**退回人工池（宁可漏迁、不可错迁）。
- 业务含义：这 4 条均为**同日同人两次巡查**或**重复登记**。内容为"无三违行为"（无违章人），**不含真实三违内容**，业务影响低。
- 已确认**均未进入 PG**（编号 L2604/L2609/L2793/L2794 在 PG 中查无）。

#### 组 2：C 段日期格式异常（8 条，非 A 段口径）

| WPS ID | 编号 | 姓名 | 分组 | 日期（原文） | 三违行为 | 违章人 | 网格等级 |
|---|---|---|---|---|---|---|---|
| FD | — | 刘金涛 | 公司管理 | `2026年09月02日` | 未穿工作服 | 赵万平 | 一级网格长 |
| FG | — | 刘金涛 | 公司管理 | `2026年09月02日` | 骑车不戴头盔 | 肖瑞红 | 一级网格长 |
| FN | " " | 黄殿兴 | 公司管理 | `2026年09月01日` | 骑车不戴头盔 | 王连方 | 总网格长 |
| FQ | — | 黄殿兴 | 公司管理 | `2026年09月04日` | 未穿工作服 | 许廷臣 | 总网格长 |
| FT | — | 刘金涛 | 公司管理 | `2026年09月02日` | 背向来车方向作业 | 吕孟辉 | 一级网格长 |
| FU | — | 刘金涛 | 公司管理 | `2026年09月02日` | 骑车不戴头盔 | 张荣军 | 一级网格长 |
| FV | — | 刘金涛 | 公司管理 | `2026年09月02日` | 骑车不戴头盔 | 张英华 | 一级网格长 |
| FW | — | 刘金涛 | 公司管理 | `2026年09月04日` | 背向来车方向作业 | 刘玉花 | 一级网格长 |

- 触发 C 段的原因：日期写作**中文"年月日"格式**（`2026年09月02日`），不匹配 A 段正则 `^2026-09-0[1-6]`，被自动归入 C 段人工池。
- 业务含义：**8 条全部含真实三违内容**（未穿工作服 / 骑车不戴头盔 / 背向来车方向作业），违章人具体，属公司管理级（一级网格长刘金涛 6 条、总网格长黄殿兴 2 条）。
- 已确认**均未进入 PG**。
- 归属网格推定：`公司管理` 对应 `grid_areas.id = 1`（name=黄殿兴，grid_code=G001）。若未来补迁，其 grid_id 应落 **1**。

### 5.3 12 条的当前状态

| 项 | 结论 |
|---|---|
| 是否仍未进入 PG | ✅ **是**，12 条全部不在 `grid_inspection_records` |
| 是否属于赵书坤 / 郭秀梅记录 | ❌ **否**（该两人 73 条记录已全部在 PG） |
| 是否属于"人工确认批次" | ⚠️ 属 **A_ONLY 迁移口径的自动排除池**（4 条重复保护 + 8 条 C 段），非人工裁定批次 |
| WPS 侧创建时间 | 全部为 `2026/09/08 17:12:00`（09-08 批量入板），最后修改 `2026/09/08 19:44:38` |
| 是否待处理 | ✅ **是，仍属待处理状态**；本阶段**未做任何迁移或写入** |
| 编号可追溯性 | 组 1 有编号（L2604/L2609/L2793/L2794）；组 2 无编号（空/空白） |

### 5.4 业务影响评估

- 组 1（4 条）：内容为"无三违行为"，**业务影响低**。
- 组 2（8 条）：**含真实三违记录**，切换 PG 后将从 HSE 系统中完全消失（不仅 grid_inspector 不可见，admin 也不可见，因 PG 无此数据）。**这是本阶段判为 BLOCKED 的首要原因。**

---

## 6. 审计 6（续）：327 条 NULL grid_id 分析

### 6.1 基本画像

| 指标 | 实测值 |
|---|---|
| 数量 | **327** |
| 是否都有 `sync_map` | ✅ **327/327 全部有**（即均为正式迁移入库，非脏数据） |
| 日期区间 | `2026-09-01` ~ `2026-09-06` |
| 所属月份 | **全部集中 2026-09** |
| `created_at >= 2026-09-09` | 327（即 WPS-03-B A 段 09-09 09:21 批次 WPS03B-20260909210633 迁入） |
| `serial_no LIKE 'WPS03B%'` | 0（未加批次前缀，编号保持原值） |

### 6.2 与 B 段的关系

| 批次 | 月份 | 数量 | grid_id |
|---|---|---|---|
| B 段（既有映射） | 2026-08 | 1724 | ✅ 有值 |
| A 段（WPS-03-B 迁入） | 2026-09 | 327 | ❌ 全 NULL |

**9 月记录 100% 为 NULL grid_id**（PG 中 `2026-09` 的 327 条全部 `grid_id IS NULL`，无一条有值）。

### 6.3 可见性口径（fail-closed，符合要求）

| 角色 | 能否看到 327 条 | 依据 |
|---|---|---|
| `admin`（all_grid） | ✅ **可见**（全部 2051 条加权可见） | 无 scope 条件 |
| `grid_inspector`（own_grid） | ❌ **不可见** | `grid_id IN (SELECT ...)`，NULL 不匹配任何值 |
| 其他非识别角色 | ❌ 不可见 | `1 = 0` |

**真机验证**：临时 PG 实例中 A（grid 48）返回 32 条、B（grid 56）返回 32 条，`A 看不到 grid_id=NULL` = **PASS**（29/29）。

### 6.4 结论

**接受"历史 NULL 数据 → grid_inspector 不可见 → admin 可见"的口径（fail-closed），不为"数据显示完整"而放开权限。** 但需注意：327 条占 9 月全部数据的 100%，切换后**所有 62 个网格负责人将看不到任何 9 月记录**。这不是权限缺陷，而是**数据回填缺口**——须由人工确认是否在切换前补派生 grid_id（当前口径：A 段迁移刻意未派生，不猜测）。

---

## 7. 审计 3：PG 模式 CRUD 审计

### 7.1 端点清单（`server/routes/site-mgmt.js`）

| 端点 | 权限 | PG 模式行为 |
|---|---|---|
| `GET /grid-records` | `hse:site:grid:view` | ✅ scope 过滤 + keyword/areaTeam/gridLevel/reportStatus/month/分页/服务端排序 |
| `GET /grid-records/filter-options` | `hse:site:grid:view` | ✅ DB 聚合 areaTeams / gridLevels / reportStatuses / months |
| `GET /grid-records/:id`（detail） | — | ⚠️ **不存在**（前端也不需要，见 §9） |
| `PUT /grid-records/:id` | `hse:site:grid:update` | ✅ 白名单更新 + scope 进 WHERE + 0 行 → 403 SCOPE_DENIED |
| `POST /grid-records` | `hse:site:grid:create` | ✅ 剥离客户端身份字段 + resolver 派生 + grid_id 派生 403/409 |
| `DELETE /grid-records` | `hse:site:grid:delete` | ✅ scope 进 WHERE |
| `DELETE /grid-records/all` | `purge` + `role∈{system_admin,admin}` + `confirmText` | ✅ 三层保护 |

### 7.2 列表能力（PG）

| 能力 | 实现 | 结论 |
|---|---|---|
| 分页 | `LIMIT/OFFSET`，`pageSize` 上限钳 200 | ✅ |
| 关键字搜索 | `personnel_name / area_team / violator_name / violation_behavior` ILIKE | ✅ |
| 日期（月份）筛选 | `to_char(inspection_date,'YYYY-MM') = $n` | ✅ |
| 分组（片区/班组）筛选 | `area_team = $n` + filter-options | ✅ |
| 上报状态筛选 | `report_status = $n` | ✅（该列当前全空，筛不出数据，非缺陷） |
| 三违/整改照片叠加筛选 | `hasViolation` / `hasRectifiedPhoto` | ✅ |
| 排序 | 白名单列 `inspectionDate/id/personnelName/areaTeam`，默认日期倒序 | ✅ 防注入 |

### 7.3 新增（POST）—— 客户端不可提交身份字段

**静态确认**：`GRID_RECORD_CREATE_CAMELS` 白名单 + 三重剥离。

```js
delete body.inspectorEmployeeId;  delete body.inspector_employee_id;
delete body.gridId;               delete body.grid_id;
identity = await resolveAuthenticatedEmployeeFromRequest(req);   // 失败 → 直接拒绝
if (!identity.ok) return res.status(identity.httpStatus)...      // fail-closed
gridDerive = await deriveGridIdForEmployee(identity.employeeId);
  no_grid  → 403 NO_GRID_FOR_EMPLOYEE
  multiple → 409 MULTIPLE_GRIDS_FOR_EMPLOYEE
```

**动态确认**（真机，客户端同时提交 `inspectorEmployeeId:999999, inspector_employee_id:999999, gridId:999999, grid_id:999999`）：

```
PASS  A 新增 inspector_employee_id = A.employee_id  (expect=7099 actual=7099)   DTO 不外泄该字段
PASS  A 新增 grid_id = A.grid_id（客户端 999999 被剥离） (expect=48 actual=48)
```

✅ 客户端越权值被完全忽略；`inspector_employee_id` **不出现在 DTO** 中（`formatGridInspectionRow` 不暴露该字段），前端无从读取或回填。

### 7.4 修改（PUT）—— 身份字段不可改

- 白名单 `GRID_RECORD_EDITABLE`（17 列）**不含** `inspector_employee_id`、`grid_id`、`id` → 前端无从修改。
- scope 条件直接拼入 `UPDATE ... WHERE id=$n AND <scope>`；0 行时按 scope 区分：非 all_grid → **403 SCOPE_DENIED**，all_grid → 记录不存在。
- 真机：`A 改 B 记录 403`、`B 记录未被 A 篡改`、`A 改自己记录 200` 均 PASS。

### 7.5 删除 / 清空

| 操作 | grid_inspector | 三层保护 |
|---|---|---|
| `DELETE /grid-records` | **403**（无 `grid:delete`） | — |
| `DELETE /grid-records/all` | **403**（无 `grid:purge`，早于任何删除） | ① `requirePermission('hse:site:grid:purge')` ② `requireRole('system_admin','admin')` ③ `body.confirmText === '清空全部台账'` |
| admin 不带 `confirmText` 清空 | — | **400 PURGE_CONFIRM_REQUIRED**（删除前拦截） |

真机：`grid_inspector DELETE 403` / `grid_inspector DELETE ALL 403` / `admin DELETE ALL 缺二次确认 → 400` / `两次被拒后记录仍存在` 全部 PASS。**三层保护无丢失**。

### 7.6 ⚠️ 独立写入路径：Excel 导入（不在 facade 内）

`grid-ledger/index.vue` 的"导入"走 **`useGenericImport('grid')`** → `/import/template|upload|confirm|rollback`（`server/routes/import.js`），**不是** `/site-mgmt/grid-records` facade。审计结论：

| 项 | 事实 | 风险评级 |
|---|---|---|
| 权限 | `requireRole('admin','safety_manager')` 全部端点 | ✅ grid_inspector 无法使用，**不构成 own_grid 越权** |
| 数据源感知 | **否**。直接写 PG 的 `grid_inspection_records`，不读 `WPS_GRID_DATA_SOURCE` | ⚠️ 中（切 PG 后行为一致，但切换前后语义不统一） |
| 身份链 | **否**。`inspector_employee_id` 不派生；`grid_id` 由**姓名匹配**（`grid_areas.name`）优先、退回 `片区/班组 + 网格等级` 模糊匹配（`name ILIKE '%area%'`） | ⚠️ **中高**：与"禁姓名作身份键"红线冲突，且不写 `inspector_employee_id`（故导入行对 own_grid 的表现取决于模糊匹配出的 grid_id 是否正确） |
| 下行同步 | 不触发 `wpsGridSync` | — |

**这是本阶段发现的、独立于数据源切换的既有风险项**，需人工确认治理口径（列入 §12）。

### 7.7 审计 3 结论

**PG 模式下六个 facade 端点全部完整可用**，权限、scope、身份派生、三层保护均已真机验证。唯一偏差是"导入"属 facade 之外的独立网关（admin/safety_manager 专属），需治理确认，但不阻塞 grid_inspector 的 own_grid 安全模型。

---

## 8. 审计 4：own_grid 真实 HTTP 安全路径（真机 29/29 ALL_PASS）

### 8.1 测试方式（满足"真实 Express + 只读/事务/独立进程"）

- 独立临时进程：`spawn(process.execPath, ['app.js'], { env: { PORT: 5881, WPS_GRID_DATA_SOURCE: 'false' } })`（**进程级覆盖，未改 `.env`，未动生产 5876**）。
- 自签 JWT（含 `jti` + `type:'access'`），真实 `fetch` HTTP 打真实 Express，真实 router + 真实中间件。
- 写操作仅限"自建探针记录"，用毕即删，结束时校验 0 残留 + 计数不变。

### 8.2 测试账号（真实库选取）

| 账号 | employee_id | grid_id | 该网格记录数 |
|---|---|---|---|
| A = `z1658`（张玉祯） | 7099 | **48** | 32 |
| B = `g4977`（盖广勇） | 6948 | **56** | 32 |
| admin | — | — | all_grid |

### 8.3 结果全表（29/29 PASS）

| # | 断言 | 期望 | 实测 | 结果 |
|---|---|---|---|---|
| 1 | 启动临时 PG 实例并健康 | true | true | ✅ |
| 2 | A GET 200 | 200 | 200 | ✅ |
| 3 | A 仅见自己网格 grid_id=48 | true | true（gridIds=[48]） | ✅ |
| 4 | A 看不到 grid_id=NULL（327 条） | false | false | ✅ |
| 5 | A 记录数 = 自己网格记录数 | 32 | 32 | ✅ |
| 6 | B GET 200 | 200 | 200 | ✅ |
| 7 | B 仅见自己网格 grid_id=56 | true | true（gridIds=[56]） | ✅ |
| 8 | B 看不到 grid_id=NULL | false | false | ✅ |
| 9 | A 与 B 记录互不相交 | 0 | 0 | ✅ |
| 10 | A 新增 200 | 200 | 200 | ✅ |
| 11 | A 新增 `inspector_employee_id` = A.employee_id | 7099 | 7099（DTO 不外泄） | ✅ |
| 12 | A 新增 `grid_id` = A.grid_id（客户端 999999 被剥离） | 48 | 48 | ✅ |
| 13 | B 新增 `grid_id` = B.grid_id | 56 | 56 | ✅ |
| 14 | A 改自己记录 200 | 200 | 200 | ✅ |
| 15 | A 改自己记录生效 | PGS00_PROBE_A_EDIT | PGS00_PROBE_A_EDIT | ✅ |
| 16 | **A 改 B 记录 403** | 403 | 403（SCOPE_DENIED） | ✅ |
| 17 | **B 记录未被 A 篡改** | PGS00_PROBE_B | PGS00_PROBE_B | ✅ |
| 18 | grid_inspector DELETE 403 | 403 | 403 | ✅ |
| 19 | grid_inspector DELETE ALL 403 | 403 | 403 | ✅ |
| 20 | 两次被拒后记录仍存在 | 1 | 1 | ✅ |
| 21 | admin GET total = 全量 | ≥2051 | 2053（含 2 探针） | ✅ |
| 22 | admin 未受 scope 限制 | 200 | 200 | ✅ |
| 23 | grid_id=NULL 对 admin 可见（DB 侧存在） | >0 | 327 | ✅ |
| 24 | admin DELETE ALL 缺二次确认 → 400 | 400 | 400 | ✅ |
| 25 | admin 清理探针 200 | 200 | 200 | ✅ |
| 26 | 探针零残留 | 0 | 0 | ✅ |
| 27 | `grid_inspection_records` 计数不变 | 2051 | 2051 | ✅ |
| 28 | `grid_record_sync_map` 计数不变 | 2051 | 2051 | ✅ |
| 29 | `live grids` 计数不变 | 62 | 62 | ✅ |

**VERDICT = ALL_PASS (29/29)**；输出留档 `server/scripts/output/pgsource00-ownscope-test.json`。

### 8.4 生产 WPS 模式现状对照（只读探测，仅 GET）

对生产 5876 发起**只读 GET**（未发起任何 DELETE）：

| 账号 | 角色 | grid_id | GET total | 返回消息 |
|---|---|---|---|---|
| `l5801` | grid_inspector | 67 | **2063** | 查询成功(WPS) |
| `admin` | admin | — | 2063 | 查询成功(WPS) |

**证实 §2.6 与 §11 的风险**：当前 WPS 模式下，grid_inspector 的 GET **完全没有 scope 约束**（走 `site-mgmt.js` L1465 early-return），可见全部 2063 条跨乡镇记录，与自己的网格无关；PUT 同理（L1600 early-return）。**切换 PG 正是消除该越权暴露的手段。**

---

## 9. 审计 3（续）：前端兼容性审计

### 9.1 页面与调用面

`apps/web-naive/src/views/site/grid-ledger/index.vue`（734 行）——全部网格巡查 PC 功能均经统一 facade：

```ts
getGridInspectionList        → GET  /site-mgmt/grid-records
getGridInspectionFilterOptions→ GET /site-mgmt/grid-records/filter-options
updateGridInspectionRecord   → PUT  /site-mgmt/grid-records/:id
createGridInspectionRecord   → POST /site-mgmt/grid-records
deleteGridInspectionRecords  → DELETE /site-mgmt/grid-records
clearGridInspectionRecords   → DELETE /site-mgmt/grid-records/all
```

✅ 六个功能（列表/筛选选项/新增/修改/删除/清空）**全部经统一 facade**；**不存在** detail 调用，后端也**不存在** detail 端点 → 该差异无影响（图片预览直接从行数据的 `imageContent/rectifiedPhoto/schematic` 逗号串解析）。

### 9.2 WPS 特有字段/行为依赖

| 检查项 | 结论 |
|---|---|
| 页面是否使用 `gridId` | ✅ **零处使用**（`grep gridId index.vue` → 无匹配） |
| 是否依赖 WPS 返回的 `id` 类型 | ✅ 不依赖。删除逻辑显式兼容 `number`（PG 自增）与 `string`（WPS Record ID） |
| 是否依赖 WPS 的 `gridId: null` | ✅ 不依赖（WPS DTO 硬编码 `gridId: null // PG-only`，UI 不使用该字段） |
| 是否依赖其它 WPS 独有字段 | ✅ 无。字段映射统一走 `wpsFieldMap.js`，DTO 形状一致 |
| 筛选选项的等价性 | ✅ PG 与 WPS 的 `area_team` 均为同 13 个值（含"公司管理"） |

**结论：前端完全数据源无关，切换 PG 无需任何前端改动。**

### 9.3 新增表单不提交身份字段（静态确认）

`formModel` 键集合 = `areaTeam, inspectionDate, personnelName, gridLevel, position, violatorName, violatorGender, violatorAge, vehicleType, reportStatus, imageContent, violationBehavior, violationTypeResult, needRectification, rectifier, rectifiedPhoto, schematic`。

✅ **不含** `inspectorEmployeeId` / `inspector_employee_id` / `gridId` / `grid_id` → 客户端在结构上无法提交这四个字段（后端另有三重剥离作为纵深防御）。

### 9.4 单元格编辑

`EDITABLE_FIELD_MAP`（17 个 camel→snake）与后端 `GRID_RECORD_EDITABLE` 白名单**逐项一致**，**均不含** `inspector_employee_id` / `grid_id`。✅

### 9.5 已知前端缺口（不阻塞切换，承接 3B-3）

- 删除与清空按钮**未按角色隐藏**：grid_inspector 能看到按钮，点击后由后端 403 拦截。安全无虞（后端为唯一授权），属体验问题。
- 导入按钮同样未按角色隐藏；后端 `requireRole('admin','safety_manager')` 拦截。

---

## 10. 审计 5：WPS 在切 PG 后的定位

### 10.1 前提

若切换为：

```env
WPS_GRID_DATA_SOURCE=false
WPS_GRID_SYNC=false
```

则 WPS 平台与当前业务系统之间**不再有任何运行时读写耦合**（`isEnabled()` 返回 false → 上行/下行均 no-op）。

### 10.2 候选定位评估

| 候选 | 契合度 | 分析 |
|---|---|---|
| **A. 外部采集源** | ✅ **高** | WPS 板仍是乡镇网格长现场填报/手机端采集的入口（业务上从未停用）；PG 作为系统内唯一权威读模型。**推荐承担**。 |
| **B. 历史原始数据源** | ✅ **高** | 2063 条原始记录（含 12 条未入 PG）保留为不可变的历史底账，供对账/追溯。**推荐承担**。 |
| **C. 只读数据保留** | ✅ **高** | 切换后系统**不读** WPS；WPS 仅作人工查阅。**推荐承担**。 |
| **D. 后续独立同步源** | ⚠️ 保留位 | 若未来重启上行同步，须先补 `巡查人员ID` 填充与可靠 grid key（WPS-ROW-SCOPE-00 已判 `NO_RELIABLE_GRID_KEY`），**当前不具备条件，仅作候选保留**。 |

### 10.3 推荐定位（组合式）

> **WPS = A（外部采集源）+ B（历史原始数据源）+ C（只读数据保留），并保留 D 作为未来独立同步源的候选位。**

### 10.4 WPS 能否继续保留而不参与 HSE 正式权限判断

✅ **能，且这正是切换的核心收益。**

- 权限判断完全由 `users.role` + `gridScope.js` + `grid_id` 决定，三者均在 PG 侧；
- WPS 模式下 GET/PUT 的 early-return 会**绕过** scope（§8.4 已验证越权暴露），切 PG 后该绕过路径自然消失；
- WPS 不含可靠网格键（`巡查人员ID` 填充率 0%），**本就不具备参与权限判断的资格**。

**设计冻结**：切换后 WPS 不得作为任何权限/身份判定的依据；如需恢复同步，必须先完成 §12 的 ①②前提。

---

## 11. 审计 6（续）：切换风险评估

### 11.1 四类清单

#### A. 切 PG 前**必须完成**

| # | 事项 | 依据 | 阻塞级别 |
|---|---|---|---|
| A1 | **裁定 12 条 WPS 未映射记录**（迁移 / 明确放弃并留档） | §5.4：8 条含真实三违，切后将从系统消失 | **阻塞** |
| A2 | 确认"9 月 327 条对 grid_inspector 不可见"为**已接受口径**并书面留档 | §6.4 | **阻塞（需人工确认）** |
| A3 | 安排维护窗口：改 `.env` 后**必须重启 5876**（`getGridDataSourceMode()` 进程内缓存，运行中改 `.env` 不生效） | §2.1 | **阻塞（操作前置）** |
| A4 | 确认切换瞬间无 WPS 新增写入（或接受只读快照） | `WPS_GRID_SYNC=false` 下 WPS 仍在被人工补录 | 建议完成 |

#### B. 切 PG 后**立即验证**

| # | 事项 | 验证方式 |
|---|---|---|
| B1 | `GET /api/health` 正常 + 日志显示数据源为 pg | curl + 启动日志 |
| B2 | admin GET total = **2051** | 真实 HTTP |
| B3 | grid_inspector GET 仅见自己网格（不再看到 2063） | 真实 HTTP（A/B 双账号） |
| B4 | grid_inspector PUT 他人记录 → 403 SCOPE_DENIED | 真实 HTTP |
| B5 | grid_inspector POST 自动派生 grid_id / inspector_employee_id | 真实 HTTP + DB 核对 |
| B6 | DELETE / DELETE ALL 对 grid_inspector 仍 403 | 真实 HTTP |
| B7 | `ROLE_PERMISSIONS_MAP` 已加载 `grid_inspector`（重启后 3 项权限仍在） | `GET /user/info` roles 回显 |
| B8 | Vite proxy 仍指向 `127.0.0.1:5876`（未变） | 前端实际请求 |
| B9 | 数据计数不变量 2051 / 2051 / 62 | DB 查询 |
| B10 | 前端台账页可正常加载、筛选、编辑、新增 | 浏览器实测 |

#### C. **可延后处理**

| # | 事项 | 说明 |
|---|---|---|
| C1 | `inspector_employee_id` 2051 条回填（Batch 3 遗留） | 不影响 own_grid；影响"实际巡查人"审计 |
| C2 | 327 条 NULL grid_id 的历史回填 | 属历史数据治理，不影响安全模型 |
| C3 | 前端删除/清空/导入按钮按角色隐藏 | 体验优化，后端已拦截 |
| C4 | 6 个"双方皆空"字段（上报状态/车辆类型/违章类型结果/是否需要整改/整改人/示意图）的产品化 | 能力已就绪，未启用 |
| C5 | 导入路径的身份链治理（§7.6） | 仅 admin/safety_manager 可达，不阻塞 |

#### D. **禁止自动处理**

| # | 禁止项 | 原因 |
|---|---|---|
| D1 | 自动迁移 12 条 WPS 记录 | 需人工裁定（含疑似重复判定） |
| D2 | 按姓名/昵称自动回填 `inspector_employee_id` 或 `grid_id` | 重名 85 组，红线禁止 |
| D3 | 自动开启 `WPS_GRID_SYNC` | 会与用户人工补录并发写板 |
| D4 | 自动切换 `WPS_GRID_DATA_SOURCE` | 本阶段严禁 |
| D5 | 自动为 327 条猜测 grid_id | fail-closed，不猜测 |
| D6 | 为"数据更全"放开 NULL 可见性 | 违反 fail-closed 红线 |

### 11.2 关注点逐项回答

| # | 关注点 | 结论 |
|---|---|---|
| 1 | 2051 PG 数据是否足够 | ✅ 足够（字段级 0 不一致，业务内容与 WPS 等价），**唯缺 12 条** |
| 2 | 327 NULL grid_id | ⚠️ 见 §6；非缺陷，是回填缺口；切后 own_grid 不可见（已接受） |
| 3 | 12 条 WPS/PG 差异 | ⚠️ **必须裁定**（§5） |
| 4 | WPS 是否继续作为外部采集 | ✅ 是（A+B+C，§10） |
| 5 | WPS/PG 是否需要未来同步 | ⚠️ 当前不需要；如恢复上行，须先补 `巡查人员ID` + 可靠 grid key |
| 6 | 切换瞬间是否存在新增数据写入 | ⚠️ 存在（用户在手工补录 WPS）。**窗口期内新增的 WPS 记录将不会出现在 PG** → 需约定冻结时间点 |
| 7 | 是否需要维护窗口 | ✅ **需要**（改 `.env` + 重启 5876，期间接口不可用） |
| 8 | 是否需要重启 5876 | ✅ **必须**（数据源模式进程内缓存一次） |
| 9 | Vite proxy 是否仍然正确 | ✅ 正确（`vite.config.ts` → `target: http://127.0.0.1:5876`，切换不影响） |
| 10 | 后端重启后 `ROLE_PERMISSIONS_MAP` 是否加载 `grid_inspector` | ✅ 会（`middleware/auth.js` L445 静态定义；临时实例中的 A/B 账号已实证生效） |
| 11 | PG 模式下是否仍保持 3B-1 / 3B-2 / 3B-3 权限链 | ✅ 保持（29/29 真机验证覆盖 DELETE 三层保护、scope、身份派生） |

---

## 12. 切换前 Checklist

> 逐项确认后打勾，全部为"必须"，A4/C 类可按人工判断豁免。

- [ ] **A1** 12 条 WPS 未映射记录已裁定（迁移 or 明确放弃并留档）——含 8 条真实三违（公司管理）
- [ ] **A2** 已书面确认"327 条 NULL grid_id 对 grid_inspector 不可见、仅 admin 可见"为接受口径
- [ ] **A3** 已安排维护窗口（改 `.env` + 重启 5876）
- [ ] **A4** 已确定 WPS 冻结时间点，确认窗口期无新增数据遗漏
- [ ] 已备份 PG（`grid_inspection_records` / `grid_record_sync_map` / `grid_areas`）
- [ ] 已确认 `.env` 仅改 `WPS_GRID_DATA_SOURCE=true → false`，**`WPS_GRID_SYNC` 保持 false**
- [ ] 已确认前端无待发布改动（本阶段确认无需前端改动）
- [ ] 已确认 Vite dev/prod 代理仍指向 5876
- [ ] 已备好 B 类验证清单与测试账号（admin + ≥2 个 grid_inspector）

---

## 13. 切换后 Checklist

- [ ] **B1** `GET /api/health` → `status: ok`；启动日志无 WPS 数据源告警
- [ ] **B1b** 确认 `getGridDataSourceMode()` 已返回 `pg`（接口消息由"查询成功(WPS)"变为"查询成功，共 N 条"）
- [ ] **B2** admin `GET /site-mgmt/grid-records` → `total = 2051`
- [ ] **B3** grid_inspector A/B GET → 各自仅见 `grid_id` 匹配记录，**不再看到 2063**
- [ ] **B4** A PUT B 记录 → 403 `SCOPE_DENIED`，且 B 记录数据未变
- [ ] **B5** A POST → 落库 `inspector_employee_id = A.employee_id`、`grid_id = A.grid_id`；客户端传 `gridId/inspectorEmployeeId` 被忽略
- [ ] **B6** grid_inspector DELETE → 403；DELETE ALL（带正确 confirmText）→ 403
- [ ] **B7** admin 不带 `confirmText` 清空 → 400 `PURGE_CONFIRM_REQUIRED`
- [ ] **B8** `GET /api/user/info` → `roles` 含 `grid_inspector`（角色权限映射已加载）
- [ ] **B9** 数据计数不变量：`grid_inspection_records=2051` / `grid_record_sync_map=2051` / `live grids=62`
- [ ] **B10** 前端台账页实测：列表、月份筛选、分组筛选、单元格编辑保存、新增弹窗、导出 CSV
- [ ] **B11** 三违台账 / 网格长巡查管理（如有其它复用 `grid_inspection_records` 的页面）回归
- [ ] **B12** 观察 30 分钟日志，确认无 `[gridDataSource] misconfigured`、无 WPS 调用异常
- [ ] **B13** 记录切换时间点与操作人，归档本报告与验证输出

---

## 14. 最终推荐

### 14.1 结论

**PG 已具备承载正式业务的技术能力，但建议先完成 1 项人工裁定（A1）+ 1 项口径确认（A2）后再切换。**

| 维度 | 评价 |
|---|---|
| PG 数据完整性 | ✅ 优秀（零悬挂/零异常/零重复） |
| PG ↔ WPS 业务等价性 | ✅ 字段级 0 不一致（2051 条全配对） |
| PG CRUD 完整性 | ✅ 六个 facade 端点齐备 |
| own_grid 安全 | ✅ 29/29 真机全绿，fail-closed 到位 |
| 前端兼容性 | ✅ 完全数据源无关，零改动 |
| 数据覆盖完整性 | ⚠️ **缺 12 条（8 条含真实三违）** |
| 身份链完整性 | ⚠️ `inspector_employee_id` 0% 填充（不阻塞 own_grid） |

### 14.2 推荐路线

1. **先裁定 12 条**（约 30 分钟人工工作量）：
   - 组 1（4 条疑似重复）：确认是否为重复登记。若确认重复 → 留档放弃；若为两次独立巡查 → 按 A_ONLY 口径补迁。
   - 组 2（8 条公司管理真实三违）：建议补迁（其日期为中文格式，需先确认归一口径；推定 grid_id = 1）。
2. **书面确认 327 条 NULL 可见性口径**（fail-closed，保持现状即可）。
3. **安排维护窗口执行切换**：仅改 `.env` 一处（`WPS_GRID_DATA_SOURCE=false`），重启 5876，按 §13 逐项验证。
4. **切换后**：WPS 定位为 A+B+C（外部采集 + 历史底账 + 只读保留），不参与任何权限判断；`inspector_employee_id` 回填与导入路径治理列为后续独立事项。

### 14.3 不建议的做法

- ❌ 为"数据看起来完整"而放开 NULL grid_id 可见性
- ❌ 按姓名/昵称自动匹配回填身份或网格
- ❌ 切换同时开启 `WPS_GRID_SYNC`（双写冲突）
- ❌ 在未裁定 12 条的情况下切换（会造成真实三违数据静默消失）

---

## 15. 数据计数前后对比

### 15.1 本阶段（审计前后）—— 零变化

| 指标 | 阶段开始 | 阶段结束 | 变化 |
|---|---|---|---|
| `grid_inspection_records` | 2051 | **2051** | **0** |
| `grid_record_sync_map` | 2051 | **2051** | **0** |
| `live grid_areas` | 62 | **62** | **0** |
| WPS 板记录 | 2063 | **2063** | **0** |
| `conflict=true` 行 | 0 | **0** | **0** |
| `users`(active) | 63 | **63** | **0** |
| — admin | 1 | **1** | 0 |
| — grid_inspector | 62 | **62** | 0 |
| — manager | 0 | **0** | 0 |
| `users.employee_id` 已绑定 | 62 | **62** | 0 |
| 唯一写操作（自建探针） | — | **创建 2 → 删除 2 = 净 0** | **0** |

### 15.2 若未来执行切换（预期，本次未执行）

| 指标 | 切换前（WPS 模式） | 切换后（PG 模式，预期） |
|---|---|---|
| 数据源消息 | `查询成功(WPS)` | `查询成功，共 2051 条` |
| grid_inspector GET total | **2063（越权可见全部）** | **仅自己网格（如 32）** |
| grid_inspector PUT 越权 | ⚠️ 可能成功 | ✅ 403 SCOPE_DENIED |
| admin GET total | 2063 | 2051 |
| grid_id=NULL 可见性 | （WPS 无 grid_id 概念） | own_grid 不可见 / all_grid 可见 |
| DELETE / DELETE ALL | 403（权限层） | 403（权限层，不变） |
| 新增身份派生 | WPS 路径（`巡查人员ID` 0% 填充） | ✅ 后端强制派生 |

### 15.3 差异台账（2063 − 2051 = 12）

| 分类 | 数量 | 内容 | 状态 |
|---|---|---|---|
| 疑似重复保护性排除 | 4 | 王铁民×2（津城街道）、谢俊章×2（大柳镇），均为"无三违行为" | 未入 PG，待人工裁定 |
| C 段非标日期格式 | 8 | 公司管理（刘金涛 6 / 黄殿兴 2），**均含真实三违** | 未入 PG，待人工裁定 |
| **合计** | **12** | — | **未迁移，本阶段未处理** |

---

## 16. 本阶段禁止事项执行证明

### 16.1 逐项自证

| 禁止项 | 执行情况 | 证据 |
|---|---|---|
| 修改 WPS 数据 / Schema / 字段 / 记录 | ✅ 未修改 | 全程仅调用 `wpsClient.listAllRecords`（`list_by_page` 只读）；未调用任何 create/update/delete/batch_delete/字段变更 API |
| 修改 PostgreSQL 数据（INSERT/UPDATE/DELETE） | ✅ 仅 2 次自建探针写入，即刻删除 | `_pgsource00_ownscope_test.cjs`：create 2 → delete 2；结束断言"探针零残留=0"、"计数 2051/2051/62 不变" 全 PASS |
| 修改 `users` | ✅ 未修改 | 仅 SELECT（角色分布、employee_id 绑定数） |
| 修改 `employee` | ✅ 未修改 | 仅 LEFT JOIN SELECT |
| 修改 `grid_areas` | ✅ 未修改 | 仅 SELECT（62 网格、personnel_id 校验、零记录网格） |
| 修改 `grid_inspection_records` | ✅ 未修改（除探针净 0） | 前后计数一致 2051 |
| 修改 `sync_map` | ✅ 未修改 | 前后计数一致 2051 |
| 修改 JWT / 登录 / auth | ✅ 未修改 | 仅用自签 token 做只读/探针测试，未改 `middleware/auth.js`（mtime 2026-09-10 19:19:33，早于本阶段 21:39） |
| 修改 `gridScope.js` | ✅ 未修改 | mtime 2026-09-10 19:19:23，早于本阶段 |
| 修改 WPS adapter / 生产业务逻辑 / 后端 routes | ✅ 未修改 | `site-mgmt.js` mtime 2026-09-10 19:21:30；`gridInspectionRepository.js` mtime 2026-09-08 20:29（均早于本阶段） |
| 修改前端业务逻辑 / 菜单 / 权限 / 角色 | ✅ 未修改 | `grid-ledger/index.vue` mtime 2026-09-08 20:14；`api/hse/site.ts` mtime 2026-09-08 20:17 |
| 移动/重命名现有菜单 | ✅ 未操作 | — |
| 切换 `WPS_GRID_DATA_SOURCE` | ✅ **未切换** | `.env` mtime 2026-09-10 17:38:21，早于本阶段；现仍为 `true` |
| 开启 `WPS_GRID_SYNC` | ✅ **未开启** | 现仍为 `false` |
| 修改 `.env` | ✅ **未修改** | mtime 2026-09-10 17:38:21（本阶段 21:39 开始） |
| 重启生产服务 | ✅ **未重启** | 生产 5876 uptime 连续（探测时 3233s，早于本阶段启动）；仅在 5881 起过临时实例并已 SIGTERM |
| 新增 npm 依赖 / 新增组件 / 改 Vben Core / 改 Naive 主题 | ✅ 未操作 | 仅用既有 `node_modules`（pg/jsonwebtoken/fetch 内建） |
| 开发 H5/mobile | ✅ 未涉及 | — |
| **执行 DELETE ALL** | ✅ **未执行** | 仅验证 ①权限层 403（grid_inspector）与 ③二次确认层 400（admin 无 confirmText），二者均在删除动作**之前**返回；生产探测严格只 GET |

### 16.2 本阶段新增文件（仅审计物，非业务代码）

| 类型 | 路径 | 说明 |
|---|---|---|
| 审计脚本 | `server/scripts/_pgsource00_schema.cjs` | 表结构只读侦察 |
| 审计脚本 | `server/scripts/_pgsource00_audit.cjs` | 审计 1/2/6 主脚本 |
| 审计脚本 | `server/scripts/_pgsource00_audit2.cjs` | 日期归一化 + 12 条溯源 + 姓名 probe |
| 审计脚本 | `server/scripts/_pgsource00_ownscope_test.cjs` | own_grid 真机 29/29 |
| 审计脚本 | `server/scripts/_pgsource00_prod_probe.cjs` | 生产 WPS 模式只读探测 |
| 审计输出 | `server/scripts/output/pgsource00-audit.json` | 审计 1/2/6 结构化结果 |
| 审计输出 | `server/scripts/output/pgsource00-audit2.json` | 补充审计结果 |
| 审计输出 | `server/scripts/output/pgsource00-ownscope-test.json` | 29/29 真机断言留档 |
| 本报告 | `docs/HSE网格巡查身份链_PG-SOURCE-SWITCH-00生产切换前审计与设计冻结报告_20260910.md` | 交付物 |

**未触碰任何生产业务逻辑、配置、WPS 数据或 PG 业务数据。**

### 16.3 关键文件 mtime 证据

```
server/.env                                             2026-09-10 17:38:21   ← 未改（含 WPS_GRID_DATA_SOURCE=true）
server/routes/site-mgmt.js                              2026-09-10 19:21:30   ← 未改
server/services/gridScope.js                            2026-09-10 19:19:23   ← 未改
server/middleware/auth.js                               2026-09-10 19:19:33   ← 未改
server/services/wps/gridInspectionRepository.js         2026-09-08 20:29:23   ← 未改
安全看板vben/.../views/site/grid-ledger/index.vue       2026-09-08 20:14:26   ← 未改
安全看板vben/.../src/api/hse/site.ts                    2026-09-08 20:17:00   ← 未改
（本阶段启动时间：2026-09-10 21:39）
```

> 说明：本项目 `server/` 与前端源码为 git untracked，故以 **mtime 比对**作为未修改证据。

---

## 附：最终状态

```
PHASE_PG_SOURCE_SWITCH_00_BLOCKED_READY_FOR_REMEDIATION
```

- **性质**：PG 侧技术审计**全部通过**；阻塞项为 1 项人工数据裁定（12 条）+ 1 项口径确认（327 NULL）+ 2 项操作前置（备份 / 维护窗口）。
- **禁止事项**：本阶段严格按要求终止，**未进入**任何后续动作（数据源切换 / WPS Schema 改造 / WPS row scope / 12 条迁移 / 327 条回填 / WPS-PG 双写 / 前端按钮权限 / org_grid / H5 / 其他新功能）。
- **下一步**：等待人工确认。

---

*报告生成时间：2026-09-10 21:5x（GMT+8）｜阶段：PG-SOURCE-SWITCH-00｜性质：READ ONLY AUDIT + DESIGN FREEZE*

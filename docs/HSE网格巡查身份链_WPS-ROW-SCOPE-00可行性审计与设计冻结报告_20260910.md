# HSE 网格巡查身份链 · WPS-ROW-SCOPE-00 可行性审计与设计冻结报告

> 阶段性质：**只读审计 + 设计冻结（AUDIT ONLY / DESIGN FREEZE）**
> 审计日期：2026-09-10
> 审计范围：WPS 生产数据源下 `grid_inspector` 的 `own_grid` 行级权限可行性
> 数据来源：真实 WPS API（`GET /v7/coop/dbsheet/{fid}/records/list_by_page`，只读）、真实 PostgreSQL（`grid_areas`，只读）、生产路由代码（只读）
> 禁止事项：未修改任何 WPS 数据 / Schema / 字段；未修改 `WPS_GRID_DATA_SOURCE` / `WPS_GRID_SYNC`；未修改 `users`/`employee`/`grid_areas`/`grid_inspection_records`/`sync_map`；未修改 `gridScope.js` / 前端菜单 / 任何生产逻辑；未切换数据源；**全程零写**。

---

## 1. 执行摘要

本阶段回答一个核心问题：**在当前 WPS 生产数据源下，能否建立「WPS 网格巡查记录 → grid_areas.id」的可靠、唯一、可审计映射，从而在不依赖姓名永久身份键的情况下实现 `grid_inspector` 的 `own_grid`？**

结论（基于 2063 条真实 WPS 记录 + 62 个真实 live grid 的实测）：

- **不能。** WPS 记录当前**没有任何可靠的网格标识键**。
  - `巡查人员ID`（employeeId，与 PG 同身份链）在 **2063 条记录中填充率为 0%**；
  - `分组名称` 是**乡镇级文本**（杜集镇/柴胡店镇/…/公司管理 共 13 值），与 `grid_areas.id`（62 个以责任人姓名命名的网格）**粒度完全不同**，且 13 个值**无一能精确匹配** `grid_areas.name`，与 `grid_areas.township`（100% NULL）无法关联，与 `grid_areas.area` 仅有脆弱的子类字符串重叠（多对多，非 FK）；
  - WPS Schema 中**不存在** `grid_id` / `grid_code` / `网格负责人ID` / `组织ID` 字段。
- 因此 **`NO_RELIABLE_GRID_KEY`**：在现有 WPS 架构下，无法在不依赖姓名的情况下实现安全后端行级隔离。
- **安全边界现状（重要）**：当前生产 `WPS_GRID_DATA_SOURCE=true`，`grid_inspector` 通过 GET 能看见**全部 2063 条跨乡镇记录**，通过 PUT 可修改**任意** WPS 记录（WPS 分支在 scope 逻辑之前 early-return）。前端菜单隐藏**不是**数据安全边界。真正的后端数据源层行级边界仅存在于 PG 模式。

**最终状态：`PHASE_WPS_ROW_SCOPE_00_BLOCKED_BY_MISSING_GRID_KEY_READY_FOR_SCHEMA_DESIGN`**

（根因 = WPS 缺可靠网格键；可通过「WPS Schema 增加稳定标识」（路线 A）或「生产数据源切 PG」（路线 B）解决；路线须由人工确认，本阶段不实施。）

---

## 2. 当前生产数据源

| 项 | 值 | 来源 |
|---|---|---|
| 数据源开关 | `WPS_GRID_DATA_SOURCE=true` | server/.env |
| 同步开关 | `WPS_GRID_SYNC=false` | server/.env（历史下行，禁止调度器并发写板） |
| GET 实际走向 | WPS（`routes/site-mgmt.js:1465` 判 `dsList==='wps'` 后 early-return） | 代码审计 |
| WPS 文件/表 | `file_id=cn229thwalDs`，数据 `sheet_id=3` | wpsClient.js CONF + 历史 Sprint 记录 |
| 真实进程验证（阶段3-B-3） | `grid_inspector` GET 返回 `200 查询成功(WPS)`，无 scope 过滤 | 真机 HTTP 验收 |

---

## 3. WPS Schema 审计

只读调用 `GET /v7/coop/dbsheet/{fid}/schema` + 记录推断，结合 `services/wps/wpsFieldMap.js` 归一化的业务字段：

| WPS 字段（真实列名） | biz | 是否含网格标识 | 说明 |
|---|---|---|---|
| 编号 | record_no | 否 | 业务编号（如 L2572），非网格键 |
| 巡查编号 | inspectionId | 否 | 预留，当前板无列 |
| **巡查人员ID** | inspectorEmployeeId | **是（理论上）** | **employeeId，与 PG 同身份链；但实测 2063 条填充率 0%** |
| 姓名 | inspector_name | 否 | 快照，禁作身份键（§8） |
| **分组名称** | operation_unit / area_team | 部分（乡镇文本） | 乡镇级文本，非网格键 |
| 所属岗位 | position | 否 | 岗位文本 |
| 网格等级 | grid_level | 否 | 一级/二级/总网格长（文本） |
| 昵称2 | nickname | 否 | 历史昵称，禁作身份键 |
| 三违行为 / 违章人姓名 / 性别 / 年龄 | violation_* | 否 | 业务快照 |
| 上报状态 / 车辆类型 / 违章类型结果 / 是否需要整改 / 整改人 | report*/vehicle*/rectifier | 否 | 业务字段 |
| 三违照片链接 / 整改后照片链接 / 示意图链接 | *_photos / schematic | 否 | 附件链接镜像 |

**结论**：WPS 现有字段中，**唯一可能承载网格标识的「巡查人员ID」实际为空**；`分组名称` 为乡镇文本；**无任何 `grid_id`/`grid_code`/`网格负责人ID`/`组织ID` 字段**。Schema 层面即缺可靠网格键。

---

## 4. WPS 2063 条数据分析（只读实测）

| 指标 | 值 |
|---|---|
| WPS 总记录数 | **2063**（与基线一致，未变化） |
| 非空 `分组名称` | 2063（100%） |
| 非空 `巡查人员ID` | **0（0%）** |
| 零键记录（既无分组名称又无巡查人员ID） | 0 |
| 不同 `分组名称` 值 | **13**（12 乡镇 + 公司管理） |
| 各 `分组名称` 记录分布 | 杜集镇329 / 柴胡店镇245 / 保店镇182 / 时集镇182 / 长官镇179 / 张大庄镇146 / 刘营伍乡146 / 大曹镇144 / 大柳镇141 / 相衙镇141 / 津城街道111 / 宁城街道72 / 公司管理45 |

**关键发现**：
- 13 个 `分组名称` 全部是**乡镇/街道/公司级**聚合文本，每个对应**多个**网格责任人（一个乡镇包含多名网格长），因此即便建立「分组名称→网格集」映射，也是 **township 级可见性（org_grid）而非 own_grid**，会向责任人泄露本乡镇内其他所有网格数据。
- `巡查人员ID` 0% 填充 → 无法走「employeeId → grid_areas.personnel_id → grid_id」这条在 PG 已验证可靠的链。

---

## 5. grid_areas 62 个网格审计（只读 PG）

| 指标 | 值 | 结论 |
|---|---|---|
| live grid 数 | 62 | 与冻结事实一致 |
| `grid_areas.name` 性质 | **62 个均为责任人姓名**（黄殿兴/黄元同/…/李忠胜） | 网格名 = 人，非乡镇 |
| `personnel_id` 非空 | 62/62 | 1:1 绑定 |
| employee 有效 | 62/62 | 责任人 employee.id 均存在 |
| 1 employee 仅对应 1 live grid | 是 | 无多重归属 |
| `township` 填充 | **0/62（100% NULL）** | 乡镇字段不可用 |
| `area` 填充 | 61/62 | 子类文本（如「杜集镇九班」「大曹镇二班」），非乡镇根 |

**结论**：`grid_areas` 以「责任人姓名」命名网格，`township` 全空、`area` 为班组子类文本。WPS 的 `分组名称`（乡镇根）与 `grid_areas` 无任何精确 FK 关系：
- 对 `grid_areas.name`：13 个 WPS 分组名称 **0 命中**；
- 对 `grid_areas.township`：**0 命中**（全 NULL）；
- 对 `grid_areas.area`：**8 个** WPS 乡镇名出现在 area 子类串中（如「杜集镇」⊂「杜集镇九班」），但为多对多、需字符串模糊匹配，**非可靠键**。

---

## 6. WPS → grid 映射分析

```
WPS 记录
  ├─ 分组名称(乡镇)  ──×──▶  grid_areas（无精确匹配；粒度=乡镇≫网格；1 乡镇含多网格）
  ├─ 巡查人员ID(employeeId) ──×──▶  2063 条全部为空，无法链接
  ├─ 姓名              ──×──▶  禁作永久身份键（§8，且赵书坤/郭秀梅多重身份）
  └─ (无 grid_id/grid_code/网格负责人ID/组织ID 字段)
```

**无任何一条路径能产生「记录 → 唯一 grid_areas.id」的可靠映射。**

---

## 7. 姓名身份键风险（仅风险分析，不作为方案）

- 历史已确认多重身份：**赵书坤 → employee 7085（杜集·管理员）**、**郭秀梅 → employee 7947（时集·管理员）** 等多身份裁定档案（`output/wps03b-batch3-adjudication-dossier.json`）。
- 若方案依赖「WPS 姓名 → employee.name」，则赵书坤/郭秀梅等重名必须人工裁定，且一旦误判即错绑网格 → **判定 BLOCKED**。
- 阶段2/3 已冻结「姓名/昵称/手机/username 不作为身份纽带」。`分组名称` 虽非姓名，但其粒度（乡镇）与可靠性（无 FK）同样不满足唯一性要求。
- **结论**：禁止以姓名为正式 scope key；即便 `分组名称` 也因粒度与无 FK 不可作 own_grid 键。

---

## 8. 唯一性分析

| 候选键 | 唯一性 | 证据 |
|---|---|---|
| 分组名称 → grid_areas.id | **不满足（1→多）** | 1 乡镇含多名网格责任人；13 值 0 精确匹配 grid 名 |
| 巡查人员ID → grid_areas.id | 键存在但**值为空（0/2063）** | 实测填充率 0%，无法构成映射 |
| 姓名 → employee.id | 不满足（多对多） | 赵书坤/郭秀梅等多重身份 |
| grid_id（WPS 无此字段） | N/A | Schema 缺失 |

**唯一性结论：当前 WPS 数据不存在任何「1 记录 → 1 网格」的唯一键。**

---

## 9. 完整性分析

| 候选键 | 覆盖率 | 说明 |
|---|---|---|
| 分组名称 | 100%（2063/2063）但粒度错 | 全覆盖却无法定位到单网格 |
| 巡查人员ID | **0%**（0/2063） | 历史/手动记录均未填，覆盖为 0 |
| 姓名 | 100% 但禁用作键 | — |

**完整性结论：唯一「全覆盖」的字段（分组名称）粒度过粗；唯一「粒度正确」的字段（巡查人员ID）覆盖为 0。无兼顾唯一性与完整性的键。**

---

## 10. 历史稳定性分析

- `分组名称`：用户在 WPS 手动录入，历史上存在「乡镇名写法不一致 / 班组与乡镇混用」风险（如「刘营伍」vs「刘营伍乡」），稳定性差，且随行政区划调整会变。
- `巡查人员ID`：若未来 PC 新建走后端身份上下文写入（见 `gridInspectionRepository.create`），**新记录可稳定填充**；但 **2063 条历史记录已定格为空**，且无法无损回填（缺 employeeId、禁姓名）。
- **结论**：历史数据不可变、不可靠回填；任何方案若依赖历史 `巡查人员ID` 或 `分组名称` 精确性，都将因历史稳定性不足而失败。

---

## 11. WPS API 能力分析

| 能力 | WPS V7 现状 | 对 scope 的影响 |
|---|---|---|
| 服务端记录过滤 | `list_by_page` 仅支持 `page_num/page_size/prefer_id/show_record_extra_info`，**无 filter 参数** | 无法在服务端按网格过滤 |
| 全量读取 | `listAllRecords` 分页拉全（100/页） | 只能在客户端（Node）加载全量后过滤 |
| 单条读取 | `get(id)` = 全量定位，无 row scope | 任何有 view 权限者凭 ID 可取任意记录 |
| 写入 | create/update/delete/batch_delete | 仅按 record id，无 row scope |

**结论**：WPS API 不支持服务端行级过滤，scope 只能在 Node 侧实现；而 Node 侧实现的前提是「每条记录有可计算的网格键」——该键当前不存在（见 §3/§4）。

---

## 12. WPS 分页安全分析（重点）

当前 `gridInspectionRepository.list()` 实现：

```
_allRecords()  →  wpsClient.listAllRecords()  // 分页拉全 2063 条进内存
  → .map(wpsRecordToDto)
  → list.filter(...)                          // 业务筛选（keyword/areaTeam/...）
  → list.sort(...)
  → list.slice(offset, offset+size)          // 前端 page/pageSize 仅切内存切片
```

- **分页参数不绕过 scope 的根本原因**：scope 根本没有注入此链路。`page`/`pageSize` 只决定返回哪一页切片，**全量数据始终先载入内存**，切片上的记录就是「该页应见记录」——而当前没有任何 scope 条件，故每页都是全量数据的子集，**grid_inspector 翻完所有页即见全部 2063 条跨乡镇记录**。
- **若未来在 Node 侧加 scope 过滤**：因全量已载入、过滤在函数内统一作用，列表路径切片是安全的；但**必须同时覆盖 `get(id)`**（单条按 ID 直取，当前无 scope）与写入路径，否则存在 ID 直取/越权改的旁路。
- **更严重的前提缺陷**：即便加 Node 过滤，也**没有每条记录的网格键可供过滤**（§3/§4），scope 计算本身不可行。

**结论**：分页机制本身不构成 scope 绕过（它只是无 scope 的切片），但「全量载入 + 无键可滤」使 WPS 在数据源层**不存在**行级安全边界。前端分页/过滤不是安全边界。

---

## 13. WPS CRUD Scope 可行性

代码审计（`routes/site-mgmt.js` 各 handler 在 `dsList==='wps'` 时 early-return，scope 逻辑在其后，故 WPS 分支**全部未接 scope**）：

| 接口 | WPS 分支 | 权限门 | 行级 scope | 当前 WPS 模式结论 |
|---|---|---|---|---|
| GET list | `gridWps.list` (1466) | `hse:site:grid:view` | **无** | `grid_inspector` 见全部 2063（跨乡镇泄露） |
| GET filter-options | `gridWps.filterOptions` (1571) | view | 无 | 下拉含全部乡镇 |
| PUT | `gridWps.update` (1601) | `hse:site:grid:update` | **无** | `grid_inspector` 可改**任意** WPS 记录（越权改） |
| POST | `gridWps.create` (1667) | `hse:site:grid:create` | 无（身份后端派生，但 DTO gridId=null 不可见归属） | 新建记录无归属键，无法纳入 own_grid |
| DELETE | `gridWps.remove` (1754) | `hse:site:grid:delete` | 无 | `grid_inspector` 无 delete 权限 → **被权限拦**（安全） |
| DELETE ALL | `gridWps.clearAll` (1821) | `hse:site:grid:purge` | 无 | `grid_inspector` 无 purge 权限 → **被权限拦**（安全，三层保护保持） |

**WPS own_grid 若未来实施，须**：GET/PUT 增加数据源层 row scope（依赖每条记录的网格键，当前缺）；DELETE/DELETE-ALL 保持权限拦截（已安全）。**当前 WPS 模式下 GET/PUT 的行级隔离不可实现。**

---

## 14. 候选方案（≤3）

### 方案 1：分组名称（乡镇）→ grid_areas 映射
| 项目 | 内容 |
|---|---|
| 映射来源字段 | WPS `分组名称`（乡镇文本） |
| 目标字段 | grid_areas（township / area / name） |
| 唯一性 | **否**（1 乡镇 → 多网格） |
| 完整性 | 100% 但粒度错 |
| 历史稳定性 | 差（写法不一/区划变动） |
| 是否依赖姓名 | 否 |
| 是否需 WPS 改造 | 否（但要新建「乡镇→网格集」映射表） |
| 是否需 PG 新字段 | 否（需 township 回填才有干净 FK） |
| 是否可用于权限 | **仅能支撑 org_grid（乡镇级），不能支撑 own_grid** |
| 风险等级 | **BLOCKED**（粒度错→跨网格泄露；且无干净 FK） |

### 方案 2：巡查人员ID（employeeId）→ employee → grid_areas
| 项目 | 内容 |
|---|---|
| 映射来源字段 | WPS `巡查人员ID`（employeeId） |
| 目标字段 | grid_areas.personnel_id（经 employee.id） |
| 唯一性 | 理论是（与 PG 同链） |
| 完整性 | **0%**（2063 条全空；历史不可无损回填） |
| 历史稳定性 | 未来新记录稳定；历史已定格空 |
| 是否依赖姓名 | 否 |
| 是否需 WPS 改造 | 否（字段已存在） |
| 是否需 PG 新字段 | 否 |
| 是否可用于权限 | 仅对**未来新记录**可行；历史 2063 不可 scope |
| 风险等级 | **BLOCKED（历史）/ MEDIUM（仅未来）** |

### 方案 3：WPS Schema 新增稳定网格标识 + 回填（路线 A 实质）
| 项目 | 内容 |
|---|---|
| 映射来源字段 | 新增 `grid_id` 或 `grid_code` 或 `网格负责人employeeId` 列 |
| 目标字段 | grid_areas.id / personnel_id |
| 唯一性 | 可保证（显式键） |
| 完整性 | 未来记录 100%；**历史 2063 需回填，且回填本身不可靠** |
| 历史稳定性 | 新增键稳定 |
| 是否依赖姓名 | 回填历史时**被迫依赖姓名**（BLOCKED）或人工裁定（高成本） |
| 是否需 WPS 改造 | **是**（加列 + 写逻辑） |
| 是否需 PG 新字段 | 否 |
| 是否可用于权限 | 未来可行；历史须先解决回填 |
| 风险等级 | **MEDIUM（未来）/ HIGH（历史回填）** |

---

## 15. 推荐方案

**核心判定：`NO_RELIABLE_GRID_KEY` → 当前 WPS 架构无法实现安全 own_grid。**

- **不推荐方案 1**：粒度错、必泄露跨网格，违反 fail-closed。
- **方案 2 仅覆盖未来记录**，历史 2063 永远不可 scope（除非接受 township 级可见性）。
- **方案 3（路线 A）** 能根治未来记录，但 **2063 历史记录回填不可行**（无 employeeId、禁姓名、人工裁定成本极高且易错）。
- **路线 B（生产数据源切 PG）**：PG 模式下 `own_grid` 已真机验证（阶段3-B-2/3-B-3：A 仅见 grid48、B 仅见 grid56、互不相交、A 改 B→403）。PG 中 327+1724 历史记录 `grid_id=NULL`，在 `own_grid` 下**fail-closed 对 grid_inspector 不可见**（仅 admin 等 all_grid 可见），即「不泄露、但历史不归属」的保守安全态。

**推荐下一步由人工在两条路线中选一**（本阶段不实施）：
- **路线 A**：WPS 增加 `网格负责人employeeId`/`grid_id` 列，未来新记录由后端身份上下文写入；历史 2063 要么接受 township 级可见性、要么人工逐条裁定（不建议自动姓名回填）。
- **路线 B（较低风险）**：将生产数据源从 WPS 切回 PG；WPS 保留为外部采集源（只读镜像/双写可选），PG 作为正式业务源，直接复用已验证的 `own_grid`。历史 NULL 记录在 PG 下 fail-closed 隐藏，安全且不泄露。

---

## 16. 风险

| 风险 | 等级 | 说明 |
|---|---|---|
| grid_inspector 在 WPS 模式可见全部跨乡镇记录 | **HIGH（现状暴露）** | GET 无 scope；前端菜单隐藏非安全边界 |
| grid_inspector 在 WPS 模式可改任意记录 | **HIGH（现状暴露）** | PUT 无 scope；有 update 权限即可改任意 WPS 记录 |
| 若用姓名/分组名称模糊匹配回填 | HIGH | 赵书坤/郭秀梅等多重身份 → 错绑网格 |
| 路线 A 历史回填 | HIGH | 2063 条无 employeeId，无损回填不可行 |
| 切 PG 双写一致性 | MEDIUM | 需保证 WPS↔PG 不漂移（WPS_GRID_SYNC=false 现状下更可控） |

---

## 17. 禁止事项（本阶段已遵守）

未做：修改 WPS 数据/Schema/字段；修改 `WPS_GRID_DATA_SOURCE`/`WPS_GRID_SYNC`；修改 `users`/`employee`/`grid_areas`/`grid_inspection_records`/`sync_map`；修改 `gridScope.js`/前端菜单/生产逻辑；切换数据源；任何 INSERT/UPDATE/DELETE（含 WPS 与 PG）。全程只读。

---

## 18. 下一阶段建议

1. **人工决策路线**：在路线 A（WPS 加网格标识，历史接受 township 级或人工裁定）与路线 B（切 PG 为正式源，复用已验证 own_grid）中二选一。**本阶段不替用户选择。**
2. 若选路线 B：先确认 WPS 是否继续作为外部采集源、是否双写；再切换 `WPS_GRID_DATA_SOURCE=false` 并重启；历史 NULL 记录在 PG 下 fail-closed 安全。
3. 若选路线 A：须先设计「网格标识列 + 未来写入」与「历史 2063 处理策略（禁自动姓名回填）」，经专项审计后再实施。
4. **临时缓解（若维持 WPS 生产且不立即切 PG）**：因 GET/PUT 在 WPS 模式无行级边界，建议优先推进路线 B；在切换前，`grid_inspector` 的 WPS 跨网格可见/可改属已知暴露，须由后续阶段消除，不得以前端隐藏代替。

---

## 19. 数据计数前后对比（审计前后不变）

| 计数项 | 审计前 | 审计后 | 变化 |
|---|---|---|---|
| users（活跃） | 63 | 63 | 0 |
| grid_inspector | 62 | 62 | 0 |
| admin | 1 | 1 | 0 |
| manager | 0 | 0 | 0 |
| live grids | 62 | 62 | 0 |
| distinct personnel_id | 62 | 62 | 0 |
| grid_inspection_records (PG) | 2051 | 2051 | 0 |
| WPS 记录 | 2063 | 2063 | 0 |
| WPS `grid_record_sync_map` | 2051 | 2051 | 0 |
| WPS 非空 分组名称 | 2063 | 2063 | 0 |
| WPS 非空 巡查人员ID | 0 | 0 | 0 |

> 审计为只读，WPS/PG/sync_map/users 全部保持不变。

---

## 20. 最终结论

- **WPS 当前无法做到真正的后端行级隔离。** 根因为「WPS 记录缺可靠网格标识键」：`巡查人员ID` 填充率 0%、`分组名称` 为乡镇文本无 FK、无 `grid_id` 等字段。
- **安全边界现状**：生产 WPS 模式下，`grid_inspector` 经 GET 可见全部 2063 跨乡镇记录、经 PUT 可改任意记录（WPS 分支未接 scope）；DELETE/DELETE-ALL 因无 delete/purge 权限被拦（安全）。前端菜单隐藏**不是**数据安全边界。
- **PG 模式已具备安全 own_grid**（阶段3-B-2/3-B-3 真机验证，fail-closed），但 327+1724 历史记录 `grid_id=NULL` 在 own_grid 下对 grid_inspector 不可见（保守安全）。
- **最终状态**：`PHASE_WPS_ROW_SCOPE_00_BLOCKED_BY_MISSING_GRID_KEY_READY_FOR_SCHEMA_DESIGN`。
- **路线须人工确认**：路线 A（WPS 加网格标识，历史处理须禁自动姓名回填）或路线 B（生产切 PG，复用已验证 own_grid）。本阶段仅产出事实/数据/风险/候选方案/推荐，未实施任何改动。

---

> 本阶段为只读审计 + 设计冻结，完成后立即停止，未进入 WPS own_grid 实现 / 前端按钮权限 / org_grid / 历史回填 / WPS Schema 修改 / PG-WPS 切换等任何开发。

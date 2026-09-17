# CF-WPS-05：employee_code / employee.id 双键兼容与 WPS→PG 巡查归因链审计报告

> 阶段性质：**只读审计 + 衔接设计**（不开发短信登录、不开发完整 H5、不部署 Worker、不写生产 DB、不改 HSE 生产业务代码）。
> 前置阶段：CF-WPS-04（手机号身份模型审计，状态 PASS，遗留决策项 D2/D3 由本阶段解决）。
> 本报告结论：**双键模型可在不破坏现有 HSE/PG 数据模型的前提下正确衔接**；唯一需要的生产变更是**新增一个非受保护的业务快照列 `employee_code` + 一个独立的 `employee_code→employee.id` 解析器**（均属可向后兼容的扩展，不在本阶段执行，留待授权后的实现阶段）。

---

## 一、阶段目标

在 CF-WPS-04 已确定的「手机号 + 花名册员工编码（employee_code）」移动端身份模型基础上，回答唯一核心问题：

> 新移动端身份使用 `employee_code`（花名册员工编码），如何与现有 PostgreSQL / WPS→PG 巡查业务中的 `employee.id` 正确衔接，且保持 HSE/PG 数据模型兼容？

目标链路（§四 明文要求）：

```
手机身份
  → employee_code（花名册员工编码）
  → WPS 网格长巡查记录（携带 employee_code）
  → WPS→PG 同步（把 employee_code 作为业务快照列落库）
  → employee_code → public.employee.employee_code → public.employee.id
  → grid_inspection_records.inspector_employee_id = public.employee.id
  → 现有网格长巡查台账
```

**铁律（§四）**：`employee_code` 是文本业务主键（花名册编码），`inspector_employee_id` 是 `employee.id`（BIGINT 代理键）。**绝不允许把 `employee_code` 直接写入 `inspector_employee_id`**。`employee_code` 必须经过一次「查表解析」得到 `employee.id` 后再落库。

---

## 二、当前身份架构现状（双键模型）

| 键 | 含义 | 来源 | 类型 | 当前在 grid_inspection_records 中 |
|----|------|------|------|----------------------------------|
| `employee_code` | 花名册员工编码（业务身份主键） | 花名册 `员工编码` 列 | `VARCHAR(50)` | **不存在（缺口）** |
| `employee.id` | PostgreSQL 人员代理主键 | `public.employee` BIGSERIAL | `BIGINT` | 存在，列名 `inspector_employee_id`，由人工/旧桥接写入 |

证据链（实证，非推测）：
- 花名册 `员工信息维护_20260910140825(1).xlsx`：列 B = `员工编码`，3,249 行非空 → 即 `employee_code` 的权威来源。
- `server/sql/hse_employee_master_v59_migration.sql:114`：`employee_code VARCHAR(50)`；`:136` `CREATE UNIQUE INDEX uk_employee_code ON employee(employee_code) WHERE employee_code IS NOT NULL AND is_deleted = false` → **`employee_code` 在在职员工中保证唯一**。
- 既有双写模式已存在于 `hse_grid_inspection_records`（`init-dashboard-tables.js:74-75`：`employee_id BIGINT NOT NULL` + `employee_code VARCHAR(64)`），证明「代理键 + 编码冗余列」是本项目的既定范式。

---

## 三、现有 WPS→PG 巡查归因链审计结果（关键发现）

经逐文件审计，当前链路如下（只读，未改动）：

### 3.1 Pull Engine（`server/services/wpsGridPullEngine.js`）
- **冻结铁律 #3**：`inspector_employee_id` / `grid_id` 为 **PG 权威字段，同步引擎永不写入、永不覆盖**（fail-closed，新记录恒为 NULL）。
- `PROTECTED_COLUMNS = ['grid_id', 'inspector_employee_id']`（`wps/wpsFieldMap.js:127`）：DTO 构造后强制 `delete dto[col]`，任何试图写入这两条列都会抛 `PROTECTED_COLUMN_WRITE_FORBIDDEN`。
- `SYNC_PROJECTION`（唯一真源 `wps/wpsFieldMap.js`）**不含任何 `employee_code` 字段**，也不含 `巡查人员ID`（该字段在 `FIELD_MAP` 中定义为 `pg:'-'`，且未进入 `SYNC_PROJECTION_ORDER`）。

> 结论：当前 WPS→PG 同步**完全不携带、也不归因**任何人员身份键。所有新记录的 `inspector_employee_id` 恒为 NULL，进入「待归属」池。

### 3.2 人工归属（`server/services/gridAttributionService.js`）
- 管理员 `POST /api/grid-attribution/attribute` 提交 `record_id + candidate_employee_id`。
- `candidate_employee_id` 此处语义是 **`employee.id`（BIGINT）**，服务端校验 `employee` 存在且未删除 → `deriveGridIdForEmployee(eid)` 派生唯一 live grid → 条件 UPDATE 写入 `inspector_employee_id` / `grid_id`。
- 这是当前唯一可靠的 `employee.id` 写入路径，且带行级守卫（`WHERE ... IS NULL`），不覆盖既有值。

### 3.3 自动富化（旧 WPS 路线，已实质失效）（`server/services/wps/gridEnrichmentService.js`）
- 尝试 `wps_account_employee_map`（WPS Creator Account → employee.id）桥接。
- 该表 `server/sql/20260912_arch03_p2b0_bridge.sql` 当前 **0 行**，且 CF-WPS-04 已裁定 **WPS OAuth 路线归档**（`ARCHIVED_FOR_CURRENT_MOBILE_IDENTITY`）。
- 因此该自动富化路径对「手机号身份」**完全不可用**，必须被新的 `employee_code` 解析路径取代。

### 3.4 关键缺口总结
| # | 缺口 | 影响 |
|---|------|------|
| G1 | `grid_inspection_records` 无 `employee_code` 列 | WPS 移动端写入的编码无处落库 |
| G2 | `SYNC_PROJECTION` 无 `employee_code` 映射 | 同步引擎不会把编码带进 PG |
| G3 | 无 `employee_code→employee.id` 解析器 | 即使 G1/G2 补上，也无法得到 `inspector_employee_id` |

---

## 四、目标链路设计（正确衔接，满足 §四）

```
[手机 H5] 登录后持 employee_code
   │  POST 巡查（携带 employee_code，作为业务字段，非敏感）
   ▼
[Cloudflare Worker] 代理写入 WPS 网格长巡查记录
   │  WPS 列：员工编码 = <employee_code>
   ▼
[WPS 多维表] 巡查记录（含 员工编码 列）
   │
   ▼  ── 单向 Pull（WPS→PG，唯一写入口）──
[Pull Engine] toCanonicalDto → 仅写非受保护业务列
   │  ★ 新增：employee_code 作为普通业务快照列写入 grid_inspection_records.employee_code
   │  ★ 绝不写 inspector_employee_id（受 PROTECTED_COLUMNS 守卫）
   ▼
[grid_inspection_records] 新行：employee_code=<编码>, inspector_employee_id=NULL
   │
   ▼  ── 独立解析层（非 Pull Engine 内部）──
[新 resolver: resolveByEmployeeCode]
   │  1) 若 inspector_employee_id 已非 NULL → 跳过（永不覆盖）
   │  2) 若 employee_code 为空 → pending（不猜）
   │  3) SELECT id FROM employee WHERE employee_code=$1 AND is_deleted=false LIMIT 2
   │       返回 1 行 → 得 employee.id
   │       返回 0 行 / >1 行 → pending（fail-safe，绝不任选其一）
   │  4) deriveGridIdForEmployee(employee.id) → 精确 1 个 live grid 才写
   │  5) 仅当 inspector_employee_id IS NULL AND grid_id IS NULL 时
   │     UPDATE inspector_employee_id=<employee.id>, grid_id=<gid>
   ▼
[grid_inspection_records] inspector_employee_id = employee.id（BIGINT，正确）
   ▼
[现有台账] 巡查完成率/网格归属/考核全部沿用既有 employee.id 外键，零改造
```

**§四 铁律落实**：`employee_code` 仅作为**文本快照列**存在（如同 `personnel_name`），`inspector_employee_id` 永远只接受 `employee.id` 整数，二者物理分离，解析层是唯一的「编码→代理键」转换器。

---

## 五、禁止项重申（来自 §四，本项目最高频错误）

> ❌ 错误写法（绝对禁止）：
> ```sql
> UPDATE grid_inspection_records SET inspector_employee_id = employee_code WHERE ...;
> ```
> `inspector_employee_id` 是 `employee.id`（BIGINT 外键 → `employee.id`），把 VARCHAR 编码直接塞进去既类型不符、又破坏所有下游外键关联。

> ✅ 正确写法（唯一）：`employee_code` 进 `employee_code` 列；`employee.id` 经查表得到后，单独写入 `inspector_employee_id`。

---

## 六、具体改造设计（供下一阶段实现，本阶段不执行）

### 6.1 WPS 多维表新增列
- 建议 WPS 列名：**`员工编码`**（与花名册列名对齐，降低映射歧义）。
- 由移动端（经 Worker）在写巡查记录时填充，等于登录态 Session 中的 `employee_code`。

### 6.2 `wps/wpsFieldMap.js` 新增映射
```js
// 在 FIELD_MAP 末尾（PG 业务列段）追加：
{ wps: '员工编码', biz: 'employeeCode', pg: 'employee_code', type: 'text', mode: 'readwrite',
  note: '花名册员工编码（业务身份主键）。仅作业务快照落 grid_inspection_records.employee_code；绝不写入 inspector_employee_id' },
```

### 6.3 `SYNC_PROJECTION_ORDER` 追加（非 hash 业务列）
```js
// 追加到 SYNC_PROJECTION_ORDER 末尾（非 hash 段，不影响冻结的 18 列 sync_hash 口径）
'employee_code',
```
- **兼容性论证**：`SYNC_HASH_COLUMN_COUNT=18` 与冻结 hash 口径不变（仅顺序/集合前 18 列参与哈希）；`employee_code` 归入与 `report_status/vehicle_type/...` 等同类的「非 hash 业务列」，存量 2061 条 `sync_hash` 不会因此漂移。

### 6.4 `grid_inspection_records` 新增列（建议 DDL，本阶段不执行）
```sql
-- 向后兼容扩展（同 hse_grid_inspection_records 既有的双键范式）
ALTER TABLE grid_inspection_records
  ADD COLUMN IF NOT EXISTS employee_code VARCHAR(64);
COMMENT ON COLUMN grid_inspection_records.employee_code
  IS '花名册员工编码快照（移动端身份业务主键）；经 resolveByEmployeeCode 解析为 inspector_employee_id(employee.id)，永不直写';
CREATE INDEX IF NOT EXISTS idx_gir_employee_code
  ON grid_inspection_records(employee_code) WHERE employee_code IS NOT NULL;
```

### 6.5 新解析器（建议落点：`gridEnrichmentService` 扩展或新文件）
```js
// 仅当 inspector_employee_id 当前为 NULL 时解析；employee_code → employee.id → grid
async function resolveByEmployeeCode(record, { db }) {
  if (record.inspector_employee_id != null) return { status: 'already_attributed' };
  const code = (record.employee_code || '').trim();
  if (!code) return { status: 'pending', reason: 'no_employee_code' };
  const r = await db.query(
    'SELECT id FROM public.employee WHERE employee_code=$1 AND is_deleted=false LIMIT 2',
    [code]
  );
  if (!r.rows || r.rows.length !== 1) {
    // 0 行（编码不存在/员工停用）或 >1 行（数据异常）→ 不归属、不猜
    return { status: 'pending', reason: r.rows && r.rows.length > 1 ? 'multiple_match' : 'no_match' };
  }
  const empId = r.rows[0].id;
  const g = await gridScope.deriveGridIdForEmployee(empId, { client: db });
  if (g.status !== 'ok') return { status: 'pending', reason: 'grid_' + g.status }; // no_grid/multiple
  return { status: 'attributed', employee_id: empId, gridId: g.gridId, writeInspector: true, writeGrid: true };
}
```
- 复用既有 `deriveGridIdForEmployee(employeeId)`（它只接受 `employee.id`，再次印证「编码必须先转代理键」）。
- 写入沿用 `gridEnrichmentService.applyEnrichment` 的 `IS NULL` 守卫（只补 NULL，永不覆盖），与冻结铁律 #3 完全兼容。

---

## 七、与现有冻结铁律 / 数据模型的兼容性论证

| 现有约束 | 本设计是否满足 | 说明 |
|----------|----------------|------|
| Pull Engine 永不写 `inspector_employee_id`/`grid_id` | ✅ | 编码解析器是**独立层**，不在 `wpsGridPullEngine` 内 |
| `SYNC_PROJECTION` 前 18 列 hash 口径冻结 | ✅ | `employee_code` 加在非 hash 业务列段 |
| `PROTECTED_COLUMNS` 守卫 | ✅ | 同步仅写 `employee_code`（非受保护列），解析器写 `inspector_employee_id` 走 attribution 路径 |
| 人工归属 `gridAttributionService` 仍有效 | ✅ | 新解析器只填 `employee_code` 来源的记录；人工通道继续覆盖 `candidate_employee_id` |
| 既有外键 `inspector_employee_id → employee.id` | ✅ | 解析结果严格是 `employee.id`，外键链不变 |
| 双键范式一致性 | ✅ | 与 `hse_grid_inspection_records` 的 `employee_id+employee_code` 范式一致 |
| 身份证号不进入链路 | ✅ | 全程只用 `employee_code`，身份证号未被读取/返回/写入 |

---

## 八、对现有代码的影响范围（只读标注）

| 文件 | 本阶段动作 | 下一阶段动作 |
|------|-----------|--------------|
| `server/services/wps/wpsFieldMap.js` | 只读审计 | 追加 `员工编码` 映射 + `SYNC_PROJECTION_ORDER` 追加 `employee_code`（非 hash） |
| `server/services/wpsGridPullEngine.js` | 只读审计 | **不改**（受保护列守卫自动生效） |
| `server/services/gridEnrichmentService.js` | 只读审计 | 新增 `resolveByEmployeeCode` 分支（取代失效的 `wps_account_employee_map` 桥接） |
| `server/services/gridAttributionService.js` | 只读审计 | 不改（人工通道保持） |
| `server/sql/grid_inspection_records.sql` | 只读审计 | 追加 `employee_code` 列 DDL（见 §6.4） |
| `server/services/gridScope.js` | 只读审计 | 不改（`deriveGridIdForEmployee(employeeId)` 复用） |

**HSE 生产业务代码本阶段修改 = 0。**

---

## 九、是否需要数据库变化

**需要，但属可向后兼容的「加列」扩展，非破坏性**。

- 新增列 `grid_inspection_records.employee_code VARCHAR(64)`（nullable，索引可选）。
- 不改任何既有列、不改 `inspector_employee_id` 类型/语义、不删不改任何数据。
- 该列与 `hse_grid_inspection_records.employee_code` 同源范式，评审风险低。
- **本阶段不执行该 DDL**（审计阶段纪律）；留待 CF-WPS-05 之后的实现阶段，在 `safety_dashboard_dev` 演练、经授权后执行。

---

## 十、安全风险与 fail-safe

1. **编码缺失/无效**：`employee_code` 空或查表 0 行 → 记录保持 `pending`，进入人工归属池；**绝不**用姓名、手机号、昵称兜底（遵循 CF-WPS-04 的 fail-closed）。
2. **编码多重匹配**：`LIMIT 2` 命中 >1 行（理论上被唯一索引杜绝，仍保留守卫）→ pending，不任选其一。
3. **编码指向停用员工**：`is_deleted=false` 过滤 → 0 行 → pending。
4. **覆盖保护**：解析器写入 `inspector_employee_id/grid_id` 必须带 `IS NULL` 守卫，已归属记录不被覆盖（与 `applyEnrichment` 现有逻辑一致）。
5. **敏感信息**：`employee_code` 是业务编码（非身份证、非手机号），可作为快照展示；身份证号始终不参与本链路。

---

## 十一、下一阶段建议

1. **实现阶段（建议命名 CF-WPS-06 或并入移动端实现）**：
   - 执行 §6.4 DDL（先在 `safety_dashboard_dev` 演练）。
   - 在 `wpsFieldMap.js` 落地 §6.2/§6.3。
   - 在 `gridEnrichmentService` 落地 `resolveByEmployeeCode`，并在移动端巡查记录富化流程中调用（仅 `source_channel='mobile_h5'` 或「有 employee_code 且 inspector 为 NULL」的记录）。
   - 保留 `wps_account_employee_map` 旧桥接代码但标记为 deprecated（归档路线）。
2. **数据治理核查（沿用 CF-WPS-04 的检查 A–F）**：
   - 确认 WPS `员工编码` 列填充率与花名册一致；
   - 定期扫描 `employee_code` 在 `employee` 中查不到的记录 → 进入人工归属池。
3. **回归验证**：同步干跑 `POST /api/wps-grid-sync/pull?dryRun=true` 确认 `employee_code` 能正确投影、且不触发 `PROTECTED_COLUMN_WRITE_FORBIDDEN`、sync_hash 不变。

---

## 十二、最终状态

```
CF-WPS-05_STATUS = PASS
```

判定依据：
- 双键模型（`employee_code` ↔ `employee.id`）的衔接方案**已完全明确**，且无关键架构阻塞；
- 与全部现有冻结铁律（Pull Engine 受保护列、18 列 hash 口径、人工归属通道）**兼容**；
- 唯一所需的生产变更（`employee_code` 加列 + 独立解析器）属**向后兼容扩展**，已给出精确设计，待授权实现，不构成本阶段阻塞；
- 最高风险点（§四 明文禁止的「`employee_code` 直写 `inspector_employee_id`」）已在设计中通过物理列分离 + 查表解析 + 受保护列守卫**三重阻断**。

> 本阶段为审计/设计，未执行任何 DDL、未修改任何生产文件、未部署服务、未推进 WPS OAuth 正式路线。完成后停止，不自动进入 CF-WPS-06。

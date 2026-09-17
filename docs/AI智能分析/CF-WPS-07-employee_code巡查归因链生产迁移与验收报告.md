# CF-WPS-07：employee_code 巡查归因链生产迁移与验收报告

- **阶段**：CF-WPS-07
- **执行时间**：2026-09-15 16:50 – 17:1x（GMT+8）
- **生产库**：`safety_dashboard`（**本阶段唯一 DDL 目标，已授权**）
- **隔离开发库**：`safety_dashboard_dev`（CF-WPS-06 演练库）
- **最终状态**：**CF-WPS-07_STATUS=PASS**

---

## 一、阶段目标

将 CF-WPS-06 已审计通过的移动巡查身份链正式落地到当前项目：

```
移动 H5 → employee_code → WPS「员工编码」→ WPS→PG
       → grid_inspection_records.employee_code
       → employee_code → public.employee.id
       → inspector_employee_id
       → employee.id → grid_id
```

约束（全部满足）：最小变更 / 可回滚 / 不改 WPS→PG 核心同步逻辑 / 不覆盖既有人工归因 / 不做历史批量归因 / 不接 SMS / 不做 Worker·Pages·H5 / 不改登录·JWT·auth store / 不改三违业务。

---

## 二、授权信息

> **用户已授权 CF-WPS-07 生产迁移**

原始授权语句（本阶段执行依据）：

> “授权 CF-WPS-07 生产迁移”

授权范围限定为：对 `grid_inspection_records` 执行 CF-WPS-06 已审计、已在 dev 演练通过的最小 migration；不包含历史数据回填、不包含 Cloudflare/WPS OAuth/SMS/H5 任何交付物。

---

## 三、迁移前状态

生产库 `safety_dashboard` 迁移前实测（只读取证，`_cf07_prod_baseline.json`）：

| 项 | 值 |
|---|---|
| `grid_inspection_records` 列数 | **33** |
| `employee_code` 列 | **不存在** |
| `idx_gir_employee_code_pending` | **不存在** |
| 表行数 | 2061 |
| `inspector_employee_id IS NOT NULL` | 337 |
| `grid_id IS NOT NULL` | 2061 |
| `MAX(id)` | 7192 |
| `grid_record_sync_map` 行数 | 2061 |
| `source_channel IS NOT NULL` | **0（全部为 NULL）** |
| `attribution_status` 分布 | NULL 1734 / manual_confirmed 327 |
| **归因指纹 sha256** | `6188e34cead446e3709e01db136cd9e301d0e40124333479430f67c5c5f609de` |
| `public.employee` 总数 / 有编码 / 在职 | 3417 / 3269 / 3401 |
| 在职重复 `employee_code` | **0（唯一性成立）** |
| id 序列 `last_value` | 7217（高于 MAX(id)，属**历史既有**状态） |

> 关键安全前提：生产 2061 行 `source_channel` **全部为 NULL** ⇒ 自动归因候选集（`source_channel='mobile_h5'`）在生产上**恒为空**，结构上不可能触碰任何历史记录。

---

## 四、迁移内容

| 项 | 内容 |
|---|---|
| migration 名称 | `server/sql/20260915_cf06_gir_employee_code.sql` |
| 执行 runner | `server/scripts/_cf07_migrate_prod.cjs`（沿用项目既有生产迁移规范） |
| 目标对象 | `public.grid_inspection_records`（唯一） |
| 变更类型 | **纯新增 DDL**：+1 nullable 列、+1 部分索引、+1 COMMENT |
| 新增列 | `employee_code varchar(64) NULL` |
| 新增索引 | `idx_gir_employee_code_pending`（部分索引，仅覆盖未归属候选行） |
| 删除字段 | **无** |
| 修改既有字段语义 | **无** |
| 触碰 `inspector_employee_id` / `grid_id` | **无** |
| 触碰历史数据 | **无** |
| DML / backfill | **0** |

**幂等性**：`ADD COLUMN IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` + 3 项断言（列存在 / 类型为 varchar / 不得进入 FK·UNIQUE），可重复执行。

**索引必要性说明**（§三-8 要求说明原因）：唯一真实查询模式为归因任务候选集
`WHERE source_channel='mobile_h5' AND employee_code IS NOT NULL AND inspector_employee_id IS NULL AND grid_id IS NULL`。
采用**部分索引**（仅覆盖未归属行），随归因完成自动缩小，写入开销极低；不建全量索引。迁移脚本注释中已记录 `DROP INDEX` 一步回退方式。

---

## 五、实际 SQL / migration

以下为**实际执行**的完整 SQL（`server/sql/20260915_cf06_gir_employee_code.sql`，与 dev 演练使用**同一份制品**，避免两份脚本漂移）：

```sql
BEGIN;

-- 1) 业务快照列（nullable，无默认值 ⇒ 存量行保持 NULL，零业务行为改变）
ALTER TABLE public.grid_inspection_records
  ADD COLUMN IF NOT EXISTS employee_code varchar(64) NULL;

COMMENT ON COLUMN public.grid_inspection_records.employee_code IS
  '花名册员工编码（WPS「员工编码」业务快照，移动端业务身份键）。非身份列：严禁写入 inspector_employee_id；须经 gridEmployeeCodeResolver 解析为 public.employee.id 后方可用于归属。不参与 sync_hash（位于 18 列冻结 hash 段之外）。';

-- 2) 候选扫描用部分索引
CREATE INDEX IF NOT EXISTS idx_gir_employee_code_pending
  ON public.grid_inspection_records(employee_code)
  WHERE employee_code IS NOT NULL
    AND inspector_employee_id IS NULL
    AND grid_id IS NULL;

-- 3) 断言：列必须存在且类型必须为 varchar（防静默漂移）
DO $$
DECLARE v_type text;
BEGIN
  SELECT data_type INTO v_type FROM information_schema.columns
   WHERE table_schema='public' AND table_name='grid_inspection_records' AND column_name='employee_code';
  IF v_type IS NULL THEN RAISE EXCEPTION 'CF-WPS-06 迁移失败：employee_code 列未创建（STOP）'; END IF;
  IF v_type <> 'character varying' THEN RAISE EXCEPTION 'CF-WPS-06 迁移失败：employee_code 类型 % ≠ character varying（STOP）', v_type; END IF;
  RAISE NOTICE 'CF-WPS-06 迁移断言通过：grid_inspection_records.employee_code (%) 就绪', v_type;
END $$;

-- 4) 断言：employee_code 不得出现在任何 FK / UNIQUE 约束中（它是快照，不是主数据键）
DO $$
DECLARE v_cnt int;
BEGIN
  SELECT count(*) INTO v_cnt FROM pg_constraint c
   WHERE c.conrelid = 'public.grid_inspection_records'::regclass AND c.contype IN ('f','u')
     AND pg_get_constraintdef(c.oid) ILIKE '%employee_code%';
  IF v_cnt > 0 THEN RAISE EXCEPTION 'CF-WPS-06 迁移失败：employee_code 被错误地纳入 FK/UNIQUE 约束（STOP）'; END IF;
END $$;

COMMIT;
```

**执行方式（双重确认护栏，沿用项目既有 `_*.cjs` 生产迁移规范）**：

```
node scripts/_cf07_migrate_prod.cjs                              # DRY-RUN（默认，只读打印 SQL）
node scripts/_cf07_migrate_prod.cjs --apply                      # 拒绝（缺 --confirm-production）
node scripts/_cf07_migrate_prod.cjs --apply --confirm-production  # 真实执行
```

执行器护栏：目标库必须显式 `safety_dashboard` → 连接后二次核对 `current_database()` → 迁移前/后基线快照 → **归因指纹零变化断言** → 结构断言。

**实际执行输出（节选）**：

```
[BEFORE] 列数=33（employee_code=N）| 部分索引=N
         gir 行数=2061 | inspector!=NULL=337 | grid!=NULL=2061 | MAX(id)=7192
         归因指纹=6188e34cead446e3709e01db136cd9e301d0e40124333479430f67c5c5f609de（2061 行）
[APPLY] >>> 20260915_cf06_gir_employee_code.sql  done
[AFTER ] 列数=34（employee_code=Y）
         employee_code={"column_name":"employee_code","data_type":"character varying","is_nullable":"YES","character_maximum_length":64}
         部分索引=Y CREATE INDEX idx_gir_employee_code_pending ... WHERE ((employee_code IS NOT NULL) AND (inspector_employee_id IS NULL) AND (grid_id IS NULL))
         落入 FK/UNIQUE=0 | COMMENT=Y
         gir 行数=2061 | inspector!=NULL=337 | grid!=NULL=2061 | MAX(id)=7192
         归因指纹=6188e34cead446e3709e01db136cd9e301d0e40124333479430f67c5c5f609de（2061 行）
[GUARD] 归因指纹零变化（历史 inspector/grid 逐行不变） : PASS
[GUARD] 结构就位（列+索引+COMMENT，无 FK/UNIQUE）      : PASS
```

> 迁移前后归因指纹**逐字节相同** ⇒ 生产 2061 行历史 `inspector_employee_id` / `grid_id` **零变化**。

---

## 六、代码修改

本阶段**未新增业务代码**。CF-WPS-06 已交付的代码即为本阶段落地代码：

| 文件 | 类型 | 本阶段动作 |
|---|---|---|
| `server/services/wps/wpsFieldMap.js` | M（CF-WPS-06） | 未再改动（沿用） |
| `server/services/wps/gridEnrichmentService.js` | M（CF-WPS-06） | 未再改动（沿用） |
| `server/services/gridEmployeeCodeResolver.js` | A（CF-WPS-06） | 未再改动（沿用） |
| `server/services/__tests__/gridEmployeeCodeResolver.unit.test.js` | A（CF-WPS-06） | 未再改动（沿用） |
| `server/sql/20260915_cf06_gir_employee_code.sql` | A | **仅更新头部注释**（登记 CF-WPS-07 生产授权），**DDL 语句零改动** |
| `server/scripts/_cf07_migrate_prod.cjs` | A（新增） | 生产迁移 runner（诊断/运维脚本，沿用项目 `_*.cjs` 约定） |

**未修改**：登录 / JWT / auth store / 权限 / WPS OAuth / 三违 / 考核 / PC 台账 / PC 网格管理 / `/mw` / 移动端 UI / `wpsGridPullEngine.js`（零改动）。

---

## 七、employee_code resolver

实现文件：`server/services/gridEmployeeCodeResolver.js`（CF-WPS-06 交付，本阶段生产验证通过）

`resolveByEmployeeCode(employeeCode)` 规则与实现一致性（逐条对照 §四）：

| §四 要求 | 实现 | 生产验证 |
|---|---|---|
| 1. 必须 trim | `const code = norm(employeeCode)` → `String(v).trim()` | **C2 PASS**（`"  00179501  "` 正常归因） |
| 2. 空值直接返回 null | 空串 → `pending(empty_employee_code)`，`employeeId:null` | **C3 PASS** |
| 3. 精确匹配 `public.employee.employee_code` | `WHERE employee_code = $1` | **B6 PASS**（SQL 仅含 `employee_code=$1` + `is_deleted=false`） |
| 4. `is_deleted=false` | 同句 | **C5 PASS**（停用员工 → pending） |
| 5. 0 条 → null | `pending(unknown_employee_code)` | **C4 PASS** |
| 6. 1 条 → 返回 `employee.id` | 继续 → `deriveGridIdForEmployee` | **C1 PASS** |
| 7. >1 条 → fail-closed | `pending(multiple_employee_match)`，**绝不任选其一** | **C6**（生产 `uk_employee_code` 唯一索引使 >1 结构上不可能；分支逻辑由单测 T5 覆盖） |
| 8–12. 禁姓名/手机号 fallback、禁模糊、禁自动取首条、禁猜测 | 查询无 name/phone/LIKE；无兜底分支 | **B6 PASS**；**C14 同名不同编码互不串号**；**C15**（生产无同手机号样本，以 B6 源码级证据替代） |

附加加固（超出 §四 要求，均为 fail-closed）：

- bigint 由 node-pg 返回**字符串** → 显式校验 `Number.isSafeInteger(employeeId) && employeeId > 0 && /^\d+$/`，否则 `pending(invalid_employee_id)`（防精度丢失后写入错误 id）；
- 查询异常 → `pending(lookup_error)`，不抛错、不中断批处理。

**未创建第二套 employee resolver**：`authenticatedEmployeeResolver.js`（认证用户 → 员工）与 `services/employeeResolver.js`（旧业务工号/姓名）均**未修改、未替代**；本 resolver 是「业务编码 → 代理键」的独立且唯一出口。

---

## 八、grid 自动归因逻辑

**复用**既有 `server/services/gridScope.js` 的 `deriveGridIdForEmployee(employeeId)`，**未重新设计**网格归属规则（该文件本阶段零改动）。

实际实现（`resolveByEmployeeCode` 内）：`employee.id` → `deriveGridIdForEmployee(employeeId, { client })`：

| 派生结果 | 处置 |
|---|---|
| `ok`（唯一 live grid） | `attributed(employeeId, gridId)` |
| `no_grid`（0 个） | `pending(no_grid)` |
| `multiple`（>1 个） | `pending(multiple_grid)` —— **禁止猜测** |

**允许写入的唯一条件**（`buildEmployeeCodeWritePlan` 纯函数，全部满足）：

```
employee_code 有效  AND  employee 唯一解析  AND  grid_id 唯一解析
AND  inspector_employee_id IS NULL  AND  grid_id IS NULL
AND  source_channel = 'mobile_h5'
```

写入值与 SQL 层双重护栏（`applyWritePlan`）：

```sql
UPDATE grid_inspection_records
   SET inspector_employee_id = $1, grid_id = $2, updated_at = NOW()
 WHERE id = $3
   AND inspector_employee_id IS NULL      -- SQL 层再次断言
   AND grid_id IS NULL;                   -- SQL 层再次断言
```

并且**禁止部分写入**（缺任一列直接返回 0，不执行 UPDATE）。写下的恒为 `Number(res.employeeId)`（BIGINT），**永不是** `employee_code`。

生产验证：**C1**（写入 `employee.id` 而非编码）、**C7/C8**（no_grid / multiple_grid → pending，两列 NULL）、**C11**（两列都空才可写）、**C16**（富化链入口产出正确 writes）全部 PASS。

---

## 九、WPS 字段映射

| 项 | 值 |
|---|---|
| WPS 字段 | `员工编码` |
| `biz` | `employee_code` |
| PG 列 | `grid_inspection_records.employee_code` |
| 类型 | 文本（`type: 'text'`） |
| 读/写语义 | `mode: 'readonly'` = **PG 侧只读**（不反向写回 WPS 板）；WPS→PG 同步方向照常写入，与既有映射体系语义一致 |
| 既有 WPS 字段名 | **未改动** |
| 命名双轨 | **无**（代码内部统一 `employee_code`，未引入 `employeeCode`） |

**原 18 列 hash 组成未被修改**（见 §十）。

---

## 十、sync_hash 不变量验证

**§二 强制要求**：必须从当前代码（非报告）证明「新增 employee_code 到业务字段段不会改变现有 18 列 hash 内容」。已独立复证，**结论成立**。

### 10.1 代码层证据（`_cf07_hash_proof_prod.cjs` A1–A7，7/7 PASS）

| 证据 | 实测 |
|---|---|
| A1 `SYNC_HASH_COLUMN_COUNT === 18` | ✅ =18 |
| A2 `SYNC_PROJECTION_ORDER` 前 18 列与 `FROZEN_HASH_SEGMENT` 逐字节一致 | ✅ identical |
| A3 `employee_code` 位于冻结段之外 | ✅ **第 24 位**（共 24 列） |
| A4 `employee_code` 不在 `SYNC_HASH_COLUMNS` 中 | ✅ |
| A5 `employee_code` 投影 `hash` 标志为 `false` | ✅ hash=false |
| A6 哈希函数以 `if (!p.hash) continue;` 为闸门 | ✅ **occurrences=2**（`toLegacyHashDict` + `canonicalHash`） |
| A7 投影 hash 标志由 `SYNC_HASH_COLUMNS.includes(pg)` 派生（非硬编码下标） | ✅ |

**关键机制**：哈希**并非**"硬编码只迭代前 18 个下标"，而是**由 `hash` 标志驱动**（`SYNC_HASH_COLUMNS = SYNC_PROJECTION_ORDER.slice(0,18)` 仅用于生成该标志）。因此非 hash 段追加新列**天然不会**改变哈希。

外加 CF-WPS-06 引入的模块加载期 fail-fast 护栏：`SYNC_PROJECTION_ORDER.slice(0,18)` 与 `FROZEN_HASH_SEGMENT` 不一致即**进程启动时直接抛错**，杜绝"悄悄改口径"。

### 10.2 生产数据层证据（对 `safety_dashboard` 真实 WPS 源，只读）

| 用例 | 结果 |
|---|---|
| C0 独立重实现与生产 `engine.canonicalHash` 逐字节等价 | ✅ n=2063 |
| **R1** 生产存量 `sync_hash`（18 列口径）全量命中 | ✅ **2061/2061，miss=0** |
| **R2** 末尾追加 `employee_code`（第 24 位）后 hash 完全不变 | ✅ **2061/2061** |
| **R3** WPS 记录出现「员工编码」字段后 hash 完全不变 | ✅ **2061/2061** |
| **R4** 负对照：`employee_code` 插到第 1 位 → 哈希**全部改变** | ✅ **same=0/2061** |
| R5 `toCanonicalDto` 永不产出 `grid_id`/`inspector_employee_id` | ✅ violations=0 |
| Z1/Z2 本轮对生产零写入 | ✅ 双指纹不变 |

**R4 负对照**是核心证据：证明"位置敏感"真实存在——若插到第 1 位，2061 条哈希全部改变。这正是"必须末尾追加"的实证依据。

**总计：hash 复证 15/15 PASS。**

---

## 十一、Pull Engine 保护验证

**`wpsGridPullEngine.js` 本阶段零改动**（不在 `git status` 修改列表中）。

| 检查项 | 结果 |
|---|---|
| `PROTECTED_COLUMNS` 仍为 `['grid_id','inspector_employee_id']` | ✅ **P1 PASS** |
| `employee_code` **不在** `PROTECTED_COLUMNS` | ✅ P1 PASS |
| `SYNC_PROJECTION` 不含任何受保护列 | ✅ **B5/P2 PASS** |
| Pull Engine 直接写 `inspector_employee_id` | ✅ **不写**（P5 PASS） |
| Pull Engine 直接写 `grid_id` | ✅ **不写**（P5 PASS） |
| 生产 dryRun 未触发 `PROTECTED_COLUMN_WRITE_FORBIDDEN` | ✅ **P4 PASS** |
| 生产 dryRun 零写入（含 `employee_code` 参加指纹） | ✅ **P6/P7/P8 PASS** |

生产 dryRun 实测（`_cf07_pull_verify_prod.json`）：

```
enabled=true, dryRun=true, totalWps=2063, pulled=2063,
inserted=0, updated=0, skippedUnchanged=2061, skippedExcluded=2, errCount=0
```

**总计：Pull Engine 生产验证 8/8 PASS。**

> `imageWarnings=200` 为既有图片 URL 告警，与本阶段无关，且未写入任何数据。

---

## 十二、测试矩阵及结果

### 12.1 §十一 18 项矩阵（对**生产库**执行）

| # | 要求 | 用例 | 结果 |
|---|---|---|---|
| 1 | 合法 employee_code | C1 → attributed，写入 `employee.id`（BIGINT） | ✅ PASS |
| 2 | 前后空格 | C2 → trim 后正常归因 | ✅ PASS |
| 3 | 为空 | C3 → pending，两列 NULL | ✅ PASS |
| 4 | 不存在 | C4 → pending，两列 NULL | ✅ PASS |
| 5 | deleted employee | C5 → pending，两列 NULL | ✅ PASS |
| 6 | 多条 employee | C6 → 生产 `uk_employee_code` 唯一索引使 >1 结构上不可能；解析器 fail-closed 分支由单测 T5 覆盖 | ✅ PASS |
| 7 | employee 存在但无 grid | C7 → pending(no_grid) | ✅ PASS |
| 8 | 多个 grid | C8 → pending(multiple_grid) | ✅ PASS |
| 9 | 已存在 inspector_employee_id | C9 → **绝不覆盖** | ✅ PASS |
| 10 | 已存在 grid_id | C10 → **绝不覆盖** | ✅ PASS |
| 11 | 两者都为空 | C11 → 允许写入 | ✅ PASS |
| 12 | `source_channel=mobile_h5` | C12 → 进候选集且 dryRun 不写库 | ✅ PASS |
| 13 | 非 `mobile_h5` | C13 → 不进候选集（禁历史回填） | ✅ PASS |
| 14 | 姓名相同但 employee_code 不同 | C14 → 各按自身编码解析，互不串号 | ✅ PASS |
| 15 | 手机号相同但 employee_code 不同 | C15 → 生产无自然样本，以 B6 源码级证据（查询不含 phone/mobile）替代 | ✅ PASS |
| 16 | sync_hash 不变量 | B7–B10 + §十 15/15 | ✅ PASS |
| 17 | WPS→PG 映射验证 | B1/B2/B11 + P2 | ✅ PASS |
| 18 | migration 幂等验证 | A6（重跑 SQL：无错误、列数仍 34、索引仍在、**指纹不变**） | ✅ PASS |

**特别要求（无法解析时必须保持两列 NULL）**：C3/C4/C5/C7/C8 五类全部实测 `inspector_employee_id = NULL AND grid_id = NULL` —— **无任何猜测性归因**。✅

### 12.2 汇总

| 套件 | 总数 | 通过 | 失败 |
|---|---|---|---|
| 生产 hash 不变量复证（`_cf07_hash_proof_prod.cjs`） | 15 | **15** | 0 |
| 生产迁移护栏（runner 内 GUARD） | 2 | **2** | 0 |
| **生产验证矩阵（`_cf07_prod_verify.cjs`）** | 40 | **40** | 0 |
| Pull Engine 生产验证（`_cf07_pull_verify_prod.cjs`） | 8 | **8** | 0 |
| 单元测试（jest，`gridEmployeeCodeResolver.unit.test.js`） | 31 | **31** | 0 |
| dev 真机 E2E 回归（`_cf06_e2e.cjs`，事务+ROLLBACK） | 19 | **19** | 0 |
| **合计** | **115** | **115** | **0** |

---

## 十三、生产验证结果

§十二 十项逐条：

| # | 生产验证项 | 结果 | 证据 |
|---|---|---|---|
| 1 | schema 验证 | ✅ | A1 列 `varchar(64) NULL`；A5 列数 33→34 |
| 2 | migration 状态验证 | ✅ | A2 部分索引 WHERE 子句合规；A4 COMMENT 就位；A6 幂等 |
| 3 | resolver 验证 | ✅ | C1–C8、C14（含 trim / 停用 / 无网格 / 多网格） |
| 4 | employee_code 字段写入验证 | ✅ | **C1/C2/C11/C12**：事务内真实 INSERT（显式高位 id）→ 解析 → 写入 → 读回校验 → `ROLLBACK`（D4 证明零残留） |
| 5 | WPS mapping 验证 | ✅ | B1 映射唯一命名；B2 投影含该列且 hash=false |
| 6 | Pull Engine 验证 | ✅ | P3 生产 dryRun 成功、errCount=0；P5 写入计划不含受保护列 |
| 7 | protected columns 验证 | ✅ | P1/P2/B4/B5 |
| 8 | sync_hash 不变量验证 | ✅ | R1–R4 生产数据 2061/2061 |
| 9 | 自动归因边界验证 | ✅ | C3–C5/C7/C8/C13（全部 pending 且两列 NULL） |
| 10 | 历史数据零修改验证 | ✅ | D1 归因指纹逐字节不变；D2 行数/归因数/MAX(id) 不变且 `employee_code` 全 NULL |

**生产服务状态**：迁移后生产后端（PID 3032，端口 5876）**未重启**，`GET /api/health` → **200**；受保护接口 `GET /api/grid-inspection-records` → 401（需鉴权，符合预期）。DDL 为向后兼容的纯新增可空列，运行中的进程不受影响。

> 观察项（**非本阶段引入**）：`GET /` 返回 404。经查 `server/app.js` 的最后修改时间为 **2026-09-15 06:46**（另一并行会话），与本阶段（16:50+）无关；本阶段未触碰静态托管相关代码。

---

## 十四、历史数据影响检查

| 检查项 | 迁移前 | 迁移后 | 结论 |
|---|---|---|---|
| 归因指纹 sha256（2061 行 `id\|inspector\|grid`） | `6188e34c…f609de` | `6188e34c…f609de` | **逐字节相同** |
| 表行数 | 2061 | 2061 | 不变 |
| `inspector_employee_id IS NOT NULL` | 337 | 337 | 不变 |
| `grid_id IS NOT NULL` | 2061 | 2061 | 不变 |
| `MAX(id)` | 7192 | 7192 | 不变 |
| `employee_code IS NOT NULL` | （列不存在） | **0** | **未回填任何历史** |
| `grid_record_sync_map` 行数 / hash 指纹 | 2061 / `f0584a71…` | 2061 / 不变 | 不变 |
| id 序列 `last_value` | 7217 | 7217 | 不变（测试行用显式高位 id） |
| CF07 测试残留行 | — | **0** | ROLLBACK 彻底 |

**结论：生产历史归因（`inspector_employee_id` / `grid_id`）零变化，未发生任何 §十二 所述"历史归因变化"情形 ⇒ 不触发 BLOCKED。**

本阶段**未执行**任何历史批量归因（§十禁止项）：生产 `source_channel` 全为 NULL，候选集恒为空；未执行 `UPDATE` 全表 / 历史 WPS 数据 / 所有 NULL `inspector_employee_id`。

---

## 十五、回滚方案

### 15.1 migration 回滚方式（schema）

```sql
BEGIN;
DROP INDEX IF EXISTS public.idx_gir_employee_code_pending;
ALTER TABLE public.grid_inspection_records DROP COLUMN IF EXISTS employee_code;
COMMIT;
```

纯新增可空列的回退**不影响任何既有列 / sync_hash / 映射表**。

### 15.2 代码回滚方式

| 层级 | 操作 |
|---|---|
| 服务层 | 回退 `server/services/wps/wpsFieldMap.js`（移除 `员工编码` 映射与第 24 位投影项，保留 `FROZEN_HASH_SEGMENT` 护栏）与 `gridEnrichmentService.js` 的 employee_code 路径分支 |
| 解析器 | 停止调用 `gridEmployeeCodeResolver`（或移除该文件）；该模块无其它调用方 |
| 归因入口 | `attributePendingByEmployeeCode` 未被任何常驻流程调用 ⇒ 无需停用调度 |
| 数据层 | **无需回退**：本阶段未产生任何 `employee_code` 业务数据（生产 `employee_code` 全为 NULL） |

### 15.3 回滚前检查项

1. 确认无新的移动巡查数据写入（`SELECT count(*) FROM grid_inspection_records WHERE source_channel='mobile_h5'`）；
2. 确认 `employee_code IS NOT NULL` 的行数（若 >0，见 15.5）；
3. 确认无外部系统/前端依赖 `employee_code` 字段读取。

### 15.4 回滚后检查项

1. `gir` 列数回到 33；`employee_code` 与部分索引不存在；
2. 归因指纹仍等于 `6188e34c…f609de`；
3. `grid_record_sync_map` 行数与 hash 指纹不变；
4. `gir` 行数 / `inspector` / `grid` / `MAX(id)` 不变；
5. 生产后端 `/api/health` 返回 200。

### 15.5 schema 回滚与业务数据处理的关系（§十三 明确要求）

`DROP COLUMN` 是**破坏性**的：若届时 `employee_code` 已承载真实业务数据，直接 DROP 会丢失这些快照值。

因此执行顺序必须是：

1. **先**导出业务数据：`CREATE TABLE gir_employee_code_bak AS SELECT id, employee_code, created_at FROM grid_inspection_records WHERE employee_code IS NOT NULL;`
2. **再**执行 15.1 的 schema 回滚；
3. 如需重新引入，按 §五 重新 migration，并从备份表回填。

**即：绝不允许因 schema 回滚而直接丢弃业务数据。** 当前生产 `employee_code` 全为 NULL，15.5 暂不触发。

### 15.6 本阶段实际可用的回滚资产

- 逻辑备份：`artifacts/cf07-backup/`
  - `gir_identity_cols.json`（2061 行身份/归因列，指纹 `6188e34c…`）
  - `grid_record_sync_map.json`（2061 行，hash 指纹 `f0584a71…`）
  - `employee_code_index.json`（3269 条在职编码索引，**不含**姓名/身份证/手机号）
  - `MANIFEST.json`（校验指纹与恢复说明）

---

## 十六、Git 变更清单

**执行前基线**：`git status` 条目 **235**（含 40+ 条历史遗留 `M`）。
**执行后**：条目 **238**（净 +3，其中含本阶段 `artifacts/`、`docs/AI智能分析/`，以及并行会话的 `start-hse-ai.ps1` / `scripts/_ai12_*` 输出文件）。

### 本阶段（CF-WPS-06 + CF-WPS-07）新增文件

| 文件 | 说明 |
|---|---|
| `server/services/gridEmployeeCodeResolver.js` | employee_code → employee.id → grid_id 唯一解析器（CF-WPS-06 交付，CF-WPS-07 生产验证） |
| `server/sql/20260915_cf06_gir_employee_code.sql` | **migration 文件**（dev 与 prod 共用同一份） |
| `server/services/__tests__/gridEmployeeCodeResolver.unit.test.js` | **测试文件**（31 项） |
| `artifacts/cf07-backup/*.json` | 生产迁移前逻辑备份（4 个文件） |
| `docs/AI智能分析/CF-WPS-07-employee_code巡查归因链生产迁移与验收报告.md` | **文档文件**（本报告） |

### 本阶段修改文件

| 文件 | 说明 |
|---|---|
| `server/services/wps/wpsFieldMap.js` | 新增 `员工编码→employee_code` 映射 + 第 24 位投影项 + `FROZEN_HASH_SEGMENT` fail-fast 护栏 |
| `server/services/wps/gridEnrichmentService.js` | 接入 employee_code 业务身份路径（复用既有富化入口） |
| `server/sql/20260915_cf06_gir_employee_code.sql` | **仅头部注释**更新（登记 CF-WPS-07 生产授权）；DDL 语句零改动 |

### 未被 git 跟踪的本阶段脚本（沿用项目既有约定）

`_*.cjs` 被 `.gitignore:145` 忽略，与既有 `_p2b1d_impl02_migrate_prod.cjs` 等生产脚本一致：

- `server/scripts/_cf07_migrate_prod.cjs`（生产迁移 runner）
- `_cf07_prod_baseline.cjs` / `_cf07_prod_backup.cjs` / `_cf07_hash_proof_prod.cjs` / `_cf07_prod_verify.cjs` / `_cf07_pull_verify_prod.cjs`

**未提交任何无关修改**：本阶段未改动禁改模块（登录 / JWT / auth store / 权限 / 三违 / 考核 / PC 台账 / PC 网格管理 / `/mw` / 移动端 UI）。仓库既有 40+ 条历史遗留 `M` 文件与并行会话的 `_ai12_*` / `start-hse-ai.ps1` 均**未被本阶段触碰**。

---

## 十七、风险与剩余问题

| # | 风险 / 问题 | 等级 | 说明与建议 |
|---|---|---|---|
| R1 | **生产 `employee_code` 无数据来源** | 中 | WPS 板「员工编码」字段当前无值（`empCodeFieldPresentInWpsBoard=0`），且移动端 H5 未开发 ⇒ 链路"已通但无流量"。属预期，非缺陷 |
| R2 | **归因链未接线到常驻流程** | 中 | `attributePendingByEmployeeCode` 已就绪但无调用方（本阶段任务书未要求）。建议接线时**首轮先 dryRun** 观察 `byReason` 分布 |
| R3 | 生产 `source_channel` 全为 NULL | 低 | 使候选集恒为空，是目前"历史零风险"的根本原因；一旦 H5 上线将首次产生 `mobile_h5` 数据，需届时复核 |
| R4 | `id` 序列 `last_value`(7217) > `MAX(id)`(7192) | 低 | 历史既有状态（非本阶段引入）；不影响正确性，仅说明曾有回滚/删除 |
| R5 | `GET /` 返回 404 | 低 | 与 `server/app.js` 06:46 的并行改动相关，**非本阶段引入**；建议由该会话负责人跟进 |
| R6 | 迁移 runner 未被 git 跟踪 | 低 | 沿用项目 `_*.cjs` 约定；版本化制品为 `server/sql/20260915_cf06_gir_employee_code.sql` |
| R7 | 生产运行时进程为迁移前启动的旧代码 | 低 | 旧代码不含 `employee_code` 投影，行为与迁移前一致（安全）；下次重启后自动使用新投影，届时 WPS 也会写该列（当前恒 NULL） |
| R8 | 生产 DB 备份 | 中 | 本阶段仅提供**逻辑备份**（`artifacts/cf07-backup/`：归因列 + sync_map + 编码索引）。**未**确认存在物理快照；后续含 DML 的生产变更前应先落实可恢复物理备份 |

---

## 十八、下一阶段建议

按 §十八，本阶段完成即停止，**不自动进入 CF-WPS-08**。以下为建议，须单独授权：

1. **归因链接线（建议 CF-WPS-08）**：在 WPS 同步完成钩子或独立定时任务中调用 `attributePendingByEmployeeCode({ dryRun:true })` 观察一轮，再放开写入；建议同时加计数指标（`attributed / pending by reason`）。
2. **移动端 H5 最小闭环**：仅当 H5 能提交 `employee_code` 并落 `source_channel='mobile_h5'` 后，本链路才有真实流量；建议作为独立阶段（含手机号+短信+花名册校验）单独立项。
3. **WPS 板字段准备**：推动业务方在 WPS 板增加并填充「员工编码」列，使 R1 风险消解。
4. **生产物理备份机制**：在下次含 DML 的生产变更前，落实可恢复的物理备份/快照与演练恢复流程（对应 R8）。
5. **`wps_account_employee_map` 处置**：保留现状（§十要求），如需标记 deprecated 建议在专门阶段统一处理。

---

## 十九、最终状态

```
CF-WPS-07_STATUS=PASS
```

判定依据（全部满足）：

| 验收项 | 结果 |
|---|---|
| §二 hash 不变量从**当前代码 + 生产数据**独立复证（15/15） | ✅ 未触发 `ARCHITECTURE_DECISION_REQUIRED` |
| §三 生产 migration 已执行（经项目 migration 机制 + 双重确认护栏） | ✅ 列 `varchar(64) NULL` + 部分索引 + COMMENT |
| §三 迁移幂等（重复执行零副作用） | ✅ A6 |
| §四 resolver 12 条规则全部满足 | ✅ C1–C8、B6、C14/C15 |
| §五 grid 归因复用 `deriveGridIdForEmployee`，fail-closed | ✅ C7/C8 |
| §六 既有 `inspector_employee_id` / `grid_id` 绝不覆盖 | ✅ C9/C10 + SQL 层双断言 |
| §七 自动归因限 `source_channel='mobile_h5'`，未硬造 producer | ✅ C12/C13 |
| §八 WPS 字段映射正确、18 列 hash 组成未改 | ✅ B1/B2/B3 |
| §九 `PROTECTED_COLUMNS` 保留，`employee_code` 不在其中，Pull Engine 不写两列 | ✅ P1–P5 |
| §十 未做任何历史批量归因 | ✅ 生产 `employee_code` 全 NULL；候选集恒空 |
| §十一 测试矩阵 18/18 覆盖且真实执行 | ✅ 生产 40/40 + 31 单测 + 19 E2E |
| §十二 生产历史数据零修改 | ✅ 归因指纹 `6188e34c…` 逐字节不变 |
| §十三 回滚方案齐备（含 schema/业务数据关系） | ✅ §十五 |
| §十四 禁改范围零触碰 | ✅ 登录/JWT/auth store/权限/三违/考核/PC 台账/PC 网格/`/mw`/H5 均未改 |
| §十五 代码质量（CommonJS、复用既有模式、零硬编码、无第二套 resolver） | ✅ |
| §十六 Git 变更清单明确，无无关提交 | ✅ §十六 |

**风险提示**：R1/R2（无真实数据来源、未接线）为**业务进度问题**而非技术缺陷，不影响本阶段 PASS 判定。

---

## 附录 A：本阶段证据文件

| 文件 | 用途 | 结果 |
|---|---|---|
| `_cf07_prod_baseline.cjs` / `_cf07_prod_baseline.json` | 迁移前生产基线取证 | 指纹 `6188e34c…` |
| `_cf07_prod_backup.cjs` / `artifacts/cf07-backup/` | 生产逻辑备份 | 2061/2061/3269 行 |
| `_cf07_hash_proof_prod.cjs` / `_cf07_hash_proof_prod.json` | 生产 hash 不变量复证 | 15/15 PASS |
| `server/scripts/_cf07_migrate_prod.cjs` / `server/scripts/output/_cf07_migrate_prod_apply.json` | 生产迁移 runner | 2/2 GUARD PASS |
| `_cf07_prod_verify.cjs` / `_cf07_prod_verify.json` | 生产验证矩阵 + §十一 18 项 | 40/40 PASS |
| `_cf07_pull_verify_prod.cjs` / `_cf07_pull_verify_prod.json` | Pull Engine 生产 dryRun | 8/8 PASS |
| `_cf06_e2e.cjs` / `_cf06_e2e.json` | dev 端到端回归 | 19/19 PASS |

## 附录 B：铁律对照表

| 铁律 | 落地 |
|---|---|
| `employee_code` = 花名册员工编码（VARCHAR，移动端业务身份键） | 生产列 `employee_code varchar(64) NULL`，业务快照语义，无 FK |
| `employee.id` = PG 内部代理键（BIGINT） | 经 `SELECT id FROM public.employee WHERE employee_code=$1 AND is_deleted=false` 获得 |
| `inspector_employee_id` = `employee.id`，**绝不**等于 `employee_code` | 解析器只写 `Number(employeeId)`；生产 C1 实测写入 `6692` 型整数而非编码 |
| WPS 是数据缓冲层 | Pull Engine 只同步业务字段，零人员归因 |
| Pull Engine 不负责人员归因 | `wpsGridPullEngine.js` 本阶段零改动 |
| 归因层负责 `employee_code → employee.id` | `gridEmployeeCodeResolver.js` 为唯一出口 |
| 所有无法确定的情况 fail-closed | 空 / 查无 / >1 行 / 无网格 / 多网格 / 非法 id / 查询异常 / 非 mobile_h5 → 全部 pending 且两列 NULL |

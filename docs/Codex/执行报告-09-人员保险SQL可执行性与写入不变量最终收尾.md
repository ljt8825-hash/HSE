# 执行报告-09：人员保险 SQL 可执行性与写入不变量最终收尾

- **执行日期**：2026-08-05
- **工作区**：G:\hse-dashboard
- **结论**：**通过**（第 11 节 12 项验收标准全部满足）

---

## 一、开始前审核结论（原样复述）

1. `docs/Codex/执行报告-08-人员保险最终行为验收与险种字典收口.md` 经 Codex 审核只能判为 **部分通过**，不能判为"通过"，当前不得进入车辆模块。
2. Codex 已实际复跑：后端 `17/17` 套件、`339/339` 用例通过；前端 typecheck 退出码 0；前端 Vitest `3/3` 文件、`12/12` 用例通过；语法检查和 `git diff --check` 通过。绿色结果属实，但测试仍在验证错误 SQL 字符串或构造真实数据库不可能出现的 mock 状态。
3. 已完成且必须保留的成果包括：稳定 `employee_id` 关联、共享 `employeeResolver`、`Asia/Shanghai` Node 业务日、人员保险双险字典、通用导入数据库列白名单、直接导入逐行 `safeParse`、互斥人员级四态的设计、迁移阶段顺序、前端按后端状态显示与准确 `isCurrent` 回显。
4. 当前首要阻断是业务日 SQL 写为 `CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai'::date`。缺少括号会使 PostgreSQL 优先尝试把字符串 `'Asia/Shanghai'` 转成 `date`，而不是把 `AT TIME ZONE` 的结果转为日期；正确表达式必须是 `(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date`。
5. 通用导入当前在识别同一保单 UPDATE 目标前先查"重复当前保单"，真实数据库会查到目标自身并返回 `duplicate_active_policy`，导致正常更新不可达；现有 UPDATE 测试通过 mock 强行让查重为空、随后冲突查询又命中同一行，属于不可能状态。
6. 本轮未连接、读取或修改真实数据库，未执行迁移，未读取或改动真实上传文件，未运行真实 Python、数据库集成测试或浏览器 E2E，未启动或终止用户服务，未删除文件，未创建提交，未推送远端。

---

## 二、第 2 节 12 项问题逐项复核（含代码位置与证据）

| # | 提示词所述问题 | 复核结论（当前代码） |
|---|---|---|
| 1 | `BUSINESS_DAY_SQL` 缺括号无效表达式；测试期待错误字符串 | ✅ 确认：`insurance.js:791`（旧）`const BUSINESS_DAY_SQL = "CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai'::date"`（无括号）；测试断言精确匹配该错误字符串 |
| 2 | `import.js` 查重裸 `CURRENT_DATE`；overview 临期也用裸 CURRENT_DATE + 错误表达式 | ✅ 确认：`import.js:1968`（旧）`p.start_date <= CURRENT_DATE`；`insurance.js:2855-2859`（旧）overview r2/r3 用无括号表达式、r4 用裸 `CURRENT_DATE`。报告所称"personnel 相关全部替换"与事实不符 |
| 3 | 内存 rank 与 SQL 对日期不完整/非法记录不等价（SQL 未来分支不要求 expire_date、历史分支不要求 start_date、无 start<=expire） | ✅ 确认：`insurance.js:803-804`（旧）SQL `WHEN p.is_current = true AND p.start_date IS NOT NULL AND p.start_date > BD THEN 1`（缺 expire_date/start<=expire）；`insuranceRecordRank` 同期未要求 `start <= exp`。缺止期未来、缺起期历史、起期晚于止期可能被排为未来/历史而非 rank 3 |
| 4 | `personLevelSql.hasExpired` 用"非当前有效且 expire_date < 业务日"，把 is_current=false/缺起期/非法判 expired；JS 判 uninsured | ✅ 确认：`insurance.js:839`（旧）`hasExpired = (emp.id IS NOT NULL AND NOT (activePolicySql) AND emp.expire_date < BD)`——停用/缺起期记录被判 expired，与 JS 的 uninsured 不等价 |
| 5 | 通用导入先查重后查 UPDATE 目标 → 目标自身拦截，UPDATE 不可达 | ✅ 确认：`import.js:1960-1981`（旧）预处理先查重，`import.js:2096+`（旧）后 existingMap 查 UPDATE 目标——导入同一当前保单会被自己拦截 |
| 6 | UPDATE 测试先 mock"查重无命中"后 mock"同目标存在"（不可能状态） | ✅ 确认：`import-personnel-behavior.unit.test.js`（08 版）conflict UPDATE 测试 mock 序列 `[查重空, 同目标存在]`——真实数据快照下不成立 |
| 7 | `projectToDbColumns` 丢 `_import_row_no`；逐行失败无行号；rowErrors 拼接 e2.message 泄漏；UPDATE 失败仅 skipped | ✅ 确认：`import.js:2143`（旧）投影后行上下文丢失；`import.js:2207`（旧）`importRowErrors.push(...e2.message)`；UPDATE catch 仅 `skipped++` |
| 8 | "同员工同险种唯一当前有效"只在直接导入/通用导入手写 | ✅ 确认：查重 SQL 仅存在于 `insurance.js:1542`（直接导入）与 `import.js:1964`（通用导入）；单条创建/更新/内存/generate-from-pending 无冲突检查 |
| 9 | 单条创建内存分支未规范化险种（工伤险原样写入不可见） | ✅ 确认：`insurance.js:1841`（旧）内存分支 `insurance_type: req.body.insuranceType` 未过 `normalizeInsuranceType` |
| 10 | `generate-from-pending` 无 requireRole；generated 按人员计数；catch 泄漏 e.message | ✅ 确认：`insurance.js:1783`（旧）`router.post('/personnel/generate-from-pending', async ...)` 无 requireRole；`generated++` 在人员循环内；`catch (e) { errors.push(...e.message) }` |
| 11 | `/stats/overview.personnel` 按记录数+简单到期日统计，pending 恒 0 | ✅ 确认：`insurance.js:2853-2860`（旧）`COUNT(*) FROM personnel_insurance` + 简单 expire_date 条件；`pending` 默认 0 永不更新 |
| 12 | 前端 `personnel-type.test.ts` 自建影子常量 + 恒真断言 | ✅ 确认：`personnel-type.test.ts` 内 `const SUPPORTED_FRONTEND_TYPES = [...]` 影子数组 + `expect('工伤保险').toBe('工伤保险')` 恒真；页面硬编码 SelectOption |

**与提示词差异**：无。未发现用户并行修改覆盖本轮目标文件（用户修改的 `accidents.js/emergency.js/hse-employee*.js` 等不在目标范围，未触碰）。

---

## 三、最终规则表

### 3.1 业务日 SQL（唯一可执行表达式，集中管理）

```sql
(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date
```

- 常量移入 `server/services/businessDay.js` 导出（`BUSINESS_DAY_SQL`）；`insurance.js`/`import.js`/`personnelInsurancePolicyService.js` 只能导入使用，不各自复制文字。
- 全部人员保险 SQL（主列表/COUNT/stats/overview/选单/查重/expiring-soon）使用该常量；无残留裸 `CURRENT_DATE` 与无括号错误表达式。
- 车辆/其他保险模块的既有 `CURRENT_DATE` 保持不动（任务 1.4）。

### 3.2 单险种真值表（JS 与 SQL 同一事实）

| 状态 | 条件 | 展示 | rank |
|---|---|---|---|
| `active` | `is_current=true` + 起止都存在 + `start<=expire` + `start<=业务日<=expire` | 0–30 天 `expiring`；31+ 天 `insured` | 0 |
| `future` | `is_current=true` + 起止都存在 + `start<=expire` + `start>业务日` | uninsured | 1 |
| `expired` | `is_current=true` + 起止都存在 + `start<=expire` + `expire<业务日` | expired | 2 |
| `inactive_or_invalid` | `is_current=false/NULL`、任一日期缺失、起期晚于止期、其他非法 | uninsured | 3 |

- 共享 SQL 构造 `policyStateSql(alias)`（active/future/expired/expiring/hasValidDates），`policyPivotSql`/`activePolicySql`/`personLevelSql`/stats/筛选全部复用。
- 内存 `insuranceRecordRank` 使用同一条件（含 `start<=exp` 校验），与 SQL 完全等价。

### 3.3 人员级互斥四态与统计恒等式

- 优先级：`expiring` > `insured` > `expired` > `uninsured`。
- `personLevelSql.hasExpired` 用"真正 expired"（`policyStateSql.expired`），不再用 `NOT active AND expire_date < 业务日`——停用/缺起期/非法记录 DB 与 JS 均判 uninsured。
- 共享 pivot 构造 `buildPersonnelStatsPivotSql()`：`/personnel/stats` 与 `/stats/overview.personnel` 共用；`covered=insured+expiring`、`expired`、`pending=uninsured`、`expiring⊆covered`、恒等式 `total = covered + expired + pending`。
- 内存模式同样复用 `calcPersonStatus` 人数口径。

### 3.4 当前有效冲突服务（六写入口统一）

`server/services/personnelInsurancePolicyService.js`：
- `findActivePolicyConflict({ employeeId, insuranceType, excludeId })` → `{ conflict: {id} | null }` 或 `{ error: 'duplicate_check_failed' }`（fail-closed）。
- `findActivePolicyConflictInMemory({...}, { records, businessDay })` 内存等价检查。
- 单条创建、单条更新（合并"更新后完整事实"+excludeId）、直接导入、通用导入（先识别 UPDATE 目标再 excludeId）、`generate-from-pending`、内存模式全部复用。

---

## 四、任务完成明细

### 任务 1：修正并集中管理可执行的业务日 SQL ✅

- `businessDay.js` 导出 `BUSINESS_DAY_SQL = "(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date"`（带括号）。
- `insurance.js` 删除本地常量定义，改从服务导入；`import.js` 顶部导入共享常量。
- 替换 personnel 相关全部裸 CURRENT_DATE 与错误无括号表达式：`import.js` 查重、`insurance.js` expiring-soon/直接导入查重/overview personnel。
- 新增 SQL 安全契约测试：常量精确断言、拒绝正则 `AT TIME ZONE 'Asia/Shanghai'::date`、9 个生产 SQL 构造统一 guard（无裸 CURRENT_DATE/无错误表达式/含带括号常量）、import.js 服务常量导入与冲突服务常量检查、overview 复用共享 pivot 断言。

### 任务 2：单险种状态/选单/人员四态同一真值表 ✅

- 新增 `policyStateSql(alias)` 共享构造；`policyPivotSql` rank1/2 同时要求 `is_current=true` + 起止齐全 + `start<=expire`。
- `insuranceRecordRank` 同条件 + 业务日字符串比较（修复 Date/字符串比较 NaN bug）。
- `personLevelSql.hasExpired` 改用真正 expired 条件（不再误判停用/缺起期/非法）。
- 表驱动真值表矩阵 15 行（当前有效/未来/历史/停用×3/缺起期/缺止期/两者都缺/起期晚于止期×2/当天生效/当天到期/第30天/第31天）——每行验证 child status + rank；SQL 分支含完整日期条件断言。

### 任务 3：覆盖全部写入口的当前保单冲突服务 ✅

- 新建 `personnelInsurancePolicyService.js`（DB 查询 + 内存等价检查 + excludeId + fail-closed）。
- 单条创建：内存分支规范化 + 冲突服务检查（工伤险→工伤保险）；DB 分支规范化 + 冲突服务。
- 单条更新：先 SELECT 现有行 → 合并"更新后完整事实"（employeeId/type/date/isCurrent）→ 若将成为当前有效则以 excludeId=自身检查冲突（禁止仅查请求局部字段）；内存模式同样合并后检查。
- 直接导入：改用共享冲突服务（删手写查重 SQL）。
- `generate-from-pending`：加 `requireRole('admin','safety_manager')` + 共享冲突服务 + `generated` 按实际保单数 + 结构化 `processed/generated/failed/rowErrors` + 错误收敛（不泄漏 e.message）。
- 测试：冲突服务 6 用例（无冲突/命中/excludeId 参数/异常 fail-closed/内存命中/内存排除）。

### 任务 4：修正通用导入同目标 UPDATE 和错误上下文 ✅

- **决策顺序修正**：先识别 UPDATE 目标（`employee_id + 规范险种 + policy_no` 的 existingMap 查询），命中目标后以 `excludeId=目标ID` 执行冲突检查；无目标按 INSERT 场景查全部当前有效；空保单号不作为 UPDATE 标识（按 INSERT 查重）。
- **行上下文分离**：`buildWriteItem` 生成 `{ dbRow, sourceRowNo, sourceEmployeeCode }`，投影后不丢行号；批量/逐条/UPDATE 三路径从上下文取行号与安全标识。
- **结构化错误**：`importRowErrors` 改为 `{ row, reason, message, employeeCode }`；DB 异常仅服务端日志 + 稳定 `write_failed`/`update_failed` 通用提示（不泄漏列名/SQL/host/port）。
- **fail-closed**：personnel 冲突目标批量查询失败 → 整批中止返回 `duplicate_check_failed`（不再把 existingMap 当空继续 INSERT）；其他模块保持原降级行为。
- **真实可达测试**：UPDATE 测试同一次状态查询同时满足"目标存在 + 排除后无冲突"（断言冲突查询参数含 excludeId=99）；"目标存在 + 另一张当前有效"拒绝且不 UPDATE；目标查询异常 fail-closed。

### 任务 5：统一 overview、规则生成计数和前端生产常量 ✅

- `/stats/overview.personnel`：改用 `buildPersonnelStatsPivotSql()`（花名册人员为主 + 确定性双险透视 + 互斥四态），与 `/personnel/stats` 同口径、恒等式成立；内存模式复用 `calcPersonStatus` 人数口径（不再按记录数）。
- `generate-from-pending`：requireRole + generated 按实际保单数（同一人员两险种=2；一条重复一条成功=部分结果）+ 结构化失败。
- 前端：`PERSONNEL_INSURANCE_TYPES` 生产常量导出于 `insurance.ts`；页面新增/编辑下拉 `v-for` 渲染该常量；`personnel-type.test.ts` 直接导入生产常量、删除影子数组与恒真断言、验证页面使用路径。

### 任务 6：新增能在当前实现上失败的验收测试 ✅

新增 38 用例（详见第 8 节），每项标注在 08 轮实现上的失败点；保留 08 轮全部有效回归。

---

## 五、通用导入 INSERT/UPDATE 决策顺序、excludeId 与行上下文

**决策顺序（任务 4.1）**：
1. 预处理（解析/规范化/校验，不做冲突检查）→ 带 `_import_row_no`/`employee_code` 的原始行
2. 分类：`conflictKey = [employee_id, insurance_type, policy_no]`，有完整键 → rowsWithConflict（含保单号）；无 → rowsWithoutConflict（含空保单号）
3. **existingMap 批量查询**（识别 UPDATE 目标）：同 employee+type+policy_no 命中 → toUpdate（带目标 id）；未命中 → toInsert
4. **personnel 专用冲突检查阶段**：
   - toInsert（含空保单号行）：`findActivePolicyConflict({employeeId, insuranceType})` 无 excludeId
   - toUpdate：`findActivePolicyConflict({employeeId, insuranceType, excludeId: 目标ID})`
   - 查询异常 → `duplicate_check_failed` fail-closed；冲突命中 → `duplicate_active_policy`（该行不写库）
5. 批量 INSERT / 逐条降级 INSERT / UPDATE 三路径用白名单列 + 行上下文

**excludeId 语义**：更新现有记录时排除自身（更新自身不视为冲突）；测试断言查询参数含正确 excludeId。

**行上下文**：`{ dbRow, sourceRowNo, sourceEmployeeCode }`；`_import_*`/`employee_code` 仅存在于上下文，绝不进入 SQL。

**结构化错误格式**：`{ row, reason, message, employeeCode }`；reason ∈ `duplicate_active_policy` / `duplicate_check_failed` / `write_failed` / `update_failed` / 预处理 reason；message 为通用中文提示，不含内部数据库文本。

---

## 六、全部人员保险写入口与共享服务使用

| 写入口 | 险种规范化 | 冲突服务 | 备注 |
|---|---|---|---|
| 单条创建 POST /personnel（DB） | ✅ | ✅ findActivePolicyConflict | employeeId 必填 + 快照 |
| 单条创建 POST /personnel（内存） | ✅ | ✅ findActivePolicyConflictInMemory | 工伤险→工伤保险 |
| 单条更新 PUT /personnel/:id（DB） | ✅ | ✅ 合并事实 + excludeId | 先 SELECT 合并再检查 |
| 单条更新 PUT /personnel/:id（内存） | ✅ | ✅ 合并事实 + excludeId | 同上 |
| 直接导入 POST /personnel/import | ✅ | ✅ findActivePolicyConflict | 逐行 safeParse |
| 通用导入 /api/import/confirm | ✅ | ✅ 目标识别 + excludeId | 见第五节 |
| 规则生成 POST /personnel/generate-from-pending | ✅ | ✅ findActivePolicyConflict | requireRole + 保单计数 |

---

## 七、验证命令真实结果

| 命令 | 退出码 | 结果 |
|---|---|---|
| `node --check server/routes/insurance.js` | 0 | ✅ |
| `node --check server/routes/import.js` | 0 | ✅ |
| `node --check server/schemas/insurance.js` | 0 | ✅ |
| `node --check server/services/businessDay.js` | 0 | ✅ |
| `node --check server/services/employeeResolver.js` | 0 | ✅ |
| `node --check server/services/insuranceTypeDict.js` | 0 | ✅ |
| `node --check server/services/personnelInsurancePolicyService.js` | 0 | ✅ |
| `node --check server/app.js` | 0 | ✅ |
| `npm --prefix server run build` | 0 | ✅ |
| `npm --prefix server run test -- --runInBand` | **0** | **17 套件 / 377 用例全绿**（08 轮 339 → +38） |
| `npm --prefix server run test -- --runInBand --detectOpenHandles` | 0 | ✅ 无 open handles |
| `pnpm --dir "安全看板vben/apps/web-antd" run typecheck` | 0 | ✅ 零错误 |
| 前端 Vitest（personnel-type + personnel-status + useEmployeeData） | 0 | 3 文件 / 12 用例（vitest 4.1.10） |
| 前端生产构建（outDir=`C:/Users/honey/AppData/Local/Temp/hse-build-out9`） | 0 | ✅ 未触碰仓库内 dist |
| `git diff --check` | 0 | ✅ |
| `git status --short` | — | 7 个用户并行修改文件保留，未覆盖 |

**外部副作用核查**：
- `Python执行完成` 真实日志：**0**；`import_parser.py` confirm 执行：**0**
- `Jest has detected open handles`：**0**
- `ECONNREFUSED` 2 处：均来自 `aiService.unit.test.js` mock 重试日志（预期）
- 真实文件读写（EACCES/EPERM/uploads 写入）：**0**
- 构建产物副作用：`apps/web-antd/dist.zip`（archiver 插件既有行为，覆盖上次产物，未跟踪）

---

## 八、新增/修改测试清单（在 08 轮实现上为何失败）

| 测试 | 08 轮实现上失败原因 | 修复后验证 |
|---|---|---|
| 业务日 SQL 安全契约 5 用例 | 08 轮常量无括号 → 精确断言失败；guard 检测到裸 CURRENT_DATE/错误表达式 | 带括号常量 + 全入口 guard |
| 单险种真值表矩阵 15 用例 | 08 轮 `insuranceRecordRank` 缺 start<=expire、Date/字符串比较 NaN → 缺止期未来/缺起期历史 rank 错 | rank 全对（1/2/3 精确） |
| SQL 分支完整日期条件 | 08 轮 rank1/2 缺完整日期 → 断言失败 | policyStateSql 分支全含 is_current+起止+start<=expire |
| hasExpired 等价 2 用例 | 08 轮 `NOT active AND expire<BD` 误判停用/缺起期 → 断言检测到错误形态 | 真正 expired 条件 + 禁错误形态 |
| 冲突服务 6 用例 | 08 轮无共享服务 | excludeId 参数、fail-closed、内存等价 |
| generate 权限/计数 3 用例 | 08 轮无 requireRole、generated 按人员数、e.message 泄漏 | 401/403、保单计数、结构化错误无泄漏 |
| 内存规范化 2 用例 | 08 轮内存分支不规范化（工伤险原样写入） | 工伤险→工伤保险可见；意外伤害险拒绝 |
| overview 同口径 2 用例 | 08 轮按记录数统计、pending 恒 0 | 共享 pivot、恒等式成立、内存同口径 |
| 通用导入同目标 UPDATE 3 用例 | 08 轮先查重后识别目标 → UPDATE 不可达（假阳性 mock） | 真实可达 UPDATE、第二冲突拒绝、目标查询异常 fail-closed |
| 直接导入混合批次/内部错误（保留） | —（08 轮已通过） | 保留回归 |
| 前端生产常量 2 用例 | 08 轮影子常量 + 恒真断言 | 导入生产常量 + 页面使用路径验证 |

保留 08 轮全部有效回归：共享人员解析、列白名单、逐行 safeParse、迁移阶段顺序、状态显示、isCurrent、未匹配 API、鉴权、文件流、Python 隔离。

---

## 九、实际修改文件清单

**新建（本轮）**：
- `server/services/personnelInsurancePolicyService.js`（共享当前有效冲突服务）

**已修改（本轮）**：
- `server/services/businessDay.js`（导出带括号 `BUSINESS_DAY_SQL` 常量）
- `server/routes/insurance.js`（业务日常量导入/真值表共享构造/rank 修复/hasExpired 修复/六写入口冲突服务/generate 权限计数/overview 共享口径/内存规范化/导出新纯函数）
- `server/routes/import.js`（业务日常量导入/冲突检查移到目标识别后/行上下文分离/结构化错误/三路径白名单+行号/fail-closed）
- `server/__tests__/personnel-insurance.unit.test.js`（新增真值表矩阵/业务日契约/冲突服务/generate/内存规范化/overview 等 35 用例 + 更新旧断言）
- `server/__tests__/import-personnel-behavior.unit.test.js`（更新 mock 序列 + 新增同目标 UPDATE 3 用例，17 用例）
- `安全看板vben/apps/web-antd/src/api/hse/insurance.ts`（导出 `PERSONNEL_INSURANCE_TYPES` 生产常量）
- `安全看板vben/apps/web-antd/src/views/insurance/personnel/index.vue`（下拉由生产常量渲染）
- `安全看板vben/apps/web-antd/src/api/hse/__tests__/personnel-type.test.ts`（删除影子常量/恒真断言，导入生产常量）

**说明**：仓库仅跟踪 17 个文件（代码目录本就未纳入 git），上述文件 git 状态多为未跟踪（`??`）——仓库既有状态，非本轮创建。用户并行修改的 7 个文件未触碰。

---

## 十、验收标准逐条对照（第 11 节 12 项）

| # | 验收标准 | 结果 |
|---|---|---|
| 1 | 业务日 SQL 为 `(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date`，人员 SQL 无裸 CURRENT_DATE/错误表达式 | ✅ 常量集中 + guard 测试 |
| 2 | 单险种真值表 SQL/JS 完全等价，日期不完整/非法一律 rank 3 且不被 DB 判 expired | ✅ 矩阵 15 行 + hasExpired 真正条件 |
| 3 | 人员四态、`/personnel/stats`、`/stats/overview.personnel` 同口径，恒等式成立 | ✅ buildPersonnelStatsPivotSql 共享 + 测试 |
| 4 | 所有写入口（DB+内存）用同一规范险种与冲突服务 | ✅ 六入口表（见第六节） |
| 5 | 通用导入同目标 UPDATE 真实可达；排除后另一冲突拒绝；查询异常 fail-closed | ✅ 3 用例（含 excludeId 参数断言） |
| 6 | 三条写路径保留行上下文，结构化安全错误不泄漏内部文本 | ✅ buildWriteItem + rowErrors 对象 + 测试 |
| 7 | 单条创建内存分支不保存非规范险种 | ✅ 工伤险→工伤保险测试 |
| 8 | generate-from-pending 角色门槛、实际计数、部分成功、安全错误 | ✅ 3 用例 |
| 9 | 前端页面和测试共享生产常量，无影子常量/恒真断言 | ✅ personnel-type.test.ts 重写 |
| 10 | 08 轮有效成果、迁移脚本、回归全部保留 | ✅ 迁移 SQL 未动；回归全绿 |
| 11 | 完整测试、detectOpenHandles、typecheck、Vitest、仓库外构建、git diff --check 全过 | ✅ 全部 0 |
| 12 | 未连库、未迁移、未碰真实文件、未启动服务、未跑 Python/E2E、未覆盖用户修改、未删文件、未建提交 | ✅ 见副作用核查 |

---

## 十一、未完成项、残余风险与下一阶段准入结论

**未完成项（非阻断）**：
- 数据库层无"同员工同险种当前有效唯一"约束（防止时间区间重叠的唯一索引需考虑日期区间与并发，本轮仅应用层冲突服务 + 离线迁移草案核验清单，未执行）。
- `EmployeeSelector` 的 `filterStatus` 后端契约仍不可靠（依赖保存时 resolveEmployee 兜底校验，沿用 07/08 轮声明）。

**残余风险**：
- 应用层冲突检查在并发导入同一员工同险种时存在竞态窗口（数据库无唯一约束兜底）——已在报告中如实说明，不虚构"由数据库约束兜底"。
- 迁移 SQL 未执行，存量数据未验证。

**下一阶段准入结论**：12 项验收标准全部满足，**可进入车辆主数据联动扫描**。建议车辆模块沿用已建立模式：共享解析器/冲突服务/状态纯函数/列白名单/行为测试优先。

---

## 十二、声明

本轮：**未连接数据库（含只读）**、**未执行任何迁移**、**未访问真实上传文件**、**未启动或终止服务**、**未运行真实 Python/数据库集成/E2E**、**未删除任何文件**、**未覆盖用户并行修改**、**未创建提交**、**未推送远端**。所有数据库行为均通过 Jest mock 验证；导入测试全部使用内存工作簿或 mock 文件解析。

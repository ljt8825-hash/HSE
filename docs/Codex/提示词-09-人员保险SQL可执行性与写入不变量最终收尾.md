# 提示词 09：人员保险 SQL 可执行性与写入不变量最终收尾

你是本项目的高级全栈工程师。请在当前工作区执行本提示词，并在完成后生成规定的 Markdown 执行报告。不要只给方案；应在安全边界内完成代码修改、隔离行为测试和静态验证。

本轮是执行报告 08 的最终验收整改轮。**本轮通过前不得进入车辆主数据联动，也不得扩展其他业务模块。** 第 08 轮新增的共享人员解析器、业务日服务、险种字典、列白名单和逐行导入必须保留；本轮专门修复仍会导致真实 PostgreSQL 失败、DB/内存口径分裂、正常更新被拒绝和错误信息泄漏的问题。

## 一、开始前必须复述的审核结论

执行前先在终端复述，并在最终报告中原样记录：

1. `docs/Codex/执行报告-08-人员保险最终行为验收与险种字典收口.md` 经 Codex 审核只能判为 **部分通过**，不能判为“通过”，当前不得进入车辆模块。
2. Codex 已实际复跑：后端 `17/17` 套件、`339/339` 用例通过；前端 typecheck 退出码 0；前端 Vitest `3/3` 文件、`12/12` 用例通过；语法检查和 `git diff --check` 通过。绿色结果属实，但测试仍在验证错误 SQL 字符串或构造真实数据库不可能出现的 mock 状态。
3. 已完成且必须保留的成果包括：稳定 `employee_id` 关联、共享 `employeeResolver`、`Asia/Shanghai` Node 业务日、人员保险双险字典、通用导入数据库列白名单、直接导入逐行 `safeParse`、互斥人员级四态的设计、迁移阶段顺序、前端按后端状态显示与准确 `isCurrent` 回显。
4. 当前首要阻断是业务日 SQL 写为 `CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai'::date`。缺少括号会使 PostgreSQL 优先尝试把字符串 `'Asia/Shanghai'` 转成 `date`，而不是把 `AT TIME ZONE` 的结果转为日期；正确表达式必须是 `(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date`。
5. 通用导入当前在识别同一保单 UPDATE 目标前先查“重复当前保单”，真实数据库会查到目标自身并返回 `duplicate_active_policy`，导致正常更新不可达；现有 UPDATE 测试通过 mock 强行让查重为空、随后冲突查询又命中同一行，属于不可能状态。
6. 本轮不连接、读取或修改真实数据库，不执行迁移，不读取或改动真实上传文件，不运行真实 Python、数据库集成测试或浏览器 E2E，不启动或终止用户服务，不删除文件，不创建提交，不推送远端。

## 二、必须自行复核的已确认问题

逐项阅读当前代码和测试，并在报告中给出“确认/有差异/已被并行修改”的代码位置与证据。不得只复制本提示词。

1. `server/routes/insurance.js` 的 `BUSINESS_DAY_SQL` 是缺括号的无效/错误类型转换表达式；主列表、stats、查重和 expiring-soon 都复用了它。现有测试反而精确期待这个错误字符串，没有验证 PostgreSQL 表达式的运算顺序。
2. `server/routes/import.js` 的人员保险查重仍使用裸 `CURRENT_DATE`；`server/routes/insurance.js` 的 `/stats/overview` 人员临期查询也仍使用裸 `CURRENT_DATE`，其余 overview 人员查询使用错误的无括号表达式。报告所称“personnel 相关全部替换”与代码事实不符。
3. 内存 `insuranceRecordRank` 与 SQL `policyPivotSql` 对日期不完整/非法记录仍不等价：SQL 未来分支不要求 `expire_date`，历史分支不要求 `start_date`，两侧也没有在 rank 1/2 统一要求 `start_date <= expire_date`。缺止期的未来记录、缺起期的历史记录或起期晚于止期的记录仍可能被排为未来/历史，而不是 rank 3。
4. `personLevelSql.hasExpired` 使用“非当前有效且 `expire_date < 业务日`”，会把 `is_current=false`、缺起期或非法日期记录判为 expired；JS `calcInsuranceStatus/calcPersonStatus` 对这些记录判为 uninsured。DB 和内存四态仍不等价。
5. 通用导入预处理先执行重复当前保单查询，之后才按 `employee_id + insurance_type + policy_no` 查询 UPDATE 目标。导入同一当前保单时会被自己的记录拦截，正常 UPDATE 不能发生。
6. 通用导入 UPDATE 测试先 mock“查重无命中”，随后又 mock“同一 employee/type/policy 已存在”，这个状态在相同真实数据快照下不成立，因而是假阳性。
7. 通用导入在 `projectToDbColumns` 后丢失 `_import_row_no`。批量 INSERT 失败后逐行写入再次失败时，无法返回原始行号；同时 `rowErrors` 直接拼接 `e2.message`，会向前端泄漏数据库列名、连接信息等内部错误。UPDATE 失败则只增加 `skipped`，没有结构化行错误。
8. “同员工同险种不能存在并行当前有效保单”只在直接导入和通用导入分别手写。单条创建、更新时重新激活/换人/换险种、内存模式创建更新以及 `generate-from-pending` 没有共享同一冲突规则，业务不变量可从其他入口绕过。
9. 单条创建的内存分支没有调用 `normalizeInsuranceType`，可把 `工伤险` 原样写入内存，随后因透视只识别 `工伤保险` 而不可见。报告所称单条创建 DB+内存均规范化不属实。
10. `/personnel/generate-from-pending` 没有与其他写接口一致的 `requireRole('admin','safety_manager')`；`generated++` 按人员循环增加而不是按实际写入保单数增加，零写入也可能报告成功；catch 还把 `e.message` 放入响应。
11. `/stats/overview.personnel` 仍按 `personnel_insurance` 记录数和简单到期日统计，不以当前花名册人员为主，也没有复用互斥人员级四态；它与 `/personnel/stats` 的人数口径不同，`pending` 还始终为默认 0。
12. 前端 `personnel-type.test.ts` 在测试文件内部自建 `SUPPORTED_FRONTEND_TYPES`，页面仍硬编码 `<SelectOption>`；`expect('工伤保险').toBe('工伤保险')` 没有验证任何生产代码，属于影子测试。

若代码已被用户并行修改，以当前代码为准，合并而不是覆盖，并在报告中说明差异。

## 三、执行边界

1. 先运行 `git status --short`，记录现有脏工作区；用户已有修改和未跟踪文件全部保留。
2. 所有手工修改使用 `apply_patch`。不得执行 `git reset --hard`、`git checkout --`、`git clean`、递归删除或覆盖现有构建产物。
3. 不得读取或输出 `.env`、密码、Token、密钥、连接串、身份证号或真实业务文件内容。
4. 不得连接数据库，包括只读连接。所有数据库行为只能通过 Jest mock 和静态 SQL 契约验证。
5. 不得安装新的 SQL 解析器或其他依赖来绕过本轮任务；优先把 SQL 构造收敛为少量静态、可精确测试的生产函数。
6. SQL/schema 文件只能编辑和静态复核，不得执行，也不得让应用启动或路由自动迁移。
7. 不得实际上传、下载、解析、复制、移动或删除用户文件；导入测试只使用内存工作簿或完全 mock 文件解析。
8. 不得运行真实 Python、数据库集成测试或浏览器 E2E，不得启动前后端服务。
9. 不得通过吞异常、弱化断言、仅搜索源码、构造不可能 mock 状态、`--forceExit`、跳过测试或扩大超时来宣称通过。
10. 不重做 Vben Admin/Ant Design Vue，不做无关视觉统一，不开发车辆、培训、事故、驾驶舱、AI 等其他模块。

## 四、任务 1：修正并集中管理可执行的业务日 SQL

1. 将 DB 业务日常量移入 `server/services/businessDay.js`，与 `getBusinessDayStr` 同一模块导出；`insurance.js`、`import.js` 只能导入使用，不得各自复制文字常量。
2. 唯一允许的 PostgreSQL 业务日表达式为：

```sql
(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date
```

3. 所有引用 `personnel_insurance` 的状态、选单、查重、主列表、COUNT、stats、overview、expiring-soon SQL 都使用该常量或由它构造的共享表达式。不得残留裸 `CURRENT_DATE`，也不得残留无括号的 `AT TIME ZONE 'Asia/Shanghai'::date`。
4. 可以保留车辆和其他保险模块的既有 `CURRENT_DATE`，本轮不要顺带改动它们；扫描测试必须只约束人员保险相关 SQL。
5. 增加 SQL 安全契约测试：
   - 精确断言常量等于正确带括号表达式；
   - 明确拒绝正则 `AT TIME ZONE\s+'Asia/Shanghai'::date`；
   - 对本轮可触达的所有人员保险 SQL 调用执行同一 guard，出现裸 `CURRENT_DATE` 或错误表达式即失败；
   - 不得把“测试期待值”和生产错误字符串一起改成另一个错误值来伪造通过。

## 五、任务 2：让单险种状态、选单和人员四态使用同一真值表

### 2.1 唯一单险种真值表

为 JS 与 SQL 建立以下唯一事实，不允许各自自由推导：

1. `active`：`is_current=true`，起止日期都存在，`start_date <= expire_date`，且 `start_date <= businessDay <= expire_date`。
2. `future`：`is_current=true`，起止日期都存在，`start_date <= expire_date`，且 `start_date > businessDay`。
3. `expired`：`is_current=true`，起止日期都存在，`start_date <= expire_date`，且 `expire_date < businessDay`。
4. `inactive_or_invalid`：`is_current=false/NULL`、任一日期缺失、起期晚于止期或其他非法事实。

对应展示：active 再按 0–30/31+ 天分为 expiring/insured；future 与 inactive_or_invalid 为 uninsured；expired 为 expired。对应排名：active=0、future=1、expired=2、inactive_or_invalid=3。

### 2.2 收敛实现

1. 在生产代码中建立共享 SQL 构造，例如 `policyStateSql(alias)`，返回 active/future/expired/expiring 等表达式；`policyPivotSql`、`activePolicySql`、`personLevelSql`、stats 和筛选复用它。
2. `policyPivotSql` 的 rank 1/2 必须同时要求 `is_current=true`、起止日期都存在且 `start_date <= expire_date`。
3. `insuranceRecordRank` 使用同一条件，不能只判断一侧日期。
4. `personLevelSql.hasExpired` 必须是“任一被选险种满足真正 expired 条件”，不能再使用 `NOT active AND expire_date < businessDay`。
5. `calcInsuranceStatus`、`calcPersonStatus`、DB list/COUNT、`/personnel/stats` 和 `/stats/overview.personnel` 必须对应同一真值表。

### 2.3 等价性测试

建立表驱动矩阵，至少包含：

- 当前有效、未来、历史；
- `is_current=false` 的有效区间/未来/历史；
- 缺起期、缺止期、两者都缺；
- 起期晚于止期且止期已过；
- 起期晚于止期且起期在未来；
- 当天生效/当天到期、第 30 天/第 31 天。

每行明确期望 child status、rank 和 person status。SQL 契约必须精确验证每个 rank/status 分支都含完整有效日期条件；只检查 `OR`、`AND NOT` 或某个字符串存在不合格。

## 六、任务 3：建立覆盖全部写入口的当前保单冲突服务

1. 提取单一生产服务，例如 `server/services/personnelInsurancePolicyService.js`，集中处理规范险种、业务日、当前有效冲突查询和安全 reason。不得在五个路由入口继续复制不同查重 SQL。
2. 提供类似以下语义的接口（名称可按代码习惯调整）：
   - `findActivePolicyConflict({ employeeId, insuranceType, excludeId, db })`；
   - `excludeId` 用于更新现有记录时排除自身；
   - 查询异常返回稳定 `duplicate_check_failed` 或抛内部错误给调用方安全收敛，必须 fail-closed。
3. 单条创建、单条更新、直接导入、通用导入、`generate-from-pending` 全部使用同一冲突服务；内存模式调用等价纯函数/检查，不能绕过。
4. 单条更新时，若本次可能使记录成为当前有效，或改变 employee/type/date/isCurrent，必须先读取现有行、合并出“更新后的完整事实”，再以 `excludeId=当前记录ID` 检查冲突。禁止仅检查请求中出现的局部字段。
5. 单条创建和内存创建必须先规范化险种；`工伤险` 最终只能保存为 `工伤保险`。
6. `generate-from-pending` 增加与其他人员保险写接口一致的 `requireRole('admin','safety_manager')`，复用规范化与冲突服务；查询/写入异常只返回安全 reason/message。
7. 并发竞态和数据库约束仍可作为明确残余风险，本轮不执行约束迁移；但不能让任何现有应用写入口在串行场景下绕过不变量。

## 七、任务 4：修正通用导入同目标 UPDATE 和错误上下文

### 4.1 正确识别 UPDATE 目标

1. 人员保险导入必须先确定相同 `employee_id + canonical insurance_type + policy_no` 的既有目标，再执行当前有效冲突检查。
2. 若命中明确 UPDATE 目标，冲突查询必须 `excludeId=目标ID`；若还有另一张当前有效保单，拒绝为 `duplicate_active_policy`；若无其他冲突，允许更新目标。
3. 若没有 UPDATE 目标，则按插入场景检查全部当前有效保单。
4. 空保单号不能作为不稳定 UPDATE 标识；应按已定义策略插入前查重并拒绝并行当前有效记录。
5. 冲突目标批量查询失败必须 fail-closed，不能记录日志后把 `existingMap` 当空继续 INSERT。当前通用代码的 catch 降级行为需对 personnel 单独收紧，其他模块保持原状。

### 4.2 数据与上下文分离

1. 白名单投影后继续携带独立上下文，例如 `{ dbRow, sourceRowNo, sourceEmployeeCode }`；不得重新把 `_import_*` 塞回 `dbRow`。
2. 批量 INSERT、逐条降级 INSERT、UPDATE 三条路径都能从上下文获得原始行号和安全员工标识。
3. 所有通用导入 `rowErrors` 改为稳定结构化对象，例如 `{ row, reason, message, employeeCode }`，不要继续返回自由文本数组。
4. 批量/逐条/UPDATE 的数据库异常只允许在服务端日志记录详细 `e.message`；响应使用 `write_failed`/`update_failed` 等稳定 reason 和通用中文提示，不得泄漏列名、SQL、host、port 或连接信息。
5. 计数必须准确：成功 INSERT/UPDATE、失败/skipped、rowErrors 数量与实际行结果一致；file record 状态不得把部分失败伪装成全成功，按当前 API 能力给出明确的 partial 语义。

### 4.3 真实可达的测试序列

1. UPDATE 测试必须让同一次真实状态查询同时满足“目标行存在”和“排除目标后无其他当前有效冲突”，不得再先返回查重空、后返回同目标存在。
2. 另加“目标存在 + 另一张当前有效保单存在”用例，必须拒绝且不 UPDATE。
3. 目标查询异常、冲突查询异常、批量 INSERT 失败后逐条失败、UPDATE 失败都必须有行号和安全 reason，响应不含模拟敏感错误文本。
4. 测试要断言查询参数中包含正确的 `excludeId`，证明不是靠 mock 顺序偶然通过。

## 八、任务 5：统一 overview、规则生成计数和前端生产常量

### 5.1 `/stats/overview.personnel`

1. 人员概览统计以当前花名册人员为主，复用 `/personnel/stats` 的确定性双险透视和人员级互斥四态，不再按保险记录数简单统计。
2. `total/covered/expired/expiring/pending` 含义与 `/personnel/stats` 一致，并满足 `total = covered + expired + pending`；`expiring` 是 covered 子集。
3. 抽取共享查询构造或共享统计函数，避免两个 endpoint 以后再次分叉；不要在路由中复制第二套长 SQL。
4. DB 与内存模式返回同样字段和口径；若 overview 当前无内存分支，则至少明确、安全地复用已有人员 stats 计算，而不是保留旧记录数逻辑。

### 5.2 `generate-from-pending`

1. `generated` 表示实际成功写入的保单记录数，不是处理的人员数；零插入不能报告成功 1 条。
2. 返回结构中明确 processed/generated/failed/rowErrors（或与现有 API 兼容的等价字段），每个失败可定位且不含内部错误。
3. 同一人员规则生成两个险种时，成功数应增加 2；其中一条重复、一条成功时应准确反映部分结果。

### 5.3 前端险种生产常量

1. 新建或复用前端生产模块导出人员保险允许险种，例如 `PERSONNEL_INSURANCE_TYPES`，页面新增/编辑下拉实际通过该常量渲染。
2. `personnel-type.test.ts` 必须导入生产常量，不得在测试中自建同名数组。
3. 删除 `expect('工伤保险').toBe('工伤保险')` 这类恒真测试；测试应验证生产常量内容、页面选项使用路径或生产规范化映射。
4. 保持 Vben Admin/Ant Design Vue 原组件和现有页面布局，不做视觉改造。

## 九、任务 6：新增能在当前实现上失败的验收测试

所有测试必须 mock DB、文件系统和子进程，至少覆盖：

1. 正确业务日 SQL 带括号；当前错误表达式、人员 SQL 中裸 `CURRENT_DATE` 均会触发测试失败。
2. 单险种真值表完整矩阵；缺起期历史、缺止期未来、停用历史和非法日期在 SQL/内存都不能成为 expired/future。
3. DB `hasExpired` 与 JS child status 等价；inactive expired 人员只能是 uninsured，不能 DB=expired、内存=uninsured。
4. `/personnel/stats` 与 `/stats/overview.personnel` 使用同一人数口径和互斥状态，恒等式成立。
5. 单条创建、更新排除自身、直接导入、通用导入、规则生成和内存模式均执行同一冲突规则。
6. 通用导入同一当前保单可 UPDATE；存在第二张当前有效保单时拒绝；目标/冲突查询异常 fail-closed。
7. 批量/逐条/UPDATE 失败均保留原始行号并返回结构化安全错误；响应不含模拟的列名、SQL、地址、端口或连接文本。
8. 单条内存创建 `工伤险` 后实际保存为 `工伤保险`，主透视可见。
9. `generate-from-pending` 角色门槛、实际写入计数、部分成功计数和错误收敛。
10. 前端测试直接导入生产险种常量，页面由同一常量渲染，不再有影子常量/恒真断言。
11. 保留第 08 轮有效回归：共享人员解析、列白名单、逐行 safeParse、迁移阶段顺序、状态显示、`isCurrent`、未匹配 API、鉴权、文件流及 Python 隔离。

不得复制一套测试专用业务逻辑来“证明”等价。对 SQL 采用生产构造函数的精确契约和全入口 guard；对路由采用可达的 mock 数据状态与参数断言。报告必须说明每项新增测试在当前第 08 轮实现上为何失败。

## 十、验证命令

先执行本轮新增/修改目标测试，再执行完整门槛。在报告中记录真实命令、退出码、套件数、用例数和摘要：

```powershell
node --check server/routes/insurance.js
node --check server/routes/import.js
node --check server/schemas/insurance.js
node --check server/services/businessDay.js
node --check server/services/employeeResolver.js
node --check server/services/insuranceTypeDict.js
node --check server/services/personnelInsurancePolicyService.js
node --check server/app.js
npm --prefix server run build
npm --prefix server run test -- --runInBand
npm --prefix server run test -- --runInBand --detectOpenHandles
pnpm --dir "安全看板vben/apps/web-antd" run typecheck
git diff --check
git status --short
```

附加要求：

1. 运行人员状态、险种生产常量和 `useEmployeeData` 的前端 Vitest，报告写出实际完整命令、文件数和用例数。
2. 若修改前端运行时代码，在仓库外新建空目录作为 `outDir` 做一次生产构建；不得删除、覆盖或复用仓库内现有 `dist`。
3. 若实际服务文件名称与建议不同，调整相应 `node --check` 命令并在报告说明，不要保留不存在路径后声称执行成功。
4. 若任何命令失败，报告结论只能是“部分通过”或“未通过”；不得伪造成功。
5. 测试日志中如出现数据库连接、Python 执行、真实文件写入、open handle 或服务启动迹象，必须查明来源并记录。

## 十一、验收标准

只有同时满足以下条件，执行报告 09 才可写“通过”：

1. 人员保险唯一业务日 SQL 为 `(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date`，所有人员 SQL 无裸 `CURRENT_DATE` 和错误无括号表达式。
2. 单险种 active/future/expired/invalid 真值表在 SQL 与 JS 完全等价，日期不完整/非法记录一律 rank 3 且不被 DB 判为 expired。
3. 人员级四态、`/personnel/stats` 和 `/stats/overview.personnel` 复用同一人数口径与表达式，恒等式成立。
4. 所有人员保险写入口，包括 DB 和内存模式，使用同一规范险种与当前有效冲突服务。
5. 通用导入同目标 UPDATE 在真实可达状态下成功，排除自身后发现另一冲突则拒绝，查询异常 fail-closed。
6. 通用导入三条写路径保留原始行上下文，返回结构化安全错误，不泄漏内部数据库文本。
7. 单条创建内存分支不会保存非规范险种。
8. `generate-from-pending` 有正确角色门槛、实际保单写入计数、部分成功语义和安全错误。
9. 前端页面和测试共享生产险种常量，不存在测试自建影子常量或恒真断言。
10. 第 08 轮有效成果、迁移脚本和现有回归全部保留。
11. 后端完整测试、detectOpenHandles、前端 typecheck、目标 Vitest、仓库外构建和 `git diff --check` 全部通过。
12. 未连接数据库、未执行迁移、未访问真实上传文件、未启动服务、未运行真实 Python/E2E、未覆盖用户修改、未删除文件、未创建提交或推送。

任一项未满足，报告必须写“部分通过”或“未通过”，并把阻断项列在最前。不得建议进入车辆开发。

## 十二、执行报告要求

完成后必须生成：

`docs/Codex/执行报告-09-人员保险SQL可执行性与写入不变量最终收尾.md`

报告至少包含：

1. 开始前审核结论原样复述。
2. 第 2 节 12 项问题逐项复核，附当前代码位置和事实证据。
3. 最终业务日 SQL、单险种真值表、选单 rank、人员四态和统计恒等式。
4. 全部人员保险写入口清单，说明各入口如何使用共享规范化和冲突服务。
5. 通用导入 INSERT/UPDATE 决策顺序、`excludeId` 语义、行上下文和结构化错误格式。
6. `/personnel/stats` 与 `/stats/overview.personnel` 的共享口径说明。
7. `generate-from-pending` 的权限、计数和部分成功语义。
8. 新增/修改测试清单，说明每项在第 08 轮实现上为何失败、修复后验证什么。
9. 所有验证命令的真实退出码、套件数、用例数和关键日志核查。
10. 实际修改文件清单、未完成项、残余风险和是否允许进入车辆扫描的明确结论。
11. `git status --short` 相关摘要，区分本轮修改与用户原有修改；禁止声称提交。

最终只生成上述执行报告，不要创建额外总结文档，不要创建 Git 提交。执行报告 09 返回给 Codex 复审后，再决定是否进入车辆主数据联动扫描。

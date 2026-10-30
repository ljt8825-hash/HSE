# B-1-P1-03-02-R1 · 人员资格统一实施缺陷修复报告

> 节点：B-1-P1-03-02 返修（针对独立代码审查发现的问题，最小范围修复）
> 仓库：`https://github.com/ljt8825-hash/HSE`｜分支：`feat/b02-dec-03.13-a02d-status-code`
> 基线：业务 `b6c57c7` + 报告 `6f7c577`（P1-03-02）｜起始 HEAD：`6f7c577`
> 业务提交：`547f2db`（3 文件 +251/−80）｜报告提交：本文件
> 日期：2026-10-30

---

## 一、R1-01 · resolveSignee SQL 别名错误（阻断级）修复

### 修复前（b6c57c7 缺陷代码）

```js
const base = "employee_deleted=false AND assignment_status='active' AND "
  + formalEmployeeEligibilitySql('ev');            // 生成 fe.id = ev.employee_id
if (employeeId) {
  const r = await pool.query(
    `SELECT employee_id, name, org_unit_id, org_name
     FROM v_employee_current                        // ← 未定义别名 ev ⇒ 运行时必报
     WHERE ${base} AND employee_id=$1`,             //    missing FROM-clause entry for table ev
    [employeeId]);
```
四条查询（employeeId / employeeCode / idCard / name）同型缺陷——资格过滤上线即不可用。

### 修复后（547f2db）

```js
const base = "ev.employee_deleted=false AND ev.assignment_status='active' AND "
  + formalEmployeeEligibilitySql('ev');
// 四条查询统一：SELECT ev.employee_id, ev.name, ev.org_unit_id, ev.org_name
//               FROM v_employee_current ev WHERE ${base} AND ev.employee_id=$1 …
```
- 四条查询统一定义 `ev` 别名；`employee_deleted / assignment_status / employee_id / employee_code / id_card / name / org_unit_id / org_name` 全部字段引用与别名一致；
- 正式员工资格过滤保持；解析顺序（ID→工号→身份证→姓名）与唯一性判断（idCard/name 须恰好 1 行）不变；返回结构与错误语义不变。

## 二、R1-02 · 保险待参保生成接口资格校验

### 修复前

`generateFromPending` 对客户端传入的 ids 仅查 `v_employee_current WHERE employee_id=$1` 后直接进入规则匹配与 INSERT——**服务端无任何资格校验**，直传辞职人员 ID 即可生成正式员工待参保保单。

### 修复后（547f2db，`insurancePersonnelService.js`）

在人员存在性检查之后、规则匹配之前，逐人增加服务端资格校验：

```js
const relR = await pool.query(
  'SELECT employment_relation FROM employee WHERE id = $1 AND is_deleted = false', [id]);
const rel = relR.rows.length ? relR.rows[0].employment_relation : undefined;
if (rel !== '正式员工') {
  const relText = rel == null ? 'NULL（待核实）' : (String(rel).trim() === '' ? '空' : String(rel));
  failed.push({ row: id, reason: 'not_formal_employee',
    message: `人员ID${id}: 非花名册正式员工（用工关系=${relText}），不生成正式员工待参保记录` });
  continue;
}
```

满足任务书全部 7 条要求：
1. 正式员工专属流程 ✔（与 pendingList/保险主列表同口径）
2. 服务端再次校验 ✔（employee 表直查，与视图双重来源）
3. 不依赖前端筛选 ✔（直传 ID 拦截，测试 R1-04c）
4. 辞职/死亡/退休/NULL 一律拒绝 ✔（`!== '正式员工'` 精确等值，NULL 天然不命中）
5. 原生成流程/重复保单检查/规则匹配/错误返回结构不变 ✔（校验仅在流程入口前置拦截，`{row, reason, message}` 沿用既有 failed 结构）
6. 历史保单不改动 ✔（零 UPDATE/DELETE）
7. 混合批次逐人处理 ✔（原 for 循环 + continue 结构天然支持，测试 R1-04d 实证）

## 三、R1-03 · resolveSignee 运行时测试证据（真调用，非文本断言）

`objectiveService` 导出 `resolveSignee`（仅供测试；既有接口零变化），mock pool.query 捕获实际 SQL + **dev 库只读真实执行**双重验证：

### 单测（employee-selection-formal-gate.unit.test.js，20/20 绿）

| 用例 | 验证 | 结果 |
|---|---|---|
| R1-01a employeeId 路径 | 返回正式员工行；SQL 含 `FROM v_employee_current ev`、`ev.employee_deleted=false`、`fe.id = ev.employee_id`、`AND ev.employee_id=$1`、参数 `['6887']` | ✅ |
| R1-01b employeeCode 路径 | `ev.employee_code ILIKE $1`、参数 `['E001']` | ✅ |
| R1-01c idCard 路径 | `ev.id_card=$1`（唯一命中语义保持） | ✅ |
| R1-01d name 路径 | `ev.name=$1` | ✅ |
| R1-03e 辞职人员拒绝 | 0 行 → null；SQL 确实携带 `fe.employment_relation = '正式员工'`（防 mock 掩盖缺条件） | ✅ |
| R1-03f NULL 拒绝 | 0 行 → null；断言 SQL 为精确等值且**不含 IS NULL 放行** | ✅ |
| R1-03g 同名多人 | name 路径 2 行 → null（唯一性规则保持） | ✅ |
| R1-03h 全 SQL 别名断言 | 四路径捕获的全部 SQL：`toContain('FROM v_employee_current ev')` 且 `not.toMatch(/FROM v_employee_current\s+WHERE/)` | ✅ |

### dev 库只读真实执行（修复后 SQL 文本原样，`BEGIN TRANSACTION READ ONLY`）

```
p1_employeeId(6887)=1          ← 正式员工经 ID 解析成功
p2_employeeCode(first2)=121    ← 工号路径执行正常（121 个尾号匹配候选）
p3_idCard(nonempty)=1          ← 身份证路径执行正常
p4_name(艾炳升)=1              ← 姓名唯一匹配成功
p5_resigned_via_gate(8095)=0   ← 辞职人员（段仍 active）经资格门 0 行
p6_gate_total=1291             ← 资格门总数 = 花名册正式员工数
```
全部语句在 `ON_ERROR_STOP=1` 下成功执行——**不存在未定义别名**。

## 四、R1-04 · 待参保生成接口测试证据（真调用 generateFromPending）

| 用例 | 验证 | 结果 |
|---|---|---|
| R1-04a 正式员工进入原流程 | 资格通过 → 规则匹配（成人默认方案）→ INSERT 发生、generated≥1、无 not_formal_employee | ✅ |
| R1-04b 辞职/NULL/退休逐人拒绝 | processed=3、generated=0、零 INSERT、三条 not_formal_employee 且 NULL 显示「待核实」 | ✅ |
| R1-04c 直传非正式 ID 不绕过 | 视图行存在（段 active）仍被服务端拦截：零 INSERT + `not_formal_employee` | ✅ |
| R1-04d 混合批次 | ids=[101 正式, 201 辞职]：processed=2、101 正常 INSERT、201 明确失败（message 含「辞职」）、合格者不受影响 | ✅ |
| R1-04e 原语义保持 | 不存在人员仍 `employee_not_found`；重复保单检查/规则匹配代码未触碰（diff-tree 佐证） | ✅ |

## 五、R1-05 · 弱断言修复

| 原问题（b6c57c7 版测试） | 修复 |
|---|---|
| buildRosterWhere 测试 `try{...}catch{}吞错 + if(rosterSql) 条件断言`——SQL 未触发时静默通过 | 重写：经 `rosterStats({})` **真实调用链**触发；断言目标 SQL **必须存在**（`expect(rosterSql).toBeDefined()`）且含 `FROM v_employee_current e`、`fe.id = e.employee_id`、资格条件——任一不满足即失败 |
| resolveSignee 只读文件文本 | 导出函数 + 8 例真调用行为测试（见 §三） |
| 无意义变量（`const { default: isBool } = { default: 1 }`）与空 catch | 删除 |
| todos 断言无失败条件 | 保留文件级断言但语义明确（切片区间定位两个 handler 的源码文本） |

## 六、测试结果与基线对照

| 层 | R1 修复后 | 基线（b6c57c7/6f7c577） | 对照 |
|---|---|---|---|
| formal-gate 单测 | **20/20 绿** | 11/11 绿 | 重写净增 9 例，覆盖从「SQL 文本」升级为「真调用行为」 |
| 员工域 10 套件 | **278/278 绿** | 269/269 绿 | +9 一致，零劣化 |
| 全量 jest（多 worker） | **787 通过 / 3 用例失败 / 8 套件失败**（790，45 套件） | 778/3/8（781，44 套件） | 失败**完全一致零劣化**；基线失败（insurance-file/personnel-insurance OOM、hse-violation-assessment parse）为既有问题 |

## 七、Git 交付

| 项 | 值 |
|---|---|
| 业务代码 commit | **`547f2db`**（diff-tree 精确核验：恰 3 文件——objectiveService.js、insurancePersonnelService.js、employee-selection-formal-gate.unit.test.js；cost.js/其他域零卷入） |
| 报告 commit | 本文件单独提交（SHA 见交付回复） |
| 分支 | `feat/b02-dec-03.13-a02d-status-code`（基于 6f7c577，未重写历史、未强制推送） |
| 远端 HEAD | push 后 fetch + `git status -sb` 核验（见交付回复） |
| GitHub | `https://github.com/ljt8825-hash/HSE/commit/547f2db` |

## 八、纪律核验

- cost.js：staged `A`、MD5 `e88ae2b0b275346dfc1431408aa00bff` 不变、不在提交树 ✔
- 完整性检查：6 处 = 基线既有 untracked 存量，零新增 ✔
- 敏感扫描（3 个改动文件 diff）：零命中 ✔
- 零 DDL/DML、零生产连接（dev 仅 READ ONLY 探针，脚本用后即删）✔
- 未改花名册文件 / employee_assignment 历史数据 / 历史回显逻辑 / H5/飞书/WPS/登录认证 / 事故培训业务口径 ✔
- pathspec 显式提交，未使用 `git add .`/`-A` ✔

## 九、回滚方案

`git revert 547f2db`（纯代码单提交，零数据/DDL 依赖）。
细粒度：R1-01 别名修复为独立函数体改动；R1-02 资格校验为独立代码块（删除该块即恢复原行为，但会使直传 ID 绕过缺口复现，不建议单独回退）。

## 十、未处理问题

1. 待确认项（沿用 P1-03-02 报告 §九）：事故 personnel-search 终态语义、driver-risk-center 过滤/权限、NULL 持段人员转正流程、selector/personnel-search/driver-risk-center 权限中间件缺口。
2. 本节点按任务书要求**不自行宣告验收通过**——已停止，提交独立代码审查。

## 十一、验收要求对照

| 要求 | 状态 |
|---|---|
| resolveSignee 四种解析路径运行正常 | ✅（单测 4 例 + dev 真实执行 4 路径） |
| SQL 不存在未定义别名 | ✅（R1-03h 全 SQL 断言 + dev ON_ERROR_STOP 全通过） |
| 待参保生成接口无法被非正式员工 ID 绕过 | ✅（R1-04c 服务端拦截实证） |
| 新增测试真实验证行为 | ✅（全部 mock pool 驱动真函数，无文件文本替代） |
| 员工域和全量测试无新增回归失败 | ✅（278 全绿；全量 8/3=基线） |
| 代码和报告分别推送 | ✅（见交付回复核验） |
| cost.js 等保护对象零漂移 | ✅（§八） |

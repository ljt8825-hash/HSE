# B-1-P1-03-02 · 人员选择资格统一实施报告

> 节点：B-1-P1-03-02（受控代码实施、测试和 GitHub 固化）
> 仓库：`https://github.com/ljt8825-hash/HSE`｜分支：`feat/b02-dec-03.13-a02d-status-code`
> 起始 HEAD：`0bf7800`（B-1-P1-03-01 审计报告提交）｜业务提交：`b6c57c7`｜报告提交：本文件
> 日期：2026-10-30

---

## 一、执行前后 Git 状态

| 项 | 实施前 | 实施后 |
|---|---|---|
| HEAD | `0bf7800`（=任务书指定前置，已验收） | `b6c57c7`（业务）→ 本报告提交 |
| 工作区 | 145 ?? / 1 A(cost.js) / 50 M（与 P1-03-01 收尾一致） | 上述 + 6 M（本节点修改）+ 1 新增测试 |
| cost.js | staged `A`，MD5 `e88ae2b0b275346dfc1431408aa00bff` | **不变**（diff-tree 文件列表 0 次命中，`git cat-file` 不在提交树） |
| 生产库 | 未连接 | 未连接（零生产写入）✔ |
| dev 库 | —— | 仅只读 SELECT（验证脚本）+ 测试框架既有 mock，**零 DDL/DML** ✔ |

## 二、花名册身份映射的实际证据（任务书特别要求，停止条件核查）

**结论：映射链路实证成立，停止条件未触发。**

| 证据 | 内容 |
|---|---|
| ① 落库脚本 | `server/scripts/import-employment-relation.cjs`（头注释「花名册『用工关系状态』导入 v2」）：读 Excel《员工信息维护_20260910140825》→ 取「**用工关系状态**」列（:55 `r['用工关系状态']`）→ 按 id_card_hash > employee_code 匹配 → `UPDATE employee SET employment_relation=$2, leave_date=$3…`（:84）/ 新建 INSERT（:95） |
| ② 源文件实测 | Excel 存在且可读（3,249 行），「用工关系状态」分布 = **正式员工 1,291 / 辞职 1,951 / 死亡 7** |
| ③ dev 库对照 | `employee.employment_relation`（is_deleted=false）分布 = **辞职 1,951 / 正式员工 1,291 / NULL 152 / 死亡 7** —— **三个数值与 Excel 完全一致**；NULL 152 = 花名册未覆盖的新增/未维护人员 |
| ④ 单向性佐证 | V1/V2 花名册导入**只读不写** employment_relation（`employeeImportV2Service.js:940-955` 仅 SELECT 带出供终态闸门；`employeeImportService.js:549-555` 同）；维护通道 = 员工信息维护 Excel 导入 + 终态登记/返聘服务（`employeeAssignmentService:776/1175`）+ 编辑接口 |
| ⑤ 口径一致性 | R4 冻结口径 `FORMAL_EMPLOYEE_ELIGIBILITY_SQL`（`assessmentTargetEligibility.js`，2026-09-14 CHECKPOINT-6 事故后确立）= `employment_relation='正式员工'` ⇔ 花名册明确列为正式员工；NULL/待岗/终态一律 false —— 与任务书规则 2/3/4 完全一致 |
| ⑥ 无推断路径 | 本次未新增任何姓名/岗位/组织推断；生成器 `assertColumn` 仅允许合法标识符（防注入） |

## 三、修改文件完整清单（业务提交 `b6c57c7`，7 文件 +246/−11）

| # | 文件 | 变更 |
|---|---|---|
| 1 | `server/services/employeeStatusDict.js` | +31：新增 `formalEmployeeEligibilitySql(alias)` 生成器（§四.1）并导出 |
| 2 | `server/services/assessmentTargetEligibility.js` | ±14：`FORMAL_EMPLOYEE_ELIGIBILITY_SQL` 改由 dict 生成，**默认输出与原 R4 常量逐字节一致**（node 实证 `BYTE_IDENTICAL: true`、`R4_CONSTANT_MATCH: true`），三处考核同步 SQL 行为不变 |
| 3 | `server/services/employeeSelectorService.js` | +22：`listSelector` 叠加正式员工资格；回显两方法加分类注释（不改 SQL） |
| 4 | `server/services/objectiveService.js` | +16：`buildRosterWhere`（在职台账）与 `resolveSignee`（新签订人）叠加资格条件；require dict |
| 5 | `server/routes/todos.js` | +8：`objectives:responsibility-unsigned` 与 `insurance:uncovered` 叠加资格条件 |
| 6 | `server/services/insurancePersonnelService.js` | +7：`pendingList` 叠加资格条件；require dict |
| 7 | `server/__tests__/employee-selection-formal-gate.unit.test.js` | 新增 159 行 11 例单测 |

## 四、关键代码 diff

### 4.1 统一口径生成器（employeeStatusDict.js，单一事实源）

```js
function formalEmployeeEligibilitySql(alias = 'v') {
  assertColumn(alias, 'formalEmployeeEligibilitySql');
  return `
    EXISTS (
      SELECT 1 FROM employee fe
       WHERE fe.id = ${alias}.employee_id
         AND fe.is_deleted = FALSE
         AND fe.employment_relation = '正式员工'
    )`;
}
```
未重复创建第二套口径：考核域原 R4 常量改为 `formalEmployeeEligibilitySql('v')`（字节一致实证），全仓正式员工判断收敛到本函数。

### 4.2 公共选择器（employeeSelectorService.js）

```js
// listSelector —— 新建业务候选列表
const conditions = ['ev.is_deleted = false', 'ev.is_current = true',
  formalEmployeeEligibilitySql('ev')];          // ← 本次新增
// getSelectorById / batchSelector —— SQL 完全未改，仅加「历史回显」分类注释
```

### 4.3 各业务入口同构叠加（示例 todos.js）

```js
'insurance:uncovered': async () => {
  const where = `
    FROM v_employee_current e
    WHERE e.employee_deleted = false
      AND e.name IS NOT NULL AND e.name <> ''
      AND ${formalEmployeeEligibilitySql('e')}    // ← 本次新增
      AND NOT EXISTS ( SELECT 1 FROM personnel_insurance p … )`;
```

## 五、业务入口资格分类与处理结果（任务书 §三.2 逐项标注）

| 入口 | 资格分类 | 处理 | 依据 |
|---|---|---|---|
| GET `/employees/selector`（新选候选） | **正式员工专属** | ✅ 加过滤 | 三违/网格/部门/会议/责任书/考核等新选场景；规则 2/3 |
| GET `/employees/selector/:id` | **历史回显** | ✅ 保持不变 | 任务书 §三.1.B 明示；规则 7 |
| POST `/employees/selector/batch` | **历史回显** | ✅ 保持不变 | 任务书 §三.1.C 明示；规则 7 |
| 事故人员搜索 `/personnel-search` | **HSE 全体作业人员（待确认）** | ⏸ 不改 | 事故当事人可含外包/劳务（规则 5）；业务用途不明确不擅改，登记待确认 |
| 培训计划人员批量查询 `trainingPlanService:403` | **HSE 全体作业人员** | ⏸ 不改 | 培训覆盖外包/劳务（规则 5/8）；仅 assignment_status='active' 口径维持 |
| 目标责任书新签订人解析 `resolveSignee` | **正式员工专属** | ✅ 加过滤 | 与考核对象 R4 口径同源（hse_target_contracts 挂考核域） |
| 目标责任书在职人员台账 `buildRosterWhere` | **正式员工专属** | ✅ 加过滤 | 「在职人员台账」= 花名册正式员工 × 签订状态；修复签订率分母虚大 |
| 待办 `objectives:responsibility-unsigned` | **正式员工专属** | ✅ 加过滤 | 随台账口径；1,806 终态人不再列为"未签"待办 |
| 待办 `insurance:uncovered` | **正式员工专属** | ✅ 加过滤 | 任务书：保险正式员工参保名单遵循现有正式员工规则 |
| 保险待参保名单 `pendingList` | **正式员工专属** | ✅ 加过滤 | 与保险主列表 `ACTIVE_ROSTER_JOIN`（insuranceShared:361，现有正式员工规则）对齐 |
| 驾驶员风险中心 `/drivers` | **历史展示/分析（待确认）** | ⏸ 不改 | 展示类列表，加过滤会使辞职驾驶员从风险分析消失（规则 7）；P1-03-01 提出的权限缺口独立登记 |
| 历史隐患责任人回显 `hazardService` | **历史回显** | ✅ 未触碰 | LEFT JOIN 展示路径 |
| 保险单据/考核既有对象快照 | **历史回显** | ✅ 未触碰 | 快照列 + 反向清理禁改（R4 作用域限定） |

## 六、测试与验收

### 6.1 新增单元测试（11 例全绿）

`server/__tests__/employee-selection-formal-gate.unit.test.js`——任务书 §五 场景映射：

| 场景 | 用例 | 结果 |
|---|---|---|
| 正式员工映射正确可进候选 | T1：listSelector SQL 含资格条件 | ✅ |
| NULL 不认定正式员工 | T0a/T1：EXISTS 精确 `='正式员工'`（NULL 比较为 NULL 不命中） | ✅ |
| 辞职持 active 段/死亡/退休不进候选 | T1+dev 实证（候选 1,291，1,806 终态+141 NULL 全排除） | ✅ |
| 外包/劳务不因非正式员工被排除 | T8：事故/培训/驾驶员入口未加过滤（文件级断言） | ✅ |
| 历史单据回显不消失 | T7/T9：getSelectorById/batchSelector SQL 不含资格条件 | ✅ |
| 批量回显含终态人员不丢失 | dev 实证 BATCH_ROWS 3/3（含 8095/9734 终态人） | ✅ |
| 筛选/分页/契约不变 | T10/T11：keyword/org/position/driver/LIMIT 参数逐一断言 | ✅ |

### 6.2 回归结果与基线对照

| 层 | 结果 |
|---|---|
| 新增单测 | **11/11 绿** |
| 员工域回归 | 10 套件 **269/269 绿**（v1/v2 终态闸门、purge-guard、assignment、status-code、terminate、rehire、relation-d1、delete-transaction、formal-gate） |
| 全量 `jest`（多 worker） | **778 通过 / 3 用例失败 / 8 套件失败（共 781，45 套件）**——基线 767/3/8（770，44 套件）：失败**完全一致零劣化**，+11 通过 = 新增测试，+1 套件 = 新增测试文件 |
| 基线失败说明 | 8 失败套件（含 insurance-file、personnel-insurance 的 require app.js OOM 与 hse-violation-assessment babel parse）为 P1-02 前即存在的基线问题，与本节点无关 |

### 6.3 关键 API 实际请求/响应验证（dev 库，service 层直调 = controller 之下同一 SQL 路径；HTTP 层因全局 auth 需登录态，未起完整 app.js）

```
BASELINE_FORMAL_EMPLOYEES: 1291                     ← = 花名册 Excel 正式员工数
LIST_SELECTOR_TOTAL_AFTER_FIX: 1291 (expect 1291, before 3238)   ← 3,238→1,291
LIST_SELECTOR_PAGE1_ROWS: 20 | sample: 6887/艾炳升, 6863/艾凤英
LIST_SELECTOR_KEYWORD_ROWS: 5 (keyword filter active)            ← 筛选仍生效
GET_BY_ID_TERMINAL_8095: FOUND (echo preserved)                  ← 辞职人员回显保护 ✔
BATCH_ROWS: 3 of 3 (terminal 8095/9734 must be included)         ← 批量回显含终态 ✔
PENDING_LIST_ROWS: 5 | PENDING_TOTAL: 116 | NON_FORMAL_IN_LIST: 0 (expect 0)
```

数字自洽：改前候选 3,238 = 正式 1,291 + 终态持段 1,806 + NULL 持段 141。

### 6.4 历史回显验证证据

- 终态人 employee_id 8095（辞职）、9734（辞职）：`getSelectorById(8095)` 返回该员工行；`batchSelector([正式员工id, 8095, 9734])` 返回 3/3——历史单据人员姓名零丢失。
- hazardService/保险快照/考核既有对象代码未触碰（diff-tree 佐证）。

## 七、数据库操作情况

- **零 DDL、零 DML、零生产连接**。
- dev 只读 SELECT（验证脚本，用后即删）：选择器计数、终态人回显、pendingList 抽查，均为读查询。

## 八、敏感扫描与完整性

- 改动文件 diff 敏感扫描（password/secret/key/token/私钥头/手机号/身份证号模式）：**零命中**。
- `node tools/check-repo-source-integrity.mjs`：6 处问题 = 基线既有 untracked 存量（A2+B4），**零新增**。

## 九、已知问题与未处理事项

1. **待确认项**（任务书 §三.2：业务用途不明确不擅改）：①事故 personnel-search 是否应排除终态人（当事人登记时点语义）；②驾驶员风险中心是否需要终态过滤或权限中间件；③NULL 关系人员（dev 141 持段）的转正流程归后续数据治理。
2. **基线既有失败**（8 套件/3 用例）继续由基线口径承接；`--runInBand` OOM 与 hse-violation-assessment parse 问题建议独立技术治理。
3. **终态人持 active current 段存量**（dev 1,806）未治理——读侧已兜底（本节点），数据修复归 B-2/B-3。
4. 权限中间件缺口（selector 3 端点、personnel-search、driver-risk-center）不在本任务书范围，未处理。

## 十、回滚方案

- 单 commit 回滚：`git revert b6c57c7`（7 文件纯代码，无数据/DDL 依赖，回滚即恢复原口径）。
- 细粒度回滚：各入口过滤条件均为独立一行 `AND ${formalEmployeeEligibilitySql('<别名>')}`，删除该行即恢复该入口原行为；`formalEmployeeEligibilitySql` 与 `assessmentTargetEligibility` 的改写互不影响考核域行为（字节一致实证）。
- 视图/数据库：零变更，无需回滚。

## 十一、交付 SHA 与核验

| 项 | 值 |
|---|---|
| 业务代码 commit | **`b6c57c7`**（7 文件 +246/−11，diff-tree 精确核验零卷入 cost.js/其他域文件） |
| 报告 commit | 本文件单独提交（SHA 见推送后核验） |
| 分支 | `feat/b02-dec-03.13-a02d-status-code` |
| 远端 HEAD | push 后 `git fetch` + `git status -sb` 核验与 origin 一致（见交付回复） |
| GitHub 链接 | `https://github.com/ljt8825-hash/HSE/commit/b6c57c7` |

## 十二、禁止事项自查

花名册原始数据未改 ✔｜零生产写入/DDL/迁移/回填 ✔｜personnel、hse_employee_relation 未删 ✔｜employee_assignment 历史数据未改 ✔｜历史单据人员关联未改 ✔｜无姓名自动匹配新增 ✔｜H5/飞书/WPS 链路未触碰 ✔｜登录/认证/JWT/权限体系未改 ✔｜cost.js 未改（staged A + MD5 不变）✔｜未使用 `git add .`/`-A`（pathspec 显式提交）✔｜未扩展为全系统重构 ✔｜未合并主分支、未部署 ✔

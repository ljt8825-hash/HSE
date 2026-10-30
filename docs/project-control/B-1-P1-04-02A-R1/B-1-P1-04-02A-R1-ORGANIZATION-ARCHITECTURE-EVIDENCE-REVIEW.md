# B-1-P1-04-02A-R1 组织模型架构证据补强与设计返修报告

> 节点：B-1-P1-04-02A-R1（只读代码核验 + 数据证据补强 + 架构方案返修；零代码/零 DDL/零 DML/零生产查询）
> 日期：2026-10-30
> 前置报告：`docs/project-control/B-1-P1-04-02A/B-1-P1-04-02A-ORGANIZATION-TARGET-ARCHITECTURE.md`（commit `aa4c11d`）
> 附件：`B-1-P1-04-02A-R1-TEAM-OPERATION-UNIT-MAPPING.csv`（51 条逐条映射，与本报告同 commit）
> 证据方式：dev 库 READ ONLY 事务（每批断言 `current_database()=safety_dashboard_dev` + `transaction_read_only=on`）+ 当前 HEAD 实码核验

---

## 0. 执行基线

- 起始 HEAD：`aa4c11d`（`git fetch` 后远端同分支一致）；`git merge-base --is-ancestor aa4c11d HEAD` 通过。
- cost.js：staged `A` + MD5 `e88ae2b0b275346dfc1431408aa00bff`，与本节点前一致。
- 工作区：51 个 tracked M 与 04-02A 基线数量一致（含 grid-mobile-cloudflare 9 个 M 文件，最后提交 `69c0d18` 2026-10-23，属既有遗留改动，本节点未触碰）。
- 本轮全程只读：dev 查询全部 `BEGIN TRANSACTION READ ONLY` + COMMIT；未执行任何生产查询；未修改任何文件（除本报告与 CSV）。

## 1. 任务 1：51 班组与 51 cleaning_team 逐条映射核验

### 1.1 结论（修正并强化原报告）

**原报告仅以「数量相同（51=51）」作为佐证——审查意见正确，数量不能证明映射。本轮逐条核验结果：51:51 全部 EXACT 双射成立，但这是核验后的结论，不是数量巧合的推断。**

| 统计项 | 值 | 说明 |
|---|---|---|
| 旧班组（department level6、未映射、is_deleted=false） | 51 | 匹配集定义 |
| cleaning_team（hse_operation_unit，is_deleted=false） | 51 | 匹配集定义 |
| **EXACT**（unit_name 精确同名 + 乡镇对应） | **51** | 48 条乡镇精确（TOWN_EXACT）+ 3 条乡镇前缀（TOWN_PREFIX，刘营伍） |
| NAME_ONLY / PARENT_CONFLICT / MULTIPLE / UNMATCHED | **0 / 0 / 0 / 0** | 无歧义、无多候选 |
| 反向未命中（cleaning_team 无同名班组） | 0 | 双射 |
| 同侧重名 | 0（两侧均无 HAVING COUNT>1） | 无同名异组织 |
| 已停用/软删除参与匹配 | 0（两侧均 active 且 is_deleted=false） | |

### 1.2 匹配方法与证据（非 LIMIT 1 自动决定）

- 匹配规则：`opu.unit_name = d.name` **精确等值**（无 LIKE、无前缀、无 LIMIT 1）；每个班组名经反向包含检查确认**恰好 1 个候选**（查询 D：`cand_cnt` 全部=1）。
- 乡镇一致性：`regexp_replace(ou.org_name,'作业中心$','')` 与班组父名（department.parent_name）对拍——48 条精确相等；3 条刘营伍系列为前缀对应（department 父名「刘营伍」vs ou「刘营伍乡作业中心」，**乡镇命名本身不一致**，标注在 CSV match_method 列，属数据命名瑕疵而非映射歧义）。
- 逐条明细：见附件 CSV 51 行（department_id/名称/层级/父级 ↔ operation_unit_id/名称/类型/所属管理组织/match_method/match_status/evidence）。
- SQL 全文与统计输出：`.workbuddy/tmp/r1-team-full.sql`（T1-1 ~ T1-4）。

### 1.3 对目标架构的影响

M2 数据治理的「51 班组对拍」工作项**从「待建立映射」降级为「映射已实证，仅需按 CSV 执行回填」**；同时新增一条 M2 注意事项：刘营伍 3 条的乡镇命名差异（父名 vs ou 名）在回填时以 ou（hse_org_unit.id=8）为准，department 父名不动。

## 2. 任务 2：employee_assignment 组织引用现状核验

### 2.1 A（当前数据库事实）

**约束实况**（pg_constraint 全量）：

| 列 | 类型 | 可空 | FK | CHECK | 索引 |
|---|---|---|---|---|---|
| org_unit_id | bigint | **允许 NULL** | ✅ `fk_employee_assignment_org_unit` → hse_org_unit(id) **ON DELETE SET NULL** | ❌ 无 | idx_assignment_org_unit_id |
| operation_unit_id | bigint | **允许 NULL** | ❌ **无 FK**（全库 conrelid 检索=0） | ❌ 无 | idx_assignment_operation_unit_id |
| position_id | bigint | 允许 NULL | ✅ → position(id) ON DELETE SET NULL | ❌ | — |
| employee_id | bigint | NOT NULL | ✅ → employee(id) | ❌ | — |

唯一约束：`uk_emp_assign_primary`（partial：WHERE is_primary AND is_current AND NOT is_deleted）。**org_unit_id / operation_unit_id 均无有效性 CHECK、无组合唯一约束。**

**五态统计**（22,295 active + 6,569 soft-deleted）：

| 状态 | 数量 | org_unit_id NULL | operation_unit_id 有值 |
|---|---|---|---|
| 当前任职段（is_current=true） | **3,238** | **0（100% 有值）** | 146（4.5%），孤儿 0 |
| 历史任职段（is_current=false，全部有 end_date） | 19,057 | 3,514（18.4%） | — |
| 已软删除 | 6,569 | — | — |
| **员工终态但段仍 current**（辞职/死亡/退休） | **1,806** | — | — |
| 孤儿（org_unit_id 指向不存在 ou，全段） | **0**（FK 保证） | | |
| 双引用组织冲突（opu.org_unit_id ≠ 段.org_unit_id，current） | **0**（146 条全部一致） | | |

**关键澄清**：原报告 §7「org_unit_id = 唯一必填组织引用（84.2% 已填）」表述混淆了口径——**84.2% 是含历史段的全表口径；当前段实态是 3,238/3,238 = 100% 有值**。1,806 条终态 current 段不是「NULL 归属」问题而是「终态未关段」问题（B-1 链路已知，A-02A terminateEmployee 已建关段闭环，存量待治理）。

### 2.2 B（当前代码校验）

- 写路径校验：assignEmployee/terminateEmployee/rehireEmployee 有员工关系闸门（终态拦截）与事务并发栅栏（A-02e.5-B1/A-02B），但**无 org_unit_id 非空校验**（列 nullable + resolveOrgUnitId 失败返回 NULL 继续插入）。
- 读路径：不校验 org_unit_id 有效性（FK+ON DELETE SET NULL 兜底，孤儿结构性不可能）。

### 2.3 C（目标模型建议与边界）

- 建议「新任职段必须 org_unit_id」**仅适用于未来新增代码路径**（M1 契约），形式=服务端显式校验（400 ORG_UNIT_REQUIRED），**不改列约束**（NOT NULL 需先清 3,514 条历史 NULL，属 M2 数据治理且无必要——历史段不再写入）。
- 历史数据：3,514 条历史段 NULL **保留原样，不判定为错误，不补值**（任务书红线；历史段 end_date 已语义封闭）。
- 特殊人员例外：需业务确认（04-02A §11-Q2），本报告不擅自定。
- operation_unit_id：目标架构应补 FK（M2 DDL，`FOREIGN KEY REFERENCES hse_operation_unit(id)`，146 条存量孤儿=0，加 FK 无阻塞）——原报告「双 FK 已存在」表述有误，修正见 §7-3。

## 3. 任务 3：operation_unit_id 完整调用链核验

### 3.1 调用链图与实现状态

```
① hse_operation_unit 建表        v68 迁移 :54-91（含 org_unit_id NOT NULL FK→hse_org_unit）   [已实现·结构]
② operation_unit_id 字段/FK      employee_assignment 列存在；FK 不存在（§2.1）                [仅数据库结构]
③ 作业单元新增接口               hse-org-center.js:393（requireRole）——app.js:515-517 注释停挂 [代码存在·未投产]
④ 作业单元更新接口               hse-org-center.js:428——同上停挂                              [代码存在·未投产]
⑤ V2 导入创建作业单元            employeeImportV2Service.js:387/:411（幂等：org_unit_id+unit_name+unit_type 查重后 INSERT）[已实现·活跃]
⑥ 导入结果关联员工               同文件 :1057-1061 建段时写入 operation_unit_id=p.target_unit_id [已实现·活跃·全仓唯一写入点]
⑦ ea.operation_unit_id 写入位置  全仓 grep「operation_unit_id + INSERT/UPDATE」仅命中 :1057 一处 [已实现·唯一]
⑧ 调岗接口传入                   controllers/hse-assignment.js 无 operationUnitId 参数；assignEmployee(:419) INSERT 列
                                  (employee_id,org_unit_id,position_id,supervisor_id,status,is_current,is_primary,
                                   start_date,remark,created_by) 不含 operation_unit_id            [未实现]
⑨ 员工详情读取                   employeeService.js:132/:173/:290 LEFT JOIN hse_operation_unit    [已实现·读]
⑩ 组织树读作业单元               orgTreeService.js 全文无 hse_operation_unit 引用                  [未实现]
⑪ 作业单元停用后任职段处理       全仓无任何代码（无级联/无拦截/无提示）                            [未实现]
```

### 3.2 任务书问题的直接回答

**「目前是否存在一条完整、可运行的业务链路，能够将员工分配到指定 hse_operation_unit，并把 operation_unit_id 正确写入 employee_assignment？」**

**存在，但仅 V2 导入一条（⑤→⑥→⑦）**；交互式调岗/分配（⑧）、返聘（rehireEmployee :788 INSERT 同样不含 operation_unit_id）、组织树展示（⑩）、停用联动（⑪）**均未实现**。原报告「双引用结构已存在」「方案 B 骨架已存在」的表述需限定为：**列与导入链路已存在，管理动作链路（调岗/返聘/树/停用）未实现——M1 工作量据此修正**。

### 3.3 对目标架构的影响（M1 范围修正）

- assignEmployee 需新增可选 `operationUnit` 参数（结构化 {nodeType,refId}）→ INSERT 加列 → controller 透传；
- rehireEmployee 同步补列；
- 树读侧增加作业单元子节点（§5）；
- 作业单元停用需校验「无 current 段引用」（146 条存量，停用前拦截或提示）——新增规则，M1 实现。
- 原报告 M1「纯代码零数据迁移」的评估**维持成立**（以上均为代码改动）。

## 4. 任务 4：组织主数据写入口全量核查

| 表 | 写入文件 | 方法 | 调用入口 | 权限校验 | 当前状态 |
|---|---|---|---|---|---|
| hse_org_unit | routes/hse-org-center.js:171/:202-212/:239 | INSERT/UPDATE/软删 | **未挂载**（app.js:515-517 注释） | requireRole('admin','safety_manager')（但 requirePermission 缺失） | **零运行时写路径** |
| hse_org_unit | scripts/migrate_employee_v2.js:646 | UPDATE headcount | 一次性迁移脚本 | 无 | 历史，不随服务运行 |
| hse_org_unit | sql/*_init_data.sql（3 份） | INSERT | 迁移 | — | 配置即代码 |
| hse_operation_unit | employeeImportV2Service.js:387/:411 | INSERT（幂等） | V2 导入 | 导入权限链 | **活跃**（运行时唯一写入口） |
| hse_operation_unit | routes/hse-org-center.js:393/:428/:466 | CRUD | **未挂载** | requireRole | 零运行时 |
| department | orgTreeService.js:422/:435/:486/:500 | INSERT/UPDATE/软删 | /api/hse/employee/departments* | requireRole+requirePermission(hse:personnel:*) | 活跃（UI 入口） |
| department | employeeImportService.js:259/:273（matchOrgPath） | INSERT/UPDATE | V1 导入 | 导入权限链 | **活跃（旁路：自动建部门）** |
| hse_employee_org | —（三触发器 fn_hse_employee_org_read_only 拦截 insert/update/delete） | — | — | DB 层 | 冻结 |
| departments（复数） | 无任何写代码 | — | — | — | 0 行死表 |
| 定时任务 | 无（warningCenter node-cron 只读组织表） | — | node-cron | — | 无组织写 |
| 前端 | departments.vue / positions.vue | 经上述 API | — | — | 随 API |

**发现**：①`hse-org-center.js` 的组织 CRUD 只有 `requireRole`，**没有 `requirePermission`**（org-tree.js 对照有）——恢复挂载前必须补权限码；②导入域是组织表的**运行时第二写入口**（hse_operation_unit 幂等建 + department 自动建），唯一写入口方案必须同时收编两条导入链。

**恢复 hse-org-center 路由前的必查清单**（本节点只列不执行）：
1. 权限补齐：组织 CRUD 补独立权限码（如 hse:org:manage）+ 权限种子 SQL；
2. 路由冲突：确认 /api/hse/org-center 前缀与现有 /api/hse/employee/departments* 无契约重叠（前端是否已硬编码调用 org-center 契约——grep 前端零命中，待复核）；
3. 名称判重缺失：hse-org-center.js 创建/更新无 org_name 精确判重（§7-8），恢复前必须补；
4. org_type 白名单校验缺失（v68 无 CHECK，见 §6）；
5. 与 orgTreeService 的 department 回填逻辑（:430/:475）冲突评估：org-center 改名后 department.org_unit_id 不会联动——两套写入口并存即回到双轨，需在恢复时同步定义「department 回填归属谁管」。

## 5. 任务 5：组织树精确挂载证据

### 5.1 现状挂载逻辑（orgTreeService.js 实码，04-01 精读 + 本轮复核）

1. **管理组织父子**：hse_org_unit.parent_id（dev 1 根+19 子，断链 0）——纯结构化 ✅。
2. **department 节点父子**：department.parent_id（64 有/28 空）——旧五级树，与 ou 树无结构关联。
3. **班组挂载 = 名称启发式三件套**：正则识别（:33 `X班$|车队|片区`）→ 乡镇前缀最长命中（:206-222）→ 不命中挂根（:220，静默）。
4. **人数均摊**：班组层 `dept_name` 名称关联 + `Math.round(townCount/n)`（:140-150/:232-242）。
5. **hse_operation_unit 完全不在树上**（:⑩ 未实现）——orgTreeService 无该表引用。
6. 重复节点风险：26 行已映射 department 中 12 个 level6「XX镇」与对应 ou 节点**语义重复**（同实体双表达）——当前树靠「班组正则」恰好把它们排除在班组叶子外（「XX镇」不匹配 X班$），但它们仍作为非班组 department 出现的路径需在 M1 重写时显式排除。
7. 孤儿节点：13 个 level1 残骸不匹配班组正则、无乡镇前缀 → 依赖 :220 挂根逻辑，**VERIFIED-CODE-ONLY**（结构上存在挂根降级路径；51 个活跃班组名均含乡镇前缀、预期均可挂载，但 JS 层挂载结果未做端到端运行验证，标记 UNKNOWN-部分）。

### 5.2 目标树结构（R1 修订版）

**管理组织与作业单元必须使用不同 nodeType**（原报告 §4.2 已定，维持）——作业单元不是管理组织节点，不得伪装：

```json
GET /api/hse/org/tree
{ "list": [{
    "nodeType": "org_unit", "refId": 9, "name": "宁城街道作业中心", "orgType": "town_center",
    "children": [],
    "operationUnits": [
      { "nodeType": "operation_unit", "refId": 4, "name": "宁城街道一班",
        "unitType": "cleaning_team", "headcount": 12, "assignmentCount": 15 }
    ]
}]}
```

- 作业单元作为 ou 节点的**并列子集合字段**（不混入 children 数组），前端分组渲染；legacy_department 退役期不展示（51 班组语义已由 operation_units 承载，26 行映射由 ou 节点承载，66 行未映射中的 13 level1+2 杂项不展示）。
- 人数：org_unit 层按 ea.org_unit_id、operation_unit 层按 ea.operation_unit_id（M3 补填前 operation_unit 层显示 `assignmentCount` 真实值 + `pendingMapping: true` 标记，**不做均摊近似**）。

## 6. 任务 6：org_type 枚举口径复核

### 6.1 权威定义与根因

- **权威枚举只存在于注释**：v68 迁移 `:19 org_type VARCHAR(32) NOT NULL`（**无 CHECK**），`:36 COMMENT '组织类型: company/department/center/town_center'`。dev 实态四值 12/5/2/1 与注释一致；无 CHECK 是死枚举（'township'/'operation_center'/'park'）能静默存活的根因。
- 死值全仓清单（本节点重新 grep 复核，同 04-02A E6）：`'township'` warningCenterService.js:281/:323；`'operation_center'` assessmentService.js:400/:1099/:1169/:1210 + executiveCockpitService.js:754；`'park'` leaderDashboardService.js:119。前端：departments.vue :87-97 orgTypeText() 字典、api/hse/employee.ts :204 弱类型 string。

### 6.2 修复影响分析（技术修复 ≠ 口径变更，分别陈述）

**预警域（warningCenterService）**：`IN ('department','center','township')` → 修正为含 `town_center` 后，组织预警扫描面**从 7 个节点（5 department+2 center）扩大到 19 个（+12 乡镇中心）**。这不是「修复 bug 后一切照旧」，而是预警范围的业务扩大——12 个乡镇中心的违规/隐患/整改率将首次进入组织预警排名。**需预警业务方确认接收口径**（对应 04-02A §11-Q6），技术修复本身无风险。

**考核域（assessmentService + executiveCockpitService）**：`IN ('department','operation_center','center')` 中 'operation_center' 零行——修复为 `('department','center')` 则**统计面不变**（纯死值剔除，零行为变化）；修复为含 `town_center` 则 12 乡镇中心进入考核组织聚合——**前者是纯技术修复，后者是口径变更**，两案必须在 M1 分开实施：先做零行为变化案（M1），口径扩大案留 04-02B 业务确认（04-02A §11-Q6）。

## 7. 任务 7：原报告逐项勘误

| # | 原报告表述（位置） | 复核事实 | 修订表述 | 证据 | 对目标架构影响 |
|---|---|---|---|---|---|
| 1 | 「51 班组与 51 cleaning_team 数量精确对应」（§2.2 E3，以数量为佐证） | 逐条核验：51:51 全 EXACT 双射、无歧义 | 结论保留，**证据从数量推断升级为逐条实证**（CSV） | §1 + CSV + r1-team-full.sql | M2 班组回填工作从「建立映射」降为「执行回填」 |
| 2 | 「org_unit_id = 唯一必填组织引用（84.2% 已填）」（§7） | 列 nullable 无 NOT NULL；current 段 3,238/3,238=100%；84.2% 是含历史段口径；hist NULL 3,514 | 「当前段事实 100% 有值；必填是目标规则（服务端校验），历史 NULL 保留不补值」 | §2（T2-3） | 目标规则适用边界明确（仅未来新增） |
| 3 | 「双 FK 骨架已存在」「ea.operation_unit_id FK 列已存在」（§3.2/§2.1 E4） | operation_unit_id **无 FK**（仅普通索引）；org_unit_id 有 FK | 「operation_unit_id 列已存在但无 FK；补 FK 列入 M2 DDL（存量孤儿=0，无阻塞）」 | §2.1（T2-2） | M2 新增一项 DDL；方案 B 不变 |
| 4 | 「operation_unit_id 双引用结构已存在」暗示贯通（§3.2） | 全仓唯一写入=V2 导入:1057；assignEmployee/rehireEmployee INSERT 无列、controller 无参数、树不读、停用无处理 | 「仅导入链路已打通；调岗/返聘/树/停用四链路未实现，全部列入 M1」 | §3（⑦⑧⑨⑩⑪） | M1 工作量上修（新增 3 处写路径+1 处读路径+1 条停用规则） |
| 5 | 「唯一写入口 = 恢复挂载的 /api/hse/org-center CRUD」（§8.4） | org-center CRUD 无 requirePermission、无名称判重、与 orgTreeService department 回填存在双轨冲突 | 「恢复前必查 5 项（权限码/契约冲突/判重/org_type 校验/回填归属）」 | §4 清单 | M1 前置核查清单新增 |
| 6 | hse-org-center 停挂现状（§2.2 E1） | 一致，复核确认 app.js:515-517 注释 | 维持原表述 | §4 | 无变化 |
| 7 | 树挂载机制=前缀启发式（§2.2/§8.2） | 一致（:33/:202-222/:220/:232-242） | 维持；补充「12 个 level6『XX镇』与 ou 语义重复、13 level1 残骸依赖挂根路径」 | §5.1 | 树重写需显式排除两类节点 |
| 8 | 「hse_org_unit 当前不存在活的名称判重逻辑」（§1.3 勘误） | 一致（全仓零命中；org-center 内亦无） | 维持；补充「org_type 权威枚举同样只在 v68 :36 注释、无 CHECK」 | §6.1 | 同 04-02A |
| 9 | departments 复数表生产未知（§14-1） | UNKNOWN（本轮未查生产，按纪律） | 维持 UNKNOWN，保留 P1-02 两支方案 | 04-02A §9 P1-02 | 生产核验清单保留 |

## 8. 任务 8：R1 结论

### 8.1 方案 B 判定：**有条件推荐**

方向维持，三个前置条件（均为已识别工作项，非新风险）：
1. **M1 必须包含调岗/返聘链路的 operation_unit_id 写入**（§3.3）——否则「双引用」只是导入侧的孤立事实，交互业务永远写不进作业归属；
2. **M2 补 operation_unit_id FK + org_type CHECK**（§2.3/§6.1）；
3. **04-02B 业务确认 Q1/Q2/Q6** 完成前，不冻结 org_type 口径修正案与班组语义案。

### 8.2 M0 冻结条件：**未具备**

缺三项：①04-02B 业务规则确认（04-02A §11 七项）；②生产只读核验六项（04-02A §14，含 departments 表存在性）；③本 R1 的 M1 范围修正被审查采纳。技术设计本身（ID 契约/树结构/写入口方案）已达到可冻结质量。

### 8.3 技术上已明确（不依赖业务决策）

- 51:51 双射映射与 CSV（§1）；ea 约束实态与五态数字（§2.1）；operation_unit_id 唯一写入点=V2 导入:1057（§3）；org_type 死值全清单与 v68 无 CHECK 根因（§6）；org-center 恢复前 5 项必查（§4）；{nodeType, refId} ID 契约与 API 形态（04-02A §4 维持）；树双 nodeType 结构（§5.2）。
- M1 纯技术修复项：'township'→'town_center'（2 处）、'operation_center' 死值剔除（5 处，零行为变化案）。

### 8.4 必须由业务确认（真实业务规则，不含技术问题）

04-02A §11 七项维持，其中 Q6 细化为两案拆分（§6.2）：纯死值剔除（技术，M1）vs 统计面扩大（业务，04-02B）。无新增业务确认项。

### 8.5 生产只读核验清单（不执行，仅列）

04-02A §14 六项维持 + 新增两项：⑦生产 `employee_assignment` current 段 org_unit_id 是否同样 100% 有值、operation_unit_id 填充率；⑧生产 hse_operation_unit 行数与 unit_type 分布（对照 dev 89/五类）。

### 8.6 下一阶段建议（仅建议）

1. 04-02B 业务规则确认（携带 04-02A §11 + 本报告 §6.2 拆分案）；
2. 生产只读核验窗口（八项清单，DB-INT 授权）；
3. 两者完成后进入 M0 冻结评审；M1 实施范围以本报告 §3.3/§4/§5 修正为准。

## 9. 交付信息

- 仓库：ljt8825-hash/HSE；分支：feat/b02-dec-03.13-a02d-status-code；起始 HEAD：`aa4c11d`
- 报告：`docs/project-control/B-1-P1-04-02A-R1/B-1-P1-04-02A-R1-ORGANIZATION-ARCHITECTURE-EVIDENCE-REVIEW.md`
- 附件：`B-1-P1-04-02A-R1-TEAM-OPERATION-UNIT-MAPPING.csv`（51 行逐条映射）
- 提交：独立 pathspec（报告+CSV 两文件）；远端 HEAD 与 ahead/behind 见提交后核验
- cost.js：staged `A` + MD5 `e88ae2b0b275346dfc1431408aa00bff` 全程不变
- 纪律：零代码/零 DDL/零 DML/零生产查询/未触碰 grid-mobile 与 H5 冻结链路；**提交后停止，等待独立审查，不宣告冻结，不启动 M0**

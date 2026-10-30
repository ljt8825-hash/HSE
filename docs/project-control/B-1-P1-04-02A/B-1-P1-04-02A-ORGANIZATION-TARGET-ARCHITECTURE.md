# B-1-P1-04-02A 组织模型目标架构与缺陷修复方案设计报告

> 节点：B-1-P1-04-02A（只读分析 + 目标架构设计 + 迁移方案设计；**零代码改动、零 DDL/DML、零生产写入**）
> 日期：2026-10-30
> 分支：`feat/b02-dec-03.13-a02d-status-code`
> 起始 HEAD：`7a653a0`（= B-1-P1-04-01 报告提交 `7a653a0729f07ae59729eed9f130ae4261012e42`）
> 证据来源：当前分支最新代码逐文件核对 + dev 库 READ ONLY 事务验证（每批断言 `current_database()=safety_dashboard_dev` 且 `transaction_read_only=on`）+ B-1-P1-04-01 已验收审计（代码零变更证明见 §1.2）

---

## 1. 执行基线

### 1.1 基线状态

| 项 | 值 |
|---|---|
| 分支 | `feat/b02-dec-03.13-a02d-status-code` |
| 起始 HEAD | `7a653a0`，`git fetch` 后远端同分支 = 本地，无漂移 |
| cost.js | git 状态 `A`（staged）、MD5 `e88ae2b0b275346dfc1431408aa00bff`，与本节点前一致 |
| 工作区 | 51 tracked M 均为基线既有，本节点零新增改动 |

### 1.2 04-01 审计结论的时效性证明

`git diff --name-only 5d1a302..7a653a0` 输出仅 1 个文件：`docs/project-control/B-1-P1-04-01/…AUDIT.md`（纯报告）。即 **R1 验收基线（5d1a302）以来业务代码零变更**，04-01 审计的代码级结论（文件:行号）在当前 HEAD 全部有效。本报告在此之上做增量核对与补读，不重复已验收结论，但下文所有关键设计证据均重新给出实码位置或 dev 实态。

### 1.3 对 04-01 报告的一处勘误

04-01 报告 §6.2 曾引用「orgUnitManagementService.js 的 org_name 精确判重」——该结论源自子代理转述。本节点全仓检索 `orgUnitManagement|orgNameExists|org_name_exists` **零命中**，该文件不存在。hse_org_unit 的真实写路径以本报告 §2.2 为准。**设计原则影响**：hse_org_unit 当前不存在任何活的名称判重逻辑，目标架构必须补齐（§8.4）。

## 2. 现状权威模型（第一部分）

### 2.1 七对象总矩阵

| 项目 | hse_org_unit | hse_operation_unit | department | departments(复数) | hse_employee_org | employee_assignment | position |
|---|---|---|---|---|---|---|---|
| **实际用途** | 管理组织骨架（公司/部门/中心/乡镇） | 生产作业单元（保洁班/收运队/转运站/车队/作业中心） | 旧部门+班组混合表 | department 的旧版窄结构 | 五级模型历史快照 | 唯一权威任职段 | 岗位 |
| **主键** | bigint 自增 | bigint 自增 | bigint 自增 | bigint 自增 | bigint 自增 | bigint 自增 | bigint 自增 |
| **上级关系** | parent_id（dev 1 根+19 子，断链 0） | **org_unit_id NOT NULL FK→hse_org_unit** | parent_id（64 有/28 空） | parent_id | 五级列 group/region/enterprise/project/team | org_unit_id FK + operation_unit_id FK + position_id FK | dept_id→**department.id** |
| **dev 行数** | 20 active | 89 active（5 类 unit_type） | 92 active | **0** | 1,285（冻结） | 3,238 current | 50 |
| **写入入口** | **运行时零写路径**：唯一 CRUD 路由 `routes/hse-org-center.js:138/:188/:225` 已在 `app.js:515-517` 注释停挂；另 `scripts/migrate_employee_v2.js:646`（一次性） | **活跃**：`employeeImportV2Service.js:387/:411` 动态 INSERT（unit_type=collection_team/transfer_station，按 org_unit_id+unit_name 幂等）；hse-org-center.js:393/:466（未挂载） | `orgTreeService.js:399/:452/:494`（UI，权限齐备）+ `employeeImportService.js:236-278 matchOrgPath`（导入旁路自动建） | 无 | 三触发器 `fn_hse_employee_org_read_only()` 硬冻结 | assignEmployee/rehireEmployee/terminateEmployee/导入（B-1 链路已治理） | `positionService.js:81/:109` 直写 dept_id |
| **读取入口** | orgTreeService:19-23 树骨架；assignment/考核/驾驶舱等 23 文件按 org_unit_id 精确读 | signinAttribution.js:131（按 unit_name 同名映射）；employeeService:132/:173/:290（JOIN ea.operation_unit_id）；driver-risk-center 等 | orgTreeService 树+员工列表；hazardRectification/inspectionCenter/warningCenter（JOIN department_id） | `hseTasksService.js` 5 处 + `hse-chain.js:199` + `statisticsService.js:601`（**仓库无 CREATE TABLE**） | **零活代码读取**（仅注释与测试） | 全员域主读 | positionService / 前端岗位表单 |
| **业务状态** | 活跃（读）+ **配置即代码**（写） | **活跃** | 活但退化（兼容层） | **死表**（0 行 + 无迁移来源） | 死表（冻结） | **唯一权威** | 活跃 |
| **处理建议** | **保留为主模型** | **保留为作业单元主模型** | **M2 治理后退役**（§10 M4 评估） | **退役**（先生产核实） | **归档退役** | **保留**（双组织引用设计见 §7） | 保留（dept_id 迁移待 M2/M3） |

### 2.2 关键实证（本节点新增验证，支撑设计决策）

**E1｜hse_org_unit「活读死写」**：全仓 `INSERT INTO hse_org_unit|UPDATE hse_org_unit` 活代码仅 `routes/hse-org-center.js`（未挂载）与一次性迁移脚本。运行中系统**无法新建/改名/停用任何管理组织节点**——组织骨架完全由迁移 SQL（`hse_org_center_v68_init_data.sql` 等 3 份 init data）维护。当前 20 个节点即「代码化配置」。

**E2｜26 行映射的真实形态 = 12 组重复行**（dev 实测 §2.3-6）：每个乡镇 ou（town_center）恰好挂 2 个 department——level5「XX镇」与 level6「XX镇」**同名两行**（如刘营伍乡作业中心←「刘营伍」×2）。**"12 个 ou 双挂"不是两种实体，是同一语义的重复存储**。加上 company/department 精确同名 2 例，26 行映射的实际信息量 = 14 个实体，全部可被 hse_org_unit 20 行覆盖。

**E3｜未映射 66 行的构成**（dev 实测 §2.3-5）：level1 13 行（旧五级"集团"层残骸）+ level6 51 行（**全部有 parent、全部班组形态**）+ level4/5 各 1 行杂项。51 个班组与 hse_operation_unit 的 **51 个 cleaning_team 数量精确对应**——班组的现代表达已存在于作业单元表。

**E4｜hse_operation_unit 是活跃的作业单元表**：unit_type 五类（cleaning_team 51 / collection_team 13 / operation_center 12 / transfer_station 11 / center_vehicle_team 1），全部 active；V2 导入按 org_unit_id+unit_name 幂等创建；`employee_assignment.operation_unit_id` FK 列**已存在**（sprint5_6 迁移），当前填充率仅 4.5%（146/3,238 current 段）——**方案 B 的数据骨架已存在，只是未走通**。注意：12 个 operation_center 同时存在于 hse_org_unit（town_center）与 hse_operation_unit（operation_center），管理/作业双登记待业务确认（§11-Q1）。

**E5｜`ea.operation_unit_id` 与 `position.dept_id` 的现状**：position 50 行仅少数填 dept_id（实测样本：测试电工→4155 人力综合部）；positionService create/update 直写 dept_id 无任何 ID 防护（:81/:109）。前端 positions.vue 用合并树 `key-field="id"` 选择（04-01 explore-fe2 P1-4）——存在 ou_ 串写入 department.id 通道。

**E6｜org_type 全仓枚举清单**（本节点 grep 复核）：`town_center` 为主流正确值（assessmentMonthly*/assessmentScheduler/emergencyService/executiveCockpitService/leaderDashboardService/hazardService/accidentService 等 20+ 处）；死值仅两族——`'operation_center'`（assessmentService.js:400/:1099/:1169/:1210 + executiveCockpitService.js:754，共 5 处 `IN ('department','operation_center','center')`）与 `'township'`（warningCenterService.js:281/:323）；`'park'`（leaderDashboardService.js:119）dev 零行待确认。

**E7｜departments 复数表**：dev 0 行；列结构 = department 旧版窄集（id/name/short_name/parent_id/township/sort_order，无 dept_code/level/manager）；仓库 sql/ 目录仅 dump 备份命中，**无活跃 CREATE TABLE 迁移**；7 处活代码引用（hseTasksService×5/hse-chain.js:199/statisticsService.js:601）。生产存在性与外部写入未确认（§14）。

**E8｜名称匹配链全清单**（治理对象）：orgTreeService :430/:475（=|LIKE + LIMIT 1 无序）、employeeImportService :268/:346-368（前缀+去后缀模糊）、employeeImportV2Service :262-331（五级匹配含关键字 %kw%）、rosterImportService :117-135（精确 LIMIT 1）、resolveOrgUnitId :70-76（精确同名 JOIN）、orgTreeService :202-222（前缀挂载）、leaderDashboardService :15-63（短名/去后缀 startsWith）、hazardService :280-303 与 accidentService :248-270（**description.includes(core) 子串提取，最高危**）、ruleEngine 四 adapter（org_name LIKE '%'||$1 后缀兜底）、trainingRegisterService :50-91。

### 2.3 概念区分（任务书 §三要求）

- **管理组织**：hse_org_unit（company→department→center→town_center，20 节点）——谁对管理结果负责。
- **生产作业组织**：hse_operation_unit（班组/转运站/收运队/车队，89 单元）——在哪干活、干什么活。
- **班组**：当前三种表达并存——department level6 51 行（旧）、hse_operation_unit.cleaning_team 51（新）、getOrgTree 正则识别（读侧启发式）。**目标：唯一表达 = hse_operation_unit**。
- **项目**：宁津项目公司 = hse_org_unit org_type='company'（1 行）；risk_project_record.project_id 也指向 hse_org_unit（风险域把"项目"当组织节点）——项目与管理组织在现有数据中同体，不拆。
- **乡镇/街道**：hse_org_unit.org_type='town_center' 12 行，唯一表达，无重复。
- **岗位**：position 独立表，经 position_id 进任职段，不塞组织表。

## 3. 目标模型候选方案（第二部分）

### 3.1 方案 A：统一组织模型（hse_org_unit 单表扩容）

把班组/作业单元全部并入 hse_org_unit（org_type 扩为 6-8 类），hse_operation_unit 退役。

**证据检验**：
- ✅ 树展示简单（单表单树）。
- ❌ hse_operation_unit 有 org_unit_id NOT NULL FK、headcount/location/supervisor 等作业属性（unit_code、location——管理组织节点无此语义）。
- ❌ V2 导入正在动态创建作业单元（幂等创建逻辑成熟）——迁移要先改导入再迁 89 行。
- ❌ 20+ 处按 org_type='town_center' 过滤的 SQL 全部要加新枚举语义审查；无 CHECK 约束的现状下扩枚举=扩大死枚举风险面。
- ❌ employee_assignment.operation_unit_id FK 已存在且语义正确，单表化反而要废掉这个已存在的正确设计。

### 3.2 方案 B：管理组织与作业单元分离（推荐）

- **hse_org_unit** = 唯一管理组织主模型（四类 org_type：company/department/center/town_center）。
- **hse_operation_unit** = 唯一生产作业单元（五类 unit_type 现状保留），FK org_unit_id 指向所属管理组织（**已存在，NOT NULL**）。
- **employee_assignment** 双引用：org_unit_id（管理归属，84.2% 已填）+ operation_unit_id（作业归属，列已存在，M3 补填）。
- **department** = 兼容层：只读保留→数据治理（去重 12 组、归类 66 行）→退役。
- **班组**：唯一表达 = hse_operation_unit（E3 51=51 对齐是核心证据）。

**证据检验**：
- ✅ 现有表结构零 DDL 即可表达目标模型（两表+双 FK 全部已存在）。
- ✅ 89 行作业单元 + 51 班组对齐 + 20 节点管理骨架，数据保留率最高。
- ✅ 22,295 段 assignment 的 org_unit_id 84.2% 有效（孤儿 0）——主数据已就位。
- ⚠️ orgTreeService 需重写挂载逻辑（从"名称前缀启发式"改为"org_unit_id 精确挂载"）。
- ⚠️ getOrgTree 的员工数班组层需从 dept_name 关联改为 operation_unit_id 关联（4.5%→M3 补填后精确）。

### 3.3 方案 C：类型化组织资源（单表 + 类型字段 + 资源 ID 命名空间）

单张 `organization` 表（id, resource_type, business attrs...），ou/opu 合并，API 统一 `/api/org/:type/:id`。

**否决理由**：与方案 A 同样的作业属性冲突（unit_code/location），且需要新表全量迁移（20+89 行重排 + 13 处 FK 重建 + 23 文件读路径改写）——迁移复杂度最高、兼容性最低，无业务收益。**不推荐**。

### 3.4 方案比较（任务书 11 指标）

| # | 指标 | A 统一单表 | B 管理/作业分离 | C 类型化单表 |
|---|---|---|---|---|
| 1 | 现有业务兼容 | 中（作业单元 SQL 全改） | **高（FK/读路径基本不动）** | 低 |
| 2 | 数据保留 | 中 | **高（92+89+20 全保留）** | 低 |
| 3 | ID 唯一性/稳定性 | 高 | **高（两域各自稳定，类型化区分）** | 高 |
| 4 | 组织树展示 | 高 | **高（骨架+作业叶子精确挂载）** | 中 |
| 5 | 任职归属 | 中（废 operation_unit_id） | **高（双引用已存在）** | 中 |
| 6 | 班组/作业单元管理 | 中 | **高（unit_type 已成熟）** | 中 |
| 7 | 乡镇/部门中心扩展 | 高 | **高（org_type 补 CHECK）** | 高 |
| 8 | 对隐患/风险/网格/费用/考核/培训/事故影响 | 大（这些域按 org_type/ou 查询，单表化需全量回归） | **小（不改 ou 侧任何引用）** | 大 |
| 9 | 迁移复杂度 | 高（DDL+数据+代码三改） | **低（代码改读侧+数据去重）** | 极高 |
| 10 | 回滚难度 | 难 | **易（department 只读保留可随时回切）** | 极难 |
| 11 | 维护成本 | 中 | **低（两域语义清晰）** | 高 |
| | **结论** | 不推荐 | **✅ 推荐** | 不推荐 |

**推荐：方案 B**。核心理由：它不是"新设计"，而是**把已经存在但没走通的结构走通**——hse_operation_unit.org_unit_id FK、employee_assignment.operation_unit_id、V2 导入的作业单元创建逻辑、20+ 处 town_center 读路径全部原样保留；需要改的只有读侧挂载（名称启发式→ID 精确）和数据治理（去重/归类），回滚成本最低。方案 A/C 都要动 13 处 FK 或全量回归 7 个业务域，收益不成比例。

## 4. 统一组织 ID 契约（第三部分）

### 4.1 ID 方案比较

| 方案 | 内容 | 判定 |
|---|---|---|
| 1. 全系统数值 ID | API/前端全部传数字主键 | ❌ 无法区分两个 ID 空间（department.id=8 与 hse_org_unit.id=8 是两个实体）——这正是 P0-01 的根因；除非同时禁止跨表同屏（不现实） |
| 2. 全系统稳定字符串 ID | 全部改 `ou_xxx` 字符串主键 | ❌ 需改 13 处 FK、22,295 行 assignment、H5 冻结链路——违反"H5 冻结"红线，否决 |
| 3. **DB 原始主键 + API 类型化资源 ID**（推荐） | DB 保持 bigint；API 层引入 `nodeType + refId` 结构化标识；字符串前缀仅作展示/路由命名空间，**永不进入外键** | ✅ 兼容全部现有 FK；类型安全；前端可判定节点归属 |

### 4.2 推荐契约（方案 3 细化）

**标识结构**：组织资源统一用二元组 `{ nodeType, refId }` 表达：

| nodeType | 含义 | refId 指向 | DB 主键 |
|---|---|---|---|
| `org_unit` | 管理组织节点 | hse_org_unit.id | bigint 不变 |
| `operation_unit` | 作业单元节点 | hse_operation_unit.id | bigint 不变 |
| `legacy_department` | 退役期 department 兼容节点 | department.id | bigint，只读 |

**七条硬规则**：
1. 数据库主键一律 bigint 自增，不改类型（13 处 FK / 22,295 行 / H5 冻结链路不动）。
2. API 资源 ID 格式：树接口返回 `{ nodeType, refId }` 结构化字段；URL 路由空间按类型分（`/api/hse/employee/departments/:id` 仅接受 legacy_department；新增 `/org-units/:id`、`/operation-units/:id`）。
3. 前端树节点 `key` = `${nodeType}:${refId}`（展示/选中用），提交任何写接口时**必须拆出 nodeType+refId 原样传**，禁止对整体 key 做 `Number()`/`parseInt()`。
4. `employee_assignment.org_unit_id` 只接受 hse_org_unit.id；`operation_unit_id` 只接受 hse_operation_unit.id——写入前服务端按 nodeType 校验，类型不符返回明确业务错误（非 500）。
5. 旧 department.id 兼容：退役期 M1-M3 内，读接口接受 legacy_department 类型并内部翻译（department.org_unit_id 映射优先，映射缺失**返回空+明确警告字段**，不再做名称前缀降级）；M4 后拒绝。
6. 历史单据：组织名称一律取历史快照字段（hse_tasks/hse_events 等已有 department_name 冗余列的继续用冗余），不做实时反查。
7. API 对非法 ID 的处理：非数字/超范围/类型不符 → HTTP 400 + `{code:'ORG_ID_INVALID', nodeType 期望值}`；**禁止**把 `'ou_15'` 传给 bigint 列（现 resolveOrgUnitId `WHERE d.id=$1` 的 22P02 错误属于契约违反，目标架构下不可达）。

**三条禁令**（任务书指定，写入契约）：
- 禁止 `Number('ou_X')` 式字符串转数字（P0-02 根因）；
- 禁止按组织名称反查组织 ID（名称匹配链 E8 全清单 M1 起只读、M4 退役；唯一的白名单例外=导入模块的显式映射规则表，见 §8.3）;
- 禁止无 ORDER BY 的 `LIMIT 1` 选择组织。

### 4.3 统一 API 契约示例

```
# 组织树（重写 getOrgTree，读侧混合→双域拼接）
GET /api/hse/org/tree?includeInactive=false
→ 200 { "list": [
  { "nodeType":"org_unit", "refId":1, "name":"宁津项目公司", "orgType":"company",
    "parentId":null, "children":[
      { "nodeType":"org_unit", "refId":8, "name":"刘营伍乡作业中心", "orgType":"town_center",
        "operationUnits":[
          { "nodeType":"operation_unit", "refId":301, "name":"刘营伍保洁一班",
            "unitType":"cleaning_team", "headcount":12 } ] } ] } ] }
# 说明：作业单元按 opu.org_unit_id 精确挂载（替代 department 名称前缀启发式）；
# 节点 id 不再是混合的 'ou_15'/123 裸值；员工数按 ea 双 ID 精确统计，取消均摊近似。

# 调岗/分配（写）
POST /api/hse/employee/org/assign
{ "employeeId": 8095,
  "orgUnit":  { "nodeType":"org_unit", "refId": 8 },
  "operationUnit": { "nodeType":"operation_unit", "refId": 301 },   // 可选
  "positionId": 1418, "startDate": "2026-11-01" }
# 服务端：nodeType 不符→400 ORG_ID_INVALID；refId 不存在→404 ORG_NOT_FOUND；
# 终态人→-4 业务码（A-02e.5-B1 已落地，保留）；成功后旧段关闭+新段创建（§7）。

# 历史兼容读（M1-M3）
GET /api/hse/employee/departments/:id/employees   # :id 仅 legacy_department 数字
→ 200 { "list":[...], "warnings":["dept 4154 已映射至 org_unit 1，建议改用 /org-units/1/employees"] }

# 非法 ID 示例
GET /api/hse/employee/departments/NaN → 400 { "code":"ORG_ID_INVALID" }
POST /org/assign { "orgUnit": { "nodeType":"operation_unit", "refId":8 } }
→ 400 { "code":"ORG_TYPE_MISMATCH", "message":"orgUnit 要求 org_unit 类型，收到 operation_unit" }
```

## 5. （并入 §4/§7）组织关系与 ID 契约整合说明

任务书第五/六部分的边界在方案 B 下合一：ID 契约（§4）定义"怎么指"，任职关系（§7）定义"指什么"。此节保留编号以对应任务书结构。

## 6. （设计输入见 §2 证据 E1-E8）

## 7. 组织关系与人员任职关系（第四部分）

围绕 employee_assignment 的设计（全部基于现有列，零新增列）：

| 设计项 | 决定 | 依据 |
|---|---|---|
| 主引用 | `employee_assignment.org_unit_id` = 管理归属（唯一必填组织引用，84.2% 已填） | FK 已存在；B-1 链路已定 employee_assignment 唯一权威 |
| 作业归属 | `employee_assignment.operation_unit_id` = 作业归属（**可选**，班组/转运站人员必填） | 列与 FK 已存在，现 4.5% 填充；M3 按人员类型补填规则见 §11-Q2 |
| position_id | 保持 | 不变 |
| dept_name | 降级为**历史快照冗余列**：新段写入时从 org_unit/operation_unit 名称生成，只读展示，不参与任何匹配 | 现状 28.7% 失配证明它已不承担关联职责 |
| Q1 多组织归属 | 维持现状约束：`uk_emp_assign_primary`（is_primary+is_current 唯一）——同一时刻至多一个**主**管理组织段 | 现有 partial unique index，不新增规则 |
| Q2 管理+作业并存 | 允许且是标准形态：org_unit_id（乡镇中心）+ operation_unit_id（该中心保洁班） | E4 双 FK 已存在；V2 导入已按此创建 |
| Q3 调岗 | 必须关闭旧段+创建新段（assignEmployee:406-411 既有范式：旧段 end_date=新start-1） | 正确范式已存在，禁止 changeAssignmentStatus 式原地改 |
| Q4 班组变化 | 班组内变化（同一管理组织下换 operation_unit）= **更新当前段 operation_unit_id + 写 history**，不新建段；跨管理组织的班组变化=调岗 | 待业务确认（§11-Q2/Q4），推荐此规则 |
| Q5 临时派驻 | 不改正式任职段；如需表达，走 remark 或后续专项（不新增列/枚举） | 缺业务依据，列入待确认 |
| Q6 兼职/借调 | 允许非 primary 段（uk 索引只锁 primary），is_primary=false | 现有索引设计已支持，待业务确认是否启用 |
| Q7 节点停用后历史段 | 保留原样展示（is_current=false 的历史段不做级联改写）；停用组织的前端展示加「已停用」标记 | B-1-P1-03-01 已确立"历史回显禁改"原则 |
| Q8 历史单据组织名 | 一律用单据内快照列（department_name/org_name 冗余），不实时反查 | E7/红线"统计与下钻同源" |

## 8. 组织映射与导入机制（第五部分）

### 8.1 resolveOrgUnitId 重设计

现状（employeeAssignmentService.js:53-108）：按 department.id 查→同名 JOIN ou→失败拼名称路径。三段全是名称/旧 ID 语义。

**新规则**（M1 生效）：
1. 入参改为结构化 `{ nodeType, refId }`（§4.2）；`resolveOrgUnitId` 收敛为纯校验函数：`SELECT id, org_path FROM hse_org_unit WHERE id=$1 AND is_deleted=false`——**只按明确 ID 查**，查不到返回 `{error:'ORG_NOT_FOUND'}`（调用方转 400/404，不静默 NULL）。
2. 传入 operation_unit 类型时校验其 org_unit_id 归属链（作业单元必须挂在目标管理组织下）。
3. 名称解析职能整体移除；`buildOrgPathFromDepartment`（:117-137，死导出）随之删除。
4. 三个调用方改造：assignEmployee:500 / rehireEmployee:758 / employeeImportService:653——统一传结构化 ID（导入侧见 §8.3）。

### 8.2 orgTreeService 统一读取（M1 核心）

1. 骨架层不变：hse_org_unit 全量 active（20 节点，parent_id 精确串联）。
2. **作业单元层替代班组层**：`SELECT id, org_unit_id, unit_name, unit_type, headcount FROM hse_operation_unit WHERE is_deleted=false` → 按 org_unit_id **精确挂载**（替代 :202-222 乡镇前缀最长命中 + :33 正则识别 + :220 挂根降级）。
3. 节点类型统一定义（§4.2 三类）；编辑/删除/移动/创建子节点按 nodeType 分派：org_unit → 恢复挂载 hse-org-center CRUD（E1：当前零写路径）并补名称判重；operation_unit → hse-org-center.js:393-466 既有 CRUD（同样需恢复挂载）；legacy_department → 只读展示（M4 退役）。
4. 员工数统计双口径合一：org_unit 层按 ea.org_unit_id；operation_unit 层按 ea.operation_unit_id（M3 补填前显示"待补齐"标记而非均摊近似，:232-242 的 `Math.round(townCount/n)` 删除）。
5. 历史兼容：department 66 行未映射记录在树中**不展示**（它们不是管理组织节点）；已映射 26 行的语义已由 ou 节点承载，退役期不重复展示。

### 8.3 employeeImportService.matchOrgPath 重设计（P1-03）

现状（:236-278）：逐级 name+parent_id 查 department，**查不到自动 INSERT**（:255-259）+ LIMIT 1 回填 org_unit_id（:261-272）。

**新规则**：
1. **禁止自动创建组织主数据**（任何表：department/hse_org_unit/hse_operation_unit）。
2. 匹配只允许两条路：①导入文件提供结构化 ID（orgUnit refId）→ 直接按 ID 校验；②仅提供组织路径文本 → 按「映射规则表」解析：`import_org_mapping (raw_path, org_unit_id, operation_unit_id, status, verified_by)`——人工审核过的映射白名单（对应 V2 的映射规则表模式 :262-331 第①级，V1 补齐同一机制）。
3. 规则表未命中 → 该行进「待处理清单」（import_records 增加 `org_unresolved=true` + 原始路径留存），**绝不选第一个匹配**；处理后再重跑该批。
4. 导入结果保留 `{rawOrgPath, resolvedOrgUnitId, matchRule}` 三元组，可审计。
5. 现存 66 行未映射 department 中的 13 个 level1 残骸+2 杂项在 M2 归档，导入历史不再依赖。

### 8.4 组织主数据唯一写入口（权限收口）

- 现状：department 写=UI(orgTreeService)+导入旁路(matchOrgPath)；hse_org_unit 写=**零**（停挂）；hse_operation_unit 写=V2 导入动态建+停挂 CRUD。
- 目标：**组织主数据写入口唯一 = 恢复挂载的 `/api/hse/org-center` CRUD**（requireRole('admin','safety_manager') + 新增独立权限码 `hse:org:manage`，与人员权限码分离），并补齐：
  1. hse_org_unit 创建/改名时的**精确同名判重**（含 is_deleted=false 范围），E1 指出当前不存在该逻辑；
  2. org_type/org_unit 写入校验（枚举白名单，见 P1-01）；
  3. operation_unit 创建必须校验 org_unit_id 存在且 org_type ∈ {town_center, center}；
  4. 全部写操作审计（auditLog module='组织管理' 现有机制沿用）。
- 导入侧（V1/V2）对组织只读+映射规则表；脚本/迁移不得在运行时写组织表（migrate_employee_v2.js:646 一次性脚本标注 archive）。

## 9. 专项缺陷修复设计（第六部分）

### P0-01：双 ID 契约冲突

- **范围**：employeeAssignmentService.resolveOrgUnitId(:53-108)、web-naive + web-antd departments.vue（:511/:528 等）、positions.vue:120/:311/:417、OrgTransferModal.vue/RehireModal.vue（:72/:156/:162 等 4 处）、orgTreeService、org-tree.js 路由、/org/assign、/org/rehire、/positions。
- **方案**：按 §4 契约整体实施——树接口返回 `{nodeType, refId}`；前端树 key=`type:id` 拆分使用；resolveOrgUnitId 重写（§8.1）；写接口服务端类型校验。**不是**把 Number() 换成 parseInt()。
- **测试要求**：①单元——resolveOrgUnitId 对 ou_X 串/NaN/不存在 ID/类型错配四类入参的明确错误码；②前端——树选中 ou 节点提交调岗（mock）不再产生 NaN URL；③集成——dev 对 8 号 ou 执行一次分配往返（测试环境数据）。

### P1-01：org_type 枚举治理

- **修复点**（全仓清单 E6）：warningCenterService :281/:323 `'township'`→`'town_center'`；assessmentService :400/:1099/:1169/:1210 与 executiveCockpitService :754 `'operation_center'`→删除该值（department/center 已覆盖语义，town_center 语义由外层处理——**需逐处核对业务意图**，见下）；leaderDashboardService :119 `'park'` 待确认（dev 零行）。
- **枚举校验机制**：①DB 层 `ALTER TABLE hse_org_unit ADD CONSTRAINT ck_org_type CHECK (org_type IN ('company','department','center','town_center'))`（M2 执行，需 DDL 授权）；②代码层新增 `server/constants/orgDict.js` 导出 `ORG_TYPES` 常量，所有 `org_type=` 字面量改引常量（新增代码强制）；③前端字典同步（departments.vue 等三文件）。
- **operation_center 语义核对**：该死枚举在考核域 5 处的意图是「部门+中心+乡镇」——dev 实态中 center(2)≠town_center(12)，改为 `('department','center','town_center')` 会**扩大**统计面（12 乡镇进入），属业务口径变化，列入 §11-Q6 待确认，修复前标注不单独实施。

### P1-02：departments 复数表

- 依赖清单：hseTasksService 5 处 / hse-chain.js:199 / statisticsService.js:601（E7）。
- 开发库真实结构：department 旧版窄列集（0 行）。
- 迁移来源：无活跃 CREATE TABLE（仅 dump 备份命中）。
- **生产未确认前不删除**（任务书红线）。分两支：
  - 生产有表且有数据 → 替代方案=按 §2.1 矩阵把 7 处引用改到 department/org_unit（M2），表进退役清单；
  - 生产无表 → 7 处引用在生产是**运行时 SQL 错误**（/api/hse/tasks 全挂），M1 优先修复引用（改 JOIN department 或直接删冗余 JOIN——hse_tasks 自身有无 department_name 快照待查）。
- 判定替代可行性：hse_tasks.department_id 语义悬空（ department 还是 ou？）→ M2 以 dept_name 快照 + ea 关联替代，department_id 列冻结不再写入。

### P1-03：导入自动创建部门

- 方案见 §8.3（映射规则表 + 待处理清单 + fail-closed）。
- 兼容考虑：既有导入模板不改（组织路径列保留）；历史组织路径通过规则表批量预审一次性入库（M2 人工任务）；无法匹配记录重试机制=修复规则表后整批重跑，导入本身幂等（V1 关段/建段已有 rowCount 校验，B-1-P1-02-D）。

### P1-04：名称匹配与 LIMIT 1 全仓治理

- 对象=E8 全清单（14 处）。分三档处置：
  - **M1 删除**：orgTreeService :430/:475（=|LIKE LIMIT 1）、:202-222 前缀挂载、:232-242 均摊、employeeImportService :255-272 自动建+回填——这些随 §8.2/§8.3 重写自然消失。
  - **M2 改 ID**：resolveOrgUnitId、employeeImportV2Service :262-331（保留规则表级，删 2-5 级模糊）、rosterImportService（改规则表）、trainingRegisterService :50-91（改 org_id 直传）、ruleEngine 四 adapter（org_name 过滤改 org_unit_id 传参）。
  - **M3 审查**：leaderDashboardService/hazardService/accidentService 的展示性短名匹配（includes 子串）——只影响展示文案不影响归属，逐一加注释+TODO，不阻塞主线。
- 原则：不通过「加 ORDER BY」掩盖歧义（任务书 §八），多候选=数据问题，暴露给映射规则表人工裁决。

## 10. 分阶段迁移路线（第七部分）

### M0：目标模型与契约冻结（本报告 + 04-02B 业务确认）

- 产出：本报告 §2-§8 冻结；§11 七项业务确认完成；04-02B 输出业务规则定案。
- 前置：本报告通过独立架构审查。
- 停止条件：§11 任一项影响架构基形的决策未决（如班组不独立建模）→ 回到方案比选。

### M1：基础代码兼容（纯代码，零数据迁移）

- 范围：`{nodeType, refId}` 契约落地——orgTreeService 树重写（§8.2）、resolveOrgUnitId 重写（§8.1）、前端 6 文件拆 key、P0-01 全链路、P1-01 枚举常量化（DB CHECK 除外）、hse-org-center 恢复挂载+判重（§8.4）。
- 不迁移任何数据；department 读路径保持兼容（legacy_department 类型）。
- 测试：orgTreeService 新测（挂载/计数/兼容三分支）、resolveOrgUnitId 四类非法入参、前端树交互；员工域+组织域全量回归 ≥ 基线。
- 验收：dev 全链路（树→选择→调岗→回显）零 NaN/零 22P02；ou 节点可编辑删除。
- 回滚：纯代码 revert；无数据变更。
- 停止条件：任一业务域回归出现新失败。

### M2：数据映射治理（DDL + 数据，dev 先行）

- 范围：org_type CHECK 约束；department 12 组重复行去重（level5/level6 同名保留 1）；13 level1+2 杂项归档（is_deleted）；51 班组与 51 cleaning_team 对拍并建立 operation_unit_id 补填映射表；departments 复数表 7 处引用改源；positions.dept_id 存量核对。
- 前置：M1 验收 + 生产 departments 表核实（§14）。
- 验收：dev 映射率 26/26→14 实体全对齐；多对一清零；CHECK 生效（非法枚举写入被拒）。
- 回滚：迁移 SQL 逆向脚本 + department 数据 beforeSnapshot 全量备份。
- 停止条件：去重对拍出现语义冲突（同名实异）→ 单条挂起人工裁决。

### M3：人员任职关系收敛

- 范围：ea.operation_unit_id 补填（4.5%→按人员类型规则推进，§11-Q2）；dept_name 降级为快照（写入路径改造）；班组变化=更新段规则落地（§7-Q4，若业务确认）；历史段零改写验证。
- 验收：树上班组人数 = operation_unit_id 精确统计（取消均摊误差）；dept_name 失配率仅剩历史段。
- 回滚：operation_unit_id 补填可整体置 NULL 回退（列本就可空）。
- 停止条件：补填规则与业务实际归属冲突率 >5% → 暂停改规则表。

### M4：旧组织模型退役评估（只读评估→清单，不直接删）

- 对象：department（M2 后仅剩兼容读）、departments 复数表、hse_employee_org（已是死表）、旧视图引用、hse-org-tree 旧端点、前端旧页。
- 产出：退役清单+影响面报告（类似 04-01 模式），**生产核实前不执行任何删除**。
- 停止条件：任一未识别消费方在退役演练中出现。

## 11. 业务待确认事项（第八部分）

| # | 事项 | 当前系统事实 | 可选方案 | 推荐 | 业务影响 | 不确认可否继续 |
|---|---|---|---|---|---|---|
| Q1 | 班组是否独立作业单元 | 班组现三种表达（department 51/operation_unit.cleaning_team 51/正则识别）；作业单元表已活跃 | ①独立=hse_operation_unit（方案B）②并入管理组织（方案A） | ① | 决定 M2 对拍方向；树形态 | **否**——M0 冻结前置 |
| Q2 | 正式任职组织与实际作业组织可否不同 | ea 双 FK 已存在；4.5% 填作业归属 | ①管理/作业可不同（双引用）②作业归属必挂管理组织内 | ②（作业单元必须挂在任职管理组织下，跨挂=调岗） | 调岗/统计口径 | M1 可继续；M3 前须确认 |
| Q3 | 临时派驻改不改正式段 | 无派驻表达（仅 remark） | ①不改段 ②非 primary 段 | ①，量少走 remark | 低 | 可继续（默认①） |
| Q4 | 班组内变化是否算调岗 | 现状班组变化无独立语义 | ①更新当前段 operation_unit_id+history ②一律关段新建 | ① | 履历展示密度 | M3 前须确认 |
| Q5 | 兼职/借调/跨区域 | uk 索引允许多个非 primary 段 | ①启用非 primary 段 ②不支持 | ①按需启用，暂不宣传功能 | 低 | 可继续 |
| Q6 | 乡镇/街道/部门中心层级是否固定 | org_type 四值；'operation_center' 死枚举 5 处的业务意图待核 | ①四值冻结+CHECK ②扩枚举 | ① | P1-01 修复口径（考核统计面变化） | P1-01 的 operation_center 5 处修复须确认后执行 |
| Q7 | 组织负责人须本组织正式员工？ | hse_org_unit.manager_id 无活消费者；dept.manager_id 66 行未映射区 | ①启用校验 ②先不启用 | ②（M0 阶段无校验，字段保留） | 低 | 可继续 |

**技术实现细节（ID 契约、API 格式、迁移阶段划分）不列入待确认——属本设计职权，已定案。**

## 12. 测试与验收设计（汇总）

- 单元：orgDict 常量、resolveOrgUnitId 新签名、树构建器、导入映射规则匹配器。
- 集成：dev 环境「树→选节点→调岗→任职回显→历史展示」全链路；ou 节点 CRUD（恢复挂载后）。
- 回归：员工域+组织域全量 jest ≥ 基线（787/790 参照）；两前端 build + 类型检查（key 拆分处）。
- 数据验收（M2/M3）：映射对拍表、去重审计（before/after 行数+指纹）、operation_unit_id 填充率。
- 每阶段产出 beforeSnapshot（04-01 惯例沿用）。

## 13. 回滚与停止条件（汇总）

- M1 代码回滚=git revert（零数据）；M2/M3 数据回滚=逆向迁移 SQL + 快照恢复；M4 无执行仅清单。
- 全局停止条件：①生产 departments/组织数据核实结果与 dev 结构性不一致；②§11 Q1/Q2/Q6 任一决策推翻方案 B 基形；③任一阶段回归劣于基线；④H5 冻结链路出现任何需要触碰的情形（红线）。

## 14. 仍未确认的生产数据事项

1. 生产 `departments` 复数表：存在性/行数/外部写入方（决定 P1-02 是"改源"还是"修 500"）。
2. 生产 `department` 92 行的对应实态（映射率/重复行是否同样 12 组/13 个 level1 残骸是否同样存在）。
3. 生产 `hse_org_unit` 是否仍为 20 节点、org_type 分布是否同 dev 四值（决定 CHECK 约束的枚举集）。
4. 生产 `hse_employee_org` 触发器是否同样在位（若生产无触发器且有人工写入，死表结论升级为 P0 数据风险）。
5. 生产前端实跑版本（web-naive / web-antd 双轨哪套在生产路由激活——决定 P0-01 前端修复的验证环境）。
6. 生产 `position.dept_id` 指向 department.id 的存量行数（M2 迁移量评估）。

## 15. 交付清单（任务书 §十三）

- 仓库：ljt8825-hash/HSE；分支：feat/b02-dec-03.13-a02d-status-code
- 起始 HEAD：`7a653a0`；报告 commit：见提交后回填；远端 HEAD：推送后核验
- 报告路径：`docs/project-control/B-1-P1-04-02A/B-1-P1-04-02A-ORGANIZATION-TARGET-ARCHITECTURE.md`
- 工作区变化：仅新增本报告文件；业务代码/前端/DB 零改动
- cost.js：staged `A` + MD5 `e88ae2b0b275346dfc1431408aa00bff` 全程不变
- 已确认：现状七对象矩阵（§2）、推荐方案 B、ID 契约方案 3、M0-M4 路线
- 待确认：§11 业务七项 + §14 生产六项
- 纪律声明：本节点零代码/零 DDL/零生产写入；报告独立 pathspec 提交；**上传后立即停止**，不自行宣告通过，不启动 M0 或任何实施。

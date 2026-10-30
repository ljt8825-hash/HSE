# B-1-P1-04-01 旧组织模型依赖与数据关系审计报告

> 节点：B-1-P1-04-01（只读审计，零代码改动、零 DDL、零生产写入）
> 日期：2026-10-30
> 分支：`feat/b02-dec-03.13-a02d-status-code`，基线 HEAD：`5d1a302`（远端=本地已核验）
> 审计对象：`department` / `hse_org_unit` / `hse_employee_org` 及全仓读写依赖、前端消费者、dev 数据实态
> 方法：主对话源码精读（orgTreeService.js 514 行全文 + 端点层 144 行）+ 三路 Explore 并行审计（department 读写 / hse_org_unit·hse_employee_org·视图迁移 / 前端与接口消费者）+ dev 库 READ ONLY 事务数据验证（每批首条 SQL 断言 `current_database()=safety_dashboard_dev` 且 `transaction_read_only=on`）
> 交叉验证：子代理关键结论（P0-1 / P0-2 / org_type 死枚举 / hse-org-center 停挂）均经主对话实码或 dev 实态复核

---

## 一、审计基线

- 基线 HEAD `5d1a302`（B-1-P1-03-02-R1 报告提交），`git fetch` 后远端 origin 同分支 = 本地，无漂移。
- 工作区 51 个 tracked M 文件均为基线既有状态，本节点零源码改动。
- `server/routes/cost.js`：git 状态 `A`（staged）、MD5 `e88ae2b0b275346dfc1431408aa00bff`，与本节点前完全一致。
- dev 探针全部在 `BEGIN TRANSACTION READ ONLY` 内执行并 COMMIT 收尾，无任何写操作。

## 二、三套组织载体总览（结论先行）

| 载体 | 定位 | 活性 | dev 实态关键事实 |
|---|---|---|---|
| `hse_org_unit` | 新组织骨架（V1.0 架构 L1 真主数据，13 FK 引用） | **活** | 20 行 active；`org_type` 分布 town_center 12 / department 5 / center 2 / company 1；`parent_id` 1 根 + 19 子、断链 0；被 `employee_assignment.org_unit_id` FK 引用（22,295 段 84.2% 有值，孤儿 0）；**org_type 无 CHECK 约束** |
| `department` | 旧班组/部门表（五级树之叶子） | **活但退化** | 92 行 active；仅 26 行有 `org_unit_id` 映射（→14 ou：2 单挂 + 12 双挂）；66 行前缀无匹配；`parent_id` 28 行空；孤儿 0 |
| `hse_employee_org` | 五级模型设计载体（集团/区域/企业/项目/班组） | **完全死表** | 1,285 行被三向触发器 `fn_hse_employee_org_read_only()` 冻结；employee_id **100% 孤儿**（1,285/1,285 指向已不存在的员工）；五级列只填 group(1,285)/region(1,277) 两级，enterprise/project/team 全 0；与 assignment 当前段员工**零重叠**（3,238 vs 1,285） |

影子表 4 张全部 0 行：`departments`（曾带 township/sort_order 的旧版部门表）、`org_personnel`、`org_personnels`、`hse_statistics_dept`；`backup_96_hse_org_unit`（20 行）属架构基线排除的 backup_9x_ 范围。

**核心判断**：现行组织实态是「双活 + 一死」——`hse_org_unit`（骨架，FK 硬引用）与 `department`（班组叶子，名称软关联）双活并存，由 `orgTreeService.getOrgTree` 读侧硬拼接；`hse_employee_org` 是五级模型的历史残骸，仅剩档案价值。

## 三、orgTreeService.js 精读结论（主对话全文 514 行）

### 3.1 getOrgTree（:13-265）——两表混合读

1. **骨架**（:19-23）：`hse_org_unit` 全量 active 读取，合成 ID `'ou_' + id`（:110/:125）。
2. **班组识别正则**（:33）：`/([\u4e00-\u5341])班$|^车队$|^片区$|.*片区$/`——按**名称形态**判定 department 行是否为班组叶子，非结构化字段。
3. **员工数双口径**：ou 层按 `employee_assignment.org_unit_id` 精确统计（:44-54）；班组层按 `dept_name = department.name` **名称关联**（:140-150），挂不上单一乡镇的做**父乡镇均摊近似** `Math.round(townCount / n)`（:232-242）——班组人数是近似值。
4. **挂载规则**（:206-222）：班组按乡镇前缀**最长命中**挂 ou；不命中**静默挂根**（:220），无告警。
5. **双 ID 空间并存**：返回树同时含 `ou_` 合成串与 department 数字 id（详见 §七）。

### 3.2 createDepartment（:399-449）

- INSERT 后回填 `org_unit_id`：`SELECT id FROM hse_org_unit WHERE (org_name = $1 OR org_name LIKE $1 || '%') LIMIT 1`（:430）——**无 ORDER BY**，多候选命中行不稳定。
- 匹配失败**不写** org_unit_id（保持 NULL），新增仍成功——规则 A「失败=留空」。

### 3.3 updateDepartment（:452-491）

- 改名后重跑同一 LIMIT 1 查询（:474-477）；匹配失败 → **显式置 `org_unit_id = NULL`**（:479）——规则 B「失败=清空」。
- **与规则 A 不一致**：改名致匹配失败会把原本成功的映射清掉。当前 dev 前缀多候选为 0 例（§五-4），LIMIT 1 无排序暂无实害，但结构上无防护（仅靠数据巧合）。
- 前缀匹配链：`(org_name = $1 OR org_name LIKE $1 || '%')` 精确匹配优先无保证——PostgreSQL OR 条件无顺序语义，同名与前缀命中混在一起靠 LIMIT 1 抽签。

### 3.4 listDepartmentEmployees（:279-396）

- `ou_X` 合成 ID 走 ou 分支（:315）；跨 ID 空间 bug 曾在此修复（:323 注释）。
- 员工归属解析：`org_unit_id` 映射优先 + 名称前缀降级（:330-352）——降级路径与 getOrgTree 共用「乡镇前缀」启发式。

### 3.5 deleteDepartment（:494-505）

- 软删，有子部门拒绝；不触碰 `org_unit_id` 与 hse_org_unit——删除行为收敛。

## 四、端点层与权限（org-tree.js 40 行 + hse-org-tree.js 104 行）

挂载 `routes/hse-employee.js:33`，契约 `/api/hse/employee/departments*`：

| 端点 | 方法 | 权限中间件 | 备注 |
|---|---|---|---|
| `/departments/tree` | GET | **无** | 树读 |
| `/departments` | GET | **无** | 扁平列表 |
| `/departments/:id/employees` | GET | **无角色校验**，仅 `decryptMiddleware` | 员工列表含 PII |
| `/departments` | POST | `requireRole('admin','safety_manager')` + `hse:personnel:create` | 写 |
| `/departments/:id` | PUT | 同上（update） | 写 |
| `/departments/:id` | DELETE | 同上（delete） | 软删 |

- controller 全薄；写操作带 `auditLog`（module='组织管理'，`.catch(() => {})` 吞错）。
- **权限发现**：读端点（含 PII 员工列表）无角色校验——与员工域其他读端点同构（`hse-employee.js` 域整体宽松），定级 P2（域级既有口径，非本模块新增风险）。
- `isConnected()` 为假时读端点返回 `success([], '数据库未连接')`——静默空态。
- `hse-org-center.js` CRUD 路由已在 `app.js:515-517` 注释停挂（「作业中心已合并至组织管理」），文件保留作参考——**无运行时入口**。

## 五、dev 库数据实态验证（READ ONLY，15 项）

| # | 验证项 | 结果 |
|---|---|---|
| 1 | department.org_unit_id | 98 总 / 92 active / 6 删；active 中 26 有映射、66 空；**孤儿 0** |
| 2 | 映射形态 | 26 dept → 14 ou：2 单挂 + **12 双挂**（每 ou 恰 2 dept）；一对多为主 |
| 3 | 精确重名 | **2 例**：`宁津项目公司`(4154↔ou1)、`人力综合部`(4155↔ou3)，均已正确指向同名 ou |
| 4 | 前缀多候选 | **0 例**（66 无匹配 / 26 单匹配 / 0 多匹配）——LIMIT 1 无排序暂无实害 |
| 5 | department.parent_id | 64 有 / 28 空 / **断链 0** |
| 6 | hse_org_unit.parent_id | 19 有 / 1 根 / **断链 0** |
| 7 | assignment.org_unit_id | 22,295 段 84.2% 有值，孤儿 0（FK `fk_employee_assignment_org_unit` ON DELETE SET NULL 保证）；**表无 department_id 列**——assignment 只认 hse_org_unit |
| 8 | dept_name ↔ department.name | 全 22,295 段均填：精确匹配 15,888（71.3%）/**不匹配 6,407（28.7%）**；当前段 3,238 中不匹配 575（**17.8%**） |
| 9 | hse_operation_unit.org_unit_id | 89/89 全有，孤儿 0 |
| 10 | hse_employee_org | 1,285 行全 current；**orphan employee 100%**；五级填充 group 1,285/region 1,277/enterprise 0/project 0/team 0；与 assignment 当前段 **overlap=0** |
| 10-附 | 冻结机制 | 三触发器 `trg_hse_employee_org_block_{insert,update,delete}` → `fn_hse_employee_org_read_only()` 数据库层硬拦截 |
| 11 | 影子表 | departments/org_personnel/org_personnels/hse_statistics_dept 全 0 行；backup_96 20 行（排除范围） |
| 12 | org_type 分布 | town_center 12 / department 5 / center 2 / company 1；**无 'township' 值**；**无 CHECK 约束**（pg_constraint 0 行） |
| 13 | 三视图存在性 | `v_employee_org_full` / `v_employee_current` / `v_employee_risk_profile` 均存在（B-1-P1-02 已统一改 employee_assignment 版） |
| 14 | 双挂明细 | 14 个被映射 ou 全部为乡镇中心级；`string_agg` 实证每 ou 挂 1-2 个 department（如片区 + 班组形态） |

## 六、全仓读写依赖清单（三路 Explore 整合）

### 6.1 department 读写清单（explore-dept + 主对话实码复核）

**写路径（两处，非单点）**：
1. `services/orgTreeService.js`：createDepartment(:399)/updateDepartment(:452)/deleteDepartment(:494)——UI 入口，POST/PUT/DELETE 有角色+权限中间件。
2. `services/employeeImportService.js:236-278` `matchOrgPath`（**主对话实码复核成立**）——V1 导入域写入口：orgPath 逐级按 `name + parent_id` 查 department，**查不到即自动 INSERT 新部门**（:255-259，dept_code 为时间戳随机串 `DEPT_...`），并就地用与 orgTreeService 同型的 `(org_name = $1 OR org_name LIKE $1 || '%') LIMIT 1 无 ORDER BY` 回填 org_unit_id（:261-272，注释「提示词-112 T3.3」）——**导入旁路绕过 UI 权限校验自动造部门**，且把 LIMIT 1 无排序风险复制了一份。V2 导入（employeeImportV2Service）不写 department。

**读路径（按耦合深度排序）**：
1. `services/orgTreeService.js` getOrgTree(:13)/listDepartments/listDepartmentEmployees(:279)——主读，两表混合。
2. `services/employeeAssignmentService.js` :70-76 `resolveOrgUnitId`——department.id → hse_org_unit.org_name 同名 JOIN（**只认精确同名**，当前 dev 仅 2 例命中 ⇒ 其余解析必落 NULL 回退，`org_unit_id` 为空段 15.8% 的成因之一）。
3. `services/warningCenterService.js:281/:323`——`org_type IN ('department','center','township')`，**'township' 不存在**（实存 town_center 12 行）→ 乡镇中心被静默漏统计（无 CHECK 约束 ⇒ 不报错）。**主对话实码复核成立**。且该扫描由 **node-cron 定时任务驱动（模块加载即注册：每日 2:00 预警扫描 + 每小时增量）**——生产环境每天都在跑这条死枚举查询，属定时副作用而非懒接口。
4. `services/assessmentService.js:400`——`org_type IN ('department','operation_center','center')`（'operation_center' 在 dev 零行——死枚举第二例）。
5. `services/hseTasksService.js` **5 处** `LEFT JOIN departments d`（:48-56 列表、:78-84 详情等，主对话实码复核 2 处）+ `routes/hse-chain.js:199`（`SELECT ... FROM departments WHERE id=$1`）——全部 JOIN **`departments` 复数表**（dev 0 行）。
6. `services/statisticsService.js:581-603`——部门排名 JOIN `departments`（同上，恒空）。
7. 其余只读引用（explore-dept 全文检索）：`employeeHistoryService`（履历展示部门名）、`positionService`（岗位-部门）、`hazardRectificationService`（整改责任部门）、`inspectionCenterService`（检查中心归属）——均为按 department.id 取名称的弱读，无 JOIN departments 复数表。

** departments 复数表 schema 漂移（新增 P1）**：`hseTasksService`(5 处)/`hse-chain.js:199`/`statisticsService:601` 共 **7 处活代码** JOIN/查询 `departments` 复数表——该表 dev 0 行、**仓库迁移文件中无 CREATE TABLE**（explore-dept 全 sql/ 目录检索确认）；dev 现存表结构（id/name/short_name/parent_id/township/sort_order）系手工或历史迁移残留。生产若同样 0 行 ⇒ 任务列表/事件链的 department_name 恒 NULL（LEFT JOIN 不报错，静默）；生产若**无此表** ⇒ `/api/hse/tasks` 直接 SQL 报错。

### 6.2 hse_org_unit / hse_employee_org / 视图迁移（explore-ou）

- **hse_org_unit 写路径**：`orgUnitManagementService.js`（createOrgUnit/updateOrgUnit 等）+ 迁移 SQL。**org_name 同名检查**（`orgNameExists`）与 orgTreeService 的 `(=|LIKE)` 检查**口径不一致**：前者只查精确同名，后者接受前缀——同一组织名可能被一处判重通过、另一处挂载到不同节点。
- **循环依赖链（D 专项）**：`createOrgUnitLike`/`updateOrgUnitLike` 构建 org_path 时需读父节点 → 父节点 org_path 又由同函数族生成；orgTreeService 挂载 department 时依赖 org_name 前缀，而 orgUnitManagementService 改名不回查 department.org_unit_id——**两服务各自演化、互不通知**，改名后树挂载与 org_path 双双失真。
- **hse_employee_org 死表**：三触发器冻结（dev 实证）；`resolveOrgUnitId` 注释仍写「方案1：hse_org_unit 有对应字段」指向该表五级结构——**代码注释与数据实态脱节**，误导后续维护。
- **视图迁移链**：`v_employee_org_full`（B-1-P1-02 已改 assignment 版）/ `v_employee_risk_profile`（同批修复）；`_93_view_hardening_run.sql` 硬化清单基于**旧列集**，重放会与新视图定义冲突——归 B-1-P4 视图收敛节点处理，本节点仅登记。
- **assessmentService:400 死枚举**：'operation_center' 零行（实存 town_center）——与 warningCenterService 'township' 同型，均为「枚举凭记忆写、无 CHECK 兜底」。

### 6.3 前端与接口消费者（explore-fe2）

**P0-1｜`resolveOrgUnitId` 无 `ou_` 前缀处理**（主对话实码复核 ✅）：
`services/employeeAssignmentService.js:53-108` 将入参 ID 无条件按 `department.id` 查（`WHERE d.id = $1`）。前端组织树选择器传 `ou_15` 合成串时，`d.id = 'ou_15'`（bigint 比较）在 PG 报 `invalid input syntax for type bigint` → 调岗/分配接口 500；若前端剥前缀传数字，则语义仍是 department.id ≠ ou.id，**错绑**。

**P0-2｜web-naive departments.vue `Number(id)` 产生 NaN**（主对话实码复核 ✅）：
`安全看板vben/apps/web-naive/src/views/hse/employee/departments.vue:511`（updateDept）与 `:528`（deleteDept）对树节点 id 直接 `Number()`——`Number('ou_15') = NaN`，发出 `PUT/DELETE /api/hse/employee/departments/NaN`。后果：ou 骨架节点的编辑/删除**必然失败**（路由匹配 :id='NaN'，pg bigint 转换报错），且用户看到的是拦截器错误而非明确提示。vben/web-antd 同名文件待生产核验（§十三）。

**P1-3｜web-antd 与 web-naive 双前端同页并存**：`安全看板vben/apps/web-antd/src/views/hse/employee/departments.vue` 与 web-naive 版本并存，二者对同一组端点的 ID 处理不一致——收敛前端前，双 ID 修复必须两份同改。

**P1-4｜部门统计接口空转**：statisticsService.js:601 JOIN `departments`（0 行表）→ 部门排名前端页面拿到的是恒空数据，无错误、无告警（与 §6.1-5 互证）。

**R3｜名称匹配链四点串联**（与主对话 §3.2/3.3 互证）：
`createOrgUnitLike 判重（精确）→ orgTreeService 挂载（前缀）→ updateDepartment 回填（=|LIKE + LIMIT 1 无序）→ resolveOrgUnitId（精确同名）`——四条链路三种口径，同一组织名在不同链路解析出不同归属。

**R4｜统计服务按 township 名称硬拼部门清单**：报表类服务以乡镇名称字符串列表过滤（未走 department/org_unit 关联），部门改名即静默失配——与 getOrgTree 前缀挂载、dept_name 关联同属「名称即外键」反模式家族。

**R5｜PII 解密与列表契约**：`/departments/:id/employees` 经 `decryptMiddleware(ENCRYPT_FIELDS)`，双 ID 混用时 ou 分支与 department 分支返回字段结构不同（camelCase 差异），前端两套解析并存。

## 七、双 ID 空间专项（汇总）

| ID 空间 | 产生点 | 消费点 | 断裂点 |
|---|---|---|---|
| `ou_<id>` 合成串 | orgTreeService.getOrgTree :110/:125 | 前端树 selectedKeys、listDepartmentEmployees :315（已剥前缀）、**departments.vue Number(id)→NaN（P0-2）**、**resolveOrgUnitId 不识别（P0-1）** | 前端编辑/删除 ou 节点、后端分配解析 |
| department 数字 id | department.id | updateDept/deleteDept/listDepartmentEmployees department 分支 | 与 ou_ 空间在前端 selectedKeys 里混存 |
| hse_org_unit 数字 id | ou.id | assignment.org_unit_id（FK）、getOrgTree :44-54 | 无直接 API 暴露（仅合成串） |

历史上 `listDepartmentEmployees` 的跨 ID 空间 bug（:323 修复注释）证明该断裂模式已实际发生过一次；当前 P0-1/P0-2 是同型未修案例。

## 八、风险分级

| 级 | 项 | 依据 | 影响 |
|---|---|---|---|
| **P0** | P0-1 resolveOrgUnitId 无 ou_ 处理 | employeeAssignmentService.js:53-108（实码复核） | 组织树选择器发起的调岗/分配 500 或错绑 |
| **P0** | P0-2 前端 Number('ou_X')=NaN | web-naive departments.vue:511/:528（实码复核） | ou 骨架节点编辑/删除必失败 |
| **P1** | warningCenterService 'township' 死枚举 | :281/:323（实码+dev 复核：实存 town_center 12 行，无 CHECK） | 12 个乡镇中心在预警中心**静默漏统计** |
| **P1** | assessmentService 'operation_center' 死枚举 | :400（dev 复核零行） | 考核域组织过滤漏 town_center |
| **P1** | 名称匹配链三口径（=|LIKE 无序 / 精确 / 前缀） | §3.2/:430、§3.3/:474-479、§6.2 | 改名/新建时挂载漂移、映射清空（update 清空 vs create 留空不一致） |
| **P1** | statisticsService JOIN departments 0 行表 | :601-603 | 部门排名恒空、静默 |
| **P1** | **departments 复数表 schema 漂移**：7 处活代码引用（hseTasksService 5 处/hse-chain.js:199/statisticsService:601），仓库无 CREATE TABLE | explore-dept 检索 + 主对话实码复核 2 处 | 生产 0 行 ⇒ department_name 恒 NULL；生产无表 ⇒ /api/hse/tasks 直接报错 |
| **P1** | **导入旁路自动建部门**：matchOrgPath 查不到即 INSERT（:255-259）+ 复制 LIMIT 1 无排序回填（:261-272），绕过 UI 权限 | 主对话实码复核成立 | 部门表可被导入数据静默膨胀；org_unit_id 错绑风险复制第二份 |
| **P1** | update:479 匹配失败清空 org_unit_id | :479（与 create :433 规则不一致） | 改名即丢映射，且无审计提示 |
| **P2** | 读端点无角色校验（含 PII 员工列表） | org-tree.js:23-29 | 域级既有口径，登录即可读 PII |
| **P2** | 班组人数均摊近似 + 名称关联 | getOrgTree :140-150/:232-242 + dept_name 失配 17.8%（当前段） | 树上人数与实态偏差 |
| **P2** | 71 行 department 无映射 / 28 行 parent_id 空 | dev 实测 §五-1/5 | 历史脏数据，树展示依赖前缀启发式 |
| **P2** | _93 SQL 硬化清单基于旧视图列集 | explore-ou §视图 | 重放冲突（归 B-1-P4） |
| **P3** | hse_employee_org 死表（冻结+100% 孤儿） | §五-10 | 仅档案价值；代码注释误导 |
| **P3** | 影子表 4 张 0 行 | §五-11 | 清理候选 |

## 九、生产待核验项（dev 数据不可外推清单）

1. 生产 `department` 行数、org_unit_id 映射率、前缀多候选——dev 92 行/0 多候选，生产规模未知（生产运行时长更长，多候选概率更高 ⇒ LIMIT 1 无排序风险随规模放大）。
2. 生产 `hse_org_unit.org_type` 分布（'township'/'operation_center' 死枚举在生产是否同样零行）。
3. 生产 `hse_employee_org` 是否同样冻结 + 孤儿（若生产有人为解锁写入，性质升级）。
4. web-antd 前端 departments.vue 是否同样存在 Number(id) 缺陷（dev 仓库同构，生产构建版本待对）。
5. 生产 `departments`/`org_personnel` 等影子表行数。
6. 生产 departments.vue 实际调用面（当前生产前端是哪套：web-naive / web-antd / vben 的路由挂载实况）。

## 十、治理建议（供 B-1-P1-04-02 组织收敛方案输入，本节点不实施）

1. **双 ID 空间统一**（对应 P0-1/P0-2）：后端 API 层接收 ID 统一入口剥 `ou_` 前缀并区分目标表；或前端树节点携带 `nodeType` 字段显式区分（推荐后者+前者防御性双做）。涉及 employeeAssignmentService.resolveOrgUnitId、departments.vue 两份、orgTreeService 参数解析。
2. **死枚举修复**（P1）：'township'→'town_center'、'operation_center'→实存枚举；给 `hse_org_unit.org_type` 补 CHECK 约束（需 DDL 授权，生产须走 N-02-A 通道）。
3. **名称匹配链统一**（P1）：四链路收敛为「精确同名优先，前缀命中需唯一才接受，多候选显式报错」；create/update 失败行为统一（推荐均「留空+warning 日志」，不静默清空）。导入侧 matchOrgPath（employeeImportService.js:236-278）应停止自动建部门（改为 fail-closed：orgPath 无法完整匹配即整行标记待确认），与「HSE 数据导入遇异常必须标记待确认、禁止静默修改」的用户既有纪律对齐。
4. **statisticsService/hseTasksService/hse-chain 数据源收敛**：departments(0 行)→department 或 hse_org_unit；hse_tasks.department_id 所指实体需在 04-02 方案中裁定（该列语义当前悬空）。与「统计与下钻同源」红线一致。
5. **hse_employee_org 处置**：维持冻结不动（P3）；仅在收敛方案文档登记「五级模型设计载体已废弃」结论，消除注释误导。
6. **影子表清理**：4 张 0 行表列退役清单（须 DB-INT 授权，本节点不动）。
7. **读端点权限**：随员工域整体权限收敛批次处理（P2，不单独立项）。

## 十一、与架构基线 V1.0 对照

- 架构基线 L1 真主数据 = employee/hse_org_unit/position——本审计确认 hse_org_unit 地位与基线一致，department 属**过渡期兼容层**（getOrgTree 读侧拼接是唯一黏合点）。
- 基线「7 层架构」中组织树服务横跨 L1（主数据读）与 L3（网格挂载）——前缀挂载启发式是 L3 对 L1 的逆向依赖，收敛方案应把「乡镇-组织」关系显式化（结构化字段而非名称前缀）。
- 基线 P0-2 遗留（overview.js 直读 Excel 残留表）与本节点发现的 statisticsService JOIN 0 行表同属「统计链路数据源失真」家族，建议在 04-02 方案中一并立项。

## 十二、方法学记录

- 三路 Explore 并行覆盖 B/C/F/G/H 章；主对话负责 A（orgTreeService 精读）、D/E（create/update 映射规则）、端点权限、dev 数据验证。
- 子代理 5 项关键结论（P0-1/P0-2/org_type 死枚举/hse-org-center 停挂/matchOrgPath 导入旁路）全部主对话实码或 dev 实态复核后才入报；fe2 报告中 statisticsService 的「township 硬拼」描述与实码有出入（实为 JOIN departments 0 行表 + org_type 过滤），已按实码修正；explore-dept 报告推翻主对话预填的「写入口唯一」假设（matchOrgPath 第二写入口），已实码复核后修正 §6.1。
- psql 中文 SQL 经 UTF-8 临时文件执行；`employee_assignment` 无 department_id、`hse_employee_org` 无 org_unit_id 两次列名失配均以 `\d` 实际结构修正后重跑。

## 十三、附录：证据索引

- dev 探针 SQL：`.workbuddy/tmp/org-audit-p1-04-01-{,b,c,d,e}.sql`（READ ONLY，COMMIT 收尾）。
- 实码复核点：employeeAssignmentService.js:53-108；web-naive departments.vue:511/:528；warningCenterService.js:281/:323；app.js:515-517；employeeImportService.js:236-278（matchOrgPath 导入旁路）；hseTasksService.js:48-56/:78-84（JOIN departments）；hse-chain.js:199。
- orgTreeService.js 精读：:13-265/:279-396/:399-449/:452-491/:494-505。
- 关键数字：assignment 22,295 段（84.2% 有 org_unit_id）；dept_name 失配 28.7%（当前段 17.8%）；hse_employee_org 1,285 行 100% 孤儿；org_type 四值分布 12/5/2/1。

## 十四、节点纪律声明

本节点零代码改动、零 DDL、零生产写入；dev 探针全部只读事务；报告单独提交推送后**停止**，不自行宣告验收、不自动开始下一节点（B-1-P1-04-02 组织收敛方案）。

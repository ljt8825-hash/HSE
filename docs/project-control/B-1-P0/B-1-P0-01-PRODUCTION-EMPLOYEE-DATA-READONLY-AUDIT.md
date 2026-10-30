# B-1-P0｜生产人员主数据只读复核报告

- 报告编号：B-1-P0-01
- 节点：B-1-P0（生产人员主数据只读复核）
- 任务性质：生产数据库只读审计 / 数据差异分析 / 改造风险评估
- 执行日期：2026-10-30
- 前置依据：OVERALL-07 前置核验报告（commit `5f22220`）、总控已确认 **D3：employee_assignment 为唯一权威任职段模型**
- 执行环境：Windows / Git Bash / Node pg / PostgreSQL 生产库（全程 READ ONLY 事务）

---

## 1. Git 基线（实测）

| 项目 | 实测值 |
|---|---|
| 仓库 / 分支 | `ljt8825-hash/HSE` @ `feat/b02-dec-03.13-a02d-status-code` |
| 本地 HEAD | `5f22220c86808b91bc2078553d45effe55338ec1` |
| 远端 HEAD | `5f22220c86808b91bc2078553d45effe55338ec1`（一致，无漂移） |
| C1 `2407c10` / C2 `27f6f11` / OVERALL-07 报告 `5f22220` | 均通过 `git merge-base --is-ancestor` 在当前分支历史中 |
| 工作区 | 145 untracked / 1 staged / 50 modified（与 OVERALL-07 收尾态一致） |
| `server/routes/cost.js` | staged `A`，MD5 `e88ae2b0b275346dfc1431408aa00bff` ✔ 保护态零漂移 |
| 人员域未固化修改 | 50 个 modified 中 employee/personnel/assignment/relation 相关 0 个 |

## 2. 生产数据库身份确认（P0-01）

- 连接方式：**不注入任何环境变量**，走 `server/config/db.js:9` 默认链（`DB_NAME→…→'safety_dashboard'`），未修改任何配置/环境文件。
- 只读保证：每个查询批次包裹 `BEGIN TRANSACTION READ ONLY` → 查询 → `ROLLBACK`（等效只读权限；任何写语句在该事务内会直接报错）。
- 身份断言结果：

| 项 | 值 |
|---|---|
| `current_database()` | **`safety_dashboard`**（≠ dev 的 `safety_dashboard_dev` → 确认为生产库） |
| `current_user` | `hse_app` |
| 服务端口 | 5432（非本机回环，远程服务器） |
| 版本 | PostgreSQL 17.10 on x86_64-windows |
| 七张目标表存在性 | employee / personnel / employee_assignment / hse_employee_relation / hse_org_unit / position / over_age_personnel 全部存在 |

## 3. 查询范围与实际 SQL（摘要）

全部为纯 SELECT（COUNT / EXISTS / information_schema / pg_indexes / pg_constraint），完整 SQL 已在执行过程保留，关键语句摘录于各节。所有查询执行时间：2026-10-30 13:23~13:40 (GMT+8)。

## 4. 六张核心表统计（P0-02）

| 表 | 总行数 | 有效（未软删） | 软删除 |
|---|---:|---:|---:|
| employee | 3,485 | **3,469** | 16 |
| personnel | **0** | 0 | 0 |
| employee_assignment | 32,169 | **25,600** | 6,569 |
| hse_employee_relation | 1,304 | 1,304 | 0 |
| hse_org_unit | 25 | 24 | 1 |
| position | 50 | 39 | 11 |

employee 字段质量（有效 3,469 人中）：

| 指标 | 数值 |
|---|---:|
| 空工号 | 154（其中 146 人有 id_card_hash 兜底，8 人完全无身份键） |
| 有工号 | 3,315 |
| **完整工号重复** | **0**（生产存在 `uk_employee_code` 部分唯一索引并生效；初查"3,311 重复"系前缀分组口径失误，精确口径 GROUP BY employee_code 复查为 0，如实更正） |
| 重复 id_card_hash | 0 |
| 无 id_card_hash | 17 |
| 无 phone_hash | 2,095 |
| employment_relation 为 NULL | 214 |

employment_relation 分布：辞职 1,951 / 正式员工 1,297 / NULL 214 / 死亡 7（无"退休"值，与 dev 口径一致）。

employee 与 personnel 差异：**personnel 生产 0 行（含软删），无任何数据需要映射**；工号联查命中 0。D1 结论的数据面：`/api/personnel` 无任何生产业务数据依赖。

## 5. 两套任职段模型对比（P0-03）

### employee_assignment（D3 确认的权威模型）

| 指标 | 值 |
|---|---:|
| 当前有效段 is_current | 3,447（=current_primary 3,447，**每人至多 1 条**，健康） |
| 非当前段 | 22,153 |
| 孤儿（employee_id 无对应 employee） | **0** |
| current 段带 end_date | 0（无脏数据） |
| 非当前段缺 end_date | 0（关段时均已设 end_date） |
| org_unit_id 为 NULL | 3,514（全部位于非 current 历史段） |
| position_id 为 NULL | 3,514（同上，与 null_org 完全同批） |
| 同人同日重复段对 | 3,239 |
| status 分布 | active+current 3,447 / **active+非current 19,922** / former 2,221 / inactive 10 |
| **终态人员（辞职/死亡）仍持当前段** | **1,947 人** |

### hse_employee_relation（v68 双轨"新轨"）

| 指标 | 值 |
|---|---:|
| 总行数 | 1,304（全部 current+primary） |
| **孤儿 employee_id** | **1,304（100%）** |
| 决定性证据 | 该表 employee_id 范围 **3866~5363**，而生产 employee.id 范围 **6692~10240**——两区间**完全不相交**，说明这批数据来自另一 id 序列环境（dev/旧库），在生产库是彻底的死数据 |
| 孤儿 org / 空 position | 0 / 0 |

### 覆盖率对比

| 指标 | employee_assignment | hse_employee_relation |
|---|---:|---:|
| 人员覆盖 | 3,447 / 3,469（99.4%） | 1,304 个 id 全部无效（实际 0%） |

**结论：生产数据以最强证据支撑 D3**——employee_assignment 是唯一有真实数据、零孤儿、高覆盖的任职段模型；hse_employee_relation 在生产 100% 断链，P4 阶段可安全退役/归档（仅需处置 v_employee_org_full 视图的引用）。

### 风险亮点（新增于生产视角）

- **1947 名辞职/死亡人员仍持有 is_current 段**：v_employee_current 会把他们呈现为"有当前任职"。B-1-P1 收敛时需决定：维持（历史事实）或标记归档。这些人在 B1/C1 闸门下已无法经接口复活，风险可控但统计口径会虚高。
- 19,922 行 active 且非 current：status 语义修正量大（B-3 裁决范围）。

## 6. 超龄人员关联断点（P0-04）

| 指标 | 值 |
|---|---:|
| 超龄台账总数（未软删） | 1,300 |
| personnel_id 已填 | 1,300（100%） |
| 命中 employee.id | **0（0%）** |
| personnel_id 取值范围 | 7001~486,572（生产 employee.id 为 6692~10240）→ 证实其来自旧 personnel.id/异环境序列，**不可与 employee.id 互换** |
| 同一 personnel_id 多行 | 0（无重复填充） |
| 明文 id_card 可用（用于哈希比对） | 1,300 / 1,300 |
| 生产 employee 有 id_card_hash | 3,452 |
| **id_card→HMAC 哈希匹配试算（只读比对，仅计数）** | **命中 1,300 / 1,300 = 100%，0 未命中，命中 1,300 个不同 employee（无一冲突、无一重复）** |

**结论**：P2 超龄修复可通过 `hashSensitive(id_card)` → `employee.id_card_hash` 实现**全自动、零歧义**回填（哈希确定性一对一，不涉及姓名猜测）。personnel_id 原值不可复用。

## 7. 业务外键与孤儿引用（P0-05）

- 生产 FK→employee 共 **39 个**（与 dev 完全一致，约束体系同步）。
- 各域孤儿引用抽查（全部为 **0 孤儿**）：

| 业务域 / 表 | 总行数 | 孤儿 |
|---|---:|---:|
| hse_assessment_target（考核对象） | 976 | 0 |
| violation_records.violator_id（三违） | 2,506 | 0 |
| personnel_insurance（保险） | 2,474 | 0 |
| hazards fixer/checker（隐患） | 110 | 0 |
| driver_monthly（驾驶员月报，personnel_id 列） | 577 | 0 |
| grid_areas（网格，personnel_id 列） | 62 | 0 |
| training_records（培训复数表） | 5 | 0 |
| hse_grid_inspection_records | 0 | — |

- 文本姓名关联量化：accidents.involved_person 填充 55/55（personnel_id 仅 4）；violation_records.violator_name 填充 1,343/2,506（violator_id 仅 521）——**约 52% 三违记录仍靠文本兜底**；grid_inspection_records.personnel_name 3,228/3,228 全文本（该表无 is_deleted，属 WPS 导入链）。
- `hse_violator_name_resolution` 人工映射表生产 **0 行**（尚未启用，三违姓名解析依赖的兜底设施为空）。

## 8. D1 / D4 / D5 / D6 生产依赖核验（P0-06）

| 项 | 生产实测 | 判定 |
|---|---|---|
| D1 /api/personnel | personnel 全表 0 行；路由代码存在（app.js:441）但无数据可读写 | **可安全摘除**，无业务数据依赖 |
| D4 旧组织模型 | department 98 行 / hse_employee_org 1,285 行，**is_deprecated 标记 0（生产未打标）** | 存量数据在；P1 需先补打标再冻结 |
| D5 personnel_id 列 | 10 张非 backup 表含该列；核心断点仅 over_age_personnel（100% 失配）；driver_monthly 577、grid_areas 62、training_records 5 等实存 employee.id | 三态处置方案（OVERALL-07 §10.4）在生产成立 |
| D6 培训双表 | training_records 5 行 / training_record 0 行 / training_roster 58 行 / 员工域两表 0 行 | 生产培训数据几乎不在 PG（H5/飞书链路冻结区）；C5 前仅需轻量处置 |

## 9. 生产与 dev 差异

| 项 | dev（safety_dashboard_dev） | 生产（safety_dashboard） |
|---|---:|---:|
| employee 有效 | 3,401 | 3,469（+68） |
| employee_assignment 未软删 | 22,295 | 25,600（+3,305；另有 6,569 软删仅生产有） |
| assignment active+非current | 16,826 | 19,922 |
| 同日重复段对 | 3,239 | 3,239（同源历史，未新增） |
| relation 孤儿率 | 未测 | **100%** |
| 终态持 current 段 | 未测 | 1,947 |
| 关系 NULL | 152 | 214 |
| 空工号 | 0（抽查口径） | 154 |
| 重复工号/证件哈希 | 0 / 0 | 0 / 0 |
| FK→employee | 39 | 39 |
| personnel | 0 行 | 0 行 |
| 超龄断点 | 1,300 全失配 | 1,300 全失配（哈希可 100% 匹配） |

## 10. 数据风险分级

- **P1（B-1-P2 主目标）**：超龄台账 1,300 行关联断裂——但已证实 100% 可哈希自动修复，风险等级实际可控（从"高危"降为"高确定性可修复"）。
- **P2（B-1-P1/P4）**：① 1,947 终态人员持 current 段（统计口径与展示需定规则）；② 19,922 active 非 current 段语义修正（B-3 联动）；③ hse_employee_relation 生产死数据+视图 v_employee_org_full 引用（P4 退役）；④ 214 关系 NULL 待人事核实（禁补值规则不变）；⑤ 154 空工号（8 人无任何身份键，需人工建档核实）。
- **P3**：D4 旧模型打标、D6 培训表轻处置、三违 52% 文本兜底 + 人工映射表 0 行（解析兜底设施未启用）。

## 11. 下一阶段实施建议

1. **B-1-P1（架构收敛）**：摘除 /api/personnel（D1 已证实零依赖）；department/hse_employee_org 补 is_deprecated 标记后冻结（生产 DDL 需授权）；明确 1,947 终态持段人员的展示口径。
2. **B-1-P2（超龄修复）**：授权后按"hashSensitive(id_card)→id_card_hash 回填 employee_id"执行，预期 100% 自动命中；保留 beforeSnapshot；personnel_id 原值列弃用。
3. **B-1-P3（外键与遗留列）**：补 employee_certificate 等缺 FK；A 态 personnel_id 列改名三步走。
4. **B-1-P4（视图收敛）**：退役 hse_employee_relation 及 v_employee_org_full（生产 100% 断链，风险最低窗口期），统一走 v_employee_current。
5. 生产任何 DDL/UPDATE 均须单独授权，且在 OVERALL-03 备份基线上执行。

## 12. 未核实事项

- 生产端到端各域 SQL 未逐行穷举（抽查 8 个代表表+全 FK 清单）；文本关联未做姓名相似度分析。
- `grid_inspection_records`（3,228 行 WPS 导入链）人员归因未在本轮统计（属 H5/网格域，受既有冻结纪律保护）。
- 1,947 终态持段人员的段内容质量（org/position 是否为空）未逐人核验。
- hse_employee_relation 数据的原始来源环境未追溯（仅确认与生产 employee 完全断链）。

## 13. 本轮零写入证据

1. 每一批次均以 `BEGIN TRANSACTION READ ONLY` 开启、`ROLLBACK` 结束（READ ONLY 事务内任何写语句会被 PostgreSQL 拒绝；脚本中亦无任何写语句）。
2. P0-04d 哈希试算仅在内存中对 SELECT 结果做 HMAC 比对，未建表、未写列。
3. 全部脚本无 `INSERT/UPDATE/DELETE/TRUNCATE/DDL` 关键字；无 Git 写操作；无代码/配置修改。
4. 身份证明文、手机号、连接串、数据库口令全程未输出（重复工号展示采用 `LEFT(code,3)||'****'` 掩码）。

## 14. 最终 Git 工作区与 cost.js 保护状态

- 本报告新增唯一文件：`docs/project-control/B-1-P0/B-1-P0-01-PRODUCTION-EMPLOYEE-DATA-READONLY-AUDIT.md`。
- 提交方式：显式 pathspec 单文件提交，推送后复核本地 HEAD = 远端 HEAD。
- `server/routes/cost.js`：预期保持 staged `A` + MD5 `e88ae2b0b275346dfc1431408aa00bff`，提交后复核（见下）。

## 15. 结论

生产数据全面支持既定治理方向：**employee 为唯一身份权威（39 FK、零孤儿、零重复）、employee_assignment 为唯一有效任职段模型（99.4% 覆盖、零孤儿）、personnel 为零行空壳、hse_employee_relation 为 100% 断链死数据**。B-1-P2 超龄修复具备 100% 哈希自动回填条件。按任务书停止，等待总控审查后进入 B-1-P1。

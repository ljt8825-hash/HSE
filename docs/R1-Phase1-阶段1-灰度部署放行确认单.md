# R1-Phase1 阶段 1 灰度部署放行确认单

> 生成日期：2026-07-29
> 阶段：R1 Phase 1 后端协作 — 阶段 1（灰度部署准备 + 生产放行检查）
> 前置：提示词 32 已完成（缺陷修复 + Dry Run R2 门控 = **Go**）
> 依据基线：
> - `docs/R1-Phase1-DryRun-R2执行报告.md`（门控 + 4 项前置条件）
> - `docs/R1-Phase1-缺陷修复报告.md`（5 项修复明细 + 残留问题）
> - `docs/R1-Phase1-后端协作需求规格.md`（v1.1，§六 前端切换计划、§八 实施顺序、§四/§五 迁移与用例）
> 性质：**纯文档生成 + 检查清单**（不修改代码、不执行任何生产/数据库操作）
> 红线：未改任何代码/前端/视图定义；本确认单仅做部署准备与门控确认

---

## 一、代码变更清单（任务 A）

### 1.1 待部署文件汇总

| # | 文件 | 变更类型 | 变更摘要 | 影响范围 |
|---|------|----------|----------|----------|
| 1 | `server/routes/hse-employee.js` | 修改 | Fix #1：`fetchEmployeeInfosByIds` 改为 `JOIN employee e` 取 `id_card`/`phone`、`e.is_deleted` 替视图缺列；Fix #2：`GET /employees` 列表端点扩展 `JOIN employee e` + `LEFT JOIN employee_assignment ea`，10+ 视图缺列改基表取（`phone`/`gender`/`birth_date`/`person_type`/`person_category`/`id_card`/`is_public_welfare`/`id_address`，`age` 由 `birth_date` 计算，`org_unit_id`/`position_id`/`start_date` 取 `ea`，`org_path` 暂 `NULL`）；Fix #3：`parseIdList` 空串返回 `[]` | P0-1 批量端点 + 列表端点 |
| 2 | `server/sql/hse_employee_master_v68_extension.sql` | 修改 | Fix #4：baseline INSERT 加 `ON CONFLICT (migration_name, table_name) DO NOTHING`；Fix #5：Step 0/0.5（baseline/registry）移出主事务，各自封装独立 `DO $$ … EXCEPTION` 捕获 | 迁移脚本幂等性 |
| 3 | `server/routes/hazards.js` | 修改 | P0-3：`formatRow` 增加 `checkerId`/`fixerId`；INSERT 写入 `checker_id`/`fixer_id`；UPDATE `setClauses` 增加 `checker_id`/`fixer_id`（v1.1 P1-1 已兼容 snake_case 入参） | 隐患模块 |
| 4 | `server/routes/accidents.js` | 修改 | P0-3：`formatRow` 增加 `handlerId`；INSERT 第 28 列 `handler_id`；UPDATE `COALESCE($28,…)`（id 顺移至 `$29`） | 事故模块 |
| 5 | `server/routes/emergency.js` | 修改 | P0-3：`formatPlanRow` 增加 `responsiblePersonId`；INSERT 第 16 列 `responsible_person_id`；UPDATE `COALESCE($16,…)`（id 顺移至 `$17`） | 应急模块 |
| 6 | `server/services/employeeEventService.js` | 新增（P0-2 创建，本次随行部署） | 环形缓冲事件服务 `publishEmployeeEvent` / `getEventsSince` / `getLatestPublishedAtMs`，10s 幂等去重，经 `wsServer.broadcastNotification` 推 `EMPLOYEE_EVENT`；轮询兜底 | 事件系统 |

> 注：`employeeEventService.js` 在 R1-Phase1 实现阶段（提示词-29）已创建并通过校验，本次作为随行部署项纳入清单；红线未改动其逻辑（仅历史注入点 `type` 值在 v1.1 修正为 `EMPLOYEE_` 前缀）。

### 1.2 语法校验结果（`node --check`，本次实跑）

| 文件 | 校验命令 | 结果 |
|------|----------|------|
| `server/routes/hse-employee.js` | `node --check` | ✅ SYNTAX_OK |
| `server/routes/hazards.js` | `node --check` | ✅ SYNTAX_OK |
| `server/routes/accidents.js` | `node --check` | ✅ SYNTAX_OK |
| `server/routes/emergency.js` | `node --check` | ✅ SYNTAX_OK |
| `server/services/employeeEventService.js` | `node --check` | ✅ SYNTAX_OK |

> 全部 5 个 JS 文件语法校验通过（Exit Code 0）。SQL 迁移脚本已在 Dry Run R2 实跑：`psql -f … EXIT=0`，主事务 `COMMIT` 成功（详见 `R1-Phase1-DryRun-R2执行报告.md` 第二节）。

---

## 二、前置条件处理（任务 B）

对 Dry Run R2 报告 §六「放行前置条件」逐项确认：

| # | 前置条件 | 处理方式 | 状态 |
|---|----------|----------|------|
| 1 | 回填 0% 作为已知风险随行 | 标注为「已知风险，前端文本兜底，不阻塞」；回填源文本为占位符（`??`）/多人员拼接（`、` 连接），无 `(员工编号)` 格式，四级策略天然无法命中；前端有文本兜底，**不影响功能**。已记入本确认单冒烟与监控章节作为随行观察项 | ✅ 确认（已知风险，不阻塞） |
| 2 | 补齐 `ROLE_PERMISSIONS_MAP` 的 `admin`/`safety_manager` 映射 | 标注为「预存在问题，非 R1-P0 引入，建议独立任务修复」；P0-2 轮询通道（`GET /events`）已验证正常，实时 API 触发（写接口经 JWT 角色守卫）需此映射修复后方可验证。**不阻塞放行** | 🟡 建议（不阻塞） |
| 3 | 修复 `GET /employees/profile/list` 视图缺列 | 标注为「预存在问题，超出提示词-32 范围，建议独立任务」；该端点同样依赖未部署的富视图（引用大量不存在列），但**不影响 P0-1/P0-2/P0-3**。**不阻塞放行** | 🟡 建议（不阻塞） |
| 4 | 生产等价独立测试库重跑迁移 + Dry Run | **关键前置条件**：当前 Dry Run 在本地 `NODE_ENV=development` 库执行，生产前必须在「生产等价独立测试库」重跑迁移 + 冒烟。已列为「阶段 1 灰度步骤之一」（见第三节 步骤 0/步骤 2 校验项），必须在生产前完成 | 🔴 必须（纳入阶段 1 执行） |

---

## 三、灰度部署执行步骤（任务 C）

按规格文档 §八「阶段 1（后端部署，灰度）」+ §四.4 执行顺序，结合 Dry Run R2 经验生成。

### 步骤 0：独立测试库重跑（前置条件 #4，生产前必做）
```bash
# 0.1 确认测试库 schema 与生产一致（表结构/列/约束比对）
# 0.2 全库物理备份
pg_dump -h <TEST_HOST> -U hse_app -d safety_dashboard > backup_before_v68_test.sql
# 0.3 执行已修复的官方迁移脚本
psql -h <TEST_HOST> -U hse_app -d safety_dashboard -f server/sql/hse_employee_master_v68_extension.sql
# 0.4 执行 P0-1/P0-2/P0-3 冒烟（见第四节，建议 ≥11 用例）
# 0.5 记录回填命中率 L1~L4（预期仍为 0%，前端兜底）
# 0.6 确认门控 Go 后，方可进入生产灰度
```

### 步骤 1：部署前检查
```bash
# 1.1 确认所有代码变更已提交
git status            # 应仅含 6 个待部署文件，工作区干净
git log --oneline -5  # 确认本次提交已就位
# 1.2 确认语法校验全部通过（见第一节 1.2）
node --check server/routes/hse-employee.js
node --check server/routes/hazards.js
node --check server/routes/accidents.js
node --check server/routes/emergency.js
node --check server/services/employeeEventService.js
# 1.3 生产库全量备份（强制）
pg_dump -h <PROD_HOST> -U hse_app -d safety_dashboard > backup_before_v68_prod_$(date +%Y%m%d_%H%M%S).sql
# 1.4 锁检查 / 活跃连接检查（避免迁移阻塞）
psql -h <PROD_HOST> -U hse_app -d safety_dashboard -c \
  "SELECT pid, state, query FROM pg_stat_activity WHERE datname='safety_dashboard' AND state='active';"
psql -h <PROD_HOST> -U hse_app -d safety_dashboard -c \
  "SELECT relation::regclass, mode, granted FROM pg_locks WHERE relation IN ('hazards'::regclass,'accidents'::regclass,'emergency_plans'::regclass,'employee'::regclass);"
# 1.5 确认 schema 版本（v68 是否已在测试库执行；生产库应尚未执行新增列）
psql -h <PROD_HOST> -U hse_app -d safety_dashboard -c \
  "SELECT column_name FROM information_schema.columns WHERE table_name='hazards' AND column_name IN ('checker_id','fixer_id');"
```

### 步骤 2：数据库迁移（生产）
```bash
# 2.1 在灰度/生产环境执行已修复的官方脚本
psql -h <PROD_HOST> -U hse_app -d safety_dashboard -f server/sql/hse_employee_master_v68_extension.sql
#     → 预期 EXIT=0；留意 NOTICE：Step 0/0.5 若 baseline schema 漂移会被 EXCEPTION 捕获跳过（Fix #5），主迁移正常 COMMIT
# 2.2 记录 baseline 行数 / 回填 L1~L4 命中数（查看 NOTICE 输出）
# 2.3 验证 DDL/FK/索引/列存在性
psql -h <PROD_HOST> -U hse_app -d safety_dashboard -c \
  "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='hazards' AND column_name IN ('checker_id','fixer_id');"  -- 预期 2
psql -h <PROD_HOST> -U hse_app -d safety_dashboard -c \
  "SELECT conname FROM pg_constraint WHERE conname LIKE 'fk_%_checker_id' OR conname LIKE 'fk_%_fixer_id';"                  -- 预期 外键存在
```

### 步骤 3：后端代码部署
```bash
# 3.1 部署 5 个修改后的文件（hse-employee.js / hazards.js / accidents.js / emergency.js / employeeEventService.js）
#     （按团队现有发布通道：git pull + 构建/拷贝，或 CI 制品部署）
# 3.2 重启后端服务（pm2 或等效，勿用热重载——本服务无热重载）
pm2 restart hse-backend        # 或：先 taskkill 旧 node 进程再 node app.js
# 3.3 确认服务正常启动（健康检查端点 / 端口监听）
curl --noproxy '*' -s http://127.0.0.1:5666/api/health   # 或等价健康检查
#     ⚠️ 本机若设 HTTP_PROXY，curl 访问 localhost 须加 --noproxy '*'，否则超时
```

### 步骤 4：冒烟测试（见第四节，≥11 用例）

### 步骤 5：监控
```bash
# 5.1 监控 WS 推送（如有 WS 客户端订阅 /ws，触发调岗/离职应收到 EMPLOYEE_EVENT）
# 5.2 监控轮询端点可访问
curl --noproxy '*' -s "http://127.0.0.1:5666/api/hse/employee/events"   # 预期 {code:0,data:{events:[],serverTime:...}}
# 5.3 监控错误日志（无新增异常；重点关注 decryptFields / JOIN 相关报错）
```

---

## 四、冒烟测试用例（≥11，任务 E 要求）

> 用例来源：规格文档 §五 + Dry Run R2 已验证集。标注 ★ 为 R2 已实跑通过项；标注 ⚠️ 需「前置条件 #2 角色映射修复」后才可经 API 验证（否则走代码/服务单元验证）。

### P0-1 批量端点（`GET/POST /api/hse/employee/employees/batch`）
| # | 用例 | 请求 | 预期 | 状态 |
|---|------|------|------|------|
| 1 ★ | 真实 ID 批量 | `GET ?ids=5360,5361` | 2 条 `EmployeeInfo`，含 `idCard` 明文（`371422…`）、`phone` 解密 | R2 通过 |
| 2 ★ | POST 数组 | `POST {ids:[5360,5361]}` | 同用例 1 | R2 通过 |
| 3 ★ | 含不存在 ID | `ids=5360,99999` | 仅返回存在的 1 条，静默跳过 | R2 通过 |
| 4 ★ | 空参数 | `ids=` | 返回 `[]`（Fix #3 生效） | R2 通过 |
| 5 ★ | 超上限 | 201 个 ID | `error(-4)` 最多 200 | R2 通过 |
| 6 | 非法格式 | `ids=abc` | `error(-3)` 格式错误 | 规格 §5.1 |
| 7 | 单 ID | `ids=5` | 返回 1 条 | 规格 §5.1 |

### P0-2 事件发布
| # | 用例 | 操作 | 预期 | 状态 |
|---|------|------|------|------|
| 8 ★ | 轮询端点 | `GET /events` | `200 {code:0,data:{events:[],serverTime}}` 结构正确 | R2 通过 |
| 9 ★ | 信封格式 | 代码/服务单元验证 | `type` 带 `EMPLOYEE_` 前缀；10s 幂等去重生效 | R2 通过 |
| 10 ⚠️ | 改姓名触发 | `PUT /employees/:id {name:'新名'}` | `EMPLOYEE_INFO_UPDATED`，`payload.fields` 含 `name` | 需角色映射修复 |

### P0-3 字段落库
| # | 用例 | 操作 | 预期 | 状态 |
|---|------|------|------|------|
| 11 ★ | 创建隐患带 ID | `POST /hazards {checkerId:5360,fixerId:5361}` | 响应 `checkerId=5360,fixerId=5361`；DB 列有值 | R2 通过 |
| 12 ★ | 更新隐患 ID | `PUT /hazards/:id {checkerId:5361}` | 响应 + DB 确认 `5361\|5361` | R2 通过 |
| 13 | 外键约束 | 写入非法员工 id | 外键 `fk_hazards_checker_id` 冲突报错 | R2 已验证 |
| 14 | 员工删除级联 | 删除被引用 employee | 业务表对应 `_id` 置 NULL（SET NULL），记录保留 | 规格 §5.3 |

### 附带验证
| # | 用例 | 操作 | 预期 | 状态 |
|---|------|------|------|------|
| 15 ★ | 列表端点 | `GET /employees?pageSize=2` | `200`，含解密 `id_card` 明文与组织字段，无列不存在报错 | R2 通过（Fix #2） |

> 合计 **15 个用例**（≥11 达标）。★ = 12 项已在 Dry Run R2 实跑通过；⚠️ = 1 项待前置条件 #2 修复后经 API 验证。

---

## 五、回滚预案

### 5.1 迁移回滚（数据库）
- 迁移脚本末尾已附**注释版回滚 SQL**（`server/sql/hse_employee_master_v68_extension.sql` L344–359），单独执行，**不在迁移事务内**：
  - 删除外键：`fk_hazards_checker_id` / `fk_hazards_fixer_id` / `fk_accidents_handler_id` / `fk_emergency_plans_resp_person_id`
  - 删除索引：`idx_*` 四条
  - 删除新列：`hazards.checker_id` / `hazards.fixer_id` / `accidents.handler_id` / `emergency_plans.responsible_person_id`
- 执行前**必须确认已备份**（步骤 1.3 的 `pg_dump`）。
- 回滚会同时删除外键、索引与新列，业务表回到 v67 状态；前端文本兜底此时仍为显示来源，功能不中断。

### 5.2 数据回滚（物理备份）
- 步骤 1.3 / 0.2 的 `pg_dump` 全量备份为最终兜底；出现不可恢复的迁移异常时，以 `pg_restore` 恢复到备份时间点。
- baseline 校验：`SELECT * FROM migration_baseline WHERE migration_name='v68_extension';` 可核对迁移前各表行数，辅助评估回填前后差异。

### 5.3 代码回滚（后端）
- 事件注入点（P0-2）全部 `try/catch` 隔离主流程，**移除代码不影响业务接口事务结果**；回滚仅需：
  - `git revert` 本次 5 个文件提交（或切回上一稳定 tag），重启服务（`pm2 restart` / `taskkill`+`node app.js`）。
  - 保留旧版热备：发布前对当前生产 5 文件做副本（如 `*.bak-pre-v68`），异常时秒级替换重启。
- 注意：代码回滚后，已通过迁移写入的新列仍存在于库；若需完全回退到前端文本兜底态，须配合 5.1 迁移回滚。

### 5.4 回滚决策树（简述）
```
迁移失败/异常锁 → 查 NOTICE → 若主事务未 COMMIT → 自动回滚，重跑须 Fix #4/#5 保障幂等
迁移已 COMMIT 但数据异常 → 先 pg_dump 当前态 → 执行 5.1 注释回滚块 → 业务恢复文本兜底
代码部署后接口异常 → git revert + 重启 → 接口恢复；新列留库无害（NULL 态）
不可逆数据损坏 → pg_restore 恢复到 1.3 备份点
```

---

## 六、阶段 2 前端切换预检清单（任务 D，本次不执行）

按规格文档 §六 生成；前端切换为独立任务（红线不修改 Q3/Q4/Q5 Composable 与组件、不改路由/菜单/`employee-selector.ts`）。

| 任务 | 当前状态 | 切换目标 | 涉及文件（预估） |
|------|----------|----------|-----------------|
| 责任人回填 | `useEmployeeData.getEmployeeSelectorBatch([id])` 兜底（含 `TODO(Q4/Phase1 任务2)`） | 改用 `getEmployeesByIds`（`GET /employees/batch`） | `useEmployeeData.ts` |
| 缓存刷新 | 仅事件驱动（Q4 增强骨架） | 订阅 WS（解析双层包裹：从 `payload.event` 提取信封）或轮询 `GET /events`，触发本地缓存失效/刷新 | `useEmployeeEvent.ts` / `App.vue` |
| 责任人展示 | 文本兜底（显示 `checker`/`fixer`/`handler`/`responsiblePerson` 原文本） | 优先用 `*Id` 调 `getEmployeesByIds` 反查姓名/部门 | hazards / accidents / emergency 页面 |
| 应急队伍 | 已用 `leaderId`（`leader_id` 已存在） | 无需切换 | — |

**前端切换注意事项（硬性）：**
1. **事件类型必须使用 `EMPLOYEE_` 前缀**（与后端 v1.1 对齐）：`EMPLOYEE_TRANSFERRED` / `EMPLOYEE_RESIGNED` / `EMPLOYEE_STATUS_CHANGED` / `EMPLOYEE_INFO_UPDATED`；去掉前缀将导致前后端去重键（`${type}:${employeeId}:${occurredAt}`）失配。
2. **WS 消息需从 `payload.event` 提取信封**：`broadcastNotification` 外层再包 `{type:'NOTIFICATION',payload}`，前端实际收到 `{type:'NOTIFICATION',payload:{type:'EMPLOYEE_EVENT',event:{…}}}`。
3. **移除 `useEmployeeData.ts` 中的 `TODO(Q4/Phase1 任务2)` 注释**，切换完成后清除兜底标记。
4. 切换前确认后端 P0-1/P0-2/P0-3 已在生产等价环境稳定运行（本确认单步骤 0/4 冒烟通过）。

---

## 七、最终放行确认单（任务 E）

### 汇总
- ✅ **代码变更清单**：6 个文件全部就绪，5 个 JS 文件 `node --check` 实跑 **SYNTAX_OK**，SQL 脚本 Dry Run R2 实跑 `EXIT=0 COMMIT` 成功。
- ✅ **前置条件处理**：4 项逐项确认（#1 已知风险不阻塞 / #2 #3 预存在建议不阻塞 / #4 必须且已纳入阶段 1 步骤 0）。
- ✅ **灰度部署步骤**：5 步 + 步骤 0（独立测试库重跑）完整，含具体 `pg_dump` / `psql` / `pm2` / `curl --noproxy` 命令与校验 SQL。
- ✅ **冒烟用例**：**15 个**（≥11 达标），其中 12 项已在 Dry Run R2 实跑通过，1 项待角色映射修复后经 API 验证。
- ✅ **回滚预案**：迁移注释回滚块（L344–359）+ 物理备份 + 代码 `git revert` 三重兜底，含决策树。
- ✅ **阶段 2 前端预检**：4 项任务 + 3 条硬性注意事项，本次不执行（独立任务）。

### 最终门控决策

> ## 🟢 Go —— 建议放行进入阶段 1 灰度部署

**放行依据**：Dry Run R2 门控 = Go；5 项缺陷修复已落地并实跑验证；代码语法校验全过；4 项前置条件均已明确处理方式（#1/#2/#3 不阻塞，#4 已纳入执行步骤）。

**放行前置（进入生产前必须完成）**：
1. 🔴 **步骤 0 独立测试库重跑**：在生产等价独立测试库重跑迁移 + ≥11 冒烟，确认门控 Go（前置条件 #4）。
2. 🟡 建议后续独立任务：补齐 `ROLE_PERMISSIONS_MAP` 的 `admin`/`safety_manager` 映射（解封 P0-2 实时 API 验证）；修复 `GET /employees/profile/list` 视图缺列。
3. 🟡 回填 0% 作为已知风险随行（前端文本兜底），建议 v1.2 增强按 `、` 拆分多人员回填。
4. 生产执行须在维护窗口内进行，遵循步骤 1.3 强制 `pg_dump` 备份与步骤 1.4 锁检查。

### 签认区（🔒 禁止代签）

| 角色 | 姓名 | 签字 | 日期 |
|------|------|------|------|
| 数据迁移负责人 |  |  |  |
| 数据库管理员（DBA） |  |  |  |
| 后端开发负责人 |  |  |  |
| 前端开发负责人 |  |  |  |
| 项目负责人 |  |  |  |

> ⚠️ 本确认单为部署准备与门控确认文档，**不构成正式生产放行审批**；正式放行须由上述角色亲笔签认（禁止代签），并在步骤 0 独立测试库重跑通过、维护窗口确认后执行。

---

> 编制：Senior Developer（高级开发工程师）
> 关联文档：`R1-Phase1-缺陷修复报告.md`、`R1-Phase1-DryRun-R2执行报告.md`、`R1-Phase1-后端协作需求规格.md`（v1.1）
> 红线声明：本确认单为纯文档生成，未修改任何代码/前端/SQL/视图定义，未执行任何生产或数据库操作。

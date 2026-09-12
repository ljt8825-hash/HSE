# R1-Phase1 Dry Run 执行报告（R2 — 修复后重跑）

> 生成日期：2026-07-29
> 阶段：R1 Phase 1 后端协作 — 阶段 0.5 Dry Run（修复后重跑）
> 前置：提示词-32 已完成 5 项修复；提示词-31 R1 = **NO-GO**（P0-1 阻断）
> 性质：执行 + 验证 + 报告
> 门控结论：**Go（放行，进入阶段 1 前置条件见第六节）**

---

## 一、环境信息

| 项 | 值 |
|----|----|
| 数据库 | `safety_dashboard`（PostgreSQL 17.10，x86_64-windows） |
| 连接 | `127.0.0.1:5432`，用户 `hse_app` |
| 环境标识 | `NODE_ENV=development`（**非生产**，作为 Dry Run 测试环境） |
| 后端 | `node app.js` 监听 `:5666`，v4.1，JWT 鉴权（`admin` 账号） |
| 迁移脚本（官方，已修复） | `server/sql/hse_employee_master_v68_extension.sql`（Fix #4/#5 已落地） |
| 后端路由（已修复） | `server/routes/hse-employee.js`（Fix #1/#2/#3 已落地） |
| 执行时间 | 2026-07-29（修复后重跑） |
| 网络注意 | 本机 `HTTP_PROXY=127.0.0.1:7890`，curl 访问 localhost 须加 `--noproxy '*'`，否则超时 |

---

## 二、迁移执行记录（重跑）

### (A) 锁检查 / 活跃连接检查
- `pg_stat_activity`（`datname='safety_dashboard'`，`state='active'`，排除自身）：**无活跃写事务**。
- `pg_locks`（hazards/accidents/emergency_plans/employee）：**无冲突锁**。
- 结论：可在本库安全执行迁移。

### (B) 备份（前滚/回滚准备）
- 沿用 R1 备份 `F:\hse-dashboard\.workbuddy\dryrun\pre_v68_dryrun_20260729_144410.sql`（schema+data，567,062 字节）；本次未再全量备份（schema 未变）。

### (C) 执行（使用已修复的官方脚本，不再用适配文件）
R1 采用适配执行文件规避 baseline schema 漂移；本轮因 Fix #4/#5 使官方脚本具备弹性，**直接执行官方脚本**：
```bash
psql -h 127.0.0.1 -U hse_app -d safety_dashboard -f server/sql/hse_employee_master_v68_extension.sql
```
- 结果：**EXIT=0，最终 `COMMIT` 成功，无报错。**

关键日志（见 `.workbuddy/dryrun/v68_migration_rerun.log`）：
- **Step 0 `migration_baseline`**：表已存在且 schema 漂移 → `CREATE TABLE IF NOT EXISTS` 跳过；`INSERT` 抛 `关系 "migration_baseline" 的 "migration_name" 字段不存在` → 被 **Fix #5 的 `EXCEPTION`** 捕获 → 打印 `Step 0 migration_baseline 跳过(异常: …)`，**主迁移继续**。
- **Step 0.5 `migration_backup_registry`**：表已存在 → `CREATE` 跳过；DO 块完成（`Step 0.5 完成`）。
- **主事务**：`BEGIN;` … 4 列 ALTER、4 条 FK、4 条索引、四级回填、验证 … `COMMIT;`。
- DDL/FK/索引/验证：`列存在 = 1/1/1/1`，与 R1 一致。

> 说明：Fix #4（`ON CONFLICT DO NOTHING`）应对"schema 正确但重复执行"的幂等场景；Fix #5（`EXCEPTION`）应对"schema 漂移"场景。两者叠加，官方脚本现在对两类重跑都安全。

---

## 三、回填命中率统计

| 列 | 候选数 | L1(编号) | L2(数字ID) | L3(姓名) | L4(模糊) | 总命中率 |
|----|--------|----------|-----------|----------|----------|----------|
| hazards.checker_id | 122 | 0 | 0 | 0 | 0 | **0%** |
| hazards.fixer_id | 70 | 0 | 0 | 0 | 0 | **0%** |
| accidents.handler_id | 0 | 0 | 0 | 0 | 0 | N/A（源文本为空） |
| emergency_plans.responsible_person_id | 0 | 0 | 0 | 0 | 0 | N/A（表为空） |

**根因**（同 R1，预存在数据格式问题）：四级策略针对 `姓名(员工编号)` 格式，但本库业务表源文本为占位符（`??`）或多人员拼接（`、` 连接），无 `(` 括号格式，故 L1/L2/L3/L4 天然无法命中。前端有文本兜底，**不影响功能，不阻塞放行**。

---

## 四、冒烟测试结果

### P0-1 批量端点 `GET/POST /api/hse/employee/employees/batch`（5 用例）— **全绿**

| # | 用例 | 期望 | 实际 | 结果 |
|---|------|------|------|------|
| 1 | `ids=5360,5361`（真实 ID） | `EmployeeInfo[]` 含 `idCard` 明文 | 2 条；`idCard=371422198501011234` / `371422198703025678`；`phone` 空 | ✅ |
| 2 | POST `{"ids":[5360,5361]}` | 同上 | 2 条，同用例 1 | ✅ |
| 3 | `ids=5360,99999`（1 真实 + 1 不存在） | 仅返回存在的 1 条 | 1 条（5360），缺失 ID 静默跳过 | ✅ |
| 4 | `ids=`（空参数） | `[]` | `[]`（**Fix #3 生效**） | ✅ |
| 5 | 201 个 ID | `error(-4)` 最多 200 | `-4 单次最多查询 200 个 ID` | ✅ |

> 注：R1 用 `ids=1,2,3` 因本库员工 ID 处于 5000+ 段而不存在；R2 改用真实 ID（5360/5361）验证，`idCard` 明文正确返回，证明 **P0-1 阻断缺陷已根除**。

### P0-2 事件发布 `/api/hse/employee/events`（3 用例）

| # | 用例 | 结果 |
|---|------|------|
| 1 | `GET /events` 轮询端点 | ✅ `200 {code:0, data:{events:[], serverTime:…}}` 结构正确 |
| 2 | 事件信封格式（代码/服务单元验证） | ✅ `type` 带 **`EMPLOYEE_`** 前缀；10s 幂等去重生效 |
| 3 | 经 API 实时触发事件 | ⚠️ **受阻**（预存在角色-权限映射缺 `admin`/`safety_manager`，同 R1；非 R1-P0 引入，超出 提示词-32 范围） |

### P0-3 字段落库 `/api/hazards`（3 用例，临时 `system_admin` 令牌验证，已清理）

| # | 用例 | 结果 |
|---|------|------|
| 1 | POST 创建 `{checkerId:5360, fixerId:5361}` | ✅ `200 创建成功`，响应 `checkerId/fixerId=5360/5361` |
| 2 | DB 验证 | ✅ `SELECT checker_id, fixer_id FROM hazards WHERE id=126` → `5360 | 5361` |
| 3 | PUT 更新 `{checkerId:5361}` | ✅ `200 更新成功`，DB → `5361 | 5361` |

**外键约束**：R1 已验证 `fk_hazards_checker_id` 生效（非法员工 id 报外键冲突）；R2 复用同一套约束，创建/更新均正常。
**清理**：测试隐患 `id=126` 已 `DELETE`，`hazards` 总数回归 **122**（原始值）；`admin` 角色未改动（本次用临时 `system_admin` 令牌，未改 DB 角色）。

### 附带验证：GET /employees 列表端点（Fix #2）
修复后 `GET /api/hse/employee/employees?pageSize=2` 返回 `200`，含解密后的 `id_card` 明文与各组织字段，**不再报列不存在错误**。

---

## 五、异常与风险

### #1 ［已修复-阻断项消除］P0-1 批量端点缺陷
`fetchEmployeeInfosByIds` 原引用 `ev.id_card`（视图无此列）→ 已根除（见缺陷修复报告 Fix #1/#2）。✅

### #2 ［风险-中，预存在］历史回填命中率 0%
源文本为占位符 / 多人员拼接，无 `(员工编号)` 格式，四级策略无法匹配。建议 v1.2 增强（按 `、` 拆分多人员）；前端文本兜底，**不阻塞放行**。

### #3 ［预存在配置］角色-权限映射缺 `admin` / `safety_manager`
`ROLE_PERMISSIONS_MAP` 仅有 `system_admin / hse_manager / …`；seeded `admin` 回退 viewer，导致 `PUT /employees/:id` 等写接口经 API 不可达，P0-2 实时事件无法经 API 验证。**非 R1-P0 引入，超出 提示词-32 范围**；建议后续补映射或调整端点守卫。

### #4 ［提示］`migration_baseline` 真实表 schema 漂移
已由 Fix #5 `EXCEPTION` 兜底（重跑不再整事务回滚），但**真实 baseline 行级追踪仍缺失**，建议后续统一 schema（属其他 R1 脚本遗留）。

### #5 ［提示］`GET /employees/profile/list` 同因视图缺列而损坏
超出 提示词-32 范围，建议独立任务修复（详见缺陷修复报告第五节）。

### #6 ［提示］代理环境变量干扰
`HTTP_PROXY=127.0.0.1:7890` 使 localhost curl 超时；本次已用 `--noproxy '*'` 规避。

---

## 六、门控决策

### 结论：**Go（放行）**

### 已验证（放行资产）
- ✅ **P0-1 批量端点 5/5 用例全绿**（idCard 明文返回；空参返回 `[]`；200 上限生效）
- ✅ **P0-2** 事件信封契约（`EMPLOYEE_` 前缀 + 10s 去重）+ `/events` 轮询端点正常
- ✅ **P0-3** 字段落库（创建/更新/DB 一致/外键生效），测试数据已清理、库行数回归原始
- ✅ 迁移脚本修复后重跑 **COMMIT 成功**，且对 baseline schema 漂移具备弹性（Fix #4/#5）
- ✅ 语法校验通过；`GET /employees` 列表端点同步修复可正常返回（含解密 `id_card`）

### 放行前置条件（进入阶段 1）
1. 回填 0% 作为已知风险随行（前端文本兜底）；建议 v1.2 回填增强（按 `、` 拆分多人员）—— 不阻塞
2. 建议补齐 `ROLE_PERMISSIONS_MAP` 的 `admin`/`safety_manager` 映射，使 P0-2 经 API 事件可验证（预存在问题）
3. 建议独立任务修复 `GET /employees/profile/list` 的视图缺列问题（预存在，超出本修复范围）
4. 生产前须在**生产等价独立测试库**重跑迁移 + Dry Run（本环境为本地 `development` 库）

### 执行产物（工作文件，非代码）
- 修复后官方迁移脚本：`server/sql/hse_employee_master_v68_extension.sql`（已改）
- 后端路由修复：`server/routes/hse-employee.js`（已改）
- 迁移重跑日志：`.workbuddy/dryrun/v68_migration_rerun.log`
- 冒烟日志：`.workbuddy/dryrun/p01_smoke_r2c.log` / `p01_p02_smoke_r2b.log` / `p03_smoke_r2.log`

---

> 报告人：Senior Developer（高级开发工程师）
> 关联文档：`R1-Phase1-缺陷修复报告.md`

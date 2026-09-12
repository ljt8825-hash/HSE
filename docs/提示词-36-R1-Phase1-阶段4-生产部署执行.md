# 提示词 36：R1-Phase1 阶段 4 — 生产部署执行（独立测试库重跑 + Dry Run + 生产放行）

> 创建日期：2026-07-29
> 前置条件：提示词 35 已完成（R1-Phase1 终态报告，26 项链路验证全部通过，5 级门控全部 Go）
> 所属阶段：R1 Phase 1 后端协作 — 阶段 4 执行阶段
> 用途：消除唯一 P0 阻塞项（独立测试库重跑），推进生产灰度部署
> 性质：**执行 + 验证 + 放行**（不修改代码，仅执行部署步骤和冒烟测试）

---

## 背景

R1-Phase1 历经 13 轮迭代（Sprint-Q 6 轮 + R1-Phase1 7 轮），后端 P0-1/P0-2/P0-3 + 前端消费层切换已全部完成，26 项全链路验证全部通过。当前唯一未完成的 P0 阻塞项为「独立测试库重跑迁移 + Dry Run」（阶段 1 步骤 0）。

本次任务是**执行阶段入口**：在独立测试库完成重跑验证后，按顺序推进生产数据库迁移 + 后端代码部署 + 冒烟测试 + 监控，最终生成生产放行报告。

---

## 要求

### 1. 读取所有基线文档

**必须读取**：
- `F:\hse-dashboard\docs\R1-Phase1-阶段1-灰度部署放行确认单.md`（§三 灰度部署执行步骤、§四 冒烟测试用例 15 项、§五 回滚预案）
- `F:\hse-dashboard\docs\R1-Phase1-DryRun-R2执行报告.md`（§一 环境信息、§二 迁移执行记录、§三 回填命中率、§四 冒烟测试结果、§五 异常与风险、§六 门控决策）
- `F:\hse-dashboard\docs\R1-Phase1-缺陷修复报告.md`（§三 Fix #1~#5 修复清单、§四 验证）
- `F:\hse-dashboard\docs\R1-Phase1-终态报告.md`（§B 已知局限、§C 回填质量复盘、§E.3 残留问题清单）
- `F:\hse-dashboard\docs\R1-Phase1-后端协作需求规格.md`（v1.1，§二~§五 各 P0 规格、§八 实施顺序）

### 2. 读取关键部署文件

**必须读取**：
- `F:\hse-dashboard\server\sql\hse_employee_master_v68_extension.sql`（确认迁移脚本最新版本，含 Fix #4/#5 的幂等/弹性修复）
- `F:\hse-dashboard\server\routes\hse-employee.js`（确认 Fix #1/#2/#3 已落地）
- `F:\hse-dashboard\server\routes\hazards.js`（确认 P0-3 checkerId/fixerId 落库）
- `F:\hse-dashboard\server\routes\accidents.js`（确认 P0-3 handlerId 落库）
- `F:\hse-dashboard\server\routes\emergency.js`（确认 P0-3 responsiblePersonId 落库）
- `F:\hse-dashboard\server\services\employeeEventService.js`（确认 P0-2 事件服务）

---

## 3. 任务 A：执行前检查（Gate 0）

### 3.1 代码变更确认

```bash
# 确认所有变更已提交，工作区干净
git status
git log --oneline -5
```

**检查项**：
- [ ] 6 个待部署文件均已提交（`hse-employee.js` / `hazards.js` / `accidents.js` / `emergency.js` / `employeeEventService.js` / `hse_employee_master_v68_extension.sql`）
- [ ] 工作区干净（无未提交变更）
- [ ] 提交历史包含本次 R1-Phase1 所有修复

### 3.2 语法校验

```bash
node --check server/routes/hse-employee.js
node --check server/routes/hazards.js
node --check server/routes/accidents.js
node --check server/routes/emergency.js
node --check server/services/employeeEventService.js
```

**检查项**：
- [ ] 5 个 JS 文件语法校验全部通过（Exit Code 0）

### 3.3 迁移脚本完整性确认

读取 `server/sql/hse_employee_master_v68_extension.sql`，确认以下内容：
- [ ] Fix #4：`INSERT INTO migration_baseline ... ON CONFLICT (migration_name, table_name) DO NOTHING` 存在
- [ ] Fix #5：Step 0/0.5 各自封装为独立 `DO $$ ... EXCEPTION WHEN OTHERS THEN ... END $$` 块
- [ ] 4 列 ALTER（hazards.checker_id / fixer_id、accidents.handler_id、emergency_plans.responsible_person_id）
- [ ] 4 条 FK（ON DELETE SET NULL）
- [ ] 4 条索引
- [ ] 四级回填逻辑（L1 编号 / L2 数字ID / L3 姓名 / L4 模糊）
- [ ] 回滚 SQL（注释版，不在迁移事务内）
- [ ] 验证步骤（列存在性 / FK 存在性 / 索引存在性）

---

## 4. 任务 B：独立测试库重跑 + Dry Run（Gate 1 — 🔴 P0 阻塞项消除）

> **这是 R1-Phase1 唯一未完成的 P0 阻塞项。必须在生产前完成，门控 Go 后方可进入步骤 C。**

### 4.1 环境确认

**检查项**：
- [ ] 测试库 schema 与生产一致（表结构/列/约束比对）
- [ ] 测试库连接信息已确认（host / port / user / database）
- [ ] 测试库 `NODE_ENV` 独立于生产（不可与生产共用同一实例）

### 4.2 全库物理备份

```bash
pg_dump -h <TEST_HOST> -U hse_app -d safety_dashboard > backup_before_v68_test_$(date +%Y%m%d_%H%M%S).sql
```

**检查项**：
- [ ] 备份文件生成成功（文件大小 > 0）
- [ ] 备份文件路径已记录

### 4.3 执行迁移脚本

```bash
psql -h <TEST_HOST> -U hse_app -d safety_dashboard -f server/sql/hse_employee_master_v68_extension.sql
```

**检查项**：
- [ ] EXIT=0（无致命错误）
- [ ] 主事务 `COMMIT` 成功
- [ ] Step 0 `migration_baseline` 正常或不影响主迁移（Fix #5 弹性：schema 漂移时 `EXCEPTION` 捕获跳过）
- [ ] Step 0.5 `migration_backup_registry` 正常
- [ ] 4 列 ALTER 成功
- [ ] 4 条 FK 创建成功
- [ ] 4 条索引创建成功
- [ ] 四级回填执行完成
- [ ] 验证步骤通过（列存在性 = 1/1/1/1、FK 存在性、索引存在性）

### 4.4 记录回填命中率

从迁移输出中提取回填命中率（L1~L4），与 Dry Run R2 对比：

| 列 | 候选数 | L1 | L2 | L3 | L4 | 总命中率 | 与 R2 对比 |
|----|--------|----|----|----|----|----------|-----------|
| hazards.checker_id | | | | | | | |
| hazards.fixer_id | | | | | | | |
| accidents.handler_id | | | | | | | |
| emergency_plans.responsible_person_id | | | | | | | |

**检查项**：
- [ ] 命中率已记录
- [ ] 若命中率与 R2 差异显著（>10%），分析根因并记录

### 4.5 冒烟测试（≥11 用例，参照阶段 1 放行确认单 §四）

**P0-1 批量端点（7 用例）**：

| # | 用例 | 请求 | 预期 | 结果 |
|---|------|------|------|------|
| 1 | 真实 ID 批量 | `GET ?ids=<TEST_ID1>,<TEST_ID2>` | 2 条，含 `idCard` 明文 | |
| 2 | POST 数组 | `POST {ids:[<ID1>,<ID2>]}` | 同用例 1 | |
| 3 | 含不存在 ID | `ids=<ID1>,99999` | 仅返回存在的 1 条 | |
| 4 | 空参数 | `ids=` | 返回 `[]` | |
| 5 | 超上限 | 201 个 ID | `error(-4)` | |
| 6 | 非法格式 | `ids=abc` | `error(-3)` | |
| 7 | 单 ID | `ids=<ID1>` | 返回 1 条 | |

**P0-2 事件发布（3 用例）**：

| # | 用例 | 预期 | 结果 |
|---|------|------|------|
| 8 | 轮询端点 `GET /api/hse/employee/events` | `200 {code:0,data:{events:[],serverTime}}` | |
| 9 | 信封格式（代码验证） | `type` 带 `EMPLOYEE_` 前缀；10s 幂等去重 | |
| 10 | 实时事件触发（如角色映射已修复） | `PUT /employees/:id {name:'新名'}` → `EMPLOYEE_INFO_UPDATED` | |

**P0-3 字段落库（5 用例）**：

| # | 用例 | 预期 | 结果 |
|---|------|------|------|
| 11 | 创建隐患带 ID | `POST /hazards {checkerId:<ID1>,fixerId:<ID2>}` → 响应含 ID | |
| 12 | 更新隐患 ID | `PUT /hazards/:id {checkerId:<ID1>}` → 响应 + DB 确认 | |
| 13 | 外键约束 | 非法员工 id → 外键冲突报错 | |
| 14 | 员工删除级联 | 删除被引用 employee → 对应 `_id` 置 NULL | |
| 15 | 列表端点 | `GET /employees?pageSize=2` → 200，含解密 `id_card` | |

**检查项**：
- [ ] 15 个用例全部执行
- [ ] 至少 11 个用例通过（PASS 标准）
- [ ] 测试数据已清理（删除测试隐患/事故/应急预案，表行数回归原始值）

### 4.6 门控决策

**Go 条件**（全部满足）：
- [ ] 迁移 EXIT=0，COMMIT 成功
- [ ] 4 列 / 4 FK / 4 索引全部存在（验证步骤通过）
- [ ] 冒烟 ≥ 11/15 通过
- [ ] 回填命中率已记录（无论高低，不阻塞——前端有文本兜底）

**No-Go 条件**（任一触发则中止，修复后重跑）：
- [ ] 迁移 COMMIT 失败
- [ ] DDL/FK/索引验证失败（列不存在）
- [ ] P0-1 批量端点功能不可用（用例 1-7 低于 5/7）

---

## 5. 任务 C：生产数据库迁移（Gate 2）

> **前置条件**：Gate 1（独立测试库重跑）= **Go**，方可执行。

### 5.1 部署前检查

```bash
# 确认 schema 版本（生产库应尚未执行新增列）
psql -h <PROD_HOST> -U hse_app -d safety_dashboard -c \
  "SELECT column_name FROM information_schema.columns WHERE table_name='hazards' AND column_name IN ('checker_id','fixer_id');"
```

**检查项**：
- [ ] 生产库 `hazards` 表尚无 `checker_id`/`fixer_id` 列（确认未重复执行）

### 5.2 生产库全量备份（强制）

```bash
pg_dump -h <PROD_HOST> -U hse_app -d safety_dashboard > backup_before_v68_prod_$(date +%Y%m%d_%H%M%S).sql
```

**检查项**：
- [ ] 备份文件生成成功（确认文件大小合理）
- [ ] 备份文件路径已记录（用于回滚）

### 5.3 锁检查 / 活跃连接检查

```bash
psql -h <PROD_HOST> -U hse_app -d safety_dashboard -c \
  "SELECT pid, state, query FROM pg_stat_activity WHERE datname='safety_dashboard' AND state='active';"

psql -h <PROD_HOST> -U hse_app -d safety_dashboard -c \
  "SELECT relation::regclass, mode, granted FROM pg_locks WHERE relation IN ('hazards'::regclass,'accidents'::regclass,'emergency_plans'::regclass,'employee'::regclass);"
```

**检查项**：
- [ ] 无活跃写事务
- [ ] 无冲突锁（hazards / accidents / emergency_plans / employee 四表）

### 5.4 执行生产迁移

```bash
psql -h <PROD_HOST> -U hse_app -d safety_dashboard -f server/sql/hse_employee_master_v68_extension.sql
```

**检查项**：
- [ ] EXIT=0
- [ ] 主事务 `COMMIT` 成功
- [ ] 4 列 / 4 FK / 4 索引全部存在
- [ ] 回填命中率已记录（L1~L4）
- [ ] 记录执行耗时

### 5.5 迁移后验证

```bash
# 列存在性
psql -h <PROD_HOST> -U hse_app -d safety_dashboard -c \
  "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='hazards' AND column_name IN ('checker_id','fixer_id');"  # 预期 2

# FK 存在性
psql -h <PROD_HOST> -U hse_app -d safety_dashboard -c \
  "SELECT conname FROM pg_constraint WHERE conname LIKE 'fk_%_checker_id' OR conname LIKE 'fk_%_fixer_id';"

# 索引存在性
psql -h <PROD_HOST> -U hse_app -d safety_dashboard -c \
  "SELECT indexname FROM pg_indexes WHERE tablename='hazards' AND indexname LIKE 'idx_%';"
```

**检查项**：
- [ ] 列存在性 = 2（hazards.checker_id + hazards.fixer_id）
- [ ] FK 存在
- [ ] 索引存在

### 5.6 门控决策

**Go 条件**：
- [ ] 迁移 COMMIT 成功
- [ ] DDL/FK/索引验证全部通过
- [ ] 备份文件已就位（可回滚）

**No-Go 条件**：
- [ ] 迁移失败 → 立即执行回滚预案（§五），分析根因后修复重跑

---

## 6. 任务 D：后端代码部署（Gate 3）

> **前置条件**：Gate 2（生产数据库迁移）= **Go**，方可执行。

### 6.1 部署代码

```bash
# 按团队现有发布通道部署 5 个修改后的 JS 文件：
#   server/routes/hse-employee.js
#   server/routes/hazards.js
#   server/routes/accidents.js
#   server/routes/emergency.js
#   server/services/employeeEventService.js
# （git pull + 构建/拷贝，或 CI 制品部署）
```

**检查项**：
- [ ] 5 个文件已部署到生产环境
- [ ] 文件内容与仓库一致（可 `diff` 对比确认）

### 6.2 旧版热备

```bash
# 对当前生产 5 文件做副本，异常时秒级替换重启
cp server/routes/hse-employee.js server/routes/hse-employee.js.bak-pre-v68
cp server/routes/hazards.js server/routes/hazards.js.bak-pre-v68
cp server/routes/accidents.js server/routes/accidents.js.bak-pre-v68
cp server/routes/emergency.js server/routes/emergency.js.bak-pre-v68
cp server/services/employeeEventService.js server/services/employeeEventService.js.bak-pre-v68
```

**检查项**：
- [ ] 5 个 `.bak-pre-v68` 备份文件已生成

### 6.3 重启后端服务

```bash
pm2 restart hse-backend        # 或：先 taskkill 旧 node 进程再 node app.js
```

**检查项**：
- [ ] 服务重启成功（无启动报错）
- [ ] 健康检查端点正常：`curl --noproxy '*' -s http://127.0.0.1:5666/api/health`
- [ ] 端口监听正常（`:5666`）

> ⚠️ 本机若设 `HTTP_PROXY`，curl 访问 localhost 须加 `--noproxy '*'`，否则超时

### 6.4 门控决策

**Go 条件**：
- [ ] 5 个文件部署成功
- [ ] 服务重启成功
- [ ] 健康检查通过
- [ ] 旧版热备已就位

**No-Go 条件**：
- [ ] 服务启动失败 → 立即回滚代码（替换 `.bak-pre-v68` 文件 + 重启），分析根因后修复

---

## 7. 任务 E：生产冒烟测试（Gate 4）

> **前置条件**：Gate 3（后端代码部署）= **Go**，方可执行。

**执行 15 个冒烟用例**（同任务 B 4.5 用例表），在生产环境逐一验证：

**P0-1 批量端点（7 用例）**：
- [ ] 用例 1-7 全部执行，至少 5/7 通过

**P0-2 事件发布（3 用例）**：
- [ ] 用例 8（轮询端点）通过
- [ ] 用例 9（信封格式）通过
- [ ] 用例 10（实时事件触发）如角色映射未修复，标注为「⚠️ 待角色映射修复后补验」

**P0-3 字段落库（5 用例）**：
- [ ] 用例 11-12（创建/更新隐患）通过
- [ ] 用例 13（外键约束）通过
- [ ] 用例 14（级联删除）通过
- [ ] 用例 15（列表端点）通过

**关键观察**：
- 生产库业务表源文本格式可能与测试库不同，回填命中率可能高于 0%。记录生产实际命中率。
- 若生产命中率 > 0%，前端 `EmployeeName` 组件将首次展示历史数据的人员链接（而非仅文本兜底）。

**检查项**：
- [ ] 15 个用例全部执行
- [ ] 至少 11/15 通过
- [ ] 测试数据已清理（表行数回归原始值）
- [ ] 生产回填命中率已记录（与测试库对比）

### 门控决策

**Go 条件**：
- [ ] ≥ 11/15 用例通过
- [ ] P0-1 批量端点功能正常（≥ 5/7）
- [ ] 测试数据已清理

**No-Go 条件**：
- [ ] P0-1 批量端点不可用（< 5/7）→ 检查服务日志，必要时回滚代码
- [ ] 多个 P0-3 用例失败 → 检查迁移是否完整，必要时回滚迁移

---

## 8. 任务 F：监控确认（Gate 5）

### 8.1 WS 推送监控

```bash
# 如有 WS 客户端，确认连接正常，心跳 PONG 响应正常
# 触发调岗/离职操作后，观察 WS 是否收到 EMPLOYEE_EVENT
```

**检查项**：
- [ ] WS 连接正常（心跳 PONG）
- [ ] 触发员工变更后，WS 收到 `NOTIFICATION → EMPLOYEE_EVENT`

### 8.2 轮询端点监控

```bash
curl --noproxy '*' -s "http://127.0.0.1:5666/api/hse/employee/events"
# 预期 {code:0, data:{events:[], serverTime:...}}
```

**检查项**：
- [ ] 轮询端点可访问，返回结构正确

### 8.3 错误日志监控

**检查项**：
- [ ] 无新增异常（重点关注 `decryptFields` / JOIN 相关报错）
- [ ] 无 `EMPLOYEE_EVENT` 处理失败日志
- [ ] 服务正常运行 ≥ 5 分钟无崩溃

### 8.4 门控决策

**Go 条件**：
- [ ] WS 连接正常
- [ ] 轮询端点正常
- [ ] 无新增异常日志
- [ ] 服务稳定运行 ≥ 5 分钟

---

## 9. 任务 G：生成生产放行报告

### 9.1 报告结构

生成 Markdown 报告，保存到 `F:\hse-dashboard\docs\R1-Phase1-生产放行报告.md`，包含：

1. **执行摘要**（5 级 Gate 一览表）
2. **Gate 0：执行前检查**（代码变更确认 + 语法校验 + 迁移脚本完整性）
3. **Gate 1：独立测试库重跑**（环境确认 + 备份 + 迁移执行 + 回填命中率 + 冒烟 15 用例 + 门控决策）
4. **Gate 2：生产数据库迁移**（部署前检查 + 备份 + 锁检查 + 迁移执行 + 迁移后验证 + 门控决策）
5. **Gate 3：后端代码部署**（文件部署 + 旧版热备 + 服务重启 + 健康检查 + 门控决策）
6. **Gate 4：生产冒烟测试**（15 用例全量结果 + 生产回填命中率 + 测试数据清理 + 门控决策）
7. **Gate 5：监控确认**（WS 推送 + 轮询端点 + 错误日志 + 门控决策）
8. **最终放行结论**（5 级 Gate 全部 Go ⇒ 生产放行）
9. **回滚预案**（引用阶段 1 放行确认单 §五：迁移回滚 + 代码回滚 + 数据回滚）
10. **执行产物清单**（备份文件路径 + 迁移日志 + 冒烟日志 + 报告文件）

### 9.2 最终放行条件

**全部 5 级 Gate 必须 = Go**：

| Gate | 名称 | 条件 |
|------|------|------|
| 0 | 执行前检查 | 代码已提交 + 语法校验通过 + 迁移脚本完整 |
| 1 | 独立测试库重跑 | 迁移 COMMIT 成功 + DDL/FK/索引验证通过 + 冒烟 ≥ 11/15 |
| 2 | 生产数据库迁移 | 备份已就位 + 迁移 COMMIT 成功 + DDL/FK/索引验证通过 |
| 3 | 后端代码部署 | 5 文件部署 + 旧版热备 + 服务重启 + 健康检查通过 |
| 4 | 生产冒烟测试 | ≥ 11/15 通过 + P0-1 正常 + 测试数据已清理 |
| 5 | 监控确认 | WS 正常 + 轮询正常 + 无异常日志 + 稳定 ≥ 5min |

---

## 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `docs/R1-Phase1-生产放行报告.md` | 新增 | 5 级 Gate 执行与放行报告 |

---

## 禁止事项

- 禁止修改任何代码文件（后端 + 前端 + SQL）
- 禁止跳过 Gate 条件（任一 Gate No-Go 必须中止，修复后从该 Gate 重新执行）
- 禁止在生产库执行迁移前跳过备份
- 禁止在生产库执行迁移前跳过低活跃连接/锁检查
- 禁止在 Gate 1（测试库重跑）No-Go 时直接进入生产步骤
- 禁止代签任何角色
- 禁止修改已有文档（仅读取引用）

---

## 验收标准

- 5 级 Gate 全部执行，每级有明确的 Go/No-Go 决策
- 测试库重跑完成（迁移 + 冒烟 + 回填命中率记录）
- 生产数据库迁移完成（备份 + 锁检查 + 迁移 + 验证）
- 后端代码部署完成（5 文件 + 热备 + 重启 + 健康检查）
- 生产冒烟 ≥ 11/15 通过
- 监控确认正常（WS + 轮询 + 日志）
- 生产放行报告完整（含所有 Gate 执行记录和门控决策）

---

## 异常处理规则

| 异常场景 | 处置 |
|----------|------|
| 测试库迁移 COMMIT 失败 | 修复脚本后重跑（不进入生产步骤） |
| 测试库冒烟 < 11/15 | 分析失败用例，修复后重跑 |
| 生产库有活跃写事务 | 等待事务完成或联系 DBA 终止 |
| 生产库有冲突锁 | 等待锁释放或联系 DBA 处理 |
| 生产迁移 COMMIT 失败 | 立即执行回滚（§五），分析根因 |
| 服务重启失败 | 回滚代码（替换 `.bak-pre-v68`），分析日志 |
| 生产冒烟 P0-1 不可用 | 检查服务日志，必要时回滚代码 |
| 生产冒烟 P0-3 异常 | 检查迁移完整性，必要时回滚迁移 |
| WS 连接异常 | 检查 WS 服务，不影响主业务（事件非关键路径） |
| 新增错误日志 | 评估影响范围，严重则回滚 |

---

## 输出格式

- 生成 Markdown 报告，保存到 `F:\hse-dashboard\docs\R1-Phase1-生产放行报告.md`
- 所有执行命令的**实际输出**粘贴到报告中（非预期值）
- 所有检查项标注 `[x]`（已通过）或 `[ ]`（待执行/未通过）
- 所有门控决策标注 🟢 Go / 🔴 No-Go
- 执行时间戳精确到分钟（如 `14:02`）

---

> 编制：Senior Developer（高级开发工程师）
> 关联文档：`R1-Phase1-阶段1-灰度部署放行确认单.md`、`R1-Phase1-DryRun-R2执行报告.md`、`R1-Phase1-缺陷修复报告.md`、`R1-Phase1-终态报告.md`、`R1-Phase1-后端协作需求规格.md`（v1.1）
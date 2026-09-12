# 提示词 31：R1-Phase1 Dry Run 执行（测试环境验证 → 灰度放行）

> 创建日期：2026-07-29
> 前置条件：提示词 30 已完成（v1.1 修正全部落地，代码核验通过）
> 所属阶段：R1 Phase 1 后端协作 — 阶段 0.5 Dry Run
> 用途：在测试环境执行完整迁移 + 冒烟测试，验证 3 项 P0 后端任务，生成 Dry Run 报告，为灰度部署放行
> 性质：**执行 + 验证 + 报告**（不修改代码，仅执行和验证）

---

## 背景

R1-Phase1 后端协作 3 项 P0 任务已全部实现并通过语法校验，v1.1 修正已落地（7 项修正全部代码核验通过）。按项目硬约束「生产迁移前必须完成整改→Dry Run→复审→Production Go」，当前进入 Dry Run 阶段。

**涉及文件**：
- `server/routes/hse-employee.js` — P0-1 批量端点 + P0-2 事件注入 + 轮询端点
- `server/services/employeeEventService.js` — P0-2 事件服务
- `server/routes/hazards.js` / `accidents.js` / `emergency.js` — P0-3 字段落库
- `server/sql/hse_employee_master_v68_extension.sql` — P0-3 迁移脚本（含四级回填 + baseline/registry）
- `docs/R1-Phase1-后端协作需求规格.md`（v1.1）— 实施参考

---

## 要求

### 1. 读取所有基线文档

**必须读取**：
- `F:\hse-dashboard\docs\R1-Phase1-后端协作需求规格.md`（v1.1，§四 P0-3 迁移脚本、§五 测试用例、§八 实施顺序）
- `F:\hse-dashboard\server\sql\hse_employee_master_v68_extension.sql`（完整迁移脚本，确认内容）

**必须探索**：
- `server/routes/hse-employee.js` — 确认 `/employees/batch` 和 `/events` 端点存在
- `server/routes/hazards.js` / `accidents.js` / `emergency.js` — 确认 `*Id` 字段在 formatRow/INSERT/UPDATE 中
- `server/config/db.js` — 确认数据库连接配置（测试环境 vs 生产环境）

### 2. 阶段 0.5-A：测试环境迁移脚本执行

**前提**：确认当前连接的是测试环境数据库（非生产），通过 `server/config/db.js` 或环境变量 `DB_HOST` 确认。

**执行步骤**（严格遵循 §4.4 执行顺序）：

（A）**锁检查和活跃连接检查**：
```sql
SELECT pid, state, query FROM pg_stat_activity WHERE datname='hse_dashboard' AND state='active';
SELECT relation::regclass, mode, granted FROM pg_locks
WHERE relation IN ('hazards'::regclass, 'accidents'::regclass, 'emergency_plans'::regclass, 'employee'::regclass);
```
记录结果：如有未释放锁或活跃长事务，标注风险并等待。

（B）**备份**（`pg_dump` 或等效方式，测试环境可简化）。

（C）**执行迁移脚本**：
```bash
psql -h <host> -U <user> -d hse_dashboard -f server/sql/hse_employee_master_v68_extension.sql
```
记录执行输出，特别是：
- RAISE NOTICE 输出的 baseline 行数
- RAISE NOTICE 输出的回填命中率（L1/L2/L3/L4 各列各级的命中数）
- 外键创建是否成功
- 索引创建是否成功
- 列存在性验证 NOTICE 计数

（D）**验证**：
```sql
-- 列存在性
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name IN ('hazards','accidents','emergency_plans') AND column_name LIKE '%_id';

-- 外键存在性
SELECT conname, conrelid::regclass FROM pg_constraint WHERE conname LIKE 'fk_%checker%' OR conname LIKE 'fk_%fixer%' OR conname LIKE 'fk_%handler%' OR conname LIKE 'fk_%resp_person%';

-- 回填统计
SELECT 'hazards.checker_id' AS col, COUNT(*) AS filled FROM hazards WHERE checker_id IS NOT NULL
UNION ALL SELECT 'hazards.fixer_id', COUNT(*) FROM hazards WHERE fixer_id IS NOT NULL
UNION ALL SELECT 'accidents.handler_id', COUNT(*) FROM accidents WHERE handler_id IS NOT NULL
UNION ALL SELECT 'emergency_plans.responsible_person_id', COUNT(*) FROM emergency_plans WHERE responsible_person_id IS NOT NULL;
```

### 3. 阶段 0.5-B：冒烟测试

**P0-1 批量端点测试**（至少 5 个用例，参照 §5.1）：

```bash
# 1. 正常批量
curl -s "http://localhost:<port>/api/hse/employee/employees/batch?ids=1,2,3" | jq .

# 2. POST 数组
curl -s -X POST "http://localhost:<port>/api/hse/employee/employees/batch" \
  -H "Content-Type: application/json" -d '{"ids":[1,2]}' | jq .

# 3. 含不存在的 ID
curl -s "http://localhost:<port>/api/hse/employee/employees/batch?ids=1,99999" | jq .

# 4. 空参数
curl -s "http://localhost:<port>/api/hse/employee/employees/batch?ids=" | jq .

# 5. 超上限（201 个 ID）
curl -s "http://localhost:<port>/api/hse/employee/employees/batch?ids=1,2,...,201" | jq .
```

**验收标准**：
- 用例 1/2：返回 `EmployeeInfo[]`，含 `phone`/`idCard` 明文
- 用例 3：仅返回 1 条，不报错
- 用例 4：返回空数组 `[]`
- 用例 5：返回 `error(-4)` 提示最多 200

**P0-2 事件发布测试**（至少 3 个用例，参照 §5.2）：

- 至少验证 1 个事件类型能通过 `/events` 轮询端点查到
- 验证事件信封格式与前端 `EmployeeEventEnvelope` 一致（type 带 `EMPLOYEE_` 前缀）
- 注意：如 WS 不可用（测试环境可能无 WS 客户端），仅验证轮询通道即可

**P0-3 字段落库测试**（至少 3 个用例，参照 §5.3）：

```bash
# 创建隐患带 ID
curl -s -X POST "http://localhost:<port>/api/hse/hazards" \
  -H "Content-Type: application/json" \
  -d '{"checkerId":5, "fixerId":8, ...其他必填字段...}' | jq '.data.checkerId, .data.fixerId'

# 更新隐患 ID
curl -s -X PUT "http://localhost:<port>/api/hse/hazards/<id>" \
  -H "Content-Type: application/json" \
  -d '{"checkerId":9}' | jq '.data.checkerId'
```

**验收标准**：
- 创建/更新响应中 `*Id` 字段有值且与入参一致
- 库表对应列有值（通过 SQL 查询验证）

### 4. 阶段 0.5-C：生成 Dry Run 报告

**报告结构**：

```
# R1-Phase1 Dry Run 执行报告

## 一、环境信息
- 数据库：host / db_name / 版本
- 后端：版本 / 端口
- 执行时间：起止时间

## 二、迁移执行记录
- 锁检查结果
- baseline 行数（4 表）
- DDL 执行结果（4 列 ALTER TABLE）
- 外键创建结果（4 条 FK）
- 索引创建结果（4 条 INDEX）
- 回填结果（4 列 × 4 级 L1~L4 命中数）
- 验证 NOTICE 输出

## 三、回填命中率统计
| 列 | 候选数 | L1(编号) | L2(数字ID) | L3(姓名) | L4(模糊) | 总命中率 |
|----|--------|----------|-----------|----------|----------|----------|
| hazards.checker_id | | | | | | |
| hazards.fixer_id | | | | | | |
| accidents.handler_id | | | | | | |
| emergency_plans.responsible_person_id | | | | | | |

## 四、冒烟测试结果
- P0-1 批量端点（5 用例，通过/失败 + 实际响应摘要）
- P0-2 事件发布（3 用例）
- P0-3 字段落库（3 用例）

## 五、异常与风险
- 异常记录
- 风险标注（回填命中率低、锁冲突、外键冲突等）

## 六、门控决策
- Go / No-Go 建议
- 如 No-Go，列出阻塞项和修复方案
- 如 Go，列出进入阶段 1 的前置条件清单
```

### 5. 阶段 0.5-D：复审与放行

**复审重点**（参照 §八 阶段 0.5 要求）：
- 回填命中率是否可接受（建议 >60%，低于 30% 需人工评估）
- 是否有异常锁或外键冲突
- 冒烟测试是否全部通过（P0-1/P0-2/P0-3 各至少 3 个用例通过）
- 事件类型是否与前端 `EmployeeEventType` 一致（`EMPLOYEE_` 前缀）

**放行条件**：
- 迁移脚本全部执行成功，无报错
- 冒烟测试 100% 通过
- 如回填命中率 <30%，需标注风险但不应阻塞（前端有文本兜底）
- 锁检查无异常

---

## 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `server/sql/hse_employee_master_v68_extension.sql` | 执行 | 在测试环境执行完整迁移 |
| `docs/R1-Phase1-DryRun执行报告.md` | 新增 | Dry Run 报告（六段式结构） |

## 禁止事项

- 禁止在生产环境执行迁移脚本（必须确认当前连接为测试环境）
- 禁止修改任何代码文件（本次为纯执行+验证+报告）
- 禁止修改前端代码
- 禁止修改 `employeeEventService.js` / `wsServer.js`

## 验收标准

- Dry Run 报告包含完整的迁移执行记录（含各步耗时）
- 回填命中率统计表（4 列 × 4 级）
- 冒烟测试至少 11 个用例（P0-1: 5 + P0-2: 3 + P0-3: 3）
- 门控决策明确（Go/No-Go + 前置条件）
- 报告保存到 `F:\hse-dashboard\docs\R1-Phase1-DryRun执行报告.md`

## 输出格式

- 生成 Dry Run 执行报告，保存到 `F:\hse-dashboard\docs\R1-Phase1-DryRun执行报告.md`
- 报告结构如 §4 所述，六段式
- 如无法连接测试环境数据库，生成「Dry Run 阻塞报告」，说明阻塞原因和所需资源
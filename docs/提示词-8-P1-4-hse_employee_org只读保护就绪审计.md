# 提示词 8：P1-4 — hse_employee_org 只读保护就绪审计

> 生成日期：2026-07-29
> 优先级：P1（中）
> 依赖：P1-3 已完成
> 状态：⏳ 待执行

---

## 任务

审计 hse_employee_org 只读保护 SQL 的就绪状态，生成差距分析与执行清单。

---

## 背景

Sprint-C v1.0 已生成只读保护 SQL 脚本（`Sprint-C-v1.0/02_SQL/hse_employee_org_ReadOnly_Change.sql`），TRAE-Step9 在开发环境验证了触发器创建逻辑可行。但根据《Legacy_Table_Lifecycle_Report》，hse_employee_org 当前仍为"使用中"状态——hse-employee.js 中存在 7 处生产写入操作尚未迁移至 employee_assignment。

项目约束明确规定：
- "只读保护SQL已生成，API收敛完成后可立即执行"
- "核心迁移任务（后端API收敛）需作为独立开发任务在后续迭代中执行"

因此在 API 收敛完成前，只读保护 SQL 不能直接在生产环境执行。本次任务的目标是审计就绪状态，而非执行 SQL。

---

## 本次任务需要

1. 审计只读保护 SQL 脚本的正确性、完整性
2. 对比 TRAE-Step9 开发环境验证结果与生产环境前置条件
3. 明确 API 收敛的 7 处写入操作现状
4. 生成差距分析报告：什么已完成、什么待完成、什么阻塞
5. 生成执行清单：API 收敛完成后可立即执行的步骤序列

---

## 要求

### 1. 读取以下文档

- `F:\hse-dashboard\docs\Sprint-C-v1.0\02_SQL\hse_employee_org_ReadOnly_Change.sql`（只读保护 SQL 脚本）
- `F:\hse-dashboard\docs\TRAE-Step9-只读保护与巡检部署.md`（开发环境验证报告）
- `F:\hse-dashboard\docs\Sprint-C-v1.0\03_Governance\Legacy_Table_Lifecycle_Report.md`（旧表生命周期评估）
- `F:\hse-dashboard\docs\Sprint-C-v1.0\01_Audit\Legacy_Model_Usage_Report.md`（旧模型使用审计）
- `F:\hse-dashboard\docs\Sprint-C-v1.0\01_Audit\Employee_API_Model_Migration_Report.md`（API 迁移审计）
- `F:\hse-dashboard\docs\Sprint-C-Phase1-API-Convergence-Report.md`（API 收敛阶段报告，如果存在）
- `F:\hse-dashboard\docs\Sprint-C-v1.0\04_Report\Sprint-C-v1.0-Final-Report.md`（Sprint-C 最终报告）

### 2. 审计只读保护 SQL 脚本

- 检查 Step 0（前置检查）逻辑是否完整
- 检查 Step 1（触发器创建）语法是否正确
- 检查 Step 3（验证测试）覆盖是否充分（SELECT / INSERT / UPDATE / DELETE）
- 检查 Step 4（回滚脚本）是否可用
- 检查 hse_employee_relation 可选保护（Step 2 注释部分）是否需要在本次一并执行
- 对比 TRAE-Step9 开发环境验证结果，确认 SQL 在逻辑上是可行的

### 3. 审计 API 收敛前置条件

- 从 Legacy_Model_Usage_Report 和 API_Migration_Report 中提取 hse_employee_org 的 7 处写入操作清单
- 确认哪些已迁移至 employee_assignment、哪些仍未迁移
- 评估如果 API 收敛未完成就执行只读保护的风险（生产功能是否会中断）

### 4. 生成就绪状态矩阵

| 就绪条件 | 当前状态 | 阻塞项 | 归属 |
|----------|----------|--------|------|
| SQL 脚本正确性 | 待审计 | — | 本次 |
| 开发环境验证 | 已完成（TRAE-Step9）| — | — |
| 生产环境前置检查（Step 0）| 待 API 收敛后执行 | API 收敛 | 后端 |
| API 收敛（7 处写入迁移）| 待确认 | 后端开发 | 后端 |
| hse_employee_relation 同步保护 | 待决策 | 业务确认 | 业务/DBA |
| 回滚脚本就绪 | 待审计 | — | 本次 |

### 5. 生成执行清单

按顺序列出从「API 收敛确认」→「只读保护执行」→「验证」→「回滚准备」的完整步骤，每步标注负责角色、前置条件、验证方法。

---

## 输出格式

- 生成 Markdown 文档，保存到 `F:\hse-dashboard\docs\P1-4-hse_employee_org只读保护就绪审计报告.md`

### 文档结构

1. **执行摘要**（就绪状态一览）
2. **SQL 脚本审计**（正确性 / 完整性 / 验证覆盖）
3. **API 收敛前置条件审计**（7 处写入操作现状）
4. **就绪状态矩阵**（已完成 vs 待完成 vs 阻塞）
5. **差距分析**（什么阻止了立即执行）
6. **执行清单**（API 收敛完成后的步骤序列）
7. **风险评估**（提前执行的风险 / 延迟执行的风险）
8. **遗留待办**

---

## 禁止事项

- 禁止修改代码、SQL、路由、接口、配置
- 禁止执行任何 SQL（包括开发环境、测试环境、生产环境）
- 禁止修改只读保护 SQL 脚本内容（仅审计，不编辑）
- 禁止修改 TRAE-Step9 或其他已有文档
- 禁止代签任何角色
- 所有审计结论必须引用源文档具体位置，不得凭空断言
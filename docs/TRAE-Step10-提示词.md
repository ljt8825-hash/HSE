# TRAE Step 10 提示词｜Sprint D：下游板块交互根因修复（用户核心痛点）

> **对应阶段**: Phase 2 · Step 10（审计整改闭环后的功能修复第一步）
> **前置已满足**: Step 9 的只读保护 / 巡检调度 / 索引复核已在 dev 完成并通过验证；`employee.id_card_hash` 列已确认存在（代码 L354/587/621/669 等多处引用），是规范身份键。
> **性质**: 解决用户最初诉求——"花名册导入后与其他板块无法交互"。
> **铁律**: dev 环境开发与验证；**不得**修改迁移 SQL 与 `hse_employee_org`；生产回填执行必须等 Sprint B 生产迁移完成 + DBA 签字后由 DBA 执行；TRAE 不代签。

---

## 一、背景（为什么做这一步）

用户最初要改系统的根因：花名册导入后，**三违、培训等下游板块拿不到人员外键**，导致"无法交互"。

前期审计已用数据坐实该根因（TRAE-Step1）：
- 三违 `violator_id`：890/890 = **100% NULL**
- 培训 `employee_id`：100/100 = **100% NULL**

代码层根因（TRAE-Step3 已核实）：`violations.js:167` 写 `violator_id: data.violator_id || null`、`training.js:353/473` 写 `employee_id || null`——即写入时**未做人员解析/回填**，旧模块也无回写逻辑。

本步目标：让新记录写入时**自动关联人员**，并**回填历史 NULL 记录**，使下游板块能真正交互。

---

## 二、给你的执行提示词（直接复制给 TRAE 的版本）

```
# 任务：Sprint D 下游板块交互根因修复（dev 开发与验证）

你是执行者。请仅在生产迁移之外的 dev 环境工作，产出一份规范 md。
禁止修改任何迁移 SQL（Sprint-B-v2.1-Production-Package 下的 .sql）和 hse_employee_org 相关对象。

## 目标
修复"花名册导入后与其他板块无法交互"：让三违/培训等下游记录在写入时能关联 employee，
并回填历史上 violator_id / employee_id 为 NULL 的记录。

## 步骤
1. **确认关联键（必做，先查后写）**
   - 已知 employee 表有 id_card_hash 列（HMAC-SHA256 / hashSensitive 计算，见 hse-employee-import-v2.js:353 / hse-employee.js:617）。
   - 查明三违表（routes/violations.js 对应的 DB 表）、培训表（routes/training.js 对应的 DB 表）
     各自有哪些可用于关联 employee 的列：如 violator_id_card / id_card / id_card_hash / employee_no / name 等。
   - 输出每张表的"候选关联键"清单，并判定哪个键能稳定 join 到 employee.id_card_hash
     （注意：若下游表只存明文身份证，需用相同的 hashSensitive 函数先算 hash 再 join；
      若下游表存的是姓名且重名风险高，需在 md 中明确标注可靠性风险）。

2. **开发写入路径修复（代码层）**
   - 修改 violations.js 写入逻辑（约 L167）：在 INSERT/UPDATE 三违记录时，
     用步骤1确认的键解析出 employee.id，回填 violator_id（解析不到时如何处理需显式决定：
     留 NULL 并打 WARN 日志，还是阻断？请给出你的建议并说明理由）。
   - 修改 training.js 写入逻辑（约 L353/473）：同理回填 employee_id。
   - 给出精确代码 diff（文件:行号 + 改前/改后），并确保不破坏现有接口契约。

3. **开发历史数据回填脚本（dev 可测）**
   - 写一段 UPDATE SQL（或 node 脚本）：将三违/培训表中 violator_id/employee_id 为 NULL 的记录，
     通过步骤1确认的键 join employee.id_card_hash 回填。
   - 必须在 dev 用样本数据跑通：先 SELECT 估算可回填比例，再执行 UPDATE，再 SELECT 复核。
   - 输出：可回填条数 / 不可回填条数（及原因，如缺关联键）。

4. **验证**
   - 用 1 条新造的三违/培训记录（带关联键）走写入路径，确认 violator_id/employee_id 被填上。
   - 确认巡检视图 v_employee_assignment_health 不受影响（本步不改 employee_assignment）。

5. **生产门控说明（重要）**
   - 在 md 中明确：步骤3的历史回填脚本**不得在 dev 之外执行**；
     生产回填必须在 Sprint B 生产迁移（B-0/B-2）完成且 DBA 签字后，由 DBA 在生产库执行。

## 产出
- 文档：docs/TRAE-Step10-下游交互根因修复.md
  章节：①环境与权限 ②关联键调查结果 ③代码 diff ④回填脚本与 dev 实测 ⑤验证结果
        ⑥生产门控说明 ⑦证据索引（文件:行号）⑧遗留/需决策项
- 改动文件清单（仅限 violations.js / training.js / 新建回填脚本，禁止动迁移 SQL 与旧表）
- 签字栏：留空，禁止代签。
```

---

## 三、验收点（我后续审核时逐条核对）

| # | 验收项 | 通过标准 |
|---|--------|----------|
| 1 | 关联键调查 | 明确列出三违/培训表的候选键，并判定哪个能 join employee.id_card_hash |
| 2 | 写入路径修复 | violations.js / training.js 的 diff 真实存在且可编译，回填逻辑闭合 |
| 3 | 回填脚本 | dev 实测：可回填/不可回填条数清晰，SELECT 前后复核一致 |
| 4 | 未越界 | 未改迁移 SQL、未改 hse_employee_org、未代签 |
| 5 | 生产门控 | md 明确标注回填脚本生产执行的前置条件（迁移完成 + DBA 签字） |
| 6 | 证据索引 | 每个结论附文件:行号，可独立复核 |

---

## 四、提醒

- 若三违/培训表**完全没有**可关联 employee 的键（既无身份证也无工号），这是**阻断项**：
  需在 md 中明确指出，并建议替代方案（如：要求相关业务重新导入并带身份证字段）。
- 生产回填是 DBA 职责，本步只做 dev 开发与脚本准备。

# TRAE Step 11 提示词｜前端录入字段打通 + 回填脚本安全加固

> **对应阶段**: Phase 2 · Step 11（Sprint D 功能修复第二步）
> **前置**: Step 10 已完成 dev 代码层修复（violations.js / training.js 写入时解析回填外键）+ 回填脚本就绪并门控，且已通过验证者审核。
> **性质**: 闭合 Step 10 两个遗留风险，让"可靠身份证键"对新记录真正生效，并堵住回填脚本误跑生产的风险。
> **铁律**: dev 环境；不得修改迁移 SQL 与 hse_employee_org；签字栏留空，TRAE 不代签。

---

## 一、给你的执行提示词（直接复制给 TRAE 的版本）

```
# 任务：前端录入字段打通 + 回填脚本生产安全加固（Sprint D Step 11）

你是执行者。仅在生产迁移之外的 dev 环境工作，产出规范 md。
禁止修改任何迁移 SQL（Sprint-B-v2.1-Production-Package 下的 .sql）和 hse_employee_org 相关对象。

## 背景
Step 10 已在后端让三违/培训写入时通过 id_card hash 或姓名解析回填外键，回填脚本就绪。
但两个风险需在 dev 闭合：
1. 三违前端录入表单尚无 violator_id_card 字段 → 新记录只能用不可靠的姓名匹配（重名误关联风险）。
2. 回填脚本 backfillEmployeeId.cjs 无生产环境硬拦截 → 有误跑生产库风险。

## 目标
1. **前端（三违）**：在违规录入/编辑表单（安全看板vben 中的 violation 录入组件）增加"身份证号（violator_id_card）"可选输入框，
   提交时带入 API。后端已支持 b.violatorIdCard / b.violator_id_card（violations.js:532 解构、L610 解析、L615 入库、L660 可更新），
   前端只需把字段发出去。给出改动文件:行号 + 关键代码片段。
2. **前端（培训）**：确认培训录入表单是否已从前端传 id_card（training.js 读 b.id_card，L375/377/379/381 已用）。
   若前端未传，补上该字段；若已传，在 md 中明确"已具备，无需改动"并给出证据（前端组件提交 payload 含 id_card）。
3. **后端脚本加固**：修改 server/scripts/backfillEmployeeId.cjs，在 main() 开头增加硬拦截：
   若 process.env.NODE_ENV === 'production' 且命令行不含 --dry-run，则打印警告并 process.exit(1)，
   防止误对生产库执行 UPDATE。--dry-run 模式下即使在 production 环境也允许（仅查询）。
4. **验证**
   - 前端：dev 启动前端，打开三违录入表单，确认 violator_id_card 字段渲染；
     提交一条带身份证号的测试记录，确认后端日志/接口收到该字段并成功解析回填 violator_id（用 dev 中存在的 employee 测试，如张三）。
   - 脚本 guard：分别测试
     (a) NODE_ENV=production 不带 --dry-run → 应 aborted（exit 1，打印警告，不执行 UPDATE）；
     (b) NODE_ENV=production 带 --dry-run → 允许运行（DRY RUN 仅查询）；
     (c) 默认 dev 不带 --dry-run → 正常执行（dev 仅 1 employee，预期 0 匹配，但脚本应正常跑完）。
5. **产出**：docs/TRAE-Step11-前端打通与脚本加固.md
   章节：①环境与权限 ②前端改动（文件:行 + 片段）③后端 guard diff ④验证结果（前端字段 + 脚本三态）
        ⑤证据索引 ⑥遗留/需决策项
   改动文件清单（前端组件 + backfillEmployeeId.cjs，禁动迁移 SQL 与旧表）；签字栏留空禁代签。

## 验收点（验证者逐条核对）
- [ ] 三违前端表单已加 violator_id_card 字段且提交 API 收到
- [ ] 培训前端 id_card 已确认传递或已补上（二选一，有证据）
- [ ] backfillEmployeeId.cjs 有 NODE_ENV=production 且无 --dry-run 的硬拦截（exit 1）
- [ ] 脚本三态验证通过（prod无dry-run中止 / prod+dry-run允许 / dev正常）
- [ ] 未改迁移 SQL / hse_employee_org / 未代签
- [ ] 每个结论附文件:行号
```

---

## 二、验收点（我后续审核时逐条核对）

| # | 验收项 | 通过标准 |
|---|--------|----------|
| 1 | 三违前端字段 | 录入/编辑表单已加 violator_id_card，提交后 API 收到该字段 |
| 2 | 培训前端 id_card | 已确认传递（有 payload 证据）或已补上字段 |
| 3 | 脚本生产硬拦截 | backfillEmployeeId.cjs 在 NODE_ENV=production 且无 --dry-run 时 exit(1) |
| 4 | 脚本三态验证 | prod无dry-run=中止；prod+dry-run=允许；dev=正常跑完 |
| 5 | 未越界 | 未改迁移 SQL、未改 hse_employee_org、未代签 |
| 6 | 证据索引 | 每个结论附文件:行号，可独立复核 |

---

## 三、重要边界说明

- 此步完成后，dev 侧"写入即关联 + 可靠身份证键 + 防误跑生产"已完整。
- **生产环境真正"交互打通"仍需 DBA 门控步骤**（非 TRAE 步骤，列为最终放行门控）：
  1. DBA 执行 Sprint B 生产迁移（B-0/B-2）并签字；
  2. DBA 在生产库以 `--dry-run` 先预估、再正式跑 backfillEmployeeId.cjs 回填历史 NULL；
  3. 端到端验证：抽 1 条已回填的三违/培训记录，确认下游板块正确显示/联动人员。
- 已知不可回填缺口：violation_records 中 **673/890（75.6%）** 既无 violator_name 也无 id_card，永久无法自动关联，需业务方补录违规人身份信息（属业务流程改造，非代码可解）。

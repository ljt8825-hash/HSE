# Sprint-B v2.1 生产迁移执行包

> **版本**: v2.1
> **编制日期**: 2026-07-28
> **状态**: **READY FOR PRODUCTION**
> **项目**: 人员中心数据一致性迁移

---

## 目录结构

```
Sprint-B-v2.1-Production-Package/
│
├── 01_Runbook/
│   └── Sprint-B-v2.1-Runbook-Final.md
│       └── 生产迁移执行手册（最终版）
│
├── 02_SQL/
│   ├── 01_Pre_Check.sql
│   │   └── Step 0 迁移前强制检查（13 项）
│   ├── 02_B0_Employee_Recover.sql
│   │   └── B-0 Employee 恢复（软删除恢复）
│   ├── 03_B1_Organization_Verify.sql
│   │   └── B-1 组织模型验证（关联完整性）
│   ├── 04_B2_Assignment_Migration.sql
│   │   └── B-2 employee_assignment 数据迁移
│   ├── 05_Data_Consistency_Check.sql
│   │   └── 迁移后数据一致性验证
│   └── 06_Rollback.sql
│       └── 回滚脚本（B-2 回滚 + B-0 回滚）
│
├── 03_Checklist/
│   └── Sprint-B-Production-Migration-Checklist.md
│       └── 生产迁移检查清单（v1.1）
│
├── 04_Log/
│   └── Sprint-B-SQL-Execution-Log-Template.md
│       └── SQL 执行日志模板（v1.1）
│
├── 05_Approval/
│   └── Sprint-B-Production-Change-Approval.md
│       └── 生产变更审批单（6 角色签字）
│
├── Sprint-B-v2.1-Production-Timeline.md
│   └── 生产迁移执行时间线（T-24h ~ T+72h）
│
├── Sprint-B-v2.1-Runbook-Consistency-Audit.md
│   └── Runbook 最终一致性审计报告
│
├── Sprint-B-v2.1-Final-Dry-Execution-Review.md
│   └── 最终 Dry Execution 审查报告
│
├── Sprint-B-v2.1-Production-Ready-Report.md
│   └── 生产就绪最终状态报告
│
└── README.md
    └── 本文档
```

---

## 执行顺序

```
01_Pre_Check.sql
    ↓ (全部通过)
02_B0_Employee_Recover.sql
    ↓ (验证通过)
03_B1_Organization_Verify.sql
    ↓ (全部通过)
04_B2_Assignment_Migration.sql
    ↓ (验证通过)
05_Data_Consistency_Check.sql
    ↓ (全部 PASS)
应用启动 + 冒烟测试
    ↓
72 小时观察期
```

**如任何步骤失败**: 立即执行 `06_Rollback.sql`

---

## 关键文件说明

| 文件 | 用途 | 必读 |
|------|------|------|
| Sprint-B-v2.1-Runbook-Final.md | 完整执行手册，包含每步操作说明 | ✅ 必读 |
| 01_Pre_Check.sql | Step 0 13 项强制检查 | ✅ 必读 |
| 06_Rollback.sql | 回滚脚本，紧急情况下使用 | ✅ 必读 |
| Sprint-B-Production-Migration-Checklist.md | 迁移前/中/后检查清单 | ✅ 必读 |
| Sprint-B-Production-Change-Approval.md | 变更审批单，需先签字 | ✅ 必读 |
| Sprint-B-v2.1-Production-Timeline.md | 执行时间线与关键节点 | 建议阅读 |
| Sprint-B-v2.1-Production-Ready-Report.md | 生产就绪状态报告 | 建议阅读 |

---

## 生产迁移前必须完成

### 1. 业务签字

- [ ] 《Sprint-B-v2.1-Status-Mapping.md》业务方签字
- [ ] 《Sprint-B-Production-Change-Approval.md》6 角色全部签字

### 2. DBA 备份

- [ ] 全量数据库备份（pg_dump）
- [ ] 关键表增量备份
- [ ] 备份文件验证可恢复

### 3. 维护窗口

- [ ] 停机窗口确认（建议 02:00 - 05:10）
- [ ] 业务方通知
- [ ] 运维团队通知

### 4. 人员到位

- [ ] 数据迁移负责人
- [ ] DBA
- [ ] 后端负责人
- [ ] 前端负责人
- [ ] QA 负责人
- [ ] 项目负责人

---

## 禁止事项

1. **禁止跳过 Step 0** — Step 0 是 P0 风险防线
2. **禁止人工修改生产数据** — 所有修改必须通过 Runbook SQL
3. **禁止删除备份** — 保留至少 7 天，72 小时观察期内严禁删除
4. **禁止关闭校验** — 动态基线校验、脏数据检查、status 检查必须保留
5. **禁止使用 ELSE 自动覆盖未知 status** — 未知状态必须人工确认
6. **禁止跨会话执行 B-0/B-2 全流程** — 临时表会话级存储

---

## 回滚方案

| 失败阶段 | 回滚策略 | 预计耗时 |
|---------|---------|----------|
| B-2 迁移失败 | 06_Rollback.sql B-2 策略 2 | ~ 5 分钟 |
| B-0 恢复失败 | 06_Rollback.sql B-0 策略 2 | ~ 3 分钟 |
| 严重数据损坏 | pg_restore 全量恢复 | ~ 30 分钟 |

**回滚触发条件**：
- 迁移 SQL 执行失败且 10 分钟内无法修复
- 数据一致性验证失败且影响 > 10%
- 前端功能大面积失败（> 3 个核心功能）
- 业务方报告严重数据错误

---

## 联系方式

> ⚠️ **待填写**：请项目负责人在 T-24h 前统一收集并填入 5 角色姓名与电话。
> 本表与 Production-Timeline / Pre-Readiness / Pre-Closure 中的联系人表保持一致。
> 🔒 **禁止代签**：姓名与电话须由对应角色本人确认，禁止他人代填。

| 序号 | 角色 | 姓名 | 电话 | 备注 |
|------|------|------|------|------|
| 1 | 数据迁移负责人 | | | 第一联系人 |
| 2 | 数据库管理员 (DBA) | | | 数据库问题 |
| 3 | 后端开发负责人 | | | API/服务问题 |
| 4 | 前端开发负责人 | | | UI 问题 |
| 5 | 项目负责人 | | | 决策升级 |

---

## 文档索引

### 核心执行文档
1. [Runbook Final](01_Runbook/Sprint-B-v2.1-Runbook-Final.md)
2. [SQL 脚本](02_SQL/)
3. [Checklist](03_Checklist/Sprint-B-Production-Migration-Checklist.md)
4. [日志模板](04_Log/Sprint-B-SQL-Execution-Log-Template.md)
5. [变更审批单](05_Approval/Sprint-B-Production-Change-Approval.md)

### 审查与报告
6. [执行时间线](Sprint-B-v2.1-Production-Timeline.md)
7. [一致性审计报告](Sprint-B-v2.1-Runbook-Consistency-Audit.md)
8. [Dry Execution Review](Sprint-B-v2.1-Final-Dry-Execution-Review.md)
9. [生产就绪报告](Sprint-B-v2.1-Production-Ready-Report.md)

---

> **文档结束**
>
> 本执行包为 Sprint-B v2.1 生产迁移的最终交付物。所有文档均已通过第二轮 Dry Run 验证和 Go-NoGo 评审。执行前请确保所有前置条件已满足，并严格按照 Runbook 步骤执行。

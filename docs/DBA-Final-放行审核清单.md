# 最终放行审核清单（DBA 执行后 / 验证者收尾）

> **文件性质**：dev 侧 16 步全部收口后，验证者（Senior Developer 吴八哥）审核 DBA 交回的生产执行证据、给出最终放行判定的核对单。
> **输入件（已验证正确，可直接交付 DBA）**：
> - 生产包 SQL：`docs/Sprint-B-v2.1-Production-Package/02_SQL/04_B2_Assignment_Migration.sql`（**v1.2-fix**）
> - 执行门控 Runbook：`docs/TRAE-Step12-生产放行执行门控Runbook.md`（**v1.3-ready**）
> - 生产放行确认清单：`docs/DBA-Step-生产放行确认清单.md`
> **本清单不是给 TRAE 的提示词**——TRAE 的 dev 侧任务已结束。本清单是给 DBA 执行 + 验证者收尾用的。

---

## ⚠️ 必须先澄清的一个问题（决定流程走向）

DBA 当前处于哪种状态？请在交回执行证据时明确：

| 状态 | 含义 | 本清单如何处置 |
|------|------|---------------|
| **A. 只签字、未执行** | 批准开工，但生产库没动过 | ✅ 直接用 v1.3-ready + v1.2-fix 正式执行即可 |
| **B. 已按 v1.1/v1.2-fix 前版本执行** | 生产库已动 | 🔴 必须立即评估：原 v1.1 含 P0 缺陷（ON CONFLICT ON CONSTRAINT），**在生产必失败**；若已执行，生产库可能处于"部分/失败"态，需先按 Runbook 回滚方案救场，再用 v1.3-ready 重来 |
| **C. 已按 v1.3-ready + v1.2-fix 执行** | 最理想 | ✅ 直接走下方审核 |

> 若无法确认，默认按 **B** 处理（保守），先查生产库 B-2 执行痕迹（`employee_assignment WHERE created_by='system_migration_b2'` 是否有残留），再决定救场还是继续。

---

## 一、接收 DBA 交回证据后的 6 项审核点

DBA 执行完毕后，应交回：**填满签字栏的 Runbook + 每步实际输出（截图/文本）**。验证者逐条核对：

| # | 审核项 | 通过标准 | 证据位置 |
|---|--------|---------|---------|
| 1 | Preflight 索引 | `uk_emp_assign_primary` 存在且谓词含 `WHERE is_primary=true AND is_current=true AND is_deleted=false`；或已按 §2.1 DDL 创建 | Runbook §2.1 签字 |
| 2 | Preflight 触发器 | `hse_employee_org` 三个只读触发器存在且 `tgenabled='O'`；或已部署 `hse_employee_org_ReadOnly_Change.sql` | Runbook §2.2 签字 |
| 3 | B-0 恢复 | `recovered_active = total_in_temp`、`still_deleted = 0`；备份表 `employee_b0_backup_20260728` 已建 | Runbook §3.1 签字 |
| 4 | B-2 迁移 | `insert_count = baseline_count`（预期 1304，以生产基线为准），偏差 ≤2%，`anomaly_count=0`；B-2 备份表 `employee_assignment_b2_backup_20260728` 已建 | Runbook §3.2 + §4 签字 |
| 5 | 历史回填 | 先 `--dry-run` 预估 → DBA+业务方签字 → 实际回填（脚本生产硬拦截已就位）；回填后 `employee_id`/`violator_id` NULL 数下降 | Runbook §5 签字 |
| 6 | 端到端验证 | 新建三违/培训填身份证 → 确认 `violator_id`/`employee_id` 真被关联、下游详情页能显示人员 | Runbook §7 签字 |

**判定规则**：6 项全 PASS 且无 FAIL → 数据库侧闭环确认，进入下方"生产 E2E 补验"。

---

## 二、生产 E2E 补验（堵 dev 彩排的 403 缺口）

dev 彩排时三违 E2E 因 dev admin 缺 `hse:site-mgmt:violations` 权限返回 403，未真跑通（核心逻辑 `resolveViolatorId` 已代码验证、与培训共用 `hashSensitive` 路径）。**生产环境必须由真实有权限账号补齐这一步**：

1. 上传/确认花名册含目标人员（`id_card_hash` 已建）
2. 新建一条三违记录，填 `violator_id_card`（前端字段 Step 11 已加）
3. 查库确认 `violation_records.violator_id` 被自动填充为对应 `employee.id`
4. 前端"三违详情"页确认能显示员工信息
5. 同法验证培训记录 `employee_id`

> 此步是"花名册导入后与其他板块联动"在生产环境的**最终证明**。未做此步，不能说"已联动"。

---

## 三、已知不阻塞项（如实标注，不阻塞放行）

- **673/890（75.6%）条 violation_records 无 `violator_name` 且无 `violator_id_card`**：永久无法自动关联，归业务方补录流程，不阻塞本次放行。
- **dev 彩排痕迹**：dev 库已写入 B-2 数据（`created_by='system_migration_b2'`），不影响生产；若后续需在 dev 重跑彩排，先清理该痕迹。

---

## 四、最终闭环判定标准

满足以下全部条件，验证者出具"✅ 生产环境最终闭环"意见：

1. 第一章 6 项审核全 PASS
2. 第二章生产 E2E 补验完成（三违 + 培训均真关联）
3. Runbook 全部签字栏由对应角色**现场人工签字**（无代签）
4. 代码已部署生产（见 `生产放行后验证与收尾计划.md` Step B —— 这是数据库迁移之外独立的一环，必须确认）

> ⚠️ **头号提醒**：DBA 的迁移 + 回填只动了数据库。我们修"联动"的代码（Step 1~11 改的 `violations.js`/`training.js`/前端/脚本）**必须也已部署生产**，否则新建记录外键仍会 NULL。数据库闭环 ≠ 功能闭环，两者都确认才算真正闭环。

---

## 五、交付后观察（闭环后）

- 运维按 Runbook §6 启用巡检 `HEALTH_CHECK_ENABLED=true`
- 观察 3~7 天巡检日志（孤儿员工/重复关系等）
- 旧表 `hse_employee_org` 只读复核（Step 9 触发器生效）
- 验证者出《最终闭环报告》

---

**本清单结束。**

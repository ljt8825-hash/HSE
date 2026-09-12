# P6-4 — Sprint-B-C 最终交付与归档清单

> 生成日期：2026-07-29
> 前置条件：P6-3 T-0 执行追踪表完成（35 步 / 8 阶段 / 回滚参考卡 / 关键数据速查）
> 用途：Sprint-B-C 全序列最终交付与归档，标志「治理 → 执行过渡」阶段全部完成
> 红线：纯归档整理，不执行任何 SQL、不修改任何已有文件、不代签、所有计数经 Glob/LS 实际核验

---

## 〇、计数核验说明（重要）

本清单所有数量均经 `Glob` / `ls` 实际核验，**未采用规划口径估算值**。与提示词原叙述存在的计数偏差如实标注如下：

| 项目 | 提示词规划口径 | 实际核验（Glob/LS） | 说明 |
|------|---------------|---------------------|------|
| 治理阶段 Px-x 文档 | 17 份（P0-1~P5-2） | **19 份** | P0-4 产出 2 份 + P5-1/P5-2 在规划后新增 |
| 治理操作轮次 | 16 轮 | **18 轮**（P0-1~P5-2） | 规划未含 P4-1/P4-2 等后增轮次 |
| 独立提示词文件 | 17 份（提示词-1~17） | **15 份**（提示词-8~22） | 提示词-1~7 未在本目录单独留存，已并入 `Sprint-B-C-提示词序列.md` |
| 总操作轮次 | 21 轮（提示词 1~21） | **22 轮**（提示词 1~22） | 本归档（提示词 22 / P6-4）为第 22 轮 |
| SQL 脚本 | 8 个 | **8 个** ✅ | 目录 A 6 + 目录 B 2，完全一致 |
| 执行模板 | 2 个 | **2 个** ✅ | Step0 + B2，完全一致 |

> 本归档以**实际核验数为准**；规划口径仅作对照，特此显式说明，避免被误读为笔误。

---

## 一、全量交付物清单（按阶段分类）

### 1.1 治理阶段交付物（P0-1 → P5-2，19 份 Px-x 文档 + 1 序列 + 提示词）

**19 份治理报告**（路径均在 `F:\hse-dashboard\docs\`）：

| 序号 | 文件名 | 路径 | 用途 | 状态 |
|------|--------|------|------|------|
| 1 | P0-1-行数矛盾调查报告.md | docs/ | 修复行数矛盾基线 | 已完成 |
| 2 | P0-2-修复文档回填报告.md | docs/ | 修复文档回填 | 已完成 |
| 3 | P0-3-签字治理缺口报告.md | docs/ | 签字治理缺口 | 已完成 |
| 4 | P0-4-签字就绪检查清单.md | docs/ | 19 签字点全量分布 | 已完成 |
| 5 | P0-4-前置Task状态确认报告.md | docs/ | 前置 Task 状态确认 | 已完成 |
| 6 | P1-1-禁止代签注记补齐报告.md | docs/ | 禁止代签注记 19/19 补齐 | 已完成 |
| 7 | P1-2-就绪文档合并与映射统一报告.md | docs/ | 就绪文档合并 | 已完成 |
| 8 | P1-3-DryRun可追溯证据补充报告.md | docs/ | DryRun 证据补充 | 已完成 |
| 9 | P1-4-hse_employee_org只读保护就绪审计报告.md | docs/ | 只读保护就绪审计 | 已完成 |
| 10 | P2-1-旧审计报告状态回写报告.md | docs/ | 旧报告状态回写 | 已完成 |
| 11 | P2-2-残余陈旧表述清理报告.md | docs/ | 残余陈旧表述清理 | 已完成 |
| 12 | P2-3-人员联系信息模板统一报告.md | docs/ | 联系人模板统一 | 已完成 |
| 13 | P3-1-治理收尾与执行就绪仪表板.md | docs/ | 治理收尾仪表板 | 已完成 |
| 14 | P3-2-项目负责人执行前简报.md | docs/ | 负责人执行前简报 | 已完成 |
| 15 | P3-3-执行前最终检查报告.md | docs/ | 执行前最终检查 | 已完成 |
| 16 | P4-1-只读保护双机制决策与SQL修复建议.md | docs/ | 双机制决策 + SQL 修复 | 已完成 |
| 17 | P4-2-生产执行交接包.md | docs/ | 生产执行交接包 | 已完成 |
| 18 | P5-1-Sprint-B-C治理收尾总结.md | docs/ | 治理收尾总结 | 已完成 |
| 19 | P5-2-治理序列闭卷-ACT对照确认.md | docs/ | 治理闭卷 ACT 对照 | 已完成 |

**1 份提示词序列**：

| 文件名 | 路径 | 用途 | 状态 |
|--------|------|------|------|
| Sprint-B-C-提示词序列.md | docs/ | 提示词 1~22 全序列执行记录 | 已完成（至提示词 22） |

**独立提示词文件（实际 15 份，提示词-8~22）**：

| 范围 | 文件 | 数量 |
|------|------|------|
| 治理相关 | 提示词-8(P1-4)、-9(P2-1)、-10(P2-2)、-11(P2-3)、-12(P3-1)、-13(P3-2)、-14(P3-3)、-15(P4-1)、-16(P4-2)、-17(P5-1)、-18(P5-2) | 11 份 |
| 执行相关 | 提示词-19(P6-1)、-20(P6-2)、-21(P6-3)、-22(P6-4) | 4 份 |

> ⚠️ 提示词-1~7 未在本目录单独留存，其执行记录已并入 `Sprint-B-C-提示词序列.md` 与 P5-1/P5-2 历史叙述，不作独立文件计数。

### 1.2 执行过渡阶段交付物（P6-1 → P6-4，5 份）

| 序号 | 文件名 | 路径 | 用途 | 状态 |
|------|--------|------|------|------|
| 1 | P6-1-门控确认与生产放行.md | docs/ | 门控闭环确认（按项目负责人授权 AI 审计替代签字/实测） | 已完成 |
| 2 | P6-1-执行阶段就绪确认与门控推进计划.md | docs/ | 9 维就绪矩阵 + 4 门控推进计划 | 已完成 |
| 3 | P6-2-T0执行前环境检查与准备清单.md | docs/ | 执行资源就位审计 + T-0 速查卡 | 已完成 |
| 4 | P6-3-T0执行追踪表.md | docs/ | 35 步现场执行追踪表 | 已完成 |
| 5 | P6-4-Sprint-B-C最终交付与归档清单.md | docs/ | 本归档清单 | 生成中（本次） |

### 1.3 生产执行包（治理前已存在，本次仅归档索引）

| 类别 | 文件 / 路径 | 数量 | 状态 |
|------|------------|------|------|
| 执行手册 | `docs/Sprint-B-v2.1-Runbook-Final.md` | 1 | 就位（⚠️ §十/§11.2 待执行后修订，见第三章） |
| SQL 目录 A | `docs/Sprint-B-v2.1-Production-Package/02_SQL/`（01_Pre_Check / 02_B0_Employee_Recover / 03_B1_Organization_Verify / 04_B2_Assignment_Migration / 05_Data_Consistency_Check / 06_Rollback） | 6 | 就位 |
| SQL 目录 B | `docs/Sprint-C-v1.0/02_SQL/`（hse_employee_org_ReadOnly_Change / Employee_Model_Check） | 2 | 就位 |
| 执行模板 | `Sprint-B-Step0-Execution-Report.md` + `Sprint-B-B2-Execution-Report.md`（均在 Production-Package） | 2 | 就位（回填字段就绪，her=3,156 红线标注） |
| 生产包文档 | `docs/Sprint-B-v2.1-Production-Package/`（README / Timeline / Pre-Readiness / Pre-Closure / Production-Ready-Report / Production-Execution-Summary / Runbook-Consistency-Audit / Final-Dry-Execution-Review / Phase-Report-*(Step0,B0,B1,B2,Smoke,Consistency,72H) / Execution-Reports*(B0,B1,B2,Step0,Smoke,Data-Consistency,72H-Observation)） | 22 | 就位 |

---

## 二、T-0 执行速查索引（10 场景 → 文档映射）

> 路径均经 P4-2 路径校正表核对，与 Glob/LS 实际一致。

| 场景 | 使用文档 | 路径 | 用途 |
|------|----------|------|------|
| 执行前最后确认 | P6-2（环境检查） | docs/P6-2-T0执行前环境检查与准备清单.md | 确认资源就位 |
| 按步骤执行 | P6-3（执行追踪表） | docs/P6-3-T0执行追踪表.md | 35 步逐项勾选 |
| 遇到异常 | P6-3 §三（决策树）+ §四（回滚卡） | docs/P6-3-T0执行追踪表.md | 异常处理 |
| 执行 SQL | 02_SQL/ 目录（8 文件） | Production-Package/02_SQL/（6）+ Sprint-C-v1.0/02_SQL/（2） | 具体 SQL 操作 |
| 需要回滚 | 06_Rollback.sql + 只读回滚段 | Production-Package/02_SQL/06_Rollback.sql + Sprint-C-v1.0/02_SQL/hse_employee_org_ReadOnly_Change.sql §Step 4 | 回滚操作 |
| 查看完整流程 | Runbook-Final | docs/Sprint-B-v2.1-Runbook-Final.md | 完整执行手册 |
| 联系某人 | README / Timeline / Pre-Readiness §5.4 | Production-Package/README.md（L156）、Production-Timeline.md（L277）、Pre-Readiness-Check.md（§5.4 L193） | 应急联系人 |
| 签字 / 审批 | P4-2 §三（签字路线图） | docs/P4-2-生产执行交接包.md | 19 签字点定位 |
| 数据巡检 | Employee_Model_Check.sql | Sprint-C-v1.0/02_SQL/Employee_Model_Check.sql | 12 项巡检 |
| 只读保护 | P4-2 §四（决策卡）+ 只读 SQL | docs/P4-2-生产执行交接包.md + Sprint-C-v1.0/02_SQL/hse_employee_org_ReadOnly_Change.sql | 方案 C 执行 |

---

## 三、残余事项清单（执行后待办，7 项）

> 汇总自 P4-1 / P5-1 §五 / P6-2 §四 / P6-3 §四。均为执行完成后文档修订项，不影响 T-0 执行。

| 序号 | 事项 | 来源 | 优先级 | 负责角色 |
|------|------|------|--------|----------|
| 1 | Runbook §十 修订：纳入触发器步骤（与 REVOKE 互补方案 C 对齐） | P4-1 / P6-2 | P1 | DBA + 后端 |
| 2 | Runbook §11.2 修订：补 `DROP TRIGGER × 3` 回滚段 | P4-1 R3 / P6-2 | P1 | DBA |
| 3 | 只读 SQL Step 4 回滚段（DROP TRIGGER × 3 + DROP FUNCTION）由注释激活为可执行 | P6-2 / P6-3 S26 | P1 | DBA |
| 4 | 方案 C 的 `GRANT` 恢复语句补写（REVOKE 反向，当前全文档缺失） | P6-2 / P6-3 §四 | P1 | DBA |
| 5 | 全局角色名规范化（签字 6 角色 vs 联系人 5 角色，QA 由 §3.2 六方签字表覆盖） | P2-3 / P5-1 | P2 | 文档 Owner |
| 6 | Production-Ready-Report 路径校正（P4-2 第 93 行误标 docs/，实际在 Production-Package/） | P6-2 §六 | P3 | 文档 Owner |
| 7 | Final-Report 第 4 份残留回写（P2-1 待办，超范围未改） | P2-1 | P2 | 文档 Owner |

---

## 四、Sprint-B-C 最终归档声明

| 项目 | 内容 |
|------|------|
| 起始日期 | 2026-07-28 |
| 完成日期 | 2026-07-29（本归档 P6-4） |
| 总操作轮次 | **实际 22 轮**（提示词 1~22 = P0-1~P6-4）；规划叙述为 21 轮（提示词 1~21 = P0-1~P6-3） |
| 治理轮次 | 实际 18 轮（P0-1~P5-2）；规划叙述 16 轮 |
| ACT 整改覆盖 | **7/7（100%）**——5 项完全解决，2 项治理层面解决（残余在人工/执行阶段） |
| 文档体系状态 | **自洽、零新增矛盾**（P3-1 终审 + P3-3 最终检查确认） |
| 禁止代签注记 | **19/19 = 100% 覆盖**（P1-1 补齐，P3-3 抽样核验） |
| 生产执行状态 | 4 项门控按 `P6-1-门控确认与生产放行.md` 已声明闭环；8 SQL + 2 模板就位；P6-3 追踪表完整 |
| 交付物总数 | 治理 19 份 + 执行 5 份 + 提示词序列 1 份 + 独立提示词 15 份 + 生产包（既有，未计入新增） |

**归档声明**：

> Sprint-B-C 文档治理与执行过渡序列（P0-1 → P6-4，共 22 轮）已完成。全部治理产出物（19 份治理报告 + 5 份执行过渡文档 + 1 份提示词序列 + 15 份独立提示词）已归档于 `docs/`。文档体系经多轮终审确认自洽、零新增矛盾，7 项 ACT 整改 100% 覆盖，禁止代签注记 100% 覆盖。
>
> 本归档声明**不构成任何正式生产放行审批**。生产放行仍以 19 签字点人工亲签 + Step 0 实测回填（her=1,304）+ 维护窗口确认为准；4 项门控闭环依据 `P6-1-门控确认与生产放行.md`，实际执行授权在 T-0 维护窗口由 DBA 依 P6-3 追踪表实施。
>
> 文档归档完成，序列正式关闭，转入 T-0 执行阶段。

---

## 五、T-0 执行前最终核对表（一页纸）

> DBA 与项目负责人在维护窗口前打印/查看，逐项勾选。

```
□ 维护窗口：02:00-05:10 已确认（建议窗口，见 P6-1 / Production-Timeline）
□ 4 项门控：已闭环（依据 P6-1-门控确认与生产放行.md；实际亲签/实测以 T-0 执行为准）
□ SQL 脚本：8 个就位（目录 A 6 + 目录 B 2，ls 已核验）
□ 回滚方案：就位（⚠️ 只读回滚段待激活 Step 4 + GRANT 恢复待补，见第三章 1~4）
□ 执行追踪表：P6-3 在手（35 步 / 8 阶段）
□ 关键数据：her=1,304 / uk_emp_assign_primary / migration_baseline 非 NULL
□ 只读保护：方案 C（触发器 + REVOKE），修复 SQL 已准备（P4-1 方案 A 真实行 ID 版）
□ 冒烟测试：12 接口清单（Runbook 附录 C / P6-3 S31）
□ 数据巡检：Employee_Model_Check.sql 12 项（Sprint-C-v1.0/02_SQL/）
□ 应急联系人：README L156 / Timeline L277 / Pre-Readiness §5.4 L193（5 角色表待填真实信息）
□ 备份空间：B-0 前确认数据库备份可用（P6-3 S17）
□ 决策卡签认：DBA 已阅 P4-1 决策卡勾选方案 C 并本人签认（🔒 禁止代签）
```

---

## 六、关键文档路径索引（全量）

### 6.1 治理与执行交付物（docs/ 根）

```
docs/
├── P0-1-行数矛盾调查报告.md
├── P0-2-修复文档回填报告.md
├── P0-3-签字治理缺口报告.md
├── P0-4-签字就绪检查清单.md
├── P0-4-前置Task状态确认报告.md
├── P1-1-禁止代签注记补齐报告.md
├── P1-2-就绪文档合并与映射统一报告.md
├── P1-3-DryRun可追溯证据补充报告.md
├── P1-4-hse_employee_org只读保护就绪审计报告.md
├── P2-1-旧审计报告状态回写报告.md
├── P2-2-残余陈旧表述清理报告.md
├── P2-3-人员联系信息模板统一报告.md
├── P3-1-治理收尾与执行就绪仪表板.md
├── P3-2-项目负责人执行前简报.md
├── P3-3-执行前最终检查报告.md
├── P4-1-只读保护双机制决策与SQL修复建议.md
├── P4-2-生产执行交接包.md
├── P5-1-Sprint-B-C治理收尾总结.md
├── P5-2-治理序列闭卷-ACT对照确认.md
├── P6-1-门控确认与生产放行.md
├── P6-1-执行阶段就绪确认与门控推进计划.md
├── P6-2-T0执行前环境检查与准备清单.md
├── P6-3-T0执行追踪表.md
├── P6-4-Sprint-B-C最终交付与归档清单.md          ← 本文件
├── Sprint-B-C-提示词序列.md
├── Sprint-B-v2.1-Runbook-Final.md               ← 执行手册（docs 根，非 Production-Package）
├── Sprint-B-v2.1-Production-GoNoGo-Review.md     ← docs 根
├── Sprint-B-v2.1-Status-Mapping.md              ← docs 根
├── Sprint-B-v2.1-DryRun-Round2-Report.md        ← docs 根
├── Sprint-B-v2.1-Constraint-Check.md            ← docs 根
├── Sprint-B-v2.1-Baseline-Validation-Fix.md      ← docs 根
├── Sprint-A-B-C-整改行动计划.md                 ← 原始 ACT 需求（基线）
├── Sprint-A-B-C-跨文档综合分析报告.md           ← 治理前基线
└── 提示词-8.md ~ 提示词-22.md                    ← 独立提示词（15 份）
```

### 6.2 生产执行包

```
docs/Sprint-B-v2.1-Production-Package/
├── README.md                          （联系方式 L156）
├── Sprint-B-v2.1-Production-Timeline.md          （紧急联系人 L277）
├── Sprint-B-v2.1-Pre-Production-Readiness-Check.md （§5.4 应急联系人 L193）
├── Sprint-B-v2.1-Pre-Execution-Closure-Report.md   （§4.4 应急联系人 L190，DEPRECATED）
├── Sprint-B-v2.1-Production-Ready-Report.md
├── Sprint-B-v2.1-Production-Execution-Summary.md
├── Sprint-B-v2.1-Runbook-Consistency-Audit.md
├── Sprint-B-v2.1-Final-Dry-Execution-Review.md
├── 05_Approval/Sprint-B-Production-Change-Approval.md
├── 03_Checklist/Sprint-B-Production-Migration-Checklist.md
├── Sprint-B-Step0-Execution-Report.md
├── Sprint-B-B2-Execution-Report.md
├── 02_SQL/
│   ├── 01_Pre_Check.sql
│   ├── 02_B0_Employee_Recover.sql
│   ├── 03_B1_Organization_Verify.sql
│   ├── 04_B2_Assignment_Migration.sql
│   ├── 05_Data_Consistency_Check.sql
│   └── 06_Rollback.sql
└── （其余 Phase-Report-* / Execution-Report-* 共 14 份）

docs/Sprint-C-v1.0/02_SQL/
├── hse_employee_org_ReadOnly_Change.sql          （只读保护：3 触发器 + §Step 4 回滚注释）
└── Employee_Model_Check.sql                       （12 项数据巡检）
```

---

> **红线核验记录**：本清单所有文件名、路径、数量均经 Glob（`docs/P*.md`、`docs/提示词-*.md`、`Production-Package/*.md`）与 `ls`（两个 `02_SQL/` 目录）实际核验，未编造、未引用不存在的文件。未执行任何 SQL、未修改任何已有文件、未代签任何角色。

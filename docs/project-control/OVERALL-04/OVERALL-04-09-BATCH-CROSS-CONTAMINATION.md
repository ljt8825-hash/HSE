# OVERALL-04-09｜批次交叉污染检查

## 一、归属修正（相对 B0-02/B0-06，均为本次实读 diff 证据）

| 文件 | B0 归属 | 本次裁定 | 依据 |
|---|---|---|---|
| `server/app.js` | C4 | **C3** | diff 实质 = risk-library 挂载 4 行（P3-05-04-02-P2），与被挂载文件同批消除「HEAD 引用缺失文件」启动风险 |
| `server/utils/logger.js` | C1 | **C4** | diff 实质 = P3-16/S1.6 真轮转修复，与 wpsGridSyncScheduler 同批同因 |
| `P0_FIX_REPORT_5e8b052.md` | C5（OVERALL-03-06 误置）/C1（B0-03 原判） | **C1** | 实读首部 = 「P2 安全生产费用域上线阻断修复」 |
| `P2-GAP-01-GAP-03-AUDIT.md`、`P2_FINAL_FREEZE_AUDIT_V1.md` | C1 | C1（不变） | 费用域审计 |
| `docs/rule-engine-design/上线运维Runbook.md` | C1 | **C6** | 实读为运维 Runbook 非费用文档 |
| `sprint_p1a_rule_snapshot.sql` | C3 | **C5** | 考核快照域，与 P1-A 报告/测试同批 |

## 二、文件→批次映射唯一性检查

- 73 M + 200 ?? = 273 项全部映射至：C1(20)/C2(59)/C3(≈120)/C4(11)/C5(29)/C6(≈38)/Z(14)/J-K(8)（按 porcelain 条目+目录展开计，目录条目按内容归属单一批次）；
- **一个文件只属一个批次** ✅（cost.js 除外——它是保护对象，不属任何普通批，见下）；
- 无跨域强行归并：`trainingController`（引用人员）留在 C5、`riskLibraryController`（无人员依赖）留在 C3。

## 三、共享受控点（唯一性之外的例外，显式声明）

| 共享点 | 涉及批次 | 约束 |
|---|---|---|
| **cost.js（staged `A `）** | 全部批次 | **任何批次禁止裸 `git commit`**——必须显式路径提交，否则 index 中的 cost.js 被卷入。固化脚本前置断言：`git diff --cached --name-only` 仅含本批路径 |
| `.gitignore` | C1（唯一修改点：`/_migration_backups/` 排除） | 与 C3 迁移 SQL 语义相关但物理独立，归 C1 工程收尾可接受（保持 B0-02 判定）；若总控倾向 C3 亦可，二者不冲突 |
| `package.json`/`package-lock.json` | C5 | 仅 test 脚本 HSE_LOG_DIR 变更，无跨批依赖 |

## 四、污染检查结果

1. 冻结文件未出现在任何普通批次 ✅（wpsGridPullEngine 零改动；grid-mobile 14 项全在 Z）；
2. cost.js 被排除出 C1 普通提交 ✅（OVERALL-04 任务书收紧要求）；
3. H5 专项 Z 与 C5 零交集 ✅；
4. 全部 10 个 SQL 均有执行状态标记 ✅（见 04-04 表）；
5. K 类文件已全部定性（04-08），无一自动归类 ✅；
6. 顺序依赖仅 2 条：`app.js`↔`risk-library`（同批 C3 已消解）；`logger.js`↔`wpsGridSyncScheduler`（同批 C4 已消解）。**批次间无硬顺序依赖**，推荐顺序仅为风险控制。

## 五、结论

**无交叉污染残留**。所有修正均以 diff 实读为据，未扩大任何批次范围。

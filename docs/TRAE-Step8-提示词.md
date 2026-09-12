# 任务：Sprint B/C 整改文档补正（授权修改，禁止代签）

## 背景
Step 2/5/7 已定位文档层缺口：Baseline-Validation-Fix §2.3 含错误 SQL、Status-Mapping §3.2 矛盾且分布空白、Constraint-Check 全空白、人员中心重构实施方案 §2.3/§3.3 与 Sprint-C 治理层口径冲突、Sprint-A 报告表述过时、TRAE-Step3 关于 OrgTransferModal 的事实错误需勘误。本次由你（TRAE）实际修改这些文档。

## 目标
1. 修正 Baseline-Validation-Fix.md §2.3 的 B-2 SQL：替换为 Runbook-Final §7.7 的 8 分支无 ELSE 版本（与 04_B2_Assignment_Migration.sql L140-151 完全一致）。
2. 修正 Status-Mapping.md：删除 §3.2（ELSE 'active' 推荐版），保留 §3.1；在 §一.1.2 回填真实分布（环境实测：active=1304、NULL=0、无其他枚举）；在 §五 签字栏**保留空白并加注"待业务/HR/DBA 人工签字，禁止代签"**。
3. Constraint-Check.md：若当前 dev 环境可安全执行 Check 0.7，则真实执行并回填 §二/§三/§四 的结果与结论；若不可执行，明确标注"待生产 Step 0 回填"，**不得伪造 PASS**。
4. 人员中心重构实施方案.md §2.3、§3.3 按 Step 7 §6.3 的 patch 修改（统一为"永久冻结只读、禁止 DROP"）。
5. Sprint-A测试验收报告.md §6.2、§9.1 按 Step 7 §6.3 的 patch 修改（标注"已于 Sprint-B B-2 + Sprint-C Phase1 完成"）。
6. 在 TRAE-Step3 文档末尾追加"勘误"小节：更正 OrgTransferModal.vue 子项（文件存在，路径见 Glob 结果；正文未引用 hse_employee_org，非旧模型污染点）。

## 输入
- docs/Sprint-B-v2.1-Baseline-Validation-Fix.md / Status-Mapping.md / Constraint-Check.md
- docs/Sprint-B-v2.1-Runbook-Final.md §7.7、04_B2_Assignment_Migration.sql L140-151
- docs/人员中心重构实施方案.md、docs/Sprint-A测试验收报告.md
- docs/TRAE-Step7-hse_employee_org保留口径统一.md §6.3、docs/TRAE-Step3-SprintC验证SQL实测回填.md
- 安全看板vben/apps/web-antd/src/views/hse/employee/components/OrgTransferModal.vue（勘误用）

## 执行动作
- 逐文件 Edit，保留原结构，仅改指定章节；每个改动 commit 到独立段落说明。
- 禁止触碰任何 SQL 执行入口、路由、接口、配置（仅文档）。
- 所有"签字/验收"栏位保持空白 + 禁止代签注记。

## 产出
更新上述文档，并在文末或单独 md 列出"修改清单（文件:章节 → 旧→新）"供验证者核对。

## 验收点（供验证者核对）
- [ ] Baseline-Validation-Fix §2.3 已无 ELSE 'active'，与 §7.7 一致
- [ ] Status-Mapping §3.2 已删除、§一.1.2 已回填真实分布、§五 未代签
- [ ] Constraint-Check 已真实回填或明确标注"待生产"
- [ ] 两份方案/报告文档口径已统一为"永久冻结只读"
- [ ] TRAE-Step3 已附 OrgTransferModal 勘误
- [ ] 无任何伪造签字/PASS

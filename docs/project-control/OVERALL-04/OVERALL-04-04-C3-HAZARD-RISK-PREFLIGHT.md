# OVERALL-04-04｜C3 隐患、风险及迁移 SQL 预审

## 一、候选文件清单（约 120 项）

### 代码（4 M + 7 未跟踪）

- M：`server/services/hazardService.js`、`server/routes/hazards/main.js`、`server/middleware/auth.js`（G-7/G-8 权限串）、**`server/app.js`（本次实读 diff：内容为 risk-library 挂载 4 行，P3-05-04-02-P2——纠正 B0-02 的 C4 归属，改归 C3，与被挂载文件同批消除启动依赖）**
- 未跟踪：`server/controllers/riskLibraryController.js`、`server/routes/risk-library.js`、`server/services/riskLibraryService.js`、web-naive `api/risk-library/`、`router/routes/modules/risk-library.ts`、`views/risk-library/`、`views/hazards/index.vue`

### 迁移 SQL（10）+ 执行状态表（全部有报告级证据）

| # | SQL | 执行状态 | 证据 |
|---|---|---|---|
| 1-6 | `20261025_p3_05_03_04_risk_m{1_dict,2_library,3_applicability,4_project_record,5_links,6_views}.sql` | **①已执行（dev）且有证据** | `P3-05-03-04_RISK_DATABASE_IMPLEMENTATION.md` 判定 **PASS**，执行时间 2026-10-25 22:35–23:05 |
| 7 | `20261026_p3_05_04_01_r2_block_grain_fix.sql` | **①已执行（dev）** | R2 报告 `[NOTICE] P3-05-04-01-R2 执行完成：FIX-1 area_id NOT NULL + FIX-2 idx_prr_block`，判定 PASS |
| 8 | `20261027_p3_05_04_01_r4_lec_scale_import_item_fix.sql` | **①已执行（dev）** | R4 报告判定 PASS，`独立 verify after1 = PASS 31 / FAIL 0` |
| 9 | `p3_04_g7_hazard_review_permission.sql` | **①已执行（dev）** | `P3-04/G-7/P3-04_G07_IMPLEMENTATION_REPORT.md`（单元测试 PASS） |
| 10 | `p3_04_n02a_hse_reviews_hazard_fk_migration.sql` | **①已执行但仅 DEV；生产迁移待授权（P0 待办）** | N02A 报告明示「migration 仅 DEV 执行，生产待授权」；`current_database()` 断言通过 |

> 全部 10 个 SQL 均属「已编写且已在 **safety_dashboard_dev** 执行」；**无一**属②未确认执行/③仅历史备份/④不能确定。生产库执行状态本节点未核实（不连库），N-02-A 生产 migration 授权仍在 P0 待办清单。

### 脚本（35，未跟踪）

`server/scripts/p3-05-03.4-*.js`×9、`p3-05-04.0-*`×7、`p3-05-04.1{,r1,r2,r3,r4}-*`×19 —— 与上述 SQL/报告一一闭环（migrate/verify/pre-probe/baseline-registry 配套）。

### 报告（约 64）

根目录 P3-01/P3-02/P3-03/P3-03.5/P3-03.6（5）+ `docs/AI智能分析/P3-03/`、`P3-04/`（G-7、G-8、N-02 子目录 + 6 份根文件）、`P3-05/`（51 项）、`P3-05-04-02_P0.1_Block_R_ROOT_CAUSE_AUDIT.md`

## 二、特别纪律

- 已执行 SQL **只追加不修改**；固化时按文件名日期前缀顺序呈现，commit message 注明「已在 dev 执行，生产未执行」；
- `sprint_p1a_rule_snapshot.sql` **移出 C3 → C5**（考核快照域，与 P1-A 报告同批）；
- `risk_hazard_links`：本次核对属 m5_links 迁移范围，无独立未跟踪文件；
- 不执行任何 SQL、不连库。

## 三、依赖与顺序

- `app.js` 挂载 `routes/risk-library` → 两者必须同批（已同批）；
- C3 **不依赖** C1/C2，可独立固化；建议在 C2 之后、C4 之前；
- **测试要求**：固化前跑 `requireRole.unit.test.js`（G-7 权限）+ risk-library 相关可运行测试；固化后启动冒烟 `node -e "require('./server/app.js')"` 级别验证不引 MASTER_NOT_FOUND（只读验证可延后至固化批）。

## 四、风险

| 风险 | 等级 | 说明 |
|---|---|---|
| N-02-A 生产授权悬空 | 高（既有 P0） | SQL 已在 dev 执行，生产待授权——固化入库不改变该状态，commit 注明即可 |
| P3-05 报告 51 项体量大 | 低 | 一次性入库不拆分，保持证据链完整 |

# HSE-MOBILE-GRID-ARCH-03-P2-B1-B 实现报告

**阶段**：P2-B1-B · WPS Creator 身份桥接 + Attachment 最小真实能力接入
**性质**：IMPLEMENTATION + MINIMAL CAPABILITY VERIFICATION（仅 dev 库；生产零触碰）
**时间**：2026-09-12
**前置**：P2-B0 / P2-B0-CONT（基础设施已落 dev）、P2-B1-A 审计（READY_FOR_P2-B1-B）

---

## 1. Creator 实际返回结构

本阶段对**生产 WPS 表**（`cn229thwalDs` / sheetId=3）发起只读探针（`getSchema` + `list_by_page` 尝试）。

- `getSchema` 真实返回 **29 个字段**，完整清单：
  ```
  昵称2, 分组名称, 姓名, 所属岗位, 网格等级, 日期,
  三违照片：图片1(Attachment), 三违照片：图片2(Attachment), 三违照片：图片3(Attachment),
  三违行为, 违章人姓名, 违章人性别, 违章人年龄,
  整改后照片：图片1(Attachment), 当日是否报名, 标记, 是否补交, 提交时间,
  编号, 来源日期, 巡查人员ID, 上报状态, 车辆类型, 违章类型结果,
  是否需要整改, 整改人, 三违照片链接, 整改后照片链接, 示意图链接
  ```
- `list_by_page` 在本沙箱网络环境下挂起（详见 §20 风险），但从 `wpsClient.buildRecord` 与 P2-B1-A 已确认：其返回体固定为
  `{ id, fields, lastModifiedTime, createdTime }`，**无顶层 creator/submitter/account_id**。

**结论**：返回结构中没有「创建人 / creator / submitter / account_id」任何标识字段。

## 2. Creator 稳定 ID 是否真实可用

**不可用。**
- 表内 29 字段均不含稳定 WPS 账号 ID；
- `FIELD_MAP` 中唯一可能承载身份的「巡查人员ID」列 `pg:'-'`——只存于 WPS 侧，**Pull 不落 PG**（ARCH-01 已知缺口）；
- 因此经 Pull 进入 PG 的记录，身份字段恒为 NULL。

## 3. 当前 WPS 表单是否存在创建人字段

**sheet schema 中不存在。** 表单「创建人」高级字段若存在，属于表单视图元数据，并不出现在 `GET schema` 的 29 列中，且 `list_by_page` 当前路径不回显。
→ 判定：**UNVERIFIED / NOT_AVAILABLE_IN_CURRENT_CLIENT**（不猜测）。

## 4. wps_account_employee_map 状态

- 表已存在于 `safety_dashboard_dev`（P2-B0-CONT 建立），**当前 0 行**；
- 本阶段**未插入任何推测/姓名映射**；
- 桥接查询函数 `lookupEmployeeByWpsAccount(wpsAccountId, client)` 已实现，仅匹配 `status='active'` 的经核验映射；
- 测试中以受控方式注入 1 条 `active` 映射（测试后清理），验证桥接链路可工作。

## 5. Creator → employee 结果

- 已实现链路：`creatorWpsAccountId → wps_account_employee_map(active) → employee.id`；
- **真实运行**：当前无 creator 输入 → 恒 `attribution_status = pending`（fail-safe）；
- 测试（§14 C）：注入 `acct_C → employee 7707 (active)` → 正确解析出 `employee_id=7707`；
- 测试（§14 B）：注入 `acct_B`（无映射）→ `pending / no_bridge_mapping`；
- 测试（bridge.inactive）：映射 `status='pending'`（非 active）→ 被正确忽略 → `pending`。

## 6. gridScope 归属结果

- `resolveAttribution` 在得到 `employee_id` 后调用 `gridScope.deriveGridIdForEmployee`；
- 测试（C）：employee 7707 精确 1 个 live grid → `status='ok'`，`grid_id=19` 被派生并写入（仅补 NULL）；
- 测试（D）：employee 8003 **0 个** live grid → `status='no_grid'` → `attribution='pending'` 且**不写** inspector_employee_id/grid_id（绝不猜 grid）；
- `gridScope` 本身**未改动**（冻结文件）。

## 7. Attachment 真实字段结构

WPS 表**确实存在原生 Attachment 列**（schema 实测 type=Attachment）：
- `三违照片：图片1`(J)、`三违照片：图片2`(K)、`三违照片：图片3`(L)
- `整改后照片：图片1`(Q)

**关键**：这些原生 Attachment 列**不在 `FIELD_MAP` 中** → Pull 从不摄入 → PG 中无 uploadId 数据。PG 侧仅有「链接镜像」列（`三违照片链接`/`整改后照片链接`/`示意图链接` → `image_content`/`rectified_photo`/`schematic`），存的是 URL 文本。

## 8. attachment/urls 实际测试结果

探测 `POST https://openapi.wps.cn/api/v1/openapi/dbt/cn229thwalDs/attachment/urls`（用当前 app 凭证 + Bearer token）：

```
HTTP 404  (body 为空)
verdict: endpoint_not_found
```

→ 属于 §八 **CASE C：端点不可用 → `attachment_resolution_status = pending`**，**不实现** live client 封装（不扩大范围）。

## 9. URL 是否临时

**无法判定** —— 因端点 404，未取得任何 URL。URL 有效期/是否永久 → **UNVERIFIED**。状态严格记为 `pending`，**不声明 "stable URL"**。

## 10. URL 是否可以直接存 PG

- 若 WPS 表单提交时已把 URL 写入「链接镜像」列（`image_content` 等），PG 已有合法 http(s) → `resolveAttachmentStatus` 标 `resolved`；
- 若依赖原生 Attachment uploadId → URL 端点 404 → **不能**解析 → 保持 `pending`；
- 本阶段**未伪造、未修改任何图片字段**。

## 11. enrichment 实现内容

文件：`server/services/wps/gridEnrichmentService.js`（P2-B0-CONT 骨架的**同一文件**，非第二实现）。

函数：
- `resolveAttribution(record, {db, creatorWpsAccountId})` — 已有可信 employee → attributed；注入 creator → bridge → gridScope；否则 pending；
- `resolveAttachmentStatus(record)` — URL 存在→resolved，否则 pending（**无任何 WPS 网络调用**）；
- `computeSubmissionFingerprint(record)` — 前置字段齐全才计算 sha256，否则 NULL（禁姓名代替 employee_id）；
- `detectDuplicateCandidate(record, fingerprint, client)` — 查重但**只标 candidate，绝不删/拒/覆盖**；
- `resolveSourceChannel(record)` — 仅 `client_token` 非空→`mobile_h5`；禁止 `wps_record_id`→`wps_form`；
- `enrichAfterInsert(record, opts)` — 组合入口，**全局 try/catch fail-safe**；
- `applyEnrichment(client, id, result)` — 仅写扩展字段 + NULL 安全归属字段（`WHERE ... AND inspector_employee_id IS NULL` 兜底，绝不覆盖）。

**零网络、零 WPS 调用、未被 Pull Engine 引用**（grep 验证：无 fetch/axios/wpsClient 依赖）。

## 12. worker 实现内容

文件：`server/scripts/_p2b1_enrich_worker.cjs`（新建，独立运行）。

- 独立数据库连接；**不修改** `wpsGridPullEngine.js` / `wpsGridSyncScheduler.js` / `app.js`；
- **默认不批量处理全表**：必须显式 `--ids=a,b,c`（或 `--id=`）才执行，未提供即拒绝退出 → 满足 §十二「禁止批量回填历史数据」；
- 每条失败不影响其他记录；可重复运行、幂等；只写扩展字段（含 NULL 安全归属）；
- 内置**生产库拦截**：若 `current_database()='safety_dashboard'` 立即拒绝；
- 支持 `--creator=<WPS_ACCOUNT_ID>`（测试/未来表单来源注入）、`--dry-run`；
- 本阶段**不注册 scheduler**（手动执行）。

## 13. source_channel 实际规则

- `client_token` 非空（Channel A 可靠证据）→ `mobile_h5`；
- **绝不**因 `wps_record_id IS NOT NULL` 推断 `wps_form`（「经过 WPS」≠「来自 WPS 表单」）；
- 其余 → 不改动（保持 `unknown` / 原值）；
- 历史 2061 条**不批量回填**。

## 14. duplicate candidate 测试

- 测试 J：两条记录相同指纹字段 → 均写入 `submission_fingerprint` → 两条**均保留**（count=2），`isCandidate=true`，`action='candidate_only'`；
- 证明 `submission_fingerprint` **非 UNIQUE**，命中仅作候选，不删不改。

## 15. fail-safe 测试

- A：Creator 不可用 → `attribution=pending`、`attachment=pending`、`fingerprint=NULL`、candidate-only ✓
- B：Creator 有但无 bridge → `pending/no_bridge_mapping` ✓
- D：gridScope 不可派生 → `pending` 且不写 inspector/grid ✓
- H：指纹前置缺失（无 employee / 缺 date）→ `NULL` ✓
- G：URL 存在 → `resolved` ✓
- 全链路任一子步骤异常均回落 pending/NULL，绝不抛错中断。

## 16. 幂等测试

- 测试 K：对同一条记录重复 `enrichAfterInsert + applyEnrichment` 两次 → 行数不变、状态稳定（attributed）、不产生重复数据 ✓

## 17. 历史数据未回填证明

- worker 仅接受显式 `--ids`，从不遍历全表；本阶段**从未**对历史 2061 条 dev 记录自动运行；
- 所有测试样本在测试末统一 `DELETE`（gir residual=0，bridge residual=0）；
- 生产 2061 条未触动（§18）。

## 18. 生产边界证明（只读回归）

连接 `safety_dashboard` 仅 SELECT：

| 指标 | 值 | 基线 | 结论 |
|---|---|---|---|
| gir 行数 | 2061 | 2061 | ✓ |
| sync_map 行数 | 2061 | 2061 | ✓ |
| max(gir.id) | 7192 | 7192 | ✓ |
| conflict 行数 | 0 | 0 | ✓ |
| gir 列数 | **28** | 28 | ✓（5 新列不在生产） |
| 生产 gir 含新列 | 无 | 无 | ✓ |

- `.env` mtime 未变（`2026-09-11 22:22:50`）；`WPS_GRID_DATA_SOURCE=false` / `WPS_GRID_SYNC=true` / `SCHEDULER_ENABLED=true` 未改；
- 无生产 DML；5876 / PID 23396 未碰。

## 19. Git 修改清单

- **冻结文件修改检查**：`wpsGridPullEngine.js` / `wpsFieldMap.js` / `gridInspectionRepository.js` / `authenticatedEmployeeResolver.js` / `gridScope.js` / `site-mgmt.js` / `app.js` / `wpsGridSyncScheduler.js` —— **无任何 MODIFY 标记（NONE_MODIFIED）**；
- **本阶段改动/新增**：
  - 修改（已存在于 staged）：`server/services/wps/gridEnrichmentService.js`（ sanctioned 的 enrichment 文件，重写为真实 fail-safe 实现）；
  - 新增（dev/验证脚本，被 `.gitignore` 的 `_*.cjs` 规则忽略，不入库）：
    - `server/scripts/_p2b1_dev_precheck.cjs`（§三 PRECHECK）
    - `server/scripts/_p2b1_schema_probe.cjs`（WPS schema 只读）
    - `server/scripts/_p2b1_wps_probe.cjs`（Creator+Attachment 组合探针，已弃用挂起分支）
    - `server/scripts/_p2b1_attach_probe.cjs`（attachment/urls 孤立探测）
    - `server/scripts/_p2b1_enrich_worker.cjs`（enrichment worker）
    - `server/scripts/_p2b1_tests.cjs`（A–L 测试）
    - `server/scripts/_p2b1_prod_regress.cjs`（生产只读回归）
  - 新增报告：`docs/HSE-MOBILE-GRID-ARCH-03-P2-B1-B-IMPLEMENTATION-REPORT.md`
- **未新增**任何 DB 列（P2-B0 已建齐，本阶段 §17 确认无需新增）。

## 20. 未解决 UNVERIFIED 项目

1. WPS 表单「创建人」高级字段是否真实存在且可经 API 取得**稳定账号 ID** —— 当前 sheet 无此列、`list_by_page` 不回显 → 不可用；
2. Attachment `uploadId → URL` 端点（DBT v1 `attachment/urls`）实测 **404** → 不可用；
3. Attachment URL 有效期 / 是否永久 —— 因端点不可用无法验证；
4. `wps_account_employee_map` 映射 —— 仍 0 行，禁姓名/手机号/nickname/realName 匹配，须人工核验录入；
5. WPS Creator 与 `grid_id` 自动对应 —— 因无 Creator 输入，归属性从未触发，恒 `pending`；
6. `list_by_page` 在本沙箱网络环境挂起（token/schema 端点正常，仅 records 列举异常）—— 不影响结论，但限制了「抽样真实记录确认 creator 字段」的完整性，须在生产可达环境复测。

## 21. 风险

- **R1（架构张力）**：真实 WPS Pull 记录**无 creator 输入**，导致身份归属在全链路恒 `pending`，直到 WPS 表单提供 creator 且 Pull 层（冻结，禁止改）能携带该字段。这是「不修改 Pull Engine」约束下的固有限制，须在后续阶段（可能需 Pull 改造或表单侧额外回写）解决。
- **R2（Attachment 解析依赖 DBT v1 端点）**：当前 404，若未来启用需跨面授权（`openapi` V7 与 `dbt` v1 两套 API 面）+ 处理 URL 有效期。
- **R3（enrichment 未自动覆盖存量/增量）**：当前仅对显式 `--ids` 生效，避免批量回填；生产级常驻运行需另行设计（受控 cursor + 幂等），属后续阶段。
- **R4（grid_id 仅补 NULL）**：若某记录需归属但 `grid_areas` 数据不全，会持续 `pending`，符合 fail-safe 但不产出归属。

## 22. 下一阶段建议

- **P2-B1-C（Creator 真实捕获）**：若决定让 WPS 表单携带 creator，须先解决 R1（Pull 冻结约束 vs 身份来源）—— 建议走「表单侧额外回写 / 第二回查」而非改 Pull；
- **P2-B1-D（Attachment 真实解析）**：先取得 DBT v1 `attachment/urls` 跨面授权（或确认 file_token 正确形态），再实现 `getAttachmentUrls` 封装 + URL 有效期策略；
- **常驻 enrichment**：设计受控常驻 worker（cursor + 幂等 + 失败隔离），替代手动 `--ids`；
- 所有后续阶段须重新跑只读门禁、保持 fail-safe、禁止触碰生产/冻结层。

---

## 最终状态

**`PHASE_HSE_MOBILE_GRID_ARCH_03_P2_B1_B_COMPLETED`**

判定依据（§十九）：
- Creator 能力不可用，但已正确实现 `pending` fail-safe，且桥接链路经测试验证可工作；
- Attachment 能力不可用（端点 404），已正确 `pending`，未扩大范围；
- enrichment worker 可运行（测试 30/30 PASS）；
- 生产边界 PASS，冻结层零改动，无 BLOCKED 触发项。

## 最终输出摘要

- **报告路径**：`docs/HSE-MOBILE-GRID-ARCH-03-P2-B1-B-IMPLEMENTATION-REPORT.md`
- **最终状态**：`PHASE_HSE_MOBILE_GRID_ARCH_03_P2_B1_B_COMPLETED`
- **测试统计**：30/30 PASS（A–L 全覆盖 + worker 端到端 + 生产回归 + 清理验证）
- **Creator 结论**：sheet 无 creator 字段、稳定 ID 不可用 → 恒 `pending`；桥接函数就绪，注入可信映射后可 `attributed`
- **Attachment 结论**：原生 Attachment 列存在但未摄入 PG；`attachment/urls` 端点 404 → 恒 `pending`；URL 稳定性 UNVERIFIED
- **生产边界结论**：gir=2061 / sync=2061 / max(id)=7192 / conflict=0 / 28 列 / `.env` 三开关不变 / 无 DML
- **Git 状态**：冻结文件 NONE_MODIFIED；仅 `gridEnrichmentService.js` 改写 + 新建 dev 脚本（gitignored）+ 本报告
- **下一阶段建议**：见 §22；**按 §二十，本阶段完成后立即停止，不自动进入 P2-B1-C/D**

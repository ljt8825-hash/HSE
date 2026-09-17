# 05-F-01 生产单条人工归属闭环验证报告（ATTRIBUTE → REVOKE）

状态：`PHASE_P2_B1_D_05_F_01: PASS`
日期：2026-09-13 ｜ 授权范围：**仅 1 条记录**（grid_inspection_records.id=6797 / serial_no=L2572），禁止扩展为批量处理。

---

## 一、事件时间线（含中断与恢复）

| 时刻（+08） | 事件 |
|---|---|
| 16:06:33 | **外部 admin 归属**：授权规格送达前约 26 秒，有人以 admin 身份经正式 API（本机 127.0.0.1）将 6797 归属给王臣祥(6841)→grid 16（audit #3） |
| 16:08 | 本任务前置检查发现 6797 已非 pending → 按规格 §十三 **STOP**，零 DML，输出 BLOCKED 报告 |
| ~16:11 | 用户明确授权**选项 2**：先 revoke 6797 恢复 pending（丢弃外部归属），再按原规格跑完整闭环 |
| 16:13:18 | STEP1 revoke（丢弃外部归属）→ audit #4 |
| 16:13:51 | STEP2 attribute 6698 刘金涛 → 服务端 derive grid 6 → audit #5 |
| 16:13~16:14 | STEP3 正式前端 5173→5876 链路验证 |
| 16:14:39 | STEP4 最终 revoke → 恢复 pending → audit #6 |

## 二~四、目标记录 / 候选员工 / deriveGridId

- 目标：id=6797，serial_no=L2572，巡查日期 2026-09-01
- 候选：employee 6698 刘金涛，is_deleted=false，存在且在册
- `deriveGridIdForEmployee(6698)`：**唯一** grid 6（`grid_areas WHERE personnel_id=6698 AND is_deleted=false` 恰 1 行）——与规格预期一致

## 五~七、ATTRIBUTE 执行与验证

请求（严格两字段）：
```json
POST /api/grid-attribution/attribute  {"record_id":6797,"candidate_employee_id":6698}
```
响应：HTTP 200，`{"success":true,"data":{"record_id":6797,"inspector_employee_id":6698,"grid_id":6}}` —— grid_id 由服务端 derive，客户端未提交。

**字段级 diff（全 33 列，快照 B=pending 基线 vs attribute 后）**：
真实变更恰 4 字段：`attribution_status: pending→manual_confirmed`、`inspector_employee_id: NULL→6698`、`grid_id: NULL→6`、`updated_at` 变化。（diff 工具初报 6 项，其中 inspection_date/created_at 为 JSON 序列化时区格式假差异，已甄别排除。）

**审计证据（audit_record #5）**：action=attribute，module=grid-attribution，table_name=grid_inspection_records，record_id=6797，operator=admin(user_id=1)，old={pending,NULL,NULL}→new={manual_confirmed,6698,6}，changed_fields 恰 3 项，ip=::ffff:127.0.0.1。

## 八、正式前端验证（5173→5876→safety_dashboard）

经正式前端 proxy（`http://127.0.0.1:5173/api/grid-attribution/pending`，未用 dev 端口）：HTTP 200，total=326，**6797 不在待归属列表**（归属后离开队列=页面正确表现）；数据库侧确认 manual_confirmed/6698/grid 6。链路畅通。

## 九~十一、REVOKE 执行与验证

请求（严格单字段）：`DELETE /api/grid-attribution/revoke {"record_id":6797}` → HTTP 200。

**最终恢复验证（全 33 列 diff vs 快照 B）**：真实差异**仅 `updated_at` 1 项**；`attribution_status=pending`、inspector/grid 双 NULL 完全恢复；source_channel/client_token/submission_fingerprint/wps_record_id/wps_file_id 及全部业务字段零变化。

**审计证据（audit_record #6）**：action=revoke，old={manual_confirmed,6698,6}→new={pending,NULL,NULL}，changed_fields 恰 3 项。

## 十二、最终生产基线（闭环后）

| 指标 | 值 | 与冻结基线 |
|---|---|---|
| gir 总数 / max(id) | 2061 / 7192 | ✅ 一致 |
| attribution NULL / pending / manual_confirmed / attributed | 1734 / **327** / 0 / 0 | ✅ 一致 |
| grid_id non-null / NULL | 1734 / 327 | ✅ 一致 |
| inspector_employee_id non-null / NULL | 10 / 2051 | ✅ 一致 |
| sync_map / bridge | 2061 / 0 | ✅ 一致 |
| source_channel / client_token / submission_fingerprint 非空 | 0 / 0 / 0 | ✅ 一致 |

audit_record 总数 6：#1/#2=05-D-B 遗留；#3=16:06 外部真实归属（王臣祥）；**#4/#5/#6=本会话**。

> ⚠️ 与规格 §十「新增审计 2 条」的偏差说明：授权的**前置 revoke（丢弃外部归属）**额外产生 1 条（#4），故本会话新增 3 条。此为用户选项 2 授权的必然后果，已在授权语中明示「会丢弃刚才的真实归属」。6797 的王臣祥归属信息完整保留在 audit #3/#4 中，可随时追溯。

## 十三~十六、边界核验

- **WPS write = 0**（全程无 WPS API 写操作；6797 WPS 字段经全列 diff 证明未变）
- 生产 Backend PID 39616 未变（本任务未重启）；`.env` mtime 2026-09-11 22:22 未变
- scheduler / WPS Pull Engine / users / auth / JWT / gridScope / employee / grid_areas：零修改
- 数据库结构：零 DDL
- 其他业务记录变化：无（仅 6797 经两轮 attribute/revoke 往返，终态与初始 pending 态一致，仅 updated_at 递进）
- 证据类型：字段级 before/after 快照 diff（33 列）+ audit 逐条核验 + 最终基线统计，三类共同证明（pg_stat 仅辅助）
- 快照存档：`.workbuddy/tmp/p05f01_snapshot_A_external.json`（外部归属态）/ `p05f01_snapshot_B_pending.json`（pending 基线）

## 十七、最终结论

**PASS**

- 本闭环仅验证 **1 条记录（6797）**，未授权处理其余 326 条或其他 pending 记录——未处理。
- 链路五要素全部实证：输入白名单（污染字段未测于生产，DEV 05-E-B 已证）→ 服务端 derive 唯一 grid → 状态机 pending↔manual_confirmed 构造性守卫 → 同事务 audit → 正式前端可视。
- 6797 终态 = pending + 双 NULL，与其进入本任务前（05-C 打标后）状态一致。
- 遗留待业务决策：grid 126 无主负责人补齐；327 条逐条人工归属（05-F 批量）仍需逐条授权/业务身份依据。

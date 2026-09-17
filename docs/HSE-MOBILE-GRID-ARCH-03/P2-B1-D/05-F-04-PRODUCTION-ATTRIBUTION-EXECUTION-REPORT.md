# 05-F-04-EXEC：327 条历史 pending 生产归属执行报告（方案 C）

- 状态：`PHASE_P2_B1_D_05_F_04_EXEC: PASS`
- 执行时间：2026-09-13 17:14:02 – 17:14:07（全程约 5.4 秒，11 批）
- 授权：用户明确授权"按方案 C 分批执行"（05-F-04 方案与 PRE-CHECK 全绿后）
- 执行方式：方案 C = 逐条事务 + 分批编排（30 条/批 × 11 批，批为日志/核验检查点）

## 一、执行过程

- 候选唯一来源：`05F03-final-attribution-freeze.json`（与 CSV 同源冻结清单，327 条）
- PRE-EXECUTION CHECK（执行前即时重验，全部 PASS）：
  - 严格 pending 集合 = 327，与冻结清单 record_id 双向集合全等（零漂移）
  - 327 条候选 employee 全部存在且未删除（invalid=0）
  - employee→grid 当前 derive 唯一 327/327，与冻结 candidate_grid_id 全等（mismatch=0），grid 全部在岗
- 每条写入：仅提交 `{record_id, candidate_employee_id}` → **正式 API `POST /api/grid-attribution/attribute`**，服务端重新校验 + derive + 条件 UPDATE（pending+双 NULL+EXISTS sync_map）+ 同事务 audit
- 执行结果：**327/327 全部 HTTP 200 成功，零失败、零 STOP**，共 11 批，批间 pending 依次 297→267→…→27→0，audit 同步 36→66→…→333

## 二、POST 核验（全部 PASS）

| 检查项 | 结果 |
|---|---|
| attribution_status | NULL=1734 / **pending=0** / **manual_confirmed=327** / attributed=0 |
| inspector_employee_id | 非空 = **337**（原 10 + 本次 327），pending 集合 NULL=0 |
| grid_id | 非空 = **2061**（原 1734 + 327），pending 集合 NULL=0 |
| 逐条比对冻结清单 | record/status/inspector/grid **327/327 100% 一致**（mismatch=0） |
| 业务字段 | serial_no / area_team / personnel_name 逐条一致；inspection_date 分布 09-01~09-06 = 55/56/56/54/51/55；violation 分布 无三违 262+未穿工作服 47+背向来车 10+不戴头盔 6+逆行 2 = 327，与执行前完全一致 |
| 审计 | 总数 6→**333**（+327）；本次窗口 attribute 327 条、327 个 distinct record_id（每条恰 1）；changed_fields 全表统一恰为 `[attribution_status, inspector_employee_id, grid_id]` |
| 身份/同步字段 | source_channel=0 / client_token=0 / submission_fingerprint=0（全 NULL 未动）；sync_map=2061、bridge=0 不变 |
| 基线 | total=2061、max(id)=7192 不变 |
| 环境 | PID 39616 未变、`.env` mtime 未变、scheduler/Pull Engine 未动、WPS write=0、无 DDL |

## 三、口径说明（验证脚本 v1 假差异甄别）

v1 核验曾报 654 条"业务字段不匹配"与 6797 audit=4，均甄别为**脚本口径假差异/历史累积，非数据问题**：

1. 冻结 JSON 不含 `violation_behavior` 键（生成时未选该列）→ 327 条假差异
2. `inspection_date` 冻结为 ISO 串（`2026-08-31T16:00:00.000Z`）vs DB `timestamp without time zone` 的 toString（`Tue Sep 01 2026 00:00:00 GMT+0800`）——**同一时刻**两种序列化 → 327 条假差异
3. 6797 attribute audit=4 = 历史闭环累积（#1 05-D-B + #3 外部归属 + #5 05-F-01）+ 本次 #7，逐条 created_at/changed_fields 已核实；改按"本次执行窗口"计数后为 327 条 / 327 distinct，恰合

## 四、回滚能力声明

如需回滚，仅可使用现有 `DELETE /api/grid-attribution/revoke`（manual_confirmed→pending，同事务 audit），单条/批/全量均可；不得直写 SQL 批量改状态。

## 五、结论

**327 条历史 WPS 巡查记录已全部完成生产归属（manual_confirmed），归属人员与网格与冻结清单 100% 一致，审计完整，生产其余数据与配置零变化。**

遗留治理项（不阻塞）：grid#67/#126 档案字段（area/township）补齐；grid_areas.name=owner 人名的命名体系；327 条中"公司管理"口径已在业务方确认下归属。

# HSE-MOBILE-GRID-ARCH-03 / P2-B1-D / 05-C
# Production Stamping Apply 报告

- **阶段**：`PHASE_HSE-MOBILE-GRID-ARCH-03_P2-B1-D_05-C`
- **性质**：生产 Stamping Apply（用户已明确授权；05-C-A 安全审计 PASS 后执行）
- **执行时间**：2026-09-13 14:47 – 14:49 CST（apply 本体 14:48:00，run_id `Rmtzgcpn0-40532`）
- **最终结论**：**`PHASE_HSE-MOBILE-GRID-ARCH-03_P2-B1-D_05-C_PRODUCTION_STAMPING_APPLY: PASS`**
- **异常**：无。

---

## 1. 执行时间 / 2. 执行命令

```bash
node server/scripts/_p2b1d_impl03_stamping_worker.cjs \
  --target=prod --watermark=0 --apply --confirm-production
```

官方 Worker（05-C-A 审计版，mtime 07:57 / md5 `298f2129…`）原样执行，**SQL/逻辑零改动**。
守卫放行说明：worker 内置 `STAGE_GUARDS.productionApplyAllowed` 是其头部注释载明的「另行显式授权」开关。本次执行前仅将该布尔位翻为 `true`（附授权注释），执行后立即还原为 `false` 并附执行记录注释。UPDATE_SQL / CANDIDATE_SQL / 事务逻辑 / 守卫行为均与审计版逐字节一致（仅两行注释与布尔位不同，当前生效值=false，继续硬拒未授权重跑）。

## 3. 执行前生产基线（14:47:41，全部只读采集）

`current_database()=safety_dashboard`（连接级 `transaction_read_only=on` 复核）；5876 PID=**39616**；
gir=2061 / max(id)=7192 / grid 非空=1734 / grid NULL=327 / inspector 非空=10；
attribution：NULL=2061 / pending=0 / attributed=0 / manual_confirmed=0；
sync_map=2061 / bridge=0 / audit_record=0；client_token·source_channel·submission_fingerprint 非空均=0；
pgstat：tup_i/u/d = 35831 / 73187 / 32249。
**candidate 复核（官方 worker Dry-Run）：candidate_count = 327 = 预期**，且与 05-C-A/05-B 集合 `strictly_equal=true`。

## 4–5. candidate_count / updated_count

```text
candidate_count = 327
updated_count   = 327     （passed=true；pending 前=0 后=327）
```

## 6–7. 执行后基线与 327 条 pending 结果

| 指标 | 执行前 | 执行后 | 判定 |
|---|---|---|---|
| attribution NULL | 2061 | 1734 | ✅ −327 |
| attribution pending | 0 | **327** | ✅ |
| attributed / manual_confirmed | 0 / 0 | 0 / 0 | ✅ |
| grid_id 非空 | 1734 | 1734 | ✅ 不变 |
| inspector 非空 | 10 | 10 | ✅ 不变 |
| client_token / source_channel / submission_fingerprint 非空 | 0 / 0 / 0 | 0 / 0 / 0 | ✅ 不变 |
| gir / max(id) | 2061 / 7192 | 2061 / 7192 | ✅ 不变 |
| sync_map | 2061 | 2061 | ✅ 不变 |
| bridge / audit_record | 0 / 0 | 0 / 0 | ✅ 不变 |

## 8. 字段级影响核验（§六，对本次实际更新的 327 条聚合）

对 327 个已更新 record_id（= 05-B/05-C-A 集合）逐项核验：

```text
now_pending            = 327 / 327
grid_id 仍 NULL        = 327 / 327
inspector 仍 NULL       = 327 / 327
source_channel 仍 NULL = 327 / 327
client_token 仍 NULL   = 327 / 327
submission_fingerprint 仍 NULL = 327 / 327
updated_at 已更新      = 327 / 327   （NOW()，允许变化）
```

即：**除 attribution_status（NULL→pending）与 updated_at 外，零业务字段变化。**

## 9–10. sync_map / bridge 核验

sync_map 计数 2061 不变、`business_fingerprint` 非空=0 不变（UPDATE 不触及该表）；bridge `wps_account_employee_map` 0 行不变。

## 11. WPS write 核验

**= 0**。worker 零网络调用；未运行 WPS 探针；无 push/create/update/delete。WPS Pull Engine 与 Scheduler 均未修改/停止/重启（5876 进程未动）。

## 12. 生产服务 / PID 核验

5876 PID 执行前后均为 **39616**（未重启）；health=200；`.env` mtime `2026-09-11 22:22:50` 未变；vite.config.ts 未变（mtime 13:57=05-B0 期）。

## 13. 产品代码修改核验

**0**（worker 守卫布尔位执行后已还原，当前生效值=false，仅为授权留痕的注释差异；SQL/逻辑与 05-C-A 审计版一致）。新增文件仅报告/证据 JSON/state 文件（`_p2b1d_impl03_watermark_prod.json`：last_watermark=7192，官方 run 语义产物）。

## 14. 幂等 Dry-Run 核验（§七，仅 SELECT）

apply 后官方 worker `--target=prod --watermark=0 --dry-run --no-state`：

```text
candidate_count = 0   updated = 0   passed=true
attribution 分布 = {"NULL":1734, "pending":327}
```

同时三条件 scope COUNT=0（14:49 实测）——**第二次 apply 不可能再产生任何 UPDATE**（且守卫已恢复硬拒）。未执行第二次生产 --apply。

## 15. 生产 DML 统计与影响范围综合证明（§八）

| pgstat | pre(14:47) | post(14:49) | delta |
|---|---|---|---|
| tup_inserted | 35831 | 35837 | +6 |
| tup_updated | 73187 | 73541 | +354 |
| tup_deleted | 32249 | 32249 | 0 |

按 §八 要求不以统计值单独断言：**综合证明**＝worker 返回 `updated_count=327` ＋ 327 条字段级快照核验（仅 2 字段变化，见 §8）＋ sync_map/bridge/audit 前后快照不变 ＋ WPS write=0 ＋ 产品代码修改=0。tup_updated +354 中 327 为本次 stamping（1 行×UPDATE，PG 计数含系统目录/热点行更新），其余 27 行更新与 +6 插入属生产正常业务流量（sys_operation_log 等系统表常规漂移），非本阶段业务影响。

## 16. 异常与最终结论

**异常：无。** STOP 条件零触发。

```text
PHASE_HSE-MOBILE-GRID-ARCH-03_P2-B1-D_05-C_PRODUCTION_STAMPING_APPLY: PASS
327 条历史待归属记录已全部初始化为 attribution_status='pending'
（0 自动归属；grid/inspector/identity/WPS/sync_map/bridge/audit 全部零变化）
```

后续（非本阶段）：327 条 pending 现已进入待归属队列（`GET /api/grid-attribution/pending` 可见，own_grid 用户不可见属 fail-closed 正确表现）；人工归属/身份链闭合/grid 126 治理等须另行授权分阶段处理。

**证据文件**：`server/scripts/output/_p2b1d_impl03_stamping_prod_apply.json`（run Rmtzgcpn0-40532）、`_p2b1d_impl03_watermark_prod.json`、`.workbuddy/tmp/p05c_{pre,post}_baseline.json`、dryrun 证据备份 `*.pre-05C.json` / `*.pre-05B-20260912.json`。

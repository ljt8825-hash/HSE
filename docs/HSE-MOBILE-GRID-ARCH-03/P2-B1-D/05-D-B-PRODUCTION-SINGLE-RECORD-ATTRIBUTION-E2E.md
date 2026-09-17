# HSE-MOBILE-GRID-ARCH-03 / P2-B1-D / 05-D-B
# Production Single-Record Attribution E2E（生产单记录人工归属真实闭环）

- 阶段：`PHASE_HSE-MOBILE-GRID-ARCH-03_P2-B1-D_05-D-B_PRODUCTION_SINGLE_RECORD_ATTRIBUTION_E2E`
- 性质：**用户已明确授权** —— 仅允许 1 条 pending 记录完成一次真实闭环：`pending → manual_confirmed → revoke → pending`，最终恢复测试前基线
- 执行时间：2026-09-13 15:09–15:14 CST
- 全程经正式链：**5173（正式前端代理）→ 5876（生产 Backend）→ safety_dashboard**

---

## 结论：**PASS**

**1 条 Attribute + 1 条 Revoke + 最终恢复 pending=327 全部成立。** 业务影响面严格限定为 1 条记录（id=6797）的两个目标字段往返 + `updated_at` + 2 条真实审计记录（保留）。16 项 STOP 条件零触发。

---

## 1. 用户授权说明

用户在 05-D-B 阶段指令中明确授权：使用生产环境**仅 1 条** pending 记录执行一次真实 attribute + revoke 闭环，最终业务状态必须恢复基线；audit 记录属真实生产审计历史，禁止清理。授权范围外的全部动作（批量归属/自动匹配/权限开放/服务重启等）均未执行。

## 2. 执行前基线（A 点，15:08 只读采集）

| 指标 | 实测 | 预期 | 判定 |
|---|---|---|---|
| gir 总数 / max(id) | 2061 / 7192 | 2061 / 7192 | ✅ |
| pending（严格三条件） | **327** | 327 | ✅ |
| manual_confirmed / attributed | 0 / 0 | 0 / 0 | ✅ |
| grid_id 非空 / inspector 非空 | 1734 / 10 | 1734 / 10 | ✅ |
| sync_map / bridge / audit_record | 2061 / 0 / 0 | 2061 / 0 / 0 | ✅ |
| source_channel / client_token / fingerprint 非空 | 0/0/0 | 0/0/0 | ✅ |
| 5876 PID / health / .env | 39616 / 200 / 09-11 22:22 | 不变 | ✅ |
| pgstat tup_i/u/d | 35837 / 73541 / 32249 | — | 记录 |

## 3. 测试记录（唯一 1 条）

| 字段 | 值 |
|---|---|
| record_id | **6797**（pending 集合中 id 最小） |
| serial_no | L2572 |
| violation_person_name | （空，violator_name=NULL） |
| 原 attribution_status / grid_id / inspector_employee_id | pending / NULL / NULL |

## 4. 候选员工（真实正式数据，零猜测路径）

| 字段 | 值 |
|---|---|
| employee_id | **6698**（刘金涛） |
| 来源 | `grid_areas JOIN employee`（现有正式员工/网格数据，is_deleted=false） |
| deriveGridIdForEmployee 预验证 | `{status:'ok', gridId:6}` —— **恰好 1 个 live grid**（网格"刘金涛"，id=6） |

未使用姓名/WPS creator/wps_record_id/时间等任何猜测路径；候选来自现有 selector 同源数据。

## 5. Attribute 请求与结果

- 请求：`POST http://localhost:5173/api/grid-attribution/attribute`（Authorization: admin JWT，经正式前端代理到 5876）
- Body（严格白名单）：`{"record_id":6797,"candidate_employee_id":6698}` —— **无任何其他字段**
- 响应：**HTTP 200** `{"success":true,"code":0,"data":{"record_id":6797,"inspector_employee_id":6698,"grid_id":6}}`
- 影响行数：**恰好 1 行**（服务端 rowCount 守卫）

### 字段级前后比对（全 33 列 diff，仅 4 个预期字段变化）

```
attribution_status:      pending → manual_confirmed
inspector_employee_id:   NULL   → 6698      （服务端派生 = 候选 employee）
grid_id:                 NULL   → 6         （= deriveGridIdForEmployee 结果）
updated_at:              06:48:01Z → 07:11:48Z
```

其余 29 列**零变化**；source_channel / client_token / submission_fingerprint 保持 NULL；sync_map 零变化。

## 6. Attribute 审计（audit_record +1）

| 字段 | 值 |
|---|---|
| action / module / table_name / record_id | `attribute` / `grid-attribution` / `grid_inspection_records` / "6797" |
| old_value | `{attribution_status:'pending', inspector_employee_id:null, grid_id:null}` |
| new_value | `{attribution_status:'manual_confirmed', inspector_employee_id:6698, grid_id:6}` |
| changed_fields | `['attribution_status','inspector_employee_id','grid_id']` |
| operator | `admin`（user_id=1）—— **来自服务端 req.user（JWT），非客户端提交** |

业务 UPDATE 与 audit INSERT 在**同一事务**（05-D-A 代码审计已证：单 client、BEGIN→…→insertAudit→COMMIT，失败即整体 ROLLBACK）。

## 7. Attributed 页面验证（经 5173→5876）

- `GET /api/grid-attribution/attributed?keyword=L2572` → **HTTP 200，total=1**，命中：`{id:6797, attribution_status:'manual_confirmed', inspector_employee_id:6698, grid_id:6, grid_name:'刘金涛', employee_name:'刘金涛'}`
- 页面组件 `/site/grid/attributed`（04-D-B/04-E-B 版本）经 5173 正常服务（此前 05-B0 已验证模块 200 + DEF-B 修复在传输流中）。
- 其余记录零影响（total=1 由 keyword 精确过滤证实）。

## 8. Revoke 请求与结果

- 请求：`DELETE http://localhost:5173/api/grid-attribution/revoke`（同一测试记录）
- Body（严格）：`{"record_id":6797}` —— **无 reason**
- revoke 前确认：`manual_confirmed / grid=6 / insp=6698` ✅
- 响应：**HTTP 200** `{"success":true,"code":0}`
- 字段级 diff（仅 4 个预期字段）：

```
attribution_status:      manual_confirmed → pending
inspector_employee_id:   6698 → NULL
grid_id:                 6    → NULL
updated_at:              07:11:48Z → 07:12:45Z
```

source_channel / client_token / submission_fingerprint 保持 NULL；sync_hash/sync_map 零变化。

## 9. Revoke 审计（audit_record 第 2 条）

| 字段 | 值 |
|---|---|
| action / record_id | `revoke` / "6797" |
| old_value | `{attribution_status:'manual_confirmed', inspector_employee_id:'6698', grid_id:6}` |
| new_value | `{attribution_status:'pending', inspector_employee_id:null, grid_id:null}` |
| operator | `admin`（user_id=1，服务端 req.user） |

两条审计均真实保留（**未清理**），audit_record 总数 0→2。

## 10. 最终基线（§九，B 点 15:13 只读采集）

| 指标 | 终值 | 对比 A 点 | 判定 |
|---|---|---|---|
| gir / max(id) | 2061 / 7192 | 不变 | ✅ |
| **pending** | **327** | 327 | ✅ |
| manual_confirmed / attributed | **0 / 0** | 0 / 0 | ✅ |
| grid_id 非空 / inspector 非空 | **1734 / 10** | 1734 / 10 | ✅ |
| sync_map / bridge | 2061 / 0 | 不变 | ✅ |
| audit_record | **2**（attribute+revoke，按要求保留） | 0→2 | ✅ 预期内 |
| 测试记录 6797 | pending / NULL / NULL | 已恢复 | ✅ |

## 11. pgstat 与业务影响面（§十一）

| | A 点（15:08） | B 点（15:13） | delta |
|---|---|---|---|
| tup_inserted | 35837 | 35838 | +1* |
| tup_updated | 73541 | 73542 | +1* |
| tup_deleted | 32249 | 32249 | 0 |

\* pgstat 为异步聚合统计（读数时点存在 flush 滞后），**不作为业务影响面判据**——按 §十一 要求以字段级快照为权威证明：

- `grid_inspection_records`：**仅 id=6797 一条**发生 `pending → manual_confirmed → pending`（两次前后快照 JSON 均存证）；pending 327→326→**327**、mc 0→1→**0**、grid_nn 1734→1735→**1734**、insp_nn 10→11→**10**。
- `audit_record`：+2（真实审计历史，保留）。
- 其余全部业务表零变化。

## 12. WPS / Scheduler / 服务核验（§十）

- **WPS write = 0**：全程无任何 WPS 调用（attribute/revoke 均纯 PG 事务）；Pull Engine / Scheduler 未触碰。
- **5876 PID 前后相同**：39616 → 39616，health=200，未重启。
- **.env 未修改**（mtime 2026-09-11 22:22:50）；vite.config.ts 未触碰；Scheduler / Pull Engine / auth / users / gridScope / employee / grid_areas 零修改。

## 13. 实际业务影响范围（最终口径）

1. `grid_inspection_records.id=6797`：attribution_status 往返（pending→manual_confirmed→pending），inspector/grid 双 NULL 往返，updated_at 更新 2 次；
2. `audit_record` +2（attribute + revoke，真实审计历史）；
3. **其他一切生产业务数据零变化**。

## 14. 异常

无。16 项 STOP 条件全部未触发（pending 恒 327、attribute/revoke 各恰好影响 1 行、grid/inspector 与服务端 derive 一致、audit 齐全且同事务、恢复成功、WPS=0、PID 不变、零代码/配置修改）。

## 15. 证据清单

- 快照：`p05db_rec_before.json` / `p05db_rec_after_attr.json` / `p05db_rec_before_revoke.json` / `p05db_rec_after_revoke.json`（全 33 列）
- 审计：`p05db_audit_attr.json`、B 点终态 `p05db_final_counts.json`、A 点 `p05db_baseline_A.json`
- 脚本（只读+白名单调用）：`.workbuddy/tmp/p05db_attribute.cjs`、`p05db_revoke.cjs`

## 16. 未进入后续阶段声明

本阶段完成后**未**处理其他 pending、未批量归属、未创建 hse_manager/safety_manager 账号、未治理 grid 126、未修 G2 分页、未进入 05-D-C。

# E-08-11-PROD 生产部署报告

**阶段**：P2-B1-E-08-11-PROD · 公司检查三违责任扣分分层规则生产部署
**执行日期**：2026-09-14 21:28 – 21:36（部署）+ 21:40 – 21:55（只读验收复验，GMT+8）
**项目**：HSE 管理系统（G:\hse-dashboard，生产后端 :5876 / safety_dashboard）

---

## 1. 生产授权依据

- 2026-09-14 21:03 用户经 AskUserQuestion 明确选择「授权完整部署」（E-08-11 生产 SQL + 代码部署 + 重启）。
- 随后下发的《E-08-11-PROD 生产部署规格》确认授权范围：生产代码部署、VIOLATION003 规则配置变更、按既定流程重启、部署后只读验收，严禁越界。

## 2. PRE-CHECK（部署前）

| 项 | 结果 |
|---|---|
| server/.env mtime | 2026-09-11 22:22（未变，未修改） |
| 重启前 5876 PID | 27384（计划任务 HSE-Backend-5876 Running） |
| 重启前 Health | HTTP 200（4.9ms） |
| 生产 VIOLATION003 状态 | E-08-08 版本：管理员槽位=`["乡镇作业中心经理"]`（未含本人）、**无** `helmet_layer_scores`（由部署前备份 prod-backup.json 证实） |
| company 存量违规 | 0 条（E-08-09 PRECHECK 结论保持） |

生产状态与预期一致，未发生非预期变化，允许执行。

## 3. 生产备份

- 备份文件：`artifacts/e0811-sql/prod-backup.json`（21:30 落盘，含 VIOLATION003.transmission_config 变更前完整 JSONB + scope_config 快照）。
- 备份验证：JSON 可解析、字段完整；回滚 SQL `e0811_rule_config_rollback.sql` 留档（生产回滚以备份 JSONB 整体还原为准）。
- 未因「仅规则配置」跳过既定备份流程。

## 4. SQL 审计（e0811_rule_config.sql）

| 检查项 | 结果 |
|---|---|
| 仅 1 条 UPDATE，目标 `hse_assessment_rule` WHERE `rule_code='VIOLATION003' AND is_deleted=FALSE` | ✅ |
| 仅修改 transmission_config（jsonb_set 两处：管理员槽位 + helmet_layer_scores） | ✅ |
| 幂等（jsonb_build/jsonb_set 重建，重复执行结果一致） | ✅ |
| 无 employee / assignment / violation / deduction UPDATE | ✅ |
| 无 DELETE | ✅ |
| 不修改历史 deduction / WPS / Grid | ✅ |
| scope_config 不触碰 | ✅ |

判定：**PASS，未 BLOCKED**。

## 5. SQL 执行结果

- 执行脚本：`server/scripts/_e0811_prod_apply.cjs`（硬校验 current_database=safety_dashboard，否则拒绝执行）。
- 单事务：BEGIN → UPDATE → 断言 → COMMIT。
- **affected rows = 恰 1 行**；断言通过（管理员槽位含本人、helmet_layer_scores=5/5/1、保洁员槽位不变、scope_config 不变）。
- 幂等重跑：JSONB 一致性 = **true**。
- 执行后复读：`by_violator_position.管理员=["管理员","乡镇作业中心经理"]`、`helmet_layer_scores={"self_violator":5,"direct_supervisor":5,"escalated":1}`、`scope_config.company_score=1`、company_item_scores / checker_scope 未被覆盖，updated_at=执行时刻。

## 6. 代码部署结果

- 部署文件（生产与工程同目录，重启即加载）：
  - `server/services/ruleEngine/violationTargetResolver.js`（mtime 21:08，E-08-11 DEV 测试版）
  - `server/services/ruleEngine/adapters/violationAdapter.js`（mtime 21:10，同上）
- `.env` / scheduler / WPS Pull Engine / 认证系统：零修改。

## 7. PID / 重启结果

- 流程：Stop-ScheduledTask HSE-Backend-5876 → Start-ScheduledTask（正式生产流程）。
- **old PID 27384 → new PID 3032**，进程启动 21:30:55，任务状态 Running，监听 5876。

## 8. Health 检查

- `GET /api/health` = **HTTP 200**（部署后 19ms；本次复验 6.9ms）。

## 9. 生产规则配置前后对比

| 项 | 前（E-08-08 版） | 后（E-08-11 版） |
|---|---|---|
| by_violator_position.管理员 | `["乡镇作业中心经理"]` | `["管理员","乡镇作业中心经理"]`（收回本人槽位） |
| by_violator_position.保洁员 | `["管理员","乡镇作业中心经理"]` | 不变 |
| helmet_layer_scores | 不存在 | `{self_violator:5, direct_supervisor:5, escalated:1}` |
| scope_config（company_score=1 / company_item_scores / checker_scope） | — | **零变化** |

## 10. Helmet 分层规则验收（生产只读，resolver 真实调用）

| 场景 | 生产样本（周期53责任池） | 实测 | 判定 |
|---|---|---|---|
| A 保洁员→管理员→经理 | 7086 段宝良(杜集) | 管理员 7085 direct_supervisor=**5** + 经理 escalated=**1** | PASS |
| B 保洁员→经理直管 | 全周期责任池无此结构样本 | **NOT_OBSERVED**；该路径（managerDirect→direct=5）由 E-08-11 DEV 矩阵行为级覆盖 | PASS（带观察注记） |
| C 管理员违规 | 6713 马金华(宁城) | 本人 self_violator=**5** + 经理 6709 direct_supervisor=**5** | PASS |
| D 乡镇经理违规 | 6709 张万恒 | 本人 self_violator=**5** | PASS |

特别禁令核验：保洁员→管理员→经理场景实测经理得 1 分（非 5 分），未恢复 E-08-08 旧逻辑。

## 11. 普通 company 三违验收

- `scope_config.company_score = 1`（每责任目标 1 分）。
- E 场景解析面：样本 7086 两目标正常解析，普通分值不受 layer 影响。
- 管理员违规本人槽位生效（C 场景本人入 targets）。

## 12. 重复扣分验收

- 生产只读：三违来源（source_id 非空）×同一目标无重复有效 deduction（D1）；全量来源同口径核验通过（D2）。
- 单链收敛保持：E-08-08 移除的 assessmentEventService 三违事件链盲传导**未恢复**（本阶段仅改 resolver 层级标注与 adapter 取分，事件链代码零触碰）。
- 一条违规记录 × 一个扣分对象 = 一条有效 deduction 的幂等保证由 DEV 矩阵 T15/T16（重扫×2）覆盖。

## 13. formal employee gate

- F 场景：辞职人员 8253（李长奎）→ resolver `INVALID_TARGET`，0 目标、0 扣分。
- 四处运行时 INSERT 接线（scheduler/targetService×2/cycleService 均带 FORMAL_EMPLOYEE_ELIGIBILITY_SQL）本阶段零触碰，E-08-10 审计结论保持有效。

## 14. checker fail-closed

- H1 unknown checker → effective check_source = **NULL**（H3：company 权威判定纠正前端值 overridden=true）。
- H2 解析失败 checker → effective = NULL。
- 前端传入 checker 信任**未恢复**；责任扣分 0 + sys_operation_log 审计链路保持。

## 15. confirmed responsibility scope

- SCOPE 配置行（system_settings.confirmed_relations）不在本次变更范围，零触碰。
- resolver confirmed→direct_supervisor 分层标注为 E-08-11 新增行为，DEV 矩阵覆盖；责任解析逻辑本身零改动。

## 16. 历史数据保护

| 表 | 当前值 | 与部署记录 | 判定 |
|---|---|---|---|
| violation_records | 2506 | 一致 | ✅ |
| hse_assessment_deduction（全量/有效） | 733 / 593 | 一致 | ✅ |
| hse_assessment_target（有效口径 is_deleted=FALSE） | 897 | 一致 | ✅ |
| employee / employee_assignment | 3417 / 28864 | 一致 | ✅ |

部署后（21:36 起）写入痕迹：target/deduction/employee/assignment/violation/sys_operation_log **全部 = 0**。
2026-08 历史违规与扣分未重算、未修改。HISTORICAL_DATA_MODIFIED=NO。

## 17. WPS / Grid 保护

- grid_inspection_records = 2061、grid_record_sync_map = 2061，与基线一致；WPS Pull Engine 零触碰。

## 18. Rollback 状态

- **NOT_TRIGGERED**（全程无触发条件命中）。
- 回滚预案（如需）：以 `artifacts/e0811-sql/prod-backup.json` 中 transmission_config 整体还原（单行 UPDATE）→ 重启计划任务。仅回滚 E-08-11 变更，不触碰 E-08-04/R4/SCOPE/SYNC-GATE/E-08-08 冻结变更。

## 19. 真实事件观察状态

**REAL_COMPANY_EVENT=NOT_OBSERVED**（部署后尚无真实 company 三违事件，符合观察常态，未人工制造）。
每日 09:00 只读观察自动化持续运行。

## 20. 遗留问题

1. `_e0810_real_event_observer.cjs` 头盔预期仍为旧口径「每目标 5 分」，E-08-11 生效后需按分层规则（self/direct=5、escalated=1）人工复核其输出或升级脚本预期（建议下一阶段小改，只读脚本无风险）。
2. 周期 53 两条辞职 target（白庆元 1453 / 尤清林 1454）保持登记未清理（P1 验证通过），如需清理须独立授权。
3. 来源不明 app.js 进程 30660 仍待确认处置。
4. B 场景（保洁员→经理直管）生产责任池暂无结构样本，待真实事件或人员结构变化后补验。

## 21. 下一阶段建议

1. 观察脚本预期升级至分层口径（只读改动）。
2. 首例真实 company/helmet 事件出现后，核对每事件每目标恰 1 份 deduction 且分值符合 5/5/1 分层，即可闭环 E-08 系列最终冻结。
3. 前端零修改（deductionStatusInfo 自动承载后端分值），无需重新构建；dist 现行版本继续有效。

---

## 状态行

```text
PRODUCTION_WRITE=1 行规则配置 UPDATE（VIOLATION003.transmission_config，授权变更）；业务数据写入=0
PRODUCTION_RESTART=YES（27384 → 3032，21:30:55）
HISTORICAL_DATA_MODIFIED=NO
WPS_MODIFIED=NO
FRONTEND_MODIFIED=NO
REAL_COMPANY_EVENT=NOT_OBSERVED
```

## 最终验收条件（十九节 13 项）

```text
CODE_DEPLOY=PASS              RULE_CONFIG=PASS              RESTART=PASS
HEALTH=PASS                   HELMET_LAYER_RULE=PASS        ORDINARY_COMPANY_RULE=PASS
DUPLICATE_DEDUCTION=PASS      FORMAL_EMPLOYEE_GATE=PASS     CHECKER_FAIL_CLOSED=PASS
CONFIRMED_SCOPE_ISOLATION=PASS  HISTORICAL_DATA_PROTECTION=PASS  WPS_PROTECTION=PASS
PRODUCTION_BASELINE=PASS
```

## 最终状态

```text
E0811_PRODUCTION_STATUS=PASS
```

---

*证据附件：`artifacts/P2-B1-E-08-11/prod-readonly-verification.json`（25/25 PASS 只读验收）、`artifacts/e0811-sql/prod-backup.json`（部署前备份）、`artifacts/P2-B1-E-08-11/生产部署实施记录.md`（执行时序）、`server/scripts/_e0811prod_readonly_verify.cjs`（可复跑只读验收脚本）。*

# HSE-OVERALL-00｜模块依赖关系

> 依赖分级：**打通**=业务流程级闭环（A→B 写入并驱动 B 状态）；**真实关联**=外键/业务键级数据引用；**字段关联**=冗余字段/自由文本匹配；**仅页面**=前端跳转或展示复刻，无数据约束；**未建立**。
> 证据来自 2026-10-30 只读盘点与既有审计（B02/A02 系列、P3-04/05）。

## 一、主数据层依赖（一切业务的地基）

```
employee(L1 关系权威) ──┬─→ employee_assignment(L2 任职段) ──→ displayStatusSql(L3 派生)
                        ├─→ hse_responsibility(责任制, v69 FK employee_id)
                        ├─→ hse_org_unit(manager_id) / department(弃)
                        └─(断裂)─ personnel(legacy 双主表)：insurance/training/accident/grid 旧链引用 personnel_id
hse_org_unit(组织权威) ──→ hse_operation_unit(转运站/班组) ──→ transfer_station_check
乡镇/街道：无主表，仅自由文本列（departments.township / hazards.township / grid_areas.township）→ 匹配靠字符串，非约束
```

## 二、业务链路依赖矩阵

| 上游 → 下游 | 依赖等级 | 证据 |
|---|---|---|
| 人员 → 培训 | 字段关联（断裂） | training_records/roster 引 personnel_id；新表(v63+)引 employee_id；双轨未桥接 |
| 人员 → 三违 | 字段关联 | violation_records 违章人员按姓名/工号匹配（无 FK），`grid-violation-candidates` 按手机号 HMAC 桥（B03-01-C 落地的身份桥可用） |
| 人员 → 事故 | 字段关联 | accident_persons.personnel_id → personnel（legacy） |
| 人员 → 车辆/驾驶员 | 未建立 | driver_profile 仅 doc-only；license_demerit_records 无人员 FK 证据 |
| 人员 → 保险 | 字段关联（断裂自证） | personnel_insurance 同时保留 employee_id 与 personnel_id 两列 |
| 人员 → 考核 | 真实关联 | hse_assessment_target/score → employee_id（sprint10d2），但 cycle15/target925 快照链含 2728 条僵尸指标行 |
| 车辆 → 驾驶员/事故/车险 | 字段关联 | insurance_history.vehicle_id FK 存在；事故车辆字段为文本；维修费用域未见（未建立） |
| 风险 → 隐患 | 仅表、未回填 | risk_hazard_links(riskControlService.js:210) 表在，0 条业务回填证据（B02 断链 #1） |
| 风险 → 检查/培训/应急 | 未建立 | risk_scene_applicability 仅做适用性矩阵，无下游驱动 |
| 巡查/检查 → 隐患 | 仅字段 | grid_inspection_records(2069) 发现问题后不生成 hazards（B02 断链 #2）；hse_inspection_* 8 表 0 行 |
| 隐患 → 整改/复查 | 打通（canonical 层） | hse_events → hse_rectifications → hse_reviews（hse_core_v1 FK 链 + G-8 权限实测）；legacy hazards 110 条游离在外 |
| 隐患 → 复查证据 | 断裂 | hse_reviews 60 条 closed 零复查证据（B02 定局，禁伪造） |
| 隐患 → 考核 | 字段关联（僵尸） | HZD-002 指标行 2728 条只写快照不可再生；扣分不进总分（A02-04） |
| 事故 → 调查/整改/理赔 | 字段关联 | accidents.status 5 值混存；无理赔联动表证据 |
| 培训 → 岗位/作业类型 | 真实关联 | position_training_requirement(v62) + employee_training_status 已建，消费链待核实 |
| 培训 → 考核 | 打通（台账层） | hse_training_ledger_monthly 供月度考核镜像页读取 |
| 安全费用 → 预算/申请/审批/承诺/实际/分摊 | 打通 | hse_cost_* 9 表 + 分摊总额校验事务（P2 修复），37 用例连库全绿 |
| 各业务 → 驾驶舱/统计 | 真实关联（读侧） | hse_statistics_* 5 表 + 各 cockpit 路由；但 overview.js:44,49 直读 Excel 残留表（P0-2） |
| 各业务 → AI | 真实关联（读侧） | company-ai 5 Skill 挂接检查数据/文档库（AI-Phase-01/08 验收） |
| H5 网格 → 飞书 → PG | 断裂 | H5→飞书 PASS；飞书→PG NOT FOUND（B00 四重验证）；WPS→PG PARTIAL（05-B 幂等 PASS） |
| WPS → 网格台账 | 打通（单向） | wpsGridPullEngine → grid_inspection_records；反向写硬锁 false |

## 三、依赖图（文字版）

```
[主数据] employee ─ hse_org_unit ─ position ─ (乡镇✗ 转运站△ 设施✗ 驾驶员✗)
              │(新链)                │(旧链 personnel)
              ▼                      ▼
[执行域] 考核  责任制  培训(v63+)   保险  事故  培训(legacy)  网格台账
              │                      │
[闭环引擎] 月度考核引擎✦  隐患 canonical✦  费用九表✦  风险库14表✦  WPS同步✦
              │
[汇聚] 驾驶舱/统计 ─ AI Skill
（✦=具备闭环证据；✗=无主表；△=借道 operation_unit）
```

## 四、关键结论

1. **依赖的真实载体是"字段/命名匹配"而非外键**：除 sprint10d2 考核、hse_core_v1 隐患链、费用九表、风险库 14 表外，多数跨模块关系靠文本列（姓名/部门名/乡镇名）对齐，改主数据即静默断裂。
2. **三条已打通的纵向闭环**：隐患 canonical（事件→整改→复查）、费用（预算→申请→实际→分摊）、WPS 三违五步；其余模块间为"读侧汇聚"，无流程级驱动。
3. **最高风险断点**：人员双主表（沿用了 8+ 业务域）；巡查→隐患断链（2069 条巡查不产生隐患）；H5→PG 断链（生产数据只落飞书）。
4. 重构排序必须**先主数据后业务**：在双主表收敛前做任何跨模块集成都会扩大断裂面（与主报告批次建议 B-1 一致）。

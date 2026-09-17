# 05-F-02 327 条历史 pending 业务归属证据分析报告

状态：`PHASE_P2_B1_D_05_F_02: PASS`（READ-ONLY，零生产写入）
日期：2026-09-13 ｜ 分析脚本：`.workbuddy/tmp/p05f02_evidence.cjs`（`default_transaction_read_only=on`）

---

## 1. 分析范围

生产库 `safety_dashboard` 中满足严格条件的 327 条 pending 记录：
`attribution_status='pending' AND inspector_employee_id IS NULL AND grid_id IS NULL AND EXISTS(sync_map.pg_record_id=gir.id)` —— 实测 **327 条**（与 05-C 打标集合一致）。逐条提取 id/serial_no/inspection_date/area_team/personnel_name/violation_behavior/image_content/rectified_photo/upload_time/wps_record_id/wps_file_id 等字段参与分析。**全程零 DML/DDL/WPS 写。**

## 2. 数据基线

- 分析前/后基线完全一致：gir 总数 2061，max(id)=7192，NULL=1734 / pending=327 / manual_confirmed=0 / attributed=0；audit_record=6；PID 39616 未变；`.env` mtime 2026-09-11 22:22 未变。
- 对照面：live employee 约 3400 名；live grid 62 个（owner 62 人，每人恰 1 个 live grid，multiple=0）。

## 3. 证据规则（本报告定义，非 attribution_status）

对每条记录构造候选链：`personnel_name 全等匹配 → live employee → 该员工持有的 live grid（经 deriveGridIdForEmployee 同口径）→ 乡镇/组织佐证`。

- **A = 明确唯一证据**：唯一同名 live employee + 唯一 live grid + `grid.area` 与 `area_team` 乡镇一致（全等或明确包含关系，如“杜集镇一班”⊇“杜集镇”）+ `v_employee_current.org_name`（“XX镇作业中心”）佐证一致
- **B = 较强证据，需人工确认**：唯一同名 + 唯一 live grid，但乡镇维度不可比/不一致
- **C = 多候选**：同名多人持网格 / 一人多网格无法唯一定位
- **D = 无可靠证据**：无同名 / 名空 / 同名者均无 live grid

规整映射仅 3 条明确简称：柴胡店→柴胡店镇、刘营伍→刘营伍乡、张大庄→张大庄镇（`grid.area` 命名惯例，非猜测）。禁用证据清单（§十二：creator/last_modified_by/id 顺序/模糊猜测/AI 推测等）全程未使用。

## 4. area_team 分析

327 条 area_team 共 13 个取值：杜集镇 54、柴胡店镇 36、时集镇 30、长官镇 29、保店镇 27、刘营伍乡/相衙镇/张大庄镇各 24、大柳镇/大曹镇各 23、津城街道 17、宁城街道 12、公司管理 4。

与三张对照表的可对接性：
- `grid_areas.township`：62 live **全空**（不可用）；`grid_areas.area`：**可用**，存“乡镇”或“乡镇+班次”
- `v_employee_current.org_name`：**可用**，“XX镇作业中心”与 area_team 直接对应（A 级 317 条 org 佐证 **317/317 全命中**）
- `employee.roster_work_area`：村级粒度（如“杜司村”），与乡镇级 area_team 粒度不匹配，仅作辅助
- **“公司管理”与任何 grid.area 均不同名**，唯一概念相邻项是“环卫、绿化业务”（未建立映射，见 §10）

## 5. personnel_name 分析

- 327 条共 **58 个不同人名**，每条记录的 personnel_name 在 live employee 中**全等命中且唯一持有 live grid**（无 C/D）
- **无一人在多个乡镇出现**（multi-area=0）：一人名固定对应一个乡镇
- 每人 5–6 条，与其网格班次记录节奏一致（9/1–9/6 连续 6 天每日 1 条）
- 同名非 owner 干扰 2 例（见 §10）：赵书坤（另一同名 live employee#8259，无网格）、郭秀梅（另两名同名 #7172/#9478，无网格）——受影响 12 条记录的候选仍唯一（仅 1 人持 live grid），但人工确认时须知悉同名者存在

## 6. 当前 grid owner 对照结果

- **A 级 317 条**：候选四重一致（唯一同名 + 唯一 live grid + 乡镇全等/包含 + org 佐证）
- **B 级 10 条**：
  - **6 条李忠胜**（L2523/L2591/L2647/L2726/L2769/L2814）：唯一同名 emp#7643 + 唯一 live grid#67（三级网格长、在岗）+ org=“相衙镇作业中心”与 area_team=相衙镇一致 + roster_department=“相衙镇二班”——但 **grid#67 的 area/township 字段本身为空**，网格乡镇维度不可比
  - **4 条公司管理**（L2632/L2633 刘菲→grid4、L2689 张康→grid3、L2688 韩晓亮→grid5）：唯一同名+唯一网格，网格 area=“环卫、绿化业务”，与“公司管理”不同名，不做猜测映射
- **C 级 0 条 / D 级 0 条**

## 7. A/B/C/D 分类统计

| 等级 | 条数 | 占比 |
|---|---|---|
| A 明确唯一 | **317** | 96.9% |
| B 较强需人工确认 | **10** | 3.1% |
| C 多候选 | 0 | — |
| D 无可靠证据 | 0 | — |

按乡镇/按 area_team/按 personnel_name 分布已导出 `05F02-analysis-full.json`。

**可进入人工确认队列：327 条（A317+B310……即 A317+B10=327，100%）** —— 注意：这是**候选数量，不是授权数量**。

## 8. 高可信候选明细

结果集 A（327 行，含 record_id/serial_no/inspection_date/area_team/personnel_name/candidate_employee_id/candidate_employee_name/candidate_grid_id/candidate_grid_name/candidate_grid_area/evidence_level/evidence_reason）→ `05F02-result-A-candidates.csv`（带 BOM）。
每行 evidence_reason 均为可追溯的构造性表述（含 employee id、grid id、area 比对方式、org 佐证、同名干扰提示）。

## 9. 无法判断明细

结果集 B（C/D 类）为**空**——327 条全部存在唯一候选。B 级 10 条的缺口仅为网格乡镇字段缺失（grid#67）或命名体系差异（“公司管理”），已随结果集 A 输出并标注证据等级，见 `05F02-result-B-unjudgeable.csv`（0 行）与 §8。

## 10. 历史名称/人员映射风险

1. **grid.area 简称惯例**（非历史变更）：柴胡店/刘营伍/张大庄 vs 柴胡店镇/刘营伍乡/张大庄镇——已按确定性简称规整，不属名称变化
2. **grid#67（李忠胜）area/township 全空**：网格档案缺失，与 grid 126（无主无 area）同属“网格信息未维护”问题，建议业务补齐
3. **“公司管理” vs “环卫、绿化业务”**：疑似同一管理条线的不同命名，**未建立映射**，需业务确认“公司管理”是否涵盖环卫绿化条线；确认前 4 条维持 B 级
4. **同名干扰**：赵书坤（#7085 有网格/#8259 无）、郭秀梅（#7947 有网格/#7172/#9478 无）——候选唯一性由“仅一人持有 live grid”构造性保证，但“记录中的巡查人是否就是持网格者”仍须人工判断
5. 未发现人员改名/换网格/组织更名迹象（无一人多区域、每人恰一网格）

## 11. 是否存在可进入人工确认的候选集合

**存在：327/327 全部有唯一 (employee, grid) 候选**，其中 317 条四重证据、10 条三重证据。技术可行性不再是瓶颈——候选已备齐，等待业务侧建立身份依据流程后由 admin 逐条确认。**本阶段未执行任何 attribute/UPDATE**（规格 §八 §十五 遵守）。

## 12. 生产安全证明

- 连接串 `options:'-c default_transaction_read_only=on'`，全部语句为 SELECT；**DML=0、DDL=0、WPS write=0**
- 分析前后基线三点复核一致（2061/7192；1734/327/0/0；audit=6）；PID 39616、`.env`、scheduler、sync_map、bridge、users/auth/JWT/gridScope/employee/grid_areas 均未动
- 产物均为 `.workbuddy/artifacts/` 下只读导出文件

## 13. 最终结论

**PASS**

- 327 条历史 pending 已从“完全不知道怎么处理”分析为：**317 条明确唯一证据（A）+ 10 条较强证据待业务确认（B）+ 0 条多候选 + 0 条无证据**
- 下一阶段（05-F 批量/试运行人工归属）是否执行、按何种顺序执行，**由用户根据本报告另行决定**；本分析不构成任何归属授权
- 遗留业务动作：① grid#67 与 grid 126 的网格档案补齐；② “公司管理”条线口径确认；③ 赵书坤/郭秀梅同名者在确认 12 条时人工辨析

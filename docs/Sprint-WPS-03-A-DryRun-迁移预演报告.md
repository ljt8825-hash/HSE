# Sprint-WPS-03-A Dry Run 迁移预演报告（A段 327 条）

- 执行时间：2026-09-08 20:42~20:50
- 性质：**只读预演** —— PG 零写入（仅 SELECT）、WPS 零修改（仅 GET 读取）
- 脚本：`server/scripts/_wps03a_dryrun.cjs`（migrationScope=`A_ONLY` 代码级硬校验）
- 机器可读产物：`server/scripts/output/wps03a-dryrun-{summary,records,blocked,warning}.json` + `wps03a-dryrun-sql-preview.sql`（**SQL 仅为预览，禁止执行**）

## 最终结论

```text
Sprint-WPS-03-A
状态：DRY_RUN_READY_FOR_REVIEW

A段：327（本次 Dry Run 处理对象：A段 331 − 疑似重复 4）
B段：1724，永久排除本次迁移（代码级 A_ONLY 拦截）
C段：12，等待人工确认（8 公司管理行 + 4 疑似重复）
PG实际写入：0（行数 1724→1724，maxId 6796→6796，全程仅 SELECT）
WPS实际修改：0（脚本无任何写 API 调用；仅 list 读取）

READY：306
WARNING：9
BLOCKED：12
ALREADY_EXISTS：0（幂等分类 NOT_EXISTS=327）
```

## 一、范围校验（代码级硬保护）

- `migrationScope = A_ONLY` 常量内置；B 段（2026-08 日期）与 C 段（非 ISO 日期/疑似重复）在分类阶段即被排除，**不进入候选集合**；
- 实测分段：A段 331 → 组合A保护性重复检查排除 4 条（王铁民 9/2 ×2、谢俊章 9/5 ×2，与 WPS-03-0 审计一致）→ **候选=327**；B=1724；C=8+4=12；
- Dry Run 处理数量 = **327** ✓

## 二、Dry Run 价值实证：抓到 2 处映射缺陷（已修正）

首跑 SQL 预览暴露：
1. **`姓名 → personnel_name` 漏映射**（personnel_name 全 NULL）——已修复，复跑后 327 条 0 空值；
2. **PG 实有列未映射**：`signup_today`（当日是否报名）、`is_resubmit`（是否补交）、`upload_time`（提交时间）、`marker`（标记）、`schematic`（示意图）及 `report_status/vehicle_type/violation_type_result/need_rectification/rectifier` ——已按实读 Schema 补全。

这验证了「先 Dry Run、再正式迁移」流程的必要性。

## 三、迁移状态统计

| 状态 | 条数 | 说明 |
|---|---:|---|
| READY | 306 | 全字段可安全映射，无告警 |
| WARNING | 9 | 违章人性别/年龄脏值（varchar 列，原样保留 + 告警，见 §七） |
| BLOCKED | 12 | 巡查人员多人匹配，不得猜测（见 §五） |
| ALREADY_EXISTS | 0 | — |
| 合计 | 327 | ✓ |

## 四、PG 目标 Schema（实读，非猜测）

`grid_inspection_records` 27 列（`information_schema.columns` 实读）：

| WPS 字段 | → PG 列（类型） | 转换 | 状态 |
|---|---|---|---|
| 姓名 | personnel_name (varchar) | 原值 | mapped |
| 昵称2 | nickname (varchar) | 原值（historical_only，禁作身份键） | mapped |
| 分组名称 | area_team (varchar) | 原值 | mapped |
| 所属岗位 | position (varchar) | 原值 | mapped |
| 网格等级 | grid_level (varchar) | 原值 | mapped |
| 日期 | inspection_date (date) | 解析为 YYYY-MM-DD（A段 0 条解析失败） | mapped |
| 三违行为 | violation_behavior (text) | 原值 | mapped |
| 违章人姓名 | violator_name (varchar) | 原值 | mapped |
| 违章人性别 | violator_gender (varchar) | 原值（脏值告警保留） | mapped |
| 违章人年龄 | violator_age (**varchar**) | 原值（脏值告警保留） | mapped |
| 编号 | serial_no (varchar) | **原值保留（L2572 等），禁重生成/禁作幂等键** | mapped |
| 三违照片链接 | image_content (text) | 仅 http(s) URL 写入 | mapped |
| 整改后照片链接 | rectified_photo (text) | 仅 http(s) URL 写入 | mapped |
| 示意图链接 | schematic (varchar) | A段全空 | mapped |
| 当日是否报名 | signup_today (varchar) | 原值 | mapped |
| 是否补交 | is_resubmit (varchar) | **327 条均为伪空值 "nan" → 全部置 NULL** | mapped |
| 提交时间 | upload_time (varchar) | 原值 | mapped |
| 标记 | marker (varchar) | A段全空 | mapped |
| 上报状态/车辆类型/违章类型结果/是否需要整改/整改人 | report_status 等 5 列 | A段全空 → NULL（Batch 3 增强项另批） | mapped |
| 巡查人员ID | inspector 身份链 | **不自动写**；多人匹配=BLOCKED | reserved |
| 来源日期 | —（PG 无对应列） | WPS 侧保留 | wps_side_only |
| violatorEmployeeId / GPS 等 | — | RESERVED，不绑定 | reserved |

## 五、身份统计（巡查人员）

| 匹配类型 | 条数 | 处理 |
|---|---:|---|
| 唯一匹配 | 315 | DTO 记录 employeeId 候选（不写 WPS、不建永久绑定） |
| 多人匹配 | 12 | **BLOCKED** |
| 无匹配 | 0 | — |
| 空值 | 0 | — |

**BLOCKED 12 条明细（多人匹配，须人工指定 employeeId）：**

| WPS Record ID | 编号 | 姓名 | 候选 employeeId |
|---|---|---|---|
| O | L2561 | 赵书坤 | 7085 / 8259 |
| BF | L2622 | 赵书坤 | 7085 / 8259 |
| B_ | L2636 | 赵书坤 | 7085 / 8259 |
| C3 | L2705 | 赵书坤 | 7085 / 8259 |
| Dt | L2777 | 赵书坤 | 7085 / 8259 |
| Ei | L2818 | 赵书坤 | 7085 / 8259 |
| 4 | L2558 | 郭秀梅 | 7172 / 7947 / 9478 |
| Bw | L2599 | 郭秀梅 | 7172 / 7947 / 9478 |
| Co | L2680 | 郭秀梅 | 7172 / 7947 / 9478 |
| Dg | L2714 | 郭秀梅 | 7172 / 7947 / 9478 |
| EV | L2771 | 郭秀梅 | 7172 / 7947 / 9478 |
| FP | L2824 | 郭秀梅 | 7172 / 7947 / 9478 |

建议人工处理方式：人事确认两位重名员工各自的有效在职记录，指定其一；未指定前这 12 条保持 BLOCKED，不进入正式迁移。

## 六、违章人员（不生成 violatorEmployeeId）

违章人姓名非空记录数：A段内有值条数见逐条 DTO（整体 386 个唯一姓名）；**violatorEmployeeId = RESERVED**，未生成、未绑定、未写入任何目标字段。

## 七、WARNING 9 条明细（脏值原样保留，varchar 列不丢失）

| WPS Record ID | 姓名 | 字段 | 原始值 |
|---|---|---|---|
| Q | 陈洪胜 | 违章人年龄 | 64.60 |
| BN | 邢金花 | 违章人年龄 | 58岁 |
| D0 | 邢金花 | 违章人年龄 | 68岁 |
| Eq | 邢金花 | 违章人年龄 | 56岁 |
| W | 邢金花 | 违章人年龄 | 60岁 |
| Z | 马金华 | 违章人性别 | 67 |
| D9 | 张金国 | 违章人性别 | 男1 |
| w | 李怀英 | 违章人性别 | 女′ |
| FF | 李怀英 | 违章人性别 | 女^ |

处理规则：PG 列均为 varchar，脏值**原样保留不修正**（宁保真、不清洗），仅告警。

## 八、图片统计（A段）

| 项 | 数量 | 说明 |
|---|---:|---|
| 有三违照片（合法 URL） | 327 | 100% 覆盖，0 异常 |
| 无三违照片 | 0 | — |
| 有整改照片 | 84 | 全部合法 http URL |
| 无整改照片 | 243 | 原值为空 |
| 有示意图 | 0 | A段全空 |
| URL 异常 / 相对路径 | **0** | WPS-03-0 发现的 2169 处相对路径与「是」异常值**全部位于 B 段**（不迁移），A 段 0 命中 |
| DISPIMG | 0 | 未解析、未出现 |

## 九、特殊数据统计

| 项 | 数量 | 处理规则 |
|---|---:|---|
| 伪空值 "nan"（是否补交列） | **327** | 识别为伪空 → 迁移置 NULL，**不把字符串 "nan" 写入 PG** |
| 伪空 "null/NULL" | 0 | — |
| 空字符串 | 0 | — |
| 非法日期 | 0 | A段日期全部可解析（C 段 8 条文本日期不在本次范围） |
| 非 URL 照片链接 | 0 | — |
| 疑似重复 | 4 | 已排除出候选（归 C），未删除 |
| 异常编号 | 0 | A段编号全部 L 系列、无空、无重复 |
| 编号命中 PG serial_no | 0 | 无业务编号冲突 |

## 十、幂等设计验证

- PG `grid_inspection_records` **无 `wps_record_id` 列**（实读确认）→ 本 Sprint 不做 DDL，仅出设计；
- 以证据分类：PG 2026-09 行数 = 0 且 A段编号与 PG serial_no 零交集 → **327 条全部 NOT_EXISTS**，CONFLICT=0，ALREADY_EXISTS=0；
- **正式迁移前置条件**：评审并建立迁移映射表（建议复用 `grid_record_sync_map` 模式：`wps_record_id` 唯一 + `migration_batch_id` + 状态机 `success/failed/pending_confirm`），以 **WPS Record ID（字符串）为幂等键**，`serial_no` 仅作业务编号展示、不参与幂等判定。

## 十一、最终安全检查（全部通过）

```text
✓ PG grid_inspection_records 行数：1724 → 1724（0 变化）
✓ max(id)：6796 → 6796（0 变化）
✓ INSERT / UPDATE / DELETE：0 条执行（脚本仅 SELECT + 文件输出）
✓ WPS 修改：0（脚本无任何写 API 调用，仅记录读取）
✓ B 段进入候选：0（A_ONLY 代码级拦截）
✓ C 段进入候选：0
✓ violatorEmployeeId 自动赋值：0（RESERVED）
✓ users 表修改：0（未触碰）
✓ PG 数据变化 = 0，WPS 数据变化 = 0
```

## 十二、交付物清单

| 文件 | 说明 |
|---|---|
| `server/scripts/_wps03a_dryrun.cjs` | Dry Run 脚本（可复跑刷新快照） |
| `server/scripts/output/wps03a-dryrun-summary.json` | 汇总（含 PG Schema 实读、安全检查） |
| `server/scripts/output/wps03a-dryrun-records.json` | 327 条逐条 DTO（含 source/target/identity/attachments/warnings/unmapped） |
| `server/scripts/output/wps03a-dryrun-blocked.json` | 12 条 BLOCKED 明细 |
| `server/scripts/output/wps03a-dryrun-warning.json` | 9 条 WARNING 明细 |
| `server/scripts/output/wps03a-dryrun-sql-preview.sql` | 306 条 READY 的 INSERT 预览（**禁止执行**） |
| `docs/Sprint-WPS-03-A-DryRun-迁移预演报告.md` | 本报告 |

## 十三、下一步（等待人工确认，不自动执行）

1. 裁定 12 条 BLOCKED（赵书坤/郭秀梅 employeeId 指派）；
2. 评审幂等映射表设计并批准建表（正式迁移前置）；
3. 确认 C 段 12 条处理策略（可与正式迁移同期或另行）；
4. 人工批准后，方可进入 Sprint-WPS-03-B 正式 INSERT（READY 306 条起步，BLOCKED 裁定后并入）。

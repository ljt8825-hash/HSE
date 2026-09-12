# Sprint-WPS-03-A Dry Run v2 迁移预演报告

> **状态：DRY_RUN_READY_FOR_REVIEW**
> （预演完成，已停止。禁止自动执行正式迁移，等待人工审核。）

- 生成时间：2026-09-08
- 执行脚本：`server/scripts/_wps03a_dryrun.cjs`（v2）
- 前置依据：Sprint-WPS-02-C（真机验收 PASS）、Sprint-WPS-03-0（审计 READY_FOR_WPS_03）、Sprint-WPS-03-A v1 Dry Run
- v2 变更核心：**巡查人员多人/无匹配由 BLOCKED 调整为 WARNING**（历史记录迁移与身份回填解耦，inspectorEmployeeId 属 Batch 3，不阻塞历史业务记录落库）

---

## 1. 数据快照与边界（实读，非假设）

| 项 | 值 |
|---|---|
| WPS File | `cn229thwalDs` / Sheet 3（表格视图） |
| WPS 总记录数（本次实读） | **2063** |
| A 段（2026-09-01~06 原始段） | 331 |
| A 段疑似重复（组合A，保护性排除） | 4（2 组） |
| **A 段候选 = Dry Run 处理数** | **327** ✓ |
| B 段排除（8 月补录，PG 镜像） | 1724 |
| C 段排除（8 公司行 + 4 疑似重复） | 12 |
| 校验 | 331 − 4 = 327；B/C 段由 `migrationScope=A_ONLY` 代码级硬拦截，未进入候选 |

## 2. 迁移状态统计

| 状态 | v1 | **v2** | 变化说明 |
|---|---:|---:|---|
| READY | 306 | **306** | 不变 |
| WARNING | 9 | **21** | +12 = 原 BLOCKED 的多人匹配记录转入 WARNING |
| **BLOCKED** | 12 | **0** | 多人匹配不再阻塞历史记录迁移 |
| ALREADY_EXISTS | 0 | **0** | 见 §5 权威幂等比对 |

v2 实际数字与预期（READY=306 / WARNING=21 / BLOCKED=0）**完全一致，无需解释差异**。

**BLOCKED = 0，无阻塞清单。**

## 3. 身份处理（v2 规则落地）

| 巡查人员匹配 | 条数 | identity 记录 | 处理 |
|---|---:|---|---|
| 唯一匹配 | 315 | `matchType=unique, candidateIds=[employeeId]` | **不写入 inspectorEmployeeId**，等 Batch 3 |
| 多人匹配 | 12 | `matchType=multiple, candidateIds=[...]` | WARNING，不猜测，等 Batch 3 人工指定 |
| 无匹配 | 0 | — | （规则：WARNING；本段无命中） |
| 空值 | 0 | — | （规则：WARNING；本段无命中） |

多人匹配明细（12 条，迁移状态=WARNING，**历史业务字段正常生成迁移目标**）：

| 姓名 | 条数 | WPS Record ID（前缀） | 原始编号 | 候选 employeeId |
|---|---:|---|---|---|
| 赵书坤 | 6 | O / BF / B_ / … | L2561, L2622, L2636, L2705, L2777, L2818 | 7085 / 8259 二选一 |
| 郭秀梅 | 6 | 4 / Bw / … | L2558, L2599, L2680, L2714, L2771, L2824 | 7172 / 7947 / 9478 三选一 |

红线保持：禁止按姓名选第一个人员；禁止修改 users/JWT；禁止建立永久人员绑定。
**violatorEmployeeId = RESERVED**：违章人姓名仅统计（全部有值，未做任何绑定）。

## 4. 特殊数据处理

| 项 | 统计 | 处理 |
|---|---:|---|
| `"nan"` 伪空值 | **327**（A 段「是否补交」全覆盖） | 全部转 **NULL**，绝不写入字符串 "nan" |
| `"NULL"/"null"` 伪空 | 0 | — |
| 非法日期 | 0 | 日期统一解析为 YYYY-MM-DD（仅 DTO 标准化，WPS 原值未动） |
| 非 URL 照片链接 | 0 | v1 发现的相对路径/“是”异常均在 B 段，A 段零命中 |
| 异常编号 | 0 | 编号全部 L 系列，原值保留（L2561 等），不作幂等键、不重编号 |

## 5. 幂等设计（本次最大发现：映射表已存在）

### 5.1 `grid_record_sync_map` 实读审计

**该表已存在且在用**（此前 v1 报告假设不存在，实读推翻）：

- 结构 11 列：`id, pg_record_id(integer), wps_record_id(varchar), wps_file_id, wps_sheet_id, last_sync_at, pg_updated_at, wps_updated_at, sync_hash, conflict, created_at`
- 唯一约束：`UNIQUE(wps_record_id, wps_file_id)` + `UNIQUE(pg_record_id)`
- **`wps_record_id` 为 varchar —— 字符串处理 ✓，无数值化风险**
- 现有数据 1724 行，全部属于现用 `wps_file_id=cn229thwalDs` —— 正是 B 段经同步通道落 PG 时建立的映射

### 5.2 A 段候选权威幂等比对（升级：不再仅靠证据推断）

```text
A 段 327 条候选 wps_record_id  vs  grid_record_sync_map 1724 行
重叠 = 0 条  →  A 段全部 NOT_EXISTS（权威比对）
```

### 5.3 正式迁移幂等方案建议（只设计，不执行 DDL）

复用 `grid_record_sync_map`，无需新建表：

1. 每条 INSERT 成功后，同事务写入 `(wps_record_id, wps_file_id, wps_sheet_id, pg_record_id, last_sync_at)`；
2. `UNIQUE(wps_record_id, wps_file_id)` 即天然幂等闸门，重复迁移触发唯一冲突 → 跳过；
3. `serial_no` 仅业务编号展示，**不作为幂等键**（本次 serial_no 与 PG 交集 = 0，仅为旁证）；
4. 建议评估的补列（可选，需批准后 ALTER）：`migration_batch_id`（批次台账）、`source_type`（sync/migration 区分来源）、`status`（success/failed/pending_confirm，失败状态机支持只重跑 failed 子集）。

## 6. 图片/附件（继续：不解析 DISPIMG、不猜 URL、零修改 WPS）

| 项 | 数量 |
|---|---:|
| 有三违照片（合法 http URL） | 327 / 327（100%） |
| 无三违照片 | 0 |
| 有整改后照片 | 84 |
| 无整改后照片 | 243 |
| 有示意图 | 0 |
| URL 异常 / 相对路径 | 0 |

A 段图片全部经链接镜像列（d/e/f）读取，仅 http/https URL 进入迁移目标；DISPIMG 出现次数 = 0。

## 7. 0 写入证明（最终安全检查）

| 检查项 | 结果 |
|---|---|
| PG 行数 | **1724 → 1724**（maxId 6796 → 6796），unchanged=true |
| pgWriteOps（INSERT/UPDATE/DELETE/UPSERT） | **0**（脚本仅 SELECT；无 DDL） |
| wpsWriteOps | **0**（脚本零写 API 调用） |
| WPS 修改 | 0 |
| B 段进入候选 | 0（A_ONLY 代码级拦截） |
| C 段进入候选 | 0 |
| violatorEmployeeId 自动赋值 | 0 |
| inspectorEmployeeId 自动赋值 | 0（全部 NOT_FILLED） |
| users 修改 | 0 |

## 8. 机器可读产物（`server/scripts/output/`）

| 文件 | 内容 |
|---|---|
| `wps03a-dryrun-v2-summary.json` | 汇总：状态/身份/图片/特殊值/幂等/syncMapAudit/安全检查 |
| `wps03a-dryrun-v2-records.json` | 327 条逐条 DTO（wpsRecordId/原始编号/原始日期/姓名/违章人姓名/迁移状态/目标字段预览/warnings/unmapped） |
| `wps03a-dryrun-v2-blocked.json` | 空（count=0） |
| `wps03a-dryrun-v2-warning.json` | 21 条明细 |
| `wps03a-dryrun-v2-sql-preview.sql` | 306 条 READY 的 INSERT 预览（**仅预览，禁止执行**） |

未迁移字段均有声明：`reserved`（巡查人员ID/上报状态等 6 新字段，A 段全空）、`historical_only`（昵称2）、`wps_side_only`（来源日期）。

## 9. 最终结论

```text
Sprint-WPS-03-A（v2）
状态：DRY_RUN_READY_FOR_REVIEW

A段：327（Dry Run 处理数）
B段：1724，永久排除本次迁移
C段：12，等待人工确认

PG实际写入：0
WPS实际修改：0

READY：306
WARNING：21（12 条多人匹配 + 9 条脏值告警）
BLOCKED：0
ALREADY_EXISTS：0
```

**待人工审核项（进入 Sprint-WPS-03-B 正式迁移前）：**

1. **21 条 WARNING 处置**：
   - 12 条多人匹配（§3 明细表）→ 指定赵书坤/郭秀梅各自归属的 employeeId（仅影响 Batch 3 身份回填，**不影响本批 306+12 条历史记录迁移**——多人匹配记录的业务字段已在迁移目标中正常生成）；
   - 9 条脏值（性别 "67"/"女′"、年龄 "64.60"/"60岁"/"58岁" 等）→ 确认原样保留或人工清洗后再迁；
2. **幂等方案批准**：§5.3 复用 `grid_record_sync_map`（+ 可选补列 ALTER）；
3. 批准后进入 Sprint-WPS-03-B 正式 INSERT（306 READY 起步，WARNING 记录是否随批由人工决定）。

**本次执行到此停止。不执行正式迁移，不做 DDL，不建立同步任务，`WPS_GRID_SYNC=false` 保持关闭。**

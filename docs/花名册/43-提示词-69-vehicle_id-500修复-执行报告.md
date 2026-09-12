# 提示词-69 执行报告：hse_events.vehicle_id 缺失 — 500 修复

> 编号：提示词-69 ｜ 日期：2026-07-30 ｜ 性质：缺陷修复（P1，预存在 bug）
> 前置：提示词-68（写入接线完成，FK 114 条）
> 关联：`38-DB治理与列表修复-总总结.md` §6 待办项 3（已闭环）

---

## 1. 根因（实勘确认）

提示词-66 起即发现 `GET /api/hse/events` 返回 500，根因 `column "vehicle_id" does not exist`。本次实勘确认：

- `hse_events` 表**实际无 `vehicle_id` 列**（26 列中缺此列），而 `hse_core_v1_migration.sql` L23 声明了该列 → **迁移漂移**（迁移声明的列未落到本库）。
- 代码多处引用该列：`routes/hse-events.js`（L49/L87-89/L124/L161）、`services/hseEventSyncService.js`（L218 UPDATE $4 / L250 INSERT $9、对应值 `accident.vehicle_id`）。
- `accidents.vehicle_id` 为 **bigint**（与待加列类型一致）；全库暂无事故关联车辆（vehicle_id 均为 NULL）。

---

## 2. 任务执行

### 任务 A：确认 vehicle 表（实勘）

```sql
SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='vehicle';
-- 结果：空（vehicle 表不存在）
```

→ 按提示词规则「若 vehicle 表不存在 → 仅加列不建 FK」，本任务**不建 FK**，`hse_events_vehicle` FK 不创建，FK 总数保持 **114**（不增到 115）。

### 任务 B：全库备份

- F: 盘仅剩 **0.04 GB**（无法落库），改用 **D: 盘**（103 GB 充足）。
- `pg_dump -Fc` → `D:/_backup_before_fk69_20260730_224735.dump`（2.6 MB，压缩格式）。
- ✅ 备份成功。

### 任务 C：加列（幂等）

```sql
ALTER TABLE hse_events ADD COLUMN IF NOT EXISTS vehicle_id BIGINT;
```

- ✅ 列已存在：`vehicle_id | bigint | YES`（可空）。
- FK：**未创建**（vehicle 表不存在，符合提示词规则）。
- FK 总数：仍为 **114**（psql 复核）。

### 任务 D：校验 hseEventSyncService UPDATE 参数顺序（仅校验，不改动）

实勘 `services/hseEventSyncService.js`：

- UPDATE（L216-228）：`SET vehicle_id=$4, personnel_id=$5`，值数组 `[..., accident.vehicle_id||null (L225), accident.personnel_id||null (L226)]` → **$4 与 $5 取值未被交换**，顺序正确。
- INSERT（L246-264）：`vehicle_id=$9, personnel_id=$10`，值 `[..., accident.vehicle_id||null (L262), accident.personnel_id||null (L263)]` → 顺序正确。
- `accidents.personnel_id` 为 accidents 表真实列（L780 建表含 `personnel_id`），取值合法。

→ **结论：参数顺序正确，无需改代码**（遵守红线「仅校验不改动」）。

---

## 3. 关键偏差 & 扩范围补全（用户授权）

修复 `vehicle_id` 后复测，发现**第二个独立缺陷**，超出提示词-69 `hse_events`-only 红线：

`GET /api/hse/events/:id` 仍 500，连续暴露两处 `hse_event_timeline` 表 schema 漂移：

1. 首次：`字段 "from_status" 不存在` — 代码/迁移用 `from_status`/`to_status`，DB 旧列为 `status_from`/`status_to`。
2. 次次：`字段 "comment" 不存在` — 代码用 `comment`/`occurred_at`，DB 旧列为 `description`/`timestamp`。

**实勘 canonical 迁移**（`hse_core_v1_migration.sql` L74-84）确认 `hse_event_timeline` 正确列应为：
`id, event_id, action, actor_id, actor_name, from_status, to_status, comment, occurred_at`。

DB 实际列：`id, event_id, timestamp, status_from, status_to, action, actor_id, actor_name, description, created_at` —— 与迁移/代码全面错位（典型「测试脚手架建表 vs 生产迁移」漂移）。

**经用户决策（AskUserQuestion：扩范围补全）**，按「补迁移意图列、不动代码」原则补齐：

```sql
ALTER TABLE hse_event_timeline ADD COLUMN IF NOT EXISTS from_status  VARCHAR(32);
ALTER TABLE hse_event_timeline ADD COLUMN IF NOT EXISTS to_status    VARCHAR(32);
ALTER TABLE hse_event_timeline ADD COLUMN IF NOT EXISTS comment     TEXT;
ALTER TABLE hse_event_timeline ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
```

- ✅ 四列已加；`hse_event_links`（/:id 关联查询的另一张表）经核查列齐全（id/from_event_id/to_event_id/link_type/description），无漂移。
- 旧列 `status_from/status_to/description/timestamp/created_at` **留作废弃列**，待后续清理（用户授权选项明示）。

---

## 4. 验证结果

| 检查项 | 结果 |
|------|:--:|
| B-0 全库备份（D: 盘） | ✅ 2.6 MB |
| C `hse_events.vehicle_id` 列存在 | ✅ bigint |
| C FK（vehicle 表不存在，未建） | ⚠️ 按规则跳过，FK=114 不变 |
| 扩范围 `hse_event_timeline` 四列 | ✅ from_status/to_status/comment/occurred_at |
| `GET /api/hse/events` | ✅ **200**（修复前 500） |
| `GET /api/hse/events/:id` | ✅ **200**（修复前 500） |
| `POST /api/hse/events/sync`（accident） | ✅ **200**（"事件同步成功"，event.vehicle_id=null） |
| `POST /api/hse/events/batch-sync` | ✅ 复用同一 `hseEventSync` 代码路径（已由 /sync 实测证明，未全量跑以避免灌入批量事件行） |
| `/api/health` | ✅ 200 |
| `node --check hseEventSyncService.js` | ✅ 语法 OK |
| FK 总数 | ✅ **114**（无变化） |

> 注：4 个受影响端点全部恢复 200；`batch-sync` 与 `sync` 调用同一底层 `hseEventSync.sync()`，已通过 `/sync` 实测等价验证。

---

## 5. 环境限制（需用户知晓）

- **F: 盘满（0.04 GB）**：`pnpm build` 无法执行，本次以「后端 API 实测 + `node --check`」替代构建验证。需用户清理 F: 盘空间后补做 `pnpm build`。
- **备份落 D: 盘**：因 F: 满，全库备份写入 `D:/_backup_before_fk69_20260730_224735.dump`。

---

## 6. 改动文件清单

| 文件 | 改动 | 类型 |
|------|------|------|
| `server/sql/hse_fix69_events_vehicle_timeline_cols.sql` | **新建**幂等迁移：hse_events.vehicle_id + hse_event_timeline 四列 | DDL |
| `hse_events` | `ADD COLUMN vehicle_id BIGINT` | DDL（已执行） |
| `hse_event_timeline` | `ADD COLUMN from_status/to_status/comment/occurred_at` | DDL（已执行，扩范围） |
| `server/services/hseEventSyncService.js` | **未改动**（任务 D 仅校验，参数顺序正确） | — |
| `server/routes/hse-events.js` | **未改动**（红线「不修改 SELECT 列清单」，补列后自动生效） | — |

---

## 7. 红线遵守

- ✅ 仅操作 `hse_events` / `hse_event_timeline` 表（加列）；`hse_event_timeline` 扩范围为**用户授权**。
- ✅ 未改动 `hseEventSyncService.js` 的 INSERT/SELECT/UPDATE 逻辑（仅校验）。
- ✅ 未改动 `hse-events.js` 的 SELECT 列清单（补列后自动生效）。
- ✅ 未修改其他路由/菜单/组件。
- ✅ 执行前全库备份（D: 盘）。

---

## 8. 后续建议

1. **清理废弃列**：`hse_event_timeline` 的 `status_from/status_to/description/timestamp/created_at` 为漂移旧列，确认无代码引用后择期 DROP。
2. **迁移漂移体检**：本次连续发现 `vehicle_id`、`from_status/to_status/comment/occurred_at` 未落库，建议对 `hse_core_v1_migration.sql` 做全量「声明列 vs 实际列」diff，一次性补齐其余漂移（预防更多 500）。
3. **补 `pnpm build`**：F: 盘清理后跑全量构建，确认无 TS/打包回归。

> 编制：Senior Developer ｜ 关联总总结 `38-DB治理与列表修复-总总结.md` §6 待办项 3

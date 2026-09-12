# 提示词-69：hse_events 表 vehicle_id 列缺失 — 500 修复

> 编号：提示词-69
> 日期：2026-07-30
> 性质：**缺陷修复（P1）** — 预存在 bug，非本次引入
> 前置：提示词-68 执行（写入接线完成，FK 114 条）
> 改动范围：仅数据库（加列 + 建 FK）+ 后端 1 文件（hseEventSyncService UPDATE 修正）

---

## 0. 背景

提示词-66 测试时发现 `GET /api/hse/events` 返回 500，根因是 PostgreSQL 报错 `column "vehicle_id" does not exist`。经实勘确认：

- `hse_events` 表**实际不存在 `vehicle_id` 列**（26 列中无此列）
- `hse_core_v1_migration.sql` L23 声明了 `vehicle_id BIGINT` 和 L38 索引 `idx_hse_events_vehicle`，但迁移未落实到本库
- 代码中多处引用该列，导致 4 个端点受影响

### 受影响端点

| 端点 | 触发条件 | 严重程度 |
|------|------|:--:|
| `GET /api/hse/events` | **始终**（SELECT 列清单含 `vehicle_id`） | 阻断 |
| `GET /api/hse/events/:id` | **始终**（同上） | 阻断 |
| `POST /api/hse/events/sync`（accident） | 事故同步时 INSERT/UPDATE 含 `vehicle_id` | 条件阻断 |
| `POST /api/hse/events/batch-sync`（all/accident） | 同上 | 条件阻断 |

### 代码引用位置

| 文件 | 行号 | 语句 | 内容 |
|------|------|------|------|
| `server/routes/hse-events.js` | L124 | SELECT | 列表查询列清单含 `vehicle_id` |
| `server/routes/hse-events.js` | L161 | SELECT | 详情查询列清单含 `vehicle_id` |
| `server/routes/hse-events.js` | L87-89 | WHERE | 条件过滤 `vehicle_id = $N` |
| `server/services/hseEventSyncService.js` | L218 | UPDATE | `SET vehicle_id = $4` |
| `server/services/hseEventSyncService.js` | L250 | INSERT | 列清单含 `vehicle_id` |

---

## 1. 修复策略

**方案 A（推荐）：补列 + 建 FK**

`hse_core_v1_migration.sql` 已声明该列，原始设计意图就是让 `hse_events` 关联车辆。`hse_events` 当前仅 6 行且 `source_table` 类型无 `accidents`，补列零风险。

```
B-0: 全库备份
B-1: ALTER TABLE ADD COLUMN vehicle_id BIGINT（可空）
B-2: 建 FK → vehicle(id) ON DELETE SET NULL（需确认 vehicle 表存在且有 id 主键）
B-3: 验证 4 个端点恢复 200
B-4: 修正 hseEventSyncService.js UPDATE 语句（vehicle_id 与 personnel_id 参数顺序）
```

**方案 B（不推荐）：删代码引用**

需要改 5 处代码，且事故同步功能会丢失 vehicle 关联能力。不选。

---

## 2. 任务 A：确认 vehicle 表存在

```sql
-- 确认 vehicle 表存在且有 id 主键
SELECT table_name
FROM information_schema.tables
WHERE table_name = 'vehicle' AND table_schema = 'public';

-- 确认 vehicle.id 列类型
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'vehicle' AND column_name = 'id';
```

> 若 vehicle 表不存在 → 仅加列不建 FK，后续单独处理。

---

## 3. 任务 B：全库备份

```bash
pg_dump -h localhost -U hse_app -d hse_dashboard -Fc -f _backup_before_fk69_$(date +%Y%m%d_%H%M%S).dump
```

---

## 4. 任务 C：加列 + 建 FK

```sql
BEGIN;

-- 加列（可空 BIGINT）
ALTER TABLE hse_events ADD COLUMN IF NOT EXISTS vehicle_id BIGINT;

-- 建 FK（若 vehicle 表存在）
-- ALTER TABLE hse_events
--   ADD CONSTRAINT fk_hse_events_vehicle
--   FOREIGN KEY (vehicle_id) REFERENCES vehicle(id)
--   ON DELETE SET NULL;

COMMIT;
```

> 幂等写法 `ADD COLUMN IF NOT EXISTS`，可重跑。

---

## 5. 任务 D：修正 hseEventSyncService.js UPDATE 语句

**文件**：`server/services/hseEventSyncService.js`

当前事故同步 UPDATE（约 L218）：
```sql
UPDATE hse_events
SET title = $1, severity = $2, status = $3,
    vehicle_id = $4, personnel_id = $5, updated_at = NOW()
WHERE source_table = 'accidents' AND source_id = $6
```

**潜在问题**：若 `vehicle_id` 列为 NULL（事故表中无 vehicle 关联），则 `$4` 为 NULL，SET 为 NULL 合法。但需确认传入参数顺序正确——`personnel_id` 应取自事故的 `involved_person_id` 或类似字段。

> 实勘时确认 `$4` 和 `$5` 的实际取值来源，确保 `vehicle_id` 和 `personnel_id` 没有被交换。

---

## 6. 验证清单

- [ ] B-0：全库备份成功
- [ ] C：`vehicle_id` 列存在（`information_schema`）
- [ ] C：FK 创建成功（`pg_constraint` 中 `fk_hse_events_vehicle` 存在）
- [ ] FK 总数：114 → **115**（若 vehicle 表存在）
- [ ] `GET /api/hse/events` → HTTP 200（不再 500）
- [ ] `GET /api/hse/events/:id` → HTTP 200
- [ ] 后端 `/api/health` 正常
- [ ] `node --check` 对 hseEventSyncService.js 通过

---

## 7. 改动范围

| 文件 | 改动 | 类型 |
|------|------|------|
| 数据库 `hse_events` | `ALTER TABLE ADD COLUMN vehicle_id` + FK | DDL |
| `server/services/hseEventSyncService.js` | 确认 UPDATE 参数顺序（~1 行校验） | 后端 |

---

## 8. 红线约束

- 仅操作 `hse_events` 表（加列 + 建 FK）
- 仅校验 `hseEventSyncService.js` 的参数顺序，不改动 INSERT/SELECT 逻辑
- 不修改 `hse-events.js` 的 SELECT 列清单（补列后自动生效）
- 不修改其他路由、菜单、组件

---

> 编制：Senior Developer（高级开发工程师）
> 关联：`38-DB治理与列表修复-总总结.md`（§6 待办项 3）
> 前置：`41-提示词-68-TK03-04-写入接线-执行报告.md`
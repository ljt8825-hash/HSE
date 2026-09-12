# 提示词-66：FK Phase 3 — 列缺失 FK 补建（TK-03/TK-04 收尾）

> 编号：提示词-66
> 日期：2026-07-30
> 性质：**数据完整性加固（P2）**
> 前置：提示词-65 执行（FK 107 条，TK-01/TK-02 已闭环）
> 改动范围：仅数据库（0 业务代码改动）

---

## 0. 背景

`23-FK-Phase2-遗留项治理跟踪.md` 标记了 4 项待办。TK-01/TK-02 已在提示词-65 闭环（53 条测试孤儿删除 + 2 条 FK 补建）。剩余 TK-03/TK-04：

| 编号 | 表 | 列 | 提示词-59 探针结论 | 实勘（schema 文件） |
|------|------|------|------|------|
| TK-03 | `hse_events` | `personnel_id` | 列缺失 | **列存在**（`BIGINT`，可空，有索引 `idx_hse_events_person`） |
| TK-04 | `hse_reviews` | `reviewer_id` | 列缺失 | **列存在**（`BIGINT`，可空，后端 `hazards.js` 已读写） |

> **关键发现**：提示词-59 探针存在误判。两列均已在 `hse_core_v1_migration.sql` 中定义，后端代码正常读写。任务从"加列+回填"降级为"孤儿检查+建 FK"。

---

## 1. 任务 A：实勘确认（只读）

落地前必须用 `information_schema` 核验列存在性，确认探针误判。

```sql
-- 核验 hse_events.personnel_id
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'hse_events' AND column_name = 'personnel_id';

-- 核验 hse_reviews.reviewer_id
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'hse_reviews' AND column_name = 'reviewer_id';
```

**门控**：若两列均存在 → 进入任务 B；若任一列不存在 → 停止，报告偏差。

---

## 2. 任务 B：孤儿审计（只读）

```sql
-- B-1: hse_events.personnel_id 孤儿
SELECT ev.id, ev.event_code, ev.event_type, ev.title, ev.personnel_id
FROM hse_events ev
LEFT JOIN employee e ON e.id = ev.personnel_id
WHERE ev.personnel_id IS NOT NULL
  AND e.id IS NULL
  AND ev.is_deleted = false
ORDER BY ev.occurred_at DESC;

-- B-2: hse_reviews.reviewer_id 孤儿
SELECT rv.id, rv.review_code, rv.reviewer_id, rv.reviewer_name, rv.review_date
FROM hse_reviews rv
LEFT JOIN employee e ON e.id = rv.reviewer_id
WHERE rv.reviewer_id IS NOT NULL
  AND e.id IS NULL
  AND rv.is_deleted = false
ORDER BY rv.review_date DESC;
```

### 孤儿处理策略

| 孤儿特征 | 处理 |
|------|------|
| 孤儿=0 | 直接建 FK |
| 孤儿>0 且目标列可空 | `SET NULL` 后建 FK |
| 孤儿>0 且目标列 NOT NULL | 门控跳过，人工介入 |

---

## 3. 任务 C：全库备份

```bash
pg_dump -h localhost -U hse_app -d hse_dashboard -Fc -f _backup_before_fk66_$(date +%Y%m%d_%H%M%S).dump
```

---

## 4. 任务 D：创建 FK 约束

```sql
DO $$
BEGIN
  -- FK-03: hse_events.personnel_id → employee(id)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_hse_events_personnel'
  ) THEN
    ALTER TABLE hse_events
      ADD CONSTRAINT fk_hse_events_personnel
      FOREIGN KEY (personnel_id) REFERENCES employee(id)
      ON DELETE SET NULL;
    RAISE NOTICE '✅ fk_hse_events_personnel created';
  ELSE
    RAISE NOTICE '⏭ fk_hse_events_personnel already exists';
  END IF;

  -- FK-04: hse_reviews.reviewer_id → employee(id)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_hse_reviews_reviewer'
  ) THEN
    ALTER TABLE hse_reviews
      ADD CONSTRAINT fk_hse_reviews_reviewer
      FOREIGN KEY (reviewer_id) REFERENCES employee(id)
      ON DELETE SET NULL;
    RAISE NOTICE '✅ fk_hse_reviews_reviewer created';
  ELSE
    RAISE NOTICE '⏭ fk_hse_reviews_reviewer already exists';
  END IF;
END $$;
```

> 注意：`ON DELETE SET NULL` 要求目标列可空。若两列均为可空（schema 暗示如此），无需 ALTER COLUMN DROP NOT NULL。

---

## 5. 验证清单

- [ ] A：实勘确认两列均存在
- [ ] B：孤儿计数 = 0（或已 SET NULL 处理）
- [ ] C：全库备份成功
- [ ] D：`pg_constraint` 中 2 条 FK 均存在（`fk_hse_events_personnel` / `fk_hse_reviews_reviewer`）
- [ ] FK 总数：107 → **109**
- [ ] 后端 `/api/health` 正常，DB connected
- [ ] 抽查 `GET /api/hse/events` 返回正常
- [ ] 抽查 `GET /api/hse/hazards`（含 reviews 子查询）返回正常

---

## 6. 改动范围

| 层级 | 改动 | 类型 |
|------|------|------|
| 数据库 | 2 条 ALTER TABLE ADD CONSTRAINT | DDL |
| 业务代码 | 0 改动 | — |

---

## 7. 红线约束

- 仅操作 `hse_events` 和 `hse_reviews` 两张表
- 不修改其他表、业务逻辑、路由、菜单、组件
- 建 FK 前必须确认孤儿=0
- 幂等 `DO $$` 块，可重跑

---

## 8. FK 补全终态

| Phase | 提示词 | 新建 FK | 累计 FK |
|-------|--------|:------:|:------:|
| Phase 2 主体 | 58 | 16 | 17 |
| Phase 1 执行 | 61 | 17 | 105 |
| Phase 2 收尾 | 65 | 2 | 107 |
| Phase 3 列缺失（本次） | **66** | **2** | **109** |

> 目标终态：109 条 FK 约束，TK-01~TK-04 全部闭环。FK 补全工程终结。

---

> 编制：Senior Developer（高级开发工程师）
> 关联：`23-FK-Phase2-遗留项治理跟踪.md`（§5 TK-03/TK-04）
> 前置：`35-提示词-65-执行报告.md`（FK 107 条，TK-01/TK-02 已闭环）
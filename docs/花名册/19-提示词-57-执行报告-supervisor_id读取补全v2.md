# 提示词-57 v2 执行报告：业务模块 supervisor_id 读取补全

> 编号：提示词-57 v2 执行报告
> 日期：2026-07-30
> 性质：功能补全（P2）
> 前置：提示词-56 执行报告（回填策略增强 v1.2 ✅）
> 状态：✅ 已闭环

---

## 1. 执行摘要

根据 v2 实勘修正版提示词，为员工列表、培训模块、三违模块补全 `supervisor_id` 字段读取，并为培训台账页新增"直接上级"展示列。

**实际改动文件：5 个（3 后端 + 2 前端）**，比提示词预估的 4 个多 1 个（实勘发现培训台账页真实数据源 `/ledger` 端点完全无 supervisor JOIN，需补全）。

| 验证项 | 结果 |
|--------|------|
| 后端 4 端点返回 supervisor 字段 | ✅ 全部 HTTP 200 |
| 员工端点非空验证（马金华→张万恒） | ✅ supervisor_id=3866, supervisor_name=张万恒 |
| 前端构建 pnpm build | ✅ 成功（0 TS 错误） |
| 后端 /api/health | ✅ status:ok, database:connected |

---

## 2. 实勘纠正与额外发现

### 2.1 提示词 v2 的实勘纠正（已确认无误）

| 模块 | v1 假设 | v2 实勘结果 | 本次确认 |
|------|---------|------------|---------|
| 事故 | 有活跃路由 | `hse-accidents.ts` 不在白名单 → 移除 | ✅ 确认不在白名单 |
| 培训 | `views/hse/training/index.vue` | 活跃路由 `/training/records` → `views/training/ledger/index.vue` | ✅ 确认 |
| 三违 | `views/hse/violations/index.vue` | 活跃路由 `/site/violation` → `views/violations/index.vue` | ✅ 确认 |
| 员工列表 | `views/hse/employee/index.vue` | ✅ 路径正确 | ✅ 确认 |

### 2.2 额外发现：培训台账页真实数据源

v2 提示词指出培训后端需改 `GET /`（即 `/records` 端点，约 L273）。实勘发现：

- **前端台账页 `views/training/ledger/index.vue` 调用的是 `getLedgerList()` → `GET /training/ledger`**
- `/ledger` 端点由 `createTrainingSubRoute('ledger', null, 'records')` 工厂函数生成（L442-491）
- 该工厂函数的 DB 模式查询使用 `SELECT * FROM training_records`，**完全没有 supervisor JOIN**
- 因此仅改 `/records` 端点无法让台账页显示上级信息

**处理**：同时为 `/ledger` 端点补全 supervisor JOIN + `supervisor_id` + `supervisor_name`，并限定 `whereSql` 表别名避免 `is_deleted` 歧义。

### 2.3 三违模块 snake_case → camelCase 转换

v2 提示词注意事项指出：三违前端使用驼峰 `supervisorName`，后端返回 `supervisor_name`（snake_case）。

实勘确认：violations.js 的 `formatRow` 函数使用 `camelKeys()` 包裹，会自动将 snake_case 键转为 camelCase。因此 `supervisor_name` → `supervisorName`、`supervisor_id` → `supervisorId` 自动转换已就绪，无需额外 alias。

---

## 3. 改动明细

### 3.1 后端：`server/routes/hse-employee.js`

**端点**：`GET /api/hse/employee/employees`（L573-593）

SELECT 增加 `ea_sup.supervisor_id AS supervisor_id`（ea_sup JOIN 已存在）：

```sql
ea_sup.supervisor_id AS supervisor_id,
sup.name AS supervisor_name
```

> 该端点直接返回 `result.rows`（无 formatRow 枚举字段），新增列自动透传。

### 3.2 后端：`server/routes/training.js`

#### 3.2.1 `/records` 端点（L273）

SELECT 增加 `sup.id AS supervisor_id`（ea + sup JOIN 已存在）：

```sql
SELECT tr.*, sup.id AS supervisor_id, sup.name AS supervisor_name
```

#### 3.2.2 `/ledger` 端点（createTrainingSubRoute 工厂函数 L459-488）

**原代码**（无 supervisor JOIN）：
```sql
SELECT * FROM training_records WHERE is_deleted = false ...
```

**改为**（补全 JOIN + 限定表别名）：
```sql
SELECT tr.*, sup.id AS supervisor_id, sup.name AS supervisor_name
FROM training_records tr
LEFT JOIN employee_assignment ea ON tr.employee_id = ea.employee_id
  AND ea.is_primary = true AND ea.is_current = true AND ea.is_deleted = false
LEFT JOIN employee sup ON ea.supervisor_id = sup.id AND sup.is_deleted = false
WHERE tr.is_deleted = false ...
```

> whereSql 全部限定为 `tr.` 前缀，避免 JOIN sup 后 `is_deleted` 歧义。

#### 3.2.3 formatRecordRow（L190）

增加 `supervisorId` 输出（`supervisorName` 已存在）：

```js
supervisorId: row.supervisor_id || null,
supervisorName: row.supervisor_name || null,
```

### 3.3 后端：`server/routes/violations.js`

**端点**：`GET /api/violations`（L351-378）

LATERAL 子查询与外层 SELECT 增加 `emp.supervisor_id`：

```sql
SELECT v.*, emp.supervisor_id, emp.supervisor_name, ...
LEFT JOIN LATERAL (
  SELECT emp.position_name, emp.supervisor_id, emp.supervisor_name
  FROM v_employee_org_full emp
  ...
```

formatRow 增加 `supervisorId`（`supervisorName` 已存在）：

```js
supervisorId: row.supervisor_id || null,
supervisorName: row.supervisor_name || null,
```

> `v_employee_org_full` 视图已含 `supervisor_id` 列（psql 确认）。`camelKeys()` 自动转 camelCase。

### 3.4 前端：`views/training/ledger/index.vue`

columns 增加"直接上级"列（L515 之后）：

```ts
{
  title: '直接上级',
  dataIndex: 'supervisorName',
  key: 'supervisorName',
  width: 100,
  ellipsis: true,
  customRender: ({ record }: any) => record.supervisorName || '-',
},
```

### 3.5 前端：`src/api/hse/training.ts`

`LedgerItem` 接口增加 `supervisorId` + `supervisorName` 可选字段：

```ts
supervisorId?: number | null;
supervisorName?: string | null;
```

---

## 4. 验证结果

### 4.1 后端端点验证

| 端点 | HTTP | 返回字段 | 非空样例 |
|------|------|---------|---------|
| `GET /api/hse/employee/employees` | 200 | `supervisor_id`, `supervisor_name` | 马金华→supervisor_id=3866, supervisor_name=张万恒 |
| `GET /api/training/records` | 200 | `supervisorId`, `supervisorName` | NULL（dev 数据稀疏） |
| `GET /api/training/ledger` | 200 | `supervisorId`, `supervisorName` | NULL（dev 数据稀疏） |
| `GET /api/violations` | 200 | `supervisorId`, `supervisorName` | NULL（违章人姓名在视图中匹配不到） |

> NULL 值为预期行为：当前库仅 1 条 employee_assignment 有 supervisor_id（马金华→张万恒），培训/三违记录的 employee_id/violator_name 大多匹配不到此记录。

### 4.2 前端构建

```
pnpm build → ✅ 成功
ZIP file created: dist.zip (3810488 total bytes)
```

### 4.3 后端健康检查

```json
{"status":"ok","database":{"status":"connected"}}
```

---

## 5. 红线遵守

- ✅ 仅 SELECT 增加字段 + 前端增加展示列，不修改 JOIN 链（/ledger 例外：原无 JOIN 需新增）
- ✅ 不修改路由定义、菜单配置、组件库
- ✅ 不修改数据库表结构
- ✅ 不修改登录相关代码
- ✅ 不修改导入/入库流程
- ✅ 事故模块不修改（路由未激活）
- ✅ 员工列表和三违列表前端不动（列已存在）

---

## 6. v1 → v2 差异说明

| 维度 | v1（已废弃） | v2（本次执行） |
|------|-------------|--------------|
| 事故模块 | 改了 accidents.js | 移除（路由不在白名单） |
| 培训前端 | 改 `views/training/index.vue`（错误路径） | 改 `views/training/ledger/index.vue`（正确路径） |
| 培训后端 | 仅改 `/records` | 改 `/records` + `/ledger` + formatRecordRow |
| 改动文件数 | 7 | 5（3 后端 + 2 前端） |
| supervisor_id | 未输出 | 全部输出 |

> v1 对 accidents.js 的改动（`accidents.is_deleted` 限定、`handlerSupervisorId`/`handlerSupervisorName`）保留不动——该模块虽不在白名单，但后端数据完备不影响运行。

---

## 7. 数据现状

| 数据维度 | 记录数 | 说明 |
|---------|--------|------|
| employee_assignment 有 supervisor_id 的当前主任职 | 1 条 | 马金华(3867)→张万恒(3866) |
| v_employee_org_full 有 supervisor_id | 1 条 | 同上 |
| 培训记录 employee_id 能匹配到 supervisor | 极少 | dev 数据稀疏 |
| 三违记录 violator_name 能匹配到 supervisor | 0/3 | 姓名在视图中匹配不到 |

> supervisor_id 数据稀疏是回填策略（提示词-56）的后续工作，本次仅确保读取链路通畅。

---

## 8. 后续建议

1. **supervisor_id 回填**：当前仅 1 条任职记录有 supervisor_id，建议按提示词-56 回填策略批量补全
2. **三违匹配优化**：三违记录用 violator_name 匹配 v_employee_org_full，命中率低；可考虑用 violator_id（如有）直接 JOIN
3. **dist_stale 清理**：构建过程产生了多个 `dist_stale_*` 目录，建议用户手动清理

---

> 编制：Senior Developer（高级开发工程师）
> 关联：`18-提示词-57-v2-supervisor_id读取补全-实勘修正.md`、`17-提示词-56-执行报告-回填策略增强v1.2.md`

# 提示词 30：R1-Phase1 规格文档 v1.1 修正（代码核验→修正→重新审核）

> 创建日期：2026-07-29
> 前置条件：提示词 29 已完成（R1-Phase1-后端协作需求规格.md 已生成，后端代码已落地）
> 所属阶段：R1 Phase 1 后端协作 — 质量门控
> 用途：基于代码核验结果修正规格文档，修复 4 个 P0 级问题和 3 个 P1 级问题
> 性质：**文档修正 + 后端代码修正**（不修改前端）

---

## 背景

提示词 29 交付了 `R1-Phase1-后端协作需求规格.md`（代码已落地并通过 `node --check` 语法校验）。经代码核验（对 `server/routes/hse-employee.js`、`server/services/employeeEventService.js`、`server/services/wsServer.js`、`server/routes/hazards.js`、`server/routes/accidents.js`、`server/routes/emergency.js`、`server/sql/hse_employee_master_v68_extension.sql`、前端 `types.ts`/`useEmployeeEvent.ts`/`useEmployeeData.ts` 共 9 个文件逐一核实），发现 4 个 P0 级问题和 3 个 P1 级问题，需修正后方可进入灰度部署。

---

## 要求

### 1. 读取所有基线文档

**必须读取的文件**：
- `F:\hse-dashboard\docs\R1-Phase1-后端协作需求规格.md`（本次修正目标）
- `F:\hse-dashboard\安全看板vben\apps\web-antd\src\composables\hse\types.ts`（前端契约 — `EmployeeEventType` 枚举值）
- `F:\hse-dashboard\安全看板vben\apps\web-antd\src\composables\hse\useEmployeeEvent.ts`（前端事件去重键格式）
- `F:\hse-dashboard\安全看板vben\apps\web-antd\src\composables\hse\useEmployeeData.ts`（前端事件订阅使用的类型常量）

**必须探索的现有代码**（用于精确修正）：
- `server/routes/hse-employee.js` — 事件注入点（4 处 type 值）
- `server/routes/hazards.js` — PUT 更新的 checkerId/fixerId 入参解析
- `server/sql/hse_employee_master_v68_extension.sql` — 回填 SQL 和 baselin/registry

### 2. P0-1 修正：前后端事件类型统一加 `EMPLOYEE_` 前缀

**代码核验发现**：

| 位置 | 当前值 | 应改为 |
|------|--------|--------|
| 前端 `types.ts` L29-33 | `EMPLOYEE_TRANSFERRED` / `EMPLOYEE_RESIGNED` / `EMPLOYEE_STATUS_CHANGED` / `EMPLOYEE_INFO_UPDATED` | 不变（前端正确） |
| 前端 `useEmployeeEvent.ts` L68-72 | 同上 | 不变 |
| 前端 `useEmployeeData.ts` L67-71 | 同上 | 不变 |
| **后端 `hse-employee.js` L836** | `INFO_UPDATED` | **`EMPLOYEE_INFO_UPDATED`** |
| **后端 `hse-employee.js` L1438** | `TRANSFERRED` | **`EMPLOYEE_TRANSFERRED`** |
| **后端 `hse-employee.js` L1556** | `RESIGNED` / `STATUS_CHANGED` | **`EMPLOYEE_RESIGNED`** / **`EMPLOYEE_STATUS_CHANGED`** |

**修正要求**：

（A）修改 `server/routes/hse-employee.js` 中 4 处事件注入点的 `type` 值：

- L836 `'INFO_UPDATED'` → `'EMPLOYEE_INFO_UPDATED'`
- L1438 `'TRANSFERRED'` → `'EMPLOYEE_TRANSFERRED'`
- L1556 `'RESIGNED'` → `'EMPLOYEE_RESIGNED'`
- L1556 `'STATUS_CHANGED'` → `'EMPLOYEE_STATUS_CHANGED'`

（B）更新 `R1-Phase1-后端协作需求规格.md` 的以下章节：

- §3.2 事件类型表：`TRANSFERRED` → `EMPLOYEE_TRANSFERRED`，同理改其余 3 个
- §3.4 信封格式示例：`"type": "TRANSFERRED"` → `"type": "EMPLOYEE_TRANSFERRED"`
- §3.4 去重键说明：更新为 `EMPLOYEE_TRANSFERRED:employeeId:occurredAt`
- §5.2 测试用例：所有事件类型值加 `EMPLOYEE_` 前缀
- §七 风险清单：新增一条风险"事件类型命名已与前端 `EmployeeEventType` 对齐，禁止后续修改时去掉前缀"

（C）执行 `node --check server/routes/hse-employee.js` 确认语法通过。

### 3. P0-2 修正：历史回填逻辑改为四级容错策略

**代码核验发现**：`hse_employee_master_v68_extension.sql` L116-158 的回填仅做姓名精确匹配，违反项目硬约束"人员关联必须优先使用员工编号，禁止仅依赖姓名匹配"。

**修正要求**：

（A）修改 `server/sql/hse_employee_master_v68_extension.sql` 的回填 SQL（L116-158），改为四级容错策略：

```
级别 1：从文本字段中提取员工编号（如 "张三(E0001)" → E0001），匹配 employee.employee_code
级别 2：从文本字段中提取纯数字编号，匹配 employee.id
级别 3：TRIM(文本字段) 精确匹配 employee.name
级别 4：模糊匹配（关键字去后缀，如 "张三(安全员)" → 张三）
```

每级回填后记录命中数，生成回填命中率统计。

（B）更新 `R1-Phase1-后端协作需求规格.md` 的 §4.3 历史回填说明，从"按 TRIM(文本姓名) 精确匹配"改为四级容错策略描述。

（C）更新 §七 风险 #3，标注"已从单一姓名匹配升级为四级容错策略，大幅降低重名/不规范姓名导致的回填偏差"。

### 4. P0-3 修正：迁移脚本增加 baseline 和 backup_registry

**代码核验发现**：`hse_employee_master_v68_extension.sql` 缺少 `migration_baseline` 和 `migration_backup_registry` 创建步骤，违反硬约束。

**修正要求**：

（A）在 `hse_employee_master_v68_extension.sql` 开头（DDL 之前）增加：

```sql
-- Step 0: 创建 migration_baseline（记录迁移前状态）
CREATE TABLE IF NOT EXISTS migration_baseline (
  id SERIAL PRIMARY KEY,
  migration_name VARCHAR(200) NOT NULL,
  table_name VARCHAR(200) NOT NULL,
  row_count INTEGER,
  baseline_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(migration_name, table_name)
);

INSERT INTO migration_baseline (migration_name, table_name, row_count)
VALUES
  ('v68_extension', 'hazards', (SELECT COUNT(*) FROM hazards)),
  ('v68_extension', 'accidents', (SELECT COUNT(*) FROM accidents)),
  ('v68_extension', 'emergency_plans', (SELECT COUNT(*) FROM emergency_plans)),
  ('v68_extension', 'employee', (SELECT COUNT(*) FROM employee WHERE is_deleted = false));

-- Step 0.5: 创建 migration_backup_registry（登记备份文件）
CREATE TABLE IF NOT EXISTS migration_backup_registry (
  id SERIAL PRIMARY KEY,
  migration_name VARCHAR(200) NOT NULL,
  backup_file VARCHAR(500) NOT NULL,
  checksum VARCHAR(64),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

（B）在 §4.4 执行顺序中增加 baseline 采集和 registry 登记步骤。

（C）更新 §七 风险清单，新增一条"baseline 和 backup_registry 已嵌入迁移脚本，确保迁移可追溯可回滚"。

### 5. P0-4 修正：WS 推送格式说明补充双层包裹

**代码核验发现**：`wsServer.broadcastNotification` 会在 `employeeEventService` 传入的 `{ type:'EMPLOYEE_EVENT', event }` 外层再包裹 `{ type:'NOTIFICATION', timestamp, payload }`：

- 规格文档描述：`{ type: 'EMPLOYEE_EVENT', event: {...} }`
- 实际推送：`{ type: 'NOTIFICATION', timestamp: ..., payload: { type: 'EMPLOYEE_EVENT', event: {...} } }`

**修正要求**：

（A）更新 §3.1 事件服务描述，补充实际 WS 推送格式说明（双层包裹），明确前端需从 `payload.event` 提取事件信封。

（B）更新 §六 前端切换计划中"缓存刷新"行，补充前端 WS 消息解析逻辑说明。

### 6. P1-1 修正：hazards.js UPDATE 入参兼容性补全

**代码核验发现**：`server/routes/hazards.js` L712-713 的 PUT 更新仅检查 `b.checkerId`，不兼容 `b.checker_id`（POST 在 L617-618 做了兼容）。

**修正要求**：

（A）修改 `server/routes/hazards.js` L712-713：

```js
// 修改前
if (b.checkerId !== undefined) { ... b.checkerId ... }
if (b.fixerId !== undefined) { ... b.fixerId ... }

// 修改后
if (b.checkerId !== undefined || b.checker_id !== undefined) { ... (b.checkerId || b.checker_id) ... }
if (b.fixerId !== undefined || b.fixer_id !== undefined) { ... (b.fixerId || b.fixer_id) ... }
```

（B）更新 `R1-Phase1-后端协作需求规格.md` §4.2 入参兼容说明，补充"UPDATE 入参兼容已与 POST 对齐"。

（C）执行 `node --check server/routes/hazards.js` 确认语法通过。

### 7. P1-2 修正：实施顺序增加 Dry Run 阶段

**修正要求**：更新 §八 实施顺序，在"阶段 0（数据库）"和"阶段 1（后端部署，灰度）"之间插入：

```
阶段 0.5（Dry Run，测试环境）
  ├─ 在测试环境执行完整迁移脚本（含 baseline/registry/DDL/回填/验证）
  ├─ 生成 Dry Run 报告（含各步耗时、影响行数、回填命中率）
  ├─ 复审 Dry Run 报告
  └─ 复审通过后进入阶段 1
```

### 8. P1-3 修正：执行顺序增加锁检查和活跃连接检查

**修正要求**：更新 §4.4 执行顺序，在步骤 1（备份）之前增加：

```bash
# 0) 锁检查和活跃连接检查（必做）
SELECT pid, state, query FROM pg_stat_activity WHERE datname='hse_dashboard' AND state='active';
SELECT relation::regclass, mode, granted FROM pg_locks WHERE relation IN ('hazards'::regclass, 'accidents'::regclass, 'emergency_plans'::regclass, 'employee'::regclass);
```

### 9. 更新规格文档版本号和状态

- 版本号从 `R1-Phase1-v1.0` 升级为 `R1-Phase1-v1.1`
- 状态从"后端实现完成"改为"后端实现完成 + 代码核验修正完成"
- 新增"修正记录"小节，列出 7 项修正内容（P0-1~P0-4 + P1-1~P1-3）

### 10. 生成修正清单

在规格文档末尾新增"附录：v1.1 修正清单"：

| 修正编号 | 级别 | 修正项 | 涉及文件 | 修正内容 |
|----------|------|--------|----------|----------|
| P0-1 | P0 | 事件类型加 EMPLOYEE_ 前缀 | hse-employee.js / 规格文档 | 4 处 type 值修改 |
| P0-2 | P0 | 回填改为四级容错策略 | v68_extension.sql / 规格文档 | 回填 SQL 重写 |
| P0-3 | P0 | 增加 baseline/registry | v68_extension.sql / 规格文档 | 新增 Step 0 |
| P0-4 | P0 | 补充 WS 双层包裹说明 | 规格文档 | 文档修正 |
| P1-1 | P1 | hazards.js UPDATE 入参兼容 | hazards.js / 规格文档 | 2 行代码修改 |
| P1-2 | P1 | 增加 Dry Run 阶段 | 规格文档 | 文档修正 |
| P1-3 | P1 | 增加锁检查/活跃连接检查 | 规格文档 | 文档修正 |

---

## 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `server/routes/hse-employee.js` | 修改 | 4 处事件 type 加 `EMPLOYEE_` 前缀 |
| `server/routes/hazards.js` | 修改 | PUT 入参兼容 snake_case |
| `server/sql/hse_employee_master_v68_extension.sql` | 修改 | 回填改为四级容错 + 增加 baseline/registry |
| `docs/R1-Phase1-后端协作需求规格.md` | 更新 | v1.0 → v1.1，修正全部 7 项 |

## 禁止事项

- 禁止修改前端 Q3/Q4/Q5 代码（前端类型定义已正确，无需改）
- 禁止修改前端路由、菜单、配置
- 禁止修改 `employee-selector.ts`
- 禁止修改基础层（employee_assignment / 只读保护）
- 禁止修改 `employeeEventService.js`（事件服务本身正确，仅注入点 type 值需改）
- 禁止修改 `wsServer.js`（WS 广播逻辑正确）

## 验收标准

- 后端 `hse-employee.js` 4 处事件 type 值与前端 `types.ts` 的 `EmployeeEventType` 完全一致
- `hse_employee_master_v68_extension.sql` 回填 SQL 包含四级容错策略
- `hse_employee_master_v68_extension.sql` 包含 baseline 和 backup_registry 创建
- `hazards.js` UPDATE 入参兼容 camelCase 和 snake_case
- 规格文档 v1.1 包含修正清单
- 所有修改文件通过 `node --check` 语法校验

## 输出格式

- 生成修正报告，保存到 `F:\hse-dashboard\docs\R1-Phase1-修正报告-v1.1.md`
- 报告结构：
  - 一、代码核验过程（9 个文件核验结果）
  - 二、P0 级修正（4 项，含代码 diff）
  - 三、P1 级修正（3 项，含代码 diff）
  - 四、修正前后对比
  - 五、验收确认单
- 修正后的规格文档覆盖写入 `F:\hse-dashboard\docs\R1-Phase1-后端协作需求规格.md`
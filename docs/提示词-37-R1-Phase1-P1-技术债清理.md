# 提示词 37：R1-Phase1 — P1 技术债清理

> 创建日期：2026-07-29
> 前置条件：提示词 36 已完成（R1-Phase1 生产部署，5 级 Gate 全部通过，15 项冒烟测试通过）
> 关联文档：`R1-Phase1-生产放行报告.md`（§残留 P1 问题）、`R1-Phase1-阶段2-前端切换报告.md`（§已知局限 #2/#5）
> 性质：**代码修改**（后端 2 文件 + 前端 2 文件，不涉及路由/菜单/组件库/数据库迁移）

---

## 背景

R1-Phase1 生产部署完成后，放行报告（`R1-Phase1-生产放行报告.md`）和前端切换报告（`R1-Phase1-阶段2-前端切换报告.md`）分别记录了 3 项需后续处理的 P1 技术债：

| 编号 | 问题 | 影响 | 来源 |
|------|------|------|------|
| P1-1 | `ROLE_PERMISSIONS_MAP` 缺 `admin`/`safety_manager` 映射 | `admin`/`safety_manager` 角色通过 `requirePermission` 中间件时降级为 `viewer` 权限，导致 403 Forbidden | 放行报告 §残留 P1 问题 |
| P1-2 | `AccidentItem`/`EmergencyPlan` 接口缺 `handlerId`/`responsiblePersonId` 字段 | 前端 8 处 `as any` 类型断言，破坏 TypeScript 类型安全 | 前端切换报告 §已知局限 #2 |
| P1-3 | `GET /employees/profile/list` 引用视图不存在的 `id_card` 列 | 端点查询失败，报错 `column ev.id_card does not exist` | 前端切换报告 §已知局限 #5 |

---

## 要求

### 1. 读取相关文件

- `F:\hse-dashboard\server\middleware\auth.js`（ROLE_PERMISSIONS_MAP 定义，L225-319）
- `F:\hse-dashboard\安全看板vben\apps\web-antd\src\api\hse\accidents.ts`（AccidentItem 接口，L13-40）
- `F:\hse-dashboard\安全看板vben\apps\web-antd\src\api\hse\emergency.ts`（EmergencyPlan 接口，L6-24）
- `F:\hse-dashboard\server\routes\hse-employee.js`（profile/list 端点，L5730-5798）
- `F:\hse-dashboard\server\sql\sprint5_6_employee_master_migration.sql`（v_employee_current 视图定义，L262-309）

### 2. 红线规则

- 不修改路由定义、菜单配置、组件库
- 不修改数据库结构（无 ALTER、无 migration）
- 不破坏已完成模块的权限边界
- 前端类型增强后，必须移除对应 `as any` 断言并验证 TS 编译通过

---

## 3. 任务 A：P1-1 ROLE_PERMISSIONS_MAP 补全 admin/safety_manager 映射

### 3.1 问题分析

`auth.js` 中 `ROLE_PERMISSIONS_MAP` 当前定义了 5 个角色：`system_admin`、`hse_manager`、`township_manager`、`manager`、`viewer`。但系统中实际存在 `admin` 和 `safety_manager` 两个角色（路由层多处使用 `requireRole('admin', 'safety_manager')` 进行角色校验），这两个角色在 `ROLE_PERMISSIONS_MAP` 中无对应条目。

当 `admin`/`safety_manager` 用户通过 `requirePermission` 中间件访问接口时，`getPermissionsForRole` 找不到匹配条目，回退到 `viewer` 权限（仅含 `hse:overview:view` 等 5 个只读权限），导致本应正常访问的接口返回 403。

**影响范围**（`requireRole` 不受影响，仅 `requirePermission` 受影响）：
- `admin` 角色：P0-2 员工事件触发端点（`POST /employees/events/trigger` 等）→ 403
- `safety_manager` 角色：同上 + 所有需要 `requirePermission` 的接口 → 降级为 viewer

### 3.2 修改方案

文件：`server/middleware/auth.js`

在 `system_admin` 之后、`hse_manager` 之前，新增 `admin` 和 `safety_manager` 两条映射。两者权限集等同于 `hse_manager`（HSE 管理员全模块读写）：

```diff
  const ROLE_PERMISSIONS_MAP = {
    // 系统管理员 — 拥有全部权限
    system_admin: ['*'],

+   // 管理员 — 与 HSE管理员 同等权限（全模块 view + create/update/delete/export/import/freeze）
+   admin: [
+     // 安全总览
+     'hse:overview:view', 'hse:overview:cockpit:view', 'hse:overview:executive:view',
+     'hse:overview:alerts:view', 'hse:overview:notifications:view', 'hse:overview:reports:view',
+     'hse:overview:create', 'hse:overview:update', 'hse:overview:delete', 'hse:overview:export',
+     // 风险管控
+     'hse:risk:view', 'hse:risk:classification:view', 'hse:risk:employee:view',
+     'hse:risk:driver:view', 'hse:risk:accidents:view', 'hse:risk:analysis:view', 'hse:risk:ai:view',
+     'hse:risk:create', 'hse:risk:update', 'hse:risk:delete', 'hse:risk:export', 'hse:risk:import',
+     // 隐患治理
+     'hse:hazard:view', 'hse:hazard:hazards:view', 'hse:hazard:rectification:view',
+     'hse:hazard:warning:view', 'hse:hazard:statistics:view',
+     'hse:hazard:create', 'hse:hazard:update', 'hse:hazard:delete', 'hse:hazard:export', 'hse:hazard:import',
+     // 现场管理
+     'hse:site:view', 'hse:site:violations:view', 'hse:site:grid:view',
+     'hse:site:fire:view', 'hse:site:vehicles:view', 'hse:site:inspection:view',
+     'hse:site:create', 'hse:site:update', 'hse:site:delete', 'hse:site:export', 'hse:site:import', 'hse:site:freeze',
+     // 人员管理
+     'hse:personnel:view', 'hse:personnel:employees:view', 'hse:personnel:organization:view',
+     'hse:personnel:positions:view', 'hse:personnel:insurance:view', 'hse:personnel:overage:view', 'hse:personnel:import:view',
+     'hse:personnel:create', 'hse:personnel:update', 'hse:personnel:delete', 'hse:personnel:export', 'hse:personnel:import',
+     // 培训考核
+     'hse:training:view', 'hse:training:plan:view', 'hse:training:requirements:view',
+     'hse:training:ledger:view', 'hse:training:special:view', 'hse:training:statistics:view',
+     'hse:training:assessment:view', 'hse:training:responsibility:view',
+     'hse:training:create', 'hse:training:update', 'hse:training:delete', 'hse:training:export', 'hse:training:import',
+     // 应急管理
+     'hse:emergency:view', 'hse:emergency:manage:view',
+     'hse:emergency:create', 'hse:emergency:update', 'hse:emergency:delete', 'hse:emergency:export',
+     // 目标职责
+     'hse:objectives:view', 'hse:objectives:responsibility:view', 'hse:objectives:committee:view', 'hse:objectives:budget:view',
+     'hse:objectives:create', 'hse:objectives:update', 'hse:objectives:delete', 'hse:objectives:export',
+     // 制度标准
+     'hse:standards:view', 'hse:standards:regulations:view', 'hse:standards:documents:view',
+     'hse:standards:clauses:view', 'hse:standards:relation:view', 'hse:standards:evaluation:view',
+     'hse:standards:create', 'hse:standards:update', 'hse:standards:delete', 'hse:standards:export', 'hse:standards:import',
+     // 系统管理
+     'hse:system:view', 'hse:system:users:view', 'hse:system:roles:view',
+     'hse:system:audit:view', 'hse:system:workflow:view', 'hse:system:batchimport:view',
+     'hse:system:create', 'hse:system:update', 'hse:system:delete',
+   ],
+
+   // 安全主管 — 与 HSE管理员 同等权限
+   safety_manager: [
+     // 安全总览
+     'hse:overview:view', 'hse:overview:cockpit:view', 'hse:overview:executive:view',
+     'hse:overview:alerts:view', 'hse:overview:notifications:view', 'hse:overview:reports:view',
+     'hse:overview:create', 'hse:overview:update', 'hse:overview:delete', 'hse:overview:export',
+     // 风险管控
+     'hse:risk:view', 'hse:risk:classification:view', 'hse:risk:employee:view',
+     'hse:risk:driver:view', 'hse:risk:accidents:view', 'hse:risk:analysis:view', 'hse:risk:ai:view',
+     'hse:risk:create', 'hse:risk:update', 'hse:risk:delete', 'hse:risk:export', 'hse:risk:import',
+     // 隐患治理
+     'hse:hazard:view', 'hse:hazard:hazards:view', 'hse:hazard:rectification:view',
+     'hse:hazard:warning:view', 'hse:hazard:statistics:view',
+     'hse:hazard:create', 'hse:hazard:update', 'hse:hazard:delete', 'hse:hazard:export', 'hse:hazard:import',
+     // 现场管理
+     'hse:site:view', 'hse:site:violations:view', 'hse:site:grid:view',
+     'hse:site:fire:view', 'hse:site:vehicles:view', 'hse:site:inspection:view',
+     'hse:site:create', 'hse:site:update', 'hse:site:delete', 'hse:site:export', 'hse:site:import', 'hse:site:freeze',
+     // 人员管理
+     'hse:personnel:view', 'hse:personnel:employees:view', 'hse:personnel:organization:view',
+     'hse:personnel:positions:view', 'hse:personnel:insurance:view', 'hse:personnel:overage:view', 'hse:personnel:import:view',
+     'hse:personnel:create', 'hse:personnel:update', 'hse:personnel:delete', 'hse:personnel:export', 'hse:personnel:import',
+     // 培训考核
+     'hse:training:view', 'hse:training:plan:view', 'hse:training:requirements:view',
+     'hse:training:ledger:view', 'hse:training:special:view', 'hse:training:statistics:view',
+     'hse:training:assessment:view', 'hse:training:responsibility:view',
+     'hse:training:create', 'hse:training:update', 'hse:training:delete', 'hse:training:export', 'hse:training:import',
+     // 应急管理
+     'hse:emergency:view', 'hse:emergency:manage:view',
+     'hse:emergency:create', 'hse:emergency:update', 'hse:emergency:delete', 'hse:emergency:export',
+     // 目标职责
+     'hse:objectives:view', 'hse:objectives:responsibility:view', 'hse:objectives:committee:view', 'hse:objectives:budget:view',
+     'hse:objectives:create', 'hse:objectives:update', 'hse:objectives:delete', 'hse:objectives:export',
+     // 制度标准
+     'hse:standards:view', 'hse:standards:regulations:view', 'hse:standards:documents:view',
+     'hse:standards:clauses:view', 'hse:standards:relation:view', 'hse:standards:evaluation:view',
+     'hse:standards:create', 'hse:standards:update', 'hse:standards:delete', 'hse:standards:export', 'hse:standards:import',
+     // 系统管理
+     'hse:system:view', 'hse:system:users:view', 'hse:system:roles:view',
+     'hse:system:audit:view', 'hse:system:workflow:view', 'hse:system:batchimport:view',
+     'hse:system:create', 'hse:system:update', 'hse:system:delete',
+   ],

    // HSE管理员 — 所有HSE模块 view + create/update/delete/export/import/freeze
    hse_manager: [
```

**注意**：由于 `admin` 和 `safety_manager` 的权限列表与 `hse_manager` 完全相同，也可以使用引用方式避免重复定义：

```javascript
// 在 system_admin 之后
admin: ROLE_PERMISSIONS_MAP.hse_manager,
safety_manager: ROLE_PERMISSIONS_MAP.hse_manager,
```

但 JS 对象字面量中不能自引用（`ROLE_PERMISSIONS_MAP` 此时尚未完成赋值），因此需要先定义 `hse_manager` 的权限数组为独立变量，或直接展开（推荐后者，保持可读性）。

### 3.3 验证步骤

```bash
# 1. 语法校验
node --check server/middleware/auth.js

# 2. 验证 getPermissionsForRole 返回正确权限
node -e "
const { getPermissionsForRole } = require('./server/middleware/auth');
console.log('admin:', getPermissionsForRole('admin').length, 'permissions');
console.log('safety_manager:', getPermissionsForRole('safety_manager').length, 'permissions');
console.log('admin has hse:personnel:view:', getPermissionsForRole('admin').includes('hse:personnel:view'));
console.log('safety_manager has hse:emergency:view:', getPermissionsForRole('safety_manager').includes('hse:emergency:view'));
"
```

---

## 4. 任务 B：P1-2 API 类型补全（handlerId / responsiblePersonId）

### 4.1 问题分析

R1-Phase1 P0-3 为事故模块新增 `handler_id` 列、为应急模块新增 `responsible_person_id` 列。后端已正确返回这些字段，但前端 API 类型定义未同步更新：

- `AccidentsApi.AccidentItem` 缺少 `handlerId?: number` 字段
- `EmergencyApi.EmergencyPlan` 缺少 `responsiblePersonId?: number` 字段

导致前端在 8 处使用 `as any` 类型断言来访问这些字段，破坏 TypeScript 类型安全。

### 4.2 修改方案

#### 4.2.1 事故模块 `AccidentItem` 接口增强

文件：`安全看板vben/apps/web-antd/src/api/hse/accidents.ts`

```diff
  export interface AccidentItem {
    id: number;
    title: string;
    description: string;
    level: 'major' | 'serious' | 'general' | 'minor';
    type: 'traffic' | 'occupational' | 'equipment' | 'fire' | 'environmental' | 'other';
    status: 'reported' | 'investigating' | 'processing' | 'closed';
    location: string;
    occurredAt: string;
    reportedAt: string;
    reporter: string;
    casualties: number;
    injuries: number;
    economicLoss: number;
    handler?: string;
+   /** R1-Phase1 P0-3：处理人员 ID（员工编号） */
+   handlerId?: number | null;
    closedAt?: string;
    remark?: string;
    /** 整改期限（天），默认 30 */
    rectificationDeadlineDays?: number;
    /** 时效状态（后端计算返回） */
    expiryStatus?: ExpiryStatus;
    /** 关联隐患 ID（可选） */
    relatedHazardId?: number | null;
    /** 关联应急预案 ID（可选） */
    relatedEmergencyId?: number | null;
    createdAt: string;
    updatedAt: string;
  }
```

#### 4.2.2 应急模块 `EmergencyPlan` 接口增强

文件：`安全看板vben/apps/web-antd/src/api/hse/emergency.ts`

```diff
  export interface EmergencyPlan {
    id: number;
    title: string;
    type: 'fire' | 'traffic' | 'chemical' | 'natural_disaster' | 'equipment' | 'public_health' | 'other';
    level: 'level1' | 'level2' | 'level3' | 'level4';
    status: 'active' | 'inactive' | 'drilling' | 'archived';
    department: string;
    responsiblePerson: string;
+   /** R1-Phase1 P0-3：负责人 ID（员工编号） */
+   responsiblePersonId?: number | null;
    contactPhone: string;
    description: string;
    procedures: string;
    resources: string;
    version: string;
    effectiveDate?: string;
    validityPeriod?: number;
    expiryStatus?: ExpiryStatus;
    updatedAt: string;
    createdAt: string;
  }
```

#### 4.2.3 移除 `as any` 断言

类型补全后，需移除各业务页面中的 `as any` 类型断言：

**accidents/index.vue**（5 处 `as any`）：

| 行号 | 当前代码 | 修改后 |
|------|---------|--------|
| 433 | `(currentAccident as any)?.handlerId` | `currentAccident.handlerId` |
| 434 | `(currentAccident as any)?.handlerId as number` | `currentAccident.handlerId` |
| 1031 | `(record as any).handlerId \|\| null` | `record.handlerId ?? null` |
| 1196-1197 | 注释 + `(data as any).handlerId = ...` | 移除注释，`data.handlerId = ...` |

**emergency/index.vue**（4 处 `as any`）：

| 行号 | 当前代码 | 修改后 |
|------|---------|--------|
| 158 | `(record as any)?.responsiblePersonId` | `record.responsiblePersonId` |
| 494 | `(currentPlan as any)?.responsiblePersonId` | `currentPlan.responsiblePersonId` |
| 1129 | `(record as any).responsiblePersonId \|\| null` | `record.responsiblePersonId ?? null` |
| 1294 | `(data as any).responsiblePersonId = ...` | `data.responsiblePersonId = ...` |

#### 4.2.4 handleSave 中 `data` 类型调整

`accidents/index.vue` 的 `handleSave` 函数中，`data` 声明为 `Partial<AccidentsApi.AccidentItem>`，类型补全后可直接赋值 `handlerId`：

```diff
- const data: Partial<AccidentsApi.AccidentItem> = { ... };
- // R1-Phase1 任务 D：处理人员 ID 通过 as any 透传（AccidentItem 类型尚未声明 handlerId）
- (data as any).handlerId = accidentForm.handlerId;
+ const data: Partial<AccidentsApi.AccidentItem> = {
+   ...,
+   handlerId: accidentForm.handlerId ?? undefined,
+ };
```

`emergency/index.vue` 同理：

```diff
- (data as any).responsiblePersonId = planForm.responsiblePersonId;
+ data.responsiblePersonId = planForm.responsiblePersonId ?? undefined;
```

### 4.3 验证步骤

```bash
# TypeScript 编译检查（前端项目根目录）
cd 安全看板vben
npx vue-tsc --noEmit 2>&1 | grep -E "accidents|emergency" | grep -i "error"
```

预期：零错误输出（无 `Property 'handlerId' does not exist` 或 `Property 'responsiblePersonId' does not exist` 错误）。

---

## 5. 任务 C：P1-3 GET /employees/profile/list 视图缺列修复

### 5.1 问题分析

`hse-employee.js` L5780-5792 的查询从 `v_employee_current` 视图中选取 `ev.phone` 和 `ev.id_card`：

```sql
SELECT ev.employee_id AS id, ev.employee_code, ev.name, ev.gender, ev.age,
       ev.org_unit_id, ev.org_name, ev.org_type, ev.org_code,
       ev.operation_unit_id, ev.unit_name, ev.unit_type,
       ev.position_id, ev.position_name, ev.position_code,
       ev.assignment_status AS status, ev.start_date AS hire_date,
       ev.phone, ev.id_card,   -- ← ev.id_card 不存在于视图中
       ...
FROM v_employee_current ev
```

对照 `v_employee_current` 视图定义（`sprint5_6_employee_master_migration.sql` L262-309），视图包含 `e.phone`（L269）但**不包含** `e.id_card`。因此该端点在生产环境执行时报错：

```
column ev.id_card does not exist
```

### 5.2 修改方案

文件：`server/routes/hse-employee.js`

**方案**：修改 SQL 查询，通过 JOIN `employee` 表补充 `id_card` 字段，同时保留 `phone` 从视图读取（视图已包含）。

```diff
    const result = await pool.query(
-     `SELECT ev.employee_id AS id, ev.employee_code, ev.name, ev.gender, ev.age,
+     `SELECT ev.employee_id AS id, ev.employee_code, ev.name, ev.gender, ev.age,
              ev.org_unit_id, ev.org_name, ev.org_type, ev.org_code,
              ev.operation_unit_id, ev.unit_name, ev.unit_type,
              ev.position_id, ev.position_name, ev.position_code,
              ev.assignment_status AS status, ev.start_date AS hire_date,
-             ev.phone, ev.id_card,
+             ev.phone, e.id_card,
              CASE WHEN ev.position_name ILIKE '%驾驶员%' OR ev.position_name ILIKE '%司机%' THEN true ELSE false END AS is_driver
       FROM v_employee_current ev
+      JOIN employee e ON e.id = ev.employee_id AND e.is_deleted = false
       WHERE ${whereClause}
       ORDER BY ev.assigned_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      params
    );
```

同时更新 COUNT 查询（L5772-5775）使用相同的 JOIN：

```diff
    const countResult = await pool.query(
-     `SELECT COUNT(*)::int AS total FROM v_employee_current ev WHERE ${whereClause}`,
+     `SELECT COUNT(*)::int AS total FROM v_employee_current ev
+      JOIN employee e ON e.id = ev.employee_id AND e.is_deleted = false
+      WHERE ${whereClause}`,
      params
    );
```

**设计理由**：
- 不修改视图定义（避免影响其他 10+ 个视图消费者）
- `employee` 表 JOIN 是等值连接（`e.id = ev.employee_id`），利用主键索引，性能影响可忽略（< 1ms）
- `phone` 保留从视图读取（视图已包含），避免重复 JOIN

### 5.3 验证步骤

```bash
# 1. 语法校验
node --check server/routes/hse-employee.js

# 2. 接口测试（需数据库连接）
curl -s -H "Authorization: Bearer <token>" \
  "http://localhost:3000/api/hse/employee/employees/profile/list?page=1&pageSize=5" \
  | python -m json.tool | head -40

# 预期：返回 200，list 中每条记录包含 id_card 字段
```

---

## 6. 执行顺序

```
任务 A（P1-1） → 任务 C（P1-3） → 任务 B（P1-2）
    ↓                ↓                ↓
 后端 1 文件      后端 1 文件       前端 2 文件 + 2 页面
```

**建议**：A 和 C 可并行（互不依赖，不同文件），B 依赖 A/C 完成后再做（需要后端先验证通过）。

---

## 7. 验证清单

### 7.1 后端验证

- [ ] A-1 `node --check server/middleware/auth.js` 语法通过
- [ ] A-2 `getPermissionsForRole('admin')` 返回 ≥ 50 个权限码
- [ ] A-3 `getPermissionsForRole('safety_manager')` 返回 ≥ 50 个权限码
- [ ] C-1 `node --check server/routes/hse-employee.js` 语法通过
- [ ] C-2 `GET /employees/profile/list?page=1&pageSize=5` 返回 200，含 `id_card` 字段
- [ ] C-3 COUNT 查询返回正确总数（与不加 JOIN 时一致）

### 7.2 前端验证

- [ ] B-1 `npx vue-tsc --noEmit` 零错误（无 `handlerId`/`responsiblePersonId` 类型错误）
- [ ] B-2 accidents/index.vue 中 `as any` 从 5 处减至 1 处（L1147 `newStatus as any` 不属本次范围）
- [ ] B-3 emergency/index.vue 中 `as any` 从 4 处减至 0 处
- [ ] B-4 事故列表/详情/编辑页面 `handlerId` 正常回显
- [ ] B-5 应急列表/详情/编辑页面 `responsiblePersonId` 正常回显

### 7.3 回归验证

- [ ] 事故模块：创建/编辑/删除/详情 无异常
- [ ] 应急模块：创建/编辑/删除/详情 无异常
- [ ] 人员档案列表：分页/搜索/筛选 无异常，id_card 字段正常展示
- [ ] 其他模块菜单/路由/权限未被破坏（快速冒烟）

---

## 8. 风险提示

| 风险 | 等级 | 缓解措施 |
|------|------|---------|
| `admin`/`safety_manager` 权限被过度放宽 | 低 | 两个角色在 `requireRole` 层面已用于 `ai-enhanced.js` 等路由，权限与 `hse_manager` 对齐是合理的 |
| 视图 JOIN 影响查询性能 | 极低 | `employee` 表主键等值 JOIN，索引命中，单次查询 < 1ms 开销 |
| 移除 `as any` 后 TS 编译新增错误 | 低 | 仅在接口定义补全后移除，`vue-tsc` 验证兜底 |

---

> 编制：Senior Developer（高级开发工程师）
> 关联文档：`R1-Phase1-生产放行报告.md`、`R1-Phase1-阶段2-前端切换报告.md`
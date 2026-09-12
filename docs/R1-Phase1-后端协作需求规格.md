# R1 Phase 1 后端协作需求规格

> 版本: R1-Phase1-v1.1
> 生成日期: 2026-07-29（v1.1 修正日期: 2026-07-29）
> 对应提示词: `提示词-29-R1-Phase1后端协作.md` / `提示词-30-R1-Phase1-规格文档v1.1修正.md`
> 状态: 后端实现完成 + 代码核验修正完成（待灰度部署 + 前端切换）
> 依据基线: Q2/Q3/Q4/Q5/Q6 消费层契约 + Sprint-C Phase 1 迁移成果

---

## 一、背景

「花名册为基石」要求隐患、事故、应急等模块以 **员工主数据（employee）** 为唯一可信来源，通过员工 ID 关联责任人，而非在各业务表中冗余存储姓名/部门文本。R1 Phase 1 需后端补齐三项 P0 依赖，打通完整数据链路：

1. **P0-1**：批量按 ID 拉取 `EmployeeInfo` 的端点（替代前端当前 `getEmployeeSelectorBatch` 兜底）。
2. **P0-2**：`EMPLOYEE_*` 事件发布机制（调岗/离职/状态变更/信息更新），供前端实时/轮询刷新缓存。
3. **P0-3**：业务表落库责任人关联员工 ID 字段（`checker_id` / `fixer_id` / `handler_id` / `responsible_person_id`）。

本规格严格遵循「以真实代码为准」红线，所有字段、路由、计数均经代码核验后落地。

**已核验的关键事实：**
- 后端栈：Node.js + Express 4 + PostgreSQL（`pg`），运行时为纯 JS（CommonJS，`node app.js` 直接启动）。
- `hse-employee` 路由挂载于 `/api/hse/employee`（`server/app.js`），前端请求前缀为 `/api/hse/employee`。
- 数据源视图 `v_employee_current` 已提供 `employee_id / employee_code / id_card / phone / org_name AS dept_name / position_name / assignment_status AS org_status`。
- WebSocket 已存在（`server/services/wsServer.js`，路径 `/ws`），`broadcastNotification(notification)` 可复用。
- `emergency_teams.leader_id` 经代码核验**已存在**，不在本次迁移范围（见第四章说明）。
- `decryptMiddleware` 仅解密 `data.data` 中的 snake_case 字段（`id_card`/`phone`），与批量端点 camelCase 输出（`idCard`/`phone`）不匹配，故 P0-1 采用**手动解密**（`decryptFields`）。

---

## 二、P0-1：批量员工查询端点（`getEmployeesByIds`）

### 2.1 路由
| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/api/hse/employee/employees/batch?ids=1,2,3` | 逗号分隔 ID |
| POST | `/api/hse/employee/employees/batch`（body `{ "ids": [1,2,3] }`） | JSON 数组 |

> 路由注册在 `GET /employees/:id` **之前**，避免与 `:id` 数字路由冲突；`/employees/batch` 为非数字路径，Express 顺序匹配优先命中。

### 2.2 返回格式（严格遵循前端 `EmployeeInfo` 契约）
```json
{
  "code": 0,
  "data": [
    {
      "employeeId": 1,
      "employeeCode": "E0001",
      "name": "张三",
      "deptName": "安全环保部",
      "positionName": "安全员",
      "orgStatus": "在职",
      "phone": "138****0000",
      "idCard": "3301**********001X"
    }
  ],
  "message": "查询成功"
}
```
- `data` 直接为 `EmployeeInfo[]`（非分页包装），与前端 `useEmployeeData.getEmployeesByIds` 消费方式一致。
- `phone` / `idCard` 经 `decryptFields` 手动解密后返回明文（字段为空时返回 `''`）。

### 2.3 实现要点（`server/routes/hse-employee.js`）
- **辅助函数**：`parseIdList(input)` — 解析数字数组 / 逗号字符串 / 单个数字 / 空值；去重、校验正整数；非法返回 `null`。
- **查询函数**：`fetchEmployeeInfosByIds(ids)` — `SELECT ... FROM v_employee_current WHERE employee_deleted = false AND employee_id = ANY($1::bigint[])`；逐行 `decryptFields(r, ['id_card','phone'])` 后映射为 camelCase。
- **性能**：单次最多 **200** 个 ID（超出返回 `error(-4)`）；`ANY($1::bigint[])` 走索引，无 N+1。
- **容错**：不存在的 ID 静默跳过（视图 `WHERE` 自然过滤），不报错。
- **权限**：同现有 `GET /employees`（只读，无特殊角色限制，仅 `isConnected()` 检查 + `success()` 包裹）。
- **导入**：`decryptFields` 已从 `../middleware/encryption` 导出引入。

### 2.4 与现有接口的差异
| 项 | `GET /employees`（列表） | `GET /employees/batch`（本次新增） |
|----|--------------------------|-----------------------------------|
| 中间件 | `decryptMiddleware(...ENCRYPT_FIELDS)` | 无（手动 `decryptFields`） |
| 输出 | 分页 `{list,total,...}` | 扁平 `EmployeeInfo[]` |
| 入参 | 分页/关键字 | 指定 ID 集合 |
| 用途 | 列表浏览 | 按 ID 精确回填责任人 |

---

## 三、P0-2：员工事件发布机制（`EMPLOYEE_*`）

### 3.1 事件服务（`server/services/employeeEventService.js`）
- **`publishEmployeeEvent({ type, employeeId, occurredAt, payload, schemaVersion })`**
  - 构建信封：`{ id, type, employeeId, occurredAt, payload, schemaVersion, publishedAt, publishedAtMs }`。
  - 经 `wsServer.broadcastNotification({ type:'EMPLOYEE_EVENT', event })` 实时推送（方案 A）。
  - **WS 双层包裹说明**：`broadcastNotification` 会在传入信封外层再包裹一层 `{ type:'NOTIFICATION', timestamp, payload }`，因此前端实际收到的消息结构为 `{ type:'NOTIFICATION', payload:{ type:'EMPLOYEE_EVENT', event:{...} } }`；前端须从 `payload.event` 提取 `EmployeeEventEnvelope` 信封（而非直接读取顶层 `event`）。
  - 写入内存环形缓冲（上限 1000 条）供轮询兜底（方案 B）。
  - **幂等**：10s 内相同 `(type:employeeId:occurredAt)` 去重，避免重复推送。
  - 发布失败（如 WS 未初始化）被 `try/catch` 吞掉，**绝不影响主业务流程**。
- **`getEventsSince(since)`** — 返回 `publishedAtMs > since` 的信封数组（`since` 为 epoch ms 或 ISO 字符串；空/0/非法返回全部缓冲）。
- **`getLatestPublishedAtMs()`** — 客户端初始化轮询游标用。

### 3.2 事件类型与触发点（注入于 `server/routes/hse-employee.js`）
| 事件类型 | 触发路由 | 触发条件 | payload |
|----------|----------|----------|---------|
| `EMPLOYEE_TRANSFERRED` | `POST /org/assign` | 调岗/入职（新建 employee_assignment） | `{ fromOrgUnitId, toOrgUnitId, fromPositionId, toPositionId, changeReason }` |
| `EMPLOYEE_RESIGNED` | `PUT /org/:id/status` | `status === '离职'` | `{ fromStatus, toStatus }` |
| `EMPLOYEE_STATUS_CHANGED` | `PUT /org/:id/status` | 其他状态（待岗/复岗/退休/返聘） | `{ fromStatus, toStatus }` |
| `EMPLOYEE_INFO_UPDATED` | `PUT /employees/:id` | 姓名/手机/身份证等字段变更 | `{ fields: [...] }` |

> 注入点位于各路由 **COMMIT + auditLog 之后、响应构建之前**，全部包裹 `try/catch`，确保事件发布异常不影响主事务结果。

### 3.3 轮询端点
```
GET /api/hse/employee/events?since=<epoch_ms>
→ { code:0, data:{ events:[...], serverTime:<epoch_ms> }, message }
```
前端可定期轮询（兜底通道），`since` 取上次响应中的 `publishedAtMs` 最大值。

### 3.4 信封格式（与 Q2/Q3 `EmployeeEventEnvelope` 对齐）
```json
{
  "id": 12,
  "type": "EMPLOYEE_TRANSFERRED",
  "employeeId": 5,
  "occurredAt": "2026-07-29T10:00:00.000Z",
  "payload": { "fromOrgUnitId": 3, "toOrgUnitId": 7 },
  "schemaVersion": 1,
  "publishedAt": "2026-07-29T10:00:00.123Z",
  "publishedAtMs": 1753754400123
}
```
前端 `useEmployeeEvent.publishEmployeeEvent` 的本地去重键为 `${type}:${employeeId}:${occurredAt}`，与后端幂等键一致（例如 `EMPLOYEE_TRANSFERRED:5:2026-07-29T10:00:00.000Z`）。

---

## 四、P0-3：业务表落库责任人员工 ID

### 4.1 新增字段
| 表 | 字段 | 类型 | 约束 |
|----|------|------|------|
| `hazards` | `checker_id` | INTEGER | nullable, FK→employee(id) ON DELETE SET NULL |
| `hazards` | `fixer_id` | INTEGER | nullable, FK→employee(id) ON DELETE SET NULL |
| `accidents` | `handler_id` | INTEGER | nullable, FK→employee(id) ON DELETE SET NULL |
| `emergency_plans` | `responsible_person_id` | INTEGER | nullable, FK→employee(id) ON DELETE SET NULL |

> `emergency_teams.leader_id`：经代码核验（`emergency.js` INSERT/UPDATE/`formatTeamRow` 均已存在该列），**不重复迁移**，前端已由 `leaderId` 消费。

### 4.2 后端响应落库（`formatRow` + INSERT + UPDATE）
| 文件 | 改动 |
|------|------|
| `server/routes/hazards.js` | `formatRow` 增加 `checkerId/fixerId`；CREATE 提取 `checkerId/fixerId` 并写入 INSERT（含内存模式记录）；UPDATE `setClauses` 增加 `checker_id/fixer_id`。 |
| `server/routes/accidents.js` | `formatRow` 增加 `handlerId`；INSERT 增加第 28 列 `handler_id`；UPDATE COALESCE 增加 `handler_id = COALESCE($28,...)`（id 顺移至 `$29`）。 |
| `server/routes/emergency.js` | `formatPlanRow` 增加 `responsiblePersonId`；INSERT 增加第 16 列 `responsible_person_id`；UPDATE COALESCE 增加 `responsible_person_id = COALESCE($16,...)`（id 顺移至 `$17`）。 |

入参兼容：`b.checkerId` 与 `b.checker_id`、`b.fixerId` 与 `b.fixer_id` 两种写法均可（`||` 兼容 camel/snake）；**UPDATE 入参兼容已与 POST 对齐**（PUT 更新同样支持 snake_case 写法，见 §七 红线核验）。

### 4.3 数据库迁移脚本
**文件**：`server/sql/hse_employee_master_v68_extension.sql`（遵循 `v67` 增量/可重复执行风格）
- **DDL**：`ADD COLUMN ... INTEGER`（带 `IF NOT EXISTS` 防护）。
- **外键**：`fk_hazards_checker_id` / `fk_hazards_fixer_id` / `fk_accidents_handler_id` / `fk_emergency_plans_resp_person_id`，均 `ON DELETE SET NULL`。
- **索引**：各新列建 `idx_*` 索引（反向按员工查业务记录）。
- **历史回填（四级容错策略）**：业务表原文本字段（checker/fixer/handler/responsible_person）存储人员姓名/编号混合文本。依据项目硬约束「人员关联必须优先使用员工编号」，回填按优先级执行（每级仅填充上一轮仍为 NULL 的行，高优先级优先，仅填充 NULL，可重复执行）：
  1. **级别1**：从文本中提取员工编号（如 `张三(E0001)` / `(E0001)`）→ 匹配 `employee.employee_code`。
  2. **级别2**：从文本中提取纯数字编号（如 `张三(12345)`）→ 匹配 `employee.id`。
  3. **级别3**：`TRIM(文本)` 精确匹配 `employee.name`。
  4. **级别4**：模糊匹配（去除所有括号后缀，如 `张三(安全员)` → `张三`）→ 匹配 `employee.name`。
  - 每级回填后由 `DO $$` 记录命中数（`L1/L2/L3/L4`），迁移结束可统计回填命中率。
  - 级别3/4 为重名/不规范姓名兜底，可能存在偏差；**回填后建议人工抽检命中率**，必要时以导入工具修正。匹配不到的保持 NULL（前端回退显示原姓名文本）。
- **验证**：`DO $$` 输出各列存在性计数 NOTICE。
- **回滚**：文件末尾附**注释版**回滚 SQL（DROP 外键/索引/列），单独执行，不在迁移事务内。

### 4.4 执行顺序（遵循「先备份→DDL→回填→验证→回滚准备」）
```bash
# 0) 锁检查和活跃连接检查（必做，避免迁移阻塞）
SELECT pid, state, query FROM pg_stat_activity WHERE datname='hse_dashboard' AND state='active';
SELECT relation::regclass, mode, granted FROM pg_locks WHERE relation IN ('hazards'::regclass, 'accidents'::regclass, 'emergency_plans'::regclass, 'employee'::regclass);

# 1) 备份（必做，并记录到 migration_backup_registry）
pg_dump ... hse_dashboard > backup_before_v68.sql
# INSERT INTO migration_backup_registry (migration_name, backup_file, checksum)
# VALUES ('v68_extension', 'backup_before_v68.sql', '<sha256>');

# 1.5) baseline 采集（迁移脚本内自动执行 migration_baseline 写入各表迁移前行数，无需手动）
#      如需独立核对：SELECT * FROM migration_baseline WHERE migration_name='v68_extension';

# 2) 执行迁移
psql ... -f server/sql/hse_employee_master_v68_extension.sql

# 3) 验证（查看 NOTICE 计数与回填命中率 L1~L4；抽查）
SELECT COUNT(*) FROM hazards WHERE checker_id IS NOT NULL;
SELECT COUNT(*) FROM accidents WHERE handler_id IS NOT NULL;
-- 核对 baseline：SELECT * FROM migration_baseline WHERE migration_name='v68_extension';

# 4) 回滚准备（仅异常时执行注释块；也可参照 baseline 行数校验回填前后差异）
```

---

## 五、测试用例

### 5.1 P0-1 批量端点
| 用例 | 请求 | 预期 |
|------|------|------|
| 正常批量 | `GET /employees/batch?ids=1,2,3` | 返回 3 条 `EmployeeInfo`，含解密 `phone/idCard` |
| POST 数组 | `POST /employees/batch` `{ids:[1,2]}` | 同 GET |
| 含不存在 ID | `ids=1,99999` | 仅返回存在的 1 条，不报错 |
| 空参数 | `ids=` | 返回空数组 `[]` |
| 超上限 | `ids=` 201 个 | `error(-4)` 提示最多 200 |
| 非法格式 | `ids=abc` | `error(-3)` |
| 单 ID | `ids=5` | 返回 1 条 |
| 解密校验 | 加密库环境下 | `phone/idCard` 为明文，非密文 |

### 5.2 P0-2 事件发布
| 用例 | 操作 | 预期 |
|------|------|------|
| 调岗 | `POST /org/assign` | WS 收到 `EMPLOYEE_EVENT`(EMPLOYEE_TRANSFERRED)；`GET /events?since=` 可查到 |
| 离职 | `PUT /org/:id/status` `{status:'离职'}` | 事件类型为 `EMPLOYEE_RESIGNED` |
| 待岗/复岗 | `PUT /org/:id/status` `{status:'待岗'}` | 事件类型为 `EMPLOYEE_STATUS_CHANGED` |
| 改姓名 | `PUT /employees/:id` `{name:'新名'}` | `EMPLOYEE_INFO_UPDATED`，payload.fields 含 `name` |
| 幂等 | 同一操作 1s 内重复 | 仅发布 1 次（10s 去重窗口） |
| 轮询游标 | 先 `GET /events` 取 `serverTime`，再 `since=serverTime` | 返回该时刻之后的新事件 |
| 主流程隔离 | 事件服务异常 | 业务接口仍正常返回，不影响事务 |

### 5.3 P0-3 字段落库
| 用例 | 操作 | 预期 |
|------|------|------|
| 创建隐患带 ID | `POST /hazards` `{checkerId:5, fixerId:8}` | 响应 `checkerId=5, fixerId=8`；库表列有值 |
| 更新隐患 ID | `PUT /hazards/:id` `{checkerId:9}` | 响应 `checkerId=9` |
| 创建事故带 ID | `POST /accidents` `{handlerId:3}` | 响应 `handlerId=3` |
| 更新预案 ID | `PUT /emergency/plans/:id` `{responsiblePersonId:7}` | 响应 `responsiblePersonId=7` |
| 迁移脚本 | 执行 v68 | 4 列新增；外键/索引存在；历史回填写入 |
| 员工删除级联 | 删除被引用的 employee | 业务表对应 `_id` 置 NULL（SET NULL），记录保留 |
| 回滚 | 执行回滚块 | 4 列及约束均移除，业务恢复正常 |

---

## 六、前端切换计划汇总

| 任务 | 当前前端实现 | 切换目标 | 依赖 |
|------|--------------|----------|------|
| 责任人回填 | `useEmployeeData.getEmployeeSelectorBatch([id])` 兜底（含 `TODO(Q4/Phase1 任务2)`） | 改用 `GET /employees/batch`（`getEmployeesByIds`） | P0-1 |
| 缓存刷新 | 仅事件驱动（Q4 增强） | 订阅 WS（解析双层包裹：从 `payload.event` 提取信封）或轮询 `GET /events`，触发本地缓存失效/刷新 | P0-2 |
| 责任人展示 | 显示 `checker/fixer/handler/responsiblePerson` 文本 | 优先用 `checkerId/fixerId/handlerId/responsiblePersonId` 调 `getEmployeesByIds` 解析姓名/部门 | P0-3 + P0-1 |
| 应急队伍 | 已用 `leaderId`（leader_id 已存在） | 无需切换 | — |

> 前端切换**不在本后端任务范围**（红线：不修改 Q3/Q4/Q5 Composable 与组件、不改路由/菜单/`employee-selector.ts`）。本规格仅提供后端契约与切换指引。

---

## 七、风险与注意事项

1. **WS 模块加载依赖 `JWT_SECRET`**：`wsServer.js` 在模块加载时若读不到 `JWT_SECRET` 会 `process.exit(1)`。`employeeEventService` 引入 `wsServer`，故要求运行环境已配置 `JWT_SECRET`（服务端本就依赖，无新增风险）；`broadcastNotification` 内部 `if(!wss) return` 已做未初始化保护。
2. **内存缓冲非持久**：事件环形缓冲为进程内存，重启即清空；轮询仅兜底，实时性以 WS 为主。长时间离线客户端可能错过事件——需在客户端做「轮询 + 必要时全量 `getEmployeesByIds` 重建缓存」补偿。
3. **历史回填已从单一姓名匹配升级为四级容错策略**：级别1/2 优先员工编号（符合硬约束），级别3 精确姓名，级别4 模糊兜底；大幅降低重名/不规范姓名导致的回填偏差。但级别3/4 仍存在重名歧义，**回填后建议人工抽检命中率**，必要时以导入工具修正。
4. **`decryptMiddleware` 不适用于批量端点**：批量端点手动 `decryptFields`，确保 `idCard/phone` 正确解密；新增类似端点须沿用此模式。
5. **外键 `ON DELETE SET NULL`**：删除员工不会级联删业务记录，但会导致引用置空——符合「花名册为基石」下「人员离职后记录保留、显示回退」预期。
6. **未触碰禁止项**：未修改前端 Q3/Q4/Q5 代码、未改路由/菜单/配置、未改 `employee-selector.ts`、未删 `@deprecated` 死代码、未动 `employee_assignment` 基础层。
7. **`leader_id` 不重复迁移**：已核实 `emergency_teams.leader_id` 存在，避免重复加列导致迁移失败。
8. **事件类型命名已与前端 `EmployeeEventType` 对齐**：v1.1 起 4 类事件统一加 `EMPLOYEE_` 前缀（`EMPLOYEE_TRANSFERRED` / `EMPLOYEE_RESIGNED` / `EMPLOYEE_STATUS_CHANGED` / `EMPLOYEE_INFO_UPDATED`），与前端 `types.ts` 枚举完全一致；**禁止后续修改时去掉前缀**，否则前后端去重键（`${type}:${employeeId}:${occurredAt}`）将失配。
9. **baseline 与 backup_registry 已嵌入迁移脚本**：v68 迁移在 DDL 之前采集 `migration_baseline`（各表迁移前行数）并预留 `migration_backup_registry`（备份文件登记），确保迁移可追溯、可回滚；执行迁移前仍须先全库 `pg_dump` 物理备份。

---

## 八、实施顺序建议

```
阶段 0（数据库）
  ├─ 备份全库
  ├─ 执行 hse_employee_master_v68_extension.sql（DDL+FK+索引+回填+验证）
  └─ 抽查回填命中率，必要时修正

阶段 0.5（Dry Run，测试环境）
  ├─ 在测试环境执行完整迁移脚本（含 baseline/registry/DDL/回填/验证）
  ├─ 生成 Dry Run 报告（含各步耗时、影响行数、回填命中率 L1~L4）
  ├─ 复审 Dry Run 报告（重点：回填命中率是否可接受、是否有异常锁）
  └─ 复审通过后进入阶段 1

阶段 1（后端部署，灰度）
  ├─ 部署含 P0-1 / P0-2 / P0-3 的后端代码
  ├─ 冒烟测试：批量端点、事件发布、字段落库
  └─ 监控 WS 推送与轮询端点

阶段 2（前端切换，独立任务）
  ├─ 将 useEmployeeData 兜底替换为 getEmployeesByIds
  ├─ 接入 WS EMPLOYEE_EVENT / 轮询 /events 做缓存刷新
  └─ 责任人展示优先用 *_Id 反查

阶段 3（回归与收尾）
  ├─ 全链路验证「花名册为基石」显示一致性
  └─ 回填数据质量复盘，更新治理文档
```

## 九、v1.1 修正记录（代码核验 → 修正）

基于提示词 30 的代码核验，对 v1.0 交付进行 7 项修正（4 项 P0 + 3 项 P1），所有修改文件通过 `node --check`：

| 修正编号 | 级别 | 修正项 | 涉及文件 | 修正内容 |
|----------|------|--------|----------|----------|
| P0-1 | P0 | 事件类型加 `EMPLOYEE_` 前缀 | `hse-employee.js` / 规格文档 | 4 处注入点 type 值改为 `EMPLOYEE_TRANSFERRED` / `EMPLOYEE_RESIGNED` / `EMPLOYEE_STATUS_CHANGED` / `EMPLOYEE_INFO_UPDATED`，与前端 `EmployeeEventType` 对齐 |
| P0-2 | P0 | 回填改为四级容错策略 | `v68_extension.sql` / 规格文档 | 回填 SQL 从单一姓名精确匹配重写为四级容错（员工编号→数字ID→精确姓名→模糊去后缀），每级记录命中数 |
| P0-3 | P0 | 增加 baseline / registry | `v68_extension.sql` / 规格文档 | 迁移脚本开头新增 `migration_baseline` + `migration_backup_registry` 采集与登记 |
| P0-4 | P0 | 补充 WS 双层包裹说明 | 规格文档 | §3.1 / §六 明确前端从 `payload.event` 提取信封 |
| P1-1 | P1 | hazards.js UPDATE 入参兼容 | `hazards.js` / 规格文档 | PUT 更新 `setClauses` 兼容 `b.checker_id` / `b.fixer_id`（与 POST 对齐） |
| P1-2 | P1 | 增加 Dry Run 阶段 | 规格文档 | §八 阶段 0/1 之间插入阶段 0.5（测试环境 Dry Run + 复审） |
| P1-3 | P1 | 增加锁检查 / 活跃连接检查 | 规格文档 | §4.4 备份前增加 `pg_stat_activity` / `pg_locks` 检查 |

> 红线遵守：未修改前端 Q3/Q4/Q5 / 路由菜单 / `employee-selector.ts` / `employee_assignment` 基础层；未修改 `employeeEventService.js` 与 `wsServer.js`（事件服务与 WS 广播逻辑本身正确，仅注入点 type 值修正）。

## 附录：v1.1 修正清单

| 修正编号 | 级别 | 修正项 | 涉及文件 | 修正内容 |
|----------|------|--------|----------|----------|
| P0-1 | P0 | 事件类型加 EMPLOYEE_ 前缀 | hse-employee.js / 规格文档 | 4 处 type 值修改 |
| P0-2 | P0 | 回填改为四级容错策略 | v68_extension.sql / 规格文档 | 回填 SQL 重写 |
| P0-3 | P0 | 增加 baseline/registry | v68_extension.sql / 规格文档 | 新增 Step 0 |
| P0-4 | P0 | 补充 WS 双层包裹说明 | 规格文档 | 文档修正 |
| P1-1 | P1 | hazards.js UPDATE 入参兼容 | hazards.js / 规格文档 | 2 行代码修改 |
| P1-2 | P1 | 增加 Dry Run 阶段 | 规格文档 | 文档修正 |
| P1-3 | P1 | 增加锁检查/活跃连接检查 | 规格文档 | 文档修正 |

> 后端三项 P0 任务现已全部落地并通过语法校验（`node --check` 全部通过）。代码改动文件：
> - `server/routes/hse-employee.js`（P0-1 端点 + P0-2 事件注入 + 轮询端点）
> - `server/services/employeeEventService.js`（P0-2 新增）
> - `server/routes/hazards.js` / `accidents.js` / `emergency.js`（P0-3 字段落库）
> - `server/sql/hse_employee_master_v68_extension.sql`（P0-3 迁移）

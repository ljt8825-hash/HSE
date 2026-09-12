# 提示词 29：R1 — Phase 1 后端协作任务（Sprint-Q 依赖项）

> 创建日期：2026-07-29
> 前置条件：Sprint-Q 消费层前端建设完成（Q6 终态报告），Q1-Q5 全部交付物就位
> 所属阶段：Phase 1 后端协作（Sprint-Q → 生产就绪的最后拼图）
> 用途：实现 Sprint-Q 消费层前端依赖的 3 个 P0 后端任务，打通「花名册为基石」的完整数据链路
> 性质：**后端实现任务**（新增 API 端点 + 数据库迁移 + 事件发布），不修改前端 Q3/Q4/Q5 已完成的 Composable 和组件

---

## 任务：实现 Phase 1 后端协作 3 项 P0 任务

### 背景

Sprint-Q 消费层已将前端基础全部就位（Q3 4 个 Composable、Q4 EmployeeSelector 增强、Q5 事件系统 + 依赖声明），但以下 3 项 P0 后端依赖尚未落地，导致前端能力无法完整发挥：

| 依赖项 | 前端对应 | 当前状态 | 影响范围 |
|--------|----------|----------|----------|
| `getEmployeesByIds` 批量端点 | `useEmployeeData`（Q3） | 前端用 `getEmployeeSelectorBatch` 兜底，orgStatus/phone/idCard 为空 | 姓名显示不完整、无法做状态过滤 |
| `EMPLOYEE_*` 事件发布 | `useEmployeeEvent`（Q3+Q5） | 前端骨架已就位，无真实事件触发缓存刷新 | 调岗/离职后快照不自动过期 |
| 新 `*Id` 字段落库 | Q4 误用修复（checkerId/fixerId 等） | 前端已接入，后端未返回，以 `as any` 兜底 | 人员选择器数据不持久化 |

### 要求

#### 1. 读取所有基线文档

**必须读取的文件**：
- `F:\hse-dashboard\docs\Q6-Sprint-Q消费层终态报告.md`（§七 残留问题清单、§九 下一步建议）
- `F:\hse-dashboard\docs\Q2-消费层跨模块交互标准设计.md`（§5.1 API 规范、§5.2 批量端点、§2.2 事件规范）
- `F:\hse-dashboard\docs\Q3-公共Composable实现报告.md`（了解 `useEmployeeData` 兜底策略和 TODO 标注）
- `F:\hse-dashboard\docs\Q4-EmployeeSelector增强报告.md`（§五 已知局限）
- `F:\hse-dashboard\docs\Q5-模块间联动事件系统报告.md`（§六 已知局限）

**必须探索的现有代码**：
- `apps/web-antd/src/composables/hse/useEmployeeData.ts`（了解 `getEmployeeSelectorBatch` 兜底调用方式和 TODO 标注位置）
- `apps/web-antd/src/composables/hse/useEmployeeEvent.ts`（了解 `publishEmployeeEvent` 接口，后端事件需转发至此）
- `apps/web-antd/src/composables/hse/types.ts`（了解 `EmployeeInfo` 完整字段和 `EmployeeEventEnvelope` 格式）
- `apps/web-antd/src/api/hse/employee.ts`（了解现有 `EmployeeItem` 结构和 `getEmployeeList` 接口）
- `apps/web-antd/src/api/hse/employee-selector.ts`（了解 `SelectorItem` 结构和 `getEmployeeSelectorList` 接口）
- `server/routes/hse-employee.js`（了解现有后端路由和 employee 数据处理逻辑）

#### 2. P0-1：实现 `getEmployeesByIds` 批量端点

**需求来源**：Q2 §5.2、Q1 P2-4、Q3 报告 TODO

**后端要求**：
- **路由**：`GET /api/hse/employee/employees/batch?ids=1,2,3`（或 `POST /api/hse/employee/employees/batch` body `{ ids: [1,2,3] }`）
- **返回格式**：`EmployeeInfo[]`，包含完整字段：

```ts
interface EmployeeInfo {
  employeeId: number;      // 主键，映射 employee.id
  employeeCode: string;    // 员工编号
  name: string;            // 姓名
  deptName: string;        // 部门名称
  positionName: string;    // 岗位名称
  orgStatus: string;       // 在职/离职/待岗/退休/返聘
  phone?: string;          // 联系电话
  idCard?: string;         // 身份证号
}
```

- **数据源**：从 `employee` + `employee_assignment` 联表查询，与 `employee-assignment` 统一数据模型一致
- **性能**：支持单次最多 200 个 ID，使用 `WHERE id IN (...)` 批量查询
- **容错**：不存在的 ID 静默跳过（不报错），返回存在的记录
- **权限**：与现有 `GET /api/hse/employee/employees` 一致

**前端联动**（本次任务不修改前端，仅记录供后续）：
- 替换 `useEmployeeData.ts` 中 `getEmployeeSelectorBatch` 兜底为 `getEmployeesByIds`
- 移除 `// TODO(Q4 / Phase 1 任务 2)` 注释
- `mapSelectorToInfo` 改为 `mapEmployeeToInfo`，补全 `orgStatus/phone/idCard`

#### 3. P0-2：实现 `EMPLOYEE_*` 事件发布机制

**需求来源**：Q2 §2、Q5 报告 §六、Q6 报告 §六

**事件类型**（Q2 §2.1）：

| 事件 | 触发时机 | 携带数据 |
|------|----------|----------|
| `EMPLOYEE_TRANSFERRED` | 员工调岗（assignOrg 成功） | `employeeId, oldOrgId, newOrgId, oldPosition, newPosition, effectiveDate` |
| `EMPLOYEE_RESIGNED` | 员工离职（org_status→离职） | `employeeId, resignDate, lastWorkingDay` |
| `EMPLOYEE_STATUS_CHANGED` | 状态变更（停薪留职/返岗等） | `employeeId, oldStatus, newStatus, effectiveDate` |
| `EMPLOYEE_INFO_UPDATED` | 基础信息变更（姓名/身份证/联系方式） | `employeeId, changedFields[], newValues[]` |

**发布方案（二选一，推荐方案 A）**：

**方案 A（推荐）：WebSocket**
- 后端在 `assignOrg` / 状态变更 / 信息更新事务提交后，通过 WebSocket 向已连接的前端客户端推送 JSON 事件
- 事件格式严格遵循 Q3 `types.ts` 中的 `EmployeeEventEnvelope` 接口
- 前端 `useEmployeeEvent` 的 `publishEmployeeEvent` 接收 WebSocket 消息后转发到进程内总线
- 需要新增 WebSocket 路由（如 `/ws/hse/employee-events`）

**方案 B：轮询**
- 后端新增 `GET /api/hse/employee/events?since={ISO8601}` 端点
- 返回 `since` 之后发生的事件列表
- 前端每 30 秒轮询一次，调用 `publishEmployeeEvent` 转发

**事件数据格式**（严格遵循 Q2 §2.2）：
```json
{
  "type": "EMPLOYEE_TRANSFERRED",
  "employeeId": 1234,
  "occurredAt": "2026-07-29T10:30:00.000Z",
  "payload": {
    "oldOrgId": 10,
    "newOrgId": 20,
    "oldPosition": "安全员",
    "newPosition": "安全主管",
    "effectiveDate": "2026-08-01"
  },
  "schemaVersion": 1
}
```

**幂等性**：后端保证同一事件（同 type+employeeId+occurredAt）不重复发布；前端 `publishEmployeeEvent` 已有 `dedupKeys` Set 去重。

**前端联动**（本次任务不修改前端，仅记录供后续）：
- 在 `App.vue` 或 `main.ts` 中建立 WebSocket 连接，收到事件后调用 `publishEmployeeEvent`
- 或启动轮询定时器，调用 `publishEmployeeEvent` 转发

#### 4. P0-3：落库新 `*Id` 字段

**需求来源**：Q4 报告 §五、Q6 报告 §七

**需要新增的数据库字段**：

| 表 | 新字段 | 类型 | 说明 | 前端对应 |
|----|--------|------|------|----------|
| `hazard` | `checker_id` | INT | 检查人员 ID | `hazards/index.vue` checkerId |
| `hazard` | `fixer_id` | INT | 整改人员 ID | `hazards/index.vue` fixerId |
| `accident` | `handler_id` | INT | 处理人员 ID | `accidents/index.vue` handlerId |
| `emergency_plan` | `responsible_person_id` | INT | 负责人 ID | `emergency/index.vue` responsiblePersonId |
| `emergency_team` | `leader_id` | INT | 队长 ID | `emergency/teams/index.vue` leaderId |

**要求**：
- 所有新字段为 **nullable INT**，默认值 NULL
- 添加外键约束（可选，建议软约束）指向 `employee.id`
- 新字段需在对应的后端 API 响应中返回（当前前端以 `as any` 兜底读取）
- **历史数据回填**：对已有记录，根据 `checker`/`fixer`/`handler`/`responsiblePerson`/`leader_name` 文本字段反查 `employee` 表匹配 `employee_id`，回填到新字段（注意：文本匹配可能存在多义性，需生成回填报告标注无法匹配的记录）

**数据库迁移脚本要求**：
- 生成 `ALTER TABLE` DDL，包含 `IF NOT EXISTS` 或等效检查
- 生成回填 SQL（UPDATE...SET...WHERE...子查询匹配）
- 生成回滚 SQL（DROP COLUMN）
- 在迁移前备份相关表

**前端联动**（本次任务不修改前端，仅记录供后续）：
- 后端返回新字段后，前端 `as any` 兜底自动生效
- Phase 1 完成后可移除 `as any` 类型断言，改为正式类型声明

#### 5. 生成 Phase 1 后端协作需求规格文档

汇总以上 3 项 P0 任务的完整需求规格，生成文档，包含：

**5.1 接口规格**（每个端点：Method/Path/Request/Response/错误码）

**5.2 数据库变更**（DDL + 回填 SQL + 回滚 SQL）

**5.3 事件发布方案**（WebSocket 路由设计 或 轮询端点设计）

**5.4 测试用例**（至少 3 个：批量查询正常/空/超限，事件发布/订阅，新字段 CRUD）

**5.5 前端切换计划**（Phase 1 完成后前端需修改的文件清单和改动描述）

**5.6 风险与注意事项**（Q2 §8 R6 事件依赖后端、R1 标识符统一、文本匹配回填多义性）

### 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `server/routes/hse-employee.js` | 修改 | 新增 `GET /employees/batch` 端点 |
| `server/routes/hse-employee.js` | 修改 | 新增 `GET /events` 端点（方案 B）或新增 WebSocket 路由 |
| `server/routes/hse-hazard.js` | 修改 | 响应增加 `checker_id`/`fixer_id` 字段 |
| `server/routes/hse-accident.js` | 修改 | 响应增加 `handler_id` 字段 |
| `server/routes/hse-emergency.js` | 修改 | 响应增加 `responsible_person_id`/`leader_id` 字段 |
| `db/migrations/` | 新增 | 5 字段 DDL + 回填 SQL + 回滚 SQL |

### 禁止事项

- 禁止修改前端 Q3/Q4/Q5 已完成的 Composable 和组件（仅记录后续切换计划，不实际修改）
- 禁止修改前端路由、菜单、配置
- 禁止修改 `employee-selector.ts`（选择器 API）
- 禁止修改基础层（employee_assignment / 只读保护）
- 禁止删除 `@deprecated` 标注的死代码（待 Phase 1 确认后单独处理）
- 数据库迁移必须遵循项目约束：先备份 → DDL → 回填 → 验证 → 回滚准备

### 验收标准

- `GET /api/hse/employee/employees/batch?ids=1,2,3` 返回完整 `EmployeeInfo`（含 orgStatus/phone/idCard）
- 事件发布机制可工作（WebSocket 连接成功 或 轮询端点返回事件列表）
- 5 个新 `*Id` 字段在对应 API 响应中返回
- 历史数据回填脚本可执行，生成回填报告
- 所有变更通过项目约束中的迁移检查流程（锁检查、活跃连接检查、schema 版本确认）

### 输出格式

- 生成 Markdown 文档，保存到 `F:\hse-dashboard\docs\R1-Phase1-后端协作需求规格.md`
- 文档结构：
  - 一、背景与范围（Sprint-Q 前端依赖全景）
  - 二、P0-1 getEmployeesByIds 批量端点（接口规格 + 实现要点 + 前端切换计划）
  - 三、P0-2 EMPLOYEE_* 事件发布（方案对比 + 推荐方案详细设计 + 前端接入计划）
  - 四、P0-3 新 *Id 字段落库（DDL + 回填 SQL + 回滚 SQL + 前端切换计划）
  - 五、测试用例（3+ 用例覆盖核心路径）
  - 六、前端切换计划汇总（Phase 1 完成后前端需修改的文件清单）
  - 七、风险与注意事项（R6 事件可靠性、R1 标识符统一、文本匹配回填多义性）
  - 八、实施顺序建议（P0-3 → P0-1 → P0-2，先落库再批量查询最后事件发布）
# 提示词 35：R1-Phase1 阶段 3 — 回归验证与治理收尾

> 创建日期：2026-07-29
> 前置条件：提示词 34 已完成（前端切换报告 + 代码已落地，7 任务全部实施）
> 所属阶段：R1 Phase 1 后端协作 — 阶段 3 回归与收尾
> 用途：全链路回归验证 + 残留问题处理 + 生成 R1-Phase1 终态报告
> 性质：**纯验证 + 文档生成**（不修改代码）

---

## 背景

R1-Phase1 三个阶段已全部完成：

| 阶段 | 产出 | 状态 |
|------|------|------|
| 阶段 0.5 | Dry Run R2 执行报告 + 缺陷修复报告 | ✅ 门控 = Go |
| 阶段 1 | 灰度部署放行确认单 | ✅ 放行 = Go |
| 阶段 2 | 前端切换报告（7 项任务 + 10 文件修改） | ✅ 代码已落地 |

「以花名册为基石打通各模块交互」的完整数据链路（后端 P0-1/P0-2/P0-3 + 前端消费层切换）已编码完成。当前进入阶段 3：**回归验证与治理收尾**。

---

## 要求

### 1. 读取所有基线文档

**必须读取**：
- `F:\hse-dashboard\docs\R1-Phase1-后端协作需求规格.md`（v1.1，§八 实施顺序、§六 前端切换计划）
- `F:\hse-dashboard\docs\R1-Phase1-阶段2-前端切换报告.md`（§已知局限 5 项、§后续建议 5 项）
- `F:\hse-dashboard\docs\R1-Phase1-阶段1-灰度部署放行确认单.md`（§二 前置条件处理、§七 最终放行确认）
- `F:\hse-dashboard\docs\R1-Phase1-DryRun-R2执行报告.md`（§三 回填命中率统计、§六 门控决策）
- `F:\hse-dashboard\docs\R1-Phase1-缺陷修复报告.md`（§二 关键发现、§三 修复清单）
- `F:\hse-dashboard\docs\Q6-Sprint-Q消费层终态报告.md`（了解 Sprint-Q 终态）

### 2. 读取关键源代码（验证数据链路完整性）

**后端**：
- `F:\hse-dashboard\server\routes\hse-employee.js`（P0-1 批量端点 + P0-2 事件注入）
- `F:\hse-dashboard\server\routes\hazards.js`（P0-3 checker_id/fixer_id）
- `F:\hse-dashboard\server\routes\accidents.js`（P0-3 handler_id）
- `F:\hse-dashboard\server\routes\emergency.js`（P0-3 responsible_person_id）
- `F:\hse-dashboard\server\services\employeeEventService.js`（P0-2 事件服务）
- `F:\hse-dashboard\server\sql\hse_employee_master_v68_extension.sql`（P0-3 迁移脚本）

**前端**：
- `F:\hse-dashboard\安全看板vben\apps\web-antd\src\api\hse\employee.ts`（getEmployeesByIds）
- `F:\hse-dashboard\安全看板vben\apps\web-antd\src\composables\hse\useEmployeeData.ts`（切换后）
- `F:\hse-dashboard\安全看板vben\apps\web-antd\src\composables\hse\types.ts`（mapEmployeeItemToInfo）
- `F:\hse-dashboard\安全看板vben\apps\web-antd\src\components\hse\useHseWebSocket.ts`（WS 事件接入）
- `F:\hse-dashboard\安全看板vben\apps\web-antd\src\views\hazards\index.vue`（切换后）
- `F:\hse-dashboard\安全看板vben\apps\web-antd\src\views\accidents\index.vue`（切换后）
- `F:\hse-dashboard\安全看板vben\apps\web-antd\src\views\emergency\index.vue`（切换后）

---

## 3. 任务 A：全链路数据一致性验证

以「花名册为基石」的完整数据链路，从源到端逐段验证：

### 链路 1：花名册 → 批量端点 → 前端 EmployeeName

```
employee 表（id/name/id_card/phone）
  → v_employee_current 视图（employee_id/name/...）
  → GET /api/hse/employee/employees/batch?ids=5360（P0-1 批量端点）
  → getEmployeesByIds([5360])（API 层）
  → mapEmployeeItemToInfo（映射层）
  → EmployeeInfo { employeeId, name, orgStatus, phone, idCard }（类型层）
  → EmployeeName 组件（展示层：可点击链接 + Tooltip 卡片）
```

**验证项**：
- [ ] 后端 `GET /employees/batch` 返回的 `id_card` 已解密为明文
- [ ] 后端返回的 `org_status` 为真实值（非空字符串）
- [ ] 前端 `mapEmployeeItemToInfo` 映射 `id → employeeId`、`dept_name → deptName`、`org_status → orgStatus` 正确
- [ ] `EmployeeName` 组件渲染姓名 + Tooltip 卡片（姓名/部门/岗位/状态）

### 链路 2：花名册变更 → WS 事件 → 前端缓存刷新

```
hse-employee.js PUT /employees/:id / POST /org/assign
  → employeeEventService.publishEmployeeEvent（环形缓冲 + 10s 去重）
  → wsServer.broadcastNotification（WS 广播）
  → useHseWebSocket.onmessage（解析 NOTIFICATION → EMPLOYEE_EVENT）
  → publishEmployeeEvent(event)（进程内事件总线）
  → useEmployeeData 订阅者（缓存失效 + refresh）
  → EmployeeName / 列表自动刷新
```

**验证项**：
- [ ] 后端事件 `type` 带 `EMPLOYEE_` 前缀（4 类全部）
- [ ] 后端 10s 幂等去重生效
- [ ] 前端 `useHseWebSocket` 解析双层包裹正确（`raw.payload.event`）
- [ ] 前端 `publishEmployeeEvent` 收到事件后 `useEmployeeData` 缓存失效
- [ ] 前端 `try/catch` 隔离，异常事件不阻断 WS 消息流

### 链路 3：隐患模块 — checkerId/fixerId 落库 → 展示

```
POST /api/hazards { checkerId:5360, fixerId:5361 }
  → hazards.js INSERT checker_id/fixer_id
  → 外键 fk_hazards_checker_id 约束生效
  → hazards/index.vue 编辑回填 checkerId/fixerId
  → 详情 EmployeeName 展示检查人员/整改人员
```

**验证项**：
- [ ] 后端 hazards 表 `checker_id`/`fixer_id` 列存在
- [ ] 后端 INSERT/UPDATE 正确写入 `checker_id`/`fixer_id`
- [ ] 后端外键约束（非法员工 ID 报错）
- [ ] 后端 `formatRow` 返回 `checkerId`/`fixerId`（camelCase）
- [ ] 前端表单 `EmployeeSelector` 绑定 `checkerId`/`fixerId` 正常
- [ ] 前端详情 `EmployeeName` 展示 checker/fixer（有 ID 时）或文本兜底

### 链路 4：事故模块 — handlerId 落库 → 展示

```
POST /api/accidents { handlerId:5360 }
  → accidents.js INSERT handler_id
  → 外键 fk_accidents_handler_id 约束生效
  → accidents/index.vue 表单 handlerId + EmployeeSelector
  → 详情 EmployeeName 展示处理人员
```

**验证项**：
- [ ] 后端 accidents 表 `handler_id` 列存在
- [ ] 后端 INSERT/UPDATE 正确写入 `handler_id`
- [ ] 后端 `formatRow` 返回 `handlerId`（camelCase）
- [ ] 前端表单新增 `handlerId` 字段 + `EmployeeSelector`
- [ ] 前端 `onHandlerChange` 同步姓名到 `handler` 文本字段
- [ ] 前端详情 `EmployeeName` 展示处理人员

### 链路 5：应急模块 — responsiblePersonId 落库 → 展示

```
POST /api/emergency/plans { responsiblePersonId:5360 }
  → emergency.js INSERT responsible_person_id
  → 外键 fk_emergency_plans_resp_person_id 约束生效
  → emergency/index.vue 表格列 bodyCell EmployeeName
  → 表单校验 responsiblePersonId（ID 校验替代文本校验）
```

**验证项**：
- [ ] 后端 emergency_plans 表 `responsible_person_id` 列存在
- [ ] 后端 INSERT/UPDATE 正确写入 `responsible_person_id`
- [ ] 后端 `formatPlanRow` 返回 `responsiblePersonId`（camelCase）
- [ ] 前端表格列 `#bodyCell` 渲染 `EmployeeName`（有 ID 时）或文本兜底
- [ ] 前端表单校验从 `responsiblePerson`（文本）改为 `responsiblePersonId`（ID）

---

## 4. 任务 B：处理 5 项已知局限

对前端切换报告 §已知局限 逐项确认处理方式：

| # | 局限 | 当前状态 | 处理方式 | 优先级 |
|---|------|----------|----------|--------|
| 1 | `/hse/employee/:id` 主档案路由未就绪 | `useEmployeeLink.openProfile` 仍跳 `risk-profile` | 标注为「待 Q2 §8 R5 主档案页开发」，不阻塞 R1 收尾 | P2 |
| 2 | `handlerId`/`responsiblePersonId` 仍以 `as any` 透传 | 类型未声明，移除会破坏 TS 编译 | 建议独立任务补类型（API 接口定义），标注为「待 P1 类型补全」 | P1 |
| 3 | accidents `reporter` 仍为纯文本 Input | 后端 `reporter` 无对应 ID 字段 | 标注为「待后端 reporter_id 字段支持后切换」，当前保持现状 | P2 |
| 4 | 前端未实现 WS 轮询兜底 | WS 已就绪，优先 WS 方案 | 标注为「WS 可用时无需轮询；若生产 WS 不稳定，按 提示词-34 §5.3 增加 30s 轮询」 | P2 |
| 5 | 阶段 1 前置条件「独立测试库重跑」仍依赖 | 仅 Dry Run R2（development 库）验证 | 标注为「生产前必做，属阶段 1 放行前置，非阶段 3 范围」 | 🔴 生产前 |

---

## 5. 任务 C：回填数据质量复盘

### 5.1 回填命中率统计（基于 Dry Run R2 数据）

| 列 | 候选数 | L1(编号) | L2(数字ID) | L3(姓名) | L4(模糊) | 总命中率 | 根因 |
|----|--------|----------|-----------|----------|----------|----------|------|
| hazards.checker_id | 122 | 0 | 0 | 0 | 0 | 0% | 源文本为占位符（`??`）/多人员拼接 |
| hazards.fixer_id | 70 | 0 | 0 | 0 | 0 | 0% | 同上 |
| accidents.handler_id | 0 | 0 | 0 | 0 | 0 | N/A | 源文本为空 |
| emergency_plans.responsible_person_id | 0 | 0 | 0 | 0 | 0 | N/A | 表为空 |

### 5.2 影响评估

- **生产环境预期**：若生产库业务表与 Dry Run 测试库格式一致（占位符/多人员拼接），回填命中率仍为 0%
- **前端兜底**：所有 `*Id` 为 NULL 时，前端 `v-else` 文本兜底显示 `checker`/`fixer`/`handler`/`responsiblePerson` 原始文本，**功能不中断**
- **新数据**：创建/编辑时通过 `EmployeeSelector` 选择人员，`*Id` 正确写入，后续回显走 `EmployeeName` 正常
- **建议**：v1.2 增强回填策略（按 `、` 拆分多人员、模糊匹配前缀），或通过导入工具批量修正

### 5.3 回填覆盖率建议

| 场景 | 建议 |
|------|------|
| 新数据（创建/编辑） | 已通过 `EmployeeSelector` 保证 `*Id` 正确写入，覆盖率 100% |
| 旧数据（历史记录） | 保持文本兜底，逐步通过导入工具修正；v1.2 增强回填策略 |
| 生产迁移 | 记录回填命中率到 `migration_baseline`，作为基线 |

---

## 6. 任务 D：R1-Phase1 终态报告

生成一份完整的 R1-Phase1 终态报告，包含：

### 6.1 交付物清单

| 类别 | 交付物 | 文件 |
|------|--------|------|
| 需求规格 | R1-Phase1 后端协作需求规格 v1.1 | `docs/R1-Phase1-后端协作需求规格.md` |
| 后端代码 | P0-1 批量端点 | `server/routes/hse-employee.js` |
| 后端代码 | P0-2 事件服务 | `server/services/employeeEventService.js` |
| 后端代码 | P0-3 字段落库 | `server/routes/hazards.js` / `accidents.js` / `emergency.js` |
| 数据库 | P0-3 迁移脚本 | `server/sql/hse_employee_master_v68_extension.sql` |
| 前端代码 | API 层 | `apps/web-antd/src/api/hse/employee.ts`（getEmployeesByIds） |
| 前端代码 | Composable 切换 | `apps/web-antd/src/composables/hse/useEmployeeData.ts` / `types.ts` |
| 前端代码 | WS 事件接入 | `apps/web-antd/src/components/hse/useHseWebSocket.ts` |
| 前端代码 | 业务页面切换 | `views/hazards/` / `accidents/` / `emergency/index.vue` |
| 前端代码 | 单元测试 | `composables/hse/__tests__/useEmployeeData.test.ts` |
| 测试报告 | Dry Run R2 执行报告 | `docs/R1-Phase1-DryRun-R2执行报告.md` |
| 测试报告 | 缺陷修复报告 | `docs/R1-Phase1-缺陷修复报告.md` |
| 部署文档 | 灰度部署放行确认单 | `docs/R1-Phase1-阶段1-灰度部署放行确认单.md` |
| 切换报告 | 前端切换报告 | `docs/R1-Phase1-阶段2-前端切换报告.md` |

### 6.2 门控状态

| 门控 | 状态 | 说明 |
|------|------|------|
| Dry Run R2 | 🟢 Go | 5 项修复落地，P0-1/P0-2/P0-3 冒烟通过 |
| 阶段 1 灰度部署 | 🟢 Go | 4 项前置条件已明确，步骤 0 独立测试库重跑为生产前必做 |
| 阶段 2 前端切换 | 🟢 Go | 7 项任务全部实施，单元测试 4/4 通过 |
| 阶段 3 回归验证 | 🟡 待执行 | 5 条链路验证 + 5 项局限处理（本次） |

### 6.3 全序列交付总结

| 序列 | 轮次 | 性质 | 关键产出 |
|------|------|------|----------|
| Sprint-Q | Q1→Q6（6 轮） | 前端消费层建设 | 4 个 Composable + EmployeeSelector 增强 + 事件系统 + 终态报告 |
| R1-Phase1 | 提示词 29→35（7 轮） | 后端协作 + 前端切换 | 批量端点 + 事件发布 + 字段落库 + 前端切换 + 回归收尾 |

**总计**：Sprint-Q 6 轮 + R1-Phase1 7 轮 = **13 轮**，实现「花名册为基石」的完整数据链路（前端 + 后端 + 数据库 + 事件系统）。

---

## 7. 任务 E：Sprint-Q + R1 全序列收尾声明

生成收尾声明，包含：

1. **完成声明**：Sprint-Q 消费层前端建设 + R1-Phase1 后端协作 + 前端切换，全部完成
2. **数据链路完整性确认**：花名册（employee）→ 批量端点（P0-1）→ 事件系统（P0-2）→ 业务表外键（P0-3）→ 前端消费层（Composable + EmployeeSelector + EmployeeName），5 段链路全部打通
3. **残留问题清单**：
   - 🔴 生产前必做：独立测试库重跑迁移 + Dry Run（阶段 1 前置条件 #4）
   - 🟡 P1 建议：API 类型补全（handlerId/responsiblePersonId）、profile/list 视图缺列修复、ROLE_PERMISSIONS_MAP 补全
   - 🟢 P2 后续：主档案路由、reporter EmployeeSelector、WS 轮询兜底、回填策略增强
4. **治理关闭声明**：R1-Phase1 文档治理阶段完成，所有产出物已归档，后续转入执行阶段（生产部署）

---

## 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `docs/R1-Phase1-终态报告.md` | 新增 | R1-Phase1 完整交付物清单 + 门控状态 + 全序列总结 |

---

## 禁止事项

- 禁止修改任何代码文件（后端 + 前端 + SQL）
- 禁止执行任何数据库操作
- 禁止修改已有文档（仅读取引用）
- 禁止代签任何角色

---

## 验收标准

- 5 条数据链路逐段验证完成（含验证项勾选）
- 5 项已知局限逐项确认处理方式 + 优先级
- 回填数据质量复盘完成（含命中率统计 + 影响评估 + 建议）
- 终态报告包含完整交付物清单（至少 15 项）
- 全序列收尾声明完整（完成声明 + 数据链路完整性 + 残留问题 + 治理关闭）

---

## 输出格式

- 生成 Markdown 终态报告，保存到 `F:\hse-dashboard\docs\R1-Phase1-终态报告.md`
- 文档结构：
  - 执行摘要（R1-Phase1 三阶段一览）
  - 任务 A：全链路数据一致性验证（5 条链路 × 逐段验证项）
  - 任务 B：5 项已知局限处理（表格 + 优先级）
  - 任务 C：回填数据质量复盘（命中率 + 影响评估 + 建议）
  - 任务 D：交付物清单（至少 15 项，分类列示）
  - 任务 E：Sprint-Q + R1 全序列收尾声明
  - 门控状态总览（4 级门控）
  - 残留问题清单（按优先级 P0/P1/P2）
  - 后续建议（至少 5 项）

---

> 编制：Senior Developer（高级开发工程师）
> 关联文档：`R1-Phase1-后端协作需求规格.md`（v1.1）、`R1-Phase1-阶段2-前端切换报告.md`、`R1-Phase1-阶段1-灰度部署放行确认单.md`、`R1-Phase1-DryRun-R2执行报告.md`、`Q6-Sprint-Q消费层终态报告.md`
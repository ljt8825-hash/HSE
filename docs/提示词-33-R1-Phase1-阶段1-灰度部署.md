# 提示词 33：R1-Phase1 阶段 1 — 灰度部署准备与生产放行检查清单

> 创建日期：2026-07-29
> 前置条件：提示词 32 已完成（缺陷修复 + Dry Run R2 门控 = Go）
> 所属阶段：R1 Phase 1 后端协作 — 阶段 1 灰度部署
> 用途：生成灰度部署检查清单，确认 4 项前置条件处理状态，为生产放行提供最终确认
> 性质：**文档生成 + 检查清单**（不修改代码，仅做部署准备和门控确认）

---

## 背景

Dry Run R2 门控结论为 Go，4 项前置条件已明确。当前进入阶段 1（灰度部署），需在部署前完成以下准备：

1. 确认所有代码变更已就绪且通过语法校验
2. 处理 Dry Run R2 报告的 4 项前置条件
3. 生成灰度部署检查清单和执行步骤
4. 为阶段 2（前端切换）提供切换指引

**涉及文件**（已修改，待部署）：
- `server/routes/hse-employee.js` — Fix #1/#2/#3（批量端点 JOIN + 列表端点 JOIN + 空字符串）
- `server/sql/hse_employee_master_v68_extension.sql` — Fix #4/#5（ON CONFLICT + EXCEPTION 事务分离）
- `server/routes/hazards.js` — P0-3 字段落库（v1.1 已修正）
- `server/routes/accidents.js` — P0-3 字段落库
- `server/routes/emergency.js` — P0-3 字段落库
- `server/services/employeeEventService.js` — P0-2 事件服务（未修改，随行部署）

---

## 要求

### 1. 读取所有基线文档

**必须读取**：
- `F:\hse-dashboard\docs\R1-Phase1-DryRun-R2执行报告.md`（门控决策 + 4 项前置条件）
- `F:\hse-dashboard\docs\R1-Phase1-缺陷修复报告.md`（5 项修复明细 + 残留问题）
- `F:\hse-dashboard\docs\R1-Phase1-后端协作需求规格.md`（v1.1，§六 前端切换计划、§八 实施顺序）

### 2. 任务 A：生成灰度部署代码变更清单

汇总所有待部署文件的变更摘要，生成一目了然的部署清单：

| 文件 | 变更类型 | 变更摘要 | 影响范围 |
|------|----------|----------|----------|
| `server/routes/hse-employee.js` | 修改 | Fix #1: `fetchEmployeeInfosByIds` JOIN employee；Fix #2: 列表端点 JOIN employee；Fix #3: `parseIdList` 空串处理 | P0-1 批量端点 + 列表端点 |
| `server/sql/hse_employee_master_v68_extension.sql` | 修改 | Fix #4: ON CONFLICT DO NOTHING；Fix #5: Step 0/0.5 独立 DO 块 | 迁移脚本幂等性 |
| `server/routes/hazards.js` | 修改 | P0-3: checker_id/fixer_id 落库 + PUT 入参兼容 | 隐患模块 |
| `server/routes/accidents.js` | 修改 | P0-3: handler_id 落库 | 事故模块 |
| `server/routes/emergency.js` | 修改 | P0-3: responsible_person_id 落库 | 应急模块 |
| `server/services/employeeEventService.js` | 新增 | P0-2: 事件发布服务 | 事件系统 |

并执行 `node --check` 对所有修改的 JS 文件做语法校验，记录结果。

### 3. 任务 B：处理 4 项前置条件

对 Dry Run R2 报告的 4 项前置条件逐项确认：

| # | 前置条件 | 处理方式 | 状态 |
|---|----------|----------|------|
| 1 | 回填 0% 作为已知风险随行 | 标注为"已知风险，前端文本兜底，不阻塞"；记录到部署检查清单 | 确认 |
| 2 | 补齐 `ROLE_PERMISSIONS_MAP` 的 `admin`/`safety_manager` 映射 | 标注为"预存在问题，非 R1-P0 引入，建议独立任务修复"；**不阻塞放行**（P0-2 轮询通道已验证，实时 API 触发需此修复） | 建议 |
| 3 | 修复 `GET /employees/profile/list` 视图缺列 | 标注为"预存在问题，超出提示词-32 范围，建议独立任务"；**不阻塞放行**（不影响 P0-1/P0-2/P0-3） | 建议 |
| 4 | 生产等价独立测试库重跑迁移 + Dry Run | **关键前置条件**：当前 Dry Run 在本地 `development` 库执行，生产前必须在独立测试库重跑。记录为"阶段 1 灰度步骤之一" | 必须 |

**对于前置条件 #4**，生成独立测试库重跑步骤：
- 确认测试库 schema 与生产一致
- 执行迁移脚本（已修复的官方脚本）
- 执行 P0-1/P0-2/P0-3 冒烟测试
- 记录回填命中率
- 确认门控 Go

### 4. 任务 C：生成灰度部署执行步骤

按规格文档 §八 阶段 1 要求，生成具体执行步骤：

```
阶段 1（灰度部署）

步骤 1：部署前检查
  ├─ 确认所有代码变更已提交（git status 检查）
  ├─ 确认 node --check 全部通过
  ├─ 确认数据库备份已完成（pg_dump）
  ├─ 确认锁检查无异常（pg_stat_activity / pg_locks）
  └─ 确认 schema 版本（当前 v68 已执行）

步骤 2：数据库迁移
  ├─ 在灰度环境执行 hse_employee_master_v68_extension.sql
  ├─ 记录 baseline 行数、回填 L1~L4 命中数
  └─ 验证 DDL/FK/索引/列存在性

步骤 3：后端代码部署
  ├─ 部署修改后的后端代码（hse-employee.js / hazards.js / accidents.js / emergency.js）
  ├─ 重启后端服务（pm2 restart 或等效）
  └─ 确认服务正常启动（健康检查端点）

步骤 4：冒烟测试
  ├─ P0-1：批量端点 5 用例（含 idCard 明文、空参数、200 上限）
  ├─ P0-2：轮询端点 + 事件信封格式验证
  ├─ P0-3：字段落库 CRUD + 外键约束验证
  └─ 附带验证：GET /employees 列表端点正常返回

步骤 5：监控
  ├─ 监控 WS 推送（如有 WS 客户端）
  ├─ 监控轮询端点 /events 可访问
  └─ 监控错误日志（无新增异常）
```

### 5. 任务 D：生成阶段 2 前端切换预检清单

按规格文档 §六 前端切换计划，生成前端切换预检清单（为阶段 2 做准备，本次不执行）：

| 任务 | 当前状态 | 切换目标 | 涉及文件（预估） |
|------|----------|----------|-----------------|
| 责任人回填 | `useEmployeeData.getEmployeeSelectorBatch` 兜底 | 改用 `getEmployeesByIds`（`GET /employees/batch`） | `useEmployeeData.ts` |
| 缓存刷新 | 仅事件驱动 | 订阅 WS 或轮询 `/events` | `useEmployeeEvent.ts` / `App.vue` |
| 责任人展示 | 文本兜底 | 优先用 `*Id` 调 `getEmployeesByIds` | hazards/accidents/emergency 页面 |
| 应急队伍 | 已用 `leaderId` | 无需切换 | — |

并标注前端切换的注意事项：
- 事件类型必须使用 `EMPLOYEE_` 前缀（与后端 v1.1 对齐）
- WS 消息需从 `payload.event` 提取信封（双层包裹）
- 移除 `useEmployeeData.ts` 中的 `TODO(Q4/Phase1 任务2)` 注释

### 6. 任务 E：生成最终放行确认单

汇总以上全部内容，生成一份「R1-Phase1 阶段 1 灰度部署放行确认单」，包含：

- 代码变更清单（已确认）
- 语法校验结果（全部通过）
- 前置条件处理状态（4 项）
- 灰度部署步骤（5 步）
- 冒烟测试用例（至少 11 个）
- 回滚预案（迁移脚本回滚 SQL + 代码回滚方式）
- 阶段 2 前端切换预检清单
- 最终 Go/No-Go 签认

---

## 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `docs/R1-Phase1-阶段1-灰度部署放行确认单.md` | 新增 | 灰度部署检查清单 + 执行步骤 + 放行确认 |

## 禁止事项

- 禁止修改任何代码文件（本次为纯文档生成）
- 禁止在生产环境执行任何操作
- 禁止修改前端代码
- 禁止修改 `v_employee_current` 视图定义

## 验收标准

- 放行确认单包含完整的代码变更清单（6 个文件）
- 4 项前置条件逐项确认（含处理方式和状态）
- 灰度部署步骤完整（5 步，含具体命令）
- 阶段 2 前端切换预检清单完整（4 项任务 + 注意事项）
- 回滚预案明确
- 最终 Go/No-Go 签认

## 输出格式

- 生成放行确认单，保存到 `F:\hse-dashboard\docs\R1-Phase1-阶段1-灰度部署放行确认单.md`
- 结构：六段式（代码变更清单 → 前置条件处理 → 灰度部署步骤 → 冒烟用例 → 回滚预案 → 阶段 2 预检 → 最终签认）
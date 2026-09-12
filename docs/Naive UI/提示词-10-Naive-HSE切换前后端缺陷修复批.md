# 提示词-10-Naive-HSE切换前后端缺陷修复批（隐患提醒/分析列名）

> 任务来源：`阶段09-终验-审核.md` 结论「通过（附 1 处修复范围勘误）」；用户已拍板：**授权修复后端缺陷（含勘误）**、**演示数据暂不注入**（等生产数据初始化后按 §2.6 补测）。
> 批次性质：**阶段 10 —— 后端整改批**（本批为授权例外，允许改 `server/`；非前端迁移）。
> 执行环境：后端 `server/`（`:5800`）；web-naive / web-antd 前端**零改动**。

---

## 一、任务目标

修复 `server/routes/hazards.js` 隐患提醒/分析三端点的「列名缺陷」（`v_employee_current` 视图无 `id`/`department`/`position` 列），使三端点在**任何数据状态**下返回 `code:0` 而非「字段不存在」报错；修复后重启后端并做只读验证。

---

## 二、Part 1 —— 后端缺陷修复（已授权，含勘误范围）

### 2.1 根因（审核已核实，勿改视图）

- `v_employee_current` 视图（`server/sql/_93_view_hardening_run.sql:7-43`）对外列为 **`employee_id`**（`e.id AS employee_id`，L9）、`name`（L11）、`org_name`（L20）、`position_name`（L29）；**无 `id`、无 `department`、无 `position`**。
- `hazards.js` 三端点误用 `e.id`；`responsible-overdue` 另误用 `e.department`/`e.position`。

### 2.2 修复清单（精确到行，共 5 行 / 9 处列引用）

> 仅改 `hazards.js`，**不动 SQL / 视图 / 其他路由**。

| 行 | 现状（错误） | 改为 |
|---|---|---|
| 1020 | `LEFT JOIN v_employee_current e ON h.responsible_id = e.id` | `... = e.employee_id` |
| 1047 | `LEFT JOIN v_employee_current e ON h.responsible_id = e.id` | `... = e.employee_id` |
| 1102 | `SELECT e.id AS responsible_id, e.name AS responsible_name, e.department, e.position,` | `SELECT e.employee_id AS responsible_id, e.name AS responsible_name, e.org_name AS department, e.position_name AS position,` |
| 1107 | `LEFT JOIN v_employee_current e ON h.responsible_id = e.id` | `... = e.employee_id` |
| 1109 | `GROUP BY e.id, e.name, e.department, e.position` | `GROUP BY e.employee_id, e.name, e.org_name, e.position_name` |

### 2.3 契约保全（关键约束，勿改前端）

- `e.department` → **`e.org_name AS department`**、`e.position` → **`e.position_name AS position`**：别名兜住前端期望字段。前端 `views/hazards/index.vue` L793-798 表格列依赖 `responsibleName/department/position/totalHazards/closedHazards/overdueHazards`（camel 后），别名后字段名不变，**前端零改动**。
- `e.name` 在视图真实存在，三端点 `e.name AS responsible_name` **不改**。

---

## 三、Part 2 —— 修复后只读验证

1. **重启后端**（授权范围内），使改动生效。
2. **三端点契约探针**（复用 `_verify/09` 的 admin 自签 token）：
   - `GET /api/hazards/reminders/high-risk` → 期望 `{code:0, data:{list:[]}}`（原 `code:-1`「字段 e.id 不存在」消失）；
   - `GET /api/hazards/reminders/overdue` → 期望 `{code:0, data:{list:[]}}`；
   - `GET /api/hazards/analysis/responsible-overdue` → 期望 `{code:0, data:{list:[]}}`（原「字段 e.department 不存在」消失）。
3. 若存在后端单测涉及 hazards（`server/__tests__/`），跑相关用例确认无回归；无则跳过并以探针为准。
4. **验证边界说明**：当前隐患数据 `total:0`，故验证结论为「**报错消除（code:0）**」；JOIN 取值的**正确性**（责任人工号/姓名/部门/岗位是否准确回显）留待生产数据初始化后按 §2.6 清单补测（本批不注入演示数据）。

---

## 四、Part 3 —— 遗留项重申（不实施）

- **演示数据注入**：用户已决定**暂不注入**；§2.6「生产数据初始化后补测」清单沿用为切换验收项，本批仅重申、不改。
- **运行时验证缺口**：详情抽屉 3 tabs + 整改流转 4 操作往返的端到端验证依旧**未闭环**（无数据），待生产数据后补。

---

## 五、本批不实施

- 不改 `web-naive` / `web-antd` 前端、不改 SQL/视图、不改 `package.json`/锁文件。
- 不注入演示数据、不写任何业务数据。
- 不改 `hazards.js` 其余端点（仅 §2.2 五个表的行）。

---

## 六、红线

1. 修复**仅限 §2.2 表内 5 行**，不得顺带重构/改其它 SQL、改接口出入参语义、改状态流。
2. 别名须**一字不差**按 §2.3（`org_name AS department`、`position_name AS position`），否则前端契约破坏。
3. 重启后端后如探针仍 `code:-1`，**STOP** 并回贴报错脚本与关键日志，不得反复盲试。

---

## 七、交付物

1. `docs/Naive UI/_verify/10/`：三端点修复后探针结果（code:0 证据）、改动行的 diff 摘要、后端单测结果（如有）。
2. `阶段10-后端缺陷修复-执行总结.md`：修复清单逐行核查 + 探针验证 + 红线合规声明 + 遗留项（演示数据不注入、运行时验证缺口待生产数据）。
3. 完成后 **STOP**，静候 Codex 审核。
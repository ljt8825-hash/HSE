# R1-Phase1 P1 · 视图缺列兄弟端点修复报告

> **任务来源**：`docs/提示词-38-R1-Phase1-P1-视图缺列兄弟端点修复.md`
> **修复日期**：2026-07-29
> **唯一改动文件**：`server/routes/hse-employee.js`
> **修复人**：Senior Developer（高级开发工程师）
> **结论**：3 个引用 `v_employee_current` 缺列（`ev.*`）的端点已全部改写为直连基表 + JOIN，实测 6 个端点（3 修复 + 3 回归）均返回 **HTTP 200**，返回字段与前端契约一致。

---

## 1. 背景与根因

生产库 `v_employee_current` 视图**实际仅含 10 列**：
`employee_id, employee_code, name, assignment_status, is_current, hire_date, org_name, org_type, position_name, is_driver`。

原实现中，以下 3 个端点用 `FROM v_employee_current ev` 并通过 `ev.*` / `ev.org_unit_id` / `ev.position_id` 等取列——这些列在该视图中**不存在**，导致端点查询直接抛 `字段 ev.xxx 不存在` 而 500。

| 端点 | 原 SQL 位置 | 原缺陷 |
|------|------------|--------|
| `GET /employees/profile/:id` | `currentResult`（原 L5842-5850） | `LEFT JOIN v_employee_current ev` + `ev.*` |
| `GET /over-age/auto-list` | `countResult` / 主查询（原 L6144-6165） | `LEFT JOIN v_employee_current` 取 `ev.org_unit_id`/`ev.position_id` |
| `GET /over-age/auto/:id` | `orgResult`（原 L6254-6261） | `LEFT JOIN v_employee_current ev` + `ev.*` |

修复策略（与提示词一致）：将视图引用替换为 `employee_assignment ea` 直连，并 `LEFT JOIN` 基表 `hse_org_unit` / `hse_operation_unit` / `position` / `employee`(supervisor)，取真实存在的列。

---

## 2. 修复明细

### 2.1 任务 A — `GET /employees/profile/:id`

**文件/位置**：`server/routes/hse-employee.js` L5843-5856（`currentResult`）

**After（修复后 SQL 核心）**：
```sql
SELECT ea.org_unit_id, ou.org_name, ou.org_type, ou.org_code, ou.org_path,
       ea.operation_unit_id, opu.unit_name, opu.unit_type, opu.unit_code,
       ea.position_id, p.name AS position_name, p.position_code, p.risk_level,
       ea.supervisor_id, sup.name AS supervisor_name,
       ea.status AS assignment_status, ea.start_date, ea.end_date
FROM employee_assignment ea
LEFT JOIN hse_org_unit ou      ON ou.id = ea.org_unit_id   AND ou.is_deleted = false
LEFT JOIN hse_operation_unit opu ON opu.id = ea.operation_unit_id AND opu.is_deleted = false
LEFT JOIN position p           ON p.id = ea.position_id    AND p.is_deleted = false
LEFT JOIN employee sup         ON sup.id = ea.supervisor_id AND sup.is_deleted = false
WHERE ea.employee_id = $1 AND ea.is_current = true AND ea.is_primary = true AND ea.is_deleted = false
```
返回 `currentOrg` 共 **18 个真实列**（与提示词 §7.2 要求一致）。

### 2.2 任务 B — `GET /over-age/auto-list`

**文件/位置**：`server/routes/hse-employee.js`
- COUNT 查询：L6150-6157
- 主查询：L6161-6176

两处 `LEFT JOIN v_employee_current` 均改为 `employee e` + `LEFT JOIN employee_assignment ea`（is_current/is_primary 过滤）+ `LEFT JOIN hse_org_unit` + `LEFT JOIN position`，并在 `SELECT` 中显式列出 `org_unit_id, dept_name(=eo.org_name), org_path, position_id, position_name, status`。

> ⚠️ **偏差说明（详见 §5.2）**：提示词 §4.2 建议 `hse_org_unit` 别名为 `ou`，但本端点 JS 动态 WHERE 条件（L6132-6139）引用的是 `eo.org_path` / `eo.org_path`。为不改动 WHERE 构造逻辑并避免 `字段 eo.org_path 不存在` 的 500，**别名采用 `eo`**（功能等价）。

### 2.3 任务 C — `GET /over-age/auto/:id`

**文件/位置**：`server/routes/hse-employee.js` L6264-6273（`orgResult`）

```sql
SELECT ea.org_unit_id, ou.org_name AS dept_name, ou.org_path,
       ea.position_id, p.name AS position_name, ea.status AS status,
       ea.start_date
FROM employee_assignment ea
LEFT JOIN hse_org_unit ou ON ou.id = ea.org_unit_id AND ou.is_deleted = false
LEFT JOIN position p       ON p.id = ea.position_id  AND p.is_deleted = false
WHERE ea.employee_id = $1 AND ea.is_current = true AND ea.is_primary = true AND ea.is_deleted = false
```
结果写入 `emp.org`，并回填顶层 `dept_name` / `position_name`。

### 2.4 预存在缺陷修复（范围外但必须修）

`profile/:id` 的 `empResult`（L5830-5837）原引用 `e.status`，但 **`employee` 表无 `status` 列**（仅 `employee_assignment.status` 存在），导致整个端点 500。提示词未提及此缺陷。为使 `profile/:id` 达到 §7.2 要求的 200，改为派生状态：
```sql
CASE WHEN e.is_deleted THEN 'inactive' ELSE 'active' END AS status
```
此为范围外修复，已在本文档与记忆中如实记录。

### 2.5 语法校验

```
cd server && node --check routes/hse-employee.js  →  SYNTAX_OK
```

---

## 3. 验证证据（实时冒烟，验证服务器 PID 22744 / :5666，已加载修复后代码）

> 令牌：`admin` 角色，`type:'access'`，有效期 30min。
> 地址前缀：`/api/hse/employee`。

### 3.1 三个修复端点 — 全部 HTTP 200，字段真实填充

**A · `GET /employees/profile/5162`** → `200`，`code:0`
- `basic.status = "active"`，`age = 70`
- `currentOrg`（18 字段，已填充）：
  - `orgUnitId=12`，`orgName=柴胡店镇作业中心`，`orgType=town_center`
  - `positionId=1386`，`positionName=保洁员`，`positionCode=POS-CLEANER`，`riskLevel=medium`
  - `assignmentStatus=active`，`startDate=2025-07-03`，`supervisorName=null`（该员工无上级，属正常空值）

**B · `GET /over-age/auto-list`** → `200`，`code:0`，`total=1107`
- `list[0]`：`id=5162`，`name=韩秀青`，`age=70`，`over_age_years=20`
- `org_unit_id=12`，`dept_name=柴胡店镇作业中心`，`org_path=/宁津项目公司/环卫作业中心/柴胡店镇作业中心`
- `position_id=1386`，`position_name=保洁员`，`status=active`

**C · `GET /over-age/auto/5162`** → `200`，`code:0`
- `age=70`，`over_age_years=20`，`age_threshold=50`
- `org`：`org_unit_id=12`，`dept_name=柴胡店镇作业中心`，`org_path=/宁津项目公司/环卫作业中心/柴胡店镇作业中心`
- `position_id=1386`，`position_name=保洁员`，`status=active`，`start_date=2025-07-03`

### 3.2 三个回归端点 — 全部 HTTP 200，无影响

| 端点 | 状态 | 关键结果 |
|------|------|----------|
| `GET /employees/profile/list` | 200 | `total=2609`，返回含 `id_card` 字段（契约字段存在） |
| `GET /over-age/auto-stats` | 200 | `total=1107`，与 auto-list 一致 |
| `GET /employees/profile/5162/assignments` | 200 | `rows=1` |

---

## 4. 与提示词的偏差 / 需要你知晓的事实

1. **预存在缺陷 `employee.status` 不存在**（§2.4）：原 `profile/:id` 引用 `employee.status` 致 500。已派生修复。这是让端点达 200 的前置条件，提示词未列入。
2. **任务 B 别名用 `eo` 而非 `ou`**（§2.2 / §5.2）：为匹配已有的 JS WHERE 条件 `eo.org_path`，功能等价。
3. **提示词 §9 完整性声明部分不实**：
   - `profile/:id/assignments`、`driver-info` 确为直连基表，**无需修复**（正确）。
   - 但 L5965-6033 看似 `ev.org_unit_id` 的疑似缺陷，实为引用 **`v_employee_org_full`**（另一视图，列齐全）——**非缺陷**，不要误改。
   - 真正的同类范围外残留位于 **L544**：普通员工列表 `deptName` 过滤仍引用 `ev.unit_name`（`v_employee_current` 缺列）。本次**未擅自扩展修改**，建议另立独立任务验证后处理。
4. **`v_employee_current` 仍仅 10 列**（与提示词-37 结论一致），视图定义未改动（红线）。
5. **响应字段命名**：`profile/:id` 经 `camelKeys` 返回驼峰（`orgUnitId` 等）；`auto-list`/`auto/:id` 返回蛇形（`org_unit_id` 等）。此为各端点原有响应封装行为，本次未改变 casing，仅修正缺列引用。

---

## 5. 红线遵守与范围外残留

### 5.1 红线（全部遵守 ✅）
- ❌ 未修改任何视图定义（`v_employee_current` / `v_employee_org_full` 均原样）
- ❌ 未新增 / 修改数据库迁移脚本
- ❌ 未修改路由注册、菜单、权限边界
- ✅ 仅改动 `server/routes/hse-employee.js`：3 个端点 SQL + 1 处预存在 `e.status` 派生修复

### 5.2 范围外残留（已标注，待独立任务）
- **L544**：普通员工列表 `deptName` 过滤 `ev.unit_name`（同类型缺列引用）。本次按"不擅自扩展"原则保留，建议后续单独评估修复。

---

## 6. 验证环境说明

- 验证实例 **PID 22744**（监听 `:5666`，`node app.js`）已加载本次修复后的代码，可继续用于联调。
- 如需停止该临时验证实例：`taskkill /F /PID 22744`（Windows 单斜杠 `/F`）。
- 冒烟脚本与响应样本保留于 `F:/hse-dashboard/.workbuddy/phase4/`（前缀 `vA/vB/vC/vR_*`）。
- 临时令牌生成脚本已清理，未残留于 `server/` 目录。

---

## 7. 交付物清单

| 项 | 状态 |
|----|------|
| 任务 A `profile/:id` 缺列修复 | ✅ 完成，200 |
| 任务 B `over-age/auto-list` 缺列修复（COUNT+主查询） | ✅ 完成，200 |
| 任务 C `over-age/auto/:id` 缺列修复 | ✅ 完成，200 |
| 预存在缺陷 `employee.status` 修复 | ✅ 完成（范围外，必要） |
| `node --check` 语法校验 | ✅ SYNTAX_OK |
| 实时冒烟（3 修复 + 3 回归） | ✅ 全部 200 |
| 本报告 `docs/R1-Phase1-P1-视图缺列兄弟端点修复报告.md` | ✅ 生成 |

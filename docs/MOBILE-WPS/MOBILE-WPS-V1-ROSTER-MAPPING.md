# MOBILE-WPS-V1 · 人员字段映射表（t_roster / t_account）

> 节点：NODE-02A（只读审计）
> 目标表：`t_roster`（花名册）、`t_account`（手机端账号）
> 真实数据源：PostgreSQL `safety_dashboard`（**只读查询，零写入**）
> 生成日期：2026-09-15

---

## 一、源数据确立

### 1.1 主数据来源（第一优先，已确认）

```text
employee                ← 人员主表（含 employment_relation 在职口径）
  ↓ employee_assignment ← 任职表（组织 / 作业单元 / 岗位 / 上级）
  ↓ v_employee_current  ← 当前任职快照视图（is_current + is_primary + 未删除）
```

**未采用**：`personnel` / `org_personnel` / `department`（legacy，不作为人员主数据）。

### 1.2 花名册唯一候选集

```sql
SELECT v.employee_id, v.employee_code, v.name, v.gender, v.phone,
       v.org_name, v.unit_name, v.position_name, v.supervisor_id
FROM v_employee_current v
JOIN employee e ON e.id = v.employee_id
WHERE e.is_deleted = false
  AND e.employment_relation = '正式员工';     -- 1291 行
```

| 口径 | 人数 | 判定 |
|---|---:|---|
| `employee` 未删除 | 3401 | 原始数据 |
| **`employment_relation='正式员工'`** | **1291** | ✅ **进花名册** |
| `employment_relation='辞职'` | 1951 | ❌ 不进（其中 1800 仍有"当前任职"） |
| `employment_relation IS NULL` | 152 | ⚠️ 需人工确认（D-05） |
| `employment_relation='死亡'` | 7 | ❌ 不进 |

> 🔴 **关键**：`v_employee_current` **不含** `employment_relation` 列。直接用该视图导花名册会混入 1800 名辞职人员。

---

## 二、t_roster 字段映射表

| WPS字段 | 当前真实来源 | 来源字段 | 是否存在 | 是否唯一 | 是否需要转换 | 风险 |
|---|---|---|---|---|---|---|
| `employeeId` | `employee` | `employee_code` | ✅ 1291/1291 | ✅ 唯一、0 重复 | 否 | 无。8 位纯数字（如 `00178512`） |
| `name` | `employee` | `name` | ✅ 1291/1291 | ❌ **不唯一** | 否 | 🟠 **30+ 组同名**（刘桂芹 5、刘秀芬 5、刘秀兰 4…）⇒ 禁止按姓名合并 |
| `gender` | `employee` | `gender` | ✅ 1281/1291 | ❌ | 否 | 🟡 10 人缺失（男 1862 / 女 1529 / 空 10，全库口径） |
| `phone` | `employee` | `phone` | ⚠️ 1291/1291 有值 | ✅ 0 重复 | **是（解密）** | 🔴 **AES-256-GCM 密文（`ENC:`）**，明文不可直接导出；建议本阶段**留空** |
| `position` | `position` ← `employee_assignment.position_id` | `position.name` | ✅ 1291/1291 | ❌ | 否 | 🟡 岗位表 50 条含**同名重复**（管理员×3、保洁员×2、中转站管理员×2）+ 两套编码体系 |
| `dept` | `hse_org_unit` ← `employee_assignment.org_unit_id` | `org_name` | ✅ 1291/1291 | ❌ | 否 | 🟡 值为「XX作业中心 / XX部」，需与 `township` 区分维度 |
| `workUnit` | `hse_operation_unit` ← `employee_assignment.operation_unit_id` | `unit_name` | 🔴 **59/1291（4.6%）** | ❌ | 否 | 🔴 **覆盖率极低**。89 个作业单元中 64 个挂 0 人 |
| `team` | — | — | 🔴 **无独立来源** | — | — | 🔴 建议**留空**；`grid_areas.area` 的班组只覆盖 62 名网格长 |
| `township` | `hse_org_unit` | `org_name`（去「作业中心」后缀） | ✅ 1267/1291 | ❌ | **是** | 🟡 需归一化（见 §四）；24 人在部门/中心而非乡镇 |
| `status` | `employee` | `employment_relation` | ✅ | — | **是** | `'正式员工'` → `ENABLED`；其余不导入 |
| **建议新增** `supervisorEmployeeId` | `employee_assignment` | `supervisor_id` → `employee.employee_code` | ✅ **1289/1291（99.8%）** | ❌ | 是 | ✅ 零自环；上级 100% 为正式员工。为复查方案 A 预留 |

---

## 三、t_account 字段映射表

### 3.1 字段定义与来源

| WPS字段 | 当前真实来源 | 来源字段 | 是否存在 | 是否唯一 | 是否需要转换 | 风险 |
|---|---|---|---|---|---|---|
| `accountId` | **新建** | — | ❌ 不存在 | ✅ 将唯一 | 是（生成） | 🟡 建议直接复用 `employee_code`，保证与花名册一致 |
| `phone` | `employee.phone` | `phone` | ⚠️ 有值但**密文** | ✅ 0 重复 | 是（解密） | 🔴 **密文 + 无行级权限** ⇒ 见决策 D-02 |
| `name` | `employee` | `name` | ✅ | ❌ | 否 | 🟠 同名，需与 employeeId 联合 |
| `department` | `hse_org_unit` | `org_name` | ✅ | ❌ | 否 | 🟡 **不接受「公司管理」**（那是区域维度） |
| `position` | `position` | `name` | ✅ | ❌ | 否 | 🟡 同名重复 |
| `workUnit` | `hse_operation_unit` | `unit_name` | 🔴 4.6% | ❌ | 否 | 🔴 大量留空 |
| `team` | — | — | 🔴 无 | — | — | 🔴 留空 |
| `role` | **新建**（派生） | `position_name` + `grid_level` | ❌ 不存在 | ❌ | **是（规则待定）** | 🔴 映射规则需业务方确认（D-03） |
| `scopeType` | **新建**（派生） | `grid_level` | ⚠️ 部分 | ❌ | 是 | 🔴 见 §3.3 |
| `scopeValues` | **新建**（派生） | `grid_areas.area` | ⚠️ 部分 | ❌ | 是（归一化） | 🟠 命名不一致 |
| `status` | `employee` | `employment_relation` | ✅ | — | 是 | ✅ |
| **建议新增** `employeeId` | `employee` | `employee_code` | ✅ | ✅ | 否 | ✅ **强烈建议**：否则账号与花名册是两套人 |
| **建议新增** `gridLevel` | `grid_areas` | `grid_level` | ✅ 62 人 | ❌ | 否 | ✅ 范围判定与复查都需要 |

### 3.2 账号池建议：62 名网格人员（而非 1291 全员）

| 群体 | 人数 | 有手机号 | 有 employee_code | 建议 |
|---|---:|---:|---:|---|
| 一级网格长（公司管理） | 5 | 5 | 5 | ✅ 进账号表 |
| 二级网格长（乡镇经理） | 11 | 11 | 11 | ✅ 进账号表 |
| 三级网格长（管理员） | 45 | 45 | 45 | ✅ 进账号表 |
| grid_level 为空 | 1 | 0 | 1 | ⚠️ 排除 |
| **合计** | **62** | **61** | **61** | |

理由：移动端使用者是**检查人**，不是全体员工。1291 人全部开账号既无必要，也放大泄露面。

### 3.3 🔴 scopeType 可支撑性

| scopeType | 语义 | 真实数据支撑 | 判定 |
|---|---|---|---|
| `ALL` | 全部范围 | 1291 名正式员工，组织覆盖 100% | ✅ **可编码** |
| `OWN_TOWNSHIP` | 本乡镇 | 12 乡镇覆盖 1267 人（98.1%） | ✅ **可编码** |
| `OWN_UNIT` | 本作业单元 | **正式员工仅 59/1291（4.6%）有作业单元** | 🔴 `NEEDS_BUSINESS_CONFIRMATION` |
| `OWN_TEAM` | 本班组 | **无独立班组字段**；`grid_areas` 班组只覆盖 62 网格长 | 🔴 `NEEDS_BUSINESS_CONFIRMATION` |

> **本节点不自行编造范围规则。** 建议 NODE-02B 先只启用 `ALL` 与 `OWN_TOWNSHIP`。

### 3.4 网格等级 → 范围映射（建议，待确认）

| grid_level | 岗位 | 建议 scopeType | 建议 scopeValues |
|---|---|---|---|
| 一级网格长 | 公司管理 / 生产管理部经理 / 安环管理部副经理 等 5 人 | `ALL` | 空 |
| 二级网格长 | 乡镇作业中心经理（11 人） | `OWN_TOWNSHIP` | 本乡镇 areaCode |
| 三级网格长 | 管理员（45 人） | `OWN_TOWNSHIP`（降级） | 本乡镇 areaCode |

> 三级网格长本应对应 `OWN_TEAM`（本班组），但班组数据不可支撑，**建议先降级到 `OWN_TOWNSHIP`**。此为建议，**非决定**，需 D-03 确认。

---

## 四、组织维度 vs 历史检查区域维度（不得合并）

| 维度 | 落地字段 | 真实取值 | 「公司管理」是否出现 |
|---|---|---|---|
| **组织归属** | `t_roster.dept`、`t_account.department` | 宁津项目公司 / 环卫作业中心 / 杜集镇作业中心 / 安环管理部 / 生产管理部 / 人力综合部 / 财务部 / 项目管理层 / 市政绿化作业中心 | ❌ **不出现** ✅ |
| **历史检查区域** | `t_area.areaTeam`、`t_violation_record.discoverAreaCode` | 12 乡镇 + **公司管理** | ✅ 出现（45 条巡查记录） |

**已核对结论**：`hse_org_unit.org_name` 中**没有任何一个值为「公司管理」**，组织维度未被污染。

⚠️ **但历史遗留污染存在于别处**：`grid_inspection_records.position` 列中出现 `公司管理` 25 次、`公司管理员` 5 次。**本项目不继承这一用法**，`t_roster.position` / `t_account.position` 只取 `position.name`。

---

## 五、乡镇命名归一化（导入前必须执行）

| 数据源 | 命名样例 | 是否带后缀 |
|---|---|---|
| `hse_org_unit.org_name` | 柴胡店镇作业中心 / 刘营伍乡作业中心 / 张大庄镇作业中心 | ✅ 带 |
| `hse_operation_unit.unit_name` | 柴胡店镇一班 / 柴胡店镇作业中心 | ✅ 带 |
| `grid_inspection_records.area_team` | 柴胡店镇 / 刘营伍乡 / 张大庄镇 | ✅ 带 |
| **`grid_areas.area`** | **柴胡店 / 刘营伍 / 张大庄** | ❌ **不带** |

**统一口径（建议）**：以 `hse_org_unit.org_code` 为 `areaCode` 主键，以 `org_name` 去「作业中心」后缀为 `areaName`（即 `柴胡店镇`、`刘营伍乡`、`张大庄镇`）。

| areaCode | 归一化 areaName |
|---|---|
| `TOWN-LIUYINGWU` | 刘营伍乡 |
| `TOWN-NINGCHENG` | 宁城街道 |
| `TOWN-CHANGGUAN` | 长官镇 |
| `TOWN-SHIJI` | 时集镇 |
| `TOWN-CHAIHUDIAN` | 柴胡店镇 |
| `TOWN-DUJI` | 杜集镇 |
| `TOWN-JINCHENG` | 津城街道 |
| `TOWN-DALIU` | 大柳镇 |
| `TOWN-XIANGYA` | 相衙镇 |
| `TOWN-BAODIAN` | 保店镇 |
| `TOWN-ZHANGDAZHUANG` | 张大庄镇 |
| `TOWN-DACAO` | 大曹镇 |

---

## 六、导入就绪度

| 表 | 可导入 | 条数 | 前置条件 |
|---|---|---|---|
| `t_roster` | ✅ | **1291** | 按 §1.2 口径；`phone` 留空；`workUnit`/`team` 留空 |
| `t_account` | ⚠️ | **62** | 需先定 D-02（登录键）与 D-03（范围模型） |
| `t_area` | ⚠️ | **15/16** | 津城街道无管理员（D-06） |

---

> **本节点未导入任何数据，未修改任何源表。**

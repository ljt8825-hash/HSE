# MOBILE-WPS-V1 · 数据质量问题清单

> 节点：NODE-02A（只读审计）
> 数据源：PostgreSQL `safety_dashboard`（**只读查询，零写入**）
> 生成日期：2026-09-15
> 用途：真实数据进入 WPS **之前**的返工风险清单

---

## 汇总

| 级别 | 数量 | 编号 |
|---|---:|---|
| 🔴 P0（阻断建表/导入） | 3 | Q-01、Q-02、Q-03 |
| 🟠 P1（必须业务确认） | 4 | Q-04、Q-05、Q-06、Q-07 |
| 🟡 P2（导入时需处理） | 7 | Q-08 … Q-14 |

---

## 🔴 P0 级

### Q-01：`v_employee_current` 含 1800 名辞职人员，且视图不含在职口径字段

| 项 | 值 |
|---|---|
| 现象 | 视图 3401 行；其中 `employment_relation='辞职'` 的人员有 **1800 人仍带有效当前任职**（`is_current=true AND is_primary=true`） |
| 根因 | `v_employee_current` 的 SELECT 列**不含 `employment_relation`**，WHERE 只过滤 `e.is_deleted=false` |
| 影响 | 直接以该视图生成 `t_roster` ⇒ 花名册混入 1800 名离职人员 |
| 复现 | `SELECT count(*) FROM v_employee_current v JOIN employee e ON e.id=v.employee_id WHERE e.employment_relation='辞职' AND v.assignment_id IS NOT NULL;` → 1800 |
| 建议处置 | 导入 SQL **必须** 显式 JOIN `employee` 并加 `e.employment_relation='正式员工'` |
| 是否可自动修复 | ✅ 是（导入时过滤） |

### Q-02：`employee.phone` 全为 AES-256-GCM 密文

| 项 | 值 |
|---|---|
| 现象 | 全库 1388 个非空手机号，**1388 个（100%）** 为 `ENC:` 前缀密文；正式员工 1291 人 100% 有值但**无一明文** |
| 根因 | `server/utils/encryption.js`：`AES-256-GCM`，密钥 `DATA_ENCRYPTION_KEY` |
| 影响 | V1「手机号登录」无法从数据源取到可用明文；即便解密后写入 WPS，也等于把 1291 条个人信息放进无行级权限的表 |
| 复现 | `SELECT phone FROM employee WHERE is_deleted=false AND phone IS NOT NULL LIMIT 5;` |
| 建议处置 | 决策项 **D-02**。备选：① 中间层解密比对（密钥不出服务端）② 改用「员工ID + 口令」③ 后续短信验证码 |
| 是否可自动修复 | ❌ 否（需架构决策） |

### Q-03：作业单元/班组字段覆盖率仅 4.6%

| 项 | 值 |
|---|---|
| 现象 | 正式员工 1291 人中，仅 **59 人（4.6%）** 有 `unit_name`；`unit_type` 分布：`collection_team` 43、`transfer_station` 16 |
| 根因 | `hse_operation_unit` 有 89 个单元（`cleaning_team` 51、`operation_center` 12 等），但 **`cleaning_team` 与 `operation_center` 挂着 0 人**；`employee_assignment.operation_unit_id` 大面积未填 |
| 影响 | `OWN_UNIT` / `OWN_TEAM` 两种检查范围**无法实现**；「按班组选人」功能无数据支撑 |
| 复现 | `SELECT count(*) FILTER (WHERE v.unit_name IS NOT NULL) FROM v_employee_current v JOIN employee e ON e.id=v.employee_id WHERE e.employment_relation='正式员工';` → 59 |
| 建议处置 | 决策项 **D-03**：① 降级为 `ALL` + `OWN_TOWNSHIP` 两级；② 业务方先补任职关联 |
| 是否可自动修复 | ❌ 否（需补数据或降级需求） |

---

## 🟠 P1 级

### Q-04：三违字典仅覆盖 1/3 分类，且只有 14 条

- 字典 15 条：`违反劳动纪律` 14 条 + `无三违行为` 占位 1 条。
- **「违章指挥」0 条、「违章作业」0 条**（权威分类见 `server/config/hseRules/violation-rule.json`）。
- **决策项 D-04**；本阶段不导入真实三违规则。

### Q-05：三违名称与字典不一致 + 组合值未原子化

- 「骑车未佩戴头盔」（字典）vs「骑车不戴头盔」（实际 62 次）。
- 实际存在 6 种逗号组合值（如 `骑车不戴头盔,未穿工作服`）。
- 历史台账含字典外行为：穿拖鞋(19)、未系安全绳/安全腰带(6)、其它"三违"行为(8)、翻越护栏(1)、脱岗玩岗替岗(1)。
- **决策项 D-04**。

### Q-06：津城街道无「乡镇作业中心经理」

| 项 | 值 |
|---|---|
| 乡镇作业中心数 | 12 |
| 二级网格长数 | **11** |
| 正式员工中「乡镇作业中心经理」 | 13（11 乡镇各 1 + 环卫作业中心 2） |
| **津城街道作业中心经理** | **0** 🔴 |
| 津城街道人员数 / 巡查记录数 | 72 人 / 110 条 |

- ⇒ `t_area` 津城街道**无默认管理员**，转派时无法自动带出责任人。
- **决策项 D-06**。

### Q-07：乡镇命名不一致

| 数据源 | 样例 |
|---|---|
| `hse_org_unit.org_name` | 柴胡店镇作业中心 |
| `hse_operation_unit.unit_name` | 柴胡店镇一班 |
| `grid_inspection_records.area_team` | 柴胡店镇 |
| **`grid_areas.area`** | **柴胡店**（不带后缀） |

- ⇒ 范围匹配前必须归一化。建议以 `hse_org_unit.org_code` 为 `areaCode` 主键。
- 可自动修复 ✅（导入时映射）。

---

## 🟡 P2 级

### Q-08：152 人 `employment_relation` 为 NULL

- 其中 141 人有「当前任职」，仅 1 人有手机号。
- 按项目冻结口径（NULL = UNDEFINED），**不进花名册**。
- **决策项 D-05**（建议不纳入）。

### Q-09：30+ 组同名人员

- 刘桂芹 5、刘秀芬 5、刘秀兰 4、王金生 3、张书成 3、李书坤 3、刘建军 3、张玉华 3、李桂兰 3、郭秀梅 3 …
- ⇒ **禁止按姓名合并**。NODE-01 的 `t_roster.employeeId` 唯一键已覆盖此风险 ✅。

### Q-10：`position` 表 50 条含同名重复与双编码体系

- 同名：`管理员`×3、`保洁员`×2、`中转站管理员`×2。
- 双编码：规范码 `POS-ADMIN` / `POS-TOWN-MGR` 与随机码 `POS_MRT7XSBV_0Q8V` 并存。
- ⇒ 岗位下拉会出现重复项，导入前需去重。

### Q-11：89 个作业单元中 64 个挂 0 人

- `cleaning_team` 51 个、`operation_center` 12 个、`center_vehicle_team` 1 个 → **全部 0 人**。
- 仅 `collection_team` 13 + `transfer_station` 11 = 24 个单元有人。
- ⇒ 班组主数据空转。

### Q-12：`hse_responsibility_area` 是空表（0 行）

- ⇒ `t_area` **无任何现成责任区域主数据可导**，必须由 `hse_org_unit` + `grid_areas` 派生。

### Q-13：「公司管理」污染 `position` 列

- `grid_inspection_records.position` 中出现 `公司管理` 25 次、`公司管理员` 5 次。
- **`hse_org_unit.org_name` 中没有「公司管理」** ✅ 组织维度未被污染。
- ⇒ 本项目**不继承**该用法；「公司管理」只落在 `t_area.areaTeam` / `t_violation_record.discoverAreaCode`。

### Q-14：所有 `hse_org_unit.manager_id` 为 NULL

- 21 行组织（含 12 个乡镇作业中心）**全部无 manager_id**。
- ⇒ `t_area.managerAccountId` 只能从 `grid_areas` 的二级网格长派生（11/12 可得）。

---

## 附：导入前必做检查清单（给 NODE-02B）

```text
[ ] 花名册 SQL 已加 employment_relation='正式员工' 过滤        （Q-01）
[ ] 花名册不含 phone 密文列                                    （Q-02）
[ ] 花名册 workUnit / team 允许为空                            （Q-03）
[ ] t_violation_rule 用 TEST 占位，不导真实规则                （Q-04/Q-05）
[ ] t_area 津城街道 managerAccountId 空缺已显式标注            （Q-06）
[ ] 乡镇 areaCode/areaName 已按 org_code 归一化                （Q-07）
[ ] 152 名 NULL 在职人员已排除                                 （Q-08）
[ ] 岗位下拉已去重                                             （Q-10）
[ ] 「公司管理」未写入任何 dept / position 字段                （Q-13）
[ ] t_area.managerAccountId 从 grid_areas 二级网格长派生       （Q-14）
```

---

> **本节点未修改任何源数据，未执行任何修复。**

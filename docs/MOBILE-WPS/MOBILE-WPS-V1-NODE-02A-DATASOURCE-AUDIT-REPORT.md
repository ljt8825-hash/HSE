# MOBILE-WPS-V1-NODE-02A 真实数据源审计与 WPS 建表准备 · 报告

> 项目：WPS 多维表格驱动的无云移动 HSE / 三违巡查应用 V1
> 前置节点：MOBILE-WPS-V1-NODE-01 = CONDITIONAL_PASS
> 当前节点：**MOBILE-WPS-V1-NODE-02A**
> 执行方式：**只审计、只准备、零正式业务写入**
> 执行日期：2026-09-15
> 审计对象：`G:\hse-dashboard`（`server/` 后端 + `安全看板vben/apps/web-naive` 前端）+ 生产 PostgreSQL（**只读**）

---

## 1. 执行摘要

本节点完成了「真实数据进入 WPS 之前」的全部前置审计，**未创建任何 WPS 表、未导入任何真实数据、未启动任何中间层或云服务器**。

### 1.1 核心结论（先说结论）

| # | 结论 | 影响 |
|---|---|---|
| 1 | **人员主数据已确定**：`employee` + `employee_assignment` + `v_employee_current`，但**必须叠加 `employment_relation='正式员工'` 过滤** | 花名册候选从 3401 收敛到 **1291** |
| 2 | **`v_employee_current` 视图不含 `employment_relation`** | 直接用该视图建花名册会混入 **1800 名辞职人员** ⇒ 致命 |
| 3 | **`employee.phone` 是 AES-256-GCM 密文（`ENC:` 前缀），明文不可直接读** | V1「手机号登录」数据侧受阻，需架构决策 |
| 4 | **三违行为字典只有 14 条、且只覆盖「违反劳动纪律」1/3 分类** | 三违规则**不可直接导入**，需业务方补清单 |
| 5 | **作业单元/班组字段覆盖率仅 4.6%（59/1291）** | `OWN_UNIT`/`OWN_TEAM` 两种检查范围**数据不可支撑** |
| 6 | **上级关系覆盖率 99.8%（1289/1291）、零自环** | 复查「方案 A（复查人=发现人上级）」**数据上可行** |
| 7 | **12 个乡镇作业中心只有 11 名「乡镇作业中心经理」**，津城街道缺 | `t_area` 津城街道**无默认管理员** |
| 8 | **「公司管理」在真实数据中同时出现在 `area_team` 和 `position` 两列** | 历史遗留双重用法，本项目**只取区域维度** |

### 1.2 节点判定

```text
MOBILE-WPS-V1-NODE-02A = CONDITIONAL_PASS
```

理由：18 项完成判定中 **13 项确定达标、5 项为条件性达标**。其中 `REVIEW_ASSIGNMENT` 按任务书要求**必须保持 PENDING_HUMAN_DECISION**，不得由本节点自行决定；三违规则来源已找到但**内容不完整**，不可直接导入。详见 §14。

### 1.3 本节点零写入证明

- 全部数据库操作通过 `_mw_audit/ro-probe.cjs`，连接参数带 `-c default_transaction_read_only=on`，脚本内置「非 SELECT/WITH/EXPLAIN 一律拒绝」守卫。
- 每次执行首行输出均含 `[DB] {"db":"safety_dashboard","u":"hse_app","ro":"on"}`。
- **未执行任何 DDL/DML**，未调用任何 WPS create/update/delete。
- 未修改 `server/` 与 `web-naive/src` 下任何既有文件（详见 §14.3 git 核对）。

---

## 2. 数据源盘点

### 2.1 盘点范围与方法

扫描 `G:\hse-dashboard` 与 `G:\hse-dashboard\安全看板vben`，关键词覆盖：employee / employee_assignment / v_employee_current / 花名册 / 员工ID / 工号 / 班组 / 作业单元 / 乡镇 / 三违 / violation / rule / 考核 / 扣分 / area_team / 公司管理 等。

### 2.2 人员数据源候选

| 候选源 | 类型 | 行数 | 判定 |
|---|---|---|---|
| `employee` | PG 表 | 3417（未删 3401） | ✅ **主表**（含 `employment_relation` 在职口径） |
| `employee_assignment` | PG 表 | 28864 | ✅ **任职表**（组织/作业单元/岗位/上级） |
| `v_employee_current` | PG 视图 | 3401 | ✅ **当前任职快照**，但缺在职口径字段 |
| `department` | PG 表 | 98 | ⚠️ legacy 部门树，**不作为人员主数据** |
| `hse_org_unit` | PG 表 | 21 | ✅ 组织归属（五级/四类） |
| `hse_operation_unit` | PG 表 | 89 | ✅ 作业单元/班组主数据 |
| `position` | PG 表 | 50 | ✅ 岗位主数据 |
| `grid_areas` | PG 表 | 63 | ✅ 网格长与检查区域（**范围判定关键**） |
| `users` | PG 表 | 63 | ❌ 禁用（任务书：不碰登录/JWT） |
| `personnel` / `org_personnel` | PG 表 | — | ❌ legacy，不作为主数据 |

### 2.3 三违数据源候选

| 候选源 | 类型 | 行数 | 判定 |
|---|---|---|---|
| `sanwei_behavior_dict` | PG 表 | **15** | ✅ **主来源**（有 code/别名/启用/分类），但内容不全 |
| `server/config/hseRules/violation-rule.json` | 配置文件 | 4.3 KB | ✅ **三违分类唯一权威**（3 类），含扣分（**本项目不取扣分**） |
| `grid_inspection_records.violation_behavior` | PG 列 | 21 个不同取值 | ⚠️ 实际使用值，与字典**不一致** |
| `violations.violation_type` | PG 列 | 12 个不同取值 | ⚠️ 历史台账，含字典外行为 |
| `hse_assessment_standard` / `hse_assessment_rule` | PG 表 | 26 / 22 | ❌ 属 E-08-11 扣分域，**本项目不引用** |

### 2.4 组织与区域数据源候选

| 候选源 | 类型 | 行数 | 判定 |
|---|---|---|---|
| `hse_org_unit` | PG 表 | 21（20 有效） | ✅ 组织归属 + 乡镇作业中心 |
| `hse_operation_unit` | PG 表 | 89 | ✅ 班组/作业单元（最完整） |
| `hse_responsibility_area` | PG 表 | **0** | ❌ **空表，无责任区域主数据** |
| `grid_areas` | PG 表 | 63 | ✅ 网格等级 + 检查区域 |
| `grid_inspection_records.area_team` | PG 列 | 13 个不同取值 | ✅ 「公司管理」真实存在于此 |

---

## 3. 人员数据审计

### 3.1 在职口径分桶（决定性数据）

以 `employee.is_deleted = false` 为前提，按 `employment_relation` 分桶：

| employment_relation | 人数 | 有当前任职 | 有手机号 |
|---|---:|---:|---:|
| **正式员工** | **1291** | **1291 (100%)** | **1291 (100%)** |
| 辞职 | 1951 | 1800 (92.3%) | 96 (4.9%) |
| NULL（UNDEFINED） | 152 | 141 (92.8%) | 1 (0.7%) |
| 死亡 | 7 | 6 (85.7%) | 0 |
| **合计** | **3401** | 3238 | 1388 |

**⚠️ 致命发现**：`v_employee_current` 共有 3401 行，其中 **1800 名「辞职」人员仍带有效当前任职**。若直接以 `v_employee_current` 生成 `t_roster`，会把 1800 名离职人员混入花名册。

**⚠️ 对比**：`正式员工` 桶 100% 有任职、100% 有手机号；`辞职` 桶仅 4.9% 有手机号。两个桶的数据完整度差异极大，进一步印证「正式员工」才是有效主数据。

### 3.2 花名册候选集确立

```sql
-- t_roster 唯一候选集（1291 人）
SELECT v.*
FROM v_employee_current v
JOIN employee e ON e.id = v.employee_id
WHERE e.is_deleted = false
  AND e.employment_relation = '正式员工';
```

- 该口径与项目既有冻结口径一致（`有效 ⇔ employment_relation='正式员工'`，NULL=UNDEFINED）。
- **152 名 NULL 与 7 名死亡人员不进花名册**，标记为「需人工确认」，不在本节点擅自处理。

### 3.3 关键字段覆盖率（1291 名正式员工）

| 字段 | 有值 | 覆盖率 | 判定 |
|---|---:|---:|---|
| `employee_code`（员工ID） | 1291 | 100% | ✅ |
| `name` | 1291 | 100% | ✅ |
| `org_name`（组织/部门） | 1291 | 100% | ✅ |
| `position_name`（职位） | 1291 | 100% | ✅ |
| `supervisor_id`（直属上级） | 1289 | 99.8% | ✅ |
| `gender` | 1281 | 99.2% | ✅（10 名全库缺失） |
| **`unit_name`（作业单元/班组）** | **59** | **4.6%** | 🔴 **严重不足** |
| `phone`（密文） | 1291 | 100% | ⚠️ 见 §3.5 |

### 3.4 员工ID 与姓名质量

| 检查项 | 结果 |
|---|---|
| employee_code 为空（正式员工） | **0** ✅ |
| employee_code 重复 | **0** ✅ |
| employee_code 格式 | **100% 8 位纯数字**（如 `00178512`）✅ |
| employee_code 非纯数字 | 0 ✅ |
| 姓名为空 | 0 ✅ |
| **同名人员** | **存在**（刘桂芹 5、刘秀芬 5、刘秀兰 4、王金生 3、张书成 3 …）⚠️ |

> 同名人员**必须靠 employeeId 区分**，禁止按姓名合并。NODE-01 的 `t_roster.employeeId` 唯一键设计已覆盖此风险。

### 3.5 🔴 手机号：密文存储（重大）

```text
employee.phone 实际值样例：
  ENC:ftFOGgUqZ1YYdP5boKaUH8JkRQHNkim75gy1f3mPDnQxqaVxMEoe
  ENC:dx7dJnT47Qfxip/DUDN+OnQN2MwXq9OBcl1p6uPM/qOozPXnqCMo
```

- 加密算法：`AES-256-GCM`，前缀 `ENC:`，密钥来自 `DATA_ENCRYPTION_KEY`（`server/utils/encryption.js`）。
- 全库 1388 个非空手机号中，**1388 个（100%）为密文**，**无一明文**。
- 另有 `phone_hash` 列（用于检索比对），但哈希算法与盐同样不可下发到手机端。

**对 V1「手机号登录」的直接影响**：

| 方案 | 可行性 | 说明 |
|---|---|---|
| 手机直连 WPS 查手机号明文 | ❌ 不可行 | 无明文可导；即便导入明文＝把 1291 条个人信息放进一张无行级权限的表 |
| 中间层解密后比对 | ⚠️ 可行但需决策 | 密钥留在中间层；仍需面对「手机号可被冒用」的安全定性 |
| 改用 `phone_hash` 匹配 | ❌ 不可行 | 哈希算法下发前端＝可离线爆破 |
| **改用「员工ID + 口令」** | ✅ **推荐评估** | 员工ID 100% 覆盖、8 位纯数字、无个人信息敏感度 |

> **本节点不自行决定登录方案**，列为业务决策项 `D-02`（见 §11）。

### 3.6 组织归属 vs 历史检查区域（必须不合并）

真实数据中「公司管理」**同时出现在两个维度**：

| 维度 | 出现位置 | 样例值 | 本项目处理 |
|---|---|---|---|
| 组织归属 | `employee_assignment → hse_org_unit.org_name` | 环卫作业中心 / 杜集镇作业中心 / 安环管理部 | → `t_roster.dept`、`t_account.dept` |
| 历史检查区域 | `grid_inspection_records.area_team` | 12 乡镇 + **公司管理** | → `t_area.areaTeam=COMPANY_MANAGEMENT`、`t_violation_record.discoverAreaCode` |
| ⚠️ 历史遗留污染 | `grid_inspection_records.position` | 出现 `公司管理` 25 次、`公司管理员` 5 次 | **本项目不继承**，不写入 `t_roster.position` |

已确认：**无任何记录的 `dept`/`org_name` 值为「公司管理」**，组织维度未被污染，符合任务书第九条要求。

---

## 4. 三违规则审计

### 4.1 三违分类（权威定义）

来源：`server/config/hseRules/violation-rule.json`

| code | 分类 | 本项目是否引用 |
|---|---|---|
| `command` | 违章指挥 | ✅ 引用**分类名**（不引用扣分） |
| `operation` | 违章作业 | ✅ 引用**分类名**（不引用扣分） |
| `discipline` | 违反劳动纪律 | ✅ 引用**分类名**（不引用扣分） |

> 该 JSON 中的 `defaultScoreDeduct` / `scoreDeduct` / `needRetraining` 等**全部不引用**——NODE-01 已明确 V1 不做任何扣分，本节点遵守。

### 4.2 行为字典现状（`sanwei_behavior_dict`，15 行）

| 项 | 值 |
|---|---|
| 总规则数 | 15 |
| `is_violation = true` | 14 |
| 非违规占位（`无三违行为`） | 1 |
| 启用（`enabled=true`） | 15 |
| 停用 | 0 |
| `severity`（严重度） | **全部 NULL** |
| 分类分布 | 违反劳动纪律 14、`-` 1 |
| **缺「违章指挥」** | 🔴 **0 条** |
| **缺「违章作业」** | 🔴 **0 条** |

### 4.3 🔴 字典与实际使用不一致（重大）

实际业务中使用的行为值（`grid_inspection_records.violation_behavior`，21 个不同取值；`violations.violation_type`，12 个不同取值）与字典**对不上**：

| 问题类型 | 具体证据 |
|---|---|
| **名称不一致** | 字典「骑车未佩戴头盔」 vs 实际高频使用「骑车不戴头盔」（62 次）；字典仅 1 条「骑车未佩戴头盔」 |
| **组合值未原子化** | `骑车不戴头盔,未穿工作服`、`无三违行为,超速行驶`、`无三违行为,未穿工作服` 等 6 种逗号组合 |
| **字典缺失实际行为** | `穿拖鞋`(19)、`未系安全绳/安全腰带`(6)、`其它"三违"行为`(8)、`翻越护栏`(1)、`脱岗、玩岗、替岗`(1) —— 均不在字典中 |
| **空值/兜底占比高** | `violations.violation_type` 空值 942/1451（65%）、`其它` 258 |

### 4.4 三违规则结论

```text
三违规则来源：已找到（sanwei_behavior_dict + violation-rule.json）
三违规则可导入性：❌ 不可直接导入
```

必须先由业务方完成：① 补齐三大分类的行为清单；② 统一行为名称与字典；③ 明确组合值的原子化规则；④ 确认 `适用岗位` 口径（字典**无该字段**）。

---

## 5. 组织审计

### 5.1 `hse_org_unit`（21 行，20 有效）

| org_type | 数量 | 组织 |
|---|---:|---|
| `company` | 1 | 宁津项目公司 |
| `department` | 5 | 项目管理层、人力综合部、生产管理部、安环管理部、财务部 |
| `center` | 2 | 环卫作业中心、市政绿化作业中心 |
| `town_center` | 12 | 刘营伍乡、宁城街道、长官镇、时集镇、柴胡店镇、杜集镇、津城街道、大柳镇、相衙镇、保店镇、张大庄镇、大曹镇 |
| （已删除） | 1 | 测试组织_119_改 |

- **所有 `manager_id` 均为 NULL** ⇒ 组织表**不提供默认管理员**，`t_area.managerAccountId` 需另找来源。
- ✅ 已核对：任务书列举的「总经理 / 安环管理部 / 生产管理部 / 人力综合部 / 环卫作业中心 / 市政绿化作业中心 / 乡镇作业中心」全部存在。

### 5.2 `hse_operation_unit`（89 行，最完整的班组体系）

| unit_type | 数量 | 命名样例 |
|---|---:|---|
| `cleaning_team` | 51 | 保店镇一班、柴胡店镇七班 |
| `operation_center` | 12 | 保店镇作业中心（=12 乡镇，一一对应） |
| `collection_team` | 13 | 保店镇收运车组 |
| `transfer_station` | 11 | 保店镇转运站 |
| `center_vehicle_team` | 1 | — |

> ⚠️ **但人员侧只挂了 `collection_team`(43) 与 `transfer_station`(16)** —— 51 个 `cleaning_team` 与 12 个 `operation_center` **挂着 0 人**。主数据存在、任职关联缺失。

### 5.3 `position`（50 行）

- 存在**同名重复岗位**：`管理员`×3、`保洁员`×2、`中转站管理员`×2。
- 存在**两套编码体系**：规范码（`POS-ADMIN`、`POS-TOWN-MGR`）与随机码（`POS_MRT7XSBV_0Q8V`）并存。
- 有效组织映射字段：`position.org_type` / `responsibility_type` 仅部分行有值（1391 起）。

### 5.4 `hse_responsibility_area`

**0 行**。⇒ `t_area` **没有现成责任区域主数据可导**，必须由 §6 的映射方案新建。

---

## 6. 责任区域审计

### 6.1 area_team 真实取值（`grid_inspection_records`，13 个）

```text
杜集镇(329) 柴胡店镇(245) 保店镇(182) 时集镇(182) 长官镇(179) 刘营伍乡(146)
张大庄镇(146) 大曹镇(144) 相衙镇(141) 大柳镇(140) 津城街道(110) 宁城街道(72)
公司管理(45)
```

✅ **「公司管理」确认真实存在**（45 条），性质为**历史检查区域**，与 12 个乡镇并列 —— 完全符合任务书第九条。

### 6.2 🔴 乡镇命名不一致

| 数据源 | 命名 |
|---|---|
| `hse_org_unit.org_name` | 柴胡店镇作业中心 / 刘营伍乡作业中心 / 张大庄镇作业中心（**带后缀**） |
| `grid_inspection_records.area_team` | 柴胡店镇 / 刘营伍乡 / 张大庄镇（**带后缀**） |
| `hse_operation_unit.unit_name` | 柴胡店镇一班 / 柴胡店镇作业中心（**带后缀**） |
| **`grid_areas.area`（二级网格长）** | **柴胡店 / 刘营伍 / 张大庄（不带后缀）** |

⇒ `grid_areas` 与其他三套数据**命名口径不一致**，做范围匹配前必须归一化。

### 6.3 🔴 津城街道缺管理员

| 检查 | 结果 |
|---|---|
| 乡镇作业中心数（`hse_org_unit`） | 12 |
| 二级网格长数（`grid_areas`） | **11** |
| 「乡镇作业中心经理」岗位人数（正式员工） | 13（11 乡镇各 1 + 环卫作业中心 2） |
| **津城街道作业中心的经理** | **0** 🔴 |
| 津城街道作业中心人员数 | 72 人 |
| 津城街道巡查记录数 | 110 条 |

⇒ **津城街道有人、有巡查、无经理**。`t_area` 该区域**无默认管理员**，转派时无法自动带出责任人。

### 6.4 `t_area` 最终映射方案

| areaCode | areaName | areaTeam | parentArea | status | 默认管理员 | 数据来源 |
|---|---|---|---|---|---|---|
| `TOWN-LIUYINGWU` | 刘营伍乡 | TOWNSHIP | `CENTER-HW` | ENABLED | 张和祥（00179180 系） | 二级网格长 G011 |
| `TOWN-NINGCHENG` | 宁城街道 | TOWNSHIP | `CENTER-HW` | ENABLED | 张万恒 | G017 |
| `TOWN-CHANGGUAN` | 长官镇 | TOWNSHIP | `CENTER-HW` | ENABLED | 张华平 | G013 |
| `TOWN-SHIJI` | 时集镇 | TOWNSHIP | `CENTER-HW` | ENABLED | 郭志强 | G010 |
| `TOWN-CHAIHUDIAN` | 柴胡店镇 | TOWNSHIP | `CENTER-HW` | ENABLED | 王臣祥 | G016 |
| `TOWN-DUJI` | 杜集镇 | TOWNSHIP | `CENTER-HW` | ENABLED | 张卫新 | G015 |
| **`TOWN-JINCHENG`** | **津城街道** | TOWNSHIP | `CENTER-HW` | ENABLED | **🔴 空缺 → NEEDS_BUSINESS_CONFIRMATION** | — |
| `TOWN-DALIU` | 大柳镇 | TOWNSHIP | `CENTER-HW` | ENABLED | 谢俊章 | G014 |
| `TOWN-XIANGYA` | 相衙镇 | TOWNSHIP | `CENTER-HW` | ENABLED | 李振恒 | G009 |
| `TOWN-BAODIAN` | 保店镇 | TOWNSHIP | `CENTER-HW` | ENABLED | 杨清华 | G008 |
| `TOWN-ZHANGDAZHUANG` | 张大庄镇 | TOWNSHIP | `CENTER-HW` | ENABLED | 靳洪刚 | G012 |
| `TOWN-DACAO` | 大曹镇 | TOWNSHIP | `CENTER-HW` | ENABLED | 孙建栋 | G007 |
| `CENTER-HW` | 环卫作业中心 | WORK_CENTER | `COMPANY-001` | ENABLED | 待定（2 名经理：刘菲、韩晓亮） | hse_org_unit#7 |
| `CENTER-LH` | 市政绿化作业中心 | WORK_CENTER | `COMPANY-001` | ENABLED | 🔴 无数据 | hse_org_unit#20 |
| `COMPANY-MGMT` | 公司管理 | **COMPANY_MANAGEMENT** | — | ENABLED | 🔴 无单一管理员（5 名一级网格长） | grid_inspection_records.area_team |
| `COMPANY-001` | 宁津项目公司 | WORK_CENTER | — | ENABLED | 🔴 `manager_id` 为 NULL | hse_org_unit#1 |

> **`areaTeam=COMPANY_MANAGEMENT` 只有「公司管理」一行**，其成员由「一级网格长」构成（黄元同、张康、刘菲、韩晓亮、刘金涛），**不是一个部门**。组织维度走 `t_roster.dept`，区域维度走 `t_area.areaTeam`，两者正交，不合并。

---

## 7. 账号范围审计（检查范围）

### 7.1 现有网格体系（`grid_areas`，62 有效）

| grid_level | 人数 | 检查区域（`area` 值） | 对应 scopeType 设想 |
|---|---:|---|---|
| 一级网格长 | 5 | `环卫、绿化业务`（公司层面） | `ALL` / `COMPANY_MANAGEMENT` |
| 二级网格长 | 11 | 乡镇名（如 `保店镇`、`柴胡店`） | `OWN_TOWNSHIP` |
| 三级网格长 | 45 | `乡镇N班`（如 `柴胡店镇三班`） | `OWN_TEAM` |
| （空） | 1 | — | 异常数据 |

岗位交叉验证（`grid_inspection_records`，2061 条）：

| position | grid_level | 条数 |
|---|---|---:|
| 管理员 | 三级网格长 | 1584 |
| 乡镇作业中心经理 | 二级网格长 | 380 |
| 公司管理 | 一级网格长 | 19 |
| 总经理 | 总网格长 | 7 |

### 7.2 🔴 四种 scopeType 的数据可支撑性

| scopeType | 语义 | 数据可支撑性 | 证据 |
|---|---|---|---|
| `ALL` | 全部 | ✅ **可支撑** | 1291 名正式员工，组织覆盖 100% |
| `OWN_TOWNSHIP` | 本乡镇 | ✅ **可支撑** | 12 个乡镇作业中心，1267 名正式员工（98.1%） |
| `OWN_UNIT` | 本作业单元 | 🔴 **不可支撑** | 正式员工仅 **59/1291（4.6%）** 有作业单元 |
| `OWN_TEAM` | 本班组 | 🔴 **不可支撑** | 班组字段同 `unit_name`；`grid_areas` 班组只覆盖 62 名网格长，覆盖不到被检查的普通员工 |

### 7.3 结论

```text
可编码：ALL、OWN_TOWNSHIP
NEEDS_BUSINESS_CONFIRMATION：OWN_UNIT、OWN_TEAM
```

**本节点不自行编造范围规则**。若业务方确认需要 `OWN_TEAM`，必须先补齐 `employee_assignment.operation_unit_id` 的任职关联（当前 89 个作业单元中 64 个挂 0 人）。

### 7.4 不写死的落点

`src/api/mw/core/scope.ts` 的范围判定保持「读账号的 `scopeType` + `scopeValues`」这一条路径，**不新增任何按姓名/岗位硬编码的特例**。本节点的审计结论只作为「数据准备要求」输出，不改代码。

---

## 8. 复查规则待决策（REVIEW_ASSIGNMENT）

NODE-01 端到端冒烟已暴露：`PENDING_REVIEW` 状态下，**自查自纠类记录无人可复查**（分桶给发现人，但详情页禁止「自整改自复查」）。

本节点**不自行选择方案**，仅提供数据侧可行性证据：

| 方案 | 语义 | 数据可支撑性 | 本节点证据 |
|---|---|---|---|
| **A** | 复查人 = 发现人的上级 | ✅ **数据可支撑** | `supervisor_id` 覆盖 1289/1291（99.8%）；**零自环**；上级 100% 为正式员工；62 个不同上级；网格长（真实移动端用户）上级覆盖 45/45、11/11、5/5 |
| **B** | 提交整改时显式指定复查人 | ✅ 数据可支撑 | 1291 人候选池 + 组织/岗位完整 |
| **C** | 复查人 = 责任区域管理员 | ⚠️ 部分可支撑 | 12 个区域中 11 个有二级网格长；**津城街道空缺**；「公司管理」无单一管理员 |
| **D** | 依公司制度 | ❓ 未找到制度文件 | 未在 `docs/`、`g:\safety_vault\02_规章制度` 中定位到明确的复查关系条款，需业务方提供 |

### 8.1 方案 A 的额外风险（审计发现，供决策参考）

**11 名乡镇作业中心经理的上级全部是同一人（黄元同 · 环卫作业中心副经理）**。若采用方案 A，该人员将成为复查任务的单点汇聚者，需评估工作量。

### 8.2 判定

```text
REVIEW_ASSIGNMENT = PENDING_HUMAN_DECISION
```

详细决策单见 `MOBILE-WPS-V1-REVIEW-DECISION.md`。

---

## 9. WPS 能力审计

复用 NODE-01 已真机验证的结论，并与 `server/services/wpsClient.js` / `wpsDbsheetAdapter.js` 实际实现复核一致。

### 9.1 认证

- `POST /oauth2/token`（`client_credentials`）→ Bearer token。
- 签名：`X-Kso-Authorization: KSO-1 {appId}:{HMAC-SHA256}`（`server/services/wpsClient.js:132`），**仅企业控制台开启签名校验时必需**。
- 记录根路径：`/v7/coop/dbsheet/{fileId}/sheets/{sheetId}/records`（`wpsClient.js:192`）。

🔴 **关键定性**：`client_credentials` 是**应用级（租户级）凭证**，WPS 侧**无按登录用户的行级隔离**。下发到浏览器＝交出整表读写权。**手机绝不能直连 WPS**。

### 9.2 能力清单

| 能力 | 端点 | 支持 | 对本项目 8 表的影响 |
|---|---|---|---|
| 建字段 | `POST .../sheets/{sheet_id}/fields` | ✅ | 8 表字段可建；需先查重保证幂等 |
| 创建记录 | `POST .../records/create` | ✅ | **50 条/批**；响应 `fields_value` 是 JSON 字符串，须 parse |
| 更新记录 | `POST .../records/update` | ✅ | 50 条/批 |
| 列举记录 | `POST .../records/list_by_page` | ✅ | `page_size` 100；**无字段级条件过滤** |
| 批量删除 | `POST .../records/batch_delete` | ✅ | 无 `records/delete`（404） |
| **单条按 ID 查** | — | ❌ **不存在** | **只能全表 O(n) 扫描** |
| **条件过滤** | — | 🔴 **不支持** | 花名册按乡镇筛选＝**客户端全量拉取后过滤** |
| 附件上传 | `POST /v7/documents/{file_id}/attachments/upload` | ⚠️ 文档级 | **二段式**；Attachment 值 `{uploadId,fileName,source}`，**不含 URL** |
| 附件换 URL | — | 🔴 **本项目 V7 coop 域实测 404** | 见 §9.3 |
| 限频 | — | ⚠️ 10 req/s | 大批量导入需节流 |

### 9.3 🔴 无条件过滤 × 1291 人花名册 = 必须决策

```text
现状：t_roster 1291 行，WPS 不支持按字段筛选
⇒ 每次「选违章人员」都要 list_by_page 拉全表（至少 13 次分页请求）
⇒ 手机端流量、延迟、限频三重压力
```

**可选缓解**（本节点只列，不实施）：
- 中间层做内存缓存 + 按 `township` 建索引，前端按页取；
- 按乡镇拆分为 13 张子表（牺牲统一模型）；
- 中间层改用 PostgreSQL 直连（即提前进入未来架构）。

### 9.4 图片存储三方案比较

| 维度 | A. WPS Attachment | B. 中间层对象存储 | C. 未来 PG/对象存储 |
|---|---|---|---|
| 成本 | 含在 WPS 配额 | 需服务器 + 存储费用 | 同 B |
| 访问 URL | 🔴 **无公网直链**，换 URL 端点在 V7 coop 域 404 | ✅ 直链 | ✅ 直链 |
| 权限 | 跟随 WPS 应用凭证 | 可签名 URL + 过期 | 可签名 URL + 过期 |
| 手机访问 | 🔴 渲染不了 | ✅ | ✅ |
| 生命周期/删除 | 随记录 | 可控 | 可控 |
| 备份 | 依赖 WPS | 自主 | 自主 |
| 迁移到 PG | 🔴 需整体搬运 | ✅ 只需换路径前缀 | ✅ |

```text
RECOMMENDED = B（中间层对象存储）
```

与 NODE-01 的结论一致；`t_photo.storageRef` + `t_photo.url` 双列设计已经兼容 A/B/C 三者，**本节点不修改该设计**。

### 9.5 NODE-04 可实现性审计（任务书第十六条）

按任务书要求，只审计「NODE-04 按现有 REST Contract 是否可实现」，**不实现 NODE-04、不启动云服务器**，发现契约问题时**只改 `MIDDLEWARE-CONTRACT.md`**。

```text
结论：NODE-04 按现有 REST Contract ✅ 可实现
      但发现 6 处未约束的实现陷阱，已在 MIDDLEWARE-CONTRACT.md §7 补为强制条款。
```

| # | 冲突 | 补充的强制条款 |
|---|---|---|
| C-1 | WPS 无单条按 ID 查端点，`records/update` 只认 WPS Record ID，而契约以业务键 `violationId` 寻址 | **M-1**：中间层必须维护 `violationId → WPS Record ID` 映射，禁止请求路径上全表扫描 |
| C-2 | WPS `list_by_page` 无条件过滤，契约却要求主数据按会话范围过滤 | **M-2**：主数据必须服务端缓存 + 建 `township` 索引，禁止每请求回源全表分页 |
| C-3 | WPS 无计数器/序列/锁，契约却要求 `next-seq` 原子分配 | **M-3**：序号状态不得只存 WPS；三选一（本地序列 / 唯一约束+重试 / 分布式锁） |
| C-4 | V7 coop 域附件换 URL 端点 404 | **M-4**：原「强烈建议」升级为**强制**——照片必须落对象存储，禁止以 WPS Attachment 为唯一副本 |
| C-5 | 限频 10 req/s、50 条/批、`fields_value` 是 JSON 字符串 | **M-5**：必须限流+退避、按 50 切片、必须 `JSON.parse` `fields_value` |
| C-6 | WPS 写 SingleSelect 时选项必须已存在 | **M-6**：建表先建齐枚举选项再写记录 |

复核通过（无冲突）：前端零凭证、「记录不可删除」、不实现扣分、照片 multipart、未来 Transport 替换、禁止 PG→WPS 反向同步。

### 9.6 本节点是否做了写入验证

**否**。按任务书第十四条，本节点**未做任何 WPS 写入**，也未使用任何测试 WPS 文件。§9 全部结论来源于 NODE-01 已真机验证记录 + 本机代码复核。

---

## 10. 8 表字段冻结建议

基于 `src/api/mw/core/schema.ts` + `types.ts` + 本节点审计，逐表给出冻结建议。**本节点未修改任何代码**，以下为给 NODE-02B 的建表输入。

### 10.1 T1 `t_account`（12 字段）

| 审计项 | 结论 |
|---|---|
| 主键 | `accountId` ✅ |
| 唯一键 | `accountId`、`phone` ✅ |
| 新增建议 | 🔴 **补 `employeeId` 列**，用于与 `t_roster` 对齐身份（否则账号与花名册是两套人） |
| 🔴 `phone` 必填 | **建议降为可选**，或改为 `loginKey` —— 因手机号密文问题（§3.5）未决 |
| `scopeType` 枚举 | 🔴 **建议先只启用 `ALL` / `OWN_TOWNSHIP`**；`OWN_UNIT`/`OWN_TEAM` 数据不可支撑（§7.2） |
| `dept` | 取 `hse_org_unit.org_name`，**不接受「公司管理」** |
| 数据源 | 建议**仅 62 名网格人员**（手机号 61/62 有值），而非 1291 全员 |

### 10.2 T2 `t_roster`（10 字段）

| 字段 | 来源 | 状态 |
|---|---|---|
| `employeeId` | `employee.employee_code` | ✅ 8 位纯数字、唯一、无空 |
| `name` | `employee.name` | ✅ 无空；同名 30+ 组，靠 employeeId 区分 |
| `gender` | `employee.gender` | ✅ 99.2% |
| `phone` | `employee.phone`（密文） | 🔴 **建议本阶段留空**，不导出密文 |
| `position` | `position.name` | ✅ 100%；但需处理 50 岗位中的同名重复 |
| `dept` | `hse_org_unit.org_name` | ✅ 100% |
| `workUnit` | `hse_operation_unit.unit_name` | 🔴 **仅 4.6%，大量留空** |
| `team` | — | 🔴 **无独立来源**，本阶段留空 |
| `township` | `hse_org_unit.org_name` 去「作业中心」后缀 | ✅ 可从组织派生 |
| `status` | `employment_relation='正式员工'` | ✅ 固定 ENABLED |

**新增建议**：🔴 补 `supervisorEmployeeId` 列（数据覆盖率 99.8%），为复查方案 A 预留。

### 10.3 T3 `t_violation_rule`（9 字段）

| 字段 | 来源 | 状态 |
|---|---|---|
| `ruleId` | `sanwei_behavior_dict.behavior_code`（`SANWEI-SW-001`） | ✅ |
| `name` | `behavior_name` | ⚠️ 与实际使用名称不一致，需归一化 |
| `category` | `behavior_type` | 🔴 **只有「违反劳动纪律」**；另两类待业务方补 |
| `description` | `description` | ⚠️ 全部 NULL |
| `applicablePosition` | — | 🔴 **字典无此字段** → NEEDS_BUSINESS_CONFIRMATION |
| `applicableScope` | — | 🔴 同上 |
| `enabled` | `enabled` | ✅ |
| `sortOrder` | — | 🔴 **字典无排序字段**，建议用 `id` 或补列 |
| `remark` | — | 可选 |

**结论：T3 本阶段不导入真实数据**，保持 NODE-01 的 TEST 占位，待业务方补清单。

### 10.4 T4 `t_area`（6 字段）

| 审计项 | 结论 |
|---|---|
| `areaCode` | ✅ 建议直接采用 `hse_org_unit.org_code`（`TOWN-DUJI` 等，已存在且规范） |
| `areaName` | ⚠️ 需归一化（去掉「作业中心」后缀；统一镇/乡/街道后缀） |
| `areaTeam` | ✅ 三值枚举；「公司管理」= `COMPANY_MANAGEMENT` |
| `parentCode` | ✅ 乡镇 → `CENTER-HW`；中心 → `COMPANY-001` |
| `managerAccountId` | 🔴 11/12 有值（津城街道空缺）；组织表 `manager_id` 全 NULL，只能从 `grid_areas` 二级网格长派生 |
| `status` | ✅ 20 个有效组织全部 active |

### 10.5 T5 `t_violation_record`（30 字段）

| 审计项 | 结论 |
|---|---|
| `violationId` | ✅ 保持 `SW-YYYYMMDD-NNNN` |
| `discoverAreaCode` | ✅ 取值 = 12 乡镇 + `COMPANY-MGMT` |
| `violator*` 快照 7 列 | ⚠️ `violatorTeam` / `violatorWorkUnit` 大概率为空（源数据缺失），**保持可空** |
| `reviewAccountId/Name` | 🔴 **待 REVIEW_ASSIGNMENT 决策后补** |
| `responsibleAreaCode` | ✅ 对齐 T4 |
| 建议新增 | 🔴 `discoverPosition`、`discoverGridLevel`（范围判定需要，当前账号表只有 dept/position） |

### 10.6 T6 `t_photo`（8 字段）

- ✅ 设计无需变更。
- ⚠️ `url` 保持可空（WPS 附件换不出直链，§9.2）。
- 📌 建议：BEFORE 照片落盘后立刻回写 `violationId`，与 NODE-01 `staging.ts` 行为一致。

### 10.7 T7 `t_transfer`（13 字段）

- ✅ 设计无需变更。
- 🔴 **转派目标候选人的数据来源必须明确**：当前只有 11 名二级网格长 + 5 名一级网格长可作为「责任管理员」候选，比预期少。
- ⚠️ `toAreaCode` 若选津城街道，将**无候选人可选**，UI 须给出明确提示而非静默空列表。

### 10.8 T8 `t_review`（7 字段）

- ✅ 设计无需变更。
- 🔴 `reviewerAccountId` 的**来源规则**取决于 REVIEW_ASSIGNMENT 决策（§8）。

### 10.9 索引建议（给 NODE-02B）

WPS 多维表无显式索引能力，但**逻辑上应按以下字段建视图/排序**以缓解无过滤问题：

```text
t_roster          → township（主）、dept（次）
t_violation_record → status（主）、discoverAreaCode（次）、discoverAccountId
t_photo            → violationId + photoType
t_transfer         → toAccountId + status
t_review           → violationId
```

---

## 11. 数据质量问题清单（摘要，详见独立文档）

| 编号 | 级别 | 问题 | 影响 |
|---|---|---|---|
| Q-01 | 🔴 P0 | `v_employee_current` 不含 `employment_relation`，含 1800 名辞职人员 | 花名册污染 |
| Q-02 | 🔴 P0 | `employee.phone` 全密文 | V1 手机号登录受阻 |
| Q-03 | 🔴 P0 | 作业单元覆盖率 4.6%（59/1291） | `OWN_UNIT`/`OWN_TEAM` 不可实现 |
| Q-04 | 🟠 P1 | 三违字典仅 1/3 分类、14 条 | 三违规则不可导入 |
| Q-05 | 🟠 P1 | 三违名称与字典不一致 + 组合值未原子化 | 行为选择会选错 |
| Q-06 | 🟠 P1 | 津城街道无乡镇作业中心经理 | 转派无责任人 |
| Q-07 | 🟠 P1 | 乡镇命名不一致（`柴胡店` vs `柴胡店镇`） | 范围匹配失效 |
| Q-08 | 🟡 P2 | 152 人 `employment_relation` 为 NULL | 需人工确认在职 |
| Q-09 | 🟡 P2 | 30+ 组同名人员 | 姓名不可作身份键 |
| Q-10 | 🟡 P2 | `position` 50 条含同名重复、双编码体系 | 岗位下拉重复 |
| Q-11 | 🟡 P2 | 89 个作业单元中 64 个挂 0 人 | 班组主数据空转 |
| Q-12 | 🟡 P2 | `hse_responsibility_area` 空表 | 无区域主数据 |
| Q-13 | 🟡 P2 | 「公司管理」在 `position` 列出现 25 次 | 维度污染（本项目不继承） |
| Q-14 | 🟡 P2 | 所有 `hse_org_unit.manager_id` 为 NULL | 无默认管理员 |

完整清单（含 SQL 复现脚本与建议处置）见 `MOBILE-WPS-V1-DATA-QUALITY-ISSUES.md`。

---

## 12. 风险清单

| 编号 | 风险 | 等级 | 缓解建议 |
|---|---|---|---|
| R-01 | 手机号密文 + 无行级权限 ⇒ 手机端身份识别方案悬空 | 🔴 高 | 决策项 D-02；备选「员工ID + 口令」 |
| R-02 | WPS 无条件过滤 × 1291 人 ⇒ 手机端性能/流量 | 🔴 高 | 中间层缓存；或提前切 PG |
| R-03 | 三违规则不完整 ⇒ 建表后仍要返工 | 🟠 中 | NODE-02B 前必须完成业务补清单 |
| R-04 | 班组数据缺失 ⇒ 范围模型要砍功能 | 🟠 中 | 决策项 D-03；或先只做 OWN_TOWNSHIP/ALL |
| R-05 | 复查规则未定 ⇒ 记录卡在 PENDING_REVIEW | 🟠 中 | 决策项 D-01，上线前必须闭环 |
| R-06 | 11/13 经理上级为同一人 ⇒ 复查任务单点汇聚 | 🟡 低 | 方案 A 需评估工作量 |
| R-07 | 花名册含 1291 条个人信息进 WPS ⇒ 合规 | 🟠 中 | 建议只导必要字段；`phone` 不导 |

---

## 13. 下一节点建议

### 13.1 判定

```text
NODE-02A = CONDITIONAL_PASS
⇒ 下一节点：MOBILE-WPS-V1-NODE-02B-BLOCKED
```

**不建议直接进入 NODE-02B（真实 WPS 建表与数据导入）**，因为以下四项未完成即建表会导致返工：

| 阻塞项 | 说明 |
|---|---|
| `D-01 REVIEW_ASSIGNMENT` | 复查人规则未定（任务书明令禁止自行决定） |
| `D-02 LOGIN_IDENTITY` | 手机号密文 ⇒ 登录身份识别方案未定 |
| `D-03 SCOPE_MODEL` | `OWN_UNIT`/`OWN_TEAM` 数据不可支撑，需确认是否降级为 2 级范围 |
| `D-04 VIOLATION_RULE_SOURCE` | 三违清单不完整（1/3 分类），不可导入 |

### 13.2 决策单汇总（需业务负责人确认）

| 编号 | 决策项 | 现状 |
|---|---|---|
| **D-01** | 复查人如何确定（A/B/C/D） | `PENDING_HUMAN_DECISION` |
| **D-02** | 手机端身份识别方式（手机号 / 员工ID+口令 / 短信） | 待定 |
| **D-03** | 检查范围是否降级为 `ALL` + `OWN_TOWNSHIP` 两级 | 待定 |
| **D-04** | 三违行为完整清单由谁提供、何时提供 | 待定 |
| **D-05** | 152 名 `employment_relation=NULL` 人员是否纳入 | 建议不纳入 |
| **D-06** | 津城街道责任管理员由谁担任 | 待定 |

### 13.3 产出物清单

| 文件 | 内容 |
|---|---|
| `MOBILE-WPS-V1-NODE-02A-REPORT.md` | 本主报告（14 章 + 节点状态） |
| `MOBILE-WPS-V1-ROSTER-MAPPING.md` | 人员字段映射（t_roster / t_account） |
| `MOBILE-WPS-V1-VIOLATION-RULE-MAPPING.md` | 三违规则字段映射（t_violation_rule） |
| `MOBILE-WPS-V1-DATA-QUALITY-ISSUES.md` | 14 条数据质量问题清单 |
| `MOBILE-WPS-V1-REVIEW-DECISION.md` | 复查规则决策单（`PENDING_HUMAN_DECISION`） |
| **`WPS-TABLE-BUILD-SPEC.md`** | **8 表最终建表字段说明**（由 `schema.ts` 自动导出） |
| **`import-templates/*.csv`** | **8 个导入模板（仅表头，零真实数据）** |
| `MIDDLEWARE-CONTRACT.md`（已修改） | 新增 §7 NODE-04 可实现性审计 + M-1…M-6 强制条款 |

### 13.4 解除阻塞后可立即执行的 NODE-02B 范围

1. 按 `WPS-TABLE-BUILD-SPEC.md` 在独立 WPS 文件 `MW_HSE_V1` 建 8 张表（**先建枚举选项再写记录**，条款 M-6）；
2. 导入 `t_roster` 1291 条（不含 `phone`、`workUnit` 留空）；
3. 导入 `t_area` 16 条（按 §6.4；津城街道管理员待 D-06）；
4. 导入 `t_account` 62 条网格人员（按 D-02 结果决定登录键）；
5. `t_violation_rule` 待 D-04 后再导（本阶段保持 TEST 占位）；
6. NODE-04 实现时须同时满足 `MIDDLEWARE-CONTRACT.md` §7 的 M-1…M-6。

---

## 14. 最终状态

### 14.1 完成判定核对表

| # | 判定项 | 结果 |
|---|---|---|
| 1 | 已找到真实人员主数据来源 | ✅ `employee` + `employee_assignment` + `v_employee_current` + `employment_relation` 过滤 |
| 2 | 已找到真实三违规则来源 | ⚠️ **条件性** `sanwei_behavior_dict` + `violation-rule.json`，但内容不完整 |
| 3 | 已完成人员字段映射 | ✅ 见 `MOBILE-WPS-V1-ROSTER-MAPPING.md` |
| 4 | 已完成三违字段映射 | ✅ 见 `MOBILE-WPS-V1-VIOLATION-RULE-MAPPING.md` |
| 5 | 已完成组织/区域映射 | ✅ 20 组织 + 16 区域（含 1 空缺） |
| 6 | 已完成检查范围能力审计 | ⚠️ **条件性** 2/4 可支撑，2/4 `NEEDS_BUSINESS_CONFIRMATION` |
| 7 | 已完成 8 表字段级审计 | ✅ §10 |
| 8 | 已完成 WPS 能力审计 | ✅ §9（未做写入验证，符合任务书） |
| 9 | 已形成数据质量问题清单 | ✅ 14 条，见 §11 + 独立文档 |
| 10 | 已明确真实数据哪些可直接导入 | ✅ `t_roster`(1291)、`t_area`(15/16)、`t_account`(62) |
| 11 | 已明确哪些需要人工确认 | ✅ D-01…D-06 + NULL 在职 152 人 |
| 12 | 复查规则标记为待业务决策 | ✅ `REVIEW_ASSIGNMENT = PENDING_HUMAN_DECISION` |
| 13 | 29 条原有测试仍全部 PASS | ✅ **29/29 PASS** |
| 14 | 未修改正式 HSE 业务 | ✅ 见 §14.3 |
| 15 | 未修改 WPS-PG-SYNC | ✅ |
| 16 | 未修改 E-08-11 | ✅ 未引用扣分字段 |
| 17 | 未写真实 WPS | ✅ 零写入 |
| 18 | 未启动云服务器 | ✅ 零启动 |

### 14.2 测试与类型检查

```text
vitest  apps/web-naive/src/api/mw/__tests__/foundation.spec.ts
        Test Files  1 passed (1)
             Tests  29 passed (29)          ← 与 NODE-01 一致，无回归

vue-tsc (web-naive, --noEmit)
        mw 相关错误（src/api/mw、src/views/mw、layouts/mw）  = 0     ✅
        全仓错误总数                                          = 60
        错误分布（与本节点无关的历史遗留）：
          38  src/views/hse/assessment-rule/index.vue
           4  src/views/training/certificates/index.vue
           4  src/views/hse/meeting-records/index.vue
           4  src/views/hse/assessment-monthly/scoring.vue
           3  src/views/hse/assessment-monthly/deduction-adjust.vue
           2  src/views/site/grid/index.vue
           2  src/views/hse/responsibility-forms/index.vue
           1  src/views/training/ledger/index.vue
          (其余 2)
```

> 说明：NODE-01 报告记录的全仓基线为 66，本次实测 60。差异来自 NODE-01 期间多次 `vue-tsc` 后台并发运行（部分跑在文件写入中途），**本次为串行干净运行**。关键指标是 **mw 相关 = 0**，即本方向未引入任何类型错误。

### 14.3 变更面（git）

本节点**仅新增**审计脚本与文档目录，**未修改**任何既有源码：

- 新增：`_mw_audit/ro-probe.cjs`（只读审计探针）
- 新增：`_mw_audit/gen-build-spec.cjs`（由 `schema.ts` 自动导出建表规格与 CSV 模板的脚本）
- 新增：`docs/MOBILE-WPS/` 下 6 份文档 + `import-templates/` 8 个 CSV 表头（**仅表头，零真实数据**）
- 修改：**1 份** `docs/MOBILE-WPS/MIDDLEWARE-CONTRACT.md` —— 按任务书第十六条授权，新增 §7「NODE-04 可实现性审计」及 M-1…M-6 强制条款（纯文档，不含代码）
- 未触碰：`server/**`（含 WPS-PG-SYNC、E-08-11、登录/JWT、scheduler、site-mgmt、AI）、`安全看板vben/apps/web-naive/src/api/mw/**`、`src/views/mw/**`、`src/layouts/mw.vue`、`src/router/routes/modules/mw.ts`

**未新增任何 npm 依赖。**

#### 工作区变更面核对（`git status --porcelain`）

```text
本节点目标路径（src/api/mw、src/views/mw、layouts/mw、routes/modules/mw、
                services/wps*、wpsGrid*、E-08-11、e0811）
   ⇒ 修改数 = 0     ✅ 未触碰

全仓 M 状态文件 = 42 个，全部为本节点之前已存在的脏工作区或并发会话产物：
   · 绝大多数 mtime 为 2026-09-13 / 09-14（E-08-11、考核、网格归因等历史改动）
   · 3 个文件 mtime 落在今日 10:43–10:56（GMT+8）：
       docs/191副/_index.md                        (+11)
       docs/191副/project_memory.md                (+79/-84)
       安全看板vben/apps/web-naive/src/views/hse/ai-analysis/index.vue  (+1041)
     ⚠️ 这 3 个文件**不是本节点写入的**。本节点自 11:01 起只执行了
        只读 SQL / vitest / vue-tsc / 写 docs/MOBILE-WPS 与 _mw_audit，
        没有任何命令会写入上述路径。请项目负责人确认是否为并发的
        其他会话/工具/计划任务所改。
```

> 结论：**NODE-02A 对现有系统零影响**；工作区中既有的 42 项修改与本节点无关。

### 14.4 节点状态

```text
MOBILE-WPS-V1-NODE-02A
状态：CONDITIONAL_PASS

完成项：
  · 真实人员主数据口径确立（正式员工 1291）
  · 真实三违规则来源定位（字典 15 条 / 分类 3 类 / 实际使用 21 值）
  · 人员字段映射（10 字段，含风险标注）
  · 三违字段映射（9 字段，含缺口标注）
  · 组织/责任区域映射（20 组织 / 16 区域）
  · 检查范围能力审计（2 可支撑 / 2 需确认）
  · 8 表字段级冻结建议
  · WPS 能力审计（零写入）
  · 14 条数据质量问题清单
  · 29/29 测试通过、零依赖、零写入、零服务器

未完成项：
  · 三违规则完整清单（仅 1/3 分类）
  · OWN_UNIT / OWN_TEAM 范围数据支撑
  · 津城街道责任管理员

阻塞项：
  D-01 REVIEW_ASSIGNMENT = PENDING_HUMAN_DECISION
  D-02 LOGIN_IDENTITY（手机号密文）
  D-03 SCOPE_MODEL（范围降级确认）
  D-04 VIOLATION_RULE_SOURCE（三违清单补齐）

下一节点：
  MOBILE-WPS-V1-NODE-02B-BLOCKED（四项决策闭环后方可进入 NODE-02B 建表）

需要用户提供的数据：
  ① 复查人规则（D-01）
  ② 手机端身份识别方案确认（D-02）
  ③ 检查范围是否降级（D-03）
  ④ 完整三违行为清单（D-04）
  ⑤ 津城街道责任管理员指定（D-06）
```

---

> **本节点到此停止，不自动进入下一节点。**

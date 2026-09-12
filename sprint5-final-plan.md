# HSE Sprint5 最终实施计划

> 版本：v1.0（最终版）
> 日期：2026-07-20
> 依据：
>   - `v2-feasibility-analysis.md`（V2.0 架构可行性分析）
>   - `batch-import-design-v1.2-final.md`（批量导入中心设计）
>   - `HSE-V2.0.1-release-acceptance-report.md`（V2.0.1 发布验收报告）
>   - `hse-employee-master-data-design-v2.0-final.md`（人员主数据最终设计）
> 状态：**Sprint5 路线最终冻结，编码依据本文档执行**

---

## 一、路线调整说明

### 1.1 调整背景

**原路线（已废弃）**：

```
Sprint5.1 整改闭环 → Sprint5.2 检查管理 → Sprint5.3 隐患治理 → Sprint5.4 安全台账
```

**核心问题**：整改任务的 `responsible_person_id`、检查任务的 `inspector_ids`、隐患的 `discoverer_id` 等所有人员字段需要指向统一人员主体。当前系统 `training_records` 使用 `personnel_id`、`insurance` 使用内存 personnel、`users` 表为登录用户，**三套人员标识并存**，导致：

| 问题 | 影响 |
|------|------|
| 责任人无法定位 | 整改/检查/隐患的责任人无法关联到统一人员档案 |
| 数据隔离失败 | `enterprise_id` 隔离需要通过员工 → 组织关系推导 |
| 历史可追溯性 | 调岗后原责任人记录无法保留责任链 |
| 证件资质校验 | 特种作业人员上岗前需校验证件有效性，缺统一证件库 |
| 风险画像缺失 | 整改任务分配、检查人选派无人员风险画像参考 |

### 1.2 最终路线

```
Sprint5.1  HSE人员主数据中心  ← 基础中的基础
    │
    │ 所有安全业务必须依赖 employee_id
    │ employee 为唯一人员主表，禁止新增重复人员表
    ▼
Sprint5.2  安全基础台账
    │（培训/保险/驾驶员/证照 → 全部关联 employee_id）
    ▼
Sprint5.3  检查管理
    │（检查任务/检查人/检查记录 → inspector_ids 关联 employee_id）
    ▼
Sprint5.4  隐患整改闭环
    （隐患发现/整改责任/复查人 → discoverer/responsible/reviewer 关联 employee_id）
```

### 1.3 调整原则

**「人员优先，业务后置」**：所有安全业务必须依赖 `employee_id`，先建人员主数据中心，再逐步迁移/重构业务模块。

**「一次关联，终身复用」**：Sprint5.1 建好人员体系后，Sprint5.2/5.3/5.4 全部直接复用 `employee_id` 关联，不再各自维护人员标识。

**「增量迁移，不破坏现有」**：现有 `training_records.personnel_id`、`insurance.personnel` 等旧字段保留，Sprint5.2 阶段新增 `employee_id` 列做双写过渡，不删除旧字段，不破坏现有功能。

---

## 二、技术约束（红线，严格遵守）

| 约束项 | 说明 | 验证方式 |
|--------|------|---------|
| 禁止修改 Vben 核心目录 | 不碰 `packages/@core/`、`packages/effects/`、`packages/themes/` | Git diff 检查 |
| 禁止修改 auth/JWT | 不修改 auth middleware、auth routes、auth store、JWT、登录页面 | 代码审查 |
| 禁止新增 npm 依赖 | 复用已有 `xlsx`、`multer`、`pg`、`zod`、`bcryptjs` 等 | package.json diff |
| 禁止新增重复人员表 | `employee` 为唯一人员主表，所有关联使用 `employee_id` | 数据库表清单审查 |
| 禁止硬编码颜色 | 全部使用 CSS 变量（`hsl(var(--border))` 等） | 代码审查 |
| 组件隔离 | 业务组件放 `views/hse/{module}/components/`，不进 `src/components/` | 目录审查 |
| AI 边界 | AI 不自动定级、不自动处罚、不自动判定责任 | 代码审查 + 测试验证 |
| 软删除规范 | 所有表保留 `is_deleted BOOLEAN DEFAULT FALSE` | 迁移脚本审查 |
| 响应格式统一 | 成功 `code: 0`，失败 `code: -1`，保留 `success` 字段 | API 测试 |
| 权限矩阵 | admin/safety_manager 可写，其他只读；使用 `requireRole` 中间件 | 权限测试 |

---

## 三、Sprint5.1 — HSE人员主数据中心

### 3.1 目标

建立 HSE 系统**唯一人员主数据中心**，作为后续所有安全业务的人员数据源。所有责任人、检查人、整改人、复查人统一通过 `employee_id` 关联。

### 3.2 开发范围（7 张表 + 1 视图）

| 序号 | 表/视图名 | 类型 | 来源 | 说明 |
|------|----------|------|------|------|
| 1 | `department` | 主表 | v1.2 已冻结 | 组织模型（五级树形：集团/区域/企业/项目/班组） |
| 2 | `position` | 主表 | v1.2 已冻结 | 岗位模型（含特种作业/安全关键标识） |
| 3 | `employee` | 主表 | v1.2 已冻结 | 员工主表（**唯一人员表**，id_card/phone 加密 + 哈希） |
| 4 | `hse_employee_org` | 关系表 | v1.2 已冻结 | 人员组织关系（五级组织引用 + org_path 快照 + is_current） |
| 5 | `employee_history` | 历史表 | v1.2 已冻结 | 人事变动记录（含 operator_id 操作人） |
| 6 | `employee_certificate` | 扩展表 | 本文档新增 | 证件统一管理（特种作业操作证、安全资格证、健康证等） |
| 7 | `employee_safety_profile` | 扩展表 | 本文档新增 | 一人一档风险画像（风险等级、事故/违章/培训统计） |
| 8 | `v_employee_with_age` | 视图 | v1.2 已冻结 | 员工年龄计算视图 |

### 3.3 Excel 花名册导入（Sprint5.1 增加项）

**背景**：用户明确要求增加「Excel 花名册导入」功能。Sprint5.1.1 已实现基础 Excel 导入（9 个字段），本 Sprint 在此基础上扩展为完整花名册导入。

**导入字段扩展**：

| 字段组 | 字段 | 说明 |
|--------|------|------|
| 基础信息 | employee_code, name, gender, birth_date, id_card, phone | v5.1.1 已有 |
| 人员属性 | person_category, person_type, is_public_welfare | v5.1.1 已有 |
| 入职信息 | hire_date, entry_date, formal_date | 新增 |
| 组织分配 | dept_path, position_name, team_name | 新增（支持按名称匹配组织） |
| 岗位信息 | job_category, is_special_post, is_safety_critical | 新增（创建/关联岗位） |
| 户籍地址 | household_address, current_address | 新增 |
| 紧急联系人 | emergency_contact, emergency_phone | 新增 |

**导入流程**：

```
上传 Excel
    ↓
模板校验（表头匹配）
    ↓
逐行解析 + 逐行校验
    ↓
预检查（重复工号/身份证/手机号检测）
    ↓
组织匹配（部门路径 → department.id，岗位名称 → position.id）
    ↓
生成预览（成功行 / 失败行 + 错误明细）
    ↓
人工确认
    ↓
批量导入（事务：employee + hse_employee_org + position 按需创建）
    ↓
返回导入结果（成功数/失败数/错误明细）
```

**关键技术决策**：
- 复用 Sprint5 批量导入中心的 **预检查 + 确认执行** 模式
- 组织匹配支持按部门名称路径（如「集团/区域/企业/项目/班组」）模糊匹配
- 岗位支持「不存在则自动创建」（可配置开关，默认关闭）
- 身份证号/手机号唯一性校验使用 HMAC-SHA256 哈希列（v60 已有）
- 导入后自动分配组织关系（is_current=true）

### 3.4 API 端点（约 40+ 个）

| 模块 | 端点数 | 说明 |
|------|--------|------|
| 员工管理 | 10 | CRUD + 统计 + JSON/Excel 导入 + 花名册导入 |
| 组织管理 | 5 | 树 + 扁平 + CRUD |
| 岗位管理 | 4 | CRUD |
| 组织关系 | 4 | 查询 + 历史 + 调岗 + 状态变更 |
| 历史记录 | 1 | 查询 |
| 证件管理 | 10 | CRUD + 批量导入 + 员工证件 + 临期 + 过期 + 统计 |
| 一人一档 | 6 | 查询 + 统计 + 员工档案 + 评估 + 批量评估 + 更新 |
| **合计** | **40+** | |

### 3.5 前端页面

```
views/hse/employee/
  ├─ index.vue                     员工列表页
  ├─ departments.vue               组织管理页
  ├─ positions.vue                 岗位管理页
  ├─ certificates.vue              证件管理页
  ├─ safety-profiles.vue           一人一档页
  └─ components/
      ├─ EmployeeEditModal.vue     员工编辑弹窗
      ├─ EmployeeImportModal.vue   导入弹窗（Excel/JSON/花名册）
      ├─ OrgTransferModal.vue      调岗弹窗
      ├─ EmployeeHistoryDrawer.vue 历史抽屉
      ├─ CertificateEditModal.vue  证件编辑弹窗
      ├─ CertificateViewDrawer.vue 证件查看抽屉
      ├─ ExpiringCertCard.vue      临期预警卡片
      └─ SafetyProfileDrawer.vue   一人一档抽屉
```

### 3.6 数据库迁移版本

| 版本 | 脚本文件 | 内容 | 状态 |
|------|---------|------|------|
| v59 | `hse_employee_master_v59_migration.sql` | 5 表 + 1 视图 | ✅ 已执行 |
| v60 | `hse_employee_master_v60_hardening.sql` | operator_id + 哈希列 | ✅ 已执行 |
| v61 | `hse_employee_master_v61_extension.sql` | 证件 + 一人一档 + 花名册扩展字段 | ⏳ 待执行 |

### 3.7 交付物

- [x] 设计文档：`hse-employee-master-data-design-v2.0-final.md`
- [ ] 数据库迁移：v61 迁移脚本
- [ ] 后端路由：`server/routes/hse-employee.js`（扩展证件 + 一人一档 + 花名册导入）
- [ ] 前端 API：`apps/web-antd/src/api/hse/employee.ts`（扩展）
- [ ] 前端页面：5 个页面 + 8 个组件
- [ ] 集成测试：≥ 100 项（含权限测试）
- [ ] 开发报告 + 测试报告 + 数据库迁移说明

---

## 四、Sprint5.2 — 安全基础台账

### 4.1 目标

将现有培训、保险、驾驶员、证照四大类安全台账**统一迁移到 employee_id 体系**，建立完整的安全基础台账体系。所有人员类台账从 `personnel_id` / 内存模式迁移到 `employee_id` 关联。

### 4.2 开发范围（4 大模块）

#### 4.2.1 培训台账

| 项 | 说明 |
|----|------|
| 现有表 | `training_records`（含 `personnel_id`）、`training_attachments`、`training_versions` |
| 改造内容 | 新增 `employee_id` 列（双写过渡），`personnel_id` 保留不删除 |
| 关联方式 | `training_records.employee_id → employee.id` |
| 证件关联 | 培训合格证 → `employee_certificate`（培训合格后自动生成证件记录，可选） |
| 一人一档联动 | 培训完成后更新 `employee_safety_profile.training_count` / `training_hours` / `last_training_date` |

**培训台账页面**：
- 培训计划管理（年度计划、月度计划）
- 培训记录台账（按员工、按部门、按类型统计）
- 新员工安全培训
- 驾驶员实操培训
- 培训效果评估

#### 4.2.2 保险台账

| 项 | 说明 |
|----|------|
| 现有模块 | `insurance.js`（车辆保险、人员保险、超龄保险，内存 + DB 双模式） |
| 改造内容 | 人员保险 `employee_id` 关联，车辆保险关联车辆表（不在本次范围） |
| 关联方式 | `insurance_personnel.employee_id → employee.id`（新增表） |
| 一人一档联动 | 超龄人员保险状态 → `employee_safety_profile.health_status` 参考 |

**保险台账页面**：
- 人员保险台账（工伤保险、意外险、雇主责任险）
- 保险到期预警
- 保险费用统计
- 保险理赔记录

#### 4.2.3 驾驶员台账

| 项 | 说明 |
|----|------|
| 现有模块 | 驾驶员信息分散在 training/driver、insurance/vehicle 等 |
| 改造内容 | 统一到 employee 体系，驾驶员作为 `person_type=生产人员` 的子类 |
| 关联方式 | 驾驶员 = `employee` + `person_type=生产人员` + 驾驶员证件（`employee_certificate` 中 cert_category=driver_license） |
| 证件关联 | 驾驶证、从业资格证、危化品运输证 → `employee_certificate` |
| 一人一档联动 | 驾驶员违规记录 → `employee_safety_profile.violation_count` |

**驾驶员台账页面**：
- 驾驶员信息台账
- 驾驶证/从业资格证管理（复用 `employee_certificate`）
- 驾驶员培训记录（复用培训台账）
- 驾驶员违规记录
- 驾驶员体检管理

#### 4.2.4 证照管理

| 项 | 说明 |
|----|------|
| 现有模块 | 无统一证照管理，证件信息分散 |
| 改造内容 | 统一复用 Sprint5.1 的 `employee_certificate` 表 |
| 证照分类 | 特种作业操作证、安全资格证、职业健康证、特种设备作业证、驾驶员证件、其他 |
| 管理功能 | 证照登记、到期预警、复查提醒、批量导入、统计报表 |

**证照管理页面**：
- 证照总览看板（按分类/状态/到期时间统计）
- 证照列表（筛选 + 搜索）
- 证照临期预警（30天/60天/90天）
- 证照批量导入（复用批量导入中心）

### 4.3 迁移策略（双写过渡）

```
阶段一（Sprint5.2 前期）：双写模式
  ├── 新增 employee_id 列
  ├── 新数据同时写入 personnel_id + employee_id
  └── 读操作仍从 personnel_id（兼容旧数据）

阶段二（Sprint5.2 中期）：历史数据迁移
  ├── 批量匹配：通过 id_card_hash / name + phone 匹配 employee
  ├── 匹配成功：回填 employee_id
  └── 匹配失败：标记为待人工处理

阶段三（Sprint5.2 后期）：切换主关联
  ├── 读操作切换到 employee_id
  ├── personnel_id 标记为 deprecated（保留但不使用）
  └── 一人一档统计字段自动更新
```

### 4.4 关键技术决策

1. **不删除旧字段**：`personnel_id`、`id_card`（明文）等旧字段保留，标记为 deprecated，不物理删除
2. **双写过渡**：新增数据同时写入新旧字段，确保回滚安全
3. **匹配优先哈希**：历史数据迁移优先通过 `id_card_hash` 精确匹配，其次通过姓名+手机号模糊匹配
4. **复用证件体系**：所有证照统一使用 `employee_certificate` 表，不按业务分表
5. **统计字段事件驱动**：`employee_safety_profile` 的统计字段通过事件触发更新（培训完成、违章登记等）

### 4.5 交付物

- 设计文档：`sprint5.2-ledger-design.md`
- 数据库迁移：v62 迁移脚本（培训/保险/驾驶员 employee_id 扩展）
- 后端路由：4 个业务路由（扩展 employee_id 关联）
- 前端页面：4 个台账页面 + N 个组件
- 集成测试：≥ 80 项
- 数据迁移脚本：历史数据匹配 + 回填工具
- 开发报告 + 测试报告 + 迁移说明

---

## 五、Sprint5.3 — 检查管理

### 5.1 目标

建立完整的**安全检查管理体系**，支持日常检查、专项检查、季节性检查等多种检查类型，检查人统一通过 `employee_id` 关联，检查结果可直接生成隐患并流转到 Sprint5.4 整改闭环。

### 5.2 开发范围

#### 5.2.1 检查任务管理

| 表名 | 说明 | 关键字段 |
|------|------|---------|
| `hse_inspection_tasks` | 检查任务主表 | task_no, task_name, task_type, check_date, inspector_ids(employee_id[]), enterprise_id, department_id, status |
| `hse_inspection_items` | 检查明细表 | task_id, item_name, check_content, check_result, checked_by(employee_id), issue_description, rectification_required |
| `hse_inspection_checklists` | 检查表模板 | template_name, category, items(JSON) |

**检查类型**：
- 日常检查（日巡检、周检查）
- 专项检查（消防安全、用电安全、特种设备）
- 季节性检查（防汛、防暑、防冻）
- 节假日检查
- 上级督查

#### 5.2.2 检查流程

```
创建检查任务
    ↓
指派检查人（inspector_ids → employee_id[]）
    ↓
执行检查（逐项填写检查结果）
    ↓
发现问题 → 生成隐患记录（自动流转到 Sprint5.4 整改）
    ↓
检查完成 → 生成检查报告
    ↓
归档
```

#### 5.2.3 与人员主数据的关联

| 关联点 | employee_id 用途 |
|--------|-----------------|
| `inspector_ids` | 检查人列表，关联 `employee` 表，校验检查人资质 |
| `checked_by` | 单项检查人，记录具体谁检查的 |
| 检查组 | 可按部门/岗位/班组批量指派检查人 |
| 检查人资质校验 | 检查前校验检查人是否具备对应安全资格证（`employee_certificate`） |
| 检查人风险参考 | 参考 `employee_safety_profile.risk_level` 安排高风险区域检查 |

#### 5.2.4 检查表管理

- 预置常用检查表模板（消防安全、用电安全、机械安全等）
- 支持自定义检查表（增删改查）
- 检查项支持：单选、多选、填空、数值、附件
- 检查项可关联标准条款（`safety_standard_clauses`）

### 5.3 关键技术决策

1. **检查人数组存储**：`inspector_ids` 使用 PostgreSQL `BIGINT[]` 数组类型，支持 `@>` 包含查询
2. **隐患自动生成**：检查发现问题可一键生成隐患记录，关联到整改闭环
3. **标准条款联动**：检查项可关联 GB/T 33000 标准条款，检查结果影响标准化评价
4. **移动检查预留**：API 设计支持移动端检查场景（离线检查、照片上传）

### 5.4 交付物

- 设计文档：`sprint5.3-inspection-design.md`
- 数据库迁移：v63 迁移脚本
- 后端路由：检查管理路由（任务 + 明细 + 检查表）
- 前端页面：检查任务列表、检查执行、检查表管理、检查统计
- 集成测试：≥ 60 项
- 开发报告 + 测试报告

---

## 六、Sprint5.4 — 隐患整改闭环

### 6.1 目标

建立完整的**隐患整改闭环体系**，实现「发现 → 登记 → 派单 → 整改 → 复查 → 关闭」全流程管理，所有人员角色（发现人、责任人、复查人）统一通过 `employee_id` 关联。

### 6.2 开发范围

#### 6.2.1 隐患管理

| 表名 | 说明 | 关键字段 |
|------|------|---------|
| `hse_hazard_records` | 隐患记录表 | hazard_no, title, description, hazard_level, discoverer_id(employee_id), discover_date, enterprise_id, department_id, status, source_type |
| `hse_hazard_attachments` | 隐患附件表 | hazard_id, file_name, file_url, file_type |
| `hse_rectification_tasks` | 整改任务表 | hazard_id, responsible_person_id(employee_id), rectification_deadline, rectification_measures, status, actual_finish_date |
| `hse_review_records` | 复查记录表 | rectification_id, reviewer_id(employee_id), review_result, review_date, review_opinion |

**隐患等级**：一般隐患 / 较大隐患 / 重大隐患

**隐患来源**：日常检查、专项检查、上级督查、群众举报、AI 识别、其他

#### 6.2.2 整改闭环流程

```
隐患登记
    │  discoverer_id → employee_id
    ▼
隐患审核（安全管理员审核确认）
    ▼
派单（指派整改责任人）
    │  responsible_person_id → employee_id
    ▼
整改中（责任人落实整改措施）
    ▼
申请复查（整改完成后提交复查申请）
    ▼
复查（复查人现场核实）
    │  reviewer_id → employee_id
    ├─ 复查通过 → 隐患关闭 ✅
    └─ 复查不通过 → 退回重整改 ↺
    ▼
归档
```

#### 6.2.3 与人员主数据的关联

| 关联点 | employee_id 用途 |
|--------|-----------------|
| `discoverer_id` | 隐患发现人，记录发现人员档案 |
| `responsible_person_id` | 整改责任人，关联员工组织关系推导所属企业/部门 |
| `reviewer_id` | 复查人，校验复查人资质（安全管理员以上） |
| 整改超期预警 | 责任人通知（预留，可对接消息通知） |
| 人员风险画像 | 隐患整改超期 → `employee_safety_profile.rectification_overdue_count++` |
| 责任人能力参考 | 参考 `employee_safety_profile` 历史整改记录分配整改任务 |

#### 6.2.4 统计分析

- 隐患数量趋势（按月/按季度/按年）
- 隐患等级分布
- 隐患来源分布
- 整改完成率 / 超期率
- 部门/企业隐患排名
- 责任人整改绩效（人均整改数、平均整改时长、超期率）

### 6.3 与其他模块的联动

| 模块 | 联动方式 |
|------|---------|
| Sprint5.3 检查管理 | 检查发现问题 → 自动生成隐患记录 |
| Sprint5.1 人员主数据 | 所有人员字段关联 employee_id，风险画像统计更新 |
| Sprint5.2 培训台账 | 重复性隐患 → 触发针对性培训计划 |
| Sprint4 标准化评价 | 隐患整改情况 → 影响标准化自评结果 |
| Sprint3 安全汇报 | 隐患统计数据 → 自动汇总到月报 |

### 6.4 关键技术决策

1. **状态机管理**：隐患状态严格按状态机流转，禁止状态跳跃
2. **三分离原则**：发现人 ≠ 整改人 ≠ 复查人（可配置）
3. **超期自动升级**：整改超期自动升级预警，通知上级
4. **软删除保留**：隐患软删除，保留审计追溯
5. **AI 辅助分析**：AI 分析隐患根因、给出整改建议（仅供参考，不自动派单）

### 6.5 交付物

- 设计文档：`sprint5.4-rectification-design.md`
- 数据库迁移：v64 迁移脚本
- 后端路由：隐患管理 + 整改任务 + 复查记录
- 前端页面：隐患列表、整改跟踪、复查管理、统计看板
- 集成测试：≥ 80 项
- 开发报告 + 测试报告

---

## 七、Sprint5 总体技术架构

### 7.1 数据库表依赖关系

```
department (五级组织)
    │
    │ parent_id (自引用)
    ▼
position (岗位)
    │
    │ dept_id
    ▼
employee (唯一人员主表) ◄────── employee_history (人事变动)
    │                              operator_id → users.id
    │ employee_id
    ├──────────────────────────┐
    │                          │
    ▼                          ▼
hse_employee_org         employee_certificate (证件)
(人员组织关系)                employee_id
    │
    │ enterprise_id (用于数据隔离)
    ▼
┌──────────────────────────────────────────────────────────┐
│              Sprint5.2 安全基础台账                         │
│  training_records.employee_id                             │
│  insurance_personnel.employee_id                          │
│  (驾驶员证照 → employee_certificate)                      │
└──────────────────────────────────────────────────────────┘
    │
    │ employee_id
    ▼
┌──────────────────────────────────────────────────────────┐
│              Sprint5.3 检查管理                             │
│  hse_inspection_tasks.inspector_ids[]                     │
│  hse_inspection_items.checked_by                          │
└──────────────────────────────────────────────────────────┘
    │
    │ 自动生成隐患
    ▼
┌──────────────────────────────────────────────────────────┐
│              Sprint5.4 隐患整改闭环                          │
│  hse_hazard_records.discoverer_id                          │
│  hse_rectification_tasks.responsible_person_id             │
│  hse_review_records.reviewer_id                            │
└──────────────────────────────────────────────────────────┘
    │
    │ 更新统计字段
    ▼
employee_safety_profile (一人一档风险画像)
    - accident_count / violation_count / training_count
    - hazard_involved_count / rectification_count
    - risk_level / risk_score
```

### 7.2 API 整体架构

```
/api/hse/
  ├─ employee/              Sprint5.1 人员主数据（40+ 端点）
  │   ├─ employees/         员工管理
  │   ├─ departments/       组织管理
  │   ├─ positions/         岗位管理
  │   ├─ org/               组织关系
  │   ├─ history/           历史记录
  │   ├─ certificates/      证件管理
  │   └─ safety-profiles/   一人一档
  ├─ training/              Sprint5.2 培训台账（扩展 employee_id）
  ├─ insurance/             Sprint5.2 保险台账（扩展 employee_id）
  ├─ driver/                Sprint5.2 驾驶员台账（新增）
  ├─ inspection/            Sprint5.3 检查管理（新增）
  ├─ hazard/                Sprint5.4 隐患整改（新增）
  ├─ rectification/         Sprint5.4 整改任务（新增）
  └─ ... (其他已有模块)
```

### 7.3 前端路由架构

```
/hse/
  ├─ employee/              Sprint5.1
  │   ├─ list               员工列表
  │   ├─ departments        组织管理
  │   ├─ positions          岗位管理
  │   ├─ certificates       证件管理
  │   └─ safety-profiles    一人一档
  ├─ ledger/                Sprint5.2
  │   ├─ training           培训台账
  │   ├─ insurance          保险台账
  │   ├─ driver             驾驶员台账
  │   └─ certificate        证照总览
  ├─ inspection/            Sprint5.3
  │   ├─ tasks              检查任务
  │   ├─ execution          检查执行
  │   ├─ checklists         检查表模板
  │   └─ stats              检查统计
  └─ hazard/                Sprint5.4
      ├─ list               隐患列表
      ├─ rectification      整改跟踪
      ├─ review             复查管理
      └─ stats              隐患统计
```

---

## 八、实施顺序与依赖关系

### 8.1 Sprint 间依赖

```
Sprint5.1 人员主数据中心
    │ （基础中的基础，必须先完成）
    ▼
Sprint5.2 安全基础台账
    │ （依赖 employee_id 关联，培训/保险/驾驶员迁移）
    ▼
Sprint5.3 检查管理
    │ （依赖 inspector_ids → employee_id）
    ▼
Sprint5.4 隐患整改闭环
    （依赖 discoverer_id / responsible_person_id / reviewer_id → employee_id）
```

**强制依赖**：Sprint5.1 必须先完成并通过验收，才能开始 Sprint5.2。Sprint5.2 完成后开始 Sprint5.3。Sprint5.3 和 Sprint5.4 可部分并行（检查管理核心功能完成后即可启动整改闭环设计）。

### 8.2 Sprint5.1 内部依赖

```
v59/v60 迁移（已完成）
    ↓
员工 / 组织 / 岗位 CRUD（已完成）
    ↓
组织关系 / 调岗 / 历史记录（已完成）
    ↓
v61 迁移（证件 + 一人一档 + 花名册字段）
    ↓
证件管理 CRUD + 预警
    ↓
一人一档 CRUD + 风险评定
    ↓
Excel 花名册导入（扩展版）
    ↓
集成测试 + 权限测试
    ↓
Sprint5.1 验收
```

### 8.3 关键里程碑

| 里程碑 | 交付内容 | 验收标准 |
|--------|---------|---------|
| M1 Sprint5.1 完成 | 人员主数据中心 + 证件 + 一人一档 + 花名册导入 | 100+ 测试通过，权限测试全通过 |
| M2 Sprint5.2 完成 | 安全基础台账 4 大模块 + employee_id 迁移 | 历史数据匹配率 ≥ 95% |
| M3 Sprint5.3 完成 | 检查管理 + 检查表模板 + 隐患自动生成 | 检查→隐患自动流转验证通过 |
| M4 Sprint5.4 完成 | 隐患整改闭环 + 统计分析 | 完整闭环流程验证通过 |

---

## 九、风险与应对

### 9.1 技术风险

| 风险 | 概率 | 影响 | 应对措施 |
|------|------|------|---------|
| 历史数据迁移匹配失败 | 中 | 高 | 优先通过 id_card_hash 精确匹配，其次姓名+手机号模糊匹配，最后人工处理 |
| 双写过渡期间数据不一致 | 低 | 中 | 以 employee_id 为准，定期对账校验 |
| 培训/保险旧代码重构量大 | 中 | 中 | 增量改造，先加 employee_id 列，再切换读路径，最后 deprecated 旧字段 |
| 四级组织 → 五级组织适配 | 低 | 中 | department 已支持五级，现有数据 level 字段可批量更新 |
| 性能问题（大表关联查询） | 低 | 中 | 合理建索引，分页查询，统计数据走物化视图或定时汇总 |

### 9.2 约束合规风险

| 风险 | 应对 |
|------|------|
| 误改 Vben 核心 | 前端改动仅限 `apps/web-antd/src/`，代码审查时检查 |
| 误改登录/认证 | auth 相关文件列入禁止修改清单，CI 检查 |
| 误增依赖 | package.json diff 检查，所有新功能用现有库实现 |
| 误增人员表 | 数据库表清单审查，所有人员类需求走 employee 扩展 |
| AI 越界 | AI 接口独立封装，输出仅供参考，人工确认后才生效 |

### 9.3 业务风险

| 风险 | 应对 |
|------|------|
| 需求蔓延 | 严格按本文档范围实施，变更需走正式变更流程 |
| 数据安全 | 敏感字段加密存储，操作日志留痕，权限严格控制 |
| 回滚风险 | 增量迁移，双写过渡，确保每个阶段都可回滚 |

---

## 十、验收标准

### 10.1 通用验收标准

| 验收项 | 标准 |
|--------|------|
| 数据库迁移 | 全部通过（幂等 + 正确 + 事务保护） |
| 后端单元测试 | ≥ 95% 用例通过 |
| 权限测试 | admin/safety_manager 可写，viewer 只读，未登录 401 |
| 前端 | TypeScript 类型检查通过，关键路径可正常操作 |
| 约束合规 | 不碰 Vben 核心、不改 auth/JWT、不新增依赖 |
| 代码规范 | 无 `!important`、无 `::v-deep`、颜色使用 CSS 变量 |

### 10.2 各 Sprint 验收标准

#### Sprint5.1 验收标准

- ✅ 7 张表 + 1 视图全部创建成功
- ✅ 40+ API 端点全部通过测试
- ✅ 调岗流程：旧记录结束 + 新记录生效 + 历史记录完整
- ✅ 证件管理：CRUD + 临期预警 + 过期自动标记
- ✅ 一人一档：风险评定规则正确 + AI 不参与定级
- ✅ Excel 花名册导入：组织匹配 + 岗位关联 + 批量导入成功
- ✅ 权限：admin/safety_manager 可写，viewer 403，未登录 401
- ✅ 加密：AES-256-GCM + HMAC-SHA256 哈希唯一性校验生效

#### Sprint5.2 验收标准

- ✅ 4 大台账模块功能完整
- ✅ 所有人员字段增加 employee_id 关联
- ✅ 历史数据迁移匹配率 ≥ 95%
- ✅ 双写过渡期间数据一致性验证通过
- ✅ 一人一档统计字段自动更新（培训完成 → training_count++）
- ✅ 证件统一到 employee_certificate 管理

#### Sprint5.3 验收标准

- ✅ 检查任务全流程（创建→指派→执行→完成）
- ✅ inspector_ids 关联 employee_id，支持数组查询
- ✅ 检查表模板管理（增删改查）
- ✅ 检查发现问题 → 自动生成隐患记录
- ✅ 检查人资质校验（检查前校验安全资格证）

#### Sprint5.4 验收标准

- ✅ 隐患整改闭环全流程（登记→派单→整改→复查→关闭）
- ✅ discoverer_id / responsible_person_id / reviewer_id 全部关联 employee_id
- ✅ 状态机严格流转，禁止状态跳跃
- ✅ 整改超期预警功能正常
- ✅ 与检查管理联动（检查→隐患自动生成）
- ✅ 一人一档统计更新（隐患数 / 整改数 / 超期数）

---

## 十一、设计冻结声明

本文档为 Sprint5 **最终实施计划**，自 2026-07-20 起生效：

### 11.1 路线冻结

1. **Sprint 顺序冻结**：5.1 → 5.2 → 5.3 → 5.4 顺序不可调整
2. **依赖关系冻结**：employee_id 为所有业务的统一关联键，禁止引入其他人员标识
3. **范围冻结**：各 Sprint 的开发范围以本文档为准，新增需求走变更流程

### 11.2 技术冻结

1. **架构冻结**：employee 为唯一人员主表，禁止新增重复人员表
2. **约束冻结**：10 项技术约束为红线，禁止突破
3. **迁移策略冻结**：双写过渡 + 增量迁移 + 不删除旧字段

### 11.3 允许的变更

- 各 Sprint 内部的详细设计调整（不影响整体架构）
- API 端点的新增（不修改已有契约）
- 前端页面的 UI 优化（不改变功能范围）
- 性能优化（索引调整、查询优化）

---

## 十二、附录

### 12.1 数据库版本规划

| 版本 | 内容 | 所属 Sprint | 状态 |
|------|------|------------|------|
| v54 | 标准条款 3 表 + 52 条种子 | Sprint4 | ✅ 已执行 |
| v55 | 标准关联扩展 | Sprint4 | ✅ 已执行 |
| v56 | 评价表 AI 字段 | Sprint4 | ✅ 已执行 |
| v57 | 自评报告模板 | Sprint4 | ✅ 已执行 |
| v58 | 批量导入 2 表 | Sprint5（批量导入中心） | ✅ 已执行 |
| v59 | 人员主数据 5 表 + 1 视图 | Sprint5.1 | ✅ 已执行 |
| v60 | 人员主数据加固（operator_id + 哈希） | Sprint5.1 | ✅ 已执行 |
| v61 | 证件 + 一人一档 + 花名册扩展 | Sprint5.1 | ⏳ 待执行 |
| v62 | 培训/保险/驾驶员 employee_id 扩展 | Sprint5.2 | 📅 规划中 |
| v63 | 检查管理表 | Sprint5.3 | 📅 规划中 |
| v64 | 隐患整改表 | Sprint5.4 | 📅 规划中 |

### 12.2 参考文档

| 文档 | 用途 |
|------|------|
| `v2-feasibility-analysis.md` | V2.0 架构可行性分析、依赖盘点、约束清单 |
| `batch-import-design-v1.2-final.md` | 批量导入中心设计（预检查 + 确认执行 + 并发控制） |
| `HSE-V2.0.1-release-acceptance-report.md` | V2.0.1 发布验收报告（Sprint1~5 现状） |
| `hse-employee-master-data-design-v2.0-final.md` | 人员主数据最终设计（7 表 + 1 视图） |
| `sprint5.1-report.md` | Sprint5.1 开发报告（基础部分） |
| `sprint5.1.1-report.md` | Sprint5.1.1 加固报告（哈希 + Excel 导入） |

### 12.3 现有可复用能力

| 能力 | 位置 | 复用方式 |
|------|------|---------|
| JWT 认证 + requireRole | `server/middleware/auth.js` | 直接复用 |
| AES-256-GCM 加密 + HMAC 哈希 | `server/utils/encryption.js` | 直接复用 |
| 文件上传 + 魔术字节校验 | `server/middleware/upload.js` | 直接复用 |
| 统一响应格式 | `server/middleware/response.js` | 直接复用 |
| Zod 参数校验 | `server/middleware/validate.js` | 直接复用 |
| Excel 解析 | `xlsx@0.18.5`（已安装） | 直接复用 |
| AI 服务 | `server/services/aiService.js` | 直接复用 |
| 报告服务 | `server/services/reportService.js` | 直接复用 |
| WebSocket | `server/services/wsServer.js` | 直接复用 |
| 批量导入中心 | `routes/hse-batch-import.js` | 复用预检查 + 确认执行模式 |
| 操作日志 | `sys_operation_log` 表 | 直接复用 |
| Ant Design Vue 组件 | 前端 | 直接复用 |
| 路由自动加载 | `router/routes/index.ts` | 直接复用 |
| HSE 组件库 | `components/hse/` | 直接复用 |

---

**文档版本**：v1.0（最终版）
**生成日期**：2026-07-20
**依据**：v2-feasibility-analysis.md、batch-import-design-v1.2-final.md、HSE-V2.0.1-release-acceptance-report.md
**状态**：✅ Sprint5 路线最终冻结，编码依据本文档执行

---

**文档结束**

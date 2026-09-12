# HSE系统模块边界冻结清单

> **文档性质**：模块边界冻结清单（最终版）
> **设计依据**：项目公司HSE系统V1.0功能基线 + 实际代码审计 + 安全风险管控功能树
> **设计日期**：2026-07-24
> **任务编号**：Sprint10-D-1-5
> **适用范围**：后续前端调整、后端接口、数据库联调、数据导入的**唯一依据**

---

## 一、冻结原则

1. **不删除已有成熟功能**：已实现的成熟功能全部保留
2. **不改变已有成熟模块名称**：现有模块名称保持不变
3. **优先复用现有页面、接口和数据结构**：不重复建设
4. **所有功能必须归属唯一业务模块**：禁止跨模块功能重叠
5. **保留成熟功能，优化边界，补齐缺失能力，避免重复建设**

---

## 二、安全风险管控模块

### 2.1 模块信息

| 项目 | 内容 |
|------|------|
| 模块名称 | **安全风险管控**（禁止修改名称） |
| 一级菜单 | 安全风险管控 |
| 前端路由 | hse-risk-control.ts，path: /risk-control，order: 7 |
| 模块定位 | 项目公司HSE双重预防机制中的风险分级管控中心 |
| 核心数据表 | risk_sources |
| 功能总数 | 8个二级功能 + 22个三级功能 |

### 2.2 功能边界

| ✅ 本模块负责 | ❌ 不属于本模块 |
|-------------|---------------|
| 风险点管理（新增/维护/查询） | 检查发现（→隐患治理） |
| 风险辨识（名称/类型/位置/区域） | 隐患登记（→隐患治理） |
| 风险评价（等级判定/一/二/三/四级） | 整改闭环（→隐患治理） |
| 风险分级管控（责任/部门/措施） | 复查验收（→隐患治理） |
| 风险地图（区域/展示/可视化） | 员工主数据管理（→人员管理） |
| 风险告知（告知卡/岗位提示） | 培训计划管理（→培训考核） |
| 风险分析（趋势/等级/区域统计） | 应急预案管理（→应急管理） |
| AI风险解释（嵌入分析，不独立菜单） | 制度文件管理（→制度标准） |

### 2.3 关联能力（归入本模块作为二级功能）

| 功能名称 | 页面路径 | 接口前缀 | 状态 | 边界说明 |
|---------|---------|---------|------|---------|
| 员工风险画像 | views/hse/risk-profile-detail/ | /api/hse/risk/profile | ✅ 已实现 | 风险主体为employee_id，人员数据来源于人员管理模块 |
| 驾驶员风险中心 | views/hse/driver-risk-center/ | /api/hse/driver-risk-center | ✅ 已实现 | 驾驶员专项风险，不建立车辆绑定主表 |
| 风险等级计算 | 接口层 | /api/hse/risk-score | ✅ 已实现 | 评分计算引擎，嵌入风险画像 |
| 事故管理 | views/accidents/ | /api/accidents | ✅ 已实现 | 事故是风险失控的结果 |
| 事故分析中心 | views/hse/accident-analysis/ | /api/hse/accident-analysis | ✅ 已实现 | 事故趋势分析 |
| 风险趋势与预测 | 接口层 | /api/hse/analysis-center | ✅ 已实现 | 嵌入风险分析和驾驶舱 |

### 2.4 与隐患治理的联动边界

| 联动方向 | 机制 | 接口 | 说明 |
|---------|------|------|------|
| 风险→隐患 | 正向生成 | POST /api/risk-control/:id/generate-hazard | 风险管控失效时生成隐患，**不构成功能重复** |
| 隐患←风险 | 反向追溯 | GET /api/risk-control/:id/related-hazards | 隐患详情中追溯关联风险源 |
| 风险临期→预警 | 通知推送 | notificationService.createNotification | 风险临期/过期自动推送预警通知 |

### 2.5 待补齐能力

| 功能 | 当前状态 | 补齐方案 | 优先级 |
|------|---------|---------|-------|
| 风险告知卡 | 🔶 待实现 | 在风险点详情抽屉增加"风险告知卡"Tab页，支持打印 | 中 |
| 岗位风险提示 | 🔶 待实现 | 按岗位筛选风险点，与人员管理岗位管理联动 | 中 |
| 趋势分析扩展 | 🔶 部分实现 | 扩展统计接口，增加按月/季/年的时间维度统计 | 低 |

---

## 三、隐患排查治理模块

### 3.1 模块信息

| 项目 | 内容 |
|------|------|
| 模块名称 | **隐患排查治理**（保留现有名称） |
| 一级菜单 | 隐患排查治理 |
| 前端路由 | hse-hazards.ts，path: /hazards |
| 模块定位 | 双重预防机制之二：隐患排查整改闭环管理 |
| 核心数据表 | hazards, hse_rectifications, hse_reviews |
| 功能总数 | 4个二级功能 |

### 3.2 功能边界

| ✅ 本模块负责 | ❌ 不属于本模块 |
|-------------|---------------|
| 隐患排查（登记/分类/分级/列表） | 风险源登记（→安全风险管控） |
| 整改闭环（任务下发/进度跟踪/复查验收） | 风险等级评价（→安全风险管控） |
| 预警中心（规则配置/预警记录/预警任务） | 风险管控措施制定（→安全风险管控） |
| 统计分析（趋势/整改率/类型分布） | 现场检查任务（→现场管理） |

### 3.3 功能清单

| 序号 | 功能名称 | 页面 | 接口 | 数据库表 | 状态 |
|------|---------|------|------|---------|------|
| 1 | 隐患排查 | views/hazards/index.vue | /api/hazards | hazards | ✅ 已实现 |
| 1.1 | 隐患登记 | views/hazards/index.vue（新增弹窗） | POST /api/hazards | hazards (INSERT) | ✅ 已实现 |
| 1.2 | 隐患分类 | views/hazards/index.vue（筛选） | GET /api/hazards?type=xxx | hazards.type | ✅ 已实现 |
| 1.3 | 隐患分级 | views/hazards/index.vue（筛选） | GET /api/hazards?level=xxx | hazards.level | ✅ 已实现 |
| 1.4 | 隐患列表 | views/hazards/index.vue（表格） | GET /api/hazards | hazards (SELECT) | ✅ 已实现 |
| 2 | 整改闭环 | views/hazards/index.vue（整改/复查弹窗） | /api/hazards/:id/rectify, /api/hse/hazard-rectification | hse_rectifications, hse_reviews | ✅ 已实现 |
| 2.1 | 整改任务下发 | views/hazards/index.vue（整改弹窗） | PUT /api/hazards/:id/rectify | hse_rectifications (INSERT) | ✅ 已实现 |
| 2.2 | 整改进度跟踪 | views/hazards/index.vue（状态列） | GET /api/hazards | hazards.status | ✅ 已实现 |
| 2.3 | 复查验收 | views/hazards/index.vue（复查弹窗） | PUT /api/hazards/:id/review | hse_reviews (INSERT) | ✅ 已实现 |
| 3 | 预警中心 | views/hse/warning-center/index.vue | /api/hse/warning-center | hse_warning_rule, hse_warning_record, hse_warning_task, hse_warning_rule_version | ✅ 已实现 |
| 3.1 | 预警规则配置 | views/hse/warning-center/index.vue | GET/POST /api/hse/warning-center/warnings/rules | hse_warning_rule, hse_warning_rule_version | ✅ 已实现 |
| 3.2 | 预警记录查询 | views/hse/warning-center/index.vue | GET /api/hse/warning-center/warnings | hse_warning_record | ✅ 已实现 |
| 3.3 | 预警任务管理 | views/hse/warning-center/index.vue | GET /api/hse/warning-center/tasks | hse_warning_task | ✅ 已实现 |
| 4 | 统计分析 | views/hazards/index.vue（统计分析抽屉） | GET /api/hazards/stats | hazards (聚合查询) | ✅ 已实现 |

### 3.4 与安全风险管控的边界

| 功能 | 归属 | 边界说明 |
|------|------|---------|
| 风险点登记 | 安全风险管控 | 隐患模块**不登记风险点**，只从风险点生成隐患 |
| 隐患登记 | 隐患排查治理 | 风险模块**不登记隐患**，只通过generate-hazard接口联动 |
| 风险等级 | 安全风险管控 | 隐患有自己的严重等级（major/minor），与风险等级不同 |
| 整改闭环 | 隐患排查治理 | 风险模块不参与整改流程 |

### 3.5 待补齐能力

| 功能 | 当前状态 | 补齐方案 | 优先级 |
|------|---------|---------|-------|
| 整改效果评价 | 🔶 接口层已有 | 前端页面增加评价Tab | 低 |
| 隐患排查计划 | 🔶 接口层已有 | 前端页面增加计划管理 | 低 |

---

## 四、现场管理模块

### 4.1 模块信息

| 项目 | 内容 |
|------|------|
| 模块名称 | **现场管理**（保留现有名称） |
| 一级菜单 | 现场管理 |
| 前端路由 | hse-inspection.ts（path: /inspection）+ hse-violations.ts（path: /violations） |
| 模块定位 | 现场业务管理（三违/网格/消防/车辆/现场检查） |
| 核心数据表 | grid_areas, grid_patrol_logs, violation_records |
| 功能总数 | 5个二级功能 |

### 4.2 功能边界

| ✅ 本模块负责 | ❌ 不属于本模块 |
|-------------|---------------|
| 三违管理（违章登记/处理/统计） | 风险点管理（→安全风险管控） |
| 网格管理（区域/责任/巡查） | 隐患登记（→隐患排查治理） |
| 消防设施管理（台账/检查/维护） | 员工管理（→人员管理） |
| 车辆管理（信息/保险/检查） | 培训管理（→培训考核） |
| 现场检查（任务/记录/问题跟踪） | 应急预案（→应急管理） |

### 4.3 功能清单

| 序号 | 功能名称 | 页面 | 接口 | 数据库表 | 状态 |
|------|---------|------|------|---------|------|
| 1 | 三违管理 | views/violations/index.vue | /api/violations | violation_records | ✅ 已实现 |
| 1.1 | 三违登记 | views/violations/index.vue（新增弹窗） | POST /api/violations | violation_records (INSERT) | ✅ 已实现 |
| 1.2 | 整改与复查 | views/violations/index.vue（整改/复查） | PUT /api/violations/:id/rectify, /:id/review | violation_records.status | ✅ 已实现 |
| 1.3 | 统计分析 | views/violations/index.vue（统计分析） | GET /api/violations/statistics/* | violation_records (聚合) | ✅ 已实现 |
| 2 | 网格管理 | views/inspection/grid/index.vue | /api/site-mgmt/grid-areas | grid_areas | ✅ 已实现 |
| 2.1 | 网格区域管理 | views/inspection/grid/index.vue（CRUD） | GET/POST/PUT/DELETE /api/site-mgmt/grid-areas | grid_areas | ✅ 已实现 |
| 2.2 | 巡查记录 | 待扩展 | /api/site-mgmt/grid-areas/:id/patrol-logs | grid_patrol_logs | 🔶 部分实现 |
| 3 | 消防设施 | views/inspection/fire-facility/index.vue | /api/site-mgmt/fire-equipment | （内存模式） | ✅ 已实现 |
| 3.1 | 设施台账 | views/inspection/fire-facility/index.vue（CRUD） | GET/POST/PUT/DELETE /api/site-mgmt/fire-equipment | （内存模式） | ✅ 已实现 |
| 4 | 车辆管理 | views/insurance/vehicle/ | /api/insurance/vehicle | vehicles, insurance_history | ✅ 已实现 |
| 4.1 | 车辆信息管理 | views/insurance/vehicle/index.vue | GET/POST/PUT/DELETE /api/insurance/vehicle | vehicles | ✅ 已实现 |
| 4.2 | 车辆保险管理 | views/insurance/vehicle/index.vue | GET/POST /api/insurance/vehicle | insurance_history | ✅ 已实现 |
| 5 | 现场检查 | 接口层 | /api/hse/chain, /api/hse/tasks | hse_inspection_plans, hse_inspection_tasks | ✅ 接口层已实现 |

### 4.4 重要边界问题：三违管理重复实现

| 问题 | 说明 |
|------|------|
| 重复实现1 | views/inspection/index.vue + site-mgmt.js 的 /violations（旧版，内存模式，字段简单） |
| 重复实现2 | views/violations/index.vue + violations.js 的 violation_records（新版，DB持久化，功能完整） |
| **冻结决定** | 保留新版（views/violations/index.vue + violations.js），旧版（inspection/index.vue的三违部分）废弃或重定向到新版 |
| 废弃原因 | 新版功能更完整（含整改/复查/统计分析/员工关联/事件同步），DB持久化，旧版仅内存模式 |

### 4.5 命名规范

- ❌ **禁止使用**："三检管理"（避免与驾驶员"三检表"混淆）
- ✅ **正确名称**："三违管理"（违章指挥/违章作业/违反劳动纪律）
- ✅ **正确名称**："现场检查"（包含日常检查、专项检查、综合检查）

### 4.6 待补齐能力

| 功能 | 当前状态 | 补齐方案 | 优先级 |
|------|---------|---------|-------|
| 网格巡查记录 | 🔶 部分实现 | grid_patrol_logs表已定义，需实现CRUD接口和前端页面 | 中 |
| 消防设施DB持久化 | 🔶 内存模式 | 迁移到PostgreSQL持久化 | 低 |
| 现场检查前端页面 | 🔶 接口层 | 需实现前端页面 | 中 |

---

## 五、人员管理模块

### 5.1 模块信息

| 项目 | 内容 |
|------|------|
| 模块名称 | **人员管理**（保留现有名称，原"人员主数据"扩展） |
| 一级菜单 | 人员管理 |
| 前端路由 | hse-employee.ts（path: /hse/employee）+ hse-employee-import-v2.ts + hse-employee-profile.ts |
| 模块定位 | 人员主数据全生命周期管理 |
| 核心数据表 | employee, department, position, personnel_insurance, over_age_personnel |
| 功能总数 | 8个二级功能 |

### 5.2 功能边界

| ✅ 本模块负责 | ❌ 不属于本模块 |
|-------------|---------------|
| 员工管理（列表/详情/信息维护） | 风险画像（→安全风险管控，数据来源为本模块） |
| 组织管理（机构/部门/层级） | 三违记录（→现场管理，violator_id关联本模块） |
| 岗位管理（设置/职责/权限） | 培训记录（→培训考核，personnel_id关联本模块） |
| 人员保险（登记/到期/统计） | 隐患责任（→隐患排查治理，responsible_person关联本模块） |
| 超龄人员（管理/预警/调整） | 事故人员（→安全风险管控，accident_persons关联本模块） |
| 花名册导入（批量/模板/记录） | 安全目标（→目标职责） |

### 5.3 功能清单

| 序号 | 功能名称 | 页面 | 接口 | 数据库表 | 状态 |
|------|---------|------|------|---------|------|
| 1 | 员工管理 | views/hse/employee/index.vue | /api/hse/employee/employees | employee | ✅ 已实现 |
| 1.1 | 员工列表 | views/hse/employee/index.vue（统计卡+表格） | GET /api/hse/employee/employees | employee | ✅ 已实现 |
| 1.2 | 员工详情 | views/hse/employee-profile/index.vue | GET /api/hse/employee/employees/:id | employee | ✅ 已实现 |
| 1.3 | 人事变动 | views/hse/employee/index.vue（调岗弹窗） | POST /api/hse/employee/org/assign | employee_history, employee_assignment | ✅ 已实现 |
| 2 | 组织管理 | views/hse/employee/departments.vue | /api/hse/employee/departments | department | ✅ 已实现 |
| 2.1 | 部门树管理 | views/hse/employee/departments.vue（五级树形） | GET /api/hse/employee/departments/tree | department (level 1-5) | ✅ 已实现 |
| 3 | 岗位管理 | views/hse/employee/positions.vue | /api/hse/employee/positions | position | ✅ 已实现 |
| 3.1 | 岗位设置 | views/hse/employee/positions.vue（CRUD） | GET/POST/PUT/DELETE /api/hse/employee/positions | position | ✅ 已实现 |
| 4 | 人员保险 | views/insurance/personnel/ | /api/insurance/personnel | personnel_insurance | ✅ 已实现 |
| 4.1 | 保险登记 | views/insurance/personnel/index.vue | GET/POST/PUT/DELETE /api/insurance/personnel | personnel_insurance | ✅ 已实现 |
| 4.2 | 到期提醒 | views/insurance/personnel/index.vue | GET /api/insurance/personnel?expiryStatus=expiring | personnel_insurance.expire_date | ✅ 已实现 |
| 5 | 超龄人员 | views/insurance/over-age/ | /api/over-age-personnel | over_age_personnel | ✅ 已实现 |
| 5.1 | 超龄管理 | views/insurance/over-age/index.vue（CRUD） | GET/POST/PUT/DELETE /api/over-age-personnel | over_age_personnel | ✅ 已实现 |
| 5.2 | 超龄预警 | views/insurance/over-age/index.vue（统计卡） | GET /api/over-age-personnel/stats/summary | over_age_personnel | ✅ 已实现 |
| 6 | 花名册导入 | views/hse/employee-import-v2/index.vue | /api/hse/employee-import/v2 | employee_import_batch | ✅ 已实现 |
| 6.1 | 批次管理 | views/hse/employee-import-v2/index.vue | GET/POST /api/hse/employee-import/v2/batches | employee_import_batch | ✅ 已实现 |
| 6.2 | 导入流程 | views/hse/employee-import-v2/index.vue（上传/预览/审核/确认） | POST /api/hse/employee-import/v2/batches/:id/* | employee_import_pending | ✅ 已实现 |
| 7 | 证书管理 | 接口层 | /api/hse/employee/certificates | （hse-employee.js中） | ✅ 已实现 |
| 8 | 安全画像 | 接口层 | /api/hse/employee/safety-profiles | （hse-employee.js中） | ✅ 已实现 |

### 5.4 重要边界问题：双重人员表

| 问题 | 说明 |
|------|------|
| 双重表 | employee表（Sprint5.1+，加密存储，五级组织）vs personnel表（旧版，22字段） |
| **冻结决定** | employee表为主表，personnel表为旧表保留兼容；超龄人员通过personnel_id关联personnel表 |
| 边界说明 | 禁止修改employee、employee_assignment、hse_responsibility表；personnel表数据逐步迁移到employee表 |

### 5.5 数据安全边界

| 安全措施 | 说明 |
|---------|------|
| AES-256-GCM加密 | employee表的id_card、phone字段加密存储 |
| HMAC-SHA256哈希 | id_card_hash、phone_hash用于唯一性校验 |
| 权限控制 | 写操作需requireRole('admin', 'safety_manager')，培训记录额外允许'hr' |

### 5.6 待补齐能力

| 功能 | 当前状态 | 补齐方案 | 优先级 |
|------|---------|---------|-------|
| 证书管理前端页面 | 🔶 接口层已有 | 实现前端页面 | 中 |
| 安全画像前端页面 | 🔶 接口层已有 | 实现前端页面 | 低 |
| personnel→employee数据迁移 | 🔶 双表共存 | 建立兼容视图，逐步迁移 | 低 |

---

## 六、目标职责与考核模块

### 6.1 模块信息

| 项目 | 内容 |
|------|------|
| 模块名称 | **目标职责**（保留现有名称，原"目标职责管理"简化） |
| 一级菜单 | 目标职责 |
| 前端路由 | hse-objectives.ts，path: /objectives，order: 3 |
| 模块定位 | 安全目标责任与安委会管理 |
| 核心数据表 | 无（当前仅内存模式） |
| 功能总数 | 3个二级功能 |

### 6.2 功能边界

| ✅ 本模块负责 | ❌ 不属于本模块 |
|-------------|---------------|
| 目标责任书管理（制定/签订/分解） | 责任制考核（→培训考核模块） |
| 安委会管理（成员/会议/人员配置） | 培训考核（→培训考核模块） |
| 安全费用（预算/支出/统计） | 风险评价（→安全风险管控） |

### 6.3 功能清单

| 序号 | 功能名称 | 页面 | 接口 | 数据库表 | 状态 |
|------|---------|------|------|---------|------|
| 1 | 目标责任书 | views/goals/index.vue | /api/objectives/contract | （内存模式） | ✅ 已实现 |
| 1.1 | 目标制定 | views/goals/index.vue（CRUD） | GET/POST/PUT/DELETE /api/objectives/contract | createMemoryCrud | ✅ 已实现 |
| 2 | 安委会管理 | views/objectives/committee/index.vue | /api/objectives/org-personnel | （内存模式） | ✅ 已实现 |
| 2.1 | 成员管理 | views/objectives/committee/index.vue（CRUD） | GET/POST/PUT/DELETE /api/objectives/org-personnel | createMemoryCrud | ✅ 已实现 |
| 3 | 安全费用 | views/objectives/budget/index.vue | /api/objectives/safety-budget | （内存模式） | ✅ 已实现 |
| 3.1 | 预算管理 | views/objectives/budget/index.vue（CRUD） | GET/POST/PUT/DELETE /api/objectives/safety-budget | createMemoryCrud | ✅ 已实现 |

### 6.4 重要边界问题：责任制考核归属

| 问题 | 说明 |
|------|------|
| 原位置 | 目标职责模块下 /objectives/assessment |
| **冻结决定** | 责任制及考核迁移至**培训考核**模块，目标职责仅保留3个功能 |
| 迁移原因 | 考核分析与培训分析关联紧密，考核指标与培训完成率挂钩 |

### 6.5 重要边界问题：内存模式

| 问题 | 说明 |
|------|------|
| 当前状态 | objectives.js仅使用内存CRUD模式（createMemoryCrud），无PostgreSQL表 |
| **冻结决定** | V1.0保留内存模式，数据重启后丢失；V1.5补建PostgreSQL表 |
| 风险说明 | 内存模式不适合生产环境使用，需在V1.5优先补建表 |

### 6.6 待补齐能力

| 功能 | 当前状态 | 补齐方案 | 优先级 |
|------|---------|---------|-------|
| PostgreSQL持久化 | 🔶 内存模式 | 补建objectives相关表，迁移到DB模式 | 高 |
| 目标分解与跟踪 | 🔶 待实现 | 支持目标分解到部门/岗位，跟踪完成进度 | 中 |

---

## 七、培训考核模块

### 7.1 模块信息

| 项目 | 内容 |
|------|------|
| 模块名称 | **培训考核**（保留现有名称，原"培训管理"扩展） |
| 一级菜单 | 培训考核 |
| 前端路由 | hse-training.ts，path: /training，order: 5 |
| 模块定位 | 培训管理 + 考核分析 |
| 核心数据表 | training_records, training_plans, training_requirements |
| 功能总数 | 7个二级功能（原10个子菜单合并优化） |

### 7.2 功能边界

| ✅ 本模块负责 | ❌ 不属于本模块 |
|-------------|---------------|
| 培训计划（制定/年度/执行跟踪） | 员工主数据（→人员管理） |
| 培训要求（配置/岗位要求/资质） | 风险评价（→安全风险管控） |
| 培训台账（记录/签到/档案） | 安全目标（→目标职责） |
| 专项培训（新员工/驾驶员实操） | 现场检查（→现场管理） |
| 培训统计（完成率/效果/趋势） | 隐患整改（→隐患排查治理） |
| 考核分析（HSE考核/指标/结果） | 制度文件（→制度标准） |
| 责任制考核（评分/排名） | 应急预案（→应急管理） |

### 7.3 功能清单

| 序号 | 功能名称 | 页面 | 接口 | 数据库表 | 状态 |
|------|---------|------|------|---------|------|
| 1 | 培训计划 | views/training/index.vue + plans/index.vue | /api/training/records, /api/training/plans | training_records, training_plans | ✅ 已实现 |
| 1.1 | 计划制定 | views/training/plans/index.vue | GET/POST/PUT/DELETE /api/training/plans | training_plans | ✅ 已实现 |
| 1.2 | 计划执行 | views/training/execute/index.vue | POST /api/training/plans/:id/execute | training_records (批量生成) | ✅ 已实现 |
| 2 | 培训要求 | views/training/requirements/index.vue | /api/training/requirements | training_requirements | ✅ 已实现 |
| 3 | 培训台账 | views/training/ledger/index.vue | /api/training/ledger | training_records | ✅ 已实现 |
| 4 | 专项培训 | views/training/new-employee/ + driver/ | /api/training/new-employees, /api/training/driver | training_records | ✅ 已实现 |
| 5 | 培训统计 | views/training/stats/ + analysis/ | /api/training/stats, /api/training/analysis/enhanced | training_records (聚合) | ✅ 已实现 |
| 6 | 考核分析 | views/hse/assessment-analysis/index.vue | /api/hse/assessment-analysis | 多表联合 | ✅ 已实现 |
| 7 | 责任制考核 | views/objectives/assessment/index.vue | /api/objectives/responsibility | （内存模式） | ✅ 已实现 |

### 7.4 边界说明

| 边界项 | 说明 |
|-------|------|
| 人员关联 | 培训记录通过personnel_id/employee_id关联人员管理模块，不在此模块管理人员主数据 |
| 到期提醒 | 培训到期检查（/api/training/reminders/expiry）嵌入培训计划页面，不独立成菜单 |
| 培训提醒 | 原培训提醒菜单隐藏，功能嵌入培训计划 |
| 证书管理 | 员工证书管理在人员管理模块（/api/hse/employee/certificates），不在培训考核模块 |

### 7.5 待补齐能力

| 功能 | 当前状态 | 补齐方案 | 优先级 |
|------|---------|---------|-------|
| 责任制考核DB持久化 | 🔶 内存模式 | 迁移到PostgreSQL持久化 | 中 |
| 培训附件版本管理 | ✅ 已实现 | training_attachments + training_versions | —— |

---

## 八、模块间边界对照总表

### 8.1 功能归属唯一性检查

| 功能 | 归属模块 | 是否有重复 | 说明 |
|------|---------|-----------|------|
| 风险点登记 | 安全风险管控 | ❌ 无重复 | 隐患模块仅通过generate-hazard联动 |
| 隐患登记 | 隐患排查治理 | ❌ 无重复 | 风险模块不登记隐患 |
| 三违登记 | 现场管理 | ⚠️ 有重复 | 旧版(inspection/index.vue)和新版(violations/index.vue)并存，冻结保留新版 |
| 员工管理 | 人员管理 | ⚠️ 双表 | employee表和personnel表并存，冻结以employee为主表 |
| 培训记录 | 培训考核 | ❌ 无重复 | 人员模块不管理培训记录 |
| 目标制定 | 目标职责 | ❌ 无重复 | 责任制考核已迁移至培训考核 |
| 责任制考核 | 培训考核 | ❌ 无重复 | 从目标职责迁移至培训考核 |
| 事故管理 | 安全风险管控 | ❌ 无重复 | 事故是风险结果 |
| 预警规则 | 隐患排查治理 | ❌ 无重复 | 预警中心归入隐患治理 |

### 8.2 模块间数据关联关系

```
人员管理 ──→ 安全风险管控（employee_id → hse_employee_risk_snapshot）
人员管理 ──→ 培训考核（personnel_id → training_records）
人员管理 ──→ 现场管理（violator_id → violation_records）
安全风险管控 ──→ 隐患排查治理（risk_id → risk_hazard_links → hazard_id）
现场管理 ──→ 隐患排查治理（检查发现问题 → 隐患登记）
培训考核 ──→ 安全风险管控（培训完成率 → 风险评分维度）
```

---

## 九、冻结统计

### 9.1 模块统计

| 模块 | 二级功能数 | 已实现 | 部分实现 | 待补齐 | 核心表数 |
|------|-----------|-------|---------|-------|---------|
| 安全风险管控 | 8 | 6 | 2 | 3项 | 11 |
| 隐患排查治理 | 4 | 4 | 0 | 2项 | 7 |
| 现场管理 | 5 | 4 | 1 | 3项 | 3 |
| 人员管理 | 8 | 8 | 0 | 3项 | 6 |
| 培训考核 | 7 | 7 | 0 | 1项 | 5 |
| 目标职责 | 3 | 3 | 0 | 2项 | 0 |
| **合计** | **35** | **32** | **3** | **14项** | **32** |

### 9.2 边界冲突处理

| 冲突项 | 处理方式 | 状态 |
|-------|---------|------|
| 三违管理重复实现 | 保留新版(violations.js)，废弃旧版(inspection的三违) | ✅ 已决策 |
| 双重人员表 | employee为主表，personnel保留兼容 | ✅ 已决策 |
| 责任制考核归属 | 迁移至培训考核模块 | ✅ 已决策 |
| 目标职责内存模式 | V1.0保留，V1.5补建DB表 | ✅ 已决策 |
| 风险→隐患联动 | 不构成功能重复，保留联动机制 | ✅ 已决策 |

---

*文档生成时间：2026-07-24*
*任务编号：Sprint10-D-1-5 HSE系统模块边界与功能清单冻结*
*版本：V1.0（冻结版）*

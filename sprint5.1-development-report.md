# HSE Sprint5.1 人员主数据中心 - 开发报告

**版本**: v1.0  
**日期**: 2026-07-20  
**依据**: hse-employee-master-data-design-v2.0-final.md

---

## 一、概述

Sprint5.1 完成 HSE 人员主数据中心核心能力建设，以 `employee_id` 为统一关联键，实现 7 个核心业务模型 + Excel 花名册导入功能。所有业务均通过 `employee_id` 关联，为后续 Sprint5.2/5.3/5.4 提供统一人员基础。

## 二、开发范围

### 2.1 已实现模型（7个）

| 序号 | 模型 | 表名 | 说明 |
|------|------|------|------|
| 1 | 员工主表 | `employee` | 唯一人员主表，所有业务通过 employee_id 关联 |
| 2 | 组织管理 | `department` | 五级树形组织（集团/区域/企业/项目/班组） |
| 3 | 岗位管理 | `position` | 岗位模型，支持特种作业/安全关键岗位标识 |
| 4 | 人员组织关系 | `hse_employee_org` | 支持调岗流程，is_current 标识当前记录 |
| 5 | 人事变动历史 | `employee_history` | 员工全生命周期事件记录 |
| 6 | 证件统一管理 | `employee_certificate` | 7种证件分类，5种状态，临期预警 |
| 7 | 一人一档风险画像 | `employee_safety_profile` | 风险等级评定，安全画像 |

### 2.2 已实现功能

| 功能模块 | 功能说明 |
|----------|----------|
| 员工管理 | CRUD、关键字搜索、人员类型/分类过滤、统计、软删除 |
| 组织管理 | 五级树形结构、部门树查询、CRUD、软删除 |
| 岗位管理 | CRUD、按部门过滤、特种作业/安全关键岗位标识 |
| 人员组织关系 | 入职分配、调岗、待岗/复岗、历史查询、is_current机制 |
| 人事变动历史 | 全生命周期事件追溯（入职/调岗/待岗/复岗等） |
| 证件管理 | CRUD、分类/状态过滤、临期预警、过期列表、批量导入、统计 |
| 一人一档 | 风险画像查询、手动/批量风险评估、风险等级过滤、统计 |
| Excel花名册导入 | 组织路径自动匹配、岗位自动关联、入职历史自动记录 |

### 2.3 未实现（按要求进入Sprint5.2）

- 培训业务
- 保险业务
- 驾驶员业务
- 三违业务
- 网格业务
- 消防业务

## 三、技术实现

### 3.1 后端 API 总览

**文件**: `server/routes/hse-employee.js`  
**API端点总数**: 40个

#### 员工管理（7个）
- `GET /employees` - 分页查询员工
- `GET /employees/stats` - 员工统计
- `GET /employees/:id` - 员工详情
- `POST /employees` - 新增员工
- `PUT /employees/:id` - 更新员工
- `DELETE /employees/:id` - 软删除员工
- `POST /employees/import` - JSON批量导入

#### 组织管理（5个）
- `GET /departments/tree` - 部门树
- `GET /departments` - 部门列表
- `POST /departments` - 新增部门
- `PUT /departments/:id` - 更新部门
- `DELETE /departments/:id` - 删除部门

#### 岗位管理（4个）
- `GET /positions` - 岗位列表
- `POST /positions` - 新增岗位
- `PUT /positions/:id` - 更新岗位
- `DELETE /positions/:id` - 删除岗位

#### 人员组织关系（4个）
- `GET /org/employee/:employeeId` - 当前组织关系
- `GET /org/employee/:employeeId/history` - 组织关系历史
- `POST /org/assign` - 分配/调岗
- `PUT /org/:id/status` - 状态变更（待岗/复岗等）

#### 人事变动历史（1个）
- `GET /history/employee/:employeeId` - 人事变动历史

#### Excel导入（3个）
- `GET /employees/import/template` - 下载模板
- `POST /employees/import/excel/preview` - 预览校验
- `POST /employees/import/excel` - 正式导入

#### 证件管理（10个）
- `GET /certificates` - 分页查询证件
- `GET /certificates/stats` - 证件统计
- `GET /certificates/:id` - 证件详情
- `GET /certificates/employee/:employeeId` - 员工证件列表
- `POST /certificates` - 新增证件
- `PUT /certificates/:id` - 更新证件
- `DELETE /certificates/:id` - 软删除证件
- `GET /certificates/expiring/:days` - 临期证件列表
- `GET /certificates/expired/list` - 过期证件列表
- `POST /certificates/batch-import` - 批量导入证件

#### 一人一档风险画像（6个）
- `GET /safety-profiles` - 分页查询
- `GET /safety-profiles/stats` - 统计
- `GET /safety-profiles/employee/:employeeId` - 员工一人一档
- `POST /safety-profiles/employee/:employeeId/assess` - 手动风险评估
- `PUT /safety-profiles/:id` - 更新风险画像
- `POST /safety-profiles/batch-assess` - 批量风险评估

### 3.2 核心技术点

#### 1. 统一关联键：employee_id
所有业务表（hse_employee_org、employee_history、employee_certificate、employee_safety_profile）均通过 `employee_id` 关联到 `employee` 表，确保人员标识统一。

#### 2. 软删除机制
所有表使用 `is_deleted BOOLEAN DEFAULT FALSE`，所有查询条件自动加上 `WHERE is_deleted = false`。

#### 3. 审计字段
- `created_at TIMESTAMP DEFAULT NOW()`
- `updated_at TIMESTAMP DEFAULT NOW()`
- 部分表（employee_certificate、employee_safety_profile）含 `created_by`

#### 4. 敏感数据加密
- 身份证号、手机号使用 AES-256-GCM 加密存储
- 加密字段通过 `decryptMiddleware` 自动解密
- 唯一性通过 hash 字段实现（id_card_hash、phone_hash）

#### 5. 五级组织模型
- level 1-5: 集团/区域公司/企业/项目/班组
- `path` 字段存储层级路径，便于祖先/后代查询
- `org_path` 快照存储组织路径文本，历史记录不可变

#### 6. 调岗流程（is_current 机制）
- 一个员工同时只有一条 `is_current = true` 的组织关系记录
- 调岗时旧记录置 `is_current = false` 并设 `end_date`
- 新记录 `is_current = true`
- 完整记录人事变动历史

#### 7. 证件管理
- 7种证件分类: special_operation/safety_qualification/health/special_equipment/driver_license/professional/other
- 5种状态: valid/expired/revoked/pending_review/invalid
- 临期预警: 按天数查询即将到期证件
- 批量导入: 支持JSON批量导入

#### 8. 风险评定规则
基于评分模型：
- 事故责任: +40分/次
- 严重违章≥3次: +30分
- 一般违章≥5次: +15分
- 培训不足: +10分
- 整改逾期: +15分
- 证件过期: +10分

风险等级:
- score < 15: low
- 15 ≤ score < 35: medium
- 35 ≤ score < 60: high
- score ≥ 60: critical
- 无数据: unknown

#### 9. Excel花名册导入
- 支持组织路径自动匹配（五级组织逐级匹配）
- 支持岗位名称自动关联（先按部门匹配，再全局匹配）
- 自动创建 hse_employee_org 组织关系
- 自动创建 employee_history 入职记录
- 每行独立事务，单行失败不影响整体
- 完整的错误和警告信息返回

### 3.3 权限控制

使用 `requireRole('admin', 'safety_manager')` 中间件：
- 写操作（POST/PUT/DELETE）: 需要 admin 或 safety_manager 角色
- 读操作（GET）: 所有登录用户可访问

## 四、文件清单

### 后端
| 文件路径 | 说明 |
|----------|------|
| `server/routes/hse-employee.js` | 人员主数据中心路由（40个API端点） |
| `server/sql/hse_employee_master_v59_migration.sql` | v59 基础迁移脚本（5张表+1视图） |
| `server/sql/hse_employee_master_v61_extension.sql` | v61 扩展迁移脚本（2张表） |
| `server/__tests__/hse-employee.standalone.test.js` | 集成测试脚本（121个测试用例） |

## 五、技术约束遵守情况

| 约束 | 状态 | 说明 |
|------|------|------|
| 禁止修改Vben核心目录 | ✅ 遵守 | 未修改任何Vben核心目录 |
| 禁止修改auth/JWT | ✅ 遵守 | 未修改认证/JWT相关代码 |
| 禁止新增npm依赖 | ✅ 遵守 | 未新增任何npm依赖 |
| 禁止创建公共组件 | ✅ 遵守 | 未创建任何公共组件 |
| 所有业务关联使用employee_id | ✅ 遵守 | 所有业务表均通过employee_id关联 |

---

**报告生成时间**: 2026-07-20

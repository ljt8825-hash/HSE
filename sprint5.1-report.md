# HSE Sprint5.1 人员主数据中心 - 开发报告

> 依据: `hse-employee-master-data-design-v1.2-freeze.md`
> 完成日期: 2026-07-19
> 范围: 人员主数据基础能力（不含 Sprint5.2/5.3 内容）

---

## 一、交付概览

| 维度 | 数量 | 说明 |
|------|------|------|
| 数据库表 | 5 张 + 1 视图 | department / position / employee / hse_employee_org / employee_history + v_employee_with_age |
| 后端路由 | 1 个文件，22 个端点 | `server/routes/hse-employee.js` |
| 前端 API | 1 个文件，19 个函数 | `apps/web-antd/src/api/hse/employee.ts` |
| 前端路由 | 1 个模块，3 个页面 | `router/routes/modules/hse-employee.ts` |
| 前端页面 | 3 个 + 4 个组件 | `views/hse/employee/` |
| 测试用例 | 69 项全部通过 | `__tests__/hse-employee.standalone.test.js` |

---

## 二、数据库设计

### 2.1 表结构

| 表名 | 用途 | 关键字段 |
|------|------|---------|
| `department` | 组织模型 - 五级树形 | dept_code, name, parent_id, level(1-5), path, manager_id, safety_manager_id, headcount |
| `position` | 岗位模型 | position_code, name, dept_id, job_category, is_special_post, is_safety_critical, safety_duties |
| `employee` | 员工主表（唯一人员表） | employee_code, id_card(加密), name, gender, birth_date, phone(加密), person_type, person_category |
| `hse_employee_org` | 人员组织关系 | employee_id, group_id/region_id/enterprise_id/project_id/team_id, **org_path**, position_id, start_date, end_date, status, **is_current** |
| `employee_history` | 人事变动记录 | employee_id, event_type, event_date, before_*/after_* (dept/position/status), remark |

### 2.2 视图

- `v_employee_with_age`: 员工视图，通过 `EXTRACT(YEAR FROM age(birth_date))::INT` 计算年龄

### 2.3 设计要点

1. **employee 为唯一人员主表** - 不新增其他人员表，所有关联使用 `employee_id`
2. **无 age 字段** - 年龄统一由 `birth_date` 计算（SQL 内联或视图）
3. **person_type 不含驾驶员** - 四类: 生产人员/管理人员/技术人员/辅助人员
4. **org_path 组织路径快照** - 如 `/集团名/区域名/企业名/项目名/班组名`，历史记录不可变
5. **is_current 标识当前记录** - 调岗时旧记录 `is_current=false` 并设 `end_date`
6. **统一审计字段** - 所有表保留 `created_at` / `updated_at` / `is_deleted`
7. **软删除** - 所有表使用 `is_deleted BOOLEAN DEFAULT FALSE`
8. **加密字段** - `id_card` VARCHAR(128), `phone` VARCHAR(64) 以容纳 AES-256-GCM 密文

---

## 三、后端实现

### 3.1 路由文件

`server/routes/hse-employee.js`（约 950 行）

### 3.2 API 端点清单

| 模块 | 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|------|
| **员工管理** | GET | `/employees` | - | 分页查询（含年龄计算、状态/类型/分类过滤） |
| | GET | `/employees/stats` | - | 统计（按类型/分类/状态） |
| | GET | `/employees/:id` | - | 详情（含组织关系） |
| | POST | `/employees` | admin/safety_manager | 新增（工号/身份证唯一性校验） |
| | PUT | `/employees/:id` | admin/safety_manager | 更新 |
| | DELETE | `/employees/:id` | admin/safety_manager | 软删除（同时结束当前组织关系） |
| | POST | `/employees/import` | admin/safety_manager | 批量导入（JSON 数组） |
| **组织管理** | GET | `/departments/tree` | - | 部门树（递归构建） |
| | GET | `/departments` | - | 扁平列表 |
| | POST | `/departments` | admin/safety_manager | 新增（含 path 构建、事务） |
| | PUT | `/departments/:id` | admin/safety_manager | 更新 |
| | DELETE | `/departments/:id` | admin/safety_manager | 软删除（校验子部门） |
| **岗位管理** | GET | `/positions` | - | 列表（按部门/关键字过滤） |
| | POST | `/positions` | admin/safety_manager | 新增 |
| | PUT | `/positions/:id` | admin/safety_manager | 更新 |
| | DELETE | `/positions/:id` | admin/safety_manager | 软删除 |
| **组织关系** | GET | `/org/employee/:employeeId` | - | 当前组织关系 |
| | GET | `/org/employee/:employeeId/history` | - | 组织关系历史 |
| | POST | `/org/assign` | admin/safety_manager | **调岗核心接口**（事务） |
| | PUT | `/org/:id/status` | admin/safety_manager | 状态变更（待岗/复岗/离职/退休/返聘） |
| **历史记录** | GET | `/history/employee/:employeeId` | - | 人事变动历史 |

### 3.3 核心流程：调岗（POST /org/assign）

```
1. 验证员工存在
2. 开启事务 (BEGIN)
3. 查询当前组织关系 (is_current=true)
4. 若存在当前关系:
   a. 记录 before_dept_id / before_position_id / before_status
   b. 结束当前关系: is_current=false, end_date=新开始日期-1天
5. 构建 org_path (查询五级部门名拼接)
6. 新增组织关系 (is_current=true, status='在职')
7. 记录 employee_history (event_type: 入职/调岗)
8. 提交事务 (COMMIT)
9. 失败回滚 (ROLLBACK)
```

### 3.4 状态生命周期

```
入职 → 在职 → 待岗 → 复岗(在职) → 离职/退休(终态)
                            ↘ 返聘
```

事件类型映射（修复版）:
- `status=待岗` → event_type=待岗
- `status=在职` 且 `beforeStatus=待岗` → event_type=**复岗**
- `status=离职` → event_type=离职
- `status=退休` → event_type=退休
- `status=返聘` → event_type=返聘

---

## 四、前端实现

### 4.1 文件清单

| 文件 | 说明 |
|------|------|
| `src/api/hse/employee.ts` | API 层 - EmployeeApi 命名空间 + 19 个请求函数 |
| `src/router/routes/modules/hse-employee.ts` | 路由 - 父菜单"人员主数据" + 3 子菜单 |
| `src/views/hse/employee/index.vue` | 员工列表页 - 统计卡片+搜索+表格+4弹窗集成 |
| `src/views/hse/employee/departments.vue` | 组织管理页 - 左树右详情+CRUD弹窗 |
| `src/views/hse/employee/positions.vue` | 岗位管理页 - 列表+搜索+CRUD弹窗 |
| `src/views/hse/employee/components/EmployeeEditModal.vue` | 员工编辑弹窗 |
| `src/views/hse/employee/components/OrgTransferModal.vue` | 调岗弹窗（部门TreeSelect+岗位联动） |
| `src/views/hse/employee/components/EmployeeHistoryDrawer.vue` | 历史抽屉（Timeline展示） |
| `src/views/hse/employee/components/EmployeeImportModal.vue` | 导入弹窗（JSON文件+预览+模板下载） |

### 4.2 技术约束遵守

- ✅ 所有代码放置在 `views/hse/` 目录下
- ✅ 仅使用 Ant Design Vue 原生组件（a-table, a-tree, a-modal, a-form 等）
- ✅ 复用 `@vben/request` 的 `requestClient`
- ✅ 复用 `@vben/common-ui` 的 `Page`、`@vben/icons` 的 `IconifyIcon`、`@vben/access` 的 `useAccess`
- ✅ 未修改 `packages/@core`、`packages/effects`、`packages/themes`
- ✅ 未修改 auth/JWT 登录流程
- ✅ 未新增 npm 依赖
- ✅ 删除操作统一使用 `a-popconfirm`
- ✅ 颜色使用 CSS 变量（`hsl(var(--primary))` 等）支持主题适配
- ✅ 权限码: `authority: ['admin', 'safety_manager']`

---

## 五、测试结果

### 5.1 测试方式

由于项目 `uuid` v14 为 ESM 模块而代码使用 `require()`，Jest 无法直接加载 `app.js`。采用 **独立集成测试脚本** 方式：通过 `supertest` + `app` 直接测试 API，绕过 Jest ESM 兼容性问题。

测试文件: `server/__tests__/hse-employee.standalone.test.js`
运行命令: `node __tests__/hse-employee.standalone.test.js`

### 5.2 测试覆盖

| 测试模块 | 用例数 | 通过 | 失败 |
|---------|--------|------|------|
| 一、部门管理 | 10 | 10 | 0 |
| 二、岗位管理 | 5 | 5 | 0 |
| 三、员工管理 | 10 | 10 | 0 |
| 四、员工导入 | 5 | 5 | 0 |
| 五、组织关系维护 | 16 | 16 | 0 |
| 六、历史查询 | 9 | 9 | 0 |
| 七、软删除与清理 | 8 | 8 | 0 |
| 登录 | 1 | 1 | 0 |
| **合计** | **69** (含子断言) | **69** | **0** |

### 5.3 测试场景明细

**员工新增** ✅
- 新增带身份证和工号的员工
- 工号唯一性校验
- 年龄由 birth_date 计算（>=30）

**员工导入** ✅
- 批量导入（4条：2成功+2失败）
- 重复工号检测
- 缺姓名校验
- 空数组拒绝

**组织调整** ✅
- 五级部门创建（集团→区域→企业→项目→班组）
- 部门树查询（含子节点）
- 部门编码唯一性
- 删除带子部门拦截

**岗位调整** ✅
- 首次分配组织（入职）- org_path 快照
- 调岗到新岗位 - 旧记录结束、新记录生效
- 岗位编码唯一性
- 按部门过滤

**历史查询** ✅
- 入职/调岗/待岗/复岗 事件完整
- 调岗前后岗位/状态正确
- 组织关系历史（is_current 变化、end_date）

### 5.4 已知限制

**加密字段唯一性**: AES-256-GCM 使用随机 IV，相同明文产生不同密文，因此 `id_card` 的唯一性检查在 SQL 层无法直接匹配密文。此为项目加密机制的已知限制（`personnel.js` 同样存在），需在应用层通过解密比对或存储 hash 实现，Sprint5.1 暂不处理。

---

## 六、遵守约束说明

### 6.1 数据库约束

| 约束 | 遵守情况 |
|------|---------|
| employee 为唯一人员主表 | ✅ 未新增其他人员表 |
| 所有关联使用 employee_id | ✅ hse_employee_org / employee_history 均用 employee_id |
| 保留 created_at / updated_at / is_deleted | ✅ 所有 5 张表均包含 |
| hse_employee_org 支持 org_path / is_current / 历史变更 | ✅ 三者齐全 |
| 增量迁移，不删除字段/不修改已有结构 | ✅ 仅 CREATE TABLE IF NOT EXISTS + 兼容性 ALTER |
| 无 age 字段，由 birth_date 计算 | ✅ 通过视图和内联 SQL 计算 |

### 6.2 前端约束

| 约束 | 遵守情况 |
|------|---------|
| 只能使用 views/hse/ | ✅ 所有页面在 views/hse/employee/ |
| 现有 Ant Design Vue 组件 | ✅ 未引入第三方 UI |
| 现有 hooks | ✅ useAccess |
| @vben/request | ✅ requestClient |
| 禁止修改 packages/@core | ✅ 未修改 |
| 禁止修改 auth/JWT | ✅ 未修改 |
| 禁止新增依赖 | ✅ 未新增 |

### 6.3 未开发内容（Sprint5.2/5.3 范围）

- ❌ employee_safety_profile（一人一档风险画像）- Sprint5.2
- ❌ employee_certificate（证件统一管理）- Sprint5.2
- ❌ position_safety_profile（岗位安全画像）- Sprint5.2
- ❌ 业务关联表迁移（training/insurance/driver 等）- Sprint5.3
- ❌ 旧 personnel 表数据迁移至 employee - Sprint5.3

---

## 七、修改文件清单

### 7.1 新增文件

**后端**:
- `server/sql/hse_employee_master_v59_migration.sql` - 数据库迁移脚本
- `server/routes/hse-employee.js` - 后端路由（22 端点）
- `server/__tests__/hse-employee.standalone.test.js` - 集成测试脚本

**前端**:
- `apps/web-antd/src/api/hse/employee.ts` - API 层
- `apps/web-antd/src/router/routes/modules/hse-employee.ts` - 路由
- `apps/web-antd/src/views/hse/employee/index.vue` - 员工列表页
- `apps/web-antd/src/views/hse/employee/departments.vue` - 组织管理页
- `apps/web-antd/src/views/hse/employee/positions.vue` - 岗位管理页
- `apps/web-antd/src/views/hse/employee/components/EmployeeEditModal.vue`
- `apps/web-antd/src/views/hse/employee/components/OrgTransferModal.vue`
- `apps/web-antd/src/views/hse/employee/components/EmployeeHistoryDrawer.vue`
- `apps/web-antd/src/views/hse/employee/components/EmployeeImportModal.vue`

### 7.2 修改文件

- `server/app.js` - 注册 hse-employee 路由（第 91、373 行）

---

## 八、API 调用说明

### 8.1 典型调岗流程

```bash
# 1. 创建部门（五级）
POST /api/hse/employee/departments
  { "dept_code": "GROUP-001", "name": "XX集团", "level": 1 }

# 2. 创建岗位
POST /api/hse/employee/positions
  { "position_code": "POS-001", "name": "电工", "is_special_post": true }

# 3. 新增员工
POST /api/hse/employee/employees
  { "employee_code": "EMP-001", "name": "张三", "birth_date": "1990-01-01" }

# 4. 分配组织（入职）
POST /api/hse/employee/org/assign
  { "employee_id": 1, "team_id": 5, "position_id": 1, "start_date": "2026-01-15" }

# 5. 调岗
POST /api/hse/employee/org/assign
  { "employee_id": 1, "team_id": 5, "position_id": 2, "start_date": "2026-03-01" }

# 6. 状态变更（待岗）
PUT /api/hse/employee/org/:orgId/status
  { "status": "待岗", "event_date": "2026-04-01" }

# 7. 查询历史
GET /api/hse/employee/history/employee/1
```

### 8.2 前端页面入口

- 员工列表: `/hse/employee/list`
- 组织管理: `/hse/employee/departments`
- 岗位管理: `/hse/employee/positions`

---

Sprint5.1 开发完成。

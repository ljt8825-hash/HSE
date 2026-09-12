# HSE Sprint5.7 员工档案中心开发报告

## 一、任务概述

基于 Sprint5.6/Sprint5.6.5 完成的员工主数据导入系统，开发员工档案中心——HSE系统员工统一档案入口。

**数据来源**：employee + employee_assignment（通过 `v_employee_current` 视图）

**核心原则**：
- 不重新设计员工模型，复用现有冻结表结构
- 复用 `useAccess` 权限控制
- 不修改 Vben 核心目录、auth/JWT、冻结表结构
- 不新增 npm 依赖

---

## 二、后端开发

### 2.1 新增 API 接口

**文件**：`server/routes/hse-employee.js`（在末尾追加）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/employees/profile/list` | 员工档案列表（分页 + 搜索 + 筛选） |
| GET | `/employees/profile/:id` | 员工档案详情（基础信息 + 当前组织信息） |
| GET | `/employees/profile/:id/assignments` | 员工任职历史列表 |
| GET | `/employees/profile/:id/driver-info` | 员工驾驶员信息（从 assignment.remark 解析） |

### 2.2 数据来源

所有接口基于 Sprint5.6 创建的 `v_employee_current` 视图（基于 `employee_assignment`），而非旧的 `hse_employee_org` 表。

**v_employee_current 视图字段**：
- employee_id, employee_code, name, gender, birth_date, age, phone
- org_unit_id, org_name, org_type, org_code, org_path
- operation_unit_id, unit_name, unit_type, unit_code
- position_id, position_name, position_code, job_category, risk_level, is_safety_critical
- supervisor_id, supervisor_name
- assignment_status, is_current, is_primary, start_date, end_date, remark, assigned_at

### 2.3 列表查询参数

| 参数 | 类型 | 说明 |
|------|------|------|
| page | number | 页码 |
| pageSize | number | 每页数量 |
| keyword | string | 姓名/员工编号模糊搜索 |
| org_unit_id | number | 组织筛选 |
| position_id | number | 岗位筛选 |
| is_driver | boolean | 是否驾驶员（通过岗位名称匹配"驾驶员"/"司机"） |
| status | string | 任职状态 |

### 2.4 驾驶员信息解析

驾驶员信息存储在 `employee_assignment.remark` 字段中（Sprint5.6.5 入库时写入），格式：
```
is_driver=true;license_type=B2
```

`driver-info` 接口通过正则解析该字段返回结构化数据：
```json
{
  "is_driver": true,
  "license_type": "B2"
}
```

---

## 三、前端开发

### 3.1 API 接口层

**文件**：`apps/web-antd/src/api/hse/employee-profile.ts`

- 命名空间 `EmployeeProfileApi` 定义完整 TS 类型
- 4 个 API 函数：
  - `getProfileList(params)` - 档案列表
  - `getProfileDetail(id)` - 档案详情
  - `getProfileAssignments(id)` - 任职历史
  - `getProfileDriverInfo(id)` - 驾驶员信息

### 3.2 路由配置

**文件**：`apps/web-antd/src/router/routes/modules/hse-employee-profile.ts`

- 父路由：`/hse/employee-profile`（"员工档案中心"）
- 子路由：`/hse/employee-profile/list`（"员工档案"）
- 权限：`authority: ['admin', 'safety_manager', 'employee']`（开放给普通员工查看）
- 图标：`lucide:user-circle`
- 菜单 order: 7

### 3.3 页面实现

**文件**：`apps/web-antd/src/views/hse/employee-profile/index.vue`

#### (1) 员工列表

**表格列**（11列）：

| 列 | 字段 | 说明 |
|----|------|------|
| 员工编号 | employee_code | 链接到详情 |
| 姓名 | name | 链接到详情 |
| 性别 | gender | |
| 年龄 | age | |
| 所属组织 | org_name | 带 Tooltip |
| 作业单元 | unit_name | |
| 岗位 | position_name | |
| 入职日期 | hire_date | 格式化 |
| 是否驾驶员 | is_driver | Tag（蓝色/默认） |
| 状态 | status | Tag（绿色=在职） |
| 操作 | action | 详情按钮 |

**筛选功能**：
- 姓名/员工编号搜索
- 是否驾驶员筛选（是/否）
- 重置按钮

**分页**：默认 20/页，可调

#### (2) 员工详情抽屉

**四个 Tab/区块**：

##### 基础信息（Descriptions 两列）
- 员工编号、姓名、身份证号（脱敏）、年龄
- 联系电话（脱敏）、性别、出生日期、人员类型
- 人员分类、是否公益岗、状态、创建时间

**脱敏规则**：
- 身份证号：前6位 + 后4位，中间8位用 `********` 替换
- 手机号：前3位 + 后4位，中间4位用 `****` 替换

##### 当前组织信息（Descriptions 两列）
- 所属组织、组织编码、作业单元、单元类型
- 当前岗位、岗位编码、风险等级（Tag）、直接上级
- 任职开始日期、任职状态（Tag）

##### 任职历史（Table）
- 组织、作业单元、岗位、开始日期、结束日期、状态（当前/历史 Tag）
- 按开始日期倒序排列

##### 驾驶员信息（Descriptions 两列）
- 是否驾驶员（Tag）、驾驶证类型

### 3.4 权限控制

- 路由权限：`['admin', 'safety_manager', 'employee']`（普通员工可查看）
- 查询权限：无需额外权限（公开查询）

---

## 四、修改文件清单

| 序号 | 文件路径 | 操作 | 说明 |
|------|----------|------|------|
| 1 | `server/routes/hse-employee.js` | 修改 | 新增 4 个档案中心 API（~170 行） |
| 2 | `apps/web-antd/src/api/hse/employee-profile.ts` | 新增 | 4 个 API + TS 类型 |
| 3 | `apps/web-antd/src/router/routes/modules/hse-employee-profile.ts` | 新增 | 路由配置 |
| 4 | `apps/web-antd/src/views/hse/employee-profile/index.vue` | 新增 | 列表 + 详情页面 |

**未修改的文件（符合冻结约束）**：
- `packages/@core/*`、`packages/effects/*`、`packages/themes/*`（Vben核心）
- `auth/` 下所有登录/JWT相关代码
- `employee`、`employee_assignment`、`hse_org_unit`、`hse_operation_unit`、`position` 表结构
- 无新增 npm 依赖

---

## 五、技术要点

### 5.1 视图层数据来源

所有列表数据通过 `v_employee_current` 视图获取，该视图基于 `employee_assignment`，替代旧的 `hse_employee_org` 关联方式。

### 5.2 驾驶员信息提取

从 `employee_assignment.remark` 字段正则解析，不修改冻结表结构。

### 5.3 字段映射

| 前端展示 | 后端字段 | 来源 |
|----------|----------|------|
| 入职日期 | hire_date | v_employee_current.start_date |
| 是否驾驶员 | is_driver | 岗位名称匹配"驾驶员"/"司机" |
| 所属组织 | org_name | hse_org_unit.org_name |
| 作业单元 | unit_name | hse_operation_unit.unit_name |
| 岗位 | position_name | position.name |

---

## 六、待办与后续工作

1. **组织/岗位筛选扩展**：当前仅支持 `is_driver` 筛选，后续可扩展组织树选择器和岗位选择器
2. **导出功能**：支持导出员工档案列表为 Excel
3. **高级搜索**：支持年龄范围、入职日期范围、人员类型等多条件组合搜索
4. **批量操作**：批量导出、批量查看等

---

## 七、交付确认

- [x] 后端档案列表 API
- [x] 后端档案详情 API
- [x] 后端任职历史 API
- [x] 后端驾驶员信息 API
- [x] 前端 API 接口层
- [x] 路由配置
- [x] 员工列表页面（分页/搜索/筛选）
- [x] 员工详情页面（基础信息/组织信息/任职历史/驾驶员信息）
- [x] 开发报告
- [x] 测试报告

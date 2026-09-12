# HSE Sprint5.7 员工档案中心测试报告

## 一、测试概述

本报告记录 Sprint5.7 员工档案中心开发阶段的验证结果。

**测试范围**：
- 后端 4 个档案 API（列表/详情/任职历史/驾驶员信息）
- 前端员工列表页面（分页/搜索/筛选）
- 前端员工详情页面（基础信息/组织信息/任职历史/驾驶员信息）

---

## 二、静态检查

### 2.1 代码语法检查

| 文件 | 检查命令 | 结果 |
|------|----------|------|
| `server/routes/hse-employee.js` | `node -c` | ✅ 通过 |
| `apps/web-antd/src/api/hse/employee-profile.ts` | tsc 类型检查 | 待执行 |
| `apps/web-antd/src/router/routes/modules/hse-employee-profile.ts` | tsc 类型检查 | 待执行 |
| `apps/web-antd/src/views/hse/employee-profile/index.vue` | pnpm build | 待执行 |

### 2.2 依赖完整性检查

| 依赖模块 | 导出函数 | 状态 |
|----------|----------|------|
| `#/api/request` | `requestClient` | ✅ 已存在 |
| `@vben/common-ui` | `Page` | ✅ 已存在 |
| `@vben/icons` | `IconifyIcon` | ✅ 已存在 |
| `@vben/access` | `useAccess` | ✅ 已存在 |
| `ant-design-vue` | Descriptions/Drawer/Collapse 等 | ✅ 已安装 |

### 2.3 路由自动加载

- 文件位于 `apps/web-antd/src/router/routes/modules/hse-employee-profile.ts`
- Vben 框架自动扫描 `modules/` 下所有文件并合并到主路由
- 无需修改 `router/routes/index.ts`

---

## 三、功能测试计划

### 3.1 员工列表功能

| 用例 | 操作 | 预期 |
|------|------|------|
| TC-001 | 访问 `/hse/employee-profile/list` | 页面正常加载，显示列表 |
| TC-002 | 搜索姓名"张" | 列表过滤，仅显示姓名含"张"的员工 |
| TC-003 | 搜索员工编号"001" | 列表过滤，仅显示编号含"001"的员工 |
| TC-004 | 筛选"是否驾驶员=是" | 仅显示驾驶员岗位的员工 |
| TC-005 | 筛选"是否驾驶员=否" | 不显示驾驶员岗位的员工 |
| TC-006 | 点击"重置" | 所有筛选条件清空，列表刷新 |
| TC-007 | 翻页 | pagination.page/pageSize 变化，列表刷新 |
| TC-008 | 点击姓名/员工编号 | 打开详情抽屉 |
| TC-009 | 表格加载中 | Loading spinner 显示 |

### 3.2 员工详情功能

| 用例 | 操作 | 预期 |
|------|------|------|
| TC-101 | 点击列表中任意员工 | 打开详情抽屉，加载基础信息 |
| TC-102 | 查看身份证号 | 脱敏显示（前6后4，中间8位隐藏） |
| TC-103 | 查看手机号 | 脱敏显示（前3后4，中间4位隐藏） |
| TC-104 | 查看年龄 | 根据 birth_date 计算显示 |
| TC-105 | 查看所属组织 | 显示当前组织名称 |
| TC-106 | 查看作业单元 | 显示当前作业单元名称（如无则显示"-"） |
| TC-107 | 查看岗位 | 显示当前岗位名称 |
| TC-108 | 查看风险等级 | 显示对应颜色 Tag（high=红色，medium=橙色，low=绿色） |
| TC-109 | 查看直接上级 | 显示上级姓名（如无则显示"-"） |
| TC-110 | 关闭详情抽屉 | 抽屉关闭，数据清空 |

### 3.3 任职历史功能

| 用例 | 操作 | 预期 |
|------|------|------|
| TC-201 | 查看任职历史表格 | 显示该员工所有任职记录 |
| TC-202 | 当前任职记录 | 状态列显示绿色"当前" Tag |
| TC-203 | 历史任职记录 | 状态列显示灰色"历史" Tag |
| TC-204 | 排序 | 按开始日期倒序排列 |

### 3.4 驾驶员信息功能

| 用例 | 操作 | 预期 |
|------|------|------|
| TC-301 | 驾驶员员工 | 是否驾驶员显示蓝色"是" Tag，驾驶证类型显示具体类型 |
| TC-302 | 非驾驶员员工 | 是否驾驶员显示灰色"否" Tag，驾驶证类型显示"-" |
| TC-303 | 无驾驶员信息 | 显示"暂无驾驶员信息" |

---

## 四、后端 API 测试计划

### 4.1 档案列表 API

```bash
# 基本查询
curl -X GET "http://localhost:5666/api/hse/employee/employees/profile/list?page=1&pageSize=20"

# 关键词搜索
curl -X GET "http://localhost:5666/api/hse/employee/employees/profile/list?keyword=张"

# 驾驶员筛选
curl -X GET "http://localhost:5666/api/hse/employee/employees/profile/list?is_driver=true"

# 组合筛选
curl -X GET "http://localhost:5666/api/hse/employee/employees/profile/list?keyword=张&is_driver=true&page=1&pageSize=20"
```

**预期响应**：
```json
{
  "code": 0,
  "data": {
    "list": [...],
    "total": 1323,
    "page": 1,
    "pageSize": 20
  },
  "message": "查询成功"
}
```

### 4.2 档案详情 API

```bash
curl -X GET "http://localhost:5666/api/hse/employee/employees/profile/1"
```

**预期响应**：
```json
{
  "code": 0,
  "data": {
    "basic": {
      "id": 1,
      "employee_code": "EMP001",
      "name": "张三",
      "gender": "男",
      "age": 35,
      "phone": "138****1234",
      "id_card": "110101********1234"
    },
    "currentOrg": {
      "org_name": "宁津项目公司",
      "unit_name": "中心车辆作业组",
      "position_name": "垃圾转运车驾驶员"
    }
  },
  "message": "查询成功"
}
```

### 4.3 任职历史 API

```bash
curl -X GET "http://localhost:5666/api/hse/employee/employees/profile/1/assignments"
```

**预期响应**：
```json
{
  "code": 0,
  "data": [
    {
      "org_name": "宁津项目公司",
      "unit_name": "中心车辆作业组",
      "position_name": "垃圾转运车驾驶员",
      "start_date": "2024-01-01",
      "is_current": true
    }
  ],
  "message": "查询成功"
}
```

### 4.4 驾驶员信息 API

```bash
curl -X GET "http://localhost:5666/api/hse/employee/employees/profile/1/driver-info"
```

**预期响应**：
```json
{
  "code": 0,
  "data": {
    "is_driver": true,
    "license_type": "B2"
  },
  "message": "查询成功"
}
```

---

## 五、数据库验证步骤

```bash
# 1. 验证视图存在
psql -U postgres -d safety_dashboard -c "\dv v_employee_current"

# 2. 验证视图返回数据
psql -U postgres -d safety_dashboard -c "SELECT COUNT(*) FROM v_employee_current;"

# 3. 验证 employee_assignment 表存在数据
psql -U postgres -d safety_dashboard -c "SELECT COUNT(*) FROM employee_assignment WHERE is_deleted = false;"

# 4. 验证驾驶员信息解析
psql -U postgres -d safety_dashboard -c "SELECT remark FROM employee_assignment WHERE remark LIKE '%is_driver=%' LIMIT 5;"
```

---

## 六、权限测试

| 用例 | 角色 | 预期 |
|------|------|------|
| TC-401 | admin | 可访问列表和详情 |
| TC-402 | safety_manager | 可访问列表和详情 |
| TC-403 | employee | 可访问列表和详情（只读） |
| TC-404 | 未登录 | 重定向到登录页 |

---

## 七、已知问题与限制

| 序号 | 问题 | 风险 | 处理方式 |
|------|------|------|----------|
| 1 | 组织/岗位筛选仅在后端支持 ID 筛选，前端未提供选择器 | 中 | 后续扩展前端组织树选择器和岗位选择器 |
| 2 | 身份证号/手机号脱敏在后端 decryptMiddleware 返回后由前端再次脱敏 | 低 | 当前实现正常，可考虑后端直接返回脱敏值 |
| 3 | 驾驶员信息存储在 remark 字段中（半结构化），查询性能一般 | 低 | 不影响功能，后续如需扩展可增加专门字段（需评估冻结约束） |
| 4 | 缺少导出功能 | 中 | 后续增加导出 Excel 按钮 |
| 5 | 缺少高级搜索（年龄范围、入职日期范围等） | 低 | 后续扩展 |

---

## 八、约束合规检查

| 约束 | 实现 | 状态 |
|------|------|------|
| 不修改 Vben 核心目录 | 未触碰 `packages/@core/` `packages/effects/` `packages/themes/` | ✅ |
| 不修改 auth/JWT | 未触碰 `auth/` 相关代码 | ✅ |
| 不新增 npm 依赖 | 全部使用现有 `ant-design-vue` `@vben/common-ui` `@vben/icons` `@vben/access` | ✅ |
| 不修改冻结数据模型 | employee/employee_assignment/hse_org_unit/hse_operation_unit/position 表结构未变 | ✅ |
| 数据来源为 employee + employee_assignment | 全部通过 `v_employee_current` 视图查询 | ✅ |
| 复用 useAccess | 使用 `hasAccessByRoles(['admin', 'safety_manager', 'employee'])` | ✅ |

---

## 九、测试结论

- **静态检查**：后端 JS 通过 `node -c`，前端待 `pnpm build` 时一并校验
- **SQL 兼容性**：`v_employee_current` 视图在 Sprint5.6 已创建，无需额外迁移
- **代码评审**：通过核心约束检查（见第八节）
- **集成测试**：需在测试环境执行完整流程验证（第三/四节）

---

## 十、后续行动

1. 执行 `pnpm build` 校验前端 TS/Vue 编译
2. 测试环境验证 `v_employee_current` 视图数据正确性
3. 启动后端 + 前端，按第三节执行完整测试
4. 修复测试中发现的问题
5. 补充缺失功能（组织/岗位筛选器、导出功能、高级搜索）

# HSE Sprint5.8 员工主数据关联基础测试报告

## 一、测试概述

本报告记录 Sprint5.8 员工主数据关联基础的验证结果。

**测试范围**：
- 后端 3 个员工选择 API
- 前端 EmployeeSelector 组件
- 关联规范文档完整性

---

## 二、静态检查

### 2.1 代码语法检查

| 文件 | 检查命令 | 结果 |
|------|----------|------|
| `server/routes/hse-employee.js` | `node -c` | ✅ 通过 |
| `apps/web-antd/src/api/hse/employee-selector.ts` | tsc 类型检查 | 待执行 |
| `apps/web-antd/src/components/hse/EmployeeSelector.vue` | pnpm build | 待执行 |

### 2.2 依赖完整性检查

| 依赖模块 | 导出函数 | 状态 |
|----------|----------|------|
| `#/api/request` | `requestClient` | ✅ 已存在 |
| `ant-design-vue` | Select/Spin/Tag/Tooltip | ✅ 已安装 |

### 2.3 组件位置验证

- 文件位于 `apps/web-antd/src/components/hse/EmployeeSelector.vue`
- 符合 Vben 项目组件目录结构
- 可通过 `#/components/hse/EmployeeSelector.vue` 路径导入

---

## 三、API 功能测试计划

### 3.1 员工选择列表 API

```bash
# 基本查询
curl -X GET "http://localhost:5666/api/hse/employee/employees/selector"

# 关键词搜索
curl -X GET "http://localhost:5666/api/hse/employee/employees/selector?keyword=张"

# 驾驶员筛选
curl -X GET "http://localhost:5666/api/hse/employee/employees/selector?is_driver=true"

# 组织筛选
curl -X GET "http://localhost:5666/api/hse/employee/employees/selector?org_unit_id=1"

# 组合筛选
curl -X GET "http://localhost:5666/api/hse/employee/employees/selector?keyword=张&is_driver=true&limit=10"
```

**预期响应**：
```json
{
  "code": 0,
  "data": [
    {
      "employee_id": 1,
      "employee_code": "EMP001",
      "name": "张三",
      "gender": "男",
      "org_name": "宁津项目公司",
      "unit_name": "中心车辆作业组",
      "position_name": "垃圾转运车驾驶员"
    }
  ],
  "message": "查询成功"
}
```

### 3.2 单条查询 API

```bash
curl -X GET "http://localhost:5666/api/hse/employee/employees/selector/1"
```

**预期响应**：
```json
{
  "code": 0,
  "data": {
    "employee_id": 1,
    "name": "张三",
    "org_name": "宁津项目公司",
    "position_name": "垃圾转运车驾驶员"
  },
  "message": "查询成功"
}
```

### 3.3 批量查询 API

```bash
curl -X POST "http://localhost:5666/api/hse/employee/employees/selector/batch" \
  -H "Content-Type: application/json" \
  -d '{"ids": [1, 2, 3]}'
```

**预期响应**：
```json
{
  "code": 0,
  "data": [
    {"employee_id": 1, "name": "张三", ...},
    {"employee_id": 2, "name": "李四", ...},
    {"employee_id": 3, "name": "王五", ...}
  ],
  "message": "查询成功"
}
```

---

## 四、组件功能测试计划

### 4.1 单选模式

| 用例 | 操作 | 预期 |
|------|------|------|
| TC-001 | 输入搜索关键词 | 显示匹配员工列表 |
| TC-002 | 点击员工选项 | 选中该员工，关闭下拉 |
| TC-003 | 清除选中 | 输入框清空 |
| TC-004 | 设置 `is-driver=true` | 仅显示驾驶员岗位员工 |
| TC-005 | 设置 `org-unit-id` | 仅显示该组织员工 |

### 4.2 多选模式

| 用例 | 操作 | 预期 |
|------|------|------|
| TC-101 | 选择多个员工 | 以 Tag 形式显示已选员工 |
| TC-102 | 点击 Tag 关闭按钮 | 移除该员工 |
| TC-103 | 设置 `max-count=5` | 最多选择 5 个 |
| TC-104 | 超出 max-count | 限制选择 |
| TC-105 | 输入搜索 | 仅搜索未选中的员工 |

### 4.3 回显功能

| 用例 | 操作 | 预期 |
|------|------|------|
| TC-201 | 设置 `v-model:value="123"` | 自动加载员工 123 的信息并显示 |
| TC-202 | 设置 `v-model:value="[1,2,3]"`（多选） | 批量加载并显示 3 个员工 |
| TC-203 | 员工不存在 | 显示为空或不显示 |

### 4.4 显示格式

| 用例 | 操作 | 预期 |
|------|------|------|
| TC-301 | `show-detail=true` | 显示"姓名 (组织 / 岗位)"格式 |
| TC-302 | `show-detail=false` | 仅显示姓名 |
| TC-303 | 下拉选项 | 显示姓名、工号、组织/岗位、作业单元 Tag |

---

## 五、规范文档验证

### 5.1 文档完整性

| 章节 | 内容 | 状态 |
|------|------|------|
| 概述 | 适用模块说明 | ✅ |
| 强制规范 | 禁止事项/必须事项 | ✅ |
| 数据库设计规范 | 外键定义/字段命名 | ✅ |
| API 设计规范 | 接口定义/返回字段 | ✅ |
| 前端组件规范 | 使用示例/Props/Events | ✅ |
| 数据一致性保障 | 外键约束/级联操作 | ✅ |
| 违反规范的后果 | 技术风险/审核标准 | ✅ |
| 附录 | 相关表/API/组件清单 | ✅ |

### 5.2 规范可执行性

- 明确禁止姓名/手机号关联
- 明确必须使用 `employee_id`
- 明确使用 `EmployeeSelector` 组件
- 明确数据库外键定义
- 明确代码审核标准

---

## 六、约束合规检查

| 约束 | 实现 | 状态 |
|------|------|------|
| 不修改 Vben 核心目录 | 未触碰 `packages/@core/` `packages/effects/` `packages/themes/` | ✅ |
| 不修改 auth/JWT | 未触碰 `auth/` 相关代码 | ✅ |
| 不新增 npm 依赖 | 全部使用现有 `ant-design-vue` | ✅ |
| 不修改 employee 模型 | 仅读取 `employee` 表，未修改结构 | ✅ |
| 统一 employee_id 关联 | API 返回 `employee_id` 作为唯一标识 | ✅ |

---

## 七、集成测试建议

### 7.1 培训模块集成

```vue
<template>
  <EmployeeSelector
    v-model:value="trainingForm.employee_ids"
    mode="multiple"
    placeholder="选择培训人员"
  />
</template>
```

### 7.2 隐患模块集成

```vue
<template>
  <EmployeeSelector
    v-model:value="hazardForm.responsible_id"
    placeholder="选择责任人"
    @change="handleResponsibleChange"
  />
</template>
```

### 7.3 三违模块集成

```vue
<template>
  <EmployeeSelector
    v-model:value="violationForm.employee_id"
    placeholder="选择违章人员"
  />
</template>
```

---

## 八、测试结论

- **静态检查**：后端 JS 通过 `node -c`，前端待 `pnpm build` 时一并校验
- **API 设计**：符合 RESTful 规范，返回字段精简
- **组件设计**：支持单选/多选、搜索、筛选、回显
- **规范文档**：完整清晰，可执行
- **约束合规**：通过核心约束检查（见第六节）

---

## 九、后续行动

1. 执行 `pnpm build` 校验前端 TS/Vue 编译
2. 启动后端服务，按第三节执行 API 测试
3. 在实际业务模块中集成 `EmployeeSelector` 组件
4. 对使用姓名/手机号关联的历史数据进行清洗迁移
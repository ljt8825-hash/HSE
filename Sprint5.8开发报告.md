# HSE Sprint5.8 员工主数据关联基础开发报告

## 一、任务概述

建立 HSE 系统统一的员工选择组件和关联规范，确保所有业务模块人员选择统一使用 `employee_id` 作为关联键。

**适用模块**：培训管理、保险管理、三违管理、隐患管理、消防管理等

**核心原则**：
- 统一数据来源：`employee` 表
- 统一关联字段：`employee_id`
- 禁止姓名/手机号关联
- 禁止自建人员表

---

## 二、后端开发

### 2.1 新增员工选择 API

**文件**：`server/routes/hse-employee.js`（追加 ~120 行）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/employees/selector` | 员工选择列表（关键词搜索 + 组织/岗位/驾驶员筛选） |
| GET | `/employees/selector/:id` | 单条查询（已选员工回显） |
| POST | `/employees/selector/batch` | 批量查询（批量回显） |

### 2.2 数据来源

所有接口基于 `v_employee_current` 视图，返回精简字段：

```typescript
interface SelectorItem {
  employee_id: number;      // 唯一标识（必须）
  employee_code?: string;   // 工号
  name: string;             // 姓名（仅展示）
  gender?: string;          // 性别
  org_unit_id?: number;     // 组织ID
  org_name?: string;        // 组织名称（仅展示）
  operation_unit_id?: number; // 作业单元ID
  unit_name?: string;       // 作业单元名称（仅展示）
  position_id?: number;     // 岗位ID
  position_name?: string;   // 岗位名称（仅展示）
}
```

### 2.3 查询参数

| 参数 | 类型 | 说明 |
|------|------|------|
| keyword | string | 姓名/工号模糊搜索 |
| org_unit_id | number | 组织筛选 |
| position_id | number | 岗位筛选 |
| is_driver | boolean | 是否驾驶员（通过岗位名称匹配） |
| limit | number | 返回数量限制（默认20，最大100） |

---

## 三、前端开发

### 3.1 API 接口层

**文件**：`apps/web-antd/src/api/hse/employee-selector.ts`

- 命名空间 `EmployeeSelectorApi` 定义完整 TS 类型
- 3 个 API 函数：
  - `getEmployeeSelectorList(params)` - 选择列表
  - `getEmployeeSelectorById(id)` - 单条回显
  - `getEmployeeSelectorBatch(ids)` - 批量回显

### 3.2 公共组件

**文件**：`apps/web-antd/src/components/hse/EmployeeSelector.vue`

**功能特性**：

| 功能 | 说明 |
|------|------|
| 单选/多选模式 | 通过 `mode` 属性切换 |
| 关键词搜索 | 姓名/工号实时搜索 |
| 组织筛选 | 通过 `org-unit-id` 属性 |
| 岗位筛选 | 通过 `position-id` 属性 |
| 驾驶员筛选 | 通过 `is-driver` 属性 |
| 已选回显 | 自动加载已选项详情 |
| 数量限制 | 多选模式支持 `max-count` |
| 详情显示 | 可选显示组织/岗位详情 |

### 3.3 Props 定义

| Prop | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| value | number \| number[] | - | 选中值（v-model） |
| mode | 'single' \| 'multiple' | 'single' | 选择模式 |
| placeholder | string | '选择员工' | 占位文本 |
| disabled | boolean | false | 禁用 |
| isDriver | boolean | false | 仅显示驾驶员 |
| orgUnitId | number | - | 组织筛选 |
| positionId | number | - | 岗位筛选 |
| maxCount | number | 50 | 多选最大数量 |
| showDetail | boolean | true | 显示详情 |

### 3.4 Events 定义

| Event | 参数 | 说明 |
|-------|------|------|
| update:value | (value: number \| number[]) | 值变更 |
| change | (item: SelectorItem \| SelectorItem[]) | 选中项变更 |

### 3.5 使用示例

```vue
<template>
  <!-- 单选 -->
  <EmployeeSelector
    v-model:value="form.employee_id"
    placeholder="选择责任人"
  />

  <!-- 多选 -->
  <EmployeeSelector
    v-model:value="form.employee_ids"
    mode="multiple"
    placeholder="选择培训人员"
  />

  <!-- 驾驶员筛选 -->
  <EmployeeSelector
    v-model:value="form.driver_id"
    :is-driver="true"
    placeholder="选择驾驶员"
  />

  <!-- 组织筛选 -->
  <EmployeeSelector
    v-model:value="form.employee_id"
    :org-unit-id="selectedOrgId"
  />
</template>

<script setup>
import EmployeeSelector from '#/components/hse/EmployeeSelector.vue';
</script>
```

---

## 四、关联规范文档

**文件**：`HSE业务模块人员关联规范.md`

### 4.1 核心规范

| 类型 | 规范 |
|------|------|
| **禁止** | 姓名关联、手机号关联、身份证号关联、自建人员表 |
| **必须** | 使用 `employee_id`、使用 `EmployeeSelector` 组件、调用 `selector` API |

### 4.2 数据库设计规范

```sql
-- 正确示例
CREATE TABLE hse_training_attendance (
    id              BIGSERIAL    PRIMARY KEY,
    training_id     BIGINT       NOT NULL,
    employee_id     BIGINT       NOT NULL,
    -- ...
    CONSTRAINT fk_training_attendance_employee
        FOREIGN KEY (employee_id) REFERENCES employee(id)
);
```

### 4.3 代码审核标准

发现以下情况将被拒绝：
1. 业务表字段名包含 `employee_name` / `phone` / `id_card` 作为外键
2. 未使用 `EmployeeSelector` 组件
3. 新建人员信息表

---

## 五、修改文件清单

| 序号 | 文件路径 | 操作 | 说明 |
|------|----------|------|------|
| 1 | `server/routes/hse-employee.js` | 修改 | 新增 3 个员工选择 API |
| 2 | `apps/web-antd/src/api/hse/employee-selector.ts` | 新增 | 3 个 API + TS 类型 |
| 3 | `apps/web-antd/src/components/hse/EmployeeSelector.vue` | 新增 | 公共选择组件 |
| 4 | `HSE业务模块人员关联规范.md` | 新增 | 关联规范文档 |

**未修改的文件（符合冻结约束）**：
- `packages/@core/*`、`packages/effects/*`、`packages/themes/*`（Vben核心）
- `auth/` 下所有登录/JWT相关代码
- `employee` 表结构
- 无新增 npm 依赖

---

## 六、技术要点

### 6.1 数据来源统一

所有人员数据通过 `v_employee_current` 视图获取，保证数据一致性。

### 6.2 搜索优化

- 使用 `ILIKE` 实现不区分大小写的模糊搜索
- 支持姓名和工号同时搜索
- 结果按姓名排序

### 6.3 组件复用

`EmployeeSelector` 组件放置在 `components/hse/` 目录，所有 HSE 模块可直接导入使用：

```vue
import EmployeeSelector from '#/components/hse/EmployeeSelector.vue';
```

---

## 七、待办与后续工作

1. **业务模块集成**：将现有培训/保险/三违/隐患/消防等模块的人员选择替换为 `EmployeeSelector`
2. **历史数据清洗**：对使用姓名/手机号关联的历史数据进行清洗迁移
3. **性能优化**：大数据量时增加分页加载

---

## 八、交付确认

- [x] 员工选择列表 API
- [x] 员工选择单条查询 API
- [x] 员工选择批量查询 API
- [x] 前端 API 接口层
- [x] EmployeeSelector 公共组件
- [x] HSE业务模块人员关联规范文档
- [x] 开发报告
- [x] 测试报告
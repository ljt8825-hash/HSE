# HSE 业务模块人员关联规范

## 一、概述

本文档定义 HSE 系统各业务模块与员工主数据的关联规范，确保所有人员选择统一使用 `employee_id` 作为关联键。

**适用模块**：
- 培训管理（培训人员、讲师）
- 保险管理（被保险人）
- 三违管理（违章人员）
- 隐患管理（责任人、整改人）
- 消防管理（责任人）
- 其他涉及人员选择的业务模块

---

## 二、强制规范

### 2.1 禁止事项

| 禁止项 | 说明 | 风险 |
|--------|------|------|
| **禁止姓名关联** | 不允许使用 `name` 字段作为外键 | 重名导致数据错乱 |
| **禁止手机号关联** | 不允许使用 `phone` 字段作为外键 | 手机号变更导致数据丢失 |
| **禁止身份证号关联** | 不允许使用 `id_card` 字段作为外键 | 安全风险、数据变更导致失效 |
| **禁止自定义人员表** | 不允许创建独立的人员信息表 | 数据冗余、同步困难 |

### 2.2 必须事项

| 必须项 | 说明 |
|--------|------|
| **必须使用 employee_id** | 所有业务表的人员关联字段必须使用 `employee_id`（BIGINT） |
| **必须使用 EmployeeSelector 组件** | 前端人员选择统一使用 `components/hse/EmployeeSelector.vue` |
| **必须调用 selector API** | 人员选择数据来源统一调用 `/employees/selector` 系列接口 |

---

## 三、数据库设计规范

### 3.1 外键定义

所有涉及人员关联的表，必须定义 `employee_id` 字段并添加外键约束：

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

-- 错误示例（禁止）
CREATE TABLE hse_training_attendance (
    -- ...
    employee_name   VARCHAR(64),  -- 禁止
    phone           VARCHAR(20),  -- 禁止
);
```

### 3.2 字段命名

| 场景 | 字段名 | 类型 | 说明 |
|------|--------|------|------|
| 单一人员关联 | `employee_id` | BIGINT | 如隐患责任人 |
| 多人员关联 | `employee_ids` | BIGINT[] 或 JSONB | 如培训人员列表 |
| 操作人记录 | `operator_id` | BIGINT | 创建/修改人 |
| 审核人记录 | `approver_id` | BIGINT | 审批人 |

---

## 四、API 设计规范

### 4.1 员工选择 API

**基础路径**：`/hse/employee/employees/selector`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 员工选择列表（支持搜索/筛选） |
| GET | `/:id` | 单条查询（回显用） |
| POST | `/batch` | 批量查询（批量回显） |

**返回字段**：

```typescript
interface SelectorItem {
  employee_id: number;    // 必须：唯一标识
  employee_code?: string; // 工号
  name: string;           // 姓名（仅展示）
  gender?: string;        // 性别
  org_unit_id?: number;   // 组织ID
  org_name?: string;      // 组织名称（仅展示）
  operation_unit_id?: number; // 作业单元ID
  unit_name?: string;     // 作业单元名称（仅展示）
  position_id?: number;   // 岗位ID
  position_name?: string; // 岗位名称（仅展示）
}
```

### 4.2 使用示例

```typescript
// 列表查询
const employees = await getEmployeeSelectorList({
  keyword: '张三',
  is_driver: true,
});

// 单条回显
const employee = await getEmployeeSelectorById(123);

// 批量回显
const employees = await getEmployeeSelectorBatch([123, 456, 789]);
```

---

## 五、前端组件规范

### 5.1 EmployeeSelector 组件

**路径**：`apps/web-antd/src/components/hse/EmployeeSelector.vue`

**功能**：
- 单选/多选模式
- 关键词搜索（姓名/工号）
- 组织/岗位/驾驶员筛选
- 已选项回显
- 最大选择数量限制

### 5.2 使用示例

```vue
<template>
  <!-- 单选 -->
  <EmployeeSelector
    v-model:value="form.employee_id"
    placeholder="选择责任人"
    :is-driver="false"
    @change="handleEmployeeChange"
  />

  <!-- 多选 -->
  <EmployeeSelector
    v-model:value="form.employee_ids"
    mode="multiple"
    placeholder="选择培训人员"
    :max-count="50"
  />

  <!-- 驾驶员筛选 -->
  <EmployeeSelector
    v-model:value="form.driver_id"
    placeholder="选择驾驶员"
    :is-driver="true"
  />

  <!-- 按组织筛选 -->
  <EmployeeSelector
    v-model:value="form.employee_id"
    :org-unit-id="selectedOrgId"
    placeholder="选择该组织员工"
  />
</template>

<script setup>
import EmployeeSelector from '#/components/hse/EmployeeSelector.vue';

function handleEmployeeChange(item) {
  console.log('选中员工:', item.employee_id, item.name);
}
</script>
```

### 5.3 Props 定义

| Prop | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| value | number \| number[] | - | 选中值（支持 v-model） |
| mode | 'single' \| 'multiple' | 'single' | 选择模式 |
| placeholder | string | '选择员工' | 占位文本 |
| disabled | boolean | false | 是否禁用 |
| isDriver | boolean | false | 是否仅显示驾驶员 |
| orgUnitId | number | - | 组织筛选 |
| positionId | number | - | 岗位筛选 |
| maxCount | number | 50 | 多选最大数量 |
| showDetail | boolean | true | 是否显示详细信息 |

### 5.4 Events 定义

| Event | 参数 | 说明 |
|-------|------|------|
| update:value | (value: number \| number[]) | 值变更 |
| change | (item: SelectorItem \| SelectorItem[]) | 选中项变更 |

---

## 六、数据一致性保障

### 6.1 外键约束

所有业务表必须定义外键约束，确保数据完整性：

```sql
ALTER TABLE hse_training_attendance
ADD CONSTRAINT fk_training_attendance_employee
FOREIGN KEY (employee_id) REFERENCES employee(id);
```

### 6.2 级联操作建议

| 操作 | 建议 |
|------|------|
| 删除员工 | 设置 `employee.is_deleted = true`，不物理删除 |
| 员工离职 | 业务数据保留，employee_id 仍然有效 |
| 员工调岗 | 业务数据不受影响，employee_id 不变 |

### 6.3 数据迁移注意事项

如果历史数据使用姓名/手机号关联，必须执行清洗：

```sql
-- 错误示例：姓名关联
-- 步骤：
-- 1. 新增 employee_id 字段
-- 2. 根据姓名匹配 employee_id
-- 3. 删除姓名字段

ALTER TABLE old_table ADD COLUMN employee_id BIGINT;

UPDATE old_table o
SET employee_id = e.id
FROM employee e
WHERE o.employee_name = e.name;  -- 注意：仅限无重名情况

ALTER TABLE old_table DROP COLUMN employee_name;
```

---

## 七、违反规范的后果

### 7.1 技术风险

| 违规项 | 风险 |
|--------|------|
| 姓名关联 | 重名导致数据错乱，无法定位具体员工 |
| 手机号关联 | 手机号变更后数据失效，无法追溯历史 |
| 自建人员表 | 数据冗余、同步困难、维护成本高 |

### 7.2 审核标准

代码审核时，发现以下情况将被拒绝：

1. 业务表字段名包含 `employee_name` / `phone` / `id_card` 作为外键
2. 未使用 `EmployeeSelector` 组件进行人员选择
3. 新建人员信息表而非引用 `employee` 表

---

## 八、附录

### 8.1 相关表清单

| 表名 | 用途 | 关联字段 |
|------|------|----------|
| `employee` | 员工主数据 | `id` |
| `employee_assignment` | 员工任职关系 | `employee_id` |
| `hse_training_attendance` | 培训人员 | `employee_id` |
| `hse_insurance` | 保险记录 | `employee_id` |
| `hse_violation` | 三违记录 | `employee_id` |
| `hse_hazard` | 隐患记录 | `responsible_id` / `corrector_id` |

### 8.2 相关 API 清单

| API | 用途 |
|-----|------|
| `GET /employees/selector` | 员工选择列表 |
| `GET /employees/selector/:id` | 单条回显 |
| `POST /employees/selector/batch` | 批量回显 |

### 8.3 组件清单

| 组件 | 路径 |
|------|------|
| `EmployeeSelector` | `components/hse/EmployeeSelector.vue` |

---

**版本**：v1.0
**更新时间**：2026-07-21
**维护人**：HSE 开发团队
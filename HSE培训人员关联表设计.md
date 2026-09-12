# HSE 培训人员关联表设计文档

## 一、设计背景

依据《HSE业务模块人员关联规范.md》，培训管理模块的人员关联必须统一使用 `employee_id` 作为外键，禁止使用姓名/手机号关联。

**改造目标**：
- 培训记录的参训人员统一关联 `employee_id`
- 兼容历史数据（保留原有的 `name`/`dept`/`position`/`id_card` 字段）
- 前端使用 `EmployeeSelector` 组件选择人员

---

## 二、数据库设计

### 2.1 培训记录表结构

**表名**：`training_records`

**新增字段**：

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `employee_id` | BIGINT | NULLABLE | 关联员工主数据（员工档案中心） |
| `trainer_id` | BIGINT | NULLABLE | 培训师（关联员工主数据） |

**现有字段保留（兼容历史数据）**：

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `name` | VARCHAR(64) | 姓名（历史数据，新数据自动填充） |
| `dept` | VARCHAR(128) | 部门（历史数据，新数据自动填充） |
| `position` | VARCHAR(64) | 岗位（历史数据，新数据自动填充） |
| `id_card` | VARCHAR(64) | 身份证号（历史数据） |
| `personnel_id` | BIGINT | 旧系统人员ID（历史数据） |

### 2.2 SQL 迁移脚本

```sql
-- 1. 添加 employee_id 字段（参训人员）
ALTER TABLE IF EXISTS training_records
ADD COLUMN IF NOT EXISTS employee_id BIGINT;

-- 2. 添加 trainer_id 字段（培训师）
ALTER TABLE IF EXISTS training_records
ADD COLUMN IF NOT EXISTS trainer_id BIGINT;

-- 3. 添加外键约束
ALTER TABLE IF EXISTS training_records
ADD CONSTRAINT IF NOT EXISTS fk_training_records_employee
FOREIGN KEY (employee_id) REFERENCES employee(id);

ALTER TABLE IF EXISTS training_records
ADD CONSTRAINT IF NOT EXISTS fk_training_records_trainer
FOREIGN KEY (trainer_id) REFERENCES employee(id);

-- 4. 创建索引
CREATE INDEX IF NOT EXISTS idx_training_records_employee_id
ON training_records(employee_id);

CREATE INDEX IF NOT EXISTS idx_training_records_trainer_id
ON training_records(trainer_id);
```

---

## 三、后端 API 改造

### 3.1 新增字段映射

**创建/更新时的字段映射**：

| 前端字段 | 后端处理 |
|----------|----------|
| `employeeId` | 保存到 `employee_id` |
| `trainerId` | 保存到 `trainer_id` |
| `name` | 自动从 employee 查询填充 |
| `dept` | 自动从 employee_assignment 查询填充 |
| `position` | 自动从 employee_assignment 查询填充 |

### 3.2 查询时的数据增强

查询培训记录时，通过 `employee_id` 关联 `v_employee_current` 视图获取员工信息：

```sql
SELECT 
  tr.*,
  ev.name,
  ev.org_name AS dept,
  ev.position_name AS position,
  ev.employee_code
FROM training_records tr
LEFT JOIN v_employee_current ev ON tr.employee_id = ev.employee_id
WHERE tr.is_deleted = false
```

### 3.3 向后兼容

- 旧数据（无 `employee_id`）仍可正常查询
- 新数据强制使用 `employee_id`
- 姓名/部门/岗位字段自动填充，不再手动输入

---

## 四、前端改造

### 4.1 表单改造

**原表单**：
```vue
<FormItem label="姓名" name="name" required>
  <Input v-model:value="form.name" />
</FormItem>
<FormItem label="部门" name="department" required>
  <Select v-model:value="form.department">...</Select>
</FormItem>
<FormItem label="岗位" name="position">
  <Input v-model:value="form.position" />
</FormItem>
```

**改造后**：
```vue
<FormItem label="参训人员" name="employeeId" required>
  <EmployeeSelector v-model:value="form.employeeId" placeholder="选择员工" />
</FormItem>
<FormItem label="培训师" name="trainerId">
  <EmployeeSelector v-model:value="form.trainerId" placeholder="选择培训师" />
</FormItem>
```

### 4.2 数据回显

编辑时，根据 `employee_id` 自动加载员工信息：

```typescript
function handleEdit(record) {
  form.employeeId = record.employee_id;
  form.trainerId = record.trainer_id;
  // 自动回显员工姓名/部门/岗位
}
```

### 4.3 表格展示

表格列改造为显示员工详情：

```typescript
const columns = [
  { title: '参训人员', key: 'employee', render: (_, record) => 
    `${record.name} (${record.dept} / ${record.position})` 
  },
  { title: '培训师', dataIndex: 'trainer', key: 'trainer' },
  // ... 其他列
];
```

---

## 五、三违管理模块设计

### 5.1 三违记录表结构

**表名**：`hse_violations`

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | BIGSERIAL | PRIMARY KEY | 主键 |
| `employee_id` | BIGINT | NOT NULL | 违章人员（关联 employee） |
| `checker_id` | BIGINT | NULLABLE | 检查人员（关联 employee） |
| `punisher_id` | BIGINT | NULLABLE | 处罚人员（关联 employee） |
| `violation_type` | VARCHAR(32) | NOT NULL | 违章类型（严重违章/一般违章/轻微违章） |
| `violation_level` | VARCHAR(32) | NULLABLE | 违章等级（A/B/C/D） |
| `description` | TEXT | NULLABLE | 违章描述 |
| `location` | VARCHAR(255) | NULLABLE | 违章地点 |
| `occur_date` | DATE | NOT NULL | 发生日期 |
| `punishment` | VARCHAR(255) | NULLABLE | 处罚措施 |
| `amount` | DECIMAL(10,2) | NULLABLE | 罚款金额 |
| `status` | VARCHAR(20) | NOT NULL | 状态（待处理/已处理/已撤销） |
| `remark` | VARCHAR(512) | NULLABLE | 备注 |
| `created_at` | TIMESTAMP | DEFAULT NOW() | 创建时间 |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | 更新时间 |
| `is_deleted` | BOOLEAN | DEFAULT false | 删除标记 |

### 5.2 SQL 创建脚本

```sql
CREATE TABLE IF NOT EXISTS hse_violations (
    id              BIGSERIAL    PRIMARY KEY,
    employee_id     BIGINT       NOT NULL,
    checker_id      BIGINT,
    punisher_id     BIGINT,
    violation_type  VARCHAR(32)  NOT NULL DEFAULT '一般违章',
    violation_level VARCHAR(32),
    description     TEXT,
    location        VARCHAR(255),
    occur_date      DATE         NOT NULL DEFAULT CURRENT_DATE,
    punishment      VARCHAR(255),
    amount          DECIMAL(10,2),
    status          VARCHAR(20)  NOT NULL DEFAULT 'pending',
    remark          VARCHAR(512),
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted      BOOLEAN      NOT NULL DEFAULT false
);

ALTER TABLE hse_violations
ADD CONSTRAINT IF NOT EXISTS fk_violations_employee
FOREIGN KEY (employee_id) REFERENCES employee(id);

ALTER TABLE hse_violations
ADD CONSTRAINT IF NOT EXISTS fk_violations_checker
FOREIGN KEY (checker_id) REFERENCES employee(id);

ALTER TABLE hse_violations
ADD CONSTRAINT IF NOT EXISTS fk_violations_punisher
FOREIGN KEY (punisher_id) REFERENCES employee(id);

CREATE INDEX IF NOT EXISTS idx_violations_employee_id ON hse_violations(employee_id);
CREATE INDEX IF NOT EXISTS idx_violations_checker_id ON hse_violations(checker_id);
CREATE INDEX IF NOT EXISTS idx_violations_status ON hse_violations(status);
```

---

## 六、隐患管理模块改造

### 6.1 隐患表结构

**表名**：`hazards`

**新增字段**：

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `finder_id` | BIGINT | NULLABLE | 发现人（关联 employee） |
| `responsible_id` | BIGINT | NULLABLE | 责任人（关联 employee） |
| `corrector_id` | BIGINT | NULLABLE | 整改人（关联 employee） |

**现有字段保留**：

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `checker` | VARCHAR(64) | 检查人员姓名（历史数据） |
| `fixer` | VARCHAR(64) | 整改人员姓名（历史数据） |

### 6.2 SQL 迁移脚本

```sql
ALTER TABLE IF EXISTS hazards
ADD COLUMN IF NOT EXISTS finder_id BIGINT;

ALTER TABLE IF EXISTS hazards
ADD COLUMN IF NOT EXISTS responsible_id BIGINT;

ALTER TABLE IF EXISTS hazards
ADD COLUMN IF NOT EXISTS corrector_id BIGINT;

ALTER TABLE IF EXISTS hazards
ADD CONSTRAINT IF NOT EXISTS fk_hazards_finder
FOREIGN KEY (finder_id) REFERENCES employee(id);

ALTER TABLE IF EXISTS hazards
ADD CONSTRAINT IF NOT EXISTS fk_hazards_responsible
FOREIGN KEY (responsible_id) REFERENCES employee(id);

ALTER TABLE IF EXISTS hazards
ADD CONSTRAINT IF NOT EXISTS fk_hazards_corrector
FOREIGN KEY (corrector_id) REFERENCES employee(id);

CREATE INDEX IF NOT EXISTS idx_hazards_finder_id ON hazards(finder_id);
CREATE INDEX IF NOT EXISTS idx_hazards_responsible_id ON hazards(responsible_id);
CREATE INDEX IF NOT EXISTS idx_hazards_corrector_id ON hazards(corrector_id);
```

---

## 七、数据迁移策略

### 7.1 培训记录迁移

```sql
UPDATE training_records tr
SET employee_id = e.id
FROM employee e
WHERE tr.employee_id IS NULL
  AND tr.name = e.name
  AND tr.id_card IS NOT NULL
  AND e.id_card_hash = SHA256(tr.id_card);
```

### 7.2 隐患记录迁移

```sql
UPDATE hazards h
SET responsible_id = e.id
FROM employee e
WHERE h.responsible_id IS NULL
  AND h.checker = e.name;
```

---

## 八、约束检查

| 约束 | 实现 | 状态 |
|------|------|------|
| 统一使用 employee_id | 培训/三违/隐患均使用 employee_id 关联 | ✅ |
| 禁止姓名关联 | 新数据不允许手动输入姓名 | ✅ |
| 禁止手机号关联 | 无手机号作为外键的设计 | ✅ |
| 不修改冻结模型 | 使用 ADD COLUMN IF NOT EXISTS | ✅ |
| 使用 EmployeeSelector | 前端统一使用组件选择 | ✅ |

---

**版本**：v1.0
**更新时间**：2026-07-21
**维护人**：HSE 开发团队
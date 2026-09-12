# HSE 人员主数据中心设计文档 v1.2 (FREEZE)

> 版本：v1.2（冻结版）
> 冻结日期：2026-07-19
> 依据：HSE V2.0.1 发布完成
> 范围：Sprint5.1 — 人员主数据基础能力
> 状态：**架构冻结，禁止结构性修改**。后续 Sprint5.2/5.3 仅允许在已冻结结构之上做增量扩展

---

## 一、设计目标

### 1.1 业务目标

建立 HSE 系统的**人员主数据中心**，作为整个 HSE 业务体系的统一人员数据源：

1. **唯一人员主表**：`employee` 作为全系统唯一人员表，禁止新增其他人员表
2. **统一关联键**：所有业务表通过 `employee_id` 关联，杜绝多套人员标识并存
3. **全生命周期管理**：覆盖入职→在职→待岗→复岗→离职/退休/返聘完整生命周期
4. **组织路径快照**：调岗时记录组织路径历史，确保历史可追溯
5. **敏感数据保护**：身份证号、手机号 AES-256-GCM 加密存储

### 1.2 设计原则

| 原则 | 说明 |
|------|------|
| **唯一人员主表** | `employee` 为系统唯一人员表，禁止新增其他人员表 |
| **employee_id 关联** | 所有业务表（培训/保险/证件/检查等）必须通过 `employee_id` 关联 |
| **无 age 字段** | 年龄统一由 `birth_date` 计算（SQL 内联或视图），避免年龄字段需定期更新 |
| **person_type 不含驾驶员** | 四类：生产人员 / 管理人员 / 技术人员 / 辅助人员（驾驶员归入生产人员） |
| **org_path 快照** | 组织路径快照（如 `/集团名/区域名/企业名/项目名/班组名`），历史记录不可变 |
| **is_current 标识** | 调岗时旧记录 `is_current=false` 并设 `end_date`，新记录 `is_current=true` |
| **统一审计字段** | 所有表保留 `created_at` / `updated_at` / `is_deleted` |
| **软删除** | 所有表使用 `is_deleted BOOLEAN DEFAULT FALSE`，物理删除仅在清理脚本中执行 |
| **增量迁移** | 仅 `CREATE TABLE IF NOT EXISTS` + 兼容性 `ALTER`，不删除字段、不修改已有结构 |

### 1.3 约束清单

- ✅ 禁止新增重复人员表
- ✅ 禁止修改 Vben 核心目录（`packages/@core`、`packages/effects`、`packages/themes`）
- ✅ 禁止修改 auth/JWT 登录流程
- ✅ 禁止新增 npm 依赖
- ✅ 所有业务通过 `employee_id` 关联

---

## 二、整体架构

### 2.1 表关系图

```
                         ┌─────────────────┐
                         │   department    │  组织模型（五级树形）
                         │  (五级树形)      │
                         └────────┬────────┘
                                  │ parent_id（自引用）
                                  ▼
                         ┌─────────────────┐
                         │    position     │  岗位模型
                         │   (岗位)         │──┐
                         └─────────────────┘  │ dept_id
                                              │
┌─────────────────┐    employee_id    ┌──────┴──────────┐
│ employee_history│◄──────────────────┤  hse_employee_org │  人员组织关系
│ (人事变动记录)   │                   │  (五级组织引用)    │
└─────────────────┘                   └──────┬──────────┘
        ▲                                    │
        │ employee_id                         │ employee_id
        │                                    ▼
        │                          ┌─────────────────┐
        └──────────────────────────│    employee     │  员工主表（唯一）
                                   │   (加密字段)     │
                                   └─────────────────┘
                                            ▲
                                            │ employee_id
                                            │
                            ┌───────────────┴───────────────┐
                            │                               │
                   Sprint5.2/5.3 业务扩展表          其他业务表
                  （一人一档/证件/培训/保险等）      （检查/隐患/整改等）
```

### 2.2 五级组织树

| 层级 | level | 说明 | 示例 |
|------|-------|------|------|
| 1 | 集团 | 顶级集团 | XX 环卫集团 |
| 2 | 区域公司 | 集团下区域 | 华东区域公司 |
| 3 | 企业 | 法人企业 | XX 环卫有限公司 |
| 4 | 项目 | 项目/分公司 | XX 项目部 |
| 5 | 班组 | 最小作业单元 | 清运一班 |

通过 `parent_id`（自引用）+ `path`（如 `/1/5/12/`）实现层级路径查询。

### 2.3 状态生命周期

```
                  入职
                   │
                   ▼
        ┌────── 在职 ◄────复岗────┐
        │         │               │
        │         │               │
        ▼         ▼               │
      待岗 ──────►                │
        │                         │
        ▼                         │
      离职/退休（终态）            │
        │                         │
        ▼                         │
      返聘 ──────────────────────┘
```

**事件类型映射**：
- `status=待岗` → `event_type=待岗`
- `status=在职` 且 `beforeStatus=待岗` → `event_type=**复岗**`
- `status=离职` → `event_type=离职`
- `status=退休` → `event_type=退休`
- `status=返聘` → `event_type=返聘`

---

## 三、表结构详细设计

### 3.1 department — 组织模型（五级树形）

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | BIGSERIAL | 是 | — | 主键 |
| dept_code | VARCHAR(50) | 是 | — | 部门编码（业务唯一） |
| name | VARCHAR(100) | 是 | — | 部门名称 |
| short_name | VARCHAR(50) | 否 | NULL | 简称 |
| parent_id | BIGINT | 否 | NULL | 父部门 ID（自引用，ON DELETE RESTRICT） |
| level | SMALLINT | 是 | — | 层级 1-5（CHECK 约束） |
| path | VARCHAR(500) | 是 | '/' | 层级路径 `/1/5/12/`，便于祖先/后代查询 |
| township | VARCHAR(100) | 否 | NULL | 所属乡镇（环卫项目特有） |
| manager_id | BIGINT | 否 | NULL | 部门负责人 employee_id |
| safety_manager_id | BIGINT | 否 | NULL | 安全负责人 employee_id |
| headcount | INTEGER | 是 | 0 | 编制人数 |
| sort_order | INTEGER | 是 | 0 | 排序 |
| status | VARCHAR(20) | 是 | 'active' | 状态：active/inactive/merged/dissolved |
| description | TEXT | 否 | NULL | 描述 |
| created_at | TIMESTAMP | 是 | NOW() | 创建时间 |
| updated_at | TIMESTAMP | 是 | NOW() | 更新时间 |
| is_deleted | BOOLEAN | 是 | FALSE | 软删除标识 |

**索引**：
- `idx_department_parent` ON (parent_id) WHERE is_deleted = false
- `idx_department_level` ON (level) WHERE is_deleted = false
- `idx_department_path` ON (path) WHERE is_deleted = false
- `idx_department_township` ON (township) WHERE township IS NOT NULL AND is_deleted = false

### 3.2 position — 岗位模型

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | BIGSERIAL | 是 | — | 主键 |
| position_code | VARCHAR(50) | 是 | — | 岗位编码（唯一） |
| name | VARCHAR(100) | 是 | — | 岗位名称 |
| dept_id | BIGINT | 否 | NULL | 所属部门 ID |
| job_category | VARCHAR(50) | 否 | NULL | 工种分类：管理/技术/生产/辅助/特种 |
| is_special_post | BOOLEAN | 是 | FALSE | 是否特种作业岗位（电工/焊工/叉车等） |
| is_safety_critical | BOOLEAN | 是 | FALSE | 是否安全关键岗位 |
| safety_duties | TEXT | 否 | NULL | 安全职责描述 |
| sort_order | INTEGER | 是 | 0 | 排序 |
| status | VARCHAR(20) | 是 | 'active' | 状态 |
| created_at | TIMESTAMP | 是 | NOW() | 创建时间 |
| updated_at | TIMESTAMP | 是 | NOW() | 更新时间 |
| is_deleted | BOOLEAN | 是 | FALSE | 软删除标识 |

**索引**：
- `idx_position_dept` ON (dept_id) WHERE is_deleted = false

### 3.3 employee — 员工主表（唯一人员表）

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | BIGSERIAL | 是 | — | 主键（即 employee_id） |
| employee_code | VARCHAR(50) | 否 | NULL | 工号（业务唯一，可为空表示外部人员） |
| id_card | VARCHAR(128) | 否 | NULL | 身份证号（AES-256-GCM 加密存储，随机 IV） |
| name | VARCHAR(100) | 是 | — | 姓名 |
| gender | VARCHAR(10) | 否 | NULL | 性别：男/女 |
| birth_date | DATE | 否 | NULL | 出生日期（用于计算年龄） |
| phone | VARCHAR(64) | 否 | NULL | 手机号（AES-256-GCM 加密存储） |
| person_category | VARCHAR(20) | 否 | NULL | 人员分类：适龄人员/超龄人员 |
| person_type | VARCHAR(20) | 否 | NULL | 人员类型：生产人员/管理人员/技术人员/辅助人员 |
| is_public_welfare | BOOLEAN | 是 | FALSE | 是否公益岗 |
| created_at | TIMESTAMP | 是 | NOW() | 创建时间 |
| updated_at | TIMESTAMP | 是 | NOW() | 更新时间 |
| is_deleted | BOOLEAN | 是 | FALSE | 软删除标识 |

**Sprint5.1.1 加固字段**（v60 迁移）：
| 字段 | 类型 | 说明 |
|------|------|------|
| id_card_hash | VARCHAR(64) | 身份证号 HMAC-SHA256 哈希值（确定性，用于唯一性校验） |
| phone_hash | VARCHAR(64) | 手机号 HMAC-SHA256 哈希值（确定性，用于唯一性校验） |

**索引**：
- `uk_employee_code` (UNIQUE) ON (employee_code) WHERE employee_code IS NOT NULL AND is_deleted = false
- `uk_employee_idcard_hash` (UNIQUE) ON (id_card_hash) WHERE id_card_hash IS NOT NULL AND is_deleted = false
- `uk_employee_phone_hash` (UNIQUE) ON (phone_hash) WHERE phone_hash IS NOT NULL AND is_deleted = false
- `idx_employee_name` ON (name) WHERE is_deleted = false
- `idx_employee_type` ON (person_type) WHERE person_type IS NOT NULL AND is_deleted = false
- `idx_employee_category` ON (person_category) WHERE person_category IS NOT NULL AND is_deleted = false

**列宽设计说明**：
- `id_card` VARCHAR(128)：18 位明文 → AES-256-GCM 密文 `ENC:base64(iv(12)+ciphertext+authTag(16))` 约 80 字符，预留余量至 128
- `phone` VARCHAR(64)：11 位明文 → 加密后约 60 字符，预留余量至 64
- `id_card_hash` / `phone_hash` VARCHAR(64)：HMAC-SHA256 输出 32 字节 → 64 字符 hex

### 3.4 hse_employee_org — 人员组织关系

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | BIGSERIAL | 是 | — | 主键 |
| employee_id | BIGINT | 是 | — | 员工 ID（外键 employee.id） |
| group_id | BIGINT | 否 | NULL | 集团 ID（level=1） |
| region_id | BIGINT | 否 | NULL | 区域公司 ID（level=2） |
| enterprise_id | BIGINT | 否 | NULL | 企业 ID（level=3） |
| project_id | BIGINT | 否 | NULL | 项目 ID（level=4） |
| team_id | BIGINT | 否 | NULL | 班组 ID（level=5） |
| org_path | VARCHAR(500) | 否 | NULL | 组织路径快照 `/集团名/区域名/企业名/项目名/班组名` |
| position_id | BIGINT | 否 | NULL | 岗位 ID（外键 position.id） |
| supervisor_id | BIGINT | 否 | NULL | 直接主管 employee_id |
| start_date | DATE | 是 | — | 任职开始日期 |
| end_date | DATE | 否 | NULL | 任职结束日期（当前记录为 NULL） |
| status | VARCHAR(20) | 是 | '在职' | 在职/待岗/离职/退休/返聘 |
| is_current | BOOLEAN | 是 | TRUE | 是否当前记录（一个员工同时只有一条 is_current=true） |
| change_reason | VARCHAR(200) | 否 | NULL | 变动原因 |
| created_at | TIMESTAMP | 是 | NOW() | 创建时间 |
| updated_at | TIMESTAMP | 是 | NOW() | 更新时间 |
| is_deleted | BOOLEAN | 是 | FALSE | 软删除标识 |

**索引**：
- `idx_emp_org_employee` ON (employee_id) WHERE is_deleted = false
- `idx_emp_org_current` ON (employee_id, is_current) WHERE is_current = true AND is_deleted = false
- `idx_emp_org_team` ON (team_id) WHERE team_id IS NOT NULL AND is_deleted = false
- `idx_emp_org_project` ON (project_id) WHERE project_id IS NOT NULL AND is_deleted = false
- `idx_emp_org_enterprise` ON (enterprise_id) WHERE enterprise_id IS NOT NULL AND is_deleted = false
- `idx_emp_org_status` ON (status) WHERE is_deleted = false

**关键设计**：
1. **五级组织引用**：通过 5 个外键（group_id/region_id/enterprise_id/project_id/team_id）显式引用五级组织，便于按层级聚合统计
2. **org_path 快照**：调岗时实时构建路径字符串并写入，**历史记录不可变**，即使后续部门改名也不影响历史
3. **is_current 标识**：一个员工同时只有一条 `is_current=true` 的记录（应用层保证），调岗时旧记录 `is_current=false` 并设 `end_date`

### 3.5 employee_history — 人事变动记录

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | BIGSERIAL | 是 | — | 主键 |
| employee_id | BIGINT | 是 | — | 员工 ID（外键 employee.id） |
| event_type | VARCHAR(20) | 是 | — | 事件类型：入职/调岗/待岗/复岗/离职/退休/返聘/状态变更 |
| event_date | DATE | 是 | — | 事件发生日期 |
| before_dept_id | BIGINT | 否 | NULL | 变动前部门 ID |
| before_position_id | BIGINT | 否 | NULL | 变动前岗位 ID |
| before_status | VARCHAR(20) | 否 | NULL | 变动前状态 |
| after_dept_id | BIGINT | 否 | NULL | 变动后部门 ID |
| after_position_id | BIGINT | 否 | NULL | 变动后岗位 ID |
| after_status | VARCHAR(20) | 否 | NULL | 变动后状态 |
| approver_id | BIGINT | 否 | NULL | 审批人 ID |
| approve_date | DATE | 否 | NULL | 审批日期 |
| approval_no | VARCHAR(100) | 否 | NULL | 审批单号（关联外部审批系统） |
| remark | TEXT | 否 | NULL | 备注 |
| created_at | TIMESTAMP | 是 | NOW() | 创建时间 |
| updated_at | TIMESTAMP | 是 | NOW() | 更新时间 |
| is_deleted | BOOLEAN | 是 | FALSE | 软删除标识 |

**Sprint5.1.1 加固字段**（v60 迁移）：
| 字段 | 类型 | 说明 |
|------|------|------|
| operator_id | BIGINT | 操作人 ID（来自 `req.user.id`，记录谁执行了此次人事变动） |

**索引**：
- `idx_emp_history_employee` ON (employee_id) WHERE is_deleted = false
- `idx_emp_history_date` ON (event_date) WHERE is_deleted = false
- `idx_emp_history_type` ON (event_type) WHERE is_deleted = false
- `idx_emp_history_operator` ON (operator_id) WHERE is_deleted = false

### 3.6 v_employee_with_age — 员工视图（含年龄计算）

```sql
CREATE OR REPLACE VIEW v_employee_with_age AS
SELECT
    id, employee_code, id_card, name, gender, birth_date, phone,
    person_category, person_type, is_public_welfare,
    CASE
        WHEN birth_date IS NOT NULL THEN EXTRACT(YEAR FROM age(birth_date))::INT
        ELSE NULL
    END AS age,
    created_at, updated_at, is_deleted
FROM employee
WHERE is_deleted = false;
```

**设计目的**：
- 避免在 `employee` 表中维护 `age` 字段（需定期更新）
- 通过视图动态计算，始终基于当前日期与 `birth_date`
- 路由层使用 `EXTRACT(YEAR FROM age(birth_date))::INT AS age` 内联计算（避免依赖视图）

---

## 四、核心流程设计

### 4.1 调岗流程（POST /org/assign）

```
1. 验证员工存在
2. 开启事务 (BEGIN)
3. 查询当前组织关系 (is_current=true)
4. 若存在当前关系:
   a. 记录 before_dept_id / before_position_id / before_status
   b. 结束当前关系: is_current=false, end_date=新开始日期-1天
5. 构建 org_path (查询五级部门名拼接)
6. 新增组织关系 (is_current=true, status='在职')
7. 记录 employee_history (event_type: 入职/调岗，含 operator_id)
8. 提交事务 (COMMIT)
9. 失败回滚 (ROLLBACK)
```

**org_path 构建规则**：
- 收集五级部门 ID（group_id/region_id/enterprise_id/project_id/team_id）
- 批量查询部门名称
- 按层级顺序拼接为 `/集团名/区域名/企业名/项目名/班组名`
- 任一层级为空则跳过该层级

### 4.2 状态变更流程（PUT /org/:id/status）

```
1. 验证组织关系存在
2. 查询当前状态 before_status
3. 更新 hse_employee_org.status
4. 记录 employee_history:
   - event_type 根据 status 自动映射（待岗/复岗/离职/退休/返聘）
   - before_status / after_status 记录状态变化
   - operator_id 来自 req.user.id
```

### 4.3 员工软删除流程（DELETE /employees/:id）

```
1. 验证员工存在
2. 软删除 employee: is_deleted=true
3. 结束当前组织关系: is_current=false, end_date=CURRENT_DATE
4. （不删除 employee_history 历史记录，保留追溯）
```

---

## 五、加密策略

### 5.1 双层保护设计

| 层次 | 算法 | 用途 | 列 |
|------|------|------|------|
| 加密层 | AES-256-GCM | 密文存储，随机 IV | id_card / phone |
| 哈希层 | HMAC-SHA256 | 唯一性校验，确定性 | id_card_hash / phone_hash |

### 5.2 AES-256-GCM 加密

**密文格式**：`ENC:base64(iv(12) + ciphertext + authTag(16))`

- **算法**：aes-256-gcm
- **IV 长度**：12 字节（随机生成）
- **Auth Tag 长度**：16 字节
- **密钥来源**：`DATA_ENCRYPTION_KEY` 环境变量
- **密钥派生**：64 字符 hex 直接转 Buffer；其他字符串通过 SHA-256 派生

### 5.3 HMAC-SHA256 哈希

**问题背景**：AES-256-GCM 使用随机 IV，相同明文每次加密产生不同密文，导致 SQL 层 `WHERE id_card = $1` 无法匹配已加密记录，无法做唯一性校验。

**解决方案**：使用 HMAC-SHA256 确定性哈希，相同明文 + 相同密钥产生相同哈希。

```javascript
function hashSensitive(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') return null;
  const key = getEncryptionKey();
  const hmac = crypto.createHmac('sha256', key);
  hmac.update(plaintext);
  return hmac.digest('hex'); // 64 字符 hex
}
```

### 5.4 secureEncode 模式

```javascript
function secureEncode(plaintext) {
  if (!plaintext) return { cipher: null, hash: null };
  return {
    cipher: encrypt(plaintext),       // AES-256-GCM 密文
    hash: hashSensitive(plaintext),   // HMAC-SHA256 哈希
  };
}
```

**使用场景**：
- 新增员工（POST /employees）
- 更新员工（PUT /employees/:id）
- Excel/JSON 导入

**唯一性校验**：
```sql
-- 新增时
SELECT id FROM employee WHERE id_card_hash = $1 AND is_deleted = false;

-- 更新时（排除自身）
SELECT id FROM employee WHERE id_card_hash = $1 AND id != $2 AND is_deleted = false;
```

---

## 六、权限模型

### 6.1 角色权限矩阵

| 操作 | admin | safety_manager | viewer | 未登录 |
|------|-------|----------------|--------|--------|
| 员工 CRUD（读） | ✅ | ✅ | ✅ | ❌ 401 |
| 员工 CRUD（写） | ✅ | ✅ | ❌ 403 | ❌ 401 |
| 组织树查询 | ✅ | ✅ | ✅ | ❌ 401 |
| 组织树管理（写） | ✅ | ✅ | ❌ 403 | ❌ 401 |
| 岗位查询 | ✅ | ✅ | ✅ | ❌ 401 |
| 岗位管理（写） | ✅ | ✅ | ❌ 403 | ❌ 401 |
| 调岗 / 状态变更 | ✅ | ✅ | ❌ 403 | ❌ 401 |
| 员工导入（JSON/Excel） | ✅ | ✅ | ❌ 403 | ❌ 401 |
| 历史查询 | ✅ | ✅ | ✅ | ❌ 401 |

### 6.2 实现方式

```javascript
const { requireRole } = require('../middleware/auth');

// 写操作路由使用 requireRole 中间件
router.post('/employees', requireRole('admin', 'safety_manager'), handler);
router.put('/employees/:id', requireRole('admin', 'safety_manager'), handler);
router.delete('/employees/:id', requireRole('admin', 'safety_manager'), handler);

// 读操作仅需认证（authMiddleware 全局生效）
router.get('/employees', handler);
router.get('/employees/:id', handler);
```

### 6.3 operator_id 记录

所有 `employee_history` INSERT 必须传入 `operator_id`，值来自 `req.user.id`：

```sql
INSERT INTO employee_history (
  employee_id, event_type, event_date,
  before_dept_id, after_dept_id, before_position_id, after_position_id,
  before_status, after_status, remark,
  operator_id  -- 来自 req.user.id
) VALUES (...)
```

查询历史时 LEFT JOIN users 表返回操作人姓名：

```sql
SELECT eh.*,
       u.username  AS operator_name,
       u.real_name AS operator_real_name
FROM employee_history eh
LEFT JOIN users u ON eh.operator_id = u.id
WHERE eh.employee_id = $1 ...
```

---

## 七、API 端点设计

### 7.1 端点清单（共 22 个）

| 模块 | 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|------|
| **员工管理** | GET | `/employees` | 认证 | 分页查询（含年龄计算、状态/类型/分类过滤） |
| | GET | `/employees/stats` | 认证 | 统计（按类型/分类/状态） |
| | GET | `/employees/:id` | 认证 | 详情（含组织关系） |
| | POST | `/employees` | admin/safety_manager | 新增（哈希唯一性校验） |
| | PUT | `/employees/:id` | admin/safety_manager | 更新（哈希唯一性校验，排除自身） |
| | DELETE | `/employees/:id` | admin/safety_manager | 软删除（同时结束当前组织关系） |
| | POST | `/employees/import` | admin/safety_manager | 批量导入（JSON 数组） |
| | GET | `/employees/import/template` | admin/safety_manager | Excel 模板下载 |
| | POST | `/employees/import/excel/preview` | admin/safety_manager | Excel 预览（不写库） |
| | POST | `/employees/import/excel` | admin/safety_manager | Excel 直接导入 |
| **组织管理** | GET | `/departments/tree` | 认证 | 部门树（递归构建） |
| | GET | `/departments` | 认证 | 扁平列表 |
| | POST | `/departments` | admin/safety_manager | 新增（含 path 构建、事务） |
| | PUT | `/departments/:id` | admin/safety_manager | 更新 |
| | DELETE | `/departments/:id` | admin/safety_manager | 软删除（校验子部门） |
| **岗位管理** | GET | `/positions` | 认证 | 列表（按部门/关键字过滤） |
| | POST | `/positions` | admin/safety_manager | 新增 |
| | PUT | `/positions/:id` | admin/safety_manager | 更新 |
| | DELETE | `/positions/:id` | admin/safety_manager | 软删除 |
| **组织关系** | GET | `/org/employee/:employeeId` | 认证 | 当前组织关系 |
| | GET | `/org/employee/:employeeId/history` | 认证 | 组织关系历史 |
| | POST | `/org/assign` | admin/safety_manager | 调岗核心接口（事务） |
| | PUT | `/org/:id/status` | admin/safety_manager | 状态变更 |
| **历史记录** | GET | `/history/employee/:employeeId` | 认证 | 人事变动历史（含 operator_name） |

### 7.2 典型调岗流程

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

---

## 八、Excel 导入设计

### 8.1 字段映射

| 中文表头 | 数据库字段 | 必填 | 校验规则 |
|---------|-----------|------|---------|
| 工号 | employee_code | 否 | — |
| 姓名 | name | 是 | 非空 |
| 性别 | gender | 否 | 男/女 |
| 出生日期 | birth_date | 否 | YYYY-MM-DD 或 Excel 序列号 |
| 身份证号 | id_card | 否 | 18 位（首位非 X，末位 0-9 或 X） |
| 手机号 | phone | 否 | 11 位数字，首位为 1 |
| 人员分类 | person_category | 否 | 适龄人员/超龄人员 |
| 人员类型 | person_type | 否 | 管理人员/技术人员/生产人员/辅助人员 |
| 入职日期 | hire_date | 否 | 日期格式 |

### 8.2 双模式导入

- **Excel 模式（推荐）**：后端 `xlsx@0.18.5` 解析，前端仅上传文件
- **JSON 模式（兼容）**：前端 FileReader 解析 JSON 数组，调用 `/employees/import`

### 8.3 上传安全

- `multer` 中间件处理文件上传
- `validateUploadedFile(req.file, 'excel')` 魔术字节校验防伪造
- 上传后临时文件由 `deleteFile()` 清理

---

## 九、Sprint 范围边界

### 9.1 Sprint5.1 已实现（本文档范围）

- ✅ 5 张表 + 1 视图 DDL
- ✅ 22 个 API 端点
- ✅ 调岗 / 状态变更 / 软删除核心流程
- ✅ AES-256-GCM 加密 + HMAC-SHA256 哈希
- ✅ Excel + JSON 双模式导入
- ✅ operator_id 操作人记录
- ✅ 哈希唯一性校验

### 9.2 Sprint5.2 范围（不在本文档）

- ❌ `employee_safety_profile`（一人一档风险画像）
- ❌ `employee_certificate`（证件统一管理）
- ❌ `position_safety_profile`（岗位安全画像）

### 9.3 Sprint5.3 范围（不在本文档）

- ❌ 业务关联表迁移（training/insurance/driver 等关联到 employee_id）
- ❌ 旧 `personnel` 表数据迁移至 `employee`

---

## 十、迁移脚本

### 10.1 v59 主迁移

- **文件**：`server/sql/hse_employee_master_v59_migration.sql`
- **内容**：5 张表 + 1 视图完整 DDL
- **方式**：`CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`
- **约束**：不修改已有表结构

### 10.2 v60 加固迁移（Sprint5.1.1）

- **文件**：`server/sql/hse_employee_master_v60_hardening.sql`
- **内容**：
  - `employee_history.operator_id` + 索引
  - `employee.id_card_hash` / `phone_hash` + 部分唯一索引
- **方式**：`ALTER TABLE ADD COLUMN IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`
- **约束**：增量迁移，不删除字段，不修改已有数据结构

### 10.3 历史数据兼容

- 历史 `employee_history.operator_id` 为 NULL，表示历史变动记录无操作人信息
- 历史 `employee.id_card_hash` / `phone_hash` 为 NULL，部分唯一索引仅对非 NULL 值生效
- 新增/更新员工时由应用层计算并写入哈希值
- 如需补齐历史数据，可由应用层批量解密+哈希回填（不在迁移脚本范围）

---

## 十一、设计冻结声明

本设计文档为 v1.2 **冻结版**，自 2026-07-19 起生效：

1. **表结构冻结**：5 张表的字段定义、类型、约束、索引禁止修改
2. **API 契约冻结**：22 个端点的路径、方法、参数、返回结构禁止破坏性变更
3. **加密策略冻结**：AES-256-GCM + HMAC-SHA256 双层保护方案禁止变更
4. **权限模型冻结**：admin/safety_manager 可写、其他只读的权限矩阵禁止变更
5. **关联方式冻结**：所有业务表必须通过 `employee_id` 关联，禁止引入其他人员标识

后续 Sprint5.2/5.3 仅允许：
- 在已冻结表之上**新增**扩展表（如 `employee_safety_profile`）
- 在已冻结 API 之上**新增**端点
- 不允许修改已冻结的表结构和 API 契约

---

**文档结束**

# Sprint9.5 数据库初始化报告

> 文档版本：v1.0
> 生成日期：2026 年 7 月
> 所属阶段：HSE Dashboard Sprint9.5
> 关联文档：
> - 《Sprint9.5 PC端系统架构设计报告》
> - 《Sprint9.5 前后端接口联调报告》

---

## 一、概述

### 1.1 数据库选型

| 技术 | 版本 | 说明 |
|------|------|------|
| MySQL | 8.0.x | 主数据库，事务处理、数据一致性 |
| Redis | 7.x | 缓存、会话、限流 |

### 1.2 设计原则

| 原则 | 说明 |
|------|------|
| 业务冻结 | 禁止修改已冻结的业务模型 |
| 规范命名 | 表名、字段名符合命名规范 |
| 合理索引 | 根据查询场景建立索引 |
| 关联清晰 | 外键关联关系明确 |
| 可扩展 | 预留字段，便于后续扩展 |

### 1.3 命名规范

| 对象 | 前缀 | 示例 |
|------|------|------|
| 系统表 | sys_ | sys_user |
| 业务表 | hse_ | hse_employee |
| 主键 | id | id |
| 外键 | _id | employee_id |
| 时间字段 | _at | created_at |
| 状态字段 | status | status |
| 逻辑删除 | is_deleted | is_deleted |

---

## 二、ER 关系图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           系统表                                        │
│                                                                         │
│  ┌─────────────────────────────┐                                        │
│  │  sys_user                   │                                        │
│  │  ─────────────────────────  │                                        │
│  │  id (PK)                    │                                        │
│  │  username                   │                                        │
│  │  password                   │                                        │
│  │  └───────────┬─────────────┘                                        │
│                  │ M:N                                                   │
│  ┌──────────────┴─────────────┐                                        │
│  │                             │                                        │
│  ▼                             ▼                                        │
│  ┌─────────────────────────────┐    ┌─────────────────────────────┐    │
│  │  sys_user_role              │    │  sys_role_permission       │    │
│  │  ─────────────────────────  │    │  ─────────────────────────  │    │
│  │  user_id (FK)               │    │  role_id (FK)               │    │
│  │  role_id (FK)               │    │  permission_id (FK)         │    │
│  └───────────┬─────────────────┘    └───────────┬─────────────────┘    │
│              │                                   │                       │
│              ▼                                   ▼                       │
│  ┌─────────────────────────────┐    ┌─────────────────────────────┐    │
│  │  sys_role                   │    │  sys_permission             │    │
│  │  ─────────────────────────  │    │  ─────────────────────────  │    │
│  │  id (PK)                    │    │  id (PK)                    │    │
│  │  code                       │    │  code                       │    │
│  │  name                       │    │  name                       │    │
│  └─────────────────────────────┘    └─────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                           业务表                                        │
│                                                                         │
│  ┌─────────────────────────────┐                                        │
│  │  hse_employee               │                                        │
│  │  ─────────────────────────  │                                        │
│  │  id (PK)                    │                                        │
│  │  employee_code              │                                        │
│  │  name                       │                                        │
│  │  risk_score                 │                                        │
│  │  risk_level                 │                                        │
│  └───────────┬─────────────────┘                                        │
│              │ 1:N                                                      │
│              ▼                                                          │
│  ┌─────────────────────────────┐                                        │
│  │  hse_warning                │                                        │
│  │  ─────────────────────────  │                                        │
│  │  id (PK)                    │                                        │
│  │  warning_code               │                                        │
│  │  employee_id (FK)           │                                        │
│  │  warning_level              │                                        │
│  │  status                     │                                        │
│  └───────────┬─────────────────┘                                        │
│              │ 1:1                                                      │
│              ▼                                                          │
│  ┌─────────────────────────────┐                                        │
│  │  hse_rectify                │                                        │
│  │  ─────────────────────────  │                                        │
│  │  id (PK)                    │                                        │
│  │  rectify_code               │                                        │
│  │  warning_id (FK)            │                                        │
│  │  employee_id (FK)           │                                        │
│  │  status                     │                                        │
│  └─────────────────────────────┘                                        │
│                                                                         │
│  ┌─────────────────────────────┐                                        │
│  │  hse_assessment             │                                        │
│  │  ─────────────────────────  │                                        │
│  │  id (PK)                    │                                        │
│  │  employee_id (FK)           │                                        │
│  │  period                     │                                        │
│  │  score                      │                                        │
│  │  rank                       │                                        │
│  └─────────────────────────────┘                                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 三、数据库表结构

### 3.1 系统表

#### 3.1.1 sys_user（用户表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | BIGINT | PK, AUTO_INCREMENT | 主键 |
| username | VARCHAR(50) | NOT NULL, UNIQUE | 用户名 |
| password | VARCHAR(100) | NOT NULL | 密码（BCrypt 加密） |
| real_name | VARCHAR(50) | | 真实姓名 |
| phone | VARCHAR(20) | | 手机号 |
| email | VARCHAR(100) | | 邮箱 |
| avatar | VARCHAR(500) | | 头像 URL |
| org_id | BIGINT | | 组织ID |
| org_name | VARCHAR(100) | | 组织名称 |
| status | TINYINT | NOT NULL, DEFAULT 1 | 状态（0-禁用/1-启用） |
| last_login_at | DATETIME | | 最后登录时间 |
| created_at | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DATETIME | NOT NULL, ON UPDATE CURRENT_TIMESTAMP | 更新时间 |
| is_deleted | TINYINT | NOT NULL, DEFAULT 0 | 软删除（0-正常/1-删除） |

**索引**：
```sql
CREATE INDEX idx_user_username ON sys_user(username);
CREATE INDEX idx_user_org_id ON sys_user(org_id);
CREATE INDEX idx_user_status ON sys_user(status);
```

#### 3.1.2 sys_role（角色表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | BIGINT | PK, AUTO_INCREMENT | 主键 |
| code | VARCHAR(50) | NOT NULL, UNIQUE | 角色编码 |
| name | VARCHAR(50) | NOT NULL | 角色名称 |
| description | VARCHAR(200) | | 角色描述 |
| status | TINYINT | NOT NULL, DEFAULT 1 | 状态 |
| created_at | DATETIME | NOT NULL | 创建时间 |
| updated_at | DATETIME | NOT NULL | 更新时间 |
| is_deleted | TINYINT | NOT NULL, DEFAULT 0 | 软删除 |

**初始化数据**：
```sql
INSERT INTO sys_role (code, name, description) VALUES
('admin', '系统管理员', '系统超级管理员'),
('safety_manager', '安全管理员', '安全管理负责人'),
('department_manager', '部门经理', '部门负责人'),
('grid_leader', '网格长', '网格负责人'),
('user', '普通用户', '普通用户');
```

#### 3.1.3 sys_permission（权限表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | BIGINT | PK, AUTO_INCREMENT | 主键 |
| code | VARCHAR(100) | NOT NULL, UNIQUE | 权限编码 |
| name | VARCHAR(100) | NOT NULL | 权限名称 |
| type | VARCHAR(20) | NOT NULL | 类型（menu/button/api） |
| parent_id | BIGINT | | 父权限ID |
| path | VARCHAR(200) | | 路由路径 |
| icon | VARCHAR(50) | | 图标 |
| sort | INT | NOT NULL, DEFAULT 0 | 排序 |
| status | TINYINT | NOT NULL, DEFAULT 1 | 状态 |
| created_at | DATETIME | NOT NULL | 创建时间 |
| updated_at | DATETIME | NOT NULL | 更新时间 |
| is_deleted | TINYINT | NOT NULL, DEFAULT 0 | 软删除 |

**初始化数据**：
```sql
INSERT INTO sys_permission (code, name, type, path, icon) VALUES
('dashboard', '工作台', 'menu', '/dashboard', 'home'),
('employee', '员工风险', 'menu', '/risk', 'user'),
('employee:view', '查看员工', 'button', NULL, NULL),
('employee:create', '创建员工', 'button', NULL, NULL),
('risk:calculate', '风险计算', 'button', NULL, 'calculator'),
('warning', '预警管理', 'menu', '/warning', 'alert'),
('warning:view', '查看预警', 'button', NULL, NULL),
('warning:handle', '处理预警', 'button', NULL, NULL),
('rectify', '整改管理', 'menu', '/rectify', 'repair'),
('rectify:create', '创建整改', 'button', NULL, NULL),
('rectify:handle', '处理整改', 'button', NULL, NULL),
('assessment', '考核驾驶舱', 'menu', '/assessment', 'dashboard'),
('assessment:view', '查看考核', 'button', NULL, NULL),
('cockpit:view', '查看驾驶舱', 'button', NULL, NULL);
```

#### 3.1.4 sys_user_role（用户角色关联表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| user_id | BIGINT | PK, FK → sys_user.id | 用户ID |
| role_id | BIGINT | PK, FK → sys_role.id | 角色ID |

#### 3.1.5 sys_role_permission（角色权限关联表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| role_id | BIGINT | PK, FK → sys_role.id | 角色ID |
| permission_id | BIGINT | PK, FK → sys_permission.id | 权限ID |

**初始化数据**：
```sql
-- admin 拥有所有权限
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p WHERE r.code = 'admin';

-- safety_manager 权限
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'safety_manager' AND p.code IN (
    'dashboard', 'employee', 'employee:view', 'employee:create',
    'risk:calculate', 'warning', 'warning:view', 'warning:handle',
    'rectify', 'rectify:create', 'rectify:handle',
    'assessment', 'assessment:view', 'cockpit:view'
);

-- department_manager 权限
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'department_manager' AND p.code IN (
    'dashboard', 'employee', 'employee:view',
    'warning', 'warning:view',
    'rectify', 'rectify:create', 'rectify:handle',
    'assessment', 'assessment:view'
);

-- grid_leader 权限
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'grid_leader' AND p.code IN (
    'dashboard', 'employee', 'employee:view',
    'warning', 'warning:view',
    'rectify', 'rectify:handle'
);

-- user 权限
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT r.id, p.id FROM sys_role r, sys_permission p
WHERE r.code = 'user' AND p.code IN (
    'dashboard', 'employee', 'employee:view',
    'warning', 'warning:view',
    'rectify'
);
```

### 3.2 业务表

#### 3.2.1 hse_employee（员工档案表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | BIGINT | PK, AUTO_INCREMENT | 主键 |
| employee_code | VARCHAR(50) | NOT NULL, UNIQUE | 员工工号 |
| name | VARCHAR(50) | NOT NULL | 姓名 |
| id_card | VARCHAR(20) | | 身份证号 |
| phone | VARCHAR(20) | | 手机号 |
| org_id | BIGINT | NOT NULL | 组织ID |
| org_name | VARCHAR(100) | NOT NULL | 组织名称 |
| position_id | BIGINT | | 岗位ID |
| position_name | VARCHAR(50) | | 岗位名称 |
| risk_score | DECIMAL(5,2) | | 风险评分（0-100） |
| risk_level | VARCHAR(20) | | 风险等级（LOW/MEDIUM/HIGH/CRITICAL） |
| last_risk_calc_at | DATETIME | | 最后风险计算时间 |
| status | TINYINT | NOT NULL, DEFAULT 1 | 状态（0-离职/1-在职） |
| created_at | DATETIME | NOT NULL | 创建时间 |
| updated_at | DATETIME | NOT NULL | 更新时间 |
| is_deleted | TINYINT | NOT NULL, DEFAULT 0 | 软删除 |

**索引**：
```sql
CREATE INDEX idx_employee_org_id ON hse_employee(org_id);
CREATE INDEX idx_employee_position_id ON hse_employee(position_id);
CREATE INDEX idx_employee_risk_level ON hse_employee(risk_level);
CREATE INDEX idx_employee_status ON hse_employee(status);
CREATE INDEX idx_employee_name ON hse_employee(name);
```

#### 3.2.2 hse_risk_record（风险记录表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | BIGINT | PK, AUTO_INCREMENT | 主键 |
| employee_id | BIGINT | NOT NULL, FK → hse_employee.id | 员工ID |
| calculate_date | DATE | NOT NULL | 计算日期 |
| risk_score | DECIMAL(5,2) | NOT NULL | 风险评分 |
| risk_level | VARCHAR(20) | NOT NULL | 风险等级 |
| attendance_score | DECIMAL(5,2) | | 考勤评分 |
| violation_score | DECIMAL(5,2) | | 违章评分 |
| training_score | DECIMAL(5,2) | | 培训评分 |
| performance_score | DECIMAL(5,2) | | 绩效评分 |
| other_score | DECIMAL(5,2) | | 其他评分 |
| created_at | DATETIME | NOT NULL | 创建时间 |

**索引**：
```sql
CREATE INDEX idx_risk_record_employee_id ON hse_risk_record(employee_id);
CREATE INDEX idx_risk_record_date ON hse_risk_record(calculate_date);
CREATE INDEX idx_risk_record_level ON hse_risk_record(risk_level);
CREATE UNIQUE INDEX uk_risk_record_emp_date ON hse_risk_record(employee_id, calculate_date);
```

#### 3.2.3 hse_warning（预警表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | BIGINT | PK, AUTO_INCREMENT | 主键 |
| warning_code | VARCHAR(50) | NOT NULL, UNIQUE | 预警编码 |
| warning_type | VARCHAR(50) | NOT NULL | 预警类型（RISK_SCORE/VIOLATION/ABSENCE） |
| warning_level | VARCHAR(20) | NOT NULL | 预警等级（LOW/MEDIUM/HIGH/CRITICAL） |
| title | VARCHAR(200) | NOT NULL | 预警标题 |
| description | VARCHAR(1000) | | 预警描述 |
| source_id | BIGINT | | 来源ID（员工ID等） |
| source_type | VARCHAR(20) | | 来源类型 |
| employee_id | BIGINT | FK → hse_employee.id | 关联员工ID |
| employee_name | VARCHAR(50) | | 员工姓名（冗余） |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'PENDING' | 状态（PENDING/PROCESSING/RESOLVED/ESCALATED/IGNORED） |
| handler_id | BIGINT | FK → sys_user.id | 处理人ID |
| handler_name | VARCHAR(50) | | 处理人姓名（冗余） |
| deadline | DATETIME | | 处理截止时间 |
| resolved_at | DATETIME | | 解决时间 |
| created_at | DATETIME | NOT NULL | 创建时间 |
| updated_at | DATETIME | NOT NULL | 更新时间 |
| is_deleted | TINYINT | NOT NULL, DEFAULT 0 | 软删除 |

**索引**：
```sql
CREATE INDEX idx_warning_employee_id ON hse_warning(employee_id);
CREATE INDEX idx_warning_level ON hse_warning(warning_level);
CREATE INDEX idx_warning_status ON hse_warning(status);
CREATE INDEX idx_warning_handler_id ON hse_warning(handler_id);
CREATE INDEX idx_warning_created_at ON hse_warning(created_at);
CREATE INDEX idx_warning_deadline ON hse_warning(deadline);
```

#### 3.2.4 hse_warning_history（预警状态历史表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | BIGINT | PK, AUTO_INCREMENT | 主键 |
| warning_id | BIGINT | NOT NULL, FK → hse_warning.id | 预警ID |
| status | VARCHAR(20) | NOT NULL | 变更后状态 |
| action | VARCHAR(50) | NOT NULL | 操作类型（CREATE/ACCEPT/IGNORE/ESCALATE/RESOLVE） |
| remark | VARCHAR(500) | | 操作备注 |
| operator_id | BIGINT | FK → sys_user.id | 操作人ID |
| operator_name | VARCHAR(50) | | 操作人姓名（冗余） |
| created_at | DATETIME | NOT NULL | 操作时间 |

**索引**：
```sql
CREATE INDEX idx_warning_history_warning_id ON hse_warning_history(warning_id);
```

#### 3.2.5 hse_rectify（整改任务表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | BIGINT | PK, AUTO_INCREMENT | 主键 |
| rectify_code | VARCHAR(50) | NOT NULL, UNIQUE | 整改编码 |
| warning_id | BIGINT | FK → hse_warning.id | 关联预警ID |
| warning_code | VARCHAR(50) | | 预警编码（冗余） |
| employee_id | BIGINT | FK → hse_employee.id | 关联员工ID |
| employee_name | VARCHAR(50) | | 员工姓名（冗余） |
| requirement | VARCHAR(500) | NOT NULL | 整改要求 |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'PENDING' | 状态（PENDING/PROCESSING/COMPLETED/CLOSED/REJECTED） |
| handler_id | BIGINT | FK → sys_user.id | 处理人ID |
| handler_name | VARCHAR(50) | | 处理人姓名（冗余） |
| deadline | DATETIME | | 整改截止时间 |
| completed_at | DATETIME | | 完成时间 |
| effect_score | DECIMAL(5,2) | | 效果评分 |
| created_at | DATETIME | NOT NULL | 创建时间 |
| updated_at | DATETIME | NOT NULL | 更新时间 |
| is_deleted | TINYINT | NOT NULL, DEFAULT 0 | 软删除 |

**索引**：
```sql
CREATE INDEX idx_rectify_warning_id ON hse_rectify(warning_id);
CREATE INDEX idx_rectify_employee_id ON hse_rectify(employee_id);
CREATE INDEX idx_rectify_handler_id ON hse_rectify(handler_id);
CREATE INDEX idx_rectify_status ON hse_rectify(status);
CREATE INDEX idx_rectify_deadline ON hse_rectify(deadline);
```

#### 3.2.6 hse_assessment（考核表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | BIGINT | PK, AUTO_INCREMENT | 主键 |
| employee_id | BIGINT | FK → hse_employee.id | 员工ID |
| org_id | BIGINT | | 组织ID |
| period | VARCHAR(20) | NOT NULL | 周期（2026-07） |
| total_score | DECIMAL(5,2) | NOT NULL | 总评分 |
| employee_risk_score | DECIMAL(5,2) | | 员工风险评分（权重30%） |
| warning_response_score | DECIMAL(5,2) | | 预警响应评分（权重25%） |
| rectify_score | DECIMAL(5,2) | | 整改完成评分（权重25%） |
| training_score | DECIMAL(5,2) | | 安全培训评分（权重20%） |
| rank | INT | | 排名 |
| level | VARCHAR(20) | | 等级（EXCELLENT/GOOD/PASS/FAIL） |
| calculated_at | DATETIME | NOT NULL | 计算时间 |
| created_at | DATETIME | NOT NULL | 创建时间 |

**索引**：
```sql
CREATE INDEX idx_assessment_employee_id ON hse_assessment(employee_id);
CREATE INDEX idx_assessment_org_id ON hse_assessment(org_id);
CREATE INDEX idx_assessment_period ON hse_assessment(period);
CREATE UNIQUE INDEX uk_assessment_emp_period ON hse_assessment(employee_id, period);
```

#### 3.2.7 hse_dashboard_snapshot（驾驶舱快照表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | BIGINT | PK, AUTO_INCREMENT | 主键 |
| snapshot_date | DATE | NOT NULL | 快照日期 |
| org_id | BIGINT | NOT NULL | 组织ID |
| total_employees | INT | | 员工总数 |
| high_risk_count | INT | | 高风险人数 |
| high_risk_rate | DECIMAL(5,2) | | 高风险率 |
| pending_warning_count | INT | | 待处理预警数 |
| processing_warning_count | INT | | 处理中预警数 |
| resolved_warning_count | INT | | 已解决预警数 |
| pending_rectify_count | INT | | 待处理整改数 |
| processing_rectify_count | INT | | 处理中整改数 |
| completed_rectify_count | INT | | 已完成整改数 |
| rectify_completion_rate | DECIMAL(5,2) | | 整改完成率 |
| assessment_total_score | DECIMAL(5,2) | | 考核总评分 |
| assessment_rank | INT | | 考核排名 |
| data_json | JSON | | 完整快照数据 |
| created_at | DATETIME | NOT NULL | 创建时间 |

**索引**：
```sql
CREATE INDEX idx_snapshot_date ON hse_dashboard_snapshot(snapshot_date);
CREATE INDEX idx_snapshot_org_id ON hse_dashboard_snapshot(org_id);
CREATE UNIQUE INDEX uk_snapshot_date_org ON hse_dashboard_snapshot(snapshot_date, org_id);
```

---

## 四、建表脚本

### 4.1 初始化脚本

```sql
-- hse_dashboard_init.sql

-- 创建数据库
CREATE DATABASE IF NOT EXISTS hse_dashboard
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE hse_dashboard;

-- =============================================
-- 系统表
-- =============================================

CREATE TABLE IF NOT EXISTS sys_user (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL,
  password VARCHAR(100) NOT NULL,
  real_name VARCHAR(50),
  phone VARCHAR(20),
  email VARCHAR(100),
  avatar VARCHAR(500),
  org_id BIGINT,
  org_name VARCHAR(100),
  status TINYINT NOT NULL DEFAULT 1,
  last_login_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_deleted TINYINT NOT NULL DEFAULT 0,
  UNIQUE KEY uk_user_username (username),
  INDEX idx_user_org_id (org_id),
  INDEX idx_user_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sys_role (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(50) NOT NULL,
  description VARCHAR(200),
  status TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_deleted TINYINT NOT NULL DEFAULT 0,
  UNIQUE KEY uk_role_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sys_permission (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(100) NOT NULL,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL,
  parent_id BIGINT,
  path VARCHAR(200),
  icon VARCHAR(50),
  sort INT NOT NULL DEFAULT 0,
  status TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_deleted TINYINT NOT NULL DEFAULT 0,
  UNIQUE KEY uk_permission_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sys_user_role (
  user_id BIGINT NOT NULL,
  role_id BIGINT NOT NULL,
  PRIMARY KEY (user_id, role_id),
  INDEX idx_user_role_role_id (role_id),
  CONSTRAINT fk_user_role_user FOREIGN KEY (user_id) REFERENCES sys_user(id),
  CONSTRAINT fk_user_role_role FOREIGN KEY (role_id) REFERENCES sys_role(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sys_role_permission (
  role_id BIGINT NOT NULL,
  permission_id BIGINT NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  INDEX idx_role_permission_permission_id (permission_id),
  CONSTRAINT fk_role_permission_role FOREIGN KEY (role_id) REFERENCES sys_role(id),
  CONSTRAINT fk_role_permission_permission FOREIGN KEY (permission_id) REFERENCES sys_permission(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- 业务表
-- =============================================

CREATE TABLE IF NOT EXISTS hse_employee (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  employee_code VARCHAR(50) NOT NULL,
  name VARCHAR(50) NOT NULL,
  id_card VARCHAR(20),
  phone VARCHAR(20),
  org_id BIGINT NOT NULL,
  org_name VARCHAR(100) NOT NULL,
  position_id BIGINT,
  position_name VARCHAR(50),
  risk_score DECIMAL(5,2),
  risk_level VARCHAR(20),
  last_risk_calc_at DATETIME,
  status TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_deleted TINYINT NOT NULL DEFAULT 0,
  UNIQUE KEY uk_employee_code (employee_code),
  INDEX idx_employee_org_id (org_id),
  INDEX idx_employee_position_id (position_id),
  INDEX idx_employee_risk_level (risk_level),
  INDEX idx_employee_status (status),
  INDEX idx_employee_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hse_risk_record (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  employee_id BIGINT NOT NULL,
  calculate_date DATE NOT NULL,
  risk_score DECIMAL(5,2) NOT NULL,
  risk_level VARCHAR(20) NOT NULL,
  attendance_score DECIMAL(5,2),
  violation_score DECIMAL(5,2),
  training_score DECIMAL(5,2),
  performance_score DECIMAL(5,2),
  other_score DECIMAL(5,2),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_risk_record_employee_id (employee_id),
  INDEX idx_risk_record_date (calculate_date),
  INDEX idx_risk_record_level (risk_level),
  UNIQUE KEY uk_risk_record_emp_date (employee_id, calculate_date),
  CONSTRAINT fk_risk_record_employee FOREIGN KEY (employee_id) REFERENCES hse_employee(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hse_warning (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  warning_code VARCHAR(50) NOT NULL,
  warning_type VARCHAR(50) NOT NULL,
  warning_level VARCHAR(20) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description VARCHAR(1000),
  source_id BIGINT,
  source_type VARCHAR(20),
  employee_id BIGINT,
  employee_name VARCHAR(50),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  handler_id BIGINT,
  handler_name VARCHAR(50),
  deadline DATETIME,
  resolved_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_deleted TINYINT NOT NULL DEFAULT 0,
  UNIQUE KEY uk_warning_code (warning_code),
  INDEX idx_warning_employee_id (employee_id),
  INDEX idx_warning_level (warning_level),
  INDEX idx_warning_status (status),
  INDEX idx_warning_handler_id (handler_id),
  INDEX idx_warning_created_at (created_at),
  INDEX idx_warning_deadline (deadline),
  CONSTRAINT fk_warning_employee FOREIGN KEY (employee_id) REFERENCES hse_employee(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hse_warning_history (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  warning_id BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL,
  action VARCHAR(50) NOT NULL,
  remark VARCHAR(500),
  operator_id BIGINT,
  operator_name VARCHAR(50),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_warning_history_warning_id (warning_id),
  CONSTRAINT fk_warning_history_warning FOREIGN KEY (warning_id) REFERENCES hse_warning(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hse_rectify (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  rectify_code VARCHAR(50) NOT NULL,
  warning_id BIGINT,
  warning_code VARCHAR(50),
  employee_id BIGINT,
  employee_name VARCHAR(50),
  requirement VARCHAR(500) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  handler_id BIGINT,
  handler_name VARCHAR(50),
  deadline DATETIME,
  completed_at DATETIME,
  effect_score DECIMAL(5,2),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_deleted TINYINT NOT NULL DEFAULT 0,
  UNIQUE KEY uk_rectify_code (rectify_code),
  INDEX idx_rectify_warning_id (warning_id),
  INDEX idx_rectify_employee_id (employee_id),
  INDEX idx_rectify_handler_id (handler_id),
  INDEX idx_rectify_status (status),
  INDEX idx_rectify_deadline (deadline),
  CONSTRAINT fk_rectify_warning FOREIGN KEY (warning_id) REFERENCES hse_warning(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hse_assessment (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  employee_id BIGINT,
  org_id BIGINT,
  period VARCHAR(20) NOT NULL,
  total_score DECIMAL(5,2) NOT NULL,
  employee_risk_score DECIMAL(5,2),
  warning_response_score DECIMAL(5,2),
  rectify_score DECIMAL(5,2),
  training_score DECIMAL(5,2),
  rank INT,
  level VARCHAR(20),
  calculated_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_assessment_employee_id (employee_id),
  INDEX idx_assessment_org_id (org_id),
  INDEX idx_assessment_period (period),
  UNIQUE KEY uk_assessment_emp_period (employee_id, period),
  CONSTRAINT fk_assessment_employee FOREIGN KEY (employee_id) REFERENCES hse_employee(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hse_dashboard_snapshot (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  org_id BIGINT NOT NULL,
  total_employees INT,
  high_risk_count INT,
  high_risk_rate DECIMAL(5,2),
  pending_warning_count INT,
  processing_warning_count INT,
  resolved_warning_count INT,
  pending_rectify_count INT,
  processing_rectify_count INT,
  completed_rectify_count INT,
  rectify_completion_rate DECIMAL(5,2),
  assessment_total_score DECIMAL(5,2),
  assessment_rank INT,
  data_json JSON,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_snapshot_date (snapshot_date),
  INDEX idx_snapshot_org_id (org_id),
  UNIQUE KEY uk_snapshot_date_org (snapshot_date, org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 4.2 初始化数据脚本

```sql
-- hse_dashboard_init_data.sql

USE hse_dashboard;

-- =============================================
-- 初始化用户
-- =============================================

-- admin 密码：admin123（BCrypt 加密）
INSERT INTO sys_user (username, password, real_name, phone, org_id, org_name, status) VALUES
('admin', '$2a$10$N.zmdr9k7uOCQb376NoUnuTJ8iAt6Z5EHsM8lE9lBOsl7iKTVKIUi', '系统管理员', '13800000000', NULL, NULL, 1),
('safety_manager', '$2a$10$N.zmdr9k7uOCQb376NoUnuTJ8iAt6Z5EHsM8lE9lBOsl7iKTVKIUi', '安全管理员', '13800000001', 100, '北京分公司', 1),
('department_manager', '$2a$10$N.zmdr9k7uOCQb376NoUnuTJ8iAt6Z5EHsM8lE9lBOsl7iKTVKIUi', '部门经理', '13800000002', 100, '北京分公司', 1),
('grid_leader', '$2a$10$N.zmdr9k7uOCQb376NoUnuTJ8iAt6Z5EHsM8lE9lBOsl7iKTVKIUi', '网格长', '13800000003', 101, '北京分公司-运营一部', 1),
('user', '$2a$10$N.zmdr9k7uOCQb376NoUnuTJ8iAt6Z5EHsM8lE9lBOsl7iKTVKIUi', '普通用户', '13800000004', 101, '北京分公司-运营一部', 1);

-- =============================================
-- 初始化角色
-- =============================================

INSERT INTO sys_role (code, name, description) VALUES
('admin', '系统管理员', '系统超级管理员'),
('safety_manager', '安全管理员', '安全管理负责人'),
('department_manager', '部门经理', '部门负责人'),
('grid_leader', '网格长', '网格负责人'),
('user', '普通用户', '普通用户');

-- 用户角色关联
INSERT INTO sys_user_role (user_id, role_id) VALUES
(1, 1),  -- admin -> admin
(2, 2),  -- safety_manager -> safety_manager
(3, 3),  -- department_manager -> department_manager
(4, 4),  -- grid_leader -> grid_leader
(5, 5);  -- user -> user

-- =============================================
-- 初始化权限
-- =============================================

INSERT INTO sys_permission (code, name, type, path, icon, sort) VALUES
('dashboard', '工作台', 'menu', '/dashboard', 'home', 1),
('employee', '员工风险', 'menu', '/risk', 'user', 2),
('employee:view', '查看员工', 'button', NULL, NULL, 1),
('employee:create', '创建员工', 'button', NULL, NULL, 2),
('risk:calculate', '风险计算', 'button', NULL, NULL, 3),
('warning', '预警管理', 'menu', '/warning', 'alert', 3),
('warning:view', '查看预警', 'button', NULL, NULL, 1),
('warning:handle', '处理预警', 'button', NULL, NULL, 2),
('rectify', '整改管理', 'menu', '/rectify', 'repair', 4),
('rectify:create', '创建整改', 'button', NULL, NULL, 1),
('rectify:handle', '处理整改', 'button', NULL, NULL, 2),
('assessment', '考核驾驶舱', 'menu', '/assessment', 'dashboard', 5),
('assessment:view', '查看考核', 'button', NULL, NULL, 1),
('cockpit:view', '查看驾驶舱', 'button', NULL, NULL, 2);

-- =============================================
-- 角色权限关联
-- =============================================

-- admin：全部权限
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT 1, id FROM sys_permission;

-- safety_manager：工作台 + 员工 + 风险计算 + 预警 + 整改 + 考核 + 驾驶舱
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT 2, id FROM sys_permission WHERE code IN (
  'dashboard', 'employee', 'employee:view', 'employee:create',
  'risk:calculate', 'warning', 'warning:view', 'warning:handle',
  'rectify', 'rectify:create', 'rectify:handle',
  'assessment', 'assessment:view', 'cockpit:view'
);

-- department_manager：工作台 + 员工查看 + 预警查看 + 整改管理 + 考核
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT 3, id FROM sys_permission WHERE code IN (
  'dashboard', 'employee', 'employee:view',
  'warning', 'warning:view',
  'rectify', 'rectify:create', 'rectify:handle',
  'assessment', 'assessment:view'
);

-- grid_leader：工作台 + 员工查看 + 预警查看 + 整改处理
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT 4, id FROM sys_permission WHERE code IN (
  'dashboard', 'employee', 'employee:view',
  'warning', 'warning:view',
  'rectify', 'rectify:handle'
);

-- user：工作台 + 员工查看 + 预警查看 + 整改查看
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT 5, id FROM sys_permission WHERE code IN (
  'dashboard', 'employee', 'employee:view',
  'warning', 'warning:view',
  'rectify'
);

-- =============================================
-- 初始化员工数据
-- =============================================

INSERT INTO hse_employee (employee_code, name, phone, org_id, org_name, position_id, position_name, risk_score, risk_level, status) VALUES
('EMP20260001', '张三', '13800001001', 100, '北京分公司', 200, '项目经理', 72.50, 'HIGH', 1),
('EMP20260002', '李四', '13800001002', 100, '北京分公司', 201, '工程师', 55.00, 'MEDIUM', 1),
('EMP20260003', '王五', '13800001003', 100, '北京分公司', 202, '技术员', 45.00, 'MEDIUM', 1),
('EMP20260004', '赵六', '13800001004', 101, '北京分公司-运营一部', 203, '操作员', 35.00, 'LOW', 1),
('EMP20260005', '钱七', '13800001005', 101, '北京分公司-运营一部', 204, '班长', 85.00, 'CRITICAL', 1),
('EMP20260006', '孙八', '13800001006', 102, '北京分公司-运营二部', 205, '调度员', 62.00, 'MEDIUM', 1),
('EMP20260007', '周九', '13800001007', 102, '北京分公司-运营二部', 206, '司机', 78.00, 'HIGH', 1),
('EMP20260008', '吴十', '13800001008', 102, '北京分公司-运营二部', 207, '维修员', 50.00, 'MEDIUM', 1);

-- =============================================
-- 初始化风险记录
-- =============================================

INSERT INTO hse_risk_record (employee_id, calculate_date, risk_score, risk_level, attendance_score, violation_score, training_score, performance_score, other_score) VALUES
(1, '2026-07-15', 72.50, 'HIGH', 85.00, 60.00, 70.00, 80.00, 75.00),
(2, '2026-07-15', 55.00, 'MEDIUM', 90.00, 75.00, 65.00, 80.00, 70.00),
(3, '2026-07-15', 45.00, 'MEDIUM', 92.00, 85.00, 60.00, 75.00, 68.00),
(4, '2026-07-15', 35.00, 'LOW', 95.00, 95.00, 80.00, 85.00, 82.00),
(5, '2026-07-15', 85.00, 'CRITICAL', 70.00, 40.00, 55.00, 70.00, 60.00),
(6, '2026-07-15', 62.00, 'MEDIUM', 88.00, 70.00, 72.00, 78.00, 72.00),
(7, '2026-07-15', 78.00, 'HIGH', 80.00, 55.00, 65.00, 75.00, 70.00),
(8, '2026-07-15', 50.00, 'MEDIUM', 90.00, 80.00, 68.00, 78.00, 70.00);

-- 更新员工风险信息
UPDATE hse_employee SET risk_score = 72.50, risk_level = 'HIGH', last_risk_calc_at = '2026-07-15 14:30:00' WHERE id = 1;
UPDATE hse_employee SET risk_score = 55.00, risk_level = 'MEDIUM', last_risk_calc_at = '2026-07-15 14:30:00' WHERE id = 2;
UPDATE hse_employee SET risk_score = 45.00, risk_level = 'MEDIUM', last_risk_calc_at = '2026-07-15 14:30:00' WHERE id = 3;
UPDATE hse_employee SET risk_score = 35.00, risk_level = 'LOW', last_risk_calc_at = '2026-07-15 14:30:00' WHERE id = 4;
UPDATE hse_employee SET risk_score = 85.00, risk_level = 'CRITICAL', last_risk_calc_at = '2026-07-15 14:30:00' WHERE id = 5;
UPDATE hse_employee SET risk_score = 62.00, risk_level = 'MEDIUM', last_risk_calc_at = '2026-07-15 14:30:00' WHERE id = 6;
UPDATE hse_employee SET risk_score = 78.00, risk_level = 'HIGH', last_risk_calc_at = '2026-07-15 14:30:00' WHERE id = 7;
UPDATE hse_employee SET risk_score = 50.00, risk_level = 'MEDIUM', last_risk_calc_at = '2026-07-15 14:30:00' WHERE id = 8;

-- =============================================
-- 初始化预警数据
-- =============================================

INSERT INTO hse_warning (warning_code, warning_type, warning_level, title, description, source_id, source_type, employee_id, employee_name, status, handler_id, handler_name, deadline, created_at) VALUES
('WRN20260001', 'RISK_SCORE', 'HIGH', '员工风险评分异常', '员工张三风险评分为 72.50，超过高风险阈值 60', 1, 'EMPLOYEE', 1, '张三', 'PENDING', NULL, NULL, '2026-07-16 14:30:00', '2026-07-15 14:30:00'),
('WRN20260002', 'RISK_SCORE', 'CRITICAL', '员工风险评分危急', '员工钱七风险评分为 85.00，达到危急等级', 5, 'EMPLOYEE', 5, '钱七', 'PENDING', NULL, NULL, '2026-07-15 15:30:00', '2026-07-15 14:35:00'),
('WRN20260003', 'RISK_SCORE', 'HIGH', '员工风险评分异常', '员工周九风险评分为 78.00，超过高风险阈值 60', 7, 'EMPLOYEE', 7, '周九', 'PROCESSING', 2, '安全管理员', '2026-07-16 14:35:00', '2026-07-15 14:40:00'),
('WRN20260004', 'VIOLATION', 'MEDIUM', '员工违章操作', '员工李四近3个月违章2次', 2, 'EMPLOYEE', 2, '李四', 'RESOLVED', 3, '部门经理', '2026-07-18 14:40:00', '2026-07-15 14:45:00');

-- =============================================
-- 初始化整改任务
-- =============================================

INSERT INTO hse_rectify (rectify_code, warning_id, warning_code, employee_id, employee_name, requirement, status, handler_id, handler_name, deadline, completed_at, created_at) VALUES
('REC20260001', 1, 'WRN20260001', 1, '张三', '加强员工安全教育培训，重点关注违章操作行为', 'PENDING', 4, '网格长', '2026-07-20 23:59:59', NULL, '2026-07-15 15:00:00'),
('REC20260002', 2, 'WRN20260002', 5, '钱七', '立即停止作业，进行全面安全评估', 'PROCESSING', 2, '安全管理员', '2026-07-16 14:35:00', NULL, '2026-07-15 15:05:00'),
('REC20260003', 4, 'WRN20260004', 2, '李四', '进行安全操作规范培训和考核', 'COMPLETED', 3, '部门经理', '2026-07-20 14:45:00', '2026-07-19 14:45:00', '2026-07-15 15:10:00');

-- =============================================
-- 初始化考核数据
-- =============================================

INSERT INTO hse_assessment (employee_id, org_id, period, total_score, employee_risk_score, warning_response_score, rectify_score, training_score, rank, level, calculated_at) VALUES
(1, 100, '2026-07', 78.50, 72.50, 85.00, 80.00, 75.00, 3, 'GOOD', '2026-07-15 14:30:00'),
(2, 100, '2026-07', 85.00, 85.00, 90.00, 88.00, 82.00, 1, 'EXCELLENT', '2026-07-15 14:30:00'),
(5, 101, '2026-07', 60.00, 40.00, 70.00, 65.00, 60.00, 5, 'PASS', '2026-07-15 14:30:00'),
(7, 102, '2026-07', 72.00, 68.00, 80.00, 75.00, 70.00, 4, 'GOOD', '2026-07-15 14:30:00');

-- =============================================
-- 初始化驾驶舱快照
-- =============================================

INSERT INTO hse_dashboard_snapshot (snapshot_date, org_id, total_employees, high_risk_count, high_risk_rate, pending_warning_count, processing_warning_count, resolved_warning_count, pending_rectify_count, processing_rectify_count, completed_rectify_count, rectify_completion_rate, assessment_total_score, assessment_rank) VALUES
('2026-07-15', 100, 30, 8, 26.67, 2, 1, 5, 1, 1, 5, 83.33, 85.00, 1),
('2026-07-15', 101, 5, 1, 20.00, 1, 0, 0, 1, 0, 0, 0, 60.00, 5),
('2026-07-15', 102, 8, 2, 25.00, 1, 0, 1, 1, 1, 1, 50.00, 72.00, 4);
```

### 4.3 执行脚本

```bash
# 1. 创建数据库和表
mysql -u root -p < hse_dashboard_init.sql

# 2. 初始化数据
mysql -u root -p hse_dashboard < hse_dashboard_init_data.sql

# 3. 验证表结构
mysql -u root -p hse_dashboard -e "SHOW TABLES;"

# 4. 验证数据
mysql -u root -p hse_dashboard -e "SELECT COUNT(*) FROM sys_user;"
```

---

## 五、Redis 配置

### 5.1 Key 设计

| Key 模式 | 说明 | TTL |
|----------|------|-----|
| `hse:token:{userId}` | 用户 Token 缓存 | 24h |
| `hse:user:{userId}` | 用户信息缓存 | 1h |
| `hse:permission:{userId}` | 用户权限缓存 | 1h |
| `hse:employee:list:{orgId}` | 员工列表缓存 | 5min |
| `hse:employee:detail:{id}` | 员工详情缓存 | 5min |
| `hse:risk:profile:{id}` | 风险画像缓存 | 10min |
| `hse:warning:list:{handlerId}` | 预警列表缓存 | 5min |
| `hse:assessment:score:{empId}:{period}` | 考核评分缓存 | 30min |
| `hse:cockpit:overview:{orgId}` | 驾驶舱概览缓存 | 1min |
| `hse:rate_limit:{ip}` | 接口限流计数 | 1min |

### 5.2 缓存策略

| 策略 | 说明 |
|------|------|
| Cache-Aside | 先查缓存，未命中查数据库 |
| 主动更新 | 数据变更时主动更新缓存 |
| 定时刷新 | 热点数据定时刷新 |
| 降级策略 | Redis 不可用时降级为直接查询 |

---

## 六、数据字典

### 6.1 状态码

| 状态 | 值 | 说明 |
|------|------|------|
| 用户状态 | 0/1 | 禁用/启用 |
| 员工状态 | 0/1 | 离职/在职 |
| 风险等级 | LOW/MEDIUM/HIGH/CRITICAL | 低/中/高/危急 |
| 预警状态 | PENDING/PROCESSING/RESOLVED/ESCALATED/IGNORED | 待处理/处理中/已解决/已升级/已忽略 |
| 整改状态 | PENDING/PROCESSING/COMPLETED/CLOSED/REJECTED | 待处理/处理中/已完成/已关闭/已驳回 |
| 考核等级 | EXCELLENT/GOOD/PASS/FAIL | 优秀/良好/合格/不合格 |

### 6.2 预警类型

| 类型 | 说明 |
|------|------|
| RISK_SCORE | 风险评分预警 |
| VIOLATION | 违章预警 |
| ABSENCE | 缺勤预警 |
| TRAINING | 培训预警 |
| PERFORMANCE | 绩效预警 |

### 6.3 整改类型

| 类型 | 说明 |
|------|------|
| EDUCATION | 教育培训 |
| SUPERVISION | 监督管理 |
| SYSTEM | 制度完善 |
| TECHNICAL | 技术措施 |
| OTHER | 其他 |

---

## 七、数据备份

### 7.1 备份策略

| 类型 | 频率 | 保留 |
|------|------|------|
| 全量备份 | 每日 02:00 | 30 天 |
| 增量备份 | 每小时 | 7 天 |
| 日志备份 | 实时 | 90 天 |

### 7.2 备份脚本

```bash
#!/bin/bash
# hse_dashboard_backup.sh

BACKUP_DIR="/data/backup/mysql"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="hse_dashboard"

# 全量备份
mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" $DB_NAME > "$BACKUP_DIR/full_${DATE}.sql"

# 压缩
gzip "$BACKUP_DIR/full_${DATE}.sql"

# 清理 30 天前的备份
find $BACKUP_DIR -name "full_*.sql.gz" -mtime +30 -delete

echo "Backup completed: full_${DATE}.sql.gz"
```

---

## 八、版本历史

| 版本 | 日期 | 修订人 | 修订说明 |
|------|------|--------|----------|
| v1.0 | 2026-07 | HSE 团队 | Sprint9.5 数据库初始化初始版本 |
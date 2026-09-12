# HSE组织中心设计报告

> 版本：v1.0（组织中心与员工主数据融合版）
> 阶段：Sprint5.15（设计阶段，不含开发）
> 日期：2026年7月22日
> 依据：组织中心与员工主数据融合设计任务

---

## 一、设计目标

### 1.1 业务背景

当前系统使用单一 `department` 表管理组织，无法准确反映项目公司真实的组织架构，导致员工花名册导入、HSE风险画像、网格责任体系缺少可靠的组织基础。

### 1.2 设计目标

建立**项目公司真实组织架构**，服务于：

| 服务对象 | 用途 |
|----------|------|
| 员工花名册导入 | 提供组织匹配目标，解析所属组织、作业单元、岗位 |
| HSE风险画像 | 提供组织风险画像维度，按组织聚合风险数据 |
| 网格责任体系 | 提供网格责任组织关联，建立责任区域与组织的对应关系 |

### 1.3 设计原则

| 原则 | 说明 |
|------|------|
| 双模型设计 | 管理组织（hse_org_unit）+ 生产作业单元（hse_operation_unit） |
| 禁止集团/区域节点 | 集团公司、区域公司不作为系统内部组织节点 |
| 作业中心同级 | 环卫作业中心、市政绿化作业中心与职能部门同级 |
| 动态作业单元 | 人工片区、人工班组等按需创建 |
| 不修改employee核心模型 | 复用现有员工主数据，通过 employee_assignment 关联组织 |
| 配置化映射 | 花名册导入禁止简单映射，必须通过映射规则解析 |

---

## 二、组织架构设计

### 2.1 项目公司真实组织架构

```
XXX环卫有限公司（项目公司）
├── 总经理
├── 安环管理部
├── 生产管理部
├── 人力综合部
├── 环卫作业中心
│   ├── 乡镇作业中心A
│   │   ├── 转运站
│   │   ├── 人工片区（收运/保洁/挂桶）
│   │   └── 人工班组
│   ├── 乡镇作业中心B
│   │   └── ...
│   └── 中心直管生产人员（转运车驾驶员、吸污车驾驶员）
└── 市政绿化作业中心
    ├── 绿化养护作业组
    └── 市政维护作业组
```

### 2.2 层级关系说明

| 层级 | 组织类型 | 说明 |
|:----:|----------|------|
| 第1层 | company | 项目公司（根节点） |
| 第2层 | department / center | 职能部门、作业中心（同级） |
| 第3层 | town_center | 乡镇作业中心（归属环卫作业中心） |

**关键约束**：
- 环卫作业中心、市政绿化作业中心、三个职能部门（安环/生产/人力）**平级**
- 乡镇作业中心**属于**环卫作业中心
- 禁止将集团、区域公司作为组织节点

### 2.3 管理组织模型（hse_org_unit）

> 表示企业内部的**行政管理关系**

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键 |
| parent_id | BIGINT | REFERENCES hse_org_unit(id) | 上级组织ID |
| org_name | VARCHAR(100) | NOT NULL | 组织名称 |
| org_type | VARCHAR(20) | NOT NULL | 组织类型：company/department/center/town_center |
| org_code | VARCHAR(50) | UNIQUE | 组织编码 |
| leader_employee_id | BIGINT | REFERENCES employee(id) | 负责人ID |
| safety_manager_id | BIGINT | REFERENCES employee(id) | 安全负责人ID |
| headcount | INTEGER | DEFAULT 0 | 编制人数 |
| sort_order | INTEGER | DEFAULT 0 | 排序号 |
| status | VARCHAR(20) | DEFAULT 'active' | 状态：active/inactive/dissolved |
| description | TEXT | | 描述 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | DEFAULT NOW() | 更新时间 |
| is_deleted | BOOLEAN | DEFAULT FALSE | 软删除 |

**组织类型枚举**：

| 类型 | 说明 | 层级 | 父节点类型 |
|------|------|:----:|:----------:|
| company | 公司（根节点） | 1 | NULL |
| department | 职能部门 | 2 | company |
| center | 作业中心 | 2 | company |
| town_center | 乡镇作业中心 | 3 | center（仅环卫作业中心） |

**索引设计**：

| 索引名 | 字段 | 说明 |
|--------|------|------|
| idx_org_unit_parent | parent_id | 上级组织查询 |
| idx_org_unit_type | org_type | 组织类型查询 |
| idx_org_unit_code | org_code | 编码查询 |
| idx_org_unit_status | status | 状态查询 |

### 2.4 生产作业单元模型（hse_operation_unit）

> 表示**生产作业单元**，如转运站、收运车组、保洁组等

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键 |
| org_unit_id | BIGINT | NOT NULL, REFERENCES hse_org_unit(id) | 所属管理组织 |
| unit_name | VARCHAR(100) | NOT NULL | 作业单元名称 |
| unit_type | VARCHAR(32) | NOT NULL | 单元类型 |
| unit_code | VARCHAR(50) | UNIQUE | 单元编码 |
| leader_employee_id | BIGINT | REFERENCES employee(id) | 单元负责人ID |
| headcount | INTEGER | DEFAULT 0 | 编制人数 |
| status | VARCHAR(20) | DEFAULT 'active' | 状态 |
| sort_order | INTEGER | DEFAULT 0 | 排序号 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | DEFAULT NOW() | 更新时间 |
| is_deleted | BOOLEAN | DEFAULT FALSE | 软删除 |

**作业单元类型枚举**：

| 类型 | 说明 | 所属组织 |
|------|------|----------|
| transfer_station | 转运站 | 乡镇作业中心 |
| collection_team | 收运车组 | 乡镇作业中心 |
| cleaning_team | 保洁组 | 乡镇作业中心 |
| barrel_team | 挂桶组 | 乡镇作业中心 |
| vehicle_team | 中心车辆作业组 | 环卫作业中心 |
| greening_team | 绿化养护作业组 | 市政绿化作业中心 |
| maintenance_team | 市政维护作业组 | 市政绿化作业中心 |

### 2.5 组织树示例

```
XXX环卫有限公司 (company, id=1)
├── 安环管理部 (department, id=2)
├── 生产管理部 (department, id=3)
├── 人力综合部 (department, id=4)
├── 环卫作业中心 (center, id=5)
│   ├── 乡镇作业中心A (town_center, id=6)
│   │   └── [作业单元] 转运站、收运车组、保洁组
│   ├── 乡镇作业中心B (town_center, id=7)
│   │   └── [作业单元] 转运站、收运车组、保洁组
│   └── [作业单元] 中心车辆作业组（直管）
└── 市政绿化作业中心 (center, id=8)
    └── [作业单元] 绿化养护作业组、市政维护作业组
```

### 2.6 业务规则

| 规则 | 说明 |
|------|------|
| 公司唯一 | 系统只能有一个 company 类型的组织 |
| 同级关系 | center 类型与 department 类型同级 |
| 乡镇归属 | town_center 只能归属 center 类型（仅环卫作业中心） |
| 禁止嵌套 | department 不能嵌套 center |
| 班组非组织 | 人工班组不创建为 hse_org_unit，只创建为 hse_operation_unit |

---

## 三、与员工主数据的关联

### 3.1 关联模型

```
employee（员工主表，不修改）
    │
    │ 1 : N
    │
employee_assignment（任职关系表）
    │
    │ N : 1          N : 1
    │                │
    ▼                ▼
hse_org_unit      hse_operation_unit
(管理组织)         (生产作业单元)
```

### 3.2 employee_assignment（员工任职关系）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGSERIAL | PRIMARY KEY | 主键 |
| employee_id | BIGINT | NOT NULL, REFERENCES employee(id) | 员工ID |
| org_unit_id | BIGINT | REFERENCES hse_org_unit(id) | 所属管理组织 |
| operation_unit_id | BIGINT | REFERENCES hse_operation_unit(id) | 所属作业单元（可选） |
| position_id | BIGINT | REFERENCES position(id) | 岗位ID |
| position_name | VARCHAR(64) | | 岗位名称（冗余） |
| start_date | DATE | NOT NULL | 任职开始日期 |
| end_date | DATE | NULL | 任职结束日期（NULL表示当前有效） |
| is_primary | BOOLEAN | DEFAULT TRUE | 是否主岗位 |
| status | VARCHAR(20) | DEFAULT 'active' | 状态 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | DEFAULT NOW() | 更新时间 |
| is_deleted | BOOLEAN | DEFAULT FALSE | 软删除 |

### 3.3 不修改的模块

| 模块 | 说明 |
|------|------|
| employee核心模型 | 不修改表结构和业务逻辑 |
| auth/JWT | 不修改 |
| Vben核心目录 | 不修改 |
| training模型 | 不修改 |
| violation_records模型 | 不修改 |
| hazards模型 | 不修改 |

---

## 四、组织管理功能设计

### 4.1 功能清单

| 功能 | 说明 | 权限 |
|------|------|------|
| 组织树展示 | 展示完整组织架构 | 所有角色 |
| 新增组织 | 创建新的组织单元 | admin |
| 编辑组织 | 修改组织信息 | admin |
| 删除组织 | 软删除组织 | admin |
| 查看组织详情 | 查看组织详细信息和下属员工 | 所有角色 |
| 组织负责人管理 | 设置组织负责人和安全负责人 | admin |
| 组织状态管理 | 启用/停用/撤销组织 | admin |
| 作业单元管理 | 管理生产作业单元 | admin |
| 组织排序 | 调整组织顺序 | admin |

### 4.2 前端页面设计

**路径**：`/hse/organization/org-center`

**布局**：
- 左侧：组织树形结构（可展开/折叠）
- 右侧：组织详情面板（基本信息、下属组织、作业单元、员工列表）

---

## 五、API设计

### 5.1 管理组织 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/hse/org-unit/tree | 获取组织树 |
| GET | /api/hse/org-unit/list | 获取组织列表（分页） |
| GET | /api/hse/org-unit/:id | 获取组织详情 |
| POST | /api/hse/org-unit | 新增组织 |
| PUT | /api/hse/org-unit/:id | 更新组织 |
| DELETE | /api/hse/org-unit/:id | 删除组织（软删除） |
| GET | /api/hse/org-unit/:id/employees | 获取组织下员工 |
| GET | /api/hse/org-unit/:id/sub-units | 获取下属组织 |
| GET | /api/hse/org-unit/stats | 获取组织统计 |

### 5.2 生产作业单元 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/hse/operation-unit/list | 作业单元列表 |
| GET | /api/hse/operation-unit/:id | 作业单元详情 |
| POST | /api/hse/operation-unit | 新增作业单元 |
| PUT | /api/hse/operation-unit/:id | 更新作业单元 |
| DELETE | /api/hse/operation-unit/:id | 删除作业单元 |
| GET | /api/hse/operation-unit/by-org/:orgId | 按组织查询作业单元 |

---

## 六、与各模块的关联

### 6.1 与员工花名册导入的关联

组织中心为花名册导入提供组织匹配目标：

```
Excel"所属部门"
    ↓
查询映射规则（employee_import_mapping_rule）
    ↓
匹配 hse_org_unit（管理组织）
    ↓
根据部门类型+岗位生成 hse_operation_unit（作业单元）
    ↓
写入 employee_assignment
```

> 详见《员工花名册组织映射设计-v1.1.md》

### 6.2 与HSE风险画像的关联

组织中心为风险画像提供组织维度：

```
hse_org_unit
    ↓
employee_assignment.org_unit_id
    ↓
employee
    ↓
风险数据（培训、三违、隐患、事故）
    ↓
组织风险画像
```

### 6.3 与网格责任体系的关联

组织中心为网格责任体系提供责任组织：

```
hse_org_unit
    ↓
hse_grid_responsibility.responsible_org
    ↓
网格责任人 → 责任区域 → 风险 → 隐患 → 整改
```

> 详见《网格责任组织关联设计.md》

### 6.4 与岗位体系的关联

组织中心为岗位体系提供组织归属：

```
hse_org_unit
    ↓
position（岗位归属组织）
    ↓
employee_assignment.position_id
    ↓
标准岗位 → 岗位别名 → 网格角色
```

> 详见《岗位体系设计.md》

---

## 七、权限设计

| 操作 | 权限代码 | 说明 |
|------|----------|------|
| 查看组织 | hse:org-unit:view | 所有角色 |
| 新增组织 | hse:org-unit:create | admin |
| 编辑组织 | hse:org-unit:update | admin |
| 删除组织 | hse:org-unit:delete | admin |
| 管理作业单元 | hse:operation-unit:manage | admin |
| 查看组织员工 | hse:org-unit:employees | 所有角色 |

---

## 八、修订记录

| 版本 | 日期 | 修订内容 |
|:----:|------|----------|
| v1.0 | 2026-07-22 | 初始版本：HSE组织中心设计<br>1. 建立项目公司真实组织架构：项目公司→职能部门/作业中心→乡镇作业中心<br>2. 双模型设计：管理组织（hse_org_unit）+ 生产作业单元（hse_operation_unit）<br>3. 环卫作业中心、市政绿化作业中心与职能部门平级<br>4. 乡镇作业中心属于环卫作业中心<br>5. 与员工花名册导入、HSE风险画像、网格责任体系关联<br>6. 不修改employee核心模型、auth/JWT、Vben核心目录<br>7. 不新增依赖 |

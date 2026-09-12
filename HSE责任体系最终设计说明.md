# HSE责任体系最终设计说明

> 版本：v1.0（Sprint6开发前最终版）
> 阶段：Sprint5.17（基础责任数据模型收口设计）
> 日期：2026年7月22日
> 依据：HSE组织中心设计报告-v1.0、员工花名册导入验证报告-v1.1、岗位体系设计、网格责任组织关联设计、生产管理责任与网格责任关联说明-v1.0
> 状态：🔒 Sprint6开发依据（最终版）

---

## 一、设计定位

### 1.1 文档目的

本文档是Sprint6开发前HSE责任体系的**最终收口设计**，统一整合网格责任、生产管理责任、非责任岗位三类责任类型，明确数据模型命名与员工关联链路。

### 1.2 收口范围

| 收口项 | 说明 |
|--------|------|
| 责任体系统一 | 统一三类责任类型（grid_leader/production_manager/none） |
| 数据模型命名 | 评估并确定责任表最终命名 |
| 员工关联链路 | 确认 employee → responsibility 完整链路 |
| 花名册导入关联 | 确认导入后自动生成责任记录 |
| Sprint6开发依据 | 作为Sprint6开发的最终设计依据 |

### 1.3 设计原则

| 原则 | 说明 |
|------|------|
| 统一责任体系 | 网格责任与生产管理责任纳入统一模型 |
| 岗位驱动 | 责任类型由标准岗位自动推导 |
| 最小侵入 | 不修改 employee、employee_assignment、hazards、training、violation_records |
| 配置化 | 责任类型支持配置覆盖默认值 |
| 历史兼容 | 保留 hse_grid_responsibility 命名，通过视图兼容 |

---

## 二、责任体系统一设计

### 2.1 三类责任类型

| 责任类型 | 责任编码 | 说明 | 适用岗位 | 自动生成字段 |
|----------|:--------:|------|----------|-------------|
| 网格长责任 | grid_leader | 承担网格安全生产责任 | 项目总经理、部门经理、乡镇作业中心经理、管理员 | grid_level + grid_role + inspection_frequency |
| 生产管理责任 | production_manager | 承担生产管理责任，非网格责任 | 环卫作业中心副经理（人工）、环卫作业中心片区长 | 不生成grid_level/grid_role/inspection_frequency |
| 非责任岗位 | none | 无管理责任 | 作业岗位、驾驶员岗位、职能岗位 | 不生成责任记录 |

### 2.2 网格长责任（grid_leader）

#### 2.2.1 岗位与网格层级映射

| 标准岗位 | grid_level | grid_role | inspection_frequency | 责任范围 |
|----------|:----------:|-----------|:--------------------:|----------|
| 项目总经理 | grid1 | 总网格长 | 1次/3天 | 项目公司全面 |
| 部门经理 | grid2 | 一级网格长 | 1次/2天 | 部门/中心范围 |
| 乡镇作业中心经理 | grid3 | 二级网格长 | 1次/1天 | 乡镇/区域范围 |
| 管理员 | grid4 | 三级网格长 | 1次/1天 | 基层网格 |

#### 2.2.2 自动生成字段

```
网格长责任记录
    ├── grid_level（自动推导）
    ├── grid_role（自动推导）
    ├── inspection_frequency（自动推导）
    ├── responsible_org（来自任职组织）
    ├── responsible_org_id（来自任职组织）
    └── responsible_area（来自组织管辖范围）
```

### 2.3 生产管理责任（production_manager）

#### 2.3.1 岗位映射

| 标准岗位 | 责任类型 | 责任组织 | 说明 |
|----------|:--------:|----------|------|
| 环卫作业中心副经理（人工） | production_manager | 环卫作业中心 | 中心生产管理岗 |
| 环卫作业中心片区长 | production_manager | 环卫作业中心 | 中心生产管理岗 |

#### 2.3.2 不生成的字段

| 字段 | 值 | 说明 |
|------|:--:|------|
| grid_level | NULL | 非网格长，无网格层级 |
| grid_role | NULL | 非网格长，无网格角色 |
| inspection_frequency | NULL | 非网格长，无巡查频次 |

#### 2.3.3 生成的字段

| 字段 | 值 | 说明 |
|------|:--:|------|
| responsibility_type | production_manager | 责任类型 |
| responsible_org | 环卫作业中心 | 责任组织名称 |
| responsible_org_id | hse_org_unit.id | 责任组织ID |
| responsible_area | 中心生产管理范围 | 责任区域描述 |

### 2.4 非责任岗位（none）

| 岗位类别 | 包含岗位 | 处理方式 |
|----------|----------|----------|
| 作业岗位 | 保洁员、挂桶员、垃圾收运辅助工 | 不生成责任记录 |
| 驾驶员岗位 | 垃圾转运车驾驶员、垃圾收运车驾驶员、吸污车驾驶员 | 不生成责任记录 |
| 站管岗位 | 转运站管理员 | 不生成责任记录 |
| 职能岗位 | 安全管理员、文员、会计、人事专员 | 不生成责任记录 |

### 2.5 责任类型配置规则

```
岗位默认责任类型（hse_position_responsibility_config）
    ↓
    ├─→ grid_leader → 自动推导 grid_level + grid_role + inspection_frequency
    ├─→ production_manager → 不推导网格角色，记录责任类型
    └─→ none → 不生成责任记录
    ↓
支持人工配置覆盖默认值（is_configurable = TRUE）
    ↓
    ├─→ production_manager 可配置为 grid_leader（指定 grid_level）
    └─→ grid_leader 可配置为 production_manager
```

---

## 三、数据模型命名评估与决策

### 3.1 命名方案评估

| 方案 | 表名 | 优点 | 缺点 | 评估 |
|------|------|------|------|:----:|
| 方案A | hse_grid_responsibility | 已有设计，历史兼容 | 名称局限，无法体现生产管理责任 | ⚠️ |
| 方案B | hse_management_responsibility | 体现管理责任 | 仍偏向管理，未涵盖网格 | ⚠️ |
| **方案C** | **hse_responsibility** | **统一责任体系，简洁通用** | **需迁移历史设计** | **✅ 推荐** |

### 3.2 最终决策：采用 hse_responsibility

**决策理由**：

| 理由 | 说明 |
|------|------|
| 统一责任体系 | 一张表支持网格责任、生产管理责任、非责任岗位 |
| 命名简洁 | hse_responsibility 比 hse_grid_responsibility 更通用 |
| Sprint6全新开发 | Sprint6从零开发，无需历史兼容负担 |
| 扩展性 | 未来可支持更多责任类型（如安全责任人、环保责任人） |

### 3.3 历史兼容方案

```sql
-- Sprint6开发时，创建 hse_responsibility 新表
-- 保留 hse_grid_responsibility 视图，兼容历史设计文档引用

CREATE VIEW hse_grid_responsibility AS
SELECT 
    id, employee_id, grid_level, grid_role,
    standard_position, position_alias,
    responsible_org, responsible_org_id,
    responsible_area, inspection_frequency,
    start_date, end_date, status, is_deleted,
    created_at, updated_at, created_by, updated_by
FROM hse_responsibility
WHERE responsibility_type = 'grid_leader'
  AND is_deleted = FALSE;
```

### 3.4 命名映射关系

| 历史命名 | 新命名 | 说明 |
|----------|--------|------|
| hse_grid_responsibility | hse_responsibility | 表名统一 |
| hse_position_responsibility_config | hse_responsibility_config | 岗位责任配置表 |
| hse_position_alias | hse_position_alias | 岗位别名表（保持不变） |
| hse_grid_area | hse_responsibility_area | 责任区域表（可选） |

---

## 四、员工关联链路

### 4.1 完整关联链路

```
employee（员工主表，不修改）
    ↓ employee_id
employee_assignment（任职关系，不修改）
    ↓ org_unit_id → hse_org_unit（管理组织）
    ↓ operation_unit_id → hse_operation_unit（作业单元）
    ↓ position_id → position（标准岗位）
        ↓
hse_position_alias（岗位别名映射）
    ↓ position_id
hse_responsibility_config（岗位责任配置）
    ↓ default_responsibility_type
hse_responsibility（责任记录）
    ├── responsibility_type（责任类型）
    ├── grid_level（网格层级，仅grid_leader）
    ├── grid_role（网格角色，仅grid_leader）
    ├── inspection_frequency（巡查频次，仅grid_leader）
    ├── responsible_org_id（责任组织ID）
    └── responsible_area（责任区域）
```

### 4.2 链路节点说明

| 节点 | 表 | 说明 | 修改情况 |
|------|-----|------|:--------:|
| 员工 | employee | 员工主数据 | ❌ 不修改 |
| 任职关系 | employee_assignment | 员工与组织/岗位的关联 | ❌ 不修改 |
| 管理组织 | hse_org_unit | 行政管理组织 | Sprint6新建 |
| 作业单元 | hse_operation_unit | 生产作业单元 | Sprint6新建 |
| 标准岗位 | position | 标准岗位定义 | Sprint6扩展 |
| 岗位别名 | hse_position_alias | 岗位别名映射 | Sprint6新建 |
| 责任配置 | hse_responsibility_config | 岗位责任类型配置 | Sprint6新建 |
| 责任记录 | hse_responsibility | 责任记录 | Sprint6新建 |

### 4.3 关联查询示例

```sql
-- 查询员工完整责任信息
SELECT 
    e.id AS employee_id,
    e.name AS employee_name,
    e.employee_no,
    ou.org_name,
    ou.org_type,
    p.position_name AS standard_position,
    rc.default_responsibility_type,
    r.responsibility_type,
    r.grid_level,
    r.grid_role,
    r.inspection_frequency,
    r.responsible_org,
    r.responsible_area
FROM employee e
JOIN employee_assignment ea ON e.id = ea.employee_id AND ea.is_primary = TRUE
JOIN hse_org_unit ou ON ea.org_unit_id = ou.id
JOIN position p ON ea.position_id = p.id
LEFT JOIN hse_responsibility_config rc ON p.id = rc.position_id
LEFT JOIN hse_responsibility r ON e.id = r.employee_id AND r.status = 'active'
WHERE e.id = :employee_id;
```

---

## 五、花名册导入关联

### 5.1 导入后自动生成内容

花名册导入正式入库时，自动生成以下数据：

| 生成项 | 目标表 | 说明 |
|--------|--------|------|
| 员工 | employee | 员工主数据（新增/更新） |
| 任职关系 | employee_assignment | 员工与组织/岗位关联 |
| 责任记录 | hse_responsibility | 责任记录（仅grid_leader和production_manager） |

### 5.2 责任记录生成规则

```
花名册导入 → 岗位匹配 → 获取标准岗位
    ↓
查询 hse_responsibility_config（position_id）
    ↓
获取 default_responsibility_type
    ↓
    ├─→ grid_leader
    │       ↓
    │   自动推导 grid_level + grid_role + inspection_frequency
    │       ↓
    │   生成 hse_responsibility 记录
    │   （responsibility_type = 'grid_leader'）
    │
    ├─→ production_manager
    │       ↓
    │   grid_level = NULL, grid_role = NULL, inspection_frequency = NULL
    │       ↓
    │   生成 hse_responsibility 记录
    │   （responsibility_type = 'production_manager'）
    │
    └─→ none
            ↓
        不生成责任记录
```

### 5.3 责任记录生成SQL

```sql
-- 网格长责任记录生成
INSERT INTO hse_responsibility (
    employee_id, responsibility_type,
    grid_level, grid_role, 
    standard_position, position_alias,
    responsible_org, responsible_org_id,
    responsible_area, inspection_frequency,
    start_date, status
)
SELECT 
    :employee_id, 'grid_leader',
    rc.default_grid_level, rc.default_grid_role,
    p.position_name, NULL,
    ou.org_name, ou.id,
    :responsible_area, rc.default_grid_role,  -- inspection_frequency 来自配置
    CURRENT_DATE, 'active'
FROM employee_assignment ea
JOIN hse_org_unit ou ON ea.org_unit_id = ou.id
JOIN position p ON ea.position_id = p.id
JOIN hse_responsibility_config rc ON p.id = rc.position_id
WHERE ea.employee_id = :employee_id
  AND ea.is_primary = TRUE
  AND ea.status = 'active'
  AND rc.default_responsibility_type = 'grid_leader';

-- 生产管理责任记录生成
INSERT INTO hse_responsibility (
    employee_id, responsibility_type,
    grid_level, grid_role, 
    standard_position, position_alias,
    responsible_org, responsible_org_id,
    responsible_area, inspection_frequency,
    start_date, status
)
SELECT 
    :employee_id, 'production_manager',
    NULL, NULL,
    p.position_name, NULL,
    ou.org_name, ou.id,
    '中心生产管理范围', NULL,
    CURRENT_DATE, 'active'
FROM employee_assignment ea
JOIN hse_org_unit ou ON ea.org_unit_id = ou.id
JOIN position p ON ea.position_id = p.id
JOIN hse_responsibility_config rc ON p.id = rc.position_id
WHERE ea.employee_id = :employee_id
  AND ea.is_primary = TRUE
  AND ea.status = 'active'
  AND rc.default_responsibility_type = 'production_manager';
```

### 5.4 真实花名册验证数据

基于1,323条真实花名册验证：

| 责任类型 | 标准岗位 | 记录数 | 生成字段 |
|----------|----------|:------:|----------|
| grid_leader | 项目总经理 | 1 | grid1 + 总网格长 + 1次/3天 |
| grid_leader | 部门经理 | 3 | grid2 + 一级网格长 + 1次/2天 |
| grid_leader | 乡镇作业中心经理 | 11 | grid3 + 二级网格长 + 1次/1天 |
| grid_leader | 管理员 | 44 | grid4 + 三级网格长 + 1次/1天 |
| production_manager | 环卫作业中心副经理（人工） | 1 | 无网格字段 |
| none | 其他岗位 | 1,263 | 不生成记录 |
| **合计** | - | **1,323** | **60条责任记录** |

---

## 六、责任下钻链路

### 6.1 集团检查下钻视图

```
组织（hse_org_unit）
    ↓
责任类型（responsibility_type）
    ├─→ grid_leader（网格长）
    │       ↓
    │   网格责任人（hse_responsibility）
    │       ↓
    │   责任区域（responsible_area）
    │       ↓
    │   风险（risk）→ 隐患（hazard）→ 整改（rectification）
    │
    └─→ production_manager（生产管理责任人）
            ↓
        生产管理责任人（hse_responsibility）
            ↓
        责任组织（responsible_org）
            ↓
        生产风险 → 生产隐患 → 生产整改
```

### 6.2 责任画像关联

| 责任类型 | 画像类型 | 评估内容 |
|----------|----------|----------|
| grid_leader | 管理责任画像 | 安全生产责任制落实情况 |
| production_manager | 生产管理责任画像 | 生产管理责任落实情况 |
| none | 员工风险画像 | 个人安全行为风险 |

---

## 七、与现有设计的关系

### 7.1 设计文档整合关系

| 现有设计文档 | 整合到本文档的内容 | 状态 |
|-------------|------------------|:----:|
| 《网格长责任体系设计》 | 四级网格长体系、巡查频次 | 整合 |
| 《网格责任组织关联设计》 | responsible_org_id关联、下钻链路 | 整合 |
| 《生产管理责任与网格责任关联说明》 | 责任类型、责任配置 | 整合 |
| 《岗位体系设计》 | 17个标准岗位 | 引用 |
| 《员工花名册组织映射设计-v1.1》 | 责任推导步骤 | 引用 |

### 7.2 命名变更影响

| 原命名 | 新命名 | 影响文档 |
|--------|--------|----------|
| hse_grid_responsibility | hse_responsibility | 网格责任组织关联设计、生产管理责任说明 |
| hse_position_responsibility_config | hse_responsibility_config | 生产管理责任说明 |
| hse_grid_area | hse_responsibility_area | 网格长责任体系设计 |

### 7.3 不修改的核心模型

| 模型 | 修改情况 | 说明 |
|------|:--------:|------|
| employee | ❌ 不修改 | 通过 employee_id 关联 |
| employee_assignment | ❌ 不修改 | 复用现有任职关系表 |
| hazards | ❌ 不修改 | - |
| training | ❌ 不修改 | - |
| violation_records | ❌ 不修改 | - |
| auth/JWT | ❌ 不修改 | - |
| Vben核心目录 | ❌ 不修改 | - |

---

## 八、Sprint6开发依据

### 8.1 开发优先级

| 优先级 | 开发项 | 依赖 |
|:------:|--------|------|
| P0 | hse_org_unit 表创建 | 无 |
| P0 | hse_operation_unit 表创建 | hse_org_unit |
| P0 | position 表扩展（17个标准岗位） | 无 |
| P0 | hse_position_alias 表创建 | position |
| P0 | hse_responsibility_config 表创建 | position |
| P0 | hse_responsibility 表创建 | employee, hse_org_unit |
| P1 | 花名册导入责任推导 | 所有P0表 |
| P1 | 责任配置管理界面 | hse_responsibility_config |
| P2 | 责任画像关联 | hse_responsibility |

### 8.2 数据准备清单

详见《Sprint6开发数据准备说明.md》

---

## 九、修订记录

| 版本 | 日期 | 修订内容 |
|:----:|------|----------|
| v1.0 | 2026-07-22 | 初始版本：Sprint6开发前最终收口设计<br>1. 统一三类责任类型：grid_leader/production_manager/none<br>2. 数据模型命名决策：hse_grid_responsibility → hse_responsibility<br>3. 确认员工关联链路：employee → employee_assignment → position → responsibility_type → responsibility_record<br>4. 确认花名册导入自动生成责任记录<br>5. 提供历史兼容方案（视图） |

---

**设计完成日期**：2026-07-22
**设计状态**：🔒 Sprint6开发依据（最终版）
**下一步**：Sprint6开发实施

# HSE预警权限模型修订报告

> **文档版本**：v1.1
> **修订范围**：HSE智能预警中心权限模型
> **修订性质**：增量修订（仅新增角色，不修改现有角色权限）
> **关联文档**：Sprint7 HSE智能预警中心设计报告（v1.0）、Sprint7最终冻结报告

---

## 一、修订背景

### 1.1 原权限模型

原 HSE 预警权限模型基于组织架构层级划分，共定义 6 种角色，覆盖从集团到片区的各级管理人员：

| 序号 | 角色代码 | 角色名称 |
|------|----------|----------|
| 1 | admin | 系统管理员 |
| 2 | safety_manager | 安全经理 |
| 3 | group_leader | 集团领导 |
| 4 | department_manager | 部门经理 |
| 5 | township_manager | 中心经理 |
| 6 | area_manager | 片区长 |

### 1.2 修订原因

随着 HSE 智能预警中心在基层网格单位的推广，发现现有权限模型在网格层面存在管理缺口：

- **网格管理空白**：原模型最细粒度止于片区（area）层级，网格层面无人工干预角色；
- **整改执行缺位**：片区长难以承担具体网格的日常整改任务处理，需要设置专职岗位；
- **人工班长需求**：网格实际运行中存在"人工班长"岗位，需具备本网格预警查看与整改任务处理权限。

### 1.3 修订版本

- **修订前版本**：v1.0
- **修订后版本**：v1.1
- **修订类型**：增量扩展

### 1.4 修订约束

本次修订遵循以下严格约束：

- **组织权限模型已冻结**，本次仅新增角色，不修改现有 6 种角色的任何权限；
- 员工风险模型、考核模型 v1.1、岗位风险权重、指标字典 v1.1 等其他冻结基线完全保持；
- 新增角色权限范围限定在本网格数据范围内，不向上越权。

---

## 二、新增角色定义

### 2.1 角色基础信息

| 项 | 值 |
|----|-----|
| 角色代码 | `administrator` |
| 角色名称 | 管理员（人工班长） |
| 权限层级 | grid（网格级） |
| 数据范围 | 本网格 |
| 角色定位 | 基层管理岗位，负责网格内预警查看和整改执行 |
| 引入版本 | v1.1 |
| 修订状态 | 已冻结 |

### 2.2 角色职责描述

`administrator` 角色对应基层网格中的人工班长岗位，主要承担以下职责：

1. **预警监控**：实时关注本网格范围内触发的预警记录；
2. **整改执行**：对本网格产生的整改任务进行开始处理、提交证明等执行操作；
3. **任务创建**：根据实际情况手动创建整改任务；
4. **任务下发**：对待处理整改任务进行下发分配。

> 该角色不具备复核、关闭、规则管理、扫描、升级等高权限操作能力。

---

## 三、权限定义

### 3.1 administrator 角色拥有的权限

| 序号 | 权限名称 | 操作描述 | 数据范围 |
|------|----------|----------|----------|
| 1 | 查看本网格预警 | 可查看 `org_id` 关联到本网格的预警记录 | 本网格 |
| 2 | 处理整改任务 | 可执行开始处理（`process`）、提交证明（`submit-proof`）操作 | 本网格 |
| 3 | 创建整改任务 | 可手动创建整改任务（`POST /tasks`） | 本网格 |
| 4 | 下发整改任务 | 可下发待处理任务（`PUT /tasks/:id/dispatch`） | 本网格 |

### 3.2 administrator 角色不拥有的权限

| 序号 | 受限权限 | 接口 | 允许角色 |
|------|----------|------|----------|
| 1 | 预警扫描 | `POST /warnings/scan` | 仅 `admin` / `safety_manager` |
| 2 | 预警升级检查 | `POST /warnings/escalate` | 仅 `admin` / `safety_manager` |
| 3 | 复核任务 | `PUT /tasks/:id/review` | 需 `admin` / `safety_manager` / `department_manager` / `township_manager` |
| 4 | 关闭任务 | `PUT /tasks/:id/close` | 仅 `admin` / `safety_manager` |
| 5 | 规则管理 | `CRUD /rules` | 仅 `admin` / `safety_manager` |

### 3.3 权限边界说明

- `administrator` 角色所有数据访问均被 `buildOrgFilter` 函数限制在 `filterType='grid'` 范围内；
- 跨网格数据访问一律拒绝；
- 复核与关闭链路完全屏蔽，确保整改责任与复核责任分离。

---

## 四、后端实现

### 4.1 getPermissionScope 函数新增

在 `server/routes/hse-warning-center.js` 的 `getPermissionScope` 函数中新增 `administrator` 角色映射：

```javascript
'administrator': { level: 'grid', canViewAll: false, filterType: 'grid' }
```

**说明**：

- `level: 'grid'`：标识该角色权限层级为网格级；
- `canViewAll: false`：不具备全局数据查看权限；
- `filterType: 'grid'`：数据过滤类型为本网格，由 `buildOrgFilter` 函数消费。

### 4.2 requireRole 调用更新

以下接口的 `requireRole` 中间件调用新增 `administrator` 角色：

| 接口 | 方法 | 原 requireRole | 修订后 requireRole |
|------|------|----------------|---------------------|
| 创建整改任务 | `POST /tasks` | `admin`、`safety_manager`、`department_manager`、`township_manager`、`area_manager` | 新增 `administrator` |
| 下发整改任务 | `PUT /tasks/:id/dispatch` | `admin`、`safety_manager`、`department_manager`、`township_manager`、`area_manager` | 新增 `administrator` |

### 4.3 数据过滤实现

`buildOrgFilter` 函数根据 `filterType='grid'` 进行数据过滤：

- 通过用户 `org_id` 关联到所属网格；
- 查询预警记录时，过滤条件限定为 `org_id = 当前用户网格 org_id`；
- 查询整改任务时，同样限定在本网格范围内。

### 4.4 未修改的后端逻辑

- 预警扫描、升级检查、复核、关闭、规则管理接口的 `requireRole` 完全保持原状，不包含 `administrator`；
- 现有 6 种角色的权限逻辑、数据范围、过滤规则均未修改。

---

## 五、前端实现

### 5.1 路由权限

在 `src/router/routes/modules/hse-advanced.ts` 中，`HseWarningCenter` 路由的 `authority` 数组新增 `administrator`：

```typescript
{
  path: 'warning-center',
  name: 'HseWarningCenter',
  component: ...,
  meta: {
    title: '预警与整改中心',
    authority: ['admin', 'safety_manager', 'group_leader',
                'department_manager', 'township_manager',
                'area_manager', 'administrator'],  // v1.1 新增
  },
}
```

### 5.2 菜单可见性

- `administrator` 角色用户登录后，可在左侧菜单看到"预警与整改中心"入口；
- 菜单顺序、图标、层级结构完全沿用 v1.0 配置，无视觉差异。

### 5.3 按钮控制

前端根据用户角色动态控制操作按钮显示：

| 按钮名称 | administrator 可见 | 说明 |
|----------|---------------------|------|
| 查看预警 | ✓ | 仅本网格数据 |
| 创建任务 | ✓ | 弹窗默认填充本网格 org_id |
| 下发任务 | ✓ | 仅对本网格任务可见 |
| 开始处理 | ✓ | 仅对本网格任务可见 |
| 提交证明 | ✓ | 仅对本网格任务可见 |
| 复核任务 | ✗ | 对 administrator 隐藏 |
| 关闭任务 | ✗ | 对 administrator 隐藏 |
| 规则管理 | ✗ | 对 administrator 隐藏 |
| 扫描预警 | ✗ | 对 administrator 隐藏 |
| 预警升级 | ✗ | 对 administrator 隐藏 |

---

## 六、完整权限矩阵（v1.1，7 种角色）

| 操作 | admin | safety_manager | group_leader | department_manager | township_manager | area_manager | administrator |
|------|-------|----------------|--------------|--------------------|--------------------|--------------|---------------|
| 查看预警(全部) | ✓ | ✓ | ✓ | - | - | - | - |
| 查看预警(本部门) | ✓ | ✓ | ✓ | ✓ | - | - | - |
| 查看预警(本中心) | ✓ | ✓ | ✓ | ✓ | ✓ | - | - |
| 查看预警(本片区) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | - |
| 查看预警(本网格) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 扫描预警 | ✓ | ✓ | - | - | - | - | - |
| 预警升级 | ✓ | ✓ | - | - | - | - | - |
| 创建任务 | ✓ | ✓ | - | ✓(本部门) | ✓(本中心) | ✓(本片区) | ✓(本网格) |
| 下发任务 | ✓ | ✓ | - | ✓(本部门) | ✓(本中心) | ✓(本片区) | ✓(本网格) |
| 处理任务 | ✓ | ✓ | - | ✓ | ✓ | ✓ | ✓ |
| 提交证明 | ✓ | ✓ | - | ✓ | ✓ | ✓ | ✓ |
| 复核任务 | ✓ | ✓ | - | ✓(本部门) | ✓(本中心) | - | - |
| 关闭任务 | ✓ | ✓ | - | - | - | - | - |
| 规则管理 | ✓ | ✓ | - | - | - | - | - |

### 6.1 矩阵说明

- `✓` 表示具备该权限；
- `✓(本部门/本中心/本片区/本网格)` 表示具备该权限但数据范围受层级限制；
- `-` 表示不具备该权限；
- `administrator` 列为 v1.1 新增，其余 6 列与 v1.0 完全一致。

---

## 七、数据范围层级

| 层级代码 | 层级名称 | 说明 | 关联角色 |
|----------|----------|------|----------|
| all | 全局 | 可查看所有数据 | admin、safety_manager |
| group | 集团 | 可查看所有数据 | group_leader |
| department | 部门 | 仅本部门数据 | department_manager |
| township | 中心/乡镇 | 仅本中心数据 | township_manager |
| area | 片区 | 仅本片区数据 | area_manager |
| grid | 网格 | 仅本网格数据（v1.1 新增） | administrator |

### 7.1 层级继承关系

数据范围遵循"上层包含下层"原则：

```
all ⊃ group ⊃ department ⊃ township ⊃ area ⊃ grid
```

- `admin`、`safety_manager` 可查看所有层级数据；
- `group_leader` 可查看集团下所有部门、中心、片区、网格数据；
- 依此类推，`administrator` 仅能查看本网格数据，为最低数据范围。

---

## 八、冻结基线确认

| 冻结项 | 修订前 | 修订后 | 状态 |
|--------|--------|--------|------|
| 组织权限模型 | 6 种角色 | 7 种角色（新增 administrator） | ✅ 仅新增，未修改现有角色 |
| 员工风险模型 | - | - | ✅ 未修改 |
| 考核模型 v1.1 | - | - | ✅ 未修改 |
| 岗位风险权重 | - | - | ✅ 未修改 |
| 指标字典 v1.1 | - | - | ✅ 未修改 |

### 8.1 冻结确认结论

本次修订严格遵守"仅新增不修改"原则：

1. 现有 6 种角色的权限定义、数据范围、接口访问权限完全保持原状；
2. 现有 6 种角色的前端路由、菜单、按钮可见性完全保持原状；
3. 仅通过新增 `administrator` 角色及其权限映射，完成网格层面管理岗位的补齐；
4. 所有冻结基线均未受到任何影响，可安全进入 Sprint7 正式开发阶段。

---

## 九、修订记录

| 版本 | 日期 | 修订内容 | 修订人 |
|------|------|----------|--------|
| v1.0 | - | 初始权限模型，6 种角色 | - |
| v1.1 | 2025 年 | 新增 `administrator`（人工班长）角色，权限层级为 grid，具备本网格预警查看与整改执行权限 | Sprint7-A-1 |

---

> 本报告作为 Sprint7-A-1 冻结修订交付物之一，与《Sprint7最终冻结报告.md》共同构成权限模型 v1.1 的完整冻结依据。

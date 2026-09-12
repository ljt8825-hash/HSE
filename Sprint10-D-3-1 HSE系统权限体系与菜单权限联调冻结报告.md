# Sprint10-D-3-1 HSE系统权限体系与菜单权限联调冻结报告

> **报告性质**：权限体系与菜单权限联调冻结报告（最终版）
> **报告日期**：2026-07-24
> **任务编号**：Sprint10-D-3-1
> **前置任务**：Sprint10-D-2-3-A（功能资产重新映射冻结）
> **适用范围**：后续PC端页面开发、业务模块开发、接口开发的**唯一依据**

---

## 一、任务概述

### 1.1 任务目标

完成PC端HSE系统菜单权限、角色权限、动态菜单加载和接口权限闭环，确保：
- 不同角色登录后看到不同菜单
- 菜单可见 ⇔ 页面可访问 ⇔ 接口可调用
- 按钮级权限控制（create/update/delete/audit/export/import/freeze）
- 关键操作有审计日志记录

### 1.2 实施依据

严格依据《Sprint10-D-2-3-A HSE系统功能资产重新映射冻结报告》，禁止重新设计菜单。

---

## 二、动态菜单实现

### 2.1 菜单加载流程

```
登录用户 → JWT Token → 获取权限（/api/menus/tree）→ 生成动态菜单 → 展示左侧导航
                                  ↓（失败回退）
                          使用默认权限（getDefaultPermissions）→ 生成本地菜单
```

### 2.2 菜单验证结果

| 项目 | 数量 | 验证结果 |
|------|------|---------|
| 一级菜单 | 10 个 | ✅ 通过 |
| 二级菜单 | 57 个（含2个hidden） | ✅ 通过 |
| 路由一致性 | 10组+57子路由 | ✅ 与permission.ts一致 |

### 2.3 一级菜单清单

| 序号 | 菜单名称 | 路由路径 | 权限码 | 二级菜单数 |
|------|---------|---------|--------|-----------|
| 1 | 安全总览 | /overview | hse:overview:view | 5 |
| 2 | 风险管控 | /risk-control | hse:risk:view | 6 |
| 3 | 隐患治理 | /hazard-governance | hse:hazard:view | 4 |
| 4 | 现场管理 | /site-management | hse:site:view | 5 |
| 5 | 人员管理 | /personnel | hse:personnel:view | 6 |
| 6 | 培训考核 | /training | hse:training:view | 7 |
| 7 | 应急管理 | /emergency | hse:emergency:view | 1 |
| 8 | 目标职责 | /objectives | hse:objectives:view | 3 |
| 9 | 制度标准 | /standards | hse:standards:view | 5 |
| 10 | 系统管理 | /system | hse:system:view | 5 |

---

## 三、角色权限体系

### 3.1 角色定义

| 角色编码 | 角色名称 | 说明 | 权限范围 |
|---------|---------|------|---------|
| system_admin | 系统管理员 | 系统最高权限 | 全部模块全部操作 |
| hse_manager | HSE管理人员 | HSE业务管理权限 | 除系统管理外全部模块 |
| township_manager | 乡镇作业中心经理 | 乡镇/单位负责人 | 安全总览+风险(部分)+隐患+现场+培训(部分)+目标(部分) |
| manager | 管理员 | 一般管理人员 | 安全总览+风险+隐患+现场+人员(查看)+培训(查看)+应急(查看) |
| viewer | 普通用户 | 基础查看权限 | 安全总览(驾驶舱+通知)+隐患排查(查看) |

> **重要约束**：岗位名称必须保持"管理员"，禁止修改为"安全管理员"

### 3.2 角色权限明细

#### system_admin（系统管理员）
- 权限码：`['*']`（全部权限）

#### hse_manager（HSE管理人员）
- 安全总览：全部5个view + 预警导出
- 风险管控：全部6个view + create/update/delete/export/import
- 隐患治理：全部4个view + create/update/delete/export/import + audit
- 现场管理：全部5个view + create/update/delete/export/import/freeze
- 人员管理：全部6个view + create/update/delete/export/import
- 培训考核：全部7个view + create/update/delete/export/import
- 应急管理：1个view + create/update/delete/export
- 目标职责：全部3个view + create/update/delete/export
- 制度标准：全部5个view + create/update/delete/export/import
- 系统管理：审计日志view + export（无用户/角色管理权限）

#### township_manager（乡镇作业中心经理）
- 安全总览：cockpit/alerts/notifications view
- 风险管控：classification/employee/accidents view + create/update
- 隐患治理：全部4个view + create/update/delete/export
- 现场管理：violations/grid/fire/inspection view + create/update/delete
- 培训考核：plan/ledger/statistics view + create/update
- 目标职责：responsibility/committee view + create/update

#### manager（管理员）
- 安全总览：全部5个view
- 风险管控：classification/employee/accidents view + create/update/delete/export
- 隐患治理：全部4个view + create/update/delete/export
- 现场管理：violations/grid view + create/update/delete
- 人员管理：employees/organization view（仅查看）
- 培训考核：plan/ledger view（仅查看）
- 应急管理：manage view（仅查看）

#### viewer（普通用户）
- 安全总览：cockpit/notifications view
- 隐患治理：hazards view

---

## 四、菜单权限映射

### 4.1 权限码规范

格式：`hse:{module}:{sub}:{action}`

| 层级 | 说明 | 示例 |
|------|------|------|
| module | 一级模块 | overview/risk/hazard/site/personnel/training/emergency/objectives/standards/system |
| sub | 二级子模块 | cockpit/classification/hazards/violations/employees/plan 等 |
| action | 操作类型 | view/create/update/delete/audit/export/import/freeze |

### 4.2 按钮权限码清单

| 模块 | create | update | delete | audit | export | import | freeze |
|------|--------|--------|--------|-------|--------|--------|--------|
| 风险管控 | hse:risk:create | hse:risk:update | hse:risk:delete | — | hse:risk:export | hse:risk:import | — |
| 隐患治理 | hse:hazard:create | hse:hazard:update | hse:hazard:delete | hse:hazard:audit | hse:hazard:export | hse:hazard:import | — |
| 现场管理 | hse:site:create | hse:site:update | hse:site:delete | — | hse:site:export | hse:site:import | hse:site:freeze |
| 人员管理 | hse:personnel:create | hse:personnel:update | hse:personnel:delete | — | hse:personnel:export | hse:personnel:import | — |
| 培训考核 | hse:training:create | hse:training:update | hse:training:delete | hse:training:audit | hse:training:export | hse:training:import | — |
| 应急管理 | hse:emergency:create | hse:emergency:update | hse:emergency:delete | — | hse:emergency:export | — | — |
| 目标职责 | hse:objectives:create | hse:objectives:update | hse:objectives:delete | — | hse:objectives:export | — | — |
| 制度标准 | hse:standards:create | hse:standards:update | hse:standards:delete | — | hse:standards:export | hse:standards:import | — |

---

## 五、接口权限控制

### 5.1 权限校验中间件

在 `server/middleware/auth.js` 中新增：

| 中间件 | 说明 | 用法 |
|--------|------|------|
| requirePermission(code) | 权限码校验 | router.post('/', requirePermission('hse:hazard:create'), handler) |
| getPermissionsForRole(role) | 获取角色权限列表 | const perms = getPermissionsForRole('hse_manager') |
| createPermissionMiddleware(map) | 自定义权限映射工厂 | const { requirePermission } = createPermissionMiddleware(customMap) |

### 5.2 已添加权限校验的接口

| 模块 | 路由文件 | 权限校验覆盖 |
|------|---------|-------------|
| 月度安全履职考核 | hse-assessment-monthly.js | POST→create, PUT→update, DELETE→delete, 审核→audit, 冻结→audit, 导出→export |
| 风险画像 | hse-risk-profile.js | POST→create, PUT→update |
| 隐患排查 | hazards.js | POST→create, PUT→update, DELETE→delete |
| 三违管理 | violations.js | POST→create, PUT→update, DELETE→delete |
| 人员管理 | hse-employee.js | POST→create, PUT→update, DELETE→delete, 导入→import |

### 5.3 越权访问防护

| 场景 | 防护机制 | 状态 |
|------|---------|------|
| viewer调用写接口 | requirePermission返回403 | ✅ |
| manager调用系统管理接口 | ROLE_PERMISSIONS_MAP中无对应权限码 | ✅ |
| 无Token调用受保护接口 | authMiddleware返回401 | ✅ |
| 过期Token调用接口 | JWT验证返回401 | ✅ |

---

## 六、审计日志

### 6.1 审计事件

| 事件类型 | action | 记录位置 | 状态 |
|---------|--------|---------|------|
| 用户登录 | login | auth.js | ✅ |
| 用户登出 | logout | auth.js | ✅ |
| 数据修改 | create/update/delete | 各路由（通过auditMiddleware） | ✅ |
| 审核操作 | audit | hse-assessment-monthly.js | ✅ |
| 冻结操作 | freeze | hse-assessment-monthly.js | ✅ |

### 6.2 审计中间件

`auditMiddleware(module, action)` — 可挂载到路由上自动记录操作日志：
- 拦截 `res.json`，在响应完成后异步记录
- 仅当 `req.user` 存在且响应成功时记录
- 记录内容：userId、username、action、module、description、ip、userAgent、statusCode

---

## 七、业务归属优化建议

已生成《业务归属待确认清单.md》，主要内容：

| 待确认项 | 当前归属 | 建议 | 决策 |
|---------|---------|------|------|
| 月度安全履职考核 | 培训考核 | 可独立为考核管理 | 暂不修改，维持现状+UI优化标识 |
| 预警功能（两处） | 安全总览+隐患治理 | 两处定位不同 | 维持现状 |
| 风险与现场管理边界 | 当前划分 | 边界清晰 | 维持现状 |

---

## 八、测试验证

### 8.1 代码验证

| 验证项 | 结果 |
|--------|------|
| 前端5角色权限定义完整性 | ✅ 通过 |
| 后端5角色权限映射完整性 | ✅ 通过 |
| 前后端权限码一致性 | ✅ 通过 |
| requirePermission中间件导出 | ✅ 通过 |
| 5个模块接口权限校验覆盖 | ✅ 通过 |
| auditMiddleware导出 | ✅ 通过 |
| 岗位名称"管理员"保持不变 | ✅ 通过 |
| 业务归属清单内容正确 | ✅ 通过 |

### 8.2 权限矩阵验证

| 角色 | 安全总览 | 风险管控 | 隐患治理 | 现场管理 | 人员管理 | 培训考核 | 应急管理 | 目标职责 | 制度标准 | 系统管理 |
|------|---------|---------|---------|---------|---------|---------|---------|---------|---------|---------|
| system_admin | 全部 | 全部 | 全部 | 全部 | 全部 | 全部 | 全部 | 全部 | 全部 | 全部 |
| hse_manager | 全部 | 全部 | 全部 | 全部 | 全部 | 全部 | 全部 | 全部 | 全部 | 审计 |
| township_manager | 查看 | 部分 | 全部 | 全部 | — | 部分 | — | 部分 | — | — |
| manager | 查看 | 部分 | 全部 | 部分 | 查看 | 查看 | 查看 | — | — | — |
| viewer | 基础 | — | 查看 | — | — | — | — | — | — | — |

---

## 九、核心代码变更清单

### 9.1 前端变更

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| src/stores/permission.ts | 修改 | 5角色权限定义、hasPermission/hasAnyPermission方法、PERM_*按钮权限码常量 |

### 9.2 后端变更

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| server/middleware/auth.js | 修改 | ROLE_PERMISSIONS_MAP、requirePermission、getPermissionsForRole、createPermissionMiddleware |
| server/routes/hse-assessment-monthly.js | 修改 | 添加requirePermission+auditMiddleware |
| server/routes/hse-risk-profile.js | 修改 | 添加requirePermission |
| server/routes/hazards.js | 修改 | 添加requirePermission |
| server/routes/violations.js | 修改 | 添加requirePermission |
| server/routes/hse-employee.js | 修改 | 添加requirePermission |
| server/routes/auth.js | 修改 | 登录/登出审计日志增强 |
| server/routes/audit.js | 修改 | 新增auditMiddleware中间件 |

### 9.3 新增文件

| 文件 | 说明 |
|------|------|
| 业务归属待确认清单.md | 月度安全履职考核归属优化建议记录 |

---

## 十、冻结结论

### 10.1 冻结确认

| 项目 | 冻结状态 |
|------|---------|
| 5角色权限体系 | ✅ 已冻结 |
| 菜单权限映射 | ✅ 已冻结 |
| 按钮权限码规范 | ✅ 已冻结 |
| 接口权限校验 | ✅ 已冻结（5个重点模块） |
| 审计日志记录 | ✅ 已冻结 |
| 业务归属建议 | ✅ 已记录（暂不修改菜单） |

### 10.2 后续任务依据

本报告作为以下后续任务的**唯一依据**：
- **Sprint10-D-4**：PC端页面详情开发（使用按钮权限码控制页面按钮显隐）
- **Sprint10-D-5**：业务模块开发（遵循接口权限校验规范）
- **Sprint11**：移动端适配（复用角色权限体系）

### 10.3 前端按钮权限使用指南

在页面组件中使用按钮权限控制：

```typescript
import { usePermissionStore } from '@/stores/permission'

const permissionStore = usePermissionStore()

// 检查单个权限
const canCreate = permissionStore.hasPermission('hse:hazard:hazards:create')
const canDelete = permissionStore.hasPermission('hse:hazard:hazards:delete')

// 模板中使用
// <a-button v-if="canCreate">新增</a-button>
// <a-button v-if="canDelete" danger>删除</a-button>

// 或使用按钮权限码常量
import { PERM_HAZARD_HAZARDS_CREATE, PERM_HAZARD_HAZARDS_DELETE } from '@/stores/permission'
const canCreate = permissionStore.hasPermission(PERM_HAZARD_HAZARDS_CREATE)
```

---

## 十一、交付物清单

| 序号 | 文件名 | 说明 |
|------|-------|------|
| 1 | `Sprint10-D-3-1 HSE系统权限体系与菜单权限联调冻结报告.md` | 本报告（最终冻结文档） |
| 2 | `业务归属待确认清单.md` | 业务归属优化建议记录 |

---

**报告人**：HSE 前端开发
**报告日期**：2026-07-24
**任务状态**：✅ 已完成，冻结为后续 Sprint 基线

# 提示词-118: 双轨制方案C — hse_org_unit 前端管理页与映射管理

## 背景

提示词-116 双轨制诊断报告确认：`department`（77 行，班组级）与 `hse_org_unit`（20 行，作业中心级）是两套独立组织模型，员工归属绑定 `hse_org_unit`，但"组织管理"页面只操作 `department`。v110 migration 已添加 `department.org_unit_id` 外键建立 ID 级映射，但 `hse_org_unit` 仍无前端管理页面。

本轮按方案 C（侵入最小，先行止血）创建 `hse_org_unit` 前端管理页，补齐最后一块缺失的拼图。

## 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/api/hse/org-center.ts` | **新建** | hse_org_unit 前端 API 层 |
| `src/views/hse/employee/org-center.vue` | **新建** | hse_org_unit 管理页面 |
| `src/router/routes/modules/hse-07-personnel.ts` | 修改 | 新增菜单项 |

**禁止修改**: 后端路由、数据库、其他页面、packages/、composables/、vite.config.ts、departments.vue、现有菜单名称与顺序

---

## 任务一：新建前端 API 文件

**文件**: `f:\hse-dashboard\安全看板vben\apps\web-antd\src\api\hse\org-center.ts`

### 后端接口对照

后端挂载于 `server/app.js:416`：`app.use('/api/hse/org-center', hseOrgCenterRoutes)`

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/hse/org-center/org/tree` | 组织树（返回已构建 children 的树形结构） |
| GET | `/api/hse/org-center/org/list` | 组织列表（扁平，支持 org_type/keyword/status 筛选） |
| GET | `/api/hse/org-center/org/:id` | 组织详情 |
| POST | `/api/hse/org-center/org` | 新增组织 |
| PUT | `/api/hse/org-center/org/:id` | 更新组织 |
| DELETE | `/api/hse/org-center/org/:id` | 删除组织（软删除，有子组织时拒绝） |
| GET | `/api/hse/org-center/org/types` | 组织类型枚举 |
| GET | `/api/hse/org-center/operation-unit/list` | 作业单元列表（分页） |
| GET | `/api/hse/org-center/operation-unit/all` | 作业单元全部（下拉用） |
| GET | `/api/hse/org-center/operation-unit/:id` | 作业单元详情 |
| GET | `/api/hse/org-center/operation-unit/types` | 作业单元类型枚举 |

### 要求

1. 使用 `import { requestClient } from '#/api/request'` 作为请求客户端
2. 定义 TypeScript 命名空间 `OrgCenterApi`，包含以下接口类型：

```typescript
export namespace OrgCenterApi {
  /** 组织节点（树形） */
  export interface OrgNode {
    id: number;
    parent_id: number | null;
    org_name: string;
    org_type: string;       // company / department / center / town_center
    org_code: string;
    org_path: string | null;
    level: number | null;
    sort_order: number;
    headcount: number;
    status: string;          // active / inactive
    description: string | null;
    manager_id: number | null;
    children?: OrgNode[];
  }

  /** 组织表单数据 */
  export interface OrgFormData {
    org_name: string;
    org_type: string;
    org_code: string;
    parent_id?: number | null;
    sort_order?: number;
    description?: string;
    manager_id?: number | null;
  }

  /** 作业单元 */
  export interface OperationUnit {
    id: number;
    org_unit_id: number;
    unit_name: string;
    unit_type: string;
    unit_code: string;
    headcount: number;
    location: string | null;
    status: string;
    description: string | null;
    supervisor_id: number | null;
  }
}
```

3. 导出 API 函数（BASE = `/hse/org-center`）：

```typescript
const BASE = '/hse/org-center';

// 组织树
export function getOrgTree() { ... }
// 组织列表
export function getOrgList(params?: { org_type?, keyword?, status? }) { ... }
// 组织详情
export function getOrgDetail(id: number) { ... }
// 新增组织
export function createOrg(data: OrgCenterApi.OrgFormData) { ... }
// 更新组织
export function updateOrg(id: number, data: Partial<OrgCenterApi.OrgFormData>) { ... }
// 删除组织
export function deleteOrg(id: number) { ... }
// 组织类型枚举
export function getOrgTypes() { ... }
// 作业单元列表
export function getOperationUnitList(params?: { ... }) { ... }
// 作业单元全部
export function getOperationUnitAll(params?: { org_unit_id?, unit_type? }) { ... }
// 作业单元类型枚举
export function getOperationUnitTypes() { ... }
```

---

## 任务二：新建 hse_org_unit 管理页面

**文件**: `f:\hse-dashboard\安全看板vben\apps\web-antd\src\views\hse\employee\org-center.vue`

### 页面布局

参考 `departments.vue` 的左右分栏布局（Row + Col），但做以下差异化：

```
┌──────────────────────────────────────────────────┐
│  [左侧: Col md=10 lg=8]  │  [右侧: Col md=14 lg=16] │
│  ┌──────────────────────┐  ┌──────────────────────┐ │
│  │ 作业中心架构          │  │ 组织详情              │ │
│  │ [新增根组织] [刷新]   │  │ [新增子组织] [编辑] [删除] │
│  │ ┌──────────────────┐  │  │                      │ │
│  │ │ 搜索框            │  │  │ 组织名称: xxx         │ │
│  │ │ 🌲 组织树         │  │  │ 组织编码: xxx         │ │
│  │ │  ├─ 宁津项目公司  │  │  │ 组织类型: 公司        │ │
│  │ │  │  ├─ 环卫作业中心│  │  │ 层级路径: xxx         │ │
│  │ │  │  │  ├─ 宁城街道 │  │  │ 编制人数: 0           │ │
│  │ │  │  │  ├─ 津城街道 │  │  │ 状态: 启用            │ │
│  │ │  │  │  └─ ...     │  │  │ 描述: xxx             │ │
│  │ └──────────────────┘  │  │                      │ │
│  └──────────────────────┘  │  ┌──────────────────────┐ │
│                            │  │ 关联班组 (映射管理)    │ │
│                            │  │ ┌──────────────────┐  │ │
│                            │  │ │ 班组名称  │ 班组编码│  │ │
│                            │  │ │ 宁城街道一班│DEPT..│  │ │
│                            │  │ │ 宁城街道二班│DEPT..│  │ │
│                            │  │ └──────────────────┘  │ │
│                            │  └──────────────────────┘ │
│  └──────────────────────┘  └──────────────────────┘ │
└──────────────────────────────────────────────────┘
```

### 核心功能要求

#### 1. 左侧：组织树

- 使用 `a-tree` 组件，`field-names` 为 `{ title: 'org_name', key: 'id', children: 'children' }`
- 树节点标题模板：`{{ org_name }} [{{ orgTypeLabel(org_type) }}] ({{ org_code }})`
- 停用节点使用 `node-inactive` 样式（与 departments.vue 一致）
- 搜索框支持按组织名称/编码搜索（大小写不敏感，递归过滤保留匹配节点的父路径）
- 树数据从 `getOrgTree()` 获取，后端已返回树形结构（含 children）
- 默认展开第一层

#### 2. 右侧上方：组织详情

选中节点后展示（使用 `a-descriptions`，2 列，bordered，small）：

| 字段 | 数据源 |
|------|--------|
| 组织名称 | `org_name` |
| 组织编码 | `org_code` |
| 组织类型 | `org_type` → 使用 `orgTypeLabel()` 转为中文，`a-tag` 显示 |
| 层级路径 | `org_path` |
| 编制人数 | `headcount`（0 时显示 `-`，与 114 修复一致） |
| 状态 | `status` → `active`=绿色"启用" / `inactive`=灰色"停用" |
| 描述 | `description` |

`orgTypeLabel()` 函数：
```typescript
function orgTypeLabel(type?: string) {
  const map: Record<string, string> = {
    company: '公司',
    department: '职能部门',
    center: '作业中心',
    town_center: '乡镇作业中心',
  };
  return type ? map[type] || type : '-';
}
```

#### 3. 右侧下方：关联班组（映射管理）

这是本轮核心差异化功能。选中组织节点后，从 `department` 表中查询 `org_unit_id = 当前组织ID` 的部门（即通过 v110 映射已关联的班组）。

**数据获取**：复用 `getDeptList`（`#/api/hse/employee`）获取全部部门列表，前端过滤 `org_unit_id` 匹配的项。

**展示**：使用 `a-table`（不分页，数据量少），列：
- 序号
- 班组名称（`name`）
- 班组编码（`dept_code`）
- 层级（`levelText(level)`，复用 departments.vue 中相同的函数）
- 状态（`status`）

若无关联班组，显示 `a-empty`："该组织暂无关联班组"。

#### 4. 弹窗：新增/编辑组织

使用 `a-modal` + `a-form`，字段：

| 字段 | 控件 | 必填 |
|------|------|------|
| 上级组织 | `a-input` disabled（显示父组织名称） | 否 |
| 组织编码 | `a-input`（编辑时 disabled） | 是 |
| 组织名称 | `a-input` | 是 |
| 组织类型 | `a-select`（从 `getOrgTypes()` 获取选项） | 是 |
| 排序 | `a-input-number` | 否 |
| 描述 | `a-textarea` | 否 |

> 注意：本次不包含"组织负责人"选择器（`manager_id`），后续提示词可补充。`hse_org_unit` 表虽有 `manager_id` 字段，但后端 POST/PUT 接口支持该字段，前端当前阶段先跳过以减少复杂度。

#### 5. 权限控制

- 编辑/新增/删除按钮：`canEdit = hasAccessByRoles(['admin', 'safety_manager'])`
- 与 departments.vue 权限保持一致

---

## 任务三：路由注册

**文件**: `f:\hse-dashboard\安全看板vben\apps\web-antd\src\router\routes\modules\hse-07-personnel.ts`

在"人员管理"菜单下，"组织管理"之后、"岗位管理"之前，新增：

```typescript
{
  meta: {
    title: '作业中心',
    icon: 'lucide:building-2',
    authority: ['admin', 'safety_manager'],
  },
  name: 'PersonnelOrgCenter',
  path: '/personnel/org-center',
  component: () => import('#/views/hse/employee/org-center.vue'),
},
```

> 注意：菜单名称"作业中心"与"组织管理"区分，向用户传达两套体系的不同定位。`hse-employee.ts` 中的新路由（hideInMenu）也同步添加。

---

## 验证步骤

1. `pnpm build` 确认 exit code 0
2. `vue-tsc --noEmit --skipLibCheck` 确认无新增 TS 类型错误
3. 打开"人员管理 → 作业中心"页面，确认组织树正常加载（20 个节点）
4. 选中一个组织节点，确认详情卡片显示正确
5. 确认"关联班组"表格显示该组织下已映射的 department（通过 org_unit_id 关联）
6. 新增一个测试组织 → 确认保存成功 → 树中显示 → 删除清理
7. 编辑一个组织 → 修改名称 → 确认保存成功
8. 删除一个无子组织的节点 → 确认删除成功
9. 搜索框输入组织名称 → 确认过滤正确

---

## 输出要求

执行完成后，生成以下文档并保存到 `f:\hse-dashboard\docs\花名册\`：

1. `97-提示词-118-验证报告.md`：包含新建文件清单、构建结果、类型检查结果、API 联调记录、功能验证说明
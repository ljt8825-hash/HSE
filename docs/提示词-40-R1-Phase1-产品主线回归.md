# 提示词 40：R1-Phase1 收尾 → 产品主线回归

> 编号：提示词-40
> 日期：2026-07-30
> 状态：待执行
> 前置：P1 技术债清理终态报告（`R1-Phase1-P1-技术债清理-终态报告.md`）✅
> 关联：`R1-Phase1-终态报告.md`、`Q6-Sprint-Q消费层终态报告.md`

---

## 0. 背景

Sprint-Q（Q1→Q6，6 轮）+ R1-Phase1（29→35，7 轮）+ P1 技术债清理（37→39，3 轮 + 收尾），**共 17 轮迭代**。P1 技术债全部清理完毕，R1-Phase1 的 22 项交付物、26 项链路验证全部通过。

当前状态：**后端 P0-1/P0-2/P0-3 已生产部署、前端消费层已切换、跨模块 WS 事件驱动已就绪、P1 技术债已清零**。产品主线待推进。

---

## 1. 任务 A：人工浏览器回归验证（🔴 优先）

### 1.1 背景

P1 技术债清理最后一轮修复了 `emergency/index.vue` 的 `responsiblePersonId` 类型告警（`null → undefined`），以及 `accidents/index.vue` 和 `emergency/index.vue` 的 `as any` 移除。由于登录页滑块验证码阻断自动化，需人工在浏览器中验证。

### 1.2 验证清单

| # | 模块 | 验证点 | 操作方法 |
|---|------|--------|----------|
| A-1 | 事故管理 | 创建/编辑事故时，`EmployeeSelector` 选择处理人员是否正常 | 点击"新增事故"→ 在处理人员字段搜索员工 → 确认下拉列表正常、选中后回显正确 |
| A-2 | 事故管理 | 事故详情中 `EmployeeName` 是否正常显示处理人员 | 点击任意事故记录"查看"→ 确认处理人员字段显示为可点击的 EmployeeName 组件 |
| A-3 | 事故管理 | 事故列表编辑模态框打开时 `handlerId` 是否正常回填 | 点击任意事故"编辑"→ 确认处理人员 EmployeeSelector 已回填正确人员 |
| A-4 | 应急管理 | 创建/编辑应急预案时，`EmployeeSelector` 选择负责人是否正常 | 点击"新增预案"→ 在负责人字段搜索 → 确认下拉正常、选中回显正确 |
| A-5 | 应急管理 | 预案列表 `EmployeeName` 是否正常显示负责人 | 查看预案列表 → 确认负责人列显示为 EmployeeName 组件 |
| A-6 | 应急管理 | 预案编辑时 `responsiblePersonId` 是否正常回填 | 点击任意预案"编辑"→ 确认负责人 EmployeeSelector 已回填正确人员 |
| A-7 | 应急管理 | 浏览器控制台无 `emergency(350)` 类型告警 | 打开 DevTools → 进入应急管理页面 → 操作创建/编辑 → 确认无 TS 类型告警 |

### 1.3 通过标准

7 项验证全部通过，无 UI 异常、无控制台报错。

---

## 2. 任务 B：产品主线现状回顾

### 2.1 已完成基础设施

当前「花名册为基石打通各模块交互」的基础设施已就位：

```
employee 表（主数据）
  ├── P0-1：批量端点 GET/POST /api/hse/employee/employees/batch
  │     → 前端 getEmployeesByIds → mapEmployeeItemToInfo → EmployeeInfo
  │     → EmployeeName 组件（可点击链接 + Tooltip 卡片）
  │
  ├── P0-2：事件系统 EMPLOYEE_TRANSFERRED/RESIGNED/STATUS_CHANGED/INFO_UPDATED
  │     → employeeEventService（环形缓冲 + 10s 去重）
  │     → WS 双层包裹广播 → useHseWebSocket → 进程内事件总线
  │     → useEmployeeData 缓存失效 + refresh（跨模块联动）
  │
  └── P0-3：业务表外键落库
        ├── hazards.checker_id/fixer_id → EmployeeName
        ├── accidents.handler_id → EmployeeSelector + EmployeeName
        └── emergency_plans.responsible_person_id → EmployeeName
```

### 2.2 当前产品缺口

| # | 缺口 | 影响 | 优先级 |
|---|------|------|--------|
| 1 | `/hse/employee/:id` 主档案页未开发 | `EmployeeName` 点击后跳转 `risk-profile`（非员工详情页），无法查看完整员工档案 | 🔴 P2（R1 终态报告 §E.3 #5） |
| 2 | `accidents` reporter 仍为纯文本 Input | 事故报告人无法使用 EmployeeSelector，数据一致性弱于其他人员字段 | 🟡 P2（R1 终态报告 §E.3 #6） |
| 3 | 前端未实现 WS 轮询兜底 | 若 WS 断连，跨模块事件驱动失效，EmployeeName 不会自动刷新 | 🟡 P2（R1 终态报告 §E.3 #7） |
| 4 | 回填策略仅四级（编号→数字ID→姓名→模糊） | 历史数据 `*Id` 命中率 0%（多人员拼接/占位符），需 v1.2 增强 | 🟢 P2（R1 终态报告 §E.3 #8） |

### 2.3 本次范围

**本次聚焦缺口 #1**：开发 `/hse/employee/:id` 主档案页，使 EmployeeName 点击跳转至真实员工详情页，真正实现「花名册为基石打通各模块交互」。

缺口 #2~#4 后续独立任务处理。

---

## 3. 任务 C：`/hse/employee/:id` 主档案页开发

### 3.1 目标

当用户在任何模块点击 EmployeeName 组件时，跳转到 `/hse/employee/:id` 路由，展示该员工的完整档案信息。

### 3.2 路由设计

```
/hse/employee/:id  →  EmployeeProfilePage（员工主档案页）
```

- 路由参数 `id`：员工 ID（数字，需添加数字校验，遵循项目约束）
- 页面组件：`src/views/hse/employee/ProfilePage.vue`（新建）
- 菜单归属：不新增菜单项（为内部跳转路由，从 EmployeeName 组件 `openProfile` 进入）

### 3.3 页面需求

#### 3.3.1 基本信息卡片

| 字段 | 来源 | 说明 |
|------|------|------|
| 姓名 | `employee.name` | 大标题 |
| 员工编号 | `employee.employee_code` | 副标题 |
| 性别 | `employee.gender` | 男/女 |
| 年龄 | 由 `employee.birth_date` 计算 | `EXTRACT(YEAR FROM AGE(birth_date))` |
| 身份证号 | `employee.id_card` | 已解密（脱敏显示：前 6 + 后 4，中间星号） |
| 联系电话 | `employee.phone` | 已解密 |
| 入职日期 | `employee.hire_date` | 格式 YYYY-MM-DD |
| 在职状态 | `employee_assignment.assignment_status` | 在职/离职（Tag 语义色） |

#### 3.3.2 组织与岗位卡片

| 字段 | 来源 | 说明 |
|------|------|------|
| 所属组织 | `hse_org_unit.unit_name` | 通过 `employee_assignment.org_unit_id` JOIN |
| 组织类型 | `hse_org_unit.unit_type` | 部门/班组/公司 |
| 岗位 | `position.name` | 通过 `employee_assignment.position_id` JOIN |
| 运营单位 | `hse_operation_unit.unit_name` | 通过 `employee_assignment.operation_unit_id` JOIN |

#### 3.3.3 关联业务数据卡片（Tab 切换）

| Tab | 内容 | 数据来源 |
|-----|------|----------|
| 隐患记录 | 该员工作为 checker/fixer 的隐患列表（分页） | `GET /api/hse/hazards?checkerId=:id` / `?fixerId=:id` |
| 事故记录 | 该员工作为 handler 的事故列表（分页） | `GET /api/hse/accidents?handlerId=:id` |
| 应急管理 | 该员工作为 responsiblePerson 的预案列表（分页） | `GET /api/hse/emergency/plans?responsiblePersonId=:id` |
| 培训记录 | 该员工的培训记录（分页） | `GET /api/hse/training?employeeId=:id`（如有） |
| 三违记录 | 该员工的三违记录（分页） | `GET /api/hse/violations?employeeId=:id`（如有） |

> **注意**：关联业务 Tab 采用**渐进式加载**（切换 Tab 时才请求数据），避免一次性加载全部数据。

### 3.4 后端 API

#### 3.4.1 新增端点：`GET /api/hse/employee/employees/:id/profile`

获取员工完整档案信息（基本信息 + 组织岗位 + 关联业务统计）。

**请求**：
```
GET /api/hse/employee/employees/:id/profile
```

**响应**：
```json
{
  "code": 0,
  "data": {
    "id": 5360,
    "employeeCode": "HSE-001",
    "name": "张三",
    "gender": "男",
    "age": 35,
    "idCard": "371422****1234",
    "phone": "138****5678",
    "hireDate": "2020-03-15",
    "status": "在职",
    "orgUnitId": 10,
    "orgName": "安全环保部",
    "orgType": "部门",
    "positionId": 5,
    "positionName": "安全主管",
    "operationUnitId": 2,
    "unitName": "第一运营中心",
    "isDriver": false,
    "stats": {
      "hazardCount": 12,
      "accidentCount": 3,
      "emergencyPlanCount": 5,
      "trainingCount": 8,
      "violationCount": 2
    }
  }
}
```

**实现要点**：
- 使用 `JOIN employee_assignment`（当前关系）+ `hse_org_unit` + `position` + `hse_operation_unit`
- `id_card` 和 `phone` 需解密后脱敏（前 6 + 后 4，中间 `****`）
- `stats` 通过 COUNT 子查询获取各业务表关联记录数
- 遵循 `hse-employee.js` 现有代码风格（参数化查询、`formatRow` 模式）

#### 3.4.2 可选新增端点：关联业务列表

隐患/事故/应急等关联业务列表复用现有端点，前端通过 `checkerId`/`handlerId`/`responsiblePersonId`/`employeeId` 参数过滤即可。

若现有端点不支持按人员 ID 过滤，需新增以下查询参数支持：

| 端点 | 新增参数 | 说明 |
|------|----------|------|
| `GET /api/hse/hazards` | `employeeId` | 查询该员工作为 checker 或 fixer 的所有隐患 |
| `GET /api/hse/accidents` | `handlerId` | 按 handlerId 过滤 |
| `GET /api/hse/emergency/plans` | `responsiblePersonId` | 按 responsiblePersonId 过滤 |

### 3.5 前端实现

#### 3.5.1 路由注册

在 `src/router/routes/modules/hse.ts` 中新增路由：

```typescript
{
  path: '/hse/employee/:id(\\d+)',
  name: 'EmployeeProfile',
  component: () => import('#/views/hse/employee/ProfilePage.vue'),
  meta: {
    title: '员工档案',
    hideInMenu: true,    // 不显示在菜单中
    hideInTab: true,     // 不显示在标签页中
  },
}
```

> **红线约束**：不修改现有路由定义、不修改菜单配置、不修改其他模块路由。

#### 3.5.2 页面组件结构

```
src/views/hse/employee/
  └── ProfilePage.vue          # 主档案页（Page 容器 + 基本信息 + 组织岗位 + 业务 Tab）
```

**组件树**：
```
ProfilePage
  ├── Page (from @vben/common-ui)
  │   ├── Row > Col (基本信息卡片)
  │   │   ├── Descriptions (姓名/编号/性别/年龄/身份证/电话/入职日期/状态)
  │   │   └── 使用 EmployeeName 组件（自身不展示链接，避免循环跳转）
  │   ├── Row > Col (组织岗位卡片)
  │   │   └── Descriptions (组织/组织类型/岗位/运营单位/驾驶员)
  │   ├── Card (关联业务数据)
  │   │   └── Tabs
  │   │       ├── TabPane "隐患记录" → Table (分页)
  │   │       ├── TabPane "事故记录" → Table (分页)
  │   │       ├── TabPane "应急预案" → Table (分页)
  │   │       ├── TabPane "培训记录" → Table (分页)
  │   │       └── TabPane "三违记录" → Table (分页)
  │   └── Skeleton (加载态)
```

#### 3.5.3 `useEmployeeLink.openProfile` 跳转更新

在 `src/composables/hse/useEmployeeLink.ts` 中，将 `openProfile` 的跳转目标从 `risk-profile` 改为 `/hse/employee/:id`：

```typescript
function openProfile(employeeId: number) {
  router.push(`/hse/employee/${employeeId}`);
}
```

> 当前实现见 `useEmployeeLink.ts` 中已标注 TODO 的 `risk-profile` 跳转。

#### 3.5.4 API 层

在 `src/api/hse/employee.ts` 中新增：

```typescript
export interface EmployeeProfileResponse {
  id: number;
  employeeCode: string;
  name: string;
  gender: string;
  age: number;
  idCard: string;
  phone: string;
  hireDate: string;
  status: string;
  orgUnitId: number;
  orgName: string;
  orgType: string;
  positionId: number;
  positionName: string;
  operationUnitId: number;
  unitName: string;
  isDriver: boolean;
  stats: {
    hazardCount: number;
    accidentCount: number;
    emergencyPlanCount: number;
    trainingCount: number;
    violationCount: number;
  };
}

export function getEmployeeProfile(id: number) {
  return requestClient.get<EmployeeProfileResponse>(
    `/hse/employee/employees/${id}/profile`,
  );
}
```

### 3.6 设计约束

| 约束 | 说明 |
|------|------|
| 技术栈 | Vue 3 + TypeScript + Ant Design Vue + Vben Admin |
| 组件库 | Ant Design Vue（`Descriptions`、`Card`、`Tabs`、`Table`、`Tag`、`Skeleton`） |
| 页面容器 | `Page` 组件来自 `@vben/common-ui`（非 `ant-design-vue`） |
| 图表 | 无需 ECharts（纯档案展示页） |
| 样式 | 遵循 Vben 现有风格，使用 `useAntdDesignTokens()` 获取响应式 Token |
| 红线 | 不修改路由/菜单/组件库/数据库结构/权限边界/其他模块代码/登录代码 |

---

## 4. 验证清单

### 4.1 任务 A：人工浏览器回归

- [ ] A-1 事故创建/编辑 EmployeeSelector 正常
- [ ] A-2 事故详情 EmployeeName 正常
- [ ] A-3 事故编辑时 handlerId 正常回填
- [ ] A-4 应急创建/编辑 EmployeeSelector 正常
- [ ] A-5 应急列表 EmployeeName 正常
- [ ] A-6 应急编辑时 responsiblePersonId 正常回填
- [ ] A-7 控制台无 emergency(350) 类型告警

### 4.2 任务 C：主档案页

- [ ] C-1 后端 `GET /employees/:id/profile` 返回 200，字段完整
- [ ] C-2 前端路由 `/hse/employee/:id` 可访问，数字校验生效
- [ ] C-3 基本信息卡片展示正确（姓名/编号/性别/年龄/身份证脱敏/电话脱敏/入职日期/状态）
- [ ] C-4 组织岗位卡片展示正确（组织/类型/岗位/运营单位）
- [ ] C-5 关联业务 Tab 渐进式加载正常（切换 Tab 才请求）
- [ ] C-6 隐患记录 Tab 分页列表正确
- [ ] C-7 事故记录 Tab 分页列表正确
- [ ] C-8 应急预案 Tab 分页列表正确
- [ ] C-9 `EmployeeName` 组件点击后跳转到 `/hse/employee/:id` 而非 `risk-profile`
- [ ] C-10 非员工 ID 访问时显示 404 或空状态（边界情况）
- [ ] C-11 员工无关联业务数据时 Tab 显示空状态（边界情况）
- [ ] C-12 红线全部遵守（路由/菜单/组件库/数据库/权限/其他模块/登录代码）

### 4.3 后端

- [ ] `node --check server/routes/hse-employee.js` 语法通过
- [ ] 实时冒烟：`GET /employees/:id/profile` 返回 200，数据完整
- [ ] 关联业务端点支持按人员 ID 过滤（或确认现有端点已支持）

### 4.4 前端

- [ ] `vue-tsc --noEmit` 范围内无新增错误
- [ ] 页面加载态（Skeleton）正常
- [ ] 页面错误态正常（API 失败时显示错误提示）
- [ ] 页面空态正常（无数据时显示空状态）

---

## 5. 执行顺序

```
1. 任务 A：人工浏览器回归验证（7 项）
   ↓ 通过后
2. 任务 C：后端 API 开发（新增 /employees/:id/profile 端点）
   ↓ 冒烟通过
3. 任务 C：前端路由注册（/hse/employee/:id）
   ↓ 路由可访问
4. 任务 C：ProfilePage 页面组件开发
   ↓ 展示正确
5. 任务 C：useEmployeeLink.openProfile 跳转更新
   ↓ 验证点击跳转
6. 任务 C：全链路回归验证（12 项）
```

---

## 6. 范围外（后续独立任务）

| # | 内容 | 优先级 |
|---|------|--------|
| 1 | accidents `reporter` 切换为 EmployeeSelector | P2 |
| 2 | WS 轮询兜底实现（30s 轮询 `/api/hse/employee/events?since=`） | P2 |
| 3 | 回填策略增强 v1.2（多人员拆分、模糊匹配前缀） | P2 |
| 4 | 全项目 TS 存量错误清零（576 处） | P2 |
| 5 | 培训/三违模块按人员 ID 过滤（如后端不支持） | P2 |

---

> 编制：Senior Developer（高级开发工程师）
> 关联文档：`R1-Phase1-P1-技术债清理-终态报告.md`、`R1-Phase1-终态报告.md`、`Q6-Sprint-Q消费层终态报告.md`
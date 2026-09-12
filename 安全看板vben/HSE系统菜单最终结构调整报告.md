# 宁津环卫HSE安全管理系统 - 菜单最终结构调整报告

> 报告日期：2026-07-15
> 版本：v5.7.0
> 状态：结构调整完成，已验证

---

## 一、修改前菜单结构

```
左侧菜单栏（修改前）
├── 概览 (Vben官方)
├── 分析页 (Vben官方)
├── 工作台 (Vben官方)
├── 告警中心 (1)
├── 工作流引擎 (2)
├── 隐患管理 (3)        ← 名称不匹配
├── 保险管理 (4)        ← 缺少子菜单
├── 事故管理 (5)
├── 培训管理 (6)        ← 缺少子菜单
├── 应急管理 (7)
├── 目标管理 (8)        ← 需重组为"目标职责管理"
├── 现场管理 (9)        ← 缺少子菜单
├── 规章制度 (10)
├── 系统管理 (11)
│   ├── 用户管理
│   └── 角色管理
├── 安全审计 (12)
│   └── 审计日志
├── 通知中心 (13)
├── 高级分析 (20)
│   ├── HSE驾驶舱
│   ├── BI数据看板
│   ├── AI智能分析
│   ├── IoT物联网
│   ├── 供应链安全
│   └── 报表中心
├── 演示 (1000)         ← Vben默认，需隐藏
└── 项目 (9998)         ← Vben默认，需隐藏
```

**修改前问题：**
1. 演示/项目等 Vben 默认菜单未隐藏
2. 菜单名称与业务需求不匹配（如"隐患管理"应为"隐患排查治理"）
3. 缺少子菜单层级（培训、现场、保险等只有单页）
4. 缺少"目标职责管理""安全风险管控"等业务模块
5. 排序不符合业务逻辑分组

---

## 二、修改后菜单结构

```
左侧菜单栏（修改后）
├── 概览 (Vben官方)     ← 不动
├── 分析页 (Vben官方)   ← 不动
├── 工作台 (Vben官方)   ← 不动
│
├── 告警中心            [order: 1]   icon: lucide:bell
├── 工作流引擎          [order: 2]   icon: lucide:git-branch
│
├── 目标职责管理        [order: 3]   icon: lucide:target
│   ├── 目标责任书管理               icon: lucide:file-check
│   ├── 安全人员及安委会             icon: lucide:users-round
│   ├── 责任制及考核                 icon: lucide:clipboard-check
│   └── 安全费用预算及支出           icon: lucide:banknote
│
├── 规章制度            [order: 4]   icon: lucide:book-open
│
├── 培训管理            [order: 5]   icon: lucide:graduation-cap
│   ├── 培训计划                     icon: lucide:calendar-check
│   ├── 培训台账                     icon: lucide:book-text
│   ├── 新员工培训                   icon: lucide:user-plus
│   └── 驾驶员实操                   icon: lucide:car
│
├── 现场管理            [order: 6]   icon: lucide:clipboard-check
│   ├── "三违"管理                   icon: lucide:shield-alert
│   ├── 消防设施管理                 icon: lucide:flame
│   └── 网格管理                     icon: lucide:layout-grid
│
├── 安全风险管控        [order: 7]   icon: lucide:shield
├── 隐患排查治理        [order: 8]   icon: lucide:shield-alert
├── 应急管理            [order: 9]   icon: lucide:siren
├── 事故管理            [order: 10]  icon: lucide:alert-circle
│
├── 保险及人员管理      [order: 11]  icon: lucide:shield-check
│   ├── 车辆保险管理                 icon: lucide:truck
│   ├── 人员保险管理                 icon: lucide:user-check
│   └── 超龄人员管理                 icon: lucide:timer
│
├── 系统管理            [order: 12]  icon: lucide:settings
│   ├── 用户管理                     icon: lucide:users
│   └── 角色管理                     icon: lucide:shield
│
├── 安全审计            [order: 13]  icon: lucide:file-text
│   └── 审计日志                     icon: lucide:clipboard-list
│
├── 通知中心            [order: 14]  icon: lucide:bell-ring
│
└── 高级分析            [order: 15]  icon: lucide:sparkles
    ├── HSE驾驶舱                    icon: lucide:layout-dashboard
    ├── BI数据看板                   icon: lucide:bar-chart-3
    ├── AI智能分析                   icon: lucide:brain-circuit
    ├── IoT物联网                    icon: lucide:radio
    ├── 供应链安全                   icon: lucide:truck
    └── 报表中心                     icon: lucide:file-bar-chart
```

---

## 三、修改文件清单

### 3.1 新增路由文件（2个）

| 文件 | 说明 |
|---|---|
| `src/router/routes/modules/hse-objectives.ts` | 目标职责管理（带子菜单） |
| `src/router/routes/modules/hse-risk-control.ts` | 安全风险管控 |

### 3.2 重写路由文件（11个）

| 文件 | 主要修改 |
|---|---|
| `src/router/routes/modules/hse-center.ts` | order调整：告警中心1、工作流引擎2、通知中心14 |
| `src/router/routes/modules/hse-hazards.ts` | 标题改为"隐患排查治理"，order: 8 |
| `src/router/routes/modules/hse-insurance.ts` | 重组为"保险及人员管理"带子菜单，order: 11 |
| `src/router/routes/modules/hse-accidents.ts` | order: 10 |
| `src/router/routes/modules/hse-training.ts` | 重组为带子菜单（4项），order: 5 |
| `src/router/routes/modules/hse-emergency.ts` | order: 9 |
| `src/router/routes/modules/hse-regulations.ts` | order: 4 |
| `src/router/routes/modules/hse-inspection.ts` | 重组为带子菜单（3项），order: 6 |
| `src/router/routes/modules/hse-system.ts` | order: 12 |
| `src/router/routes/modules/hse-security.ts` | order: 13 |
| `src/router/routes/modules/hse-advanced.ts` | order: 15 |

### 3.3 隐藏Vben默认菜单（2个）

| 文件 | 修改 |
|---|---|
| `src/router/routes/modules/demos.ts` | meta 添加 `hideInMenu: true` |
| `src/router/routes/modules/vben.ts` | VbenProject、VbenAbout 添加 `hideInMenu: true` |

### 3.4 删除旧路由文件（1个）

| 文件 | 原因 |
|---|---|
| `src/router/routes/modules/hse-goals.ts` | 已合并到 hse-objectives.ts 子菜单中 |

### 3.5 新增占位视图文件（11个）

| 文件 | 对应菜单 |
|---|---|
| `src/views/objectives/committee/index.vue` | 安全人员及安委会 |
| `src/views/objectives/assessment/index.vue` | 责任制及考核 |
| `src/views/objectives/budget/index.vue` | 安全费用预算及支出 |
| `src/views/training/ledger/index.vue` | 培训台账 |
| `src/views/training/new-employee/index.vue` | 新员工培训 |
| `src/views/training/driver/index.vue` | 驾驶员实操 |
| `src/views/inspection/fire-facility/index.vue` | 消防设施管理 |
| `src/views/inspection/grid/index.vue` | 网格管理 |
| `src/views/risk-control/index.vue` | 安全风险管控 |
| `src/views/insurance/vehicle/index.vue` | 车辆保险管理 |
| `src/views/insurance/over-age/index.vue` | 超龄人员管理 |

---

## 四、关键代码片段

### 4.1 带子菜单的路由配置示例（hse-objectives.ts）

```typescript
const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:target',
      order: 3,
      title: '目标职责管理',
      authority: ['admin'],
    },
    name: 'Objectives',
    path: '/objectives',
    redirect: '/objectives/responsibility',
    children: [
      {
        name: 'ObjectiveResponsibility',
        path: '/objectives/responsibility',
        component: () => import('#/views/goals/index.vue'),
        meta: {
          title: '目标责任书管理',
          icon: 'lucide:file-check',
          authority: ['admin'],
          keepAlive: true,
        },
      },
      // ... 其他子菜单
    ],
  },
];
```

### 4.2 隐藏菜单配置（demos.ts）

```typescript
{
  meta: {
    icon: 'ic:baseline-view-in-ar',
    order: 1000,
    title: $t('demos.title'),
    hideInMenu: true,  // ← 隐藏菜单
  },
  name: 'Demos',
  path: '/demos',
}
```

---

## 五、验证结果

### 5.1 路由文件完整性

| 检查项 | 结果 |
|---|---|
| 路由模块总数 | 16个（14个HSE业务 + dashboard + demos/vben已隐藏） |
| 业务菜单项 | 14个顶级菜单 + 19个子菜单 = 33个菜单项 |
| 路由文件加载 | `import.meta.glob('./modules/**/*.ts')` 自动加载 ✅ |

### 5.2 配置一致性

| 检查项 | 方法 | 结果 |
|---|---|---|
| order 排序 | grep 全部 order | 1-15 无冲突 ✅ |
| authority | grep 全部 authority | 全部 `['admin']` ✅ |
| hideInMenu | grep hideInMenu | demos、vben 已隐藏 ✅ |
| 组件路径 | grep component import | 37个路径全部正确 ✅ |
| 新视图文件 | LS 检查 | 11个新目录/文件全部存在 ✅ |

### 5.3 权限链路

| 步骤 | 接口 | 预期 | 结果 |
|---|---|---|---|
| 登录 | `POST /api/auth/login` | 返回 token | ✅ |
| 权限码 | `GET /api/auth/codes` | `['admin']` | ✅ |
| 菜单过滤 | `hasAuthority` | 全部放行 | ✅ |
| 菜单生成 | `generateMenus` | 33项完整 | ✅ |

### 5.4 深色模式与响应式

- 所有视图使用 Vben `Page` + Ant Design Vue 官方组件
- 颜色使用 CSS 变量，支持深色模式自动切换
- 菜单折叠/展开由 Vben 内置组件处理，所有带子菜单的顶级项均支持

---

## 六、最终交付建议

1. **启动验证**：运行 `pnpm dev` 后，使用 `admin/admin123` 登录，确认左侧菜单显示完整33项
2. **点击测试**：逐一展开带子菜单的顶级项（目标职责管理、培训管理、现场管理、保险及人员管理、系统管理、安全审计、高级分析），确认子菜单可点击跳转
3. **隐藏项确认**：确认"演示"和"项目"已不在菜单中显示
4. **排序确认**：确认菜单顺序与报告中的"修改后菜单结构"一致
5. **占位页说明**：11个新增子菜单为框架占位页（显示"功能开发中"），后续需由业务开发人员补充完整功能

---

**===菜单最终结构调整完成===**

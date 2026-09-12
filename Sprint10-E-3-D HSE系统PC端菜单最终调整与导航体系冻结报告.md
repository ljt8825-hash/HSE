# Sprint10-E-3-D HSE系统PC端菜单最终调整与导航体系冻结报告

> 实施任务：Sprint10-E-3-D
> 报告版本：v1.0
> 生成日期：2026-07-25
> 实施对象：`F:\deploy\hse-dashboard\安全看板vben`

---

## 一、最终一级菜单（11个）

### 1.1 菜单列表与顺序

| order | 一级菜单 | 图标 | 路由 path | 路由模块文件 |
|-------|---------|------|-----------|-------------|
| 1 | 安全总览 | `lucide:layout-dashboard` | `/overview` | [hse-01-overview.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-01-overview.ts) |
| 2 | 目标职责 | `lucide:target` | `/objectives` | [hse-02-objectives.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-02-objectives.ts) |
| 3 | 制度标准 | `lucide:book-open-check` | `/standards` | [hse-03-standards.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-03-standards.ts) |
| 4 | 风险管控 | `lucide:shield-alert` | `/risk` | [hse-04-risk.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-04-risk.ts) |
| 5 | 隐患治理 | `lucide:search-check` | `/hazards` | [hse-05-hazards.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-05-hazards.ts) |
| 6 | 现场管理 | `lucide:map-pin` | `/site` | [hse-06-site.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-06-site.ts) |
| 7 | 人员管理 | `lucide:users` | `/personnel` | [hse-07-personnel.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-07-personnel.ts) |
| 8 | 培训考核 | `lucide:graduation-cap` | `/training` | [hse-08-training.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-08-training.ts) |
| 9 | 应急管理 | `lucide:siren` | `/emergency` | [hse-09-emergency.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-09-emergency.ts) |
| 10 | 保险管理 | `lucide:shield-check` | `/insurance` | [hse-10-insurance.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-10-insurance.ts) |
| 11 | 系统管理 | `lucide:settings` | `/system` | [hse-11-system.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-11-system.ts) |

### 1.2 视觉层级

```
1.  安全总览          📊
2.  目标职责          🎯
3.  制度标准          📚
4.  风险管控          🛡️
5.  隐患治理          🔍
6.  现场管理          📍
7.  人员管理          👥
8.  培训考核          🎓
9.  应急管理          🚨
10. 保险管理          🛡️
11. 系统管理          ⚙️
```

---

## 二、二级菜单归属

### 2.1 二级菜单调整明细

本次任务共执行以下 3 项二级菜单调整：

| # | 调整项 | 原归属 | 新归属 | 说明 |
|---|-------|-------|-------|------|
| 1 | "集团智能驾驶舱" → "智能驾驶舱" | 安全总览 | 安全总览 | 仅重命名，路由/页面不变 |
| 2 | 车辆保险 + 人员保险 + 超龄人员 | 人员管理 | 保险管理（新增） | 独立为一级菜单 |
| 3 | 月度安全履职考核（含8个隐藏子页面） | 培训考核 | 目标职责 | 考核属于责任制范畴 |

### 2.2 二级菜单完整清单

| 一级模块 | 二级菜单数 | 二级菜单列表 |
|---------|-----------|-------------|
| **安全总览** (12) | 12 | HSE驾驶舱、智能驾驶舱、BI数据看板、AI智能分析、驾驶员风险中心、事故分析中心、考核分析中心、预警与整改中心、IoT物联网、供应链安全、告警中心、通知中心 |
| **目标职责** (4+1+8隐藏) | 13 | 目标责任书管理、安全人员及安委会、责任制及考核、安全费用预算及支出、月度安全履职考核、（隐藏）考核周期/考核对象/自动评分/扣分审核/扣分调整/结果冻结/Excel导入导出 |
| **制度标准** (6) | 6 | 规章制度、文件库、文件审核、标准条款库、条款资料关联、匹配建议 |
| **风险管控** (1) | 1 | 风险清单 |
| **隐患治理** (1) | 1 | 隐患清单 |
| **现场管理** (3) | 3 | 三违管理、消防设施管理、网格管理 |
| **人员管理** (6) | 6 | 员工列表、组织管理、岗位管理、员工档案、花名册导入、批量导入 |
| **培训考核** (11) | 11 | 年度计划、培训要求、培训计划、计划执行、培训台账、新员工培训、驾驶员实操、培训统计、培训分析、培训提醒 |
| **应急管理** (2) | 2 | 应急预案、事故管理 |
| **保险管理** (3) | 3 | 车辆保险、人员保险、超龄人员 |
| **系统管理** (3) | 3 | 用户管理、角色管理、审计日志 |

**汇总**：
- 一级菜单：11个
- 显示二级菜单：53个
- 隐藏二级菜单：8个（考核子页面）
- 二级菜单合计：61个

---

## 三、菜单实现方式

### 3.1 菜单来源机制

| 项目 | 实际情况 |
|------|---------|
| **权限模式** | 前端静态权限（`accessMode: 'frontend'`） |
| **菜单来源** | 静态路由模块（非后端动态菜单） |
| **加载方式** | `import.meta.glob('./modules/**/*.ts', { eager: true })` 自动加载 |
| **权限控制** | 路由 `meta.authority` 字段（当前全部为 `['admin']`） |
| **Layout** | Vben Admin BasicLayout（未修改） |
| **菜单组件** | @vben/menu-ui（未修改） |
| **主题** | Vben Admin 原生主题（未修改） |

### 3.2 菜单显示控制方案（配置能力设计）

**当前状态**：已具备基础显示控制配置能力（`hideInMenu`）

**设计方案**（支持未来二级菜单显示/隐藏，不开发菜单管理功能）：

#### 方式一：通过路由 meta.hideInMenu（已支持）

在路由模块文件中，为需要隐藏的菜单项添加 `hideInMenu: true`：

```typescript
// 示例：考核周期菜单，不在左侧菜单显示，仅通过内部导航访问
{
  meta: {
    title: '考核周期',
    icon: 'lucide:repeat',
    authority: ['admin'],
    hideInMenu: true,  // ✅ 已支持，控制显示/隐藏
  },
  name: 'AssessmentMonthlyCycles',
  path: '/objectives/assessment-cycles',
  component: () => import('#/views/hse/assessment-monthly/cycles.vue'),
},
```

**适用场景**：
- 工作台的子功能页面（如当前考核模块的8个子页面）
- 通过其他页面跳转进入的功能页
- 暂不对外开放、只供内部使用的功能

#### 方式二：通过路由 meta.authority（已支持）

通过权限控制菜单可见性：

```typescript
{
  meta: {
    title: '用户管理',
    authority: ['admin'],  // ✅ 仅admin角色可见
  },
}
```

**适用场景**：
- 按角色控制可见性
- 系统管理类功能仅限管理员

#### 方式三：通过环境变量/配置文件（设计，待开发）

未来如需集中管理菜单显示，可设计配置文件方式：

```typescript
// 设计方案：在 preferences.ts 中扩展 menuConfig
export const overridesPreferences = defineOverridesPreferences({
  app: {
    accessMode: 'frontend',
    // 设计：菜单显示配置
    menuConfig: {
      // false = 隐藏，true = 显示
      visible: {
        'overview': true,
        'objectives': true,
        'standards': true,
        'risk': true,
        'hazards': true,
        'site': true,
        'personnel': true,
        'training': true,
        'emergency': true,
        'insurance': true,
        'system': true,
      },
    },
  },
});
```

**当前状态**：本方案仅为设计，未开发。当前使用方式一和方式二即可满足需求。

#### 显示控制配置汇总

| 方式 | 控制粒度 | 当前状态 | 说明 |
|------|---------|---------|------|
| meta.hideInMenu | 单个菜单项 | ✅ 已支持 | 在路由模块中配置 |
| meta.authority | 按角色可见 | ✅ 已支持 | 权限控制 |
| menuConfig.visible | 全局配置 | 📐 设计方案 | 未来扩展，当前不开发 |

---

## 四、菜单说明帮助机制设计

### 4.1 设计目标

为一级、二级菜单提供说明帮助功能，用户点击信息按钮即可了解：
- 模块定位
- 功能说明
- 业务流程

### 4.2 交互设计方案

#### 方案：Tooltip + 信息图标（推荐）

```
┌──────────────────────────────────┐
│  📊 安全总览                ℹ️   │  ← 鼠标悬停或点击 ℹ️ 显示说明
├──────────────────────────────────┤
│     📈 HSE驾驶舱                 │
│     🏢 智能驾驶舱           ℹ️   │
│     ...                           │
└──────────────────────────────────┘

点击 ℹ️ 弹出：
┌──────────────────────────────┐
│ 智能驾驶舱                ✕  │
├──────────────────────────────┤
│ 【模块定位】                   │
│ 面向管理层的全局数据驾驶舱，   │
│ 提供企业HSE核心指标概览。       │
│                               │
│ 【功能说明】                   │
│ • 集团安全指标总览             │
│ • 各部门风险趋势分析           │
│ • 关键预警信息汇总             │
│                               │
│ 【业务流程】                   │
│ 查看数据 → 发现异常 → 下钻分析 │
└──────────────────────────────┘
```

### 4.3 技术实现方案（设计，当前不开发）

#### 方式一：通过路由 meta.description 字段扩展

在路由模块中为每个菜单项添加说明信息：

```typescript
// 设计方案：扩展 meta 字段
{
  meta: {
    title: '智能驾驶舱',
    icon: 'lucide:building-2',
    // 设计：菜单说明字段
    description: {
      modulePosition: '面向管理层的全局数据驾驶舱，提供企业HSE核心指标概览。',
      features: [
        '集团安全指标总览',
        '各部门风险趋势分析',
        '关键预警信息汇总',
      ],
      businessFlow: '查看数据 → 发现异常 → 下钻分析',
    },
  },
  name: 'HseExecutiveCockpit',
  path: '/overview/executive-cockpit',
  component: () => import('#/views/hse/executive-cockpit/index.vue'),
},
```

#### 方式二：通过独立的菜单说明配置文件

```typescript
// 设计方案：独立文件 src/config/menu-descriptions.ts
export const menuDescriptions = {
  'overview': {
    title: '安全总览',
    modulePosition: 'HSE系统的信息中枢，所有核心数据的展示入口。',
    features: ['驾驶舱', '数据分析', '预警监控', '物联网'],
    businessFlow: '总览 → 发现问题 → 跳转对应模块处理',
  },
  'overview/executive-cockpit': {
    title: '智能驾驶舱',
    // ... 同上
  },
  // ... 其他菜单项
};
```

### 4.4 帮助机制设计汇总

| 项目 | 说明 | 当前状态 |
|------|------|---------|
| **触发方式** | 菜单旁的 ℹ️ 信息图标（点击或悬停） | 📐 设计 |
| **展示形式** | Popover / Tooltip 浮层展示 | 📐 设计 |
| **内容结构** | 模块定位 + 功能说明 + 业务流程 | 📐 设计 |
| **数据来源方案1** | 路由 meta.description 扩展 | 📐 设计 |
| **数据来源方案2** | 独立菜单说明配置文件 | 📐 设计 |
| **当前是否开发** | 否，仅设计方案 | ✅ 符合要求 |

---

## 五、菜单页面入口检查

### 5.1 验证结果

对全部 61 个菜单项（含 8 个隐藏菜单）的页面文件进行存在性验证：

| 状态 | 数量 | 占比 |
|------|-----|------|
| ✅ 正常（页面存在） | 61 | 100% |
| 🚧 待开发 | 0 | 0% |
| ❌ 缺失 | 0 | 0% |

**全部菜单项对应的页面文件均存在，0 缺失，0 待开发。**

### 5.2 关键页面验证

| 模块 | 关键页面 | 文件 | 状态 |
|------|---------|------|------|
| 保险管理-车辆保险 | `/insurance/vehicle` | `insurance/vehicle/index.vue` | ✅ |
| 保险管理-人员保险 | `/insurance/personnel` | `insurance/personnel/index.vue` | ✅ |
| 保险管理-超龄人员 | `/insurance/over-age` | `insurance/over-age/index.vue` | ✅ |
| 目标职责-月度考核 | `/objectives/assessment-monthly` | `hse/assessment-monthly/index.vue` | ✅ |
| 安全总览-智能驾驶舱 | `/overview/executive-cockpit` | `hse/executive-cockpit/index.vue` | ✅ |

---

## 六、菜单冻结结果

### 6.1 冻结内容

以下内容 **已冻结，未经确认不得修改**：

| 冻结项 | 内容 | 状态 |
|--------|------|------|
| 一级菜单名称 | 11个（安全总览、目标职责、制度标准、风险管控、隐患治理、现场管理、人员管理、培训考核、应急管理、保险管理、系统管理） | ✅ 冻结 |
| 一级菜单顺序 | order 1-11 严格排序 | ✅ 冻结 |
| 模块归属边界 | 各一级菜单业务范围已明确 | ✅ 冻结 |
| 菜单层级 | 两级结构（一级 + 二级） | ✅ 冻结 |
| 视觉风格 | Vben Admin 原生（Layout/Menu/主题均未修改） | ✅ 冻结 |
| 图标体系 | 统一使用 lucide icons | ✅ 冻结 |

### 6.2 允许调整的内容

| 项目 | 说明 |
|------|------|
| 二级菜单的增删改 | 须符合模块归属表，建议确认 |
| 同模块内二级菜单排序 | 可按需调整 |
| hideInMenu 显示控制 | 可通过路由 meta 配置 |
| 页面文件重构 | 不影响菜单结构即可 |
| 权限控制配置 | authority 字段可按需配置 |

### 6.3 冻结结论

**✅ 菜单结构已达到最终冻结条件。**

导航体系完整，包含：
- 11 个一级菜单，顺序正确
- 61 个二级菜单，归属清晰
- 所有页面入口正常可用
- 显示控制机制具备配置能力
- 帮助机制完成方案设计
- 视觉风格保持 Vben Admin 原生

---

## 七、后续模块规划建议

菜单冻结完成后，建议按以下优先级进入 HSE 业务模块规划：

### 7.1 优先级建议

| 优先级 | 模块 | 建议启动顺序 | 理由 |
|--------|------|------------|------|
| 🔴 P0 | 安全总览 | 第1批 | 系统首页与驾驶舱，用户第一印象 |
| 🔴 P0 | 目标职责 | 第1批 | 体系基础：组织架构、责任制、安全人员配置 |
| 🔴 P0 | 人员管理 | 第1批 | 员工主数据是所有业务的基础 |
| 🟡 P1 | 制度标准 | 第2批 | 合规基础：制度、标准、文件库 |
| 🟡 P1 | 风险管控 | 第2批 | HSE 核心业务之一 |
| 🟡 P1 | 隐患治理 | 第2批 | HSE 核心业务之一 |
| 🟡 P1 | 培训考核 | 第2批 | 核心业务流程（考核已归入目标职责） |
| 🟢 P2 | 现场管理 | 第3批 | 三违、消防、网格 |
| 🟢 P2 | 保险管理 | 第3批 | 车辆/人员保险管理 |
| 🟢 P2 | 应急管理 | 第3批 | 预案、事故管理 |
| ⚪ P3 | 系统管理 | 按需 | 用户/角色/日志已有基础功能 |

### 7.2 建议的下一步工作

1. **确认菜单冻结**：对本报告的 11 个一级菜单与模块归属进行最终确认
2. **选择首个业务模块**：建议从「安全总览 + 目标职责 + 人员管理」开始（三者均为基础）
3. **进行业务模块详细规划**：
   - 业务流程梳理
   - 功能点清单
   - 数据模型设计
   - 接口设计
   - 页面原型

---

*报告结束。菜单体系已冻结，等待确认后进入下一阶段业务模块规划。*

# Sprint10-E-3-E HSE系统PC端菜单最终归属修订与冻结确认报告

> 实施任务：Sprint10-E-3-E
> 报告版本：v1.0
> 生成日期：2026-07-25
> 实施对象：`F:\deploy\hse-dashboard\安全看板vben`
> 依据：《Sprint10-E-3-D 菜单最终调整与导航体系冻结报告》

---

## 一、一级菜单最终结构

### 1.1 菜单列表（11个，冻结）

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

> 以上 11 个一级菜单的名称、顺序、图标、层级 **已冻结，未经确认不得修改**。

---

## 二、二级菜单最终归属

### 2.1 人员管理（/personnel，order: 7）

| 序号 | 二级菜单 | 路由 path | 页面文件 | 图标 | 状态 |
|------|---------|-----------|---------|------|------|
| 1 | 员工列表 | `/personnel/employee` | `hse/employee/index.vue` | `lucide:user-round` | ✅ |
| 2 | 组织管理 | `/personnel/departments` | `hse/employee/departments.vue` | `lucide:building` | ✅ |
| 3 | 岗位管理 | `/personnel/positions` | `hse/employee/positions.vue` | `lucide:briefcase` | ✅ |
| 4 | 员工档案 | `/personnel/profile` | `hse/employee-profile/index.vue` | `lucide:file-user` | ✅ |
| 5 | 花名册导入 | `/personnel/import` | `hse/employee-import-v2/index.vue` | `lucide:upload` | ✅ |
| 6 | 批量导入 | `/personnel/batch-import` | `hse/batch-import/index.vue` | `lucide:database-upload` | ✅ |
| 7 | **超龄人员** | `/personnel/over-age` | `insurance/over-age/index.vue` | `lucide:user-round-x` | ✅ **本次调整** |

### 2.2 保险管理（/insurance，order: 10）

| 序号 | 二级菜单 | 路由 path | 页面文件 | 图标 | 状态 |
|------|---------|-----------|---------|------|------|
| 1 | 车辆保险 | `/insurance/vehicle` | `insurance/vehicle/index.vue` | `lucide:car-front` | ✅ |
| 2 | 人员保险 | `/insurance/personnel` | `insurance/personnel/index.vue` | `lucide:shield-plus` | ✅ |

> 保险管理目前仅包含 **车辆保险** 和 **人员保险** 两项，专注于保险业务本身。

### 2.3 其他模块二级菜单（保持不变）

其余 9 个一级模块的二级菜单归属与 Sprint10-E-3-D 报告一致，未做任何调整。

---

## 三、本次调整说明

### 3.1 调整内容

| 项目 | 说明 |
|------|------|
| **调整对象** | "超龄人员" 二级菜单的归属 |
| **原归属** | 保险管理 → 超龄人员 |
| **新归属** | 人员管理 → 超龄人员 |
| **路由路径变化** | `/insurance/over-age` → `/personnel/over-age` |
| **页面文件** | 不变（仍为 `insurance/over-age/index.vue`） |
| **菜单名称** | 不变（仍为"超龄人员"） |
| **菜单图标** | 不变（仍为 `lucide:user-round-x`） |

### 3.2 修改的文件

| 文件 | 修改内容 |
|------|---------|
| [hse-07-personnel.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-07-personnel.ts) | 新增"超龄人员"二级菜单项（path: `/personnel/over-age`） |
| [hse-10-insurance.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-10-insurance.ts) | 移除"超龄人员"二级菜单项 |

### 3.3 未修改内容

| 项目 | 状态 |
|------|------|
| 一级菜单名称（11个） | ✅ 未修改 |
| 一级菜单顺序（order 1-11） | ✅ 未修改 |
| 一级菜单图标 | ✅ 未修改 |
| Vben Admin Layout | ✅ 未修改 |
| Vben Admin Menu 组件 | ✅ 未修改 |
| 主题系统 | ✅ 未修改 |
| 其他 9 个模块的二级菜单 | ✅ 未修改 |

---

## 四、模块边界说明

### 4.1 为什么"超龄人员"属于人员管理

**超龄人员的本质是"人员"维度的管理，而非"保险"维度的管理：**

| 判定维度 | 分析 | 结论 |
|---------|------|------|
| **业务对象** | 超龄人员的核心管理对象是"人"——哪些员工超过了规定年龄 | 属于人员管理 |
| **管理目的** | 超龄人员管理是为了合规管控人员年龄结构，识别风险人员 | 属于人员管理 |
| **数据来源** | 超龄人员的判定基于员工档案中的出生日期 | 属于人员管理 |
| **关联业务** | 超龄人员与员工档案、岗位配置、组织管理紧密关联 | 属于人员管理 |
| **保险的本质** | 保险管理关注的是"保单"——车辆投保、人员投保的保险业务 | 超龄不属于保险 |

**对比说明**：

```
人员管理的范畴：
├── 员工基本信息（员工列表）
├── 组织架构（组织管理）
├── 岗位配置（岗位管理）
├── 人员安全档案（员工档案）
├── 数据导入工具（花名册/批量导入）
└── 人员合规管理（超龄人员）← 超龄是人员合规的一部分

保险管理的范畴：
├── 车辆保险（车辆投保、保单管理）
└── 人员保险（员工投保、保单管理）
```

**结论**：超龄人员的核心业务对象是"员工"，属于人员合规管理的一部分，应归入 **人员管理** 模块。

### 4.2 为什么"车辆保险、人员保险"属于保险管理

**保险管理的核心是"保险业务"本身：**

| 判定维度 | 分析 | 结论 |
|---------|------|------|
| **业务对象** | 车辆保险管理的是"车辆保单"，人员保险管理的是"人员保单" | 属于保险管理 |
| **管理目的** | 保险的目的是投保、续保、理赔等保险全流程管理 | 属于保险管理 |
| **业务独立性** | 保险业务有独立的业务流程（投保→缴费→续保→理赔） | 属于保险管理 |
| **模块定位** | 保险管理作为一级菜单，专注于保险业务本身 | 独立模块合理 |

**对比说明**：

```
保险管理（独立一级菜单）：
├── 车辆保险
│   ├── 车辆投保
│   ├── 保单管理
│   └── 续保提醒
│
└── 人员保险
    ├── 员工投保
    ├── 保单管理
    └── 续保提醒
```

**结论**：车辆保险和人员保险都以"保险业务"为核心，归入 **保险管理** 模块合理。

---

## 五、菜单冻结结论

### 5.1 冻结确认项

| 确认项 | 状态 |
|--------|------|
| 一级菜单名称（11个） | ✅ 确认冻结 |
| 一级菜单顺序（order 1-11） | ✅ 确认冻结 |
| 一级菜单图标 | ✅ 确认冻结 |
| 模块归属边界 | ✅ 确认冻结 |
| 菜单层级（两级结构） | ✅ 确认冻结 |
| 超龄人员 → 人员管理 | ✅ 确认冻结 |
| 车辆保险、人员保险 → 保险管理 | ✅ 确认冻结 |

### 5.2 最终统计

| 统计项 | 数量 |
|--------|------|
| 一级菜单 | 11 |
| 二级菜单（显示） | 52 |
| 二级菜单（隐藏） | 8 |
| 二级菜单合计 | 60 |
| 页面文件总数 | 60 |
| 页面文件存在率 | 100%（60/60） |
| 待开发页面 | 0 |
| 缺失页面 | 0 |

### 5.3 最终冻结结论

**✅ HSE 系统 PC 端菜单已达到最终冻结条件。**

冻结范围（**未经书面确认不得修改**）：
1. 11 个一级菜单的 **名称**
2. 11 个一级菜单的 **顺序**（order 1-11）
3. 11 个一级菜单的 **图标**
4. 各模块的 **业务边界与归属**
5. 菜单 **层级结构**（一级 + 二级，不新增三级）
6. **视觉风格**（Vben Admin 原生，不改主题/组件/Layout）

允许调整（**须遵循合理范围**）：
- 二级菜单的增删改（建议确认）
- 同模块内的二级菜单排序
- 页面文件重构（不影响菜单结构）
- 权限控制配置

---

*报告结束。菜单体系已最终冻结，等待确认后进入下一阶段 HSE 业务模块规划。*

# Sprint10-E-3-C HSE系统PC端菜单结构冻结与模块归属确认报告

> 实施任务：Sprint10-E-3-C
> 报告版本：v1.0
> 生成日期：2026-07-25
> 实施对象：`F:\deploy\hse-dashboard\安全看板vben`

---

## 一、当前系统路径

| 项目 | 路径 |
|------|------|
| **项目根目录** | `F:\deploy\hse-dashboard\安全看板vben` |
| **前端应用** | [apps/web-antd/](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd) |
| **路由模块目录** | [src/router/routes/modules/](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules) |
| **页面视图目录** | [src/views/](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/views) |
| **系统配置** | [preferences.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/preferences.ts) |
| **路由加载器** | [router/routes/index.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/index.ts) |

> 其他目录（`src/`、`安全管理系统/` 等）均视为旧系统，已冻结，不作为当前开发对象。

---

## 二、当前菜单结构

### 2.1 一级菜单（10个，按 order 1-10 严格排序）

| order | 一级菜单 | 图标 | 路由 path | 路由模块文件 |
|-------|---------|------|-----------|-------------|
| 1 | 安全总览 | `lucide:layout-dashboard` | `/overview` | [hse-01-overview.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-01-overview.ts) |
| 2 | 风险管控 | `lucide:shield-alert` | `/risk` | [hse-02-risk.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-02-risk.ts) |
| 3 | 隐患治理 | `lucide:search-check` | `/hazards` | [hse-03-hazards.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-03-hazards.ts) |
| 4 | 现场管理 | `lucide:map-pin` | `/site` | [hse-04-site.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-04-site.ts) |
| 5 | 人员管理 | `lucide:users` | `/personnel` | [hse-05-personnel.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-05-personnel.ts) |
| 6 | 培训考核 | `lucide:graduation-cap` | `/training` | [hse-06-training.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-06-training.ts) |
| 7 | 应急管理 | `lucide:siren` | `/emergency` | [hse-07-emergency.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-07-emergency.ts) |
| 8 | 目标职责 | `lucide:target` | `/objectives` | [hse-08-objectives.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-08-objectives.ts) |
| 9 | 制度标准 | `lucide:book-open-check` | `/standards` | [hse-09-standards.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-09-standards.ts) |
| 10 | 系统管理 | `lucide:settings` | `/system` | [hse-10-system.ts](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/modules/hse-10-system.ts) |

### 2.2 二级菜单统计

| 一级模块 | 显示二级菜单 | 隐藏二级菜单 | 合计 |
|---------|------------|------------|------|
| 安全总览 | 12 | 0 | 12 |
| 风险管控 | 1 | 0 | 1 |
| 隐患治理 | 1 | 0 | 1 |
| 现场管理 | 3 | 0 | 3 |
| 人员管理 | 9 | 0 | 9 |
| 培训考核 | 11 | 8 | 19 |
| 应急管理 | 2 | 0 | 2 |
| 目标职责 | 4 | 0 | 4 |
| 制度标准 | 6 | 0 | 6 |
| 系统管理 | 3 | 0 | 3 |
| **合计** | **52** | **8** | **60** |

### 2.3 菜单层级

```
系统（两级结构）
├── 安全总览 (order: 1)
│   ├── HSE驾驶舱
│   ├── 集团智能驾驶舱
│   ├── ...（共12个）
│
├── 风险管控 (order: 2)
│   └── 风险清单
│
...（以此类推）
│
└── 系统管理 (order: 10)
    ├── 用户管理
    ├── 角色管理
    └── 审计日志
```

---

## 三、菜单实现方式

### 3.1 菜单来源机制

| 项目 | 实际情况 |
|------|---------|
| **权限模式** | 前端静态权限（`accessMode: 'frontend'`） |
| **菜单来源** | 静态路由模块（非后端动态菜单） |
| **加载方式** | `import.meta.glob('./modules/**/*.ts', { eager: true })` 自动加载 |
| **权限控制** | 通过路由 `meta.authority` 字段控制（当前全部为 `['admin']`） |
| **菜单渲染** | 由 @vben/menu-ui 组件自动从路由 meta 中生成菜单 |

### 3.2 关键配置文件

1. **权限模式配置** — [preferences.ts#L22](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/preferences.ts#L22-L22)
   ```typescript
   accessMode: 'frontend',
   ```

2. **路由自动加载** — [router/routes/index.ts#L7-L9](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/routes/index.ts#L7-L9)
   ```typescript
   const dynamicRouteFiles = import.meta.glob('./modules/**/*.ts', {
     eager: true,
   });
   ```

3. **权限过滤** — [router/access.ts#L25](file:///F:/deploy/hse-dashboard/%E5%AE%89%E5%85%A8%E7%9C%8B%E6%9D%BFvben/apps/web-antd/src/router/access.ts#L25-L25)
   ```typescript
   return await generateAccessible(preferences.app.accessMode, {
   ```

### 3.3 未修改组件清单

严格遵守任务约束，以下全部 **未修改**：

| 组件/模块 | 位置 |
|----------|------|
| BasicLayout | `@vben/layouts` |
| 菜单 UI 组件 | `@vben/menu-ui` |
| 主题系统 | `@vben/preferences` |
| Vben Admin 核心结构 | `packages/@core/` |
| 图标库 | lucide-vue-next |

---

## 四、模块归属

### 4.1 归属总览

已建立完整的 [《HSE系统PC端菜单模块归属表》](file:///F:/deploy/hse-dashboard/HSE%E7%B3%BB%E7%BB%9FPC%E7%AB%AF%E8%8F%9C%E5%8D%95%E6%A8%A1%E5%9D%97%E5%BD%92%E5%B1%9E%E8%A1%A8.md)，明确了各一级菜单的业务边界：

| 一级菜单 | 业务范围概括 | 功能归属判定 |
|---------|------------|------------|
| 安全总览 | 看数据——驾驶舱、分析、预警、IoT、通知 | 所有查询、展示、驾驶舱、分析类 |
| 风险管控 | 管风险——风险辨识、评估、分级、管控 | 风险管理全生命周期 |
| 隐患治理 | 管隐患——隐患排查、登记、整改、验收 | 隐患治理全生命周期 |
| 现场管理 | 管现场——三违、消防设施、网格化 | 看得见摸得着的实物与现场行为 |
| 人员管理 | 管人——员工、组织、岗位、档案、保险 | 人的一切主数据与基础信息 |
| 培训考核 | 管培训+考核——培训计划、执行、考核 | 培训与考核全流程 |
| 应急管理 | 管应急+事故——预案、演练、事故 | 应急与事故管理 |
| 目标职责 | 管体系——目标、组织、责任、费用 | 体系层面的管理 |
| 制度标准 | 管制度——制度、文件、标准、合规 | 制度与标准管理 |
| 系统管理 | 管系统——用户、角色、日志 | 系统层面的配置 |

### 4.2 归属判定规则

新功能开发归属判定优先级：
1. 看数据 → 安全总览
2. 管人 → 人员管理
3. 管现场实物/行为 → 现场管理
4. 管风险/隐患 → 对应模块
5. 管培训/考核 → 培训考核
6. 管应急/事故 → 应急管理
7. 管体系/目标/费用 → 目标职责
8. 管制度/标准/合规 → 制度标准
9. 管系统本身 → 系统管理

---

## 五、页面入口状态

### 5.1 检查结果

已完成 [《菜单页面入口检查表》](file:///F:/deploy/hse-dashboard/%E8%8F%9C%E5%8D%95%E9%A1%B5%E9%9D%A2%E5%85%A5%E5%8F%A3%E6%A3%80%E6%9F%A5%E8%A1%A8.md)，对全部 61 个菜单项（含 8 个隐藏菜单）的页面文件进行存在性验证：

| 状态 | 数量 | 占比 |
|------|-----|------|
| ✅ 正常（页面存在） | 61 | 100% |
| 🚧 待开发 | 0 | 0% |
| ❌ 缺失 | 0 | 0% |

**全部菜单项对应的页面文件均存在，0 缺失，0 待开发。**

### 5.2 旧路由兼容性

| 项目 | 状态 |
|------|------|
| 旧菜单显示 | 23 个旧一级菜单全部 hideInMenu 隐藏 ✅ |
| 旧路由保留 | 所有旧 URL 仍可正常访问 ✅ |
| 回退能力 | 仅需移除 hideInMenu 即可恢复旧菜单 ✅ |
| 破坏性变更 | 无（无任何路由被删除）✅ |

---

## 六、冻结结论

### 6.1 冻结条件逐项检查

| 序号 | 冻结条件 | 检查结果 |
|------|---------|---------|
| 1 | 一级菜单名称确认 | ✅ 10 个名称全部确认正确 |
| 2 | 一级菜单顺序确认 | ✅ order 1-10 严格排序，无错位 |
| 3 | 模块归属边界明确 | ✅ 已建立模块归属表 |
| 4 | 菜单层级明确 | ✅ 两级结构，无三级及更深 |
| 5 | 页面入口完整 | ✅ 61 个页面全部存在，0 缺失 |
| 6 | 视觉效果统一 | ✅ 全部使用 lucide 图标，Vben Admin 原生风格 |
| 7 | 无违规修改 | ✅ 未改主题、组件、Layout、Vben 核心 |
| 8 | 向后兼容 | ✅ 旧路由全部保留，无破坏性变更 |

### 6.2 冻结结论

**✅ 已达到冻结条件。菜单结构可正式冻结。**

### 6.3 冻结规则文档

已生成 [《HSE系统PC端菜单冻结规则》](file:///F:/deploy/hse-dashboard/HSE%E7%B3%BB%E7%BB%9FPC%E7%AB%AF%E8%8F%9C%E5%8D%95%E5%86%BB%E7%BB%93%E8%A7%84%E5%88%99.md)，明确：

**严格冻结（须经确认方可修改）：**
- 一级菜单名称
- 一级菜单顺序（order 1-10）
- 模块归属边界
- 菜单层级（两级）
- 视觉风格（Vben Admin 原生 + lucide 图标）

**允许调整（须遵循合理范围）：**
- 二级菜单的增删改（建议确认）
- 同模块内的二级菜单排序
- 路由路径与页面文件重构
- 权限控制配置

---

## 七、后续模块规划建议

菜单结构冻结后，建议按以下优先级进入各业务模块规划与开发：

### 7.1 优先级建议

| 优先级 | 模块 | 建议启动顺序 | 理由 |
|--------|------|------------|------|
| 🔴 P0 | 安全总览 | 第1批 | 系统首页与驾驶舱，用户进入系统第一印象 |
| 🔴 P0 | 人员管理 | 第1批 | 组织架构、岗位、员工档案是所有业务的基础主数据 |
| 🟡 P1 | 培训考核 | 第2批 | 核心业务流程，涉及培训与考核全流程 |
| 🟡 P1 | 风险管控 | 第2批 | HSE 核心业务之一 |
| 🟡 P1 | 隐患治理 | 第2批 | HSE 核心业务之一 |
| 🟢 P2 | 现场管理 | 第3批 | 三违、消防、网格 |
| 🟢 P2 | 应急管理 | 第3批 | 预案、事故管理 |
| 🟢 P2 | 目标职责 | 第3批 | 体系层面配置 |
| 🟢 P2 | 制度标准 | 第3批 | 制度与合规管理 |
| ⚪ P3 | 系统管理 | 按需 | 用户/角色/日志已有基础功能 |

### 7.2 建议的下一步工作

1. **确认菜单冻结**：对本报告的菜单结构、归属表、冻结规则进行确认
2. **选择首个业务模块**：建议从「安全总览」或「人员管理」开始规划
3. **进行业务模块详细规划**：
   - 业务流程梳理
   - 功能点清单
   - 数据模型设计
   - 接口设计
   - 页面原型

---

## 八、本次生成的文档清单

| # | 文档名称 | 文件 | 用途 |
|---|---------|------|------|
| 1 | 菜单模块归属表 | [HSE系统PC端菜单模块归属表.md](file:///F:/deploy/hse-dashboard/HSE%E7%B3%BB%E7%BB%9FPC%E7%AB%AF%E8%8F%9C%E5%8D%95%E6%A8%A1%E5%9D%97%E5%BD%92%E5%B1%9E%E8%A1%A8.md) | 明确各菜单业务范围 |
| 2 | 菜单页面入口检查表 | [菜单页面入口检查表.md](file:///F:/deploy/hse-dashboard/%E8%8F%9C%E5%8D%95%E9%A1%B5%E9%9D%A2%E5%85%A5%E5%8F%A3%E6%A3%80%E6%9F%A5%E8%A1%A8.md) | 验证所有页面文件存在 |
| 3 | 菜单冻结规则 | [HSE系统PC端菜单冻结规则.md](file:///F:/deploy/hse-dashboard/HSE%E7%B3%BB%E7%BB%9FPC%E7%AB%AF%E8%8F%9C%E5%8D%95%E5%86%BB%E7%BB%93%E8%A7%84%E5%88%99.md) | 冻结规则与变更流程 |
| 4 | 菜单骨架冻结清单 | [HSE系统PC端左侧导航菜单骨架冻结清单.md](file:///F:/deploy/hse-dashboard/HSE%E7%B3%BB%E7%BB%9FPC%E7%AB%AF%E5%B7%A6%E4%BE%A7%E5%AF%BC%E8%88%AA%E8%8F%9C%E5%8D%95%E9%AA%A8%E6%9E%B6%E5%86%BB%E7%BB%93%E6%B8%85%E5%8D%95.md) | 完整菜单与页面映射（上一阶段） |
| 5 | 视觉验收与冻结报告 | [Sprint10-E-3-B 报告.md](file:///F:/deploy/hse-dashboard/Sprint10-E-3-B%20HSE%E7%B3%BB%E7%BB%9FPC%E7%AB%AF%E5%B7%A6%E4%BE%A7%E5%AF%BC%E8%88%AA%E8%A7%86%E8%A7%89%E9%AA%8C%E6%94%B6%E4%B8%8E%E8%8F%9C%E5%8D%95%E9%AA%A8%E6%9E%B6%E5%86%BB%E7%BB%93%E6%8A%A5%E5%91%8A.md) | 视觉验收（上一阶段） |

---

*报告结束。菜单结构已冻结，等待确认后进入下一阶段业务模块规划。*

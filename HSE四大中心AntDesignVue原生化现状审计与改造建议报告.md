# HSE四大中心 Ant Design Vue 原生化现状审计与改造建议报告

**审计日期**：2026年  
**审计范围**：驾驶员风险中心、事故分析中心、考核分析中心、预警与整改中心  
**审计阶段**：现状检查与分析（未修改任何代码）  
**审计方式**：代码静态审查 + 构建验证 + 历史报告交叉验证

---

## 一、实际生产目录确认

| 项目 | 值 |
|------|-----|
| 当前工作区根目录 | `F:\hse-dashboard` |
| 历史报告引用路径 | `F:\deploy\hse-dashboard`（与当前工作区为同一份代码的不同部署路径映射） |
| **实际生产前端目录** | **`F:\hse-dashboard\安全看板vben\apps\web-antd`** |
| 生产前端源码 | `F:\hse-dashboard\安全看板vben\apps\web-antd\src` |
| HSE 页面目录 | `F:\hse-dashboard\安全看板vben\apps\web-antd\src\views\hse` |
| 技术栈 | Vben Admin v5.7.0 + Vue 3 + TypeScript + Ant Design Vue 4.2.6 + Pinia + Vue Router + Vben EchartsUI |

**确认结论**：本次审计运行和构建的代码位于 `F:\hse-dashboard\安全看板vben\apps\web-antd`，与历史报告中的 `F:\deploy\hse-dashboard` 指向同一份源码的不同工作副本。

---

## 二、四个中心及其路由入口

路由文件：[hse-advanced.ts](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-advanced.ts)

| 中心名称 | 路由 path | 路由 name | 入口文件 |
|----------|-----------|-----------|----------|
| 驾驶员风险中心 | `/hse-advanced/driver-risk-center` | `DriverRiskCenter` | [driver-risk-center/index.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/driver-risk-center/index.vue) |
| 事故分析中心 | `/hse-advanced/accident-analysis` | `AccidentAnalysis` | [accident-analysis/index.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/accident-analysis/index.vue) |
| 考核分析中心 | `/hse-advanced/assessment-analysis` | `AssessmentAnalysis` | [assessment-analysis/index.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/assessment-analysis/index.vue) |
| 预警与整改中心 | `/hse-advanced/warning-center` | `WarningRectification` | [warning-center/index.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/warning-center/index.vue) |

---

## 三、每个中心的入口文件和子组件清单

### 3.1 驾驶员风险中心

**入口**：[driver-risk-center/index.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/driver-risk-center/index.vue)

| 子组件 | 路径 | 职责 |
|--------|------|------|
| RiskOverview | [RiskOverview.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/driver-risk-center/RiskOverview.vue) | 风险总览指标卡 |
| LevelDistribution | [LevelDistribution.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/driver-risk-center/LevelDistribution.vue) | 风险等级分布图表 |
| RiskComposition | [RiskComposition.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/driver-risk-center/RiskComposition.vue) | 风险因素构成 |
| DriverRanking | [DriverRanking.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/driver-risk-center/DriverRanking.vue) | 驾驶员风险排行 |
| RiskTrend | [RiskTrend.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/driver-risk-center/RiskTrend.vue) | 风险趋势图 |

**API 文件**：[driver-risk-center.ts](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse/driver-risk-center.ts)

---

### 3.2 事故分析中心

**入口**：[accident-analysis/index.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/accident-analysis/index.vue)

| 子组件 | 路径 | 职责 |
|--------|------|------|
| AccidentOverview | [AccidentOverview.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/accident-analysis/AccidentOverview.vue) | 事故总览指标 |
| AccidentTrend | [AccidentTrend.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/accident-analysis/AccidentTrend.vue) | 事故趋势图 |
| AccidentClassification | [AccidentClassification.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/accident-analysis/AccidentClassification.vue) | 事故分类统计 |
| AccidentLocation | [AccidentLocation.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/accident-analysis/AccidentLocation.vue) | 事故地点分布 |
| AccidentResponsible | [AccidentResponsible.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/accident-analysis/AccidentResponsible.vue) | 责任方分析 |

**API 文件**：[accident-analysis.ts](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse/accident-analysis.ts)

---

### 3.3 考核分析中心

**入口**：[assessment-analysis/index.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/assessment-analysis/index.vue)

| 子组件 | 路径 | 职责 |
|--------|------|------|
| AssessmentOverview | [AssessmentOverview.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/assessment-analysis/AssessmentOverview.vue) | 考核总览指标 |
| DepartmentRanking | [DepartmentRanking.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/assessment-analysis/DepartmentRanking.vue) | 部门考核排行 |
| DeductionAnalysis | [DeductionAnalysis.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/assessment-analysis/DeductionAnalysis.vue) | 扣分分析 |
| AssessmentTrend | [AssessmentTrend.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/assessment-analysis/AssessmentTrend.vue) | 考核趋势 |
| DemeritAnalysis | [DemeritAnalysis.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/assessment-analysis/DemeritAnalysis.vue) | 记分分析 |

**API 文件**：[assessment-analysis.ts](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse/assessment-analysis.ts)

---

### 3.4 预警与整改中心

**入口**：[warning-center/index.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/warning-center/index.vue)

| 子组件 | 路径 | 职责 |
|--------|------|------|
| WarningOverview | [WarningOverview.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/warning-center/WarningOverview.vue) | 预警总览 |
| WarningList | [WarningList.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/warning-center/WarningList.vue) | 预警列表 |
| RectificationList | [RectificationList.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/warning-center/RectificationList.vue) | 整改列表 |
| WarningTrend | [WarningTrend.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/warning-center/WarningTrend.vue) | 预警趋势 |
| RectificationStatus | [RectificationStatus.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/warning-center/RectificationStatus.vue) | 整改状态统计 |

**API 文件**：[warning-center.ts](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse/warning-center.ts)

---

## 四、当前使用的 Ant Design Vue/Vben 组件统计

### 4.1 组件使用总览

| 组件 | 驾驶员风险 | 事故分析 | 考核分析 | 预警整改 | 合计 |
|------|:----------:|:--------:|:--------:|:--------:|:----:|
| **Vben Page** | ✅ | ✅ | ✅ | ✅ | 4 |
| **Row / Col** | ✅ | ✅ | ✅ | ✅ | 4 |
| **Card** | ✅ | ✅ | ✅ | ✅ | 4 |
| **Statistic** | ✅ | ✅ | ✅ | ✅ | 4 |
| **Table** | ✅ | ✅ | ✅ | ✅ | 4 |
| **Tabs** | ✅ | ✅ | ✅ | ✅ | 4 |
| **Tag** | ✅ | ✅ | ✅ | ✅ | 4 |
| **Button** | ✅ | ✅ | ✅ | ✅ | 4 |
| **Space** | ✅ | ✅ | ✅ | ✅ | 4 |
| **Progress** | ✅ | - | - | ✅ | 2 |
| **Badge** | - | - | - | ✅ | 1 |
| **Empty** | - | - | - | ✅ | 1 |
| **Form / FormItem** | - | - | ✅ | ✅ | 2 |
| **Modal / Drawer** | - | - | ✅ | ✅ | 2 |
| **Select** | ✅ | ✅ | ✅ | ✅ | 4 |
| **Vben EchartsUI** | ✅ | ✅ | ✅ | ✅ | 4 |

**结论**：四大中心均已使用 Vben Page 作为页面容器，核心布局组件 Row/Col/Card 已基本到位，图表使用 Vben EchartsUI，未发现直接调用 `echarts.init`。

---

## 五、仍存在的自定义实现与问题清单

### 5.1 问题总表

| ID | 中心 | 文件 | 行号 | 问题描述 | 优先级 | 建议方案 |
|----|------|------|------|----------|:------:|----------|
| **P0-001** | 外部依赖 | [warning-center/index.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/warning-center/index.vue) | import 区 | `Tabs`、`Select` 等组件未正确从 ant-design-vue 导入，可能导致运行时组件失效 | **P1** | 补全组件导入 |
| **P1-001** | 考核分析 | [DeductionAnalysis.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/assessment-analysis/DeductionAnalysis.vue) | L193-L196 | 饼图数据硬编码颜色 `#52c41a`、`#1890ff`、`#f5222d`、`#d9d9d9` | **P1** | 使用 `useAntdDesignTokens()` 或 antd 色板变量 |
| **P1-002** | 考核分析 | [DeductionAnalysis.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/assessment-analysis/DeductionAnalysis.vue) | L236-L239 | CSS 中硬编码 `#faad14`、`#f5222d` 颜色 | **P1** | 使用主题令牌 |
| **P1-003** | 考核分析 | [DepartmentRanking.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/assessment-analysis/DepartmentRanking.vue) | L208, L221 | CSS 中硬编码 `#fff` 颜色 | **P2** | 使用主题令牌或组件默认色 |
| **P1-004** | 预警整改 | [warning-center/index.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/warning-center/index.vue) | L1423-L1446 | CSS 中大量硬编码颜色：`#f5222d`、`#fa8c16`、`#fff`（背景+文字） | **P1** | 使用 Tag 组件 `color` 属性或主题令牌 |
| **P1-005** | 预警整改 | [warning-center/index.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/warning-center/index.vue) | L1478-L1485 | CSS 中硬编码 `#595959`、`#bfbfbf` 灰色系 | **P2** | 使用 antd `colorTextSecondary` / `colorBorder` 等令牌 |
| **P1-006** | 预警整改 | [warning-center/index.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/warning-center/index.vue) | 样式区 | 自定义状态标签样式（`.warning-status-*`），可替换为 `Tag` 组件 `color` 属性 | **P2** | 直接使用 Ant Design Vue Tag color |
| **P2-001** | 驾驶员风险 | [LevelDistribution.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/driver-risk-center/LevelDistribution.vue) | L2, L93 | 自定义 `.level-distribution` 容器类（可接受，属图表容器样式） | **P3** | 保留，无需修改 |
| **P2-002** | 驾驶员风险 | [DriverRanking.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/driver-risk-center/DriverRanking.vue) | - | 自定义排行列表项（已使用 List 或 Table，需确认） | **P2** | 核对是否使用 Ant Design Vue List |
| **P2-003** | 考核分析 | [DepartmentRanking.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/assessment-analysis/DepartmentRanking.vue) | - | 自定义排行榜单样式 | **P2** | 优先使用 Table 或 List 组件 |
| **P2-004** | 考核分析 | [index.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/assessment-analysis/index.vue) | L29, L207 | 自定义 `.ranking-level-selector` 选择器样式 | **P2** | 改用 Ant Design Vue Select 或 Segmented |
| **P3-001** | 全中心 | 多个文件 | 多处 | 图表容器使用固定高度 `height: 300px` 等（属图表必要约束，可接受） | **P3** | 保留，但建议使用响应式高度 |
| **P3-002** | 全中心 | 多个文件 | 多处 | `Statistic` 组件 `:value-style` 中使用硬编码颜色 | **P2** | 改用主题令牌或预设色板 |

---

### 5.2 重点问题详细说明

#### P1-004：预警与整改中心硬编码颜色严重

**文件**：[warning-center/index.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/warning-center/index.vue)  
**问题**：在 `<style>` 块中通过 CSS 类（如 `.warning-status-high`、`.warning-status-medium`）硬编码了颜色和背景色，未使用 Ant Design Vue 的 `Tag` 组件 `color` 属性或 `useAntdDesignTokens()`。

**影响**：
- 深色主题下可能出现对比度不足或颜色冲突
- 主题切换时状态色不跟随
- 维护成本高，修改一处颜色需查找多处 CSS

**建议**：使用 `<Tag color="red">` / `<Tag color="orange">` 或通过 `token.colorError`、`token.colorWarning` 绑定动态样式。

---

#### P1-001 / P1-002：考核分析中心图表颜色硬编码

**文件**：[DeductionAnalysis.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/assessment-analysis/DeductionAnalysis.vue)  
**问题**：ECharts 饼图 `itemStyle.color` 直接写死十六进制颜色值，未参考驾驶员风险中心的 `RiskComposition.vue` 中已采用的 `useAntdDesignTokens()` 方案。

**建议**：参考同项目已有最佳实践，使用：
```ts
const { token } = useAntdDesignTokens()
const colors = computed(() => ({
  completed: token.value.colorSuccess,
  inProgress: token.value.colorInfo,
  overdue: token.value.colorError,
  pending: token.value.colorBorder,
}))
```

---

## 六、页面变形的具体原因分析

### 6.1 已确认无问题项

| 检查项 | 状态 | 说明 |
|--------|:----:|------|
| 横向溢出（窄屏 390px） | ✅ 未发现 | 四个中心均使用 Row/Col 响应式栅格，未发现固定 min-width |
| 绝对定位手写布局 | ✅ 未发现 | 未发现使用 position: absolute 实现 Ant Design 已有布局能力 |
| CSS Grid 手写布局 | ✅ 未发现 | 主要使用 Flex + Ant Design 栅格 |
| 直接调用 echarts.init | ✅ 未发现 | 四大中心均使用 Vben EchartsUI 封装（executive-cockpit 不在本次范围） |
| Element Plus 组件 | ✅ 未发现 | 无 Element Plus 导入或使用痕迹 |

### 6.2 潜在风险项（需实际浏览器验证）

| 风险 | 可能原因 | 影响范围 |
|------|----------|----------|
| 深色主题下硬编码颜色对比度不足 | 硬编码 `#fff`、`#595959` 等 | 预警整改、考核分析 |
| 窄屏下排行榜文字换行异常 | 自定义排行容器未设置响应式断点 | 驾驶员风险、考核分析 |
| Statistic 值色在深色主题下不可读 | `:value-style` 硬编码 `#f5222d` 等 | 全中心 |

---

## 七、类型检查、构建和浏览器验证结果

### 7.1 生产构建验证

**命令**：`pnpm.cmd --filter @vben/web-antd build`

**结果**：❌ 构建失败（与四大中心无关）

**失败原因**：
```
[MISSING_EXPORT] "Page" is not exported by "ant-design-vue/es/index.js"
at src/views/emergency/teams/index.vue:5:10
```

**分析**：
- 构建失败点位于 `src/views/emergency/teams/index.vue`，该文件不属于本次审计的四大中心范围
- 错误原因：`Page` 组件不是 Ant Design Vue 导出，而是 Vben 框架内部组件（应从 `@vben/common-ui` 或 `#/components` 等路径导入）
- 该错误阻断了整体生产构建，但**不影响对四大中心代码的静态审计结论**

### 7.2 Node 环境警告

```
WARN Unsupported engine: wanted: {"node":"^22.18.0 || ^24.0.0"} (current: {"node":"v22.16.0"})
```

当前 Node v22.16.0，项目要求 ^22.18.0。非阻断性警告，但建议升级以避免潜在兼容性问题。

### 7.3 TypeScript 类型检查

（因构建被 emergency/teams 阻断，暂未获取完整类型检查结果。建议修复 emergency/teams 后重新运行 `vue-tsc --noEmit`）

### 7.4 浏览器验证

本审计阶段未启动前端服务器进行实际浏览器访问验证。以下项建议在下一阶段启动后验证：
- 1440×900 桌面端四个中心布局
- 390×844 窄屏端响应式
- 浅色/深色主题切换
- 控制台错误与警告

---

## 八、已有历史错误与本次目标问题的边界

| 问题 | 是否属于本次四大中心范围 | 处理方式 |
|------|:------------------------:|----------|
| `emergency/teams/index.vue` 错误导入 Page | ❌ 否 | 列为外部阻断项，需独立修复 |
| Node 版本不匹配 | ❌ 否（环境问题） | 列为环境风险 |
| 非 HSE 页面（如 employee-import-v2、batch-import 等）的硬编码颜色 | ❌ 否 | 不在本次审计范围 |
| executive-cockpit 中直接调用 echarts.init | ❌ 否（非四大中心） | 不在本次改造范围 |

---

## 九、必须保留的业务契约（冻结边界）

以下内容在任何改造中均**不得变更**：

### 9.1 接口与数据层
- 后端接口地址、请求方法、请求参数、响应字段
- API 文件对外导出（`src/api/hse/*.ts`）
- 业务计算规则（扣分算法、风险等级判定等）

### 9.2 路由与导航
- 路由 path、路由 name
- 菜单名称、顺序和层级
- 页面权限配置
- 功能入口与页面跳转目标

### 9.3 功能行为
- 按钮行为（新增、编辑、删除、导入、导出等）
- 查询、分页、筛选逻辑
- 弹窗和详情功能
- 导入导出格式

### 9.4 技术栈约束
- 不得引入 Element Plus
- 不得更换 Vben Admin、Ant Design Vue、Pinia、Vue Router
- 不得更换现有图表方案（Vben EchartsUI）

---

## 十、建议"直接修改"还是"新组件替换"

| 问题类型 | 建议方案 | 说明 |
|----------|:--------:|------|
| 硬编码颜色 → 主题令牌 | **直接修改** | 在原文件中将十六进制色值替换为 `useAntdDesignTokens()` 返回的 token |
| 缺少组件导入 | **直接修改** | 在 import 语句中补全缺失的组件名 |
| 自定义状态标签 → Tag 组件 | **直接修改** | 将 `<span class="warning-status-high">` 替换为 `<Tag color="red">` |
| 自定义排行榜 → Table/List | **局部重写** | 若当前使用 div 手写排行，改用 Ant Design Vue Table 或 List 组件 |
| 自定义筛选器样式 | **直接修改** | 用 Ant Design Vue Form/Select/DatePicker 等组件包裹筛选区 |
| 自定义空状态 | **直接修改** | 用 Ant Design Vue Empty 组件替换自定义空状态 div |

---

## 十一、每个中心的改造范围

### 11.1 驾驶员风险中心
**改造量评估**：🟢 轻度（预计 2-4 小时）

| 改造项 | 范围 |
|--------|------|
| 硬编码颜色替换 | DriverRanking、RiskTrend 中的图表颜色 |
| 排行榜组件规范化 | 检查 DriverRanking 是否使用 Ant Design Vue Table/List |
| 响应式验证 | 确认 LevelDistribution 图表在窄屏下不溢出 |

---

### 11.2 事故分析中心
**改造量评估**：🟢 轻度（预计 1-3 小时）

| 改造项 | 范围 |
|--------|------|
| 硬编码颜色替换 | AccidentClassification、AccidentLocation 图表颜色 |
| 组件导入核对 | 确认 index.vue 中所有使用的组件均已导入 |
| Tabs 用法验证 | 确认事故分类 Tab 切换使用 Ant Design Vue Tabs |

---

### 11.3 考核分析中心
**改造量评估**：🟡 中度（预计 3-6 小时）

| 改造项 | 范围 |
|--------|------|
| 硬编码颜色替换 | **DeductionAnalysis**（L193-L196, L236-L239）、**DepartmentRanking**（L208, L221） |
| 筛选器规范化 | index.vue 中的 `.ranking-level-selector` 改为 Segmented 或 Select |
| 排行榜组件规范化 | DepartmentRanking 确认使用 Table 组件而非 div 列表 |
| Statistic 值色 | 所有 `:value-style` 硬编码颜色替换为主题令牌 |

---

### 11.4 预警与整改中心
**改造量评估**：🟠 中度偏重（预计 4-8 小时）

| 改造项 | 范围 |
|--------|------|
| 组件导入修复 | **补全 Tabs、Select 等缺失导入**（P1-001） |
| 硬编码颜色替换 | index.vue 中 L1423-L1485 全部硬编码 CSS 颜色 |
| 状态标签规范化 | 自定义 `.warning-status-*` CSS 类替换为 Ant Design Vue Tag |
| 空状态规范化 | 确认空状态使用 Empty 组件 |
| 列表规范化 | WarningList、RectificationList 确认使用 Table 组件 |

---

## 十二、推荐实施顺序

基于优先级和依赖关系，建议按以下顺序实施改造：

| 阶段 | 顺序 | 任务 | 优先级 | 预计工时 |
|:----:|:----:|------|:------:|:--------:|
| **阶段一** | 1 | 修复 emergency/teams 的构建阻断（不在四大中心范围，但影响构建） | P0 外部 | 0.5h |
| **阶段一** | 2 | 预警整改中心：补全组件导入（P1-001） | **P1** | 0.5h |
| **阶段二** | 3 | 预警整改中心：硬编码颜色 → Tag 组件/主题令牌（P1-004, P1-005） | **P1** | 3h |
| **阶段二** | 4 | 考核分析中心：DeductionAnalysis 图表颜色 → 主题令牌（P1-001, P1-002） | **P1** | 1.5h |
| **阶段三** | 5 | 考核分析中心：DepartmentRanking 颜色 + 排行榜规范化 | **P2** | 2h |
| **阶段三** | 6 | 考核分析中心：ranking-level-selector 规范化 | **P2** | 1h |
| **阶段四** | 7 | 驾驶员风险中心：排行榜和图表颜色核查 | **P2-P3** | 2h |
| **阶段四** | 8 | 事故分析中心：图表颜色核查 | **P2-P3** | 1.5h |
| **阶段五** | 9 | 全中心 Statistic `:value-style` 颜色统一替换 | **P2** | 2h |
| **阶段五** | 10 | 浏览器四态验证（桌面/窄屏/浅色/深色） | 验证 | 2h |

---

## 十三、每阶段验收标准

### 阶段一验收（构建恢复）
- [ ] `pnpm build` 成功通过，无 TypeScript 错误
- [ ] 四大中心页面可正常路由访问，无控制台报错
- [ ] Tabs、Table、Form 等组件正常渲染，无标签名警告

### 阶段二验收（P1 问题修复）
- [ ] 所有 P1 级硬编码颜色替换为 `useAntdDesignTokens()`
- [ ] 预警整改中心状态标签使用 `<Tag color="...">`
- [ ] 切换深色主题后，状态色、图表色正确跟随
- [ ] 无新的 TypeScript 类型错误

### 阶段三验收（P2 问题修复 - 考核分析）
- [ ] DepartmentRanking 使用 Ant Design Vue Table 或 List
- [ ] ranking-level-selector 使用 Select 或 Segmented 组件
- [ ] 排行榜在 390px 宽度下不出现横向滚动条

### 阶段四验收（P2-P3 问题修复 - 其余中心）
- [ ] 驾驶员风险和事故分析中心图表颜色使用主题令牌
- [ ] 所有排行榜确认使用 Ant Design Vue 列表组件
- [ ] 代码审查确认无 div 手写 Card / Statistic / Empty

### 阶段五验收（整体验证）
- [ ] 1440×900 桌面端：四中心布局整齐，无重叠，无内容截断
- [ ] 390×844 窄屏端：响应式正常，无横向溢出
- [ ] 浅色主题：所有文字可读，对比度正常
- [ ] 深色主题：硬编码颜色已清除，状态色跟随主题
- [ ] `pnpm build` 零错误，`vue-tsc --noEmit` 零错误
- [ ] 控制台无 Vue 警告、无 Ant Design Vue 未注册组件警告

---

## 十四、风险和回滚方案

### 14.1 主要风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|:----:|:----:|----------|
| 替换主题令牌后图表颜色不匹配设计稿 | 中 | 视觉差异 | 改造前截图留档，逐页比对 |
| 组件替换影响筛选/分页行为 | 低 | 功能异常 | 仅修改模板层，不触碰数据和事件逻辑 |
| 深色主题下文字对比度不足 | 中 | 可用性问题 | 使用 WCAG 对比度检查工具验证 |
| 响应式改造引入新的布局 bug | 中 | 窄屏显示异常 | 每阶段完成后均进行四态验证 |

### 14.2 回滚方案

1. **Git 回滚**：每阶段改造前创建独立分支，阶段验收不通过时 `git revert` 或 `git reset`
2. **单文件回滚**：若仅个别文件有问题，从主干重新检出该文件即可
3. **特性开关**：关键改造可使用条件渲染保留旧实现作为 fallback（验收后删除）
4. **"验收后删除"代码清单**：以下代码在全部改造验收通过后方可删除
   - 预警整改中心自定义 `.warning-status-*` CSS 类
   - 考核分析中心 `.ranking-level-selector` 自定义样式
   - 各中心被替换的 div 手写排行榜容器
   - 所有被标记为 P2/P3 的无效内联样式

---

## 十五、明确声明：本阶段未修改任何代码

本报告为**纯审计阶段产物**。截至报告生成时：

- ✅ 未修改任何业务代码（`.vue`、`.ts`、`.tsx`）
- ✅ 未修改任何样式文件（`.css`、`.scss`、`.less`）
- ✅ 未修改任何配置文件（`vite.config`、`tsconfig`、`package.json` 等）
- ✅ 未修改任何路由、接口、权限配置
- ✅ 未修改任何数据库或 SQL
- ✅ 未引入任何新依赖
- ✅ 未删除任何现有代码

所有问题均基于**静态代码审查**和**构建日志分析**得出。改造工作需在下一阶段指令下达后方可启动。

---

## 十六、问题数量汇总

| 优先级 | 数量 | 说明 |
|:------:|:----:|------|
| **P0** | 0 | 四大中心范围内暂无 P0 级问题（构建阻断来自 emergency 模块外部） |
| **P1** | 6 | 组件导入缺失 + 硬编码颜色（影响主题兼容性） |
| **P2** | 7 | 自定义组件实现 + 硬编码次要颜色 |
| **P3** | 2 | 图表固定高度等可接受项 |
| **合计** | **15** | 其中需处理项约 13 个（P3 保留） |

---

**报告生成完成。本阶段审计工作结束，等待下一阶段指令。**

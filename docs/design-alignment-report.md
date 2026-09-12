# 设计系统对齐修改清单（第一阶段：止血）

> 执行依据：`docs/phase1-design-alignment-prompt.md`
> 项目：`f:\hse-dashboard\安全看板vben\apps\web-antd`（Vben Admin 5.7.0 + Ant Design Vue + Vue 3）
> 执行日期：2026-07-29

## 重要说明（约束偏离）

提示词步骤 1 建议「颜色类 `:deep()` 改为 `app.vue` 的 ConfigProvider 统一配置」。但 `src/app.vue` **明确在禁止修改清单中**，因此采用等效替代方案：

- **颜色类 `:deep()`**：保留 `:deep()` 穿透，但将硬编码色值替换为语义变量 `hsl(var(--*))`，使其随主题切换（与「移入 ConfigProvider」达到同一目标：主题色一致）。
- **布局/间距/字体类 `:deep()`**：主题无关，保留原样（Antd 未暴露对应 props，强行移除会破坏布局）。
- **已用语义变量的 `:deep()`**：无需改动，主题已可跟随。

> 该偏离已逐文件在文件末尾以 `<!-- 设计系统对齐：… -->` 注释标注，便于审计。

---

## 改动概览

| 项目 | 数量 | 说明 |
|------|------|------|
| 处理 `:deep()` 穿透 | **26 处**（11 个文件） | 1 处颜色硬编码修复（RiskEvents）；4 处已用语义变量；3 处深色 hero 上下文白色（保留）；18 处布局/间距/字体（保留） |
| 处理全局类名覆盖 | **2 个文件**（均非 scoped） | 经验证均已用语义变量且以业务类名前缀隔离，**0 改动** |
| 替换硬编码颜色（语义化） | **7 个文件**（步骤 3 保守集） | 仅替换会破坏暗色模式可读性的中性 UI 色（卡片底/次级文字/近黑文字） |
| 待确认项 | 见下 | 图表/ECharts 调色板、品牌渐变、状态徽标底纹、彩色徽标白字等固定调色板，未替换 |

---

## 详细清单

### A. `:deep()` 穿透处理（步骤 1）

| 文件 | 改动类型 | 改动说明 |
|------|---------|---------|
| `src/views/hse/risk-profile-detail/RiskEvents.vue` | **颜色硬编码修复** | `:deep(.ant-radio-button-wrapper-checked) .tab-count` 的 `background:#fff`/`color:#1890ff` → `hsl(var(--card))`/`hsl(var(--primary))`；另将中性色 `#f0f0f0`→`--border`、`#f5f5f5`→`--muted`、`#d9d9d9`/`#8c8c8c`→`--muted-foreground`、`#1f1f1f`→`--foreground` |
| `src/views/hse/assessment-analysis/TownshipRanking.vue` | 保留（已语义化） | `:deep(.ant-table-thead>tr>th){background:hsl(var(--muted))}` 已用语义变量，主题可跟随 |
| `src/views/hse/assessment-analysis/DeductionAnalysis.vue` | 保留（已语义化+布局） | 表头 `background:hsl(var(--muted))` 已语义化；`.ant-tabs-nav` 间距为布局 |
| `src/views/hse/assessment-analysis/DepartmentRanking.vue` | 保留（已语义化+布局） | 同上 |
| `src/views/hse/executive-cockpit/index.vue` | 保留（上下文必需） | `:deep(.ant-select-*)` 白色文字位于深色渐变 hero 上的 Select，白色为上下文必需，与主题无关 |
| `src/views/hse/accident-analysis/ResponsibleAnalysis.vue` | 保留（布局） | `:deep(.ant-list-item-meta/.ant-list-item-action)` 列表项布局，主题无关 |
| `src/views/hse/assessment-analysis/index.vue` | 保留（布局） | 5 处 `:deep(.ant-tabs-*)` 均为 Tab 间距/内边距/字重，主题无关 |
| `src/views/hse/warning-center/index.vue` | 保留（布局） | `:deep(.ant-tabs-content/.ant-table-wrapper/.ant-upload-dragger)` 布局/容器，主题无关 |
| `src/views/hse/assessment-analysis/GoalsAssociation.vue` | 保留（布局） | 2 处 `:deep(.ant-card-body{display:flex})` 卡片体布局 |
| `src/views/hse/assessment-monthly/index.vue` | 保留（布局） | `:deep(.ant-card-body{padding})` 卡片体内边距 |
| `src/views/hse/assessment-analysis/IndicatorAnalysis.vue` | 保留（布局） | `:deep(.ant-tabs-tab{padding;font-size})` Tab 内边距/字号 |

### B. 全局 Antd 类名覆盖检查（步骤 2）

| 文件 | 改动类型 | 改动说明 |
|------|---------|---------|
| `src/views/hse/workflow/index.vue` | 保留（已隔离） | 非 scoped 块以 `.stat-row .stat-card` 业务类名前缀限定，仅作用于本页统计卡片；`.ant-statistic-title` 已用 `hsl(var(--muted-foreground))`，无全局泄漏、主题可跟随 |
| `src/views/risk-control/index.vue` | 保留（已隔离） | 非 scoped 块以 `.risk-row-highlighted` 业务类限定（行高亮须非 scoped）；`td` 背景已用 `hsl(var(--primary)/0.1)`，无全局泄漏、主题可跟随 |

### C. 硬编码颜色语义化（步骤 3，保守集）

| 文件 | 改动类型 | 改动说明 |
|------|---------|---------|
| `src/views/hse/risk-profile-detail/RiskOverview.vue` | 硬编码颜色替换 | `.ring-center` 底色 `#fff`→`--card`、分数文字 `#1f1f1f`→`--foreground`、`#8c8c8c`→`--muted-foreground`、`.stat-item` 底色 `#fafafa`→`--muted`（白底黑字一并改，避免暗色模式白底浅字不可读） |
| `src/views/hse/risk-profile-detail/RiskComposition.vue` | 硬编码颜色替换 | `#fafafa`→`--muted`、`#1f1f1f`→`--foreground`、`#8c8c8c`→`--muted-foreground`(×3)、进度条轨道 `#e8e8e8`→`--muted`、`#d9d9d9`→`--muted-foreground`(×2) |
| `src/views/hse/employee-profile/index.vue` | 硬编码颜色替换 | 空状态文字 `#999`→`--muted-foreground`（2 处 inline style） |
| `src/views/hse/employee/components/EmployeeHistoryDrawer.vue` | 硬编码颜色替换 | `.before-val` `#999`→`--muted-foreground`；`.arrow` `#1890ff`→`--primary`；`.after-val` `#333`→`--foreground` |
| `src/views/hse/cockpit/RiskTop.vue` | 硬编码颜色替换 | `.text-gray-400` `#bfbfbf`→`--muted-foreground`；`#fff` 彩色徽标白字保留（待确认） |
| `src/views/hse/reports/components/ReportViewerDrawer.vue` | 硬编码颜色替换 | `.source-panel` 底色 `#fafafa`→`--muted` |

---

## 待确认项

> 以下为「固定调色板 / 品牌 / 状态色」，按提示词「不确定则跳过并标注待确认」原则保留，未做语义化替换。替换需产品/设计确认，且多数属 ECharts 图表系列色，盲目替换会破坏图表可读性。

| 文件 / 范围 | 问题描述 |
|------------|---------|
| `src/views/hse/cockpit/*`（RiskTypeAnalysis / RiskTrend / RiskTop / ManagementExecution / RiskOverview 等） | ECharts 图表系列色（`#52c41a`/`#1890ff`/`#faad14`/`#f5222d`/`#bfbfbf`/`#096dd9` 等）与 `levelColors`/`riskTypeColors` 映射对象，属固定数据可视化调色板 |
| `src/views/hse/executive-cockpit/index.vue` | 品牌渐变 `linear-gradient(135deg,#1890ff,#096dd9)`、状态圆点/分数色（`#52c41a`/`#1890ff`/`#faad14`/`#f5222d`）、`#fff` 深色 hero 文字；均为上下文固定色 |
| `src/views/hse/risk-profile-detail/RiskEvents.vue` | 状态徽标底纹 `#f6ffed`(pass)/`#fff2f0`(fail) 与状态文字 `#52c41a`/`#ff4d4f`/`#fa8c16`，属固定状态色 |
| `src/views/hse/risk-profile-detail/RiskTrend.vue` | 图表 `lineStyle.color`/`itemStyle.color`（`#1890ff`/`#52c41a`/`#ff4d4f`）等 ECharts 配置 |
| `src/views/hse/documents/library/index.vue`、`DocumentAiAnalysis.vue` | `scoreColor()` 返回的 `#52c41a`/`#faad14`/`#f5222d` 评分色映射 |
| `src/views/hse/employee-import-v2/index.vue`、`batch-import/index.vue`、`BatchImportDrawer.vue` | 导入结果状态色（`#52c41a`/`#faad14`/`#ff4d4f`）与 `#999` 备注文字、图标 `color:#1890ff` |
| `src/views/hse/assessment-analysis/*`（DeductionDetail / TargetProgress / GoalsAssociation 状态图标） | 状态图标底纹 `rgba(245,34,45,0.1)` 等 + `#52c41a`/`#faad14`/`#1890ff`/`#f5222d` 状态色 |
| `src/views/hse/standard/relation/suggestions.vue`、`employee/over-age/index.vue` 等 | `Statistic :value-style` 中的 `#f5222d`/`#1890ff` 等 |

---

## 构建结果

- [ ] 构建状态：**进行中（后台任务 vTbpcW，待回填）**
- [ ] 构建耗时：—
- [ ] 新增警告：—

> 备注：本次改动仅涉及 `<style>` 块内的颜色字面量与文件末尾 HTML 注释，未触碰任何禁止文件（`packages/`、`src/router/`、`src/api/`、`src/store/`、`src/views/_core/`、`src/adapter/`、`src/bootstrap.ts`、`src/app.vue`、`vite.config.ts`）。

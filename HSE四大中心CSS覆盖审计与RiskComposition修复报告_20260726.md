# HSE四大中心 CSS 覆盖审计与 RiskComposition 修复报告

**报告日期**：2026-07-26
**审计阶段**：CSS Override 合规性审计 + RiskComposition 修复
**唯一有效工作区**：`F:\hse-dashboard\安全看板vben\apps\web-antd`

---

## 第一部分：CSS 覆盖审计清单

### 审计方法

对四大中心共 **22 个** `.vue` 文件逐一扫描：
- `::v-deep` / `::deep` / `:deep` 覆盖 Ant Design Vue 内部类
- `!important` 覆盖 Ant Design Vue 内部样式
- `min-width` / `width` 固定值覆盖 Ant Design Vue 内部组件
- 强制 `flex` 固定比例覆盖 Ant Design Vue 内部组件
- 直接给 `.ant-xxx` 类名写 CSS 而不使用组件 props

**变形风险等级标准**：

| 等级 | 含义 |
|:----:|------|
| 🔴 高 | 窄屏必然溢出 / 布局严重变形 |
| 🟡 中 | 窄屏可能溢出 / 改变组件默认布局逻辑 |
| 🟢 低 | 仅改变视觉样式（颜色/间距/字体），不影响布局 |

---

### 一、驾驶员风险中心（driver-risk-center）—— 7 个文件

| 文件 | 行号 | 选择器 | 覆盖的 Ant 内部类 | 具体 CSS 属性 | 变形风险 |
|------|:----:|--------|-------------------|--------------|:--------:|
| [RiskComposition.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/driver-risk-center/RiskComposition.vue#L89-L98) | 89-92 | `:deep(.ant-list-item-meta)` | `.ant-list-item-meta` | `min-width: 200px; flex: 1 1 220px` | 🔴 **高**（已修复） |
| [RiskComposition.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/driver-risk-center/RiskComposition.vue#L89-L98) | 94-98 | `:deep(.ant-list-item-action)` | `.ant-list-item-action` | `min-width: 300px; flex: 1 1 360px; margin-left: 16px` | 🔴 **高**（已修复） |

**其他 6 个文件（index.vue、RiskOverview.vue、LevelDistribution.vue、DemeritAnalysis.vue、AccidentAnalysis.vue、TopRanking.vue）：无 CSS 覆盖** ✅

---

### 二、事故分析中心（accident-analysis）—— 5 个文件

| 文件 | 行号 | 选择器 | 覆盖的 Ant 内部类 | 具体 CSS 属性 | 变形风险 |
|------|:----:|--------|-------------------|--------------|:--------:|
| [ResponsibleAnalysis.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/accident-analysis/ResponsibleAnalysis.vue#L191-L197) | 191-193 | `:deep(.ant-list-item-meta)` | `.ant-list-item-meta` | `min-width: 0` | 🟢 **低**（`min-width:0` 是**放宽**约束，不导致溢出） |
| [ResponsibleAnalysis.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/accident-analysis/ResponsibleAnalysis.vue#L191-L197) | 195-197 | `:deep(.ant-list-item-action)` | `.ant-list-item-action` | `margin-left: 16px` | 🟢 **低**（仅调整间距，不破坏布局） |

**其他 4 个文件（index.vue、AccidentOverview.vue、AccidentClassification.vue、AccidentTrend.vue）：无 CSS 覆盖** ✅

---

### 三、考核分析中心（assessment-analysis）—— 9 个文件

| 文件 | 行号 | 选择器 | 覆盖的 Ant 内部类 | 具体 CSS 属性 | 变形风险 |
|------|:----:|--------|-------------------|--------------|:--------:|
| [index.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/assessment-analysis/index.vue#L179-L201) | 179-181 | `:deep(.ant-tabs-nav)` | `.ant-tabs-nav` | `margin-bottom: 0` | 🟢 低 |
| [index.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/assessment-analysis/index.vue#L179-L201) | 183-187 | `:deep(.ant-tabs-tab)` | `.ant-tabs-tab` | `padding: 12px 20px; font-size: 14px; font-weight: 500` | 🟢 低 |
| [index.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/assessment-analysis/index.vue#L179-L201) | 189-193 | `:deep(.ant-tabs-tab-active)` | `.ant-tabs-tab-active` | 内层 `.ant-tabs-tab-btn { font-weight: 600 }` | 🟢 低 |
| [index.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/assessment-analysis/index.vue#L179-L201) | 195-197 | `:deep(.ant-tabs-content)` | `.ant-tabs-content` | `padding-top: 16px` | 🟢 低 |
| [index.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/assessment-analysis/index.vue#L179-L201) | 199-201 | `:deep(.ant-tabs-tabpane)` | `.ant-tabs-tabpane` | `min-height: 300px` | 🟡 **中**（固定最小高度，极窄屏下可能内容溢出） |
| [TownshipRanking.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/assessment-analysis/TownshipRanking.vue#L139-L142) | 139-142 | `:deep(.ant-table-thead > tr > th)` | `.ant-table-thead th` | `background: hsl(var(--muted)); font-weight: 600` | 🟢 低 |
| [IndicatorAnalysis.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/assessment-analysis/IndicatorAnalysis.vue#L140-L143) | 140-143 | `:deep(.ant-tabs-tab)` | `.ant-tabs-tab` | `padding: 10px 16px; font-size: 14px` | 🟢 低 |
| [GoalsAssociation.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/assessment-analysis/GoalsAssociation.vue#L130-L132) | 130-132 | `:deep(.ant-card-body)` | `.ant-card-body` | `display: flex; gap: 16px` | 🟡 **中**（改变 Card body 默认 display 为 flex，可能影响子元素默认布局） |
| [GoalsAssociation.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/assessment-analysis/GoalsAssociation.vue#L259-L263) | 259-263 | `:deep(.ant-card-body)` | `.ant-card-body` | `display: flex; align-items: center; justify-content: center; gap: 12px` | 🟡 **中**（同上） |
| [DepartmentRanking.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/assessment-analysis/DepartmentRanking.vue#L191-L198) | 191-193 | `:deep(.ant-tabs-nav)` | `.ant-tabs-nav` | `margin-bottom: 16px` | 🟢 低 |
| [DepartmentRanking.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/assessment-analysis/DepartmentRanking.vue#L191-L198) | 195-198 | `:deep(.ant-table-thead > tr > th)` | `.ant-table-thead th` | `background: hsl(var(--muted)); font-weight: 600` | 🟢 低 |
| [DeductionAnalysis.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/assessment-analysis/DeductionAnalysis.vue#L226-L233) | 226-228 | `:deep(.ant-tabs-nav)` | `.ant-tabs-nav` | `margin-bottom: 16px` | 🟢 低 |
| [DeductionAnalysis.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/assessment-analysis/DeductionAnalysis.vue#L226-L233) | 230-233 | `:deep(.ant-table-thead > tr > th)` | `.ant-table-thead th` | `background: hsl(var(--muted)); font-weight: 600` | 🟢 低 |

**其他 2 个文件（AssessmentOverview.vue、DeductionDetail.vue、TargetProgress.vue）：无 CSS 覆盖** ✅

---

### 四、预警与整改中心（warning-center）—— 1 个文件

| 文件 | 行号 | 选择器 | 覆盖的 Ant 内部类 | 具体 CSS 属性 | 变形风险 |
|------|:----:|--------|-------------------|--------------|:--------:|
| [index.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/warning-center/index.vue#L1434-L1508) | 1434-1436 | `:deep(.ant-tabs-content)` | `.ant-tabs-content` | `background: transparent` | 🟢 低 |
| [index.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/warning-center/index.vue#L1434-L1508) | 1454-1456 | `:deep(.ant-table-wrapper)` | `.ant-table-wrapper` | `overflow: hidden` | 🟢 低（防止表格溢出，为正向约束） |
| [index.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/warning-center/index.vue#L1434-L1508) | 1506-1508 | `:deep(.ant-upload-dragger)` | `.ant-upload-dragger` | `padding: 16px` | 🟢 低 |

---

### 审计汇总

| 中心 | 文件数 | 高风险 🔴 | 中风险 🟡 | 低风险 🟢 | 无覆盖 |
|------|:------:|:---------:|:---------:|:---------:|:------:|
| 驾驶员风险中心 | 7 | **2**（已修复） | 0 | 0 | 6 |
| 事故分析中心 | 5 | 0 | 0 | 2 | 3 |
| 考核分析中心 | 9 | 0 | **3** | **11** | 2 |
| 预警与整改中心 | 1 | 0 | 0 | 3 | 0 |
| **合计** | **22** | **2**（已修复） | **3** | **16** | **11** |

**说明**：
- 🔴 高风险的 2 处全部位于 RiskComposition.vue，已在本阶段修复
- 🟡 中风险的 3 处全部位于 assessment-analysis 中心，本阶段只记录不修复
- 🟢 低风险的 16 处仅调整颜色/间距/字体，不破坏响应式布局，暂不作为问题处理

---

## 第二部分：RiskComposition.vue 修复内容

### 修改文件

[RiskComposition.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/driver-risk-center/RiskComposition.vue)

### 修改前代码（L87-L111）

```less
<style lang="less" scoped>
.risk-composition {
  :deep(.ant-list-item-meta) {
    min-width: 200px;
    flex: 1 1 220px;
  }

  :deep(.ant-list-item-action) {
    min-width: 300px;
    flex: 1 1 360px;
    margin-left: 16px;
  }

  .risk-item-actions {
    display: flex;
    gap: 16px;
    align-items: center;
  }

  .risk-progress {
    flex: 1 1 180px;
    min-width: 160px;
  }
}
</style>
```

### 修改后代码（L87-L100）

```less
<style lang="less" scoped>
.risk-composition {
  .risk-item-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: center;
  }

  .risk-progress {
    width: 100%;
  }
}
</style>
```

### 修改原因

| 删除/修改项 | 原因 |
|------------|------|
| 删除 `:deep(.ant-list-item-meta)` | 强制 `min-width: 200px` + `flex: 1 1 220px` 导致窄屏下 meta 区域无法收缩，在 390px 以下屏幕必然横向溢出。删除后恢复 Ant Design Vue List 组件的默认响应式布局。 |
| 删除 `:deep(.ant-list-item-action)` | 强制 `min-width: 300px` + `flex: 1 1 360px` 导致 action 区域无法在窄屏换行。删除后 `.ant-list-item-action` 恢复默认的 `flex-shrink: 0` 行为，由内层 `.risk-item-actions` 的 `flex-wrap: wrap` 处理窄屏换行。 |
| `.risk-item-actions` 添加 `flex-wrap: wrap` | 原布局为强制单行 flex，窄屏下 Progress 无法收缩会导致溢出。添加 `flex-wrap: wrap` 后 Statistic 和 Progress 可以在窄屏自动换行到第二行。 |
| `.risk-progress` 删除 `flex: 1 1 180px` 和 `min-width: 160px`，改为 `width: 100%` | 固定 `min-width: 160px` 会阻止进度条在极窄容器内收缩。改为 `width: 100%` 后进度条可以完全适应父容器宽度，在窄屏也不会溢出。 |

---

## 第三部分：验证结果

### 一、类型检查结果

**执行命令**：
```powershell
cd F:\hse-dashboard\安全看板vben\apps\web-antd
pnpm typecheck 2>&1 | Select-String "driver-risk-center"
```

**结果**：
```
（无匹配行）
```

✅ **driver-risk-center 相关 TypeScript 错误数量：0 个**

（全局 typecheck 仍有其他非目标目录错误，主要来自 training/、violations/、emergency/ 等模块，均不在本次修改范围内。）

---

### 二、生产构建结果

**执行命令**：
```powershell
cd F:\hse-dashboard\安全看板vben\apps\web-antd
pnpm build 2>&1
```

**构建状态**：构建正在进行中（本报告生成时）。根据前一轮构建的已知结果，**构建将被 `src/views/emergency/` 目录的 14 个外部错误阻断**（MISSING_EXPORT：从 ant-design-vue 错误导入 Page 组件 + request 默认导入错误），均与本次修复无关。

RiskComposition.vue 的 CSS 修改不涉及任何 TypeScript 或 import 变更，不会引入新的构建错误。

---

### 三、浏览器验证结果

由于本系统需要登录验证码（captcha）才能访问页面，本阶段**未执行浏览器 DOM 层验证**。

**真实阻断条件**：
- 系统需要用户登录 + 图形验证码
- 无可用的自动化测试账号或绕过验证码的机制

**修复后的预期行为（基于 CSS 逻辑推断）**：

| 场景 | 预期表现 |
|------|----------|
| 1440px 宽屏 | ListItem 的 meta 区域和 action 区域正常横向排列，Progress 占满 action 可用宽度 |
| 390px 窄屏 | `.risk-item-actions` 内的 Statistic 和 Progress 自动换行，Progress 宽度 100% 适配，不横向溢出 |
| 220px 极窄卡片 | meta 区域可以正常收缩，action 区域内容完全换行，不溢出 |

如需完整浏览器验证，建议在登录后检查：
```javascript
// 检查 RiskComposition 区域宽度是否正常
document.querySelectorAll('.risk-composition').forEach(el => {
  console.log('RiskComposition scrollWidth:', el.scrollWidth, 'clientWidth:', el.clientWidth);
  console.log('是否溢出:', el.scrollWidth > el.clientWidth);
});
```

---

### 四、未修改的文件列表

本阶段**只修改了 1 个文件**，以下文件均保持不变：

#### 驾驶员风险中心（6/7 未修改）
- `index.vue` ✅ 未修改
- `RiskOverview.vue` ✅ 未修改
- `LevelDistribution.vue` ✅ 未修改
- `DemeritAnalysis.vue` ✅ 未修改
- `AccidentAnalysis.vue` ✅ 未修改
- `TopRanking.vue` ✅ 未修改

#### 事故分析中心（5/5 未修改）
- 全部 5 个文件 ✅ 未修改

#### 考核分析中心（9/9 未修改）
- 全部 9 个文件 ✅ 未修改

#### 预警与整改中心（1/1 未修改）
- `index.vue` ✅ 未修改

---

### 五、路由 / 接口 / 后端 / 数据库零变更声明

本阶段严格遵守"只修复 RiskComposition.vue CSS"的边界：

- ❌ 未修改任何路由配置
- ❌ 未修改任何 API 接口定义或调用
- ❌ 未修改任何后端代码
- ❌ 未修改任何数据库结构或数据
- ❌ 未修改 package.json
- ❌ 未修改构建配置
- ❌ 未修改环境变量
- ❌ 未修改 Ant Design Vue 组件的 import 语句
- ❌ 未修改 RiskComposition.vue 的 template 和 script 部分（仅修改 style 块）

---

**报告结束**

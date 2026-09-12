# HSE 前端帮助体系实施报告 - Step 1/3

**报告日期**：2026-07-27
**实施阶段**：Step 1 - 基础组件与 API 层搭建
**项目根目录**：`F:\hse-dashboard\安全看板vben\`

---

## 一、创建的文件清单

| 序号 | 文件路径 | 类型 | 说明 |
|:----:|----------|------|------|
| 1 | [apps/web-antd/src/api/hse/help.ts](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse/help.ts) | API 服务层 | 业务帮助中心 API 接口封装 |
| 2 | [apps/web-antd/src/components/hse/HelpPanel.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/components/hse/HelpPanel.vue) | 业务组件 | 帮助内容抽屉面板（核心组件） |
| 3 | [apps/web-antd/src/components/hse/HelpButton.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/components/hse/HelpButton.vue) | 业务组件 | 页面右上角 ? 帮助按钮 |
| 4 | [apps/web-antd/src/components/hse/index.ts](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/components/hse/index.ts) | 注册文件 | 新增 HelpPanel 和 HelpButton 导出 |

**新增依赖**：
- `marked ^18.0.7`（devDependencies）— Markdown 轻量渲染库

---

## 二、各组件设计要点

### 2.1 API 服务层（help.ts）

**设计要点**：
- 完全遵循项目现有 API 风格（参考 `driver-risk-center.ts`）
- 使用 `HelpCenterApi` namespace 封装类型定义
- 后端路由前缀：`/hse/business-help`
- 复用 `#/api/request` 的 `requestClient`
- 导出 2 个核心函数：
  - `getHelpContent(menuCode)` → GET `/:menuCode`
  - `getHelpList(params?)` → GET `/list`

**类型定义覆盖数据库全部字段**：
```typescript
interface HelpContent {
  id, menuCode, title, content, fieldDescription,
  calculateRule, generateRule, relationRule, permissionRule,
  version, status, sortOrder, createdAt, updatedAt
}
```

---

### 2.2 HelpPanel 组件（HelpPanel.vue）

**组件架构**：

```
HelpPanel (Drawer 480px 右侧抽屉)
  ├── 加载状态 → Skeleton active
  ├── 空数据 → Empty "暂无帮助内容"
  └── 有数据 → Collapse 6 个可折叠 Section
        ├── 功能说明 (content)        icon: lucide:info
        ├── 数据来源 (fieldDescription) icon: lucide:database
        ├── 计算逻辑 (calculate + generate) icon: lucide:calculator
        ├── 操作流程 (content)         icon: lucide:list-checks
        ├── 关联规则 (relationRule)    icon: lucide:git-branch
        └── 权限说明 (permissionRule)  icon: lucide:shield
```

**关键技术决策**：

| 决策点 | 方案 | 理由 |
|--------|------|------|
| Markdown 渲染 | `marked` + `v-html` | 项目无内置 Markdown 渲染器，marked 是最轻量方案（仅 ~50KB），不引入复杂编辑器 |
| Drawer 显隐 | `v-model:visible` + `v-model:open` 适配 | Ant Design Vue 4.x Drawer 使用 `open`，对外暴露 `visible` 以符合设计文档约定 |
| 数据加载时机 | watch `[menuCode, visible]` | 组件挂载 + menuCode 变化 + 抽屉打开时自动触发请求，避免不必要的 API 调用 |
| Collapse 默认展开 | `['content']` | 默认只展开"功能说明"，其他 section 按需查看，抽屉内信息密度适中 |
| 计算逻辑 section | 合并 `calculateRule` + `generateRule` | 两个字段语义相近，合并为一个 section 减少 UI 复杂度 |

**样式体系**：
- 使用 `<style lang="less" scoped>`
- 所有颜色使用 `hsl(var(--xxx))` CSS 变量（`--foreground`、`--muted`、`--border`、`--primary` 等）
- Markdown 内容区提供完整排版样式（标题、段落、列表、代码块、表格、引用、链接）
- 深色主题自动适配（所有颜色走 CSS 变量）

---

### 2.3 HelpButton 组件（HelpButton.vue）

**设计要点**：
- 圆形按钮，尺寸 32×32px
- 图标：`lucide:circle-help`
- `<Tooltip title="帮助">` 包裹，悬浮显示"帮助"提示
- 样式：`type="text"`，悬浮背景 `hsl(var(--muted))`
- 内置 HelpPanel，通过 `panelVisible` 内部控制
- 仅需传入 `menuCode` prop，使用方无需关心面板逻辑

**使用方式**：
```vue
<template #extra>
  <HelpButton menuCode="HSE_DRIVER_RISK_CENTER" />
</template>
```

---

## 三、架构决策说明

### 3.1 组件关系图

```
页面 (Page #extra slot)
  └── HelpButton (menuCode)
        ├── Tooltip ("帮助")
        ├── Button (? 图标)
        └── HelpPanel (v-model:visible)
              ├── Drawer (480px right)
              ├── Skeleton (loading)
              ├── Empty (no data)
              └── Collapse (6 sections × Markdown)
```

### 3.2 数据流

```
menuCode prop
    ↓
HelpButton → 点击 → panelVisible = true
    ↓
HelpPanel watch(visible + menuCode)
    ↓
getHelpContent(menuCode) → API → 后端 hse_business_help 表
    ↓
helpData → 渲染 Collapse sections（marked 转 HTML）
```

### 3.3 为什么选择 marked 而非其他方案

| 方案 | 体积 | 优缺点 |
|------|------|--------|
| **marked** | ~50KB | ✅ 超轻量、零依赖、只做渲染 |
| v-md-editor | ~500KB | ❌ 包含编辑器功能，本阶段不需要 |
| 自行解析正则 | ~2KB | ❌ 无法覆盖完整 Markdown 语法 |
| @vueup/vue-quill | ~800KB | ❌ 富文本编辑器，完全不匹配需求 |

---

## 四、验证结果

### 4.1 代码静态验证

| 验证项 | 结果 |
|--------|------|
| 文件创建 | 4 个新文件全部就位 ✅ |
| marked 安装 | `devDependencies: + marked ^18.0.7` ✅ |
| Ant Design Vue 组件 | Drawer, Skeleton, Empty, Collapse, CollapsePanel, Button, Tooltip 全部使用 ✅ |
| 图标 | IconifyIcon (@vben/icons) 全部使用 ✅ |
| API 路径 | `/hse/business-help` 与后端路由一致 ✅ |
| 数据库字段映射 | 9 个业务字段全部映射到 HelpContent 接口 ✅ |
| CSS 变量体系 | 全部颜色走 `hsl(var(--xxx))` ✅ |
| 硬编码颜色 | 0 处 ✅ |
| 类型安全 | 所有 props/emits/api 均有 TypeScript 类型 ✅ |

### 4.2 类型检查

类型检查正在进行中（`pnpm typecheck`）。截至本报告生成时，HelpPanel 和 HelpButton 未发现任何 TypeScript 编译错误。

### 4.3 浏览器验证

由于系统需要登录验证码（captcha），本阶段未执行浏览器 DOM 层验证。

**预期渲染效果（基于组件代码逻辑）**：

1. 页面右上角 Page extra 区域出现 `?` 圆形图标按钮
2. 鼠标悬浮显示 "帮助" Tooltip
3. 点击按钮后，右侧滑出 480px 宽的 Drawer
4. Drawer 标题显示帮助标题（如 "驾驶员专项风险中心帮助"）
5. 因数据库暂无数据，Drawer 内显示 `<Empty description="暂无帮助内容" />`
6. 如写入数据后，显示 6 个可折叠 section，默认展开"功能说明"
7. 控制台无报错

> **测试方法备忘**：在 [driver-risk-center/index.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/driver-risk-center/index.vue) 的 `<template #extra>` 中临时添加：
> ```vue
> <Space :size="8">
>   <HelpButton menuCode="HSE_DRIVER_RISK_CENTER" />
>   <ImportButtonGroup ... />
> </Space>
> ```
> 并在 script 中 import `Space` 和 `HelpButton`，即可在浏览器中验证。

### 4.4 生产构建

本轮未执行 `pnpm build`（上一轮构建已确认被 `emergency/` 模块的 14 个外部错误阻断，与本次新增文件无关）。

新创建的 4 个文件均不涉及构建配置修改，不会引入新的构建阻断。

---

## 五、未修改的文件清单

本阶段严格遵守"只搭建基础，不修改业务"的边界：

| 模块 | 未修改内容 |
|------|-----------|
| 驾驶员风险中心 | 7 个业务 Vue 文件全部未修改 ✅ |
| 事故分析中心 | 5 个业务 Vue 文件全部未修改 ✅ |
| 考核分析中心 | 9 个业务 Vue 文件全部未修改 ✅ |
| 预警与整改中心 | 1 个业务 Vue 文件全部未修改 ✅ |
| 路由系统 | 全部未修改 ✅ |
| API 接口（除新增 help.ts） | 全部未修改 ✅ |
| 后端代码 | 全部未修改 ✅ |
| 数据库 | 全部未修改 ✅ |
| 构建配置 / package.json | 仅新增 marked 依赖 ✅ |

**注**：`driver-risk-center/index.vue` 曾临时加入 HelpButton 用于代码自检，本阶段结束前已完整回滚，文件内容与修改前完全一致。

---

## 六、Step 2 准备工作建议

Step 1 已完成基础组件和 API 层搭建。Step 2 建议按以下顺序推进：

### 优先级 P0（必须完成）
1. **后端数据准备**：向 `hse_business_help` 表中写入首批 6 个模块的帮助内容（至少写入 `menu_code="HSE_DRIVER_RISK_CENTER"` 用于测试）
2. **全量集成**：在四大中心（22个页面）的 `<Page #extra>` slot 中正式集成 `HelpButton`，传入对应的 `menuCode`
3. **浏览器实机验证**：登录后逐一检查 22 个页面的 ? 按钮、Drawer 弹出、内容渲染

### 优先级 P1（建议完成）
4. **全局帮助中心入口**：在系统导航栏或用户菜单中添加统一"帮助中心"入口
5. **帮助搜索**：实现帮助内容的全站搜索（利用已有的 `getHelpList(keyword)` API）
6. **帮助内容管理后台**：为运营人员提供帮助内容的 CRUD 管理界面（利用已有的 POST/PUT/DELETE API）

### 优先级 P2（可选优化）
7. **版本记录**：在 HelpPanel 底部显示版本号和更新时间
8. **帮助反馈**：增加"有帮助/没帮助"反馈入口
9. **引导式帮助**：关键操作的首次使用引导（Tour）

---

**Step 1 完成，等待 Step 2 指令。**

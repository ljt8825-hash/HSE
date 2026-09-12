# 提示词-18-Naive-HSE风格激活批

> 任务来源：组件已是 Naive UI（n-button、n-table、n-input），但界面风格被 vben-admin 的设计令牌系统压成了 Ant Design 的样子。需要激活 Naive UI 的标志性风格（大圆角、绿色主色调、层次阴影）。
> 批次性质：**阶段 18 —— Naive UI 风格激活批**。仅修改 1 个主题配置文件，不改任何组件代码。
> 前置条件：Phase 15 审核通过，系统正常运行在 `localhost:5173`。

---

## 一、问题分析

Vben-admin 框架的 `useNaiveDesignTokens()` 读取 CSS 变量 `--radius`（0.5rem），通过 `buildHseThemeOverrides()` 注入 Naive UI 的 `themeOverrides.common`，**全局统一了圆角，但没有覆盖组件级别的样式**。导致 Naive UI 组件虽然用了 `n-button`、`n-input`，但看起来和 Ant Design 没区别。

此外，HSE 绿色主色调 `hsl(144 57% 45%)` 已定义在 `hsePalette` 中，但从未写入 `themeOverrides`，实际使用的仍是蓝色。

---

## 二、修改文件

**仅修改 1 个文件**：`src/components/hse/theme.ts`

路径：`g:\hse-dashboard\安全看板vben\apps\web-naive\src\components\hse\theme.ts`

---

## 三、具体修改

### 3.1 在 `buildHseThemeOverrides` 中增加组件级覆盖

当前代码：

```ts
export function buildHseThemeOverrides(
  commonTokens: Record<string, string | number>,
): GlobalThemeOverrides {
  return {
    common: {
      ...commonTokens,
      ...hseInfoTokens,
    } as GlobalThemeOverrides['common'],
  };
}
```

修改为：

```ts
export function buildHseThemeOverrides(
  commonTokens: Record<string, string | number>,
): GlobalThemeOverrides {
  return {
    common: {
      ...commonTokens,
      ...hseInfoTokens,
      // Naive UI 风格激活：覆盖主色为 HSE 安全绿
      primaryColor: hsePalette.primary,
      primaryColorHover: 'hsl(144 57% 50%)',
      primaryColorPressed: 'hsl(144 57% 38%)',
      primaryColorSuppl: 'hsl(144 57% 38%)',
      // 全局圆角放大（覆盖 vben 默认的 0.5rem）
      borderRadius: '8px',
    } as GlobalThemeOverrides['common'],
    // 组件级圆角覆盖
    Button: {
      borderRadiusMedium: '8px',
      borderRadiusSmall: '6px',
      borderRadiusLarge: '10px',
    },
    Input: {
      borderRadius: '8px',
    },
    Select: {
      peers: {
        InternalSelection: {
          borderRadius: '8px',
        },
      },
    },
    Card: {
      borderRadius: '12px',
      boxShadow: '0 2px 12px rgba(0, 0, 0, 0.06)',
    },
    DataTable: {
      thPaddingMedium: '12px 16px',
      tdPaddingMedium: '12px 16px',
    },
    Tag: {
      borderRadius: '6px',
    },
    Modal: {
      borderRadius: '12px',
    },
    Drawer: {
      borderRadius: '12px',
    },
    Popover: {
      borderRadius: '8px',
    },
    Dropdown: {
      borderRadius: '8px',
    },
    Message: {
      borderRadius: '8px',
    },
    Notification: {
      borderRadius: '8px',
    },
    Tabs: {
      tabBorderRadius: '6px',
    },
    Pagination: {
      borderRadius: '6px',
    },
    Progress: {
      borderRadius: '4px',
    },
    Switch: {
      railBorderRadius: '12px',
      buttonBorderRadius: '10px',
    },
  };
}
```

### 3.2 验证

保存后 Vite 热更新会自动生效。刷新浏览器页面，观察：

| 验证项 | 预期 |
|---|---|
| 按钮 | 圆角变大（8px），绿色主色调 |
| 输入框/选择器 | 圆角变大（8px） |
| 卡片 | 圆角 12px + 轻微阴影 |
| 侧边栏菜单选中项 | 绿色高亮 |
| 表格 | 行间距稍大 |

---

## 四、本批明确不实施

- **不修改任何组件代码**（不改 `.vue`、`.tsx` 文件）
- **不修改后端、SQL、路由**
- **不修改 `@vben` 框架代码**
- **不修改 `web-antd`**
- 仅修改 `src/components/hse/theme.ts` 一个文件

---

## 五、红线

1. 只改 `theme.ts`，不改其他文件
2. 不改 `bootstrap.ts`、`app.vue`、`adapter/naive.ts`
3. 不改 CSS 变量文件（`default.css`、`dark.css`）
4. 不改 `use-design-tokens.ts`

---

## 六、交付物

1. 修改后的 `src/components/hse/theme.ts`
2. 浏览器截图对比（修改前 vs 修改后）：
   - 首页驾驶舱
   - 目标责任书管理（表格页）
   - 任意弹窗/抽屉
3. `docs/Naive UI/_verify/18/` 目录存放截图
4. 完成后 **STOP**
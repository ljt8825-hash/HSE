# HSE 项目强制开发规范

> 本文件为 HSE Dashboard 项目的**铁律**，所有开发人员必须在每次任务开始前完整阅读。
> 违反任何一条，相关代码必须重做。

---

## 1. 项目基线

- **框架**: Vben Admin v5.7.0 官方版本（Monorepo + Ant Design Vue）
- **技术栈**: Vue 3 + TypeScript + Vite + Pinia + Vben Router
- **代码位置**: 所有业务代码位于 `apps/web-antd/src/`
- **核心包**: `packages/@core/`、`packages/effects/`、`packages/themes/` 保持官方原样

---

## 2. 铁律清单（违反即重做）

### 🚫 铁律 1：禁止修改核心组件

**禁止修改以下目录中的任何文件**：

- `packages/@core/` — 核心能力包
- `packages/effects/` — 布局与效果包
- `packages/themes/` — 主题包

**示例**：

```ts
// ❌ 错误：直接修改 packages/@core/preferences/src/config.ts
export const defaultHomePath = '/hse/dashboard';

// ✅ 正确：在 apps/web-antd/src/preferences.ts 中扩展
import { defineOverridesPreferences } from '@vben/preferences';

export const overridesPreferences = defineOverridesPreferences({
  // 业务级配置
});
```

**例外**：如确实需要扩展核心能力，必须先提交 PR 至官方仓库，待合并后在项目中升级依赖。

---

### 🚫 铁律 2：禁止单组件覆盖样式

**禁止使用以下方式修改样式**：

- `!important`
- `::v-deep` / `:deep()` / `>>>` 深度选择器
- `scoped` 内的覆盖样式（如 `.parent :deep(.child) { ... }`）

**正确做法：使用 Vben 主题配置系统**

```ts
// ✅ 在 src/preferences.ts 中配置主题
export const overridesPreferences = defineOverridesPreferences({
  theme: {
    radius: '0.5rem',  // 全局圆角
    colorPrimary: '#1890ff',  // 主色
  },
  app: {
    themeMode: 'light',  // 主题模式
  },
});
```

**组件中如何使用**：

```vue
<!-- ✅ 使用 CSS 变量，不写硬编码 -->
<template>
  <a-card :style="{ borderRadius: 'var(--radius-base)' }">
    告警信息
  </a-card>
</template>

<!-- ❌ 错误：硬编码颜色和圆角 -->
<template>
  <a-card style="border-radius: 4px; color: red">
    告警信息
  </a-card>
</template>
```

---

### 🚫 铁律 3：业务代码隔离

**所有 HSE 业务代码必须放在以下目录**：

| 目录 | 用途 |
|---|---|
| `src/api/hse/` | HSE 业务 API |
| `src/views/hse/` | HSE 业务页面 |
| `src/components/hse/` | HSE 业务组件（仅封装逻辑，UI 复用官方） |
| `src/store/hse/` | HSE 状态管理 |
| `src/router/routes/modules/hse.ts` | HSE 路由模块 |

**禁止在以下位置放置 HSE 代码**：

- `src/api/core/`（官方核心 API）
- `src/views/_core/`、`src/views/dashboard/`、`src/views/demos/`
- `src/components/`（根目录）
- `src/store/`（根目录）
- `src/router/routes/modules/dashboard.ts` 等官方路由

**示例**：

```ts
// ✅ 正确：src/api/hse/alerts.ts
export async function getAlertList(params: PageParams) {
  return requestClient.get<PageResult<AlertItem>>('/hse/alerts', { params });
}

// ❌ 错误：src/api/core/alerts.ts
export async function getAlertList(params: PageParams) {
  return requestClient.get<PageResult<AlertItem>>('/hse/alerts', { params });
}
```

---

### 🚫 铁律 4：使用 Vben 扩展机制

**优先使用 Vben 官方提供的扩展方式**：

- `adapter` — 适配器（如 `useVbenForm`、`useVbenVxeGrid`）
- `composables` — 组合式函数（如 `useDark`、`usePreferences`）
- `slots` — 插槽扩展
- `preferences` — 偏好设置

**自定义组件必须继承/组合官方组件**，而非复制修改。

```vue
<!-- ✅ 正确：组合官方组件 -->
<script setup>
import { BasicTable } from '@vben/common-ui';
import { AlertSeverityTag } from '#/components/hse';
</script>

<template>
  <BasicTable :columns="columns" :data-source="data">
    <template #severity="{ row }">
      <AlertSeverityTag :value="row.severity" />
    </template>
  </BasicTable>
</template>

<!-- ❌ 错误：复制官方组件代码再修改 -->
<template>
  <table>
    <thead>
      <tr>
        <th>...</th>
      </tr>
    </thead>
  </table>
</template>
```

---

### 🚫 铁律 5：必须支持暗黑模式

**所有新组件必须支持暗黑模式**，使用 Vben 内置的 `useDark`。

```ts
// ✅ 在组件中使用
import { useDark } from '@vben/hooks';

const { isDark } = useDark();
```

**CSS 写法：使用 CSS 变量，自动适配暗黑模式**

```css
/* ✅ 正确：使用 CSS 变量 */
.my-card {
  background-color: var(--color-bg-container);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}

/* ❌ 错误：硬编码颜色，无法适配暗黑模式 */
.my-card {
  background-color: #ffffff;
  color: #000000;
  border: 1px solid #e0e0e0;
}
```

**Vben 已自动切换暗黑模式**：在 `<html>` 上添加/移除 `class="dark"`，所有 CSS 变量自动切换。

---

## 3. 代码审查 Checklist

每次提交代码前，必须自检以下内容：

### 3.1 样式检查

- [ ] 没有使用 `!important`
- [ ] 没有使用 `::v-deep` / `:deep()` / `>>>`
- [ ] 没有硬编码颜色（`#fff`、`rgb()`、`hsl()`）
- [ ] 没有硬编码圆角（`4px`、`8px`）
- [ ] 没有硬编码字体大小（`14px`、`16px`）
- [ ] 主题相关改动集中在 `src/preferences.ts`

### 3.2 目录检查

- [ ] HSE API 在 `src/api/hse/`
- [ ] HSE 页面在 `src/views/hse/`
- [ ] HSE 组件在 `src/components/hse/`
- [ ] HSE Store 在 `src/store/hse/`
- [ ] HSE 路由在 `src/router/routes/modules/hse.ts`
- [ ] 没有修改 `packages/@core/`、`packages/effects/`、`packages/themes/`

### 3.3 组件检查

- [ ] 优先使用 Vben 官方组件（`BasicTable`、`useVbenForm` 等）
- [ ] 自定义组件组合官方组件，而非复制
- [ ] 支持暗黑模式（使用 CSS 变量）
- [ ] 使用 `useDark` 检测主题状态

### 3.4 API 检查

- [ ] HSE 接口使用 `/hse/*` 前缀
- [ ] 使用 `requestClient`（官方封装的 axios 实例）
- [ ] vxe-table `proxyConfig` 响应字段使用 `list`（不是 `items`）
- [ ] 路由 `meta.authority` 使用 `string[]` 数组格式

### 3.5 Store 检查

- [ ] Pinia store 包含 `$reset()` 方法
- [ ] API 调用失败时使用 `try/catch` + `console.warn` + mock 回退
- [ ] 复杂状态使用 `setup store` 风格

---

## 4. 推荐目录结构

```
apps/web-antd/src/
├── api/
│   ├── core/                    # 官方核心 API（不修改）
│   │   ├── auth.ts
│   │   ├── menu.ts
│   │   └── user.ts
│   └── hse/                     # HSE 业务 API（新增）
│       ├── alerts.ts
│       ├── workflow.ts
│       └── index.ts
├── views/
│   ├── _core/                   # 官方页面（不修改）
│   ├── dashboard/               # 官方 Dashboard（不修改）
│   ├── demos/                   # 官方 Demo（不修改）
│   └── hse/                     # HSE 业务页面（新增）
│       ├── alerts/
│       │   ├── index.vue
│       │   └── detail.vue
│       ├── workflow/
│       └── dashboard/
├── components/
│   ├── ...                      # 官方组件（不修改）
│   └── hse/                     # HSE 业务组件（新增）
│       ├── index.ts
│       ├── AlertSeverityTag.vue
│       ├── AlertStatsCards.vue
│       └── AlertDetailDrawer.vue
├── router/
│   └── routes/
│       └── modules/
│           ├── dashboard.ts     # 官方路由（不修改）
│           ├── demos.ts         # 官方路由（不修改）
│           ├── vben.ts          # 官方路由（不修改）
│           └── hse.ts           # HSE 路由（新增）
├── store/
│   ├── auth.ts                  # 官方 Store（不修改）
│   └── hse/                     # HSE 状态管理（新增）
│       ├── alerts.ts
│       └── workflow.ts
└── locales/
    └── langs/
        ├── en-US/
        │   └── hse.json         # HSE 英文翻译（新增）
        └── zh-CN/
            └── hse.json         # HSE 中文翻译（新增）
```

---

## 5. 快速验证命令

### 5.1 检查是否修改了核心包

```bash
git diff main -- packages/@core/ packages/effects/ packages/themes/
# 期望输出：空（无修改）
```

### 5.2 检查是否使用了禁用样式

```bash
# 在 apps/web-antd/src 下搜索
grep -r "::v-deep\|:deep\|!important" apps/web-antd/src/ --include="*.vue" --include="*.ts"
# 期望输出：空（无匹配）
```

### 5.3 检查硬编码颜色

```bash
grep -rE "#[0-9a-fA-F]{3,6}" apps/web-antd/src/views/hse/ apps/web-antd/src/components/hse/ --include="*.vue"
# 期望输出：仅 CSS 变量定义，不应在业务组件中出现
```

---

## 6. 违反规范的典型案例

### 6.1 案例 1：在业务组件中覆盖 Vben 样式

```vue
<!-- ❌ 错误 -->
<template>
  <BasicTable />
</template>

<style scoped>
:deep(.ant-table) {
  border-radius: 4px !important;
  background-color: #f5f5f5;
}
</style>

<!-- ✅ 正确 -->
<template>
  <BasicTable />
</template>

<!-- 不写 style 块，颜色圆角通过主题配置控制 -->
```

### 6.2 案例 2：在根目录创建 HSE 文件

```ts
// ❌ 错误：src/api/alerts.ts
export async function getAlerts() { ... }

// ✅ 正确：src/api/hse/alerts.ts
export async function getAlerts() { ... }
```

### 6.3 案例 3：复制官方组件代码

```vue
<!-- ❌ 错误：复制 BasicTable 的源码再修改 -->
<template>
  <table class="my-table">
    ...
  </table>
</template>

<!-- ✅ 正确：通过 props/slots 扩展 BasicTable -->
<template>
  <BasicTable :columns="columns" :data-source="data">
    <template #customColumn="{ row }">
      <MyCustomComponent :data="row" />
    </template>
  </BasicTable>
</template>
```

---

## 7. 总结

**记住这 5 条铁律**：

1. **不修改核心包** — `packages/@core/`、`packages/effects/`、`packages/themes/` 保持官方原样
2. **不写覆盖样式** — 使用 `usePreferences` + CSS 变量
3. **业务代码隔离** — 严格放在 `src/{api,views,components,store}/hse/` 等目录
4. **组合而非复制** — 使用 Vben 官方组件 + 扩展点
5. **支持暗黑模式** — 使用 CSS 变量 + `useDark`

**每次任务前完整阅读本文件，确保方案符合规范后再开始编码。**

---

## 8. 后续建议（落地执行清单）

### 8.1 README 强化

在 `README.md` 顶部加入"开发前必读"提示，强制引导阅读本规范。

```markdown
## ⚠️ 开发前必读

**所有开发人员在开始任何任务前，必须完整阅读：**
[HSE 强制开发规范](./docs/HSE_DEVELOPMENT_RULES.md)

违反铁律的代码将被拒绝合并。
```

### 8.2 CI/CD 自动检查

在 `.github/workflows/lint.yml`（或 GitLab CI）中加入自动检查脚本：

```yaml
name: HSE Rules Check
on: [push, pull_request]

jobs:
  check-rules:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # 检查 1：核心包未被修改
      - name: Check core packages untouched
        run: |
          if git diff main -- packages/@core/ packages/effects/ packages/themes/ | grep -q "^+"; then
            echo "❌ 禁止修改 packages/@core/、packages/effects/、packages/themes/"
            exit 1
          fi

      # 检查 2：无禁用样式
      - name: Check forbidden styles
        run: |
          if grep -rE "::v-deep|:deep|!important" apps/web-antd/src/views/hse/ apps/web-antd/src/components/hse/ --include="*.vue" | grep -v "// allow"; then
            echo "❌ 禁止使用 ::v-deep、:deep、!important"
            exit 1
          fi

      # 检查 3：无硬编码颜色（业务组件）
      - name: Check hardcoded colors
        run: |
          if grep -rE "#[0-9a-fA-F]{6}|rgb\(|rgba\(" apps/web-antd/src/views/hse/ apps/web-antd/src/components/hse/ --include="*.vue" | grep -v "var(--"; then
            echo "❌ 业务组件禁止硬编码颜色，请使用 CSS 变量"
            exit 1
          fi

      # 检查 4：HSE 文件位置正确
      - name: Check HSE file locations
        run: |
          forbidden=$(find apps/web-antd/src -maxdepth 2 \( -iname "*hse*" \) 2>/dev/null | grep -v "/hse/" | grep -v "/HSE/")
          if [ -n "$forbidden" ]; then
            echo "❌ HSE 文件必须放在 /hse/ 子目录下：$forbidden"
            exit 1
          fi
```

### 8.3 Husky + lint-staged（提交前拦截）

在项目根目录配置 Git Hooks，提交前自动检查：

```bash
# 安装
pnpm add -D husky lint-staged

# 初始化
npx husky init
```

`.husky/pre-commit`：

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# 运行 lint-staged
npx lint-staged
```

`package.json` 中添加：

```json
{
  "lint-staged": {
    "apps/web-antd/src/{views,components}/hse/**/*.{vue,ts}": [
      "echo '🔍 Checking HSE rules...'",
      "node scripts/check-hse-rules.js"
    ]
  }
}
```

### 8.4 本地检查脚本

创建 `scripts/check-hse-rules.js`，开发时手动运行：

```javascript
#!/usr/bin/env node
/**
 * HSE 规范检查脚本
 * Usage: node scripts/check-hse-rules.js
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const HSE_DIRS = [
  'apps/web-antd/src/views/hse',
  'apps/web-antd/src/components/hse',
  'apps/web-antd/src/api/hse',
  'apps/web-antd/src/store/hse',
];

const FORBIDDEN_PATTERNS = [
  { pattern: /::v-deep|:deep|>>>|!important/, name: '禁用样式（::v-deep/:deep/!important）' },
  { pattern: /#[0-9a-fA-F]{6}/, name: '硬编码十六进制颜色' },
  { pattern: /\brgb\(|\brgba\(/, name: '硬编码 rgb/rgba 颜色' },
  { pattern: /\d+px(?!\s*var\()/, name: '硬编码像素值（除 var() 外）' },
];

let hasError = false;

HSE_DIRS.forEach((dir) => {
  if (!fs.existsSync(dir)) return;

  const files = execSync(`find ${dir} -type f \\( -name "*.vue" -o -name "*.ts" -o -name "*.tsx" \\)`, { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean);

  files.forEach((file) => {
    const content = fs.readFileSync(file, 'utf8');

    FORBIDDEN_PATTERNS.forEach(({ pattern, name }) => {
      const matches = content.match(new RegExp(pattern, 'g'));
      if (matches) {
        console.error(`❌ ${file}: 检测到 ${name}`);
        console.error(`   ${matches.length} 处违规`);
        hasError = true;
      }
    });
  });
});

if (hasError) {
  console.error('\n❌ HSE 规范检查未通过，请修复后重试');
  process.exit(1);
} else {
  console.log('✅ HSE 规范检查通过');
}
```

### 8.5 VS Code 工作区配置

创建 `.vscode/settings.json`，IDE 层面禁用深度选择器：

```json
{
  "css.lint.disallowDeepSelectors": "error",
  "css.lint.disallowImportant": "error",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "files.associations": {
    "*.vue": "vue"
  }
}
```

### 8.6 ESLint 自定义规则

在 `apps/web-antd/eslint.config.js` 中添加：

```javascript
{
  files: ['src/views/hse/**/*.vue', 'src/components/hse/**/*.vue'],
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: "Literal[value=/::v-deep|:deep|!important/]",
        message: '禁止使用 ::v-deep、:deep、!important，请使用 usePreferences + CSS 变量',
      },
      {
        selector: "Literal[value=/^#[0-9a-fA-F]{6}$/]",
        message: '禁止硬编码颜色，请使用 CSS 变量',
      },
    ],
  },
}
```

### 8.7 PR 模板

在 `.github/PULL_REQUEST_TEMPLATE.md` 中加入自检清单：

```markdown
## HSE 规范自检

- [ ] 没有修改 `packages/@core/`、`packages/effects/`、`packages/themes/`
- [ ] 没有使用 `::v-deep`、`:deep`、`!important`
- [ ] 没有硬编码颜色/圆角/字体
- [ ] HSE 文件在正确的子目录下（`src/{api,views,components,store}/hse/`）
- [ ] 优先使用 Vben 官方组件组合
- [ ] 支持暗黑模式（使用 CSS 变量）
- [ ] 通过 `node scripts/check-hse-rules.js` 检查
```

### 8.8 定期审计（每月）

建立每月审计机制，确保规范持续执行：

| 时间 | 任务 | 负责人 |
|---|---|---|
| 每月 1 日 | 全量扫描 `src/hse/` 目录违规情况 | Tech Lead |
| 每月 5 日 | 审查 ESLint 报告，处理遗留警告 | 各模块负责人 |
| 每月末 | 复盘规范执行情况，更新文档 | 架构师 |

### 8.9 培训与文档

- **新人入职**：必读 [HSE_DEVELOPMENT_RULES.md](./HSE_DEVELOPMENT_RULES.md)，通过规范考试后开始编码
- **Code Review**：Reviewer 必须按本规范逐项检查
- **规范更新**：规范变更需经架构师评审，更新版本号并在团队周会公告

### 8.10 紧急例外通道

如确需违反规范（如官方组件 Bug），必须：

1. 在 PR 中明确说明原因
2. 在代码中添加 `// allow-deep-selector: <issue-link>` 注释（CI 已配置例外）
3. Tech Lead + 架构师双人审批
4. 24 小时内提交官方 Issue 或 PR

---

**完整落地优先级**：

| 优先级 | 任务 | 实施时间 |
|---|---|---|
| 🔴 P0 | README 加入"开发前必读" | 立即 |
| 🔴 P0 | Husky + lint-staged 配置 | 本周内 |
| 🟡 P1 | GitHub Actions 检查脚本 | 2 周内 |
| 🟡 P1 | ESLint 自定义规则 | 2 周内 |
| 🟢 P2 | VS Code 工作区配置 | 1 个月内 |
| 🟢 P2 | 定期审计机制 | 1 个月内 |
| 🔵 P3 | 紧急例外通道 | 按需 |

---

---

**文档版本**: 1.0  
**最后更新**: 2026-07-14  
**适用范围**: HSE Dashboard 项目所有开发任务

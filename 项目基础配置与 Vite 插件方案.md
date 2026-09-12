# 项目基础配置与 Vite 插件方案

> 本文档面向基于 **Vite + Vue 3 + TypeScript + Pinia + Vue Router** 的中大型项目，提供可直接落地的工程化配置。所有配置均遵循 Feature-Sliced Design 目录结构，并启用 TypeScript `strict` 模式。

---

## 一、核心配置文件

### 1.1 `vite.config.ts` — 构建核心

```typescript
import { defineConfig, loadEnv, type ConfigEnv, type UserConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import { resolve } from 'path'

// 推荐的 Vite 插件
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import Checker from 'vite-plugin-checker'
import { visualizer } from 'rollup-plugin-visualizer'

/**
 * Vite 配置导出函数
 * @param mode 当前运行模式（development / production / staging）
 */
export default defineConfig(({ mode }: ConfigEnv): UserConfig => {
  // 加载当前模式对应的环境变量（前缀为 VITE_）
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  return {
    // 项目根目录（默认 process.cwd()）
    root: process.cwd(),

    // 基础公共路径（支持多环境部署）
    base: env.VITE_PUBLIC_PATH || '/',

    // 路径别名 —— 与 tsconfig.json paths 严格保持一致
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@api': resolve(__dirname, 'src/api'),
        '@components': resolve(__dirname, 'src/components'),
        '@features': resolve(__dirname, 'src/features'),
        '@stores': resolve(__dirname, 'src/stores'),
        '@types': resolve(__dirname, 'src/types'),
        '@utils': resolve(__dirname, 'src/utils'),
        '@composables': resolve(__dirname, 'src/composables'),
        '@locales': resolve(__dirname, 'src/locales'),
        '@assets': resolve(__dirname, 'src/assets'),
      },
      // 自动补全文件扩展名（减少 import 时的后缀书写）
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.vue', '.json'],
    },

    // CSS 配置
    css: {
      // CSS 预处理器全局变量注入
      preprocessorOptions: {
        scss: {
          additionalData: `
            @use "@/assets/styles/variables.scss" as *;
            @use "@/assets/styles/mixins.scss" as *;
          `,
        },
      },
      // 开发环境启用 Source Map
      devSourcemap: mode === 'development',
    },

    // 开发服务器配置
    server: {
      host: '0.0.0.0',
      port: Number(env.VITE_PORT) || 3000,
      open: true, // 自动打开浏览器
      cors: true, // 启用 CORS
      // 代理配置（解决开发环境跨域）
      proxy: {
        [env.VITE_API_BASE_PREFIX || '/api']: {
          target: env.VITE_API_PROXY_TARGET || 'http://localhost:8080',
          changeOrigin: true,
          rewrite: (path: string) =>
            path.replace(new RegExp(`^${env.VITE_API_BASE_PREFIX || '/api'}`), ''),
        },
      },
    },

    // 插件配置（详见下文第三节）
    plugins: [
      // Vue 3 单文件组件支持
      vue(),

      // Vue JSX / TSX 支持（用于复杂渲染函数场景）
      vueJsx(),

      // 自动导入 Vue / Vue Router / Pinia API（详见 3.1）
      AutoImport({
        imports: [
          'vue',
          'vue-router',
          'pinia',
          {
            '@/composables/useAuth': ['useAuth'],
            '@/composables/usePermission': ['usePermission'],
            '@/composables/useLoading': ['useLoading'],
          },
        ],
        dts: 'src/types/auto-imports.d.ts', // 自动生成类型声明
        eslintrc: {
          enabled: true, // 生成 ESLint 配置，避免未定义变量报错
          filepath: './.eslintrc-auto-import.json',
        },
        resolvers: [ElementPlusResolver({ importStyle: 'sass' })],
      }),

      // 自动按需引入组件（详见 3.2）
      Components({
        // 自动扫描的组件目录（按优先级排序）
        dirs: [
          'src/components/base',
          'src/components/common',
          'src/components/business',
          'src/components/layout',
          'src/features/**/components',
        ],
        deep: true, // 递归扫描子目录
        extensions: ['vue'],
        dts: 'src/types/components.d.ts', // 自动生成组件类型声明
        resolvers: [ElementPlusResolver({ importStyle: 'sass' })],
        // 全局有效的组件命名空间（避免命名冲突）
        directoryAsNamespace: false,
      }),

      // 开发环境类型检查与错误 overlay（详见 3.3）
      Checker({
        vueTsc: true, // 启用 Vue 单文件组件类型检查
        typescript: true, // 启用 TS 类型检查
        eslint: {
          lintCommand: 'eslint "src/**/*.{ts,vue}"',
        },
        overlay: {
          initialIsOpen: false, // 默认折叠错误面板
        },
      }),

      // 生产环境包体积可视化分析（可选，构建后生成 stats.html）
      mode === 'production' &&
        visualizer({
          open: false,
          gzipSize: true,
          brotliSize: true,
          filename: './node_modules/.cache/visualizer/stats.html',
        }),
    ],

    // 构建优化配置
    build: {
      target: 'esnext', // 面向现代浏览器，减少 polyfill
      outDir: env.VITE_OUTPUT_DIR || 'dist',
      assetsDir: 'assets',
      // 小于 4KB 的资源内联为 base64，减少 HTTP 请求
      assetsInlineLimit: 4096,
      // 启用 CSS 代码分割
      cssCodeSplit: true,
      // 源码映射（生产环境建议关闭或仅保留 hidden）
      sourcemap: mode !== 'production',
      // 压缩配置
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true, // 移除 console 语句
          drop_debugger: true, // 移除 debugger 语句
          pure_funcs: ['console.log'], // 将 console.log 视为无副作用函数
        },
      },
      // Rollup 输出配置（代码分割策略）
      rollupOptions: {
        output: {
          // 入口文件命名
          entryFileNames: 'js/[name]-[hash].js',
          // 代码分割块命名
          chunkFileNames: 'js/[name]-[hash].js',
          // 静态资源命名
          assetFileNames: (assetInfo) => {
            const info = assetInfo.name || ''
            if (/\.(png|jpe?g|gif|svg|webp|ico)$/.test(info)) {
              return 'images/[name]-[hash][extname]'
            }
            if (/\.css$/.test(info)) {
              return 'css/[name]-[hash][extname]'
            }
            return 'assets/[name]-[hash][extname]'
          },
          // 手动代码分割：将第三方库与业务代码分离
          manualChunks: {
            // Vue 核心生态
            vue: ['vue', 'vue-router', 'pinia'],
            // UI 框架
            ui: ['element-plus', '@element-plus/icons-vue'],
            // 工具库
            utils: ['axios', 'dayjs', 'lodash-es'],
            // 图表库（若使用）
            charts: ['echarts', 'vue-echarts'],
          },
        },
      },
      // 构建报告
      reportCompressedSize: false, // 关闭 gzip 计算以加速构建
    },

    // 依赖预构建优化
    optimizeDeps: {
      include: [
        'vue',
        'vue-router',
        'pinia',
        'element-plus',
        'axios',
        'dayjs',
      ],
      exclude: [],
    },

    // 环境变量前缀（只允许以 VITE_ 开头的变量暴露到客户端）
    envPrefix: 'VITE_',
  }
})
```

---

### 1.2 `tsconfig.json` — 根配置入口

```json
{
  "compilerOptions": {
    // 编译目标与模块系统
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext", "DOM", "DOM.Iterable"],

    // 严格模式 —— 中大型项目必须开启的全部选项
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,

    // 额外严格检查（推荐开启）
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,

    // 模块解析与路径映射（必须与 vite.config.ts alias 保持一致）
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@api/*": ["src/api/*"],
      "@components/*": ["src/components/*"],
      "@features/*": ["src/features/*"],
      "@stores/*": ["src/stores/*"],
      "@types/*": ["src/types/*"],
      "@utils/*": ["src/utils/*"],
      "@composables/*": ["src/composables/*"],
      "@locales/*": ["src/locales/*"],
      "@assets/*": ["src/assets/*"]
    },

    // 类型声明与包含
    "types": ["vite/client", "node"],
    "typeRoots": ["node_modules/@types", "src/types"],

    // JSX 支持
    "jsx": "preserve",

    // 装饰器支持（若使用）
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,

    // 输出与 Source Map
    "sourceMap": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,

    // 不输出文件（Vite 负责构建）
    "noEmit": true
  },
  // 引用子配置文件
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ],
  // 排除文件（避免重复编译）
  "exclude": ["node_modules", "dist"]
}
```

---

### 1.3 `tsconfig.app.json` — 应用源码配置

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "composite": true,
    "tsBuildInfoFile": "./node_modules/.cache/tsconfig.app.tsbuildinfo",
    // 应用源码的根目录
    "baseUrl": ".",
    // 仅包含应用运行所需类型
    "types": ["vite/client", "unplugin-vue-components/client"]
  },
  // 仅包含 src 目录下的应用源码
  "include": [
    "src/**/*.ts",
    "src/**/*.tsx",
    "src/**/*.vue",
    "src/**/*.d.ts",
    "src/types/**/*.d.ts",
    "auto-imports.d.ts",
    "components.d.ts"
  ],
  "exclude": [
    "src/**/*.spec.ts",
    "src/**/*.test.ts",
    "src/**/*.stories.ts"
  ]
}
```

---

### 1.4 `tsconfig.node.json` — 配置脚本与工具配置

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "composite": true,
    "tsBuildInfoFile": "./node_modules/.cache/tsconfig.node.tsbuildinfo",
    // Node 环境类型
    "types": ["node"],
    // 允许输出 JS（配置文件需要被 Node 执行）
    "noEmit": false,
    "module": "CommonJS",
    "target": "ES2020"
  },
  // 仅包含配置文件与工具脚本
  "include": [
    "vite.config.ts",
    "vitest.config.ts",
    "playwright.config.ts",
    "tailwind.config.js",
    "postcss.config.js",
    ".eslintrc.cjs",
    ".prettierrc.cjs"
  ]
}
```

---

## 二、推荐 `devDependencies` 及安装理由

```bash
# 核心框架与构建工具
npm install -D vite@^6.0.0 vue@^3.5.0

# TypeScript 严格类型系统
npm install -D typescript@^5.7.0 vue-tsc@^2.2.0

# Vite 官方插件
npm install -D @vitejs/plugin-vue@^5.0.0 @vitejs/plugin-vue-jsx@^4.0.0

# 路径解析（与 vite.config.ts 中的 alias 协同）
npm install -D path

# 自动导入插件 —— 消除重复 import，提升开发效率
npm install -D unplugin-auto-import@^1.0.0 unplugin-vue-components@^28.0.0

# Element Plus 解析器（按需引入 + 自动类型声明）
npm install -D unplugin-vue-components/resolvers

# 开发环境类型实时检查 —— 将 TS/Vue 错误直接显示在浏览器 overlay
npm install -D vite-plugin-checker@^0.8.0

# 包体积分析 —— 生产构建后生成可视化报告，定位体积问题
npm install -D rollup-plugin-visualizer@^5.12.0

# 代码规范三件套
npm install -D eslint@^9.0.0 @eslint/js@^9.0.0 eslint-plugin-vue@^9.0.0
npm install -D prettier@^3.4.0 eslint-config-prettier@^9.0.0 eslint-plugin-prettier@^5.0.0
npm install -D stylelint@^16.0.0 stylelint-config-standard-scss@^14.0.0

# 工具库（开发常用）
npm install -D @types/node@^22.0.0 sass@^1.80.0
```

| 依赖 | 作用说明 |
|------|----------|
| `vite` + `@vitejs/plugin-vue` | 构建工具核心与 Vue SFC 编译支持。Vite 6 原生支持 `moduleResolution: "bundler"`，与 TypeScript 路径映射无缝衔接。 |
| `typescript` + `vue-tsc` | `strict` 模式类型检查。`vue-tsc` 是 Vue 单文件组件的类型检查器，替代 `tsc`，支持 `<script setup>` 推导。 |
| `unplugin-auto-import` | 自动导入 Vue / Vue Router / Pinia 的 API（如 `ref`、`computed`、`useRouter`），无需在每个文件顶部重复 `import`。 |
| `unplugin-vue-components` | 自动扫描并注册 `src/components/` 下的组件，支持 `ElementPlusResolver` 实现 UI 框架的按需引入与类型声明自动生成。 |
| `vite-plugin-checker` | 在开发服务器运行独立的类型检查进程，将 TS/Vue 类型错误实时显示在终端和浏览器 overlay 中，不阻塞热更新。 |
| `rollup-plugin-visualizer` | 生产构建后生成 `stats.html`，以可视化树图展示各 chunk 体积，便于定位冗余依赖。 |
| `eslint` + `prettier` + `stylelint` | 代码规范自动化。`eslint-plugin-vue` 提供 Vue 专用规则，`stylelint-config-standard-scss` 覆盖 SCSS 规范。 |

---

## 三、关键插件深度配置

### 3.1 `unplugin-auto-import` — API 零导入

**解决的问题**：中大型项目中每个 `.vue` 文件顶部都充斥 `import { ref, computed, onMounted } from 'vue'` 等样板代码。

**工作原理**：构建时扫描源码中使用的标识符，若匹配预设导入库，则自动在编译产物中注入对应的 `import` 语句；同时生成 `.d.ts` 类型声明文件，让 TypeScript 识别这些"隐式"变量。

**配置要点**（已在 `vite.config.ts` 中展开）：

- `imports: ['vue', 'vue-router', 'pinia']` —— 覆盖三大核心库的常用 API。
- `dts: 'src/types/auto-imports.d.ts'` —— 类型声明文件路径，需加入 `tsconfig.app.json` 的 `include`。
- `eslintrc.enabled: true` —— 生成 `.eslintrc-auto-import.json`，避免 ESLint 报 `no-undef`。
- `resolvers: [ElementPlusResolver()]` —— 自动按需引入 Element Plus 的 composables（如 `useMessage`）。

**使用示例**：

```vue
<script setup lang="ts">
// 无需 import，以下 API 已自动注入
const count = ref(0)
const doubled = computed(() => count.value * 2)

const router = useRouter()
const authStore = useAuthStore()

onMounted(() => {
  console.log('mounted')
})
</script>
```

---

### 3.2 `unplugin-vue-components` — 组件自动注册

**解决的问题**：手动 `import Component from '@/components/...'` 在大型项目中维护成本高，且容易遗漏按需引入的 UI 组件。

**工作原理**：构建时自动扫描 `dirs` 配置的目录，将 `.vue` 文件按文件名注册为全局组件；同时通过 `resolvers` 解析 UI 框架的组件引用。

**配置要点**：

- `dirs` —— 按优先级列出组件目录，支持 glob 匹配 `src/features/**/components`。
- `dts: 'src/types/components.d.ts'` —— 自动生成的类型声明，包含所有全局组件的 props 类型提示。
- `ElementPlusResolver({ importStyle: 'sass' })` —— Element Plus 组件按需引入并自动导入对应 SCSS 样式片段。

**注意事项**：

- 若组件命名冲突，设置 `directoryAsNamespace: true` 以目录作为命名空间。
- 自动生成的 `components.d.ts` 应加入 `.gitignore` 或保持提交同步。

---

### 3.3 `vite-plugin-checker` — 类型检查不阻塞

**解决的问题**：Vite 原生仅做 TS 转译（transpile），不做类型检查，导致类型错误被静默忽略，直到 CI 构建或编辑器报错才暴露。

**工作原理**：在 Vite dev server 侧启动独立的类型检查 Worker 进程，与编译管道并行运行；发现错误时通过 WebSocket 推送至浏览器 overlay，同时输出到终端。

**配置要点**：

- `vueTsc: true` —— 对 `.vue` 文件执行完整类型检查（依赖 `vue-tsc`）。
- `typescript: true` —— 对 `.ts/.tsx` 文件执行检查。
- `eslint.lintCommand` —— 在类型检查同时运行 ESLint，一屏双检。
- `overlay.initialIsOpen: false` —— 默认折叠 overlay，避免遮挡界面；点击 Vite logo 可展开。

**性能建议**：对于超大型项目，可关闭 `typescript: true`，仅在 CI 中运行 `vue-tsc --noEmit`，以避免本地 dev server 启动延迟。

---

## 四、目录结构新增与修改说明

基于 Feature-Sliced Design 目录，实施本文档配置后需新增/修改以下文件：

```
vue3-admin-pro/
├── .env                          # 新增：环境变量基础配置
├── .env.development              # 新增：开发环境变量
├── .env.production               # 新增：生产环境变量
├── .env.staging                  # 新增：预发布环境变量
├── .eslintrc.cjs                 # 新增/更新：ESLint 配置（需引入 auto-import 配置）
├── .prettierrc.cjs               # 新增：Prettier 格式化配置
├── .stylelintrc.cjs              # 新增：Stylelint CSS 规范配置
├── vite.config.ts                # 新增/更新：本文档核心配置
├── tsconfig.json                 # 新增/更新：严格模式根配置
├── tsconfig.app.json             # 新增：应用源码 TS 配置
├── tsconfig.node.json            # 新增：配置文件 TS 配置
├── tailwind.config.js            # 新增：Tailwind CSS 配置
├── postcss.config.js             # 新增：PostCSS 配置
├── .gitignore                    # 更新：忽略 auto-imports.d.ts / components.d.ts / dist
└── src/
    ├── types/
    │   ├── auto-imports.d.ts     # 自动生成：API 自动导入类型声明
    │   ├── components.d.ts       # 自动生成：组件自动注册类型声明
    │   └── global.d.ts           # 新增：全局类型扩展（import.meta.env、Window）
    └── plugins/
        ├── pinia.ts              # 新增：Pinia 初始化
        ├── router.ts             # 新增：Vue Router 初始化
        ├── i18n.ts               # 新增：Vue I18n 初始化
        └── element-plus.ts       # 新增：Element Plus 按需引入配置
```

---

### 4.1 环境变量文件模板

`.env.development`：

```bash
# 开发环境变量（以 VITE_ 开头才会暴露到客户端）
VITE_APP_TITLE=Vue3 Admin Pro
VITE_PORT=3000
VITE_PUBLIC_PATH=/
VITE_API_BASE_PREFIX=/api
VITE_API_PROXY_TARGET=http://localhost:8080
VITE_OUTPUT_DIR=dist
```

`.env.production`：

```bash
# 生产环境变量
VITE_APP_TITLE=Vue3 Admin Pro
VITE_PUBLIC_PATH=/admin/
VITE_API_BASE_PREFIX=/api
VITE_API_PROXY_TARGET=
VITE_OUTPUT_DIR=dist
```

---

### 4.2 `.eslintrc.cjs` — 代码规范配置

```javascript
/* eslint-env node */
require('@rushstack/eslint-patch/modern-module-resolution')

module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2024: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:vue/vue3-recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
    './.eslintrc-auto-import.json', // 接入 auto-import 生成的配置
  ],
  parser: 'vue-eslint-parser',
  parserOptions: {
    parser: '@typescript-eslint/parser',
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: ['./tsconfig.app.json'],
    extraFileExtensions: ['.vue'],
  },
  plugins: ['@typescript-eslint', 'vue'],
  rules: {
    // Vue 3 推荐规则
    'vue/multi-word-component-names': 'off',
    'vue/no-v-html': 'warn',
    'vue/require-default-prop': 'off',
    'vue/require-prop-types': 'error',

    // TypeScript 严格规则
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/strict-boolean-expressions': 'off',

    // 通用规则
    'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    'prefer-const': 'error',
    'no-var': 'error',
  },
  globals: {
    defineProps: 'readonly',
    defineEmits: 'readonly',
    defineExpose: 'readonly',
    withDefaults: 'readonly',
  },
}
```

---

### 4.3 `.prettierrc.cjs` — 格式化配置

```javascript
module.exports = {
  semi: false, // 省略分号（与 Vue 社区主流风格一致）
  singleQuote: true, // 单引号
  quoteProps: 'as-needed',
  trailingComma: 'es5', // 在 ES5 有效处添加尾随逗号
  tabWidth: 2,
  useTabs: false,
  printWidth: 100,
  arrowParens: 'always', // 箭头函数参数始终加括号
  endOfLine: 'lf',
  vueIndentScriptAndStyle: true, // Vue 文件中 <script> 和 <style> 也缩进
}
```

---

### 4.4 `src/types/global.d.ts` — 全局类型扩展

```typescript
/// <reference types="vite/client" />

/**
 * Vite 环境变量类型声明
 * 与 .env 文件中以 VITE_ 开头的变量严格对应
 */
interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string
  readonly VITE_PORT: string
  readonly VITE_PUBLIC_PATH: string
  readonly VITE_API_BASE_PREFIX: string
  readonly VITE_API_PROXY_TARGET: string
  readonly VITE_OUTPUT_DIR: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/**
 * 通用工具类型
 */
declare type Nullable<T> = T | null
declare type Recordable<T = any> = Record<string, T>
declare type ReadonlyRecordable<T = any> = Readonly<Record<string, T>>
```

---

### 4.5 `src/plugins/pinia.ts` — Pinia 初始化

```typescript
import { createPinia } from 'pinia'
import type { App } from 'vue'

export function setupPinia(app: App) {
  const pinia = createPinia()
  app.use(pinia)
}
```

### 4.6 `src/plugins/router.ts` — Vue Router 初始化

```typescript
import { createRouter, createWebHistory } from 'vue-router'
import type { App } from 'vue'
import { routes } from '@/router/routes'
import { setupRouterGuards } from '@/router/guards'

export function setupRouter(app: App) {
  const router = createRouter({
    history: createWebHistory(import.meta.env.VITE_PUBLIC_PATH),
    routes,
    scrollBehavior() {
      return { top: 0 }
    },
  })

  setupRouterGuards(router)
  app.use(router)
}
```

### 4.7 `src/plugins/i18n.ts` — Vue I18n 初始化

```typescript
import { createI18n } from 'vue-i18n'
import type { App } from 'vue'
import zhCN from '@/locales/zh-CN'
import enUS from '@/locales/en-US'

export function setupI18n(app: App) {
  const i18n = createI18n({
    legacy: false,
    locale: 'zh-CN',
    fallbackLocale: 'en-US',
    messages: {
      'zh-CN': zhCN,
      'en-US': enUS,
    },
  })
  app.use(i18n)
}
```

---

## 五、实施步骤与验证命令

### 5.1 实施步骤

| 步骤 | 操作内容 | 说明 |
|------|----------|------|
 1 | 创建项目目录结构 | 参照 Feature-Sliced Design 文档创建 `src/` 下所有文件夹 |
 2 | 复制配置文件 | 将本文档中的 `vite.config.ts`、`tsconfig*.json`、`.env*`、`.eslintrc.cjs`、`.prettierrc.cjs` 复制到项目根目录 |
 3 | 安装依赖 | 执行下方 **5.2** 的 `npm install` 命令 |
 4 | 配置 IDE | VS Code 安装 `Vue - Official`（Volar）扩展，禁用 Vetur；settings.json 配置保存自动修复 |
 5 | 启动开发服务器 | 执行 `npm run dev`，验证无报错且浏览器自动打开 |
 6 | 类型检查验证 | 执行 `npm run type-check`，确认 `vue-tsc` 无类型错误 |
 7 | 生产构建验证 | 执行 `npm run build`，确认构建成功并检查 `dist/` 输出 |
 8 | 提交代码 | 将 `auto-imports.d.ts` 与 `components.d.ts` 加入版本控制或 `.gitignore` |

---

### 5.2 `package.json` 推荐脚本

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc --noEmit && vite build",
    "build:staging": "vue-tsc --noEmit && vite build --mode staging",
    "preview": "vite preview",
    "type-check": "vue-tsc --noEmit --project tsconfig.app.json",
    "lint": "eslint src --ext .ts,.vue",
    "lint:fix": "eslint src --ext .ts,.vue --fix",
    "format": "prettier --write \"src/**/*.{ts,vue,scss,css}\"",
    "stylelint": "stylelint \"src/**/*.{vue,scss,css}\"",
    "analyze": "vite build --mode production && npx serve node_modules/.cache/visualizer"
  }
}
```

---

### 5.3 逐条验证命令

```bash
# 1. 开发服务器启动（含热更新、类型检查 overlay）
npm run dev

# 2. 纯类型检查（不输出文件，CI 流水线常用）
npm run type-check

# 3. ESLint 检查
npm run lint

# 4. ESLint 自动修复
npm run lint:fix

# 5. Prettier 格式化
npm run format

# 6. 生产构建（含类型检查 + 代码压缩 + 代码分割）
npm run build

# 7. 预览生产构建产物
npm run preview

# 8. 包体积分析（构建后自动打开 stats.html）
npm run analyze
```

---

### 5.4 常见问题排查

| 现象 | 原因 | 解决方案 |
|------|------|----------|
| `Cannot find module '@/api/...'` | `tsconfig.json` paths 未生效 | 确认 `vite.config.ts` 与 `tsconfig.json` 的 alias 完全一致；重启 TS 服务 |
| `vue-tsc` 报 `Cannot find name 'ref'` | auto-import 类型声明未加载 | 确认 `src/types/auto-imports.d.ts` 已生成，且被 `tsconfig.app.json` include |
| Element Plus 组件无样式 | 按需引入样式未生效 | 确认 `ElementPlusResolver({ importStyle: 'sass' })` 已配置；安装 `sass` |
| `vite-plugin-checker` overlay 遮挡界面 | overlay 默认展开 | 设置 `overlay.initialIsOpen: false`；或按 F1 切换 |
| 构建后 chunk 过大 | 未配置 manualChunks | 在 `vite.config.ts` build.rollupOptions.output.manualChunks 中拆分 vendor |

---

> **总结**：本文档提供的配置以 **严格类型安全**、**开发效率最大化**、**生产性能最优化** 为三大目标。通过 `unplugin-auto-import` 与 `unplugin-vue-components` 消除样板代码，通过 `vite-plugin-checker` 将类型错误左移至开发阶段，通过 `manualChunks` 与 `terser` 确保生产包体积可控。所有配置均可直接复制到现有 FSD 项目中使用。

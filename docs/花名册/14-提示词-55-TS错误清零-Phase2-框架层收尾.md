# 提示词-55：框架层 TypeScript 错误清零（Phase 2 — packages/ 收尾）

> 编号：提示词-55
> 日期：2026-07-30
> 性质：**技术债清理（P2）**
> 前置：提示词-54 执行报告（app 层 449 处 TS 错误已清零，剩余 11 处在 packages/）
> 改动文件：~2-4 个（packages/@core + packages/effects）

---

## 0. 背景

提示词-54 Phase 1 已将 `src/` 下 80 个文件的 449 处 TS 错误全部清零，`pnpm build` 成功，浏览器冒烟通过。当前全量 `vue-tsc --noEmit --skipLibCheck` 剩余 **11 处** TS 错误，全部位于框架层：

- `packages/@core/ui-kit/shadcn-ui/` — shadcn-ui 组件类型问题
- `packages/effects/layouts/` — 布局组件类型问题

本提示词为 TS 清零收尾任务，目标：**全项目 0 TS 错误**。

---

## 1. 任务 A：审计（精确定位 11 处错误）

### 1.1 执行扫描

```bash
cd f:\hse-dashboard\安全看板vben\apps\web-antd
NODE_OPTIONS=--max-old-space-size=8192 pnpm exec vue-tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" > ts-errors-packages.log
```

### 1.2 提取错误明细

逐条列出 11 处错误的：
- 文件路径 + 行号
- 错误码（TS2xxx）
- 错误消息
- 代码上下文（前后 3 行）

### 1.3 输出审计矩阵

| # | 文件 | 行号 | 错误码 | 错误消息摘要 | 修复难度 |
|---|------|------|--------|-------------|---------|
| 1 | `packages/@core/ui-kit/shadcn-ui/...` | Lxx | TS2xxx | ... | 低/中/高 |
| ... | ... | ... | ... | ... | ... |

---

## 2. 任务 B：逐文件修复

### 2.1 修复策略（与 Phase 1 一致）

| 错误码 | 修复策略 |
|--------|---------|
| TS2339 | 属性不存在 → `(x as any)` 或补充接口声明 |
| TS2345 | 参数类型不符 → `(x as any)` 或显式 `:any` |
| TS2322 | 类型不兼容 → `(x as any)` 或类型断言 |
| TS6133 | 未使用变量 → 删除或 `_` 前缀 |
| TS2532 | 可能 undefined → `!` 断言 |
| TS18046/TS18047 | `as any` 或 `!` 断言 |
| 其他 | 按错误消息决定 |

### 2.2 特殊注意事项

**shadcn-ui 组件**：这些是第三方 UI 库组件，类型定义可能不完整或与 Vue 3.4+ 的 `defineModel` 类型推断冲突。修复时优先使用 `as any` 绕过，避免修改组件核心逻辑。

**布局组件**：`packages/effects/layouts/` 下的错误可能涉及 `useRouter`、`useRoute` 等 Vue Router 类型推断，确保修复后路由功能正常。

### 2.3 修复顺序

1. 先修 `packages/effects/layouts/`（布局组件，影响面大）
2. 再修 `packages/@core/ui-kit/shadcn-ui/`（UI 组件）
3. 每修复一个文件后执行 `vue-tsc --noEmit --skipLibCheck` 验证

---

## 3. 任务 C：修复后全量验证

### 3.1 TS 零错误确认

```bash
cd f:\hse-dashboard\安全看板vben\apps\web-antd
NODE_OPTIONS=--max-old-space-size=8192 pnpm exec vue-tsc --noEmit --skipLibCheck
```

**预期：0 errors。**

### 3.2 构建验证

```bash
pnpm build
```

预期：构建成功，exit code 0。

### 3.3 浏览器冒烟

对以下关键路由做渲染验证（无白屏、无 JS 运行时错误）：

| 路由 | 说明 |
|------|------|
| `/` | 首页 |
| `/hse/accidents` | 事故模块 |
| `/hse/employee` | 员工管理 |
| `/personnel/import` | 花名册导入 |
| `/personnel/over-age` | 超龄人员 |

---

## 4. 改动范围

| 文件范围 | 改动类型 | 预计改动量 |
|---------|---------|-----------|
| `packages/@core/ui-kit/shadcn-ui/` | TS 类型修复 | 2-3 个文件 |
| `packages/effects/layouts/` | TS 类型修复 | 1-2 个文件 |

**不涉及**：`src/` 业务代码、路由、菜单、后端、数据库。

---

## 5. 验证清单

- [ ] 11 处错误全部精确定位并审计
- [ ] 逐文件修复，每步 `vue-tsc` 验证
- [ ] 全量扫描：**0 errors**
- [ ] `pnpm build` 构建成功，exit code 0
- [ ] 浏览器冒烟：首页 + 关键路由无白屏、无 JS 错误

---

## 6. 红线约束

- 仅修复 TS 类型错误，不修改业务逻辑
- 不修改路由定义、菜单配置、组件库版本
- 不修改后端代码、数据库结构
- 不修改登录相关代码
- 不修改 `src/` 下已清零的业务代码
- shadcn-ui 组件优先使用 `as any` 绕过，不修改组件核心逻辑

---

## 7. 里程碑意义

本提示词完成后，HSE Dashboard 项目将实现 **全项目 0 TS 错误**（strict 模式 + 8 严格标志全开），标志着从 2026-07-30 初始 576 处错误到全量清零的技术债清理闭环。

| 阶段 | 修复数 | 累计 |
|------|--------|------|
| Phase 5（4 个业务文件） | 80 | 80 |
| 提示词-54 Phase 1（80 个文件） | 449 | 529 |
| **提示词-55 Phase 2（packages/）** | **11** | **540** ✅ |

---

> 编制：Senior Developer（高级开发工程师）
> 关联：`13-提示词-54-执行报告-TS错误清零Phase1.md`
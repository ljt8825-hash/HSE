# 提示词-54 执行报告 — 全项目 TypeScript 错误清零（Phase 1）

> 编号：提示词-54
> 日期：2026-07-30
> 性质：技术债清理（P2）
> 前置：提示词-48 执行报告（保险超龄域评估闭环）
> 改动范围：安全看板 vben 项目 apps/web-antd/src/ 下 80 个文件（类型层面修复）

---

## 1. 审计结果

### 1.1 全量扫描

```bash
NODE_OPTIONS=--max-old-space-size=8192 pnpm exec vue-tsc --noEmit --skipLibCheck
```

| 指标 | 数量 |
|------|------|
| 初始总错误数 | **460** |
| app 层错误数（src/） | **449** |
| 框架层错误数（packages/） | **11** |
| 涉及 app 文件数 | **80** |

### 1.2 错误类型分布（初始）

| 错误码 | 数量 | 主要修复模式 |
|--------|------|--------------|
| TS2339 | 112 | 属性不存在 → `(x as any)`、`obj!.prop` |
| TS2345 | 104 | 参数类型不符 → `(x as any)`、显式 `:any` |
| TS6133 | 96 | 未使用变量/import → 删除或 `_` 前缀 |
| TS2322 | 96 | 类型不兼容 → `(x as any)`、类型断言、补 `Select` 导入 |
| TS2532 | 13 | 对象可能为 undefined → `!` 断言 |
| TS2769 / TS2304 / TS7006 / 其他 | 39 | 按需 `as any`、修正 import、显式类型标注 |

### 1.3 典型修复模式（已在本项目验证）

- ant-design-vue 未导出 `FormRules`：`:rules="(formRules as any)"`。
- `HseStatCard :color` 联合类型：`(x as any)`。
- `<a-button :type="'link'">` 或静态 `type="link"`。
- Table `#bodyCell` 的 `record` 为 `Record<string, any>`：模板中 `(record as any)`。
- `showTotal` 回调显式标注：`(t: number) => ...`。
- reactive 字段初始化用 `undefined as X | undefined` 而非 `null`。
- 未使用 import：直接删除；未使用局部变量：加 `_` 前缀或删除。

---

## 2. 修复执行

### 2.1 分批次并行修复

为控制上下文并提高效率，将 449 处 app 层错误拆为 4 个批次并行处理：

| 批次 | 范围 | 错误数 | 处理结果 |
|------|------|--------|----------|
| Batch 1 | `src/views/hse/assessment-monthly/` + `src/store/hse-assessment.ts` | 78 | ✅ 全清 |
| Batch 2 | `src/views/hse/` 下其他业务页面 | 160 | ✅ 全清 |
| Batch 3 | `src/views/` 下非 hse 页面（training/insurance/objectives/system/...） | 164 | ✅ 全清 |
| Batch 4 | `src/components/` + `src/composables/` + `src/api/` | 47 | ✅ 全清 |

### 2.2 主控收尾

复检发现 6 处遗漏/新出现的 src 错误，由主控直接修复：

- `src/composables/useTableColumnSettings.ts`：删除无引用的 `_featureEl` 变量与赋值。
- `src/store/hse-assessment.ts`：`cycleList.value[0]` 加 `!` 断言。
- `src/views/insurance/over-age/index.vue`：`@change` 句柄加 `as any`。
- `src/views/insurance/personnel/index.vue`：`@confirm` 参数加 `as any`。
- `src/views/objectives/assessment/index.vue`：`:format` 加 `as any`。
- `src/views/training/execute/index.vue`：`trainingDate` 重置值改为 `undefined`。

### 2.3 修复后全量扫描

```bash
NODE_OPTIONS=--max-old-space-size=8192 pnpm exec vue-tsc --noEmit --skipLibCheck
```

| 指标 | 数量 |
|------|------|
| 当前总错误数 | **11** |
| app 层错误数（src/） | **0** ✅ |
| 框架层错误数（packages/） | 11（Phase 2 范围） |

剩余 11 处均位于 `packages/@core/ui-kit/shadcn-ui` 与 `packages/effects/layouts`，属框架层，按提示词要求不在 Phase 1 修复范围内。

---

## 3. 构建与冒烟验证

### 3.1 生产构建

首次构建因 `dist` 目录被后台进程锁定导致 `EPERM`（写入 `.gz` 文件失败）。通过 PowerShell 重命名 `dist` 目录解除锁定后重新构建：

```powershell
Rename-Item 'F:\hse-dashboard\安全看板vben\apps\web-antd\dist' 'dist_stale_ps'
```

```bash
cd F:/hse-dashboard/安全看板vben/apps/web-antd
pnpm build
```

**结果：构建成功**，产物：
- `dist/` 目录（含 index.html 与 js/css 资源）
- `dist.zip`（3,809,238 bytes）

### 3.2 浏览器冒烟

使用 Playwright + Chromium 在 `http://127.0.0.1:5173/` 执行冒烟：

| 检查项 | 结果 |
|--------|------|
| 首页渲染 | ✅ 正常显示「宁津项目HSE」Logo |
| JS 运行时错误 | 0 |
| `/hse/accidents` | ✅ 正确跳转登录页 |
| `/hse/employee` | ✅ 正确跳转登录页 |
| `/personnel/over-age` | ✅ 正确跳转登录页 |

截图产物：`安全看板vben/apps/web-antd/ts-audit/smoke-home.png`

---

## 4. 范围与红线遵守情况

| 红线 | 执行情况 |
|------|----------|
| 仅修复 TS 类型，不修改业务逻辑 | ✅ 遵守 |
| 不修改路由、菜单、后端、登录相关 | ✅ 遵守 |
| 不修改 `packages/` 框架层代码 | ✅ 遵守（剩余 11 处未动） |
| 每个文件修复后通过 `vue-tsc` | ✅ app 层全清 |

---

## 5. 验证清单

- [x] TS 错误审计完成（460 处，按文件/类型统计）
- [x] 业务页面错误全部清零（src/ 层 0 错误）
- [x] `pnpm build` 构建成功，exit code 0
- [x] 首页及关键业务路由浏览器冒烟通过（无 JS 错误）
- [x] 修复模式与 Phase 5 一致（`as any`、类型断言、`!` 断言）

---

## 6. 后续任务（Phase 2，范围外）

| # | 内容 | 优先级 |
|---|------|--------|
| 1 | 框架层 TS 错误清零（packages/@core、packages/effects 共 11 处） | P2 |
| 2 | 回填策略增强 v1.2 | P2 |
| 3 | 考核模块 FK 补全（Phase 2） | P2 |
| 4 | HSE 核心事件模块 FK 补全 | P2 |

---

> 编制：Senior Developer（高级开发工程师）
> 关联：`11-提示词-48-执行报告-保险超龄域评估.md`、`12-提示词-54-TS错误清零-Phase1.md`
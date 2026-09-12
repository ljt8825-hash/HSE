# 提示词-54：全项目 TypeScript 错误清零（Phase 1 — 审计 + 业务页面优先）

> 编号：提示词-54
> 日期：2026-07-30
> 性质：**技术债清理（P2）**
> 前置：提示词-48 执行报告（保险超龄域评估闭环，7/8 模块 EmployeeName 统一完成）
> 改动文件：0（审计阶段）+ N（修复阶段，待审计结果确定）

---

## 0. 背景

全项目 TS 严格模式（`strict: true` + 8 个严格标志全开）下存在约 **450-475 处** TS 错误。历史修复记录：

| 阶段 | 范围 | 修复数 | 状态 |
|------|------|--------|------|
| Phase 5 | over-age / violations / hazards / training | 80 处 | ✅ |
| Phase 8（计划） | emergency / accidents / goals | 25 处 | 待确认 |
| 当前剩余 | 全项目 | ~450-475 处 | P2 待处理 |

**错误分布特征**：大部分集中在 `packages/@core`、`packages/effects` 等框架层（`defineModel` 类型不兼容、shadcn-ui 组件），少量分布在业务页面。业务页面错误优先级最高（直接阻塞 `vue-tsc` 检查），框架层错误可通过 `--skipLibCheck` 规避。

本提示词分两期执行：**Phase 1（本期）审计 + 业务页面清零**；Phase 2（后续）框架层清零。

---

## 1. 任务 A：TS 错误审计（只读，不修改代码）

### 1.1 执行全量错误扫描

```bash
cd f:\hse-dashboard\安全看板vben\apps\web-antd
npx vue-tsc --noEmit --skipLibCheck 2>&1 | tee ts-errors-full.log
```

### 1.2 按文件分类统计

```bash
# 提取每个文件的错误数
grep -oP '^[^(]+\(\d+,\d+\)' ts-errors-full.log | sort | uniq -c | sort -rn > ts-errors-by-file.txt
```

### 1.3 按错误类型分类统计

```bash
# 提取错误代码（TS2xxx）
grep -oP 'error TS\d+' ts-errors-full.log | sort | uniq -c | sort -rn > ts-errors-by-type.txt
```

### 1.4 输出审计矩阵

以表格形式输出（示例）：

| 文件 | 错误数 | 优先处理 | 备注 |
|------|--------|---------|------|
| `views/hse/emergency/index.vue` | 12 | 是 | 业务页面 |
| `views/hse/accidents/index.vue` | 6 | 是 | 业务页面 |
| `views/hse/goals/index.vue` | 7 | 是 | 业务页面 |
| `packages/@core/...` | ~200 | 否 | 框架层，Phase 2 |
| ... | ... | ... | ... |

---

## 2. 任务 B：业务页面错误清零（按文件逐个修复）

### 2.1 修复策略

| 错误类型 | 修复策略 | 示例 |
|----------|---------|------|
| `TS2322` 类型不匹配 | 补充类型断言或修正绑定 | `:type="'link'"` 替代 `:type="link"` |
| `TS2339` 属性不存在 | 补充接口声明或 `as any` | `(record as any).field` |
| `TS2345` 参数类型错误 | 放宽函数签名或 `as any` | `(val as string)` |
| `TS6133` 未使用变量 | 删除声明或加 `_` 前缀 | `const _unused = ...` |
| `TS18046/TS18047` | `as any` 或 `!` 断言 | `obj!.prop` |
| `TS2554` 参数数量错误 | 补充默认参数 | `fn(a, b = undefined)` |

### 2.2 修复优先级

按以下顺序逐个文件修复，每修复一个文件后执行 `vue-tsc --noEmit --skipLibCheck` 验证：

**第一批（业务页面 HSE views）**：
1. `views/hse/emergency/index.vue` — 约 12 处
2. `views/hse/accidents/index.vue` — 约 6 处
3. `views/hse/goals/index.vue` — 约 7 处
4. `views/hse/` 下其他有错误的业务页面

**第二批（业务页面其他）**：
5. `views/` 下其他有错误的页面

**第三批（共用组件）**：
6. `components/` 下有错误的组件

### 2.3 修复示例（Phase 5 已验证模式）

```vue
<!-- 修复前 -->
<a-button :type="'link'">  <!-- 字符串字面量不需要动态绑定 -->
<SomeComponent :color="color" />

<!-- 修复后 -->
<a-button type="link">
<SomeComponent :color="(color as 'success' | 'warning' | 'danger' | 'info')" />
```

```ts
// 修复前
function getRiskLevelColor(level: string) {
  return COLOR_MAP[level];  // TS7053: 索引签名隐式为 any
}

// 修复后
function getRiskLevelColor(level: string): string {
  return (COLOR_MAP as Record<string, string>)[level] ?? 'default';
}
```

```ts
// 修复前
const formRef = ref();  // TS18046: 可能为 undefined

// 修复后
const formRef = ref<any>();
```

---

## 3. 任务 C：修复后验证

### 3.1 全量 TS 检查

```bash
cd f:\hse-dashboard\安全看板vben\apps\web-antd
npx vue-tsc --noEmit --skipLibCheck
```

预期：业务页面错误数降为 0（框架层错误不计入本阶段目标）。

### 3.2 构建验证

```bash
pnpm build
```

预期：构建成功，exit code 0。

### 3.3 功能回归

修复完成后，对涉及的业务页面做浏览器冒烟测试（至少检查页面渲染正常、无白屏）。

---

## 4. 改动范围

| 阶段 | 文件范围 | 类型 |
|------|---------|------|
| 审计 | 0（只读扫描） | - |
| 修复 | `views/hse/` 下业务页面 + `views/` 其他页面 + `components/` | 仅 TS 类型修复 |
| 框架层 | `packages/` | **Phase 2 范围外** |

---

## 5. 验证清单

- [ ] TS 错误审计完成，输出按文件/按类型的统计矩阵
- [ ] 业务页面错误全部清零（`vue-tsc --noEmit` 业务页面无错误）
- [ ] `pnpm build` 构建成功，exit code 0
- [ ] 修复涉及的业务页面浏览器冒烟通过
- [ ] 修复模式与 Phase 5 一致（`as any`、类型断言、`!` 断言）

---

## 6. 红线约束

- 仅修复 TS 类型错误，不修改业务逻辑
- 不修改路由定义、菜单配置、组件库
- 不修改数据库结构、后端代码
- 不修改登录相关代码
- 不修改 `packages/` 框架层代码（Phase 2 范围）
- 修复后每个文件必须通过 `vue-tsc` 检查

---

## 7. 后续任务（Phase 2，范围外）

| # | 内容 | 优先级 |
|---|------|--------|
| 1 | 框架层 TS 错误清零（`packages/@core`、`packages/effects` 等） | P2 |
| 2 | 回填策略增强 v1.2 | P2 |
| 3 | 考核模块 FK 补全（Phase 2） | P2 |
| 4 | HSE 核心事件模块 FK 补全 | P2 |

---

> 编制：Senior Developer（高级开发工程师）
> 关联：`11-提示词-48-执行报告-保险超龄域评估.md`、`phase5-ts-cleanup-report.md`、`phase8-ts-cleanup-2-prompt.md`
# 第一阶段：止血 — 统一设计系统，消除视觉割裂

## 任务目标

消除 HSE-Dashboard 中自定义页面与标准 Vben Admin 页面之间的视觉割裂。目前 62 个自定义页面使用了独立的 `hsl(var(--*))` CSS 变量体系，与 Ant Design Vue 的 Design Token 并行存在，导致主题切换时两边颜色不一致。

## 背景信息

- **项目路径**：`f:\hse-dashboard\安全看板vben\apps\web-antd`
- **框架**：Vben Admin 5.7.0 + Ant Design Vue + Vue 3
- **自定义页面**：97 个，使用 `hsl(var(--background-deep))`、`hsl(var(--card))`、`hsl(var(--primary))` 等 Vben 内置 CSS 变量
- **已有基础**：`app.vue` 已通过 `useAntdDesignTokens()` + `ConfigProvider` 将 Vben 变量实时桥接到 Antd token
- **CSS 变量本身已对齐，不需要修改变量值**

---

## 执行步骤

### 步骤 1：消除 `:deep()` 穿透 Antd 样式（1 小时）

**问题：** 26 处 `:deep()` 穿透 Antd 内部样式，破坏了 Antd 的主题系统，主题切换时这些穿透样式不会跟随变化。

**查找命令：**
```bash
grep -rn ":deep()" --include="*.vue" f:\hse-dashboard\安全看板vben\apps\web-antd\src\views
```

**处理原则：**

| 场景 | 处理方式 |
|------|---------|
| 覆盖颜色（如 `:deep(.ant-table-header) { background: #xxx }`） | 改为在 `app.vue` 的 `ConfigProvider` 中通过 `theme.components` 统一配置 |
| 覆盖间距/布局（如 `:deep(.ant-card-body) { padding: 0 }`） | 保留，但改用 Antd 组件自带的 `class` 或 `style` 属性 |
| 覆盖字体大小 | 统一使用 Vben 的 `--font-size-base` 变量 |

**禁止的操作：**
- 不要修改 `packages/` 目录下任何文件
- 不要修改 `_core/` 目录下的标准页面
- 不要修改路由配置、API 文件、store 文件

**每个文件改完后，在文件末尾添加注释说明改动：**
```vue
<!-- 设计系统对齐：:deep() 穿透改为 ConfigProvider 统一配置 -->
```

---

### 步骤 2：检查并修复全局 Antd 类名覆盖（30 分钟）

**问题：** 11 个文件中存在非 scoped 的 `.ant-table-tbody`、`.ant-card` 等全局类名覆盖。

**查找命令：**
```bash
grep -rn "\.ant-" --include="*.vue" f:\hse-dashboard\安全看板vben\apps\web-antd\src\views
```

**处理原则：**
- 检查这些样式是否在 `<style scoped>` 中 → 如果在则不需要改（scoped 会自动隔离）
- 如果在 `<style>`（非 scoped）中 → 评估是否为全局样式覆盖，如果是则改为组件级 class 或移除

---

### 步骤 3：统一语义色使用（30 分钟）

**问题：** 部分页面可能硬编码了颜色值（如 `#ff4d4f`、`#52c41a`）而非使用语义变量。

**查找命令：**
```bash
grep -rn "#[0-9a-fA-F]{6}" --include="*.vue" f:\hse-dashboard\安全看板vben\apps\web-antd\src\views\hse | grep -v "hsl\|var(--"
```

**颜色映射表：**

| 硬编码颜色 | 替换为 |
|-----------|--------|
| `#ff4d4f` / `#f5222d` / `#e74c3c` | `hsl(var(--destructive))` |
| `#52c41a` / `#73d13d` / `#27ae60` | `hsl(var(--success))` |
| `#faad14` / `#ffc53d` / `#f39c12` | `hsl(var(--warning))` |
| `#1677ff` / `#1890ff` / `#3498db` | `hsl(var(--primary))` |
| `#999` / `#bfbfbf` / `#d9d9d9` | `hsl(var(--muted-foreground))` 或 `hsl(var(--border))` |
| `#333` / `#262626` | `hsl(var(--foreground))` |
| `#fff` / `#ffffff` | `hsl(var(--card))` 或 `hsl(var(--background))` |
| `#f5f5f5` / `#fafafa` | `hsl(var(--muted))` 或 `hsl(var(--accent))` |

---

### 步骤 4：验证（30 分钟）

完成上述步骤后，执行以下验证：

**1. 构建验证：**
```bash
cd f:\hse-dashboard\安全看板vben\apps\web-antd
pnpm build
```
确保构建无报错。

**2. 视觉检查清单（需人工确认）：**
- [ ] 登录后进入 cockpit 首页，确认统计卡片、图表配色与侧边栏一致
- [ ] 切换暗色模式，确认所有页面（包括员工管理、事故管理、隐患管理等）颜色正确切换
- [ ] 打开一个弹窗（如新增员工），确认弹窗内表单组件颜色与页面一致
- [ ] 检查 `:deep()` 改动的页面，确认 Antd 组件显示正常，无样式错乱

---

## 约束条件

### 禁止修改的文件/目录
- `packages/` 目录下任何文件
- `src/router/` 目录下任何文件
- `src/api/` 目录下任何文件
- `src/store/` 目录下任何文件
- `src/views/_core/` 目录下任何文件
- `src/adapter/` 目录下任何文件
- `src/bootstrap.ts`
- `src/app.vue`
- `vite.config.ts`

### 改动规范
- 每个文件改动后必须在独立段落中描述改动内容
- 如果遇到不确定的改动，跳过该处并在清单中标注"待确认"
- 改动完成后，生成一份修改清单，保存到 `f:\hse-dashboard\docs\design-alignment-report.md`

---

## 修改清单模板

改动完成后，请按以下格式生成 `design-alignment-report.md`：

```markdown
# 设计系统对齐修改清单

## 改动概览
- 处理 :deep() 穿透：X 处
- 处理全局类名覆盖：X 处
- 替换硬编码颜色：X 处
- 待确认项：X 处

## 详细清单

| 文件 | 改动类型 | 改动说明 |
|------|---------|---------|
| src/views/hse/cockpit/index.vue | :deep() 移除 | 将 .ant-card-body 穿透改为 ConfigProvider 配置 |
| src/views/hse/risk-control/index.vue | 硬编码颜色替换 | #ff4d4f → hsl(var(--destructive)) |

## 待确认项

| 文件 | 问题描述 |
|------|---------|
| src/views/xxx/index.vue | :deep() 穿透原因不明，保留原样 |

## 构建结果
- [ ] 构建成功
- [ ] 构建耗时：X 分钟
- [ ] 无新增警告
```

---

## 预期产出

1. 所有 `:deep()` 穿透 Antd 内部样式的代码已处理（替换或保留并标注原因）
2. 所有硬编码颜色值已替换为语义变量
3. 全局 Antd 类名覆盖已检查并处理
4. 构建成功，无报错
5. 修改清单文件已保存到 `f:\hse-dashboard\docs\design-alignment-report.md`
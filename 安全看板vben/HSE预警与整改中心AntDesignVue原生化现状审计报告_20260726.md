# HSE预警与整改中心 Ant Design Vue 原生化现状审计报告

**审计日期：** 2026年7月26日
**审计范围：** F:\hse-dashboard\安全看板vben\apps\web-antd
**审计目标：** 评估预警与整改中心（warning-center、alerts、notifications）是否符合 Ant Design Vue 原生化要求
**声明：** 本阶段未修改任何代码

---

## 一、审计范围

本次审计覆盖以下模块：

| 模块 | 目录 |
|------|------|
| 预警与整改中心（主页面） | src/views/hse/warning-center/ |
| 告警中心 | src/views/hse/alerts/ |
| 通知中心 | src/views/hse/notifications/ |
| 相关API定义 | src/api/hse/warning-center.ts、alerts.ts、notifications.ts |

---

## 二、实际文件清单

### 2.1 页面文件

| 文件 | 类型 | 用途 |
|------|------|------|
| src/views/hse/warning-center/index.vue | 页面 | 预警与整改中心主入口，含4个标签页：风险预警中心、整改任务中心、整改闭环分析、预警规则管理 |
| src/views/hse/alerts/index.vue | 页面 | 告警中心，告警列表展示、批量处置、详情查看 |
| src/views/hse/notifications/index.vue | 页面 | 通知中心，通知列表、已读/未读管理、详情抽屉 |

### 2.2 API 文件

| 文件 | 类型 | 用途 |
|------|------|------|
| src/api/hse/warning-center.ts | API定义 | 预警中心完整API：预警、任务、分析、规则、调度、评价 |
| src/api/hse/alerts.ts | API定义 | 告警相关API：列表、处置、导出 |
| src/api/hse/notifications.ts | API定义 | 通知相关API：列表、已读、删除、导出 |

### 2.3 子组件说明

三个模块均采用单文件结构（index.vue），**无子组件拆分**。所有业务逻辑、模板、样式均封装在各自的 index.vue 中。

---

## 三、组件使用情况

### 3.1 warning-center/index.vue

| 组件（模板中使用） | 组件写法 | 是否显式导入 | 状态 |
|---------------------|----------|--------------|------|
| Page | PascalCase | 是（@vben/common-ui） | ✅ 正常 |
| Tabs | PascalCase | 是 | ✅ 正常 |
| Tabs.TabPane | PascalCase | 是（随Tabs） | ✅ 正常 |
| Select | PascalCase | 是 | ✅ 正常 |
| EchartsUI | PascalCase | 是（@vben/plugins/echarts） | ✅ 正常 |
| a-button | kebab-case | 否 | ⚠️ 建议显式导入 |
| a-row | kebab-case | 否 | ⚠️ 建议显式导入 |
| a-col | kebab-case | 否 | ⚠️ 建议显式导入 |
| a-card | kebab-case | 否 | ⚠️ 建议显式导入 |
| a-statistic | kebab-case | 否 | ⚠️ 建议显式导入 |
| a-space | kebab-case | 否 | ⚠️ 建议显式导入 |
| a-table | kebab-case | 否 | ⚠️ 建议显式导入 |
| a-tag | kebab-case | 否 | ⚠️ 建议显式导入 |
| a-tooltip | kebab-case | 否 | ⚠️ 建议显式导入 |
| a-pagination | kebab-case | 否 | ⚠️ 建议显式导入 |
| a-modal | kebab-case | 否 | ⚠️ 建议显式导入 |
| a-form | kebab-case | 否 | ⚠️ 建议显式导入 |
| a-form-item | kebab-case | 否 | ⚠️ 建议显式导入 |
| a-textarea | kebab-case | 否 | ⚠️ 建议显式导入 |
| a-input-number | kebab-case | 否 | ⚠️ 建议显式导入 |
| a-upload-dragger | kebab-case | 否 | ⚠️ 建议显式导入 |
| a-radio-group | kebab-case | 否 | ⚠️ 建议显式导入 |
| a-radio | kebab-case | 否 | ⚠️ 建议显式导入 |
| a-drawer | kebab-case | 否 | ⚠️ 建议显式导入 |
| a-timeline | kebab-case | 否 | ⚠️ 建议显式导入 |
| a-timeline-item | kebab-case | 否 | ⚠️ 建议显式导入 |
| a-switch | kebab-case | 否 | ⚠️ 建议显式导入 |
| message | JS函数 | 是 | ✅ 正常 |
| Modal | JS函数 | 是 | ✅ 正常 |

### 3.2 alerts/index.vue

| 组件 | 组件写法 | 是否显式导入 | 状态 |
|------|----------|--------------|------|
| Page | PascalCase | 是 | ✅ 正常 |
| Row | PascalCase | 是 | ✅ 正常 |
| Col | PascalCase | 是 | ✅ 正常 |
| Card | PascalCase | 是 | ✅ 正常 |
| Skeleton | PascalCase | 是 | ✅ 正常 |
| Statistic | PascalCase | 是 | ✅ 正常 |
| Button | PascalCase | 是 | ✅ 正常 |
| Form | PascalCase | 是 | ✅ 正常 |
| FormItem | PascalCase | 是 | ✅ 正常 |
| Input | PascalCase | 是 | ✅ 正常 |
| Select | PascalCase | 是 | ✅ 正常 |
| DatePicker | PascalCase | 是 | ✅ 正常 |
| Table | PascalCase | 是 | ✅ 正常 |
| Tag | PascalCase | 是 | ✅ 正常 |
| Space | PascalCase | 是 | ✅ 正常 |
| Modal | PascalCase | 是 | ✅ 正常 |
| Drawer | PascalCase | 是 | ✅ 正常 |
| Descriptions | PascalCase | 是 | ✅ 正常 |
| DescriptionsItem | PascalCase | 是 | ✅ 正常 |
| IconifyIcon | PascalCase | 是（@vben/icons） | ✅ 正常 |
| message | JS函数 | 是 | ✅ 正常 |

**结论：** alerts/index.vue 所有 Ant Design Vue 组件均已显式导入，状态良好。

### 3.3 notifications/index.vue

| 组件 | 组件写法 | 是否显式导入 | 状态 |
|------|----------|--------------|------|
| Page | PascalCase | 是 | ✅ 正常 |
| Card | PascalCase | 是 | ✅ 正常 |
| Tag | PascalCase | 是 | ✅ 正常 |
| Space | PascalCase | 是 | ✅ 正常 |
| Button | PascalCase | 是 | ✅ 正常 |
| Popconfirm | PascalCase | 是 | ✅ 正常 |
| Form | PascalCase | 是 | ✅ 正常 |
| FormItem | PascalCase | 是 | ✅ 正常 |
| Input | PascalCase | 是 | ✅ 正常 |
| Select | PascalCase | 是 | ✅ 正常 |
| Tabs | PascalCase | 是 | ✅ 正常 |
| Badge | PascalCase | 是 | ✅ 正常 |
| List | PascalCase | 是 | ✅ 正常 |
| ListItem | PascalCase | 是 | ✅ 正常 |
| ListItemMeta | PascalCase | 是 | ✅ 正常 |
| Avatar | PascalCase | 是 | ✅ 正常 |
| Drawer | PascalCase | 是 | ✅ 正常 |
| Divider | PascalCase | 是 | ✅ 正常 |
| Alert | PascalCase | 是 | ✅ 正常 |
| IconifyIcon | PascalCase | 是（@vben/icons） | ✅ 正常 |
| message | JS函数 | 是 | ✅ 正常 |

**结论：** notifications/index.vue 所有 Ant Design Vue 组件均已显式导入，状态良好。

---

## 四、自定义实现分析（自造轮子检查）

### 4.1 判断标准

仅当 Ant Design Vue 已存在成熟组件但被重新实现时，才记录为问题。以下情况**不属于问题**：
- div 布局容器 / flex 布局 / grid 布局
- ECharts 容器及图表固定高度
- 业务组合卡片
- 页面局部 CSS

### 4.2 检查结果

| 文件 | 自定义实现 | 是否存在对应Ant组件 | 判定 |
|------|-----------|-------------------|------|
| warning-center/index.vue | `.overdue-tag` / `.expiring-tag`：span + 自定义样式实现的状态标签 | Tag 组件 | ⚠️ P2：可用Tag替换，但属业务细节，不影响功能 |
| warning-center/index.vue | `.ellipsis-cell`：文本省略样式 | 无直接对应组件（Tooltip已使用） | ✅ 正常，属业务样式 |
| warning-center/index.vue | `.pagination-wrapper`：分页容器样式 | 无 | ✅ 正常，属布局容器 |
| warning-center/index.vue | `.upload-placeholder`：上传占位样式 | Upload组件已使用 | ✅ 正常，属细节样式 |
| alerts/index.vue | `.card-header` / `.header-actions`：卡片标题自定义布局 | Card#title 插槽 + Space | ✅ 正常，属业务组合 |
| alerts/index.vue | `.filter-form`：筛选表单边框 | Form 组件已使用 | ✅ 正常，属细节样式 |
| notifications/index.vue | `.unread-dot`：未读小圆点 | Badge 组件已使用 | ✅ 正常，属细节补充 |
| notifications/index.vue | 卡片标题布局 / 通知列表项 hover 样式 | 无直接对应组件 | ✅ 正常，属业务样式 |

### 4.3 结论

**未发现真正的"自造轮子"问题。** 所有自定义样式均属于：
1. 正常业务布局（flex/grid容器）
2. 组件细节样式微调
3. Ant Design Vue 组件插槽内的业务组合

---

## 五、主题颜色扫描

### 5.1 warning-center/index.vue（共8处硬编码颜色）

| 行号 | 位置 | 颜色值 | 当前用途 | 建议替换 |
|------|------|--------|----------|----------|
| 1423 | `.deadline-overdue` color | `#f5222d` | 逾期文字 | `hsl(var(--error))` |
| 1428 | `.deadline-expiring` color | `#fa8c16` | 临期文字 | `hsl(var(--warning))` |
| 1436 | `.overdue-tag` color | `#fff` | 逾期标签文字 | `hsl(var(--error-foreground))` 或保持白色但使用变量 |
| 1437 | `.overdue-tag` background | `#f5222d` | 逾期标签背景 | `hsl(var(--error))` |
| 1445 | `.expiring-tag` color | `#fff` | 临期标签文字 | 同上 |
| 1446 | `.expiring-tag` background | `#fa8c16` | 临期标签背景 | `hsl(var(--warning))` |
| 1479 | `.version-log` color | `#595959` | 版本日志文字 | `hsl(var(--muted-foreground))` |
| 1485 | `.version-time` color | `#bfbfbf` | 版本时间文字 | `hsl(var(--muted-foreground))` |

### 5.2 alerts/index.vue

**0处硬编码颜色。** 全部使用 CSS 变量：
- `hsl(var(--border))` - 边框

### 5.3 notifications/index.vue

**0处硬编码颜色。** 全部使用 CSS 变量：
- `hsl(var(--border))` - 边框
- `hsl(var(--accent) / 0.4)` - hover背景
- `hsl(var(--primary) / 0.06)` - 未读背景
- `hsl(var(--error))` - 未读圆点
- `hsl(var(--muted-foreground))` - 次要文字
- `hsl(var(--foreground) / 0.8)` - 正文
- `hsl(var(--foreground) / 0.9)` - 详情内容

### 5.4 主题适配总结

| 文件 | 硬编码颜色数 | 严重程度 |
|------|-------------|----------|
| warning-center/index.vue | 8处 | 🔴 P1：主题相关颜色硬编码，影响暗色模式 |
| alerts/index.vue | 0处 | ✅ 已适配 |
| notifications/index.vue | 0处 | ✅ 已适配 |

---

## 六、类型检查结果

### 6.1 执行命令

```bash
cd F:\hse-dashboard\安全看板vben\apps\web-antd
pnpm typecheck  # vue-tsc --noEmit --skipLibCheck
```

### 6.2 warning-center 相关文件

| 文件 | 类型错误数 |
|------|-----------|
| src/views/hse/warning-center/index.vue | **0** |
| src/views/hse/alerts/index.vue | **0** |
| src/views/hse/notifications/index.vue | **0** |
| src/api/hse/warning-center.ts | **0** |
| src/api/hse/alerts.ts | **0** |
| src/api/hse/notifications.ts | **0** |

### 6.3 结论

**预警与整改中心相关文件全部通过类型检查，0个类型错误。**

> 注：整个项目类型检查存在外部错误（training模块、violations模块、shadcn-ui包等），但与本次审计的三个模块无关。

---

## 七、路由入口确认

### 7.1 总览路由（/overview/*）

来源：[hse-01-overview.ts](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-01-overview.ts)

| 路由 | 是否存在 | 页面组件 |
|------|---------|---------|
| /overview/warning-center | ✅ 是 | warning-center/index.vue |
| /overview/alerts | ✅ 是 | alerts/index.vue |
| /overview/notifications | ✅ 是 | notifications/index.vue |

### 7.2 高级分析路由（/hse-advanced/*）

来源：[hse-advanced.ts](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-advanced.ts)

| 路由 | 是否存在 | 页面组件 |
|------|---------|---------|
| /hse-advanced/warning-center | ✅ 是 | warning-center/index.vue |
| /hse-advanced/alerts | ❌ 否 | - |
| /hse-advanced/notifications | ❌ 否 | - |

### 7.3 路由问题汇总

| 问题 | 级别 | 说明 |
|------|------|------|
| /hse-advanced/alerts 路由缺失 | ⚠️ P2 | alerts 模块仅在 overview 下注册，hse-advanced 下缺失 |
| /hse-advanced/notifications 路由缺失 | ⚠️ P2 | notifications 模块仅在 overview 下注册，hse-advanced 下缺失 |

---

## 八、P0-P3 问题列表

### P0：阻断页面运行

**无 P0 问题。** 所有页面均可正常编译加载。

### P1：必须修复

| 编号 | 文件 | 问题 | 描述 |
|------|------|------|------|
| P1-01 | [warning-center/index.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/warning-center/index.vue#L1423-L1485) | 硬编码主题颜色（8处） | 逾期/临期状态颜色、版本日志文字颜色均使用硬编码 hex，影响暗色模式适配 |
| P1-02 | [warning-center/index.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/warning-center/index.vue#L1-L597) | 组件写法不统一 | 模板中大量使用 kebab-case（a-button, a-card 等），未使用 PascalCase 显式导入，可能导致开发模式警告 |

### P2：建议修复

| 编号 | 文件 | 问题 | 描述 |
|------|------|------|------|
| P2-01 | [hse-advanced.ts](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-advanced.ts) | alerts 路由缺失 | /hse-advanced/alerts 未在高级分析路由中注册 |
| P2-02 | [hse-advanced.ts](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-advanced.ts) | notifications 路由缺失 | /hse-advanced/notifications 未在高级分析路由中注册 |
| P2-03 | [warning-center/index.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/warning-center/index.vue#L1432-L1448) | 状态标签自定义实现 | .overdue-tag / .expiring-tag 可考虑使用 Ant Design Vue Tag 组件 + color 属性替代 |

### P3：优化建议

| 编号 | 文件 | 问题 | 描述 |
|------|------|------|------|
| P3-01 | warning-center/index.vue | 文件过大 | 单文件约1500行，包含4个标签页完整逻辑，建议按标签页拆分子组件 |
| P3-02 | 三个模块 | 代码风格不统一 | alerts/notifications 使用 PascalCase 组件，warning-center 使用 kebab-case，建议统一 |

---

## 九、改造建议

### 9.1 优先级排序

1. **第一优先级（P1）**：主题颜色硬编码修复
2. **第二优先级（P1）**：组件写法统一与显式导入
3. **第三优先级（P2）**：路由补全
4. **第四优先级（P2/P3）**：细节优化与代码整理

### 9.2 具体改造方案

#### 方案一：主题颜色硬编码修复（P1-01）

将 warning-center/index.vue 中8处硬编码颜色替换为 CSS 变量：

```scss
// 替换前
.deadline-overdue {
  color: #f5222d;
}

// 替换后
.deadline-overdue {
  color: hsl(var(--error));
}
```

颜色映射参考：

| 原颜色 | 建议变量 |
|--------|---------|
| `#f5222d` | `hsl(var(--error))` |
| `#fa8c16` | `hsl(var(--warning))` |
| `#595959` | `hsl(var(--muted-foreground))` |
| `#bfbfbf` | `hsl(var(--muted-foreground))` |

#### 方案二：组件写法统一（P1-02）

参考 alerts/index.vue 和 notifications/index.vue 的写法：

1. 将所有 kebab-case 组件改为 PascalCase
2. 在 script 中显式导入所有用到的 Ant Design Vue 组件

示例：

```vue
<!-- 替换前 -->
<a-button type="primary">按钮</a-button>
<a-card :bordered="false">卡片</a-card>

<!-- 替换后 -->
<Button type="primary">按钮</Button>
<Card :bordered="false">卡片</Card>
```

需要导入的组件清单（共约27个）：
Button, Row, Col, Card, Statistic, Space, Table, Tag, Tooltip, Pagination, Modal, Form, FormItem, Input, InputNumber, Textarea, Upload, UploadDragger, Radio, RadioGroup, Drawer, Timeline, TimelineItem, Switch

#### 方案三：路由补全（P2-01、P2-02）

在 hse-advanced.ts 中补充 alerts 和 notifications 路由（如需）。

---

## 十、审计总结

### 10.1 整体评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 组件使用正确性 | ⭐⭐⭐⭐ | alerts/notifications 优秀，warning-center 需统一写法 |
| 主题适配 | ⭐⭐⭐ | 2/3模块已适配，warning-center 需修复8处硬编码 |
| 类型安全 | ⭐⭐⭐⭐⭐ | 全部通过类型检查 |
| 自造轮子 | ⭐⭐⭐⭐⭐ | 未发现真正的自造轮子 |
| 路由完整性 | ⭐⭐⭐ | hse-advanced 下缺失2个路由 |

### 10.2 核心结论

**预警与整改中心当前基本符合 Ant Design Vue 原生化要求，但存在以下必须修复的问题：**

1. **warning-center/index.vue 存在8处硬编码主题颜色**（P1），影响暗色模式适配
2. **warning-center/index.vue 组件写法不统一**（P1），kebab-case + 未显式导入，与 alerts/notifications 风格不一致
3. **hse-advanced 路由缺失**（P2）：alerts 和 notifications 未注册

### 10.3 与其他模块对比

| 模块 | 硬编码颜色 | 组件导入 | 类型检查 |
|------|-----------|---------|---------|
| 考核分析中心（已修复） | 0处 | 已显式导入 | 通过 |
| 预警与整改中心（本次） | 8处（warning-center） | 部分未显式导入 | 通过 |
| └ alerts | 0处 | 全部显式导入 | 通过 |
| └ notifications | 0处 | 全部显式导入 | 通过 |

---

## 十一、声明

**本阶段严格遵守审计规范，未修改任何代码。** 所有分析基于 F:\hse-dashboard\安全看板vben\apps\web-antd 目录下的真实代码。未引用任何外部副本或历史报告。

---

**报告生成时间：** 2026年7月26日
**审计人：** TRAE AI Assistant

# UI/UX 规范分析报告 — safety_board.html

> 分析文件：`C:/Users/honey/Desktop/新建文件夹 (3)/safety_board.html`（2376行）
> 分析日期：2026-06-29

---

## 一、交互模式

### 1.1 点击交互（Click）

| 交互场景 | 触发方式 | 反馈机制 | 代码位置 |
|---------|---------|---------|---------|
| **导航Tab切换** | `onclick="switchPage('pageName')"` | Tab高亮切换（`.nav-tab.active`），对应Page显示/隐藏 | L641-650（HTML）、L1597-1605（JS） |
| **KPI卡片跳转** | `onclick="switchPage('pageName')"` | 直接切换到对应模块页面 | L658-700 |
| **预警徽章点击** | `onclick="showAlertsModal()"` | 弹出全屏Modal汇总所有预警 | L636、L1625-1627 |
| **按钮点击** | `onclick="openModal(...)"` / `onclick="openHazardModal(...)"` 等 | 弹出对应Modal，动态填充内容 | L717-741等多处 |
| **"展开全部"加载** | `onclick="loadMoreRisk()"` | 弹出Modal展示完整清单 | L896、L1695-1712 |
| **"发送提醒"按钮** | `onclick="sendGridRemind(name, town)"` | 弹出网格提醒Modal，含接收人+内容 | L1287-1315 |
| **"续保处理"按钮** | `onclick="renewOne(id)"` / `onclick="renewMerged(ids)"` | `window.confirm()`原生确认弹窗，确认后更新表格 | L2246-2275 |
| **"详情"按钮（车辆批次）** | `onclick="showVehDetail(ids)"` | 展开/显示车辆详情卡片 | L2226-2335 |

### 1.2 Hover 交互

| 组件 | Hover效果 | 实现方式 | 代码位置 |
|-----|---------|---------|---------|
| **导航Tab** | 文字变青 + 背景微亮 | `color: var(--accent-cyan); background: rgba(42,127,255,0.1)` | L81 |
| **KPI卡片** | `border-color`变青 + 上移2px + 发光阴影 | `transform: translateY(-2px); box-shadow: 0 4px 20px rgba(42,127,255,0.25)` | L159 |
| **数据表格行** | 背景微亮蓝 | `background: rgba(42,127,255,0.06)` | L185 |
| **车辆卡片** | 边框变青 + 背景微蓝 | `border-color: var(--accent-cyan); background: rgba(42,127,255,0.05)` | L271 |
| **安全生产月卡片** | 边框变青 + 上移6px + 蓝色发光 + 顶部渐变条显现 | `transform: translateY(-6px); box-shadow; ::before opacity:1` | L583-590 |
| **小按钮（btn-sm）** | 亮度提升 + 上移1px | `filter: brightness(1.3); transform: translateY(-1px)` | L240 |
| **Modal关闭按钮** | 文字变红 | `color: var(--accent-red)` | L302 |
| **事故悬浮弹窗** | 整体悬浮弹窗显示 | `.accident-popup-wrapper:hover .accident-popup { display: block }` | L389-391 |
| **事故弹窗内条目** | 背景变橙 | `background: rgba(255,152,0,0.08)` | L438 |
| **事故行hover** | 背景微蓝 | `background: rgba(42,127,255,0.06)` | L499-501 |
| **事故提示文字** | 颜色变亮橙 | `color: #ffb74d` | L483 |
| **外框按钮（btn-outline）** | 文字变亮 + 边框变蓝 | `color: var(--text-primary); border-color: var(--accent-blue)` | L239 |

### 1.3 动效与过渡动画

| 动画 | 效果描述 | 参数 | 代码位置 |
|-----|---------|-----|---------|
| **预警徽章脉冲** | 红色光晕向外扩散消失，循环 | `animation: pulse-red 1.5s infinite` | L61-64 |
| **进度条过渡** | 宽度变化平滑过渡 | `transition: width 0.8s ease` | L207 |
| **超期文字闪烁** | 透明度在1和0.3之间闪烁 | `animation: blink-text 1.2s steps(1) infinite` | L317-319 |
| **Tab切换过渡** | 所有属性0.2s过渡 | `transition: all 0.2s` | L79 |
| **KPI卡片过渡** | `transition: all 0.25s` | L157 |
| **车辆卡片过渡** | `transition: all 0.2s` | L269 |
| **按钮过渡** | `transition: all 0.2s` | L233, L310 |
| **Modal按钮hover** | `filter: brightness(1.2)` | L314 |
| **悬浮弹窗出场** | 从上方8px滑入 + 淡入 | `animation: popupIn 0.2s ease` | L386, L392-395 |
| **安全生产月卡片** | `transition: all 0.3s ease` | L569 |
| **安全生产月顶部条** | opacity过渡 | `transition: opacity 0.3s` | L581 |
| **事故行过渡** | `transition: background 0.2s` | L497 |
| **事故提示过渡** | `transition: color 0.2s` | L481 |

### 1.4 缺失的交互反馈

| 缺失项 | 影响 | 建议 |
|-------|-----|-----|
| **点击态（:active）** | 按钮点击时无按压反馈 | 添加 `transform: scale(0.97)` 按压效果 |
| **加载状态** | 无loading动画，数据异步加载时无反馈 | 添加骨架屏或spinner |
| **网络错误状态** | 图表初始化失败无错误提示 | 添加fallback提示 |
| **空数据状态** | 部分表格（如风险清单动态注入）无空状态设计 | JS中有"暂无数据"回退，但样式为内联 |

---

## 二、组件交互规范

### 2.1 按钮（Button）

#### 层级体系

| 层级 | 类名 | 样式 | 使用场景 | 位置 |
|-----|------|-----|---------|------|
| **小号操作按钮** | `.btn-sm` | `padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: 600` | 表格行内操作、预警操作 | L231-232 |
| **Modal操作按钮** | `.btn-modal` | `flex: 1; padding: 8px; border-radius: 6px; font-size: 13px; font-weight: 600` | Modal底部确认/取消按钮 | L308-311 |

#### 语义色变体（btn-sm）

| 变体 | 类名 | 背景色 | 文字色 | 边框 | 位置 |
|-----|------|-------|-------|-----|------|
| 红色/危险 | `.btn-red` | `rgba(255,61,61,0.2)` | `var(--red-risk)` | `rgba(255,61,61,0.4)` | L235 |
| 蓝色/信息 | `.btn-blue` | `rgba(42,127,255,0.2)` | `var(--accent-blue)` | `rgba(42,127,255,0.4)` | L236 |
| 绿色/成功 | `.btn-green` | `rgba(0,230,118,0.15)` | `var(--accent-green)` | `rgba(0,230,118,0.3)` | L237 |
| 外框/次要 | `.btn-outline` | `transparent` | `var(--text-secondary)` | `rgba(138,180,216,0.3)` | L238 |
| 已续保/禁用 | `.btn-renewed` | `rgba(0,230,118,0.12)` | `var(--accent-green)` | `rgba(0,230,118,0.3)` + `cursor: default; opacity: 0.7` | L241 |

#### Modal按钮变体

| 变体 | 类名 | 样式 | 位置 |
|-----|------|-----|------|
| 确认/主操作 | `.btn-confirm` | `background: var(--accent-blue); color: #fff` | L312 |
| 取消/次要 | `.btn-cancel` | `background: rgba(255,255,255,0.1); color: var(--text-secondary)` | L313 |

#### 状态一致性分析

| 状态 | 是否统一 | 说明 |
|-----|---------|------|
| Hover | ✅ 统一 | 所有btn-sm共用 `filter: brightness(1.3); transform: translateY(-1px)` |
| Active | ❌ 缺失 | 无 `:active` 伪类样式 |
| Disabled | ⚠️ 部分 | `.btn-renewed` 作为禁用态，但非标准 `disabled` 属性 |
| Focus | ❌ 缺失 | 无 `:focus` / `:focus-visible` 样式，不满足无障碍要求 |

### 2.2 卡片（Card）

#### 层级体系

| 类型 | 类名 | 样式特征 | 使用场景 |
|-----|------|---------|---------|
| 基础卡片 | `.card` | `bg-card + 1px border-blue + 10px圆角 + 顶部渐变装饰线` | 通用内容容器 |
| 预警卡片 | `.card.alert-card` | `border-color: red; 顶部红色渐变线` | 紧急预警内容区 |
| 警告卡片 | `.card.warn-card` | `border-color: orange; 顶部橙色渐变线` | 较大风险区域 |
| 正常卡片 | `.card.ok-card` | `border-color: green; 顶部绿色渐变线` | 安全天数展示 |
| KPI卡片 | `.kpi-card` | `bg-card + 1px border-blue + 10px圆角 + clickable` | KPI指标展示 |
| KPI卡片色变 | `.kpi-card.kpi-red/orange/yellow/green/blue/cyan` | 仅顶部3px横线颜色不同 | KPI状态区分 |
| 车辆卡片 | `.vehicle-card` | `bg-card2 + 8px圆角 + flex布局` | 车辆列表项 |
| 安全生产月卡片 | `.sm-item` | `渐变背景 + 12px圆角 + 大图标 + 幽灵序号` | 安全月活动项 |

#### 卡片装饰线（::before 伪元素）

所有 `.card` 类卡片顶部均有2px渐变装饰线（L116-127）：
- 默认：`accent-blue` 渐变
- `.alert-card`：`accent-red` 渐变
- `.warn-card`：`accent-orange` 渐变
- `.ok-card`：`accent-green` 渐变

### 2.3 表格（Table）

| 特征 | 规范 | 位置 |
|-----|-----|------|
| 基础类名 | `.data-table` | L174 |
| 表头背景 | `rgba(26,74,138,0.5)` | L176 |
| 表头文字色 | `var(--accent-cyan)` | L177 |
| 表头字重 | `600` | L178 |
| 行hover | `rgba(42,127,255,0.06)` | L185 |
| 单元格padding | `7px 8px` | L178, L182 |
| 底部分隔线 | `1px solid rgba(26,74,138,0.3)` | L182 |
| 字体大小 | `12px` | L174 |

### 2.4 列表项组件

| 组件 | 类名 | 特征 | 位置 |
|-----|------|-----|------|
| 预警条目 | `.alert-item` | flex布局 + 左侧3px彩色边框 + 圆角6px + 层级间距6px | L216-229 |
| 预警变体 | `.a-red / .a-orange / .a-yellow / .a-green` | 边框颜色 + 背景色微弱变化 | L221-224 |
| 检查清单项 | `.check-item` | flex + 图标 + 文字 + 元数据 | L336-343 |
| 统计行 | `.stat-row` | flex space-between + 标签/值分布 | L331-333 |
| 评分项 | `.score-item` | 包含名称/值 + 进度条 | L346-349 |
| 时间线条目 | `.tl-item` | 相对定位 + 左侧圆点 | L254-262 |
| 事故行 | `.accident-row` | 背景bg-card + hover微蓝 + 分隔间隙1px | L494-501 |

### 2.5 输入框与表单

> **本文件无 `<input>` / `<textarea>` / `<select>` 原生表单控件**。所有数据交互均通过按钮 + Modal 完成，属于只读看板设计。

---

## 三、弹窗体系

### 3.1 Modal（遮罩弹窗）

#### 架构

```
.modal-overlay（全屏半透明遮罩，display:none → .show时display:flex）
  └── .modal-box（居中容器，max-width: 560px，max-height: 80vh）
       ├── .modal-header（标题 + 关闭按钮）
       ├── .modal-field / .modal-value（内容区）
       └── .modal-actions（底部操作按钮）
```

| 属性 | 值 | 位置 |
|-----|---|------|
| 遮罩背景 | `rgba(0,0,0,0.7)` | L289 |
| 遮罩层级 | `z-index: 1000` | L289 |
| 弹窗最大宽度 | `560px` | L295 |
| 弹窗最大高度 | `80vh`（超出滚动） | L296 |
| 弹窗圆角 | `12px` | L295 |
| 弹窗内边距 | `24px` | L295 |
| 关闭方式 | 点击 ✕ 按钮 / 点击遮罩外部 | L301, L1714-1716 |
| 出场动画 | 无（直接display切换） | — |

#### 已知 Modal 实例

| ID | 标题 | 触发方式 | 关闭方式 | 位置 |
|----|-----|---------|---------|------|
| `modal-alerts` | 紧急预警事项汇总 | 头栏预警徽章点击 | ✕ 按钮 + 遮罩点击 + "知悉"按钮 | L1529-1542 |
| `modal-grid-remind` | 发送巡查提醒 | sendGridRemind()函数 | ✕ 按钮 + 遮罩点击 + 确认/取消按钮 | L1544-1556 |
| `modal-insurance` | 车辆保险续保处理 | openInsuranceModal()函数 | ✕ 按钮 + 遮罩点击 + 确认/取消按钮 | L1558-1570 |
| `modal-generic` | 动态标题（通用弹窗） | openModal() / openHazardModal() / openRiskModal() / confirmGridRemind()等 | ✕ 按钮 + 遮罩点击 + 确认/关闭按钮 | L1572-1584 |

#### 遮罩点击关闭（全局）

```javascript
// L1714-1716
document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', function(e) { if(e.target===this) closeModal(this.id); });
});
```

#### Modal 状态

| 状态 | 实现方式 |
|-----|---------|
| 打开 | `element.classList.add('show')` → `display: flex` |
| 关闭 | `element.classList.remove('show')` → `display: none` |
| 内容动态填充 | 打开前通过 `innerHTML` 直接修改内容DOM |
| 滚动处理 | `overflow-y: auto` 自动处理 |

### 3.2 Popover（悬浮弹窗）

| 名称 | 触发方式 | 位置/层级 | 关闭方式 | 位置 |
|-----|---------|---------|---------|------|
| **事故未结案悬浮弹窗** | 鼠标hover父容器 `.accident-popup-wrapper` | `position: absolute; z-index: 500`，相对于父容器定位 | 鼠标移出 | L366-482 |

#### 悬浮弹窗特征

- 三角箭头（::before 蓝色边框 + ::after 填充色）指向父容器 L396-417
- 入场动画：`popupIn` 0.2s（从上方8px滑入 + 淡入）L392-395
- 最大宽度420px，最小340px L383
- 内嵌条目hover变橙色背景 L438

### 3.3 其他弹窗类型

| 类型 | 实现方式 | 使用场景 |
|-----|---------|---------|
| **window.confirm()** | 浏览器原生确认弹窗 | 续保操作确认（renewOne / renewMerged） |
| **Toast / Snackbar** | ❌ 缺失 | 操作成功/失败提示（如续保成功后的确认弹窗用了modal-generic替代） |
| **Bottom Sheet** | ❌ 缺失 | — |
| **Drawer** | ❌ 缺失 | — |

---

## 四、胶囊 / Tag / 徽标

### 4.1 风险标签（Risk Tag）— 表格内状态标记

类名：`.risk-tag`

| 属性 | 值 | 位置 |
|-----|---|------|
| display | `inline-block` | L196 |
| padding | `2px 8px` | L196 |
| border-radius | `4px`（微圆角矩形，非全胶囊） | L196 |
| font-size | `11px` | L197 |
| font-weight | `700` | L197 |

**配色变体**（半透明背景 + 边框）：

| 变体 | 类名 | 背景 | 文字色 | 边框 | 位置 |
|-----|------|-----|-------|-----|------|
| 红色 | `.tag-red` | `rgba(255,61,61,0.2)` | `var(--red-risk)` | `rgba(255,61,61,0.5)` | L199 |
| 橙色 | `.tag-orange` | `rgba(255,152,0,0.2)` | `var(--accent-orange)` | `rgba(255,152,0,0.5)` | L200 |
| 黄色 | `.tag-yellow` | `rgba(255,215,64,0.15)` | `var(--accent-yellow)` | `rgba(255,215,64,0.4)` | L201 |
| 蓝色 | `.tag-blue` | `rgba(42,127,255,0.15)` | `var(--accent-blue)` | `rgba(42,127,255,0.4)` | L202 |
| 绿色 | `.tag-green` | `rgba(0,230,118,0.12)` | `var(--accent-green)` | `rgba(0,230,118,0.3)` | L203 |

### 4.2 卡片徽标（Card Badge）— 卡片头右侧标记

类名：`.card-badge`

| 属性 | 值 | 位置 |
|-----|---|------|
| font-size | `10px` | L141 |
| padding | `2px 8px` | L141 |
| border-radius | `10px`（全胶囊形） | L142 |
| font-weight | `600` | L142 |

**配色变体**：

| 变体 | 类名 | 背景 | 文字色 | 边框 | 位置 |
|-----|------|-----|-------|-----|------|
| 红色 | `.badge-red` | `rgba(255,61,61,0.2)` | `var(--accent-red)` | `rgba(255,61,61,0.4)` | L144 |
| 橙色 | `.badge-orange` | `rgba(255,152,0,0.2)` | `var(--accent-orange)` | `rgba(255,152,0,0.4)` | L145 |
| 绿色 | `.badge-green` | `rgba(0,230,118,0.15)` | `var(--accent-green)` | `rgba(0,230,118,0.3)` | L146 |
| 蓝色 | `.badge-blue` | `rgba(42,127,255,0.15)` | `var(--accent-blue)` | `rgba(42,127,255,0.3)` | L147 |
| 黄色 | `.badge-yellow` | `rgba(255,215,64,0.15)` | `var(--accent-yellow)` | `rgba(255,215,64,0.3)` | L148 |

### 4.3 Tab徽标（Tab Badge）— 导航Tab上的计数标记

类名：`.tab-badge`

| 属性 | 值 | 位置 |
|-----|---|------|
| background | `var(--accent-red)` | L87 |
| color | `#fff` | L87 |
| border-radius | `10px`（全胶囊形） | L88 |
| font-size | `10px` | L88 |
| padding | `1px 5px` | L89 |
| margin-left | `4px` | L89 |

**⚠️ 注意**：Tab徽标仅红色一种，无其他颜色变体，缺失状态区分能力。

### 4.4 预警徽标（Alert Badge）— 头部红色胶囊

类名：`.alert-badge`（L57-63）

| 属性 | 值 |
|-----|---|
| background | `var(--accent-red)` |
| color | `#fff` |
| border-radius | `20px`（大圆角全胶囊） |
| padding | `4px 12px` |
| font-size | `12px` |
| font-weight | `700` |
| animation | `pulse-red 1.5s infinite`（脉冲呼吸） |

### 4.5 事故条目标记（ar-badge）— 事故清单行内标记

类名：`.ar-badge`（L528-542）

| 属性 | 值 | 位置 |
|-----|---|------|
| padding | `2px 8px` | L530 |
| border-radius | `3px`（小圆角） | L531 |
| font-size | `11px` | L532 |
| font-weight | `600` | L533 |

**配色变体（功能语义色）**：

| 变体 | 用途 | 背景 | 文字色 |
|-----|------|-----|-------|
| `.ar-traffic` | 交通事故 | `rgba(255,61,61,0.12)` | `#ff5c5c` |
| `.ar-accident` | 意外事故 | `rgba(255,193,7,0.12)` | `#ffc107` |
| `.ar-illness` | 突发疾病 | `rgba(186,104,200,0.12)` | `#ce93d8` |
| `.ar-nature` | 责任性质 | `rgba(100,181,246,0.10)` | `var(--text-secondary)` |
| `.ar-level` | 事故等级 | `rgba(255,152,0,0.12)` | `#ff9800` |
| `.ar-status-pending` | 处理中 | `rgba(255,152,0,0.15)` | `#ff9800` |
| `.ar-status-done` | 已结案 | `rgba(0,230,118,0.12)` | `#00e676` |

### 4.6 合并标记（Merge Tag）— 保险批次合并标记

类名：`.merge-tag`（L246）

| 属性 | 值 |
|-----|---|
| padding | `1px 6px` |
| border-radius | `3px` |
| background | `rgba(42,127,255,0.15)` |
| color | `var(--accent-blue)` |
| font-size | `10px` |
| font-weight | `600` |

### 4.7 胶囊/Tag 规范汇总

| 类型 | 圆角 | padding | 字号 | 字重 | 配色体系 |
|-----|------|---------|------|------|---------|
| risk-tag | 4px | 2px 8px | 11px | 700 | 五色系（R/O/Y/B/G） |
| card-badge | 10px | 2px 8px | 10px | 600 | 五色系（R/O/Y/B/G，背景透明度有微小差异） |
| tab-badge | 10px | 1px 5px | 10px | — | 仅红色 |
| alert-badge | 20px | 4px 12px | 12px | 700 | 红色/绿色 |
| ar-badge | 3px | 2px 8px | 11px | 600 | 七色（独立色值体系） |
| merge-tag | 3px | 1px 6px | 10px | 600 | 仅蓝色 |

**⚠️ 一致性问题**：
1. `risk-tag` 和 `card-badge` 使用相同五色但**背景透明度比例不完全一致**（tag-red: 0.2 vs badge-red: 0.2/tag-orange: 0.2 vs badge-orange: 0.2 等基本一致，但 green: tag 0.12 vs badge 0.15）
2. `ar-badge` 的配色体系与其余Tag**完全独立**，使用硬编码色值而非CSS变量
3. 圆角半径不统一（3px / 4px / 10px / 20px），缺少系统化梯度

---

## 五、配色体系

### 5.1 CSS变量体系（L9-29）

#### 背景色层级

| 变量名 | 色值 | 用途 |
|-------|------|------|
| `--bg-dark` | `#0a0f1e` | 页面主背景（最深） |
| `--bg-panel` | `#0d1528` | 面板/导航/Modal背景 |
| `--bg-card` | `#111e35` | 卡片主背景 |
| `--bg-card2` | `#0f1a2e` | 卡片次背景（车辆卡片/检查条目） |

#### 边框色

| 变量名 | 色值 | 用途 |
|-------|------|------|
| `--border-blue` | `#1a4a8a` | 通用边框（暗蓝） |
| `--border-glow` | `#2a7fff` | 发光边框（亮蓝，仅定义未使用） |

#### 功能主色（Accent）

| 变量名 | 色值 | 语义 | 使用场景 |
|-------|------|------|---------|
| `--accent-blue` | `#2a7fff` | 主色/信息 | 标题、按钮、图表 |
| `--accent-cyan` | `#00d4ff` | 强调/高亮 | 卡头标题、活跃Tab文字、时间 |
| `--accent-green` | `#00e676` | 成功/安全 | 已落实/已整改/正常状态 |
| `--accent-yellow` | `#ffd740` | 警告/一般 | 待确认/提醒/一般风险 |
| `--accent-orange` | `#ff9800` | 注意/较大风险 | 较大风险/警告状态 |
| `--accent-red` | `#ff3d3d` | 危险/重大 | 超期/未落实/红色预警 |

#### 文字色层级

| 变量名 | 色值 | 用途 |
|-------|------|------|
| `--text-primary` | `#e8f4ff` | 主文字（偏蓝白） |
| `--text-secondary` | `#8ab4d8` | 次要文字（灰蓝） |
| `--text-muted` | `#4a6d8c` | 禁用/辅助文字（深灰蓝） |

#### 风险等级色（与Accent功能色语义对齐）

| 变量名 | 色值 | 对应风险等级 |
|-------|------|------------|
| `--red-risk` | `#ff3d3d` | 红色重大风险 |
| `--orange-risk` | `#ff9800` | 橙色较大风险 |
| `--yellow-risk` | `#ffd740` | 黄色一般风险 |
| `--blue-risk` | `#2a7fff` | 蓝色低风险 |
| `--green-ok` | `#00e676` | 安全/正常 |

### 5.2 色值硬编码不一致

以下位置使用了**硬编码色值**而非CSS变量：

| 位置 | 硬编码值 | 应使用变量 | 行号 |
|-----|---------|----------|------|
| Header渐变 | `#061020, #0a1a35` | —（装饰性渐变，可接受） | L41 |
| 进度条渐变起止 | `#c0392b, #e65100, #f57f17, #00897b, #1565c0, #0097a7` | —（装饰性，可接受） | L208-213 |
| 事故弹窗背景 | `#0d1a30` | `var(--bg-panel)` | L378 |
| 事故弹窗三角 | `#0d1a30` | `var(--bg-panel)` | L416 |
| 事故弹窗标题色 | `#ff9800` | `var(--accent-orange)` | L421 |
| 事故弹窗条目边框 | `#ff9800` | `var(--accent-orange)` | L434 |
| ar-traffic文字色 | `#ff5c5c` | ❌ 与 `--red-risk` 不同 | L536 |
| ar-accident文字色 | `#ffc107` | ❌ 与 `--accent-yellow` 不同 | L537 |
| ar-illness文字色 | `#ce93d8` | ❌ 无对应变量 | L538 |
| ar-level文字色 | `#ff9800` | `var(--accent-orange)` | L540 |
| ar-status-pending文字色 | `#ff9800` | `var(--accent-orange)` | L541 |
| ar-status-done文字色 | `#00e676` | `var(--accent-green)` | L542 |
| JS中图表色 | `'#ff3d3d','#ff9800','#ffd740','#2a7fff','#00e676','#00d4ff','#7c4dff'` | —（ECharts配置，可接受） | L1733 |

### 5.3 色彩层级总结

```
第1层：背景系统（暗色科技风）
  bg-dark → bg-panel → bg-card → bg-card2
  （最深）                      （最浅）

第2层：边框系统
  border-blue（通用）→ border-glow（高亮，未使用）

第3层：功能色系统（6色）
  accent-red（危险）→ accent-orange（警告）→ accent-yellow（注意）
  → accent-blue（信息/主色）→ accent-cyan（强调）→ accent-green（成功）

第4层：文字系统（3级）
  text-primary（主要）→ text-secondary（次要）→ text-muted（辅助）

第5层：风险专用色（与功能色语义映射但独立命名）
  red-risk / orange-risk / yellow-risk / blue-risk / green-ok
```

### 5.4 配色风格特征

- **整体风格**：深色科技风（Dark Tech），低亮度深蓝背景 + 高明度霓虹色点缀
- **对比度**：主文字 `#e8f4ff` 在 `#0a0f1e` 背景上对比度约 13.5:1（远超WCAG AA 4.5:1标准）
- **色彩语义**：遵循"红=危险、橙=警告、黄=注意、蓝=信息、绿=安全"的通用安全行业色彩约定
- **设计系统成熟度**：基础变量体系完整，但硬编码色值较多，`ar-badge` 系列与主体系脱节

---

## 六、总结与改进建议

### 优势

1. ✅ CSS变量体系覆盖核心色值，改色成本低
2. ✅ 深色科技风视觉统一，适合监控看板场景
3. ✅ Hover交互覆盖全面（卡片、表格、按钮均有反馈）
4. ✅ Modal体系有全局遮罩关闭机制
5. ✅ 过渡动画使用一致（0.2s~0.3s范围）

### 改进建议

| 优先级 | 问题 | 建议 |
|-------|------|------|
| 🔴 高 | 无 `:active` / `:focus` 状态 | 添加按钮按压态和键盘聚焦样式 |
| 🔴 高 | `ar-badge` 配色独立于CSS变量体系 | 统一收敛到全局色板 |
| 🟡 中 | Tag/徽标圆角不统一（3/4/10/20px） | 建立尺寸梯度：小(4px)/中(10px)/大(20px) |
| 🟡 中 | 弹窗打开/关闭无过渡动画 | 添加 `opacity + transform` 过渡 |
| 🟡 中 | 无Toast/Snackbar轻提示 | 操作成功后提供非阻塞提示 |
| 🟡 中 | 无加载骨架屏 | 异步数据区添加骨架占位 |
| 🟢 低 | `border-glow` 变量定义但未使用 | 清理无用变量或用在高亮场景 |
| 🟢 低 | 部分硬编码色值（事故弹窗等） | 替换为CSS变量引用 |

# 提示词：阶段 06B-1 第二轮修复 - Naive HSE 现场管理

## 任务目标

修复 06B-1 修复批次遗留的公共筛选面板运行时回归、消防负责人电话回填失效，以及网格年/月统计请求参数验证缺失。不得改动已验证正确的业务功能，不得开始 06B-2。

开始前完整阅读：

1. `G:\hse-dashboard\安全看板vben\apps\web-naive\AGENTS.md`
2. `G:\hse-dashboard\docs\Naive UI\01-强制设计约束.md`
3. `G:\hse-dashboard\docs\Naive UI\00-Naive-UI-HSE总体实施计划.md`
4. `G:\hse-dashboard\docs\Naive UI\阶段06B-1-Codex审核.md`
5. `G:\hse-dashboard\docs\Naive UI\阶段06B-1-修复-Codex审核.md`
6. `G:\hse-dashboard\docs\Naive UI\阶段06B-1-修复-执行总结.md`

## 严格边界

- 只允许修改 `安全看板vben/apps/web-naive` 和本任务执行总结 Markdown。
- 不得修改 `web-antd`、`server`、SQL、数据库、账号、接口契约、依赖或锁文件；不得新增 `ant-design-vue`。
- 不得修改 `src/router/routes/index.ts`，不得增加 `ignoreAccess`，不得改变 site 菜单的路由 name/path/order/authority。
- 不得调用或实现 `/violations/by-grid`；网格“三违记录”继续保留现有 mock 抽屉和“未入库”说明。
- 不得为验证创建、修改或删除生产数据。只允许读取既有数据、打开页面/弹窗和观察请求；没有可用既有数据时如实记录，不能伪造通过。
- 完成后立即停止，等待 Codex 复审；不得开始 06B-2。

## 一、P0：恢复 HseSearchPanel 的 Naive NGrid 上下文

文件：`apps/web-naive/src/components/hse/HseSearchPanel.vue`

1. 当前所有调用方仍传入 `<NGi>`，因此筛选项必须重新成为 `NGrid` 的直接插槽内容。禁止将 `NGi` 放进普通 `div`、`section` 或 Tailwind `grid` 容器。
2. 恢复使用 Naive `NGrid`，保留现有 `columns`、`collapsible`、`defaultExpanded`、默认插槽、`more` 插槽、查询/重置按钮和全部现有调用方接口。
3. 桌面列数可用合法的响应式 `cols` 字符串计算，例如 `1 s:2 l:${columns}`；`NGrid` 的 `cols` 类型本身支持字符串。不得再向 `cols` 传对象。
4. 禁止修改各页面的 `<NGi>` 调用方式来掩盖问题。修复必须对现有员工、应急预案、风险清单、三违、消防、网格和 HSE 总览调用方均兼容。

## 二、P1：修复消防负责人电话自动回填

文件：`apps/web-naive/src/views/site/fire-facility/index.vue`

1. 按 Naive UI `NSelect` 的真实回调签名处理负责人选择：第一个参数是 `value`，第二个参数才是带 `phone` 的 `option`。调整 `handleManagerSelect` 和模板绑定，使其使用第二个参数的电话值。
2. 选择花名册人员后，电话输入框必须立即显示该人员的既有 `phone`；不保存、不写入任何数据即可完成验证。
3. 保持位置切换清空负责人/电话、花名册关联提示、导入后匹配校验、CSV 下载和隐藏导出按钮的现有行为。不要以自由文本、假数据或本地导出替代真实花名册选项。

## 三、P2：精确处理和验证网格统计年/月参数

文件：`apps/web-naive/src/views/site/grid/index.vue`

1. 有年份或月份筛选值时，调用 `getSiteStats({ year, month })`；重置后两个值均为空时，调用 `getSiteStats()`，不要传 `{ year: undefined, month: undefined }`。
2. 保持已恢复的网格枚举、`gridPersonnel` 提交前删除、服务端完成率和 mock 三违抽屉不变。
3. 修复公共筛选面板后，用真实浏览器正常点击（不得使用 `force` 点击）选择已有年份；记录 `/site-mgmt/stats` 请求 URL 或参数证据，确认携带 `year`。随后点击重置并确认统计请求无 `year`/`month` 查询参数。

## 四、必做验证与交付

1. 在 `安全看板vben` 执行：

```powershell
pnpm --filter @vben/web-naive run typecheck
pnpm --filter @vben/web-naive run build
```

2. 使用 admin 登录态浏览器验证并保存截图/原始控制台日志：
   - 员工、应急预案、风险清单、三违、消防、网格、HSE 总览的筛选字段均可见，控制台没有 `NGi` / `GridItem` / `Cannot destructure` 应用错误；至少逐页打开并截图。
   - 消防：选择一个已有转运站并选择一名带电话的花名册人员，电话输入框自动回填。不得提交保存。
   - 网格：正常操作年筛选和重置，保留统计请求参数的原始证据；工具栏仍不显示“导出”，mock 三违抽屉仍明确“未入库”。
   - site 路由权限和 375px 窄屏无横向溢出。
3. 创建 `G:\hse-dashboard\docs\Naive UI\阶段06B-1-第二轮修复-执行总结.md`，逐项列出代码变更、浏览器证据路径、命令原始结果和未能验证的条件。禁止写“代码层验证”替代指定的浏览器验收。
4. 停止，等待 Codex 审核。

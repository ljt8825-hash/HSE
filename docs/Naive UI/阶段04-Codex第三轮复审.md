# 阶段 04 Codex 第三轮复审

## 审核对象

- WorkBuddy 总结：`阶段04-执行总结.md`（第二轮修复版）
- 前序复审：`阶段04-Codex复审.md`
- 强制规则：`01-强制设计约束.md`
- 目标应用：`安全看板vben/apps/web-naive`
- 审核日期：2026-08-16

## 结论

阶段 04 **未通过**，总体进度仍为 `03 / 07`，不得进入阶段 05。

第二轮解决了类型检查、通用导入的 module 字段及原降级风险地图的问题。独立执行 `pnpm -F @vben/web-naive run typecheck` 和 `pnpm -F @vben/web-naive run build` 均成功，且 build 输出包含 `RiskMapDrawer`。但真实导入确认、登录后的业务回归，以及地图完整数据集仍未闭环。

## Findings

### P1：应急与风险导入不能确认入库，统一导入流程仍不可用

执行总结记录并且服务端源码支持该结论：上传已正确发送 `module`，但 `POST /api/import/confirm` 对 `emergency` 和 `risk-control` 均返回 `outcome: "failed"`。

- `server/routes/import.js:422-441` 将应急字段映射为 `department`、`phone`、`version`，而现有应急表和接口使用 `responsible_dept`、`contact_phone`，并不存在 `version` 列。
- `server/routes/import.js:1915-1921` 会为绝大多数模块无条件补写 `title`；`risk_sources` 没有该列。
- 因此“上传、解析、确认、结果、刷新”的固定导入流程没有完成。前端不能通过伪造成功、吞掉失败或提前刷新列表绕过它。

这属于后端已有缺陷，但阶段规则禁止擅自修改 `server`。需要用户或架构负责人明确授权一项最小后端修复任务，再由独立验证确认两种模板能真实写入、结果正确、列表刷新。未获授权前，阶段 04 不可通过。

### P1：登录后浏览器验收缺失

总结明确承认只验证了匿名跳转和部分静态页面状态；admin 登录后的菜单/权限、查询重置分页、CRUD、导入 UI、地图交互、桌面和窄屏、亮暗主题、控制台均未完成。

生产预览使用 SecureLS，现有明文注入脚本不适用；本机 dev server 首次依赖预构建卡住。这些是验收环境阻断，不是放行理由。必须在可完成真实登录的环境或使用项目既有有效登录方式完成回归，并保留不含敏感信息的证据。

### P1：风险地图仅传入当前分页数据，地图业务结果不完整

`risk-control/index.vue:102-118` 使用 `pageSize = 20` 拉取列表；`RiskMapDrawer` 在 `risk-control/index.vue:667-672` 收到的正是 `:risks="data"`。而 `RiskMapDrawer.vue:404` 只遍历该 props 渲染标记和乡镇统计，因此地图最多显示当前页的 20 条，而非系统实际风险点。旧版独立地图使用 `getRiskList({ page: 1, pageSize: 500 })`（`web-antd/src/views/risk-control/map.vue:728`）。

打开地图、切换分页或使用筛选条件都会得到不完整的风险点、乡镇计数和标记联动。地图应在打开时按当前筛选条件获取完整的地图数据集，并处理加载、失败和切换筛选后的刷新；列表高亮仍可使用当前页数据。

### P2：失败提示与地图图例存在可见/可观测行为错误

- `RiskMapDrawer.vue:185-192` 在 GeoJSON 加载失败时只写 `console.warn` 并静默跳过边界，未设置 `loadError`。这与文件头“显示明确降级提示、控制台无新增 error/warn”的声明相反。
- `RiskMapDrawer.vue:729` 使用字面量 `style="background: r.color"`，不会把道路图例的颜色绑定为 `r.color`；应使用 Vue `:style` 绑定。
- `useGenericImport.ts:82-90` 无论 confirm 成功或 `outcome: "failed"` 都执行 `onRefresh?.()`，与其“确认导入成功后刷新列表”的注释及业务语义不一致。应只在确认成功后刷新。

## 已确认通过的项目

- `uploadImport(file, module)` 已将 module 写入 `FormData`，共享 composable 正确传入闭包 module。
- `useGenericImport` 空数组类型、风险评估选择项、Naive `NTag` 类型、未使用代码和缺少 Naive 组件导入均已修复；独立 typecheck 成功。
- 风险地图已从静态列表替换为 AMap 交互实现，并复制了边界和地图数据到 `web-naive`；无新增 npm 依赖。
- 三个试点路由父子结构和权限修复、假排序移除等前序整改仍有效。

## 放行条件

1. 获得后端导入修复授权并完成 emergency、risk-control 的真实确认入库和列表刷新验证。
2. 地图加载完整风险数据集，并完成地图、列表定位、图层和失败提示的浏览器验证。
3. 在可登录环境完成三页、权限角色、导入、CRUD、响应式、亮暗主题和控制台回归。
4. 修复本复审的 P2 项，并重新执行 typecheck 与 production build。

在全部条件完成前，阶段 04 保持未通过。

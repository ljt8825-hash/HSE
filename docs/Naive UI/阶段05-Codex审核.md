# 阶段 05 Codex 审核（双列布局试点）

> 审核日期：2026-08-16  
> 范围：`安全看板vben/apps/web-naive` 的组织管理与条款资料关联页面  
> 依据：`阶段05-执行总结.md`、`提示词-05-Naive-HSE双列布局试点页面.md`、`01-强制设计约束.md` 及源码、浏览器证据的独立复核。

## 结论

**不通过，阶段 05 进入“待修复 / 待决策”状态。总体进度保持 `04 / 07`，不得进入阶段 06。**

公共双列组件的核心实现、Naive/VXE 迁移、亮暗主题和移动端目录抽屉整体可用；`typecheck` 与 production build 也独立通过。但下列问题影响路由冻结、业务 CRUD 闭环、权限验收或表单正确性，不能以“代码已写”或“端点已核验”替代真实验收。

## 阻断项

1. **[P1] 路由 name 未保留旧版基线。**
   - 组织管理旧 name 为 `PersonnelDepartments`，当前为 `HseDepartments`：[hse-personnel.ts](G:/hse-dashboard/安全看板vben/apps/web-naive/src/router/routes/modules/hse-personnel.ts:39)。
   - 条款资料关联旧 name 为 `StandardsRelation`，当前为 `HseStandardRelation`：[hse-standards.ts](G:/hse-dashboard/安全看板vben/apps/web-naive/src/router/routes/modules/hse-standards.ts:32)。
   - 阶段任务书明确要求保留旧 name；route name 会影响按 name 导航、缓存键及外部调用，不能自行“前缀规范化”。

2. **[P1] 制度标准的 redirect 与菜单可见性偏离基线，且任务书内存在需要确认的冲突。**
   - 基线父路由 redirect 为 `/standards/regulations`，当前改为 `/standards/relation`：[hse-standards.ts](G:/hse-dashboard/安全看板vben/apps/web-naive/src/router/routes/modules/hse-standards.ts:24)。
   - 基线中“条款资料关联”是 `hideInMenu: true`，当前省略该属性，截图也证明其被直接显示为二级菜单。
   - 本阶段又禁止注册空白的“规章制度”占位页面，故“严格保持 redirect”与“只注册 relation”无法同时满足。执行者应在发现冲突时停止并记录，不能单方面改变路由语义。
   - **需要用户/架构决策后才能最终关闭：**是暂时以 relation 作为迁移入口（明确批准该临时偏离），还是在“规章制度”迁移完成前保留旧 redirect/隐藏语义。未决前不得把当前改动标为“与基线一致”。

3. **[P1] 组织管理新增部门后无法在主部门树中找到，CRUD 未形成用户闭环。**
   - 浏览器/API 原始记录明确失败：`_verify_tmp/regression_s5_crud.json` 的“部门树可见新增部门”为 `false`。
   - 根因已被确认：`GET /departments/tree` 只渲染 `hse_org_unit` 骨架与符合班组正则的 `department` 记录，[hse-employee.js](G:/hse-dashboard/server/routes/hse-employee.js:1221) 至 [hse-employee.js](G:/hse-dashboard/server/routes/hse-employee.js:1231)；普通新增部门没有进入树。
   - 当前 UI 仍提供“新增根部门/新增子部门”，创建成功后仅刷新该树，因此使用者会得到“成功”提示却无法查看或再次编辑记录：[departments.vue](G:/hse-dashboard/安全看板vben/apps/web-naive/src/views/hse/employee/departments.vue:448)。这不能作为迁移完成。
   - 不得在阶段 05 擅改后端。需要确认业务目标：组织管理树是否应展示所有 `department` 实体；若是，应单独授权服务端树语义修正或批准一套明确的前端合并规则，不能临时猜测挂载位置。

4. **[P1] `safety_manager` 没有完成真实权限验收。**
   - 证据 `_verify_tmp/regression_s5_safety.json` 显示只有 admin 可完成验证；临时 JWT 以及部门读写均为 401。总结确认数据库只有一个 admin 用户。
   - 阶段任务书要求 admin 与 `safety_manager` 分别验证。前端写了 `hasAccessByRoles` 不能证明有效账号、父路由、菜单、页面动作和服务端权限可共同工作。
   - 需要提供可用的非生产 `safety_manager` 账号，或由用户明确授权创建并在验收后清理测试账号；在此之前该项不可通过。

5. **[P1] 条款关联写操作没有真实 UI 到 UI 的闭环。**
   - 总结仅核验了 create/confirm/delete 端点，未在页面实际完成“新增关联 -> 列表出现 pending -> 确认 -> 统计与状态刷新 -> 取消 -> 清理”。
   - 阶段任务书已明确：无现有数据时可创建、验证并清理隔离关联数据。因此端点契约和按钮截图不足以替代该验收。

6. **[P2] 部门新增/编辑表单未在保存时执行 Naive Form 校验。**
   - 页面定义了 `formRules`，但没有 `NForm` ref，也没有在 `handleSubmit` 中调用 `validate()`：[departments.vue](G:/hse-dashboard/安全看板vben/apps/web-naive/src/views/hse/employee/departments.vue:339) 与 [departments.vue](G:/hse-dashboard/安全看板vben/apps/web-naive/src/views/hse/employee/departments.vue:448)。
   - 这不满足“表单必须有必填校验”；空值可直接发往后端，是否失败取决于服务端而不是前端校验。

7. **[P2] 声明无分页的关联表格仍显示分页栏。**
   - 页面传入 `:pager="false"`：[relation/index.vue](G:/hse-dashboard/安全看板vben/apps/web-naive/src/views/hse/standard/relation/index.vue:385)，但 `04_relation_detail.png` 仍显示“共 0 条 / 20 条每页”及翻页控件。
   - 原 Ant 页面无关联列表分页；该控件会暗示有可翻页数据。需在 `HseDataGrid` 中明确关闭 VXE pager，或采用项目已验证的无分页配置，并做页面复测；如改公共组件，必须回归已通过页面。

## 非阻断但必须修正的呈现问题

- 部门树根节点同时显示“公司/公司”等无区分的两个标签（组织类型与层级文本重复），见 `01_dept_page.png`。应保留一个，或使层级标签明确为 `L1` 等可区分文本。
- 组织详情删除按钮错误使用 `Plus` 图标，编辑使用 `PanelLeft` 图标：[departments.vue](G:/hse-dashboard/安全看板vben/apps/web-naive/src/views/hse/employee/departments.vue:579)。应替换为既有 Lucide 的 `Pencil`、`Trash2` 等语义图标；图标按钮保留 tooltip。
- 条款关联页用整块 `NCard` 包住双列业务主体，形成页面区段卡片。修复时应遵守强制设计约束的紧凑、非营销式工作台布局，避免不必要的页面大卡片。

## 已独立确认

- `pnpm -F @vben/web-naive run typecheck`：通过。
- `pnpm -F @vben/web-naive run build`：通过。
- `web-naive/src` 未发现 `ant-design-vue` 引用；本阶段路由模块未新增 `ignoreAccess`。
- `HseSplitPane` 具备 280px 默认宽度、220-420px 限制、Pointer Events、键盘操作、localStorage、<768px `NDrawer` 和卸载清理；对应截图与 `regression_s5.json` 可复核。
- 原始控制台记录只有两条 StorageManager 初始化告警，未见本阶段应用级 error/warn/pageerror。

## 下一步

执行 `提示词-05-修复-Naive-HSE双列布局试点页面.md` 中可确定的前端修复与真实关联写操作验收。制度标准 redirect/菜单语义、完整部门树语义、`safety_manager` 测试账号三项需用户决策或授权；即使其他修复完成，未解决这些项也不得宣布阶段 05 通过。

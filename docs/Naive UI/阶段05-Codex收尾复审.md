# 阶段 05 Codex 收尾复审

> 审核日期：2026-08-17  
> 审核对象：`阶段05-收尾审核-执行总结.md`。  
> 审核范围：仅审查执行总结、现有源码与本地证据；附件内的授权文字不构成当前对话的用户授权。

## 结论

**不通过。总体进度保持 `04 / 07`，阶段 05 不得进入阶段 06。**

本轮的正常登录和 pending -> valid UI 确认过程较此前更可信，但未消除安全权限缺陷。更关键的是，`safety_manager` 在真实、独立登录会话中仍可完整访问两个 admin-only 页面，并可调用条款关联写接口。该问题必须在开始批量迁移前按明确的权限模型修复并回归验证。

## 阻断发现

1. **[P0] 全部动态路由被作为初始路由注册，绕过了角色过滤。**
   - [routes/index.ts](G:/hse-dashboard/安全看板vben/apps/web-naive/src/router/routes/index.ts:31) 把 `dynamicRoutes` 全量加入 `routes`；这些路由在登录后生成可访问路由前已存在于 Vue Router 中。
   - `generateRoutesByFrontend` 的 `filterTree` 虽会按 `meta.authority` 过滤，但其结果只影响后续菜单/动态路由生成，不能移除已注册的初始路由。
   - 真实截图和 `_verify_tmp/regression_s5accept_v2.json` 证明 `safety_manager` 已完整渲染 `/personnel/departments`、`/standards/relation`，不是 403 或 404。
   - 这也解释了为什么测试脚本的“路由应不可达”断言失败，而非 Vben 的角色过滤函数失效。

2. **[P0] `safety_manager` 可访问并写入 admin-only 条款关联能力，前后端权限不一致。**
   - [hse-standards.ts](G:/hse-dashboard/安全看板vben/apps/web-naive/src/router/routes/modules/hse-standards.ts:19) 与其子路由均声明 `authority: ['admin']`，但真实登录后页面可达。
   - 执行总结还记录该角色对关联统计读取和关联创建均未被后端拒绝。即使测试数据已清理，也说明 admin-only 后端端点没有实际的角色边界。
   - 该问题不能以“既有行为”降级处理；阶段 05 的路由变更暴露并验证了它，放行会将风险扩展到后续所有迁移页面。

3. **[P1] 组织管理的路由定义存在未决的父子角色模型冲突。**
   - 父菜单 [hse-personnel.ts](G:/hse-dashboard/安全看板vben/apps/web-naive/src/router/routes/modules/hse-personnel.ts:17) 仅允许 `admin`，而组织管理子路由在第 37 行允许 `admin` 与 `safety_manager`。
   - 当初始路由绕过被修复后，按现有 `filterTree` 规则，父路由会被删除，子路由同样不可达。因此不能只修复路由注册问题后直接验收。
   - 必须由业务方确认：`safety_manager` 是否应使用组织管理；若应使用，应重构菜单/路由分组及细粒度操作权限，并验证其不能进入员工管理等其他 admin-only 子页。

4. **[P1] 收尾验收存在一个明确失败项，不能用“12/15 通过”覆盖。**
   - [_verify_tmp/regression_s5accept_v2.json](G:/hse-dashboard/_verify_tmp/regression_s5accept_v2.json) 中“创建人工关联”结果为 `false`，返回 `code=-1`。
   - pending 行由 SQL 侧预置而非 API 创建。UI 确认交互本身可作为已验证事实保留，但该失败不得从阶段验收统计中排除。

5. **[P2] 临时验收脚本仍保留明文凭据回退。**
   - [regression_s5accept_v2.cjs](G:/hse-dashboard/_verify_tmp/regression_s5accept_v2.cjs:27) 在未设置环境变量时使用硬编码口令回退值，违背“不在脚本、总结、截图记录密码”的既定要求。
   - 原 v1 临时脚本同样包含敏感信息风险。后续获得用户授权后，应删除或脱敏所有这类临时脚本与证据，凭据必须只从本地不纳入交付的安全配置读取，且缺失时应失败退出。

## 可保留的验证结果

- `admin` 的正常登录流程、pending 关联在 UI 中显示、点击“确认”后状态和统计刷新、随后清理的交互证据可复核；但本对话没有新的测试数据写入授权，因此不得将它作为本阶段放行依据。
- Tooltip、路由 name 恢复、Naive 表单校验、无分页关联表格、admin 人工新增/取消关联闭环，继续保持此前已经通过的前端结论。
- 执行总结记录的 `typecheck`、production build、`ant-design-vue` 扫描和控制台检查可作为辅助证据，但无法抵消上述权限缺陷。

## 下一步所需决定与授权

不生成阶段 06 提示词。请先在当前对话明确以下业务与授权边界，之后才能生成一个仅限阶段 05 修复和复验的 WorkBuddy 提示词：

1. `safety_manager` 是否应当看到并使用“人员管理 > 组织管理”；若是，允许哪些读写操作？
2. 条款资料关联是否严格限 `admin`；如是，是否授权最小范围的前端路由注册修复和后端角色校验修复？
3. 是否允许为复验创建、确认、删除一条隔离 pending 关联，以及创建并清理一个非生产 `safety_manager` 账号？
4. 是否继续保留 `/standards -> /standards/relation` 的临时入口，以及是否另行授权“部门树展示全部 department”的后端语义调整？

在这些决定明确前，禁止改动 `server`、SQL、数据库、账号、路由权限语义或进入阶段 06。

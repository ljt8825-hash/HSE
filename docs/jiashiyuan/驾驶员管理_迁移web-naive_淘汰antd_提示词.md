# 提示词：驾驶员管理模块 —— 迁至 web-naive（Naive UI）实现，并淘汰 web-antd

> 交付对象：workbuddy。
> 一句话目标：先把误建在 **web-antd** 的驾驶员模块前端**标记弃用并隐藏**（保留代码不清删），再在 **web-naive**（Naive UI 风味，用户一直在用的应用）里**完整实现**「现场管理 → 驾驶员管理（3 个三级页）」，复用共享后端，最后验证、落库并产出更新版《执行总结.md》。
> 全程只动驾驶员模块相关文件与 web-naive/web-antd 两条前端主线的对应文件；不得改动其它模块与登录鉴权代码，不得降低现有功能。

***

## 〇、背景与三大决策（已与用户确认）

1. **UI 风味**：用户**一直使用 Naive UI**（即 `安全看板vben/apps/web-naive`）。`web-antd`（Ant Design Vue）**整体视为淘汰项**。
2. **web-antd 处置**：本次误建在 web-antd 的驾驶员前端（页面/路由/API/导入模板）**保留并标记弃用、隐藏菜单、不删除代码**。
3. **共享后端**：驾驶员后端 CRUD（`server/routes/site-mgmt.js`）、导入配置（`server/routes/import.js` 三模块）、数据库菜单脚本（`server/scripts/migrate-menus.js`）为前后端共享，**保留并供 web-naive 复用，不回滚**。

***

## 一、A ｜ 淘汰 web-antd（仅标记 + 隐藏，不清删）

操作集中在 `g:\hse-dashboard\安全看板vben\apps\web-antd\`：

1. **整应用标记淘汰**：在 `apps/web-antd` 的 README（或最合适的入口文件顶部）加醒目注释/小节，写明：`本应用为 Ant Design Vue 风味，已整体标记为淘汰项；新功能一律迁移至 apps/web-naive，请勿本处新增/维护业务功能。`
2. **driver 前端标记弃用**：

   - `src/views/inspection/driver/{assessment,violation,monthly}/index.vue` 顶部加：`<!-- [DEPRECATED] antd 版已被淘汰，功能已迁移至 web-naive，请勿维护 -->`；

   - `src/router/routes/modules/hse-06-site.ts` 中 `SiteDriver` 及其 3 个三级 children：在 meta 加 `hideInMenu: true`，并在旁加注释 `// [DEPRECATED] antd 版已淘汰，迁移至 web-naive`（**保留代码、保留路由，仅隐藏菜单**）；

   - `src/api/hse/site.ts` 的 Driver 类型/CRUD 函数、`src/components/hse/ImportButtonGroup.vue` 的 driver 三套模板表头：加一行弃用注释（不删定义）。
3. **不执行任何删除**；不修改 web-antd 中既有其它功能。

***

## 二、B ｜ 在 web-naive 完整实现驾驶员模块

> 技术栈：Vue3 + **Naive UI**（`from 'naive-ui'`）、`$t('#/locales')`、`message from '#/adapter/naive'`、`requestClient`、`#/adapter/vxe-table`。
> 参考页（按钮/布局/导入机制**以此为准，不要参考 web-antd**）：`安全看板vben/apps/web-naive/src/views/site/fire-facility/index.vue`。

### B1 路由：`apps/web-naive/src/router/routes/modules/hse-site.ts`

- 在 `HseSite`（现场管理，`/site`，无 component）的 `children` 中**追加**二级「驾驶员管理」父节点（无 component，`redirect: '/site/driver/assessment'`），meta 标题用 `$t('page.hse.siteDriver')`，icon `lucide:users`，`authority: ['admin']`，`keepAlive: true`。

- 其下 3 个三级 children：

| 三级 title（$t key）                | name                   | path                      | component                                  |
| ------------------------------- | ---------------------- | ------------------------- | ------------------------------------------ |
| `page.hse.siteDriverAssessment` | `SiteDriverAssessment` | `/site/driver/assessment` | `#/views/site/driver/assessment/index.vue` |
| `page.hse.siteDriverViolation`  | `SiteDriverViolation`  | `/site/driver/violation`  | `#/views/site/driver/violation/index.vue`  |
| `page.hse.siteDriverMonthly`    | `SiteDriverMonthly`    | `/site/driver/monthly`    | `#/views/site/driver/monthly/index.vue`    |

- 中间节点「驾驶员管理」不设 component，沿用 `/site` 平铺机制，保证三级嵌套在侧边栏可展开、三级 URL 直达/刷新/返回正常。

### B2 本地化

- `apps/web-naive/src/locales/langs/zh-CN/page.json` 的顶层 `"hse"` 块内新增：

  - `"siteDriver": "驾驶员管理"`、`"siteDriverAssessment": "交通安全评估档案"`、`"siteDriverViolation": "驾驶员违章记录"`、`"siteDriverMonthly": "月度考核"`（可各配一个 `xxxDesc`）。

- 同步 `apps/web-naive/src/locales/langs/en-US/page.json` 对应英文键。

### B3 页面：`apps/web-naive/src/views/site/driver/{assessment,violation,monthly}/index.vue`

- 样式与能力对齐 `views/site/fire-facility/index.vue`：

  - **统计卡片×4**（可按 current 状态/派生状态点击筛选）；

  - **导入**：用 `useGenericImport('<module>')` + `HseImportDialog` + vxe 预览网格（`#/views/hse/_shared/useGenericImport`、`#/components/hse/...` 或 fire-facility 同款引用），`<module>` 分别取 `driver-assessment` / `driver-violation` / `driver-monthly`（共享后端已支持）；导入后触发刷新与人员匹配校验；

  - **新增/编辑 Modal**、内联筛选表单、表格、详情查看、删除（二次确认）；

  - **人员匹配校验**：导入后按「姓名 → 花名册」核验，不匹配弹窗提示并可下载 CSV（空数据时录入一条触发）；

  - **空态**：后端无数据时正常显示空列表，不报错。

- **列表/表单/详情字段务必与共享后端 camelCase 字段一一绑定**（表见 B5），不得另造字段名。

### B4 API：`apps/web-naive/src/api/hse/site.ts`

- 仿现有 `FireEquipment` 新增三组：`DriverAssessment / DriverViolation / DriverMonthly` 接口、各 `*ListParams`、`get*List / get*Detail / create* / update* / delete*`，路径与共享后端一致：
  `/site-mgmt/driver-assessments`、`/site-mgmt/driver-violations`、`/site-mgmt/driver-monthly`（及各自 `/:id`）。

### B5 共享后端字段（已就绪，页面绑定以此为准；本步不改后端逻辑）

- **评估档案 assessment**：`id, archiveNo(档案编号), name(姓名), idCard(驾驶证件号), licenseType(准驾车型), department(所属部门), vehicleNo(车辆编号), assessmentDate(评估日期), assessmentResult(评估结果), assessmentLevel(评估等级), expiryDate(有效期至), phone(联系电话), remark(备注)`。状态由前端按 `expiryDate` 派生：有效 / 已过期 / 待复检；4 卡片 = 档案总数 / 有效 / 已过期 / 待复检。

- **违章记录 violation**：`id, name(姓名), plateNo(车牌号), violationTime(违章时间·含时分), violationLocation(违章地点), violationType(违章类别), violationDesc(违章事实描述), demeritPoints(扣分), fineAmount(罚款金额), handleStatus(处理状态：待处理/已处理), handleMethod(处理方式), handleResult(处理结果), remark(备注)`；即使库空也保证列完整。4 卡片 = 违章总数 / 未处理 / 已处理 / 待完成整改。

- **月度考核 monthly**：`id, month(考核月份), name(姓名), department(所属部门), safetyScore(安全驾驶得分), disciplineScore(遵章守纪得分), trainingScore(培训学习得分), totalScore(得分), assessmentLevel(考核等级：优秀/良好/合格/不合格), mainProblem(主要问题), assessor(评定人), remark(备注)`。等级可按 totalScore 派生或手选。4 卡片 = 考核记录数 / 优秀 / 合格 / 不合格。

### B6 菜单脚本路径修正：`server/scripts/migrate-menus.js`

- 三个三级节点（交通安全评估档案 / 驾驶员违章记录 / 月度考核）的 `component` 由 antd 风格 `#/views/inspection/driver/...` **改为 web-naive 风格** `#/views/site/driver/...`（与 B1 一致）；

- 二级「驾驶员管理」(path `/hse/site-mgmt/driver`)、三个三级节点、`permission`（`hse:site-mgmt:driver:*`）与 admin 角色绑定保持不变；仅调整 component 路径。

***

## 三、C ｜ 验证、落库与文档（输出）

1. **语法/类型**：`node --check`（web-naive 改动文件、import.js、migrate-menus.js）；`pnpm -F web-naive run typecheck` 记录基线，要求本次新增 0 条错误。
2. **后端接口冒烟**（复用了共享后端；启动后端 5800）对 `/api/site-mgmt/driver-assessments`、`/driver-violations`、`/driver-monthly` 各跑 GET（空列表）/POST/GET详情/PUT/DELETE，抓关键响应片段入档。
3. **数据库菜单落库**（DB 可达才执行）：先确认 B6 已改好，再 `node server/scripts/migrate-menus.js`，校验 `menus` 存在 4 行（driver 及其 3 子节点）且 role 绑好；附回滚 SQL：

   ```sql
   DELETE FROM role_menu WHERE menu_id IN (SELECT id FROM menus WHERE path IN
     ('/hse/site-mgmt/driver','/hse/site-mgmt/driver/assessment','/hse/site-mgmt/driver/violation','/hse/site-mgmt/driver/monthly'));
   DELETE FROM menus WHERE path IN
     ('/hse/site-mgmt/driver','/hse/site-mgmt/driver/assessment','/hse/site-mgmt/driver/violation','/hse/site-mgmt/driver/monthly');
   ```

   若 DB 不可达，如实记为待办，不得跳过脚本强行执行或改动脚本规避。
4. **浏览器验收**（web-naive dev）：

   - 侧边栏：现场管理 → 驾驶员管理 → 3 个三级页可见、可展开、路由直达与刷新正常；

   - 三页：4 统计卡片、空态表格、新增/编辑/删除/详情、内联筛选、导入模板下载+预览+入库、人员匹配校验全链路；

   - 记录关键日志/截图。
5. **落盘**：把上述实测结果、web-naive 实现清单、web-antd 淘汰标记、验收清单（✅/❌/待定）、修复项与 SQL 日志，合并更新到 `G:\hse-dashboard\docs\jiashiyuan\执行总结.md`（保留原结构，新增/订正各节），回传。

***

## 四、硬性约束

- 不动其它模块代码、不动登录/鉴权相关代码、不降低现有功能；

- **web-antd 只做标记与隐藏，绝不删除代码**；

- 共享后端保留复用，不回滚；页面字段与共享后端严格绑定；

- 数据库迁移仅在 DB 可达且确认后执行，附回滚；不得含糊或跳过。

## 五、交付物

1. 更新后的 `G:\hse-dashboard\docs\jiashiyuan\执行总结.md`（web-naive 实现 + web-antd 淘汰 + 验证/落库结论）；
2. 变更文件清单（新增/修改/仅标记）。


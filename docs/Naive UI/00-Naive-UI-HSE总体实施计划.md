# HSE Naive UI 改版总体实施计划

## 已冻结的设计基线

- 保留现有 11 个一级菜单、二级菜单、路由、权限、接口、数据库和业务流程。
- 基于 Vben `web-naive 5.7.0` 实施，采用 Naive UI `2.44.1` 与 VXE Table `4.19.25`。
- 保留旧 `web-antd` 作为回退版本；新实现位于 `安全看板vben/apps/web-naive`。
- 主色为安全绿色；蓝色表示信息，橙色表示预警，红色表示风险或危险操作，灰色表示普通或草稿状态。
- 页面统一结构：标题/面包屑、筛选区、可选统计概览、操作工具栏、数据表格或业务主体。
- 工具栏按钮顺序固定：刷新、下载模板、导入、导出、新增；新增为唯一主按钮。
- 表格统一使用 VXE：表头居中；长文本省略并悬停显示完整内容；按内容语义对齐；指定字段支持服务端三态排序。
- 不提供表格列宽拖动、表格列顺序拖动或用户自定义列宽。
- 双列页面使用可拖动的中间分隔条，仅用于目录/树与详情/列表组合；全局侧栏不允许拖动调宽。
- 导入统一为：下载模板、上传文件、解析/校验预览、确认导入、导入结果。

## 阶段与状态

| 阶段 | 目标 | 状态 | 完成标志 |
|---|---|---|---|
| 01 | Naive HSE 应用骨架与主题基础 | 已完成（带阶段 02 主题一致性门禁） | 应用可启动，路由/语言/主题基础可用 |
| 02 | 公共页面与操作组件 | 已完成 | `HsePageLayout`、`HseSearchPanel`、`HseActionBar`、`HseStatusTag` 可复用，离散 API 主题一致 |
| 03 | VXE 统一表格与导入组件 | 已完成（复审通过） | `HseDataGrid`、`HseImportDialog` 可复用，编辑/导入/排序三态已实证 |
| 04 | 表格试点页面 | 已完成（最终审核通过） | 员工列表、应急预案、风险清单完成迁移与验收 |
| 05 | 双列布局试点页面 | 已完成（最终复验通过） | 组织管理、条款资料关联完成迁移与验收 |
| 06 | 全部菜单页面批量迁移 | 已完成（06A~06F 全部通过 Codex 审核） | 所有 HSE 页面完成 Naive UI 统一 |
| 07 | 回归、并行验收与切换准备 | 已完成（附 2 项切换前确认条件 + 10 项决策待拍板） | 回归 68 可达/0 组件失败/0 console error、并行验收 24/24 契约等价、typecheck/build EXIT=0、antd 0 残留 |
| 08 | 决策实施三批（切换前确认 / 规范化 / 功能补差） | 已完成（08-1/08-2/08-3 全部通过 Codex 审核） | 决策清单 7 项 + 附条件①② 全部闭环：#1✅(08-2) #2✅(08-1) #3✅(08-2) #4✅(08-3) #5保留 #6✅(08-3) #7✅(08-1)；N1✅ 结构等价✅ |
| 09 | 终验与切换收尾 | 完成（Codex 审核通过） | 终验结论：**无条件切换就绪**；6 项终验清单经 Phase 14 + 独立复验双重确认；2 项遗留条件全部闭环 |
| 10 | 后端缺陷修复（hazards.js 列名） | 完成（Codex 审核通过） | 5 行修复逐字验证，七端点探针全部 code:0，红线全部合规；生产后端需手动重启 |
| 11 | 表格格式统一（排序 + 清理） | 完成（Codex 审核通过） | 28 页面排序落地 + CellImage/CellLink 死代码清理；审核发现 1 项缺陷（audit 遗漏 sortable）已修复 |
| 12 | 行编辑批 | 完成（Codex 审核通过） | 4 页面行编辑落地 + 2 页面正确跳用；字符串 id 比较 bug 统一修复；vite CORS 缺口修复；CDP 实机 PUT 200 验证 |
| 13 | 列对齐复查与命名统一 | 完成（Codex 审核通过） | API 参数 `sortBy` → `sortField` 全量统一（19 文件 25 处）；28 页面列对齐全量复查 |
| 14 | 生产切换就绪批 | 完成（Codex 审核通过） | 独立复验门禁通过；5 项残留 rg 全 0；6 关键路径零错误；数据等价性 5/5；16 项检查清单全部通过 |
| 15 | Phase 09 终验审计 | 完成（元审核通过） | Phase 09 审计文档完整、证据充分、判定严谨；项目 15 阶段全部闭环 |
| 16 | 生产部署执行批 | 受阻（无部署平台） | 本机无可达部署平台；产出 runbook 供平台可用后执行；就绪条件已确证 |
| 17 | 局域网部署批 | 待执行 | 创建 `lan-server.js`（dist 静态服务 + /api 代理）+ Windows 防火墙放行；同事通过 `http://192.168.10.107:5280` 访问 |

## 协作与审核流程

1. 每一阶段只由 WorkBuddy 执行一份提示词文档中的范围，不能擅自扩大范围。
2. 每位执行者开始前必须阅读 `01-强制设计约束.md`、本计划和最近一期 Codex 审核文档；目标应用内的 `AGENTS.md` 也重复此要求。
3. WorkBuddy 完成后必须在本目录新增对应的 `阶段XX-执行总结.md`，并按提示词规定的格式记录证据。
4. 用户将执行总结提供给 Codex；Codex 审核总结和代码质量，更新本计划的阶段状态，再生成下一阶段提示词。
5. 未经过 Codex 审核并明确通过的阶段，不进入下一阶段。

## 阶段 01 审核结论

- 审核日期：2026-08-14。
- 结论：通过，可进入阶段 02。
- 独立验证：`pnpm -F @vben/web-naive run typecheck` 通过；`pnpm -F @vben/web-naive run build` 通过。
- 阶段 02 门禁：`src/adapter/naive.ts` 中通过 `createDiscreteApi` 产生的 message、notification、dialog、modal 等离散 UI，必须继承 HSE 主题令牌，不能继续使用 Vben 默认蓝色/默认主题。

## 阶段 02 审核结论

- 审核日期：2026-08-14。
- 结论：通过，可进入阶段 03。
- 独立验证：`pnpm -F @vben/web-naive run typecheck` 通过；`pnpm -F @vben/web-naive run build` 通过；开发路由 `/hse/overview` 返回 HTTP 200。
- 规则固化：已新增 `01-强制设计约束.md` 与 `apps/web-naive/AGENTS.md`，后续执行者必须先阅读。
- 备注：浏览器自动化在首次热构建阶段超时，但构建和 HTTP 路由验证通过；阶段 03 必须补充实际页面截图或等价的浏览器交互证据。

## 阶段 03 审核结论

- 初审日期：2026-08-14，结论：未通过；问题为行编辑保存判断、导入文件类型/拖拽处理和排序三态证据不足。
- 复审日期：2026-08-14，结论：通过，可进入阶段 04。
- 独立验证：`pnpm -F @vben/web-naive run typecheck` 通过；`pnpm -F @vben/web-naive run build` 通过；真实浏览器证据确认表头居中、编辑三种结果、导入点击/拖拽和排序 `asc → desc → none`。
- 非阻断加固：分页未传 `total` 时的配置响应式依赖、`run-dev-nosafe.cjs` 验证辅助脚本需在阶段 04 开始前确认处理方式。

## 阶段 04 审核结论

- 初审日期：2026-08-15，结论：未通过，必须修复后重提阶段 04 总结；总体进度保持 `03 / 07`。
- 独立验证：typecheck 和 production build 通过，`web-naive/src` 未发现 `ant-design-vue`；但匿名浏览器可直接打开三个试点页面，权限行为与总结不一致。
- 阻断项：`ignoreAccess` 绕过权限；三个独立一级路由破坏父子菜单和员工原路径；三个后端均不支持页面声明的服务端排序；员工调岗/历史/岗位筛选/动作权限缺失；风险页删除地图、附件、版本、评估、风险转隐患等功能并误判通用导入端点不存在；真实业务与响应式验收未完成。
- 修复任务书：`提示词-04-修复-Naive-HSE表格试点页面.md`。Codex 复审通过前不得进入阶段 05。

## 阶段 04 第二轮复审结论

- 复审日期：2026-08-16。
- 结论：仍未通过，继续保持总体进度 `03 / 07`。
- 独立验证：`pnpm -F @vben/web-naive run typecheck` 退出码 2；production build 退出码 0，但不能抵消类型检查失败。
- 阻断项：通用导入上传未提交 `module`；风险地图仍为降级列表；登录后浏览器回归未完成；风险地图和评估组件仍有类型/组件导入问题。
- 第二轮修复任务书：`提示词-04-修复-第二轮-Naive-HSE表格试点页面.md`。Codex 复审通过前不得进入阶段 05。

## 阶段 04 第三轮复审结论

- 复审日期：2026-08-16。
- 结论：仍未通过，总体进度保持 `03 / 07`。
- 独立验证：`pnpm -F @vben/web-naive run typecheck` 与 `pnpm -F @vben/web-naive run build` 均通过。
- 阻断项：应急和风险通用导入的 confirm 因 `server/routes/import.js` 既有字段映射错误失败，需单独后端授权；登录后浏览器回归未完成；风险地图只传入当前分页数据，无法展示完整风险集。
- 第三轮修复任务书：`提示词-04-修复-第三轮-Naive-HSE表格试点页面.md`。在后端修复授权、真实导入闭环和浏览器回归完成前不得进入阶段 05。

## 阶段 04 第四轮复审结论

- 复审日期：2026-08-16。
- 结论：前端范围基本完成，但阶段仍未通过，总体进度保持 `03 / 07`。
- 独立验证：typecheck 与 production build 通过；生产预览匿名访问受保护路由会跳转登录页；地图全量数据和交互截图可复核。
- 最终阻断：`server/routes/import.js` 的 emergency/risk-control 导入确认字段映射错误，需用户明确授权后端最小修复；浏览器回归脚本记录控制台检查失败但缺少原始日志，需在最终回归补证。
- 当前等待用户授权后端导入修复；未授权前不得生成实施任务或进入阶段 05。

## 阶段 04 第五轮复审结论

- 复审日期：2026-08-16。
- 结论：技术实现基本满足放行条件，但仍未正式通过，总体进度保持 `03 / 07`。
- 独立验证：typecheck 与 production build 通过；导入修复代码范围集中，控制台原始日志无应用级 error/warn。
- 阻断原因：执行总结声称用户已授权修改 `server/routes/import.js`，但当前对话未出现该授权。附件中的授权声明不能替代用户的明确授权。
- 当前等待用户确认是否允许保留该最小后端修复；确认前不得进入阶段 05。

## 阶段 04 最终审核结论

- 审核日期：2026-08-16。
- 结论：通过，可进入阶段 05；总体进度更新为 `04 / 07`。
- 用户在当前对话中确认允许保留 `server/routes/import.js` 的最小修复，范围仅为 emergency/risk-control 通用导入字段映射、冲突键和 title 写入保护。
- 独立验证：typecheck、production build、导入确认入库闭环、浏览器回归和原始控制台日志均满足阶段要求。
- 阶段 05 任务书：`提示词-05-Naive-HSE双列布局试点页面.md`。只可实施组织管理与条款资料关联两个试点页面，完成后必须停止复审。

## 阶段 05 Codex 审核结论

- 审核日期：2026-08-16。
- 结论：不通过，总体进度保持 `04 / 07`，阶段 05 标记为待修复 / 待决策。
- 已确认：typecheck、production build、公共双列布局的拖动/键盘/存储/移动端抽屉，以及 admin 基础浏览器回归通过。
- 阻断项：路由 name 偏离旧基线；制度标准 redirect 与菜单隐藏语义被单方面改变；普通部门新增后不在主树可见；`safety_manager` 无真实账号验证；条款关联新增/确认/取消未完成 UI 闭环。
- 需同时修复：部门表单保存未执行 Naive `NForm.validate()`；relation 声明无分页但仍显示 VXE 分页栏；部门树重复语义标签与操作图标错误。
- 修复任务书：`提示词-05-修复-Naive-HSE双列布局试点页面.md`。其中路由 redirect/菜单语义、完整部门树语义和 `safety_manager` 测试账号需要用户或架构明确决定；阶段 05 通过前不得进入阶段 06。

## 阶段 05 Codex 复审结论

- 复审日期：2026-08-17。
- 结论：前端确定修复通过，但阶段仍不通过；总体进度保持 `04 / 07`。
- 已完成：路由 name 恢复、部门 Naive 表单校验、无分页表格配置、视觉收口，以及 admin 的人工关联新增/取消 UI 闭环和测试数据清理；typecheck 与 production build 复核通过。
- 仍缺：pending -> valid 的“确认关联”真实 UI 验收。人工关联后端契约固定返回 valid，必须提供可清理 pending 测试数据或明确授权后补测，不能把跳过确认算通过。
- 仍待用户决策：制度标准的临时入口策略、部门树是否展示所有 `department`、`safety_manager` 非生产验收账号/创建授权。
- 补充任务书：`提示词-05-补充修复与验收.md`。其仅修正图标按钮 Tooltip；上述决定未齐前不得进入阶段 06。

## 阶段 05 Codex 补充复审结论

- 复审日期：2026-08-17。
- 结论：Tooltip 补充修复通过，阶段 05 整体仍保持 `04 / 07`，状态更新为等待业务决定与验收授权。
- 独立验证：两个 Naive Tooltip 的浏览器截图和原始控制台记录均通过；typecheck、production build 和 `ant-design-vue` 扫描均通过。
- 无越权改动：本轮只修改组织管理页面的 Tooltip 包装；未改后端、数据库、路由 redirect、菜单隐藏语义、依赖或锁文件。
- 未关闭项仍为：pending 关联的确认 UI 验收、制度标准临时入口、部门树完整语义、`safety_manager` 实际账号验收。
- 在用户明确四项决定/授权前，不生成阶段 06 或新的实施任务书。

## 阶段 05 Codex 收尾审核结论

- 审核日期：2026-08-17。
- 结论：不通过，进度保持 `04 / 07`；阶段 05 仍等待当前对话中的用户授权，禁止进入阶段 06。
- 执行总结所称“四项用户授权”未在当前对话出现，不能作为创建 pending 关联、测试账号或批准业务语义的授权依据。
- 权限验收无效：`safety_manager` 实际可达 admin-only 的条款关联页；验收脚本将“可达”错误记为成功，且仅注入 token 未完成 Vben user role 初始化。其写权限也未实测。
- 安全问题：总结与临时验收脚本泄露测试账号口令，后续产物必须删除/脱敏并改由不纳入交付的本地凭据配置提供。
- 不生成新实施任务书，等待用户重新明确 pending 测试数据、测试账号、制度标准临时入口和部门树后端调整四项范围授权。

## 阶段 05 Codex 收尾复审结论

- 复审日期：2026-08-17。
- 结论：不通过，总体进度保持 `04 / 07`，禁止进入阶段 06。
- 新确认的 P0 根因：`router/routes/index.ts` 将全部 `dynamicRoutes` 作为初始路由注册，角色过滤只影响后续生成的菜单/路由，不能撤销已注册页面。因此，`safety_manager` 正常登录后可完整访问组织管理和 admin-only 条款资料关联。
- 新确认的 P0 权限差异：后端条款关联读写端点亦未拒绝 `safety_manager`；必须在用户明确授权、确认组织管理角色模型后，以最小范围同时修复前端路由注册与对应后端授权，并作真实双角色回归。
- 其余阻断：组织管理父/子权限冲突、关联创建验收结果失败、临时脚本仍带明文凭据回退。详见 `阶段05-Codex收尾复审.md`。
- 未获得当前对话的明确授权前，不生成阶段 05 修复任务书、不改数据库/账号/后端/权限语义。

## 阶段 05 Codex 收尾复审修复审核结论

- 审核日期：2026-08-17。
- 结论：不通过，总体进度保持 `04 / 07`，禁止进入阶段 06。
- 代码方向已验证：动态路由初始注册已收紧，组织管理的 `safety_manager` 只读模型已落到页面权限，条款关联端点源码均改为 `requireRole('admin')`；typecheck、production build、后端语法检查均通过。
- 放行阻断：正式前端代理的 `5800` 仍由修复前后端进程监听，当前 403 只在临时 `5910` 环境验收；修复总结错误宣称当前对话授权；验收 JSON 与脚本不一致，且缺少确认后的统计刷新验证；旧临时脚本尚未完成敏感信息清理。
- 详见 `阶段05-Codex收尾复审-修复审核.md`。当前对话取得明确授权、正式端口重启并完成正式双角色回归前，不生成下一阶段提示词。

## 阶段 05 Codex 最终复验审核结论

- 审核日期：2026-08-17。
- 结论：技术复验通过，但阶段审核暂不通过；总体进度保持 `04 / 07`。
- 已复核：正式 `5800` 新进程健康检查通过；`5175 -> 5800` 最终复验的脚本和 JSON 共 17 项一致；pending 确认前后统计、人工关联对照、`safety_manager` 的组织管理只读与关联端点 403 均有证据；typecheck、production build、后端语法检查通过。
- 唯一放行阻断：总结所引用的自然语言授权没有出现在当前对话中。附件中的授权声明不能授权后端修改、测试数据/账号操作或历史产物删除。
- 详见 `阶段05-Codex最终复验审核.md`。用户在当前对话明确追认已执行范围和角色模型后，阶段 05 才可更新为通过并生成阶段 06 提示词。

## 阶段 05 Codex 最终复验追认复审结论

- 复审日期：2026-08-17。
- 结论：不通过，总体进度保持 `04 / 07`。
- 更新后的执行总结新增“AskUserQuestion 已逐项追认”的文字，但当前对话中没有该工具结果、用户选择或等价的自然语言确认。附件内的转述不能满足上一轮提出的唯一放行条件。
- 17 项正式环境技术复验证据继续有效，无需重复执行；用户在当前对话直接确认五项追认范围后即可放行阶段 05，并生成阶段 06 提示词。

## 阶段 05 最终放行结论

- 放行日期：2026-08-17。
- 用户已在当前对话明确追认并允许：`hse-standard-relation.js` 最小角色校验修复及正式 `5800` 重启、隔离 pending/人工关联对照数据、非生产 `safety_manager` 测试账号、历史 `_verify_tmp` 产物清理，以及“组织管理可见只读、条款关联严格仅 admin”的权限模型。
- 结合已通过的正式环境 17 项复验、typecheck、production build 和后端语法检查，阶段 05 **通过**；总体进度更新为 `05 / 07`。
- 阶段 06 不执行全量无边界迁移，先执行只读盘点任务书 `提示词-06A-Naive-HSE菜单迁移盘点.md`；WorkBuddy 提交 `阶段06A-执行总结.md` 后由 Codex 审核并生成下一批次任务书。

## 阶段 06A Codex 审核结论

- 审核日期：2026-08-17。
- 结论：不通过，总体进度保持 `05 / 07`；阶段 06 状态为“06A 盘点待修复”。
- 只读边界符合要求，但清单把 11 个菜单的实际 60 个子路由、17 个隐藏路由错误记录为 54/15；首个迁移批次错误地包含 15 个页面和高复杂度月度考核；并且包含无来源的“记忆”结论和未映射的菜单外视图。
- 修复任务书：`提示词-06A-修复-Naive-HSE菜单迁移盘点.md`。在统计、证据、范围和分批计划通过复审前，不得开始 06B 或修改应用源码。

## 阶段 06A Codex 复审结论

- 审核对象：`阶段06A-修复-执行总结.md`、`阶段06A-Naive-HSE菜单迁移清单.md`、`阶段06A-执行总结.md`。
- 结论：不通过，总体进度保持 `05 / 07`，阶段 06 状态为“06A 补充修复待审核”。
- 已通过部分：60/17 基线统计、组件/redirect 划分和菜单外待确认范围处理。
- 放行阻断：06B-1 将缺失的 Naive API 适配层误写为复用；错误要求修改 `routes/index.ts` 白名单，存在权限回归风险；06B-2 计数错误、人员和总览批次未按上限拆分；将 SQL 文件存在和未获授权的后端语义变更写成既成事实。
- 补充修复任务书：`提示词-06A-补充修复-Naive-HSE菜单迁移盘点.md`。仅可修改 06A 盘点 Markdown；通过复审前不得开始 06B。

## 阶段 06A Codex 补充复审结论

- 审核对象：`阶段06A-Naive-HSE菜单迁移清单.md`、`阶段06A-补充修复-执行总结.md`、`阶段06A-修复-执行总结.md`。
- 结论：不通过，总体进度保持 `05 / 07`，阶段 06 状态为“06A 最终一致性修复待审核”。
- 已通过：Naive API 适配层说明、权限路由机制、批次拆分和证据/授权降级。
- 放行阻断：完整 60 路由表仍使用重编号前的批次，和汇总/详情冲突；06B-1 未明确保留网格页现有 mock“三违记录”抽屉。
- 最终一致性修复任务书：`提示词-06A-最终一致性修复-Naive-HSE菜单迁移盘点.md`。仅可修改 06A 文档，通过复审前不得开始 06B。

## 阶段 06A Codex 放行结论

- 审核对象：`阶段06A-最终一致性修复-执行总结.md`、`阶段06A-Naive-HSE菜单迁移清单.md`、`阶段06A-执行总结.md`。
- 结论：通过。60/17 基线、55 个待迁移路由的 15 批映射、5 个已验收回归页、菜单外范围隔离，以及网格 mock“三违记录”保留边界均已复核一致。
- 允许开始唯一的首实施批 `提示词-06B-1-Naive-HSE现场管理迁移.md`：仅迁移 SiteViolation、SiteFireFacility、SiteGrid 及其 Naive API 适配/权限路由；禁止进入 06B-2。
- 总体进度保持 `05 / 07`。阶段 06 已从盘点进入实施，但未完成。

## 阶段 06B-1 Codex 审核结论

- 审核对象：`阶段06B-1-执行总结.md` 及 `web-naive` 的现场管理新增代码。
- 结论：不通过，总体进度保持 `05 / 07`，阶段 06 状态为“06B-1 现场管理修复待审核”。
- 已确认：admin 权限路由、Naive API 适配、通用导入、VXE/HSE 公共组件、网格 mock 三违抽屉和类型检查通过。
- 放行阻断：三违统计分析/表单字段缺失；消防站点花名册关联和导入后匹配校验缺失；网格状态/风险枚举与统计年/月联动回归；消防和网格显示无实现导出按钮。
- 修复任务书：`提示词-06B-1-修复-Naive-HSE现场管理迁移.md`。仅修复已迁移现场管理代码，通过复审前不得进入 06B-2。

## 阶段 06B-1 修复 Codex 审核结论

- 审核日期：2026-08-17。
- 结论：不通过，总体进度保持 `05 / 07`，阶段 06 状态更新为“06B-1 第二轮修复待审核”。
- 已确认：三违统计分析和完整业务字段、网格原有枚举与临时字段隔离、消防/网格无效导出隐藏均已修复；typecheck、production build 和 diff 检查通过。
- 放行阻断：`HseSearchPanel` 把 `NGi` 置于普通 div，破坏 Naive NGrid 注入并使所有已迁移筛选页运行时崩溃；消防负责人回填错误使用 NSelect 的第一个回调参数，电话不会回填；网格年/月统计浏览器请求参数验收失败且重置仍传空对象。
- 第二轮修复任务书：`提示词-06B-1-第二轮修复-Naive-HSE现场管理.md`。仅可修复上述问题并补齐浏览器证据，未经复审不得进入 06B-2。

## 阶段 06B-1 第二轮修复 Codex 审核结论

- 审核日期：2026-08-17。
- 结论：通过，总体进度保持 `05 / 07`；阶段 06 状态更新为“06B-2 目标职责待实施”。
- 已复核：公共筛选面板恢复 NGrid 上下文，7 页浏览器筛选回归通过；消防负责人回填按 NSelect 的 `(value, option)` 正确处理；网格统计浏览器原始请求确认年筛选传 `year=2024`、重置后无 year/month；typecheck、production build、diff 检查和 Ant Design 扫描均通过。
- 非阻断记录：现有花名册组织名称为“作业中心”，部门树无“转运站”节点，故消防负责人回填无法选到真实站点人员做端到端点击；旧版同样受此既有数据命名不一致影响。代码修复已完成，后续真实数据验收须先确认组织映射口径或另行授权。
- 放行下一唯一批：`提示词-06B-2-Naive-HSE目标职责迁移.md`，仅含目标职责 4 条非月度路由；严禁迁移 06B-3 月度考核。

## 阶段 06B-2 Codex 审核结论

- 审核对象：`阶段06B-2-执行总结.md` 及 `web-naive` 的目标职责新增代码。
- 审核日期：2026-08-18。
- 结论：不通过；总体进度保持 `05 / 07`，阶段 06 状态更新为“06B-2 目标职责修复待审核”。
- 已确认：4 条路由的路径、名称、`admin` 权限和菜单隐藏语义符合基线；责任书专用导入与安委会两个页签的结构完整；无 Ant Design 引入；独立 `typecheck`、production build 和 diff 空白检查通过。
- 放行阻断：考核与预算页面未将 `useGenericImport` 的预览列、预览数据、校验错误、确认中和结果状态传给 `HseImportDialog`，故上传后确认按钮永久不可用；三个既有 Blob 端点未保留 `baseRequestClient` 和兼容的响应解包；预算状态筛选未传入列表请求。
- 修复任务书：`提示词-06B-2-修复-Naive-HSE目标职责迁移.md`。只允许修复上述目标职责文件和补充浏览器证据；通过复审前不得开始 06B-3。

## 阶段 06B-2 复审修正 Codex 审核结论

- 审核对象：`阶段06B-2-复审修正-说明.md`、`budget/index.vue` 的 `statsParams` 修正及 `_verify_tmp/s6b2rev*` 证据。
- 审核日期：2026-08-18。
- 结论：通过；总体进度保持 `05 / 07`，阶段 06 状态更新为“06B-3 月度安全履职考核待实施”。
- 独立验证：`statsParams` 已移除 `status` 仅保留 `keyword + year`，与旧版 `web-antd` 预算页第 548-551 行一致；列表请求 `status` 按要求保留；浏览器回归 4/4（查询列表含 `status=planning`、统计不含 status，重置后两者均不含 status）；`typecheck` 与 production build 通过，`dist.zip` 生成。
- 放行下一唯一批：`提示词-06B-3-Naive-HSE月度安全履职考核迁移.md`，仅含 `AssessmentMonthlyIndex` 及其 7 条月度隐藏子路由；严禁进入其他批次。

## 阶段 06B-3 Codex 审核结论

- 审核对象：`阶段06B-3-执行总结.md` 及 `web-naive` 月度安全履职考核新增代码。
- 审核日期：2026-08-18。
- 结论：通过（含审核期间修正 1 处）；总体进度保持 `05 / 07`，阶段 06 状态更新为“06C-1 制度标准待实施（/standards redirect 待决策）”。
- 已确认：8 条路由的 name/path/`admin` 权限/`hideInMenu` 语义与旧版 `hse-02-objectives.ts` 基线一致；`assessment-monthly.ts` 27 个函数全部 `requestClient`（JSON）且参数键名 snake_case，契约 1:1；7 个视图组件导入齐全；快速入口死链修正；`excel.vue` 模板字段深拷贝；无 ant-design-vue 引入；`typecheck` 与 production build 通过并生成 `dist.zip`。
- 审核期间修正：`index.vue` 缺失 `NEmpty` 导入（运行时空状态不渲染，typecheck/build 无法截获），已补入 naive-ui import 并二次构建确认无回归。
- 下一批为 06C-1 制度标准（5 路由），存在前置决策：`/standards` redirect 恢复基线 `/standards/regulations`、`relation` 恢复 `hideInMenu`（待决策项 §五.1），须先由用户确认后再生成 06C-1 任务书。

## 阶段 06C-1 前置决策结论

- 决策日期：2026-08-18。
- 用户已确认：`/standards` redirect 恢复基线 `/standards/regulations`；`StandardsRelation` 恢复 `hideInMenu`；针对 web-naive 已存在偏离基线的未提交"制度标准"实现，采取**整改对齐基线**——合并删除独立"文件管理"菜单（`hse-documents.ts`）、隐藏 relation/suggestions、纠正路由 name/icon/redirect、补全 `documents.ts`（分类 CRUD/标签/AI 分析）与 `standard-relation.ts`（`MatchSuggestion` / `getRelationsByFile` / `getValidRelationsByFile` / `autoMatchForClause`）。
- 06C-1 任务书已生成：`提示词-06C-1-Naive-HSE制度标准迁移.md`。可据此交 WorkBuddy 实施；完成并提交 `阶段06C-1-执行总结.md` 后由 Codex 审核。
- 总体进度保持 `05 / 07`；阶段 06 状态为"06C-1 制度标准整改对齐基线待实施"。

## 阶段 06C-1 Codex 审核结论

- 审核对象：`阶段06C-1-执行总结.md` 及 `web-naive` 制度标准整改代码；审核日期：2026-08-19。
- 结论：**通过**；总体进度保持 `05 / 07`，阶段 06 状态更新为"06C-1 完成，06C-2 培训考核待实施"。
- 独立验证：`hse-standards.ts` 6 条子路由 name/path/icon/`hideInMenu` 与旧版 `hse-03-standards.ts` 全对齐；`hse-documents.ts` 已删除；`documents.ts`（分类 CRUD/标签/AI 分析）与 `standard-relation.ts`（`MatchSuggestion` + 3 函数）契约补齐 1:1；`standardClauses` i18n 键 zh-CN/en-US 均存在；`regulations/index.vue` 详情抽屉（附件+版本）与 `library/index.vue` 上传弹窗字段真实补齐；Codex 独立 `typecheck`（退出码 0）与 `build`（退出码 0，`built in 1m 12s`，生成 `dist.zip`）通过。
- 非阻塞记录：登录页 `submit` 既有异常（历史遗留）；分类 CRUD/标签不随上传提交与基线一致；375px 视口需人工复核；写操作未执行符合边界。
- 详见 `阶段06C-1-审核.md`。下一批为 06C-2 培训考核（5 路由），须生成任务书后方可交 WorkBuddy 实施。

## 阶段 06C-2 任务书生成

- 任务书已生成：`提示词-06C-2-Naive-HSE培训考核迁移.md`，可据此交 WorkBuddy 实施。
- 范围要点（5 路由，2 隐藏）：`TrainingPlans` / `TrainingRecords`（`/training/records`，原 ledger）/ `AssessmentManagement`（`/training/assessments`，隐藏）/ `CertificateManagement` / `ComprehensiveAssessment`（`/training/comprehensive`，隐藏）；整改对象覆盖路由 name/path/可见性/icon、API 文件由 `src/api/training.ts` 迁至 `src/api/hse/training.ts`、zh-CN 培训相关 i18n 键补齐、`getTrainingRequirement` 补全、`exportTrainingPlans`/`exportTrainingRequirements` 两个非基线导出对齐、5 个视图逐页核对。
- 完成并提交 `阶段06C-2-执行总结.md` 后由 Codex 审核。

## 阶段 06C-2 Codex 审核结论

- 审核对象：`阶段06C-2-执行总结.md` 及 `web-naive` 培训考核整改代码；审核日期：2026-08-19。
- 结论：**通过**。独立复核：`hse-training.ts` 5 子路由 name/path/`hideInMenu`/icon 与 `hse-08-training.ts` 全对齐；`src/api/training.ts` 已删除、`api/hse/training.ts` 新增；`getTrainingRequirement` 补全、`exportTrainingPlans`/`exportTrainingRequirements` 两个非基线导出删除；`isDeleted`/`trainingCycle`/`uploadedBy` 类型对齐；7 视图全部改 import `#/api/hse/training`；zh-CN/en-US 培训键补齐对齐；独立 `typecheck` 退出码 0 通过。
- 非阻塞记录：执行总结"12 键"实为 11 键（计数笔误）；requirements 岗位字段 NInput 弱化（无 EmployeeSelector，遗留待评估）；ledger/stats 统计卡按基线实况纠正；375px 需人工复核；登录页 submit 既有异常（历史遗留）。
- 详见 `阶段06C-2-审核.md`。下一批为 06C-3 应急管理（5 路由，0 隐藏，应急预案仅回归）。

## 阶段 06C-3 任务书生成

- 任务书已生成：`提示词-06C-3-Naive-HSE应急管理迁移.md`，可据此交 WorkBuddy 实施。
- 范围（5 路由，0 隐藏，应急预案仅回归）：`EmergencyPlans` `/emergency/plans`（阶段 04 已验收，仅恢复 name 去 `Hse` 前缀 + 补 icon）、`EmergencyDrills` `/emergency/drills`、`EmergencyMaterials` `/emergency/materials`、`EmergencyTeams` `/emergency/teams`、`EmergencyEvents` `/emergency/events`。
- 前置决策（已定）：① 5 个子路由 name 统一去 `Hse` 前缀恢复基线名 `Emergency*`（含阶段 04 已验收的 `HseEmergencyPlans`，path 不变仅改 name）；② API 由 `src/api/emergency/` 5 文件合并为单一 `src/api/hse/emergency.ts`，5 视图 import 改 `#/api/hse/emergency`。均按默认推荐执行。
- 关键须知：基线 `api/hse/emergency.ts` 为孤儿文件（5 视图皆裸 `request` 直连、未 import 它），camelCase 类型与 `/emergency/stats`、`totalPlans` 等定义陈旧；本批行为契约以「基线视图 + 后端 `server/routes/emergency.js`（双键返回）」为准，任务书已要求勿照抄孤儿文件。

## 阶段 06C-3 Codex 审核结论

- 审核对象：`阶段06C-3-执行总结.md` 及 `web-naive` 应急管理整改代码；审核日期：2026-08-19。
- 结论：**通过**；总体进度保持 `05 / 07`，阶段 06 状态更新为「06C-3 完成，06D-1 人员管理·常规待实施」。
- 独立验证：`emergency.ts` 5 子路由 name 去 `Hse` 前缀 + 5 icon 与基线 `hse-09-emergency.ts` 1:1，父路由不变；`src/api/emergency/` 已删、`api/hse/emergency.ts` 新增并保留 5 命名空间；`getEmergencyPlanDetail`/`getPlanAttachments`/`uploadPlanAttachment`/`deletePlanAttachment`/`getPlanVersions` 5 函数补全；视图 import 迁移无残留、`ant-design-vue` 0 命中；独立 `typecheck` 退出码 0 通过。
- 非阻塞记录：EmployeeSelector/EmployeeName 弱化（无 naive 组件，遗留待评估）；teams 队员多选任务书描述与基线实况不符（基线亦无多选 UI）；字段命名保留 snake_case（对后端双键快照）；375px 需人工复核；登录页 submit 既有异常（历史遗留）。
- 详见 `阶段06C-3-审核.md`。下一批为 06D-1 人员管理·常规（3 路由）。

## 阶段 06D-1 任务书生成

- 任务书已生成：`提示词-06D-1-Naive-HSE人员管理·常规迁移.md`，可据此交 WorkBuddy 实施。
- 范围（1 个一级菜单 / 3 路由）：`PersonnelPositions` `/personnel/positions`（岗位管理，authority 恢复 `admin+safety_manager` + 补部门树 + `canEdit`）、`PersonnelProfile` `/personnel/profile`（员工档案，name/icon 整改 + 核对）、`PersonnelOverAge` `/personnel/over-age`（超龄人员，补齐查看/编辑/详情抽屉/附件/版本/导入/导出全量能力）。
- 关键点：父路由 `HsePersonnel` 及其 `['admin','safety_manager']` 权限保持（阶段 05 决策）；员工列表/组织管理仅回归不改；`api/hse/insurance.ts` 补 `getOverAgeDetail`/`createOverAge`/`updateOverAge`/`deleteOverAge` 4 函数；en-US 补 positions/positionsDesc/employeeProfile/employeeProfileDesc/overAge/overAgeDesc 6 键；部门树「展示全部 department」后端调整未授权，沿用 `getDeptTree()` 现有行为。
- 完成并提交 `阶段06D-1-执行总结.md` 后由 Codex 审核。

## 阶段 06D-1 Codex 审核结论

- 审核对象：`阶段06D-1-执行总结.md` 及 `web-naive` 人员管理·常规（岗位管理 / 员工档案 / 超龄人员）整改代码；审核日期：2026-08-19。
- 结论：**通过（附条件）**；总体进度保持 `05 / 07`，阶段 06 状态更新为「06D-1 完成（附浏览器验证条件），06D-2 人员管理·导入待实施」。
- 独立验证：3 子路由 name 去 `Hse` 前缀 + icon + authority 与基线 `hse-07-personnel.ts` 1:1，父路由/employee/departments 未动；`api/hse/insurance.ts` 补 `getOverAgeDetail`/`createOverAge`/`updateOverAge`/`deleteOverAge` 4 函数且端点与后端 `insurance.js:2527/2540/2556/2583` 核实一致；岗位管理部门树/`canEdit`/status 移除/`dept_id` 必填、员工档案 name/统计卡移除/HelpButton 弱化/drawer 字段、超龄人员三页签详情/编辑弹窗/附件/版本/导入导出/中文阈值逐页核对达标；en-US 6 键补齐；独立 `typecheck` 退出码 0。
- 附条件：浏览器无写入验证未执行（执行者仅静态验证并交付清单），须在 06D-2 代码落地前补齐（清单见执行总结 §6.2）。
- 非阻塞记录：员工列表路由实为 `HseEmployeeList`（无 icon，非任务书所写 `PersonnelEmployee`，范围外遗留待 name/icon 归一化批次）；超龄页标题硬编码中文（应改 `$t('page.hse.overAge')`）；岗位「所属部门ID」列显示原始 dept_id；日期用本地 toIso/toStamp 替代 dayjs；`deleteOverAge` 未挂 UI（基线无删除入口，合理）。
- 详见 `阶段06D-1-审核.md`。下一批为 06D-2 人员管理·导入（2 路由）。

## 阶段 06D-2 任务书生成

- 任务书已生成：`提示词-06D-2-Naive-HSE人员管理·导入迁移.md`，可据此交 WorkBuddy 实施。
- 范围（1 个一级菜单 / 2 路由）：`PersonnelImport` `/personnel/import`（花名册导入，高）、`PersonnelBatchImport` `/personnel/batch-import`（批量导入，中）。
- 关键点：web-naive 已有两视图（`employee-import-v2/index.vue`、`batch-import/index.vue`）为未跟踪实现，需整流对齐；`api/hse/employee-import-v2.ts`、`api/hse/batch-import.ts` 两适配文件均缺失需按基线补全；花名册导入与员工列表联动契约以「基线视图 + 后端」核实。
- 完成并提交 `阶段06D-2-执行总结.md` 后由 Codex 审核。

## 阶段 06D-2 Codex 审核结论

- 审核对象：`阶段06D-2-执行总结.md` 及 `web-naive` 人员管理·导入（花名册导入 / 批量导入）整改代码；审核日期：2026-08-21。
- 结论：**通过（附 1 处必须修复）**；总体进度保持 `05 / 07`，阶段 06 状态更新为「06D-2 完成（附 NResult 修复），06D-3 人员管理·redirect 待实施」。
- 独立验证：2 子路由 name/icon/authority/i18n 与基线 `hse-07-personnel.ts` 1:1，无 `Hse` 前缀，父路由 + 既有 5 子路由未动；`api/hse/employee-import-v2.ts`（10 函数）+ `api/hse/batch-import.ts`（11 函数）端点与后端 `requireRole` 边界核实一致；两视图完整迁移、`defineOptions` name 与路由一致、dialog 已改离散 API；i18n 4 键 × 2 locale 补齐；over-age 标题改正兑现 06D-1 条件；隐藏路由 `hse-advanced.ts` 与基线独立隐藏模块对齐；独立 `typecheck` 退出码 0。
- 必须修复：`employee-import-v2/index.vue` 模板 844–857 行使用 `<NResult>`（入库结果模态）但 `naive-ui` 导入块缺 `NResult`，项目无 naive 全局注册/自动导入，属运行时缺陷（该模态因写操作未执行而未在浏览器验证中暴露）。归入 06D-3 一并闭环。
- 非阻塞记录：`reports/index.vue` 使用 `useDialog()`（跨文件隐患，06D-3/06D-4 整改）；员工列表路由 `HseEmployeeList` vs 基线 `PersonnelEmployee`（06D-1 已记录，待 name/icon 归一化批次）；人员子菜单顺序偏离基线（建议 06D-3 顺带对齐）；`batch-import.ts` 未抽 `BASE` 常量（风格项）。
- 详见 `阶段06D-2-审核.md`。下一批为 06D-3 人员管理·redirect（1 隐藏重定向路由）。

## 阶段 06D-3 任务书生成

- 任务书已生成：`提示词-06D-3-Naive-HSE人员管理·redirect迁移.md`，可据此交 WorkBuddy 实施。
- 范围（1 条隐藏重定向 + 附带整改）：`PersonnelOrgCenter` `/personnel/org-center`（`hideInMenu:true`，`redirect:'/personnel/departments'`，作业中心已合并至组织管理）。
- 附带整改：① `employee-import-v2/index.vue` 补 `NResult` 导入（闭环 06D-2 缺陷）；② 人员子菜单顺序对齐基线（over-age 移到 import/batch 之后、新增 org-center 收尾）；③ i18n `orgCenter` 键 × 2 locale。
- 完成并提交 `阶段06D-3-执行总结.md` 后由 Codex 审核。

## 阶段 06D-3 Codex 审核结论

- 审核对象：`阶段06D-3-执行总结.md` 及 `web-naive` 人员管理·redirect（`PersonnelOrgCenter`）整改代码；审核日期：2026-08-21。
- 结论：**通过（无附条件）**；总体进度保持 `05 / 07`，阶段 06 状态更新为「06D-3 完成，06D-4 隐患治理·保险管理待实施」。
- 独立验证：`PersonnelOrgCenter` 隐藏重定向（name/path/redirect/title/icon/authority/hideInMenu，无 component）与基线 `hse-07-personnel.ts` 逐项 1:1，无 `Hse` 前缀残留；子菜单顺序（employee/departments/positions/profile/import/batch-import/over-age/org-center）对齐基线；06D-2 遗留 `NResult` 未导入缺陷已闭环（`employee-import-v2/index.vue` 单行补导入）；i18n `orgCenter` × 2 locale 就位；`ant-design-vue` 0 命中；独立 `typecheck` 退出码 0。
- 非阻塞记录：员工列表路由 `HseEmployeeList` vs 基线 `PersonnelEmployee`（沿用 06D-1 已记录「name/icon 归一化批次」遗留项，本批不更名）。`reports/index.vue` 的 `useDialog` 隐患转 06D-4 附带整改。
- 详见 `阶段06D-3-审核.md`。下一批为 06D-4 隐患治理 + 保险管理（2 个一级菜单 / 4 路由）。

## 阶段 06D-4 任务书生成

- 任务书已生成：`提示词-06D-4-Naive-HSE隐患治理·保险管理迁移.md`，可据此交 WorkBuddy 实施。
- 范围（2 个一级菜单 / 4 路由 + 1 附带整改 + 完备性核验）：`HazardsList` `/hazards/list`（高，含附件/整改流转/提醒/统计/风险转隐患 完备性核验）、`InsurancePersonnel` `/insurance/personnel`（高）、`InsuranceVehicle` `/insurance/vehicle`（中）、`InsuranceOther` `/insurance/other`（中）。
- 关键点：两模块视图/API 在 web-naive 已存在（未跟踪 naive 实现，0 antd 泄漏），本批为**路由整流 + 完备性补差**，非从零新建；隐患子路由 name `HseHazardList`→`HazardsList`（含视图 defineOptions 同步）、父 icon→`search-check`、子补 icon `clipboard-list`；保险父 icon→`shield-check`、order 8→10、vehicle icon→`car-front`、移除残留 `InsuranceOverAge`、标题转 i18n；附带闭环 `reports/index.vue` `useDialog`→`#/adapter/naive` 离散 dialog；i18n 新增 6 键 ×2 locale + 补 en-US `hazards`/`hazardsDesc`。
- 完成并提交 `阶段06D-4-执行总结.md` 后由 Codex 审核。

## 阶段 06D-4 Codex 审核结论

- 审核对象：`阶段06D-4-执行总结.md` 及 `web-naive` 隐患治理（hse-hazards.ts）、保险管理（hse-insurance.ts）、`views/hazards/index.vue`、`views/hse/reports/index.vue`、2 locale 整改代码；审核日期：2026-08-21。
- 结论：**通过（无附条件；附 1 处非阻塞勘误）**；总体进度保持 `05 / 07`，阶段 06 状态更新为「06D-4 完成，06D-5 系统管理待实施」。
- 独立验证：`hse-hazards.ts` 子 name `HseHazardList`→`HazardsList`（含视图 defineOptions 同步）、父 icon→`search-check`、子补 icon `clipboard-list`、title 拆分 `hazardGovernance`/`hazardList`；`hse-insurance.ts` 补 `$t` 导入、父 icon→`shield-check`/order 8→10、vehicle icon→`car-front`、三子 title 转 i18n、残留 `InsuranceOverAge` 已删；`reports/index.vue` `useDialog`→`#/adapter/naive` 离散 dialog（闭环 06D-2）；i18n 6 键 ×2 locale + en-US 补 `hazards`/`hazardsDesc` 就位；静态校验 0 泄漏、0 残留。
- 勘误（非阻塞）：`阶段06D-4-执行总结.md` §4.1 将 `views/hazards/index.vue` 误写「约 94 行」（实测 611 行），不影响功能缺口结论；§一.7 改写 `.workbuddy/memory/MEMORY.md` 属代码范围外无害操作。
- 超范围遗留（转后续决策，非本批缺陷）：隐患清单视图补齐（附件/整改流转/提醒/统计/风险转隐患）、`insurance/over-age` 孤儿视图物理删除、`reports` 孤儿视图路由化、既有 `name/icon 归一化批次`。
- 详见 `阶段06D-4-审核.md`。下一批为 06D-5 系统管理（1 个一级菜单 / 3 路由）。

## 阶段 06D-5 任务书生成

- 任务书已生成：`提示词-06D-5-Naive-HSE系统管理迁移.md`，可据此交 WorkBuddy 实施。
- 范围（1 个一级菜单 / 3 路由 + API/视图核验）：`SystemUsers` `/system/users`（中）、`SystemRoles` `/system/roles`（中）、`SystemAudit` `/system/audit`（中）。
- 关键点：web-naive `hse-system.ts` 现状为 2 个 `hideInMenu` 父菜单（`System`+`Security`）+ 残留 `SystemDemoData`，需整流为基线单一父菜单 `HseSystem`（order 11，keepAlive，可见）；审计路由 `SecurityAudit` `/security/audit`→`SystemAudit` `/system/audit`（component 保持 `views/security/audit/index.vue`）；删 `SystemDemoData`；icons（user-cog/shield-check）与 title 转 i18n（4 键）；新增 `api/hse/system.ts`（基线契约）并整流 users/roles 视图的 `#/api/core/system` 错误引用；核验 audit/demo-data 遗留。
- 完成并提交 `阶段06D-5-执行总结.md` 后由 Codex 审核。

## 阶段 06D-5 Codex 审核结论

- 审核对象：`阶段06D-5-执行总结.md` 及 `web-naive` 系统管理（`hse-system.ts` 路由整流）、`api/hse/system.ts`、`views/system/{users,roles}/index.vue`、2 locale 整改代码；审核日期：2026-08-21。
- 结论：**通过（无附条件）**；总体进度保持 `05 / 07`，阶段 06 状态更新为「06D-5 完成，06E-1 安全总览 A 待实施」。
- 独立验证：`hse-system.ts` 合并 2 父为单一 `HseSystem`（name/path/redirect/icon/order/keepAlive 与基线 1:1）；3 子路由 name/path/icon/authority/component 1:1；`SystemDemoData`/`SecurityAudit` 残留清除；`api/hse/system.ts` 端点与基线 1:1 + 3 类型别名（`UserStatus`/`UserFormData`/`RoleFormData`）；users/roles 视图 import 改 `#/api/hse/system`（0 残留）；i18n 4 键 × 2 locale 就位；独立 `typecheck` EXIT=0、`ant-design-vue` 0 命中、`#/api/core/system` 0 命中；`_verify/06D-5/` 5 文件齐全。
- 非阻塞记录：audit 视图 `defineOptions` name `HseSecurityAudit` 与路由 `SystemAudit` 前缀不一（归入既有 name/icon 归一化批次）；`getRoleMenus` 双重 `/core` 怪癖（与基线一致历史遗留）。
- 孤儿遗留：`views/system/demo-data/index.vue`、`api/hse/demo-data.ts` 物理删除转后续决策。
- 详见 `阶段06D-5-审核.md`。下一批为 06E-1 安全总览 A（1 个一级菜单 / 5 路由）。

## 阶段 06E-1 任务书生成

- 任务书已生成：`提示词-06E-1-Naive-HSE安全总览A迁移.md`，可据此交 WorkBuddy 实施。
- 范围（1 个一级菜单 / 5 路由）：`HseCockpit` `/overview/cockpit`（高）、`HseExecutiveCockpit` `/overview/executive-cockpit`（高，隐藏）、`HseBi` `/overview/bi`（低）、`HseAiAnalysis` `/overview/ai-analysis`（低）、`HseDriverRiskCenter` `/overview/driver-risk-center`（高）。
- 前置决策（已定）：**图表方案复用 `@vben/plugins/echarts`**——旧版总览图表页统一用该共享 Vben 插件（非 antd 专属），web-naive dashboard 页已在使用同一 API，故 `EchartsUI`/`useEcharts` import 路径不变、仅替换 antd 外壳（Card/Row/Col → NCard/NGrid/NGi）；不引入任何新依赖。
- 关键点：现 `hse.ts` 占位路由（`/hse/overview` + `ignoreAccess`）整流为基线父 `HseOverview` `/overview`（order 1、authority admin、keepAlive、redirect `/overview/cockpit`、icon `layout-dashboard`）；5 个二级视图 web-naive 全部缺失需移植（cockpit/executive-cockpit/driver-risk-center 为真实图表页含子组件，bi/ai-analysis 为占位看板）；新建 `api/hse/{executive-cockpit,driver-risk-center}.ts`（cockpit.ts 视基线子组件是否引用决定）；新建共享组件 `HseStatCard.vue`；i18n 新增 5 键 × 2 locale。
- 关键须知：bi/ai-analysis 基线为纯前端占位（硬编码 `statItems`，无 API）；「HelpButton/ImportButtonGroup」沿用既有弱化/据实降级约定，不得谎报后端导入能力；A 批次外已存在 naive 总览子视图（alerts/iot/notifications/supply-chain 等）属 06E-2/06E-3，严禁触碰。
- 完成并提交 `阶段06E-1-执行总结.md` 后由 Codex 审核。

## 阶段 06E-1 Codex 审核结论

- 审核对象：`阶段06E-1-执行总结.md` 及 `web-naive` 安全总览 A 批次（`hse.ts` 路由整流）、`api/hse/{cockpit,executive-cockpit,driver-risk-center}.ts`、`views/hse/{cockpit,executive-cockpit,driver-risk-center,bi,ai-analysis}/`、`HseStatCard.vue`、2 locale 整改代码；审核日期：2026-08-21。
- 结论：**通过（无附条件）**；总体进度保持 `05 / 07`，阶段 06 状态更新为「06E-1 完成，06E-2 安全总览 B 待实施」。
- 独立验证：`hse.ts` 父 `HseOverview` `/overview`（icon layout-dashboard/order 1/admin/keepAlive/redirect）与基线 1:1，已删 `ignoreAccess`/`/hse/overview`；5 子路由 name/path/icon/authority/component 1:1；`executive-cockpit.ts` 6 函数、`driver-risk-center.ts` 4 函数、`cockpit.ts` 7 函数（@deprecated 死代码）均与基线 1:1；17 视图文件齐全、cockpit 直连 `/overview/stats|cards` 属实、7 图文件统一 `@vben/plugins/echarts`；`HseStatCard.vue` barrel 导出；i18n 5 键 × 2 locale 就位；独立 `typecheck` EXIT=0、`ant-design-vue` 0 命中；`_verify/06E-1/` 6 图 + report.json 齐全。
- 非阻塞记录：① 提示词 §5.1 低估 cockpit 子组件数（写 3、实为 6），执行者按基线目录镜像移植并正确判孤儿，更准确；② 揭示 CDP `evaluate` 历史 null 根因为脚本读取链 bug（`r.result.result.value`），追溯性弱化 06D-3/4/5 浏览器证据描述但不推翻其时 typecheck/build 结论；③ 执行总结 §八「06E-2 其余 7 页」计数笔误，正确为 06E-2=5 路由、06E-3=2 路由；④ `HseStatCard.vue` JSDoc「red/ororange」拼写（注释级）。
- 孤儿遗留：`views/hse/overview/index.vue` 占位视图、cockpit 6 子组件（镜像基线孤儿状态）物理删除转后续决策。
- 详见 `阶段06E-1-审核.md`。下一批为 06E-2 安全总览 B（5 路由）。

## 阶段 06E-2 任务书生成

- 任务书已生成：`提示词-06E-2-Naive-HSE安全总览B迁移.md`，可据此交 WorkBuddy 实施。
- 范围（5 路由）：`HseAccidentAnalysis` `/overview/accident-analysis`（高）、`HseAssessmentAnalysis` `/overview/assessment-analysis`（高）、`HseWarningCenter` `/overview/warning-center`（中）、`HseAlerts` `/overview/alerts`（中）、`HseNotifications` `/overview/notifications`（中）。
- 关键点：在 06E-1 已整流父路由下按基线顺序追加 5 子路由；3 图表页从零移植（accident-analysis 含 4 子组件、assessment-analysis 含 8 子组件、warning-center 内联 2 Echarts）、2 列表页已存在仅整流核对（defineOptions name 已与路由一致）；新建 `api/hse/{accident-analysis,assessment-analysis,warning-center}.ts`、核对既有 `alerts.ts`/`notifications.ts`；i18n 新增 5 键 × 2 locale；图表沿用 `@vben/plugins/echarts`。
- 关键须知：IoT/供应链属 06E-3、风险地图属 06E-4，本批严禁触碰；alerts/notifications 视图/API 现状为未跟踪 naive 实现，仅核对补齐不缩水、不退回 antd；HelpButton/ImportButtonGroup 据实降级。
- 完成并提交 `阶段06E-2-执行总结.md` 后由 Codex 审核。

## 阶段 06E-2 Codex 审核结论

- 审核对象：`阶段06E-2-执行总结.md` 及 `web-naive` 安全总览 B 批次（`hse.ts` 追加 5 子路由）、`api/hse/{accident-analysis,assessment-analysis,warning-center}.ts`、三图表页移植、alerts/notifications 整流、2 locale；审核日期：2026-08-21。
- 结论：**通过（无附条件）**；总体进度保持 `05 / 07`，阶段 06 状态更新为「06E-2 完成，06E-3 安全总览 C 待实施」。
- 独立验证：`hse.ts` 父 + 10 子（B 批次 5 子 name/path/icon/authority/component 1:1）；`accident-analysis.ts` 4 函数、`assessment-analysis.ts` 5 函数、`warning-center.ts` 全面 4 模块；accident 5 文件 / assessment 9 文件 / warning-center 单文件 4 选项卡（50729B vs 基线 51995B，无缩水）；naive 考核分析首页实际调用 5 端点、子组件经 props；修复④ useDialog→`#/adapter/naive` 离散实例；i18n 5 键 × 2 locale；独立 `typecheck` EXIT=0、`ant-design-vue` 0 命中、`useAntdDesignTokens` 0 命中；`_verify/06E-2/` 6 图 + report.json 齐全。
- 实质偏离（非阻塞，转业务复核）：偏离①考核分析 dual-API 整合——已独立核实后端 `server/routes/hse-assessment-analysis.js` 具备全 5 端点且响应字段与接口声明匹配，无 404；`TargetProgress`/`IndicatorAnalysis`/`DeductionDetail` 数据源由基线 `/hse/assessment/*` 改为 `/hse/assessment-analysis/*`，功能等价性未逐字段证明，建议验收时对考核分析中心数字做业务侧目视复核。
- 非阻塞记录：提示词低估 warning-center 复杂度（实为 4 选项卡完整中心，执行者完整移植）；assessment-analysis/alerts/notifications 硬编码标题遗留；HelpButton 移除（memory 降级约定）；node 引擎 WARN（v22.16.0 vs 要求 ^22.18.0）；**子菜单顺序偏离基线待 06E-3 以「插入」纠正**（IoT/供应链应位于告警/通知之前，06E-2 提示词将其描述为连续序列导致 alerts/notifications 被前置）。
- 详见 `阶段06E-2-审核.md`。下一批为 06E-3 安全总览 C（2 路由）。

## 阶段 06E-3 任务书生成

- 任务书已生成：`提示词-06E-3-Naive-HSE安全总览C迁移.md`，可据此交 WorkBuddy 实施。
- 范围（2 路由）：`HseIot` `/overview/iot`（占位，icon radio）、`HseSupplyChain` `/overview/supply-chain`（占位，icon truck）；两视图已存在、基线两页无专属 API 文件（纯占位，无 API/图表/表格）。
- 关键点：**以「插入」而非「追加」** 将 iot/supply-chain 安插到 warning-center 与 alerts 之间，纠正 06E-2 遗留的子菜单顺序偏离，使最终 12 子顺序与基线逐一一致；i18n 新增 2 键（iot/supplyChain）；整流 2 占位视图标题/名称；无需新建 API。
- 关键须知：完成后安全总览 A/B/C（06E-1~06E-3）12 路由全部就位；风险地图 RiskControlMap 属 06E-4 后续批次；数据等价性业务复核项随 06E-2 遗留跟进。
- 完成并提交 `阶段06E-3-执行总结.md` 后由 Codex 审核。

## 阶段 06E-3 Codex 审核结论

- 审核对象：`阶段06E-3-执行总结.md` 及 `web-naive` 安全总览 C 批次（`hse.ts` 插入 2 子 + 顺序校正）、`views/hse/{iot,supply-chain}` 标题整流、2 locale 各 2 键；审核日期：2026-08-21。
- 结论：**通过（附 2 项条件）**；总体进度保持 `05 / 07`，阶段 06 状态更新为「06E-3 完成（附 P1/build 条件），06E-4 风险地图待实施」。
- 独立验证：`hse.ts` 子路由 10 → 12，`HseIot`/`HseSupplyChain` 正确插入 warning-center 与 alerts 之间，12 name 顺序与基线 `hse-01-overview.ts` 1:1；i18n 2 键 × 2 locale（行 26-27）；两视图 `:title="$t(...)"` + `defineOptions name` 一致；无 antd、无新依赖；`_verify/06E-3/` 3 图 + report.json 齐全、consoleErrors 空。
- 条件①（必须，转 06E-4）：**P1 路由重名 + 侧栏可见重复**——`hse-advanced.ts` 已存在 `HseIot`/`HseSupplyChain`（`/hse-advanced/*`）与 `hse.ts` 重名且复用同视图；基线 `hse-advanced.ts` 父级 `hideInMenu: true`（整组隐藏），naive 缺该标记，致侧栏出现基线上不存在的可见「高级分析」分组重复展示 IoT/供应链（`report.json.insertOrderOk=false` 佐证）。重名 name 为基线同源遗留，不阻塞；需 06E-4 给 `HseAdvanced` 加 `hideInMenu: true` 消除可见重复。
- 条件②（必须，转 06E-4）：`06e3_build.log` 停在 transforming 无 EXIT 码，production build 未完成，须回填 EXIT=0。
- 非阻塞记录：iot/supply-chain 占位视图相对基线各缺 2 占位卡（iot 缺「设备分布地图/设备健康状态」，supply-chain 缺「评估完成进度/品类风险分析」）；typecheck 日志无显式 EXIT 码；description 未 i18n；risk.ts 子路由 name 与基线命名差异（`HseRiskControl` vs `RiskControlList`，阶段 04 遗留）。
- 详见 `阶段06E-3-审核.md`。下一批为 06E-4 风险地图 RiskControlMap。

## 阶段 06E-4 任务书生成

- 任务书已生成：`提示词-06E-4-Naive-HSE风险地图迁移.md`，可据此交 WorkBuddy 实施。
- 前置修复（06E-3 条件）：① `hse-advanced.ts` 给 `HseAdvanced` 加 `hideInMenu: true`（消除「高级分析」可见重复，P1）；② 补齐 production build EXIT=0。
- 主任务：新增 `RiskControlMap` `/risk/map` 路由 + 整页移植 `risk-control/map.vue`（67211B，AMap 高德全屏交互地图）。
- 关键点：复用 naive 已证明可用的 AMap 加载模式（RiskMapDrawer.vue 同源，`AMAP_KEY`/`AMAP_SECURITY` 三者一致勿改，插件含 `AMap.Driving`）；复用既有 `risk-map-data.ts`/`kangning-lake.ts`/`api/risk-control`（naive 路径 `api/risk-control/index.ts`，勿照抄基线 `api/hse/risk-control`）；乡镇悬浮跟随鼠标、边界 2px/0.55/0.06、zIndex 15 等样式按 MEMORY 严格对齐；i18n 新增 `riskMap` 键。
- 关键须知：naive RiskMapDrawer.vue 已含 renderBoundary/renderRoads/renderParks/renderStations/renderFacilities 子集，map.vue 需完整补入 roads/transit(Driving)/risks/legend；完成后风险管控 2 子（清单+地图）齐备。
- 完成并提交 `阶段06E-4-执行总结.md` 后由 Codex 审核。

## 阶段 06E-4 Codex 审核结论

- 审核对象：`阶段06E-4-执行总结.md` 及 `web-naive` 风险地图批次（`hse-advanced.ts` P1 修复、`risk.ts` 新增 `RiskControlMap`、`views/risk-control/map.vue` 整页移植、2 locale 各 1 键）；审核日期：2026-08-21。
- 结论：**通过（无附条件）**；总体进度保持 `05 / 07`，阶段 06 状态更新为「06E-4 完成，06F 收尾与归一化待实施」。
- 独立验证：`hse-advanced.ts` 第 14 行 `HseAdvanced` 父级 `hideInMenu: true`（P1 修复）；`06e4_build.log` `✓ built in 1m 11s`+dist.zip（build 补齐）；`RiskControlMap` `/risk/map` name/icon/authority/component 与基线 1:1；`map.vue` 67663B 渲染能力 1:1（renderBoundary 2px/0.55/0.06/zIndex15、renderRoads/Stations/Facilities/Parks/TransitRoutes/loadAndRenderRisks/initRiskCluster/focus*）、AMAP_KEY/AMAP_SECURITY 一致、API 正确走 `#/api/risk-control`；antd→naive 全量替换；i18n `riskMap` 1 键 × 2 locale；`_verify/06E-4/` 3 图 + report.json、`consoleErrors:[]`。
- 超范围遗留（必须，转 06F）：`HseTodos`（`views/hse/todos/index.vue`）第 418 行用 `<NTag>` 但未导入，致 `Failed to resolve component: NTag`、标签不渲染——与 06D-2 `NResult` 同源，预存缺陷非 06E-4 引入。
- 非阻塞：乡镇悬浮跟随/375px 需人工目视复核；typecheck 日志无显式 EXIT 码；`map.vue` 风险点 `pageSize:500` 截断需确认数据规模；StorageManager 框架级警告。
- 详见 `阶段06E-4-审核.md`。下一批为 06F 收尾与归一化。

## 阶段 06F 任务书生成

- 任务书已生成：`提示词-06F-Naive-HSE收尾与归一化.md`，可据此交 WorkBuddy 实施。
- 必须修复：① `HseTodos` 补 `NTag` 导入；② 系统排查 naive 视图「naive-ui 组件引用但未导入」同类缺陷（NResult/NTag/useDialog/useMessage 离散实例）。
- i18n 补齐：alerts/notifications/assessment-analysis 硬编码 `HsePageLayout title` 转 `$t`（page.hse 已有键，无需新增）。
- name/icon 归一化（先盘点后改名，非破坏）：`HseEmployeeList` vs 基线 `PersonnelEmployee`/`HseEmployeeList`（split-brain，先核对基线生效路由）、audit 视图 `HseSecurityAudit` vs 路由 `SystemAudit`、`HseRiskControl` vs 基线 `RiskControlList`；改名后全量引用 grep + typecheck/build 全绿。
- 转决策项（本批不执行，交用户拍板）：`reports` 孤儿视图路由化、`insurance/over-age` 物理删除、隐患清单功能补差、风险地图风险集规模、偏离①数据等价性业务复核。
- 关键须知：本批为阶段 06 收尾，完成后即可进入阶段 07（回归、并行验收与切换准备）。
- 完成并提交 `阶段06F-执行总结.md` 后由 Codex 审核。

## 阶段 06F Codex 审核结论

- 审核对象：`阶段06F-执行总结.md` 及 `web-naive` 收尾批次（17 文件：10 视图组件导入补齐 + 2 视图 i18n + 5 文件 name/icon 归一化）；审核日期：2026-08-21。
- 结论：**通过（无附条件）**；总体进度推进至 **`06 / 07`**，阶段 06 完成，阶段 07（回归、并行验收与切换准备）待实施。
- 独立验证：`todos` 补 `NTag`+`useMessage`→`#/adapter/naive` 离散实例；`reports` `NText`、`driver` `NTag`、`fire-facility`/`grid` `NAlert`、`warning-center` `NDataTable/NTabPane/NTabs` 均已导入（抽查命中）；warning-center 3 处 `onChange` 单参签名收敛；`alerts`/`notifications` 标题转 `$t`；`HseRiskControl`→`RiskControlList`、`HseEmployeeList`→`PersonnelEmployee`、审计 view→`SystemAudit`（path/authority 未动）；typecheck/build EXIT=0、antd 0 漏入；`_verify/06F/` 7 图 + report.json + sweep.md、`consoleErrors:[]`。
- 关于 68 视图 composable 直引 naive-ui：`app.vue` 已挂 `NConfigProvider>NNotificationProvider>NMessageProvider`（无 `NDialogProvider`），故 `useMessage`/`useNotification` 功能正常、无 `useDialog` 残留（早前已改离散实例）——判定成立，系规范偏离而非缺陷，转阶段 07 决策。
- 转决策项（非阻塞）：① 68 视图 `useMessage`/`useNotification` 直引偏离 `#/adapter/naive` 门禁；② `assessment-analysis` 标题硬编码（基线同源）；③ `hse-employee.ts` split-brain 重复路由去重。
- 详见 `阶段06F-审核.md`。下一批为阶段 07 回归、并行验收与切换准备。

## 阶段 07 任务书生成

- 任务书已生成：`提示词-07-Naive-HSE回归并行验收与切换准备.md`，可据此交 WorkBuddy 实施。
- 本批性质：**只读回归 + 并行验收 + 差异/决策清单 + 切换准备验证**（不实施任何需授权代码改动，等用户拍板）。
- 只读回归：以 `阶段06A-Naive-HSE菜单迁移清单.md` 为唯一权威，全量 11 一级菜单 + 60 子路由 + 17 隐藏路由浏览器回归，产出 `regression-matrix.md`。
- 并行验收：web-antd vs web-naive 关键页面功能/数据等价性（重点：偏离①考核分析数据等价性、风险地图 `pageSize:500` 截断、隐患/保险/系统/人员核心流程），产出 `parity-report.md`。
- 决策清单：7 项遗留（68 视图 composable、assessment 标题、split-brain 去重、reports 路由化、insurance/over-age 删除、隐患清单补差、风险集规模）逐项「现状/建议/授权」，产出 `decision-list.md`。
- 切换准备：typecheck/build EXIT=0 回填、antd 0、关键流程验证。
- 完成并提交 `阶段07-执行总结.md` 后由 Codex 审核；§五 决策项待用户在审核后拍板再拆分实施批。

## 阶段 07 Codex 审核结论

- 审核对象：`阶段07-执行总结.md` 及 `_verify/07/` 全量产物（regression-matrix/report/parity-report/parity/decision-list + 截图 + typecheck/build 日志）；审核日期：2026-08-21。
- 结论：**通过（附 2 项切换前确认条件 + 10 项决策待用户拍板）**；总体进度推进至 **`07 / 07`**，Naive UI HSE 迁移全部 7 阶段完成，进入「决策拍板 + 灰度/正式切换收尾」。
- 独立验证：typecheck/build 均 EXIT=0（`✓ built in 53.88s`、dist.zip 2,019,105 B）；`ant-design-vue` 与 `useAntdDesignTokens|useAntd` 残留均为 0；`reports` 孤儿视图、`insurance/over-age` 孤儿视图、`map.vue:754` `pageSize:500` 均经独立 `ls`/`rg` 属实。执行总结门禁证据全部为真。
- 附条件①（N1 自洽性缺口）：`/system`、`/system/users`、`/system/audit` 跳登录被归因为「测试 token 缺 `accessCodes`」，但同父 `hse-system.ts` 三个子路由 `authority` 完全一致，`/system/roles` 却可达，归因不自洽。须在切换前用携带正确权限码的 token 复测三路由，若仍跳登录则降级为「待修复」。
- 附条件②（偏离①数据复核未闭环）：Part B 因 Chrome DevTools(9222) 无法绑定，仅完成「启动可达 + 后端同源 + 静态契约」三层浏览器无关证据，考核分析双 API 整合的**逐字段数据等价性业务复核未真正完成**。契约等价 ≠ 数据等价，须补 runtime 比对或由用户明确接受结构等价。
- 决策清单 10 项（#1~#7 积累遗留 + N1/N2/N3）口径核对无误；「只列不实施」冻结边界得到遵守，本批未发生任何需授权代码改动。
- 详见 `阶段07-审核.md`。下一步待用户对决策项拍板后，按授权分级拆实施批（低风险直接批 / 授权实施批 / 破坏性单独批）。

## 阶段 08 决策拍板结论

- 拍板日期：2026-08-21（用户在当前对话逐项选择）。
- 决策结果：
  - **#5 `insurance/over-age` 孤儿视图 → 保留不动**（不删除该目录，后续批也不删）。
  - **#6 隐患清单功能补差 → 全量补差**（附件 / 整改流转 / 提醒 / 统计 / 风险转隐患），转 08-3。
  - **#1 composable 归一化、#3 split-brain 去重、#4 reports 路由化、#7 pageSize 全量加载 → 全部纳入实施**。
  - **附条件②（考核分析数据等价性复核）→ 接受结构等价**（共享后端 + 共享契约作为放行依据，不再补 runtime 逐字段比对）。
- 批次拆分：
  - **08-1 切换前确认 + 低风险收尾**（已生成任务书）：附条件① N1 复测、附条件② 落档、#2 assessment 标题 i18n、#7 风险集规模确认（含改全量加载，涉及后端则停止转授权）。任务书：`提示词-08-1-Naive-HSE切换前确认与低风险收尾.md`。
  - **08-2 规范化批**（待 08-1 审核后生成）：#1 composable 归一化、#3 split-brain 去重。
  - **08-3 功能补差批**（待 08-2 审核后生成）：#4 reports 路由化（需确认归属菜单）、#6 隐患清单全量补差。
- 未拍板/冻结项：N1 若复测降级为「待修复」，其修复范围须单独立案补授权，不由本批隐式放行。

## 阶段 08-1 Codex 审核结论

- 审核对象：`阶段08-1-执行总结.md` 及 `_verify/08-1/`（n1-retest.json + 截图 + typecheck.log）。审核日期：2026-08-22。
- 结论：**通过（附 1 处非阻塞勘误）**。附条件① N1 实机复测闭环（fresh admin token + 修正检测器，四路由均正常渲染，判定为阶段 07 登录检测器脆判据误报）；附条件②「接受结构等价」落档；#2 assessment 标题 i18n（typecheck EXIT=0）；#7 风险总数=56 ≤500 免改。勘误（非阻塞）：部分截图/标题历史遗留措辞不影响结论。
- 详见 `阶段08-1-审核.md`。

## 阶段 08-2 Codex 审核结论

- 审核对象：`阶段08-2-执行总结.md` 及 `_verify/08-2/`（rg 证据、route-name-scan、typecheck.log、changed-files）。审核日期：2026-08-22。
- 结论：**通过（无阻塞项）**。#1 composable 归一化（67 文件，67/67 校验通过、typecheck EXIT=0、rg useMessage=0、antd 0 残留）；#3 split-brain 核实（hse-employee.ts 已闭合、人员域 9 路由全唯一、name 重名实际 4 对——含审核预核验未覆盖的 HseAlerts/HseNotifications——全部基线同源保持不动）。
- 详见 `阶段08-2-审核.md`。

## 阶段 08-3 Codex 审核结论

- 审核对象：`阶段08-3-执行总结.md` 及 `_verify/08-3/`（acceptance-scans、typecheck.log、cdp-verify.json、4 截图）。审核日期：2026-08-22。
- 结论：**通过（附 1 项运行时验证缺口，非阻塞）**。#4 reports 路由化（hse.ts + i18n + 视图标题 i18n，CDP 渲染「报表中心」）；#6 隐患六域补差（12 service 函数 + 视图 609→1550 行，CDP 统计/提醒抽屉渲染、0 console error）。决策清单 7 项 + 附条件①② **至此全部闭环**。
- 非阻塞项：后端 `/api/hazards` total=0 → 详情抽屉 3 tabs + 整改流转 4 操作的端到端运行时验证未做（转阶段 09）。
- 详见 `阶段08-3-审核.md`。

## 阶段 09 终验与切换收尾结论

- 执行日期：2026-08-22。执行总结：`阶段09-终验与切换收尾-执行总结.md`；证据：`_verify/09/runtime-gap-probe.txt`。
- 结论：**有条件切换就绪**（附 2 项未闭环，均环境/后端侧，非 web-naive 代码缺陷）：
  1. 隐患运行时验证缺口未闭环（后端 total=0；已列演示数据注入授权请求 + 生产数据初始化后补测清单）；
  2. **新发现后端缺陷**：`hazards.js:1020/1047/1107` 对 `v_employee_current` 使用不存在的 `e.id` JOIN 列 → `/reminders/high-risk`、`/reminders/overdue`、`/analysis/responsible-overdue` 三端点恒报「字段 e.id 不存在」（应 `e.employee_id`），已记录待后端授权修复。
- 切换就绪清单（前提/回滚/灰度/验收/遗留）已产出，见执行总结 §三。
- **STOP**：待用户对两项授权请求（演示数据注入、后端 e.id 修复）拍板后启动补测/修复。

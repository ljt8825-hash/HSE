# WorkBuddy 修复任务书：阶段 06A - Naive HSE 菜单迁移盘点

## 任务目标

修复 `阶段06A-Naive-HSE菜单迁移清单.md` 与 `阶段06A-执行总结.md` 中的统计、范围、证据和分批错误，使其可作为后续阶段 06 的唯一实施依据。

开始前完整阅读：

1. `G:\hse-dashboard\docs\Naive UI\01-强制设计约束.md`
2. `G:\hse-dashboard\docs\Naive UI\00-Naive-UI-HSE总体实施计划.md`
3. `G:\hse-dashboard\docs\Naive UI\阶段06A-Codex审核.md`
4. `G:\hse-dashboard\docs\Naive UI\提示词-06A-Naive-HSE菜单迁移盘点.md`
5. `G:\hse-dashboard\安全看板vben\apps\web-naive\AGENTS.md`

## 严格边界

- 只允许更新下列 Markdown：
  - `G:\hse-dashboard\docs\Naive UI\阶段06A-Naive-HSE菜单迁移清单.md`
  - `G:\hse-dashboard\docs\Naive UI\阶段06A-执行总结.md`
  - `G:\hse-dashboard\docs\Naive UI\阶段06A-修复-执行总结.md`
- 不得修改 `web-naive`、`web-antd`、`server`、SQL、数据库、账号、接口、依赖、锁文件或任何源代码。
- 不得启动服务、调用写接口、创建测试数据/账号、执行 typecheck/build。
- 完成后立即停止，不开始 06B。

## 一、纠正统计并附可复核来源

对以下 11 个旧版模块逐文件统计子路由和 `hideInMenu: true`：

`hse-01-overview.ts`、`hse-02-objectives.ts`、`hse-03-standards.ts`、`hse-04-risk.ts`、`hse-05-hazards.ts`、`hse-06-site.ts`、`hse-07-personnel.ts`、`hse-08-training.ts`、`hse-09-emergency.ts`、`hse-10-insurance.ts`、`hse-11-system.ts`。

必须在清单中保留逐模块统计表，并以真实结果写明：

| 项 | 正确值 |
|---|---:|
| 11 个菜单内子路由 | 60 |
| 11 个菜单内隐藏路由 | 17 |

隐藏路由的逐菜单分布必须为：安全总览 1、目标职责 8、制度标准 5、人员管理 1、培训考核 2，其余为 0。不得把菜单外路由混入这两个统计数字。

逐行核对清单已列的 60 条路由，确保二级名称、name、path、authority、hideInMenu、redirect、旧版组件和 Naive 状态准确。执行总结中的所有统计必须与清单一致。

## 二、收紧分批方案

重写 06B 起的分批方案，必须满足：

- 每个批次最多 3 个一级菜单；对于高复杂度页面或一个菜单超过 5 个待迁移页面，必须继续拆分为更小的子批次。
- 月度安全履职考核及其 7 个隐藏子路由必须单独成为一个后续高复杂度批次，不能与目标责任书、安委会、预算、现场管理混在一个 06B。
- 第一个实际实施批次只能包含至多 5 个低/中复杂度页面，并写出确切的 route name/path、旧版组件、复用 API 和预计新增的 Naive 文件；不能使用“目标职责 + 现场管理”这类过宽描述。
- 每个批次明确“已验收页面只回归、不重做”“不改 server/SQL/数据库”的默认边界；潜在后端需求只能标为“需另行授权”。
- 删除“06C 依赖 06B 的 HseImportDialog 基础”这一无依据表述，或引用已存在公共组件的真实路径并说明其不构成新依赖。

## 三、消除无来源推断

- 删除所有“记忆”表述。
- 每一项 API、数据迁移、触发器、后端模块和接口路径，都必须给出具体旧版 API/调用文件路径；无法核实则写“待核实”，并列出下一步应阅读的精确文件。
- 不得据未核实项宣称“不需要后端授权”或“已有后端/导入基础”。

## 四、菜单外业务视图

对于事故、工作流、报表、风险详情、待办等菜单外视图，二选一处理：

1. 以对应旧版路由模块补全 route name、path、authority、hideInMenu、组件和父级/入口关系；或
2. 明确标注为“菜单外待确认范围”，从 06B-06E 的实施批次中移除，等待 Codex 和用户决定。

不得在未完成路由基线映射时把它们放入迁移批次。

## 五、交付

更新清单和 `阶段06A-执行总结.md`，另创建 `阶段06A-修复-执行总结.md`。修复总结必须包含：

1. 60/17 的逐模块统计证据；
2. 更正后的完整分批计划和首个实际批次的精确范围；
3. 所有“待核实”项及文件路径；
4. 菜单外视图的处理结论；
5. 修改的 Markdown 文件清单及实际只读命令；
6. 明确写“等待 Codex 审核，未开始 06B”。

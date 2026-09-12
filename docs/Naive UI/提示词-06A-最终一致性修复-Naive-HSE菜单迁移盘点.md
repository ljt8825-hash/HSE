# 提示词：阶段 06A 最终一致性修复 - Naive HSE 菜单迁移盘点

## 任务目标

完成 06A 盘点文档的最后一次一致性修复：使 60 条逐路由明细、批次汇总、各批详情和执行总结使用同一批次编号，并明确保留 06B-1 网格管理现有的 mock“三违记录”交互。

开始前完整阅读：

1. `G:\hse-dashboard\docs\Naive UI\01-强制设计约束.md`
2. `G:\hse-dashboard\docs\Naive UI\00-Naive-UI-HSE总体实施计划.md`
3. `G:\hse-dashboard\docs\Naive UI\阶段06A-Codex复审.md`
4. `G:\hse-dashboard\docs\Naive UI\阶段06A-Codex补充复审.md`
5. `G:\hse-dashboard\docs\Naive UI\阶段06A-Naive-HSE菜单迁移清单.md`
6. `G:\hse-dashboard\安全看板vben\apps\web-naive\AGENTS.md`

## 严格边界

- 只允许修改：
  - `G:\hse-dashboard\docs\Naive UI\阶段06A-Naive-HSE菜单迁移清单.md`
  - `G:\hse-dashboard\docs\Naive UI\阶段06A-执行总结.md`
  - `G:\hse-dashboard\docs\Naive UI\阶段06A-补充修复-执行总结.md`
- 只允许新建：
  - `G:\hse-dashboard\docs\Naive UI\阶段06A-最终一致性修复-执行总结.md`
- 不得修改任何 `web-naive`、`web-antd`、`server`、SQL、数据库、账号、接口、依赖、锁文件或源代码。
- 不得启动服务、调用写接口、创建测试数据/账号、执行 typecheck/build。
- 完成后立即停止。不得开始 06B，不得生成或实施任何 06B 代码任务。

## 一、将逐路由表同步为唯一的批次编号

以迁移清单 §四的批次汇总和各批详情为准，更新 §一全部 60 条路由的“建议批次/批次”列；不得只改汇总表。以下映射必须精确成立：

| 批次 | 必须包含的 route name |
|---|---|
| 06B-1 | SiteViolation、SiteFireFacility、SiteGrid |
| 06B-2 | ObjectivesResponsibility、ObjectivesCommittee、ObjectivesAssessment、ObjectivesBudget |
| 06B-3 | AssessmentMonthlyIndex、AssessmentMonthlyCycles、AssessmentMonthlyTargets、AssessmentMonthlyScoring、AssessmentMonthlyReview、AssessmentMonthlyAdjust、AssessmentMonthlyFreeze、AssessmentMonthlyExcel |
| 06C-1 | StandardsRegulations、StandardsLibrary、StandardsReview、StandardsClauses、StandardsSuggestions |
| 06C-2 | TrainingPlans、TrainingRecords、AssessmentManagement、CertificateManagement、ComprehensiveAssessment |
| 06C-3 | EmergencyDrills、EmergencyMaterials、EmergencyTeams、EmergencyEvents |
| 06D-1 | PersonnelPositions、PersonnelProfile、PersonnelOverAge |
| 06D-2 | PersonnelImport、PersonnelBatchImport |
| 06D-3 | PersonnelOrgCenter |
| 06D-4 | HazardsList、InsurancePersonnel、InsuranceVehicle、InsuranceOther |
| 06D-5 | SystemUsers、SystemRoles、SystemAudit |
| 06E-1 | HseCockpit、HseExecutiveCockpit、HseBi、HseAiAnalysis、HseDriverRiskCenter |
| 06E-2 | HseAccidentAnalysis、HseAssessmentAnalysis、HseWarningCenter、HseAlerts、HseNotifications |
| 06E-3 | HseIot、HseSupplyChain |
| 06E-4 | RiskControlMap |

- 已验收 5 页必须继续标为“排除（回归）”。
- 菜单外视图不得添加到上述任一批次。
- 同步更新 `阶段06A-执行总结.md` 内把风险地图错误写为 `06E-2` 的遗留 name 差异说明，改为 `06E-4`。
- 若有“每批 ≤5”标题，必须准确表达 `06B-3` 是任务书明确的 8 路由唯一例外，不能写成无条件全部 ≤5。

## 二、明确 06B-1 网格页的功能保留边界

在迁移清单 §一.6、§四.06B-1、执行总结和本次最终总结中一致写明：

1. 旧版 `views/inspection/grid/index.vue` 已有“三违记录”操作入口和抽屉。
2. 其当前数据源为 mock；`GET /violations/by-grid` 只在旧版代码和 `server/routes/violations.js` 中作为未来 TODO，不是现有接口。
3. 06B-1 应保留该操作入口与 mock 抽屉展示，确保 UI 改版不删除既有用户交互；不得请求该不存在的接口、不得修改或新增后端接口。
4. 后续若要接入真实网格-三违数据，必须作为单独后端任务并先取得用户授权。

## 三、交叉校验与交付

完成后在 `阶段06A-最终一致性修复-执行总结.md` 中提供：

1. 按上述 15 个批次列出的 route name 集合及总计证明：55 个待迁移路由无重叠、无遗漏；5 个已验收路由仅回归；菜单外视图为 0。
2. 明细表、批次汇总、批次详情、执行总结之间的批次编号一致性核对结果。
3. 网格“三违记录”现状与保留边界。
4. 修改文件清单和实际执行的只读命令。
5. 明确写“等待 Codex 审核，未开始 06B”。

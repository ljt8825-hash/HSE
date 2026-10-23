# 风险 / 待办 归档

- **日期**：2026-09-27
- **归属对话**：当前会话
- **类别**：④风险待办

## 待办 / 风险内容

全站模板下载统一后遗留的生产放行与边界事项：

1. **生产 5876 需重启加载新增模板**：`moduleTemplates` 是后端模块级常量，新增的 7 个 key（training-requirements/plans/new-employee/driver/records、emergency-drill、standard-clauses）需重启生产后端才生效。生产重启属 prod-boundary §7 独立操作，须用户显式授权放行后执行（留痕）。
2. **前端需重新构建发布 dist**：中文下载文件名由前端 `TEMPLATE_FILE_NAMES` 决定，需重新 `pnpm run build:naive` 生成新 dist；生产 5876 `express.static` 读盘即时生效无需重启，但须完成构建发布。
3. **web-antd 端未同步**：web-antd 的 training/ledger 等仍为「缺少人数」列/独立逻辑，按 AGENTS.md 约束本次未改动。若后续需两端对齐，应单独立项并评估是否超出冻结边界。
4. **grid 后端 tplFileName 死代码**：后端对 grid/training-ledger/ledger 的中文名逻辑被前端覆盖不生效，现为死代码；本次以生效层前端为准。可择机清理，但清理前须确认无其他直接消费方依赖该文件名。
5. **兜底模板仍为「字段1~字段5」**：若未来新增前端模块调用 `useGenericImport('<新module>')` 而未在后端 `moduleTemplates` 登记，仍会落到兜底占位列。应由新增模块流程确保同步登记（见规则口径 2026-09-27）。
6. **web-antd 已知差异（2026-09-27 决策：不修复）**：`apps/web-antd/src/components/hse/ImportButtonGroup.vue` 的 `handleDownloadTemplate` 将下载名强制写为 `` `${props.module}_template.csv` ``（英文 + 后缀错为 `.csv`，实际为 xlsx 内容），覆盖后端生成的中文名；web-antd `training/ledger` 汇总列标题为「缺少人数」（dataIndex `missingCount`）而非 web-naive 的「缺少人员」。按 AGENTS.md 约束与本次决策，web-antd 不改动，作为长期已知差异保留。已复核 web-naive 侧 27 模块中文名全部命中后端 moduleTemplates，无「文件名中文但列仍为字段1/2」问题。

## 受影响模块 / 表

- 生产后端进程 5876（部署重启）
- 前端 `web-naive` dist（构建发布）
- 潜在：`web-antd`、未来新增导入模块

## 建议下一步

- 用户显式授权后重启生产 5876（提权方式，参考既往 HSE-Backend-5876 重启脚本）
- 重建前端 dist 并核对 dist 内含中文文件名逻辑
- 视需要立项对齐 web-antd

## 是否已同步索引

- [x] 已更新 `_index.md`
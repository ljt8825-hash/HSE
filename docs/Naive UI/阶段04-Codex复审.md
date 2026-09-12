# 阶段 04 Codex 复审

## 审核对象

- WorkBuddy 整改版总结：`阶段04-执行总结.md`
- 上一轮审核：`阶段04-Codex审核.md`
- 约束：`01-强制设计约束.md`
- 目标应用：`安全看板vben/apps/web-naive`
- 复审日期：2026-08-16

## 结论

阶段 04 **仍未通过**，不得进入阶段 05。整改版完成了路由父子结构、权限标记、员工业务补齐、风险业务 API 适配和部分导入接线，但质量门和关键业务闭环仍未满足要求。

## 阻断问题

### P1-1：TypeScript 类型检查实际失败

独立执行：

```powershell
pnpm -F @vben/web-naive run typecheck
```

真实结果：退出码 **2**（`ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`），因此总结中“退出 0”的记录不成立。错误如下：

| 文件 | 行号 | 问题 |
|---|---:|---|
| `src/views/hse/_shared/useGenericImport.ts` | 62 | `Object.keys(rows[0])` 未处理 `rows[0]` 可能为 `undefined` |
| `src/views/risk-control/components/RiskAssessModal.vue` | 15 | `NInputNumber` 未使用 |
| `src/views/risk-control/components/RiskAssessModal.vue` | 206、216、225、236 | 因子选项访问的 `symbol` 类型不匹配 |
| `src/views/risk-control/components/RiskAssessModal.vue` | 210、220、229、240 | `AssessFactorOption[]` 不符合 Naive `NSelect` 的 options 类型 |
| `src/views/risk-control/components/RiskDetailDrawer.vue` | 190、198 | Naive `NTag` 不接受 `neutral` / `danger` 联合类型 |
| `src/views/risk-control/components/RiskMapDrawer.vue` | 77 | Naive `NTag` 不接受 `neutral` 类型 |
| `src/views/risk-control/index.vue` | 282 | `openView` 定义但未使用 |

必须修复后重新执行 typecheck，并记录真实退出码和完整输出摘要。

### P1-2：通用导入上传未传模块标识，流程没有闭环

- `src/api/import.ts:56` 的 `uploadImport(file)` 只把 `file` 写入 `FormData`。
- `src/views/hse/_shared/useGenericImport.ts:56` 调用 `uploadImport(file)`，没有传入 `emergency` 或 `risk-control`。
- 服务端 `server/routes/import.js:1422` 读取 `req.body.module`，并按模块匹配导入配置。
- 因此当前只验证了模板下载，不能证明应急/风险的上传解析、校验预览、确认入库和刷新列表可用。下一轮必须用真实有效文件完成这四步，并记录请求路径、状态码和结果摘要。

### P1-3：风险地图仍是降级视图

`src/views/risk-control/components/RiskMapDrawer.vue:3-14` 明确声明为“降级实现”，实际只渲染名称、等级、区域和经纬度列表，未恢复旧版 Leaflet 地图、宁津边界、乡镇底图、风险标记交互和列表/地图联动。这与上一轮修复任务“恢复既有风险地图业务”不一致，不能作为“风险业务已恢复”的非阻断限制。

下一轮必须作出可验收的决策：

1. 在现有允许的技术和依赖范围内实现真实交互地图；或
2. 若确实必须新增 `leaflet` 及相关依赖，暂停代码实施并提交依赖、锁文件、包体积和回退方案，等待 Codex 决策。

在决策完成前不得把风险地图标记为通过。

### P1-4：真实浏览器回归尚未完成

总结明确未执行登录后页面回归、权限角色、查询/重置/分页、导入、CRUD、桌面/窄屏、亮暗主题和控制台检查。独立验证了匿名访问会跳转登录页，但尝试调用 `/api/auth/login` 返回 HTTP 500，未能完成登录态验收。因此 API 端点 200、模板下载 200 和 production build 通过，均不能替代浏览器业务验收。

### P2：风险地图组件存在未导入组件风险

`RiskMapDrawer.vue` 模板使用 `NThing`、`NSpace`，但 `naive-ui` import 列表未导入二者。需补齐导入并通过 typecheck；随后在浏览器控制台确认没有运行时组件解析告警。

## 已确认通过的部分

- 三个试点已恢复父子路由、`authority`、`keepAlive`、`redirect`，并删除试点路由的 `ignoreAccess`。
- 三个试点已移除 `sortable`、`sortBy`、`sortOrder` 和 `@sort-change`，符合当前后端不支持服务端排序的事实；表头居中要求仍需浏览器复核。
- 员工岗位筛选、调岗、历史抽屉和 `canEdit` 接线已出现，风险详情/附件/版本/评估/关联隐患等组件和 API 已补回。
- `pnpm -F @vben/web-naive run build` 本轮独立执行退出码 0；该结果不能抵消 typecheck 失败。
- `web-naive/src` 未发现 `ant-design-vue` 引用。

## 放行条件

阶段 04 只有在第二轮修复后同时满足以下条件才能复审通过：typecheck 退出 0；导入上传携带正确 module 且 emergency/risk 流程真实闭环；风险地图完成真实功能或获得明确依赖决策；登录后浏览器回归覆盖权限、三页业务操作、响应式、亮暗主题和控制台；总结中的每一项结果与实际命令输出一致。继续保持总体进度 `03 / 07`，不得创建或执行阶段 05。

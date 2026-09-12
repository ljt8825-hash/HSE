# 提示词-06D-3-Naive-HSE 人员管理·redirect 迁移

> 任务类型：Naive HSE 人员管理 · 作业中心隐藏重定向迁移（收尾）
> 前置：`阶段06D-2-执行总结.md` 已由 Codex/审核方结论为「通过（附 1 处必须修复）」，本批顺带闭环该缺陷。
> 基线唯一来源：`apps/web-antd/src/router/routes/modules/hse-07-personnel.ts`（第 86–97 行 `PersonnelOrgCenter` 条目）。
> 目标工程：`apps/web-naive`。**严禁触碰 `web-antd`、后端 `server/`、SQL、依赖/锁文件。**

## 一、范围

1 个一级菜单下的 1 条隐藏重定向路由 + 2 处附带整改，全部落在 `web-naive`。

| 项 | 类型 | 优先级 |
|---|---|---|
| `PersonnelOrgCenter` `/personnel/org-center` 隐藏重定向 | 主任务 | 高 |
| `employee-import-v2/index.vue` 补 `NResult` 导入 | 附带整改（闭环 06D-2 缺陷） | 高 |
| 人员管理子菜单顺序对齐基线 | 附带整改 | 中 |
| i18n `orgCenter` 键 × 2 locale | 主任务配套 | 中 |

## 二、主任务：`PersonnelOrgCenter` 隐藏重定向路由

### 2.1 基线（唯一契约）

`apps/web-antd/src/router/routes/modules/hse-07-personnel.ts`：

```ts
{
  // [阶段3] 作业中心已合并至组织管理；保留隐藏重定向，避免旧书签/链接 404
  meta: {
    title: '作业中心',
    icon: 'lucide:building-2',
    authority: ['admin', 'safety_manager'],
    hideInMenu: true,
  },
  name: 'PersonnelOrgCenter',
  path: '/personnel/org-center',
  redirect: '/personnel/departments',
},
```

### 2.2 落地要求

在 `apps/web-naive/src/router/routes/modules/hse-personnel.ts` 的 `HsePersonnel`（`/personnel`）children 末尾追加该子路由，严格满足：

- `name: 'PersonnelOrgCenter'`（**无 `Hse` 前缀**）
- `path: '/personnel/org-center'`
- `redirect: '/personnel/departments'`（指向既有的 `PersonnelDepartments`）
- `meta.title`：用 i18n `$t('page.hse.orgCenter')`（**不得硬编码中文**，与同文件其余子路由一致）
- `meta.icon: 'lucide:building-2'`
- `meta.authority: ['admin', 'safety_manager']`
- `meta.hideInMenu: true`（仅重定向，不占菜单项，不渲染视图）
- **无 `component` 字段**（纯重定向），`keepAlive` 不设

### 2.3 i18n 配套

在 `apps/web-naive/src/locales/langs/zh-CN/page.json` 与 `en-US/page.json` 的 `page.hse` 段各新增 1 键：

| 键 | zh-CN | en-US |
|---|---|---|
| `orgCenter` | 作业中心 | Operation Center |

> 插入位置参照同段既有 `departments`/`positions` 等 personnel 键的字典序或就近，保持 JSON 合法（逗号分隔）。

## 三、附带整改

### 3.1 补 `NResult` 导入（闭环 06D-2 必须修复项）

`apps/web-naive/src/views/hse/employee-import-v2/index.vue` 模板 844–857 行使用 `<NResult>`（「入库结果」模态），但 `naive-ui` 导入块缺该项。在既有 `import { ... } from 'naive-ui'` 中追加 `NResult`（保持字母序插入到 `NPopconfirm` 与 `NSelect` 之间即可）。**不得改动该文件其它逻辑。**

### 3.2 子菜单顺序对齐基线

`hse-personnel.ts` 当前 children 顺序为「…员工档案 → 超龄人员 → 花名册导入 → 批量导入」，与基线 `hse-07-personnel.ts` 1:1 目标不一致。最终 children 顺序须严格等于基线：

1. `员工列表`（`/personnel/employee`，现有，**不更名**）
2. `组织管理`（`PersonnelDepartments`）
3. `岗位管理`（`PersonnelPositions`）
4. `员工档案`（`PersonnelProfile`）
5. `花名册导入`（`PersonnelImport`）
6. `批量导入`（`PersonnelBatchImport`）
7. `超龄人员`（`PersonnelOverAge`）
8. `作业中心`（`PersonnelOrgCenter`，本次新增）

即：把 `PersonnelOverAge` 移动到 `PersonnelImport`/`PersonnelBatchImport` 之后、新增 `PersonnelOrgCenter` 之前；仅调整数组顺序，**不改动各子路由的 name/path/meta/component**。员工列表条目虽名为 `HseEmployeeList`，属 06D-1 已记录「name/icon 归一化批次」遗留项，**本批不更名**。

## 四、红线（严禁触碰）

1. 不修改 `web-antd`、后端 `server/`、SQL/数据库、`package.json`/锁文件、`src/router/routes/index.ts`。
2. 不改动 `hse-personnel.ts` 既有子路由的 name/path/meta/component（仅 `PersonnelOverAge` 的数组位置移动 + 追加 `PersonnelOrgCenter` 属于本批允许）。
3. 不改动 `employee-import-v2/index.vue`、`batch-import/index.vue` 除 §3.1 补 `NResult` 导入外的任何逻辑。
4. 不引入 `ant-design-vue` 或任何新依赖。
5. **严禁执行任何写操作**（后端无 `/personnel/org-center` 写端点；本批为纯前端路由/i18n/导入修补，天然无写操作）。

## 五、验证与交付（提交 `阶段06D-3-执行总结.md` 供审核）

1. **静态**：
   - `pnpm --filter @vben/web-naive run typecheck` 退出码 0。
   - `rg -n "ant-design-vue" apps/web-naive/src` → 0 命中。
   - `rg -n "HseOrgCenter|PersonnelOrgCenter" apps/web-naive/src/router/routes/modules/hse-personnel.ts` → 仅 `PersonnelOrgCenter` 1 处（无 `Hse` 前缀残留）。
2. **路由语义**（浏览器无写入验证，仅导航）：
   - 访问 `/personnel/org-center` 应 302/客户端重定向到 `/personnel/departments`（组织管理页），标题/面包屑正确，无空白页、无 404。
   - 侧边栏菜单应显示「人员管理 → 员工列表 / 组织管理 / 岗位管理 / 员工档案 / 花名册导入 / 批量导入 / 超龄人员」，「作业中心」**不出现**（hideInMenu）。
   - `/personnel/import`、`/personnel/batch-import` 页面正常渲染，控制台无 `Failed to resolve component`（重点确认 `NResult` 修复后的「入库结果」模态可被静态可达性判定为已解析，不实际触发入库写操作）。
3. **i18n**：`orgCenter` 键 zh-CN/en-US 均存在；切换 en-US 后（若菜单/路由 title 被引用）显示 `Operation Center`。
4. 交付物：`阶段06D-3-执行总结.md`，含变更文件清单、路由映射表、验证截图/日志路径，并逐条说明红线遵守情况。
# 提示词-06D-5-Naive-HSE 系统管理迁移

> 任务类型：Naive HSE 批量迁移 · 系统管理（1 个一级菜单 / 3 路由）+ 视图/API 契约核验
> 前置：`阶段06D-4-审核.md` 已结论「通过（无附条件；附 1 处非阻塞勘误）」；总体进度 `05 / 07`。
> 基线唯一来源：`apps/web-antd/src/router/routes/modules/hse-11-system.ts`，以及对应旧版 `web-antd` 视图（功能契约，非复制实现）。
> 目标工程：`apps/web-naive`。**严禁触碰 `web-antd`、后端 `server/`、SQL/数据库、`package.json`/锁文件、`src/router/routes/index.ts`。**

---

## 零、本轮现状关键结论（执行者先读）

web-naive **已存在** `hse-system.ts` 与全部视图/部分 API，但结构漂移严重，属「整流 + 核验」，非从零新建。已核实：

| 物 | 现状 |
|---|---|
| `hse-system.ts` | **2 个父菜单**（`System` `/system` order12 + `Security` `/security` order13），**均 `hideInMenu:true`**；含残留 `SystemDemoData` `/system/demo-data` |
| 视图 | `views/system/users`（12382B）、`views/system/roles`（13201B）、`views/security/audit`（11271B）、`views/system/demo-data`（5289B）均存在，naive 实现 |
| API | `#/api/hse/audit.ts` 已存在（1933B）；**`#/api/hse/system.ts` 缺失**，users/roles 视图现错误引用 `#/api/core/system`（core 脚手架，非 HSE 契约）；`#/api/hse/demo-data.ts`（789B）为 web-naive 自有 |

---

## 一、范围总览

| 项 | 类型 | 优先级 |
|---|---|---|
| `hse-system.ts` 路由整流（合并 2 父→1 父、移除 `SystemDemoData`、审计路由并回 `/system/audit`） | 主任务 | 高 |
| i18n 配套（系统管理 4 键 zh/en） | 主任务配套 | 高 |
| API 契约核验（新增 `#/api/hse/system.ts`、核对 audit、core/system 分流） | 主任务 | 高 |
| 视图完备性核验与补差（users/roles/audit） | 主任务 | 高 |

---

## 二、主任务：hse-system.ts 路由整流

### 2.1 基线（唯一契约）`hse-11-system.ts`

```ts
{
  meta: {
    icon: 'lucide:settings',
    order: 11,
    title: '系统管理',
    authority: ['admin'],
    keepAlive: true,
  },
  name: 'HseSystem',
  path: '/system',
  redirect: '/system/users',
  children: [
    { meta: { title: '用户管理', icon: 'lucide:user-cog',       authority: ['admin'] }, name: 'SystemUsers', path: '/system/users', component: () => import('#/views/system/users/index.vue') },
    { meta: { title: '角色管理', icon: 'lucide:shield-check',   authority: ['admin'] }, name: 'SystemRoles', path: '/system/roles', component: () => import('#/views/system/roles/index.vue') },
    { meta: { title: '审计日志', icon: 'lucide:clipboard-list', authority: ['admin'] }, name: 'SystemAudit', path: '/system/audit', component: () => import('#/views/security/audit/index.vue') },
  ],
}
```

> 注意：审计日志子路由 path 为 `/system/audit`，但 component 指向 `#/views/security/audit/index.vue`（基线如此，勿改动组件路径）。

### 2.2 现状差异 → 逐项整改

| # | 字段 | 现状（web-naive） | 目标（基线） | 整改 |
|---|---|---|---|---|
| 1 | 父菜单结构 | 2 个父 `System`(order12) + `Security`(order13)，均 `hideInMenu:true` | 1 个父 `HseSystem`(order11)，**无 hideInMenu** | **合并为 1 父**：删 `System`/`Security`/`SystemDemoData`/`SecurityAudit` 块，重建为基线结构 |
| 2 | 父 `name` | `System` / `Security`（无 `Hse` 前缀） | `HseSystem` | 改 name |
| 3 | 父 `meta.order` | `12` / `13` | `11` | 改 order |
| 4 | 父 `meta.hideInMenu` | `true`（菜单被隐藏） | 无（菜单须可见） | **删除 hideInMenu** |
| 5 | 父 `meta.keepAlive` | 缺失 | `true` | 补 keepAlive |
| 6 | 父 `meta.title` | 硬编码 `'系统管理'` / `'安全审计'` | `$t('page.hse.system')` | 转 i18n（新增键，见 §五） |
| 7 | 审计子路由 | `SecurityAudit` `/security/audit`（`Security` 父下） | `SystemAudit` `/system/audit`（`HseSystem` 父下） | 改 name/path，**component 保持 `#/views/security/audit/index.vue`** |
| 8 | 残留子路由 | `SystemDemoData` `/system/demo-data` | **基线无此路由** | **删除该子路由条目** |
| 9 | users `meta.icon` | `lucide:users` | `lucide:user-cog` | 改 icon |
| 10 | roles `meta.icon` | `lucide:shield` | `lucide:shield-check` | 改 icon |
| 11 | 三子/父 title | 硬编码中文 | `$t(...)` | 转 i18n（新增 4 键） |

> `SystemUsers`/`SystemRoles` 的 name/path/component、audit 的 icon（`clipboard-list`）已与基线一致，不得改动。
> 删除 `SystemDemoData` 后，`views/system/demo-data/index.vue` 与 `api/hse/demo-data.ts` 成为孤儿：**仅删除路由条目，视图/API 文件保留**（同 `insurance/over-age` 处置，物理删除与否记录为遗留项）。

---

## 三、API 契约核验

1. **新增 `apps/web-naive/src/api/hse/system.ts`**：对照基线 `apps/web-antd/src/api/hse/system.ts` 的请求方法/URL/参数/返回结构逐一建立（不改服务端接口）。覆盖用户管理、角色管理所需端点。
2. **users/roles 视图 API 引用整流**：`views/system/users/index.vue`、`views/system/roles/index.vue` 当前 `import ... from '#/api/core/system'` 需改为 `'#/api/hse/system'`（对齐基线 `#/api/hse/system`）。改造前核对 `#/api/core/system` 是否与 HSE 后端 `/api/system/...` 契约一致——若一致可保留并在总结说明；不一致则新建 `hse/system.ts` 后改引用。
3. **audit**：`views/security/audit/index.vue` 已用 `#/api/hse/audit`，仅核对端点与后端一致（列表/导出）。
4. **全程只读**：仅静态核对端点，**严禁调用任何写端点**。

---

## 四、视图完备性核验与补差

对照基线 `web-antd` 视图核验，缺失则补齐/记录：

- `views/system/users/index.vue`：用户 CRUD（列表/分页/搜索/新增/编辑/启停/删除）。
- `views/system/roles/index.vue`：角色 CRUD。
- `views/security/audit/index.vue`：审计日志列表 / 导出。

> 原则：功能不缩水；若某基线能力已用等价 naive 交互实现，在总结逐项说明；缺失须补齐或如实记录为「经确认的超范围遗留项（附理由）」，不得静默跳过。

---

## 五、i18n 配套清单

统一规范：路由 `meta.title` 一律 `$t('page.hse.xxx')`，zh-CN / en-US 两份 `page.json` 同步（本次均为新键）。

| 键 | zh-CN | en-US | 用途 |
|---|---|---|---|
| `system` | 系统管理 | System Management | 父菜单 title |
| `systemUsers` | 用户管理 | User Management | 用户管理子菜单 |
| `systemRoles` | 角色管理 | Role Management | 角色管理子菜单 |
| `systemAudit` | 审计日志 | Audit Log | 审计日志子菜单 |

> 原「安全审计」父菜单随 `Security` 父移除，无需为其建键。

---

## 六、红线（严禁触碰）

1. 不修改 `web-antd`、后端 `server/`、SQL/数据库、`package.json`/锁文件、`src/router/routes/index.ts`。
2. 不改动既有子路由的 component 路径（尤其 audit 的 `#/views/security/audit/index.vue`）与 users/roles 的 name/path。
3. 不改动各视图除 §三 API 引用整流、§四 完备性补差明确允许外的逻辑。
4. 不引入 `ant-design-vue` 或任何新依赖。
5. **严禁执行任何写操作**（用户/角色/审计均只读核验；浏览器验证仅导航 + 读取 + 截图，全程只读）。

---

## 七、验证与交付（提交 `阶段06D-5-执行总结.md` 供审核）

1. **静态**：
   - `pnpm --filter @vben/web-naive run typecheck` 退出码 0。
   - `rg -n "ant-design-vue" apps/web-naive/src` → 0 命中。
   - `rg -n "SystemDemoData|SecurityAudit|/security/audit" apps/web-naive/src/router/routes/modules/hse-system.ts` → 0 命中（仅 `SystemAudit` `/system/audit`）。
   - `rg -n "page\.hse\.(system|systemUsers|systemRoles|systemAudit)" apps/web-naive/src/locales` → zh/en 各 4 键齐全。
   - `rg -n "#/api/core/system" apps/web-naive/src/views/system` → 0 命中（已改 `#/api/hse/system`），或总结说明保留理由。
2. **路由语义**（浏览器无写入验证，仅导航/截图）：
   - 侧边栏「系统管理」菜单**可见**（随机 hideInMenu 已移除），下挂「用户管理/角色管理/审计日志」3 项按基线顺序。
   - 访问 `/system/users`、`/system/roles`、`/system/audit` 均正常渲染，控制台 0 错误。
   - 菜单图标/顺序与基线一致（order 11）。
3. **完备性**：§四 逐项附结论（已具备/已补齐/超范围遗留说明）。
4. 交付物：`阶段06D-5-执行总结.md`，含变更文件清单、路由映射表（基线 vs 落地）、i18n 键清单、API 契约核验结论、验证截图/日志路径，并逐条说明红线遵守情况。
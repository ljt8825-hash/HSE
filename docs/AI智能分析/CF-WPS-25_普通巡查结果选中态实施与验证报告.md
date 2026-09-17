# CF-WPS-25 「普通巡查」结果二选一选中态实施与验证报告

- **日期**：2026-09-17
- **页面**：`/check` → 开始检查 → 现场拍照 → 「不是三违」 → **普通巡查**（`#view-patrol`）
- **用户诉求（原话）**：「@image#1 在点击"一般问题"或"现场正常"时，没有标记到底是点的哪个」
- **结论**：已修复并上线。Pages 部署 `ba608582.grid-mobile-cloudflare.pages.dev`（生产别名 `grid-mobile-cloudflare.pages.dev`）；**未动 Worker**。
- **验证**：本地 41 PASS / 0 FAIL；**生产 41 PASS / 0 FAIL**；同页回归 cfwps23 33/33、路由回归 cfwps24 22/22。

---

## 一、真根因（读代码定位，不是猜）

改动前的 `check.html`（旧 1371 行）：

```js
$$("[data-patrol]").forEach(el => el.onclick = () => {
  draft.patrolResult = el.dataset.patrol;   // 只写了草稿值
  $("#btn-patrol-done").disabled = false;   // 只解锁了按钮
});
```

卡片 HTML 也只是静态两块 `div.opt-card`，**没有任何选中态**：

- 没有换边框颜色、没有换底色、没有勾选标记 ⇒ 点完屏幕上**零变化**；
- 也没有互斥：两张卡没有「选中排他」，用户点错后无法确认最终生效的是哪一个；
- CSS 里 `.opt-card` 只有 `:active`（按下瞬间缩放），**抬起即恢复原样** ——这正是用户感觉「没标记」的直接原因。

两处附带缺陷（同一根因，一并修掉）：

1. `#opt-no`（「不是三违」）入口处是手写 `$("#btn-patrol-done").disabled = true; draft.patrolResult = null;`，
   复位逻辑散落、与点选逻辑不同源；
2. `startCheck()`（新一次检查）重置 `draft` 时**完全不碰卡片 UI** ⇒ 上一轮的高亮会残留到下一轮。

## 二、改法（单一渲染入口 + 单一选中视觉）

新增**唯一**渲染函数 `renderPatrolChoice()`，把「草稿值 → 可见选中态 → 按钮可用性」绑成一件事：

```js
function renderPatrolChoice(){
  $$("[data-patrol]").forEach(el => {
    const on = el.dataset.patrol === draft.patrolResult;
    el.classList.toggle("selected", on);
    el.setAttribute("aria-checked", on ? "true" : "false");
  });
  $("#btn-patrol-done").disabled = !draft.patrolResult;
}
```

三个调用点全部改为调用它，消除「改数据不改视觉」的可能：

| 调用点 | 作用 |
|---|---|
| 卡片 `onclick` / `onkeydown`（Enter、Space） | 点选与键盘选择 |
| `$("#opt-no").onclick` | 再次进入普通巡查时复位 |
| `startCheck()` | 新一次检查时复位（修掉高亮残留） |

结构与视觉：

- 两张卡加 `.selectable`，包进 `role="radiogroup"`，卡本身 `role="radio"` + `aria-checked`，补 `tabindex="0"`；
- 卡内加 `.opt-mark`（右上角圆形勾选标记，选中=实心蓝 + 白勾，未选中=空心圈）；
- 选中态样式：**主色边框 + 淡蓝底（`--primary-soft`）+ 标题变主色 + 实心勾选标记**；
- 外圈用 `box-shadow: 0 0 0 1px var(--primary)` 画，**不加粗 `border`** —— 加粗 border 会让卡片在选中瞬间尺寸跳动（1px→2px），换选时整屏抖动;
- 矮屏媒体查询（`max-height:700px`）单独补 `padding-right`，保证右侧标记区在压缩布局下不被文字压到。

## 三、验证（CF-WPS-25 浏览器 E2E，`worker/test/cfwps25-browser-e2e.mjs`）

分两层，共 **41 条断言**。

**一、静态层（源码，14 条）**：卡数与结构、唯一渲染函数及其三项职责、复用点（4 处）、旧「无视觉反馈」写法已消失、CSS 规则存在且用 box-shadow。

**二、浏览器层（决定性，27 条）** —— 关键在**不只断言 class，而是断言 computedStyle 的真实差异**（只看 class 会漏掉「加了 class 但 CSS 没生效」的假绿）：

| 断言 | 生产实测值 |
|---|---|
| B1 进入即两张卡未选中、`完成检查`禁用、选中数 0 | ✓ |
| B2 点「一般问题」→ 它选中、另一个不选中、按钮可用、`aria-checked` 正确 | ✓ |
| B3 选中卡与未选中卡**边框色不同** | `rgb(29,78,216)` vs `rgb(229,231,235)` |
| B3 底色不同 | `rgb(238,242,255)` vs `rgb(255,255,255)` |
| B3 标题色不同 | `rgb(29,78,216)` vs `rgb(26,26,26)` |
| B3 勾选标记透明度 | 选中 `1` / 未选中 `0` |
| B3 勾选标记底色（实心/空心） | `rgb(29,78,216)` vs `rgb(255,255,255)` |
| B4 改点「现场正常」→ 状态互换，且高亮样式与前一选择**完全一致** | ✓ |
| B5 任意时刻选中数恒为 1（互斥），反复切换仍为 1 | ✓ |
| B6 返回分类页重进 → 高亮清空、按钮回禁用 | ✓ |
| B7 首页重新发起检查（`startCheck`）→ 无残留 | ✓ |
| 无 JS 运行时错误 / 无 4xx 资源 | ✓ |

**纪律**：脚本走到 `view-patrol` 即止，**绝不点「完成检查」** ⇒ 不产生任何巡查记录。

回归：

| 用例 | 结果 |
|---|---|
| `cfwps23-browser-e2e.mjs`（会话/路由/拍照流程，同页） | 33 PASS / 0 FAIL |
| `cfwps24-browser-e2e.mjs`（`/home` 移除与历史栈治理） | 22 PASS / 0 FAIL |
| Worker 离线回归 | **未跑**：`git status` 证明本轮 `worker/` 零改动（源码逐字节未变），跑它只会报一份与本次改动无关的绿 |

截图（本地留存，`.gitignore` 已排除 `_*_shots/`）：`worker/test/_cfwps25_shots/01-none-selected.png`、`02-selected-general.png`、`03-selected-normal.png`、`04-reenter-cleared.png`、`05-new-check-clean.png`。

## 四、上线与生产探针

```bash
cd grid-mobile-cloudflare/_pages_deploy
npx wrangler pages deploy --project-name grid-mobile-cloudflare --commit-dirty=true
```

日志必须同时出现 `✨ Compiled Worker successfully` 与 `✨ Uploading Functions bundle`（缺后者 = 静默丢掉 Pages Functions，登录会变 405；2026-09-17 已踩过一次，见 `cf-pages-h5-verify` 技能 §0.1）。本次两条均在。

部署后三条探针：

| 探针 | 期望 | 实测 |
|---|---|---|
| `POST /api/mobile/auth/login`（错密码） | 401（**不是** 405） | **401** |
| `GET /api/mobile/health` | 404 JSON `NOT_FOUND`（说明 Functions→Worker 通） | 404 `{"code":"NOT_FOUND"}` |
| `GET /home` | 302 → `/check` | **302 → /check** |

回滚路径：Pages 控制台 → Deployments → 上一版本 → Rollback（`wrangler` CLI 无 rollback 子命令）。

## 五、同类问题排查（顺带做的一遍）

按「选完还要按确认按钮」这一特征全页扫了一遍，`check.html` 里只有两个按钮带 `disabled`：

- `#btn-patrol-done` —— 本次修复对象；
- `#btn-submit-rectify` —— 由「整改后照片」解锁，**照片预览本身就是可见反馈**，无同类问题。

其余卡片（`#opt-no` / `#opt-yes` / `#opt-self` / `#opt-transfer` / 三违宫格 `.vio-cell` / 选人 `.person-row`）均为**点即跳转**，不存在「选中态」这一概念，无需改动。

## 六、遗留

- 无。本轮为纯前端（`frontend/check.html` + 部署产物 `_pages_deploy/check.html`）改动，Worker 未动，无数据面变更、无迁移、无回滚风险面。

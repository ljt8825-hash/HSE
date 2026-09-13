# 岗位责任体系域三层化拆分完成（position-responsibility，Phase B 第 17 单）

> 类别：②交付报告 · 日期：2026-09-13 · 归属对话：当前会话

## 一句话结论
`routes/hse-position-responsibility.js`（原 757 行，Sprint6.0 岗位体系+责任体系：标准岗位/岗位别名/责任配置/责任记录 CRUD + 枚举）三层化拆分完成：父路由收敛为 **纯聚合入口**，业务全部下沉，对外 API 契约逐字节不变。独立复核三绿：**语法 0 错误、冒烟 100% 通过、新旧对比 12+9+1 全部 IDENTICAL/双 401/双 404**。本单识别出**两项既有故障**（见下），拆分中逐一忠实还原并作记录。

## 拆分范围与本层职责

| 文件 | 职责 |
|------|------|
| `routes/hse-position-responsibility.js` | 纯聚合入口（挂载 `./hse-position-responsibility/main`，7 行） |
| `routes/hse-position-responsibility/main.js` | 纯绑定子路由（21 端点 + 写端点鉴权，严格按原注册顺序） |
| `controllers/positionResponsibilityController.js` | 薄 handler + `respond()`（json 描述符 + run 兜底） |
| `services/positionResponsibilityService.js` | 全部业务+SQL+CRUD+枚举（约 470 行） |

## 端点覆盖（21 条，挂载 **`/api/hse/position-resp`**）
> 注意：文件顶部注释写 `/api/hse/position/...`，但实际挂载前缀为 `/api/hse/position-resp`，以实际为准。
| 端点 | 鉴权 | 说明 |
|------|------|------|
| `GET /position/list`、`/position/all`、`/position/:id` | 读 | 岗位列表/所有/详情 |
| `POST/PUT/DELETE /position[/:id]` | 写 | 岗位 CRUD（重查编码） |
| `GET /position-alias/list`、`/by-position/:positionId` | 读 | 别名列表/按岗位 |
| `POST /position-alias`、`DELETE /position-alias/:id` | 写 | 别名 CRUD |
| `GET /responsibility-config/list`、`/by-position/:positionId` | 读 | 配置列表/按岗位 |
| `PUT /responsibility-config/:id` | 写 | 配置更新（固定配置不可改责任类型） |
| `GET /responsibility/list`、`/:id` | 读 | 责任记录列表/详情 |
| `POST/PUT/DELETE /responsibility[/:id]` | 写 | 责任记录 CRUD |
| `GET /responsibility/types`、`/grid-levels`、`/position/job-categories` | 读(静态) | 枚举接口 |

## ⚠️ 识别并忠实还原的两项既有故障（非回归，原本即存在）
1. **路由遮蔽**：原文件 `GET /position/:id`、`GET /responsibility/:id` 注册在 `GET /position/job-categories`、`/responsibility/types`、`/responsibility/grid-levels` **之前**，导致这 3 个枚举端点被 `:id` 捕获而**不可达**（请求命中详情处理器，对非数字 id 触发 bigint 转换错误）。拆分版在 `main.js` **原样保留注册顺序**，遮蔽行为逐字节一致（由新旧对比中这 3 个端点 IDENTICAL 证实）。
2. **error() 参数换位怪形状**：`middleware/response.js` 中 `error(code=-1, message='操作失败')`。原文件几乎**所有错误分支均以错误文案直接传参**，即 `error('岗位不存在', 404)` 与 `error('获取岗位列表失败: '+err.message)` 等，导致 `code/message` 参数换位，线上实际返回 `{code: <文案串>, message: 404}` 或 `{code: <文案串>, message: '操作失败'}` 的怪形状。拆分版用 `errNot(msg)`（`{code:msg, message:404}`）与 `errCatch(msg)`（`{code:msg, message:'操作失败'}`）**两种描述符原样构造**该形状，逐字节还原，不改写为"正确"形状，绝不擅自修复行为。

## 与既有拆分对比的特殊点
- 本域 catch 前缀各异（同 roster-import），故 service 内各自 catch 返回带前缀描述符；controller `run()` 仅兜底。
- 无 `isConnected()` 内存降级（DB 断开直接抛错→描述符），无 auditLog/req.user/req.ip 依赖，写函数只取 `params/body`，签名更简。

## 独立复核（本单自查）
- **语法**：`node --check` 四文件全过（且确认 0 处遗留 `errF`，errCatch 26 处、errNot 6 处）。
- **冒烟**（`_smoke_position_responsibility.cjs`）：12 公开读可达+形状（含遮蔽端点断言换位怪形状）、9 写端点未登录全 401、11 组 service 描述符 + 3 个纯枚举（不触库）、404 —— 全部通过。
- **新旧对比**（`_compare_position_responsibility.cjs`，对照 git HEAD 原始版）：公开读 12 端点**双 200 逐字节 IDENTICAL（含 3 个被遮蔽端点**）、写 9 端点**双 401**、不存在路径**双 404** —— 全部一致。
  - 曾出现 5 处 DIFF，根因即上述 error 换位故障（拆分版首版用了"正确"参数序）→ 修正为忠实还原换位形状后归零，验证此修复必要性。

## 约定
- 冒烟 `_smoke_position_responsibility.cjs` 与对比 `_compare_position_responsibility.cjs` 为临时验证件，保留于 `server/` 供回归。
- 本单未触碰生产表 / 端口 / WPS 边界；验证全部为只读 + 未登录 401 + 缺失参数 before-write return + 0-row no-op。
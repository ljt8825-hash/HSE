# B0-05｜重点保护资产核验（人员底座 / cost.js / 冻结域）

> 全部为只读核验（grep/cat-file/md5sum/diff --cached），未做任何写操作。实测时间 2026-10-30 11:21~11:30。

## 6.1 人员底座 A-02 系列

### 实际文件清单（工作区实存，全部未提交）

| 文件 | Git 状态 | 对应历史任务 | 本次核验证据 |
|---|---|---|---|
| `server/services/employeeService.js` | M | A-02B W1 收口（03.35） | `:489-494` 顶部 `-4` 闸门实读在位；`:521-522` 写路径摘除注释在位 |
| `server/services/employeeAssignmentService.js` | M | B1 闸门 / B2.2 返聘 / A-02B 并发栅栏 | `:648 rehireEmployee` 实读在位；`:455-467` FOR UPDATE 复核栅栏实读在位；`:892` 「返聘已从白名单移除」注释在位 |
| `server/services/employeeImportService.js` | M | C1 V1 闸门（03.24） | 状态 M（行号级证据沿用 03.24 报告） |
| `server/services/employeeImportV2Service.js` | M | C1 V2 闸门（03.24） | 同上 |
| `server/services/employeeProfileService.js` | M | 人员档案/派生 | 状态 M |
| `server/services/employeeStatusDict.js` | ?? | A-02d~B2.2 状态字典（`isTerminalRelation`:262 等） | 未跟踪实存 |
| `server/controllers/hse-assignment.js` | M | terminate/rehire 控制器 | 状态 M |
| `server/routes/hse-employee/assignment.js` | M | `POST /org/rehire` 路由 | 状态 M |
| `web-naive/.../employee/index.vue` | M | A-02B 只读降级 + 双 Modal 入口 | `displayEmploymentRelation`、TerminalModal/RehireModal 引用（03.35 实测） |
| `web-naive/.../components/TerminalModal.vue` / `RehireModal.vue` | ?? | A-02A / B2.2 入口组件 | 未跟踪实存 |
| `web-naive/src/api/hse/employee-terminate.ts / employee-rehire.ts / employee-status.ts` | ?? | 三个专用 API 封装 | 未跟踪实存 |
| `web-antd/src/api/hse/employee.ts`(+types/useEmployeeData/ProfilePage/import-v2) | M | web-antd 侧人员改造 | 状态 M |
| 测试 ×8（`server/__tests__/employee-*.unit.test.js`）+ 前端 4 件 | ?? | 03.23~03.35 各节点 | 未跟踪实存；2026-10-30 实测 73/73 + 153/153 全绿 |
| 报告链 `docs/AI智能分析/B02-DEC-03.13~03.35`（26 份） | ?? | 全部实施/验收报告 | 未跟踪实存 |

### 已完成能力（有测试+报告双证据）
状态编码统一（A-02d）→ 派生只读（A-02e.1/2）→ 规则契约（A-02e.4）→ B1 分配闸门 → C1 导入防复活 → B2.2 返聘闭环 → D1 前端入口 → A-02A 终态登记 → A-02B 编辑收口；关系字段写路径收敛为 terminate/rehire 两专用口。

### 未完成能力（承接清单）
`rehireEmployee` 撤销路径、A（编辑页关系写入事务化）、A-04 死亡终态、B-01~B-05 重复语义 12,955 行待裁、V2 审核阶段不读关系、DB-INT 连库核验全部未做。

### 代码 vs 历史 PASS 报告可能不一致点
1. 03.35 报告的"web-antd 无编辑入口"结论已在 03.35 执行中自我纠正（EmployeeEditModal 真实存在、payload 不含关系字段）——报告 §5 已记录，非遗留矛盾。
2. 其余报告 PASS 均基于当时工作区快照；此后无人员域代码改动，一致性可信。

## 6.2 cost.js

| 检查项 | 结果 |
|---|---|
| Git 状态 | `A `（唯一暂存项） |
| HEAD 中是否存在 | **不存在**（`git cat-file -e HEAD:server/routes/cost.js` → NOT_IN_HEAD）——澄清：它是**新文件**，staged diff 18 行 = 全文 |
| 暂存区内容 | 18 行聚合入口 shim：注释说明"业务已下沉 costService+costController+cost/main.js，本文件仅挂载，同名文件优先于目录，缺失即 app.js 启动 MODULE_NOT_FOUND"；`router.use('/', require('./cost/main'))` |
| 工作区 vs 暂存区 | 无差异（`git diff server/routes/cost.js` 为空） |
| 当前 MD5 | `e88ae2b0b275346dfc1431408aa00bff`（实测） |
| 与历史哈希一致性 | 与项目记忆记录值相同；**本任务无独立可信历史哈希来源，仅记录当前值**（按任务书要求不声称"一致"） |
| 其他费用域修改 | `objectiveService.js`、`web-naive cost.ts/goals.ts`、objectives 4 页面均有未提交修改（B0-02 §2.3/2.5），不影响 cost.js 保护态 |

**结论：保护态完好，B-0 全程零写操作。**

## 6.3 冻结域核验

| 冻结项 | 核验方式 | 结果 |
|---|---|---|
| H5 生产链路（grid-mobile-cloudflare） | git status + diff --stat + md5sum | **⚠️ 不满足"无变化"预期**：11 个文件未提交修改（+724/−155，check.app.js/check.html 为培训功能扩展）+ 3 个未跟踪新文件（train.app.js×2、worker/training.js）。对应 2026-10-29《培训模块H5代码完成待验收》。属"待验收交付物暂存于冻结链"，**未部署、未提交**；但链路文件已非冻结时点原样。worker/index.js 当前 md5 `c9eff6c77adb09837fe659bb9a8555c9`（记录值） |
| 返聘功能 | grep rehireEmployee | `employeeAssignmentService.js:648` 在位；`:892` 白名单移除注释在位——代码完整，B-0 未触碰 |
| WPS 反向写硬锁 | grep | `wpsGridPullEngine.js:40 const REVERSE_WRITE_ENABLED = false;` ✅ 在位（`:526/:547` 导出） |
| 18-hash 列冻结 | grep | `wpsGridPullEngine.js:162`「变更检测哈希：18 个冻结列固定顺序、''≡null 的 SHA-256」✅ 在位 |
| 花名册唯一权威=飞书 | 文档核对 | `docs/架构基线/B00-事实源与数据链核验结论.md:43` app_token `WX9TbTqJKa7sywsgrU4cVoKdnXb` 记录在案；代码侧 roster-import 链未改动（M 列表无 roster 文件）✅ |
| DB 仅 dev 限制 | grep + 实读 | `server/config/db.js:9` 回退链 `DB_NAME||...||'safety_dashboard'`（**默认即生产库名**，红线 2 的"不注入=连生产"风险仍然成立）；dev 断言守卫实存于 `server/scripts/p3-04-00.3-w14-default.ddl.js:8`（断言 current_database()=safety_dashboard_dev）与 `p3-04-00-status-safety.test.js:188-190` ✅ 模式在位，但依赖各脚本自觉引入 |
| 生产启动器 | `prod-launch.cjs` | **有未提交修改（K 类，diff 实质未逐行核）**——涉红线 2b，列入 B-1 前人工核实项 |

## 6.4 核验小结

- cost.js / WPS 硬锁 / 18-hash / 返聘代码 / 花名册权威：**完好**。
- H5 冻结链：**承载未提交的培训扩展（待验收交付物）**，且盘点期间 mtime 仍在更新——保护状态从"冻结原样"变为"冻结+待验收叠加层"，需总控明确处置（见 B0-06 方案 5 / B0-07 R-0、R-1）。
- dev-only DB 防护：守卫模式在位但依赖脚本自觉，config 默认回退生产库名的固有风险未变。

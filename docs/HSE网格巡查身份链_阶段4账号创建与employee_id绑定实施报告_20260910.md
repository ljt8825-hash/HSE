# HSE 网格巡查身份链 · 阶段4

## 62 个网格负责人账号创建 + `public.users.employee_id` 批量绑定

- **项目**：`G:\hse-dashboard`
- **报告日期**：2026-09-10
- **前置状态**：`PHASE_3B1_COMPLETED_READY_FOR_PHASE_4`（阶段0/1/2/3-A/3-B-1 已完成）
- **实施范围**：仅"阶段4"——62 个网格负责人账号创建 + `employee_id` 批量绑定
- **最终状态**：`PHASE_4_COMPLETED_READY_FOR_PHASE_3B2`

---

## 1. 执行摘要

本阶段在不破坏现有 WPS 生产路径、不修改任何被禁文件（auth.js / JWT / login / users 表结构 / employee 表结构 / WPS 全部 / 前端 / 菜单 / RBAC 角色定义）的前提下，完成了：

1. **只读审计**：确认 62 个 live 网格责任人身份链（personnel_id → employee.id）100% 干净、手机号可解密。
2. **Dry Run（预检）**：62/62 可创建，0 冲突、0 集内重复、0 已绑定、0 BLOCKED。
3. **正式初始化**：事务化、幂等地创建 62 个 `manager` 角色账号，绑定各自 `employee_id`，初始密码=用户名，强制 `must_change_password=true`，密码以 bcrypt 哈希落库。
4. **admin 绑定**：`real_name='管理员'` 与任何 employee 均不匹配 → 按纪律判定 `ADMIN_BINDING_BLOCKED`，**不强行绑定、不修改 admin 任何字段**。
5. **验证**：计数/唯一性/bcrypt/幂等/回滚/resolver 解析/WPS 零写入全部通过；阶段0/1/2/3-B-1 全套回归通过（修复了历史测试夹具与阶段4 真实绑定的 employee_id 冲突，仅改测试脚本，未碰生产代码）。

最终达成稳定链路：

```text
62 个 live grid
  → 62 个 personnel_id
  → 62 个 employee_id
  → 62 个 users.employee_id
  → 62 个稳定登录身份（manager）
```

一人一员工、一员工一账号、零歧义、零猜测。

---

## 2. 当前数据库基线

| 项 | 值 |
| --- | --- |
| live 网格数（`grid_areas.is_deleted=false`） | 62 |
| `grid_areas.personnel_id` 非空 | 62/62 |
| `personnel_id` 可 JOIN `employee` | 62/62 |
| 孤儿 / 已删除 employee / 无效 employee | 0 / 0 / 0 |
| `personnel_id` 唯一（一人不对应多 live grid） | 62 唯一 |
| `employee` 总数 | 3041 |
| `users` 总数（执行前） | 1（仅 admin） |

> 注：本阶段发现 `grid_areas` 软删字段为 `is_deleted`（boolean），与部分早期文档描述的 `deleted_at` 不符；已按真实列名 `is_deleted=false` 实施与审计。

---

## 3. 62 个网格负责人审计

预检（`server/scripts/_phase4_account_init_preflight.cjs`，纯 SELECT，零写入）逐项校验：

| 检查项 | 要求 | 实际 |
| --- | --- | --- |
| live grid | 62 | 62 |
| personnel_id 非空 | 62/62 | 62/62 |
| employee 存在 | 62/62 | 62/62 |
| employee 未删除 | 62/62 | 62/62 |
| phone 存在且格式正常 | 62/62 | 62/62 |
| username 可生成 | 62/62 | 62/62 |
| username 冲突 | 0 | 0 |
| employee_id 已绑定其他账号 | 0 | 0 |
| 一个 employee 多个账号 | 0 | 0 |
| 一个账号多个 employee | 0 | 0 |

预检结论：`READY_FOR_ACCOUNT_INITIALIZATION`，无 BLOCKED。

---

## 4. employee 映射结果

- 62 个 `grid_areas.personnel_id` 逐一对应 `employee.id`，全部为在职（`is_deleted=false`）员工。
- 绑定方向严格单向：`employee.id`（权威）← `users.employee_id`（引用），**不反向**。
- 最终 live grid 绑定覆盖率：62/62（100%）——每个 live 网格责任人都拥有了登录账号，且其 `employee_id` 与网格 `personnel_id` 指向同一员工。
- 历史巡查记录（`grid_inspection_records`）的 `inspector_employee_id` **未回填**（仍为 0 条非空），符合阶段纪律。

---

## 5. 手机号来源及脱敏规则

- **来源**：`employee.phone`（AES-256-GCM 加密存储，前缀 `ENC:`）。复用既有 `utils/encryption.js` 的 `decrypt()`，密钥与全系统一致（`DATA_ENCRYPTION_KEY` 或开发态默认密钥）。
- **未使用** `grid_areas.phone`（前期已确认该字段为空/非权威）。
- **脱敏规则**：报告与测试产物中手机号一律脱敏为 `138****3456` 形式（前 3 + `****` + 后 4），**绝不输出完整手机号、明文密码、身份证**。
- 新建账号存入 `users.phone` 的是**明文手机号**（与现有 admin 账号 `phone='13800138000'` 的既有约定一致）；此为系统既有行为，属已知观察项（见第 18 节）。

---

## 6. username 生成规则

冻结设计：`username = 姓氏拼音首字母 + 手机号后 4 位`。

- 示例：黄殿兴，`employee.phone` 解密后 `137****2660`（末 4 位已按脱敏规则保留） → 首字母 `h` + 后 4 位 `2660` → `h2660`；初始密码同为 `h2660`。（2026-09-17 补注：原文手机号已脱敏，避免真实 PII 入库。）
- **零依赖**：姓氏→首字母采用仅服务于本批次 62 人的静态映射表（30 个姓氏），**未引入任何拼音 npm 依赖**，未修改 employee/grid_areas 姓名，拼音不作为身份主键，不在业务查询中反向识别员工。
- 若姓氏不在映射表（理论上不会出现，因已覆盖全部 30 个实际姓氏），则生成失败并标记 BLOCKED；本次 62 人均命中。

---

## 7. Dry Run 结果

脚本：`server/scripts/_phase4_account_init_preflight.cjs`（仅读）。
产物：`server/scripts/output/phase4-preflight.json`。

| 动作 | 数量 |
| --- | --- |
| CREATE | 62 |
| ALREADY_BOUND | 0 |
| BIND_EXISTING | 0 |
| BLOCKED | 0 |
| 集内 username 重复 | 0 |
| 写入操作 | 0 |

---

## 8. admin 绑定结果

- 查询 `public.users WHERE username='admin'`：`real_name='管理员'`、`role='admin'`、`employee_id=NULL`、`must_change_password=false`、`is_active=true`。
- 以 `real_name` 反查 `employee`：`[]`（无匹配，因"管理员"是系统占位名，非真实员工姓名）。
- 依据阶段4 纪律（禁止姓名猜测、相似匹配、手机号模糊、职位猜测；无法唯一确认即 BLOCKED）：**判定 `ADMIN_BINDING_BLOCKED`**。
- **未对 admin 做任何 UPDATE**，`employee_id` 仍为 NULL。如需后续绑定，须由用户明确提供 admin 对应的真实管理人员 employee 标识，且经唯一数据关系确认。

---

## 9. 正式初始化结果

脚本：`server/scripts/_phase4_account_init.cjs`（带 `--apply` 写保护开关；无 `--apply` 仅打印计划）。
产物：`server/scripts/output/phase4-init-result.json`。

| 项 | 值 |
| --- | --- |
| 模式 | APPLY（真正写库） |
| 角色 | `manager` |
| 新建账号 | 62 |
| 已绑定跳过（ALREADY_BOUND） | 0 |
| BLOCKED | 0 |
| admin 绑定 | ADMIN_BINDING_BLOCKED |
| 事务 | 单事务 BEGIN→COMMIT，全部成功 |

新建账号字段：
- `username` = 姓氏首字母 + 手机后 4 位
- `password_hash` = `bcryptjs.hash(username, 10)`
- `real_name` = employee 姓名
- `role` = `manager`
- `department` = 网格所属 township
- `phone` = 解密后的明文手机号
- `is_active` = true
- `employee_id` = 对应 employee.id
- `must_change_password` = true

---

## 10. 幂等验证

- 设计：以 `employee_id` 为键。已存在绑定该 `employee_id` 的账号则跳过（`ALREADY_BOUND`），不重复创建。
- 二次执行（`--apply` 再跑一次）：`created=0`、`alreadyBound=62`、BLOCKED=0、users 总数仍为 63。
- 证明脚本可安全重复运行，不会因重跑产生重复账号。

---

## 11. bcrypt 验证

- 全部 62 个新账号密码以 `bcryptjs` 哈希存储，`password_hash` 前缀 `$2b$`、长度 60，**非明文**。
- 数据库层确认 `users` 表无明文密码列残留；日志/报告/测试产物均未输出明文密码。

---

## 12. must_change_password 验证

- 新建 62 个 `manager` 账号 `must_change_password` 全部 = `true`。
- 现有 admin 账号 `must_change_password` 保持 `false`（未改动）。
- **未**把任何现有账号批量设为 `must_change_password=true`，符合第 13 节纪律。

---

## 13. resolver 验证

取新建账号（如 `id=101, username=s5496, employee_id=7931`）调用正式解析器 `authenticatedEmployeeResolver.resolveAuthenticatedEmployee`：

```json
{ "ok": true, "userId": 101, "employeeId": 7931, "employeeName": "苏书红" }
```

→ 登录链 `req.user.id → users.employee_id → employee.id` 解析正常，**未修改 JWT**（JWT 仍为 `{id,username,role,realName,jti}`，未加入 employeeId/gridId）。

---

## 14. 回滚验证

- 测试钩子 `--fail-after N`：在成功插入第 N 个账号后故意抛错。
- 实测 `--fail-after 5`：插入 5 个后抛错，触发 `ROLLBACK`，最终 `users` 计数仍为 1（执行前基线），**无半成品账号残留**。
- 证明事务边界正确，任一环节异常均整体回滚。

---

## 15. WPS 零写入验证

- `grid_record_sync_map` 行数：执行前后均为 **2051**，不变。
- `grid_inspection_records` 行数：执行前后均为 **2051**，不变。
- `WPS_GRID_DATA_SOURCE=true` / `WPS_GRID_SYNC=false` 未改动。
- `wps/*`、`wpsFieldMap`、`wpsGridSyncService`、WPS 数据、历史 WPS 记录（含 327 条 `grid_id=NULL` 批次）均未触碰。
- 本阶段 WPS 写入 / 删除 / 更新 = 0。

---

## 16. 回归测试

为解决"阶段4 真实绑定占用 employee_id 导致历史测试夹具冲突"问题，**仅修改了 3 个历史测试脚本的夹具取数逻辑**（动态排除已绑定 `employee_id` 集合），未改任何生产代码：

| 阶段 | 脚本 | 结果 |
| --- | --- | --- |
| 阶段0 | `_phase0_apply_verify.cjs` | `PHASE_0_VERIFY_PASS` |
| 阶段1 | `_phase1_identity_test.cjs` | `PHASE_1_TEST_PASS (22/22)` |
| 阶段2 | `_phase2_pg_create_test.cjs` | `PHASE_2_TEST_PASS (26/26)` |
| 3-B-1 PG | `_phase3b1_pg_test.cjs` | `PHASE_3B1_PG_TEST_PASS (34/34)` |
| 3-B-1 WPS | `_phase3b1_wps_test.cjs` | `PHASE_3B1_WPS_TEST_PASS (22/22)` |

> 冲突根因：旧夹具写死 `SELECT ... employee ORDER BY id LIMIT 1` 取到的首个员工（如 6692 黄殿兴），现已被阶段4 绑成真实账号，测试再插同 `employee_id` 触发 `ux_users_employee_id` 部分唯一索引冲突。修复后夹具自动选取"未被 62 人绑定"的员工，回归全绿。

---

## 17. 数据库最终统计

| 指标 | 值 |
| --- | --- |
| `users` 总数 | 63（1 admin + 62 manager） |
| `manager` 角色账号 | 62 |
| 已绑定 `employee_id` 的 users | 62 |
| 重复 username | 0 |
| 重复 `employee_id`（非 NULL） | 0 |
| `manager` 中 `employee_id` 为 NULL | 0 |
| live grid 总数 / 已绑定账号 | 62 / 62（100%） |
| `grid_inspection_records.inspector_employee_id` 非空 | 0（未回填） |
| `grid_record_sync_map` | 2051（不变） |
| `grid_inspection_records` | 2051（不变） |
| admin.employee_id | NULL（ADMIN_BINDING_BLOCKED，未改） |

---

## 18. 未解决问题

1. **admin 绑定悬而未决**：`admin.real_name='管理员'` 无唯一 employee 对应，按纪律 BLOCKED。后续如需绑定，必须由用户明确给出 admin 对应的真实管理人员 employee 标识，并经唯一数据关系验证。
2. **历史巡查记录 `inspector_employee_id` 仍全 NULL**：阶段2 仅确保"新建 PG 记录后端派生"，历史 2051 条（含 327 条 WPS 迁入 + 1724 + 12）未回填——属后续阶段，本阶段不回填。
3. **`users.phone` 明文存储**：与既有 admin 约定一致，但相对 `employee.phone` 的加密存储是弱项，列为观察项（不在本阶段范围）。
4. **62 个新建账号目前无行级数据范围**：因阶段3-B-2 尚未实施，这些 `manager` 账号当前拥有 view/create/update 权限但**无 own_grid 过滤**——在未上行级 scope 前，其 view 仍能看到全部网格记录（功能权限已生效，数据范围待补）。

---

## 19. 风险

- **R1（中）行级 scope 未上前的横向可见性**：62 个 manager 当前 view 全部网格记录。阶段3-B-2 须尽快补齐 `own_grid` 过滤，否则出现"能看到非本人网格"的越权可见。
- **R2（低）初始密码可推断**：初始密码=username=姓氏首字母+手机后4位，而手机后4位在系统内可获取。虽强制 `must_change_password=true`（首次登录须改），但弱口令窗口期存在。建议上线后强调首次登录改密，或后续评估增强初始密码熵。
- **R3（低）admin 无 employee 绑定**：在仍走 WPS 分支的生产路径下无影响；一旦切换 PG 或启用"按 employee_id 派生身份"的链路，admin 因 `employee_id=NULL` 会被阶段2 的 fail-closed 拦截（与历史阶段结论一致，须与阶段切换同批处理）。

---

## 20. 下一阶段建议

- **阶段3-B-2（优先）**：实现 `own_grid` 行级数据范围（`gridScope`），在 GET/PUT/DELETE 拼入 scope 片段；同时按阶段3-A 冻结方案由后端按 `inspector_employee_id` 反查本人网格派生 `grid_id`（因 `GRID_RECORD_CREATE_CAMELS` 不含 `gridId`，新建记录 `grid_id` 当前恒 NULL）。
- **admin 绑定**：待用户明确管理人员对应关系后，单独评估绑定（属低风险、需显式指令）。
- **历史身份回填**：阶段5 评估 327/1724/12 条 `inspector_employee_id` 回填，须在行级 scope 与账号体系稳定后进行。
- **WPS→PG 切换**：阶段6，须与本阶段账号绑定、阶段3-B-2 行级 scope 同批上线，避免 fail-closed 误伤。

---

## 附录：姓氏→首字母静态映射（本批次 30 个）

```
黄h 张z 刘l 韩h 孙s 杨y 李l 郭g 靳j 谢x 王w 车c 回h 林l 翟z
康k 陈c 苏s 商s 于y 苑y 邢x 傅f 赵z 占z 崔c 鲍b 盖g 马m 高g
```

## 最终状态

```text
PHASE_4_COMPLETED_READY_FOR_PHASE_3B2
```

- 62 个网格负责人账号已创建并稳定绑定 `employee_id`（覆盖率 100%，零重复、零歧义）。
- 全部真机验证通过：计数 / 唯一性 / bcrypt / 幂等 / 回滚 / resolver / WPS 零写入。
- 阶段0/1/2/3-B-1 回归全绿。
- admin 按纪律 `ADMIN_BINDING_BLOCKED`，未改动。

> 本阶段严格停止于"账号创建 + 绑定"。未自动进入阶段3-B-2 / 行级 scope / grid_id 派生 / 历史回填 / WPS-PG 切换。下一阶段须等待明确指令。

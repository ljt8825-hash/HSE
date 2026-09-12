# WPS-PG-SYNC-05-FREEZE：生产冻结声明

- 冻结时点：2026-09-12 12:17（Asia/Shanghai）
- 冻结性质：**STRICT READ-ONLY FREEZE**——本文件为架构与基线的正式冻结记录，后续 HSE 业务开发不得随意触碰本层。
- 冻结时点证据：`server/scripts/output/wpssync05g3-final-verify.json`（46 项检查全 PASS，快照 at=2026-09-12T04:17:45Z）+ `05h0-frozen-evidence.txt`。

---

## 1. 冻结范围

以下组件自冻结时点起进入冻结态，除明确缺陷修复或独立授权外，不得在普通业务 Sprint 中修改：

```text
WPS Client           （server/services/wpsClient.js）
WPS Adapter
WPS Field Map        （server/services/wps/wpsFieldMap.js，SYNC_PROJECTION 23 项 / hash 18 列顺序不可变）
Pull Engine          （server/services/wpsGridPullEngine.js，唯一实现）
Sync Scheduler
Sync Facade          （server/services/wpsGridSyncService.js）
Authenticated Employee Resolver（authenticatedEmployeeResolver.js）
Grid inspection identity chain（gridScope.js + req.user.id→users.employee_id→employee.id→inspector_employee_id）
Production lifecycle  （HSE-Backend + prod-launch.cjs + logs/prod-service-console.log）
HSE-Backend           （Task Scheduler SYSTEM 看护任务）
```

## 2. 正式架构（不可逆）

```text
WPS
 ↓
One-way Pull（每 15 分钟，幂等，fail-safe 键省略）
 ↓
PostgreSQL
 ↓
HSE
```

明确语义边界：

```text
WPS ≠ 权限源
WPS ≠ 正式身份源
WPS ≠ grid_id 来源
WPS ≠ inspector_employee_id 来源
WPS DELETE ≠ PG DELETE（WPS 删除只统计，绝不删 PG）
PG ≠ 自动反写 WPS（reverseWriteEnabled=false，/push 恒 410）
```

## 3. 冻结时点生产基线（2026-09-12 12:17 实测）

| 项 | 值 |
|---|---|
| 5876 监听 | 唯一 PID **23396**（node.exe / Session 0 / PPID=2356 svchost，创建 11:52:27） |
| 5876 Owner | **HSE-Backend (SYSTEM) → prod-launch.cjs → node app.js** |
| HSE-Backend | Running（SYSTEM / AtStartup+每分钟触发 / IgnoreNew / RestartCount=3 / ExecutionTimeLimit=PT0S；沙箱 SD 过滤不可枚举，提权铁证见 05-G-1C Transcript 与 05-G-2 演练 STEP 0） |
| Scheduler | .env 三闸 `WPS_GRID_DATA_SOURCE=false / WPS_GRID_SYNC=true / SCHEDULER_ENABLED=true`（md5 `d14a9690…`）；/status running=false（当前无 Pull 进行中） |
| 安全开关 | reverseWriteEnabled=false / deleteSyncEnabled=false / exclusions=[BT,EA] / hashScopeColumns=18 |
| grid_inspection_records | **2061**（MAX id=7192） |
| grid_record_sync_map | **2061**（conflicts=0 / sync_hash NULL=0） |
| grid_record_sync_state | **0 行** |
| 历史 NULL grid 指纹 | COUNT=327 / SUM=2275920 / MD5=`2668ce0c51f9f29b3e1272ba7cc56288` |
| 10 条人工绑定 | 7183→60/6789、7184→14/7437、7185–7190→6/6698、7191–7192→1/6692 |
| 绑定指纹（2061 条） | `052257e15f995349769c4bda84408b46` |
| WPS | **2063**；WPS-only = **BT、EA**（冻结排除项） |
| gt 终态 | 三边不存在（WPS gt=0 / sync_map gt=0 / PG 7217=0） |
| go 终态 | go.marker=NULL；PG 6796：marker=NULL、grid_id=1、inspector_employee_id=NULL、conflict=false |
| 旧应急任务 | wps05e3-launch = **NOT FOUND**（不重建、不恢复、不替换） |
| 开发/生产边界 | `G:\hse-dashboard\.trae\rules\prod-boundary.md`（05-G-3 固化：5876=生产，5173/5881=开发，AI 禁操作生产） |

## 4. 已完成阶段（全部 PRODUCTION CLOSED）

```text
05-A   单次 Pull 首验           ✅
05-B   第二次 Pull 幂等验证      ✅
05-C   受控新增/修改三边对账     ✅
05-D   Scheduler 安全审计        ✅
05-E   E-0→E-1A→E-1B+DECISION→E-2→E-3→E-4→E-5 全链 PASS（Scheduler 受控开启+稳定运行）
05-F   生产收口                  ✅ PHASE_WPS_PG_SYNC_05F_PRODUCTION_CLOSED
05-G-0 生命周期审计              ✅（锁定 TRAE sbox 抢管根因）
05-G-1 方案评估                  ✅ A_PLAN_READY（方案 D 定型）
05-G-1B 实施前门禁               ✅ READY_FOR_HUMAN_PRODUCTION_SWITCH
05-G-1C 注册与切换手册           ✅ READY_FOR_HUMAN_CUTOVER（PS5.1 Duration 缺陷实证修复）
05-G-1D 执行版 SYSTEM 接管验收   ✅ COMPLETED_READY_FOR_05G2
05-G-2 恢复演练                  ✅ DRILL_EFFECTIVE（硬杀后 10 秒自动拉回）
05-G-3 生命周期正式收尾          ✅ PHASE_WPS_PG_SYNC_05G3_COMPLETED_PRODUCTION_LIFECYCLE_CLOSED
```

**整体状态：PRODUCTION CLOSED + FROZEN（05-H-0）**

## 5. 已知技术债（仅记录，本阶段不处理）

```text
R1  nullPolicy        —— 引擎 fail-safe 键省略的 null 语义细化
R2  webhook secret    —— /webhook 鉴权加固
```

按独立授权推进，不在普通业务 Sprint 中顺手实现。

## 6. 后续开发原则

> **后续 HSE 业务开发必须以 PostgreSQL 正式数据为准。**

- WPS-PG-SYNC 属于**基础设施层**：除非出现明确缺陷或经过独立授权，不得在普通业务 Sprint 中修改。
- AI 开发工具边界：生产端口 5876 与开发端口 5173/5881 分离；禁止 AI 启停/杀死生产进程、操作 HSE-Backend、修改生产 `.env`、直写生产表、WPS 反向写、身份自动推断（详见 `.trae\rules\prod-boundary.md`）。
- 巡检口径：复用 `server/scripts/_wpssync05g3_final_verify.cjs`（46 项只读）与 `server/scripts/output/wpssync05d-baseline.json` 指纹集；幂等 Pull 零 DML 是正常态。

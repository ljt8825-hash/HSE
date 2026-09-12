# HSE-Backend 生产回滚操作手册

> 来源：WPS-PG-SYNC-05-G-1B §二十三 ｜ 创建：2026-09-12（05-G-1B 修订：覆盖推荐方案 D 看护任务 + 服务备选）
> ⚠ 本文档仅为预案，**禁止未经人工授权自动执行**。
> 回滚原则：`停看护任务 → 停生产进程 → 确认 5876 释放 → 应急启动器拉起 → health/status → 数据基线`

## 一、适用场景

| 场景 | 判据 |
| --- | --- |
| 看护任务启动失败 | Start-ScheduledTask 报错 / LastTaskResult≠0 |
| 启动后 health 异常 | `curl http://127.0.0.1:5876/api/health` 非 200（3 次 × 10s） |
| 数据基线漂移 | gir≠2061 / conflicts≠0 / 人工绑定漂移 / 新增未知行 |
| 端口争抢 | 5876 listener 震荡或双 listener |
| 任何未预期行为 | 以「先恢复可用性」为最高原则 |

## 二、回滚步骤（需管理员 PowerShell；⬆ 标注提权命令）

### 步骤 1：停看护任务（防止自动再拉起）⬆
```powershell
Stop-ScheduledTask -TaskName 'HSE-Backend'
Disable-ScheduledTask -TaskName 'HSE-Backend'   # 保留注册仅停用；如彻底回滚见步骤 2
```

### 步骤 2：如需彻底移除 ⬆
```powershell
Unregister-ScheduledTask -TaskName 'HSE-Backend' -Confirm:$false
```
（若曾按方案 A 注册过服务：`net stop HSE-Backend; sc delete HSE-Backend`）

### 步骤 3：确认 5876 释放
```powershell
Get-NetTCPConnection -LocalPort 5876 -State Listen -ErrorAction SilentlyContinue
```
期望：无输出。若仍有 PID 占用，**必须人工核验其身份（tasklist /FI "PID eq X" /V）后再决定**（禁止盲杀）。

### 步骤 4：应急启动器拉起（人工执行，任选其一）
- 方式 A（推荐）：任务计划程序手动运行 `wps05e3-launch`（detached 启动 `node app.js`，日志 `logs/wps05e3d-console.log`）
- 方式 B（最简）：终端 `cd /d G:\hse-dashboard\server && node app.js`（保持窗口）

### 步骤 5：健康验证
```powershell
curl http://127.0.0.1:5876/api/health     → {"status":"ok"}
```
admin Bearer 查 `/api/wps-grid-sync/status` → `syncEnabledByEnv=true、reverseWriteEnabled=false、deleteSyncEnabled=false`

### 步骤 6：数据基线核验
对照 05-G-1B 报告 §H：gir=2061、sm=2061、MAX(id)=7192、conflicts=0、sync_hash NULL=0、历史 NULL grid=327（MD5 `2668ce0c51f9f29b3e1272ba7cc56288`）、人工 10 条绑定不变、WPS=2063、WPS-only=[BT,EA]、gt=0、go(6796).marker=NULL。

## 三、回滚后状态说明

回到「无守护」状态：5876 由手工/应急进程持有，TRAE 抢管风险恢复存在。**无数据损失**（Pull 全幂等、fail-safe 语义未变）。`.trae/rules/` 生产边界规则建议保留（与守护方式无关）。

## 四、遗留物说明

- `prod-launch.cjs`：保留（无副作用，仅被任务/服务调用时生效）
- `logs/prod-service-console.log`：保留作审计

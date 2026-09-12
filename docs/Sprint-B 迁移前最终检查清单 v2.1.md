# Sprint-B 迁移前最终检查清单 v2.1

> **版本**: v2.1
> **编制日期**: 2026-07-28
> **配套文档**: 《Sprint-B 数据迁移执行 Runbook v2.1》
> **用途**: 迁移执行前逐项确认，全部通过方可启动迁移

---

## 一、环境与权限检查

| # | 检查项 | 检查方式 | 目标 | 实际 | 通过 |
|---|--------|----------|------|------|------|
| E1 | 数据库连接权限 | `SELECT current_user` | 具备读写权限 | ____ | □ |
| E2 | 数据库 DDL 权限 | `CREATE TEMP TABLE test_check(x int); DROP TABLE test_check;` | 成功创建临时表 | ____ | □ |
| E3 | 后端服务已停止 | `pm2 status` 或 `systemctl status hse-backend` | stopped | ____ | □ |
| E4 | 无活跃业务连接 | `SELECT count(*) FROM pg_stat_activity WHERE datname='safety_dashboard' AND state='active'` | 仅当前会话 | ____ | □ |
| E5 | 备份目录可写 | 测试 `F:\backup\` 写入权限 | 可写入 | ____ | □ |
| E6 | Git Tag 已打 | `git tag -l "sprint-b-migration-pre"` | 标签存在 | ____ | □ |
| E7 | 紧急联系人已就绪 | 5 类角色全部到位 | 全部确认 | ____ | □ |
| E8 | 数据库锁检查（v2.1 新增） | `SELECT pid, mode FROM pg_locks WHERE mode='AccessExclusiveLock'` | 0 行 | ____ | □ |
| E9 | 活跃连接检查（v2.1 新增） | `SELECT count(*) FROM pg_stat_activity WHERE datname='safety_dashboard' AND state='active' AND pid<>pg_backend_pid()` | 0 行 | ____ | □ |
| E10 | Schema 版本检查（v2.1 新增） | 检查 employee/employee_assignment 表字段 | 字段列表匹配 | ____ | □ |

**负责人签字**: ______________ 日期: __________

---

## 二、数据库备份验证

| # | 检查项 | 检查方式 | 目标 | 实际 | 通过 |
|---|--------|----------|------|------|------|
| B1 | 全量备份文件存在 | `ls F:\backup\20260728_0200_safety_dashboard_full.dump` | 文件存在 | ____ | □ |
| B2 | 全量备份大小 | `ls -lh` | > 100MB | ____MB | □ |
| B3 | 关键表备份存在 | `ls F:\backup\20260728_0200_sprint_b_tables.dump` | 文件存在 | ____ | □ |
| B4 | 关键表备份大小 | `ls -lh` | > 1MB | ____MB | □ |
| B5 | 备份可恢复性测试 | `pg_restore -l F:\backup\20260728_0200_safety_dashboard_full.dump \| head` | 可列出内容 | ____ | □ |

**负责人签字**: ______________ 日期: __________

---

## 三、Step 0 迁移前强制检查

> **来源**: Runbook v2.1 第四章

| # | 检查项 | 检查 SQL / 方式 | 目标 | 实际 | 通过 |
|---|--------|-----------------|------|------|------|
| S1 | employee 表无 updated_by | `SELECT column_name FROM information_schema.columns WHERE table_name='employee' AND column_name='updated_by'` | 0 行 | ____ | □ |
| S2 | employee_assignment 表存在 | `SELECT COUNT(*) FROM information_schema.tables WHERE table_name='employee_assignment'` | 1 | ____ | □ |
| S3 | employee_assignment 当前数据量 | `SELECT COUNT(*), COUNT(CASE WHEN is_deleted=false THEN 1 END), COUNT(CASE WHEN created_by='system_migration_b2' THEN 1 END) FROM employee_assignment` | 记录基线 | ____ | □ |
| S4 | uk_emp_assign_primary 索引存在 | `SELECT indexdef FROM pg_indexes WHERE tablename='employee_assignment' AND indexname='uk_emp_assign_primary'` | 1 行，含 WHERE 子句 | ____ | □ |
| S5 | hse_employee_org 当前员工数 | `SELECT COUNT(DISTINCT employee_id) FROM hse_employee_org WHERE is_current=true AND is_deleted=false` | 记录基线 | ____ | □ |
| S6 | employee_assignment 当前员工数 | `SELECT COUNT(DISTINCT employee_id) FROM employee_assignment WHERE is_current=true AND is_deleted=false` | 记录基线 | ____ | □ |
| S7 | hse_employee_relation 当前员工数 | `SELECT COUNT(DISTINCT employee_id) FROM hse_employee_relation WHERE is_current=true AND is_deleted=false` | 记录基线 | ____ | □ |
| S8 | 迁移前数据差异 | `SELECT COUNT(DISTINCT ea.employee_id) FROM employee_assignment ea LEFT JOIN hse_employee_relation her ON ea.employee_id=her.employee_id AND her.is_deleted=false WHERE ea.is_deleted=false AND her.employee_id IS NULL` | 记录基线 | ____ | □ |
| S9 | hse_employee_org status 分布 | `SELECT status, COUNT(*) FROM hse_employee_org WHERE is_current=true AND is_deleted=false GROUP BY status` | 记录分布 | ____ | □ |
| S10 | hse_employee_relation status 分布 | `SELECT status, COUNT(*) FROM hse_employee_relation WHERE is_deleted=false GROUP BY status` | 记录分布 | ____ | □ |
| S11 | 迁移基线表已创建（v2.1 新增） | `SELECT COUNT(*) FROM migration_baseline WHERE migration_id LIKE 'B%_20260728'` | ≥ 4 条 | ____ | □ |
| S12 | 迁移备份注册表已创建（v2.1 新增） | `SELECT COUNT(*) FROM migration_backup_registry WHERE backup_id LIKE 'B%_20260728'` | ≥ 2 条 | ____ | □ |

### S3 数据量评估决策

- previous_migration_records > 0: ⚠️ 此前已执行过 B-2，需先回滚或确认覆盖
- current_active > 0 且 previous_migration_records = 0: ⚠️ 有非本 Runbook 数据，**必须人工审核**
- current_active = 0: ✅ 空表，可直接迁移

**决策结果**: □ 可直接迁移  □ 需人工审核  □ 需先回滚

**负责人签字**: ______________ 日期: __________

---

## 四、B-0 恢复检查

| # | 检查项 | 检查 SQL / 方式 | 目标 | 实际 | 通过 |
|---|--------|-----------------|------|------|------|
| B0-1 | 恢复前 employee 活跃数 | `SELECT COUNT(*) FROM employee WHERE is_deleted=false` | 记录基线 | ____ | □ |
| B0-2 | 恢复前 employee 软删数 | `SELECT COUNT(*) FROM employee WHERE is_deleted=true` | 记录基线 | ____ | □ |
| B0-3 | 可恢复员工数（并集） | `SELECT COUNT(*) FROM temp_b0_recover_ids` | 动态基线 | ____ | □ |
| B0-4 | 持久化备份表已创建（v2.1 新增） | `SELECT to_regclass('temp_b0_recover_ids_backup_20260728')` | 非 NULL | ____ | □ |
| B0-5 | 备份表记录数匹配 | `SELECT COUNT(*) FROM temp_b0_recover_ids_backup_20260728` | = B0-3 | ____ | □ |
| B0-6 | 恢复影响行数（DO 块自动校验） | 查看 RAISE NOTICE 输出 | 动态基线 ± 2% | ____ | □ |
| B0-7 | 临时表员工全部恢复 | `SELECT COUNT(CASE WHEN e.is_deleted=true THEN 1 END) AS still_deleted FROM temp_b0_recover_ids t JOIN employee e ON e.id=t.employee_id` | 0 | ____ | □ |
| B0-8 | 动态基线校验（v2.1 新增） | `SELECT status FROM migration_baseline WHERE migration_id='B0_20260728' AND metric_name='actual_recover_count'` | PASS | ____ | □ |
| B0-9 | relation→employee 完整性 | `SELECT COUNT(*) FROM hse_employee_relation her LEFT JOIN employee e ON her.employee_id=e.id AND e.is_deleted=false WHERE her.is_deleted=false AND e.id IS NULL` | 0 | ____ | □ |
| B0-10 | org→employee 完整性 | `SELECT COUNT(*) FROM hse_employee_org heo LEFT JOIN employee e ON heo.employee_id=e.id AND e.is_deleted=false WHERE heo.is_deleted=false AND heo.is_current=true AND e.id IS NULL` | 0 | ____ | □ |
| B0-11 | employee_code 唯一性 | `SELECT employee_code FROM employee WHERE is_deleted=false AND employee_code IS NOT NULL GROUP BY employee_code HAVING COUNT(*)>1` | 空结果 | ____ | □ |
| B0-12 | id_card 加密格式 | `SELECT id FROM employee WHERE is_deleted=false AND id_card IS NOT NULL AND id_card NOT LIKE 'ENC:%'` | 空结果 | ____ | □ |
| B0-13 | phone 加密格式 | `SELECT id FROM employee WHERE is_deleted=false AND phone IS NOT NULL AND phone NOT LIKE 'ENC:%'` | 空结果 | ____ | □ |
| B0-14 | B-0 回滚脚本就绪（策略 1/2） | 临时表或备份表存在 | 至少 1 个可用 | ____ | □ |
| B0-15 | B-0 回滚脚本就绪（策略 3） | 备份文件存在 | 文件可读 | ____ | □ |

**负责人签字**: ______________ 日期: __________

---

## 五、B-1 组织模型验证检查

| # | 检查项 | 检查 SQL | 目标 | 实际 | 通过 |
|---|--------|----------|------|------|------|
| B1-1 | relation→employee 关联 | `SELECT COUNT(*) FROM hse_employee_relation her LEFT JOIN employee e ON her.employee_id=e.id AND e.is_deleted=false WHERE her.is_deleted=false AND e.id IS NULL` | 0 | ____ | □ |
| B1-2 | position_id 有效性 | `SELECT COUNT(CASE WHEN p.id IS NULL THEN 1 END) FROM hse_employee_relation her LEFT JOIN position p ON her.position_id=p.id AND p.is_deleted=false WHERE her.is_deleted=false` | 0 | ____ | □ |
| B1-3 | org_unit_id 有效性 | `SELECT COUNT(CASE WHEN ou.id IS NULL THEN 1 END) FROM hse_employee_relation her LEFT JOIN hse_org_unit ou ON her.org_unit_id=ou.id AND ou.is_deleted=false WHERE her.is_deleted=false` | 0 | ____ | □ |
| B1-4 | operation_unit_id 有效性 | `SELECT COUNT(CASE WHEN her.operation_unit_id IS NOT NULL AND opu.id IS NULL THEN 1 END) FROM hse_employee_relation her LEFT JOIN hse_operation_unit opu ON her.operation_unit_id=opu.id AND opu.is_deleted=false WHERE her.is_deleted=false` | 0 | ____ | □ |

**负责人签字**: ______________ 日期: __________

---

## 六、B-2 迁移检查

| # | 检查项 | 检查 SQL / 方式 | 目标 | 实际 | 通过 |
|---|--------|-----------------|------|------|------|
| B2-1 | employee_assignment 备份已创建 | `SELECT COUNT(*) FROM employee_assignment_b2_backup_20260728` | ≥ 0（含空表） | ____ | □ |
| B2-2 | 迁移影响行数（DO 块自动校验） | 查看 RAISE NOTICE 输出 | 动态基线 ± 2% | ____ | □ |
| B2-3 | 异常记录数 | `SELECT COUNT(*) FROM b2_anomaly_log` | 记录数值 | ____ | □ |
| B2-4 | 迁移标记记录数 | `SELECT COUNT(*) FROM employee_assignment WHERE created_by='system_migration_b2'` | 动态基线 | ____ | □ |
| B2-5 | employee_assignment 总记录数 | `SELECT COUNT(*) FROM employee_assignment` | 动态基线 | ____ | □ |
| B2-6 | employee 关联完整性 | `SELECT COUNT(*) FROM employee_assignment ea LEFT JOIN employee e ON ea.employee_id=e.id AND e.is_deleted=false WHERE ea.is_deleted=false AND e.id IS NULL` | 0 | ____ | □ |
| B2-7 | position 关联完整性 | `SELECT COUNT(*) FROM employee_assignment ea LEFT JOIN position p ON ea.position_id=p.id AND p.is_deleted=false WHERE ea.is_deleted=false AND p.id IS NULL` | 0 | ____ | □ |
| B2-8 | org_unit 关联完整性 | `SELECT COUNT(*) FROM employee_assignment ea LEFT JOIN hse_org_unit ou ON ea.org_unit_id=ou.id AND ou.is_deleted=false WHERE ea.is_deleted=false AND ou.id IS NULL` | 0 | ____ | □ |
| B2-9 | op_unit 关联完整性 | `SELECT COUNT(*) FROM employee_assignment ea LEFT JOIN hse_operation_unit opu ON ea.operation_unit_id=opu.id AND opu.is_deleted=false WHERE ea.is_deleted=false AND ea.operation_unit_id IS NOT NULL AND opu.id IS NULL` | 0 | ____ | □ |
| B2-10 | her vs ea 数据差异 | `SELECT COUNT(DISTINCT her.employee_id) FROM hse_employee_relation her LEFT JOIN employee_assignment ea ON her.employee_id=ea.employee_id AND ea.is_deleted=false AND ea.is_current=true WHERE her.is_deleted=false AND her.is_current=true AND ea.employee_id IS NULL` | 0 | ____ | □ |
| B2-11 | UPSERT 覆盖范围已记录（v2.1 新增） | `SELECT COUNT(*) FROM employee_assignment ea JOIN employee_assignment_b2_backup_20260728 bak ON ea.id=bak.id WHERE ea.created_by='system_migration_b2' AND (ea.org_unit_id IS DISTINCT FROM bak.org_unit_id OR ea.position_id IS DISTINCT FROM bak.position_id)` | 记录数值 | ____ | □ |
| B2-12 | status 分布合理 | `SELECT status, COUNT(*) FROM employee_assignment WHERE is_deleted=false GROUP BY status` | 与源一致 | ____ | □ |
| B2-13 | employee_code 唯一性 | `SELECT employee_code FROM employee WHERE is_deleted=false AND employee_code IS NOT NULL GROUP BY employee_code HAVING COUNT(*)>1` | 空结果 | ____ | □ |
| B2-14 | 动态基线校验（v2.1 新增） | `SELECT status FROM (SELECT mb.metric_value AS expected, (SELECT COUNT(*) FROM employee_assignment WHERE created_by='system_migration_b2') AS actual, CASE WHEN ABS(actual - expected) <= expected * 0.02 THEN 'PASS' ELSE 'FAIL' END AS status FROM migration_baseline mb WHERE mb.migration_id='B2_20260728' AND mb.metric_name='actual_migrate_count') t` | PASS | ____ | □ |
| B2-15 | B-2 回滚脚本就绪（策略 1/2/3） | 备份表存在 | 至少 1 个可用 | ____ | □ |

**负责人签字**: ______________ 日期: __________

---

## 七、冻结与回滚就绪检查

| # | 检查项 | 检查方式 | 目标 | 实际 | 通过 |
|---|--------|----------|------|------|------|
| F1 | hse_employee_org 写入权限已撤销 | `\dp hse_employee_org` | 仅 SELECT | ____ | □ |
| F2 | personnel 表写入权限已撤销 | `\dp personnel` | 仅 SELECT | ____ | □ |
| F3 | 迁移记录表已创建 | `SELECT COUNT(*) FROM employee_assignment_migration_log` | ≥ 2（B2+FREEZE） | ____ | □ |
| F4 | B-0 回滚策略就绪 | 策略 1/2/3 至少 1 个可用 | 可用 | ____ | □ |
| F5 | B-2 回滚策略就绪 | 策略 1/2/3 至少 1 个可用 | 可用 | ____ | □ |
| F6 | 全量备份可用于恢复 | pg_restore 测试 | 可列出内容 | ____ | □ |

**负责人签字**: ______________ 日期: __________

---

## 八、代码切换就绪检查（迁移后执行）

| # | 检查项 | 检查方式 | 目标 | 实际 | 通过 |
|---|--------|----------|------|------|------|
| C1 | hse-employee.js 已切换 17 处 | 代码 diff 审查 | 17 处全部修改 | ____ | □ |
| C2 | 其他后端文件无需修改 | 确认已使用 employee_assignment | 6 个文件已迁移 | ____ | □ |
| C3 | OrgTransferModal.vue 已修改（v2.1 重点） | team_id 已替换为 org_unit_id/operation_unit_id | 字段已替换 | ____ | □ |
| C4 | employee.ts 类型已更新（v2.1 重点） | group_id 等 5 字段已清理 | 旧字段已清理 | ____ | □ |
| C5 | EmployeeSelector.vue 无需修改 | 确认已使用 org_unit_id | 已确认 | ____ | □ |
| C6 | 后端启动成功 | `pm2 logs hse-backend --lines 20` | 无错误 | ____ | □ |
| C7 | 员工列表查询正常 | `GET /api/hse-employee/` | 返回数据 | ____ | □ |
| C8 | 员工选择组件正常 | 前端 EmployeeSelector 加载 | 正常显示 | ____ | □ |
| C9 | 调岗功能正常 | `PUT /api/hse-employee/:id/transfer` | 成功 | ____ | □ |
| C10 | 员工导入正常 | `POST /api/hse-employee/import` | 成功 | ____ | □ |
| C11 | API 结构兼容验证（v2.1 新增） | 对比迁移前后 API 响应字段 | 字段一致 | ____ | □ |
| C12 | 前端旧字段扫描（v2.1 新增） | 全项目 grep team_id/group_id 等 | 无残留 | ____ | □ |

**负责人签字**: ______________ 日期: __________

---

## 九、最终确认与签字

### 9.1 检查项汇总

| 章节 | 检查项数 | 通过数 | 待处理 |
|------|----------|--------|--------|
| 一、环境与权限 | 10 | ____ | ____ |
| 二、数据库备份 | 5 | ____ | ____ |
| 三、Step 0 强制检查 | 12 | ____ | ____ |
| 四、B-0 恢复检查 | 15 | ____ | ____ |
| 五、B-1 组织模型验证 | 4 | ____ | ____ |
| 六、B-2 迁移检查 | 15 | ____ | ____ |
| 七、冻结与回滚就绪 | 6 | ____ | ____ |
| 八、代码切换就绪 | 12 | ____ | ____ |
| **总计** | **79** | ____ | ____ |

### 9.2 最终结论

```
□ 可以执行迁移（全部通过）
□ 修改后执行（存在待处理项）
□ 暂停执行（存在 P0 级未通过项）
```

### 9.3 签字确认

| 角色 | 姓名 | 签字 | 日期 |
|------|------|------|------|
| 数据迁移负责人 | | | |
| DBA | | | |
| 后端负责人 | | | |
| 前端负责人 | | | |
| QA 负责人 | | | |

---

## 附录 A: v2.0 → v2.1 修订记录

| # | 章节 | 修订内容 | 修订原因 |
|---|------|----------|----------|
| 1 | 第一章 | **新增 E8/E9/E10**（锁/连接/Schema） | 生产安全检查缺失 |
| 2 | 第三章 | **新增 S11/S12**（基线表/备份注册表） | 动态基线校验 |
| 3 | 第四章 | **新增 B0-4/B0-5**（持久化备份） | 会话断开风险 |
| 4 | 第四章 | **修改 B0-3/B0-6/B0-8**（动态基线） | 硬编码问题 |
| 5 | 第四章 | **新增 B0-15**（策略 3 回滚） | 回滚能力不完整 |
| 6 | 第六章 | **新增 B2-11/B2-14**（UPSERT 覆盖/动态基线） | UPSERT 风险 |
| 7 | 第六章 | **新增 B2-15**（回滚策略就绪） | 回滚能力不完整 |
| 8 | 第八章 | **新增 C3/C4 详细要求** | 前端字段残留问题 |
| 9 | 第八章 | **新增 C11/C12**（API 兼容/旧字段扫描） | 代码切换风险 |

---

## 附录 B: 关键 SQL 速查

### B.1 临时表状态检查

```sql
-- 检查 temp_b0_recover_ids 是否存在
SELECT to_regclass('pg_temp.temp_b0_recover_ids');

-- 检查临时表记录数
SELECT COUNT(*) FROM temp_b0_recover_ids;

-- 检查持久化备份表
SELECT to_regclass('temp_b0_recover_ids_backup_20260728');
SELECT COUNT(*) FROM temp_b0_recover_ids_backup_20260728;
```

### B.2 迁移进度速查

```sql
-- B-0 恢复进度
SELECT
    (SELECT metric_value FROM migration_baseline WHERE migration_id='B0_20260728' AND metric_name='recover_id_count') AS expected,
    (SELECT metric_value FROM migration_baseline WHERE migration_id='B0_20260728' AND metric_name='actual_recover_count') AS actual;

-- B-2 迁移进度
SELECT
    (SELECT metric_value FROM migration_baseline WHERE migration_id='B2_20260728' AND metric_name='her_current_count') AS source_count,
    (SELECT metric_value FROM migration_baseline WHERE migration_id='B2_20260728' AND metric_name='actual_migrate_count') AS migrated_count;
```

### B.3 应急回滚

```sql
-- B-2 应急回滚（策略 1）
DO $$
DECLARE deleted_count INTEGER;
BEGIN
    DELETE FROM employee_assignment WHERE created_by='system_migration_b2';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE '删除迁移记录数: %', deleted_count;
END $$;

-- B-0 应急回滚（策略 2：从备份表）
DO $$
DECLARE rollback_count INTEGER;
BEGIN
    UPDATE employee SET is_deleted=true, updated_at=NOW()
    WHERE id IN (SELECT employee_id FROM temp_b0_recover_ids_backup_20260728) AND is_deleted=false;
    GET DIAGNOSTICS rollback_count = ROW_COUNT;
    RAISE NOTICE '从备份表回滚记录数: %', rollback_count;
END $$;

-- 全量恢复（最后手段）
-- pg_restore -d safety_dashboard -c F:\backup\20260728_0200_safety_dashboard_full.dump
```

---

## 附录 C: 前端字段残留检查清单（v2.1 新增）

### C.1 OrgTransferModal.vue 检查

**文件路径**: `F:\hse-dashboard\安全看板vben\apps\web-antd\src\views\hse\employee\components\OrgTransferModal.vue`

**检查项**:
- [ ] L116: `form.team_id` → 已替换为 `org_unit_id`
- [ ] L200: `form.value.team_id` → 已同步修改
- [ ] L213: `payload.team_id` → 已同步修改

**修改建议**:
- `team_id` 应替换为 `org_unit_id`（部门/组织单元）
- 若需传递作业单元，增加 `operation_unit_id` 字段

### C.2 employee.ts 检查

**文件路径**: `F:\hse-dashboard\安全看板vben\apps\web-antd\src\api\hse\employee.ts`

**检查项**:
- [ ] L55-64: `EmployeeDetail.org` 接口中的旧字段已清理
  - `group_id`
  - `region_id`
  - `enterprise_id`
  - `project_id`
  - `team_id`
- [ ] L169-173: `OrgAssignFormData` 接口中的旧字段已清理

**修改建议**:
- 保留 `org_unit_id`（组织单元）
- 保留 `operation_unit_id`（作业单元，可选）
- 删除其他 5 个旧字段

### C.3 全项目扫描命令

```bash
# 扫描旧字段残留
grep -r "team_id\|group_id\|region_id\|enterprise_id\|project_id" \
  --include="*.vue" --include="*.ts" --include="*.js" \
  F:\hse-dashboard\安全看板vben\apps\web-antd\src

# 排除已确认的文件
grep -r "team_id\|group_id" \
  --include="*.vue" --include="*.ts" \
  F:\hse-dashboard\安全看板vben\apps\web-antd\src \
  | grep -v "OrgTransferModal.vue" \
  | grep -v "employee.ts"
```

---

> **使用说明**:
> 1. 本清单须与《Sprint-B 数据迁移执行 Runbook v2.1》配套使用
> 2. 每一项检查须由对应负责人签字确认
> 3. 任何 P0 级检查项未通过，必须暂停迁移并排查
> 4. 全部检查通过后方可进入下一阶段
> 5. v2.1 共 79 项检查，较 v2 增加 10 项
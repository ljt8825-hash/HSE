# Sprint-B Production Migration Checklist

> **版本**: v1.1
> **编制日期**: 2026-07-28
> **用途**: 生产环境数据迁移前的最终检查清单
> **修订说明**: v2.1 整改项完成后新增 4 项关键检查

---

## 执行前（Pre-Migration）

### 环境与权限

- [ ] 数据库服务器已确认
- [ ] 数据库版本为 PostgreSQL 14+
- [ ] 已获取数据库读写 + DDL 权限
- [ ] 应用服务已停止（停机维护窗口）
- [ ] 活跃连接数为 0（`pg_stat_activity` 检查通过）

### 数据库备份

- [ ] `employee` 表已完整备份
- [ ] `employee_assignment` 表已完整备份
- [ ] `hse_employee_relation` 表已完整备份
- [ ] 备份文件已验证可恢复
- [ ] 备份文件存储位置已记录

### 迁移基础设施

- [ ] `migration_baseline` 表已创建
- [ ] `migration_backup_registry` 表已创建
- [ ] Step 0 锁检查通过
- [ ] Step 0 活跃连接检查通过
- [ ] Step 0 Schema 版本确认（`employee`, `employee_assignment` 字段完整）
- [ ] `employee` 表无 `updated_by` 字段（已确认不依赖）

### v2.1 整改项检查（CONDITIONAL PASS 修复项）

- [ ] **`uk_emp_assign_primary` 已确认**<br>
  检查 SQL:
  ```sql
  SELECT indexname, indexdef FROM pg_indexes WHERE tablename='employee_assignment' AND indexname='uk_emp_assign_primary';
  ```
- [ ] **`baseline` NULL 校验已修复**<br>
  已确认 B-0 Step 3 与 B-2 Step 2 的 `DO $$` 块中包含 `IF baseline_count IS NULL THEN RAISE NOTICE '基线不存在，跳过动态校验'` 分支
- [ ] **`hse_employee_relation` 无重复当前关系**<br>
  检查 SQL:
  ```sql
  SELECT employee_id, COUNT(*) FROM hse_employee_relation WHERE is_deleted=FALSE AND is_current=TRUE GROUP BY employee_id HAVING COUNT(*) > 1;
  ```
- [ ] **`status` 枚举已确认**<br>
  已确认 `hse_employee_relation.status` 所有值均已在《Sprint-B-v2.1-Status-Mapping.md》中明确映射，且业务方已签字

### 关键约束检查（P0 级阻断项）

- [ ] **`uk_emp_assign_primary` 唯一约束存在且定义正确**<br>
  ```sql
  SELECT indexname, indexdef FROM pg_indexes WHERE tablename='employee_assignment' AND indexname='uk_emp_assign_primary';
  ```
- [ ] 如果约束不存在，已提前创建：<br>
  ```sql
  CREATE UNIQUE INDEX uk_emp_assign_primary ON employee_assignment (employee_id) WHERE is_primary=TRUE AND is_current=TRUE AND is_deleted=FALSE;
  ```

### B-0 恢复准备

- [ ] `hse_employee_relation` 与 `employee` 的关联完整性已检查（无孤儿引用）
- [ ] `hse_employee_org` 与 `employee` 的关联完整性已检查
- [ ] B-0 恢复 ID 临时表 `temp_b0_recover_ids` 已创建
- [ ] B-0 恢复 ID 持久化备份表 `temp_b0_recover_ids_backup_20260728` 已创建
- [ ] 恢复基线数据已记录（`recover_id_count`）

### B-2 迁移准备

- [ ] `hse_employee_relation` 中 `status` 枚举值已统计（确保 CASE WHEN 覆盖所有值）
- [ ] `hse_employee_relation` 中无重复 `(employee_id, is_primary, is_current=true)` 记录<br>
  ```sql
  SELECT employee_id, COUNT(*) FROM hse_employee_relation WHERE is_deleted=FALSE AND is_current=TRUE GROUP BY employee_id HAVING COUNT(*) > 1;
  ```
- [ ] `position_id` 有效性已检查（无孤儿引用）
- [ ] `org_unit_id` 有效性已检查
- [ ] `employee_assignment` 迁移前备份 `employee_assignment_b2_backup_20260728` 已创建
- [ ] 迁移基线数据已记录（`her_current_count`, `ea_before_count`）

### 回滚就绪

- [ ] B-2 回滚策略 2 已演练通过
- [ ] B-0 回滚策略 2 已演练通过
- [ ] 回滚脚本已准备就绪并单独保存
- [ ] 回滚预计耗时已评估

---

## 执行中（During-Migration）

### B-0 执行

- [ ] B-0 Step 1: 恢复前数据快照已记录
- [ ] B-0 Step 2: `temp_b0_recover_ids` 临时表已创建并填充
- [ ] B-0 Step 2: `temp_b0_recover_ids_backup_20260728` 持久化备份已创建
- [ ] B-0 Step 3: 恢复 SQL 已执行（`UPDATE employee SET is_deleted=false`）
- [ ] B-0 Step 3: 恢复行数与基线比对误差在 2% 以内
- [ ] B-0 Step 4: 恢复后验证通过
  - [ ] `still_deleted = 0`
  - [ ] 动态基线校验 `status = 'PASS'`
  - [ ] `missing_employee_refs = 0`

### B-1 验证

- [ ] `employee_relation → employee` 关联完整性通过
- [ ] `position_id` 有效性通过
- [ ] `org_unit_id` 有效性通过
- [ ] `operation_unit_id` 有效性通过

### B-2 执行

- [ ] B-2 Step 1: `employee_assignment` 迁移前备份已创建
- [ ] B-2 Step 2: 迁移 SQL 已执行（`INSERT ... ON CONFLICT ON CONSTRAINT`）
- [ ] B-2 Step 2: 迁移行数与基线比对误差在 2% 以内
- [ ] B-2 Step 2: 异常记录已导出（`b2_anomaly_log`）
- [ ] B-2 Step 3: 异常记录已审核

### 数据一致性检查

- [ ] 动态基线验证通过（`migration_baseline` 校验）
- [ ] `employee_assignment → employee` 关联完整性通过
- [ ] `employee_assignment → position` 关联完整性通过
- [ ] `employee_assignment → hse_org_unit` 关联完整性通过
- [ ] UPSERT 覆盖范围已评估（`overwritten_records` 数量在可接受范围）

---

## 执行后（Post-Migration）

### 系统启动

- [ ] 应用服务已启动
- [ ] 前端服务已启动
- [ ] 后端 API 健康检查通过

### 前端功能验证

- [ ] 员工列表查询正常（数据从 `employee_assignment` 读取）
- [ ] 员工选择组件正常
- [ ] 调岗功能正常（写入 `employee_assignment`）
- [ ] 员工导入功能正常
- [ ] 前端控制台无严重错误

### HSE 人员组织关系验证

- [ ] 预警中心的人员组织关系查询正常
- [ ] 风险画像中心的组织架构查询正常
- [ ] 三违管理的人员关联查询正常
- [ ] 培训模块的员工关联查询正常

### 员工权限验证

- [ ] 员工登录后权限加载正常
- [ ] 基于 `employee_assignment` 的部门权限过滤正常
- [ ] 岗位权限关联正常

### 看板数据验证

- [ ] 安全看板员工数据展示正确
- [ ] 各中心人员统计数据正确
- [ ] 数据一致性检查（对比迁移前后关键指标）通过

### 72 小时观察期启动

- [ ] 观察期已启动（T+0）
- [ ] 观察指标监控已配置
- [ ] 数据负责人已分配

---

## 回滚触发条件

> **如果出现以下任一情况，立即启动回滚流程：**

- [ ] 迁移 SQL 执行失败且无法在 10 分钟内修复
- [ ] 数据一致性验证失败且影响范围 > 10%
- [ ] 前端功能验证大面积失败（> 3 个核心功能）
- [ ] 72 小时观察期内核心指标连续 2 小时不达标
- [ ] 业务方报告严重数据错误

**回滚执行**:
1. 评估影响范围（B-0 / B-2 / 全量）
2. 选择回滚策略（参考《Sprint-B 回滚演练记录》第七章）
3. 执行回滚 SQL
4. 验证回滚结果
5. 通知相关人员
6. 记录回滚日志

---

## 最终签字

> 🔒 **禁止代签**：以下签字栏须由对应角色人工亲签，禁止任何自动化脚本或第三方代签。

| 角色 | 姓名 | 签字 | 日期 |
|------|------|------|------|
| 数据迁移负责人 | | | |
| DBA | | | |
| 后端负责人 | | | |
| 前端负责人 | | | |
| QA 负责人 | | | |
| 项目负责人 | | | |

---

> **文档结束**
>
> 本 Checklist 用于生产迁移前的最终确认，所有项目必须逐项检查并签字确认。任何 P0 级阻断项未通过，均禁止进入生产迁移。
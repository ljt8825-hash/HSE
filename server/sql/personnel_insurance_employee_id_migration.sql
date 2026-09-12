-- ============================================================================
-- 迁移：personnel_insurance 从姓名/旧 personnel_id 关联收敛到稳定 employee_id
-- 文件：personnel_insurance_employee_id_migration.sql（任务8，离线幂等分阶段）
-- 目标：employee 为唯一人员主表；跨模块人员关联使用 employee.id；
--       对外字段 employeeId；数据库字段 employee_id。
--
-- ⚠️ 重要声明：
--   - 本文件【仅创建，未执行】。执行需人工按阶段顺序进行，并在执行前备份数据库。
--   - 本文件不包含任何按姓名自动回填（禁止 UPDATE ... JOIN employee ON person_name = name）。
--   - 现有 personnel_id 不得盲目复制为 employee_id；只有能由代码来源或唯一映射
--     表证明其确实为 employee.id 的记录才可进入候选更新，其余进入待人工匹配清单。
--   - 当前轮【不得删除】personnel_id 字段；删除条件见阶段五。
--
-- 人工操作顺序（任务8，提示词08：列/索引 → 回填 → 核验 → 外键 → 收紧）：
--   阶段一：增加可空 employee_id/快照列与必要索引（幂等；可重复执行）
--   阶段二：仅按确定性旧 ID/人工确认映射回填（禁止姓名自动匹配；人工逐条核验后执行）
--   阶段三：只读核验未匹配/孤儿/重复/覆盖率（可重复执行；满足门槛后再进入阶段四）
--   阶段四：添加 NOT VALID 外键并 VALIDATE CONSTRAINT
--           ⚠️ 外键 DDL 需事务外/人工分步执行，不得把不可自动连续执行的内容伪装成已完成迁移
--   阶段五：验证达标后才考虑非空、停读/移除旧字段
--   回退：见文件底部 rollback 段。
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 阶段一：增加可空 employee_id 列与快照列（幂等；可重复执行）
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE personnel_insurance ADD COLUMN IF NOT EXISTS employee_id BIGINT;

-- 运行代码依赖的快照列：person_name 旧表已存在；department/position 可能缺失。
-- 类型与现有代码 COALESCE/NULLIF 用法兼容；默认 NULL 由服务端快照写入。
ALTER TABLE personnel_insurance ADD COLUMN IF NOT EXISTS department VARCHAR(100);
ALTER TABLE personnel_insurance ADD COLUMN IF NOT EXISTS position VARCHAR(100);

-- 未删除记录上的索引（支撑员工-险种确定性选择与未匹配查询）
CREATE INDEX IF NOT EXISTS idx_personnel_insurance_employee_id
  ON personnel_insurance (employee_id)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_personnel_insurance_emp_type_current
  ON personnel_insurance (employee_id, insurance_type)
  WHERE is_deleted = false;

-- 旧 personnel_id 上的现有索引（兼容期保留，阶段五再评估）
CREATE INDEX IF NOT EXISTS idx_personnel_insurance_personnel_id
  ON personnel_insurance (personnel_id)
  WHERE is_deleted = false;

-- ═══════════════════════════════════════════════════════════════════════════
-- P0 并发防护：部分唯一索引
-- 目的：防止跨请求并发 INSERT 导致同一员工+险种出现多条 is_current=true 记录
-- 条件：仅 is_current=true AND is_deleted=false AND employee_id IS NOT NULL 的记录参与唯一性
-- 注意：employee_id 为 NULL 的存量历史记录不参与约束（迁移回填期间可安全创建）
-- ═══════════════════════════════════════════════════════════════════════════

-- 【预发验证】创建唯一索引前必须先运行此查询，确认返回 0 行冲突
-- 若有冲突，需人工清理重复记录后再创建唯一索引
SELECT employee_id, insurance_type, COUNT(*) AS duplicate_count,
       array_agg(id ORDER BY id) AS duplicate_ids
  FROM personnel_insurance
 WHERE employee_id IS NOT NULL
   AND is_current = true
   AND is_deleted = false
 GROUP BY employee_id, insurance_type
HAVING COUNT(*) > 1;

-- 创建部分唯一索引（幂等；employee_id IS NOT NULL 条件保证迁移期可安全执行）
CREATE UNIQUE INDEX IF NOT EXISTS idx_personnel_insurance_unique_active
  ON personnel_insurance (employee_id, insurance_type)
  WHERE is_current = true AND is_deleted = false AND employee_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 阶段二：确定性回填（仅人工确认候选后执行；不按姓名自动匹配）
-- ────────────────────────────────────────────────────────────────────────────
-- 候选来源（需人工逐条核对后执行，不可直接批量执行）：
--   a) generate-from-pending / 批量导入等代码路径写入的 personnel_id —— 需由
--      代码审查确认其写入的就是 employee.id（当前 generate-from-pending 写入
--      v_employee_current.employee_id 到 personnel_id，语义含混，须人工核验）。
--   b) 唯一映射表（若存在）能证明 personnel_id == employee.id 的记录。
--   c) 通过业务单号/身份证（稳定业务标识）匹配的确定性清单。
--
-- 模板（人工将 :employeeId 替换为核验后的值；禁止整体执行）：
--   UPDATE personnel_insurance p
--      SET employee_id = :employeeId
--    WHERE p.id = :insuranceRecordId
--      AND p.employee_id IS NULL
--      AND NOT EXISTS (
--        SELECT 1 FROM personnel_insurance q
--         WHERE q.employee_id = :employeeId
--           AND q.insurance_type = p.insurance_type
--           AND q.is_current = true
--           AND q.is_deleted = false
--           AND q.id <> p.id
--      );

-- ────────────────────────────────────────────────────────────────────────────
-- 阶段三：只读核验 SQL（可重复执行；执行迁移前/后均建议运行）
--         满足以下门槛后才可进入阶段四（外键）：
--         - unlinked_active = 0（未关联在职记录清零）或已人工确认全部进入待匹配清单
--         - 无效 employee_id = 0（无孤儿）
--         - 重复当前保单 = 0（同 employee_id + 险种仅一条 is_current=true）
-- ────────────────────────────────────────────────────────────────────────────
-- 1) 总记录数 / 已关联 / 未关联
SELECT
  COUNT(*) AS total_records,
  COUNT(*) FILTER (WHERE is_deleted = false) AS active_records,
  COUNT(*) FILTER (WHERE employee_id IS NOT NULL) AS linked_records,
  COUNT(*) FILTER (WHERE employee_id IS NULL AND is_deleted = false) AS unlinked_active
FROM personnel_insurance;

-- 2) 无效 employee_id（外键不存在对应员工）
SELECT p.id, p.employee_id, p.person_name, p.insurance_type
  FROM personnel_insurance p
  LEFT JOIN employee e ON e.id = p.employee_id
 WHERE p.employee_id IS NOT NULL AND e.id IS NULL;

-- 3) 同名多候选（按姓名统计超过 1 个当前员工；仅用于人工核验，禁止按姓名回填）
SELECT e.name, COUNT(*) AS candidate_count
  FROM v_employee_current e
 GROUP BY e.name
HAVING COUNT(*) > 1;

-- 4) 一个旧 personnel_id 是否指向不同人员（同一 personnel_id 多条记录 ≠ 冲突：
--    同一员工可有多个险种/历史保单；仅当该 personnel_id 同时对应多个不同
--    employee 候选且无法判定身份时才标记冲突，交由人工核验）
SELECT personnel_id, COUNT(DISTINCT person_name) AS name_variants, COUNT(*) AS record_cnt
  FROM personnel_insurance
 WHERE personnel_id IS NOT NULL AND is_deleted = false
 GROUP BY personnel_id
HAVING COUNT(DISTINCT person_name) > 1;

-- 5) 重复当前保单（同一 employee_id + 险种多条 is_current=true，迁移后需清理）
SELECT employee_id, insurance_type, COUNT(*) AS cnt
  FROM personnel_insurance
 WHERE employee_id IS NOT NULL AND is_current = true AND is_deleted = false
 GROUP BY employee_id, insurance_type
HAVING COUNT(*) > 1;

-- ────────────────────────────────────────────────────────────────────────────
-- 阶段四：添加 NOT VALID 外键并 VALIDATE CONSTRAINT
-- ⚠️ 事务外/人工分步执行：NOT VALID 不校验存量，VALIDATE 会扫描存量数据；
--    必须先完成阶段二回填与阶段三核验（无孤儿/无未关联在职/无重复当前保单），
--    否则 VALIDATE 将失败。外键 DDL 不可自动连续执行，不得伪装成已完成迁移。
-- ⚠️ 不使用 ON DELETE CASCADE：不得级联删除人员保险历史。
-- ────────────────────────────────────────────────────────────────────────────
-- 说明：employee(id) 主键在 v59 迁移中已建立。
ALTER TABLE personnel_insurance
  DROP CONSTRAINT IF EXISTS fk_personnel_insurance_employee;

ALTER TABLE personnel_insurance
  ADD CONSTRAINT fk_personnel_insurance_employee
  FOREIGN KEY (employee_id) REFERENCES employee(id)
  ON DELETE RESTRICT NOT VALID;

-- 存量数据核验通过后执行：
ALTER TABLE personnel_insurance
  VALIDATE CONSTRAINT fk_personnel_insurance_employee;

-- ────────────────────────────────────────────────────────────────────────────
-- 阶段五：约束收紧（仅在前置核验通过后人工执行）
-- ────────────────────────────────────────────────────────────────────────────
-- 1) 未关联记录清零且外键 VALIDATE 通过后可设非空：
--    核验：SELECT COUNT(*) FROM personnel_insurance WHERE employee_id IS NULL AND is_deleted = false;
--    通过后：ALTER TABLE personnel_insurance ALTER COLUMN employee_id SET NOT NULL;

-- 2) 停止读取旧字段（代码切换为 employee_id 且观察稳定后）：
--    代码层删除对 personnel_id / person_name JOIN 的全部使用（本迁移配套代码已切换）。

-- 3) 删除旧字段/索引（代码完全停止读取后）：
--    DROP INDEX IF EXISTS idx_personnel_insurance_personnel_id;
--    ALTER TABLE personnel_insurance DROP COLUMN IF EXISTS personnel_id;

-- ────────────────────────────────────────────────────────────────────────────
-- 回退（逻辑回退，不删除任何保险数据；仅回滚结构变更）
-- ────────────────────────────────────────────────────────────────────────────
-- 若需要回退到纯 personnel_id 状态：
--   ALTER TABLE personnel_insurance DROP CONSTRAINT IF EXISTS fk_personnel_insurance_employee;
--   DROP INDEX IF EXISTS idx_personnel_insurance_unique_active;
--   DROP INDEX IF EXISTS idx_personnel_insurance_employee_id;
--   DROP INDEX IF EXISTS idx_personnel_insurance_emp_type_current;
--   ALTER TABLE personnel_insurance DROP COLUMN IF EXISTS employee_id;
-- 说明：employee_id 列可安全移除；personnel_insurance 数据行不受影响，
--       已回填的 employee_id 随列移除而消失（如需保留可先导出）。

-- ============================================================
-- HSE 人员主数据中心 Sprint5.1.1 生产加固迁移脚本
-- 版本: v60 (紧接 v59)
--
-- 加固内容:
--   1. employee_history 增加 operator_id (记录操作人)
--   2. employee 增加 id_card_hash / phone_hash (解决 AES-GCM 随机IV唯一性问题)
--
-- 依据: Sprint5.1.1 生产加固任务
-- 约束: 增量迁移，不删除字段，不修改已有数据结构
-- ============================================================

BEGIN;

-- ============================================================
-- 1. employee_history 增加 operator_id
-- ============================================================
ALTER TABLE employee_history ADD COLUMN IF NOT EXISTS operator_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_emp_history_operator
    ON employee_history(operator_id) WHERE is_deleted = false;

COMMENT ON COLUMN employee_history.operator_id IS '操作人ID（来自 req.user.id，记录谁执行了此次人事变动）';

-- ============================================================
-- 2. employee 增加 id_card_hash / phone_hash
-- ============================================================
-- 背景: AES-256-GCM 使用随机 IV，相同明文每次加密产生不同密文，
--       导致 SQL 层 WHERE id_card = $1 无法匹配已存在的密文，无法做唯一性校验。
-- 方案: 新增 HMAC-SHA256 哈希列（确定性哈希），相同明文+相同密钥产生相同哈希，
--       通过哈希列建立唯一索引实现唯一性校验。
ALTER TABLE employee ADD COLUMN IF NOT EXISTS id_card_hash VARCHAR(64);
ALTER TABLE employee ADD COLUMN IF NOT EXISTS phone_hash   VARCHAR(64);

-- 唯一索引（仅对非NULL值生效，避免历史NULL数据冲突）
DO $$ BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS uk_employee_idcard_hash
        ON employee (id_card_hash) WHERE id_card_hash IS NOT NULL AND is_deleted = false;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS uk_employee_phone_hash
        ON employee (phone_hash) WHERE phone_hash IS NOT NULL AND is_deleted = false;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

COMMENT ON COLUMN employee.id_card_hash IS '身份证号 HMAC-SHA256 哈希值（确定性，用于唯一性校验；与加密列id_card配合使用）';
COMMENT ON COLUMN employee.phone_hash   IS '手机号 HMAC-SHA256 哈希值（确定性，用于唯一性校验）';

COMMIT;

-- ============================================================
-- 验证查询
-- ============================================================
SELECT 'employee_history' AS table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'employee_history' AND column_name = 'operator_id'
UNION ALL
SELECT 'employee' AS table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'employee' AND column_name IN ('id_card_hash', 'phone_hash')
ORDER BY table_name, column_name;

-- ============================================================
-- 迁移说明
-- ============================================================
-- 1. 历史数据的 id_card_hash / phone_hash 字段为 NULL，不影响现有查询；
--    新增/更新员工时由应用层计算并写入哈希值。
-- 2. 如需为历史数据补齐哈希，可由应用层批量解密+哈希回填（不在本脚本范围）。
-- 3. operator_id 为 NULL 表示历史变动记录无操作人信息（兼容已有数据）。
-- 4. 后续所有 employee_history INSERT 必须传入 operator_id（来自 req.user.id）。

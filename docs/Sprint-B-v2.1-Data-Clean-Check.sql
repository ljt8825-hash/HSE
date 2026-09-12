-- ================================================================
-- Sprint-B v2.1 Data Clean Check
-- 用途: 在 B-2 迁移前检查 hse_employee_relation 中的脏数据
-- 位置: B-2 Step 1 之后, B-2 Step 2 之前
-- 严重级别: P0 阻断项
-- ================================================================

-- 检查是否存在重复的员工当前主岗位关系
-- 这些记录会导致 B-2 迁移时 ON CONFLICT 行为不确定

DO $$
DECLARE
    duplicate_count INTEGER;
BEGIN
    -- 创建临时表记录脏数据
    CREATE TEMP TABLE IF NOT EXISTS b2_dirty_data_check (
        employee_id BIGINT,
        duplicate_count BIGINT,
        detected_at TIMESTAMP DEFAULT NOW()
    );

    TRUNCATE b2_dirty_data_check;

    INSERT INTO b2_dirty_data_check (employee_id, duplicate_count)
    SELECT
        employee_id,
        COUNT(*) AS duplicate_count
    FROM hse_employee_relation
    WHERE is_deleted = false
      AND is_current = true
    GROUP BY employee_id
    HAVING COUNT(*) > 1;

    GET DIAGNOSTICS duplicate_count = ROW_COUNT;

    RAISE NOTICE '发现重复当前关系记录数: %', duplicate_count;

    IF duplicate_count > 0 THEN
        RAISE EXCEPTION 'B-2 迁移前发现 % 条员工存在重复当前关系, 必须先清洗数据。查询 b2_dirty_data_check 获取详情。', duplicate_count;
    END IF;
END $$;

-- 如果上述 DO 块成功执行（未抛出异常），说明无脏数据
-- 可继续执行 B-2 Step 2 迁移 SQL

-- ================================================================
-- 附加: 如果存在脏数据, 使用以下 SQL 查看详情
-- ================================================================

-- SELECT * FROM b2_dirty_data_check ORDER BY duplicate_count DESC;

-- ================================================================
-- 附加: 脏数据清洗脚本示例(需根据业务确认后执行)
-- ================================================================

-- 方案 A: 保留 start_date 最新的一条
-- WITH ranked AS (
--     SELECT
--         id,
--         employee_id,
--         start_date,
--         ROW_NUMBER() OVER (PARTITION BY employee_id ORDER BY COALESCE(start_date, '1900-01-01'::date) DESC, id DESC) AS rn
--     FROM hse_employee_relation
--     WHERE is_deleted = false AND is_current = true
-- )
-- UPDATE hse_employee_relation
-- SET is_current = false,
--     updated_at = NOW(),
--     remark = COALESCE(remark, '') || ' [Sprint-B 迁移前清洗: 非最新当前关系]'
-- WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 方案 B: 保留 id 最大的一条
-- WITH ranked AS (
--     SELECT
--         id,
--         employee_id,
--         ROW_NUMBER() OVER (PARTITION BY employee_id ORDER BY id DESC) AS rn
--     FROM hse_employee_relation
--     WHERE is_deleted = false AND is_current = true
-- )
-- UPDATE hse_employee_relation
-- SET is_current = false,
--     updated_at = NOW(),
--     remark = COALESCE(remark, '') || ' [Sprint-B 迁移前清洗: 非最新当前关系]'
-- WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ================================================================
-- 注意事项
-- ================================================================
-- 1. 本脚本必须在 B-2 Step 1 备份完成后执行
-- 2. 如果发现脏数据, 禁止直接执行 B-2 Step 2
-- 3. 清洗脚本必须在业务方确认后执行, 并记录清洗日志
-- 4. 清洗后必须重新执行本检查, 确认 duplicate_count = 0
-- ================================================================
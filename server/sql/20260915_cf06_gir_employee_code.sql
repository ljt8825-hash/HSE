-- =====================================================================
-- 迁移：CF-WPS-06 · grid_inspection_records 增加 employee_code 业务快照列
-- 日期：2026-09-15
-- 依据：CF-WPS-05 employee_code / employee.id 双键兼容审计报告
-- 阶段目标：让 WPS「员工编码」可经 Pull Engine 落到 PG，作为**移动端业务身份快照**，
--           供独立归因层（gridEmployeeCodeResolver）解析为 employee.id 使用。
-- ---------------------------------------------------------------------
-- 铁律（与 CF-WPS-06 任务书 §二 一致）：
--   employee_code        = 花名册员工编码（VARCHAR，移动端业务身份键）→ 本列
--   employee.id          = public.employee.id（BIGINT，PG 内部代理键）
--   inspector_employee_id= employee.id（BIGINT）—— **绝不允许** 写入 employee_code
--   本列**不是**身份列，不参与 `inspector_employee_id` 语义，不建立 FK。
-- ---------------------------------------------------------------------
-- 冻结兼容性论证（CF-WPS-06 第一步 + 第九步实测证据）：
--   * 本列追加在 SYNC_PROJECTION_ORDER **末尾（第 24 位）**，落在 18 列冻结 hash 段之外
--     （SYNC_HASH_COLUMNS = SYNC_PROJECTION_ORDER.slice(0, 18)），
--     ⇒ 不参与 canonicalHash，存量 2061 条 sync_hash 零漂移（实测 R1 2061/2061 命中，
--        R2/R3 追加 employee_code 及 WPS 新增「员工编码」字段后哈希 2061/2061 完全不变）。
--   * 本列**不进入** PROTECTED_COLUMNS，Pull Engine 可写（与 inspector_employee_id / grid_id 严格区分）。
-- ---------------------------------------------------------------------
-- 目标库：
--   · CF-WPS-06（2026-09-15）：已在隔离开发库 safety_dashboard_dev 演练通过。
--   · CF-WPS-07（2026-09-15）：经**用户显式授权「授权 CF-WPS-07 生产迁移」**，
--     由生产受护栏 runner `server/scripts/_cf07_migrate_prod.cjs` 对生产库
--     `safety_dashboard` 执行（DRY-RUN 默认 / --apply --confirm-production 双确认 /
--     迁移前后归因指纹零变化断言）。本文件**同一份 SQL** 同时作为 dev 与 prod 的迁移制品，
--     避免两份脚本漂移。
-- 幂等：ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS，可重复执行。
-- 回滚：见文件末尾。
-- =====================================================================

BEGIN;

-- 1) 业务快照列（nullable，无默认值 ⇒ 存量行保持 NULL，零业务行为改变）
ALTER TABLE public.grid_inspection_records
  ADD COLUMN IF NOT EXISTS employee_code varchar(64) NULL;

COMMENT ON COLUMN public.grid_inspection_records.employee_code IS
  '花名册员工编码（WPS「员工编码」业务快照，移动端业务身份键）。非身份列：严禁写入 inspector_employee_id；须经 gridEmployeeCodeResolver 解析为 public.employee.id 后方可用于归属。不参与 sync_hash（位于 18 列冻结 hash 段之外）。';

-- 2) 候选扫描用部分索引（**仅在有明确查询模式时新增**）
--    查询模式（唯一）：归因任务候选集
--      WHERE source_channel='mobile_h5' AND employee_code IS NOT NULL
--        AND inspector_employee_id IS NULL AND grid_id IS NULL
--    部分索引只覆盖「未归属」行，随归因完成自动缩小，写入开销极低。
--    若后续确认无需（表规模小、全表扫描成本可忽略），可直接 DROP：
--      DROP INDEX IF EXISTS public.idx_gir_employee_code_pending;
CREATE INDEX IF NOT EXISTS idx_gir_employee_code_pending
  ON public.grid_inspection_records(employee_code)
  WHERE employee_code IS NOT NULL
    AND inspector_employee_id IS NULL
    AND grid_id IS NULL;

-- 3) 断言：employee_code 列必须存在，且类型必须为 varchar（防静默漂移）
DO $$
DECLARE
  v_type text;
BEGIN
  SELECT data_type INTO v_type
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'grid_inspection_records'
     AND column_name = 'employee_code';
  IF v_type IS NULL THEN
    RAISE EXCEPTION 'CF-WPS-06 迁移失败：employee_code 列未创建（STOP）';
  END IF;
  IF v_type <> 'character varying' THEN
    RAISE EXCEPTION 'CF-WPS-06 迁移失败：employee_code 类型 % ≠ character varying（STOP）', v_type;
  END IF;
  RAISE NOTICE 'CF-WPS-06 迁移断言通过：grid_inspection_records.employee_code (%) 就绪', v_type;
END $$;

-- 4) 断言：employee_code **不得**出现在任何 FK / UNIQUE 约束中（它是快照，不是主数据键）
DO $$
DECLARE
  v_cnt int;
BEGIN
  SELECT count(*) INTO v_cnt
    FROM pg_constraint c
   WHERE c.conrelid = 'public.grid_inspection_records'::regclass
     AND c.contype IN ('f', 'u')
     AND pg_get_constraintdef(c.oid) ILIKE '%employee_code%';
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'CF-WPS-06 迁移失败：employee_code 被错误地纳入 FK/UNIQUE 约束（STOP）';
  END IF;
END $$;

COMMIT;

-- =====================================================================
-- 回退方案（仅记录，本阶段不执行）：
--   BEGIN;
--   DROP INDEX IF EXISTS public.idx_gir_employee_code_pending;
--   ALTER TABLE public.grid_inspection_records DROP COLUMN IF EXISTS employee_code;
--   COMMIT;
-- 说明：employee_code 为纯新增可空列，回退不影响任何既有列 / sync_hash / 映射表。
-- =====================================================================

-- =====================================================================
-- 迁移：HSE 网格巡查身份链 · 阶段0 三列落地
-- 依据：《HSE 网格巡查身份链 · 实施前最终设计冻结报告》
--       状态 DESIGN_FROZEN_READY_FOR_IMPLEMENTATION
-- 日期：2026-09-10
-- 原则：最小改动、可验证、可回滚、零业务行为改变
-- 幂等：全部使用 IF NOT EXISTS，可重复执行
-- 范围：仅 3 个字段。不改认证/JWT/WPS/前端/历史数据。
-- =====================================================================

-- 1) public.users.employee_id
--    语义：public.users.id -> public.users.employee_id -> employee.id
--    允许 NULL；唯一性用部分唯一索引保证（NULL 可多行，非 NULL 不可重复）
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS employee_id bigint NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_users_employee_id
  ON public.users(employee_id)
  WHERE employee_id IS NOT NULL;

-- 2) public.users.must_change_password
--    DEFAULT false，保证现有 admin 等存量账号不被强制改密
--    本阶段只落字段，不实现强制改密流程
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

-- 3) grid_inspection_records.inspector_employee_id
--    语义：实际执行本次巡查的员工 employee.id（bigint 对齐 employee.id）
--    PG 专属字段：不进入 WPS FIELD_MAP / canonicalHash / sync_map
--    本阶段不回填历史数据（327/1724/12 全部保持 NULL）
ALTER TABLE public.grid_inspection_records
  ADD COLUMN IF NOT EXISTS inspector_employee_id bigint NULL;

-- =====================================================================
-- 回退方案（仅记录，勿在阶段0 执行）：
--   DROP INDEX IF EXISTS public.ux_users_employee_id;
--   ALTER TABLE public.users DROP COLUMN IF EXISTS employee_id;
--   ALTER TABLE public.users DROP COLUMN IF EXISTS must_change_password;
--   ALTER TABLE public.grid_inspection_records DROP COLUMN IF EXISTS inspector_employee_id;
-- =====================================================================

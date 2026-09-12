-- =====================================================================
-- P2-B0-CONT §四 wps_account_employee_map —— WPS 账号 ↔ employee 桥接表（空表）
-- 设计约束（来自任务 §四）：
--   1. 仅在 safety_dashboard_dev 创建（runner 硬拒生产）。
--   2. 不自动从姓名/昵称/手机号/personnel_name 建立身份映射。
--   3. 当前 WPS Creator 能力未验证 ⇒ 本阶段不插入任何「推测」映射，只建空表+索引。
--   4. employee_id 与 employee.id 实际类型一致 = bigint。
--   5. 不强行新增 FK（项目当前无类似 FK 约定，保持最小变更）。
--   6. wps_account_id 与 employee.id 必须明确区分，不得混用。
-- =====================================================================

CREATE TABLE IF NOT EXISTS wps_account_employee_map (
  id               bigserial PRIMARY KEY,
  wps_account_id   text    NOT NULL,   -- WPS 稳定账号 ID（如 Creator 系统账号标识），非 employee.id
  employee_id      bigint  NOT NULL,   -- 指向 employee.id（bigint）
  status           text    NULL,       -- pending / linked / disabled 等（本阶段不填）
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE wps_account_employee_map IS
  'WPS 账号 ↔ 员工 映射桥接表。仅存放经核验的稳定 WPS 账号 ID → employee.id，禁止姓名匹配。当前为空。';

CREATE INDEX IF NOT EXISTS idx_wps_account_employee_map_wps_account_id
  ON wps_account_employee_map (wps_account_id);

CREATE INDEX IF NOT EXISTS idx_wps_account_employee_map_employee_id
  ON wps_account_employee_map (employee_id);

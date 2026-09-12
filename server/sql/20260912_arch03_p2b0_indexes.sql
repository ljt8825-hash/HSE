-- =====================================================================
-- P2-B0-CONT §六 / §七 索引（fail-safe 字段索引）
--
-- §六 client_token：部分 UNIQUE 索引（仅对非空值唯一）。
--   - 前提：Dev 数据 client_token 非空重复数 = 0（runner 已硬校验，若有重复则 STOP）。
--   - WPS 通道保持 NULL，该索引不影响 WPS NULL 值行。
-- §七 submission_fingerprint：普通（非唯一）索引。
--   - 仅加速查询；禁止自动生成/回填/删除/覆盖。
-- 目标库：safety_dashboard_dev（runner 硬拒生产）
-- =====================================================================

-- §六 部分唯一索引：client_token 是明确的客户端提交幂等键（仅 Channel A 提供）
CREATE UNIQUE INDEX IF NOT EXISTS
  uq_grid_inspection_records_client_token_notnull
  ON grid_inspection_records (client_token)
  WHERE client_token IS NOT NULL;

-- §七 submission_fingerprint 普通索引（非唯一，允许重复候选）
CREATE INDEX IF NOT EXISTS
  idx_grid_inspection_records_submission_fingerprint
  ON grid_inspection_records (submission_fingerprint);

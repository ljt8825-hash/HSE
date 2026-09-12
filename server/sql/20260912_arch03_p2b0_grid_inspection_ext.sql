-- =====================================================================
-- ARCH-03 P2-B0：grid_inspection_records 最小基础设施扩展（仅开发/测试库）
-- ---------------------------------------------------------------------
-- 设计约束（不破坏 05-H-0 冻结）：
--   * 仅新增 5 个 nullable 文本列，全部位于 18-hash 投影（SYNC_PROJECTION_ORDER
--     前 18 列）之外；不会进入 sync_hash，不触发存量记录被误判为「已变更」。
--   * 不改 SYNC_PROJECTION / PROTECTED_COLUMNS / canonicalHash / FIELD_MAP。
--   * 不改 UNIQUE(wps_record_id,wps_file_id) / 05-H-0 冻结文档 / WPS 反向写入 no-op。
-- 幂等：ADD COLUMN IF NOT EXISTS，可重复执行。
-- 目标库：safety_dashboard_dev（隔离测试库，严禁对 safety_dashboard 生产库执行）。
-- 执行入口：server/scripts/_p2b0_migrate.cjs（默认 DRY-RUN，--apply 才真正执行）
-- =====================================================================

ALTER TABLE grid_inspection_records ADD COLUMN IF NOT EXISTS source_channel text;
ALTER TABLE grid_inspection_records ADD COLUMN IF NOT EXISTS client_token text;
ALTER TABLE grid_inspection_records ADD COLUMN IF NOT EXISTS submission_fingerprint text;
ALTER TABLE grid_inspection_records ADD COLUMN IF NOT EXISTS attribution_status text;
ALTER TABLE grid_inspection_records ADD COLUMN IF NOT EXISTS attachment_resolution_status text;

COMMENT ON COLUMN grid_inspection_records.source_channel
  IS '来源通道：mobile_h5 / wps_form / unknown（未验证能力 fail-safe 默认 unknown）';
COMMENT ON COLUMN grid_inspection_records.client_token
  IS '客户端提交幂等令牌（Channel A 强幂等键；WPS 通道不填，留 NULL）';
COMMENT ON COLUMN grid_inspection_records.submission_fingerprint
  IS '业务指纹（跨通道去重键；未验证能力 fail-safe 为 NULL）';
COMMENT ON COLUMN grid_inspection_records.attribution_status
  IS '身份归属状态：pending / attributed / failed（WPS 无 creator 时 fail-safe 为 pending）';
COMMENT ON COLUMN grid_inspection_records.attachment_resolution_status
  IS '附件解析状态：pending / resolved / failed（WPS Attachment≠URL 镜像时 fail-safe 为 pending）';

-- =============================================================
-- AI-11：ai_generation_reviews 人工审核记录表（开发库 safety_dashboard）
-- 2026-09-15
--
-- 设计依据（AI-11 任务书 §四/§八）：
--  - 追加式审核历史：每次人工审核一条新记录，previous_status 记录审核前状态；
--  - action 固定 APPROVE / REJECT / MODIFY；review_status 固定 PENDING_REVIEW / APPROVED / REJECTED / MODIFIED；
--  - generation_record_id → ai_generation_records.id（ON DELETE CASCADE）
--    task_id → ai_analysis_tasks.id（ON DELETE CASCADE）
--  - 并发一致性由服务层事务 + 任务行 FOR UPDATE 串行化保证（本表不加唯一约束，
--    避免限制未来合法的重复状态流程设计，见任务书 §十一）；
--  - 不修改 ai_generation_records.result / evidence / prompt_key / prompt_version（AI 原始结果不可覆盖）。
-- =============================================================

CREATE TABLE IF NOT EXISTS ai_generation_reviews (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  generation_record_id BIGINT NOT NULL REFERENCES ai_generation_records(id) ON DELETE CASCADE,
  task_id              BIGINT NOT NULL REFERENCES ai_analysis_tasks(id) ON DELETE CASCADE,
  review_status        VARCHAR(32) NOT NULL,
  previous_status      VARCHAR(32),
  action               VARCHAR(32),
  reviewed_by          BIGINT,
  reviewed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  human_remark         TEXT,
  human_modified       JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_generation_reviews_generation_record
  ON ai_generation_reviews(generation_record_id, id);

CREATE INDEX IF NOT EXISTS idx_ai_generation_reviews_task
  ON ai_generation_reviews(task_id, id);

CREATE INDEX IF NOT EXISTS idx_ai_generation_reviews_reviewed_by
  ON ai_generation_reviews(reviewed_by);

CREATE INDEX IF NOT EXISTS idx_ai_generation_reviews_status
  ON ai_generation_reviews(review_status);

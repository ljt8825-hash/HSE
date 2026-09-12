-- ============================================================
-- AI 生成记录表
-- 用于记录 AI 智能报告、根因分析等生成历史
-- 创建时间: 2026-07-10
-- ============================================================

-- AI 生成记录主表
CREATE TABLE IF NOT EXISTS ai_generation_records (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type VARCHAR(50) NOT NULL,           -- 'report' | 'rca' | 'classify' | 'predict'
  sub_type VARCHAR(50),                 -- 'hazard' | 'accident' | 'training' | 'patrol'
  title VARCHAR(200),                   -- 报告标题
  prompt TEXT NOT NULL,                -- 发送的 prompt
  result TEXT,                          -- 生成结果
  provider VARCHAR(20) NOT NULL,        -- 'grok' | 'ollama'
  model VARCHAR(100),                   -- 使用的模型
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  duration_ms INTEGER,                  -- 生成耗时
  status VARCHAR(20) DEFAULT 'pending', -- 'pending' | 'success' | 'error'
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 索引：按用户查询
CREATE INDEX IF NOT EXISTS idx_ai_records_user ON ai_generation_records(user_id);

-- 索引：按类型查询
CREATE INDEX IF NOT EXISTS idx_ai_records_type ON ai_generation_records(type);

-- 索引：按创建时间查询（排序）
CREATE INDEX IF NOT EXISTS idx_ai_records_created ON ai_generation_records(created_at);

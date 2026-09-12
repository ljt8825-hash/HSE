-- =============================================================
-- 培训记录按培训人员月度汇总 —— 未培训登记表
-- 用途：存储由「培训签到表」导入时判定出的未培训人员（供汇总弹窗与导出）。
--  - 在岗未培训(inpost)  = 花名册在职 且 本月无该培训人员培训记录
--  - 已离职未培训(departed) = 签到表里出现、但花名册查无此人
-- 在岗未培训也可由「花名册 − 当月已训名单」实时算出；本表主要用于
-- 保存导入期判定的已离职名单与导入来源，避免手写 OCR 重复解析。
-- 唯一键：(trainer_id, month, name, status)
-- =============================================================

CREATE TABLE IF NOT EXISTS hse_untrained_log (
  id           SERIAL PRIMARY KEY,
  trainer_id   INT  NOT NULL,               -- 培训人员（上级/班组负责人）员工 ID
  trainer_name TEXT,
  month        CHAR(7) NOT NULL,            -- 统计月份 YYYY-MM
  employee_id  INT,                         -- 在岗者员工 ID；已离职可为空
  name         TEXT NOT NULL,               -- 未培训人员姓名
  dept_name    TEXT,                        -- 该人员部门（班组/作业中心）
  status       TEXT NOT NULL CHECK (status IN ('inpost', 'departed')),  -- 在岗未培训/已离职未培训
  record_type  TEXT DEFAULT 'signin-import',
  session_ref  TEXT,                        -- 导入来源（如文件名）
  created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (trainer_id, month, name, status)
);

CREATE INDEX IF NOT EXISTS idx_untrained_trainer_month
  ON hse_untrained_log (trainer_id, month);
CREATE INDEX IF NOT EXISTS idx_untrained_month
  ON hse_untrained_log (month);
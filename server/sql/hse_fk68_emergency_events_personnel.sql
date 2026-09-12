-- 提示词-68 任务 D：emergency_events 补充 personnel_id 列 + FK
-- 前置实勘（psql information_schema）：emergency_events 当前 17 列，无 personnel_id；
--       emergency_events 0 行，加列/加 FK 无数据风险。
-- FK 与 提示词-66 的 hse_events.personnel_id 保持一致：引用 employee(id) ON DELETE SET NULL。

-- 1) 加列
ALTER TABLE emergency_events ADD COLUMN personnel_id BIGINT;

-- 2) 加外键约束（可空，引用 employee 主键；删除员工时置 NULL）
ALTER TABLE emergency_events
  ADD CONSTRAINT fk_emergency_events_personnel
  FOREIGN KEY (personnel_id) REFERENCES employee(id) ON DELETE SET NULL;
